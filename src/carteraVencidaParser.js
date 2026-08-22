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
  const m = String(html || "").match(/<b>(.*?)<\/b>/i);
  return m ? m[1].trim() : String(html || "").trim();
}

function clasificarDocumento(doc) {
  const d = String(doc || "").trim();
  if (/^Factura/i.test(d)) return "Factura";
  if (/^eOrdering Credito/i.test(d)) return "eOrdering Credito";
  if (/^Credito Adicional/i.test(d)) return "Credito Adicional";
  if (/^Venta Credito/i.test(d)) return "Venta Credito";
  return "Otro";
}

export function parseCreditosRaw(rawText) {
  if (!rawText) return [];
  let texto = rawText.trim();
  // Quita el encabezado si viene pegado junto con los datos.
  texto = texto.replace(
    /^Agencia,Vendedor,Cliente,Nombre,Fecha,Hora,Vence,Documento,Estado,Importe,Cancelado,Saldo/i,
    ""
  );
  // Cada registro nuevo empieza con un patrón tipo "(12) - ".
  const partes = texto
    .split(/(?=\(\d+\)\s*-\s*)/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const registros = [];
  for (const parte of partes) {
    const campos = parte.split(",");
    if (campos.length < 12) continue; // registro incompleto/corrupto, se ignora
    const [
      agencia, vendedorRaw, clienteCodigo, clienteNombre, fechaRaw, hora,
      venceRaw, documentoRaw, estadoRaw, importeRaw, canceladoRaw, saldoRaw,
    ] = campos;

    const vendedorPartes = vendedorRaw.split(" - ").map((s) => s.trim());
    const rutaCodigo = vendedorPartes[0] || "";
    const vendedorNombre =
      vendedorPartes.length > 2 ? vendedorPartes.slice(2).join(" - ") : vendedorPartes[vendedorPartes.length - 1] || "";

    const documento = documentoRaw.replace(/\s+/g, " ").trim();

    registros.push({
      agencia: agencia.trim(),
      rutaCodigo,
      vendedorNombre,
      clienteCodigo: (clienteCodigo || "").trim(),
      clienteNombre: (clienteNombre || "").trim(),
      fecha: parseFechaMX(fechaRaw),
      hora: (hora || "").trim(),
      vence: parseFechaMX(venceRaw),
      documento,
      tipoDocumento: clasificarDocumento(documento),
      estado: limpiarEstado(estadoRaw), // "Corriente" | "Saldo"
      importe: parseFloat(importeRaw) || 0,
      cancelado: parseFloat(canceladoRaw) || 0,
      saldo: parseFloat(saldoRaw) || 0,
    });
  }
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
