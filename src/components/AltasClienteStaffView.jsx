import React, { useState, useEffect } from "react";
import { UploadCloud, CheckCircle2, AlertCircle, Clock, MapPin, Phone, Camera, ChevronDown, Trash2, Pencil, Save, X } from "lucide-react";
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

const CAMPOS_EDITABLES = [
  { key: "nombre_negocio", label: "Nombre negocio" },
  { key: "nombre_cliente", label: "Nombre del cliente" },
  { key: "ruta_codigo", label: "Ruta (ej. J201)" },
  { key: "telefono", label: "Teléfono" },
  { key: "calle", label: "Calle" },
  { key: "numero", label: "Número" },
  { key: "numero_interior", label: "Número interior" },
  { key: "colonia", label: "Colonia" },
  { key: "entre_calle_1", label: "Entre calle 1" },
  { key: "entre_calle_2", label: "Entre calle 2" },
  { key: "codigo_postal", label: "Código postal" },
  { key: "estado", label: "Estado" },
  { key: "municipio", label: "Municipio" },
  { key: "volumen_semanal", label: "Volumen semanal" },
  { key: "coord_x", label: "Coord X" },
  { key: "coord_y", label: "Coord Y" },
  { key: "comentario", label: "Comentario" },
];

function CampoDetalle({ label, valor }) {
  if (!valor) return null;
  return (
    <div>
      <div style={{ fontSize: 9.5, color: "#6C7A96", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 12.5, color: "#E8EDF5", marginTop: 1 }}>{valor}</div>
    </div>
  );
}

function TarjetaAlta({ alta, esGerente, onEliminar, onGuardarEdicion }) {
  const [abierta, setAbierta] = useState(false);
  const [editando, setEditando] = useState(false);
  const [valores, setValores] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const direccion = [alta.calle, alta.numero, alta.colonia].filter(Boolean).join(", ");

  function handleEliminar(e) {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar el alta de "${alta.nombre_negocio}"? Esto no se puede deshacer.`)) return;
    onEliminar(alta.id);
  }

  function empezarEdicion(e) {
    e.stopPropagation();
    const iniciales = {};
    CAMPOS_EDITABLES.forEach((c) => { iniciales[c.key] = alta[c.key] || ""; });
    setValores(iniciales);
    setEditando(true);
    setAbierta(true);
  }

  function cancelarEdicion(e) {
    e.stopPropagation();
    setEditando(false);
    setValores(null);
  }

  async function guardarEdicion(e) {
    e.stopPropagation();
    setGuardando(true);
    // Rutas se escriben en mayúsculas para que calcen con NUR_POR_RUTA del
    // script (que compara "J201" tal cual, sin normalizar).
    const cambios = { ...valores, ruta_codigo: valores.ruta_codigo ? valores.ruta_codigo.trim().toUpperCase() : null };
    const ok = await onGuardarEdicion(alta.id, cambios);
    setGuardando(false);
    if (ok) setEditando(false);
  }

  return (
    <div className="card" style={{ padding: 14, marginBottom: 10, cursor: editando ? "default" : "pointer" }} onClick={() => !editando && setAbierta((v) => !v)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "flex-start", gap: 6 }}>
          <ChevronDown
            size={15}
            color={COLORS.muted}
            style={{ marginTop: 3, flexShrink: 0, transition: "transform 0.15s", transform: abierta ? "rotate(180deg)" : "rotate(0deg)" }}
          />
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "#E8EDF5" }}>{alta.nombre_negocio}</div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 1 }}>{alta.nombre_cliente}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexShrink: 0 }}>
          {!editando && (
            <button
              onClick={empezarEdicion}
              title="Editar alta"
              style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: COLORS.ambar, display: "flex" }}
            >
              <Pencil size={14} />
            </button>
          )}
          {esGerente && !editando && (
            <button
              onClick={handleEliminar}
              title="Eliminar alta (solo Gerente)"
              style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: COLORS.rojo, display: "flex" }}
            >
              <Trash2 size={14} />
            </button>
          )}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
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
          <a href={alta.foto_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4, color: COLORS.ambar, textDecoration: "none" }}>
            <Camera size={12} /> Ver foto
          </a>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: COLORS.muted }}>
        <span>Vendedor: {alta.vendedor_username || "—"}</span>
        <span>{formatFecha(alta.created_at)}</span>
      </div>

      {!editando && alta.comentario && (
        <div style={{ marginTop: 6, fontSize: 12, color: "#E8EDF5", background: "#0F172A", borderRadius: 8, padding: "6px 8px" }}>
          {alta.comentario}
        </div>
      )}

      {alta.estatus === "enviado" && alta.enviado_por && (
        <div style={{ marginTop: 6, fontSize: 11, color: COLORS.verde }}>
          Enviado por {alta.enviado_por} · {formatFecha(alta.enviado_en)}
          {alta.folio_rp && ` · Folio RP: ${alta.folio_rp}`}
        </div>
      )}

      {abierta && !editando && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: 12, paddingTop: 12, borderTop: `1px solid ${COLORS.borde}`,
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10,
          }}
        >
          <CampoDetalle label="Número interior" valor={alta.numero_interior} />
          <CampoDetalle label="Entre calle 1" valor={alta.entre_calle_1} />
          <CampoDetalle label="Entre calle 2" valor={alta.entre_calle_2} />
          <CampoDetalle label="Código postal" valor={alta.codigo_postal} />
          <CampoDetalle label="Estado" valor={alta.estado} />
          <CampoDetalle label="Municipio" valor={alta.municipio} />
          <CampoDetalle label="Volumen semanal" valor={alta.volumen_semanal} />
          <CampoDetalle label="Coord X" valor={alta.coord_x} />
          <CampoDetalle label="Coord Y" valor={alta.coord_y} />
          {alta.archivo_url && (
            <div>
              <div style={{ fontSize: 9.5, color: "#6C7A96", textTransform: "uppercase", letterSpacing: "0.04em" }}>Archivo</div>
              <a href={alta.archivo_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: COLORS.ambar }}>Ver archivo</a>
            </div>
          )}
        </div>
      )}

      {editando && valores && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: 12, paddingTop: 12, borderTop: `1px solid ${COLORS.borde}`,
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10,
          }}
        >
          {CAMPOS_EDITABLES.map((c) => (
            <div key={c.key} style={{ gridColumn: c.key === "comentario" ? "1 / -1" : undefined }}>
              <div style={{ fontSize: 9.5, color: "#6C7A96", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>{c.label}</div>
              <input
                value={valores[c.key]}
                onChange={(e) => setValores((v) => ({ ...v, [c.key]: e.target.value }))}
                style={{
                  width: "100%", boxSizing: "border-box", fontSize: 12.5, padding: "6px 8px", borderRadius: 6,
                  background: "#0F172A", color: "#E8EDF5", border: `1px solid ${COLORS.borde}`,
                }}
              />
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={guardarEdicion} disabled={guardando} className="btn" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, opacity: guardando ? 0.6 : 1 }}>
              <Save size={13} /> {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
            <button onClick={cancelarEdicion} disabled={guardando} className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
              <X size={13} /> Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AltasClienteStaffView({ revisorNombre, puesto }) {
  const esGerente = puesto === "gerente";
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

  // Eliminar es exclusivo de Gerente — se revalida aquí también (no solo
  // en el botón, que ya está oculto para cualquier otro puesto) por si
  // alguien llega a llamar esto de otra forma.
  async function eliminarAlta(id) {
    if (!esGerente) return;
    const { error } = await supabase.from("altas_cliente").delete().eq("id", id);
    if (error) {
      console.error("Error eliminando alta de cliente:", error);
      return;
    }
    setAltas((prev) => prev.filter((a) => a.id !== id));
  }

  // Editar sí está disponible para Supervisor-1 y Gerente — para corregir
  // casos como este (un municipio mal capturado, una ruta que se guardó
  // vacía, etc.) sin tener que borrar y volver a pedirle el alta al
  // vendedor.
  async function guardarEdicionAlta(id, cambios) {
    const { error } = await supabase.from("altas_cliente").update(cambios).eq("id", id);
    if (error) {
      console.error("Error guardando edición de alta de cliente:", error);
      return false;
    }
    setAltas((prev) => prev.map((a) => (a.id === id ? { ...a, ...cambios } : a)));
    return true;
  }

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
        pendientes.map((a) => <TarjetaAlta key={a.id} alta={a} esGerente={esGerente} onEliminar={eliminarAlta} onGuardarEdicion={guardarEdicionAlta} />)
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
              {enviadas.map((a) => <TarjetaAlta key={a.id} alta={a} esGerente={esGerente} onEliminar={eliminarAlta} onGuardarEdicion={guardarEdicionAlta} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
