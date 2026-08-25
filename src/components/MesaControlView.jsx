// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo } from "react";
import { AlertCircle, Calendar, CheckCircle2, ChevronDown, ChevronUp, Clock, CreditCard, Download, MapPin, Star, Target, Ticket, Truck, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import {
  NOMBRES, UMBRAL_VISITAS_EFECTIVAS_MC, UMBRAL_MS_EN_RUTA, UMBRAL_HORAS_EN_RUTA, MARCAS_DIA,
} from "../constants";
import {
  money, unidades, metaColor, analizarMesaControl, calcularResumenPedidos,
  calcularVisitasVsObjetivo, calcularClientesFaltantes, todayISO,
  formatCrono,
} from "../utils";
import { esDeEsteAno, esVencido, diasParaVencer } from "../carteraVencidaParser";
import { KpiCard, BotonGuardarImagen } from "./ui";
import { useCapturaImagen } from "./hooks";
import TiemposView, { supabaseTiempos } from "./TiemposView";

// html2canvas solo entiende colores en formato rgb()/rgba()/hex. Si el CSS
// del proyecto usa formatos modernos (oklch(), color-mix(), variables CSS,
// etc. — típico de Tailwind reciente), html2canvas no puede parsearlos y en
// vez de marcar error simplemente no dibuja nada, dejando la captura en
// blanco. El navegador, en cambio, siempre resuelve getComputedStyle(...)
// a rgb()/rgba() sin importar cómo esté escrito el color original, así que
// aquí copiamos esos valores ya resueltos como estilos inline sobre el
// clon que arma html2canvas antes de rasterizarlo.
function sanearColoresParaCaptura(nodoOriginal, nodoClon) {
  const PROPS_COLOR = [
    "color", "backgroundColor",
    "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
    "boxShadow", "backgroundImage", "fill", "stroke", "outlineColor",
  ];
  const originales = [nodoOriginal, ...nodoOriginal.querySelectorAll("*")];
  const clones = [nodoClon, ...nodoClon.querySelectorAll("*")];
  originales.forEach((elOriginal, i) => {
    const elClon = clones[i];
    if (!elClon || !elClon.style) return;
    let computado;
    try {
      computado = window.getComputedStyle(elOriginal);
    } catch (e) {
      return;
    }
    PROPS_COLOR.forEach((prop) => {
      try {
        const valor = computado[prop];
        if (valor && valor !== "none") elClon.style[prop] = valor;
      } catch (e) { /* ignorar propiedad puntual */ }
    });
    // backdrop-filter / filter (blur, glow, etc.) tampoco los soporta
    // html2canvas y pueden dejar huecos transparentes o en blanco: los
    // quitamos solo para la captura, la pantalla real no se toca.
    elClon.style.backdropFilter = "none";
    elClon.style.webkitBackdropFilter = "none";
    if (computado.filter && computado.filter !== "none") {
      elClon.style.filter = "none";
    }
  });
}

function formatHoraTiempos(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Día de visita probable = el día de la semana en que se generó el
// documento (ej. si el documento es de lunes, la visita fue un lunes).
function diaDeVisita(fecha) {
  if (!fecha) return "—";
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(d)) return "—";
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return dias[d.getDay()];
}

// Convierte una hora en texto ("HH:MM", "HH:MM:SS", o 12h con "a.m."/"p.m.")
// a minutos totales desde medianoche. Regresa null si no puede interpretarla.
function horaAMinutos(hora) {
  if (!hora) return null;
  const m = String(hora).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?\s*\.?m\.?$/i);
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2]);
    const seg = m[3] ? Number(m[3]) : 0;
    const esPM = m[4].toLowerCase() === "p";
    if (esPM && h < 12) h += 12;
    if (!esPM && h === 12) h = 0;
    return h * 60 + min + seg / 60;
  }
  const partes = String(hora).trim().split(":").map(Number);
  if (partes.some((n) => isNaN(n))) return null;
  const [h, min, seg] = partes;
  return (h || 0) * 60 + (min || 0) + (seg || 0) / 60;
}

// Compara dos horas (en cualquiera de los formatos que acepta horaAMinutos)
// y regresa la diferencia en minutos (positivo = la segunda es más tarde que la primera).
function diferenciaMinutos(horaA, horaB) {
  const aMin = horaAMinutos(horaA);
  const bMin = horaAMinutos(horaB);
  if (aMin == null || bMin == null) return null;
  return Math.round(bMin - aMin);
}


export function MesaControlResumenCaptura({ analisis, nombreRuta, nombreVendedor, revisor, tiempos, vendedorStats, resumenPedidos, visitasVsObjetivo }) {
  const { fecha, horaInicio, horaUltimoCliente, top5, menores3, tipoInicioConteo, volumenTotal, clientesVolumen03, clientesConDescuento, visitasEfectivas, todos } = analisis;
  const gps = tipoInicioConteo["GPS"] || 0;
  const noGps = todos.length - gps;

  const horaIngresoClo = formatHoraTiempos(tiempos?.ingreso_clo?.ts);
  const horaSalidaClo = formatHoraTiempos(tiempos?.salida_ruta?.ts);
  const horaFinRuta = formatHoraTiempos(tiempos?.ingreso_clo_fin?.ts);
  const minClo2Inicio = diferenciaMinutos(horaSalidaClo, horaInicio);
  const msEnRuta = tiempos?.salida_ruta?.ts && tiempos?.ingreso_clo_fin?.ts
    ? tiempos.ingreso_clo_fin.ts - tiempos.salida_ruta.ts
    : null;

  const codigoRutaMC = (nombreRuta || "").replace("RUTA ", "").trim();
  const umbralVisitasMC = UMBRAL_VISITAS_EFECTIVAS_MC[codigoRutaMC];
  const visitasEfectivasBajoUmbral = umbralVisitasMC != null && visitasEfectivas <= umbralVisitasMC;

  return (
    <div className="card" style={{ padding: 24, textAlign: "center", border: "1px solid #2A3852" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
        <Truck size={20} color="#F2B134" />
        <span className="display" style={{ fontSize: 18 }}>MESA DE CONTROL</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10 }}>{nombreRuta}</div>
      {nombreVendedor && <div style={{ fontSize: 15, color: "#E8EDF5" }}>{nombreVendedor}</div>}
      <div style={{ fontSize: 12, color: "#9AA7BD", marginTop: 6 }}>
        {fecha}{revisor ? ` · Revisó: ${revisor}` : ""}
      </div>

      <div style={{ fontSize: 12, color: "#9AA7BD", marginTop: 4 }}>TIEMPOS DE RUTA</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, textAlign: "left" }}>
        <div className="card" style={{ padding: 12, flex: "1 1 30%", minWidth: 140 }}>
          <div style={{ fontSize: 10, color: "#9AA7BD" }}>INGRESO A CLO</div>
          <div className="mono" style={{ fontSize: 16 }}>{horaIngresoClo || "—"}</div>
        </div>
        <div className="card" style={{ padding: 12, flex: "1 1 30%", minWidth: 140 }}>
          <div style={{ fontSize: 10, color: "#9AA7BD" }}>SALIDA CLO</div>
          <div className="mono" style={{ fontSize: 16 }}>{horaSalidaClo || "—"}</div>
        </div>
        <div className="card" style={{ padding: 12, flex: "1 1 30%", minWidth: 140 }}>
          <div style={{ fontSize: 10, color: "#9AA7BD" }}>INICIO DE RUTA</div>
          <div className="mono" style={{ fontSize: 16 }}>{horaInicio || "—"}</div>
        </div>
        <div className="card" style={{ padding: 12, flex: "1 1 30%", minWidth: 140 }}>
          <div style={{ fontSize: 10, color: "#9AA7BD" }}>CLO → INICIO</div>
          <div className="mono" style={{ fontSize: 16, color: minClo2Inicio != null && minClo2Inicio > 15 ? "#FF6B6B" : "#3DDC97" }}>
            {minClo2Inicio != null ? `${minClo2Inicio} min` : "—"}
          </div>
        </div>
        <div className="card" style={{ padding: 12, flex: "1 1 30%", minWidth: 140 }}>
          <div style={{ fontSize: 10, color: "#9AA7BD" }}>HORA DEL ÚLTIMO CLIENTE</div>
          <div className="mono" style={{ fontSize: 16 }}>{horaUltimoCliente || "—"}</div>
        </div>
        <div className="card" style={{ padding: 12, flex: "1 1 100%" }}>
          <div style={{ fontSize: 10, color: "#9AA7BD" }}>HORA EN QUE TERMINÓ LA RUTA (REGRESO A CLO)</div>
          <div className="mono" style={{ fontSize: 16 }}>{horaFinRuta || "—"}</div>
        </div>
        <div className="card" style={{ padding: 12, flex: "1 1 100%" }}>
          <div style={{ fontSize: 10, color: "#9AA7BD" }}>TIEMPO TOTAL EN RUTA</div>
          <div className="mono" style={{ fontSize: 16, color: msEnRuta != null && msEnRuta > UMBRAL_MS_EN_RUTA ? "#FF6B6B" : "#3DDC97" }}>{msEnRuta != null ? formatCrono(msEnRuta) : "—"}</div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#9AA7BD", marginTop: 22 }}>INDICADORES DE VISITAS</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, textAlign: "left" }}>
        <div className="card" style={{ padding: 14, flex: "1 1 45%", minWidth: 140 }}>
          <div style={{ fontSize: 11, color: "#9AA7BD" }}>VISITAS TOTALES</div>
          <div className="mono" style={{ fontSize: 22 }}>{todos.length}</div>
        </div>
        <div className={`card ${visitasEfectivasBajoUmbral ? "card-alerta-intensa" : ""}`} style={{ padding: 14, flex: "1 1 45%", minWidth: 140 }}>
          <div style={{ fontSize: 11, color: "#9AA7BD" }}>VISITAS EFECTIVAS</div>
          <div className="mono" style={{ fontSize: 22, color: visitasEfectivasBajoUmbral ? "#FF0000" : "#3DDC97" }}>{visitasEfectivas}</div>
          {umbralVisitasMC != null && (
            <div style={{ fontSize: 10, color: visitasEfectivasBajoUmbral ? "#FF6B6B" : "#9AA7BD", marginTop: 2 }}>Meta: más de {umbralVisitasMC}</div>
          )}
        </div>
        <div className="card" style={{ padding: 14, flex: "1 1 45%", minWidth: 140 }}>
          <div style={{ fontSize: 11, color: "#9AA7BD" }}>VOLUMEN TOTAL</div>
          <div className="mono" style={{ fontSize: 22, color: "#F2B134" }}>{unidades(volumenTotal)}</div>
        </div>
        <div className="card" style={{ padding: 14, flex: "1 1 45%", minWidth: 140 }}>
          <div style={{ fontSize: 11, color: "#9AA7BD" }}>ESTANCIA &lt; 3 MIN</div>
          <div className="mono" style={{ fontSize: 22, color: menores3.length > 0 ? "#FF6B6B" : "#3DDC97" }}>{menores3.length}</div>
        </div>
        <div className="card" style={{ padding: 14, flex: "1 1 45%", minWidth: 140 }}>
          <div style={{ fontSize: 11, color: "#9AA7BD" }}>INICIO NO-GPS</div>
          <div className="mono" style={{ fontSize: 22, color: noGps > 0 ? "#FF6B6B" : "#3DDC97" }}>{noGps} / {todos.length}</div>
        </div>
        <div className="card" style={{ padding: 14, flex: "1 1 45%", minWidth: 140 }}>
          <div style={{ fontSize: 11, color: "#9AA7BD" }}>VENTA 0.3</div>
          <div className="mono" style={{ fontSize: 22 }}>{clientesVolumen03.length}</div>
        </div>
        <div className="card" style={{ padding: 14, flex: "1 1 45%", minWidth: 140 }}>
          <div style={{ fontSize: 11, color: "#9AA7BD" }}>CON DESCUENTO</div>
          <div className="mono" style={{ fontSize: 22 }}>{clientesConDescuento.length}</div>
        </div>
      </div>

      {vendedorStats && (() => {
        // Marcas estratégicas = suma de lo vendido HOY en las 4 marcas de la
        // pestaña DÍA (Ice Mix + Bloss Mix + Summ Mix + Faronet), no el
        // campo "estrategica" de ventas del periodo (ese nunca se marca en
        // ningún lado, por eso siempre salía en 0).
        const marcasEstrategicasHoy = MARCAS_DIA.reduce((s, m) => s + (vendedorStats.hoy?.marcas?.[m.key]?.vendido || 0), 0);
        return (
        <>
          <div style={{ fontSize: 12, color: "#9AA7BD", marginTop: 22 }}>VENTAS DEL PERIODO (ESTA RUTA)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, textAlign: "left" }}>
            <div className="card" style={{ padding: 14, flex: "1 1 45%", minWidth: 140 }}>
              <div style={{ fontSize: 11, color: "#9AA7BD" }}>MARCAS ESTRATÉGICAS (HOY)</div>
              <div className="mono" style={{ fontSize: 22, color: "#F2B134" }}>{unidades(marcasEstrategicasHoy)}</div>
            </div>
            <div className="card" style={{ padding: 14, flex: "1 1 45%", minWidth: 140 }}>
              <div style={{ fontSize: 11, color: "#9AA7BD" }}>OTC · DESEMPEÑO DEL DÍA</div>
              <div className="mono" style={{ fontSize: 18, color: metaColor(vendedorStats.hoy?.otc?.vendido, vendedorStats.hoy?.otc?.objetivo) }}>
                {money(vendedorStats.hoy?.otc?.vendido)} / {money(vendedorStats.hoy?.otc?.objetivo)}
              </div>
            </div>
            {vendedorStats.hoy && (
              <div className="card" style={{ padding: 14, flex: "1 1 45%", minWidth: 140 }}>
                <div style={{ fontSize: 11, color: "#9AA7BD" }}>¿VENDIÓ SIN VUALA?</div>
                <div className="mono" style={{ fontSize: 18, color: vendedorStats.hoy.otcSinVuala.cumple ? "#3DDC97" : "#FF6B6B" }}>
                  {vendedorStats.hoy.otcSinVuala.cumple ? "Sí" : "No"} · {vendedorStats.hoy.otcSinVuala.piezas} pza.
                </div>
              </div>
            )}
            {vendedorStats.hoy && (
              <div className="card" style={{ padding: 14, flex: "1 1 100%" }}>
                <div style={{ fontSize: 11, color: "#9AA7BD" }}>CALIFICACIÓN · EFECTIVIDAD DEL DÍA (TODOS LOS INDICADORES)</div>
                <div className="mono" style={{ fontSize: 22, color: vendedorStats.hoy.efectividadPct >= 80 ? "#3DDC97" : vendedorStats.hoy.efectividadPct >= 50 ? "#F2B134" : "#FF6B6B" }}>
                  {vendedorStats.hoy.efectividadPct.toFixed(0)}%
                </div>
              </div>
            )}
          </div>
        </>
        );
      })()}

      {resumenPedidos && (
        <div style={{ marginTop: 22, textAlign: "left" }}>
          <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>PEDIDOS DEL DÍA</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: resumenPedidos.motivos.length > 0 ? 14 : 0 }}>
            <div className="card" style={{ padding: 14, flex: "1 1 30%", minWidth: 120 }}>
              <div style={{ fontSize: 11, color: "#9AA7BD" }}>PEDIDOS TOTALES</div>
              <div className="mono" style={{ fontSize: 22 }}>{resumenPedidos.totalPedidos}</div>
            </div>
            <div className="card" style={{ padding: 14, flex: "1 1 30%", minWidth: 120 }}>
              <div style={{ fontSize: 11, color: "#9AA7BD" }}>ENTREGADOS</div>
              <div className="mono" style={{ fontSize: 22, color: resumenPedidos.entregados < resumenPedidos.totalPedidos ? "#FF6B6B" : "#3DDC97" }}>{resumenPedidos.entregados}</div>
            </div>
            <div className="card" style={{ padding: 14, flex: "1 1 30%", minWidth: 120 }}>
              <div style={{ fontSize: 11, color: "#9AA7BD" }}>PENDIENTES</div>
              <div className="mono" style={{ fontSize: 22, color: resumenPedidos.pendientes > 0 ? "#F2B134" : "#3DDC97" }}>{resumenPedidos.pendientes}</div>
            </div>
            <div className="card" style={{ padding: 14, flex: "1 1 30%", minWidth: 120 }}>
              <div style={{ fontSize: 11, color: "#9AA7BD" }}>RECHAZADOS EN REPARTO</div>
              <div className="mono" style={{ fontSize: 22, color: resumenPedidos.rechazados > 0 ? "#FF6B6B" : "#3DDC97" }}>{resumenPedidos.rechazados}</div>
            </div>
            <div className="card" style={{ padding: 14, flex: "1 1 30%", minWidth: 120 }}>
              <div style={{ fontSize: 11, color: "#9AA7BD" }}>CAMBIO CONTADO</div>
              <div className="mono" style={{ fontSize: 22, color: "#F2B134" }}>{resumenPedidos.cambioContado}</div>
            </div>
            <div className="card" style={{ padding: 14, flex: "1 1 100%" }}>
              <div style={{ fontSize: 11, color: "#9AA7BD" }}>PAQUETES · PEDIDO VS ENTREGADO</div>
              <div className="mono" style={{ fontSize: 18, color: resumenPedidos.totalPaquetesEntregado >= resumenPedidos.totalPaquetesPedido ? "#3DDC97" : "#FF6B6B" }}>
                {unidades(resumenPedidos.totalPaquetesPedido)} / {unidades(resumenPedidos.totalPaquetesEntregado)}
              </div>
            </div>

          </div>
          {resumenPedidos.motivos.length > 0 && (
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: "#9AA7BD", marginBottom: 8, fontWeight: 700 }}>MOTIVOS DE RECHAZO / CAMBIO ({resumenPedidos.motivos.length})</div>
              {resumenPedidos.motivos.map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderTop: i > 0 ? "1px solid #1E2A42" : "none", gap: 8 }}>
                  <span>{m.cliente}</span>
                  <span className="mono" style={{ color: "#F2B134", textAlign: "right" }}>{m.motivo}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 22, textAlign: "left" }}>
        <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>TOP CLIENTES · MAYOR ESTANCIA</div>
        {top5.slice(0, 3).map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
            <span>{i + 1}. {r.cliente}</span>
            <span className="mono">{r.tiempoEstancia} min</span>
          </div>
        ))}
      </div>

      {(() => {
        const clientesAlerta = todos
          .filter((r) => r.alerta)
          .slice()
          .sort((a, b) => a.tiempoEstancia - b.tiempoEstancia); // los más graves (menor estancia) primero
        if (clientesAlerta.length === 0) return null;
        const LIMITE_CAPTURA = 40;
        const mostrados = clientesAlerta.slice(0, LIMITE_CAPTURA);
        const restantes = clientesAlerta.length - mostrados.length;
        return (
          <div style={{ marginTop: 22, textAlign: "left" }}>
            <div style={{ fontSize: 12, color: "#FF6B6B", marginBottom: 8, fontWeight: 700 }}>
              CLIENTES EN ALERTA ({clientesAlerta.length}) · ESTANCIA &lt; 3 MIN O INICIO NO-GPS
            </div>
            <div className="card" style={{ padding: 12 }}>
              {mostrados.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", justifyContent: "space-between", fontSize: 12, color: "#FF6B6B",
                    padding: "6px 0", borderTop: i > 0 ? "1px solid #3a1414" : "none",
                  }}
                >
                  <span>{r.cliente}</span>
                  <span className="mono">{r.tiempoEstancia} min · {r.tipoInicio || "SIN DATO"}</span>
                </div>
              ))}
              {restantes > 0 && (
                <div style={{ fontSize: 11, color: "#9AA7BD", paddingTop: 8, borderTop: "1px solid #3a1414" }}>
                  + {restantes} más (se muestran los {LIMITE_CAPTURA} más graves; ve el detalle completo en la app)
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// Busca, en el panel de Tiempos (otro proyecto de Supabase), los horarios de
// "Ingreso a CLO" y "Salida a ruta" para una ruta y fecha dadas. Primero
// revisa el día activo; si no coincide, busca en el historial de Tiempos.
async function buscarTiemposParaRutaFecha(rutaCodigo, fecha) {
  try {
    const { data: activoRow } = await supabaseTiempos.from("panel_kv").select("value").eq("key", "board-activo").maybeSingle();
    if (activoRow?.value?.fecha === fecha && activoRow.value.rutas?.[rutaCodigo]) {
      return activoRow.value.rutas[rutaCodigo].areas;
    }
    const { data: histRow } = await supabaseTiempos.from("panel_kv").select("value").eq("key", "historial-rutas").maybeSingle();
    const historial = Array.isArray(histRow?.value) ? histRow.value : [];
    const encontrado = historial.find((h) => h.fecha === fecha && h.ruta === rutaCodigo);
    return encontrado ? encontrado.areas : null;
  } catch (e) {
    console.error("Error consultando Tiempos:", e);
    return null;
  }
}


export default function MesaControlView({ data, analisis, nombreRuta, nombreVendedor, revisor, vendedorStats, resumenPedidos, visitasVsObjetivo, mesaControl }) {
  const [modoCaptura, setModoCaptura] = useState(false);
  const [tiempos, setTiempos] = useState(null);
  const [tiemposCargando, setTiemposCargando] = useState(true);
  const [generandoImagen, setGenerandoImagen] = useState(false);
  const [imagenLista, setImagenLista] = useState(null); // { blob, nombreArchivo, url }
  const [errorImagen, setErrorImagen] = useState(null);
  const [faltantesInfo, setFaltantesInfo] = useState(null);
  const [faltantesCargando, setFaltantesCargando] = useState(false);

  useEffect(() => {
    let activo = true;
    const fecha = analisis?.fecha || todayISO();
    if (!nombreRuta) {
      setFaltantesInfo(null);
      return;
    }
    setFaltantesCargando(true);
    calcularClientesFaltantes(nombreRuta, mesaControl, fecha).then((res) => {
      if (activo) {
        setFaltantesInfo(res);
        setFaltantesCargando(false);
      }
    });
    return () => { activo = false; };
  }, [nombreRuta, mesaControl, analisis?.fecha]);
  const capturaRef = useRef(null);

  const [mostrarDetalleSalida, setMostrarDetalleSalida] = useState(false);
  const [mostrarDetalleCreditos, setMostrarDetalleCreditos] = useState(false);

  // Créditos vencidos de ESTA ruta — se calcula del mismo archivo de
  // cartera que ya carga el Staff en la pestaña "Créditos" (data.carteraVencida),
  // filtrado al código de esta ruta (ej. "J201").
  const codigoRutaCredito = (nombreRuta || "").replace("RUTA ", "").trim();
  const creditosVencidos = useMemo(() => {
    const hoy = new Date();
    const registros = data?.carteraVencida?.registros || [];
    let cantidad = 0;
    let monto = 0;
    const detalle = [];
    for (const r of registros) {
      if (r.rutaCodigo !== codigoRutaCredito) continue;
      if (!esDeEsteAno(r, hoy)) continue;
      if (!esVencido(r)) continue;
      cantidad += 1;
      monto += r.saldo;
      detalle.push(r);
    }
    detalle.sort((a, b) => a.vence - b.vence);
    return { cantidad, monto, detalle };
  }, [data?.carteraVencida?.registros, codigoRutaCredito]);


  useEffect(() => {
    let activo = true;
    setTiemposCargando(true);
    const codigo = (nombreRuta || "").replace("RUTA ", "").trim();
    const fecha = analisis?.fecha;
    if (!codigo || !fecha) {
      setTiempos(null);
      setTiemposCargando(false);
      return;
    }
    buscarTiemposParaRutaFecha(codigo, fecha).then((areas) => {
      if (activo) {
        setTiempos(areas);
        setTiemposCargando(false);
      }
    });
    return () => { activo = false; };
  }, [nombreRuta, analisis?.fecha]);

  // Al entrar a modo captura, genera la imagen. En escritorio la descarga
  // sola de una vez (como ya funcionaba antes). En celular, la deja lista y
  // aparece un botón para que el usuario la guarde/comparta con un toque
  // directo (Web Share API exige un gesto real del usuario para funcionar).
  useEffect(() => {
    if (!modoCaptura || !analisis) {
      setImagenLista(null);
      setErrorImagen(null);
      return;
    }
    let cancelado = false;
    setGenerandoImagen(true);
    setErrorImagen(null);
    setImagenLista(null);
    const t = setTimeout(async () => {
      try {
        if (!capturaRef.current || cancelado) return;
        if (document.fonts && document.fonts.ready) {
          try {
            await Promise.race([document.fonts.ready, new Promise((res) => setTimeout(res, 2000))]);
          } catch (e) { /* seguir de todos modos */ }
        }
        // Límite de tiempo de seguridad: si html2canvas se cuelga (rutas con
        // muchos clientes en alerta pueden tardar demasiado o trabar la
        // pestaña), se aborta con un error visible en vez de dejar la
        // pantalla en blanco para siempre.
        const canvas = await Promise.race([
          html2canvas(capturaRef.current, {
            backgroundColor: "#0B1220",
            scale: 1.3,
            useCORS: true,
            onclone: (_clonedDoc, clonedEl) => {
              try {
                sanearColoresParaCaptura(capturaRef.current, clonedEl);
              } catch (e) {
                console.warn("No se pudieron normalizar los colores para la captura:", e);
              }
            },
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Tardó demasiado en generarse (más de 20s). Prueba con una ruta con menos clientes en alerta.")), 20000)),
        ]);
        if (cancelado) return;
        const nombreArchivo = `mesa_control_${(nombreRuta || "ruta").replace(/\s+/g, "_")}_${analisis.fecha}.png`;

        canvas.toBlob((blob) => {
          if (!blob || cancelado) return;
          const url = URL.createObjectURL(blob);
          setImagenLista({ blob, nombreArchivo, url });
        }, "image/png");
      } catch (e) {
        console.error("No se pudo generar la imagen:", e);
        if (!cancelado) setErrorImagen(e?.message || "No se pudo generar la imagen.");
      } finally {
        if (!cancelado) setGenerandoImagen(false);
      }
    }, 250); // pequeño respiro para que el DOM termine de pintar el resumen
    return () => { cancelado = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoCaptura, analisis, nombreRuta]);

  // Libera el Object URL cuando ya no se necesita (se generó uno nuevo, se
  // salió de modo captura, o se desmonta el componente).
  useEffect(() => {
    return () => {
      if (imagenLista?.url) URL.revokeObjectURL(imagenLista.url);
    };
  }, [imagenLista]);

  // Se llama DIRECTO desde el onClick del botón (gesto de usuario real), para
  // que el share sheet funcione de forma confiable en celular (sobre todo
  // iOS Safari, donde si no viene de un toque directo no pasa nada visible).
  async function guardarOCompartirImagen() {
    if (!imagenLista) return;
    const { blob, nombreArchivo, url } = imagenLista;
    const archivo = new File([blob], nombreArchivo, { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: nombreArchivo });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return; // el usuario canceló el share
        console.warn("Share falló, cae a descarga tradicional:", err);
      }
    }

    const link = document.createElement("a");
    link.download = nombreArchivo;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (!analisis) {
    return (
      <div>
        <div className="card" style={{ padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{nombreRuta}{nombreVendedor ? ` · ${nombreVendedor}` : ""}</div>
          {revisor && <div style={{ fontSize: 12, color: "#9AA7BD", marginTop: 2 }}>Revisó: {revisor}</div>}
        </div>
        <div className="card" style={{ padding: 24, textAlign: "center", color: "#9AA7BD" }}>
          No hay datos de mesa de control cargados para {nombreRuta || "esta ruta"}.
        </div>
      </div>
    );
  }
  const { fecha, horaInicio, top5, menores3, tipoInicioConteo, tipoFinConteo, volumenTotal, clientesVolumen03, clientesConDescuento, todos, visitasEfectivas } = analisis;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        {modoCaptura && generandoImagen && <span style={{ fontSize: 12, color: "#9AA7BD" }}>Generando imagen...</span>}
        {modoCaptura && imagenLista && (
          <button className="btn" onClick={guardarOCompartirImagen}>
            <Download size={14} style={{ verticalAlign: "-2px" }} /> Guardar imagen
          </button>
        )}
        <button className="btn-ghost" onClick={() => setModoCaptura((m) => !m)}>
          {modoCaptura ? "Ver detalle completo" : "Ver resumen (imagen)"}
        </button>
      </div>
      {modoCaptura && imagenLista && (
        <div style={{ fontSize: 11, color: "#9AA7BD", marginBottom: 12, textAlign: "right" }}>
          Toca "Guardar imagen" — te va a dejar elegir guardarla en tu galería/fotos.
        </div>
      )}
      {modoCaptura && errorImagen && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#3a1414", border: "1px solid #FF6B6B", color: "#FF6B6B", fontSize: 12, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
          <AlertCircle size={14} /> No se pudo generar la imagen: {errorImagen}
        </div>
      )}

      {modoCaptura ? (
        <div ref={capturaRef}>
          <MesaControlResumenCaptura analisis={analisis} nombreRuta={nombreRuta} nombreVendedor={nombreVendedor} revisor={revisor} tiempos={tiempos} vendedorStats={vendedorStats} resumenPedidos={resumenPedidos} visitasVsObjetivo={visitasVsObjetivo} />
        </div>
      ) : (
        <>
      <div className="card" style={{ padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{nombreRuta}{nombreVendedor ? ` · ${nombreVendedor}` : ""}</div>
        {revisor && <div style={{ fontSize: 12, color: "#9AA7BD", marginTop: 2 }}>Revisó: {revisor}</div>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <KpiCard icon={<Calendar size={14} />} label="Fecha evaluada" value={fecha} />
        <KpiCard icon={<Clock size={14} />} label="Hora de inicio" value={horaInicio || "—"} />
        <KpiCard icon={<Target size={14} />} label="Volumen total" value={unidades(volumenTotal)} accent="#F2B134" />
        <KpiCard icon={<AlertCircle size={14} />} label="Visitas < 3 min" value={menores3.length} accent={menores3.length > 0 ? "#FF6B6B" : "#3DDC97"} />
        <KpiCard icon={<MapPin size={14} />} label="Visitas efectivas" value={visitasEfectivas} />
        <div
          onClick={() => creditosVencidos.detalle.length > 0 && setMostrarDetalleCreditos((m) => !m)}
          style={{ cursor: creditosVencidos.detalle.length > 0 ? "pointer" : "default", position: "relative" }}
        >
          <KpiCard
            icon={<CreditCard size={14} />}
            label="Créditos vencidos"
            value={`${creditosVencidos.cantidad} · ${money(creditosVencidos.monto)}`}
            accent={creditosVencidos.cantidad > 0 ? "#FF6B6B" : "#3DDC97"}
          />
          {creditosVencidos.detalle.length > 0 && (
            <span style={{ position: "absolute", top: 8, right: 8 }}>
              {mostrarDetalleCreditos ? <ChevronUp size={13} color="#9AA7BD" /> : <ChevronDown size={13} color="#9AA7BD" />}
            </span>
          )}
        </div>
        {vendedorStats?.hoy && (
          <KpiCard
            icon={<Star size={14} />}
            label="Calificación · Efectividad del día"
            value={`${vendedorStats.hoy.efectividadPct.toFixed(0)}%`}
            accent={vendedorStats.hoy.efectividadPct >= 80 ? "#3DDC97" : vendedorStats.hoy.efectividadPct >= 50 ? "#F2B134" : "#FF6B6B"}
          />
        )}
      </div>

      {mostrarDetalleCreditos && creditosVencidos.detalle.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div className="display" style={{ fontSize: 13, marginBottom: 10, color: "#9AA7BD" }}>
            DETALLE · CRÉDITOS VENCIDOS ({creditosVencidos.detalle.length})
          </div>
          {creditosVencidos.detalle.map((r, i) => {
            const dias = diasParaVencer(r.vence);
            return (
              <div
                key={i}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                  padding: "8px 0", borderTop: i > 0 ? "1px solid #1E2A42" : "none", fontSize: 12.5,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "#E8EDF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.clienteNombre}
                  </div>
                  <div style={{ color: "#9AA7BD", fontSize: 11 }}>
                    {r.documento} · Día de visita: {diaDeVisita(r.fecha)} ({r.fecha ? r.fecha.toLocaleDateString("es-MX") : "—"}) · Vence {r.vence ? r.vence.toLocaleDateString("es-MX") : "—"}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div className="mono" style={{ color: "#FF6B6B", fontWeight: 700 }}>{money(r.saldo)}</div>
                  <div style={{ fontSize: 10.5, color: "#FF6B6B" }}>
                    {dias != null ? `${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"} vencido` : "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {vendedorStats?.hoy && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div className="display" style={{ fontSize: 14, marginBottom: 12, color: "#9AA7BD" }}>VENTAS DEL DÍA (ESTA RUTA)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {vendedorStats.hoy.volumen && (
              <KpiCard
                icon={<Target size={14} />}
                label="Volumen (hoy)"
                value={`${unidades(vendedorStats.hoy.volumen.vendido)} / ${unidades(vendedorStats.hoy.volumen.objetivo)}`}
                accent={metaColor(vendedorStats.hoy.volumen.vendido, vendedorStats.hoy.volumen.objetivo)}
              />
            )}
            {MARCAS_DIA.map((m) => {
              const marca = vendedorStats.hoy.marcas?.[m.key];
              if (!marca) return null;
              return (
                <KpiCard
                  key={m.key}
                  icon={<Star size={14} />}
                  label={m.label || m.key}
                  value={`${unidades(marca.vendido)} / ${unidades(marca.objetivo)}`}
                  accent={metaColor(marca.vendido, marca.objetivo)}
                />
              );
            })}
            <KpiCard
              icon={<Star size={14} />}
              label="OTC"
              value={`${money(vendedorStats.hoy.otc?.vendido)} / ${money(vendedorStats.hoy.otc?.objetivo)}`}
              accent={metaColor(vendedorStats.hoy.otc?.vendido, vendedorStats.hoy.otc?.objetivo)}
            />
            {vendedorStats.hoy.otcSinVuala && (
              <KpiCard
                icon={<Star size={14} />}
                label="¿Vendió sin Vuala?"
                value={`${vendedorStats.hoy.otcSinVuala.cumple ? "Sí" : "No"} · ${vendedorStats.hoy.otcSinVuala.piezas} pza.`}
                accent={vendedorStats.hoy.otcSinVuala.cumple ? "#3DDC97" : "#FF6B6B"}
              />
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="display" style={{ fontSize: 14, marginBottom: 12, color: "#9AA7BD" }}>TIEMPOS · INGRESO Y SALIDA A RUTA</div>
        {tiemposCargando ? (
          <div style={{ fontSize: 13, color: "#9AA7BD" }}>Consultando panel de Tiempos...</div>
        ) : !tiempos ? (
          <div style={{ fontSize: 13, color: "#9AA7BD" }}>No hay registro de Tiempos para esta ruta en esta fecha.</div>
        ) : (() => {
          const horaIngresoClo = formatHoraTiempos(tiempos.ingreso_clo?.ts);
          const horaSalidaRuta = formatHoraTiempos(tiempos.salida_ruta?.ts);
          const msEnRutaDetalle = tiempos?.salida_ruta?.ts && tiempos?.ingreso_clo_fin?.ts
            ? tiempos.ingreso_clo_fin.ts - tiempos.salida_ruta.ts
            : null;

          // Positivo = la primera visita se registró DESPUÉS de salida a
          // ruta (orden normal — el número son los minutos que tardó en
          // llegar/registrar). Negativo = la primera visita se registró
          // ANTES de que se marcara salida a ruta (anómalo: el vendedor
          // abrió una visita sin haber salido a ruta todavía).
          const minDespuesDeSalida = diferenciaMinutos(horaSalidaRuta, horaInicio);
          const esAntesDeSalida = minDespuesDeSalida != null && minDespuesDeSalida < 0;
          const magnitudMin = minDespuesDeSalida != null ? Math.abs(minDespuesDeSalida) : null;
          // Antes de salida a ruta: alerta desde el minuto 1 (no debería
          // pasar nunca). Después de salida a ruta: margen de 45 min.
          const salidaEnAlerta = minDespuesDeSalida == null ? false : esAntesDeSalida ? true : magnitudMin > 45;

          const minutosSalida = horaAMinutos(horaSalidaRuta);
          // Visitas registradas antes de que se marcara "salida a ruta" —
          // esto es lo que dispara la alerta "antes" (puede ser más de una).
          const visitasAntesDeSalida = minutosSalida != null
            ? todos
                .filter((r) => { const m = horaAMinutos(r.inicio); return m != null && m < minutosSalida; })
                .sort((a, b) => horaAMinutos(a.inicio) - horaAMinutos(b.inicio))
            : [];
          const primeraVisita = todos.length > 0
            ? todos.slice().sort((a, b) => (horaAMinutos(a.inicio) ?? 99999) - (horaAMinutos(b.inicio) ?? 99999))[0]
            : null;
          const visitasParaDetalle = visitasAntesDeSalida.length > 0 ? visitasAntesDeSalida : (primeraVisita ? [primeraVisita] : []);

          return (
            <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <KpiCard icon={<Truck size={14} />} label="Ingreso a CLO" value={horaIngresoClo || "—"} />
              <KpiCard icon={<Clock size={14} />} label="Salida a ruta" value={horaSalidaRuta || "—"} />
              <div
                onClick={() => visitasParaDetalle.length > 0 && setMostrarDetalleSalida((m) => !m)}
                style={{
                  cursor: visitasParaDetalle.length > 0 ? "pointer" : "default",
                  position: "relative",
                  ...(salidaEnAlerta ? { border: "1.5px solid #FF6B6B", borderRadius: 14, boxShadow: "0 0 0 1px #FF6B6B33" } : {}),
                }}
              >
                <KpiCard
                  icon={<AlertCircle size={14} />}
                  label="Salida a ruta vs. inicio de ruta"
                  value={magnitudMin == null ? "—" : `${magnitudMin} min ${esAntesDeSalida ? "antes" : "después"}`}
                  accent={magnitudMin == null ? undefined : salidaEnAlerta ? "#FF6B6B" : "#3DDC97"}
                />
                {visitasParaDetalle.length > 0 && (
                  <span style={{ position: "absolute", top: 8, right: 8 }}>
                    {mostrarDetalleSalida ? <ChevronUp size={13} color="#9AA7BD" /> : <ChevronDown size={13} color="#9AA7BD" />}
                  </span>
                )}
              </div>
              <KpiCard
                icon={<Clock size={14} />}
                label="Tiempo total en ruta"
                value={msEnRutaDetalle != null ? formatCrono(msEnRutaDetalle) : "—"}
                accent={msEnRutaDetalle == null ? undefined : msEnRutaDetalle > UMBRAL_MS_EN_RUTA ? "#FF6B6B" : "#3DDC97"}
              />
            </div>

            {mostrarDetalleSalida && visitasParaDetalle.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="display" style={{ fontSize: 12.5, marginBottom: 8, color: "#9AA7BD" }}>
                  {visitasAntesDeSalida.length > 0
                    ? `DETALLE · VISITAS ABIERTAS ANTES DE SALIDA A RUTA (${visitasAntesDeSalida.length})`
                    : "DETALLE · PRIMERA VISITA DEL DÍA"}
                </div>
                {visitasParaDetalle.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                      padding: "8px 0", borderTop: i > 0 ? "1px solid #1E2A42" : "none", fontSize: 12.5,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "#E8EDF5" }}>{r.cliente}</div>
                      <div style={{ color: "#9AA7BD", fontSize: 11 }}>
                        Apertura: {r.inicio || "—"} · Tipo de apertura: {r.tipoInicio || "SIN DATO"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div className="mono" style={{ color: r.volumen > 0 ? "#3DDC97" : "#FF6B6B", fontWeight: 700 }}>
                        {r.volumen > 0 ? "Con venta" : "Sin venta"}
                      </div>
                      {r.volumen > 0 && <div style={{ fontSize: 10.5, color: "#9AA7BD" }}>{unidades(r.volumen)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            </>
          );
        })()}
        <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 8 }}>
          "Antes" = se registró una visita sin haber marcado salida a ruta todavía (alerta inmediata). "Después" = orden normal; se marca en rojo solo si pasaron más de 45 min entre la salida y la primera visita.
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="display" style={{ fontSize: 14, marginBottom: 12, color: "#9AA7BD" }}>TIPO DE INICIO / CIERRE</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 6 }}>Inicio (apertura)</div>
            {Object.entries(tipoInicioConteo).map(([k, v]) => (
              <div key={k} style={{ fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: k !== "GPS" ? "#FF6B6B" : "#E8EDF5" }}>{k}</span>: <span className="mono">{v}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 6 }}>Cierre</div>
            {Object.entries(tipoFinConteo).map(([k, v]) => (
              <div key={k} style={{ fontSize: 13, marginBottom: 4 }}>
                <span>{k}</span>: <span className="mono">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {resumenPedidos && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div className="display" style={{ fontSize: 14, marginBottom: 12, color: "#9AA7BD" }}>PEDIDOS DEL DÍA</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: resumenPedidos.motivos.length > 0 ? 16 : 0 }}>
            <KpiCard icon={<Target size={14} />} label="Pedidos totales" value={resumenPedidos.totalPedidos} />
            <KpiCard icon={<CheckCircle2 size={14} />} label="Entregados" value={resumenPedidos.entregados} accent={resumenPedidos.entregados < resumenPedidos.totalPedidos ? "#FF6B6B" : "#3DDC97"} />
            <KpiCard icon={<Clock size={14} />} label="Pendientes" value={resumenPedidos.pendientes} accent={resumenPedidos.pendientes > 0 ? "#F2B134" : "#3DDC97"} />
            <KpiCard icon={<AlertCircle size={14} />} label="Rechazados en reparto" value={resumenPedidos.rechazados} accent={resumenPedidos.rechazados > 0 ? "#FF6B6B" : "#3DDC97"} />
            <KpiCard icon={<Ticket size={14} />} label="Cambio contado" value={resumenPedidos.cambioContado} accent="#F2B134" />
            <KpiCard
              icon={<Target size={14} />}
              label="Paquetes pedido / entregado"
              value={`${unidades(resumenPedidos.totalPaquetesPedido)} / ${unidades(resumenPedidos.totalPaquetesEntregado)}`}
              accent={resumenPedidos.totalPaquetesEntregado >= resumenPedidos.totalPaquetesPedido ? "#3DDC97" : "#FF6B6B"}
            />

          </div>
          {resumenPedidos.motivos.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8, fontWeight: 700 }}>MOTIVOS DE RECHAZO / CAMBIO ({resumenPedidos.motivos.length})</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 420 }}>
                  <thead>
                    <tr style={{ color: "#9AA7BD", textAlign: "left" }}>
                      <th style={{ padding: "6px 0" }}>Cliente</th>
                      <th>Estatus</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumenPedidos.motivos.map((m, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #1E2A42" }}>
                        <td style={{ padding: "6px 0" }}>{m.cliente}</td>
                        <td>{m.status}</td>
                        <td className="mono" style={{ color: "#F2B134" }}>{m.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="display" style={{ fontSize: 14, marginBottom: 12, color: "#9AA7BD" }}>
          CLIENTES NO VISITADOS {faltantesInfo?.dia ? `(${faltantesInfo.dia})` : ""}
        </div>

        {faltantesCargando && (
          <div style={{ fontSize: 13, color: "#9AA7BD" }}>Cargando lista de clientes…</div>
        )}

        {!faltantesCargando && faltantesInfo && (
          <>
            <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: "#9AA7BD" }}>Debía visitar</div>
                <div className="mono" style={{ fontSize: 22 }}>{faltantesInfo.totalDebia}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#9AA7BD" }}>Visitados (Mesa Control)</div>
                <div className="mono" style={{ fontSize: 22, color: "#3DDC97" }}>{faltantesInfo.totalVisitados}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#9AA7BD" }}>Faltantes</div>
                <div className="mono" style={{ fontSize: 22, color: faltantesInfo.faltantes.length > 0 ? "#FF6B6B" : "#3DDC97" }}>
                  {faltantesInfo.faltantes.length}
                </div>
              </div>
            </div>

            {faltantesInfo.error && (
              <div style={{ fontSize: 13, color: "#FF6B6B", marginBottom: 10 }}>
                Error Supabase: {faltantesInfo.error}
              </div>
            )}

            {!faltantesInfo.error && faltantesInfo.totalDebia === 0 && (
              <div style={{ fontSize: 13, color: "#F2B134", marginBottom: 10 }}>
                No hay clientes en clientes_ruta para esta ruta/día.
                {faltantesInfo.totalEnRuta != null && (
                  <span> (La ruta tiene {faltantesInfo.totalEnRuta} clientes en total en la tabla)</span>
                )}
                {" "}Revisa en Supabase que existan filas con esa ruta y día.
              </div>
            )}

            {faltantesInfo.totalDebia > 0 && faltantesInfo.faltantes.length === 0 ? (
              <div style={{ fontSize: 14, color: "#3DDC97" }}>
                <CheckCircle2 size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                Todos los clientes del día fueron visitados
              </div>
            ) : faltantesInfo.faltantes.length > 0 ? (
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                {faltantesInfo.faltantes.map((c, i) => (
                  <div key={c.codigo_cliente} style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    padding: "6px 0", 
                    borderBottom: "1px solid #1E2A42",
                    fontSize: 13 
                  }}>
                    <span>{i + 1}. {c.nombre}</span>
                    <span className="mono" style={{ color: "#9AA7BD", marginLeft: 12 }}>{c.codigo_cliente}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="display" style={{ fontSize: 14, marginBottom: 12, color: "#9AA7BD" }}>TOP 5 · MAYOR TIEMPO DE ESTANCIA</div>
        {top5.map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
            <span>{i + 1}. {r.cliente}</span>
            <span className="mono">{r.tiempoEstancia} min</span>
          </div>
        ))}
      </div>

      {clientesVolumen03.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div className="display" style={{ fontSize: 14, marginBottom: 12, color: "#9AA7BD" }}>CLIENTES CON VENTA DE 0.3000000 ({clientesVolumen03.length})</div>
          {clientesVolumen03.map((r, i) => (
            <div key={i} style={{ fontSize: 13, marginBottom: 4 }}>{r.cliente}</div>
          ))}
        </div>
      )}

      {clientesConDescuento.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div className="display" style={{ fontSize: 14, marginBottom: 12, color: "#9AA7BD" }}>CLIENTES CON DESCUENTO APLICADO ({clientesConDescuento.length})</div>
          {clientesConDescuento.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span>{r.cliente}</span>
              <span className="mono" style={{ color: "#F2B134" }}>{r.descuento}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="display" style={{ fontSize: 14, padding: "14px 16px 0", color: "#9AA7BD" }}>TODAS LAS VISITAS ({todos.length})</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 10, minWidth: 560 }}>
            <thead>
              <tr style={{ color: "#9AA7BD", textAlign: "left" }}>
                <th style={{ padding: "8px 16px" }}>Cliente</th>
                <th>Inicio</th>
                <th>Final</th>
                <th>Min.</th>
                <th>Inicio</th>
                <th>Cierre</th>
                <th>Volumen</th>
                <th>Desc.</th>
              </tr>
            </thead>
            <tbody>
              {todos.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid #1E2A42", color: r.alerta ? "#FF6B6B" : "#E8EDF5" }}>
                  <td style={{ padding: "8px 16px" }}>{r.cliente}</td>
                  <td>{r.inicio}</td>
                  <td>{r.final}</td>
                  <td>{r.tiempoEstancia}</td>
                  <td>{r.tipoInicio}</td>
                  <td>{r.tipoFin}</td>
                  <td>{r.volumen}</td>
                  <td>{r.descuento > 0 ? r.descuento : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
