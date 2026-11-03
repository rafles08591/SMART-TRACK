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
const codigoCorto = (fa) => String(fa || "").toUpperCase().replace(/^FA/, "");
const aFA = (c) => {
  const d = String(c || "").toUpperCase().replace(/[O]/g, "0").replace(/[^0-9A-Z]/g, "");
  if (!d) return "";
  return d.startsWith("FA") ? d : `FA${d}`;
};

// ... (el resto de funciones auxiliares se mantienen igual: agruparFilas, numero, leerPagina, cargarImagen, comprimir, archivoAPaginas, marcarPagina, ocr)

export default function RemisionesView({ alm, persistFresco, puedeEditar, quien, fechaDoc, S }) {
  const [equiv, setEquiv] = useState({ ...EQUIVALENCIAS_BASE, ...(alm.equivalencias || {}) });
  const [paginas, setPaginas] = useState([]);
  const [estado, setEstado] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [modoCamara, setModoCamara] = useState(false);
  const [fotosCamara, setFotosCamara] = useState([]);
  const fileRef = useRef(null);
  const camaraInputRef = useRef(null);

  useEffect(() => { setEquiv((e) => ({ ...EQUIVALENCIAS_BASE, ...(alm.equivalencias || {}), ...e })); }, [alm.equivalencias]);

  // Procesar fotos tomadas con la cámara
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
          const info = leerPagina(palabras, equiv);
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
        + (sinCod ? ` · ⚠️ ${sinCod} sin código` : ""));
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

  // ... (el resto de funciones: subir, cambiarCodigo, guardar, descargarPDF, descargarExcel se mantienen igual)

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardTitulo}>🧾 Remisiones con código</div>
        <div style={S.nota}>
          Sube las fotos de la remisión (o el PDF escaneado) o escanea directamente con la cámara del celular.
          La app lee cada renglón por su EAN, le pone el <b>código FA</b> y lo escribe en la foto.
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

        {/* Modal / panel de cámara */}
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

      {/* El resto del return (tabla de renglones, imágenes, etc.) se mantiene igual */}
    </div>
  );
}
