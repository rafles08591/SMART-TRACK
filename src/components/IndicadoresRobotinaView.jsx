// @ts-nocheck
import React, { useState } from "react";
import { MARCAS_OPEN, MARCAS_CHAMPIONS, MARCAS_DIA } from "../constants";

// Indicadores que Robotina (bot de WhatsApp) sigue. Se guardan en
// data.whatsappBot.indicadores y los lee api/wa-resumen.js.
//   retro   → sale en la retro de cada hora al grupo
//   ia      → Robotina lo conoce cuando le preguntan
//   tercera → cuenta para elegir candidatos a La Tercera Mano del Pachuco
// Deben coincidir con INDICADORES_BASE de api/wa-resumen.js.
const BASE = [
  { clave: "venta_dia", nombre: "Venta del día", unidad: "paq", def: { retro: true, ia: true, tercera: true } },
  { clave: "sin_vuala", nombre: "OTC Sin Vuala", unidad: "pz", def: { retro: true, ia: true, tercera: true } },
  { clave: "reto", nombre: "Reto del día", unidad: "paq", def: { retro: true, ia: true, tercera: true } },
  { clave: "otc_dia", nombre: "OTC del día", unidad: "$", def: { retro: false, ia: true, tercera: false } },
  { clave: "otc_semana", nombre: "OTC semanal", unidad: "$", def: { retro: false, ia: true, tercera: false } },
  { clave: "efectividad", nombre: "Efectividad de visitas", unidad: "%", def: { retro: false, ia: true, tercera: false } },
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

const COLUMNAS = [
  { campo: "retro", titulo: "Retro al grupo", ayuda: "Sale en el mensaje de cada hora" },
  { campo: "ia", titulo: "Robotina lo conoce", ayuda: "Lo usa al contestar preguntas" },
  { campo: "tercera", titulo: "Tercera Mano", ayuda: "Cuenta para elegir a los 3 más bajos" },
];

export default function IndicadoresRobotinaView({ data, persistFresco, puedeEditar = true }) {
  const guardado = data?.whatsappBot?.indicadores || {};
  const [guardando, setGuardando] = useState(false);

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

  async function cambiar(f, campo) {
    if (!puedeEditar || guardando) return;
    setGuardando(true);
    try {
      await persistFresco((fresca) => {
        const bot = fresca.whatsappBot || {};
        const actual = bot.indicadores || {};
        const previo = { ...f.def, ...(actual[f.clave] || {}) };
        return {
          whatsappBot: {
            ...bot,
            indicadores: { ...actual, [f.clave]: { ...previo, [campo]: !previo[campo] } },
          },
        };
      });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <div className="display" style={{ fontSize: 14, color: "#E8EDF5", marginBottom: 4 }}>🤖 INDICADORES DE ROBOTINA</div>
      <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 14 }}>
        Prende o apaga qué sigue Robotina. Los cambios aplican desde la siguiente retro o pregunta.
        Los rallies activos aparecen solos aquí.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "#9AA7BD", textAlign: "left" }}>
              <th style={{ padding: "8px 10px" }}>Indicador</th>
              {COLUMNAS.map((c) => (
                <th key={c.campo} title={c.ayuda} style={{ padding: "8px 10px", textAlign: "center", whiteSpace: "nowrap" }}>{c.titulo}</th>
              ))}
            </tr>
          </thead>
          {secciones.filter((sec) => sec.filas.length).map((sec) => (
          <tbody key={sec.titulo}>
            <tr>
              <td colSpan={1 + COLUMNAS.length} className="display" style={{ padding: "14px 10px 6px", fontSize: 11, color: "#5AA9E6" }}>{sec.titulo}</td>
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
              </tr>
            ))}
          </tbody>
          ))}
        </table>
      </div>
      {rallies.length === 0 && (
        <div style={{ fontSize: 11, color: "#5b6478", marginTop: 10 }}>
          No hay rallies activos. Cuando actives uno en la pestaña RALLY OTC aparecerá aquí.
        </div>
      )}
    </div>
  );
}
