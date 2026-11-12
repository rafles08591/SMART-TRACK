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
  const [verPivote, setVerPivote] = useState(false);
  const [reactivando, setReactivando] = useState(null);
  // gerente y supervisores pueden regresarle a una ruta su carga para que la corrija y la vuelva a enviar
  const puedeReactivarRuta = rol === "staff" && (puesto === "gerente" || puesto === "supervisor");
  async function reactivarRuta(nombreRuta) {
    if (!cargaActivoDia) return;
    if (!window.confirm(`¿Reactivar ${nombreRuta}? La ruta podrá modificar su carga y tendrá que volver a enviarla.`)) return;
    setReactivando(nombreRuta);
    try {
      await persistCargas(cargaActivoDia, { ruta: nombreRuta, enviado: false });
    } finally {
      setReactivando(null);
    }
  }

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
      } catch (err) {}
      return siguiente;
    });
  }

  function cambiarLocal(itemIndex, valor) {
    setBorrador((b) => ({ ...b, [itemIndex]: valor }));
  }

  const [enviando, setEnviando] = useState(false);

  async function manejarEnviarConConfirmacion(nombreRuta) {
    setEnviando(true);
    try {
      await enviarPara(nombreRuta);
    } catch (err) {
      console.error(err);
    } finally {
      setEnviando(false);
    }
  }

  async function enviarPara(nombreRuta) {
    if (!cargaActivoDia) return;
    // Solo se mandan las cantidades de ESTA ruta (fila + artículo) y su "enviado": nunca una copia de
    // toda la carga, para que un envío viejo o sin señal no pueda tocar lo de otras rutas.
    const valores = {};
    (cargaActiva?.items || []).forEach((it, i) => {
      if (borrador[i] === undefined) return;
      const v = borrador[i];
      valores[i] = { fa: it.fa, valor: v === "" ? null : Number(v) };
    });
    await persistCargas(cargaActivoDia, { ruta: nombreRuta, valores, enviado: true });
    setBorrador({});
  }

  function subirArchivo(e) {
    onUpload(e, diaParaSubir);
  }

  async function descargarExcel(bloquear = false) {
    if (!cargaActiva?.items?.length) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const rutas = RUTAS;
    
    const filas1 = [["FA", "Marca", ...rutas, "Total"]];
    for (const it of cargaActiva.items) {
      const row = [it.fa, it.marca];
      let total = 0;
      for (const ruta of rutas) {
        const qty = it.porRuta?.[ruta]?.modificada ?? it.porRuta?.[ruta]?.inicial ?? 0;
        row.push(qty || "");
        total += Number(qty) || 0;
      }
      row.push(total || "");
      filas1.push(row);
    }
    const ws1 = XLSX.utils.aoa_to_sheet(filas1);
    ws1["!cols"] = [{ wch: 12 }, { wch: 25 }, ...rutas.map(() => ({ wch: 10 })), { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Pivote");
    
    const filas2 = [["Codigo_Vendedor", "Codigo_Articulo", "Cantidad"]];
    for (const it of cargaActiva.items) {
      for (const ruta of rutas) {
        const qty = it.porRuta?.[ruta]?.modificada ?? it.porRuta?.[ruta]?.inicial ?? 0;
        if (qty > 0) filas2.push([ruta.replace(/^RUTA\s*/i, ""), it.fa, qty]);
      }
    }
    const ws2 = XLSX.utils.aoa_to_sheet(filas2);
    ws2["!cols"] = [{ wch: 18 }, { wch: 18 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Lista");
    
    XLSX.writeFile(wb, `Cargas_${cargaActiva.dia}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    
    if (bloquear && esGerente && !cargaActiva.bloqueado) {
      persistCargas(cargaActivoDia, { campos: { bloqueado: true, bloqueadoPor: vendedorActual || puesto || "Gerente", bloqueadoEn: new Date().toISOString() } });
    }
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
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {DIAS_ORDEN.map((dia) => (
                  <button key={dia} onClick={() => setDiaParaSubir(dia)} className={diaParaSubir === dia ? "btn" : "btn-ghost"} style={{ fontSize: 12.5, padding: "6px 12px" }}>
                    {DIA_LABEL[dia]}
                  </button>
                ))}
              </div>
              <button className="btn" onClick={() => cargasFileInputRef.current?.click()}>
                <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir archivo
              </button>
              <input ref={cargasFileInputRef} type="file" accept=".xlsx,.xls,.xlsm" style={{ display: "none" }} onChange={subirArchivo} />
              {cargasStatus && <div style={{ fontSize: 12, color: "#9AA7BD", marginTop: 6 }}>{cargasStatus}</div>}
            </div>
          )}

          <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>CARGAS GUARDADAS</div>
          {diasGuardados.length === 0 ? (
            <div style={{ fontSize: 12, color: "#9AA7BD" }}>No hay cargas guardadas.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {diasGuardados.map((dia) => {
                const c = cargasPorDia[dia];
                const activa = dia === cargaActivoDia;
                return (
                  <div key={dia} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, border: activa ? "1px solid #3DDC97" : undefined }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#E8EDF5" }}>
                        {DIA_LABEL[dia]} {activa && <span style={{ color: "#3DDC97" }}>· ACTIVA</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#9AA7BD" }}>
                        {c.items.length} artículos {c.bloqueado && <span style={{ color: "#FF6B6B" }}>· bloqueada</span>}
                      </div>
                    </div>
                    {esGerente && (
                      <div style={{ display: "flex", gap: 8 }}>
                        {!activa && <button className="btn-ghost" onClick={() => onActivarCarga(dia)}><Zap size={13} /> Activar</button>}
                        <button className="btn-ghost" onClick={() => window.confirm(`¿Eliminar?`) && onEliminarCarga(dia)} style={{ color: "#FF6B6B" }}><Trash2 size={13} /></button>
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
                  {cargaActiva.bloqueado && (cargaActiva.bloqueadoPor || cargaActiva.bloqueadoEn) && (
                    <span style={{ fontSize: 11, color: "#9AA7BD", fontFamily: "inherit" }}> (por {cargaActiva.bloqueadoPor || "?"}{cargaActiva.bloqueadoEn ? ` · ${formatFechaHora(cargaActiva.bloqueadoEn)}` : ""})</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn-ghost" onClick={() => setVerPivote(!verPivote)}>{verPivote ? "Ocultar" : "Ver"} pivote</button>
                  <button className="btn-ghost" onClick={() => descargarExcel(false)}><Download size={14} /> Descargar</button>
                  {esGerente && !cargaActiva.bloqueado && (
                    <button className="btn" onClick={() => descargarExcel(true)} style={{ background: "#FF6B6B" }}><Download size={14} /> Descargar y cerrar</button>
                  )}
                </div>
              </div>

              {verPivote && <TablaPivote items={cargaActiva.items} />}

              {cargaActiva.bloqueado && esGerente && (
                <button className="btn-ghost" onClick={() => persistCargas(cargaActivoDia, { campos: { bloqueado: false, bloqueadoPor: null, bloqueadoEn: null } })} style={{ marginTop: 8 }}>
                  <RefreshCw size={13} /> Reactivar edición
                </button>
              )}

              <div style={{ marginTop: 16 }}>
                <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 4 }}>ESTATUS POR RUTA</div>
                {puedeReactivarRuta && <div style={{ fontSize: 11.5, color: "#5b6478", marginBottom: 8 }}>Toca una ruta en verde para reactivarla y que pueda corregir su carga.</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {RUTAS.map((nombreRuta) => {
                    const enviado = !!cargaActiva.enviosPorRuta?.[nombreRuta];
                    return (
                      <button
                        key={nombreRuta}
                        onClick={() => setRutaVistaStaff((r) => (r === nombreRuta ? null : nombreRuta))}
                        style={{
                          display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 10px", borderRadius: 8,
                          border: `1px solid ${enviado ? "#3DDC97" : "#1E2A42"}`,
                          background: rutaVistaStaff === nombreRuta ? "#1E2A42" : "transparent",
                          color: enviado ? "#3DDC97" : "#9AA7BD", cursor: "pointer",
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: enviado ? "#3DDC97" : "#5b6478" }} />
                        {nombreRuta}
                      </button>
                    );
                  })}
                </div>
                {rutaVistaStaff && (
                  <div style={{ marginTop: 12 }}>
                    {puedeReactivarRuta && cargaActiva.enviosPorRuta?.[rutaVistaStaff] && (
                      <div className="card" style={{ padding: 12, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", border: "1px solid #3DDC9755" }}>
                        <div style={{ fontSize: 12.5, color: "#9AA7BD" }}>
                          <b style={{ color: "#3DDC97" }}>{rutaVistaStaff}</b> ya envió su carga.
                          {cargaActiva.bloqueado && <span style={{ color: "#FF6B6B" }}> La carga está bloqueada: reactiva también la edición para que pueda cambiarla.</span>}
                        </div>
                        <button className="btn-ghost" onClick={() => reactivarRuta(rutaVistaStaff)} disabled={reactivando === rutaVistaStaff}>
                          <RefreshCw size={13} style={{ verticalAlign: "-2px" }} /> {reactivando === rutaVistaStaff ? "Reactivando…" : "Reactivar ruta"}
                        </button>
                      </div>
                    )}
                    <TablaCargaVendedor items={cargaActiva.items} nombreRuta={rutaVistaStaff} bloqueado={cargaActiva.bloqueado || !esGerente} valoresLocales={borrador} onCambiarLocal={cambiarLocal} />
                    {esGerente && !cargaActiva.bloqueado && (
                      <button className="btn" style={{ marginTop: 12, width: "100%" }} onClick={() => manejarEnviarConConfirmacion(rutaVistaStaff)} disabled={enviando}>
                        <CheckCircle2 size={14} /> Guardar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!cargaActiva ? (
        <div className="card" style={{ padding: 30, textAlign: "center", color: "#9AA7BD" }}>No hay carga activa.</div>
      ) : rol === "vendedor" ? (
        <>
          {cargaActiva.bloqueado && <div className="card" style={{ padding: 12, marginBottom: 14, border: "1px solid #FF6B6B", color: "#FF6B6B" }}>Carga bloqueada.</div>}
          <TablaCargaVendedor items={cargaActiva.items} nombreRuta={vendedorActual} bloqueado={cargaActiva.bloqueado || yaEnviado} valoresLocales={borrador} onCambiarLocal={cambiarLocal} />
          {!cargaActiva.bloqueado && !yaEnviado && (
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={() => manejarEnviarConConfirmacion(vendedorActual)} disabled={enviando}>
              <CheckCircle2 size={14} /> Enviar
            </button>
          )}
        </>
      ) : (
        <div className="card" style={{ padding: 16, color: "#9AA7BD" }}>{cargaActiva.items.length} artículos cargados.</div>
      )}
    </div>
  );
}

function TablaPivote({ items }) {
  return (
    <div style={{ overflowX: "auto", marginTop: 12, marginBottom: 16 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#1E2A42" }}>
            <th style={{ padding: 8, textAlign: "left", color: "#9AA7BD" }}>FA</th>
            <th style={{ padding: 8, textAlign: "left", color: "#9AA7BD" }}>Marca</th>
            {RUTAS.map((r) => <th key={r} style={{ padding: 8, textAlign: "center", color: "#9AA7BD" }}>{r}</th>)}
            <th style={{ padding: 8, textAlign: "center", color: "#E8EDF5" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            let total = 0;
            const celdas = RUTAS.map((ruta) => {
              const qty = it.porRuta?.[ruta]?.modificada ?? it.porRuta?.[ruta]?.inicial ?? 0;
              total += Number(qty) || 0;
              return qty || "";
            });
            return (
              <tr key={i} style={{ borderTop: "1px solid #1E2A42" }}>
                <td style={{ padding: 8, color: "#E8EDF5" }}>{it.fa}</td>
                <td style={{ padding: 8, color: "#9AA7BD" }}>{it.marca}</td>
                {celdas.map((c, j) => <td key={j} style={{ padding: 8, textAlign: "center", color: c ? "#E8EDF5" : "#5b6478" }}>{c}</td>)}
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
          <div key={i} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "#E8EDF5", fontWeight: 700 }}>{it.marca}</div>
              <div style={{ fontSize: 11, color: "#9AA7BD" }}>{it.fa}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#9AA7BD" }}>Inicial</div>
              <div style={{ fontSize: 15, color: "#E8EDF5" }}>{porRuta.inicial}</div>
            </div>
            <input type="number" value={valorMostrado} onChange={(e) => onCambiarLocal(i, e.target.value)} disabled={bloqueado} style={{ width: 80, padding: 6, textAlign: "center" }} />
          </div>
        );
      })}
    </div>
  );
}
