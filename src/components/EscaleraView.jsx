// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import {
  Flag, Trophy, Zap, CheckCircle2, Circle, SkipForward,
  ArrowUpNarrowWide, ArrowDownWideNarrow, ChevronDown, ChevronUp, PartyPopper, Sunrise, MessageSquare,
} from "lucide-react";
import { MARCAS_DIA } from "../constants";
import { fmt } from "../utils";

/* -----------------------------------------------------------------------
   TIPS — banco de consejos de venta. Se muestran según el tipo de peldaño
   en el que esté parado el vendedor. Los tips por marca están escritos
   para las 4 marcas de MARCAS_DIA (Ice Mix, Bloss Mix, Summ Mix, Faronet);
   si en el futuro se agrega una marca nueva que no esté aquí, cae
   automáticamente al set genérico (TIPS_GENERALES) para que el módulo
   nunca se quede sin consejos que mostrar.
------------------------------------------------------------------------ */
const TIPS_GENERALES = [
  "Revisa MESA DE CONTROL antes de salir: ahí ves quién no ha comprado esta semana, tu oportunidad más rápida de cerrar hoy mismo.",
  "Ofrece siempre el combo o exhibidor antes que la pieza suelta — sube tu ticket promedio sin necesitar clientes nuevos.",
  "Pide espacio de exhibición en el mostrador: un producto visible se vende solo, incluso cuando ya te fuiste.",
  "Revisa SIN VISITA — son clientes que ya te conocen y solo necesitan que vuelvas a tocar la puerta hoy.",
  "Si un cliente no compra la marca que necesitas empujar hoy, pregúntale qué le falta: precio, exhibición o rotación.",
];

const TIPS_MARCA = {
  iceMix: [
    "Ice Mix se mueve mejor en puntos con tráfico joven: tiendas cerca de escuelas, gimnasios o zonas de oficinas.",
    "Úsala como upsell cuando el cliente ya pidió otra variedad: \"llévate también esta, es la que más está rotando esta semana\".",
    "Si el cliente ya la conoce pero no repite, pregunta si le falta exhibición o refrigeración — Ice Mix se vende por impulso.",
  ],
  blossMix: [
    "Bloss Mix funciona muy bien como segunda opción cuando el cliente ya compró Summ Mix — son complementarias, no compiten entre sí.",
    "Destaca el sabor floral/frutal en tu pitch, es el gancho principal contra la competencia genérica.",
    "En clientes que solo compran una marca, ofrece piezas chicas de prueba antes de pedir volumen completo.",
  ],
  summMix: [
    "Summ Mix suele salir mejor con exhibidor visible en mostrador — negocia el espacio antes de dejar el pedido.",
    "Aprovecha el clima cálido para empujarla con el mensaje de \"sabor de temporada\".",
    "Si el cliente ya la tiene pero en poca cantidad, sugiere subir el pedido de hoy con el argumento de rotación.",
  ],
  faronet: [
    "Faronet responde bien a clientes fieles de marca — prioriza hoy las tiendas donde ya tienes buena relación antes de ir a clientes fríos.",
    "Explícale al dueño el margen del punto de venta, no solo el precio al público — a muchos les convence más el margen.",
    "Ofrécela en combo con la marca que más rota en esa tienda para asegurar que se mueva junto.",
  ],
};

const TIPS_OTC = [
  "OTC se mide en pesos, no en piezas — hoy enfócate en 1 o 2 tickets grandes (exhibidor, carga completa) más que en muchas visitas sueltas.",
  "Revisa qué clientes de tu ruta de hoy suelen tener ticket promedio alto y visítalos primero.",
  "Un solo cliente grande puede cerrarte el peldaño de OTC de hoy — no lo dejes para el final del recorrido.",
];

const TIPS_VOLUMEN_TOTAL = [
  "Este peldaño suma TODO lo que vendes hoy, sin importar la marca — cualquier pieza que muevas te acerca a él.",
  "No dependas de un solo cliente para llegar: reparte tus visitas de hoy entre varios puntos.",
  ...TIPS_GENERALES.slice(0, 2),
];

function tipsPara(peldano) {
  if (peldano.tipo === "otc") return TIPS_OTC;
  if (peldano.tipo === "total") return TIPS_VOLUMEN_TOTAL;
  return TIPS_MARCA[peldano.marcaKey] || TIPS_GENERALES;
}

/* -----------------------------------------------------------------------
   Construcción de peldaños a partir de los objetivos DEL DÍA de hoy
   (vendedor.hoy — los mismos que alimentan la pestaña DÍA). Se recalculan
   solos cada vez que cambia la fecha: mañana es una escalera nueva. El
   avance nunca se marca "a mano": un peldaño se da por conquistado solo
   cuando la venta real de HOY ya llegó al 100% de su meta de hoy.
   Estas funciones se exportan para que EscaleraStaffView (Supervisor-1 /
   Gerente) pueda reutilizar exactamente la misma lógica ruta por ruta.
------------------------------------------------------------------------ */
export function pct(vendido, objetivo) {
  return objetivo > 0 ? Math.min((vendido / objetivo) * 100, 100) : 0;
}

export function construirPeldanos(vendedor) {
  const hoy = vendedor?.hoy;
  const peldanos = [];
  if (!hoy) return peldanos;

  if (hoy.volumen?.objetivo > 0) {
    const { objetivo, vendido } = hoy.volumen;
    peldanos.push({ id: "dia_volumen", tipo: "total", grupo: "VOLUMEN DEL DÍA", label: "Volumen de hoy", unit: "units", objetivo, avance: vendido, restante: Math.max(objetivo - vendido, 0), pct: pct(vendido, objetivo) });
  }
  MARCAS_DIA.forEach((m) => {
    const info = hoy.marcas?.[m.key];
    if (info && info.objetivo > 0) {
      peldanos.push({ id: `dia_${m.key}`, tipo: "marca", marcaKey: m.key, grupo: "MARCA DEL DÍA", label: m.label, unit: "units", objetivo: info.objetivo, avance: info.vendido, restante: Math.max(info.objetivo - info.vendido, 0), pct: pct(info.vendido, info.objetivo) });
    }
  });
  if (hoy.otc?.objetivo > 0) {
    const { objetivo, vendido } = hoy.otc;
    peldanos.push({ id: "dia_otc", tipo: "otc", grupo: "OTC DEL DÍA", label: "OTC de hoy", unit: "money", objetivo, avance: vendido, restante: Math.max(objetivo - vendido, 0), pct: pct(vendido, objetivo) });
  }
  return peldanos;
}

export function ordenarPeldanos(peldanos, orden) {
  const copia = [...peldanos];
  // "Fácil primero" = el que menos le falta por avance porcentual primero.
  // "Difícil primero" = el que menos ha avanzado (más lejos de su meta) primero.
  copia.sort((a, b) => (orden === "facil" ? b.pct - a.pct : a.pct - b.pct));
  return copia;
}

export const COLOR_GRUPO = { "VOLUMEN DEL DÍA": "#7CC4FF", "MARCA DEL DÍA": "#3DDC97", "OTC DEL DÍA": "#F2B134" };

/* -----------------------------------------------------------------------
   Efectos visuales — keyframes compartidos, la escalera SVG animada y el
   confeti de celebración. Todo en CSS/SVG puro, sin librerías nuevas.
------------------------------------------------------------------------ */
function EscaleraEstilos() {
  return (
    <style>{`
      @keyframes escGlowPulso { 0%,100% { box-shadow: 0 0 0px rgba(242,177,52,0); } 50% { box-shadow: 0 0 18px rgba(242,177,52,0.45); } }
      @keyframes escPasoGlow { 0%,100% { filter: drop-shadow(0 0 2px rgba(242,177,52,0.5)); } 50% { filter: drop-shadow(0 0 7px rgba(242,177,52,0.9)); } }
      @keyframes escCaminante { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      @keyframes escBandera { 0%,100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }
      @keyframes escConfeti { 0% { transform: translateY(-8px) rotate(0deg); opacity: 1; } 100% { transform: translateY(110px) rotate(360deg); opacity: 0; } }
      @keyframes escPopIn { 0% { transform: scale(0.85); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      .esc-pop-in { animation: escPopIn .35s ease-out; }
      .esc-glow-actual { animation: escGlowPulso 2.2s ease-in-out infinite; }
    `}</style>
  );
}

// Escalera dibujada en SVG: cada peldaño real se representa como un
// escalón ascendente. El peldaño actual "brilla" y tiene un caminante
// animado encima; la bandera de la cima ondea solo cuando ya se conquistó
// todo. Es puramente decorativo — el estado real vive en `pasos`.
function EscaleraSVG({ pasos, idActual }) {
  const n = pasos.length;
  if (n === 0) return null;
  const stepW = 58;
  const stepH = 20;
  const baseH = 34;
  const width = n * stepW + 30;
  const height = baseH + n * stepH + 34;
  const todoConquistado = pasos.every((p) => p.pct >= 100);

  return (
    <div style={{ width: "100%", overflowX: pasos.length > 8 ? "auto" : "visible" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width={Math.max(width, 220)} height={Math.min(height, 190)} style={{ display: "block", margin: "0 auto" }}>
        {pasos.map((p, i) => {
          const x = 14 + i * stepW;
          const stepTop = height - 18 - (i + 1) * stepH;
          const stepBottom = height - 18;
          const hecho = p.pct >= 100;
          const esActual = p.id === idActual;
          const trazo = hecho ? "#3DDC97" : esActual ? "#F2B134" : "#2A3852";
          const relleno = hecho ? "rgba(61,220,151,0.16)" : esActual ? "rgba(242,177,52,0.18)" : "rgba(255,255,255,0.03)";
          return (
            <g key={p.id} style={esActual ? { animation: "escPasoGlow 2.2s ease-in-out infinite" } : undefined}>
              <rect x={x} y={stepTop} width={stepW - 8} height={stepBottom - stepTop} rx={4} fill={relleno} stroke={trazo} strokeWidth={esActual ? 2 : 1.2} />
              <text x={x + (stepW - 8) / 2} y={stepTop + 14} textAnchor="middle" fontSize="10" fontWeight="700" fill={trazo}>{i + 1}</text>
              {hecho && (
                <text x={x + (stepW - 8) / 2} y={stepTop + 27} textAnchor="middle" fontSize="11">✓</text>
              )}
              {esActual && (
                <text x={x + (stepW - 8) / 2} y={stepTop - 8} textAnchor="middle" fontSize="16" style={{ animation: "escCaminante 1s ease-in-out infinite" }}>🚶</text>
              )}
              {i === n - 1 && (
                <text
                  x={x + (stepW - 8) / 2}
                  y={stepTop - (esActual ? 26 : 8)}
                  textAnchor="middle"
                  fontSize="16"
                  style={{
                    opacity: todoConquistado ? 1 : 0.3,
                    transformBox: "fill-box",
                    transformOrigin: "center",
                    animation: todoConquistado ? "escBandera 1.6s ease-in-out infinite" : undefined,
                  }}
                >
                  🚩
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Confeti simple para la celebración de escalera completa — puras
// posiciones/animación CSS, sin dependencias externas.
function Confeti() {
  const piezas = Array.from({ length: 16 });
  const colores = ["#F2B134", "#3DDC97", "#7CC4FF", "#FF6B6B"];
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {piezas.map((_, i) => (
        <span
          key={i}
          style={{
            position: "absolute", top: 0, left: `${(i / piezas.length) * 100}%`,
            width: 6, height: 10, borderRadius: 2, background: colores[i % colores.length],
            animation: `escConfeti ${1.3 + (i % 5) * 0.15}s ease-in ${(i % 7) * 0.12}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export default function EscaleraView({ data, persistFresco, vendedor, rutaPropia }) {
  const fechaHoy = vendedor?.hoy?.fecha || null;
  const peldanos = useMemo(() => construirPeldanos(vendedor), [vendedor]);
  const progresoGuardado = data.escaleraProgreso?.[rutaPropia] || null;
  // Si cambió el día (o nunca se había abierto), el conteo de saltos y el
  // puntero se reinician solos — pero se conserva la preferencia de orden
  // (fácil/difícil) que el vendedor ya había elegido, para no preguntarle
  // cada mañana lo mismo.
  const progreso = useMemo(() => {
    if (!progresoGuardado) return null;
    if (progresoGuardado.fecha === fechaHoy) return progresoGuardado;
    return { orden: progresoGuardado.orden, fecha: fechaHoy, pasoActualId: null, saltos: 0, saltados: [], diasCompletos: progresoGuardado.diasCompletos || 0, fechaUltimoDiaCompleto: progresoGuardado.fechaUltimoDiaCompleto || null };
  }, [progresoGuardado, fechaHoy]);

  const [verTodos, setVerTodos] = useState(false);
  const [celebrar, setCelebrar] = useState(null);

  function guardarProgreso(cambios) {
    persistFresco((fresca) => {
      const actual = fresca.escaleraProgreso || {};
      const propioGuardado = actual[rutaPropia] || {};
      const propioBase = propioGuardado.fecha === fechaHoy
        ? propioGuardado
        : { orden: propioGuardado.orden, fecha: fechaHoy, pasoActualId: null, saltos: 0, saltados: [], diasCompletos: propioGuardado.diasCompletos || 0, fechaUltimoDiaCompleto: propioGuardado.fechaUltimoDiaCompleto || null };
      return { escaleraProgreso: { ...actual, [rutaPropia]: { ...propioBase, ...cambios, fecha: fechaHoy } } };
    });
  }

  const ordenados = useMemo(
    () => (progreso?.orden ? ordenarPeldanos(peldanos, progreso.orden) : []),
    [peldanos, progreso?.orden]
  );
  const pendientes = ordenados.filter((p) => p.pct < 100);
  const conquistados = ordenados.filter((p) => p.pct >= 100);

  // El puntero de "peldaño actual" solo debe apuntar a algo que sigue
  // pendiente hoy. Si el peldaño guardado ya se conquistó con datos reales
  // (o nunca se fijó uno), se recalcula solo y se avisa con una celebración.
  useEffect(() => {
    if (!progreso?.orden) return;
    const actualSigueValido = pendientes.some((p) => p.id === progreso.pasoActualId);
    if (!actualSigueValido) {
      const siguiente = pendientes[0] || null;
      const eraConquista = progreso.pasoActualId && conquistados.some((p) => p.id === progreso.pasoActualId);
      if (eraConquista) {
        const nombrePeldano = ordenados.find((p) => p.id === progreso.pasoActualId)?.label;
        setCelebrar(nombrePeldano || "peldaño");
        setTimeout(() => setCelebrar(null), 4500);
      }
      guardarProgreso({ pasoActualId: siguiente?.id || null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progreso?.pasoActualId, progreso?.orden, fechaHoy, pendientes.map((p) => p.id).join("|")]);

  // Si ya se conquistaron TODOS los peldaños de hoy y todavía no se había
  // contado ese día como completo, suma uno al contador — una sola vez por
  // fecha, sin importar cuántas veces se recargue la pantalla.
  useEffect(() => {
    if (!progreso?.orden || peldanos.length === 0) return;
    if (pendientes.length === 0 && progreso.fechaUltimoDiaCompleto !== fechaHoy) {
      guardarProgreso({ diasCompletos: (progreso.diasCompletos || 0) + 1, fechaUltimoDiaCompleto: fechaHoy });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progreso?.orden, pendientes.length, fechaHoy]);

  const observaciones = data.escaleraObservaciones?.[rutaPropia] || [];
  const ultimaObservacion = observaciones[0] || null;

  const TarjetaObservacion = ultimaObservacion && (
    <div className="card esc-pop-in" style={{ padding: 14, border: "1px solid #7CC4FF" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <MessageSquare size={14} color="#7CC4FF" />
        <span className="display" style={{ fontSize: 12, color: "#7CC4FF" }}>COMENTARIO DE TU SUPERVISOR</span>
      </div>
      <div style={{ fontSize: 13, color: "#E8EDF5", whiteSpace: "pre-wrap" }}>{ultimaObservacion.texto}</div>
      <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 6 }}>{ultimaObservacion.autor} · {ultimaObservacion.fecha}</div>
    </div>
  );

  if (peldanos.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <EscaleraEstilos />
        {TarjetaObservacion}
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <Flag size={28} color="#9AA7BD" style={{ marginBottom: 10 }} />
          <div style={{ color: "#9AA7BD", fontSize: 13 }}>
            Hoy no tienes objetivos del día cargados todavía (o ya los cumpliste todos). En cuanto haya avance del día u objetivos pendientes, aquí aparece tu escalera de hoy.
          </div>
        </div>
      </div>
    );
  }

  // ---- Paso 1: elegir orden (la primera vez, o si el vendedor decide cambiarlo) ----
  if (!progreso?.orden) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <EscaleraEstilos />
        {TarjetaObservacion}
        <div className="card" style={{ padding: 18 }}>
          <div className="display" style={{ fontSize: 15, marginBottom: 6 }}>ARMEMOS TU ESCALERA DE HOY</div>
          <div style={{ fontSize: 12.5, color: "#9AA7BD", lineHeight: 1.5 }}>
            Vamos a ordenar tus {peldanos.length} objetivos de hoy como una escalera: uno a la vez, en el orden que tú elijas. Cada noche esta escalera se borra sola y mañana arranca una nueva.
          </div>
        </div>
        <button
          className="card"
          style={{ padding: 18, textAlign: "left", display: "flex", gap: 12, alignItems: "center", cursor: "pointer", border: "1px solid #2A3852" }}
          onClick={() => guardarProgreso({ orden: "facil", pasoActualId: null, saltos: 0, saltados: [] })}
        >
          <ArrowUpNarrowWide size={22} color="#3DDC97" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Empezar por el más fácil</div>
            <div style={{ fontSize: 12, color: "#9AA7BD" }}>Arrancas con lo que ya llevas más avanzado hoy — bueno para agarrar ritmo desde temprano.</div>
          </div>
        </button>
        <button
          className="card"
          style={{ padding: 18, textAlign: "left", display: "flex", gap: 12, alignItems: "center", cursor: "pointer", border: "1px solid #2A3852" }}
          onClick={() => guardarProgreso({ orden: "dificil", pasoActualId: null, saltos: 0, saltados: [] })}
        >
          <ArrowDownWideNarrow size={22} color="#FF6B6B" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Empezar por el más difícil</div>
            <div style={{ fontSize: 12, color: "#9AA7BD" }}>Te quitas de encima lo más pesado mientras traes energía fresca en la mañana.</div>
          </div>
        </button>
      </div>
    );
  }

  // ---- Escalera de hoy completa ----
  if (pendientes.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <EscaleraEstilos />
        {TarjetaObservacion}
        <div className="card esc-pop-in" style={{ padding: 26, textAlign: "center", position: "relative", overflow: "hidden" }}>
          <Confeti />
          <Trophy size={34} color="#F2B134" style={{ marginBottom: 10 }} />
          <div className="display" style={{ fontSize: 16, marginBottom: 6 }}>¡ESCALERA DE HOY COMPLETA!</div>
          <div style={{ fontSize: 12.5, color: "#9AA7BD", marginBottom: 4 }}>
            Conquistaste los {conquistados.length} peldaños de hoy.
          </div>
          <div style={{ marginBottom: 12 }}>
            <EscaleraSVG pasos={ordenados} idActual={null} />
          </div>
          <div style={{ fontSize: 11.5, color: "#6C7A96" }}>
            Días completos conquistados: <strong style={{ color: "#3DDC97" }}>{progreso.diasCompletos || 1}</strong> · mañana se arma una escalera nueva.
          </div>
        </div>
      </div>
    );
  }

  const actual = pendientes.find((p) => p.id === progreso.pasoActualId) || pendientes[0];
  const posicion = pendientes.findIndex((p) => p.id === actual.id) + 1;
  const siguiente = pendientes[posicion] || null;
  const tips = tipsPara(actual);

  function saltarAlSiguiente() {
    if (!siguiente) return;
    guardarProgreso({
      pasoActualId: siguiente.id,
      saltos: (progreso.saltos || 0) + 1,
      saltados: [...(progreso.saltados || []), actual.id],
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <EscaleraEstilos />

      {celebrar && (
        <div className="card esc-pop-in" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, border: "1px solid #3DDC97", background: "rgba(61,220,151,0.08)" }}>
          <PartyPopper size={18} color="#3DDC97" />
          <div style={{ fontSize: 12.5, color: "#3DDC97" }}><strong>¡Peldaño conquistado!</strong> {celebrar} ya llegó al 100% de hoy. Vamos por el siguiente.</div>
        </div>
      )}

      {TarjetaObservacion}

      <div className="card" style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 12, color: "#9AA7BD", display: "flex", alignItems: "center", gap: 6 }}>
          <Sunrise size={13} color="#F2B134" />
          Peldaño <strong style={{ color: "#E8EDF5" }}>{posicion}</strong> de {pendientes.length} hoy · {conquistados.length} conquistados · orden {progreso.orden === "facil" ? "fácil → difícil" : "difícil → fácil"}
        </div>
        <button className="btn-ghost" style={{ fontSize: 11.5 }} onClick={() => guardarProgreso({ orden: null, pasoActualId: null })}>
          Cambiar orden
        </button>
      </div>

      {/* Peldaño actual */}
      <div className="card esc-glow-actual" style={{ padding: 20, border: `1px solid ${COLOR_GRUPO[actual.grupo] || "#F2B134"}` }}>
        <div style={{ marginBottom: 14 }}>
          <EscaleraSVG pasos={ordenados} idActual={actual.id} />
        </div>

        <div style={{ fontSize: 11, color: COLOR_GRUPO[actual.grupo] || "#9AA7BD", fontWeight: 700, letterSpacing: 0.5, marginBottom: 4, textAlign: "center" }}>{actual.grupo}</div>
        <div className="display" style={{ fontSize: 18, marginBottom: 12, textAlign: "center" }}>{actual.label}</div>

        <div style={{ height: 10, borderRadius: 6, background: "#0F172A", overflow: "hidden", marginBottom: 10 }}>
          <div style={{ height: "100%", width: `${Math.min(actual.pct, 100)}%`, background: COLOR_GRUPO[actual.grupo] || "#F2B134", transition: "width .5s ease-out" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9AA7BD", marginBottom: 18 }}>
          <span>{fmt(actual.unit, actual.avance)} de {fmt(actual.unit, actual.objetivo)}</span>
          <span>{actual.pct.toFixed(0)}%</span>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 140, background: "#0F172A", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10.5, color: "#9AA7BD", marginBottom: 4 }}>TE FALTA HOY</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#FF6B6B" }}>{fmt(actual.unit, actual.restante)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, background: "#0F172A", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10.5, color: "#9AA7BD", marginBottom: 4 }}>META DE HOY</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#F2B134" }}>{fmt(actual.unit, actual.objetivo)}</div>
          </div>
        </div>

        <div style={{ background: "#0F172A", borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#9AA7BD", fontWeight: 700, marginBottom: 8 }}>
            <Zap size={13} color="#F2B134" /> TIPS PARA ESTE PELDAÑO
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
            {tips.map((t, i) => (
              <li key={i} style={{ fontSize: 12, color: "#C6CFE0", lineHeight: 1.45 }}>{t}</li>
            ))}
          </ul>
        </div>

        <div style={{ fontSize: 11, color: "#6C7A96", marginBottom: 10 }}>
          Este peldaño se marca conquistado solo, en cuanto tu venta real de hoy llegue al 100%. No hace falta que lo confirmes a mano.
        </div>

        {siguiente && (
          <button className="btn-ghost" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }} onClick={saltarAlSiguiente}>
            <SkipForward size={13} /> Se complicó — pasar al siguiente peldaño
          </button>
        )}
      </div>

      {/* Vista completa de la escalera de hoy */}
      <button
        className="card"
        style={{ padding: 14, textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={() => setVerTodos((v) => !v)}
      >
        <span style={{ fontSize: 12.5, color: "#9AA7BD", fontWeight: 700 }}>VER TODA LA ESCALERA DE HOY</span>
        {verTodos ? <ChevronUp size={16} color="#9AA7BD" /> : <ChevronDown size={16} color="#9AA7BD" />}
      </button>

      {verTodos && (
        <div className="card esc-pop-in" style={{ padding: "6px 16px 6px 8px", borderLeft: "2px solid #2A3852" }}>
          {ordenados.map((p, i) => {
            const esActual = p.id === actual.id;
            const hecho = p.pct >= 100;
            return (
              <div
                key={p.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "12px 0",
                  marginLeft: Math.min(i * 6, 48),
                  borderBottom: i < ordenados.length - 1 ? "1px solid #1E2A42" : "none",
                  opacity: hecho ? 0.6 : 1,
                }}
              >
                {hecho ? <CheckCircle2 size={16} color="#3DDC97" /> : <Circle size={16} color={esActual ? "#F2B134" : "#3A4763"} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: esActual ? 700 : 500, color: esActual ? "#F2B134" : "#E8EDF5" }}>
                    {i + 1}. {p.label}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#9AA7BD" }}>{p.grupo} · {fmt(p.unit, p.avance)} / {fmt(p.unit, p.objetivo)}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: hecho ? "#3DDC97" : "#9AA7BD" }}>{p.pct.toFixed(0)}%</div>
              </div>
            );
          })}
        </div>
      )}

      {(progreso.diasCompletos || 0) > 0 && (
        <div style={{ textAlign: "center", fontSize: 11, color: "#6C7A96" }}>
          Días completos conquistados hasta hoy: <strong style={{ color: "#3DDC97" }}>{progreso.diasCompletos}</strong>
        </div>
      )}
    </div>
  );
}
