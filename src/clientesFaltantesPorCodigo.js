// =====================================================================
// clientesFaltantesPorCodigo.js — "CLIENTES NO VISITADOS" de Mesa de Control
// ---------------------------------------------------------------------
// Reemplaza a calcularClientesFaltantes (utils). La diferencia: el cliente
// se identifica por CÓDIGO, no por nombre. Antes, si un cliente cambiaba
// de nombre (ej. MKD8718453 "ABARROTES DE RAUL" en clientes_ruta y
// "ABARROTES SANCHEZ" en Mesa de Control) se tomaba como otro cliente:
// salía como faltante y además se contaba como visita "extra" (por eso
// "Visitados" podía salir mayor que "Debía visitar").
//
// Reglas:
//   • Debía visitar = clientes de clientes_ruta de esa ruta cuyo campo
//     `dia` contiene el día de la semana de la fecha (sin repetir código).
//   • Visitado = cualquiera de las TRES fuentes lo marca visitado ESE día:
//       1) Mesa de Control de esa ruta y fecha con horario (inicio y final)
//       2) Avance del Día (tuvo venta ese día)
//       3) Visitas NUR (primer día en que aparece en el reporte acumulado)
//     Las tres ya se juntan en data.visitasSemana (por código, con
//     fechasVisitado) desde App.tsx; aquí además se leen directo las filas
//     de Mesa de Control por si visitasSemana aún no se actualiza.
//     Todo se cruza por código normalizado (sin ceros a la izquierda).
//   • Solo si la fila de Mesa de Control no trae código, se intenta por
//     nombre — y solo si ese nombre no se repite en el listado de la ruta.
//   • Visitados = cuántos de los que DEBÍA visitar sí se visitaron (nunca
//     mayor que "Debía visitar"). Las visitas a clientes fuera de su
//     listado del día se regresan aparte en `visitasFueraDeLista`.
//
// Regresa: { dia, totalDebia, totalVisitados, faltantes:[{codigo_cliente,nombre}],
//            porFuente: { mesaControl, otrasFuentes }, visitasFueraDeLista,
//            totalEnRuta, error }
// =====================================================================

import { supabase } from "./supabaseClient";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function normalizarTexto(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}
function normalizarCodigo(c) {
  return String(c || "").trim().toUpperCase().replace(/\s+/g, "").replace(/^0+/, "");
}
// Acepta "2026-10-08" o "08/10/2026" → "2026-10-08"
function aISO(fecha) {
  const s = String(fecha || "").trim().split(" ")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}
function lunesDe(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  const dia = f.getUTCDay();
  f.setUTCDate(f.getUTCDate() + (dia === 0 ? -6 : 1 - dia));
  return f.toISOString().slice(0, 10);
}
function diaDeSemana(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

async function cargarClientesDeRuta(codigoRuta, nombreRuta) {
  let todos = [];
  let desde = 0;
  const tam = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("clientes_ruta")
      .select("ruta, codigo_cliente, nombre, dia")
      .in("ruta", [codigoRuta, nombreRuta])
      .range(desde, desde + tam - 1);
    if (error) throw error;
    todos = todos.concat(data || []);
    if (!data || data.length < tam) break;
    desde += tam;
  }
  return todos;
}

export async function calcularClientesFaltantesPorCodigo(nombreRuta, mesaControl, fecha, visitasSemana = null) {
  const codigoRuta = String(nombreRuta || "").replace("RUTA ", "").trim();
  const fechaISO = aISO(fecha);
  const vacio = { dia: null, totalDebia: 0, totalVisitados: 0, faltantes: [], porFuente: { mesaControl: 0, otrasFuentes: 0 }, visitasFueraDeLista: 0, totalEnRuta: null, error: null };
  if (!codigoRuta || !fechaISO) return vacio;
  const dia = diaDeSemana(fechaISO);
  const diaNorm = normalizarTexto(dia);

  let clientes;
  try {
    clientes = await cargarClientesDeRuta(codigoRuta, nombreRuta);
  } catch (err) {
    return { ...vacio, dia, error: err?.message || String(err) };
  }

  // Nombres que comparten varios códigos en esta ruta (no se cruzan por nombre)
  const codigosPorNombre = {};
  clientes.forEach((c) => {
    const n = normalizarTexto(c.nombre);
    const k = normalizarCodigo(c.codigo_cliente);
    if (!n || !k) return;
    (codigosPorNombre[n] = codigosPorNombre[n] || new Set()).add(k);
  });
  const nombreACodigo = {};
  Object.entries(codigosPorNombre).forEach(([n, set]) => { if (set.size === 1) nombreACodigo[n] = [...set][0]; });

  // Debía visitar hoy (sin repetir código; se queda el último nombre)
  const debiaMap = new Map();
  clientes.forEach((c) => {
    if (!normalizarTexto(c.dia).includes(diaNorm)) return;
    const k = normalizarCodigo(c.codigo_cliente) || `N:${normalizarTexto(c.nombre)}`;
    debiaMap.set(k, c);
  });

  const llaveDeNombre = (nombre) => {
    const n = normalizarTexto(nombre);
    return nombreACodigo[n] || (n ? `N:${n}` : "");
  };

  // Fuente 1: filas de Mesa de Control (esa ruta, esa fecha, con horario)
  const visitadosMC = new Set();
  (mesaControl || []).forEach((r) => {
    if (r.vendedor !== nombreRuta) return;
    if (aISO(r.fecha) !== fechaISO) return;
    const conHorario = String(r.inicio || "").trim() && String(r.final || "").trim();
    if (!conHorario) return;
    const k = normalizarCodigo(r.clienteCodigo ?? r.codigo ?? r.codigo_cliente) || llaveDeNombre(r.cliente);
    if (k) visitadosMC.add(k);
  });

  // Fuentes 2 y 3 (y también Mesa de Control): visitasSemana acumulada,
  // donde App.tsx junta Mesa de Control + Avance del Día + Visitas NUR.
  const visitadosOtras = new Set();
  const entradaSemana = visitasSemana?.[`${nombreRuta}|${lunesDe(fechaISO)}`];
  Object.values(entradaSemana?.clientes || {}).forEach((info) => {
    if (!(info.fechasVisitado || []).includes(fechaISO)) return;
    const k = normalizarCodigo(info.codigo) || llaveDeNombre(info.nombre);
    if (k) visitadosOtras.add(k);
  });

  const visitados = new Set([...visitadosMC, ...visitadosOtras]);

  const faltantes = [];
  let totalVisitados = 0;
  let porMC = 0;
  let porOtras = 0;
  debiaMap.forEach((c, k) => {
    if (!visitados.has(k)) { faltantes.push(c); return; }
    totalVisitados++;
    if (visitadosMC.has(k)) porMC++;
    else porOtras++; // lo salvó Avance del Día o Visitas NUR
  });
  const visitasFueraDeLista = [...visitados].filter((k) => !debiaMap.has(k)).length;

  return {
    dia,
    totalDebia: debiaMap.size,
    totalVisitados,
    faltantes,
    porFuente: { mesaControl: porMC, otrasFuentes: porOtras },
    visitasFueraDeLista,
    totalEnRuta: clientes.length,
    error: null,
  };
}
