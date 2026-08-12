// @ts-nocheck
/* =====================================================================
   SinVisitaView — módulo independiente de SMART-TRACK
   ---------------------------------------------------------------------
   Muestra, por semana, qué clientes NO han sido visitados en cada ruta.

   De dónde sale el dato: cada vez que se sube un archivo/texto de Mesa
   de Control (en App.tsx, dentro de `procesarFilasMesaControl`), además
   de guardar el snapshot del día en `data.mesaControl` (como ya hacía),
   ahora también se acumula en `data.visitasSemana`: por cada cliente que
   aparece en el reporte de un día, se marca si tuvo horario de visita
   (inicio/final) ese día o no. Un cliente se considera "visitado" en la
   semana si tuvo al menos un día con horario de visita; si nunca lo tuvo
   en ningún reporte subido esa semana, aparece aquí como "sin visita".

   Esto es un acumulado que crece según se van subiendo reportes durante
   la semana — no es necesario subir todos los días de golpe: cada carga
   suma información a la semana correspondiente, nunca la reemplaza.

   Cómo se conecta:
     <SinVisitaView data={data} rol={rol} puesto={puesto} rutaPropia={rutaPropia} />
===================================================================== */

import React, { useMemo, useState } from "react";
import { AlertTriangle, Users, MapPin, CheckCircle2, Calendar } from "lucide-react";
import { NOMBRES } from "../constants";

const T = {
  bg: "#0B1220",
  card: "#111C33",
  cardSoft: "#0F1830",
  border: "#2A3852",
  ink: "#E8EDF5",
  muted: "#9AA7BD",
  primary: "#F2B134",
  ok: "#3DDC97",
  bad: "#FF6B6B",
  badSoft: "rgba(255,107,107,0.12)",
};

// Lunes de la semana que contiene `fechaISO` ("YYYY-MM-DD" -> "YYYY-MM-DD").
function lunesDeSemanaLocal(fechaISO) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const dia = fecha.getUTCDay(); // 0 = domingo
  const offset = dia === 0 ? -6 : 1 - dia;
  fecha.setUTCDate(fecha.getUTCDate() + offset);
  return fecha.toISOString().slice(0, 10);
}
function sumarDiasISOLocal(fechaISO, dias) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}
function formatoRangoSemana(lunesISO) {
  const domingo = sumarDiasISOLocal(lunesISO, 6);
  const opts = { day: "numeric", month: "long", timeZone: "UTC" };
  const [y1, m1, d1] = lunesISO.split("-").map(Number);
  const [y2, m2, d2] = domingo.split("-").map(Number);
  const f1 = new Date(Date.UTC(y1, m1 - 1, d1)).toLocaleDateString("es-MX", opts);
  const f2 = new Date(Date.UTC(y2, m2 - 1, d2)).toLocaleDateString("es-MX", opts);
  return `${f1} al ${f2}`;
}
function nombreRutaBonito(ruta) {
  const nombre = NOMBRES[ruta];
  return nombre ? `${ruta.replace("RUTA ", "")} · ${nombre}` : ruta;
}

export default function SinVisitaView({ data, rol, puesto, rutaPropia, persistFresco }) {
  const visitasSemana = data?.visitasSemana || {};
  const esVendedor = rol === "vendedor";

  const hoyISO = new Date().toISOString().slice(0, 10);
  const semanaActual = lunesDeSemanaLocal(hoyISO);

  const semanasDisponibles = useMemo(() => {
    const set = new Set(Object.values(visitasSemana).map((v) => v.semanaInicio));
    set.add(semanaActual);
    return Array.from(set).sort().reverse();
  }, [visitasSemana, semanaActual]);

  const [semanaSeleccionada, setSemanaSeleccionada] = useState(semanaActual);
  const semana = semanasDisponibles.includes(semanaSeleccionada) ? semanaSeleccionada : semanaActual;
  const esSemanaActual = semana === semanaActual;

  const [guardandoCliente, setGuardandoCliente] = useState(null); // nombre del cliente en proceso, para deshabilitar el botón mientras guarda

  // El vendedor puede marcar manualmente a un cliente como visitado (por si
  // Mesa de Control/Avance del Día no lo capturaron bien) o deshacerlo si
  // se equivocó. Solo aplica a la semana en curso — no tiene sentido editar
  // semanas ya cerradas.
  async function marcarVisitaManual(ruta, clienteNombre, visitado) {
    if (!persistFresco) return;
    setGuardandoCliente(clienteNombre);
    try {
      await persistFresco((fresca) => {
        const clave = `${ruta}|${semanaActual}`;
        const actual = fresca.visitasSemana || {};
        const entrada = actual[clave] || { ruta, semanaInicio: semanaActual, clientes: {} };
        const clienteActual = entrada.clientes[clienteNombre] || { visitado: false, ultimaFecha: hoyISO, fechasVistas: [] };
        return {
          visitasSemana: {
            ...actual,
            [clave]: {
              ...entrada,
              clientes: {
                ...entrada.clientes,
                [clienteNombre]: { ...clienteActual, visitadoManual: visitado },
              },
            },
          },
        };
      });
    } finally {
      setGuardandoCliente(null);
    }
  }

  const entradasSemana = useMemo(
    () => Object.values(visitasSemana).filter((v) => v.semanaInicio === semana),
    [visitasSemana, semana]
  );

  const entradasVisibles = esVendedor
    ? entradasSemana.filter((e) => e.ruta === `RUTA ${rutaPropia}` || e.ruta === rutaPropia)
    : entradasSemana;

  // Por cada ruta, lista de clientes sin visita (nunca tuvieron horario
  // de visita ni venta en ningún reporte subido esa semana, y el vendedor
  // tampoco los marcó manualmente), ordenados por los que llevan más días
  // apareciendo sin visitar. Aparte, los que sí se marcaron a mano, para
  // poder deshacerlo si fue un error.
  const rutasConPendientes = useMemo(() => {
    return entradasVisibles
      .map((entrada) => {
        const pendientes = Object.entries(entrada.clientes)
          .filter(([, c]) => !c.visitado && !c.visitadoManual)
          .map(([nombre, c]) => ({ nombre, ultimaFecha: c.ultimaFecha, diasEnReporte: c.fechasVistas.length }))
          .sort((a, b) => b.diasEnReporte - a.diasEnReporte || (a.nombre < b.nombre ? -1 : 1));
        const marcadosManual = Object.entries(entrada.clientes)
          .filter(([, c]) => !c.visitado && c.visitadoManual)
          .map(([nombre]) => nombre)
          .sort();
        return { ruta: entrada.ruta, pendientes, marcadosManual, totalClientesVistos: Object.keys(entrada.clientes).length };
      })
      .filter((r) => r.pendientes.length > 0 || r.marcadosManual.length > 0)
      .sort((a, b) => b.pendientes.length - a.pendientes.length);
  }, [entradasVisibles]);

  const totalPendientes = rutasConPendientes.reduce((s, r) => s + r.pendientes.length, 0);
  const hayDatosEstaSemana = entradasVisibles.length > 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <style>{`
        .sv-card { background:${T.card}; border:1px solid ${T.border}; border-radius:14px; }
        .sv-select { background:${T.bg}; border:1px solid ${T.border}; color:${T.ink}; border-radius:8px; padding:7px 10px; font-size:12.5px; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={20} color={T.primary} />
          <span style={{ fontSize: 18, fontWeight: 800 }}>SIN VISITA</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar size={14} color={T.muted} />
          <select className="sv-select" value={semana} onChange={(e) => setSemanaSeleccionada(e.target.value)}>
            {semanasDisponibles.map((s) => (
              <option key={s} value={s}>
                {s === semanaActual ? "Esta semana" : "Semana"} · {formatoRangoSemana(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!esVendedor && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <div className="sv-card" style={{ padding: 14, flex: "1 1 160px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.muted, fontSize: 11.5, marginBottom: 6 }}>
              <MapPin size={13} /><span>Rutas con pendientes</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: rutasConPendientes.length > 0 ? T.bad : T.ok }}>{rutasConPendientes.length}</div>
          </div>
          <div className="sv-card" style={{ padding: 14, flex: "1 1 160px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.muted, fontSize: 11.5, marginBottom: 6 }}>
              <Users size={13} /><span>Clientes sin visita</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: totalPendientes > 0 ? T.bad : T.ok }}>{totalPendientes}</div>
          </div>
        </div>
      )}

      {esVendedor && !esSemanaActual && (
        <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 12, fontStyle: "italic" }}>
          Estás viendo una semana pasada — solo se puede marcar como visitado en la semana en curso.
        </div>
      )}

      {!hayDatosEstaSemana ? (
        <div className="sv-card" style={{ padding: 30, textAlign: "center", color: T.muted, fontSize: 13 }}>
          Todavía no se ha subido Mesa de Control para {esVendedor ? "tu ruta" : "ninguna ruta"} esta semana.
        </div>
      ) : rutasConPendientes.length === 0 ? (
        <div className="sv-card" style={{ padding: 30, textAlign: "center", color: T.ok, fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={22} />
          {esVendedor ? "Visitaste a todos tus clientes esta semana." : "Ninguna ruta tiene clientes sin visita esta semana."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {rutasConPendientes.map((r) => (
            <div key={r.ruta} className="sv-card" style={{ padding: 16 }}>
              {!esVendedor && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{nombreRutaBonito(r.ruta)}</div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.bad, background: T.badSoft, borderRadius: 999, padding: "3px 10px" }}>
                    {r.pendientes.length} sin visita
                  </span>
                </div>
              )}
              {r.pendientes.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {r.pendientes.map((c) => (
                    <div key={c.nombre} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: T.cardSoft, borderRadius: 8, gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, color: T.muted, whiteSpace: "nowrap" }}>
                          {c.diasEnReporte} día{c.diasEnReporte !== 1 ? "s" : ""} sin visitar · última vez en reporte: {c.ultimaFecha}
                        </span>
                        {esVendedor && esSemanaActual && persistFresco && (
                          <button
                            onClick={() => marcarVisitaManual(r.ruta, c.nombre, true)}
                            disabled={guardandoCliente === c.nombre}
                            style={{
                              fontSize: 11, fontWeight: 700, color: T.ok, background: "transparent",
                              border: `1px solid ${T.ok}`, borderRadius: 999, padding: "4px 10px", cursor: "pointer",
                              opacity: guardandoCliente === c.nombre ? 0.5 : 1, whiteSpace: "nowrap",
                            }}
                          >
                            {guardandoCliente === c.nombre ? "Guardando…" : "✓ Ya lo visité"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {r.marcadosManual.length > 0 && (
                <div style={{ marginTop: r.pendientes.length > 0 ? 12 : 0 }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Marcados como visitados a mano esta semana:</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {r.marcadosManual.map((nombre) => (
                      <div key={nombre} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: T.cardSoft, borderRadius: 8, gap: 10, opacity: 0.85 }}>
                        <span style={{ fontSize: 12.5 }}>{nombre}</span>
                        {esVendedor && esSemanaActual && persistFresco && (
                          <button
                            onClick={() => marcarVisitaManual(r.ruta, nombre, false)}
                            disabled={guardandoCliente === nombre}
                            style={{
                              fontSize: 11, color: T.muted, background: "transparent",
                              border: `1px solid ${T.border}`, borderRadius: 999, padding: "4px 10px", cursor: "pointer",
                              opacity: guardandoCliente === nombre ? 0.5 : 1, whiteSpace: "nowrap",
                            }}
                          >
                            {guardandoCliente === nombre ? "…" : "Deshacer"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
