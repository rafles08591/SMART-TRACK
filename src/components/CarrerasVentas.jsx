import {
  useRive,
  useStateMachineInput,
  Layout,
  Fit,
  Alignment,
} from "@rive-app/react-canvas";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ARTBOARD = "Race scene";
const STATE_MACHINE = "State Machine 1";
const START_RACE_INPUT = "StartRace";
const RUTAS = ["J201", "J202", "J203", "J204", "J205", "J206", "J207"];
const DURACION_ANIMACION_MS = 90000;

function easeOutQuart(x) {
  return 1 - Math.pow(1 - x, 4);
}

function extraerRuta(nombre = "") {
  const m = String(nombre)
    .toUpperCase()
    .match(/J20[1-7]/);
  return m ? m[0] : null;
}

function extraerPct(v) {
  const n = Number(
    v?.hoy?.efectividadPct ??
      v?.efectividadPct ??
      v?.avance ??
      v?.pct ??
      0
  );
  if (Number.isNaN(n)) return 0;
  return Math.min(Math.max(n, 0), 100);
}

export default function CarrerasVentas({ porVendedor, onCerrar }) {
  const { rive, RiveComponent } = useRive({
    src: "/carreras_ventas.riv",
    artboard: ARTBOARD,
    stateMachines: STATE_MACHINE,
    autoplay: true,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
  });

  const startRaceInput = useStateMachineInput(
    rive,
    STATE_MACHINE,
    START_RACE_INPUT
  );

  const inputs = {
    J201: useStateMachineInput(rive, STATE_MACHINE, "progress_J201"),
    J202: useStateMachineInput(rive, STATE_MACHINE, "progress_J202"),
    J203: useStateMachineInput(rive, STATE_MACHINE, "progress_J203"),
    J204: useStateMachineInput(rive, STATE_MACHINE, "progress_J204"),
    J205: useStateMachineInput(rive, STATE_MACHINE, "progress_J205"),
    J206: useStateMachineInput(rive, STATE_MACHINE, "progress_J206"),
    J207: useStateMachineInput(rive, STATE_MACHINE, "progress_J207"),
  };

  const metas = useMemo(() => {
    const mapa = Object.fromEntries(RUTAS.map((r) => [r, 0]));
    (porVendedor || []).forEach((v) => {
      const ruta = extraerRuta(v?.name);
      if (ruta && mapa[ruta] !== undefined) mapa[ruta] = extraerPct(v);
    });
    console.info("[CarrerasVentas] metas %", mapa, porVendedor);
    return mapa;
  }, [porVendedor]);

  const [avanceVivo, setAvanceVivo] = useState(() =>
    Object.fromEntries(RUTAS.map((r) => [r, 0]))
  );

  const inicioRef = useRef(null);
  const frameRef = useRef(null);
  const disparado = useRef(false);

  useEffect(() => {
    if (!rive) return;

    const hayInputs = RUTAS.every((r) => inputs[r]);
    console.info("[CarrerasVentas] inputs listos:", hayInputs, {
      anims: rive.animationNames,
      sm: rive.stateMachineNames,
    });

    if (!disparado.current && startRaceInput) {
      startRaceInput.fire();
      disparado.current = true;
    }

    function animar(ts) {
      if (inicioRef.current === null) inicioRef.current = ts;
      const t = Math.min((ts - inicioRef.current) / DURACION_ANIMACION_MS, 1);
      const factor = easeOutQuart(t);
      const siguiente = {};

      RUTAS.forEach((r) => {
        const pct = metas[r] * factor;
        siguiente[r] = pct;

        const input = inputs[r];
        if (input) {
          input.value = pct;
        } else {
          rive.scrub([`Timeline ${r}`], (pct / 100) * 1);
        }
      });

      setAvanceVivo(siguiente);
      if (t < 1) frameRef.current = requestAnimationFrame(animar);
    }

    inicioRef.current = null;
    frameRef.current = requestAnimationFrame(animar);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
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
