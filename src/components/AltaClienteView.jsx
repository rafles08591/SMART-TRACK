import React, { useState, useRef, useEffect } from "react";
import { supabase } from "../supabaseClient";

/* =========================================================================
   AltaClienteView — Fase 1: el vendedor da de alta un cliente nuevo desde
   SMART-TRACK. Se guarda en Supabase con estatus "pendiente"; el Supervisor-1
   / Gerente lo descargan casi automáticamente al formulario externo de
   jmdresources (Fase 2, script aparte).

   INTEGRACIÓN:
   1. Correr el SQL de altaClienteSchema.sql en el proyecto de Supabase de
      SMART-TRACK (crea la tabla `altas_cliente` y el bucket de Storage
      `altas_cliente_fotos`).
   2. Importar este componente en VendorView.jsx y agregarlo como una
      pestaña más, pasando el username del vendedor en sesión, ej.:

        import AltaClienteView from "./AltaClienteView";
        ...
        {tab === "altaCliente" && (
          <AltaClienteView vendedorUsername={vendedorUsername} />
        )}

   3. Ajustar FONT_SANS / colores si tu VendorView usa clases de Tailwind en
      vez de estilos inline — aquí van inline para que el archivo funcione
      solo, sin depender de tu configuración de Tailwind.
   ========================================================================= */

const COLORS = {
  bg: "#0B1220",
  card: "#111A2E",
  cardBorder: "rgba(148,163,184,0.14)",
  ink: "#E7ECF7",
  inkMuted: "#8B96AE",
  inputBg: "#0E1626",
  cyan: "#22D3EE",
  fuchsia: "#E879F9",
  green: "#34D399",
  red: "#F87171",
  gold: "#FBBF24",
};
const FONT = "'Inter', -apple-system, system-ui, sans-serif";

// -------------------------------------------------------------------------
// Definición de campos del formulario (coincide con el formulario externo
// de jmdresources para que la Fase 2 los pueda mapear 1:1 por "key").
// -------------------------------------------------------------------------
const CAMPOS_DIRECCION = [
  { key: "calle", label: "Calle", required: true },
  { key: "numero", label: "Número", required: true },
  { key: "numeroInterior", label: "Número interior", required: false },
  { key: "colonia", label: "Colonia", required: true },
  { key: "entreCalle1", label: "Entre calle 1", required: true },
  { key: "entreCalle2", label: "Entre calle 2", required: true },
  { key: "codigoPostal", label: "Código postal", required: false },
  { key: "estado", label: "Estado", required: true },
  { key: "municipio", label: "Municipio", required: true },
];

const initialForm = {
  nombreNegocio: "",
  nombreCliente: "",
  calle: "",
  numero: "",
  numeroInterior: "",
  colonia: "",
  entreCalle1: "",
  entreCalle2: "",
  telefono: "",
  codigoPostal: "",
  estado: "",
  municipio: "",
  volumenSemanal: "",
  coordX: "", // longitud
  coordY: "", // latitud
  comentario: "",
};

// -------------------------------------------------------------------------
// Reverse geocoding con OpenStreetMap Nominatim — gratis, sin API key.
// Solo pre-llena; el vendedor siempre puede corregir a mano antes de
// guardar (la dirección exacta es responsabilidad de quien la captura).
// -------------------------------------------------------------------------
async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1&accept-language=es`;
  const res = await fetch(url, { headers: { "Accept-Language": "es" } });
  if (!res.ok) throw new Error("No se pudo obtener la dirección");
  const data = await res.json();
  const a = data.address || {};
  return {
    calle: a.road || a.pedestrian || a.residential || "",
    numero: a.house_number || "",
    colonia: a.suburb || a.neighbourhood || a.quarter || "",
    municipio: a.city || a.town || a.village || a.municipality || "",
    estado: a.state || "",
    codigoPostal: a.postcode || "",
  };
}

function Field({ label, required, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: COLORS.inkMuted, fontFamily: FONT }}>
        {label} {required && <span style={{ color: COLORS.gold }}>*</span>}
      </span>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  backgroundColor: COLORS.inputBg,
  color: COLORS.ink,
  border: `1px solid ${COLORS.cardBorder}`,
  fontFamily: FONT,
  outline: "none",
};

function TextInput({ value, onChange, placeholder, type = "text" }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
    />
  );
}

export default function AltaClienteView({ vendedorUsername }) {
  const [form, setForm] = useState(initialForm);
  const [ubicando, setUbicando] = useState(false);
  const [ubicacionMsg, setUbicacionMsg] = useState("");
  const [foto, setFoto] = useState(null); // { file, previewUrl }
  const [archivo, setArchivo] = useState(null); // File opcional
  const [guardando, setGuardando] = useState(false);
  const [status, setStatus] = useState("");
  const [misAltas, setMisAltas] = useState([]);
  const fotoInputRef = useRef(null);
  const archivoInputRef = useRef(null);

  const setCampo = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    cargarMisAltas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarMisAltas() {
    if (!vendedorUsername) return;
    const { data, error } = await supabase
      .from("altas_cliente")
      .select("id, nombre_negocio, nombre_cliente, estatus, created_at")
      .eq("vendedor_username", vendedorUsername)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error && data) setMisAltas(data);
  }

  // -----------------------------------------------------------------------
  // Ubicación del vendedor -> coordenadas + pre-llenado de dirección
  // -----------------------------------------------------------------------
  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      setUbicacionMsg("Este dispositivo no soporta geolocalización.");
      return;
    }
    setUbicando(true);
    setUbicacionMsg("Obteniendo tu ubicación…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setCampo("coordY", String(lat));
        setCampo("coordX", String(lon));
        try {
          setUbicacionMsg("Buscando la dirección aproximada…");
          const dir = await reverseGeocode(lat, lon);
          setForm((f) => ({
            ...f,
            calle: dir.calle || f.calle,
            numero: dir.numero || f.numero,
            colonia: dir.colonia || f.colonia,
            municipio: dir.municipio || f.municipio,
            estado: dir.estado || f.estado,
            codigoPostal: dir.codigoPostal || f.codigoPostal,
          }));
          setUbicacionMsg("Dirección sugerida — revísala y corrige lo que haga falta antes de guardar.");
        } catch (e) {
          setUbicacionMsg("Tomé tus coordenadas, pero no pude sugerir la dirección. Llénala a mano.");
        } finally {
          setUbicando(false);
        }
      },
      (err) => {
        setUbicando(false);
        setUbicacionMsg(
          err.code === err.PERMISSION_DENIED
            ? "Necesito permiso de ubicación para agilizar el domicilio."
            : "No pude obtener tu ubicación. Intenta de nuevo o llena el domicilio a mano."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function onFotoSeleccionada(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFoto({ file, previewUrl: URL.createObjectURL(file) });
  }

  function onArchivoSeleccionado(e) {
    const file = e.target.files?.[0];
    if (file) setArchivo(file);
  }

  function validar() {
    const requeridos = ["nombreNegocio", "nombreCliente", "telefono", "volumenSemanal", "coordX", "coordY"];
    for (const c of CAMPOS_DIRECCION) if (c.required) requeridos.push(c.key);
    const faltantes = requeridos.filter((k) => !String(form[k] || "").trim());
    if (faltantes.length > 0) return `Faltan campos obligatorios: ${faltantes.length}.`;
    if (!foto) return "La foto de la tienda es obligatoria.";
    return null;
  }

  async function guardar() {
    const err = validar();
    if (err) {
      setStatus(err);
      setTimeout(() => setStatus(""), 3000);
      return;
    }
    setGuardando(true);
    setStatus("Guardando…");
    try {
      // 1) Subir foto (obligatoria)
      const extFoto = foto.file.name.split(".").pop() || "jpg";
      const pathFoto = `${vendedorUsername}/${Date.now()}_foto.${extFoto}`;
      const { error: errFoto } = await supabase.storage
        .from("altas_cliente_fotos")
        .upload(pathFoto, foto.file, { upsert: false });
      if (errFoto) throw errFoto;
      const { data: pubFoto } = supabase.storage.from("altas_cliente_fotos").getPublicUrl(pathFoto);

      // 2) Subir archivo opcional
      let archivoUrl = null;
      if (archivo) {
        const extArch = archivo.name.split(".").pop() || "pdf";
        const pathArch = `${vendedorUsername}/${Date.now()}_archivo.${extArch}`;
        const { error: errArch } = await supabase.storage
          .from("altas_cliente_fotos")
          .upload(pathArch, archivo, { upsert: false });
        if (errArch) throw errArch;
        const { data: pubArch } = supabase.storage.from("altas_cliente_fotos").getPublicUrl(pathArch);
        archivoUrl = pubArch.publicUrl;
      }

      // 3) Insertar registro — solo se guarda la URL, nunca base64.
      const { error: errInsert } = await supabase.from("altas_cliente").insert({
        vendedor_username: vendedorUsername,
        nombre_negocio: form.nombreNegocio,
        nombre_cliente: form.nombreCliente,
        calle: form.calle,
        numero: form.numero,
        numero_interior: form.numeroInterior,
        colonia: form.colonia,
        entre_calle_1: form.entreCalle1,
        entre_calle_2: form.entreCalle2,
        telefono: form.telefono,
        codigo_postal: form.codigoPostal,
        estado: form.estado,
        municipio: form.municipio,
        volumen_semanal: form.volumenSemanal,
        coord_x: form.coordX,
        coord_y: form.coordY,
        comentario: form.comentario,
        foto_url: pubFoto.publicUrl,
        archivo_url: archivoUrl,
        estatus: "pendiente",
      });
      if (errInsert) throw errInsert;

      setStatus("Cliente guardado — quedó en cola para su descarga.");
      setForm(initialForm);
      setFoto(null);
      setArchivo(null);
      setUbicacionMsg("");
      if (fotoInputRef.current) fotoInputRef.current.value = "";
      if (archivoInputRef.current) archivoInputRef.current.value = "";
      cargarMisAltas();
    } catch (e) {
      setStatus(`Error al guardar: ${e.message || e}`);
    } finally {
      setGuardando(false);
      setTimeout(() => setStatus(""), 4000);
    }
  }

  return (
    <div style={{ background: COLORS.bg, minHeight: "100%", padding: 16, fontFamily: FONT, color: COLORS.ink }}>
      <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.02em" }}>Alta de cliente</div>
          <div style={{ fontSize: 12.5, color: COLORS.inkMuted, marginTop: 2 }}>
            Se guarda en la cola de altas pendientes para su descarga.
          </div>
        </div>

        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: COLORS.fuchsia }}>
            Datos del negocio
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Nombre negocio o tienda" required>
              <TextInput value={form.nombreNegocio} onChange={(v) => setCampo("nombreNegocio", v)} placeholder="Ej. Abarrotes La Esquina" />
            </Field>
            <Field label="Nombre del cliente" required>
              <TextInput value={form.nombreCliente} onChange={(v) => setCampo("nombreCliente", v)} placeholder="Ej. Juan Pérez" />
            </Field>
            <Field label="Teléfono" required>
              <TextInput value={form.telefono} onChange={(v) => setCampo("telefono", v)} placeholder="10 dígitos" type="tel" />
            </Field>
            <Field label="Vol. total categoría cigarros semanalmente" required>
              <TextInput value={form.volumenSemanal} onChange={(v) => setCampo("volumenSemanal", v)} placeholder="Ej. 40" type="number" />
            </Field>
          </div>

          <div style={{ height: 1, background: COLORS.cardBorder, margin: "4px 0" }} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: COLORS.fuchsia }}>
              Domicilio
            </div>
            <button
              onClick={usarMiUbicacion}
              disabled={ubicando}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999,
                background: `${COLORS.cyan}18`, border: `1px solid ${COLORS.cyan}55`, color: COLORS.cyan,
                fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: ubicando ? "default" : "pointer", opacity: ubicando ? 0.6 : 1,
              }}
            >
              📍 {ubicando ? "Ubicando…" : "Usar mi ubicación"}
            </button>
          </div>

          {ubicacionMsg && (
            <div style={{ fontSize: 12, color: COLORS.inkMuted, background: COLORS.inputBg, borderRadius: 10, padding: "8px 10px" }}>
              {ubicacionMsg}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {CAMPOS_DIRECCION.map((c) => (
              <Field key={c.key} label={c.label} required={c.required}>
                <TextInput value={form[c.key]} onChange={(v) => setCampo(c.key, v)} />
              </Field>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Coordenada X (longitud)" required>
              <TextInput value={form.coordX} onChange={(v) => setCampo("coordX", v)} placeholder="Se llena con 'Usar mi ubicación'" />
            </Field>
            <Field label="Coordenada Y (latitud)" required>
              <TextInput value={form.coordY} onChange={(v) => setCampo("coordY", v)} placeholder="Se llena con 'Usar mi ubicación'" />
            </Field>
          </div>

          <div style={{ height: 1, background: COLORS.cardBorder, margin: "4px 0" }} />

          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: COLORS.fuchsia }}>
            Evidencia
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: COLORS.inkMuted }}>
              Foto de la tienda <span style={{ color: COLORS.gold }}>*</span>
            </span>
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onFotoSeleccionada}
              style={{ display: "none" }}
              id="alta-cliente-foto-input"
            />
            <label
              htmlFor="alta-cliente-foto-input"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                border: `1px dashed ${COLORS.cardBorder}`, borderRadius: 12, padding: "16px", cursor: "pointer",
                color: COLORS.inkMuted, fontSize: 13,
              }}
            >
              {foto ? "Cambiar foto" : "📷 Tomar / seleccionar foto"}
            </label>
            {foto && (
              <img
                src={foto.previewUrl}
                alt="Vista previa"
                style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 12, border: `1px solid ${COLORS.cardBorder}` }}
              />
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: COLORS.inkMuted }}>
              Archivo (opcional)
            </span>
            <input ref={archivoInputRef} type="file" onChange={onArchivoSeleccionado} style={inputStyle} />
          </div>

          <Field label="Comentario">
            <textarea
              value={form.comentario}
              onChange={(e) => setCampo("comentario", e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>

          <button
            onClick={guardar}
            disabled={guardando}
            style={{
              marginTop: 4, padding: "13px 16px", borderRadius: 12, border: "none",
              background: `linear-gradient(135deg, ${COLORS.cyan}, ${COLORS.fuchsia})`,
              color: "#0B1220", fontWeight: 800, fontSize: 14, cursor: guardando ? "default" : "pointer",
              opacity: guardando ? 0.7 : 1,
            }}
          >
            {guardando ? "Guardando…" : "Guardar alta de cliente"}
          </button>

          {status && (
            <div style={{ fontSize: 12.5, textAlign: "center", color: status.startsWith("Error") || status.startsWith("Faltan") ? COLORS.red : COLORS.green }}>
              {status}
            </div>
          )}
        </div>

        {misAltas.length > 0 && (
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: COLORS.inkMuted, marginBottom: 10 }}>
              Mis altas recientes
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {misAltas.map((a) => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "8px 10px", background: COLORS.inputBg, borderRadius: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{a.nombre_negocio}</div>
                    <div style={{ fontSize: 11.5, color: COLORS.inkMuted }}>{a.nombre_cliente}</div>
                  </div>
                  <span
                    style={{
                      fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", padding: "3px 8px", borderRadius: 999,
                      color: a.estatus === "enviado" ? COLORS.green : a.estatus === "pendiente" ? COLORS.gold : COLORS.inkMuted,
                      background: a.estatus === "enviado" ? `${COLORS.green}22` : a.estatus === "pendiente" ? `${COLORS.gold}22` : `${COLORS.inkMuted}22`,
                    }}
                  >
                    {a.estatus}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
