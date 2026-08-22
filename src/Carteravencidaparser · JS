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

export function diasParaVencer(vence, hoy = new Date()) {
  if (!vence) return null;
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const v = new Date(vence.getFullYear(), vence.getMonth(), vence.getDate());
  return Math.round((v - h) / 86400000);
}

export function esVencido(r) {
  return r.saldo > 0 && r.estado === "Saldo";
}

export function esProximoAVencer(r, diasUmbral = 3, hoy = new Date()) {
  if (r.saldo <= 0 || r.estado !== "Corriente") return false;
  const dias = diasParaVencer(r.vence, hoy);
  return dias !== null && dias >= 0 && dias <= diasUmbral;
}

// Resumen por ruta — incluye el conteo de "créditos registrados"
// (Venta Credito + eOrdering Credito + Credito Adicional, es decir todo
// lo que no es Factura) tomado de este mismo archivo de cartera.
export function resumenPorRuta(registros, diasUmbral = 3, hoy = new Date()) {
  const mapa = {};
  for (const r of registros) {
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
  return registros.some((r) => r.rutaCodigo === rutaCodigo && esVencido(r));
}

export function hayCarteraProximaPara(data, rutaCodigo, diasUmbral = 3) {
  const registros = data?.carteraVencida?.registros || [];
  return registros.some((r) => r.rutaCodigo === rutaCodigo && esProximoAVencer(r, diasUmbral));
}

// Para el badge del Staff (Supervisor-1 / Gerente) — cualquier ruta con
// algo vencido, sin importar cuál.
export function hayCarteraVencidaGlobal(data) {
  const registros = data?.carteraVencida?.registros || [];
  return registros.some(esVencido);
}
