// @ts-nocheck
import React, { useState, useEffect, useRef } from "react";
import { Camera, Image as ImageIcon, Ban, CheckCircle2, Trash2, Download, Plus, X, ZoomIn } from "lucide-react";
import { Html5QrcodeScanner } from "html5-qrcode";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";

const todayISO = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

// Límite de tamaño de imagen para no inflar el JSON que se guarda en Supabase
// (la imagen viaja en base64 dentro de "data", y "data" se reenvía completo
// en cada persist() de cualquier pantalla de la app).
const MAX_IMAGEN_MB = 3;

function LectorQR({ onResult, onClose }) {
  const contenedorId = "qr-reader-cuponera";
  const scannerRef = useRef(null);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      contenedorId,
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );
    scannerRef.current = scanner;
    scanner.render(
      (decodedText) => {
        scanner.clear().catch(() => {
          /* ignorar error de limpieza, ya se va a desmontar */
        });
        onResult(decodedText);
      },
      () => {
        /* frame sin código, no hacer nada */
      }
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span className="display" style={{ fontSize: 13, color: "#9AA7BD" }}>APUNTA LA CÁMARA AL CÓDIGO QR</span>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
      </div>
      <div id={contenedorId} />
    </div>
  );
}

/**
 * Visor de imagen a pantalla completa — se abre al tocar cualquier imagen
 * de la cuponera (miniatura, expandida, vista previa, o la del cupón
 * leído) para ver el detalle (ej. tablas de combos con letra chica).
 * Soporta pellizcar para hacer zoom, arrastrar para moverse una vez
 * ampliada, doble toque/doble clic para acercar-alejar rápido, y rueda
 * del mouse en escritorio. Toca afuera de la imagen, o la X, para cerrar.
 */
function Lightbox({ src, onClose }) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [interactuando, setInteractuando] = useState(false);
  const pinchRef = useRef({ activo: false, distInicial: 0, escalaInicial: 1 });
  const panRef = useRef({ activo: false, x: 0, y: 0, txInicial: 0, tyInicial: 0 });
  const ultimoTapRef = useRef(0);

  // Cada vez que se abre una imagen nueva, empieza sin zoom.
  useEffect(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, [src]);

  if (!src) return null;

  function distanciaEntreDedos(touches) {
    const [a, b] = touches;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function alternarZoom() {
    if (scale > 1) {
      setScale(1);
      setTx(0);
      setTy(0);
    } else {
      setScale(2.5);
    }
  }

  function handleTouchStart(e) {
    if (e.touches.length === 2) {
      pinchRef.current = { activo: true, distInicial: distanciaEntreDedos(e.touches), escalaInicial: scale };
      setInteractuando(true);
    } else if (e.touches.length === 1) {
      const ahora = Date.now();
      if (ahora - ultimoTapRef.current < 280) {
        alternarZoom(); // doble toque
      }
      ultimoTapRef.current = ahora;
      if (scale > 1) {
        panRef.current = { activo: true, x: e.touches[0].clientX, y: e.touches[0].clientY, txInicial: tx, tyInicial: ty };
        setInteractuando(true);
      }
    }
  }

  function handleTouchMove(e) {
    if (pinchRef.current.activo && e.touches.length === 2) {
      e.preventDefault();
      const nuevaDist = distanciaEntreDedos(e.touches);
      const factor = nuevaDist / pinchRef.current.distInicial;
      setScale(Math.min(4, Math.max(1, pinchRef.current.escalaInicial * factor)));
    } else if (panRef.current.activo && e.touches.length === 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - panRef.current.x;
      const dy = e.touches[0].clientY - panRef.current.y;
      setTx(panRef.current.txInicial + dx);
      setTy(panRef.current.tyInicial + dy);
    }
  }

  function handleTouchEnd(e) {
    if (e.touches.length < 2) pinchRef.current.activo = false;
    if (e.touches.length === 0) {
      panRef.current.activo = false;
      setInteractuando(false);
      if (scale <= 1) { setScale(1); setTx(0); setTy(0); }
    }
  }

  function handleWheel(e) {
    e.preventDefault();
    setScale((s) => Math.min(4, Math.max(1, s - e.deltaY * 0.0015)));
  }

  return (
    <div
      onClick={onClose}
      onWheel={handleWheel}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(5,8,15,0.94)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, overflow: "hidden", touchAction: "none",
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16, zIndex: 1,
          background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%",
          width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <X size={20} color="#fff" />
      </button>
      <img
        src={src}
        alt="Imagen ampliada"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => { e.stopPropagation(); alternarZoom(); }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        draggable={false}
        style={{
          maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8,
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transition: interactuando ? "none" : "transform 0.2s ease",
          cursor: scale > 1 ? "grab" : "zoom-in",
          touchAction: "none",
          userSelect: "none",
        }}
      />
      <div style={{ position: "absolute", bottom: 14, left: 0, right: 0, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
        Pellizca o doble toque para zoom
      </div>
    </div>
  );
}

/**
 * Tarjeta de una promoción dentro del listado. Todos los roles la ven;
 * solo gerente tiene el botón de eliminar.
 */
function TarjetaPromocion({ promo, expandida, onToggle, puedeEliminar, onEliminar, onAmpliar }) {
  return (
    <div className="card" style={{ padding: 14, marginBottom: 10 }}>
      <div
        style={{ display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }}
        onClick={onToggle}
      >
        {promo.imagen && (
          <img
            src={promo.imagen}
            alt={promo.descripcion || "Promoción"}
            onClick={(e) => { e.stopPropagation(); onAmpliar(promo.imagen); }}
            style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flexShrink: 0, cursor: "zoom-in" }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "#E8EDF5", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {promo.descripcion || "(sin descripción)"}
          </div>
          <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 2 }}>
            {promo.creadaPor ? `${promo.creadaPor} · ` : ""}{promo.creadaFecha || ""}
          </div>
        </div>
        {puedeEliminar && (
          <button
            className="btn-ghost"
            style={{ flexShrink: 0 }}
            onClick={(e) => { e.stopPropagation(); onEliminar(promo.id); }}
          >
            <Trash2 size={14} color="#FF6B6B" />
          </button>
        )}
      </div>
      {expandida && (
        <div style={{ marginTop: 12 }}>
          {promo.imagen && (
            <div style={{ position: "relative", display: "inline-block", marginBottom: 8 }}>
              <img
                src={promo.imagen}
                alt={promo.descripcion}
                onClick={() => onAmpliar(promo.imagen)}
                style={{ maxWidth: "100%", borderRadius: 10, cursor: "zoom-in", display: "block" }}
              />
              <span
                style={{
                  position: "absolute", bottom: 8, right: 8,
                  background: "rgba(0,0,0,0.55)", borderRadius: 999,
                  width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <ZoomIn size={14} color="#fff" />
              </span>
            </div>
          )}
          {promo.descripcion && <p style={{ fontSize: 13, color: "#E8EDF5", whiteSpace: "pre-wrap" }}>{promo.descripcion}</p>}
          {puedeEliminar && (
            <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 6 }}>Código: <span className="mono">{promo.codigo}</span></div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Pestaña Cuponera:
 * - Gerente: agrega/elimina promociones (imagen + descripción + código exacto).
 * - Todos: ven el listado de promociones activas + LEER CUPÓN (QR).
 * - El QR se valida contra el código de cada promoción (coincidencia exacta).
 * - Staff: tabla de canjes por ruta + descarga de Excel (se reinicia por periodo).
 *
 * NOTA sobre guardado: todo se persiste con "persistFresco", que trae primero
 * el documento más reciente de Supabase y le aplica el cambio encima. Esto es
 * indispensable aquí porque varias rutas pueden canjear cupones casi al mismo
 * tiempo desde pantallas que llevan rato abiertas; con el guardado simple, el
 * último en guardar borraba los canjes de los demás.
 */
export default function CuponeraView({ data, persist, persistFresco, puesto, rol, rutaActual, revisorNombre, nombres = {} }) {
  const [escaneando, setEscaneando] = useState(false);
  const [cuponLeido, setCuponLeido] = useState(null); // { valido, texto, promo?, motivo? }
  const [promoExpandidaId, setPromoExpandidaId] = useState(null);
  const [imagenAmpliada, setImagenAmpliada] = useState(null); // URL de la imagen abierta en el visor a pantalla completa
  const fileRef = useRef(null);

  // Formulario para nueva promoción (solo gerente)
  const [nuevaImagenFile, setNuevaImagenFile] = useState(null); // File real, se sube a Storage al guardar
  const [nuevaImagenPreview, setNuevaImagenPreview] = useState(null); // base64 SOLO para la vista previa local, nunca se guarda
  const [nuevaDescripcion, setNuevaDescripcion] = useState("");
  const [nuevoCodigo, setNuevoCodigo] = useState("");
  const [guardandoPromocion, setGuardandoPromocion] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(null);

  const esGerente = rol === "staff" && puesto === "gerente";
  const promociones = data.promociones || [];
  const cuponesRedimidos = data.cuponesRedimidos || [];

  function handleImagenNuevaPromo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMAGEN_MB * 1024 * 1024) {
      alert(`La imagen pesa más de ${MAX_IMAGEN_MB}MB. Usa una imagen más ligera.`);
      return;
    }
    setNuevaImagenFile(file);
    const reader = new FileReader();
    reader.onload = (evt) => setNuevaImagenPreview(evt.target.result);
    reader.readAsDataURL(file);
  }

  // La imagen se sube al bucket "promociones" de Supabase Storage y solo se
  // guarda la URL pública (un texto corto) en el registro de la promoción —
  // así el renglón de la base de datos ya no crece con cada imagen que se sube.
  async function agregarPromocion() {
    if (!nuevoCodigo.trim()) {
      alert("Escribe el código que debe coincidir con el QR de esta promoción.");
      return;
    }
    if (!nuevaImagenFile) {
      alert("Selecciona una imagen para la promoción.");
      return;
    }
    setGuardandoPromocion(true);
    setErrorGuardado(null);
    try {
      const extension = (nuevaImagenFile.name.split(".").pop() || "jpg").toLowerCase();
      const nombreArchivo = `promo_${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("promociones")
        .upload(nombreArchivo, nuevaImagenFile, { cacheControl: "3600", upsert: false });

      if (uploadError) {
        alert(`No se pudo subir la imagen: ${uploadError.message}`);
        return;
      }

      const { data: urlData } = supabase.storage.from("promociones").getPublicUrl(nombreArchivo);

      const nueva = {
        id: "promo_" + Date.now(),
        imagen: urlData.publicUrl,
        archivoStorage: nombreArchivo, // para poder borrar el archivo del bucket si se elimina la promoción
        descripcion: nuevaDescripcion.trim(),
        codigo: nuevoCodigo.trim(),
        creadaPor: revisorNombre || "Gerente",
        creadaFecha: todayISO(),
      };
      await persistFresco((fresca) => ({ promociones: [...(fresca.promociones || []), nueva] }));
      setNuevaImagenFile(null);
      setNuevaImagenPreview(null);
      setNuevaDescripcion("");
      setNuevoCodigo("");
    } catch (err) {
      console.error("Error guardando la promoción:", err);
      setErrorGuardado(err?.message || "No se pudo guardar la promoción. Intenta de nuevo.");
    } finally {
      setGuardandoPromocion(false);
    }
  }

  async function eliminarPromocion(id) {
    const promo = promociones.find((p) => p.id === id);
    try {
      await persistFresco((fresca) => ({ promociones: (fresca.promociones || []).filter((p) => p.id !== id) }));
    } catch (err) {
      console.error("Error eliminando la promoción:", err);
      setErrorGuardado(err?.message || "No se pudo eliminar la promoción. Intenta de nuevo.");
      return;
    }
    if (promo?.archivoStorage) {
      try {
        await supabase.storage.from("promociones").remove([promo.archivoStorage]);
      } catch (err) {
        console.warn("No se pudo borrar el archivo del bucket:", err);
      }
    }
  }

  // El QR se compara de forma ESTRICTA (exacta, sensible a mayúsculas) contra
  // el código guardado de cada promoción, solo quitando espacios sobrantes
  // al inicio/final que a veces agregan los lectores de cámara.
  async function onQrResult(texto) {
    setEscaneando(false);
    const codigoEscaneado = (texto || "").trim();
    const promoValida = promociones.find((p) => p.codigo === codigoEscaneado);

    if (!promoValida) {
      setCuponLeido({ valido: false, texto: codigoEscaneado, motivo: "El código escaneado no coincide con ninguna promoción activa." });
      return;
    }

    setCuponLeido({ valido: true, texto: codigoEscaneado, promo: promoValida });

    if (rol === "vendedor" && rutaActual) {
      const registro = {
        id: "canje_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        ruta: rutaActual,
        fecha: todayISO(),
        promocionId: promoValida.id,
        promocionDescripcion: promoValida.descripcion,
        codigo: promoValida.codigo,
      };
      try {
        // Se agrega SOBRE el log más reciente: si otra ruta canjeó un cupón
        // hace un momento, su registro no se pierde al guardar este.
        await persistFresco((fresca) => ({ cuponesRedimidos: [...(fresca.cuponesRedimidos || []), registro] }));
      } catch (err) {
        console.error("Error registrando el canje:", err);
        setErrorGuardado(err?.message || "El cupón es válido, pero no se pudo registrar el canje. Revisa tu conexión y vuelve a escanearlo.");
      }
    }
  }

  // Conteo por ruta derivado del log de canjes (siempre refleja solo el
  // periodo actual, porque el log se reinicia al cambiar de periodo).
  const conteoPorRuta = {};
  cuponesRedimidos.forEach((r) => {
    conteoPorRuta[r.ruta] = (conteoPorRuta[r.ruta] || 0) + 1;
  });

  function descargarExcelCanjes() {
    if (cuponesRedimidos.length === 0) {
      alert("No hay cupones canjeados registrados en este periodo.");
      return;
    }
    const encabezado = [["Fecha", "Ruta", "Vendedor", "Promoción", "Código"]];
    const filas = cuponesRedimidos.map((r) => [
      r.fecha, r.ruta, nombres[r.ruta] || "", r.promocionDescripcion || "", r.codigo,
    ]);
    const rutasUnicas = [...new Set(cuponesRedimidos.map((r) => r.ruta))];
    const filasResumen = rutasUnicas.map((ruta) => [
      ruta, nombres[ruta] || "", cuponesRedimidos.filter((r) => r.ruta === ruta).length,
    ]);
    const bloqueResumen = [[], ["RESUMEN POR RUTA"], ["Ruta", "Vendedor", "Cupones canjeados"], ...filasResumen];

    const ws = XLSX.utils.aoa_to_sheet([...encabezado, ...filas, ...bloqueResumen]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cupones canjeados");
    XLSX.writeFile(wb, `cupones_canjeados_${todayISO()}.xlsx`);
  }

  return (
    <div>
      {errorGuardado && (
        <div className="card" style={{ padding: "12px 14px", marginBottom: 16, border: "1px solid #FF6B6B", color: "#FF6B6B", fontSize: 12.5 }}>
          {errorGuardado}
        </div>
      )}

      {esGerente && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div className="display" style={{ fontSize: 14, color: "#9AA7BD", marginBottom: 10 }}>AGREGAR PROMOCIÓN</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <button className="btn" onClick={() => fileRef.current?.click()} disabled={guardandoPromocion}>
              <ImageIcon size={14} style={{ verticalAlign: "-2px" }} /> {nuevaImagenPreview ? "Cambiar imagen" : "Elegir imagen"}
            </button>
            {nuevaImagenPreview && (
              <button className="btn-ghost" onClick={() => { setNuevaImagenFile(null); setNuevaImagenPreview(null); }} disabled={guardandoPromocion}>
                <Ban size={14} style={{ verticalAlign: "-2px" }} /> Quitar imagen
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImagenNuevaPromo} />
          {nuevaImagenPreview && (
            <img
              src={nuevaImagenPreview}
              alt="Vista previa"
              onClick={() => setImagenAmpliada(nuevaImagenPreview)}
              style={{ maxWidth: 200, borderRadius: 10, marginBottom: 10, display: "block", cursor: "zoom-in" }}
            />
          )}
          <textarea
            value={nuevaDescripcion}
            onChange={(e) => setNuevaDescripcion(e.target.value)}
            placeholder="Descripción / vigencia de la promoción (opcional)..."
            rows={2}
            disabled={guardandoPromocion}
            style={{
              width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 13,
              color: "#000000", background: "#FFFFFF", marginBottom: 8,
            }}
          />
          <input
            type="text"
            value={nuevoCodigo}
            onChange={(e) => setNuevoCodigo(e.target.value)}
            placeholder="Código exacto que traerá el QR de esta promoción (obligatorio)"
            disabled={guardandoPromocion}
            style={{
              width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 13,
              color: "#000000", background: "#FFFFFF", marginBottom: 10, padding: "8px 10px",
            }}
          />
          <button className="btn" onClick={agregarPromocion} disabled={guardandoPromocion}>
            <Plus size={14} style={{ verticalAlign: "-2px" }} /> {guardandoPromocion ? "Guardando..." : "Guardar promoción"}
          </button>
        </div>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="display" style={{ fontSize: 14, color: "#9AA7BD", marginBottom: 10 }}>
          PROMOCIONES ACTIVAS {promociones.length > 0 ? `(${promociones.length})` : ""}
        </div>
        {promociones.length === 0 ? (
          <div style={{ color: "#9AA7BD", padding: 20, textAlign: "center" }}>No hay ninguna promoción cargada por el momento.</div>
        ) : (
          promociones.map((p) => (
            <TarjetaPromocion
              key={p.id}
              promo={p}
              expandida={promoExpandidaId === p.id}
              onToggle={() => setPromoExpandidaId((id) => (id === p.id ? null : p.id))}
              puedeEliminar={esGerente}
              onEliminar={eliminarPromocion}
              onAmpliar={setImagenAmpliada}
            />
          ))
        )}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        {!escaneando ? (
          <button className="btn" style={{ width: "100%" }} onClick={() => { setCuponLeido(null); setEscaneando(true); }}>
            <Camera size={14} style={{ verticalAlign: "-2px" }} /> LEER CUPÓN
          </button>
        ) : (
          <LectorQR onResult={onQrResult} onClose={() => setEscaneando(false)} />
        )}

        {cuponLeido && (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              border: `1px solid ${cuponLeido.valido ? "#3DDC97" : "#FF6B6B"}`,
              borderRadius: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              {cuponLeido.valido ? (
                <CheckCircle2 size={16} color="#3DDC97" />
              ) : (
                <Ban size={16} color="#FF6B6B" />
              )}
              <span className="display" style={{ fontSize: 13, color: cuponLeido.valido ? "#3DDC97" : "#FF6B6B" }}>
                {cuponLeido.valido ? "CUPÓN VÁLIDO" : "CÓDIGO INVÁLIDO"}
              </span>
            </div>
            {cuponLeido.valido && cuponLeido.promo?.imagen && (
              <img
                src={cuponLeido.promo.imagen}
                alt="Promoción"
                onClick={() => setImagenAmpliada(cuponLeido.promo.imagen)}
                style={{ maxWidth: "100%", borderRadius: 10, marginBottom: 8, cursor: "zoom-in" }}
              />
            )}
            {cuponLeido.valido && cuponLeido.promo?.descripcion && (
              <p style={{ fontSize: 13, color: "#E8EDF5" }}>{cuponLeido.promo.descripcion}</p>
            )}
            {!cuponLeido.valido && (
              <p style={{ fontSize: 13, color: "#E8EDF5" }}>{cuponLeido.motivo}</p>
            )}
            <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 6 }}>Código leído: {cuponLeido.texto}</div>
          </div>
        )}
      </div>

      {rol === "staff" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px 0", flexWrap: "wrap", gap: 8 }}>
            <div className="display" style={{ fontSize: 14, color: "#9AA7BD" }}>CUPONES CANJEADOS POR RUTA · PERIODO ACTUAL</div>
            <button className="btn-ghost" onClick={descargarExcelCanjes}>
              <Download size={14} style={{ verticalAlign: "-2px" }} /> Descargar Excel
            </button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 10 }}>
            <thead>
              <tr style={{ color: "#9AA7BD", textAlign: "left" }}>
                <th style={{ padding: "8px 16px" }}>Vendedor</th>
                <th>Cupones canjeados</th>
              </tr>
            </thead>
            <tbody>
              {(data.vendedores || []).map((v) => (
                <tr key={v.id} style={{ borderTop: "1px solid #1E2A42" }}>
                  <td style={{ padding: "10px 16px" }}>
                    {v.name}{nombres[v.name] ? ` · ${nombres[v.name]}` : ""}
                  </td>
                  <td className="mono">{conteoPorRuta[v.name] || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Lightbox src={imagenAmpliada} onClose={() => setImagenAmpliada(null)} />
    </div>
  );
}
