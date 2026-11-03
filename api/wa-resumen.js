// api/wa-resumen.js — arma los mensajes que n8n envía por Evolution API.
//
//   GET  /api/wa-resumen?modo=matutino   → tarjeta + texto para cada contacto
//   GET  /api/wa-resumen?modo=dia        → tarjeta del AVANCE DEL DÍA
//   GET  /api/wa-resumen?modo=alerta     → aviso de la tarde
//   GET  /api/wa-resumen?modo=riesgo     → texto de Rutas en riesgo
//   POST /api/wa-resumen?modo=bot        → body { numero, texto, grupo? }
//   GET  /api/wa-resumen?modo=retro_grupo → retro de cada hora
//   GET  /api/wa-resumen?modo=diag       → diagnóstico
//
// Todas requieren el header x-bot-token: <BOT_TOKEN>

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

async function fechaUltimoCorte({ antesDe = null, hasta = null } = {}) {
  let q = 'resumen_vendedores?select=fecha&order=fecha.desc&limit=1';
  if (antesDe) q += `&fecha=lt.${antesDe}`;
  if (hasta) q += `&fecha=lte.${hasta}`;
  const r = await sb(q);
  return r[0]?.fecha || null;
}

async function retoDe(fecha, cfg, cache) {
  if (!fecha || cfg?.retoActivo === false) return null;
  const base = await fechaUltimoCorte({ antesDe: fecha });
  if (!base) return null;
  return elegirReto(await companerasDe(base, cache), cfg, fecha);
}
const junta = (...partes) => partes.filter((x) => x && String(x).trim()).join('\n\n');

function mencion(numero) {
  const n = String(numero || '').replace(/\D/g, '');
  return n ? n : null;
}

async function respuestaIA(c, texto, cfg, { historial = [], grupo = false } = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { texto: "No tengo conexión con la IA en este momento.", mencionados: [] };
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL_BOT || "gpt-4.1-mini",
        temperature: 0.7,
        max_tokens: 600,
        messages: [
          { role: "system", content: "Eres Robotina, el bot de SMART-TRACK. Responde en español mexicano, breve y útil." },
          ...historial,
          { role: "user", content: texto },
        ],
      }),
    });
    if (!r.ok) return { texto: "No pude consultar la IA. Intenta de nuevo.", mencionados: [] };
    const j = await r.json();
    const resp = (j.choices?.[0]?.message?.content || "").trim();
    return { texto: resp || "No entendí la pregunta.", mencionados: [] };
  } catch {
    return { texto: "Error al consultar la IA.", mencionados: [] };
  }
}

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

function pideOTC(texto) {
  const t = normalizar(texto);
  return /\botc\b/.test(t);
}

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

async function textoOTCDesglose(fecha, todos, soloRuta = null) {
  try {
    const RUTAS_LOCALES = new Set(['J201', 'J202', 'J203', 'J204', 'J205', 'J206', 'J207']);
    const r = await sb('ventas_app_state?id=eq.main&select=otc:data->otcDia');
    const otc = (r[0]?.otc || []).filter(x => x.fecha === fecha);
    if (!otc.length) return '';

    const porVend = {};
    for (const x of otc) {
      const ruta = claveRuta(x.vendedor);
      if (!RUTAS_LOCALES.has(ruta)) continue;
      if (soloRuta && ruta !== claveRuta(soloRuta)) continue;
      if (!porVend[ruta]) porVend[ruta] = { piezas: 0, pesos: 0, arts: {} };
      const art = x.articulo || 'Sin nombre';
      porVend[ruta].piezas += Number(x.unidadesVendidas) || 0;
      porVend[ruta].pesos += Number(x.monto) || 0;
      if (!porVend[ruta].arts[art]) porVend[ruta].arts[art] = { pz: 0, pesos: 0 };
      porVend[ruta].arts[art].pz += Number(x.unidadesVendidas) || 0;
      porVend[ruta].arts[art].pesos += Number(x.monto) || 0;
    }

    const nombres = {};
    for (const c of todos) if (c.tipo === 'vendedor') nombres[claveRuta(c.ruta)] = primerNombre(c.nombre, c.ruta);

    const lineas = [];
    let totalPz = 0, totalPesos = 0;

    const rutas = Object.keys(porVend).sort();
    for (const ruta of rutas) {
      const v = porVend[ruta];
      totalPz += v.piezas;
      totalPesos += v.pesos;
      const nom = nombres[ruta] || ruta;
      lineas.push(`\n${ruta} ${nom} · $${Math.round(v.pesos).toLocaleString('es-MX')} · ${Math.round(v.piezas)} pz`);
      const arts = Object.entries(v.arts).sort((a, b) => b[1].pz - a[1].pz);
      for (const [art, d] of arts) {
        lineas.push(`• ${art}: ${Math.round(d.pz)} pz · $${Math.round(d.pesos).toLocaleString('es-MX')}`);
      }
    }

    if (!lineas.length) return '';

    const encabezado = soloRuta
      ? `📦 *Tu OTC del día*\nTotal: $${Math.round(totalPesos).toLocaleString('es-MX')} · ${Math.round(totalPz)} pz`
      : `📦 *OTC del día*\nTotal equipo: $${Math.round(totalPesos).toLocaleString('es-MX')} · ${Math.round(totalPz)} pz`;

    return encabezado + '\n' + lineas.join('\n');
  } catch {
    return '';
  }
}

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
      const g = calcularGrupoDia(filas, todos);
      if (!g.rutas.length) continue;
      mensajes.push({
        ruta: 'GRUPO', tipo: 'grupo', numero: destino(c),
        caption: junta(
          llenarPlantilla(plantilla(cfg, 'grupo_dia'), varsGrupoDia(g)),
          tablaReto,
          await textoOTCDesglose(fecha, todos)
        ),
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
      caption: junta(
        llenarPlantilla(plantilla(cfg, 'dia'), varsDia(fila, m, filas, c)),
        textoRetoVendedor(av, c.ruta),
        await textoOTCDesglose(fecha, todos, c.ruta)
      ),
      tarjeta_url: await urlTarjeta(req, fila.ruta, fecha, fila.actualizado_en, 'dia'),
    });
  }

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
    const texto = vaAbajo
      ? llenarPlantilla(plantilla(cfg, 'alerta'), vars)
      : `⏰ *${vars.nombre}*, tu venta va bien (${vars.pct_dia || '—'}) 💪\n\n${vars.retro_sin_vuala}`;
    mensajes.push({ ruta: c.ruta, numero: destino(c), texto });
  }
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
  const lineas = eq.rutas
    .filter((r) => r.m.pctDia !== null)
    .sort((a, b) => b.m.pctDia - a.m.pctDia)
    .map((r) => `${r.ruta}${r.nombre ? ` ${primerNombre(r.nombre, r.ruta)}` : ''}: ${cantidad(r.m.ventaDia, r.m.unidad)} de ${cantidad(r.m.objDia, r.m.unidad)} (${pct(r.m.pctDia)})`);
  return responder({
    tipo: 'texto',
    texto: `📦 *Avance del día* · ${v.fecha}\nEquipo: ${v.pct_dia_equipo || '—'}\n\n${lineas.join('\n') || 'Sin datos del día.'}${aviso}`,
  });
}

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
  const grupo = /@g\.us$/.test(String(body.grupo || '')) ? String(body.grupo) : null;
  const tag = grupo ? mencion(numero) : null;
  const historial = await leerHistorial(numero);
  let avisoFresco = '';
  const responder = async (extra0) => {
    let extra = extra0;
    if (avisoFresco && extra.tipo !== 'ninguno') {
      extra = {
        ...extra,
        ...(extra.texto ? { texto: `${avisoFresco}\n\n${extra.texto}` } : {}),
        ...(extra.caption ? { caption: `${avisoFresco}\n\n${extra.caption}` } : {}),
      };
    }
    if (extra.tipo !== 'ninguno' && body.texto) {
      await recordar(numero, historial, body.texto, extra.texto || extra.caption || '');
    }
    if (!grupo || extra.tipo === 'ninguno') {
      const { mencionados: _m, ...resto } = extra;
      const limpiar = (t) => (typeof t === 'string' ? t.replace(/@521\d{10}\s*/g, '') : t);
      return json({ 
        numero, 
        ...resto, 
        ...(resto.texto ? { texto: limpiar(resto.texto) } : {}),
      });
    }
    const pre = `@${tag} `;
    const mencionados = [...new Set([tag, ...(extra.mencionados || [])].filter(Boolean))];
    return json({
      ...extra,
      numero: grupo,
      ...(mencionados.length ? { mencionados } : {}),
      ...(extra.texto ? { texto: pre + extra.texto } : {}),
      ...(extra.caption ? { caption: pre + extra.caption } : {}),
    });
  };
  const cfg = await configBot();

  const c = await contactoPorTelefono(numero, cfg);
  if (!c && grupo) return responder({ tipo: 'ninguno' });
  if (!c) {
    return responder({
      tipo: 'texto',
      texto: 'Hola 👋 Este número no está registrado en SMART-TRACK. Pídele a tu supervisor que te dé de alta.',
    });
  }

  const cmd = comando(body.texto);
  const textoOriginal = body.texto || '';

  if (pideOTC(textoOriginal)) {
    const hoy = fechaMX();
    const fecha = await fechaUltimoCorte({ hasta: hoy });
    if (!fecha) return responder({ tipo: 'texto', texto: 'Todavía no hay datos de OTC cargados.' });
    const todos = await listaContactos(cfg);
    const soloRuta = c.tipo === 'vendedor' ? c.ruta : null;
    const textoOTC = await textoOTCDesglose(fecha, todos, soloRuta);
    return responder({
      tipo: 'texto',
      texto: textoOTC || 'No hay OTC registrado hoy para las rutas locales.',
    });
  }

  if (c.tipo === 'equipo' && cmd !== 'actualizar' && cmd !== 'menu') {
    if (body.fresco) {
      const hora = new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' });
      avisoFresco = body.sin_refresco
        ? `⚠️ ${tratoDe(c)}, no pude actualizar PowerStreet; te paso lo último que tengo cargado:`
        : `🔄 Listo, ${tratoDe(c)}: información actualizada a las ${hora}.`;
    } else if (pideAvance(body.texto, cmd)) {
      const [ult, snap] = await Promise.all([
        leerEstado('refresco_hecho'),
        sb('resumen_vendedores?select=actualizado_en&order=actualizado_en.desc.nullslast&limit=1').catch(() => []),
      ]);
      const tSnap = snap?.[0]?.actualizado_en ? Date.parse(snap[0].actualizado_en) : 0;
      const tUlt = Math.max(ult?.t || 0, tSnap || 0);
      const reciente = tUlt && Date.now() - tUlt < MIN_FRESCO * 60000;
      if (!reciente) {
        return responder({
          tipo: 'refrescar',
          texto: `Ok, ${tratoDe(c)} 🫡 déjame actualizar y en cuanto tenga la información fresca te la paso.`,
          refrescar: { numero, texto: body.texto, grupo: grupo || null },
        });
      }
    }
  }

  if (pideTerceraMano(body.texto)) {
    const r = await respuestaTerceraMano(c, cfg, { historial, pregunta: body.texto });
    return responder({ tipo: 'texto', texto: r.texto, mencionados: grupo ? r.mencionados : [] });
  }
  if (cmd === 'actualizar') {
    if (c.tipo !== 'equipo') {
      return responder({ tipo: 'texto', texto: '🔒 Solo el jefe o un supervisor me pueden pedir que actualice. Pídeselo a tu supervisor.' });
    }
    return responder({
      tipo: 'actualizar',
      texto: `A la orden, ${tratoDe(c)} 🫡\n\n🔄 Ya arranqué la actualización: entro a PowerStreet y cargo Avance y OTC en SMART-TRACK. En unos minutos llegan las tarjetas.`,
    });
  }
  if (cmd === 'nada') {
    const r = await respuestaIA(c, body.texto, cfg, { historial, grupo });
    return responder({ tipo: 'texto', texto: r.texto, mencionados: r.mencionados });
  }
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
    const saludo = `A la orden, ${tratoDe(c)} 🫡`;
    const alJefe = (extra) => responder({
      ...extra,
      ...(extra.texto ? { texto: `${saludo}\n\n${extra.texto}` } : {}),
      ...(extra.caption ? { caption: `${saludo}\n\n${extra.caption}` } : {}),
    });
    return botEquipo(req, c, cmd, cfg, alJefe);
  }
  if (cmd === 'riesgo') {
    const r = await respuestaIA(c, body.texto, cfg);
    return responder({ tipo: 'texto', texto: r.texto, mencionados: r.mencionados });
  }
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
      .replace(/^☀️.*\n/, '');
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

async function fetchIA(opciones, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch('https://api.openai.com/v1/chat/completions', { ...opciones, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

const TONOS = {
  normal: 'Habla en español mexicano, amable y profesional. Nada de groserías.',
  compa: 'Habla como compa de ruta: informal, con carrilla y frases mexicanas (qué onda, échale ganas, ¿cómo ves?), pero SIN groserías.',
  picante: 'Habla como vendedor de ruta mexicano bien entrón: directo, con carrilla pesada, albures ligeros y groserías comunes (güey, cabrón, chingón, a huevo, no mames, ponte las pilas). Si el vendedor te insulta, regrésale la carrilla con humor y llévalo a sus números.',
};

const TRATO_EQUIPO = { '1493': 'jefe', '8737': 'supervisor' };
const tratoDe = (c) => TRATO_EQUIPO[String(c?.telefono || '').slice(-4)] || 'supervisor';

const MIN_FRESCO = Number(process.env.REFRESCO_MIN || 10);
function pideAvance(texto, cmd) {
  if (['avance', 'hoy', 'marcas', 'ranking', 'reto', 'clientes', 'riesgo'].includes(cmd)) return true;
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /\b(avance|avances|como va|como vamos|como van|como voy|cuanto|cuantos|llevan?|llevamos|venta|ventas|vendid\w*|otc|rally|reto|vuala|marcas?|indicador\w*|ranking|proyecc\w*|meta|metas|objetivo\w*|resultado\w*|numeros|tercera\s*mano|pachuco|candidat\w*|quien va|quienes van|abajo|arriba|lider)\b/.test(t);
}

function pideTerceraMano(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /tercera\s*mano|pachuco|candidat/.test(t);
}

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
    if (modo === 'refresco_hecho') { await guardarEstado('refresco_hecho', { t: Date.now() }); return json({ ok: true }); }
    if (modo === 'retro_grupo') return await modoRetroGrupo(req);
    return json({ error: 'modo inválido (matutino | dia | alerta | bot | retro_grupo | diag)' }, 400);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
