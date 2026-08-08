// @ts-nocheck
import React, { useState, useRef, useEffect } from "react";
import { Ticket, Camera, Image as ImageIcon, Ban, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { DIAS_CICLO_CREDITOS } from "../constants";
import { creditosPendientes } from "../utils";
import { supabase } from "../supabaseClient";

export default function CreditosView({ data, persistFresco, rol, revisorNombre }) {
  const creditos = data.creditos || { ultimoEnvio: null, historial: [] };
  const pendiente = creditosPendientes(data);
  const esLiquidacion = rol === "liquidacion";

  const [completos, setCompletos] = useState(null); // true | false | null (sin responder)
  const [archivo, setArchivo] = useState(null); // { url, nombre }
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [camaraActiva, setCamaraActiva] = useState(false);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);

  async function subirImagen(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert("La imagen pesa más de 8MB. Usa una más ligera.");
      return;
    }
    setSubiendo(true);
    setError(null);
    try {
      const extension = (file.name?.split(".").pop() || "jpg").toLowerCase();
      const nombreArchivo = `creditos_${Date.now()}.${extension}`;
      const { error: subErr } = await supabase.storage.from("promociones").upload(nombreArchivo, file, { cacheControl: "3600", upsert: false, contentType: file.type || "image/jpeg" });
      if (subErr) {
        setError(`No se pudo subir la imagen: ${subErr.message}`);
        return;
      }
      const { data: urlData } = supabase.storage.from("promociones").getPublicUrl(nombreArchivo);
      setArchivo({ url: urlData.publicUrl, nombre: file.name || nombreArchivo });
    } finally {
      setSubiendo(false);
    }
  }

  async function activarCamara() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCamaraActiva(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 0);
    } catch (e) {
      setError("No se pudo acceder a la cámara. Puedes elegir un archivo en su lugar.");
    }
  }

  function detenerCamara() {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamaraActiva(false);
  }

  function tomarFoto() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      detenerCamara();
      subirImagen(new File([blob], `creditos_${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  }

  useEffect(() => {
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); };
  }, []);

  async function enviarValidacion() {
    if (completos === null) {
      alert('Responde la pregunta "¿Créditos completos?".');
      return;
    }
    if (!archivo) {
      alert("Sube o toma la foto de evidencia antes de enviar.");
      return;
    }
    setEnviando(true);
    try {
      const ahora = new Date().toISOString();
      const nuevo = {
        id: "cred_" + Date.now(),
        fecha: ahora,
        autor: revisorNombre || "Liquidación",
        completos,
        imagenUrl: archivo.url,
      };
      await persistFresco((fresca) => ({
        creditos: {
          ultimoEnvio: ahora,
          historial: [nuevo, ...((fresca.creditos || {}).historial || [])],
        },
      }));
      setCompletos(null);
      setArchivo(null);
    } catch (err) {
      setError(err?.message || "No se pudo guardar la validación. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  function descargarImagen(url, nombreSugerido) {
    const link = document.createElement("a");
    link.href = url;
    link.download = nombreSugerido || "creditos.jpg";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const diasDesdeUltimo = creditos.ultimoEnvio
    ? Math.floor((Date.now() - new Date(creditos.ultimoEnvio).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div>
      <div className="display" style={{ fontSize: 16, color: "#E8EDF5", marginBottom: 14 }}>CRÉDITOS</div>

      <div className="card" style={{ padding: 16, marginBottom: 20, border: `1px solid ${pendiente ? "#FF8C00" : "#3DDC97"}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Ticket size={16} color={pendiente ? "#FF8C00" : "#3DDC97"} />
          <span className="display" style={{ fontSize: 13, color: pendiente ? "#FF8C00" : "#3DDC97" }}>
            {pendiente ? "VALIDACIÓN PENDIENTE" : "AL DÍA"}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: "#9AA7BD" }}>
          {creditos.ultimoEnvio
            ? `Última validación: hace ${diasDesdeUltimo} día${diasDesdeUltimo === 1 ? "" : "s"} (cada ${DIAS_CICLO_CREDITOS} días).`
            : `Todavía no se ha enviado ninguna validación. Se debe subir cada ${DIAS_CICLO_CREDITOS} días.`}
        </div>
      </div>

      {esLiquidacion && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div className="display" style={{ fontSize: 13, color: "#9AA7BD", marginBottom: 10 }}>NUEVA VALIDACIÓN</div>

          <div style={{ marginBottom: 14 }}>
            <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 6 }}>¿CRÉDITOS COMPLETOS?</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className={completos === true ? "btn" : "btn-ghost"} onClick={() => setCompletos(true)}>Sí</button>
              <button className={completos === false ? "btn" : "btn-ghost"} onClick={() => setCompletos(false)}>No</button>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 6 }}>EVIDENCIA (FOTO)</div>

            {camaraActiva ? (
              <div style={{ marginBottom: 10 }}>
                <video ref={videoRef} muted playsInline style={{ width: "100%", maxWidth: 340, borderRadius: 10, background: "#000", display: "block" }} />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="btn" onClick={tomarFoto}><Camera size={14} style={{ verticalAlign: "-2px" }} /> Tomar foto</button>
                  <button className="btn-ghost" onClick={detenerCamara}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={subiendo}>
                  <ImageIcon size={14} style={{ verticalAlign: "-2px" }} /> Elegir archivo
                </button>
                <button className="btn-ghost" onClick={activarCamara} disabled={subiendo}>
                  <Camera size={14} style={{ verticalAlign: "-2px" }} /> Usar cámara
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) subirImagen(f); }} />

            {subiendo && <div style={{ fontSize: 12, color: "#9AA7BD" }}>Subiendo imagen...</div>}
            {archivo && !subiendo && (
              <div>
                <img src={archivo.url} alt="Evidencia de créditos" style={{ maxWidth: 220, borderRadius: 8, display: "block", marginBottom: 6 }} />
                <button className="btn-ghost" onClick={() => setArchivo(null)}><Ban size={13} style={{ verticalAlign: "-2px" }} color="#FF6B6B" /> Quitar</button>
              </div>
            )}
          </div>

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#FF6B6B", fontSize: 12, marginBottom: 10 }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <button className="btn" onClick={enviarValidacion} disabled={enviando}>
            <CheckCircle2 size={14} style={{ verticalAlign: "-2px" }} /> {enviando ? "Enviando..." : "Enviar validación"}
          </button>
        </div>
      )}

      <div className="display" style={{ fontSize: 13, color: "#9AA7BD", marginBottom: 10 }}>HISTORIAL</div>
      {(creditos.historial || []).length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: "center", color: "#9AA7BD" }}>Todavía no hay ninguna validación registrada.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {creditos.historial.map((h) => (
            <div key={h.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <div style={{ fontSize: 12, color: "#9AA7BD" }}>
                  {h.autor} · {new Date(h.fecha).toLocaleString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: h.completos ? "#3DDC97" : "#FF6B6B" }}>
                  {h.completos ? "Créditos completos" : "Créditos incompletos"}
                </span>
              </div>
              {h.imagenUrl && (
                <div>
                  <img src={h.imagenUrl} alt="Evidencia" style={{ maxWidth: 240, borderRadius: 8, display: "block", marginBottom: 8 }} />
                  {!esLiquidacion && (
                    <button className="btn-ghost" onClick={() => descargarImagen(h.imagenUrl, `creditos_${h.fecha.slice(0, 10)}.jpg`)}>
                      <Download size={13} style={{ verticalAlign: "-2px" }} /> Descargar imagen
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Pestaña CARGAS — para vendedor, Supervisor-1 y Gerente.
 * - Supervisor-1/Gerente suben la "Carga Propuesta" (FA, marca, cantidad
 *   inicial por ruta) y pueden descargar el archivo final ya con las
 *   propuestas de cada vendedor (usa la inicial si no la modificaron).
 * - Vendedor ve su propia lista y puede proponer su cantidad; si no la
 *   modifica, se usa la inicial. Al descargar, se bloquea la edición.
 */
