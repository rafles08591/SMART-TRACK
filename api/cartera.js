// api/cartera.js — Cartera de créditos desde PowerStreet (la carga el ROBOT)
//
// El robot, a las 2:30, 5:30 y 8:30 pm, entra a PowerStreet → Reportes JMD → Resumen de cuentas
// por Agencia (agencia 12, Ver Todo), copia el reporte y lo manda aquí. Esto hace lo mismo que
// pegarlo a mano en Cartera Vencida → "Procesar y guardar": lo lee con el mismo parser y lo guarda
// en el documento general (data.carteraVencida). También revisa los TICKETS DUPLICADOS
// (mismo cliente, mismo día, 2+ tickets; alerta si traen el mismo monto) y le regresa al robot el
// resumen de hoy para su aviso de WhatsApp.
//
// GET  /api/cartera?accion=pendiente   (el robot pregunta si la pidieron desde la app)
// POST /api/cartera   header x-bot-token: <BOT_TOKEN>
//   body { texto: "<CSV copiado de PowerStreet>", por: "Robot PWST" }
//   → { ok, registros, duplicados: { total, mismoMonto, hoy, hoyMismoMonto, hoyDetalle: [ "…" ] } }

import { autorizado, leerEstado, guardarEstado } from './_wa-lib.js';
import { parseCreditosRaw, esDeEsteAno, detectarDuplicados } from '../src/carteraVencidaParser.js';

export const config = { runtime: 'edge' };

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const STATE_ID = process.env.APP_STATE_ID || 'main';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

function headers(extra = {}) {
  const h = { apikey: SERVICE_KEY, 'Content-Type': 'application/json', ...extra };
  if (!SERVICE_KEY.startsWith('sb_')) h.Authorization = `Bearer ${SERVICE_KEY}`;
  return h;
}

const hoyMX = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const pesos = (n) => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function handler(req) {
  if (!autorizado(req)) return json({ error: 'no autorizado' }, 401);
  // GET ?accion=pendiente → el robot pregunta (cada 30 s) si alguien pidió la cartera desde la app
  // (botón "Actualizar desde PowerStreet" en Cartera Vencida); si sí, la toma.
  if (req.method === 'GET' && new URL(req.url).searchParams.get('accion') === 'pendiente') {
    const p = await leerEstado('cartera_pedido');
    const vigente = p?.en && !p.atendido && Date.now() - Date.parse(p.en) < 30 * 60 * 1000;
    if (!vigente) return json({ pendiente: false });
    await guardarEstado('cartera_pedido', { ...p, atendido: true, tomado_en: new Date().toISOString() });
    return json({ pendiente: true, por: p.por });
  }
  if (req.method !== 'POST') return json({ error: 'usa POST' }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const texto = String(body?.texto || '');
  if (!texto.trim()) return json({ error: 'sin texto' }, 400);

  // Mismo parser que "Procesar y guardar". Solo se guarda lo de este año (la pantalla ya ignora lo viejo).
  const hoy = new Date();
  // OJO zona horaria: aquí (servidor en UTC) el parser arma las fechas a medianoche UTC; en el celular
  // (Puerto Vallarta, UTC-6) eso se leería como el día anterior. Se pasan a medianoche de México
  // (06:00 UTC), que es justo lo que queda cuando se pega a mano desde la app.
  const aMX = (d) => (d instanceof Date && !isNaN(d) ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6)) : d);
  const registros = parseCreditosRaw(texto)
    .map((r) => ({ ...r, fecha: aMX(r.fecha), vence: aMX(r.vence) }))
    .filter((r) => esDeEsteAno(r, hoy));
  if (!registros.length) return json({ error: 'no se reconoció ningún registro de cartera; no se tocó lo que había' }, 422);

  const carteraVencida = {
    registros,
    cargadoEn: new Date().toISOString(),
    cargadoPor: String(body?.por || 'Robot PWST').slice(0, 60),
  };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fusionar_app_state`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_id: STATE_ID, p_set: { carteraVencida }, p_quitar: [] }),
  });
  if (!r.ok) return json({ error: `no se pudo guardar (${r.status}) ${(await r.text()).slice(0, 200)}` }, 502);

  // Duplicados (con las fechas ya como Date, igual que en la pantalla)
  const dups = detectarDuplicados(registros);
  const dia = hoyMX();
  const deHoy = dups.filter((g) => g.dia === dia);
  const hoyDetalle = deHoy
    .sort((a, b) => b.mismoMonto - a.mismoMonto)
    .map((g) => `${g.mismoMonto ? '🚨' : '•'} ${g.rutas.map((x) => x.rutaCodigo).join('/')} · ${g.clienteNombre} · ${g.docs.length} tickets` +
      (g.mismoMonto ? ` · mismo monto ${g.montosRepetidos.map(pesos).join(', ')}` : ''));

  return json({
    ok: true,
    registros: registros.length,
    duplicados: {
      total: dups.length,
      mismoMonto: dups.filter((g) => g.mismoMonto).length,
      hoy: deHoy.length,
      hoyMismoMonto: deHoy.filter((g) => g.mismoMonto).length,
      hoyDetalle,
    },
  });
}
