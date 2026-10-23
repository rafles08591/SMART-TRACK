// @ts-nocheck
// AlmacenView.jsx — Módulo ALMACÉN de SMART-TRACK.
//   • Base de mínimos: catálogo fijo de productos con su mínimo (en PAQUETES) y cuántos
//     paquetes trae su cartón (columna Unidades). Se carga
//     desde Excel/CSV o se captura a mano y queda guardado; es la base de todo cálculo.
//   • Calcular pedido: se carga el reporte de existencias (Deposito, Codigo, Articulo,
//     Unidades, Saldo…) y se compara contra la base → pedido, menos el sugerido.
//   • Inventario: Cédula de conteo (manual, con switch discreto de chuki) y hoja de conteo ciego.
//   • Picking: se pega el picking por vendedor y llena solo la columna Picking de la cédula.
//   • Remisiones: fotos de la remisión → OCR → código FA escrito en la foto (RemisionesView.jsx).
//   • Pestaña "." (abajo a la derecha, casi invisible): fecha de los Excel que se descargan.
//
// Existencias: la parte entera del Saldo son PAQUETES (406.03 → 406 paq; el decimal son
// sueltos y cuentan como fracción según las Unidades del reporte).
// Pedido: se pide en múltiplos de MEDIO cartón (Unidades de la base / 2), al más cercano:
//   cartón 60 → faltan 40 → 30, faltan 70 → 60. Si el mínimo es menor a medio cartón, lo que falte.
//
// Se guarda en data.almacen:
//   base: { FA01001: { articulo, unidades (paq por cartón), minimo (paq) }, … }
//   baseActualizada: { fecha, quien }
//   sugeridos: { FA01001: paquetes }   ← se descuentan antes de redondear al cartón
//   ultimaCarga: { fecha, quien, filas: [...] }   ← último reporte de existencias
//   unidadPedido: "cajas" | "paquetes", umbralOcultar: número
//
// Props: data, persistFresco, puedeEditar (bool), quien (nombre de quien usa la pantalla)

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import RemisionesView from "./RemisionesView";

const hoyISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
// Vacío → null (para no confundir "sin capturar" con 0)
const num = (v) => {
  const s = String(v ?? "").replace(/[^\d.\-]/g, "");
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
// Al tocar una casilla se selecciona todo su contenido, para escribir encima sin borrar
const selTodo = (e) => {
  const t = e.target;
  setTimeout(() => { try { t.select(); } catch { /* algunos navegadores no dejan */ } }, 0);
};
const fmtFecha = (iso) => new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "short" });

// "406.03" con 10 paq/caja → { cajas: 406, paquetes: 3, totalPaq: 4063 }
function leerSaldo(saldo, unidades) {
  const s = String(saldo ?? "").trim();
  if (!s) return null;
  const neg = s.startsWith("-");
  const [ent, dec = ""] = s.replace("-", "").split(".");
  const cajas = Number(ent) || 0;
  const paquetes = dec ? Number(dec.length === 1 ? dec : dec.slice(0, 2)) || 0 : 0;
  const u = unidades || 1;
  const totalPaq = (cajas * u + paquetes) * (neg ? -1 : 1);
  return { cajas: neg ? -cajas : cajas, paquetes, totalPaq };
}

function columnas(filaEncabezado) {
  const enc = filaEncabezado.map(norm);
  const col = (...nombres) => enc.findIndex((h) => nombres.some((n) => h === n || h.startsWith(n)));
  return {
    dep: col("deposito"),
    cod: col("codigo", "fa", "clave", "sku"),
    art: col("articulo", "descripcion", "producto"),
    uni: col("unidades", "paq/caja", "paq por caja", "paquetes por caja", "paq x caja"),
    sal: col("saldo", "existencia"),
    min: col("minimo", "min"),
    // "Paquetes por caja" (Tabla de Conversiones). Si existe, es el cartón aunque haya columna "Unidades".
    ppc: col("paquetes por caja", "paq por caja", "paq x caja", "paquetes por carton", "paq por carton", "paq/caja", "paq/carton"),
  };
}

// Reporte de existencias → productos
function parsearExistencias(filas) {
  if (!filas.length) return { productos: [], error: "No hay datos." };
  const c = columnas(filas[0]);
  if (c.cod < 0 || c.sal < 0) return { productos: [], error: "No encontré las columnas Codigo y Saldo en la primera fila." };
  const productos = [];
  for (const f of filas.slice(1)) {
    const codigo = String(f[c.cod] ?? "").trim().toUpperCase();
    if (!codigo) continue;
    const unidades = num(f[c.uni]) || 10;
    const saldo = leerSaldo(f[c.sal], unidades);
    if (!saldo) continue;
    productos.push({
      deposito: c.dep >= 0 ? String(f[c.dep] ?? "").trim() : "",
      codigo,
      articulo: c.art >= 0 ? String(f[c.art] ?? "").trim() : "",
      unidades,
      saldoTexto: String(f[c.sal] ?? "").trim(),
      ...saldo,
    });
  }
  return { productos, error: productos.length ? null : "No encontré productos en el archivo." };
}

// Archivo de mínimos (o el mismo reporte de existencias para dar de alta productos)
function parsearBase(filas) {
  if (!filas.length) return { filas: [], error: "No hay datos." };
  const c = columnas(filas[0]);
  if (c.cod < 0) return { filas: [], error: "No encontré la columna del código (Codigo / FA) en la primera fila." };
  const out = [];
  for (const f of filas.slice(1)) {
    const codigo = String(f[c.cod] ?? "").trim().toUpperCase();
    if (!codigo) continue;
    out.push({
      codigo,
      articulo: c.art >= 0 ? String(f[c.art] ?? "").trim() : "",
      // En el reporte de existencias "Unidades" no es el cartón: solo se toma del archivo de mínimos
      unidades: c.ppc >= 0 && c.ppc !== c.uni ? num(f[c.ppc]) : c.uni >= 0 && c.sal < 0 ? num(f[c.uni]) : null,
      minimo: c.min >= 0 ? num(f[c.min]) : null,
    });
  }
  return { filas: out, traeMinimos: c.min >= 0, error: out.length ? null : "No encontré productos en el archivo." };
}

function textoAFilas(texto) {
  return String(texto || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.includes("\t") ? l.split("\t") : l.split(",")).map((c) => c.trim()));
}

async function archivoAFilas(file) {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
    return filas.filter((f) => f.some((c) => String(c).trim()));
  }
  return textoAFilas(await file.text());
}

// Excel sencillo (una tabla). Con ExcelJS lleva encabezado con fecha que solo se ve al imprimir;
// si no carga (sin internet), sale igual pero sin formato.
async function bajarExcel(filas, anchos, hoja, nombre, { titulo, fecha } = {}) {
  let ExcelJS = null;
  try { ExcelJS = await cargarExcelJS(); } catch { /* sin internet */ }
  if (!ExcelJS) {
    const ws = XLSX.utils.json_to_sheet(filas);
    ws["!cols"] = anchos.map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, hoja);
    XLSX.writeFile(wb, nombre);
    return;
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(hoja, {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: { paperSize: 1, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.7, bottom: 0.6, header: 0.3, footer: 0.3 } },
  });
  ws.pageSetup.printTitlesRow = "1:1";
  encabezadoImpresion(ws, titulo || hoja.toUpperCase(), fecha || hoyISO());
  const cols = Object.keys(filas[0] || {});
  ws.columns = cols.map((c, i) => ({ header: c, key: c, width: anchos[i] || 12 }));
  filas.forEach((f) => ws.addRow(f));
  const fino = { style: "thin", color: { argb: "FF000000" } };
  ws.eachRow((row, i) => {
    row.eachCell({ includeEmpty: true }, (c) => {
      c.border = { top: fino, left: fino, bottom: fino, right: fino };
      if (i === 1) {
        c.font = { bold: true };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
        c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      }
    });
  });
  await guardarWb(wb, nombre);
}

// Paquetes en existencia (406.03 → 406.3 si el reporte trae 10 unidades)
const existPaq = (p) => (p.enReporte ? (p.cajas || 0) + (p.paquetes || 0) / (p.unidades || 10) : 0);
const fmtExist = (p) => (p.enReporte ? `${p.cajas} paq${p.paquetes ? ` +${p.paquetes}` : ""}` : "0 paq");
const fmtN = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("es-MX", { maximumFractionDigits: 1 }));

// Redondea lo que falta al MEDIO cartón MÁS CERCANO (cartón de 60 → de 30 en 30; de 50 → de 25 en 25):
//   faltan 40 (cartón 60) → 30 · faltan 70 → 60 · faltan 95 (cartón 50) → 100.
// Si el mínimo es menor a medio cartón, se pide justo lo que falte.
function aCarton(falta, minimo, carton) {
  if (falta === null) return null;
  if (falta <= 0) return 0;
  const paso = carton ? carton / 2 : 0;
  if (!paso || minimo < paso) return Math.ceil(falta - 1e-9);
  return Math.round(falta / paso + 1e-9) * paso;
}

// La primera vez arma la base con lo que ya existía (mínimos + último reporte)
function baseInicial(alm) {
  if (alm.base) return alm.base;
  const base = {};
  for (const p of alm.ultimaCarga?.filas || []) base[p.codigo] = { articulo: p.articulo };
  for (const [cod, m] of Object.entries(alm.minimos || {})) {
    if (m === null || m === "" || !Number.isFinite(Number(m))) continue;
    base[cod] = { ...(base[cod] || {}), minimo: Number(m) };
  }
  return base;
}

export default function AlmacenView({ data, persistFresco, puedeEditar = true, quien = "" }) {
  const alm = data?.almacen || {};
  const [pestana, setPestana] = useState("pedido");
  // Fecha de los Excel (pestaña "." escondida abajo a la derecha). Si no se mueve, es la del día.
  const [fechaDoc, setFechaDoc] = useState(hoyISO());

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div>
          <div style={S.titulo}>📦 Almacén</div>
          <div style={S.sub}>Base de mínimos, existencias y pedido de surtido</div>
        </div>
      </div>
      <div style={S.tabs}>
        {[["base", "📋 Base de mínimos"], ["pedido", "🧮 Calcular pedido"], ["inventario", "📦 Inventario"], ["picking", "🚚 Picking"], ["remisiones", "🧾 Remisiones"]].map(([k, l]) => (
          <button key={k} onClick={() => setPestana(k)} style={pestana === k ? S.tabOn : S.tab}>{l}</button>
        ))}
      </div>
      {pestana === "base" && <BaseMinimos alm={alm} persistFresco={persistFresco} puedeEditar={puedeEditar} quien={quien} fechaDoc={fechaDoc} />}
      {pestana === "pedido" && (
        <CalcularPedido alm={alm} persistFresco={persistFresco} puedeEditar={puedeEditar} quien={quien} irABase={() => setPestana("base")} fechaDoc={fechaDoc} />
      )}
      {pestana === "inventario" && (
        <Inventario alm={alm} persistFresco={persistFresco} puedeEditar={puedeEditar} quien={quien} fechaDoc={fechaDoc}
          irABase={() => setPestana("base")} irAPicking={() => setPestana("picking")} />
      )}
      {pestana === "remisiones" && (
        <RemisionesView alm={alm} persistFresco={persistFresco} puedeEditar={puedeEditar} quien={quien} fechaDoc={fechaDoc} S={S} />
      )}
      {pestana === "picking" && (
        <Picking alm={alm} persistFresco={persistFresco} puedeEditar={puedeEditar} quien={quien} irAInventario={() => setPestana("inventario")} />
      )}
      {pestana === "fecha" && (
        <div style={{ ...S.card, maxWidth: 320 }}>
          <div style={S.lbl}>📅 Fecha de los Excel (si no la cambias, es la de hoy)</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input style={S.input} type="date" value={fechaDoc} onChange={(e) => setFechaDoc(e.target.value || hoyISO())} />
            {fechaDoc !== hoyISO() && <button style={S.btnMini} onClick={() => setFechaDoc(hoyISO())}>Hoy</button>}
          </div>
          <div style={S.nota}>Sale en el nombre del archivo, en la hoja y arriba al centro al imprimir (21/10/2026).</div>
        </div>
      )}
      {/* Pestaña escondida "." para cambiar la fecha de los Excel */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button onClick={() => setPestana(pestana === "fecha" ? "inventario" : "fecha")} aria-label="."
          style={{ border: "none", background: "transparent", color: fechaDoc !== hoyISO() ? "#64748b" : "#334155", cursor: "pointer", fontSize: 14, padding: "2px 8px", lineHeight: 1 }}>.</button>
      </div>
    </div>
  );
}

// Caja reutilizable: pegar texto o subir archivo
function Cargador({ placeholder, onFilas, setEstado, textoBoton = "Procesar texto" }) {
  const [texto, setTexto] = useState("");
  const fileRef = useRef(null);
  async function leerArchivo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try { onFilas(await archivoAFilas(file)); }
    catch (err) { setEstado("❌ No pude leer el archivo: " + (err?.message || err)); }
  }
  return (
    <>
      <textarea style={S.textarea} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={placeholder} />
      <div style={S.botones}>
        <button style={{ ...S.btnSec, borderStyle: "solid" }} onClick={() => fileRef.current?.click()}>📂 Subir archivo (Excel / CSV)</button>
        <button style={S.btnSec} onClick={() => { onFilas(textoAFilas(texto)); setTexto(""); }} disabled={!texto.trim()}>{textoBoton}</button>
        <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" style={{ display: "none" }} onChange={leerArchivo} />
      </div>
    </>
  );
}

// ─────────────────────────── BASE DE MÍNIMOS ───────────────────────────
function BaseMinimos({ alm, persistFresco, puedeEditar, quien, fechaDoc }) {
  const [base, setBase] = useState(() => baseInicial(alm));
  const [buscar, setBuscar] = useState("");
  const [soloSinMin, setSoloSinMin] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState("");

  useEffect(() => {
    if (sucio) return;
    setBase(baseInicial(alm));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alm]);

  const lista = useMemo(
    () => Object.entries(base).map(([codigo, b]) => ({ codigo, ...b })).sort((a, b) => a.codigo.localeCompare(b.codigo)),
    [base]
  );
  const conMin = lista.filter((p) => p.minimo !== null && p.minimo !== undefined).length;
  const visibles = lista.filter((p) => {
    if (soloSinMin && p.minimo !== null && p.minimo !== undefined) return false;
    if (buscar && !norm(`${p.codigo} ${p.articulo}`).includes(norm(buscar))) return false;
    return true;
  });

  function cargar(filas) {
    const r = parsearBase(filas);
    if (r.error) { setEstado("⚠️ " + r.error); return; }
    let nuevos = 0, mins = 0;
    setBase((prev) => {
      const n = { ...prev };
      for (const f of r.filas) {
        const ant = n[f.codigo] || {};
        if (!n[f.codigo]) nuevos++;
        const sig = { ...ant };
        if (f.articulo) sig.articulo = f.articulo;
        if (f.unidades) sig.unidades = f.unidades;
        if (f.minimo !== null) { sig.minimo = f.minimo; mins++; }
        n[f.codigo] = sig;
      }
      return n;
    });
    setSucio(true);
    setEstado(r.traeMinimos
      ? `✅ ${r.filas.length} productos leídos (${mins} con mínimo, ${nuevos} nuevos). Da clic en Guardar.`
      : `✅ ${r.filas.length} productos leídos (${nuevos} nuevos) — el archivo no traía columna "Minimo", captúralos abajo. Da clic en Guardar.`);

  }

  function setMinimo(codigo, valor) {
    const v = num(valor);
    setBase((b) => {
      const sig = { ...b[codigo] };
      if (v === null) delete sig.minimo; else sig.minimo = v;
      return { ...b, [codigo]: sig };
    });
    setSucio(true);
    setEstado("");
  }

  function quitar(codigo) {
    setBase((b) => { const n = { ...b }; delete n[codigo]; return n; });
    setSucio(true);
  }

  function descargarPlantilla() {
    const filas = (lista.length ? lista : [{ codigo: "FA01001", articulo: "MlbRed20CD", unidades: 10 }]).map((p) => ({
      "Codigo": p.codigo, "Articulo": p.articulo || "", "Unidades": p.unidades || "", "Minimo": p.minimo ?? "",
    }));
    bajarExcel(filas, [12, 26, 10, 10], "Minimos", `base_minimos_${fechaPuntos(fechaDoc)}.xlsx`, { titulo: "BASE DE MÍNIMOS", fecha: fechaDoc });
  }

  async function guardar() {
    setGuardando(true);
    setEstado("Guardando…");
    try {
      await persistFresco((fresca) => ({
        almacen: { ...(fresca.almacen || {}), base, baseActualizada: { fecha: new Date().toISOString(), quien } },
      }));
      setSucio(false);
      setEstado("✅ Base guardada. Ya la usa el cálculo del pedido.");
    } catch (err) {
      setEstado("❌ No se pudo guardar: " + (err?.message || err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      {puedeEditar && (
        <div style={S.card}>
          <div style={S.cardTitulo}>Cargar mínimos</div>
          <div style={S.nota}>
            Sube un Excel con las columnas <b>Codigo, Articulo, Unidades, Minimo</b>: el mínimo va en <b>paquetes</b> y
            Unidades es cuántos paquetes trae el <b>cartón</b> (50, 60, 70…).
            Lo más fácil: descarga la plantilla, llena la columna Minimo y vuélvela a subir.
            Solo se actualizan los productos que vengan en el archivo; los demás se quedan igual.
            También puedes subir el reporte de existencias para dar de alta productos nuevos.
          </div>
          <Cargador
            setEstado={setEstado}
            onFilas={cargar}
            textoBoton="Procesar texto pegado"
            placeholder={"Codigo,Articulo,Unidades,Minimo\nFA01001,MlbRed20CD,10,50\nFA01003,MlbRed14CD,10,30"}
          />
          <div style={S.botones}>
            <button style={S.btnExcel} onClick={descargarPlantilla}>⬇️ Descargar plantilla / base actual</button>
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.cardTitulo}>Base de mínimos</div>
        <div style={S.sub}>
          {alm.baseActualizada?.fecha
            ? `Guardada: ${fmtFecha(alm.baseActualizada.fecha)}${alm.baseActualizada.quien ? ` · ${alm.baseActualizada.quien}` : ""}`
            : "Todavía no se ha guardado la base."}
        </div>
        <div style={S.resumen}>
          <span>📦 <b>{lista.length}</b> productos</span>
          <span>✅ <b>{conMin}</b> con mínimo</span>
          {lista.length - conMin > 0 && <span style={{ color: "#f59e0b" }}>⚠️ {lista.length - conMin} sin mínimo</span>}
        </div>
        <div style={S.filtros}>
          <label style={{ ...S.campo, flex: 1, minWidth: 180 }}>
            <span style={S.lbl}>Buscar producto</span>
            <input style={S.input} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="FA01001 o MlbRed…" />
          </label>
          <button type="button" style={S.btnSec} onClick={() => setSoloSinMin((v) => !v)}>
            {soloSinMin ? "Ver todos" : "Ver solo sin mínimo"}
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={S.tabla}>
            <thead>
              <tr>
                <th style={S.th}>FA</th>
                <th style={S.th}>Descripción</th>
                <th style={S.thR}>Paq/cartón</th>
                <th style={S.thR}>Mínimo (paq)</th>
                {puedeEditar && <th style={S.th}></th>}
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.codigo} style={S.tr}>
                  <td style={S.td}>{p.codigo}</td>
                  <td style={S.td}>{p.articulo || <span style={{ color: "#64748b" }}>—</span>}</td>
                  <td style={{ ...S.tdR, color: p.unidades ? "#cbd5e1" : "#f59e0b" }}>{p.unidades || "¿?"}</td>
                  <td style={S.tdR}>
                    <input style={S.inputCelda} type="number" onFocus={selTodo} min={0} disabled={!puedeEditar} placeholder="—"
                      value={p.minimo ?? ""} onChange={(e) => setMinimo(p.codigo, e.target.value)} />
                  </td>
                  {puedeEditar && (
                    <td style={{ ...S.td, width: 30 }}>
                      <button title="Quitar de la base" onClick={() => quitar(p.codigo)} style={S.btnX}>✕</button>
                    </td>
                  )}
                </tr>
              ))}
              {!visibles.length && (
                <tr><td colSpan={5} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: 20 }}>
                  {lista.length ? "Sin resultados." : "La base está vacía: sube tu archivo de mínimos arriba."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {puedeEditar && (
          <div style={S.barra}>
            <button style={{ ...S.btnPrimario, opacity: sucio && !guardando ? 1 : 0.45 }} disabled={!sucio || guardando} onClick={guardar}>
              {guardando ? "Guardando…" : "Guardar base"}
            </button>
            <span style={{ fontSize: 12, color: sucio ? "#f59e0b" : "#94a3b8" }}>{sucio ? "Tienes cambios sin guardar" : estado}</span>
          </div>
        )}
        {!puedeEditar && estado && <div style={S.nota}>{estado}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────── CALCULAR PEDIDO ───────────────────────────
function CalcularPedido({ alm, persistFresco, puedeEditar, quien, irABase, fechaDoc }) {
  const base = useMemo(() => baseInicial(alm), [alm]);
  const [productos, setProductos] = useState(alm.ultimaCarga?.filas || []);
  const [fechaCarga, setFechaCarga] = useState(alm.ultimaCarga?.fecha || null);
  const [sugeridos, setSugeridos] = useState(alm.sugeridos || {});
  const [sugTodos, setSugTodos] = useState("");
  const [umbral, setUmbral] = useState(alm.umbralOcultar ?? 3);
  const [soloPedir, setSoloPedir] = useState(true);
  const [buscar, setBuscar] = useState("");
  const [sucio, setSucio] = useState(false);
  const [estado, setEstado] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (sucio) return;
    if (alm.ultimaCarga?.filas) { setProductos(alm.ultimaCarga.filas); setFechaCarga(alm.ultimaCarga.fecha || null); }
    setSugeridos(alm.sugeridos || {});
    setUmbral(alm.umbralOcultar ?? 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alm]);

  function cargar(filas) {
    const r = parsearExistencias(filas);
    if (r.error) { setEstado("⚠️ " + r.error); return; }
    setProductos(r.productos);
    setFechaCarga(new Date().toISOString());
    setSucio(true);
    setEstado(`✅ ${r.productos.length} productos en el reporte.`);
  }

  // Une existencias + base. Lo que tiene mínimo y no viene en el reporte cuenta con existencia 0.
  const calculados = useMemo(() => {
    const porCodigo = new Map(productos.map((p) => [p.codigo, { ...p, enReporte: true }]));
    for (const [codigo, b] of Object.entries(base)) {
      if (!porCodigo.has(codigo) && b.minimo !== null && b.minimo !== undefined) {
        porCodigo.set(codigo, { codigo, articulo: b.articulo || "", unidades: 10, cajas: 0, paquetes: 0, totalPaq: 0, enReporte: false });
      }
    }
    return [...porCodigo.values()].map((p) => {
      const b = base[p.codigo] || {};
      const articulo = p.articulo || b.articulo || "";
      const carton = b.unidades || null;              // paquetes por cartón (de la base)
      const minimo = b.minimo ?? null;                 // en paquetes
      const exist = existPaq(p);
      const falta = minimo === null ? null : Math.max(0, minimo - exist);
      const sugCj = sugeridos[p.codigo] ?? null;       // (nombre histórico) sugerido en paquetes
      const sug = sugCj === null ? 0 : sugCj;
      const calc = aCarton(falta, minimo, carton);                                     // sin sugerido
      const pedir = falta === null ? null : aCarton(Math.max(0, falta - sug), minimo, carton); // con sugerido
      return { ...p, articulo, carton, minCj: minimo, minMostrar: minimo, exist, falta, calc, sugCj, sug, pedir };
    }).sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [productos, base, sugeridos]);

  const u = Number(umbral) || 0;
  const vaAPedir = (p) => p.pedir !== null && p.pedir > 0 && p.pedir >= u;
  const visibles = calculados.filter((p) => {
    if (buscar && !norm(`${p.codigo} ${p.articulo}`).includes(norm(buscar))) return false;
    if (soloPedir) return vaAPedir(p);
    return true;
  });
  const aPedir = calculados.filter(vaAPedir);
  const ocultosChicos = calculados.filter((p) => p.pedir !== null && p.pedir > 0 && p.pedir < u).length;
  const sinMinimo = calculados.filter((p) => p.minCj === null).length;
  const totalBase = Object.keys(base).length;

  const aCajas = (v) => v; // todo va en paquetes

  function setSugerido(codigo, valor, uds) {
    const v = num(valor);
    setSugeridos((m) => {
      const n = { ...m };
      if (v === null) delete n[codigo]; else n[codigo] = aCajas(v, uds);
      return n;
    });
    setSucio(true);
    setEstado("");
  }

  function aplicarSugerido(soloVisibles) {
    const v = num(sugTodos);
    if (v === null || v < 0) { setEstado("Escribe un sugerido válido para aplicar."); return; }
    const lista = soloVisibles ? visibles : calculados;
    setSugeridos((m) => {
      const n = { ...m };
      for (const p of lista) n[p.codigo] = aCajas(v, p.unidades);
      return n;
    });
    setSucio(true);
    setEstado(`Sugerido de ${v} paq aplicado a ${lista.length} productos.`);
  }

  async function guardar() {
    setGuardando(true);
    setEstado("Guardando…");
    try {
      await persistFresco((fresca) => ({
        almacen: {
          ...(fresca.almacen || {}),
          sugeridos,
          umbralOcultar: Number(umbral) || 0,
          ultimaCarga: { fecha: fechaCarga || new Date().toISOString(), quien, filas: productos },
        },
      }));
      setSucio(false);
      setEstado("✅ Guardado.");
    } catch (err) {
      setEstado("❌ No se pudo guardar: " + (err?.message || err));
    } finally {
      setGuardando(false);
    }
  }

  function excelModificado() {
    if (!aPedir.length) { setEstado("No queda nada que pedir después de descontar el sugerido."); return; }
    bajarExcel(
      aPedir.map((p) => ({ "Código FA": p.codigo, "Cantidad": p.pedir, "Descripción": p.articulo })),
      [12, 10, 28], "Pedido", `pedido_modificado_${fechaPuntos(fechaDoc)}.xlsx`, { titulo: "PEDIDO DE SURTIDO", fecha: fechaDoc }
    );
  }
  function excelCalculado() {
    const lista = calculados.filter((p) => p.calc !== null && p.calc > 0 && p.calc >= u);
    if (!lista.length) { setEstado("No hay nada que pedir con los mínimos actuales."); return; }
    bajarExcel(
      lista.map((p) => ({ "Código FA": p.codigo, "Cantidad": p.calc, "Descripción": p.articulo })),
      [12, 10, 28], "Pedido", `pedido_calculado_${fechaPuntos(fechaDoc)}.xlsx`, { titulo: "PEDIDO DE SURTIDO (CALCULADO)", fecha: fechaDoc }
    );
  }

  return (
    <div>
      {totalBase === 0 && (
        <div style={{ ...S.card, borderColor: "#f59e0b66" }}>
          <div style={{ color: "#fbbf24", fontWeight: 700 }}>⚠️ Todavía no hay base de mínimos.</div>
          <div style={S.nota}>Primero carga los mínimos de cada producto; esa es la base para calcular el pedido.</div>
          <div><button style={S.btnExcel} onClick={irABase}>📋 Ir a Base de mínimos</button></div>
        </div>
      )}

      {/* 1. Existencias */}
      <div style={S.card}>
        <div style={S.cardTitulo}>1 · Cargar existencias</div>
        <div style={S.sub}>
          {fechaCarga ? `Reporte cargado: ${fmtFecha(fechaCarga)}${alm.ultimaCarga?.quien && !sucio ? ` · ${alm.ultimaCarga.quien}` : ""} · ${productos.length} productos` : "Todavía no se ha cargado ningún reporte."}
        </div>
        <Cargador
          setEstado={setEstado}
          onFilas={cargar}
          placeholder={"Pega aquí el reporte (con la fila de encabezados):\nDeposito,Codigo,Articulo,Unidades,Saldo,…\n2385 - ALMACEN CENTRAL VALLARTA,FA01001,MlbRed20CD,10,406.03,…"}
        />
        <div style={S.nota}>La existencia se toma en <b>paquetes</b> (parte entera del Saldo).</div>
      </div>

      {/* 2. Pedido */}
      {calculados.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitulo}>2 · Pedido</div>
          <div style={S.filtros}>
            <label style={S.campo}>
              <span style={S.lbl}>No pedir si son menos de</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input style={{ ...S.input, width: 70 }} type="number" onFocus={selTodo} min={0} value={umbral}
                  onChange={(e) => { setUmbral(e.target.value); setSucio(true); }} />
                <span style={S.sub}>paq</span>
              </div>
            </label>
            {puedeEditar && (
              <label style={S.campo}>
                <span style={S.lbl}>Sugerido del sistema</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input style={{ ...S.input, width: 70 }} type="number" onFocus={selTodo} min={0} value={sugTodos}
                    onChange={(e) => setSugTodos(e.target.value)} placeholder="0" />
                  <button type="button" style={S.btnMini} onClick={() => aplicarSugerido(false)}>Aplicar a todas</button>
                  {buscar && <button type="button" style={S.btnMini} onClick={() => aplicarSugerido(true)}>Solo a las filtradas ({visibles.length})</button>}
                  {Object.keys(sugeridos).length > 0 && (
                    <button type="button" style={{ ...S.btnMini, borderColor: "#f87171", color: "#f87171" }}
                      onClick={() => { setSugeridos({}); setSucio(true); }}>Borrar</button>
                  )}
                </div>
              </label>
            )}
          </div>
          <div style={S.filtros}>
            <label style={{ ...S.campo, flex: 1, minWidth: 180 }}>
              <span style={S.lbl}>Buscar producto</span>
              <input style={S.input} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="FA01001 o MlbRed…" />
            </label>
            <button type="button" style={S.btnSec} onClick={() => setSoloPedir((v) => !v)}>
              {soloPedir ? "Ver todos los productos" : "Ver solo lo que hay que pedir"}
            </button>
          </div>

          <div style={S.resumen}>
            <span>🛒 <b>{aPedir.length}</b> productos a pedir</span>
            {ocultosChicos > 0 && <span>🙈 {ocultosChicos} ocultos (menos de {u} paq)</span>}
            {sinMinimo > 0 && (
              <span style={{ color: "#f59e0b" }}>
                ⚠️ {sinMinimo} sin mínimo en la base{" "}
                <button style={{ ...S.btnMini, padding: "2px 8px" }} onClick={irABase}>capturar</button>
              </span>
            )}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={S.tabla}>
              <thead>
                <tr>
                  <th style={S.th}>FA</th>
                  <th style={S.th}>Descripción</th>
                  <th style={S.thR}>Existencia</th>
                  <th style={S.thR}>Mínimo</th>
                  <th style={S.thR}>Faltan</th>
                  <th style={S.thR}>Sugerido</th>
                  <th style={S.thR}>Pedido</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const chico = p.pedir !== null && p.pedir > 0 && p.pedir < u;
                  return (
                    <tr key={p.codigo} style={{ ...S.tr, opacity: chico ? 0.45 : 1 }}>
                      <td style={S.td}>{p.codigo}</td>
                      <td style={S.td}>
                        {p.articulo}
                        <div style={{ fontSize: 11, color: p.carton ? "#64748b" : "#f59e0b" }}>
                          {p.carton ? `cartón de ${p.carton}` : "sin cartón en la base"}{!p.enReporte ? " · no viene en el reporte" : ""}
                        </div>
                      </td>
                      <td style={{ ...S.tdR, whiteSpace: "nowrap" }}>{fmtExist(p)}</td>
                      <td style={{ ...S.tdR, color: p.minMostrar === null ? "#f59e0b" : "#cbd5e1" }}>{p.minMostrar === null ? "sin mín." : p.minMostrar}</td>
                      <td style={{ ...S.tdR, color: "#94a3b8" }}>{fmtN(p.falta)}</td>
                      <td style={S.tdR}>
                        <input style={S.inputCelda} type="number" onFocus={selTodo} min={0} disabled={!puedeEditar} placeholder="0"
                          value={p.sugCj === null ? "" : p.sug} onChange={(e) => setSugerido(p.codigo, e.target.value, p.unidades)} />
                      </td>
                      <td style={{ ...S.tdR, fontWeight: 800, fontSize: 15, color: p.pedir > 0 ? "#fbbf24" : "#64748b" }}>
                        {p.pedir === null ? "—" : p.pedir}
                        {p.pedir > 0 && p.carton && p.pedir % (p.carton / 2) === 0 && (
                          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>
                            {(p.pedir / p.carton).toLocaleString("es-MX", { maximumFractionDigits: 1 })} cartón{p.pedir / p.carton > 1 ? "es" : ""}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!visibles.length && (
                  <tr><td colSpan={7} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: 20 }}>
                    {soloPedir ? "No hay nada que pedir con los mínimos actuales." : "Sin resultados."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={S.nota}>
            Todo en <b>paquetes</b>. Pedido = (mínimo − existencia − sugerido), redondeado al <b>medio cartón más cercano</b>
            (cartón de 60 → de 30 en 30: faltan 40 → 30, faltan 70 → 60; cartón de 50: faltan 95 → 100). Si el mínimo es menor a medio cartón, se pide justo lo que falta.
          </div>

          <div style={S.barra}>
            {puedeEditar && (
              <button style={{ ...S.btnPrimario, opacity: sucio && !guardando ? 1 : 0.45 }} disabled={!sucio || guardando} onClick={guardar}>
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            )}
            <button style={{ ...S.btnSec, borderStyle: "solid" }} onClick={excelCalculado}>⬇️ Excel calculado</button>
            <button style={S.btnExcel} onClick={excelModificado}>⬇️ Exportar Excel modificado</button>
            <span style={{ fontSize: 12, color: sucio ? "#f59e0b" : "#94a3b8" }}>{sucio ? "Tienes cambios sin guardar" : estado}</span>
          </div>
        </div>
      )}
      {!calculados.length && estado && <div style={S.nota}>{estado}</div>}
    </div>
  );
}

// ─────────────────────────── INVENTARIO (Cédula de conteo) + PICKING ───────────────────────────
// PWST trae el saldo como PAQUETES.CAJETILLAS (2025.07 = 2025 paquetes y 7 cajetillas).
//   • Cédula de conteo: la llena a mano el almacenista y se compara contra PWST.
//     Un switch discreto (a la derecha) la llena sola con la "chuki": el saldo de PWST menos
//     el picking, desglosado en cajas / paquetes / cajetillas, para que cuadre exacto.
//   • Picking: se pega el reporte de picking por vendedor y su total por SKU (paquetes) llena
//     solo la columna Picking de la cédula.
// Se guarda en data.almacen.inventario:
//   { pwst: { fecha, quien, filas }, conteo: { FA: { cajas, paquetes, cajetillas } },
//     picking: { fecha, quien, filas: [{ vendedor, codigo, descripcion, cantidad }] },
//     clo, capacidad, conteoActualizado: { fecha, quien } }

const EXCELJS_URL = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
function cargarExcelJS() {
  if (typeof window !== "undefined" && window.ExcelJS) return Promise.resolve(window.ExcelJS);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = EXCELJS_URL;
    s.onload = () => (window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error("ExcelJS no cargó")));
    s.onerror = () => reject(new Error("No se pudo cargar el generador de Excel"));
    document.head.appendChild(s);
  });
}

const fechaPuntos = (iso) => (iso ? iso.split("-").reverse().join(".") : ""); // 2026-09-30 → 30.09.2026
const r3 = (v) => Math.round((Number(v) || 0) * 1000) / 1000;

// Encabezado que SOLO se ve al imprimir: únicamente la fecha, al centro, como "21/10/2026".
// eslint-disable-next-line no-unused-vars
function encabezadoImpresion(ws, _titulo, fecha) {
  const f = fecha ? fecha.split("-").reverse().join("/") : "";
  ws.headerFooter = { oddHeader: `&C&"Calibri"&8 ${f}`, evenHeader: `&C&"Calibri"&8 ${f}`, firstHeader: `&C&"Calibri"&8 ${f}` };
}

async function guardarWb(wb, archivo) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = archivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Picking pegado → filas { vendedor, codigo, descripcion, cantidad (paquetes) }
function parsearPicking(filas) {
  if (!filas.length) return { filas: [], error: "No hay datos." };
  const enc = filas[0].map(norm);
  const col = (...nombres) => enc.findIndex((h) => nombres.some((n) => h === n || h.startsWith(n)));
  const iVen = col("vendedor", "ruta"), iCod = col("codigo", "sku", "fa"), iDes = col("descripcion", "articulo", "producto");
  const iCant = col("cantidad", "total", "paquetes");
  if (iCod < 0 || iCant < 0) return { filas: [], error: "No encontré las columnas Codigo y Cantidad en la primera fila." };
  const out = [];
  for (const f of filas.slice(1)) {
    const codigo = String(f[iCod] ?? "").trim().toUpperCase();
    const cantidad = num(f[iCant]);
    if (!codigo || !cantidad) continue;
    out.push({
      vendedor: iVen >= 0 ? String(f[iVen] ?? "").replace(/\s+/g, " ").trim() : "",
      codigo,
      descripcion: iDes >= 0 ? String(f[iDes] ?? "").trim() : "",
      cantidad,
    });
  }
  return { filas: out, error: out.length ? null : "No encontré renglones de picking." };
}

const totalesPicking = (filas) => {
  const t = {};
  for (const f of filas || []) t[f.codigo] = (t[f.codigo] || 0) + (Number(f.cantidad) || 0);
  return t;
};

// Diferencia en cajetillas → "+1 paq 3 caj"
function fmtDif(cajetillas, cpp) {
  if (!cajetillas) return "0";
  const signo = cajetillas > 0 ? "+" : "−";
  const a = Math.abs(Math.round(cajetillas));
  const paq = Math.floor(a / cpp), caj = a % cpp;
  return `${signo}${paq ? `${paq} paq` : ""}${paq && caj ? " " : ""}${caj ? `${caj} caj` : ""}`;
}

// Arma las filas del inventario (PWST + base + conteo + picking)
function filasInventario({ pwst, base, conteo, picking }) {
  const pick = totalesPicking(picking?.filas);
  const porCod = new Map();
  for (const p of pwst?.filas || []) {
    porCod.set(p.codigo, {
      codigo: p.codigo, articulo: p.articulo, cpp: p.unidades || 10,
      saldoNum: Number(String(p.saldoTexto || "").replace(/,/g, "")) || 0,
      pwPaq: p.cajas || 0, pwCaj: p.paquetes || 0,
    });
  }
  const vacio = (codigo) => ({ codigo, articulo: base[codigo]?.articulo || "", cpp: 10, saldoNum: 0, pwPaq: 0, pwCaj: 0 });
  for (const codigo of Object.keys(base)) if (!porCod.has(codigo)) porCod.set(codigo, vacio(codigo));
  for (const codigo of Object.keys(conteo || {})) if (!porCod.has(codigo)) porCod.set(codigo, vacio(codigo));
  for (const codigo of Object.keys(pick)) if (!porCod.has(codigo) && base[codigo]) porCod.set(codigo, vacio(codigo));

  return [...porCod.values()]
    .filter((x) => x.saldoNum !== 0 || base[x.codigo] || conteo?.[x.codigo])
    .map((x) => {
      const ppc = base[x.codigo]?.unidades || 0; // paquetes por caja
      const articulo = x.articulo || base[x.codigo]?.articulo || "";
      const picking = r3(pick[x.codigo] || 0);
      const pwstCaj = x.pwPaq * x.cpp + x.pwCaj;
      // Chuki: (saldo − picking) desglosado
      const resto = Math.max(0, x.pwPaq - Math.floor(picking));
      const chuki = { cajas: ppc ? Math.floor(resto / ppc) : 0, paquetes: ppc ? resto % ppc : resto, cajetillas: x.pwCaj };
      const c = conteo?.[x.codigo] || {};
      const capturado = ["cajas", "paquetes", "cajetillas"].some((k) => c[k] !== undefined && c[k] !== null && c[k] !== "");
      const cedula = { cajas: c.cajas ?? "", paquetes: c.paquetes ?? "", cajetillas: c.cajetillas ?? "" };
      return { ...x, articulo, ppc, picking, pwstCaj, chuki, cedula, capturado };
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

// Calcula físico y diferencia de una fila con la captura indicada
function evaluar(f, cap, contado) {
  const v = (k) => Number(cap[k]) || 0;
  const fisCaj = (v("cajas") * f.ppc + v("paquetes") + f.picking) * f.cpp + v("cajetillas");
  return {
    contado,
    fisicoExcel: r3(v("cajas") * f.ppc + v("paquetes") + v("cajetillas") / 100 + f.picking),
    difCaj: contado ? Math.round(fisCaj - f.pwstCaj) : null,
  };
}

function Inventario({ alm, persistFresco, puedeEditar, quien, irABase, irAPicking, fechaDoc }) {
  const inv = alm.inventario || {};
  const base = useMemo(() => baseInicial(alm), [alm]);
  const [pwst, setPwst] = useState(inv.pwst || alm.ultimaCarga || null);
  const [conteo, setConteo] = useState(inv.conteo || {});
  const [clo, setClo] = useState(inv.clo || "VALLARTA");
  const [capacidad, setCapacidad] = useState(inv.capacidad ?? 17280);
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState("todos"); // todos | diferencia | sin_contar
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState("");
  const [confirmarNuevo, setConfirmarNuevo] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [chuki, setChuki] = useState(false); // switch discreto: llena la cédula sola para que cuadre

  useEffect(() => {
    if (sucio) return;
    const i = alm.inventario || {};
    setPwst(i.pwst || alm.ultimaCarga || null);
    setConteo(i.conteo || {});
    setClo(i.clo || "VALLARTA");
    setCapacidad(i.capacidad ?? 17280);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alm]);

  // Respaldo local de la cédula mientras se captura (por si se cierra la app sin guardar)
  const LS = "st_almacen_conteo_borrador";
  useEffect(() => {
    if (!sucio) return;
    try { localStorage.setItem(LS, JSON.stringify({ conteo, clo, capacidad, t: Date.now() })); } catch { /* sin storage */ }
  }, [conteo, clo, capacidad, sucio]);
  useEffect(() => {
    try {
      const b = JSON.parse(localStorage.getItem(LS) || "null");
      const guardado = alm.inventario?.conteoActualizado?.fecha ? Date.parse(alm.inventario.conteoActualizado.fecha) : 0;
      if (b && b.t > guardado && Object.keys(b.conteo || {}).length) {
        setConteo(b.conteo); setClo(b.clo || "VALLARTA"); setCapacidad(b.capacidad ?? 17280);
        setSucio(true);
        setEstado("↩️ Recuperé una captura que no se había guardado. Revísala y da Guardar.");
      }
    } catch { /* nada */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cargarPwst(filas) {
    const r = parsearExistencias(filas);
    if (r.error) { setEstado("⚠️ " + r.error); return; }
    setPwst({ fecha: new Date().toISOString(), quien, filas: r.productos });
    setSucio(true);
    setEstado(`✅ Inventario PWST cargado: ${r.productos.length} productos. Da Guardar.`);
  }

  const picking = inv.picking || null;
  const filas = useMemo(() => filasInventario({ pwst, base, conteo, picking }).map((f) => {
    const cap = chuki ? f.chuki : f.cedula;
    return { ...f, cap, ...evaluar(f, cap, chuki || f.capturado) };
  }), [pwst, base, conteo, picking, chuki]);

  const sinCarton = filas.filter((f) => !f.ppc).length;
  const contados = filas.filter((f) => f.contado).length;
  const conDif = filas.filter((f) => f.contado && f.difCaj !== 0);
  const totalPwstPaq = r3(filas.reduce((s, f) => s + f.saldoNum, 0));
  const totalPicking = r3(filas.reduce((s, f) => s + f.picking, 0));
  const difTotalExcel = r3(filas.reduce((s, f) => s + (f.contado ? f.fisicoExcel - f.saldoNum : 0), 0));
  const capPct = Number(capacidad) ? Math.round((totalPwstPaq / Number(capacidad)) * 100) : null;

  const visibles = filas.filter((f) => {
    if (buscar && !norm(`${f.codigo} ${f.articulo}`).includes(norm(buscar))) return false;
    if (filtro === "diferencia") return f.contado && f.difCaj !== 0;
    if (filtro === "sin_contar") return !f.contado;
    return true;
  });

  function setCampo(codigo, campo, valor) {
    const v = valor === "" ? "" : Math.max(0, Number(valor));
    setConteo((m) => {
      const fila = { ...(m[codigo] || {}) };
      if (v === "" || !Number.isFinite(v)) delete fila[campo]; else fila[campo] = v;
      const n = { ...m };
      if (Object.keys(fila).length) n[codigo] = fila; else delete n[codigo];
      return n;
    });
    setSucio(true);
    setEstado("");
  }

  async function guardar() {
    setGuardando(true);
    setEstado("Guardando…");
    try {
      await persistFresco((fresca) => ({
        almacen: {
          ...(fresca.almacen || {}),
          inventario: {
            ...((fresca.almacen || {}).inventario || {}),
            pwst, conteo, clo, capacidad: Number(capacidad) || 0,
            conteoActualizado: { fecha: new Date().toISOString(), quien },
          },
        },
      }));
      setSucio(false);
      try { localStorage.removeItem(LS); } catch { /* nada */ }
      setEstado("✅ Guardado.");
    } catch (err) {
      setEstado("❌ No se pudo guardar: " + (err?.message || err));
    } finally {
      setGuardando(false);
    }
  }

  function nuevoConteo() {
    if (!confirmarNuevo) { setConfirmarNuevo(true); setTimeout(() => setConfirmarNuevo(false), 4000); return; }
    setConteo({});
    setConfirmarNuevo(false);
    setSucio(true);
    setEstado("🧹 Cédula en blanco. Captura el conteo y da Guardar.");
  }

  async function bajar(fn, msg) {
    setBajando(true);
    try { await fn(); setEstado(msg); }
    catch (err) { setEstado("❌ No se pudo generar el Excel: " + (err?.message || err)); }
    finally { setBajando(false); }
  }
  const descargarCedula = () => bajar(
    () => excelCedula({ filas, pwstFilas: pwst?.filas || [], picking, base, clo, fecha: fechaDoc, capacidad: Number(capacidad) || 0 }),
    "⬇️ Cédula de conteo descargada."
  );
  const descargarCiego = () => bajar(
    () => excelConteoCiego({ filas, lleno: chuki, clo, fecha: fechaDoc }),
    "⬇️ Hoja de conteo descargada."
  );

  return (
    <div>
      <div style={S.kpis}>
        <div style={S.kpi}><div style={S.kpiLbl}>CAPACIDAD ACTUAL</div><div style={S.kpiVal}>{capPct === null ? "—" : `${capPct}%`}</div></div>
        <div style={S.kpi}><div style={S.kpiLbl}>INVENTARIO TOTAL (PWST)</div><div style={S.kpiVal}>{fmtN(totalPwstPaq)} <span style={S.kpiUni}>paq</span></div></div>
        <div style={S.kpi}>
          <div style={S.kpiLbl}>DIFERENCIA</div>
          <div style={{ ...S.kpiVal, color: difTotalExcel !== 0 ? "#f87171" : "#4ade80" }}>{fmtN(difTotalExcel)}</div>
        </div>
        <div style={S.kpi}><div style={S.kpiLbl}>CONTADOS</div><div style={S.kpiVal}>{contados}<span style={S.kpiUni}> / {filas.length}</span></div></div>
      </div>

      {/* Inventario PWST */}
      <div style={S.card}>
        <div style={S.cardTitulo}>Inventario PWST</div>
        <div style={S.sub}>
          {pwst?.fecha ? `Reporte del ${fmtFecha(pwst.fecha)}${pwst.quien ? ` · ${pwst.quien}` : ""} · ${pwst.filas?.length || 0} productos` : "Sin reporte cargado."}
          {alm.ultimaCarga?.fecha && pwst?.fecha !== alm.ultimaCarga.fecha && puedeEditar && (
            <> · <button style={{ ...S.btnMini, padding: "2px 8px" }} onClick={() => { setPwst(alm.ultimaCarga); setSucio(true); }}>usar el de Calcular pedido ({fmtFecha(alm.ultimaCarga.fecha)})</button></>
          )}
        </div>
        {puedeEditar && (
          <Cargador setEstado={setEstado} onFilas={cargarPwst}
            placeholder={"Pega el reporte de inventario de PWST (con encabezados):\nDeposito,Codigo,Articulo,Unidades,Saldo\n2385 ( ALMACEN CENTRAL VALLARTA ),FA01001,MlbRed20CD,10,2025.07"} />
        )}
        <div style={S.nota}>El saldo de PWST se lee como <b>paquetes.cajetillas</b>: 2025.07 = 2025 paquetes y 7 cajetillas. Las cajas salen de "Paq/cartón" de la Base de mínimos.</div>
        {sinCarton > 0 && (
          <div style={{ fontSize: 12, color: "#f59e0b" }}>
            ⚠️ {sinCarton} productos sin paquetes por caja en la base: sus cajas no se pueden calcular.{" "}
            <button style={{ ...S.btnMini, padding: "2px 8px" }} onClick={irABase}>completar en la base</button>
            {" "}(puedes subir ahí tu "Tabla de Conversiones").
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={S.cardTitulo}>✍️ Cédula de conteo</div>
          {/* Switch discreto (chuki) */}
          <button type="button" onClick={() => setChuki((v) => !v)} aria-label="modo"
            style={{ width: 22, height: 12, borderRadius: 6, border: "none", padding: 0, position: "relative", cursor: "pointer", flexShrink: 0,
              background: chuki ? "#334155" : "#1e293b", opacity: 0.5 }}>
            <span style={{ position: "absolute", top: 2, left: chuki ? 12 : 2, width: 8, height: 8, borderRadius: 4,
              background: chuki ? "#94a3b8" : "#475569", transition: "left .15s" }} />
          </button>
        </div>
        <div style={S.nota}>
          La llena el almacenista con lo que cuenta físicamente y se compara contra PWST: en rojo lo que no cuadra.
          El picking se llena solo desde la pestaña{" "}
          <button style={{ ...S.btnMini, padding: "1px 8px" }} onClick={irAPicking}>🚚 Picking</button>
          {picking?.fecha ? ` (cargado ${fmtFecha(picking.fecha)} · ${fmtN(totalPicking)} paq).` : " (sin picking cargado)."}
        </div>
        <div style={S.filtros}>
          <label style={S.campo}>
            <span style={S.lbl}>CLO</span>
            <input style={{ ...S.input, width: 130 }} value={clo} disabled={!puedeEditar} onChange={(e) => { setClo(e.target.value.toUpperCase()); setSucio(true); }} />
          </label>
          <label style={S.campo}>
            <span style={S.lbl}>Capacidad (paq)</span>
            <input style={{ ...S.input, width: 100 }} type="number" onFocus={selTodo} min={0} value={capacidad} disabled={!puedeEditar} onChange={(e) => { setCapacidad(e.target.value); setSucio(true); }} />
          </label>
          <label style={{ ...S.campo, flex: 1, minWidth: 160 }}>
            <span style={S.lbl}>Buscar</span>
            <input style={S.input} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="FA01001 o MlbRed…" />
          </label>
          <label style={S.campo}>
            <span style={S.lbl}>Mostrar</span>
            <select style={S.input} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="sin_contar">Sin contar</option>
              <option value="diferencia">Con diferencia ({conDif.length})</option>
            </select>
          </label>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={S.tabla}>
            <thead>
              <tr>
                <th style={{ ...S.th, color: "#64748b" }}>#</th>
                <th style={S.th}>SKU / Marca</th>
                <th style={S.thR}>Cajas</th>
                <th style={S.thR}>Paquetes</th>
                <th style={S.thR}>Cajetillas</th>
                <th style={S.thR}>Picking</th>
                <th style={S.thR} title="Paquetes por caja · cajetillas por paquete">Conv.</th>
                <th style={S.thR}>Físico</th>
                <th style={S.thR}>PWST</th>
                <th style={{ ...S.thR, color: "#f87171" }}>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.codigo} style={{ ...S.tr, background: f.difCaj ? "#f8717112" : "transparent" }}>
                  <td style={{ ...S.td, color: "#64748b", fontSize: 12 }}>{filas.indexOf(f) + 1}</td>
                  <td style={S.td}>
                    <div style={{ fontWeight: 700 }}>{f.codigo}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{f.articulo || "—"}</div>
                  </td>
                  {["cajas", "paquetes", "cajetillas"].map((k) => (
                    <td key={k} style={S.tdR}>
                      {chuki ? (
                        <span style={{ color: f.cap[k] ? "#e2e8f0" : "#475569" }}>{f.cap[k] || "–"}</span>
                      ) : (
                        <input style={{ ...S.inputCelda, width: 58 }} type="number" onFocus={selTodo} inputMode="numeric" min={0}
                          disabled={!puedeEditar || (k === "cajas" && !f.ppc)} value={f.cap[k]} placeholder="0"
                          onChange={(e) => setCampo(f.codigo, k, e.target.value)} />
                      )}
                    </td>
                  ))}
                  <td style={{ ...S.tdR, color: f.picking ? "#22d3ee" : "#475569" }}>{f.picking || "–"}</td>
                  <td style={{ ...S.tdR, fontSize: 11, color: f.ppc ? "#64748b" : "#f59e0b", whiteSpace: "nowrap" }}>{f.ppc || "¿?"} · {f.cpp}</td>
                  <td style={{ ...S.tdR, whiteSpace: "nowrap" }}>{f.contado ? f.fisicoExcel.toFixed(2) : "—"}</td>
                  <td style={{ ...S.tdR, whiteSpace: "nowrap", color: "#94a3b8" }}>{f.saldoNum.toFixed(2)}</td>
                  <td style={{ ...S.tdR, fontWeight: 800, whiteSpace: "nowrap", color: f.difCaj === null ? "#475569" : f.difCaj ? "#f87171" : "#4ade80" }}>
                    {f.difCaj === null ? "—" : fmtDif(f.difCaj, f.cpp)}
                  </td>
                </tr>
              ))}
              {!visibles.length && (
                <tr><td colSpan={10} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: 20 }}>
                  {filas.length ? "Sin resultados." : "Carga el inventario de PWST para empezar."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={S.nota}>
          Físico = cajas × paq/caja + paquetes + picking, con las cajetillas como decimal (igual que el Excel: 2025.07 = 2025 paq 7 caj).
          La diferencia se muestra en paquetes y cajetillas.
        </div>

        <div style={S.barra}>
          {puedeEditar && (
            <button style={{ ...S.btnPrimario, opacity: sucio && !guardando ? 1 : 0.45 }} disabled={!sucio || guardando} onClick={guardar}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          )}
          <button style={S.btnExcel} disabled={bajando || !filas.length} onClick={descargarCedula}>
            {bajando ? "Generando…" : "⬇️ Excel Cédula de conteo"}
          </button>
          <button style={{ ...S.btnSec, borderStyle: "solid" }} disabled={bajando || !filas.length} onClick={descargarCiego}>
            📝 Hoja de conteo ciego
          </button>
          {puedeEditar && (
            <button style={{ ...S.btnMini, borderColor: "#f87171", color: "#f87171" }} onClick={nuevoConteo}>
              {confirmarNuevo ? "¿Seguro? toca otra vez" : "🧹 Nuevo conteo"}
            </button>
          )}
          <span style={{ fontSize: 12, color: sucio ? "#f59e0b" : "#94a3b8" }}>{sucio ? "Tienes cambios sin guardar" : estado}</span>
        </div>
        {sucio && estado && <div style={S.nota}>{estado}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────── PICKING ───────────────────────────
function Picking({ alm, persistFresco, puedeEditar, quien, irAInventario }) {
  const guardado = alm.inventario?.picking || null;
  const [pick, setPick] = useState(guardado);
  const [ver, setVer] = useState("sku"); // sku | vendedor
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState("");
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    if (sucio) return;
    setPick(alm.inventario?.picking || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alm]);

  function cargar(filas) {
    const r = parsearPicking(filas);
    if (r.error) { setEstado("⚠️ " + r.error); return; }
    setPick({ fecha: new Date().toISOString(), quien, filas: r.filas });
    setSucio(true);
    setEstado(`✅ ${r.filas.length} renglones de picking leídos. Da Guardar para que llene la cédula.`);
  }

  async function guardar(nuevo = pick) {
    setGuardando(true);
    setEstado("Guardando…");
    try {
      await persistFresco((fresca) => ({
        almacen: { ...(fresca.almacen || {}), inventario: { ...((fresca.almacen || {}).inventario || {}), picking: nuevo } },
      }));
      setSucio(false);
      setEstado(nuevo ? "✅ Picking guardado. Ya aparece en la Cédula de conteo." : "🧹 Picking borrado.");
    } catch (err) {
      setEstado("❌ No se pudo guardar: " + (err?.message || err));
    } finally {
      setGuardando(false);
    }
  }

  function borrar() {
    if (!confirmar) { setConfirmar(true); setTimeout(() => setConfirmar(false), 4000); return; }
    setConfirmar(false);
    setPick(null);
    guardar(null);
  }

  const filas = pick?.filas || [];
  const porSku = useMemo(() => {
    const m = {};
    for (const f of filas) {
      const x = m[f.codigo] || (m[f.codigo] = { codigo: f.codigo, descripcion: f.descripcion, total: 0, vendedores: 0 });
      x.total += Number(f.cantidad) || 0;
      x.vendedores += 1;
    }
    return Object.values(m).sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [filas]);
  const porVendedor = useMemo(() => {
    const m = {};
    for (const f of filas) {
      const k = f.vendedor || "—";
      const x = m[k] || (m[k] = { vendedor: k, skus: 0, total: 0 });
      x.skus += 1;
      x.total += Number(f.cantidad) || 0;
    }
    return Object.values(m).sort((a, b) => a.vendedor.localeCompare(b.vendedor));
  }, [filas]);
  const total = r3(filas.reduce((s, f) => s + (Number(f.cantidad) || 0), 0));

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardTitulo}>🚚 Picking</div>
        <div style={S.sub}>
          {pick?.fecha ? `Cargado: ${fmtFecha(pick.fecha)}${pick.quien ? ` · ${pick.quien}` : ""} · ${porVendedor.length} vendedores · ${porSku.length} SKUs · ${fmtN(total)} paq` : "Todavía no se ha pegado el picking."}
        </div>
        {puedeEditar && (
          <Cargador setEstado={setEstado} onFilas={cargar}
            placeholder={"Pega el picking (con encabezados):\nVendedor,Codigo,Descripcion,Cantidad,Unidades\nJ201 J201 - FRANCISCO JAVIER MONTES MADERO,FA01001,MARLBORO LS BOX 20,90,900.000"} />
        )}
        <div style={S.nota}>Se toma la columna <b>Cantidad</b> (paquetes) y se suma por SKU. Ese total llena solo la columna Picking de la Cédula de conteo.</div>
      </div>

      {filas.length > 0 && (
        <div style={S.card}>
          <div style={S.tabs}>
            {[["sku", "Por SKU"], ["vendedor", "Por vendedor"]].map(([k, l]) => (
              <button key={k} onClick={() => setVer(k)} style={ver === k ? S.tabOn : S.tab}>{l}</button>
            ))}
          </div>
          <div style={{ overflowX: "auto" }}>
            {ver === "sku" ? (
              <table style={S.tabla}>
                <thead><tr><th style={S.th}>SKU</th><th style={S.th}>Descripción</th><th style={S.thR}>Vendedores</th><th style={S.thR}>Total (paq)</th></tr></thead>
                <tbody>
                  {porSku.map((x) => (
                    <tr key={x.codigo} style={S.tr}>
                      <td style={S.td}>{x.codigo}</td>
                      <td style={{ ...S.td, fontSize: 12 }}>{x.descripcion}</td>
                      <td style={{ ...S.tdR, color: "#94a3b8" }}>{x.vendedores}</td>
                      <td style={{ ...S.tdR, fontWeight: 800, color: "#22d3ee" }}>{fmtN(x.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table style={S.tabla}>
                <thead><tr><th style={S.th}>Vendedor</th><th style={S.thR}>SKUs</th><th style={S.thR}>Total (paq)</th></tr></thead>
                <tbody>
                  {porVendedor.map((x) => (
                    <tr key={x.vendedor} style={S.tr}>
                      <td style={S.td}>{x.vendedor}</td>
                      <td style={{ ...S.tdR, color: "#94a3b8" }}>{x.skus}</td>
                      <td style={{ ...S.tdR, fontWeight: 800, color: "#22d3ee" }}>{fmtN(x.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <div style={S.barra}>
        {puedeEditar && (
          <button style={{ ...S.btnPrimario, opacity: sucio && !guardando ? 1 : 0.45 }} disabled={!sucio || guardando} onClick={() => guardar()}>
            {guardando ? "Guardando…" : "Guardar picking"}
          </button>
        )}
        <button style={{ ...S.btnSec, borderStyle: "solid" }} onClick={irAInventario}>✍️ Ir a la Cédula de conteo</button>
        {puedeEditar && guardado && (
          <button style={{ ...S.btnMini, borderColor: "#f87171", color: "#f87171" }} onClick={borrar}>
            {confirmar ? "¿Seguro? toca otra vez" : "🧹 Borrar picking"}
          </button>
        )}
        <span style={{ fontSize: 12, color: sucio ? "#f59e0b" : "#94a3b8" }}>{sucio ? "Tienes cambios sin guardar" : estado}</span>
      </div>
      {sucio && estado && <div style={S.nota}>{estado}</div>}
    </div>
  );
}

// Hoja de conteo ciego: #, SKU, MARCA, TOTAL CAJAS, TOTAL PAQUETES, TOTAL CAJETILLAS.
// lleno = true → con la chuki; false → en blanco para contar a mano.
async function excelConteoCiego({ filas, lleno, clo, fecha }) {
  const archivo = `HOJA_DE_CONTEO_${fechaPuntos(fecha)}.xlsx`;
  const val = (v) => (v === "" || v === null || v === undefined || Number(v) === 0 ? null : Number(v));
  const datoDe = (f, k) => (lleno ? val(f.chuki[k]) : null);
  let ExcelJS;
  try { ExcelJS = await cargarExcelJS(); } catch { ExcelJS = null; }
  if (!ExcelJS) {
    await bajarExcel(filas.map((f, i) => ({
      "#": i + 1, SKU: f.codigo, MARCA: f.articulo,
      "TOTAL CAJAS": datoDe(f, "cajas"), "TOTAL PAQUETES": datoDe(f, "paquetes"), "TOTAL CAJETILLAS": datoDe(f, "cajetillas"),
    })), [5, 12, 18, 15, 15, 15], "Hoja de conteo", archivo);
    return;
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART-TRACK";
  const ws = wb.addWorksheet("Hoja de conteo", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 4 }],
    pageSetup: { paperSize: 1, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.7, bottom: 0.6, header: 0.3, footer: 0.3 } },
  });
  ws.pageSetup.printTitlesRow = "4:4";
  encabezadoImpresion(ws, `HOJA DE CONTEO · CLO ${clo || ""}`, fecha);
  const fino = { style: "thin", color: { argb: "FF000000" } };
  const borde = { top: fino, left: fino, bottom: fino, right: fino };
  const grisClaro = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
  const gris = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBFBFBF" } };
  [5.5, 12.5, 18, 17, 17, 17].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  ws.mergeCells("A1:F1");
  ws.getCell("A1").value = "HOJA DE CONTEO";
  ws.getCell("A1").font = { name: "Calibri", bold: true, size: 16 };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.mergeCells("A2:C2"); ws.mergeCells("D2:F2");
  ws.getCell("A2").value = `CLO: ${clo || ""}`;
  ws.getCell("D2").value = `Fecha: ${fechaPuntos(fecha)}`;
  ws.getCell("A2").font = ws.getCell("D2").font = { name: "Calibri", bold: true, size: 11 };
  ws.getCell("D2").alignment = { horizontal: "right" };
  ws.mergeCells("A3:F3");
  ws.getCell("A3").value = "Contó: ______________________________     Firma: ____________________";
  ws.getCell("A3").font = { name: "Calibri", size: 10, color: { argb: "FF595959" } };

  const enc = ["#", "SKU", "MARCA", "TOTAL CAJAS", "TOTAL PAQUETES", "TOTAL CAJETILLAS"];
  const fe = ws.getRow(4);
  fe.height = 42;
  enc.forEach((t, i) => {
    const c = fe.getCell(i + 1);
    c.value = t; c.border = borde; c.fill = i <= 1 ? grisClaro : gris;
    c.font = { name: "Calibri", size: 12 };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  filas.forEach((f, i) => {
    const r = ws.getRow(5 + i);
    r.height = lleno ? 18 : 22;
    [i + 1, f.codigo, f.articulo, datoDe(f, "cajas"), datoDe(f, "paquetes"), datoDe(f, "cajetillas")].forEach((v, j) => {
      const c = r.getCell(j + 1);
      c.value = v; c.border = borde;
      c.font = { name: "Calibri", size: 11, color: j === 0 ? { argb: "FF7F7F7F" } : undefined };
      c.alignment = { horizontal: j === 0 ? "center" : j >= 3 ? "right" : "left", vertical: "middle" };
      if (j >= 3) c.numFmt = "0.0";
    });
  });
  await guardarWb(wb, archivo);
}

// Excel igual al de la cédula original: hoja con fórmulas + PICKING + INVENTARIO PWST + Tabla de Conversiones.
// Se llama igual que el original (CEDULA_DE_CONTEO_PWST_dd.mm.aaaa) lleve chuki o conteo.
async function excelCedula({ filas, pwstFilas, picking, base, clo, fecha, capacidad }) {
  let ExcelJS;
  try { ExcelJS = await cargarExcelJS(); } catch { ExcelJS = null; }
  const archivo = `CEDULA_DE_CONTEO_PWST_${fechaPuntos(fecha)}.xlsx`;
  const val = (v) => (v === "" || v === null || v === undefined || Number(v) === 0 ? null : Number(v));

  if (!ExcelJS) {
    await bajarExcel(filas.map((f) => ({
      SKU: f.codigo, MARCA: f.articulo, "TOTAL CAJAS": val(f.cap.cajas), "TOTAL PAQUETES": val(f.cap.paquetes),
      "TOTAL CAJETILLAS": val(f.cap.cajetillas), Picking: f.picking || 0, "PAQUETES X CAJA": f.ppc || null,
      "CAJETILLAS X PAQUETE": f.cpp, "TOTAL INVENTARIO FISICO": f.fisicoExcel, "TOTAL PWST": f.saldoNum,
      DIFERENCIAS: r3(f.fisicoExcel - f.saldoNum),
    })), [12, 18, 12, 14, 14, 10, 12, 12, 16, 14, 14], "Cédula de Conteo", archivo, { titulo: `CÉDULA DE CONTEO · CLO ${clo}`, fecha });
    return;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART-TRACK";
  const ws = wb.addWorksheet("Cédula de Conteo", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 7 }],
    pageSetup: { paperSize: 1, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.7, bottom: 0.6, header: 0.3, footer: 0.3 } },
  });
  ws.pageSetup.printTitlesRow = "7:7";
  encabezadoImpresion(ws, `CÉDULA DE CONTEO PWST · CLO ${clo || ""}`, fecha);
  const fino = { style: "thin", color: { argb: "FF000000" } };
  const borde = { top: fino, left: fino, bottom: fino, right: fino };
  const NUM3 = '_(* #,##0.000_);_(* \\(#,##0.000\\);_(* "-"_);_(@_)';
  const NUM1 = '_(* #,##0.0_);_(* \\(#,##0.0\\);_(* "-"??_);_(@_)';
  const gris = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
  const blanco = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  const negro = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } };
  [12.3, 17.4, 17.1, 16, 15.9, 15.9, 12.9, 13.1, 18.3, 17.4, 17.6, 3.9].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const n = filas.length;
  const ini = 8, fin = ini + n - 1, tot = fin + 2;
  let sumC = 0, sumD = 0, sumE = 0, sumJ = 0, sumK = 0;

  ws.mergeCells("A1:A2"); ws.mergeCells("B1:B2"); ws.mergeCells("C1:D4"); ws.mergeCells("E1:F4"); ws.mergeCells("G1:H4"); ws.mergeCells("I1:J4");
  const caja = (ref, v, sz, fmt) => {
    const c = ws.getCell(ref);
    c.value = v; c.font = { name: "Calibri", bold: true, size: sz }; c.fill = blanco;
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.border = borde;
    if (fmt) c.numFmt = fmt;
  };

  filas.forEach((f, i) => {
    const r = ini + i;
    const C = val(f.cap.cajas), D = val(f.cap.paquetes), E = val(f.cap.cajetillas);
    const F = f.picking || 0, G = f.ppc || 0, H = f.cpp || 10;
    const I = r3((C || 0) * G + (D || 0) + (E || 0) / 100 + F);
    const J = f.saldoNum, K = r3(I - J);
    sumC += C || 0; sumD += D || 0; sumE += E || 0; sumJ += J; sumK += K;
    const fila = ws.getRow(r);
    fila.height = 15.6;
    fila.getCell(1).value = f.codigo;
    fila.getCell(2).value = { formula: `IFERROR(VLOOKUP(A${r},'Tabla de Conversiones'!$A$2:$D$5000,2,0),"")`, result: f.articulo || "" };
    fila.getCell(3).value = C;
    fila.getCell(4).value = D;
    fila.getCell(5).value = E;
    fila.getCell(6).value = { formula: `IFERROR(VLOOKUP(A${r},PICKING!A:C,3,0),0)`, result: F };
    fila.getCell(7).value = { formula: `IFERROR(VLOOKUP(A${r},'Tabla de Conversiones'!A:D,4,0),0)`, result: G };
    fila.getCell(8).value = { formula: `IFERROR(VLOOKUP(A${r},'Tabla de Conversiones'!A:D,3,0),0)`, result: H };
    fila.getCell(9).value = { formula: `IF(ISERROR((C${r}*G${r})+D${r}+(E${r}/100)),0,(C${r}*G${r})+D${r}+(E${r}/100)+F${r})`, result: I };
    fila.getCell(10).value = { formula: `SUMIF('INVENTARIO PWST'!B:B,A${r},'INVENTARIO PWST'!E:E)`, result: J };
    fila.getCell(11).value = { formula: `I${r}-(J${r})`, result: K };
    for (let col = 1; col <= 11; col++) {
      const c = fila.getCell(col);
      c.border = borde;
      c.font = { name: "Calibri", size: col >= 9 && col <= 10 ? 12 : 11, color: col === 11 && Math.abs(K) > 0.0001 ? { argb: "FFFF0000" } : undefined, bold: col === 11 && Math.abs(K) > 0.0001 };
      if (col >= 3 && col <= 6) c.numFmt = NUM1;
      if (col >= 9) c.numFmt = NUM3;
      if (col >= 3) c.alignment = { horizontal: "right" };
    }
  });

  caja("A1", "CAPACIDAD ACTUAL", 11);
  caja("B1", { formula: "IFERROR(E1/A5,0)", result: capacidad ? sumJ / capacidad : 0 }, 24, "0%");
  caja("C1", "INVENTARIO TOTAL", 18);
  caja("E1", { formula: `J${tot}`, result: r3(sumJ) }, 18, NUM3);
  caja("G1", "DIFERENCIA", 18);
  caja("I1", { formula: `K${tot}`, result: r3(sumK) }, 18, NUM3);
  ws.getCell("A3").value = "CLO: "; ws.getCell("A3").font = { bold: true }; ws.getCell("A3").alignment = { horizontal: "right" };
  ws.getCell("B3").value = clo; ws.getCell("B3").font = { bold: true };
  ws.getCell("A4").value = "Fecha:"; ws.getCell("A4").font = { bold: true }; ws.getCell("A4").alignment = { horizontal: "right" };
  ws.getCell("B4").value = fechaPuntos(fecha); ws.getCell("B4").font = { bold: true };
  ws.getCell("A5").value = capacidad; ws.getCell("A5").font = { bold: true, color: { argb: "FFFFFFFF" } }; ws.getCell("A5").numFmt = NUM3;

  const enc = ["SKU", "MARCA ", "TOTAL CAJAS", "TOTAL PAQUETES", "TOTAL CAJETILLAS", "Picking", "PAQUETES X CAJA", "CAJETILLAS X PAQUETE", "TOTAL INVENTARIO FISICO", "TOTAL PWST", "DIFERENCIAS"];
  const filaEnc = ws.getRow(7);
  filaEnc.height = 46.8;
  enc.forEach((t, i) => {
    const c = filaEnc.getCell(i + 1);
    c.value = t; c.fill = gris; c.border = borde;
    c.font = { name: "Calibri", size: 12, color: i === 10 ? { argb: "FFFF0000" } : undefined };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  if (n) ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: fin, column: 11 } };

  const filaTot = ws.getRow(tot);
  const totales = { 3: [`SUM(C${ini}:C${fin + 1})`, sumC], 4: [`SUM(D${ini}:D${fin + 1})`, sumD], 5: [`SUM(E${ini}:E${fin + 1})`, sumE], 10: [`SUM(J${ini}:J${fin + 1})`, r3(sumJ)], 11: [`SUM(K${ini}:K${fin + 1})`, r3(sumK)] };
  for (const [col, [formula, result]] of Object.entries(totales)) {
    const c = filaTot.getCell(Number(col));
    c.value = { formula, result }; c.fill = negro; c.border = borde;
    c.font = { name: "Calibri", size: 14, color: { argb: "FFFFFFFF" } };
    c.alignment = { horizontal: "center" }; c.numFmt = Number(col) >= 10 ? NUM3 : NUM1;
  }

  // PICKING: total por SKU (como el original) y el detalle por vendedor a la derecha
  const wp = wb.addWorksheet("PICKING");
  [12, 34, 10, 4, 40, 12, 10].forEach((w, i) => { wp.getColumn(i + 1).width = w; });
  encabezadoImpresion(wp, "PICKING", fecha);
  const tPick = totalesPicking(picking?.filas);
  const descPick = {};
  for (const f of picking?.filas || []) if (!descPick[f.codigo]) descPick[f.codigo] = f.descripcion;
  const codsPick = Object.keys(tPick).sort();
  wp.getCell("C1").value = { formula: "SUM(C3:C5000)", result: r3(Object.values(tPick).reduce((s, x) => s + x, 0)) };
  wp.getRow(2).values = ["Codigo", "Descripcion", "Total", null, "Vendedor", "Codigo", "Cantidad"];
  wp.getRow(2).font = { bold: true };
  codsPick.forEach((c, i) => { const r = wp.getRow(3 + i); r.getCell(1).value = c; r.getCell(2).value = descPick[c] || ""; r.getCell(3).value = r3(tPick[c]); });
  (picking?.filas || []).forEach((f, i) => { const r = wp.getRow(3 + i); r.getCell(5).value = f.vendedor; r.getCell(6).value = f.codigo; r.getCell(7).value = Number(f.cantidad) || 0; });

  // INVENTARIO PWST (tal cual el reporte)
  const wi = wb.addWorksheet("INVENTARIO PWST");
  [34, 12, 18, 10, 12].forEach((w, i) => { wi.getColumn(i + 1).width = w; });
  encabezadoImpresion(wi, "INVENTARIO PWST", fecha);
  wi.getCell("E1").value = { formula: "SUM(E3:E5000)", result: r3(pwstFilas.reduce((s, p) => s + (Number(String(p.saldoTexto).replace(/,/g, "")) || 0), 0)) };
  wi.getRow(2).values = ["Deposito", "Codigo", "Articulo", "Unidades", "Saldo"];
  wi.getRow(2).font = { bold: true };
  pwstFilas.forEach((p, i) => {
    wi.getRow(3 + i).values = [p.deposito || "", p.codigo, p.articulo, p.unidades, Number(String(p.saldoTexto).replace(/,/g, "")) || 0];
  });

  // Tabla de Conversiones
  const wt = wb.addWorksheet("Tabla de Conversiones");
  [12, 22, 10, 18].forEach((w, i) => { wt.getColumn(i + 1).width = w; });
  encabezadoImpresion(wt, "TABLA DE CONVERSIONES", fecha);
  wt.mergeCells("A1:D1");
  wt.getCell("A1").value = "Tabla de conversiones ";
  wt.getCell("A1").font = { bold: true, size: 14 };
  wt.getCell("A1").alignment = { horizontal: "center" };
  wt.getRow(2).values = ["Codigo", "Articulo", "Unidades", "Paquetes por caja"];
  wt.getRow(2).font = { bold: true };
  const conv = new Map();
  for (const f of filas) conv.set(f.codigo, [f.codigo, f.articulo, f.cpp, f.ppc || null]);
  for (const [cod, b] of Object.entries(base)) if (!conv.has(cod)) conv.set(cod, [cod, b.articulo || "", 10, b.unidades || null]);
  [...conv.values()].sort((a, b) => a[0].localeCompare(b[0])).forEach((v, i) => { wt.getRow(3 + i).values = v; });

  await guardarWb(wb, archivo);
}

const S = {
  wrap: { padding: 16, color: "#e2e8f0", maxWidth: 1000, margin: "0 auto", textAlign: "left" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  titulo: { fontSize: 22, fontWeight: 800 },
  sub: { fontSize: 13, color: "#94a3b8" },
  tabs: { display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" },
  tab: { padding: "8px 14px", borderRadius: 999, border: "1px solid #334155", background: "transparent", color: "#cbd5e1", cursor: "pointer", fontSize: 14 },
  tabOn: { padding: "8px 14px", borderRadius: 999, border: "1px solid #f59e0b", background: "#f59e0b22", color: "#f59e0b", cursor: "pointer", fontSize: 14, fontWeight: 700 },
  card: { padding: 14, borderRadius: 14, border: "1px solid #ffffff1a", background: "#ffffff08", marginBottom: 14, display: "flex", flexDirection: "column", gap: 10, textAlign: "left" },
  cardTitulo: { fontSize: 15, fontWeight: 800, color: "#f8fafc" },
  textarea: { width: "100%", minHeight: 110, padding: 12, borderRadius: 12, border: "1px solid #334155", background: "#0b1220", color: "#e2e8f0", fontSize: 13, fontFamily: "ui-monospace, Menlo, monospace", boxSizing: "border-box" },
  botones: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  barra: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", position: "sticky", bottom: 0, background: "linear-gradient(transparent, #0b1220 35%)", padding: "14px 0 4px" },
  btnPrimario: { padding: "10px 18px", borderRadius: 12, border: "none", background: "#22c55e", color: "#04130a", fontWeight: 800, cursor: "pointer" },
  btnSec: { padding: "10px 14px", borderRadius: 12, border: "1px dashed #22d3ee", background: "transparent", color: "#22d3ee", cursor: "pointer", fontWeight: 700 },
  btnMini: { padding: "8px 10px", borderRadius: 10, border: "1px solid #22d3ee", background: "transparent", color: "#22d3ee", cursor: "pointer", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" },
  btnExcel: { padding: "10px 16px", borderRadius: 12, border: "1px solid #f59e0b", background: "#f59e0b1a", color: "#fbbf24", cursor: "pointer", fontWeight: 800 },
  btnX: { border: "none", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 14 },
  nota: { fontSize: 12, color: "#94a3b8", lineHeight: 1.5 },
  filtros: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" },
  campo: { display: "flex", flexDirection: "column", gap: 4, textAlign: "left" },
  lbl: { fontSize: 12, color: "#94a3b8" },
  input: { padding: "9px 10px", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", color: "#e2e8f0", fontSize: 14 },
  inputCelda: { width: 70, padding: "6px 8px", borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#e2e8f0", fontSize: 14, textAlign: "right" },
  resumen: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontSize: 13, color: "#cbd5e1" },
  tabla: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  tr: { borderTop: "1px solid #1e2a42" },
  th: { padding: "8px 8px", textAlign: "left", color: "#94a3b8", fontWeight: 600, whiteSpace: "nowrap" },
  thR: { padding: "8px 8px", textAlign: "right", color: "#94a3b8", fontWeight: 600, whiteSpace: "nowrap" },
  td: { padding: "7px 8px", verticalAlign: "middle", textAlign: "left" },
  tdR: { padding: "7px 8px", verticalAlign: "middle", textAlign: "right" },
  kpis: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 },
  kpi: { padding: "12px 14px", borderRadius: 14, border: "1px solid #f59e0b44", background: "radial-gradient(120% 140% at 50% -10%, #f59e0b18, transparent 60%), #0e1626", textAlign: "center" },
  kpiLbl: { fontSize: 11, color: "#94a3b8", fontWeight: 700, letterSpacing: 0.5 },
  kpiVal: { fontSize: 24, fontWeight: 800, color: "#fbbf24", marginTop: 4 },
  kpiUni: { fontSize: 13, color: "#94a3b8", fontWeight: 600 },
};
