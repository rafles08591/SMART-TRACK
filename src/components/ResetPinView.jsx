// @ts-nocheck
import React, { useState } from "react";
import { KeyRound, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "../supabaseClient";

// Panel para que el Gerente restablezca el PIN de cualquier usuario
// (vendedor, merch, supervisor, suplente, etc.) sin depender de correos
// reales ni de entrar manualmente a Supabase. Solo se muestra a Gerente
// (el chequeo real de permiso pasa en el servidor, en api/reset-pin.js —
// esto de aquí es solo la UI).
export default function ResetPinView() {
  const [username, setUsername] = useState("");
  const [nuevoPin, setNuevoPin] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null); // { ok: true } | { error: "..." }

  async function restablecer() {
    setResultado(null);
    if (!username.trim() || !nuevoPin.trim()) {
      setResultado({ error: "Escribe el usuario y el PIN nuevo." });
      return;
    }
    setEnviando(true);
    try {
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion?.session?.access_token;
      if (!token) {
        setResultado({ error: "Tu sesión expiró. Vuelve a iniciar sesión." });
        return;
      }
      const resp = await fetch("/api/reset-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUsername: username.trim(), newPassword: nuevoPin.trim() }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setResultado({ error: json.error || "No se pudo restablecer el PIN." });
        return;
      }
      setResultado({ ok: true });
      setUsername("");
      setNuevoPin("");
    } catch (e) {
      setResultado({ error: e.message || "No se pudo contactar al servidor." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <KeyRound size={16} color="#F2B134" />
        <span className="display" style={{ fontSize: 14, color: "#E8EDF5" }}>RESTABLECER PIN</span>
      </div>

      <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 16 }}>
        Escribe el usuario tal cual aparece en la pantalla de Login (ej. SUPLENTE-1, RUTA J201, MERCH32, SUPERVISOR-1) y el PIN nuevo. Se cambia de inmediato, no manda ningún correo.
      </div>

      <div style={{ marginBottom: 12 }}>
        <div className="display" style={{ fontSize: 11, color: "#9AA7BD", marginBottom: 6 }}>USUARIO</div>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Ej. SUPLENTE-1"
          style={{ width: "100%", maxWidth: 320, boxSizing: "border-box" }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div className="display" style={{ fontSize: 11, color: "#9AA7BD", marginBottom: 6 }}>PIN NUEVO</div>
        <input
          type="text"
          inputMode="numeric"
          value={nuevoPin}
          onChange={(e) => setNuevoPin(e.target.value)}
          placeholder="Mínimo 6 caracteres"
          style={{ width: "100%", maxWidth: 320, boxSizing: "border-box" }}
        />
      </div>

      {resultado?.error && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#FF6B6B", fontSize: 12.5, marginBottom: 12 }}>
          <AlertCircle size={14} /> {resultado.error}
        </div>
      )}
      {resultado?.ok && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#3DDC97", fontSize: 12.5, marginBottom: 12 }}>
          <CheckCircle2 size={14} /> PIN actualizado. Avísale al usuario su nuevo PIN.
        </div>
      )}

      <button className="btn" onClick={restablecer} disabled={enviando}>
        <KeyRound size={13} style={{ verticalAlign: "-2px" }} /> {enviando ? "Restableciendo..." : "Restablecer PIN"}
      </button>
    </div>
  );
}
