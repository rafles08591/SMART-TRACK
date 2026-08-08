// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from "react";
import { LogOut, RefreshCw, Star, CheckCircle2, AlertCircle, Copy, Check, MessageSquare, Download } from "lucide-react";
import { supabase } from "../supabaseClient";

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

// Filtro de arriba: solo 2 opciones. PENDIENTE agrupa ESPERA + OBSERVACION
// (una observación NO saca la venta de la vista principal — solo facturar
// lo hace). El estado real de cada tarjeta (los 3 valores) se sigue viendo
// y editando en el selector de cada tarjeta.
const COLOR_FILTRO = {
  PENDIENTE: "#9AA7BD",
  FACTURADO: "#3DDC97",
};

// Del monto total de una venta (que ya incluye IVA) y el total de cajetillas,
// separa en dos bloques —cada uno con su propio IVA— de forma que los 4
// números sumen exactamente el monto total:
//   Distribución bruta = 2.78 × cajetillas
//   IVA de distribución = 16% de la distribución bruta
//   Distribución neta   = distribución bruta − su IVA
//
//   Subtotal producto   = monto − distribución bruta
//   IVA de producto      = 16% del subtotal producto
//   Precio del producto (sin IVA) = subtotal producto − su IVA
function calcularDesglose(montoTotal, totalCajetillas) {
  const distribucionBruta = totalCajetillas * COSTO_DISTRIBUCION_UNITARIO;
  const ivaDistribucion = distribucionBruta * IVA_TASA;
  const distribucionNeta = distribucionBruta - ivaDistribucion;

  const subtotalProducto = Math.max(montoTotal - distribucionBruta, 0);
  const ivaProducto = subtotalProducto * IVA_TASA;
  const precioProductoNeto = subtotalProducto - ivaProducto;

  return { distribucionBruta, ivaDistribucion, distribucionNeta, subtotalProducto, ivaProducto, precioProductoNeto };
}

// Mismo cálculo pero para una sola línea de producto (usa sus propias
// cajetillas y su propio monto) — para mostrar "precio sin IVA" por renglón.
function calcularDesgloseLinea(montoLinea, cajetillasLinea) {
  const distribucionBruta = cajetillasLinea * COSTO_DISTRIBUCION_UNITARIO;
  const subtotalProducto = Math.max(montoLinea - distribucionBruta, 0);
  const ivaProducto = subtotalProducto * IVA_TASA;
  const precioProductoNeto = subtotalProducto - ivaProducto;
  return precioProductoNeto;
}

// Costo unitario POR CAJETILLA, sin distribución y sin IVA — para el
// módulo "PARA CAPTURAR SIN IVA Y SIN COSTO".
function costoUnitarioNeto(montoLinea, cajetillasLinea) {
  if (!cajetillasLinea) return 0;
  return calcularDesgloseLinea(montoLinea, cajetillasLinea) / cajetillasLinea;
}

// Si el pago es en EFECTIVO y el total supera el límite fiscal ($2,000),
// hay que partir la venta en varios "tickets" — cada uno sin pasarse del
// límite. Usa "first-fit decreasing": ordena los productos de mayor a
// menor monto y va metiendo cada uno en el primer ticket donde SÍ quepa
// (en vez de ir llenando uno por uno en el orden en que vinieron) — así
// arma la menor cantidad de tickets posible, mezclando productos chicos
// entre sí para no desperdiciar espacio.
const LIMITE_TICKET_EFECTIVO = 2000;
// Si el pago es en EFECTIVO y el total supera el límite fiscal ($2,000),
// hay que partir la venta en varios "tickets" — cada uno sin pasarse del
// límite, en NINGÚN caso (ni cuando un solo producto ya vale más de
// $2,000 él solo). Usa "first-fit decreasing": primero divide en pedazos
// cualquier producto cuyo monto por sí solo ya pase el límite (mismo
// código FA, con una porción de cajetillas/monto cada pedazo), y luego
// ordena todo de mayor a menor y va metiendo cada pedazo en el primer
// ticket donde SÍ quepa.
//
// OJO: un producto partido en pedazos sigue siendo LA MISMA fila en la
// base de datos (mismo id), así que si sus pedazos terminan en tickets
// distintos, cambiar el estado/forma de pago de uno de esos tickets
// también cambia esa fila para el otro ticket que la comparte — es la
// única forma de dividir el monto sin partir la fila real en la base de
// datos.
function dividirEnTickets(productos, limite) {
  const unidades = [];
  productos.forEach((p) => {
    if (p.monto <= limite || !p.cajetillas) {
      unidades.push(p);
      return;
    }
    const precioPorCajetilla = p.monto / p.cajetillas;
    const cajetillasPorPedazo = Math.floor((limite / precioPorCajetilla) * 100) / 100;
    let cajetillasRestantes = Math.round(p.cajetillas * 100) / 100;
    while (cajetillasRestantes > 0) {
      const cajetillasPedazo = Math.min(cajetillasPorPedazo || cajetillasRestantes, cajetillasRestantes);
      unidades.push({
        ...p,
        cajetillas: Math.round(cajetillasPedazo * 100) / 100,
        monto: Math.round(cajetillasPedazo * precioPorCajetilla * 100) / 100,
      });
      cajetillasRestantes = Math.round((cajetillasRestantes - cajetillasPedazo) * 100) / 100;
    }
  });

  const ordenados = [...unidades].sort((a, b) => b.monto - a.monto);
  const bins = [];
  ordenados.forEach((p) => {
    let destino = bins.find((b) => b.suma + p.monto <= limite);
    if (!destino) {
      destino = { productos: [], suma: 0 };
      bins.push(destino);
    }
    destino.productos.push(p);
    destino.suma += p.monto;
  });
  return bins.length > 0 ? bins.map((b) => b.productos) : [[]];
}

// Botón pequeño de copiar-al-portapapeles con feedback visual de 1.5s.
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

/**
 * Pantalla exclusiva del usuario ADMIN. Solo muestra FACTURAS, con dos
 * pestañas: PRIORITARIO y NORMAL. Cada TARJETA agrupa TODAS las ventas de
 * UN cliente en UN día (todos los productos que compró), con el total,
 * el desglose por producto (código FA, nombre, cajetillas, precio) y el
 * desglose de distribución/IVA. Las tarjetas de clientes prioritarios con
 * ventas nuevas parpadean en amarillo hasta que se marcan como vistas.
 */
// Panel de la pestaña MENSAJES: cada observación que ADMIN mandó, con la
// respuesta de la ruta (texto y/o archivo adjunto) en cuanto llega. Las que
// tienen respuesta sin revisar parpadean en naranja.
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

export default function FacturasAdminView({ onLogout }) {
  const [vista, setVista] = useState("clientes"); // "clientes" | "mensajes"
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

  // ---- Nuevas ventas (prioritario / normal): se revisan SIEMPRE, sin
  // importar en qué pestaña esté parado ADMIN — así PRIORITARIO y NORMAL
  // pueden parpadear los dos aunque solo se esté viendo uno de ellos. ----
  const [nuevosPrioritarioClaves, setNuevosPrioritarioClaves] = useState(new Set());
  const [nuevosNormalClaves, setNuevosNormalClaves] = useState(new Set());

  async function revisarNuevasVentasGlobal() {
    const referencia = ultimaVistaRef.current;
    if (!referencia) return; // primera vez que entra: no marca nada como "nuevo" todavía
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

  // ---- Mensajes (observaciones ADMIN <-> ruta): se cargan siempre, sin
  // importar en qué pestaña esté ADMIN parado, para que el aviso de
  // "hay respuesta nueva" funcione aunque no esté viendo esa pestaña. ----
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
    const canal = supabase
      .channel("facturas_observaciones_admin_mensajes")
      .on("postgres_changes", { event: "*", schema: "public", table: "facturas_observaciones" }, () => {
        cargarMensajes();
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function marcarMensajesVistos() {
    const ahora = new Date().toISOString();
    ultimaVistaMensajesRef.current = ahora;
    try { localStorage.setItem(LLAVE_ULTIMA_VISTA_MENSAJES, ahora); } catch (e) { /* ignorar */ }
    setNuevosMensajesIds(new Set());
  }

  // La clave de agrupación incluye el TIPO (OTC vs producto normal): así,
  // aunque sea el mismo cliente el mismo día, las ventas de OTC nunca se
  // mezclan con las de productos normales — salen en tarjetas separadas.
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
        .select("id, ruta, codigo_cliente, cliente, fecha, articulo, producto_nombre, paquetes, cajetillas, contado_monto, credito_monto, monto, forma_pago, estado, prioridad, creado_en, actualizado_en")
        .eq("prioridad", tab === "prioritario");
      // OBSERVACIÓN ya NO oculta la venta de la vista principal — solo
      // FACTURADO la saca de aquí. Mientras está en observación, sigue
      // apareciendo (con su aviso naranja) hasta que se facture de verdad.
      query = filtroEstado === "FACTURADO"
        ? query.eq("estado", "FACTURADO")
        : query.in("estado", ["ESPERA", "OBSERVACION"]);
      const { data, error: err } = await query
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta)
        .order("creado_en", { ascending: false });
      if (err) throw err;
      setFilas(data || []);
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

  // Respaldo por si el tiempo real fallara: refresca sola cada 30 minutos,
  // sin importar en qué pestaña esté parado ADMIN.
  useEffect(() => {
    const intervalo = setInterval(() => {
      if (vista === "clientes") cargar();
      revisarNuevasVentasGlobal();
      cargarMensajes();
    }, 30 * 60 * 1000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, tab, filtroEstado, fechaDesde, fechaHasta]);

  // Revisión global de "nuevas ventas" — corre siempre, sin importar la
  // pestaña, para que PRIORITARIO y NORMAL puedan parpadear los dos.
  useEffect(() => {
    revisarNuevasVentasGlobal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tiempo real: en vez de tratar de "insertar" la fila nueva a mano dentro
  // del agrupado (complicado y propenso a error), simplemente se vuelve a
  // pedir todo con un pequeño debounce — más simple y siempre consistente.
  useEffect(() => {
    let temporizador = null;
    const canal = supabase
      .channel("ventas_facturas_admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "ventas_facturas" }, () => {
        revisarNuevasVentasGlobal();
        if (temporizador) clearTimeout(temporizador);
        temporizador = setTimeout(() => cargar(), 600);
      })
      .subscribe();
    return () => { if (temporizador) clearTimeout(temporizador); supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filtroEstado, fechaDesde, fechaHasta]);

  function marcarTodoVisto() {
    const ahora = new Date().toISOString();
    ultimaVistaRef.current = ahora;
    try { localStorage.setItem(LLAVE_ULTIMA_VISTA, ahora); } catch (e) { /* ignorar */ }
    setNuevosPrioritarioClaves(new Set());
    setNuevosNormalClaves(new Set());
  }

  async function cambiarFormaPago(ticket, nuevaFormaPago) {
    if (ticket.estado === "FACTURADO") {
      alert("Esta venta ya está facturada — no se puede cambiar la forma de pago. Si es un error, primero regrésala a ESPERA.");
      return;
    }
    // Aplica SOLO a los productos de ESTE ticket (por su id real en la
    // base de datos) — así, si la venta se dividió en varios tickets
    // (1/2, 2/2...), cada uno se puede corregir sin jalar a los demás.
    const ids = ticket.productos.map((p) => p.id).filter(Boolean);
    if (ids.length === 0) return;
    setFilas((fs) => fs.map((f) => (ids.includes(f.id) ? { ...f, forma_pago: nuevaFormaPago } : f)));
    const { error: err } = await supabase
      .from("ventas_facturas")
      .update({ forma_pago: nuevaFormaPago })
      .in("id", ids);
    if (err) {
      console.error("Error actualizando forma de pago:", err);
      alert("No se pudo actualizar la forma de pago: " + err.message);
      cargar();
    }
  }

  // Cambia el estado SOLO de los productos de ESTE ticket (por id) — cada
  // tarjeta (1/2, 2/2, etc.) queda independiente: facturar una no jala a
  // las demás. Si pasa a OBSERVACION, pide el mensaje y lo manda a
  // facturas_observaciones (eso hace parpadear la pestaña FACTURAS del
  // vendedor). La observación de esa venta solo se marca resuelta cuando
  // YA NINGÚN producto (de ningún ticket) de esa venta sigue en OBSERVACION.
  async function cambiarEstado(ticket, nuevoEstado) {
    const venta = ticket.ventaOriginal;
    const ids = ticket.productos.map((p) => p.id).filter(Boolean);
    if (ids.length === 0) return;

    if (nuevoEstado === "OBSERVACION") {
      const mensaje = window.prompt("¿Qué le falta o no cuadra en esta venta? Este mensaje se le manda a la ruta.");
      if (!mensaje || !mensaje.trim()) return; // cancelado
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
      // Antes de cerrar la conversación de observación, confirma que
      // ningún OTRO ticket de esta misma venta siga en OBSERVACION.
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
    // Como cambió el estado, esta tarjeta ya no pertenece al filtro actual
    // (PENDIENTE/FACTURADO) — se recarga para que desaparezca de la vista
    // y aparezca en el filtro correspondiente.
    cargar();
  }

  // Agrupa las filas (una por producto) en una tarjeta por cliente+día,
  // sumando el total y las cajetillas, y arma el desglose de distribución/IVA.
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
      });
      grupo.totalMonto += Number(f.monto) || 0;
      grupo.totalCajetillas += Number(f.cajetillas) || 0;
      if (new Date(f.creado_en) > new Date(grupo.creadoEn)) grupo.creadoEn = f.creado_en;
    });
    return [...mapa.values()].sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn));
  }, [filas]);

  // Convierte cada venta agrupada en 1 o más "tickets" para mostrar: si es
  // pago en EFECTIVO y el total pasa de $2,000, se reparte en varias
  // tarjetas (cada una es su propio ticket), marcadas 1/2, 2/2, etc. Las
  // acciones (cambiar estado/forma de pago) siguen aplicando a TODA la
  // venta (por eso guardan la referencia a la venta original). Se puede
  // alternar a "ver ticket total" (un solo bloque con todo, IVA incluido,
  // y la distribución como una línea más al final).
  const [ventasEnModoTotal, setVentasEnModoTotal] = useState(new Set());
  function toggleModoTotal(clave) {
    setVentasEnModoTotal((s) => {
      const n = new Set(s);
      if (n.has(clave)) n.delete(clave); else n.add(clave);
      return n;
    });
  }

  // Forma de pago / estado "representativos" de un ticket: como ahora cada
  // ticket se actualiza de forma independiente, se toman del primer
  // producto de ESE ticket (en la práctica todos los productos de un mismo
  // ticket comparten el mismo valor, porque se actualizan juntos).
  function formaPagoDeProductos(productos) {
    return productos[0]?.formaPago || "EFECTIVO";
  }
  function estadoDeProductos(productos) {
    return productos[0]?.estado || "ESPERA";
  }

  const ticketsParaMostrar = useMemo(() => {
    const resultado = [];
    ventasAgrupadas.forEach((venta) => {
      const necesitaDividir = !venta.esOtc && (venta.formaPago || "EFECTIVO") === "EFECTIVO" && venta.totalMonto > LIMITE_TICKET_EFECTIVO;

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

      const grupos = dividirEnTickets(venta.productos, LIMITE_TICKET_EFECTIVO);
      grupos.forEach((productos, i) => {
        resultado.push({
          ventaOriginal: venta,
          claveTicket: `${venta.clave}__${i}`,
          parteLabel: `${i + 1}/${grupos.length}`,
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
      `Total del ticket: ${money(ticket.totalMonto)}`,
      "",
      ...(venta.esOtc
        ? [`OTC · sin IVA (sin costo de distribución): ${money(precioProductoNeto)}`]
        : [
            `Distribución (${num(ticket.totalCajetillas)} caj. × $${COSTO_DISTRIBUCION_UNITARIO}), sin IVA: ${money(distribucionNeta)}`,
            "",
            `Comprobación: ${money(precioProductoNeto)} + ${money(ivaProducto)} + ${money(distribucionNeta)} + ${money(ivaDistribucion)} = ${money(precioProductoNeto + ivaProducto + distribucionNeta + ivaDistribucion)}`,
          ]),
    ];
    return lineas.join("\n");
  }

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px 60px" }}>
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
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 8 }}>
        <div>
          <h1 className="display" style={{ fontSize: 24, margin: 0 }}>FACTURAS</h1>
          <div style={{ fontSize: 12, color: "#9AA7BD" }}>Panel de facturación · ADMIN</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost" onClick={cargar} disabled={cargando}>
            <RefreshCw size={14} style={{ verticalAlign: "-2px", animation: cargando ? "spin 1s linear infinite" : "none" }} /> {cargando ? "..." : "Refrescar"}
          </button>
          <button className="btn-ghost" onClick={onLogout}><LogOut size={14} style={{ verticalAlign: "-2px" }} /> Salir</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          className={`${vista === "clientes" && tab === "prioritario" ? "btn" : "btn-ghost"} ${hayNuevasPrioritarias ? "tab-parpadeo-prioritario" : ""}`}
          style={{ flex: 1, position: "relative" }}
          onClick={() => { setVista("clientes"); setTab("prioritario"); }}
        >
          <Star size={13} style={{ verticalAlign: "-2px" }} /> PRIORITARIO
          {hayNuevasPrioritarias && (
            <span style={{ marginLeft: 6, background: "#FFD700", color: "#1A1300", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>
              {nuevosPrioritarioClaves.size}
            </span>
          )}
        </button>
        <button
          className={`${vista === "clientes" && tab === "normal" ? "btn" : "btn-ghost"} ${hayNuevasNormal ? "tab-parpadeo-normal" : ""}`}
          style={{ flex: 1, position: "relative" }}
          onClick={() => { setVista("clientes"); setTab("normal"); }}
        >
          NORMAL
          {hayNuevasNormal && (
            <span style={{ marginLeft: 6, background: "#5AA9E6", color: "#0B1220", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>
              {nuevosNormalClaves.size}
            </span>
          )}
        </button>
        <button
          className={`${vista === "mensajes" ? "btn" : "btn-ghost"} ${nuevosMensajesIds.size > 0 ? "tab-parpadeo-mensaje" : ""}`}
          style={{ flex: 1, position: "relative" }}
          onClick={() => setVista("mensajes")}
        >
          <MessageSquare size={13} style={{ verticalAlign: "-2px" }} /> MENSAJES
          {nuevosMensajesIds.size > 0 && (
            <span style={{ marginLeft: 6, background: "#FF8C00", color: "#1A1300", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>
              {nuevosMensajesIds.size}
            </span>
          )}
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
                {/* Encabezado */}
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
                        {(ticket.esVistaTotal || ticket.parteLabel === "1/" + dividirEnTickets(venta.productos, LIMITE_TICKET_EFECTIVO).length) && (
                          <button className="btn-ghost" style={{ fontSize: 10.5, padding: "3px 8px" }} onClick={() => toggleModoTotal(venta.clave)}>
                            {ticket.esVistaTotal ? "Ver tickets divididos" : `Ver ticket total (junta los ${dividirEnTickets(venta.productos, LIMITE_TICKET_EFECTIVO).length})`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }} onClick={(e) => e.stopPropagation()}>
                    <select
                      value={ticket.formaPago || "EFECTIVO"}
                      onChange={(e) => cambiarFormaPago(ticket, e.target.value)}
                      disabled={ticket.estado === "FACTURADO"}
                      title={ticket.estado === "FACTURADO" ? "Ya está facturado — no se puede cambiar la forma de pago" : undefined}
                      style={{
                        fontSize: 12, fontWeight: 700, padding: "6px 8px",
                        color: COLOR_FORMA_PAGO[ticket.formaPago] || "#E8EDF5",
                        opacity: ticket.estado === "FACTURADO" ? 0.6 : 1,
                        cursor: ticket.estado === "FACTURADO" ? "not-allowed" : "pointer",
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

                {ticket.estado === "OBSERVACION" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#FF8C00", marginBottom: 10 }}>
                    <MessageSquare size={13} /> En observación — esperando respuesta de la ruta.
                  </div>
                )}

                {/* Módulo nuevo: PARA CAPTURAR SIN IVA Y SIN COSTO — costo unitario por
                    cajetilla, ya sin distribución y sin IVA, con copiado independiente
                    de cada código FA y de cada monto. */}
                <div style={{ marginBottom: 14 }}>
                  <div className="display" style={{ fontSize: 12, color: "#3DDC97", marginBottom: 6 }}>PARA CAPTURAR · SIN IVA Y SIN COSTO ADICIONAL</div>
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

                {/* 2) Distribución — solo el neto (sin IVA), un renglón. */}
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

                {/* 3 y 4) Total de cajetillas y total del ticket */}
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
                      <BotonCopiar texto={money(ticket.totalMonto)} etiqueta="" />
                    </div>
                    <div className="mono" style={{ fontSize: 18, color: "#F2B134" }}>{money(ticket.totalMonto)}</div>
                  </div>
                </div>

                {/* 5) Comprobación — igual que antes */}
                {!venta.esOtc && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 10.5, color: "#5b6478" }}>
                      Comprobación: {money(precioProductoNeto)} + {money(ivaProducto)} + {money(distribucionNeta)} + {money(ivaDistribucion)} = {money(precioProductoNeto + ivaProducto + distribucionNeta + ivaDistribucion)} (debe ser igual al total: {money(ticket.totalMonto)})
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
    </div>
  );
}
