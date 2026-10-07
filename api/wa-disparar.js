// api/wa-disparar.js — la app lo llama cuando Gerente / Supervisor cargan el
// "Avance del día". Verifica que quien llama tenga sesión válida de SMART-TRACK
// y avisa a n8n (flujo 4) para que mande las tarjetas del avance del día.
//
//   POST /api/wa-disparar   body { tipo: "dia" }   header Authorization: Bearer <token de sesión Supabase>
//
// Variable de entorno requerida en Vercel: N8N_WEBHOOK_DIA (Production URL del webhook del flujo 4)

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

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'usa POST' }, 405);
  const user = await usuarioDeSesion(req);
  if (!user?.id) return json({ error: 'sesión inválida' }, 401);

  let body = {};
  try { body = await req.json(); } catch { /* vacío */ }
  if (body.tipo !== 'dia') return json({ error: 'tipo inválido' }, 400);

  const cfg = await configBot();
  if (cfg?.avanceDiaActivo === false) return json({ ok: true, enviado: false, motivo: 'desactivado en SMART-TRACK' });

  const destino = process.env.N8N_WEBHOOK_DIA;
  if (!destino) return json({ ok: false, error: 'Falta la variable N8N_WEBHOOK_DIA en Vercel' }, 500);

  const r = await fetch(destino, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bot-token': process.env.BOT_TOKEN || '' },
    body: JSON.stringify({ tipo: 'dia', por: user.email || user.id, en: new Date().toISOString() }),
  });
  return json({ ok: r.ok, enviado: r.ok, status: r.status });
}
