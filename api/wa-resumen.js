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

const mencion = (tel) => (tel ? `521${String(tel).replace(/\D/g, '').slice(-10)}` : null);

async function respuestaIA(c, texto, cfg, { historial = [], grupo = null } = {}) {
  const key = process.env.OPENAI_API_KEY;
  const fallback = { texto: 'No te entendí 🤔 Escríbeme *menu* para ver qué te puedo decir.', mencionados: [] };
  if (!key) return fallback;
  try {
    const [datos, retroPrev, todos, porProducto] = await Promise.all([
      contextoDatos(c), grupo ? leerEstado('retro_grupo') : null, listaContactos(cfg), ventasPorProducto(texto, cfg),
    ]);
    if (porProducto) datos.venta_por_producto = porProducto;
    {
      const fv = await fechaUltimoCorte({ hasta: fechaMX() });
      if (fv) {
        const vu = await vualaPorRuta(fv, todos);
        datos.vuala_hoy = c.tipo === 'vendedor' ? (vu[claveRuta(c.ruta)] || { piezas: 0, pesos: 0 }) : vu;
        datos.vuala_nota = 'Vuala = artículos marcados como Vuala en el catálogo (vainilla, chocolate, switch…). Rutas que no aparecen en vuala_hoy NO han vendido Vuala hoy.';
      }
    }
    // En la retro guardada las menciones son @número: se cambian por @ruta para que la IA no copie números
    const rutaDeMencion = {};
    for (const x of todos) if (x.tipo === 'vendedor' && x.telefono) rutaDeMencion[mencion(x.telefono)] = claveRuta(x.ruta);
    const ultimaRetro = retroPrev?.texto && retroPrev?.fecha === fechaMX()
      ? String(retroPrev.texto).replace(/@(\d{10,13})/g, (m, d) => (rutaDeMencion[d] ? `@${rutaDeMencion[d]}` : ''))
      : '';
    const vendedores = {};
    for (const x of todos) if (x.tipo === 'vendedor' && x.activo !== false) vendedores[claveRuta(x.ruta)] = primerNombre(x.nombre || '', claveRuta(x.ruta));
    const esJefe = c.tipo === 'equipo';
    const titulo = tratoDe(c);
    // Al jefe y a los supervisores se les habla con respeto, sin groserías ni carrilla.
    const tono = esJefe ? tonoEquipo(titulo) : (TONOS[cfg?.tonoBot] || TONOS.picante);
    const sistema = [
      'Eres ROBOTINA, la bot de SMART-TRACK (así te dicen los vendedores), la compa por WhatsApp de los vendedores de JMD, distribuidora de cigarros y bebidas en Puerto Vallarta.',
      tono,
      porProducto?.tipo_consulta
        ? 'Reglas: formato WhatsApp (*negritas*), una sección corta por ruta (máximo 25 líneas en total), un par de emojis máximo.'
        : 'Reglas: respuestas cortas (máximo 5 líneas), formato WhatsApp (*negritas*), un par de emojis máximo.',
      'No termines preguntando si quieren más detalle ni ofreciendo otra cosa ("¿Quiere detalle por ruta?", "¿Le paso otro dato?"): da la información y cierra.',
      'Usa SOLO los números del JSON de datos; nunca inventes cifras, premios, promociones ni cambies objetivos. Las cantidades son paquetes salvo OTC que es dinero.',
      'En los indicadores del periodo (MAX/OPEN/CHAMPIONS y marcas), "ritmo" es el % contra lo que ya debería llevar a la fecha (100 = en ritmo) y "necesita_por_dia" lo que le toca vender diario para llegar.',
      'Si preguntan algo que no está en los datos, dilo y sugiere los comandos: avance, hoy, marcas, ranking, clientes.',
      'RALLY OTC: usa SOLO "rallies_otc". Cada rally trae su "ranking" ya ordenado (lugar 1 = el que va MEJOR; el último lugar = el más abajo), con "hoy"/"meta_hoy"/"pct_hoy" (lo de hoy) y "acumulado"/"meta_final"/"pct_final" (todo el rally). No mezcles lo de hoy con el acumulado: dilo siempre con su etiqueta ("hoy" o "acumulado"). Unidad: piezas = pz, pesos = $. Si preguntan por el avance del rally da: total del equipo, los de arriba y los de abajo con sus números. Si no hay rallies en los datos, di que no hay rally activo con datos cargados.',
      'TOTALES: nunca sumes ni restes tú. Para totales usa los ya calculados ("totales_del_dia" por ruta, o los indicadores del día como "OTC del día" y "Venta del día"). Los "top" son solo los artículos principales, NO el total de la ruta.',
      'DETALLE POR PRODUCTO: si "venta_por_producto" trae "tipo_consulta": "detalle general por producto", da lo más vendido del equipo y por ruta sus artículos principales (cantidad con su unidad y pesos). Sí tienes ese detalle: nunca digas que no lo tienes. Si es mucho, resume y ofrece el detalle de una ruta.',
      'PRODUCTOS: si preguntan por la venta de un producto o artículo en específico (ej. Switch, un sabor, una presentación), contesta SOLO con "venta_por_producto": es la venta real por artículo. Si "encontrado" es false o el producto no aparece ahí, di claramente que hoy no hay venta registrada de ese producto (y la fecha del detalle). NUNCA uses las marcas, metas o porcentajes de otros indicadores para responder sobre un producto, y nunca inventes ventas.',
      'MENCIONES: para nombrar a un vendedor escribe @ + su ruta y luego su nombre, ej. "@J203 Ana" (el sistema lo convierte en mención). Usa la ruta correcta de la lista "vendedores". NUNCA escribas números de teléfono.',
      esJefe
        ? `Te habla tu ${titulo}: dale la información clara y directa, como un reporte para tu superior. Puedes señalar quién va abajo y quién va arriba con sus números.`
        : 'Siempre empújalo a vender y dile qué le falta para su meta cuando venga al caso.',
      'Límites: la carrilla nunca es humillante ni sobre físico, familia, género, orientación, religión u origen; nada sexual explícito; nada de amenazas.',
      'Si menciona algo serio (accidente, asalto, choque, salud, problema personal o renuncia), deja la carrilla, contesta con respeto y pídele que avise a su supervisor de inmediato.',
      `Te habla: ${c.nombre || 'un vendedor'} (${esJefe ? `tu ${titulo}` : 'ruta ' + claveRuta(c.ruta)}).`,
      'Conversación: los mensajes previos (si hay) son de los últimos 15 minutos con esta misma persona. Úsalos para entender respuestas cortas como "sí", "dale", "¿y la J206?" o "¿por qué?". Si contesta que sí a algo que ofreciste, cúmplelo de inmediato con los datos.',
      'Al final puedes ofrecer UNA sola opción de seguimiento, solo si suma información nueva que no diste (p. ej. detalle por ruta, qué clientes le faltan, qué marca empujar). Nunca ofrezcas repetir lo que ya dijiste ni preguntes por preguntar; si ya diste todo lo útil, no ofrezcas nada.',
      ...(grupo && ultimaRetro ? [`Tu último mensaje de retro en el GRUPO fue: «${ultimaRetro.slice(0, 1500)}». Si te contestan sobre eso, usa ese contexto.`] : []),
      `Vendedores (ruta: nombre): ${JSON.stringify(vendedores)}`,
      `Datos (JSON): ${JSON.stringify(datos)}`,
    ].join('\n');
    const r = await fetchIA({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL_BOT || 'gpt-4.1-mini',
        temperature: 0.8,
        max_tokens: porProducto?.tipo_consulta ? 900 : 300,
        messages: [{ role: 'system', content: sistema }, ...historial, { role: 'user', content: String(texto || '').slice(0, 800) }],
      }),
    });
    if (!r.ok) return fallback;
    const j = await r.json();
    const salida = (j.choices?.[0]?.message?.content || '').trim();
    return salida ? aplicarMenciones(salida, todos) : fallback;
  } catch {
    return fallback;
  }
}

// ------------------------------------------------------------------ 🔥 RETRO AL GRUPO (cada hora, 9 am – 8 pm)
//   GET /api/wa-resumen?modo=retro_grupo            → solo manda si hay avance nuevo desde la última retro
//   GET /api/wa-resumen?modo=retro_grupo&forzar=1   → manda aunque no haya avance nuevo (pruebas)
// Señala a los más bajos en venta del día, Sin Vuala y reto del día como candidatos a
// "La Tercera Mano del Pachuco", y a los que siguen en 0 desde que salieron del CLO.

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
      lineas.push(`\n📦 *${ruta} ${nom}*`);
      lineas.push(`$${Math.round(v.pesos).toLocaleString('es-MX')} · ${Math.round(v.piezas)} pz`);
      const arts = Object.entries(v.arts).sort((a, b) => b[1].pz - a[1].pz);
      for (const [art, d] of arts) {
        lineas.push(`• ${art}: ${Math.round(d.pz)} pz · $${Math.round(d.pesos).toLocaleString('es-MX')}`);
      }
    }

    if (!lineas.length) return '';

    const encabezado = soloRuta
      ? `📦 *Tu OTC del día*\nTotal: $${Math.round(totalPesos).toLocaleString('es-MX')} · ${Math.round(totalPz)} pz`
      : `📦 *OTC del día · Equipo*\nTotal: $${Math.round(totalPesos).toLocaleString('es-MX')} · ${Math.round(totalPz)} pz`;

    return encabezado + '\n' + lineas.join('\n');
  } catch {
    return '';
  }
}

// ------------------------------------------------------------------ 🥤 VUALA
// Qué cuenta como Vuala lo marca el Gerente en OTC → Catálogo (data.otcVuala). Si nunca se ha guardado:
const VUALA_DEFAULT = [
  { codigo: '0309', articulo: 'VLACHOCO_26' }, { codigo: '0310', articulo: 'VLAVAINILLA_26' },
  { codigo: '0316', articulo: 'SWICHC/10_26' }, { codigo: '0401', articulo: 'VLA VAINILLA SELE' },
];
// → { J201: { piezas, pesos, articulos: { nombre: piezas } }, ... } solo rutas del equipo
async function vualaPorRuta(fecha, todos) {
  try {
    const r = await sb('ventas_app_state?id=eq.main&select=otc:data->otcDia,cat:data->otcVuala');
    const cat = Array.isArray(r[0]?.cat) ? r[0].cat : VUALA_DEFAULT;
    const codigos = new Set(cat.map((x) => String(x.codigo || '').trim()).filter(Boolean));
    const nombres = new Set(cat.map((x) => String(x.articulo || '').trim().toUpperCase()).filter(Boolean));
    const mias = new Set((todos || []).filter((c) => c.tipo === 'vendedor').map((c) => claveRuta(c.ruta)));
    const out = {};
    for (const x of (r[0]?.otc || [])) {
      if (x.fecha !== fecha) continue;
      const ruta = claveRuta(x.vendedor);
      if (mias.size && !mias.has(ruta)) continue;
      const es = codigos.has(String(x.codigoArticulo || '').trim()) || nombres.has(String(x.articulo || '').trim().toUpperCase());
      if (!es) continue;
      const v = out[ruta] || (out[ruta] = { piezas: 0, pesos: 0, articulos: {} });
      const pz = Number(x.unidadesVendidas) || 0;
      v.piezas += pz; v.pesos += Number(x.monto) || 0;
      v.articulos[x.articulo || x.codigoArticulo] = (v.articulos[x.articulo || x.codigoArticulo] || 0) + pz;
    }
    for (const v of Object.values(out)) { v.piezas = Math.round(v.piezas); v.pesos = Math.round(v.pesos); }
    return out;
  } catch { return {}; }
}
function textoVualaRuta(v) {
  if (!v || !v.piezas) return '🥤 *Vuala hoy:* ❌ todavía no vendes Vuala';
  const arts = Object.entries(v.articulos).sort((a, b) => b[1] - a[1]).map(([a, pz]) => `${a} ${pz}`).join(' · ');
  return `🥤 *Vuala hoy:* ✅ ${v.piezas} pz · $${v.pesos.toLocaleString('es-MX')}\n${arts}`;
}
function textoVualaEquipo(vu, todos) {
  const rutas = (todos || []).filter((c) => c.tipo === 'vendedor' && c.activo !== false)
    .map((c) => ({ ruta: claveRuta(c.ruta), nombre: primerNombre(c.nombre, claveRuta(c.ruta)) }))
    .filter((x, i, a) => a.findIndex((y) => y.ruta === x.ruta) === i).sort((a, b) => a.ruta.localeCompare(b.ruta));
  if (!rutas.length) return '';
  const si = rutas.filter((r) => vu[r.ruta]?.piezas);
  const L = [`🥤 *¿Vendieron Vuala hoy?* ${si.length}/${rutas.length} rutas`];
  for (const r of rutas) {
    const v = vu[r.ruta];
    L.push(v?.piezas ? `✅ ${r.ruta} ${r.nombre}: ${v.piezas} pz · $${v.pesos.toLocaleString('es-MX')}` : `❌ ${r.ruta} ${r.nombre}`);
  }
  return L.join('\n');
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
  const vuala = await vualaPorRuta(fecha, todos);
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
          textoVualaEquipo(vuala, todos),
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
        caption: junta(llenarPlantilla(plantilla(cfg, 'equipo_dia'), { ...varsEquipoDia(eq), nombre: primerNombre(c.nombre, '') }), tablaReto, textoVualaEquipo(vuala, todos)),
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
        textoVualaRuta(vuala[claveRuta(c.ruta)]),
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

// ------------------------------------------------------------------ RETRO DEL GRUPO
const RETRO_DESDE = 9, RETRO_HASTA = 20;
const GRUPO_RETRO = process.env.GRUPO_RETRO || '5213221821493-1614005509@g.us';
const MIN_EN_CERO = 45;

function horaActualMX() {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
  const g = (t) => Number(p.find((x) => x.type === t)?.value || 0);
  return { h: g('hour') % 24, min: g('minute') };
}

// ⏱️ Hora de salida del CLO por ruta → { J201: 1760710000000, ... }
// Sale del panel de Tiempos (su propio Supabase): tabla panel_kv, key "board-activo",
// value = { fecha: 'YYYY-MM-DD', rutas: { J201: { areas: { salida_ruta: { ts } } } } }.
// Si no hay dato, a los que van en 0 se les señala solo a partir de las 11 am.

async function datosRetro(fecha, cfg) {
  const filas = await filasDeFecha(fecha);
  const todos = await listaContactos(cfg);
  const porRuta = Object.fromEntries(filas.map((f) => [claveRuta(f.ruta), f]));

  let otcPorRuta = {};
  try {
    const r = await sb('ventas_app_state?id=eq.main&select=otc:data->otcDia');
    const otc = (r[0]?.otc || []).filter(x => x.fecha === fecha);
    for (const x of otc) {
      const ruta = claveRuta(x.vendedor);
      if (!otcPorRuta[ruta]) otcPorRuta[ruta] = 0;
      otcPorRuta[ruta] += Number(x.monto) || 0;
    }
  } catch {}

  const vuala = await vualaPorRuta(fecha, todos);
  const rutas = [];
  for (const c of todos) {
    if (c.tipo !== 'vendedor' || !c.activo) continue;
    const fila = porRuta[claveRuta(c.ruta)];
    if (!fila) continue;
    const m = calcular(fila, filas);
    const sv = sinVualaDe(fila);
    
    // Marcas DEL DÍA: lo vendido hoy y su meta del día (extra.marcas_dia, igual que la tabla de la app).
    // OJO: extra.marcas[].por_dia es lo que NECESITAN vender por día (un objetivo), no el avance.
    const marcas = { ice: null, blossom: null, summer: null, faronet: null };
    for (const mk of (fila.extra?.marcas_dia || [])) {
      const k = `${mk.clave || ''} ${mk.nombre || ''}`.toLowerCase();
      const v = { vendido: Math.round(Number(mk.vendido) || 0), meta: Number(mk.objetivo) > 0 ? Math.round(Number(mk.objetivo)) : null };
      if (k.includes('ice')) marcas.ice = v;
      else if (k.includes('bloss')) marcas.blossom = v;
      else if (k.includes('summ')) marcas.summer = v;
      else if (k.includes('faro')) marcas.faronet = v;
    }
    const otcApp = Number(fila.extra?.otc_dia);

    rutas.push({
      ruta: c.ruta,
      nombre: primerNombre(c.nombre, c.ruta),
      mencion: mencion(c.telefono),
      venta_dia: Math.round(m.ventaDia || 0),
      pct_dia: m.pctDia === null ? null : Math.round(m.pctDia),
      obj: Math.round(m.objDia || 0),
      falta: Math.max(0, (m.objDia || 0) - (m.ventaDia || 0)),
      sinVuala: sv ? { piezas: sv.piezas || 0, minimo: sv.minimo || 2 } : null,
      // OTC del día: el mismo dato de la app; si no viene, la suma del detalle de OTC
      otc: Math.round(Number.isFinite(otcApp) && fila.extra?.otc_dia !== null && fila.extra?.otc_dia !== undefined ? otcApp : (otcPorRuta[claveRuta(c.ruta)] || 0)),
      vuala: vuala[claveRuta(c.ruta)]?.piezas || 0,
      otc_meta: Number(fila.extra?.otc_dia_objetivo) > 0 ? Math.round(Number(fila.extra.otc_dia_objetivo)) : null,
      ice: marcas.ice,
      blossom: marcas.blossom,
      summer: marcas.summer,
      faronet: marcas.faronet,
    });
  }

  rutas.sort((a, b) => b.venta_dia - a.venta_dia);
  const { h } = horaActualMX();
  const lider = rutas[0] || null;
  const enCero = rutas.filter(r => r.venta_dia === 0);
  // Candidatos: los 3 con menor % de su meta del día (sin contar al líder)
  const pachuco = rutas.filter((r) => r.ruta !== lider?.ruta)
    .sort((a, b) => (a.pct_dia ?? 999) - (b.pct_dia ?? 999) || a.venta_dia - b.venta_dia).slice(0, 3);

  return { fecha, hora: `${h}:00`, lider_dia: lider, en_cero: enCero, pachuco, rutas };
}

// Retro en formato "tarjetas" por ruta: lo VENDIDO HOY / meta del día, con semáforo como la app
// (🟢 ya cubrió la meta del día · 🟡 80% o más · 🔴 abajo).
function textoRetroFijo(d) {
  const tag = (r) => (r.mencion ? `@${r.mencion}` : r.nombre);
  const ruta = (r) => claveRuta(r.ruta);
  const miles = (x) => Math.round(Number(x) || 0).toLocaleString('es-MX');
  const dinero = (x) => (x >= 1000 ? `$${(x / 1000).toFixed(1).replace(/\.0$/, '')}k` : `$${miles(x)}`);
  const sem = (v, meta) => (!meta ? '⚪' : v >= meta ? '🟢' : v >= meta * 0.8 ? '🟡' : '🔴');
  const vm = (v, meta) => `${miles(v)}${meta ? `/${miles(meta)}` : ''}`;
  const mk = (nom, x) => (x ? `${nom} ${vm(x.vendido, x.meta)}${x.meta && x.vendido >= x.meta ? '✓' : ''}` : null);
  const L = [];
  L.push(`📊 *AVANCE DEL DÍA · ${d.hora} h*`);
  L.push('_vendido hoy / meta del día_');
  if (d.lider_dia) L.push('', `🏆 Líder: ${tag(d.lider_dia)} (${ruta(d.lider_dia)}) con *${miles(d.lider_dia.venta_dia)} paq* (${d.lider_dia.pct_dia ?? '—'}%)`);
  L.push(d.en_cero.length ? `🥶 En cero: ${d.en_cero.map((r) => `${tag(r)} (${ruta(r)})`).join(', ')}` : '✅ Ninguna ruta en cero');
  const sinVuala = d.rutas.filter((r) => !r.vuala);
  L.push(sinVuala.length ? `🥤 Sin vender Vuala: ${sinVuala.map((r) => `${tag(r)} (${ruta(r)})`).join(', ')}` : '🥤 ¡Todas las rutas ya vendieron Vuala!');
  if (d.pachuco.length) {
    L.push('', '🖐️ *Candidatos a la Tercera Mano del Pachuco:*');
    d.pachuco.forEach((r, i) => L.push(`${i + 1}. ${tag(r)} (${ruta(r)}) · ${r.pct_dia ?? '—'}% · le faltan ${miles(r.falta)} paq`));
  }
  L.push('', '━━━━━━━━━━━━━━━');
  for (const r of d.rutas) {
    L.push('', `${sem(r.venta_dia, r.obj)} *${ruta(r)} ${r.nombre}* · *${vm(r.venta_dia, r.obj)} paq* (${r.pct_dia ?? '—'}%)`);
    const marcas = [mk('ICE', r.ice), mk('BLOSS', r.blossom), mk('SUMM', r.summer), mk('FARO', r.faronet)].filter(Boolean);
    if (marcas.length) L.push(`   ${marcas.join(' · ')}`);
    const sv = r.sinVuala ? `S/Vuala ${r.sinVuala.piezas}/${r.sinVuala.minimo} ${r.sinVuala.piezas >= r.sinVuala.minimo ? '✅' : '❌'}` : null;
    L.push(`   OTC ${dinero(r.otc)}${r.otc_meta ? `/${dinero(r.otc_meta)}` : ''}${sv ? ` · ${sv}` : ''} · Vuala ${r.vuala ? `${r.vuala} pz ✅` : '❌'}`);
  }
  L.push('', '━━━━━━━━━━━━━━━', '🟢 meta del día cubierta · 🟡 80% o más · 🔴 abajo', '¡Vamos equipo, a cerrar fuerte! 💪');
  return L.join('\n');
}

async function textoRetroIA(d, cfg) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const tono = TONOS[cfg?.tonoBot] || TONOS.picante;
  const sistema = [
    'Eres ROBOTINA. Escribe la retro del día para el grupo de WhatsApp.',
    tono,
    'Estructura:',
    '1) Saludo con hora y líder (más paquetes).',
    '2) Si hay rutas en cero, menciónalas. Si no, di que no hay.',
    '3) "Candidatos para la mano del pachuco": las 3 rutas más bajas (excluyendo al líder).',
    '4) Resumen por ruta: paquetes (%), OTC $, Sin Vuala (✅ si 2 o más, ❌ si menos), ICE, BLOSSOM, SUMMER, FARONET (del día).',
    '5) Cierre motivacional.',
    'Usa @número para mencionar. Usa solo los números del JSON.',
    `Datos: ${JSON.stringify(d)}`,
  ].join('\n');
  try {
    const r = await fetchIA({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL_BOT || 'gpt-4.1-mini',
        temperature: 0.7,
        max_tokens: 900,
        messages: [{ role: 'system', content: sistema }, { role: 'user', content: 'Escribe la retro.' }],
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

  const ultimo = filasHoy.map((f) => f.actualizado_en).filter(Boolean).sort().pop() || '';
  const previo = await leerEstado('retro_grupo');
  if (!forzar && previo?.fecha === hoy && previo?.actualizado === ultimo) {
    return json({ total: 0, mensajes: [], nota: 'sin avance nuevo desde la última retro' });
  }

  const d = await datosRetro(hoy, cfg);
  if (!d.rutas.length) return json({ total: 0, mensajes: [], nota: 'sin rutas con vendedor activo' });
  // Formato fijo (tabla por ruta): los números salen directo de los datos, sin pasar por la IA
  const texto = textoRetroFijo(d);
  const mencionados = [...new Set(d.rutas.map((r) => r.mencion).filter((m) => m && texto.includes(`@${m}`)))];

  await guardarEstado('retro_grupo', { fecha: hoy, actualizado: ultimo, texto });
  return json({ fecha: hoy, total: 1, mensajes: [{ numero: GRUPO_RETRO, texto, mencionados }] });
}

// ------------------------------------------------------------------ 🧠 FUNCIONES DE ROBOTINA (recuperadas de la versión anterior)
// Indicadores, Tercera Mano, venta por producto con apodos, rallies y menciones.

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
      rallies_otc: resumenRallies(filas, todos, true),
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
    rallies_otc: resumenRallies(companeras, await listaContactos(cfgV), false),
    mes: { avance: v.pct_mes, ritmo_esperado: v.esperado, vendido: v.venta_mes, objetivo: v.objetivo_mes, necesita_por_dia: v.necesita, dias_restantes: v.dias_restantes, lugar: v.lugar, de_rutas: v.total_rutas },
    dia: { avance: v.pct_dia, vendido: v.dia_vendido, meta: v.dia_objetivo, falta: v.falta_dia, efectividad: v.efectividad, visitas_efectivas: v.visitas, lugar_hoy: v.lugar_dia, otc_hoy: v.otc_dia, meta_otc: v.otc_objetivo },
    marcas_mes: v.marcas, marcas_hoy: v.marcas_dia,
  };
}

// ------------------------------------------------------------------ 🔄 REFRESCO ANTES DE CONTESTAR
// Si el robot actualizó hace menos de MIN_FRESCO minutos, se contesta directo sin volver a refrescar.

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

// ------------------------------------------------------------------ 🏁 RALLIES OTC para la IA
// Ranking ya calculado por rally (Robotina solo lo lee, no hace cuentas):
//   { nombre, unidad, vigencia, totales, ranking: [{ lugar, ruta, nombre, hoy, meta_hoy, pct_hoy, acumulado, meta_final, pct_final }] }
// El lugar 1 es el que va MEJOR. A vendedores nunca se les dan los exclusivos de Supervisor-1.

function resumenRallies(filas, todos, equipo) {
  const nombres = {};
  for (const c of todos || []) if (c.tipo === 'vendedor') nombres[claveRuta(c.ruta)] = primerNombre(c.nombre || '', claveRuta(c.ruta));
  const porRally = {};
  for (const f of filas || []) {
    const ruta = claveRuta(f.ruta);
    for (const r of (Array.isArray(f.extra?.rallies) ? f.extra.rallies : [])) {
      if (!r?.id || (r.exclusivo && !equipo)) continue;
      const R = porRally[r.id] || (porRally[r.id] = {
        nombre: r.nombre || 'Rally OTC',
        unidad: r.unidad === 'piezas' ? 'piezas' : 'pesos',
        vigencia: `${r.fechaInicio || '¿?'} a ${r.fechaFin || '¿?'}`,
        ...(r.exclusivo ? { exclusivo_supervisor1: true } : {}),
        filas: [],
      });
      const hoy = r0(n(r.avanceDia) || 0), metaHoy = n(r.objetivoDia) ? r0(n(r.objetivoDia)) : null;
      const acum = r0(n(r.avanceTotal) || 0), metaFin = n(r.objetivoFinal) ? r0(n(r.objetivoFinal)) : null;
      R.filas.push({
        ruta, nombre: nombres[ruta] || f.nombre || ruta,
        hoy, meta_hoy: metaHoy, pct_hoy: metaHoy ? Math.round((hoy / metaHoy) * 100) : null,
        falta_hoy: metaHoy ? Math.max(0, metaHoy - hoy) : null,
        acumulado: acum, meta_final: metaFin, pct_final: metaFin ? Math.round((acum / metaFin) * 100) : null,
        falta_final: metaFin ? Math.max(0, metaFin - acum) : null,
      });
    }
  }
  return Object.values(porRally).map(({ filas: fs, ...R }) => {
    const clave = (x) => (x.pct_hoy ?? x.pct_final ?? -1);
    const ranking = fs.sort((a, b) => clave(b) - clave(a) || b.hoy - a.hoy || b.acumulado - a.acumulado)
      .map((x, i) => ({ lugar: i + 1, ...x }));
    const suma = (k) => fs.reduce((s, x) => s + (x[k] || 0), 0);
    return {
      ...R,
      participantes: ranking.length,
      ordenado_por: fs.some((x) => x.meta_hoy) ? '% de la meta de HOY (lugar 1 = el mejor)' : '% de la meta final (lugar 1 = el mejor)',
      totales: { hoy: suma('hoy'), meta_hoy: suma('meta_hoy') || null, acumulado: suma('acumulado'), meta_final: suma('meta_final') || null },
      cumplieron_hoy: ranking.filter((x) => x.pct_hoy !== null && x.pct_hoy >= 100).map((x) => x.ruta),
      ranking,
    };
  });
}

// La IA menciona por ruta (@J203); aquí se cambia por el @número real de esa persona
// y se arma la lista de mencionados. Cualquier número que la IA invente se borra.

function aplicarMenciones(texto, todos) {
  const tel = {};
  for (const c of todos || []) if (c.tipo === 'vendedor' && c.telefono) tel[claveRuta(c.ruta)] = mencion(c.telefono);
  const validos = new Set(Object.values(tel));
  const mencionados = new Set();
  let t = String(texto || '')
    .replace(/@\+?(\d{10,13})\b/g, (m, d) => (validos.has(d) ? m : ''))           // números inventados fuera
    .replace(/@\s?(J\s?-?\d{3})\b/gi, (m, r) => {
      const k = claveRuta(r);
      return tel[k] ? `@${tel[k]}` : k;
    });
  for (const m of t.match(/@(\d{10,13})\b/g) || []) mencionados.add(m.slice(1));
  t = t.replace(/[ \t]{2,}/g, ' ');
  return { texto: t, mencionados: [...mencionados] };
}

// ------------------------------------------------------------------ 🔎 VENTA POR PRODUCTO
// Cuando preguntan por un producto en específico ("¿cuánto se vendió de Switch?"), se busca en
// el detalle del día que carga el robot (data.avanceDia = paquetes por artículo y cliente;
// data.otcDia = OTC por artículo). Así Robotina no tiene que adivinar con las marcas generales.

const NO_PRODUCTO = new Set(`robotina bot jefe supervisor hola buenos buenas dias tardes noches gracias porfa favor
cuanto cuanta cuantos cuantas cuantito venta ventas vendio vendieron vendido vendida vendidos vendimos vende venden vendiste
hoy ayer dia semana mes periodo del de la el los las en que como va vamos van voy lleva llevan llevamos llevo
producto productos articulo articulos pieza piezas paquete paquetes paq caja cajas por para ruta rutas todas todos
me dame dime da detalle detalles sobre cual cuales quien quienes hay se ha han un una unos unas al lo le les con mas menos
avance avances info informacion datos dato numero numeros total totales otc reto rally meta metas marca marcas indicador
indicadores ranking lugar efectividad visitas clientes cliente mi mis tu su sus esta este esto estos estas ese esa eso nos
tenemos tiene tienen tengo saber quiero quisiera puedes podrias ver muestra mostrar ahorita ahora bien mal ok si no tambien
equipo vendedor vendedores supervisores jefe proyeccion objetivo objetivos lleve llevaba vuala sin tercera mano pachuco
desglose desglosado desglosa desglosar general completo completa resumen top mejores vendidas lista listado cada uno
porfavor necesito manda mandame pasame paso pasa dia hoyy ruta`.split(/\s+/));

function palabrasProducto(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9&\s]/g, ' ');
  return [...new Set(t.split(/\s+/).filter((w) => w.length >= 3 && !NO_PRODUCTO.has(w) && !/^j\d{3}$/.test(w) && !/^\d+$/.test(w)))];
}

// Apodos que da de alta el Gerente (WhatsApp → Robotina → "Cómo le dicen a cada producto"):
// data.whatsappBot.apodos = [{ codigo, articulo, apodos: "SWITCH, SWICH" }]

const normTxt = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9&\s]/g, ' ').replace(/\s+/g, ' ').trim();

function casiIgual(a, b) { // distancia de edición ≤ 1 (para faltas de ortografía: swich / siwch / switch)
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++dif > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}

function productosPorApodo(texto, apodos) {
  const t = ` ${normTxt(texto)} `;
  const palabrasT = t.trim().split(' ');
  const hallados = [];
  for (const a of apodos || []) {
    for (const frase of String(a.apodos || '').split(',').map(normTxt).filter(Boolean)) {
      // Todas las palabras del apodo deben venir en la pregunta, en cualquier orden y aunque haya
      // palabras en medio ("vuala de vainilla" = VUALA VAINILLA). Con una letra de diferencia si es larga.
      const esta = (fw) => palabrasT.some((w) => w === fw || (fw.length >= 5 && w.length >= 5 && casiIgual(w, fw)));
      const ok = t.includes(` ${frase} `) || frase.split(' ').every(esta);
      if (ok) hallados.push({ frase, codigo: String(a.codigo || '').trim(), articulo: String(a.articulo || '').trim() });
    }
  }
  if (!hallados.length) return null;
  // Si coincide "promo clipper", no se cuentan los que solo dicen "clipper"
  const frases = [...new Set(hallados.map((h) => h.frase))].sort((x, y) => y.length - x.length);
  const aceptadas = [];
  for (const f of frases) if (!aceptadas.some((g) => g.includes(f))) aceptadas.push(f);
  const elegidos = hallados.filter((h) => aceptadas.includes(h.frase));
  // Palabras de la pregunta que ya se usaron en apodos (para buscar las demás por nombre de artículo)
  const usadas = new Set(aceptadas.flatMap((f) => f.split(' ')));
  return {
    frases: aceptadas,
    usadas,
    codigos: new Set(elegidos.map((h) => h.codigo.toUpperCase()).filter(Boolean)),
    articulos: new Set(elegidos.map((h) => normTxt(h.articulo)).filter(Boolean)),
  };
}

// Apodos de base (los mismos ejemplos del panel); se suman a los que se guarden en la app

const APODOS_BASE = [
  { codigo: '0309', articulo: 'VLACHOCO_26', apodos: 'VUALA CHOCOLATE' },
  { codigo: '0310', articulo: 'VLAVAINILLA_26', apodos: 'VUALA VAINILLA' },
  { codigo: '0360', articulo: 'CP11D24+EXIS20', apodos: 'PROMO CLIPPER' },
  { codigo: '0390', articulo: 'CP11D20+EXIS20', apodos: 'PROMO CLIPPER' },
  { codigo: '0300', articulo: 'CPLCP11_26', apodos: 'CLIPPER' },
  { codigo: '0316', articulo: 'SWICHC/10_26', apodos: 'SWITCH, SWICH, SIWCH' },
  { codigo: '0372', articulo: 'CARCOOFRE_26_B', apodos: 'CARIBE, CARIBE FRESA' },
  { codigo: '0374', articulo: 'CARCOOMANG_26_B', apodos: 'CARIBE, CARIBE MANGO' },
  { codigo: '0375', articulo: 'CARCOOMANZ_26_B', apodos: 'CARIBE, CARIBE MANZANA' },
  { codigo: '0371', articulo: 'CARCOODZN_26_B', apodos: 'CARIBE' },
  { codigo: '0354', articulo: 'CARCOOTIN_26.6', apodos: 'CARIBE' },
  { codigo: '0304', articulo: 'PAPELCP_26', apodos: 'PAPEL CLIPPER' },
  { codigo: '0307', articulo: 'EXIS_26', apodos: 'ECONOMICO' },
  { codigo: '0305', articulo: 'CPGAS16ML_26', apodos: 'GAS' },
  { codigo: '0293', articulo: 'HIDRA FRESA', apodos: 'HIDRA' },
];

// "¿qué se vendió por producto?", "detalle por ruta por producto", "más vendidos"… sin nombrar un producto

function pideDetalleProductos(texto) {
  const t = normTxt(texto);
  return /\b(por producto|por productos|por articulo|productos|articulos|mas vendid\w*|que se vendio|que vendio|que vendieron|que han vendido|top)\b/.test(t);
}

async function ventasPorProducto(texto, cfg) {
  const porApodo = productosPorApodo(texto, [...(Array.isArray(cfg?.apodos) ? cfg.apodos : []), ...APODOS_BASE]);
  const palabras = palabrasProducto(texto);
  const general = !palabras.length && !porApodo && pideDetalleProductos(texto);
  if (!palabras.length && !porApodo && !general) return null;
  // Si nombran rutas (J203, j 205), solo esas
  const rutasPedidas = new Set((normTxt(texto).match(/\bj\s?-?\d{3}\b/g) || []).map((x) => claveRuta(x.toUpperCase())));
  let av = [], otc = [];
  try {
    const r = await sb('ventas_app_state?id=eq.main&select=av:data->avanceDia,otc:data->otcDia');
    av = Array.isArray(r?.[0]?.av) ? r[0].av : [];
    otc = Array.isArray(r?.[0]?.otc) ? r[0].otc : [];
  } catch { return null; }
  // El reporte de OTC trae todas las rutas del país: solo se cuentan las del equipo
  // (las rutas dadas de alta en Contactos de WhatsApp y las que salen en el resumen del día).
  const misRutas = new Set();
  try {
    for (const c of await listaContactos(cfg)) if (c.tipo === 'vendedor' && c.ruta) misRutas.add(claveRuta(c.ruta));
    for (const f of await sb('resumen_vendedores?select=ruta&order=fecha.desc&limit=40')) if (f.ruta) misRutas.add(claveRuta(f.ruta));
  } catch { /* sin filtro si no se pudo leer */ }
  const esMia = (vendedor) => (!misRutas.size || misRutas.has(claveRuta(vendedor)))
    && (!rutasPedidas.size || rutasPedidas.has(claveRuta(vendedor)));
  av = av.filter((x) => esMia(x.vendedor));
  otc = otc.filter((x) => esMia(x.vendedor));
  const fecha = [...av.map((x) => x.fecha), ...otc.map((x) => x.fecha)].filter(Boolean).sort().pop() || null;
  const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Cuántas de las palabras trae el artículo (se quedan los que traen más: "marlboro ice" → los ICE)
  const coincide = (...campos) => {
    if (general) return 1;
    if (porApodo) { // con apodo: los artículos dados de alta para ese nombre valen más
      const [articulo, codigo] = campos;
      if (porApodo.articulos.has(normTxt(articulo)) || (codigo && porApodo.codigos.has(String(codigo).trim().toUpperCase()))) return 100;
    }
    // Además del apodo, se busca por nombre con todas las palabras (por si el artículo vendido
    // todavía no tiene apodo, p. ej. una presentación nueva)
    const lista = palabras;
    if (!lista.length) return 0;
    const h = norm(campos.join(' '));
    const tokens = h.split(/[^a-z0-9]+/).filter((x) => x.length >= 3);
    // Coincide si la palabra está dentro del nombre, o si se parece a un pedazo del nombre
    // (una letra de diferencia, o el pedazo empieza con la palabra: "swich" ~ "swichc")
    return lista.filter((w) => h.includes(w) || tokens.some((k) => casiIgual(w, k)
      || (w.length >= 4 && (k.startsWith(w) || w.startsWith(k)) && Math.abs(k.length - w.length) <= 2))).length;
  };
  const productos = {};
  const sumar = (clave, nombre, tipo, ruta, cant, monto, puntos) => {
    const p = productos[clave] || (productos[clave] = { producto: nombre, tipo, total_cantidad: 0, total_pesos: 0, por_ruta: {}, puntos });
    p.total_cantidad += cant; p.total_pesos += monto;
    const rr = p.por_ruta[ruta] || (p.por_ruta[ruta] = { cantidad: 0, pesos: 0 });
    rr.cantidad += cant; rr.pesos += monto;
  };
  for (const x of av) {
    const pts = x.fecha === fecha ? coincide(x.articulo, x.marca) : 0;
    if (!pts) continue;
    sumar(`av:${x.articulo}`, x.articulo + (x.marca ? ` (${x.marca})` : ''), 'paquetes', claveRuta(x.vendedor), Number(x.paquetes) || 0, Number(x.monto) || 0, pts);
  }
  for (const x of otc) {
    const pts = x.fecha === fecha ? coincide(x.articulo, x.codigoArticulo) : 0;
    if (!pts) continue;
    sumar(`otc:${x.codigoArticulo || x.articulo}`, `${x.articulo}${x.codigoArticulo ? ` [${x.codigoArticulo}]` : ''} (OTC)`, 'piezas', claveRuta(x.vendedor), Number(x.unidadesVendidas) || 0, Number(x.monto) || 0, pts);
  }
  if (general) {
    // Resumen: lo más vendido del equipo y, por ruta, sus artículos más vendidos
    const todos = Object.values(productos);
    const porRuta = {};
    for (const p of todos) {
      for (const [ruta, v] of Object.entries(p.por_ruta)) {
        (porRuta[ruta] = porRuta[ruta] || []).push({ producto: p.producto, tipo: p.tipo, cantidad: Math.round(v.cantidad), pesos: Math.round(v.pesos) });
      }
    }
    const top = (arr, n) => arr.sort((a, b) => b.pesos - a.pesos || b.cantidad - a.cantidad).slice(0, n);
    // Totales exactos por ruta (para que la IA no sume a mano): mismos que la tabla de la app
    const totales = {};
    for (const x of av) {
      if (x.fecha !== fecha) continue;
      const t = totales[claveRuta(x.vendedor)] || (totales[claveRuta(x.vendedor)] = { paquetes: 0, venta_pesos: 0, otc_pesos: 0, otc_piezas: 0 });
      t.paquetes += Number(x.paquetes) || 0; t.venta_pesos += Number(x.monto) || 0;
    }
    for (const x of otc) {
      if (x.fecha !== fecha) continue;
      const t = totales[claveRuta(x.vendedor)] || (totales[claveRuta(x.vendedor)] = { paquetes: 0, venta_pesos: 0, otc_pesos: 0, otc_piezas: 0 });
      t.otc_pesos += Number(x.monto) || 0; t.otc_piezas += Number(x.unidadesVendidas) || 0;
    }
    const redondear = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)]));
    return {
      fecha_del_detalle: fecha,
      tipo_consulta: 'detalle general por producto',
      rutas_del_equipo: [...misRutas].sort(),
      ...(rutasPedidas.size ? { solo_rutas: [...rutasPedidas] } : {}),
      encontrado: todos.length > 0,
      mas_vendidos_equipo: top(todos.map((p) => ({ producto: p.producto, tipo: p.tipo, cantidad: Math.round(p.total_cantidad), pesos: Math.round(p.total_pesos), rutas: Object.keys(p.por_ruta).length })), 10),
      por_ruta: Object.fromEntries(Object.entries(porRuta).sort().map(([r, arr]) => [r, {
        totales_del_dia: redondear(totales[r] || {}), articulos_distintos: arr.length, top: top(arr, rutasPedidas.size ? 15 : 6),
      }])),
      nota: 'Venta real por artículo del detalle del día (paquetes en avance, piezas en OTC), ordenado por pesos. "top" por ruta son sus artículos más vendidos; si piden uno en específico, que lo pregunten por nombre.',
    };
  }
  // Se quedan: los de apodo (100) y, de los demás, los que coinciden con más palabras
  const maxPts = Math.max(0, ...Object.values(productos).filter((p) => p.puntos < 100).map((p) => p.puntos));
  const lista = Object.values(productos)
    .filter((p) => p.puntos >= 100 || (maxPts > 0 && p.puntos === maxPts))
    .map(({ puntos: _p, ...p }) => ({ ...p, total_cantidad: Math.round(p.total_cantidad), total_pesos: Math.round(p.total_pesos),
      por_ruta: Object.fromEntries(Object.entries(p.por_ruta).sort((a, b) => b[1].cantidad - a[1].cantidad)
        .map(([k, v]) => [k, { cantidad: Math.round(v.cantidad), pesos: Math.round(v.pesos) }])) }))
    .sort((a, b) => b.total_cantidad - a.total_cantidad)
    .slice(0, 15);
  return {
    fecha_del_detalle: fecha,
    palabras_buscadas: porApodo ? porApodo.frases : palabras,
    ...(porApodo ? { buscado_por_apodo: true } : {}),
    encontrado: lista.length > 0,
    productos: lista,
    nota: lista.length
      ? `Venta real por artículo del detalle del día, SOLO de las rutas del equipo (${[...misRutas].sort().join(', ')}). Paquetes en avance, piezas en OTC. Las rutas que no aparecen no vendieron ese producto.`
      : `En el detalle de ventas del día NO hay ninguna venta de ese producto en las rutas del equipo (${[...misRutas].sort().join(', ')}).`,
  };
}

const n = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

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

function horaMXCorta(d) {
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', hour: 'numeric', minute: '2-digit', hour12: true })
    .format(d).replace(/\s?a\.?\s?m\.?/i, ' am').replace(/\s?p\.?\s?m\.?/i, ' pm');
}

const fmtU = (v, u) => (v === null || v === undefined ? '—' : u === '$' ? `$${Math.round(v).toLocaleString('es-MX')}` : u === '%' ? `${v}%` : `${r0(v)} ${u}`);

// Texto sin IA (respaldo si OpenAI falla)

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
