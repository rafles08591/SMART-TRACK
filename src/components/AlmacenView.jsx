// @ts-nocheck
// AlmacenView.jsx — Módulo ALMACÉN de SMART-TRACK.
//   • Calculadora: se pega/carga el reporte de existencias (Deposito, Codigo, Articulo,
//     Unidades, Saldo…), se captura el mínimo de cada producto y calcula cuánto pedir.
//   • Inventario: (siguiente fase).
//
// Saldo viene en formato CAJAS.PAQUETES: 406.03 = 406 cajas y 3 paquetes.
// "Unidades" = paquetes por caja (10 u 8).
//
// Se guarda en data.almacen:
//   { minimos: { FA01001: 50, … } (en CAJAS), ultimaCarga: { fecha, quien, filas: [...] },
//     umbralOcultar, unidadPedido }
//
// Props: data, persistFresco, puedeEditar (bool), quien (nombre de quien usa la pantalla)

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

const hoyISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

// "406.03" con 10 paq/caja → { cajas: 406, paquetes: 3, totalPaq: 4063 }
function leerSaldo(saldo, unidades) {
  const s = String(saldo ?? "").trim();
  if (!s) return null;
  const neg = s.startsWith("-");
  const [ent, dec = ""] = s.replace("-", "").split(".");
  const cajas = Number(ent) || 0;
  // ".03" o ".3" → 3 paquetes (el decimal son paquetes, no fracción)
  const paquetes = dec ? Number(dec.length === 1 ? dec : dec.slice(0, 2)) || 0 : 0;
  const u = unidades || 1;
  const totalPaq = (cajas * u + paquetes) * (neg ? -1 : 1);
  return { cajas: neg ? -cajas : cajas, paquetes, totalPaq };
}

// Convierte el texto/filas del reporte en productos
function parsearFilas(filas) {
  if (!filas.length) return { productos: [], error: "No hay datos." };
  const enc = filas[0].map(norm);
  const col = (...nombres) => enc.findIndex((h) => nombres.some((n) => h === n || h.startsWith(n)));
  const iDep = col("deposito"), iCod = col("codigo"), iArt = col("articulo"), iUni = col("unidades"), iSal = col("saldo");
  if (iCod < 0 || iSal < 0) return { productos: [], error: "No encontré las columnas Codigo y Saldo en la primera fila." };
  const productos = [];
  for (const f of filas.slice(1)) {
    const codigo = String(f[iCod] ?? "").trim().toUpperCase();
    if (!codigo) continue;
    const unidades = num(f[iUni]) || 10;
    const saldo = leerSaldo(f[iSal], unidades);
    if (!saldo) continue;
    productos.push({
      deposito: iDep >= 0 ? String(f[iDep] ?? "").trim() : "",
      codigo,
      articulo: iArt >= 0 ? String(f[iArt] ?? "").trim() : "",
      unidades,
      saldoTexto: String(f[iSal] ?? "").trim(),
      ...saldo,
    });
  }
  return { productos, error: productos.length ? null : "No encontré productos en el archivo." };
}

function textoAFilas(texto) {
  return String(texto || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.includes("\t") ? l.split("\t") : l.split(",")).map((c) => c.trim()));
}

const fmtExist = (p) => `${p.cajas} cj${p.paquetes ? ` ${p.paquetes} pq` : ""}`;

export default function AlmacenView({ data, persistFresco, puedeEditar = true, quien = "" }) {
  const alm = data?.almacen || {};
  const [pestana, setPestana] = useState("calculadora");

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div>
          <div style={S.titulo}>📦 Almacén</div>
          <div style={S.sub}>Existencias, mínimos y pedido de surtido</div>
        </div>
      </div>
      <div style={S.tabs}>
        {[["calculadora", "🧮 Calculadora de pedido"], ["inventario", "📋 Inventario"]].map(([k, l]) => (
          <button key={k} onClick={() => setPestana(k)} style={pestana === k ? S.tabOn : S.tab}>{l}</button>
        ))}
      </div>
      {pestana === "calculadora" && (
        <Calculadora alm={alm} persistFresco={persistFresco} puedeEditar={puedeEditar} quien={quien} />
      )}
      {pestana === "inventario" && (
        <div style={{ ...S.card, textAlign: "center", color: "#94a3b8", padding: 30 }}>
          📋 Inventario — lo armamos en la siguiente fase.
        </div>
      )}
    </div>
  );
}

function Calculadora({ alm, persistFresco, puedeEditar, quien }) {
  const [texto, setTexto] = useState("");
  const [productos, setProductos] = useState(alm.ultimaCarga?.filas || []);
  const [minimos, setMinimos] = useState(alm.minimos || {});
  const [sugeridos, setSugeridos] = useState(alm.sugeridos || {}); // en cajas, como los mínimos
  const [sugTodos, setSugTodos] = useState("");
  const [unidad, setUnidad] = useState(alm.unidadPedido || "cajas"); // cajas | paquetes
  const [umbral, setUmbral] = useState(alm.umbralOcultar ?? 3);
  const [soloPedir, setSoloPedir] = useState(true);
  const [buscar, setBuscar] = useState("");
  const [sucio, setSucio] = useState(false);
  const [estado, setEstado] = useState("");
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef(null);

  // Si alguien más guarda y aquí no hay cambios pendientes, refrescar
  useEffect(() => {
    if (sucio) return;
    setMinimos(alm.minimos || {});
    setSugeridos(alm.sugeridos || {});
    if (alm.ultimaCarga?.filas) setProductos(alm.ultimaCarga.filas);
    setUnidad(alm.unidadPedido || "cajas");
    setUmbral(alm.umbralOcultar ?? 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alm]);

  function cargar(filas) {
    const r = parsearFilas(filas);
    if (r.error) { setEstado("⚠️ " + r.error); return; }
    setProductos(r.productos);
    setSucio(true);
    setEstado(`✅ ${r.productos.length} productos cargados. Revisa los mínimos y da clic en Guardar.`);
  }

  async function leerArchivo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
        cargar(filas.filter((f) => f.some((c) => String(c).trim())));
      } else {
        cargar(textoAFilas(await file.text()));
      }
    } catch (err) {
      setEstado("❌ No pude leer el archivo: " + (err?.message || err));
    }
  }

  // Cálculo del pedido por producto
  const calculados = useMemo(() => productos.map((p) => {
    const minCj = num(minimos[p.codigo]);
    const minPaq = minCj === null ? null : Math.round(minCj * p.unidades);
    const faltaPaq = minPaq === null ? null : Math.max(0, minPaq - p.totalPaq);
    const pedirCj = faltaPaq === null ? null : Math.ceil(faltaPaq / p.unidades);
    const calc = faltaPaq === null ? null : unidad === "cajas" ? pedirCj : faltaPaq;
    // Sugerido del sistema: se descuenta del pedido calculado
    const sugCj = num(sugeridos[p.codigo]);
    const sug = sugCj === null ? 0 : unidad === "cajas" ? sugCj : Math.round(sugCj * p.unidades);
    const pedir = calc === null ? null : Math.max(0, calc - sug);
    return { ...p, minCj, faltaPaq, pedirCj, calc, sugCj, sug, pedir };
  }), [productos, minimos, sugeridos, unidad]);

  const u = Number(umbral) || 0;
  const visibles = calculados.filter((p) => {
    if (buscar && !norm(`${p.codigo} ${p.articulo}`).includes(norm(buscar))) return false;
    if (soloPedir) return p.pedir !== null && p.pedir > 0 && p.pedir >= u;
    return true;
  });
  const aPedir = calculados.filter((p) => p.pedir !== null && p.pedir > 0 && p.pedir >= u);
  const ocultosChicos = calculados.filter((p) => p.pedir !== null && p.pedir > 0 && p.pedir < u).length;
  const sinMinimo = calculados.filter((p) => p.minCj === null).length;

  function setMinimo(codigo, valor, unidadesCaja) {
    // El mínimo se guarda en cajas; si la pantalla está en paquetes se convierte
    const v = valor === "" ? "" : Number(valor);
    setMinimos((m) => {
      const n = { ...m };
      if (v === "" || !Number.isFinite(v)) delete n[codigo];
      else n[codigo] = unidad === "cajas" ? v : Math.round((v / unidadesCaja) * 100) / 100;
      return n;
    });
    setSucio(true);
    setEstado("");
  }

  const aCajas = (v, unidadesCaja) => unidad === "cajas" ? v : Math.round((v / unidadesCaja) * 100) / 100;

  function setSugerido(codigo, valor, unidadesCaja) {
    const v = valor === "" ? "" : Number(valor);
    setSugeridos((m) => {
      const n = { ...m };
      if (v === "" || !Number.isFinite(v)) delete n[codigo];
      else n[codigo] = aCajas(v, unidadesCaja);
      return n;
    });
    setSucio(true);
    setEstado("");
  }

  // Aplica el mismo sugerido a todas las variantes (o solo a las que se ven con el filtro/búsqueda)
  function aplicarSugeridoATodos(soloVisibles) {
    const v = Number(sugTodos);
    if (sugTodos === "" || !Number.isFinite(v) || v < 0) { setEstado("Escribe un sugerido válido para aplicar."); return; }
    const lista = soloVisibles ? visibles : calculados;
    setSugeridos((m) => {
      const n = { ...m };
      for (const p of lista) n[p.codigo] = aCajas(v, p.unidades);
      return n;
    });
    setSucio(true);
    setEstado(`Sugerido de ${v} ${unidad} aplicado a ${lista.length} productos.`);
  }

  function limpiarSugeridos() {
    setSugeridos({});
    setSucio(true);
    setEstado("Sugeridos borrados.");
  }

  async function guardar() {
    setGuardando(true);
    setEstado("Guardando…");
    try {
      await persistFresco((fresca) => ({
        almacen: {
          ...(fresca.almacen || {}),
          minimos,
          sugeridos,
          unidadPedido: unidad,
          umbralOcultar: Number(umbral) || 0,
          ultimaCarga: { fecha: new Date().toISOString(), quien, filas: productos },
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

  function descargarExcel() {
    // Pedido calculado ANTES de descontar el sugerido
    const lista = calculados.filter((p) => p.calc !== null && p.calc > 0 && p.calc >= u);
    if (!lista.length) { setEstado("No hay nada que pedir con los mínimos y el filtro actuales."); return; }
    const etiqueta = unidad === "cajas" ? "Cajas a surtir" : "Paquetes a surtir";
    const filas = lista.map((p) => ({ "FA": p.codigo, "Descripción": p.articulo, [etiqueta]: p.calc }));
    const ws = XLSX.utils.json_to_sheet(filas);
    ws["!cols"] = [{ wch: 12 }, { wch: 24 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedido");
    XLSX.writeFile(wb, `pedido_almacen_${hoyISO()}.xlsx`);
  }

  // Excel ya modificado: pedido final (calculado − sugerido) con código FA, cantidad y descripción
  function descargarExcelModificado() {
    if (!aPedir.length) { setEstado("No queda nada que pedir después de descontar el sugerido."); return; }
    const filas = aPedir.map((p) => ({ "Código FA": p.codigo, "Cantidad": p.pedir, "Descripción": p.articulo }));
    const ws = XLSX.utils.json_to_sheet(filas);
    ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedido modificado");
    XLSX.writeFile(wb, `pedido_modificado_${unidad}_${hoyISO()}.xlsx`);
  }

  const ultima = alm.ultimaCarga?.fecha
    ? `Última carga guardada: ${new Date(alm.ultimaCarga.fecha).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "short" })}${alm.ultimaCarga.quien ? ` · ${alm.ultimaCarga.quien}` : ""}`
    : "Todavía no se ha cargado ningún reporte.";

  return (
    <div>
      {/* 1. Cargar existencias */}
      <div style={S.card}>
        <div style={S.cardTitulo}>1 · Cargar existencias</div>
        <div style={S.sub}>{ultima}</div>
        <textarea
          style={S.textarea}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={"Pega aquí el reporte (con la fila de encabezados):\nDeposito,Codigo,Articulo,Unidades,Saldo,Saldo<br>Fisico,Diferencia\n2385 - ALMACEN CENTRAL VALLARTA,FA01001,MlbRed20CD,10,406.03,…"}
        />
        <div style={S.botones}>
          <button style={S.btnPrimario} onClick={() => cargar(textoAFilas(texto))} disabled={!texto.trim()}>Procesar texto</button>
          <button style={S.btnSec} onClick={() => fileRef.current?.click()}>Subir archivo (CSV / Excel)</button>
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" style={{ display: "none" }} onChange={leerArchivo} />
        </div>
        <div style={S.nota}>El saldo se lee como <b>cajas.paquetes</b>: 406.03 = 406 cajas y 3 paquetes (con 10 paquetes por caja).</div>
      </div>

      {/* 2. Mínimos y pedido */}
      {productos.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitulo}>2 · Mínimos y pedido</div>
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
                <input style={{ ...S.input, width: 80 }} type="number" min={0} value={umbral}
                  onChange={(e) => { setUmbral(e.target.value); setSucio(true); }} />
                <span style={S.sub}>{unidad}</span>
              </div>
            </label>
            <label style={{ ...S.campo, flex: 1, minWidth: 180 }}>
              <span style={S.lbl}>Buscar producto</span>
              <input style={S.input} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="FA01001 o MlbRed…" />
            </label>
            <button type="button" style={{ ...S.btnSec, alignSelf: "flex-end" }} onClick={() => setSoloPedir((v) => !v)}>
              {soloPedir ? "Ver todos los productos" : "Ver solo lo que hay que pedir"}
            </button>
          </div>

          {puedeEditar && (
            <div style={{ ...S.filtros, padding: 10, borderRadius: 12, border: "1px dashed #f59e0b55" }}>
              <label style={S.campo}>
                <span style={S.lbl}>Sugerido del sistema (se descuenta del pedido)</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input style={{ ...S.input, width: 90 }} type="number" min={0} value={sugTodos}
                    onChange={(e) => setSugTodos(e.target.value)} placeholder="0" />
                  <span style={S.sub}>{unidad}</span>
                </div>
              </label>
              <button type="button" style={S.btnSec} onClick={() => aplicarSugeridoATodos(false)}>Aplicar a todas las variantes</button>
              {(buscar || soloPedir) && (
                <button type="button" style={S.btnSec} onClick={() => aplicarSugeridoATodos(true)}>Aplicar solo a las que se ven ({visibles.length})</button>
              )}
              {Object.keys(sugeridos).length > 0 && (
                <button type="button" style={{ ...S.btnSec, borderColor: "#f87171", color: "#f87171" }} onClick={limpiarSugeridos}>Borrar sugeridos</button>
              )}
              <span style={{ ...S.nota, flexBasis: "100%" }}>También puedes cambiar el sugerido de cada producto en su renglón. Pedido final = a surtir − sugerido.</span>
            </div>
          )}

          <div style={S.resumen}>
            <span>🛒 <b>{aPedir.length}</b> productos a pedir</span>
            {ocultosChicos > 0 && <span>🙈 {ocultosChicos} ocultos por ser menos de {u} {unidad}</span>}
            {sinMinimo > 0 && <span style={{ color: "#f59e0b" }}>⚠️ {sinMinimo} sin mínimo capturado</span>}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={S.tabla}>
              <thead>
                <tr>
                  <th style={S.th}>FA</th>
                  <th style={S.th}>Descripción</th>
                  <th style={{ ...S.th, textAlign: "right" }}>Existencia</th>
                  <th style={{ ...S.th, textAlign: "right" }}>Mínimo ({unidad})</th>
                  <th style={{ ...S.th, textAlign: "right" }}>Calculado</th>
                  <th style={{ ...S.th, textAlign: "right" }}>Sugerido ({unidad})</th>
                  <th style={{ ...S.th, textAlign: "right" }}>Pedido final ({unidad})</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const minMostrar = p.minCj === null ? "" : unidad === "cajas" ? p.minCj : Math.round(p.minCj * p.unidades);
                  const chico = p.pedir !== null && p.pedir > 0 && p.pedir < u;
                  return (
                    <tr key={p.codigo} style={{ borderTop: "1px solid #1e2a42", opacity: chico ? 0.45 : 1 }}>
                      <td style={S.td}>{p.codigo}</td>
                      <td style={S.td}>{p.articulo}<div style={{ fontSize: 11, color: "#64748b" }}>{p.unidades} paq/caja</div></td>
                      <td style={{ ...S.td, textAlign: "right", whiteSpace: "nowrap" }}>{fmtExist(p)}</td>
                      <td style={{ ...S.td, textAlign: "right" }}>
                        <input
                          style={{ ...S.input, width: 90, textAlign: "right", padding: "6px 8px" }}
                          type="number" min={0} disabled={!puedeEditar} value={minMostrar}
                          onChange={(e) => setMinimo(p.codigo, e.target.value, p.unidades)}
                        />
                      </td>
                      <td style={{ ...S.td, textAlign: "right", color: "#94a3b8" }}>{p.calc === null ? "—" : p.calc}</td>
                      <td style={{ ...S.td, textAlign: "right" }}>
                        <input
                          style={{ ...S.input, width: 80, textAlign: "right", padding: "6px 8px" }}
                          type="number" min={0} disabled={!puedeEditar} placeholder="0"
                          value={p.sugCj === null ? "" : p.sug}
                          onChange={(e) => setSugerido(p.codigo, e.target.value, p.unidades)}
                        />
                      </td>
                      <td style={{ ...S.td, textAlign: "right", fontWeight: 800, color: p.pedir > 0 ? "#fbbf24" : "#64748b" }}>
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

          <div style={{ ...S.botones, position: "sticky", bottom: 0, background: "linear-gradient(transparent, #0b1220 35%)", padding: "14px 0 4px" }}>
            {puedeEditar && (
              <button style={{ ...S.btnPrimario, opacity: sucio && !guardando ? 1 : 0.45 }} disabled={!sucio || guardando} onClick={guardar}>
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            )}
            <button style={{ ...S.btnSec, borderStyle: "solid" }} onClick={descargarExcel}>⬇️ Excel calculado (sin sugerido)</button>
            <button style={S.btnExcel} onClick={descargarExcelModificado}>⬇️ Exportar Excel modificado</button>
            <span style={{ fontSize: 12, color: sucio ? "#f59e0b" : "#94a3b8" }}>{sucio ? "Tienes cambios sin guardar" : estado}</span>
          </div>
        </div>
      )}
      {!productos.length && estado && <div style={S.estado}>{estado}</div>}
    </div>
  );
}

const S = {
  wrap: { padding: 16, color: "#e2e8f0", maxWidth: 1000, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  titulo: { fontSize: 22, fontWeight: 800 },
  sub: { fontSize: 13, color: "#94a3b8" },
  tabs: { display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" },
  tab: { padding: "8px 14px", borderRadius: 999, border: "1px solid #334155", background: "transparent", color: "#cbd5e1", cursor: "pointer", fontSize: 14 },
  tabOn: { padding: "8px 14px", borderRadius: 999, border: "1px solid #f59e0b", background: "#f59e0b22", color: "#f59e0b", cursor: "pointer", fontSize: 14, fontWeight: 700 },
  card: { padding: 14, borderRadius: 14, border: "1px solid #ffffff1a", background: "#ffffff08", marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 },
  cardTitulo: { fontSize: 15, fontWeight: 800, color: "#f8fafc" },
  textarea: { width: "100%", minHeight: 140, padding: 12, borderRadius: 12, border: "1px solid #334155", background: "#0b1220", color: "#e2e8f0", fontSize: 13, fontFamily: "ui-monospace, Menlo, monospace", boxSizing: "border-box" },
  botones: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  btnPrimario: { padding: "10px 18px", borderRadius: 12, border: "none", background: "#22c55e", color: "#04130a", fontWeight: 800, cursor: "pointer" },
  btnSec: { padding: "10px 14px", borderRadius: 12, border: "1px dashed #22d3ee", background: "transparent", color: "#22d3ee", cursor: "pointer", fontWeight: 700 },
  btnExcel: { padding: "10px 16px", borderRadius: 12, border: "1px solid #f59e0b", background: "#f59e0b1a", color: "#fbbf24", cursor: "pointer", fontWeight: 800 },
  nota: { fontSize: 12, color: "#94a3b8", lineHeight: 1.5 },
  filtros: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" },
  campo: { display: "flex", flexDirection: "column", gap: 4 },
  lbl: { fontSize: 12, color: "#94a3b8" },
  input: { padding: "9px 10px", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", color: "#e2e8f0", fontSize: 14 },
  resumen: { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#cbd5e1" },
  tabla: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "8px 10px", textAlign: "left", color: "#94a3b8", fontWeight: 600, whiteSpace: "nowrap" },
  td: { padding: "8px 10px", verticalAlign: "middle" },
  estado: { marginTop: 10, padding: "8px 12px", borderRadius: 10, background: "#0f172a", border: "1px solid #334155", fontSize: 14 },
};
