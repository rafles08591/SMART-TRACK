// @ts-nocheck
import React, { useState } from "react";
import { KeyRound, LoaderCircle, ShieldCheck, Search } from "lucide-react";
import { supabase } from "../supabaseClient";

// Restablecer PIN — panel exclusivo de Gerente (el chequeo real de permiso
// pasa en el servidor, en api/reset-pin.js; esto de aquí es solo la UI).
//
// Historia: hubo un intento anterior (ReiniciarPassword.jsx) con esta misma
// interfaz, pero llamaba a una Supabase Edge Function ("reset-password") que
// nunca se creó, por eso nunca funcionó. Esta versión llama en su lugar a
// /api/reset-pin (función serverless de Vercel) que sí existe y ya verifica
// del lado del servidor que quien llama sea de verdad Gerente antes de tocar
// nada — ver api/reset-pin.js para el detalle de esa verificación.

const COLOR = {
  fondoDe: "#0f172a",
  fondoA: "#020617",
  amber: "#fbbf24",
  amberOscuro: "#d97706",
  emerald: "#34d399",
  rose: "#fb7185",
  slate800: "#1e293b",
  slate400: "#94a3b8",
  slate100: "#f1f5f9",
};

// Lista para el buscador. Igual que en el intento anterior, esto es una
// copia estática de los usuarios — si agregas un usuario nuevo en Supabase
// (o cambias un nombre), hay que reflejarlo aquí también a mano. Si más
// adelante esto molesta, se puede cambiar para traerla en vivo desde la
// tabla profiles en vez de tenerla fija en el código.
const USUARIOS = [
  { username: "RUTA J201", label: "J201 - Francisco Javier" },
  { username: "RUTA J202", label: "J202 - Riqui Martín" },
  { username: "RUTA J203", label: "J203 - Ana Paola" },
  { username: "RUTA J204", label: "J204 - Noema Natalia" },
  { username: "RUTA J205", label: "J205 - Manuel" },
  { username: "RUTA J206", label: "J206 - Selene" },
  { username: "RUTA J207", label: "J207 - Alfredo Juárez" },
  { username: "SUPERVISOR-1", label: "Supervisor 1 - Christian Velasco" },
  { username: "SUPERVISOR-2", label: "Supervisor 2" },
  { username: "SUPLENTE-1", label: "Suplente 1" },
  { username: "SUPLENTE-2", label: "Suplente 2" },
  { username: "LIQUIDACION- SULEMA PONCE", label: "Liquidación" },
  { username: "ADMIN", label: "Admin" },
  { username: "MERCH07", label: "MERCH07" },
  { username: "MERCH28", label: "MERCH28" },
  { username: "MERCH29", label: "MERCH29" },
  { username: "MERCH30", label: "MERCH30" },
  { username: "MERCH04", label: "MERCH04" },
  { username: "MERCH31", label: "MERCH31" },
  { username: "MERCH32", label: "MERCH32" },
  { username: "MERCH62", label: "MERCH62" },
  { username: "MERCH63", label: "MERCH63" },
];

export default function ResetPinView() {
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);
  const [nuevoPin, setNuevoPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);

  const filtrados = USUARIOS.filter((u) =>
    u.label.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.username.toLowerCase().includes(busqueda.toLowerCase())
  );

  const handleReiniciar = async () => {
    if (!seleccionado || !nuevoPin) {
      setError("Selecciona un usuario y escribe el nuevo PIN");
      return;
    }
    if (nuevoPin.length < 4) {
      setError("El PIN debe tener al menos 4 dígitos");
      return;
    }

    setLoading(true);
    setError("");
    setExito(false);

    try {
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion?.session?.access_token;
      if (!token) {
        setError("Tu sesión expiró. Vuelve a iniciar sesión.");
        setLoading(false);
        return;
      }

      const resp = await fetch("/api/reset-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUsername: seleccionado.username, newPassword: nuevoPin }),
      });
      const json = await resp.json();

      if (!resp.ok) {
        setError(json.error || "No se pudo reiniciar el PIN");
        setLoading(false);
        return;
      }

      setExito(true);
      setNuevoPin("");
      setTimeout(() => {
        setExito(false);
        setSeleccionado(null);
      }, 2000);
    } catch (err) {
      console.error(err);
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", width: "100%" }}>
      <div style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        height: 48, width: 48, borderRadius: "50%",
        background: `linear-gradient(145deg, ${COLOR.fondoDe}, #1a2336)`,
        border: `1.5px solid ${COLOR.amber}80`,
        boxShadow: `0 0 20px ${COLOR.amber}30`,
        marginBottom: 14,
      }}>
        <KeyRound size={20} color={COLOR.amber} />
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px 0", color: "#fff" }}>
        Reiniciar PIN
      </h1>
      <p style={{ fontSize: 13, color: COLOR.slate400, marginBottom: 24 }}>
        Solo Gerente puede usar esta función
      </p>

      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={16} style={{
          position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
          color: COLOR.slate400,
        }} />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar usuario..."
          style={{
            width: "100%",
            background: COLOR.slate800,
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: "12px 14px 12px 42px",
            color: "#fff",
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{
        maxHeight: 260,
        overflowY: "auto",
        marginBottom: 20,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}>
        {filtrados.map((u) => (
          <button
            key={u.username}
            onClick={() => { setSeleccionado(u); setExito(false); setError(""); }}
            style={{
              textAlign: "left",
              padding: "12px 14px",
              borderRadius: 12,
              border: seleccionado?.username === u.username
                ? `1.5px solid ${COLOR.amber}`
                : "1px solid rgba(255,255,255,0.06)",
              background: seleccionado?.username === u.username
                ? "rgba(251,191,36,0.1)"
                : COLOR.slate800,
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {u.label}
          </button>
        ))}
        {filtrados.length === 0 && (
          <div style={{ fontSize: 13, color: COLOR.slate400, padding: "12px 4px" }}>
            Sin resultados. Si es un usuario nuevo que no está en esta lista, avísame para agregarlo.
          </div>
        )}
      </div>

      {seleccionado && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: COLOR.slate400, display: "block", marginBottom: 6 }}>
            Nuevo PIN para {seleccionado.label}
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={nuevoPin}
            onChange={(e) => setNuevoPin(e.target.value.replace(/\D/g, ""))}
            placeholder="Ej: 1234"
            style={{
              width: "100%",
              background: COLOR.slate800,
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: "14px 16px",
              color: "#fff",
              fontSize: 18,
              fontFamily: "monospace",
              letterSpacing: 4,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      )}

      {error && (
        <p style={{ color: COLOR.rose, fontSize: 13, fontWeight: 600, textAlign: "center", marginBottom: 14 }}>
          {error}
        </p>
      )}

      {exito && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, color: COLOR.emerald, marginBottom: 14, fontWeight: 600,
        }}>
          <ShieldCheck size={18} />
          PIN reiniciado correctamente
        </div>
      )}

      <button
        onClick={handleReiniciar}
        disabled={loading || !seleccionado || !nuevoPin}
        style={{
          width: "100%",
          borderRadius: 16,
          background: `linear-gradient(135deg, ${COLOR.amber}, ${COLOR.amberOscuro})`,
          border: "none",
          padding: "15px 0",
          fontWeight: 700,
          fontSize: 15,
          color: "#0f172a",
          cursor: (loading || !seleccionado || !nuevoPin) ? "default" : "pointer",
          opacity: (loading || !seleccionado || !nuevoPin) ? 0.5 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {loading ? (
          <>
            <LoaderCircle size={18} style={{ animation: "spin 0.9s linear infinite" }} />
            Reiniciando...
          </>
        ) : (
          "Reiniciar PIN"
        )}
      </button>
    </div>
  );
}
