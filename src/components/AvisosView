// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Plus, Trash2, Ban, CheckCircle2, AlertCircle, MessageSquare } from "lucide-react";
import { NOMBRES, RUTAS, USERS } from "../constants";
import { fechaHoyISO } from "../utils";

const USUARIOS_MERCH = USERS.filter((u) => u.role === "merch").map((u) => u.username);
const DESTINO_EQUIPO_MERCH = "equipo_merch";

export function avisosRelevantesPara(data, viewerKey, verComoRuta) {
  if ((viewerKey === "supervisor2" || viewerKey === "liquidacion") && data.preferenciasAvisos?.[viewerKey] === false) return [];
  const todosLosAvisos = data.avisos || [];
  const base = verComoRuta
    ? todosLosAvisos.filter((a) => {
        if (!a.destinatarios || a.destinatarios === "todos") return true;
        // Aviso dirigido a todo el equipo de merchandising (PVR + TEPIC).
        if (a.destinatarios === DESTINO_EQUIPO_MERCH) return USUARIOS_MERCH.includes(verComoRuta);
        return Array.isArray(a.destinatarios) && a.destinatarios.includes(verComoRuta);
      })
    : todosLosAvisos;
  // Si el que publicó excluyó explícitamente a Liquidación o Supervisor-2 de
  // ESE aviso en particular, no se lo mostramos a esos roles.
  if (viewerKey === "supervisor2" || viewerKey === "liquidacion") {
    return base.filter((a) => !(a.excluidos || []).includes(viewerKey));
  }
  return base;
}

// true si a este viewerKey le llegó al menos un aviso nuevo desde la última
// vez que entró a la pestaña — se usa para el parpadeo naranja de la pestaña.
export function hayAvisoNuevoPara(data, viewerKey, verComoRuta) {
  if (!viewerKey) return false;
  const avisos = avisosRelevantesPara(data, viewerKey, verComoRuta);
  if (avisos.length === 0) return false;
  const ultimaVisita = data.avisosVistoPor?.[viewerKey];
  if (!ultimaVisita) return true;
  return avisos.some((a) => new Date(a.fecha) > new Date(ultimaVisita));
}

// Vista dedicada de Liquidación (Sulema): un mini switch entre TIEMPOS
// (su pantalla de siempre) y AVISOS (nuevo), ya que ella no usa el sistema
// de pestañas de VendorView/StaffView.

export default function AvisosView({ data, persist, persistFresco, puedeCrear, revisorNombre, verComoRuta, viewerKey }) {
  const todosLosAvisos = data.avisos || [];
  const avisos = avisosRelevantesPara(data, viewerKey, verComoRuta);
  const puedeElegirPreferencia = viewerKey === "supervisor2" || viewerKey === "liquidacion";
  const recibeAvisos = puedeElegirPreferencia ? data.preferenciasAvisos?.[viewerKey] !== false : true;

  // Marca esta pestaña como "vista ahorita" para apagar el parpadeo naranja.
  useEffect(() => {
    if (!viewerKey) return;
    const ahora = new Date().toISOString();
    const yaVisto = data.avisosVistoPor?.[viewerKey];
    if (!yaVisto || Date.now() - new Date(yaVisto).getTime() > 3000) {
      persistFresco((fresca) => ({ avisosVistoPor: { ...(fresca.avisosVistoPor || {}), [viewerKey]: ahora } }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerKey]);

  function cambiarPreferenciaAvisos(valor) {
    persistFresco((fresca) => ({ preferenciasAvisos: { ...(fresca.preferenciasAvisos || {}), [viewerKey]: valor } }));
  }

  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState(null); // { url, nombre, esImagen }
  const [subiendo, setSubiendo] = useState(false);
  const [modoDestino, setModoDestino] = useState("todos"); // "todos" | "equipo_merch" | "especificas"
  const [rutasElegidas, setRutasElegidas] = useState([]);
  const [excluirLiquidacion, setExcluirLiquidacion] = useState(false);
  const [excluirSupervisor2, setExcluirSupervisor2] = useState(false);
  const fileRef = useRef(null);

  function toggleRutaDestino(nombreRuta) {
    setRutasElegidas((rs) => (rs.includes(nombreRuta) ? rs.filter((r) => r !== nombreRuta) : [...rs, nombreRuta]));
  }

  async function subirArchivo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert("El archivo pesa más de 8MB. Usa uno más ligero.");
      return;
    }
    setSubiendo(true);
    try {
      const extension = (file.name.split(".").pop() || "bin").toLowerCase();
      const nombreArchivo = `aviso_${Date.now()}.${extension}`;
      const { error } = await supabase.storage.from("promociones").upload(nombreArchivo, file, { cacheControl: "3600", upsert: false });
      if (error) {
        alert(`No se pudo subir el archivo: ${error.message}`);
        return;
      }
      const { data: urlData } = supabase.storage.from("promociones").getPublicUrl(nombreArchivo);
      setArchivo({ url: urlData.publicUrl, nombre: file.name, esImagen: file.type.startsWith("image/") });
    } finally {
      setSubiendo(false);
    }
  }

  function publicarAviso() {
    if (!texto.trim() && !archivo) {
      alert("Escribe un texto o adjunta una imagen/archivo.");
      return;
    }
    if (modoDestino === "especificas" && rutasElegidas.length === 0) {
      alert("Elige al menos un destinatario, o cambia el modo de envío.");
      return;
    }
    const excluidos = [];
    if (excluirLiquidacion) excluidos.push("liquidacion");
    if (excluirSupervisor2) excluidos.push("supervisor2");
    const nuevo = {
      id: "aviso_" + Date.now(),
      texto: texto.trim(),
      archivoUrl: archivo?.url || null,
      archivoNombre: archivo?.nombre || null,
      esImagen: archivo?.esImagen || false,
      autor: revisorNombre || "Staff",
      fecha: new Date().toISOString(),
      destinatarios:
        modoDestino === "todos" ? "todos"
        : modoDestino === "equipo_merch" ? DESTINO_EQUIPO_MERCH
        : rutasElegidas,
      excluidos,
    };
    persistFresco((fresca) => ({ avisos: [nuevo, ...(fresca.avisos || [])] }));
    setTexto("");
    setArchivo(null);
    setModoDestino("todos");
    setRutasElegidas([]);
    setExcluirLiquidacion(false);
    setExcluirSupervisor2(false);
  }

  function eliminarAviso(id) {
    persistFresco((fresca) => ({ avisos: (fresca.avisos || []).filter((a) => a.id !== id) }));
  }



  function formatFechaHora(iso) {
    const d = new Date(iso);
    return d.toLocaleString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div>
      <div className="display" style={{ fontSize: 16, color: "#E8EDF5", marginBottom: 14 }}>AVISOS</div>

      {puedeElegirPreferencia && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>¿QUIERES RECIBIR AVISOS?</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className={recibeAvisos ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => cambiarPreferenciaAvisos(true)}>Sí, quiero recibir avisos</button>
            <button className={!recibeAvisos ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => cambiarPreferenciaAvisos(false)}>No, no quiero recibir avisos</button>
          </div>
        </div>
      )}

      {puedeElegirPreferencia && !recibeAvisos ? (
        <div className="card" style={{ padding: 30, textAlign: "center", color: "#9AA7BD" }}>
          Desactivaste la recepción de avisos. Si cambias de opinión, actívala arriba.
        </div>
      ) : (
        <>
      {puedeCrear && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div className="display" style={{ fontSize: 13, color: "#9AA7BD", marginBottom: 8 }}>NUEVO AVISO</div>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe el aviso (opcional si adjuntas una imagen o archivo)..."
            rows={3}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "10px 12px", marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={subiendo}>
              {subiendo ? "Subiendo..." : archivo ? "Cambiar archivo" : "Adjuntar imagen/archivo"}
            </button>
            <input ref={fileRef} type="file" style={{ display: "none" }} onChange={subirArchivo} />
            {archivo && (
              <>
                <span style={{ fontSize: 12, color: "#9AA7BD" }}>{archivo.nombre}</span>
                <button className="btn-ghost" onClick={() => setArchivo(null)}><Ban size={13} color="#FF6B6B" /></button>
              </>
            )}
          </div>
          {archivo?.esImagen && <img src={archivo.url} alt="" style={{ maxWidth: 200, borderRadius: 8, marginBottom: 10, display: "block" }} />}

          <div style={{ marginBottom: 10 }}>
            <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 6 }}>DESTINATARIOS</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <button className={modoDestino === "todos" ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => setModoDestino("todos")}>Para todos</button>
              <button className={modoDestino === "equipo_merch" ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => setModoDestino("equipo_merch")}>Solo mi equipo (merch PVR + Tepic)</button>
              <button className={modoDestino === "especificas" ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => setModoDestino("especificas")}>Elegir específicos</button>
            </div>
            {modoDestino === "equipo_merch" && (
              <div style={{ fontSize: 11.5, color: "#9AA7BD" }}>
                Llega a: {USUARIOS_MERCH.join(", ")}
              </div>
            )}
            {modoDestino === "especificas" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[...RUTAS, ...USUARIOS_MERCH].map((nombreRuta) => (
                  <button key={nombreRuta} className={rutasElegidas.includes(nombreRuta) ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => toggleRutaDestino(nombreRuta)}>
                    {nombreRuta}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 10 }}>
            <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 6 }}>EXCLUIR DE ESTE AVISO (OPCIONAL)</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className={excluirLiquidacion ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => setExcluirLiquidacion((v) => !v)}>
                {excluirLiquidacion ? "✓ " : ""}No enviar a Liquidación
              </button>
              <button className={excluirSupervisor2 ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => setExcluirSupervisor2((v) => !v)}>
                {excluirSupervisor2 ? "✓ " : ""}No enviar a Supervisor-2
              </button>
            </div>
          </div>

          <button className="btn" onClick={publicarAviso}>
            <Plus size={14} style={{ verticalAlign: "-2px" }} /> Publicar aviso
          </button>
        </div>
      )}

      {avisos.length === 0 ? (
        <div className="card" style={{ padding: 30, textAlign: "center", color: "#9AA7BD" }}>No hay avisos por el momento.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {avisos.map((a) => (
            <div key={a.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <div style={{ fontSize: 12, color: "#9AA7BD" }}>{a.autor} · {formatFechaHora(a.fecha)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {!verComoRuta && (
                    <span style={{ fontSize: 10, color: "#9AA7BD", border: "1px solid #1E2A42", borderRadius: 6, padding: "2px 8px" }}>
                      Para: {!a.destinatarios || a.destinatarios === "todos" ? "Todos" : a.destinatarios === DESTINO_EQUIPO_MERCH ? "Equipo merch (PVR + Tepic)" : a.destinatarios.join(", ")}
                    </span>
                  )}
                  {!verComoRuta && a.excluidos && a.excluidos.length > 0 && (
                    <span style={{ fontSize: 10, color: "#FF6B6B", border: "1px solid #FF6B6B", borderRadius: 6, padding: "2px 8px" }}>
                      Sin: {a.excluidos.map((e) => e === "liquidacion" ? "Liquidación" : "Supervisor-2").join(", ")}
                    </span>
                  )}
                  {puedeCrear && (
                    <button className="btn-ghost" onClick={() => eliminarAviso(a.id)}><Trash2 size={13} color="#FF6B6B" /></button>
                  )}
                </div>
              </div>
              {a.texto && <p style={{ fontSize: 13, color: "#E8EDF5", whiteSpace: "pre-wrap", marginBottom: a.archivoUrl ? 10 : 0 }}>{a.texto}</p>}
              {a.archivoUrl && (
                a.esImagen ? (
                  <img src={a.archivoUrl} alt="" style={{ maxWidth: "100%", borderRadius: 8, display: "block" }} />
                ) : (
                  <a href={a.archivoUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
                    <Download size={13} /> {a.archivoNombre || "Descargar archivo"}
                  </a>
                )
              )}
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}

/**
 * Pestaña CRÉDITOS — recordatorio de validación de créditos cada 15 días.
 * - Liquidación: sube evidencia (foto, por archivo o cámara en vivo) y
 *   responde "¿Créditos completos?"; su pestaña parpadea en naranja intenso
 *   mientras esté pendiente el ciclo de 15 días.
 * - Gerente: ve el historial completo, puede descargar cualquier imagen, y
 *   su pestaña se pone en verde en cuanto Liquidación sube una validación
 *   dentro del ciclo vigente.
 */
