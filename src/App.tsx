// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Truck, Target, Users, Upload, LogOut, Star, MapPin, Flag,
  Plus, Trash2, Calendar, ChevronRight, AlertCircle, CheckCircle2, Clock,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

// ====== SUPABASE ======
const SUPABASE_URL = "https://jxyosutthiuzbrmdznoa.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__ar93u3tGlT6qILWxGTZdw_B1gt699R";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const STATE_ID = "main";
// ======================

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
};
const OBJETIVO_TABS = [
  { key: "dia", label: "DÍA", unit: "special" },
  { key: "max", label: "MAX", unit: "units" },
  { key: "open", label: "OPEN", unit: "units" },
  { key: "champions", label: "CHAMPIONS", unit: "units" },
  { key: "mesa", label: "MESA DE CONTROL", unit: "special" },
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
};

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
  { username: "SUPERVISOR-2", password: "3030", role: "staff", puesto: "supervisor2" },
  { username: "GERENTE", password: "3030", role: "staff", puesto: "gerente" },
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

const todayISO = () => new Date().toISOString().slice(0, 10);

function firstOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function lastOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

// Cuenta días hábiles (Lun-Sáb, excluyendo domingos) entre hoy y "fin", inclusive.
// diasNoLaborables: array de fechas "YYYY-MM-DD" (festivos o descansos extraordinarios)
// que también se descuentan del conteo, aunque caigan en Lun-Sáb.
function diasRestantes(fin, diasNoLaborables) {
  const excluidos = new Set(diasNoLaborables || []);
  const end = new Date(fin + "T00:00:00");
  const start = new Date(todayISO() + "T00:00:00");
  if (start > end) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    if (cur.getDay() !== 0 && !excluidos.has(iso)) count++; // excluye domingo y festivos/descansos
    cur.setDate(cur.getDate() + 1);
  }
  return count;
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
    ventas: [],
    avanceDia: [],
    otcDia: [],
    diasNoLaborables: [],
    otcSemanal: [],
    mesaControl: [],
    periodo: { inicio: firstOfMonthISO(), fin: lastOfMonthISO() },
  };
}

export default function App() {
  const [data, setData] = useState(null);
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
  const mesaControlFileInputRef = useRef(null);

  useEffect(() => {
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
          // Asegura que mesaControl exista aunque venga de una versión anterior
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
    loadData();
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

  const vendedores = data?.vendedores || [];
  const ventas = data?.ventas || [];
  const avanceDia = data?.avanceDia || [];
  const otcDia = data?.otcDia || [];
  const otcSemanal = data?.otcSemanal || [];
  const mesaControl = data?.mesaControl || [];
  const diasNoLaborables = data?.diasNoLaborables || [];
  const periodo = data?.periodo || { inicio: firstOfMonthISO(), fin: lastOfMonthISO() };

  const stats = useMemo(() => {
    const restantes = diasRestantes(periodo.fin, diasNoLaborables);
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
      const propias = ventas.filter(
        (r) => r.vendedor.trim().toLowerCase() === v.name.trim().toLowerCase()
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

      const marcasChampions = {
        champIce: buildMarca(v.objetivos?.champIce || 0, marcasOpen.iceMix.vendido),
        champBlossSumm: buildMarca(v.objetivos?.champBlossSumm || 0, marcasOpen.blossMix.vendido + marcasOpen.summMix.vendido),
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

      return { ...v, volumenVentas, paquetesTotal, visitasEfectivas, volumenEstrategicas, marcasOpen, marcasChampions, champVendido, marcaOtc, ventaOtcSemanal, tasaComisionOtc, comisionOtc, hoy, tabs, ventaPorDia, ventaPorDiaUnidades };
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

    return { porVendedor, total, restantes };
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

  // Fusiona los nuevos registros en el historial guardado: reemplaza solo las
  // fechas que vengan en la carga (permite corregir un día) y conserva intacto
  // el resto del historial acumulado día a día.
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

  // Carga acumulada del periodo: alimenta `ventas` (OPEN, CHAMPIONS, MAX).
  // Acepta hasta 2 archivos (se combinan) y guarda el historial completo:
  // cada carga solo reemplaza las fechas que traiga, el resto de días ya
  // guardados se conserva, para que el avance se vaya sumando día a día.
  async function handleVentasPeriodoFile(e) {
    const files = Array.from(e.target.files || []).slice(0, 2);
    e.target.value = "";
    if (files.length === 0) return;
    try {
      const filasPorArchivo = await Promise.all(files.map(parsearArchivoComoFilas));
      const registros = convertirFilasVentasPeriodo(filasPorArchivo.flat());
      if (registros.length === 0) {
        setVentasPeriodoStatus("No se encontraron filas válidas. Revisa el formato del archivo.");
        return;
      }
      const { historial, fechas } = fusionarPorFecha(data.ventas, registros);
      persist({ ...data, ventas: historial });
      setVentasPeriodoStatus(`Periodo actualizado: ${registros.length} registros (${files.length} archivo${files.length > 1 ? "s" : ""}) para ${fechas.join(", ")}. Historial acumulado: ${historial.length} registros.`);
    } catch (err) {
      setVentasPeriodoStatus("No se pudo leer el archivo. Verifica que tenga las columnas Vendedor, Fecha, Articulo, Paquetes y Total $.");
    }
  }


  async function handleMesaControlFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const filas = await parsearArchivoComoFilas(file);
      const registros = convertirFilasMesaControl(filas);
      if (registros.length === 0) {
        setMesaControlStatus("No se encontraron filas válidas. Revisa el formato del archivo.");
        return;
      }
      persist({ ...data, mesaControl: registros });
      const fechas = [...new Set(registros.map((r) => r.fecha))];
      setMesaControlStatus(`Mesa de control cargada: ${registros.length} visitas para ${fechas.join(", ")}.`);
    } catch (err) {
      setMesaControlStatus("No se pudo leer el archivo. Verifica que tenga las columnas vendedor, fecha, cliente, inicio, final, Tiempo_estancia, tipoinicio, tipofin, volumen y descuento.");
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
      `}</style>

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
          onMesaControlFile={handleMesaControlFile}
          mesaControlFileInputRef={mesaControlFileInputRef}
          mesaControlStatus={mesaControlStatus}
          onLogout={() => { setRole(null); setPuesto(null); setStaffUsername(null); }}
        />
      )}

      {role === "vendedor" && (
        <VendorView
          vendedor={stats.porVendedor.find((v) => v.id === currentVendorId)}
          periodo={periodo}
          restantes={stats.restantes}
          mesaControl={mesaControl}
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

function DiaKpis({ hoy }) {
  return (
    <>
      <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 10 }}>Avance del {hoy.fecha}</div>
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

function MesaControlView({ analisis, nombreRuta, nombreVendedor, revisor }) {
  const [modoCaptura, setModoCaptura] = useState(false);
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

function VendorView({ vendedor, periodo, restantes, mesaControl, onLogout }) {
  const [tab, setTab] = useState("dia");
  if (!vendedor) return <div style={{ padding: 24 }}>No encontrado. <button className="btn-ghost" onClick={onLogout}>Volver</button></div>;
  const nombre = NOMBRES[vendedor.name];
  const m = (tab !== "dia" && tab !== "mesa") ? vendedor.tabs[tab] : null;
  const unit = OBJETIVO_TABS.find((t) => t.key === tab).unit;
  const chartData = unit === "units" ? vendedor.ventaPorDiaUnidades : vendedor.ventaPorDia;
  const chartKey = unit === "units" ? "paquetes" : "monto";
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 18px 60px" }}>
      <TopBar
        title={vendedor.name}
        subtitle={`${nombre ? nombre + " · " : ""}Periodo ${periodo.inicio} → ${periodo.fin} · ${restantes} días hábiles restantes (Lun-Sáb)`}
        onLogout={onLogout}
      />

      <ObjetivoTabs tab={tab} setTab={setTab} />

      {tab === "dia" ? (
        <DiaKpis hoy={vendedor.hoy} />
      ) : tab === "mesa" ? (
        <MesaControlView analisis={analizarMesaControl(mesaControl, vendedor.name)} nombreRuta={vendedor.name} nombreVendedor={nombre} />
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

function TopBar({ title, subtitle, onLogout }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
      <div>
        <h1 className="display" style={{ fontSize: 24, margin: 0 }}>{title}</h1>
        <div style={{ fontSize: 12, color: "#9AA7BD" }}>{subtitle}</div>
      </div>
      <button className="btn-ghost" onClick={onLogout}><LogOut size={14} style={{ verticalAlign: "-2px" }} /> Salir</button>
    </div>
  );
}

function StaffView({ data, persist, stats, puesto, staffUsername, onFile, fileInputRef, onDownloadTemplate, status, onObjetivosFile, objFileInputRef, onDownloadObjetivosTemplate, objStatus, onAvanceDiaFile, avanceDiaFileInputRef, avanceDiaStatus, onOtcDiaFile, otcDiaFileInputRef, otcDiaStatus, onVentasPeriodoFile, ventasPeriodoFileInputRef, ventasPeriodoStatus, onMesaControlFile, mesaControlFileInputRef, mesaControlStatus, onLogout }) {
  const esSupervisor2 = puesto === "supervisor2";
  const [tab, setTab] = useState("resumen");
  const [objTab, setObjTab] = useState("dia");
  const objUnit = OBJETIVO_TABS.find((t) => t.key === objTab).unit;
  const [newName, setNewName] = useState("");
  const [newOpen, setNewOpen] = useState("");
  const [newChampions, setNewChampions] = useState("");
  const [nuevoFestivo, setNuevoFestivo] = useState("");
  const [rutaMesaSeleccionada, setRutaMesaSeleccionada] = useState(data.vendedores[0]?.name || "");

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
    persist({ ...data, periodo: { ...data.periodo, [field]: val } });
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
      <TopBar title="Panel Staff" subtitle={`Periodo ${data.periodo.inicio} → ${data.periodo.fin} · ${stats.restantes} días hábiles restantes (Lun-Sáb)`} onLogout={onLogout} />

      <div style={{ display: "flex", gap: 8, margin: "18px 0" }}>
        {(esSupervisor2 ? [["resumen","Resumen"]] : [["resumen","Resumen"],["objetivos","Objetivos"],["cargar","Cargar datos"]]).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={tab===k ? "btn" : "btn-ghost"} style={{ fontSize: 13 }}>{l}</button>
        ))}
      </div>

      {tab === "resumen" && (
        <>
          <ObjetivoTabs tab={objTab} setTab={setObjTab} tabs={esSupervisor2 ? OBJETIVO_TABS.filter((t) => t.key === "dia" || t.key === "mesa") : undefined} />

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

              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div className="display" style={{ fontSize: 14, padding: "14px 16px 0", color: "#9AA7BD" }}>POR RUTA · HOY</div>
                <div style={{ overflowX: "auto" }}>
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
                      {stats.porVendedor.map((v) => (
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
                </div>
              </div>
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
                  <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir mesa de control
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
              <input ref={mesaControlFileInputRef} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: "none" }} onChange={onMesaControlFile} />
              {mesaControlStatus && (
                <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: mesaControlStatus.startsWith("Mesa de control cargada") ? "#3DDC97" : "#FF6B6B" }}>
                  {mesaControlStatus.startsWith("Mesa de control cargada") ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {mesaControlStatus}
                </div>
              )}
              <MesaControlView
                analisis={analizarMesaControl(data.mesaControl || [], rutaMesaSeleccionada)}
                nombreRuta={rutaMesaSeleccionada}
                nombreVendedor={NOMBRES[rutaMesaSeleccionada]}
                revisor={revisorNombre}
              />
            </>
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
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 10 }}>
                  <thead>
                    <tr style={{ color: "#9AA7BD", textAlign: "left" }}>
                      <th style={{ padding: "8px 16px" }}>Vendedor</th>
                      <th>Avance</th>
                      <th>Resta</th>
                      <th>Necesario/día</th>
                    </tr>
                  </thead>
                  <tbody>
                {stats.porVendedor.map((v) => (
                  <tr key={v.id} style={{ borderTop: "1px solid #1E2A42" }}>
                    <td style={{ padding: "10px 16px" }}>{v.name}{NOMBRES[v.name] ? ` · ${NOMBRES[v.name]}` : ""}</td>
                    <td>{v.tabs[objTab].avancePct.toFixed(0)}%</td>
                    <td>{fmt(objUnit, v.tabs[objTab].restaPorVender)}</td>
                    <td>{fmt(objUnit, v.tabs[objTab].ventaPorDiaNecesaria)}</td>
                  </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
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
