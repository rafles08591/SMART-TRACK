// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Truck, Target, Users, Upload, LogOut, Star, MapPin, Flag, Download, ClipboardPaste,
  Plus, Trash2, Calendar, ChevronRight, AlertCircle, CheckCircle2, Clock, MessageSquare,
  RefreshCw, Ticket, Camera, Image as ImageIcon, Ban,
} from "lucide-react";
import html2canvas from "html2canvas"; // npm install html2canvas
import CuponeraView from "./components/CuponeraView";
import TiemposView, { supabaseTiempos } from "./components/TiemposView";
import { supabase } from "./supabaseClient";

// ====== SUPABASE ======
// El cliente de Supabase ahora vive en ./supabaseClient.js (compartido con
// CuponeraView.jsx, que también necesita subir imágenes a Storage).
// Requiere una tabla "ventas_app_state" con columnas: id (text, PK), data (jsonb), updated_at (timestamptz)
// y Realtime habilitado sobre esa tabla para la sincronización instantánea entre usuarios.
const STATE_ID = "main";
// ======================

const SPLASH_IMAGE = "/splash.jpg";

const RUTAS = ["J201","J202","J203","J204","J205","J206","J207"].map((n) => `RUTA ${n}`);
const NOMBRES = {
  "RUTA J201": "Francisco Javier",
  "RUTA J202": "Riqui Martín",
  "RUTA J203": "Ana Paola",
  "RUTA J204": "Noema Natalia",
  "RUTA J205": "Manuel",
  "RUTA J206": "Selene",
  "RUTA J207": "Alfredo Juárez",
  "SUPERVISOR-1": "Christian Velasco",
  "SUPERVISOR-2": "Modesto Chavarín",
  "GERENTE": "Rafael Gallardo",
  "LIQUIDACION- SULEMA PONCE": "Sulema Ponce",
};
const OBJETIVO_TABS = [
  { key: "dia", label: "DÍA", unit: "special" },
  { key: "max", label: "MAX", unit: "units" },
  { key: "open", label: "OPEN", unit: "units" },
  { key: "champions", label: "CHAMPIONS", unit: "units" },
  { key: "mesa", label: "MESA DE CONTROL", unit: "special" },
  { key: "cuponera", label: "CUPONERA", unit: "special" },
  { key: "tiempos", label: "TIEMPOS", unit: "special" },
  { key: "rutas", label: "RUTAS", unit: "special" },
  { key: "actividades_dia", label: "ACTIVIDADES DÍA", unit: "special" },
  { key: "actividades_semana", label: "ACTIVIDADES SEMANA", unit: "special" },
  { key: "actividades_mes", label: "ACTIVIDADES MES", unit: "special" },
  { key: "cotizador", label: "COTIZADOR", unit: "special" },
  { key: "rally_otc", label: "RALLY OTC", unit: "special" },
  { key: "avisos", label: "AVISOS", unit: "special" },
  { key: "cargas", label: "CARGAS", unit: "special" },
  { key: "pwst", label: "PWST", unit: "special" },
];
const MARCA_KEYS = { "ice mix": "iceMix", "bloss mix": "blossMix", "summ mix": "summMix", "faronet": "faronet" };
const MARCA_KEYS_ALL = { ...MARCA_KEYS, "otc": "otc" };
const MARCAS_OPEN = [
  { key: "iceMix", label: "ICE MIX" },
  { key: "blossMix", label: "BLOSS MIX" },
  { key: "summMix", label: "SUMM MIX" },
  { key: "faronet", label: "FARONET" },
];
const MARCAS_CHAMPIONS = [
  { key: "champIce", label: "CHAM_ICE" },
  { key: "champBlossSumm", label: "CHAM_BLOSS-SUMM" },
  { key: "champFaronet", label: "CHAM_FARONET" },
];
const MARCAS_DIA = [
  { key: "iceMix", label: "ICE MIX" },
  { key: "blossMix", label: "BLOSSOM MIX" },
  { key: "summMix", label: "SUMMER MIX" },
  { key: "faronet", label: "FARONET" },
];
// Umbral para marcar una ruta como bajo desempeño en el día: paquetes vendidos hoy
// por debajo de este % del ritmo diario necesario de OPEN. Ajustable si hace falta.
const UMBRAL_BAJO_DESEMPENO = 0.5;

// Mapeo de código de artículo -> etiqueta de marca, usado al importar el reporte
// crudo del sistema (NUR, Vendedor, Fecha, Cliente, Potencial, Articulo, Paquetes, Contado $, Credito $, Total $)
const ARTICULO_MARCA_LABEL = {
  FA01085: "ICE MIX",
  FA01114: "BLOSS MIX",
  FA01115: "SUMM MIX",
  FA04016: "FARONET",
  FA04017: "FARONET",
  FA15010: "FARONET",
  FA15009: "FARONET",
  // FA04505 solo suma al CHAM_BLOSS-SUMM de la pestaña CHAMPIONS, no a BLOSS MIX/SUMM MIX de OPEN.
  FA04505: "CHAM EXTRA BLOSS SUMM",
};
const MARCA_CHAM_EXTRA_BLOSS_SUMM = "cham extra bloss summ";

// Códigos de artículo (columna "Codigo" del reporte de OTC) que cuentan para el
// indicador "OTC sin Vuala": se cumple si se vendieron al menos 2 piezas en total
// sumando cualquiera de estos códigos.
const CODIGOS_OTC_SIN_VUALA = [
  "0065", "0073", "0079", "0080", "0088", "0096", "0097", "0098", "0099", "0118",
  "0123", "0134", "0136", "0140", "0141", "0155", "0156", "0157", "0158", "0159",
  "0160", "0163", "0181", "0175", "0206", "0207", "0281", "0176", "0290", "0300",
  "0301", "0302", "0304", "0305", "0306", "0307", "0317", "0319", "0321", "0322",
  "0323", "0324", "0320", "0291", "0292", "0293", "0294", "0295", "0296",
];
const OTC_SIN_VUALA_MINIMO = 2;
const USERS = [
  ...RUTAS.map((u) => ({ username: u, password: "1234", role: "vendedor" })),
  { username: "SUPERVISOR-1", password: "3030", role: "staff", puesto: "supervisor" },
  { username: "SUPERVISOR-2", password: "4545", role: "staff", puesto: "supervisor2" },
  { username: "GERENTE", password: "1547", role: "staff", puesto: "gerente" },
  { username: "LIQUIDACION- SULEMA PONCE", password: "7625", role: "liquidacion" },
];

// Tablas de multiplicador de comisión OTC según el promedio de venta diario del equipo.
// mult se aplica sobre el promedio de las comisiones OTC de los vendedores.
const TABLA_COMISION_SUPERVISOR = [
  { desde: 2000, mult: 2.0 },
  { desde: 1600, mult: 1.5 },
  { desde: 0, mult: 1.0 },
];
const TABLA_COMISION_GERENTE = [
  { desde: 2000, mult: 2.5 },
  { desde: 1600, mult: 2.0 },
  { desde: 0, mult: 1.5 },
];
const DIAS_SEMANA_OTC = 6; // Lun-Sáb, para calcular el promedio de venta diario del equipo

function multiplicadorComision(tabla, promedio) {
  for (const nivel of tabla) {
    if (promedio >= nivel.desde) return nivel.mult;
  }
  return tabla[tabla.length - 1].mult;
}

// Fecha en zona horaria de México (cambia a medianoche local, no UTC)
const TZ_MX = "America/Mexico_City";
const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ_MX });

function firstOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function lastOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

// Cuenta días hábiles (Lun-Sáb, excluyendo domingos y festivos/descansos) entre
// "inicio" y "fin", inclusive en ambos extremos.
function diasHabilesEntre(inicio, fin, diasNoLaborables) {
  const excluidos = new Set(diasNoLaborables || []);
  const start = new Date(inicio + "T00:00:00");
  const end = new Date(fin + "T00:00:00");
  if (start > end) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    if (cur.getDay() !== 0 && !excluidos.has(iso)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Cuenta días hábiles (Lun-Sáb, excluyendo domingos) entre hoy y "fin", inclusive.
// diasNoLaborables: array de fechas "YYYY-MM-DD" (festivos o descansos extraordinarios)
// que también se descuentan del conteo, aunque caigan en Lun-Sáb.
function diasRestantes(fin, diasNoLaborables) {
  return diasHabilesEntre(todayISO(), fin, diasNoLaborables);
}

const money = (n) =>
  (n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

const unidades = (n) => `${Math.round(n || 0).toLocaleString("es-MX")} paq.`;

const fmt = (unit, n) => (unit === "units" ? unidades(n) : money(n));

const metaColor = (vendido, objetivo) => (objetivo > 0 && vendido >= objetivo ? "#3DDC97" : "#FF6B6B");

// Analiza las visitas de "mesa de control" de una ruta específica.
// Una fila se marca como alerta ("roja") si el tiempo de estancia es menor a 3 min,
// o si el inicio/fin de la visita fue MANUAL (no verificado por GPS/automático).
function analizarMesaControl(mesaControl, vendedorName) {
  const propios = mesaControl.filter((r) => r.vendedor.trim().toLowerCase() === vendedorName.trim().toLowerCase());
  if (propios.length === 0) return null;

  const fecha = propios[0].fecha;
  const horaInicio = propios.reduce((min, r) => (r.inicio && (!min || r.inicio < min) ? r.inicio : min), null);
  // Hora del último cliente atendido (salida de la última visita), útil para
  // ver cuánto tiempo pasó entre terminar con el último cliente y el
  // regreso físico a CLO.
  const horaUltimoCliente = propios.reduce((max, r) => (r.final && (!max || r.final > max) ? r.final : max), null);

  const conAlerta = propios.map((r) => ({
    ...r,
    alerta: r.tiempoEstancia < 3 || r.tipoInicio !== "GPS",
  }));

  const top5 = [...propios].sort((a, b) => b.tiempoEstancia - a.tiempoEstancia).slice(0, 5);
  const menores3 = propios.filter((r) => r.tiempoEstancia < 3);

  const tipoInicioConteo = {};
  const tipoFinConteo = {};
  propios.forEach((r) => {
    const ti = r.tipoInicio || "SIN DATO";
    const tf = r.tipoFin || "SIN DATO";
    tipoInicioConteo[ti] = (tipoInicioConteo[ti] || 0) + 1;
    tipoFinConteo[tf] = (tipoFinConteo[tf] || 0) + 1;
  });

  const volumenTotal = propios.reduce((s, r) => s + (Number(r.volumen) || 0), 0);
  const clientesVolumen03 = propios.filter((r) => Math.abs((Number(r.volumen) || 0) - 0.3) < 0.0001);
  const clientesConDescuento = propios.filter((r) => (Number(r.descuento) || 0) > 0);
  // Visitas efectivas = clientes distintos que sí compraron (volumen > 0).
  // Un cliente visitado pero sin compra no cuenta.
  const visitasEfectivas = new Set(
    propios.filter((r) => (Number(r.volumen) || 0) > 0).map((r) => (r.cliente || "").trim().toLowerCase()).filter(Boolean)
  ).size;

  return {
    fecha, horaInicio, horaUltimoCliente, top5, menores3, tipoInicioConteo, tipoFinConteo,
    volumenTotal, clientesVolumen03, clientesConDescuento, visitasEfectivas, todos: conAlerta,
  };
}

function blankObjetivos() {
  return {
    open: 0, champions: 0, max: 0,
    visitasEfectivas: 0,
    iceMix: 0, blossMix: 0, summMix: 0, faronet: 0,
    champIce: 0, champBlossSumm: 0, champFaronet: 0,
    otc: 0, otcDiario: 1600,
  };
}

function defaultData() {
  return {
    vendedores: RUTAS.map((r, i) => ({
      id: "v" + (i + 1),
      name: r,
      objetivos: { ...blankObjetivos(), open: 150000, champions: 200000, max: 200000, otc: 1600 * 6, otcDiario: 1600 },
    })),
    ventas: [], // OBSOLETO: las ventas del periodo ahora viven en la tabla ventas_periodo, ya no aquí.
    avanceDia: [],
    otcDia: [],
    diasNoLaborables: [],
    otcSemanal: [],
    mesaControl: [],
    mensajesDia: {},
    mensajesSupervisores: {},
    // Listado de promociones (antes era una sola imagen/descripción). Cada
    // promoción tiene su propio código, que debe coincidir exactamente con
    // el QR escaneado para considerarse un cupón válido.
    promociones: [],
    // Log de cada canje válido (no un simple contador), para poder mostrar
    // cantidad Y descripción de la promoción canjeada en el Excel. Se
    // reinicia cada vez que arranca un nuevo periodo (ver updatePeriodo).
    cuponesRedimidos: [],
    periodo: { inicio: firstOfMonthISO(), fin: lastOfMonthISO() },
    // Checklists de actividades: día (se reinicia cada día), semana (cada
    // lunes) y mes (cada mes). Se siembran solas la primera vez que se usan
    // (ver normalizarActividades).
    actividades: {
      dia: { fecha: null, items: [] },
      semana: { semanaId: null, items: [] },
      mes: { mesId: null, items: [] },
    },
    // Avisos grupales: Supervisor-1 y Gerente publican, todos los roles ven.
    avisos: [],
    // Preferencia de recibir avisos, solo aplica a Supervisor-2 y Liquidación
    // (los demás roles siempre reciben). true = sí recibe.
    preferenciasAvisos: { supervisor2: true, liquidacion: true },
    // Última vez que cada quien entró a Avisos, para saber si hay nuevos
    // (y parpadear la pestaña). Clave = nombre de ruta o rol de staff.
    avisosVistoPor: {},
    // Avisos que cada quien decidió "descartar" (ocultar solo para sí mismo,
    // sin borrarlo para los demás). Clave = viewerKey, valor = array de ids.
    avisosDescartadosPor: {},
    // Cargas: Supervisor-1/Gerente suben la "Carga Propuesta" (FA, marca,
    // cantidad por ruta). Cada vendedor puede proponer su propia cantidad;
    // si no la cambia, se usa la inicial. Se bloquea al descargar.
    cargas: { fecha: null, bloqueado: false, items: [], enviosPorRuta: {} },
    // Rally OTC: configurado por gerente, visible para todos los roles.
    // objetivos es un mapa { "RUTA J201": { dia, final }, ... } solo para
    // las rutas participantes.
    rallyOtc: {
      activo: false,
      nombre: "",
      fechaInicio: null,
      fechaFin: null,
      rutasParticipantes: [],
      imagen: null,
      objetivos: {},
      codigosParticipantes: [],
      unidad: "dinero", // "dinero" | "piezas"
    },
  };
}

// Actividades fijas con las que arranca cada checklist (se pueden agregar más desde la app).
const ACTIVIDADES_INICIALES = {
  dia: [
    "Marcar llegada CLO, salida a ruta",
    "Conteos matutinos",
    "Registro de KM",
    "Seguimiento a rutas",
    "Mesa de control 1",
    "Mesa de control 2",
  ],
  mes: [
    "Nómina mínima esperada",
    "Inventario puerta cerrada",
  ],
  semana: [
    "Arqueo de créditos",
    "Arqueo resguardo",
    "Feedback nómina",
  ],
};

function fechaHoyISO() {
  return new Date().toLocaleDateString("en-CA");
}

// Lunes de la semana de una fecha dada (se usa como identificador único de "esta semana").
function lunesDeSemana(fechaISO) {
  const d = new Date(fechaISO + "T00:00:00");
  const dia = d.getDay(); // 0=domingo … 6=sábado
  const diff = (dia === 0 ? -6 : 1) - dia;
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString("en-CA");
}

function nuevaActividad(texto, tipo, autor, fechaISO) {
  return {
    id: "act_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    texto: texto.trim(),
    tipo, // "fija" | "temporal"
    hecha: false,
    creadaPor: autor || "Sistema",
    creadaFecha: fechaISO,
  };
}

// Procesa un ciclo (día/semana/mes): si el identificador (fecha/semanaId/mesId)
// ya coincide con el actual, no toca nada. Si cambió (o es la primera vez),
// reinicia las actividades FIJAS a pendiente y purga las TEMPORALES que ya se
// hubieran marcado como hechas (las temporales pendientes se conservan).
function procesarCicloActividades(estado, idActual, campoId, semillas) {
  const idGuardado = estado && estado[campoId];
  if (idGuardado === idActual) return estado;

  if (!idGuardado) {
    return { [campoId]: idActual, items: semillas.map((texto) => nuevaActividad(texto, "fija", "Sistema", idActual)) };
  }

  const items = (estado.items || [])
    .filter((it) => it.tipo === "fija" || !it.hecha)
    .map((it) => (it.tipo === "fija" ? { ...it, hecha: false } : it));

  return { [campoId]: idActual, items };
}

function normalizarActividades(actividadesActuales) {
  const hoy = fechaHoyISO();
  const semanaActual = lunesDeSemana(hoy);
  const mesActual = hoy.slice(0, 7);
  const base = actividadesActuales || { dia: { fecha: null, items: [] }, semana: { semanaId: null, items: [] }, mes: { mesId: null, items: [] } };
  return {
    dia: procesarCicloActividades(base.dia, hoy, "fecha", ACTIVIDADES_INICIALES.dia),
    semana: procesarCicloActividades(base.semana, semanaActual, "semanaId", ACTIVIDADES_INICIALES.semana),
    mes: procesarCicloActividades(base.mes, mesActual, "mesId", ACTIVIDADES_INICIALES.mes),
  };
}

export default function App() {
  const [data, setData] = useState(null);
  const [showSplash, setShowSplash] = useState(true);
  const [role, setRole] = useState(null); // 'staff' | 'vendedor'
  const [puesto, setPuesto] = useState(null); // 'supervisor' | 'gerente' (solo aplica cuando role === 'staff')
  const [staffUsername, setStaffUsername] = useState(null);
  const [currentVendorId, setCurrentVendorId] = useState(null);
  const [status, setStatus] = useState("");
  const [objStatus, setObjStatus] = useState("");
  const [avanceDiaStatus, setAvanceDiaStatus] = useState("");
  const [otcDiaStatus, setOtcDiaStatus] = useState("");
  const [ventasPeriodoStatus, setVentasPeriodoStatus] = useState("");
  const [mesaControlStatus, setMesaControlStatus] = useState("");
  const [cargasStatus, setCargasStatus] = useState("");
  const fileInputRef = useRef(null);
  const objFileInputRef = useRef(null);
  const avanceDiaFileInputRef = useRef(null);
  const otcDiaFileInputRef = useRef(null);
  const ventasPeriodoFileInputRef = useRef(null);
  const cargasFileInputRef = useRef(null);
  // Ventas del periodo: ahora viven en su propia tabla de Postgres
  // (ventas_periodo), no dentro del JSON grande de ventas_app_state.
  const [ventasPeriodo, setVentasPeriodoState] = useState([]);
  // Contador de secuencia: durante una carga masiva se disparan muchas
  // llamadas a cargarVentasPeriodo casi al mismo tiempo (una por cada evento
  // de tiempo real). Sin esto, una llamada vieja que tarde más podría
  // terminar DESPUÉS de la buena y pisarla con datos incompletos.
  const secuenciaVentasPeriodoRef = useRef(0);
  const mesaControlFileInputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1800);
    return () => clearTimeout(t);
  }, []);

  const [refrescando, setRefrescando] = useState(false);

  async function loadData() {
    try {
      const { data: row, error } = await supabase
        .from("ventas_app_state")
        .select("data")
        .eq("id", STATE_ID)
        .single();

      if (error) {
        console.warn("Supabase load error:", error);
        setStatus(`Error al cargar: ${error.message} (${error.code || "?"})`);
        setData(defaultData());
        return;
      }

      if (row && row.data && Object.keys(row.data).length > 0) {
        const loaded = { ...defaultData(), ...row.data, mesaControl: row.data.mesaControl || [] };
        setData(loaded);
      } else {
        const initial = defaultData();
        setData(initial);
        await supabase.from("ventas_app_state").upsert({
          id: STATE_ID,
          data: initial,
          updated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(err);
      setData(defaultData());
    }
  }

  async function refrescarManual() {
    setRefrescando(true);
    await loadData();
    setRefrescando(false);
  }

  useEffect(() => {
    let channel = null;

    loadData();

    // Actualización automática: cuando alguien más guarda, recibimos el cambio en tiempo real
    channel = supabase
      .channel("ventas_app_state_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ventas_app_state",
          filter: `id=eq.${STATE_ID}`,
        },
        (payload) => {
          const nuevo = payload.new?.data;
          if (nuevo && typeof nuevo === "object") {
            const loaded = { ...defaultData(), ...nuevo, mesaControl: nuevo.mesaControl || [] };
            setData(loaded);
          }
        }
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  async function persist(next) {
    setData(next);
    try {
      const { data: saved, error } = await supabase
        .from("ventas_app_state")
        .upsert({
          id: STATE_ID,
          data: next,
          updated_at: new Date().toISOString(),
        })
        .select();

      if (error) {
        console.error("Supabase save error:", error);
        setStatus(`Error Supabase: ${error.message} | code: ${error.code || "?"} | details: ${error.details || error.hint || "-"}`);
      } else {
        console.log("Guardado OK en Supabase", saved);
        setStatus("");
      }
    } catch (err) {
      console.error("Error de red al guardar:", err);
      setStatus(`Error de red: ${err?.message || String(err)}`);
    }
  }

  // Carga las ventas del periodo directamente desde su propia tabla
  // (ventas_periodo), filtrando por rango de fechas en el servidor. Esto ya
  // no depende del tamaño del JSON grande de ventas_app_state.
  // IMPORTANTE: Supabase/PostgREST solo regresa 1000 filas por consulta por
  // default, sin avisar que hay más — por eso se pagina con .range() hasta
  // traer todo, o si no, con miles de registros solo se veía un pedacito.
  async function cargarVentasPeriodo(periodoActual) {
    if (!periodoActual?.inicio || !periodoActual?.fin) return;
    const miSecuencia = ++secuenciaVentasPeriodoRef.current;
    try {
      const TAMANO_PAGINA = 1000;
      let todasLasFilas = [];
      let desde = 0;
      while (true) {
        const { data: filas, error } = await supabase
          .from("ventas_periodo")
          .select("id, vendedor, fecha, marca, paquetes, monto, cliente")
          .gte("fecha", periodoActual.inicio)
          .lte("fecha", periodoActual.fin)
          .order("id", { ascending: true })
          .range(desde, desde + TAMANO_PAGINA - 1);

        if (error) {
          console.error("Error cargando ventas_periodo:", error);
          break;
        }

        if (!filas || filas.length === 0) break;
        todasLasFilas = todasLasFilas.concat(filas);
        // Avanza exactamente lo que llegó (no asume que el servidor siempre
        // regresa el tamaño de página completo), y se detiene solo cuando
        // una página llega vacía — así funciona sin importar si Supabase
        // tiene configurado un límite de filas distinto al que pedimos.
        desde += filas.length;
      }

      // Si mientras se cargaba esto se disparó una carga MÁS nueva (otro
      // evento de tiempo real u otra llamada), esta respuesta ya quedó
      // obsoleta: se descarta en vez de pisar el resultado más reciente.
      if (miSecuencia !== secuenciaVentasPeriodoRef.current) return;

      setVentasPeriodoState(
        todasLasFilas.map((r) => ({
          fecha: r.fecha,
          vendedor: r.vendedor,
          marca: r.marca || "",
          estrategica: false,
          monto: Number(r.monto) || 0,
          paquetes: Number(r.paquetes) || 0,
          visitaEfectiva: false,
          cliente: r.cliente || "",
        }))
      );
    } catch (err) {
      console.error("Error de red cargando ventas_periodo:", err);
    }
  }

  // Se recarga cada vez que cambia el rango del periodo, y se mantiene
  // sincronizada en tiempo real entre dispositivos.
  useEffect(() => {
    const periodoActual = data?.periodo;
    if (!periodoActual?.inicio || !periodoActual?.fin) return;

    cargarVentasPeriodo(periodoActual);

    // Debounce: durante una carga masiva llegan decenas de eventos de tiempo
    // real casi de inmediato. En vez de recargar en cada uno (lo que dispara
    // muchas consultas superpuestas), se espera un momento sin nuevos
    // eventos antes de recargar una sola vez.
    let temporizador = null;
    const canal = supabase
      .channel(`ventas_periodo_changes_${periodoActual.inicio}_${periodoActual.fin}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ventas_periodo" },
        () => {
          if (temporizador) clearTimeout(temporizador);
          temporizador = setTimeout(() => cargarVentasPeriodo(periodoActual), 800);
        }
      )
      .subscribe();

    return () => {
      if (temporizador) clearTimeout(temporizador);
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.periodo?.inicio, data?.periodo?.fin]);

  const vendedores = data?.vendedores || [];
  const ventas = ventasPeriodo;
  const avanceDia = data?.avanceDia || [];
  const otcDia = data?.otcDia || [];
  const otcSemanal = data?.otcSemanal || [];
  const mesaControl = data?.mesaControl || [];
  const mensajesDia = data?.mensajesDia || {};
  const diasNoLaborables = data?.diasNoLaborables || [];
  const periodo = data?.periodo || { inicio: firstOfMonthISO(), fin: lastOfMonthISO() };

  const stats = useMemo(() => {
    const restantes = diasRestantes(periodo.fin, diasNoLaborables);
    const diasLaborablesTotal = diasHabilesEntre(periodo.inicio, periodo.fin, diasNoLaborables);
    const hoyCapado = todayISO() > periodo.fin ? periodo.fin : todayISO();
    const diasTranscurridos = diasHabilesEntre(periodo.inicio, hoyCapado, diasNoLaborables);
    function proyectar(avance) {
      return diasTranscurridos > 0 ? (avance / diasTranscurridos) * diasLaborablesTotal : avance;
    }
    const fechasRef = [...avanceDia.map((r) => r.fecha), ...otcDia.map((r) => r.fecha)];
    const fechaHoyRef = fechasRef.length
      ? fechasRef.reduce((max, f) => (f > max ? f : max), fechasRef[0])
      : todayISO();

    function tabMetrics(objetivo, avance) {
      const restaPorVender = Math.max(objetivo - avance, 0);
      const ventaPorDiaNecesaria = restantes > 0 ? restaPorVender / restantes : restaPorVender;
      const avancePct = objetivo > 0 ? Math.min((avance / objetivo) * 100, 100) : 0;
      return { objetivo, avance, restaPorVender, ventaPorDiaNecesaria, avancePct };
    }

    function buildMarca(objetivo, vendido) {
      const restaPorVender = Math.max(objetivo - vendido, 0);
      const ventaPorDiaNecesaria = restantes > 0 ? restaPorVender / restantes : restaPorVender;
      return { objetivo, vendido, restaPorVender, ventaPorDiaNecesaria, pct: objetivo > 0 ? Math.min((vendido / objetivo) * 100, 100) : 0 };
    }

    const porVendedor = vendedores.map((v) => {
      // Solo se cuentan ventas dentro del rango del periodo actual. Antes se
      // sumaba TODO el historial guardado en data.ventas sin importar la
      // fecha, lo cual inflaba los totales con meses/periodos anteriores y
      // hacía crecer el renglón de la base de datos sin límite.
      const propias = ventas.filter(
        (r) => r.vendedor.trim().toLowerCase() === v.name.trim().toLowerCase()
          && r.fecha >= periodo.inicio && r.fecha <= periodo.fin
      );
      const volumenVentas = propias.reduce((s, r) => s + (Number(r.monto) || 0), 0);
      const paquetesTotal = propias.reduce((s, r) => s + (Number(r.paquetes) || 0), 0);
      // Visitas efectivas: clientes distintos por día, sumados entre días.
      // Un cliente que compra varias veces el mismo día cuenta una sola vez ese día,
      // pero si vuelve a comprar otro día, ese día cuenta aparte.
      const clientesPorDia = {};
      let visitasSueltas = 0;
      propias.forEach((r) => {
        const cliente = (r.cliente || "").trim();
        if (cliente) {
          if (!clientesPorDia[r.fecha]) clientesPorDia[r.fecha] = new Set();
          clientesPorDia[r.fecha].add(cliente);
        } else if (r.visitaEfectiva) {
          visitasSueltas++;
        }
      });
      const visitasEfectivas = visitasSueltas + Object.values(clientesPorDia).reduce((s, set) => s + set.size, 0);
      const volumenEstrategicas = propias
        .filter((r) => r.estrategica)
        .reduce((s, r) => s + (Number(r.monto) || 0), 0);

      const marcasOpen = {};
      MARCAS_OPEN.forEach((m) => {
        const vendido = propias
          .filter((r) => MARCA_KEYS[r.marca.trim().toLowerCase()] === m.key)
          .reduce((s, r) => s + (Number(r.paquetes) || 0), 0);
        marcasOpen[m.key] = buildMarca(v.objetivos?.[m.key] || 0, vendido);
      });

      const extraChampBlossSumm = propias
        .filter((r) => r.marca.trim().toLowerCase() === MARCA_CHAM_EXTRA_BLOSS_SUMM)
        .reduce((s, r) => s + (Number(r.paquetes) || 0), 0);

      const marcasChampions = {
        champIce: buildMarca(v.objetivos?.champIce || 0, marcasOpen.iceMix.vendido),
        champBlossSumm: buildMarca(v.objetivos?.champBlossSumm || 0, marcasOpen.blossMix.vendido + marcasOpen.summMix.vendido + extraChampBlossSumm),
        champFaronet: buildMarca(v.objetivos?.champFaronet || 0, marcasOpen.faronet.vendido),
      };
      const champVendido = marcasChampions.champIce.vendido + marcasChampions.champBlossSumm.vendido + marcasChampions.champFaronet.vendido;

      // Comisión OTC semanal: 7% si cubre su objetivo OTC (el mismo de MAX), 5.6% si no.
      const ventaOtcSemanal = otcSemanal
        .filter((r) => r.vendedor.trim().toLowerCase() === v.name.trim().toLowerCase())
        .reduce((s, r) => s + (Number(r.monto) || 0), 0);
      const marcaOtc = buildMarca(v.objetivos?.otc || 0, ventaOtcSemanal);
      const objetivoOtcParaComision = v.objetivos?.otc || 0;
      const cumpleObjetivoOtc = objetivoOtcParaComision > 0 && ventaOtcSemanal >= objetivoOtcParaComision;
      const tasaComisionOtc = cumpleObjetivoOtc ? 0.07 : 0.056;
      const comisionOtc = ventaOtcSemanal * tasaComisionOtc;

      const open = v.objetivos?.open || 0;
      const champions = v.objetivos?.champions || 0;
      const maxObjetivo = Math.max(open, champions);
      const tabs = {
        max: tabMetrics(maxObjetivo, paquetesTotal),
        open: tabMetrics(open, paquetesTotal),
        champions: tabMetrics(champions, paquetesTotal),
      };

      // Proyección al cierre de mes: avance ÷ días transcurridos × días laborables del periodo
      const proyectadoPaquetes = proyectar(paquetesTotal);
      const proyeccionMarcasOpen = {};
      MARCAS_OPEN.forEach((m) => {
        const proyectado = proyectar(marcasOpen[m.key].vendido);
        proyeccionMarcasOpen[m.key] = { objetivo: marcasOpen[m.key].objetivo, proyectado, cumple: proyectado >= marcasOpen[m.key].objetivo };
      });
      const proyeccionMarcasChampions = {};
      MARCAS_CHAMPIONS.forEach((m) => {
        const proyectado = proyectar(marcasChampions[m.key].vendido);
        proyeccionMarcasChampions[m.key] = { objetivo: marcasChampions[m.key].objetivo, proyectado, cumple: proyectado >= marcasChampions[m.key].objetivo };
      });
      const proyeccion = {
        max: { objetivo: maxObjetivo, proyectado: proyectadoPaquetes, cumple: proyectadoPaquetes >= maxObjetivo },
        open: { objetivo: open, proyectado: proyectadoPaquetes, cumple: proyectadoPaquetes >= open },
        champions: { objetivo: champions, proyectado: proyectadoPaquetes, cumple: proyectadoPaquetes >= champions },
        marcasOpen: proyeccionMarcasOpen,
        marcasChampions: proyeccionMarcasChampions,
      };

      // Avance del día — viene exclusivamente de avanceDia y otcDia, nunca de las ventas de OPEN/CHAMPIONS/MAX
      const propiasAvanceDia = avanceDia.filter(
        (r) => r.fecha === fechaHoyRef && r.vendedor.trim().toLowerCase() === v.name.trim().toLowerCase()
      );
      const propiasOtcDia = otcDia.filter(
        (r) => r.fecha === fechaHoyRef && r.vendedor.trim().toLowerCase() === v.name.trim().toLowerCase()
      );
      const paquetesHoy = propiasAvanceDia.reduce((s, r) => s + (Number(r.paquetes) || 0), 0);
      const otcHoy = propiasOtcDia.reduce((s, r) => s + (Number(r.monto) || 0), 0);
      const otcSinVualaPiezas = propiasOtcDia
        .filter((r) => CODIGOS_OTC_SIN_VUALA.includes((r.codigoArticulo || "").trim()))
        .reduce((s, r) => s + (Number(r.unidadesVendidas) || 0), 0);
      const otcSinVualaCumple = otcSinVualaPiezas >= OTC_SIN_VUALA_MINIMO;
      // Visitas efectivas = clientes distintos (un cliente repetido varias veces cuenta una sola vez)
      const clientesUnicos = new Set(
        propiasAvanceDia.map((r) => (r.cliente || "").trim()).filter((c) => c)
      );
      const visitasEfectivasHoy = clientesUnicos.size;
      const marcasHoy = {};
      MARCAS_DIA.forEach((m) => {
        const vendidoHoy = propiasAvanceDia
          .filter((r) => MARCA_KEYS_ALL[r.marca.trim().toLowerCase()] === m.key)
          .reduce((s, r) => s + (Number(r.paquetes) || 0), 0);
        marcasHoy[m.key] = { vendido: vendidoHoy, objetivo: marcasOpen[m.key].ventaPorDiaNecesaria };
      });
      const volumenObjetivo = tabs.max.ventaPorDiaNecesaria;
      const bajoDesempeno = volumenObjetivo > 0 && paquetesHoy < volumenObjetivo * UMBRAL_BAJO_DESEMPENO;
      const otcDiario = v.objetivos?.otcDiario || 0;

      // Evaluación ampliada: junta TODOS los indicadores del día que tengan
      // un objetivo válido (volumen, cada marca, OTC) y saca un % promedio
      // de efectividad. También arma la lista de lo que le falta a cada
      // indicador débil, para poder sugerir "vende X de Y" más adelante.
      const indicadoresDia = [];
      if (volumenObjetivo > 0) indicadoresDia.push({ label: "Volumen del día", vendido: paquetesHoy, objetivo: volumenObjetivo, unidad: "paq" });
      MARCAS_DIA.forEach((m) => {
        const obj = marcasHoy[m.key].objetivo;
        if (obj > 0) indicadoresDia.push({ label: m.label, vendido: marcasHoy[m.key].vendido, objetivo: obj, unidad: "paq" });
      });
      if (otcDiario > 0) indicadoresDia.push({ label: "OTC del día", vendido: otcHoy, objetivo: otcDiario, unidad: "$" });

      const efectividadPct = indicadoresDia.length > 0
        ? (indicadoresDia.reduce((s, ind) => s + Math.min(1, ind.vendido / ind.objetivo), 0) / indicadoresDia.length) * 100
        : 100;

      const indicadoresDebiles = indicadoresDia
        .filter((ind) => ind.vendido < ind.objetivo)
        .map((ind) => ({ ...ind, faltante: ind.objetivo - ind.vendido, faltantePct: (ind.objetivo - ind.vendido) / ind.objetivo }))
        .sort((a, b) => b.faltantePct - a.faltantePct);

      const hoy = {
        fecha: fechaHoyRef,
        volumen: { vendido: paquetesHoy, objetivo: volumenObjetivo },
        visitasEfectivas: visitasEfectivasHoy,
        marcas: marcasHoy,
        otc: { objetivo: otcDiario, vendido: otcHoy },
        otcSinVuala: { piezas: otcSinVualaPiezas, cumple: otcSinVualaCumple },
        bajoDesempeno,
        efectividadPct,
        indicadoresDebiles,
      };

      const porDiaMap = {};
      const porDiaMapUnidades = {};
      propias.forEach((r) => {
        porDiaMap[r.fecha] = (porDiaMap[r.fecha] || 0) + (Number(r.monto) || 0);
        porDiaMapUnidades[r.fecha] = (porDiaMapUnidades[r.fecha] || 0) + (Number(r.paquetes) || 0);
      });
      const ventaPorDia = Object.entries(porDiaMap)
        .sort(([a], [b]) => (a > b ? 1 : -1))
        .map(([fecha, monto]) => ({ fecha: fecha.slice(5), monto }));
      const ventaPorDiaUnidades = Object.entries(porDiaMapUnidades)
        .sort(([a], [b]) => (a > b ? 1 : -1))
        .map(([fecha, paquetes]) => ({ fecha: fecha.slice(5), paquetes }));

      return { ...v, volumenVentas, paquetesTotal, visitasEfectivas, volumenEstrategicas, marcasOpen, marcasChampions, champVendido, marcaOtc, ventaOtcSemanal, tasaComisionOtc, comisionOtc, hoy, tabs, proyeccion, ventaPorDia, ventaPorDiaUnidades };
    });

    const totalTabs = {};
    const totalVolumenVentas = porVendedor.reduce((s, v) => s + v.volumenVentas, 0);
    const totalPaquetes = porVendedor.reduce((s, v) => s + v.paquetesTotal, 0);
    ["max", "open", "champions"].forEach((tabKey) => {
      const objetivo = porVendedor.reduce((s, v) => s + v.tabs[tabKey].objetivo, 0);
      const avance = porVendedor.reduce((s, v) => s + v.tabs[tabKey].avance, 0);
      totalTabs[tabKey] = tabMetrics(objetivo, avance);
    });

    const totalMarcasOpen = {};
    MARCAS_OPEN.forEach((m) => {
      const objetivo = porVendedor.reduce((s, v) => s + v.marcasOpen[m.key].objetivo, 0);
      const vendido = porVendedor.reduce((s, v) => s + v.marcasOpen[m.key].vendido, 0);
      totalMarcasOpen[m.key] = buildMarca(objetivo, vendido);
    });

    const totalMarcasChampions = {};
    MARCAS_CHAMPIONS.forEach((m) => {
      const objetivo = porVendedor.reduce((s, v) => s + v.marcasChampions[m.key].objetivo, 0);
      const vendido = porVendedor.reduce((s, v) => s + v.marcasChampions[m.key].vendido, 0);
      totalMarcasChampions[m.key] = buildMarca(objetivo, vendido);
    });

    const totalOtcObjetivo = porVendedor.reduce((s, v) => s + v.marcaOtc.objetivo, 0);
    const totalOtcVendido = porVendedor.reduce((s, v) => s + v.marcaOtc.vendido, 0);
    const totalMarcaOtc = buildMarca(totalOtcObjetivo, totalOtcVendido);

    const totalHoyMarcas = {};
    MARCAS_DIA.forEach((m) => {
      totalHoyMarcas[m.key] = {
        vendido: porVendedor.reduce((s, v) => s + v.hoy.marcas[m.key].vendido, 0),
        objetivo: porVendedor.reduce((s, v) => s + v.hoy.marcas[m.key].objetivo, 0),
      };
    });
    const totalHoy = {
      fecha: fechaHoyRef,
      volumen: {
        vendido: porVendedor.reduce((s, v) => s + v.hoy.volumen.vendido, 0),
        objetivo: porVendedor.reduce((s, v) => s + v.hoy.volumen.objetivo, 0),
      },
      visitasEfectivas: porVendedor.reduce((s, v) => s + v.hoy.visitasEfectivas, 0),
      marcas: totalHoyMarcas,
      otc: {
        objetivo: porVendedor.reduce((s, v) => s + v.hoy.otc.objetivo, 0),
        vendido: porVendedor.reduce((s, v) => s + v.hoy.otc.vendido, 0),
      },
      otcSinVuala: {
        piezas: porVendedor.reduce((s, v) => s + v.hoy.otcSinVuala.piezas, 0),
        rutasQueCumplen: porVendedor.filter((v) => v.hoy.otcSinVuala.cumple).length,
        totalRutas: porVendedor.length,
      },
    };
    const alertas = porVendedor.filter((v) => v.hoy.bajoDesempeno);

    // Comisiones de equipo (OTC semanal) para Supervisor y Gerente
    const ventaOtcSemanalTotal = porVendedor.reduce((s, v) => s + v.ventaOtcSemanal, 0);
    const promedioComisionVendedores = porVendedor.length > 0
      ? porVendedor.reduce((s, v) => s + v.comisionOtc, 0) / porVendedor.length
      : 0;
    const promedioVentaDiariaEquipo = porVendedor.length > 0
      ? ventaOtcSemanalTotal / (porVendedor.length * DIAS_SEMANA_OTC)
      : 0;
    const comisionSupervisor = multiplicadorComision(TABLA_COMISION_SUPERVISOR, promedioVentaDiariaEquipo) * promedioComisionVendedores;
    const comisionGerente = multiplicadorComision(TABLA_COMISION_GERENTE, promedioVentaDiariaEquipo) * promedioComisionVendedores;

    const total = {
      volumenVentas: totalVolumenVentas,
      paquetesTotal: totalPaquetes,
      visitasEfectivas: porVendedor.reduce((s, v) => s + v.visitasEfectivas, 0),
      volumenEstrategicas: porVendedor.reduce((s, v) => s + v.volumenEstrategicas, 0),
      marcasOpen: totalMarcasOpen,
      marcasChampions: totalMarcasChampions,
      marcaOtc: totalMarcaOtc,
      hoy: totalHoy,
      alertas,
      tabs: totalTabs,
      ventaOtcSemanalTotal,
      promedioVentaDiariaEquipo,
      promedioComisionVendedores,
      comisionSupervisor,
      comisionGerente,
    };

    const porDiaMapTotal = {};
    const porDiaMapTotalUnidades = {};
    ventas.forEach((r) => {
      porDiaMapTotal[r.fecha] = (porDiaMapTotal[r.fecha] || 0) + (Number(r.monto) || 0);
      porDiaMapTotalUnidades[r.fecha] = (porDiaMapTotalUnidades[r.fecha] || 0) + (Number(r.paquetes) || 0);
    });
    total.ventaPorDia = Object.entries(porDiaMapTotal)
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([fecha, monto]) => ({ fecha: fecha.slice(5), monto }));
    total.ventaPorDiaUnidades = Object.entries(porDiaMapTotalUnidades)
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([fecha, paquetes]) => ({ fecha: fecha.slice(5), paquetes }));

    // Proyección de equipo (suma de proyecciones individuales vs. suma de objetivos)
    const totalProyeccion = {};
    ["max", "open", "champions"].forEach((tabKey) => {
      const objetivo = porVendedor.reduce((s, v) => s + v.proyeccion[tabKey].objetivo, 0);
      const proyectado = porVendedor.reduce((s, v) => s + v.proyeccion[tabKey].proyectado, 0);
      totalProyeccion[tabKey] = { objetivo, proyectado, cumple: proyectado >= objetivo };
    });
    const totalProyeccionMarcasOpen = {};
    MARCAS_OPEN.forEach((m) => {
      const objetivo = porVendedor.reduce((s, v) => s + v.proyeccion.marcasOpen[m.key].objetivo, 0);
      const proyectado = porVendedor.reduce((s, v) => s + v.proyeccion.marcasOpen[m.key].proyectado, 0);
      totalProyeccionMarcasOpen[m.key] = { objetivo, proyectado, cumple: proyectado >= objetivo };
    });
    const totalProyeccionMarcasChampions = {};
    MARCAS_CHAMPIONS.forEach((m) => {
      const objetivo = porVendedor.reduce((s, v) => s + v.proyeccion.marcasChampions[m.key].objetivo, 0);
      const proyectado = porVendedor.reduce((s, v) => s + v.proyeccion.marcasChampions[m.key].proyectado, 0);
      totalProyeccionMarcasChampions[m.key] = { objetivo, proyectado, cumple: proyectado >= objetivo };
    });
    totalProyeccion.marcasOpen = totalProyeccionMarcasOpen;
    totalProyeccion.marcasChampions = totalProyeccionMarcasChampions;
    total.proyeccion = totalProyeccion;

    // Ranking de efectividad del día: el más bajo se propone para "LA
    // TERCERA MANO DEL PACHUCO", y los 3 más bajos reciben la alerta. Solo
    // se considera a quien ya tenga al menos un indicador con objetivo
    // válido (evita marcar a alguien sin datos como "el peor").
    const rankingDesempeno = porVendedor
      .filter((v) => (v.hoy.indicadoresDebiles.length > 0 || v.hoy.efectividadPct < 100) && v.hoy.volumen.objetivo > 0)
      .slice()
      .sort((a, b) => a.hoy.efectividadPct - b.hoy.efectividadPct);
    const peorVendedorNombre = rankingDesempeno[0]?.name || null;
    const bottom3Nombres = rankingDesempeno.slice(0, 3).map((v) => v.name);

    return { porVendedor, total, restantes, diasTranscurridos, diasLaborablesTotal, peorVendedorNombre, bottom3Nombres };
  }, [vendedores, ventas, avanceDia, otcDia, otcSemanal, diasNoLaborables, periodo]);

  async function procesarFilasOtcSemanal(filas) {
    const registros = convertirFilasOtcDia(filas);
    if (registros.length === 0) {
      setStatus("No se encontraron filas válidas. Revisa el formato.");
      return;
    }
    persist({ ...data, otcSemanal: registros });
    const fechas = [...new Set(registros.map((r) => r.fecha))];
    setStatus(`OTC semanal cargado: ${registros.length} registros para ${fechas.join(", ")}.`);
  }

  async function handleOtcSemanalFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const filas = await parsearArchivoComoFilas(file);
      await procesarFilasOtcSemanal(filas);
    } catch (err) {
      setStatus("No se pudo leer el archivo. Verifica que tenga las columnas Vendedor, Fecha Venta y TOTAL $.");
    }
  }

  function handleOtcSemanalTexto(texto) {
    try {
      const filas = parseTextoDelimitado(texto);
      if (filas.length === 0) {
        setStatus("No se pudo interpretar el texto pegado. Verifica que incluya el encabezado y al menos una fila.");
        return;
      }
      procesarFilasOtcSemanal(filas);
    } catch (err) {
      setStatus("No se pudo interpretar el texto pegado.");
    }
  }

  function handleObjetivosFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        const num = (v) => Number(v || 0) || 0;

        const byRuta = {};
        rows.forEach((r) => {
          const ruta = String(r.RUTA || r.Ruta || r.ruta || "").trim();
          if (!ruta) return;
          byRuta[ruta.toLowerCase()] = {
            open: num(r.OPEN), champions: num(r.CHAMPIONS), max: num(r.MAX),
            visitasEfectivas: num(r.VISITAS_EFECTIVAS),
            iceMix: num(r["ICE MIX"]), blossMix: num(r["BLOSS MIX"]),
            summMix: num(r["SUMM MIX"]), faronet: num(r.FARONET),
            champIce: num(r.CHAM_ICE), champBlossSumm: num(r["CHAM_BLOSS-SUMM"]),
            champFaronet: num(r.CHAM_FARONET), otc: num(r.OTC), otcDiario: r.OTC_DIA !== undefined && r.OTC_DIA !== "" ? num(r.OTC_DIA) : 1600,
          };
        });

        if (Object.keys(byRuta).length === 0) {
          setObjStatus("El archivo no tiene filas válidas. Revisa la columna RUTA.");
          return;
        }

        let vendedores = data.vendedores.map((v) => {
          const match = byRuta[v.name.trim().toLowerCase()];
          if (!match) return v;
          delete byRuta[v.name.trim().toLowerCase()];
          return { ...v, objetivos: { ...blankObjetivos(), ...match } };
        });
        // Rutas nuevas que no existían aún
        Object.entries(byRuta).forEach(([key, match]) => {
          vendedores.push({ id: "v" + Date.now() + Math.random(), name: key.toUpperCase(), objetivos: { ...blankObjetivos(), ...match } });
        });

        persist({ ...data, vendedores });
        setObjStatus(`Objetivos actualizados para ${rows.length} rutas.`);
      } catch (err) {
        setObjStatus("No se pudo leer el archivo. ¿Es un .xlsx o .csv válido?");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  }

  function downloadObjetivosTemplate() {
    const filas = (data.vendedores || []).map((v) => ({
      RUTA: v.name,
      OPEN: v.objetivos?.open || 0,
      CHAMPIONS: v.objetivos?.champions || 0,
      MAX: v.objetivos?.max || 0,
      VISITAS_EFECTIVAS: v.objetivos?.visitasEfectivas || 0,
      "ICE MIX": v.objetivos?.iceMix || 0,
      "BLOSS MIX": v.objetivos?.blossMix || 0,
      "SUMM MIX": v.objetivos?.summMix || 0,
      FARONET: v.objetivos?.faronet || 0,
      CHAM_ICE: v.objetivos?.champIce || 0,
      "CHAM_BLOSS-SUMM": v.objetivos?.champBlossSumm || 0,
      CHAM_FARONET: v.objetivos?.champFaronet || 0,
      OTC: v.objetivos?.otc || 0,
      OTC_DIA: v.objetivos?.otcDiario || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Objetivos");
    XLSX.writeFile(wb, "plantilla_objetivos.xlsx");
  }

  // Convierte las filas crudas (leídas con header:1) de una hoja en formato
  // "largo": una fila por cada combinación ruta+artículo, con columnas
  // Codigo_Vendedor, Codigo_Articulo, Nombre corto (opcional) y Cantidad.
  // Es el formato más simple y confiable — se intenta primero.
  function convertirCargaLarga(filas) {
    if (!filas || filas.length === 0) return { items: [], error: "El archivo está vacío." };
    const encabezado = (filas[0] || []).map((v) => String(v || "").trim().toLowerCase());
    const idxRuta = encabezado.findIndex((h) => h.includes("codigo_vendedor") || h.includes("codigo vendedor") || h === "vendedor" || h === "ruta");
    const idxFA = encabezado.findIndex((h) => h.includes("codigo_articulo") || h.includes("codigo articulo") || h === "fa" || h === "articulo");
    const idxMarca = encabezado.findIndex((h) => h.includes("nombre corto") || h.includes("marca") || h.includes("descripcion"));
    const idxCantidad = encabezado.findIndex((h) => h.includes("cantidad"));

    if (idxRuta === -1 || idxFA === -1 || idxCantidad === -1) {
      return { items: [], error: "No se encontraron las columnas Codigo_Vendedor, Codigo_Articulo y Cantidad." };
    }

    const itemsMap = {};
    for (let i = 1; i < filas.length; i++) {
      const fila = filas[i] || [];
      const rutaCodigo = String(fila[idxRuta] || "").trim().toUpperCase();
      const fa = String(fila[idxFA] || "").trim().toUpperCase();
      if (!rutaCodigo || !fa) continue;
      const marca = idxMarca !== -1 ? String(fila[idxMarca] || "").trim() : fa;
      const cantidad = Number(fila[idxCantidad]);
      const nombreRuta = `RUTA ${rutaCodigo}`;
      const key = `${fa}|${marca}`;
      if (!itemsMap[key]) itemsMap[key] = { fa, marca, porRuta: {} };
      itemsMap[key].porRuta[nombreRuta] = { inicial: isNaN(cantidad) ? 0 : cantidad, modificada: null };
    }
    const items = Object.values(itemsMap);
    return { items, error: items.length === 0 ? "No se encontraron filas válidas." : null };
  }

  // Convierte las filas crudas (leídas con header:1) de la hoja "Carga
  // Propuesta" en una lista de artículos. Formato esperado (tabla dinámica):
  // una fila de encabezado con "Etiquetas de fila", J201, J202, ... J207;
  // luego, por cada código FA, una fila solo con el código (sin cantidades)
  // seguida de una o más filas de marca con la cantidad por ruta.
  // (Se usa solo como respaldo si ninguna hoja viene en formato "largo".)
  function convertirCargaPropuesta(filas) {
    let indiceEncabezado = -1;
    const columnasRuta = {}; // { "RUTA J201": indiceColumna, ... }
    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i] || [];
      const rutasEnFila = fila
        .map((v, idx) => ({ v: String(v || "").trim(), idx }))
        .filter((c) => /^J\d{3}$/i.test(c.v));
      if (rutasEnFila.length >= 3) {
        indiceEncabezado = i;
        rutasEnFila.forEach((c) => { columnasRuta[`RUTA ${c.v.toUpperCase()}`] = c.idx; });
        break;
      }
    }
    if (indiceEncabezado === -1) {
      return { items: [], error: "No se encontró el encabezado con las rutas (J201, J202, ...) en la hoja \"Carga Propuesta\"." };
    }

    const items = [];
    let faActual = null;
    for (let i = indiceEncabezado + 1; i < filas.length; i++) {
      const fila = filas[i] || [];
      const col1 = String(fila[1] || "").trim();
      if (!col1) continue;
      if (/^FA\d+/i.test(col1)) {
        faActual = col1.toUpperCase();
        continue;
      }
      if (col1.toLowerCase() === "total general" || col1.toLowerCase().includes("en blanco")) continue;

      const porRuta = {};
      Object.entries(columnasRuta).forEach(([ruta, idx]) => {
        const val = Number(fila[idx]);
        porRuta[ruta] = { inicial: isNaN(val) ? 0 : val, modificada: null };
      });
      items.push({ fa: faActual || "SIN_FA", marca: col1, porRuta });
    }
    return { items, error: null };
  }

  function handleCargasFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        let resultado = null;
        let hojaUsada = null;

        // 1) Buscar primero alguna hoja en formato "largo" (más confiable).
        for (const nombreHoja of wb.SheetNames) {
          const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, defval: "" });
          const intento = convertirCargaLarga(filas);
          if (!intento.error) {
            resultado = intento;
            hojaUsada = nombreHoja;
            break;
          }
        }

        // 2) Si ninguna hoja vino en formato largo, usar "Carga Propuesta" (tabla dinámica).
        if (!resultado) {
          hojaUsada = wb.SheetNames.find((n) => n.trim().toLowerCase() === "carga propuesta") || wb.SheetNames[0];
          const filas = XLSX.utils.sheet_to_json(wb.Sheets[hojaUsada], { header: 1, defval: "" });
          resultado = convertirCargaPropuesta(filas);
        }

        if (resultado.error) {
          setCargasStatus(resultado.error);
          return;
        }
        if (resultado.items.length === 0) {
          setCargasStatus("No se encontraron artículos válidos en el archivo.");
          return;
        }
        persist({ ...data, cargas: { fecha: fechaHoyISO(), bloqueado: false, items: resultado.items, enviosPorRuta: {} } });
        setCargasStatus(`Carga actualizada: ${resultado.items.length} artículos, hoja "${hojaUsada}".`);
      } catch (err) {
        console.error(err);
        setCargasStatus("No se pudo leer el archivo. Verifica el formato.");
      }
    };
    reader.readAsBinaryString(file);
  }

  function descargarCargasModificadas() {
    const cargas = data.cargas;
    if (!cargas?.items?.length) {
      alert("No hay una carga cargada todavía.");
      return;
    }
    // Mismo formato "largo" con el que se sube: una fila por cada
    // combinación ruta + artículo, con la cantidad final (propuesta del
    // vendedor si la cambió, o la inicial si no).
    const filas = [];
    cargas.items.forEach((it) => {
      Object.entries(it.porRuta).forEach(([nombreRuta, porRuta]) => {
        const cantidad = porRuta.modificada != null ? porRuta.modificada : porRuta.inicial;
        filas.push({
          Codigo_Vendedor: nombreRuta.replace("RUTA ", ""),
          Codigo_Articulo: it.fa,
          "Nombre corto": it.marca,
          Cantidad: cantidad,
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Carga Modificada");
    XLSX.writeFile(wb, `carga_modificada_${cargas.fecha || fechaHoyISO()}.xlsx`);
    // Una vez descargado, se bloquea para que los vendedores ya no puedan modificar.
    persist({ ...data, cargas: { ...cargas, bloqueado: true } });
  }

  function downloadOtcSemanalTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { Vendedor: "J201 - J201 - FRANCISCO JAVIER MONTES MADERO", "Fecha Venta": "27/07/2026 00:00:00", "TOTAL $": 1234.5 },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "OTC");
    XLSX.writeFile(wb, "plantilla_otc_semanal.xlsx");
  }

  // Convierte filas del reporte crudo del sistema (objetos ya parseados, sin importar
  // si vinieron de un .xlsx o de texto separado por tabs/comas) a registros de venta
  // compatibles con el resto de la app.
  function convertirFilasAvanceDia(rows) {
    const getVal = (row, name) => {
      const key = Object.keys(row).find((k) => k.trim().toLowerCase() === name.toLowerCase());
      return key !== undefined ? row[key] : "";
    };
    const registros = [];
    rows.forEach((row) => {
      const vendedorRaw = String(getVal(row, "Vendedor") || "").trim();
      const codigo = vendedorRaw.split(" - ")[0].trim();
      if (!codigo) return;
      const vendedor = `RUTA ${codigo}`;

      const fechaRaw = String(getVal(row, "Fecha") || "").trim();
      const datePart = fechaRaw.split(" ")[0];
      const [dd, mm, yyyy] = datePart.split("/");
      if (!dd || !mm || !yyyy) return;
      const fecha = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;

      const articulo = String(getVal(row, "Articulo") || getVal(row, "Artículo") || "").trim().toUpperCase();
      const marca = ARTICULO_MARCA_LABEL[articulo] || "";
      const paquetes = Number(getVal(row, "Paquetes") || 0) || 0;
      const monto = Number(getVal(row, "Total $") || getVal(row, "Total") || 0) || 0;
      const cliente = String(getVal(row, "Cliente") || "").trim();

      registros.push({ fecha, vendedor, marca, cliente, monto, paquetes });
    });
    return registros;
  }

  // Convierte filas del reporte de OTC (Vendedor, ..., Fecha Venta, TOTAL $) a registros
  // exclusivos para la pestaña DÍA. El avance de OTC es la suma de TOTAL $ por ruta,
  // sin importar cuántos artículos distintos aparezcan.
  function convertirFilasOtcDia(rows) {
    const getVal = (row, ...names) => {
      const keys = Object.keys(row);
      for (const name of names) {
        const key = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
        if (key !== undefined) return row[key];
      }
      return "";
    };
    const registros = [];
    rows.forEach((row) => {
      const vendedorRaw = String(getVal(row, "Vendedor") || "").trim();
      const codigo = vendedorRaw.split(" - ")[0].trim();
      if (!codigo) return;
      const vendedor = `RUTA ${codigo}`;

      const fechaRaw = String(getVal(row, "Fecha Venta", "Fecha") || "").trim();
      const datePart = fechaRaw.split(" ")[0];
      const [dd, mm, yyyy] = datePart.split("/");
      if (!dd || !mm || !yyyy) return;
      const fecha = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;

      const monto = Number(getVal(row, "TOTAL $", "Total $", "Total") || 0) || 0;
      const codigoArticulo = String(getVal(row, "Codigo", "Código") || "").trim();
      const unidadesVendidas = Number(getVal(row, "Unidades") || 0) || 0;

      registros.push({ fecha, vendedor, monto, codigoArticulo, unidadesVendidas });
    });
    return registros;
  }

  // Convierte filas del reporte crudo del sistema al esquema de `ventas` (el que
  // alimenta OPEN, CHAMPIONS y MAX), para la carga acumulada del periodo.
  function convertirFilasVentasPeriodo(rows) {
    const getVal = (row, name) => {
      const key = Object.keys(row).find((k) => k.trim().toLowerCase() === name.toLowerCase());
      return key !== undefined ? row[key] : "";
    };
    const registros = [];
    rows.forEach((row) => {
      const vendedorRaw = String(getVal(row, "Vendedor") || "").trim();
      const codigo = vendedorRaw.split(" - ")[0].trim();
      if (!codigo) return;
      const vendedor = `RUTA ${codigo}`;

      const fechaRaw = String(getVal(row, "Fecha") || "").trim();
      const datePart = fechaRaw.split(" ")[0];
      const [dd, mm, yyyy] = datePart.split("/");
      if (!dd || !mm || !yyyy) return;
      const fecha = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;

      const articulo = String(getVal(row, "Articulo") || getVal(row, "Artículo") || "").trim().toUpperCase();
      const marca = ARTICULO_MARCA_LABEL[articulo] || "";
      const paquetes = Number(getVal(row, "Paquetes") || 0) || 0;
      const monto = Number(getVal(row, "Total $") || getVal(row, "Total") || 0) || 0;
      const cliente = String(getVal(row, "Cliente") || "").trim();

      registros.push({ fecha, vendedor, marca, estrategica: false, monto, paquetes, visitaEfectiva: false, cliente });
    });
    return registros;
  }

  // Convierte filas del reporte de "mesa de control" (visitas del día: horarios,
  // tiempo de estancia, tipo de inicio/fin, volumen, descuento) por cliente/visita.
  function convertirFilasMesaControl(rows) {
    const getVal = (row, ...names) => {
      const keys = Object.keys(row);
      for (const name of names) {
        const key = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
        if (key !== undefined) return row[key];
      }
      return "";
    };
    const registros = [];
    rows.forEach((row) => {
      const vendedorRaw = String(getVal(row, "vendedor") || "").trim();
      const codigo = vendedorRaw.split(" - ")[0].trim();
      if (!codigo) return;
      const vendedor = `RUTA ${codigo}`;

      const fechaRaw = String(getVal(row, "fecha") || "").trim();
      const datePart = fechaRaw.split(" ")[0];
      const [dd, mm, yyyy] = datePart.split("/");
      if (!dd || !mm || !yyyy) return;
      const fecha = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;

      const cliente = String(getVal(row, "cliente") || "").trim();
      const inicio = String(getVal(row, "inicio") || "").trim();
      const final = String(getVal(row, "final") || "").trim();
      const tiempoEstancia = Number(getVal(row, "Tiempo_estancia", "tiempo_estancia") || 0) || 0;
      const tipoInicio = String(getVal(row, "tipoinicio") || "").trim().toUpperCase();
      const tipoFin = String(getVal(row, "tipofin") || "").trim().toUpperCase();
      const volumen = Number(getVal(row, "volumen") || 0) || 0;
      const descuento = Number(getVal(row, "descuento") || 0) || 0;

      registros.push({ vendedor, fecha, cliente, inicio, final, tiempoEstancia, tipoInicio, tipoFin, volumen, descuento });
    });
    return registros;
  }


  function parseTextoDelimitado(text) {
    const lineas = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
    if (lineas.length < 2) return [];
    const primera = lineas[0];
    const delim = primera.includes("\t") ? "\t" : primera.includes(";") ? ";" : ",";
    const headers = primera.split(delim).map((h) => h.trim());
    const rows = [];
    for (let i = 1; i < lineas.length; i++) {
      const cols = lineas[i].split(delim);
      const row = {};
      headers.forEach((h, idx) => { row[h] = cols[idx]; });
      rows.push(row);
    }
    return rows;
  }

  function leerArchivoComoTexto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (evt) => resolve(evt.target.result);
      reader.onerror = () => reject(new Error("No se pudo leer " + file.name));
      reader.readAsText(file);
    });
  }

  function leerArchivoComoBinario(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (evt) => resolve(evt.target.result);
      reader.onerror = () => reject(new Error("No se pudo leer " + file.name));
      reader.readAsBinaryString(file);
    });
  }

  async function parsearArchivoComoFilas(file) {
    const esExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (esExcel) {
      const contenido = await leerArchivoComoBinario(file);
      const wb = XLSX.read(contenido, { type: "binary" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(sheet, { defval: "" });
    }
    const contenido = await leerArchivoComoTexto(file);
    return parseTextoDelimitado(contenido);
  }

  // YA NO SE USA: se dejó por si acaso, pero handleVentasPeriodoFile ahora
  // guarda directo en la tabla ventas_periodo (borra+inserta por fecha) en
  // vez de fusionar un historial dentro del JSON grande.
  function fusionarPorFecha(historialActual, registrosNuevos) {
    const fechasNuevas = new Set(registrosNuevos.map((r) => r.fecha));
    const historialSinEsasFechas = (historialActual || []).filter((r) => !fechasNuevas.has(r.fecha));
    return { historial: [...historialSinEsasFechas, ...registrosNuevos], fechas: [...fechasNuevas].sort() };
  }

  async function procesarFilasAvanceDia(filas) {
    const registros = convertirFilasAvanceDia(filas);
    if (registros.length === 0) {
      setAvanceDiaStatus("No se encontraron filas válidas. Revisa el formato.");
      return;
    }
    persist({ ...data, avanceDia: registros });
    const fechas = [...new Set(registros.map((r) => r.fecha))];
    setAvanceDiaStatus(`Avance cargado: ${registros.length} registros para ${fechas.join(", ")}.`);
  }

  async function handleAvanceDiaFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const filas = await parsearArchivoComoFilas(file);
      await procesarFilasAvanceDia(filas);
    } catch (err) {
      setAvanceDiaStatus("No se pudo leer el archivo. Verifica que tenga las columnas Vendedor, Fecha, Articulo, Paquetes y Total $.");
    }
  }

  function handleAvanceDiaTexto(texto) {
    try {
      const filas = parseTextoDelimitado(texto);
      if (filas.length === 0) {
        setAvanceDiaStatus("No se pudo interpretar el texto pegado. Verifica que incluya el encabezado y al menos una fila.");
        return;
      }
      procesarFilasAvanceDia(filas);
    } catch (err) {
      setAvanceDiaStatus("No se pudo interpretar el texto pegado.");
    }
  }

  async function procesarFilasOtcDia(filas) {
    const registros = convertirFilasOtcDia(filas);
    if (registros.length === 0) {
      setOtcDiaStatus("No se encontraron filas válidas. Revisa el formato.");
      return;
    }
    persist({ ...data, otcDia: registros });
    const fechas = [...new Set(registros.map((r) => r.fecha))];
    setOtcDiaStatus(`OTC cargado: ${registros.length} registros para ${fechas.join(", ")}.`);
  }

  async function handleOtcDiaFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const filas = await parsearArchivoComoFilas(file);
      await procesarFilasOtcDia(filas);
    } catch (err) {
      setOtcDiaStatus("No se pudo leer el archivo. Verifica que tenga las columnas Vendedor, Fecha Venta y TOTAL $.");
    }
  }

  function handleOtcDiaTexto(texto) {
    try {
      const filas = parseTextoDelimitado(texto);
      if (filas.length === 0) {
        setOtcDiaStatus("No se pudo interpretar el texto pegado. Verifica que incluya el encabezado y al menos una fila.");
        return;
      }
      procesarFilasOtcDia(filas);
    } catch (err) {
      setOtcDiaStatus("No se pudo interpretar el texto pegado.");
    }
  }

  // Carga acumulada del periodo: alimenta `ventas` (OPEN, CHAMPIONS y MAX).
  // Acepta hasta 2 archivos (se combinan). Se guarda directo en la tabla
  // ventas_periodo. IMPORTANTE: primero se INSERTAN las filas nuevas y hasta
  // que eso tiene éxito se BORRAN las filas viejas de esas mismas fechas.
  // Así, si falla la conexión a medio camino, nunca se pierde el día
  // anterior sin haber guardado el reemplazo (antes se borraba primero y,
  // si el insert fallaba después, el día se quedaba vacío).
  // Reintenta una llamada a Supabase hasta 3 veces si falla por un problema
  // de red (fetch), con una pequeña espera entre intento e intento. Ayuda a
  // que un tropiezo momentáneo de wifi/datos no tire toda la carga.
  async function conReintento(fn, intentos = 5, esperaMs = 1200) {
    let ultimoError = null;
    for (let intento = 1; intento <= intentos; intento++) {
      const resultado = await fn();
      if (!resultado.error) return resultado;
      ultimoError = resultado.error;
      const esErrorDeRed = /fetch|network|failed to fetch/i.test(resultado.error.message || "");
      if (!esErrorDeRed || intento === intentos) return resultado;
      await new Promise((r) => setTimeout(r, esperaMs * intento));
    }
    return { error: ultimoError };
  }

  async function procesarFilasVentasPeriodo(filas, etiquetaOrigen) {
    setVentasPeriodoStatus(`Procesando ${etiquetaOrigen}...`);
    const registros = convertirFilasVentasPeriodo(filas);
    if (registros.length === 0) {
      setVentasPeriodoStatus("No se encontraron filas válidas. Revisa el formato.");
      return;
    }

    const fechas = [...new Set(registros.map((r) => r.fecha))];
    // Momento justo antes de insertar: al borrar después, solo se quitan
    // las filas de esas fechas que ya existían ANTES de este momento (las
    // recién insertadas quedan intactas, sin importar el orden en que
    // Postgres procese cada fila).
    const momentoAntes = new Date().toISOString();

    const filasParaInsertar = registros.map((r) => ({
      vendedor: r.vendedor,
      fecha: r.fecha,
      marca: r.marca,
      paquetes: r.paquetes,
      monto: r.monto,
      cliente: r.cliente,
    }));

    // 1) Insertar primero, en lotes por seguridad (más chicos, con reintento
    // automático si falla por un problema de red momentáneo). Si un lote
    // falla incluso tras los reintentos, se sigue con los siguientes en
    // vez de detener todo — así se aprovecha lo que sí logre pasar con una
    // conexión inestable (datos móviles, por ejemplo).
    const TAMANO_LOTE = 150;
    let lotesConError = 0;
    const totalLotes = Math.ceil(filasParaInsertar.length / TAMANO_LOTE);
    for (let i = 0; i < filasParaInsertar.length; i += TAMANO_LOTE) {
      const lote = filasParaInsertar.slice(i, i + TAMANO_LOTE);
      const loteNum = Math.floor(i / TAMANO_LOTE) + 1;
      setVentasPeriodoStatus(`Guardando lote ${loteNum} de ${totalLotes} (${Math.min(i + TAMANO_LOTE, filasParaInsertar.length)} de ${filasParaInsertar.length} registros)...`);
      const { error: insError } = await conReintento(() => supabase.from("ventas_periodo").insert(lote));
      if (insError) {
        console.error(`Error insertando lote ${loteNum}:`, insError);
        lotesConError++;
      }
    }

    if (lotesConError > 0) {
      setVentasPeriodoStatus(`Se guardó parte de la información, pero ${lotesConError} de ${totalLotes} lotes fallaron por la conexión. No se borró nada de lo anterior — vuelve a subir/pegar lo mismo para completar lo que falta (es seguro repetirlo).`);
      await cargarVentasPeriodo(data.periodo);
      return;
    }

    // 2) Ya que TODO el insert tuvo éxito, se borra lo viejo de esas fechas.
    const { error: delError } = await conReintento(() =>
      supabase
        .from("ventas_periodo")
        .delete()
        .in("fecha", fechas)
        .lt("created_at", momentoAntes)
    );

    if (delError) {
      console.error("Error borrando ventas previas:", delError);
      setVentasPeriodoStatus(`Se guardaron los datos nuevos, pero no se pudo limpiar lo anterior de esas fechas: ${delError.message}. Puedes usar "Borrar todo" y volver a subir si ves duplicados.`);
      await cargarVentasPeriodo(data.periodo);
      return;
    }

    await cargarVentasPeriodo(data.periodo);
    setVentasPeriodoStatus(`Periodo actualizado: ${registros.length} registros (${etiquetaOrigen}) para ${fechas.join(", ")}.`);
  }

  async function handleVentasPeriodoFile(e) {
    const files = Array.from(e.target.files || []).slice(0, 2);
    e.target.value = "";
    if (files.length === 0) return;
    try {
      const filasPorArchivo = await Promise.all(files.map(parsearArchivoComoFilas));
      await procesarFilasVentasPeriodo(filasPorArchivo.flat(), `${files.length} archivo${files.length > 1 ? "s" : ""}`);
    } catch (err) {
      console.error(err);
      setVentasPeriodoStatus("No se pudo leer el archivo. Verifica que tenga las columnas Vendedor, Fecha, Articulo, Paquetes y Total $.");
    }
  }

  async function handleVentasPeriodoTexto(texto) {
    try {
      const filas = parseTextoDelimitado(texto);
      if (filas.length === 0) {
        setVentasPeriodoStatus("No se pudo interpretar el texto pegado. Verifica que incluya el encabezado y al menos una fila.");
        return;
      }
      await procesarFilasVentasPeriodo(filas, "texto pegado");
    } catch (err) {
      console.error(err);
      setVentasPeriodoStatus("No se pudo interpretar el texto pegado.");
    }
  }

  // Borra TODO lo guardado en ventas_periodo (todas las fechas, todas las
  // rutas). Pensado como botón de "reiniciar" ante duplicados u otro
  // problema, no se puede deshacer.
  async function borrarTodoVentasPeriodo() {
    const confirmado = window.confirm(
      "¿Seguro que quieres borrar TODO el avance de ventas guardado (todas las fechas y rutas)? Esta acción no se puede deshacer."
    );
    if (!confirmado) return;
    try {
      setVentasPeriodoStatus("Borrando todo el avance de ventas...");
      const { error } = await supabase.from("ventas_periodo").delete().gte("id", 0);
      if (error) {
        console.error("Error al borrar ventas_periodo:", error);
        setVentasPeriodoStatus(`Error al borrar: ${error.message} (code: ${error.code || "?"})`);
        return;
      }
      await cargarVentasPeriodo(data.periodo);
      setVentasPeriodoStatus("Se borró todo el avance de ventas guardado.");
    } catch (err) {
      console.error(err);
      setVentasPeriodoStatus(`Error de red al borrar: ${err?.message || String(err)}`);
    }
  }


  // Fusiona la mesa de control ruta por ruta:
  // - Si la ruta ya tenía registros de la MISMA fecha que trae la carga nueva,
  //   se SUMAN (se acumulan las visitas nuevas a las existentes). Esto permite
  //   subir un archivo por ruta, uno a la vez, y que se vayan sumando durante
  //   el día sin perder lo que ya se había cargado.
  // - Si la ruta tenía registros de OTRA fecha distinta a la nueva, se asume
  //   que es un nuevo día para esa ruta y se REEMPLAZA todo lo anterior de
  //   esa ruta por los registros nuevos.
  // Aplica igual si se sube 1 archivo (una ruta) o hasta 7 (varias rutas).
  // Identifica una visita de forma única (misma ruta, fecha, cliente y
  // horario) para poder detectar si ya estaba registrada y no contarla dos
  // veces al sumar (por ejemplo si se resube el mismo archivo sin querer).
  function claveVisitaMesaControl(r) {
    return `${r.vendedor}|${r.fecha}|${r.cliente}|${r.inicio}|${r.final}`;
  }

  function fusionarMesaControlPorRuta(historialActual, registrosNuevos) {
    const porRuta = {};
    registrosNuevos.forEach((r) => {
      if (!porRuta[r.vendedor]) porRuta[r.vendedor] = [];
      porRuta[r.vendedor].push(r);
    });

    let resultado = [...(historialActual || [])];
    const resumen = [];

    Object.entries(porRuta).forEach(([ruta, nuevos]) => {
      const fechaNueva = nuevos[0]?.fecha;
      const existentesRuta = resultado.filter((r) => r.vendedor === ruta);
      const fechaExistente = existentesRuta[0]?.fecha;

      if (existentesRuta.length === 0 || fechaExistente === fechaNueva) {
        // No había nada de esa ruta, o es la misma fecha: se suma, pero
        // ignorando visitas que ya estuvieran registradas exactamente igual
        // (mismo cliente + mismo horario) para no duplicar por accidente.
        const clavesExistentes = new Set(existentesRuta.map(claveVisitaMesaControl));
        const nuevosSinDuplicar = nuevos.filter((r) => !clavesExistentes.has(claveVisitaMesaControl(r)));
        const duplicados = nuevos.length - nuevosSinDuplicar.length;
        resultado = [...resultado, ...nuevosSinDuplicar];
        resumen.push({ ruta, fecha: fechaNueva, accion: "sumado", agregados: nuevosSinDuplicar.length, duplicados });
      } else {
        // Fecha distinta a la que ya había para esa ruta: se reemplaza.
        resultado = resultado.filter((r) => r.vendedor !== ruta).concat(nuevos);
        resumen.push({ ruta, fecha: fechaNueva, accion: "reemplazado", agregados: nuevos.length, duplicados: 0 });
      }
    });

    return { historial: resultado, resumen };
  }

  async function procesarFilasMesaControl(filas, etiquetaOrigen) {
    const registros = convertirFilasMesaControl(filas);
    if (registros.length === 0) {
      setMesaControlStatus("No se encontraron filas válidas. Revisa el formato.");
      return;
    }

    const { historial: mesaControlMerged, resumen } = fusionarMesaControlPorRuta(data?.mesaControl || [], registros);

    const next = { ...(data || defaultData()), mesaControl: mesaControlMerged };
    setData(next);

    const { error } = await supabase
      .from("ventas_app_state")
      .upsert({
        id: STATE_ID,
        data: next,
        updated_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      console.error("Error guardando mesa de control:", error);
      setMesaControlStatus(`Error al guardar en la nube: ${error.message} (code: ${error.code || "?"})`);
    } else {
      const detalle = resumen
        .map((r) => {
          if (r.accion === "sumado") {
            const nota = r.duplicados > 0 ? ` (se ignoraron ${r.duplicados} ya registradas)` : "";
            return `${r.ruta} ${r.fecha}: +${r.agregados} sumadas${nota}`;
          }
          return `${r.ruta} ${r.fecha}: reemplazó datos anteriores de la ruta (${r.agregados} visitas)`;
        })
        .join(" · ");
      setMesaControlStatus(`Mesa de control guardada: ${etiquetaOrigen}. ${detalle}. Total acumulado: ${mesaControlMerged.length} visitas.`);
    }
  }

  async function handleMesaControlFile(e) {
    // Hasta 7 archivos a la vez (uno por ruta), o se puede subir de 1 en 1.
    const files = Array.from(e.target.files || []).slice(0, 7);
    e.target.value = "";
    if (files.length === 0) return;
    try {
      setMesaControlStatus(`Procesando ${files.length} archivo${files.length > 1 ? "s" : ""}...`);
      const filasPorArchivo = await Promise.all(files.map(parsearArchivoComoFilas));
      await procesarFilasMesaControl(filasPorArchivo.flat(), `${files.length} archivo${files.length > 1 ? "s" : ""}`);
    } catch (err) {
      console.error(err);
      setMesaControlStatus(`No se pudo procesar el archivo: ${err?.message || "revisa columnas vendedor, fecha, cliente, inicio, final, Tiempo_estancia, tipoinicio, tipofin, volumen y descuento."}`);
    }
  }

  async function handleMesaControlTexto(texto) {
    try {
      const filas = parseTextoDelimitado(texto);
      if (filas.length === 0) {
        setMesaControlStatus("No se pudo interpretar el texto pegado. Verifica que incluya el encabezado y al menos una fila.");
        return;
      }
      await procesarFilasMesaControl(filas, "texto pegado");
    } catch (err) {
      console.error(err);
      setMesaControlStatus("No se pudo interpretar el texto pegado.");
    }
  }

  if (!data) return <div style={{ padding: 40, color: "#9AA7BD" }}>Cargando…</div>;

  return (
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap');
        .app { min-height:100vh; background:#0B1220; color:#E8EDF5; font-family:'Inter',sans-serif; }
        .display { font-family:'Oswald',sans-serif; letter-spacing:0.02em; }
        .mono { font-family:'JetBrains Mono',monospace; }
        .card { background:#131C30; border:1px solid #1E2A42; border-radius:14px; }
        .btn { background:#F2B134; color:#1A1300; font-weight:600; border:none; border-radius:10px; padding:10px 16px; cursor:pointer; transition:transform .1s; }
        .btn:hover { transform:translateY(-1px); }
        .btn-ghost { background:transparent; border:1px solid #2A3852; color:#E8EDF5; border-radius:10px; padding:10px 16px; cursor:pointer; }
        .track { position:relative; height:10px; background:#1E2A42; border-radius:999px; overflow:visible; }
        .track-fill { height:10px; border-radius:999px; background:linear-gradient(90deg,#3DDC97,#F2B134); transition:width .4s; }
        .pin { position:absolute; top:-11px; transform:translateX(-50%); transition:left .4s; }
        input, select { background:#0F172A; border:1px solid #2A3852; color:#E8EDF5; border-radius:8px; padding:8px 10px; }
        @keyframes splashFade { 0% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; visibility: hidden; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {showSplash && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
            background: "#cfe3ee", pointerEvents: "none", animation: "splashFade 1.8s ease forwards",
          }}
        >
          <img src={SPLASH_IMAGE} alt="Marjusware SmartTrack" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      )}

      {!role && (
        <Login
          onLogin={(user) => {
            setRole(user.role);
            setPuesto(user.puesto || null);
            setStaffUsername(user.username);
            if (user.role === "vendedor") {
              const v = vendedores.find((v) => v.name.trim().toLowerCase() === user.username.trim().toLowerCase());
              setCurrentVendorId(v ? v.id : null);
            }
          }}
        />
      )}

      {role === "staff" && (
        <StaffView
          data={data}
          persist={persist}
          stats={stats}
          puesto={puesto}
          staffUsername={staffUsername}
          onFile={handleOtcSemanalFile}
          fileInputRef={fileInputRef}
          onDownloadTemplate={downloadOtcSemanalTemplate}
          status={status}
          onObjetivosFile={handleObjetivosFile}
          objFileInputRef={objFileInputRef}
          onDownloadObjetivosTemplate={downloadObjetivosTemplate}
          objStatus={objStatus}
          onAvanceDiaFile={handleAvanceDiaFile}
          avanceDiaFileInputRef={avanceDiaFileInputRef}
          avanceDiaStatus={avanceDiaStatus}
          onAvanceDiaTexto={handleAvanceDiaTexto}
          onOtcDiaFile={handleOtcDiaFile}
          otcDiaFileInputRef={otcDiaFileInputRef}
          otcDiaStatus={otcDiaStatus}
          onOtcDiaTexto={handleOtcDiaTexto}
          onVentasPeriodoFile={handleVentasPeriodoFile}
          ventasPeriodoFileInputRef={ventasPeriodoFileInputRef}
          ventasPeriodoStatus={ventasPeriodoStatus}
          onVentasPeriodoTexto={handleVentasPeriodoTexto}
          onBorrarTodoVentasPeriodo={borrarTodoVentasPeriodo}
          onMesaControlFile={handleMesaControlFile}
          mesaControlFileInputRef={mesaControlFileInputRef}
          mesaControlStatus={mesaControlStatus}
          onMesaControlTexto={handleMesaControlTexto}
          onOtcSemanalTexto={handleOtcSemanalTexto}
          onCargasFile={handleCargasFile}
          cargasFileInputRef={cargasFileInputRef}
          cargasStatus={cargasStatus}
          onDescargarCargas={descargarCargasModificadas}
          onRefresh={refrescarManual}
          refrescando={refrescando}
          onLogout={() => { setRole(null); setPuesto(null); setStaffUsername(null); }}
        />
      )}

      {role === "liquidacion" && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
          <TabsLiquidacion data={data} persist={persist} staffUsername={staffUsername} onLogout={() => { setRole(null); setPuesto(null); setStaffUsername(null); }} />
        </div>
      )}

      {role === "vendedor" && (
        <VendorView
          vendedor={stats.porVendedor.find((v) => v.id === currentVendorId)}
          periodo={periodo}
          restantes={stats.restantes}
          mesaControl={mesaControl}
          mensajeDia={mensajesDia[stats.porVendedor.find((v) => v.id === currentVendorId)?.name]}
          data={data}
          persist={persist}
          onRefresh={refrescarManual}
          refrescando={refrescando}
          onLogout={() => { setRole(null); setPuesto(null); setStaffUsername(null); }}
          peorVendedorNombre={stats.peorVendedorNombre}
          bottom3Nombres={stats.bottom3Nombres}
        />
      )}
    </div>
  );
}

function Login({ onLogin }) {
  const [username, setUsername] = useState(USERS[0].username);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit() {
    const user = USERS.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password.trim()
    );
    if (user) {
      setError("");
      onLogin(user);
    } else {
      setError("Usuario o contraseña incorrectos.");
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 380, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Truck size={26} color="#F2B134" />
          <h1 className="display" style={{ fontSize: 22, margin: 0 }}>Ruta de Ventas</h1>
        </div>
        <p style={{ color: "#9AA7BD", fontSize: 13, marginTop: 0, marginBottom: 22 }}>
          Ingresa con tu usuario y contraseña.
        </p>

        <label style={{ fontSize: 12, color: "#9AA7BD" }}>Usuario</label>
        <select style={{ width: "100%", marginTop: 6, marginBottom: 14 }} value={username} onChange={(e) => setUsername(e.target.value)}>
          {USERS.map((u) => (
            <option key={u.username} value={u.username}>
              {u.username}{NOMBRES[u.username] ? ` — ${NOMBRES[u.username]}` : ""}
            </option>
          ))}
        </select>

        <label style={{ fontSize: 12, color: "#9AA7BD" }}>Contraseña</label>
        <input
          type="password"
          style={{ width: "100%", marginTop: 6, marginBottom: 16, boxSizing: "border-box" }}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />

        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#FF6B6B", fontSize: 12, marginBottom: 14 }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <button className="btn" type="button" onClick={submit} style={{ width: "100%" }}>
          Entrar <ChevronRight size={14} style={{ verticalAlign: "-2px" }} />
        </button>
      </div>
    </div>
  );
}

// Hook reutilizable: genera una imagen PNG de cualquier bloque (usando
// capturaRef) y la guarda/comparte con un solo toque. Se usa en Mesa de
// Control, la tabla POR RUTA HOY, el ranking Repartidor Ahogado y Rally OTC.
function useCapturaImagen() {
  const capturaRef = useRef(null);
  const [generandoImagen, setGenerandoImagen] = useState(false);
  const [imagenLista, setImagenLista] = useState(null);
  const [errorImagen, setErrorImagen] = useState(null);

  async function generarImagen(nombreArchivo) {
    setGenerandoImagen(true);
    setErrorImagen(null);
    setImagenLista(null);
    try {
      if (!capturaRef.current) return;
      if (document.fonts && document.fonts.ready) {
        try {
          await Promise.race([document.fonts.ready, new Promise((res) => setTimeout(res, 2000))]);
        } catch (e) { /* seguir de todos modos */ }
      }
      const canvas = await Promise.race([
        html2canvas(capturaRef.current, { backgroundColor: "#0B1220", scale: 1.3, useCORS: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Tardó demasiado en generarse (más de 20s).")), 20000)),
      ]);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setImagenLista({ blob, nombreArchivo, url });
      }, "image/png");
    } catch (e) {
      console.error("No se pudo generar la imagen:", e);
      setErrorImagen(e?.message || "No se pudo generar la imagen.");
    } finally {
      setGenerandoImagen(false);
    }
  }

  async function guardarOCompartir() {
    if (!imagenLista) return;
    const { blob, nombreArchivo, url } = imagenLista;
    const archivo = new File([blob], nombreArchivo, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: nombreArchivo });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
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

  useEffect(() => {
    return () => { if (imagenLista?.url) URL.revokeObjectURL(imagenLista.url); };
  }, [imagenLista]);

  return { capturaRef, generandoImagen, imagenLista, errorImagen, generarImagen, guardarOCompartir, limpiar: () => setImagenLista(null) };
}

// Botón compacto "Guardar/Compartir imagen" que usa el hook de arriba —
// muestra "Generando...", el botón cuando ya está lista, y el error si algo falla.
function BotonGuardarImagen({ captura, nombreArchivo, etiqueta = "Guardar imagen" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {captura.generandoImagen && <span style={{ fontSize: 12, color: "#9AA7BD" }}>Generando imagen...</span>}
        {!captura.generandoImagen && !captura.imagenLista && (
          <button className="btn-ghost" onClick={() => captura.generarImagen(nombreArchivo)}>
            <Download size={14} style={{ verticalAlign: "-2px" }} /> {etiqueta}
          </button>
        )}
        {captura.imagenLista && (
          <button className="btn" onClick={captura.guardarOCompartir}>
            <Download size={14} style={{ verticalAlign: "-2px" }} /> Guardar imagen
          </button>
        )}
      </div>
      {captura.errorImagen && (
        <div style={{ fontSize: 11, color: "#FF6B6B" }}>No se pudo generar: {captura.errorImagen}</div>
      )}
    </div>
  );
}

// Caja colapsable "Pegar texto" — alternativa a subir un archivo: se copia
// directo desde la página de origen (Ctrl+C) y se pega aquí (Ctrl+V), sin
// tener que descargar ni buscar ningún archivo. Reutilizable en cualquier
// pestaña de carga de datos.
function PegarTextoBox({ onProcesar, placeholder }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");

  function procesar() {
    if (!texto.trim()) return;
    onProcesar(texto);
    setTexto("");
    setAbierto(false);
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <button className="btn-ghost" onClick={() => setAbierto((a) => !a)}>
        <ClipboardPaste size={14} style={{ verticalAlign: "-2px" }} /> {abierto ? "Ocultar pegar texto" : "Pegar texto (en vez de subir archivo)"}
      </button>
      {abierto && (
        <div style={{ marginTop: 8 }}>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={placeholder || "Copia las filas (incluyendo el encabezado) desde la página de origen y pégalas aquí..."}
            rows={6}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 12, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "10px 12px", fontFamily: "monospace" }}
          />
          <button className="btn" style={{ marginTop: 8 }} onClick={procesar}>
            Procesar texto pegado
          </button>
        </div>
      )}
    </div>
  );
}


function RoadProgress({ pct }) {
  return (
    <div style={{ margin: "18px 0 8px" }}>
      <div className="track">
        <div className="track-fill" style={{ width: `${pct}%` }} />
        <div className="pin" style={{ left: `${pct}%` }}><Truck size={18} color="#F2B134" /></div>
        <div style={{ position: "absolute", right: -4, top: -20 }}><Flag size={16} color="#9AA7BD" /></div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, accent }) {
  return (
    <div className="card" style={{ padding: 16, flex: "1 1 140px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#9AA7BD", fontSize: 12, marginBottom: 6 }}>
        {icon}<span>{label}</span>
      </div>
      <div className="mono display" style={{ fontSize: 22, color: accent || "#E8EDF5" }}>{value}</div>
    </div>
  );
}

// Ranking "REPARTIDOR AHOGADO": ordena a todos por efectividad del día
// (peor primero) y, para los últimos 3 lugares, dibuja una ilustración de
// agua con aletas de tiburón acechando — todo en SVG, sin necesitar subir
// ninguna imagen.
function RepartidorAhogadoView({ stats }) {
  const captura = useCapturaImagen();
  const ranking = stats.porVendedor
    .filter((v) => v.hoy.volumen.objetivo > 0)
    .slice()
    .sort((a, b) => a.hoy.efectividadPct - b.hoy.efectividadPct);
  const ultimos3 = ranking.slice(0, 3).map((v) => v.name);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div className="display" style={{ fontSize: 16, color: "#E8EDF5" }}>REPARTIDOR AHOGADO</div>
        <BotonGuardarImagen captura={captura} nombreArchivo={`repartidor_ahogado_${fechaHoyISO()}.png`} />
      </div>

      <div ref={captura.capturaRef} className="card" style={{ padding: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <div className="display" style={{ fontSize: 18, color: "#E8EDF5" }}>RANKING · REPARTIDOR AHOGADO</div>
          <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 4 }}>Efectividad del día · {fechaHoyISO()}</div>
        </div>

        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          {ranking.map((v, i) => {
            const esUltimos3 = i < 3;
            return (
              <div
                key={v.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10,
                  background: esUltimos3 ? "#2a1414" : "#131C30",
                  border: `1px solid ${esUltimos3 ? "#FF6B6B" : "#1E2A42"}`,
                }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center",
                  background: esUltimos3 ? "#FF6B6B" : "#1E2A42", color: esUltimos3 ? "#2a1414" : "#9AA7BD", fontWeight: 700, fontSize: 12, flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, fontSize: 13, color: "#E8EDF5" }}>
                  {v.name}{NOMBRES[v.name] ? ` · ${NOMBRES[v.name]}` : ""}
                </div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: esUltimos3 ? "#FF6B6B" : v.hoy.efectividadPct >= 80 ? "#3DDC97" : "#F2B134" }}>
                  {v.hoy.efectividadPct.toFixed(0)}%
                </div>
              </div>
            );
          })}
        </div>

        {ultimos3.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ textAlign: "center", fontSize: 12, color: "#FF6B6B", fontWeight: 700, marginBottom: 8 }}>
              ÚLTIMOS 3 LUGARES · EN LA MIRA
            </div>
            <IlustracionAguaTiburones nombres={ultimos3.map((n) => `${n}${NOMBRES[n] ? " · " + NOMBRES[n] : ""}`)} />
          </div>
        )}
      </div>
    </div>
  );
}

// Ilustración SVG: agua ondulada con 3 aletas de tiburón acechando, y un
// repartidor "hundiéndose" en medio — puramente decorativo, sin imágenes externas.
function IlustracionAguaTiburones({ nombres }) {
  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "linear-gradient(180deg, #1a5270 0%, #0d3b52 30%, #06202e 65%, #020c12 100%)" }}>
      <svg viewBox="0 0 400 260" style={{ width: "100%", display: "block" }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="rayo1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#bfe6ff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#bfe6ff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="superficie" cx="50%" cy="0%" r="80%">
            <stop offset="0%" stopColor="#4fa3c7" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#4fa3c7" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Luz de superficie y rayos de sol atravesando el agua */}
        <rect x="0" y="0" width="400" height="90" fill="url(#superficie)" />
        <polygon points="60,0 110,0 40,260 -30,260" fill="url(#rayo1)" />
        <polygon points="180,0 220,0 260,260 200,260" fill="url(#rayo1)" />
        <polygon points="300,0 340,0 400,220 340,260" fill="url(#rayo1)" />

        {/* Burbujas subiendo */}
        <g fill="#bfe6ff" opacity="0.5">
          <circle cx="205" cy="60" r="3" />
          <circle cx="214" cy="80" r="2.2" />
          <circle cx="198" cy="95" r="4" />
          <circle cx="221" cy="105" r="2" />
          <circle cx="192" cy="120" r="2.6" />
        </g>

        {/* Repartidor hundiéndose: cuerpo completo, brazos hacia arriba, cabeza hacia atrás */}
        <g transform="translate(205,128)">
          <circle cx="0" cy="-32" r="10" fill="#F2B134" />
          <path d="M -3 -24 Q 0 -8 -2 10 Q -3 28 2 42" stroke="#F2B134" strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M -4 -18 L -26 -34" stroke="#F2B134" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M 3 -18 L 25 -32" stroke="#F2B134" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M -2 30 L -16 52" stroke="#F2B134" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M 2 32 L 14 54" stroke="#F2B134" strokeWidth="6" fill="none" strokeLinecap="round" />
        </g>

        {/* Tiburones completos acechando desde distintos ángulos */}
        <g fill="#16232c" stroke="#0a141a" strokeWidth="1">
          {/* Tiburón 1: viene de la izquierda */}
          <g transform="translate(60,150) scale(1.05)">
            <path d="M0,10 C18,-6 55,-8 92,4 C110,10 122,9 132,0 C124,14 108,20 90,17 C70,30 28,30 4,20 C-2,17 -3,13 0,10 Z" />
            <path d="M46,-2 L58,-24 L66,0 Z" />
            <path d="M30,16 L20,30 L44,19 Z" />
            <path d="M126,3 L138,-6 L130,10 Z" />
          </g>
          {/* Tiburón 2: viene de la derecha, más cerca */}
          <g transform="translate(360,145) scale(-1.25,1.25)">
            <path d="M0,10 C18,-6 55,-8 92,4 C110,10 122,9 132,0 C124,14 108,20 90,17 C70,30 28,30 4,20 C-2,17 -3,13 0,10 Z" />
            <path d="M46,-2 L58,-24 L66,0 Z" />
            <path d="M30,16 L20,30 L44,19 Z" />
            <path d="M126,3 L138,-6 L130,10 Z" />
          </g>
          {/* Tiburón 3: viene de abajo */}
          <g transform="translate(230,225) scale(0.95) rotate(-18)">
            <path d="M0,10 C18,-6 55,-8 92,4 C110,10 122,9 132,0 C124,14 108,20 90,17 C70,30 28,30 4,20 C-2,17 -3,13 0,10 Z" />
            <path d="M46,-2 L58,-24 L66,0 Z" />
            <path d="M30,16 L20,30 L44,19 Z" />
            <path d="M126,3 L138,-6 L130,10 Z" />
          </g>
        </g>

        {/* Fondo marino: rocas y algas */}
        <g fill="#04141c">
          <ellipse cx="40" cy="255" rx="50" ry="14" />
          <ellipse cx="150" cy="258" rx="65" ry="16" />
          <ellipse cx="290" cy="256" rx="70" ry="15" />
          <ellipse cx="370" cy="258" rx="40" ry="12" />
        </g>
        <g stroke="#0d3b2e" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8">
          <path d="M100,258 Q95,230 105,205 Q112,190 102,170" />
          <path d="M320,258 Q328,225 315,200 Q308,185 320,165" />
        </g>

        {/* Superficie del agua */}
        <path d="M0 40 Q 25 28 50 40 T 100 40 T 150 40 T 200 40 T 250 40 T 300 40 T 350 40 T 400 40 V 0 H 0 Z" fill="#2c7ba0" opacity="0.35" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 8, padding: "0 14px 16px", marginTop: -18, position: "relative" }}>
        {nombres.map((n, i) => (
          <div key={i} style={{ background: "rgba(255,107,107,0.18)", border: "1px solid #FF6B6B", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "#FF6B6B", fontWeight: 700, textAlign: "center" }}>
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}

function ObjetivoTabs({ tab, setTab, tabs, estadoTabs }) {
  const lista = tabs || OBJETIVO_TABS;
  return (
    <div style={{ display: "flex", gap: 8, margin: "14px 0", flexWrap: "wrap" }}>
      <style>{`
        @keyframes parpadeoRojoTab { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,107,107,0.55); } 50% { box-shadow: 0 0 0 5px rgba(255,107,107,0); } }
        @keyframes parpadeoNaranjaIntensoTab {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,140,0,0.85); background-color: rgba(255,140,0,0.12); }
          50% { box-shadow: 0 0 0 8px rgba(255,140,0,0); background-color: rgba(255,140,0,0.45); }
        }
        .tab-pendiente { border: 1px solid #FF6B6B !important; color: #FF6B6B !important; animation: parpadeoRojoTab 1.4s ease-in-out infinite; }
        .tab-completo { border: 1px solid #3DDC97 !important; color: #3DDC97 !important; }
        .tab-aviso-nuevo { border: 2px solid #FF8C00 !important; color: #FF8C00 !important; font-weight: 800 !important; animation: parpadeoNaranjaIntensoTab 0.9s ease-in-out infinite; }
      `}</style>
      {lista.map((t) => {
        const estado = estadoTabs && estadoTabs[t.key];
        const claseExtra = estado === "pendiente" ? "tab-pendiente" : estado === "completo" ? "tab-completo" : estado === "aviso_nuevo" ? "tab-aviso-nuevo" : "";
        return (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`${tab === t.key ? "btn" : "btn-ghost"} ${claseExtra}`} style={{ fontSize: 13, flex: 1 }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function MarcasBreakdown({ titulo, marcas, data }) {
  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <div className="display" style={{ fontSize: 14, marginBottom: 12, color: "#9AA7BD" }}>{titulo}</div>
      {marcas.map((m) => {
        const d = data[m.key];
        return (
          <div key={m.key} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9AA7BD", marginBottom: 2 }}>
              <span>RESTA: <span style={{ color: "#FF6B6B" }}>{unidades(d.restaPorVender)}</span></span>
              <span>POR DÍA: <span style={{ color: "#F2B134" }}>{unidades(d.ventaPorDiaNecesaria)}</span></span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span>{m.label}</span>
              <span className="mono">{unidades(d.vendido)} / {unidades(d.objetivo)}</span>
            </div>
            <div className="track">
              <div className="track-fill" style={{ width: `${d.pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatCrono(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function DiaKpis({ hoy, mensajeDia, rutaCodigo, esPeor, esBottom3 }) {
  const [tiempos, setTiempos] = useState(null);
  const [ahora, setAhora] = useState(Date.now());

  // Consulta el panel de Tiempos (otro proyecto de Supabase) para esta ruta,
  // hoy. Se refresca cada 20s (no hace falta tiempo real estricto aquí).
  useEffect(() => {
    if (!rutaCodigo) return;
    let activo = true;
    async function cargar() {
      try {
        const fechaHoy = new Date().toLocaleDateString("en-CA");
        const { data: row } = await supabaseTiempos.from("panel_kv").select("value").eq("key", "board-activo").maybeSingle();
        if (!activo) return;
        setTiempos(row?.value?.fecha === fechaHoy ? row.value.rutas?.[rutaCodigo]?.areas || null : null);
      } catch (e) {
        console.error("Error consultando Tiempos:", e);
      }
    }
    cargar();
    const intervalo = setInterval(cargar, 20000);
    return () => { activo = false; clearInterval(intervalo); };
  }, [rutaCodigo]);

  // Reloj que avanza cada segundo, para el cronómetro de "tiempo en ruta".
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const horaIngresoClo = tiempos?.ingreso_clo?.ts
    ? new Date(tiempos.ingreso_clo.ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;
  const salidaRutaTs = tiempos?.salida_ruta?.ts || null;
  const yaRegreso = !!tiempos?.ingreso_clo_fin?.ts;
  // El cronómetro solo corre mientras está en ruta: desde que salió hasta
  // que regresa a CLO (ingreso_clo_fin). Si ya regresó, se congela ahí.
  const msEnRuta = salidaRutaTs ? (yaRegreso ? tiempos.ingreso_clo_fin.ts - salidaRutaTs : ahora - salidaRutaTs) : null;

  return (
    <>
      <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 10 }}>Avance del {hoy.fecha}</div>

      {esBottom3 && (
        <div className="card" style={{ padding: 16, marginBottom: 16, border: "1px solid #FF6B6B", background: "#2a1414" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <AlertCircle size={18} color="#FF6B6B" />
            <span className="display" style={{ fontSize: 14, color: "#FF6B6B" }}>TU ERES SELECCIONADO PARA LA TERCERA MANO DEL PACHUCO</span>
          </div>
          <div style={{ fontSize: 12, color: "#E8EDF5", marginBottom: 10 }}>
            Estás entre los 3 con menor efectividad hoy. Para salir del listado, esto es lo que más te está pesando:
          </div>
          {hoy.indicadoresDebiles && hoy.indicadoresDebiles.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {hoy.indicadoresDebiles.slice(0, 4).map((ind, i) => (
                <div key={i} style={{ fontSize: 13, color: "#E8EDF5" }}>
                  • Vende <b style={{ color: "#F2B134" }}>{ind.unidad === "$" ? money(ind.faltante) : `${unidades(ind.faltante)}`}</b> más de <b>{ind.label}</b> para cerrar ese objetivo.
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#E8EDF5" }}>Sigue empujando tus indicadores del día para subir tu efectividad.</div>
          )}
        </div>
      )}

      {esPeor && (
        <div className="card" style={{ padding: 12, marginBottom: 16, border: "1px solid #FF6B6B" }}>
          <div style={{ fontSize: 12, color: "#FF6B6B", fontWeight: 700 }}>PROPUESTO PARA: "LA TERCERA MANO DEL PACHUCO" (menor efectividad de todas las rutas hoy)</div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <KpiCard
          icon={<Star size={14} />}
          label="Efectividad del día"
          value={`${hoy.efectividadPct.toFixed(0)}%`}
          accent={hoy.efectividadPct >= 80 ? "#3DDC97" : hoy.efectividadPct >= 50 ? "#F2B134" : "#FF6B6B"}
        />
      </div>

      {(horaIngresoClo || msEnRuta != null) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          {horaIngresoClo && (
            <KpiCard icon={<Truck size={14} />} label="Llegada a CLO" value={horaIngresoClo} />
          )}
          {msEnRuta != null && (
            <KpiCard
              icon={<Clock size={14} />}
              label={yaRegreso ? "Tiempo total en ruta" : "Tiempo en ruta (en vivo)"}
              value={formatCrono(msEnRuta)}
              accent={yaRegreso ? "#3DDC97" : "#F2B134"}
            />
          )}
        </div>
      )}
      {mensajeDia && mensajeDia.texto && (
        <div className="card" style={{ padding: 14, marginBottom: 16, border: "1px solid #F2B134" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <MessageSquare size={16} color="#F2B134" />
            <span className="display" style={{ fontSize: 13, color: "#F2B134" }}>MENSAJE DEL SUPERVISOR</span>
          </div>
          <div style={{ fontSize: 14, color: "#E8EDF5", whiteSpace: "pre-wrap" }}>{mensajeDia.texto}</div>
          <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 8 }}>
            {mensajeDia.autor ? `${mensajeDia.autor} · ` : ""}{mensajeDia.fecha}
          </div>
        </div>
      )}
      {hoy.bajoDesempeno && (
        <div className="card" style={{ padding: 14, marginBottom: 16, border: "1px solid #FF6B6B", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertCircle size={16} color="#FF6B6B" />
          <span style={{ fontSize: 13, color: "#FF6B6B" }}>Tu ritmo de hoy está por debajo de lo necesario. ¡Vamos con todo!</span>
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <KpiCard icon={<Target size={14} />} label="VOLUMEN" value={`${unidades(hoy.volumen.vendido)} / ${unidades(hoy.volumen.objetivo)}`} accent={metaColor(hoy.volumen.vendido, hoy.volumen.objetivo)} />
        {MARCAS_DIA.map((m) => (
          <KpiCard key={m.key} icon={<Star size={14} />} label={m.label} value={`${unidades(hoy.marcas[m.key].vendido)} / ${unidades(hoy.marcas[m.key].objetivo)}`} accent={metaColor(hoy.marcas[m.key].vendido, hoy.marcas[m.key].objetivo)} />
        ))}
        <KpiCard icon={<Star size={14} />} label="OTC" value={`${money(hoy.otc.vendido)} / ${money(hoy.otc.objetivo)}`} accent={metaColor(hoy.otc.vendido, hoy.otc.objetivo)} />
        <KpiCard icon={<Star size={14} />} label="OTC sin Vuala" value={`${hoy.otcSinVuala.piezas} pza.`} accent={hoy.otcSinVuala.cumple ? "#3DDC97" : "#FF6B6B"} />
        <KpiCard icon={<MapPin size={14} />} label="VISITAS EFECTIVAS" value={hoy.visitasEfectivas} />
      </div>
    </>
  );
}

function TablaPorRutaHoy({ porVendedor, peorVendedorNombre }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 10, minWidth: 720 }}>
      <thead>
        <tr style={{ color: "#9AA7BD", textAlign: "left" }}>
          <th style={{ padding: "8px 16px" }}>Vendedor</th>
          <th>Volumen</th>
          {MARCAS_DIA.map((m) => <th key={m.key}>{m.label}</th>)}
          <th>OTC</th>
          <th>Sin Vuala</th>
          <th>Visitas</th>
          <th>Efectividad</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {porVendedor.map((v) => (
          <tr key={v.id} style={{ borderTop: "1px solid #1E2A42" }}>
            <td style={{ padding: "10px 16px" }}>
              {v.name}{NOMBRES[v.name] ? ` · ${NOMBRES[v.name]}` : ""}
              {peorVendedorNombre === v.name && (
                <div style={{ fontSize: 9, color: "#FF6B6B", fontWeight: 700, marginTop: 2 }}>PROPUESTO: LA TERCERA MANO DEL PACHUCO</div>
              )}
            </td>
            <td style={{ color: metaColor(v.hoy.volumen.vendido, v.hoy.volumen.objetivo) }}>{unidades(v.hoy.volumen.vendido)}</td>
            {MARCAS_DIA.map((m) => (
              <td key={m.key} style={{ color: metaColor(v.hoy.marcas[m.key].vendido, v.hoy.marcas[m.key].objetivo) }}>
                {unidades(v.hoy.marcas[m.key].vendido)}
              </td>
            ))}
            <td style={{ color: metaColor(v.hoy.otc.vendido, v.hoy.otc.objetivo) }}>{money(v.hoy.otc.vendido)}</td>
            <td>
              <span style={{
                display: "inline-block", minWidth: 28, textAlign: "center", borderRadius: 6, padding: "2px 6px",
                background: v.hoy.otcSinVuala.cumple ? "#3DDC9733" : "#FF6B6B33",
                color: v.hoy.otcSinVuala.cumple ? "#3DDC97" : "#FF6B6B",
                fontWeight: 600,
              }}>
                {v.hoy.otcSinVuala.piezas}
              </span>
            </td>
            <td>{v.hoy.visitasEfectivas}</td>
            <td style={{ color: v.hoy.efectividadPct >= 80 ? "#3DDC97" : v.hoy.efectividadPct >= 50 ? "#F2B134" : "#FF6B6B", fontWeight: 700 }}>
              {v.hoy.efectividadPct.toFixed(0)}%
            </td>
            <td>{v.hoy.bajoDesempeno && <AlertCircle size={14} color="#FF6B6B" />}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Modal de pantalla completa que reescala automáticamente su contenido (con
// CSS transform: scale) para que quepa entero en el ancho disponible, sin
// importar el tamaño de pantalla ni la orientación. Pensado para poder tomar
// un screenshot limpio de una tabla completa, sin que se corte nada a los
// lados. Se recalcula al rotar el teléfono o cambiar el tamaño de ventana.
function ModalTablaCompleta({ titulo, onClose, children }) {
  const contenedorRef = useRef(null);
  const contenidoRef = useRef(null);
  const [escala, setEscala] = useState(1);
  const [dimensiones, setDimensiones] = useState({ ancho: 0, alto: 0 });

  useEffect(() => {
    function recalcular() {
      const contenedor = contenedorRef.current;
      const contenido = contenidoRef.current;
      if (!contenedor || !contenido) return;
      // Se mide el contenido a tamaño natural (sin escalar) para calcular el factor correcto.
      contenido.style.transform = "none";
      const anchoDisponible = contenedor.clientWidth - 16;
      const anchoNatural = contenido.scrollWidth;
      const altoNatural = contenido.scrollHeight;
      const nuevaEscala = anchoNatural > 0 ? Math.min(anchoDisponible / anchoNatural, 1) : 1;
      setEscala(nuevaEscala);
      setDimensiones({ ancho: anchoNatural * nuevaEscala, alto: altoNatural * nuevaEscala });
    }
    recalcular();
    window.addEventListener("resize", recalcular);
    window.addEventListener("orientationchange", recalcular);
    return () => {
      window.removeEventListener("resize", recalcular);
      window.removeEventListener("orientationchange", recalcular);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "#0B1220", zIndex: 9999,
        display: "flex", flexDirection: "column", padding: 14, boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexShrink: 0 }}>
        <span className="display" style={{ fontSize: 15, color: "#E8EDF5" }}>{titulo}</span>
        <button className="btn-ghost" onClick={onClose}>Cerrar</button>
      </div>
      <div style={{ fontSize: 11, color: "#9AA7BD", marginBottom: 8, flexShrink: 0 }}>
        Gira tu teléfono en horizontal para verla más grande. La tabla se ajusta sola para que quepa completa en la pantalla — lista para tomarle screenshot.
      </div>
      <div ref={contenedorRef} style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center" }}>
        <div style={{ width: dimensiones.ancho || "auto", height: dimensiones.alto || "auto" }}>
          <div ref={contenidoRef} style={{ transform: `scale(${escala})`, transformOrigin: "top left", width: "max-content" }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}


function MesaControlResumenCaptura({ analisis, nombreRuta, nombreVendedor, revisor, tiempos, vendedorStats }) {
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
          <div className="mono" style={{ fontSize: 16, color: "#F2B134" }}>{msEnRuta != null ? formatCrono(msEnRuta) : "—"}</div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#9AA7BD", marginTop: 22 }}>INDICADORES DE VISITAS</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, textAlign: "left" }}>
        <div className="card" style={{ padding: 14, flex: "1 1 45%", minWidth: 140 }}>
          <div style={{ fontSize: 11, color: "#9AA7BD" }}>VISITAS TOTALES</div>
          <div className="mono" style={{ fontSize: 22 }}>{todos.length}</div>
        </div>
        <div className="card" style={{ padding: 14, flex: "1 1 45%", minWidth: 140 }}>
          <div style={{ fontSize: 11, color: "#9AA7BD" }}>VISITAS EFECTIVAS</div>
          <div className="mono" style={{ fontSize: 22, color: "#3DDC97" }}>{visitasEfectivas}</div>
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

      {vendedorStats && (
        <>
          <div style={{ fontSize: 12, color: "#9AA7BD", marginTop: 22 }}>VENTAS DEL PERIODO (ESTA RUTA)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, textAlign: "left" }}>
            <div className="card" style={{ padding: 14, flex: "1 1 45%", minWidth: 140 }}>
              <div style={{ fontSize: 11, color: "#9AA7BD" }}>MARCAS ESTRATÉGICAS</div>
              <div className="mono" style={{ fontSize: 22, color: "#F2B134" }}>{unidades(vendedorStats.volumenEstrategicas)}</div>
            </div>
            <div className="card" style={{ padding: 14, flex: "1 1 45%", minWidth: 140 }}>
              <div style={{ fontSize: 11, color: "#9AA7BD" }}>OTC · DESEMPEÑO DEL DÍA</div>
              <div className="mono" style={{ fontSize: 18, color: metaColor(vendedorStats.hoy?.otc?.vendido, vendedorStats.hoy?.otc?.objetivo) }}>
                {money(vendedorStats.hoy?.otc?.vendido)} / {money(vendedorStats.hoy?.otc?.objetivo)}
              </div>
            </div>
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

function formatHoraTiempos(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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

function MesaControlView({ analisis, nombreRuta, nombreVendedor, revisor, vendedorStats }) {
  const [modoCaptura, setModoCaptura] = useState(false);
  const [tiempos, setTiempos] = useState(null);
  const [tiemposCargando, setTiemposCargando] = useState(true);
  const [generandoImagen, setGenerandoImagen] = useState(false);
  const [imagenLista, setImagenLista] = useState(null); // { blob, nombreArchivo, url }
  const [errorImagen, setErrorImagen] = useState(null);
  const capturaRef = useRef(null);

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
          html2canvas(capturaRef.current, { backgroundColor: "#0B1220", scale: 1.3, useCORS: true }),
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
  const { fecha, horaInicio, top5, menores3, tipoInicioConteo, tipoFinConteo, volumenTotal, clientesVolumen03, clientesConDescuento, todos } = analisis;

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
          <MesaControlResumenCaptura analisis={analisis} nombreRuta={nombreRuta} nombreVendedor={nombreVendedor} revisor={revisor} tiempos={tiempos} vendedorStats={vendedorStats} />
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
        {vendedorStats?.hoy && (
          <KpiCard
            icon={<Star size={14} />}
            label="Calificación · Efectividad del día"
            value={`${vendedorStats.hoy.efectividadPct.toFixed(0)}%`}
            accent={vendedorStats.hoy.efectividadPct >= 80 ? "#3DDC97" : vendedorStats.hoy.efectividadPct >= 50 ? "#F2B134" : "#FF6B6B"}
          />
        )}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="display" style={{ fontSize: 14, marginBottom: 12, color: "#9AA7BD" }}>TIEMPOS · INGRESO Y SALIDA A RUTA</div>
        {tiemposCargando ? (
          <div style={{ fontSize: 13, color: "#9AA7BD" }}>Consultando panel de Tiempos...</div>
        ) : !tiempos ? (
          <div style={{ fontSize: 13, color: "#9AA7BD" }}>No hay registro de Tiempos para esta ruta en esta fecha.</div>
        ) : (() => {
          const horaIngresoClo = formatHoraTiempos(tiempos.ingreso_clo?.ts);
          const horaSalidaRuta = formatHoraTiempos(tiempos.salida_ruta?.ts);
          const diffMin = diferenciaMinutos(horaInicio, horaSalidaRuta);
          return (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <KpiCard icon={<Truck size={14} />} label="Ingreso a CLO" value={horaIngresoClo || "—"} />
              <KpiCard icon={<Clock size={14} />} label="Salida a ruta" value={horaSalidaRuta || "—"} />
              <KpiCard
                icon={<AlertCircle size={14} />}
                label="Salida a ruta vs. inicio de ruta"
                value={diffMin == null ? "—" : `${diffMin > 0 ? "+" : ""}${diffMin} min`}
                accent={diffMin == null ? undefined : diffMin > 10 ? "#FF6B6B" : "#3DDC97"}
              />
            </div>
          );
        })()}
        <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 8 }}>
          El número de la comparación es cuántos minutos después (positivo) o antes (negativo) de "Salida a ruta" se registró la primera visita del día.
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

function VendorView({ vendedor, periodo, restantes, mesaControl, mensajeDia, data, persist, onRefresh, refrescando, onLogout, peorVendedorNombre, bottom3Nombres }) {
  const [tab, setTab] = useState("dia");
  if (!vendedor) return <div style={{ padding: 24 }}>No encontrado. <button className="btn-ghost" onClick={onLogout}>Volver</button></div>;
  const nombre = NOMBRES[vendedor.name];
  const esTabEspecial = tab === "dia" || tab === "mesa" || tab === "cuponera" || tab === "rally_otc" || tab === "avisos" || tab === "cargas";
  const m = !esTabEspecial ? vendedor.tabs[tab] : null;
  const unit = OBJETIVO_TABS.find((t) => t.key === tab).unit;
  const chartData = unit === "units" ? vendedor.ventaPorDiaUnidades : vendedor.ventaPorDia;
  const chartKey = unit === "units" ? "paquetes" : "monto";
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 18px 60px" }}>
      <TopBar
        title={vendedor.name}
        subtitle={`${nombre ? nombre + " · " : ""}Periodo ${periodo.inicio} → ${periodo.fin} · ${restantes} días hábiles restantes (Lun-Sáb)`}
        onLogout={onLogout}
        onRefresh={onRefresh}
        refrescando={refrescando}
      />

      <ObjetivoTabs tab={tab} setTab={setTab} tabs={OBJETIVO_TABS.filter((t) => !["tiempos", "rutas", "actividades_dia", "actividades_semana", "actividades_mes", "cotizador", "pwst"].includes(t.key))} estadoTabs={{ rally_otc: data.rallyOtc?.activo ? "completo" : undefined, avisos: hayAvisoNuevoPara(data, vendedor.name, vendedor.name) ? "aviso_nuevo" : undefined }} />

      {tab === "dia" ? (
        <DiaKpis
          hoy={vendedor.hoy}
          mensajeDia={mensajeDia}
          rutaCodigo={vendedor.name.replace("RUTA ", "").trim()}
          esPeor={peorVendedorNombre === vendedor.name}
          esBottom3={(bottom3Nombres || []).includes(vendedor.name)}
        />
      ) : tab === "mesa" ? (
        <MesaControlView analisis={analizarMesaControl(mesaControl, vendedor.name)} nombreRuta={vendedor.name} nombreVendedor={nombre} vendedorStats={vendedor} />
      ) : tab === "cuponera" ? (
        <CuponeraView data={data} persist={persist} puesto={null} rol="vendedor" rutaActual={vendedor.name} nombres={NOMBRES} />
      ) : tab === "rally_otc" ? (
        <RallyOtcView data={data} persist={persist} puesto={null} rol="vendedor" vendedorActual={vendedor.name} />
      ) : tab === "avisos" ? (
        <AvisosView data={data} persist={persist} puedeCrear={false} revisorNombre={null} verComoRuta={vendedor.name} viewerKey={vendedor.name} />
      ) : tab === "cargas" ? (
        <CargasView data={data} persist={persist} puesto={null} rol="vendedor" vendedorActual={vendedor.name} />
      ) : (
        <>
          <RoadProgress pct={m.avancePct} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9AA7BD", marginBottom: 20 }}>
            <span>{fmt(unit, m.avance)} {unit === "units" ? "vendidos" : "vendido"}</span>
            <span>{m.avancePct.toFixed(0)}% de {fmt(unit, m.objetivo)}</span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            <KpiCard icon={<Target size={14} />} label="Resta por vender" value={fmt(unit, m.restaPorVender)} accent="#FF6B6B" />
            <KpiCard icon={<Calendar size={14} />} label="Necesitas vender / día" value={fmt(unit, m.ventaPorDiaNecesaria)} accent="#F2B134" />
            {tab === "max" && (
              <>
                <KpiCard icon={<MapPin size={14} />} label="Visitas efectivas" value={vendedor.visitasEfectivas} />
                <KpiCard icon={<Star size={14} />} label="OTC" value={`${money(vendedor.marcaOtc.vendido)} / ${money(vendedor.marcaOtc.objetivo)}`} accent={metaColor(vendedor.marcaOtc.vendido, vendedor.marcaOtc.objetivo)} />
                <KpiCard icon={<Star size={14} />} label={`Comisión OTC (${(vendedor.tasaComisionOtc * 100).toFixed(1)}%)`} value={money(vendedor.comisionOtc)} accent="#3DDC97" />
              </>
            )}
          </div>

          {tab === "open" && <MarcasBreakdown titulo="MARCAS · OPEN (PAQUETES)" marcas={MARCAS_OPEN} data={vendedor.marcasOpen} />}
          {tab === "champions" && <MarcasBreakdown titulo="MARCAS · CHAMPIONS (PAQUETES)" marcas={MARCAS_CHAMPIONS} data={vendedor.marcasChampions} />}

          <div className="card" style={{ padding: 16 }}>
            <div className="display" style={{ fontSize: 14, marginBottom: 12, color: "#9AA7BD" }}>VENTA POR DÍA{unit === "units" ? " (PAQUETES)" : ""}</div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid stroke="#1E2A42" vertical={false} />
                  <XAxis dataKey="fecha" stroke="#9AA7BD" fontSize={11} />
                  <YAxis stroke="#9AA7BD" fontSize={11} tickFormatter={(v) => (unit === "units" ? v : `${(v/1000).toFixed(0)}k`)} />
                  <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #2A3852" }} formatter={(v) => (unit === "units" ? unidades(v) : money(v))} />
                  <Bar dataKey={chartKey} fill="#F2B134" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Bloque de avance (RoadProgress + KPIs + marcas + gráfica) para MAX/OPEN/
// CHAMPIONS de un vendedor — el mismo que ve cada ruta, reutilizado para que
// el staff pueda darle seguimiento tal cual.
function RutaProgresoBloque({ vendedor, metricTab }) {
  const m = vendedor.tabs[metricTab];
  const unit = OBJETIVO_TABS.find((t) => t.key === metricTab).unit;
  const chartData = unit === "units" ? vendedor.ventaPorDiaUnidades : vendedor.ventaPorDia;
  const chartKey = unit === "units" ? "paquetes" : "monto";
  return (
    <>
      <RoadProgress pct={m.avancePct} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9AA7BD", marginBottom: 20 }}>
        <span>{fmt(unit, m.avance)} {unit === "units" ? "vendidos" : "vendido"}</span>
        <span>{m.avancePct.toFixed(0)}% de {fmt(unit, m.objetivo)}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <KpiCard icon={<Target size={14} />} label="Resta por vender" value={fmt(unit, m.restaPorVender)} accent="#FF6B6B" />
        <KpiCard icon={<Calendar size={14} />} label="Necesitas vender / día" value={fmt(unit, m.ventaPorDiaNecesaria)} accent="#F2B134" />
        {metricTab === "max" && (
          <>
            <KpiCard icon={<MapPin size={14} />} label="Visitas efectivas" value={vendedor.visitasEfectivas} />
            <KpiCard icon={<Star size={14} />} label="OTC" value={`${money(vendedor.marcaOtc.vendido)} / ${money(vendedor.marcaOtc.objetivo)}`} accent={metaColor(vendedor.marcaOtc.vendido, vendedor.marcaOtc.objetivo)} />
            <KpiCard icon={<Star size={14} />} label={`Comisión OTC (${(vendedor.tasaComisionOtc * 100).toFixed(1)}%)`} value={money(vendedor.comisionOtc)} accent="#3DDC97" />
          </>
        )}
      </div>
      {metricTab === "open" && <MarcasBreakdown titulo="MARCAS · OPEN (PAQUETES)" marcas={MARCAS_OPEN} data={vendedor.marcasOpen} />}
      {metricTab === "champions" && <MarcasBreakdown titulo="MARCAS · CHAMPIONS (PAQUETES)" marcas={MARCAS_CHAMPIONS} data={vendedor.marcasChampions} />}
      <div className="card" style={{ padding: 16 }}>
        <div className="display" style={{ fontSize: 14, marginBottom: 12, color: "#9AA7BD" }}>VENTA POR DÍA{unit === "units" ? " (PAQUETES)" : ""}</div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid stroke="#1E2A42" vertical={false} />
              <XAxis dataKey="fecha" stroke="#9AA7BD" fontSize={11} />
              <YAxis stroke="#9AA7BD" fontSize={11} tickFormatter={(v) => (unit === "units" ? v : `${(v / 1000).toFixed(0)}k`)} />
              <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #2A3852" }} formatter={(v) => (unit === "units" ? unidades(v) : money(v))} />
              <Bar dataKey={chartKey} fill="#F2B134" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

// Pestaña "RUTAS" para staff: elige una ruta y ve exactamente lo mismo que
// ve esa ruta en MAX/OPEN/CHAMPIONS, para seguimiento.
function RutasView({ stats }) {
  const [rutaSeleccionada, setRutaSeleccionada] = useState(null);
  const [metricTab, setMetricTab] = useState("max");
  const vendedor = stats.porVendedor.find((v) => v.name === rutaSeleccionada) || stats.porVendedor[0];
  if (!vendedor) return <div style={{ color: "#9AA7BD", fontSize: 13 }}>No hay rutas configuradas.</div>;
  return (
    <div>
      <select
        value={vendedor.name}
        onChange={(e) => setRutaSeleccionada(e.target.value)}
        style={{ background: "#131C30", color: "#E8EDF5", border: "1px solid #1E2A42", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 14, width: "100%" }}
      >
        {stats.porVendedor.map((v) => (
          <option key={v.id} value={v.name}>{v.name}{NOMBRES[v.name] ? ` · ${NOMBRES[v.name]}` : ""}</option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["max", "open", "champions"].map((k) => (
          <button key={k} className={metricTab === k ? "btn" : "btn-ghost"} style={{ flex: 1, fontSize: 13 }} onClick={() => setMetricTab(k)}>
            {k.toUpperCase()}
          </button>
        ))}
      </div>
      <RutaProgresoBloque vendedor={vendedor} metricTab={metricTab} />
    </div>
  );
}

// Suma el OTC de una ruta dentro de un rango de fechas (o de una sola fecha
// si desde===hasta), filtrando solo los códigos de artículo que el gerente
// haya marcado como participantes del rally, y sumando en piezas o en
// dinero según la unidad configurada. Si no se eligió ningún código, se
// suma todo (comportamiento de respaldo).
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
function RallyOtcView({ data, persist, puesto, rol, vendedorActual, revisorNombre }) {
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
    persist({
      ...data,
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
    });
    setForm(null);
  }

  function desactivarRally() {
    persist({ ...data, rallyOtc: { ...rally, activo: false } });
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

/**
 * Pestaña AVISOS — visible para todos los roles. Supervisor-1 y Gerente
 * pueden publicar (texto, imagen, archivo, o cualquier combinación); el
 * resto solo puede ver. Los archivos se suben al mismo bucket de Storage
 * que las promociones y el rally.
 */
// Filtra los avisos relevantes para un viewerKey dado (misma lógica que usa
// AvisosView para decidir qué mostrar), respetando destinatarios y la
// preferencia de recibir avisos.
function avisosRelevantesPara(data, viewerKey, verComoRuta) {
  if ((viewerKey === "supervisor2" || viewerKey === "liquidacion") && data.preferenciasAvisos?.[viewerKey] === false) return [];
  const todosLosAvisos = data.avisos || [];
  const base = verComoRuta
    ? todosLosAvisos.filter((a) => !a.destinatarios || a.destinatarios === "todos" || (Array.isArray(a.destinatarios) && a.destinatarios.includes(verComoRuta)))
    : todosLosAvisos;
  // Si el que publicó excluyó explícitamente a Liquidación o Supervisor-2 de
  // ESE aviso en particular, no se lo mostramos a esos roles.
  if (viewerKey === "supervisor2" || viewerKey === "liquidacion") {
    return base.filter((a) => !(a.excluidos || []).includes(viewerKey));
  }
  return base;
}

// true si a este viewerKey le llegó al menos un aviso nuevo desde la última
// vez que entró a la pestaña — se usa para el parpadeo naranja de la pestaña.
function hayAvisoNuevoPara(data, viewerKey, verComoRuta) {
  if (!viewerKey) return false;
  const avisos = avisosRelevantesPara(data, viewerKey, verComoRuta);
  if (avisos.length === 0) return false;
  const ultimaVisita = data.avisosVistoPor?.[viewerKey];
  if (!ultimaVisita) return true;
  return avisos.some((a) => new Date(a.fecha) > new Date(ultimaVisita));
}

// Vista dedicada de Liquidación (Sulema): un mini switch entre TIEMPOS
// (su pantalla de siempre) y AVISOS (nuevo), ya que ella no usa el sistema
// de pestañas de VendorView/StaffView.
function TabsLiquidacion({ data, persist, staffUsername, onLogout }) {
  const [tab, setTab] = useState("tiempos");
  const hayNuevo = hayAvisoNuevoPara(data, "liquidacion", null);
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={tab === "tiempos" ? "btn" : "btn-ghost"} style={{ flex: 1 }} onClick={() => setTab("tiempos")}>TIEMPOS</button>
        <button
          className={`${tab === "avisos" ? "btn" : "btn-ghost"} ${hayNuevo ? "tab-aviso-nuevo" : ""}`}
          style={{ flex: 1 }}
          onClick={() => setTab("avisos")}
        >
          AVISOS
        </button>
      </div>
      <style>{`
        @keyframes parpadeoNaranjaIntensoTab {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,140,0,0.85); background-color: rgba(255,140,0,0.12); }
          50% { box-shadow: 0 0 0 8px rgba(255,140,0,0); background-color: rgba(255,140,0,0.45); }
        }
        .tab-aviso-nuevo { border: 2px solid #FF8C00 !important; color: #FF8C00 !important; font-weight: 800 !important; animation: parpadeoNaranjaIntensoTab 0.9s ease-in-out infinite; }
      `}</style>
      {tab === "tiempos" ? (
        <TiemposView
          identidad={NOMBRES[staffUsername] || "Sulema Ponce"}
          misAreas={["Liquidación"]}
          onLogout={onLogout}
        />
      ) : (
        <AvisosView data={data} persist={persist} puedeCrear={false} revisorNombre={null} viewerKey="liquidacion" />
      )}
    </div>
  );
}


function AvisosView({ data, persist, puedeCrear, revisorNombre, verComoRuta, viewerKey }) {
  const todosLosAvisos = data.avisos || [];
  const avisos = avisosRelevantesPara(data, viewerKey, verComoRuta);
  const puedeElegirPreferencia = viewerKey === "supervisor2" || viewerKey === "liquidacion";
  const recibeAvisos = puedeElegirPreferencia ? data.preferenciasAvisos?.[viewerKey] !== false : true;

  // Marca esta pestaña como "vista ahorita" para apagar el parpadeo naranja.
  useEffect(() => {
    if (!viewerKey) return;
    const ahora = new Date().toISOString();
    const yaVisto = data.avisosVistoPor?.[viewerKey];
    if (!yaVisto || Date.now() - new Date(yaVisto).getTime() > 3000) {
      persist({ ...data, avisosVistoPor: { ...(data.avisosVistoPor || {}), [viewerKey]: ahora } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerKey]);

  function cambiarPreferenciaAvisos(valor) {
    persist({ ...data, preferenciasAvisos: { ...(data.preferenciasAvisos || {}), [viewerKey]: valor } });
  }

  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState(null); // { url, nombre, esImagen }
  const [subiendo, setSubiendo] = useState(false);
  const [paraTodos, setParaTodos] = useState(true);
  const [rutasElegidas, setRutasElegidas] = useState([]);
  const [excluirLiquidacion, setExcluirLiquidacion] = useState(false);
  const [excluirSupervisor2, setExcluirSupervisor2] = useState(false);
  const fileRef = useRef(null);

  function toggleRutaDestino(nombreRuta) {
    setRutasElegidas((rs) => (rs.includes(nombreRuta) ? rs.filter((r) => r !== nombreRuta) : [...rs, nombreRuta]));
  }

  async function subirArchivo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert("El archivo pesa más de 8MB. Usa uno más ligero.");
      return;
    }
    setSubiendo(true);
    try {
      const extension = (file.name.split(".").pop() || "bin").toLowerCase();
      const nombreArchivo = `aviso_${Date.now()}.${extension}`;
      const { error } = await supabase.storage.from("promociones").upload(nombreArchivo, file, { cacheControl: "3600", upsert: false });
      if (error) {
        alert(`No se pudo subir el archivo: ${error.message}`);
        return;
      }
      const { data: urlData } = supabase.storage.from("promociones").getPublicUrl(nombreArchivo);
      setArchivo({ url: urlData.publicUrl, nombre: file.name, esImagen: file.type.startsWith("image/") });
    } finally {
      setSubiendo(false);
    }
  }

  function publicarAviso() {
    if (!texto.trim() && !archivo) {
      alert("Escribe un texto o adjunta una imagen/archivo.");
      return;
    }
    if (!paraTodos && rutasElegidas.length === 0) {
      alert("Elige al menos una ruta destinataria, o marca \"Para todos\".");
      return;
    }
    const excluidos = [];
    if (excluirLiquidacion) excluidos.push("liquidacion");
    if (excluirSupervisor2) excluidos.push("supervisor2");
    const nuevo = {
      id: "aviso_" + Date.now(),
      texto: texto.trim(),
      archivoUrl: archivo?.url || null,
      archivoNombre: archivo?.nombre || null,
      esImagen: archivo?.esImagen || false,
      autor: revisorNombre || "Staff",
      fecha: new Date().toISOString(),
      destinatarios: paraTodos ? "todos" : rutasElegidas,
      excluidos,
    };
    persist({ ...data, avisos: [nuevo, ...todosLosAvisos] });
    setTexto("");
    setArchivo(null);
    setParaTodos(true);
    setRutasElegidas([]);
    setExcluirLiquidacion(false);
    setExcluirSupervisor2(false);
  }

  function eliminarAviso(id) {
    persist({ ...data, avisos: todosLosAvisos.filter((a) => a.id !== id) });
  }



  function formatFechaHora(iso) {
    const d = new Date(iso);
    return d.toLocaleString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div>
      <div className="display" style={{ fontSize: 16, color: "#E8EDF5", marginBottom: 14 }}>AVISOS</div>

      {puedeElegirPreferencia && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>¿QUIERES RECIBIR AVISOS?</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className={recibeAvisos ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => cambiarPreferenciaAvisos(true)}>Sí, quiero recibir avisos</button>
            <button className={!recibeAvisos ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => cambiarPreferenciaAvisos(false)}>No, no quiero recibir avisos</button>
          </div>
        </div>
      )}

      {puedeElegirPreferencia && !recibeAvisos ? (
        <div className="card" style={{ padding: 30, textAlign: "center", color: "#9AA7BD" }}>
          Desactivaste la recepción de avisos. Si cambias de opinión, actívala arriba.
        </div>
      ) : (
        <>
      {puedeCrear && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div className="display" style={{ fontSize: 13, color: "#9AA7BD", marginBottom: 8 }}>NUEVO AVISO</div>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe el aviso (opcional si adjuntas una imagen o archivo)..."
            rows={3}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "10px 12px", marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={subiendo}>
              {subiendo ? "Subiendo..." : archivo ? "Cambiar archivo" : "Adjuntar imagen/archivo"}
            </button>
            <input ref={fileRef} type="file" style={{ display: "none" }} onChange={subirArchivo} />
            {archivo && (
              <>
                <span style={{ fontSize: 12, color: "#9AA7BD" }}>{archivo.nombre}</span>
                <button className="btn-ghost" onClick={() => setArchivo(null)}><Ban size={13} color="#FF6B6B" /></button>
              </>
            )}
          </div>
          {archivo?.esImagen && <img src={archivo.url} alt="" style={{ maxWidth: 200, borderRadius: 8, marginBottom: 10, display: "block" }} />}

          <div style={{ marginBottom: 10 }}>
            <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 6 }}>DESTINATARIOS</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button className={paraTodos ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => setParaTodos(true)}>Para todos</button>
              <button className={!paraTodos ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => setParaTodos(false)}>Elegir rutas específicas</button>
            </div>
            {!paraTodos && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {RUTAS.map((nombreRuta) => (
                  <button key={nombreRuta} className={rutasElegidas.includes(nombreRuta) ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => toggleRutaDestino(nombreRuta)}>
                    {nombreRuta}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 10 }}>
            <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 6 }}>EXCLUIR DE ESTE AVISO (OPCIONAL)</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className={excluirLiquidacion ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => setExcluirLiquidacion((v) => !v)}>
                {excluirLiquidacion ? "✓ " : ""}No enviar a Liquidación
              </button>
              <button className={excluirSupervisor2 ? "btn" : "btn-ghost"} style={{ fontSize: 12 }} onClick={() => setExcluirSupervisor2((v) => !v)}>
                {excluirSupervisor2 ? "✓ " : ""}No enviar a Supervisor-2
              </button>
            </div>
          </div>

          <button className="btn" onClick={publicarAviso}>
            <Plus size={14} style={{ verticalAlign: "-2px" }} /> Publicar aviso
          </button>
        </div>
      )}

      {avisos.length === 0 ? (
        <div className="card" style={{ padding: 30, textAlign: "center", color: "#9AA7BD" }}>No hay avisos por el momento.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {avisos.map((a) => (
            <div key={a.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <div style={{ fontSize: 12, color: "#9AA7BD" }}>{a.autor} · {formatFechaHora(a.fecha)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {!verComoRuta && (
                    <span style={{ fontSize: 10, color: "#9AA7BD", border: "1px solid #1E2A42", borderRadius: 6, padding: "2px 8px" }}>
                      Para: {!a.destinatarios || a.destinatarios === "todos" ? "Todos" : a.destinatarios.join(", ")}
                    </span>
                  )}
                  {!verComoRuta && a.excluidos && a.excluidos.length > 0 && (
                    <span style={{ fontSize: 10, color: "#FF6B6B", border: "1px solid #FF6B6B", borderRadius: 6, padding: "2px 8px" }}>
                      Sin: {a.excluidos.map((e) => e === "liquidacion" ? "Liquidación" : "Supervisor-2").join(", ")}
                    </span>
                  )}
                  {puedeCrear && (
                    <button className="btn-ghost" onClick={() => eliminarAviso(a.id)}><Trash2 size={13} color="#FF6B6B" /></button>
                  )}
                </div>
              </div>
              {a.texto && <p style={{ fontSize: 13, color: "#E8EDF5", whiteSpace: "pre-wrap", marginBottom: a.archivoUrl ? 10 : 0 }}>{a.texto}</p>}
              {a.archivoUrl && (
                a.esImagen ? (
                  <img src={a.archivoUrl} alt="" style={{ maxWidth: "100%", borderRadius: 8, display: "block" }} />
                ) : (
                  <a href={a.archivoUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
                    <Download size={13} /> {a.archivoNombre || "Descargar archivo"}
                  </a>
                )
              )}
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}

/**
 * Pestaña CARGAS — para vendedor, Supervisor-1 y Gerente.
 * - Supervisor-1/Gerente suben la "Carga Propuesta" (FA, marca, cantidad
 *   inicial por ruta) y pueden descargar el archivo final ya con las
 *   propuestas de cada vendedor (usa la inicial si no la modificaron).
 * - Vendedor ve su propia lista y puede proponer su cantidad; si no la
 *   modifica, se usa la inicial. Al descargar, se bloquea la edición.
 */
function CargasView({ data, persist, puesto, rol, vendedorActual, onUpload, cargasFileInputRef, cargasStatus, onDescargar }) {
  const cargas = data.cargas || { fecha: null, bloqueado: false, items: [], enviosPorRuta: {} };
  const esStaffConPermiso = rol === "staff" && (puesto === "gerente" || puesto === "supervisor");
  const yaEnviado = !!cargas.enviosPorRuta?.[vendedorActual];
  const [rutaVistaStaff, setRutaVistaStaff] = useState(null);

  // Edición 100% local (borrador): mientras se escribe, NO se guarda nada en
  // Supabase — así una sincronización en tiempo real de otro dispositivo
  // nunca puede "regresar" el número a medio escribir. Solo al presionar
  // "Enviar" se manda todo de un jalón.
  const rutaActiva = rol === "vendedor" ? vendedorActual : rutaVistaStaff;
  const [borrador, setBorrador] = useState({});
  useEffect(() => { setBorrador({}); }, [rutaActiva]);

  function cambiarLocal(itemIndex, valor) {
    setBorrador((b) => ({ ...b, [itemIndex]: valor }));
  }

  function enviarPara(nombreRuta) {
    const items = cargas.items.map((it, i) => {
      if (borrador[i] === undefined) return it;
      const valor = borrador[i];
      return { ...it, porRuta: { ...it.porRuta, [nombreRuta]: { ...it.porRuta[nombreRuta], modificada: valor === "" ? null : Number(valor) } } };
    });
    persist({ ...data, cargas: { ...cargas, items, enviosPorRuta: { ...(cargas.enviosPorRuta || {}), [nombreRuta]: true } } });
    setBorrador({});
  }

  return (
    <div>
      <div className="display" style={{ fontSize: 16, color: "#E8EDF5", marginBottom: 14 }}>CARGAS</div>

      {esStaffConPermiso && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
            <div className="display" style={{ fontSize: 13, color: "#9AA7BD" }}>
              {cargas.fecha ? `Carga del ${cargas.fecha}` : "Sin carga cargada"} {cargas.bloqueado && <span style={{ color: "#FF6B6B" }}>· BLOQUEADA</span>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => cargasFileInputRef.current?.click()}>
                <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir archivo de cargas
              </button>
              <input ref={cargasFileInputRef} type="file" accept=".xlsx,.xls,.xlsm" style={{ display: "none" }} onChange={onUpload} />
              {cargas.items.length > 0 && (
                <button className="btn-ghost" onClick={onDescargar}>
                  <Download size={14} style={{ verticalAlign: "-2px" }} /> Descargar archivo modificado
                </button>
              )}
            </div>
          </div>
          {cargasStatus && <div style={{ fontSize: 12, color: "#9AA7BD" }}>{cargasStatus}</div>}
          {cargas.bloqueado && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
              <div style={{ fontSize: 11, color: "#FF6B6B" }}>
                Ya se descargó el archivo final — los vendedores ya no pueden modificar sus cantidades.
              </div>
              <button className="btn-ghost" onClick={() => persist({ ...data, cargas: { ...cargas, bloqueado: false } })}>
                <RefreshCw size={13} style={{ verticalAlign: "-2px" }} /> Reactivar edición
              </button>
            </div>
          )}

          {cargas.items.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>ESTATUS POR RUTA · TOCA PARA VER/EDITAR SU CARGA</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: rutaVistaStaff ? 14 : 0 }}>
                {RUTAS.map((nombreRuta) => {
                  const enviado = !!cargas.enviosPorRuta?.[nombreRuta];
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
                          onClick={() => persist({ ...data, cargas: { ...cargas, enviosPorRuta: { ...(cargas.enviosPorRuta || {}), [nombreRuta]: false } } })}
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
                const enviadoEstaRuta = !!cargas.enviosPorRuta?.[rutaVistaStaff];
                return (
                  <div>
                    <div style={{ fontSize: 11, color: "#9AA7BD", marginBottom: 8 }}>
                      Carga de {rutaVistaStaff}{NOMBRES[rutaVistaStaff] ? ` · ${NOMBRES[rutaVistaStaff]}` : ""}{cargas.bloqueado ? " (bloqueada, reactiva la edición para modificar)" : ""}
                    </div>
                    <TablaCargaVendedor items={cargas.items} nombreRuta={rutaVistaStaff} bloqueado={cargas.bloqueado} valoresLocales={borrador} onCambiarLocal={cambiarLocal} />
                    {!cargas.bloqueado && (
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

      {cargas.items.length === 0 ? (
        <div className="card" style={{ padding: 30, textAlign: "center", color: "#9AA7BD" }}>
          No hay una carga cargada por el momento.
        </div>
      ) : rol === "vendedor" ? (
        <>
          {cargas.bloqueado && (
            <div className="card" style={{ padding: 12, marginBottom: 14, border: "1px solid #FF6B6B" }}>
              <div style={{ fontSize: 12, color: "#FF6B6B" }}>Esta carga ya se descargó — ya no se puede modificar.</div>
            </div>
          )}
          {!cargas.bloqueado && (
            <div className="card" style={{ padding: 12, marginBottom: 14, border: `1px solid ${yaEnviado ? "#3DDC97" : "#F2B134"}` }}>
              <div style={{ fontSize: 12, color: yaEnviado ? "#3DDC97" : "#F2B134" }}>
                {yaEnviado ? "Ya enviaste tus cambios correctamente — no puedes seguir editando hasta que gerente/supervisor lo reactive." : "Aún no has enviado tus cambios."}
              </div>
            </div>
          )}
          <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 10 }}>
            Escribe la cantidad que consideres — no se guarda hasta que le des "Enviar cambios". Si no cambias una cantidad, se usará la inicial tal cual viene en la carga propuesta.
          </div>
          <TablaCargaVendedor items={cargas.items} nombreRuta={vendedorActual} bloqueado={cargas.bloqueado || yaEnviado} valoresLocales={borrador} onCambiarLocal={cambiarLocal} />
          {!cargas.bloqueado && !yaEnviado && (
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={() => enviarPara(vendedorActual)}>
              <CheckCircle2 size={14} style={{ verticalAlign: "-2px" }} /> Enviar cambios
            </button>
          )}
        </>
      ) : (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 13, color: "#9AA7BD" }}>
            {cargas.items.length} artículos cargados para {Object.keys(cargas.items[0]?.porRuta || {}).length} rutas.
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
function ActividadesView({ ciclo, titulo, data, persist, revisorNombre, puedeEliminar }) {
  const [nuevoTexto, setNuevoTexto] = useState("");
  const [nuevoTipo, setNuevoTipo] = useState("temporal");

  const estado = data.actividades?.[ciclo] || { items: [] };
  const items = estado.items || [];
  const pendientes = items.filter((it) => !it.hecha);
  const hechas = items.filter((it) => it.hecha);

  function marcar(id, hecha) {
    const nuevos = items.map((it) => (it.id === id ? { ...it, hecha } : it));
    persist({ ...data, actividades: { ...data.actividades, [ciclo]: { ...estado, items: nuevos } } });
  }
  function agregar() {
    if (!nuevoTexto.trim()) return;
    const nueva = nuevaActividad(nuevoTexto, nuevoTipo, revisorNombre || "Staff", fechaHoyISO());
    persist({ ...data, actividades: { ...data.actividades, [ciclo]: { ...estado, items: [...items, nueva] } } });
    setNuevoTexto("");
  }
  function eliminar(id) {
    persist({ ...data, actividades: { ...data.actividades, [ciclo]: { ...estado, items: items.filter((it) => it.id !== id) } } });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div className="display" style={{ fontSize: 15, color: "#E8EDF5" }}>{titulo}</div>
        <div style={{ fontSize: 12, color: pendientes.length === 0 ? "#3DDC97" : "#FF6B6B", fontWeight: 700 }}>
          {pendientes.length === 0 ? "TODO COMPLETO" : `${pendientes.length} pendiente${pendientes.length > 1 ? "s" : ""}`}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {items.length === 0 && (
          <div style={{ color: "#9AA7BD", fontSize: 13, textAlign: "center", padding: 20 }}>No hay actividades cargadas.</div>
        )}
        {[...pendientes, ...hechas].map((it) => (
          <div key={it.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => marcar(it.id, !it.hecha)}
              style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${it.hecha ? "#3DDC97" : "#5b6478"}`, background: it.hecha ? "#0f2a20" : "transparent", cursor: "pointer",
              }}
            >
              {it.hecha && <CheckCircle2 size={14} color="#3DDC97" />}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: it.hecha ? "#9AA7BD" : "#E8EDF5", textDecoration: it.hecha ? "line-through" : "none" }}>{it.texto}</div>
              <div style={{ fontSize: 10, color: "#5b6478", marginTop: 2 }}>
                {it.tipo === "fija" ? "Fija" : "Temporal"}{it.creadaPor ? ` · ${it.creadaPor}` : ""}
              </div>
            </div>
            {puedeEliminar && (
              <button className="btn-ghost" onClick={() => eliminar(it.id)}><Trash2 size={13} color="#FF6B6B" /></button>
            )}
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="display" style={{ fontSize: 13, color: "#9AA7BD", marginBottom: 10 }}>AGREGAR ACTIVIDAD</div>
        <input
          type="text"
          value={nuevoTexto}
          onChange={(e) => setNuevoTexto(e.target.value)}
          placeholder="Descripción de la actividad..."
          style={{ width: "100%", boxSizing: "border-box", fontSize: 13, color: "#000", background: "#FFFFFF", borderRadius: 8, border: "none", padding: "10px 12px", marginBottom: 10 }}
        />
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button className={nuevoTipo === "temporal" ? "btn" : "btn-ghost"} style={{ flex: 1, fontSize: 12 }} onClick={() => setNuevoTipo("temporal")}>Temporal (solo hoy/este ciclo)</button>
          <button className={nuevoTipo === "fija" ? "btn" : "btn-ghost"} style={{ flex: 1, fontSize: 12 }} onClick={() => setNuevoTipo("fija")}>Fija (permanente)</button>
        </div>
        <button className="btn" style={{ width: "100%" }} onClick={agregar}>
          <Plus size={14} style={{ verticalAlign: "-2px" }} /> Agregar actividad
        </button>
      </div>
    </div>
  );
}


function TopBar({ title, subtitle, onLogout, onRefresh, refrescando }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
      <div>
        <h1 className="display" style={{ fontSize: 24, margin: 0 }}>{title}</h1>
        <div style={{ fontSize: 12, color: "#9AA7BD" }}>{subtitle}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {onRefresh && (
          <button className="btn-ghost" onClick={onRefresh} disabled={refrescando}>
            <RefreshCw size={14} style={{ verticalAlign: "-2px", animation: refrescando ? "spin 1s linear infinite" : "none" }} /> {refrescando ? "..." : "Refrescar"}
          </button>
        )}
        <button className="btn-ghost" onClick={onLogout}><LogOut size={14} style={{ verticalAlign: "-2px" }} /> Salir</button>
      </div>
    </div>
  );
}

function StaffView({ data, persist, stats, puesto, staffUsername, onFile, fileInputRef, onDownloadTemplate, status, onObjetivosFile, objFileInputRef, onDownloadObjetivosTemplate, objStatus, onAvanceDiaFile, avanceDiaFileInputRef, avanceDiaStatus, onAvanceDiaTexto, onOtcDiaFile, otcDiaFileInputRef, otcDiaStatus, onOtcDiaTexto, onVentasPeriodoFile, ventasPeriodoFileInputRef, ventasPeriodoStatus, onVentasPeriodoTexto, onBorrarTodoVentasPeriodo, onMesaControlFile, mesaControlFileInputRef, mesaControlStatus, onMesaControlTexto, onOtcSemanalTexto, onCargasFile, cargasFileInputRef, cargasStatus, onDescargarCargas, onRefresh, refrescando, onLogout }) {
  const esSupervisor2 = puesto === "supervisor2";
  const esSupervisor1 = puesto === "supervisor";
  const [tab, setTab] = useState("resumen");
  const [objTab, setObjTab] = useState("dia");
  const objUnit = OBJETIVO_TABS.find((t) => t.key === objTab).unit;
  const [newName, setNewName] = useState("");

  // Estado de cada checklist de actividades, para pintar la pestaña
  // parpadeando en rojo (hay pendientes) o en verde (todo completo).
  const estadoTabsActividades = {
    actividades_dia: (data.actividades?.dia?.items || []).length === 0 ? undefined : (data.actividades.dia.items.every((it) => it.hecha) ? "completo" : "pendiente"),
    actividades_semana: (data.actividades?.semana?.items || []).length === 0 ? undefined : (data.actividades.semana.items.every((it) => it.hecha) ? "completo" : "pendiente"),
    actividades_mes: (data.actividades?.mes?.items || []).length === 0 ? undefined : (data.actividades.mes.items.every((it) => it.hecha) ? "completo" : "pendiente"),
    rally_otc: data.rallyOtc?.activo ? "completo" : undefined,
    avisos: hayAvisoNuevoPara(data, puesto, null) ? "aviso_nuevo" : undefined,
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
  const capturaPorRutaHoy = useCapturaImagen();

  function addVendedor() {
    if (!newName.trim()) return;
    const v = { id: "v" + Date.now(), name: newName.trim(), objetivos: { ...blankObjetivos(), open: Number(newOpen) || 0, champions: Number(newChampions) || 0 } };
    persist({ ...data, vendedores: [...data.vendedores, v] });
    setNewName(""); setNewOpen(""); setNewChampions("");
  }
  function removeVendedor(id) {
    persist({ ...data, vendedores: data.vendedores.filter((v) => v.id !== id) });
  }
  function updateObjetivo(id, field, val) {
    persist({
      ...data,
      vendedores: data.vendedores.map((v) =>
        v.id === id ? { ...v, objetivos: { ...v.objetivos, [field]: Number(val) || 0 } } : v
      ),
    });
  }
  function updatePeriodo(field, val) {
    const nuevoPeriodo = { ...data.periodo, [field]: val };
    // Las ventas del periodo ya viven en su propia tabla (ventas_periodo) y
    // se recargan solas cuando cambia data.periodo (ver useEffect de
    // cargarVentasPeriodo). Aquí solo se reinicia el conteo de cupones
    // canjeados por ruta, para que no se mezcle con el periodo nuevo.
    persist({
      ...data,
      periodo: nuevoPeriodo,
      cuponesRedimidos: [],
    });
  }
  function agregarDiaNoLaborable(fecha) {
    if (!fecha) return;
    const actuales = data.diasNoLaborables || [];
    if (actuales.includes(fecha)) return;
    persist({ ...data, diasNoLaborables: [...actuales, fecha].sort() });
  }
  function quitarDiaNoLaborable(fecha) {
    persist({ ...data, diasNoLaborables: (data.diasNoLaborables || []).filter((f) => f !== fecha) });
  }

  // Reinicia solo los checklists de actividades que ya entraron a un nuevo
  // periodo (día/semana/mes). No hace nada si ya están al día.
  useEffect(() => {
    if (!data) return;
    const actual = data.actividades;
    const normalizado = normalizarActividades(actual);
    const cambio = normalizado.dia !== actual?.dia || normalizado.semana !== actual?.semana || normalizado.mes !== actual?.mes;
    if (cambio) persist({ ...data, actividades: normalizado });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.actividades?.dia?.fecha, data?.actividades?.semana?.semanaId, data?.actividades?.mes?.mesId]);

  function marcarActividad(ciclo, id, hecha) {
    const est = data.actividades[ciclo];
    const items = est.items.map((it) => (it.id === id ? { ...it, hecha } : it));
    persist({ ...data, actividades: { ...data.actividades, [ciclo]: { ...est, items } } });
  }
  function agregarActividad(ciclo, texto, tipo, autor) {
    if (!texto || !texto.trim()) return;
    const est = data.actividades[ciclo];
    persist({ ...data, actividades: { ...data.actividades, [ciclo]: { ...est, items: [...est.items, nuevaActividad(texto, tipo, autor, fechaHoyISO())] } } });
  }
  function eliminarActividad(ciclo, id) {
    const est = data.actividades[ciclo];
    persist({ ...data, actividades: { ...data.actividades, [ciclo]: { ...est, items: est.items.filter((it) => it.id !== id) } } });
  }

  const revisorNombre = NOMBRES[staffUsername] || staffUsername || "Staff";

  function enviarMensajeDia(vendedorName, texto) {
    if (!texto.trim()) return;
    persist({
      ...data,
      mensajesDia: {
        ...(data.mensajesDia || {}),
        [vendedorName]: { texto: texto.trim(), fecha: todayISO(), autor: revisorNombre },
      },
    });
  }
  function quitarMensajeDia(vendedorName) {
    const copia = { ...(data.mensajesDia || {}) };
    delete copia[vendedorName];
    persist({ ...data, mensajesDia: copia });
  }

  function enviarMensajeSupervisor(username, texto) {
    if (!texto.trim()) return;
    persist({
      ...data,
      mensajesSupervisores: {
        ...(data.mensajesSupervisores || {}),
        [username]: { texto: texto.trim(), fecha: todayISO(), autor: revisorNombre },
      },
    });
  }
  function quitarMensajeSupervisor(username) {
    const copia = { ...(data.mensajesSupervisores || {}) };
    delete copia[username];
    persist({ ...data, mensajesSupervisores: copia });
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
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 18px 60px" }}>
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
                ? OBJETIVO_TABS.filter((t) => ["dia", "mesa", "cuponera", "tiempos", "rally_otc", "avisos"].includes(t.key))
                : esSupervisor1
                ? OBJETIVO_TABS.filter((t) => t.key !== "actividades_semana" && t.key !== "actividades_mes" && t.key !== "cotizador")
                : undefined
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
              />
            </>
          ) : objTab === "cuponera" ? (
            <CuponeraView data={data} persist={persist} puesto={puesto} rol="staff" rutaActual={null} revisorNombre={revisorNombre} nombres={NOMBRES} />
          ) : objTab === "tiempos" ? (
            <TiemposView identidad={revisorNombre} misAreas={["Ingreso a CLO", "Salida a ruta", "Ingreso a CLO (fin de ruta)", "Salida de CLO final"]} />
          ) : objTab === "rutas" ? (
            <RutasView stats={stats} />
          ) : objTab === "actividades_dia" ? (
            <ActividadesView ciclo="dia" titulo="ACTIVIDADES DEL DÍA" data={data} persist={persist} revisorNombre={revisorNombre} puedeEliminar={puesto === "gerente"} />
          ) : objTab === "actividades_semana" ? (
            <ActividadesView ciclo="semana" titulo="ACTIVIDADES DE LA SEMANA" data={data} persist={persist} revisorNombre={revisorNombre} puedeEliminar={puesto === "gerente"} />
          ) : objTab === "actividades_mes" ? (
            <ActividadesView ciclo="mes" titulo="ACTIVIDADES DEL MES" data={data} persist={persist} revisorNombre={revisorNombre} puedeEliminar={puesto === "gerente"} />
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
            <RallyOtcView data={data} persist={persist} puesto={puesto} rol="staff" revisorNombre={revisorNombre} />
          ) : objTab === "avisos" ? (
            <AvisosView data={data} persist={persist} puedeCrear={puesto === "gerente" || esSupervisor1} revisorNombre={revisorNombre} viewerKey={puesto} />
          ) : objTab === "cargas" ? (
            <CargasView
              data={data} persist={persist} puesto={puesto} rol="staff"
              onUpload={onCargasFile} cargasFileInputRef={cargasFileInputRef} cargasStatus={cargasStatus} onDescargar={onDescargarCargas}
            />
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
          <div className="display" style={{ fontSize: 14, color: "#9AA7BD", marginBottom: 8 }}>OTC SEMANAL (COMISIONES)</div>
          <p style={{ fontSize: 13, color: "#9AA7BD", marginTop: 0 }}>
            Sube el reporte de OTC de la semana, con columnas <b>Vendedor, Fecha Venta, TOTAL $</b> (acepta .xlsx, .csv o .txt).
            El avance es la suma de <b>TOTAL $</b> por ruta. Se mide en dinero y sirve para calcular la comisión de OTC de vendedores, supervisor y gerente.
            Cada carga reemplaza por completo la semana anterior (un archivo reemplaza al anterior).
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir OTC semanal
            </button>
            <button className="btn-ghost" onClick={onDownloadTemplate}>Descargar plantilla</button>
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: "none" }} onChange={onFile} />
          <PegarTextoBox onProcesar={onOtcSemanalTexto} placeholder="Pega aquí las filas con columnas Vendedor, Fecha Venta y TOTAL $ (incluye el encabezado)." />
          {status && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: status.startsWith("OTC semanal cargado") ? "#3DDC97" : "#FF6B6B" }}>
              {status.startsWith("OTC semanal cargado") ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {status}
            </div>
          )}
          <div style={{ marginTop: 18, fontSize: 12, color: "#9AA7BD" }}>
            Registros actuales: {(data.otcSemanal || []).length}
          </div>

          <div style={{ borderTop: "1px solid #1E2A42", marginTop: 20, paddingTop: 20 }}>
            <div className="display" style={{ fontSize: 14, color: "#9AA7BD", marginBottom: 8 }}>CARGA ACUMULADA DEL PERIODO (REPORTE DEL SISTEMA)</div>
            <p style={{ fontSize: 13, color: "#9AA7BD", marginTop: 0 }}>
              Alimenta <b>OPEN, CHAMPIONS y MAX</b> (no la pestaña DÍA, que usa sus propios archivos independientes más abajo).
              Sube el reporte tal cual lo exporta el sistema, con columnas <b>Vendedor, Fecha, Articulo, Paquetes, Total $</b> (acepta .xlsx, .csv o .txt separado por tabs).
              Se detecta la ruta del texto de Vendedor y la marca según el código de artículo: ICE MIX = FA01085, BLOSS MIX = FA01114, SUMM MIX = FA01115, FARONET = FA04016/FA04017/FA15010/FA15009.
              <b> Este historial se guarda y se va acumulando día a día</b> — cada carga solo reemplaza las fechas que traiga ese archivo; el resto de los días ya guardados no se toca.
              Puedes seleccionar <b>hasta 2 archivos a la vez</b> (por ejemplo si el reporte viene partido en dos por su tamaño); ambos se combinan antes de calcular el avance.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => ventasPeriodoFileInputRef.current?.click()}>
                <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir avance del periodo
              </button>
              <button className="btn-ghost" onClick={onBorrarTodoVentasPeriodo}>
                <Trash2 size={14} style={{ verticalAlign: "-2px" }} color="#FF6B6B" /> Borrar todo
              </button>
            </div>
            <input ref={ventasPeriodoFileInputRef} type="file" multiple accept=".xlsx,.xls,.csv,.txt" style={{ display: "none" }} onChange={onVentasPeriodoFile} />
            <PegarTextoBox onProcesar={onVentasPeriodoTexto} placeholder="Pega aquí las filas con columnas Vendedor, Fecha, Articulo, Paquetes y Total $ (incluye el encabezado)." />
            {ventasPeriodoStatus && (
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: ventasPeriodoStatus.startsWith("Periodo actualizado") ? "#3DDC97" : "#FF6B6B" }}>
                {ventasPeriodoStatus.startsWith("Periodo actualizado") ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {ventasPeriodoStatus}
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid #1E2A42", marginTop: 20, paddingTop: 20 }}>
            <div className="display" style={{ fontSize: 14, color: "#9AA7BD", marginBottom: 8 }}>AVANCE DEL DÍA (REPORTE DEL SISTEMA)</div>
            <p style={{ fontSize: 13, color: "#9AA7BD", marginTop: 0 }}>
              Sube el reporte tal cual lo exporta el sistema, con columnas <b>Vendedor, Fecha, Cliente, Articulo, Paquetes, Total $</b> (acepta .xlsx, .csv o .txt separado por tabs).
              Se detecta la ruta del texto de Vendedor (ej. "J201 - ...") y la marca según el código de artículo:
              ICE MIX = FA01085, BLOSS MIX = FA01114, SUMM MIX = FA01115, FARONET = FA04016/FA04017/FA15010/FA15009.
              Visitas efectivas = clientes distintos ese día (un cliente repetido varias veces cuenta una sola vez).
              Esta carga es exclusiva de la pestaña DÍA: no modifica ni se mezcla con los datos de OPEN, CHAMPIONS ni MAX.
              Cada carga reemplaza por completo el avance del día anterior.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => avanceDiaFileInputRef.current?.click()}>
                <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir avance del día
              </button>
            </div>
            <input ref={avanceDiaFileInputRef} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: "none" }} onChange={onAvanceDiaFile} />
            <PegarTextoBox onProcesar={onAvanceDiaTexto} placeholder="Pega aquí las filas con columnas Vendedor, Fecha, Cliente, Articulo, Paquetes y Total $ (incluye el encabezado)." />
            {avanceDiaStatus && (
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: avanceDiaStatus.startsWith("Avance cargado") ? "#3DDC97" : "#FF6B6B" }}>
                {avanceDiaStatus.startsWith("Avance cargado") ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {avanceDiaStatus}
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid #1E2A42", marginTop: 20, paddingTop: 20 }}>
            <div className="display" style={{ fontSize: 14, color: "#9AA7BD", marginBottom: 8 }}>OTC DEL DÍA (REPORTE EXCLUSIVO)</div>
            <p style={{ fontSize: 13, color: "#9AA7BD", marginTop: 0 }}>
              Sube el reporte de OTC tal cual lo exporta el sistema, con columnas <b>Vendedor, Fecha Venta, TOTAL $</b> (acepta .xlsx, .csv o .txt).
              El avance de OTC es la suma de <b>TOTAL $</b> por ruta, sin importar cuántos artículos distintos traiga cada una.
              Esta carga también es exclusiva de la pestaña DÍA y no toca OPEN, CHAMPIONS ni MAX. Cada carga reemplaza el OTC del día anterior.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => otcDiaFileInputRef.current?.click()}>
                <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir OTC del día
              </button>
            </div>
            <input ref={otcDiaFileInputRef} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: "none" }} onChange={onOtcDiaFile} />
            <PegarTextoBox onProcesar={onOtcDiaTexto} placeholder="Pega aquí las filas con columnas Vendedor, Fecha Venta y TOTAL $ (incluye el encabezado)." />
            {otcDiaStatus && (
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: otcDiaStatus.startsWith("OTC cargado") ? "#3DDC97" : "#FF6B6B" }}>
                {otcDiaStatus.startsWith("OTC cargado") ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {otcDiaStatus}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
