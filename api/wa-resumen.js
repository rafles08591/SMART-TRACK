// api/wa-resumen.js — arma los mensajes que n8n envía por Evolution API.
//
//   GET  /api/wa-resumen?modo=matutino   → tarjeta + texto para cada contacto (corte más reciente antes de hoy)
//                                          vendedores: su tarjeta · equipo (Supervisor/Gerente): tarjeta del equipo
//   GET  /api/wa-resumen?modo=dia        → tarjeta del AVANCE DEL DÍA (la dispara la app al cargar el avance)
//   GET  /api/wa-resumen?modo=alerta     → aviso de la tarde solo a vendedores que van abajo hoy
//   POST /api/wa-resumen?modo=bot        → body { numero, texto }  → respuesta del bot
//   GET  /api/wa-resumen?modo=diag       → diagnóstico
//
// Todas requieren el header  x-bot-token: <BOT_TOKEN>
// Contactos y textos se editan en SMART-TRACK (pestaña WhatsApp) → data.whatsappBot

import {
  autorizado, firmar, fechaMX, fechaCorta, cantidad, pct, primerNombre, numeroEnvio,
  ultimosPorRuta, filasDeFecha, contactos, contactoPorTelefono, calcular, medalla, claveRuta, sb,
  configBot, listaContactos, PLANTILLAS_DEFAULT, llenarPlantilla, varsVendedor, calcularEquipo, varsEquipo,
  varsDia, calcularEquipoDia, varsEquipoDia, sinVualaDe, destino, calcularGrupo, varsGrupo,
} from './_wa-lib.js';

export const config = { runtime: 'edge' };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function baseUrl(req) {
  return (process.env.PUBLIC_BASE_URL || new URL(req.url).origin).replace(/\/+$/, '');
}

async function urlTarjeta(req, ruta, fecha, actualizadoEn, tipo = '') {
  const s = await firmar(tipo ? `${tipo.toUpperCase()}:${ruta}` : ruta, fecha);
  const v = actualizadoEn ? new Date(actualizadoEn).getTime() : Date.now();
  return `${baseUrl(req)}/api/tarjeta?ruta=${encodeURIComponent(ruta)}&f=${fecha}&s=${s}&v=${v}${tipo ? `&t=${tipo}` : ''}`;
}

const plantilla = (cfg, tipo) => {
  const t = cfg?.plantillas?.[tipo];
  return typeof t === 'string' && t.trim() ? t : PLANTILLAS_DEFAULT[tipo];
};

const conAviso = (texto, cfg) => {
  const aviso = String(cfg?.aviso || '').trim();
  return aviso ? `${texto}\n\n📣 ${aviso}` : texto;
};

async function companerasDe(fecha, cache) {
  if (!cache[fecha]) cache[fecha] = await filasDeFecha(fecha);
  return cache[fecha];
}

// Fecha del corte más reciente (opcionalmente antes de hoy).
async function fechaUltimoCorte({ antesDe = null, hasta = null } = {}) {
  let q = 'resumen_vendedores?select=fecha&order=fecha.desc&limit=1';
  if (antesDe) q += `&fecha=lt.${antesDe}`;
  if (hasta) q += `&fecha=lte.${hasta}`;
  const r = await sb(q);
  return r[0]?.fecha || null;
}

// ------------------------------------------------------------------ menús
const MENU_VENDEDOR = [
  '🤖 *Bot SMART-TRACK*',
  'Escríbeme una palabra:',
  '',
  '• *avance* – tu tarjeta con los números',
  '• *hoy* – cómo vas en el día',
  '• *ranking* – tu lugar en el equipo',
  '• *clientes* – tus visitas',
  '• *marcas* – cómo vas en cada marca',
].join('\n');

const MENU_EQUIPO = [
  '🤖 *Bot SMART-TRACK · Equipo*',
  'Escríbeme una palabra:',
  '',
  '• *avance* – tarjeta del equipo completo',
  '• *ranking* – las 7 rutas ordenadas',
  '• *hoy* – avance del día por ruta',
].join('\n');

function normalizar(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// El número del bot es el de la empresa (también le escriben clientes), así que
// SOLO se contesta a mensajes cortos que sean un comando. Todo lo demás se ignora.
function comando(texto) {
  const t = normalizar(texto).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.split(' ').length > 3) return 'nada';
  if (/^(menu|ayuda|bot|comandos|opciones)$/.test(t)) return 'menu';
  if (/\b(marcas?|ice|bloss|summ|faronet)\b/.test(t)) return 'marcas';
  if (/\b(avance|resumen|mes|cuota|numeros|meta|tarjeta|equipo)\b/.test(t)) return 'avance';
  if (/\b(hoy|dia)\b/.test(t)) return 'hoy';
  if (/\b(ranking|lugar|posicion|tabla)\b/.test(t)) return 'ranking';
  if (/\b(clientes|visitas|efectividad)\b/.test(t)) return 'clientes';
  return 'nada';
}

// ------------------------------------------------------------------ matutino
async function modoMatutino(req) {
  const hoy = fechaMX();
  const cfg = await configBot();
  const [lista, ultimos, fechaEq] = await Promise.all([
    contactos({ campo: 'matutino', cfg }),
    ultimosPorRuta({ antesDe: hoy }),
    fechaUltimoCorte({ antesDe: hoy }),
  ]);
  const todos = await listaContactos(cfg);
  const cache = {};
  const mensajes = [];

  for (const c of lista) {
    if (c.tipo === 'grupo') {
      if (!fechaEq) continue;
      const filas = await companerasDe(fechaEq, cache);
      if (!filas.length) continue;
      const g = calcularGrupo(filas, todos);
      mensajes.push({
        ruta: 'GRUPO', tipo: 'grupo', numero: destino(c),
        caption: conAviso(llenarPlantilla(plantilla(cfg, 'grupo'), varsGrupo(g)), cfg),
        tarjeta_url: await urlTarjeta(req, 'GRUPO', fechaEq, g.actualizado),
      });
      continue;
    }
    if (c.tipo === 'equipo') {
      if (!fechaEq) continue;
      const filas = await companerasDe(fechaEq, cache);
      if (!filas.length) continue;
      const eq = calcularEquipo(filas, todos);
      mensajes.push({
        ruta: 'EQUIPO',
        tipo: 'equipo',
        numero: destino(c),
        caption: conAviso(llenarPlantilla(plantilla(cfg, 'equipo'), { ...varsEquipo(eq), nombre: primerNombre(c.nombre, '') }), cfg),
        tarjeta_url: await urlTarjeta(req, 'EQUIPO', fechaEq),
      });
      continue;
    }
    const fila = ultimos[claveRuta(c.ruta)];
    if (!fila) continue;
    const m = calcular(fila, await companerasDe(fila.fecha, cache));
    mensajes.push({
      ruta: c.ruta,
      tipo: 'vendedor',
      numero: destino(c),
      caption: conAviso(llenarPlantilla(plantilla(cfg, 'matutino'), varsVendedor(fila, m, c)), cfg),
      tarjeta_url: await urlTarjeta(req, fila.ruta, fila.fecha, fila.actualizado_en),
    });
  }
  return json({ fecha: hoy, total: mensajes.length, mensajes });
}

// ------------------------------------------------------------------ avance del día
// Lo dispara la app cada vez que Gerente / Supervisor cargan el Avance del día.
async function modoDia(req) {
  const hoy = fechaMX();
  const cfg = await configBot();
  if (cfg?.avanceDiaActivo === false) return json({ fecha: hoy, total: 0, mensajes: [], nota: 'avance del día desactivado' });
  const fecha = await fechaUltimoCorte({ hasta: hoy });
  if (!fecha) return json({ fecha: hoy, total: 0, mensajes: [] });
  const [lista, filas, todos] = await Promise.all([
    contactos({ campo: 'dia', cfg }), filasDeFecha(fecha), listaContactos(cfg),
  ]);
  const porRuta = Object.fromEntries(filas.map((f) => [claveRuta(f.ruta), f]));
  const mensajes = [];
  for (const c of lista) {
    if (c.tipo === 'grupo') {
      const g = calcularGrupo(filas, todos);
      if (!g.rutas.length) continue;
      mensajes.push({
        ruta: 'GRUPO', tipo: 'grupo', numero: destino(c),
        caption: llenarPlantilla(plantilla(cfg, 'grupo'), varsGrupo(g)),
        tarjeta_url: await urlTarjeta(req, 'GRUPO', fecha, g.actualizado),
      });
      continue;
    }
    if (c.tipo === 'equipo') {
      const eq = calcularEquipoDia(filas, todos);
      if (!eq.rutasDia.length) continue;
      mensajes.push({
        ruta: 'EQUIPO', tipo: 'equipo', numero: destino(c),
        caption: llenarPlantilla(plantilla(cfg, 'equipo_dia'), { ...varsEquipoDia(eq), nombre: primerNombre(c.nombre, '') }),
        tarjeta_url: await urlTarjeta(req, 'EQUIPO', fecha, eq.actualizado, 'dia'),
      });
      continue;
    }
    const fila = porRuta[claveRuta(c.ruta)];
    if (!fila) continue;
    const m = calcular(fila, filas);
    if (m.pctDia === null && !m.ventaDia) continue;
    mensajes.push({
      ruta: c.ruta, tipo: 'vendedor', numero: destino(c),
      caption: llenarPlantilla(plantilla(cfg, 'dia'), varsDia(fila, m, filas, c)),
      tarjeta_url: await urlTarjeta(req, fila.ruta, fecha, fila.actualizado_en, 'dia'),
    });
  }
  return json({ fecha, total: mensajes.length, mensajes });
}

// ------------------------------------------------------------------ alerta
async function modoAlerta() {
  const hoy = fechaMX();
  const cfg = await configBot();
  const umbral = Number(cfg?.umbralAlerta) > 0 ? Number(cfg.umbralAlerta) : 70;
  const [lista, filasHoy] = await Promise.all([contactos({ campo: 'alerta', cfg }), filasDeFecha(hoy)]);
  const porRuta = Object.fromEntries(filasHoy.map((f) => [claveRuta(f.ruta), f]));
  const mensajes = [];
  for (const c of lista) {
    if (c.tipo !== 'vendedor') continue;
    const fila = porRuta[claveRuta(c.ruta)];
    if (!fila) continue;
    const m = calcular(fila, filasHoy);
    const sv = sinVualaDe(fila);
    const vaAbajo = m.pctDia !== null && m.pctDia < umbral;
    const faltaSinVuala = sv && !sv.cumple;
    if (!vaAbajo && !faltaSinVuala) continue;
    const vars = varsDia(fila, m, filasHoy, c);
    // Si solo le falta el Sin Vuala (la venta va bien), mensaje corto de retro.
    const texto = vaAbajo
      ? llenarPlantilla(plantilla(cfg, 'alerta'), vars)
      : `⏰ *${vars.nombre}*, tu venta va bien (${vars.pct_dia || '—'}) 💪\n\n${vars.retro_sin_vuala}`;
    mensajes.push({ ruta: c.ruta, numero: destino(c), texto });
  }
  return json({ fecha: hoy, umbral, total: mensajes.length, mensajes });
}

// ------------------------------------------------------------------ bot
async function botEquipo(req, c, cmd, cfg, responder) {
  if (cmd === 'menu' || cmd === 'clientes' || cmd === 'marcas') return responder({ tipo: 'texto', texto: MENU_EQUIPO });
  const hoy = fechaMX();
  const fecha = await fechaUltimoCorte({ hasta: hoy });
  if (!fecha) return responder({ tipo: 'texto', texto: 'Todavía no hay datos cargados.' });
  const filas = await filasDeFecha(fecha);
  const eq = calcularEquipo(filas, await listaContactos(cfg));
  const v = varsEquipo(eq);
  const aviso = fecha === hoy ? '' : `\n\n_Los datos de hoy aún no se cargan; esto es del ${fechaCorta(fecha)}._`;

  if (cmd === 'avance') {
    return responder({
      tipo: 'imagen',
      caption: llenarPlantilla(plantilla(cfg, 'equipo'), { ...v, nombre: primerNombre(c.nombre, '') }),
      tarjeta_url: await urlTarjeta(req, 'EQUIPO', fecha),
    });
  }
  if (cmd === 'ranking') {
    return responder({ tipo: 'texto', texto: `🏁 *Ranking del mes* · corte del ${v.fecha}\n\n${v.ranking}${aviso}` });
  }
  // hoy
  const lineas = eq.rutas
    .filter((r) => r.m.pctDia !== null)
    .sort((a, b) => b.m.pctDia - a.m.pctDia)
    .map((r) => `${r.ruta}${r.nombre ? ` ${primerNombre(r.nombre, r.ruta)}` : ''}: ${cantidad(r.m.ventaDia, r.m.unidad)} de ${cantidad(r.m.objDia, r.m.unidad)} (${pct(r.m.pctDia)})`);
  return responder({
    tipo: 'texto',
    texto: `📦 *Avance del día* · ${v.fecha}\nEquipo: ${v.pct_dia_equipo || '—'}\n\n${lineas.join('\n') || 'Sin datos del día.'}${aviso}`,
  });
}

async function modoBot(req) {
  let body = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const numero = String(body.numero || '').replace(/\D/g, '');
  const responder = (extra) => json({ numero, ...extra });
  const cfg = await configBot();

  const c = await contactoPorTelefono(numero, cfg);
  if (!c) {
    return responder({
      tipo: 'texto',
      texto: 'Hola 👋 Este número no está registrado en SMART-TRACK. Pídele a tu supervisor que te dé de alta.',
    });
  }

  const cmd = comando(body.texto);
  // Cualquier cosa que no sea un comando corto → la contesta la IA con los números reales.
  if (cmd === 'nada') return responder({ tipo: 'texto', texto: await respuestaIA(c, body.texto, cfg) });
  if (c.tipo === 'equipo') return botEquipo(req, c, cmd, cfg, responder);
  if (cmd === 'menu') return responder({ tipo: 'texto', texto: MENU_VENDEDOR });

  const hoy = fechaMX();
  const ultimos = await ultimosPorRuta({ hasta: hoy });
  const fila = ultimos[claveRuta(c.ruta)];
  if (!fila) return responder({ tipo: 'texto', texto: 'Todavía no hay datos cargados para tu ruta. Intenta más tarde.' });

  const companeras = await filasDeFecha(fila.fecha);
  const m = calcular(fila, companeras);
  const v = varsVendedor(fila, m, c);
  const nombre = v.nombre;
  const aviso = fila.fecha === hoy ? '' : `\n\n_Los datos de hoy aún no se cargan; esto es del ${fechaCorta(fila.fecha)}._`;

  if (cmd === 'avance') {
    const texto = llenarPlantilla(plantilla(cfg, 'matutino'), v)
      .replace(/^☀️.*\n/, ''); // sin el "Buenos días" cuando lo piden a cualquier hora
    return responder({
      tipo: 'imagen',
      caption: texto,
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

  if (cmd === 'marcas') {
    return responder({
      tipo: 'texto',
      texto: v.marcas ? `🏷️ *${nombre}*, tus marcas OPEN:\n\n${v.marcas}${aviso}` : `No tengo datos de marcas todavía.${aviso}`,
    });
  }

  if (cmd === 'ranking') {
    if (!m.ranking) return responder({ tipo: 'texto', texto: `Aún no hay ranking disponible.${aviso}` });
    const top = m.rankingLista.slice(0, 3)
      .map((r, i) => `${medalla(i + 1)} ${claveRuta(r.ruta)} – ${pct(r.p * 100)}`).join('\n');
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

  return responder({ tipo: 'texto', texto: MENU_VENDEDOR });
}

// ------------------------------------------------------------------ IA (conversación libre)
const TONOS = {
  normal: 'Habla en español mexicano, amable y profesional. Nada de groserías.',
  compa: 'Habla como compa de ruta: informal, con carrilla y frases mexicanas (qué onda, échale ganas, ¿cómo ves?), pero SIN groserías.',
  picante: 'Habla como vendedor de ruta mexicano bien entrón: directo, con carrilla pesada, albures ligeros y groserías comunes (güey, cabrón, chingón, a huevo, no mames, ponte las pilas). Si el vendedor te insulta, regrésale la carrilla con humor y llévalo a sus números.',
};

async function contextoDatos(c) {
  const hoy = fechaMX();
  if (c.tipo === 'equipo') {
    const fecha = await fechaUltimoCorte({ hasta: hoy });
    if (!fecha) return { sin_datos: true };
    const filas = await filasDeFecha(fecha);
    const todos = await listaContactos(await configBot());
    const v = varsEquipo(calcularEquipo(filas, todos));
    const d = varsEquipoDia(calcularEquipoDia(filas, todos));
    return { rol: 'supervisor/gerente', corte: fecha, mes_equipo: v, dia_equipo: d };
  }
  const ultimos = await ultimosPorRuta({ hasta: hoy });
  const fila = ultimos[claveRuta(c.ruta)];
  if (!fila) return { sin_datos: true };
  const companeras = await filasDeFecha(fila.fecha);
  const m = calcular(fila, companeras);
  const v = varsDia(fila, m, companeras, c);
  return {
    rol: 'vendedor', ruta: v.ruta, corte: fila.fecha, datos_de_hoy: fila.fecha === hoy,
    mes: { avance: v.pct_mes, ritmo_esperado: v.esperado, vendido: v.venta_mes, objetivo: v.objetivo_mes, necesita_por_dia: v.necesita, dias_restantes: v.dias_restantes, lugar: v.lugar, de_rutas: v.total_rutas },
    dia: { avance: v.pct_dia, vendido: v.dia_vendido, meta: v.dia_objetivo, falta: v.falta_dia, efectividad: v.efectividad, visitas_efectivas: v.visitas, lugar_hoy: v.lugar_dia, otc_hoy: v.otc_dia, meta_otc: v.otc_objetivo },
    marcas_mes: v.marcas, marcas_hoy: v.marcas_dia,
  };
}

async function respuestaIA(c, texto, cfg) {
  const key = process.env.OPENAI_API_KEY;
  const fallback = 'No te entendí 🤔 Escríbeme *menu* para ver qué te puedo decir.';
  if (!key) return fallback;
  try {
    const datos = await contextoDatos(c);
    const tono = TONOS[cfg?.tonoBot] || TONOS.picante;
    const sistema = [
      'Eres el Bot de SMART-TRACK, el compa por WhatsApp de los vendedores de JMD, distribuidora de cigarros y bebidas en Puerto Vallarta.',
      tono,
      'Reglas: respuestas cortas (máximo 5 líneas), formato WhatsApp (*negritas*), un par de emojis máximo.',
      'Usa SOLO los números del JSON de datos; nunca inventes cifras, premios, promociones ni cambies objetivos. Las cantidades son paquetes salvo OTC que es dinero.',
      'Si preguntan algo que no está en los datos, dilo y sugiere los comandos: avance, hoy, marcas, ranking, clientes.',
      'Siempre empújalo a vender y dile qué le falta para su meta cuando venga al caso.',
      'Límites: la carrilla nunca es humillante ni sobre físico, familia, género, orientación, religión u origen; nada sexual explícito; nada de amenazas.',
      'Si menciona algo serio (accidente, asalto, choque, salud, problema personal o renuncia), deja la carrilla, contesta con respeto y pídele que avise a su supervisor de inmediato.',
      `Te habla: ${c.nombre || 'un vendedor'} (${c.tipo === 'equipo' ? 'supervisor/gerente' : 'ruta ' + claveRuta(c.ruta)}).`,
      `Datos (JSON): ${JSON.stringify(datos)}`,
    ].join('\n');
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL_BOT || 'gpt-4.1-mini',
        temperature: 0.8,
        max_tokens: 300,
        messages: [{ role: 'system', content: sistema }, { role: 'user', content: String(texto || '').slice(0, 800) }],
      }),
    });
    if (!r.ok) return fallback;
    const j = await r.json();
    return (j.choices?.[0]?.message?.content || '').trim() || fallback;
  } catch {
    return fallback;
  }
}

// ------------------------------------------------------------------ diagnóstico
async function modoDiag() {
  const hoy = fechaMX();
  const cfg = await configBot();
  const [lista, resumen, previos] = await Promise.all([
    listaContactos(cfg),
    sb('resumen_vendedores?select=ruta,fecha&order=fecha.desc&limit=30'),
    ultimosPorRuta({ antesDe: hoy }),
  ]);
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return json({
    version: 'diag-3',
    hoy,
    origen_contactos: Array.isArray(cfg?.contactos) ? 'SMART-TRACK (pestaña WhatsApp)' : 'tabla vendedores_whatsapp',
    plantillas_editadas: Object.keys(cfg?.plantillas || {}),
    supabase_url: (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/^https:\/\/([a-z0-9]{6}).*/, '$1…'),
    tipo_llave: llave.startsWith('sb_secret') ? 'sb_secret' : llave.startsWith('eyJ') ? 'jwt' : llave ? 'otra' : 'VACÍA',
    contactos: lista.map((c) => ({ ruta: c.ruta, clave: claveRuta(c.ruta), tipo: c.tipo, activo: c.activo, matutino: c.matutino, alerta: c.alerta, tel: '…' + c.telefono.slice(-4) })),
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
    if (modo === 'alerta') return await modoAlerta(req);
    if (modo === 'dia') return await modoDia(req);
    if (modo === 'diag') return await modoDiag();
    if (modo === 'bot' && req.method === 'POST') return await modoBot(req);
    return json({ error: 'modo inválido (matutino | dia | alerta | bot | diag)' }, 400);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
