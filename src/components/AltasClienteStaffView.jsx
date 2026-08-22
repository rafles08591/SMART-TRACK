import React, { useState, useEffect } from "react";
import { UploadCloud, CheckCircle2, AlertCircle, Clock, MapPin, Phone, Camera } from "lucide-react";
import { supabase } from "../supabaseClient";
import { generarScriptAltaClienteFase2 } from "../altaClienteScriptGenerator";

/* =========================================================================
   AltasClienteStaffView — para Supervisor-1 y Gerente: ve TODAS las altas
   de cliente que capturan los vendedores (pendientes y ya enviadas), con
   el botón "Copiar script de Alta Cliente" para generar el código listo
   para pegar en la consola del RP (jmdresources) — mismo patrón que
   "Copiar script de KM".
   ========================================================================= */

const COLORS = { rojo: "#FF6B6B", ambar: "#F2B134", verde: "#3DDC97", muted: "#9AA7BD", borde: "#2A3852" };

function formatFecha(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function TarjetaAlta({ alta }) {
  const direccion = [alta.calle, alta.numero, alta.colonia].filter(Boolean).join(", ");
  return (
    <div className="card" style={{ padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: "#E8EDF5" }}>{alta.nombre_negocio}</div>
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 1 }}>{alta.nombre_cliente}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "3px 8px", borderRadius: 999,
              color: alta.estatus === "enviado" ? COLORS.verde : COLORS.ambar,
              background: alta.estatus === "enviado" ? `${COLORS.verde}22` : `${COLORS.ambar}22`,
            }}
          >
            {alta.estatus}
          </span>
          <span style={{ fontSize: 10.5, color: COLORS.muted, fontFamily: "monospace" }}>{alta.ruta_codigo || "—"}</span>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 8, fontSize: 12, color: COLORS.muted }}>
        {direccion && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <MapPin size={12} /> {direccion}
          </span>
        )}
        {alta.telefono && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Phone size={12} /> {alta.telefono}
          </span>
        )}
        {alta.foto_url && (
          <a href={alta.foto_url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 4, color: COLORS.ambar, textDecoration: "none" }}>
            <Camera size={12} /> Ver foto
          </a>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: COLORS.muted }}>
        <span>Vendedor: {alta.vendedor_username || "—"}</span>
        <span>{formatFecha(alta.created_at)}</span>
      </div>

      {alta.comentario && (
        <div style={{ marginTop: 6, fontSize: 12, color: "#E8EDF5", background: "#0F172A", borderRadius: 8, padding: "6px 8px" }}>
          {alta.comentario}
        </div>
      )}

      {alta.estatus === "enviado" && alta.enviado_por && (
        <div style={{ marginTop: 6, fontSize: 11, color: COLORS.verde }}>
          Enviado por {alta.enviado_por} · {formatFecha(alta.enviado_en)}
        </div>
      )}
    </div>
  );
}

export default function AltasClienteStaffView({ revisorNombre }) {
  const [altas, setAltas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [scriptStatus, setScriptStatus] = useState("");
  const [verEnviadas, setVerEnviadas] = useState(false);

  async function cargarAltas() {
    try {
      const { data, error } = await supabase
        .from("altas_cliente")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!error) setAltas(data || []);
    } catch (e) {
      console.error("Error cargando altas de cliente:", e);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarAltas();
    const intervalo = setInterval(cargarAltas, 20000);
    return () => clearInterval(intervalo);
  }, []);

  const pendientes = altas.filter((a) => a.estatus === "pendiente");
  const enviadas = altas.filter((a) => a.estatus === "enviado");

  async function copiarScript() {
    try {
      const texto = generarScriptAltaClienteFase2({
        supabaseUrl: supabase.supabaseUrl,
        supabaseAnonKey: supabase.supabaseKey,
        staffUsername: revisorNombre,
      });
      await navigator.clipboard.writeText(texto);
      setScriptStatus("Copiado ✅ — pégalo en la consola de jmdresources");
    } catch (e) {
      setScriptStatus(`Error al copiar: ${e.message || e}`);
    } finally {
      setTimeout(() => setScriptStatus(""), 4000);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div className="display" style={{ fontSize: 14, color: "#E8EDF5" }}>ALTAS DE CLIENTE</div>
            <div style={{ fontSize: 12, color: pendientes.length > 0 ? COLORS.ambar : COLORS.muted, marginTop: 2 }}>
              {pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"} de subir al RP
            </div>
          </div>
          <button className="btn" onClick={copiarScript} disabled={pendientes.length === 0}>
            <UploadCloud size={14} style={{ verticalAlign: "-2px" }} /> Copiar script de Alta Cliente
          </button>
        </div>
        {scriptStatus && (
          <div style={{ marginTop: 8, fontSize: 12.5, display: "flex", alignItems: "center", gap: 6, color: scriptStatus.startsWith("Copiado") ? COLORS.verde : COLORS.rojo }}>
            {scriptStatus.startsWith("Copiado") ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />} {scriptStatus}
          </div>
        )}
      </div>

      {cargando ? (
        <div style={{ textAlign: "center", fontSize: 13, color: COLORS.muted, padding: 16 }}>Cargando…</div>
      ) : pendientes.length === 0 ? (
        <div className="card" style={{ padding: 16, textAlign: "center", fontSize: 13, color: COLORS.muted }}>
          No hay altas pendientes. 🎉
        </div>
      ) : (
        pendientes.map((a) => <TarjetaAlta key={a.id} alta={a} />)
      )}

      {enviadas.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <button
            className="btn-ghost"
            onClick={() => setVerEnviadas((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}
          >
            <Clock size={13} /> {verEnviadas ? "Ocultar" : "Ver"} enviadas recientes ({enviadas.length})
          </button>
          {verEnviadas && (
            <div style={{ marginTop: 10 }}>
              {enviadas.map((a) => <TarjetaAlta key={a.id} alta={a} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
