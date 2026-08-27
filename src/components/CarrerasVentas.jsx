"use client";
import { useRive } from "@rive-app/react-canvas";
import { useEffect, useMemo } from "react";

const DURACION_TOTAL = 4;

export default function CarrerasVentas({ porVendedor }) {
  const { rive, RiveComponent } = useRive({
    src: "/carreras_ventas.riv",
    autoplay: false,
    stateMachines: "State Machine 1",
  });

  const ranking = useMemo(() => {
    if (!porVendedor) return [];
    return porVendedor
      .filter((v) => v.name?.trim().toUpperCase().startsWith("RUTA J20"))
      .map((v) => {
        const ruta = v.name.replace("RUTA ", "").trim();
        const pct = Math.min(Math.max(v.hoy?.efectividadPct ?? 0, 0), 100);
        return { ruta, nombre: v.name, pct };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [porVendedor]);

  useEffect(() => {
    if (!rive) return;
    ranking.forEach(({ ruta, pct }) => {
      const segundos = (pct / 100) * DURACION_TOTAL;
      rive.scrub(`Timeline ${ruta}`, segundos);
    });
  }, [rive, ranking]);

  return (
    <div style={{ position: "relative", width: "100%", height: "80vh" }}>
      <RiveComponent style={{ width: "100%", height: "100%" }} />
      <div
        style={{
          position: "absolute", top: 16, right: 16,
          background: "rgba(0,0,0,0.75)", color: "#fff", borderRadius: 12,
          padding: "12px 16px", fontSize: 13, minWidth: 200,
          maxHeight: "70vh", overflowY: "auto",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>🏁 Posiciones</div>
        {ranking.map((r, i) => (
          <div
            key={r.ruta}
            style={{
              display: "flex", justifyContent: "space-between", gap: 8,
              padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.1)",
              fontWeight: i === 0 ? 700 : 400,
              color: i === 0 ? "#FFD700" : "#fff",
            }}
          >
            <span>{i + 1}° {r.ruta}</span>
            <span>{r.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
