// api/tarjeta.js — genera la tarjeta PNG (1080×1350) con el avance de una ruta.
//   GET /api/tarjeta?ruta=J201&f=2026-09-28&s=<firma>
// La firma (HMAC con BOT_TOKEN) la pone /api/wa-resumen; sin firma válida → 403.

import { ImageResponse } from '@vercel/og';
import {
  firmar, filasDeFecha, calcular, estadoMes, frase, cantidad, cantidadCorta, pct, fechaCorta, contactoPorRuta,
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
      }, fila.ruta),
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

    // Frase
    h('div', {
      marginTop: 'auto', padding: '22px 30px', borderRadius: 24, fontSize: 30, lineHeight: 1.3,
      background: 'rgba(34,211,238,0.10)', border: `2px solid rgba(34,211,238,0.35)`,
    }, frase(m)),
  );
}

export default async function handler(req) {
  const q = new URL(req.url).searchParams;
  const ruta = q.get('ruta') || '';
  const fecha = q.get('f') || '';
  if (!/^[A-Za-z0-9-]{2,12}$/.test(ruta) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return new Response('parámetros inválidos', { status: 400 });
  }
  if (q.get('s') !== (await firmar(ruta, fecha))) return new Response('firma inválida', { status: 403 });

  const filas = await filasDeFecha(fecha);
  const fila = filas.find((f) => f.ruta === ruta);
  if (!fila) return new Response('sin datos', { status: 404 });

  const m = calcular(fila, filas);
  // Nombre real del vendedor (la app guarda la ruta; el nombre vive en vendedores_whatsapp)
  if (!fila.nombre || fila.nombre.toUpperCase() === fila.ruta.toUpperCase()) {
    try { const c = await contactoPorRuta(ruta); if (c) fila.nombre = c.nombre; } catch { /* sin nombre */ }
  }
  const f = await cargarFuentes();
  return new ImageResponse(tarjeta(fila, m), {
    width: 1080,
    height: 1350,
    ...(f.length ? { fonts: f } : {}),
    emoji: 'twemoji',
    headers: { 'Cache-Control': 'no-store' },
  });
}
