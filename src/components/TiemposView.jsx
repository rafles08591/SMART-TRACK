// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Truck,
  Receipt,
  Warehouse,
  CheckCircle2,
  Radio,
  AlertCircle,
  History,
  Play,
  Square,
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

const supabaseTiempos = createClient(TIEMPOS_SUPABASE_URL, TIEMPOS_SUPABASE_ANON_KEY);

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

const RUTAS = ["J201", "J202", "J203", "J204", "J205", "J206", "J207"];

// "Almacén" ya no es un área manual: se activa y se cierra sola (ver más abajo).
const AREAS = [
  { key: "ingreso", nombre: "Ingreso", Icon: Truck, manual: true },
  { key: "ingreso_tarde", nombre: "Ingreso tarde", Icon: Clock, manual: true },
  { key: "liquidacion", nombre: "Liquidación", Icon: Receipt, manual: true },
  { key: "almacen", nombre: "Almacén", Icon: Warehouse, manual: false },
];

const AREAS_INGRESO = ["ingreso", "ingreso_tarde"];

const UMBRAL_ALERTA_MS = 20 * 60 * 1000;
const VENTANA_MIN = 300;

const AREA_COLORS = {
  ingreso: "#f59e0b",
  ingreso_tarde: "#ea580c",
  liquidacion: "#6366f1",
  almacen: "#15803d",
};

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

function areaVacia() {
  return { entrada: null, salida: null, usuario: null };
}

function rutaVacia(ruta) {
  return {
    ruta,
    areas: {
      ingreso: areaVacia(),
      ingreso_tarde: areaVacia(),
      liquidacion: areaVacia(),
      almacen: areaVacia(),
    },
    finalizado: false,
    finalizadoTs: null,
  };
}

const EMPTY_ACTIVO = { fecha: todayStr(), rutas: {} };

/**
 * Panel de Tiempos, embebido dentro de SMART-TRACK.
 *
 * Props:
 * - identidad: texto a mostrar como "usuario" en cada marca (ej. "Gerente" o "Sulema Ponce").
 * - misAreas: arreglo con los nombres de área que esta identidad puede marcar
 *   (ej. ["Ingreso", "Ingreso tarde"] para staff, ["Liquidación"] para Sulema).
 * - onLogout: opcional, si se debe mostrar un botón de salir dentro del propio panel
 *   (para la vista exclusiva de Sulema; el staff normal ya tiene su logout aparte).
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

  // Revisa si, tras cerrar un área de ingreso, ya se puede cerrar Almacén
  // automáticamente (cuando TODAS las áreas de ingreso que sí se usaron ese
  // día ya tienen salida marcada).
  function intentarCerrarAlmacenAuto(r, ts) {
    const almacen = r.areas.almacen;
    if (!almacen.entrada || almacen.salida) return r; // no está abierto, nada que hacer

    const todasIngresoCerradas = AREAS_INGRESO.every((k) => {
      const a = r.areas[k];
      return !a.entrada || a.salida; // si no se usó, no bloquea; si se usó, debe estar cerrada
    });
    const algunaSeUso = AREAS_INGRESO.some((k) => r.areas[k].entrada);

    if (todasIngresoCerradas && algunaSeUso) {
      return {
        ...r,
        areas: { ...r.areas, almacen: { ...almacen, salida: ts, usuario: almacen.usuario || "Automático" } },
      };
    }
    return r;
  }

  function todasCompletas(r) {
    return AREAS.every((a) => r.areas[a.key].entrada && r.areas[a.key].salida);
  }

  const marcarEntrada = async (ruta, areaKey, areaNombre) => {
    if (!misAreas.includes(areaNombre)) return;
    const hoy = todayStr();
    let fresh = await fetchLatestActivo();
    if (fresh.fecha !== hoy) fresh = { fecha: hoy, rutas: {} };
    const r = fresh.rutas[ruta] || rutaVacia(ruta);
    if (r.areas[areaKey].entrada) return;
    const ts = Date.now();
    const nuevaRuta = {
      ...r,
      areas: { ...r.areas, [areaKey]: { entrada: ts, salida: null, usuario: identidad } },
    };
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

    // Automatismo 1: si se acaba de cerrar Liquidación, Almacén arranca solo.
    if (areaKey === "liquidacion" && !rutaActualizada.areas.almacen.entrada) {
      rutaActualizada = {
        ...rutaActualizada,
        areas: {
          ...rutaActualizada.areas,
          almacen: { entrada: ts, salida: null, usuario: "Automático" },
        },
      };
    }

    // Automatismo 2: si se acaba de cerrar Ingreso o Ingreso tarde, revisa si
    // eso ya permite cerrar Almacén solo.
    if (AREAS_INGRESO.includes(areaKey)) {
      rutaActualizada = intentarCerrarAlmacenAuto(rutaActualizada, ts);
    }

    const completas = todasCompletas(rutaActualizada);
    rutaActualizada = {
      ...rutaActualizada,
      finalizado: completas,
      finalizadoTs: completas ? ts : rutaActualizada.finalizadoTs,
    };

    await guardarActivo({ fecha: hoy, rutas: { ...fresh.rutas, [ruta]: rutaActualizada } });

    if (completas) {
      const freshHist = await fetchLatestHistorial();
      const registro = { fecha: hoy, ruta, areas: rutaActualizada.areas, finalizadoTs: ts };
      await guardarHistorial([registro, ...freshHist].slice(0, 300));
    }
  };

  const hoy = todayStr();
  const rutasHoy = activo.fecha === hoy ? activo.rutas : {};
  const segundosDesdeSync = lastSync ? Math.max(0, Math.floor((now - lastSync) / 1000)) : null;

  const historialOrdenado = historial
    .slice()
    .sort((a, b) => (b.fecha === a.fecha ? b.finalizadoTs - a.finalizadoTs : b.fecha.localeCompare(a.fecha)));

  const calcularPistas = (r) => {
    const entradas = AREAS.map((a) => r.areas[a.key].entrada).filter(Boolean);
    if (entradas.length === 0) return { pistas: [], hayActividad: false };
    const ventanaMs = VENTANA_MIN * 60000;
    const finVentana = now;
    const inicioVentana = finVentana - ventanaMs;
    const pistas = AREAS.map((a) => {
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
      const filasHoy = RUTAS.map((ruta) => {
        const r = rutasHoy[ruta] || rutaVacia(ruta);
        const estado = r.finalizado ? "Completa" : AREAS.some((a) => r.areas[a.key].entrada) ? "En proceso" : "Sin registrar";
        const fila = { Fecha: formatFecha(hoy), Ruta: ruta, Estado: estado };
        AREAS.forEach((a) => {
          const ar = r.areas[a.key];
          const mins = ar.entrada ? Math.round(((ar.salida || now) - ar.entrada) / 60000) : "";
          fila[`${a.nombre} entrada`] = formatHora(ar.entrada);
          fila[`${a.nombre} salida`] = formatHora(ar.salida);
          fila[`${a.nombre} min`] = mins;
          fila[`${a.nombre} usuario`] = ar.usuario || "";
        });
        return fila;
      });

      const filasHistorial = historialOrdenado.map((reg) => {
        const fila = { Fecha: formatFecha(reg.fecha), Ruta: reg.ruta };
        AREAS.forEach((a) => {
          const ar = reg.areas[a.key];
          const mins = ar.entrada && ar.salida ? Math.round((ar.salida - ar.entrada) / 60000) : "";
          fila[`${a.nombre} entrada`] = formatHora(ar.entrada);
          fila[`${a.nombre} salida`] = formatHora(ar.salida);
          fila[`${a.nombre} min`] = mins;
          fila[`${a.nombre} usuario`] = ar.usuario || "";
        });
        fila["Finalizó"] = formatHora(reg.finalizadoTs);
        return fila;
      });

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
            Ingreso · Ingreso tarde · Liquidación · Almacén (automático) · {formatFecha(hoy)}
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
          {onLogout && (
            <button className="btn-ghost" onClick={onLogout}>Salir</button>
          )}
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
          {RUTAS.map((ruta) => {
            const r = rutasHoy[ruta] || rutaVacia(ruta);
            const iniciada = AREAS.some((a) => r.areas[a.key].entrada);
            return (
              <div key={ruta} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #1E2A42" }}>
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
                </div>
                <div>
                  {AREAS.map((a) => {
                    const area = r.areas[a.key];
                    const activaAhora = area.entrada && !area.salida;
                    const completa = area.entrada && area.salida;
                    const elapsed = activaAhora ? now - area.entrada : null;
                    const alerta = elapsed != null && elapsed > UMBRAL_ALERTA_MS;
                    const esMiArea = a.manual && misAreas.includes(a.nombre);
                    return (
                      <div key={a.key} style={{ padding: "10px 14px", borderTop: "1px solid #1E2A42" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 30, height: 30, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                              background: completa ? "#0f2a20" : activaAhora ? "#2a2210" : "#141b2c",
                              border: `1px solid ${completa ? "#3DDC97" : activaAhora ? "#F2B134" : "#1E2A42"}`,
                              color: completa ? "#3DDC97" : activaAhora ? "#F2B134" : "#5b6478",
                            }}
                          >
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
                              <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: "#3DDC97" }}>
                                {formatDuration(area.salida - area.entrada)}
                              </span>
                            ) : activaAhora ? (
                              <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: alerta ? "#FF6B6B" : "#E8EDF5" }}>
                                {formatDuration(elapsed)}
                              </span>
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
          <Clock size={14} /> LÍNEA DE TIEMPO · HOY
        </div>
        <button className="btn-ghost" onClick={() => setTimelineFull(true)}>
          <Maximize2 size={13} style={{ verticalAlign: "-2px" }} /> Pantalla completa
        </button>
      </div>

      <TimelineBloque now={now} rutasHoy={rutasHoy} calcularPistas={calcularPistas} />

      {timelineFull && (
        <div style={{ position: "fixed", inset: 0, background: "#0B1220", zIndex: 9999, display: "flex", flexDirection: "column", padding: 16, boxSizing: "border-box" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="display" style={{ fontSize: 15, color: "#E8EDF5" }}>Línea de tiempo · {formatFecha(hoy)}</div>
            <button className="btn-ghost" onClick={() => setTimelineFull(false)}>
              <Minimize2 size={13} style={{ verticalAlign: "-2px" }} /> Cerrar
            </button>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            <TimelineBloque now={now} rutasHoy={rutasHoy} calcularPistas={calcularPistas} />
          </div>
        </div>
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
                  const area = reg.areas[a.key];
                  return (
                    <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: "1px solid #1E2A42", fontSize: 12 }}>
                      <a.Icon size={13} color="#9AA7BD" />
                      <span style={{ width: 100, color: "#E8EDF5" }}>{a.nombre}</span>
                      <span className="mono" style={{ fontSize: 11, color: "#9AA7BD" }}>{formatHora(area.entrada)} → {formatHora(area.salida)}</span>
                      <span className="mono" style={{ marginLeft: "auto", fontWeight: 700, color: "#3DDC97" }}>
                        {area.entrada && area.salida ? formatDuration(area.salida - area.entrada) : "—"}
                      </span>
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

function TimelineBloque({ now, rutasHoy, calcularPistas }) {
  const rutasActivas = RUTAS.map((ruta) => ({ ruta, r: rutasHoy[ruta] || rutaVacia(ruta) }))
    .map(({ ruta, r }) => ({ ruta, ...calcularPistas(r) }))
    .filter((x) => x.hayActividad);

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14, fontSize: 10, textTransform: "uppercase", fontWeight: 700, color: "#9AA7BD" }}>
        {AREAS.map((a) => (
          <span key={a.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: AREA_COLORS[a.key], display: "inline-block" }} />
            {a.nombre}
          </span>
        ))}
      </div>
      {rutasActivas.length === 0 ? (
        <p style={{ fontSize: 13, color: "#9AA7BD", textAlign: "center", padding: 16 }}>Aún no hay rutas activas hoy.</p>
      ) : (
        rutasActivas.map(({ ruta, pistas }) => (
          <div key={ruta} style={{ marginBottom: 14 }}>
            <div style={{ marginBottom: 6 }}>
              <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "#E8EDF5" }}>{ruta}</span>
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
        ))
      )}
    </div>
  );
}
