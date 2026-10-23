// @ts-nocheck
// RemisionesView.jsx — Almacén → 🧾 Remisiones.
// Se suben las fotos (o el PDF) de la remisión de Philip Morris y la app:
//   1) lee cada página con OCR (api/remision-ocr.js),
//   2) ubica cada renglón por su EAN y le asigna el código FA de SMART-TRACK,
//   3) escribe ese código en la foto, a la derecha de la cantidad (como se hace hoy con pluma),
//   4) deja descargar las fotos marcadas en PDF y la lista en Excel.
// Equivalencias EAN → código FA en data.almacen.equivalencias (se aprenden y se pueden editar).
// Remisiones procesadas en data.almacen.remisiones (solo datos, sin fotos).
import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";

// Equivalencias conocidas (de las remisiones que ya traían el código a mano)
export const EQUIVALENCIAS_BASE = {
  "75084202": "FA04016", // FAROS FARITOS KS BOB 25
  "75086183": "FA04017", // FAROS FARITOS KS BOX 20
  "75001322": "FA01001", // MARLBORO RED 3.5 LS BOX 20
  "75001339": "FA01003", // MARLBORO RED 3.5 LS BOX 14
  "75021597": "FA01006", // MARLBORO RED 3.5 100 BOX 20
  "75068738": "FA01046", // MARLBORO GOLD (3.5) KS RCB 20
  "75068844": "FA01047", // MARLBORO GOLD (3.5) KS RCB 14
  "75068769": "FA01050", // MARLBORO DFUSIONV MNT 100 RCB 20
  "75063801": "FA01085", // MARLBORO C3IM MNT 100 BOX 20
};

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const JSPDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const scripts = {};
function cargarScript(src, global) {
  if (window[global]) return Promise.resolve(window[global]);
  if (!scripts[src]) {
    scripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => (window[global] ? resolve(window[global]) : reject(new Error("no cargó " + global)));
      s.onerror = () => reject(new Error("No se pudo descargar " + global + " (revisa internet)"));
      document.head.appendChild(s);
    });
  }
  return scripts[src];
}

const hoyISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const codigoCorto = (fa) => String(fa || "").toUpperCase().replace(/^FA/, ""); // FA04016 → 04016 (como lo escriben)
const aFA = (c) => {
  const d = String(c || "").toUpperCase().replace(/[O]/g, "0").replace(/[^0-9A-Z]/g, "");
  if (!d) return "";
  return d.startsWith("FA") ? d : `FA${d}`;
};

// ─────────────────── Lectura de la página (pura, sin React) ───────────────────
// palabras: [{ t, x, y, w, h }] → filas agrupadas por altura
export function agruparFilas(palabras) {
  const ws = [...palabras].filter((p) => p.t && p.h > 0).sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const filas = [];
  for (const w of ws) {
    const cy = w.y + w.h / 2;
    const f = filas.find((r) => Math.abs(r.cy - cy) < Math.max(8, Math.min(r.h, w.h) * 0.6));
    if (f) { f.ws.push(w); f.cy = (f.cy * (f.ws.length - 1) + cy) / f.ws.length; f.h = Math.max(f.h, w.h); }
    else filas.push({ cy, h: w.h, ws: [w] });
  }
  for (const f of filas) f.ws.sort((a, b) => a.x - b.x);
  return filas;
}

const numero = (t) => {
  const s = String(t).replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;
  return Number(s.replace(/,/g, ""));
};

// Encuentra los renglones de producto (los que traen EAN) y lo demás de la remisión
export function leerPagina(palabras, equivalencias) {
  const texto = palabras.map((p) => p.t).join(" ");
  const pegado = texto.replace(/\s+/g, "").toUpperCase(); // "R E M I S I O N" → "REMISION"
  // En la remisión cada renglón trae la clave FA de Philip Morris; en la factura no.
  const traeClaves = palabras.some((p) => /^FA\d{6}/i.test(p.t));
  const esRemision = /REMISI[OÓ0]N/.test(pegado) || traeClaves;
  const esFactura = !esRemision && /FACTURA|CFDI|FOLIOFISCAL/.test(pegado);
  // Totales impresos al pie: "Total CAJ 34,040   Total PAQ 3,440"
  const mCaj = texto.match(/Total\s*CAJ\.?\s*([\d,\.]+)/i);
  const mPaq = texto.match(/Total\s*PAQ\.?\s*([\d,\.]+)/i);
  const totalImpreso = { cajetillas: mCaj ? numero(mCaj[1]) : null, paquetes: mPaq ? numero(mPaq[1]) : null };
  const folio = (texto.match(/\b(K[A-Z]\d{5,7})\b/) || [])[1] || "";
  const fecha = (texto.match(/\b(\d{2}\/\d{2}\/20\d{2})\b/) || [])[1] || "";
  const filas = agruparFilas(palabras);
  const renglones = [];
  for (const f of filas) {
    const iEan = f.ws.findIndex((w) => /^7\d{7}$/.test(w.t.replace(/\D/g, "")) && w.t.replace(/\D/g, "").length === 8);
    if (iEan < 0) continue;
    const ean = f.ws[iEan].t.replace(/\D/g, "");
    const clave = (f.ws.find((w) => /^FA\d{5,6}/i.test(w.t)) || {}).t || "";
    const iClave = f.ws.findIndex((w) => /^FA\d{5,6}/i.test(w.t));
    const descripcion = f.ws.slice(iClave >= 0 ? iClave + 1 : 0, iEan).map((w) => w.t).join(" ").trim();
    // A la derecha del EAN: unidad (PIEZA), cajetillas, [código a mano], paquetes
    const despues = f.ws.slice(iEan + 1).filter((w) => !/^pieza$/i.test(w.t));
    // Código escrito a mano: 5 dígitos que empiezan con 0 (la O también cuenta como 0)
    let aMano = "";
    const nums = [];
    for (const w of despues) {
      const limpio = w.t.replace(/[Oo]/g, "0").replace(/[^\d,]/g, "");
      if (/^0\d{4}$/.test(limpio) && !aMano) { aMano = limpio; continue; }
      const n = numero(w.t);
      if (n !== null) nums.push({ n, w });
    }
    let cajetillas = nums.length ? nums[0].n : null;
    let paquetes = nums.length > 1 ? nums[nums.length - 1].n : null;
    // Cuadre: paquetes = cajetillas / 10 (o /8 en los de 25). Si el OCR pegó un número escrito a mano
    // ("61200" en vez de "1,200") se corrige con el que sí cuadra.
    const cuadra = (c, q) => c && q && (c === q * 10 || c === q * 8);
    let revisar = false;
    if (cajetillas && !cuadra(cajetillas, paquetes)) {
      const p10 = cajetillas / 10, p8 = cajetillas / 8;
      if (paquetes && String(paquetes).endsWith(String(p10))) paquetes = p10;
      else if (paquetes && Number.isInteger(p8) && String(paquetes).endsWith(String(p8))) paquetes = p8;
      else if (paquetes && (paquetes * 10 > cajetillas * 3 || !paquetes)) { paquetes = Math.round(p10); revisar = true; }
      else if (paquetes) { cajetillas = paquetes * 10; revisar = true; } // la cantidad en cajetillas venía mal leída
      else { paquetes = Math.round(p10); revisar = true; }
    }
    const fa = equivalencias[ean] || (aMano ? aFA(aMano) : "");
    renglones.push({
      ean, clave, descripcion, cajetillas, paquetes,
      codigo: fa, origen: equivalencias[ean] ? "equivalencia" : aMano ? "escrito a mano" : "", revisar,
      yaEscrito: !!aMano,
      // Dónde escribir: a la derecha de la cantidad en cajetillas (o al 78% del ancho si no se ubicó)
      pos: {
        x: nums.length ? nums[0].w.x + nums[0].w.w : null,
        // hasta dónde cabe (inicio de la cantidad en paquetes)
        xFin: nums.length > 1 ? nums[nums.length - 1].w.x : null,
        cy: f.cy, h: f.h,
      },
    });
  }
  // Si solo un renglón quedó dudoso, se completa con el total impreso de la remisión
  const dudosos = renglones.filter((r) => r.revisar || r.paquetes === null);
  if (totalImpreso.paquetes && dudosos.length === 1) {
    const r = dudosos[0];
    const resto = renglones.filter((x) => x !== r);
    const paq = totalImpreso.paquetes - resto.reduce((a, x) => a + (x.paquetes || 0), 0);
    const caj = totalImpreso.cajetillas ? totalImpreso.cajetillas - resto.reduce((a, x) => a + (x.cajetillas || 0), 0) : null;
    if (paq > 0) { r.paquetes = paq; r.cajetillas = caj > 0 ? caj : paq * 10; r.revisar = false; r.porTotal = true; }
  }
  return { esRemision, esFactura, folio, fecha, renglones, totalImpreso };
}

// ─────────────────── Imágenes ───────────────────
function cargarImagen(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
// Reduce la foto hasta que pese menos de ~900 KB (límite del OCR gratis: 1 MB)
async function comprimir(canvasOrigen) {
  let ancho = Math.min(1800, canvasOrigen.width);
  for (let intento = 0; intento < 6; intento++) {
    const c = document.createElement("canvas");
    c.width = ancho; c.height = Math.round(canvasOrigen.height * (ancho / canvasOrigen.width));
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(canvasOrigen, 0, 0, c.width, c.height);
    const calidad = intento < 3 ? 0.75 - intento * 0.1 : 0.55;
    const url = c.toDataURL("image/jpeg", calidad);
    if (url.length * 0.75 < 900 * 1024) return { url, ancho: c.width, alto: c.height };
    if (intento >= 2) ancho = Math.round(ancho * 0.85);
  }
  throw new Error("La foto es demasiado pesada");
}
async function archivoAPaginas(file) {
  const canvases = [];
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdfjsLib = await cargarScript(PDFJS, "pdfjsLib");
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 1800 / vp0.width });
      const c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      canvases.push(c);
    }
  } else {
    const url = URL.createObjectURL(file);
    try {
      const img = await cargarImagen(url);
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      canvases.push(c);
    } finally { URL.revokeObjectURL(url); }
  }
  return Promise.all(canvases.map(comprimir));
}

// Escribe los códigos en la foto (azul, como pluma). Los renglones que ya traían el código a mano se dejan igual.
export async function marcarPagina(pagina) {
  const img = await cargarImagen(pagina.url);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  for (const r of pagina.renglones) {
    if (!r.codigo || r.yaEscrito) continue;
    const texto = codigoCorto(r.codigo);
    const fuente = (t) => `bold ${t}px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`;
    // Grande, como cuando se escribe con pluma: ~2.4 veces la altura del renglón
    let tam = Math.max(30, Math.round(r.pos.h * 2.4));
    const x = r.pos.x !== null ? r.pos.x + r.pos.h * 0.4 : c.width * 0.78;
    // Solo se achica si se saldría de la hoja
    ctx.font = fuente(tam);
    while (tam > 18 && x + ctx.measureText(texto).width > c.width * 0.99) { tam -= 1; ctx.font = fuente(tam); }
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, tam * 0.12);
    ctx.strokeStyle = "rgba(255,255,255,0.9)"; // contorno blanco para que se lea sobre las líneas
    ctx.strokeText(texto, x, r.pos.cy);
    ctx.fillStyle = "#1f3fbf";
    ctx.fillText(texto, x, r.pos.cy);
  }
  return c.toDataURL("image/jpeg", 0.85);
}

async function ocr(url) {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  if (!token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  const r = await fetch("/api/remision-ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ imagen: url }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j.palabras || [];
}

// ─────────────────── Pantalla ───────────────────
export default function RemisionesView({ alm, persistFresco, puedeEditar, quien, fechaDoc, S }) {
  const [equiv, setEquiv] = useState({ ...EQUIVALENCIAS_BASE, ...(alm.equivalencias || {}) });
  const [paginas, setPaginas] = useState([]); // [{ url, ancho, alto, esRemision, folio, fecha, renglones, marcada }]
  const [estado, setEstado] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { setEquiv((e) => ({ ...EQUIVALENCIAS_BASE, ...(alm.equivalencias || {}), ...e })); }, [alm.equivalencias]);

  async function subir(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setTrabajando(true);
    const nuevas = [];
    try {
      let n = 0;
      for (const f of files) {
        setEstado(`Abriendo ${f.name}…`);
        const pags = await archivoAPaginas(f);
        for (const p of pags) {
          n++;
          setEstado(`Leyendo página ${n}…`);
          const palabras = await ocr(p.url);
          const info = leerPagina(palabras, equiv);
          nuevas.push({ ...p, ...info, nombre: f.name });
        }
      }
      // Aprender: lo escrito a mano que todavía no está en la tabla
      const aprendidas = {};
      for (const p of nuevas) for (const r of p.renglones) if (r.yaEscrito && r.codigo && !equiv[r.ean]) aprendidas[r.ean] = r.codigo;
      if (Object.keys(aprendidas).length) setEquiv((q) => ({ ...q, ...aprendidas }));
      for (const p of nuevas) p.marcada = p.esRemision && p.renglones.length ? await marcarPagina(p) : null;
      setPaginas((prev) => [...prev, ...nuevas]);
      const rem = nuevas.filter((p) => p.esRemision);
      const sinCod = rem.reduce((s, p) => s + p.renglones.filter((r) => !r.codigo).length, 0);
      setEstado(`✅ ${nuevas.length} páginas leídas: ${rem.length} remisiones con ${rem.reduce((s, p) => s + p.renglones.length, 0)} renglones`
        + (nuevas.length - rem.length ? ` · ${nuevas.length - rem.length} facturas u otras (sin marcar)` : "")
        + (sinCod ? ` · ⚠️ ${sinCod} sin código: escríbelo abajo` : ""));
    } catch (err) {
      setEstado("❌ " + (err?.message || err));
      if (nuevas.length) setPaginas((prev) => [...prev, ...nuevas]);
    } finally {
      setTrabajando(false);
    }
  }

  // Cambiar el código de un renglón (y recordar la equivalencia de ese EAN)
  async function cambiarCodigo(ip, ir, valor) {
    const fa = valor ? aFA(valor) : "";
    const ean = paginas[ip].renglones[ir].ean;
    setEquiv((q) => ({ ...q, [ean]: fa }));
    const copia = paginas.map((p) => ({ ...p, renglones: p.renglones.map((r) => (r.ean === ean ? { ...r, codigo: fa, origen: "capturado" } : r)) }));
    for (const p of copia) if (p.esRemision && p.renglones.some((r) => r.ean === ean)) p.marcada = await marcarPagina(p);
    setPaginas(copia);
  }

  const renglones = paginas.flatMap((p) => (p.esRemision ? p.renglones.map((r) => ({ ...r, folio: p.folio, fecha: p.fecha })) : []));

  async function guardar() {
    setGuardando(true);
    try {
      const nuevasEq = Object.fromEntries(Object.entries(equiv).filter(([k, v]) => v && EQUIVALENCIAS_BASE[k] !== v));
      const registro = paginas.filter((p) => p.esRemision).map((p) => ({
        folio: p.folio, fecha: p.fecha,
        renglones: p.renglones.map(({ ean, clave, descripcion, cajetillas, paquetes, codigo }) => ({ ean, clave, descripcion, cajetillas, paquetes, codigo })),
      }));
      await persistFresco((fresca) => {
        const a = fresca.almacen || {};
        const previas = (a.remisiones || []).filter((r) => !registro.some((n) => n.folio && n.folio === r.folio));
        return {
          almacen: {
            ...a,
            equivalencias: { ...(a.equivalencias || {}), ...nuevasEq },
            remisiones: [...registro.map((r) => ({ ...r, cargada: new Date().toISOString(), quien })), ...previas].slice(0, 200),
          },
        };
      });
      setEstado("✅ Guardado: equivalencias y remisiones.");
    } catch (err) {
      setEstado("❌ No se pudo guardar: " + (err?.message || err));
    } finally {
      setGuardando(false);
    }
  }

  async function descargarPDF() {
    const marcadas = paginas.filter((p) => p.marcada || p.url);
    if (!marcadas.length) return;
    setTrabajando(true);
    try {
      const { jsPDF } = await cargarScript(JSPDF, "jspdf");
      let doc = null;
      for (const p of marcadas) {
        const w = p.ancho, h = p.alto;
        const orient = w > h ? "l" : "p";
        if (!doc) doc = new jsPDF({ orientation: orient, unit: "px", format: [w, h], compress: true });
        else doc.addPage([w, h], orient);
        doc.addImage(p.marcada || p.url, "JPEG", 0, 0, w, h);
      }
      const folios = [...new Set(paginas.map((p) => p.folio).filter(Boolean))].join("_") || "remision";
      doc.save(`REMISION_${folios}_CON_CODIGOS.pdf`);
    } catch (err) {
      setEstado("❌ No se pudo armar el PDF: " + (err?.message || err));
    } finally {
      setTrabajando(false);
    }
  }

  function descargarExcel() {
    if (!renglones.length) return;
    const filas = renglones.map((r) => ({
      Folio: r.folio, Fecha: r.fecha, "Código FA": r.codigo, Descripción: r.descripcion, EAN: r.ean,
      "Clave PM": r.clave, Cajetillas: r.cajetillas, Paquetes: r.paquetes,
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    ws["!cols"] = [10, 11, 11, 34, 11, 13, 11, 10].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Remisión");
    XLSX.writeFile(wb, `REMISION_${fechaDoc || hoyISO()}.xlsx`);
  }

  const total = renglones.reduce((a, r) => ({ caj: a.caj + (r.cajetillas || 0), paq: a.paq + (r.paquetes || 0) }), { caj: 0, paq: 0 });

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardTitulo}>🧾 Remisiones con código</div>
        <div style={S.nota}>
          Sube las fotos de la remisión (o el PDF escaneado). La app lee cada renglón por su EAN, le pone el
          <b> código FA</b> y lo escribe en la foto a la derecha de la cantidad, como se hace con pluma. Las facturas se leen pero no se marcan.
        </div>
        <div style={S.botones}>
          {puedeEditar && (
            <button style={S.btnPrimario} disabled={trabajando} onClick={() => fileRef.current?.click()}>
              {trabajando ? "Leyendo…" : "📷 Subir fotos / PDF"}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }} onChange={subir} />
          {paginas.length > 0 && <button style={S.btnSec} disabled={trabajando} onClick={() => { setPaginas([]); setEstado(""); }}>Limpiar</button>}
        </div>
        {estado && <div style={{ fontSize: 12.5, color: estado.startsWith("❌") ? "#f87171" : "#cbd5e1" }}>{estado}</div>}
      </div>

      {renglones.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitulo}>Renglones leídos</div>
          <div style={{ overflowX: "auto" }}>
            <table style={S.tabla}>
              <thead>
                <tr>
                  <th style={S.th}>Folio</th>
                  <th style={S.th}>Descripción</th>
                  <th style={S.th}>EAN</th>
                  <th style={S.thR}>Cajetillas</th>
                  <th style={S.thR}>Paquetes</th>
                  <th style={S.thR}>Código FA</th>
                </tr>
              </thead>
              <tbody>
                {paginas.map((p, ip) => p.esRemision && p.renglones.map((r, ir) => (
                  <tr key={`${ip}-${ir}`} style={S.tr}>
                    <td style={{ ...S.td, fontSize: 12, color: "#94a3b8" }}>{p.folio || "—"}</td>
                    <td style={S.td}>{r.descripcion || r.clave}</td>
                    <td style={{ ...S.td, fontSize: 12, color: "#94a3b8" }}>{r.ean}</td>
                    <td style={{ ...S.tdR, color: r.revisar ? "#f59e0b" : undefined }}>{r.cajetillas?.toLocaleString("es-MX") ?? "—"}</td>
                    <td style={{ ...S.tdR, color: r.revisar ? "#f59e0b" : undefined }}>{r.paquetes?.toLocaleString("es-MX") ?? "—"}{r.revisar && " ⚠️"}</td>
                    <td style={S.tdR}>
                      <input
                        style={{ ...S.inputCelda, width: 90, borderColor: r.codigo ? "#334155" : "#f59e0b" }}
                        defaultValue={r.codigo} placeholder="FA0…" disabled={!puedeEditar}
                        onBlur={(e) => { if (aFA(e.target.value) !== r.codigo) cambiarCodigo(ip, ir, e.target.value); }}
                      />
                      <div style={{ fontSize: 10, color: "#64748b" }}>{r.origen}</div>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          <div style={S.resumen}>
            <span>📦 {renglones.length} renglones</span>
            <span>Total cajetillas: <b>{total.caj.toLocaleString("es-MX")}</b></span>
            <span>Total paquetes: <b>{total.paq.toLocaleString("es-MX")}</b></span>
          </div>
          {paginas.filter((p) => p.esRemision && p.totalImpreso?.paquetes).map((p, k) => {
            const suma = p.renglones.reduce((a, r) => a + (r.paquetes || 0), 0);
            const ok = suma === p.totalImpreso.paquetes;
            return (
              <div key={k} style={{ fontSize: 12.5, color: ok ? "#4ade80" : "#f59e0b" }}>
                {ok ? "✅" : "⚠️"} Remisión {p.folio}: la lista suma {suma.toLocaleString("es-MX")} paq y la remisión dice {p.totalImpreso.paquetes.toLocaleString("es-MX")} paq{ok ? "" : " — revisa los renglones en naranja"}
              </div>
            );
          })}
          <div style={S.nota}>Compara los totales con "Total CAJ / Total PAQ" de la remisión. Si un código está mal, corrígelo: la app lo recuerda para la próxima.</div>
          <div style={S.barra}>
            {puedeEditar && <button style={S.btnPrimario} disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : "Guardar"}</button>}
            <button style={S.btnExcel} disabled={trabajando} onClick={descargarPDF}>⬇️ PDF con códigos</button>
            <button style={{ ...S.btnSec, borderStyle: "solid" }} onClick={descargarExcel}>⬇️ Excel</button>
          </div>
        </div>
      )}

      {paginas.map((p, i) => (
        <div key={i} style={S.card}>
          <div style={{ fontSize: 12.5, color: "#94a3b8" }}>
            Página {i + 1} · {p.esRemision ? `Remisión ${p.folio}` : p.esFactura ? `Factura ${p.folio}` : "Otro documento"} {p.fecha && `· ${p.fecha}`}
            {p.esRemision && !p.renglones.length && <span style={{ color: "#f59e0b" }}> · no encontré renglones (¿foto borrosa o chueca?)</span>}
          </div>
          <img src={p.marcada || p.url} alt={`Página ${i + 1}`} style={{ width: "100%", borderRadius: 10, background: "#fff" }} />
        </div>
      ))}
    </div>
  );
}
