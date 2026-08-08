// @ts-nocheck
import React, { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Star, Ban, CheckCircle2, AlertCircle, MessageSquare, Upload, Send } from "lucide-react";
import { supabase } from "../supabaseClient";

function hoyISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

const COLOR_FORMA_PAGO = {
  EFECTIVO: "#3DDC97",
  CREDITO: "#F2B134",
  TRANSFERENCIA: "#5AA9E6",
};

/**
 * Pestaña FACTURAS — visible para rutas (vendedor), SUPERVISOR-1 y GERENTE.
 *
 * El cruce contra las ventas se hace por CÓDIGO de cliente (no por nombre),
 * ignorando ceros a la izquierda — igual que ya hace el resto de la app en
 * "clientes no visitados". El nombre solo se guarda como referencia visual.
 *
 * - Cada quien registra los clientes que normalmente piden factura (código +
 *   nombre).
 * - Se cataloga como PRIORITARIO o, si no se marca nada, queda como NORMAL.
 * - Se puede marcar "no facturar hoy" para que la compra de HOY de ese
 *   cliente no se mande a facturación.
 * - GERENTE ve TODAS las rutas, edita, borra clientes, y tiene un botón para
 *   borrar el histórico de ventas ya facturadas por rango de fechas.
 *
 * Props:
 *   rol: "vendedor" | "staff"
 *   puesto: null | "supervisor" | "gerente"
 *   rutaActual: nombre de la ruta si es vendedor (ej. "RUTA J201")
 *   identidad: nombre para mostrar como "creado_por"
 *   nombres: mapa NOMBRES de la app
 *   vendedores: array [{id, name}, ...] para el selector de ruta en gerente/supervisor
 */
export default function FacturasView({ rol, puesto, rutaActual, identidad, nombres, vendedores }) {
  const esGerente = rol === "staff" && puesto === "gerente";
  const esStaff = rol === "staff";
  const listaRutas = (vendedores || []).map((v) => v.name);

  const [rutaSeleccionada, setRutaSeleccionada] = useState(rutaActual || listaRutas[0] || "");
  const [verTodasLasRutas, setVerTodasLasRutas] = useState(esGerente);

  const [clientes, setClientes] = useState([]);
  const [exclusionesHoy, setExclusionesHoy] = useState(new Set());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [codigoNuevo, setCodigoNuevo] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [prioridadNueva, setPrioridadNueva] = useState(false);
  const [formaPagoNueva, setFormaPagoNueva] = useState("EFECTIVO");
  const [guardando, setGuardando] = useState(false);

  const [fechaDesdeBorrar, setFechaDesdeBorrar] = useState("");
  const [fechaHastaBorrar, setFechaHastaBorrar] = useState("");
  const [borrandoRango, setBorrandoRango] = useState(false);
  const [mensajeBorrado, setMensajeBorrado] = useState("");

  const [codigoOtc, setCodigoOtc] = useState("");
  const [montoOtc, setMontoOtc] = useState("");
  const [formaPagoOtc, setFormaPagoOtc] = useState("EFECTIVO");
  const [prioridadOtc, setPrioridadOtc] = useState(false);
  const [guardandoOtc, setGuardandoOtc] = useState(false);

  async function facturarOtc() {
    const codigo = codigoOtc.trim();
    const monto = Number(montoOtc);
    if (!codigo) { alert("Escribe el código del cliente."); return; }
    if (!monto || monto <= 0) { alert("Escribe el monto de la venta OTC."); return; }
    if (!rutaSeleccionada) { alert("Elige primero la ruta."); return; }
    setGuardandoOtc(true);
    try {
      // Va directo a ventas_facturas (no depende de que se suba el avance
      // del día, ya que OTC no trae código de cliente en ese reporte).
      // cajetillas=0 a propósito: así el desglose de esa línea NO calcula
      // costo de distribución, solo descuenta el IVA (ver FacturasAdminView).
      const fila = {
        ruta: rutaSeleccionada,
        codigo_cliente: codigo,
        articulo: "OTC",
        producto_nombre: "Venta OTC",
        fecha: hoyISO(),
        paquetes: 0,
        cajetillas: 0,
        contado_monto: formaPagoOtc === "CREDITO" ? 0 : monto,
        credito_monto: formaPagoOtc === "CREDITO" ? monto : 0,
        monto,
        forma_pago: formaPagoOtc,
        prioridad: prioridadOtc,
        cliente_id: null,
      };
      const { error: err } = await supabase.rpc("upsert_ventas_facturas", { payload: [fila] });
      if (err) throw err;
      alert("Venta OTC enviada a facturación.");
      setCodigoOtc("");
      setMontoOtc("");
      setFormaPagoOtc("EFECTIVO");
      setPrioridadOtc(false);
    } catch (err) {
      console.error("Error facturando OTC:", err);
      alert("No se pudo guardar: " + (err?.message || "intenta de nuevo"));
    } finally {
      setGuardandoOtc(false);
    }
  }
  const [codigoUnico, setCodigoUnico] = useState("");
  const [formaPagoUnica, setFormaPagoUnica] = useState("EFECTIVO");
  const [prioridadUnica, setPrioridadUnica] = useState(false);
  const [guardandoUnica, setGuardandoUnica] = useState(false);
  const [solicitudesUnicas, setSolicitudesUnicas] = useState([]);
  const [cargandoUnicas, setCargandoUnicas] = useState(true);

  async function cargarSolicitudesUnicas() {
    setCargandoUnicas(true);
    try {
      let query = supabase
        .from("facturas_solicitudes_unicas")
        .select("id, ruta, codigo_cliente, forma_pago, prioridad, usada, fecha_uso, creado_en")
        .eq("usada", false)
        .order("creado_en", { ascending: false });
      if (!(esGerente && verTodasLasRutas)) {
        query = query.eq("ruta", rutaSeleccionada);
      }
      const { data, error: err } = await query;
      if (err) throw err;
      setSolicitudesUnicas(data || []);
    } catch (err) {
      console.error("Error cargando solicitudes únicas:", err);
    } finally {
      setCargandoUnicas(false);
    }
  }

  useEffect(() => {
    cargarSolicitudesUnicas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rutaSeleccionada, verTodasLasRutas]);

  async function solicitarFacturaUnica() {
    const codigo = codigoUnico.trim();
    if (!codigo) {
      alert("Escribe el código del cliente.");
      return;
    }
    if (!rutaSeleccionada) {
      alert("Elige primero la ruta.");
      return;
    }
    setGuardandoUnica(true);
    try {
      const { error: err } = await supabase.from("facturas_solicitudes_unicas").insert({
        ruta: rutaSeleccionada,
        codigo_cliente: codigo,
        forma_pago: formaPagoUnica,
        prioridad: prioridadUnica,
        creado_por: identidad || null,
      });
      if (err) throw err;
      setCodigoUnico("");
      setFormaPagoUnica("EFECTIVO");
      setPrioridadUnica(false);
      await cargarSolicitudesUnicas();
    } catch (err) {
      console.error("Error guardando solicitud única:", err);
      alert("No se pudo guardar la solicitud: " + (err?.message || "intenta de nuevo"));
    } finally {
      setGuardandoUnica(false);
    }
  }

  async function cancelarSolicitudUnica(solicitud) {
    const ok = window.confirm(`¿Cancelar la solicitud de factura única para el cliente ${solicitud.codigo_cliente}?`);
    if (!ok) return;
    const { error: err } = await supabase.from("facturas_solicitudes_unicas").delete().eq("id", solicitud.id);
    if (err) {
      alert("No se pudo cancelar: " + err.message);
      return;
    }
    setSolicitudesUnicas((s) => s.filter((x) => x.id !== solicitud.id));
  }

  async function cargarClientes() {
    setCargando(true);
    setError(null);
    try {
      let query = supabase
        .from("clientes_facturables")
        .select("id, ruta, codigo_cliente, cliente, prioridad, forma_pago_default, creado_por, creado_en")
        .order("codigo_cliente", { ascending: true });
      if (!(esGerente && verTodasLasRutas)) {
        query = query.eq("ruta", rutaSeleccionada);
      }
      const { data, error: err } = await query;
      if (err) throw err;
      setClientes(data || []);

      const hoy = hoyISO();
      const ids = (data || []).map((c) => c.id);
      if (ids.length > 0) {
        const { data: excl } = await supabase
          .from("facturas_exclusiones_dia")
          .select("cliente_id")
          .eq("fecha", hoy)
          .in("cliente_id", ids);
        setExclusionesHoy(new Set((excl || []).map((e) => e.cliente_id)));
      } else {
        setExclusionesHoy(new Set());
      }
    } catch (err) {
      console.error("Error cargando clientes_facturables:", err);
      setError(err?.message || "No se pudo cargar la lista de clientes.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarClientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rutaSeleccionada, verTodasLasRutas]);

  async function agregarCliente() {
    const codigo = codigoNuevo.trim();
    if (!codigo) {
      alert("Escribe el código del cliente (tal como aparece en el reporte de ventas).");
      return;
    }
    if (!rutaSeleccionada) {
      alert("Elige primero la ruta.");
      return;
    }
    setGuardando(true);
    try {
      const { error: err } = await supabase.from("clientes_facturables").insert({
        ruta: rutaSeleccionada,
        codigo_cliente: codigo,
        cliente: nombreNuevo.trim() || null,
        prioridad: prioridadNueva,
        forma_pago_default: formaPagoNueva,
        creado_por: identidad || null,
      });
      if (err) {
        if (err.code === "23505") {
          alert("Ese código de cliente ya está registrado (revisa si quedó dado de alta en otra ruta — el código es único en todo el catálogo, no se puede repetir).");
        } else {
          throw err;
        }
      } else {
        setCodigoNuevo("");
        setNombreNuevo("");
        setPrioridadNueva(false);
        setFormaPagoNueva("EFECTIVO");
        await cargarClientes();
      }
    } catch (err) {
      console.error("Error agregando cliente:", err);
      alert("No se pudo guardar el cliente: " + (err?.message || "intenta de nuevo"));
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarPrioridad(cliente, nuevoValor) {
    setClientes((cs) => cs.map((c) => (c.id === cliente.id ? { ...c, prioridad: nuevoValor } : c)));
    const { error: err } = await supabase
      .from("clientes_facturables")
      .update({ prioridad: nuevoValor, actualizado_en: new Date().toISOString() })
      .eq("id", cliente.id);
    if (err) {
      console.error("Error actualizando prioridad:", err);
      alert("No se pudo actualizar: " + err.message);
      await cargarClientes();
      return;
    }
    // Refleja el cambio también en las ventas ya guardadas de ese cliente,
    // para que ADMIN las vea del lado correcto sin esperar la próxima carga.
    await supabase.from("ventas_facturas").update({ prioridad: nuevoValor }).eq("cliente_id", cliente.id);
  }

  async function cambiarFormaPagoDefault(cliente, nuevaForma) {
    setClientes((cs) => cs.map((c) => (c.id === cliente.id ? { ...c, forma_pago_default: nuevaForma } : c)));
    const { error: err } = await supabase
      .from("clientes_facturables")
      .update({ forma_pago_default: nuevaForma, actualizado_en: new Date().toISOString() })
      .eq("id", cliente.id);
    if (err) {
      console.error("Error actualizando forma de pago:", err);
      alert("No se pudo actualizar: " + err.message);
      await cargarClientes();
    }
  }

  async function cambiarRuta(cliente, nuevaRuta) {
    setClientes((cs) => cs.map((c) => (c.id === cliente.id ? { ...c, ruta: nuevaRuta } : c)));
    const { error: err } = await supabase
      .from("clientes_facturables")
      .update({ ruta: nuevaRuta, actualizado_en: new Date().toISOString() })
      .eq("id", cliente.id);
    if (err) {
      console.error("Error actualizando ruta:", err);
      alert("No se pudo actualizar la ruta: " + err.message);
      await cargarClientes();
    }
  }

  async function eliminarCliente(cliente) {
    const ok = window.confirm(
      `¿Borrar al cliente "${cliente.codigo_cliente}${cliente.cliente ? " — " + cliente.cliente : ""}" de la lista de facturación? Esto no borra sus ventas ya registradas.`
    );
    if (!ok) return;
    const { error: err } = await supabase.from("clientes_facturables").delete().eq("id", cliente.id);
    if (err) {
      alert("No se pudo borrar: " + err.message);
      return;
    }
    setClientes((cs) => cs.filter((c) => c.id !== cliente.id));
  }

  // ---- Editar cliente (código y/o nombre) ----
  const [editandoClienteId, setEditandoClienteId] = useState(null);
  const [formEdicion, setFormEdicion] = useState({ codigo: "", nombre: "" });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  function iniciarEdicionCliente(cliente) {
    setEditandoClienteId(cliente.id);
    setFormEdicion({ codigo: cliente.codigo_cliente, nombre: cliente.cliente || "" });
  }

  function cancelarEdicionCliente() {
    setEditandoClienteId(null);
  }

  async function guardarEdicionCliente(cliente) {
    const codigo = formEdicion.codigo.trim();
    if (!codigo) {
      alert("El código no puede quedar vacío.");
      return;
    }
    setGuardandoEdicion(true);
    try {
      const { error: err } = await supabase
        .from("clientes_facturables")
        .update({
          codigo_cliente: codigo,
          cliente: formEdicion.nombre.trim() || null,
          actualizado_en: new Date().toISOString(),
        })
        .eq("id", cliente.id);
      if (err) {
        if (err.code === "23505") {
          alert("Ese código ya está registrado en otro cliente del catálogo.");
        } else {
          throw err;
        }
        return;
      }
      // Si cambió el código, también hay que refrescar el nombre/código en
      // las ventas ya guardadas de este cliente para que ADMIN vea lo mismo.
      await supabase
        .from("ventas_facturas")
        .update({ codigo_cliente: codigo, cliente: formEdicion.nombre.trim() || null })
        .eq("cliente_id", cliente.id);
      setEditandoClienteId(null);
      await cargarClientes();
    } catch (err) {
      console.error("Error editando cliente:", err);
      alert("No se pudo guardar: " + (err?.message || "intenta de nuevo"));
    } finally {
      setGuardandoEdicion(false);
    }
  }

  async function toggleNoFacturaHoy(cliente) {
    const hoy = hoyISO();
    const yaExcluido = exclusionesHoy.has(cliente.id);
    if (yaExcluido) {
      const { error: err } = await supabase
        .from("facturas_exclusiones_dia")
        .delete()
        .eq("cliente_id", cliente.id)
        .eq("fecha", hoy);
      if (err) { alert("No se pudo revertir: " + err.message); return; }
      setExclusionesHoy((s) => { const n = new Set(s); n.delete(cliente.id); return n; });
    } else {
      const { error: err } = await supabase
        .from("facturas_exclusiones_dia")
        .insert({ cliente_id: cliente.id, fecha: hoy });
      if (err && err.code !== "23505") { alert("No se pudo guardar: " + err.message); return; }
      setExclusionesHoy((s) => new Set(s).add(cliente.id));
    }
  }

  async function borrarVentasPorRango() {
    if (!fechaDesdeBorrar || !fechaHastaBorrar) {
      alert("Elige la fecha de inicio y de fin a borrar.");
      return;
    }
    const ok = window.confirm(
      `¿Borrar TODAS las ventas de facturación registradas entre ${fechaDesdeBorrar} y ${fechaHastaBorrar}? Esta acción no se puede deshacer (el catálogo de clientes NO se borra, solo el histórico de ventas).`
    );
    if (!ok) return;
    setBorrandoRango(true);
    setMensajeBorrado("");
    try {
      const { error: err, count } = await supabase
        .from("ventas_facturas")
        .delete({ count: "exact" })
        .gte("fecha", fechaDesdeBorrar)
        .lte("fecha", fechaHastaBorrar);
      if (err) throw err;
      setMensajeBorrado(`Se borraron ${count ?? "los"} registros de ventas entre ${fechaDesdeBorrar} y ${fechaHastaBorrar}.`);
    } catch (err) {
      console.error("Error borrando por rango:", err);
      setMensajeBorrado("Error al borrar: " + (err?.message || "intenta de nuevo"));
    } finally {
      setBorrandoRango(false);
    }
  }

  // ---- Observaciones de ADMIN pendientes de respuesta ----
  const [observaciones, setObservaciones] = useState([]);
  const [cargandoObservaciones, setCargandoObservaciones] = useState(true);
  const [respuestasTexto, setRespuestasTexto] = useState({}); // { [obsId]: texto }
  const [archivosRespuesta, setArchivosRespuesta] = useState({}); // { [obsId]: {url,nombre} }
  const [subiendoArchivo, setSubiendoArchivo] = useState({}); // { [obsId]: bool }
  const [enviandoRespuesta, setEnviandoRespuesta] = useState({}); // { [obsId]: bool }
  const fileRefsObs = useRef({});

  async function cargarObservaciones() {
    setCargandoObservaciones(true);
    try {
      let query = supabase
        .from("facturas_observaciones")
        .select("id, ruta, codigo_cliente, fecha, mensaje, autor, creado_en, respuesta_texto, respuesta_archivo_url, respuesta_archivo_nombre, respondido_en")
        .eq("resuelta", false)
        .order("creado_en", { ascending: false });
      if (!(esGerente && verTodasLasRutas)) {
        query = query.eq("ruta", rutaSeleccionada);
      }
      const { data, error: err } = await query;
      if (err) throw err;
      setObservaciones(data || []);
    } catch (err) {
      console.error("Error cargando observaciones:", err);
    } finally {
      setCargandoObservaciones(false);
    }
  }

  useEffect(() => {
    cargarObservaciones();
    const intervalo = setInterval(cargarObservaciones, 20000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rutaSeleccionada, verTodasLasRutas]);

  async function subirArchivoRespuesta(obsId, file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert("El archivo pesa más de 8MB. Usa uno más ligero.");
      return;
    }
    setSubiendoArchivo((s) => ({ ...s, [obsId]: true }));
    try {
      const extension = (file.name.split(".").pop() || "bin").toLowerCase();
      const nombreArchivo = `factura_obs_${obsId}_${Date.now()}.${extension}`;
      const { error: err } = await supabase.storage.from("promociones").upload(nombreArchivo, file, { cacheControl: "3600", upsert: false });
      if (err) {
        alert("No se pudo subir el archivo: " + err.message);
        return;
      }
      const { data: urlData } = supabase.storage.from("promociones").getPublicUrl(nombreArchivo);
      setArchivosRespuesta((s) => ({ ...s, [obsId]: { url: urlData.publicUrl, nombre: file.name } }));
    } finally {
      setSubiendoArchivo((s) => ({ ...s, [obsId]: false }));
    }
  }

  async function enviarRespuestaObservacion(obs) {
    const texto = (respuestasTexto[obs.id] || "").trim();
    const archivo = archivosRespuesta[obs.id];
    if (!texto && !archivo) {
      alert("Escribe una respuesta o adjunta un archivo.");
      return;
    }
    setEnviandoRespuesta((s) => ({ ...s, [obs.id]: true }));
    try {
      const { error: err } = await supabase
        .from("facturas_observaciones")
        .update({
          respuesta_texto: texto || null,
          respuesta_archivo_url: archivo?.url || null,
          respuesta_archivo_nombre: archivo?.nombre || null,
          respondido_en: new Date().toISOString(),
        })
        .eq("id", obs.id);
      if (err) throw err;
      await cargarObservaciones();
    } catch (err) {
      console.error("Error enviando respuesta:", err);
      alert("No se pudo enviar la respuesta: " + (err?.message || "intenta de nuevo"));
    } finally {
      setEnviandoRespuesta((s) => ({ ...s, [obs.id]: false }));
    }
  }

  return (
    <div>
      <div className="display" style={{ fontSize: 16, color: "#E8EDF5", marginBottom: 14 }}>FACTURAS</div>

      {!cargandoObservaciones && observaciones.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {observaciones.map((obs) => (
            <div key={obs.id} className="card" style={{ padding: 16, border: "2px solid #FF8C00", background: "rgba(255,140,0,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <MessageSquare size={16} color="#FF8C00" />
                <span className="display" style={{ fontSize: 13, color: "#FF8C00" }}>OBSERVACIÓN DE FACTURACIÓN</span>
              </div>
              <div style={{ fontSize: 11, color: "#9AA7BD", marginBottom: 8 }}>
                Cliente {obs.codigo_cliente} · {obs.fecha}{esGerente && verTodasLasRutas ? ` · ${obs.ruta}` : ""}
              </div>
              <div style={{ fontSize: 13, color: "#E8EDF5", whiteSpace: "pre-wrap", marginBottom: 10 }}>{obs.mensaje}</div>

              {obs.respondido_en ? (
                <div style={{ fontSize: 12, color: "#3DDC97", display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle2 size={13} /> Ya respondiste — esperando revisión de facturación.
                </div>
              ) : (
                <div>
                  <textarea
                    value={respuestasTexto[obs.id] || ""}
                    onChange={(e) => setRespuestasTexto((s) => ({ ...s, [obs.id]: e.target.value }))}
                    placeholder="Escribe tu respuesta..."
                    rows={2}
                    style={{ width: "100%", boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "8px 10px", marginBottom: 8 }}
                  />
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      className="btn-ghost"
                      onClick={() => fileRefsObs.current[obs.id]?.click()}
                      disabled={subiendoArchivo[obs.id]}
                    >
                      <Upload size={13} style={{ verticalAlign: "-2px" }} /> {subiendoArchivo[obs.id] ? "Subiendo..." : archivosRespuesta[obs.id] ? "Cambiar archivo" : "Adjuntar archivo"}
                    </button>
                    <input
                      ref={(el) => (fileRefsObs.current[obs.id] = el)}
                      type="file"
                      style={{ display: "none" }}
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) subirArchivoRespuesta(obs.id, f); }}
                    />
                    {archivosRespuesta[obs.id] && <span style={{ fontSize: 11, color: "#9AA7BD" }}>{archivosRespuesta[obs.id].nombre}</span>}
                    <button
                      className="btn"
                      style={{ marginLeft: "auto" }}
                      disabled={enviandoRespuesta[obs.id]}
                      onClick={() => enviarRespuestaObservacion(obs)}
                    >
                      <Send size={13} style={{ verticalAlign: "-2px" }} /> {enviandoRespuesta[obs.id] ? "Enviando..." : "Enviar respuesta"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {esStaff && (
        <div className="card" style={{ padding: 14, marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {esGerente && (
            <button className={verTodasLasRutas ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => setVerTodasLasRutas((v) => !v)}>
              {verTodasLasRutas ? "Viendo: todas las rutas" : "Ver todas las rutas"}
            </button>
          )}
          {!(esGerente && verTodasLasRutas) && (
            <select value={rutaSeleccionada} onChange={(e) => setRutaSeleccionada(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
              {listaRutas.map((r) => (
                <option key={r} value={r}>{r}{nombres?.[r] ? ` — ${nombres[r]}` : ""}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="display" style={{ fontSize: 13, color: "#9AA7BD", marginBottom: 10 }}>
          REGISTRAR CLIENTE {esStaff && !(esGerente && verTodasLasRutas) ? `· ${rutaSeleccionada}` : rutaActual ? `· ${rutaActual}` : ""}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            value={codigoNuevo}
            onChange={(e) => setCodigoNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") agregarCliente(); }}
            placeholder="Código del cliente (tal como sale en el reporte)"
            style={{ flex: "1 1 200px", minWidth: 180, boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "10px 12px" }}
          />
          <input
            type="text"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") agregarCliente(); }}
            placeholder="Nombre del cliente (opcional, solo de referencia)"
            style={{ flex: "1 1 200px", minWidth: 180, boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "10px 12px" }}
          />
          <button
            className={prioridadNueva ? "btn" : "btn-ghost"}
            style={{ fontSize: 12, whiteSpace: "nowrap" }}
            onClick={() => setPrioridadNueva((p) => !p)}
          >
            <Star size={13} style={{ verticalAlign: "-2px" }} /> {prioridadNueva ? "Prioritario" : "Normal (toca para prioritario)"}
          </button>
          <select
            value={formaPagoNueva}
            onChange={(e) => setFormaPagoNueva(e.target.value)}
            style={{ fontSize: 12, fontWeight: 700, color: COLOR_FORMA_PAGO[formaPagoNueva], padding: "9px 10px" }}
          >
            <option value="EFECTIVO">EFECTIVO</option>
            <option value="CREDITO">CRÉDITO</option>
            <option value="TRANSFERENCIA">TRANSFERENCIA</option>
          </select>
          <button className="btn" disabled={guardando} onClick={agregarCliente}>
            <Plus size={14} style={{ verticalAlign: "-2px" }} /> {guardando ? "Guardando..." : "Agregar"}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "#5b6478", marginTop: 8, marginBottom: 0 }}>
          El cruce con las ventas se hace por el código (no importa si le faltan/sobran ceros a la izquierda). El nombre es solo para identificarlo más fácil en la lista. La forma de pago se puede corregir después si cambia.
        </p>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 20, border: "1px solid #5AA9E6" }}>
        <div className="display" style={{ fontSize: 13, color: "#5AA9E6", marginBottom: 6 }}>
          FACTURA POR ÚNICA OCASIÓN
        </div>
        <p style={{ fontSize: 12, color: "#9AA7BD", marginTop: 0, marginBottom: 12 }}>
          Para un cliente que normalmente NO pide factura, pero hoy sí. No se da de alta en el catálogo — solo se manda a facturar la compra de la próxima vez que se suba el avance del día, y ya no vuelve a aplicar después.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            value={codigoUnico}
            onChange={(e) => setCodigoUnico(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") solicitarFacturaUnica(); }}
            placeholder="Código del cliente"
            style={{ flex: "1 1 200px", minWidth: 160, boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "10px 12px" }}
          />
          <select
            value={formaPagoUnica}
            onChange={(e) => setFormaPagoUnica(e.target.value)}
            style={{ fontSize: 12, fontWeight: 700, color: COLOR_FORMA_PAGO[formaPagoUnica], padding: "9px 10px" }}
          >
            <option value="EFECTIVO">EFECTIVO</option>
            <option value="CREDITO">CRÉDITO</option>
            <option value="TRANSFERENCIA">TRANSFERENCIA</option>
          </select>
          <button
            className={prioridadUnica ? "btn" : "btn-ghost"}
            style={{ fontSize: 12, whiteSpace: "nowrap" }}
            onClick={() => setPrioridadUnica((p) => !p)}
          >
            <Star size={13} style={{ verticalAlign: "-2px" }} /> {prioridadUnica ? "Prioritario" : "Normal"}
          </button>
          <button className="btn" style={{ background: "#5AA9E6", borderColor: "#5AA9E6" }} disabled={guardandoUnica} onClick={solicitarFacturaUnica}>
            <Plus size={14} style={{ verticalAlign: "-2px" }} /> {guardandoUnica ? "Guardando..." : "Solicitar"}
          </button>
        </div>

        {!cargandoUnicas && solicitudesUnicas.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, color: "#9AA7BD" }}>PENDIENTES (esperando que se suba el avance del día)</div>
            {solicitudesUnicas.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#131C30", border: "1px solid #1E2A42", borderRadius: 8, padding: "8px 12px" }}>
                <span className="mono" style={{ color: "#F2B134", fontSize: 12, flex: 1 }}>{s.codigo_cliente}</span>
                {esGerente && verTodasLasRutas && <span style={{ fontSize: 11, color: "#9AA7BD" }}>{s.ruta}</span>}
                <span style={{ fontSize: 11, fontWeight: 700, color: COLOR_FORMA_PAGO[s.forma_pago] }}>{s.forma_pago}</span>
                {s.prioridad && <Star size={12} color="#F2B134" />}
                <button className="btn-ghost" style={{ padding: "3px 6px" }} onClick={() => cancelarSolicitudUnica(s)}>
                  <Trash2 size={12} color="#FF6B6B" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 20, border: "1px solid #F2B134" }}>
        <div className="display" style={{ fontSize: 13, color: "#F2B134", marginBottom: 6 }}>
          FACTURAR OTC
        </div>
        <p style={{ fontSize: 12, color: "#9AA7BD", marginTop: 0, marginBottom: 12 }}>
          Para ventas de OTC (no vienen con código de cliente en el reporte de avance del día, así que se captura el monto a mano). Esta venta NO lleva costo de distribución, solo se le descuenta el IVA.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            value={codigoOtc}
            onChange={(e) => setCodigoOtc(e.target.value)}
            placeholder="Código del cliente"
            style={{ flex: "1 1 160px", minWidth: 140, boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "10px 12px" }}
          />
          <input
            type="number"
            value={montoOtc}
            onChange={(e) => setMontoOtc(e.target.value)}
            placeholder="Monto de la venta"
            style={{ flex: "1 1 140px", minWidth: 120, boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "10px 12px" }}
          />
          <select
            value={formaPagoOtc}
            onChange={(e) => setFormaPagoOtc(e.target.value)}
            style={{ fontSize: 12, fontWeight: 700, color: COLOR_FORMA_PAGO[formaPagoOtc], padding: "9px 10px" }}
          >
            <option value="EFECTIVO">EFECTIVO</option>
            <option value="CREDITO">CRÉDITO</option>
            <option value="TRANSFERENCIA">TRANSFERENCIA</option>
          </select>
          <button
            className={prioridadOtc ? "btn" : "btn-ghost"}
            style={{ fontSize: 12, whiteSpace: "nowrap" }}
            onClick={() => setPrioridadOtc((p) => !p)}
          >
            <Star size={13} style={{ verticalAlign: "-2px" }} /> {prioridadOtc ? "Prioritario" : "Normal"}
          </button>
          <button className="btn" disabled={guardandoOtc} onClick={facturarOtc}>
            <Plus size={14} style={{ verticalAlign: "-2px" }} /> {guardandoOtc ? "Guardando..." : "Facturar OTC"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#3a1414", border: "1px solid #FF6B6B", color: "#FF6B6B", fontSize: 12, borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {cargando ? (
        <div style={{ color: "#9AA7BD", fontSize: 13, textAlign: "center", padding: 24 }}>Cargando clientes...</div>
      ) : clientes.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: "center", color: "#9AA7BD" }}>Todavía no hay clientes registrados.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {clientes.map((c) => {
            const excluidoHoy = exclusionesHoy.has(c.id);
            const editando = editandoClienteId === c.id;

            if (editando) {
              return (
                <div key={c.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", border: "1px solid #F2B134" }}>
                  <input
                    type="text"
                    value={formEdicion.codigo}
                    onChange={(e) => setFormEdicion((f) => ({ ...f, codigo: e.target.value }))}
                    placeholder="Código"
                    style={{ flex: "1 1 140px", minWidth: 120, boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "8px 10px" }}
                  />
                  <input
                    type="text"
                    value={formEdicion.nombre}
                    onChange={(e) => setFormEdicion((f) => ({ ...f, nombre: e.target.value }))}
                    placeholder="Nombre (opcional)"
                    style={{ flex: "1 1 180px", minWidth: 140, boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "8px 10px" }}
                  />
                  <button className="btn" disabled={guardandoEdicion} onClick={() => guardarEdicionCliente(c)}>
                    {guardandoEdicion ? "Guardando..." : "Guardar"}
                  </button>
                  <button className="btn-ghost" onClick={cancelarEdicionCliente}>Cancelar</button>
                </div>
              );
            }

            return (
              <div key={c.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#E8EDF5", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span className="mono" style={{ color: "#F2B134" }}>{c.codigo_cliente}</span>
                    {c.cliente ? ` · ${c.cliente}` : ""}
                  </div>
                  {esGerente ? (
                    <select
                      value={c.ruta}
                      onChange={(e) => cambiarRuta(c, e.target.value)}
                      style={{ fontSize: 11, color: "#9AA7BD", padding: "3px 6px", marginTop: 2 }}
                      title="Toca para corregir a qué ruta pertenece este cliente"
                    >
                      {listaRutas.map((r) => (
                        <option key={r} value={r}>{r}{nombres?.[r] ? ` · ${nombres[r]}` : ""}</option>
                      ))}
                    </select>
                  ) : null}
                </div>

                <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => iniciarEdicionCliente(c)}>
                  Editar
                </button>

                <button
                  className={c.prioridad ? "btn" : "btn-ghost"}
                  style={{ fontSize: 11, background: c.prioridad ? "#F2B134" : undefined }}
                  onClick={() => cambiarPrioridad(c, !c.prioridad)}
                  title="Toca para cambiar entre prioritario / normal"
                >
                  <Star size={12} style={{ verticalAlign: "-2px" }} /> {c.prioridad ? "PRIORITARIO" : "Normal"}
                </button>

                <select
                  value={c.forma_pago_default || "EFECTIVO"}
                  onChange={(e) => cambiarFormaPagoDefault(c, e.target.value)}
                  style={{ fontSize: 11, fontWeight: 700, color: COLOR_FORMA_PAGO[c.forma_pago_default] || "#E8EDF5", padding: "6px 8px" }}
                >
                  <option value="EFECTIVO">EFECTIVO</option>
                  <option value="CREDITO">CRÉDITO</option>
                  <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                </select>

                <button
                  className="btn-ghost"
                  style={{ fontSize: 11, borderColor: excluidoHoy ? "#F2B134" : undefined, color: excluidoHoy ? "#F2B134" : undefined }}
                  onClick={() => toggleNoFacturaHoy(c)}
                  title="Si hoy este cliente no pidió factura, márcalo aquí"
                >
                  <Ban size={12} style={{ verticalAlign: "-2px" }} /> {excluidoHoy ? "No factura HOY ✓" : "Marcar: no factura hoy"}
                </button>

                {esGerente && (
                  <button className="btn-ghost" onClick={() => eliminarCliente(c)}>
                    <Trash2 size={13} color="#FF6B6B" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {esGerente && (
        <div className="card" style={{ padding: 16, border: "1px solid #2A3852" }}>
          <div className="display" style={{ fontSize: 13, color: "#9AA7BD", marginBottom: 10 }}>
            MANTENIMIENTO · BORRAR HISTÓRICO DE VENTAS YA FACTURADAS
          </div>
          <p style={{ fontSize: 12, color: "#9AA7BD", marginTop: 0, marginBottom: 12 }}>
            Esto borra únicamente el histórico de ventas ya enviadas a facturación (lo que ve ADMIN) dentro del rango que elijas.
            El catálogo de clientes registrados NO se toca.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={{ fontSize: 11, color: "#9AA7BD" }}>Desde</label><br />
              <input type="date" value={fechaDesdeBorrar} onChange={(e) => setFechaDesdeBorrar(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#9AA7BD" }}>Hasta</label><br />
              <input type="date" value={fechaHastaBorrar} onChange={(e) => setFechaHastaBorrar(e.target.value)} />
            </div>
            <button className="btn-ghost" style={{ borderColor: "#FF6B6B", color: "#FF6B6B" }} disabled={borrandoRango} onClick={borrarVentasPorRango}>
              <Trash2 size={13} style={{ verticalAlign: "-2px" }} /> {borrandoRango ? "Borrando..." : "Borrar rango"}
            </button>
          </div>
          {mensajeBorrado && (
            <div style={{ marginTop: 10, fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: mensajeBorrado.startsWith("Error") ? "#FF6B6B" : "#3DDC97" }}>
              {mensajeBorrado.startsWith("Error") ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />} {mensajeBorrado}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
