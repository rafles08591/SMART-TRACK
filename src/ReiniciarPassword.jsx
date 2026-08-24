// @ts-nocheck
import React, { useState, useEffect } from "react";
import { KeyRound, LoaderCircle, ShieldCheck, ArrowLeft, Search } from "lucide-react";
import { supabase } from "../supabaseClient";

const COLOR = {
  fondoDe: "#0f172a",
  fondoA: "#020617",
  amber: "#fbbf24",
  amberOscuro: "#d97706",
  emerald: "#34d399",
  rose: "#fb7185",
  slate800: "#1e293b",
  slate700: "#334155",
  slate400: "#94a3b8",
  slate100: "#f1f5f9",
};

const USUARIOS = [
  { username: "RUTA J201", email: "j201@smarttrack.local", label: "J201 - Francisco Javier" },
  { username: "RUTA J202", email: "j202@smarttrack.local", label: "J202 - Riqui Martín" },
  { username: "RUTA J203", email: "j203@smarttrack.local", label: "J203 - Ana Paola" },
  { username: "RUTA J204", email: "j204@smarttrack.local", label: "J204 - Noema Natalia" },
  { username: "RUTA J205", email: "j205@smarttrack.local", label: "J205 - Manuel" },
  { username: "RUTA J206", email: "j206@smarttrack.local", label: "J206 - Selene" },
  { username: "RUTA J207", email: "j207@smarttrack.local", label: "J207 - Alfredo Juárez" },
  { username: "SUPERVISOR-1", email: "supervisor1@smarttrack.local", label: "Supervisor 1" },
  { username: "SUPERVISOR-2", email: "supervisor2@smarttrack.local", label: "Supervisor 2" },
  { username: "LIQUIDACION- SULEMA PONCE", email: "liquidacion@smarttrack.local", label: "Liquidación" },
  { username: "ADMIN", email: "admin@smarttrack.local", label: "Admin" },
  { username: "MERCH07", email: "merch07@smarttrack.local", label: "MERCH07" },
  { username: "MERCH28", email: "merch28@smarttrack.local", label: "MERCH28" },
  { username: "MERCH29", email: "merch29@smarttrack.local", label: "MERCH29" },
  { username: "MERCH30", email: "merch30@smarttrack.local", label: "MERCH30" },
  { username: "MERCH04", email: "merch04@smarttrack.local", label: "MERCH04" },
  { username: "MERCH31", email: "merch31@smarttrack.local", label: "MERCH31" },
  { username: "MERCH32", email: "merch32@smarttrack.local", label: "MERCH32" },
  { username: "MERCH62", email: "merch62@smarttrack.local", label: "MERCH62" },
  { username: "MERCH63", email: "merch63@smarttrack.local", label: "MERCH63" },
];

export default function ReiniciarPassword({ onBack, currentUser }) {
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Sesión no válida");
        setLoading(false);
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke("reset-password", {
        body: {
          targetEmail: seleccionado.email,
          newPassword: nuevoPin,
          adminId: user.id,
        },
      });

      if (fnError || data?.error) {
        setError(data?.error || fnError.message || "No se pudo reiniciar el PIN");
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
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(160deg, ${COLOR.fondoDe} 0%, #0c1222 50%, ${COLOR.fondoA} 100%)`,
      color: COLOR.slate100,
      display: "flex",
      flexDirection: "column",
      padding: "28px 20px",
    }}>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .fade-in { animation: fadeInUp 0.35s ease both; }
      `}</style>

      <div style={{ maxWidth: 420, margin: "0 auto", width: "100%" }} className="fade-in">

        {/* Header */}
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: "none",
            color: COLOR.slate400, fontSize: 14, cursor: "pointer",
            marginBottom: 20, padding: 0,
          }}
        >
          <ArrowLeft size={16} /> Volver
        </button>

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
          Solo Gerente y Admin pueden usar esta función
        </p>

        {/* Buscador */}
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
            }}
          />
        </div>

        {/* Lista de usuarios */}
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
              key={u.email}
              onClick={() => { setSeleccionado(u); setExito(false); setError(""); }}
              style={{
                textAlign: "left",
                padding: "12px 14px",
                borderRadius: 12,
                border: seleccionado?.email === u.email
                  ? `1.5px solid ${COLOR.amber}`
                  : "1px solid rgba(255,255,255,0.06)",
                background: seleccionado?.email === u.email
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
        </div>

        {/* Nuevo PIN */}
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
    </div>
  );
}
