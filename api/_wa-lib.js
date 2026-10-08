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

// ---------------------------------------------------------------- Rutas
// "RUTA J201", "j201 ", "J201" → "J201". Así no importa cómo se escribió la ruta.
export function claveRuta(ruta) {
  const s = String(ruta || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const m = s.match(/J\s?-?\d{3}/);
  return m ? m[0].replace(/[\s-]/g, '') : s;
}

// ---------------------------------------------------------------- Datos
// Última fila por ruta (opcionalmente solo fechas < o <= a una fecha).
export async function ultimosPorRuta({ antesDe = null, hasta = null } = {}) {
  const desde = fechaMX(-45);
  let q = `resumen_vendedores?select=*&fecha=gte.${desde}&order=fecha.desc`;
  if (antesDe) q += `&fecha=lt.${antesDe}`;
  if (hasta) q += `&fecha=lte.${hasta}`;
  const filas = await sb(q);
  const porRuta = {};
  for (const f of filas) { const k = claveRuta(f.ruta); if (!porRuta[k]) porRuta[k] = f; }
  return porRuta;
}

export async function filasDeFecha(fecha) {
  return sb(`resumen_vendedores?select=*&fecha=eq.${fecha}`);
}

// ---------------------------------------------------------------- Configuración del bot
// Vive en el blob de la app: ventas_app_state.data.whatsappBot
// { contactos: [{id, ruta, nombre, telefono, tipo:'vendedor'|'equipo', activo, matutino, alerta}],
//   plantillas: { matutino, alerta, equipo }, aviso, umbralAlerta }
export async function configBot() {
  try {
    const r = await sb('ventas_app_state?id=eq.main&select=wb:data->whatsappBot');
    return (r[0] && r[0].wb) || {};
  } catch {
    return {};
  }
}

// Contactos: los de la pestaña de SMART-TRACK; si nunca se han guardado ahí,
// se usan los de la tabla vendedores_whatsapp (compatibilidad).
export async function listaContactos(cfg) {
  let lista;
  if (Array.isArray(cfg?.contactos)) {
    lista = cfg.contactos;
  } else {
    try {
      lista = (await sb('vendedores_whatsapp?select=*')).map((c) => ({
        ...c, tipo: 'vendedor', matutino: c.recibir_matutino, alerta: c.recibir_alerta,
      }));
    } catch {
      lista = [];
    }
  }
  return lista
    .map((c) => ({
      id: c.id, ruta: c.ruta || '', nombre: c.nombre || '', telefono: tel10(c.telefono),
      tipo: c.tipo === 'equipo' ? 'equipo' : 'vendedor',
      activo: c.activo !== false, matutino: c.matutino !== false, alerta: c.alerta !== false, dia: c.dia !== false,
    }))
    .filter((c) => c.telefono.length === 10);
}

export async function contactos({ campo = null, cfg = null } = {}) {
  const lista = await listaContactos(cfg || (await configBot()));
  return lista.filter((c) => c.activo && (!campo || c[campo]));
}

export async function contactoPorRuta(ruta, cfg = null) {
  const lista = await contactos({ cfg });
  return lista.find((c) => c.tipo === 'vendedor' && claveRuta(c.ruta) === claveRuta(ruta)) || null;
}

export async function contactoPorTelefono(numero, cfg = null) {
  const t = tel10(numero);
  if (t.length !== 10) return null;
  const lista = await contactos({ cfg });
  return lista.find((c) => c.telefono === t) || null;
}

// ---------------------------------------------------------------- Plantillas
export const PLANTILLAS_DEFAULT = {
  matutino: [
    '☀️ *Buenos días, {nombre}*',
    'Ruta {ruta} · corte del {fecha}',
    '',
    '📈 Mes: *{pct_mes}* (ritmo esperado {esperado}) {icono}',
    '📦 Día: {dia_vendido} de {dia_objetivo} ({pct_dia})',
    '🎯 Efectividad: {efectividad}',
    '🏁 Lugar {lugar} de {total_rutas} {medalla}',
    '',
    '{frase}',
    '',
    'Escribe *menu* para ver qué más te puedo decir.',
  ].join('\n'),
  alerta: [
    '⏰ *{nombre}*, así vas hoy:',
    '{dia_vendido} de {dia_objetivo} ({pct_dia})',
    '',
    'Te faltan *{falta_dia}* para tu meta del día. ¡Todavía da tiempo! 💪',
    '',
    '{retro_sin_vuala}',
  ].join('\n'),
  equipo: [
    '📊 *Resumen del equipo* · corte del {fecha}',
    '',
    'Equipo: *{pct_equipo}* del mes (ritmo esperado {esperado})',
    '{rutas_en_ritmo} de {total_rutas} rutas van en ritmo o arriba',
    '',
    '🏆 Arriba:',
    '{top}',
    '',
    '⚠️ Atención:',
    '{abajo}',
  ].join('\n'),
  dia: [
    '📦 *Avance del día* · corte {hora}',
    '{nombre}, llevas *{dia_vendido}* de {dia_objetivo} (*{pct_dia}*)',
    '',
    '🎯 Efectividad: {efectividad} · {visitas} visitas efectivas',
    '🏁 Lugar {lugar_dia} de {total_rutas} en el día {medalla_dia}',
    '{sin_vuala}',
    '',
    '{retro_sin_vuala}',
    '',
    '{frase_dia}',
  ].join('\n'),
  equipo_dia: [
    '📦 *Avance del día · Equipo* · corte {hora}',
    '',
    'Equipo: *{pct_dia_equipo}* ({dia_vendido_equipo} de {dia_objetivo_equipo})',
    'Rutas con meta del día cumplida: {rutas_meta_dia} de {total_rutas}',
    '',
    '🏆 Arriba hoy:',
    '{top_dia}',
    '',
    '⚠️ Atención:',
    '{abajo_dia}',
    '',
    '🧃 OTC Sin Vuala pendiente: {sin_vuala_pendientes}',
  ].join('\n'),
};

export const VARIABLES_PLANTILLA = {
  vendedor: ['nombre', 'nombre_completo', 'ruta', 'fecha', 'pct_mes', 'esperado', 'icono', 'venta_mes', 'objetivo_mes',
    'dia_vendido', 'dia_objetivo', 'pct_dia', 'falta_dia', 'efectividad', 'visitas', 'lugar', 'total_rutas', 'medalla',
    'necesita', 'dias_restantes', 'frase', 'marcas'],
  equipo: ['fecha', 'pct_equipo', 'esperado', 'venta_equipo', 'objetivo_equipo', 'pct_dia_equipo', 'rutas_en_ritmo',
    'total_rutas', 'top', 'abajo', 'ranking'],
};

// Reemplaza {variable}. Una línea cuyas variables vengan TODAS vacías se omite.
export function llenarPlantilla(tpl, vars) {
  const vacio = (v) => v === null || v === undefined || v === '' || v === '—';
  const lineas = String(tpl || '').split('\n').filter((linea) => {
    const claves = [...linea.matchAll(/\{(\w+)\}/g)].map((x) => x[1]);
    return !claves.length || !claves.every((k) => vacio(vars[k]));
  });
  return lineas.join('\n')
    .replace(/\{(\w+)\}/g, (_, k) => (vacio(vars[k]) ? '' : String(vars[k])))
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

// ---------------------------------------------------------------- Variables para plantillas
export function varsVendedor(fila, m, contacto = null) {
  const nombreCompleto = contacto?.nombre || fila.nombre || '';
  const falta = m.objDia ? Math.max(0, m.objDia - (m.ventaDia || 0)) : null;
  const marcas = Array.isArray(fila.extra?.marcas)
    ? fila.extra.marcas
      .filter((x) => num(x.objetivo) > 0)
      .map((x) => {
        const r = num(x.resta) ?? Math.max(0, num(x.objetivo) - (num(x.vendido) || 0));
        return r > 0
          ? `• ${x.nombre}: ${cantidad(x.vendido, m.unidad)} de ${cantidad(x.objetivo, m.unidad)} · resta ${cantidad(r, m.unidad)}`
          : `• ${x.nombre}: ✅ meta cumplida`;
      })
      .join('\n')
    : '';
  return {
    nombre: primerNombre(nombreCompleto, claveRuta(fila.ruta)),
    nombre_completo: nombreCompleto,
    ruta: claveRuta(fila.ruta),
    fecha: fechaCorta(fila.fecha),
    pct_mes: m.pctMes === null ? null : pct(m.pctMes),
    esperado: m.esperado === null ? null : pct(m.esperado),
    icono: icono(estadoMes(m)),
    venta_mes: m.ventaMes === null ? null : cantidad(m.ventaMes, m.unidad),
    objetivo_mes: m.objMes === null ? null : cantidad(m.objMes, m.unidad),
    dia_vendido: m.pctDia === null ? null : cantidad(m.ventaDia, m.unidad),
    dia_objetivo: m.pctDia === null ? null : cantidad(m.objDia, m.unidad),
    pct_dia: m.pctDia === null ? null : pct(m.pctDia),
    falta_dia: falta === null ? null : cantidad(falta, m.unidad),
    efectividad: m.efectividad === null ? null : pct(m.efectividad),
    visitas: m.vis === null ? null : String(m.vis),
    lugar: m.ranking ? String(m.ranking) : null,
    total_rutas: m.totalRutas ? String(m.totalRutas) : null,
    medalla: medalla(m.ranking),
    necesita: m.necesitaDiario === null ? null : cantidad(m.necesitaDiario, m.unidad),
    dias_restantes: m.restantes === null || m.restantes === undefined ? null : String(m.restantes),
    frase: frase(m),
    marcas,
  };
}

// Resumen de todo el equipo para una fecha.
export function calcularEquipo(filas, contactosLista = []) {
  const nombrePorRuta = {};
  for (const c of contactosLista) if (c.tipo === 'vendedor') nombrePorRuta[claveRuta(c.ruta)] = c.nombre;
  const rutas = filas
    .map((f) => {
      const m = calcular(f, filas);
      return { ruta: claveRuta(f.ruta), nombre: nombrePorRuta[claveRuta(f.ruta)] || '', fila: f, m };
    })
    .sort((a, b) => (b.m.pctMes ?? -1) - (a.m.pctMes ?? -1));
  const suma = (k) => filas.reduce((s, f) => s + (num(f[k]) || 0), 0);
  const ventaMes = suma('venta_mes'), objMes = suma('objetivo_mes');
  const ventaDia = suma('venta_dia');
  const objDia = filas.reduce((s, f) => s + (num(f.objetivo_dia) || 0), 0);
  const esperado = rutas[0]?.m.esperado ?? null;
  const unidad = rutas[0]?.m.unidad || 'paq';
  const enRitmo = rutas.filter((r) => r.m.diferencia !== null && r.m.diferencia >= -5).length;

  // Marcas OPEN sumadas de todas las rutas (mismo orden en que vienen de la app)
  const marcasMap = new Map();
  for (const f of filas) {
    for (const mk of (Array.isArray(f.extra?.marcas) ? f.extra.marcas : [])) {
      const k = mk.clave || mk.nombre;
      const acc = marcasMap.get(k) || { clave: k, nombre: mk.nombre || k, vendido: 0, objetivo: 0, resta: 0, por_dia: 0 };
      acc.vendido += num(mk.vendido) || 0;
      acc.objetivo += num(mk.objetivo) || 0;
      acc.resta += num(mk.resta) ?? Math.max(0, (num(mk.objetivo) || 0) - (num(mk.vendido) || 0));
      acc.por_dia += num(mk.por_dia) || 0;
      marcasMap.set(k, acc);
    }
  }
  const marcas = [...marcasMap.values()].filter((x) => x.objetivo > 0);

  return {
    marcas,
    fecha: filas[0]?.fecha || null,
    rutas, unidad, esperado, enRitmo,
    ventaMes, objMes, pctMes: objMes ? (ventaMes / objMes) * 100 : null,
    ventaDia, objDia, pctDia: objDia ? (ventaDia / objDia) * 100 : null,
  };
}

export function varsEquipo(eq) {
  const linea = (r, i) => `${medalla(i + 1) || `${i + 1}.`} ${r.ruta}${r.nombre ? ` ${primerNombre(r.nombre, r.ruta)}` : ''} – ${pct(r.m.pctMes)}`;
  const conPct = eq.rutas.filter((r) => r.m.pctMes !== null);
  const abajo = conPct.slice(-3).reverse()
    .map((r) => `🔻 ${r.ruta}${r.nombre ? ` ${primerNombre(r.nombre, r.ruta)}` : ''} – ${pct(r.m.pctMes)}`);
  return {
    fecha: eq.fecha ? fechaCorta(eq.fecha) : null,
    pct_equipo: eq.pctMes === null ? null : pct(eq.pctMes),
    esperado: eq.esperado === null ? null : pct(eq.esperado),
    venta_equipo: cantidad(eq.ventaMes, eq.unidad),
    objetivo_equipo: cantidad(eq.objMes, eq.unidad),
    pct_dia_equipo: eq.pctDia === null ? null : pct(eq.pctDia),
    rutas_en_ritmo: String(eq.enRitmo),
    total_rutas: String(eq.rutas.length),
    top: conPct.slice(0, 3).map(linea).join('\n'),
    abajo: abajo.join('\n'),
    ranking: conPct.map(linea).join('\n'),
  };
}


// ---------------------------------------------------------------- Avance del día
export function horaMX(iso) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', hour: 'numeric', minute: '2-digit', hour12: true })
      .format(new Date(iso)).replace(/\s?a\.?\s?m\.?/i, ' am').replace(/\s?p\.?\s?m\.?/i, ' pm');
  } catch {
    return null;
  }
}

// Ranking del día (por % del día) entre las filas de la misma fecha.
export function rankingDia(fila, companeras) {
  const lista = companeras
    .map((c) => ({ ruta: c.ruta, p: num(c.objetivo_dia) ? (num(c.venta_dia) || 0) / num(c.objetivo_dia) : null }))
    .filter((c) => c.p !== null)
    .sort((a, b) => b.p - a.p);
  const i = lista.findIndex((c) => c.ruta === fila.ruta);
  return { lugar: i >= 0 ? i + 1 : null, total: lista.length, lista };
}

export function fraseDia(m) {
  if (m.pctDia === null) return '';
  const falta = Math.max(0, (m.objDia || 0) - (m.ventaDia || 0));
  if (m.pctDia >= 100) return '¡Meta del día cumplida! 🎉 Todo lo que vendas ahora suma de más.';
  if (m.pctDia >= 80) return `¡Ya casi! Te faltan ${cantidad(falta, m.unidad)} para la meta de hoy 💪`;
  if (m.pctDia >= 50) return `Vas a la mitad. Te faltan ${cantidad(falta, m.unidad)}, ¡a darle!`;
  return `Te faltan ${cantidad(falta, m.unidad)} para tu meta de hoy. ¡Todavía hay tiempo! 🔥`;
}

export function marcasDiaDe(fila) {
  return (Array.isArray(fila.extra?.marcas_dia) ? fila.extra.marcas_dia : []).filter((x) => num(x.objetivo) > 0);
}

export function varsDia(fila, m, companeras, contacto = null) {
  const base = varsVendedor(fila, m, contacto);
  const r = rankingDia(fila, companeras);
  const marcas = marcasDiaDe(fila)
    .map((x) => {
      const v = num(x.vendido) || 0, o = num(x.objetivo);
      return v >= o ? `• ${x.nombre}: ✅ ${cantidad(v, m.unidad)}` : `• ${x.nombre}: ${cantidad(v, m.unidad)} de ${cantidad(o, m.unidad)}`;
    })
    .join('\n');
  const otcV = num(fila.extra?.otc_dia), otcO = num(fila.extra?.otc_dia_objetivo);
  return {
    ...base,
    hora: horaMX(fila.actualizado_en),
    lugar_dia: r.lugar ? String(r.lugar) : null,
    total_rutas: r.total ? String(r.total) : base.total_rutas,
    medalla_dia: medalla(r.lugar),
    frase_dia: fraseDia(m),
    marcas_dia: marcas,
    otc_dia: otcV === null ? null : dinero(otcV),
    otc_objetivo: otcO ? dinero(otcO) : null,
    sin_vuala: (() => {
      const sv = sinVualaDe(fila);
      return sv ? `🧃 OTC Sin Vuala: ${sv.piezas} de ${sv.minimo} piezas ${sv.cumple ? '✅' : '❌'}` : null;
    })(),
    retro_sin_vuala: retroSinVuala(sinVualaDe(fila)),
  };
}

export function calcularEquipoDia(filas, contactosLista = []) {
  const eq = calcularEquipo(filas, contactosLista);
  const rutas = [...eq.rutas]
    .filter((r) => r.m.pctDia !== null || r.m.ventaDia !== null)
    .sort((a, b) => (b.m.pctDia ?? -1) - (a.m.pctDia ?? -1));
  const marcasMap = new Map();
  for (const f of filas) {
    for (const mk of marcasDiaDe(f)) {
      const k = mk.clave || mk.nombre;
      const acc = marcasMap.get(k) || { clave: k, nombre: mk.nombre || k, vendido: 0, objetivo: 0 };
      acc.vendido += num(mk.vendido) || 0;
      acc.objetivo += num(mk.objetivo) || 0;
      marcasMap.set(k, acc);
    }
  }
  const ultimo = filas.map((f) => f.actualizado_en).filter(Boolean).sort().pop() || null;
  return {
    ...eq,
    rutasDia: rutas,
    marcasDia: [...marcasMap.values()].filter((x) => x.objetivo > 0),
    metaCumplida: rutas.filter((r) => r.m.pctDia !== null && r.m.pctDia >= 100).length,
    actualizado: ultimo,
  };
}

export function varsEquipoDia(eq) {
  const nom = (r) => `${r.ruta}${r.nombre ? ` ${primerNombre(r.nombre, r.ruta)}` : ''}`;
  const conPct = eq.rutasDia.filter((r) => r.m.pctDia !== null);
  return {
    fecha: eq.fecha ? fechaCorta(eq.fecha) : null,
    hora: horaMX(eq.actualizado),
    pct_dia_equipo: eq.pctDia === null ? null : pct(eq.pctDia),
    dia_vendido_equipo: cantidad(eq.ventaDia, eq.unidad),
    dia_objetivo_equipo: cantidad(eq.objDia, eq.unidad),
    rutas_meta_dia: String(eq.metaCumplida),
    total_rutas: String(conPct.length),
    top_dia: conPct.slice(0, 3).map((r, i) => `${medalla(i + 1)} ${nom(r)} – ${pct(r.m.pctDia)}`).join('\n'),
    abajo_dia: conPct.slice(-3).reverse().map((r) => `🔻 ${nom(r)} – ${pct(r.m.pctDia)}`).join('\n'),
    ranking_dia: conPct.map((r, i) => `${i + 1}. ${nom(r)} – ${pct(r.m.pctDia)}`).join('\n'),
    sin_vuala_pendientes: (() => {
      const conSv = eq.rutasDia.map((r) => ({ r, sv: sinVualaDe(r.fila) })).filter((x) => x.sv);
      if (!conSv.length) return null;
      const pend = conSv.filter((x) => !x.sv.cumple).map((x) => `${x.r.ruta} (${x.sv.piezas}/${x.sv.minimo})`);
      return pend.length ? pend.join(', ') : 'ninguna, todas cubiertas ✅';
    })(),
  };
}


// ---------------------------------------------------------------- OTC Sin Vuala
export function sinVualaDe(fila) {
  const x = fila?.extra?.otc_sin_vuala;
  if (!x) return null;
  const piezas = num(x.piezas) || 0;
  const minimo = num(x.minimo) || 0;
  if (!minimo) return null;
  return { piezas, minimo, falta: Math.max(0, minimo - piezas), cumple: x.cumple === true || piezas >= minimo };
}

export function retroSinVuala(sv) {
  if (!sv || sv.cumple) return '';
  const pz = (n) => `${n} pieza${n === 1 ? '' : 's'}`;
  return sv.piezas === 0
    ? `⚠️ *OTC Sin Vuala NO cubierto:* llevas 0 de ${sv.minimo}. Coloca ${pz(sv.falta)} de OTC Sin Vuala hoy para cubrir el indicador.`
    : `⚠️ *OTC Sin Vuala NO cubierto:* llevas ${pz(sv.piezas)} de ${sv.minimo}. Te ${sv.falta === 1 ? 'falta' : 'faltan'} ${pz(sv.falta)} para cubrirlo hoy.`;
}
