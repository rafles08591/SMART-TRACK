import { useRive, useStateMachineInput } from "@rive-app/react-canvas";
import { useEffect, useMemo, useRef } from "react";

// --- Ajusta estos nombres si en tu editor quedaron distintos ---
const STATE_MACHINE = "State Machine 1";
const START_RACE_INPUT = "StartRace"; // Input clásico (no ViewModel) de la State Machine
const RUTAS = ["J201", "J202", "J203", "J204", "J205", "J206", "J207"];
const DURACION_ANIMACION_MS = 45000;
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

export default function CarreraDeBotargas({ porVendedor, onCerrar }) {
  const { rive, RiveComponent } = useRive({
   src: "/carreras_ventas.riv",
    stateMachines: STATE_MACHINE,
    autoplay: true,
    autoBind: true, // usa la instancia del ViewModel "Race" que dejaste asignada como Source del artboard
  });

  // Input clásico StartRace (dispara el ciclo de correr en cada layer: Bee/Piggy/RiseVest/Cowry)
  const startRaceInput = useStateMachineInput(rive, STATE_MACHINE, START_RACE_INPUT);

  // Metas de % por ruta, calculadas desde Supabase (igual que antes)
  const metas = useMemo(() => {
    const mapa = {};
    RUTAS.forEach((r) => (mapa[r] = 0));
    if (!porVendedor) return mapa;
    porVendedor
      .filter((v) => v.name?.trim().toUpperCase().startsWith("RUTA J20"))
      .forEach((v) => {
        const ruta = v.name.replace("RUTA ", "").trim(); // "J201", "J202", ...
        const pct = Math.min(Math.max(v.hoy?.efectividadPct ?? 0, 0), 100);
        if (mapa[ruta] !== undefined) mapa[ruta] = pct;
      });
    return mapa;
  }, [porVendedor]);

  const inicioRef = useRef(null);
  const frameRef = useRef(null);
  const disparado = useRef(false);

  useEffect(() => {
    if (!rive) return;

    const vmi = rive.viewModelInstance; // instancia por defecto del ViewModel "Race" (via autoBind)
    if (!vmi) {
      console.warn(
        "No hay viewModelInstance enlazada. Revisa que 'Race scene' tenga asignado el ViewModel 'Race' como Source en el editor de Rive."
      );
      return;
    }

    // Referencias a cada propiedad Number progress_J20X
    const props = {};
    RUTAS.forEach((r) => {
      props[r] = vmi.number(`progress_${r}`);
    });

    function animar(ts) {
      if (inicioRef.current === null) inicioRef.current = ts;
      const t = Math.min((ts - inicioRef.current) / DURACION_ANIMACION_MS, 1);
      const factor = suavizar(t);

      RUTAS.forEach((r) => {
        const valorActual = metas[r] * factor;
        if (props[r]) props[r].value = valorActual;
      });

      if (t < 1) {
        frameRef.current = requestAnimationFrame(animar);
      }
    }

    // Dispara el trigger StartRace UNA sola vez para que arranque el ciclo de correr
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

  return (
    <div>
      <RiveComponent style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
