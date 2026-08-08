// @ts-nocheck
import React from "react";
import { NOMBRES } from "../constants";
import { money, unidades } from "../utils";

export default function RepartidorAhogadoView({ stats }) {
  const captura = useCapturaImagen();
  const ranking = stats.porVendedor
    .filter((v) => v.hoy.volumen.objetivo > 0)
    .slice()
    .sort((a, b) => a.hoy.efectividadPct - b.hoy.efectividadPct);
  const ultimos3 = ranking.slice(0, 3).map((v) => v.name);

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
            const esUltimos3 = i < 3;
            return (
              <div
                key={v.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10,
                  background: esUltimos3 ? "#2a1414" : "#131C30",
                  border: `1px solid ${esUltimos3 ? "#FF6B6B" : "#1E2A42"}`,
                }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center",
                  background: esUltimos3 ? "#FF6B6B" : "#1E2A42", color: esUltimos3 ? "#2a1414" : "#9AA7BD", fontWeight: 700, fontSize: 12, flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, fontSize: 13, color: "#E8EDF5" }}>
                  {v.name}{NOMBRES[v.name] ? ` · ${NOMBRES[v.name]}` : ""}
                </div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: esUltimos3 ? "#FF6B6B" : v.hoy.efectividadPct >= 80 ? "#3DDC97" : "#F2B134" }}>
                  {v.hoy.efectividadPct.toFixed(0)}%
                </div>
              </div>
            );
          })}
        </div>

        {ultimos3.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ textAlign: "center", fontSize: 12, color: "#FF6B6B", fontWeight: 700, marginBottom: 8 }}>
              ÚLTIMOS 3 LUGARES · EN LA MIRA
            </div>
            <IlustracionAguaTiburones nombres={ultimos3.map((n) => `${n}${NOMBRES[n] ? " · " + NOMBRES[n] : ""}`)} />
          </div>
        )}
      </div>
    </div>
  );
}

// Ilustración SVG: agua ondulada con 3 aletas de tiburón acechando, y un
// repartidor "hundiéndose" en medio — puramente decorativo, sin imágenes externas.
function IlustracionAguaTiburones({ nombres }) {
  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "linear-gradient(180deg, #1a5270 0%, #0d3b52 30%, #06202e 65%, #020c12 100%)" }}>
      <svg viewBox="0 0 400 260" style={{ width: "100%", display: "block" }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="rayo1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#bfe6ff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#bfe6ff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="superficie" cx="50%" cy="0%" r="80%">
            <stop offset="0%" stopColor="#4fa3c7" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#4fa3c7" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Luz de superficie y rayos de sol atravesando el agua */}
        <rect x="0" y="0" width="400" height="90" fill="url(#superficie)" />
        <polygon points="60,0 110,0 40,260 -30,260" fill="url(#rayo1)" />
        <polygon points="180,0 220,0 260,260 200,260" fill="url(#rayo1)" />
        <polygon points="300,0 340,0 400,220 340,260" fill="url(#rayo1)" />

        {/* Burbujas subiendo */}
        <g fill="#bfe6ff" opacity="0.5">
          <circle cx="205" cy="60" r="3" />
          <circle cx="214" cy="80" r="2.2" />
          <circle cx="198" cy="95" r="4" />
          <circle cx="221" cy="105" r="2" />
          <circle cx="192" cy="120" r="2.6" />
        </g>

        {/* Repartidor hundiéndose: cuerpo completo, brazos hacia arriba, cabeza hacia atrás */}
        <g transform="translate(205,128)">
          <circle cx="0" cy="-32" r="10" fill="#F2B134" />
          <path d="M -3 -24 Q 0 -8 -2 10 Q -3 28 2 42" stroke="#F2B134" strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M -4 -18 L -26 -34" stroke="#F2B134" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M 3 -18 L 25 -32" stroke="#F2B134" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M -2 30 L -16 52" stroke="#F2B134" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M 2 32 L 14 54" stroke="#F2B134" strokeWidth="6" fill="none" strokeLinecap="round" />
        </g>

        {/* Tiburones completos acechando desde distintos ángulos */}
        <g fill="#16232c" stroke="#0a141a" strokeWidth="1">
          {/* Tiburón 1: viene de la izquierda */}
          <g transform="translate(60,150) scale(1.05)">
            <path d="M0,10 C18,-6 55,-8 92,4 C110,10 122,9 132,0 C124,14 108,20 90,17 C70,30 28,30 4,20 C-2,17 -3,13 0,10 Z" />
            <path d="M46,-2 L58,-24 L66,0 Z" />
            <path d="M30,16 L20,30 L44,19 Z" />
            <path d="M126,3 L138,-6 L130,10 Z" />
          </g>
          {/* Tiburón 2: viene de la derecha, más cerca */}
          <g transform="translate(360,145) scale(-1.25,1.25)">
            <path d="M0,10 C18,-6 55,-8 92,4 C110,10 122,9 132,0 C124,14 108,20 90,17 C70,30 28,30 4,20 C-2,17 -3,13 0,10 Z" />
            <path d="M46,-2 L58,-24 L66,0 Z" />
            <path d="M30,16 L20,30 L44,19 Z" />
            <path d="M126,3 L138,-6 L130,10 Z" />
          </g>
          {/* Tiburón 3: viene de abajo */}
          <g transform="translate(230,225) scale(0.95) rotate(-18)">
            <path d="M0,10 C18,-6 55,-8 92,4 C110,10 122,9 132,0 C124,14 108,20 90,17 C70,30 28,30 4,20 C-2,17 -3,13 0,10 Z" />
            <path d="M46,-2 L58,-24 L66,0 Z" />
            <path d="M30,16 L20,30 L44,19 Z" />
            <path d="M126,3 L138,-6 L130,10 Z" />
          </g>
        </g>

        {/* Fondo marino: rocas y algas */}
        <g fill="#04141c">
          <ellipse cx="40" cy="255" rx="50" ry="14" />
          <ellipse cx="150" cy="258" rx="65" ry="16" />
          <ellipse cx="290" cy="256" rx="70" ry="15" />
          <ellipse cx="370" cy="258" rx="40" ry="12" />
        </g>
        <g stroke="#0d3b2e" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8">
          <path d="M100,258 Q95,230 105,205 Q112,190 102,170" />
          <path d="M320,258 Q328,225 315,200 Q308,185 320,165" />
        </g>

        {/* Superficie del agua */}
        <path d="M0 40 Q 25 28 50 40 T 100 40 T 150 40 T 200 40 T 250 40 T 300 40 T 350 40 T 400 40 V 0 H 0 Z" fill="#2c7ba0" opacity="0.35" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 8, padding: "0 14px 16px", marginTop: -18, position: "relative" }}>
        {nombres.map((n, i) => (
          <div key={i} style={{ background: "rgba(255,107,107,0.18)", border: "1px solid #FF6B6B", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "#FF6B6B", fontWeight: 700, textAlign: "center" }}>
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}

