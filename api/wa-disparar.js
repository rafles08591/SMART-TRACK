// api/wa-disparar.js — dispara el flujo 4 de n8n (tarjetas del "Avance del día").
//
// Dos formas de llamarlo:
//   1) Desde la app (Gerente / Supervisor):
//        POST /api/wa-disparar   body { tipo: "dia" }   header Authorization: Bearer <token de sesión Supabase>
//   2) Llamada interna (robot de PowerStreet, trigger de Supabase, etc.), sin sesión:
//        POST /api/wa-disparar   body { tipo: "dia", por: "robot" }   header x-bot-token: <BOT_TOKEN>
//
// Variables de entorno en Vercel: N8N_WEBHOOK_DIA (Production URL del webhook del flujo 4), BOT_TOKEN

import { configBot, leerEstado, guardarEstado, filasDeFecha, fechaMX, claveRuta } from './_wa-lib.js';

export const config = { runtime: 'edge' };

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function usuarioDeSesion(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// Comparación en tiempo constante para no filtrar el token por diferencias de tiempo
function mismoToken(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function esLlamadaInterna(req) {
  return mismoToken(req.headers.get('x-bot-token') || '', process.env.BOT_TOKEN || '');
}

// ---- Anti-duplicado ----
// Si el avance se carga dos veces (robot + manual, un reintento, dos equipos…) llegaban dos mensajes
// iguales al grupo. Ahora solo se manda si los NÚMEROS cambiaron desde el último envío, y nunca
// dos envíos con menos de 3 minutos entre sí. Con { forzar: true } se manda de todos modos.
const MIN_ENTRE_ENVIOS = 3 * 60 * 1000;

async function huellaAvance(fecha) {
  const filas = await filasDeFecha(fecha);
  const partes = filas
    .map((f) => [claveRuta(f.ruta), f.venta_dia, f.clientes_visitados, f.venta_mes, JSON.stringify(f.extra ?? null)].join(':'))
    .sort();
  // hash corto (FNV-1a) del contenido
  let h = 0x811c9dc5;
  for (const ch of partes.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${fecha}#${filas.length}#${h.toString(16)}`;
}

// ---- Sin visita a petición del staff ----
// El botón de la pantalla "Sin visita" le pide al ROBOT de PowerStreet que corra ya: baja las
// visitas, las pega en SMART-TRACK y manda el aviso al grupo. Variable en Vercel: ROBOT_URL
// (la URL pública del robot en Easypanel, ej. https://pwst-robot.xxxx.easypanel.host).
async function pedirSinVisita(req, user, interna) {
  if (!interna) {
    // Solo staff (gerente, supervisores…), no vendedores
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role,username`, {
      headers: SERVICE_KEY.startsWith('sb_') ? { apikey: SERVICE_KEY } : { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const perfil = r.ok ? (await r.json())[0] : null;
    if (!perfil || perfil.role === 'vendedor') return json({ ok: false, error: 'Solo el staff puede pedir el aviso de sin visita' }, 403);
  }
  const robot = (process.env.ROBOT_URL || '').replace(/\/+$/, '');
  if (!robot) return json({ ok: false, error: 'Falta la variable ROBOT_URL en Vercel' }, 500);
  const previo = await leerEstado('sin_visita_peticion');
  if (previo?.en && Date.now() - Date.parse(previo.en) < MIN_ENTRE_ENVIOS) {
    return json({ ok: true, enviado: false, motivo: 'Ya se pidió hace menos de 3 minutos; el robot ya está en eso.' });
  }
  const por = interna ? 'sistema' : (user.email || user.id);
  await guardarEstado('sin_visita_peticion', { en: new Date().toISOString(), por });
  try {
    const r = await fetch(`${robot}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-token': process.env.BOT_TOKEN || '' },
      body: JSON.stringify({ sinVisita: true, por }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, error: d.error || `El robot respondió ${r.status}` }, 502);
    return json({ ok: true, enviado: true, enCola: !!d.yaCorriendo });
  } catch (e) {
    return json({ ok: false, error: `No se pudo contactar al robot: ${e.message || e}` }, 502);
  }
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'usa POST' }, 405);

  const interna = esLlamadaInterna(req);
  const user = interna ? null : await usuarioDeSesion(req);
  if (!interna && !user?.id) return json({ error: 'sesión inválida' }, 401);

  let body = {};
  try { body = await req.json(); } catch { /* vacío */ }
  if (body.tipo === 'sin_visita') return await pedirSinVisita(req, user, interna);
  if (body.tipo !== 'dia') return json({ error: 'tipo inválido' }, 400);

  const cfg = await configBot();
  if (cfg?.avanceDiaActivo === false) return json({ ok: true, enviado: false, motivo: 'desactivado en SMART-TRACK' });

  const destino = process.env.N8N_WEBHOOK_DIA;
  if (!destino) return json({ ok: false, error: 'Falta la variable N8N_WEBHOOK_DIA en Vercel' }, 500);

  const por = interna ? String(body.por || 'sistema').slice(0, 60) : (user.email || user.id);

  if (!body.forzar) {
    const previo = await leerEstado('ultimo_disparo_dia');
    let huella = null;
    try { huella = await huellaAvance(fechaMX()); } catch { /* si no se puede calcular, solo aplica el tiempo */ }
    const hace = previo?.en ? Date.now() - Date.parse(previo.en) : Infinity;
    if (hace < MIN_ENTRE_ENVIOS) return json({ ok: true, enviado: false, motivo: 'ya se mandó hace menos de 3 minutos' });
    if (huella && previo?.huella === huella) return json({ ok: true, enviado: false, motivo: 'el avance no cambió desde el último envío' });
    // Se aparta ANTES de mandar, para que dos llamadas casi juntas no salgan las dos
    await guardarEstado('ultimo_disparo_dia', { en: new Date().toISOString(), huella, por });
  }

  const r = await fetch(destino, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bot-token': process.env.BOT_TOKEN || '' },
    body: JSON.stringify({ tipo: 'dia', por, en: new Date().toISOString() }),
  });
  return json({ ok: r.ok, enviado: r.ok, status: r.status });
}
