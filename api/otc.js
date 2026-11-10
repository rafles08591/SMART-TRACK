// api/otc.js — Pedidos OTC: lo usan el flujo de n8n, SMART-TRACK y la página pública del catálogo.
// Fuente de datos: Supabase (clientes_otc, pedidos_otc, catalogo_otc). Ya no Google Sheets.
//
// PÚBLICO (página /catalogo.html, sin sesión):
//   GET  /api/otc?accion=pendientes  → cuántos pedidos nuevos (sin surtir) hay, total y por ruta (para los avisos)
//   GET  /api/otc?accion=precios[&q=vuala]  → lista corta en texto (la consulta Paulina, el bot de n8n)
//   GET  /api/otc?accion=catalogo[&c=<telefono.firma>]  → productos activos con precio final + datos del cliente si el link es suyo
//   POST /api/otc  { accion:'pedido_web', c, nombre?, nota?, items:[{ id, cantidad }] }
//        → c obligatorio: viene firmado en el botón de la plantilla (el teléfono que tenemos registrado)
//        → el precio y la promoción se calculan aquí (no se confía en lo que mande el navegador)
//
// SESIÓN de SMART-TRACK (Authorization: Bearer <token>) o BOT:
//   GET  /api/otc?accion=link&telefono=5232…  → link personal del cliente al catálogo
//   POST /api/otc  { accion:'invitar', telefono }  → le manda la plantilla oficial de WhatsApp con su botón al catálogo
//        (variables: WHATSAPP_TOKEN obligatorio · WHATSAPP_PHONE_ID · OTC_PLANTILLA · OTC_PLANTILLA_IMAGEN)
//
// BOT (header x-bot-token: <BOT_TOKEN>, el mismo de Robotina):
//   GET  /api/otc?accion=clientes_dia&dia=LUNES
//   GET  /api/otc?accion=cliente&telefono=5232…   → incluye "link" al catálogo
//   POST /api/otc  { accion:'pedido', telefono, nombre, origen, productos:[{codigo,producto,cantidad,precio}], texto, total }
//
// Variables opcionales: OTC_LINK_SECRET (si no, usa BOT_TOKEN) · OTC_AVISO_WEBHOOK (webhook de n8n que avisa
// al supervisor de cada pedido hecho en la página) · OTC_CATALOGO_URL (por defecto <este dominio>/catalogo.html)

import { autorizado } from './_wa-lib.js';

export const config = { runtime: 'edge' };

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SECRETO = process.env.OTC_LINK_SECRET || process.env.BOT_TOKEN || '';
const AVISO = process.env.OTC_AVISO_WEBHOOK || '';
// Invitación oficial de WhatsApp (plantilla con botón al catálogo) que se manda al dar de alta un cliente
const WA_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '837534606114144';
const PLANTILLA = process.env.OTC_PLANTILLA || 'ventas_otc_2';
const PLANTILLA_IMG = process.env.OTC_PLANTILLA_IMAGEN || 'https://jxyosutthiuzbrmdznoa.supabase.co/storage/v1/object/public/fondos_personal/catalogootc.jpg';

const headers = (extra = {}) => {
  const h = { apikey: KEY, 'Content-Type': 'application/json', ...extra };
  if (!KEY.startsWith('sb_')) h.Authorization = `Bearer ${KEY}`;
  return h;
};
const json = (o, status = 200, cache = 'no-store') => new Response(JSON.stringify(o), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': cache, 'Access-Control-Allow-Origin': '*' },
});

async function rest(path, opciones = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opciones, headers: headers(opciones.headers) });
  const t = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

// 5213221234567 / +52 1 322… / 3221234567 → 523221234567
export function normTel(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 10) d = '52' + d;
  if (d.startsWith('521') && d.length === 13) d = '52' + d.slice(3);
  return d;
}
const normRuta = (r) => {
  const m = String(r || '').toUpperCase().match(/J\s*-?\s*(\d{3})|\b(\d{3})\b/);
  return m ? `J${m[1] || m[2]}` : String(r || '').trim().toUpperCase();
};
const normDia = (d) => String(d || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const redondea = (n) => Math.round(n * 100) / 100;
const hoyMX = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

// ---------- link personal del cliente: ?c=<telefono>.<firma>
async function firma(tel) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(SECRETO || 'smart-track'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`otc|${tel}`));
  return [...new Uint8Array(sig)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function linkCliente(req, tel) {
  const base = process.env.OTC_CATALOGO_URL || `${new URL(req.url).origin}/catalogo.html`;
  return `${base}?c=${tel}.${await firma(tel)}`;
}
// Tolerante: WhatsApp/Meta a veces le agrega cosas al link (?fbclid=…, %2E, espacios). Se toma solo "<12 dígitos>.<16 hex>".
export function partesLink(c) {
  let t = String(c || '');
  try { t = decodeURIComponent(t); } catch { /* ya venía decodificado */ }
  // si viene pegado al ejemplo de la plantilla (…c=EJEMPLO<real>) se toma el ÚLTIMO, que es el del cliente
  const todos = [...t.matchAll(/(\d{12})\D{0,3}([0-9a-f]{16})/gi)];
  const m = todos[todos.length - 1];
  return m ? [m[1], m[2].toLowerCase()] : null;
}
async function telDeLink(c) {
  const p = partesLink(c);
  if (!p) return null;
  return (await firma(p[0])) === p[1] ? p[0] : null;
}

async function sesionValida(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL || !KEY) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
  return r.ok;
}

// ---------- precios y promociones
function promoVigente(p, hoy = hoyMX()) {
  const tiene = Number(p.precio_promo) > 0 || Number(p.descuento_pct) > 0;
  if (!tiene) return false;
  if (p.promo_desde && p.promo_desde > hoy) return false;
  if (p.promo_hasta && p.promo_hasta < hoy) return false;
  return true;
}
function precioPromo(p) {
  if (Number(p.precio_promo) > 0) return redondea(Number(p.precio_promo));
  return redondea(Number(p.precio) * (1 - Math.min(Number(p.descuento_pct), 100) / 100));
}
// precio por pieza según la cantidad (la promo puede pedir mínimo de piezas)
export function precioPara(p, cantidad, hoy) {
  const normal = redondea(Number(p.precio) || 0);
  if (promoVigente(p, hoy) && cantidad >= (Number(p.promo_min) || 1)) return { precio: precioPromo(p), normal, promo: true };
  return { precio: normal, normal, promo: false };
}
function paraCliente(p, hoy) {
  const vig = promoVigente(p, hoy);
  return {
    id: p.id, codigo: p.codigo, nombre: p.nombre, categoria: p.categoria || 'Otros', presentacion: p.presentacion || '',
    descripcion: p.descripcion || '', imagen: p.imagen_url || '', destacado: !!p.destacado, orden: p.orden ?? 100,
    precio: redondea(Number(p.precio)),
    promo: vig ? { precio: precioPromo(p), min: Number(p.promo_min) || 1, texto: p.promo_texto || '', hasta: p.promo_hasta || null,
      pct: Number(p.precio_promo) > 0 ? Math.round((1 - Number(p.precio_promo) / Number(p.precio)) * 100) : Number(p.descuento_pct) } : null,
  };
}
const productosActivos = () => rest('catalogo_otc?activo=eq.true&precio=gt.0&select=*&order=orden.asc,nombre.asc');

async function guardarPedido(fila) {
  const [nuevo] = await rest('pedidos_otc', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(fila) });
  return nuevo;
}
async function avisar(pedido) {
  if (!AVISO) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    await fetch(AVISO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedido }), signal: ctrl.signal });
    clearTimeout(t);
  } catch { /* el pedido ya quedó guardado; el aviso es extra */ }
}

export default async function handler(req) {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST' } });
  let body = {};
  if (req.method === 'POST') body = await req.json().catch(() => ({}));
  const accion = body.accion || url.searchParams.get('accion');

  try {
    // ======================= PÚBLICO =======================
    if (req.method === 'GET' && accion === 'catalogo') {
      const hoy = hoyMX();
      const tel = await telDeLink(url.searchParams.get('c'));
      const [prods, cli] = await Promise.all([
        productosActivos(),
        tel ? rest(`clientes_otc?telefono=eq.${tel}&select=nombre,ruta,dia_visita,codigo_cliente`) : Promise.resolve([]),
      ]);
      return json({
        productos: prods.map((p) => paraCliente(p, hoy)),
        cliente: cli[0] ? { nombre: cli[0].nombre, ruta: normRuta(cli[0].ruta), dia_visita: cli[0].dia_visita } : null,
        identificado: !!tel,
      }, 200, 'no-store');
    }

    if (req.method === 'GET' && accion === 'pendientes') {
      const filas = await rest('pedidos_otc?estado=eq.nuevo&select=ruta&limit=2000');
      const porRuta = {};
      for (const f of filas) { const r = f.ruta || 'SIN RUTA'; porRuta[r] = (porRuta[r] || 0) + 1; }
      return json({ total: filas.length, porRuta });
    }

    if (req.method === 'GET' && accion === 'precios') {
      const hoy = hoyMX();
      const q = normDia(url.searchParams.get('q') || ''); // sin acentos y en mayúsculas
      const lista = (await productosActivos()).map((p) => paraCliente(p, hoy))
        .filter((p) => !q || normDia(`${p.nombre} ${p.categoria} ${p.presentacion} ${p.codigo}`).includes(q));
      const lineas = lista.map((p) => {
        let t = `- ${p.nombre}${p.presentacion ? ` (${p.presentacion})` : ''} · ${p.categoria} · $${p.precio}`;
        if (p.promo) t += ` · PROMO: $${p.promo.precio}${p.promo.min > 1 ? ` c/u llevando ${p.promo.min} o más` : ''}${p.promo.texto ? ` (${p.promo.texto})` : ''}${p.promo.hasta ? ` hasta ${p.promo.hasta}` : ''}`;
        if (p.descripcion) t += ` · ${p.descripcion.slice(0, 120)}`;
        return t;
      });
      const texto = lineas.length
        ? `Catálogo Marjus al ${hoy} (${lineas.length} productos, precios en pesos por la presentación indicada):\n${lineas.join('\n')}`
        : (q ? `No hay productos que coincidan con "${url.searchParams.get('q')}" en el catálogo.` : 'El catálogo todavía no tiene productos activos con precio.');
      return new Response(texto, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
    }

    if (req.method === 'POST' && accion === 'pedido_web') {
      const hoy = hoyMX();
      const telLink = await telDeLink(body.c);
      // El cliente se identifica SOLO con el link firmado del botón de WhatsApp (el teléfono que tenemos registrado).
      if (!telLink) return json({ error: 'Abre el catálogo desde el botón CATÁLOGO del WhatsApp que te enviamos.' }, 401);
      const tel = telLink;
      const nombreEscrito = String(body.nombre || '').trim().slice(0, 80);
      const pedidos = (Array.isArray(body.items) ? body.items : []).slice(0, 80)
        .map((i) => ({ id: Number(i.id), cantidad: Math.floor(Number(i.cantidad)) }))
        .filter((i) => i.id && i.cantidad > 0 && i.cantidad <= 999);
      if (!pedidos.length) return json({ error: 'Tu carrito está vacío.' }, 400);

      const prods = await rest(`catalogo_otc?id=in.(${[...new Set(pedidos.map((i) => i.id))].join(',')})&activo=eq.true&select=*`);
      const porId = new Map(prods.map((p) => [p.id, p]));
      const productos = [];
      for (const i of pedidos) {
        const p = porId.get(i.id);
        if (!p || !(Number(p.precio) > 0)) continue;
        const pr = precioPara(p, i.cantidad, hoy);
        productos.push({ id: p.id, codigo: p.codigo || null, producto: p.nombre + (p.presentacion ? ` (${p.presentacion})` : ''), cantidad: i.cantidad,
          precio: pr.precio, precio_normal: pr.normal, promo: pr.promo, importe: redondea(pr.precio * i.cantidad) });
      }
      if (!productos.length) return json({ error: 'Los productos de tu carrito ya no están disponibles. Recarga la página.' }, 409);
      const total = redondea(productos.reduce((s, x) => s + x.importe, 0));
      const ahorro = redondea(productos.reduce((s, x) => s + (x.precio_normal - x.precio) * x.cantidad, 0));

      const cli = (await rest(`clientes_otc?telefono=eq.${tel}&select=*`))[0] || {};
      if (!cli.telefono && nombreEscrito.length < 2) return json({ error: 'Escribe el nombre de tu negocio.' }, 400);
      const nota = String(body.nota || '').trim().slice(0, 300);
      const pedido = await guardarPedido({
        telefono: tel,
        codigo_cliente: cli.codigo_cliente || null,
        nombre: cli.nombre || nombreEscrito || null,
        ruta: cli.ruta ? normRuta(cli.ruta) : null,
        dia_visita: cli.dia_visita || null,
        origen: 'web',
        productos,
        texto: productos.map((p) => `${p.cantidad} x ${p.producto} · $${p.importe}${p.promo ? ' (promo)' : ''}`).join('\n'),
        total,
        nota: [nota, !cli.telefono ? 'Cliente NO registrado en la base de la cuponera' : ''].filter(Boolean).join(' · ') || null,
      });
      await avisar(pedido);
      return json({ ok: true, folio: pedido.id, total, ahorro, dia_visita: pedido.dia_visita, registrado: !!cli.telefono,
        nombre: pedido.nombre, c: cli.telefono ? `${tel}.${await firma(tel)}` : null });
    }

    // ======================= SESIÓN o BOT =======================
    if (req.method === 'GET' && accion === 'link') {
      if (!autorizado(req) && !(await sesionValida(req))) return json({ error: 'no autorizado' }, 401);
      const tel = normTel(url.searchParams.get('telefono'));
      if (tel.length !== 12) return json({ error: 'teléfono inválido' }, 400);
      return json({ telefono: tel, c: `${tel}.${await firma(tel)}`, link: await linkCliente(req, tel) });
    }

    if (req.method === 'POST' && accion === 'invitar') {
      if (!autorizado(req) && !(await sesionValida(req))) return json({ error: 'no autorizado' }, 401);
      if (!WA_TOKEN) return json({ error: 'Falta la variable WHATSAPP_TOKEN en Vercel.' }, 500);
      const tel = normTel(body.telefono);
      const cli = (await rest(`clientes_otc?telefono=eq.${tel}&select=telefono,nombre,invitado_en`))[0];
      if (!cli) return json({ error: 'Ese cliente no está registrado.' }, 404);
      if (cli.invitado_en && Date.now() - new Date(cli.invitado_en).getTime() < 2 * 60 * 1000) {
        return json({ error: 'Ya se le mandó hace menos de 2 minutos. Espera un poco antes de reenviar.' }, 429);
      }
      const nombre = String(cli.nombre || 'cliente').split(/\s+/).slice(0, 3).join(' ');
      const r = await fetch(`https://graph.facebook.com/v22.0/${WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: tel, type: 'template',
          template: { name: PLANTILLA, language: { code: 'es_MX' }, components: [
            { type: 'header', parameters: [{ type: 'image', image: { link: PLANTILLA_IMG } }] },
            { type: 'body', parameters: [{ type: 'text', parameter_name: 'customer_name', text: nombre }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: `${tel}.${await firma(tel)}` }] },
          ] },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: 'WhatsApp no lo aceptó: ' + (j?.error?.error_data?.details || j?.error?.message || r.status) }, 502);
      await rest(`clientes_otc?telefono=eq.${tel}`, { method: 'PATCH', body: JSON.stringify({ invitado_en: new Date().toISOString() }) }).catch(() => {});
      return json({ ok: true, id: j?.messages?.[0]?.id || null });
    }

    // ======================= BOT =======================
    if (!autorizado(req)) return json({ error: 'no autorizado' }, 401);

    if (req.method === 'GET' && accion === 'clientes_dia') {
      const dia = normDia(url.searchParams.get('dia'));
      const todos = await rest('clientes_otc?activo=eq.true&select=*');
      const clientes = await Promise.all(todos.filter((c) => normDia(c.dia_visita) === dia)
        .map(async (c) => ({ ...c, c: `${c.telefono}.${await firma(c.telefono)}`, link: await linkCliente(req, c.telefono) })));
      return json({ dia, clientes });
    }
    if (req.method === 'GET' && accion === 'cliente') {
      const tel = normTel(url.searchParams.get('telefono'));
      const r = await rest(`clientes_otc?telefono=eq.${tel}&select=*`);
      const link = await linkCliente(req, tel);
      return json(r[0] ? { registrado: true, ...r[0], link } : { registrado: false, telefono: tel, link });
    }
    if (req.method === 'POST' && accion === 'pedido') {
      const tel = normTel(body.telefono);
      const productos = (Array.isArray(body.productos) ? body.productos : [])
        .map((p) => ({ codigo: p.codigo || null, producto: String(p.producto || p.codigo || '').trim(), cantidad: Number(p.cantidad) || 0, precio: Number(p.precio) || null }))
        .filter((p) => p.producto && p.cantidad > 0);
      if (!tel || !productos.length) return json({ error: 'faltan teléfono o productos' }, 400);
      const cli = (await rest(`clientes_otc?telefono=eq.${tel}&select=*`))[0] || {};
      const nuevo = await guardarPedido({
        telefono: tel,
        codigo_cliente: cli.codigo_cliente || null,
        nombre: cli.nombre || body.nombre || null,
        ruta: cli.ruta ? normRuta(cli.ruta) : null,
        dia_visita: cli.dia_visita || null,
        origen: body.origen || 'chat',
        productos,
        texto: body.texto || productos.map((p) => `${p.cantidad} x ${p.producto}`).join('\n'),
        total: Number(body.total) || null,
      });
      return json({ ok: true, registrado: !!cli.telefono, pedido: nuevo });
    }
    return json({ error: 'acción no válida' }, 400);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
