import {
  useRive,
  useStateMachineInput,
  Layout,
  Fit,
  Alignment,
} from "@rive-app/react-canvas";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// --- Ajusta estos nombres si en tu editor quedaron distintos ---
const STATE_MACHINE = "State Machine 1";
const START_RACE_INPUT = "StartRace"; // Input clásico (no ViewModel) de la State Machine
const RUTAS = ["J201", "J202", "J203", "J204", "J205", "J206", "J207"];
const TIMELINES = RUTAS.map((r) => `Timeline ${r}`); // "Timeline J201", ... "Timeline J207"

// Duración total de la animación de avance. Súbelo para que corra más lento.
const DURACION_ANIMACION_MS = 90000;
const CURVA = "quart";

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}
function easeOutQuart(x) {
  return 1 - Math.pow(1 - x, 4);
}
function easeOutExpo(x) {
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}
function suavizar(x) {
  if (CURVA === "cubic") return easeOutCubic(x);
  if (CURVA === "expo") return easeOutExpo(x);
  return easeOutQuart(x);
}

// Duración (en segundos) de una animación por nombre, usando los datos que el
// runtime de Rive expone del artboard. Si no la encuentra, cae a 1s por defecto
// (ajusta FALLBACK_DURATION_S si tus Timelines duran distinto).
const FALLBACK_DURATION_S = 1;
function obtenerDuracionSegundos(rive, nombreTimeline) {
  try {
    const anims = rive?.animationNames ? null : null; // no-op, mantenido por claridad
    const artboardAnims =
      rive?.contents?.artboards?.[0]?.animations ||
      rive?.contents?.artboards?.[0]?.linearAnimations ||
      [];
    const found = artboardAnims.find((a) => a.name === nombreTimeline);
    if (found && found.duration && found.fps) {
      return found.duration / found.fps;
    }
  } catch (e) {
    // seguimos con el fallback
  }
  return FALLBACK_DURATION_S;
}

export default function CarrerasVentas({ porVendedor, onCerrar }) {
  const { rive, RiveComponent } = useRive({
    src: "/carreras_ventas.riv",
    stateMachines: STATE_MACHINE, // sigue activa para el ciclo de correr (piernas/brazos)
    animations: TIMELINES, // además cargamos las timelines clásicas para controlarlas a mano
    autoplay: true,
    autoBind: true,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
  });

  const startRaceInput = useStateMachineInput(rive, STATE_MACHINE, START_RACE_INPUT);

  const metas = useMemo(() => {
    const mapa = {};
    RUTAS.forEach((r) => (mapa[r] = 0));
    if (!porVendedor) return mapa;
    porVendedor
      .filter((v) => v.name?.trim().toUpperCase().startsWith("RUTA J20"))
      .forEach((v) => {
        const ruta = v.name.replace("RUTA ", "").trim();
        const pct = Math.min(Math.max(v.hoy?.efectividadPct ?? 0, 0), 100);
        if (mapa[ruta] !== undefined) mapa[ruta] = pct;
      });
    return mapa;
  }, [porVendedor]);

  const [avanceVivo, setAvanceVivo] = useState(() => {
    const inicial = {};
    RUTAS.forEach((r) => (inicial[r] = 0));
    return inicial;
  });

  const inicioRef = useRef(null);
  const frameRef = useRef(null);
  const disparado = useRef(false);
  const duracionesRef = useRef({});

  useEffect(() => {
    if (!rive) return;

    // Duración real de cada Timeline (para mapear % -> segundos correctamente)
    RUTAS.forEach((r) => {
      duracionesRef.current[r] = obtenerDuracionSegundos(rive, `Timeline ${r}`);
    });
    console.info("[CarrerasVentas] Duraciones detectadas por ruta:", duracionesRef.current);

    // Dejamos las timelines "pausadas" en el frame 0 para poder hacer scrub manual
    rive.play(TIMELINES);
    rive.pause(TIMELINES);

    if (!disparado.current && startRaceInput) {
      startRaceInput.fire();
      disparado.current = true;
    }

    function animar(ts) {
      if (inicioRef.current === null) inicioRef.current = ts;
      const t = Math.min((ts - inicioRef.current) / DURACION_ANIMACION_MS, 1);
      const factor = suavizar(t);

      const siguienteAvance = {};
      RUTAS.forEach((r) => {
        const pct = metas[r] * factor; // 0-100
        const duracion = duracionesRef.current[r] || FALLBACK_DURATION_S;
        const segundoDestino = (pct / 100) * duracion;
        rive.scrub(`Timeline ${r}`, segundoDestino);
        siguienteAvance[r] = pct;
      });
      setAvanceVivo(siguienteAvance);

      if (t < 1) {
        frameRef.current = requestAnimationFrame(animar);
      }
    }

    inicioRef.current = null;
    frameRef.current = requestAnimationFrame(animar);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rive, startRaceInput, metas]);

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "#0b1220",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {onCerrar && (
        <button
          onClick={onCerrar}
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            zIndex: 10000,
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: "#f5f5f5",
            cursor: "pointer",
          }}
        >
          ‹ Regresar
        </button>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        <RiveComponent style={{ width: "100%", height: "100%" }} />
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: "12px 20px 16px",
          background: "rgba(255,255,255,0.04)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "grid",
          gridTemplateColumns: `repeat(${RUTAS.length}, 1fr)`,
          gap: 12,
        }}
      >
        {RUTAS.map((r) => {
          const pct = Math.round(avanceVivo[r] ?? 0);
          return (
            <div key={r} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "#e5e7eb",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span>{r}</span>
                <span>{pct}%</span>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: "#f5a623",
                    borderRadius: 999,
                    transition: "width 0.1s linear",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
