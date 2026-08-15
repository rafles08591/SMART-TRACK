// @ts-nocheck
/* =====================================================================
   NominaView — módulo independiente de SMART-TRACK
   ---------------------------------------------------------------------
   Qué hace:
   - El Gerente carga (pegando texto desde Excel o subiendo un archivo
     .xlsx/.csv) la tabla semanal de nómina por ruta.
   - Cada ruta puede ver SU nómina de la semana y, lo más importante,
     una sección "¿Dónde está tu oportunidad?" que traduce cada
     penalización/descuento en un mensaje concreto de qué pasó y qué
     hacer para no perderlo la próxima semana.
   - Supervisor-1 y Gerente tienen además una pestaña de Resumen con
     todas las rutas ordenadas por lo que más perdieron esa semana.

   Cómo se conecta (igual que UnidadesView/MesaControlView):
     <NominaView
       data={data}                     // el objeto grande de la app
       persistFresco={persistParcialFresco}
       rol={rol}                       // 'staff' | 'vendedor' | ...
       puesto={puesto}                 // 'gerente' | 'supervisor' | null
       identidad={identidad}           // nombre de quien tiene la sesión
       rutaPropia={rutaPropia}         // solo aplica cuando rol==='vendedor'
     />

   Los datos se guardan bajo la llave `data.nominaSemanas` (arreglo de
   "semanas cargadas"), así que no hace falta ninguna tabla nueva en
   Supabase: usa el mismo JSON grande (ventas_app_state) que ya usan
   Unidades, OTC, etc.

   ⚠️ IMPORTANTE — el parser es POSICIONAL, no por nombre de columna.
   Está hecho a la medida del layout exacto de la plantilla de nómina
   que compartiste (49 columnas, con "CLO", "RUTA", "Clasificación...",
   "Sueldo Base", "Comisión Semana..." y "Penalizacion Clasico"
   repetidos porque la plantilla junta la tabla de indicadores con la
   tabla de nómina lado a lado). Si algún día cambia el orden de las
   columnas en la plantilla de Excel, hay que actualizar el arreglo
   `CAMPOS` más abajo (cada entrada trae un comentario con el
   encabezado exacto que representa).
===================================================================== */

import React, { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import {
  Wallet, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2,
  Upload, ClipboardPaste, Download, Users, Target, Gauge, MapPin,
  Info, Trash2, ChevronRight, ShieldCheck, Truck,
} from "lucide-react";

/* ---------------------------------------------------------------
   TOKENS visuales — mismos colores base del resto de SMART-TRACK
   (fondo #0B1220, ámbar #F2B134, verde #3DDC97, rojo #FF6B6B),
   pero con sus propias clases (prefijo "nm-") para que este módulo
   no dependa de nada de afuera.
------------------------------------------------------------------ */
const T = {
  bg: "#0B1220",
  card: "#111C33",
  cardSoft: "#0F1830",
  border: "#2A3852",
  ink: "#E8EDF5",
  muted: "#9AA7BD",
  primary: "#F2B134",
  primarySoft: "rgba(242,177,52,0.12)",
  ok: "#3DDC97",
  okSoft: "rgba(61,220,151,0.12)",
  warn: "#F2B134",
  warnSoft: "rgba(242,177,52,0.12)",
  bad: "#FF6B6B",
  badSoft: "rgba(255,107,107,0.12)",
  steel: "#6FA8DC",
};

/* ---------------------------------------------------------------
   Layout posicional de la plantilla (49 columnas). Cada entrada:
   [clave interna, encabezado exacto de referencia, tipo]
   tipo: "texto" | "numero" | "dinero" | "porcentaje"
------------------------------------------------------------------ */
const CAMPOS = [
  ["supervisor", "SUPERVISOR", "texto"],
  ["cloInd", "CLO", "texto"],
  ["rutaInd", "J'S", "texto"],
  ["nur", "NUR", "texto"],
  ["sueldoBaseInd", "SUELDO BASE", "dinero"],
  ["tipoRuta", "TIPO RUTA", "texto"],
  ["volSemana", "Vol Semana", "numero"],
  ["clasificacionInd", "Clasificacion Final Vendedor (VOL+ITO)", "texto"],
  ["gpsPct", "GPS", "porcentaje"],
  ["cobItoPct", "COB ITO", "porcentaje"],
  ["sinVisitaItoSemana", "SIN VISITA ITO SEMANA", "numero"],
  ["comisionSemanaInd", "Comision Semana $60c/$1.2", "dinero"],
  ["penalizacionClasicoInd", "Penalizacion Clasico", "dinero"],
  ["objetivoVisitasEfectivas", "OBJETIVO VISITAS EFECIVAS", "numero"],
  ["resultadoVisitasEfectivas", "RESULTADO VISITAS EFECTIVAS", "numero"],
  ["cobVisitasPct", "COB %", "porcentaje"],
  ["pagoVisitasEfectivas", "PAGO VISITAS EFECTIVAS $", "dinero"],
  ["cobItoSemanalPct", "COB ITO SEMANAL", "porcentaje"],
  ["realItoDiarioPct", "REAL ITO DIARIO", "porcentaje"],
  ["cobItoPct2", "COB ITO", "porcentaje"],
  ["pagoItoDiario", "PAGO ITO DIARIO", "dinero"],
  ["_spacer", "", "texto"],
  ["clo", "CLO", "texto"],
  ["ruta", "RUTA", "texto"],
  ["clasificacion", "Clasificacion Final Vendedor (VOL+ITO)", "texto"],
  ["sueldoBase", "Sueldo Base", "dinero"],
  ["comisionSemana", "Comision Semana $60c/$1.2", "dinero"],
  ["bonoDesempeno400", "BONO DESEMPEÑO $400", "dinero"],
  ["descuentoMorosidad", "Descuento por morosidad", "dinero"],
  ["nominaAPagar", "Nomina a Pagar", "dinero"],
  ["otc", "OTC", "dinero"],
  ["nominaTotal", "Nomina Total", "dinero"],
  ["vendedorAsignado", "VENDEDOR ASIGNADO A RUTA", "texto"],
  ["vendedorPagoComision", "VENDEDOR A QUIEN SE LE PAGA COMISION", "texto"],
  ["comisionRealSemanal", "COMISION REAL SEMANAL", "dinero"],
  ["sueldoSuplente", "SUELDO SUPLENTE O GARANTIZADO", "dinero"],
  ["var", "VAR", "dinero"],
  ["nmeSemanal", "NME SEMANAL", "dinero"],
  ["tipoDePago", "TIPO DE PAGO", "texto"],
  ["val", "Val", "texto"],
  ["tel", "TEL", "texto"],
  ["nominaAbandonada", "NOMINA ABANDONADA", "dinero"],
  ["penalizacionClasico", "Penalizacion Clasico", "dinero"],
  ["aprovechamientoNomina", "APROVECHAMIENTO NOMINA", "porcentaje"],
  ["tipoNominaFinal", "TIPO NOMINA FINAL", "texto"],
  ["tipoNominaFinal2", "TIPO NOMINA FINAL", "texto"],
  ["desempeno400Pct", "DESEMPEÑO $400", "porcentaje"],
  ["aprovechamientoTotal", "APROVECHAMIENTO TOTAL", "porcentaje"],
  ["nominaPerdida", "NOMINA PERDIDA", "dinero"],
];

/* ---------------------------------------------------------------
   Utilidades de formato / parseo
------------------------------------------------------------------ */
function limpiarNumero(valor) {
  if (valor === null || valor === undefined) return null;
  let s = String(valor).trim();
  if (s === "") return null;
  let negativo = false;
  if (s.includes("(") && s.includes(")")) { negativo = true; s = s.replace(/[()]/g, ""); }
  if (s.trim().startsWith("-")) negativo = true;
  const limpio = s.replace(/[$,%\s-]/g, "");
  if (limpio === "") return 0; // formato contable "$-" == 0
  const n = parseFloat(limpio);
  if (isNaN(n)) return null;
  return negativo ? -Math.abs(n) : n;
}

function money(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const val = Math.abs(n).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  return n < 0 ? `-${val}` : val;
}
function pct(n, dec = 1) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return `${n.toFixed(dec)}%`;
}
function numero(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString("es-MX");
}

function filaATextoNormalizado(valoresCrudos) {
  const out = {};
  CAMPOS.forEach(([clave, , tipo], i) => {
    if (clave === "_spacer") return;
    const crudo = valoresCrudos[i];
    if (tipo === "texto") out[clave] = crudo === undefined || crudo === null ? "" : String(crudo).trim();
    else out[clave] = limpiarNumero(crudo);
  });
  // Preferir siempre los valores de la tabla "nómina" (derecha) cuando
  // existan, porque son los oficiales; si vinieran vacíos, caer en los
  // de la tabla de indicadores (izquierda).
  const clo = out.clo || out.cloInd || "";
  const ruta = (out.ruta || out.rutaInd || "").toUpperCase().trim();
  const clasificacion = out.clasificacion || out.clasificacionInd || "";
  const sueldoBase = out.sueldoBase ?? out.sueldoBaseInd ?? null;
  const comisionSemana = out.comisionSemana ?? out.comisionSemanaInd ?? null;
  const penalizacionClasico = out.penalizacionClasico ?? out.penalizacionClasicoInd ?? null;
  const cobItoPct = out.cobItoPct2 ?? out.cobItoPct ?? null;
  const tipoNominaFinal = out.tipoNominaFinal2 || out.tipoNominaFinal || "";

  if (!ruta) return null; // fila vacía / basura

  return {
    supervisor: out.supervisor,
    clo, ruta, nur: out.nur, tipoRuta: out.tipoRuta,
    bonoPuntualidad: null, // null = sin corrección manual del Gerente; se calcula automático contra el Reloj Checador. Un número aquí significa que el Gerente lo corrigió a mano y ese valor manda siempre.
    volSemana: out.volSemana, clasificacion,
    gpsPct: out.gpsPct, cobItoPct,
    sinVisitaItoSemana: out.sinVisitaItoSemana,
    comisionSemana, penalizacionClasico,
    objetivoVisitasEfectivas: out.objetivoVisitasEfectivas,
    resultadoVisitasEfectivas: out.resultadoVisitasEfectivas,
    cobVisitasPct: out.cobVisitasPct,
    pagoVisitasEfectivas: out.pagoVisitasEfectivas,
    cobItoSemanalPct: out.cobItoSemanalPct,
    realItoDiarioPct: out.realItoDiarioPct,
    pagoItoDiario: out.pagoItoDiario,
    sueldoBase, bonoDesempeno400: out.bonoDesempeno400,
    descuentoMorosidad: out.descuentoMorosidad,
    nominaAPagar: out.nominaAPagar, otc: out.otc, nominaTotal: out.nominaTotal,
    vendedorAsignado: out.vendedorAsignado, vendedorPagoComision: out.vendedorPagoComision,
    comisionRealSemanal: out.comisionRealSemanal, sueldoSuplente: out.sueldoSuplente,
    var: out.var, nmeSemanal: out.nmeSemanal, tipoDePago: out.tipoDePago,
    val: out.val, tel: out.tel,
    nominaAbandonada: out.nominaAbandonada,
    aprovechamientoNomina: out.aprovechamientoNomina,
    tipoNominaFinal,
    desempeno400Pct: out.desempeno400Pct,
    aprovechamientoTotal: out.aprovechamientoTotal,
    nominaPerdida: out.nominaPerdida,
  };
}

function parseNominaTexto(texto) {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lineas.length < 2) return { filas: [], advertencias: ["No se encontraron filas de datos (¿pegaste solo el encabezado?)."] };
  const filas = [];
  const advertencias = [];
  for (let i = 1; i < lineas.length; i++) {
    const valores = lineas[i].split("\t");
    if (valores.length < 10) { advertencias.push(`Fila ${i + 1} ignorada: muy pocas columnas (${valores.length}).`); continue; }
    const fila = filaATextoNormalizado(valores);
    if (fila) filas.push(fila);
  }
  if (filas.length === 0) advertencias.push("No se pudo leer ninguna fila válida. Revisa que hayas copiado desde la celda de encabezado (SUPERVISOR) hasta el final de la tabla, incluyendo el encabezado.");
  return { filas, advertencias };
}

function parseNominaArchivo(filasCrudas) {
  // filasCrudas: arreglo de arreglos (sheet_to_json con header:1)
  const filas = [];
  const advertencias = [];
  for (let i = 1; i < filasCrudas.length; i++) {
    const valores = filasCrudas[i];
    if (!valores || valores.length < 10) continue;
    const fila = filaATextoNormalizado(valores);
    if (fila) filas.push(fila);
  }
  if (filas.length === 0) advertencias.push("No se pudo leer ninguna fila válida del archivo.");
  return { filas, advertencias };
}

/* ---------------------------------------------------------------
   Reglas de negocio (umbrales reales, no inventados)
------------------------------------------------------------------ */
const UMBRAL_COB_CLASICO = 98;     // % mínimo de visitas a clientes asignados de la semana para no caer en CLÁSICO
const UMBRAL_GPS_APERTURA = 91;    // % mínimo de clientes que deben abrirse por GPS
const BONO_DESEMPENO_MAXIMO = 400; // bono disponible por visitas efectivas, antes de "nómina abandonada"
const META_OTC_MINIMA = 800;       // la comisión de OTC no tiene tope; esto es solo el piso esperado
const VALOR_PENALIZACION_MOROSIDAD = 2; // $ por paquete de un cliente que no pagó a tiempo
const BONO_PUNTUALIDAD_DEFAULT = 400;   // bono semanal fijo por puntualidad y asistencia; se calcula automático contra Reloj Checador (entrada <= 7:10 a.m. los 6 días); el Gerente puede corregirlo a mano si hay una justificación.
const HORA_LIMITE_PUNTUALIDAD = "07:12:00"; // 7:13 a.m. en adelante = tarde
const NOMBRES_DIA_PUNTUALIDAD = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function sumarDiasISOLocal(fechaISO, dias) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}
function lunesDeSemanaLocal(fechaISO) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const dia = fecha.getUTCDay();
  const offset = dia === 0 ? -6 : 1 - dia;
  fecha.setUTCDate(fecha.getUTCDate() + offset);
  return fecha.toISOString().slice(0, 10);
}

// Revisa, día por día (lunes a sábado), la hora de entrada registrada en
// el Reloj Checador para esa ruta esa semana. El bono de puntualidad se
// gana completo SOLO si los 6 días tuvieron entrada a las 7:10 a.m. o
// antes — un solo día tarde (7:11+) o sin registro pierde el bono
// completo, y se listan los días exactos con el motivo.
async function evaluarPuntualidadSemana(rutaCorta, semanaInicio) {
  const rutaChecador = `RUTA ${rutaCorta}`;
  const { data, error } = await supabase
    .from("checador_marcas")
    .select("fecha, hora_entrada")
    .eq("ruta", rutaChecador)
    .gte("fecha", semanaInicio)
    .lte("fecha", sumarDiasISOLocal(semanaInicio, 5));
  if (error) throw error;
  const marcasPorFecha = {};
  (data || []).forEach((m) => { marcasPorFecha[m.fecha] = m; });
  const dias = NOMBRES_DIA_PUNTUALIDAD.map((nombre, i) => {
    const fecha = sumarDiasISOLocal(semanaInicio, i);
    const marca = marcasPorFecha[fecha];
    if (!marca || !marca.hora_entrada) {
      return { fecha, nombre, ok: false, motivo: "sin_registro" };
    }
    const ok = marca.hora_entrada <= HORA_LIMITE_PUNTUALIDAD;
    return { fecha, nombre, ok, motivo: ok ? null : "tarde", horaEntrada: marca.hora_entrada };
  });
  const diasProblema = dias.filter((d) => !d.ok);
  const bono = diasProblema.length === 0 ? BONO_PUNTUALIDAD_DEFAULT : 0;
  return { bono, dias, diasProblema };
}

/* ---------------------------------------------------------------
   Retroalimentación: traduce los números crudos en mensajes claros
------------------------------------------------------------------ */
function calcularOportunidades(f) {
  const items = [];
  if (f.penalizacionClasico && f.penalizacionClasico < 0) {
    const cobVisitas = f.cobItoPct ?? f.cobItoSemanalPct;
    const bajaCobertura = cobVisitas != null && cobVisitas < UMBRAL_COB_CLASICO;
    const bajoGps = f.gpsPct != null && f.gpsPct < UMBRAL_GPS_APERTURA;
    const causas = [];
    if (bajaCobertura) causas.push(`visitaste al ${pct(cobVisitas)} de tus clientes asignados (mínimo ${UMBRAL_COB_CLASICO}%)`);
    if (bajoGps) causas.push(`abriste por GPS al ${pct(f.gpsPct)} de tus clientes (mínimo ${UMBRAL_GPS_APERTURA}%)`);
    const detalleCausas = causas.length > 0
      ? `Esta semana ${causas.join(" y ")}.`
      : "Tu ruta quedó en categoría CLÁSICO esta semana.";
    items.push({
      titulo: "Penalización por clasificación CLÁSICO",
      monto: f.penalizacionClasico,
      detalle: `${detalleCausas} La categoría CLÁSICO se aplica si no llegas al ${UMBRAL_COB_CLASICO}% de cobertura de visitas o al ${UMBRAL_GPS_APERTURA}% de apertura por GPS. Por estar en esa categoría se cancela la comisión que generaste (${money(Math.abs(f.comisionSemana ?? 0))}) como penalización.`,
      accion: `Visita a todos tus clientes asignados y ábrelos por GPS al llegar — necesitas ${UMBRAL_COB_CLASICO}% de cobertura de visitas y ${UMBRAL_GPS_APERTURA}% de apertura por GPS para no perder la comisión la próxima semana.`,
    });
  }
  if (f.descuentoMorosidad && f.descuentoMorosidad !== 0) {
    const paquetesMorosos = Math.round((Math.abs(f.descuentoMorosidad) / VALOR_PENALIZACION_MOROSIDAD) * 10) / 10;
    items.push({
      titulo: "Descuento por morosidad",
      monto: -Math.abs(f.descuentoMorosidad),
      detalle: `Se aplicó un descuento de ${money(Math.abs(f.descuentoMorosidad))} por clientes de tu ruta que se atrasaron en su pago (no pagaron a tiempo). Cada paquete de un cliente moroso se penaliza a $${VALOR_PENALIZACION_MOROSIDAD} — esta semana equivale a aproximadamente ${paquetesMorosos} paquete(s).`,
      accion: "Dale seguimiento puntual a la cobranza de tus clientes durante la semana; entre antes detectes a un cliente atrasado, menos paquetes de esa ruta quedan expuestos a este descuento.",
    });
  }
  if (f.nominaAbandonada && f.nominaAbandonada !== 0) {
    const bonoGanado = f.bonoDesempeno400 ?? (BONO_DESEMPENO_MAXIMO - Math.abs(f.nominaAbandonada));
    items.push({
      titulo: "Bono de desempeño no ganado (nómina abandonada)",
      monto: -Math.abs(f.nominaAbandonada),
      detalle: `De los ${money(BONO_DESEMPENO_MAXIMO)} disponibles de bono por desempeño en visitas efectivas, ganaste ${money(bonoGanado)} — dejaste ${money(Math.abs(f.nominaAbandonada))} sin ganar.`,
      accion: "Cumple el objetivo de visitas efectivas de la semana completo para ganar el bono de desempeño al 100%.",
    });
  }
  return items.sort((a, b) => a.monto - b.monto);
}

// Item de "oportunidad" para el bono de puntualidad, armado a partir del
// resultado de evaluarPuntualidadSemana() (viene de una consulta async al
// Reloj Checador, por eso no vive dentro de calcularOportunidades). Si
// hubo días con problema, explica cada uno (tarde a qué hora, o sin
// registro ese día).
function oportunidadPuntualidad(resultadoChecador) {
  if (!resultadoChecador || resultadoChecador.diasProblema.length === 0) return null;
  const detalleDias = resultadoChecador.diasProblema
    .map((d) => d.motivo === "sin_registro"
      ? `${d.nombre} (${d.fecha}): sin registro de entrada en el checador`
      : `${d.nombre} (${d.fecha}): llegó a las ${d.horaEntrada.slice(0, 5)} (después de las 7:10 a.m.)`)
    .join(" · ");
  return {
    titulo: "Bono de puntualidad y asistencia no ganado",
    monto: -BONO_PUNTUALIDAD_DEFAULT,
    detalle: `Se pierde el bono completo de ${money(BONO_PUNTUALIDAD_DEFAULT)} porque hubo ${resultadoChecador.diasProblema.length} día(s) sin cumplir el checador (se necesita entrada a las 7:10 a.m. o antes, los 6 días): ${detalleDias}.`,
    accion: "Llega antes de las 7:10 a.m. y marca entrada en el checador todos los días (lunes a sábado) para ganar este bono completo la próxima semana.",
  };
}


function calcularFocosAmarillos(f) {
  const focos = [];
  if (f.gpsPct !== null && f.gpsPct !== undefined && f.gpsPct < UMBRAL_GPS_APERTURA) {
    focos.push({ titulo: "GPS — apertura de clientes", detalle: `Abriste el ${pct(f.gpsPct)} de tus clientes por GPS esta semana (se requiere mínimo ${UMBRAL_GPS_APERTURA}%).`, accion: `Abre a tus clientes por GPS al llegar con cada uno — necesitas llegar al ${UMBRAL_GPS_APERTURA}% para estar en regla.` });
  }
  if (f.sinVisitaItoSemana && f.sinVisitaItoSemana > 0) {
    focos.push({ titulo: "Visitas ITO sin hacer", detalle: `Te faltaron ${numero(f.sinVisitaItoSemana)} visita(s) de tu ITO esta semana.`, accion: "Revisa tu ITO diario y visita a todos los clientes programados; cada visita faltante baja tu cobertura." });
  }
  if (f.objetivoVisitasEfectivas != null && f.resultadoVisitasEfectivas != null && f.resultadoVisitasEfectivas < f.objetivoVisitasEfectivas) {
    const faltan = f.objetivoVisitasEfectivas - f.resultadoVisitasEfectivas;
    focos.push({ titulo: "Visitas efectivas por debajo del objetivo", detalle: `Tuviste ${numero(f.resultadoVisitasEfectivas)} de ${numero(f.objetivoVisitasEfectivas)} visitas efectivas objetivo.`, accion: `Te faltaron ${numero(faltan)} visita(s) efectivas para llegar a tu objetivo semanal — y cada una cuenta para el bono de desempeño.` });
  }
  if (f.otc !== null && f.otc !== undefined && f.otc < META_OTC_MINIMA) {
    focos.push({ titulo: "OTC por debajo del piso esperado", detalle: `Tu comisión de OTC de la semana fue de ${money(f.otc)} (el piso esperado es ${money(META_OTC_MINIMA)}).`, accion: "La comisión de OTC no tiene tope — entre más vendas, más ganas. Empuja OTC el resto de la semana para superar el mínimo." });
  }
  return focos;
}

function colorAprovechamiento(v) {
  if (v === null || v === undefined) return T.muted;
  if (v >= 95) return T.ok;
  if (v >= 80) return T.warn;
  return T.bad;
}

/* ---------------------------------------------------------------
   Piezas de UI reutilizables dentro del módulo
------------------------------------------------------------------ */
function Barra({ valor, color }) {
  const v = Math.max(0, Math.min(100, valor ?? 0));
  return (
    <div style={{ height: 8, borderRadius: 999, background: "#1B2740", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${v}%`, borderRadius: 999, background: color || T.primary, transition: "width .4s" }} />
    </div>
  );
}

function Kpi({ icon, label, valor, color, sub }) {
  return (
    <div className="nm-card" style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.muted, fontSize: 11.5, marginBottom: 6 }}>
        {icon}<span>{label}</span>
      </div>
      <div className="nm-mono" style={{ fontSize: 19, fontWeight: 700, color: color || T.ink }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------
   Detalle de una ruta: financiero + indicadores + oportunidad
------------------------------------------------------------------ */
function DetalleRuta({ fila, editable, onCambiarBonoPuntualidad, semanaInicio }) {
  // Solo se consulta el checador si NO hay corrección manual del Gerente
  // (si ya la hay, esa manda y no hace falta explicar el porqué).
  const [checadorResultado, setChecadorResultado] = useState(null);
  const [cargandoChecador, setCargandoChecador] = useState(false);
  const [errorChecador, setErrorChecador] = useState("");

  useEffect(() => {
    if (!fila || fila.bonoPuntualidad != null || !semanaInicio) { setChecadorResultado(null); return; }
    let activo = true;
    setCargandoChecador(true);
    setErrorChecador("");
    evaluarPuntualidadSemana(fila.ruta, semanaInicio)
      .then((r) => { if (activo) setChecadorResultado(r); })
      .catch((err) => {
        console.error("Error evaluando puntualidad contra el checador:", err);
        if (activo) setErrorChecador("No se pudo verificar contra el Reloj Checador — se asume el bono completo mientras tanto.");
      })
      .finally(() => { if (activo) setCargandoChecador(false); });
    return () => { activo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fila?.ruta, fila?.bonoPuntualidad, semanaInicio]);

  if (!fila) {
    return (
      <div className="nm-card" style={{ padding: 30, textAlign: "center", color: T.muted, fontSize: 13 }}>
        Todavía no hay datos de nómina cargados para esta ruta en esta semana.
      </div>
    );
  }
  const oportunidadesBase = calcularOportunidades(fila);
  const oportunidadPunt = fila.bonoPuntualidad == null ? oportunidadPuntualidad(checadorResultado) : null;
  const oportunidades = oportunidadPunt ? [...oportunidadesBase, oportunidadPunt].sort((a, b) => a.monto - b.monto) : oportunidadesBase;
  const focos = calcularFocosAmarillos(fila);
  const colorAprov = colorAprovechamiento(fila.aprovechamientoTotal);
  const sinPerdidas = oportunidades.length === 0;
  const bonoPuntualidad = fila.bonoPuntualidad != null
    ? fila.bonoPuntualidad
    : (checadorResultado ? checadorResultado.bono : BONO_PUNTUALIDAD_DEFAULT); // mientras carga (o si falla la consulta), se asume completo para no penalizar de más por un error de conexión
  const perdioBonoPuntualidad = bonoPuntualidad < BONO_PUNTUALIDAD_DEFAULT;
  const nominaAPagarAjustada = (fila.nominaAPagar ?? 0) + bonoPuntualidad;
  const nominaTotalAjustada = (fila.nominaTotal ?? 0) + bonoPuntualidad;

  return (
    <div>
      {/* Encabezado ruta */}
      <div className="nm-card" style={{ padding: 18, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 2 }}>Ruta {fila.ruta} · {fila.clo || "—"}</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{fila.vendedorAsignado || "Sin vendedor asignado"}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{fila.tipoRuta} · Clasificación: <strong style={{ color: fila.clasificacion === "CLASICO" ? T.bad : T.ok }}>{fila.clasificacion || "—"}</strong></div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11.5, color: T.muted }}>Nómina total de la semana</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: T.primary }}>{money(nominaTotalAjustada)}</div>
        </div>
      </div>

      {/* Cabecera: nómina perdida + aprovechamiento */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div className="nm-card" style={{ padding: 16, borderLeft: `3px solid ${fila.nominaPerdida < 0 ? T.bad : T.ok}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.muted, fontSize: 11.5, marginBottom: 6 }}>
            {fila.nominaPerdida < 0 ? <TrendingDown size={14} color={T.bad} /> : <CheckCircle2 size={14} color={T.ok} />}
            <span>Nómina perdida esta semana</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: fila.nominaPerdida < 0 ? T.bad : T.ok }}>
            {fila.nominaPerdida < 0 ? money(fila.nominaPerdida) : "$0 — no perdiste nada"}
          </div>
        </div>
        <div className="nm-card" style={{ padding: 16, borderLeft: `3px solid ${colorAprov}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.muted, fontSize: 11.5, marginBottom: 6 }}>
            <Gauge size={14} color={colorAprov} /><span>Aprovechamiento total</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: colorAprov, marginBottom: 6 }}>{pct(fila.aprovechamientoTotal)}</div>
          <Barra valor={fila.aprovechamientoTotal} color={colorAprov} />
        </div>
      </div>

      {/* ¿Dónde está tu oportunidad? */}
      <div className="nm-card" style={{ padding: 18, marginBottom: 16, borderColor: sinPerdidas ? T.ok : T.bad }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Target size={16} color={sinPerdidas ? T.ok : T.bad} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>¿Dónde está tu oportunidad?</span>
        </div>

        {sinPerdidas ? (
          <div style={{ fontSize: 13, color: T.ok, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} /> No tuviste penalizaciones ni descuentos esta semana. Así se ve una nómina completa.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {oportunidades.map((op, i) => (
              <div key={i} style={{ padding: "10px 12px", background: T.badSoft, borderRadius: 10, borderLeft: `3px solid ${T.bad}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                  <strong style={{ fontSize: 13.5 }}>{op.titulo}</strong>
                  <span style={{ fontWeight: 700, color: T.bad, whiteSpace: "nowrap" }}>{money(op.monto)}</span>
                </div>
                <div style={{ fontSize: 12.5, color: T.ink, opacity: 0.9, marginBottom: 6 }}>{op.detalle}</div>
                <div style={{ fontSize: 12, color: T.primary, display: "flex", gap: 6 }}>
                  <ChevronRight size={13} style={{ flexShrink: 0, marginTop: 2 }} /><span><strong>Qué hacer: </strong>{op.accion}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {focos.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 8, fontWeight: 600 }}>Focos de atención (aunque no te hayan costado dinero todavía):</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {focos.map((fo, i) => (
                <div key={i} style={{ padding: "9px 12px", background: T.warnSoft, borderRadius: 10, borderLeft: `3px solid ${T.warn}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{fo.titulo}</div>
                  <div style={{ fontSize: 12.5, color: T.ink, opacity: 0.9, marginBottom: 5 }}>{fo.detalle}</div>
                  <div style={{ fontSize: 12, color: T.primary, display: "flex", gap: 6 }}>
                    <ChevronRight size={13} style={{ flexShrink: 0, marginTop: 2 }} /><span>{fo.accion}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Desglose financiero */}
      <div className="nm-card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Wallet size={16} color={T.primary} /><span style={{ fontWeight: 700, fontSize: 15 }}>Desglose de tu nómina</span>
        </div>
        {[
          ["Sueldo base", fila.sueldoBase, false],
          ["Comisión semana", fila.comisionSemana, false],
          ["Bono de desempeño", fila.bonoDesempeno400, false],
          ["Penalización clásico", fila.penalizacionClasico, true],
          ["Descuento por morosidad", fila.descuentoMorosidad ? -Math.abs(fila.descuentoMorosidad) : fila.descuentoMorosidad, true],
          ["Nómina abandonada", fila.nominaAbandonada ? -Math.abs(fila.nominaAbandonada) : fila.nominaAbandonada, true],
        ].map(([label, val, esResta]) => (
          (val !== null && val !== undefined) && (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
              <span style={{ color: T.muted }}>{label}</span>
              <span className="nm-mono" style={{ fontWeight: 600, color: esResta && val < 0 ? T.bad : T.ink }}>{money(val)}</span>
            </div>
          )
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
          <span style={{ color: T.muted }}>
            Bono de puntualidad y asistencia
            {fila.bonoPuntualidad == null && cargandoChecador && <span style={{ fontSize: 11, marginLeft: 6 }}>(verificando checador…)</span>}
            {fila.bonoPuntualidad != null && <span style={{ fontSize: 11, marginLeft: 6, color: T.primary }}>(corregido a mano)</span>}
          </span>
          {editable ? (
            <input
              type="number" className="nm-mono"
              value={bonoPuntualidad}
              onChange={(e) => onCambiarBonoPuntualidad && onCambiarBonoPuntualidad(fila.ruta, e.target.value === "" ? 0 : Number(e.target.value))}
              style={{ width: 90, textAlign: "right", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, color: perdioBonoPuntualidad ? T.bad : T.ink, fontWeight: 600, padding: "3px 6px", fontSize: 13 }}
            />
          ) : (
            <span className="nm-mono" style={{ fontWeight: 600, color: perdioBonoPuntualidad ? T.bad : T.ink }}>{money(bonoPuntualidad)}</span>
          )}
        </div>
        {errorChecador && <div style={{ fontSize: 11, color: T.warn, padding: "4px 0" }}>{errorChecador}</div>}
        {editable && fila.bonoPuntualidad != null && (
          <div style={{ padding: "4px 0" }}>
            <button className="nm-btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => onCambiarBonoPuntualidad && onCambiarBonoPuntualidad(fila.ruta, null)}>
              Quitar corrección manual (volver a calcular contra el checador)
            </button>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 4px", fontSize: 14 }}>
          <span style={{ fontWeight: 700 }}>Nómina a pagar</span>
          <span className="nm-mono" style={{ fontWeight: 800 }}>{money(nominaAPagarAjustada)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, color: T.muted }}>
          <span>+ OTC</span>
          <span className="nm-mono">{money(fila.otc)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontSize: 16, borderTop: `1px solid ${T.border}`, marginTop: 6 }}>
          <span style={{ fontWeight: 800, color: T.primary }}>Nómina total</span>
          <span className="nm-mono" style={{ fontWeight: 800, color: T.primary }}>{money(nominaTotalAjustada)}</span>
        </div>
        <div style={{ fontSize: 10.5, color: T.muted, marginTop: 10, fontStyle: "italic" }}>
          ** menos impuestos, faltas, descuentos y/o penalizaciones
        </div>
      </div>

      {/* Indicadores */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
        <Kpi icon={<Truck size={13} />} label="Volumen semana" valor={numero(fila.volSemana)} sub="paquetes" />
        <Kpi icon={<MapPin size={13} />} label="GPS (apertura clientes)" valor={pct(fila.gpsPct)} color={fila.gpsPct != null && fila.gpsPct < UMBRAL_GPS_APERTURA ? T.bad : T.ok} />
        <Kpi icon={<ShieldCheck size={13} />} label="Cobertura visitas asignadas" valor={pct(fila.cobItoPct)} color={fila.cobItoPct != null && fila.cobItoPct < UMBRAL_COB_CLASICO ? T.bad : T.ok} />
        <Kpi icon={<AlertTriangle size={13} />} label="Sin visita ITO" valor={numero(fila.sinVisitaItoSemana)} color={fila.sinVisitaItoSemana > 0 ? T.bad : T.ok} />
        <Kpi icon={<Target size={13} />} label="Visitas efectivas" valor={`${numero(fila.resultadoVisitasEfectivas)} / ${numero(fila.objetivoVisitasEfectivas)}`} />
        <Kpi icon={<Gauge size={13} />} label="Cobertura visitas" valor={pct(fila.cobVisitasPct)} color={colorAprovechamiento(fila.cobVisitasPct)} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   Resumen de todas las rutas (Supervisor-1 y Gerente)
------------------------------------------------------------------ */
function VistaResumen({ semana, onVerRuta }) {
  const filasOrdenadas = useMemo(
    () => [...(semana?.filas || [])].sort((a, b) => (a.nominaPerdida ?? 0) - (b.nominaPerdida ?? 0)),
    [semana]
  );
  const totalPerdido = filasOrdenadas.reduce((s, f) => s + Math.min(0, f.nominaPerdida ?? 0), 0);
  const rutasConPerdida = filasOrdenadas.filter((f) => (f.nominaPerdida ?? 0) < 0).length;

  if (!semana) {
    return (
      <div className="nm-card" style={{ padding: 30, textAlign: "center", color: T.muted, fontSize: 13 }}>
        Todavía no hay ninguna semana de nómina cargada.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi icon={<Users size={13} />} label="Rutas cargadas" valor={numero(filasOrdenadas.length)} />
        <Kpi icon={<AlertTriangle size={13} />} label="Rutas con nómina perdida" valor={numero(rutasConPerdida)} color={rutasConPerdida > 0 ? T.bad : T.ok} />
        <Kpi icon={<TrendingDown size={13} />} label="Total perdido en la semana" valor={money(totalPerdido)} color={totalPerdido < 0 ? T.bad : T.ok} />
      </div>

      <div className="nm-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: T.cardSoft, textAlign: "left" }}>
                {["Ruta", "Vendedor", "Clasificación", "Aprovechamiento", "Nómina perdida", "Oportunidad principal", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", color: T.muted, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filasOrdenadas.map((f) => {
                const ops = calcularOportunidades(f);
                const principal = ops[0];
                const colorAprov = colorAprovechamiento(f.aprovechamientoTotal);
                return (
                  <tr key={f.ruta} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>{f.ruta}</td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{f.vendedorAsignado || "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ color: f.clasificacion === "CLASICO" ? T.bad : T.ok, fontWeight: 600 }}>{f.clasificacion || "—"}</span>
                    </td>
                    <td style={{ padding: "10px 12px", minWidth: 110 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="nm-mono" style={{ color: colorAprov, fontWeight: 700 }}>{pct(f.aprovechamientoTotal)}</span>
                      </div>
                      <div style={{ marginTop: 4 }}><Barra valor={f.aprovechamientoTotal} color={colorAprov} /></div>
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: (f.nominaPerdida ?? 0) < 0 ? T.bad : T.ok, whiteSpace: "nowrap" }}>
                      {(f.nominaPerdida ?? 0) < 0 ? money(f.nominaPerdida) : "$0"}
                    </td>
                    <td style={{ padding: "10px 12px", color: T.muted, maxWidth: 260 }}>
                      {principal ? principal.titulo : "Sin oportunidades esta semana"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <button className="nm-btn-ghost" onClick={() => onVerRuta(f.ruta)}>Ver <ChevronRight size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: T.muted, marginTop: 10, fontStyle: "italic" }}>
        ** menos impuestos, faltas, descuentos y/o penalizaciones
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   Carga de datos (solo Gerente)
------------------------------------------------------------------ */
function VistaCargar({ onGuardar, guardando, ultimaSemana }) {
  const [modoArchivo, setModoArchivo] = useState(false);
  const [texto, setTexto] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  // Default = la semana PASADA (lunes-sábado), no la actual: la nómina que
  // se paga en la semana en curso corresponde al checador de la semana
  // anterior (ej. lo que se paga del 10 al 15 de agosto es el checador
  // del 3 al 8).
  const [semanaInicio, setSemanaInicio] = useState(() => sumarDiasISOLocal(lunesDeSemanaLocal(new Date().toISOString().slice(0, 10)), -7));
  const [preview, setPreview] = useState(null); // { filas, advertencias }
  const [errorArchivo, setErrorArchivo] = useState("");
  const inputArchivoRef = useRef(null);

  function procesarTexto() {
    if (!texto.trim()) return;
    setPreview(parseNominaTexto(texto));
  }

  function procesarArchivo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErrorArchivo("");
    const lector = new FileReader();
    lector.onerror = () => setErrorArchivo("No se pudo leer el archivo.");
    lector.onload = (ev) => {
      try {
        const libro = XLSX.read(ev.target.result, { type: "array" });
        const hoja = libro.Sheets[libro.SheetNames[0]];
        const filasCrudas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "", raw: false });
        setPreview(parseNominaArchivo(filasCrudas));
      } catch (err) {
        setErrorArchivo("No se pudo procesar el archivo. Revisa que sea el mismo formato de siempre.");
      }
    };
    lector.readAsArrayBuffer(file);
  }

  function confirmar() {
    if (!preview || preview.filas.length === 0) return;
    if (!semanaInicio) { setErrorArchivo("Falta indicar el lunes de esta semana (se usa para calcular el bono de puntualidad contra el Reloj Checador)."); return; }
    onGuardar({
      etiqueta: etiqueta.trim() || `Semana del ${semanaInicio}`,
      semanaInicio,
      filas: preview.filas,
      advertencias: preview.advertencias,
    });
    setTexto(""); setEtiqueta(""); setPreview(null);
  }

  return (
    <div>
      {ultimaSemana && (
        <div className="nm-card" style={{ padding: "10px 14px", marginBottom: 16, fontSize: 12.5, color: T.muted, background: T.primarySoft, borderColor: T.primary }}>
          Última carga: <strong style={{ color: T.primary }}>{ultimaSemana.etiqueta}</strong> — {ultimaSemana.filas.length} rutas — {new Date(ultimaSemana.fechaCarga).toLocaleString("es-MX")}
        </div>
      )}

      <div className="nm-card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button className={`nm-btn-ghost ${!modoArchivo ? "activo" : ""}`} onClick={() => setModoArchivo(false)}>
            <ClipboardPaste size={14} /> Pegar texto desde Excel
          </button>
          <button className={`nm-btn-ghost ${modoArchivo ? "activo" : ""}`} onClick={() => setModoArchivo(true)}>
            <Upload size={14} /> Subir archivo (.xlsx/.csv)
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: T.muted, display: "block", marginBottom: 6 }}>Etiqueta de esta semana (opcional)</label>
          <input
            className="nm-input" placeholder="Ej. Semana del 4 al 10 de agosto"
            value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: T.muted, display: "block", marginBottom: 6 }}>Lunes de la semana que se está pagando (para cruzar el bono de puntualidad contra el Reloj Checador — por default es la semana pasada, ya que lo que se paga hoy corresponde al checador de la semana anterior)</label>
          <input
            type="date" className="nm-input" style={{ width: "auto" }}
            value={semanaInicio} onChange={(e) => setSemanaInicio(e.target.value)}
          />
        </div>

        {!modoArchivo ? (
          <div>
            <textarea
              className="nm-input" rows={8}
              placeholder="Copia desde la celda 'SUPERVISOR' hasta la última columna y última fila de la tabla (incluyendo el encabezado) y pégalo aquí…"
              value={texto} onChange={(e) => setTexto(e.target.value)}
              style={{ fontFamily: "monospace", fontSize: 11.5 }}
            />
            <button className="nm-btn" style={{ marginTop: 10 }} onClick={procesarTexto}>Previsualizar</button>
          </div>
        ) : (
          <div>
            <button className="nm-btn" onClick={() => inputArchivoRef.current?.click()}>
              <Upload size={14} /> Elegir archivo
            </button>
            <input ref={inputArchivoRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={procesarArchivo} />
            {errorArchivo && <div style={{ color: T.bad, fontSize: 12, marginTop: 8 }}>{errorArchivo}</div>}
          </div>
        )}
      </div>

      {preview && (
        <div className="nm-card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Vista previa — {preview.filas.length} ruta(s) detectada(s)</div>
          {preview.advertencias.length > 0 && (
            <div style={{ background: T.warnSoft, borderRadius: 8, padding: "8px 10px", marginBottom: 12, fontSize: 12 }}>
              {preview.advertencias.map((a, i) => <div key={i}>⚠ {a}</div>)}
            </div>
          )}
          {preview.filas.length > 0 && (
            <div style={{ overflowX: "auto", marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 8 }}>
                El bono de puntualidad y asistencia ($400/semana) se calculará automático al ver cada ruta, cruzando el Reloj Checador de esa semana (entrada antes de las 7:10 a.m. los 6 días). Si necesitas corregirlo a mano por alguna justificación, se hace después, ya guardada la semana.
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: T.cardSoft, textAlign: "left" }}>
                    {["Ruta", "Vendedor", "Clasificación", "Nómina total (sin bono puntualidad)", "Nómina perdida"].map((h) => <th key={h} style={{ padding: "8px 10px", color: T.muted }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.filas.map((f) => (
                    <tr key={f.ruta} style={{ borderTop: `1px solid ${T.border}` }}>
                      <td style={{ padding: "8px 10px", fontWeight: 700 }}>{f.ruta}</td>
                      <td style={{ padding: "8px 10px" }}>{f.vendedorAsignado || "—"}</td>
                      <td style={{ padding: "8px 10px" }}>{f.clasificacion || "—"}</td>
                      <td style={{ padding: "8px 10px" }}>{money(f.nominaTotal ?? 0)}</td>
                      <td style={{ padding: "8px 10px", color: (f.nominaPerdida ?? 0) < 0 ? T.bad : T.ok }}>{(f.nominaPerdida ?? 0) < 0 ? money(f.nominaPerdida) : "$0"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button className="nm-btn" disabled={guardando || preview.filas.length === 0} style={{ opacity: guardando ? 0.6 : 1 }} onClick={confirmar}>
            {guardando ? "Guardando…" : "Guardar esta semana"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   Componente principal
------------------------------------------------------------------ */
export default function NominaView({ data, persistFresco, rol, puesto, identidad, rutaPropia }) {
  const esGerente = rol === "staff" && puesto === "gerente";
  const esSupervisor1 = rol === "staff" && puesto === "supervisor";
  const esVendedor = rol === "vendedor";
  const tieneAccesoGestion = esGerente || esSupervisor1;

  const semanas = useMemo(
    () => [...(data?.nominaSemanas || [])].sort((a, b) => new Date(b.fechaCarga) - new Date(a.fechaCarga)),
    [data?.nominaSemanas]
  );

  const [semanaId, setSemanaId] = useState(null);
  const semanaActual = useMemo(() => {
    if (semanaId) return semanas.find((s) => s.id === semanaId) || semanas[0] || null;
    return semanas[0] || null;
  }, [semanas, semanaId]);

  const [vista, setVista] = useState(esVendedor ? "detalle" : (semanas.length ? "resumen" : "cargar"));
  const [rutaSeleccionada, setRutaSeleccionada] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(null);

  const filaVendedor = useMemo(() => {
    if (!esVendedor || !semanaActual || !rutaPropia) return null;
    return semanaActual.filas.find((f) => f.ruta === String(rutaPropia).toUpperCase().trim()) || null;
  }, [esVendedor, semanaActual, rutaPropia]);

  const filaSeleccionadaStaff = useMemo(() => {
    if (!semanaActual || !rutaSeleccionada) return null;
    return semanaActual.filas.find((f) => f.ruta === rutaSeleccionada) || null;
  }, [semanaActual, rutaSeleccionada]);

  async function guardarSemana({ etiqueta, semanaInicio, filas, advertencias }) {
    setGuardando(true); setErrorGuardado(null);
    try {
      await persistFresco((fresca) => ({
        nominaSemanas: [
          ...(fresca.nominaSemanas || []),
          { id: `NS-${Date.now()}`, etiqueta, semanaInicio, filas, advertencias, fechaCarga: new Date().toISOString(), cargadoPor: identidad || "Gerente" },
        ].slice(-26), // conserva ~6 meses de historial
      }));
      setVista("resumen");
    } catch (err) {
      setErrorGuardado(err?.message || "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrarSemana(id) {
    setGuardando(true); setErrorGuardado(null);
    try {
      await persistFresco((fresca) => ({ nominaSemanas: (fresca.nominaSemanas || []).filter((s) => s.id !== id) }));
      if (semanaId === id) setSemanaId(null);
    } catch (err) {
      setErrorGuardado(err?.message || "No se pudo borrar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  // Ajuste manual del bono de puntualidad y asistencia (no viene en el Excel):
  // el Gerente lo reduce/pone en $0 aquí mismo si hubo retardos o faltas esa
  // semana. Por default cada ruta arranca con el bono completo ($400).
  async function actualizarBonoPuntualidad(semanaIdObjetivo, ruta, nuevoValor) {
    try {
      await persistFresco((fresca) => ({
        nominaSemanas: (fresca.nominaSemanas || []).map((s) =>
          s.id !== semanaIdObjetivo ? s : {
            ...s,
            filas: s.filas.map((f) => (f.ruta === ruta ? { ...f, bonoPuntualidad: nuevoValor } : f)),
          }
        ),
      }));
    } catch (err) {
      setErrorGuardado(err?.message || "No se pudo guardar el ajuste del bono. Intenta de nuevo.");
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <style>{`
        .nm-card { background:${T.card}; border:1px solid ${T.border}; border-radius:14px; }
        .nm-mono { font-family:'IBM Plex Mono', monospace; }
        .nm-input { width:100%; box-sizing:border-box; background:${T.bg}; border:1px solid ${T.border}; color:${T.ink}; border-radius:8px; padding:9px 11px; font-size:13px; }
        .nm-btn { background:${T.primary}; color:#1A1300; font-weight:700; border:none; border-radius:10px; padding:9px 15px; cursor:pointer; font-size:13px; display:inline-flex; align-items:center; gap:6px; }
        .nm-btn:disabled { cursor:not-allowed; }
        .nm-btn-ghost { background:transparent; border:1px solid ${T.border}; color:${T.ink}; border-radius:10px; padding:8px 13px; cursor:pointer; font-size:12.5px; display:inline-flex; align-items:center; gap:6px; }
        .nm-btn-ghost.activo { border-color:${T.primary}; color:${T.primary}; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Wallet size={20} color={T.primary} />
          <span style={{ fontSize: 18, fontWeight: 800 }}>NÓMINA</span>
        </div>

        {tieneAccesoGestion && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {semanas.length > 0 && (
              <select className="nm-input" style={{ width: "auto" }} value={semanaActual?.id || ""} onChange={(e) => setSemanaId(e.target.value)}>
                {semanas.map((s) => <option key={s.id} value={s.id}>{s.etiqueta}</option>)}
              </select>
            )}
            <button className={`nm-btn-ghost ${vista === "resumen" ? "activo" : ""}`} onClick={() => setVista("resumen")}>Resumen</button>
            <button className={`nm-btn-ghost ${vista === "detalle" ? "activo" : ""}`} onClick={() => setVista("detalle")}>Ver por ruta</button>
            {esGerente && <button className={`nm-btn-ghost ${vista === "cargar" ? "activo" : ""}`} onClick={() => setVista("cargar")}>Cargar semana</button>}
          </div>
        )}
      </div>

      {errorGuardado && (
        <div style={{ background: T.badSoft, color: T.bad, padding: "10px 14px", borderRadius: 10, marginBottom: 16, fontSize: 12.5 }}>
          {errorGuardado}
        </div>
      )}

      {/* Vendedor: directo a su propia nómina, sin pestañas */}
      {esVendedor && (
        <div>
          {semanas.length > 0 && semanas.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <select className="nm-input" style={{ width: "auto" }} value={semanaActual?.id || ""} onChange={(e) => setSemanaId(e.target.value)}>
                {semanas.map((s) => <option key={s.id} value={s.id}>{s.etiqueta}</option>)}
              </select>
            </div>
          )}
          <DetalleRuta fila={filaVendedor} semanaInicio={semanaActual?.semanaInicio} />
        </div>
      )}

      {/* Gerente / Supervisor-1 */}
      {tieneAccesoGestion && vista === "resumen" && (
        <VistaResumen semana={semanaActual} onVerRuta={(ruta) => { setRutaSeleccionada(ruta); setVista("detalle"); }} />
      )}

      {tieneAccesoGestion && vista === "detalle" && (
        <div>
          {semanaActual && (
            <div style={{ marginBottom: 14 }}>
              <select
                className="nm-input" style={{ width: "auto" }}
                value={rutaSeleccionada || ""}
                onChange={(e) => setRutaSeleccionada(e.target.value)}
              >
                <option value="">Elige una ruta…</option>
                {semanaActual.filas.map((f) => <option key={f.ruta} value={f.ruta}>{f.ruta} — {f.vendedorAsignado || "sin vendedor"}</option>)}
              </select>
            </div>
          )}
          <DetalleRuta
            fila={filaSeleccionadaStaff}
            editable={esGerente}
            onCambiarBonoPuntualidad={(ruta, valor) => semanaActual && actualizarBonoPuntualidad(semanaActual.id, ruta, valor)}
            semanaInicio={semanaActual?.semanaInicio}
          />
        </div>
      )}

      {esGerente && vista === "cargar" && (
        <VistaCargar onGuardar={guardarSemana} guardando={guardando} ultimaSemana={semanas[0] || null} />
      )}

      {esGerente && semanas.length > 0 && vista !== "cargar" && (
        <div className="nm-card" style={{ padding: 14, marginTop: 20 }}>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 8, fontWeight: 600 }}>Historial de cargas</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {semanas.map((s) => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "6px 0", borderTop: `1px solid ${T.border}` }}>
                <span>{s.etiqueta} · {s.filas.length} rutas · {s.semanaInicio ? `lunes ${s.semanaInicio}` : "sin fecha de checador"} · subida {new Date(s.fechaCarga).toLocaleDateString("es-MX")}</span>
                <button className="nm-btn-ghost" onClick={() => borrarSemana(s.id)} style={{ color: T.bad, borderColor: T.bad }}>
                  <Trash2 size={12} /> Borrar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!tieneAccesoGestion && !esVendedor && (
        <div className="nm-card" style={{ padding: 30, textAlign: "center", color: T.muted, fontSize: 13 }}>
          Este módulo todavía no está habilitado para tu rol.
        </div>
      )}
    </div>
  );
}
