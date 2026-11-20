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

export const EQUIVALENCIAS_BASE = {
  "75084202": "FA04016",
  "75086183": "FA04017",
  "75001322": "FA01001",
  "75001339": "FA01003",
  "75021597": "FA01006",
  "75068738": "FA01046",
  "75068844": "FA01047",
  "75068769": "FA01050",
  "75063801": "FA01085",
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
const codigoCorto = (fa) => String(fa || "").toUpperCase().replace(/^FA/, "");
const aFA = (c) => {
  const d = String(c || "").toUpperCase().replace(/[O]/g, "0").replace(/[^0-9A-Z]/g, "");
  if (!d) return "";
  return d.startsWith("FA") ? d : `FA${d}`;
};

// ─────────────────────────────────────────────────────────────
// 2ª VALIDACIÓN: POR NOMBRE (DESCRIPCIÓN)
// Además del EAN, cada renglón se valida por su descripción ("MARLBORO RED 3.5 LS BOX 20").
// La app aprende nombre → código FA de cada remisión guardada (data.almacen.equivNombres y el
// historial data.almacen.remisiones). Así, si una hoja sale borrosa:
//   • EAN y nombre dan el mismo código → ✅ doble validación
//   • el EAN no se pudo leer pero el nombre sí → se usa el código del nombre
//   • EAN y nombre dan códigos DISTINTOS → ⚠️ no se escribe nada hasta que elijas el correcto
// ─────────────────────────────────────────────────────────────
export const normNombre = (t) => String(t || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toUpperCase()
  // letras que el OCR lee como número dentro de una palabra: MARLB0RO → MARLBORO, MENT1OL → MENTIOL
  .replace(/([A-Z])0(?=[A-Z]|\b)/g, "$1O").replace(/([A-Z])1(?=[A-Z])/g, "$1I").replace(/([A-Z])5(?=[A-Z])/g, "$1S")
  .replace(/(\d),(\d)/g, "$1.$2")
  .replace(/[^A-Z0-9.]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();
const numerosDe = (n) => (n.match(/\d+(?:\.\d+)?/g) || []).join("|");
function bigramas(t) {
  const s = t.replace(/\s+/g, "");
  const m = new Map();
  for (let i = 0; i < s.length - 1; i++) { const b = s.slice(i, i + 2); m.set(b, (m.get(b) || 0) + 1); }
  return m;
}
// Parecido 0…1 entre dos nombres (aguanta letras mal leídas). Los NÚMEROS deben coincidir
// (3.5 vs 14, BOX 20 vs 25 son productos distintos).
export function parecido(a, b) {
  const na = normNombre(a), nb = normNombre(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (numerosDe(na) !== numerosDe(nb)) return 0;
  const A = bigramas(na), B = bigramas(nb);
  let comun = 0, ta = 0, tb = 0;
  for (const v of A.values()) ta += v;
  for (const v of B.values()) tb += v;
  for (const [k, v] of A) comun += Math.min(v, B.get(k) || 0);
  return ta + tb ? (2 * comun) / (ta + tb) : 0;
}
// Diccionario nombre → FA (lo aprendido + el historial de remisiones guardadas)
export function armarNombres(alm) {
  const dic = {};
  for (const rem of alm?.remisiones || []) for (const r of rem.renglones || []) {
    const n = normNombre(r.descripcion);
    if (n && r.codigo && n.length >= 6) dic[n] = r.codigo;
  }
  for (const [n, fa] of Object.entries(alm?.equivNombres || {})) if (fa) dic[n] = fa;
  return dic;
}
export function codigoPorNombre(descripcion, nombres) {
  const n = normNombre(descripcion);
  if (!n || n.length < 6) return null;
  if (nombres[n]) return { codigo: nombres[n], nombre: n, parecido: 1 };
  let mejor = null;
  for (const [k, fa] of Object.entries(nombres)) {
    const p = parecido(n, k);
    if (p >= 0.82 && (!mejor || p > mejor.parecido)) mejor = { codigo: fa, nombre: k, parecido: p };
  }
  return mejor;
}
// Junta las dos validaciones de un renglón
export function validarRenglon(r, nombres) {
  const porNombre = codigoPorNombre(r.descripcion, nombres);
  const porEan = r.codigo || "";
  const fn = porNombre?.codigo || "";
  if (porEan && fn) {
    if (porEan === fn) return { ...r, validacion: "doble", porNombre: fn };
    return { ...r, codigo: "", codigoEan: porEan, porNombre: fn, validacion: "conflicto", origen: "⚠️ EAN y nombre no coinciden" };
  }
  if (!porEan && fn) return { ...r, codigo: fn, porNombre: fn, validacion: "nombre", origen: r.ean ? "por nombre" : "por nombre (EAN ilegible)" };
  if (porEan) return { ...r, validacion: "ean" };
  return { ...r, validacion: "ninguna" };
}

// Corrige letras que el OCR confunde en números (EAN borroso)
const aDigitos = (t) => String(t || "").replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/\D/g, "");

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
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ""));
  return Number(s.replace(/,/g, ""));
};

export function leerPagina(palabras, equivalencias, nombres = {}) {
  const texto = palabras.map((p) => p.t).join(" ");
  const pegado = texto.replace(/\s+/g, "").toUpperCase();
  const traeClaves = palabras.some((p) => /^FA\d{6}/i.test(p.t));
  const esRemision = /REMISI[OÓ0]N/.test(pegado) || traeClaves;
  const esFactura = !esRemision && /FACTURA|CFDI|FOLIOFISCAL/.test(pegado);
  const mCaj = texto.match(/Total\s*CAJ\.?\s*([\d,\.]+)/i);
  const mPaq = texto.match(/Total\s*PAQ\.?\s*([\d,\.]+)/i);
  const totalImpreso = { cajetillas: mCaj ? numero(mCaj[1]) : null, paquetes: mPaq ? numero(mPaq[1]) : null };
  const folio = (texto.match(/\b(K[A-Z]\d{5,7})\b/) || [])[1] || "";
  const fecha = (texto.match(/\b(\d{2}\/\d{2}\/20\d{2})\b/) || [])[1] || "";
  const filas = agruparFilas(palabras);
  const renglones = [];
  for (const f of filas) {
    // EAN: 8 dígitos que empiezan con 7 (se corrigen O→0, I/l→1, S→5, B→8 si la hoja salió borrosa)
    let iEan = f.ws.findIndex((w) => /^7\d{7}$/.test(aDigitos(w.t)) && /\d{5}/.test(w.t));
    const iClave = f.ws.findIndex((w) => /^FA\d{5,6}/i.test(w.t.replace(/[Oo]/g, "0")));
    // Sin EAN legible: si el renglón trae la CLAVE de PM (FA080079.10) y la palabra PIEZA, igual es un
    // renglón del producto (se identifica por el nombre)
    const iPieza = f.ws.findIndex((w) => /^P[I1l]EZA$/i.test(w.t));
    if (iEan < 0 && !(iClave >= 0 && iPieza > iClave)) continue;
    const ean = iEan >= 0 ? aDigitos(f.ws[iEan].t) : "";
    const clave = iClave >= 0 ? f.ws[iClave].t : "";
    const finDesc = iEan >= 0 ? iEan : (() => {
      // sin EAN: la descripción termina en PIEZA, o antes si justo antes viene el EAN mal leído
      const prev = f.ws[iPieza - 1];
      const pareceEan = prev && prev.t.length >= 6 && (prev.t.match(/\d/g) || []).length >= 3;
      return pareceEan && iPieza - 1 > iClave ? iPieza - 1 : iPieza;
    })();
    const descripcion = f.ws.slice(iClave >= 0 ? iClave + 1 : 0, finDesc).map((w) => w.t).join(" ").trim();
    const desdeCant = iEan >= 0 ? iEan + 1 : iPieza + 1;
    const despues = f.ws.slice(desdeCant).filter((w) => !/^p[i1l]eza$/i.test(w.t));
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
    if (paquetes !== null && !Number.isInteger(paquetes) && cajetillas !== null) {
      const f = cajetillas === Math.round(paquetes * 10) || cajetillas === Math.round(paquetes * 8) ? 1000 : 1;
      if (f > 1) { cajetillas *= f; paquetes = Math.round(paquetes * f); }
    }
    const cuadra = (c, q) => c && q && (c === q * 10 || c === q * 8);
    let revisar = false;
    if (cajetillas && !cuadra(cajetillas, paquetes)) {
      const p10 = cajetillas / 10, p8 = cajetillas / 8;
      if (paquetes && String(paquetes).endsWith(String(p10))) paquetes = p10;
      else if (paquetes && Number.isInteger(p8) && String(paquetes).endsWith(String(p8))) paquetes = p8;
      else if (paquetes && (paquetes * 10 > cajetillas * 3 || !paquetes)) { paquetes = Math.round(p10); revisar = true; }
      else if (paquetes) { cajetillas = paquetes * 10; revisar = true; }
      else { paquetes = Math.round(p10); revisar = true; }
    }
    const fa = (ean && equivalencias[ean]) || (aMano ? aFA(aMano) : "");
    renglones.push(validarRenglon({
      ean, clave, descripcion, cajetillas, paquetes,
      codigo: fa, origen: ean && equivalencias[ean] ? "equivalencia" : aMano ? "escrito a mano" : "", revisar,
      yaEscrito: !!aMano,
      pos: {
        x: nums.length ? nums[0].w.x + nums[0].w.w : null,
        xFin: nums.length > 1 ? nums[nums.length - 1].w.x : null,
        cy: f.cy, h: f.h,
      },
    }, nombres));
  }
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

function cargarImagen(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

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

export async function marcarPagina(pagina) {
  const img = await cargarImagen(pagina.url);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const ys = pagina.renglones.map((r) => r.pos.cy).sort((a, b) => a - b);
  const difs = ys.slice(1).map((y, i) => y - ys[i]).filter((d) => d > 5).sort((a, b) => a - b);
  const espacio = difs.length ? difs[Math.floor(difs.length / 2)] : 999;
  for (const r of pagina.renglones) {
    if (!r.codigo) continue;
    const texto = codigoCorto(r.codigo);
    const fuente = (t) => `bold ${t}px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`;
    let tam = Math.max(14, Math.min(Math.round(r.pos.h * 1.0), Math.round(espacio * 0.75)));
    const x = r.pos.x !== null ? r.pos.x + r.pos.h * 0.4 : c.width * 0.78;
    ctx.font = fuente(tam);
    while (tam > 18 && x + ctx.measureText(texto).width > c.width * 0.99) { tam -= 1; ctx.font = fuente(tam); }
  ctx.textBaseline = "middle";
ctx.lineJoin = "round";
ctx.lineWidth = 0.8; // contorno muy mínimo
ctx.strokeStyle = "rgba(255,255,255,0.7)";
ctx.strokeText(texto, x, r.pos.cy);
ctx.fillStyle = "#111111"; // negro firme
ctx.font = `bold ${tam}px Arial, "Helvetica Neue", sans-serif`; // fuente similar a la impresa
ctx.fillText(texto, x, r.pos.cy);
  }
  return c.toDataURL("image/jpeg", 0.85);
}

function resumenValidacion(paginas) {
  const rs = paginas.filter((p) => p.esRemision).flatMap((p) => p.renglones);
  const c = (v) => rs.filter((r) => r.validacion === v).length;
  const partes = [];
  if (c("doble")) partes.push(`✅ ${c("doble")} con doble validación`);
  if (c("nombre")) partes.push(`🔤 ${c("nombre")} por nombre`);
  if (c("conflicto")) partes.push(`⚠️ ${c("conflicto")} donde EAN y nombre no coinciden`);
  return partes.length ? " · " + partes.join(" · ") : "";
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

export default function RemisionesView({ alm, persistFresco, puedeEditar, quien, fechaDoc, S }) {
  const [equiv, setEquiv] = useState({ ...EQUIVALENCIAS_BASE, ...(alm.equivalencias || {}) });
  const [nombres, setNombres] = useState(() => armarNombres(alm));
  const [paginas, setPaginas] = useState([]);
  const [estado, setEstado] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [modoCamara, setModoCamara] = useState(false);
  const [fotosCamara, setFotosCamara] = useState([]);
  const fileRef = useRef(null);
  const camaraInputRef = useRef(null);

  useEffect(() => { setEquiv((e) => ({ ...EQUIVALENCIAS_BASE, ...(alm.equivalencias || {}), ...e })); }, [alm.equivalencias]);
  useEffect(() => { setNombres((n) => ({ ...armarNombres(alm), ...n })); }, [alm.equivNombres, alm.remisiones]);

  async function procesarFotosCamara() {
    if (!fotosCamara.length) return;
    setTrabajando(true);
    const nuevas = [];
    try {
      let n = 0;
      for (const { file } of fotosCamara) {
        setEstado(`Procesando foto ${n + 1} de ${fotosCamara.length}…`);
        const pags = await archivoAPaginas(file);
        for (const p of pags) {
          n++;
          setEstado(`Leyendo página ${n}…`);
          const palabras = await ocr(p.url);
          const info = leerPagina(palabras, equiv, nombres);
          nuevas.push({ ...p, ...info, nombre: file.name || `camara-${n}.jpg` });
        }
      }
      const aprendidas = {};
      for (const p of nuevas) for (const r of p.renglones) if (r.yaEscrito && r.codigo && !equiv[r.ean]) aprendidas[r.ean] = r.codigo;
      if (Object.keys(aprendidas).length) setEquiv((q) => ({ ...q, ...aprendidas }));
      for (const p of nuevas) p.marcada = p.esRemision && p.renglones.length ? await marcarPagina(p) : null;
      setPaginas(nuevas);
      const rem = nuevas.filter((p) => p.esRemision);
      const sinCod = rem.reduce((s, p) => s + p.renglones.filter((r) => !r.codigo).length, 0);
      setEstado(`✅ ${nuevas.length} páginas desde la cámara: ${rem.length} remisiones con ${rem.reduce((s, p) => s + p.renglones.length, 0)} renglones`
        + (nuevas.length - rem.length ? ` · ${nuevas.length - rem.length} otros documentos` : "")
        + (sinCod ? ` · ⚠️ ${sinCod} sin código o en conflicto` : "")
        + resumenValidacion(nuevas));
      setFotosCamara([]);
      setModoCamara(false);
    } catch (err) {
      setEstado("❌ " + (err?.message || err));
    } finally {
      setTrabajando(false);
    }
  }

  function onFotoCapturada(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setFotosCamara((prev) => [...prev, { url, file }]);
    e.target.value = "";
  }

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
          const info = leerPagina(palabras, equiv, nombres);
          nuevas.push({ ...p, ...info, nombre: f.name });
        }
      }
      const aprendidas = {};
      for (const p of nuevas) for (const r of p.renglones) if (r.yaEscrito && r.codigo && !equiv[r.ean]) aprendidas[r.ean] = r.codigo;
      if (Object.keys(aprendidas).length) setEquiv((q) => ({ ...q, ...aprendidas }));
      for (const p of nuevas) p.marcada = p.esRemision && p.renglones.length ? await marcarPagina(p) : null;
      setPaginas(nuevas);
      const rem = nuevas.filter((p) => p.esRemision);
      const sinCod = rem.reduce((s, p) => s + p.renglones.filter((r) => !r.codigo).length, 0);
      setEstado(`✅ ${nuevas.length} páginas leídas: ${rem.length} remisiones con ${rem.reduce((s, p) => s + p.renglones.length, 0)} renglones`
        + (nuevas.length - rem.length ? ` · ${nuevas.length - rem.length} facturas u otras (sin marcar)` : "")
        + (sinCod ? ` · ⚠️ ${sinCod} sin código o en conflicto: revísalos abajo` : "")
        + resumenValidacion(nuevas));
    } catch (err) {
      setEstado("❌ " + (err?.message || err));
      if (nuevas.length) setPaginas(nuevas);
    } finally {
      setTrabajando(false);
    }
  }

  // Corregir / elegir el código de un renglón: se aprende por EAN y por nombre
  async function cambiarCodigo(ip, ir, valor) {
    const fa = valor ? aFA(valor) : "";
    const base = paginas[ip].renglones[ir];
    const ean = base.ean;
    const nom = normNombre(base.descripcion);
    if (ean) setEquiv((q) => ({ ...q, [ean]: fa }));
    if (nom && nom.length >= 6) setNombres((q) => ({ ...q, [nom]: fa }));
    const mismo = (r) => (ean && r.ean === ean) || (nom && normNombre(r.descripcion) === nom);
    const copia = paginas.map((p) => ({
      ...p,
      renglones: p.renglones.map((r) => (mismo(r) ? { ...r, codigo: fa, origen: "capturado", validacion: "capturado", codigoEan: undefined } : r)),
    }));
    for (const p of copia) if (p.esRemision && p.renglones.some(mismo)) p.marcada = await marcarPagina(p);
    setPaginas(copia);
  }

  const renglones = paginas.flatMap((p) => (p.esRemision ? p.renglones.map((r) => ({ ...r, folio: p.folio, fecha: p.fecha })) : []));

  async function guardar() {
    setGuardando(true);
    try {
      const nuevasEq = Object.fromEntries(Object.entries(equiv).filter(([k, v]) => v && EQUIVALENCIAS_BASE[k] !== v));
      // nombre → FA de los renglones con código (sin los que quedaron en conflicto)
      const nuevosNombres = {};
      for (const p of paginas) if (p.esRemision) for (const r of p.renglones) {
        const n = normNombre(r.descripcion);
        if (n && n.length >= 6 && r.codigo && r.validacion !== "conflicto") nuevosNombres[n] = r.codigo;
      }
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
            equivNombres: { ...(a.equivNombres || {}), ...nuevosNombres },
            remisiones: [...registro.map((r) => ({ ...r, cargada: new Date().toISOString(), quien })), ...previas].slice(0, 200),
          },
        };
      });
      setEstado("✅ Guardado: equivalencias (EAN y nombre) y remisiones.");
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
          Sube las fotos de la remisión (o el PDF escaneado) o escanea directamente con la cámara del celular.
          La app lee cada renglón por su EAN <b>y por su nombre</b> (doble validación), le pone el <b>código FA</b> y lo escribe en la foto.
          Si la hoja sale borrosa y el EAN no se lee, usa el nombre; si no coinciden, te pide elegir.
        </div>
        <div style={S.botones}>
          {puedeEditar && (
            <>
              <button style={S.btnPrimario} disabled={trabajando} onClick={() => fileRef.current?.click()}>
                {trabajando ? "Leyendo…" : "📷 Subir fotos / PDF"}
              </button>
              <button style={S.btnSec} disabled={trabajando} onClick={() => setModoCamara(true)}>
                📱 Escanear con cámara
              </button>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }} onChange={subir} />
          <input
            ref={camaraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={onFotoCapturada}
          />
          {paginas.length > 0 && <button style={S.btnSec} disabled={trabajando} onClick={() => { setPaginas([]); setEstado(""); }}>Limpiar</button>}
        </div>

        {modoCamara && (
          <div style={{ marginTop: 12, padding: 12, background: "#1e293b", borderRadius: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>📱 Escanear documentos</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 10 }}>
              Toma las fotos de la remisión. Puedes tomar varias. Cuando termines, presiona Procesar.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <button style={S.btnPrimario} onClick={() => camaraInputRef.current?.click()} disabled={trabajando}>
                📸 Tomar foto
              </button>
              <button style={S.btnSec} onClick={() => { setModoCamara(false); setFotosCamara([]); }} disabled={trabajando}>
                Cancelar
              </button>
              {fotosCamara.length > 0 && (
                <button style={S.btnPrimario} onClick={procesarFotosCamara} disabled={trabajando}>
                  {trabajando ? "Procesando…" : `✅ Procesar ${fotosCamara.length} foto(s)`}
                </button>
              )}
            </div>
            {fotosCamara.length > 0 && (
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
                {fotosCamara.map((f, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <img src={f.url} alt={`Foto ${i + 1}`} style={{ height: 80, borderRadius: 6, border: "1px solid #334155" }} />
                    <div style={{ fontSize: 10, textAlign: "center", color: "#94a3b8" }}>{i + 1}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
                  <th style={S.th}>Validación</th>
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
                    <td style={{ ...S.td, fontSize: 11.5 }}>
                      {r.validacion === "doble" && <span style={{ color: "#4ade80" }}>✅ EAN + nombre</span>}
                      {r.validacion === "nombre" && <span style={{ color: "#38bdf8" }}>🔤 por nombre{r.ean ? "" : " (EAN ilegible)"}</span>}
                      {r.validacion === "ean" && <span style={{ color: "#cbd5e1" }}>🔢 solo EAN <span style={{ color: "#64748b" }}>(nombre nuevo: se aprende al guardar)</span></span>}
                      {r.validacion === "capturado" && <span style={{ color: "#cbd5e1" }}>✍️ capturado</span>}
                      {r.validacion === "ninguna" && <span style={{ color: "#f59e0b" }}>⚠️ sin código: escríbelo</span>}
                      {r.validacion === "conflicto" && (
                        <div style={{ color: "#f87171" }}>
                          ⚠️ No coinciden. Elige:
                          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                            <button style={{ ...S.btnSec, padding: "3px 8px", fontSize: 11 }} disabled={!puedeEditar} onClick={() => cambiarCodigo(ip, ir, r.codigoEan)}>EAN → {codigoCorto(r.codigoEan)}</button>
                            <button style={{ ...S.btnSec, padding: "3px 8px", fontSize: 11 }} disabled={!puedeEditar} onClick={() => cambiarCodigo(ip, ir, r.porNombre)}>Nombre → {codigoCorto(r.porNombre)}</button>
                          </div>
                        </div>
                      )}
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
