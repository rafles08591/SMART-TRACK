// @ts-nocheck
import React, { useEffect, useState } from "react";
import { MARCAS_OPEN, MARCAS_CHAMPIONS, MARCAS_DIA } from "../constants";

// Indicadores que Robotina (bot de WhatsApp) sigue. Se guardan en
// data.whatsappBot.indicadores y los lee api/wa-resumen.js.
//   retro   → sale en la retro de cada hora al grupo
//   ia      → Robotina lo conoce cuando le preguntan
//   tercera → cuenta para el rendimiento general (Tercera Mano del Pachuco)
//   peso    → valor del indicador dentro del rendimiento general
//   prioridad → Robotina le hace más énfasis (retro, chispa, Tercera Mano y respuestas)
// Deben coincidir con INDICADORES_BASE de api/wa-resumen.js.
const BASE = [
  { clave: "venta_dia", nombre: "Venta del día", unidad: "paq", def: { retro: true, ia: true, tercera: true } },
  { clave: "sin_vuala", nombre: "OTC Sin Vuala", unidad: "pz", def: { retro: true, ia: true, tercera: true } },
  { clave: "reto", nombre: "Reto del día", unidad: "paq", def: { retro: true, ia: true, tercera: true } },
  { clave: "otc_dia", nombre: "OTC del día", unidad: "$", def: { retro: false, ia: true, tercera: true } },
  { clave: "otc_semana", nombre: "OTC semanal", unidad: "$", def: { retro: false, ia: true, tercera: false } },
  { clave: "efectividad", nombre: "Efectividad de visitas", unidad: "%", def: { retro: false, ia: true, tercera: true } },
  // 1 pieza por cada 10 clientes visitados (piezas del OTC de hoy)
  { clave: "swich_visitas", nombre: "Swich (1 por cada 10 visitas)", unidad: "pz", def: { retro: true, ia: true, tercera: true, prioridad: true } },
  { clave: "vainilla_visitas", nombre: "Vualá Vainilla (1 por cada 10 visitas)", unidad: "pz", def: { retro: true, ia: true, tercera: true, prioridad: true } },
];
// Del periodo: Robotina los compara contra el ritmo esperado a la fecha.
const PERIODO = [
  { clave: "mes_max", nombre: "MAX del periodo", unidad: "paq" },
  { clave: "mes_open", nombre: "OPEN del periodo", unidad: "paq" },
  { clave: "mes_champions", nombre: "CHAMPIONS del periodo", unidad: "paq" },
];
const DEF_MARCA = { retro: false, ia: true, tercera: false };
const nomChamp = (t) => String(t || "").replace(/^CHAM[_ ]/i, "");
const DEF_RALLY = { retro: true, ia: true, tercera: true };

// Valor por defecto en el rendimiento general (igual que PESO_DEF de api/wa-resumen.js)
const PESO_DEF = { venta_dia: 3, swich_visitas: 3, vainilla_visitas: 3 };
const pesoDefDe = (clave) => PESO_DEF[clave] ?? 1;

const COLUMNAS = [
  { campo: "retro", titulo: "Retro al grupo", ayuda: "Sale en el mensaje de cada hora" },
  { campo: "ia", titulo: "Robotina lo conoce", ayuda: "Lo usa al contestar preguntas" },
  { campo: "tercera", titulo: "Tercera Mano", ayuda: "Cuenta en el rendimiento general (castigo a los 3 más bajos)" },
];

export default function IndicadoresRobotinaView({ data, persistFresco, puedeEditar = true }) {
  // Cambios locales: no se guardan hasta dar clic en "Guardar"
  const indGuardados = data?.whatsappBot?.indicadores || {};
  const retroGuardada = data?.whatsappBot?.retroGrupoActivo !== false;
  const [guardado, setLocal] = useState(indGuardados);
  const [retroActiva, setRetroActiva] = useState(retroGuardada);
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState("");

  // Si alguien más guarda y aquí no hay cambios pendientes, refrescar
  useEffect(() => {
    if (sucio) return;
    setLocal(data?.whatsappBot?.indicadores || {});
    setRetroActiva(data?.whatsappBot?.retroGrupoActivo !== false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.whatsappBot]);

  const rallies = (data?.rallyOtcs || []).filter((r) => r.activo);
  const marca = (prefijo, m, nombre) => ({ clave: `${prefijo}_${m.key}`, nombre, unidad: "paq", def: DEF_MARCA, tipo: "marca" });
  const secciones = [
    { titulo: "DEL DÍA", filas: BASE.map((b) => ({ ...b, tipo: "base" })) },
    { titulo: "MARCAS DEL DÍA", filas: (MARCAS_DIA || []).map((m) => marca("dia", m, m.label || m.key)) },
    { titulo: "DEL PERIODO (contra el ritmo esperado)", filas: PERIODO.map((p) => ({ ...p, def: DEF_MARCA, tipo: "periodo" })) },
    { titulo: "MARCAS OPEN", filas: (MARCAS_OPEN || []).map((m) => marca("open", m, m.label || m.key)) },
    { titulo: "MARCAS CHAMPIONS", filas: (MARCAS_CHAMPIONS || []).map((m) => marca("champ", m, nomChamp(m.label || m.key))) },
  ];
  const filasRally = [
    ...rallies.map((r) => ({
      clave: `rally_${r.id}`,
      nombre: `Rally ${r.nombre || "OTC"}`,
      unidad: r.unidad === "piezas" ? "pz" : "$",
      def: DEF_RALLY,
      tipo: "rally",
      exclusivo: !!r.exclusivoSupervisor1,
      vigencia: `${r.fechaInicio || "—"} → ${r.fechaFin || "—"}`,
    })),
  ];
  secciones.push({ titulo: "RALLY OTC", filas: filasRally });
  const valor = (f, campo) => {
    const g = guardado[f.clave];
    return g && typeof g[campo] === "boolean" ? g[campo] : f.def[campo];
  };

  function cambiarRetro() {
    if (!puedeEditar || guardando) return;
    setRetroActiva((v) => !v);
    setSucio(true);
    setEstado("");
  }

  function cambiar(f, campo) {
    if (!puedeEditar || guardando) return;
    setLocal((g) => {
      const previo = { ...f.def, ...(g[f.clave] || {}) };
      return { ...g, [f.clave]: { ...previo, [campo]: !previo[campo] } };
    });
    setSucio(true);
    setEstado("");
  }

  const pesoActual = (f) => {
    const p = guardado[f.clave]?.peso;
    return typeof p === "number" && p >= 0 ? p : pesoDefDe(f.clave);
  };
  function cambiarPeso(f, txt) {
    if (!puedeEditar || guardando) return;
    const num = Math.max(0, Math.min(10, Math.round(Number(String(txt).replace(/[^\d]/g, "")) || 0)));
    setLocal((g) => ({ ...g, [f.clave]: { ...f.def, ...(g[f.clave] || {}), peso: num } }));
    setSucio(true);
    setEstado("");
  }

  function descartar() {
    setLocal(indGuardados);
    setRetroActiva(retroGuardada);
    setSucio(false);
    setEstado("");
  }

  async function guardar() {
    if (!puedeEditar || guardando || !sucio) return;
    setGuardando(true);
    setEstado("Guardando…");
    try {
      await persistFresco((fresca) => ({
        whatsappBot: { ...(fresca.whatsappBot || {}), indicadores: guardado, retroGrupoActivo: retroActiva },
      }));
      setSucio(false);
      setEstado("✅ Guardado. Robotina ya usa estos indicadores.");
    } catch (err) {
      setEstado("❌ No se pudo guardar: " + (err?.message || err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <div className="display" style={{ fontSize: 14, color: "#E8EDF5", marginBottom: 4 }}>🤖 INDICADORES DE ROBOTINA</div>
      <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 14 }}>
        Prende o apaga qué sigue Robotina y da clic en <b>Guardar</b> al final. Los cambios aplican desde la siguiente retro o pregunta.
        Los rallies activos aparecen solos aquí.
      </div>
      <div style={{ fontSize: 12, color: "#cbd5e1", background: "#131c2e", border: "1px solid #1E2A42", borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
        🖐️ <b>Tercera Mano del Pachuco = castigo.</b> Se calcula con el <b>rendimiento general</b>: el cumplimiento de cada indicador
        prendido en "Tercera Mano" (tope 100%) por su <b>Valor</b>. Se salvan las <b>3 mejores</b> y quien pase de <b>60%</b>.
        A más valor, más pesa ese indicador (0 = no cuenta).
      </div>
      <button
        disabled={!puedeEditar || guardando}
        onClick={cambiarRetro}
        style={{ display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "1px solid #1E2A42", borderRadius: 10, padding: "10px 12px", marginBottom: 14, cursor: puedeEditar ? "pointer" : "not-allowed", width: "100%", textAlign: "left" }}
      >
        <span style={{ width: 46, height: 24, borderRadius: 12, position: "relative", background: retroActiva ? "#3DDC97" : "#2A3550", flexShrink: 0 }}>
          <span style={{ position: "absolute", top: 3, left: retroActiva ? 25 : 3, width: 18, height: 18, borderRadius: 9, background: "#0B1220", transition: "left .15s" }} />
        </span>
        <span style={{ fontSize: 13, color: retroActiva ? "#E8EDF5" : "#9AA7BD" }}>
          🔥 Retro al grupo cada hora (9 am – 8 pm, lun–sáb) {retroActiva ? "· ACTIVA" : "· APAGADA"}
        </span>
      </button>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "#9AA7BD", textAlign: "left" }}>
              <th style={{ padding: "8px 10px" }}>Indicador</th>
              {COLUMNAS.map((c) => (
                <th key={c.campo} title={c.ayuda} style={{ padding: "8px 10px", textAlign: "center", whiteSpace: "nowrap" }}>{c.titulo}</th>
              ))}
              <th title="Cuánto pesa en el rendimiento general" style={{ padding: "8px 10px", textAlign: "center", whiteSpace: "nowrap" }}>Valor</th>
            </tr>
          </thead>
          {secciones.filter((sec) => sec.filas.length).map((sec) => (
          <tbody key={sec.titulo}>
            <tr>
              <td colSpan={2 + COLUMNAS.length} className="display" style={{ padding: "14px 10px 6px", fontSize: 11, color: "#5AA9E6" }}>{sec.titulo}</td>
            </tr>
            {sec.filas.map((f) => (
              <tr key={f.clave} style={{ borderTop: "1px solid #1E2A42" }}>
                <td style={{ padding: "10px" }}>
                  <div style={{ color: "#E8EDF5", fontWeight: 600 }}>
                    {f.nombre} <span style={{ color: "#5b6478", fontWeight: 400 }}>({f.unidad})</span>
                  </div>
                  {f.tipo === "rally" && (
                    <div style={{ fontSize: 11, color: "#9AA7BD" }}>
                      {f.vigencia}
                      {f.exclusivo && <span style={{ color: "#5AA9E6" }}> · exclusivo Supervisor-1: nunca sale al grupo ni a vendedores</span>}
                    </div>
                  )}
                </td>
                {COLUMNAS.map((c) => {
                  const bloqueado = f.exclusivo && c.campo !== "ia";
                  const on = !bloqueado && valor(f, c.campo);
                  return (
                    <td key={c.campo} style={{ textAlign: "center", padding: "8px" }}>
                      <button
                        disabled={!puedeEditar || bloqueado || guardando}
                        onClick={() => cambiar(f, c.campo)}
                        title={bloqueado ? "Los rallies exclusivos no se comparten con el grupo" : c.ayuda}
                        style={{
                          width: 46, height: 24, borderRadius: 12, border: "none", position: "relative",
                          cursor: !puedeEditar || bloqueado ? "not-allowed" : "pointer",
                          background: on ? "#3DDC97" : "#2A3550", opacity: bloqueado ? 0.35 : 1, transition: "background .15s",
                        }}
                      >
                        <span style={{
                          position: "absolute", top: 3, left: on ? 25 : 3, width: 18, height: 18, borderRadius: 9,
                          background: "#0B1220", transition: "left .15s",
                        }} />
                      </button>
                    </td>
                  );
                })}
                <td style={{ textAlign: "center", padding: "8px" }}>
                  {!(f.exclusivo) && valor(f, "tercera") ? (
                    <input
                      type="number" inputMode="numeric" min={0} max={10}
                      value={pesoActual(f)}
                      disabled={!puedeEditar || guardando}
                      onChange={(e) => cambiarPeso(f, e.target.value)}
                      style={{ width: 52, padding: "4px 6px", borderRadius: 8, border: "1px solid #334155", background: "#0B1220", color: "#E8EDF5", textAlign: "center", fontWeight: 700 }}
                    />
                  ) : (
                    <span style={{ color: "#5b6478" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          ))}
        </table>
      </div>
      <TableroPrioridad
        secciones={secciones}
        activo={(f) => !f.exclusivo && !!valor(f, "prioridad")}
        onCambiar={(f) => cambiar(f, "prioridad")}
        deshabilitado={!puedeEditar || guardando}
      />
      {rallies.length === 0 && (
        <div style={{ fontSize: 11, color: "#5b6478", marginTop: 10 }}>
          No hay rallies activos. Cuando actives uno en la pestaña RALLY OTC aparecerá aquí.
        </div>
      )}
      {puedeEditar && (
        <div style={{ position: "sticky", bottom: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 16, padding: "12px 0 4px", background: "linear-gradient(transparent, #0e1626 30%)" }}>
          <button
            onClick={guardar}
            disabled={!sucio || guardando}
            style={{ padding: "10px 22px", borderRadius: 12, border: "none", fontWeight: 800, cursor: sucio ? "pointer" : "default", background: "#22c55e", color: "#04130a", opacity: sucio && !guardando ? 1 : 0.45 }}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          {sucio && !guardando && (
            <button onClick={descartar} style={{ padding: "10px 16px", borderRadius: 12, border: "1px solid #334155", background: "transparent", color: "#cbd5e1", cursor: "pointer" }}>
              Descartar cambios
            </button>
          )}
          <span style={{ fontSize: 12, color: sucio ? "#f59e0b" : "#9AA7BD" }}>
            {sucio ? "Tienes cambios sin guardar" : estado}
          </span>
        </div>
      )}
    </div>
  );
}

// 🎯 Tablero de PRIORIDAD: los indicadores prendidos aquí son el foco de Robotina
// (la retro los pone arriba, la chispa los empuja con nombre y números, y el consejo
// para salvarse de la Tercera Mano empieza por ellos).
function TableroPrioridad({ secciones, activo, onCambiar, deshabilitado }) {
  const prendidos = secciones.flatMap((s) => s.filas).filter(activo);
  return (
    <div style={{ marginTop: 22, border: "1px solid #3b3415", background: "linear-gradient(180deg, #1b1a10, #111827)", borderRadius: 14, padding: 16 }}>
      <div className="display" style={{ fontSize: 14, color: "#FACC15", marginBottom: 4 }}>🎯 PRIORIDAD DE ROBOTINA</div>
      <div style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 12 }}>
        Prende los indicadores a los que Robotina les debe dar <b>más énfasis</b>: salen arriba en la retro (“Prioridad de hoy” con quién va
        atrasado), la chispa los empuja con nombre y números, y el consejo para salvarse de la Tercera Mano empieza por ellos.
        Cambia el foco cuando quieras y da <b>Guardar</b>.
      </div>
      <div style={{ fontSize: 12, color: prendidos.length ? "#FACC15" : "#9AA7BD", marginBottom: 12, fontWeight: 700 }}>
        {prendidos.length ? `⭐ Foco actual: ${prendidos.map((f) => f.nombre.replace(/ \(1 por cada 10 visitas\)/, "")).join(" · ")}` : "Sin prioridad: Robotina trata todos los indicadores igual."}
      </div>
      {secciones.filter((s) => s.filas.length).map((sec) => (
        <div key={sec.titulo} style={{ marginBottom: 12 }}>
          <div className="display" style={{ fontSize: 11, color: "#5AA9E6", margin: "4px 0 8px" }}>{sec.titulo}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
            {sec.filas.map((f) => {
              const on = activo(f);
              const bloqueado = !!f.exclusivo;
              return (
                <button
                  key={f.clave}
                  disabled={deshabilitado || bloqueado}
                  onClick={() => onCambiar(f)}
                  title={bloqueado ? "Los rallies exclusivos no se comparten con el grupo" : on ? "Quitar de la prioridad" : "Darle prioridad"}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "10px 12px", borderRadius: 12,
                    border: `1px solid ${on ? "#FACC15" : "#1E2A42"}`, background: on ? "rgba(250,204,21,0.14)" : "#0B1220",
                    color: on ? "#FDE68A" : "#cbd5e1", fontWeight: on ? 800 : 500, fontSize: 13,
                    cursor: deshabilitado || bloqueado ? "not-allowed" : "pointer", opacity: bloqueado ? 0.35 : 1,
                    boxShadow: on ? "0 0 12px rgba(250,204,21,0.25)" : "none", transition: "all .15s",
                  }}
                >
                  <span style={{ fontSize: 16 }}>{on ? "⭐" : "☆"}</span>
                  <span>{f.nombre} <span style={{ color: on ? "#facc15aa" : "#5b6478", fontWeight: 400 }}>({f.unidad})</span></span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
