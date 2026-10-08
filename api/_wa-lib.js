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

// Guardar / leer un valor en la tabla wa_estado (memoria del bot entre avances)
export async function leerEstado(clave) {
  try {
    const r = await sb(`wa_estado?clave=eq.${encodeURIComponent(clave)}&select=valor`);
    return r[0]?.valor ?? null;
  } catch {
    return null;
  }
}
export async function guardarEstado(clave, valor) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/wa_estado`, {
      method: 'POST',
      headers: { ...headersSupabase(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ clave, valor, actualizado: new Date().toISOString() }),
    });
    return res.ok;
  } catch {
    return false;
  }
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
      grupo: String(c.grupo || '').trim(),
      tipo: c.tipo === 'equipo' ? 'equipo' : c.tipo === 'grupo' ? 'grupo' : 'vendedor',
      activo: c.activo !== false, matutino: c.matutino !== false, alerta: c.alerta !== false, dia: c.dia !== false,
      riesgo: c.riesgo !== false, rebase: c.rebase !== false,
    }))
    .filter((c) => (c.tipo === 'grupo' ? /@g\.us$/.test(c.grupo) : c.telefono.length === 10));
}

// A dónde se manda: grupos por su ID (…@g.us); personas con 52 + 10 dígitos.
export const destino = (c) => (c.tipo === 'grupo' ? c.grupo : numeroEnvio(c.telefono));

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
  return lista.find((c) => c.tipo !== 'grupo' && c.telefono === t) || null;
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
  grupo: [
    '📊 *REPORTE DEL EQUIPO* · corte {fecha}',
    '',
    '🚀 MAX: *{max_vendido}* de {max_objetivo} (al ritmo deberían ir {max_ritmo})',
    'Faltan {max_falta} · necesitan {max_por_dia} por día',
    '🎯 Meta OPEN {open_objetivo} · Meta CHAMPIONS {champ_objetivo}',
    '💵 OTC semana: {otc_sem_vendido} de {otc_sem_objetivo}',
    '📦 Ayer: {ayer_vendido} de {ayer_objetivo} · 🧃 Sin Vuala {sin_vuala_cubiertas} de {total_rutas} rutas · 🛒 {visitas_hoy} visitas',
    '',
    '🏆 *Los que van jalando:*',
    '{top_paquetes}',
    '',
    '🔻 *Retro para los de abajo:*',
    '{retro_unidades}',
  ].join('\n'),
  grupo_dia: [
    '📦 *AVANCE DEL DÍA · EQUIPO* · corte {hora}',
    '',
    '📦 Volumen: *{vol_vendido}* de {vol_objetivo}',
    '{marcas_equipo}',
    '💵 OTC: {otc_vendido} de {otc_objetivo}',
    '🧃 Sin Vuala: {sv_piezas} piezas · {sv_cubiertas} de {total_rutas} rutas cubiertas',
    '🛒 Visitas efectivas: {visitas_hoy}',
    '',
    '🏆 *Más volumen hoy:*',
    '{top_volumen}',
    '',
    '🔻 *Retro, lo que les falta hoy:*',
    '{retro_dia}',
  ].join('\n'),
  riesgo: [
    '🚨 *RUTAS EN RIESGO* · corte {fecha}',
    '{nombre}, así proyecta el mes cada ruta:',
    '',
    '📉 Equipo cierra en *{proyeccion_equipo}* · faltarían {falta_equipo}',
    '{total_riesgo} de {total_rutas} rutas abajo del {umbral}',
    '',
    '{rutas_riesgo}',
    '',
    '✅ En ritmo: {rutas_ok}',
  ].join('\n'),
  riesgo_tarde: [
    '🚨 *3 PM · RUTAS QUE NECESITAN APOYO*',
    '{nombre}, estas rutas van mal hoy:',
    '',
    '{rutas_riesgo}',
    '',
    '✅ Bien hoy: {rutas_ok}',
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


// ---------------------------------------------------------------- Reporte del GRUPO (todos los indicadores)
const pctDe = (v, o) => (num(o) > 0 ? ((num(v) || 0) / num(o)) * 100 : null);

export function calcularGrupo(filas, contactosLista = []) {
  const eq = calcularEquipoDia(filas, contactosLista);
  const ex = (r) => r.fila.extra || {};
  const rutas = eq.rutas.map((r) => {
    const e = ex(r);
    const t = e.tabs || {};
    const sv = sinVualaDe(r.fila);
    const pMax = pctDe(t.max?.avance ?? r.fila.venta_mes, t.max?.objetivo ?? r.fila.objetivo_mes);
    const pOpen = pctDe(t.open?.avance, t.open?.objetivo);
    const pChamp = pctDe(t.champions?.avance, t.champions?.objetivo);
    const pOtcSem = pctDe(e.otc_semana?.vendido, e.otc_semana?.objetivo);
    const pOtcDia = pctDe(e.otc_dia, e.otc_dia_objetivo);
    const esperado = r.m.esperado;
    // Índice general: promedio de indicadores clave (mes contra ritmo, día, OTC semana, Sin Vuala, efectividad)
    const comp = [
      pMax !== null && esperado ? Math.min(120, (pMax / esperado) * 100) : null,
      r.m.pctDia !== null ? Math.min(120, r.m.pctDia) : null,
      pOtcSem !== null ? Math.min(120, pOtcSem) : null,
      sv ? Math.min(100, (sv.piezas / sv.minimo) * 100) : null,
      r.m.efectividad,
    ].filter((x) => x !== null && Number.isFinite(x));
    const indice = comp.length ? comp.reduce((a, b) => a + b, 0) / comp.length : null;

    // Unidades (paquetes / pesos / piezas)
    const maxV = num(t.max?.avance ?? r.fila.venta_mes) || 0;
    const maxO = num(t.max?.objetivo ?? r.fila.objetivo_mes) || 0;
    const openO = num(t.open?.objetivo) || 0;
    const champO = num(t.champions?.objetivo) || 0;
    const porDia = num(t.max?.por_dia ?? e.necesita_diario) ?? r.m.necesitaDiario;
    const ritmoPaq = (o) => (esperado ? (o * esperado) / 100 : null);
    const otcSemV = num(e.otc_semana?.vendido) || 0, otcSemO = num(e.otc_semana?.objetivo) || 0;
    const volAyer = { v: num(r.fila.venta_dia) || 0, o: num(r.fila.objetivo_dia) || 0 };

    // Qué le falta (para la retro), en unidades y del más grave al menos grave
    const faltas = [];
    const defMax = ritmoPaq(maxO) !== null ? ritmoPaq(maxO) - maxV : 0;
    if (defMax > 0) faltas.push({ g: defMax / (maxO || 1) * 300, t: `va ${miles(defMax)} paq abajo del ritmo MAX${porDia ? ` · necesita ${miles(porDia)} paq x día` : ''}` });
    if (volAyer.o > volAyer.v) faltas.push({ g: (volAyer.o - volAyer.v) / (volAyer.o || 1) * 100, t: `ayer le faltaron ${miles(volAyer.o - volAyer.v)} paq` });
    if (sv && !sv.cumple) faltas.push({ g: 90, t: `Sin Vuala ${sv.piezas} de ${sv.minimo} pz` });
    if (otcSemO > otcSemV && pOtcSem !== null && pOtcSem < 80) faltas.push({ g: 100 - pOtcSem, t: `${dinero(otcSemO - otcSemV)} de OTC semana` });
    for (const mk of (Array.isArray(e.marcas) ? e.marcas : [])) {
      const o = num(mk.objetivo) || 0, v = num(mk.vendido) || 0;
      const d = ritmoPaq(o) !== null ? ritmoPaq(o) - v : 0;
      if (o > 0 && d > 0 && d / o > 0.05) faltas.push({ g: d / o * 200, t: `${miles(d)} paq ${mk.nombre} abajo del ritmo` });
    }
    faltas.sort((a, b) => b.g - a.g);

    return { ...r, pMax, pOpen, pChamp, pOtcSem, pOtcDia, sv, indice, faltas: faltas.map((f) => f.t),
      maxV, maxO, openO, champO, porDia, otcSemV, otcSemO, volAyer, faltaMax: Math.max(0, maxO - maxV) };
  });
  const general = [...rutas].sort((a, b) => (b.indice ?? -1) - (a.indice ?? -1));
  const suma = (fn) => rutas.reduce((s, r) => s + (fn(r) || 0), 0);
  const tot = (k) => ({
    v: suma((r) => num(r.fila.extra?.tabs?.[k]?.avance)),
    o: suma((r) => num(r.fila.extra?.tabs?.[k]?.objetivo)),
  });
  const tMax = tot('max'), tOpen = tot('open'), tChamp = tot('champions');
  const otcV = suma((r) => num(r.fila.extra?.otc_semana?.vendido)), otcO = suma((r) => num(r.fila.extra?.otc_semana?.objetivo));
  const champMap = new Map();
  for (const r of rutas) {
    for (const mk of (Array.isArray(r.fila.extra?.marcas_champions) ? r.fila.extra.marcas_champions : [])) {
      const acc = champMap.get(mk.clave) || { clave: mk.clave, nombre: mk.nombre, vendido: 0, objetivo: 0 };
      acc.vendido += num(mk.vendido) || 0; acc.objetivo += num(mk.objetivo) || 0;
      champMap.set(mk.clave, acc);
    }
  }
  return {
    ...eq,
    rutasGrupo: general,
    pctMax: tMax.o ? (tMax.v / tMax.o) * 100 : eq.pctMes,
    pctOpen: tOpen.o ? (tOpen.v / tOpen.o) * 100 : null,
    pctChamp: tChamp.o ? (tChamp.v / tChamp.o) * 100 : null,
    pctOtcSem: otcO ? (otcV / otcO) * 100 : null,
    otcSemV: otcV, otcSemO: otcO,
    svCubiertas: rutas.filter((r) => r.sv && r.sv.cumple).length,
    svTotal: rutas.filter((r) => r.sv).length,
    visitasHoy: suma((r) => r.m.vis),
    marcasChamp: [...champMap.values()].filter((x) => x.objetivo > 0),
    maxV: tMax.v, maxO: tMax.o, openO: tOpen.o, champO: tChamp.o,
    porDiaTot: suma((r) => r.porDia),
  };
}

export function varsGrupo(g) {
  const nom = (r) => `${r.ruta}${r.nombre ? ` ${primerNombre(r.nombre, r.ruta)}` : ''}`;
  const conIndice = g.rutasGrupo.filter((r) => r.indice !== null);
  const bajos = conIndice.slice(-3).reverse();
  return {
    fecha: g.fecha ? fechaCorta(g.fecha) : null,
    hora: horaMX(g.actualizado),
    esperado: g.esperado === null ? null : pct(g.esperado),
    pct_max: g.pctMax === null ? null : pct(g.pctMax),
    pct_open: g.pctOpen === null ? null : pct(g.pctOpen),
    pct_champions: g.pctChamp === null ? null : pct(g.pctChamp),
    pct_dia_equipo: g.pctDia === null ? null : pct(g.pctDia),
    rutas_meta_dia: String(g.metaCumplida),
    total_rutas: String(g.rutas.length),
    pct_otc_semana: g.pctOtcSem === null ? null : pct(g.pctOtcSem),
    sin_vuala_cubiertas: g.svTotal ? String(g.svCubiertas) : null,
    visitas_hoy: String(g.visitasHoy || 0),
    top_general: conIndice.slice(0, 3).map((r, i) => `${medalla(i + 1)} ${nom(r)} – índice ${Math.round(r.indice)}`).join('\n'),
    retro_bajos: bajos.map((r) =>
      `• *${nom(r)}* (índice ${Math.round(r.indice)}): ${r.faltas.length ? 'le falta ' + r.faltas.slice(0, 3).join(', ') : 'va parejo, falta empujar'}.`
    ).join('\n'),
    ranking_general: conIndice.map((r, i) => `${i + 1}. ${nom(r)} – ${Math.round(r.indice)}`).join('\n'),
    // En unidades
    max_vendido: `${miles(g.maxV)} paq`,
    max_objetivo: `${miles(g.maxO)} paq`,
    max_falta: `${miles(Math.max(0, g.maxO - g.maxV))} paq`,
    max_por_dia: g.porDiaTot ? `${miles(g.porDiaTot)} paq` : null,
    max_ritmo: g.esperado !== null ? `${miles((g.maxO * g.esperado) / 100)} paq` : null,
    open_objetivo: g.openO ? `${miles(g.openO)} paq` : null,
    champ_objetivo: g.champO ? `${miles(g.champO)} paq` : null,
    otc_sem_vendido: dinero(g.otcSemV),
    otc_sem_objetivo: dinero(g.otcSemO),
    ayer_vendido: `${miles(g.ventaDia)} paq`,
    ayer_objetivo: `${miles(g.objDia)} paq`,
    top_paquetes: conIndice.slice(0, 3).map((r, i) => `${medalla(i + 1)} ${nom(r)} – ${miles(r.maxV)} de ${miles(r.maxO)} paq`).join('\n'),
    retro_unidades: bajos.map((r) => `• *${nom(r)}*: ${r.faltas.length ? r.faltas.slice(0, 3).join(' · ') : 'va parejo, falta empujar'}.`).join('\n'),
  };
}


// ---------------------------------------------------------------- Grupo: AVANCE DEL DÍA en unidades (sin %)
export function calcularGrupoDia(filas, contactosLista = []) {
  const eq = calcularEquipoDia(filas, contactosLista);
  const claves = [];
  const nombres = {};
  for (const f of filas) for (const mk of (f.extra?.marcas_dia || [])) {
    const k = mk.clave || mk.nombre;
    if (!claves.includes(k)) { claves.push(k); nombres[k] = mk.nombre || k; }
  }
  const rutas = eq.rutas.map((r) => {
    const e = r.fila.extra || {};
    const marcas = {};
    for (const mk of (e.marcas_dia || [])) marcas[mk.clave || mk.nombre] = { v: num(mk.vendido) || 0, o: num(mk.objetivo) || 0 };
    const vol = { v: num(r.fila.venta_dia) || 0, o: num(r.fila.objetivo_dia) || 0 };
    const otc = { v: num(e.otc_dia) || 0, o: num(e.otc_dia_objetivo) || 0 };
    const sv = sinVualaDe(r.fila);
    const vis = num(r.fila.clientes_visitados);
    // Lo que le falta HOY, en unidades
    const faltas = [];
    if (vol.o > vol.v) faltas.push({ g: (vol.o - vol.v) / (vol.o || 1), t: `${miles(vol.o - vol.v)} paq de volumen` });
    for (const k of claves) {
      const x = marcas[k];
      if (x && x.o > x.v) faltas.push({ g: (x.o - x.v) / (x.o || 1) * 0.8, t: `${miles(x.o - x.v)} paq ${nombres[k]}` });
    }
    if (sv && !sv.cumple) faltas.push({ g: 0.9, t: `${sv.falta} pz Sin Vuala` });
    if (otc.o > otc.v) faltas.push({ g: (otc.o - otc.v) / (otc.o || 1) * 0.8, t: `${dinero(otc.o - otc.v)} de OTC` });
    faltas.sort((a, b) => b.g - a.g);
    const cumpl = vol.o ? vol.v / vol.o : null;
    return { ruta: r.ruta, nombre: r.nombre, fila: r.fila, vol, marcas, otc, sv, vis, faltas: faltas.map((f) => f.t), cumpl };
  }).sort((a, b) => b.vol.v - a.vol.v);
  const tot = (fn) => rutas.reduce((s, r) => s + (fn(r) || 0), 0);
  return {
    fecha: eq.fecha, actualizado: eq.actualizado, unidad: eq.unidad,
    claves, nombres, rutas,
    vol: { v: tot((r) => r.vol.v), o: tot((r) => r.vol.o) },
    marcasTot: claves.map((k) => ({ clave: k, nombre: nombres[k], v: tot((r) => r.marcas[k]?.v), o: tot((r) => r.marcas[k]?.o) })),
    otc: { v: tot((r) => r.otc.v), o: tot((r) => r.otc.o) },
    svPiezas: tot((r) => r.sv?.piezas), svCubiertas: rutas.filter((r) => r.sv?.cumple).length,
    visitas: tot((r) => r.vis),
  };
}


export function varsGrupoDia(g) {
  const nom = (r) => `${r.ruta}${r.nombre ? ` ${primerNombre(r.nombre, r.ruta)}` : ''}`;
  const bajos = [...g.rutas].filter((r) => r.cumpl !== null).sort((a, b) => a.cumpl - b.cumpl).slice(0, 3);
  return {
    fecha: g.fecha ? fechaCorta(g.fecha) : null,
    hora: horaMX(g.actualizado),
    vol_vendido: `${miles(g.vol.v)} paq`,
    vol_objetivo: `${miles(g.vol.o)} paq`,
    marcas_equipo: g.marcasTot.map((m) => `• ${m.nombre}: ${miles(m.v)} de ${miles(m.o)} paq`).join('\n'),
    otc_vendido: dinero(g.otc.v),
    otc_objetivo: dinero(g.otc.o),
    sv_piezas: String(g.svPiezas || 0),
    sv_cubiertas: String(g.svCubiertas),
    total_rutas: String(g.rutas.length),
    visitas_hoy: String(g.visitas || 0),
    top_volumen: g.rutas.slice(0, 3).map((r, i) => `${medalla(i + 1)} ${nom(r)} – ${miles(r.vol.v)} paq`).join('\n'),
    retro_dia: bajos.map((r) => `• *${nom(r)}*: ${r.faltas.length ? 'le faltan ' + r.faltas.slice(0, 4).join(', ') : 'ya cumplió todo hoy 💪'}.`).join('\n'),
  };
}


// ---------------------------------------------------------------- RUTAS EN RIESGO (para Supervisor / Gerente)
// Proyección del mes: lo que lleva + (su promedio diario × días que faltan).
// nivel: 'ok' (proyecta ≥ umbral) · 'riesgo' (umbral-10 a umbral) · 'critico' (< umbral-10)
const nomR = (r) => `${r.ruta}${r.nombre ? ` ${primerNombre(r.nombre, r.ruta)}` : ''}`;

function accionSugerida(x) {
  if (x.efectividad !== null && x.efectividad < 75) return `Revisar con él los clientes que no compraron y acompañarlo a los de más volumen.`;
  if (x.marcaPeor) return `Empujar ${x.marcaPeor.nombre} con sus clientes top (va ${miles(x.marcaPeor.d)} paq abajo).`;
  if (x.sv && !x.sv.cumple) return `Que coloque OTC Sin Vuala hoy (${x.sv.piezas} de ${x.sv.minimo} pz).`;
  if (x.necesita) return `Acompañarlo en ruta y fijarle ${miles(x.necesita)} paq diarios.`;
  return 'Darle seguimiento hoy.';
}

export function calcularRiesgo(filas, contactosLista = [], umbral = 95) {
  const g = calcularGrupo(filas, contactosLista);
  const rutas = g.rutasGrupo.map((r) => {
    const ex = r.fila.extra || {};
    const cal = diasHabiles(r.fila.fecha);
    const trans = num(ex.dias_transcurridos) ?? cal.trans;
    const rest = num(ex.dias_restantes) ?? cal.restantes;
    const promedio = trans > 0 ? r.maxV / trans : null;
    const proy = promedio !== null ? r.maxV + promedio * rest : null;
    const pctProy = proy !== null && r.maxO ? (proy / r.maxO) * 100 : null;
    const faltaProy = proy !== null ? Math.max(0, r.maxO - proy) : null;
    const necesita = rest > 0 ? Math.max(0, r.maxO - r.maxV) / rest : null;
    const brecha = necesita !== null && promedio !== null ? necesita - promedio : null;
    // Marca OPEN más atrasada contra el ritmo
    let marcaPeor = null;
    for (const mk of (Array.isArray(ex.marcas) ? ex.marcas : [])) {
      const o = num(mk.objetivo) || 0, v = num(mk.vendido) || 0;
      const d = r.m.esperado ? (o * r.m.esperado) / 100 - v : 0;
      if (o > 0 && d / o > 0.05 && (!marcaPeor || d > marcaPeor.d)) marcaPeor = { nombre: mk.nombre, d };
    }
    const nivel = pctProy === null ? null : pctProy >= umbral ? 'ok' : pctProy >= umbral - 10 ? 'riesgo' : 'critico';
    const x = { ...r, trans, rest, promedio, proy, pctProy, faltaProy, necesita, brecha, marcaPeor, nivel, efectividad: r.m.efectividad };
    // Señales extra
    const senales = [];
    if (marcaPeor) senales.push(`${marcaPeor.nombre} ${miles(marcaPeor.d)} paq abajo`);
    if (r.sv && !r.sv.cumple) senales.push(`Sin Vuala ${r.sv.piezas}/${r.sv.minimo}`);
    if (x.efectividad !== null && x.efectividad < 80) senales.push(`efectividad ${pct(x.efectividad)}`);
    if (r.volAyer.o && r.volAyer.v / r.volAyer.o < 0.7) senales.push(`ayer ${miles(r.volAyer.v)} de ${miles(r.volAyer.o)} paq`);
    if (r.pOtcSem !== null && r.pOtcSem < 80) senales.push(`OTC semana ${pct(r.pOtcSem)}`);
    x.senales = senales;
    x.accion = accionSugerida(x);
    return x;
  }).sort((a, b) => (a.pctProy ?? 999) - (b.pctProy ?? 999));
  const enRiesgo = rutas.filter((r) => r.nivel === 'riesgo' || r.nivel === 'critico');
  const sum = (fn) => rutas.reduce((s, r) => s + (fn(r) || 0), 0);
  const proyEq = sum((r) => r.proy), objEq = sum((r) => r.maxO);
  return {
    fecha: g.fecha, umbral, rutas, enRiesgo, ok: rutas.filter((r) => r.nivel === 'ok'),
    proyEquipo: proyEq, objEquipo: objEq, pctProyEquipo: objEq ? (proyEq / objEq) * 100 : null,
  };
}

export function varsRiesgo(rk) {
  const det = rk.enRiesgo.map((r) => [
    `${r.nivel === 'critico' ? '🔴' : '🟠'} *${nomR(r)}* · cierra en *${pct(r.pctProy)}* (faltarían ${miles(r.faltaProy)} paq)`,
    r.promedio !== null && r.necesita !== null
      ? `   Lleva ${miles(r.promedio)} paq/día, necesita ${miles(r.necesita)}${r.brecha > 0 ? ` (+${miles(r.brecha)})` : ''}` : null,
    r.senales.length ? `   ⚠️ ${r.senales.slice(0, 3).join(' · ')}` : null,
    `   👉 ${r.accion}`,
  ].filter(Boolean).join('\n')).join('\n\n');
  return {
    fecha: rk.fecha ? fechaCorta(rk.fecha) : null,
    umbral: `${rk.umbral}%`,
    total_riesgo: String(rk.enRiesgo.length),
    total_rutas: String(rk.rutas.length),
    proyeccion_equipo: rk.pctProyEquipo === null ? null : pct(rk.pctProyEquipo),
    falta_equipo: `${miles(Math.max(0, rk.objEquipo - rk.proyEquipo))} paq`,
    rutas_riesgo: det,
    rutas_ok: rk.ok.map((r) => `${r.ruta} (${pct(r.pctProy)})`).join(', '),
    criticas: rk.enRiesgo.filter((r) => r.nivel === 'critico').map(nomR).join(', '),
  };
}

// 3 pm: rutas que van mal HOY (día abajo del umbral o sin Sin Vuala), con su proyección del mes.
export function calcularRiesgoTarde(filasHoy, contactosLista = [], umbralDia = 70, umbralMes = 95) {
  const gd = calcularGrupoDia(filasHoy, contactosLista);
  const rk = calcularRiesgo(filasHoy, contactosLista, umbralMes);
  const mesPor = Object.fromEntries(rk.rutas.map((r) => [r.ruta, r]));
  const rutas = gd.rutas.map((r) => {
    const pctDia = r.vol.o ? (r.vol.v / r.vol.o) * 100 : null;
    const malDia = pctDia !== null && pctDia < umbralDia;
    const sinSv = r.sv && !r.sv.cumple;
    return { ...r, pctDia, mes: mesPor[r.ruta] || null, enRiesgo: malDia || sinSv, critico: pctDia !== null && pctDia < umbralDia - 25 };
  }).sort((a, b) => (a.pctDia ?? 999) - (b.pctDia ?? 999));
  return { fecha: gd.fecha, nombres: gd.nombres, rutas, enRiesgo: rutas.filter((r) => r.enRiesgo), ok: rutas.filter((r) => !r.enRiesgo) };
}

export function varsRiesgoTarde(rt) {
  const det = rt.enRiesgo.map((r) => {
    let marcaDia = null;
    for (const [k, x] of Object.entries(r.marcas || {})) {
      const d = x.o - x.v;
      if (d > 0 && (!marcaDia || d > marcaDia.d)) marcaDia = { n: rt.nombres?.[k] || k, d };
    }
    const mes = r.mes && r.mes.nivel && r.mes.nivel !== 'ok' ? ` · mes cierra en ${pct(r.mes.pctProy)}` : '';
    const acc = r.sv && !r.sv.cumple && (r.pctDia ?? 100) >= 70
      ? 'Que coloque Sin Vuala antes de cerrar.'
      : marcaDia ? `Llámale y que empuje ${marcaDia.n} (le faltan ${miles(marcaDia.d)} paq) en lo que le queda de ruta.`
        : 'Llámale ya, todavía da tiempo de recuperar.';
    return [
      `${r.critico ? '🔴' : '🟠'} *${nomR(r)}* · ${miles(r.vol.v)} de ${miles(r.vol.o)} paq (${pct(r.pctDia)})${mes}`,
      r.faltas.length ? `   Le falta: ${r.faltas.slice(0, 4).join(', ')}` : null,
      `   👉 ${acc}`,
    ].filter(Boolean).join('\n');
  }).join('\n\n');
  return {
    fecha: rt.fecha ? fechaCorta(rt.fecha) : null,
    total_riesgo: String(rt.enRiesgo.length),
    total_rutas: String(rt.rutas.length),
    rutas_riesgo: det,
    rutas_ok: rt.ok.map((r) => `${r.ruta} (${pct(r.pctDia)})`).join(', '),
  };
}


// ---------------------------------------------------------------- 🎯 RETO DEL DÍA
// Se calcula siempre igual para una fecha: con el corte ANTERIOR a esa fecha se elige la marca
// (la más atrasada contra el ritmo del mes, o la que se fije en la pestaña) y la meta de cada ruta
// (lo que necesita por día de esa marca, o una meta fija). Así no hay que guardar nada.
const normK = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function elegirReto(filasBase, cfg = {}, fecha = null) {
  if (!filasBase?.length || cfg?.retoActivo === false) return null;
  const nombresDia = {};
  for (const f of filasBase) for (const mk of (f.extra?.marcas_dia || [])) nombresDia[mk.clave] = mk.nombre || mk.clave;
  const claves = Object.keys(nombresDia);
  if (!claves.length) return null;

  const fijo = cfg?.retoMarca && claves.includes(cfg.retoMarca) ? cfg.retoMarca : null;
  let clave = fijo, motivo = fijo ? 'marca elegida por la gerencia' : '';
  if (!clave) {
    // Déficit del equipo contra el ritmo del mes, por marca
    const acc = {};
    for (const f of filasBase) {
      const m = calcular(f, filasBase);
      for (const mk of (Array.isArray(f.extra?.marcas) ? f.extra.marcas : [])) {
        if (!claves.includes(mk.clave)) continue;
        const o = num(mk.objetivo) || 0, v = num(mk.vendido) || 0;
        const a = acc[mk.clave] || { def: 0, obj: 0, resta: 0 };
        a.def += m.esperado ? (o * m.esperado) / 100 - v : 0;
        a.obj += o;
        a.resta += Math.max(0, o - v);
        acc[mk.clave] = a;
      }
    }
    const lista = Object.entries(acc).filter(([, a]) => a.obj > 0);
    if (!lista.length) return null;
    lista.sort((x, y) => (y[1].def / y[1].obj) - (x[1].def / x[1].obj) || y[1].resta - x[1].resta);
    clave = lista[0][0];
    const d = lista[0][1].def;
    motivo = d > 0 ? `es la que va más atrasada del mes (${miles(d)} paq abajo del ritmo)` : 'es la que más le falta al equipo';
  }

  const metaFija = Number(cfg?.retoMeta) > 0 ? Math.round(Number(cfg.retoMeta)) : null;
  const metas = {};
  for (const f of filasBase) {
    const ex = f.extra || {};
    const mk = (ex.marcas || []).find((x) => x.clave === clave);
    const mkDia = (ex.marcas_dia || []).find((x) => x.clave === clave);
    let meta = metaFija;
    if (!meta) {
      const cal = diasHabiles(f.fecha);
      const rest = Math.max(1, num(ex.dias_restantes) ?? cal.restantes);
      meta = num(mk?.por_dia) ?? (mk ? Math.max(0, (num(mk.objetivo) || 0) - (num(mk.vendido) || 0)) / rest : null);
      if (!meta || meta < 1) meta = num(mkDia?.objetivo) || null;
      meta = meta ? Math.max(1, Math.ceil(meta)) : null;
    }
    if (meta) metas[claveRuta(f.ruta)] = meta;
  }
  if (!Object.keys(metas).length) return null;
  return { fecha, clave, nombre: nombresDia[clave] || clave, metas, motivo };
}

// Cómo va el reto con las filas de ESA fecha.
export function avanceReto(reto, filasDelDia, contactosLista = []) {
  if (!reto) return null;
  const nombrePorRuta = {};
  for (const c of contactosLista) if (c.tipo === 'vendedor') nombrePorRuta[claveRuta(c.ruta)] = c.nombre;
  const tabla = filasDelDia.map((f) => {
    const ruta = claveRuta(f.ruta);
    const meta = reto.metas[ruta];
    if (!meta) return null;
    const mk = (f.extra?.marcas_dia || []).find((x) => x.clave === reto.clave || normK(x.nombre) === normK(reto.nombre));
    const v = num(mk?.vendido) || 0;
    return { ruta, nombre: nombrePorRuta[ruta] || '', v, meta, cumple: v >= meta, pct: (v / meta) * 100 };
  }).filter(Boolean).sort((a, b) => b.pct - a.pct || b.v - a.v);
  const cumplieron = tabla.filter((r) => r.cumple);
  const ganador = cumplieron.length ? [...cumplieron].sort((a, b) => b.v - a.v)[0] : null;
  return { ...reto, tabla, cumplieron, ganador, total: tabla.reduce((s, r) => s + r.v, 0), metaTotal: tabla.reduce((s, r) => s + r.meta, 0) };
}

export function textoRetoAnuncio(reto, ayer = null) {
  if (!reto) return '';
  const metas = Object.entries(reto.metas).sort((a, b) => a[0].localeCompare(b[0])).map(([r, m]) => `${r} ${m}`).join(' · ');
  const lineas = [
    `🎯 *RETO DEL DÍA: ${reto.nombre}*`,
    reto.motivo ? `_Porque ${reto.motivo}._` : null,
    `Meta por ruta (paq): ${metas}`,
    'Gana quien la pase con más paquetes. Se actualiza con cada avance 🔥',
  ];
  const g = textoGanadorAyer(ayer);
  return [g, g ? '' : null, ...lineas].filter((x) => x !== null).join('\n');
}

export function textoGanadorAyer(av) {
  if (!av || !av.tabla.length) return '';
  const nom = (r) => `${r.ruta}${r.nombre ? ` ${primerNombre(r.nombre, r.ruta)}` : ''}`;
  if (av.ganador) {
    const otros = av.cumplieron.filter((r) => r.ruta !== av.ganador.ruta).map((r) => r.ruta);
    return `🏆 *Ganador del reto de ayer (${av.nombre}):* ${nom(av.ganador)} con ${miles(av.ganador.v)} paq (meta ${av.ganador.meta})` +
      (otros.length ? `\nTambién cumplieron: ${otros.join(', ')} 👏` : '');
  }
  const cerca = av.tabla[0];
  return `😬 *Reto de ayer (${av.nombre}):* nadie llegó. El más cerca fue ${nom(cerca)} con ${miles(cerca.v)} de ${cerca.meta} paq.`;
}

export function textoRetoTabla(av) {
  if (!av || !av.tabla.length) return '';
  const nom = (r) => `${r.ruta}${r.nombre ? ` ${primerNombre(r.nombre, r.ruta)}` : ''}`;
  return [
    `🎯 *RETO ${av.nombre}* · equipo ${miles(av.total)} de ${miles(av.metaTotal)} paq`,
    ...av.tabla.map((r, i) => `${medalla(i + 1) || `${i + 1}.`} ${nom(r)}: ${miles(r.v)}/${r.meta}${r.cumple ? ' ✅' : ''}`),
  ].join('\n');
}

export function textoRetoVendedor(av, ruta, modo = 'dia') {
  if (!av) return '';
  const k = claveRuta(ruta);
  const meta = av.metas[k];
  if (!meta) return '';
  if (modo === 'anuncio') return `🎯 *Reto de hoy: ${av.nombre}* · tu meta ${meta} paq. ¡A ganarlo!`;
  const i = av.tabla.findIndex((r) => r.ruta === k);
  if (i < 0) return '';
  const r = av.tabla[i];
  return r.cumple
    ? `🎯 Reto ${av.nombre}: ✅ ${miles(r.v)} de ${meta} paq · vas ${i + 1}° de ${av.tabla.length}${i === 0 ? ' 🏆' : ''}`
    : `🎯 Reto ${av.nombre}: ${miles(r.v)} de ${meta} paq · te faltan ${miles(meta - r.v)} · vas ${i + 1}° de ${av.tabla.length}`;
}

// ---------------------------------------------------------------- 🏁 TE REBASARON
// Ranking del día por paquetes vendidos. Se compara contra el último avance guardado en wa_estado.
export function rankingPaquetes(filas) {
  return filas
    .map((f) => ({ ruta: claveRuta(f.ruta), v: num(f.venta_dia) }))
    .filter((x) => x.v !== null)
    .sort((a, b) => b.v - a.v);
}

// Devuelve [{ victima, rebasaron: [{ruta, v, ventaja}], v, lugarAntes, lugarAhora }]
export function detectarRebases(antes, ahora) {
  if (!antes?.length || !ahora?.length) return [];
  const pos = (lista) => Object.fromEntries(lista.map((x, i) => [x.ruta, i]));
  const pa = pos(antes), pn = pos(ahora);
  const vAhora = Object.fromEntries(ahora.map((x) => [x.ruta, x.v]));
  const res = [];
  for (const b of ahora) {
    if (pa[b.ruta] === undefined) continue;
    const rebasaron = ahora
      .filter((a) => a.ruta !== b.ruta && pa[a.ruta] !== undefined && pa[a.ruta] > pa[b.ruta] && pn[a.ruta] < pn[b.ruta] && a.v > b.v)
      .map((a) => ({ ruta: a.ruta, v: a.v, ventaja: a.v - vAhora[b.ruta] }));
    if (rebasaron.length && pn[b.ruta] > pa[b.ruta]) res.push({ victima: b.ruta, v: b.v, rebasaron, lugarAntes: pa[b.ruta] + 1, lugarAhora: pn[b.ruta] + 1 });
  }
  return res;
}

const FRASES_REBASE = {
  picante: [
    '¿Te vas a dejar, cabrón? 😤',
    'No mames, te están comiendo el mandado 🥵',
    '¡Ponte las pilas, güey! Todavía hay tiempo de regresársela 🔥',
    'Te pasaron como si estuvieras parado, ¿o qué? 🐢',
  ],
  compa: [
    '¿Te vas a dejar? 😤',
    '¡Échale ganas, todavía da tiempo de regresársela! 🔥',
    'Te están comiendo el mandado, compa 👀',
  ],
  normal: [
    'Todavía hay tiempo para recuperar tu lugar 💪',
    '¡Tú puedes recuperar el lugar! 🔥',
  ],
};

export function textoRebase(r, nombre, nombresRutas = {}, tono = 'picante') {
  const nomR2 = (k) => `${k}${nombresRutas[k] ? ` ${primerNombre(nombresRutas[k], k)}` : ''}`;
  const frases = FRASES_REBASE[tono] || FRASES_REBASE.picante;
  const frase = frases[Math.floor(Math.random() * frases.length)];
  const quien = r.rebasaron.length === 1
    ? `la *${nomR2(r.rebasaron[0].ruta)}* te acaba de pasar y ya te lleva ${miles(r.rebasaron[0].ventaja)} paq`
    : `te acaban de pasar ${r.rebasaron.map((x) => `*${nomR2(x.ruta)}*`).join(' y ')}`;
  const recuperar = Math.max(...r.rebasaron.map((x) => x.ventaja)) + 1;
  return [
    `🏁 *${nombre || r.victima}*, ${quien}.`,
    `Bajaste del ${r.lugarAntes}° al *${r.lugarAhora}°* del día con ${miles(r.v)} paq.`,
    `Con ${miles(recuperar)} paq más recuperas tu lugar. ${frase}`,
  ].join('\n');
}
