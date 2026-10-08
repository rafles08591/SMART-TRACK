// api/tarjeta.js — genera la tarjeta PNG con el avance de una ruta o del equipo.
//   GET /api/tarjeta?ruta=J201&f=2026-09-28&s=<firma>
//   GET /api/tarjeta?ruta=EQUIPO&f=2026-09-28&s=<firma>   → tarjeta del equipo (Supervisor / Gerente)
// La firma (HMAC con BOT_TOKEN) la pone /api/wa-resumen; sin firma válida → 403.

import { ImageResponse } from '@vercel/og';
import {
  firmar, claveRuta, filasDeFecha, calcular, estadoMes, frase, cantidad, cantidadCorta, pct, fechaCorta, contactoPorRuta,
  configBot, listaContactos, calcularEquipo, primerNombre,
  calcularEquipoDia, rankingDia, fraseDia, marcasDiaDe, horaMX, dinero, sinVualaDe, calcularGrupo, dineroCorto, calcularGrupoDia,
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
function pctMarcaRuta(r, clave, campo = 'marcas') {
  const mk = (r.fila.extra?.[campo] || []).find((x) => (x.clave || x.nombre) === clave);
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

// Color contra el ritmo esperado (indicadores del periodo): en ritmo = verde, hasta 10 pts abajo = ámbar.
function colorRitmo(p, esperado) {
  if (p === null || p === undefined) return C.gris;
  if (esperado === null || esperado === undefined) return colorPct(p);
  if (p >= 100 || p >= esperado) return C.verde;
  return p >= esperado - 10 ? C.ambar : C.rojo;
}
const fondoDe = (col) => (col === C.verde ? 'rgba(34,197,94,0.14)' : col === C.ambar ? 'rgba(245,158,11,0.14)' : col === C.rojo ? 'rgba(239,68,68,0.14)' : 'transparent');

function matrizMarcas(eq, campo = 'marcas', titulo = 'MARCAS POR RUTA', esperado = null) {
  if (!eq.marcas.length) return null;
  const anchoCol = Math.floor(660 / eq.marcas.length);
  return h('div', {
    flexDirection: 'column', marginTop: 24, padding: '22px 24px 18px', borderRadius: 28,
    background: C.panel, border: `2px solid ${C.borde}`,
  },
    h('div', { fontSize: 26, color: C.gris, letterSpacing: 3, marginBottom: 6 }, titulo),
    h('div', { fontSize: 20, color: C.gris, letterSpacing: 1, padding: '8px 0' },
      h('div', { width: 240 }, 'RUTA'),
      ...eq.marcas.map((mk) => h('div', { width: anchoCol, justifyContent: 'center' }, String(mk.nombre).toUpperCase())),
    ),
    ...eq.rutas.map((r, i) => h('div', {
      alignItems: 'center', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.08)',
    },
      h('div', { width: 240, fontSize: 26, fontWeight: 800 }, `${r.ruta}${r.nombre ? ` · ${primerNombre(r.nombre, r.ruta)}` : ''}`),
      ...eq.marcas.map((mk) => {
        const p0 = pctMarcaRuta(r, mk.clave, campo);
        const p = p0 === null ? null : Math.round(p0);
        return h('div', { width: anchoCol, justifyContent: 'center' },
          (() => {
            const col = esperado !== null ? colorRitmo(p, esperado) : colorPct(p);
            return h('div', {
              fontSize: 26, fontWeight: 800, color: col, padding: '4px 14px', borderRadius: 10,
              background: p === null ? 'transparent' : fondoDe(col),
            }, p === null ? '—' : `${Math.round(p)}%`);
          })(),
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

// ------------------------------------------------------------------ tarjetas del AVANCE DEL DÍA
function barra(p, col, alto = 22) {
  return h('div', { position: 'relative', width: '100%', height: alto },
    h('div', { position: 'absolute', left: 0, top: 0, width: '100%', height: alto, borderRadius: alto / 2, background: 'rgba(255,255,255,0.14)' }),
    h('div', { position: 'absolute', left: 0, top: 0, width: `${Math.max(0, Math.min(100, p ?? 0))}%`, height: alto, borderRadius: alto / 2, background: col }),
  );
}

function bloqueMarcasDia(lista, titulo) {
  if (!lista.length) return null;
  return h('div', {
    flexDirection: 'column', marginTop: 24, padding: '24px 32px 28px', borderRadius: 28,
    background: C.panel, border: `2px solid ${C.borde}`,
  },
    h('div', { fontSize: 26, color: C.gris, letterSpacing: 3 }, titulo),
    ...lista.map((mk) => {
      const v = Number(mk.vendido) || 0, o = Number(mk.objetivo) || 0;
      const p = o > 0 ? Math.round((v / o) * 100) : null;
      const col = colorPct(p);
      return h('div', { flexDirection: 'column', marginTop: 16 },
        h('div', { justifyContent: 'space-between', alignItems: 'flex-end' },
          h('div', { fontSize: 30, fontWeight: 800 }, String(mk.nombre || '').toUpperCase()),
          h('div', { fontSize: 28 }, `${miles(v)} / ${miles(o)} paq`),
        ),
        h('div', { marginTop: 8 }, barra(p, col, 16)),
        h('div', { justifyContent: 'space-between', marginTop: 6, fontSize: 24 },
          h('div', { color: v >= o ? C.verde : C.rojo }, v >= o ? '¡Meta del día cumplida!' : `Faltan ${miles(o - v)} paq`),
          h('div', { color: col }, p === null ? '' : `${p}%`),
        ),
      );
    }),
  );
}

function bloqueSinVuala(fila) {
  const sv = sinVualaDe(fila);
  if (!sv) return null;
  const col = sv.cumple ? C.verde : C.rojo;
  const pz = (n) => `${n} pieza${n === 1 ? '' : 's'}`;
  return h('div', {
    flexDirection: 'column', marginTop: 24, padding: '24px 32px', borderRadius: 28,
    background: sv.cumple ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.12)', border: `3px solid ${col}`,
  },
    h('div', { justifyContent: 'space-between', alignItems: 'center' },
      h('div', { flexDirection: 'column' },
        h('div', { fontSize: 26, color: C.gris, letterSpacing: 3 }, 'OTC SIN VUALA'),
        h('div', { fontSize: 64, fontWeight: 800, color: col, marginTop: 4 }, `${sv.piezas} / ${sv.minimo}`),
        h('div', { fontSize: 26, color: C.gris }, 'piezas del día'),
      ),
      h('div', {
        fontSize: 34, fontWeight: 800, color: sv.cumple ? '#04130a' : '#fff', background: col,
        padding: '12px 26px', borderRadius: 999,
      }, sv.cumple ? '✅ CUBIERTO' : '❌ NO CUBIERTO'),
    ),
    sv.cumple ? null : h('div', { fontSize: 30, lineHeight: 1.3, marginTop: 16, color: C.texto },
      sv.piezas === 0
        ? `Hoy no llevas OTC Sin Vuala. Coloca ${pz(sv.falta)} para cubrir el indicador.`
        : `Te ${sv.falta === 1 ? 'falta' : 'faltan'} ${pz(sv.falta)} de OTC Sin Vuala para cubrir el indicador de hoy.`),
  );
}

export function altoDia(fila) {
  const n = marcasDiaDe(fila).length;
  const sv = sinVualaDe(fila);
  return 1400 + (n ? 130 + n * 116 : 0) + (sv ? (sv.cumple ? 210 : 280) : 0);
}

function tarjetaDia(fila, m, companeras) {
  const col = colorPct(m.pctDia === null ? null : Math.round(m.pctDia));
  const falta = Math.max(0, (m.objDia || 0) - (m.ventaDia || 0));
  const r = rankingDia(fila, companeras);
  const otcV = Number(fila.extra?.otc_dia), otcO = Number(fila.extra?.otc_dia_objetivo);
  const hora = horaMX(fila.actualizado_en);
  return h('div', {
    width: '100%', height: '100%', flexDirection: 'column', padding: 64, fontFamily: 'Inter',
    color: C.texto, backgroundImage: `linear-gradient(160deg, ${C.fondo1} 0%, #10233a 55%, ${C.fondo1} 100%)`,
  },
    h('div', { justifyContent: 'space-between', alignItems: 'center' },
      h('div', { fontSize: 30, fontWeight: 800, color: C.cian, letterSpacing: 6 }, 'SMART-TRACK'),
      h('div', { fontSize: 34, fontWeight: 800, padding: '10px 28px', borderRadius: 999, border: `3px solid ${C.cian}`, color: C.cian }, claveRuta(fila.ruta)),
    ),
    h('div', { fontSize: 60, fontWeight: 800, marginTop: 24, lineHeight: 1.15 }, fila.nombre || claveRuta(fila.ruta)),
    h('div', { alignItems: 'center', marginTop: 8, gap: 14 },
      h('div', { fontSize: 26, fontWeight: 800, color: '#04130a', background: C.cian, padding: '6px 16px', borderRadius: 999 }, 'AVANCE DEL DÍA'),
      h('div', { fontSize: 28, color: C.gris }, `${fechaCorta(fila.fecha)}${hora ? ` · corte ${hora}` : ''}`),
    ),

    h('div', { flexDirection: 'column', marginTop: 30, padding: '34px 40px', borderRadius: 36, background: C.panel, border: `3px solid ${col}` },
      h('div', { fontSize: 28, color: C.gris, letterSpacing: 4 }, 'VENTA DE HOY'),
      h('div', { alignItems: 'flex-end', gap: 24, marginTop: 4 },
        h('div', { fontSize: 170, fontWeight: 800, color: col, lineHeight: 1 }, pct(m.pctDia)),
      ),
      h('div', { fontSize: 34, marginTop: 10 }, `${cantidad(m.ventaDia, m.unidad)} de ${cantidad(m.objDia, m.unidad)}`),
      h('div', { marginTop: 20 }, barra(m.pctDia, col, 28)),
      h('div', { fontSize: 28, marginTop: 14, color: falta > 0 ? C.ambar : C.verde, fontWeight: 800 },
        m.objDia ? (falta > 0 ? `Te faltan ${cantidad(falta, m.unidad)}` : '¡Meta del día cumplida! 🎉') : 'Sin meta del día'),
    ),

    h('div', { marginTop: 24, gap: 24 },
      tile('EFECTIVIDAD', pct(m.efectividad), 'del día', colorPct(m.efectividad === null ? null : Math.round(m.efectividad))),
      tile('VISITAS', m.vis === null ? '—' : String(m.vis), 'efectivas hoy', C.texto),
    ),
    h('div', { marginTop: 24, gap: 24 },
      tile('LUGAR HOY', r.lugar ? `#${r.lugar}` : '—', r.total ? `de ${r.total} rutas` : 'ranking del día', r.lugar && r.lugar <= 3 ? C.cian : C.texto),
      tile('OTC HOY', Number.isFinite(otcV) ? dinero(otcV) : '—', otcO > 0 ? `de ${dinero(otcO)}` : 'venta OTC', otcO > 0 ? colorPct(Math.round((otcV / otcO) * 100)) : C.texto),
    ),

    bloqueSinVuala(fila),
    bloqueMarcasDia(marcasDiaDe(fila), 'MARCAS · HOY'),

    h('div', {
      marginTop: 'auto', padding: '22px 30px', borderRadius: 24, fontSize: 30, lineHeight: 1.3,
      background: 'rgba(34,211,238,0.10)', border: '2px solid rgba(34,211,238,0.35)',
    }, fraseDia(m) || '¡Éxito en la ruta!'),
  );
}

export function altoEquipoDia(eq) {
  const n = eq.marcasDia.length;
  return 800 + eq.rutasDia.length * 112 + (n ? 150 + n * 108 + 130 + eq.rutasDia.length * 63 : 0);
}

function tarjetaEquipoDia(eq) {
  const col = colorPct(eq.pctDia === null ? null : Math.round(eq.pctDia));
  const hora = horaMX(eq.actualizado);
  const filaR = (r, i) => {
    const m = r.m;
    const c = colorPct(m.pctDia === null ? null : Math.round(m.pctDia));
    return h('div', {
      alignItems: 'center', padding: '18px 24px', marginTop: 12, borderRadius: 22,
      background: i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.065)',
    },
      h('div', { width: 60, fontSize: 34, fontWeight: 800, color: i < 3 ? C.cian : C.gris }, `${i + 1}`),
      h('div', { width: 220, flexDirection: 'column' },
        h('div', { fontSize: 30, fontWeight: 800 }, r.ruta),
        h('div', { fontSize: 24, color: C.gris }, r.nombre ? primerNombre(r.nombre, r.ruta) : ' '),
      ),
      h('div', { width: 360, flexDirection: 'column', paddingRight: 24 },
        h('div', { justifyContent: 'space-between' },
          h('div', { fontSize: 34, fontWeight: 800, color: c }, pct(m.pctDia)),
          h('div', { fontSize: 24, color: C.gris }, m.objDia ? `${miles(m.ventaDia || 0)}/${miles(m.objDia)}` : `${miles(m.ventaDia || 0)} paq`),
        ),
        h('div', { marginTop: 8 }, barra(m.pctDia, c, 12)),
      ),
      h('div', { width: 110, justifyContent: 'center', fontSize: 30, fontWeight: 800, color: colorPct(m.efectividad === null ? null : Math.round(m.efectividad)) }, pct(m.efectividad)),
      h('div', { width: 100, justifyContent: 'center', fontSize: 30, fontWeight: 800 }, m.vis === null ? '—' : String(m.vis)),
      (() => {
        const sv = sinVualaDe(r.fila);
        return h('div', { width: 110, justifyContent: 'center', fontSize: 28, fontWeight: 800, color: !sv ? C.gris : sv.cumple ? C.verde : C.rojo },
          !sv ? '—' : `${sv.piezas}/${sv.minimo}`);
      })(),
    );
  };
  const eqParaMatriz = { ...eq, marcas: eq.marcasDia, rutas: eq.rutasDia };
  return h('div', {
    width: '100%', height: '100%', flexDirection: 'column', padding: 56, fontFamily: 'Inter',
    color: C.texto, backgroundImage: `linear-gradient(160deg, ${C.fondo1} 0%, #10233a 55%, ${C.fondo1} 100%)`,
  },
    h('div', { justifyContent: 'space-between', alignItems: 'center' },
      h('div', { fontSize: 30, fontWeight: 800, color: C.cian, letterSpacing: 6 }, 'SMART-TRACK'),
      h('div', { fontSize: 30, fontWeight: 800, padding: '10px 26px', borderRadius: 999, border: `3px solid ${C.cian}`, color: C.cian }, 'EQUIPO'),
    ),
    h('div', { fontSize: 58, fontWeight: 800, marginTop: 24 }, 'Avance del día'),
    h('div', { fontSize: 28, color: C.gris, marginTop: 4 }, `${eq.fecha ? fechaCorta(eq.fecha) : ''}${hora ? ` · corte ${hora}` : ''}`),
    h('div', { marginTop: 28, padding: '30px 40px', borderRadius: 32, background: C.panel, border: `3px solid ${col}`, alignItems: 'center' },
      h('div', { flexDirection: 'column', flex: 1 },
        h('div', { fontSize: 26, color: C.gris, letterSpacing: 4 }, 'VENTA DE HOY · EQUIPO'),
        h('div', { fontSize: 120, fontWeight: 800, color: col, lineHeight: 1, marginTop: 6 }, pct(eq.pctDia)),
        h('div', { fontSize: 28, marginTop: 8 }, `${cantidad(eq.ventaDia, eq.unidad)} de ${cantidad(eq.objDia, eq.unidad)}`),
        h('div', { marginTop: 16 }, barra(eq.pctDia, col, 22)),
      ),
      h('div', { flexDirection: 'column', width: 250, marginLeft: 30, alignItems: 'flex-end' },
        h('div', { fontSize: 24, color: C.gris, letterSpacing: 3 }, 'CON META'),
        h('div', { fontSize: 72, fontWeight: 800 }, `${eq.metaCumplida}/${eq.rutasDia.length}`),
        h('div', { fontSize: 24, color: C.gris }, 'rutas'),
      ),
    ),
    h('div', { marginTop: 30, padding: '0 24px', fontSize: 22, color: C.gris, letterSpacing: 3 },
      h('div', { width: 60 }, '#'),
      h('div', { width: 220 }, 'RUTA'),
      h('div', { width: 360 }, 'VENTA DE HOY'),
      h('div', { width: 110, justifyContent: 'center' }, 'EFECT.'),
      h('div', { width: 100, justifyContent: 'center' }, 'VISITAS'),
      h('div', { width: 110, justifyContent: 'center' }, 'SIN V.'),
    ),
    ...eq.rutasDia.map(filaR),
    bloqueMarcasDia(eq.marcasDia, 'MARCAS · HOY · EQUIPO'),
    matrizMarcas(eqParaMatriz, 'marcas_dia', 'MARCAS DE HOY POR RUTA'),
  );
}

// ------------------------------------------------------------------ REPORTE DEL GRUPO (todos los indicadores)
function kpi(etq, valor, sub, color) {
  return h('div', {
    flex: 1, flexDirection: 'column', padding: '18px 22px', borderRadius: 22,
    background: C.panel, border: `2px solid ${C.borde}`,
  },
    h('div', { fontSize: 20, color: C.gris, letterSpacing: 2 }, etq),
    h('div', { fontSize: 50, fontWeight: 800, color, marginTop: 2 }, valor),
    h('div', { fontSize: 20, color: C.gris }, sub),
  );
}

const celda = (txt, color, w = 104) => h('div', { width: w, justifyContent: 'center', fontSize: 26, fontWeight: 800, color }, txt);
const cp = (p) => colorPct(p === null || p === undefined ? null : Math.round(p));

// Celda en unidades coloreada contra el RITMO esperado (indicadores del periodo)
function celdaRitmo(v, o, esperado, w, fmt = miles, abajo = null) {
  const p = o > 0 ? (v / o) * 100 : null;
  const col = o > 0 ? colorRitmo(p, esperado) : C.texto;
  return h('div', { width: w, flexDirection: 'column', alignItems: 'center' },
    h('div', { fontSize: 26, fontWeight: 800, color: col }, fmt(v)),
    h('div', { fontSize: 17, color: C.gris }, abajo ?? (o > 0 ? `de ${fmt(o)}` : ' ')),
  );
}

function cajaRitmo(etq, v, o, esperado, fmt = miles, sufijo = '', sub = null) {
  const p = o > 0 ? (v / o) * 100 : null;
  const col = o > 0 ? colorRitmo(p, esperado) : C.texto;
  return h('div', {
    flex: 1, flexDirection: 'column', padding: '16px 18px', borderRadius: 20,
    background: C.panel, border: `2px solid ${o > 0 ? col + '88' : C.borde}`,
  },
    h('div', { fontSize: 19, color: C.gris, letterSpacing: 2 }, etq),
    h('div', { fontSize: 38, fontWeight: 800, color: col, marginTop: 2 }, `${fmt(v)}${sufijo}`),
    h('div', { fontSize: 19, color: C.gris }, sub ?? (o > 0 ? `de ${fmt(o)}${sufijo}` : ' ')),
  );
}

// "Lo que falta" para una meta del periodo: en verde si ya la cubrió, color de ritmo si no.
function celdaFalta(v, o, esperado, w) {
  if (!(o > 0)) return h('div', { width: w, justifyContent: 'center', color: C.gris }, '—');
  const falta = Math.max(0, o - v);
  const col = falta === 0 ? C.verde : colorRitmo((v / o) * 100, esperado);
  return h('div', { width: w, flexDirection: 'column', alignItems: 'center' },
    h('div', { fontSize: 26, fontWeight: 800, color: col }, falta === 0 ? 'OK' : miles(falta)),
    h('div', { fontSize: 17, color: C.gris }, `meta ${miles(o)}`),
  );
}

function tablaMesUnid(g) {
  const cols = [['VENDIDO', 112], ['FALTA MAX', 104], ['FALTA OPEN', 100], ['FALTA CHAMP', 100], ['X DÍA', 92], ['OTC SEM', 112], ['VISIT.', 84]];
  return h('div', {
    flexDirection: 'column', marginTop: 24, padding: '18px 16px 10px', borderRadius: 26,
    background: C.panel, border: `2px solid ${C.borde}`,
  },
    h('div', { fontSize: 22, color: C.gris, letterSpacing: 3, marginBottom: 6, paddingLeft: 6 }, 'MES POR RUTA · PAQUETES · RANKING GENERAL'),
    h('div', { fontSize: 14, color: C.gris, padding: '8px 0', letterSpacing: 0 },
      h('div', { width: 40, justifyContent: 'center' }, '#'),
      h('div', { width: 140 }, 'RUTA'),
      ...cols.map(([c, w]) => h('div', { width: w, justifyContent: 'center' }, c)),
    ),
    ...g.rutasGrupo.map((r, i) => {
      const esp = r.m.esperado;
      const v = r.maxV;
      return h('div', {
        alignItems: 'center', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.08)',
        background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.025)',
      },
        h('div', { width: 40, justifyContent: 'center', fontSize: 25, fontWeight: 800, color: i < 3 ? C.cian : C.gris }, `${i + 1}`),
        h('div', { width: 140, flexDirection: 'column' },
          h('div', { fontSize: 25, fontWeight: 800 }, r.ruta),
          h('div', { fontSize: 17, color: C.gris }, r.nombre ? primerNombre(r.nombre, r.ruta) : ' '),
        ),
        celdaRitmo(v, r.maxO, esp, 112, miles, r.maxO ? `de ${miles(r.maxO)}` : ' '),
        celdaFalta(v, r.maxO, esp, 104),
        celdaFalta(v, r.openO, esp, 100),
        celdaFalta(v, r.champO, esp, 100),
        h('div', { width: 92, justifyContent: 'center', fontSize: 26, fontWeight: 800, color: C.ambar }, r.porDia ? miles(r.porDia) : '—'),
        celdaRitmo(r.otcSemV, r.otcSemO, null, 112, dineroCorto),
        h('div', { width: 84, justifyContent: 'center', fontSize: 26, fontWeight: 800 }, r.fila.extra?.visitas_periodo != null ? miles(r.fila.extra.visitas_periodo) : '—'),
      );
    }),
    h('div', { fontSize: 17, color: C.gris, padding: '10px 6px 0' },
      'Color contra el ritmo del mes (verde = en ritmo) · FALTA = paquetes para llegar a cada meta · X DÍA = paquetes diarios que necesita para MAX'),
  );
}

function matrizUnid(rutas, marcas, campo, titulo, esperado) {
  if (!marcas.length) return null;
  const ancho = Math.floor(720 / marcas.length);
  return h('div', {
    flexDirection: 'column', marginTop: 24, padding: '20px 22px 14px', borderRadius: 26,
    background: C.panel, border: `2px solid ${C.borde}`,
  },
    h('div', { fontSize: 22, color: C.gris, letterSpacing: 3, marginBottom: 4 }, titulo),
    h('div', { fontSize: 17, color: C.gris, padding: '8px 0' },
      h('div', { width: 200 }, 'RUTA'),
      ...marcas.map((mk) => h('div', { width: ancho, justifyContent: 'center' }, String(mk.nombre).toUpperCase())),
    ),
    ...rutas.map((r) => h('div', { alignItems: 'center', padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)' },
      h('div', { width: 200, fontSize: 24, fontWeight: 800 }, `${r.ruta}${r.nombre ? ` · ${primerNombre(r.nombre, r.ruta)}` : ''}`),
      ...marcas.map((mk) => {
        const x = (r.fila.extra?.[campo] || []).find((y) => (y.clave || y.nombre) === mk.clave);
        if (!x || !(Number(x.objetivo) > 0)) return h('div', { width: ancho, justifyContent: 'center', color: C.gris }, '—');
        return celdaRitmo(Number(x.vendido) || 0, Number(x.objetivo), esperado, ancho);
      }),
    )),
  );
}

function retroGrupo(g) {
  const bajos = g.rutasGrupo.filter((r) => r.indice !== null).slice(-3).reverse();
  if (!bajos.length) return null;
  return h('div', {
    flexDirection: 'column', marginTop: 24, padding: '22px 28px', borderRadius: 26,
    background: 'rgba(239,68,68,0.10)', border: `3px solid ${C.rojo}`,
  },
    h('div', { fontSize: 24, color: C.rojo, letterSpacing: 3, fontWeight: 800 }, 'RETRO · LOS QUE VAN MÁS BAJO'),
    ...bajos.map((r) => h('div', { flexDirection: 'column', marginTop: 14 },
      h('div', { fontSize: 28, fontWeight: 800 }, `${r.ruta}${r.nombre ? ` · ${primerNombre(r.nombre, r.ruta)}` : ''}`),
      h('div', { flexWrap: 'wrap', gap: 10, marginTop: 6 },
        ...(r.faltas.length ? r.faltas.slice(0, 4) : ['va parejo, falta empujar']).map((f) =>
          h('div', { fontSize: 21, color: '#fecaca', background: 'rgba(239,68,68,0.18)', padding: '6px 14px', borderRadius: 999 }, f)),
      ),
    )),
  );
}

export function altoGrupo(g, gd) {
  const n = g.rutasGrupo.length;
  const mOpen = g.marcas.length ? 130 + n * 78 : 0;
  const mChamp = g.marcasChamp.length ? 130 + n * 78 : 0;
  return 330 + 2 * 150 + 40 + (150 + n * 88) + mOpen + mChamp + (gd ? 140 + gd.rutas.length * 92 : 0) + 120 + 3 * 95 - 140;
}

function tarjetaGrupo(g, gd) {
  const esp = g.esperado;
  const ritmoPaq = esp !== null ? (g.maxO * esp) / 100 : null;
  const falta = Math.max(0, g.maxO - g.maxV);
  return h('div', {
    width: '100%', height: '100%', flexDirection: 'column', padding: 56, fontFamily: 'Inter',
    color: C.texto, backgroundImage: `linear-gradient(160deg, ${C.fondo1} 0%, ${C.fondo2} 55%, ${C.fondo1} 100%)`,
  },
    h('div', { justifyContent: 'space-between', alignItems: 'center' },
      h('div', { fontSize: 30, fontWeight: 800, color: C.cian, letterSpacing: 6 }, 'SMART-TRACK'),
      h('div', { fontSize: 30, fontWeight: 800, padding: '10px 26px', borderRadius: 999, border: `3px solid ${C.cian}`, color: C.cian }, 'GRUPO'),
    ),
    h('div', { fontSize: 56, fontWeight: 800, marginTop: 22 }, 'Reporte del equipo'),
    h('div', { fontSize: 27, color: C.gris, marginTop: 4 },
      `Corte del ${g.fecha ? fechaCorta(g.fecha) : '—'}${ritmoPaq !== null ? ` · al ritmo deberían llevar ${miles(ritmoPaq)} paq` : ''}`),

    h('div', { marginTop: 26, gap: 14 },
      cajaRitmo('MAX · VENDIDO', g.maxV, g.maxO, esp, miles, ' paq'),
      cajaRitmo('AL RITMO', ritmoPaq ?? 0, 0, null, miles, ' paq', 'deberían llevar a la fecha'),
      cajaRitmo('FALTAN', falta, 0, null, miles, ' paq', g.porDiaTot ? `${miles(g.porDiaTot)} paq por día` : ' '),
    ),
    h('div', { marginTop: 14, gap: 14 },
      cajaRitmo('META OPEN', g.openO, g.openO, esp, miles, ' paq', `faltan ${miles(Math.max(0, g.openO - g.maxV))} paq`),
      cajaRitmo('META CHAMPIONS', g.champO, g.champO, esp, miles, ' paq', `faltan ${miles(Math.max(0, g.champO - g.maxV))} paq`),
      cajaRitmo('OTC SEMANA', g.otcSemV, g.otcSemO, null, dineroCorto),
    ),

    tablaMesUnid(g),
    matrizUnid(g.rutasGrupo, g.marcas, 'marcas', 'MARCAS OPEN · PAQUETES DEL MES (vendido / meta)', esp),
    matrizUnid(g.rutasGrupo, g.marcasChamp, 'marcas_champions', 'CHAMPIONS · PAQUETES DEL MES (vendido / meta)', esp),
    gd ? tablaDiaUnid(gd, `CIERRE DEL ${g.fecha ? fechaCorta(g.fecha).toUpperCase() : 'DÍA'} · VENDIDO / META DEL DÍA`) : null,
    retroGrupo(g),
  );
}

// ------------------------------------------------------------------ GRUPO · AVANCE DEL DÍA en unidades (sin %)
const colCumpl = (v, o) => (!(o > 0) ? C.texto : v >= o ? C.verde : v >= o * 0.8 ? C.ambar : C.rojo);

function celdaUnid(v, o, w, fmt = miles) {
  const col = colCumpl(v, o);
  return h('div', { width: w, flexDirection: 'column', alignItems: 'center' },
    h('div', { fontSize: 27, fontWeight: 800, color: col }, fmt(v)),
    h('div', { fontSize: 18, color: C.gris }, o > 0 ? `de ${fmt(o)}` : ' '),
  );
}

function totalBox(etq, v, o, fmt = miles, sufijo = '') {
  return h('div', {
    flex: 1, flexDirection: 'column', padding: '16px 18px', borderRadius: 20,
    background: C.panel, border: `2px solid ${o > 0 ? colCumpl(v, o) + '88' : C.borde}`,
  },
    h('div', { fontSize: 19, color: C.gris, letterSpacing: 2 }, etq),
    h('div', { fontSize: 40, fontWeight: 800, color: colCumpl(v, o), marginTop: 2 }, `${fmt(v)}${sufijo}`),
    h('div', { fontSize: 19, color: C.gris }, o > 0 ? `de ${fmt(o)}${sufijo}` : ' '),
  );
}


function tablaDiaUnid(g, titulo) {
  const abrevia = (n) => String(n).replace('BLOSSOM', 'BLOSS').replace('SUMMER', 'SUMM').replace(' MIX', '');
  const cols = [['VOLUMEN', 112], ...g.claves.map((k) => [abrevia(g.nombres[k]), 98]), ['OTC $', 112], ['S/VUALA', 92], ['VISIT.', 80]];
  const dineroK = (n) => dineroCorto(n);
  return h('div', {
      flexDirection: 'column', marginTop: 24, padding: '18px 14px 10px', borderRadius: 26,
      background: C.panel, border: `2px solid ${C.borde}`,
    },
      h('div', { fontSize: 22, color: C.gris, letterSpacing: 3, marginBottom: 6, paddingLeft: 8 }, titulo),
      h('div', { fontSize: 17, color: C.gris, padding: '8px 0' },
        h('div', { width: 150, paddingLeft: 8 }, 'RUTA'),
        ...cols.map(([c, w]) => h('div', { width: w, justifyContent: 'center' }, c)),
      ),
      ...g.rutas.map((r, i) => h('div', {
        alignItems: 'center', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.08)',
        background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.025)',
      },
        h('div', { width: 150, flexDirection: 'column', paddingLeft: 8 },
          h('div', { fontSize: 26, fontWeight: 800 }, r.ruta),
          h('div', { fontSize: 18, color: C.gris }, r.nombre ? primerNombre(r.nombre, r.ruta) : ' '),
        ),
        celdaUnid(r.vol.v, r.vol.o, 112),
        ...g.claves.map((k) => celdaUnid(r.marcas[k]?.v || 0, r.marcas[k]?.o || 0, 98)),
        celdaUnid(r.otc.v, r.otc.o, 112, dineroK),
        r.sv ? celdaUnid(r.sv.piezas, r.sv.minimo, 92, String) : h('div', { width: 92, justifyContent: 'center', color: C.gris }, '—'),
        h('div', { width: 80, justifyContent: 'center', fontSize: 27, fontWeight: 800 }, r.vis === null ? '—' : String(r.vis)),
      )),
      h('div', { fontSize: 18, color: C.gris, padding: '10px 8px 0' }, 'Verde = ya cubrió la meta del día · ámbar = 80% o más · rojo = abajo'),
    );
}

export function altoGrupoDia(g) {
  return 330 + 2 * 150 + 40 + 120 + g.rutas.length * 92 + 60 + 150 + 3 * 100 + 60;
}

function tarjetaGrupoDia(g) {
  const hora = horaMX(g.actualizado);
  const abrevia = (n) => String(n).replace('BLOSSOM', 'BLOSS').replace('SUMMER', 'SUMM').replace(' MIX', '');
  const cols = [['VOLUMEN', 112], ...g.claves.map((k) => [abrevia(g.nombres[k]), 98]), ['OTC $', 112], ['S/VUALA', 92], ['VISIT.', 80]];
  const bajos = [...g.rutas].filter((r) => r.cumpl !== null).sort((a, b) => a.cumpl - b.cumpl).slice(0, 3);
  const dineroK = (n) => dineroCorto(n);
  return h('div', {
    width: '100%', height: '100%', flexDirection: 'column', padding: 52, fontFamily: 'Inter',
    color: C.texto, backgroundImage: `linear-gradient(160deg, ${C.fondo1} 0%, #10233a 55%, ${C.fondo1} 100%)`,
  },
    h('div', { justifyContent: 'space-between', alignItems: 'center' },
      h('div', { fontSize: 30, fontWeight: 800, color: C.cian, letterSpacing: 6 }, 'SMART-TRACK'),
      h('div', { fontSize: 30, fontWeight: 800, padding: '10px 26px', borderRadius: 999, border: `3px solid ${C.cian}`, color: C.cian }, 'GRUPO'),
    ),
    h('div', { fontSize: 56, fontWeight: 800, marginTop: 22 }, 'Avance del día'),
    h('div', { fontSize: 28, color: C.gris, marginTop: 4 }, `${g.fecha ? fechaCorta(g.fecha) : ''}${hora ? ` · corte ${hora}` : ''} · paquetes vendidos hoy`),

    h('div', { marginTop: 26, gap: 14 },
      totalBox('VOLUMEN', g.vol.v, g.vol.o, miles, ' paq'),
      totalBox('OTC', g.otc.v, g.otc.o, dineroK),
      totalBox('SIN VUALA', g.svCubiertas, g.rutas.length, String, ' rutas'),
      totalBox('VISITAS', g.visitas, 0, miles),
    ),
    h('div', { marginTop: 14, gap: 14 },
      ...g.marcasTot.map((m) => totalBox(m.nombre, m.v, m.o, miles)),
    ),

    tablaDiaUnid(g, 'POR RUTA · VENDIDO HOY / META DEL DÍA'),

    bajos.length ? h('div', {
      flexDirection: 'column', marginTop: 24, padding: '22px 28px', borderRadius: 26,
      background: 'rgba(239,68,68,0.10)', border: `3px solid ${C.rojo}`,
    },
      h('div', { fontSize: 24, color: C.rojo, letterSpacing: 3, fontWeight: 800 }, 'RETRO · LO QUE LES FALTA HOY'),
      ...bajos.map((r) => h('div', { flexDirection: 'column', marginTop: 14 },
        h('div', { fontSize: 28, fontWeight: 800 }, `${r.ruta}${r.nombre ? ` · ${primerNombre(r.nombre, r.ruta)}` : ''}`),
        h('div', { flexWrap: 'wrap', gap: 10, marginTop: 6 },
          ...(r.faltas.length ? r.faltas.slice(0, 5) : ['ya cumplió todo hoy 💪']).map((f) =>
            h('div', { fontSize: 22, color: '#fecaca', background: 'rgba(239,68,68,0.18)', padding: '6px 14px', borderRadius: 999 }, f)),
        ),
      )),
    ) : null,
  );
}

export default async function handler(req) {
  const q = new URL(req.url).searchParams;
  const ruta = q.get('ruta') || '';
  const fecha = q.get('f') || '';
  if (!/^[A-Za-z0-9 _-]{2,24}$/.test(ruta) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return new Response('parámetros inválidos', { status: 400 });
  }
  const tipo = q.get('t') === 'dia' ? 'dia' : '';
  if (q.get('s') !== (await firmar(tipo ? `DIA:${ruta}` : ruta, fecha))) return new Response('firma inválida', { status: 403 });

  const filas = await filasDeFecha(fecha);

  if (ruta === 'GRUPO' && tipo === 'dia') {
    if (!filas.length) return new Response('sin datos', { status: 404 });
    const g = calcularGrupoDia(filas, await listaContactos(await configBot()));
    const fg = await cargarFuentes();
    return new ImageResponse(tarjetaGrupoDia(g), {
      width: 1080, height: altoGrupoDia(g), ...(fg.length ? { fonts: fg } : {}), emoji: 'twemoji',
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (ruta === 'GRUPO') {
    if (!filas.length) return new Response('sin datos', { status: 404 });
    const cts = await listaContactos(await configBot());
    const g = calcularGrupo(filas, cts);
    const gd = calcularGrupoDia(filas, cts);
    const fg = await cargarFuentes();
    return new ImageResponse(tarjetaGrupo(g, gd), {
      width: 1080, height: altoGrupo(g, gd), ...(fg.length ? { fonts: fg } : {}), emoji: 'twemoji',
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (ruta === 'EQUIPO' && tipo === 'dia') {
    if (!filas.length) return new Response('sin datos', { status: 404 });
    const eq = calcularEquipoDia(filas, await listaContactos(await configBot()));
    const fe = await cargarFuentes();
    return new ImageResponse(tarjetaEquipoDia(eq), {
      width: 1080, height: altoEquipoDia(eq), ...(fe.length ? { fonts: fe } : {}), emoji: 'twemoji',
      headers: { 'Cache-Control': 'no-store' },
    });
  }

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
  if (tipo === 'dia') {
    return new ImageResponse(tarjetaDia(fila, m, filas), {
      width: 1080, height: altoDia(fila), ...(f.length ? { fonts: f } : {}), emoji: 'twemoji',
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return new ImageResponse(tarjeta(fila, m), {
    width: 1080,
    height: altoTarjeta(fila),
    ...(f.length ? { fonts: f } : {}),
    emoji: 'twemoji',
    headers: { 'Cache-Control': 'no-store' },
  });
}
