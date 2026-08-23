// @ts-nocheck
import React, { useMemo, useState } from "react";
import {
  Users, Milestone, MessageSquare, Sparkles, Trash2, TrendingDown, History, Target, Plus, Power, RotateCcw,
} from "lucide-react";
import { NOMBRES, RUTAS } from "../constants";
import { fmt, todayISO } from "../utils";
import { construirPeldanos, COLOR_GRUPO } from "./EscaleraView";

// Días anteriores guardados por EscaleraView (resultado real, independiente
// de si el vendedor ya reinició su escalera con los objetivos de hoy). Se
// excluye la fecha de hoy porque esa ya se muestra en vivo arriba.
function HistorialEscaleraRuta({ historial, fechaHoy }) {
  const [abierto, setAbierto] = useState(false);
  const fechas = Object.keys(historial).filter((f) => f !== fechaHoy).sort().reverse().slice(0, 14);

  if (fechas.length === 0) return null;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <button
        onClick={() => setAbierto((v) => !v)}
        style={{ width: "100%", padding: 16, textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", border: "none", background: "transparent", cursor: "pointer" }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#9AA7BD" }}>
          <History size={15} color="#9AA7BD" /> HISTORIAL DE DÍAS ANTERIORES
        </span>
        <span style={{ fontSize: 11, color: "#6C7A96" }}>{abierto ? "ocultar" : `${fechas.length} días`}</span>
      </button>
      {abierto && (
        <div style={{ padding: "0 16px 16px" }}>
          {fechas.map((f, i) => {
            const h = historial[f];
            const pct = h.total > 0 ? Math.round((h.conquistados / h.total) * 100) : 0;
            return (
              <div key={f} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: i > 0 ? "1px solid #1E2A42" : "none" }}>
                <span style={{ fontSize: 12, color: "#E8EDF5" }}>{f}</span>
                <span style={{ fontSize: 12, color: colorEfectividad(h.efectividadPct ?? pct) }}>
                  {h.conquistados}/{h.total} peldaños{h.efectividadPct != null ? ` · ${Math.round(h.efectividadPct)}% efectividad` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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

const TIPO_LABEL = { venta: "Venta general", otc: "OTC", visitas: "Visitas efectivas" };
const TIPO_UNIDAD_TEXTO = { venta: "paquetes", otc: "pesos ($)", visitas: "visitas" };

// Panel de administración de objetivos manuales — exclusivo de Supervisor-1
// y Gerente. Cada objetivo se aplica a 1, varias o todas las rutas, y en
// la Escalera de cada vendedor aparece como su PRIMER peldaño (antes que
// los automáticos), con avance calculado en tiempo real desde App.tsx.
function ObjetivosManualesPanel({ data, persistFresco, revisorNombre, stats }) {
  const objetivos = data.escaleraObjetivosManuales || [];
  const [mostrarForm, setMostrarForm] = useState(false);
  const vacio = { tipo: "venta", nombre: "", articulosTexto: "", rutas: "todas", rutasEspecificas: [], objetivo: "", detalles: "" };
  const [form, setForm] = useState(vacio);

  function actualizar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function alternarRuta(ruta) {
    setForm((f) => {
      const set = new Set(f.rutasEspecificas);
      if (set.has(ruta)) set.delete(ruta); else set.add(ruta);
      return { ...f, rutasEspecificas: Array.from(set) };
    });
  }

  function guardar() {
    if (!form.nombre.trim() || !form.objetivo || Number(form.objetivo) <= 0) return;
    if (form.rutas === "especificas" && form.rutasEspecificas.length === 0) return;
    const articulos = form.articulosTexto.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    const nuevo = {
      id: "obj" + Date.now(),
      tipo: form.tipo,
      nombre: form.nombre.trim(),
      articulos,
      rutas: form.rutas === "todas" ? "todas" : form.rutasEspecificas,
      objetivo: Number(form.objetivo),
      detalles: form.detalles.trim(),
      activo: true,
      creadoPor: revisorNombre,
      fechaCreado: todayISO(),
    };
    persistFresco((fresca) => ({
      escaleraObjetivosManuales: [...(fresca.escaleraObjetivosManuales || []), nuevo],
    }));
    setForm(vacio);
    setMostrarForm(false);
  }

  function alternarActivo(id) {
    persistFresco((fresca) => ({
      escaleraObjetivosManuales: (fresca.escaleraObjetivosManuales || []).map((o) => (o.id === id ? { ...o, activo: !o.activo } : o)),
    }));
  }

  function eliminar(id, nombre) {
    if (!window.confirm(`¿Eliminar el objetivo "${nombre}"? Esto no se puede deshacer.`)) return;
    persistFresco((fresca) => ({
      escaleraObjetivosManuales: (fresca.escaleraObjetivosManuales || []).filter((o) => o.id !== id),
    }));
  }

  // "Reiniciar a 0" — no toca ninguna venta real. Solo guarda, por cada
  // ruta a la que aplica este objetivo, cuál era su avance real en este
  // momento (el "punto de reinicio"). A partir de ahí, la Escalera del
  // vendedor le resta ese punto al avance real y le muestra 0 — como si
  // arrancara de nuevo, sin borrar ni alterar ninguna venta.
  function reiniciarAvance(o) {
    if (!window.confirm(`¿Reiniciar el avance de "${o.nombre}" a 0 para todas las rutas donde aplica? Esto no borra ni altera ninguna venta real, solo el contador que ve el vendedor en su Escalera.`)) return;
    const todasLasRutas = (stats?.porVendedor || []).map((v) => v.name);
    const rutasAplicables = o.rutas === "todas" ? todasLasRutas : o.rutas;
    // Los avances de HOY sí se capturan ahora mismo (son una foto del
    // momento del clic, no dependen de qué tan fresco esté lo demás).
    const avancesActuales = {};
    rutasAplicables.forEach((rutaNombre) => {
      const v = (stats?.porVendedor || []).find((vv) => vv.name === rutaNombre);
      const entradaHoy = v?.hoy?.objetivosManuales?.find((om) => om.id === o.id);
      // Guarda el avance REAL crudo (tal cual viene de App.tsx, sin restar
      // reinicios previos) — así, sin importar cuántas veces se reinicie,
      // el cálculo (avance real - punto de reinicio) siempre da 0 justo
      // después de reiniciar.
      avancesActuales[rutaNombre] = entradaHoy ? entradaHoy.avance : 0;
    });
    // Pero los reinicios que YA EXISTÍAN para otras rutas de este mismo
    // objetivo (los pudo haber puesto otro Supervisor-1/Gerente hace un
    // segundo) se leen de la versión FRESCA justo antes de guardar, no de
    // lo que esta pantalla ya tenía cargado — así nunca se pisa el
    // reinicio de alguien más si dos personas usan esto casi a la vez.
    persistFresco((fresca) => {
      const actual = (fresca.escaleraObjetivosManuales || []).find((x) => x.id === o.id);
      const reiniciosFrescos = { ...(actual?.reinicios || {}), ...avancesActuales };
      return {
        escaleraObjetivosManuales: (fresca.escaleraObjetivosManuales || []).map((x) =>
          x.id === o.id ? { ...x, reinicios: reiniciosFrescos } : x
        ),
      };
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12, color: "#9AA7BD" }}>
        Estos objetivos aparecen como el <strong style={{ color: "#C084FC" }}>primer peldaño</strong> en la Escalera de cada ruta a la que aplican, antes que sus objetivos automáticos del día — con avance real, no manual.
      </div>

      {!mostrarForm ? (
        <button className="btn" style={{ alignSelf: "flex-start" }} onClick={() => setMostrarForm(true)}>
          <Plus size={14} style={{ verticalAlign: "-2px" }} /> Nuevo objetivo manual
        </button>
      ) : (
        <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10.5, color: "#9AA7BD", marginBottom: 4 }}>TIPO DE OBJETIVO</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(TIPO_LABEL).map(([key, label]) => (
                <button key={key} className={form.tipo === key ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => actualizar("tipo", key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10.5, color: "#9AA7BD", marginBottom: 4 }}>NOMBRE DEL OBJETIVO</div>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => actualizar("nombre", e.target.value)}
              placeholder='Ej. "Empuje Faronet quincena", "Meta especial cliente X"'
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13 }}
            />
          </div>

          {form.tipo !== "visitas" && (
            <div>
              <div style={{ fontSize: 10.5, color: "#9AA7BD", marginBottom: 4 }}>
                CÓDIGO(S) DE PRODUCTO (opcional — separados por coma. Si lo dejas vacío, cuenta {form.tipo === "otc" ? "todo el OTC del día" : "toda la venta del día"})
              </div>
              <input
                type="text"
                value={form.articulosTexto}
                onChange={(e) => actualizar("articulosTexto", e.target.value)}
                placeholder="Ej. FA04016, FA04017, FA15010"
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13 }}
              />
            </div>
          )}

          <div>
            <div style={{ fontSize: 10.5, color: "#9AA7BD", marginBottom: 4 }}>RUTAS A APLICAR</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: form.rutas === "especificas" ? 8 : 0 }}>
              <button className={form.rutas === "todas" ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => actualizar("rutas", "todas")}>
                Todas las rutas
              </button>
              <button className={form.rutas === "especificas" ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => actualizar("rutas", "especificas")}>
                Elegir rutas
              </button>
            </div>
            {form.rutas === "especificas" && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {RUTAS.map((r) => (
                  <button
                    key={r}
                    className={form.rutasEspecificas.includes(r) ? "btn" : "btn-ghost"}
                    style={{ fontSize: 11.5, padding: "5px 10px" }}
                    onClick={() => alternarRuta(r)}
                  >
                    {r.replace("RUTA ", "")}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 10.5, color: "#9AA7BD", marginBottom: 4 }}>NÚMERO OBJETIVO ({TIPO_UNIDAD_TEXTO[form.tipo]})</div>
            <input
              type="number"
              value={form.objetivo}
              onChange={(e) => actualizar("objetivo", e.target.value)}
              placeholder="0"
              style={{ width: 140, boxSizing: "border-box", padding: "8px 10px", fontSize: 13 }}
            />
          </div>

          <div>
            <div style={{ fontSize: 10.5, color: "#9AA7BD", marginBottom: 4 }}>DETALLES PARA EL VENDEDOR (opcional — se muestra como tip de este peldaño)</div>
            <textarea
              value={form.detalles}
              onChange={(e) => actualizar("detalles", e.target.value)}
              rows={2}
              placeholder="Ej. Este mes hay bono extra si se logra este objetivo..."
              style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 13, resize: "vertical", color: "#000000", background: "#FFFFFF" }}
            />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" onClick={guardar}>Guardar objetivo</button>
            <button className="btn-ghost" onClick={() => { setForm(vacio); setMostrarForm(false); }}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {objetivos.length === 0 && !mostrarForm && (
          <div className="card" style={{ padding: 24, textAlign: "center", color: "#9AA7BD", fontSize: 13 }}>Todavía no hay objetivos manuales creados.</div>
        )}
        {objetivos.map((o) => (
          <div key={o.id} className="card" style={{ padding: 14, opacity: o.activo === false ? 0.55 : 1, border: "1px solid #C084FC44" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#E8EDF5" }}>{o.nombre}</div>
                <div style={{ fontSize: 11, color: "#9AA7BD" }}>
                  {TIPO_LABEL[o.tipo]} · {o.objetivo.toLocaleString("es-MX")} {TIPO_UNIDAD_TEXTO[o.tipo]} · {o.rutas === "todas" ? "Todas las rutas" : o.rutas.map((r) => r.replace("RUTA ", "")).join(", ")}
                  {o.articulos && o.articulos.length > 0 && ` · códigos: ${o.articulos.join(", ")}`}
                </div>
                {o.detalles && <div style={{ fontSize: 11.5, color: "#C6CFE0", marginTop: 4 }}>{o.detalles}</div>}
                <div style={{ fontSize: 10, color: "#6C7A96", marginTop: 4 }}>
                  Creado por {o.creadoPor} · {o.fechaCreado}{o.activo === false ? " · INACTIVO" : ""}
                  {o.reinicios && Object.keys(o.reinicios).length > 0 && ` · reiniciado en ${Object.keys(o.reinicios).length} ruta${Object.keys(o.reinicios).length === 1 ? "" : "s"}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button className="btn-ghost" style={{ padding: "5px 8px" }} title="Reiniciar avance a 0" onClick={() => reiniciarAvance(o)}>
                  <RotateCcw size={13} color="#F2B134" />
                </button>
                <button className="btn-ghost" style={{ padding: "5px 8px" }} title={o.activo === false ? "Reactivar" : "Desactivar"} onClick={() => alternarActivo(o.id)}>
                  <Power size={13} color={o.activo === false ? "#9AA7BD" : "#3DDC97"} />
                </button>
                <button className="btn-ghost" style={{ padding: "5px 8px" }} title="Eliminar" onClick={() => eliminar(o.id, o.nombre)}>
                  <Trash2 size={13} color="#FF6B6B" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
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
        const peldanos = construirPeldanos(v, data.escaleraObjetivosManuales);
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
  }, [stats.porVendedor, data.escaleraObjetivosManuales]);

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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className={vista === "grupal" ? "btn" : "btn-ghost"} style={{ fontSize: 12.5 }} onClick={() => setVista("grupal")}>
          <Users size={13} style={{ verticalAlign: "-2px" }} /> Grupal
        </button>
        <button className={vista === "ruta" ? "btn" : "btn-ghost"} style={{ fontSize: 12.5 }} onClick={() => setVista("ruta")}>
          <Milestone size={13} style={{ verticalAlign: "-2px" }} /> Por ruta
        </button>
        <button className={vista === "objetivos" ? "btn" : "btn-ghost"} style={{ fontSize: 12.5 }} onClick={() => setVista("objetivos")}>
          <Target size={13} style={{ verticalAlign: "-2px" }} /> Objetivos manuales
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
                <div style={{ fontSize: 13, fontWeight: 700, color: "#E8EDF5" }}>{f.vendedor.name}{NOMBRES[f.vendedor.name] ? ` · ${NOMBRES[f.vendedor.name]}` : ""}</div>
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
      ) : vista === "ruta" ? (
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

              <HistorialEscaleraRuta historial={data.escaleraHistorial?.[filaSeleccionada.vendedor.name] || {}} fechaHoy={filaSeleccionada.vendedor.hoy?.fecha} />

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
      ) : (
        <ObjetivosManualesPanel data={data} persistFresco={persistFresco} revisorNombre={revisorNombre} stats={stats} />
      )}
    </div>
  );
}
