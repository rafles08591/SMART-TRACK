import {
  useRive,
  useStateMachineInput,
  useViewModelInstanceNumber,
  Layout,
  Fit,
  Alignment,
} from "@rive-app/react-canvas";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ARTBOARD = "Race scene";
const STATE_MACHINE = "State Machine 1";
const RUTAS = ["J201", "J202", "J203", "J204", "J205", "J206", "J207"];
const TIMELINES = RUTAS.map((r) => `Timeline ${r}`);
const DURACION_S = 1;
const DURACION_ANIMACION_MS = 90000;

function easeOutQuart(x) {
  return 1 - Math.pow(1 - x, 4);
}
function extraerRuta(nombre = "") {
  const m = String(nombre).toUpperCase().match(/J20[1-7]/);
  return m ? m[0] : null;
}
function extraerPct(v) {
  const n = Number(
    v?.hoy?.efectividadPct ?? v?.efectividadPct ?? v?.avance ?? 0
  );
  return Number.isNaN(n) ? 0 : Math.min(Math.max(n, 0), 100);
}

export default function CarrerasVentas({ porVendedor, onCerrar }) {
  const { rive, RiveComponent } = useRive({
    src: "/carreras_ventas.riv",
    artboard: ARTBOARD,
    stateMachine: STATE_MACHINE,
    animations: TIMELINES,
    autoplay: true,
    autoBind: true,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
  });

  const startRace = useStateMachineInput(rive, STATE_MACHINE, "StartRace");
  const vmi = rive?.viewModelInstance;

  const setJ201 = useViewModelInstanceNumber("progress_J201", vmi).setValue;
  const setJ202 = useViewModelInstanceNumber("progress_J202", vmi).setValue;
  const setJ203 = useViewModelInstanceNumber("progress_J203", vmi).setValue;
  const setJ204 = useViewModelInstanceNumber("progress_J204", vmi).setValue;
  const setJ205 = useViewModelInstanceNumber("progress_J205", vmi).setValue;
  const setJ206 = useViewModelInstanceNumber("progress_J206", vmi).setValue;
  const setJ207 = useViewModelInstanceNumber("progress_J207", vmi).setValue;

  const setters = {
    J201: setJ201,
    J202: setJ202,
    J203: setJ203,
    J204: setJ204,
    J205: setJ205,
    J206: setJ206,
    J207: setJ207,
  };

  const metas = useMemo(() => {
    const mapa = Object.fromEntries(RUTAS.map((r) => [r, 0]));
    (porVendedor || []).forEach((v) => {
      const ruta = extraerRuta(v?.name);
      if (ruta) mapa[ruta] = extraerPct(v);
    });
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

    if (!disparado.current) {
      startRace?.fire?.();
      disparado.current = true;
    }

    function animar(ts) {
      if (inicioRef.current === null) inicioRef.current = ts;
      const t = Math.min((ts - inicioRef.current) / DURACION_ANIMACION_MS, 1);
      const factor = easeOutQuart(t);
      const siguiente = {};

      RUTAS.forEach((ruta) => {
        const pct = metas[ruta] * factor;
        siguiente[ruta] = pct;
        setters[ruta]?.(pct);
        if (typeof rive.scrub === "function") {
          rive.scrub([`Timeline ${ruta}`], (pct / 100) * DURACION_S);
        }
      });

      setAvanceVivo(siguiente);
      if (t < 1) frameRef.current = requestAnimationFrame(animar);
    }

    inicioRef.current = null;
    frameRef.current = requestAnimationFrame(animar);
    return () => frameRef.current && cancelAnimationFrame(frameRef.current);
  }, [rive, startRace, metas, setJ201, setJ202, setJ203, setJ204, setJ205, setJ206, setJ207]);

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
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
          padding: "12px 20px 16px",
          display: "grid",
          gridTemplateColumns: `repeat(${RUTAS.length}, 1fr)`,
          gap: 12,
        }}
      >
        {RUTAS.map((ruta) => {
          const pct = Math.round(avanceVivo[ruta] ?? 0);
          return (
            <div key={ruta}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "#e5e7eb",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span>{ruta}</span>
                <span>{pct}%</span>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
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
