// =============================================================
// Parser de ventas OTC — export tipo "Vendedor,Codigo,Articulo,
// Unidades,Unidades Vendidas,Unidades Devueltas,Total Unidades,
// Ventas $,Devoluciones $,TOTAL $,Fecha Venta". A diferencia del
// export de cartera de créditos, este SÍ viene con saltos de línea
// reales (una fila por línea).
//
// "Total Unidades" = piezas vendidas (netas de devolución).
// "TOTAL $" = importe en pesos de la línea (neto de devolución).
// =============================================================

function parseFechaMX(str) {
  if (!str) return null;
  const [fechaParte] = String(str).trim().split(" ");
  const [d, m, y] = (fechaParte || "").split("/").map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

export function aFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor) ? null : valor;
  const d = new Date(valor);
  return isNaN(d) ? null : d;
}

function mismoDia(a, b) {
  const fa = aFecha(a);
  const fb = aFecha(b);
  if (!fa || !fb) return false;
  return fa.getFullYear() === fb.getFullYear() && fa.getMonth() === fb.getMonth() && fa.getDate() === fb.getDate();
}

// El campo "Vendedor" viene como "J101 - J101 - NOMBRE" pero con
// separadores inconsistentes (a veces sin guion, espacios extra,
// puntos, minúsculas) — se limpia de forma tolerante.
function parseVendedor(vendedorRaw) {
  const trimmed = String(vendedorRaw || "").trim();
  const primerEspacio = trimmed.indexOf(" ");
  const rutaCodigo = primerEspacio === -1 ? trimmed : trimmed.slice(0, primerEspacio);
  let resto = primerEspacio === -1 ? "" : trimmed.slice(primerEspacio + 1).trim();
  if (rutaCodigo) {
    const patronRepetido = new RegExp(`^[-\\s]*${rutaCodigo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[-\\s]*`, "i");
    resto = resto.replace(patronRepetido, "");
  }
  resto = resto.replace(/^[\s\-.]+/, "").trim();
  return { rutaCodigo, vendedorNombre: resto || trimmed };
}

export function parseOtcRaw(rawText) {
  if (!rawText) return [];
  const lineas = rawText.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const registros = [];
  for (const linea of lineas) {
    if (/^Vendedor,\s*Codigo,\s*Articulo/i.test(linea)) continue; // encabezado
    const campos = linea.split(",");
    if (campos.length < 11) continue;
    const [
      vendedorRaw, codigo, articulo, , unidadesVendidas, unidadesDevueltas,
      totalUnidades, ventas, devoluciones, totalPesos, fechaRaw,
    ] = campos;
    const { rutaCodigo, vendedorNombre } = parseVendedor(vendedorRaw);
    registros.push({
      rutaCodigo,
      vendedorNombre,
      codigo: (codigo || "").trim(),
      articulo: (articulo || "").trim(),
      unidadesVendidas: parseFloat(unidadesVendidas) || 0,
      unidadesDevueltas: parseFloat(unidadesDevueltas) || 0,
      totalUnidades: parseFloat(totalUnidades) || 0,
      ventas: parseFloat(ventas) || 0,
      devoluciones: parseFloat(devoluciones) || 0,
      totalPesos: parseFloat(totalPesos) || 0,
      fecha: parseFechaMX(fechaRaw),
    });
  }
  return registros;
}

// -------------------------------------------------------------------
// Agregaciones
// -------------------------------------------------------------------

function agregarPorCodigo(regs) {
  const mapa = {};
  for (const r of regs) {
    if (!mapa[r.codigo]) mapa[r.codigo] = { codigo: r.codigo, articulo: r.articulo, piezas: 0, pesos: 0 };
    mapa[r.codigo].piezas += r.totalUnidades;
    mapa[r.codigo].pesos += r.totalPesos;
  }
  return Object.values(mapa).sort((a, b) => b.pesos - a.pesos);
}

// Días con datos disponibles para una ruta (para pintar las pestañas
// de "por día"), ordenados de más viejo a más nuevo.
export function diasDisponibles(registros, rutaCodigo) {
  const set = new Map();
  for (const r of registros) {
    if (rutaCodigo && r.rutaCodigo !== rutaCodigo) continue;
    const f = aFecha(r.fecha);
    if (!f) continue;
    const key = f.toISOString().slice(0, 10);
    if (!set.has(key)) set.set(key, f);
  }
  return Array.from(set.values()).sort((a, b) => a - b);
}

export function detalleCodigosPorDia(registros, rutaCodigo, fecha) {
  const filtrados = registros.filter((r) => r.rutaCodigo === rutaCodigo && mismoDia(r.fecha, fecha));
  return agregarPorCodigo(filtrados);
}

export function detalleCodigosSemana(registros, rutaCodigo) {
  const filtrados = registros.filter((r) => r.rutaCodigo === rutaCodigo);
  return agregarPorCodigo(filtrados);
}

// Detalle por producto SUMANDO TODAS LAS RUTAS — para ver qué se vendió
// más en general, sin importar quién lo vendió. Incluye cuántas rutas
// distintas vendieron cada código.
export function detallePorProductoGlobal(registros) {
  const mapa = {};
  for (const r of registros) {
    if (!mapa[r.codigo]) {
      mapa[r.codigo] = { codigo: r.codigo, articulo: r.articulo, piezas: 0, pesos: 0, rutas: new Set() };
    }
    mapa[r.codigo].piezas += r.totalUnidades;
    mapa[r.codigo].pesos += r.totalPesos;
    mapa[r.codigo].rutas.add(r.rutaCodigo);
  }
  return Object.values(mapa)
    .map((g) => ({ ...g, numRutas: g.rutas.size, rutas: undefined }))
    .sort((a, b) => b.pesos - a.pesos);
}

// Para un producto específico, cuánto vendió cada ruta (usado al hacer
// clic en un producto dentro del detalle global).
export function ventasPorRutaDeProducto(registros, codigo) {
  const mapa = {};
  for (const r of registros) {
    if (r.codigo !== codigo) continue;
    if (!mapa[r.rutaCodigo]) {
      mapa[r.rutaCodigo] = { rutaCodigo: r.rutaCodigo, vendedorNombre: r.vendedorNombre, piezas: 0, pesos: 0 };
    }
    mapa[r.rutaCodigo].piezas += r.totalUnidades;
    mapa[r.rutaCodigo].pesos += r.totalPesos;
  }
  return Object.values(mapa).sort((a, b) => b.pesos - a.pesos);
}

export function totalesRuta(registros, rutaCodigo) {
  const filtrados = registros.filter((r) => r.rutaCodigo === rutaCodigo);
  const piezas = filtrados.reduce((s, r) => s + r.totalUnidades, 0);
  const pesos = filtrados.reduce((s, r) => s + r.totalPesos, 0);
  return { piezas, pesos };
}

// Objetivo OTC: $1,600 al día / $9,600 a la semana (6 días hábiles).
// Si la ruta cubre el objetivo semanal, la comisión es del 7%; si no lo
// cubre, es del 5.6%. No es un % fijo editable — se calcula solo según
// el total de la semana.
export const OBJETIVO_OTC_DIARIO = 1600;
export const OBJETIVO_OTC_SEMANAL = 9600;

export function cubreObjetivoOtc(totalPesosSemana) {
  return totalPesosSemana >= OBJETIVO_OTC_SEMANAL;
}

export function tasaComisionOtc(totalPesosSemana) {
  return cubreObjetivoOtc(totalPesosSemana) ? 0.07 : 0.056;
}

export function comisionOtc(totalPesosSemana) {
  return totalPesosSemana * tasaComisionOtc(totalPesosSemana);
}

// Resumen semanal por ruta (para la tabla de todas las rutas del staff).
// La comisión y la tasa se calculan solas según si cada ruta cubrió o
// no el objetivo semanal — no se recibe una tasa fija por parámetro.
export function resumenSemanaPorRuta(registros) {
  const mapa = {};
  for (const r of registros) {
    if (!mapa[r.rutaCodigo]) {
      mapa[r.rutaCodigo] = { rutaCodigo: r.rutaCodigo, vendedorNombre: r.vendedorNombre, piezas: 0, pesos: 0 };
    }
    mapa[r.rutaCodigo].piezas += r.totalUnidades;
    mapa[r.rutaCodigo].pesos += r.totalPesos;
  }
  return Object.values(mapa)
    .map((g) => {
      const tasa = tasaComisionOtc(g.pesos);
      return { ...g, tasa, comision: g.pesos * tasa, cubreObjetivo: cubreObjetivoOtc(g.pesos) };
    })
    .sort((a, b) => b.pesos - a.pesos);
}
