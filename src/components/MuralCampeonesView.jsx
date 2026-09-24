// @ts-nocheck
/* =====================================================================
   MuralCampeonesView — "empleado/vendedor del mes" por área. Cada área
   (Ventas, Administración, Liquidación, Almacén, Merch, Supervisor
   Ventas, Supervisor Merch) puede tener HASTA 3 ganadores por mes
   (empates, equipo, etc.) — no todas las áreas tienen ganador SIEMPRE:
   Ventas casi siempre sí, las demás puede que sí o puede que no. Por
   eso cada registro tiene un flag "activo": cuando está apagado (o no
   existe registro para el periodo actual), esa área/slot simplemente
   no aparece en el mural para el staff normal, en vez de mostrar una
   tarjeta vacía. Solo GERENTE ve los botones para subir/cambiar foto y
   activar/desactivar cada ganador.

   Se guarda un registro por (área, periodo, slot) — periodo = "YYYY-MM",
   slot = 1..3 — así queda historial: cada área puede ver quién ganó en
   meses anteriores (el histórico siempre muestra los periodos pasados,
   sin importar el flag "activo" — ese flag solo controla si la
   tarjeta del MES ACTUAL se ve o se oculta).

   Igual que "Mi Fondo" (FondoPersonalizado.jsx), la foto se sube a
   Supabase Storage y solo se guarda la URL pública en la tabla.

   Animación: al entrar a la pestaña (si hay algún ganador activo este
   mes) y al guardar un ganador nuevo, se lanza un confeti con la
   librería "canvas-confetti". Hay que agregarla como dependencia:

     npm install canvas-confetti

   (si no tienes el proyecto en tu computadora, agrega manualmente
   "canvas-confetti": "^1.9.3" dentro de "dependencies" en tu
   package.json — Vercel la instala sola con "npm install" en el
   siguiente deploy).

   SQL necesario en Supabase (una sola vez):

     insert into storage.buckets (id, name, public)
     values ('mural_campeones', 'mural_campeones', true)
     on conflict (id) do nothing;

     create policy "Cualquiera puede ver mural" on storage.objects
       for select using (bucket_id = 'mural_campeones');
     create policy "Cualquiera puede subir mural" on storage.objects
       for insert with check (bucket_id = 'mural_campeones');
     create policy "Cualquiera puede actualizar mural" on storage.objects
       for update using (bucket_id = 'mural_campeones');
     create policy "Cualquiera puede borrar mural" on storage.objects
       for delete using (bucket_id = 'mural_campeones');

     create table if not exists mural_campeones_ganadores (
       area text not null,
       periodo text not null,
       slot integer not null default 1,
       nombre text not null default '',
       url text,
       activo boolean not null default true,
       actualizado_por text,
       actualizado_en timestamptz not null default now(),
       primary key (area, periodo, slot)
     );
     alter table mural_campeones_ganadores enable row level security;
     create policy "permitir todo por ahora" on mural_campeones_ganadores
       for all using (true) with check (true);

   Cómo se usa (en StaffView.jsx, dentro de la rama de la pestaña):

     {objTab === "mural_campeones" && (
       <MuralCampeonesView puesto={puesto} staffUsername={staffUsername} />
     )}
===================================================================== */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Upload, ChevronDown, ChevronUp, Crown } from "lucide-react";
import confetti from "canvas-confetti";
import { supabase } from "../supabaseClient";
import { AREAS_MURAL_CAMPEONES } from "../constants";

const BUCKET = "mural_campeones";
const TABLA = "mural_campeones_ganadores";
const MAX_GANADORES_POR_AREA = 3;

function periodoActualISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function etiquetaPeriodo(periodo) {
  const [y, m] = String(periodo || "").split("-");
  const meses = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const idx = Number(m) - 1;
  return `${meses[idx] || m} ${y}`;
}

function lanzarConfeti() {
  try {
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, colors: ["#FFD700", "#FFFFFF", "#FFB800"] });
  } catch (e) {
    // canvas-confetti no instalada todavía; ignorar en silencio
  }
}

export default function MuralCampeonesView({ puesto, staffUsername }) {
  const esGerente = puesto === "gerente";
  const periodoActual = periodoActualISO();

  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [historialAbierto, setHistorialAbierto] = useState(null); // area key o null
  const [editando, setEditando] = useState(null); // { area, slot } o null

  useEffect(() => {
    let activo = true;
    supabase
      .from(TABLA)
      .select("*")
      .order("periodo", { ascending: false })
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) {
          console.warn("No se pudo cargar el Mural de Campeones:", error);
          setCargando(false);
          return;
        }
        setRegistros(data || []);
        setCargando(false);
      });
    return () => { activo = false; };
  }, []);

  const porArea = useMemo(() => {
    const mapa = {};
    AREAS_MURAL_CAMPEONES.forEach((a) => { mapa[a.key] = []; });
    registros.forEach((r) => {
      if (!mapa[r.area]) mapa[r.area] = [];
      mapa[r.area].push(r);
    });
    return mapa;
  }, [registros]);

  function registroSlot(areaKey, slot) {
    return (porArea[areaKey] || []).find((r) => r.periodo === periodoActual && Number(r.slot || 1) === slot) || null;
  }

  function registrosActualesActivos(areaKey) {
    const out = [];
    for (let s = 1; s <= MAX_GANADORES_POR_AREA; s++) {
      const r = registroSlot(areaKey, s);
      if (r && r.activo) out.push(r);
    }
    return out;
  }

  function siguienteSlotLibre(areaKey) {
    for (let s = 1; s <= MAX_GANADORES_POR_AREA; s++) {
      if (!registroSlot(areaKey, s)) return s;
    }
    return null;
  }

  function historialRegistro(areaKey) {
    return (porArea[areaKey] || [])
      .filter((r) => r.periodo !== periodoActual)
      .sort((x, y) => (x.periodo === y.periodo ? (x.slot || 1) - (y.slot || 1) : x.periodo < y.periodo ? 1 : -1));
  }

  useEffect(() => {
    if (cargando) return;
    const hayAlgunGanadorActivo = registros.some((r) => r.periodo === periodoActual && r.activo);
    if (hayAlgunGanadorActivo) lanzarConfeti();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando]);

  async function guardarGanador({ area, slot = 1, nombre, file, activo: activoNuevo }) {
    let url = registroSlot(area, slot)?.url || null;
    if (file) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const rutaArchivo = `${area}-${periodoActual}-slot${slot}-${Date.now()}.${ext}`;
      const { error: errSubida } = await supabase.storage
        .from(BUCKET)
        .upload(rutaArchivo, file, { upsert: true, cacheControl: "3600" });
      if (errSubida) throw errSubida;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(rutaArchivo);
      url = pub.publicUrl;
    }

    const registro = {
      area,
      periodo: periodoActual,
      slot,
      nombre: nombre || "",
      url,
      activo: activoNuevo,
      actualizado_por: staffUsername || null,
      actualizado_en: new Date().toISOString(),
    };
    const { error } = await supabase.from(TABLA).upsert(registro);
    if (error) throw error;

    setRegistros((prev) => {
      const sinEste = prev.filter((r) => !(r.area === area && r.periodo === periodoActual && Number(r.slot || 1) === slot));
      return [...sinEste, registro];
    });

    if (activoNuevo) lanzarConfeti();
  }

  const areasVisibles = AREAS_MURAL_CAMPEONES.filter((a) => {
    const hayGanador = registrosActualesActivos(a.key).length > 0;
    return hayGanador || esGerente; // staff normal no ve tarjetas vacías
  });

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div className="display" style={{ fontSize: 20, color: "#FFD700", textShadow: "0 0 12px #FFD70090" }}>
          {"🏆"} MURAL DE CAMPEONES
        </div>
        <div style={{ fontSize: 12.5, color: "#9AA7BD", marginTop: 4 }}>
          {etiquetaPeriodo(periodoActual)} · empleado/vendedor destacado por área
        </div>
      </div>

      {cargando ? (
        <div style={{ textAlign: "center", color: "#9AA7BD", padding: 30 }}>Cargando...</div>
      ) : areasVisibles.length === 0 ? (
        <div style={{ textAlign: "center", color: "#6C7A96", padding: 30, fontSize: 13 }}>
          Todavía no hay campeones publicados este mes.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {areasVisibles.map((a) => {
            const ganadores = registrosActualesActivos(a.key);
            const hist = historialRegistro(a.key);
            const hayGanador = ganadores.length > 0;
            const slotLibre = siguienteSlotLibre(a.key);

            return (
              <div
                key={a.key}
                className="card"
                style={{
                  padding: 18, textAlign: "center", position: "relative",
                  border: hayGanador ? "1px solid #FFD70070" : "1px dashed #2A3852",
                  boxShadow: hayGanador ? "0 0 18px -6px #FFD700" : "none",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em", color: "#9AA7BD", marginBottom: 10 }}>
                  {a.label}
                </div>

                {hayGanador ? (
                  <>
                    <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                      {ganadores.map((reg) => (
                        <div key={reg.slot || 1} style={{ width: 76 }}>
                          <div style={{
                            width: 60, height: 60, borderRadius: "50%", overflow: "hidden", margin: "0 auto 6px",
                            border: "2px solid #FFD700", boxShadow: "0 0 10px -2px #FFD700",
                          }}>
                            {reg.url ? (
                              <img src={reg.url} alt={reg.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0E1626", color: "#FFD700" }}>
                                <Crown size={22} />
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#E8EDF5", lineHeight: 1.2 }}>{reg.nombre || "—"}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "#FFD700", marginTop: 8 }}>
                      {ganadores.length > 1 ? "★ Campeones del mes" : "★ Campeón del mes"}
                    </div>
                  </>
                ) : (
                  <div style={{ padding: "20px 0", color: "#6C7A96", fontSize: 12.5 }}>
                    Sin ganador este mes
                  </div>
                )}

                {hist.length > 0 && (
                  <button
                    className="btn-ghost"
                    style={{ marginTop: 12, fontSize: 11, padding: "6px 10px" }}
                    onClick={() => setHistorialAbierto(historialAbierto === a.key ? null : a.key)}
                  >
                    {historialAbierto === a.key ? <ChevronUp size={12} style={{ verticalAlign: "-2px" }} /> : <ChevronDown size={12} style={{ verticalAlign: "-2px" }} />} Histórico ({hist.length})
                  </button>
                )}

                {historialAbierto === a.key && (
                  <div style={{ marginTop: 10, textAlign: "left", borderTop: "1px solid #1E2A42", paddingTop: 10 }}>
                    {hist.map((r) => (
                      <div key={`${r.periodo}-${r.slot || 1}`} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "1px solid #2A3852" }}>
                          {r.url && <img src={r.url} alt={r.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                        </div>
                        <div style={{ fontSize: 11.5 }}>
                          <div style={{ color: "#E8EDF5" }}>{r.nombre || "—"}{!r.activo ? " (desactivado)" : ""}</div>
                          <div style={{ color: "#6C7A96" }}>{etiquetaPeriodo(r.periodo)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {esGerente && (
                  <div style={{ marginTop: 14, borderTop: "1px solid #1E2A42", paddingTop: 12 }}>
                    {editando && editando.area === a.key ? (
                      <FormularioGanador
                        registroActual={registroSlot(a.key, editando.slot)}
                        onCancelar={() => setEditando(null)}
                        onGuardar={async (payload) => {
                          await guardarGanador({ area: a.key, slot: editando.slot, ...payload });
                          setEditando(null);
                        }}
                      />
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {[1, 2, 3].map((slot) => {
                          const reg = registroSlot(a.key, slot);
                          if (!reg) return null;
                          return (
                            <div key={slot} style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                              <span style={{ fontSize: 10.5, color: "#6C7A96" }}>{reg.nombre || `Ganador ${slot}`}:</span>
                              <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setEditando({ area: a.key, slot })}>
                                Cambiar
                              </button>
                              <button
                                className="btn-ghost"
                                style={{ fontSize: 11, padding: "4px 8px" }}
                                onClick={() => guardarGanador({ area: a.key, slot, nombre: reg.nombre, file: null, activo: !reg.activo })}
                              >
                                {reg.activo ? "Desactivar" : "Reactivar"}
                              </button>
                            </div>
                          );
                        })}
                        {slotLibre && (
                          <button
                            className="btn"
                            style={{ fontSize: 12, padding: "6px 12px", marginTop: 4 }}
                            onClick={() => setEditando({ area: a.key, slot: slotLibre })}
                          >
                            + Agregar {hayGanador ? "otro " : ""}ganador
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormularioGanador({ registroActual, onGuardar, onCancelar }) {
  const [nombre, setNombre] = useState(registroActual?.nombre || "");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(registroActual?.url || null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  function elegirArchivo(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Ese archivo no es una imagen. Sube un .jpg, .png o similar.");
      return;
    }
    setError("");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function guardar() {
    setGuardando(true);
    setError("");
    try {
      await onGuardar({ nombre: nombre.trim(), file, activo: true });
    } catch (err) {
      console.error("Error guardando ganador del mural:", err);
      setError("No se pudo guardar. Verifica que exista el bucket 'mural_campeones' y la tabla 'mural_campeones_ganadores' en Supabase.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      {preview && (
        <div style={{ width: 80, height: 80, borderRadius: "50%", overflow: "hidden", margin: "0 auto 10px", border: "1px solid #2A3852" }}>
          <img src={preview} alt="Vista previa" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      )}
      <button className="btn-ghost" type="button" style={{ fontSize: 12, width: "100%", marginBottom: 8 }} onClick={() => inputRef.current?.click()}>
        <Upload size={12} style={{ verticalAlign: "-2px" }} /> {preview ? "Cambiar foto" : "Subir foto"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={elegirArchivo} />

      <input
        type="text"
        placeholder="Nombre del ganador"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        style={{ width: "100%", marginBottom: 8, fontSize: 12.5 }}
      />

      {error && <div style={{ fontSize: 11, color: "#FF6B6B", marginBottom: 8 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button className="btn" type="button" style={{ fontSize: 12, padding: "6px 12px" }} disabled={guardando || !nombre.trim()} onClick={guardar}>
          {guardando ? "Guardando..." : "Guardar"}
        </button>
        <button className="btn-ghost" type="button" style={{ fontSize: 12, padding: "6px 12px" }} onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
