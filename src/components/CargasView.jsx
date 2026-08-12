// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Upload, Download, CheckCircle2, RefreshCw, Zap, Clock } from "lucide-react";
import { RUTAS, NOMBRES } from "../constants";
import { fechaHoyISO } from "../utils";

// Suma días a una fecha "YYYY-MM-DD" sin problemas de zona horaria.
function sumarDiasISO(fechaISO, dias) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

/* -----------------------------------------------------------------
   Cargas por día: el archivo que se sube hoy es, por default, para el
   día siguiente (lunes sube -> es la carga del martes, etc.). Pueden
   existir varias cargas guardadas a la vez (cargasPorFecha), pero solo
   UNA está "activa" (cargaActivaFecha) — esa es la que ven y editan
   los vendedores. El Gerente sube el archivo (queda guardado, sin
   activar) y decide cuándo activarlo.
------------------------------------------------------------------ */
export default function CargasView({ data, persist, persistCargas, puesto, rol, vendedorActual, onUpload, cargasFileInputRef, cargasStatus, onDescargar, onActivarCarga }) {
  const cargasPorFecha = data.cargasPorFecha || {};
  const cargaActivaFecha = data.cargaActivaFecha || null;
  const cargaActiva = cargaActivaFecha ? (cargasPorFecha[cargaActivaFecha] || null) : null;

  const esStaffConPermiso = rol === "staff" && (puesto === "gerente" || puesto === "supervisor");
  const esGerente = rol === "staff" && puesto === "gerente";
  const yaEnviado = !!cargaActiva?.enviosPorRuta?.[vendedorActual];
  const [rutaVistaStaff, setRutaVistaStaff] = useState(null);
  const [fechaParaSubir, setFechaParaSubir] = useState(() => sumarDiasISO(fechaHoyISO(), 1));

  // Edición 100% local (borrador): mientras se escribe, NO se guarda nada en
  // Supabase — así una sincronización en tiempo real de otro dispositivo
  // nunca puede "regresar" el número a medio escribir. Solo al presionar
  // "Enviar" se manda todo de un jalón.
  const rutaActiva = rol === "vendedor" ? vendedorActual : rutaVistaStaff;
  const [borrador, setBorrador] = useState({});
  useEffect(() => { setBorrador({}); }, [rutaActiva, cargaActivaFecha]);

  function cambiarLocal(itemIndex, valor) {
    setBorrador((b) => ({ ...b, [itemIndex]: valor }));
  }

  async function enviarPara(nombreRuta) {
    if (!cargaActivaFecha) return;
    await persistCargas(cargaActivaFecha, (cargasFrescas) => {
      const items = cargasFrescas.items.map((it, i) => {
        if (borrador[i] === undefined) return it;
        const valor = borrador[i];
        return { ...it, porRuta: { ...it.porRuta, [nombreRuta]: { ...it.porRuta[nombreRuta], modificada: valor === "" ? null : Number(valor) } } };
      });
      return { ...cargasFrescas, items, enviosPorRuta: { ...(cargasFrescas.enviosPorRuta || {}), [nombreRuta]: true } };
    });
    setBorrador({});
  }

  function subirArchivo(e) {
    onUpload(e, fechaParaSubir);
  }

  const fechasGuardadas = Object.keys(cargasPorFecha).sort().reverse();

  return (
    <div>
      <div className="display" style={{ fontSize: 16, color: "#E8EDF5", marginBottom: 14 }}>CARGAS</div>

      {esStaffConPermiso && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          {esGerente && (
            <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #1E2A42" }}>
              <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>SUBIR CARGA NUEVA</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, color: "#9AA7BD", marginBottom: 3 }}>¿Para qué día es esta carga?</div>
                  <input
                    type="date"
                    value={fechaParaSubir}
                    onChange={(e) => setFechaParaSubir(e.target.value)}
                    style={{ padding: "6px 8px", fontSize: 13, boxSizing: "border-box" }}
                  />
                </div>
                <button className="btn" onClick={() => cargasFileInputRef.current?.click()}>
                  <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir archivo de cargas
                </button>
                <input ref={cargasFileInputRef} type="file" accept=".xlsx,.xls,.xlsm" style={{ display: "none" }} onChange={subirArchivo} />
              </div>
              <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 6 }}>
                Por default es para mañana ({sumarDiasISO(fechaHoyISO(), 1)}) — cámbiala si es para otro día. Se guarda sin activar; actívala abajo cuando corresponda.
              </div>
              {cargasStatus && <div style={{ fontSize: 12, color: "#9AA7BD", marginTop: 6 }}>{cargasStatus}</div>}
            </div>
          )}

          <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>CARGAS GUARDADAS</div>
          {fechasGuardadas.length === 0 ? (
            <div style={{ fontSize: 12, color: "#9AA7BD" }}>Todavía no hay ninguna carga guardada.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: cargaActiva ? 16 : 0 }}>
              {fechasGuardadas.map((fecha) => {
                const c = cargasPorFecha[fecha];
                const activa = fecha === cargaActivaFecha;
                return (
                  <div key={fecha} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, border: activa ? "1px solid #3DDC97" : undefined }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#E8EDF5" }}>
                        Carga del {fecha} {activa && <span style={{ color: "#3DDC97", fontWeight: 800 }}>· ACTIVA</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#9AA7BD" }}>
                        {c.items.length} artículos · subida el {c.fechaSubida} {c.bloqueado && <span style={{ color: "#FF6B6B" }}>· bloqueada</span>}
                      </div>
                    </div>
                    {esGerente && !activa && (
                      <button className="btn-ghost" onClick={() => onActivarCarga(fecha)}>
                        <Zap size={13} style={{ verticalAlign: "-2px" }} /> Activar esta carga
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {cargaActiva && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #1E2A42" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
                <div className="display" style={{ fontSize: 13, color: "#9AA7BD" }}>
                  Editando carga activa · {cargaActiva.fecha} {cargaActiva.bloqueado && <span style={{ color: "#FF6B6B" }}>· BLOQUEADA</span>}
                </div>
                {cargaActiva.items.length > 0 && (
                  <button className="btn-ghost" onClick={onDescargar}>
                    <Download size={14} style={{ verticalAlign: "-2px" }} /> Descargar archivo modificado
                  </button>
                )}
              </div>
              {cargaActiva.bloqueado && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 6, marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#FF6B6B" }}>
                    Ya se descargó el archivo final — los vendedores ya no pueden modificar sus cantidades.
                  </div>
                  <button className="btn-ghost" onClick={() => persistCargas(cargaActivaFecha, (cargasFrescas) => ({ ...cargasFrescas, bloqueado: false }))}>
                    <RefreshCw size={13} style={{ verticalAlign: "-2px" }} /> Reactivar edición
                  </button>
                </div>
              )}

              {cargaActiva.items.length > 0 && (
                <div>
                  <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>ESTATUS POR RUTA · TOCA PARA VER/EDITAR SU CARGA</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: rutaVistaStaff ? 14 : 0 }}>
                    {RUTAS.map((nombreRuta) => {
                      const enviado = !!cargaActiva.enviosPorRuta?.[nombreRuta];
                      const seleccionada = rutaVistaStaff === nombreRuta;
                      return (
                        <div
                          key={nombreRuta}
                          style={{
                            display: "flex", alignItems: "center", borderRadius: 8,
                            border: `1px solid ${enviado ? "#3DDC97" : "#1E2A42"}`,
                            background: seleccionada ? "#1E2A42" : "transparent", overflow: "hidden",
                          }}
                        >
                          <button
                            onClick={() => setRutaVistaStaff((r) => (r === nombreRuta ? null : nombreRuta))}
                            style={{
                              display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 10px",
                              border: "none", background: "transparent", color: enviado ? "#3DDC97" : "#9AA7BD", cursor: "pointer",
                            }}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: 4, background: enviado ? "#3DDC97" : "#5b6478", display: "inline-block" }} />
                            {nombreRuta}{NOMBRES[nombreRuta] ? ` · ${NOMBRES[nombreRuta]}` : ""}
                          </button>
                          {enviado && (
                            <button
                              onClick={() => persistCargas(cargaActivaFecha, (cargasFrescas) => ({ ...cargasFrescas, enviosPorRuta: { ...(cargasFrescas.enviosPorRuta || {}), [nombreRuta]: false } }))}
                              title="Reactivar edición para esta ruta"
                              style={{ display: "flex", alignItems: "center", padding: "5px 8px", border: "none", borderLeft: "1px solid #3DDC97", background: "transparent", color: "#3DDC97", cursor: "pointer" }}
                            >
                              <RefreshCw size={12} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {rutaVistaStaff && (() => {
                    const enviadoEstaRuta = !!cargaActiva.enviosPorRuta?.[rutaVistaStaff];
                    return (
                      <div>
                        <div style={{ fontSize: 11, color: "#9AA7BD", marginBottom: 8 }}>
                          Carga de {rutaVistaStaff}{NOMBRES[rutaVistaStaff] ? ` · ${NOMBRES[rutaVistaStaff]}` : ""}{cargaActiva.bloqueado ? " (bloqueada, reactiva la edición para modificar)" : ""}
                        </div>
                        <TablaCargaVendedor items={cargaActiva.items} nombreRuta={rutaVistaStaff} bloqueado={cargaActiva.bloqueado} valoresLocales={borrador} onCambiarLocal={cambiarLocal} />
                        {!cargaActiva.bloqueado && (
                          <button
                            className="btn"
                            style={{
                              marginTop: 12, width: "100%",
                              background: enviadoEstaRuta ? "#3DDC97" : undefined, borderColor: enviadoEstaRuta ? "#3DDC97" : undefined,
                              color: enviadoEstaRuta ? "#0B1220" : undefined,
                            }}
                            onClick={() => enviarPara(rutaVistaStaff)}
                          >
                            <CheckCircle2 size={14} style={{ verticalAlign: "-2px" }} /> {enviadoEstaRuta ? "Carga enviada correctamente ✓" : "Enviar / confirmar esta carga"}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!cargaActiva ? (
        <div className="card" style={{ padding: 30, textAlign: "center", color: "#9AA7BD" }}>
          {rol === "vendedor"
            ? "Todavía no hay una carga activa para hoy."
            : "No hay ninguna carga activa por el momento."}
        </div>
      ) : rol === "vendedor" ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#9AA7BD", marginBottom: 10 }}>
            <Clock size={12} /> Carga del {cargaActiva.fecha}
          </div>
          {cargaActiva.bloqueado && (
            <div className="card" style={{ padding: 12, marginBottom: 14, border: "1px solid #FF6B6B" }}>
              <div style={{ fontSize: 12, color: "#FF6B6B" }}>Esta carga ya se descargó — ya no se puede modificar.</div>
            </div>
          )}
          {!cargaActiva.bloqueado && (
            <div className="card" style={{ padding: 12, marginBottom: 14, border: `1px solid ${yaEnviado ? "#3DDC97" : "#F2B134"}` }}>
              <div style={{ fontSize: 12, color: yaEnviado ? "#3DDC97" : "#F2B134" }}>
                {yaEnviado ? "Ya enviaste tus cambios correctamente — no puedes seguir editando hasta que gerente/supervisor lo reactive." : "Aún no has enviado tus cambios."}
              </div>
            </div>
          )}
          <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 10 }}>
            Escribe la cantidad que consideres — no se guarda hasta que le des "Enviar cambios". Si no cambias una cantidad, se usará la inicial tal cual viene en la carga propuesta.
          </div>
          <TablaCargaVendedor items={cargaActiva.items} nombreRuta={vendedorActual} bloqueado={cargaActiva.bloqueado || yaEnviado} valoresLocales={borrador} onCambiarLocal={cambiarLocal} />
          {!cargaActiva.bloqueado && !yaEnviado && (
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={() => enviarPara(vendedorActual)}>
              <CheckCircle2 size={14} style={{ verticalAlign: "-2px" }} /> Enviar cambios
            </button>
          )}
        </>
      ) : (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 13, color: "#9AA7BD" }}>
            {cargaActiva.items.length} artículos cargados para {Object.keys(cargaActiva.items[0]?.porRuta || {}).length} rutas, activos desde el {cargaActiva.fecha}.
            Cada vendedor ya puede entrar a su propia pestaña "CARGAS" para revisar y, si quiere, ajustar su cantidad propuesta.
          </div>
        </div>
      )}
    </div>
  );
}

function TablaCargaVendedor({ items, nombreRuta, bloqueado, valoresLocales, onCambiarLocal }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it, i) => {
        const porRuta = it.porRuta[nombreRuta] || { inicial: 0, modificada: null };
        const valorGuardado = porRuta.modificada != null ? porRuta.modificada : porRuta.inicial;
        const valorMostrado = valoresLocales[i] !== undefined ? valoresLocales[i] : valorGuardado;
        return (
          <div key={i} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px", minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "#E8EDF5", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.marca}</div>
              <div style={{ fontSize: 11, color: "#9AA7BD" }}>{it.fa}</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 56 }}>
              <div style={{ fontSize: 10, color: "#9AA7BD" }}>Inicial</div>
              <div className="mono" style={{ fontSize: 15, color: "#E8EDF5" }}>{porRuta.inicial}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#9AA7BD" }}>Tu propuesta</div>
              <input
                type="number"
                value={valorMostrado}
                onChange={(e) => onCambiarLocal(i, e.target.value)}
                onFocus={(e) => e.target.select()}
                disabled={bloqueado}
                style={{ width: 80, padding: "6px 8px", textAlign: "center", fontSize: 14, boxSizing: "border-box" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Checklist de actividades (día/semana/mes). "Fija" reaparece siempre al
// reiniciar el ciclo; "temporal" solo existe por este ciclo y se borra sola
// al pasar el siguiente, a menos que se haya quedado pendiente.
