// api/_wa-lib.js — utilidades compartidas del bot de WhatsApp.
// El guion bajo inicial hace que Vercel NO lo publique como endpoint.
// Compatible con Edge runtime (solo fetch + Web Crypto, sin supabase-js).

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BOT_TOKEN = process.env.BOT_TOKEN || '';

// ---------------------------------------------------------------- Supabase
function headersSupabase() {
  const h = { apikey: SERVICE_KEY, 'Content-Type': 'application/json' };
  // Las llaves nuevas (sb_secret_...) van solo en `apikey`; las JWT viejas también como Bearer.
  if (!SERVICE_KEY.startsWith('sb_')) h.Authorization = `Bearer ${SERVICE_KEY}`;
  return h;
}

export async function sb(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headersSupabase() });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------- Auth
export function autorizado(req) {
  return BOT_TOKEN && req.headers.get('x-bot-token') === BOT_TOKEN;
}

export async function firmar(ruta, fecha) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(BOT_TOKEN), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${ruta}|${fecha}`));
  return [...new Uint8Array(sig)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- Fechas (hora de México)
export function fechaMX(offsetDias = 0) {
  const d = new Date(Date.now() + offsetDias * 86400000);
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export function fechaCorta(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS[dow]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

// Días hábiles lunes–sábado del mes de `iso`: totales y transcurridos (incluye el propio día).
export function diasHabiles(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let tot = 0, trans = 0;
  for (let i = 1; i <= ultimo; i++) {
    if (new Date(Date.UTC(y, m - 1, i)).getUTCDay() !== 0) {
      tot++;
      if (i <= d) trans++;
    }
  }
  return { tot, trans, restantes: tot - trans };
}

// ---------------------------------------------------------------- Formato
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export function dinero(v) {
  const n = num(v);
  if (n === null) return '—';
  return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function dineroCorto(v) {
  const n = num(v);
  if (n === null) return '—';
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return dinero(n);
}

// Cantidad según unidad: '$' (dinero) o 'paq' (paquetes, la unidad de SMART-TRACK)
const miles = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export function cantidad(v, unidad = 'paq') {
  const n = num(v);
  if (n === null) return '—';
  return unidad === '$' ? dinero(n) : `${miles(n)} paq`;
}
export function cantidadCorta(v, unidad = 'paq') {
  const n = num(v);
  if (n === null) return '—';
  if (unidad === '$') return dineroCorto(n);
  return Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(1)}k` : miles(n);
}

export const pct = (v) => (num(v) === null ? '—' : `${Math.round(num(v))}%`);

export function primerNombre(nombre, ruta) {
  const n = String(nombre || '').trim().split(/\s+/)[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : ruta;
}

// Teléfono: nos quedamos con los últimos 10 dígitos (sirve para 52 / 521 / con o sin +).
export const tel10 = (v) => String(v || '').replace(/\D/g, '').slice(-10);
export const numeroEnvio = (telefono) => `52${tel10(telefono)}`;

// ---------------------------------------------------------------- Datos
// Última fila por ruta (opcionalmente solo fechas < o <= a una fecha).
export async function ultimosPorRuta({ antesDe = null, hasta = null } = {}) {
  const desde = fechaMX(-45);
  let q = `resumen_vendedores?select=*&fecha=gte.${desde}&order=fecha.desc`;
  if (antesDe) q += `&fecha=lt.${antesDe}`;
  if (hasta) q += `&fecha=lte.${hasta}`;
  const filas = await sb(q);
  const porRuta = {};
  for (const f of filas) if (!porRuta[f.ruta]) porRuta[f.ruta] = f;
  return porRuta;
}

export async function filasDeFecha(fecha) {
  return sb(`resumen_vendedores?select=*&fecha=eq.${fecha}`);
}

export async function contactos({ campo = null } = {}) {
  let q = 'vendedores_whatsapp?select=*&activo=is.true';
  if (campo) q += `&${campo}=is.true`;
  return sb(q);
}

export async function contactoPorRuta(ruta) {
  const r = await sb(`vendedores_whatsapp?select=*&activo=is.true&ruta=eq.${encodeURIComponent(ruta)}&limit=1`);
  return r[0] || null;
}

export async function contactoPorTelefono(numero) {
  const t = tel10(numero);
  if (t.length !== 10) return null;
  const r = await sb(`vendedores_whatsapp?select=*&activo=is.true&telefono=eq.${t}&limit=1`);
  return r[0] || null;
}

// Métricas derivadas de una fila + sus compañeras del mismo día (para el ranking).
export function calcular(fila, companeras = []) {
  const ventaDia = num(fila.venta_dia), objDia = num(fila.objetivo_dia);
  const ventaMes = num(fila.venta_mes), objMes = num(fila.objetivo_mes);
  const pctDia = ventaDia !== null && objDia ? (ventaDia / objDia) * 100 : null;
  const pctMes = ventaMes !== null && objMes ? (ventaMes / objMes) * 100 : null;

  // Si la app mandó sus propios días (periodo real y días no laborables), se usan esos;
  // si no, se calcula lunes–sábado del mes calendario.
  const ex = fila.extra || {};
  const unidad = ex.unidad || 'paq';
  const cal = diasHabiles(fila.fecha);
  const tot = num(ex.dias_totales) ?? cal.tot;
  const trans = num(ex.dias_transcurridos) ?? cal.trans;
  const restantes = num(ex.dias_restantes) ?? cal.restantes;
  const esperado = tot ? Math.min(100, (trans / tot) * 100) : null;
  const diferencia = pctMes !== null && esperado !== null ? pctMes - esperado : null;
  const faltaMes = ventaMes !== null && objMes ? Math.max(0, objMes - ventaMes) : null;
  const necesitaDiario = num(ex.necesita_diario) ?? (faltaMes !== null ? faltaMes / Math.max(1, restantes) : null);

  const prog = num(fila.clientes_programados), vis = num(fila.clientes_visitados);
  const efectividad = num(fila.efectividad_pct) ?? (prog ? ((vis || 0) / prog) * 100 : null);

  let ranking = null, totalRutas = null;
  const conPct = companeras
    .map((c) => ({ ruta: c.ruta, p: num(c.venta_mes) !== null && num(c.objetivo_mes) ? num(c.venta_mes) / num(c.objetivo_mes) : null }))
    .filter((c) => c.p !== null)
    .sort((a, b) => b.p - a.p);
  if (conPct.length) {
    const i = conPct.findIndex((c) => c.ruta === fila.ruta);
    ranking = i >= 0 ? i + 1 : null;
    totalRutas = conPct.length;
  }

  return {
    unidad, ventaDia, objDia, pctDia, ventaMes, objMes, pctMes, esperado, diferencia,
    faltaMes, necesitaDiario, restantes, prog, vis, efectividad, ranking, totalRutas, rankingLista: conPct,
  };
}

// Estado vs. ritmo del mes: 'arriba' | 'ritmo' | 'abajo' | null
export function estadoMes(m) {
  if (m.diferencia === null) return null;
  if (m.diferencia >= 3) return 'arriba';
  if (m.diferencia >= -5) return 'ritmo';
  return 'abajo';
}

export function frase(m) {
  const e = estadoMes(m);
  if (m.pctMes !== null && m.pctMes >= 100) return '¡Ya pasaste tu meta del mes! Todo lo que venga es ganancia 🏆';
  if (e === 'arriba') return 'Vas arriba del ritmo. ¡A mantenerlo! 💪';
  if (e === 'ritmo') return `Vas en el ritmo. Con ${cantidad(m.necesitaDiario, m.unidad)} diarios cierras en 100%.`;
  if (e === 'abajo') return `Vas abajo del ritmo. Necesitas ${cantidad(m.necesitaDiario, m.unidad)} diarios para llegar al 100%.`;
  return '¡Éxito en la ruta de hoy!';
}

export const icono = (e) => ({ arriba: '✅', ritmo: '🟡', abajo: '🔴' }[e] || '');
export const medalla = (r) => ({ 1: '🥇', 2: '🥈', 3: '🥉' }[r] || '');
