// @ts-nocheck
import React, { useEffect, useRef, useState } from "react";
import { LogOut, RefreshCw, Star, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "../supabaseClient";

function hoyISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

const LLAVE_ULTIMA_VISTA = "facturas_admin_ultima_vista";

function money(n) {
  return (n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}
function unidades(n) {
  return `${Number(n || 0).toLocaleString("es-MX")} paq.`;
}

const COLOR_FORMA_PAGO = {
  EFECTIVO: "#3DDC97",
  CREDITO: "#F2B134",
  TRANSFERENCIA: "#5AA9E6",
};

/**
 * Pantalla exclusiva del usuario ADMIN. Solo muestra FACTURAS, con dos
 * pestañas: PRIORITARIO y NORMAL. En cuanto cae una venta nueva de un
 * cliente PRIORITARIO (llega por tiempo real desde Supabase), esa fila
 * empieza a parpadear en amarillo de forma insistente hasta que se marque
 * como vista.
 */
export default function FacturasAdminView({ onLogout }) {
  const [tab, setTab] = useState("prioritario");
  const [fechaDesde, setFechaDesde] = useState(hoyISO());
  const [fechaHasta, setFechaHasta] = useState(hoyISO());
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [nuevasIds, setNuevasIds] = useState(new Set());
  const ultimaVistaRef = useRef(null);

  useEffect(() => {
    try {
      ultimaVistaRef.current = localStorage.getItem(LLAVE_ULTIMA_VISTA);
    } catch (e) { /* ignorar */ }
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("ventas_facturas")
        .select("id, ruta, codigo_cliente, cliente, fecha, marca, paquetes, contado_monto, credito_monto, monto, forma_pago, prioridad, creado_en, actualizado_en")
        .eq("prioridad", tab === "prioritario")
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta)
        .order("creado_en", { ascending: false });
      if (err) throw err;
      setFilas(data || []);

      if (ultimaVistaRef.current) {
        const nuevas = new Set(
          (data || [])
            .filter((f) => f.prioridad && new Date(f.creado_en) > new Date(ultimaVistaRef.current))
            .map((f) => f.id)
        );
        setNuevasIds(nuevas);
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
  }, [tab, fechaDesde, fechaHasta]);

  // Tiempo real: cualquier venta nueva o actualizada que sea prioritaria
  // se agrega a la lista (si estamos en esa pestaña) y empieza a parpadear.
  useEffect(() => {
    const canal = supabase
      .channel("ventas_facturas_admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "ventas_facturas" }, (payload) => {
        const fila = payload.new;
        if (!fila) return;
        if (fila.prioridad) {
          setNuevasIds((s) => new Set(s).add(fila.id));
        }
        if ((fila.prioridad && tab === "prioritario") || (!fila.prioridad && tab === "normal")) {
          if (fila.fecha >= fechaDesde && fila.fecha <= fechaHasta) {
            setFilas((fs) => {
              const sinEsta = fs.filter((f) => f.id !== fila.id);
              return [fila, ...sinEsta];
            });
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fechaDesde, fechaHasta]);

  function marcarTodoVisto() {
    const ahora = new Date().toISOString();
    ultimaVistaRef.current = ahora;
    try { localStorage.setItem(LLAVE_ULTIMA_VISTA, ahora); } catch (e) { /* ignorar */ }
    setNuevasIds(new Set());
  }

  function quitarParpadeo(id) {
    setNuevasIds((s) => { const n = new Set(s); n.delete(id); return n; });
  }

  async function cambiarFormaPago(fila, nuevaFormaPago) {
    setFilas((fs) => fs.map((f) => (f.id === fila.id ? { ...f, forma_pago: nuevaFormaPago } : f)));
    const { error: err } = await supabase.from("ventas_facturas").update({ forma_pago: nuevaFormaPago }).eq("id", fila.id);
    if (err) {
      console.error("Error actualizando forma de pago:", err);
      alert("No se pudo actualizar la forma de pago: " + err.message);
      cargar();
    }
  }

  const hayNuevasPrioritarias = tab === "prioritario" && nuevasIds.size > 0;

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px 60px" }}>
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
          {nuevasIds.size > 0 && (
            <span style={{ marginLeft: 6, background: "#FFD700", color: "#1A1300", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>
              {nuevasIds.size}
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
      ) : filas.length === 0 ? (
        <div className="card" style={{ padding: 30, textAlign: "center", color: "#9AA7BD" }}>
          No hay ventas {tab === "prioritario" ? "prioritarias" : "normales"} para facturar en este rango de fechas.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filas.map((f) => {
            const esNueva = nuevasIds.has(f.id);
            return (
              <div
                key={f.id}
                className={`card ${esNueva ? "venta-nueva-prioritaria" : ""}`}
                style={{ padding: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", cursor: esNueva ? "pointer" : "default" }}
                onClick={() => esNueva && quitarParpadeo(f.id)}
                title={esNueva ? "Toca para marcar como vista" : undefined}
              >
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: "#E8EDF5", fontWeight: 700 }}>
                    <span className="mono" style={{ color: "#F2B134" }}>{f.codigo_cliente}</span>
                    {f.cliente ? ` · ${f.cliente}` : ""}
                  </div>
                  <div style={{ fontSize: 11, color: "#9AA7BD" }}>{f.ruta} · {f.fecha}</div>
                </div>
                <div style={{ minWidth: 90 }}>
                  <div style={{ fontSize: 10, color: "#9AA7BD" }}>MARCA</div>
                  <div style={{ fontSize: 13, color: "#E8EDF5" }}>{f.marca || "—"}</div>
                </div>
                <div style={{ minWidth: 80 }}>
                  <div style={{ fontSize: 10, color: "#9AA7BD" }}>PAQUETES</div>
                  <div className="mono" style={{ fontSize: 14 }}>{unidades(f.paquetes)}</div>
                </div>
                <div style={{ minWidth: 90 }}>
                  <div style={{ fontSize: 10, color: "#9AA7BD" }}>CONTADO</div>
                  <div className="mono" style={{ fontSize: 13 }}>{money(f.contado_monto)}</div>
                </div>
                <div style={{ minWidth: 90 }}>
                  <div style={{ fontSize: 10, color: "#9AA7BD" }}>CRÉDITO</div>
                  <div className="mono" style={{ fontSize: 13 }}>{money(f.credito_monto)}</div>
                </div>
                <div style={{ minWidth: 100 }}>
                  <div style={{ fontSize: 10, color: "#9AA7BD" }}>TOTAL</div>
                  <div className="mono" style={{ fontSize: 14, color: "#F2B134" }}>{money(f.monto)}</div>
                </div>
                <div style={{ minWidth: 140 }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ fontSize: 10, color: "#9AA7BD" }}>FORMA DE PAGO</div>
                  <select
                    value={f.forma_pago || "EFECTIVO"}
                    onChange={(e) => cambiarFormaPago(f, e.target.value)}
                    style={{
                      fontSize: 12, padding: "4px 6px", fontWeight: 700,
                      color: COLOR_FORMA_PAGO[f.forma_pago] || "#E8EDF5",
                      borderColor: COLOR_FORMA_PAGO[f.forma_pago] || "#2A3852",
                    }}
                  >
                    <option value="EFECTIVO">EFECTIVO</option>
                    <option value="CREDITO">CRÉDITO</option>
                    <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                  </select>
                </div>
                {esNueva && (
                  <CheckCircle2 size={18} color="#FFD700" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
