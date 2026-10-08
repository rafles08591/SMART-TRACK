// api/wa-grupos.js — lista los grupos de WhatsApp donde está el número del bot,
// para elegirlos en la pestaña WHATSAPP BOT de SMART-TRACK.
//
//   GET /api/wa-grupos   header Authorization: Bearer <token de sesión Supabase>
//
// Variables de entorno en Vercel: EVOLUTION_URL, EVOLUTION_APIKEY, EVOLUTION_INSTANCE

export const config = { runtime: 'edge' };

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default async function handler(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'sin sesión' }, 401);
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!u.ok) return json({ error: 'sesión inválida' }, 401);

  const base = (process.env.EVOLUTION_URL || '').replace(/\/+$/, '');
  const key = process.env.EVOLUTION_APIKEY || '';
  const inst = process.env.EVOLUTION_INSTANCE || 'open';
  if (!base || !key) return json({ error: 'Faltan EVOLUTION_URL / EVOLUTION_APIKEY en Vercel' }, 500);

  const r = await fetch(`${base}/group/fetchAllGroups/${encodeURIComponent(inst)}?getParticipants=false`, {
    headers: { apikey: key },
  });
  if (!r.ok) return json({ error: `Evolution respondió ${r.status}` }, 502);
  const lista = await r.json();
  const grupos = (Array.isArray(lista) ? lista : [])
    .map((g) => ({ id: g.id, nombre: g.subject || g.id, miembros: g.size ?? null }))
    .filter((g) => /@g\.us$/.test(g.id || ''))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  return json({ grupos });
}
