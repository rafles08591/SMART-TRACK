// @ts-nocheck
import React, { useState, useEffect, useRef } from "react";
import { Camera, Image as ImageIcon, Ban, CheckCircle2 } from "lucide-react";
import { Html5QrcodeScanner } from "html5-qrcode";

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
        // clear() es asíncrono: se maneja con .catch() en vez de try/catch síncrono.
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
 * Pestaña Cuponera:
 * - Staff (gerente / supervisor 1): subir imagen y descripción de promoción
 * - Todos: ver promoción + LEER CUPÓN (QR)
 * - Staff: tabla de canjes por ruta
 */
export default function CuponeraView({ data, persist, puesto, rol, rutaActual, revisorNombre, nombres = {} }) {
  const [escaneando, setEscaneando] = useState(false);
  const [cuponLeido, setCuponLeido] = useState(null); // { texto, valido, motivo? }
  const [descTemp, setDescTemp] = useState(data.cuponera?.descripcion || "");
  const fileRef = useRef(null);
  const puedeSubir = rol === "staff" && (puesto === "gerente" || puesto === "supervisor");
  const cupon = data.cuponera || {};

  // FIX: useState solo toma el valor inicial una vez. Si otro dispositivo/usuario
  // actualiza la promoción vía Supabase realtime, sin este efecto el textarea
  // se queda con el texto viejo y un "Guardar descripción" local lo pisaría.
  useEffect(() => {
    setDescTemp(data.cuponera?.descripcion || "");
    // Se resincroniza cuando cambia el registro remoto (fecha/autor de actualización).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.cuponera?.actualizadoFecha, data.cuponera?.actualizadoPor]);

  function handleSubirImagen(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_IMAGEN_MB * 1024 * 1024) {
      alert(`La imagen pesa más de ${MAX_IMAGEN_MB}MB. Usa una imagen más ligera (se guarda en la base de datos compartida).`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      persist({
        ...data,
        cuponera: {
          imagen: evt.target.result,
          descripcion: descTemp,
          actualizadoPor: revisorNombre || "Staff",
          actualizadoFecha: todayISO(),
        },
      });
    };
    reader.readAsDataURL(file);
  }

  function guardarDescripcion() {
    persist({
      ...data,
      cuponera: {
        ...cupon,
        descripcion: descTemp,
        actualizadoPor: revisorNombre || "Staff",
        actualizadoFecha: todayISO(),
      },
    });
  }

  function quitarPromocion() {
    setDescTemp("");
    persist({
      ...data,
      cuponera: { imagen: null, descripcion: "", actualizadoPor: null, actualizadoFecha: null },
    });
  }

  // FIX: antes cualquier texto de QR se marcaba como "CUPÓN VÁLIDO" y sumaba
  // canje sin control. Ahora se valida contra un registro de códigos ya
  // canjeados (data.cuponesCanjeados) para evitar doble conteo del mismo código.
  function onQrResult(texto) {
    setEscaneando(false);
    const codigo = (texto || "").trim();
    const yaCanjeado = (data.cuponesCanjeados || {})[codigo];

    if (yaCanjeado) {
      setCuponLeido({
        texto: codigo,
        valido: false,
        motivo: `Este cupón ya fue canjeado el ${yaCanjeado.fecha} por ${yaCanjeado.ruta}.`,
      });
      return;
    }

    setCuponLeido({ texto: codigo, valido: true });

    if (rol === "vendedor" && rutaActual) {
      const actuales = data.canjesCupones || {};
      const nuevoCanjes = { ...actuales, [rutaActual]: (actuales[rutaActual] || 0) + 1 };
      const nuevosCodigos = {
        ...(data.cuponesCanjeados || {}),
        [codigo]: { ruta: rutaActual, fecha: todayISO() },
      };
      persist({ ...data, canjesCupones: nuevoCanjes, cuponesCanjeados: nuevosCodigos });
    }
  }

  return (
    <div>
      {puedeSubir && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div className="display" style={{ fontSize: 14, color: "#9AA7BD", marginBottom: 10 }}>SUBIR PROMOCIÓN ACTIVA</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <ImageIcon size={14} style={{ verticalAlign: "-2px" }} /> Subir imagen
            </button>
            {cupon.imagen && (
              <button className="btn-ghost" onClick={quitarPromocion}>
                <Ban size={14} style={{ verticalAlign: "-2px" }} /> Quitar promoción
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleSubirImagen} />
          <textarea
            value={descTemp}
            onChange={(e) => setDescTemp(e.target.value)}
            placeholder="Descripción / vigencia de la promoción (opcional)..."
            rows={2}
            style={{
              width: "100%",
              boxSizing: "border-box",
              fontFamily: "inherit",
              fontSize: 13,
              color: "#000000",
              background: "#FFFFFF",
              marginBottom: 8,
            }}
          />
          <button className="btn-ghost" onClick={guardarDescripcion}>Guardar descripción</button>
          {cupon.actualizadoFecha && (
            <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 8 }}>
              Actualizado por {cupon.actualizadoPor} · {cupon.actualizadoFecha}
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 20, textAlign: "center" }}>
        <div className="display" style={{ fontSize: 14, color: "#9AA7BD", marginBottom: 10 }}>PROMOCIÓN ACTIVA</div>
        {cupon.imagen ? (
          <img src={cupon.imagen} alt="Promoción activa" style={{ maxWidth: "100%", borderRadius: 10 }} />
        ) : (
          <div style={{ color: "#9AA7BD", padding: 20 }}>No hay ninguna promoción cargada por el momento.</div>
        )}
        {cupon.descripcion && (
          <p style={{ fontSize: 13, color: "#E8EDF5", marginTop: 10, whiteSpace: "pre-wrap", textAlign: "left" }}>
            {cupon.descripcion}
          </p>
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
                {cuponLeido.valido ? "CUPÓN VÁLIDO" : "CUPÓN YA CANJEADO"}
              </span>
            </div>
            {cuponLeido.valido && cupon.imagen && (
              <img src={cupon.imagen} alt="Promoción" style={{ maxWidth: "100%", borderRadius: 10, marginBottom: 8 }} />
            )}
            {cuponLeido.valido && cupon.descripcion && (
              <p style={{ fontSize: 13, color: "#E8EDF5" }}>{cupon.descripcion}</p>
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
          <div className="display" style={{ fontSize: 14, padding: "14px 16px 0", color: "#9AA7BD" }}>CUPONES CANJEADOS POR RUTA</div>
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
                  <td className="mono">{(data.canjesCupones || {})[v.name] || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
