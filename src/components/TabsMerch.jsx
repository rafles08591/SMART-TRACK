// @ts-nocheck
import React, { useState } from "react";
import { NOMBRES, USERS } from "../constants";
import UnidadesView, { unidadYaRegistradaHoy, cloDeRuta, CLO_PVR, CLO_TEPIC } from "./UnidadesView";
import TiemposView from "./TiemposView";
import AvisosView, { hayAvisoNuevoPara } from "./AvisosView";
import TopBar from "./TopBar";

export default function TabsMerch({ data, persist, persistFresco, persistRevisionUnidad, persistConfigUnidades, staffUsername, onLogout }) {
  const [tab, setTab] = useState("unidades");
  const hayNuevo = hayAvisoNuevoPara(data, staffUsername, staffUsername);
  const yaRegistroHoy = unidadYaRegistradaHoy(data, staffUsername);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="display" style={{ fontSize: 18, fontWeight: 700 }}>{staffUsername}</div>
        <button className="btn-ghost" onClick={onLogout}>Salir</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className={`${tab === "unidades" ? "btn" : "btn-ghost"} ${!yaRegistroHoy ? "tab-pendiente-urgente" : ""}`}
          style={{ flex: 1 }}
          onClick={() => setTab("unidades")}
        >
          UNIDADES
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
        @keyframes parpadeoRojoIntensoTab {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,0,0,0.9); background-color: rgba(255,0,0,0.18); }
          50% { box-shadow: 0 0 0 10px rgba(255,0,0,0); background-color: rgba(255,0,0,0.55); }
        }
        .tab-pendiente-urgente { border: 2px solid #FF0000 !important; color: #FF0000 !important; font-weight: 800 !important; animation: parpadeoRojoIntensoTab 0.7s ease-in-out infinite; }
      `}</style>
      {tab === "unidades" ? (
        <UnidadesView data={data} persistRevisionUnidad={persistRevisionUnidad} persistConfigUnidades={persistConfigUnidades} rol="merch" puesto={null} identidad={staffUsername} rutaPropia={staffUsername} cloFiltro={cloDeRuta(staffUsername)} />
      ) : (
        <AvisosView data={data} persist={persist} persistFresco={persistFresco} puedeCrear={false} revisorNombre={null} verComoRuta={staffUsername} viewerKey={staffUsername} />
      )}
    </div>
  );
}

