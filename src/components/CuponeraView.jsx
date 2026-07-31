// @ts-nocheck
import React, { useState, useEffect, useRef } from "react";
import { Camera, Image as ImageIcon, Ban, CheckCircle2, Trash2, Download, Plus } from "lucide-react";
import { Html5QrcodeScanner } from "html5-qrcode";
import * as XLSX from "xlsx";

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
 * Tarjeta de una promoción dentro del listado. Todos los roles la ven;
 * solo gerente tiene el botón de eliminar.
 */
function TarjetaPromocion({ promo, expandida, onToggle, puedeEliminar, onEliminar }) {
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
            style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
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
          {promo.imagen && <img src={promo.imagen} alt={promo.descripcion} style={{ maxWidth: "100%", borderRadius: 10, marginBottom: 8 }} />}
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
 */
export default function CuponeraView({ data, persist, puesto, rol, rutaActual, revisorNombre, nombres = {} }) {
  const [escaneando, setEscaneando] = useState(false);
  const [cuponLeido, setCuponLeido] = useState(null); // { valido, texto, promo?, motivo? }
  const [promoExpandidaId, setPromoExpandidaId] = useState(null);
  const fileRef = useRef(null);

  // Formulario para nueva promoción (solo gerente)
  const [nuevaImagen, setNuevaImagen] = useState(null); // base64, se guarda junto con el resto al dar "Guardar"
  const [nuevaDescripcion, setNuevaDescripcion] = useState("");
  const [nuevoCodigo, setNuevoCodigo] = useState("");

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
    const reader = new FileReader();
    reader.onload = (evt) => setNuevaImagen(evt.target.result);
    reader.readAsDataURL(file);
  }

  function agregarPromocion() {
    if (!nuevoCodigo.trim()) {
      alert("Escribe el código que debe coincidir con el QR de esta promoción.");
      return;
    }
    if (!nuevaImagen) {
      alert("Selecciona una imagen para la promoción.");
      return;
    }
    const nueva = {
      id: "promo_" + Date.now(),
      imagen: nuevaImagen,
      descripcion: nuevaDescripcion.trim(),
      codigo: nuevoCodigo.trim(),
      creadaPor: revisorNombre || "Gerente",
      creadaFecha: todayISO(),
    };
    persist({ ...data, promociones: [...promociones, nueva] });
    setNuevaImagen(null);
    setNuevaDescripcion("");
    setNuevoCodigo("");
  }

  function eliminarPromocion(id) {
    persist({ ...data, promociones: promociones.filter((p) => p.id !== id) });
  }

  // El QR se compara de forma ESTRICTA (exacta, sensible a mayúsculas) contra
  // el código guardado de cada promoción, solo quitando espacios sobrantes
  // al inicio/final que a veces agregan los lectores de cámara.
  function onQrResult(texto) {
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
        id: "canje_" + Date.now(),
        ruta: rutaActual,
        fecha: todayISO(),
        promocionId: promoValida.id,
        promocionDescripcion: promoValida.descripcion,
        codigo: promoValida.codigo,
      };
      persist({ ...data, cuponesRedimidos: [...cuponesRedimidos, registro] });
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
      {esGerente && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div className="display" style={{ fontSize: 14, color: "#9AA7BD", marginBottom: 10 }}>AGREGAR PROMOCIÓN</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <ImageIcon size={14} style={{ verticalAlign: "-2px" }} /> {nuevaImagen ? "Cambiar imagen" : "Elegir imagen"}
            </button>
            {nuevaImagen && (
              <button className="btn-ghost" onClick={() => setNuevaImagen(null)}>
                <Ban size={14} style={{ verticalAlign: "-2px" }} /> Quitar imagen
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImagenNuevaPromo} />
          {nuevaImagen && (
            <img src={nuevaImagen} alt="Vista previa" style={{ maxWidth: 200, borderRadius: 10, marginBottom: 10, display: "block" }} />
          )}
          <textarea
            value={nuevaDescripcion}
            onChange={(e) => setNuevaDescripcion(e.target.value)}
            placeholder="Descripción / vigencia de la promoción (opcional)..."
            rows={2}
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
            style={{
              width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 13,
              color: "#000000", background: "#FFFFFF", marginBottom: 10, padding: "8px 10px",
            }}
          />
          <button className="btn" onClick={agregarPromocion}>
            <Plus size={14} style={{ verticalAlign: "-2px" }} /> Guardar promoción
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
              <img src={cuponLeido.promo.imagen} alt="Promoción" style={{ maxWidth: "100%", borderRadius: 10, marginBottom: 8 }} />
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
    </div>
  );
}
