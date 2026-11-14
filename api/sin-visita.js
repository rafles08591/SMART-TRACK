// api/sin-visita.js — Clientes sin visita (fuente: PowerStreet)
//
// El ROBOT de PowerStreet, en su ciclo de cada hora (ya con la sesión iniciada), baja por cada
// vendedor el reporte "Reportes DZ → Indicadores → Vendedores → Clientes no Visitados por Vendedor"
// y lo manda aquí. Esto lo guarda en la tabla sin_visita_pwst (la lee el módulo "Sin visita" de
// SMART-TRACK) y regresa los mensajes que el robot manda por Evolution:
//   · al grupo, solo el resumen (cuántos le faltan a cada ruta);
//   · a cada vendedor, la lista de sus clientes que le faltan.
//
//   · Lunes a viernes 5 pm y 7 pm → tipo "dia":    ruta PM del día (PM01 lun … PM05 vie), hoy a hoy.
//   · Sábado de 3 pm en adelante  → tipo "semana": PM01 a PM06, del lunes a hoy.
//   · A petición del staff (botón en Sin visita → /api/wa-disparar → robot) → el que toque ese día.
//
// POST /api/sin-visita   header x-bot-token: <BOT_TOKEN>
//   body { tipo: "dia"|"semana", desde: "YYYY-MM-DD", hasta: "YYYY-MM-DD",
//          rutas: { J201: [ { cliente, nombre, direccion, colonia, potencial, municipio, localidad } ], ... },
//          errores: { J204: "no cargó el reporte" },   // opcional: rutas que no se pudieron leer
//          enviar: true, forzar: false, por: "robot" | "staff: correo" }
//   → { ok, guardadas, mensajes: [{ numero, texto, mencionados }] }

import { autorizado, fechaMX, claveRuta, primerNombre, numeroEnvio, configBot, listaContactos, leerEstado, guardarEstado } from './_wa-lib.js';

export const config = { runtime: 'edge' };

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GRUPO = process.env.GRUPO_SIN_VISITA || process.env.GRUPO_RETRO || '5213221821493-1614005509@g.us';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

function headers(extra = {}) {
  const h = { apikey: SERVICE_KEY, 'Content-Type': 'application/json', ...extra };
  if (!SERVICE_KEY.startsWith('sb_')) h.Authorization = `Bearer ${SERVICE_KEY}`;
  return h;
}

const mencion = (tel) => (tel ? `521${String(tel).replace(/\D/g, '').slice(-10)}` : null);
const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const fechaLarga = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
const diaCorto = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const horaMX = () => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', hour: 'numeric', minute: '2-digit', hour12: true })
  .format(new Date()).replace(/\s?a\.?\s?m\.?/i, ' am').replace(/\s?p\.?\s?m\.?/i, ' pm');
const horaNum = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false }).format(new Date())) % 24;

// Limpia un cliente que viene del reporte
function cliente(c) {
  const t = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
  return {
    cliente: t(c.cliente), nombre: t(c.nombre), direccion: t(c.direccion), colonia: t(c.colonia),
    potencial: t(c.potencial), municipio: t(c.municipio), localidad: t(c.localidad),
  };
}

// Arma los mensajes:
//   · Al GRUPO: solo el resumen — cuántos clientes le faltan a cada ruta (con mención).
//   · A cada VENDEDOR (a su WhatsApp): la lista de SUS clientes que le faltan.
function armarMensajes({ tipo, desde, hasta, rutas, errores, vendedores }) {
  const codigos = [...new Set([...Object.keys(rutas), ...Object.keys(errores)])];
  const total = Object.values(rutas).reduce((s, l) => s + l.length, 0);
  const periodo = tipo === 'dia' ? `hoy · ${fechaLarga(hasta)}` : `semana · ${diaCorto(desde)} al ${fechaLarga(hasta)}`;
  const etiqueta = (ruta) => {
    const v = vendedores[ruta];
    const m = mencion(v?.telefono);
    const nom = v?.nombre ? ` ${primerNombre(v.nombre, ruta)}` : '';
    return { m, txt: m ? `@${m} (${ruta}${nom})` : `${ruta}${nom}`, nom: nom.trim() };
  };

  // ── Grupo: resumen ──
  const G = [`📍 *CLIENTES SIN VISITA* · ${periodo} · ${horaMX()}`];
  G.push(total
    ? (tipo === 'dia' ? `Faltan *${total}* clientes de la ruta de hoy por visitar` : `Quedan *${total}* clientes sin NINGUNA visita esta semana`)
    : (tipo === 'dia' ? '✅ ¡Todas las rutas visitaron a todos sus clientes de hoy!' : '✅ ¡Todos los clientes de la semana tienen visita!'));
  G.push('');
  const mencionados = [];
  const orden = codigos.sort((a, b) => (rutas[b]?.length ?? -1) - (rutas[a]?.length ?? -1) || a.localeCompare(b));
  for (const ruta of orden) {
    const e = etiqueta(ruta);
    if (e.m) mencionados.push(e.m);
    if (errores[ruta] && !rutas[ruta]) { G.push(`⚠️ ${e.txt} · no se pudo leer su reporte`); continue; }
    const n = rutas[ruta].length;
    G.push(n ? `🔴 ${e.txt} · faltan *${n}*` : `✅ ${e.txt} · completo`);
  }
  G.push('', '_A cada vendedor le llegó su lista. El detalle por ruta está en SMART-TRACK → Sin visita._');
  const mensajes = [{ numero: GRUPO, texto: G.join('\n'), mencionados: [...new Set(mencionados)] }];

  // ── Cada vendedor: su lista ──
  for (const [ruta, lista] of Object.entries(rutas)) {
    const v = vendedores[ruta];
    if (!v?.telefono || !lista.length) continue;
    const nom = primerNombre(v.nombre || '', ruta);
    const V = [
      `📍 *${nom}, te faltan ${lista.length} cliente${lista.length === 1 ? '' : 's'} por visitar* (${periodo})`,
      tipo === 'dia' ? '_Todavía hay tiempo de pasar con ellos_ 💪' : '_Clientes de tu ruta que no han tenido ninguna visita esta semana:_',
      '',
    ];
    lista.forEach((c, i) => {
      V.push(`${i + 1}. *${c.nombre}*${c.potencial ? ` (${c.potencial})` : ''}`);
      const dir = [c.cliente, c.direccion, c.colonia, c.localidad && c.localidad !== c.municipio ? c.localidad : null].filter(Boolean).join(' · ');
      if (dir) V.push(`    ${dir}`);
    });
    V.push('', `_Ruta ${ruta} · datos de PowerStreet ${horaMX()}_`);
    mensajes.push({ numero: numeroEnvio(v.telefono), texto: V.join('\n'), mencionados: [] });
  }
  return mensajes;
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'usa POST' }, 405);
  if (!autorizado(req)) return json({ error: 'no autorizado' }, 401);

  let b = {};
  try { b = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const tipo = b.tipo === 'semana' ? 'semana' : b.tipo === 'dia' ? 'dia' : null;
  if (!tipo) return json({ error: 'tipo debe ser "dia" o "semana"' }, 400);
  const hoy = fechaMX();
  const hasta = esFecha(b.hasta) ? b.hasta : hoy;
  const desde = esFecha(b.desde) ? b.desde : hasta;

  const rutas = {};
  for (const [r, lista] of Object.entries(b.rutas || {})) {
    const k = claveRuta(r);
    if (k) rutas[k] = (Array.isArray(lista) ? lista : []).map(cliente).filter((c) => c.cliente || c.nombre);
  }
  const errores = {};
  for (const [r, e] of Object.entries(b.errores || {})) if (claveRuta(r)) errores[claveRuta(r)] = String(e || 'error').slice(0, 200);
  if (!Object.keys(rutas).length && !Object.keys(errores).length) return json({ error: 'sin rutas' }, 400);

  // 1) Guardar (una fila por fecha + tipo + ruta). Las rutas con error no pisan lo último bueno.
  const ahora = new Date().toISOString();
  const filas = Object.entries(rutas).map(([ruta, clientes]) => ({
    fecha: hasta, tipo, ruta, desde, hasta, clientes, total: clientes.length, actualizado_en: ahora, actualizado_por: String(b.por || 'robot').slice(0, 80),
  }));
  if (filas.length) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/sin_visita_pwst?on_conflict=fecha,tipo,ruta`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(filas),
    });
    if (!r.ok) return json({ ok: false, error: `No se pudo guardar en Supabase: ${r.status} ${await r.text()}` }, 500);
  }

  // 2) Mensaje para el grupo
  const cfg = await configBot();
  if (!b.enviar) return json({ ok: true, guardadas: filas.length, mensajes: [] });
  if (cfg?.sinVisitaActivo === false && !b.forzar) return json({ ok: true, guardadas: filas.length, mensajes: [], nota: 'aviso de sin visita desactivado en SMART-TRACK' });
  // Una sola vez por hora (salvo que lo pida el staff)
  const marca = `${hasta}|${tipo}|${horaNum()}`;
  if (!b.forzar && (await leerEstado('sin_visita_envio'))?.marca === marca) {
    return json({ ok: true, guardadas: filas.length, mensajes: [], nota: 'ya se mandó en esta hora' });
  }
  const vendedores = {};
  for (const c of await listaContactos(cfg)) if (c.tipo === 'vendedor' && c.activo !== false && c.ruta) vendedores[claveRuta(c.ruta)] = c;
  const mensajes = armarMensajes({ tipo, desde, hasta, rutas, errores, vendedores });
  await guardarEstado('sin_visita_envio', { marca, en: ahora });
  return json({ ok: true, guardadas: filas.length, mensajes });
}
