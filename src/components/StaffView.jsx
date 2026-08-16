// @ts-nocheck
import React, { useState, useEffect } from "react";
import {
  Target, Users, Upload, LogOut, Star, MapPin, Download, Plus, Trash2,
  Calendar, AlertCircle, CheckCircle2, MessageSquare, RefreshCw,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import * as XLSX from "xlsx";
import {
  OBJETIVO_TABS, NOMBRES, MARCAS_OPEN, MARCAS_CHAMPIONS, MARCAS_DIA, RUTAS,
} from "../constants";
import {
  fmt, money, unidades, metaColor, analizarMesaControl, calcularResumenPedidos,
  calcularVisitasVsObjetivo, todayISO, fechaHoyISO, blankObjetivos,
  normalizarActividades, nuevaActividad, creditosPendientes,
} from "../utils";
import { RoadProgress, KpiCard, MarcasBreakdown, ObjetivoTabs, PegarTextoBox, BotonGuardarImagen, ModalTablaCompleta } from "./ui";
import { useCapturaImagen } from "./hooks";
import { supabase } from "../supabaseClient";
import TopBar from "./TopBar";
import DiaKpis from "./DiaKpis";
import TablaPorRutaHoy from "./TablaPorRutaHoy";
import RepartidorAhogadoView from "./RepartidorAhogadoView";
import MesaControlView from "./MesaControlView";
import CuponeraView from "./CuponeraView";
import TiemposView from "./TiemposView";
import UnidadesView, { unidadYaRegistradaHoy, CLO_PVR, CLO_TEPIC } from "./UnidadesView";
import CreditosView from "./CreditosView";
import RutasView from "./RutasView";
import ActividadesView from "./ActividadesView";
import RallyOtcView from "./RallyOtcView";
import AvisosView, { hayAvisoNuevoPara } from "./AvisosView";
import CargasView from "./CargasView";
import FacturasView from "./FacturasView";
import NominaView from "./NominaView";
import SinVisitaView from "./SinVisitaView";
import ActividadView from "./ActividadView";
import RelojChecadorView from "./RelojChecadorView";
import PanelFondoPersonalizado, { useFondoPersonalizado, FondoDeFondo } from "./FondoPersonalizado";

export default function StaffView({ data, persist, persistFresco, persistCargas, persistRevisionUnidad, persistConfigUnidades, stats, puesto, staffUsername, onFile, fileInputRef, onDownloadTemplate, status, onObjetivosFile, objFileInputRef, onDownloadObjetivosTemplate, objStatus, onObjetivoVisitasFile, objetivoVisitasFileInputRef, onDownloadObjetivoVisitasTemplate, objetivoVisitasStatus, onObjetivoVisitasTexto, onAvanceDiaFile, avanceDiaFileInputRef, avanceDiaStatus, onAvanceDiaTexto, onOtcDiaFile, otcDiaFileInputRef, otcDiaStatus, onOtcDiaTexto, onPedidosDiaFile, pedidosDiaFileInputRef, pedidosDiaStatus, onPedidosDiaTexto, onVentasPeriodoFile, ventasPeriodoFileInputRef, ventasPeriodoStatus, onVentasPeriodoTexto, onBorrarTodoVentasPeriodo, onMesaControlFile, mesaControlFileInputRef, mesaControlStatus, onMesaControlTexto, onOtcSemanalTexto, onCargasFile, cargasFileInputRef, cargasStatus, onDescargarCargas, onActivarCarga, onRegistrarEvento, onRefresh, refrescando, onLogout }) {
  const esSupervisor2 = puesto === "supervisor2";
  const esSupervisor1 = puesto === "supervisor";
  const [fondoUrl, setFondoUrl] = useFondoPersonalizado(staffUsername);
  const [tab, setTab] = useState("resumen");
  const [objTab, setObjTab] = useState("dia");
  const objUnit = OBJETIVO_TABS.find((t) => t.key === objTab).unit;
  const [newName, setNewName] = useState("");

  // Registro de uso: cada vez que cambia la pestaña de indicador (DÍA,
  // UNIDADES, NOMINA, etc.), se anota quién la vio y cuándo — no bloquea
  // nada si falla, es solo estadística para el reporte de ACTIVIDAD.
  useEffect(() => {
    if (!onRegistrarEvento) return;
    onRegistrarEvento({ usuario: staffUsername, rol: "staff", puesto, tipoEvento: "tab_view", pestana: objTab });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objTab]);

  // Observaciones de facturación sin responder (cualquier ruta) — para que
  // Supervisor-1/Gerente vean si algo necesita atención.
  const [hayObservacionFacturasPendiente, setHayObservacionFacturasPendiente] = useState(false);
  useEffect(() => {
    let activo = true;
    async function revisar() {
      try {
        const { count } = await supabase
          .from("facturas_observaciones")
          .select("id", { count: "exact", head: true })
          .eq("resuelta", false)
          .is("respondido_en", null);
        if (activo) setHayObservacionFacturasPendiente((count || 0) > 0);
      } catch (e) {
        console.error("Error revisando observaciones de facturas:", e);
      }
    }
    revisar();
    const intervalo = setInterval(revisar, 20000);
    return () => { activo = false; clearInterval(intervalo); };
  }, []);

  // Estado de cada checklist de actividades, para pintar la pestaña
  // parpadeando en rojo (hay pendientes) o en verde (todo completo).
  const rutaPropiaStaff = puesto === "supervisor" ? "SUPERVISOR-1" : puesto === "supervisor2" ? "SUPERVISOR-2" : puesto === "gerente" ? "GERENTE" : null;
  const estadoTabsActividades = {
    actividades_dia: (data.actividades?.dia?.items || []).length === 0 ? undefined : (data.actividades.dia.items.every((it) => it.hecha) ? "completo" : "pendiente"),
    actividades_semana: (data.actividades?.semana?.items || []).length === 0 ? undefined : (data.actividades.semana.items.every((it) => it.hecha) ? "completo" : "pendiente"),
    actividades_mes: (data.actividades?.mes?.items || []).length === 0 ? undefined : (data.actividades.mes.items.every((it) => it.hecha) ? "completo" : "pendiente"),
    rally_otc: (data.rallyOtcs || (data.rallyOtc?.nombre ? [data.rallyOtc] : [])).some((r) => r.activo) ? "parpadeo_verde" : undefined,
    avisos: hayAvisoNuevoPara(data, puesto, null) ? "aviso_nuevo" : undefined,
    unidades: rutaPropiaStaff && !unidadYaRegistradaHoy(data, rutaPropiaStaff) ? "pendiente_urgente" : undefined,
    creditos: puesto === "gerente" && !creditosPendientes(data) ? "completo" : undefined,
    facturas: hayObservacionFacturasPendiente ? "aviso_nuevo" : undefined,
  };
  const [newOpen, setNewOpen] = useState("");
  const [newChampions, setNewChampions] = useState("");
  const [nuevoFestivo, setNuevoFestivo] = useState("");
  const [rutaMesaSeleccionada, setRutaMesaSeleccionada] = useState(data.vendedores[0]?.name || "");
  const [rutaMensajeSeleccionada, setRutaMensajeSeleccionada] = useState(data.vendedores[0]?.name || "");
  const [textoMensaje, setTextoMensaje] = useState("");
  const [supervisorMensajeSeleccionado, setSupervisorMensajeSeleccionado] = useState("SUPERVISOR-1");
  const [textoMensajeSupervisor, setTextoMensajeSupervisor] = useState("");
  const [verTablaHoyCompleta, setVerTablaHoyCompleta] = useState(false);
  const [pwstActualizando, setPwstActualizando] = useState(false);
  const [pwstStatus, setPwstStatus] = useState("");
  const capturaPorRutaHoy = useCapturaImagen();

  function addVendedor() {
    if (!newName.trim()) return;
    const v = { id: "v" + Date.now(), name: newName.trim(), objetivos: { ...blankObjetivos(), open: Number(newOpen) || 0, champions: Number(newChampions) || 0 } };
    persistFresco((fresca) => ({ vendedores: [...(fresca.vendedores || []), v] }));
    setNewName(""); setNewOpen(""); setNewChampions("");
  }
  function removeVendedor(id) {
    persistFresco((fresca) => ({ vendedores: (fresca.vendedores || []).filter((v) => v.id !== id) }));
  }
  function updateObjetivo(id, field, val) {
    persistFresco((fresca) => ({
      vendedores: (fresca.vendedores || []).map((v) =>
        v.id === id ? { ...v, objetivos: { ...v.objetivos, [field]: Number(val) || 0 } } : v
      ),
    }));
  }
  function updatePeriodo(field, val) {
    // Las ventas del periodo ya viven en su propia tabla (ventas_periodo) y
    // se recargan solas cuando cambia data.periodo (ver useEffect de
    // cargarVentasPeriodo). Aquí solo se reinicia el conteo de cupones
    // canjeados por ruta, para que no se mezcle con el periodo nuevo.
    persistFresco((fresca) => ({
      periodo: { ...fresca.periodo, [field]: val },
      cuponesRedimidos: [],
    }));
  }
  function agregarDiaNoLaborable(fecha) {
    if (!fecha) return;
    persistFresco((fresca) => {
      const actuales = fresca.diasNoLaborables || [];
      if (actuales.includes(fecha)) return { diasNoLaborables: actuales };
      return { diasNoLaborables: [...actuales, fecha].sort() };
    });
  }
  function quitarDiaNoLaborable(fecha) {
    persistFresco((fresca) => ({ diasNoLaborables: (fresca.diasNoLaborables || []).filter((f) => f !== fecha) }));
  }

  // Reinicia solo los checklists de actividades que ya entraron a un nuevo
  // periodo (día/semana/mes). No hace nada si ya están al día.
  useEffect(() => {
    if (!data) return;
    const actual = data.actividades;
    const normalizado = normalizarActividades(actual);
    const cambio = normalizado.dia !== actual?.dia || normalizado.semana !== actual?.semana || normalizado.mes !== actual?.mes;
    if (cambio) persistFresco((fresca) => ({ actividades: normalizarActividades(fresca.actividades) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.actividades?.dia?.fecha, data?.actividades?.semana?.semanaId, data?.actividades?.mes?.mesId]);

  function marcarActividad(ciclo, id, hecha) {
    persistFresco((fresca) => {
      const est = fresca.actividades[ciclo];
      const items = est.items.map((it) => (it.id === id ? { ...it, hecha } : it));
      return { actividades: { ...fresca.actividades, [ciclo]: { ...est, items } } };
    });
  }
  function agregarActividad(ciclo, texto, tipo, autor) {
    if (!texto || !texto.trim()) return;
    persistFresco((fresca) => {
      const est = fresca.actividades[ciclo];
      return { actividades: { ...fresca.actividades, [ciclo]: { ...est, items: [...est.items, nuevaActividad(texto, tipo, autor, fechaHoyISO())] } } };
    });
  }
  function eliminarActividad(ciclo, id) {
    persistFresco((fresca) => {
      const est = fresca.actividades[ciclo];
      return { actividades: { ...fresca.actividades, [ciclo]: { ...est, items: est.items.filter((it) => it.id !== id) } } };
    });
  }

  const revisorNombre = NOMBRES[staffUsername] || staffUsername || "Staff";

  function enviarMensajeDia(vendedorName, texto) {
    if (!texto.trim()) return;
    persistFresco((fresca) => ({
      mensajesDia: {
        ...(fresca.mensajesDia || {}),
        [vendedorName]: { texto: texto.trim(), fecha: todayISO(), autor: revisorNombre },
      },
    }));
  }
  function quitarMensajeDia(vendedorName) {
    persistFresco((fresca) => {
      const copia = { ...(fresca.mensajesDia || {}) };
      delete copia[vendedorName];
      return { mensajesDia: copia };
    });
  }

  function enviarMensajeSupervisor(username, texto) {
    if (!texto.trim()) return;
    persistFresco((fresca) => ({
      mensajesSupervisores: {
        ...(fresca.mensajesSupervisores || {}),
        [username]: { texto: texto.trim(), fecha: todayISO(), autor: revisorNombre },
      },
    }));
  }
  function quitarMensajeSupervisor(username) {
    persistFresco((fresca) => {
      const copia = { ...(fresca.mensajesSupervisores || {}) };
      delete copia[username];
      return { mensajesSupervisores: copia };
    });
  }

  function descargarExcelMesaControl(analisis, rutaNombre, vendedorNombre, revisor) {
    if (!analisis) return;
    const encabezado = [
      ["Ruta", rutaNombre],
      ["Vendedor", vendedorNombre || ""],
      ["Revisó", revisor || ""],
      ["Fecha evaluada", analisis.fecha],
      ["Hora de inicio", analisis.horaInicio || ""],
      ["Volumen total", analisis.volumenTotal],
      ["Visitas < 3 min", analisis.menores3.length],
      [],
      ["Cliente", "Inicio", "Final", "Min. estancia", "Tipo inicio", "Tipo cierre", "Volumen", "Descuento", "Alerta"],
    ];
    const filas = analisis.todos.map((r) => [
      r.cliente, r.inicio, r.final, r.tiempoEstancia, r.tipoInicio, r.tipoFin, r.volumen, r.descuento, r.alerta ? "SI" : "",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([...encabezado, ...filas]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mesa de Control");
    const nombreArchivo = `mesa_control_${rutaNombre.replace(/\s+/g, "_")}_${analisis.fecha}.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 18px 60px", position: "relative", zIndex: 1 }}>
      <FondoDeFondo url={fondoUrl} />
      <TopBar title="Panel Staff" subtitle={`Periodo ${data.periodo.inicio} → ${data.periodo.fin} · ${stats.restantes} días hábiles restantes (Lun-Sáb)`} onLogout={onLogout} onRefresh={onRefresh} refrescando={refrescando} />

      <div style={{ display: "flex", gap: 8, margin: "18px 0" }}>
        {(esSupervisor2 ? [["resumen","Resumen"]] : [["resumen","Resumen"],["proyectado","Proyectado"],["objetivos","Objetivos"],["cargar","Cargar datos"]]).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={tab===k ? "btn" : "btn-ghost"} style={{ fontSize: 13 }}>{l}</button>
        ))}
      </div>

      {tab === "resumen" && (
        <>
          <ObjetivoTabs
            tab={objTab}
            setTab={setObjTab}
            tabs={
              esSupervisor2
                ? OBJETIVO_TABS.filter((t) => ["dia", "mesa", "cuponera", "tiempos", "unidades", "tepic", "avisos", "reloj_checador", "mi_fondo"].includes(t.key))
                : esSupervisor1
                ? OBJETIVO_TABS.filter((t) => t.key !== "actividades_semana" && t.key !== "actividades_mes" && t.key !== "cotizador" && t.key !== "creditos" && t.key !== "tepic" && t.key !== "actividad" && t.key !== "km")
                : OBJETIVO_TABS.filter((t) => t.key !== "km")
            }
            estadoTabs={estadoTabsActividades}
          />

          {objTab === "dia" ? (
            <>
              <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 10 }}>Avance del {stats.total.hoy.fecha}</div>
              {stats.total.alertas.length > 0 && (
                <div className="card" style={{ padding: 16, marginBottom: 20, border: "1px solid #FF6B6B" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <AlertCircle size={16} color="#FF6B6B" />
                    <span className="display" style={{ fontSize: 14, color: "#FF6B6B" }}>ALERTA · BAJO DESEMPEÑO HOY</span>
                  </div>
                  {stats.total.alertas.map((v) => (
                    <div key={v.id} style={{ fontSize: 13, color: "#E8EDF5", marginBottom: 4 }}>
                      {v.name}{NOMBRES[v.name] ? ` · ${NOMBRES[v.name]}` : ""} — {unidades(v.hoy.volumen.vendido)} vendidos, meta del día ~{unidades(v.hoy.volumen.objetivo)}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                <KpiCard icon={<Target size={14} />} label="VOLUMEN (hoy)" value={`${unidades(stats.total.hoy.volumen.vendido)} / ${unidades(stats.total.hoy.volumen.objetivo)}`} accent={metaColor(stats.total.hoy.volumen.vendido, stats.total.hoy.volumen.objetivo)} />
                {MARCAS_DIA.map((m) => (
                  <KpiCard key={m.key} icon={<Star size={14} />} label={m.label} value={`${unidades(stats.total.hoy.marcas[m.key].vendido)} / ${unidades(stats.total.hoy.marcas[m.key].objetivo)}`} accent={metaColor(stats.total.hoy.marcas[m.key].vendido, stats.total.hoy.marcas[m.key].objetivo)} />
                ))}
                <KpiCard icon={<Star size={14} />} label="OTC" value={`${money(stats.total.hoy.otc.vendido)} / ${money(stats.total.hoy.otc.objetivo)}`} accent={metaColor(stats.total.hoy.otc.vendido, stats.total.hoy.otc.objetivo)} />
                <KpiCard icon={<Star size={14} />} label="OTC sin Vuala" value={`${stats.total.hoy.otcSinVuala.rutasQueCumplen} / ${stats.total.hoy.otcSinVuala.totalRutas} rutas`} accent={stats.total.hoy.otcSinVuala.rutasQueCumplen === stats.total.hoy.otcSinVuala.totalRutas ? "#3DDC97" : "#FF6B6B"} />
                <KpiCard icon={<MapPin size={14} />} label="VISITAS EFECTIVAS" value={stats.total.hoy.visitasEfectivas} />
              </div>

              <div className="card" style={{ padding: 16, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <MessageSquare size={16} color="#F2B134" />
                  <span className="display" style={{ fontSize: 14, color: "#9AA7BD" }}>MENSAJE PARA LA RUTA</span>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                  <select value={rutaMensajeSeleccionada} onChange={(e) => { setRutaMensajeSeleccionada(e.target.value); setTextoMensaje(""); }} style={{ flex: 1, minWidth: 200 }}>
                    {data.vendedores.map((v) => (
                      <option key={v.id} value={v.name}>{v.name}{NOMBRES[v.name] ? ` — ${NOMBRES[v.name]}` : ""}</option>
                    ))}
                  </select>
                </div>
                {data.mensajesDia?.[rutaMensajeSeleccionada] && (
                  <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>
                    Mensaje actual ({data.mensajesDia[rutaMensajeSeleccionada].fecha} · {data.mensajesDia[rutaMensajeSeleccionada].autor}):
                    <div style={{ color: "#E8EDF5", marginTop: 4, whiteSpace: "pre-wrap" }}>{data.mensajesDia[rutaMensajeSeleccionada].texto}</div>
                  </div>
                )}
                <textarea
                  value={textoMensaje}
                  onChange={(e) => setTextoMensaje(e.target.value)}
                  placeholder="Escribe una indicación para esta ruta (se verá en su pestaña DÍA)..."
                  rows={3}
                  style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 13, resize: "vertical", color: "#000000", background: "#FFFFFF" }}
                />
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button className="btn" onClick={() => { enviarMensajeDia(rutaMensajeSeleccionada, textoMensaje); setTextoMensaje(""); }}>
                    Enviar mensaje
                  </button>
                  {data.mensajesDia?.[rutaMensajeSeleccionada] && (
                    <button className="btn-ghost" onClick={() => quitarMensajeDia(rutaMensajeSeleccionada)}>Quitar mensaje</button>
                  )}
                </div>
              </div>

              {puesto === "gerente" && (
                <div className="card" style={{ padding: 16, marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <MessageSquare size={16} color="#F2B134" />
                    <span className="display" style={{ fontSize: 14, color: "#9AA7BD" }}>MENSAJE PARA SUPERVISOR</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    <select value={supervisorMensajeSeleccionado} onChange={(e) => { setSupervisorMensajeSeleccionado(e.target.value); setTextoMensajeSupervisor(""); }} style={{ flex: 1, minWidth: 200 }}>
                      <option value="SUPERVISOR-1">SUPERVISOR-1{NOMBRES["SUPERVISOR-1"] ? ` — ${NOMBRES["SUPERVISOR-1"]}` : ""}</option>
                      <option value="SUPERVISOR-2">SUPERVISOR-2{NOMBRES["SUPERVISOR-2"] ? ` — ${NOMBRES["SUPERVISOR-2"]}` : ""}</option>
                    </select>
                  </div>
                  {data.mensajesSupervisores?.[supervisorMensajeSeleccionado] && (
                    <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>
                      Mensaje actual ({data.mensajesSupervisores[supervisorMensajeSeleccionado].fecha} · {data.mensajesSupervisores[supervisorMensajeSeleccionado].autor}):
                      <div style={{ color: "#E8EDF5", marginTop: 4, whiteSpace: "pre-wrap" }}>{data.mensajesSupervisores[supervisorMensajeSeleccionado].texto}</div>
                    </div>
                  )}
                  <textarea
                    value={textoMensajeSupervisor}
                    onChange={(e) => setTextoMensajeSupervisor(e.target.value)}
                    placeholder="Escribe una indicación para este supervisor (la verá al entrar a su pestaña DÍA)..."
                    rows={3}
                    style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 13, resize: "vertical", color: "#000000", background: "#FFFFFF" }}
                  />
                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button className="btn" onClick={() => { enviarMensajeSupervisor(supervisorMensajeSeleccionado, textoMensajeSupervisor); setTextoMensajeSupervisor(""); }}>
                      Enviar mensaje
                    </button>
                    {data.mensajesSupervisores?.[supervisorMensajeSeleccionado] && (
                      <button className="btn-ghost" onClick={() => quitarMensajeSupervisor(supervisorMensajeSeleccionado)}>Quitar mensaje</button>
                    )}
                  </div>
                </div>
              )}

              {(puesto === "supervisor" || puesto === "supervisor2") && data.mensajesSupervisores?.[staffUsername] && (
                <div className="card" style={{ padding: 14, marginBottom: 20, border: "1px solid #F2B134" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <MessageSquare size={16} color="#F2B134" />
                    <span className="display" style={{ fontSize: 13, color: "#F2B134" }}>MENSAJE DEL GERENTE</span>
                  </div>
                  <div style={{ fontSize: 14, color: "#E8EDF5", whiteSpace: "pre-wrap" }}>{data.mensajesSupervisores[staffUsername].texto}</div>
                  <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 8 }}>
                    {data.mensajesSupervisores[staffUsername].autor} · {data.mensajesSupervisores[staffUsername].fecha}
                  </div>
                </div>
              )}

              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px 0", flexWrap: "wrap", gap: 8 }}>
                  <div className="display" style={{ fontSize: 14, color: "#9AA7BD" }}>POR RUTA · HOY</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <BotonGuardarImagen captura={capturaPorRutaHoy} nombreArchivo={`por_ruta_hoy_${fechaHoyISO()}.png`} etiqueta="Guardar / enviar" />
                    <button className="btn-ghost" onClick={() => setVerTablaHoyCompleta(true)}>
                      Ver tabla completa (pantalla)
                    </button>
                  </div>
                </div>
                <div ref={capturaPorRutaHoy.capturaRef} style={{ padding: 16 }}>
                  <div style={{ overflowX: "auto" }}>
                    <TablaPorRutaHoy porVendedor={stats.porVendedor} peorVendedorNombre={stats.peorVendedorNombre} />
                  </div>
                </div>
              </div>

              {verTablaHoyCompleta && (
                <ModalTablaCompleta titulo="POR RUTA · HOY" onClose={() => setVerTablaHoyCompleta(false)}>
                  <TablaPorRutaHoy porVendedor={stats.porVendedor} peorVendedorNombre={stats.peorVendedorNombre} />
                </ModalTablaCompleta>
              )}

              {!esSupervisor2 && (
                <div style={{ marginTop: 24 }}>
                  <RepartidorAhogadoView stats={stats} />
                </div>
              )}
            </>
          ) : objTab === "mesa" ? (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
                <select value={rutaMesaSeleccionada} onChange={(e) => setRutaMesaSeleccionada(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
                  {data.vendedores.map((v) => (
                    <option key={v.id} value={v.name}>{v.name}{NOMBRES[v.name] ? ` — ${NOMBRES[v.name]}` : ""}</option>
                  ))}
                </select>
                <button className="btn" onClick={() => mesaControlFileInputRef.current?.click()}>
                  <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir mesa de control (hasta 7)
                </button>
                <button
                  className="btn-ghost"
                  disabled={!analizarMesaControl(data.mesaControl || [], rutaMesaSeleccionada)}
                  onClick={() => descargarExcelMesaControl(
                    analizarMesaControl(data.mesaControl || [], rutaMesaSeleccionada),
                    rutaMesaSeleccionada,
                    NOMBRES[rutaMesaSeleccionada],
                    revisorNombre
                  )}
                >
                  Descargar Excel
                </button>
              </div>
              <p style={{ fontSize: 12, color: "#9AA7BD", marginTop: 0, marginBottom: 12 }}>
                Puedes seleccionar hasta 7 archivos a la vez (uno por ruta). Se combinan sin borrar las otras rutas.
              </p>
              <input ref={mesaControlFileInputRef} type="file" multiple accept=".xlsx,.xls,.csv,.txt" style={{ display: "none" }} onChange={onMesaControlFile} />
              <PegarTextoBox onProcesar={onMesaControlTexto} placeholder="Pega aquí las filas con columnas vendedor, fecha, cliente, inicio, final, Tiempo_estancia, tipoinicio, tipofin, volumen y descuento (incluye el encabezado)." />
              {mesaControlStatus && (
                <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: (mesaControlStatus.startsWith("Mesa de control") && !mesaControlStatus.includes("Error") && !mesaControlStatus.includes("No se")) ? "#3DDC97" : "#FF6B6B" }}>
                  {(mesaControlStatus.startsWith("Mesa de control") && !mesaControlStatus.includes("Error") && !mesaControlStatus.includes("No se")) ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {mesaControlStatus}
                </div>
              )}
              <MesaControlView
                analisis={analizarMesaControl(data.mesaControl || [], rutaMesaSeleccionada)}
                nombreRuta={rutaMesaSeleccionada}
                nombreVendedor={NOMBRES[rutaMesaSeleccionada]}
                revisor={revisorNombre}
                vendedorStats={stats.porVendedor.find((v) => v.name === rutaMesaSeleccionada)}
                resumenPedidos={calcularResumenPedidos(data.pedidosDia, rutaMesaSeleccionada)}
                visitasVsObjetivo={calcularVisitasVsObjetivo(data.pedidosDia, rutaMesaSeleccionada, data.objetivosVisitasDia, todayISO())}
                mesaControl={data.mesaControl || []}
              />
            </>
          ) : objTab === "cuponera" ? (
            <CuponeraView data={data} persist={persist} persistFresco={persistFresco} puesto={puesto} rol="staff" rutaActual={null} revisorNombre={revisorNombre} nombres={NOMBRES} />
          ) : objTab === "tiempos" ? (
            <TiemposView identidad={revisorNombre} misAreas={["Ingreso a CLO", "Salida a ruta", "Ingreso a CLO (fin de ruta)", "Salida de CLO final"]} />
          ) : objTab === "unidades" ? (
            <UnidadesView data={data} persistRevisionUnidad={persistRevisionUnidad} persistConfigUnidades={persistConfigUnidades} rol="staff" puesto={puesto} identidad={revisorNombre} rutaPropia={null} cloFiltro={CLO_PVR} />
          ) : objTab === "nomina" ? (
            <NominaView data={data} persistFresco={persistFresco} rol="staff" puesto={puesto} identidad={revisorNombre} rutaPropia={null} />
          ) : objTab === "sin_visita" ? (
            <SinVisitaView data={data} rol="staff" puesto={puesto} rutaPropia={null} />
          ) : objTab === "actividad" ? (
            puesto === "gerente" ? (
              <ActividadView />
            ) : (
              <div className="card" style={{ padding: 30, textAlign: "center", color: "#9AA7BD" }}>
                Este módulo es exclusivo del Gerente.
              </div>
            )
          ) : objTab === "reloj_checador" ? (
            <RelojChecadorView puedeSubir={puesto === "gerente"} rutaPropia={null} puedeVerBono={puesto === "gerente" || esSupervisor1} />
          ) : objTab === "tepic" ? (
            <div>
              <div className="display" style={{ fontSize: 16, color: "#E8EDF5", marginBottom: 4 }}>CLO TEPIC</div>
              <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 14 }}>
                Unidades y revisiones del CLO Tepic. El reporte combinado de ambos CLOs está al final, junto a la bitácora.
              </div>
              <UnidadesView data={data} persistRevisionUnidad={persistRevisionUnidad} persistConfigUnidades={persistConfigUnidades} rol="staff" puesto={puesto} identidad={revisorNombre} rutaPropia={null} cloFiltro={CLO_TEPIC} />
            </div>
          ) : objTab === "creditos" ? (
            <CreditosView data={data} persistFresco={persistFresco} rol="staff" revisorNombre={revisorNombre} />
          ) : objTab === "rutas" ? (
            <RutasView stats={stats} />
          ) : objTab === "actividades_dia" ? (
            <ActividadesView ciclo="dia" titulo="ACTIVIDADES DEL DÍA" data={data} persist={persist} persistFresco={persistFresco} revisorNombre={revisorNombre} puedeEliminar={puesto === "gerente"} />
          ) : objTab === "actividades_semana" ? (
            <ActividadesView ciclo="semana" titulo="ACTIVIDADES DE LA SEMANA" data={data} persist={persist} persistFresco={persistFresco} revisorNombre={revisorNombre} puedeEliminar={puesto === "gerente"} />
          ) : objTab === "actividades_mes" ? (
            <ActividadesView ciclo="mes" titulo="ACTIVIDADES DEL MES" data={data} persist={persist} persistFresco={persistFresco} revisorNombre={revisorNombre} puedeEliminar={puesto === "gerente"} />
          ) : objTab === "cotizador" ? (
            <div className="card" style={{ padding: 30, textAlign: "center" }}>
              <div className="display" style={{ fontSize: 16, color: "#E8EDF5", marginBottom: 8 }}>COTIZADOR MARLBORO</div>
              <p style={{ fontSize: 13, color: "#9AA7BD", marginBottom: 20 }}>
                Se abre en una pestaña nueva de tu navegador, sin salir de SMART-TRACK.
              </p>
              <a
                href="https://cotizador-marlboro.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", padding: "12px 24px" }}
              >
                Abrir cotizador
              </a>
            </div>
          ) : objTab === "rally_otc" ? (
            <RallyOtcView data={data} persist={persist} persistFresco={persistFresco} puesto={puesto} rol="staff" revisorNombre={revisorNombre} />
          ) : objTab === "avisos" ? (
            <AvisosView data={data} persist={persist} persistFresco={persistFresco} puedeCrear={puesto === "gerente" || esSupervisor1 || esSupervisor2} revisorNombre={revisorNombre} viewerKey={puesto} />
          ) : objTab === "facturas" ? (
            <FacturasView rol="staff" puesto={puesto} rutaActual={null} identidad={revisorNombre} nombres={NOMBRES} vendedores={data.vendedores} />
          ) : objTab === "cargas" ? (
            <CargasView
              data={data} persist={persist} persistCargas={persistCargas} puesto={puesto} rol="staff"
              onUpload={onCargasFile} cargasFileInputRef={cargasFileInputRef} cargasStatus={cargasStatus} onDescargar={onDescargarCargas}
              onActivarCarga={onActivarCarga}
            />
          ) : objTab === "km" ? (
            <div className="card" style={{ padding: 30, textAlign: "center", color: "#9AA7BD" }}>
              KM es un registro individual de cada ruta — entra a la pestaña de la ruta específica que quieras revisar para verlo.
            </div>
          ) : objTab === "mi_fondo" ? (
            <PanelFondoPersonalizado identidad={staffUsername} url={fondoUrl} setUrl={setFondoUrl} />
          ) : objTab === "pwst" ? (
            <div className="card" style={{ padding: 30, textAlign: "center" }}>
              <div className="display" style={{ fontSize: 16, color: "#E8EDF5", marginBottom: 8 }}>PWST · POWERSTREET</div>
              <p style={{ fontSize: 13, color: "#9AA7BD", marginBottom: 20 }}>
                Se abre en una pestaña nueva de tu navegador, sin salir de SMART-TRACK.
              </p>
              <a
                href="https://client.powerstreet.cloud"
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", padding: "12px 24px", background: "#1E6FEB", borderColor: "#1E6FEB", color: "#FFFFFF" }}
              >
                Abrir PowerStreet
              </a>
              {puesto === "gerente" && (
                <div style={{ marginTop: 24, display: "inline-block", textAlign: "left" }}>
                  <div className="card" style={{ padding: 14, background: "#131C30" }}>
                    <div style={{ fontSize: 11, color: "#9AA7BD", marginBottom: 6 }}>ACCESO (solo visible para Gerente)</div>
                    <div style={{ fontSize: 13, color: "#E8EDF5" }}>Usuario: <span className="mono">jmdrafgal</span></div>
                    <div style={{ fontSize: 13, color: "#E8EDF5" }}>Contraseña: <span className="mono">Pwst12345*</span></div>
                  </div>

                  {/* ===== BOTÓN ACTUALIZAR DESDE POWERSTREET (n8n) — MODO PRUEBA =====
                      Usa el webhook de PRUEBA de n8n ("webhook-test"). Ese webhook solo
                      responde una vez cada que en el editor de n8n le des clic a
                      "Listen for test event" antes de presionar este botón aquí.
                      Cuando el workflow ya esté probado y funcionando, hay que:
                        1) Activar el workflow en n8n (toggle "Active").
                        2) Cambiar la URL de abajo de "/webhook-test/" a "/webhook/". */}
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 11, color: "#F2B134", marginBottom: 8, fontWeight: 600 }}>
                      MODO PRUEBA — antes de presionar, activa "Listen for test event" en n8n
                    </div>
                    <button
                      className="btn"
                      style={{ background: "#1E6FEB", borderColor: "#1E6FEB", color: "#fff", width: "100%", padding: "12px 20px" }}
                      disabled={pwstActualizando}
                      onClick={async () => {
                        setPwstActualizando(true);
                        setPwstStatus("Actualizando desde PowerStreet... espera unos segundos");
                        try {
                          const res = await fetch(
                            "https://n8n-n8n.u4ld49.easypanel.host/webhook-test/actualizar-avance-powerstreet",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ trigger: "avance-dia" }),
                            }
                          );
                          const result = await res.json();
                          if (result.success) {
                            setPwstStatus(`Avance cargado: ${result.totalRegistros} registros desde PowerStreet`);
                            if (onRefresh) await onRefresh();
                          } else {
                            setPwstStatus("Error: " + (result.message || "No se pudo actualizar"));
                          }
                        } catch (err) {
                          console.error(err);
                          setPwstStatus("Error de conexión con n8n. Revisa que el workflow esté activo y escuchando el test.");
                        } finally {
                          setPwstActualizando(false);
                        }
                      }}
                    >
                      {pwstActualizando ? "Actualizando..." : "Actualizar Avance del Día desde PowerStreet (prueba)"}
                    </button>
                    {pwstStatus && (
                      <div style={{ marginTop: 12, fontSize: 13, textAlign: "center", color: pwstStatus.startsWith("Avance cargado") ? "#3DDC97" : "#FF6B6B" }}>
                        {pwstStatus}
                      </div>
                    )}
                  </div>
                  {/* ===== FIN BOTÓN ===== */}
                </div>
              )}
            </div>
          ) : (
            <>
              <RoadProgress pct={stats.total.tabs[objTab].avancePct} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9AA7BD", marginBottom: 20 }}>
                <span>{fmt(objUnit, stats.total.tabs[objTab].avance)} {objUnit==="units" ? "vendidos" : "vendido"}</span>
                <span>{stats.total.tabs[objTab].avancePct.toFixed(0)}% de {fmt(objUnit, stats.total.tabs[objTab].objetivo)}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                <KpiCard icon={<Target size={14} />} label="Resta por vender (total)" value={fmt(objUnit, stats.total.tabs[objTab].restaPorVender)} accent="#FF6B6B" />
                <KpiCard icon={<Calendar size={14} />} label="Necesario / día (total)" value={fmt(objUnit, stats.total.tabs[objTab].ventaPorDiaNecesaria)} accent="#F2B134" />
                {objTab === "max" && (
                  <>
                    <KpiCard icon={<MapPin size={14} />} label="Visitas efectivas" value={stats.total.visitasEfectivas} />
                    <KpiCard icon={<Star size={14} />} label="OTC" value={`${money(stats.total.marcaOtc.vendido)} / ${money(stats.total.marcaOtc.objetivo)}`} accent={metaColor(stats.total.marcaOtc.vendido, stats.total.marcaOtc.objetivo)} />
                    <KpiCard
                      icon={<Star size={14} />}
                      label={puesto === "gerente" ? "Comisión Gerente" : "Comisión Supervisor"}
                      value={money(puesto === "gerente" ? stats.total.comisionGerente : stats.total.comisionSupervisor)}
                      accent="#3DDC97"
                    />
                  </>
                )}
              </div>

              {objTab === "open" && <MarcasBreakdown titulo="MARCAS · OPEN (PAQUETES)" marcas={MARCAS_OPEN} data={stats.total.marcasOpen} />}
              {objTab === "champions" && <MarcasBreakdown titulo="MARCAS · CHAMPIONS (PAQUETES)" marcas={MARCAS_CHAMPIONS} data={stats.total.marcasChampions} />}

              <div className="card" style={{ padding: 16, marginBottom: 20 }}>
                <div className="display" style={{ fontSize: 14, marginBottom: 12, color: "#9AA7BD" }}>VENTA POR DÍA (TODOS){objUnit==="units" ? " · PAQUETES" : ""}</div>
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={objUnit === "units" ? stats.total.ventaPorDiaUnidades : stats.total.ventaPorDia}>
                      <CartesianGrid stroke="#1E2A42" vertical={false} />
                      <XAxis dataKey="fecha" stroke="#9AA7BD" fontSize={11} />
                      <YAxis stroke="#9AA7BD" fontSize={11} tickFormatter={(v) => (objUnit === "units" ? v : `${(v/1000).toFixed(0)}k`)} />
                      <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #2A3852" }} formatter={(v) => (objUnit === "units" ? unidades(v) : money(v))} />
                      <Bar dataKey={objUnit === "units" ? "paquetes" : "monto"} fill="#3DDC97" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div className="display" style={{ fontSize: 14, padding: "14px 16px 0", color: "#9AA7BD" }}>POR VENDEDOR ({OBJETIVO_TABS.find(t=>t.key===objTab).label})</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 10, minWidth: (objTab === "open" || objTab === "champions") ? 760 : undefined }}>
                    <thead>
                      <tr style={{ color: "#9AA7BD", textAlign: "left" }}>
                        <th style={{ padding: "8px 16px" }}>Vendedor</th>
                        <th>Avance</th>
                        <th>Resta</th>
                        <th>Necesario/día</th>
                        {objTab === "open" && MARCAS_OPEN.map((m) => <th key={m.key}>{m.label}</th>)}
                        {objTab === "champions" && MARCAS_CHAMPIONS.map((m) => <th key={m.key}>{m.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                  {stats.porVendedor.map((v) => (
                    <tr key={v.id} style={{ borderTop: "1px solid #1E2A42" }}>
                      <td style={{ padding: "10px 16px" }}>{v.name}{NOMBRES[v.name] ? ` · ${NOMBRES[v.name]}` : ""}</td>
                      <td>{v.tabs[objTab].avancePct.toFixed(0)}%</td>
                      <td>{fmt(objUnit, v.tabs[objTab].restaPorVender)}</td>
                      <td>{fmt(objUnit, v.tabs[objTab].ventaPorDiaNecesaria)}</td>
                      {objTab === "open" && MARCAS_OPEN.map((m) => (
                        <td key={m.key} style={{ color: metaColor(v.marcasOpen[m.key].vendido, v.marcasOpen[m.key].objetivo) }}>
                          {unidades(v.marcasOpen[m.key].vendido)} / {unidades(v.marcasOpen[m.key].objetivo)}
                        </td>
                      ))}
                      {objTab === "champions" && MARCAS_CHAMPIONS.map((m) => (
                        <td key={m.key} style={{ color: metaColor(v.marcasChampions[m.key].vendido, v.marcasChampions[m.key].objetivo) }}>
                          {unidades(v.marcasChampions[m.key].vendido)} / {unidades(v.marcasChampions[m.key].objetivo)}
                        </td>
                      ))}
                    </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === "proyectado" && (
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 20 }}>
            <div className="display" style={{ fontSize: 14, color: "#9AA7BD", marginBottom: 6 }}>PROYECCIÓN AL CIERRE DE MES</div>
            <p style={{ fontSize: 12, color: "#9AA7BD", margin: 0 }}>
              Proyectado = avance ÷ días transcurridos × días laborables del periodo.
              Días transcurridos: <span className="mono" style={{ color: "#E8EDF5" }}>{stats.diasTranscurridos}</span> de <span className="mono" style={{ color: "#E8EDF5" }}>{stats.diasLaborablesTotal}</span> días hábiles del periodo (Lun-Sáb).
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            {OBJETIVO_TABS.filter((t) => ["max", "open", "champions"].includes(t.key)).map((t) => {
              const p = stats.total.proyeccion[t.key];
              return (
                <KpiCard
                  key={t.key}
                  icon={<Target size={14} />}
                  label={`Proyectado ${t.label}`}
                  value={unidades(p.proyectado)}
                  accent={p.cumple ? "#3DDC97" : "#FF6B6B"}
                />
              );
            })}
          </div>

          {["max", "open", "champions"].map((tabKey) => {
            const label = OBJETIVO_TABS.find((t) => t.key === tabKey).label;
            const p = stats.total.proyeccion[tabKey];
            return (
              <div key={tabKey} className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
                <div className="display" style={{ fontSize: 14, padding: "14px 16px 0", color: "#9AA7BD" }}>
                  {label} · PROYECTADO {unidades(p.proyectado)} DE {unidades(p.objetivo)}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 10 }}>
                  <thead>
                    <tr style={{ color: "#9AA7BD", textAlign: "left" }}>
                      <th style={{ padding: "8px 16px" }}>Vendedor</th>
                      <th>Objetivo</th>
                      <th>Proyectado</th>
                      <th>Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.porVendedor.map((v) => {
                      const vp = v.proyeccion[tabKey];
                      const diferencia = vp.proyectado - vp.objetivo;
                      return (
                        <tr key={v.id} style={{ borderTop: "1px solid #1E2A42" }}>
                          <td style={{ padding: "10px 16px" }}>{v.name}{NOMBRES[v.name] ? ` · ${NOMBRES[v.name]}` : ""}</td>
                          <td>{unidades(vp.objetivo)}</td>
                          <td style={{ color: vp.cumple ? "#3DDC97" : "#FF6B6B" }}>{unidades(vp.proyectado)}</td>
                          <td style={{ color: diferencia >= 0 ? "#3DDC97" : "#FF6B6B" }}>
                            {diferencia >= 0 ? "+" : ""}{unidades(diferencia)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {(tabKey === "open" || tabKey === "champions") && (() => {
                  const lista = tabKey === "open" ? MARCAS_OPEN : MARCAS_CHAMPIONS;
                  const clave = tabKey === "open" ? "marcasOpen" : "marcasChampions";
                  return (
                    <div style={{ padding: 16, borderTop: "1px solid #1E2A42" }}>
                      <div className="display" style={{ fontSize: 13, color: "#9AA7BD", marginBottom: 12 }}>
                        MARCAS PROYECTADAS · {label}
                      </div>
                      {lista.map((m) => {
                        const tp = stats.total.proyeccion[clave][m.key];
                        return (
                          <div key={m.key} style={{ marginBottom: 18 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                              <span>{m.label} (equipo)</span>
                              <span className="mono" style={{ color: tp.cumple ? "#3DDC97" : "#FF6B6B" }}>
                                {unidades(tp.proyectado)} / {unidades(tp.objetivo)}
                              </span>
                            </div>
                            <div style={{ overflowX: "auto" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 480 }}>
                                <thead>
                                  <tr style={{ color: "#9AA7BD", textAlign: "left" }}>
                                    <th style={{ padding: "4px 0" }}>Vendedor</th>
                                    <th>Objetivo</th>
                                    <th>Proyectado</th>
                                    <th>Diferencia</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {stats.porVendedor.map((v) => {
                                    const vp = v.proyeccion[clave][m.key];
                                    const diferencia = vp.proyectado - vp.objetivo;
                                    return (
                                      <tr key={v.id} style={{ borderTop: "1px solid #1E2A42" }}>
                                        <td style={{ padding: "6px 0" }}>{v.name}{NOMBRES[v.name] ? ` · ${NOMBRES[v.name]}` : ""}</td>
                                        <td>{unidades(vp.objetivo)}</td>
                                        <td style={{ color: vp.cumple ? "#3DDC97" : "#FF6B6B" }}>{unidades(vp.proyectado)}</td>
                                        <td style={{ color: diferencia >= 0 ? "#3DDC97" : "#FF6B6B" }}>
                                          {diferencia >= 0 ? "+" : ""}{unidades(diferencia)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {tab === "objetivos" && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 12, color: "#9AA7BD" }}>Inicio de periodo</label><br />
              <input type="date" value={data.periodo.inicio} onChange={(e) => updatePeriodo("inicio", e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#9AA7BD" }}>Fin de periodo</label><br />
              <input type="date" value={data.periodo.fin} onChange={(e) => updatePeriodo("fin", e.target.value)} />
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#9AA7BD", marginTop: 0, marginBottom: 16 }}>
            Los días hábiles considerados van de <b>lunes a sábado</b> (los domingos ya se descuentan automáticamente). Si hay un día festivo o un descanso extraordinario entre semana, agrégalo abajo para que también se reste del conteo.
          </p>

          <div className="display" style={{ fontSize: 14, color: "#9AA7BD", marginBottom: 10 }}>DÍAS FESTIVOS / DESCANSOS EXTRAORDINARIOS</div>
          {(data.diasNoLaborables || []).length === 0 && (
            <div style={{ fontSize: 13, color: "#9AA7BD", marginBottom: 10 }}>No hay festivos registrados.</div>
          )}
          {(data.diasNoLaborables || []).map((f) => (
            <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ flex: 1 }} className="mono">{f}</span>
              <button className="btn-ghost" onClick={() => quitarDiaNoLaborable(f)}><Trash2 size={14} /></button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input type="date" value={nuevoFestivo} onChange={(e) => setNuevoFestivo(e.target.value)} style={{ flex: 1 }} />
            <button className="btn" onClick={() => { agregarDiaNoLaborable(nuevoFestivo); setNuevoFestivo(""); }}>
              <Plus size={14} style={{ verticalAlign: "-2px" }} />
            </button>
          </div>

          <div className="display" style={{ fontSize: 14, color: "#9AA7BD", margin: "18px 0 10px" }}>CARGA MASIVA (EXCEL)</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <button className="btn" onClick={() => objFileInputRef.current?.click()}>
              <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir objetivos
            </button>
            <button className="btn-ghost" onClick={onDownloadObjetivosTemplate}>Descargar plantilla</button>
          </div>
          <input ref={objFileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={onObjetivosFile} />
          <p style={{ fontSize: 12, color: "#9AA7BD", marginTop: 6 }}>
            Columnas: RUTA, OPEN, CHAMPIONS, MAX, VISITAS_EFECTIVAS, ICE MIX, BLOSS MIX, SUMM MIX, FARONET, CHAM_ICE, CHAM_BLOSS-SUMM, CHAM_FARONET, OTC, OTC_DIA.
            OPEN, CHAMPIONS y las marcas van en paquetes. OTC va en dinero ($ acumulado del periodo); OTC_DIA es el objetivo diario en $ (por defecto $1,600 si se omite).
            Se cruza por RUTA; si una ruta no existe, se crea.
          </p>
          {objStatus && (
            <div style={{ marginTop: 4, marginBottom: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: objStatus.startsWith("Objetivos") ? "#3DDC97" : "#FF6B6B" }}>
              {objStatus.startsWith("Objetivos") ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {objStatus}
            </div>
          )}

          <div style={{ borderTop: "1px solid #1E2A42", marginTop: 20, paddingTop: 20 }}>
            <div className="display" style={{ fontSize: 14, color: "#9AA7BD", marginBottom: 8 }}>OBJETIVO DE VISITAS POR DÍA DE LA SEMANA</div>
            <p style={{ fontSize: 13, color: "#9AA7BD", marginTop: 0 }}>
              Cuántos clientes debe visitar cada ruta según el día (Lun-Sáb). Sube una tabla con columnas <b>RUTA, LUNES, MARTES, MIERCOLES, JUEVES, VIERNES, SABADO</b> — una fila por ruta.
              Mesa de Control compara esto contra los clientes que sí visitó ese día (según el reporte de pedidos) y marca en rojo si visitó menos de lo que le tocaba. Cada carga reemplaza por completo la anterior.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => objetivoVisitasFileInputRef.current?.click()}>
                <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir objetivo de visitas
              </button>
              <button className="btn-ghost" onClick={onDownloadObjetivoVisitasTemplate}>Descargar plantilla</button>
            </div>
            <input ref={objetivoVisitasFileInputRef} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: "none" }} onChange={onObjetivoVisitasFile} />
            <PegarTextoBox onProcesar={onObjetivoVisitasTexto} placeholder="Pega aquí la tabla con columnas RUTA, LUNES, MARTES, MIERCOLES, JUEVES, VIERNES y SABADO (incluye el encabezado)." />
            {objetivoVisitasStatus && (
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: objetivoVisitasStatus.startsWith("Objetivo de visitas actualizado") ? "#3DDC97" : "#FF6B6B" }}>
                {objetivoVisitasStatus.startsWith("Objetivo de visitas actualizado") ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {objetivoVisitasStatus}
              </div>
            )}
          </div>

          <div className="display" style={{ fontSize: 14, color: "#9AA7BD", marginBottom: 10, marginTop: 8 }}>VENDEDORES Y OBJETIVOS</div>
          <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#9AA7BD", padding: "0 0 6px", paddingLeft: 4 }}>
            <span style={{ flex: 1 }}>Vendedor</span>
            <span style={{ width: 110 }}>OPEN</span>
            <span style={{ width: 110 }}>CHAMPIONS</span>
            <span style={{ width: 90 }}>MAX</span>
            <span style={{ width: 30 }} />
          </div>
          {data.vendedores.map((v) => {
            const open = v.objetivos?.open || 0;
            const champions = v.objetivos?.champions || 0;
            const max = Math.max(open, champions);
            return (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ flex: 1 }}>{v.name}{NOMBRES[v.name] ? ` · ${NOMBRES[v.name]}` : ""}</span>
                <input type="number" style={{ width: 110 }} value={open} onChange={(e) => updateObjetivo(v.id, "open", e.target.value)} />
                <input type="number" style={{ width: 110 }} value={champions} onChange={(e) => updateObjetivo(v.id, "champions", e.target.value)} />
                <span className="mono" style={{ width: 90, color: "#F2B134" }}>{unidades(max)}</span>
                <button className="btn-ghost" onClick={() => removeVendedor(v.id)}><Trash2 size={14} /></button>
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 8, marginTop: 16, borderTop: "1px solid #1E2A42", paddingTop: 16, flexWrap: "wrap" }}>
            <input placeholder="Nombre del vendedor" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
            <input placeholder="OPEN (paq.)" type="number" value={newOpen} onChange={(e) => setNewOpen(e.target.value)} style={{ width: 110 }} />
            <input placeholder="CHAMPIONS (paq.)" type="number" value={newChampions} onChange={(e) => setNewChampions(e.target.value)} style={{ width: 110 }} />
            <button className="btn" onClick={addVendedor}><Plus size={14} style={{ verticalAlign: "-2px" }} /></button>
          </div>
        </div>
      )}

      {tab === "cargar" && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 0" }}>
            <div className="display" style={{ fontSize: 13, color: "#9AA7BD", minWidth: 140 }}>AVANCE DEL DÍA</div>
            <button className="btn" onClick={() => avanceDiaFileInputRef.current?.click()}>
              <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir
            </button>
            <input ref={avanceDiaFileInputRef} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: "none" }} onChange={onAvanceDiaFile} />
            <PegarTextoBox onProcesar={onAvanceDiaTexto} placeholder="Pega aquí las filas con columnas Vendedor, Fecha, Cliente, Articulo, Paquetes y Total $ (incluye el encabezado)." />
            {avanceDiaStatus && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: avanceDiaStatus.startsWith("Avance cargado") ? "#3DDC97" : "#FF6B6B" }}>
                {avanceDiaStatus.startsWith("Avance cargado") ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />} {avanceDiaStatus}
              </span>
            )}
          </div>

          <div style={{ borderTop: "1px solid #1E2A42", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 0" }}>
            <div className="display" style={{ fontSize: 13, color: "#9AA7BD", minWidth: 140 }}>OTC DEL DÍA</div>
            <button className="btn" onClick={() => otcDiaFileInputRef.current?.click()}>
              <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir
            </button>
            <input ref={otcDiaFileInputRef} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: "none" }} onChange={onOtcDiaFile} />
            <PegarTextoBox onProcesar={onOtcDiaTexto} placeholder="Pega aquí las filas con columnas Vendedor, Fecha Venta y TOTAL $ (incluye el encabezado)." />
            {otcDiaStatus && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: otcDiaStatus.startsWith("OTC cargado") ? "#3DDC97" : "#FF6B6B" }}>
                {otcDiaStatus.startsWith("OTC cargado") ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />} {otcDiaStatus}
              </span>
            )}
          </div>

          <div style={{ borderTop: "1px solid #1E2A42", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 0" }}>
            <div className="display" style={{ fontSize: 13, color: "#9AA7BD", minWidth: 140 }}>AVANCE DEL PERIODO</div>
            <button className="btn" onClick={() => ventasPeriodoFileInputRef.current?.click()}>
              <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir
            </button>
            <button className="btn-ghost" onClick={onBorrarTodoVentasPeriodo}>
              <Trash2 size={14} style={{ verticalAlign: "-2px" }} color="#FF6B6B" /> Borrar todo
            </button>
            <input ref={ventasPeriodoFileInputRef} type="file" multiple accept=".xlsx,.xls,.csv,.txt" style={{ display: "none" }} onChange={onVentasPeriodoFile} />
            <PegarTextoBox onProcesar={onVentasPeriodoTexto} placeholder="Pega aquí las filas con columnas Vendedor, Fecha, Articulo, Paquetes y Total $ (incluye el encabezado)." />
            {ventasPeriodoStatus && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: ventasPeriodoStatus.startsWith("Periodo actualizado") ? "#3DDC97" : "#FF6B6B" }}>
                {ventasPeriodoStatus.startsWith("Periodo actualizado") ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />} {ventasPeriodoStatus}
              </span>
            )}
          </div>

          <div style={{ borderTop: "1px solid #1E2A42", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 0" }}>
            <div className="display" style={{ fontSize: 13, color: "#9AA7BD", minWidth: 140 }}>OTC SEMANAL</div>
            <button className="btn" onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir
            </button>
            <button className="btn-ghost" onClick={onDownloadTemplate}>Plantilla</button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: "none" }} onChange={onFile} />
            <PegarTextoBox onProcesar={onOtcSemanalTexto} placeholder="Pega aquí las filas con columnas Vendedor, Fecha Venta y TOTAL $ (incluye el encabezado)." />
            <span style={{ fontSize: 11.5, color: "#9AA7BD" }}>{(data.otcSemanal || []).length} registros</span>
            {status && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: status.startsWith("OTC semanal cargado") ? "#3DDC97" : "#FF6B6B" }}>
                {status.startsWith("OTC semanal cargado") ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />} {status}
              </span>
            )}
          </div>

          <div style={{ borderTop: "1px solid #1E2A42", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 0" }}>
            <div className="display" style={{ fontSize: 13, color: "#9AA7BD", minWidth: 140 }}>PEDIDOS DEL DÍA</div>
            <button className="btn" onClick={() => pedidosDiaFileInputRef.current?.click()}>
              <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir
            </button>
            <input ref={pedidosDiaFileInputRef} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: "none" }} onChange={onPedidosDiaFile} />
            <PegarTextoBox onProcesar={onPedidosDiaTexto} placeholder="Pega aquí las filas del reporte de pedidos (incluye el encabezado)." />
            {pedidosDiaStatus && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: pedidosDiaStatus.startsWith("Pedidos cargados") ? "#3DDC97" : "#FF6B6B" }}>
                {pedidosDiaStatus.startsWith("Pedidos cargados") ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />} {pedidosDiaStatus}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
