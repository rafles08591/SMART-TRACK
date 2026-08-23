// @ts-nocheck
/* =====================================================================
   SinVisitaView — módulo independiente de SMART-TRACK
   ---------------------------------------------------------------------
   El universo de "quién debe ser visitado" ya NO se infiere de Mesa de
   Control — se toma de la tabla clientes_ruta en Supabase (el listado
   real de clientes asignados por día a cada ruta: columnas ruta,
   codigo_cliente, nombre, dia). Al inicio de la semana falta el 100%
   (aparece todo el listado); conforme se sube Mesa de Control cada día,
   se van descontando los clientes de ESE día específico (agrupado por
   día: lunes descuenta contra el listado del lunes, martes contra el
   de martes, etc.). El sábado, además, se descuenta contra Avance del
   Día, y el vendedor puede descartar manualmente lo que quede — pero
   SOLO ese día.

   El cruce cliente-a-cliente entre clientes_ruta.nombre y el campo
   "cliente" que trae Mesa de Control/Avance del Día se hace por nombre
   normalizado (mayúsculas, sin acentos, espacios colapsados) — si algún
   día los nombres no calzan por venir muy distintos entre sistemas,
   avisar para agregar otra forma de cruce (por código de cliente, etc.).

   Cómo se conecta:
     <SinVisitaView data={data} rol={rol} puesto={puesto} rutaPropia={rutaPropia} persistFresco={persistFresco} />
===================================================================== */

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Users, MapPin, CheckCircle2, Calendar } from "lucide-react";
import { NOMBRES, RUTAS } from "../constants";
import { supabase } from "../supabaseClient";

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

const DIAS_SEMANA = [
  { nombre: "Lunes", offset: 0 },
  { nombre: "Martes", offset: 1 },
  { nombre: "Miércoles", offset: 2 },
  { nombre: "Jueves", offset: 3 },
  { nombre: "Viernes", offset: 4 },
  { nombre: "Sábado", offset: 5 },
];

function lunesDeSemanaLocal(fechaISO) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const dia = fecha.getUTCDay();
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
function normalizarTexto(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}
// Igual que en App.tsx: quita ceros a la izquierda para poder cruzar el
// código de Mesa de Control contra codigo_cliente de clientes_ruta aunque
// vengan con distinto formato (ej. "0010167065" vs "10167065").
function normalizarCodigo(c) {
  return String(c || "").trim().replace(/^0+/, "");
}
// Dado un ISO date y el lunes de su semana, regresa el nombre del día
// ("Miércoles") — se usa para explicar en qué día SÍ se visitó a alguien
// que no fue visitado el día que le tocaba.
function nombreDiaDeFecha(fechaISO, semanaInicio) {
  const idx = DIAS_SEMANA.findIndex((d) => sumarDiasISOLocal(semanaInicio, d.offset) === fechaISO);
  return idx >= 0 ? DIAS_SEMANA[idx].nombre : fechaISO;
}

export default function SinVisitaView({ data, rol, puesto, rutaPropia, persistFresco }) {
  const visitasSemana = data?.visitasSemana || {};
  const esVendedor = rol === "vendedor";

  const hoy = new Date();
  const hoyISO = hoy.toISOString().slice(0, 10);
  const esHoySabado = hoy.getDay() === 6;
  const semanaActual = lunesDeSemanaLocal(hoyISO);

  const [clientesRuta, setClientesRuta] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  useEffect(() => {
    let activo = true;
    async function cargar() {
      try {
        let todos = [];
        let desde = 0;
        const tam = 1000;
        for (;;) {
          const { data: pagina, error } = await supabase
            .from("clientes_ruta")
            .select("ruta, codigo_cliente, nombre, dia")
            .range(desde, desde + tam - 1);
          if (error) throw error;
          todos = todos.concat(pagina || []);
          if (!pagina || pagina.length < tam) break;
          desde += tam;
        }
        if (activo) setClientesRuta(todos);
      } catch (err) {
        console.error("Error cargando clientes_ruta:", err);
        if (activo) setErrorCarga("No se pudo cargar el listado de clientes asignados (clientes_ruta). Verifica tu conexión.");
      }
    }
    cargar();
    return () => { activo = false; };
  }, []);

  const semanasDisponibles = useMemo(() => {
    const set = new Set(Object.values(visitasSemana).map((v) => v.semanaInicio));
    set.add(semanaActual);
    return Array.from(set).sort().reverse();
  }, [visitasSemana, semanaActual]);

  const [semanaSeleccionada, setSemanaSeleccionada] = useState(semanaActual);
  const semana = semanasDisponibles.includes(semanaSeleccionada) ? semanaSeleccionada : semanaActual;
  const esSemanaActual = semana === semanaActual;

  // Pestaña de día seleccionada en el tablero de "sin visita": por default
  // el día de hoy (si es lunes-sábado), o "Total semana" el domingo.
  const nombreDiaHoy = DIAS_SEMANA[hoy.getDay() === 0 ? -1 : hoy.getDay() - 1]?.nombre || null;
  const [pestanaDia, setPestanaDia] = useState(nombreDiaHoy || "Total semana");

  const [guardandoCliente, setGuardandoCliente] = useState(null);
  const puedeMarcarManual = esVendedor && esSemanaActual && esHoySabado && !!persistFresco;

  async function marcarVisitaManual(ruta, clienteCodigo, clienteNombre, visitado) {
    if (!persistFresco) return;
    const codigoNorm = normalizarCodigo(clienteCodigo);
    setGuardandoCliente(codigoNorm || clienteNombre);
    try {
      await persistFresco((fresca) => {
        const clave = `${ruta}|${semanaActual}`;
        const actual = fresca.visitasSemana || {};
        const entrada = actual[clave] || { ruta, semanaInicio: semanaActual, clientes: {}, fechasMesaControl: [] };
        // Busca si ya existe una entrada para este cliente (por código o,
        // si no, por nombre) antes de decidir bajo qué llave guardar.
        const nombreNorm = normalizarTexto(clienteNombre);
        const claveExistente = Object.keys(entrada.clientes).find((k) => {
          const info = entrada.clientes[k];
          return (codigoNorm && normalizarCodigo(info.codigo) === codigoNorm) || normalizarTexto(info.nombre) === nombreNorm;
        });
        const claveCliente = claveExistente || codigoNorm || clienteNombre;
        const clienteActual = entrada.clientes[claveCliente] || { codigo: codigoNorm || null, nombre: clienteNombre, visitado: false, ultimaFecha: hoyISO, fechasVistas: [], fechasVisitado: [] };
        return {
          visitasSemana: {
            ...actual,
            [clave]: {
              ...entrada,
              clientes: {
                ...entrada.clientes,
                [claveCliente]: { ...clienteActual, visitadoManual: visitado },
              },
            },
          },
        };
      });
    } finally {
      setGuardandoCliente(null);
    }
  }

  const diasLaborales = useMemo(
    () => DIAS_SEMANA.slice(0, 5).map((d) => ({ ...d, fecha: sumarDiasISOLocal(semana, d.offset) })),
    [semana]
  );
  // A diferencia de diasLaborales (solo lunes-viernes, para la tabla de
  // cobertura de Mesa de Control), el tablero de "sin visita" sí incluye
  // el sábado, porque clientes_ruta puede traer asignaciones de sábado.
  const diasCompletos = useMemo(
    () => DIAS_SEMANA.map((d) => ({ ...d, fecha: sumarDiasISOLocal(semana, d.offset) })),
    [semana]
  );

  const clientesRutaPorRutaYDia = useMemo(() => {
    if (!clientesRuta) return {};
    const mapa = {};
    clientesRuta.forEach((c) => {
      const diaNorm = normalizarTexto(c.dia);
      const diaMatch = DIAS_SEMANA.find((d) => normalizarTexto(d.nombre) === diaNorm);
      if (!diaMatch) return;
      const clave = `${c.ruta}|${diaMatch.nombre}`;
      if (!mapa[clave]) mapa[clave] = [];
      mapa[clave].push(c);
    });
    return mapa;
  }, [clientesRuta]);

  const visitasSemanaNorm = useMemo(() => {
    const mapa = {};
    Object.entries(visitasSemana).forEach(([clave, entrada]) => {
      const porCodigo = {};
      const porNombre = {};
      Object.values(entrada.clientes || {}).forEach((info) => {
        if (info.codigo) porCodigo[normalizarCodigo(info.codigo)] = info;
        if (info.nombre) porNombre[normalizarTexto(info.nombre)] = info;
      });
      mapa[clave] = { porCodigo, porNombre };
    });
    return mapa;
  }, [visitasSemana]);

  const rutasVisibles = esVendedor ? RUTAS.filter((r) => r === `RUTA ${rutaPropia}`) : RUTAS;

  const tablero = useMemo(() => {
    if (!clientesRuta) return [];
    return rutasVisibles.map((ruta) => {
      const codigoRuta = ruta.replace("RUTA ", "");
      const { porCodigo, porNombre } = visitasSemanaNorm[`${ruta}|${semana}`] || { porCodigo: {}, porNombre: {} };
      const dias = diasCompletos.map((d) => {
        const asignados = clientesRutaPorRutaYDia[`${codigoRuta}|${d.nombre}`] || [];
        const pendientes = [];
        const fueraDeDia = [];
        asignados.forEach((c) => {
          // Cruce principal por código (más confiable); si no hay
          // coincidencia por código, se intenta por nombre (caso de
          // clientes que solo aparecieron en Avance del Día, que no trae
          // código).
          const codigoClienteNorm = normalizarCodigo(c.codigo_cliente);
          const info = (codigoClienteNorm && porCodigo[codigoClienteNorm]) || porNombre[normalizarTexto(c.nombre)];
          if (!info) { pendientes.push(c); return; } // nunca apareció en ningún reporte
          if (info.visitadoManual) return; // descartado a mano, resuelto sin nota
          const fechasVisitado = info.fechasVisitado || [];
          if (fechasVisitado.includes(d.fecha)) return; // visitado justo su día -> resuelto sin nota
          if (fechasVisitado.length > 0) {
            // Sí se visitó, pero otro día — se descuenta de "sin visita",
            // pero se deja la observación de que no fue el día que le tocaba.
            const otraFecha = [...fechasVisitado].sort().find((f) => f !== d.fecha) || fechasVisitado[0];
            fueraDeDia.push({ ...c, fechaVisitaReal: otraFecha, diaVisitaReal: nombreDiaDeFecha(otraFecha, semana) });
            return;
          }
          pendientes.push(c); // nunca visitado esta semana
        });
        return { dia: d.nombre, fecha: d.fecha, totalAsignados: asignados.length, pendientes, fueraDeDia };
      });
      const totalPendientesRuta = dias.reduce((s, d) => s + d.pendientes.length, 0);
      return { ruta, dias, totalPendientesRuta };
    });
  }, [clientesRuta, clientesRutaPorRutaYDia, visitasSemanaNorm, diasCompletos, semana, rutasVisibles]);

  const rutasConPendientes = tablero.filter((r) => r.totalPendientesRuta > 0).sort((a, b) => b.totalPendientesRuta - a.totalPendientesRuta);
  const totalPendientes = tablero.reduce((s, r) => s + r.totalPendientesRuta, 0);

  const entradasCobertura = useMemo(
    () => rutasVisibles.map((ruta) => ({ ruta, fechasSubidas: (visitasSemana[`${ruta}|${semana}`]?.fechasMesaControl) || [] })),
    [visitasSemana, semana, rutasVisibles]
  );

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

      {clientesRuta !== null && !errorCarga && totalPendientes > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {[...diasCompletos.map((d) => d.nombre), "Total semana"].map((nombreTab) => {
            const activa = pestanaDia === nombreTab;
            const dCorrespondiente = diasCompletos.find((d) => d.nombre === nombreTab);
            const conteoTab = nombreTab === "Total semana"
              ? totalPendientes
              : tablero.reduce((s, r) => s + (r.dias.find((d) => d.dia === nombreTab)?.pendientes.length || 0), 0);
            return (
              <button
                key={nombreTab}
                onClick={() => setPestanaDia(nombreTab)}
                style={{
                  fontSize: 12, fontWeight: 700, padding: "7px 12px", borderRadius: 999, cursor: "pointer",
                  border: `1px solid ${activa ? T.primary : T.border}`,
                  background: activa ? "rgba(242,177,52,0.12)" : "transparent",
                  color: activa ? T.primary : T.muted,
                  display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                }}
              >
                {nombreTab === "Total semana" ? nombreTab : nombreTab.slice(0, 3)}
                {conteoTab > 0 && (
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: T.bad, background: T.badSoft, borderRadius: 999, padding: "1px 6px" }}>{conteoTab}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {errorCarga && (
        <div className="sv-card" style={{ padding: 14, marginBottom: 16, color: T.bad, fontSize: 12.5 }}>{errorCarga}</div>
      )}

      {clientesRuta === null && !errorCarga ? (
        <div className="sv-card" style={{ padding: 30, textAlign: "center", color: T.muted, fontSize: 13 }}>
          Cargando el listado de clientes asignados…
        </div>
      ) : (
        <>
          {!esVendedor && (
            <div className="sv-card" style={{ padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Cobertura de Mesa de Control esta semana</div>
              <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 12 }}>
                Debe haber un archivo subido por cada ruta, de lunes a viernes, para que "Sin visita" refleje la semana completa.
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "6px 10px", color: T.muted, fontWeight: 600 }}>Ruta</th>
                      {diasLaborales.map((d) => (
                        <th key={d.fecha} style={{ padding: "6px 8px", color: T.muted, fontWeight: 600 }}>{d.nombre.slice(0, 3)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entradasCobertura.map(({ ruta, fechasSubidas }) => {
                      const faltantes = diasLaborales.filter((d) => !fechasSubidas.includes(d.fecha)).length;
                      return (
                        <tr key={ruta} style={{ borderTop: `1px solid ${T.border}` }}>
                          <td style={{ padding: "7px 10px", fontWeight: 600, whiteSpace: "nowrap", color: faltantes > 0 ? T.ink : T.ok }}>
                            {nombreRutaBonito(ruta)}
                          </td>
                          {diasLaborales.map((d) => {
                            const subido = fechasSubidas.includes(d.fecha);
                            return (
                              <td key={d.fecha} style={{ textAlign: "center", padding: "7px 8px" }}>
                                {subido ? <CheckCircle2 size={15} color={T.ok} /> : <span style={{ color: T.bad, fontWeight: 800 }}>—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
              Estás viendo una semana pasada — solo de lectura.
            </div>
          )}
          {esVendedor && esSemanaActual && !esHoySabado && (
            <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 12, fontStyle: "italic" }}>
              Solo puedes descartar clientes manualmente el día sábado — entre semana la lista se actualiza sola conforme subes Mesa de Control.
            </div>
          )}

          {totalPendientes === 0 ? (
            <div className="sv-card" style={{ padding: 30, textAlign: "center", color: T.ok, fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <CheckCircle2 size={22} />
              {esVendedor ? "No tienes clientes sin visita esta semana." : "Ninguna ruta tiene clientes sin visita esta semana."}
            </div>
          ) : (() => {
            const diasFiltrados = (r) => pestanaDia === "Total semana" ? r.dias : r.dias.filter((d) => d.dia === pestanaDia);
            const rutasBase = esVendedor ? tablero : tablero;
            const rutasParaMostrar = rutasBase
              .map((r) => ({ ...r, diasVisibles: diasFiltrados(r).filter((d) => d.pendientes.length > 0 || (!esVendedor && d.fueraDeDia.length > 0)) }))
              .filter((r) => esVendedor || r.diasVisibles.length > 0)
              .sort((a, b) => {
                const totalA = a.diasVisibles.reduce((s, d) => s + d.pendientes.length, 0);
                const totalB = b.diasVisibles.reduce((s, d) => s + d.pendientes.length, 0);
                return totalB - totalA;
              });

            if (!esVendedor && rutasParaMostrar.length === 0) {
              return (
                <div className="sv-card" style={{ padding: 30, textAlign: "center", color: T.ok, fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <CheckCircle2 size={22} />
                  Ninguna ruta tiene pendientes en {pestanaDia === "Total semana" ? "esta semana" : pestanaDia}.
                </div>
              );
            }

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {rutasParaMostrar.map((r) => (
                  <div key={r.ruta} className="sv-card" style={{ padding: 16 }}>
                    {!esVendedor && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{nombreRutaBonito(r.ruta)}</div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.bad, background: T.badSoft, borderRadius: 999, padding: "3px 10px" }}>
                          {r.diasVisibles.reduce((s, d) => s + d.pendientes.length, 0)} sin visita
                        </span>
                      </div>
                    )}
                    {esVendedor && r.diasVisibles.length === 0 && (
                      <div style={{ fontSize: 13, color: T.ok, display: "flex", alignItems: "center", gap: 8 }}>
                        <CheckCircle2 size={16} /> Sin pendientes en {pestanaDia === "Total semana" ? "esta semana" : pestanaDia}.
                      </div>
                    )}
                    {r.diasVisibles.map((d) => (
                      <div key={d.dia} style={{ marginBottom: 10 }}>
                        {d.pendientes.length > 0 && (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 700, color: T.primary, marginBottom: 6 }}>
                              {d.dia} ({d.fecha}) · {d.pendientes.length} de {d.totalAsignados} sin visita
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: (!esVendedor && d.fueraDeDia.length > 0) ? 8 : 0 }}>
                              {d.pendientes.map((c) => {
                                const idGuardado = normalizarCodigo(c.codigo_cliente) || c.nombre;
                                return (
                                  <div key={c.codigo_cliente || c.nombre} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: T.cardSoft, borderRadius: 8, gap: 10, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</span>
                                    {puedeMarcarManual && (
                                      <button
                                        onClick={() => marcarVisitaManual(r.ruta, c.codigo_cliente, c.nombre, true)}
                                        disabled={guardandoCliente === idGuardado}
                                        style={{
                                          fontSize: 11, fontWeight: 700, color: T.ok, background: "transparent",
                                          border: `1px solid ${T.ok}`, borderRadius: 999, padding: "4px 10px", cursor: "pointer",
                                          opacity: guardandoCliente === idGuardado ? 0.5 : 1, whiteSpace: "nowrap",
                                        }}
                                      >
                                        {guardandoCliente === idGuardado ? "Guardando…" : "✓ Descartar"}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                        {/* La sección "visitado otro día" (fueraDeDia) solo se
                            muestra a Staff (Supervisor-1/Gerente), como
                            referencia de supervisión. Al vendedor no le sirve
                            de nada ver algo que ya está resuelto — solo le
                            confunde y le hace parecer que le falta más de lo
                            que realmente le falta. */}
                        {!esVendedor && d.fueraDeDia.length > 0 && (
                          <>
                            {d.pendientes.length === 0 && (
                              <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 6 }}>
                                {d.dia} ({d.fecha})
                              </div>
                            )}
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {d.fueraDeDia.map((c) => (
                                <div key={c.codigo_cliente || c.nombre} style={{ padding: "8px 10px", background: "rgba(242,177,52,0.08)", borderRadius: 8, border: `1px dashed ${T.primary}` }}>
                                  <div style={{ fontSize: 13 }}>{c.nombre}</div>
                                  <div style={{ fontSize: 11, color: T.primary, marginTop: 2 }}>
                                    Visitado el {c.fechaVisitaReal} ({c.diaVisitaReal}) — no fue su día asignado ({d.dia})
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
