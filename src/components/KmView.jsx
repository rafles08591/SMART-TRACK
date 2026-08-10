// @ts-nocheck
import React, { useState } from "react";
import { Gauge, Check } from "lucide-react";

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function fechaLocalMX(fechaIso) {
  if (!fechaIso) return "";
  try {
    return new Date(fechaIso).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  } catch (e) {
    return String(fechaIso).slice(0, 10);
  }
}

/**
 * Pestaña KM — captura directa y simple del kilometraje, exclusiva para las
 * rutas que la tengan habilitada (por ahora J201 y J203). No reemplaza el
 * checklist de UNIDADES ni lo de TIEMPOS: solo guarda el kilometraje en un
 * registro ligero dentro de "revisionesUnidades" (marcado con
 * "esSoloKm: true" para no confundirse con una revisión completa), usando
 * el mismo mecanismo que ya lee la tabla "Salida de hoy" en UNIDADES — así
 * el número aparece ahí solo, sin tocar nada más de esas dos pantallas.
 *
 * Props:
 * - data, persistRevisionUnidad: vienen de App.tsx (los mismos que usa UnidadesView).
 * - rutaPropia: código corto de la ruta (ej. "J201").
 * - identidad: nombre a mostrar como "capturó".
 */
export default function KmView({ data, persistRevisionUnidad, rutaPropia, identidad }) {
  const unidadId = data.asignacionesUnidades?.[rutaPropia] || "";
  const unidad = (data.unidadesFlota || []).find((u) => u.id === unidadId);
  const hoy = todayISO();
  const revisionesHoy = (data.revisionesUnidades || []).filter(
    (r) => r.unidadId === unidadId && fechaLocalMX(r.fecha) === hoy
  );
  const ultimaConKm = revisionesHoy
    .filter((r) => r.operativo?.kilometraje)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];

  const [km, setKm] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState(null);

  async function guardar() {
    const valor = String(km).trim();
    if (!valor) {
      setError("Escribe el kilometraje.");
      return;
    }
    if (!unidadId) {
      setError("Todavía no tienes una unidad asignada — pídele al Gerente que te asigne una en UNIDADES antes de capturar el km.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await persistRevisionUnidad({
        id: `KM-${Date.now()}`,
        unidadId,
        ruta: rutaPropia,
        fecha: new Date().toISOString(),
        capturadoPor: identidad,
        esSoloKm: true,
        operativo: { kilometraje: valor },
      });
      setEnviado(true);
      setKm("");
    } catch (err) {
      console.error("Error guardando km:", err);
      setError("No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="display" style={{ fontSize: 16, color: "#E8EDF5", marginBottom: 6 }}>KILOMETRAJE</div>
      <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 16 }}>
        Captura aquí el kilometraje de tu unidad{unidad?.placas ? ` (${unidad.placas})` : ""} — se refleja directo en "Salida de hoy".
      </div>

      {ultimaConKm && (
        <div className="card" style={{ padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#9AA7BD" }}>Ya capturado hoy</div>
          <div className="mono" style={{ fontSize: 16, color: "#3DDC97", fontWeight: 700 }}>
            {Number(ultimaConKm.operativo.kilometraje).toLocaleString("es-MX")} km
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>Kilometraje actual</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            type="number"
            inputMode="numeric"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") guardar(); }}
            placeholder="Ej. 42150"
            style={{ flex: "1 1 160px", boxSizing: "border-box" }}
          />
          <button className="btn" onClick={guardar} disabled={guardando}>
            <Gauge size={14} style={{ verticalAlign: "-2px" }} /> {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
        {error && <div style={{ fontSize: 12, color: "#FF6B6B", marginTop: 10 }}>{error}</div>}
        {enviado && !error && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#3DDC97", marginTop: 10 }}>
            <Check size={13} /> Kilometraje guardado.
          </div>
        )}
      </div>
    </div>
  );
}
