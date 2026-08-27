import { useRive } from "@rive-app/react-canvas";
import { useEffect, useMemo } from "react";

const DURACION_TOTAL = 60; // 60 segundos = 100%


export default function CarrerasVentas({ porVendedor }) {
  const { rive, RiveComponent } = useRive({
    src: "/carreras_ventas.riv",
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

  useEffect(() => {
    if (!rive) return;
    ranking.forEach(({ ruta, pct }) => {
      const nombreTimeline = `Timeline ${ruta}`;
      const segundos = (pct / 100) * DURACION_TOTAL;
      rive.play(nombreTimeline);   // activa el Timeline
      rive.scrub(nombreTimeline, segundos); // lo posiciona
      rive.pause(nombreTimeline);  // lo congela ahí
    });
  }, [rive, ranking]);

  return (
    <div style={{ width: "100%" }}>
      <div style={{ width: "100%", height: "65vh" }}>
        <RiveComponent style={{ width: "100%", height: "100%" }} />
      </div>

      <div
        style={{
          display: "flex", gap: 8, overflowX: "auto", padding: "10px 4px",
          marginTop: 8,
        }}
      >
        {ranking.map((r, i) => (
          <div
            key={r.ruta}
            style={{
              flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6,
              background: i === 0 ? "#3a2f0a" : "#1a1a1a",
              border: i === 0 ? "1px solid #FFD700" : "1px solid #333",
              borderRadius: 20, padding: "6px 12px", fontSize: 12, color: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: i === 0 ? "#FFD700" : "#9AA7BD", fontWeight: 700 }}>{i + 1}°</span>
            <span style={{ fontWeight: 600 }}>{r.ruta}</span>
            <span style={{ color: "#9AA7BD" }}>{r.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
