// @ts-nocheck
// Catálogo de productos para FACTURAS: cuántas CAJETILLAS trae cada paquete
// de cada código FA. La mayoría trae 10; unos cuantos (marcados abajo) traen 8.
//
// IMPORTANTE: esta lista se armó con la captura que compartiste — si hay más
// códigos FA que no están aquí, agrégalos con el mismo formato. Si un código
// no aparece en esta tabla, se asume 10 cajetillas por paquete por default
// (ver PRODUCTO_DEFAULT_UNIDADES abajo) — verifica que ese default sea
// correcto para cualquier código que falte.
export const PRODUCTOS_FACTURABLES = {
  FA01001: { nombre: "MlbRed20CD", unidadesPorPaquete: 10 },
  FA01003: { nombre: "MlbRed14CD", unidadesPorPaquete: 10 },
  FA01006: { nombre: "MlbRcp20CD", unidadesPorPaquete: 10 },
  FA01009: { nombre: "MlbGcp20CD", unidadesPorPaquete: 10 },
  FA01014: { nombre: "MlbXpr20CD", unidadesPorPaquete: 10 },
  FA01019: { nombre: "MlbRed20CS", unidadesPorPaquete: 10 },
  FA01022: { nombre: "MlbXpr14CD", unidadesPorPaquete: 10 },
  FA01025: { nombre: "MlbKtk20CD", unidadesPorPaquete: 10 },
  FA01038: { nombre: "MlbRby14CD", unidadesPorPaquete: 10 },
  FA01042: { nombre: "MlbSum20CD", unidadesPorPaquete: 10 },
  FA01045: { nombre: "MlbRby20CD", unidadesPorPaquete: 10 },
  FA01046: { nombre: "MlbGol20CD", unidadesPorPaquete: 10 },
  FA01047: { nombre: "MlbGol14CD", unidadesPorPaquete: 10 },
  FA01049: { nombre: "MlbGol20CS", unidadesPorPaquete: 10 },
  FA01050: { nombre: "MlbVel20CD", unidadesPorPaquete: 10 },
  FA01054: { nombre: "MlbGdn20CD", unidadesPorPaquete: 10 },
  FA01055: { nombre: "MlbArc20CD", unidadesPorPaquete: 10 },
  FA01065: { nombre: "MlbBlo20CD", unidadesPorPaquete: 10 },
  FA01081: { nombre: "MlbCft25CD", unidadesPorPaquete: 8 },
  FA01082: { nombre: "MlbCft15CD", unidadesPorPaquete: 8 },
  FA01083: { nombre: "MlbCft20CD", unidadesPorPaquete: 10 },
  FA01084: { nombre: "MlbCrG20CD", unidadesPorPaquete: 10 },
  FA01085: { nombre: "MlbIcM20CD", unidadesPorPaquete: 10 }, // ICE MIX
  FA01114: { nombre: "CftBlossMixB20", unidadesPorPaquete: 10 }, // BLOSS MIX
  FA01115: { nombre: "CftSummMixB20", unidadesPorPaquete: 10 }, // SUMM MIX
  FA019905: { nombre: "MlbCar20CD", unidadesPorPaquete: 10 },
  FA02039: { nombre: "DlcOvl18PQ", unidadesPorPaquete: 10 },
  FA03001: { nombre: "B&HMnt20CD", unidadesPorPaquete: 10 },
  FA03019: { nombre: "B&HMpr20CD", unidadesPorPaquete: 10 },
  FA03022: { nombre: "B&HGpr20CD", unidadesPorPaquete: 10 },
  FA03023: { nombre: "B&HCvi20CD", unidadesPorPaquete: 10 },
  FA03024: { nombre: "B&HCbl20CD", unidadesPorPaquete: 10 },
  FA03026: { nombre: "B&HDor20CD", unidadesPorPaquete: 10 },
  FA04013: { nombre: "FarOgl14CD", unidadesPorPaquete: 10 },
  FA04014: { nombre: "FarOgl20CD", unidadesPorPaquete: 10 },
  FA04015: { nombre: "FarOgl25CD", unidadesPorPaquete: 8 },
  FA04016: { nombre: "Faritos25CD", unidadesPorPaquete: 8 }, // FARONET
  FA04017: { nombre: "Faritos20CD", unidadesPorPaquete: 10 }, // FARONET
  FA04505: { nombre: "MLBCRTRBMNT20", unidadesPorPaquete: 10 },
  FA09052: { nombre: "L&MRed25CD", unidadesPorPaquete: 8 },
  FA15003: { nombre: "L&MRed20CD", unidadesPorPaquete: 10 },
  FA15005: { nombre: "L&MRed14CD", unidadesPorPaquete: 10 },
  FA15009: { nombre: "BARONET25CD", unidadesPorPaquete: 8 }, // FARONET
  FA15010: { nombre: "BARONET20CD", unidadesPorPaquete: 10 }, // FARONET
};

// Si aparece un código FA que no está en la lista de arriba, se usa este
// default. Avísame si algún código faltante NO trae 10 cajetillas por
// paquete para agregarlo a la tabla con su valor real.
export const PRODUCTO_DEFAULT_UNIDADES = 10;

export function infoProducto(codigoFA) {
  const cod = String(codigoFA || "").trim().toUpperCase();
  return PRODUCTOS_FACTURABLES[cod] || { nombre: cod, unidadesPorPaquete: PRODUCTO_DEFAULT_UNIDADES };
}

// Convierte "paquetes" (tal como viene en el reporte de ventas) a
// "cajetillas" reales, usando las unidades por paquete del producto
// específico — así un producto de 8 cajetillas por paquete (ej. FA01081)
// convierte distinto que uno de 10 (ej. FA01001), y una fracción como 0.38
// da el número real de cajetillas (0.38 × 8 = 3.04) en vez de asumir base 10
// para todos.
export function paquetesACajetillas(codigoFA, paquetesReportados) {
  const { unidadesPorPaquete } = infoProducto(codigoFA);
  return (Number(paquetesReportados) || 0) * unidadesPorPaquete;
}
