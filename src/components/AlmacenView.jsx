// @ts-nocheck
// AlmacenView.jsx — Módulo ALMACÉN de SMART-TRACK.
//   • Base de mínimos: catálogo fijo de productos con su mínimo (en cajas). Se carga
//     desde Excel/CSV o se captura a mano y queda guardado; es la base de todo cálculo.
//   • Calcular pedido: se carga el reporte de existencias (Deposito, Codigo, Articulo,
//     Unidades, Saldo…) y se compara contra la base → pedido, menos el sugerido.
//   • Inventario: (siguiente fase).
//
// Saldo viene en formato CAJAS.PAQUETES: 406.03 = 406 cajas y 3 paquetes.
// "Unidades" = paquetes por caja (10 u 8).
//
// Se guarda en data.almacen:
//   base: { FA01001: { articulo, unidades, minimo (cajas) }, … }
//   baseActualizada: { fecha, quien }
//   sugeridos: { FA01001: cajas }      ← se descuentan del pedido
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
      unidades: c.uni >= 0 ? num(f[c.uni]) : null,
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

const fmtExist = (p) => (p.enReporte ? `${p.cajas} cj${p.paquetes ? ` ${p.paquetes} pq` : ""}` : "0 cj");

// La primera vez arma la base con lo que ya existía (mínimos + último reporte)
function baseInicial(alm) {
  if (alm.base) return alm.base;
  const base = {};
  for (const p of alm.ultimaCarga?.filas || []) base[p.codigo] = { articulo: p.articulo, unidades: p.unidades };
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
        <div style={{ ...S.card, textAlign: "center", color: "#94a3b8", padding: 30 }}>
          📦 Inventario — lo armamos en la siguiente fase.
        </div>
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
            Sube un Excel con las columnas <b>Codigo, Articulo, Unidades, Minimo</b> (mínimo en <b>cajas</b>).
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
                <th style={S.thR}>Paq/caja</th>
                <th style={S.thR}>Mínimo (cajas)</th>
                {puedeEditar && <th style={S.th}></th>}
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.codigo} style={S.tr}>
                  <td style={S.td}>{p.codigo}</td>
                  <td style={S.td}>{p.articulo || <span style={{ color: "#64748b" }}>—</span>}</td>
                  <td style={S.tdR}>{p.unidades || 10}</td>
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
  const [unidad, setUnidad] = useState(alm.unidadPedido || "cajas");
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
    setUnidad(alm.unidadPedido || "cajas");
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
        porCodigo.set(codigo, { codigo, articulo: b.articulo || "", unidades: b.unidades || 10, cajas: 0, paquetes: 0, totalPaq: 0, enReporte: false });
      }
    }
    return [...porCodigo.values()].map((p) => {
      const b = base[p.codigo] || {};
      const articulo = p.articulo || b.articulo || "";
      const uds = p.unidades || b.unidades || 10;
      const minCj = b.minimo ?? null;
      const minPaq = minCj === null ? null : Math.round(minCj * uds);
      const faltaPaq = minPaq === null ? null : Math.max(0, minPaq - p.totalPaq);
      const calc = faltaPaq === null ? null : unidad === "cajas" ? Math.ceil(faltaPaq / uds) : faltaPaq;
      const sugCj = sugeridos[p.codigo] ?? null;
      const sug = sugCj === null ? 0 : unidad === "cajas" ? sugCj : Math.round(sugCj * uds);
      const pedir = calc === null ? null : Math.max(0, calc - sug);
      const minMostrar = minCj === null ? null : unidad === "cajas" ? minCj : minPaq;
      return { ...p, articulo, unidades: uds, minCj, minMostrar, calc, sugCj, sug, pedir };
    }).sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [productos, base, sugeridos, unidad]);

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

  const aCajas = (v, uds) => (unidad === "cajas" ? v : Math.round((v / uds) * 100) / 100);

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
    setEstado(`Sugerido de ${v} ${unidad} aplicado a ${lista.length} productos.`);
  }

  async function guardar() {
    setGuardando(true);
    setEstado("Guardando…");
    try {
      await persistFresco((fresca) => ({
        almacen: {
          ...(fresca.almacen || {}),
          sugeridos,
          unidadPedido: unidad,
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
      [12, 10, 28], "Pedido", `pedido_modificado_${unidad}_${hoyISO()}.xlsx`
    );
  }
  function excelCalculado() {
    const lista = calculados.filter((p) => p.calc !== null && p.calc > 0 && p.calc >= u);
    if (!lista.length) { setEstado("No hay nada que pedir con los mínimos actuales."); return; }
    bajarExcel(
      lista.map((p) => ({ "Código FA": p.codigo, "Cantidad": p.calc, "Descripción": p.articulo })),
      [12, 10, 28], "Pedido", `pedido_calculado_${unidad}_${hoyISO()}.xlsx`
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
        <div style={S.nota}>El saldo se lee como <b>cajas.paquetes</b>: 406.03 = 406 cajas y 3 paquetes.</div>
      </div>

      {/* 2. Pedido */}
      {calculados.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitulo}>2 · Pedido</div>
          <div style={S.filtros}>
            <label style={S.campo}>
              <span style={S.lbl}>Pedir en</span>
              <select style={S.input} value={unidad} onChange={(e) => { setUnidad(e.target.value); setSucio(true); }}>
                <option value="cajas">Cajas</option>
                <option value="paquetes">Paquetes</option>
              </select>
            </label>
            <label style={S.campo}>
              <span style={S.lbl}>No pedir si son menos de</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input style={{ ...S.input, width: 70 }} type="number" min={0} value={umbral}
                  onChange={(e) => { setUmbral(e.target.value); setSucio(true); }} />
                <span style={S.sub}>{unidad}</span>
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
            {ocultosChicos > 0 && <span>🙈 {ocultosChicos} ocultos (menos de {u} {unidad})</span>}
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
                  <th style={S.thR}>Calculado</th>
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
                        <div style={{ fontSize: 11, color: "#64748b" }}>{p.unidades} paq/caja{!p.enReporte ? " · no viene en el reporte" : ""}</div>
                      </td>
                      <td style={{ ...S.tdR, whiteSpace: "nowrap" }}>{fmtExist(p)}</td>
                      <td style={{ ...S.tdR, color: p.minMostrar === null ? "#f59e0b" : "#cbd5e1" }}>{p.minMostrar === null ? "sin mín." : p.minMostrar}</td>
                      <td style={{ ...S.tdR, color: "#94a3b8" }}>{p.calc === null ? "—" : p.calc}</td>
                      <td style={S.tdR}>
                        <input style={S.inputCelda} type="number" min={0} disabled={!puedeEditar} placeholder="0"
                          value={p.sugCj === null ? "" : p.sug} onChange={(e) => setSugerido(p.codigo, e.target.value, p.unidades)} />
                      </td>
                      <td style={{ ...S.tdR, fontWeight: 800, fontSize: 15, color: p.pedir > 0 ? "#fbbf24" : "#64748b" }}>
                        {p.pedir === null ? "—" : p.pedir}
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
          <div style={S.nota}>Cantidades en <b>{unidad}</b>. Pedido = (mínimo − existencia) − sugerido.</div>

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
};
