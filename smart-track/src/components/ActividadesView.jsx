// @ts-nocheck
import React, { useState } from "react";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { nuevaActividad, fechaHoyISO } from "../utils";

export default function ActividadesView({ ciclo, titulo, data, persist, persistFresco, revisorNombre, puedeEliminar }) {
  const [nuevoTexto, setNuevoTexto] = useState("");
  const [nuevoTipo, setNuevoTipo] = useState("temporal");

  const estado = data.actividades?.[ciclo] || { items: [] };
  const items = estado.items || [];
  const pendientes = items.filter((it) => !it.hecha);
  const hechas = items.filter((it) => it.hecha);

  function marcar(id, hecha) {
    persistFresco((fresca) => {
      const est = fresca.actividades?.[ciclo] || { items: [] };
      const nuevos = (est.items || []).map((it) => (it.id === id ? { ...it, hecha } : it));
      return { actividades: { ...fresca.actividades, [ciclo]: { ...est, items: nuevos } } };
    });
  }
  function agregar() {
    if (!nuevoTexto.trim()) return;
    const nueva = nuevaActividad(nuevoTexto, nuevoTipo, revisorNombre || "Staff", fechaHoyISO());
    persistFresco((fresca) => {
      const est = fresca.actividades?.[ciclo] || { items: [] };
      return { actividades: { ...fresca.actividades, [ciclo]: { ...est, items: [...(est.items || []), nueva] } } };
    });
    setNuevoTexto("");
  }
  function eliminar(id) {
    persistFresco((fresca) => {
      const est = fresca.actividades?.[ciclo] || { items: [] };
      return { actividades: { ...fresca.actividades, [ciclo]: { ...est, items: (est.items || []).filter((it) => it.id !== id) } } };
    });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div className="display" style={{ fontSize: 15, color: "#E8EDF5" }}>{titulo}</div>
        <div style={{ fontSize: 12, color: pendientes.length === 0 ? "#3DDC97" : "#FF6B6B", fontWeight: 700 }}>
          {pendientes.length === 0 ? "TODO COMPLETO" : `${pendientes.length} pendiente${pendientes.length > 1 ? "s" : ""}`}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {items.length === 0 && (
          <div style={{ color: "#9AA7BD", fontSize: 13, textAlign: "center", padding: 20 }}>No hay actividades cargadas.</div>
        )}
        {[...pendientes, ...hechas].map((it) => (
          <div key={it.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => marcar(it.id, !it.hecha)}
              style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${it.hecha ? "#3DDC97" : "#5b6478"}`, background: it.hecha ? "#0f2a20" : "transparent", cursor: "pointer",
              }}
            >
              {it.hecha && <CheckCircle2 size={14} color="#3DDC97" />}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: it.hecha ? "#9AA7BD" : "#E8EDF5", textDecoration: it.hecha ? "line-through" : "none" }}>{it.texto}</div>
              <div style={{ fontSize: 10, color: "#5b6478", marginTop: 2 }}>
                {it.tipo === "fija" ? "Fija" : "Temporal"}{it.creadaPor ? ` · ${it.creadaPor}` : ""}
              </div>
            </div>
            {puedeEliminar && (
              <button className="btn-ghost" onClick={() => eliminar(it.id)}><Trash2 size={13} color="#FF6B6B" /></button>
            )}
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="display" style={{ fontSize: 13, color: "#9AA7BD", marginBottom: 10 }}>AGREGAR ACTIVIDAD</div>
        <input
          type="text"
          value={nuevoTexto}
          onChange={(e) => setNuevoTexto(e.target.value)}
          placeholder="Descripción de la actividad..."
          style={{ width: "100%", boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "10px 12px", marginBottom: 10 }}
        />
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button className={nuevoTipo === "temporal" ? "btn" : "btn-ghost"} style={{ flex: 1, fontSize: 12 }} onClick={() => setNuevoTipo("temporal")}>Temporal (solo hoy/este ciclo)</button>
          <button className={nuevoTipo === "fija" ? "btn" : "btn-ghost"} style={{ flex: 1, fontSize: 12 }} onClick={() => setNuevoTipo("fija")}>Fija (permanente)</button>
        </div>
        <button className="btn" style={{ width: "100%" }} onClick={agregar}>
          <Plus size={14} style={{ verticalAlign: "-2px" }} /> Agregar actividad
        </button>
      </div>
    </div>
  );
}


