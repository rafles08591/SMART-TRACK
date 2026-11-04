// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Upload, Download, CheckCircle2, RefreshCw, Zap, Clock, Trash2, AlertTriangle } from "lucide-react";
import { RUTAS, NOMBRES, DIAS_SEMANA_VISITAS } from "../constants";
import { fechaHoyISO } from "../utils";

function sumarDiasISO(fechaISO, dias) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

const DIAS_SEMANA_KEYS_TODOS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function diaSemanaKeyDe(fechaISO) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return DIAS_SEMANA_KEYS_TODOS[fecha.getUTCDay()];
}

function siguienteDiaHabil() {
  let fecha = sumarDiasISO(fechaHoyISO(), 1);
  let dia = diaSemanaKeyDe(fecha);
  if (dia === "domingo") {
    fecha = sumarDiasISO(fecha, 1);
    dia = diaSemanaKeyDe(fecha);
  }
  return { dia, fecha };
}

function fechaCorta(fechaISO) {
  if (!fechaISO) return "";
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return fecha.toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "UTC" });
}

const DIA_LABEL = { lunes: "Lunes", martes: "Martes", miercoles: "Miércoles", jueves: "Jueves", viernes: "Viernes", sabado: "Sábado" };
function formatFechaHora(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
const DIAS_ORDEN = DIAS_SEMANA_VISITAS;

export default function CargasView({ data, persist, persistCargas, puesto, rol, vendedorActual, onUpload, cargasFileInputRef, cargasStatus, onDescargar, bloqueoPendiente, onReintentarBloqueo, onActivarCarga, onEliminarCarga }) {
  const cargasPorDia = data.cargasPorDia || {};
  const cargaActivoDia = data.cargaActivoDia || null;
  const cargaActiva = cargaActivoDia ? (cargasPorDia[cargaActivoDia] || null) : null;

  const esStaffConPermiso = rol === "staff" && (puesto === "gerente" || puesto === "supervisor" || puesto === "almacen");
  const esGerente = rol === "staff" && puesto === "gerente";
  const yaEnviado = !!cargaActiva?.enviosPorRuta?.[vendedorActual];
  const [rutaVistaStaff, setRutaVistaStaff] = useState(null);
  const [diaParaSubir, setDiaParaSubir] = useState(() => siguienteDiaHabil().dia);
  const [verHistorial, setVerHistorial] = useState(false);
  const [verPivote, setVerPivote] = useState(false);

  const rutaActiva = rol === "vendedor" ? vendedorActual : rutaVistaStaff;
  function claveBorradorCargas(ruta, dia) {
    return `smarttrack_cargas_borrador_${ruta || "x"}_${dia || "x"}`;
  }
  function leerBorradorGuardado(ruta, dia) {
    try {
      const raw = window.localStorage.getItem(claveBorradorCargas(ruta, dia));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  const [borrador, setBorradorEstado] = useState(() => leerBorradorGuardado(rutaActiva, cargaActivoDia));
  useEffect(() => {
    setBorradorEstado(leerBorradorGuardado(rutaActiva, cargaActivoDia));
  }, [rutaActiva, cargaActivoDia]);

  function setBorrador(actualizador) {
    setBorradorEstado((prev) => {
      const siguiente = typeof actualizador === "function" ? actualizador(prev) : actualizador;
      try {
        window.localStorage.setItem(claveBorradorCargas(rutaActiva, cargaActivoDia), JSON.stringify(siguiente));
      } catch (err) {
        console.error("No se pudo respaldar el borrador:", err);
      }
      return siguiente;
    });
  }

  function cambiarLocal(itemIndex, valor) {
    setBorrador((b) => ({ ...b, [itemIndex]: valor }));
  }

  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(false);

  async function manejarEnviarConConfirmacion(nombreRuta) {
    setEnviando(true);
    setErrorEnvio(false);
    try {
      await enviarPara(nombreRuta);
    } catch (err) {
      console.error("No se pudo confirmar el envío:", err);
      setErrorEnvio(true);
    } finally {
      setEnviando(false);
    }
  }

  async function enviarPara(nombreRuta) {
    if (!cargaActivoDia) return;
    await persistCargas(cargaActivoDia, (cargasFrescas) => {
      const items = cargasFrescas.items.map((it, i) => {
        if (borrador[i] === undefined) return it;
        const valor = borrador[i];
        return { ...it, porRuta: { ...it.porRuta, [nombreRuta]: { ...it.porRuta[nombreRuta], modificada: valor === "" ? null : Number(valor) } } };
      });
      const cambiosDeEsteEnvio = Object.entries(borrador)
        .filter(([, v]) => v !== undefined)
        .map(([i, v]) => ({
          fa: cargasFrescas.items[i]?.fa || null,
          marca: cargasFrescas.items[i]?.marca || null,
          valor: v === "" ? null : Number(v),
        }));
      const historialEnvios = [
        ...(cargasFrescas.historialEnvios || []),
        { fecha: new Date().toISOString(), ruta: nombreRuta, cambios: cambiosDeEsteEnvio },
      ].slice(-300);
      return { ...cargasFrescas, items, historialEnvios, enviosPorRuta: { ...(cargasFrescas.enviosPorRuta || {}), [nombreRuta]: true } };
    });
    setBorrador({});
  }

  function subirArchivo(e) {
    onUpload(e, diaParaSubir);
  }

  async function descargarLista() {
    if (!cargaActiva?.items?.length) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    
    const rutas = RUTAS;
    const filas = [["Ruta", "FA", "Cantidad"]];
    for (const it of cargaActiva.items) {
      for (const ruta of rutas) {
        const qty = it.porRuta?.[ruta]?.modificada ?? it.porRuta?.[ruta]?.inicial ?? 0;
        if (qty > 0) filas.push([ruta, it.fa, qty]);
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(filas);
    XLSX.utils.book_append_sheet(wb, ws, "Lista");
    
    XLSX.writeFile(wb, `Cargas_${cargaActiva.dia}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const diasGuardados = DIAS_ORDEN.filter((dia) => cargasPorDia[dia]);
  const { dia: diaSugerido, fecha: fechaSugerida } = siguienteDiaHabil();

  return (
    <div>
      <div className="display" style={{ fontSize: 16, color: "#E8EDF5", marginBottom: 14 }}>CARGAS</div>

      {esStaffConPermiso && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          {esGerente && (
            <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #1E2A42" }}>
              <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>SUBIR CARGA NUEVA</div>
              <div style={{ fontSize: 10, color: "#9AA7BD", marginBottom: 6 }}>¿Para qué día de la semana es esta carga?</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {DIAS_ORDEN.map((dia) => (
                  <button
                    key={dia}
                    onClick={() => setDiaParaSubir(dia)}
                    className={diaParaSubir === dia ? "btn" : "btn-ghost"}
                    style={{ fontSize: 12.5, padding: "6px 12px" }}
                  >
                    {DIA_LABEL[dia]}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn" onClick={() => cargasFileInputRef.current?.click()}>
                  <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir archivo de cargas
                </button>
                <input ref={cargasFileInputRef} type="file" accept=".xlsx,.xls,.xlsm" style={{ display: "none" }} onChange={subirArchivo} />
              </div>
              <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 6 }}>
                Por default es para el día hábil siguiente ({DIA_LABEL[diaSugerido]}, aprox. {fechaCorta(fechaSugerida)}).
              </div>
              {cargasStatus && <div style={{ fontSize: 12, color: "#9AA7BD", marginTop: 6 }}>{cargasStatus}</div>}
            </div>
          )}

          <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>CARGAS GUARDADAS</div>
          {diasGuardados.length === 0 ? (
            <div style={{ fontSize: 12, color: "#9AA7BD" }}>Todavía no hay ninguna carga guardada.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: cargaActiva ? 16 : 0 }}>
              {diasGuardados.map((dia) => {
                const c = cargasPorDia[dia];
                const activa = dia === cargaActivoDia;
                return (
                  <div key={dia} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, border: activa ? "1px solid #3DDC97" : undefined }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#E8EDF5" }}>
                        {DIA_LABEL[dia]} {activa && <span style={{ color: "#3DDC97", fontWeight: 800 }}>· ACTIVA</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#9AA7BD" }}>
                        {c.items.length} artículos · subida el {c.fechaSubida} {c.bloqueado && <span style={{ color: "#FF6B6B" }}>· bloqueada</span>}
                      </div>
                    </div>
                    {esGerente && (
                      <div style={{ display: "flex", gap: 8 }}>
                        {!activa && (
                          <button className="btn-ghost" onClick={() => onActivarCarga(dia)}>
                            <Zap size={13} style={{ verticalAlign: "-2px" }} /> Activar
                          </button>
                        )}
                        <button
                          className="btn-ghost"
                          onClick={() => {
                            if (window.confirm(`¿Eliminar la carga de ${DIA_LABEL[dia]}?`)) onEliminarCarga(dia);
                          }}
                          style={{ color: "#FF6B6B", borderColor: "#FF6B6B33" }}
                        >
                          <Trash2 size={13} style={{ verticalAlign: "-2px" }} />
                        </button>
                      </div>
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
                  Carga activa · {DIA_LABEL[cargaActiva.dia]} {cargaActiva.bloqueado && <span style={{ color: "#FF6B6B" }}>· BLOQUEADA</span>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {cargaActiva.items.length > 0 && (
                    <>
                      <button className="btn-ghost" onClick={() => setVerPivote(!verPivote)}>
                        {verPivote ? "Ocultar" : "Ver"} pivote
                      </button>
                      <button className="btn-ghost" onClick={descargarLista}>
                        <Download size={14} style={{ verticalAlign: "-2px" }} /> Descargar lista
                      </button>
                    </>
                  )}
                </div>
              </div>

              {verPivote && cargaActiva.items.length > 0 && (
                <TablaPivote items={cargaActiva.items} />
              )}

              {bloqueoPendiente && (
                <div className="card" style={{ padding: 12, marginBottom: 10, border: "1px solid #F2B134", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#F2B134" }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>El archivo se descargó, pero el bloqueo no se confirmó.</span>
                  </div>
                  <button className="btn" onClick={onReintentarBloqueo}>
                    <RefreshCw size={13} style={{ verticalAlign: "-2px" }} /> Reintentar
                  </button>
                </div>
              )}

              {cargaActiva.bloqueado && esGerente && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 6, marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#FF6B6B" }}>Ya se descargó el archivo final.</div>
                  <button className="btn-ghost" onClick={() => persistCargas(cargaActivoDia, (c) => ({ ...c, bloqueado: false }))}>
                    <RefreshCw size={13} style={{ verticalAlign: "-2px" }} /> Reactivar edición
                  </button>
                </div>
              )}

              {cargaActiva.items.length > 0 && (
                <div>
                  <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>ESTATUS POR RUTA</div>
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
                          {enviado && esGerente && (
                            <button
                              onClick={() => persistCargas(cargaActivoDia, (c) => ({ ...c, enviosPorRuta: { ...(c.enviosPorRuta || {}), [nombreRuta]: false } }))}
                              style={{ display: "flex", alignItems: "center", padding: "5px 8px", border: "none", borderLeft: "1px solid #3DDC97", background: "transparent", color: "#3DDC97", cursor: "pointer" }}
                            >
                              <RefreshCw size={12} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {rutaVistaStaff && (
                    <div>
                      <div style={{ fontSize: 11, color: "#9AA7BD", marginBottom: 8 }}>
                        Carga de {rutaVistaStaff}{NOMBRES[rutaVistaStaff] ? ` · ${NOMBRES[rutaVistaStaff]}` : ""}
                      </div>
                      <TablaCargaVendedor items={cargaActiva.items} nombreRuta={rutaVistaStaff} bloqueado={cargaActiva.bloqueado || !esGerente} valoresLocales={borrador} onCambiarLocal={cambiarLocal} />
                      {esGerente && !cargaActiva.bloqueado && (
                        <button
                          className="btn"
                          style={{ marginTop: 12, width: "100%" }}
                          onClick={() => manejarEnviarConConfirmacion(rutaVistaStaff)}
                          disabled={enviando}
                        >
                          <CheckCircle2 size={14} style={{ verticalAlign: "-2px" }} /> Guardar cambios
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!cargaActiva ? (
        <div className="card" style={{ padding: 30, textAlign: "center", color: "#9AA7BD" }}>
          {rol === "vendedor" ? "Todavía no hay una carga activa." : "No hay ninguna carga activa."}
        </div>
      ) : rol === "vendedor" ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#9AA7BD", marginBottom: 10 }}>
            <Clock size={12} /> Carga del {DIA_LABEL[cargaActiva.dia]}
          </div>
          {cargaActiva.bloqueado && (
            <div className="card" style={{ padding: 12, marginBottom: 14, border: "1px solid #FF6B6B" }}>
              <div style={{ fontSize: 12, color: "#FF6B6B" }}>Esta carga ya se descargó — ya no se puede modificar.</div>
            </div>
          )}
          {!cargaActiva.bloqueado && (
            <div className="card" style={{ padding: 12, marginBottom: 14, border: `1px solid ${yaEnviado ? "#3DDC97" : "#F2B134"}` }}>
              <div style={{ fontSize: 12, color: yaEnviado ? "#3DDC97" : "#F2B134" }}>
                {yaEnviado ? "Ya enviaste tus cambios." : "Aún no has enviado tus cambios."}
              </div>
            </div>
          )}
          <TablaCargaVendedor
            items={cargaActiva.items}
            nombreRuta={vendedorActual}
            bloqueado={cargaActiva.bloqueado || yaEnviado}
            valoresLocales={borrador}
            onCambiarLocal={cambiarLocal}
          />
          {!cargaActiva.bloqueado && !yaEnviado && (
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={() => manejarEnviarConConfirmacion(vendedorActual)} disabled={enviando}>
              <CheckCircle2 size={14} style={{ verticalAlign: "-2px" }} /> Enviar cambios
            </button>
          )}
        </>
      ) : (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 13, color: "#9AA7BD" }}>
            {cargaActiva.items.length} artículos cargados para {Object.keys(cargaActiva.items[0]?.porRuta || {}).length} rutas.
          </div>
        </div>
      )}
    </div>
  );
}

function TablaPivote({ items }) {
  const rutas = RUTAS;
  return (
    <div style={{ overflowX: "auto", marginTop: 12, marginBottom: 16 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#1E2A42" }}>
            <th style={{ padding: 8, textAlign: "left", color: "#9AA7BD" }}>FA</th>
            <th style={{ padding: 8, textAlign: "left", color: "#9AA7BD" }}>Marca</th>
            {rutas.map((r) => (
              <th key={r} style={{ padding: 8, textAlign: "center", color: "#9AA7BD" }}>{r}</th>
            ))}
            <th style={{ padding: 8, textAlign: "center", color: "#E8EDF5" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            let total = 0;
            const celdas = rutas.map((ruta) => {
              const qty = it.porRuta?.[ruta]?.modificada ?? it.porRuta?.[ruta]?.inicial ?? 0;
              total += Number(qty) || 0;
              return qty || "";
            });
            return (
              <tr key={i} style={{ borderTop: "1px solid #1E2A42" }}>
                <td style={{ padding: 8, color: "#E8EDF5" }}>{it.fa}</td>
                <td style={{ padding: 8, color: "#9AA7BD" }}>{it.marca}</td>
                {celdas.map((c, j) => (
                  <td key={j} style={{ padding: 8, textAlign: "center", color: c ? "#E8EDF5" : "#5b6478" }}>{c}</td>
                ))}
                <td style={{ padding: 8, textAlign: "center", color: "#3DDC97", fontWeight: 700 }}>{total || ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
              <div style={{ fontSize: 13, color: "#E8EDF5", fontWeight: 700 }}>{it.marca}</div>
              <div style={{ fontSize: 11, color: "#9AA7BD" }}>{it.fa}</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 56 }}>
              <div style={{ fontSize: 10, color: "#9AA7BD" }}>Inicial</div>
              <div className="mono" style={{ fontSize: 15, color: "#E8EDF5" }}>{porRuta.inicial}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#9AA7BD" }}>Propuesta</div>
              <input
                type="number"
                value={valorMostrado}
                onChange={(e) => onCambiarLocal(i, e.target.value)}
                onFocus={(e) => e.target.select()}
                disabled={bloqueado}
                style={{ width: 80, padding: "6px 8px", textAlign: "center", fontSize: 14 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
