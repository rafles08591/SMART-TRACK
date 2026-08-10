// @ts-nocheck
import React, { useState, useCallback, useEffect } from "react";
import {
  Fingerprint, Delete, LoaderCircle, Crown, Users, Wallet, Route, ChevronLeft, MapPin, Settings,
} from "lucide-react";
import { USERS, NOMBRES, RUTAS } from "../constants";
// ============================================================
// Diseño de PIN-pad (adaptado del mock que se compartió) — convertido de
// clases de Tailwind a estilos en línea, porque este proyecto no tiene
// Tailwind configurado (todo el resto de la app usa style={{...}}, así que
// si se dejaban las clases tal cual, se hubiera visto sin ningún estilo).
// Los usuarios/contraseñas YA NO son de prueba: salen de USERS/NOMBRES en
// constants.js, así que cualquier cambio de contraseña ahí se refleja aquí
// solo, sin tocar este archivo.
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
  slate400: "#94a3b8",
  slate300: "#cbd5e1",
  slate100: "#f1f5f9",
};
function userDe(username) {
  return USERS.find((u) => u.username === username);
}
// Rutas: código corto para el botón ("J201") + el username real completo
// ("RUTA J201") para el login.
const RUTAS_BOTONES = RUTAS.map((full) => ({ full, corto: full.replace("RUTA ", "") }));
const RUTA_PASSWORD = userDe(RUTAS[0])?.password || "1234";
const GERENTE_USER = userDe("GERENTE");
const SUPERVISOR1_USER = userDe("SUPERVISOR-1");
const SUPERVISOR2_USER = userDe("SUPERVISOR-2");
const LIQUIDACION_USER = userDe("LIQUIDACION- SULEMA PONCE");
const ADMIN_USER = userDe("ADMIN");
const STAFF_LISTA = [
  SUPERVISOR2_USER && { user: SUPERVISOR2_USER, nombre: NOMBRES["SUPERVISOR-2"] || "Supervisor 2", rolLabel: "Supervisor 2", Icon: Users },
  LIQUIDACION_USER && { user: LIQUIDACION_USER, nombre: NOMBRES["LIQUIDACION- SULEMA PONCE"] || "Liquidación", rolLabel: "Liquidación", Icon: Wallet },
  ADMIN_USER && { user: ADMIN_USER, nombre: NOMBRES["ADMIN"] || "Admin", rolLabel: "Admin", Icon: Settings },
].filter(Boolean);
// Merchandising: se agrupan por CLO tomando directamente los usuarios reales
// con role "merch" de USERS (agrupados por su password, que es distinto por
// CLO) — así, si mañana se agrega o quita un MERCH en constants.js, aquí se
// refleja solo, sin tocar este archivo.
const MERCH_USERS = USERS.filter((u) => u.role === "merch");
const MERCH_POR_CLO = {};
MERCH_USERS.forEach((u) => {
  if (!MERCH_POR_CLO[u.password]) MERCH_POR_CLO[u.password] = [];
  MERCH_POR_CLO[u.password].push(u);
});
// Nombres de CLO conocidos por password (si aparece un password nuevo que
// no se reconoce, se le pone el password como nombre de CLO, para que no
// se pierda ningún usuario aunque no se sepa el nombre bonito del CLO).
const NOMBRE_CLO_POR_PASSWORD = { "2220": "PVR", "3049": "TEPIC" };
const CLOS = Object.keys(MERCH_POR_CLO).map((pass) => ({
  password: pass,
  nombre: NOMBRE_CLO_POR_PASSWORD[pass] || pass,
  usuarios: MERCH_POR_CLO[pass],
}));
const PIN_LENGTH = 4;
function estiloBotonCuadro(activo, colorActivo) {
  return {
    aspectRatio: "1 / 1",
    borderRadius: 16,
    background: COLOR.slate800,
    border: `1px solid ${activo ? colorActivo : COLOR.slate800}`,
    boxShadow: activo ? `0 0 16px ${colorActivo}55` : "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    cursor: "pointer",
    color: COLOR.slate100,
  };
}
export default function Login({ onLogin }) {
  // Fuerza el viewport correcto (sin importar lo que tenga index.html):
  // en varios navegadores móviles, sin "maximum-scale=1, user-scalable=no"
  // cada toque espera ~300ms antes de responder por si el usuario va a
  // hacer doble-toque para hacer zoom — eso es lo que se sentía como
  // "touch lento" al marcar el PIN.
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
  }, []);
  // step: 'root' | 'staff' | 'clo' | 'merch' | 'pin'
  const [step, setStep] = useState("root");
  const [origin, setOrigin] = useState("root");
  const [clo, setClo] = useState(null);
  const [objetivo, setObjetivo] = useState(null); // { user, label, sub }
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const resetPin = useCallback(() => {
    setPin("");
    setError("");
  }, []);
  const goRoot = useCallback(() => {
    setStep("root"); setClo(null); setObjetivo(null); resetPin();
  }, [resetPin]);
  const goStaff = useCallback(() => {
    setStep("staff"); setObjetivo(null); resetPin();
  }, [resetPin]);
  const goClo = useCallback(() => {
    setStep("clo"); setObjetivo(null); resetPin();
  }, [resetPin]);
  const pickRuta = useCallback((full, corto) => {
    const user = userDe(full);
    if (!user) return;
    setObjetivo({ user, label: corto, sub: NOMBRES[full] || "Ruta de venta" });
    setOrigin("root"); setStep("pin"); resetPin();
  }, [resetPin]);
  const pickGerente = useCallback(() => {
    if (!GERENTE_USER) return;
    setObjetivo({ user: GERENTE_USER, label: NOMBRES["GERENTE"] || "Gerente", sub: "Gerente" });
    setOrigin("root"); setStep("pin"); resetPin();
  }, [resetPin]);
  const pickSupervisor1 = useCallback(() => {
    if (!SUPERVISOR1_USER) return;
    setObjetivo({ user: SUPERVISOR1_USER, label: NOMBRES["SUPERVISOR-1"] || "Supervisor 1", sub: "Supervisor 1" });
    setOrigin("root"); setStep("pin"); resetPin();
  }, [resetPin]);
  const pickStaff = useCallback((s) => {
    setObjetivo({ user: s.user, label: s.nombre, sub: s.rolLabel });
    setOrigin("staff"); setStep("pin"); resetPin();
  }, [resetPin]);
  const pickClo = useCallback((c) => {
    setClo(c); setStep("merch"); resetPin();
  }, [resetPin]);
  const pickMerch = useCallback((user) => {
    setObjetivo({ user, label: user.username, sub: `CLO ${clo.nombre}` });
    setOrigin("merch"); setStep("pin"); resetPin();
  }, [clo, resetPin]);
  const verify = useCallback((pinValue) => {
    setLoading(true);
    setError("");
    setTimeout(() => {
      setLoading(false);
      if (!objetivo?.user || pinValue !== objetivo.user.password) {
        setError("PIN incorrecto");
        resetPin();
        return;
      }
      onLogin?.(objetivo.user);
    }, 150);
  }, [objetivo, onLogin, resetPin]);
  // Un solo cambio de estado por toque (nada de setTimeout encadenados
  // para "revelar y luego ocultar" el dígito ni para el brillo del botón)
  // — eso era lo que causaba el lag y que a veces no registrara el toque.
  // El brillo al presionar ahora es puro CSS (:active), no JS.
  const pressDigit = useCallback((d) => {
    if (loading || pin.length >= PIN_LENGTH) return;
    setError("");
    setPin((prev) => {
      const next = (prev + d).slice(0, PIN_LENGTH);
      if (next.length === PIN_LENGTH) verify(next);
      return next;
    });
  }, [loading, pin.length, verify]);
  const pressDelete = useCallback(() => {
    if (loading) return;
    setPin((prev) => prev.slice(0, -1));
    setError("");
  }, [loading]);
  const backFromPin = useCallback(() => {
    resetPin(); setObjetivo(null);
    if (origin === "merch") { setStep("merch"); return; }
    if (origin === "staff") { setStep("staff"); return; }
    setStep("root");
  }, [origin, resetPin]);

  // Teclado físico de la computadora: números 0-9, Backspace/Delete y Escape.
  // Solo activo cuando se está en la pantalla de PIN.
  useEffect(() => {
    if (step !== "pin") return;
    function onKeyDown(e) {
      if (loading) return;
      // Evitar que el navegador haga otras cosas (ej. Backspace = atrás)
      if (e.key === "Backspace" || e.key === "Delete" || e.key === "Escape" || /^[0-9]$/.test(e.key)) {
        e.preventDefault();
      }
      if (/^[0-9]$/.test(e.key)) {
        pressDigit(e.key);
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        pressDelete();
        return;
      }
      if (e.key === "Escape") {
        backFromPin();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, loading, pressDigit, pressDelete, backFromPin]);

  const tituloPorPaso = {
    root: "Iniciar sesión",
    staff: "Staff",
    clo: "Selecciona tu CLO",
    merch: `CLO ${clo?.nombre || ""}`,
    pin: objetivo?.label,
  }[step];
  return (
    <div style={{
      minHeight: "100vh", position: "relative", overflow: "hidden",
      background: `linear-gradient(to bottom right, ${COLOR.fondoDe}, ${COLOR.fondoDe}, ${COLOR.fondoA})`,
      color: COLOR.slate100, display: "flex", flexDirection: "column",
    }}>
      <style>{`
        .pin-glow-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; will-change: transform; }
        .pin-glow-btn:active { transform: scale(0.95); border-color: ${COLOR.amber} !important; box-shadow: 0 0 16px ${COLOR.amber}55; }
        .pin-list-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .pin-list-btn:active { transform: scale(0.98); border-color: #64748b !important; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <div style={{ position: "absolute", top: -128, left: -96, height: 420, width: 420, borderRadius: "50%", background: `radial-gradient(circle, ${COLOR.amber}33 0%, ${COLOR.amber}00 70%)`, pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -160, right: -64, height: 480, width: 480, borderRadius: "50%", background: `radial-gradient(circle, ${COLOR.emerald}33 0%, ${COLOR.emerald}00 70%)`, pointerEvents: "none" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", position: "relative", zIndex: 1 }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ marginBottom: 32, textAlign: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 44, width: 44, borderRadius: "50%", background: COLOR.fondoDe, border: `1px solid ${COLOR.amber}`, boxShadow: `0 4px 14px ${COLOR.amber}55`, marginBottom: 16 }}>
              <Fingerprint size={20} color={COLOR.amber} />
            </div>
            <p style={{ fontSize: 11, letterSpacing: 4, color: COLOR.emerald, fontFamily: "monospace", textTransform: "uppercase", marginBottom: 8 }}>
              SMART-TRACK · JMD
            </p>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, color: "#fff", margin: 0 }}>{tituloPorPaso}</h1>
            {step === "pin" && (
              <p style={{ fontSize: 14, color: COLOR.slate400, marginTop: 4 }}>{objetivo?.sub} · ingresa tu PIN</p>
            )}
          </div>
          {step === "root" && (
            <div>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 2, color: COLOR.slate400, fontFamily: "monospace", marginBottom: 10 }}>Rutas</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
                {RUTAS_BOTONES.map((r) => (
                  <button key={r.full} className="pin-glow-btn" onClick={() => pickRuta(r.full, r.corto)} style={estiloBotonCuadro(false, COLOR.amber)}>
                    <Route size={17} color={COLOR.amber} />
                    <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 600 }}>{r.corto}</span>
                  </button>
                ))}
                {GERENTE_USER && (
                  <button className="pin-glow-btn" onClick={pickGerente} style={estiloBotonCuadro(false, COLOR.amber)}>
                    <Crown size={17} color={COLOR.amber} />
                    <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 600 }}>Gerente</span>
                  </button>
                )}
                {SUPERVISOR1_USER && (
                  <button className="pin-glow-btn" onClick={pickSupervisor1} style={estiloBotonCuadro(false, COLOR.amber)}>
                    <Users size={17} color={COLOR.amber} />
                    <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 600, lineHeight: 1.2, textAlign: "center" }}>Supervisor 1</span>
                  </button>
                )}
              </div>
              <div style={{ paddingTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button
                  onClick={goStaff}
                  style={{ borderRadius: 16, background: `linear-gradient(to right, ${COLOR.amber}, ${COLOR.amberOscuro})`, border: "none", padding: "14px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontWeight: 600, color: "#0f172a", cursor: "pointer" }}
                >
                  <Settings size={17} /> Staff
                </button>
                <button
                  onClick={goClo}
                  style={{ borderRadius: 16, background: `linear-gradient(to right, ${COLOR.emerald}, ${COLOR.emeraldOscuro})`, border: "none", padding: "14px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontWeight: 600, color: "#0f172a", cursor: "pointer" }}
                >
                  <MapPin size={17} /> Merch
                </button>
              </div>
            </div>
          )}
          {step === "staff" && (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                {STAFF_LISTA.map((s) => (
                  <button
                    key={s.user.username}
                    className="pin-list-btn"
                    onClick={() => pickStaff(s)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, borderRadius: 16, background: COLOR.slate800, border: `1px solid ${COLOR.slate700}`, padding: "14px 16px", cursor: "pointer", textAlign: "left" }}
                  >
                    <div style={{ height: 40, width: 40, borderRadius: 12, background: COLOR.fondoDe, display: "flex", alignItems: "center", justifyContent: "center", color: COLOR.slate300, flexShrink: 0 }}>
                      <s.Icon size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "#fff" }}>{s.nombre}</p>
                      <p style={{ fontSize: 11, color: COLOR.slate400, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>{s.rolLabel}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={goRoot} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 14, color: COLOR.slate400, padding: "8px 0", background: "none", border: "none", cursor: "pointer" }}>
                <ChevronLeft size={14} /> Volver
              </button>
            </div>
          )}
          {step === "clo" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                {CLOS.map((c) => (
                  <button key={c.password} className="pin-glow-btn" onClick={() => pickClo(c)} style={{ ...estiloBotonCuadro(false, COLOR.amber), aspectRatio: "auto", padding: "32px 0" }}>
                    <MapPin size={20} color={COLOR.amber} />
                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 18 }}>{c.nombre}</span>
                    <span style={{ fontSize: 10, color: COLOR.slate400, fontFamily: "monospace" }}>{c.usuarios.length} usuarios</span>
                  </button>
                ))}
              </div>
              <button onClick={goRoot} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 14, color: COLOR.slate400, padding: "8px 0", background: "none", border: "none", cursor: "pointer" }}>
                <ChevronLeft size={14} /> Volver
              </button>
            </div>
          )}
          {step === "merch" && clo && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {clo.usuarios.map((u) => (
                  <button key={u.username} className="pin-glow-btn" onClick={() => pickMerch(u)} style={estiloBotonCuadro(false, COLOR.amber)}>
                    <Route size={17} color={COLOR.amber} />
                    <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600 }}>{u.username}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep("clo")} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 14, color: COLOR.slate400, padding: "8px 0", background: "none", border: "none", cursor: "pointer" }}>
                <ChevronLeft size={14} /> Volver
              </button>
            </div>
          )}
          {step === "pin" && (
            <div>
              <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 32, height: 32, alignItems: "center" }}>
                {Array.from({ length: PIN_LENGTH }).map((_, i) => {
                  const lleno = i < pin.length;
                  const colorActivo = error ? COLOR.rose : COLOR.amber;
                  return (
                    <div key={i} style={{
                      height: 36, width: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, fontFamily: "monospace", fontWeight: 700,
                      borderBottom: `2px solid ${lleno ? colorActivo : COLOR.slate800}`,
                      color: lleno ? colorActivo : "transparent",
                    }}>
                      {lleno ? "*" : "0"}
                    </div>
                  );
                })}
              </div>
              {error && <p style={{ textAlign: "center", color: COLOR.rose, fontSize: 14, marginBottom: 16, fontWeight: 600 }}>{error}</p>}
              {loading && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  <LoaderCircle size={18} color={COLOR.amber} style={{ animation: "spin 1s linear infinite" }} />
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {["1","2","3","4","5","6","7","8","9"].map((d) => (
                  <button
                    key={d}
                    className="pin-glow-btn"
                    onClick={() => pressDigit(d)}
                    disabled={loading}
                    style={{
                      height: 64, borderRadius: "50%", background: COLOR.slate800,
                      border: `1px solid ${COLOR.slate800}`,
                      fontSize: 20, fontFamily: "monospace", fontWeight: 600,
                      color: COLOR.slate100,
                      opacity: loading ? 0.4 : 1, cursor: loading ? "default" : "pointer",
                    }}
                  >
                    {d}
                  </button>
                ))}
                <button onClick={backFromPin} style={{ height: 64, borderRadius: "50%", background: "none", border: "none", fontSize: 14, color: COLOR.slate400, fontWeight: 500, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button
                  className="pin-glow-btn"
                  onClick={() => pressDigit("0")}
                  disabled={loading}
                  style={{
                    height: 64, borderRadius: "50%", background: COLOR.slate800,
                    border: `1px solid ${COLOR.slate800}`,
                    fontSize: 20, fontFamily: "monospace", fontWeight: 600,
                    color: COLOR.slate100,
                    opacity: loading ? 0.4 : 1, cursor: loading ? "default" : "pointer",
                  }}
                >
                  0
                </button>
                <button
                  className="pin-list-btn"
                  onClick={pressDelete}
                  disabled={loading}
                  style={{ height: 64, borderRadius: "50%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: COLOR.slate400, opacity: loading ? 0.4 : 1, cursor: loading ? "default" : "pointer" }}
                >
                  <Delete size={20} />
                </button>
              </div>
              <p style={{ textAlign: "center", fontSize: 11, color: COLOR.slate400, marginTop: 16 }}>
                También puedes usar el teclado: 0-9 · ⌫ borrar · Esc cancelar
              </p>
            </div>
          )}
        </div>
      </div>
      <p style={{ textAlign: "center", fontSize: 10, color: "#475569", fontFamily: "monospace", paddingBottom: 24, letterSpacing: 3, position: "relative", zIndex: 1 }}>
        {CLOS.map((c) => c.nombre).join(" · ")}
      </p>
    </div>
  );
}
