// @ts-nocheck
import React, { useState } from "react";
import { Target, Calendar, MapPin, Star } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { OBJETIVO_TABS, MARCAS_OPEN, MARCAS_CHAMPIONS, NOMBRES } from "../constants";
import { fmt, unidades, money, metaColor } from "../utils";
import { RoadProgress, KpiCard, MarcasBreakdown, ObjetivoTabs } from "./ui";

export function RutaProgresoBloque({ vendedor, metricTab }) {
  const m = vendedor.tabs[metricTab];
  const unit = OBJETIVO_TABS.find((t) => t.key === metricTab).unit;
  const chartData = unit === "units" ? vendedor.ventaPorDiaUnidades : vendedor.ventaPorDia;
  const chartKey = unit === "units" ? "paquetes" : "monto";
  return (
    <>
      <RoadProgress pct={m.avancePct} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9AA7BD", marginBottom: 20 }}>
        <span>{fmt(unit, m.avance)} {unit === "units" ? "vendidos" : "vendido"}</span>
        <span>{m.avancePct.toFixed(0)}% de {fmt(unit, m.objetivo)}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <KpiCard icon={<Target size={14} />} label="Resta por vender" value={fmt(unit, m.restaPorVender)} accent="#FF6B6B" />
        <KpiCard icon={<Calendar size={14} />} label="Necesitas vender / día" value={fmt(unit, m.ventaPorDiaNecesaria)} accent="#F2B134" />
        {metricTab === "max" && (
          <>
            <KpiCard icon={<MapPin size={14} />} label="Visitas efectivas" value={vendedor.visitasEfectivas} />
            <KpiCard icon={<Star size={14} />} label="OTC" value={`${money(vendedor.marcaOtc.vendido)} / ${money(vendedor.marcaOtc.objetivo)}`} accent={metaColor(vendedor.marcaOtc.vendido, vendedor.marcaOtc.objetivo)} />
            <KpiCard icon={<Star size={14} />} label={`Comisión OTC (${(vendedor.tasaComisionOtc * 100).toFixed(1)}%)`} value={money(vendedor.comisionOtc)} accent="#3DDC97" />
          </>
        )}
      </div>
      {metricTab === "open" && <MarcasBreakdown titulo="MARCAS · OPEN (PAQUETES)" marcas={MARCAS_OPEN} data={vendedor.marcasOpen} />}
      {metricTab === "champions" && <MarcasBreakdown titulo="MARCAS · CHAMPIONS (PAQUETES)" marcas={MARCAS_CHAMPIONS} data={vendedor.marcasChampions} />}
      <div className="card" style={{ padding: 16 }}>
        <div className="display" style={{ fontSize: 14, marginBottom: 12, color: "#9AA7BD" }}>VENTA POR DÍA{unit === "units" ? " (PAQUETES)" : ""}</div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid stroke="#1E2A42" vertical={false} />
              <XAxis dataKey="fecha" stroke="#9AA7BD" fontSize={11} />
              <YAxis stroke="#9AA7BD" fontSize={11} tickFormatter={(v) => (unit === "units" ? v : `${(v / 1000).toFixed(0)}k`)} />
              <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #2A3852" }} formatter={(v) => (unit === "units" ? unidades(v) : money(v))} />
              <Bar dataKey={chartKey} fill="#F2B134" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

// Pestaña "RUTAS" para staff: elige una ruta y ve exactamente lo mismo que
// ve esa ruta en MAX/OPEN/CHAMPIONS, para seguimiento.
export default function RutasView({ stats }) {
  const [rutaSeleccionada, setRutaSeleccionada] = useState(null);
  const [metricTab, setMetricTab] = useState("max");
  const vendedor = stats.porVendedor.find((v) => v.name === rutaSeleccionada) || stats.porVendedor[0];
  if (!vendedor) return <div style={{ color: "#9AA7BD", fontSize: 13 }}>No hay rutas configuradas.</div>;
  return (
    <div>
      <select
        value={vendedor.name}
        onChange={(e) => setRutaSeleccionada(e.target.value)}
        style={{ background: "#131C30", color: "#E8EDF5", border: "1px solid #1E2A42", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 14, width: "100%" }}
      >
        {stats.porVendedor.map((v) => (
          <option key={v.id} value={v.name}>{v.name}{NOMBRES[v.name] ? ` · ${NOMBRES[v.name]}` : ""}</option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["max", "open", "champions"].map((k) => (
          <button key={k} className={metricTab === k ? "btn" : "btn-ghost"} style={{ flex: 1, fontSize: 13 }} onClick={() => setMetricTab(k)}>
            {k.toUpperCase()}
          </button>
        ))}
      </div>
      <RutaProgresoBloque vendedor={vendedor} metricTab={metricTab} />
    </div>
  );
}

// Suma el OTC de una ruta dentro de un rango de fechas (o de una sola fecha
// si desde===hasta), filtrando solo los códigos de artículo que el gerente
// haya marcado como participantes del rally, y sumando en piezas o en
// dinero según la unidad configurada. Si no se eligió ningún código, se
// suma todo (comportamiento de respaldo).
