// @ts-nocheck
import React, { useState, useRef, useEffect } from "react";
import { Download, ClipboardPaste, CheckCircle2, Truck, Flag } from "lucide-react";
import { OBJETIVO_TABS } from "../constants";
import { unidades, money, metaColor } from "../utils";
import { useCapturaImagen } from "./hooks";

export function RoadProgress({ pct }) {
  return (
    <div style={{ margin: "18px 0 8px" }}>
      <div className="track">
        <div className="track-fill" style={{ width: `${pct}%` }} />
        <div className="pin" style={{ left: `${pct}%` }}><Truck size={18} color="#F2B134" /></div>
        <div style={{ position: "absolute", right: -4, top: -20 }}><Flag size={16} color="#9AA7BD" /></div>
      </div>
    </div>
  );
}

/* ===================== KpiCard FUTURISTA ===================== */
export function KpiCard({ icon, label, value, accent = "#22d3ee", subtext }) {
  const isGood = accent === "#3DDC97" || accent === "#34d399" || (typeof accent === "string" && (accent.includes("34d399") || accent.includes("3DDC97")));
  const isBad = accent === "#FF6B6B" || accent === "#f87171" || (typeof accent === "string" && (accent.includes("FF6B6B") || accent.includes("f87171")));

  let borderColor = "rgba(34, 211, 238, 0.25)";
  let glow = "rgba(34, 211, 238, 0.12)";
  let valueColor = "#e0f2fe";

  if (isGood) {
    borderColor = "rgba(52, 211, 153, 0.4)";
    glow = "rgba(52, 211, 153, 0.18)";
    valueColor = "#6ee7b7";
  } else if (isBad) {
    borderColor = "rgba(248, 113, 113, 0.4)";
    glow = "rgba(248, 113, 113, 0.15)";
    valueColor = "#fca5a5";
  } else if (accent === "#F2B134" || (typeof accent === "string" && (accent.includes("F2B134") || accent.includes("fbbf24")))) {
    borderColor = "rgba(251, 191, 36, 0.4)";
    glow = "rgba(251, 191, 36, 0.15)";
    valueColor = "#fde68a";
  }

  return (
    <div
      style={{
        flex: "1 1 160px",
        minWidth: 150,
        maxWidth: 220,
        padding: "16px 18px",
        borderRadius: 14,
        background: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: `1px solid ${borderColor}`,
        boxShadow: `0 4px 20px rgba(0,0,0,0.35), 0 0 18px ${glow}`,
        transition: "all 0.25s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 8px 28px rgba(0,0,0,0.45), 0 0 28px ${glow}`;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `0 4px 20px rgba(0,0,0,0.35), 0 0 18px ${glow}`;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginBottom: 10,
          color: "#94a3b8",
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {icon && <span style={{ opacity: 0.85 }}>{icon}</span>}
        {label}
      </div>

      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: valueColor,
          letterSpacing: "-0.03em",
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>

      {subtext && (
        <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
          {subtext}
        </div>
      )}
    </div>
  );
}

/* ===================== ObjetivoTabs FUTURISTA ===================== */
const COLOR_MAP = {
  dia: { border: "rgba(251, 191, 36, 0.55)", glow: "rgba(251, 191, 36, 0.25)", text: "#fde68a" },
  max: { border: "rgba(34, 211, 238, 0.45)", glow: "rgba(34, 211, 238, 0.18)", text: "#a5f3fc" },
  open: { border: "rgba(34, 211, 238, 0.45)", glow: "rgba(34, 211, 238, 0.18)", text: "#a5f3fc" },
  champions: { border: "rgba(251, 191, 36, 0.5)", glow: "rgba(251, 191, 36, 0.2)", text: "#fde68a" },
  unidades: { border: "rgba(52, 211, 153, 0.5)", glow: "rgba(52, 211, 153, 0.2)", text: "#6ee7b7" },
  mesa: { border: "rgba(34, 211, 238, 0.4)", glow: "rgba(34, 211, 238, 0.15)", text: "#a5f3fc" },
  cuponera: { border: "rgba(34, 211, 238, 0.4)", glow: "rgba(34, 211, 238, 0.15)", text: "#a5f3fc" },
  tiempos: { border: "rgba(34, 211, 238, 0.4)", glow: "rgba(34, 211, 238, 0.15)", text: "#a5f3fc" },
  actividades_dia: { border: "rgba(248, 113, 113, 0.45)", glow: "rgba(248, 113, 113, 0.15)", text: "#fca5a5" },
  actividades_semana: { border: "rgba(248, 113, 113, 0.4)", glow: "rgba(248, 113, 113, 0.12)", text: "#fca5a5" },
  actividades_mes: { border: "rgba(248, 113, 113, 0.4)", glow: "rgba(248, 113, 113, 0.12)", text: "#fca5a5" },
  rally_otc: { border: "rgba(52, 211, 153, 0.55)", glow: "rgba(52, 211, 153, 0.22)", text: "#6ee7b7" },
  avisos: { border: "rgba(251, 191, 36, 0.55)", glow: "rgba(251, 191, 36, 0.22)", text: "#fde68a" },
  facturas: { border: "rgba(34, 211, 238, 0.4)", glow: "rgba(34, 211, 238, 0.15)", text: "#a5f3fc" },
  creditos: { border: "rgba(52, 211, 153, 0.5)", glow: "rgba(52, 211, 153, 0.2)", text: "#6ee7b7" },
  default: { border: "rgba(148, 163, 184, 0.25)", glow: "rgba(148, 163, 184, 0.08)", text: "#cbd5e1" },
};

export function ObjetivoTabs({ tab, setTab, tabs, estadoTabs = {} }) {
  const lista = tabs || OBJETIVO_TABS;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 22 }}>
      {lista.map((t) => {
        const isActive = tab === t.key;
        const estado = estadoTabs[t.key];
        const colors = COLOR_MAP[t.key] || COLOR_MAP.default;

        let extraBorder = colors.border;
        let extraGlow = colors.glow;
        let extraText = colors.text;

        if (estado === "pendiente" || estado === "pendiente_urgente") {
          extraBorder = "rgba(248, 113, 113, 0.65)";
          extraGlow = "rgba(248, 113, 113, 0.25)";
          extraText = "#fca5a5";
        } else if (estado === "completo") {
          extraBorder = "rgba(52, 211, 153, 0.55)";
          extraGlow = "rgba(52, 211, 153, 0.2)";
          extraText = "#6ee7b7";
        } else if (estado === "aviso_nuevo" || estado === "parpadeo_verde") {
          extraBorder = "rgba(52, 211, 153, 0.6)";
          extraGlow = "rgba(52, 211, 153, 0.28)";
          extraText = "#6ee7b7";
        }

        return (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              position: "relative",
              padding: "11px 18px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.03em",
              cursor: "pointer",
              transition: "all 0.22s ease",
              background: isActive
                ? `linear-gradient(135deg, ${extraGlow}, rgba(15, 23, 42, 0.6))`
                : "rgba(15, 23, 42, 0.45)",
              border: `1px solid ${isActive ? extraBorder : "rgba(148, 163, 184, 0.15)"}`,
              color: isActive ? extraText : "#94a3b8",
              boxShadow: isActive
                ? `0 0 22px ${extraGlow}, inset 0 1px 0 rgba(255,255,255,0.06)`
                : "none",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = extraBorder;
                e.currentTarget.style.color = extraText;
                e.currentTarget.style.boxShadow = `0 0 16px ${extraGlow}`;
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = "rgba(148, 163, 184, 0.15)";
                e.currentTarget.style.color = "#94a3b8";
                e.currentTarget.style.boxShadow = "none";
              }
            }}
          >
            {t.label || t.key.toUpperCase()}

            {(estado === "pendiente" || estado === "pendiente_urgente" || estado === "aviso_nuevo") && (
              <span
                style={{
                  position: "absolute",
                  top: 7,
                  right: 7,
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: estado === "aviso_nuevo" ? "#34d399" : "#f87171",
                  boxShadow: `0 0 8px ${estado === "aviso_nuevo" ? "#34d399" : "#f87171"}`,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function MarcasBreakdown({ titulo, marcas, data }) {
  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <div className="display" style={{ fontSize: 14, marginBottom: 12, color: "#9AA7BD" }}>{titulo}</div>
      {marcas.map((m) => {
        const d = data[m.key];
        return (
          <div key={m.key} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9AA7BD", marginBottom: 2 }}>
              <span>RESTA: <span style={{ color: "#FF6B6B" }}>{unidades(d.restaPorVender)}</span></span>
              <span>POR DÍA: <span style={{ color: "#F2B134" }}>{unidades(d.ventaPorDiaNecesaria)}</span></span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span>{m.label}</span>
              <span className="mono">{unidades(d.vendido)} / {unidades(d.objetivo)}</span>
            </div>
            <div className="track">
              <div className="track-fill" style={{ width: `${d.pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PegarTextoBox({ onProcesar, placeholder }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  function procesar() {
    if (!texto.trim()) return;
    onProcesar(texto);
    setTexto("");
    setAbierto(false);
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        className="btn-ghost"
        style={{ borderColor: "#F2B134", color: "#F2B134", fontWeight: 600 }}
        onClick={() => setAbierto((a) => !a)}
      >
        <ClipboardPaste size={14} style={{ verticalAlign: "-2px" }} /> {abierto ? "Ocultar pegar texto" : "Pegar texto (en vez de subir archivo)"}
      </button>
      {abierto && (
        <div style={{ marginTop: 8 }}>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={placeholder || "Copia las filas (incluyendo el encabezado) desde la página de origen y pégalas aquí..."}
            rows={6}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 12, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "10px 12px", fontFamily: "monospace" }}
          />
          <button className="btn" style={{ marginTop: 8 }} onClick={procesar}>
            Procesar texto pegado
          </button>
        </div>
      )}
    </div>
  );
}

export function BotonGuardarImagen({ captura, nombreArchivo, etiqueta = "Guardar imagen" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {captura.generandoImagen && <span style={{ fontSize: 12, color: "#9AA7BD" }}>Generando imagen...</span>}
        {!captura.generandoImagen && !captura.imagenLista && (
          <button className="btn-ghost" onClick={() => captura.generarImagen(nombreArchivo)}>
            <Download size={14} style={{ verticalAlign: "-2px" }} /> {etiqueta}
          </button>
        )}
        {captura.imagenLista && (
          <button className="btn" onClick={captura.guardarOCompartir}>
            <Download size={14} style={{ verticalAlign: "-2px" }} /> Guardar imagen
          </button>
        )}
      </div>
      {captura.errorImagen && (
        <div style={{ fontSize: 11, color: "#FF6B6B" }}>No se pudo generar: {captura.errorImagen}</div>
      )}
    </div>
  );
}

export function ModalTablaCompleta({ titulo, onClose, children }) {
  const contenedorRef = useRef(null);
  const contenidoRef = useRef(null);
  const [escala, setEscala] = useState(1);
  const [dimensiones, setDimensiones] = useState({ ancho: 0, alto: 0 });
  useEffect(() => {
    function recalcular() {
      const contenedor = contenedorRef.current;
      const contenido = contenidoRef.current;
      if (!contenedor || !contenido) return;
      contenido.style.transform = "none";
      const anchoDisponible = contenedor.clientWidth - 16;
      const anchoNatural = contenido.scrollWidth;
      const altoNatural = contenido.scrollHeight;
      const nuevaEscala = anchoNatural > 0 ? Math.min(anchoDisponible / anchoNatural, 1) : 1;
      setEscala(nuevaEscala);
      setDimensiones({ ancho: anchoNatural * nuevaEscala, alto: altoNatural * nuevaEscala });
    }
    recalcular();
    window.addEventListener("resize", recalcular);
    window.addEventListener("orientationchange", recalcular);
    return () => {
      window.removeEventListener("resize", recalcular);
      window.removeEventListener("orientationchange", recalcular);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "#0B1220", zIndex: 9999,
        display: "flex", flexDirection: "column", padding: 14, boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexShrink: 0 }}>
        <span className="display" style={{ fontSize: 15, color: "#E8EDF5" }}>{titulo}</span>
        <button className="btn-ghost" onClick={onClose}>Cerrar</button>
      </div>
      <div style={{ fontSize: 11, color: "#9AA7BD", marginBottom: 8, flexShrink: 0 }}>
        Gira tu teléfono en horizontal para verla más grande. La tabla se ajusta sola para que quepa completa en la pantalla — lista para tomarle screenshot.
      </div>
      <div ref={contenedorRef} style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center" }}>
        <div style={{ width: dimensiones.ancho || "auto", height: dimensiones.alto || "auto" }}>
          <div ref={contenidoRef} style={{ transform: `scale(${escala})`, transformOrigin: "top left", width: "max-content" }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
