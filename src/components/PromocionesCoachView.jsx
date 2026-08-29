// @ts-nocheck
import React, { useState } from "react";
import { Megaphone, Plus, Trash2, CheckCircle2 } from "lucide-react";

// Promociones para el Coach — panel exclusivo de Gerente. Cada promo activa
// se le manda al coach (via VendorView.jsx → CoachIAView.jsx → api/coach.js)
// para que dé consejo usando precios y combos reales, no inventados.
export default function PromocionesCoachView({ data, persistFresco, puedeEditar = false }) {
  const promociones = puedeEditar ? (data.promocionesCoach || []) : (data.promocionesCoach || []).filter((p) => p.activa);

  const [titulo, setTitulo] = useState("");
  const [precio, setPrecio] = useState("");
  const [detalle, setDetalle] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function agregar() {
    if (!titulo.trim() || !precio.trim()) return;
    setGuardando(true);
    try {
      const nueva = {
        id: "promo_" + Date.now(),
        titulo: titulo.trim(),
        precio: precio.trim(),
        detalle: detalle.trim(),
        activa: true,
      };
      await persistFresco((fresca) => ({
        promocionesCoach: [nueva, ...(fresca.promocionesCoach || [])],
      }));
      setTitulo("");
      setPrecio("");
      setDetalle("");
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActiva(id) {
    await persistFresco((fresca) => ({
      promocionesCoach: (fresca.promocionesCoach || []).map((p) =>
        p.id === id ? { ...p, activa: !p.activa } : p
      ),
    }));
  }

  async function eliminar(id) {
    if (!confirm("¿Eliminar esta promoción?")) return;
    await persistFresco((fresca) => ({
      promocionesCoach: (fresca.promocionesCoach || []).filter((p) => p.id !== id),
    }));
  }

  return (
    <div>
      {puedeEditar && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Megaphone size={16} color="#fbbf24" />
            <span className="display" style={{ fontSize: 14, color: "#E8EDF5" }}>NUEVA PROMOCIÓN</span>
          </div>
          <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 14 }}>
            Solo las promociones marcadas como "Activa" se le mandan al Coach de Ventas — desactiva las que ya vencieron en vez de borrarlas, por si las vuelves a usar.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título, ej. Paquete cupón Mix"
              style={{ width: "100%", boxSizing: "border-box" }}
            />
            <input
              type="text"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="Precio, ej. $331.40"
              style={{ width: "100%", boxSizing: "border-box" }}
            />
            <textarea
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder="Detalle: qué incluye, condiciones, regalo, vigencia. Ej. '3 cajetillas Ice Mix + 2 familia mix, regalo 1 cajetilla familia mix. Válido agosto 2026, sujeto a disponibilidad.'"
              rows={3}
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }}
            />
          </div>

          <button className="btn" onClick={agregar} disabled={guardando || !titulo.trim() || !precio.trim()}>
            <Plus size={13} style={{ verticalAlign: "-2px" }} /> {guardando ? "Guardando..." : "Agregar promoción"}
          </button>
        </div>
      )}

      <div className="display" style={{ fontSize: 13, color: "#9AA7BD", marginBottom: 10 }}>
        PROMOCIONES ({promociones.length})
      </div>

      {promociones.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: "center", color: "#9AA7BD" }}>
          Todavía no hay promociones cargadas para el Coach.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {promociones.map((p) => (
            <div key={p.id} className="card" style={{ padding: 14, opacity: p.activa ? 1 : 0.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#E8EDF5" }}>{p.titulo}</div>
                  <div style={{ fontSize: 13, color: "#F2B134", fontWeight: 600 }}>{p.precio}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: p.activa ? "#3DDC97" : "#9AA7BD", whiteSpace: "nowrap" }}>
                  {p.activa ? "● ACTIVA" : "○ INACTIVA"}
                </span>
              </div>
              {p.detalle && (
                <div style={{ fontSize: 12.5, color: "#9AA7BD", whiteSpace: "pre-wrap", marginBottom: puedeEditar ? 10 : 0 }}>{p.detalle}</div>
              )}
              {puedeEditar && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-ghost" onClick={() => alternarActiva(p.id)}>
                    <CheckCircle2 size={13} style={{ verticalAlign: "-2px" }} /> {p.activa ? "Desactivar" : "Activar"}
                  </button>
                  <button className="btn-ghost" onClick={() => eliminar(p.id)}>
                    <Trash2 size={13} style={{ verticalAlign: "-2px" }} color="#FF6B6B" /> Eliminar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
