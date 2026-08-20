// @ts-nocheck
import React, { useMemo, useState } from "react";
import {
  Users, Milestone, MessageSquare, Sparkles, Trash2, TrendingDown,
} from "lucide-react";
import { NOMBRES } from "../constants";
import { fmt, todayISO } from "../utils";
import { construirPeldanos, COLOR_GRUPO } from "./EscaleraView";

function colorEfectividad(p) {
  if (p >= 90) return "#3DDC97";
  if (p >= 60) return "#F2B134";
  return "#FF6B6B";
}
function etiquetaEfectividad(p) {
  if (p >= 90) return "Bien";
  if (p >= 60) return "Regular";
  return "Bajo";
}

// Mini-escalera de solo lectura para las tarjetas de la vista grupal: una
// barra por peldaño, verde si ya se conquistó hoy, gris si sigue pendiente.
function MiniEscalera({ peldanos }) {
  if (peldanos.length === 0) return <div style={{ fontSize: 11, color: "#6C7A96" }}>Sin objetivos de hoy</div>;
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 22 }}>
      {peldanos.map((p, i) => (
        <div
          key={p.id}
          title={`${p.label}: ${p.pct.toFixed(0)}%`}
          style={{
            flex: 1, minWidth: 10, height: 8 + i * 3, borderRadius: 3,
            background: p.pct >= 100 ? "#3DDC97" : "#1E2A42",
            border: p.pct >= 100 ? "none" : "1px solid #2A3852",
          }}
        />
      ))}
    </div>
  );
}

export default function EscaleraStaffView({ data, persistFresco, stats, revisorNombre }) {
  const [vista, setVista] = useState("grupal"); // "grupal" | "ruta"
  const [rutaSeleccionada, setRutaSeleccionada] = useState(stats.porVendedor[0]?.name || "");
  const [textoObs, setTextoObs] = useState("");

  const filas = useMemo(() => {
    return (stats.porVendedor || [])
      .map((v) => {
        const peldanos = construirPeldanos(v);
        const conquistados = peldanos.filter((p) => p.pct >= 100).length;
        return {
          vendedor: v,
          peldanos,
          conquistados,
          totalPeldanos: peldanos.length,
          efectividadPct: v.hoy?.efectividadPct ?? 0,
          indicadoresDebiles: v.hoy?.indicadoresDebiles || [],
        };
      })
      .sort((a, b) => a.efectividadPct - b.efectividadPct);
  }, [stats.porVendedor]);

  const filaSeleccionada = filas.find((f) => f.vendedor.name === rutaSeleccionada) || filas[0];
  const observacionesRuta = filaSeleccionada ? (data.escaleraObservaciones?.[filaSeleccionada.vendedor.name] || []) : [];

  function guardarObservacion() {
    if (!textoObs.trim() || !filaSeleccionada) return;
    const rutaNombre = filaSeleccionada.vendedor.name;
    persistFresco((fresca) => {
      const actual = fresca.escaleraObservaciones || {};
      const propias = actual[rutaNombre] || [];
      const nueva = {
        id: "obs" + Date.now(),
        fecha: todayISO(),
        autor: revisorNombre,
        texto: textoObs.trim(),
        efectividadPct: Math.round(filaSeleccionada.efectividadPct),
      };
      return { escaleraObservaciones: { ...actual, [rutaNombre]: [nueva, ...propias].slice(0, 20) } };
    });
    setTextoObs("");
  }

  function borrarObservacion(rutaNombre, id) {
    persistFresco((fresca) => {
      const actual = fresca.escaleraObservaciones || {};
      const propias = (actual[rutaNombre] || []).filter((o) => o.id !== id);
      return { escaleraObservaciones: { ...actual, [rutaNombre]: propias } };
    });
  }

  // Arma un borrador de retroalimentación a partir de los indicadores
  // débiles REALES de hoy (los mismos que usa la alerta de bajo desempeño).
  // El supervisor/gerente puede editarlo libremente antes de guardar.
  function sugerirTexto() {
    if (!filaSeleccionada) return;
    const { vendedor, efectividadPct, indicadoresDebiles } = filaSeleccionada;
    const nombre = NOMBRES[vendedor.name] || vendedor.name;
    let texto = `${nombre}, hoy vas en ${Math.round(efectividadPct)}% de efectividad en tus indicadores del día.`;
    if (indicadoresDebiles.length > 0) {
      const top = indicadoresDebiles
        .slice(0, 3)
        .map((ind) => `${ind.label} (te faltan ${ind.unidad === "$" ? "$" + Math.round(ind.faltante).toLocaleString("es-MX") : Math.round(ind.faltante) + " paq."})`)
        .join(", ");
      texto += ` Enfócate hoy en: ${top}.`;
    } else {
      texto += " ¡Vas muy bien, sigue así!";
    }
    setTextoObs(texto);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button className={vista === "grupal" ? "btn" : "btn-ghost"} style={{ fontSize: 12.5 }} onClick={() => setVista("grupal")}>
          <Users size={13} style={{ verticalAlign: "-2px" }} /> Grupal
        </button>
        <button className={vista === "ruta" ? "btn" : "btn-ghost"} style={{ fontSize: 12.5 }} onClick={() => setVista("ruta")}>
          <Milestone size={13} style={{ verticalAlign: "-2px" }} /> Por ruta
        </button>
      </div>

      {vista === "grupal" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: "#9AA7BD" }}>
            Escalera de hoy de cada ruta, ordenadas de menor a mayor efectividad — para detectar primero a quién apoyar.
          </div>
          {filas.map((f) => (
            <button
              key={f.vendedor.id}
              className="card"
              style={{ padding: 14, textAlign: "left", cursor: "pointer", border: `1px solid ${colorEfectividad(f.efectividadPct)}44` }}
              onClick={() => { setRutaSeleccionada(f.vendedor.name); setVista("ruta"); }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{f.vendedor.name}{NOMBRES[f.vendedor.name] ? ` · ${NOMBRES[f.vendedor.name]}` : ""}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: colorEfectividad(f.efectividadPct), whiteSpace: "nowrap" }}>
                  {etiquetaEfectividad(f.efectividadPct)} · {Math.round(f.efectividadPct)}%
                </span>
              </div>
              <MiniEscalera peldanos={f.peldanos} />
              <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 8 }}>
                {f.conquistados} de {f.totalPeldanos} peldaños conquistados hoy
                {f.indicadoresDebiles.length > 0 && (
                  <span style={{ color: "#FF6B6B" }}> · le falta en {f.indicadoresDebiles[0].label}</span>
                )}
              </div>
            </button>
          ))}
          {filas.length === 0 && (
            <div className="card" style={{ padding: 24, textAlign: "center", color: "#9AA7BD", fontSize: 13 }}>No hay rutas cargadas todavía.</div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <select value={rutaSeleccionada} onChange={(e) => setRutaSeleccionada(e.target.value)} style={{ width: "100%" }}>
            {stats.porVendedor.map((v) => (
              <option key={v.id} value={v.name}>{v.name}{NOMBRES[v.name] ? ` — ${NOMBRES[v.name]}` : ""}</option>
            ))}
          </select>

          {filaSeleccionada && (
            <>
              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                  <div className="display" style={{ fontSize: 14 }}>ESCALERA DE HOY</div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: colorEfectividad(filaSeleccionada.efectividadPct) }}>
                    {etiquetaEfectividad(filaSeleccionada.efectividadPct)} · {Math.round(filaSeleccionada.efectividadPct)}% efectividad
                  </span>
                </div>

                {filaSeleccionada.peldanos.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#9AA7BD" }}>Esta ruta no tiene objetivos del día cargados.</div>
                ) : (
                  filaSeleccionada.peldanos.map((p) => (
                    <div key={p.id} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: "#E8EDF5" }}>{p.label}</span>
                        <span style={{ color: p.pct >= 100 ? "#3DDC97" : "#9AA7BD" }}>{fmt(p.unit, p.avance)} / {fmt(p.unit, p.objetivo)}</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 5, background: "#0F172A", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(p.pct, 100)}%`, background: p.pct >= 100 ? "#3DDC97" : (COLOR_GRUPO[p.grupo] || "#F2B134"), transition: "width .4s" }} />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {filaSeleccionada.indicadoresDebiles.length > 0 && (
                <div className="card" style={{ padding: 16, border: "1px solid #FF6B6B" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <TrendingDown size={15} color="#FF6B6B" />
                    <span className="display" style={{ fontSize: 13, color: "#FF6B6B" }}>DÓNDE VA MÁS ATRÁS HOY</span>
                  </div>
                  {filaSeleccionada.indicadoresDebiles.slice(0, 4).map((ind, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#E8EDF5", padding: "6px 0", borderTop: i > 0 ? "1px solid #1E2A42" : "none" }}>
                      <span>{ind.label}</span>
                      <span style={{ color: "#FF6B6B" }}>Faltan {ind.unidad === "$" ? "$" + Math.round(ind.faltante).toLocaleString("es-MX") : `${Math.round(ind.faltante)} paq.`}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <MessageSquare size={15} color="#7CC4FF" />
                  <span className="display" style={{ fontSize: 13, color: "#9AA7BD" }}>RETROALIMENTACIÓN PARA ESTA RUTA</span>
                </div>
                <textarea
                  value={textoObs}
                  onChange={(e) => setTextoObs(e.target.value)}
                  placeholder="Escribe una observación para esta ruta (la verá en su pestaña ESCALERA)..."
                  rows={3}
                  style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 13, resize: "vertical", color: "#000000", background: "#FFFFFF" }}
                />
                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <button className="btn-ghost" onClick={sugerirTexto}>
                    <Sparkles size={13} style={{ verticalAlign: "-2px" }} /> Sugerir texto según su desempeño
                  </button>
                  <button className="btn" onClick={guardarObservacion} disabled={!textoObs.trim()}>
                    Guardar observación
                  </button>
                </div>

                {observacionesRuta.length > 0 && (
                  <div style={{ marginTop: 16, borderTop: "1px solid #1E2A42", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                    {observacionesRuta.map((o) => (
                      <div key={o.id} style={{ fontSize: 12.5, color: "#C6CFE0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ color: "#9AA7BD", fontSize: 11 }}>{o.autor} · {o.fecha} · {o.efectividadPct}% ese día</span>
                          {o.autor === revisorNombre && (
                            <button className="btn-ghost" style={{ padding: "2px 6px" }} onClick={() => borrarObservacion(filaSeleccionada.vendedor.name, o.id)}>
                              <Trash2 size={12} color="#FF6B6B" />
                            </button>
                          )}
                        </div>
                        <div style={{ whiteSpace: "pre-wrap", marginTop: 2 }}>{o.texto}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
