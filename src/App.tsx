// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Truck, Target, Users, Upload, LogOut, Star, MapPin, Flag,
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

  return {
    fecha, horaInicio, top5, menores3, tipoInicioConteo, tipoFinConteo,
    volumenTotal, clientesVolumen03, clientesConDescuento, todos: conAlerta,
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
  const fileInputRef = useRef(null);
  const objFileInputRef = useRef(null);
  const avanceDiaFileInputRef = useRef(null);
  const otcDiaFileInputRef = useRef(null);
  const ventasPeriodoFileInputRef = useRef(null);
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
      const hoy = {
        fecha: fechaHoyRef,
        volumen: { vendido: paquetesHoy, objetivo: volumenObjetivo },
        visitasEfectivas: visitasEfectivasHoy,
        marcas: marcasHoy,
        otc: { objetivo: otcDiario, vendido: otcHoy },
        otcSinVuala: { piezas: otcSinVualaPiezas, cumple: otcSinVualaCumple },
        bajoDesempeno,
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

    return { porVendedor, total, restantes, diasTranscurridos, diasLaborablesTotal };
  }, [vendedores, ventas, avanceDia, otcDia, otcSemanal, diasNoLaborables, periodo]);

  async function handleOtcSemanalFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const filas = await parsearArchivoComoFilas(file);
      const registros = convertirFilasOtcDia(filas);
      if (registros.length === 0) {
        setStatus("No se encontraron filas válidas. Revisa el formato del archivo.");
        return;
      }
      persist({ ...data, otcSemanal: registros });
      const fechas = [...new Set(registros.map((r) => r.fecha))];
      setStatus(`OTC semanal cargado: ${registros.length} registros para ${fechas.join(", ")}.`);
    } catch (err) {
      setStatus("No se pudo leer el archivo. Verifica que tenga las columnas Vendedor, Fecha Venta y TOTAL $.");
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
    const ws = XLSX.utils.json_to_sheet([{
      RUTA: "RUTA J201", OPEN: 150000, CHAMPIONS: 200000, MAX: 200000, VISITAS_EFECTIVAS: 120,
      "ICE MIX": 40000, "BLOSS MIX": 30000, "SUMM MIX": 30000, FARONET: 20000,
      CHAM_ICE: 50000, "CHAM_BLOSS-SUMM": 40000, CHAM_FARONET: 25000, OTC: 9600, OTC_DIA: 1600,
    }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Objetivos");
    XLSX.writeFile(wb, "plantilla_objetivos.xlsx");
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

  async function handleAvanceDiaFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const filas = await parsearArchivoComoFilas(file);
      const registros = convertirFilasAvanceDia(filas);
      if (registros.length === 0) {
        setAvanceDiaStatus("No se encontraron filas válidas. Revisa el formato del archivo.");
        return;
      }
      persist({ ...data, avanceDia: registros });
      const fechas = [...new Set(registros.map((r) => r.fecha))];
      setAvanceDiaStatus(`Avance cargado: ${registros.length} registros para ${fechas.join(", ")}.`);
    } catch (err) {
      setAvanceDiaStatus("No se pudo leer el archivo. Verifica que tenga las columnas Vendedor, Fecha, Articulo, Paquetes y Total $.");
    }
  }

  async function handleOtcDiaFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const filas = await parsearArchivoComoFilas(file);
      const registros = convertirFilasOtcDia(filas);
      if (registros.length === 0) {
        setOtcDiaStatus("No se encontraron filas válidas. Revisa el formato del archivo.");
        return;
      }
      persist({ ...data, otcDia: registros });
      const fechas = [...new Set(registros.map((r) => r.fecha))];
      setOtcDiaStatus(`OTC cargado: ${registros.length} registros para ${fechas.join(", ")}.`);
    } catch (err) {
      setOtcDiaStatus("No se pudo leer el archivo. Verifica que tenga las columnas Vendedor, Fecha Venta y TOTAL $.");
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

  async function handleVentasPeriodoFile(e) {
    const files = Array.from(e.target.files || []).slice(0, 2);
    e.target.value = "";
    if (files.length === 0) return;
    try {
      setVentasPeriodoStatus(`Procesando ${files.length} archivo${files.length > 1 ? "s" : ""}...`);

      const filasPorArchivo = await Promise.all(files.map(parsearArchivoComoFilas));
      const registros = convertirFilasVentasPeriodo(filasPorArchivo.flat());
      if (registros.length === 0) {
        setVentasPeriodoStatus("No se encontraron filas válidas. Revisa el formato del archivo.");
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
        setVentasPeriodoStatus(`Se guardó parte de la información, pero ${lotesConError} de ${totalLotes} lotes fallaron por la conexión. No se borró nada de lo anterior — vuelve a subir el mismo archivo para completar lo que falta (es seguro repetirlo).`);
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
      setVentasPeriodoStatus(`Periodo actualizado: ${registros.length} registros (${files.length} archivo${files.length > 1 ? "s" : ""}) para ${fechas.join(", ")}.`);
    } catch (err) {
      console.error(err);
      setVentasPeriodoStatus("No se pudo leer el archivo. Verifica que tenga las columnas Vendedor, Fecha, Articulo, Paquetes y Total $.");
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

  async function handleMesaControlFile(e) {
    // Hasta 7 archivos a la vez (uno por ruta), o se puede subir de 1 en 1.
    const files = Array.from(e.target.files || []).slice(0, 7);
    e.target.value = "";
    if (files.length === 0) return;
    try {
      setMesaControlStatus(`Procesando ${files.length} archivo${files.length > 1 ? "s" : ""}...`);

      const filasPorArchivo = await Promise.all(files.map(parsearArchivoComoFilas));
      const registros = convertirFilasMesaControl(filasPorArchivo.flat());
      if (registros.length === 0) {
        setMesaControlStatus("No se encontraron filas válidas. Revisa el formato de los archivos.");
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
        setMesaControlStatus(
          `Mesa de control guardada: ${files.length} archivo${files.length > 1 ? "s" : ""}. ${detalle}. Total acumulado: ${mesaControlMerged.length} visitas.`
        );
      }
    } catch (err) {
      console.error(err);
      setMesaControlStatus(`No se pudo procesar el archivo: ${err?.message || "revisa columnas vendedor, fecha, cliente, inicio, final, Tiempo_estancia, tipoinicio, tipofin, volumen y descuento."}`);
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
          onOtcDiaFile={handleOtcDiaFile}
          otcDiaFileInputRef={otcDiaFileInputRef}
          otcDiaStatus={otcDiaStatus}
          onVentasPeriodoFile={handleVentasPeriodoFile}
          ventasPeriodoFileInputRef={ventasPeriodoFileInputRef}
          ventasPeriodoStatus={ventasPeriodoStatus}
          onBorrarTodoVentasPeriodo={borrarTodoVentasPeriodo}
          onMesaControlFile={handleMesaControlFile}
          mesaControlFileInputRef={mesaControlFileInputRef}
          mesaControlStatus={mesaControlStatus}
          onRefresh={refrescarManual}
          refrescando={refrescando}
          onLogout={() => { setRole(null); setPuesto(null); setStaffUsername(null); }}
        />
      )}

      {role === "liquidacion" && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
          <TiemposView
            identidad={NOMBRES[staffUsername] || "Sulema Ponce"}
            misAreas={["Liquidación"]}
            onLogout={() => { setRole(null); setPuesto(null); setStaffUsername(null); }}
          />
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

function ObjetivoTabs({ tab, setTab, tabs }) {
  const lista = tabs || OBJETIVO_TABS;
  return (
    <div style={{ display: "flex", gap: 8, margin: "14px 0", flexWrap: "wrap" }}>
      {lista.map((t) => (
        <button key={t.key} onClick={() => setTab(t.key)}
          className={tab === t.key ? "btn" : "btn-ghost"} style={{ fontSize: 13, flex: 1 }}>
          {t.label}
        </button>
      ))}
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

function DiaKpis({ hoy, mensajeDia }) {
  return (
    <>
      <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 10 }}>Avance del {hoy.fecha}</div>
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

function TablaPorRutaHoy({ porVendedor }) {
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
          <th></th>
        </tr>
      </thead>
      <tbody>
        {porVendedor.map((v) => (
          <tr key={v.id} style={{ borderTop: "1px solid #1E2A42" }}>
            <td style={{ padding: "10px 16px" }}>{v.name}{NOMBRES[v.name] ? ` · ${NOMBRES[v.name]}` : ""}</td>
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


function MesaControlResumenCaptura({ analisis, nombreRuta, nombreVendedor, revisor }) {
  const { fecha, horaInicio, top5, menores3, tipoInicioConteo, volumenTotal, clientesVolumen03, clientesConDescuento, todos } = analisis;
  const gps = tipoInicioConteo["GPS"] || 0;
  const noGps = todos.length - gps;
  return (
    <div className="card" style={{ padding: 24, textAlign: "center", border: "1px solid #2A3852" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
        <Truck size={20} color="#F2B134" />
        <span className="display" style={{ fontSize: 18 }}>MESA DE CONTROL</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10 }}>{nombreRuta}</div>
      {nombreVendedor && <div style={{ fontSize: 15, color: "#E8EDF5" }}>{nombreVendedor}</div>}
      <div style={{ fontSize: 12, color: "#9AA7BD", marginTop: 6 }}>
        {fecha} · Inicio {horaInicio || "—"}{revisor ? ` · Revisó: ${revisor}` : ""}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 22, textAlign: "left" }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "#9AA7BD" }}>VISITAS TOTALES</div>
          <div className="mono" style={{ fontSize: 22 }}>{todos.length}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "#9AA7BD" }}>VOLUMEN TOTAL</div>
          <div className="mono" style={{ fontSize: 22, color: "#F2B134" }}>{unidades(volumenTotal)}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "#9AA7BD" }}>ESTANCIA &lt; 3 MIN</div>
          <div className="mono" style={{ fontSize: 22, color: menores3.length > 0 ? "#FF6B6B" : "#3DDC97" }}>{menores3.length}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "#9AA7BD" }}>INICIO NO-GPS</div>
          <div className="mono" style={{ fontSize: 22, color: noGps > 0 ? "#FF6B6B" : "#3DDC97" }}>{noGps} / {todos.length}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "#9AA7BD" }}>VENTA 0.3</div>
          <div className="mono" style={{ fontSize: 22 }}>{clientesVolumen03.length}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "#9AA7BD" }}>CON DESCUENTO</div>
          <div className="mono" style={{ fontSize: 22 }}>{clientesConDescuento.length}</div>
        </div>
      </div>

      <div style={{ marginTop: 22, textAlign: "left" }}>
        <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>TOP CLIENTES · MAYOR ESTANCIA</div>
        {top5.slice(0, 3).map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
            <span>{i + 1}. {r.cliente}</span>
            <span className="mono">{r.tiempoEstancia} min</span>
          </div>
        ))}
      </div>
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

// Compara dos horas en formato "HH:MM:SS" / "HH:MM" y regresa la diferencia
// en minutos (positivo = la segunda es más tarde que la primera).
function diferenciaMinutos(horaA, horaB) {
  if (!horaA || !horaB) return null;
  const aParts = horaA.split(":").map(Number);
  const bParts = horaB.split(":").map(Number);
  if (aParts.some(isNaN) || bParts.some(isNaN)) return null;
  const aMin = aParts[0] * 60 + aParts[1] + (aParts[2] || 0) / 60;
  const bMin = bParts[0] * 60 + bParts[1] + (bParts[2] || 0) / 60;
  return Math.round(bMin - aMin);
}

function MesaControlView({ analisis, nombreRuta, nombreVendedor, revisor }) {
  const [modoCaptura, setModoCaptura] = useState(false);
  const [tiempos, setTiempos] = useState(null);
  const [tiemposCargando, setTiemposCargando] = useState(true);

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
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn-ghost" onClick={() => setModoCaptura((m) => !m)}>
          {modoCaptura ? "Ver detalle completo" : "Ver resumen (para captura)"}
        </button>
      </div>

      {modoCaptura ? (
        <MesaControlResumenCaptura analisis={analisis} nombreRuta={nombreRuta} nombreVendedor={nombreVendedor} revisor={revisor} />
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

function VendorView({ vendedor, periodo, restantes, mesaControl, mensajeDia, data, persist, onRefresh, refrescando, onLogout }) {
  const [tab, setTab] = useState("dia");
  if (!vendedor) return <div style={{ padding: 24 }}>No encontrado. <button className="btn-ghost" onClick={onLogout}>Volver</button></div>;
  const nombre = NOMBRES[vendedor.name];
  const esTabEspecial = tab === "dia" || tab === "mesa" || tab === "cuponera";
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

      <ObjetivoTabs tab={tab} setTab={setTab} tabs={OBJETIVO_TABS.filter((t) => t.key !== "tiempos")} />

      {tab === "dia" ? (
        <DiaKpis hoy={vendedor.hoy} mensajeDia={mensajeDia} />
      ) : tab === "mesa" ? (
        <MesaControlView analisis={analizarMesaControl(mesaControl, vendedor.name)} nombreRuta={vendedor.name} nombreVendedor={nombre} />
      ) : tab === "cuponera" ? (
        <CuponeraView data={data} persist={persist} puesto={null} rol="vendedor" rutaActual={vendedor.name} nombres={NOMBRES} />
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

function StaffView({ data, persist, stats, puesto, staffUsername, onFile, fileInputRef, onDownloadTemplate, status, onObjetivosFile, objFileInputRef, onDownloadObjetivosTemplate, objStatus, onAvanceDiaFile, avanceDiaFileInputRef, avanceDiaStatus, onOtcDiaFile, otcDiaFileInputRef, otcDiaStatus, onVentasPeriodoFile, ventasPeriodoFileInputRef, ventasPeriodoStatus, onBorrarTodoVentasPeriodo, onMesaControlFile, mesaControlFileInputRef, mesaControlStatus, onRefresh, refrescando, onLogout }) {
  const esSupervisor2 = puesto === "supervisor2";
  const [tab, setTab] = useState("resumen");
  const [objTab, setObjTab] = useState("dia");
  const objUnit = OBJETIVO_TABS.find((t) => t.key === objTab).unit;
  const [newName, setNewName] = useState("");
  const [newOpen, setNewOpen] = useState("");
  const [newChampions, setNewChampions] = useState("");
  const [nuevoFestivo, setNuevoFestivo] = useState("");
  const [rutaMesaSeleccionada, setRutaMesaSeleccionada] = useState(data.vendedores[0]?.name || "");
  const [rutaMensajeSeleccionada, setRutaMensajeSeleccionada] = useState(data.vendedores[0]?.name || "");
  const [textoMensaje, setTextoMensaje] = useState("");
  const [supervisorMensajeSeleccionado, setSupervisorMensajeSeleccionado] = useState("SUPERVISOR-1");
  const [textoMensajeSupervisor, setTextoMensajeSupervisor] = useState("");
  const [verTablaHoyCompleta, setVerTablaHoyCompleta] = useState(false);

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
          <ObjetivoTabs tab={objTab} setTab={setObjTab} tabs={esSupervisor2 ? OBJETIVO_TABS.filter((t) => t.key === "dia" || t.key === "mesa" || t.key === "cuponera" || t.key === "tiempos") : undefined} />

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
                  <button className="btn-ghost" onClick={() => setVerTablaHoyCompleta(true)}>
                    Ver tabla completa (pantalla)
                  </button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <TablaPorRutaHoy porVendedor={stats.porVendedor} />
                </div>
              </div>

              {verTablaHoyCompleta && (
                <ModalTablaCompleta titulo="POR RUTA · HOY" onClose={() => setVerTablaHoyCompleta(false)}>
                  <TablaPorRutaHoy porVendedor={stats.porVendedor} />
                </ModalTablaCompleta>
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
              />
            </>
          ) : objTab === "cuponera" ? (
            <CuponeraView data={data} persist={persist} puesto={puesto} rol="staff" rutaActual={null} revisorNombre={revisorNombre} nombres={NOMBRES} />
          ) : objTab === "tiempos" ? (
            <TiemposView identidad={revisorNombre} misAreas={["Ingreso a CLO", "Salida a ruta", "Ingreso a CLO (fin de ruta)", "Salida de CLO final"]} />
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
