// @ts-nocheck
import React, { useState } from "react";
import { NOMBRES } from "../constants";
import { creditosPendientes } from "../utils";
import CreditosView from "./CreditosView";
import AvisosView, { hayAvisoNuevoPara } from "./AvisosView";
import TopBar from "./TopBar";
import TiemposView from "./TiemposView";

export default function TabsLiquidacion({ data, persist, persistFresco, staffUsername, onLogout }) {
  const [tab, setTab] = useState("tiempos");
  const hayNuevo = hayAvisoNuevoPara(data, "liquidacion", null);
  const creditosPendiente = creditosPendientes(data);
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={tab === "tiempos" ? "btn" : "btn-ghost"} style={{ flex: 1 }} onClick={() => setTab("tiempos")}>TIEMPOS</button>
        <button
          className={`${tab === "creditos" ? "btn" : "btn-ghost"} ${creditosPendiente ? "tab-aviso-nuevo" : ""}`}
          style={{ flex: 1 }}
          onClick={() => setTab("creditos")}
        >
          CRÉDITOS
        </button>
        <button
          className={`${tab === "avisos" ? "btn" : "btn-ghost"} ${hayNuevo ? "tab-aviso-nuevo" : ""}`}
          style={{ flex: 1 }}
          onClick={() => setTab("avisos")}
        >
          AVISOS
        </button>
      </div>
      <style>{`
        @keyframes parpadeoNaranjaIntensoTab {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,140,0,0.85); background-color: rgba(255,140,0,0.12); }
          50% { box-shadow: 0 0 0 8px rgba(255,140,0,0); background-color: rgba(255,140,0,0.45); }
        }
        .tab-aviso-nuevo { border: 2px solid #FF8C00 !important; color: #FF8C00 !important; font-weight: 800 !important; animation: parpadeoNaranjaIntensoTab 0.9s ease-in-out infinite; }
      `}</style>
      {tab === "tiempos" ? (
        <TiemposView
          identidad={NOMBRES[staffUsername] || "Sulema Ponce"}
          misAreas={["Liquidación"]}
          onLogout={onLogout}
        />
      ) : tab === "creditos" ? (
        <CreditosView data={data} persistFresco={persistFresco} rol="liquidacion" revisorNombre={NOMBRES[staffUsername] || "Sulema Ponce"} />
      ) : (
        <AvisosView data={data} persist={persist} persistFresco={persistFresco} puedeCrear={false} revisorNombre={null} viewerKey="liquidacion" />
      )}
    </div>
  );
}

// Vista mínima para los usuarios MERCH07/28-30: solo necesitan registrar su
// revisión diaria de unidad (pestaña UNIDADES) y ver Avisos. La pestaña
// UNIDADES parpadea en rojo intenso hasta que registran su revisión de hoy.
