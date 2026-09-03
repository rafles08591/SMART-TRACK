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
const VIEW_MODEL_NAME = "Race"; // ViewModel con progress_J201...progress_J207
const RUTAS = ["J201", "J202", "J203", "J204", "J205", "J206", "J207"];

// Duración total de la animación de avance. Súbelo para que corra más lento.
const DURACION_ANIMACION_MS = 90000; // 90s (antes 45s)
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

// Busca y enlaza la instancia del ViewModel "Race" probando varias rutas posibles,
// para no depender de que el artboard ya tenga un Source asignado en el editor.
function resolverInstanciaRace(rive) {
  if (rive.viewModelInstance) {
    return { vmi: rive.viewModelInstance, origen: "autoBind (Source del artboard)" };
  }
  if (typeof rive.viewModelByName !== "function") {
    return { vmi: null, origen: null };
  }
  const vm = rive.viewModelByName(VIEW_MODEL_NAME);
  if (!vm) return { vmi: null, origen: null };

  let vmi = null;
  let origen = "";

  if (typeof vm.defaultInstance === "function") {
    vmi = vm.defaultInstance();
    if (vmi) origen = "defaultInstance()";
  }
  if (!vmi && typeof vm.instanceByName === "function") {
    vmi = vm.instanceByName("Instance") || vm.instanceByName("Default");
    if (vmi) origen = "instanceByName()";
  }
  if (!vmi && typeof vm.instance === "function") {
    vmi = vm.instance(0);
    if (vmi) origen = "instance(0)";
  }

  if (vmi && typeof rive.bindViewModelInstance === "function") {
    rive.bindViewModelInstance(vmi);
  }
  return { vmi, origen };
}

export default function CarrerasVentas({ porVendedor, onCerrar }) {
  const { rive, RiveComponent } = useRive({
    src: "/carreras_ventas.riv",
    stateMachines: STATE_MACHINE,
    autoplay: true,
    autoBind: true,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
  });

  const startRaceInput = useStateMachineInput(rive, STATE_MACHINE, START_RACE_INPUT);

  // Metas de % por ruta, calculadas desde Supabase
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

  // Valores en vivo para pintar la mini gráfica inferior (0-100 por ruta)
  const [avanceVivo, setAvanceVivo] = useState(() => {
    const inicial = {};
    RUTAS.forEach((r) => (inicial[r] = 0));
    return inicial;
  });

  const inicioRef = useRef(null);
  const frameRef = useRef(null);
  const disparado = useRef(false);

  useEffect(() => {
    if (!rive) return;

    const { vmi, origen } = resolverInstanciaRace(rive);

    if (!vmi) {
      console.warn(
        `[CarrerasVentas] No se pudo enlazar el ViewModel "${VIEW_MODEL_NAME}". ` +
          "Revisa en el editor de Rive que exista un ViewModel llamado exactamente 'Race' con al menos una instancia, " +
          "o que 'Race scene' tenga una instancia asignada como Source."
      );
      if (!disparado.current && startRaceInput) {
        startRaceInput.fire();
        disparado.current = true;
      }
      return;
    }

    console.info(`[CarrerasVentas] ViewModel "${VIEW_MODEL_NAME}" enlazado via ${origen}.`);

    const props = {};
    RUTAS.forEach((r) => {
      const prop = vmi.number(`progress_${r}`);
      if (!prop) {
        console.warn(
          `[CarrerasVentas] La propiedad "progress_${r}" no existe en la instancia enlazada de "${VIEW_MODEL_NAME}".`
        );
      }
      props[r] = prop;
    });

    function animar(ts) {
      if (inicioRef.current === null) inicioRef.current = ts;
      const t = Math.min((ts - inicioRef.current) / DURACION_ANIMACION_MS, 1);
      const factor = suavizar(t);

      const siguienteAvance = {};
      RUTAS.forEach((r) => {
        const valorActual = metas[r] * factor;
        if (props[r]) props[r].value = valorActual;
        siguienteAvance[r] = valorActual;
      });
      setAvanceVivo(siguienteAvance);

      if (t < 1) {
        frameRef.current = requestAnimationFrame(animar);
      }
    }

    if (!disparado.current && startRaceInput) {
      startRaceInput.fire();
      disparado.current = true;
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

      {/* Mini gráfica de avance por ruta */}
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
