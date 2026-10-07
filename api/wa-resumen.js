// api/wa-resumen.js — arma los mensajes que n8n envía por Evolution API.
//
//   GET  /api/wa-resumen?modo=matutino   → tarjeta + texto para cada vendedor (cierre de ayer)
//   GET  /api/wa-resumen?modo=alerta     → aviso de la tarde solo a quien va abajo hoy
//   POST /api/wa-resumen?modo=bot        → body { numero, texto }  → respuesta del bot
//
// Todas requieren el header  x-bot-token: <BOT_TOKEN>

import {
  autorizado, firmar, fechaMX, fechaCorta, cantidad, pct, primerNombre, numeroEnvio,
  ultimosPorRuta, filasDeFecha, contactos, contactoPorTelefono, calcular, estadoMes,
  frase, icono, medalla, claveRuta, sb,
} from './_wa-lib.js';

export const config = { runtime: 'edge' };

const UMBRAL_ALERTA_PCT = 70; // avisar en la tarde si hoy va por debajo de este %

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function baseUrl(req) {
  return (process.env.PUBLIC_BASE_URL || new URL(req.url).origin).replace(/\/+$/, '');
}

async function urlTarjeta(req, ruta, fecha, actualizadoEn) {
  const s = await firmar(ruta, fecha);
  const v = actualizadoEn ? new Date(actualizadoEn).getTime() : Date.now();
  return `${baseUrl(req)}/api/tarjeta?ruta=${encodeURIComponent(ruta)}&f=${fecha}&s=${s}&v=${v}`;
}

// Cache sencillo de filas por fecha dentro de una misma petición (para ranking).
async function companerasDe(fecha, cache) {
  if (!cache[fecha]) cache[fecha] = await filasDeFecha(fecha);
  return cache[fecha];
}

// ------------------------------------------------------------------ textos
function textoResumen(fila, m, { saludo = true } = {}) {
  const e = estadoMes(m);
  const lineas = [];
  if (saludo) lineas.push(`☀️ *Buenos días, ${primerNombre(fila.nombre, fila.ruta)}*`);
  lineas.push(`Ruta ${claveRuta(fila.ruta)} · corte del ${fechaCorta(fila.fecha)}`, '');
  if (m.pctMes !== null)
    lineas.push(`📈 Mes: *${pct(m.pctMes)}* (ritmo esperado ${pct(m.esperado)}) ${icono(e)}`);
  if (m.pctDia !== null)
    lineas.push(`📦 Día: ${cantidad(m.ventaDia, m.unidad)} de ${cantidad(m.objDia, m.unidad)} (${pct(m.pctDia)})`);
  if (m.efectividad !== null)
    lineas.push(`🎯 Efectividad: ${pct(m.efectividad)}${m.prog ? ` (${m.vis ?? 0}/${m.prog} clientes)` : m.vis !== null ? ` · ${m.vis} visitas efectivas` : ''}`);
  if (m.ranking) lineas.push(`🏁 Lugar ${m.ranking} de ${m.totalRutas} ${medalla(m.ranking)}`.trim());
  lineas.push('', frase(m), '', 'Escribe *menu* para ver qué más te puedo decir.');
  return lineas.join('\n');
}

const MENU = [
  '🤖 *Bot SMART-TRACK*',
  'Escríbeme una palabra:',
  '',
  '• *avance* – tu tarjeta con los números',
  '• *hoy* – cómo vas en el día',
  '• *ranking* – tu lugar en el equipo',
  '• *clientes* – tus visitas',
].join('\n');

function normalizar(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function comando(texto) {
  const t = normalizar(texto);
  if (/\b(avance|resumen|mes|cuota|numeros|meta|tarjeta)\b/.test(t)) return 'avance';
  if (/\b(hoy|dia)\b/.test(t)) return 'hoy';
  if (/\b(ranking|lugar|posicion|tabla)\b/.test(t)) return 'ranking';
  if (/\b(clientes|visitas|efectividad)\b/.test(t)) return 'clientes';
  return 'menu';
}

// ------------------------------------------------------------------ modos
async function modoMatutino(req) {
  const hoy = fechaMX();
  const [lista, ultimos] = await Promise.all([
    contactos({ campo: 'recibir_matutino' }),
    ultimosPorRuta({ antesDe: hoy }), // cierre más reciente ANTES de hoy
  ]);
  const cache = {};
  const mensajes = [];
  for (const c of lista) {
    const fila = ultimos[claveRuta(c.ruta)];
    if (!fila) continue;
    const m = calcular(fila, await companerasDe(fila.fecha, cache));
    const nombreFila = { ...fila, nombre: c.nombre || fila.nombre };
    mensajes.push({
      ruta: c.ruta,
      numero: numeroEnvio(c.telefono),
      caption: textoResumen(nombreFila, m),
      tarjeta_url: await urlTarjeta(req, fila.ruta, fila.fecha, fila.actualizado_en),
    });
  }
  return json({ fecha: hoy, total: mensajes.length, mensajes });
}

async function modoAlerta() {
  const hoy = fechaMX();
  const [lista, filasHoy] = await Promise.all([contactos({ campo: 'recibir_alerta' }), filasDeFecha(hoy)]);
  const porRuta = Object.fromEntries(filasHoy.map((f) => [claveRuta(f.ruta), f]));
  const mensajes = [];
  for (const c of lista) {
    const fila = porRuta[claveRuta(c.ruta)];
    if (!fila) continue;
    const m = calcular(fila, filasHoy);
    if (m.pctDia === null || m.pctDia >= UMBRAL_ALERTA_PCT) continue;
    const falta = Math.max(0, (m.objDia || 0) - (m.ventaDia || 0));
    mensajes.push({
      ruta: c.ruta,
      numero: numeroEnvio(c.telefono),
      texto: [
        `⏰ *${primerNombre(c.nombre, c.ruta)}*, así vas hoy:`,
        `${cantidad(m.ventaDia, m.unidad)} de ${cantidad(m.objDia, m.unidad)} (${pct(m.pctDia)})`,
        '',
        `Te faltan *${cantidad(falta, m.unidad)}* para tu meta del día. ¡Todavía da tiempo! 💪`,
      ].join('\n'),
    });
  }
  return json({ fecha: hoy, total: mensajes.length, mensajes });
}

async function modoBot(req) {
  let body = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const numero = String(body.numero || '').replace(/\D/g, '');
  const responder = (extra) => json({ numero, ...extra });

  const c = await contactoPorTelefono(numero);
  if (!c) {
    return responder({
      tipo: 'texto',
      texto: 'Hola 👋 Este número no está registrado en SMART-TRACK. Pídele a tu supervisor que te dé de alta.',
    });
  }

  const cmd = comando(body.texto);
  if (cmd === 'menu') return responder({ tipo: 'texto', texto: MENU });

  const hoy = fechaMX();
  const ultimos = await ultimosPorRuta({ hasta: hoy });
  const fila = ultimos[claveRuta(c.ruta)];
  if (!fila) return responder({ tipo: 'texto', texto: 'Todavía no hay datos cargados para tu ruta. Intenta más tarde.' });

  const companeras = await filasDeFecha(fila.fecha);
  const m = calcular(fila, companeras);
  const nombre = primerNombre(c.nombre, c.ruta);
  const esDeHoy = fila.fecha === hoy;
  const aviso = esDeHoy ? '' : `\n\n_Los datos de hoy aún no se cargan; esto es del ${fechaCorta(fila.fecha)}._`;

  if (cmd === 'avance') {
    return responder({
      tipo: 'imagen',
      caption: textoResumen({ ...fila, nombre: c.nombre }, m, { saludo: false }),
      tarjeta_url: await urlTarjeta(req, fila.ruta, fila.fecha, fila.actualizado_en),
    });
  }

  if (cmd === 'hoy') {
    if (m.pctDia === null) return responder({ tipo: 'texto', texto: `No tengo tu avance del día todavía.${aviso}` });
    const falta = Math.max(0, (m.objDia || 0) - (m.ventaDia || 0));
    return responder({
      tipo: 'texto',
      texto: [
        `📦 *${nombre}*, en el día llevas:`,
        `${cantidad(m.ventaDia, m.unidad)} de ${cantidad(m.objDia, m.unidad)} (*${pct(m.pctDia)}*)`,
        falta > 0 ? `Te faltan ${cantidad(falta, m.unidad)} para la meta.` : '¡Meta del día cumplida! 🎉',
      ].join('\n') + aviso,
    });
  }

  if (cmd === 'ranking') {
    if (!m.ranking) return responder({ tipo: 'texto', texto: `Aún no hay ranking disponible.${aviso}` });
    const top = m.rankingLista.slice(0, 3)
      .map((r, i) => `${medalla(i + 1)} ${r.ruta} – ${pct(r.p * 100)}`).join('\n');
    return responder({
      tipo: 'texto',
      texto: `🏁 *${nombre}*, vas en el lugar *${m.ranking} de ${m.totalRutas}* (${pct(m.pctMes)} del mes).\n\nTop 3:\n${top}${aviso}`,
    });
  }

  if (cmd === 'clientes') {
    if (m.efectividad === null && m.vis === null) return responder({ tipo: 'texto', texto: `No tengo datos de visitas todavía.${aviso}` });
    const pendientes = m.prog ? Math.max(0, m.prog - (m.vis || 0)) : null;
    return responder({
      tipo: 'texto',
      texto: [
        `🎯 *${nombre}*, efectividad del día: *${pct(m.efectividad)}*`,
        m.prog ? `Visitas efectivas: ${m.vis ?? 0} de ${m.prog}` : m.vis !== null ? `Visitas efectivas hoy: ${m.vis}` : null,
        pendientes ? `Te quedan ${pendientes} clientes por visitar.` : null,
      ].filter(Boolean).join('\n') + aviso,
    });
  }

  return responder({ tipo: 'texto', texto: MENU });
}

// Diagnóstico: qué ve el bot en Supabase (sin teléfonos completos)
async function modoDiag() {
  const hoy = fechaMX();
  const [todos, activos, matutino, resumen, previos] = await Promise.all([
    sb('vendedores_whatsapp?select=ruta,activo,recibir_matutino,telefono'),
    contactos(),
    contactos({ campo: 'recibir_matutino' }),
    sb(`resumen_vendedores?select=ruta,fecha&order=fecha.desc&limit=30`),
    ultimosPorRuta({ antesDe: hoy }),
  ]);
  const llave = (process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  return json({
    version: 'diag-2',
    hoy,
    supabase_url: (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/^https:\/\/([a-z0-9]{6}).*/, '$1…'),
    tipo_llave: llave.startsWith('sb_secret') ? 'sb_secret' : llave.startsWith('sb_publishable') ? 'PUBLISHABLE (incorrecta)' : llave.startsWith('eyJ') ? 'jwt' : llave ? 'otra' : 'VACÍA',
    contactos_total: todos.length,
    contactos: todos.map((c) => ({ ruta: c.ruta, clave: claveRuta(c.ruta), activo: c.activo, matutino: c.recibir_matutino, tel: '…' + String(c.telefono).slice(-4) })),
    contactos_activos: activos.length,
    contactos_matutino: matutino.length,
    resumen_filas: resumen.length,
    resumen_ultimas: resumen.slice(0, 10),
    claves_antes_de_hoy: Object.keys(previos),
  });
}

// ------------------------------------------------------------------ handler
export default async function handler(req) {
  if (!autorizado(req)) return json({ error: 'no autorizado' }, 401);
  const modo = new URL(req.url).searchParams.get('modo');
  try {
    if (modo === 'matutino') return await modoMatutino(req);
    if (modo === 'diag') return await modoDiag();
    if (modo === 'alerta') return await modoAlerta(req);
    if (modo === 'bot' && req.method === 'POST') return await modoBot(req);
    return json({ error: 'modo inválido (matutino | alerta | bot)' }, 400);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
