// @ts-nocheck
import React, { useState, useCallback, useEffect } from "react";
import {
  Fingerprint, Delete, LoaderCircle, Crown, Users, Wallet, Route,
  ChevronLeft, MapPin, Settings, ShieldCheck
} from "lucide-react";
import { supabase } from "../supabaseClient";

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
  slate100: "#f1f5f9",
};

const PIN_LENGTH = 4;
const RECORDADO_KEY = "smarttrack_ultimo_usuario";

function leerUsuarioRecordado() {
  try { return localStorage.getItem(RECORDADO_KEY) || null; } catch { return null; }
}
function guardarUsuarioRecordado(username) {
  try { localStorage.setItem(RECORDADO_KEY, username); } catch {}
}
function borrarUsuarioRecordado() {
  try { localStorage.removeItem(RECORDADO_KEY); } catch {}
}

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

  const verify = useCallback(async (pinValue) => {
    if (!objetivo?.username || loading) return;

    setLoading(true);
    setError("");

    const email = USER_EMAIL_MAP[objetivo.username];
    if (!email) {
      setError("Usuario no configurado");
      setLoading(false);
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
        setPin("");
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
        setPin("");
        return;
      }

      if (!profile.active) {
        await supabase.auth.signOut();
        setError("Usuario desactivado");
        setLoading(false);
        setPin("");
        return;
      }

      setSuccess(true);
      guardarUsuarioRecordado(objetivo.username);

      setTimeout(() => {
        onLogin?.(profile);
      }, 700);

    } catch (err) {
      console.error(err);
      setError("Error de conexión");
      setLoading(false);
      setPin("");
    }
  }, [objetivo, onLogin, loading]);

  const pressDigit = useCallback((d) => {
    if (loading || success || pin.length >= PIN_LENGTH) return;
    setError("");
    setPin((prev) => {
      const next = (prev + d).slice(0, PIN_LENGTH);
      if (next.length === PIN_LENGTH) {
        setTimeout(() => verify(next), 70);
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

  const estiloBotonCuadro = () => ({
    aspectRatio: "1 / 1",
    borderRadius: 18,
    background: COLOR.slate800,
    border: "1px solid rgba(255,255,255,0.07)",
    boxShadow: "0 4px 14px rgba(0,0,0,0.28)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    cursor: "pointer",
    color: COLOR.slate100,
  });

  return (
    <div style={{
      minHeight: "100vh",
      position: "relative",
      overflow: "hidden",
      background: `linear-gradient(160deg, ${COLOR.fondoDe} 0%, #0c1222 45%, ${COLOR.fondoA} 100%)`,
      color: COLOR.slate100,
      display: "flex",
      flexDirection: "column",
    }}>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.06); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes successPop {
          0% { transform: scale(0.5); opacity: 0; }
          55% { transform: scale(1.18); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes successRing {
          0% { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes dotPop {
          0% { transform: scale(0.4); }
          70% { transform: scale(1.25); }
          100% { transform: scale(1.1); }
        }
        .pin-btn {
          position: relative;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
          will-change: transform;
        }
        .pin-btn:active {
          transform: scale(0.88);
        }
        /* Aro de brillo en su propia capa: solo anima opacity/transform
           (GPU/compositor, sin repintar) en vez de animar box-shadow o
           border-color directamente sobre el botón en cada toque — eso
           es lo que hacía que Android se atrasara al marcar el PIN rápido. */
        .pin-btn::after {
          content: "";
          position: absolute;
          inset: -5px;
          border-radius: 50%;
          border: 1.5px solid ${COLOR.amber};
          box-shadow: 0 0 18px ${COLOR.amber}80;
          opacity: 0;
          transform: scale(0.7);
          transition: opacity 0.15s ease, transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
          pointer-events: none;
          will-change: opacity, transform;
        }
        .pin-btn:active::after {
          opacity: 1;
          transform: scale(1);
        }
        .card-btn {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: all 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
        }
        .card-btn:active {
          transform: scale(0.94);
        }
        .fade-in { animation: fadeInUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .scale-in { animation: scaleIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .shake { animation: shake 0.4s ease; }
      `}</style>

      <div style={{
        position: "absolute", top: -150, left: -110,
        height: 460, width: 460, borderRadius: "50%",
        background: `radial-gradient(circle, ${COLOR.amber}30 0%, transparent 68%)`,
        pointerEvents: "none",
        animation: "pulse-glow 7s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", bottom: -180, right: -90,
        height: 520, width: 520, borderRadius: "50%",
        background: `radial-gradient(circle, ${COLOR.emerald}25 0%, transparent 68%)`,
        pointerEvents: "none",
        animation: "pulse-glow 9s ease-in-out infinite 1.2s",
      }} />

      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "36px 20px", position: "relative", zIndex: 1,
      }}>
        <div style={{ width: "100%", maxWidth: 380 }} className="fade-in">

          <div style={{ marginBottom: 28, textAlign: "center" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              height: 54, width: 54, borderRadius: "50%",
              background: `linear-gradient(145deg, ${COLOR.fondoDe}, #1a2336)`,
              border: `1.5px solid ${COLOR.amber}90`,
              boxShadow: `0 0 28px ${COLOR.amber}40, inset 0 1px 0 rgba(255,255,255,0.1)`,
              marginBottom: 16,
              animation: "float 4.8s ease-in-out infinite",
              position: "relative",
            }}>
              <Fingerprint size={22} color={COLOR.amber} />
              {success && (
                <div style={{
                  position: "absolute", inset: -6, borderRadius: "50%",
                  border: `2px solid ${COLOR.emerald}`,
                  animation: "successRing 0.7s ease-out forwards",
                }} />
              )}
            </div>
            <p style={{
              fontSize: 11, letterSpacing: 3.4, color: COLOR.emerald,
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
                  <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 600, lineHeight: 1.2, textAlign: "center" }}>
                    Supervisor 1
                  </span>
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
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
                    boxShadow: `0 6px 22px ${COLOR.amber}45`,
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
                    boxShadow: `0 6px 22px ${COLOR.emerald}45`,
                  }}
                >
                  <MapPin size={16} /> Merch
                </button>
              </div>
            </div>
          )}

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
                      border: "1px solid rgba(255,255,255,0.07)",
                      padding: "14px 16px", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <div style={{
                      height: 42, width: 42, borderRadius: 12,
                      background: "rgba(251,191,36,0.12)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: COLOR.amber, flexShrink: 0,
                    }}>
                      <s.Icon size={18} />
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "#fff" }}>{s.nombre}</p>
                      <p style={{ fontSize: 11, color: COLOR.slate400, margin: 0 }}>{s.rolLabel}</p>
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
                    <span style={{ fontSize: 10, color: COLOR.slate400 }}>{c.usuarios.length} usuarios</span>
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

          {step === "pin" && (
            <div className={`scale-in ${error ? "shake" : ""}`}>
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
                        boxShadow: lleno ? `0 0 14px ${colorActivo}90` : "none",
                        transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
                        transform: lleno ? "scale(1.15)" : "scale(1)",
                        animation: lleno ? "dotPop 0.25s ease" : "none",
                      }}
                    />
                  );
                })}
              </div>

              {error && (
                <p style={{
                  textAlign: "center", color: COLOR.rose, fontSize: 14,
                  marginBottom: 14, fontWeight: 600,
                }}>
                  {error}
                </p>
              )}

              {success && (
                <div style={{
                  display: "flex", justifyContent: "center", alignItems: "center",
                  gap: 8, marginBottom: 14, color: COLOR.emerald,
                  animation: "successPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}>
                  <ShieldCheck size={20} />
                  <span style={{ fontWeight: 700, fontSize: 15 }}>Acceso correcto</span>
                </div>
              )}

              {loading && !success && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                  <LoaderCircle size={20} color={COLOR.amber} style={{ animation: "spin 0.85s linear infinite" }} />
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
                      border: "1px solid rgba(255,255,255,0.07)",
                      fontSize: 22, fontFamily: "monospace", fontWeight: 600,
                      color: COLOR.slate100,
                      opacity: (loading || success) ? 0.4 : 1,
                      cursor: (loading || success) ? "default" : "pointer",
                      boxShadow: "0 4px 14px rgba(0,0,0,0.22)",
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
                    border: "1px solid rgba(255,255,255,0.07)",
                    fontSize: 22, fontFamily: "monospace", fontWeight: 600,
                    color: COLOR.slate100,
                    opacity: (loading || success) ? 0.4 : 1,
                    cursor: (loading || success) ? "default" : "pointer",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.22)",
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

              {!recordado && (
                <button
                  onClick={() => alert("Si olvidaste tu PIN, contacta a Gerente para que te lo reinicie.")}
                  style={{
                    display: "block",
                    margin: "18px auto 0",
                    background: "none",
                    border: "none",
                    color: COLOR.slate400,
                    fontSize: 12,
                    textDecoration: "underline",
                    cursor: "pointer",
                  }}
                >
                  ¿Olvidaste tu PIN?
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <p style={{
        textAlign: "center", fontSize: 10, color: COLOR.slate600,
        fontFamily: "monospace", paddingBottom: 22, letterSpacing: 3,
      }}>
        PVR · TEPIC
      </p>
    </div>
  );
}
