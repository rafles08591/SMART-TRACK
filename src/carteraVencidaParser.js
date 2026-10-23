// =============================================================
// Parser de cartera / créditos — mismo tipo de export "pegado sin
// saltos de línea" que ya usas para Pedidos del Día (PowerStreet).
//
// Columnas esperadas por registro:
// Agencia,Vendedor,Cliente,Nombre,Fecha,Hora,Vence,Documento,Estado,
// Importe,Cancelado,Saldo
//
// El "Vendedor" viene como "J201 - J201 - NOMBRE COMPLETO" (código
// repetido). El "Estado" viene envuelto en <font><b>Corriente</b></font>
// o <font><b>Saldo</b></font> — ese campo ya indica si el documento
// está vencido (Saldo, en rojo) o no (Corriente), según el sistema de
// origen, así que se respeta esa clasificación en vez de recalcularla.
// =============================================================

function parseFechaMX(str) {
  if (!str) return null;
  const [fechaParte] = String(str).trim().split(" ");
  const [d, m, y] = (fechaParte || "").split("/").map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function limpiarEstado(html) {
  // Antes venía como <font><b>Saldo</b></font>; ahora viene en texto plano ("Saldo" / "Corriente")
  const texto = String(html || "").replace(/<[^>]*>/g, "").trim();
  if (/^saldo$/i.test(texto)) return "Saldo";
  if (/^corriente$/i.test(texto)) return "Corriente";
  return texto;
}

function clasificarDocumento(doc) {
  const d = String(doc || "").trim();
  if (/^Factura/i.test(d)) return "Factura";
  if (/^eOrdering Credito/i.test(d)) return "eOrdering Credito";
  if (/^Credito Adicional/i.test(d)) return "Credito Adicional";
  if (/^Venta Credito/i.test(d)) return "Venta Credito";
  return "Otro";
}

// Columnas que se buscan por NOMBRE en el encabezado (así no importa si PowerStreet agrega
// o mueve columnas — en oct-2026 agregó "Repartidor" después de "Vendedor").
const COLUMNAS_VIEJAS = ["agencia", "vendedor", "cliente", "nombre", "fecha", "hora", "vence", "documento", "estado", "importe", "cancelado", "saldo"];
const normCol = (s) => String(s || "").replace(/<[^>]*>/g, " ").trim().toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

// Plan B: si cambia el encabezado de forma rara, cada renglón se interpreta por su contenido:
//   ruta "J201 - …", fechas dd/mm/aaaa (la 1ª es la venta, la 2ª el vencimiento), hora hh:mm:ss,
//   documento "Venta Credito…/Factura…", estado "Corriente/Saldo" y al final Importe, Cancelado, Saldo.
function leerPorContenido(texto) {
  const partes = (texto.includes("\n") ? texto.split("\n") : texto.split(/(?=\(\d+\)\s*-\s*)/g)).map((p) => p.trim()).filter(Boolean);
  const registros = [];
  for (const parte of partes) {
    const c = parte.split(",").map((x) => x.trim());
    const iVen = c.findIndex((x) => /^J\d{3}\s*-/i.test(x));
    const fechas = c.map((x, i) => [x, i]).filter(([x]) => /^\d{1,2}\/\d{1,2}\/\d{4}/.test(x));
    const iEst = c.findIndex((x) => /^(<[^>]*>)*\s*(corriente|saldo)\s*(<[^>]*>)*$/i.test(x));
    const iDoc = c.findIndex((x) => /(venta|factura|credito|ordering|nota)/i.test(x) && !/^J\d{3}/i.test(x));
    const nums = c.map((x, i) => [x, i]).filter(([x, i]) => i > Math.max(iEst, iDoc) && /^-?\d+(\.\d+)?$/.test(x));
    if (iVen < 0 || fechas.length < 2 || nums.length < 1) continue;
    const vp = c[iVen].split(" - ").map((s) => s.trim());
    const n = (k) => parseFloat(nums[k]?.[0]) || 0;
    const documento = iDoc >= 0 ? c[iDoc].replace(/\s+/g, " ") : "";
    // Cliente y nombre: los dos campos de texto entre la ruta y la primera fecha (saltando vacíos)
    const entre = c.slice(iVen + 1, fechas[0][1]).filter(Boolean);
    registros.push({
      agencia: c[0] || "",
      rutaCodigo: vp[0],
      vendedorNombre: vp.length > 2 ? vp.slice(2).join(" - ") : vp[vp.length - 1] || "",
      clienteCodigo: entre.length > 1 ? entre[0] : "",
      clienteNombre: entre.length > 1 ? entre.slice(1).join(",") : entre[0] || "",
      fecha: parseFechaMX(fechas[0][0]),
      hora: (c.find((x) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(x)) || ""),
      vence: parseFechaMX(fechas[1][0]),
      documento,
      tipoDocumento: clasificarDocumento(documento),
      estado: iEst >= 0 ? limpiarEstado(c[iEst]) : "",
      importe: nums.length >= 3 ? n(nums.length - 3) : n(0),
      cancelado: nums.length >= 3 ? n(nums.length - 2) : 0,
      saldo: n(nums.length - 1),
    });
  }
  return registros;
}

export function parseCreditosRaw(rawText) {
  if (!rawText) return [];
  let texto = String(rawText).replace(/\r/g, "").trim();

  // 1) Encabezado: si viene, de ahí salen las posiciones de cada columna.
  let columnas = COLUMNAS_VIEJAS;
  // Encabezado: el primer renglón si trae nombres de columna (Saldo, Vence…) en cualquier orden
  const primera = texto.split("\n")[0];
  const mEnc = texto.includes("\n")
    ? (/saldo/i.test(primera) && /venc/i.test(primera) && !/^\(\d+\)/.test(primera) ? [primera] : null)
    : texto.match(/^Agencia,[^\n(]*?Saldo(?=\s|\(|$)/i); // pegado sin saltos de línea
  if (mEnc) {
    columnas = mEnc[0].split(",").map(normCol);
    texto = texto.slice(mEnc[0].length).trim();
  }
  // Busca la columna por nombre exacto o parecido ("Vendedor/Reparto", "Fecha Vencimiento", "Saldo Pendiente"…)
  const pos = (...nombres) => {
    for (const n of nombres) { const i = columnas.indexOf(n); if (i >= 0) return i; }
    for (const n of nombres) { const i = columnas.findIndex((c) => c.split(/[\s/._-]+/).includes(n) || c.startsWith(n)); if (i >= 0) return i; }
    return -1;
  };
  const idx = {
    agencia: pos("agencia"), vendedor: pos("vendedor", "ruta", "reparto"), cliente: pos("cliente", "codigo"),
    nombre: pos("nombre", "razon social"), fecha: pos("fecha"), hora: pos("hora"),
    vence: pos("vence", "vencimiento", "fecha vencimiento"), documento: pos("documento", "doc"),
    estado: pos("estado", "status"), importe: pos("importe", "total"), cancelado: pos("cancelado", "abono", "pagado"),
    saldo: pos("saldo", "pendiente"),
  };
  // Que "Fecha" no sea la misma columna que "Vence"
  if (idx.fecha === idx.vence) idx.fecha = columnas.findIndex((c, i) => i !== idx.vence && c.startsWith("fecha"));
  // Si el encabezado no se entiende, se leen las columnas por lo que traen (ver leerPorContenido)
  if (idx.vendedor < 0 || idx.saldo < 0 || idx.vence < 0) return leerPorContenido(texto);
  const minimo = Math.max(...Object.values(idx)) + 1;

  // 2) Registros: uno por renglón; si vino pegado sin saltos, cada registro empieza con "(12) - ".
  const partes = (texto.includes("\n") ? texto.split("\n") : texto.split(/(?=\(\d+\)\s*-\s*)/g))
    .map((p) => p.trim())
    .filter(Boolean);

  const registros = [];
  for (const parte of partes) {
    let campos = parte.split(",");
    if (campos.length < minimo) continue; // registro incompleto/corrupto, se ignora
    // Si el nombre del cliente traía comas, sobran campos: se juntan en "Nombre"
    const sobran = campos.length - columnas.length;
    if (sobran > 0 && idx.nombre >= 0) {
      campos = [
        ...campos.slice(0, idx.nombre),
        campos.slice(idx.nombre, idx.nombre + sobran + 1).join(","),
        ...campos.slice(idx.nombre + sobran + 1),
      ];
    }
    const val = (k) => (idx[k] >= 0 ? String(campos[idx[k]] ?? "") : "");

    const vendedorPartes = val("vendedor").split(" - ").map((s) => s.trim());
    const rutaCodigo = vendedorPartes[0] || "";
    if (!/^J\w+/i.test(rutaCodigo)) continue; // renglones de totales u otros
    const vendedorNombre =
      vendedorPartes.length > 2 ? vendedorPartes.slice(2).join(" - ") : vendedorPartes[vendedorPartes.length - 1] || "";

    const documento = val("documento").replace(/\s+/g, " ").trim();

    registros.push({
      agencia: val("agencia").trim(),
      rutaCodigo,
      vendedorNombre,
      clienteCodigo: val("cliente").trim(),
      clienteNombre: val("nombre").trim(),
      fecha: parseFechaMX(val("fecha")),
      hora: val("hora").trim(),
      vence: parseFechaMX(val("vence")),
      documento,
      tipoDocumento: clasificarDocumento(documento),
      estado: limpiarEstado(val("estado")), // "Corriente" | "Saldo"
      importe: parseFloat(val("importe")) || 0,
      cancelado: parseFloat(val("cancelado")) || 0,
      saldo: parseFloat(val("saldo")) || 0,
    });
  }
  // Si con el encabezado no salió nada, se intenta leyendo cada renglón por su contenido
  if (!registros.length) return leerPorContenido(texto);
  return registros;
}

// Convierte de forma segura a Date, ya sea que venga como objeto Date
// (recién pegado) o como string ISO (recargado desde Supabase — al
// guardar en el blob JSON, las fechas se serializan a texto).
export function aFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor) ? null : valor;
  const d = new Date(valor);
  return isNaN(d) ? null : d;
}

// Solo clientes/documentos cuya fecha (de la venta/factura, no del
// vencimiento) sea del mismo año en curso — descarta cartera vieja
// (ej. saldos de 2018/2019/2023 que ya no son cartera activa real).
export function esDeEsteAno(r, hoy = new Date()) {
  const f = aFecha(r.fecha);
  const h = aFecha(hoy) || new Date();
  return !!f && f.getFullYear() === h.getFullYear();
}

// Plazo original del crédito, en días (de la fecha del documento a su
// fecha de vencimiento) — no confundir con "días para vencer" (que se
// cuenta desde hoy).
export function plazoDias(r) {
  const f = aFecha(r.fecha);
  const v = aFecha(r.vence);
  if (!f || !v) return null;
  return Math.round((v - f) / 86400000);
}

export function diasParaVencer(vence, hoy = new Date()) {
  const v = aFecha(vence);
  const h = aFecha(hoy) || new Date();
  if (!v) return null;
  const hLimpio = new Date(h.getFullYear(), h.getMonth(), h.getDate());
  const vLimpio = new Date(v.getFullYear(), v.getMonth(), v.getDate());
  return Math.round((vLimpio - hLimpio) / 86400000);
}

export function esVencido(r) {
  return r.saldo > 0 && r.estado === "Saldo";
}

// "Próximo a vencer" además exige que el plazo ORIGINAL del crédito
// haya sido mayor a 7 días — documentos con plazos muy cortos (venta de
// contado a unos días, por ejemplo) no cuentan aquí, aunque su fecha de
// corte esté cerca.
export function esProximoAVencer(r, diasUmbral = 3, hoy = new Date()) {
  if (r.saldo <= 0 || r.estado !== "Corriente") return false;
  const plazo = plazoDias(r);
  if (plazo === null || plazo <= 7) return false;
  const dias = diasParaVencer(r.vence, hoy);
  return dias !== null && dias >= 0 && dias <= diasUmbral;
}

// Resumen por ruta — incluye el conteo de "créditos registrados"
// (Venta Credito + eOrdering Credito + Credito Adicional, es decir todo
// lo que no es Factura) tomado de este mismo archivo de cartera. Solo
// considera clientes/documentos de este año (ver esDeEsteAno).
export function resumenPorRuta(registros, diasUmbral = 3, hoy = new Date()) {
  const mapa = {};
  for (const r of registros) {
    if (!esDeEsteAno(r, hoy)) continue;
    if (!mapa[r.rutaCodigo]) {
      mapa[r.rutaCodigo] = {
        rutaCodigo: r.rutaCodigo,
        vendedorNombre: r.vendedorNombre,
        vencidos: 0,
        vencidosSaldo: 0,
        proximos: 0,
        proximosSaldo: 0,
        creditosRegistrados: 0,
      };
    }
    const g = mapa[r.rutaCodigo];
    if (r.tipoDocumento !== "Factura") g.creditosRegistrados += 1;
    if (esVencido(r)) {
      g.vencidos += 1;
      g.vencidosSaldo += r.saldo;
    } else if (esProximoAVencer(r, diasUmbral, hoy)) {
      g.proximos += 1;
      g.proximosSaldo += r.saldo;
    }
  }
  return Object.values(mapa).sort((a, b) => b.vencidosSaldo - a.vencidosSaldo);
}

// Para el badge de la pestaña del vendedor (mismo patrón que
// unidadYaRegistradaHoy / hayAvisoNuevoPara en el resto de la app).
export function hayCarteraVencidaPara(data, rutaCodigo) {
  const registros = data?.carteraVencida?.registros || [];
  return registros.some((r) => r.rutaCodigo === rutaCodigo && esDeEsteAno(r) && esVencido(r));
}

export function hayCarteraProximaPara(data, rutaCodigo, diasUmbral = 3) {
  const registros = data?.carteraVencida?.registros || [];
  return registros.some((r) => r.rutaCodigo === rutaCodigo && esDeEsteAno(r) && esProximoAVencer(r, diasUmbral));
}

// Para el badge del Staff (Supervisor-1 / Gerente) — cualquier ruta con
// algo vencido, sin importar cuál.
export function hayCarteraVencidaGlobal(data) {
  const registros = data?.carteraVencida?.registros || [];
  return registros.some((r) => esDeEsteAno(r) && esVencido(r));
}
