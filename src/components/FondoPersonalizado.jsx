// @ts-nocheck
/* =====================================================================
   FondoPersonalizado — cada usuario puede subir su propia foto (familia,
   motivación, lo que sea) y queda de fondo en su pantalla de SMART-TRACK,
   solo para él. Se guarda en Supabase Storage (bucket "fondos_personal")
   y la URL en la tabla "fondos_usuario", identificada por su "identidad"
   (el username con el que entra — staffUsername para Gerente/Supervisor,
   o el nombre de la ruta para vendedores).

   SQL necesario en Supabase (una sola vez):

     insert into storage.buckets (id, name, public)
     values ('fondos_personal', 'fondos_personal', true)
     on conflict (id) do nothing;

     create policy "Cualquiera puede ver fondos" on storage.objects
       for select using (bucket_id = 'fondos_personal');
     create policy "Cualquiera puede subir fondos" on storage.objects
       for insert with check (bucket_id = 'fondos_personal');
     create policy "Cualquiera puede actualizar fondos" on storage.objects
       for update using (bucket_id = 'fondos_personal');
     create policy "Cualquiera puede borrar fondos" on storage.objects
       for delete using (bucket_id = 'fondos_personal');

     create table if not exists fondos_usuario (
       identidad text primary key,
       url text not null,
       actualizado_en timestamptz not null default now()
     );
     alter table fondos_usuario enable row level security;
     create policy "permitir todo por ahora" on fondos_usuario
       for all using (true) with check (true);

   Cómo se usa (en el componente raíz de cada vista, ej. StaffView.jsx):

     const [fondoUrl, setFondoUrl] = useFondoPersonalizado(identidad);
     ...
     return (
       <div className="app">
         <FondoDeFondo url={fondoUrl} />
         ...contenido normal...
         {tab === "mi_fondo" && (
           <PanelFondoPersonalizado identidad={identidad} url={fondoUrl} setUrl={setFondoUrl} />
         )}
       </div>
     );
===================================================================== */

import React, { useEffect, useRef, useState } from "react";
import { Upload, Trash2, ImageIcon } from "lucide-react";
import { supabase } from "../supabaseClient";

// Hook: trae (y expone cómo actualizar) el fondo guardado de esta identidad.
export function useFondoPersonalizado(identidad) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!identidad) { setUrl(null); return; }
    let activo = true;
    supabase
      .from("fondos_usuario")
      .select("url")
      .eq("identidad", identidad)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) { console.warn("No se pudo cargar el fondo personalizado:", error); return; }
        setUrl(data?.url || null);
      });
    return () => { activo = false; };
  }, [identidad]);

  return [url, setUrl];
}

// El fondo en sí: una capa fija detrás de todo el contenido, con un
// degradado oscuro encima para que el texto siga siendo legible sobre
// cualquier foto.
export function FondoDeFondo({ url }) {
  // IMPORTANTE: este div SIEMPRE se renderiza (nunca "return null"), aunque
  // no haya foto todavía. Si apareciera/desapareciera del DOM según si ya
  // cargó la URL, React tendría que INSERTAR un nodo nuevo al principio de
  // la lista de hermanos justo cuando llega la foto — y eso, combinado con
  // el parche defensivo de removeChild/insertBefore que tiene App.tsx (para
  // el bug del navegador de WhatsApp), puede fallar en silencio y dejar el
  // resto de la pantalla (el menú) en un estado roto. Manteniendo el div
  // siempre presente y solo cambiando su estilo, nunca se inserta ni se
  // quita nada del DOM — solo se actualiza una propiedad, sin riesgo.
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        backgroundImage: url ? `linear-gradient(rgba(11,18,32,0.55), rgba(11,18,32,0.72)), url("${url}")` : "none",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    />
  );
}

// Panel para subir/cambiar/quitar la foto — se muestra dentro de la
// pestaña "MI FONDO" de cada vista.
export default function PanelFondoPersonalizado({ identidad, url, setUrl }) {
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const inputRef = useRef(null);

  async function subirFoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !identidad) return;
    if (!file.type.startsWith("image/")) {
      setMensaje("Ese archivo no es una imagen. Sube un .jpg, .png o similar.");
      return;
    }
    setSubiendo(true);
    setMensaje("");
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const rutaArchivo = `${identidad.replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}.${ext}`;
      const { error: errSubida } = await supabase.storage
        .from("fondos_personal")
        .upload(rutaArchivo, file, { upsert: true, cacheControl: "3600" });
      if (errSubida) throw errSubida;

      const { data: pub } = supabase.storage.from("fondos_personal").getPublicUrl(rutaArchivo);
      const nuevaUrl = pub.publicUrl;

      const { error: errGuardar } = await supabase
        .from("fondos_usuario")
        .upsert({ identidad, url: nuevaUrl, actualizado_en: new Date().toISOString() });
      if (errGuardar) throw errGuardar;

      setUrl(nuevaUrl);
      setMensaje("¡Listo! Ya quedó tu foto de fondo.");
    } catch (err) {
      console.error("Error subiendo el fondo:", err);
      setMensaje("No se pudo subir la foto. Verifica que la tabla 'fondos_usuario' y el bucket 'fondos_personal' existan en Supabase, o intenta con otra imagen.");
    } finally {
      setSubiendo(false);
    }
  }

  async function quitarFondo() {
    if (!identidad) return;
    try {
      await supabase.from("fondos_usuario").delete().eq("identidad", identidad);
      setUrl(null);
      setMensaje("Se quitó tu fondo personalizado.");
    } catch (err) {
      console.error("Error quitando el fondo:", err);
      setMensaje("No se pudo quitar el fondo. Intenta de nuevo.");
    }
  }

  return (
    <div className="card" style={{ padding: 22, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <ImageIcon size={18} color="#F2B134" />
        <div className="display" style={{ fontSize: 16 }}>MI FONDO DE PANTALLA</div>
      </div>
      <p style={{ fontSize: 12.5, color: "#9AA7BD", marginTop: 0, marginBottom: 18 }}>
        Sube una foto tuya, de tu familia, o de lo que te motive — se queda de fondo cada vez que entres a SMART-TRACK. Es solo para ti; nadie más la ve en su pantalla.
      </p>

      {url && (
        <div style={{ marginBottom: 16, borderRadius: 12, overflow: "hidden", border: "1px solid #2A3852" }}>
          <img src={url} alt="Tu fondo actual" style={{ width: "100%", display: "block", maxHeight: 220, objectFit: "cover" }} />
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn" disabled={subiendo} onClick={() => inputRef.current?.click()}>
          <Upload size={14} style={{ verticalAlign: "-2px" }} /> {subiendo ? "Subiendo..." : url ? "Cambiar foto" : "Subir foto"}
        </button>
        {url && (
          <button className="btn-ghost" onClick={quitarFondo}>
            <Trash2 size={14} style={{ verticalAlign: "-2px" }} color="#FF6B6B" /> Quitar fondo
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={subirFoto} />

      {mensaje && (
        <div style={{ marginTop: 14, fontSize: 12.5, color: mensaje.startsWith("¡Listo") ? "#3DDC97" : mensaje.startsWith("Se quitó") ? "#9AA7BD" : "#FF6B6B" }}>
          {mensaje}
        </div>
      )}
    </div>
  );
}
