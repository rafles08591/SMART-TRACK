// @ts-nocheck
import React, { useState } from "react";
import { Sparkles, Send, RefreshCw } from "lucide-react";

// Coach de ventas con IA — pantalla para el vendedor. No guarda nada en el
// blob `data` de smart-track (por ahora es sin memoria entre sesiones), solo
// le manda al endpoint /api/coach un resumen del avance/ventas del vendedor
// (ya calculado por el componente padre) + una pregunta opcional, y muestra
// el consejo que regresa.
//
// Props esperadas (a definir/ajustar al integrarlo en VendorView.jsx):
// - vendedorNombre: string
// - resumenObjetivo: string, ej. "83% del objetivo mensual, faltan 3 días y $12,400 por vender"
// - resumenVentas: string, ej. "Ice Mix: 120 cajas · Blossom Mix: 40 cajas · OTC: $3,200 · Sin Vuala: sí"
export default function CoachIAView({ vendedorNombre, resumenObjetivo, resumenVentas, resumenPromociones }) {
  const [pregunta, setPregunta] = useState("");
  const [consejo, setConsejo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const pedirConsejo = async (preguntaEnviada) => {
    setCargando(true);
    setError(null);
    try {
      const resp = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendedorNombre,
          resumenObjetivo,
          resumenVentas,
          resumenPromociones,
          pregunta: preguntaEnviada,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Error del coach");
      setConsejo(json.consejo);
    } catch (e) {
      setError(e.message || "No se pudo contactar al coach.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Sparkles size={16} color="#a78bfa" />
        <span className="display" style={{ fontSize: 14, color: "#E8EDF5" }}>COACH DE VENTAS</span>
      </div>

      <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 14 }}>
        {resumenObjetivo || "Sin avance disponible todavía."}
      </div>

      {!consejo && !cargando && (
        <button className="btn" onClick={() => pedirConsejo(null)} style={{ width: "100%", marginBottom: 12 }}>
          <Sparkles size={13} style={{ verticalAlign: "-2px" }} /> Pídele consejo a tu coach
        </button>
      )}

      {cargando && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#9AA7BD", fontSize: 13, padding: "12px 0" }}>
          <RefreshCw size={14} className="spin" /> Pensando...
        </div>
      )}

      {error && (
        <div style={{ color: "#FF6B6B", fontSize: 12, marginBottom: 12 }}>{error}</div>
      )}

      {consejo && !cargando && (
        <div style={{
          background: "#141b2c", border: "1px solid #a78bfa", borderRadius: 10,
          padding: 14, fontSize: 13, color: "#E8EDF5", lineHeight: 1.5, marginBottom: 14,
          whiteSpace: "pre-wrap",
        }}>
          {consejo}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          placeholder="O pregúntale algo específico, ej. 'cómo le hago con un cliente que ya me dijo que no'"
          style={{ flex: 1, boxSizing: "border-box" }}
          onKeyDown={(e) => { if (e.key === "Enter" && pregunta.trim() && !cargando) pedirConsejo(pregunta.trim()); }}
        />
        <button
          className="btn"
          onClick={() => pregunta.trim() && pedirConsejo(pregunta.trim())}
          disabled={cargando || !pregunta.trim()}
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}
