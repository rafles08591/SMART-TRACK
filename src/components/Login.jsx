// @ts-nocheck
import React, { useState } from "react";
import { Lock, Eye, EyeOff, LoaderCircle, ShieldCheck, ArrowLeft } from "lucide-react";
import { supabase } from "../supabaseClient";

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

export default function CambiarPassword({ onBack, onSuccess }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [showActual, setShowActual] = useState(false);
  const [showNueva, setShowNueva] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setExito(false);

    if (!actual || !nueva || !confirmar) {
      setError("Completa todos los campos");
      return;
    }
    if (nueva.length < 4) {
      setError("La nueva contraseña debe tener al menos 4 dígitos");
      return;
    }
    if (nueva !== confirmar) {
      setError("Las contraseñas nuevas no coinciden");
      return;
    }
    if (nueva === actual) {
      setError("La nueva contraseña debe ser diferente");
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setError("Sesión no válida. Vuelve a iniciar sesión.");
        setLoading(false);
        return;
      }

      // Verificar contraseña actual
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: actual,
      });

      if (reauthError) {
        setError("La contraseña actual es incorrecta");
        setLoading(false);
        return;
      }

      // Actualizar contraseña
      const { error: updateError } = await supabase.auth.updateUser({
        password: nueva,
      });

      if (updateError) {
        setError(updateError.message || "No se pudo cambiar la contraseña");
        setLoading(false);
        return;
      }

      setExito(true);
      setActual("");
      setNueva("");
      setConfirmar("");

      setTimeout(() => {
        onSuccess?.();
      }, 1200);

    } catch (err) {
      console.error(err);
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%",
    background: COLOR.slate800,
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: "14px 48px 14px 16px",
    color: "#fff",
    fontSize: 16,
    fontFamily: "monospace",
    outline: "none",
    letterSpacing: 2,
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(160deg, ${COLOR.fondoDe} 0%, #0c1222 50%, ${COLOR.fondoA} 100%)`,
      color: COLOR.slate100,
      display: "flex",
      flexDirection: "column",
      padding: "32px 20px",
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

      <div style={{ maxWidth: 400, margin: "0 auto", width: "100%" }} className="fade-in">
        <div style={{ marginBottom: 32 }}>
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
            <Lock size={20} color={COLOR.amber} />
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px 0", color: "#fff" }}>
            Cambiar contraseña
          </h1>
          <p style={{ fontSize: 13, color: COLOR.slate400, margin: 0 }}>
            Tu nueva contraseña se guardará de forma segura
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Contraseña actual */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, color: COLOR.slate400, display: "block", marginBottom: 6 }}>
              Contraseña actual
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showActual ? "text" : "password"}
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                maxLength={8}
                inputMode="numeric"
                style={inputStyle}
                placeholder="••••"
                disabled={loading || exito}
              />
              <button type="button" onClick={() => setShowActual(!showActual)} style={{
                position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", color: COLOR.slate400, cursor: "pointer",
              }}>
                {showActual ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Nueva */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, color: COLOR.slate400, display: "block", marginBottom: 6 }}>
              Nueva contraseña
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showNueva ? "text" : "password"}
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                maxLength={8}
                inputMode="numeric"
                style={inputStyle}
                placeholder="••••"
                disabled={loading || exito}
              />
              <button type="button" onClick={() => setShowNueva(!showNueva)} style={{
                position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", color: COLOR.slate400, cursor: "pointer",
              }}>
                {showNueva ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Confirmar */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, color: COLOR.slate400, display: "block", marginBottom: 6 }}>
              Confirmar nueva contraseña
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showConfirmar ? "text" : "password"}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                maxLength={8}
                inputMode="numeric"
                style={inputStyle}
                placeholder="••••"
                disabled={loading || exito}
              />
              <button type="button" onClick={() => setShowConfirmar(!showConfirmar)} style={{
                position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", color: COLOR.slate400, cursor: "pointer",
              }}>
                {showConfirmar ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <p style={{ color: COLOR.rose, fontSize: 13, fontWeight: 600, textAlign: "center", marginBottom: 16 }}>
              {error}
            </p>
          )}

          {exito && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 8, color: COLOR.emerald, marginBottom: 16, fontWeight: 600,
            }}>
              <ShieldCheck size={18} />
              Contraseña actualizada
            </div>
          )}

          <button
            type="submit"
            disabled={loading || exito}
            style={{
              width: "100%",
              borderRadius: 16,
              background: exito
                ? COLOR.emerald
                : `linear-gradient(135deg, ${COLOR.amber}, ${COLOR.amberOscuro})`,
              border: "none",
              padding: "16px 0",
              fontWeight: 700,
              fontSize: 15,
              color: "#0f172a",
              cursor: (loading || exito) ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: `0 6px 20px ${COLOR.amber}40`,
            }}
          >
            {loading ? (
              <>
                <LoaderCircle size={18} style={{ animation: "spin 0.9s linear infinite" }} />
                Guardando...
              </>
            ) : exito ? "¡Listo!" : "Cambiar contraseña"}
          </button>
        </form>
      </div>
    </div>
  );
}
