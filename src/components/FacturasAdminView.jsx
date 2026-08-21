// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from "react";
import { LogOut, RefreshCw, Star, CheckCircle2, AlertCircle, Copy, Check, MessageSquare, Download, Plus, Trash2, Ban, History } from "lucide-react";
import { supabase } from "../supabaseClient";
import { normalizarCodigo } from "../utils";
import { RUTAS, NOMBRES } from "../constants";
import RelojChecadorView from "./RelojChecadorView";

function hoyISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

const LLAVE_ULTIMA_VISTA = "facturas_admin_ultima_vista";
const LLAVE_ULTIMA_VISTA_MENSAJES = "facturas_admin_ultima_vista_mensajes";

// Costo de distribución por cajetilla y tasa de IVA — ajusta aquí si cambian.
const COSTO_DISTRIBUCION_UNITARIO = 2.78;
const IVA_TASA = 0.16;

function money(n) {
  return (n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}
function num(n, dec = 2) {
  return Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

const COLOR_FORMA_PAGO = {
  EFECTIVO: "#3DDC97",
  CREDITO: "#F2B134",
  TRANSFERENCIA: "#5AA9E6",
};

const COLOR_ESTADO = {
  ESPERA: "#9AA7BD",
  FACTURADO: "#3DDC97",
  OBSERVACION: "#FF8C00",
};

const COLOR_FILTRO = {
  PENDIENTE: "#9AA7BD",
  FACTURADO: "#3DDC97",
};

function calcularDesglose(montoTotal, totalCajetillas) {
  const distribucionBruta = totalCajetillas * COSTO_DISTRIBUCION_UNITARIO;
  const ivaDistribucion = distribucionBruta * IVA_TASA;
  const distribucionNeta = distribucionBruta - ivaDistribucion;

  const subtotalProducto = Math.max(montoTotal - distribucionBruta, 0);
  const ivaProducto = subtotalProducto * IVA_TASA;
  const precioProductoNeto = subtotalProducto - ivaProducto;

  return { distribucionBruta, ivaDistribucion, distribucionNeta, subtotalProducto, ivaProducto, precioProductoNeto };
}

function calcularDesgloseLinea(montoLinea, cajetillasLinea) {
  const precioSinIva = montoLinea / (1 + IVA_TASA);
  return precioSinIva;
}

function costoUnitarioNeto(montoLinea, cajetillasLinea) {
  if (!cajetillasLinea) return 0;
  return calcularDesgloseLinea(montoLinea, cajetillasLinea) / cajetillasLinea;
}

const LIMITE_TICKET_EFECTIVO = 2000;

function BotonCopiar({ texto, etiqueta }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar(e) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch (err) {
      console.error("No se pudo copiar:", err);
    }
  }
  return (
    <button
      onClick={copiar}
      title={etiqueta || "Copiar"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, background: "transparent",
        border: "1px solid #2A3852", borderRadius: 6, padding: "3px 7px", cursor: "pointer",
        color: copiado ? "#3DDC97" : "#9AA7BD", fontSize: 11,
      }}
    >
      {copiado ? <Check size={12} /> : <Copy size={12} />} {copiado ? "Copiado" : (etiqueta || "Copiar")}
    </button>
  );
}

// Para clientes de CRÉDITO — busca y muestra la última compra anterior de
// ese cliente (misma ruta + código), la fecha más reciente ANTES de la
// venta que se está viendo ahora mismo. Trae los DOS tipos por separado
// (Productos y OTC) porque son registros distintos en ventas_facturas
// (articulo = "OTC" vs artículo real) y un cliente puede tener historial
// de uno, del otro, o de ambos — se muestran como pestañas complementarias
// dentro del mismo panel. Se busca bajo demanda (no en automático) porque
// la fecha puede variar de un cliente a otro y no vale la pena consultarla
// si nadie la necesita.
function UltimaCompraCredito({ ruta, codigoCliente, fechaActual, esOtcActual }) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [subTab, setSubTab] = useState(esOtcActual ? "OTC" : "PROD");
  const [resultados, setResultados] = useState({ PROD: null, OTC: null }); // cada uno: null | "sin_datos" | {fecha, formaPago, productos, totalCajetillas, totalMonto}
  const [errorBusqueda, setErrorBusqueda] = useState(null);

  async function buscarUnTipo(tipoOtc) {
    let qFecha = supabase
      .from("ventas_facturas")
      .select("fecha")
      .eq("ruta", ruta)
      .eq("codigo_cliente", codigoCliente)
      .lt("fecha", fechaActual);
    qFecha = tipoOtc ? qFecha.eq("articulo", "OTC") : qFecha.neq("articulo", "OTC");
    const { data: fechas, error: errF } = await qFecha.order("fecha", { ascending: false }).limit(1);
    if (errF) throw errF;
    if (!fechas || fechas.length === 0) return "sin_datos";

    const fechaAnterior = fechas[0].fecha;
    let qFilas = supabase
      .from("ventas_facturas")
      .select("articulo, producto_nombre, cajetillas, monto, forma_pago")
      .eq("ruta", ruta)
      .eq("codigo_cliente", codigoCliente)
      .eq("fecha", fechaAnterior);
    qFilas = tipoOtc ? qFilas.eq("articulo", "OTC") : qFilas.neq("articulo", "OTC");
    const { data: filasAnteriores, error: errFilas } = await qFilas;
    if (errFilas) throw errFilas;

    const totalCajetillas = (filasAnteriores || []).reduce((s, f) => s + (Number(f.cajetillas) || 0), 0);
    const totalMonto = (filasAnteriores || []).reduce((s, f) => s + (Number(f.monto) || 0), 0);
    return {
      fecha: fechaAnterior,
      formaPago: filasAnteriores?.[0]?.forma_pago || "EFECTIVO",
      productos: filasAnteriores || [],
      totalCajetillas,
      totalMonto,
    };
  }

  async function buscar() {
    if (buscado) { setAbierto((v) => !v); return; }
    setCargando(true);
    setErrorBusqueda(null);
    try {
      const [prod, otc] = await Promise.all([buscarUnTipo(false), buscarUnTipo(true)]);
      setResultados({ PROD: prod, OTC: otc });
      setBuscado(true);
      setAbierto(true);
    } catch (err) {
      console.error("Error buscando última compra anterior:", err);
      setErrorBusqueda("No se pudo buscar la compra anterior.");
    } finally {
      setCargando(false);
    }
  }

  const resultadoActual = resultados[subTab];

  return (
    <div style={{ marginBottom: 12 }} onClick={(e) => e.stopPropagation()}>
      <button className="btn-ghost" style={{ fontSize: 11 }} disabled={cargando} onClick={buscar}>
        <History size={12} style={{ verticalAlign: "-2px" }} /> {cargando ? "Buscando..." : abierto ? "Ocultar última compra anterior" : "Ver última compra anterior"}
      </button>
      {errorBusqueda && <div style={{ fontSize: 11, color: "#FF6B6B", marginTop: 6 }}>{errorBusqueda}</div>}

      {abierto && buscado && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button className={subTab === "PROD" ? "btn" : "btn-ghost"} style={{ fontSize: 10.5, padding: "4px 10px" }} onClick={() => setSubTab("PROD")}>
              Productos
            </button>
            <button className={subTab === "OTC" ? "btn" : "btn-ghost"} style={{ fontSize: 10.5, padding: "4px 10px" }} onClick={() => setSubTab("OTC")}>
              OTC
            </button>
          </div>

          {resultadoActual === "sin_datos" && (
            <div style={{ fontSize: 11.5, color: "#9AA7BD" }}>
              Este cliente no tiene compras {subTab === "OTC" ? "OTC" : "de producto"} anteriores registradas.
            </div>
          )}

          {resultadoActual && resultadoActual !== "sin_datos" && (
            <div className="card" style={{ padding: 12, border: "1px solid #2A3852" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                <div style={{ fontSize: 11.5, color: "#9AA7BD" }}>Última compra {subTab === "OTC" ? "OTC" : "de producto"} anterior · {resultadoActual.fecha}</div>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: COLOR_FORMA_PAGO[resultadoActual.formaPago] || "#E8EDF5" }}>{resultadoActual.formaPago}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                {resultadoActual.productos.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#C6CFE0", gap: 8 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.articulo === "OTC" ? "Venta OTC" : `${p.articulo} — ${p.producto_nombre || p.articulo}`}</span>
                    <span style={{ whiteSpace: "nowrap" }}>{p.articulo !== "OTC" ? `${num(p.cajetillas)} caj. · ` : ""}{money(p.monto)}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, borderTop: "1px solid #1E2A42", paddingTop: 6 }}>
                <span style={{ color: "#9AA7BD" }}>{resultadoActual.totalCajetillas > 0 ? `${num(resultadoActual.totalCajetillas)} caj. total` : ""}</span>
                <span style={{ color: "#F2B134" }}>{money(resultadoActual.totalMonto)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClientesAdminPanel({ listaRutas, nombresRutas }) {
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [exclusionesHoy, setExclusionesHoy] = useState(new Set());
  const [busqueda, setBusqueda] = useState("");

  const [codigoNuevo, setCodigoNuevo] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [rutaNueva, setRutaNueva] = useState(listaRutas[0] || "");
  const [prioridadNueva, setPrioridadNueva] = useState(false);
  const [formaPagoNueva, setFormaPagoNueva] = useState("EFECTIVO");
  const [guardando, setGuardando] = useState(false);

  const [editandoClienteId, setEditandoClienteId] = useState(null);
  const [formEdicion, setFormEdicion] = useState({ codigo: "", nombre: "" });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const [directorioClientes, setDirectorioClientes] = useState(new Map());

  useEffect(() => {
    (async () => {
      const TAMANO_PAGINA = 1000;
      let desde = 0;
      let todas = [];
      while (true) {
        const { data, error: err } = await supabase
          .from("clientes_ruta")
          .select("codigo_cliente, nombre, ruta")
          .eq("activo", true)
          .range(desde, desde + TAMANO_PAGINA - 1);
        if (err) { console.error("Error cargando clientes_ruta:", err); break; }
        todas = todas.concat(data || []);
        if (!data || data.length < TAMANO_PAGINA) break;
        desde += TAMANO_PAGINA;
      }
      const mapa = new Map();
      todas.forEach((c) => {
        const norm = normalizarCodigo(c.codigo_cliente);
        if (!mapa.has(norm)) mapa.set(norm, { nombre: c.nombre, ruta: c.ruta });
      });
      setDirectorioClientes(mapa);
    })();
  }, []);

  function buscarEnDirectorio(codigo) {
    if (!codigo || !codigo.trim()) return null;
    return directorioClientes.get(normalizarCodigo(codigo)) || null;
  }
  const coincidenciaNuevo = buscarEnDirectorio(codigoNuevo);

  useEffect(() => {
    const match = buscarEnDirectorio(codigoNuevo);
    if (!match) return;
    setNombreNuevo(match.nombre || "");
    if (match.ruta) setRutaNueva(match.ruta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoNuevo, directorioClientes]);

  async function cargarClientes() {
    setCargando(true);
    try {
      const { data, error: err } = await supabase
        .from("clientes_facturables")
        .select("id, ruta, codigo_cliente, cliente, prioridad, forma_pago_default")
        .order("creado_en", { ascending: false });
      if (err) throw err;
      setClientes(data || []);
      const hoy = hoyISO();
      const ids = (data || []).map((c) => c.id);
      if (ids.length > 0) {
        const { data: exclusiones } = await supabase
          .from("facturas_exclusiones_dia")
          .select("cliente_id")
          .eq("fecha", hoy)
          .in("cliente_id", ids);
        setExclusionesHoy(new Set((exclusiones || []).map((e) => e.cliente_id)));
      } else {
        setExclusionesHoy(new Set());
      }
    } catch (err) {
      console.error("Error cargando clientes_facturables:", err);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargarClientes(); }, []);

  async function agregarCliente() {
    const codigo = codigoNuevo.trim();
    if (!codigo) { alert("Escribe el código del cliente."); return; }
    if (!rutaNueva) { alert("Elige la ruta."); return; }
    setGuardando(true);
    try {
      const { error: err } = await supabase.from("clientes_facturables").insert({
        ruta: rutaNueva,
        codigo_cliente: codigo,
        cliente: nombreNuevo.trim() || null,
        prioridad: prioridadNueva,
        forma_pago_default: formaPagoNueva,
      });
      if (err) {
        if (err.code === "23505") alert("Ese código ya está registrado en el catálogo.");
        else throw err;
        return;
      }
      setCodigoNuevo(""); setNombreNuevo(""); setPrioridadNueva(false); setFormaPagoNueva("EFECTIVO");
      await cargarClientes();
    } catch (err) {
      alert("No se pudo guardar: " + (err?.message || "intenta de nuevo"));
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarPrioridad(cliente, nuevaPrioridad) {
    setClientes((cs) => cs.map((c) => (c.id === cliente.id ? { ...c, prioridad: nuevaPrioridad } : c)));
    await supabase.from("clientes_facturables").update({ prioridad: nuevaPrioridad }).eq("id", cliente.id);
  }

  async function cambiarFormaPagoDefault(cliente, nuevaForma) {
    setClientes((cs) => cs.map((c) => (c.id === cliente.id ? { ...c, forma_pago_default: nuevaForma } : c)));
    await supabase.from("clientes_facturables").update({ forma_pago_default: nuevaForma }).eq("id", cliente.id);
  }

  async function cambiarRuta(cliente, nuevaRuta) {
    setClientes((cs) => cs.map((c) => (c.id === cliente.id ? { ...c, ruta: nuevaRuta } : c)));
    await supabase.from("clientes_facturables").update({ ruta: nuevaRuta }).eq("id", cliente.id);
  }

  async function toggleNoFacturaHoy(cliente) {
    const hoy = hoyISO();
    const yaExcluido = exclusionesHoy.has(cliente.id);
    if (yaExcluido) {
      await supabase.from("facturas_exclusiones_dia").delete().eq("cliente_id", cliente.id).eq("fecha", hoy);
      setExclusionesHoy((s) => { const n = new Set(s); n.delete(cliente.id); return n; });
    } else {
      const { error: err } = await supabase.from("facturas_exclusiones_dia").insert({ cliente_id: cliente.id, fecha: hoy });
      if (err && err.code !== "23505") { alert("No se pudo guardar: " + err.message); return; }
      setExclusionesHoy((s) => new Set(s).add(cliente.id));
      const { error: errBorrar } = await supabase
        .from("ventas_facturas").delete().eq("cliente_id", cliente.id).eq("fecha", hoy).neq("estado", "FACTURADO");
      if (errBorrar) alert("Se marcó la exclusión, pero no se pudo borrar la venta de hoy que ya estaba guardada: " + errBorrar.message);
    }
  }

  async function eliminarCliente(cliente) {
    const ok = window.confirm(`¿Borrar a "${cliente.codigo_cliente}${cliente.cliente ? " — " + cliente.cliente : ""}"? Esto no borra sus ventas ya registradas.`);
    if (!ok) return;
    const { error: err } = await supabase.from("clientes_facturables").delete().eq("id", cliente.id);
    if (err) { alert("No se pudo borrar: " + err.message); return; }
    setClientes((cs) => cs.filter((c) => c.id !== cliente.id));
  }

  function iniciarEdicionCliente(cliente) {
    setEditandoClienteId(cliente.id);
    setFormEdicion({ codigo: cliente.codigo_cliente, nombre: cliente.cliente || "" });
  }

  async function guardarEdicionCliente(cliente) {
    const codigo = formEdicion.codigo.trim();
    if (!codigo) { alert("El código no puede quedar vacío."); return; }
    setGuardandoEdicion(true);
    try {
      const { error: err } = await supabase
        .from("clientes_facturables")
        .update({ codigo_cliente: codigo, cliente: formEdicion.nombre.trim() || null, actualizado_en: new Date().toISOString() })
        .eq("id", cliente.id);
      if (err) {
        if (err.code === "23505") alert("Ese código ya está registrado en otro cliente.");
        else throw err;
        return;
      }
      await supabase.from("ventas_facturas").update({ codigo_cliente: codigo, cliente: formEdicion.nombre.trim() || null }).eq("cliente_id", cliente.id);
      setEditandoClienteId(null);
      await cargarClientes();
    } catch (err) {
      alert("No se pudo guardar: " + (err?.message || "intenta de nuevo"));
    } finally {
      setGuardandoEdicion(false);
    }
  }

  const q = busqueda.trim().toLowerCase();
  const clientesFiltrados = clientes.filter((c) => !q || (c.codigo_cliente || "").toLowerCase().includes(q) || (c.cliente || "").toLowerCase().includes(q));

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="display" style={{ fontSize: 13, color: "#9AA7BD", marginBottom: 10 }}>REGISTRAR CLIENTE</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text" value={codigoNuevo} onChange={(e) => setCodigoNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") agregarCliente(); }}
            placeholder="Código del cliente"
            style={{ flex: "1 1 180px", minWidth: 160, boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "10px 12px" }}
          />
          <input
            type="text" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") agregarCliente(); }}
            placeholder="Nombre (se llena solo si el código está en clientes_ruta)"
            style={{ flex: "1 1 200px", minWidth: 180, boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "10px 12px" }}
          />
          <select value={rutaNueva} onChange={(e) => setRutaNueva(e.target.value)} style={{ fontSize: 12, padding: "9px 10px" }}>
            {listaRutas.map((r) => <option key={r} value={r}>{r}{nombresRutas?.[r] ? ` · ${nombresRutas[r]}` : ""}</option>)}
          </select>
          <button className={prioridadNueva ? "btn" : "btn-ghost"} style={{ fontSize: 12, whiteSpace: "nowrap" }} onClick={() => setPrioridadNueva((p) => !p)}>
            <Star size={13} style={{ verticalAlign: "-2px" }} /> {prioridadNueva ? "Prioritario" : "Normal"}
          </button>
          <select value={formaPagoNueva} onChange={(e) => setFormaPagoNueva(e.target.value)} style={{ fontSize: 12, fontWeight: 700, color: COLOR_FORMA_PAGO[formaPagoNueva], padding: "9px 10px" }}>
            <option value="EFECTIVO">EFECTIVO</option>
            <option value="CREDITO">CRÉDITO</option>
            <option value="TRANSFERENCIA">TRANSFERENCIA</option>
          </select>
          <button className="btn" disabled={guardando} onClick={agregarCliente}>
            <Plus size={14} style={{ verticalAlign: "-2px" }} /> {guardando ? "Guardando..." : "Agregar"}
          </button>
        </div>
        {codigoNuevo.trim() && (
          coincidenciaNuevo
            ? <p style={{ fontSize: 11, color: "#3DDC97", marginTop: 8, marginBottom: 0 }}>✓ Encontrado en clientes_ruta: {coincidenciaNuevo.nombre} — {coincidenciaNuevo.ruta}</p>
            : <p style={{ fontSize: 11, color: "#9AA7BD", marginTop: 8, marginBottom: 0 }}>No se encontró ese código en clientes_ruta — puedes escribir el nombre y elegir la ruta a mano.</p>
        )}
      </div>

      {!cargando && clientes.length > 0 && (
        <input
          type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por código o nombre..."
          style={{ width: "100%", boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "10px 12px", marginBottom: 12 }}
        />
      )}

      {cargando ? (
        <div style={{ color: "#9AA7BD", fontSize: 13, textAlign: "center", padding: 24 }}>Cargando clientes...</div>
      ) : clientes.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: "center", color: "#9AA7BD" }}>Todavía no hay clientes registrados.</div>
      ) : clientesFiltrados.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: "center", color: "#9AA7BD" }}>Ningún cliente coincide con "{busqueda}".</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {clientesFiltrados.map((c) => {
            const excluidoHoy = exclusionesHoy.has(c.id);
            const editando = editandoClienteId === c.id;

            if (editando) {
              return (
                <div key={c.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", border: "1px solid #F2B134" }}>
                  <input type="text" value={formEdicion.codigo} onChange={(e) => setFormEdicion((f) => ({ ...f, codigo: e.target.value }))}
                    style={{ flex: "1 1 140px", minWidth: 120, boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "8px 10px" }} />
                  <input type="text" value={formEdicion.nombre} onChange={(e) => setFormEdicion((f) => ({ ...f, nombre: e.target.value }))}
                    style={{ flex: "1 1 180px", minWidth: 140, boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "8px 10px" }} />
                  <button className="btn" disabled={guardandoEdicion} onClick={() => guardarEdicionCliente(c)}>{guardandoEdicion ? "Guardando..." : "Guardar"}</button>
                  <button className="btn-ghost" onClick={() => setEditandoClienteId(null)}>Cancelar</button>
                </div>
              );
            }

            return (
              <div key={c.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#E8EDF5", fontWeight: 600 }}>
                    <span className="mono" style={{ color: "#F2B134" }}>{c.codigo_cliente}</span>{c.cliente ? ` · ${c.cliente}` : ""}
                  </div>
                  <select value={c.ruta} onChange={(e) => cambiarRuta(c, e.target.value)} style={{ fontSize: 11, color: "#9AA7BD", padding: "3px 6px", marginTop: 2 }}>
                    {listaRutas.map((r) => <option key={r} value={r}>{r}{nombresRutas?.[r] ? ` · ${nombresRutas[r]}` : ""}</option>)}
                  </select>
                </div>
                <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => iniciarEdicionCliente(c)}>Editar</button>
                <button className={c.prioridad ? "btn" : "btn-ghost"} style={{ fontSize: 11, background: c.prioridad ? "#F2B134" : undefined }} onClick={() => cambiarPrioridad(c, !c.prioridad)}>
                  <Star size={12} style={{ verticalAlign: "-2px" }} /> {c.prioridad ? "PRIORITARIO" : "Normal"}
                </button>
                <select value={c.forma_pago_default || "EFECTIVO"} onChange={(e) => cambiarFormaPagoDefault(c, e.target.value)} style={{ fontSize: 11, fontWeight: 700, color: COLOR_FORMA_PAGO[c.forma_pago_default], padding: "6px 8px" }}>
                  <option value="EFECTIVO">EFECTIVO</option>
                  <option value="CREDITO">CRÉDITO</option>
                  <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                </select>
                <button className="btn-ghost" style={{ fontSize: 11, borderColor: excluidoHoy ? "#F2B134" : undefined, color: excluidoHoy ? "#F2B134" : undefined }} onClick={() => toggleNoFacturaHoy(c)}>
                  <Ban size={12} style={{ verticalAlign: "-2px" }} /> {excluidoHoy ? "No factura HOY ✓" : "Marcar: no factura hoy"}
                </button>
                <button className="btn-ghost" onClick={() => eliminarCliente(c)}><Trash2 size={13} color="#FF6B6B" /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MensajesPanel({ mensajes, cargando, nuevosIds, onMarcarVistos }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 12, color: "#9AA7BD" }}>Últimas 100 observaciones (todas las rutas)</div>
        {nuevosIds.size > 0 && (
          <button className="btn" style={{ background: "#FF8C00", borderColor: "#FF8C00" }} onClick={onMarcarVistos}>
            Marcar todo como visto
          </button>
        )}
      </div>

      {cargando ? (
        <div style={{ color: "#9AA7BD", fontSize: 13, textAlign: "center", padding: 30 }}>Cargando...</div>
      ) : mensajes.length === 0 ? (
        <div className="card" style={{ padding: 30, textAlign: "center", color: "#9AA7BD" }}>
          Todavía no has mandado ninguna observación.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mensajes.map((m) => {
            const esNuevo = nuevosIds.has(m.id);
            const estadoTexto = m.resuelta ? "RESUELTA" : m.respondido_en ? "RESPONDIDA · POR REVISAR" : "SIN RESPUESTA";
            const estadoColor = m.resuelta ? "#3DDC97" : m.respondido_en ? "#5AA9E6" : "#FF8C00";
            return (
              <div
                key={m.id}
                className="card"
                style={{ padding: 16, border: esNuevo ? "2px solid #FF8C00" : undefined }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      <span className="mono" style={{ color: "#F2B134" }}>{m.codigo_cliente}</span>
                      {m.es_otc && (
                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: "#0B1220", background: "#F2B134", borderRadius: 6, padding: "2px 8px" }}>OTC</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 2 }}>{m.ruta} · {m.fecha}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 6, color: estadoColor, border: `1px solid ${estadoColor}` }}>
                    {estadoTexto}
                  </span>
                </div>

                <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 12 }}>Tu mensaje:</div>
                <div style={{ fontSize: 13, color: "#E8EDF5", whiteSpace: "pre-wrap" }}>{m.mensaje}</div>

                {m.respondido_en ? (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1E2A42" }}>
                    <div style={{ fontSize: 11, color: "#5AA9E6", marginBottom: 4 }}>Respuesta de la ruta:</div>
                    {m.respuesta_texto && <div style={{ fontSize: 13, color: "#E8EDF5", whiteSpace: "pre-wrap" }}>{m.respuesta_texto}</div>}
                    {m.respuesta_archivo_url && (
                      <a
                        href={m.respuesta_archivo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost"
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, textDecoration: "none" }}
                      >
                        <Download size={13} /> {m.respuesta_archivo_nombre || "Ver archivo adjunto"}
                      </a>
                    )}
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#9AA7BD", fontStyle: "italic" }}>Esperando respuesta de la ruta...</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FacturasAdminView({ onLogout, asignarFoliosTickets }) {
  const [vistaPrincipal, setVistaPrincipal] = useState("facturacion"); // "facturacion" | "checador"
  const [vista, setVista] = useState("clientes"); // "clientes" | "mensajes" | "catalogo" (dentro de FACTURACIÓN)
  const [tab, setTab] = useState("prioritario");
  const [filtroEstado, setFiltroEstado] = useState("PENDIENTE"); // "PENDIENTE" (ESPERA+OBSERVACION) | "FACTURADO"
  const [fechaDesde, setFechaDesde] = useState(hoyISO());
  const [fechaHasta, setFechaHasta] = useState(hoyISO());
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const ultimaVistaRef = useRef(null);

  useEffect(() => {
    try {
      ultimaVistaRef.current = localStorage.getItem(LLAVE_ULTIMA_VISTA);
    } catch (e) { /* ignorar */ }
  }, []);

  const [nuevosPrioritarioClaves, setNuevosPrioritarioClaves] = useState(new Set());
  const [nuevosNormalClaves, setNuevosNormalClaves] = useState(new Set());

  async function revisarNuevasVentasGlobal() {
    const referencia = ultimaVistaRef.current;
    if (!referencia) return;
    try {
      const { data, error: err } = await supabase
        .from("ventas_facturas")
        .select("ruta, codigo_cliente, fecha, articulo, prioridad, creado_en")
        .gt("creado_en", referencia);
      if (err) throw err;
      const prioritarios = new Set();
      const normales = new Set();
      (data || []).forEach((f) => {
        const clave = claveVenta(f);
        if (f.prioridad) prioritarios.add(clave); else normales.add(clave);
      });
      setNuevosPrioritarioClaves(prioritarios);
      setNuevosNormalClaves(normales);
    } catch (err) {
      console.error("Error revisando nuevas ventas:", err);
    }
  }

  const [mensajes, setMensajes] = useState([]);
  const [cargandoMensajes, setCargandoMensajes] = useState(true);
  const [nuevosMensajesIds, setNuevosMensajesIds] = useState(new Set());
  const ultimaVistaMensajesRef = useRef(null);

  useEffect(() => {
    try {
      ultimaVistaMensajesRef.current = localStorage.getItem(LLAVE_ULTIMA_VISTA_MENSAJES);
    } catch (e) { /* ignorar */ }
  }, []);

  async function cargarMensajes() {
    setCargandoMensajes(true);
    try {
      const { data, error: err } = await supabase
        .from("facturas_observaciones")
        .select("id, ruta, codigo_cliente, fecha, es_otc, mensaje, autor, creado_en, respuesta_texto, respuesta_archivo_url, respuesta_archivo_nombre, respondido_en, resuelta, resuelta_en")
        .order("creado_en", { ascending: false })
        .limit(100);
      if (err) throw err;
      setMensajes(data || []);
      const referencia = ultimaVistaMensajesRef.current;
      const nuevos = new Set(
        (data || [])
          .filter((m) => m.respondido_en && (!referencia || new Date(m.respondido_en) > new Date(referencia)))
          .map((m) => m.id)
      );
      setNuevosMensajesIds(nuevos);
    } catch (err) {
      console.error("Error cargando mensajes:", err);
    } finally {
      setCargandoMensajes(false);
    }
  }

  useEffect(() => {
    cargarMensajes();
    // removeChannel() es asíncrono (regresa una promesa) — cerrar el canal
    // viejo y abrir uno nuevo CON EL MISMO NOMBRE en el mismo tick no
    // garantiza que el viejo ya haya terminado de cerrarse, y eso es
    // justo lo que tronaba con "cannot add postgres_changes callbacks...
    // after subscribe()". La forma a prueba de fallos es que cada montaje
    // use un nombre de canal único (nunca puede chocar con uno viejo).
    let canal = null;
    try {
      canal = supabase
        .channel(`facturas_observaciones_admin_mensajes_${Date.now()}_${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "facturas_observaciones" }, () => {
          cargarMensajes();
        })
        .subscribe();
    } catch (err) {
      console.warn("No se pudo activar tiempo real de mensajes:", err);
    }
    return () => { if (canal) supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function marcarMensajesVistos() {
    const ahora = new Date().toISOString();
    ultimaVistaMensajesRef.current = ahora;
    try { localStorage.setItem(LLAVE_ULTIMA_VISTA_MENSAJES, ahora); } catch (e) { /* ignorar */ }
    setNuevosMensajesIds(new Set());
  }

  function claveVenta(f) {
    const tipo = f.articulo === "OTC" ? "OTC" : "PROD";
    return `${f.ruta}|${f.codigo_cliente}|${f.fecha}|${tipo}`;
  }

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      let query = supabase
        .from("ventas_facturas")
        .select("id, ruta, codigo_cliente, cliente, fecha, articulo, producto_nombre, paquetes, cajetillas, contado_monto, credito_monto, monto, forma_pago, estado, prioridad, creado_en, actualizado_en, ticket_folio, ticket_parte, ticket_de")
        .eq("prioridad", tab === "prioritario");
      query = filtroEstado === "FACTURADO"
        ? query.eq("estado", "FACTURADO")
        : query.in("estado", ["ESPERA", "OBSERVACION"]);
      const { data, error: err } = await query
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta)
        .order("creado_en", { ascending: false });
      if (err) throw err;

      const faltanFolios = (data || []).some((f) => f.ticket_folio == null);
      if (faltanFolios && asignarFoliosTickets) {
        await asignarFoliosTickets();
        let query2 = supabase
          .from("ventas_facturas")
          .select("id, ruta, codigo_cliente, cliente, fecha, articulo, producto_nombre, paquetes, cajetillas, contado_monto, credito_monto, monto, forma_pago, estado, prioridad, creado_en, actualizado_en, ticket_folio, ticket_parte, ticket_de")
          .eq("prioridad", tab === "prioritario");
        query2 = filtroEstado === "FACTURADO" ? query2.eq("estado", "FACTURADO") : query2.in("estado", ["ESPERA", "OBSERVACION"]);
        const { data: dataFresca } = await query2.gte("fecha", fechaDesde).lte("fecha", fechaHasta).order("creado_en", { ascending: false });
        setFilas(dataFresca || data || []);
      } else {
        setFilas(data || []);
      }
    } catch (err) {
      console.error("Error cargando ventas_facturas:", err);
      setError(err?.message || "No se pudo cargar la información.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (vista === "clientes") cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, tab, filtroEstado, fechaDesde, fechaHasta]);

  useEffect(() => {
    const intervalo = setInterval(() => {
      if (vista === "clientes") cargar();
      revisarNuevasVentasGlobal();
      cargarMensajes();
    }, 30 * 60 * 1000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, tab, filtroEstado, fechaDesde, fechaHasta]);

  useEffect(() => {
    revisarNuevasVentasGlobal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let temporizador = null;
    let canal = null;
    // Mismo motivo que el canal de mensajes: nombre único por montaje en
    // vez de intentar cerrar y reabrir con el mismo nombre (removeChannel
    // es asíncrono y esa carrera es justo lo que tronaba la pantalla).
    // Este además se recrea con cada cambio de filtro, así que es el más
    // propenso de los dos.
    try {
      canal = supabase
        .channel(`ventas_facturas_admin_${Date.now()}_${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "ventas_facturas" }, () => {
          revisarNuevasVentasGlobal();
          if (temporizador) clearTimeout(temporizador);
          temporizador = setTimeout(() => cargar(), 600);
        })
        .subscribe();
    } catch (err) {
      console.warn("No se pudo activar tiempo real de ventas:", err);
    }
    return () => { if (temporizador) clearTimeout(temporizador); if (canal) supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filtroEstado, fechaDesde, fechaHasta]);

  function marcarTodoVisto() {
    const ahora = new Date().toISOString();
    ultimaVistaRef.current = ahora;
    try { localStorage.setItem(LLAVE_ULTIMA_VISTA, ahora); } catch (e) { /* ignorar */ }
    setNuevosPrioritarioClaves(new Set());
    setNuevosNormalClaves(new Set());
  }

  const [recalculandoClaves, setRecalculandoClaves] = useState(new Set());

  async function cambiarFormaPago(ticket, nuevaFormaPago) {
    if (ticket.estado === "FACTURADO") {
      alert("Esta venta ya está facturada — no se puede cambiar la forma de pago. Si es un error, primero regrésala a ESPERA.");
      return;
    }
    const ids = ticket.productos.map((p) => p.id).filter(Boolean);
    if (ids.length === 0) return;

    // Si pasa de CRÉDITO/TRANSFERENCIA a EFECTIVO y el total (con
    // distribución incluida) supera el límite de $2000, antes no hacía
    // falta dividirlo — ahora sí. Se le quita el folio a esas filas (solo
    // a ESTAS, las demás de otros tickets no se tocan) para que
    // asignarFoliosTickets las vuelva a tomar como "sin folio" y las
    // reparta en partes ≤ $2000, igual que ya hace con ventas que nacen
    // en efectivo desde el principio.
    const formaAnterior = ticket.formaPago || "EFECTIVO";
    const { distribucionBruta } = calcularDesglose(ticket.totalMonto, ticket.totalCajetillas);
    const totalConDistribucion = ticket.totalMonto + distribucionBruta;
    const necesitaRecalcular =
      nuevaFormaPago === "EFECTIVO" &&
      formaAnterior !== "EFECTIVO" &&
      !ticket.ventaOriginal.esOtc &&
      totalConDistribucion > LIMITE_TICKET_EFECTIVO;

    if (necesitaRecalcular) setRecalculandoClaves((s) => new Set(s).add(ticket.claveTicket));

    setFilas((fs) => fs.map((f) => (ids.includes(f.id) ? { ...f, forma_pago: nuevaFormaPago, ...(necesitaRecalcular ? { ticket_folio: null, ticket_parte: null, ticket_de: null } : {}) } : f)));

    const payload = { forma_pago: nuevaFormaPago };
    if (necesitaRecalcular) {
      payload.ticket_folio = null;
      payload.ticket_parte = null;
      payload.ticket_de = null;
    }
    const { error: err } = await supabase
      .from("ventas_facturas")
      .update(payload)
      .in("id", ids);
    if (err) {
      console.error("Error actualizando forma de pago:", err);
      alert("No se pudo actualizar la forma de pago: " + err.message);
      cargar();
      setRecalculandoClaves((s) => { const n = new Set(s); n.delete(ticket.claveTicket); return n; });
      return;
    }

    if (necesitaRecalcular && asignarFoliosTickets) {
      await asignarFoliosTickets();
      setRecalculandoClaves((s) => { const n = new Set(s); n.delete(ticket.claveTicket); return n; });
    }
    cargar();
  }

  async function cambiarEstado(ticket, nuevoEstado) {
    const venta = ticket.ventaOriginal;
    const ids = ticket.productos.map((p) => p.id).filter(Boolean);
    if (ids.length === 0) return;

    if (nuevoEstado === "OBSERVACION") {
      const mensaje = window.prompt("¿Qué le falta o no cuadra en esta venta? Este mensaje se le manda a la ruta.");
      if (!mensaje || !mensaje.trim()) return;
      const prefijo = ticket.parteLabel ? `[Ticket ${ticket.parteLabel}] ` : "";
      const { error: errObs } = await supabase.from("facturas_observaciones").insert({
        ruta: venta.ruta,
        codigo_cliente: venta.codigoCliente,
        fecha: venta.fecha,
        es_otc: venta.esOtc,
        mensaje: prefijo + mensaje.trim(),
        autor: "ADMIN",
      });
      if (errObs) {
        alert("No se pudo enviar la observación: " + errObs.message);
        return;
      }
    }

    setFilas((fs) => fs.map((f) => (ids.includes(f.id) ? { ...f, estado: nuevoEstado } : f)));
    const { error: err } = await supabase
      .from("ventas_facturas")
      .update({ estado: nuevoEstado })
      .in("id", ids);
    if (err) {
      console.error("Error actualizando estado:", err);
      alert("No se pudo actualizar el estado: " + err.message);
      cargar();
      return;
    }

    if (nuevoEstado !== "OBSERVACION") {
      let queryRestantes = supabase
        .from("ventas_facturas")
        .select("id", { count: "exact", head: true })
        .eq("ruta", venta.ruta)
        .eq("codigo_cliente", venta.codigoCliente)
        .eq("fecha", venta.fecha)
        .eq("estado", "OBSERVACION");
      queryRestantes = venta.esOtc ? queryRestantes.eq("articulo", "OTC") : queryRestantes.neq("articulo", "OTC");
      const { count } = await queryRestantes;
      if (!count) {
        await supabase
          .from("facturas_observaciones")
          .update({ resuelta: true, resuelta_en: new Date().toISOString() })
          .eq("ruta", venta.ruta)
          .eq("codigo_cliente", venta.codigoCliente)
          .eq("fecha", venta.fecha)
          .eq("es_otc", venta.esOtc)
          .eq("resuelta", false);
      }
    }
    cargar();
  }

  const ventasAgrupadas = useMemo(() => {
    const mapa = new Map();
    filas.forEach((f) => {
      const clave = claveVenta(f);
      if (!mapa.has(clave)) {
        mapa.set(clave, {
          clave,
          ruta: f.ruta,
          codigoCliente: f.codigo_cliente,
          cliente: f.cliente,
          fecha: f.fecha,
          esOtc: f.articulo === "OTC",
          formaPago: f.forma_pago,
          estado: f.estado,
          creadoEn: f.creado_en,
          productos: [],
          totalMonto: 0,
          totalCajetillas: 0,
        });
      }
      const grupo = mapa.get(clave);
      grupo.productos.push({
        id: f.id,
        articulo: f.articulo,
        nombre: f.producto_nombre || f.articulo,
        cajetillas: Number(f.cajetillas) || 0,
        monto: Number(f.monto) || 0,
        formaPago: f.forma_pago,
        estado: f.estado,
        ticketFolio: f.ticket_folio,
        ticketParte: f.ticket_parte || 1,
        ticketDe: f.ticket_de || 1,
      });
      grupo.totalMonto += Number(f.monto) || 0;
      grupo.totalCajetillas += Number(f.cajetillas) || 0;
      if (new Date(f.creado_en) < new Date(grupo.creadoEn)) grupo.creadoEn = f.creado_en;
    });
    return [...mapa.values()].sort((a, b) => {
      const folioA = a.productos[0]?.ticketFolio;
      const folioB = b.productos[0]?.ticketFolio;
      if (folioA != null && folioB != null) return folioA - folioB;
      return new Date(a.creadoEn) - new Date(b.creadoEn);
    });
  }, [filas]);

  const [ventasEnModoTotal, setVentasEnModoTotal] = useState(new Set());
  function toggleModoTotal(clave) {
    setVentasEnModoTotal((s) => {
      const n = new Set(s);
      if (n.has(clave)) n.delete(clave); else n.add(clave);
      return n;
    });
  }

  function formaPagoDeProductos(productos) {
    return productos[0]?.formaPago || "EFECTIVO";
  }
  function estadoDeProductos(productos) {
    return productos[0]?.estado || "ESPERA";
  }

  const ticketsParaMostrar = useMemo(() => {
    const resultado = [];
    ventasAgrupadas.forEach((venta) => {
      const totalPartes = Math.max(1, ...venta.productos.map((p) => p.ticketDe || 1));
      const necesitaDividir = totalPartes > 1;

      if (!necesitaDividir) {
        resultado.push({
          ventaOriginal: venta,
          claveTicket: `${venta.clave}__0`,
          parteLabel: null,
          necesitaDividir: false,
          esVistaTotal: false,
          productos: venta.productos,
          totalMonto: venta.totalMonto,
          totalCajetillas: venta.totalCajetillas,
          formaPago: formaPagoDeProductos(venta.productos),
          estado: estadoDeProductos(venta.productos),
        });
        return;
      }

      const verComoTotal = ventasEnModoTotal.has(venta.clave);
      if (verComoTotal) {
        resultado.push({
          ventaOriginal: venta,
          claveTicket: `${venta.clave}__total`,
          parteLabel: null,
          necesitaDividir: true,
          esVistaTotal: true,
          productos: venta.productos,
          totalMonto: venta.totalMonto,
          totalCajetillas: venta.totalCajetillas,
          formaPago: formaPagoDeProductos(venta.productos),
          estado: estadoDeProductos(venta.productos),
        });
        return;
      }

      const porParte = new Map();
      venta.productos.forEach((p) => {
        const parte = p.ticketParte || 1;
        if (!porParte.has(parte)) porParte.set(parte, []);
        porParte.get(parte).push(p);
      });
      [...porParte.keys()].sort((a, b) => a - b).forEach((numParte) => {
        const productos = porParte.get(numParte);
        resultado.push({
          ventaOriginal: venta,
          claveTicket: `${venta.clave}__${numParte}`,
          parteLabel: `${numParte}/${totalPartes}`,
          necesitaDividir: true,
          esVistaTotal: false,
          productos,
          totalMonto: productos.reduce((s, p) => s + p.monto, 0),
          totalCajetillas: productos.reduce((s, p) => s + p.cajetillas, 0),
          formaPago: formaPagoDeProductos(productos),
          estado: estadoDeProductos(productos),
        });
      });
    });
    return resultado;
  }, [ventasAgrupadas, ventasEnModoTotal]);

  const hayNuevasPrioritarias = nuevosPrioritarioClaves.size > 0;
  const hayNuevasNormal = nuevosNormalClaves.size > 0;

  function textoParaCopiar(ticket) {
    const venta = ticket.ventaOriginal;
    const { distribucionBruta, ivaDistribucion, distribucionNeta, subtotalProducto, ivaProducto, precioProductoNeto } = calcularDesglose(ticket.totalMonto, ticket.totalCajetillas);
    const lineas = [
      `Cliente: ${venta.codigoCliente}${venta.cliente ? " — " + venta.cliente : ""}${venta.esOtc ? " (OTC)" : ""}${ticket.parteLabel ? ` (ticket ${ticket.parteLabel})` : ""}`,
      `Ruta: ${venta.ruta}   Fecha: ${venta.fecha}   Forma de pago: ${venta.formaPago || "EFECTIVO"}`,
      "",
      "Productos:",
      ...ticket.productos.map((p) => `  ${p.articulo} — ${p.nombre} — ${num(p.cajetillas)} caj. — ${money(p.monto)} (sin IVA: ${money(calcularDesgloseLinea(p.monto, p.cajetillas))})`),
      "",
      `Total cajetillas: ${num(ticket.totalCajetillas)}`,
      `Total del ticket: ${money(ticket.totalMonto + distribucionBruta)}`,
      "",
      ...(venta.esOtc
        ? [`OTC · sin IVA (sin costo de distribución): ${money(precioProductoNeto)}`]
        : [
            `Distribución (${num(ticket.totalCajetillas)} caj. × $${COSTO_DISTRIBUCION_UNITARIO}), sin IVA: ${money(distribucionNeta)}`,
            "",
            `Comprobación: ${money(ticket.totalMonto)} (productos) + ${money(distribucionBruta)} (distribución) = ${money(ticket.totalMonto + distribucionBruta)}`,
          ]),
    ];
    return lineas.join("\n");
  }

  return (
    <div style={{ maxWidth: 920, width: "100%", boxSizing: "border-box", margin: "0 auto", padding: "24px 16px 60px", overflowX: "hidden" }}>
      <style>{`
        @keyframes parpadeoTabPrioritario {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,215,0,0.85); background-color: rgba(255,215,0,0.15); }
          50% { box-shadow: 0 0 0 8px rgba(255,215,0,0); background-color: rgba(255,215,0,0.55); }
        }
        .tab-parpadeo-prioritario { animation: parpadeoTabPrioritario 0.9s ease-in-out infinite; border: 2px solid #FFD700 !important; }

        @keyframes parpadeoTabNormal {
          0%, 100% { box-shadow: 0 0 0 0 rgba(90,169,230,0.85); background-color: rgba(90,169,230,0.15); }
          50% { box-shadow: 0 0 0 8px rgba(90,169,230,0); background-color: rgba(90,169,230,0.5); }
        }
        .tab-parpadeo-normal { animation: parpadeoTabNormal 0.9s ease-in-out infinite; border: 2px solid #5AA9E6 !important; }

        @keyframes parpadeoTabMensaje {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,140,0,0.85); background-color: rgba(255,140,0,0.15); }
          50% { box-shadow: 0 0 0 8px rgba(255,140,0,0); background-color: rgba(255,140,0,0.5); }
        }
        .tab-parpadeo-mensaje { animation: parpadeoTabMensaje 0.9s ease-in-out infinite; border: 2px solid #FF8C00 !important; }

        /* Indicador de "esta pestaña está seleccionada" — una barra fija
           debajo del botón, en un elemento aparte (no el borde del botón),
           para que nunca se confunda ni se tape con el parpadeo de
           "hay algo nuevo" (que sí pinta el borde del botón). */
        .tab-indicador-seleccionada { position: absolute; left: 10%; right: 10%; bottom: -5px; height: 3px; border-radius: 2px; background: #FFFFFF; }
      `}</style>

      {/* Indicador reutilizable de selección — se usa junto a cada botón de pestaña. */}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 8, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="display" style={{ fontSize: 24, margin: 0 }}>FACTURAS</h1>
          <div style={{ fontSize: 12, color: "#9AA7BD" }}>Panel de facturación · ADMIN</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-ghost" onClick={cargar} disabled={cargando}>
            <RefreshCw size={14} style={{ verticalAlign: "-2px", animation: cargando ? "spin 1s linear infinite" : "none" }} /> {cargando ? "..." : "Refrescar"}
          </button>
          <button className="btn-ghost" onClick={onLogout}><LogOut size={14} style={{ verticalAlign: "-2px" }} /> Salir</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          className={vistaPrincipal === "facturacion" ? "btn" : "btn-ghost"}
          style={{ flex: 1, position: "relative" }}
          onClick={() => setVistaPrincipal("facturacion")}
        >
          FACTURACIÓN
          {(hayNuevasPrioritarias || hayNuevasNormal || nuevosMensajesIds.size > 0) && vistaPrincipal !== "facturacion" && (
            <span style={{ marginLeft: 6, background: "#F2B134", color: "#1A1300", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>
              {nuevosPrioritarioClaves.size + nuevosNormalClaves.size + nuevosMensajesIds.size}
            </span>
          )}
          {vistaPrincipal === "facturacion" && <span className="tab-indicador-seleccionada" />}
        </button>
        <button
          className={vistaPrincipal === "checador" ? "btn" : "btn-ghost"}
          style={{ flex: 1, position: "relative" }}
          onClick={() => setVistaPrincipal("checador")}
        >
          RELOJ CHECADOR
          {vistaPrincipal === "checador" && <span className="tab-indicador-seleccionada" />}
        </button>
      </div>

      {vistaPrincipal === "checador" && (
        <RelojChecadorView puedeSubir={true} rutaPropia={null} puedeVerBono={true} />
      )}

      {vistaPrincipal === "facturacion" && (
      <>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button
          className={`${vista === "clientes" && tab === "prioritario" ? "btn" : "btn-ghost"} ${hayNuevasPrioritarias ? "tab-parpadeo-prioritario" : ""}`}
          style={{ flex: "1 1 45%", minWidth: 0, position: "relative" }}
          onClick={() => { setVista("clientes"); setTab("prioritario"); }}
        >
          <Star size={13} style={{ verticalAlign: "-2px" }} /> PRIORITARIO
          {hayNuevasPrioritarias && (
            <span style={{ marginLeft: 6, background: "#FFD700", color: "#1A1300", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>
              {nuevosPrioritarioClaves.size}
            </span>
          )}
          {vista === "clientes" && tab === "prioritario" && <span className="tab-indicador-seleccionada" />}
        </button>
        <button
          className={`${vista === "clientes" && tab === "normal" ? "btn" : "btn-ghost"} ${hayNuevasNormal ? "tab-parpadeo-normal" : ""}`}
          style={{ flex: "1 1 45%", minWidth: 0, position: "relative" }}
          onClick={() => { setVista("clientes"); setTab("normal"); }}
        >
          NORMAL
          {hayNuevasNormal && (
            <span style={{ marginLeft: 6, background: "#5AA9E6", color: "#0B1220", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>
              {nuevosNormalClaves.size}
            </span>
          )}
          {vista === "clientes" && tab === "normal" && <span className="tab-indicador-seleccionada" />}
        </button>
        <button
          className={`${vista === "mensajes" ? "btn" : "btn-ghost"} ${nuevosMensajesIds.size > 0 ? "tab-parpadeo-mensaje" : ""}`}
          style={{ flex: "1 1 45%", minWidth: 0, position: "relative" }}
          onClick={() => setVista("mensajes")}
        >
          <MessageSquare size={13} style={{ verticalAlign: "-2px" }} /> MENSAJES
          {nuevosMensajesIds.size > 0 && (
            <span style={{ marginLeft: 6, background: "#FF8C00", color: "#1A1300", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>
              {nuevosMensajesIds.size}
            </span>
          )}
          {vista === "mensajes" && <span className="tab-indicador-seleccionada" />}
        </button>
        <button
          className={vista === "catalogo" ? "btn" : "btn-ghost"}
          style={{ flex: "1 1 45%", minWidth: 0, position: "relative" }}
          onClick={() => setVista("catalogo")}
        >
          CLIENTES
          {vista === "catalogo" && <span className="tab-indicador-seleccionada" />}
        </button>
      </div>

      {vista === "mensajes" && (
        <MensajesPanel
          mensajes={mensajes}
          cargando={cargandoMensajes}
          nuevosIds={nuevosMensajesIds}
          onMarcarVistos={marcarMensajesVistos}
        />
      )}

      {vista === "catalogo" && (
        <ClientesAdminPanel listaRutas={RUTAS} nombresRutas={NOMBRES} />
      )}

      {vista === "clientes" && (
      <>
      <div className="card" style={{ padding: 12, marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: 11, color: "#9AA7BD" }}>Desde</label><br />
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#9AA7BD" }}>Hasta</label><br />
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
        </div>
        <button className="btn-ghost" onClick={() => { setFechaDesde(hoyISO()); setFechaHasta(hoyISO()); }}>Hoy</button>
        <div style={{ display: "flex", gap: 6 }}>
          {["PENDIENTE", "FACTURADO"].map((e) => (
            <button
              key={e}
              onClick={() => setFiltroEstado(e)}
              style={{
                fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "8px 10px", cursor: "pointer",
                background: filtroEstado === e ? COLOR_FILTRO[e] : "transparent",
                color: filtroEstado === e ? "#0B1220" : COLOR_FILTRO[e],
                border: `1px solid ${COLOR_FILTRO[e]}`,
              }}
            >
              {e}
            </button>
          ))}
        </div>
        {(hayNuevasPrioritarias || hayNuevasNormal) && (
          <button className="btn" style={{ marginLeft: "auto", background: "#FFD700", borderColor: "#FFD700" }} onClick={marcarTodoVisto}>
            Marcar todo como visto
          </button>
        )}
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#3a1414", border: "1px solid #FF6B6B", color: "#FF6B6B", fontSize: 12, borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {cargando ? (
        <div style={{ color: "#9AA7BD", fontSize: 13, textAlign: "center", padding: 30 }}>Cargando...</div>
      ) : ticketsParaMostrar.length === 0 ? (
        <div className="card" style={{ padding: 30, textAlign: "center", color: "#9AA7BD" }}>
          No hay clientes {tab === "prioritario" ? "prioritarios" : "normales"} {filtroEstado === "FACTURADO" ? "facturados" : "pendientes"} para este rango de fechas.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: "#9AA7BD" }}>{ventasAgrupadas.length} cliente{ventasAgrupadas.length === 1 ? "" : "s"} con venta en este rango</div>
          {ticketsParaMostrar.map((ticket) => {
            const venta = ticket.ventaOriginal;
            const esPrioritaria = tab === "prioritario";
            const esNueva = esPrioritaria ? nuevosPrioritarioClaves.has(venta.clave) : nuevosNormalClaves.has(venta.clave);
            const { distribucionBruta, ivaDistribucion, distribucionNeta, subtotalProducto, ivaProducto, precioProductoNeto } = calcularDesglose(ticket.totalMonto, ticket.totalCajetillas);
            return (
              <div
                key={ticket.claveTicket}
                className="card"
                style={{ padding: 16, border: esNueva ? `2px solid ${esPrioritaria ? "#FFD700" : "#5AA9E6"}` : undefined }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="mono" style={{ fontSize: 16, color: "#F2B134", fontWeight: 700 }}>{venta.codigoCliente}</span>
                      {venta.cliente && <span style={{ fontSize: 14, color: "#E8EDF5" }}>{venta.cliente}</span>}
                      {venta.esOtc && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#0B1220", background: "#F2B134", borderRadius: 6, padding: "2px 8px" }}>OTC</span>
                      )}
                      {ticket.parteLabel && (
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#0B1220", background: "#FF8C00", borderRadius: 6, padding: "2px 10px" }}>
                          TICKET {ticket.parteLabel}
                        </span>
                      )}
                      {ticket.esVistaTotal && (
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#0B1220", background: "#5AA9E6", borderRadius: 6, padding: "2px 10px" }}>
                          TICKET TOTAL
                        </span>
                      )}
                      <BotonCopiar texto={venta.codigoCliente} etiqueta="Copiar código" />
                    </div>
                    <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 2 }}>{venta.ruta} · {venta.fecha}</div>
                    {ticket.necesitaDividir && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ fontSize: 10.5, color: "#FF8C00" }}>
                          Pago en efectivo mayor a {money(LIMITE_TICKET_EFECTIVO)}.
                        </div>
                        {(() => {
                          const totalPartesVenta = Math.max(1, ...venta.productos.map((p) => p.ticketDe || 1));
                          const esPrimeraParte = ticket.parteLabel === `1/${totalPartesVenta}`;
                          if (!ticket.esVistaTotal && !esPrimeraParte) return null;
                          return (
                            <button className="btn-ghost" style={{ fontSize: 10.5, padding: "3px 8px" }} onClick={() => toggleModoTotal(venta.clave)}>
                              {ticket.esVistaTotal ? "Ver tickets divididos" : `Ver ticket total (junta los ${totalPartesVenta})`}
                            </button>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }} onClick={(e) => e.stopPropagation()}>
                    <select
                      value={ticket.formaPago || "EFECTIVO"}
                      onChange={(e) => cambiarFormaPago(ticket, e.target.value)}
                      disabled={ticket.estado === "FACTURADO" || recalculandoClaves.has(ticket.claveTicket)}
                      title={ticket.estado === "FACTURADO" ? "Ya está facturado — no se puede cambiar la forma de pago" : undefined}
                      style={{
                        fontSize: 12, fontWeight: 700, padding: "6px 8px",
                        color: COLOR_FORMA_PAGO[ticket.formaPago] || "#E8EDF5",
                        opacity: (ticket.estado === "FACTURADO" || recalculandoClaves.has(ticket.claveTicket)) ? 0.6 : 1,
                        cursor: (ticket.estado === "FACTURADO" || recalculandoClaves.has(ticket.claveTicket)) ? "not-allowed" : "pointer",
                      }}
                    >
                      <option value="EFECTIVO">EFECTIVO</option>
                      <option value="CREDITO">CRÉDITO</option>
                      <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                    </select>
                    <select
                      value={ticket.estado || "ESPERA"}
                      onChange={(e) => cambiarEstado(ticket, e.target.value)}
                      style={{ fontSize: 12, fontWeight: 700, color: COLOR_ESTADO[ticket.estado] || "#E8EDF5", padding: "6px 8px" }}
                    >
                      <option value="ESPERA">ESPERA</option>
                      <option value="FACTURADO">FACTURADO</option>
                      <option value="OBSERVACION">OBSERVACIÓN</option>
                    </select>
                    {esNueva && <CheckCircle2 size={18} color="#FFD700" />}
                  </div>
                </div>

                {recalculandoClaves.has(ticket.claveTicket) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#5AA9E6", marginBottom: 10 }}>
                    <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Recalculando la división del ticket en partes ≤ {money(LIMITE_TICKET_EFECTIVO)}...
                  </div>
                )}

                {ticket.estado === "OBSERVACION" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#FF8C00", marginBottom: 10 }}>
                    <MessageSquare size={13} /> En observación — esperando respuesta de la ruta.
                  </div>
                )}

                {ticket.formaPago === "CREDITO" && (
                  <UltimaCompraCredito
                    ruta={venta.ruta}
                    codigoCliente={venta.codigoCliente}
                    fechaActual={venta.fecha}
                    esOtcActual={venta.esOtc}
                  />
                )}

                <div style={{ marginBottom: 14 }}>
                  <div className="display" style={{ fontSize: 12, color: "#3DDC97", marginBottom: 6 }}>PARA CAPTURAR · SIN IVA</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 420 }}>
                      <thead>
                        <tr style={{ color: "#9AA7BD", textAlign: "left" }}>
                          <th style={{ padding: "4px 8px 4px 0" }}>Código FA</th>
                          <th>Producto</th>
                          <th>Cajetillas</th>
                          <th>Costo unitario</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ticket.productos.map((p, i) => (
                          <tr key={i} style={{ borderTop: "1px solid #1E2A42" }}>
                            <td style={{ padding: "6px 8px 6px 0" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span className="mono" style={{ color: "#F2B134" }}>{p.articulo}</span>
                                <BotonCopiar texto={p.articulo} etiqueta="" />
                              </div>
                            </td>
                            <td style={{ color: "#E8EDF5" }}>{p.nombre}</td>
                            <td className="mono">{num(p.cajetillas)}</td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span className="mono" style={{ color: "#3DDC97" }}>{money(costoUnitarioNeto(p.monto, p.cajetillas))}</span>
                                <BotonCopiar texto={money(costoUnitarioNeto(p.monto, p.cajetillas))} etiqueta="" />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {!venta.esOtc && (
                  <div className="card" style={{ padding: "10px 14px", marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 11, color: "#5AA9E6", fontWeight: 700 }}>
                        DISTRIBUCIÓN ({num(ticket.totalCajetillas)} caj. × ${COSTO_DISTRIBUCION_UNITARIO}) · SIN IVA
                      </div>
                      <BotonCopiar texto={money(distribucionNeta)} etiqueta="" />
                    </div>
                    <div className="mono" style={{ fontSize: 18, color: "#5AA9E6" }}>{money(distribucionNeta)}</div>
                  </div>
                )}
                {venta.esOtc && (
                  <div className="card" style={{ padding: "10px 14px", marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 11, color: "#9AA7BD", fontWeight: 700 }}>OTC · SIN IVA (sin costo de distribución)</div>
                      <BotonCopiar texto={money(precioProductoNeto)} etiqueta="" />
                    </div>
                    <div className="mono" style={{ fontSize: 18, color: "#3DDC97" }}>{money(precioProductoNeto)}</div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  <div className="card" style={{ padding: "10px 14px", flex: "1 1 160px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 10, color: "#9AA7BD" }}>TOTAL CAJETILLAS{ticket.parteLabel ? ` (${ticket.parteLabel})` : ""}</div>
                      <BotonCopiar texto={num(ticket.totalCajetillas)} etiqueta="" />
                    </div>
                    <div className="mono" style={{ fontSize: 18 }}>{num(ticket.totalCajetillas)}</div>
                  </div>
                  <div className="card" style={{ padding: "10px 14px", flex: "1 1 160px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 10, color: "#9AA7BD" }}>TOTAL DEL TICKET{ticket.parteLabel ? ` (${ticket.parteLabel})` : ""}</div>
                      <BotonCopiar texto={money(ticket.totalMonto + distribucionBruta)} etiqueta="" />
                    </div>
                    <div className="mono" style={{ fontSize: 18, color: "#F2B134" }}>{money(ticket.totalMonto + distribucionBruta)}</div>
                  </div>
                </div>

                {!venta.esOtc && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 10.5, color: "#5b6478" }}>
                      Comprobación: {money(ticket.totalMonto)} (productos) + {money(distribucionBruta)} (distribución) = {money(ticket.totalMonto + distribucionBruta)}
                    </div>
                    <BotonCopiar texto={textoParaCopiar(ticket)} etiqueta="Copiar todo" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </>
      )}
      </>
      )}
    </div>
  );
}
