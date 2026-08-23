// =============================================================
// Parser del reporte "clientes visitados" por NUR — viene con las filas
// todas pegadas, sin saltos de línea (mismo tipo de formato que el
// reporte de cartera de créditos). Cada fila empieza con un NUR de la
// forma "802878D0XX" (6 dígitos + "D" + 3 dígitos), así que se corta el
// texto justo antes de cada NUR en vez de por líneas.
//
// Encabezado real: NUR,Cliente,Nombre,Direccion,Colonia,Potencial,
// Estado,Municipio,Localidad — pero de todos esos campos solo hacen
// falta NUR y Cliente (código) para saber quién fue visitado; el resto
// (nombre, dirección, etc.) no se usa aquí, así que ni se intenta leer
// más allá del segundo campo — evita problemas con campos como
// "Localidad" que a veces traen una coma adentro (ej. "TUITO, EL").
// =============================================================

export const RUTA_POR_NUR = {
  "802878D043": "J201",
  "802878D044": "J202",
  "802878D045": "J203",
  "802878D046": "J204",
  "802878D047": "J205",
  "802878D048": "J206",
  "802878D049": "J207",
};

export function parseVisitasNurRaw(texto) {
  if (!texto) return [];
  const limpio = String(texto).trim();
  const partes = limpio.split(/(?=\d{6}D\d{3})/g).map((p) => p.trim()).filter(Boolean);
  const registros = [];
  for (const parte of partes) {
    if (!/^\d{6}D\d{3}/.test(parte)) continue; // se salta el encabezado ("NUR,Cliente,...")
    const primeraComa = parte.indexOf(",");
    if (primeraComa === -1) continue;
    const nur = parte.slice(0, primeraComa).trim();
    const resto = parte.slice(primeraComa + 1);
    const segundaComa = resto.indexOf(",");
    const codigoCliente = (segundaComa === -1 ? resto : resto.slice(0, segundaComa)).trim();
    if (!codigoCliente) continue;
    registros.push({ nur, rutaCodigo: RUTA_POR_NUR[nur] || null, codigoCliente });
  }
  return registros;
}
