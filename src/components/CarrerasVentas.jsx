import { useRive } from "@rive-app/react-canvas";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

const DURACION_TOTAL = 1;
const DURACION_ANIMACION_MS = 4500;
const TIMELINES = [
  "Timeline J201",
  "Timeline J202",
  "Timeline J203",
  "Timeline J204",
  "Timeline J205",
  "Timeline J206",
  "Timeline J207",
];

// "cubic" | "quart" | "expo"
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

export default function CarrerasVentas({ porVendedor, onCerrar }) {
  const { rive, RiveComponent } = useRive({
    src: "/carreras_ventas.riv",
    animations: TIMELINES,
    autoplay: false,
  });

  const ranking = useMemo(() => {
    if (!porVendedor) return [];
    return porVendedor
      .filter((v) => v.name?.trim().toUpperCase().startsWith("RUTA J20"))
      .map((v) => {
        const ruta = v.name.replace("RUTA ", "").trim();
        const pct = Math.min(Math.max(v.hoy?.efectividadPct ?? 0, 0), 100);
        return { ruta, pct };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [porVendedor]);

  const rankingKey = ranking.map((r) => `${r.ruta}:${r.pct.toFixed(1)}`).join("|");
  const yaAnimoRef = useRef("");

  useEffect(() => {
    if (!rive || ranking.length === 0) return;
    if (yaAnimoRef.current === rankingKey) return;
    yaAnimoRef.current = rankingKey;

    let frameId = 0;
    let cancelado = false;

    const objetivos = ranking.map(({ ruta, pct }) => ({
      nombreTimeline: `Timeline ${ruta}`,
      segundosDestino: (pct / 100) * DURACION_TOTAL,
    }));

    rive.play(TIMELINES);
    rive.pause(TIMELINES);

    objetivos.forEach(({ nombreTimeline }) => rive.scrub(nombreTimeline, 0));
    rive.drawFrame();

    const inicio = performance.now();

    const tick = (ahora) => {
      if (cancelado) return;
      const progreso = Math.min(Math.max((ahora - inicio) / DURACION_ANIMACION_MS, 0), 1);
      const factor = suavizar(progreso);

      objetivos.forEach(({ nombreTimeline, segundosDestino }) => {
        rive.scrub(nombreTimeline, segundosDestino * factor);
      });
      rive.drawFrame();

      if (progreso < 1) frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelado = true;
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [rive, ranking, rankingKey]);

  const contenido = (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "#0a0a0a",
        zIndex: 999999,
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
            zIndex: 1000000,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            border: "1px solid #555",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          ← Regresar
        </button>
      )}

      <div style={{ flex: 1, minHeight: 0, width: "100%" }}>
        <RiveComponent style={{ width: "100%", height: "100%" }} />
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          padding: "10px 12px",
          flexShrink: 0,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {ranking.map((r, i) => (
          <div
            key={r.ruta}
            style={{
              flex: "0 0 auto",
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: i === 0 ? "#3a2f0a" : "#1a1a1a",
              border: i === 0 ? "1px solid #FFD700" : "1px solid #333",
              borderRadius: 20,
              padding: "6px 12px",
              fontSize: 12,
              color: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: i === 0 ? "#FFD700" : "#9AA7BD", fontWeight: 700 }}>
              {i + 1}°
            </span>
            <span style={{ fontWeight: 600 }}>{r.ruta}</span>
            <span style={{ color: "#9AA7BD" }}>{r.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );

  return createPortal(contenido, document.body);
}
