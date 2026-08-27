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
          <AltaClienteView vendedorUsername={vendedorUsername} rutaCodigo={rutaCodigo} />
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
// Reverse geocoding con Google Maps (Geocoding API) — reemplaza a
// OpenStreetMap Nominatim, que en México muy seguido no traía el número
// de casa ni el nombre de calle bien etiquetados. Google tiene, por
// mucho margen, el catálogo de domicilios más completo en México.
//
// IMPORTANTE — configuración necesaria antes de que esto funcione:
//   1. Crea/usa un proyecto en Google Cloud Console y habilita ahí la
//      "Maps JavaScript API" (y, si te da error REQUEST_DENIED, habilita
//      también "Geocoding API").
//   2. Activa facturación en ese proyecto — Google exige una tarjeta
//      registrada aunque el uso se quede dentro del nivel gratuito
//      (10,000 llamadas gratis al mes por producto, en 2026).
//   3. Genera una API key y RESTRÍNGELA por "referente HTTP" (HTTP
//      referrer) a los dominios donde corre SMART-TRACK — esta key va
//      incrustada en el código del navegador, así que sin esa
//      restricción cualquiera podría copiarla y usarla a tu costa.
//   4. Pega esa key abajo en GOOGLE_MAPS_API_KEY.
//
// Nota técnica: se usa el Geocoder del script de "Maps JavaScript API"
// (no un fetch directo a maps.googleapis.com/maps/api/geocode/json)
// porque ese endpoint REST no permite llamadas cross-origin desde el
// navegador (no manda cabeceras CORS) — el Geocoder del script sí está
// pensado para usarse así, del lado del cliente.
//
// Solo pre-llena; el vendedor siempre puede corregir a mano antes de
// guardar (la dirección exacta es responsabilidad de quien la captura).
// -------------------------------------------------------------------------
const GOOGLE_MAPS_API_KEY = "AIzaSyC-4jbAQbGm9-kqc_BgYuObIHWjCnVFO8c";

let promesaGoogleMapsCargado = null;
function cargarGoogleMapsScript() {
  if (window.google?.maps?.Geocoder) return Promise.resolve();
  if (promesaGoogleMapsCargado) return promesaGoogleMapsCargado;
  promesaGoogleMapsCargado = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&language=es&region=MX`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      promesaGoogleMapsCargado = null; // permite reintentar en la siguiente llamada
      reject(new Error("No se pudo cargar el script de Google Maps."));
    };
    document.head.appendChild(script);
  });
  return promesaGoogleMapsCargado;
}

// Junta los address_components de un resultado de Google en un objeto
// { tipo: valor } para poder leerlos por nombre (route, street_number,
// sublocality_level_1, etc.) en vez de andar recorriendo el arreglo cada vez.
function componentesDe(resultado) {
  const mapa = {};
  for (const comp of resultado.address_components) {
    for (const tipo of comp.types) {
      if (!(tipo in mapa)) mapa[tipo] = comp.long_name;
    }
  }
  return mapa;
}

// -------------------------------------------------------------------------
// "Entre calle 1" / "Entre calle 2" — ni Google ni el Nominatim que
// usábamos antes regresan esto: un geocoder responde "cuál es la calle de
// este punto", no "qué calles cruzan cerca". Para sugerirlas se usa
// Overpass API (consultas sobre el mapa de OpenStreetMap — gratis, sin
// key) buscando los nombres de vialidades distintos a menos de 70 metros
// del punto; normalmente son las calles que delimitan la cuadra. Es una
// sugerencia aproximada — el vendedor la revisa y corrige igual que el
// resto del domicilio antes de guardar.
// -------------------------------------------------------------------------
async function buscarCallesCercanas(lat, lon, calleAExcluir) {
  const radioMetros = 70;
  const consulta = `[out:json][timeout:10];way(around:${radioMetros},${lat},${lon})[highway][name];out tags center;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: consulta });
    if (!res.ok) { console.warn(`Overpass respondió con estatus ${res.status} al buscar calles cercanas.`); return []; }
    const data = await res.json();
    const excluir = (calleAExcluir || "").trim().toUpperCase();
    const nombres = [];
    for (const el of data.elements || []) {
      const nombre = el.tags?.name?.trim();
      if (!nombre || nombre.toUpperCase() === excluir) continue;
      if (!nombres.includes(nombre)) nombres.push(nombre);
    }
    return nombres;
  } catch (e) {
    console.warn("No se pudieron sugerir calles cercanas ('entre calles'):", e.message || e);
    return [];
  }
}

async function reverseGeocode(lat, lon) {
  await cargarGoogleMapsScript();
  const geocoder = new window.google.maps.Geocoder();
  const direccion = await new Promise((resolve) => {
    geocoder.geocode({ location: { lat, lng: lon }, language: "es", region: "mx" }, (resultados, status) => {
      if (status !== "OK" || !resultados?.length) {
        if (status === "REQUEST_DENIED") {
          console.error(
            "Google Geocoding rechazó la solicitud (REQUEST_DENIED) — revisa que GOOGLE_MAPS_API_KEY sea válida, que el proyecto tenga facturación activa, y que \"Maps JavaScript API\" (y/o \"Geocoding API\") esté habilitada en Google Cloud Console."
          );
        } else if (status !== "ZERO_RESULTS") {
          console.warn(`Google Geocoding respondió: ${status}`);
        }
        resolve({});
        return;
      }
      // Combina TODOS los resultados que regresa Google (vienen del más
      // específico al más general) en vez de quedarse solo con el
      // primero: si al resultado más preciso le falta, por ejemplo, la
      // colonia, se completa con la que traiga un resultado más amplio,
      // igual que antes se combinaban los zooms 18/16 de Nominatim.
      const combinado = {};
      for (const resultado of resultados) {
        const comp = componentesDe(resultado);
        for (const tipo in comp) if (!(tipo in combinado)) combinado[tipo] = comp[tipo];
      }
      resolve({
        calle: combinado.route || "",
        numero: combinado.street_number || "",
        colonia: combinado.sublocality_level_1 || combinado.neighborhood || combinado.sublocality || combinado.colloquial_area || "",
        municipio: combinado.locality || combinado.administrative_area_level_2 || "",
        estado: combinado.administrative_area_level_1 || "",
        codigoPostal: combinado.postal_code || "",
      });
    });
  });

  // Sugiere "entre calle 1" y "entre calle 2" con las vialidades cercanas
  // (ver buscarCallesCercanas arriba). Si Overpass falla o no encuentra
  // nada, se dejan vacías igual que antes — no rompe el resto del llenado.
  const cercanas = await buscarCallesCercanas(lat, lon, direccion.calle);

  return {
    ...direccion,
    entreCalle1: cercanas[0] || "",
    entreCalle2: cercanas[1] || "",
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

function TextInput({ value, onChange, placeholder, type = "text", invalido = false }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={invalido ? { ...inputStyle, border: `1px solid ${COLORS.red}`, boxShadow: `0 0 0 1px ${COLORS.red}` } : inputStyle}
    />
  );
}

export default function AltaClienteView({ vendedorUsername, rutaCodigo }) {
  const [form, setForm] = useState(initialForm);
  const [ubicando, setUbicando] = useState(false);
  const [ubicacionMsg, setUbicacionMsg] = useState("");
  const [foto, setFoto] = useState(null); // { file, previewUrl }
  const [archivo, setArchivo] = useState(null); // File opcional
  const [guardando, setGuardando] = useState(false);
  const [status, setStatus] = useState("");
  const [misAltas, setMisAltas] = useState([]);
  const [errores, setErrores] = useState(new Set()); // keys de CAMPOS_REQUERIDOS que faltaron en el último intento de guardar
  const [fotoConError, setFotoConError] = useState(false);
  const fotoInputRef = useRef(null);
  const archivoInputRef = useRef(null);

  const setCampo = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    // En cuanto el usuario captura algo en un campo que estaba marcado en
    // rojo, se le quita el error — no hace falta que vuelva a dar
    // GUARDAR para que desaparezca el recuadro rojo.
    setErrores((prev) => {
      if (!prev.has(key)) return prev;
      const siguiente = new Set(prev);
      siguiente.delete(key);
      return siguiente;
    });
  };

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
            entreCalle1: dir.entreCalle1 || f.entreCalle1,
            entreCalle2: dir.entreCalle2 || f.entreCalle2,
            municipio: dir.municipio || f.municipio,
            estado: dir.estado || f.estado,
            codigoPostal: dir.codigoPostal || f.codigoPostal,
          }));
          const faltaNumero = !dir.numero;
          const faltanEntreCalles = !dir.entreCalle1 && !dir.entreCalle2;
          if (faltaNumero && faltanEntreCalles) {
            setUbicacionMsg("Dirección sugerida — el mapa no tiene el número exacto ni las calles que cruzan cerca, agrégalos a mano. Revisa lo demás antes de guardar.");
          } else if (faltaNumero) {
            setUbicacionMsg("Dirección sugerida — el mapa no tiene registrado el número exacto de esta calle, agrégalo a mano. Revisa lo demás antes de guardar.");
          } else if (faltanEntreCalles) {
            setUbicacionMsg("Dirección sugerida — no se encontraron calles cercanas para \"entre calles\", agrégalas a mano. Revisa lo demás antes de guardar.");
          } else {
            setUbicacionMsg("Dirección sugerida — revísala y corrige lo que haga falta antes de guardar.");
          }
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
    setFotoConError(false);
  }

  function onArchivoSeleccionado(e) {
    const file = e.target.files?.[0];
    if (file) setArchivo(file);
  }

  function camposFaltantes() {
    const requeridos = ["nombreNegocio", "nombreCliente", "telefono", "volumenSemanal", "coordX", "coordY"];
    for (const c of CAMPOS_DIRECCION) if (c.required) requeridos.push(c.key);
    return requeridos.filter((k) => !String(form[k] || "").trim());
  }

  async function guardar() {
    const faltantes = camposFaltantes();
    const faltaFoto = !foto;
    if (faltantes.length > 0 || faltaFoto) {
      // Remarca en rojo cada recuadro que falta (incluye coordX/coordY,
      // que son los que llena "Usar mi ubicación") y, si falta, el de la
      // foto — así no hay que adivinar cuál de todos es el que falló.
      setErrores(new Set(faltantes));
      setFotoConError(faltaFoto);
      setStatus(
        faltantes.length > 0 && faltaFoto
          ? `Faltan campos obligatorios: ${faltantes.length} (y la foto de la tienda).`
          : faltantes.length > 0
          ? `Faltan campos obligatorios: ${faltantes.length}.`
          : "La foto de la tienda es obligatoria."
      );
      setTimeout(() => setStatus(""), 3000);
      return;
    }
    setErrores(new Set());
    setFotoConError(false);
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
        ruta_codigo: rutaCodigo || null,
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
              <TextInput value={form.nombreNegocio} onChange={(v) => setCampo("nombreNegocio", v)} placeholder="Ej. Abarrotes La Esquina" invalido={errores.has("nombreNegocio")} />
            </Field>
            <Field label="Nombre del cliente" required>
              <TextInput value={form.nombreCliente} onChange={(v) => setCampo("nombreCliente", v)} placeholder="Ej. Juan Pérez" invalido={errores.has("nombreCliente")} />
            </Field>
            <Field label="Teléfono" required>
              <TextInput value={form.telefono} onChange={(v) => setCampo("telefono", v)} placeholder="10 dígitos" type="tel" invalido={errores.has("telefono")} />
            </Field>
            <Field label="Vol. total categoría cigarros semanalmente" required>
              <TextInput value={form.volumenSemanal} onChange={(v) => setCampo("volumenSemanal", v)} placeholder="Ej. 40" type="number" invalido={errores.has("volumenSemanal")} />
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
                <TextInput value={form[c.key]} onChange={(v) => setCampo(c.key, v)} invalido={errores.has(c.key)} />
              </Field>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Coordenada X (longitud)" required>
              <TextInput value={form.coordX} onChange={(v) => setCampo("coordX", v)} placeholder="Se llena con 'Usar mi ubicación'" invalido={errores.has("coordX")} />
            </Field>
            <Field label="Coordenada Y (latitud)" required>
              <TextInput value={form.coordY} onChange={(v) => setCampo("coordY", v)} placeholder="Se llena con 'Usar mi ubicación'" invalido={errores.has("coordY")} />
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
                border: `1px dashed ${fotoConError ? COLORS.red : COLORS.cardBorder}`, borderRadius: 12, padding: "16px", cursor: "pointer",
                color: fotoConError ? COLORS.red : COLORS.inkMuted, fontSize: 13,
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
