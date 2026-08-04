// @ts-nocheck
import React, { useState, useMemo, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Truck, ClipboardCheck, FileText, Gauge, ChevronRight, ChevronLeft,
  Check, AlertTriangle, Plus, Users, ShieldCheck, Fuel, Wrench, Droplet, Download, Trash2, Pencil,
  QrCode, MapPin, Camera, ScanLine,
} from "lucide-react";
import { supabase } from "../supabaseClient";

/* ---------------------------------------------------------------
   TOKENS visuales (paleta propia de este módulo, distinta del resto
   de SMART-TRACK a propósito: aquí se busca leer como un tablero de
   inspección/flotilla, no como el dashboard de ventas).
------------------------------------------------------------------ */
const T = {
  bg: "#F3F6F4",
  surface: "#FFFFFF",
  ink: "#16262A",
  muted: "#5B6B6E",
  border: "#DCE3E1",
  borderStrong: "#C3CFCC",
  primary: "#0F6E56",
  primarySoft: "#E1F0EA",
  steel: "#2B4C6F",
  steelSoft: "#E6ECF3",
  ok: "#3B7D3E",
  okSoft: "#E7F2E3",
  warn: "#B8842B",
  warnSoft: "#FBF0DD",
  late: "#B23A3A",
  lateSoft: "#FBE6E6",
};

const FONTS_LINK = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap";
const TESSERACT_LINK = "https://unpkg.com/tesseract.js@5/dist/tesseract.min.js";

// Catálogo fijo de rutas/identidades que participan en Revisión de Unidades.
// "grupo" usa los mismos valores de "puesto" que ya existen en el resto de
// la app (supervisor = Supervisor-1, supervisor2 = Supervisor-2, gerente).
export const RUTAS_UNIDADES = [
  { id: "J201", grupo: "supervisor" }, { id: "J202", grupo: "supervisor" }, { id: "J203", grupo: "supervisor" },
  { id: "J204", grupo: "supervisor" }, { id: "J205", grupo: "supervisor" }, { id: "J206", grupo: "supervisor" },
  { id: "J207", grupo: "supervisor" },
  { id: "MERCH27", grupo: "supervisor2" }, { id: "MERCH28", grupo: "supervisor2" },
  { id: "MERCH29", grupo: "supervisor2" }, { id: "MERCH30", grupo: "supervisor2" },
  { id: "SUPERVISOR-1", grupo: "supervisor" },
  { id: "SUPERVISOR-2", grupo: "supervisor2" },
  { id: "GERENTE", grupo: "gerente" },
];

export const SEGURIDAD_UNIDADES_DEFAULT = { qr: true, gps: true, kmCamara: true, auditoria: true, probabilidadAuditoria: 20 };

const CHECKS_FISICO = [
  { id: "carroceria", label: "Carrocería y pintura" },
  { id: "llantas", label: "Llantas y presión" },
  { id: "luces", label: "Luces y direccionales" },
  { id: "limpieza", label: "Limpieza interior y exterior" },
];
const CHECKS_NIVELES = [
  { id: "agua", label: "Agua / refrigerante" },
  { id: "aceite", label: "Aceite de motor" },
  { id: "frenos", label: "Líquido de frenos" },
  { id: "limpiaparabrisas", label: "Líquido limpiaparabrisas" },
];
const CHECKS_DOC = [
  { id: "licencia", label: "Licencia del conductor" },
  { id: "tarjeta", label: "Tarjeta de circulación" },
  { id: "seguro", label: "Póliza de seguro" },
  { id: "verificacion", label: "Verificación vehicular" },
];

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function diasDesde(fechaISO) {
  const f = new Date(fechaISO);
  const hoy = new Date();
  return Math.floor((hoy - f) / (1000 * 60 * 60 * 24));
}

function estadoPorDias(dias) {
  if (dias === null || dias === undefined) return "atrasada";
  if (dias <= 0) return "ok";
  if (dias <= 2) return "pendiente";
  return "atrasada";
}

const ESTADO_UI = {
  ok: { label: "Al día", color: T.ok, soft: T.okSoft },
  pendiente: { label: "Pendiente", color: T.warn, soft: T.warnSoft },
  atrasada: { label: "Atrasada", color: T.late, soft: T.lateSoft },
};

// true si "rutaId" (código de ruta o usuario merch) ya registró su revisión
// del día de hoy. Se usa desde App.tsx para hacer parpadear la pestaña.
export function unidadYaRegistradaHoy(data, rutaId) {
  if (!rutaId) return true; // nada que exigir si no aplica (ej. staff/gerente)
  const hoy = todayISO();
  return (data.revisionesUnidades || []).some((r) => r.ruta === rutaId && String(r.fecha || "").slice(0, 10) === hoy);
}

function codigoQR(unidad) {
  return unidad ? `QR-${unidad.placas}` : "";
}

function capturarUbicacion() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5), precision: Math.round(pos.coords.accuracy) }),
      () => resolve(null),
      { timeout: 6000, maximumAge: 60000 }
    );
  });
}

// Compone la foto del odómetro con una franja de datos (unidad/ruta/fecha/GPS)
// quemada en la imagen, y la sube al bucket "promociones" de Storage (el
// mismo que ya usan Cuponera/Avisos/Rally) — así solo se guarda una URL corta
// en el JSON de datos, no una imagen base64 completa por cada revisión.
function procesarYSubirFotoOdometro(file, meta) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer la imagen"));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo procesar la imagen"));
      img.onload = async () => {
        try {
          const maxAncho = 480;
          const escala = Math.min(1, maxAncho / img.width);
          const w = Math.round(img.width * escala);
          const h = Math.round(img.height * escala);
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          const franja = 34;
          ctx.fillStyle = "rgba(22,38,42,0.72)";
          ctx.fillRect(0, h - franja, w, franja);
          ctx.fillStyle = "#FFFFFF";
          ctx.font = "11px monospace";
          ctx.fillText(meta.linea1, 8, h - 20);
          ctx.fillText(meta.linea2, 8, h - 7);

          canvas.toBlob(async (blob) => {
            if (!blob) { resolve(null); return; }
            try {
              const nombreArchivo = `unidad_odometro_${Date.now()}.jpg`;
              const { error } = await supabase.storage.from("promociones").upload(nombreArchivo, blob, { cacheControl: "3600", upsert: false, contentType: "image/jpeg" });
              if (error) { console.error("No se pudo subir la foto del odómetro:", error); resolve(null); return; }
              const { data: urlData } = supabase.storage.from("promociones").getPublicUrl(nombreArchivo);
              resolve(urlData.publicUrl);
            } catch (err) {
              console.error(err);
              resolve(null);
            }
          }, "image/jpeg", 0.7);
        } catch (err) {
          reject(err);
        }
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(file);
  });
}

function fotoADataUrl(file) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer la imagen"));
    lector.onload = () => resolve(lector.result);
    lector.readAsDataURL(file);
  });
}

async function leerOdometro(dataUrl) {
  if (!window.Tesseract) return null;
  try {
    const resultado = await window.Tesseract.recognize(dataUrl, "eng", {
      tessedit_char_whitelist: "0123456789",
    });
    const soloDigitos = (resultado?.data?.text || "").replace(/[^0-9]/g, "");
    return soloDigitos.length >= 3 ? soloDigitos : null;
  } catch (e) {
    return null;
  }
}

function exportarBitacoraExcel(revisiones, unidades, unidadesVisibles, etiquetaRol) {
  const filas = revisiones
    .filter((r) => unidadesVisibles.some((u) => u.id === r.unidadId))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .map((r) => {
      const u = unidades.find((x) => x.id === r.unidadId);
      return {
        Fecha: new Date(r.fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" }),
        Placas: u?.placas || "",
        Ruta: u?.ruta || r.ruta || "",
        Conductor: u?.conductor || "",
        "Capturó": r.capturadoPor || "",
        "QR verificado": r.qrVerificado ? "Sí" : "No",
        "Ubicación": r.ubicacion ? `${r.ubicacion.lat}, ${r.ubicacion.lng}` : "No disponible",
        "Auditoría aleatoria": r.auditoriaAleatoria ? "Sí" : "No",
        "Foto adjunta": r.foto ? "Sí" : "No",
        "Estado físico": Object.values(r.fisico || {}).includes("atencion") ? "Atención" : "Bien",
        "Niveles de líquidos": Object.values(r.niveles || {}).includes("atencion") ? "Atención" : "Bien",
        "Documentación": Object.values(r.documentacion || {}).includes("atencion") ? "Atención" : "Bien",
        "Kilometraje": r.operativo?.kilometraje || "",
        "Combustible": r.operativo?.combustible || "",
        "Requiere atención": r.requiereAtencion ? "Sí" : "No",
        "Observaciones": r.observaciones || "",
      };
    });
  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja["!cols"] = [
    { wch: 11 }, { wch: 10 }, { wch: 12 }, { wch: 9 }, { wch: 18 },
    { wch: 13 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
    { wch: 13 }, { wch: 16 }, { wch: 14 }, { wch: 11 }, { wch: 12 }, { wch: 15 }, { wch: 30 },
  ];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Bitácora");
  const fechaArchivo = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `bitacora_revision_unidades_${etiquetaRol}_${fechaArchivo}.xlsx`);
}

/* ---------------------------------------------------------------
   PIEZA: dial circular de días desde la última revisión
------------------------------------------------------------------ */
function DialDias({ dias }) {
  const estado = estadoPorDias(dias);
  const ui = ESTADO_UI[estado];
  const max = 6;
  const pct = Math.min(1, (dias ?? max) / max);
  const angle = -90 + pct * 180;
  const r = 34;
  const cx = 40, cy = 40;
  const arcPoints = (a0, a1) => {
    const p0 = [cx + r * Math.cos((Math.PI * a0) / 180), cy + r * Math.sin((Math.PI * a0) / 180)];
    const p1 = [cx + r * Math.cos((Math.PI * a1) / 180), cy + r * Math.sin((Math.PI * a1) / 180)];
    return `M ${p0[0]} ${p0[1]} A ${r} ${r} 0 0 1 ${p1[0]} ${p1[1]}`;
  };
  const needleX = cx + (r - 6) * Math.cos((Math.PI * angle) / 180);
  const needleY = cy + (r - 6) * Math.sin((Math.PI * angle) / 180);

  return (
    <svg width="80" height="52" viewBox="0 0 80 52">
      <path d={arcPoints(180, 270)} stroke={T.ok} strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d={arcPoints(270, 300)} stroke={T.warn} strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d={arcPoints(300, 360)} stroke={T.late} strokeWidth="6" fill="none" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={T.ink} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="3" fill={T.ink} />
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize="10" fontFamily="'IBM Plex Mono', monospace" fill={ui.color} fontWeight="600">
        {dias === null || dias === undefined ? "—" : `${dias}d`}
      </text>
    </svg>
  );
}

/**
 * Componente raíz de la pestaña UNIDADES.
 *
 * Props:
 * - data, persistRevisionUnidad, persistConfigUnidades: vienen de App.tsx.
 * - rol: "vendedor" | "merch" | "staff" | "liquidacion"
 * - puesto: null | "supervisor" | "supervisor2" | "gerente" (solo si rol === "staff")
 * - identidad: nombre a mostrar como "capturado por"
 * - rutaPropia: código de ruta del conductor (ej. "J201" o "MERCH27"); solo
 *   aplica para rol "vendedor" o "merch".
 */
export default function UnidadesView({ data, persistRevisionUnidad, persistConfigUnidades, rol, puesto, identidad, rutaPropia }) {
  useEffect(() => {
    if (!document.getElementById("ru-fonts")) {
      const link = document.createElement("link");
      link.id = "ru-fonts";
      link.rel = "stylesheet";
      link.href = FONTS_LINK;
      document.head.appendChild(link);
    }
    if (!document.getElementById("ru-tesseract")) {
      const script = document.createElement("script");
      script.id = "ru-tesseract";
      script.async = true;
      script.src = TESSERACT_LINK;
      document.body.appendChild(script);
    }
  }, []);

  const unidades = data.unidadesFlota || [];
  const asignaciones = data.asignacionesUnidades || {};
  const revisiones = data.revisionesUnidades || [];
  const seguridad = data.seguridadUnidades || SEGURIDAD_UNIDADES_DEFAULT;
  const [errorGuardado, setErrorGuardado] = useState(null);

  // Wrappers "tipo setState" (aceptan valor o función actualizadora) que en
  // realidad parten siempre del dato más reciente de Supabase antes de
  // guardar — igual que ya se hace con "cargas", para que dos personas
  // editando la flotilla casi al mismo tiempo no se pisen entre sí.
  // Si el guardado falla (por ejemplo, sin conexión), se muestra el error en
  // vez de fallar en silencio dejando la pantalla como si sí se hubiera guardado.
  async function ejecutarPersistConfig(calcularCambios) {
    try {
      setErrorGuardado(null);
      await persistConfigUnidades(calcularCambios);
    } catch (err) {
      console.error("Error guardando cambios de Unidades:", err);
      setErrorGuardado(err?.message || "No se pudo guardar el cambio. Revisa tu conexión e intenta de nuevo.");
    }
  }

  function setUnidades(actualizador) {
    return ejecutarPersistConfig((fresca) => {
      const actuales = fresca.unidadesFlota || [];
      const nuevas = typeof actualizador === "function" ? actualizador(actuales) : actualizador;
      return { unidadesFlota: nuevas };
    });
  }
  function setAsignaciones(actualizador) {
    return ejecutarPersistConfig((fresca) => {
      const actuales = fresca.asignacionesUnidades || {};
      const nuevas = typeof actualizador === "function" ? actualizador(actuales) : actualizador;
      return { asignacionesUnidades: nuevas };
    });
  }
  function setSeguridad(actualizador) {
    return ejecutarPersistConfig((fresca) => {
      const actuales = fresca.seguridadUnidades || SEGURIDAD_UNIDADES_DEFAULT;
      const nuevas = typeof actualizador === "function" ? actualizador(actuales) : actualizador;
      return { seguridadUnidades: nuevas };
    });
  }

  const lastByUnidad = useMemo(() => {
    const map = {};
    for (const r of revisiones) {
      if (!map[r.unidadId] || new Date(r.fecha) > new Date(map[r.unidadId].fecha)) {
        map[r.unidadId] = r;
      }
    }
    return map;
  }, [revisiones]);

  const esConductor = rol === "vendedor" || rol === "merch";
  const esGerente = rol === "staff" && puesto === "gerente";
  const esLiquidacion = rol === "liquidacion";

  // Alcance de rutas visibles en el panel: supervisor/supervisor2 ven solo
  // su grupo; gerente y liquidación ven todo (liquidación solo lectura).
  const [scopeGerente, setScopeGerente] = useState("todos"); // "todos" | "supervisor" | "supervisor2"
  const grupoFijo = rol === "staff" ? puesto : null;
  const rutasVisibles = useMemo(() => {
    if (esLiquidacion) return RUTAS_UNIDADES;
    if (grupoFijo === "supervisor" || grupoFijo === "supervisor2") return RUTAS_UNIDADES.filter((r) => r.grupo === grupoFijo);
    if (esGerente && scopeGerente !== "todos") return RUTAS_UNIDADES.filter((r) => r.grupo === scopeGerente);
    return RUTAS_UNIDADES;
  }, [grupoFijo, esGerente, scopeGerente, esLiquidacion]);

  const unidadesVisibles = useMemo(
    () => unidades.filter((u) => rutasVisibles.some((r) => r.id === u.ruta)),
    [unidades, rutasVisibles]
  );

  const resumen = useMemo(() => {
    const out = { ok: 0, pendiente: 0, atrasada: 0 };
    unidadesVisibles.forEach((u) => {
      const last = lastByUnidad[u.id];
      const dias = last ? diasDesde(last.fecha) : null;
      out[estadoPorDias(dias)]++;
    });
    return out;
  }, [unidadesVisibles, lastByUnidad]);

  function registrarRevision(nueva) {
    persistRevisionUnidad(nueva);
  }

  if (esConductor) {
    return (
      <div style={{ fontFamily: "'Inter', sans-serif", color: T.ink }}>
        <EstilosUnidades />
        <VistaConductor
          unidades={unidades} onRegistrar={registrarRevision} lastByUnidad={lastByUnidad}
          usuarioSesion={identidad} usuarioRuta={rutaPropia} asignaciones={asignaciones}
          seguridad={seguridad}
        />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: T.ink }}>
      <EstilosUnidades />
      {errorGuardado && (
        <div className="ru-card" style={{ padding: "12px 14px", marginBottom: 16, background: T.lateSoft, borderColor: T.late, color: T.late, fontSize: 12.5, fontWeight: 500 }}>
          No se pudo guardar el último cambio: {errorGuardado}
        </div>
      )}
      <VistaPanel
        esGerente={esGerente}
        esLiquidacion={esLiquidacion}
        scopeGerente={scopeGerente}
        setScopeGerente={setScopeGerente}
        rutasVisibles={rutasVisibles}
        unidadesVisibles={unidadesVisibles}
        lastByUnidad={lastByUnidad}
        resumen={resumen}
        unidades={unidades}
        setUnidades={setUnidades}
        asignaciones={asignaciones}
        setAsignaciones={setAsignaciones}
        seguridad={seguridad}
        setSeguridad={setSeguridad}
        revisiones={revisiones}
      />
    </div>
  );
}

function EstilosUnidades() {
  return (
    <style>{`
      .ru-h { font-family: 'Space Grotesk', sans-serif; }
      .ru-mono { font-family: 'IBM Plex Mono', monospace; }
      .ru-btn { border: 1px solid ${T.border}; background: ${T.surface}; border-radius: 10px; padding: 8px 14px; font-family: 'Inter'; font-size: 13.5px; font-weight: 500; cursor: pointer; color: ${T.ink}; display: inline-flex; align-items: center; gap: 6px; transition: all .15s; }
      .ru-btn:hover { border-color: ${T.borderStrong}; background: #FAFBFA; }
      .ru-btn.active { background: ${T.ink}; color: white; border-color: ${T.ink}; }
      .ru-input { border: 1px solid ${T.border}; border-radius: 8px; padding: 8px 10px; font-family: 'Inter'; font-size: 13.5px; width: 100%; box-sizing: border-box; }
      .ru-input:focus { outline: none; border-color: ${T.primary}; }
      .ru-card { background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 14px; }
    `}</style>
  );
}

/* ---------------------------------------------------------------
   VISTA CONDUCTOR — captura diaria
------------------------------------------------------------------ */
const ETIQUETAS_PASO = {
  confirmar: "Confirmar unidad",
  qr: "Verificar QR",
  fisico: "Estado físico",
  niveles: "Niveles",
  documentacion: "Documentación",
  operativo: "Operativo",
};

function VistaConductor({ unidades, onRegistrar, lastByUnidad, usuarioSesion, usuarioRuta, asignaciones, seguridad }) {
  const unidadDefault = asignaciones[usuarioRuta];
  const [ruta, setRuta] = useState(usuarioRuta);
  const [unidadId, setUnidadId] = useState(unidadDefault || "");
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [qrVerificado, setQrVerificado] = useState(false);
  const [esAuditoria, setEsAuditoria] = useState(false);
  const [ubicacion, setUbicacion] = useState(null);
  const [ubicacionEstado, setUbicacionEstado] = useState(seguridad.gps ? "pendiente" : "desactivado");
  const [foto, setFoto] = useState(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [paso, setPaso] = useState(0);
  const [fisico, setFisico] = useState({});
  const [niveles, setNiveles] = useState({});
  const [doc, setDoc] = useState({});
  const [kilometraje, setKilometraje] = useState("");
  const [kmEstado, setKmEstado] = useState("idle");
  const [kmDetectado, setKmDetectado] = useState("");
  const [kmError, setKmError] = useState("");
  const [combustible, setCombustible] = useState("3/4");
  const [obs, setObs] = useState("");
  const [enviado, setEnviado] = useState(false);

  const unidadesRuta = unidades.filter((u) => u.ruta === ruta);
  const unidadActual = unidades.find((u) => u.id === unidadId);

  const stepKeys = useMemo(() => {
    const keys = ["confirmar"];
    if (seguridad.qr) keys.push("qr");
    keys.push("fisico", "niveles", "documentacion", "operativo");
    return keys;
  }, [seguridad.qr]);
  const pasoActual = stepKeys[paso];
  const ultimoPaso = stepKeys.length - 1;

  useEffect(() => {
    if (seguridad.gps && pasoActual === "operativo" && ubicacionEstado === "pendiente") {
      capturarUbicacion().then((u) => {
        setUbicacion(u);
        setUbicacionEstado(u ? "ok" : "no_disponible");
      });
    }
  }, [pasoActual, ubicacionEstado, seguridad.gps]);

  function reiniciar() {
    setRuta(usuarioRuta); setUnidadId(unidadDefault || ""); setCorrigiendo(false);
    setQrVerificado(false); setEsAuditoria(false); setUbicacion(null);
    setUbicacionEstado(seguridad.gps ? "pendiente" : "desactivado");
    setFoto(null); setPaso(0);
    setFisico({}); setNiveles({}); setDoc({});
    setKilometraje(""); setKmEstado("idle"); setKmDetectado(""); setKmError("");
    setCombustible("3/4"); setObs(""); setEnviado(false);
  }

  function avanzarDesdeConfirmacion() {
    const auditoria = seguridad.auditoria ? Math.random() * 100 < seguridad.probabilidadAuditoria : false;
    setEsAuditoria(auditoria);
    setPaso((p) => p + 1);
  }

  async function manejarFotoOdometro(file) {
    if (!file) return;
    setKmEstado("procesando"); setKmError("");
    try {
      const dataUrl = await fotoADataUrl(file);
      const digitos = await leerOdometro(dataUrl);
      if (!digitos) {
        setKmEstado("error");
        setKmError("No se pudo leer el odómetro. Vuelve a tomar la foto de frente y con buena luz.");
        return;
      }
      setKmDetectado(digitos);
      setKmEstado("listo");
      if (esAuditoria) {
        setSubiendoFoto(true);
        const ahora = new Date();
        try {
          const url = await procesarYSubirFotoOdometro(file, {
            linea1: `${unidadActual?.placas} · ${ruta} · ${ahora.toLocaleString("es-MX")}`,
            linea2: ubicacion ? `GPS ${ubicacion.lat}, ${ubicacion.lng}` : "GPS no disponible",
          });
          setFoto(url);
        } finally {
          setSubiendoFoto(false);
        }
      }
    } catch (err) {
      setKmEstado("error");
      setKmError("No se pudo procesar la foto, intenta de nuevo.");
    }
  }

  function reintentarLecturaKm() {
    setKmEstado("idle"); setKmDetectado(""); setKmError(""); setFoto(null); setKilometraje("");
  }

  function enviar() {
    const requiereAtencion = Object.values(fisico).includes("atencion") || Object.values(niveles).includes("atencion") || Object.values(doc).includes("atencion");
    onRegistrar({
      id: `R-${Date.now()}`,
      unidadId,
      ruta,
      fecha: new Date().toISOString(),
      capturadoPor: usuarioSesion,
      requiereAtencion,
      qrVerificado: seguridad.qr ? qrVerificado : null,
      auditoriaAleatoria: esAuditoria,
      ubicacion,
      foto,
      fisico, niveles, documentacion: doc,
      operativo: { kilometraje, combustible },
      observaciones: obs,
    });
    setEnviado(true);
  }

  const puedeEnviar = (!esAuditoria || !!foto) && !!kilometraje && !subiendoFoto;

  if (enviado) {
    const unidad = unidades.find((u) => u.id === unidadId);
    return (
      <div className="ru-card" style={{ maxWidth: 480, margin: "40px auto", padding: 32, textAlign: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: T.okSoft, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <Check size={26} color={T.ok} />
        </div>
        <div className="ru-h" style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Revisión registrada</div>
        <div style={{ fontSize: 13.5, color: T.muted, marginBottom: 20 }}>
          Unidad {unidad?.placas} · ruta {unidad?.ruta} · {new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
        </div>
        <button className="ru-btn active" style={{ margin: "0 auto" }} onClick={reiniciar}>Registrar otra unidad</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {stepKeys.map((k, i) => (
          <div key={k} style={{ flex: 1 }}>
            <div style={{ height: 4, borderRadius: 4, background: i <= paso ? T.primary : T.border, marginBottom: 6 }} />
            <div style={{ fontSize: 10.5, color: i === paso ? T.primary : T.muted, fontWeight: i === paso ? 600 : 400 }}>{ETIQUETAS_PASO[k]}</div>
          </div>
        ))}
      </div>

      {esAuditoria && paso > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.warnSoft, color: T.warn, borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 12, fontWeight: 500 }}>
          <AlertTriangle size={14} /> Esta revisión fue seleccionada para auditoría aleatoria: se pedirá foto del odómetro.
        </div>
      )}

      <div className="ru-card" style={{ padding: 24 }}>
        {pasoActual === "confirmar" && !corrigiendo && (
          <div>
            <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 14 }}>
              Iniciaste sesión con la ruta <strong style={{ color: T.ink }}>{usuarioRuta}</strong>. Confirma que esta es tu unidad de hoy.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: T.primarySoft, borderRadius: 10, marginBottom: 16 }}>
              <Truck size={22} color={T.primary} />
              <div>
                <div className="ru-h" style={{ fontWeight: 600, fontSize: 15 }}>{unidadActual?.placas || "Sin unidad asignada"}</div>
                <div className="ru-mono" style={{ fontSize: 12, color: T.muted }}>{unidadActual?.conductor ? `${unidadActual.conductor} · ` : ""}Ruta {ruta}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="ru-btn active" onClick={avanzarDesdeConfirmacion} disabled={!unidadActual}>
                <Check size={15} /> Confirmar y continuar
              </button>
              <button className="ru-btn" onClick={() => setCorrigiendo(true)}>Hubo un cambio, corregir</button>
            </div>
          </div>
        )}

        {pasoActual === "confirmar" && corrigiendo && (
          <div>
            <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 14 }}>
              Ajusta la ruta y/o unidad con la que trabajarás hoy.
            </div>
            <Campo label="Ruta">
              <select className="ru-input" value={ruta} onChange={(e) => { setRuta(e.target.value); setUnidadId(""); }}>
                {RUTAS_UNIDADES.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}
              </select>
            </Campo>
            <Campo label="Unidad">
              <select className="ru-input" value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
                <option value="">Selecciona la unidad</option>
                {unidadesRuta.map((u) => {
                  const last = lastByUnidad[u.id];
                  const dias = last ? diasDesde(last.fecha) : null;
                  return <option key={u.id} value={u.id}>{u.placas}{u.conductor ? ` · ${u.conductor}` : ""} {dias !== null ? `· última revisión hace ${dias}d` : "· sin revisión previa"}</option>;
                })}
              </select>
            </Campo>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="ru-btn active" onClick={() => { setCorrigiendo(false); avanzarDesdeConfirmacion(); }} disabled={!unidadId}>
                Guardar y continuar
              </button>
              <button className="ru-btn" onClick={() => { setCorrigiendo(false); setRuta(usuarioRuta); setUnidadId(unidadDefault || ""); }}>Cancelar</button>
            </div>
          </div>
        )}

        {pasoActual === "qr" && !qrVerificado && (
          <VerificarQR unidadActual={unidadActual} onExito={() => { setQrVerificado(true); setPaso((p) => p + 1); }} />
        )}

        {pasoActual === "qr" && qrVerificado && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <ShieldCheck size={28} color={T.ok} style={{ marginBottom: 8 }} />
            <div className="ru-h" style={{ fontWeight: 600, fontSize: 15 }}>Unidad verificada</div>
            <div style={{ fontSize: 12.5, color: T.muted }}>Código {codigoQR(unidadActual)} confirmado.</div>
          </div>
        )}

        {pasoActual === "fisico" && (
          <Checklist icon={<Truck size={16} />} titulo="Estado físico del vehículo" items={CHECKS_FISICO} valores={fisico} setValores={setFisico} />
        )}

        {pasoActual === "niveles" && (
          <Checklist icon={<Droplet size={16} />} titulo="Niveles de líquidos" items={CHECKS_NIVELES} valores={niveles} setValores={setNiveles} />
        )}

        {pasoActual === "documentacion" && (
          <Checklist icon={<FileText size={16} />} titulo="Documentación" items={CHECKS_DOC} valores={doc} setValores={setDoc} />
        )}

        {pasoActual === "operativo" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Wrench size={16} color={T.primary} />
              <span className="ru-h" style={{ fontWeight: 600, fontSize: 15 }}>Operativo</span>
            </div>

            <Campo label="Kilometraje actual">
              {!seguridad.kmCamara ? (
                <input className="ru-input ru-mono" type="number" placeholder="Ej. 42150" value={kilometraje} onChange={(e) => setKilometraje(e.target.value)} />
              ) : kilometraje ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="ru-mono" style={{ fontSize: 15, fontWeight: 600 }}>{kilometraje} km</span>
                  <span style={{ color: T.ok, display: "flex", alignItems: "center", gap: 3, fontSize: 12 }}><Check size={13} /> confirmado por cámara</span>
                  <button className="ru-btn" style={{ marginLeft: "auto" }} onClick={reintentarLecturaKm}>Cambiar</button>
                </div>
              ) : kmEstado === "listo" ? (
                <div>
                  <div style={{ fontSize: 13.5, marginBottom: 8 }}>Lectura detectada: <strong className="ru-mono">{kmDetectado} km</strong></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="ru-btn active" onClick={() => setKilometraje(kmDetectado)}>Confirmar</button>
                    <button className="ru-btn" onClick={reintentarLecturaKm}>Tomar otra foto</button>
                  </div>
                </div>
              ) : (
                <div>
                  <CapturaCamaraOdometro onCapturar={manejarFotoOdometro} procesando={kmEstado === "procesando"} />
                  {kmError && (
                    <div style={{ fontSize: 12, color: T.late, marginTop: 6 }}>
                      {kmError} <button className="ru-btn" style={{ marginLeft: 6 }} onClick={reintentarLecturaKm}>Reintentar</button>
                    </div>
                  )}
                </div>
              )}
            </Campo>

            <Campo label="Nivel de combustible">
              <select className="ru-input" value={combustible} onChange={(e) => setCombustible(e.target.value)}>
                {["Lleno", "3/4", "1/2", "1/4", "Reserva"].map((v) => <option key={v}>{v}</option>)}
              </select>
            </Campo>
            <Campo label="Observaciones generales">
              <textarea className="ru-input" rows={3} placeholder="Opcional" value={obs} onChange={(e) => setObs(e.target.value)} />
            </Campo>

            {seguridad.gps && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted, marginBottom: esAuditoria ? 14 : 0 }}>
                <MapPin size={13} />
                {ubicacionEstado === "pendiente" && "Registrando ubicación…"}
                {ubicacionEstado === "ok" && `Ubicación registrada (±${ubicacion.precision} m)`}
                {ubicacionEstado === "no_disponible" && "Ubicación no disponible en este dispositivo"}
              </div>
            )}

            {esAuditoria && (
              <div style={{ fontSize: 12, color: T.muted }}>
                {subiendoFoto ? "Subiendo foto de evidencia…" : foto ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Check size={13} color={T.ok} /> Foto de evidencia guardada junto con la lectura del odómetro.
                  </div>
                ) : (
                  "La foto de evidencia se genera automáticamente al escanear el odómetro."
                )}
              </div>
            )}
          </div>
        )}

        {paso > 0 && !(pasoActual === "qr" && !qrVerificado) && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            <button className="ru-btn" onClick={() => setPaso((p) => Math.max(0, p - 1))}>
              <ChevronLeft size={15} /> Atrás
            </button>
            {paso < ultimoPaso ? (
              <button className="ru-btn active" onClick={() => setPaso((p) => p + 1)}>
                Siguiente <ChevronRight size={15} />
              </button>
            ) : (
              <button className="ru-btn active" onClick={enviar} disabled={!puedeEnviar} style={{ opacity: puedeEnviar ? 1 : 0.5 }}>
                <ShieldCheck size={15} /> Enviar revisión
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Cámara en vivo para la foto del odómetro (funciona igual en celular y en
// computadora, a diferencia de un <input type="file" capture="environment">
// que en computadora solo abre el explorador de archivos). Si el navegador
// no puede acceder a la cámara (sin permiso, sin cámara, etc.), cae a un
// selector de archivo normal para no dejar al usuario sin poder continuar.
function CapturaCamaraOdometro({ onCapturar, procesando }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camara, setCamara] = useState("iniciando"); // iniciando | activa | no_disponible

  useEffect(() => {
    let activo = true;
    async function iniciar() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!activo) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCamara("activa");
      } catch (e) {
        setCamara("no_disponible");
      }
    }
    iniciar();
    return () => {
      activo = false;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function tomarFoto() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapturar(new File([blob], `odometro_${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.85);
  }

  if (camara === "no_disponible") {
    return (
      <div>
        <label className="ru-btn" style={{ cursor: "pointer" }}>
          <Camera size={15} /> {procesando ? "Leyendo odómetro…" : "Elegir foto del odómetro"}
          <input
            type="file" accept="image/*" style={{ display: "none" }} disabled={procesando}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onCapturar(f); }}
          />
        </label>
        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 6 }}>
          No se pudo acceder a la cámara (revisa los permisos del navegador). Puedes elegir una foto ya tomada.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ position: "relative", background: T.ink, borderRadius: 10, overflow: "hidden", marginBottom: 10, aspectRatio: "4/3", maxWidth: 340 }}>
        <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: camara === "activa" ? "block" : "none" }} />
        {camara !== "activa" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "white" }}>
            <Camera size={22} />
            <span style={{ fontSize: 12 }}>Activando cámara…</span>
          </div>
        )}
      </div>
      <button className="ru-btn active" onClick={tomarFoto} disabled={camara !== "activa" || procesando}>
        <Camera size={15} /> {procesando ? "Leyendo odómetro…" : "Tomar foto del odómetro"}
      </button>
      <div style={{ fontSize: 11.5, color: T.muted, marginTop: 6 }}>Apunta la cámara al odómetro digital del tablero y toma la foto.</div>
    </div>
  );
}

function VerificarQR({ unidadActual, onExito }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [camara, setCamara] = useState("iniciando");
  const codigoEsperado = codigoQR(unidadActual);

  useEffect(() => {
    let activo = true;
    let intervalo = null;

    async function iniciar() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!activo) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCamara("activa");
        if ("BarcodeDetector" in window) {
          const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
          intervalo = setInterval(async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return;
            try {
              const codigos = await detector.detect(videoRef.current);
              if (codigos.length > 0) validar(codigos[0].rawValue);
            } catch (e) { /* frame no leíble, se reintenta */ }
          }, 600);
        }
      } catch (e) {
        setCamara("no_disponible");
      }
    }
    iniciar();
    return () => {
      activo = false;
      if (intervalo) clearInterval(intervalo);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validar(valor) {
    if (valor.trim().toUpperCase() === codigoEsperado.toUpperCase()) {
      onExito();
    } else {
      setError("Ese código no corresponde a tu unidad confirmada.");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <QrCode size={16} color={T.primary} />
        <span className="ru-h" style={{ fontWeight: 600, fontSize: 15 }}>Escanea el QR pegado en la unidad</span>
      </div>
      <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 14 }}>
        Confirma que estás físicamente junto a {unidadActual?.placas}.
      </div>

      <div style={{ position: "relative", background: T.ink, borderRadius: 10, overflow: "hidden", marginBottom: 14, aspectRatio: "4/3" }}>
        <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: camara === "activa" ? "block" : "none" }} />
        {camara !== "activa" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "white" }}>
            <ScanLine size={26} />
            <span style={{ fontSize: 12.5 }}>
              {camara === "iniciando" ? "Activando cámara…" : "Cámara no disponible, usa el código manual"}
            </span>
          </div>
        )}
      </div>

      <Campo label="¿Sin cámara o código dañado? Escribe el código">
        <div style={{ display: "flex", gap: 8 }}>
          <input className="ru-input ru-mono" placeholder={`Ej. ${codigoEsperado}`} value={manual} onChange={(e) => setManual(e.target.value)} />
          <button className="ru-btn active" onClick={() => validar(manual)} style={{ whiteSpace: "nowrap" }}>Verificar</button>
        </div>
      </Campo>
      {error && <div style={{ fontSize: 12, color: T.late, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 5, fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );
}

function Checklist({ icon, titulo, items, valores, setValores }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ color: T.primary }}>{icon}</span>
        <span className="ru-h" style={{ fontWeight: 600, fontSize: 15 }}>{titulo}</span>
      </div>
      {items.map((it) => (
        <div key={it.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 13.5 }}>{it.label}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setValores((v) => ({ ...v, [it.id]: "bien" }))}
              style={{
                border: `1px solid ${valores[it.id] === "bien" ? T.ok : T.border}`,
                background: valores[it.id] === "bien" ? T.okSoft : "white",
                color: valores[it.id] === "bien" ? T.ok : T.muted,
                borderRadius: 8, padding: "5px 10px", fontSize: 12.5, cursor: "pointer", fontWeight: 500,
              }}
            >Bien</button>
            <button
              onClick={() => setValores((v) => ({ ...v, [it.id]: "atencion" }))}
              style={{
                border: `1px solid ${valores[it.id] === "atencion" ? T.late : T.border}`,
                background: valores[it.id] === "atencion" ? T.lateSoft : "white",
                color: valores[it.id] === "atencion" ? T.late : T.muted,
                borderRadius: 8, padding: "5px 10px", fontSize: 12.5, cursor: "pointer", fontWeight: 500,
              }}
            >Atención</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------
   VISTA PANEL — supervisión y gerencia
------------------------------------------------------------------ */
function VistaPanel({ esGerente, esLiquidacion, scopeGerente, setScopeGerente, rutasVisibles, unidadesVisibles, lastByUnidad, resumen, unidades, setUnidades, asignaciones, setAsignaciones, seguridad, setSeguridad, revisiones }) {
  const [gestion, setGestion] = useState("tablero"); // tablero | asignar | seguridad
  const mostrarGestion = !esLiquidacion; // liquidación: solo lectura, solo tablero

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        {esGerente ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button className={`ru-btn ${scopeGerente === "todos" ? "active" : ""}`} onClick={() => setScopeGerente("todos")}>
              <Users size={14} /> Todos
            </button>
            <button className={`ru-btn ${scopeGerente === "supervisor" ? "active" : ""}`} onClick={() => setScopeGerente("supervisor")}>Supervisor-1</button>
            <button className={`ru-btn ${scopeGerente === "supervisor2" ? "active" : ""}`} onClick={() => setScopeGerente("supervisor2")}>Supervisor-2</button>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: T.muted }}>
            {rutasVisibles.map((r) => r.id).join(", ")}
          </div>
        )}
        {mostrarGestion && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className={`ru-btn ${gestion === "tablero" ? "active" : ""}`} onClick={() => setGestion("tablero")}>Tablero</button>
            <button className={`ru-btn ${gestion === "asignar" ? "active" : ""}`} onClick={() => setGestion("asignar")}>Asignar unidades</button>
            <button className={`ru-btn ${gestion === "seguridad" ? "active" : ""}`} onClick={() => setGestion("seguridad")}>Seguridad</button>
          </div>
        )}
      </div>

      {mostrarGestion && gestion === "asignar" && (
        <AsignarUnidades
          esGerente={esGerente}
          rutasVisibles={rutasVisibles} unidades={unidades} setUnidades={setUnidades}
          asignaciones={asignaciones} setAsignaciones={setAsignaciones}
        />
      )}

      {mostrarGestion && gestion === "seguridad" && (
        <PanelSeguridad esGerente={esGerente} seguridad={seguridad} setSeguridad={setSeguridad} />
      )}

      {(!mostrarGestion || gestion === "tablero") && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { k: "ok", label: "Al día" },
              { k: "pendiente", label: "Pendientes" },
              { k: "atrasada", label: "Atrasadas" },
            ].map(({ k, label }) => (
              <div key={k} className="ru-card" style={{ padding: "14px 16px", borderLeft: `3px solid ${ESTADO_UI[k].color}` }}>
                <div style={{ fontSize: 12, color: T.muted, marginBottom: 2 }}>{label}</div>
                <div className="ru-h ru-mono" style={{ fontSize: 22, fontWeight: 600 }}>{resumen[k]}</div>
              </div>
            ))}
          </div>

          {unidadesVisibles.length === 0 ? (
            <div className="ru-card" style={{ padding: 30, textAlign: "center", color: T.muted, fontSize: 13 }}>
              No hay unidades registradas todavía para este alcance.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
              {unidadesVisibles.map((u) => {
                const last = lastByUnidad[u.id];
                const dias = last ? diasDesde(last.fecha) : null;
                const estado = estadoPorDias(dias);
                const ui = ESTADO_UI[estado];
                return (
                  <div key={u.id} className="ru-card" style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div className="ru-h" style={{ fontWeight: 600, fontSize: 14.5 }}>{u.placas}</div>
                        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 4 }}>Ruta {u.ruta}{u.conductor ? ` · ${u.conductor}` : ""}</div>
                      </div>
                      <DialDias dias={dias} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: ui.color, display: "inline-block" }} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: ui.color }}>{ui.label}</span>
                      {last?.requiereAtencion && <AlertTriangle size={13} color={T.late} style={{ marginLeft: "auto" }} />}
                    </div>
                    {last?.operativo?.kilometraje && (
                      <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11.5, color: T.muted }}>
                        <span className="ru-mono">{Number(last.operativo.kilometraje).toLocaleString("es-MX")} km</span>
                        {last.operativo.combustible && (
                          <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Fuel size={11} /> {last.operativo.combustible}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "26px 0 10px" }}>
            <div className="ru-h" style={{ fontWeight: 600, fontSize: 14.5 }}>Bitácora reciente</div>
            <button
              className="ru-btn"
              onClick={() => exportarBitacoraExcel(revisiones, unidades, unidadesVisibles, esGerente ? "gerente" : "supervisor")}
            >
              <Download size={14} /> Descargar Excel
            </button>
          </div>
          <div className="ru-card" style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: T.bg, textAlign: "left" }}>
                  {["Fecha", "Placas", "Ruta", "Capturó", "Verificación", "Estado"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", fontWeight: 500, color: T.muted, fontSize: 11.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {revisiones
                  .filter((r) => unidadesVisibles.some((u) => u.id === r.unidadId))
                  .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
                  .slice(0, 12)
                  .map((r) => {
                    const u = unidades.find((x) => x.id === r.unidadId);
                    return (
                      <tr key={r.id} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td className="ru-mono" style={{ padding: "8px 12px", fontSize: 12 }}>
                          {new Date(r.fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                        </td>
                        <td style={{ padding: "8px 12px" }}>{u?.placas}</td>
                        <td style={{ padding: "8px 12px" }}>{u?.ruta || r.ruta}</td>
                        <td style={{ padding: "8px 12px" }}>{r.capturadoPor}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {r.qrVerificado && <QrCode size={13} color={T.primary} aria-label="QR verificado" />}
                            {r.ubicacion && <MapPin size={13} color={T.steel} aria-label="Ubicación registrada" />}
                            {r.foto && <Camera size={13} color={T.muted} aria-label="Foto adjunta" />}
                            {r.auditoriaAleatoria && (
                              <span style={{ fontSize: 10.5, fontWeight: 500, color: T.warn, background: T.warnSoft, padding: "2px 6px", borderRadius: 6 }}>Auditoría</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          {r.requiereAtencion
                            ? <span style={{ color: T.late, fontWeight: 500 }}>Requiere atención</span>
                            : <span style={{ color: T.ok, fontWeight: 500 }}>Sin novedad</span>}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function PanelSeguridad({ esGerente, seguridad, setSeguridad }) {
  const puntos = [
    { key: "qr", titulo: "Verificación por QR", detalle: "El conductor debe escanear el código pegado en la unidad antes de iniciar el checklist." },
    { key: "gps", titulo: "Ubicación (GPS) silenciosa", detalle: "Se registra la ubicación automáticamente al llegar al paso operativo, sin pedir nada al conductor." },
    { key: "kmCamara", titulo: "Kilometraje solo por cámara", detalle: "El kilometraje se lee con la cámara del odómetro digital; si se desactiva, se podrá escribir manualmente." },
    { key: "auditoria", titulo: "Auditoría aleatoria", detalle: "Un porcentaje de revisiones se marca al azar y exige foto de evidencia del odómetro." },
  ];

  function alternar(key) {
    if (!esGerente) return;
    setSeguridad((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div>
      <div className="ru-h" style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}>Puntos de seguridad</div>
      <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 14 }}>
        {esGerente
          ? "Activa o desactiva cada mecanismo de verificación para el conductor."
          : "Solo el rol Gerente puede modificar estos puntos de seguridad."}
      </div>

      <div className="ru-card" style={{ overflow: "hidden" }}>
        {puntos.map((p, i) => (
          <div
            key={p.key}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px",
              borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
            }}
          >
            <div>
              <div style={{ fontWeight: 500, fontSize: 13.5 }}>{p.titulo}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{p.detalle}</div>
            </div>
            <button
              onClick={() => alternar(p.key)}
              disabled={!esGerente}
              style={{
                width: 44, height: 24, borderRadius: 12, border: "none", flexShrink: 0, marginLeft: 16,
                background: seguridad[p.key] ? T.primary : T.border,
                cursor: esGerente ? "pointer" : "not-allowed", position: "relative", transition: "background .15s",
              }}
              aria-label={`${seguridad[p.key] ? "Desactivar" : "Activar"} ${p.titulo}`}
            >
              <span style={{
                position: "absolute", top: 3, left: seguridad[p.key] ? 23 : 3, width: 18, height: 18,
                borderRadius: "50%", background: "white", transition: "left .15s",
              }} />
            </button>
          </div>
        ))}
      </div>

      {seguridad.auditoria && (
        <div className="ru-card" style={{ padding: "14px 16px", marginTop: 14 }}>
          <div style={{ fontWeight: 500, fontSize: 13.5, marginBottom: 8 }}>Porcentaje de revisiones auditadas</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input
              type="range" min="0" max="100" step="5"
              value={seguridad.probabilidadAuditoria}
              disabled={!esGerente}
              onChange={(e) => setSeguridad((prev) => ({ ...prev, probabilidadAuditoria: Number(e.target.value) }))}
              style={{ flex: 1 }}
            />
            <span className="ru-mono" style={{ fontSize: 13.5, minWidth: 40 }}>{seguridad.probabilidadAuditoria}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function AsignarUnidades({ esGerente, rutasVisibles, unidades, setUnidades, asignaciones, setAsignaciones }) {
  // Selección local optimista: en cuanto se elige una opción se refleja de
  // inmediato en pantalla (sin esperar el viaje de ida y vuelta a Supabase),
  // y solo se descarta si el guardado real termina fallando (ver "Guardando…"
  // / aviso de error arriba del panel).
  const [seleccionLocal, setSeleccionLocal] = useState({});
  const [guardandoPorRuta, setGuardandoPorRuta] = useState({});

  async function cambiarAsignacion(rutaId, unidadId) {
    setSeleccionLocal((prev) => ({ ...prev, [rutaId]: unidadId }));
    setGuardandoPorRuta((prev) => ({ ...prev, [rutaId]: true }));
    try {
      await setAsignaciones((prev) => ({ ...prev, [rutaId]: unidadId }));
    } finally {
      setGuardandoPorRuta((prev) => {
        const next = { ...prev };
        delete next[rutaId];
        return next;
      });
    }
  }

  return (
    <div>
      <div className="ru-h" style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}>Unidad por defecto de cada ruta</div>
      <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 14 }}>
        Esta es la unidad que le aparecerá al conductor para confirmar al iniciar sesión. Cámbiala aquí si hubo un cambio de unidad.
      </div>
      {unidades.length === 0 && (
        <div className="ru-card" style={{ padding: "12px 14px", marginBottom: 14, background: T.warnSoft, borderColor: T.warn, fontSize: 12.5, color: T.warn, fontWeight: 500 }}>
          Todavía no hay ninguna unidad dada de alta — por eso todas las rutas muestran "Sin unidad asignada". {esGerente ? "Agrega la primera unidad en \"Agregar unidad\" (más abajo) y luego regresa aquí para asignarla a su ruta." : "Pide al Gerente que dé de alta las unidades de la flotilla."}
        </div>
      )}
      <div className="ru-card" style={{ overflow: "hidden", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: T.bg, textAlign: "left" }}>
              <th style={{ padding: "8px 12px", fontWeight: 500, color: T.muted, fontSize: 11.5 }}>Ruta</th>
              <th style={{ padding: "8px 12px", fontWeight: 500, color: T.muted, fontSize: 11.5 }}>Unidad asignada</th>
            </tr>
          </thead>
          <tbody>
            {rutasVisibles.map((r) => {
              const valorMostrado = seleccionLocal[r.id] !== undefined ? seleccionLocal[r.id] : (asignaciones[r.id] || "");
              return (
                <tr key={r.id} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: "8px 12px", fontWeight: 500 }}>{r.id}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <select
                        className="ru-input"
                        style={{ maxWidth: 260 }}
                        value={valorMostrado}
                        disabled={!esGerente}
                        onChange={(e) => cambiarAsignacion(r.id, e.target.value)}
                      >
                        <option value="">Sin unidad asignada</option>
                        {unidades.map((u) => (
                          <option key={u.id} value={u.id}>{u.placas}{u.conductor ? ` · ${u.conductor}` : ""} {u.ruta !== r.id ? `(actualmente en ${u.ruta})` : ""}</option>
                        ))}
                      </select>
                      {guardandoPorRuta[r.id] && <span style={{ fontSize: 11, color: T.muted, whiteSpace: "nowrap" }}>Guardando…</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {esGerente ? (
        <>
          <GestionUnidades unidades={unidades} setUnidades={setUnidades} rutasVisibles={rutasVisibles} />
          <EditarUnidades unidades={unidades} setUnidades={setUnidades} asignaciones={asignaciones} setAsignaciones={setAsignaciones} />
        </>
      ) : (
        <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>
          Dar de alta unidades nuevas o modificar sus datos es exclusivo del rol Gerente.
        </div>
      )}
    </div>
  );
}

function EditarUnidades({ unidades, setUnidades, asignaciones, setAsignaciones }) {
  const [editandoId, setEditandoId] = useState(null);
  const [borrador, setBorrador] = useState({});

  function iniciarEdicion(u) {
    setEditandoId(u.id);
    setBorrador({ placas: u.placas, ruta: u.ruta, conductor: u.conductor });
  }

  function guardarEdicion(id) {
    setUnidades((prev) => prev.map((u) => (u.id === id ? { ...u, ...borrador } : u)));
    setEditandoId(null);
  }

  function eliminar(id) {
    setUnidades((prev) => prev.filter((u) => u.id !== id));
    setAsignaciones((prev) => {
      const next = { ...prev };
      for (const ruta of Object.keys(next)) if (next[ruta] === id) next[ruta] = "";
      return next;
    });
  }

  return (
    <div className="ru-card" style={{ overflow: "hidden", marginTop: 16 }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
        <span className="ru-h" style={{ fontWeight: 600, fontSize: 13.5 }}>Todas las unidades</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 600 }}>
          <thead>
            <tr style={{ background: T.bg, textAlign: "left" }}>
              {["Placas", "Ruta", "Conductor", "Código QR", ""].map((h) => (
                <th key={h} style={{ padding: "8px 12px", fontWeight: 500, color: T.muted, fontSize: 11.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {unidades.map((u) => {
              const enEdicion = editandoId === u.id;
              return (
                <tr key={u.id} style={{ borderTop: `1px solid ${T.border}` }}>
                  {enEdicion ? (
                    <>
                      <td style={{ padding: "6px 12px" }}><input className="ru-input" value={borrador.placas} onChange={(e) => setBorrador((b) => ({ ...b, placas: e.target.value }))} /></td>
                      <td style={{ padding: "6px 12px" }}>
                        <select className="ru-input" value={borrador.ruta} onChange={(e) => setBorrador((b) => ({ ...b, ruta: e.target.value }))}>
                          {RUTAS_UNIDADES.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: "6px 12px" }}><input className="ru-input" value={borrador.conductor} onChange={(e) => setBorrador((b) => ({ ...b, conductor: e.target.value }))} /></td>
                      <td className="ru-mono" style={{ padding: "8px 12px", color: T.muted, fontSize: 12 }}>{codigoQR(borrador)}</td>
                      <td style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
                        <button className="ru-btn active" style={{ padding: "5px 10px" }} onClick={() => guardarEdicion(u.id)}>Guardar</button>
                        <button className="ru-btn" style={{ padding: "5px 10px", marginLeft: 6 }} onClick={() => setEditandoId(null)}>Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="ru-mono" style={{ padding: "8px 12px", fontWeight: 500 }}>{u.placas}</td>
                      <td style={{ padding: "8px 12px" }}>{u.ruta}</td>
                      <td style={{ padding: "8px 12px", color: T.muted }}>{u.conductor || "—"}</td>
                      <td className="ru-mono" style={{ padding: "8px 12px", color: T.muted, fontSize: 12 }}>{codigoQR(u)}</td>
                      <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                        <button className="ru-btn" style={{ padding: "5px 8px" }} onClick={() => iniciarEdicion(u)} aria-label="Editar"><Pencil size={13} /></button>
                        <button className="ru-btn" style={{ padding: "5px 8px", marginLeft: 6, color: T.late }} onClick={() => eliminar(u.id)} aria-label="Eliminar"><Trash2 size={13} /></button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GestionUnidades({ unidades, setUnidades, rutasVisibles }) {
  const [placas, setPlacas] = useState("");
  const [ruta, setRuta] = useState(rutasVisibles[0]?.id || "");
  const [conductor, setConductor] = useState("");

  function agregar() {
    if (!placas || !ruta) return;
    setUnidades((prev) => [...prev, { id: `U-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, placas, ruta, conductor }]);
    setPlacas(""); setConductor("");
  }

  return (
    <div className="ru-card" style={{ padding: 16, marginBottom: 18, background: T.primarySoft, borderColor: T.primary }}>
      <div className="ru-h" style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 10, color: T.primary }}>Agregar unidad</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr auto", gap: 8 }}>
        <input className="ru-input" placeholder="Placas" value={placas} onChange={(e) => setPlacas(e.target.value)} />
        <select className="ru-input" value={ruta} onChange={(e) => setRuta(e.target.value)}>
          {rutasVisibles.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}
        </select>
        <input className="ru-input" placeholder="Conductor (opcional)" value={conductor} onChange={(e) => setConductor(e.target.value)} />
        <button className="ru-btn active" onClick={agregar}>Agregar</button>
      </div>
    </div>
  );
}
