// api/sin-visita-tabla.js — TABLA (imagen PNG) de clientes sin visita, con los datos que el robot
// bajó de PowerStreet y guardó en sin_visita_pwst (vía /api/sin-visita).
//
//   GET /api/sin-visita-tabla?ruta=GRUPO&t=semana&d=2026-11-09&h=2026-11-14&s=<firma>
//        → tabla del grupo: cuántos clientes le faltan a cada ruta
//   GET /api/sin-visita-tabla?ruta=J201&t=semana&d=2026-11-09&h=2026-11-14&s=<firma>
//        → tabla del vendedor: la lista de SUS clientes que faltan
//
// t = dia | semana · d = desde · h = hasta. La firma (HMAC con BOT_TOKEN) la ponen /api/sin-visita
// y /api/wa-resumen; sin firma válida → 403. Mismo estilo que las tarjetas de /api/tarjeta.

import { ImageResponse } from '@vercel/og';
import { firmar, sb, claveRuta, listaContactos, configBot, primerNombre, horaMX } from './_wa-lib.js';

export const config = { runtime: 'edge' };

const C = {
  fondo1: '#070b18', panel: 'rgba(255,255,255,0.06)', borde: 'rgba(255,255,255,0.10)',
  texto: '#f8fafc', gris: '#94a3b8', cian: '#22d3ee', verde: '#22c55e', ambar: '#f59e0b', rojo: '#ef4444',
};
const MAX_FILAS_VENDEDOR = 40;
// Texto en una sola línea: lo que no cabe se recorta con "…" (nunca se parte en dos renglones)
const UNA_LINEA = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

// Mini "JSX" sin compilador: h(tipo, estilo, ...hijos). Satori exige display:flex.
function h(type, style = {}, ...children) {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  return { type, props: { style: { display: 'flex', flexShrink: 0, ...style }, children: kids.length === 1 ? kids[0] : kids } };
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

const corta = (txt, n) => { const t = String(txt || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
const diaTxt = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).replace('.', '');
const diaMesTxt = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(/\./g, '');
const periodoTxt = (desde, hasta) => (desde === hasta ? diaMesTxt(hasta) : `${diaTxt(desde)} al ${diaMesTxt(hasta)}`);

function marco(pildora, colorPildora, ...hijos) {
  return h('div', {
    width: '100%', height: '100%', flexDirection: 'column', padding: 52, fontFamily: 'Inter',
    color: C.texto, backgroundImage: `linear-gradient(160deg, ${C.fondo1} 0%, #10233a 55%, ${C.fondo1} 100%)`,
  },
    h('div', { justifyContent: 'space-between', alignItems: 'center', height: 64 },
      h('div', { fontSize: 30, fontWeight: 800, color: C.cian, letterSpacing: 6 }, 'SMART-TRACK'),
      h('div', { fontSize: 28, fontWeight: 800, padding: '10px 26px', borderRadius: 999, border: `3px solid ${colorPildora}`, color: colorPildora }, pildora),
    ),
    ...hijos,
  );
}

function caja(etiqueta, valor, sub, color) {
  return h('div', {
    flex: 1, flexDirection: 'column', background: C.panel, border: `2px solid ${C.borde}`, borderRadius: 28, padding: '20px 30px', height: 168,
  },
    h('div', { fontSize: 24, color: C.gris, letterSpacing: 2 }, etiqueta),
    h('div', { fontSize: 64, fontWeight: 800, color, marginTop: 2, lineHeight: 1.1 }, valor),
    h('div', { fontSize: 24, color: C.gris }, sub),
  );
}

// ───────────────────────── Tabla del GRUPO: una fila por ruta ─────────────────────────
const ALTO_FILA_GRUPO = 88;
const altoGrupo = (n) => 52 + 64 + 92 + 46 + 26 + 168 + 26 + (24 + 40 + 44 + n * ALTO_FILA_GRUPO + 24) + 62 + 52;

function tarjetaGrupo({ rutas, desde, hasta, tipo, actualizado }) {
  if (tipo === 'objetivo') return tarjetaObjetivoGrupo({ rutas, hasta, actualizado });
  const total = rutas.reduce((s, r) => s + r.total, 0);
  const completas = rutas.filter((r) => r.total === 0).length;
  const max = Math.max(1, ...rutas.map((r) => r.total));
  const hora = horaMX(actualizado);
  const orden = [...rutas].sort((a, b) => b.total - a.total || a.ruta.localeCompare(b.ruta));
  // Con objetivo de las 7:30: cuántos visitó cada ruta contra su objetivo
  const conObj = rutas.filter((r) => r.objetivo);
  const objTotal = conObj.reduce((s, r) => s + r.objetivo, 0);
  const visTotal = conObj.reduce((s, r) => s + Math.max(r.objetivo - r.total, 0), 0);
  const subRuta = (r) => (r.objetivo ? `${corta(r.nombre, 12)} · ${Math.max(r.objetivo - r.total, 0)} de ${r.objetivo}` : corta(r.nombre, 20));
  return marco('SIN VISITA', C.ambar,
    h('div', { fontSize: 56, fontWeight: 800, marginTop: 22, height: 70 }, 'Clientes sin visita'),
    h('div', { fontSize: 27, color: C.gris, marginTop: 6, height: 40 },
      `${tipo === 'dia' ? 'Ruta del día' : 'Semana'} · ${periodoTxt(desde, hasta)}${hora ? ` · corte ${hora}` : ''} · PowerStreet`),

    h('div', { marginTop: 26, gap: 14 },
      caja('SIN VISITA', String(total), total === 1 ? 'cliente' : 'clientes', total ? C.rojo : C.verde),
      objTotal
        ? caja('VISITADOS', `${visTotal} de ${objTotal}`, `${Math.round((visTotal / objTotal) * 100)}% del objetivo de hoy`, visTotal >= objTotal ? C.verde : C.cian)
        : caja('RUTAS COMPLETAS', `${completas} de ${rutas.length}`, 'sin clientes pendientes', completas === rutas.length ? C.verde : C.texto),
    ),

    h('div', {
      flexDirection: 'column', marginTop: 26, padding: '24px 28px', borderRadius: 28, background: C.panel, border: `2px solid ${C.borde}`,
    },
      h('div', { fontSize: 23, color: C.gris, letterSpacing: 3, height: 40 }, 'POR RUTA · CLIENTES QUE FALTAN POR VISITAR'),
      h('div', { height: 44, alignItems: 'center', fontSize: 20, color: C.gris, letterSpacing: 2, borderBottom: `2px solid ${C.borde}` },
        h('div', { width: 300 }, 'RUTA'),
        h('div', { flex: 1 }, ''),
        h('div', { width: 210, justifyContent: 'flex-end' }, 'SIN VISITA'),
      ),
      ...orden.map((r, i) => h('div', {
        height: ALTO_FILA_GRUPO, alignItems: 'center',
        ...(i < orden.length - 1 ? { borderBottom: `1px solid ${C.borde}` } : {}),
      },
        h('div', { width: 300, flexDirection: 'column' },
          h('div', { fontSize: 32, fontWeight: 800 }, r.ruta),
          h('div', { fontSize: 22, color: C.gris }, subRuta(r)),
        ),
        h('div', { flex: 1, height: 22, borderRadius: 11, background: 'rgba(255,255,255,0.08)' },
          r.total ? h('div', { width: `${Math.max(4, Math.round((r.total / max) * 100))}%`, height: 22, borderRadius: 11, background: C.rojo }) : null,
        ),
        r.total
          ? h('div', { width: 210, justifyContent: 'flex-end', alignItems: 'baseline' },
              h('div', { fontSize: 46, fontWeight: 800, color: C.rojo }, String(r.total)))
          : h('div', { width: 210, justifyContent: 'flex-end', alignItems: 'center' },
              h('div', { width: 18, height: 18, borderRadius: 9, background: C.verde, marginRight: 10 }),
              h('div', { fontSize: 26, fontWeight: 800, color: C.verde }, 'completa')),
      )),
    ),

    h('div', { fontSize: 22, color: C.gris, marginTop: 22, height: 40 },
      'A cada vendedor le llega su lista · detalle por ruta en SMART-TRACK, Sin visita'),
  );
}

// ───────────────────────── 🎯 OBJETIVO de visitas (7:30 am) — grupo ─────────────────────────
function tarjetaObjetivoGrupo({ rutas, hasta, actualizado }) {
  const total = rutas.reduce((s, r) => s + r.total, 0);
  const max = Math.max(1, ...rutas.map((r) => r.total));
  const hora = horaMX(actualizado);
  const orden = [...rutas].sort((a, b) => a.ruta.localeCompare(b.ruta));
  return marco('OBJETIVO', C.cian,
    h('div', { fontSize: 56, fontWeight: 800, marginTop: 22, height: 70 }, 'Objetivo de visitas'),
    h('div', { fontSize: 27, color: C.gris, marginTop: 6, height: 40 }, `Ruta del día · ${periodoTxt(hasta, hasta)}${hora ? ` · ${hora}` : ''} · PowerStreet`),
    h('div', { marginTop: 26, gap: 14 },
      caja('CLIENTES A VISITAR', String(total), 'entre todas las rutas', C.cian),
      caja('RUTAS', String(rutas.length), 'en ruta hoy', C.texto),
    ),
    h('div', { flexDirection: 'column', marginTop: 26, padding: '24px 28px', borderRadius: 28, background: C.panel, border: `2px solid ${C.borde}` },
      h('div', { fontSize: 23, color: C.gris, letterSpacing: 3, height: 40 }, 'POR RUTA · CLIENTES QUE LE TOCAN HOY'),
      h('div', { height: 44, alignItems: 'center', fontSize: 20, color: C.gris, letterSpacing: 2, borderBottom: `2px solid ${C.borde}` },
        h('div', { width: 300 }, 'RUTA'), h('div', { flex: 1 }, ''), h('div', { width: 210, justifyContent: 'flex-end' }, 'OBJETIVO'),
      ),
      ...orden.map((r, i) => h('div', { height: ALTO_FILA_GRUPO, alignItems: 'center', ...(i < orden.length - 1 ? { borderBottom: `1px solid ${C.borde}` } : {}) },
        h('div', { width: 300, flexDirection: 'column' },
          h('div', { fontSize: 32, fontWeight: 800 }, r.ruta),
          h('div', { fontSize: 22, color: C.gris }, corta(r.nombre, 20)),
        ),
        h('div', { flex: 1, height: 22, borderRadius: 11, background: 'rgba(255,255,255,0.08)' },
          r.total ? h('div', { width: `${Math.max(4, Math.round((r.total / max) * 100))}%`, height: 22, borderRadius: 11, background: C.cian }) : null,
        ),
        h('div', { width: 210, justifyContent: 'flex-end', fontSize: 46, fontWeight: 800, color: C.cian }, String(r.total)),
      )),
    ),
    h('div', { fontSize: 22, color: C.gris, marginTop: 22, height: 40 }, 'A cada vendedor le llega su lista · a las 2, 5 y 7 pm se revisa cuántos faltan'),
  );
}

// ───────────────────────── Tabla del VENDEDOR: sus clientes ─────────────────────────
const ALTO_FILA_VEND = 64;
const altoVendedor = (n, sobran) => 52 + 64 + 86 + 46 + 26 + (20 + 44 + Math.max(n, 1) * ALTO_FILA_VEND + 20) + (sobran ? 50 : 0) + 30 + 52;

function tarjetaVendedor({ ruta, nombre, clientes, desde, hasta, tipo, actualizado, objetivo = null }) {
  const hora = horaMX(actualizado);
  const lista = clientes.slice(0, MAX_FILAS_VENDEDOR);
  const sobran = clientes.length - lista.length;
  const n = clientes.length;
  const esObj = tipo === 'objetivo';
  const titulo = esObj
    ? `${nombre ? `${nombre}, tu` : 'Tu'} objetivo: ${n} clientes`
    : n
      ? `${nombre ? `${nombre}, te ` : 'Te '}falta${n === 1 ? '' : 'n'} ${n} cliente${n === 1 ? '' : 's'}`
      : `${nombre ? `${nombre}, sin` : 'Sin'} clientes pendientes`;
  const sub = esObj
    ? `Tu ruta de hoy · ${periodoTxt(hasta, hasta)}${hora ? ` · ${hora}` : ''}`
    : objetivo
      ? `Visitaste ${Math.max(objetivo - n, 0)} de ${objetivo} · ${periodoTxt(desde, hasta)}${hora ? ` · corte ${hora}` : ''}`
      : `${tipo === 'dia' ? 'Ruta del día' : 'Sin visita en la semana'} · ${periodoTxt(desde, hasta)}${hora ? ` · corte ${hora}` : ''}`;
  return marco(ruta, esObj ? C.cian : n ? C.ambar : C.verde,
    h('div', { fontSize: 50, fontWeight: 800, marginTop: 22, height: 64, color: esObj || n ? C.texto : C.verde }, corta(titulo, 36)),
    h('div', { fontSize: 27, color: C.gris, marginTop: 6, height: 40 }, corta(sub, 64)),

    h('div', {
      flexDirection: 'column', marginTop: 26, padding: '20px 26px', borderRadius: 28, background: C.panel, border: `2px solid ${C.borde}`,
    },
      h('div', { height: 44, alignItems: 'center', fontSize: 20, color: C.gris, letterSpacing: 2, borderBottom: `2px solid ${C.borde}` },
        h('div', { width: 44 }, '#'),
        h('div', { width: 176 }, 'CLIENTE'),
        h('div', { flex: 1 }, 'NOMBRE'),
        h('div', { width: 212 }, 'COLONIA'),
        h('div', { width: 62, justifyContent: 'flex-end' }, 'POT.'),
      ),
      ...(lista.length ? lista.map((c, i) => h('div', {
        height: ALTO_FILA_VEND, alignItems: 'center',
        ...(i < lista.length - 1 ? { borderBottom: `1px solid ${C.borde}` } : {}),
      },
        h('div', { width: 44, fontSize: 21, color: C.gris }, String(i + 1)),
        h('div', { width: 176, fontSize: 21, color: C.gris, ...UNA_LINEA }, corta(c.cliente, 12)),
        h('div', { flex: 1, fontSize: 23, fontWeight: 800, marginRight: 16, ...UNA_LINEA }, corta(c.nombre, 30)),
        h('div', { width: 212, fontSize: 20, color: C.gris, ...UNA_LINEA }, corta(c.colonia || c.localidad, 18)),
        h('div', { width: 62, justifyContent: 'flex-end', fontSize: 22, fontWeight: 800, color: C.ambar }, corta(c.potencial, 4)),
      )) : [h('div', { height: ALTO_FILA_VEND, alignItems: 'center', fontSize: 26, color: C.verde, fontWeight: 800 }, 'Todos tus clientes tienen visita')]),
    ),

    sobran ? h('div', { fontSize: 24, color: C.ambar, marginTop: 14, height: 36 }, `…y ${sobran} más: la lista completa está en SMART-TRACK, Sin visita`) : null,
    h('div', { fontSize: 21, color: C.gris, marginTop: 10, height: 30 }, 'Datos de PowerStreet'),
  );
}

export default async function handler(req) {
  const q = new URL(req.url).searchParams;
  const ruta = String(q.get('ruta') || '').toUpperCase();
  const tipo = ['dia', 'objetivo'].includes(q.get('t')) ? q.get('t') : 'semana';
  const desde = q.get('d') || '';
  const hasta = q.get('h') || '';
  const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!/^(GRUPO|J\d{3})$/.test(ruta) || !esFecha(desde) || !esFecha(hasta)) return new Response('parámetros inválidos', { status: 400 });
  if (q.get('s') !== (await firmar(`SV:${ruta}:${tipo}:${desde}`, hasta))) return new Response('firma inválida', { status: 403 });

  const filtroRuta = ruta === 'GRUPO' ? '' : `&ruta=eq.${ruta}`;
  const filas = await sb(`sin_visita_pwst?select=ruta,clientes,total,actualizado_en&fecha=eq.${hasta}&tipo=eq.${tipo}&desde=eq.${desde}&hasta=eq.${hasta}${filtroRuta}`);
  if (!filas.length) return new Response('sin datos', { status: 404 });

  const vendedores = {};
  try {
    for (const c of await listaContactos(await configBot())) if (c.tipo === 'vendedor' && c.activo !== false && c.ruta) vendedores[claveRuta(c.ruta)] = c;
  } catch { /* sin nombres */ }
  const nombreDe = (r) => (vendedores[r]?.nombre ? primerNombre(vendedores[r].nombre, r) : '');
  const actualizado = filas.map((f) => f.actualizado_en).filter(Boolean).sort().pop() || null;
  // Para el corte del día: objetivo de visitas de las 7:30 → "visitó X de N"
  let objetivos = {};
  if (tipo === 'dia') {
    try {
      const o = await sb(`sin_visita_pwst?select=ruta,total&tipo=eq.objetivo&fecha=eq.${hasta}${filtroRuta}`);
      objetivos = Object.fromEntries(o.map((f) => [f.ruta, f.total || 0]));
    } catch { /* sin objetivo */ }
  }
  const fuentesOk = await cargarFuentes();
  const opciones = (alto) => ({ width: 1080, height: alto, ...(fuentesOk.length ? { fonts: fuentesOk } : {}), headers: { 'Cache-Control': 'no-store' } });

  if (ruta === 'GRUPO') {
    const rutas = filas.map((f) => ({ ruta: f.ruta, nombre: nombreDe(f.ruta), total: Array.isArray(f.clientes) ? f.clientes.length : (f.total || 0), objetivo: objetivos[f.ruta] ?? null }));
    return new ImageResponse(tarjetaGrupo({ rutas, desde, hasta, tipo, actualizado }), opciones(altoGrupo(rutas.length)));
  }
  const clientes = Array.isArray(filas[0].clientes) ? filas[0].clientes : [];
  const sobran = clientes.length > MAX_FILAS_VENDEDOR;
  return new ImageResponse(
    tarjetaVendedor({ ruta, nombre: nombreDe(ruta), clientes, desde, hasta, tipo, actualizado, objetivo: objetivos[ruta] ?? null }),
    opciones(altoVendedor(Math.min(clientes.length, MAX_FILAS_VENDEDOR), sobran)),
  );
}
