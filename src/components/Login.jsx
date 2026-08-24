// @ts-nocheck
import React, { useState, useCallback, useEffect } from "react";
import {
  Fingerprint, Delete, LoaderCircle, Crown, Users, Wallet, Route,
  ChevronLeft, MapPin, Settings, ShieldCheck
} from "lucide-react";
import { supabase } from "../supabaseClient"; // ← Ruta corregida

// ============================================================
// MAPEO DE USUARIOS → EMAIL (Supabase Auth)
// ============================================================
const USER_EMAIL_MAP = {
  "RUTA J201": "j201@smarttrack.local",
  "RUTA J202": "j202@smarttrack.local",
  "RUTA J203": "j203@smarttrack.local",
  "RUTA J204": "j204@smarttrack.local",
  "RUTA J205": "j205@smarttrack.local",
  "RUTA J206": "j206@smarttrack.local",
  "RUTA J207": "j207@smarttrack.local",
  "SUPERVISOR-1": "supervisor1@smarttrack.local",
  "SUPERVISOR-2": "supervisor2@smarttrack.local",
  "GERENTE": "gerente@smarttrack.local",
  "LIQUIDACION- SULEMA PONCE": "liquidacion@smarttrack.local",
  "ADMIN": "admin@smarttrack.local",
  "MERCH07": "merch07@smarttrack.local",
  "MERCH28": "merch28@smarttrack.local",
  "MERCH29": "merch29@smarttrack.local",
  "MERCH30": "merch30@smarttrack.local",
  "MERCH04": "merch04@smarttrack.local",
  "MERCH31": "merch31@smarttrack.local",
  "MERCH32": "merch32@smarttrack.local",
  "MERCH62": "merch62@smarttrack.local",
  "MERCH63": "merch63@smarttrack.local",
};

// ============================================================
// CONSTANTES VISUALES
// ============================================================
const COLOR = {
  fondoDe: "#0f172a",
  fondoA: "#020617",
  amber: "#fbbf24",
  amberOscuro: "#d97706",
  emerald: "#34d399",
  emeraldOscuro: "#059669",
  rose: "#fb7185",
  slate800: "#1e293b",
  slate700: "#334155",
  slate600: "#475569",
  slate400: "#94a3b8",
  slate300: "#cbd5e1",
  slate100: "#f1f5f9",
};

const PIN_LENGTH = 4;
const RECORDADO_KEY = "smarttrack_ultimo_usuario";

// ============================================================
// HELPERS
// ============================================================
function leerUsuarioRecordado() {
  try { return localStorage.getItem(RECORDADO_KEY) || null; } catch { return null; }
}
function guardarUsuarioRecordado(username) {
  try { localStorage.setItem(RECORDADO_KEY, username); } catch {}
}
function borrarUsuarioRecordado() {
  try { localStorage.removeItem(RECORDADO_KEY); } catch {}
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function Login({ onLogin }) {
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
  }, []);

  const [step, setStep] = useState("root");
  const [origin, setOrigin] = useState("root");
  const [clo, setClo] = useState(null);
  const [objetivo, setObjetivo] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [recordado, setRecordado] = useState(null);

  useEffect(() => {
    const username = leerUsuarioRecordado();
    if (username && USER_EMAIL_MAP[username]) {
      const obj = {
        username,
        label: username.startsWith("RUTA ") ? username.replace("RUTA ", "") : username,
        sub: username.startsWith("RUTA ") ? "Ruta de venta" : username,
      };
      setObjetivo(obj);
      setRecordado(obj);
      setStep("pin");
    }
  }, []);

  const resetPin = useCallback(() => {
    setPin("");
    setError("");
    setSuccess(false);
  }, []);

  const goRoot = useCallback(() => {
    setStep("root");
    setClo(null);
    setObjetivo(null);
    resetPin();
  }, [resetPin]);

  // ======================
  // LOGIN REAL CON SUPABASE
  // ======================
  const verify = useCallback(async (pinValue) => {
    if (!objetivo?.username) return;

    setLoading(true);
    setError("");

    const email = USER_EMAIL_MAP[objetivo.username];
    if (!email) {
      setError("Usuario no configurado");
      setLoading(false);
      resetPin();
      return;
    }

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: pinValue,
      });

      if (authError) {
        setError("PIN incorrecto");
        setLoading(false);
        resetPin();
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        setError("Perfil no encontrado");
        setLoading(false);
        resetPin();
        return;
      }

      if (!profile.active) {
        await supabase.auth.signOut();
        setError("Usuario desactivado");
        setLoading(false);
        resetPin();
        return;
      }

      setSuccess(true);
      guardarUsuarioRecordado(objetivo.username);

      setTimeout(() => {
        onLogin?.(profile);
      }, 600);

    } catch (err) {
      console.error(err);
      setError("Error de conexión");
      setLoading(false);
      resetPin();
    }
  }, [objetivo, onLogin, resetPin]);

  // ======================
  // MANEJO DEL PIN
  // ======================
  const pressDigit = useCallback((d) => {
    if (loading || success || pin.length >= PIN_LENGTH) return;
    setError("");
    setPin((prev) => {
      const next = (prev + d).slice(0, PIN_LENGTH);
      if (next.length === PIN_LENGTH) {
        setTimeout(() => verify(next), 80);
      }
      return next;
    });
  }, [loading, success, pin.length, verify]);

  const pressDelete = useCallback(() => {
    if (loading || success) return;
    setPin((prev) => prev.slice(0, -1));
    setError("");
  }, [loading, success]);

  const backFromPin = useCallback(() => {
    resetPin();
    setObjetivo(null);
    if (origin === "merch") { setStep("merch"); return; }
    if (origin === "staff") { setStep("staff"); return; }
    setStep("root");
  }, [origin, resetPin]);

  const cambiarUsuario = useCallback(() => {
    borrarUsuarioRecordado();
    setRecordado(null);
    goRoot();
  }, [goRoot]);

  // Teclado físico
  useEffect(() => {
    if (step !== "pin") return;
    function onKeyDown(e) {
      if (loading || success) return;
      if (e.key === "Backspace" || e.key === "Delete" || e.key === "Escape" || /^[0-9]$/.test(e.key)) {
        e.preventDefault();
      }
      if (/^[0-9]$/.test(e.key)) pressDigit(e.key);
      if (e.key === "Backspace" || e.key === "Delete") pressDelete();
      if (e.key === "Escape") backFromPin();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, loading, success, pressDigit, pressDelete, backFromPin]);

  // ======================
  // DATOS DE BOTONES
  // ======================
  const RUTAS = ["RUTA J201","RUTA J202","RUTA J203","RUTA J204","RUTA J205","RUTA J206","RUTA J207"];
  const RUTAS_BOTONES = RUTAS.map((full) => ({ full, corto: full.replace("RUTA ", "") }));

  const pickRuta = (full, corto) => {
    setObjetivo({ username: full, label: corto, sub: "Ruta de venta" });
    setOrigin("root");
    setStep("pin");
    resetPin();
  };

  const pickGerente = () => {
    setObjetivo({ username: "GERENTE", label: "Gerente", sub: "Gerente" });
    setOrigin("root");
    setStep("pin");
    resetPin();
  };

  const pickSupervisor1 = () => {
    setObjetivo({ username: "SUPERVISOR-1", label: "Supervisor 1", sub: "Supervisor 1" });
    setOrigin("root");
    setStep("pin");
    resetPin();
  };

  const STAFF_LISTA = [
    { username: "SUPERVISOR-2", nombre: "Supervisor 2", rolLabel: "Supervisor 2", Icon: Users },
    { username: "LIQUIDACION- SULEMA PONCE", nombre: "Sulema Ponce", rolLabel: "Liquidación", Icon: Wallet },
    { username: "ADMIN", nombre: "Admin", rolLabel: "Administrador", Icon: Settings },
  ];

  const pickStaff = (s) => {
    setObjetivo({ username: s.username, label: s.nombre, sub: s.rolLabel });
    setOrigin("staff");
    setStep("pin");
    resetPin();
  };

  const MERCH_CLOS = [
    { nombre: "PVR", usuarios: ["MERCH07", "MERCH28", "MERCH29", "MERCH30"] },
    { nombre: "TEPIC", usuarios: ["MERCH04", "MERCH31", "MERCH32", "MERCH62", "MERCH63"] },
  ];

  const pickClo = (c) => {
    setClo(c);
    setStep("merch");
    resetPin();
  };

  const pickMerch = (username) => {
    setObjetivo({ username, label: username, sub: `CLO ${clo.nombre}` });
    setOrigin("merch");
    setStep("pin");
    resetPin();
  };

  const tituloPorPaso = {
    root: "Iniciar sesión",
    staff: "Staff",
    clo: "Selecciona tu CLO",
    merch: `CLO ${clo?.nombre || ""}`,
    pin: objetivo?.label,
  }[step];

  const estiloBotonCuadro = (activo = false) => ({
    aspectRatio: "1 / 1",
    borderRadius: 18,
    background: COLOR.slate800,
    border: `1px solid ${activo ? COLOR.amber : "rgba(255,255,255,0.06)"}`,
    boxShadow: activo ? `0 0 20px ${COLOR.amber}40` : "0 4px 12px rgba(0,0,0,0.25)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    cursor: "pointer",
    color: COLOR.slate100,
    transition: "all 0.2s ease",
  });

  return (
    <div style={{
      minHeight: "100vh",
      position: "relative",
      overflow: "hidden",
      background: `linear-gradient(160deg, ${COLOR.fondoDe} 0%, #0c1222 50%, ${COLOR.fondoA} 100%)`,
      color: COLOR.slate100,
      display: "flex",
      flexDirection: "column",
    }}>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes successPop {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        .pin-btn {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: all 0.15s ease;
        }
        .pin-btn:active {
          transform: scale(0.92);
          border-color: ${COLOR.amber} !important;
          box-shadow: 0 0 18px ${COLOR.amber}50 !important;
        }
        .card-btn {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: all 0.2s ease;
        }
        .card-btn:active {
          transform: scale(0.97);
        }
        .fade-in {
          animation: fadeInUp 0.35s ease both;
        }
        .scale-in {
          animation: scaleIn 0.3s ease both;
        }
      `}</style>

      {/* Fondo animado */}
      <div style={{
        position: "absolute", top: -140, left: -100,
        height: 460, width: 460, borderRadius: "50%",
        background: `radial-gradient(circle, ${COLOR.amber}28 0%, transparent 70%)`,
        pointerEvents: "none",
        animation: "pulse-glow 8s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", bottom: -180, right: -80,
        height: 520, width: 520, borderRadius: "50%",
        background: `radial-gradient(circle, ${COLOR.emerald}22 0%, transparent 70%)`,
        pointerEvents: "none",
        animation: "pulse-glow 10s ease-in-out infinite 1.5s",
      }} />

      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "36px 20px", position: "relative", zIndex: 1,
      }}>
        <div style={{ width: "100%", maxWidth: 380 }} className="fade-in">

          {/* Header */}
          <div style={{ marginBottom: 28, textAlign: "center" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              height: 52, width: 52, borderRadius: "50%",
              background: `linear-gradient(145deg, ${COLOR.fondoDe}, #1a2336)`,
              border: `1.5px solid ${COLOR.amber}90`,
              boxShadow: `0 0 24px ${COLOR.amber}35, inset 0 1px 0 rgba(255,255,255,0.08)`,
              marginBottom: 16,
              animation: "float 5s ease-in-out infinite",
            }}>
              <Fingerprint size={22} color={COLOR.amber} />
            </div>
            <p style={{
              fontSize: 11, letterSpacing: 3.5, color: COLOR.emerald,
              fontFamily: "monospace", textTransform: "uppercase", marginBottom: 6,
            }}>
              SMART-TRACK · JMD
            </p>
            <h1 style={{
              fontSize: 26, fontWeight: 700, letterSpacing: -0.4,
              color: "#fff", margin: 0,
            }}>
              {tituloPorPaso}
            </h1>
            {step === "pin" && (
              <p style={{ fontSize: 13, color: COLOR.slate400, marginTop: 4 }}>
                {objetivo?.sub} · ingresa tu PIN
              </p>
            )}
          </div>

          {/* ROOT */}
          {step === "root" && (
            <div className="scale-in">
              <p style={{
                fontSize: 11, textTransform: "uppercase", letterSpacing: 2,
                color: COLOR.slate400, fontFamily: "monospace", marginBottom: 10,
              }}>
                Rutas
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
                {RUTAS_BOTONES.map((r) => (
                  <button key={r.full} className="card-btn" onClick={() => pickRuta(r.full, r.corto)} style={estiloBotonCuadro()}>
                    <Route size={16} color={COLOR.amber} />
                    <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 600 }}>{r.corto}</span>
                  </button>
                ))}
                <button className="card-btn" onClick={pickGerente} style={estiloBotonCuadro()}>
                  <Crown size={16} color={COLOR.amber} />
                  <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 600 }}>Gerente</span>
                </button>
                <button className="card-btn" onClick={pickSupervisor1} style={estiloBotonCuadro()}>
                  <Users size={16} color={COLOR.amber} />
                  <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 600, lineHeight: 1.2, textAlign: "center" }}>Supervisor 1</span>
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
                <button
                  className="card-btn"
                  onClick={() => setStep("staff")}
                  style={{
                    borderRadius: 16,
                    background: `linear-gradient(135deg, ${COLOR.amber}, ${COLOR.amberOscuro})`,
                    border: "none",
                    padding: "15px 0",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    fontWeight: 600, color: "#0f172a", cursor: "pointer",
                    boxShadow: `0 6px 20px ${COLOR.amber}40`,
                  }}
                >
                  <Settings size={16} /> Staff
                </button>
                <button
                  className="card-btn"
                  onClick={() => setStep("clo")}
                  style={{
                    borderRadius: 16,
                    background: `linear-gradient(135deg, ${COLOR.emerald}, ${COLOR.emeraldOscuro})`,
                    border: "none",
                    padding: "15px 0",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    fontWeight: 600, color: "#0f172a", cursor: "pointer",
                    boxShadow: `0 6px 20px ${COLOR.emerald}40`,
                  }}
                >
                  <MapPin size={16} /> Merch
                </button>
              </div>
            </div>
          )}

          {/* STAFF */}
          {step === "staff" && (
            <div className="scale-in">
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                {STAFF_LISTA.map((s) => (
                  <button
                    key={s.username}
                    className="card-btn"
                    onClick={() => pickStaff(s)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 14,
                      borderRadius: 16, background: COLOR.slate800,
                      border: "1px solid rgba(255,255,255,0.06)",
                      padding: "14px 16px", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <div style={{
                      height: 42, width: 42, borderRadius: 12,
                      background: "rgba(251,191,36,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: COLOR.amber, flexShrink: 0,
                    }}>
                      <s.Icon size={18} />
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "#fff" }}>{s.nombre}</p>
                      <p style={{ fontSize: 11, color: COLOR.slate400, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
                        {s.rolLabel}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={goRoot} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                gap: 6, fontSize: 14, color: COLOR.slate400, padding: "8px 0",
                background: "none", border: "none", cursor: "pointer",
              }}>
                <ChevronLeft size={14} /> Volver
              </button>
            </div>
          )}

          {/* CLO */}
          {step === "clo" && (
            <div className="scale-in">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                {MERCH_CLOS.map((c) => (
                  <button
                    key={c.nombre}
                    className="card-btn"
                    onClick={() => pickClo(c)}
                    style={{ ...estiloBotonCuadro(), aspectRatio: "auto", padding: "28px 0" }}
                  >
                    <MapPin size={20} color={COLOR.amber} />
                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 18 }}>{c.nombre}</span>
                    <span style={{ fontSize: 10, color: COLOR.slate400, fontFamily: "monospace" }}>
                      {c.usuarios.length} usuarios
                    </span>
                  </button>
                ))}
              </div>
              <button onClick={goRoot} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                gap: 6, fontSize: 14, color: COLOR.slate400, padding: "8px 0",
                background: "none", border: "none", cursor: "pointer",
              }}>
                <ChevronLeft size={14} /> Volver
              </button>
            </div>
          )}

          {/* MERCH */}
          {step === "merch" && clo && (
            <div className="scale-in">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {clo.usuarios.map((username) => (
                  <button
                    key={username}
                    className="card-btn"
                    onClick={() => pickMerch(username)}
                    style={estiloBotonCuadro()}
                  >
                    <Route size={16} color={COLOR.amber} />
                    <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600 }}>{username}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep("clo")} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                gap: 6, fontSize: 14, color: COLOR.slate400, padding: "8px 0",
                background: "none", border: "none", cursor: "pointer",
              }}>
                <ChevronLeft size={14} /> Volver
              </button>
            </div>
          )}

          {/* PIN */}
          {step === "pin" && (
            <div className="scale-in">
              <div style={{
                display: "flex", justifyContent: "center", gap: 14,
                marginBottom: 28, height: 36, alignItems: "center",
              }}>
                {Array.from({ length: PIN_LENGTH }).map((_, i) => {
                  const lleno = i < pin.length;
                  const colorActivo = error ? COLOR.rose : success ? COLOR.emerald : COLOR.amber;
                  return (
                    <div
                      key={i}
                      style={{
                        height: 14, width: 14, borderRadius: "50%",
                        background: lleno ? colorActivo : "transparent",
                        border: `2px solid ${lleno ? colorActivo : COLOR.slate700}`,
                        boxShadow: lleno ? `0 0 12px ${colorActivo}80` : "none",
                        transition: "all 0.2s ease",
                        transform: lleno ? "scale(1.15)" : "scale(1)",
                      }}
                    />
                  );
                })}
              </div>

              {error && (
                <p style={{
                  textAlign: "center", color: COLOR.rose, fontSize: 14,
                  marginBottom: 14, fontWeight: 600,
                  animation: "fadeInUp 0.25s ease",
                }}>
                  {error}
                </p>
              )}
              {success && (
                <div style={{
                  display: "flex", justifyContent: "center", alignItems: "center",
                  gap: 8, marginBottom: 14, color: COLOR.emerald,
                  animation: "successPop 0.4s ease",
                }}>
                  <ShieldCheck size={18} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Acceso correcto</span>
                </div>
              )}
              {loading && !success && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                  <LoaderCircle size={20} color={COLOR.amber} style={{ animation: "spin 0.9s linear infinite" }} />
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {["1","2","3","4","5","6","7","8","9"].map((d) => (
                  <button
                    key={d}
                    className="pin-btn"
                    onClick={() => pressDigit(d)}
                    disabled={loading || success}
                    style={{
                      height: 66, borderRadius: "50%",
                      background: COLOR.slate800,
                      border: "1px solid rgba(255,255,255,0.06)",
                      fontSize: 22, fontFamily: "monospace", fontWeight: 600,
                      color: COLOR.slate100,
                      opacity: (loading || success) ? 0.4 : 1,
                      cursor: (loading || success) ? "default" : "pointer",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                    }}
                  >
                    {d}
                  </button>
                ))}

                <button
                  onClick={backFromPin}
                  disabled={loading || success}
                  style={{
                    height: 66, borderRadius: "50%", background: "none", border: "none",
                    fontSize: 13, color: COLOR.slate400, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>

                <button
                  className="pin-btn"
                  onClick={() => pressDigit("0")}
                  disabled={loading || success}
                  style={{
                    height: 66, borderRadius: "50%",
                    background: COLOR.slate800,
                    border: "1px solid rgba(255,255,255,0.06)",
                    fontSize: 22, fontFamily: "monospace", fontWeight: 600,
                    color: COLOR.slate100,
                    opacity: (loading || success) ? 0.4 : 1,
                    cursor: (loading || success) ? "default" : "pointer",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                  }}
                >
                  0
                </button>

                <button
                  className="pin-btn"
                  onClick={pressDelete}
                  disabled={loading || success}
                  style={{
                    height: 66, borderRadius: "50%", background: "none", border: "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: COLOR.slate400,
                    opacity: (loading || success) ? 0.4 : 1,
                    cursor: (loading || success) ? "default" : "pointer",
                  }}
                >
                  <Delete size={20} />
                </button>
              </div>

              {recordado && (
                <button
                  onClick={cambiarUsuario}
                  style={{
                    display: "block", margin: "20px auto 0",
                    background: "none", border: "none",
                    color: COLOR.slate400, fontSize: 12,
                    textDecoration: "underline", cursor: "pointer",
                  }}
                >
                  ¿No eres tú? Cambiar usuario
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <p style={{
        textAlign: "center", fontSize: 10, color: COLOR.slate600,
        fontFamily: "monospace", paddingBottom: 22, letterSpacing: 3,
        position: "relative", zIndex: 1,
      }}>
        PVR · TEPIC
      </p>
    </div>
  );
}
