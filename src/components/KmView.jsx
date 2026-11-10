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
  const [paquetes, setPaquetes] = useState(""); // va al Kardex de rutas y equipamiento
  const ultimaConPaq = revisionesHoy
    .filter((r) => r.operativo?.paquetes != null && r.operativo.paquetes !== "")
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
  const [guardando, setGuardando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState(null);

  async function guardar() {
    const valor = String(km).trim();
    const paq = String(paquetes).trim();
    if (!valor && !paq) {
      setError("Escribe el kilometraje y la cantidad de paquetes.");
      return;
    }
    if (!paq && !ultimaConPaq) {
      setError("Escribe también la cantidad de paquetes.");
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
        operativo: { ...(valor ? { kilometraje: valor } : {}), ...(paq ? { paquetes: paq } : {}) },
      });
      setEnviado(true);
      setKm("");
      setPaquetes("");
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
        Captura aquí el kilometraje de tu unidad{unidad?.placas ? ` (${unidad.placas})` : ""} y los paquetes con los que sales — se reflejan directo en el Kardex de salida.
      </div>

      {(ultimaConKm || ultimaConPaq) && (
        <div className="card" style={{ padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, color: "#9AA7BD" }}>Ya capturado hoy</div>
          <div className="mono" style={{ fontSize: 16, color: "#3DDC97", fontWeight: 700, textAlign: "right" }}>
            {ultimaConKm && <>{Number(ultimaConKm.operativo.kilometraje).toLocaleString("es-MX")} km</>}
            {ultimaConPaq && <span style={{ color: "#a78bfa" }}>{ultimaConKm ? " · " : ""}{Number(ultimaConPaq.operativo.paquetes).toLocaleString("es-MX")} paq</span>}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#9AA7BD", flex: "1 1 140px" }}>
            Kilometraje actual
            <input
              type="number"
              inputMode="numeric"
              value={km}
              onChange={(e) => setKm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") guardar(); }}
              placeholder="Ej. 42150"
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#9AA7BD", flex: "1 1 140px" }}>
            Cantidad de paquetes
            <input
              type="number"
              inputMode="numeric"
              value={paquetes}
              onChange={(e) => setPaquetes(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") guardar(); }}
              placeholder="Ej. 350"
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </label>
          <button className="btn" onClick={guardar} disabled={guardando}>
            <Gauge size={14} style={{ verticalAlign: "-2px" }} /> {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
        {error && <div style={{ fontSize: 12, color: "#FF6B6B", marginTop: 10 }}>{error}</div>}
        {enviado && !error && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#3DDC97", marginTop: 10 }}>
            <Check size={13} /> Guardado. Ya aparece en el Kardex de salida.
          </div>
        )}
      </div>
    </div>
  );
}
