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

export function KpiCard({ icon, label, value, accent }) {
  return (
    <div className="card" style={{ padding: 16, flex: "1 1 140px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#9AA7BD", fontSize: 12, marginBottom: 6 }}>
        {icon}<span>{label}</span>
      </div>
      <div className="mono display" style={{ fontSize: 22, color: accent || "#E8EDF5" }}>{value}</div>
    </div>
  );
}

// Ranking "REPARTIDOR AHOGADO": ordena a todos por efectividad del día
// (peor primero) y, para los últimos 3 lugares, dibuja una ilustración de
// agua con aletas de tiburón acechando — todo en SVG, sin necesitar subir
// ninguna imagen.

export function ObjetivoTabs({ tab, setTab, tabs, estadoTabs }) {
  const lista = tabs || OBJETIVO_TABS;
  return (
    <div style={{ display: "flex", gap: 8, margin: "14px 0", flexWrap: "wrap" }}>
      <style>{`
        @keyframes parpadeoRojoTab { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,107,107,0.55); } 50% { box-shadow: 0 0 0 5px rgba(255,107,107,0); } }
        @keyframes parpadeoNaranjaIntensoTab {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,140,0,0.85); background-color: rgba(255,140,0,0.12); }
          50% { box-shadow: 0 0 0 8px rgba(255,140,0,0); background-color: rgba(255,140,0,0.45); }
        }
        @keyframes parpadeoRojoIntensoTab {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,0,0,0.9); background-color: rgba(255,0,0,0.18); }
          50% { box-shadow: 0 0 0 10px rgba(255,0,0,0); background-color: rgba(255,0,0,0.55); }
        }
        .tab-pendiente { border: 1px solid #FF6B6B !important; color: #FF6B6B !important; animation: parpadeoRojoTab 1.4s ease-in-out infinite; }
        .tab-completo { border: 1px solid #3DDC97 !important; color: #3DDC97 !important; }
        .tab-aviso-nuevo { border: 2px solid #FF8C00 !important; color: #FF8C00 !important; font-weight: 800 !important; animation: parpadeoNaranjaIntensoTab 0.9s ease-in-out infinite; }
        .tab-pendiente-urgente { border: 2px solid #FF0000 !important; color: #FF0000 !important; font-weight: 800 !important; animation: parpadeoRojoIntensoTab 0.7s ease-in-out infinite; }
      `}</style>
      {lista.map((t) => {
        const estado = estadoTabs && estadoTabs[t.key];
        const claseExtra = estado === "pendiente" ? "tab-pendiente" : estado === "completo" ? "tab-completo" : estado === "aviso_nuevo" ? "tab-aviso-nuevo" : estado === "pendiente_urgente" ? "tab-pendiente-urgente" : "";
        return (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`${tab === t.key ? "btn" : "btn-ghost"} ${claseExtra}`} style={{ fontSize: 13, flex: 1 }}>
            {t.label}
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

// Caja colapsable "Pegar texto" — alternativa a subir un archivo: se copia
// directo desde la página de origen (Ctrl+C) y se pega aquí (Ctrl+V), sin
// tener que descargar ni buscar ningún archivo. Reutilizable en cualquier
// pestaña de carga de datos.

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
      // Se mide el contenido a tamaño natural (sin escalar) para calcular el factor correcto.
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


