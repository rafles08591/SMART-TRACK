// @ts-nocheck
import React, { useState } from "react";
import { Target, Upload, Trash2, Plus, CheckCircle2, AlertCircle, Image as ImageIcon } from "lucide-react";
import { RUTAS, NOMBRES } from "../constants";
import { money, unidades, fechaHoyISO } from "../utils";
import { supabase } from "../supabaseClient";
import { KpiCard, BotonGuardarImagen } from "./ui";
import { useCapturaImagen } from "./hooks";

function otcEnRango(data, rally, nombreRuta, desde, hasta) {
  const codigos = rally.codigosParticipantes || [];
  const enPiezas = rally.unidad === "piezas";
  return (data.otcDia || [])
    .filter((r) =>
      r.vendedor === nombreRuta
      && (!desde || r.fecha >= desde)
      && (!hasta || r.fecha <= hasta)
      && (codigos.length === 0 || codigos.includes(r.codigoArticulo))
    )
    .reduce((s, r) => s + (enPiezas ? (Number(r.unidadesVendidas) || 0) : (Number(r.monto) || 0)), 0);
}

function calcularAvanceRallyRuta(data, rally, nombreRuta) {
  const obj = rally.objetivos?.[nombreRuta] || { dia: 0, final: 0 };
  const hoy = fechaHoyISO();
  return {
    avanceDia: otcEnRango(data, rally, nombreRuta, hoy, hoy),
    objetivoDia: obj.dia || 0,
    avanceTotal: otcEnRango(data, rally, nombreRuta, rally.fechaInicio, rally.fechaFin),
    objetivoFinal: obj.final || 0,
  };
}

// Progreso de UN vendedor dentro del rally (vista del propio vendedor). Si
// ya cubrió su objetivo final, se oculta el número exacto y solo se marca
// en verde como cubierto (para no mostrar "cuánto se pasó").
function ProgresoRallyRuta({ nombreRuta, rally, data }) {
  if (!rally.rutasParticipantes.includes(nombreRuta)) {
    return <div className="card" style={{ padding: 24, textAlign: "center", color: "#9AA7BD" }}>Tu ruta no participa en este rally.</div>;
  }
  const fmtRally = rally.unidad === "piezas" ? unidades : money;
  const { avanceDia, objetivoDia, avanceTotal, objetivoFinal } = calcularAvanceRallyRuta(data, rally, nombreRuta);
  const cumplioDia = objetivoDia > 0 && avanceDia >= objetivoDia;
  const cumplioFinal = objetivoFinal > 0 && avanceTotal >= objetivoFinal;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      <KpiCard
        icon={<Calendar size={14} />}
        label="Avance del día"
        value={cumplioDia ? "¡Objetivo del día cubierto!" : `${fmtRally(avanceDia)} / ${fmtRally(objetivoDia)}`}
        accent={cumplioDia ? "#3DDC97" : metaColor(avanceDia, objetivoDia)}
      />
      <KpiCard
        icon={<Target size={14} />}
        label="Avance total del rally"
        value={cumplioFinal ? "¡YA CUBRISTE TU OBJETIVO!" : `${fmtRally(avanceTotal)} / ${fmtRally(objetivoFinal)}`}
        accent={cumplioFinal ? "#3DDC97" : metaColor(avanceTotal, objetivoFinal)}
      />
    </div>
  );
}

// Progreso agregado (suma de todas las rutas participantes) — para
// supervisor1/gerente (con objetivo) y supervisor2 (solo informativo, sin
// objetivo). Cada ruta que ya cubrió su objetivo final se marca "CUBIERTO"
// en la tabla, sin mostrar el excedente.
function ProgresoRallyAgregado({ rutas, data, rally, mostrarObjetivo }) {
  const fmtRally = rally.unidad === "piezas" ? unidades : money;
  let sumaAvanceDia = 0, sumaObjDia = 0, sumaAvanceTotal = 0, sumaObjFinal = 0;
  const filas = rutas.map((r) => {
    const a = calcularAvanceRallyRuta(data, rally, r);
    sumaAvanceDia += a.avanceDia; sumaObjDia += a.objetivoDia;
    sumaAvanceTotal += a.avanceTotal; sumaObjFinal += a.objetivoFinal;
    return { ruta: r, ...a };
  });
  const cumplioDiaTotal = mostrarObjetivo && sumaObjDia > 0 && sumaAvanceDia >= sumaObjDia;
  const cumplioFinalTotal = mostrarObjetivo && sumaObjFinal > 0 && sumaAvanceTotal >= sumaObjFinal;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <KpiCard
          icon={<Calendar size={14} />}
          label="Avance del día (equipo)"
          value={mostrarObjetivo ? (cumplioDiaTotal ? "¡Objetivo del día cubierto!" : `${fmtRally(sumaAvanceDia)} / ${fmtRally(sumaObjDia)}`) : fmtRally(sumaAvanceDia)}
          accent={mostrarObjetivo ? (cumplioDiaTotal ? "#3DDC97" : metaColor(sumaAvanceDia, sumaObjDia)) : undefined}
        />
        <KpiCard
          icon={<Target size={14} />}
          label="Avance total (equipo)"
          value={mostrarObjetivo ? (cumplioFinalTotal ? "¡YA CUBRIERON EL OBJETIVO!" : `${fmtRally(sumaAvanceTotal)} / ${fmtRally(sumaObjFinal)}`) : fmtRally(sumaAvanceTotal)}
          accent={mostrarObjetivo ? (cumplioFinalTotal ? "#3DDC97" : metaColor(sumaAvanceTotal, sumaObjFinal)) : undefined}
        />
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "#9AA7BD", textAlign: "left" }}>
              <th style={{ padding: "8px 16px" }}>Ruta</th>
              <th>Avance día</th>
              {mostrarObjetivo && <th>Obj. día</th>}
              <th>Avance total</th>
              {mostrarObjetivo && <th>Obj. final</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const cumplio = mostrarObjetivo && f.objetivoFinal > 0 && f.avanceTotal >= f.objetivoFinal;
              return (
                <tr key={f.ruta} style={{ borderTop: "1px solid #1E2A42" }}>
                  <td style={{ padding: "10px 16px" }}>{f.ruta}{NOMBRES[f.ruta] ? ` · ${NOMBRES[f.ruta]}` : ""}</td>
                  <td>{fmtRally(f.avanceDia)}</td>
                  {mostrarObjetivo && <td>{fmtRally(f.objetivoDia)}</td>}
                  <td>{fmtRally(f.avanceTotal)}</td>
                  {mostrarObjetivo && <td>{fmtRally(f.objetivoFinal)}</td>}
                  <td>
                    {cumplio && (
                      <span style={{ background: "#0f2a20", border: "1px solid #3DDC97", color: "#3DDC97", fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "2px 8px" }}>
                        CUBIERTO
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Pestaña RALLY OTC — visible para todos los roles.
 * - Gerente: configura el rally (nombre, vigencia, rutas participantes,
 *   imagen, objetivos por ruta) y puede activarlo/desactivarlo. También
 *   tiene la opción de guardar/descargar una imagen del avance.
 * - Vendedor: ve su propio avance del día y total contra su objetivo.
 * - Supervisor-1 / Gerente: ven el avance agregado del equipo contra la
 *   suma de los objetivos de todas las rutas participantes.
 * - Supervisor-2: ve el avance agregado, sin objetivo (solo informativo).
 */
export default function RallyOtcView({ data, persist, persistFresco, puesto, rol, vendedorActual, revisorNombre }) {
  const rally = data.rallyOtc || { activo: false, nombre: "", fechaInicio: null, fechaFin: null, rutasParticipantes: [], imagen: null, objetivos: {}, codigosParticipantes: [], unidad: "dinero" };
  const esGerente = rol === "staff" && puesto === "gerente";
  const captura = useCapturaImagen();
  const [form, setForm] = useState(null);
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [nuevoCodigoTexto, setNuevoCodigoTexto] = useState("");
  const fileRef = useRef(null);

  // Solo de referencia (no se usan para armar botones): códigos que ya
  // aparecieron en archivos de OTC del día subidos, por si al gerente le
  // sirve de guía al capturar los suyos a mano.
  const codigosVistosEnOtc = [...new Set((data.otcDia || []).map((r) => r.codigoArticulo).filter(Boolean))].sort();

  function iniciarEdicion() {
    setForm({
      nombre: rally.nombre || "",
      fechaInicio: rally.fechaInicio || "",
      fechaFin: rally.fechaFin || "",
      rutasParticipantes: [...(rally.rutasParticipantes || [])],
      imagen: rally.imagen || null,
      objetivos: { ...(rally.objetivos || {}) },
      codigosParticipantes: [...(rally.codigosParticipantes || [])],
      unidad: rally.unidad || "dinero",
    });
    setNuevoCodigoTexto("");
  }

  function toggleRuta(nombreRuta) {
    setForm((f) => {
      const yaEsta = f.rutasParticipantes.includes(nombreRuta);
      const rutasParticipantes = yaEsta ? f.rutasParticipantes.filter((r) => r !== nombreRuta) : [...f.rutasParticipantes, nombreRuta];
      const objetivos = { ...f.objetivos };
      if (!yaEsta && !objetivos[nombreRuta]) objetivos[nombreRuta] = { dia: 0, final: 0 };
      return { ...f, rutasParticipantes, objetivos };
    });
  }

  function agregarCodigoManual() {
    const codigo = nuevoCodigoTexto.trim();
    if (!codigo) return;
    setForm((f) => (f.codigosParticipantes.includes(codigo) ? f : { ...f, codigosParticipantes: [...f.codigosParticipantes, codigo] }));
    setNuevoCodigoTexto("");
  }

  function quitarCodigoManual(codigo) {
    setForm((f) => ({ ...f, codigosParticipantes: f.codigosParticipantes.filter((c) => c !== codigo) }));
  }

  function actualizarObjetivo(nombreRuta, campo, valor) {
    setForm((f) => ({ ...f, objetivos: { ...f.objetivos, [nombreRuta]: { ...(f.objetivos[nombreRuta] || {}), [campo]: Number(valor) || 0 } } }));
  }

  async function subirImagenRally(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      alert("La imagen pesa más de 3MB. Usa una más ligera.");
      return;
    }
    setSubiendoImagen(true);
    try {
      const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
      const nombreArchivo = `rally_${Date.now()}.${extension}`;
      const { error } = await supabase.storage.from("promociones").upload(nombreArchivo, file, { cacheControl: "3600", upsert: false });
      if (error) {
        alert(`No se pudo subir la imagen: ${error.message}`);
        return;
      }
      const { data: urlData } = supabase.storage.from("promociones").getPublicUrl(nombreArchivo);
      setForm((f) => ({ ...f, imagen: urlData.publicUrl }));
    } finally {
      setSubiendoImagen(false);
    }
  }

  function guardarRally(activo) {
    persistFresco(() => ({
      rallyOtc: {
        activo,
        nombre: form.nombre.trim(),
        fechaInicio: form.fechaInicio || null,
        fechaFin: form.fechaFin || null,
        rutasParticipantes: form.rutasParticipantes,
        imagen: form.imagen,
        objetivos: form.objetivos,
        codigosParticipantes: form.codigosParticipantes,
        unidad: form.unidad,
      },
    }));
    setForm(null);
  }

  function desactivarRally() {
    persistFresco((fresca) => ({ rallyOtc: { ...(fresca.rallyOtc || rally), activo: false } }));
  }

  return (
    <div>
      <div className="display" style={{ fontSize: 16, color: "#E8EDF5", marginBottom: 14 }}>RALLY OTC</div>

      {esGerente && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: form ? 14 : 0, flexWrap: "wrap", gap: 8 }}>
            <div className="display" style={{ fontSize: 13, color: "#9AA7BD" }}>
              CONFIGURACIÓN {rally.activo ? <span style={{ color: "#3DDC97" }}>· ACTIVO</span> : <span style={{ color: "#9AA7BD" }}>· INACTIVO</span>}
            </div>
            {!form && (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-ghost" onClick={iniciarEdicion}>{rally.nombre ? "Editar rally" : "Configurar rally"}</button>
                {rally.activo && <button className="btn-ghost" onClick={desactivarRally}>Desactivar</button>}
              </div>
            )}
          </div>

          {form && (
            <div>
              <input
                type="text" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre del rally"
                style={{ width: "100%", boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "10px 12px", marginBottom: 10 }}
              />
              <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 11, color: "#9AA7BD", marginBottom: 4 }}>Fecha de inicio</div>
                  <input type="date" value={form.fechaInicio || ""} onChange={(e) => setForm((f) => ({ ...f, fechaInicio: e.target.value }))} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px" }} />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 11, color: "#9AA7BD", marginBottom: 4 }}>Fecha de fin (vigencia)</div>
                  <input type="date" value={form.fechaFin || ""} onChange={(e) => setForm((f) => ({ ...f, fechaFin: e.target.value }))} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px" }} />
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 6 }}>RUTAS PARTICIPANTES</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(data.vendedores || []).map((v) => (
                    <button key={v.id} className={form.rutasParticipantes.includes(v.name) ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => toggleRuta(v.name)}>
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 6 }}>UNIDAD DEL RALLY</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className={form.unidad === "dinero" ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => setForm((f) => ({ ...f, unidad: "dinero" }))}>
                    Dinero ($)
                  </button>
                  <button className={form.unidad === "piezas" ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => setForm((f) => ({ ...f, unidad: "piezas" }))}>
                    Piezas (pz)
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 6 }}>
                  CÓDIGOS DE ARTÍCULO QUE SE SUMAN (OTC)
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    value={nuevoCodigoTexto}
                    onChange={(e) => setNuevoCodigoTexto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarCodigoManual(); } }}
                    placeholder="Escribe el código y agrégalo (ej. 304)"
                    style={{ flex: 1, boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "8px 10px" }}
                  />
                  <button className="btn" onClick={agregarCodigoManual}>
                    <Plus size={14} style={{ verticalAlign: "-2px" }} /> Agregar
                  </button>
                </div>

                {form.codigosParticipantes.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#9AA7BD" }}>
                    No has agregado ningún código todavía — si no agregas ninguno, se suma TODO el OTC sin filtrar.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {form.codigosParticipantes.map((codigo) => (
                      <div key={codigo} style={{ display: "flex", alignItems: "center", gap: 6, background: "#131C30", border: "1px solid #1E2A42", borderRadius: 8, padding: "6px 8px 6px 12px" }}>
                        <span style={{ fontSize: 12, color: "#E8EDF5" }}>{codigo}</span>
                        <button className="btn-ghost" style={{ padding: "2px 4px" }} onClick={() => quitarCodigoManual(codigo)}>
                          <Trash2 size={12} color="#FF6B6B" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {codigosVistosEnOtc.length > 0 && (
                  <div style={{ fontSize: 11, color: "#5b6478", marginTop: 8 }}>
                    Códigos vistos en tus archivos de OTC ya subidos (por si sirve de referencia): {codigosVistosEnOtc.join(", ")}
                  </div>
                )}
              </div>

              {form.rutasParticipantes.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 6 }}>OBJETIVOS POR RUTA ({form.unidad === "piezas" ? "PZ" : "$"})</div>
                  {form.rutasParticipantes.map((nombreRuta) => (
                    <div key={nombreRuta} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ width: 110, fontSize: 12, color: "#E8EDF5" }}>{nombreRuta}</span>
                      <input
                        type="number" placeholder={`Objetivo día (${form.unidad === "piezas" ? "pz" : "$"})`} value={form.objetivos[nombreRuta]?.dia || 0}
                        onChange={(e) => actualizarObjetivo(nombreRuta, "dia", e.target.value)}
                        style={{ width: 130, padding: "6px 8px" }}
                      />
                      <input
                        type="number" placeholder={`Objetivo final (${form.unidad === "piezas" ? "pz" : "$"})`} value={form.objetivos[nombreRuta]?.final || 0}
                        onChange={(e) => actualizarObjetivo(nombreRuta, "final", e.target.value)}
                        style={{ width: 130, padding: "6px 8px" }}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginBottom: 10 }}>
                <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 6 }}>IMAGEN ALUSIVA AL RALLY</div>
                <button className="btn" onClick={() => fileRef.current?.click()} disabled={subiendoImagen}>
                  {subiendoImagen ? "Subiendo..." : form.imagen ? "Cambiar imagen" : "Elegir imagen"}
                </button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={subirImagenRally} />
                {form.imagen && <img src={form.imagen} alt="Rally" style={{ maxWidth: 200, display: "block", marginTop: 8, borderRadius: 8 }} />}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn-ghost" onClick={() => setForm(null)}>Cancelar</button>
                <button className="btn-ghost" onClick={() => guardarRally(false)}>Guardar sin activar</button>
                <button className="btn" onClick={() => guardarRally(true)}>Guardar y activar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {!rally.activo ? (
        <div className="card" style={{ padding: 30, textAlign: "center", color: "#9AA7BD" }}>
          No hay un Rally OTC activo en este momento.
        </div>
      ) : (
        <>
          <div ref={captura.capturaRef}>
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
              {rally.imagen && <img src={rally.imagen} alt={rally.nombre} style={{ width: "100%", borderRadius: 10, marginBottom: 12, display: "block" }} />}
              <div className="display" style={{ fontSize: 18, color: "#E8EDF5" }}>{rally.nombre || "Rally OTC"}</div>
              <div style={{ fontSize: 12, color: "#9AA7BD", marginTop: 4 }}>
                Vigencia: {rally.fechaInicio || "—"} → {rally.fechaFin || "—"}
              </div>
            </div>

            {rol === "vendedor" ? (
              <ProgresoRallyRuta nombreRuta={vendedorActual} rally={rally} data={data} />
            ) : (
              <ProgresoRallyAgregado
                rutas={rally.rutasParticipantes}
                data={data}
                rally={rally}
                mostrarObjetivo={puesto !== "supervisor2"}
              />
            )}
          </div>

          {esGerente && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <BotonGuardarImagen captura={captura} nombreArchivo={`rally_otc_${fechaHoyISO()}.png`} etiqueta="Guardar / descargar" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
