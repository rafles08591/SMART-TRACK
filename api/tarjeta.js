// api/tarjeta.js — genera la tarjeta PNG con el avance de una ruta o del equipo.
//   GET /api/tarjeta?ruta=J201&f=2026-09-28&s=<firma>
//   GET /api/tarjeta?ruta=EQUIPO&f=2026-09-28&s=<firma>   → tarjeta del equipo (Supervisor / Gerente)
// La firma (HMAC con BOT_TOKEN) la pone /api/wa-resumen; sin firma válida → 403.

import { ImageResponse } from '@vercel/og';
import {
  firmar, claveRuta, filasDeFecha, calcular, estadoMes, frase, cantidad, cantidadCorta, pct, fechaCorta, contactoPorRuta,
  configBot, listaContactos, calcularEquipo, primerNombre,
} from './_wa-lib.js';

export const config = { runtime: 'edge' };

const C = {
  fondo1: '#070b18', fondo2: '#101a36', panel: 'rgba(255,255,255,0.06)', borde: 'rgba(255,255,255,0.10)',
  texto: '#f8fafc', gris: '#94a3b8', cian: '#22d3ee', verde: '#22c55e', ambar: '#f59e0b', rojo: '#ef4444',
};
const colorEstado = (e) => ({ arriba: C.verde, ritmo: C.ambar, abajo: C.rojo }[e] || C.cian);
const colorPct = (p) => (p === null ? C.gris : p >= 100 ? C.verde : p >= 80 ? C.ambar : C.rojo);

// Mini "JSX" sin compilador: h(tipo, estilo, ...hijos). Satori exige display:flex.
function h(type, style = {}, ...children) {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  return {
    type,
    props: { style: { display: 'flex', flexShrink: 0, ...style }, children: kids.length === 1 ? kids[0] : kids },
  };
}

// Fuente Inter (woff) — si falla la descarga se usa la fuente por defecto.
let fuentes = null;
async function cargarFuentes() {
  if (fuentes) return fuentes;
  try {
    const base = 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/';
    const bajar = async (archivo) => {
      const res = await fetch(base + archivo);
      const buf = res.ok ? await res.arrayBuffer() : null;
      // Validar que realmente sea un .woff (firma "wOFF")
      if (!buf || new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== 'wOFF') throw new Error('fuente inválida');
      return buf;
    };
    const [r, b] = await Promise.all([bajar('inter-latin-500-normal.woff'), bajar('inter-latin-800-normal.woff')]);
    fuentes = [
      { name: 'Inter', data: r, weight: 500, style: 'normal' },
      { name: 'Inter', data: b, weight: 800, style: 'normal' },
    ];
  } catch {
    fuentes = [];
  }
  return fuentes;
}

function tile(etiqueta, valor, sub, color) {
  return h('div', {
    flex: 1, flexDirection: 'column', background: C.panel, border: `2px solid ${C.borde}`,
    borderRadius: 28, padding: '22px 30px',
  },
    h('div', { fontSize: 26, color: C.gris, letterSpacing: 2 }, etiqueta),
    h('div', { fontSize: 60, fontWeight: 800, color, marginTop: 2 }, valor),
    h('div', { fontSize: 26, color: C.gris, marginTop: 2 }, sub),
  );
}

const numN = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const miles = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function marcasDe(fila) {
  const lista = Array.isArray(fila.extra?.marcas) ? fila.extra.marcas : [];
  return lista.filter((x) => numN(x.objetivo) > 0);
}

function filaMarca(mk) {
  const vend = numN(mk.vendido) ?? 0;
  const obj = numN(mk.objetivo) ?? 0;
  const p = obj > 0 ? (vend / obj) * 100 : 0;
  const resta = numN(mk.resta) ?? Math.max(0, obj - vend);
  const porDia = numN(mk.por_dia);
  const col = colorPct(p);
  return h('div', { flexDirection: 'column', marginTop: 18 },
    h('div', { justifyContent: 'space-between', alignItems: 'flex-end' },
      h('div', { fontSize: 30, fontWeight: 800, color: C.texto }, String(mk.nombre || '').toUpperCase()),
      h('div', { fontSize: 28, color: C.texto }, `${miles(vend)} / ${miles(obj)} paq`),
    ),
    h('div', { position: 'relative', width: '100%', height: 16, marginTop: 8 },
      h('div', { position: 'absolute', left: 0, top: 0, width: '100%', height: 16, borderRadius: 8, background: 'rgba(255,255,255,0.14)' }),
      h('div', { position: 'absolute', left: 0, top: 0, width: `${Math.min(100, p)}%`, height: 16, borderRadius: 8, background: col }),
    ),
    h('div', { justifyContent: 'space-between', marginTop: 6, fontSize: 24 },
      h('div', { color: resta > 0 ? C.rojo : C.verde }, resta > 0 ? `Resta: ${miles(resta)} paq` : '¡Meta cumplida!'),
      h('div', { color: resta > 0 ? C.ambar : C.verde }, porDia !== null && resta > 0 ? `Por día: ${miles(porDia)} paq` : `${Math.round(p)}%`),
    ),
  );
}

function bloqueMarcas(fila) {
  const lista = marcasDe(fila);
  if (!lista.length) return null;
  return h('div', {
    flexDirection: 'column', marginTop: 24, padding: '24px 32px 28px', borderRadius: 28,
    background: C.panel, border: `2px solid ${C.borde}`,
  },
    h('div', { fontSize: 26, color: C.gris, letterSpacing: 3 }, 'MARCAS · OPEN'),
    ...lista.map(filaMarca),
  );
}

export function altoTarjeta(fila) {
  const n = marcasDe(fila).length;
  return 1350 + (n ? 150 + n * 112 : 0);
}

function tarjeta(fila, m) {
  const e = estadoMes(m);
  const col = colorEstado(e);
  const pctBarra = Math.max(0, Math.min(100, m.pctMes ?? 0));
  const marca = Math.max(0, Math.min(100, m.esperado ?? 0));

  return h('div', {
    width: '100%', height: '100%', flexDirection: 'column', padding: 64, fontFamily: 'Inter',
    color: C.texto, backgroundImage: `linear-gradient(160deg, ${C.fondo1} 0%, ${C.fondo2} 55%, ${C.fondo1} 100%)`,
  },
    // Encabezado
    h('div', { justifyContent: 'space-between', alignItems: 'center' },
      h('div', { fontSize: 30, fontWeight: 800, color: C.cian, letterSpacing: 6 }, 'SMART-TRACK'),
      h('div', {
        fontSize: 34, fontWeight: 800, padding: '10px 28px', borderRadius: 999,
        border: `3px solid ${C.cian}`, color: C.cian,
      }, claveRuta(fila.ruta)),
    ),
    h('div', { fontSize: 60, fontWeight: 800, marginTop: 24, lineHeight: 1.15 }, fila.nombre || fila.ruta),
    h('div', { fontSize: 30, color: C.gris, marginTop: 4 }, `Corte del ${fechaCorta(fila.fecha)}`),

    // Bloque principal: avance del mes
    h('div', {
      flexDirection: 'column', marginTop: 28, padding: '32px 40px', borderRadius: 36,
      background: C.panel, border: `3px solid ${col}`,
    },
      h('div', { fontSize: 28, color: C.gris, letterSpacing: 4 }, 'AVANCE DEL MES'),
      h('div', { alignItems: 'flex-end', marginTop: 4 },
        h('div', { fontSize: 150, fontWeight: 800, color: col, lineHeight: 1 }, pct(m.pctMes)),
      ),
      h('div', { fontSize: 32, color: C.texto, marginTop: 8 }, `${cantidad(m.ventaMes, m.unidad)} de ${cantidad(m.objMes, m.unidad)}`),
      // Barra con marcador del ritmo esperado
      h('div', { position: 'relative', width: '100%', height: 64, marginTop: 16 },
        h('div', { position: 'absolute', left: 0, top: 18, width: '100%', height: 28, borderRadius: 14, background: 'rgba(255,255,255,0.14)' }),
        h('div', { position: 'absolute', left: 0, top: 18, width: `${pctBarra}%`, height: 28, borderRadius: 14, background: col }),
        h('div', { position: 'absolute', left: `${marca}%`, top: 4, width: 6, height: 56, marginLeft: -3, borderRadius: 3, background: C.texto }),
      ),
      h('div', { fontSize: 26, color: C.gris, marginTop: 6 }, `Línea blanca = ritmo esperado a la fecha (${pct(m.esperado)})`),
    ),

    // Tiles
    h('div', { marginTop: 24, gap: 24 },
      tile('DÍA', pct(m.pctDia), m.objDia ? `${cantidadCorta(m.ventaDia, m.unidad)} / ${cantidadCorta(m.objDia, m.unidad)}${m.unidad === 'paq' ? ' paq' : ''}` : 'sin dato', colorPct(m.pctDia)),
      tile('EFECTIVIDAD', pct(m.efectividad), m.prog ? `${m.vis ?? 0} de ${m.prog} clientes` : m.vis !== null ? `${m.vis} visitas efectivas` : 'del día', colorPct(m.efectividad)),
    ),
    h('div', { marginTop: 24, gap: 24 },
      tile('LUGAR', m.ranking ? `#${m.ranking}` : '—', m.totalRutas ? `de ${m.totalRutas} rutas` : 'ranking', m.ranking && m.ranking <= 3 ? C.cian : C.texto),
      tile('NECESITAS', cantidadCorta(m.necesitaDiario, m.unidad), `${m.unidad === 'paq' ? 'paq ' : ''}diarios · ${m.restantes} días`, C.texto),
    ),

    // Marcas OPEN
    bloqueMarcas(fila),

    // Frase
    h('div', {
      marginTop: 'auto', padding: '22px 30px', borderRadius: 24, fontSize: 30, lineHeight: 1.3,
      background: 'rgba(34,211,238,0.10)', border: `2px solid rgba(34,211,238,0.35)`,
    }, frase(m)),
  );
}

// ------------------------------------------------------------------ tarjeta del equipo
const colorDif = (m) => colorEstado(estadoMes(m));

function filaEquipo(r, i) {
  const m = r.m;
  const p = Math.max(0, Math.min(100, m.pctMes ?? 0));
  const marca = Math.max(0, Math.min(100, m.esperado ?? 0));
  const col = colorDif(m);
  return h('div', {
    alignItems: 'center', padding: '18px 24px', marginTop: 12, borderRadius: 22,
    background: i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.065)',
  },
    h('div', { width: 60, fontSize: 34, fontWeight: 800, color: i < 3 ? C.cian : C.gris }, `${i + 1}`),
    h('div', { width: 270, flexDirection: 'column' },
      h('div', { fontSize: 30, fontWeight: 800, color: C.texto }, r.ruta),
      h('div', { fontSize: 24, color: C.gris }, r.nombre ? primerNombre(r.nombre, r.ruta) : ' '),
    ),
    h('div', { width: 330, flexDirection: 'column', paddingRight: 24 },
      h('div', { fontSize: 34, fontWeight: 800, color: col }, pct(m.pctMes)),
      h('div', { position: 'relative', width: '100%', height: 28, marginTop: 6 },
        h('div', { position: 'absolute', left: 0, top: 8, width: '100%', height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.14)' }),
        h('div', { position: 'absolute', left: 0, top: 8, width: `${p}%`, height: 12, borderRadius: 6, background: col }),
        h('div', { position: 'absolute', left: `${marca}%`, top: 0, width: 4, height: 28, marginLeft: -2, borderRadius: 2, background: C.texto }),
      ),
    ),
    h('div', { width: 150, justifyContent: 'center', fontSize: 32, fontWeight: 800, color: colorPct(m.pctDia) }, pct(m.pctDia)),
    h('div', { width: 150, justifyContent: 'center', fontSize: 32, fontWeight: 800, color: colorPct(m.efectividad) }, pct(m.efectividad)),
  );
}

// % de una marca en una ruta (para la matriz)
function pctMarcaRuta(r, clave) {
  const mk = (r.fila.extra?.marcas || []).find((x) => (x.clave || x.nombre) === clave);
  if (!mk || !(Number(mk.objetivo) > 0)) return null;
  return ((Number(mk.vendido) || 0) / Number(mk.objetivo)) * 100;
}

function bloqueMarcasEquipo(eq) {
  if (!eq.marcas.length) return null;
  return h('div', {
    flexDirection: 'column', marginTop: 30, padding: '24px 32px 28px', borderRadius: 28,
    background: C.panel, border: `2px solid ${C.borde}`,
  },
    h('div', { fontSize: 26, color: C.gris, letterSpacing: 3 }, 'MARCAS · OPEN · EQUIPO'),
    ...eq.marcas.map(filaMarca),
  );
}

function matrizMarcas(eq) {
  if (!eq.marcas.length) return null;
  const anchoCol = Math.floor(660 / eq.marcas.length);
  return h('div', {
    flexDirection: 'column', marginTop: 24, padding: '22px 24px 18px', borderRadius: 28,
    background: C.panel, border: `2px solid ${C.borde}`,
  },
    h('div', { fontSize: 26, color: C.gris, letterSpacing: 3, marginBottom: 6 }, 'MARCAS POR RUTA'),
    h('div', { fontSize: 20, color: C.gris, letterSpacing: 1, padding: '8px 0' },
      h('div', { width: 240 }, 'RUTA'),
      ...eq.marcas.map((mk) => h('div', { width: anchoCol, justifyContent: 'center' }, String(mk.nombre).toUpperCase())),
    ),
    ...eq.rutas.map((r, i) => h('div', {
      alignItems: 'center', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.08)',
    },
      h('div', { width: 240, fontSize: 26, fontWeight: 800 }, `${r.ruta}${r.nombre ? ` · ${primerNombre(r.nombre, r.ruta)}` : ''}`),
      ...eq.marcas.map((mk) => {
        const p0 = pctMarcaRuta(r, mk.clave);
        const p = p0 === null ? null : Math.round(p0);
        return h('div', { width: anchoCol, justifyContent: 'center' },
          h('div', {
            fontSize: 26, fontWeight: 800, color: colorPct(p), padding: '4px 14px', borderRadius: 10,
            background: p === null ? 'transparent' : p >= 100 ? 'rgba(34,197,94,0.14)' : p >= 80 ? 'rgba(245,158,11,0.14)' : 'rgba(239,68,68,0.14)',
          }, p === null ? '—' : `${Math.round(p)}%`),
        );
      }),
    )),
  );
}

export function altoEquipo(eq) {
  const n = eq.marcas.length;
  const marcas = n ? 150 + n * 112 + 150 + eq.rutas.length * 63 : 0;
  return 880 + eq.rutas.length * 112 + marcas;
}

function tarjetaEquipo(eq) {
  const col = eq.esperado !== null && eq.pctMes !== null
    ? colorEstado(eq.pctMes - eq.esperado >= 3 ? 'arriba' : eq.pctMes - eq.esperado >= -5 ? 'ritmo' : 'abajo')
    : C.cian;
  const p = Math.max(0, Math.min(100, eq.pctMes ?? 0));
  const marca = Math.max(0, Math.min(100, eq.esperado ?? 0));
  return h('div', {
    width: '100%', height: '100%', flexDirection: 'column', padding: 56, fontFamily: 'Inter',
    color: C.texto, backgroundImage: `linear-gradient(160deg, ${C.fondo1} 0%, ${C.fondo2} 55%, ${C.fondo1} 100%)`,
  },
    h('div', { justifyContent: 'space-between', alignItems: 'center' },
      h('div', { fontSize: 30, fontWeight: 800, color: C.cian, letterSpacing: 6 }, 'SMART-TRACK'),
      h('div', { fontSize: 30, fontWeight: 800, padding: '10px 26px', borderRadius: 999, border: `3px solid ${C.cian}`, color: C.cian }, 'EQUIPO'),
    ),
    h('div', { fontSize: 60, fontWeight: 800, marginTop: 26 }, 'Resumen del equipo'),
    h('div', { fontSize: 30, color: C.gris, marginTop: 4 }, `Corte del ${eq.fecha ? fechaCorta(eq.fecha) : '—'}`),

    h('div', { marginTop: 30, padding: '30px 40px', borderRadius: 32, background: C.panel, border: `3px solid ${col}`, alignItems: 'center' },
      h('div', { flexDirection: 'column', flex: 1 },
        h('div', { fontSize: 26, color: C.gris, letterSpacing: 4 }, 'AVANCE DEL MES · EQUIPO'),
        h('div', { fontSize: 120, fontWeight: 800, color: col, lineHeight: 1, marginTop: 6 }, pct(eq.pctMes)),
        h('div', { fontSize: 28, marginTop: 8 }, `${cantidad(eq.ventaMes, eq.unidad)} de ${cantidad(eq.objMes, eq.unidad)}`),
        h('div', { position: 'relative', width: '100%', height: 48, marginTop: 14 },
          h('div', { position: 'absolute', left: 0, top: 14, width: '100%', height: 22, borderRadius: 11, background: 'rgba(255,255,255,0.14)' }),
          h('div', { position: 'absolute', left: 0, top: 14, width: `${p}%`, height: 22, borderRadius: 11, background: col }),
          h('div', { position: 'absolute', left: `${marca}%`, top: 2, width: 6, height: 46, marginLeft: -3, borderRadius: 3, background: C.texto }),
        ),
        h('div', { fontSize: 24, color: C.gris, marginTop: 4 }, `Línea blanca = ritmo esperado (${pct(eq.esperado)})`),
      ),
      h('div', { flexDirection: 'column', width: 250, marginLeft: 30, alignItems: 'flex-end' },
        h('div', { fontSize: 24, color: C.gris, letterSpacing: 3 }, 'EN RITMO'),
        h('div', { fontSize: 72, fontWeight: 800, color: C.texto }, `${eq.enRitmo}/${eq.rutas.length}`),
        h('div', { fontSize: 24, color: C.gris, letterSpacing: 3, marginTop: 10 }, 'DÍA EQUIPO'),
        h('div', { fontSize: 56, fontWeight: 800, color: colorPct(eq.pctDia) }, pct(eq.pctDia)),
      ),
    ),

    h('div', { marginTop: 30, padding: '0 24px', fontSize: 22, color: C.gris, letterSpacing: 3 },
      h('div', { width: 60 }, '#'),
      h('div', { width: 270 }, 'RUTA'),
      h('div', { width: 330 }, 'MES'),
      h('div', { width: 150, justifyContent: 'center' }, 'DÍA'),
      h('div', { width: 150, justifyContent: 'center' }, 'EFECT.'),
    ),
    ...eq.rutas.map(filaEquipo),
    bloqueMarcasEquipo(eq),
    matrizMarcas(eq),
  );
}

export default async function handler(req) {
  const q = new URL(req.url).searchParams;
  const ruta = q.get('ruta') || '';
  const fecha = q.get('f') || '';
  if (!/^[A-Za-z0-9 _-]{2,24}$/.test(ruta) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return new Response('parámetros inválidos', { status: 400 });
  }
  if (q.get('s') !== (await firmar(ruta, fecha))) return new Response('firma inválida', { status: 403 });

  const filas = await filasDeFecha(fecha);

  if (ruta === 'EQUIPO') {
    if (!filas.length) return new Response('sin datos', { status: 404 });
    const eq = calcularEquipo(filas, await listaContactos(await configBot()));
    const fe = await cargarFuentes();
    return new ImageResponse(tarjetaEquipo(eq), {
      width: 1080,
      height: altoEquipo(eq),
      ...(fe.length ? { fonts: fe } : {}),
      emoji: 'twemoji',
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const fila = filas.find((f) => f.ruta === ruta);
  if (!fila) return new Response('sin datos', { status: 404 });

  const m = calcular(fila, filas);
  // Nombre real del vendedor (la app guarda la ruta; el nombre vive en vendedores_whatsapp)
  if (!fila.nombre || claveRuta(fila.nombre) === claveRuta(fila.ruta)) {
    try { const c = await contactoPorRuta(ruta); if (c) fila.nombre = c.nombre; } catch { /* sin nombre */ }
  }
  const f = await cargarFuentes();
  return new ImageResponse(tarjeta(fila, m), {
    width: 1080,
    height: altoTarjeta(fila),
    ...(f.length ? { fonts: f } : {}),
    emoji: 'twemoji',
    headers: { 'Cache-Control': 'no-store' },
  });
}
