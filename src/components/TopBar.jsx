// @ts-nocheck
import React from "react";
import { LogOut, RefreshCw } from "lucide-react";

export default function TopBar({ title, subtitle, onLogout, onRefresh, refrescando }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
      <div>
        <h1 className="display" style={{ fontSize: 24, margin: 0 }}>{title}</h1>
        <div style={{ fontSize: 12, color: "#9AA7BD" }}>{subtitle}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {onRefresh && (
          <button className="btn-ghost" onClick={onRefresh} disabled={refrescando}>
            <RefreshCw size={14} style={{ verticalAlign: "-2px", animation: refrescando ? "spin 1s linear infinite" : "none" }} /> {refrescando ? "..." : "Refrescar"}
          </button>
        )}
        <button className="btn-ghost" onClick={onLogout}><LogOut size={14} style={{ verticalAlign: "-2px" }} /> Salir</button>
      </div>
    </div>
  );
}

