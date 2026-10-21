// @ts-nocheck
// AlmacenView.jsx — Módulo ALMACÉN de SMART-TRACK.
//   • Base de mínimos: catálogo fijo de productos con su mínimo (en PAQUETES) y cuántos
//     paquetes trae su cartón (columna Unidades). Se carga
//     desde Excel/CSV o se captura a mano y queda guardado; es la base de todo cálculo.
//   • Calcular pedido: se carga el reporte de existencias (Deposito, Codigo, Articulo,
//     Unidades, Saldo…) y se compara contra la base → pedido, menos el sugerido.
//   • Inventario: Chuki (se llena sola para que cuadre con PWST) y Cédula de conteo (manual),
//     con descarga en Excel igual a la cédula de conteo.
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

const hoyISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
// Vacío → null (para no confundir "sin capturar" con 0)
const num = (v) => {
  const s = String(v ?? "").replace(/[^\d.\-]/g, "");
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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

function bajarExcel(filas, anchos, hoja, nombre) {
  const ws = XLSX.utils.json_to_sheet(filas);
  ws["!cols"] = anchos.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, hoja);
  XLSX.writeFile(wb, nombre);
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

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div>
          <div style={S.titulo}>📦 Almacén</div>
          <div style={S.sub}>Base de mínimos, existencias y pedido de surtido</div>
        </div>
      </div>
      <div style={S.tabs}>
        {[["base", "📋 Base de mínimos"], ["pedido", "🧮 Calcular pedido"], ["inventario", "📦 Inventario"]].map(([k, l]) => (
          <button key={k} onClick={() => setPestana(k)} style={pestana === k ? S.tabOn : S.tab}>{l}</button>
        ))}
      </div>
      {pestana === "base" && <BaseMinimos alm={alm} persistFresco={persistFresco} puedeEditar={puedeEditar} quien={quien} />}
      {pestana === "pedido" && (
        <CalcularPedido alm={alm} persistFresco={persistFresco} puedeEditar={puedeEditar} quien={quien} irABase={() => setPestana("base")} />
      )}
      {pestana === "inventario" && (
        <Inventario alm={alm} persistFresco={persistFresco} puedeEditar={puedeEditar} quien={quien} irABase={() => setPestana("base")} />
      )}
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
function BaseMinimos({ alm, persistFresco, puedeEditar, quien }) {
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
    bajarExcel(filas, [12, 26, 10, 10], "Minimos", `base_minimos_${hoyISO()}.xlsx`);
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
                    <input style={S.inputCelda} type="number" min={0} disabled={!puedeEditar} placeholder="—"
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
function CalcularPedido({ alm, persistFresco, puedeEditar, quien, irABase }) {
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
      [12, 10, 28], "Pedido", `pedido_modificado_${hoyISO()}.xlsx`
    );
  }
  function excelCalculado() {
    const lista = calculados.filter((p) => p.calc !== null && p.calc > 0 && p.calc >= u);
    if (!lista.length) { setEstado("No hay nada que pedir con los mínimos actuales."); return; }
    bajarExcel(
      lista.map((p) => ({ "Código FA": p.codigo, "Cantidad": p.calc, "Descripción": p.articulo })),
      [12, 10, 28], "Pedido", `pedido_calculado_${hoyISO()}.xlsx`
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
                <input style={{ ...S.input, width: 70 }} type="number" min={0} value={umbral}
                  onChange={(e) => { setUmbral(e.target.value); setSucio(true); }} />
                <span style={S.sub}>paq</span>
              </div>
            </label>
            {puedeEditar && (
              <label style={S.campo}>
                <span style={S.lbl}>Sugerido del sistema</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input style={{ ...S.input, width: 70 }} type="number" min={0} value={sugTodos}
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
                        <input style={S.inputCelda} type="number" min={0} disabled={!puedeEditar} placeholder="0"
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

// ─────────────────────────── INVENTARIO (Chuki + Cédula de conteo) ───────────────────────────
// PWST trae el saldo como PAQUETES.CAJETILLAS (2025.07 = 2025 paquetes y 7 cajetillas).
//   • Chuki: se llena sola desglosando el saldo de PWST en cajas / paquetes / cajetillas,
//     así el inventario cuadra exacto (diferencia 0).
//   • Cédula de conteo: la llena a mano el almacenista; se compara contra PWST.
// Se guarda en data.almacen.inventario:
//   { pwst: { fecha, quien, filas }, conteo: { FA: { cajas, paquetes, cajetillas, picking } },
//     fechaConteo, clo, capacidad, conteoActualizado: { fecha, quien } }

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

// Diferencia en cajetillas → "+1 paq 3 caj"
function fmtDif(cajetillas, cpp) {
  if (!cajetillas) return "0";
  const signo = cajetillas > 0 ? "+" : "−";
  const a = Math.abs(Math.round(cajetillas));
  const paq = Math.floor(a / cpp), caj = a % cpp;
  return `${signo}${paq ? `${paq} paq` : ""}${paq && caj ? " " : ""}${caj ? `${caj} caj` : ""}`;
}

function Inventario({ alm, persistFresco, puedeEditar, quien, irABase }) {
  const inv = alm.inventario || {};
  const base = useMemo(() => baseInicial(alm), [alm]);
  const [vista, setVista] = useState("cedula");
  const [pwst, setPwst] = useState(inv.pwst || alm.ultimaCarga || null);
  const [conteo, setConteo] = useState(inv.conteo || {});
  const [fechaConteo, setFechaConteo] = useState(inv.fechaConteo || hoyISO());
  const [clo, setClo] = useState(inv.clo || "VALLARTA");
  const [capacidad, setCapacidad] = useState(inv.capacidad ?? 17280);
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState("todos"); // todos | diferencia | sin_contar
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState("");
  const [confirmarNuevo, setConfirmarNuevo] = useState(false);
  const [bajando, setBajando] = useState(false);

  useEffect(() => {
    if (sucio) return;
    const i = alm.inventario || {};
    setPwst(i.pwst || alm.ultimaCarga || null);
    setConteo(i.conteo || {});
    setFechaConteo(i.fechaConteo || hoyISO());
    setClo(i.clo || "VALLARTA");
    setCapacidad(i.capacidad ?? 17280);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alm]);

  // Respaldo local de la cédula mientras se captura (por si se cierra la app sin guardar)
  const LS = "st_almacen_conteo_borrador";
  useEffect(() => {
    if (!sucio) return;
    try { localStorage.setItem(LS, JSON.stringify({ conteo, fechaConteo, clo, capacidad, t: Date.now() })); } catch { /* sin storage */ }
  }, [conteo, fechaConteo, clo, capacidad, sucio]);
  useEffect(() => {
    try {
      const b = JSON.parse(localStorage.getItem(LS) || "null");
      const guardado = alm.inventario?.conteoActualizado?.fecha ? Date.parse(alm.inventario.conteoActualizado.fecha) : 0;
      if (b && b.t > guardado && Object.keys(b.conteo || {}).length) {
        setConteo(b.conteo); setFechaConteo(b.fechaConteo || hoyISO()); setClo(b.clo || "VALLARTA"); setCapacidad(b.capacidad ?? 17280);
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

  // Filas del inventario: productos de PWST con saldo + los de la base
  const filas = useMemo(() => {
    const porCod = new Map();
    for (const p of pwst?.filas || []) {
      porCod.set(p.codigo, {
        codigo: p.codigo, articulo: p.articulo, cpp: p.unidades || 10,
        saldoTexto: p.saldoTexto, saldoNum: Number(String(p.saldoTexto || "").replace(/,/g, "")) || 0,
        pwPaq: p.cajas || 0, pwCaj: p.paquetes || 0,
      });
    }
    for (const [codigo, b] of Object.entries(base)) {
      if (!porCod.has(codigo)) porCod.set(codigo, { codigo, articulo: b.articulo || "", cpp: 10, saldoTexto: "0", saldoNum: 0, pwPaq: 0, pwCaj: 0 });
    }
    for (const codigo of Object.keys(conteo)) {
      if (!porCod.has(codigo)) porCod.set(codigo, { codigo, articulo: base[codigo]?.articulo || "", cpp: 10, saldoTexto: "0", saldoNum: 0, pwPaq: 0, pwCaj: 0 });
    }
    return [...porCod.values()]
      .filter((x) => x.saldoNum !== 0 || base[x.codigo] || conteo[x.codigo])
      .map((x) => {
        const ppc = base[x.codigo]?.unidades || 0; // paquetes por caja (cartón)
        const articulo = x.articulo || base[x.codigo]?.articulo || "";
        const pwstCaj = x.pwPaq * x.cpp + x.pwCaj; // PWST en cajetillas
        // Chuki: desglose automático del saldo
        const chuki = {
          cajas: ppc ? Math.floor(x.pwPaq / ppc) : 0,
          paquetes: ppc ? x.pwPaq % ppc : x.pwPaq,
          cajetillas: x.pwCaj,
          picking: 0,
        };
        // Cédula: captura manual
        const c = conteo[x.codigo] || {};
        const contado = ["cajas", "paquetes", "cajetillas", "picking"].some((k) => c[k] !== undefined && c[k] !== null && c[k] !== "");
        const v = (k) => Number(c[k]) || 0;
        const fisCaj = ((v("cajas") * ppc) + v("paquetes") + v("picking")) * x.cpp + v("cajetillas");
        return {
          ...x, articulo, ppc, pwstCaj, chuki, contado,
          cedula: { cajas: c.cajas ?? "", paquetes: c.paquetes ?? "", cajetillas: c.cajetillas ?? "", picking: c.picking ?? "" },
          fisCaj, difCaj: contado ? fisCaj - pwstCaj : null,
          // Mismo cálculo que el Excel (paquetes con cajetillas en centésimas)
          fisicoExcel: r3(v("cajas") * ppc + v("paquetes") + v("cajetillas") / 100 + v("picking")),
        };
      })
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [pwst, base, conteo]);

  const sinCarton = filas.filter((f) => !f.ppc).length;
  const contados = filas.filter((f) => f.contado).length;
  const conDif = filas.filter((f) => f.contado && f.difCaj !== 0);
  const totalPwstPaq = r3(filas.reduce((s, f) => s + f.saldoNum, 0));
  const difTotalExcel = r3(filas.reduce((s, f) => s + (f.contado ? f.fisicoExcel - f.saldoNum : 0), 0));
  const capPct = Number(capacidad) ? Math.round((totalPwstPaq / Number(capacidad)) * 100) : null;

  const visibles = filas.filter((f) => {
    if (buscar && !norm(`${f.codigo} ${f.articulo}`).includes(norm(buscar))) return false;
    if (vista === "cedula" && filtro === "diferencia") return f.contado && f.difCaj !== 0;
    if (vista === "cedula" && filtro === "sin_contar") return !f.contado;
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
            pwst, conteo, fechaConteo, clo, capacidad: Number(capacidad) || 0,
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
    setFechaConteo(hoyISO());
    setConfirmarNuevo(false);
    setSucio(true);
    setEstado("🧹 Cédula en blanco. Captura el conteo y da Guardar.");
  }

  async function descargar(tipo) {
    setBajando(true);
    try {
      const lista = filas.map((f) => ({ ...f, captura: tipo === "chuki" ? f.chuki : f.cedula }));
      await excelInventario({ tipo, filas: lista, pwstFilas: pwst?.filas || [], base, clo, fecha: fechaConteo, capacidad: Number(capacidad) || 0 });
      setEstado(`⬇️ Excel de ${tipo === "chuki" ? "la Chuki" : "la Cédula de conteo"} descargado.`);
    } catch (err) {
      setEstado("❌ No se pudo generar el Excel: " + (err?.message || err));
    } finally {
      setBajando(false);
    }
  }

  const num0 = (v) => (v === "" || v === null || v === undefined || Number(v) === 0 ? "" : v);
  const enCedula = vista === "cedula";

  return (
    <div>
      {/* Encabezado como el de la cédula */}
      <div style={S.kpis}>
        <div style={S.kpi}><div style={S.kpiLbl}>CAPACIDAD ACTUAL</div><div style={S.kpiVal}>{capPct === null ? "—" : `${capPct}%`}</div></div>
        <div style={S.kpi}><div style={S.kpiLbl}>INVENTARIO TOTAL (PWST)</div><div style={S.kpiVal}>{fmtN(totalPwstPaq)} <span style={S.kpiUni}>paq</span></div></div>
        <div style={S.kpi}>
          <div style={S.kpiLbl}>DIFERENCIA {enCedula ? "" : "(CHUKI)"}</div>
          <div style={{ ...S.kpiVal, color: enCedula && difTotalExcel !== 0 ? "#f87171" : "#4ade80" }}>{enCedula ? fmtN(difTotalExcel) : "0"}</div>
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

      <div style={S.tabs}>
        {[["chuki", "🧾 Chuki"], ["cedula", "✍️ Cédula de conteo"]].map(([k, l]) => (
          <button key={k} onClick={() => setVista(k)} style={vista === k ? S.tabOn : S.tab}>{l}</button>
        ))}
      </div>

      <div style={S.card}>
        <div style={S.cardTitulo}>{enCedula ? "✍️ Cédula de conteo" : "🧾 Chuki"}</div>
        <div style={S.nota}>
          {enCedula
            ? "La llena el almacenista con lo que cuenta físicamente. Se compara contra PWST: en rojo lo que no cuadra."
            : "Se llena sola desglosando el saldo de PWST en cajas, paquetes y cajetillas, para que el inventario cuadre exacto."}
        </div>
        <div style={S.filtros}>
          <label style={S.campo}>
            <span style={S.lbl}>CLO</span>
            <input style={{ ...S.input, width: 130 }} value={clo} disabled={!puedeEditar} onChange={(e) => { setClo(e.target.value.toUpperCase()); setSucio(true); }} />
          </label>
          <label style={S.campo}>
            <span style={S.lbl}>Fecha</span>
            <input style={S.input} type="date" value={fechaConteo} disabled={!puedeEditar} onChange={(e) => { setFechaConteo(e.target.value); setSucio(true); }} />
          </label>
          <label style={S.campo}>
            <span style={S.lbl}>Capacidad (paq)</span>
            <input style={{ ...S.input, width: 100 }} type="number" min={0} value={capacidad} disabled={!puedeEditar} onChange={(e) => { setCapacidad(e.target.value); setSucio(true); }} />
          </label>
          <label style={{ ...S.campo, flex: 1, minWidth: 160 }}>
            <span style={S.lbl}>Buscar</span>
            <input style={S.input} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="FA01001 o MlbRed…" />
          </label>
          {enCedula && (
            <label style={S.campo}>
              <span style={S.lbl}>Mostrar</span>
              <select style={S.input} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="sin_contar">Sin contar</option>
                <option value="diferencia">Con diferencia ({conDif.length})</option>
              </select>
            </label>
          )}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={S.tabla}>
            <thead>
              <tr>
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
              {visibles.map((f) => {
                const x = enCedula ? f.cedula : f.chuki;
                const dif = enCedula ? f.difCaj : 0;
                const fis = enCedula ? (f.contado ? f.fisicoExcel : null) : f.saldoNum;
                return (
                  <tr key={f.codigo} style={{ ...S.tr, background: enCedula && dif ? "#f8717112" : "transparent" }}>
                    <td style={S.td}>
                      <div style={{ fontWeight: 700 }}>{f.codigo}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{f.articulo || "—"}</div>
                    </td>
                    {["cajas", "paquetes", "cajetillas", "picking"].map((k) => (
                      <td key={k} style={S.tdR}>
                        {enCedula ? (
                          <input style={{ ...S.inputCelda, width: 58 }} type="number" inputMode="numeric" min={0}
                            disabled={!puedeEditar || (k === "cajas" && !f.ppc)} value={x[k]} placeholder="0"
                            onChange={(e) => setCampo(f.codigo, k, e.target.value)} />
                        ) : (
                          <span style={{ color: x[k] ? "#e2e8f0" : "#475569" }}>{x[k] || "–"}</span>
                        )}
                      </td>
                    ))}
                    <td style={{ ...S.tdR, fontSize: 11, color: f.ppc ? "#64748b" : "#f59e0b", whiteSpace: "nowrap" }}>{f.ppc || "¿?"} · {f.cpp}</td>
                    <td style={{ ...S.tdR, whiteSpace: "nowrap" }}>{fis === null ? "—" : fis.toFixed(2)}</td>
                    <td style={{ ...S.tdR, whiteSpace: "nowrap", color: "#94a3b8" }}>{f.saldoNum.toFixed(2)}</td>
                    <td style={{ ...S.tdR, fontWeight: 800, whiteSpace: "nowrap", color: dif === null ? "#475569" : dif ? "#f87171" : "#4ade80" }}>
                      {dif === null ? "—" : fmtDif(dif, f.cpp)}
                    </td>
                  </tr>
                );
              })}
              {!visibles.length && (
                <tr><td colSpan={9} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: 20 }}>
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
          <button style={S.btnExcel} disabled={bajando || !filas.length} onClick={() => descargar(vista)}>
            {bajando ? "Generando…" : `⬇️ Excel ${enCedula ? "Cédula de conteo" : "Chuki"}`}
          </button>
          {enCedula && puedeEditar && (
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

// Excel igual al de la cédula: hoja principal con fórmulas + PICKING + INVENTARIO PWST + Tabla de Conversiones
async function excelInventario({ tipo, filas, pwstFilas, base, clo, fecha, capacidad }) {
  let ExcelJS;
  try { ExcelJS = await cargarExcelJS(); } catch { ExcelJS = null; }
  const nombreHoja = tipo === "chuki" ? "Chuki" : "Cédula de Conteo";
  const archivo = `${tipo === "chuki" ? "CHUKI" : "CEDULA_DE_CONTEO"}_PWST_${fechaPuntos(fecha)}.xlsx`;
  const val = (v) => (v === "" || v === null || v === undefined || Number(v) === 0 ? null : Number(v));

  // Sin internet para el generador con formato: Excel sencillo con los mismos datos
  if (!ExcelJS) {
    const datos = filas.map((f) => ({
      SKU: f.codigo, MARCA: f.articulo, "TOTAL CAJAS": val(f.captura.cajas), "TOTAL PAQUETES": val(f.captura.paquetes),
      "TOTAL CAJETILLAS": val(f.captura.cajetillas), Picking: Number(f.captura.picking) || 0, "PAQUETES X CAJA": f.ppc || null,
      "CAJETILLAS X PAQUETE": f.cpp, "TOTAL INVENTARIO FISICO": tipo === "chuki" ? f.saldoNum : r3((Number(f.captura.cajas) || 0) * f.ppc + (Number(f.captura.paquetes) || 0) + (Number(f.captura.cajetillas) || 0) / 100 + (Number(f.captura.picking) || 0)),
      "TOTAL PWST": f.saldoNum,
    }));
    bajarExcel(datos, [12, 18, 12, 14, 14, 10, 12, 12, 16, 14], nombreHoja.slice(0, 31), archivo);
    return;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART-TRACK";
  const ws = wb.addWorksheet(nombreHoja, { views: [{ showGridLines: false, state: "frozen", ySplit: 7 }] });
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

  // Encabezado superior (cuadros)
  ws.mergeCells("A1:A2"); ws.mergeCells("B1:B2"); ws.mergeCells("C1:D4"); ws.mergeCells("E1:F4"); ws.mergeCells("G1:H4"); ws.mergeCells("I1:J4");
  const caja = (ref, v, sz, fmt) => {
    const c = ws.getCell(ref);
    c.value = v; c.font = { name: "Calibri", bold: true, size: sz }; c.fill = blanco;
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.border = borde;
    if (fmt) c.numFmt = fmt;
  };

  // Filas de productos
  filas.forEach((f, i) => {
    const r = ini + i;
    const C = val(f.captura.cajas), D = val(f.captura.paquetes), E = val(f.captura.cajetillas);
    const F = Number(f.captura.picking) || 0, G = f.ppc || 0, H = f.cpp || 10;
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

  // Totales (fila negra)
  const filaTot = ws.getRow(tot);
  const totales = { 3: [`SUM(C${ini}:C${fin + 1})`, sumC], 4: [`SUM(D${ini}:D${fin + 1})`, sumD], 5: [`SUM(E${ini}:E${fin + 1})`, sumE], 10: [`SUM(J${ini}:J${fin + 1})`, r3(sumJ)], 11: [`SUM(K${ini}:K${fin + 1})`, r3(sumK)] };
  for (const [col, [formula, result]] of Object.entries(totales)) {
    const c = filaTot.getCell(Number(col));
    c.value = { formula, result }; c.fill = negro; c.border = borde;
    c.font = { name: "Calibri", size: 14, color: { argb: "FFFFFFFF" } };
    c.alignment = { horizontal: "center" }; c.numFmt = Number(col) >= 10 ? NUM3 : NUM1;
  }

  // PICKING
  const wp = wb.addWorksheet("PICKING");
  wp.getColumn(1).width = 12; wp.getColumn(2).width = 22; wp.getColumn(3).width = 10;
  const conPick = filas.filter((f) => Number(f.captura.picking) > 0);
  wp.getCell("C1").value = { formula: "SUM(C3:C5000)", result: conPick.reduce((s, f) => s + Number(f.captura.picking), 0) };
  wp.getRow(2).values = ["Codigo", "Descripcion", "Total"];
  wp.getRow(2).font = { bold: true };
  conPick.forEach((f, i) => { wp.getRow(3 + i).values = [f.codigo, f.articulo, Number(f.captura.picking)]; });

  // INVENTARIO PWST (tal cual el reporte)
  const wi = wb.addWorksheet("INVENTARIO PWST");
  [34, 12, 18, 10, 12].forEach((w, i) => { wi.getColumn(i + 1).width = w; });
  wi.getCell("E1").value = { formula: "SUM(E3:E5000)", result: r3(pwstFilas.reduce((s, p) => s + (Number(String(p.saldoTexto).replace(/,/g, "")) || 0), 0)) };
  wi.getRow(2).values = ["Deposito", "Codigo", "Articulo", "Unidades", "Saldo"];
  wi.getRow(2).font = { bold: true };
  pwstFilas.forEach((p, i) => {
    wi.getRow(3 + i).values = [p.deposito || "", p.codigo, p.articulo, p.unidades, Number(String(p.saldoTexto).replace(/,/g, "")) || 0];
  });

  // Tabla de Conversiones
  const wt = wb.addWorksheet("Tabla de Conversiones");
  [12, 22, 10, 18].forEach((w, i) => { wt.getColumn(i + 1).width = w; });
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

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = archivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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
