// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from "react";
import { LogOut, RefreshCw, Star, CheckCircle2, AlertCircle, Copy, Check, MessageSquare } from "lucide-react";
import { supabase } from "../supabaseClient";

function hoyISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

const LLAVE_ULTIMA_VISTA = "facturas_admin_ultima_vista";

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

// Monto de esa línea YA SIN el costo de distribución (pero todavía CON
// IVA) — es lo que se muestra en el módulo TICKET.
function montoTicketLinea(montoLinea, cajetillasLinea) {
  const distribucionBruta = cajetillasLinea * COSTO_DISTRIBUCION_UNITARIO;
  return Math.max(montoLinea - distribucionBruta, 0);
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
function dividirEnTickets(productos, limite) {
  const ordenados = [...productos].sort((a, b) => b.monto - a.monto);
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
export default function FacturasAdminView({ onLogout }) {
  const [tab, setTab] = useState("prioritario");
  const [filtroEstado, setFiltroEstado] = useState("ESPERA");
  const [fechaDesde, setFechaDesde] = useState(hoyISO());
  const [fechaHasta, setFechaHasta] = useState(hoyISO());
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [nuevasClaves, setNuevasClaves] = useState(new Set());
  const ultimaVistaRef = useRef(null);

  useEffect(() => {
    try {
      ultimaVistaRef.current = localStorage.getItem(LLAVE_ULTIMA_VISTA);
    } catch (e) { /* ignorar */ }
  }, []);

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
      const { data, error: err } = await supabase
        .from("ventas_facturas")
        .select("id, ruta, codigo_cliente, cliente, fecha, articulo, producto_nombre, paquetes, cajetillas, contado_monto, credito_monto, monto, forma_pago, estado, prioridad, creado_en, actualizado_en")
        .eq("prioridad", tab === "prioritario")
        .eq("estado", filtroEstado)
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta)
        .order("creado_en", { ascending: false });
      if (err) throw err;
      setFilas(data || []);

      if (ultimaVistaRef.current) {
        const nuevas = new Set(
          (data || [])
            .filter((f) => f.prioridad && new Date(f.creado_en) > new Date(ultimaVistaRef.current))
            .map(claveVenta)
        );
        setNuevasClaves(nuevas);
      }
    } catch (err) {
      console.error("Error cargando ventas_facturas:", err);
      setError(err?.message || "No se pudo cargar la información.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filtroEstado, fechaDesde, fechaHasta]);

  // Tiempo real: en vez de tratar de "insertar" la fila nueva a mano dentro
  // del agrupado (complicado y propenso a error), simplemente se vuelve a
  // pedir todo con un pequeño debounce — más simple y siempre consistente.
  useEffect(() => {
    let temporizador = null;
    const canal = supabase
      .channel("ventas_facturas_admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "ventas_facturas" }, (payload) => {
        const fila = payload.new;
        if (fila?.prioridad) {
          setNuevasClaves((s) => new Set(s).add(claveVenta(fila)));
        }
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
    setNuevasClaves(new Set());
  }

  function quitarParpadeo(clave) {
    setNuevasClaves((s) => { const n = new Set(s); n.delete(clave); return n; });
  }

  async function cambiarFormaPago(venta, nuevaFormaPago) {
    // Aplica a TODAS las líneas de ESE MISMO TIPO (OTC o productos) de esa
    // venta (mismo cliente, mismo día) — nunca cruza OTC con productos.
    setFilas((fs) => fs.map((f) => (claveVenta(f) === venta.clave ? { ...f, forma_pago: nuevaFormaPago } : f)));
    let query = supabase
      .from("ventas_facturas")
      .update({ forma_pago: nuevaFormaPago })
      .eq("ruta", venta.ruta)
      .eq("codigo_cliente", venta.codigoCliente)
      .eq("fecha", venta.fecha);
    query = venta.esOtc ? query.eq("articulo", "OTC") : query.neq("articulo", "OTC");
    const { error: err } = await query;
    if (err) {
      console.error("Error actualizando forma de pago:", err);
      alert("No se pudo actualizar la forma de pago: " + err.message);
      cargar();
    }
  }

  // Cambia el estado de TODAS las líneas de esa venta (cliente+día). Si pasa
  // a OBSERVACION, pide el mensaje y lo manda a facturas_observaciones (eso
  // es lo que hace parpadear en naranja la pestaña FACTURAS del vendedor).
  // Si sale de OBSERVACION hacia ESPERA o FACTURADO, cierra cualquier
  // observación abierta de esa venta (ya se resolvió).
  async function cambiarEstado(venta, nuevoEstado) {
    if (nuevoEstado === "OBSERVACION") {
      const mensaje = window.prompt("¿Qué le falta o no cuadra en esta venta? Este mensaje se le manda a la ruta.");
      if (!mensaje || !mensaje.trim()) return; // cancelado
      const { error: errObs } = await supabase.from("facturas_observaciones").insert({
        ruta: venta.ruta,
        codigo_cliente: venta.codigoCliente,
        fecha: venta.fecha,
        es_otc: venta.esOtc,
        mensaje: mensaje.trim(),
        autor: "ADMIN",
      });
      if (errObs) {
        alert("No se pudo enviar la observación: " + errObs.message);
        return;
      }
    } else {
      // Sale de observación (si tenía alguna abierta, DEL MISMO TIPO) -> se marca resuelta.
      await supabase
        .from("facturas_observaciones")
        .update({ resuelta: true, resuelta_en: new Date().toISOString() })
        .eq("ruta", venta.ruta)
        .eq("codigo_cliente", venta.codigoCliente)
        .eq("fecha", venta.fecha)
        .eq("es_otc", venta.esOtc)
        .eq("resuelta", false);
    }

    setFilas((fs) => fs.map((f) => (claveVenta(f) === venta.clave ? { ...f, estado: nuevoEstado } : f)));
    let query = supabase
      .from("ventas_facturas")
      .update({ estado: nuevoEstado })
      .eq("ruta", venta.ruta)
      .eq("codigo_cliente", venta.codigoCliente)
      .eq("fecha", venta.fecha);
    query = venta.esOtc ? query.eq("articulo", "OTC") : query.neq("articulo", "OTC");
    const { error: err } = await query;
    if (err) {
      console.error("Error actualizando estado:", err);
      alert("No se pudo actualizar el estado: " + err.message);
      cargar();
      return;
    }
    // Como cambió el estado, esta tarjeta ya no pertenece al filtro actual
    // (ESPERA/FACTURADO/OBSERVACION) — se recarga para que desaparezca de
    // la vista y aparezca en el filtro correspondiente.
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
        articulo: f.articulo,
        nombre: f.producto_nombre || f.articulo,
        cajetillas: Number(f.cajetillas) || 0,
        monto: Number(f.monto) || 0,
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
        });
        return;
      }

      const verComoTotal = ventasEnModoTotal.has(venta.clave);
      if (verComoTotal) {
        const distribucionBrutaTotal = venta.totalCajetillas * COSTO_DISTRIBUCION_UNITARIO;
        resultado.push({
          ventaOriginal: venta,
          claveTicket: `${venta.clave}__total`,
          parteLabel: null,
          necesitaDividir: true,
          esVistaTotal: true,
          productos: venta.productos,
          productosTicket: [
            ...venta.productos,
            { articulo: "—", nombre: "Distribución (costo logístico)", cajetillas: null, monto: distribucionBrutaTotal, esDistribucion: true },
          ],
          totalMonto: venta.totalMonto,
          totalCajetillas: venta.totalCajetillas,
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
          productosTicket: productos,
          totalMonto: productos.reduce((s, p) => s + p.monto, 0),
          totalCajetillas: productos.reduce((s, p) => s + p.cajetillas, 0),
        });
      });
    });
    return resultado;
  }, [ventasAgrupadas, ventasEnModoTotal]);

  const hayNuevasPrioritarias = tab === "prioritario" && nuevasClaves.size > 0;

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
      `Total de la venta: ${money(ticket.totalMonto)}`,
      "",
      ...(venta.esOtc
        ? [
            "Desglose (solo IVA, sin distribución):",
            `  Subtotal: ${money(subtotalProducto)}`,
            `  IVA (16%): ${money(ivaProducto)}`,
            `  Precio sin IVA: ${money(precioProductoNeto)}`,
          ]
        : [
            "Distribución:",
            `  Bruta (cajetillas × $${COSTO_DISTRIBUCION_UNITARIO}): ${money(distribucionBruta)}`,
            `  IVA (16%): ${money(ivaDistribucion)}`,
            `  Neta: ${money(distribucionNeta)}`,
            "",
            "Producto (total − distribución):",
            `  Subtotal: ${money(subtotalProducto)}`,
            `  IVA (16%): ${money(ivaProducto)}`,
            `  Precio sin IVA: ${money(precioProductoNeto)}`,
          ]),
    ];
    return lineas.join("\n");
  }

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px 60px" }}>
      <style>{`
        @keyframes parpadeoAmarilloVenta {
          0%, 100% { background-color: rgba(255,215,0,0.12); box-shadow: 0 0 0 0 rgba(255,215,0,0.9); }
          50% { background-color: rgba(255,215,0,0.55); box-shadow: 0 0 0 8px rgba(255,215,0,0); }
        }
        .venta-nueva-prioritaria { animation: parpadeoAmarilloVenta 0.7s ease-in-out infinite; border: 2px solid #FFD700 !important; }
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
        <button className={tab === "prioritario" ? "btn" : "btn-ghost"} style={{ flex: 1, position: "relative" }} onClick={() => setTab("prioritario")}>
          <Star size={13} style={{ verticalAlign: "-2px" }} /> PRIORITARIO
          {nuevasClaves.size > 0 && (
            <span style={{ marginLeft: 6, background: "#FFD700", color: "#1A1300", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>
              {nuevasClaves.size}
            </span>
          )}
        </button>
        <button className={tab === "normal" ? "btn" : "btn-ghost"} style={{ flex: 1 }} onClick={() => setTab("normal")}>
          NORMAL
        </button>
      </div>

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
          {["ESPERA", "FACTURADO", "OBSERVACION"].map((e) => (
            <button
              key={e}
              onClick={() => setFiltroEstado(e)}
              style={{
                fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "8px 10px", cursor: "pointer",
                background: filtroEstado === e ? COLOR_ESTADO[e] : "transparent",
                color: filtroEstado === e ? "#0B1220" : COLOR_ESTADO[e],
                border: `1px solid ${COLOR_ESTADO[e]}`,
              }}
            >
              {e === "OBSERVACION" ? "OBSERVACIÓN" : e}
            </button>
          ))}
        </div>
        {hayNuevasPrioritarias && (
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
          No hay clientes {tab === "prioritario" ? "prioritarios" : "normales"} en estado {filtroEstado === "OBSERVACION" ? "OBSERVACIÓN" : filtroEstado} para este rango de fechas.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: "#9AA7BD" }}>{ventasAgrupadas.length} cliente{ventasAgrupadas.length === 1 ? "" : "s"} con venta en este rango</div>
          {ticketsParaMostrar.map((ticket) => {
            const venta = ticket.ventaOriginal;
            const esNueva = nuevasClaves.has(venta.clave);
            const productosTicket = ticket.productosTicket || ticket.productos;
            const { distribucionBruta, ivaDistribucion, distribucionNeta, subtotalProducto, ivaProducto, precioProductoNeto } = calcularDesglose(ticket.totalMonto, ticket.totalCajetillas);
            return (
              <div
                key={ticket.claveTicket}
                className={`card ${esNueva ? "venta-nueva-prioritaria" : ""}`}
                style={{ padding: 16 }}
                onClick={() => esNueva && quitarParpadeo(venta.clave)}
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
                      value={venta.formaPago || "EFECTIVO"}
                      onChange={(e) => cambiarFormaPago(venta, e.target.value)}
                      style={{ fontSize: 12, fontWeight: 700, color: COLOR_FORMA_PAGO[venta.formaPago] || "#E8EDF5", padding: "6px 8px" }}
                    >
                      <option value="EFECTIVO">EFECTIVO</option>
                      <option value="CREDITO">CRÉDITO</option>
                      <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                    </select>
                    <select
                      value={venta.estado || "ESPERA"}
                      onChange={(e) => cambiarEstado(venta, e.target.value)}
                      style={{ fontSize: 12, fontWeight: 700, color: COLOR_ESTADO[venta.estado] || "#E8EDF5", padding: "6px 8px" }}
                    >
                      <option value="ESPERA">ESPERA</option>
                      <option value="FACTURADO">FACTURADO</option>
                      <option value="OBSERVACION">OBSERVACIÓN</option>
                    </select>
                    {esNueva && <CheckCircle2 size={18} color="#FFD700" />}
                  </div>
                </div>

                {venta.estado === "OBSERVACION" && (
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

                {/* Módulo TICKET — monto ya sin costo de distribución (pero con IVA).
                    En vista "ticket total", la distribución aparece como una línea más
                    al final (para que se vea como parte del ticket completo). */}
                <div style={{ overflowX: "auto", marginBottom: 12 }}>
                  <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 6 }}>
                    {ticket.esVistaTotal ? "TICKET TOTAL" : "TICKET"}
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 420 }}>
                    <thead>
                      <tr style={{ color: "#9AA7BD", textAlign: "left" }}>
                        <th style={{ padding: "4px 8px 4px 0" }}>Código FA</th>
                        <th>Producto</th>
                        <th>Cajetillas</th>
                        <th>Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productosTicket.map((p, i) => {
                        const montoLinea = p.esDistribucion ? p.monto : montoTicketLinea(p.monto, p.cajetillas);
                        return (
                          <tr key={i} style={{ borderTop: "1px solid #1E2A42", fontStyle: p.esDistribucion ? "italic" : "normal" }}>
                            <td style={{ padding: "6px 8px 6px 0" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span className="mono" style={{ color: p.esDistribucion ? "#5AA9E6" : "#F2B134" }}>{p.articulo}</span>
                                {!p.esDistribucion && <BotonCopiar texto={p.articulo} etiqueta="" />}
                              </div>
                            </td>
                            <td style={{ color: p.esDistribucion ? "#5AA9E6" : "#E8EDF5" }}>{p.nombre}</td>
                            <td className="mono">{p.cajetillas == null ? "—" : num(p.cajetillas)}</td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span className="mono" style={{ color: p.esDistribucion ? "#5AA9E6" : undefined }}>{money(montoLinea)}</span>
                                <BotonCopiar texto={money(montoLinea)} etiqueta="" />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Total de la venta (de este ticket) */}
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
                      <div style={{ fontSize: 10, color: "#9AA7BD" }}>TOTAL{ticket.parteLabel ? ` (${ticket.parteLabel})` : " DE LA VENTA"}</div>
                      <BotonCopiar texto={money(ticket.totalMonto)} etiqueta="" />
                    </div>
                    <div className="mono" style={{ fontSize: 18, color: "#F2B134" }}>{money(ticket.totalMonto)}</div>
                  </div>
                </div>

                {/* Desglose: para OTC solo se descuenta IVA (sin distribución); para
                    productos normales se muestran los dos bloques (distribución + producto). */}
                <div style={{ border: "1px solid #2A3852", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div className="display" style={{ fontSize: 12, color: "#9AA7BD" }}>
                      {venta.esOtc ? "DESGLOSE (SOLO IVA, SIN DISTRIBUCIÓN)" : "DESGLOSE DE DISTRIBUCIÓN Y PRODUCTO"}
                    </div>
                    <BotonCopiar texto={textoParaCopiar(ticket)} etiqueta="Copiar todo" />
                  </div>

                  {venta.esOtc ? (
                    <div style={{ maxWidth: 260 }}>
                      <div style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#9AA7BD" }}>Subtotal</span> <span className="mono">{money(subtotalProducto)}</span>
                      </div>
                      <div style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#9AA7BD" }}>IVA (16%)</span> <span className="mono">{money(ivaProducto)}</span>
                      </div>
                      <div style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                        <span>Precio sin IVA</span> <span className="mono" style={{ color: "#3DDC97" }}>{money(precioProductoNeto)}</span>
                      </div>
                    </div>
                  ) : (
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 220px" }}>
                      <div style={{ fontSize: 11, color: "#5AA9E6", fontWeight: 700, marginBottom: 4 }}>DISTRIBUCIÓN ({num(ticket.totalCajetillas)} caj. × ${COSTO_DISTRIBUCION_UNITARIO})</div>
                      <div style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#9AA7BD" }}>Bruta</span> <span className="mono">{money(distribucionBruta)}</span>
                      </div>
                      <div style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#9AA7BD" }}>IVA (16%)</span> <span className="mono">{money(ivaDistribucion)}</span>
                      </div>
                      <div style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                        <span>Neta</span> <span className="mono" style={{ color: "#5AA9E6" }}>{money(distribucionNeta)}</span>
                      </div>
                    </div>

                    <div style={{ flex: "1 1 220px" }}>
                      <div style={{ fontSize: 11, color: "#3DDC97", fontWeight: 700, marginBottom: 4 }}>PRODUCTO (total − distribución)</div>
                      <div style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#9AA7BD" }}>Subtotal</span> <span className="mono">{money(subtotalProducto)}</span>
                      </div>
                      <div style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#9AA7BD" }}>IVA (16%)</span> <span className="mono">{money(ivaProducto)}</span>
                      </div>
                      <div style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                        <span>Precio sin IVA</span> <span className="mono" style={{ color: "#3DDC97" }}>{money(precioProductoNeto)}</span>
                      </div>
                    </div>
                  </div>
                  )}

                  {!venta.esOtc && (
                  <div style={{ fontSize: 10.5, color: "#5b6478", marginTop: 10, borderTop: "1px solid #1E2A42", paddingTop: 8 }}>
                    Comprobación: {money(precioProductoNeto)} + {money(ivaProducto)} + {money(distribucionNeta)} + {money(ivaDistribucion)} = {money(precioProductoNeto + ivaProducto + distribucionNeta + ivaDistribucion)} (debe ser igual al total: {money(ticket.totalMonto)})
                  </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
