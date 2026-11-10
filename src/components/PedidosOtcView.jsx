// @ts-nocheck
// PedidosOtcView.jsx — Pedidos OTC que llegan por WhatsApp (catálogo de Meta o chat con Paulina).
// Fuente de datos: Supabase (tablas pedidos_otc y clientes_otc) — ya no Google Sheets.
//
//   rol="vendedor"  → solo ve los pedidos de su ruta (rutaPropia = "J201") y los marca entregados.
//   rol="staff"     → ve todas las rutas, cambia estado, descarga Excel y administra la base de clientes.
import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import CatalogoOtcAdmin from "./CatalogoOtcAdmin";

const RUTAS = ["J201", "J202", "J203", "J204", "J205", "J206", "J207"];
const DIAS = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];
const ESTADOS = {
  nuevo: { label: "Nuevo", color: "#22d3ee" },
  entregado: { label: "Entregado", color: "#22c55e" },
  cancelado: { label: "Cancelado", color: "#64748b" },
};
const PERIODOS = [
  { key: "hoy", label: "Hoy", dias: 0 },
  { key: "7", label: "7 días", dias: 7 },
  { key: "30", label: "30 días", dias: 30 },
];

const sinAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
export function normTel(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.length === 10) d = "52" + d;
  if (d.startsWith("521") && d.length === 13) d = "52" + d.slice(3);
  return d;
}
export function normRuta(r) {
  const m = String(r || "").toUpperCase().match(/J\s*-?\s*(\d{3})|\b(\d{3})\b/);
  return m ? `J${m[1] || m[2]}` : String(r || "").trim().toUpperCase();
}
const normDia = (d) => {
  const x = sinAcento(d);
  return DIAS.find((n) => sinAcento(n) === x) || x;
};
const fechaHora = (iso) => new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const inicioPeriodo = (dias) => {
  const hoyMx = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }); // aaaa-mm-dd
  const d = new Date(`${hoyMx}T00:00:00-06:00`);
  d.setDate(d.getDate() - dias);
  return d.toISOString();
};

// Lee la hoja de clientes (la misma "base de datos OTC" de Google Sheets, descargada en Excel/CSV).
// Busca las columnas por nombre: TELEFONO, CODIGO/CLIENTE, NOMBRE, RUTA, DIA_DE_VISITA.
function leerClientes(filas) {
  if (!filas.length) return [];
  const enc = filas[0].map((h) => sinAcento(h).replace(/[^A-Z]/g, ""));
  // el primer nombre de la lista que exista gana (así "CODIGO DE CLIENTE" no se toma como el nombre)
  const col = (...nombres) => { for (const n of nombres) { const i = enc.findIndex((h) => h.includes(n)); if (i >= 0) return i; } return -1; };
  const iTel = col("TELEFONO", "CELULAR", "WHATSAPP", "TEL");
  const iCod = col("CODIGO", "NUMCLIENTE", "IDCLIENTE", "CLAVE");
  const iNom = col("NOMBRE", "NEGOCIO", "RAZON", "CLIENTE");
  const iRuta = col("RUTA");
  const iDia = col("DIADEVISITA", "DIAVISITA", "DIA");
  if (iTel < 0) throw new Error("No encontré la columna TELEFONO en el archivo.");
  const porTel = new Map();
  for (const f of filas.slice(1)) {
    const telefono = normTel(f[iTel]);
    if (telefono.length !== 12) continue;
    porTel.set(telefono, {
      telefono,
      codigo_cliente: iCod >= 0 && iCod !== iNom ? String(f[iCod] ?? "").trim() || null : null,
      nombre: iNom >= 0 ? String(f[iNom] ?? "").trim() || null : null,
      ruta: iRuta >= 0 ? normRuta(f[iRuta]) || null : null,
      dia_visita: iDia >= 0 ? normDia(f[iDia]) || null : null,
      activo: true,
      actualizado_en: new Date().toISOString(),
    });
  }
  return [...porTel.values()];
}

function Pill({ activo, onClick, children, color = "#22d3ee" }) {
  return (
    <button onClick={onClick}
      style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
        border: `1px solid ${activo ? color : "#1E2A42"}`, background: activo ? `${color}22` : "transparent", color: activo ? color : "#9AA7BD" }}>
      {children}
    </button>
  );
}

function TarjetaPedido({ p, puedeCambiar, onEstado, mostrarRuta }) {
  const est = ESTADOS[p.estado] || ESTADOS.nuevo;
  const productos = Array.isArray(p.productos) ? p.productos : [];
  const piezas = productos.reduce((s, x) => s + (Number(x.cantidad) || 0), 0);
  return (
    <div className="card" style={{ padding: 14, marginBottom: 10, borderLeft: `4px solid ${est.color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: "#E8EDF5", fontSize: 14 }}>
            {p.nombre || "Cliente sin registrar"}
            {p.codigo_cliente && <span style={{ color: "#9AA7BD", fontWeight: 600 }}> · {p.codigo_cliente}</span>}
          </div>
          <div style={{ fontSize: 12, color: "#9AA7BD", marginTop: 2 }}>
            {fechaHora(p.creado_en)} · {p.origen === "web" ? "🌐 Catálogo propio" : p.origen === "catálogo" ? "🛒 Catálogo Meta" : "💬 Chat"}
            {mostrarRuta && <> · <b style={{ color: "#E8EDF5" }}>{p.ruta || "sin ruta"}</b></>}
            {p.dia_visita && <> · visita {p.dia_visita.toLowerCase()}</>}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: est.color, border: `1px solid ${est.color}`, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>{est.label}</span>
      </div>

      <div style={{ marginTop: 10, fontSize: 13, color: "#E8EDF5" }}>
        {productos.length ? productos.map((x, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0", borderTop: i ? "1px dashed #1E2A42" : "none" }}>
            <span>{x.producto}{x.codigo && x.codigo !== x.producto ? <span style={{ color: "#64748b" }}> ({x.codigo})</span> : null}
              {x.precio ? <span style={{ color: x.promo ? "#22c55e" : "#64748b" }}> · ${x.precio}{x.promo ? " promo" : ""}</span> : null}</span>
            <b>{x.cantidad}</b>
          </div>
        )) : <div style={{ whiteSpace: "pre-wrap" }}>{p.texto}</div>}
        {productos.length > 1 && <div style={{ textAlign: "right", fontSize: 12, color: "#9AA7BD", marginTop: 4 }}>{piezas} piezas{p.total ? ` · $${Number(p.total).toLocaleString("es-MX")}` : ""}</div>}
      </div>

      {p.nota && <div style={{ marginTop: 8, fontSize: 12, color: "#f59e0b" }}>📝 {p.nota}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
        {p.telefono && (
          <a href={`https://wa.me/${p.telefono}`} target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: "#22c55e", textDecoration: "none", border: "1px solid #22c55e55", borderRadius: 10, padding: "6px 10px" }}>
            💬 {p.telefono.slice(2)}
          </a>
        )}
        {puedeCambiar && p.estado !== "entregado" && (
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => onEstado(p, "entregado")}>✅ Entregado</button>
        )}
        {puedeCambiar && p.estado !== "cancelado" && (
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => onEstado(p, "cancelado")}>✕ Cancelar</button>
        )}
        {puedeCambiar && p.estado !== "nuevo" && (
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => onEstado(p, "nuevo")}>↺ Regresar a nuevo</button>
        )}
        {p.actualizado_por && <span style={{ fontSize: 11, color: "#64748b" }}>por {p.actualizado_por}</span>}
      </div>
    </div>
  );
}

// Manda la plantilla oficial de WhatsApp (imagen + botón CATÁLOGO con su número registrado)
async function mandarInvitacion(telefono) {
  try {
    const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/otc", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
      body: JSON.stringify({ accion: "invitar", telefono }) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, error: j.error || `error ${r.status}` };
  } catch (e) { return { ok: false, error: e?.message || String(e) }; }
}

// El vendedor solo puede corregir SUS altas durante 10 minutos (Supabase también lo valida)
const MIN_CORREGIR = 10;
export function minutosParaCorregir(c, uid) {
  if (!c || !uid || c.creado_por !== uid || !c.creado_en) return 0;
  const quedan = MIN_CORREGIR - (Date.now() - new Date(c.creado_en).getTime()) / 60000;
  // tope de 10: si el reloj del celular está atrasado no debe mostrar más tiempo del real (Supabase manda con su hora)
  return quedan > 0 ? Math.min(MIN_CORREGIR, Math.ceil(quedan)) : 0;
}

// Formulario de alta / edición de un cliente. El teléfono es con lo que el cliente se identifica en el catálogo.
function FormCliente({ inicial, rutaFija, esVendedor, uid, onGuardado, onCerrar }) {
  const original = inicial?.telefono || null;
  const [c, setC] = useState({
    ruta: rutaFija || inicial?.ruta || "J201", codigo_cliente: inicial?.codigo_cliente || "", nombre: inicial?.nombre || "",
    telefono: original ? original.slice(2) : "", dia_visita: inicial?.dia_visita ? normDia(inicial.dia_visita) : "", activo: inicial ? inicial.activo !== false : true,
  });
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [invitar, setInvitar] = useState(true); // al dar de alta, mandarle la invitación con el catálogo
  const quedan = original && esVendedor ? minutosParaCorregir(inicial, uid) : null;
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const inp = { width: "100%", boxSizing: "border-box", padding: "9px 10px", fontSize: 14 };
  const lab = { display: "block", fontSize: 12, color: "#9AA7BD", margin: "10px 0 4px" };

  async function guardar() {
    const telefono = normTel(c.telefono);
    if (telefono.length !== 12) return setEstado("⚠️ El teléfono debe ser de 10 dígitos.");
    if (!c.nombre.trim()) return setEstado("⚠️ Falta el nombre del cliente.");
    if (original && esVendedor && !minutosParaCorregir(inicial, uid)) return setEstado("⚠️ Ya pasaron los 10 minutos para corregirlo. Pide a tu supervisor el cambio.");
    setOcupado(true); setEstado("Guardando…");
    try {
      if (telefono !== original) {
        const { data: ya } = await supabase.from("clientes_otc").select("nombre,ruta").eq("telefono", telefono).maybeSingle();
        if (ya) throw new Error(`Ese teléfono ya es de ${ya.nombre || "otro cliente"} (${ya.ruta || "sin ruta"}).`);
      }
      const fila = { telefono, ruta: normRuta(rutaFija || c.ruta), codigo_cliente: c.codigo_cliente.trim() || null, nombre: c.nombre.trim(),
        dia_visita: c.dia_visita || null, activo: !!c.activo, actualizado_en: new Date().toISOString() };
      const q = original
        ? supabase.from("clientes_otc").update(fila).eq("telefono", original).select().single()
        : supabase.from("clientes_otc").insert(fila).select().single();
      const { data, error } = await q;
      if (error) throw (/row-level security/i.test(error.message) || (original && error.code === "PGRST116")) ? new Error("No tienes permiso para cambiar este cliente (ya pasaron los 10 minutos).") : error;
      let aviso = "";
      if (!original && invitar) {
        setEstado("Mandando la invitación por WhatsApp…");
        const r = await mandarInvitacion(telefono);
        aviso = r.ok ? " 📩 Ya le llegó la invitación con el catálogo." : ` ⚠️ Se guardó, pero la invitación no salió: ${r.error}`;
        if (r.ok) data.invitado_en = new Date().toISOString();
      }
      if (!original && esVendedor) aviso += ` Tienes ${MIN_CORREGIR} min para corregirlo si hay un error.`;
      onGuardado(data, original, aviso);
    } catch (e) { setEstado("❌ " + (e?.message || e)); }
    setOcupado(false);
  }

  async function borrar() {
    if (!original || !window.confirm(`¿Quitar a ${inicial.nombre || "este cliente"} de la base?`)) return;
    const { error } = await supabase.from("clientes_otc").delete().eq("telefono", original);
    if (error) return setEstado("❌ " + error.message);
    onGuardado(null, original);
  }

  return (
    <div className="card" style={{ padding: 14, marginBottom: 12, border: "1px solid #a78bfa66" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="display" style={{ fontSize: 14, color: "#E8EDF5" }}>{original ? "✏️ CORREGIR CLIENTE" : "➕ NUEVO CLIENTE"}</div>
        <button onClick={onCerrar} style={{ background: "none", border: "none", color: "#9AA7BD", fontSize: 18, cursor: "pointer" }}>✕</button>
      </div>
      {quedan != null && <div style={{ fontSize: 12.5, color: "#f59e0b", marginTop: 6 }}>⏱️ Te quedan {quedan} min para corregirlo. Después ya no se puede editar.</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}><label style={lab}>Ruta</label>
          {rutaFija ? <input style={inp} value={normRuta(rutaFija)} disabled />
            : <select style={inp} value={normRuta(c.ruta)} onChange={(e) => set("ruta", e.target.value)}>{RUTAS.map((r) => <option key={r}>{r}</option>)}</select>}
        </div>
        <div style={{ flex: 1 }}><label style={lab}>Código de cliente</label><input style={inp} value={c.codigo_cliente} onChange={(e) => set("codigo_cliente", e.target.value)} placeholder="123456" /></div>
      </div>
      <label style={lab}>Nombre del cliente / negocio *</label>
      <input style={inp} value={c.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Abarrotes Lupita" />
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1.3 }}><label style={lab}>Teléfono WhatsApp (10 dígitos) *</label><input style={inp} inputMode="tel" value={c.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="3221234567" /></div>
        <div style={{ flex: 1 }}><label style={lab}>Día de visita</label>
          <select style={inp} value={c.dia_visita} onChange={(e) => set("dia_visita", e.target.value)}>
            <option value="">—</option>{DIAS.map((d) => <option key={d}>{d}</option>)}
          </select></div>
      </div>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "#E8EDF5", marginTop: 12 }}>
        <input type="checkbox" checked={c.activo} onChange={(e) => set("activo", e.target.checked)} /> Recibe la invitación un día antes de su visita
      </label>
      {!original && (
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "#E8EDF5", marginTop: 8 }}>
          <input type="checkbox" checked={invitar} onChange={(e) => setInvitar(e.target.checked)} /> 📩 Mandarle ahora el WhatsApp con el catálogo para su primer pedido
        </label>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
        <button onClick={guardar} disabled={ocupado} style={{ padding: "10px 22px", borderRadius: 12, border: "none", fontWeight: 800, background: "#22c55e", color: "#04130a", opacity: ocupado ? 0.5 : 1, cursor: "pointer" }}>Guardar</button>
        {original && !esVendedor && <button className="btn-ghost" style={{ fontSize: 13, color: "#f87171" }} onClick={borrar}>Quitar cliente</button>}
        <span style={{ fontSize: 12.5, color: estado.startsWith("❌") || estado.startsWith("⚠️") ? "#f59e0b" : "#9AA7BD" }}>{estado}</span>
      </div>
    </div>
  );
}

// Base de clientes. rutaFija = el vendedor solo ve y edita su ruta; sin rutaFija (staff) ve y edita todas.
function ClientesOtc({ rutaFija, puedeImportar }) {
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState("");
  const [buscar, setBuscar] = useState("");
  const [filtroRuta, setFiltroRuta] = useState("todas");
  const [editando, setEditando] = useState(null); // {} = nuevo, cliente = editar
  const esVendedor = !!rutaFija;
  const [uid, setUid] = useState(null);
  const [, setReloj] = useState(0);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data?.user?.id || null));
    const t = setInterval(() => setReloj((n) => n + 1), 30000); // para que el contador de 10 min se actualice
    return () => clearInterval(t);
  }, []);
  const puedeEditar = (c) => !esVendedor || minutosParaCorregir(c, uid) > 0;
  const [enviando, setEnviando] = useState(null);
  async function reenviar(c) {
    if (!window.confirm(`¿Mandarle a ${c.nombre || c.telefono} el WhatsApp con el catálogo?`)) return;
    setEnviando(c.telefono);
    const r = await mandarInvitacion(c.telefono);
    setEnviando(null);
    if (r.ok) { setClientes((l) => l.map((x) => (x.telefono === c.telefono ? { ...x, invitado_en: new Date().toISOString() } : x))); setEstado(`📩 Invitación enviada a ${c.nombre}.`); }
    else setEstado("❌ " + r.error);
  }

  async function cargar() {
    setCargando(true);
    let q = supabase.from("clientes_otc").select("*").order("ruta").order("nombre").limit(5000);
    if (rutaFija) q = q.eq("ruta", normRuta(rutaFija));
    const { data, error } = await q;
    if (error) setEstado("❌ " + (/relation|does not exist|schema cache/i.test(error.message) ? "Falta crear las tablas en Supabase (otc_pedidos.sql)." : error.message));
    else setClientes(data || []);
    setCargando(false);
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [rutaFija]);

  async function subir(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    try {
      setEstado("Leyendo archivo…");
      const wb = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
      const nuevos = leerClientes(filas);
      if (!nuevos.length) throw new Error("No encontré teléfonos válidos (10 dígitos).");
      setEstado(`Guardando ${nuevos.length} clientes…`);
      for (let i = 0; i < nuevos.length; i += 500) {
        const { error } = await supabase.from("clientes_otc").upsert(nuevos.slice(i, i + 500), { onConflict: "telefono" });
        if (error) throw error;
      }
      setEstado(`✅ ${nuevos.length} clientes cargados (los que ya estaban se actualizaron).`);
      cargar();
    } catch (err) {
      setEstado("❌ " + (err?.message || err));
    }
  }

  function guardado(cli, original, aviso = "") {
    setClientes((l) => {
      const sin = l.filter((x) => x.telefono !== original);
      return cli ? [...sin, cli].sort((a, b) => `${a.ruta}${a.nombre}`.localeCompare(`${b.ruta}${b.nombre}`)) : sin;
    });
    setEditando(null);
    setEstado(cli ? `✅ ${cli.nombre} guardado.${aviso}` : "Cliente quitado.");
  }

  const q = sinAcento(buscar);
  const visibles = clientes.filter((c) => (rutaFija || filtroRuta === "todas" || c.ruta === filtroRuta) && (!q || sinAcento(`${c.nombre} ${c.codigo_cliente} ${c.telefono} ${c.ruta}`).includes(q)));
  const porDia = DIAS.map((d) => [d, visibles.filter((c) => c.activo && normDia(c.dia_visita) === d).length]);

  return (
    <div>
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: "#9AA7BD", marginBottom: 10 }}>
          {rutaFija ? <>Tus clientes de la <b style={{ color: "#E8EDF5" }}>{normRuta(rutaFija)}</b>. </> : null}
          El cliente se identifica con el <b style={{ color: "#E8EDF5" }}>teléfono registrado aquí</b>: la invitación de WhatsApp le llega a ese número con el botón CATÁLOGO, y su pedido entra con su nombre, código y ruta.
          A los que tienen 🟢 les llega la invitación un día antes de su visita. Con 📩 se la mandas en ese momento.
          {esVendedor && <> Al dar de alta un cliente tienes <b style={{ color: "#E8EDF5" }}>10 minutos</b> para corregirlo; después solo tu supervisor puede cambiarlo.</>}
          {puedeImportar && <> También puedes subir un Excel con columnas <b>RUTA, CODIGO, NOMBRE, TELEFONO, DIA_DE_VISITA</b> (actualiza a los que ya existen).</>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => { setEditando({}); window.scrollTo({ top: 0, behavior: "smooth" }); }}>➕ Agregar cliente</button>
          {puedeImportar && (
            <label className="btn-ghost" style={{ fontSize: 13, cursor: "pointer" }}>
              📤 Subir Excel de clientes
              <input type="file" accept=".xlsx,.xls,.csv" onChange={subir} style={{ display: "none" }} />
            </label>
          )}
        </div>
        {estado && <div style={{ fontSize: 12.5, marginTop: 8, color: estado.startsWith("❌") ? "#f87171" : "#9AA7BD" }}>{estado}</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {porDia.map(([d, n]) => (
            <span key={d} style={{ fontSize: 11.5, color: "#9AA7BD", border: "1px solid #1E2A42", borderRadius: 8, padding: "3px 8px" }}>{d.slice(0, 3)} <b style={{ color: "#E8EDF5" }}>{n}</b></span>
          ))}
        </div>
      </div>

      {editando && <FormCliente key={editando.telefono || "nuevo"} inicial={editando.telefono ? editando : null} rutaFija={rutaFija} esVendedor={esVendedor} uid={uid} onGuardado={guardado} onCerrar={() => setEditando(null)} />}

      {!rutaFija && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {["todas", ...RUTAS].map((r) => (
            <Pill key={r} activo={filtroRuta === r} onClick={() => setFiltroRuta(r)} color="#a78bfa">
              {r === "todas" ? `Todas (${clientes.length})` : `${r} (${clientes.filter((c) => c.ruta === r).length})`}
            </Pill>
          ))}
        </div>
      )}
      <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar nombre, código o teléfono…"
        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, marginBottom: 10 }} />
      {cargando ? <div style={{ color: "#9AA7BD", fontSize: 13 }}>Cargando…</div> : !visibles.length ? (
        <div className="card" style={{ padding: 18, textAlign: "center", color: "#9AA7BD", fontSize: 13 }}>Todavía no hay clientes aquí. Toca ➕ Agregar cliente.</div>
      ) : (
        <>
          {visibles.slice(0, 300).map((c) => (
            <div key={c.telefono} className="card" style={{ padding: 10, marginBottom: 8, display: "flex", gap: 10, alignItems: "center", opacity: c.activo ? 1 : 0.5 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "#E8EDF5", fontSize: 14 }}>{c.nombre || "Sin nombre"}</div>
                <div style={{ fontSize: 12, color: "#9AA7BD" }}>
                  {[!rutaFija && c.ruta, c.codigo_cliente && `#${c.codigo_cliente}`, c.telefono.slice(2), c.dia_visita && c.dia_visita.toLowerCase()].filter(Boolean).join(" · ")}
                </div>
                {c.invitado_en && <div style={{ fontSize: 11, color: "#64748b" }}>📩 invitado {new Date(c.invitado_en).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</div>}
              </div>
              <span title={c.activo ? "Recibe la invitación" : "No recibe la invitación"}>{c.activo ? "🟢" : "⚪"}</span>
              <button className="btn-ghost" style={{ fontSize: 12 }} title="Mandarle el WhatsApp oficial con el catálogo" disabled={enviando === c.telefono} onClick={() => reenviar(c)}>{enviando === c.telefono ? "…" : "📩"}</button>
              {puedeEditar(c) && (
                <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => { setEditando(c); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  {esVendedor ? `Corregir · ${minutosParaCorregir(c, uid)} min` : "Editar"}
                </button>
              )}
            </div>
          ))}
          {visibles.length > 300 && <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>Mostrando 300 de {visibles.length}. Usa el buscador.</div>}
        </>
      )}
    </div>
  );
}

export default function PedidosOtcView({ rol = "vendedor", rutaPropia, identidad, puesto }) {
  const esStaff = rol === "staff";
  const miRuta = esStaff ? null : normRuta(rutaPropia);
  const [vista, setVista] = useState("pedidos");
  const [periodo, setPeriodo] = useState("7");
  const [filtroEstado, setFiltroEstado] = useState("nuevo");
  const [filtroRuta, setFiltroRuta] = useState("todas");
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  async function cargar(silencioso = false) {
    if (!silencioso) setCargando(true);
    const dias = PERIODOS.find((p) => p.key === periodo)?.dias ?? 7;
    let q = supabase.from("pedidos_otc").select("*").gte("creado_en", inicioPeriodo(dias)).order("creado_en", { ascending: false }).limit(1000);
    if (miRuta) q = q.eq("ruta", miRuta);
    const { data, error: err } = await q;
    if (err) setError(/relation|does not exist|schema cache/i.test(err.message) ? "Falta crear las tablas en Supabase (archivo otc_pedidos.sql)." : err.message);
    else { setError(""); setPedidos(data || []); }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    const t = setInterval(() => cargar(true), 60000); // revisa pedidos nuevos cada minuto
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, miRuta]);

  async function cambiarEstado(p, estado) {
    const cambio = { estado, actualizado_por: identidad || puesto || "SMART-TRACK", actualizado_en: new Date().toISOString() };
    setPedidos((l) => l.map((x) => (x.id === p.id ? { ...x, ...cambio } : x)));
    const { error: err } = await supabase.from("pedidos_otc").update(cambio).eq("id", p.id);
    if (err) { setError("No se pudo guardar: " + err.message); cargar(true); }
  }

  const visibles = useMemo(() => pedidos.filter((p) =>
    (filtroEstado === "todos" || p.estado === filtroEstado) &&
    (!esStaff || filtroRuta === "todas" || (filtroRuta === "sin" ? !p.ruta : p.ruta === filtroRuta))
  ), [pedidos, filtroEstado, filtroRuta, esStaff]);

  const conteo = (est) => pedidos.filter((p) => (est === "todos" || p.estado === est) && (!esStaff || filtroRuta === "todas" || (filtroRuta === "sin" ? !p.ruta : p.ruta === filtroRuta))).length;

  // Resumen por ruta (solo staff)
  const porRuta = useMemo(() => {
    const m = {};
    for (const p of pedidos) {
      const r = p.ruta || "sin";
      m[r] = m[r] || { nuevo: 0, total: 0 };
      m[r].total++;
      if (p.estado === "nuevo") m[r].nuevo++;
    }
    return m;
  }, [pedidos]);

  // Total de piezas por producto de los pedidos visibles (para cargar la unidad)
  const totalProductos = useMemo(() => {
    const m = new Map();
    for (const p of visibles) for (const x of p.productos || []) {
      const k = x.codigo || x.producto;
      const prev = m.get(k) || { producto: x.producto, codigo: x.codigo, cantidad: 0 };
      prev.cantidad += Number(x.cantidad) || 0;
      m.set(k, prev);
    }
    return [...m.values()].sort((a, b) => b.cantidad - a.cantidad);
  }, [visibles]);

  function descargarExcel() {
    const filas = [];
    for (const p of visibles) {
      const productos = p.productos?.length ? p.productos : [{ producto: p.texto, cantidad: "" }];
      for (const x of productos) filas.push({
        Fecha: fechaHora(p.creado_en), Ruta: p.ruta || "", "Día de visita": p.dia_visita || "", Código: p.codigo_cliente || "",
        Cliente: p.nombre || "", Teléfono: p.telefono || "", Origen: p.origen || "", "Código FA": x.codigo || "", Producto: x.producto || "",
        Cantidad: x.cantidad, Estado: ESTADOS[p.estado]?.label || p.estado,
      });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Pedidos OTC");
    XLSX.writeFile(wb, `PEDIDOS_OTC_${new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })}.xlsx`);
  }

  return (
    <div>
      <div className="display" style={{ fontSize: 16, color: "#E8EDF5", marginBottom: 4 }}>🛒 PEDIDOS OTC POR WHATSAPP</div>
      <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 12 }}>
        {esStaff ? "Todos los pedidos que levantó Paulina o que llegaron por el catálogo." : `Pedidos de tus clientes (${miRuta}). Márcalos como entregados cuando los surtas.`}
      </div>

      {(
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <Pill activo={vista === "pedidos"} onClick={() => setVista("pedidos")}>Pedidos</Pill>
          {esStaff && <Pill activo={vista === "catalogo"} onClick={() => setVista("catalogo")} color="#22c55e">Catálogo</Pill>}
          <Pill activo={vista === "clientes"} onClick={() => setVista("clientes")} color="#a78bfa">Clientes</Pill>
        </div>
      )}

      {vista === "catalogo" && esStaff ? <CatalogoOtcAdmin /> : vista === "clientes" ? <ClientesOtc rutaFija={esStaff ? null : miRuta} puedeImportar={esStaff} /> : (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {PERIODOS.map((p) => <Pill key={p.key} activo={periodo === p.key} onClick={() => setPeriodo(p.key)} color="#f59e0b">{p.label}</Pill>)}
            <button className="btn-ghost" style={{ fontSize: 12, marginLeft: "auto" }} onClick={() => cargar()}>↻ Actualizar</button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {["nuevo", "entregado", "cancelado", "todos"].map((e) => (
              <Pill key={e} activo={filtroEstado === e} onClick={() => setFiltroEstado(e)} color={ESTADOS[e]?.color || "#E8EDF5"}>
                {ESTADOS[e]?.label || "Todos"} ({conteo(e)})
              </Pill>
            ))}
          </div>

          {esStaff && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              <Pill activo={filtroRuta === "todas"} onClick={() => setFiltroRuta("todas")} color="#E8EDF5">Todas</Pill>
              {[...RUTAS, ...(porRuta.sin ? ["sin"] : [])].map((r) => (
                <Pill key={r} activo={filtroRuta === r} onClick={() => setFiltroRuta(r)}>
                  {r === "sin" ? "Sin ruta" : r}{porRuta[r]?.nuevo ? ` · ${porRuta[r].nuevo}🔔` : ""}
                </Pill>
              ))}
            </div>
          )}

          {error && <div className="card" style={{ padding: 12, marginBottom: 12, color: "#f87171", fontSize: 13 }}>⚠️ {error}</div>}

          {totalProductos.length > 0 && (
            <details className="card" style={{ padding: 12, marginBottom: 12 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, color: "#E8EDF5", fontWeight: 700 }}>📦 Total a cargar ({totalProductos.reduce((s, x) => s + x.cantidad, 0)} piezas)</summary>
              <div style={{ marginTop: 8, fontSize: 12.5 }}>
                {totalProductos.map((x) => (
                  <div key={x.codigo || x.producto} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderTop: "1px dashed #1E2A42" }}>
                    <span>{x.producto}{x.codigo && x.codigo !== x.producto ? <span style={{ color: "#64748b" }}> ({x.codigo})</span> : null}</span><b>{x.cantidad}</b>
                  </div>
                ))}
              </div>
            </details>
          )}

          {esStaff && visibles.length > 0 && (
            <button className="btn-ghost" style={{ fontSize: 12, marginBottom: 12 }} onClick={descargarExcel}>⬇️ Descargar Excel ({visibles.length})</button>
          )}

          {cargando ? <div style={{ color: "#9AA7BD", fontSize: 13 }}>Cargando pedidos…</div>
            : !visibles.length ? (
              <div className="card" style={{ padding: 20, textAlign: "center", color: "#9AA7BD", fontSize: 13 }}>
                {filtroEstado === "nuevo" ? "No hay pedidos pendientes. 🙌" : "No hay pedidos en este periodo."}
              </div>
            ) : visibles.map((p) => (
              <TarjetaPedido key={p.id} p={p} puedeCambiar mostrarRuta={esStaff} onEstado={cambiarEstado} />
            ))}
        </>
      )}
    </div>
  );
}
