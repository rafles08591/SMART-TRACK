// api/wa-disparar.js — dispara el flujo 4 de n8n (tarjetas del "Avance del día").
//
// Dos formas de llamarlo:
//   1) Desde la app (Gerente / Supervisor):
//        POST /api/wa-disparar   body { tipo: "dia" }   header Authorization: Bearer <token de sesión Supabase>
//   2) Llamada interna (robot de PowerStreet, trigger de Supabase, etc.), sin sesión:
//        POST /api/wa-disparar   body { tipo: "dia", por: "robot" }   header x-bot-token: <BOT_TOKEN>
//
// Variables de entorno en Vercel: N8N_WEBHOOK_DIA (Production URL del webhook del flujo 4), BOT_TOKEN

import { configBot } from './_wa-lib.js';

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

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'usa POST' }, 405);

  const interna = esLlamadaInterna(req);
  const user = interna ? null : await usuarioDeSesion(req);
  if (!interna && !user?.id) return json({ error: 'sesión inválida' }, 401);

  let body = {};
  try { body = await req.json(); } catch { /* vacío */ }
  if (body.tipo !== 'dia') return json({ error: 'tipo inválido' }, 400);

  const cfg = await configBot();
  if (cfg?.avanceDiaActivo === false) return json({ ok: true, enviado: false, motivo: 'desactivado en SMART-TRACK' });

  const destino = process.env.N8N_WEBHOOK_DIA;
  if (!destino) return json({ ok: false, error: 'Falta la variable N8N_WEBHOOK_DIA en Vercel' }, 500);

  const por = interna ? String(body.por || 'sistema').slice(0, 60) : (user.email || user.id);

  const r = await fetch(destino, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bot-token': process.env.BOT_TOKEN || '' },
    body: JSON.stringify({ tipo: 'dia', por, en: new Date().toISOString() }),
  });
  return json({ ok: r.ok, enviado: r.ok, status: r.status });
}
