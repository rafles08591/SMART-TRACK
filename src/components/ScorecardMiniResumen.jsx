// @ts-nocheck
import React, { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { calcularScorecardSemanal, todayISO } from "../utils";

const COLOR_VERDE = "#3DDC97";
const COLOR_AMBAR = "#F2B134";
const COLOR_ROJO = "#FF6B6B";

function colorEfectividad(pct) {
  if (pct >= 90) return COLOR_VERDE;
  if (pct >= 60) return COLOR_AMBAR;
  return COLOR_ROJO;
}

// Mini resumen del Scorecard semanal para mostrar arriba del dashboard
// (VendorView / StaffView) sin tener que entrar a la pestaña completa.
// - rol="vendedor": su propia efectividad + lugar en el equipo.
// - rol="staff": promedio del equipo + quién va al frente.
// `onAbrir` (opcional) navega a la pestaña completa "scorecard" al tocarlo.
export default function ScorecardMiniResumen({ data, porVendedor, rol, rutaPropia, onAbrir, ventasPeriodo }) {
  const hoy = todayISO();
  const filas = useMemo(() => {
    return (porVendedor || [])
      .map((v) => ({ v, rutaCodigo: v.name.replace("RUTA ", "").trim(), sc: calcularScorecardSemanal(v, data, hoy, ventasPeriodo) }))
      .sort((a, b) => b.sc.efectividadPct - a.sc.efectividadPct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porVendedor, data, hoy, ventasPeriodo]);

  if (filas.length === 0) return null;

  if (rol === "vendedor") {
    const idx = filas.findIndex((f) => f.rutaCodigo === rutaPropia);
    if (idx === -1) return null;
    const propia = filas[idx];
    const color = colorEfectividad(propia.sc.efectividadPct);
    return (
      <button
        onClick={onAbrir}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box",
          background: "#141b2c", border: `1px solid ${color}55`, borderRadius: 10, padding: "10px 14px",
          marginTop: 10, cursor: onAbrir ? "pointer" : "default", textAlign: "left",
        }}
      >
        <TrendingUp size={14} color={color} />
        <span style={{ fontSize: 12.5, color: "#E7ECF7" }}>
          Tu semana: <strong style={{ color }}>{propia.sc.efectividadPct.toFixed(0)}%</strong> · #{idx + 1} del equipo
        </span>
      </button>
    );
  }

  const promedio = filas.reduce((s, f) => s + f.sc.efectividadPct, 0) / filas.length;
  const color = colorEfectividad(promedio);
  const lider = filas[0];
  return (
    <button
      onClick={onAbrir}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", boxSizing: "border-box",
        background: "#141b2c", border: `1px solid ${color}55`, borderRadius: 10, padding: "10px 14px",
        marginTop: 10, cursor: onAbrir ? "pointer" : "default", textAlign: "left", flexWrap: "wrap", gap: 6,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#E7ECF7" }}>
        <TrendingUp size={14} color={color} /> Equipo esta semana: <strong style={{ color }}>{promedio.toFixed(0)}%</strong>
      </span>
      <span style={{ fontSize: 12, color: "#9AA7BD" }}>
        Va al frente: {lider.rutaCodigo} ({lider.sc.efectividadPct.toFixed(0)}%)
      </span>
    </button>
  );
}
