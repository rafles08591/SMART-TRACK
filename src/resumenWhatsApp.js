// src/utils/resumenWhatsApp.js
// Guarda en Supabase (tabla resumen_vendedores) el resumen por ruta que usa el
// bot de WhatsApp. Se llama desde App.tsx con los MISMOS números que ya calcula
// la app, así el bot nunca dice algo distinto a lo que se ve en pantalla.
//
// Solo debe ejecutarse en sesiones de Gerente / Supervisores (quien carga datos).

import { useEffect, useRef } from 'react';

const CAMPOS_NUM = [
  'venta_dia', 'objetivo_dia', 'venta_mes', 'objetivo_mes',
  'efectividad_pct', 'clientes_programados', 'clientes_visitados',
];

export function fechaHoyMX() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

const aNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

function limpiar(filas, fecha, quien) {
  return (filas || [])
    .filter((f) => f && f.ruta)
    .map((f) => {
      const out = {
        ruta: String(f.ruta).toUpperCase(),
        fecha: f.fecha || fecha,
        nombre: f.nombre || null,
        extra: f.extra || {},
        actualizado_por: quien || null,
        actualizado_en: new Date().toISOString(),
      };
      for (const c of CAMPOS_NUM) out[c] = aNum(f[c]);
      if (out.clientes_programados !== null) out.clientes_programados = Math.round(out.clientes_programados);
      if (out.clientes_visitados !== null) out.clientes_visitados = Math.round(out.clientes_visitados);
      return out;
    })
    // no guardar filas completamente vacías
    .filter((f) => CAMPOS_NUM.some((c) => f[c] !== null));
}

const huella = (filas) =>
  JSON.stringify(filas.map(({ actualizado_en, actualizado_por, ...r }) => r));

/**
 * Upsert directo. Devuelve { ok, guardadas, error }.
 * filas: [{ ruta, nombre, venta_dia, objetivo_dia, venta_mes, objetivo_mes,
 *           efectividad_pct, clientes_programados, clientes_visitados, extra? , fecha? }]
 */
export async function guardarResumenVendedores(supabase, filas, { quien, fecha } = {}) {
  const limpias = limpiar(filas, fecha || fechaHoyMX(), quien);
  if (!limpias.length) return { ok: true, guardadas: 0 };
  const { error } = await supabase
    .from('resumen_vendedores')
    .upsert(limpias, { onConflict: 'ruta,fecha' });
  if (error) console.warn('[resumenWhatsApp] error al guardar:', error.message);
  return { ok: !error, guardadas: error ? 0 : limpias.length, error };
}

/**
 * Hook: guarda automáticamente cuando cambian los números (con debounce y
 * sin reescribir si nada cambió).
 */
export function useSnapshotWhatsApp({ supabase, filas, habilitado, quien, fecha, esperaMs = 4000, onGuardado }) {
  const onGuardadoRef = useRef(onGuardado);
  onGuardadoRef.current = onGuardado;
  const ultima = useRef(null);
  useEffect(() => {
    if (!habilitado || !supabase) return undefined;
    const limpias = limpiar(filas, fecha || fechaHoyMX(), quien);
    if (!limpias.length) return undefined;
    const h = huella(limpias);
    if (h === ultima.current) return undefined;
    const t = setTimeout(async () => {
      const r = await guardarResumenVendedores(supabase, filas, { quien, fecha });
      if (r.ok) {
        ultima.current = h;
        try { onGuardadoRef.current?.(); } catch { /* nada */ }
      }
    }, esperaMs);
    return () => clearTimeout(t);
  }, [supabase, filas, habilitado, quien, fecha, esperaMs]);
}

/**
 * Pide al bot que mande la tarjeta del AVANCE DEL DÍA por WhatsApp.
 * La llama App.tsx después de cargar el Avance del día.
 */
export async function dispararAvanceDia(supabase) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return { ok: false, error: "sin sesión" };
    const res = await fetch("/api/wa-disparar", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tipo: "dia" }),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok || r.ok === false) console.warn("[resumenWhatsApp] avance del día no enviado:", r.error || res.status);
    return r;
  } catch (err) {
    console.warn("[resumenWhatsApp] error al disparar avance del día:", err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  }
}
