// @ts-nocheck
import React, { useState } from "react";
import { Truck, AlertCircle, ChevronRight } from "lucide-react";
import { USERS, NOMBRES } from "../constants";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState(USERS[0].username);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit() {
    const user = USERS.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password.trim()
    );
    if (user) {
      setError("");
      onLogin(user);
    } else {
      setError("Usuario o contraseña incorrectos.");
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 380, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Truck size={26} color="#F2B134" />
          <h1 className="display" style={{ fontSize: 22, margin: 0 }}>Ruta de Ventas</h1>
        </div>
        <p style={{ color: "#9AA7BD", fontSize: 13, marginTop: 0, marginBottom: 22 }}>
          Ingresa con tu usuario y contraseña.
        </p>

        <label style={{ fontSize: 12, color: "#9AA7BD" }}>Usuario</label>
        <select style={{ width: "100%", marginTop: 6, marginBottom: 14 }} value={username} onChange={(e) => setUsername(e.target.value)}>
          {USERS.map((u) => (
            <option key={u.username} value={u.username}>
              {u.username}{NOMBRES[u.username] ? ` — ${NOMBRES[u.username]}` : ""}
            </option>
          ))}
        </select>

        <label style={{ fontSize: 12, color: "#9AA7BD" }}>Contraseña</label>
        <input
          type="password"
          style={{ width: "100%", marginTop: 6, marginBottom: 16, boxSizing: "border-box" }}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />

        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#FF6B6B", fontSize: 12, marginBottom: 14 }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <button className="btn" type="button" onClick={submit} style={{ width: "100%" }}>
          Entrar <ChevronRight size={14} style={{ verticalAlign: "-2px" }} />
        </button>
      </div>
    </div>
  );
}

// Hook reutilizable: genera una imagen PNG de cualquier bloque (usando
// capturaRef) y la guarda/comparte con un solo toque. Se usa en Mesa de
// Control, la tabla POR RUTA HOY, el ranking Repartidor Ahogado y Rally OTC.
