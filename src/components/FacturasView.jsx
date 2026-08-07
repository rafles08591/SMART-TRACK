// @ts-nocheck
import React, { useEffect, useState } from "react";
import { Plus, Trash2, Star, Ban, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "../supabaseClient";

function hoyISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

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
  const [guardando, setGuardando] = useState(false);

  const [fechaDesdeBorrar, setFechaDesdeBorrar] = useState("");
  const [fechaHastaBorrar, setFechaHastaBorrar] = useState("");
  const [borrandoRango, setBorrandoRango] = useState(false);
  const [mensajeBorrado, setMensajeBorrado] = useState("");

  async function cargarClientes() {
    setCargando(true);
    setError(null);
    try {
      let query = supabase
        .from("clientes_facturables")
        .select("id, ruta, codigo_cliente, cliente, prioridad, creado_por, creado_en")
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
        creado_por: identidad || null,
      });
      if (err) {
        if (err.code === "23505") {
          alert("Ese código de cliente ya está registrado en esta ruta.");
        } else {
          throw err;
        }
      } else {
        setCodigoNuevo("");
        setNombreNuevo("");
        setPrioridadNueva(false);
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

  return (
    <div>
      <div className="display" style={{ fontSize: 16, color: "#E8EDF5", marginBottom: 14 }}>FACTURAS</div>

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
          <button className="btn" disabled={guardando} onClick={agregarCliente}>
            <Plus size={14} style={{ verticalAlign: "-2px" }} /> {guardando ? "Guardando..." : "Agregar"}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "#5b6478", marginTop: 8, marginBottom: 0 }}>
          El cruce con las ventas se hace por el código (no importa si le faltan/sobran ceros a la izquierda). El nombre es solo para identificarlo más fácil en la lista.
        </p>
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
            return (
              <div key={c.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#E8EDF5", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span className="mono" style={{ color: "#F2B134" }}>{c.codigo_cliente}</span>
                    {c.cliente ? ` · ${c.cliente}` : ""}
                  </div>
                  {esGerente && verTodasLasRutas && (
                    <div style={{ fontSize: 11, color: "#9AA7BD" }}>{c.ruta}{nombres?.[c.ruta] ? ` · ${nombres[c.ruta]}` : ""}</div>
                  )}
                </div>

                <button
                  className={c.prioridad ? "btn" : "btn-ghost"}
                  style={{ fontSize: 11, background: c.prioridad ? "#F2B134" : undefined }}
                  onClick={() => cambiarPrioridad(c, !c.prioridad)}
                  title="Toca para cambiar entre prioritario / normal"
                >
                  <Star size={12} style={{ verticalAlign: "-2px" }} /> {c.prioridad ? "PRIORITARIO" : "Normal"}
                </button>

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
