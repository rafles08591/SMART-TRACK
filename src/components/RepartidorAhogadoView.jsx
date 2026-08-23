// @ts-nocheck
import React from "react";
import { NOMBRES } from "../constants";
import { money, unidades, fechaHoyISO } from "../utils";
import { BotonGuardarImagen } from "./ui";
import { useCapturaImagen } from "./hooks";

// Sube tu imagen al bucket de Supabase Storage que uses para este tipo de
// assets (por ejemplo el mismo "promociones") y pega aquí la URL pública.
// Así el archivo del componente no se llena de SVG/base64.
const IMAGEN_REPARTIDOR_AHOGADO =
  "https://jxyosutthiuzbrmdznoa.supabase.co/storage/v1/object/public/promociones/IMG_0571.jpeg";

export default function RepartidorAhogadoView({ stats }) {
  const captura = useCapturaImagen();
  const ranking = stats.porVendedor
    .filter((v) => v.hoy.volumen.objetivo > 0)
    .slice()
    .sort((a, b) => a.hoy.efectividadPct - b.hoy.efectividadPct);
  const peor = ranking.slice(0, 1).map((v) => v.name);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div className="display" style={{ fontSize: 16, color: "#E8EDF5" }}>REPARTIDOR AHOGADO</div>
        <BotonGuardarImagen captura={captura} nombreArchivo={`repartidor_ahogado_${fechaHoyISO()}.png`} />
      </div>

      <div ref={captura.capturaRef} className="card" style={{ padding: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <div className="display" style={{ fontSize: 18, color: "#E8EDF5" }}>RANKING · REPARTIDOR AHOGADO</div>
          <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 4 }}>Efectividad del día · {fechaHoyISO()}</div>
        </div>

        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          {ranking.map((v, i) => {
            const esUltimo = i === 0;
            return (
              <div
                key={v.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10,
                  background: esUltimo ? "#2a1414" : "#131C30",
                  border: `1px solid ${esUltimo ? "#FF6B6B" : "#1E2A42"}`,
                }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center",
                  background: esUltimo ? "#FF6B6B" : "#1E2A42", color: esUltimo ? "#2a1414" : "#9AA7BD", fontWeight: 700, fontSize: 12, flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, fontSize: 13, color: "#E8EDF5" }}>
                  {v.name}{NOMBRES[v.name] ? ` · ${NOMBRES[v.name]}` : ""}
                </div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: esUltimo ? "#FF6B6B" : v.hoy.efectividadPct >= 80 ? "#3DDC97" : "#F2B134" }}>
                  {v.hoy.efectividadPct.toFixed(0)}%
                </div>
              </div>
            );
          })}
        </div>

        {peor.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ textAlign: "center", fontSize: 12, color: "#FF6B6B", fontWeight: 700, marginBottom: 8 }}>
              ÚLTIMO LUGAR · EN LA MIRA
            </div>
            <IlustracionRepartidorAhogado nombres={peor.map((n) => `${n}${NOMBRES[n] ? " · " + NOMBRES[n] : ""}`)} />
          </div>
        )}
      </div>
    </div>
  );
}

// Ilustración: la imagen que subiste a Supabase Storage, con el nombre del
// último lugar superpuesto y centrado sobre ella — bien notorio, con glow
// y contraste fuerte.
function IlustracionRepartidorAhogado({ nombres }) {
  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#020c12" }}>
      <img
        src={IMAGEN_REPARTIDOR_AHOGADO}
        alt="Repartidor ahogado — último lugar"
        style={{ width: "100%", display: "block", objectFit: "cover" }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "6%",
          transform: "translateX(-50%)",
          width: "92%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        }}
      >
        {nombres.map((n, i) => (
          <div
            key={i}
            style={{
              background: "linear-gradient(180deg, rgba(255,60,60,0.35), rgba(90,10,10,0.55))",
              backdropFilter: "blur(2px)",
              border: "2px solid #FF3B3B",
              borderRadius: 999,
              padding: "8px 20px",
              fontSize: 15,
              fontWeight: 900,
              letterSpacing: 0.3,
              color: "#FFFFFF",
              textAlign: "center",
              textShadow: "0 0 8px rgba(255,59,59,0.9), 0 2px 4px rgba(0,0,0,0.8)",
              boxShadow: "0 0 18px rgba(255,59,59,0.65), inset 0 0 10px rgba(255,120,120,0.35)",
              whiteSpace: "nowrap",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}
