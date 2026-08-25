// @ts-nocheck
import React, { useState, useMemo, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import {
  Truck, ClipboardCheck, FileText, Gauge, ChevronRight, ChevronLeft,
  Check, AlertTriangle, Plus, Users, ShieldCheck, Fuel, Wrench, Droplet, Download, Trash2, Pencil,
  QrCode, MapPin, Camera, ScanLine,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { supabaseTiempos } from "./TiemposView";

/* ---------------------------------------------------------------
   VISOR DE ERRORES EN PANTALLA (solo temporal, para depurar en
   celular sin DevTools). Se instala una sola vez, a nivel de módulo
   y fuera del árbol de React: si un error hace que React tumbe toda
   la pantalla (queda en blanco), este aviso sigue viéndose porque
   está pegado directo al <body>, no depende de que React siga vivo.
   Para quitarlo cuando ya no se necesite, basta con borrar este
   bloque completo.
------------------------------------------------------------------ */
if (typeof window !== "undefined" && !window.__ruVisorErrores) {
  window.__ruVisorErrores = true;
  const mostrarErrorEnPantalla = (mensaje) => {
    let caja = document.getElementById("ru-visor-errores");
    if (!caja) {
      caja = document.createElement("div");
      caja.id = "ru-visor-errores";
      caja.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#7f1d1d;color:#fff;padding:14px;font:11px/1.5 monospace;max-height:70vh;overflow:auto;white-space:pre-wrap;box-shadow:0 2px 12px rgba(0,0,0,.6);";
      const titulo = document.createElement("div");
      titulo.textContent = "Se detectó un error (envía captura de esto):";
      titulo.style.cssText = "font-weight:700;margin-bottom:8px;font-family:sans-serif;";
      caja.appendChild(titulo);
      const cerrar = document.createElement("button");
      cerrar.textContent = "Cerrar aviso";
      cerrar.style.cssText = "display:block;margin-top:10px;background:#fff;color:#7f1d1d;border:none;padding:8px 12px;border-radius:6px;font-weight:700;font-family:sans-serif;";
      cerrar.onclick = () => caja.remove();
      caja.appendChild(cerrar);
      document.body.appendChild(caja);
    }
    const linea = document.createElement("div");
    linea.style.cssText = "margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.3);";
    linea.textContent = mensaje;
    caja.insertBefore(linea, caja.lastChild);
  };
  window.addEventListener("error", (e) => {
    mostrarErrorEnPantalla((e?.error?.stack || e?.message || "Error desconocido") + `\n(${e?.filename || ""}:${e?.lineno || ""})`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    mostrarErrorEnPantalla("Promesa rechazada sin capturar: " + (e?.reason?.stack || e?.reason?.message || String(e?.reason)));
  });
}


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

export const CLO_PVR = "PVR";
export const CLO_TEPIC = "TEPIC";

export const RUTAS_UNIDADES = [
  { id: "J201", grupo: "supervisor", clo: CLO_PVR }, { id: "J202", grupo: "supervisor", clo: CLO_PVR },
  { id: "J203", grupo: "supervisor", clo: CLO_PVR }, { id: "J204", grupo: "supervisor", clo: CLO_PVR },
  { id: "J205", grupo: "supervisor", clo: CLO_PVR }, { id: "J206", grupo: "supervisor", clo: CLO_PVR },
  { id: "J207", grupo: "supervisor", clo: CLO_PVR },
  { id: "MERCH07", grupo: "supervisor2", clo: CLO_PVR }, { id: "MERCH28", grupo: "supervisor2", clo: CLO_PVR },
  { id: "MERCH29", grupo: "supervisor2", clo: CLO_PVR }, { id: "MERCH30", grupo: "supervisor2", clo: CLO_PVR },
  { id: "MERCH04", grupo: "supervisor2", clo: CLO_TEPIC },
  { id: "MERCH31", grupo: "supervisor2", clo: CLO_TEPIC },
  { id: "MERCH32", grupo: "supervisor2", clo: CLO_TEPIC },
  { id: "MERCH62", grupo: "supervisor2", clo: CLO_TEPIC },
  { id: "MERCH63", grupo: "supervisor2", clo: CLO_TEPIC },
  { id: "SUPERVISOR-1", grupo: "supervisor", clo: CLO_PVR },
  { id: "SUPERVISOR-2", grupo: "supervisor2", clo: CLO_PVR },
  { id: "GERENTE", grupo: "gerente", clo: CLO_PVR },
  { id: "SUPLENTE-1", grupo: "gerente", clo: CLO_PVR },
  { id: "SUPLENTE-2", grupo: "gerente", clo: CLO_PVR },
];

export function cloDeRuta(rutaId) {
  return RUTAS_UNIDADES.find((r) => r.id === rutaId)?.clo || CLO_PVR;
}

export const SEGURIDAD_UNIDADES_DEFAULT = { qr: true, gps: true, kmCamara: true, auditoria: true, probabilidadAuditoria: 20 };

export const CLAVES_GASOLINA_DEFAULT = { porRuta: {}, porPlaca: {} };

function normalizarPlaca(p) {
  return String(p || "").trim().toUpperCase().replace(/\s+/g, "");
}

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

function fechaLocalMX(fechaIso) {
  if (!fechaIso) return "";
  try {
    return new Date(fechaIso).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  } catch (e) {
    return String(fechaIso).slice(0, 10);
  }
}

function diasDesde(fechaISO) {
  const f = new Date(fechaISO);
  const hoy = new Date();
  return Math.floor((hoy - f) / (1000 * 60 * 60 * 24));
}

function puntosConAtencion(revision) {
  const todos = [...CHECKS_FISICO, ...CHECKS_NIVELES, ...CHECKS_DOC];
  const grupos = [revision?.fisico, revision?.niveles, revision?.documentacion];
  const ids = [];
  grupos.forEach((g) => {
    Object.entries(g || {}).forEach(([id, valor]) => {
      if (valor === "atencion") ids.push(id);
    });
  });
  return ids.map((id) => todos.find((it) => it.id === id)?.label || id);
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
// Los registros "esSoloKm" (de la pestaña KM, captura ligera de kilometraje
// nada más) NO cuentan como checklist completo — si no, alguien que solo
// capturó su km ahí dejaría de parpadear en UNIDADES sin haber hecho de
// verdad la revisión completa del día.
export function unidadYaRegistradaHoy(data, rutaId) {
  if (!rutaId) return true; // nada que exigir si no aplica (ej. staff/gerente)
  const hoy = todayISO();
  return (data.revisionesUnidades || []).some((r) => r.ruta === rutaId && !r.esSoloKm && fechaLocalMX(r.fecha) === hoy);
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

function procesarYSubirFotoOdometro(file, meta, prefijoArchivo = "unidad_odometro") {
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
              const nombreArchivo = `${prefijoArchivo}_${Date.now()}.jpg`;
              const { error } = await supabase.storage.from("promociones").upload(nombreArchivo, blob, { cacheControl: "3600", upsert: false, contentType: "image/jpeg" });
              if (error) { console.error("No se pudo subir la foto:", error); resolve(null); return; }
              const { data: urlData } = supabase.storage.from("promociones").getPublicUrl(nombreArchivo);
              resolve({ url: urlData.publicUrl, nombreArchivo });
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

function recortarZonaOdometro(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(dataUrl);
    img.onload = () => {
      try {
        const x = img.width * 0.12;
        const y = img.height * 0.38;
        const w = img.width * 0.76;
        const h = img.height * 0.24;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, x, y, w, h, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch (e) {
        resolve(dataUrl);
      }
    };
    img.src = dataUrl;
  });
}

async function leerOdometro(dataUrl) {
  if (!window.Tesseract) return null;
  try {
    const dataUrlRecortado = await recortarZonaOdometro(dataUrl);
    const resultado = await window.Tesseract.recognize(dataUrlRecortado, "eng", {
      tessedit_char_whitelist: "0123456789",
    });
    const soloDigitos = (resultado?.data?.text || "").replace(/[^0-9]/g, "");
    return soloDigitos.length >= 3 ? soloDigitos : null;
  } catch (e) {
    return null;
  }
}

function exportarBitacoraExcel(revisiones, unidades, unidadesVisibles, etiquetaRol, alcanceIrrestricto) {
  const filas = revisiones
    .filter((r) => {
      if (alcanceIrrestricto) return true;
      if (unidadesVisibles.some((u) => u.id === r.unidadId)) return true;
      return !unidades.some((u) => u.id === r.unidadId);
    })
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .map((r) => {
      const u = unidades.find((x) => x.id === r.unidadId);
      return {
        Fecha: new Date(r.fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" }),
        Placas: u?.placas || "",
        Ruta: u?.ruta || r.ruta || "",
        CLO: cloDeRuta(u?.ruta || r.ruta),
        Conductor: u?.conductor || "",
        "Capturó": r.capturadoPor || "",
        "QR verificado": r.qrVerificado ? "Sí" : "No",
        "Ubicación": r.ubicacion ? `${r.ubicacion.lat}, ${r.ubicacion.lng}` : "No disponible",
        "Auditoría aleatoria": r.auditoriaAleatoria ? "Sí" : "No",
        "Foto adjunta": r.foto ? "Sí" : "No",
        "Estado físico": Object.values(r.fisico || {}).includes("atencion") ? "Atención" : "Bien",
        "Niveles de líquidos": Object.values(r.niveles || {}).includes("atencion") ? "Atención" : "Bien",
        "Líquidos rellenados": Object.entries(r.nivelesRellenos || {})
          .filter(([, marcado]) => marcado)
          .map(([id]) => CHECKS_NIVELES.find((c) => c.id === id)?.label || id)
          .join(", ") || "Ninguno",
        "Documentación": Object.values(r.documentacion || {}).includes("atencion") ? "Atención" : "Bien",
        "Kilometraje": r.operativo?.kilometraje || "",
        "Combustible": r.operativo?.combustible || "",
        "Requiere atención": r.requiereAtencion ? "Sí" : "No",
        "Puntos con atención": puntosConAtencion(r).join(" · ") || "",
        "Observaciones": r.observaciones || "",
      };
    });
  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja["!cols"] = [
    { wch: 11 }, { wch: 10 }, { wch: 12 }, { wch: 9 }, { wch: 9 }, { wch: 18 },
    { wch: 13 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
    { wch: 13 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 11 }, { wch: 12 }, { wch: 15 }, { wch: 28 }, { wch: 30 },
  ];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Bitácora");
  const fechaArchivo = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `bitacora_revision_unidades_${etiquetaRol}_${fechaArchivo}.xlsx`);
}

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

export default function UnidadesView({ data, persistRevisionUnidad, persistConfigUnidades, persistFresco, rol, puesto, identidad, rutaPropia, cloFiltro = CLO_PVR }) {
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
  const clavesGasolina = data.clavesGasolina || CLAVES_GASOLINA_DEFAULT;
  const [vistaConductor, setVistaConductor] = useState("checklist"); // "checklist" | "claves"
  const [errorGuardado, setErrorGuardado] = useState(null);

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
  function setClavesGasolina(actualizador) {
    return ejecutarPersistConfig((fresca) => {
      const actuales = fresca.clavesGasolina || CLAVES_GASOLINA_DEFAULT;
      const nuevas = typeof actualizador === "function" ? actualizador(actuales) : actualizador;
      return { clavesGasolina: nuevas };
    });
  }

  // Igual que "unidadYaRegistradaHoy": los registros "esSoloKm" no cuentan
  // como la última revisión de verdad, para no engañar el dial de "días
  // desde la última revisión" ni el resumen ok/pendiente/atrasada.
  const lastByUnidad = useMemo(() => {
    const map = {};
    for (const r of revisiones) {
      if (r.esSoloKm) continue;
      if (!map[r.unidadId] || new Date(r.fecha) > new Date(map[r.unidadId].fecha)) {
        map[r.unidadId] = r;
      }
    }
    return map;
  }, [revisiones]);

  const esConductor = rol === "vendedor" || rol === "merch";
  const esGerente = rol === "staff" && puesto === "gerente";
  const esLiquidacion = rol === "liquidacion";
  const esStaff = rol === "staff";
  const rutaPropiaStaff = puesto === "supervisor" ? "SUPERVISOR-1" : puesto === "supervisor2" ? "SUPERVISOR-2" : puesto === "gerente" ? "GERENTE" : puesto === "suplente1" ? "SUPLENTE-1" : puesto === "suplente2" ? "SUPLENTE-2" : null;
  const [modoStaff, setModoStaff] = useState("panel");

  const [scopeGerente, setScopeGerente] = useState("todos");
  const grupoFijo = rol === "staff" ? puesto : null;
  const alcanceIrrestricto = esLiquidacion || (esGerente && scopeGerente === "todos");
  const rutasVisibles = useMemo(() => {
    const delClo = cloFiltro === "todos" ? RUTAS_UNIDADES : RUTAS_UNIDADES.filter((r) => r.clo === cloFiltro);
    if (esLiquidacion) return delClo;
    if (grupoFijo === "supervisor" || grupoFijo === "supervisor2") return delClo.filter((r) => r.grupo === grupoFijo);
    if (esGerente && scopeGerente !== "todos") return delClo.filter((r) => r.grupo === scopeGerente);
    return delClo;
  }, [grupoFijo, esGerente, scopeGerente, esLiquidacion, cloFiltro]);

  const unidadesVisibles = useMemo(() => {
    if (alcanceIrrestricto && cloFiltro === "todos") return unidades;
    const enRutasVisibles = unidades.filter((u) => rutasVisibles.some((r) => r.id === u.ruta));
    if (!alcanceIrrestricto || cloFiltro !== CLO_PVR) return enRutasVisibles;
    const huerfanas = unidades.filter((u) => !RUTAS_UNIDADES.some((r) => r.id === u.ruta));
    return [...enRutasVisibles, ...huerfanas];
  }, [unidades, rutasVisibles, alcanceIrrestricto, cloFiltro]);

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
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <button className={`ru-btn ${vistaConductor === "checklist" ? "active" : ""}`} onClick={() => setVistaConductor("checklist")}>Revisión</button>
          <button className={`ru-btn ${vistaConductor === "claves" ? "active" : ""}`} onClick={() => setVistaConductor("claves")}>Mis claves de gasolina</button>
        </div>
        {vistaConductor === "checklist" ? (
          <VistaConductor
            unidades={unidades} onRegistrar={registrarRevision} lastByUnidad={lastByUnidad}
            usuarioSesion={identidad} usuarioRuta={rutaPropia} asignaciones={asignaciones}
            seguridad={seguridad}
          />
        ) : (
          <MisClavesGasolina ruta={rutaPropia} unidades={unidades} asignaciones={asignaciones} clavesGasolina={clavesGasolina} />
        )}
      </div>
    );
  }

  if (esStaff && modoStaff === "conductor") {
    return (
      <div style={{ fontFamily: "'Inter', sans-serif", color: T.ink }}>
        <EstilosUnidades />
        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <button className="ru-btn" onClick={() => setModoStaff("panel")}>Panel</button>
          <button className={`ru-btn ${vistaConductor === "checklist" ? "active" : ""}`} onClick={() => { setModoStaff("conductor"); setVistaConductor("checklist"); }}>Mi unidad</button>
          <button className={`ru-btn ${vistaConductor === "claves" ? "active" : ""}`} onClick={() => setVistaConductor("claves")}>Mis claves de gasolina</button>
        </div>
        {vistaConductor === "checklist" ? (
          <VistaConductor
            unidades={unidades} onRegistrar={registrarRevision} lastByUnidad={lastByUnidad}
            usuarioSesion={identidad} usuarioRuta={rutaPropiaStaff} asignaciones={asignaciones}
            seguridad={seguridad}
          />
        ) : (
          <MisClavesGasolina ruta={rutaPropiaStaff} unidades={unidades} asignaciones={asignaciones} clavesGasolina={clavesGasolina} />
        )}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: T.ink }}>
      <EstilosUnidades />
      {esStaff && (
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <button className="ru-btn active">Panel</button>
          <button className="ru-btn" onClick={() => setModoStaff("conductor")}>Mi unidad</button>
        </div>
      )}
      {errorGuardado && (
        <div className="ru-card" style={{ padding: "12px 14px", marginBottom: 16, background: T.lateSoft, borderColor: T.late, color: T.late, fontSize: 12.5, fontWeight: 500 }}>
          No se pudo guardar el último cambio: {errorGuardado}
        </div>
      )}
      <VistaPanel
        esGerente={esGerente}
        puesto={puesto}
        data={data}
        persistFresco={persistFresco}
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
        persistConfigUnidades={persistConfigUnidades}
        alcanceIrrestricto={alcanceIrrestricto}
        cloFiltro={cloFiltro}
        clavesGasolina={clavesGasolina}
        setClavesGasolina={setClavesGasolina}
        puedeReporteCombinado={esGerente || puesto === "supervisor2"}
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
  const [itemFotoRequerida, setItemFotoRequerida] = useState(null);
  const [evidenciaItem, setEvidenciaItem] = useState(null);
  const [subiendoEvidenciaItem, setSubiendoEvidenciaItem] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [paso, setPaso] = useState(0);
  const [fisico, setFisico] = useState({});
  const [niveles, setNiveles] = useState({});
  const [rellenos, setRellenos] = useState({});
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

  const kmSeCapturaEnTiempos = RUTAS_UNIDADES.find((r) => r.id === ruta)?.grupo === "supervisor";

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
    setFoto(null); setItemFotoRequerida(null); setEvidenciaItem(null); setPaso(0);
    setFisico({}); setNiveles({}); setRellenos({}); setDoc({});
    setKilometraje(""); setKmEstado("idle"); setKmDetectado(""); setKmError("");
    setCombustible("3/4"); setObs(""); setEnviado(false);
  }

  function avanzarDesdeConfirmacion() {
    const auditoria = seguridad.auditoria ? Math.random() * 100 < seguridad.probabilidadAuditoria : false;
    setEsAuditoria(auditoria);
    if (auditoria) {
      const todosLosItems = [...CHECKS_FISICO, ...CHECKS_NIVELES, ...CHECKS_DOC];
      const elegido = todosLosItems[Math.floor(Math.random() * todosLosItems.length)];
      setItemFotoRequerida(elegido.id);
    } else {
      setItemFotoRequerida(null);
    }
    setPaso((p) => p + 1);
  }

  async function manejarFotoEvidenciaItem(file) {
    if (!file || !itemFotoRequerida) return;
    setSubiendoEvidenciaItem(true);
    try {
      const itemInfo = [...CHECKS_FISICO, ...CHECKS_NIVELES, ...CHECKS_DOC].find((it) => it.id === itemFotoRequerida);
      const ahora = new Date();
      const resultado = await procesarYSubirFotoOdometro(
        file,
        {
          linea1: `${unidadActual?.placas} · ${itemInfo?.label || itemFotoRequerida}`,
          linea2: `${ruta} · ${ahora.toLocaleString("es-MX")}`,
        },
        "unidad_evidencia"
      );
      setEvidenciaItem(resultado);
    } finally {
      setSubiendoEvidenciaItem(false);
    }
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
          const resultado = await procesarYSubirFotoOdometro(file, {
            linea1: `${unidadActual?.placas} · ${ruta} · ${ahora.toLocaleString("es-MX")}`,
            linea2: ubicacion ? `GPS ${ubicacion.lat}, ${ubicacion.lng}` : "GPS no disponible",
          });
          setFoto(resultado);
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
      foto: foto?.url || null,
      fotoNombreArchivo: foto?.nombreArchivo || null,
      evidenciaItem: evidenciaItem ? { itemId: itemFotoRequerida, url: evidenciaItem.url, nombreArchivo: evidenciaItem.nombreArchivo } : null,
      fisico, niveles, nivelesRellenos: rellenos, documentacion: doc,
      operativo: { kilometraje, combustible },
      observaciones: obs,
    });
    setEnviado(true);
  }

  const puedeEnviar = (!itemFotoRequerida || !!evidenciaItem) && (kmSeCapturaEnTiempos || !!kilometraje) && !subiendoFoto && !subiendoEvidenciaItem;

  function todosContestados(items, valores) {
    return items.every((it) => valores[it.id] === "bien" || valores[it.id] === "atencion");
  }
  const itemFotoEnEstePaso =
    pasoActual === "fisico" ? CHECKS_FISICO.some((it) => it.id === itemFotoRequerida)
    : pasoActual === "niveles" ? CHECKS_NIVELES.some((it) => it.id === itemFotoRequerida)
    : pasoActual === "documentacion" ? CHECKS_DOC.some((it) => it.id === itemFotoRequerida)
    : false;
  const pasoCompleto = (
    pasoActual === "fisico" ? todosContestados(CHECKS_FISICO, fisico)
    : pasoActual === "niveles" ? todosContestados(CHECKS_NIVELES, niveles)
    : pasoActual === "documentacion" ? todosContestados(CHECKS_DOC, doc)
    : true
  ) && (!itemFotoEnEstePaso || !!evidenciaItem);

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
          <AlertTriangle size={14} /> Esta revisión fue seleccionada para auditoría aleatoria: se pedirá foto de un punto del checklist elegido al azar.
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
          <Checklist icon={<Truck size={16} />} titulo="Estado físico del vehículo" items={CHECKS_FISICO} valores={fisico} setValores={setFisico} itemFotoId={itemFotoRequerida} evidenciaItem={evidenciaItem} onCapturarEvidencia={manejarFotoEvidenciaItem} subiendoEvidencia={subiendoEvidenciaItem} />
        )}

        {pasoActual === "niveles" && (
          <Checklist icon={<Droplet size={16} />} titulo="Niveles de líquidos" items={CHECKS_NIVELES} valores={niveles} setValores={setNiveles} conRelleno rellenos={rellenos} setRellenos={setRellenos} itemFotoId={itemFotoRequerida} evidenciaItem={evidenciaItem} onCapturarEvidencia={manejarFotoEvidenciaItem} subiendoEvidencia={subiendoEvidenciaItem} />
        )}

        {pasoActual === "documentacion" && (
          <Checklist icon={<FileText size={16} />} titulo="Documentación" items={CHECKS_DOC} valores={doc} setValores={setDoc} itemFotoId={itemFotoRequerida} evidenciaItem={evidenciaItem} onCapturarEvidencia={manejarFotoEvidenciaItem} subiendoEvidencia={subiendoEvidenciaItem} />
        )}

        {pasoActual === "operativo" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Wrench size={16} color={T.primary} />
              <span className="ru-h" style={{ fontWeight: 600, fontSize: 15 }}>Operativo</span>
            </div>

            <Campo label="Kilometraje actual">
              {kmSeCapturaEnTiempos ? (
                <div style={{ fontSize: 12.5, color: T.muted, background: T.primarySoft, borderRadius: 8, padding: "10px 12px" }}>
                  Esta ruta captura su kilometraje en la pestaña <strong style={{ color: T.primary }}>TIEMPOS</strong>, al marcar la salida a ruta. Aquí no hace falta capturarlo otra vez.
                </div>
              ) : !seguridad.kmCamara ? (
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
                  <CapturaCamaraOdometro onCapturar={manejarFotoOdometro} procesando={kmEstado === "procesando"} tituloBoton="Tomar foto del odómetro" />
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

          </div>
        )}

        {paso > 0 && !(pasoActual === "qr" && !qrVerificado) && (
          <div style={{ marginTop: 20 }}>
            {!pasoCompleto && (
              <div style={{ fontSize: 12, color: T.late, marginBottom: 10 }}>
                {itemFotoEnEstePaso && !evidenciaItem
                  ? "Falta tomar la foto de evidencia del punto marcado más arriba para poder continuar."
                  : "Responde \"Bien\" o \"Atención\" en todos los puntos para poder continuar."}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button className="ru-btn" onClick={() => setPaso((p) => Math.max(0, p - 1))}>
                <ChevronLeft size={15} /> Atrás
              </button>
              {paso < ultimoPaso ? (
                <button className="ru-btn active" onClick={() => setPaso((p) => p + 1)} disabled={!pasoCompleto} style={{ opacity: pasoCompleto ? 1 : 0.5 }}>
                  Siguiente <ChevronRight size={15} />
                </button>
              ) : (
                <button className="ru-btn active" onClick={enviar} disabled={!puedeEnviar} style={{ opacity: puedeEnviar ? 1 : 0.5 }}>
                  <ShieldCheck size={15} /> Enviar revisión
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CapturaCamaraOdometro({ onCapturar, procesando, tituloBoton, instrucciones, mostrarGuia = true }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camara, setCamara] = useState("iniciando");
  const [zoom, setZoom] = useState(2);

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
    const ctx = canvas.getContext("2d");
    const srcW = video.videoWidth / zoom;
    const srcH = video.videoHeight / zoom;
    const srcX = (video.videoWidth - srcW) / 2;
    const srcY = (video.videoHeight - srcH) / 2;
    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapturar(new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  }

  if (camara === "no_disponible") {
    return (
      <div>
        <label className="ru-btn" style={{ cursor: "pointer" }}>
          <Camera size={15} /> {procesando ? "Procesando…" : `Elegir foto${tituloBoton ? ` — ${tituloBoton}` : ""}`}
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
        <video
          ref={videoRef} muted playsInline
          style={{
            width: "100%", height: "100%", objectFit: "cover", display: camara === "activa" ? "block" : "none",
            transform: `scale(${zoom})`, transformOrigin: "center center",
          }}
        />
        {camara === "activa" && mostrarGuia && (
          <div
            style={{
              position: "absolute", left: "12%", right: "12%", top: "38%", bottom: "38%",
              border: "2px dashed rgba(255,255,255,0.85)", borderRadius: 6, pointerEvents: "none",
              display: "flex", alignItems: "flex-end", justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 10.5, color: "white", background: "rgba(0,0,0,0.55)", padding: "2px 6px", borderRadius: 4, marginBottom: -18 }}>
              Coloca el número aquí
            </span>
          </div>
        )}
        {camara !== "activa" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "white" }}>
            <Camera size={22} />
            <span style={{ fontSize: 12 }}>Activando cámara…</span>
          </div>
        )}
      </div>

      {camara === "activa" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, maxWidth: 340 }}>
          <span style={{ fontSize: 11, color: T.muted, whiteSpace: "nowrap" }}>Zoom</span>
          <input
            type="range" min="1" max="3" step="0.25" value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span className="ru-mono" style={{ fontSize: 11.5, color: T.muted, minWidth: 30 }}>{zoom.toFixed(2)}x</span>
        </div>
      )}

      <button className="ru-btn active" onClick={tomarFoto} disabled={camara !== "activa" || procesando}>
        <Camera size={15} /> {procesando ? "Procesando…" : (tituloBoton || "Tomar foto")}
      </button>
      <div style={{ fontSize: 11.5, color: T.muted, marginTop: 6 }}>
        {instrucciones || "Usa el zoom para que el número del odómetro llene el recuadro punteado — así se lee mejor y evita confundirse con el velocímetro o el reloj."}
      </div>
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

function Checklist({ icon, titulo, items, valores, setValores, conRelleno, rellenos, setRellenos, itemFotoId, evidenciaItem, onCapturarEvidencia, subiendoEvidencia }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ color: T.primary }}>{icon}</span>
        <span className="ru-h" style={{ fontWeight: 600, fontSize: 15 }}>{titulo}</span>
      </div>
      {items.map((it) => (
        <div key={it.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
          {conRelleno && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!rellenos?.[it.id]}
                onChange={(e) => setRellenos((r) => ({ ...r, [it.id]: e.target.checked }))}
              />
              <span style={{ fontSize: 12, color: T.muted }}>Se rellenó hoy</span>
            </label>
          )}
          {it.id === itemFotoId && (
            <div style={{ marginTop: 10, padding: 10, background: T.warnSoft, borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.warn, fontWeight: 600, marginBottom: 8 }}>
                <AlertTriangle size={13} /> Punto seleccionado para auditoría: se requiere foto de evidencia
              </div>
              {evidenciaItem ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: T.ok }}>
                  <Check size={14} /> Foto de evidencia guardada.
                </div>
              ) : (
                <CapturaCamaraOdometro
                  onCapturar={onCapturarEvidencia}
                  procesando={subiendoEvidencia}
                  tituloBoton="Tomar foto de evidencia"
                  instrucciones={`Toma una foto clara de "${it.label}".`}
                />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

async function obtenerSalidasRutaHoy(fecha) {
  const mapa = {};
  try {
    const { data: activoRow } = await supabaseTiempos.from("panel_kv").select("value").eq("key", "board-activo").maybeSingle();
    if (activoRow?.value?.fecha === fecha && activoRow.value.rutas) {
      Object.entries(activoRow.value.rutas).forEach(([ruta, info]) => {
        const salida = info?.areas?.salida_ruta;
        if (salida?.ts) mapa[ruta] = { ts: salida.ts, km: salida.km ?? null };
      });
    }
  } catch (e) {
    console.error("Error consultando board-activo de Tiempos:", e);
  }
  try {
    const { data: histRow } = await supabaseTiempos.from("panel_kv").select("value").eq("key", "historial-rutas").maybeSingle();
    const historial = Array.isArray(histRow?.value) ? histRow.value : [];
    historial
      .filter((h) => h.fecha === fecha)
      .forEach((h) => {
        if (mapa[h.ruta] == null) {
          const salida = h.areas?.salida_ruta;
          if (salida?.ts) mapa[h.ruta] = { ts: salida.ts, km: salida.km ?? null };
        }
      });
  } catch (e) {
    console.error("Error consultando historial-rutas de Tiempos:", e);
  }
  return mapa;
}

function ResumenSalidaHoyImagen({ unidadesVisibles, revisiones, etiqueta }) {
  const capturaRef = useRef(null);
  const [generando, setGenerando] = useState(false);
  const [imagenLista, setImagenLista] = useState(null);
  const [error, setError] = useState(null);
  const [salidasPorRuta, setSalidasPorRuta] = useState({});
  const [cargandoSalidas, setCargandoSalidas] = useState(true);
  const [copiado, setCopiado] = useState(null);
  const hoy = todayISO();

  useEffect(() => {
    let activo = true;
    function cargar() {
      obtenerSalidasRutaHoy(hoy).then((mapa) => {
        if (activo) {
          setSalidasPorRuta(mapa);
          setCargandoSalidas(false);
        }
      });
    }
    cargar();
    const intervalo = setInterval(cargar, 20000);
    return () => { activo = false; clearInterval(intervalo); };
  }, [hoy]);

  const filas = useMemo(() => {
    const ordenRuta = (ruta) => {
      const idx = RUTAS_UNIDADES.findIndex((r) => r.id === ruta);
      return idx === -1 ? RUTAS_UNIDADES.length : idx;
    };
    return unidadesVisibles
      .map((u) => {
        const revisionesHoy = revisiones.filter((r) => r.unidadId === u.id && fechaLocalMX(r.fecha) === hoy);
        const ultima = revisionesHoy.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0] || null;
        return { unidad: u, revision: ultima };
      })
      .sort((a, b) => ordenRuta(a.unidad.ruta) - ordenRuta(b.unidad.ruta));
  }, [unidadesVisibles, revisiones, hoy]);

  async function generarImagen() {
    setGenerando(true);
    setError(null);
    setImagenLista(null);
    try {
      if (!capturaRef.current) return;
      const anchoCompleto = Math.max(
        capturaRef.current.scrollWidth,
        capturaRef.current.clientWidth,
        ...Array.from(capturaRef.current.querySelectorAll("table")).map((t) => t.scrollWidth),
        0
      );
      const canvas = await Promise.race([
        html2canvas(capturaRef.current, {
          backgroundColor: "#FFFFFF", scale: 1.5, useCORS: true,
          width: anchoCompleto,
          windowWidth: anchoCompleto,
          onclone: (clonedDoc, clonedEl) => {
            clonedEl.style.width = `${anchoCompleto}px`;
            clonedEl.style.maxWidth = "none";
            clonedDoc.querySelectorAll("*").forEach((el) => {
              const estilo = el.style;
              if (estilo && (estilo.overflowX === "auto" || estilo.overflowX === "scroll")) {
                estilo.overflowX = "visible";
                estilo.overflow = "visible";
                estilo.maxWidth = "none";
              }
            });
          },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Tardó demasiado en generarse.")), 20000)),
      ]);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const nombreArchivo = `salida_hoy_unidades_${etiqueta}_${hoy}.png`;
        setImagenLista({ blob, nombreArchivo, url: URL.createObjectURL(blob) });
      }, "image/png");
    } catch (e) {
      setError(e?.message || "No se pudo generar la imagen.");
    } finally {
      setGenerando(false);
    }
  }

  async function guardarOCompartir() {
    if (!imagenLista) return;
    const { blob, nombreArchivo, url } = imagenLista;
    const archivo = new File([blob], nombreArchivo, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: nombreArchivo });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    const link = document.createElement("a");
    link.download = nombreArchivo;
    link.href = url;
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      // .remove() (a diferencia de removeChild) no truena aunque el nodo ya
      // no esté colgado de document.body en ese momento — en algunos
      // navegadores/Android, iniciar la descarga puede alterar el DOM antes
      // de que llegue esta línea, y removeChild(link) tronaba con
      // "NotFoundError: el nodo no es hijo de este nodo".
      link.remove();
    }
  }

  function kmDeUnidad(unidad, revision) {
    const kmTiempos = salidasPorRuta[unidad.ruta]?.km;
    if (kmTiempos != null) return Number(kmTiempos);
    const kmChecklist = revision?.operativo?.kilometraje;
    return kmChecklist ? Number(kmChecklist) : null;
  }

  function descargarExcelResumenHoy() {
    const filasExcel = filas.map(({ unidad, revision }) => {
      const km = kmDeUnidad(unidad, revision);
      return {
        Unidad: unidad.placas,
        Ruta: unidad.ruta,
        Chofer: unidad.conductor || revision?.capturadoPor || "",
        "Km": km ?? "",
        "Hora de salida": salidasPorRuta[unidad.ruta]?.ts
          ? new Date(salidasPorRuta[unidad.ruta].ts).toLocaleTimeString("es-MX")
          : ["J201", "J203"].includes(unidad.ruta)
          ? "RUTA DE PUEBLO"
          : "Sin salida registrada",
        "Checklist de hoy": revision ? "Registrado" : "Sin registro",
      };
    });
    const hoja = XLSX.utils.json_to_sheet(filasExcel);
    hoja["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 18 }, { wch: 16 }];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Salida de hoy");
    XLSX.writeFile(libro, `salida_hoy_unidades_${etiqueta}_${hoy}.xlsx`);
  }

  async function copiarListaKilometrajes() {
    const conKm = filas
      .map(({ unidad, revision }) => ({ unidad, km: kmDeUnidad(unidad, revision) }))
      .filter(({ km }) => km != null);
    if (conKm.length === 0) {
      alert("Todavía no hay ningún kilometraje capturado hoy en este alcance.");
      return;
    }
    const lineas = conKm.map(({ unidad, km }) => `  "${unidad.placas}": ${km},`);
    const texto = `/* AUTOLLENADO DE KILOMETRAJES — generado por SMART-TRACK el ${hoy}
   Pégalo en la consola (F12) de KilometrajeVehiculo.php y da Enter.
   NO guarda nada: revisa los números y da clic en GUARDAR KM tú mismo. */
const KILOMETRAJES = {
${lineas.join("\n")}
};

(function () {
  "use strict";
  const COL_PLACA = 0, COL_INPUT = 4;
  function escribir(input, valor) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, String(valor));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
  }
  const norm = (t) => String(t || "").trim().toUpperCase();
  const filas = Array.from(document.querySelectorAll("tbody tr"));
  if (filas.length === 0) { console.error("No se encontro ninguna fila. Ya cargo la tabla y elegiste el Clo?"); return; }
  const pend = new Map(Object.entries(KILOMETRAJES).map(([p, k]) => [norm(p), k]));
  const ok = [], sinInput = [];
  filas.forEach((fila) => {
    const celdas = fila.querySelectorAll("td");
    if (celdas.length <= COL_INPUT) return;
    const placa = norm(celdas[COL_PLACA].textContent);
    if (!pend.has(placa)) return;
    const input = celdas[COL_INPUT].querySelector("input");
    if (!input) { sinInput.push(placa); return; }
    escribir(input, pend.get(placa));
    ok.push(placa + " -> " + pend.get(placa));
    pend.delete(placa);
  });
  console.log("%c=== AUTOLLENADO DE KILOMETRAJES ===", "font-weight:bold;font-size:14px");
  if (ok.length) { console.log("%cLlenadas (" + ok.length + "):", "color:green;font-weight:bold"); ok.forEach((l) => console.log("   " + l)); }
  else console.warn("No se lleno ninguna fila. Revisa que las placas coincidan con las de la tabla.");
  if (sinInput.length) console.warn("Sin campo editable: " + sinInput.join(", "));
  if (pend.size) console.warn("No encontradas en esta pagina (" + pend.size + "): " + [...pend.keys()].join(", "));
  console.log("%cREVISA los numeros y da clic en GUARDAR KM.", "color:#0F6E56;font-weight:bold;font-size:13px");
})();`;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(`Script copiado con ${conKm.length} unidad${conKm.length === 1 ? "" : "es"}. Pégalo en la consola de la plataforma de Kilometraje y da Enter.`);
      setTimeout(() => setCopiado(null), 8000);
    } catch (e) {
      window.prompt("Copia el script (Ctrl+C):", texto);
    }
  }

  useEffect(() => {
    return () => { if (imagenLista?.url) URL.revokeObjectURL(imagenLista.url); };
  }, [imagenLista]);

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div className="ru-h" style={{ fontWeight: 600, fontSize: 14.5 }}>Salida de hoy · Unidad, Chofer, Km y Hora</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="ru-btn" onClick={copiarListaKilometrajes}>
            <Gauge size={14} /> Copiar script de KM
          </button>
          <button className="ru-btn" onClick={descargarExcelResumenHoy}><Download size={14} /> Excel</button>
          {generando && <span style={{ fontSize: 12, color: T.muted }}>Generando…</span>}
          {!generando && !imagenLista && (
            <button className="ru-btn" onClick={generarImagen}><Download size={14} /> Generar imagen</button>
          )}
          {imagenLista && (
            <button className="ru-btn active" onClick={guardarOCompartir}><Download size={14} /> Guardar / compartir</button>
          )}
        </div>
      </div>
      {copiado && <div style={{ fontSize: 12.5, color: T.ok, marginBottom: 10, fontWeight: 500 }}>{copiado}</div>}
      {error && <div style={{ fontSize: 12, color: T.late, marginBottom: 10 }}>No se pudo generar: {error}</div>}

      <div ref={capturaRef} className="ru-card" style={{ padding: 18, background: "#FFFFFF" }}>
        <div className="ru-h" style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>Salida de hoy</div>
        <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 14 }}>{hoy}</div>
        {filas.length === 0 ? (
          <div style={{ fontSize: 13, color: T.muted, padding: "10px 0" }}>No hay unidades en este alcance.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 480 }}>
              <thead>
                <tr style={{ background: T.bg, textAlign: "left" }}>
                  {["Ruta", "Unidad", "Chofer", "Km", "Hora de salida"].map((h) => (
                    <th key={h} style={{ padding: "8px 10px", fontWeight: 500, color: T.muted, fontSize: 11.5, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(({ unidad, revision }) => {
                  const tsSalida = salidasPorRuta[unidad.ruta]?.ts;
                  const km = kmDeUnidad(unidad, revision);
                  return (
                    <tr key={unidad.id} style={{ borderTop: `1px solid ${T.border}` }}>
                      <td style={{ padding: "8px 10px", fontWeight: 600, whiteSpace: "nowrap" }}>{unidad.ruta}</td>
                      <td style={{ padding: "8px 10px", fontWeight: 500, whiteSpace: "nowrap" }}>{unidad.placas}</td>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{unidad.conductor || revision?.capturadoPor || "—"}</td>
                      <td className="ru-mono" style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                        {km != null ? `${km.toLocaleString("es-MX")} km` : "—"}
                      </td>
                      <td className="ru-mono" style={{ padding: "8px 10px", color: tsSalida ? T.ink : (["J201", "J203"].includes(unidad.ruta) ? T.muted : T.late), whiteSpace: "nowrap" }}>
                        {tsSalida
                          ? new Date(tsSalida).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                          : ["J201", "J203"].includes(unidad.ruta)
                          ? "RUTA DE PUEBLO"
                          : cargandoSalidas ? "Consultando…" : "Sin salida registrada"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AuditoriasDeHoy({ unidadesVisibles, revisiones }) {
  const hoy = todayISO();
  const todosLosItems = [...CHECKS_FISICO, ...CHECKS_NIVELES, ...CHECKS_DOC];

  const auditadasHoy = (revisiones || [])
    .filter((r) => r.auditoriaAleatoria && fechaLocalMX(r.fecha) === hoy)
    .map((r) => {
      const unidad = unidadesVisibles.find((u) => u.id === r.unidadId);
      const itemInfo = r.evidenciaItem ? todosLosItems.find((it) => it.id === r.evidenciaItem.itemId) : null;
      return { revision: r, unidad, itemLabel: itemInfo?.label || "Odómetro" };
    })
    .filter((a) => a.unidad);

  if (auditadasHoy.length === 0) {
    return (
      <div className="ru-card" style={{ padding: "12px 14px", marginBottom: 20, background: T.primarySoft, borderColor: T.primary, fontSize: 12.5, color: T.primary }}>
        Todavía no hay ninguna revisión auditada enviada hoy en este alcance. En cuanto alguien con auditoría aleatoria envíe su checklist, aparecerá aquí con el punto exacto que se le pidió como evidencia.
      </div>
    );
  }

  return (
    <div className="ru-card" style={{ padding: 16, marginBottom: 20, borderColor: T.warn }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <AlertTriangle size={15} color={T.warn} />
        <span className="ru-h" style={{ fontWeight: 600, fontSize: 14 }}>Auditorías de hoy</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {auditadasHoy.map(({ revision, unidad, itemLabel }) => (
          <div key={revision.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 0", borderTop: `1px solid ${T.border}` }}>
            <span>
              <strong>{unidad.ruta}</strong> · {unidad.placas}{unidad.conductor ? ` · ${unidad.conductor}` : ""}
            </span>
            <span style={{ color: T.warn, fontWeight: 500 }}>Evidencia pedida: {itemLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VistaPanel({ esGerente, puesto, data, persistFresco, esLiquidacion, scopeGerente, setScopeGerente, rutasVisibles, unidadesVisibles, lastByUnidad, resumen, unidades, setUnidades, asignaciones, setAsignaciones, seguridad, setSeguridad, revisiones, persistConfigUnidades, alcanceIrrestricto, cloFiltro, clavesGasolina, setClavesGasolina, puedeReporteCombinado }) {
  const [gestion, setGestion] = useState("tablero");
  const mostrarGestion = esGerente;
  const [revisionEvidenciaId, setRevisionEvidenciaId] = useState(null);

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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className={`ru-btn ${gestion === "tablero" ? "active" : ""}`} onClick={() => setGestion("tablero")}>Tablero</button>
            <button className={`ru-btn ${gestion === "asignar" ? "active" : ""}`} onClick={() => setGestion("asignar")}>Asignar unidades</button>
            <button className={`ru-btn ${gestion === "seguridad" ? "active" : ""}`} onClick={() => setGestion("seguridad")}>Seguridad</button>
            <button className={`ru-btn ${gestion === "gasolina" ? "active" : ""}`} onClick={() => setGestion("gasolina")}>Gasolina</button>
            <button className={`ru-btn ${gestion === "limpieza" ? "active" : ""}`} onClick={() => setGestion("limpieza")}>Limpieza</button>
          </div>
        )}
      </div>

      {mostrarGestion && gestion === "asignar" && (
        <AsignarUnidades
          esGerente={esGerente}
          puesto={puesto}
          data={data}
          persistFresco={persistFresco}
          rutasVisibles={rutasVisibles} unidades={unidades} setUnidades={setUnidades}
          asignaciones={asignaciones} setAsignaciones={setAsignaciones}
        />
      )}

      {mostrarGestion && gestion === "seguridad" && (
        <PanelSeguridad esGerente={esGerente} seguridad={seguridad} setSeguridad={setSeguridad} />
      )}

      {mostrarGestion && gestion === "gasolina" && (
        <GestionClavesGasolina clavesGasolina={clavesGasolina} setClavesGasolina={setClavesGasolina} unidades={unidades} />
      )}

      {mostrarGestion && gestion === "limpieza" && (
        <PanelLimpieza revisiones={revisiones} persistConfigUnidades={persistConfigUnidades} />
      )}

      {(!mostrarGestion || gestion === "tablero") && (
        <>
          <AuditoriasDeHoy unidadesVisibles={unidadesVisibles} revisiones={revisiones} />

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

          <ResumenSalidaHoyImagen unidadesVisibles={unidadesVisibles} revisiones={revisiones} etiqueta={esGerente ? "gerente" : "supervisor"} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "26px 0 10px" }}>
            <div className="ru-h" style={{ fontWeight: 600, fontSize: 14.5 }}>Bitácora reciente</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {puedeReporteCombinado && (
                <button
                  className="ru-btn"
                  onClick={() => exportarBitacoraExcel(revisiones, unidades, unidades, "ambos_clos", true)}
                  title="Incluye todas las unidades de PVR y TEPIC en un solo archivo"
                >
                  <Download size={14} /> Reporte de ambos CLOs (Excel)
                </button>
              )}
              <button
                className="ru-btn"
                onClick={() => exportarBitacoraExcel(revisiones, unidades, unidadesVisibles, esGerente ? "gerente" : "supervisor", alcanceIrrestricto)}
              >
                <Download size={14} /> Descargar histórico completo (Excel)
              </button>
            </div>
          </div>
          <div className="ru-card" style={{ overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 680 }}>
              <thead>
                <tr style={{ background: T.bg, textAlign: "left" }}>
                  {["Fecha", "Placas", "Ruta", "Capturó", "Verificación", "Estado", "Evidencia"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", fontWeight: 500, color: T.muted, fontSize: 11.5, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {revisiones
                  .filter((r) => {
                    if (alcanceIrrestricto) return true;
                    if (unidadesVisibles.some((u) => u.id === r.unidadId)) return true;
                    const existeUnidad = unidades.some((u) => u.id === r.unidadId);
                    return !existeUnidad && rutasVisibles.some((rv) => rv.id === r.ruta);
                  })
                  .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
                  .slice(0, 12)
                  .map((r) => {
                    const u = unidades.find((x) => x.id === r.unidadId);
                    const tieneEvidencia = !!r.foto || !!r.evidenciaItem?.url;
                    const expandida = revisionEvidenciaId === r.id;
                    const itemEvidenciaInfo = r.evidenciaItem
                      ? [...CHECKS_FISICO, ...CHECKS_NIVELES, ...CHECKS_DOC].find((it) => it.id === r.evidenciaItem.itemId)
                      : null;
                    return (
                      <React.Fragment key={r.id}>
                      <tr style={{ borderTop: `1px solid ${T.border}` }}>
                        <td className="ru-mono" style={{ padding: "8px 12px", fontSize: 12 }}>
                          {new Date(r.fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          {u?.placas || <span style={{ color: T.muted, fontStyle: "italic" }}>unidad dada de baja</span>}
                        </td>
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
                          {r.requiereAtencion ? (
                            <div>
                              <div style={{ color: T.late, fontWeight: 500 }}>Requiere atención</div>
                              {(() => {
                                const puntos = puntosConAtencion(r);
                                return puntos.length > 0 ? (
                                  <div style={{ fontSize: 11.5, color: T.late, marginTop: 2 }}>{puntos.join(" · ")}</div>
                                ) : null;
                              })()}
                              {r.observaciones && (
                                <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2, fontStyle: "italic" }}>"{r.observaciones}"</div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: T.ok, fontWeight: 500 }}>Sin novedad</span>
                          )}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          {tieneEvidencia ? (
                            <button className="ru-btn" style={{ padding: "4px 8px", fontSize: 11.5 }} onClick={() => setRevisionEvidenciaId(expandida ? null : r.id)}>
                              <Camera size={12} /> {expandida ? "Ocultar" : "Ver evidencia"}
                            </button>
                          ) : (
                            <span style={{ fontSize: 11.5, color: T.muted }}>—</span>
                          )}
                        </td>
                      </tr>
                      {expandida && (
                        <tr>
                          <td colSpan={7} style={{ padding: "10px 12px", background: T.bg }}>
                            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                              {r.foto && (
                                <div>
                                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>Foto del odómetro</div>
                                  <a href={r.foto} target="_blank" rel="noopener noreferrer">
                                    <img src={r.foto} alt="Odómetro" style={{ width: 160, borderRadius: 8, display: "block" }} />
                                  </a>
                                </div>
                              )}
                              {r.evidenciaItem?.url && (
                                <div>
                                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>
                                    Evidencia: {itemEvidenciaInfo?.label || r.evidenciaItem.itemId}
                                  </div>
                                  <a href={r.evidenciaItem.url} target="_blank" rel="noopener noreferrer">
                                    <img src={r.evidenciaItem.url} alt="Evidencia" style={{ width: 160, borderRadius: 8, display: "block" }} />
                                  </a>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  })}
              </tbody>
            </table>
            </div>
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

  const [local, setLocal] = useState({});
  const valor = (key) => (local[key] !== undefined ? local[key] : seguridad[key]);

  function alternar(key) {
    if (!esGerente) return;
    const nuevo = !valor(key);
    setLocal((prev) => ({ ...prev, [key]: nuevo }));
    setSeguridad((prev) => ({ ...prev, [key]: nuevo }));
  }

  function moverSlider(valorNuevo) {
    setLocal((prev) => ({ ...prev, probabilidadAuditoria: valorNuevo }));
  }
  function soltarSlider(valorNuevo) {
    setSeguridad((prev) => ({ ...prev, probabilidadAuditoria: valorNuevo }));
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
                background: valor(p.key) ? T.primary : T.border,
                cursor: esGerente ? "pointer" : "not-allowed", position: "relative", transition: "background .15s",
              }}
              aria-label={`${valor(p.key) ? "Desactivar" : "Activar"} ${p.titulo}`}
            >
              <span style={{
                position: "absolute", top: 3, left: valor(p.key) ? 23 : 3, width: 18, height: 18,
                borderRadius: "50%", background: "white", transition: "left .15s",
              }} />
            </button>
          </div>
        ))}
      </div>

      {valor("auditoria") && (
        <div className="ru-card" style={{ padding: "14px 16px", marginTop: 14 }}>
          <div style={{ fontWeight: 500, fontSize: 13.5, marginBottom: 8 }}>Porcentaje de revisiones auditadas</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input
              type="range" min="0" max="100" step="5"
              value={valor("probabilidadAuditoria")}
              disabled={!esGerente}
              onChange={(e) => moverSlider(Number(e.target.value))}
              onMouseUp={(e) => soltarSlider(Number(e.target.value))}
              onTouchEnd={(e) => soltarSlider(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span className="ru-mono" style={{ fontSize: 13.5, minWidth: 40 }}>{valor("probabilidadAuditoria")}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MisClavesGasolina({ ruta, unidades, asignaciones, clavesGasolina }) {
  const clavePersonal = (clavesGasolina.porRuta || {})[ruta] || null;
  const unidadId = asignaciones[ruta];
  const unidad = unidades.find((u) => u.id === unidadId);
  const clavePlaca = unidad ? (clavesGasolina.porPlaca || {})[normalizarPlaca(unidad.placas)] : null;

  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <div className="ru-card" style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Fuel size={16} color={T.primary} />
          <span className="ru-h" style={{ fontWeight: 600, fontSize: 15 }}>Mis claves para cargar gasolina</span>
        </div>

        {!clavePersonal && !clavePlaca && (
          <div style={{ fontSize: 12.5, color: T.muted }}>
            Todavía no hay claves capturadas para tu ruta ({ruta}). Pide al Gerente que las cargue en la pestaña "Gasolina".
          </div>
        )}

        {clavePersonal && (
          <div style={{ marginBottom: unidad ? 18 : 0 }}>
            <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Datos de conductor</div>
            <FilaClave label="N° Conductor" valor={clavePersonal.numeroConductor} />
            <FilaClave label="Clave conductor" valor={clavePersonal.claveConductor} />
          </div>
        )}

        {unidad ? (
          clavePlaca ? (
            <div>
              <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Tarjeta de tu unidad · {unidad.placas}
              </div>
              <FilaClave label="NIP tarjeta" valor={clavePlaca.nipTarjeta} destacado />
              {clavePlaca.centroCostos && <FilaClave label="Centro de costos" valor={clavePlaca.centroCostos} />}
              {clavePlaca.razonSocial && <FilaClave label="Razón social" valor={clavePlaca.razonSocial} />}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: T.muted }}>
              No hay NIP de tarjeta capturado todavía para la unidad {unidad.placas}.
            </div>
          )
        ) : (
          <div style={{ fontSize: 12.5, color: T.muted }}>
            No tienes una unidad asignada — pide al Gerente que te asigne una en "Asignar unidades" para poder ver el NIP de su tarjeta.
          </div>
        )}
      </div>
    </div>
  );
}

function FilaClave({ label, valor, destacado }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 13, color: T.muted }}>{label}</span>
      <span className="ru-mono" style={{ fontSize: destacado ? 17 : 14, fontWeight: 600, color: destacado ? T.primary : T.ink }}>
        {valor || "—"}
      </span>
    </div>
  );
}

function GestionClavesGasolina({ clavesGasolina, setClavesGasolina, unidades }) {
  const porRuta = clavesGasolina.porRuta || {};
  const porPlaca = clavesGasolina.porPlaca || {};
  const [statusRuta, setStatusRuta] = useState("");
  const [statusPlaca, setStatusPlaca] = useState("");
  const fileRutaRef = useRef(null);
  const filePlacaRef = useRef(null);

  function getVal(row, ...names) {
    const keys = Object.keys(row);
    for (const name of names) {
      const key = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
      if (key !== undefined) return row[key];
    }
    return "";
  }

  function actualizarClaveRuta(rutaId, campo, valor) {
    setClavesGasolina((prev) => ({
      ...prev,
      porRuta: { ...(prev.porRuta || {}), [rutaId]: { ...(prev.porRuta?.[rutaId] || {}), [campo]: valor } },
    }));
  }

  function actualizarClavePlaca(placaKey, campo, valor) {
    setClavesGasolina((prev) => ({
      ...prev,
      porPlaca: { ...(prev.porPlaca || {}), [placaKey]: { ...(prev.porPlaca?.[placaKey] || {}), [campo]: valor } },
    }));
  }

  function eliminarClavePlaca(placaKey) {
    setClavesGasolina((prev) => {
      const next = { ...(prev.porPlaca || {}) };
      delete next[placaKey];
      return { ...prev, porPlaca: next };
    });
  }

  function handleArchivoRutas(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        let n = 0;
        setClavesGasolina((prev) => {
          const nuevoPorRuta = { ...(prev.porRuta || {}) };
          rows.forEach((row) => {
            const rutaRaw = String(getVal(row, "RUTA", "Ruta") || "").trim().toUpperCase();
            if (!rutaRaw) return;
            const numeroConductor = String(getVal(row, "N° Conductor", "No Conductor", "Numero Conductor", "N Conductor") || "").trim();
            const claveConductor = String(getVal(row, "Clave conductor", "Clave Conductor") || "").trim();
            const nombreCompleto = String(getVal(row, "Nombre Completo", "Nombre") || "").trim();
            nuevoPorRuta[rutaRaw] = { numeroConductor, claveConductor, nombreCompleto };
            n++;
          });
          return { ...prev, porRuta: nuevoPorRuta };
        });
        setStatusRuta(`Se cargaron ${n} rutas.`);
      } catch (err) {
        setStatusRuta("No se pudo leer el archivo. ¿Es un .xlsx o .csv válido?");
      }
    };
    reader.readAsBinaryString(file);
  }

  function handleArchivoPlacas(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        let n = 0;
        setClavesGasolina((prev) => {
          const nuevoPorPlaca = { ...(prev.porPlaca || {}) };
          rows.forEach((row) => {
            const placaRaw = String(getVal(row, "PLACA", "Placa") || "").trim();
            const key = normalizarPlaca(placaRaw);
            if (!key) return;
            const nipTarjeta = String(getVal(row, "NIP TARJETA", "Nip Tarjeta", "NIP") || "").trim();
            const centroCostos = String(getVal(row, "CENTRO COSTOS", "Centro Costos") || "").trim();
            const razonSocial = String(getVal(row, "RAZON SOCIAL", "Razon Social") || "").trim();
            const tarjeta = String(getVal(row, "# TARJETA", "Tarjeta", "No Tarjeta") || "").trim();
            const anterior = nuevoPorPlaca[key] || {};
            nuevoPorPlaca[key] = {
              placa: placaRaw || anterior.placa,
              nipTarjeta: nipTarjeta || anterior.nipTarjeta || "",
              centroCostos: centroCostos || anterior.centroCostos || "",
              razonSocial: razonSocial || anterior.razonSocial || "",
              tarjeta: tarjeta || anterior.tarjeta || "",
            };
            n++;
          });
          return { ...prev, porPlaca: nuevoPorPlaca };
        });
        setStatusPlaca(`Se cargaron ${n} placas.`);
      } catch (err) {
        setStatusPlaca("No se pudo leer el archivo. ¿Es un .xlsx o .csv válido?");
      }
    };
    reader.readAsBinaryString(file);
  }

  const rutasOrdenadas = RUTAS_UNIDADES.map((r) => r.id);
  const placasTodas = useMemo(() => {
    const deUnidades = unidades.map((u) => normalizarPlaca(u.placas));
    const deClaves = Object.keys(porPlaca);
    return [...new Set([...deUnidades, ...deClaves])].filter(Boolean).sort();
  }, [unidades, porPlaca]);

  return (
    <div>
      <div className="ru-h" style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}>Claves para cargar gasolina</div>
      <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 14 }}>
        Cada conductor solo ve su propia clave (según su ruta) y el NIP de la tarjeta de la unidad que tenga asignada — no la lista completa.
      </div>

      <div className="ru-card" style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <span className="ru-h" style={{ fontWeight: 600, fontSize: 13.5 }}>Datos de conductor por ruta</span>
          <div>
            <input ref={fileRutaRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleArchivoRutas} />
            <button className="ru-btn" onClick={() => fileRutaRef.current?.click()}>Cargar Excel (RUTA, N° Conductor, Clave conductor)</button>
          </div>
        </div>
        {statusRuta && <div style={{ fontSize: 12, color: T.primary, marginBottom: 10 }}>{statusRuta}</div>}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.bg, textAlign: "left" }}>
                {["Ruta", "N° Conductor", "Clave conductor"].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", fontWeight: 500, color: T.muted, fontSize: 11.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rutasOrdenadas.map((rutaId) => {
                const c = porRuta[rutaId] || {};
                return (
                  <tr key={rutaId} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={{ padding: "6px 10px", fontWeight: 500 }}>{rutaId}</td>
                    <td style={{ padding: "6px 10px" }}>
                      <input className="ru-input" style={{ width: 110 }} value={c.numeroConductor || ""} onChange={(e) => actualizarClaveRuta(rutaId, "numeroConductor", e.target.value)} />
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <input className="ru-input" style={{ width: 110 }} value={c.claveConductor || ""} onChange={(e) => actualizarClaveRuta(rutaId, "claveConductor", e.target.value)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ru-card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <span className="ru-h" style={{ fontWeight: 600, fontSize: 13.5 }}>NIP de tarjeta por unidad (placa)</span>
          <div>
            <input ref={filePlacaRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleArchivoPlacas} />
            <button className="ru-btn" onClick={() => filePlacaRef.current?.click()}>Cargar Excel (PLACA, NIP TARJETA...)</button>
          </div>
        </div>
        {statusPlaca && <div style={{ fontSize: 12, color: T.primary, marginBottom: 10 }}>{statusPlaca}</div>}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
            <thead>
              <tr style={{ background: T.bg, textAlign: "left" }}>
                {["Placa", "NIP tarjeta", "Centro costos", "Razón social", ""].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", fontWeight: 500, color: T.muted, fontSize: 11.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {placasTodas.map((placaKey) => {
                const c = porPlaca[placaKey] || {};
                const unidad = unidades.find((u) => normalizarPlaca(u.placas) === placaKey);
                return (
                  <tr key={placaKey} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td className="ru-mono" style={{ padding: "6px 10px", fontWeight: 500 }}>
                      {c.placa || unidad?.placas || placaKey}
                      {unidad ? <span style={{ color: T.muted, fontWeight: 400 }}> · {unidad.ruta}</span> : null}
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <input className="ru-input" style={{ width: 90 }} value={c.nipTarjeta || ""} onChange={(e) => actualizarClavePlaca(placaKey, "nipTarjeta", e.target.value)} />
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <input className="ru-input" style={{ width: 130 }} value={c.centroCostos || ""} onChange={(e) => actualizarClavePlaca(placaKey, "centroCostos", e.target.value)} />
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <input className="ru-input" style={{ width: 110 }} value={c.razonSocial || ""} onChange={(e) => actualizarClavePlaca(placaKey, "razonSocial", e.target.value)} />
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <button className="ru-btn" style={{ padding: "5px 8px", color: T.late }} onClick={() => eliminarClavePlaca(placaKey)} aria-label="Eliminar"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function extraerNombreArchivoStorage(url) {
  if (!url) return null;
  try {
    const partes = url.split("/");
    return partes[partes.length - 1] || null;
  } catch (e) {
    return null;
  }
}

function PanelLimpieza({ revisiones, persistConfigUnidades }) {
  const [dias, setDias] = useState(90);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [errorLimpieza, setErrorLimpieza] = useState(null);

  const corte = Date.now() - dias * 24 * 60 * 60 * 1000;
  const aBorrar = (revisiones || []).filter((r) => new Date(r.fecha).getTime() < corte);

  async function ejecutarLimpieza() {
    if (aBorrar.length === 0) return;
    const confirmado = window.confirm(
      `¿Seguro que quieres borrar ${aBorrar.length} registro(s) de revisión (y sus fotos, si las tienen) de hace más de ${dias} días? Esta acción no se puede deshacer.`
    );
    if (!confirmado) return;

    setProcesando(true);
    setResultado(null);
    setErrorLimpieza(null);
    try {
      const archivos = [];
      aBorrar.forEach((r) => {
        const foto1 = extraerNombreArchivoStorage(r.foto);
        const foto2 = extraerNombreArchivoStorage(r.evidenciaItem?.url);
        if (foto1) archivos.push(foto1);
        if (foto2) archivos.push(foto2);
      });
      if (archivos.length > 0) {
        const { error } = await supabase.storage.from("promociones").remove(archivos);
        if (error) console.error("No se pudieron borrar algunas imágenes del bucket:", error);
      }

      const idsABorrar = new Set(aBorrar.map((r) => r.id));
      await persistConfigUnidades((fresca) => ({
        revisionesUnidades: (fresca.revisionesUnidades || []).filter((r) => !idsABorrar.has(r.id)),
      }));

      setResultado(`Se borraron ${aBorrar.length} registro(s) y ${archivos.length} imagen(es) del almacenamiento.`);
    } catch (err) {
      console.error("Error en limpieza de Unidades:", err);
      setErrorLimpieza(err?.message || "No se pudo completar la limpieza. Intenta de nuevo.");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div>
      <div className="ru-h" style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}>Limpieza de registros antiguos</div>
      <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 14 }}>
        Borra las revisiones (y las fotos que tengan guardadas) más antiguas que el número de días que elijas, para que la base de datos y el almacenamiento de imágenes no se saturen con el tiempo. Esta acción no se puede deshacer.
      </div>

      <div className="ru-card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5 }}>Borrar registros de más de</span>
          <input
            type="number" className="ru-input" style={{ width: 80 }} min={7} value={dias}
            onChange={(e) => setDias(Math.max(7, Number(e.target.value) || 90))}
          />
          <span style={{ fontSize: 13.5 }}>días</span>
        </div>
        <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 14 }}>
          Con {dias} días, esto borraría <strong style={{ color: T.ink }}>{aBorrar.length}</strong> registro{aBorrar.length === 1 ? "" : "s"} ahora mismo.
        </div>
        <button
          className="ru-btn"
          style={{ borderColor: T.late, color: T.late }}
          onClick={ejecutarLimpieza}
          disabled={procesando || aBorrar.length === 0}
        >
          <Trash2 size={14} /> {procesando ? "Borrando…" : `Borrar registros de más de ${dias} días`}
        </button>
        {resultado && <div style={{ fontSize: 12.5, color: T.ok, marginTop: 10 }}>{resultado}</div>}
        {errorLimpieza && <div style={{ fontSize: 12.5, color: T.late, marginTop: 10 }}>{errorLimpieza}</div>}
      </div>
    </div>
  );
}

function AsignarUnidades({ esGerente, puesto, data, persistFresco, rutasVisibles, unidades, setUnidades, asignaciones, setAsignaciones }) {
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

      {(esGerente || puesto === "supervisor") && persistFresco && (
        <PermisosSuplentesPanel data={data} persistFresco={persistFresco} />
      )}
    </div>
  );
}

// Indicadores/pestañas que se pueden marcar o desmarcar para cada
// Suplente — mismas familias y keys que usa el grid de pestañas
// (NeonObjetivoTabs) en StaffView, para que coincidan exactamente.
const INDICADORES_SUPLENTE = [
  { fam: "Inicio", items: [{ key: "dia", label: "DÍA" }, { key: "escalera", label: "Escalera" }, { key: "mesa", label: "Mesa de Control" }] },
  { fam: "Avances", items: [{ key: "max", label: "Max" }, { key: "open", label: "Open" }, { key: "champions", label: "Champions" }, { key: "rally_otc", label: "Rally OTC" }, { key: "otc_ventas", label: "OTC Ventas" }] },
  { fam: "Ventas", items: [{ key: "facturas", label: "Facturas" }, { key: "creditos", label: "Créditos" }, { key: "cartera_vencida", label: "Cartera Vencida" }, { key: "alta_cliente", label: "Alta Cliente" }] },
  { fam: "Promociones", items: [{ key: "cuponera", label: "Cuponera" }] },
  { fam: "Operación", items: [{ key: "unidades", label: "Unidades" }, { key: "nomina", label: "Nómina" }, { key: "reloj_checador", label: "Reloj Checador" }, { key: "cargas", label: "Cargas" }, { key: "km", label: "KM" }, { key: "sin_visita", label: "Sin Visita" }, { key: "rutas", label: "Rutas" }, { key: "tepic", label: "Tepic" }] },
  { fam: "Avisos", items: [{ key: "avisos", label: "Avisos" }] },
  { fam: "Configuración", items: [{ key: "mi_fondo", label: "Mi Fondo" }] },
];

// Panel para que Gerente o Supervisor-1 marquen qué pestañas puede ver
// cada Suplente (1 y 2). Se guarda en data.permisosSuplentes =
// { suplente1: [keys...], suplente2: [keys...] }, y StaffView.jsx lo
// usa para filtrar el grid de pestañas cuando puesto === "suplente1"/"suplente2".
function PermisosSuplentesPanel({ data, persistFresco }) {
  const [suplenteActivo, setSuplenteActivo] = useState("suplente1");
  const [guardando, setGuardando] = useState(false);
  const [nombreInput, setNombreInput] = useState("");
  const [nombreCargando, setNombreCargando] = useState(false);
  const [nombreGuardando, setNombreGuardando] = useState(false);
  const [nombreStatus, setNombreStatus] = useState("");

  const permisos = data?.permisosSuplentes?.[suplenteActivo] || [];
  const usernameSuplente = suplenteActivo === "suplente1" ? "SUPLENTE-1" : "SUPLENTE-2";

  // Trae el nombre actual desde profiles cada vez que se cambia de
  // Suplente (o al abrir el panel), para no pisar lo que ya había.
  useEffect(() => {
    let activo = true;
    setNombreCargando(true);
    setNombreStatus("");
    supabase
      .from("profiles")
      .select("nombre")
      .eq("username", usernameSuplente)
      .single()
      .then(({ data: fila, error }) => {
        if (!activo) return;
        if (!error) setNombreInput(fila?.nombre || "");
        setNombreCargando(false);
      });
    return () => { activo = false; };
  }, [usernameSuplente]);

  async function guardarNombre() {
    setNombreGuardando(true);
    setNombreStatus("");
    const { error } = await supabase
      .from("profiles")
      .update({ nombre: nombreInput.trim() || null })
      .eq("username", usernameSuplente);
    setNombreGuardando(false);
    setNombreStatus(error ? `Error: ${error.message}` : "Nombre guardado ✓");
    setTimeout(() => setNombreStatus(""), 3000);
  }

  function alternar(key) {
    const yaLoTiene = permisos.includes(key);
    const nuevaLista = yaLoTiene ? permisos.filter((k) => k !== key) : [...permisos, key];
    setGuardando(true);
    persistFresco((fresca) => ({
      permisosSuplentes: {
        ...(fresca.permisosSuplentes || {}),
        [suplenteActivo]: nuevaLista,
      },
    }));
    setGuardando(false);
  }

  return (
    <div className="ru-card" style={{ padding: 16, marginTop: 16 }}>
      <div className="ru-h" style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 4 }}>
        Permisos de Suplente — qué pestañas puede ver
      </div>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>
        Marca las pestañas que SUPLENTE-1 o SUPLENTE-2 podrán ver al iniciar sesión. Por defecto no ven ninguna hasta que las marques aquí.
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          className={`ru-btn ${suplenteActivo === "suplente1" ? "active" : ""}`}
          onClick={() => setSuplenteActivo("suplente1")}
        >
          SUPLENTE-1
        </button>
        <button
          className={`ru-btn ${suplenteActivo === "suplente2" ? "active" : ""}`}
          onClick={() => setSuplenteActivo("suplente2")}
        >
          SUPLENTE-2
        </button>
        {guardando && <span style={{ fontSize: 11, color: T.muted, alignSelf: "center" }}>Guardando…</span>}
      </div>

      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: T.muted, marginBottom: 6, textTransform: "uppercase" }}>Nombre</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="ru-input"
            style={{ maxWidth: 260 }}
            value={nombreInput}
            onChange={(e) => setNombreInput(e.target.value)}
            placeholder={nombreCargando ? "Cargando..." : "Nombre de la persona"}
            disabled={nombreCargando || nombreGuardando}
          />
          <button className="ru-btn active" onClick={guardarNombre} disabled={nombreCargando || nombreGuardando}>
            {nombreGuardando ? "Guardando..." : "Guardar nombre"}
          </button>
          {nombreStatus && (
            <span style={{ fontSize: 11.5, color: nombreStatus.startsWith("Error") ? T.late : T.ok }}>{nombreStatus}</span>
          )}
        </div>
      </div>
      {INDICADORES_SUPLENTE.map((fam) => (
        <div key={fam.fam} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: T.muted, marginBottom: 6, textTransform: "uppercase" }}>{fam.fam}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {fam.items.map((it) => {
              const marcado = permisos.includes(it.key);
              return (
                <label
                  key={it.key}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer",
                    padding: "6px 10px", borderRadius: 8, border: `1px solid ${marcado ? T.primary : T.border}`,
                    background: marcado ? T.primarySoft : T.surface,
                  }}
                >
                  <input type="checkbox" checked={marcado} onChange={() => alternar(it.key)} style={{ margin: 0 }} />
                  {it.label}
                </label>
              );
            })}
          </div>
        </div>
      ))}
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
