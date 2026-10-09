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

   IDENTIDAD DEL CLIENTE = CÓDIGO (no el nombre)
   ---------------------------------------------------------------------
   Antes el cruce caía al nombre aunque el cliente tuviera código, y eso
   fallaba de dos formas:
     1) Un cliente que cambia de nombre (en clientes_ruta o en el reporte)
        se tomaba como OTRO cliente → aparecía sin visita aunque sí se
        visitó, o salía dos veces.
     2) Dos clientes distintos con el mismo nombre (ej. dos "ABARROTES
        LUPITA" con códigos diferentes) se mezclaban entre sí.
   Ahora:
     • Se cruza SIEMPRE por código normalizado (sin ceros a la izquierda).
     • Si en visitasSemana hay varias entradas del mismo código (ej. una
       guardada con el nombre viejo y otra con el nuevo), se FUSIONAN
       (se juntan sus fechas de visita y el descarte manual).
     • Las entradas sin código (las que solo vienen de Avance del Día) se
       ligan a un código buscando su nombre en clientes_ruta de esa ruta —
       solo si ese nombre es único en la ruta (si hay dos clientes con el
       mismo nombre, no se adivina).
     • El cruce por nombre queda solo como último recurso para entradas
       sin código, y nunca contra un nombre repetido en la ruta.
     • En clientes_ruta, si un mismo código viene repetido en el mismo
       día (ej. con nombre viejo y nuevo), se cuenta una sola vez.

   Cómo se conecta:
     <SinVisitaView data={data} rol={rol} puesto={puesto} rutaPropia={rutaPropia} persistFresco={persistFresco} />
===================================================================== */

import React, { useEffect, useMemo, useRef, useState } from "react";
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
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}
// Igual que en App.tsx: quita ceros a la izquierda para poder cruzar el
// código de Mesa de Control contra codigo_cliente de clientes_ruta aunque
// vengan con distinto formato (ej. "0010167065" vs "10167065"). También
// se pasa a mayúsculas y sin espacios (hay códigos alfanuméricos como
// "ABC0003440" o "536H000127").
function normalizarCodigo(c) {
  return String(c || "").trim().toUpperCase().replace(/\s+/g, "").replace(/^0+/, "");
}
// Dado un ISO date y el lunes de su semana, regresa el nombre del día
// ("Miércoles") — se usa para explicar en qué día SÍ se visitó a alguien
// que no fue visitado el día que le tocaba.
function nombreDiaDeFecha(fechaISO, semanaInicio) {
  const idx = DIAS_SEMANA.findIndex((d) => sumarDiasISOLocal(semanaInicio, d.offset) === fechaISO);
  return idx >= 0 ? DIAS_SEMANA[idx].nombre : fechaISO;
}

// Junta dos registros de visita del MISMO cliente (mismo código).
function unirFechas(a, b) {
  return Array.from(new Set([...(a || []), ...(b || [])])).sort();
}
function fusionarInfo(a, b) {
  if (!a) return { ...b };
  if (!b) return { ...a };
  return {
    ...a,
    ...b,
    codigo: a.codigo || b.codigo || null,
    nombre: b.nombre || a.nombre,
    visitadoManual: !!(a.visitadoManual || b.visitadoManual),
    fechasVisitado: unirFechas(a.fechasVisitado, b.fechasVisitado),
    fechasVistas: unirFechas(a.fechasVistas, b.fechasVistas),
  };
}

// Índice de visitas de una ruta/semana:
//   porCodigo: código normalizado -> info fusionada
//   porNombreSinCodigo: nombre -> info, SOLO de entradas que no traen código
//                       y que no se pudieron ligar a un código.
function indexarVisitas(entrada, nombreACodigo) {
  const porCodigo = {};
  const porNombreSinCodigo = {};
  Object.values(entrada?.clientes || {}).forEach((info) => {
    let cod = normalizarCodigo(info.codigo);
    const nom = normalizarTexto(info.nombre);
    // Entrada sin código (viene de Avance del Día): se liga al código del
    // cliente con ese nombre en clientes_ruta, si el nombre es único.
    if (!cod && nom && nombreACodigo && nombreACodigo[nom]) cod = nombreACodigo[nom];
    if (cod) {
      porCodigo[cod] = fusionarInfo(porCodigo[cod], { ...info, codigo: info.codigo || cod });
    } else if (nom) {
      porNombreSinCodigo[nom] = fusionarInfo(porNombreSinCodigo[nom], info);
    }
  });
  return { porCodigo, porNombreSinCodigo };
}

// Busca el registro de visitas de un cliente de clientes_ruta.
function buscarInfo(c, idx, nombresRepetidos) {
  const cod = normalizarCodigo(c.codigo_cliente);
  if (cod && idx.porCodigo[cod]) return idx.porCodigo[cod];
  // Último recurso: entradas SIN código con el mismo nombre, y solo si ese
  // nombre no lo comparten varios clientes de la ruta.
  const nom = normalizarTexto(c.nombre);
  if (!nom || nombresRepetidos.has(nom)) return null;
  return idx.porNombreSinCodigo[nom] || null;
}

export default function SinVisitaView({ data, rol, puesto, rutaPropia, persistFresco }) {
  const visitasSemana = data?.visitasSemana || {};
  const esVendedor = rol === "vendedor";

  // ⚠️ Antes esto usaba `new Date().toISOString()`, que es hora UTC — pasadas
  // las ~18:00 hora de México (UTC-6), UTC ya está en el día siguiente, así
  // que "hoy" se calculaba mal (podía adelantarse un día entero, corriendo
  // también en qué semana caía). Se calcula igual que en el resto de la app
  // (ver `todayISO` en utils.js): con la fecha civil de México, no UTC.
  const hoyISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  const hoy = new Date(hoyISO + "T12:00:00");
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

  // ⚠️ Antes `semanaSeleccionada` se fijaba una sola vez al abrir la
  // pantalla y nunca se volvía a tocar — si alguien la dejaba abierta
  // cruzando el fin de semana (o el sábado tarde), se quedaba viendo la
  // semana anterior para siempre. Este efecto detecta cuándo la semana
  // actual de verdad avanzó mientras la pantalla seguía abierta y, SOLO si
  // seguían viendo "esta semana" por default, la avanza sola.
  const semanaActualRef = useRef(semanaActual);
  useEffect(() => {
    if (semanaActualRef.current !== semanaActual) {
      setSemanaSeleccionada((actual) => (actual === semanaActualRef.current ? semanaActual : actual));
      semanaActualRef.current = semanaActual;
    }
  }, [semanaActual]);

  // Pestaña de día seleccionada en el tablero de "sin visita": por default
  // el día de hoy (si es lunes-sábado), o "Total semana" el domingo.
  const nombreDiaHoy = DIAS_SEMANA[hoy.getDay() === 0 ? -1 : hoy.getDay() - 1]?.nombre || null;
  const [pestanaDia, setPestanaDia] = useState(nombreDiaHoy || "Total semana");
  const nombreDiaHoyRef = useRef(nombreDiaHoy);
  useEffect(() => {
    if (nombreDiaHoyRef.current !== nombreDiaHoy) {
      setPestanaDia((actual) => (actual === (nombreDiaHoyRef.current || "Total semana") ? (nombreDiaHoy || "Total semana") : actual));
      nombreDiaHoyRef.current = nombreDiaHoy;
    }
  }, [nombreDiaHoy]);

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
        // Busca si ya existe una entrada para este cliente. Con código se
        // busca SOLO por código (así un cambio de nombre no crea otro
        // cliente, y dos clientes con el mismo nombre no se pisan); sin
        // código, por nombre entre las entradas que tampoco traen código.
        const nombreNorm = normalizarTexto(clienteNombre);
        const claveExistente = Object.keys(entrada.clientes).find((k) => {
          const info = entrada.clientes[k];
          if (codigoNorm) return normalizarCodigo(info.codigo) === codigoNorm;
          return !normalizarCodigo(info.codigo) && normalizarTexto(info.nombre) === nombreNorm;
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
                [claveCliente]: { ...clienteActual, codigo: clienteActual.codigo || codigoNorm || null, visitadoManual: visitado },
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
    const vistosPorClave = {};
    clientesRuta.forEach((c) => {
      const diaNorm = normalizarTexto(c.dia);
      // El campo `dia` puede traer más de un nombre de día (ej.
      // "LUNES,JUEVES") y/o texto extra (ej. "MARTES, UNICA"): se busca cada
      // nombre de día como texto contenido y el cliente se asigna a TODOS
      // los días que encuentre.
      const diasEncontrados = DIAS_SEMANA.filter((d) => diaNorm.includes(normalizarTexto(d.nombre)));
      const cod = normalizarCodigo(c.codigo_cliente);
      diasEncontrados.forEach((diaMatch) => {
        const clave = `${c.ruta}|${diaMatch.nombre}`;
        if (!mapa[clave]) { mapa[clave] = []; vistosPorClave[clave] = {}; }
        // Mismo código repetido el mismo día (ej. una fila con el nombre
        // viejo y otra con el nuevo) → se cuenta una sola vez; se queda el
        // último nombre cargado.
        if (cod && vistosPorClave[clave][cod] !== undefined) {
          mapa[clave][vistosPorClave[clave][cod]] = c;
          return;
        }
        if (cod) vistosPorClave[clave][cod] = mapa[clave].length;
        mapa[clave].push(c);
      });
    });
    return mapa;
  }, [clientesRuta]);

  // Por ruta (J201…): nombre normalizado -> código, SOLO para nombres
  // únicos; y el conjunto de nombres que comparten varios códigos.
  const nombresPorRuta = useMemo(() => {
    const res = {};
    (clientesRuta || []).forEach((c) => {
      const r = c.ruta;
      if (!res[r]) res[r] = { codigosPorNombre: {} };
      const nom = normalizarTexto(c.nombre);
      const cod = normalizarCodigo(c.codigo_cliente);
      if (!nom || !cod) return;
      (res[r].codigosPorNombre[nom] = res[r].codigosPorNombre[nom] || new Set()).add(cod);
    });
    const salida = {};
    Object.entries(res).forEach(([r, { codigosPorNombre }]) => {
      const nombreACodigo = {};
      const repetidos = new Set();
      Object.entries(codigosPorNombre).forEach(([nom, set]) => {
        if (set.size === 1) nombreACodigo[nom] = [...set][0];
        else repetidos.add(nom);
      });
      salida[r] = { nombreACodigo, repetidos };
    });
    return salida;
  }, [clientesRuta]);

  const visitasSemanaNorm = useMemo(() => {
    const mapa = {};
    Object.entries(visitasSemana).forEach(([clave, entrada]) => {
      const codigoRuta = String(entrada?.ruta || clave.split("|")[0] || "").replace("RUTA ", "");
      mapa[clave] = indexarVisitas(entrada, nombresPorRuta[codigoRuta]?.nombreACodigo);
    });
    return mapa;
  }, [visitasSemana, nombresPorRuta]);

  const rutasVisibles = esVendedor ? RUTAS.filter((r) => r === `RUTA ${rutaPropia}`) : RUTAS;
  const VACIO = { porCodigo: {}, porNombreSinCodigo: {} };

  const tablero = useMemo(() => {
    if (!clientesRuta) return [];
    return rutasVisibles.map((ruta) => {
      const codigoRuta = ruta.replace("RUTA ", "");
      const idx = visitasSemanaNorm[`${ruta}|${semana}`] || VACIO;
      const repetidos = nombresPorRuta[codigoRuta]?.repetidos || new Set();
      const dias = diasCompletos.map((d) => {
        const asignados = clientesRutaPorRutaYDia[`${codigoRuta}|${d.nombre}`] || [];
        const pendientes = [];
        const fueraDeDia = [];
        asignados.forEach((c) => {
          const info = buscarInfo(c, idx, repetidos);
          if (!info) { pendientes.push(c); return; } // nunca apareció en ningún reporte
          if (info.visitadoManual) return; // descartado a mano, resuelto sin nota
          const fechasVisitado = info.fechasVisitado || [];
          if (fechasVisitado.includes(d.fecha)) return; // visitado justo su día -> resuelto sin nota
          // Visitarlo otro día no resuelve la visita que le tocaba ESTE día
          // — sigue pendiente; que se haya visitado otro día queda como nota
          // informativa para Staff (fueraDeDia).
          pendientes.push(c);
          if (fechasVisitado.length > 0) {
            const otraFecha = [...fechasVisitado].sort().find((f) => f !== d.fecha) || fechasVisitado[0];
            fueraDeDia.push({ ...c, fechaVisitaReal: otraFecha, diaVisitaReal: nombreDiaDeFecha(otraFecha, semana) });
          }
        });
        return { dia: d.nombre, fecha: d.fecha, totalAsignados: asignados.length, pendientes, fueraDeDia };
      });
      const totalPendientesRuta = dias.reduce((s, d) => s + d.pendientes.length, 0);
      return { ruta, dias, totalPendientesRuta };
    });
  }, [clientesRuta, clientesRutaPorRutaYDia, visitasSemanaNorm, nombresPorRuta, diasCompletos, semana, rutasVisibles]);

  // Total de la SEMANA: aquí sí cuenta como resuelto que se haya visitado
  // CUALQUIER día de la semana. Se deduplica por cliente (por código).
  const tableroSemanal = useMemo(() => {
    if (!clientesRuta) return [];
    return rutasVisibles.map((ruta) => {
      const codigoRuta = ruta.replace("RUTA ", "");
      const idx = visitasSemanaNorm[`${ruta}|${semana}`] || VACIO;
      const repetidos = nombresPorRuta[codigoRuta]?.repetidos || new Set();
      const vistos = new Set();
      const pendientesSemana = [];
      let totalAsignadosSemana = 0;
      diasCompletos.forEach((d) => {
        const asignados = clientesRutaPorRutaYDia[`${codigoRuta}|${d.nombre}`] || [];
        asignados.forEach((c) => {
          const idCliente = normalizarCodigo(c.codigo_cliente) || `N:${normalizarTexto(c.nombre)}`;
          if (vistos.has(idCliente)) return;
          vistos.add(idCliente);
          totalAsignadosSemana++;
          const info = buscarInfo(c, idx, repetidos);
          if (!info) { pendientesSemana.push(c); return; } // nunca apareció en ningún reporte
          if (info.visitadoManual) return; // descartado a mano
          if ((info.fechasVisitado || []).length > 0) return; // se visitó algún día de la semana
          pendientesSemana.push(c); // nunca visitado ningún día
        });
      });
      return { ruta, pendientesSemana, totalAsignadosSemana };
    });
  }, [clientesRuta, clientesRutaPorRutaYDia, visitasSemanaNorm, nombresPorRuta, diasCompletos, semana, rutasVisibles]);

  const pendientesSemanaPorRuta = useMemo(() => {
    const mapa = {};
    tableroSemanal.forEach((r) => { mapa[r.ruta] = { pendientes: r.pendientesSemana, totalAsignados: r.totalAsignadosSemana }; });
    return mapa;
  }, [tableroSemanal]);

  const rutasConPendientes = tableroSemanal.filter((r) => r.pendientesSemana.length > 0).sort((a, b) => b.pendientesSemana.length - a.pendientesSemana.length);
  const totalPendientes = tableroSemanal.reduce((s, r) => s + r.pendientesSemana.length, 0);

  const entradasCobertura = useMemo(
    () => rutasVisibles.map((ruta) => ({ ruta, fechasSubidas: (visitasSemana[`${ruta}|${semana}`]?.fechasMesaControl) || [] })),
    [visitasSemana, semana, rutasVisibles]
  );

  // Llave estable para cada fila de cliente (código si hay; si no, nombre).
  const llaveCliente = (c) => normalizarCodigo(c.codigo_cliente) || `N:${c.nombre}`;

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
            // "Total semana" arma un único bloque "día" sintético con la lista
            // semanal ya deduplicada (mismo criterio que el KPI de arriba).
            const diasFiltrados = (r) => {
              if (pestanaDia === "Total semana") {
                const info = pendientesSemanaPorRuta[r.ruta] || { pendientes: [], totalAsignados: 0 };
                if (info.pendientes.length === 0) return [];
                return [{ dia: "Total semana", fecha: null, totalAsignados: info.totalAsignados, pendientes: info.pendientes, fueraDeDia: [] }];
              }
              return r.dias.filter((d) => d.dia === pestanaDia);
            };
            const rutasParaMostrar = tablero
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
                              {d.dia}{d.fecha ? ` (${d.fecha})` : ""} · {d.pendientes.length} de {d.totalAsignados} sin visita
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: (!esVendedor && d.fueraDeDia.length > 0) ? 8 : 0 }}>
                              {d.pendientes.map((c) => {
                                const idGuardado = normalizarCodigo(c.codigo_cliente) || c.nombre;
                                return (
                                  <div key={llaveCliente(c)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: T.cardSoft, borderRadius: 8, gap: 10, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {c.nombre}
                                      {!esVendedor && c.codigo_cliente && (
                                        <span style={{ fontSize: 11, color: T.muted, marginLeft: 6 }}>· {c.codigo_cliente}</span>
                                      )}
                                    </span>
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
                        {/* "Visitado otro día" (fueraDeDia) solo para Staff, como
                            referencia de supervisión. */}
                        {!esVendedor && d.fueraDeDia.length > 0 && (
                          <>
                            {d.pendientes.length === 0 && (
                              <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 6 }}>
                                {d.dia} ({d.fecha})
                              </div>
                            )}
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {d.fueraDeDia.map((c) => (
                                <div key={llaveCliente(c)} style={{ padding: "8px 10px", background: "rgba(242,177,52,0.08)", borderRadius: 8, border: `1px dashed ${T.primary}` }}>
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
