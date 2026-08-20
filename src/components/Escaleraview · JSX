// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import {
  Flag, Trophy, Zap, CheckCircle2, Circle, SkipForward, RotateCcw,
  ArrowUpNarrowWide, ArrowDownWideNarrow, ChevronDown, ChevronUp, PartyPopper,
} from "lucide-react";
import { MARCAS_OPEN, MARCAS_CHAMPIONS } from "../constants";
import { fmt, money, unidades } from "../utils";

/* -----------------------------------------------------------------------
   TIPS — banco de consejos de venta. Se muestran según el tipo de peldaño
   en el que esté parado el vendedor. Los tips por marca están escritos
   para las 4 marcas núcleo (Ice Mix, Bloss Mix, Summ Mix, Faronet); si en
   el futuro se agrega una marca nueva a MARCAS_OPEN/MARCAS_CHAMPIONS que no
   esté aquí, cae automáticamente al set genérico (TIPS_GENERALES) para que
   el módulo nunca se quede sin consejos que mostrar.
------------------------------------------------------------------------ */
const TIPS_GENERALES = [
  "Reparte lo que te falta de este peldaño entre tus días hábiles restantes — perseguir un número chico cada día es más fácil que perseguir uno grande al final.",
  "Revisa MESA DE CONTROL antes de salir: ahí ves quién no ha comprado esta semana, que es tu oportunidad más rápida de cerrar hoy.",
  "Ofrece siempre el combo o exhibidor antes que la pieza suelta — sube tu ticket promedio sin necesitar clientes nuevos.",
  "Pide espacio de exhibición en el mostrador: un producto visible se vende solo, incluso cuando ya te fuiste.",
  "Revisa SIN VISITA cada semana — son clientes que ya te conocen y solo necesitan que vuelvas a tocar la puerta.",
  "Si un cliente no compra la marca que necesitas empujar, pregúntale qué le falta: precio, exhibición o rotación. Ataca la causa real, no solo insistas.",
];

const TIPS_MARCA_BASE = {
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
    "Si el cliente ya la tiene pero en poca cantidad, sugiere subir el pedido base con el argumento de rotación.",
  ],
  faronet: [
    "Faronet responde bien a clientes fieles de marca — prioriza tiendas donde ya tienes buena relación antes de ir a clientes fríos.",
    "Explícale al dueño el margen del punto de venta, no solo el precio al público — a muchos les convence más el margen que el precio.",
    "Ofrécela en combo con la marca que más rota en esa tienda para asegurar que se mueva junto.",
  ],
};
// Los peldaños CHAMPIONS son las mismas marcas físicas que OPEN, así que
// reutilizan los mismos consejos y solo agregan una línea recordando que no
// hace falta vender la pieza dos veces para que sume a ambas metas.
const TIPS_MARCA = {
  ...TIPS_MARCA_BASE,
  champIce: [...TIPS_MARCA_BASE.iceMix, "Cada pieza de Ice Mix que vendes también suma para tu meta CHAMPIONS — no la vendes dos veces, cuenta doble sola."],
  champBlossSumm: [...TIPS_MARCA_BASE.blossMix.slice(0, 2), ...TIPS_MARCA_BASE.summMix.slice(0, 1), "Bloss y Summ Mix comparten peldaño en CHAMPIONS: cualquiera de las dos que vendas suma igual."],
  champFaronet: [...TIPS_MARCA_BASE.faronet, "En CHAMPIONS, Faronet suele ser tu peldaño más rápido si ya tienes cartera fiel — revisa esos clientes primero."],
};

const TIPS_OTC = [
  "OTC se mide en pesos, no en piezas — enfócate en tickets grandes (exhibidores, cargas completas) más que en visitas sueltas.",
  "Revisa qué clientes de tu Mesa de Control tienen ticket promedio alto y visítalos primero en la semana.",
  "Negocia pedidos anticipados de fin de semana — mueven mucho monto en una sola visita.",
  "Si ya vas cerca de la meta OTC, un solo cliente grande puede cerrarte el peldaño antes del sábado.",
];

const TIPS_VOLUMEN_TOTAL = [
  "Este peldaño suma TODO lo que vendes, sin importar la marca — cualquier pieza que muevas hoy te acerca a él.",
  "No dependas de una sola marca para llegar: reparte tus visitas entre varios clientes y varios productos.",
  ...TIPS_GENERALES.slice(0, 3),
];

function tipsPara(peldano) {
  if (peldano.tipo === "otc") return TIPS_OTC;
  if (peldano.tipo === "total") return TIPS_VOLUMEN_TOTAL;
  return TIPS_MARCA[peldano.marcaKey] || TIPS_GENERALES;
}

/* -----------------------------------------------------------------------
   Construcción de peldaños a partir de los datos REALES del vendedor
   (los mismos que ya se ven en las pestañas MAX/OPEN/CHAMPIONS). El avance
   nunca se marca "a mano": un peldaño se da por conquistado solo cuando el
   dato real de ventas ya llegó al 100% de su objetivo.
------------------------------------------------------------------------ */
function construirPeldanos(vendedor) {
  const peldanos = [];

  if (vendedor.tabs?.open?.objetivo > 0) {
    const t = vendedor.tabs.open;
    peldanos.push({ id: "total_open", tipo: "total", grupo: "OPEN", label: "Volumen total OPEN", unit: "units", objetivo: t.objetivo, avance: t.avance, restante: t.restaPorVender, pct: t.avancePct, porDia: t.ventaPorDiaNecesaria });
  }
  if (vendedor.tabs?.champions?.objetivo > 0) {
    const t = vendedor.tabs.champions;
    peldanos.push({ id: "total_champions", tipo: "total", grupo: "CHAMPIONS", label: "Volumen total CHAMPIONS", unit: "units", objetivo: t.objetivo, avance: t.avance, restante: t.restaPorVender, pct: t.avancePct, porDia: t.ventaPorDiaNecesaria });
  }
  MARCAS_OPEN.forEach((m) => {
    const info = vendedor.marcasOpen?.[m.key];
    if (info && info.objetivo > 0) {
      peldanos.push({ id: `open_${m.key}`, tipo: "marca", marcaKey: m.key, grupo: "OPEN", label: m.label, unit: "units", objetivo: info.objetivo, avance: info.vendido, restante: info.restaPorVender, pct: info.pct, porDia: info.ventaPorDiaNecesaria });
    }
  });
  MARCAS_CHAMPIONS.forEach((m) => {
    const info = vendedor.marcasChampions?.[m.key];
    if (info && info.objetivo > 0) {
      peldanos.push({ id: `champ_${m.key}`, tipo: "marca", marcaKey: m.key, grupo: "CHAMPIONS", label: m.label, unit: "units", objetivo: info.objetivo, avance: info.vendido, restante: info.restaPorVender, pct: info.pct, porDia: info.ventaPorDiaNecesaria });
    }
  });
  if (vendedor.marcaOtc?.objetivo > 0) {
    const t = vendedor.marcaOtc;
    peldanos.push({ id: "otc", tipo: "otc", grupo: "OTC", label: "OTC semanal", unit: "money", objetivo: t.objetivo, avance: t.vendido, restante: t.restaPorVender, pct: t.pct, porDia: t.ventaPorDiaNecesaria });
  }
  return peldanos;
}

function ordenarPeldanos(peldanos, orden) {
  const copia = [...peldanos];
  // "Fácil primero" = el que menos le falta por avance porcentual primero.
  // "Difícil primero" = el que menos ha avanzado (más lejos de su meta) primero.
  copia.sort((a, b) => (orden === "facil" ? b.pct - a.pct : a.pct - b.pct));
  return copia;
}

const COLOR_GRUPO = { OPEN: "#3DDC97", CHAMPIONS: "#F2B134", OTC: "#7CC4FF" };

export default function EscaleraView({ data, persistFresco, vendedor, rutaPropia }) {
  const peldanos = useMemo(() => construirPeldanos(vendedor), [vendedor]);
  const progreso = data.escaleraProgreso?.[rutaPropia] || null;
  const [verTodos, setVerTodos] = useState(false);
  const [celebrar, setCelebrar] = useState(null);

  function guardarProgreso(cambios) {
    persistFresco((fresca) => {
      const actual = fresca.escaleraProgreso || {};
      const propio = actual[rutaPropia] || {};
      return { escaleraProgreso: { ...actual, [rutaPropia]: { ...propio, ...cambios } } };
    });
  }

  const ordenados = useMemo(
    () => (progreso?.orden ? ordenarPeldanos(peldanos, progreso.orden) : []),
    [peldanos, progreso?.orden]
  );
  const pendientes = ordenados.filter((p) => p.pct < 100);
  const conquistados = ordenados.filter((p) => p.pct >= 100);

  // El puntero de "peldaño actual" solo debe apuntar a algo que sigue
  // pendiente. Si el peldaño guardado ya se conquistó con datos reales (o
  // nunca se fijó uno), se recalcula solo y se avisa con una celebración.
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
  }, [progreso?.pasoActualId, progreso?.orden, pendientes.map((p) => p.id).join("|")]);

  if (peldanos.length === 0) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <Flag size={28} color="#9AA7BD" style={{ marginBottom: 10 }} />
        <div style={{ color: "#9AA7BD", fontSize: 13 }}>
          Todavía no tienes objetivos asignados para este periodo. En cuanto tu supervisor los cargue, aquí aparecerá tu escalera.
        </div>
      </div>
    );
  }

  // ---- Paso 1: elegir orden (solo la primera vez, o si el vendedor decide cambiarlo) ----
  if (!progreso?.orden) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="display" style={{ fontSize: 15, marginBottom: 6 }}>ARMEMOS TU ESCALERA</div>
          <div style={{ fontSize: 12.5, color: "#9AA7BD", lineHeight: 1.5 }}>
            Vamos a ordenar tus {peldanos.length} objetivos pendientes como una escalera: uno a la vez, en el orden que tú elijas. Cuando termines un peldaño con ventas reales, sube solo al siguiente.
          </div>
        </div>
        <button
          className="card"
          style={{ padding: 18, textAlign: "left", display: "flex", gap: 12, alignItems: "center", cursor: "pointer", border: "1px solid #2A3852" }}
          onClick={() => guardarProgreso({ orden: "facil", pasoActualId: null, saltos: 0 })}
        >
          <ArrowUpNarrowWide size={22} color="#3DDC97" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Empezar por el más fácil</div>
            <div style={{ fontSize: 12, color: "#9AA7BD" }}>Arrancas con lo que ya tienes más avanzado — buenos para agarrar ritmo y confianza.</div>
          </div>
        </button>
        <button
          className="card"
          style={{ padding: 18, textAlign: "left", display: "flex", gap: 12, alignItems: "center", cursor: "pointer", border: "1px solid #2A3852" }}
          onClick={() => guardarProgreso({ orden: "dificil", pasoActualId: null, saltos: 0 })}
        >
          <ArrowDownWideNarrow size={22} color="#FF6B6B" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Empezar por el más difícil</div>
            <div style={{ fontSize: 12, color: "#9AA7BD" }}>Te quitas de encima lo más pesado primero y el resto de la escalera se siente cuesta abajo.</div>
          </div>
        </button>
      </div>
    );
  }

  // ---- Escalera completa ----
  if (pendientes.length === 0) {
    return (
      <div className="card" style={{ padding: 26, textAlign: "center" }}>
        <Trophy size={34} color="#F2B134" style={{ marginBottom: 10 }} />
        <div className="display" style={{ fontSize: 16, marginBottom: 6 }}>¡ESCALERA COMPLETA!</div>
        <div style={{ fontSize: 12.5, color: "#9AA7BD", marginBottom: 16 }}>
          Conquistaste los {conquistados.length} peldaños de este periodo. Así se ve la cima.
        </div>
        <button className="btn-ghost" onClick={() => guardarProgreso({ orden: null, pasoActualId: null })}>
          <RotateCcw size={13} style={{ verticalAlign: "-2px" }} /> Armar otra escalera
        </button>
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
      {celebrar && (
        <div className="card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, border: "1px solid #3DDC97", background: "rgba(61,220,151,0.08)" }}>
          <PartyPopper size={18} color="#3DDC97" />
          <div style={{ fontSize: 12.5, color: "#3DDC97" }}><strong>¡Peldaño conquistado!</strong> {celebrar} ya llegó al 100%. Vamos por el siguiente.</div>
        </div>
      )}

      <div className="card" style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 12, color: "#9AA7BD" }}>
          Peldaño <strong style={{ color: "#E8EDF5" }}>{posicion}</strong> de {pendientes.length} · {conquistados.length} conquistados · orden {progreso.orden === "facil" ? "fácil → difícil" : "difícil → fácil"}
        </div>
        <button className="btn-ghost" style={{ fontSize: 11.5 }} onClick={() => guardarProgreso({ orden: null, pasoActualId: null })}>
          Cambiar orden
        </button>
      </div>

      {/* Peldaño actual */}
      <div className="card" style={{ padding: 20, border: `1px solid ${COLOR_GRUPO[actual.grupo] || "#F2B134"}` }}>
        <div style={{ fontSize: 11, color: COLOR_GRUPO[actual.grupo] || "#9AA7BD", fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>{actual.grupo}</div>
        <div className="display" style={{ fontSize: 18, marginBottom: 12 }}>{actual.label}</div>

        <div style={{ height: 10, borderRadius: 6, background: "#0F172A", overflow: "hidden", marginBottom: 10 }}>
          <div style={{ height: "100%", width: `${Math.min(actual.pct, 100)}%`, background: COLOR_GRUPO[actual.grupo] || "#F2B134", transition: "width .4s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9AA7BD", marginBottom: 18 }}>
          <span>{fmt(actual.unit, actual.avance)} de {fmt(actual.unit, actual.objetivo)}</span>
          <span>{actual.pct.toFixed(0)}%</span>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 140, background: "#0F172A", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10.5, color: "#9AA7BD", marginBottom: 4 }}>TE FALTA</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#FF6B6B" }}>{fmt(actual.unit, actual.restante)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, background: "#0F172A", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10.5, color: "#9AA7BD", marginBottom: 4 }}>NECESITAS VENDER HOY</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#F2B134" }}>{fmt(actual.unit, actual.porDia)}</div>
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
          Este peldaño se marca conquistado solo, en cuanto tu venta real llegue al 100%. No hace falta que lo confirmes a mano.
        </div>

        {siguiente && (
          <button className="btn-ghost" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }} onClick={saltarAlSiguiente}>
            <SkipForward size={13} /> Se complicó — pasar al siguiente peldaño
          </button>
        )}
      </div>

      {/* Vista completa de la escalera */}
      <button
        className="card"
        style={{ padding: 14, textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={() => setVerTodos((v) => !v)}
      >
        <span style={{ fontSize: 12.5, color: "#9AA7BD", fontWeight: 700 }}>VER TODA LA ESCALERA</span>
        {verTodos ? <ChevronUp size={16} color="#9AA7BD" /> : <ChevronDown size={16} color="#9AA7BD" />}
      </button>

      {verTodos && (
        <div className="card" style={{ padding: "6px 16px" }}>
          {ordenados.map((p, i) => {
            const esActual = p.id === actual.id;
            const hecho = p.pct >= 100;
            return (
              <div
                key={p.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "12px 0",
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
    </div>
  );
}
