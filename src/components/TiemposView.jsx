// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Truck,
  Navigation,
  Undo2,
  LogOut,
  Receipt,
  Warehouse,
  CheckCircle2,
  Radio,
  AlertCircle,
  History,
  Play,
  Square,
  Check,
  ChevronRight,
  Download,
  Clock,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

// Este panel de tiempos vive en su PROPIO proyecto de Supabase (independiente
// de smart-track), tal como ya funcionaba en panel-rutas-v2.jsx.
const TIEMPOS_SUPABASE_URL = "https://nzbsmkscvzttekkwgkqz.supabase.co";
const TIEMPOS_SUPABASE_ANON_KEY = "sb_publishable_Px5yEBkZfC8-zty4LPYnNg_INLvGZXU";

export const supabaseTiempos = createClient(TIEMPOS_SUPABASE_URL, TIEMPOS_SUPABASE_ANON_KEY);

const storage = {
  async get(key) {
    const { data, error } = await supabaseTiempos
      .from("panel_kv")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return { value: JSON.stringify(data.value) };
  },
  async set(key, value) {
    const { error } = await supabaseTiempos.from("panel_kv").upsert(
      { key, value: JSON.parse(value), updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    if (error) {
      console.error("Error Supabase (tiempos):", error);
      return false;
    }
    return true;
  },
};

export const RUTAS_TIEMPOS = ["J201", "J202", "J203", "J204", "J205", "J206", "J207"];

// Secuencia del día: Ingreso a CLO -> Salida a ruta -> Ingreso a CLO (fin de
// ruta) -> Liquidación -> Almacén (automático) -> Salida de CLO final.
// "instante": se marca una sola vez (un solo timestamp, sin entrada/salida).
// "duracion": tiene entrada y salida, como antes.
export const AREAS = [
  { key: "ingreso_clo", nombre: "Ingreso a CLO", Icon: Truck, tipo: "instante", manual: true },
  { key: "salida_ruta", nombre: "Salida a ruta", Icon: Navigation, tipo: "instante", manual: true },
  { key: "ingreso_clo_fin", nombre: "Ingreso a CLO (fin de ruta)", Icon: Undo2, tipo: "instante", manual: true },
  { key: "liquidacion", nombre: "Liquidación", Icon: Receipt, tipo: "duracion", manual: true },
  { key: "almacen", nombre: "Almacén", Icon: Warehouse, tipo: "duracion", manual: false },
  { key: "salida_clo_final", nombre: "Salida de CLO final", Icon: LogOut, tipo: "instante", manual: true },
];

const AREA_COLORS = {
  ingreso_clo: "#f59e0b",
  salida_ruta: "#38bdf8",
  ingreso_clo_fin: "#a78bfa",
  liquidacion: "#6366f1",
  almacen: "#15803d",
  salida_clo_final: "#ef4444",
};

const UMBRAL_ALERTA_MS = 20 * 60 * 1000;
const VENTANA_MIN = 300;

function formatDuration(ms) {
  if (ms == null || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function formatHora(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatFecha(f) {
  if (!f) return "—";
  const [y, m, d] = f.split("-");
  return `${d}/${m}/${y}`;
}

function todayStr() {
  return new Date().toLocaleDateString("en-CA");
}

function areaVaciaInstante() {
  return { ts: null, usuario: null };
}
function areaVaciaDuracion() {
  return { entrada: null, salida: null, usuario: null };
}

function rutaVacia(ruta) {
  return {
    ruta,
    areas: {
      ingreso_clo: areaVaciaInstante(),
      salida_ruta: areaVaciaInstante(),
      ingreso_clo_fin: areaVaciaInstante(),
      liquidacion: areaVaciaDuracion(),
      almacen: areaVaciaDuracion(),
      salida_clo_final: areaVaciaInstante(),
    },
    finalizado: false,
    finalizadoTs: null,
  };
}

function todasCompletas(r) {
  return AREAS.every((a) => {
    const ar = r.areas[a.key];
    return a.tipo === "instante" ? !!ar.ts : !!(ar.entrada && ar.salida);
  });
}

// Completa de forma segura cualquier ruta que venga de datos guardados con
// un esquema anterior (áreas distintas, como el viejo Ingreso/Ingreso
// tarde/Almacén) — así nunca truena por leer un área que no existe.
function normalizarRuta(r, ruta) {
  const vacia = rutaVacia(ruta);
  if (!r) return vacia;
  const areas = {};
  AREAS.forEach((a) => {
    const existente = r.areas && r.areas[a.key];
    areas[a.key] = existente ? existente : (a.tipo === "instante" ? areaVaciaInstante() : areaVaciaDuracion());
  });
  return { ...vacia, ...r, ruta, areas };
}

function normalizarAreas(areas) {
  const resultado = {};
  AREAS.forEach((a) => {
    const existente = areas && areas[a.key];
    resultado[a.key] = existente ? existente : (a.tipo === "instante" ? areaVaciaInstante() : areaVaciaDuracion());
  });
  return resultado;
}

const EMPTY_ACTIVO = { fecha: todayStr(), rutas: {} };

/**
 * Panel de Tiempos, embebido dentro de SMART-TRACK.
 *
 * Props:
 * - identidad: texto a mostrar como "usuario" en cada marca.
 * - misAreas: arreglo con los nombres de área que esta identidad puede marcar
 *   (ej. ["Ingreso a CLO","Salida a ruta","Ingreso a CLO (fin de ruta)","Salida de CLO final"]
 *   para staff, ["Liquidación"] para Sulema).
 * - onLogout: opcional, botón de salir dentro del propio panel (vista exclusiva de Sulema).
 */
export default function TiemposView({ identidad, misAreas = [], onLogout }) {
  const [activo, setActivo] = useState(EMPTY_ACTIVO);
  const [historial, setHistorial] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [showHistorial, setShowHistorial] = useState(false);
  const [timelineFull, setTimelineFull] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const [error, setError] = useState(null);

  const activoRef = useRef(activo);
  const historialRef = useRef(historial);

  useEffect(() => { activoRef.current = activo; }, [activo]);
  useEffect(() => { historialRef.current = historial; }, [historial]);

  const fetchTodo = useCallback(async () => {
    try {
      const rA = await storage.get("board-activo");
      if (rA && rA.value) {
        const parsed = JSON.parse(rA.value);
        setActivo((prev) => (JSON.stringify(prev) === JSON.stringify(parsed) ? prev : parsed));
      }
    } catch (e) {}
    try {
      const rH = await storage.get("historial-rutas");
      if (rH && rH.value) {
        const parsed = JSON.parse(rH.value);
        setHistorial((prev) => (JSON.stringify(prev) === JSON.stringify(parsed) ? prev : parsed));
      }
    } catch (e) {}
    setLoading(false);
    setLastSync(Date.now());
    setError(null);
  }, []);

  useEffect(() => {
    fetchTodo();
    const channel = supabaseTiempos
      .channel("panel-changes-embed")
      .on("postgres_changes", { event: "*", schema: "public", table: "panel_kv" }, () => fetchTodo())
      .subscribe();
    return () => { supabaseTiempos.removeChannel(channel); };
  }, [fetchTodo]);

  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === "visible") fetchTodo(); };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [fetchTodo]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchLatestActivo = useCallback(async () => {
    try {
      const r = await storage.get("board-activo");
      if (r && r.value) return JSON.parse(r.value);
    } catch (e) {}
    return activoRef.current;
  }, []);

  const fetchLatestHistorial = useCallback(async () => {
    try {
      const r = await storage.get("historial-rutas");
      if (r && r.value) return JSON.parse(r.value);
    } catch (e) {}
    return historialRef.current;
  }, []);

  const guardarActivo = useCallback(async (nuevo) => {
    setActivo(nuevo);
    activoRef.current = nuevo;
    const ok = await storage.set("board-activo", JSON.stringify(nuevo));
    if (!ok) setError("No se pudo guardar. Revisa la conexión.");
    else setError(null);
  }, []);

  const guardarHistorial = useCallback(async (nuevo) => {
    setHistorial(nuevo);
    historialRef.current = nuevo;
    await storage.set("historial-rutas", JSON.stringify(nuevo));
  }, []);

  // Marca un checkpoint de una sola vez (ingreso_clo, salida_ruta,
  // ingreso_clo_fin, salida_clo_final).
  const marcarInstante = async (ruta, areaKey, areaNombre) => {
    if (!misAreas.includes(areaNombre)) return;
    const hoy = todayStr();
    let fresh = await fetchLatestActivo();
    if (fresh.fecha !== hoy) fresh = { fecha: hoy, rutas: {} };
    const r = normalizarRuta(fresh.rutas[ruta], ruta);
    if (r.areas[areaKey].ts) return;
    const ts = Date.now();
    let areasNuevas = { ...r.areas, [areaKey]: { ts, usuario: identidad } };
    let rutaActualizada = { ...r, areas: areasNuevas };

    // "Salida de CLO final" cierra Almacén automáticamente en ese instante.
    if (areaKey === "salida_clo_final" && rutaActualizada.areas.almacen.entrada && !rutaActualizada.areas.almacen.salida) {
      rutaActualizada = {
        ...rutaActualizada,
        areas: { ...rutaActualizada.areas, almacen: { ...rutaActualizada.areas.almacen, salida: ts, usuario: rutaActualizada.areas.almacen.usuario || "Automático" } },
      };
    }

    const completas = todasCompletas(rutaActualizada);
    rutaActualizada = { ...rutaActualizada, finalizado: completas, finalizadoTs: completas ? ts : rutaActualizada.finalizadoTs };

    await guardarActivo({ fecha: hoy, rutas: { ...fresh.rutas, [ruta]: rutaActualizada } });

    if (completas) {
      const freshHist = await fetchLatestHistorial();
      await guardarHistorial([{ fecha: hoy, ruta, areas: rutaActualizada.areas, finalizadoTs: ts }, ...freshHist].slice(0, 300));
    }
  };

  // Marca entrada de una zona de duración (solo Liquidación es manual; Almacén nunca).
  const marcarEntrada = async (ruta, areaKey, areaNombre) => {
    if (!misAreas.includes(areaNombre)) return;
    const hoy = todayStr();
    let fresh = await fetchLatestActivo();
    if (fresh.fecha !== hoy) fresh = { fecha: hoy, rutas: {} };
    const r = normalizarRuta(fresh.rutas[ruta], ruta);
    if (r.areas[areaKey].entrada) return;
    const ts = Date.now();
    const nuevaRuta = { ...r, areas: { ...r.areas, [areaKey]: { entrada: ts, salida: null, usuario: identidad } } };
    await guardarActivo({ fecha: hoy, rutas: { ...fresh.rutas, [ruta]: nuevaRuta } });
  };

  const marcarSalida = async (ruta, areaKey, areaNombre) => {
    if (!misAreas.includes(areaNombre)) return;
    const hoy = todayStr();
    const fresh = await fetchLatestActivo();
    if (fresh.fecha !== hoy) return;
    const r = fresh.rutas[ruta];
    if (!r || !r.areas[areaKey].entrada || r.areas[areaKey].salida) return;
    const ts = Date.now();

    let areasNuevas = { ...r.areas, [areaKey]: { ...r.areas[areaKey], salida: ts } };
    let rutaActualizada = { ...r, areas: areasNuevas };

    // Al cerrar Liquidación, Almacén arranca solo.
    if (areaKey === "liquidacion" && !rutaActualizada.areas.almacen.entrada) {
      rutaActualizada = {
        ...rutaActualizada,
        areas: { ...rutaActualizada.areas, almacen: { entrada: ts, salida: null, usuario: "Automático" } },
      };
    }

    const completas = todasCompletas(rutaActualizada);
    rutaActualizada = { ...rutaActualizada, finalizado: completas, finalizadoTs: completas ? ts : rutaActualizada.finalizadoTs };

    await guardarActivo({ fecha: hoy, rutas: { ...fresh.rutas, [ruta]: rutaActualizada } });

    if (completas) {
      const freshHist = await fetchLatestHistorial();
      await guardarHistorial([{ fecha: hoy, ruta, areas: rutaActualizada.areas, finalizadoTs: ts }, ...freshHist].slice(0, 300));
    }
  };

  const hoy = todayStr();
  const rutasHoy = activo.fecha === hoy ? activo.rutas : {};
  const segundosDesdeSync = lastSync ? Math.max(0, Math.floor((now - lastSync) / 1000)) : null;

  const historialOrdenado = historial
    .slice()
    .sort((a, b) => (b.fecha === a.fecha ? b.finalizadoTs - a.finalizadoTs : b.fecha.localeCompare(a.fecha)));

  // Solo Liquidación y Almacén se dibujan como barras de duración en la
  // línea de tiempo; los 4 checkpoints instantáneos se muestran como chips.
  const calcularPistas = (r) => {
    const areasDuracion = AREAS.filter((a) => a.tipo === "duracion");
    const entradas = areasDuracion.map((a) => r.areas[a.key].entrada).filter(Boolean);
    const hayInstantes = AREAS.some((a) => a.tipo === "instante" && r.areas[a.key].ts);
    if (entradas.length === 0 && !hayInstantes) return { pistas: [], hayActividad: false };
    const ventanaMs = VENTANA_MIN * 60000;
    const finVentana = now;
    const inicioVentana = finVentana - ventanaMs;
    const pistas = areasDuracion.map((a) => {
      const ar = r.areas[a.key];
      if (!ar.entrada) return { key: a.key, nombre: a.nombre, activa: false };
      const finReal = ar.salida || now;
      const minutos = Math.max(0, Math.round((finReal - ar.entrada) / 60000));
      const startClamped = Math.max(ar.entrada, inicioVentana);
      const endClamped = Math.min(finReal, finVentana);
      const leftPct = ((startClamped - inicioVentana) / ventanaMs) * 100;
      const widthPct = Math.max(1.2, ((endClamped - startClamped) / ventanaMs) * 100);
      return { key: a.key, nombre: a.nombre, activa: true, cerrada: !!ar.salida, leftPct, widthPct, entrada: ar.entrada, fin: finReal, minutos };
    });
    return { pistas, hayActividad: true };
  };

  const exportarExcel = () => {
    try {
      const construirFila = (ruta, r) => {
        const estado = r.finalizado ? "Completa" : AREAS.some((a) => (a.tipo === "instante" ? r.areas[a.key].ts : r.areas[a.key].entrada)) ? "En proceso" : "Sin registrar";
        const fila = { Fecha: formatFecha(r.__fecha || hoy), Ruta: ruta, Estado: estado };
        AREAS.forEach((a) => {
          const ar = r.areas[a.key];
          if (a.tipo === "instante") {
            fila[`${a.nombre}`] = formatHora(ar.ts);
            fila[`${a.nombre} usuario`] = ar.usuario || "";
          } else {
            const mins = ar.entrada ? Math.round(((ar.salida || now) - ar.entrada) / 60000) : "";
            fila[`${a.nombre} entrada`] = formatHora(ar.entrada);
            fila[`${a.nombre} salida`] = formatHora(ar.salida);
            fila[`${a.nombre} min`] = mins;
            fila[`${a.nombre} usuario`] = ar.usuario || "";
          }
        });
        if (r.areas.ingreso_clo.ts && r.areas.salida_ruta.ts) {
          fila["Minutos en CLO (antes de salir)"] = Math.round((r.areas.salida_ruta.ts - r.areas.ingreso_clo.ts) / 60000);
        }
        if (r.areas.salida_ruta.ts && r.areas.ingreso_clo_fin.ts) {
          fila["Minutos en ruta"] = Math.round((r.areas.ingreso_clo_fin.ts - r.areas.salida_ruta.ts) / 60000);
        }
        return fila;
      };

      const filasHoy = RUTAS_TIEMPOS.map((ruta) => construirFila(ruta, normalizarRuta(rutasHoy[ruta], ruta)));
      const filasHistorial = historialOrdenado.map((reg) => construirFila(reg.ruta, { areas: normalizarAreas(reg.areas), __fecha: reg.fecha, finalizado: true }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasHoy), "Hoy");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasHistorial), "Historial");
      XLSX.writeFile(wb, `tiempos_${hoy}.xlsx`);
    } catch (e) {
      setError("No se pudo generar el archivo Excel.");
    }
  };

  const reiniciarTodo = async () => {
    setReiniciando(true);
    try {
      exportarExcel();
      await new Promise((res) => setTimeout(res, 600));
      await guardarActivo({ fecha: hoy, rutas: {} });
      setConfirmReset(false);
      setError(null);
    } catch (e) {
      setError("No se pudo completar el reinicio.");
    } finally {
      setReiniciando(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <div className="display" style={{ fontSize: 16, color: "#E8EDF5" }}>TIEMPOS · RUTAS</div>
          <div style={{ fontSize: 12, color: "#9AA7BD", marginTop: 2 }}>
            Ingreso a CLO · Salida a ruta · Ingreso a CLO (fin) · Liquidación · Almacén (auto) · Salida de CLO final · {formatFecha(hoy)}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-ghost" onClick={fetchTodo}>
            <RefreshCw size={13} style={{ verticalAlign: "-2px" }} /> Actualizar
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#3DDC97", fontSize: 12, fontWeight: 700 }}>
            <Radio size={13} />
            En vivo
            <span style={{ color: "#9AA7BD", fontWeight: 400, minWidth: 44, display: "inline-block" }}>
              {segundosDesdeSync !== null ? `· hace ${segundosDesdeSync}s` : ""}
            </span>
          </div>
          {onLogout && <button className="btn-ghost" onClick={onLogout}>Salir</button>}
        </div>
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#3a1414", border: "1px solid #FF6B6B", color: "#FF6B6B", fontSize: 13, borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      <div style={{ fontSize: 11, color: "#9AA7BD", marginBottom: 14 }}>
        Conectado como <span style={{ color: "#E8EDF5", fontWeight: 700 }}>{identidad}</span>
        {" · puede marcar: "}
        <span style={{ color: "#F2B134", fontWeight: 700 }}>{misAreas.join(", ") || "—"}</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="display" style={{ fontSize: 14, color: "#9AA7BD" }}>RUTAS DE HOY</div>
        {misAreas.length > 0 && (
          <button className="btn-ghost" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={13} style={{ verticalAlign: "-2px" }} /> Reiniciar rutas de hoy
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: "#9AA7BD" }}>Cargando panel...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {RUTAS_TIEMPOS.map((ruta) => {
            const r = normalizarRuta(rutasHoy[ruta], ruta);
            const iniciada = AREAS.some((a) => (a.tipo === "instante" ? r.areas[a.key].ts : r.areas[a.key].entrada));
            const minEnCLO = r.areas.ingreso_clo.ts && r.areas.salida_ruta.ts
              ? Math.round((r.areas.salida_ruta.ts - r.areas.ingreso_clo.ts) / 60000) : null;
            const minEnRuta = r.areas.salida_ruta.ts && r.areas.ingreso_clo_fin.ts
              ? Math.round((r.areas.ingreso_clo_fin.ts - r.areas.salida_ruta.ts) / 60000) : null;
            return (
              <div key={ruta} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #1E2A42", flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontWeight: 700, fontSize: 15 }}>{ruta}</span>
                  {r.finalizado ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#3DDC97", background: "#0f2a20", border: "1px solid #3DDC97", borderRadius: 6, padding: "2px 8px" }}>
                      <CheckCircle2 size={11} /> COMPLETA
                    </span>
                  ) : iniciada ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#F2B134", background: "#2a2210", border: "1px solid #F2B134", borderRadius: 6, padding: "2px 8px" }}>
                      EN PROCESO
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: "#9AA7BD" }}>SIN REGISTRAR HOY</span>
                  )}
                  {(minEnCLO != null || minEnRuta != null) && (
                    <span style={{ marginLeft: "auto", display: "flex", gap: 10, fontSize: 10, color: "#9AA7BD" }}>
                      {minEnCLO != null && <span>En CLO: <b style={{ color: "#E8EDF5" }}>{minEnCLO} min</b></span>}
                      {minEnRuta != null && <span>En ruta: <b style={{ color: "#E8EDF5" }}>{minEnRuta} min</b></span>}
                    </span>
                  )}
                </div>
                <div>
                  {AREAS.map((a) => {
                    const area = r.areas[a.key];
                    const esMiArea = a.manual && misAreas.includes(a.nombre);

                    if (a.tipo === "instante") {
                      return (
                        <div key={a.key} style={{ padding: "10px 14px", borderTop: "1px solid #1E2A42" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 30, height: 30, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                              background: area.ts ? "#0f2a20" : "#141b2c",
                              border: `1px solid ${area.ts ? "#3DDC97" : "#1E2A42"}`,
                              color: area.ts ? "#3DDC97" : "#5b6478",
                            }}>
                              <a.Icon size={14} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#E8EDF5" }}>{a.nombre}</div>
                              <div className="mono" style={{ fontSize: 10, color: "#9AA7BD", display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {area.ts && <span>{formatHora(area.ts)}</span>}
                                {area.usuario && <span style={{ color: "#6b7280" }}>· {area.usuario}</span>}
                              </div>
                            </div>
                            {area.ts && <CheckCircle2 size={16} color="#3DDC97" />}
                          </div>
                          {esMiArea && !area.ts && (
                            <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={() => marcarInstante(ruta, a.key, a.nombre)}>
                              <Check size={13} style={{ verticalAlign: "-2px" }} /> Marcar {a.nombre.toLowerCase()}
                            </button>
                          )}
                        </div>
                      );
                    }

                    // tipo === "duracion" (Liquidación, Almacén)
                    const activaAhora = area.entrada && !area.salida;
                    const completa = area.entrada && area.salida;
                    const elapsed = activaAhora ? now - area.entrada : null;
                    const alerta = elapsed != null && elapsed > UMBRAL_ALERTA_MS;
                    return (
                      <div key={a.key} style={{ padding: "10px 14px", borderTop: "1px solid #1E2A42" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                            background: completa ? "#0f2a20" : activaAhora ? "#2a2210" : "#141b2c",
                            border: `1px solid ${completa ? "#3DDC97" : activaAhora ? "#F2B134" : "#1E2A42"}`,
                            color: completa ? "#3DDC97" : activaAhora ? "#F2B134" : "#5b6478",
                          }}>
                            <a.Icon size={14} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#E8EDF5" }}>
                              {a.nombre}{!a.manual && <span style={{ color: "#9AA7BD", fontWeight: 400 }}> (automático)</span>}
                            </div>
                            <div className="mono" style={{ fontSize: 10, color: "#9AA7BD", display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {area.entrada && <span>entró {formatHora(area.entrada)}</span>}
                              {area.salida && <span>salió {formatHora(area.salida)}</span>}
                              {area.usuario && <span style={{ color: "#6b7280" }}>· {area.usuario}</span>}
                            </div>
                          </div>
                          <div style={{ flexShrink: 0, textAlign: "right" }}>
                            {completa ? (
                              <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: "#3DDC97" }}>{formatDuration(area.salida - area.entrada)}</span>
                            ) : activaAhora ? (
                              <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: alerta ? "#FF6B6B" : "#E8EDF5" }}>{formatDuration(elapsed)}</span>
                            ) : (
                              <span style={{ fontSize: 11, color: "#3b4459" }}>—</span>
                            )}
                          </div>
                        </div>
                        {esMiArea && !area.entrada && (
                          <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={() => marcarEntrada(ruta, a.key, a.nombre)}>
                            <Play size={13} style={{ verticalAlign: "-2px" }} /> Marcar entrada
                          </button>
                        )}
                        {esMiArea && activaAhora && (
                          <button className="btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => marcarSalida(ruta, a.key, a.nombre)}>
                            <Square size={13} style={{ verticalAlign: "-2px" }} /> Marcar salida
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="display" style={{ fontSize: 14, color: "#9AA7BD", display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={14} /> LÍNEA DE TIEMPO · HOY (LIQUIDACIÓN Y ALMACÉN)
        </div>
        <button className="btn-ghost" onClick={() => setTimelineFull(true)}>
          <Maximize2 size={13} style={{ verticalAlign: "-2px" }} /> Pantalla completa
        </button>
      </div>

      <TimelineBloque now={now} rutasHoy={rutasHoy} calcularPistas={calcularPistas} />

      {timelineFull && (
        <TimelineFullscreen now={now} rutasHoy={rutasHoy} calcularPistas={calcularPistas} onClose={() => setTimelineFull(false)} hoy={hoy} />
      )}

      {confirmReset && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div className="card" style={{ maxWidth: 380, width: "100%", padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#FF6B6B", marginBottom: 8 }}>
              <TriangleAlert size={18} />
              <span className="display" style={{ fontSize: 15 }}>Reiniciar rutas de hoy</span>
            </div>
            <p style={{ fontSize: 13, color: "#E8EDF5" }}>
              Esto va a borrar únicamente las 7 rutas de hoy. El historial de días anteriores no se toca. Antes de borrar se descarga automáticamente un respaldo en Excel.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmReset(false)} disabled={reiniciando}>Cancelar</button>
              <button className="btn" style={{ flex: 1, background: "#FF6B6B", borderColor: "#FF6B6B" }} onClick={reiniciarTodo} disabled={reiniciando}>
                {reiniciando ? "Respaldando..." : "Sí, reiniciar todo"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 10 }}>
        <button className="btn-ghost" onClick={() => setShowHistorial((s) => !s)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <History size={14} /> Historial · {historial.length}
          <ChevronRight size={13} style={{ transform: showHistorial ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
        </button>
        <button className="btn-ghost" onClick={exportarExcel}>
          <Download size={13} style={{ verticalAlign: "-2px" }} /> Exportar Excel
        </button>
      </div>

      {showHistorial && (
        historialOrdenado.length === 0 ? (
          <div style={{ color: "#9AA7BD", fontSize: 13, textAlign: "center", padding: 24 }}>Aún no hay rutas completadas.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {historialOrdenado.map((reg, idx) => (
              <div key={`${reg.fecha}-${reg.ruta}-${idx}`} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #1E2A42" }}>
                  <span className="mono" style={{ fontWeight: 700 }}>{reg.ruta}</span>
                  <span style={{ fontSize: 11, color: "#9AA7BD" }}>{formatFecha(reg.fecha)}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#9AA7BD" }}>terminó {formatHora(reg.finalizadoTs)}</span>
                </div>
                {AREAS.map((a) => {
                  const areasNormalizadas = normalizarAreas(reg.areas);
                  const area = areasNormalizadas[a.key];
                  return (
                    <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: "1px solid #1E2A42", fontSize: 12 }}>
                      <a.Icon size={13} color="#9AA7BD" />
                      <span style={{ width: 170, color: "#E8EDF5" }}>{a.nombre}</span>
                      {a.tipo === "instante" ? (
                        <span className="mono" style={{ marginLeft: "auto", fontWeight: 700, color: "#3DDC97" }}>{formatHora(area.ts)}</span>
                      ) : (
                        <>
                          <span className="mono" style={{ fontSize: 11, color: "#9AA7BD" }}>{formatHora(area.entrada)} → {formatHora(area.salida)}</span>
                          <span className="mono" style={{ marginLeft: "auto", fontWeight: 700, color: "#3DDC97" }}>
                            {area.entrada && area.salida ? formatDuration(area.salida - area.entrada) : "—"}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// Pantalla completa que reescala automáticamente todo el contenido (con CSS
// transform: scale) para que las 7 rutas (o las que estén activas) quepan
// enteras en la pantalla, sin cortarse ni dejar espacio vacío de más. Se
// recalcula solo cuando cambian los datos, el tamaño de ventana o al girar
// el teléfono.
function TimelineFullscreen({ now, rutasHoy, calcularPistas, onClose, hoy }) {
  const contenedorRef = useRef(null);
  const contenidoRef = useRef(null);
  const [escala, setEscala] = useState(1);
  const [dimensiones, setDimensiones] = useState({ ancho: 0, alto: 0 });

  useEffect(() => {
    function recalcular() {
      const contenedor = contenedorRef.current;
      const contenido = contenidoRef.current;
      if (!contenedor || !contenido) return;
      // Se mide a tamaño natural (sin escalar) para calcular el factor correcto.
      contenido.style.transform = "none";
      const anchoDisponible = contenedor.clientWidth - 8;
      const altoDisponible = contenedor.clientHeight - 8;
      const anchoNatural = contenido.scrollWidth;
      const altoNatural = contenido.scrollHeight;
      const escalaX = anchoNatural > 0 ? anchoDisponible / anchoNatural : 1;
      const escalaY = altoNatural > 0 ? altoDisponible / altoNatural : 1;
      // No agranda de más si hay pocas rutas; solo encoge si hace falta.
      const nuevaEscala = Math.min(escalaX, escalaY, 1);
      setEscala(nuevaEscala);
      setDimensiones({ ancho: anchoNatural * nuevaEscala, alto: altoNatural * nuevaEscala });
    }
    // Se recalcula un par de veces al abrir (el layout puede tardar un
    // instante en asentarse) y luego en cada cambio relevante.
    recalcular();
    const t = setTimeout(recalcular, 50);
    window.addEventListener("resize", recalcular);
    window.addEventListener("orientationchange", recalcular);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", recalcular);
      window.removeEventListener("orientationchange", recalcular);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rutasHoy]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0B1220", zIndex: 9999, display: "flex", flexDirection: "column", padding: 14, boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexShrink: 0 }}>
        <div className="display" style={{ fontSize: 15, color: "#E8EDF5" }}>Línea de tiempo · {formatFecha(hoy)}</div>
        <button className="btn-ghost" onClick={onClose}>
          <Minimize2 size={13} style={{ verticalAlign: "-2px" }} /> Cerrar
        </button>
      </div>
      <div ref={contenedorRef} style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center" }}>
        <div style={{ width: dimensiones.ancho || "auto", height: dimensiones.alto || "auto" }}>
          <div ref={contenidoRef} style={{ transform: `scale(${escala})`, transformOrigin: "top left", width: 1300 }}>
            <TimelineBloque now={now} rutasHoy={rutasHoy} calcularPistas={calcularPistas} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineBloque({ now, rutasHoy, calcularPistas }) {
  const areasDuracion = AREAS.filter((a) => a.tipo === "duracion");
  const rutasActivas = RUTAS_TIEMPOS.map((ruta) => ({ ruta, r: normalizarRuta(rutasHoy[ruta], ruta) }))
    .map(({ ruta, r }) => ({ ruta, ...calcularPistas(r) }))
    .filter((x) => x.hayActividad);

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14, fontSize: 10, textTransform: "uppercase", fontWeight: 700, color: "#9AA7BD" }}>
        {areasDuracion.map((a) => (
          <span key={a.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: AREA_COLORS[a.key], display: "inline-block" }} />
            {a.nombre}
          </span>
        ))}
      </div>
      {rutasActivas.length === 0 ? (
        <p style={{ fontSize: 13, color: "#9AA7BD", textAlign: "center", padding: 16 }}>Aún no hay rutas activas hoy.</p>
      ) : (
        rutasActivas.map(({ ruta, pistas }) => {
          const r = normalizarRuta(rutasHoy[ruta], ruta);
          const chips = AREAS.filter((a) => a.tipo === "instante" && r.areas[a.key].ts);
          return (
            <div key={ruta} style={{ marginBottom: 18 }}>
              <div style={{ marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: "#E8EDF5" }}>{ruta}</span>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                {chips.map((a) => (
                  <div
                    key={a.key}
                    style={{
                      display: "flex", flexDirection: "column", gap: 4,
                      border: `1px solid ${AREA_COLORS[a.key]}`, borderRadius: 10,
                      padding: "8px 16px", minWidth: 150, flex: "1 1 150px",
                      background: "#0f1626",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: AREA_COLORS[a.key] }}>
                      <a.Icon size={12} /> {a.nombre}
                    </div>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: "#E8EDF5" }}>
                      {formatHora(r.areas[a.key].ts)}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {pistas.map((p) => (
                  <div key={p.key}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#9AA7BD", marginBottom: 2 }}>
                      <span style={{ textTransform: "uppercase", fontWeight: 700, color: p.activa ? AREA_COLORS[p.key] : "#3b4459" }}>{p.nombre}</span>
                      <span className="mono">
                        {p.activa ? `${formatHora(p.entrada)} → ${p.cerrada ? formatHora(p.fin) : "ahora"} · ${p.minutos} min` : "—"}
                      </span>
                    </div>
                    <div style={{ position: "relative", width: "100%", height: 7, borderRadius: 4, background: "#141b2c" }}>
                      {p.activa && (
                        <div style={{ position: "absolute", top: 0, height: "100%", borderRadius: 4, left: `${p.leftPct}%`, width: `${p.widthPct}%`, background: AREA_COLORS[p.key] }} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
