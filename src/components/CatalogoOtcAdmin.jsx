// @ts-nocheck
// CatalogoOtcAdmin.jsx — Administra el catálogo propio (tabla catalogo_otc) que ven los clientes en /catalogo.html.
// Producto: foto, nombre, categoría, presentación, descripción, precio, promoción (% o precio fijo, mínimo de piezas, vigencia).
import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";

const CATEGORIAS_BASE = ["Cigarros", "Encendedores", "Vualá y dulces", "Bebidas", "Otros"];
const BUCKET = "catalogo_otc";
const vacio = () => ({ codigo: "", nombre: "", categoria: "Cigarros", presentacion: "", descripcion: "", precio: "", imagen_url: "", activo: true, destacado: false, orden: 100,
  descuento_pct: "", precio_promo: "", promo_min: 1, promo_lleva: "", promo_paga: "", promo_texto: "", promo_desde: "", promo_hasta: "" });
const money = (n) => "$" + (Math.round(Number(n) * 100) / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 });
const sinAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
const hoyMX = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const txt = (v) => String(v ?? "").trim();
const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));

// Promo de regalo tipo 11x10: lleva 11, paga 10
export const esRegalo = (p) => Number(p.promo_paga) > 0 && Number(p.promo_lleva) > Number(p.promo_paga);
export function promoVigente(p, hoy = hoyMX()) {
  if (!(Number(p.precio_promo) > 0 || Number(p.descuento_pct) > 0 || esRegalo(p))) return false;
  if (p.promo_desde && p.promo_desde > hoy) return false;
  if (p.promo_hasta && p.promo_hasta < hoy) return false;
  return true;
}
export const precioPromo = (p) => (Number(p.precio_promo) > 0 ? Number(p.precio_promo) : Math.round(Number(p.precio) * (1 - Number(p.descuento_pct) / 100) * 100) / 100);

// Reduce la foto (máx. 900 px, JPG) para que el catálogo cargue rápido con datos móviles
function comprimir(archivo) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const lado = 900, k = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo procesar la foto"))), "image/jpeg", 0.85);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => mal(new Error("Ese archivo no es una imagen"));
    img.src = URL.createObjectURL(archivo);
  });
}

function Vista({ p }) {
  const vig = promoVigente(p);
  const pp = vig ? precioPromo(p) : null;
  const min = Number(p.promo_min) || 1;
  return (
    <div style={{ width: 170, background: "#fff", borderRadius: 14, overflow: "hidden", color: "#1c1917", position: "relative", boxShadow: "0 4px 14px rgba(0,0,0,.25)" }}>
      {vig && <span style={{ position: "absolute", top: 6, left: 6, background: "#15803d", color: "#fff", fontWeight: 800, fontSize: 11, padding: "3px 7px", borderRadius: 7 }}>
        {esRegalo(p) ? `🎁 ${p.promo_lleva}x${p.promo_paga}` : Number(p.precio_promo) > 0 ? `-${Math.round((1 - p.precio_promo / p.precio) * 100)}%` : `-${p.descuento_pct}%`}</span>}
      <div style={{ aspectRatio: "1/1", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {p.imagen_url ? <img src={p.imagen_url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6 }} /> : <span style={{ color: "#d6d3d1", fontWeight: 900, fontSize: 26 }}>FOTO</span>}
      </div>
      <div style={{ padding: "8px 10px 10px" }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{p.nombre || "Nombre del producto"}</div>
        {p.presentacion && <div style={{ fontSize: 11, color: "#78716c" }}>{p.presentacion}</div>}
        {vig && p.promo_texto && <div style={{ fontSize: 10.5, fontWeight: 700, color: "#92400e", background: "#fef3c7", borderRadius: 5, padding: "1px 5px", display: "inline-block", marginTop: 3 }}>{p.promo_texto}</div>}
        <div style={{ marginTop: 6, display: "flex", gap: 5, alignItems: "baseline", flexWrap: "wrap" }}>
          {vig && esRegalo(p) ? (<><b style={{ fontSize: 16 }}>{money(p.precio)}</b>
            <span style={{ width: "100%", fontSize: 10.5, color: "#15803d", fontWeight: 700 }}>🎁 Por cada {p.promo_paga} te regalamos {p.promo_lleva - p.promo_paga}</span></>)
          : vig && min <= 1 ? (<><b style={{ color: "#15803d", fontSize: 16 }}>{money(pp)}</b><s style={{ fontSize: 11, color: "#78716c" }}>{money(p.precio)}</s></>)
            : <b style={{ fontSize: 16 }}>{Number(p.precio) > 0 ? money(p.precio) : "$—"}</b>}
          {vig && !esRegalo(p) && min > 1 && <span style={{ width: "100%", fontSize: 10.5, color: "#15803d", fontWeight: 700 }}>{min}+ pzs: {money(pp)} c/u</span>}
        </div>
      </div>
    </div>
  );
}

function Editor({ inicial, categorias, onGuardado, onCerrar }) {
  // lo que viene de la base puede traer null: se cambia por "" para que los campos de texto no truenen
  const limpio = Object.fromEntries(Object.entries(inicial || {}).filter(([, v]) => v != null));
  const [p, setP] = useState({ ...vacio(), ...limpio, precio: inicial.precio ?? "", descuento_pct: inicial.descuento_pct ?? "", precio_promo: inicial.precio_promo ?? "", promo_desde: inicial.promo_desde || "", promo_hasta: inicial.promo_hasta || "" });
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [tipoPromo, setTipoPromo] = useState(esRegalo(inicial) ? "regalo" : Number(inicial.precio_promo) > 0 ? "precio" : Number(inicial.descuento_pct) > 0 ? "pct" : "no");
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const inp = { width: "100%", boxSizing: "border-box", padding: "9px 10px", fontSize: 14 };
  const lab = { display: "block", fontSize: 12, color: "#9AA7BD", margin: "10px 0 4px" };

  async function subirFoto(e) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    setOcupado(true); setEstado("Subiendo foto…");
    try {
      const blob = await comprimir(f);
      const ruta = `${(p.codigo || p.nombre || "producto").replace(/[^\w-]+/g, "_").slice(0, 40)}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from(BUCKET).upload(ruta, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      set("imagen_url", supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl);
      setEstado("✅ Foto lista. No olvides Guardar.");
    } catch (err) { setEstado("❌ " + (err?.message || err)); }
    setOcupado(false);
  }

  async function guardar() {
    if (!txt(p.nombre)) return setEstado("⚠️ Falta el nombre.");
    if (p.activo && !(Number(p.precio) > 0)) return setEstado("⚠️ Para que salga en el catálogo necesita precio.");
    const fila = {
      codigo: txt(p.codigo).toUpperCase() || null, nombre: txt(p.nombre), categoria: txt(p.categoria) || "Otros",
      presentacion: txt(p.presentacion) || null, descripcion: txt(p.descripcion) || null, precio: num(p.precio),
      imagen_url: p.imagen_url || null, activo: !!p.activo, destacado: !!p.destacado, orden: Number(p.orden) || 100,
      descuento_pct: tipoPromo === "pct" ? num(p.descuento_pct) : null, precio_promo: tipoPromo === "precio" ? num(p.precio_promo) : null,
      promo_lleva: tipoPromo === "regalo" ? Math.floor(Number(p.promo_lleva)) || null : null,
      promo_paga: tipoPromo === "regalo" ? Math.floor(Number(p.promo_paga)) || null : null,
      promo_min: Math.max(1, Number(p.promo_min) || 1), promo_texto: tipoPromo === "no" ? null : txt(p.promo_texto) || null,
      promo_desde: tipoPromo === "no" ? null : p.promo_desde || null, promo_hasta: tipoPromo === "no" ? null : p.promo_hasta || null,
      actualizado_en: new Date().toISOString(),
    };
    if (fila.precio_promo && fila.precio && fila.precio_promo >= fila.precio) return setEstado("⚠️ El precio de promoción debe ser menor al normal.");
    if (fila.descuento_pct != null && (fila.descuento_pct <= 0 || fila.descuento_pct >= 100)) return setEstado("⚠️ El descuento va de 1 a 99 %.");
    if (tipoPromo === "regalo" && !(fila.promo_paga > 0 && fila.promo_lleva > fila.promo_paga)) return setEstado("⚠️ En la promo de regalo, lo que lleva debe ser mayor a lo que paga (ej. lleva 11, paga 10).");
    setOcupado(true); setEstado("Guardando…");
    const q = p.id ? supabase.from("catalogo_otc").update(fila).eq("id", p.id).select().single() : supabase.from("catalogo_otc").insert(fila).select().single();
    const { data, error } = await q;
    setOcupado(false);
    if (error) return setEstado("❌ " + (/duplicate|unique/i.test(error.message) ? "Ya existe otro producto con ese código." : error.message));
    onGuardado(data);
  }

  async function eliminar() {
    if (!p.id || !window.confirm(`¿Eliminar "${p.nombre}" del catálogo?`)) return;
    const { error } = await supabase.from("catalogo_otc").delete().eq("id", p.id);
    if (error) return setEstado("❌ " + error.message);
    onGuardado({ ...p, _borrado: true });
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 14, border: "1px solid #22d3ee55" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="display" style={{ fontSize: 14, color: "#E8EDF5" }}>{p.id ? "✏️ EDITAR PRODUCTO" : "➕ NUEVO PRODUCTO"}</div>
        <button onClick={onCerrar} style={{ background: "none", border: "none", color: "#9AA7BD", fontSize: 18, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 8 }}>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <label style={lab}>Nombre *</label>
          <input style={inp} value={p.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Marlboro Rojo" />
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}><label style={lab}>Código</label><input style={inp} value={p.codigo || ""} onChange={(e) => set("codigo", e.target.value)} placeholder="FA0144" /></div>
            <div style={{ flex: 1.4 }}><label style={lab}>Categoría</label>
              <input style={inp} list="cats-otc" value={p.categoria} onChange={(e) => set("categoria", e.target.value)} />
              <datalist id="cats-otc">{categorias.map((c) => <option key={c} value={c} />)}</datalist></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1.4 }}><label style={lab}>Presentación</label><input style={inp} value={p.presentacion || ""} onChange={(e) => set("presentacion", e.target.value)} placeholder="Cajetilla 20 / Cartón 10" /></div>
            <div style={{ flex: 1 }}><label style={lab}>Precio *</label><input style={inp} inputMode="decimal" value={p.precio} onChange={(e) => set("precio", e.target.value)} placeholder="0.00" /></div>
          </div>
          <label style={lab}>Descripción</label>
          <textarea style={{ ...inp, minHeight: 64 }} value={p.descripcion || ""} onChange={(e) => set("descripcion", e.target.value)} placeholder="Lo que el cliente debe saber (sabores, piezas por caja…)" />
          <label style={lab}>Foto</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label className="btn-ghost" style={{ fontSize: 13, cursor: "pointer" }}>📷 {p.imagen_url ? "Cambiar foto" : "Subir foto"}
              <input type="file" accept="image/*" onChange={subirFoto} style={{ display: "none" }} /></label>
            {p.imagen_url && <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => set("imagen_url", "")}>Quitar</button>}
          </div>

          <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "#0f172a", border: "1px solid #1E2A42" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#E8EDF5", marginBottom: 8 }}>🔥 Promoción</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[["no", "Sin promo"], ["pct", "% de descuento"], ["precio", "Precio especial"], ["regalo", "🎁 Producto de regalo"]].map(([k, l]) => (
                <button key={k} onClick={() => setTipoPromo(k)} style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  border: `1px solid ${tipoPromo === k ? "#22c55e" : "#1E2A42"}`, background: tipoPromo === k ? "#22c55e22" : "transparent", color: tipoPromo === k ? "#22c55e" : "#9AA7BD" }}>{l}</button>
              ))}
            </div>
            {tipoPromo !== "no" && (
              <>
                {tipoPromo === "regalo" ? (
                  <>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                      <div style={{ flex: 1 }}><label style={lab}>Lleva</label><input style={inp} inputMode="numeric" value={p.promo_lleva} onChange={(e) => set("promo_lleva", e.target.value)} placeholder="11" /></div>
                      <div style={{ paddingBottom: 10, color: "#9AA7BD", fontWeight: 800 }}>x</div>
                      <div style={{ flex: 1 }}><label style={lab}>Paga</label><input style={inp} inputMode="numeric" value={p.promo_paga} onChange={(e) => set("promo_paga", e.target.value)} placeholder="10" /></div>
                    </div>
                    {esRegalo(p) && <div style={{ fontSize: 12, color: "#22c55e", marginTop: 6 }}>🎁 Por cada {p.promo_paga} que compre se le regala{p.promo_lleva - p.promo_paga > 1 ? "n" : ""} {p.promo_lleva - p.promo_paga}. Ej.: pide {p.promo_paga * 2} → recibe {p.promo_lleva * 2} y paga {p.promo_paga * 2}.</div>}
                  </>
                ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  {tipoPromo === "pct"
                    ? <div style={{ flex: 1 }}><label style={lab}>Descuento %</label><input style={inp} inputMode="decimal" value={p.descuento_pct} onChange={(e) => set("descuento_pct", e.target.value)} placeholder="10" /></div>
                    : <div style={{ flex: 1 }}><label style={lab}>Precio en promo</label><input style={inp} inputMode="decimal" value={p.precio_promo} onChange={(e) => set("precio_promo", e.target.value)} placeholder="0.00" /></div>}
                  <div style={{ flex: 1 }}><label style={lab}>Desde cuántas piezas</label><input style={inp} inputMode="numeric" value={p.promo_min} onChange={(e) => set("promo_min", e.target.value)} /></div>
                </div>
                )}
                <label style={lab}>Texto de la promo (opcional)</label>
                <input style={inp} value={p.promo_texto || ""} onChange={(e) => set("promo_texto", e.target.value)} placeholder={tipoPromo === "regalo" ? "Llévate 11 y paga 10" : "Precio de lanzamiento"} />
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}><label style={lab}>Empieza</label><input type="date" style={inp} value={p.promo_desde} onChange={(e) => set("promo_desde", e.target.value)} /></div>
                  <div style={{ flex: 1 }}><label style={lab}>Termina</label><input type="date" style={inp} value={p.promo_hasta} onChange={(e) => set("promo_hasta", e.target.value)} /></div>
                </div>
                <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 6 }}>Sin fechas = vigente hasta que la quites. Al terminar, el precio regresa solo al normal.</div>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, fontSize: 13, color: "#E8EDF5" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!p.activo} onChange={(e) => set("activo", e.target.checked)} /> Visible en el catálogo</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!p.destacado} onChange={(e) => set("destacado", e.target.checked)} /> ⭐ Destacado</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>Orden <input style={{ ...inp, width: 64, padding: "5px 6px" }} inputMode="numeric" value={p.orden} onChange={(e) => set("orden", e.target.value)} /></label>
          </div>
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <div style={{ fontSize: 12, color: "#9AA7BD", margin: "10px 0 6px" }}>Así lo ve el cliente</div>
          <Vista p={{ ...p, descuento_pct: tipoPromo === "pct" ? p.descuento_pct : null, precio_promo: tipoPromo === "precio" ? p.precio_promo : null,
            promo_lleva: tipoPromo === "regalo" ? p.promo_lleva : null, promo_paga: tipoPromo === "regalo" ? p.promo_paga : null, promo_desde: tipoPromo === "no" ? null : p.promo_desde, promo_hasta: tipoPromo === "no" ? null : p.promo_hasta }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
        <button onClick={guardar} disabled={ocupado} style={{ padding: "10px 22px", borderRadius: 12, border: "none", fontWeight: 800, background: "#22c55e", color: "#04130a", opacity: ocupado ? 0.5 : 1, cursor: "pointer" }}>Guardar</button>
        {p.id && <button className="btn-ghost" style={{ fontSize: 13, color: "#f87171" }} onClick={eliminar}>Eliminar</button>}
        <span style={{ fontSize: 12.5, color: estado.startsWith("❌") || estado.startsWith("⚠️") ? "#f59e0b" : "#9AA7BD" }}>{estado}</span>
      </div>
    </div>
  );
}

export default function CatalogoOtcAdmin() {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState(null);
  const [buscar, setBuscar] = useState("");
  const [cat, setCat] = useState("todas");
  const [estado, setEstado] = useState("");

  async function cargar() {
    setCargando(true);
    const { data, error: err } = await supabase.from("catalogo_otc").select("*").order("categoria").order("orden").order("nombre");
    if (err) setError(/relation|does not exist|schema cache/i.test(err.message) ? "Falta crear la tabla en Supabase (archivo catalogo_otc.sql)." : err.message);
    else { setError(""); setLista(data || []); }
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  const categorias = useMemo(() => [...new Set([...CATEGORIAS_BASE, ...lista.map((p) => p.categoria).filter(Boolean)])], [lista]);
  const q = sinAcento(buscar);
  const visibles = lista.filter((p) => (cat === "todas" || p.categoria === cat) && (!q || sinAcento(`${p.nombre} ${p.codigo} ${p.presentacion}`).includes(q)));
  const activos = lista.filter((p) => p.activo && Number(p.precio) > 0).length;

  async function alternar(p) {
    if (!p.activo && !(Number(p.precio) > 0)) { setEditando(p); return; }
    const { error: err } = await supabase.from("catalogo_otc").update({ activo: !p.activo, actualizado_en: new Date().toISOString() }).eq("id", p.id);
    if (err) setEstado("❌ " + err.message);
    else setLista((l) => l.map((x) => (x.id === p.id ? { ...x, activo: !p.activo } : x)));
  }

  function guardado(p) {
    setLista((l) => (p._borrado ? l.filter((x) => x.id !== p.id) : l.some((x) => x.id === p.id) ? l.map((x) => (x.id === p.id ? p : x)) : [...l, p]));
    setEditando(null);
    setEstado(p._borrado ? "Producto eliminado." : `✅ ${p.nombre} guardado.`);
  }

  // Excel de precios: CODIGO · NOMBRE · CATEGORIA · PRESENTACION · PRECIO · DESCRIPCION (actualiza por código)
  async function subirExcel(e) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
      const enc = (filas[0] || []).map((h) => sinAcento(h).replace(/[^A-Z]/g, ""));
      const i = (n) => enc.findIndex((h) => h.startsWith(n));
      const [iC, iN, iCat, iP, iPr, iD] = [i("CODIGO"), i("NOMBRE"), i("CATEGORIA"), i("PRESENTACION"), i("PRECIO"), i("DESCRIPCION")];
      if (iC < 0 || iPr < 0) throw new Error("El Excel necesita al menos las columnas CODIGO y PRECIO.");
      const porCodigo = new Map(lista.filter((p) => p.codigo).map((p) => [p.codigo.toUpperCase(), p]));
      const nuevos = [], cambios = [];
      for (const r of filas.slice(1)) {
        const codigo = String(r[iC] || "").trim().toUpperCase();
        if (!codigo) continue;
        const precio = num(String(r[iPr]).replace(/[$,\s]/g, ""));
        const prev = porCodigo.get(codigo);
        const datos = { precio, actualizado_en: new Date().toISOString() };
        if (iN >= 0 && r[iN]) datos.nombre = String(r[iN]).trim();
        if (iCat >= 0 && r[iCat]) datos.categoria = String(r[iCat]).trim();
        if (iP >= 0 && r[iP]) datos.presentacion = String(r[iP]).trim();
        if (iD >= 0 && r[iD]) datos.descripcion = String(r[iD]).trim();
        if (prev) cambios.push({ id: prev.id, ...datos });
        else if (datos.nombre) nuevos.push({ codigo, categoria: "Otros", activo: false, ...datos });
      }
      setEstado(`Guardando ${cambios.length + nuevos.length} productos…`);
      for (const c of cambios) { const { id, ...d } = c; const { error: err } = await supabase.from("catalogo_otc").update(d).eq("id", id); if (err) throw err; }
      if (nuevos.length) { const { error: err } = await supabase.from("catalogo_otc").insert(nuevos); if (err) throw err; }
      setEstado(`✅ ${cambios.length} actualizados${nuevos.length ? ` y ${nuevos.length} nuevos (quedan ocultos hasta que les pongas foto y los actives)` : ""}.`);
      cargar();
    } catch (err) { setEstado("❌ " + (err?.message || err)); }
  }

  function plantilla() {
    const filas = [["CODIGO", "NOMBRE", "CATEGORIA", "PRESENTACION", "PRECIO", "DESCRIPCION"],
      ...lista.map((p) => [p.codigo || "", p.nombre, p.categoria, p.presentacion || "", p.precio ?? "", p.descripcion || ""])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), "Catalogo");
    XLSX.writeFile(wb, "CATALOGO_OTC_PRECIOS.xlsx");
  }

  return (
    <div>
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: "#9AA7BD", marginBottom: 10 }}>
          Este es el catálogo que ven los clientes (reemplaza al de Meta): <b style={{ color: "#E8EDF5" }}>{activos}</b> productos visibles de {lista.length}.
          Solo salen los que están <b>visibles</b> y tienen precio. Las promociones se aplican solas en las fechas que pongas.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => setEditando(vacio())}>➕ Nuevo producto</button>
          <a className="btn-ghost" style={{ fontSize: 13, textDecoration: "none" }} href="/catalogo.html" target="_blank" rel="noreferrer">👀 Ver catálogo</a>
          <button className="btn-ghost" style={{ fontSize: 13 }} onClick={plantilla}>⬇️ Excel de precios</button>
          <label className="btn-ghost" style={{ fontSize: 13, cursor: "pointer" }}>📤 Subir Excel de precios
            <input type="file" accept=".xlsx,.xls,.csv" onChange={subirExcel} style={{ display: "none" }} /></label>
        </div>
        {estado && <div style={{ fontSize: 12.5, marginTop: 8, color: estado.startsWith("❌") ? "#f87171" : "#9AA7BD" }}>{estado}</div>}
      </div>

      {editando && <Editor key={editando.id || "nuevo"} inicial={editando} categorias={categorias} onGuardado={guardado} onCerrar={() => setEditando(null)} />}
      {error && <div className="card" style={{ padding: 12, marginBottom: 12, color: "#f87171", fontSize: 13 }}>⚠️ {error}</div>}

      <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar producto o código…" style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {["todas", ...categorias].map((c) => (
          <button key={c} onClick={() => setCat(c)} style={{ padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${cat === c ? "#22d3ee" : "#1E2A42"}`, background: cat === c ? "#22d3ee22" : "transparent", color: cat === c ? "#22d3ee" : "#9AA7BD" }}>
            {c === "todas" ? "Todas" : c} ({c === "todas" ? lista.length : lista.filter((p) => p.categoria === c).length})
          </button>
        ))}
      </div>

      {cargando ? <div style={{ color: "#9AA7BD", fontSize: 13 }}>Cargando…</div> : visibles.map((p) => {
        const vig = promoVigente(p);
        return (
          <div key={p.id} className="card" style={{ padding: 10, marginBottom: 8, display: "flex", gap: 12, alignItems: "center", opacity: p.activo ? 1 : 0.55 }}>
            <div style={{ width: 54, height: 54, borderRadius: 10, background: "#fff", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {p.imagen_url ? <img src={p.imagen_url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 10, color: "#a8a29e", fontWeight: 800 }}>SIN FOTO</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: "#E8EDF5", fontSize: 14 }}>{p.nombre}{p.destacado ? " ⭐" : ""}</div>
              <div style={{ fontSize: 12, color: "#9AA7BD" }}>{[p.codigo, p.categoria, p.presentacion].filter(Boolean).join(" · ")}</div>
              <div style={{ fontSize: 13, marginTop: 2 }}>
                {Number(p.precio) > 0 ? <b style={{ color: "#E8EDF5" }}>{money(p.precio)}</b> : <span style={{ color: "#f59e0b" }}>sin precio</span>}
                {vig && esRegalo(p) && <span style={{ color: "#22c55e", fontWeight: 700 }}> · 🎁 {p.promo_lleva}x{p.promo_paga}</span>}
                {vig && !esRegalo(p) && <span style={{ color: "#22c55e", fontWeight: 700 }}> → {money(precioPromo(p))}{Number(p.promo_min) > 1 ? ` desde ${p.promo_min} pzs` : ""}</span>}
                {!vig && (Number(p.precio_promo) > 0 || Number(p.descuento_pct) > 0 || esRegalo(p)) && <span style={{ color: "#64748b" }}> · promo fuera de fecha</span>}
              </div>
            </div>
            <button onClick={() => alternar(p)} title={p.activo ? "Visible: toca para ocultar" : "Oculto: toca para mostrar"} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>{p.activo ? "🟢" : "⚪"}</button>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => { setEditando(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Editar</button>
          </div>
        );
      })}
    </div>
  );
}
