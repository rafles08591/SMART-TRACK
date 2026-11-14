// @ts-nocheck
/* =====================================================================
   SinVisitaPwstView — Clientes sin visita (fuente: PowerStreet)
   ---------------------------------------------------------------------
   Reemplaza al módulo viejo (Mesa de Control / Visitas NUR / clientes_ruta).
   Los datos los baja el ROBOT de PowerStreet del reporte
   "Reportes DZ → Indicadores → Vendedores → Clientes no Visitados por Vendedor"
   y los guarda en la tabla sin_visita_pwst (vía /api/sin-visita):
     · Hoy:    L–V a las 5 pm y 7 pm (ruta PM del día).
     · Semana: sábado desde las 3 pm cada hora (PM01–PM06, lunes a hoy).
     · Staff:  botón "Actualizar ahora" → el robot corre y manda al grupo.
   El vendedor ve solo su ruta; el staff ve todas.
===================================================================== */

import React, { useEffect, useMemo, useState } from "react";
import { MapPin, RefreshCw, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { NOMBRES } from "../constants";
import { supabase } from "../supabaseClient";

const T = {
  card: "#111C33", soft: "#0F1830", border: "#2A3852", ink: "#E8EDF5", muted: "#9AA7BD",
  primary: "#F2B134", ok: "#3DDC97", bad: "#FF6B6B", badSoft: "rgba(255,107,107,0.12)",
};

const hoyMX = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
function lunesDe(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  const dia = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dia === 0 ? 6 : dia - 1));
  return d.toISOString().slice(0, 10);
}
const fechaCorta = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const horaCorta = (ts) => (ts ? new Date(ts).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "numeric", minute: "2-digit" }) : "");
const nombreRuta = (r) => NOMBRES[`RUTA ${r}`] || NOMBRES[r] || "";

export default function SinVisitaPwstView({ rol, puesto, rutaPropia }) {
  const esVendedor = rol === "vendedor";
  const hoy = hoyMX();
  const lunes = lunesDe(hoy);
  const esSabado = new Date(`${hoy}T12:00:00Z`).getUTCDay() === 6;

  const [filas, setFilas] = useState(null);
  const [error, setError] = useState("");
  const [pestana, setPestana] = useState(esSabado ? "semana" : "dia");
  const [abierta, setAbierta] = useState(esVendedor ? rutaPropia : null);
  const [pidiendo, setPidiendo] = useState(false);
  const [aviso, setAviso] = useState("");

  async function cargar() {
    try {
      let q = supabase.from("sin_visita_pwst").select("*").gte("fecha", lunes).order("fecha", { ascending: false });
      if (esVendedor && rutaPropia) q = q.eq("ruta", rutaPropia);
      const { data, error: e } = await q;
      if (e) throw e;
      setFilas(data || []);
      setError("");
    } catch (e) {
      setError(`No se pudo leer la información de sin visita: ${e.message || e}`);
    }
  }

  useEffect(() => {
    cargar();
    let t = null;
    const canal = supabase
      .channel("sin_visita_pwst_cambios")
      .on("postgres_changes", { event: "*", schema: "public", table: "sin_visita_pwst" }, () => {
        clearTimeout(t);
        t = setTimeout(cargar, 1000);
      })
      .subscribe();
    const alVolver = () => { if (document.visibilityState === "visible") cargar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearTimeout(t); supabase.removeChannel(canal); document.removeEventListener("visibilitychange", alVolver); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lunes, rutaPropia]);

  // Lo más reciente de cada tipo: "dia" = el de HOY; "semana" = el último de esta semana
  const vista = useMemo(() => {
    const lista = (filas || []).filter((f) => f.tipo === pestana && (pestana === "semana" || f.fecha === hoy));
    const fecha = lista.map((f) => f.fecha).sort().pop() || null;
    const rutas = lista.filter((f) => f.fecha === fecha).sort((a, b) => (b.total || 0) - (a.total || 0) || a.ruta.localeCompare(b.ruta));
    const actualizado = rutas.map((f) => f.actualizado_en).filter(Boolean).sort().pop() || null;
    const total = rutas.reduce((s, f) => s + (f.total || 0), 0);
    return { fecha, rutas, actualizado, total, desde: rutas[0]?.desde, hasta: rutas[0]?.hasta, por: rutas[0]?.actualizado_por };
  }, [filas, pestana, hoy]);

  async function pedirActualizacion() {
    setPidiendo(true);
    setAviso("");
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch("/api/wa-disparar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.session?.access_token || ""}` },
        body: JSON.stringify({ tipo: "sin_visita" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || `Error ${r.status}`);
      setAviso(d.motivo || (d.enCola
        ? "🤖 El robot está terminando otra carga; en cuanto acabe baja las visitas y lo manda al grupo (unos 5–8 min)."
        : "🤖 Listo, el robot ya está entrando a PowerStreet. En unos 3–5 min se actualiza aquí y llega al grupo."));
    } catch (e) {
      setAviso(`⚠️ ${e.message || e}`);
    } finally {
      setPidiendo(false);
    }
  }

  const btnPestana = (id, txt) => (
    <button
      onClick={() => setPestana(id)}
      style={{
        padding: "8px 14px", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer",
        border: `1px solid ${pestana === id ? T.primary : T.border}`,
        background: pestana === id ? "rgba(242,177,52,0.14)" : "transparent", color: pestana === id ? T.primary : T.muted,
      }}
    >{txt}</button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="display" style={{ fontSize: 15, color: T.ink, display: "flex", alignItems: "center", gap: 8 }}>
              <MapPin size={16} color={T.primary} /> CLIENTES SIN VISITA
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
              Datos de PowerStreet · L–V 5 pm y 7 pm (ruta del día) · sábado desde las 3 pm cada hora (toda la semana)
            </div>
          </div>
          {!esVendedor && (
            <button className="btn" onClick={pedirActualizacion} disabled={pidiendo} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={14} className={pidiendo ? "spin" : ""} /> {pidiendo ? "Pidiendo…" : "Actualizar ahora y mandar al grupo"}
            </button>
          )}
        </div>
        {aviso && <div style={{ fontSize: 12.5, color: aviso.startsWith("⚠️") ? T.bad : T.ok, marginTop: 10 }}>{aviso}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {btnPestana("dia", "Hoy")}
          {btnPestana("semana", "Semana")}
        </div>
      </div>

      {error && <div className="card" style={{ padding: 14, color: T.bad, fontSize: 13 }}>{error}</div>}
      {!filas && !error && <div style={{ color: T.muted, fontSize: 13 }}>Cargando…</div>}

      {filas && !vista.fecha && (
        <div className="card" style={{ padding: 16, color: T.muted, fontSize: 13 }}>
          {pestana === "dia"
            ? "Todavía no hay datos de hoy. El robot los baja a las 5 pm y a las 7 pm (lunes a viernes)."
            : "Todavía no hay datos de la semana. El robot los baja el sábado desde las 3 pm."}
          {!esVendedor && " También puedes pedirlos ahora con el botón de arriba."}
        </div>
      )}

      {vista.fecha && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div className="card" style={{ padding: 14, flex: "1 1 160px" }}>
              <div style={{ fontSize: 11, color: T.muted }}>{pestana === "dia" ? "Sin visita hoy" : "Sin ninguna visita en la semana"}</div>
              <div className="mono display" style={{ fontSize: 24, color: vista.total ? T.bad : T.ok }}>{vista.total}</div>
            </div>
            <div className="card" style={{ padding: 14, flex: "2 1 220px" }}>
              <div style={{ fontSize: 11, color: T.muted }}>Periodo</div>
              <div style={{ fontSize: 13.5, color: T.ink, fontWeight: 700 }}>
                {vista.desde && vista.desde !== vista.hasta ? `${fechaCorta(vista.desde)} al ${fechaCorta(vista.hasta)}` : fechaCorta(vista.fecha)}
              </div>
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>
                Actualizado {horaCorta(vista.actualizado)}{vista.por && vista.por !== "robot" ? ` · pedido por ${vista.por.replace(/^staff: /, "")}` : " · robot"}
              </div>
            </div>
          </div>

          {vista.rutas.map((f) => {
            const open = abierta === f.ruta || vista.rutas.length === 1;
            const clientes = Array.isArray(f.clientes) ? f.clientes : [];
            return (
              <div key={f.ruta} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <button
                  onClick={() => setAbierta(open ? null : f.ruta)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", color: T.ink }}
                >
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{f.ruta}</div>
                    <div style={{ fontSize: 11.5, color: T.muted }}>{nombreRuta(f.ruta)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {clientes.length ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 5, color: T.bad, fontWeight: 800, fontSize: 14 }}>
                        <AlertTriangle size={14} /> {clientes.length} sin visita
                      </span>
                    ) : (
                      <span style={{ display: "flex", alignItems: "center", gap: 5, color: T.ok, fontWeight: 800, fontSize: 13 }}>
                        <CheckCircle2 size={14} /> todos visitados
                      </span>
                    )}
                    {clientes.length > 0 && (open ? <ChevronUp size={16} color={T.muted} /> : <ChevronDown size={16} color={T.muted} />)}
                  </div>
                </button>
                {open && clientes.length > 0 && (
                  <div style={{ padding: "0 14px 12px" }}>
                    {clientes.map((c, i) => (
                      <div key={`${c.cliente}-${i}`} style={{ borderTop: `1px solid ${T.border}`, padding: "9px 0", display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{c.nombre}</div>
                          <div style={{ fontSize: 11.5, color: T.muted }}>
                            {[c.cliente, c.direccion, c.colonia, c.municipio !== c.localidad ? c.localidad : null, c.municipio].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        {c.potencial && (
                          <span style={{ alignSelf: "center", fontSize: 11, fontWeight: 800, color: T.primary, border: `1px solid ${T.border}`, borderRadius: 8, padding: "2px 7px", flexShrink: 0 }}>{c.potencial}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
