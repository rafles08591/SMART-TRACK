// api/wa-resumen.js — arma los mensajes que n8n envía por Evolution API.
//
//   GET  /api/wa-resumen?modo=matutino   → tarjeta + texto para cada contacto (corte más reciente antes de hoy)
//                                          vendedores: su tarjeta · equipo (Supervisor/Gerente): tarjeta del equipo
//   GET  /api/wa-resumen?modo=dia        → tarjeta del AVANCE DEL DÍA (la dispara la app al cargar el avance)
//   GET  /api/wa-resumen?modo=alerta     → aviso de la tarde solo a vendedores que van abajo hoy
//   GET  /api/wa-resumen?modo=riesgo     → (prueba) texto de Rutas en riesgo para supervisores
//   POST /api/wa-resumen?modo=bot        → body { numero, texto, grupo? }  → respuesta del bot
//                                          (con grupo = …@g.us contesta en el grupo mencionando a quien preguntó)
//   GET  /api/wa-resumen?modo=retro_grupo → retro de cada hora al grupo (9 am – 8 pm), candidatos a la Tercera Mano
//   GET  /api/wa-resumen?modo=diag       → diagnóstico
//
// Todas requieren el header  x-bot-token: <BOT_TOKEN>
// Contactos y textos se editan en SMART-TRACK (pestaña WhatsApp) → data.whatsappBot

import {
  autorizado, firmar, fechaMX, fechaCorta, cantidad, pct, primerNombre, numeroEnvio,
  ultimosPorRuta, filasDeFecha, contactos, contactoPorTelefono, calcular, medalla, claveRuta, sb,
  configBot, listaContactos, PLANTILLAS_DEFAULT, llenarPlantilla, varsVendedor, calcularEquipo, varsEquipo,
  varsDia, calcularEquipoDia, varsEquipoDia, sinVualaDe, destino, calcularGrupo, varsGrupo, calcularGrupoDia, varsGrupoDia,
  calcularRiesgo, varsRiesgo, calcularRiesgoTarde, varsRiesgoTarde,
  elegirReto, avanceReto, textoRetoAnuncio, textoRetoTabla, textoRetoVendedor,
  rankingPaquetes, detectarRebases, textoRebase, leerEstado, guardarEstado,
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

// 🎯 Reto de una fecha: se elige con el corte anterior a esa fecha (siempre da lo mismo).
async function retoDe(fecha, cfg, cache) {
  if (!fecha || cfg?.retoActivo === false) return null;
  const base = await fechaUltimoCorte({ antesDe: fecha });
  if (!base) return null;
  return elegirReto(await companerasDe(base, cache), cfg, fecha);
}
const junta = (...partes) => partes.filter((x) => x && String(x).trim()).join('\n\n');

// ------------------------------------------------------------------ menús
const MENU_VENDEDOR = [
  '🤖 *ROBOTINA · SMART-TRACK*',
  'Escríbeme una palabra:',
  '',
  '• *avance* – tu tarjeta con los números',
  '• *hoy* – cómo vas en el día',
  '• *ranking* – tu lugar en el equipo',
  '• *clientes* – tus visitas',
  '• *marcas* – cómo vas en cada marca',
  '• *reto* – cómo vas en el reto del día',
].join('\n');

const MENU_EQUIPO = [
  '🤖 *ROBOTINA · Equipo*',
  'Escríbeme una palabra:',
  '',
  '• *avance* – tarjeta del equipo completo',
  '• *ranking* – las 7 rutas ordenadas',
  '• *hoy* – avance del día por ruta',
  '• *riesgo* – rutas en riesgo y qué hacer con cada una',
  '• *reto* – tabla del reto del día',
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
  if (/\b(actualiza|actualizar|actualizate|actualizalo|reinicia|reiniciar|reiniciate|refresca)\b/.test(t)) return 'actualizar';
  if (/\b(riesgo|alerta|alertas|focos|apoyo)\b/.test(t)) return 'riesgo';
  if (/\b(reto|retos|concurso|competencia)\b/.test(t)) return 'reto';
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
  // 🎯 Reto de hoy + ganador del reto de ayer
  let retoHoy = null, retoAyer = null;
  if (fechaEq && cfg?.retoActivo !== false) {
    const filasEq = await companerasDe(fechaEq, cache);
    retoHoy = elegirReto(filasEq, cfg, hoy);
    retoAyer = avanceReto(await retoDe(fechaEq, cfg, cache), filasEq, todos);
  }
  const anuncio = textoRetoAnuncio(retoHoy, retoAyer);

  for (const c of lista) {
    if (c.tipo === 'grupo') {
      if (!fechaEq) continue;
      const filas = await companerasDe(fechaEq, cache);
      if (!filas.length) continue;
      const g = calcularGrupo(filas, todos);
      mensajes.push({
        ruta: 'GRUPO', tipo: 'grupo', numero: destino(c),
        caption: conAviso(junta(llenarPlantilla(plantilla(cfg, 'grupo'), varsGrupo(g)), anuncio), cfg),
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
        caption: conAviso(junta(llenarPlantilla(plantilla(cfg, 'equipo'), { ...varsEquipo(eq), nombre: primerNombre(c.nombre, '') }), anuncio), cfg),
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
      caption: conAviso(junta(llenarPlantilla(plantilla(cfg, 'matutino'), varsVendedor(fila, m, c)), textoRetoVendedor(retoHoy, c.ruta, 'anuncio')), cfg),
      tarjeta_url: await urlTarjeta(req, fila.ruta, fila.fecha, fila.actualizado_en),
    });
  }
  // 🚨 Rutas en riesgo → solo texto, a Supervisor / Gerente
  if (cfg?.riesgoActivo !== false && fechaEq) {
    const sup = (await contactos({ campo: 'riesgo', cfg })).filter((c) => c.tipo === 'equipo');
    if (sup.length) {
      const filas = await companerasDe(fechaEq, cache);
      if (filas.length) {
        const rk = calcularRiesgo(filas, todos, umbralRiesgo(cfg));
        for (const c of sup) {
          mensajes.push({ ruta: 'RIESGO', tipo: 'riesgo', numero: destino(c), tarjeta_url: '', texto: textoRiesgo(cfg, rk, c) });
        }
      }
    }
  }
  return json({ fecha: hoy, total: mensajes.length, mensajes });
}

const umbralRiesgo = (cfg) => (Number(cfg?.umbralRiesgo) > 0 ? Math.min(100, Number(cfg.umbralRiesgo)) : 95);

function textoRiesgo(cfg, rk, c) {
  const v = { ...varsRiesgo(rk), nombre: primerNombre(c?.nombre, '') || 'Equipo' };
  if (!rk.enRiesgo.length) {
    const lineas = [`🚨 *RUTAS EN RIESGO* · corte ${v.fecha || ''}`, `Ninguna abajo del ${v.umbral}. Equipo cierra en *${v.proyeccion_equipo || '—'}*.`];
    if (v.rutas_cerca) lineas.push(`🟡 Buen avance, pero aún no llegan al 100%: ${v.rutas_cerca}`);
    if (v.rutas_ok) lineas.push(`✅ Cierran en meta (100% o más): ${v.rutas_ok}`);
    return lineas.join('\n');
  }
  return llenarPlantilla(plantilla(cfg, 'riesgo'), v);
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
  const av = avanceReto(await retoDe(fecha, cfg, { [fecha]: filas }), filas, todos);
  const tablaReto = textoRetoTabla(av);
  for (const c of lista) {
    if (c.tipo === 'grupo') {
      // Al cargar avance: SOLO indicadores del día, en paquetes / piezas / pesos (sin %)
      const g = calcularGrupoDia(filas, todos);
      if (!g.rutas.length) continue;
      mensajes.push({
        ruta: 'GRUPO', tipo: 'grupo', numero: destino(c),
        caption: junta(llenarPlantilla(plantilla(cfg, 'grupo_dia'), varsGrupoDia(g)), tablaReto),
        tarjeta_url: await urlTarjeta(req, 'GRUPO', fecha, g.actualizado, 'dia'),
      });
      continue;
    }
    if (c.tipo === 'equipo') {
      const eq = calcularEquipoDia(filas, todos);
      if (!eq.rutasDia.length) continue;
      mensajes.push({
        ruta: 'EQUIPO', tipo: 'equipo', numero: destino(c),
        caption: junta(llenarPlantilla(plantilla(cfg, 'equipo_dia'), { ...varsEquipoDia(eq), nombre: primerNombre(c.nombre, '') }), tablaReto),
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
      caption: junta(llenarPlantilla(plantilla(cfg, 'dia'), varsDia(fila, m, filas, c)), textoRetoVendedor(av, c.ruta)),
      tarjeta_url: await urlTarjeta(req, fila.ruta, fecha, fila.actualizado_en, 'dia'),
    });
  }

  // 🏁 Te rebasaron: se compara el ranking del día (paquetes) contra el avance anterior
  let rebases = [];
  if (cfg?.rebaseActivo !== false) {
    const ahora = rankingPaquetes(filas);
    const antes = await leerEstado('ranking_dia');
    if (antes?.fecha === fecha) rebases = detectarRebases(antes.lista, ahora);
    if (ahora.length) await guardarEstado('ranking_dia', { fecha, lista: ahora });
    const nombres = {};
    for (const c of todos) if (c.tipo === 'vendedor') nombres[claveRuta(c.ruta)] = c.nombre;
    const vend = (await contactos({ campo: 'rebase', cfg })).filter((c) => c.tipo === 'vendedor');
    for (const r of rebases) {
      for (const c of vend.filter((x) => claveRuta(x.ruta) === r.victima)) {
        mensajes.push({
          ruta: c.ruta, tipo: 'rebase', numero: destino(c), tarjeta_url: '',
          texto: textoRebase(r, primerNombre(c.nombre, r.victima), nombres, cfg?.tonoBot || 'picante'),
        });
      }
    }
  }
  return json({ fecha, total: mensajes.length, mensajes, rebases: rebases.length });
}

// ------------------------------------------------------------------ alerta
async function modoAlerta() {
  const hoy = fechaMX();
  const cfg = await configBot();
  const umbral = Number(cfg?.umbralAlerta) > 0 ? Number(cfg.umbralAlerta) : 70;
  const [lista, filasHoy, sup, todos] = await Promise.all([
    contactos({ campo: 'alerta', cfg }), filasDeFecha(hoy), contactos({ campo: 'riesgo', cfg }), listaContactos(cfg),
  ]);
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
  // 🚨 Supervisor / Gerente: rutas que necesitan apoyo HOY
  if (cfg?.riesgoActivo !== false && filasHoy.length) {
    const rt = calcularRiesgoTarde(filasHoy, todos, umbral, umbralRiesgo(cfg));
    if (rt.enRiesgo.length) {
      for (const c of sup.filter((x) => x.tipo === 'equipo')) {
        const texto = llenarPlantilla(plantilla(cfg, 'riesgo_tarde'), { ...varsRiesgoTarde(rt), nombre: primerNombre(c.nombre, '') || 'Equipo' });
        mensajes.push({ ruta: 'RIESGO', tipo: 'riesgo', numero: destino(c), texto });
      }
    }
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
  if (cmd === 'riesgo') {
    const rk = calcularRiesgo(filas, await listaContactos(cfg), umbralRiesgo(cfg));
    return responder({ tipo: 'texto', texto: textoRiesgo(cfg, rk, c) + aviso });
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

// ------------------------------------------------------------------ 🧠 memoria corta por persona
// Se guarda en wa_estado (clave chat_<10 dígitos>): las últimas 4 vueltas, y caduca a los 15 min.
const MEMORIA_MIN = 15, MEMORIA_VUELTAS = 4;
const claveChat = (numero) => `chat_${String(numero || '').replace(/\D/g, '').slice(-10)}`;

async function leerHistorial(numero) {
  if (String(numero || '').replace(/\D/g, '').length < 10) return [];
  const h = await leerEstado(claveChat(numero));
  if (!h?.t || Date.now() - h.t > MEMORIA_MIN * 60000) return [];
  return Array.isArray(h.msgs) ? h.msgs : [];
}

async function recordar(numero, historial, pregunta, respuesta) {
  if (String(numero || '').replace(/\D/g, '').length < 10 || !respuesta) return;
  const msgs = [
    ...historial,
    { role: 'user', content: String(pregunta).slice(0, 800) },
    { role: 'assistant', content: String(respuesta).slice(0, 1500) },
  ].slice(-MEMORIA_VUELTAS * 2);
  await guardarEstado(claveChat(numero), { t: Date.now(), msgs });
}

async function modoBot(req) {
  let body = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const numero = String(body.numero || '').replace(/\D/g, '');
  // Mensaje desde el GRUPO: se contesta en el grupo, mencionando a quien preguntó.
  const grupo = /@g\.us$/.test(String(body.grupo || '')) ? String(body.grupo) : null;
  const tag = grupo ? mencion(numero) : null;
  // 🧠 Memoria corta: lo que esta persona platicó con Robotina en los últimos 15 min
  const historial = await leerHistorial(numero);
  const responder = async (extra) => {
    if (extra.tipo !== 'ninguno' && body.texto) {
      await recordar(numero, historial, body.texto, extra.texto || extra.caption || '');
    }
    if (!grupo || extra.tipo === 'ninguno') {
      const { mencionados: _m, ...resto } = extra;
      // En privado no hay menciones: @521… se cambia por el nombre que viene entre paréntesis
      const limpiar = (t) => (typeof t === 'string' ? t.replace(/@521\d{10}\s*/g, '') : t);
      return json({ numero, ...resto, ...(resto.texto ? { texto: limpiar(resto.texto) } : {}) });
    }
    const pre = `@${tag} `;
    return json({
      ...extra,
      numero: grupo,
      mencionados: [...new Set([tag, ...(extra.mencionados || [])])],
      ...(extra.texto ? { texto: pre + extra.texto } : {}),
      ...(extra.caption ? { caption: pre + extra.caption } : {}),
    });
  };
  const cfg = await configBot();

  const c = await contactoPorTelefono(numero, cfg);
  // En el grupo, a quien no está dado de alta simplemente no se le contesta.
  if (!c && grupo) return responder({ tipo: 'ninguno' });
  if (!c) {
    return responder({
      tipo: 'texto',
      texto: 'Hola 👋 Este número no está registrado en SMART-TRACK. Pídele a tu supervisor que te dé de alta.',
    });
  }

  const cmd = comando(body.texto);
  // 🖐️ "¿Quiénes son candidatos a la Tercera Mano del Pachuco?"
  if (pideTerceraMano(body.texto)) {
    const r = await respuestaTerceraMano(c, cfg, { historial, pregunta: body.texto });
    return responder({ tipo: 'texto', texto: r.texto, mencionados: grupo ? r.mencionados : [] });
  }
  // 🔄 "Robotina actualiza": solo jefe / supervisores. n8n reinicia el robot de PowerStreet al ver tipo 'actualizar'.
  if (cmd === 'actualizar') {
    if (c.tipo !== 'equipo') {
      return responder({ tipo: 'texto', texto: '🔒 Solo el jefe o un supervisor me pueden pedir que actualice. Pídeselo a tu supervisor.' });
    }
    return responder({
      tipo: 'actualizar',
      texto: `A la orden, ${tratoDe(c)} 🫡\n\n🔄 Ya arranqué la actualización: entro a PowerStreet y cargo Avance y OTC en SMART-TRACK. En unos minutos llegan las tarjetas.`,
    });
  }
  // Cualquier cosa que no sea un comando corto → la contesta la IA con los números reales.
  if (cmd === 'nada') return responder({ tipo: 'texto', texto: await respuestaIA(c, body.texto, cfg, { historial, grupo }) });
  if (cmd === 'reto') {
    const hoy = fechaMX();
    const fecha = await fechaUltimoCorte({ hasta: hoy });
    const filas = fecha ? await filasDeFecha(fecha) : [];
    const reto = await retoDe(hoy, cfg, fecha ? { [fecha]: filas } : {});
    if (!reto) return responder({ tipo: 'texto', texto: 'Hoy no hay reto activo.' });
    const av = fecha === hoy ? avanceReto(reto, filas, await listaContactos(cfg)) : null;
    const texto = c.tipo === 'equipo'
      ? (av ? textoRetoTabla(av) : textoRetoAnuncio(reto))
      : (av ? textoRetoVendedor(av, c.ruta) : textoRetoVendedor(reto, c.ruta, 'anuncio')) || textoRetoAnuncio(reto);
    return responder({ tipo: 'texto', texto: c.tipo === 'equipo' ? `A la orden, ${tratoDe(c)} 🫡\n\n${texto}` : texto });
  }
  if (c.tipo === 'equipo') {
    // Respuestas fijas al jefe / supervisores: con "A la orden, jefe/supervisor" al inicio
    const saludo = `A la orden, ${tratoDe(c)} 🫡`;
    const alJefe = (extra) => responder({
      ...extra,
      ...(extra.texto ? { texto: `${saludo}\n\n${extra.texto}` } : {}),
      ...(extra.caption ? { caption: `${saludo}\n\n${extra.caption}` } : {}),
    });
    return botEquipo(req, c, cmd, cfg, alJefe);
  }
  if (cmd === 'riesgo') return responder({ tipo: 'texto', texto: await respuestaIA(c, body.texto, cfg) });
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

// Llamada a OpenAI con tiempo límite: si tarda más de 15 s se cancela y se usa el texto
// de respaldo, para que Vercel no corte la función (límite de ~25 s en Edge).
async function fetchIA(opciones, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch('https://api.openai.com/v1/chat/completions', { ...opciones, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ------------------------------------------------------------------ IA (conversación libre)
const TONOS = {
  normal: 'Habla en español mexicano, amable y profesional. Nada de groserías.',
  compa: 'Habla como compa de ruta: informal, con carrilla y frases mexicanas (qué onda, échale ganas, ¿cómo ves?), pero SIN groserías.',
  picante: 'Habla como vendedor de ruta mexicano bien entrón: directo, con carrilla pesada, albures ligeros y groserías comunes (güey, cabrón, chingón, a huevo, no mames, ponte las pilas). Si el vendedor te insulta, regrésale la carrilla con humor y llévalo a sus números.',
};

// Cómo se le dice a cada contacto de tipo Equipo (por los últimos 4 dígitos de su teléfono).
// Quien no esté en la lista y sea Equipo recibe "supervisor".
const TRATO_EQUIPO = { '1493': 'jefe', '8737': 'supervisor' };
const tratoDe = (c) => TRATO_EQUIPO[String(c?.telefono || '').slice(-4)] || 'supervisor';

const tonoEquipo = (titulo) => [
  `Le hablas a tu ${titulo.toUpperCase()}. Trátalo con mucho respeto y disposición, como un asistente leal.`,
  `Empieza SIEMPRE con "Sí, ${titulo}." o "A la orden, ${titulo}." y dile "${titulo}" (nunca por su nombre de pila ni "güey/compa").`,
  'CERO groserías, cero albures y cero carrilla hacia él. Español mexicano formal pero cálido.',
].join(' ');

async function contextoDatos(c) {
  const hoy = fechaMX();
  if (c.tipo === 'equipo') {
    const fecha = await fechaUltimoCorte({ hasta: hoy });
    if (!fecha) return { sin_datos: true };
    const filas = await filasDeFecha(fecha);
    const cfg = await configBot();
    const todos = await listaContactos(cfg);
    const v = varsEquipo(calcularEquipo(filas, todos));
    const d = varsEquipoDia(calcularEquipoDia(filas, todos));
    const rk = varsRiesgo(calcularRiesgo(filas, todos, 95));
    return { rol: 'supervisor/gerente', corte: fecha, mes_equipo: v, dia_equipo: d,
      rutas_en_riesgo: { proyeccion_equipo: rk.proyeccion_equipo, detalle: rk.rutas_riesgo, cierran_en_meta_100: rk.rutas_ok || 'ninguna', buen_avance_pero_sin_100: rk.rutas_cerca, nota: 'Solo 100% o más se considera bien; abajo de 100 es buen avance pero no cumple.' },
      indicadores_por_ruta: await indicadoresParaIA(fecha, cfg, { filas, todos, equipo: true }) };
  }
  const ultimos = await ultimosPorRuta({ hasta: hoy });
  const fila = ultimos[claveRuta(c.ruta)];
  if (!fila) return { sin_datos: true };
  const companeras = await filasDeFecha(fila.fecha);
  const m = calcular(fila, companeras);
  const v = varsDia(fila, m, companeras, c);
  const cfgV = await configBot();
  const inds = await indicadoresParaIA(fila.fecha, cfgV, { filas: companeras, todos: await listaContactos(cfgV), equipo: false });
  return {
    rol: 'vendedor', ruta: v.ruta, corte: fila.fecha, datos_de_hoy: fila.fecha === hoy,
    indicadores_hoy: inds[v.ruta] || {},
    mes: { avance: v.pct_mes, ritmo_esperado: v.esperado, vendido: v.venta_mes, objetivo: v.objetivo_mes, necesita_por_dia: v.necesita, dias_restantes: v.dias_restantes, lugar: v.lugar, de_rutas: v.total_rutas },
    dia: { avance: v.pct_dia, vendido: v.dia_vendido, meta: v.dia_objetivo, falta: v.falta_dia, efectividad: v.efectividad, visitas_efectivas: v.visitas, lugar_hoy: v.lugar_dia, otc_hoy: v.otc_dia, meta_otc: v.otc_objetivo },
    marcas_mes: v.marcas, marcas_hoy: v.marcas_dia,
  };
}

// ------------------------------------------------------------------ 🖐️ TERCERA MANO (bajo pedido)
// Se calcula con TODOS los indicadores que Robotina conoce (columna "Robotina lo conoce" del panel):
// del día contra su meta y los del periodo contra el ritmo esperado. Los 3 con el índice más bajo
// son los candidatos. A vendedores nunca se les muestran rallies exclusivos de Supervisor-1.
function pideTerceraMano(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /tercera\s*mano|pachuco|candidat/.test(t);
}

async function candidatosTercera(cfg, equipo) {
  const fecha = await fechaUltimoCorte({ hasta: fechaMX() });
  if (!fecha) return null;
  const t = await tablaIndicadores(fecha, cfg);
  const vend = {};
  for (const c of t.todos) if (c.tipo === 'vendedor' && c.activo) vend[claveRuta(c.ruta)] = c;
  const inds = t.inds.filter((i) => i.ia && (equipo || !i.exclusivo));
  const rutas = t.rutas.filter((x) => vend[x.ruta]).map(({ ruta, f, valores }) => {
    const c = vend[ruta];
    const lista = inds
      .map((i) => {
        const v = valores[i.clave];
        if (!v) return null;
        const comp = v.comp ?? v.pct;
        if (comp === null || comp === undefined) return null;
        return { indicador: i.nombre, unidad: i.unidad, avance: v.avance, meta: v.meta, falta: v.falta, pct: v.pct, ritmo: v.ritmo ?? null, necesita_por_dia: v.necesita_por_dia ?? null, comp };
      })
      .filter(Boolean);
    const indice = lista.length ? Math.round(lista.reduce((s, x) => s + Math.min(100, x.comp), 0) / lista.length) : null;
    return {
      ruta,
      nombre: primerNombre(c?.nombre || f.nombre || '', ruta),
      mencion: mencion(c?.telefono),
      indice,
      indicadores_medidos: lista.length,
      cumplidos: lista.filter((x) => x.comp >= 100).length,
      // Donde más le falta (lo que lo hace candidato)
      debajo: lista.filter((x) => x.comp < 100).sort((a, b) => a.comp - b.comp).slice(0, 6),
    };
  }).filter((r) => r.indice !== null).sort((a, b) => a.indice - b.indice);
  const candidatos = rutas.slice(0, 3);
  const corte = rutas[3] || null; // el 4° lugar desde abajo: a ese nivel hay que llegar para salir
  return {
    fecha,
    regla: 'índice = promedio del cumplimiento de cada indicador (tope 100%); del día contra su meta, del periodo contra el ritmo esperado',
    candidatos,
    para_salir_superar_a: corte ? { ruta: corte.ruta, nombre: corte.nombre, indice: corte.indice } : null,
    ranking_desde_abajo: rutas.map((r) => ({ ruta: r.ruta, nombre: r.nombre, indice: r.indice })),
  };
}

function textoTerceraFijo(d, saludo) {
  const fmtU2 = (v, u) => (u === '$' ? `$${Math.round(v || 0).toLocaleString('es-MX')}` : u === '%' ? `${v}%` : `${Math.round(v || 0)} ${u}`);
  const L = [saludo ? `${saludo}\n` : '', `🖐️ *Candidatos a La Tercera Mano del Pachuco* · corte ${fechaCorta(d.fecha)}`].filter(Boolean);
  d.candidatos.forEach((c, i) => {
    L.push('', `${i + 1}. @${c.mencion} (${c.ruta} ${c.nombre}) · rendimiento *${c.indice}%* · cumple ${c.cumplidos} de ${c.indicadores_medidos} indicadores`);
    for (const x of c.debajo.slice(0, 4)) {
      L.push(`   • ${x.indicador}: ${fmtU2(x.avance, x.unidad)} de ${fmtU2(x.meta, x.unidad)}${x.falta ? ` (le faltan ${fmtU2(x.falta, x.unidad)})` : ''}`);
    }
  });
  if (d.para_salir_superar_a) L.push('', `👉 Para salir tienen que subir de *${d.para_salir_superar_a.indice}%* (${d.para_salir_superar_a.ruta} ${d.para_salir_superar_a.nombre}), cerrando lo que les falta arriba.`);
  return L.join('\n');
}

async function respuestaTerceraMano(c, cfg, { historial = [], pregunta = '' } = {}) {
  const esJefe = c.tipo === 'equipo';
  const titulo = tratoDe(c);
  const d = await candidatosTercera(cfg, esJefe);
  if (!d || !d.candidatos.length) return { texto: 'Todavía no hay datos cargados para calcular candidatos.', mencionados: [] };
  const mencionados = d.candidatos.map((x) => x.mencion).filter(Boolean);
  const saludo = esJefe ? `A la orden, ${titulo} 🫡` : '';
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { texto: textoTerceraFijo(d, saludo), mencionados };
  const tono = esJefe ? tonoEquipo(titulo) : (TONOS[cfg?.tonoBot] || TONOS.picante);
  const sistema = [
    'Eres ROBOTINA, la bot de SMART-TRACK de JMD (cigarros y bebidas, Puerto Vallarta).',
    tono,
    'Te piden los candidatos a "La Tercera Mano del Pachuco": las 3 rutas con el rendimiento más bajo considerando TODOS los indicadores (ver "regla").',
    'Para CADA uno de los 3 candidatos, en este orden:',
    '  a) Encabezado: su mención exacta (@ + campo "mencion"), ruta, nombre y su rendimiento (índice %).',
    '  b) POR QUÉ es candidato: sus 2 a 4 indicadores más débiles de "debajo", con números exactos (avance de meta, lo que falta, unidad). En los del periodo usa "ritmo" y "necesita_por_dia".',
    '  c) CÓMO DEJAR DE SERLO: acciones concretas y medibles (cuánto vender de qué, cubrir Sin Vuala, qué marca empujar) para superar el índice de "para_salir_superar_a".',
    'Formato WhatsApp, *negritas*, sin tablas, máximo 22 líneas en total. Al final una línea corta que motive.',
    'Usa SOLO los números del JSON; no inventes cifras ni premios. paq = paquetes, pz = piezas, $ = pesos. No felicites a nadie.',
    'Límites: nada humillante ni sobre físico, familia, género, orientación, religión u origen.',
    `Datos (JSON): ${JSON.stringify(d)}`,
  ].join('\n');
  try {
    const r = await fetchIA({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL_BOT || 'gpt-4.1-mini',
        temperature: 0.6,
        max_tokens: 900,
        messages: [{ role: 'system', content: sistema }, ...historial, { role: 'user', content: String(pregunta || 'Dame los candidatos a la Tercera Mano').slice(0, 500) }],
      }),
    });
    if (!r.ok) throw new Error('openai');
    const j = await r.json();
    const texto = (j.choices?.[0]?.message?.content || '').trim();
    if (!texto) throw new Error('vacío');
    return { texto, mencionados: mencionados.filter((m) => texto.includes(`@${m}`)) };
  } catch {
    return { texto: textoTerceraFijo(d, saludo), mencionados };
  }
}

async function respuestaIA(c, texto, cfg, { historial = [], grupo = null } = {}) {
  const key = process.env.OPENAI_API_KEY;
  const fallback = 'No te entendí 🤔 Escríbeme *menu* para ver qué te puedo decir.';
  if (!key) return fallback;
  try {
    const [datos, retroPrev] = await Promise.all([contextoDatos(c), grupo ? leerEstado('retro_grupo') : null]);
    const ultimaRetro = retroPrev?.texto && retroPrev?.fecha === fechaMX() ? String(retroPrev.texto) : '';
    const esJefe = c.tipo === 'equipo';
    const titulo = tratoDe(c);
    // Al jefe y a los supervisores se les habla con respeto, sin groserías ni carrilla.
    const tono = esJefe ? tonoEquipo(titulo) : (TONOS[cfg?.tonoBot] || TONOS.picante);
    const sistema = [
      'Eres ROBOTINA, la bot de SMART-TRACK (así te dicen los vendedores), la compa por WhatsApp de los vendedores de JMD, distribuidora de cigarros y bebidas en Puerto Vallarta.',
      tono,
      'Reglas: respuestas cortas (máximo 5 líneas), formato WhatsApp (*negritas*), un par de emojis máximo.',
      'Usa SOLO los números del JSON de datos; nunca inventes cifras, premios, promociones ni cambies objetivos. Las cantidades son paquetes salvo OTC que es dinero.',
      'En los indicadores del periodo (MAX/OPEN/CHAMPIONS y marcas), "ritmo" es el % contra lo que ya debería llevar a la fecha (100 = en ritmo) y "necesita_por_dia" lo que le toca vender diario para llegar.',
      'Si preguntan algo que no está en los datos, dilo y sugiere los comandos: avance, hoy, marcas, ranking, clientes.',
      esJefe
        ? `Te habla tu ${titulo}: dale la información clara y directa, como un reporte para tu superior. Puedes señalar quién va abajo y quién va arriba con sus números.`
        : 'Siempre empújalo a vender y dile qué le falta para su meta cuando venga al caso.',
      'Límites: la carrilla nunca es humillante ni sobre físico, familia, género, orientación, religión u origen; nada sexual explícito; nada de amenazas.',
      'Si menciona algo serio (accidente, asalto, choque, salud, problema personal o renuncia), deja la carrilla, contesta con respeto y pídele que avise a su supervisor de inmediato.',
      `Te habla: ${c.nombre || 'un vendedor'} (${esJefe ? `tu ${titulo}` : 'ruta ' + claveRuta(c.ruta)}).`,
      'Conversación: los mensajes previos (si hay) son de los últimos 15 minutos con esta misma persona. Úsalos para entender respuestas cortas como "sí", "dale", "¿y la J206?" o "¿por qué?". Si contesta que sí a algo que ofreciste, cúmplelo de inmediato con los datos.',
      'Al final puedes ofrecer UNA sola opción de seguimiento, solo si suma información nueva que no diste (p. ej. detalle por ruta, qué clientes le faltan, qué marca empujar). Nunca ofrezcas repetir lo que ya dijiste ni preguntes por preguntar; si ya diste todo lo útil, no ofrezcas nada.',
      ...(grupo && ultimaRetro ? [`Tu último mensaje de retro en el GRUPO fue: «${ultimaRetro.slice(0, 1500)}». Si te contestan sobre eso, usa ese contexto.`] : []),
      `Datos (JSON): ${JSON.stringify(datos)}`,
    ].join('\n');
    const r = await fetchIA({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL_BOT || 'gpt-4.1-mini',
        temperature: 0.8,
        max_tokens: 300,
        messages: [{ role: 'system', content: sistema }, ...historial, { role: 'user', content: String(texto || '').slice(0, 800) }],
      }),
    });
    if (!r.ok) return fallback;
    const j = await r.json();
    return (j.choices?.[0]?.message?.content || '').trim() || fallback;
  } catch {
    return fallback;
  }
}

// ------------------------------------------------------------------ 🔥 RETRO AL GRUPO (cada hora, 9 am – 8 pm)
//   GET /api/wa-resumen?modo=retro_grupo            → solo manda si hay avance nuevo desde la última retro
//   GET /api/wa-resumen?modo=retro_grupo&forzar=1   → manda aunque no haya avance nuevo (pruebas)
// Señala a los más bajos en venta del día, Sin Vuala y reto del día como candidatos a
// "La Tercera Mano del Pachuco", y a los que siguen en 0 desde que salieron del CLO.
const GRUPO_RETRO = process.env.WA_GRUPO_RETRO || '5213221821493-1614005509@g.us';
const RETRO_DESDE = 9, RETRO_HASTA = 20;          // 9 am a 8 pm (hora de México)
const MIN_EN_CERO = Number(process.env.RETRO_MIN_EN_CERO || 45); // minutos desde la salida del CLO

const n = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const mencion = (tel) => (tel ? `521${String(tel).replace(/\D/g, '').slice(-10)}` : null);

function horaActualMX() {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
  const g = (t) => Number(p.find((x) => x.type === t)?.value || 0);
  return { h: g('hour') % 24, min: g('minute') };
}

// ⏱️ Hora de salida del CLO por ruta → { J201: 1760710000000, ... }
// Sale del panel de Tiempos (su propio Supabase): tabla panel_kv, key "board-activo",
// value = { fecha: 'YYYY-MM-DD', rutas: { J201: { areas: { salida_ruta: { ts } } } } }.
// Si no hay dato, a los que van en 0 se les señala solo a partir de las 11 am.
const TIEMPOS_URL = (process.env.TIEMPOS_SUPABASE_URL || 'https://nzbsmkscvzttekkwgkqz.supabase.co').replace(/\/+$/, '');
const TIEMPOS_KEY = process.env.TIEMPOS_SUPABASE_KEY || 'sb_publishable_Px5yEBkZfC8-zty4LPYnNg_INLvGZXU';

async function salidasCLO(fecha) {
  try {
    const r = await fetch(`${TIEMPOS_URL}/rest/v1/panel_kv?key=eq.board-activo&select=value`, {
      headers: { apikey: TIEMPOS_KEY },
    });
    if (!r.ok) return {};
    const board = (await r.json())[0]?.value;
    if (!board || board.fecha !== fecha) return {};
    const out = {};
    for (const [ruta, datos] of Object.entries(board.rutas || {})) {
      const ts = datos?.areas?.salida_ruta?.ts;
      if (ts) out[claveRuta(ruta)] = ts;
    }
    return out;
  } catch {
    return {};
  }
}

// ------------------------------------------------------------------ 📊 INDICADORES DE ROBOTINA
// Se prenden / apagan desde SMART-TRACK (pestaña WhatsApp → data.whatsappBot.indicadores):
//   { venta_dia: { retro, ia, tercera }, sin_vuala: {...}, 'rally_<id>': {...}, ... }
//   retro   → aparece en la retro de cada hora al grupo
//   ia      → Robotina lo conoce cuando le preguntan
//   tercera → cuenta para elegir a los candidatos a La Tercera Mano del Pachuco
// Lo que no esté configurado usa los valores por defecto de abajo.
const INDICADORES_BASE = {
  venta_dia:   { nombre: 'Venta del día',          unidad: 'paq', def: { retro: true,  ia: true, tercera: true } },
  sin_vuala:   { nombre: 'OTC Sin Vuala',          unidad: 'pz',  def: { retro: true,  ia: true, tercera: true } },
  reto:        { nombre: 'Reto del día',           unidad: 'paq', def: { retro: true,  ia: true, tercera: true } },
  otc_dia:     { nombre: 'OTC del día',            unidad: '$',   def: { retro: false, ia: true, tercera: false } },
  otc_semana:  { nombre: 'OTC semanal',            unidad: '$',   def: { retro: false, ia: true, tercera: false } },
  efectividad: { nombre: 'Efectividad de visitas', unidad: '%',   def: { retro: false, ia: true, tercera: false } },
  // Del periodo (mes): se comparan contra el ritmo esperado a la fecha, no contra la meta completa
  mes_max:       { nombre: 'MAX del periodo',       unidad: 'paq', def: { retro: false, ia: true, tercera: false } },
  mes_open:      { nombre: 'OPEN del periodo',      unidad: 'paq', def: { retro: false, ia: true, tercera: false } },
  mes_champions: { nombre: 'CHAMPIONS del periodo', unidad: 'paq', def: { retro: false, ia: true, tercera: false } },
};
// Por marca (se arman solas con las marcas que trae el snapshot):
//   open_<clave>  → marca OPEN del periodo    champ_<clave> → marca CHAMPIONS del periodo
//   dia_<clave>   → marca del avance del día
const DEF_MARCA = { retro: false, ia: true, tercera: false };
const nomChamp = (t) => String(t || '').replace(/^CHAM[_ ]/i, '').replace(/^CH /, '');
const DEF_RALLY = { retro: true, ia: true, tercera: true };

// Rallies OTC activos que vienen en el snapshot (extra.rallies), sin repetir.
function ralliesDe(filas) {
  const vistos = {};
  for (const f of filas) {
    for (const r of (Array.isArray(f.extra?.rallies) ? f.extra.rallies : [])) {
      if (r?.id && !vistos[r.id]) vistos[r.id] = r;
    }
  }
  return Object.values(vistos);
}

// Lista de indicadores con su configuración final.
function indicadoresConfig(cfg, filas) {
  const conf = cfg?.indicadores || {};
  const lista = Object.entries(INDICADORES_BASE).map(([clave, b]) => ({
    clave, nombre: b.nombre, unidad: b.unidad, exclusivo: false, ...b.def, ...(conf[clave] || {}),
  }));
  // Marcas: OPEN, CHAMPIONS y del día
  const marcas = { open: {}, champ: {}, dia: {} };
  for (const f of filas) {
    for (const x of (f.extra?.marcas || [])) if (x?.clave) marcas.open[x.clave] = x.nombre || x.clave;
    for (const x of (f.extra?.marcas_champions || [])) if (x?.clave) marcas.champ[x.clave] = x.nombre || x.clave;
    for (const x of (f.extra?.marcas_dia || [])) if (x?.clave) marcas.dia[x.clave] = x.nombre || x.clave;
  }
  const prefijo = { open: 'OPEN · ', champ: 'CHAMPIONS · ', dia: 'Hoy · ' };
  for (const tipo of ['open', 'champ', 'dia']) {
    for (const [k, nom] of Object.entries(marcas[tipo])) {
      const clave = `${tipo}_${k}`;
      lista.push({ clave, nombre: prefijo[tipo] + (tipo === 'champ' ? nomChamp(nom) : nom), unidad: 'paq', exclusivo: false, ...DEF_MARCA, ...(conf[clave] || {}) });
    }
  }
  for (const r of ralliesDe(filas)) {
    const clave = `rally_${r.id}`;
    lista.push({
      clave, nombre: `Rally ${r.nombre || 'OTC'}`, unidad: r.unidad === 'piezas' ? 'pz' : '$', exclusivo: !!r.exclusivo,
      ...DEF_RALLY, ...(conf[clave] || {}),
    });
  }
  return lista;
}

const r0 = (v) => (v === null || v === undefined ? null : Math.round(v)); // enteros, igual que la tabla de la app
const medida = (avance, meta, extra = {}) => {
  const a = n(avance), o = n(meta);
  if (a === null && !o) return null;
  return { avance: r0(a || 0), meta: o ? r0(o) : null, falta: o ? r0(Math.max(0, o - (a || 0))) : null, pct: o ? Math.round(((a || 0) / o) * 100) : null, ...extra };
};

// Indicador del periodo: además del % de la meta trae "ritmo" (% contra lo esperado a la fecha).
// "comp" es el número con el que se compara entre rutas (ritmo en el periodo, % en el día).
const medidaPeriodo = (avance, meta, porDia, esperado) => {
  const x = medida(avance, meta);
  if (!x || x.pct === null) return x;
  const ritmo = esperado ? Math.round((x.pct / esperado) * 100) : null;
  return { ...x, ritmo, comp: ritmo ?? x.pct, necesita_por_dia: n(porDia) === null ? null : r0(n(porDia)) };
};

// Valor de cada indicador para una ruta.
function valorIndicador(clave, f, m, rt) {
  const ex = f.extra || {};
  const t = ex.tabs || {};
  if (clave === 'mes_max') return medidaPeriodo(t.max?.avance ?? f.venta_mes, t.max?.objetivo ?? f.objetivo_mes, t.max?.por_dia ?? ex.necesita_diario, m.esperado);
  if (clave === 'mes_open') return medidaPeriodo(t.open?.avance, t.open?.objetivo, t.open?.por_dia, m.esperado);
  if (clave === 'mes_champions') return medidaPeriodo(t.champions?.avance, t.champions?.objetivo, t.champions?.por_dia, m.esperado);
  if (clave.startsWith('open_')) {
    const x = (ex.marcas || []).find((y) => `open_${y.clave}` === clave);
    return x ? medidaPeriodo(x.vendido, x.objetivo, x.por_dia, m.esperado) : null;
  }
  if (clave.startsWith('champ_')) {
    const x = (ex.marcas_champions || []).find((y) => `champ_${y.clave}` === clave);
    return x ? medidaPeriodo(x.vendido, x.objetivo, null, m.esperado) : null;
  }
  if (clave.startsWith('dia_')) {
    const x = (ex.marcas_dia || []).find((y) => `dia_${y.clave}` === clave);
    return x ? medida(x.vendido, x.objetivo) : null;
  }
  if (clave === 'venta_dia') return medida(m.ventaDia, m.objDia);
  if (clave === 'sin_vuala') { const sv = sinVualaDe(f); return sv ? medida(sv.piezas, sv.minimo) : null; }
  if (clave === 'reto') return rt ? medida(rt.v, rt.meta, { lugar: rt.lugar }) : null;
  if (clave === 'otc_dia') return medida(ex.otc_dia, ex.otc_dia_objetivo);
  if (clave === 'otc_semana') return medida(ex.otc_semana?.vendido, ex.otc_semana?.objetivo);
  if (clave === 'efectividad') return m.efectividad === null ? null : { avance: Math.round(m.efectividad), meta: 100, falta: null, pct: Math.round(m.efectividad) };
  if (clave.startsWith('rally_')) {
    const r = (ex.rallies || []).find((x) => `rally_${x.id}` === clave);
    if (!r) return null; // la ruta no participa
    const dia = medida(r.avanceDia, r.objetivoDia);
    const total = medida(r.avanceTotal, r.objetivoFinal);
    // Para comparar se usa el objetivo del día; si el rally no tiene, el total.
    const base = dia?.meta ? dia : total;
    return base ? { ...base, dia, total, cubierto_total: !!(total?.meta && total.avance >= total.meta) } : null;
  }
  return null;
}

// Indicadores por ruta para una fecha (lo usan la retro y la IA).
async function tablaIndicadores(fecha, cfg, { filas = null, todos = null } = {}) {
  filas = filas || await filasDeFecha(fecha);
  todos = todos || await listaContactos(cfg);
  const av = avanceReto(await retoDe(fecha, cfg, { [fecha]: filas }), filas, todos);
  const retoPorRuta = Object.fromEntries((av?.tabla || []).map((r, i) => [r.ruta, { ...r, lugar: i + 1 }]));
  const inds = indicadoresConfig(cfg, filas);
  const rutas = filas.map((f) => {
    const ruta = claveRuta(f.ruta);
    const m = calcular(f, filas);
    const valores = {};
    for (const i of inds) {
      const v = valorIndicador(i.clave, f, m, retoPorRuta[ruta]);
      if (v) valores[i.clave] = v;
    }
    return { ruta, f, m, valores };
  });
  return { filas, todos, av, inds, rutas };
}

// Indicadores que Robotina conoce para contestar ({ J201: { 'Venta del día': {...}, ... } }).
// A vendedores nunca se les dan los rallies exclusivos de Supervisor-1.
async function indicadoresParaIA(fecha, cfg, { filas, todos, equipo }) {
  try {
    const t = await tablaIndicadores(fecha, cfg, { filas, todos });
    const usar = t.inds.filter((i) => i.ia && (equipo || !i.exclusivo));
    const out = {};
    for (const r of t.rutas) {
      const x = {};
      for (const i of usar) {
        if (r.valores[i.clave]) x[i.nombre + (i.exclusivo ? ' (exclusivo Supervisor-1)' : '')] = { ...r.valores[i.clave], unidad: i.unidad };
      }
      out[r.ruta] = x;
    }
    return out;
  } catch {
    return {};
  }
}

async function datosRetro(fecha, cfg) {
  const t = await tablaIndicadores(fecha, cfg);
  const vend = {};
  for (const c of t.todos) if (c.tipo === 'vendedor' && c.activo) vend[claveRuta(c.ruta)] = c;
  const salidas = await salidasCLO(fecha);
  const ahora = Date.now();
  // En el grupo nunca se exponen los rallies exclusivos de Supervisor-1
  const enRetro = t.inds.filter((i) => i.retro && !i.exclusivo);
  const enTercera = t.inds.filter((i) => i.tercera && !i.exclusivo);

  const rutas = t.rutas.filter((x) => vend[x.ruta]).map(({ ruta, f, m, valores }) => {
    const c = vend[ruta];
    const salida = salidas[ruta] ? new Date(salidas[ruta]) : null;
    const minSalida = salida && !Number.isNaN(salida.getTime()) ? Math.round((ahora - salida.getTime()) / 60000) : null;
    const cmp = (v) => (v ? (v.comp ?? v.pct) : null);
    const partes = enTercera.map((i) => cmp(valores[i.clave])).filter((p) => p !== null && p !== undefined).map((p) => Math.min(100, p));
    const indicadores = {};
    for (const i of enRetro) if (valores[i.clave]) indicadores[i.nombre] = { ...valores[i.clave], unidad: i.unidad };
    return {
      ruta,
      nombre: primerNombre(c?.nombre || f.nombre || '', ruta),
      mencion: mencion(c?.telefono),
      venta_dia: Math.round(n(m.ventaDia) || 0),
      pct_dia: m.pctDia === null ? null : Math.round(m.pctDia),
      indicadores,
      salida_clo: salida ? horaMXCorta(salida) : null,
      min_desde_salida: minSalida,
      indice: partes.length ? Math.round(partes.reduce((s, x) => s + x, 0) / partes.length) : null,
    };
  });

  const { h } = horaActualMX();
  const conDia = rutas.filter((r) => r.pct_dia !== null).sort((a, b) => a.pct_dia - b.pct_dia);
  // En cero: ya salió del CLO hace ≥ 45 min y no ha vendido; sin dato de salida, solo desde las 11 am.
  const enCero = rutas.filter((r) => r.venta_dia === 0 && (
    r.min_desde_salida !== null ? r.min_desde_salida >= MIN_EN_CERO : (r.salida_clo === null && h >= 11)
  ));
  // Los 3 más bajos de cada indicador de la retro (solo los que no lo han cumplido)
  const abajo_por_indicador = {};
  for (const i of enRetro) {
    const cv = (r) => { const v = r.indicadores[i.nombre]; return v ? (v.comp ?? v.pct) : null; };
    const lista = rutas
      .filter((r) => cv(r) !== null && cv(r) !== undefined && cv(r) < 100)
      .sort((a, b) => cv(a) - cv(b))
      .slice(0, 3)
      .map((r) => ({ ruta: r.ruta, nombre: r.nombre, mencion: r.mencion, ...r.indicadores[i.nombre] }));
    if (lista.length) abajo_por_indicador[i.nombre] = lista;
  }
  const quita = ({ min_desde_salida, ...r }) => r;
  // Agrega si ya cubrió su meta del día y cuánto le falta
  const conMeta = (r) => {
    const v = r?.indicadores?.['Venta del día'];
    const falta = v?.falta ?? null;
    return { ...r, cumple_meta_dia: r.pct_dia !== null && r.pct_dia >= 100, falta_meta_dia: falta };
  };
  return {
    fecha,
    hora: `${h}:00`,
    indicadores_activos: enRetro.map((i) => `${i.nombre} (${i.unidad})`),
    reto: t.av ? { marca: t.av.nombre, equipo: t.av.total, meta_equipo: t.av.metaTotal } : null,
    // Líder = quien más paquetes lleva hoy (como la tabla "POR RUTA · VENDIDO HOY" de la app)
    lider_dia: rutas.length ? conMeta(quita([...rutas].sort((a, b) => b.venta_dia - a.venta_dia)[0])) : null,
    // Quien va más alto contra SU meta del día (puede ser otra ruta)
    mejor_pct_dia: conDia.length ? conMeta(quita(conDia[conDia.length - 1])) : null,
    // Los únicos a los que se puede felicitar: ya cubrieron su meta de venta del día
    cumplieron_meta_dia: rutas.filter((r) => r.pct_dia !== null && r.pct_dia >= 100).map((r) => ({ ruta: r.ruta, nombre: r.nombre, mencion: r.mencion, venta_dia: r.venta_dia, pct_dia: r.pct_dia })),
    tercera_mano: rutas.filter((r) => r.indice !== null).sort((a, b) => a.indice - b.indice).slice(0, 3).map(quita),
    abajo_por_indicador,
    en_cero: enCero.map(quita),
    rutas,
  };
}

function horaMXCorta(d) {
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', hour: 'numeric', minute: '2-digit', hour12: true })
    .format(d).replace(/\s?a\.?\s?m\.?/i, ' am').replace(/\s?p\.?\s?m\.?/i, ' pm');
}

const fmtU = (v, u) => (v === null || v === undefined ? '—' : u === '$' ? `$${Math.round(v).toLocaleString('es-MX')}` : u === '%' ? `${v}%` : `${r0(v)} ${u}`);

// Texto sin IA (respaldo si OpenAI falla)
function textoRetroFijo(d) {
  const tag = (r) => (r.mencion ? `@${r.mencion}` : `${r.ruta} ${r.nombre}`);
  const L = [`🔥 *RETRO ${d.hora}* · ¿Quién se lleva La Tercera Mano del Pachuco? 🖐️`];
  if (d.lider_dia) {
    const l = d.lider_dia;
    L.push(l.cumple_meta_dia
      ? `🏆 ${l.ruta} ${l.nombre} va al frente con ${Math.round(l.venta_dia)} paq y ya cubrió su meta del día. ¡Felicidades!`
      : `🥇 ${l.ruta} ${l.nombre} va al frente con ${Math.round(l.venta_dia)} paq, pero todavía le faltan ${l.falta_meta_dia ?? '—'} paq para su meta.`);
  }
  if (d.mejor_pct_dia && d.mejor_pct_dia.ruta !== d.lider_dia?.ruta) L.push(`🎯 Más cerca de su meta: ${d.mejor_pct_dia.ruta} ${d.mejor_pct_dia.nombre} (${d.mejor_pct_dia.pct_dia}%)${d.mejor_pct_dia.cumple_meta_dia ? ' ✅' : `, le faltan ${d.mejor_pct_dia.falta_meta_dia ?? '—'} paq`}.`);
  if (d.en_cero.length) {
    L.push('', '🥶 *Siguen en CERO:*');
    for (const r of d.en_cero) L.push(`• ${tag(r)}${r.salida_clo ? ` salió del CLO a las ${r.salida_clo}` : ''} y no ha vendido nada. ¡Primer cliente YA!`);
  }
  if (d.tercera_mano.length) {
    L.push('', '🖐️ *Candidatos a la Tercera Mano:*');
    for (const r of d.tercera_mano) {
      const det = Object.entries(r.indicadores)
        .filter(([, v]) => (v.comp ?? v.pct) !== null && (v.comp ?? v.pct) < 100)
        .map(([nom, v]) => `${nom} ${fmtU(v.avance, v.unidad)}/${fmtU(v.meta, v.unidad)}`)
        .join(' · ');
      L.push(`• ${tag(r)}${det ? ` – ${det}` : ''}`);
    }
  }
  return L.join('\n');
}

async function textoRetroIA(d, cfg) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const tono = TONOS[cfg?.tonoBot] || TONOS.picante;
  const sistema = [
    'Eres ROBOTINA, la bot de SMART-TRACK, y escribes en el GRUPO de WhatsApp de los vendedores de ruta de JMD (cigarros y bebidas, Puerto Vallarta).',
    tono,
    'Cada hora das retro del AVANCE DEL DÍA. La "Tercera Mano del Pachuco" es el castigo/burla para los 3 más bajos del día; los de "tercera_mano" son los candidatos.',
    `Indicadores que se siguen hoy: ${d.indicadores_activos.join(', ') || 'venta del día'}. Solo habla de esos.`,
    'Estructura (formato WhatsApp, *negritas*, máximo 16 líneas):',
    '1) Una línea de arranque con la hora y quién va al frente: "lider_dia" (más paquetes hoy, di sus paquetes) y, si es otra ruta, "mejor_pct_dia" (la más cerca de su meta, con su %).',
    'REGLA DE RECONOCIMIENTO: solo puedes FELICITAR (felicidades, bien hecho, aplauso, chingón, crack, etc.) a quien aparece en "cumplieron_meta_dia", porque ya cubrió su meta. A quien va al frente pero NO ha cubierto su meta ("cumple_meta_dia": false) solo reconoce que va adelante y recuérdale cuánto le falta ("falta_meta_dia"): acercarse no es suficiente. Nunca digas "ritmo" para el % del día; es el % de su meta de hoy.',
    '2) Si hay "en_cero": señálalos primero, di a qué hora salieron del CLO si viene el dato, y exígeles su primera venta ya.',
    '3) Los candidatos a la Tercera Mano: a cada uno dile en una línea qué le falta en cada indicador donde va abajo (usa el nombre del indicador y los números exactos con su unidad) y un consejo concreto y corto.',
    '4) Si hay un Rally activo, una línea con quién va más abajo en el rally (de "abajo_por_indicador").',
    '5) Cierra con una frase corta que prenda al equipo.',
    'Para mencionar a alguien escribe EXACTAMENTE su campo "mencion" precedido de @ (ej. @5213221234567). Si no tiene mencion, usa ruta y nombre.',
    'Usa SOLO los números del JSON; nunca inventes cifras, premios ni castigos distintos. Unidades: paq = paquetes, pz = piezas, $ = pesos.',
    'Indicadores del periodo (MAX/OPEN/CHAMPIONS y sus marcas): "ritmo" es el % contra lo que ya debería llevar a la fecha (100 = va en ritmo) y "necesita_por_dia" lo que debe vender diario para llegar; úsalos en vez del % de la meta completa.',
    'Límites: la carrilla es sobre los números y el trabajo, nunca sobre físico, familia, género, orientación, religión u origen; nada sexual; nada de amenazas.',
    `Datos (JSON): ${JSON.stringify({ ...d, rutas: undefined })}`,
  ].join('\n');
  try {
    const r = await fetchIA({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL_BOT || 'gpt-4.1-mini',
        temperature: 0.9,
        max_tokens: 700,
        messages: [{ role: 'system', content: sistema }, { role: 'user', content: 'Escribe la retro de esta hora para el grupo.' }],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.choices?.[0]?.message?.content || '').trim() || null;
  } catch {
    return null;
  }
}

async function modoRetroGrupo(req) {
  const url = new URL(req.url);
  const forzar = url.searchParams.get('forzar') === '1';
  const cfg = await configBot();
  if (cfg?.retroGrupoActivo === false) return json({ total: 0, mensajes: [], nota: 'retro del grupo desactivada' });
  const { h } = horaActualMX();
  if (!forzar && (h < RETRO_DESDE || h > RETRO_HASTA)) return json({ total: 0, mensajes: [], nota: `fuera de horario (${h} h)` });

  const hoy = fechaMX();
  const filasHoy = await filasDeFecha(hoy);
  if (!filasHoy.length) return json({ total: 0, mensajes: [], nota: 'sin avance de hoy todavía' });

  // Solo una retro por cada avance nuevo
  const ultimo = filasHoy.map((f) => f.actualizado_en).filter(Boolean).sort().pop() || '';
  const previo = await leerEstado('retro_grupo');
  if (!forzar && previo?.fecha === hoy && previo?.actualizado === ultimo) {
    return json({ total: 0, mensajes: [], nota: 'sin avance nuevo desde la última retro' });
  }

  const d = await datosRetro(hoy, cfg);
  if (!d.rutas.length) return json({ total: 0, mensajes: [], nota: 'sin rutas con vendedor activo' });
  const texto = (await textoRetroIA(d, cfg)) || textoRetroFijo(d);
  // Solo se mencionan los números que de verdad aparecen en el texto
  const mencionados = [...new Set(d.rutas.map((r) => r.mencion).filter((m) => m && texto.includes(`@${m}`)))];

  await guardarEstado('retro_grupo', { fecha: hoy, actualizado: ultimo, texto });
  return json({ fecha: hoy, total: 1, mensajes: [{ numero: GRUPO_RETRO, texto, mencionados }] });
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
    if (modo === 'riesgo') {
      const cfg = await configBot();
      const fecha = await fechaUltimoCorte({ hasta: fechaMX() });
      if (!fecha) return json({ texto: 'sin datos' });
      const rk = calcularRiesgo(await filasDeFecha(fecha), await listaContactos(cfg), umbralRiesgo(cfg));
      return json({ fecha, texto: textoRiesgo(cfg, rk, { nombre: 'Prueba' }), rutas: rk.rutas.map((r) => ({ ruta: r.ruta, proy: Math.round(r.pctProy ?? -1), nivel: r.nivel })) });
    }
    if (modo === 'bot' && req.method === 'POST') return await modoBot(req);
    if (modo === 'retro_grupo') return await modoRetroGrupo(req);
    return json({ error: 'modo inválido (matutino | dia | alerta | bot | retro_grupo | diag)' }, 400);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
