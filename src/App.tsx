// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Truck, Target, Users, Upload, LogOut, Star, MapPin, Flag, Download, ClipboardPaste,
  Plus, Trash2, Calendar, ChevronRight, AlertCircle, CheckCircle2, Clock, MessageSquare,
  RefreshCw, Ticket, Camera, Image as ImageIcon, Ban,
} from "lucide-react";

import {
  STATE_ID, SPLASH_IMAGE, RUTAS, NOMBRES, OBJETIVO_TABS, MARCA_KEYS, MARCA_KEYS_ALL,
  MARCAS_OPEN, MARCAS_CHAMPIONS, MARCAS_DIA, UMBRAL_BAJO_DESEMPENO,
  ARTICULO_MARCA_LABEL, MARCA_CHAM_EXTRA_BLOSS_SUMM, CODIGOS_OTC_SIN_VUALA,
  OTC_SIN_VUALA_MINIMO, USERS, TABLA_COMISION_SUPERVISOR, TABLA_COMISION_GERENTE,
  DIAS_SEMANA_OTC, DIAS_SEMANA_VISITAS,
} from "./constants";

import {
  todayISO, firstOfMonthISO, lastOfMonthISO, diasHabilesEntre, diasRestantes,
  money, unidades, fmt, metaColor, blankObjetivos, defaultData,
  normalizarActividades, nuevaActividad, fechaHoyISO, lunesDeSemana,
  multiplicadorComision, normalizarCodigo, normalizarEncabezado, quitarHtml,
  normalizarDia, creditosPendientes,
} from "./utils";

import { parseVisitasNurRaw } from "./visitasNurParser";

import { supabase } from "./supabaseClient";
import { paquetesACajetillas, infoProducto } from "./productosFacturables";
import Login from "./components/Login";
import VendorView from "./components/VendorView";
import StaffView from "./components/StaffView";

/* ---------------------------------------------------------------
   PARCHE DEFENSIVO — "NotFoundError: Failed to execute 'removeChild'
   on 'Node'". Es un bug conocido de React (no de este código): pasa
   cuando algo AJENO a React altera el árbol del DOM por debajo de él
   (típicamente extensiones del navegador tipo traductor, o el
   navegador integrado de WhatsApp/Facebook en Android) — cuando React
   luego intenta quitar/mover un nodo que ya no está donde lo dejó,
   truena y tumba toda la pantalla en blanco.
   Aquí se parchan removeChild/insertBefore para que, en vez de
   tronar, simplemente no hagan nada si el nodo ya no es hijo de ese
   padre — evita la pantalla en blanco sin tapar otros errores reales.
------------------------------------------------------------------ */
if (typeof window !== "undefined" && !window.__ruParcheDom) {
  window.__ruParcheDom = true;
  const removeChildOriginal = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child.parentNode !== this) {
      console.warn("Se evitó un error de removeChild (el nodo ya no era hijo de este padre).");
      return child;
    }
    return removeChildOriginal.call(this, child);
  };
  const insertBeforeOriginal = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      console.warn("Se evitó un error de insertBefore (el nodo de referencia ya no era hijo de este padre).");
      return newNode;
    }
    return insertBeforeOriginal.call(this, newNode, referenceNode);
  };
}


// (Se quitó aquí un parche de removeChild/insertBefore que se había puesto
// para un error raro de "NotFoundError" — resultó que causaba un problema
// peor: cuando React necesitaba reemplazar bloques grandes de pantalla
// (como al cambiar de pestaña en FACTURAS/RELOJ CHECADOR), el parche a
// veces le impedía a React quitar el contenido viejo correctamente, y
// terminaba viéndose el contenido viejo y el nuevo pegados uno debajo del
// otro. Mejor dejar que React maneje el DOM sin interferencias.


/* =====================================================================
   COLA DE GUARDADO PENDIENTE (outbox durable en localStorage)
   ---------------------------------------------------------------------
   Antes, cuando `persistParcialFresco` reintentaba un guardado (Cargas,
   revisiones de Unidades, config de Unidades), todo el progreso del
   reintento vivía SOLO en memoria: si la app se cerraba, el navegador la
   mataba en segundo plano (común en Android con mala señal en ruta), o
   el celular se quedaba sin batería a medio intento, el cambio se
   perdía por completo y nadie se enteraba salvo por la barra de "no
   cierres la app" — que de nada sirve si igual se cierra sola.

   Esto agrega una bandeja de salida real: en cuanto se conoce el cambio
   exacto que hay que guardar (el resultado de `calcularCambios`, un
   objeto plano — no la función en sí, que no se puede guardar), se
   escribe de inmediato en localStorage. Desde ahí sobrevive a que se
   cierre la pestaña/app, y en cuanto vuelve a abrirse (o en cuanto
   regresa la señal, o cada cierto tiempo como respaldo) se reintenta
   solo, sin que nadie tenga que repetir la acción a mano. Solo se quita
   de la cola cuando Supabase confirma que sí se guardó.

   Alcance: por ahora cubre todo lo que pasa por `persistParcialFresco`
   (Cargas, revisiones de Unidades, config de Unidades). Los guardados
   que usan `persist()` directo en otras pantallas no pasan por aquí
   todavía — se les puede aplicar el mismo patrón después si hace falta.
===================================================================== */
const CLAVE_COLA_GUARDADO_PENDIENTE = "smarttrack_cola_guardado_pendiente";

function leerColaGuardadoPendiente() {
  try {
    const raw = window.localStorage.getItem(CLAVE_COLA_GUARDADO_PENDIENTE);
    const cola = raw ? JSON.parse(raw) : [];
    return Array.isArray(cola) ? cola : [];
  } catch (err) {
    console.error("No se pudo leer la cola de guardado pendiente:", err);
    return [];
  }
}

function escribirColaGuardadoPendiente(cola) {
  try {
    window.localStorage.setItem(CLAVE_COLA_GUARDADO_PENDIENTE, JSON.stringify(cola));
  } catch (err) {
    console.error("No se pudo escribir la cola de guardado pendiente:", err);
  }
}

function agregarAColaGuardadoPendiente(cambios, etiqueta) {
  const cola = leerColaGuardadoPendiente();
  const id = `pend_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  cola.push({ id, cambios, etiqueta: etiqueta || null, creadoEn: new Date().toISOString() });
  escribirColaGuardadoPendiente(cola);
  return id;
}

function quitarDeColaGuardadoPendiente(id) {
  escribirColaGuardadoPendiente(leerColaGuardadoPendiente().filter((it) => it.id !== id));
}


// Suma (o resta) días a una fecha "YYYY-MM-DD" sin depender de la zona
// horaria del navegador (arma la fecha en UTC puro). Se usa para calcular
// el día siguiente por default al subir una carga.
// Registra eventos de uso (login / cambio de pestaña) en su propia tabla
// de Supabase — NO en el documento JSON grande, para no repetir el
// problema de tamaño que ya tuvimos. Nunca debe tronar la app si falla
// (por eso el catch silencioso): es solo estadística, no algo crítico.
async function registrarEventoUso({ usuario, rol, puesto, tipoEvento, pestana }) {
  try {
    await supabase.from("eventos_uso").insert({
      usuario: usuario || null,
      rol: rol || null,
      puesto: puesto || null,
      tipo_evento: tipoEvento,
      pestana: pestana || null,
    });
  } catch (err) {
    console.warn("No se pudo registrar el evento de uso:", err);
  }
}

function sumarDiasISO(fechaISO, dias) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

const DIAS_SEMANA_KEYS_TODOS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

// "2026-08-21" -> "viernes". Se usa para saber a qué casilla fija
// (lunes..sábado) corresponde una fecha, ya que las cargas ahora se
// identifican por día de la semana y no por fecha calendario.
function diaSemanaKeyDe(fechaISO) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return DIAS_SEMANA_KEYS_TODOS[fecha.getUTCDay()];
}

// Día hábil siguiente a hoy (mañana), saltando domingo -> lunes, ya que
// las rutas no trabajan domingo. Devuelve tanto la clave del día como la
// fecha real, para poder mostrarla como referencia informativa.
function siguienteDiaHabil() {
  let fecha = sumarDiasISO(fechaHoyISO(), 1);
  let dia = diaSemanaKeyDe(fecha);
  if (dia === "domingo") {
    fecha = sumarDiasISO(fecha, 1);
    dia = diaSemanaKeyDe(fecha);
  }
  return { dia, fecha };
}

// normalizarCodigo ya viene importada de "./utils" (se usa aquí para
// cruzar el código de cliente de Mesa de Control contra clientes_ruta).

// Acumula, semana por semana, qué clientes SÍ tuvieron al menos una visita
// (inicio/final no vacíos) y cuáles solo aparecieron en el reporte sin
// nunca tener horario de visita — esos son los "sin visita" de la semana.
// A diferencia de `data.mesaControl` (que reemplaza el día anterior de una
// ruta cada vez que se sube uno nuevo), esto se va acumulando: cada carga
// del día solo agrega/actualiza info, nunca borra lo ya visto esa semana.
//
// El cliente se identifica PRINCIPALMENTE por código (más confiable que el
// nombre, que puede venir con variaciones) — si la fila no trae código
// (no debería pasar en Mesa de Control, pero por si acaso), se cae de
// respaldo al nombre. Se guardan ambos (código y nombre) dentro de cada
// registro para que el cruce contra clientes_ruta pueda usar cualquiera.
function fusionarVisitasSemana(historialActual, registrosNuevos) {
  const resultado = { ...(historialActual || {}) };
  registrosNuevos.forEach((r) => {
    if (!r.fecha || !r.vendedor) return;
    const semanaInicio = lunesDeSemana(r.fecha);
    const clave = `${r.vendedor}|${semanaInicio}`;
    const entradaExistente = resultado[clave] || { ruta: r.vendedor, semanaInicio, clientes: {}, fechasMesaControl: [] };
    // Se registra la fecha como "subida" sin importar si esta fila en
    // particular trae nombre de cliente o no — lo que importa aquí es que
    // sí llegó un archivo de Mesa de Control de esa ruta para ese día.
    const fechasMesaControl = (entradaExistente.fechasMesaControl || []).includes(r.fecha)
      ? entradaExistente.fechasMesaControl
      : [...(entradaExistente.fechasMesaControl || []), r.fecha];

    const clienteNombre = String(r.cliente || "").trim();
    const codigoNorm = normalizarCodigo(r.clienteCodigo);
    const claveCliente = codigoNorm || clienteNombre;
    let clientesActualizados = entradaExistente.clientes;
    if (claveCliente) {
      const clienteExistente = entradaExistente.clientes[claveCliente] || { codigo: codigoNorm || null, nombre: clienteNombre, visitado: false, ultimaFecha: r.fecha, fechasVistas: [], fechasVisitado: [] };
      const visitadoEsteDia = !!(String(r.inicio || "").trim() && String(r.final || "").trim());
      clientesActualizados = {
        ...entradaExistente.clientes,
        [claveCliente]: {
          codigo: codigoNorm || clienteExistente.codigo || null,
          nombre: clienteNombre || clienteExistente.nombre || "",
          visitado: clienteExistente.visitado || visitadoEsteDia,
          ultimaFecha: r.fecha > (clienteExistente.ultimaFecha || "") ? r.fecha : clienteExistente.ultimaFecha,
          fechasVistas: (clienteExistente.fechasVistas || []).includes(r.fecha) ? (clienteExistente.fechasVistas || []) : [...(clienteExistente.fechasVistas || []), r.fecha],
          // Fechas exactas en las que SÍ tuvo horario de visita (a diferencia
          // de fechasVistas, que incluye también los días que apareció en el
          // reporte sin visitarlo) — esto es lo que permite descontarlo del
          // día correcto contra el listado de clientes_ruta.
          fechasVisitado: visitadoEsteDia && !(clienteExistente.fechasVisitado || []).includes(r.fecha)
            ? [...(clienteExistente.fechasVisitado || []), r.fecha]
            : (clienteExistente.fechasVisitado || []),
        },
      };
    }
    resultado[clave] = { ...entradaExistente, fechasMesaControl, clientes: clientesActualizados };
  });
  return resultado;
}

// Evita que `visitasSemana` crezca para siempre — conserva solo las
// últimas ~8 semanas.
function podarVisitasSemanaAntiguas(visitasSemana, semanasAConservar = 8) {
  const limite = sumarDiasISO(lunesDeSemana(fechaHoyISO()), -7 * semanasAConservar);
  const podado = {};
  Object.entries(visitasSemana || {}).forEach(([clave, v]) => {
    if (v.semanaInicio >= limite) podado[clave] = v;
  });
  return podado;
}

// Cruce automático "sin visita" contra Avance del Día: si un cliente tuvo
// una venta ese día (aparece en el reporte de avance), es evidencia clara
// de que sí se le visitó, aunque Mesa de Control no lo haya registrado
// bien (o ni siquiera lo haya incluido ese día). Se acumula en la misma
// estructura semanal que Mesa de Control — el orden en que se suban los
// dos reportes no importa, cualquiera de los dos puede "salvar" a un
// cliente de aparecer como sin visita.
// A diferencia de Mesa de Control, Avance del Día no trae código de
// cliente — solo nombre. Para no crear una entrada duplicada de un cliente
// que YA existe (guardado bajo su código gracias a Mesa de Control), se
// busca primero si ya hay alguien con ese mismo nombre normalizado antes
// de crear una llave nueva.
// A diferencia de Mesa de Control, en Avance del Día la columna "cliente"
// en realidad es el CÓDIGO del cliente, no su nombre (así lo confirma
// extraerLineasFacturables para este mismo reporte: "En este reporte
// Cliente YA es el código — no hay columna de nombre"). Por eso el cruce
// aquí es por código normalizado, igual que en Mesa de Control — antes se
// comparaba como si fuera un nombre y casi nunca coincidía contra
// clientes_ruta, dejando sin descontar casi todo lo que dependía
// exclusivamente de Avance del Día (el sábado, sobre todo, que no tiene
// Mesa de Control ese día).
function fusionarVisitasSemanaDesdeAvanceDia(historialActual, registrosAvanceDia) {
  const resultado = { ...(historialActual || {}) };
  registrosAvanceDia.forEach((r) => {
    const codigoCliente = String(r.cliente || "").trim();
    if (!codigoCliente || !r.fecha || !r.vendedor) return;
    const codigoNorm = normalizarCodigo(codigoCliente);
    const semanaInicio = lunesDeSemana(r.fecha);
    const clave = `${r.vendedor}|${semanaInicio}`;
    const entradaExistente = resultado[clave] || { ruta: r.vendedor, semanaInicio, clientes: {}, fechasMesaControl: [] };

    const claveCliente = codigoNorm || codigoCliente;
    const clienteExistente = entradaExistente.clientes[claveCliente] || { codigo: codigoNorm || null, nombre: "", visitado: false, ultimaFecha: r.fecha, fechasVistas: [], fechasVisitado: [] };
    resultado[clave] = {
      ...entradaExistente,
      clientes: {
        ...entradaExistente.clientes,
        [claveCliente]: {
          ...clienteExistente,
          codigo: codigoNorm || clienteExistente.codigo || null,
          visitado: true, // tuvo una venta ese día en Avance del Día -> contó como visitado
          ultimaFecha: r.fecha > (clienteExistente.ultimaFecha || "") ? r.fecha : clienteExistente.ultimaFecha,
          fechasVistas: (clienteExistente.fechasVistas || []).includes(r.fecha) ? (clienteExistente.fechasVistas || []) : [...(clienteExistente.fechasVistas || []), r.fecha],
          fechasVisitado: (clienteExistente.fechasVisitado || []).includes(r.fecha) ? (clienteExistente.fechasVisitado || []) : [...(clienteExistente.fechasVisitado || []), r.fecha],
        },
      },
    };
  });
  return resultado;
}

// Cruce automático "sin visita" contra el reporte de clientes visitados
// por NUR — se combina con Mesa de Control y Avance del Día en la MISMA
// estructura semanal (visitasSemana): cualquiera de los tres puede
// "salvar" a un cliente de aparecer como sin visita, sin importar el
// orden en que se suban. Igual que Avance del Día, este reporte no trae
// nombre de cliente por separado (solo código), así que el cruce es por
// código normalizado contra clientes_ruta.
//
// OJO: este reporte se sube DIARIO y es ACUMULADO — cada día trae a
// TODOS los visitados hasta ese momento, no solo los de ese día. Por
// eso, si un cliente ya tenía una fecha de visita registrada de un día
// anterior, no se le vuelve a agregar la fecha de hoy también (seguiría
// apareciendo en el reporte de hoy aunque ya no lo hayan visitado de
// nuevo) — solo se anota la fecha la PRIMERA vez que aparece, que es su
// día real de visita.
function fusionarVisitasSemanaDesdeNur(historialActual, registrosNur, fechaCarga) {
  const resultado = { ...(historialActual || {}) };
  registrosNur.forEach((r) => {
    if (!r.rutaCodigo || !r.codigoCliente) return;
    const vendedor = `RUTA ${r.rutaCodigo}`;
    const semanaInicio = lunesDeSemana(fechaCarga);
    const clave = `${vendedor}|${semanaInicio}`;
    const entradaExistente = resultado[clave] || { ruta: vendedor, semanaInicio, clientes: {}, fechasMesaControl: [] };

    const codigoNorm = normalizarCodigo(r.codigoCliente);
    const claveCliente = codigoNorm || r.codigoCliente;
    const clienteExistente = entradaExistente.clientes[claveCliente] || { codigo: codigoNorm || null, nombre: "", visitado: false, ultimaFecha: fechaCarga, fechasVistas: [], fechasVisitado: [] };
    const yaTeniaFechaVisitado = (clienteExistente.fechasVisitado || []).length > 0;
    resultado[clave] = {
      ...entradaExistente,
      clientes: {
        ...entradaExistente.clientes,
        [claveCliente]: {
          ...clienteExistente,
          codigo: codigoNorm || clienteExistente.codigo || null,
          visitado: true,
          ultimaFecha: fechaCarga > (clienteExistente.ultimaFecha || "") ? fechaCarga : clienteExistente.ultimaFecha,
          fechasVistas: (clienteExistente.fechasVistas || []).includes(fechaCarga) ? (clienteExistente.fechasVistas || []) : [...(clienteExistente.fechasVistas || []), fechaCarga],
          fechasVisitado: yaTeniaFechaVisitado ? clienteExistente.fechasVisitado : [...(clienteExistente.fechasVisitado || []), fechaCarga],
        },
      },
    };
  });
  return resultado;
}
import TabsLiquidacion from "./components/TabsLiquidacion";
import TabsMerch from "./components/TabsMerch";
import FacturasAdminView from "./components/FacturasAdminView";

// -------------------------------------------------------------------
// Chequeo de versión — evita el caso "alguien tiene una pestaña vieja
// abierta y hace algo que pisa datos nuevos". Un tab abierto se queda
// corriendo el código de cuando se abrió sin importar cuánto tiempo pase
// ni cuántas veces se despliegue algo nuevo — la única forma de que se
// entere de que hay una versión más nueva es preguntando activamente.
//
// version.json vive en /public (se sirve tal cual, sin hashear) y se
// actualiza cada vez que se hace un deploy nuevo — solo hay que cambiar
// el valor de "build" ahí (por ejemplo a la fecha/hora del deploy).
const BUILD_VERSION = "6.0";
const INTERVALO_CHEQUEO_VERSION_MS = 3 * 60 * 1000; // cada 3 minutos

function useChequeoDeVersion() {
  useEffect(() => {
    let cancelado = false;
    async function chequear() {
      try {
        const resp = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!resp.ok) return;
        const { build } = await resp.json();
        if (!cancelado && build && build !== BUILD_VERSION) {
          window.alert("Hay una versión más nueva de SMART-TRACK. La página se va a recargar para que no se pierda ni se pise ningún dato.");
          window.location.reload();
        }
      } catch {
        // Sin internet o el archivo no existe todavía — no pasa nada,
        // se reintenta en el siguiente ciclo.
      }
    }
    const intervalo = setInterval(chequear, INTERVALO_CHEQUEO_VERSION_MS);
    return () => { cancelado = true; clearInterval(intervalo); };
  }, []);
}

export default function App() {
  useChequeoDeVersion();
  const [data, setData] = useState(null);
  const [showSplash, setShowSplash] = useState(true);
  const [role, setRole] = useState(null); // 'staff' | 'vendedor'
  const [puesto, setPuesto] = useState(null); // 'supervisor' | 'gerente' (solo aplica cuando role === 'staff')
  const [staffUsername, setStaffUsername] = useState(null);
  const [currentVendorId, setCurrentVendorId] = useState(null);
  const [status, setStatus] = useState("");
  const [objStatus, setObjStatus] = useState("");
  const [objetivoVisitasStatus, setObjetivoVisitasStatus] = useState("");
  const [avanceDiaStatus, setAvanceDiaStatus] = useState("");
  const [otcDiaStatus, setOtcDiaStatus] = useState("");
  const [pedidosDiaStatus, setPedidosDiaStatus] = useState("");
  const [ventasPeriodoStatus, setVentasPeriodoStatus] = useState("");
  const [mesaControlStatus, setMesaControlStatus] = useState("");
  const [cargasStatus, setCargasStatus] = useState("");
  // true cuando el archivo YA se descargó pero el bloqueo de la carga no se
  // pudo confirmar contra Supabase (falta de señal) — mientras esté en true,
  // los vendedores técnicamente pueden seguir modificando aunque Gerente ya
  // haya "cerrado" la carga en su cabeza.
  const [bloqueoPendiente, setBloqueoPendiente] = useState(false);
  const fileInputRef = useRef(null);
  const objFileInputRef = useRef(null);
  const objetivoVisitasFileInputRef = useRef(null);
  const avanceDiaFileInputRef = useRef(null);
  const otcDiaFileInputRef = useRef(null);
  const pedidosDiaFileInputRef = useRef(null);
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
  // Cola de guardados "trae lo más reciente, modifícalo, guarda" (cargas,
  // revisiones de unidades, configuración de unidades). Sin esto, si alguien
  // hace varios de estos cambios muy seguidos (ej. asignar 10 rutas una tras
  // otra), el segundo cambio puede leer la base ANTES de que el primero
  // termine de guardar, y al escribir borra sin querer el primero. Con la
  // cola, cada uno espera a que el anterior termine antes de leer y guardar.
  const colaPersistenciaFrescaRef = useRef(Promise.resolve());
  // Estado visible del guardado en curso: null | "guardando" | "reintentando"
  // | "sin_conexion" | "error". Se muestra como una barra fija abajo para
  // que nadie cierre la app creyendo que ya guardó cuando sigue pendiente.
  // Se inicializa revisando la cola durable: si ya había algo pendiente de
  // una sesión anterior (la app se cerró a medio guardar), el aviso
  // aparece de inmediato al abrir, no hasta que termine el primer intento.
  const [estadoGuardado, setEstadoGuardado] = useState(() => (leerColaGuardadoPendiente().length > 0 ? "reintentando" : null));

  // Si hay un guardado en curso (o esperando conexión), el navegador pide
  // confirmación antes de cerrar la pestaña — así nadie pierde un registro
  // por cerrar la app justo cuando la señal se cayó.
  useEffect(() => {
    const hayPendiente = estadoGuardado === "guardando" || estadoGuardado === "reintentando" || estadoGuardado === "sin_conexion";
    if (!hayPendiente) return;
    const avisar = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [estadoGuardado]);

  // Vacía la cola de guardado pendiente "en cualquier oportunidad": al
  // abrir la app (por si quedó algo de una sesión anterior que se cerró a
  // medio guardar), en cuanto el navegador avisa que regresó la conexión, y
  // como respaldo cada 45s mientras algo siga pendiente (algunos celulares
  // no disparan el evento "online" de forma confiable en segundo plano).
  useEffect(() => {
    vaciarColaGuardadoPendiente();
    window.addEventListener("online", vaciarColaGuardadoPendiente);
    const intervalo = setInterval(() => {
      if (leerColaGuardadoPendiente().length > 0) vaciarColaGuardadoPendiente();
    }, 45000);
    return () => {
      window.removeEventListener("online", vaciarColaGuardadoPendiente);
      clearInterval(intervalo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        return { ok: false, error };
      } else {
        console.log("Guardado OK en Supabase", saved);
        setStatus("");
        return { ok: true };
      }
    } catch (err) {
      console.error("Error de red al guardar:", err);
      setStatus(`Error de red: ${err?.message || String(err)}`);
      return { ok: false, error: err };
    }
  }

  // Trae el documento más reciente directo de Supabase (no lo que esta
  // pestaña tenga en pantalla). Se usa para acciones sobre "cargas", donde
  // varias personas (staff subiendo un archivo nuevo, vendedores enviando su
  // propuesta) pueden guardar casi al mismo tiempo desde pestañas que llevan
  // rato abiertas con datos desactualizados.
  // Trae el documento más reciente directo de Supabase. IMPORTANTE: si la
  // lectura falla, LANZA el error en vez de devolver la copia local vieja.
  // Devolver la copia vieja sería justo el bug que se quiere evitar: se
  // guardaría una versión desactualizada encima de la buena.
  async function obtenerDataFresca() {
    const { data: row, error } = await supabase
      .from("ventas_app_state")
      .select("data")
      .eq("id", STATE_ID)
      .single();
    if (error) throw new Error(error.message || "No se pudo leer el estado más reciente.");
    if (!row?.data) throw new Error("El estado más reciente llegó vacío.");
    return { ...defaultData(), ...row.data, mesaControl: row.data.mesaControl || [] };
  }

  // Si el dispositivo está sin conexión, espera hasta que vuelva (o hasta
  // que se agote el tiempo máximo). Así, en vez de fallar de inmediato en
  // una zona con mala señal, el guardado simplemente queda en espera y se
  // completa solo en cuanto hay red.
  function esperarConexion(maxEsperaMs = 180000) {
    if (navigator.onLine !== false) return Promise.resolve(true);
    return new Promise((resolve) => {
      const limpiar = () => {
        clearTimeout(temporizador);
        window.removeEventListener("online", alVolver);
      };
      const alVolver = () => { limpiar(); resolve(true); };
      const temporizador = setTimeout(() => { limpiar(); resolve(false); }, maxEsperaMs);
      window.addEventListener("online", alVolver);
    });
  }

  // Guarda un cambio sobre "cargas" siempre partiendo del documento más
  // reciente de Supabase, no del que esta pestaña tenga cargado. Así, si
  // alguien (staff subiendo un archivo nuevo, o un vendedor enviando su
  // propuesta) tenía la pantalla abierta desde antes con datos viejos, su
  // guardado no puede pisar por accidente una carga más reciente subida por
  // otra persona — cada quien construye sobre lo último de verdad.
  // "calcularNuevoCargas" recibe el objeto "cargas" fresco y regresa el
  // nuevo objeto "cargas" a guardar.
  // Helper genérico: trae el documento más reciente de Supabase, le aplica
  // los cambios que calcule "calcularCambios" (recibe el documento fresco y
  // regresa un objeto parcial a fusionar), y guarda el resultado. Se usa
  // para cualquier campo donde varias personas puedan guardar casi al mismo
  // tiempo desde pestañas abiertas desde antes (cargas, revisiones de
  // unidades) — así nadie pisa por accidente el cambio más reciente de otra
  // persona con datos que tenía desactualizados en pantalla.
  function persistParcialFresco(calcularCambios) {
    const MAX_INTENTOS = 6;

    const ejecutar = async () => {
      let ultimoError = null;
      let cambios = null;
      let idPendiente = null;
      for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
        // Si no hay red, no tiene caso intentar: se queda esperando a que
        // vuelva la conexión (hasta 3 min) y entonces sigue solo.
        if (navigator.onLine === false) {
          setEstadoGuardado("sin_conexion");
          await esperarConexion();
        }
        try {
          setEstadoGuardado(intento === 1 ? "guardando" : "reintentando");
          const fresca = await obtenerDataFresca();
          if (cambios === null) {
            cambios = calcularCambios(fresca);
            // En cuanto se conoce el cambio exacto a guardar (un objeto
            // plano, ya no la función), se registra en la cola durable de
            // localStorage — así, aunque la app se cierre a medio intento,
            // al volver a abrirla (o en cuanto regrese la señal) se retoma
            // este MISMO cambio solo, sin perderlo ni tener que repetir la
            // acción a mano.
            idPendiente = agregarAColaGuardadoPendiente(cambios);
          }
          const resultado = await persist({ ...fresca, ...cambios });
          if (resultado?.ok) {
            if (idPendiente) quitarDeColaGuardadoPendiente(idPendiente);
            setEstadoGuardado(null);
            return;
          }
          ultimoError = resultado?.error;
        } catch (err) {
          ultimoError = err;
        }
        if (intento < MAX_INTENTOS) {
          // Espera creciente entre intentos (1s, 2s, 4s… hasta 15s), para no
          // saturar la red cuando la señal está intermitente.
          const espera = Math.min(1000 * Math.pow(2, intento - 1), 15000);
          await new Promise((r) => setTimeout(r, espera));
        }
      }
      // Se agotaron los intentos DE ESTA SESIÓN, pero el cambio se queda en
      // la cola durable (no se borra) — sigue disponible para que
      // `vaciarColaGuardadoPendiente` lo retome solo en cualquier
      // oportunidad futura (al reabrir la app, al volver la señal, o por el
      // respaldo periódico), sin que nadie tenga que repetir la acción.
      setEstadoGuardado("error");
      throw new Error(ultimoError?.message || "No se pudo guardar el cambio después de varios intentos. Se seguirá reintentando solo en cuanto haya señal.");
    };

    // Se encadena sobre la cola: este cambio no empieza a leer la base hasta
    // que el cambio anterior (si lo hay) ya terminó de guardar por completo.
    // Si el anterior falló, igual se sigue con este (no se atora la cola).
    const tarea = colaPersistenciaFrescaRef.current.then(ejecutar, ejecutar);
    colaPersistenciaFrescaRef.current = tarea.catch(() => {});
    return tarea;
  }

  // Recorre lo que haya quedado pendiente en la cola durable (de esta
  // sesión o de una anterior — sobrevive a cerrar la app) e intenta
  // guardarlo. Se llama al abrir la app, en cuanto vuelve la conexión, y
  // como respaldo cada cierto tiempo mientras algo siga pendiente — así el
  // reintento no depende de que alguien deje la pantalla abierta.
  async function vaciarColaGuardadoPendiente() {
    const pendientes = leerColaGuardadoPendiente();
    if (pendientes.length === 0) return;
    const intentar = async () => {
      setEstadoGuardado((actual) => (actual === "guardando" ? actual : "reintentando"));
      for (const item of leerColaGuardadoPendiente()) {
        try {
          const fresca = await obtenerDataFresca();
          const resultado = await persist({ ...fresca, ...item.cambios });
          if (resultado?.ok) {
            quitarDeColaGuardadoPendiente(item.id);
          }
        } catch (err) {
          console.error("No se pudo confirmar un pendiente de la cola de guardado:", err);
          // Se deja en la cola tal cual — se reintenta en la próxima oportunidad.
        }
      }
      const quedan = leerColaGuardadoPendiente();
      setEstadoGuardado(quedan.length > 0 ? "error" : null);
    };
    // También se encadena sobre la misma cola de promesas que
    // persistParcialFresco, para que nunca compitan por escribir a la vez.
    const tarea = colaPersistenciaFrescaRef.current.then(intentar, intentar);
    colaPersistenciaFrescaRef.current = tarea.catch(() => {});
    return tarea;
  }


  // Las cargas ahora viven por DÍA DE LA SEMANA (data.cargasPorDia[dia],
  // dia ∈ "lunes".."sabado"), no por fecha calendario: son 6 cupos fijos
  // que se van reutilizando semana tras semana (hoy jueves subo la del
  // viernes; la próxima semana, jueves otra vez, vuelvo a subir/activar
  // esa misma casilla "viernes"). El Gerente puede tener varias guardadas
  // a la vez, pero solo UNA está "activa" para los vendedores
  // (data.cargaActivoDia). `persistCargas` opera siempre sobre el día
  // que se le indique, partiendo del documento más reciente en Supabase.
  async function persistCargas(dia, calcularNuevoCargas) {
    if (!dia) return;
    await persistParcialFresco((fresca) => {
      const actual = fresca.cargasPorDia || {};
      const cargaExistente = actual[dia] || { dia, fechaReferencia: null, fechaSubida: null, bloqueado: false, items: [], enviosPorRuta: {} };
      return { cargasPorDia: { ...actual, [dia]: calcularNuevoCargas(cargaExistente) } };
    });
  }

  // Agrega una revisión de unidad al historial, partiendo siempre del
  // historial más reciente — indispensable aquí porque varios conductores
  // (rutas J201-J207 y MERCH07/28-30) pueden enviar su revisión casi al mismo
  // tiempo, y cada uno solo debe AGREGAR su registro, nunca reemplazar el
  // historial completo con una copia vieja.
  async function persistRevisionUnidad(nuevaRevision) {
    await persistParcialFresco((fresca) => ({
      revisionesUnidades: [...(fresca.revisionesUnidades || []), nuevaRevision],
    }));
  }

  // Cambios de configuración del módulo de Unidades (alta/edición/borrado de
  // unidades, asignación por ruta, puntos de seguridad) — uso exclusivo de
  // Gerente casi siempre, pero igual se parte del dato fresco por seguridad.
  async function persistConfigUnidades(calcularCambios) {
    await persistParcialFresco(calcularCambios);
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
  const pedidosDia = data?.pedidosDia || [];
  const otcSemanal = data?.otcSemanal || [];
  const mesaControl = data?.mesaControl || [];
  const mensajesDia = data?.mensajesDia || {};
  const diasNoLaborables = data?.diasNoLaborables || [];
  const periodo = data?.periodo || { inicio: firstOfMonthISO(), fin: lastOfMonthISO() };

  // Mismo criterio combinado que ya usa OtcVentasView.jsx: la lista fija de
  // constants.js + lo que el Gerente haya agregado en tiempo real desde el
  // panel "Catálogo" (data.otcSinVualaExtra). Antes stats.porVendedor solo
  // usaba la lista fija, así que un código agregado ahí no se reflejaba en
  // la columna "Sin Vuala" de la tabla POR RUTA · HOY.
  const codigosSinVuala = useMemo(
    () => new Set([...CODIGOS_OTC_SIN_VUALA, ...(data?.otcSinVualaExtra || []).map((e) => e.codigo)]),
    [data?.otcSinVualaExtra]
  );

  const stats = useMemo(() => {
    const restantes = diasRestantes(periodo.fin, diasNoLaborables);
    const diasLaborablesTotal = diasHabilesEntre(periodo.inicio, periodo.fin, diasNoLaborables);
    // "Días transcurridos" para la proyección se cuenta hasta la fecha del
    // ÚLTIMO dato que realmente se cargó (avanceDia/otcDia), no hasta "hoy"
    // en el calendario. Si hoy es viernes pero la venta de hoy aún no se ha
    // subido, contar "hoy" como día transcurrido inflaba de más el
    // denominador y sacaba un proyectado más bajo del real.
    const fechasRef = [...avanceDia.map((r) => r.fecha), ...otcDia.map((r) => r.fecha)];
    const fechaUltimoDato = fechasRef.length
      ? fechasRef.reduce((max, f) => (f > max ? f : max), fechasRef[0])
      : todayISO();
    const hoyCapado = fechaUltimoDato > periodo.fin ? periodo.fin : fechaUltimoDato;
    const diasTranscurridos = diasHabilesEntre(periodo.inicio, hoyCapado, diasNoLaborables);
    function proyectar(avance) {
      return diasTranscurridos > 0 ? (avance / diasTranscurridos) * diasLaborablesTotal : avance;
    }
    const fechaHoyRef = fechaUltimoDato;

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

      const marcasOpen = {};
      MARCAS_OPEN.forEach((m) => {
        const vendido = propias
          .filter((r) => MARCA_KEYS[r.marca.trim().toLowerCase()] === m.key)
          .reduce((s, r) => s + (Number(r.paquetes) || 0), 0);
        marcasOpen[m.key] = buildMarca(v.objetivos?.[m.key] || 0, vendido);
      });

      // "Marcas estratégicas" = suma de paquetes vendidos de las 4 marcas
      // núcleo (Ice Mix, Bloss Mix, Summ Mix, Faronet) del periodo. Antes
      // dependía de un campo "estrategica" que ningún importador llega a
      // activar nunca, así que siempre marcaba 0.
      const volumenEstrategicas = MARCAS_OPEN.reduce((s, m) => s + marcasOpen[m.key].vendido, 0);

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
        .filter((r) => codigosSinVuala.has((r.codigoArticulo || "").trim()))
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

      // Objetivos manuales (Escalera): Supervisor-1 / Gerente pueden fijar
      // un objetivo extra para 1 o varias rutas — de venta general (con o
      // sin códigos de artículo específicos), de OTC, o de visitas
      // efectivas. Aquí se calcula su avance REAL de hoy con los mismos
      // registros crudos (propiasAvanceDia/propiasOtcDia) que ya se usan
      // para el resto de "hoy", para que en la Escalera se vean como un
      // peldaño más, prioritario, con datos reales — nunca a mano.
      const objetivosManualesDef = (data?.escaleraObjetivosManuales || []).filter(
        (o) => o.activo !== false && (o.rutas === "todas" || (o.rutas || []).includes(v.name))
      );
      const objetivosManualesHoy = objetivosManualesDef.map((o) => {
        const codigos = (o.articulos || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
        let avance = 0;
        if (o.tipo === "otc") {
          avance = codigos.length > 0
            ? propiasOtcDia.filter((r) => codigos.includes(String(r.codigoArticulo || "").trim().toUpperCase())).reduce((s, r) => s + (Number(r.monto) || 0), 0)
            : otcHoy;
        } else if (o.tipo === "visitas") {
          avance = visitasEfectivasHoy;
        } else {
          avance = codigos.length > 0
            ? propiasAvanceDia.filter((r) => codigos.includes(String(r.articulo || "").trim().toUpperCase())).reduce((s, r) => s + (Number(r.paquetes) || 0), 0)
            : paquetesHoy;
        }
        return {
          id: o.id, nombre: o.nombre, tipo: o.tipo, objetivo: Number(o.objetivo) || 0, avance,
          unidad: o.tipo === "otc" ? "money" : "units", detalles: o.detalles || "", articulos: codigos,
        };
      });

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
        objetivosManuales: objetivosManualesHoy,
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
  }, [vendedores, ventas, avanceDia, otcDia, otcSemanal, diasNoLaborables, periodo, data?.escaleraObjetivosManuales, codigosSinVuala]);

  // Registra quién y cuándo se hizo la última carga de cada sección de
  // "Cargar datos" (Avance del día, OTC del día, etc.). Se REEMPLAZA cada
  // vez para esa sección — no guarda historial, solo el dato más reciente.
  async function registrarUltimaCarga(seccion, accion = "carga") {
    const quien =
      puesto === "gerente" ? "Gerente" :
      puesto === "supervisor" ? "Supervisor-1" :
      puesto === "supervisor2" ? "Supervisor-2" :
      (staffUsername || "Staff");
    await persistParcialFresco((fresca) => ({
      ultimaCarga: { ...(fresca.ultimaCarga || {}), [seccion]: { fecha: new Date().toISOString(), quien, accion } },
    }));
  }

  async function procesarFilasOtcSemanal(filas) {
    const registros = convertirFilasOtcDia(filas);
    if (registros.length === 0) {
      setStatus("No se encontraron filas válidas. Revisa el formato.");
      return;
    }
    await persistParcialFresco(() => ({ otcSemanal: registros }));
    await registrarUltimaCarga("otcSemanal");
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
    reader.onload = async (evt) => {
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

        await persistParcialFresco((fresca) => {
          let vendedoresFrescos = (fresca.vendedores || []).map((v) => {
            const match = byRuta[v.name.trim().toLowerCase()];
            if (!match) return v;
            delete byRuta[v.name.trim().toLowerCase()];
            return { ...v, objetivos: { ...blankObjetivos(), ...match } };
          });
          // Rutas nuevas que no existían aún
          Object.entries(byRuta).forEach(([key, match]) => {
            vendedoresFrescos.push({ id: "v" + Date.now() + Math.random(), name: key.toUpperCase(), objetivos: { ...blankObjetivos(), ...match } });
          });
          return { vendedores: vendedoresFrescos };
        });
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

  // Objetivo de clientes a visitar por ruta según el día de la semana. Se
  // sube como tabla RUTA x LUNES..SABADO (una fila por ruta), y reemplaza
  // por completo la anterior, igual que el resto de estas cargas exclusivas.
  const DIAS_SEMANA_VISITAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

  function convertirFilasObjetivoVisitas(rows) {
    const getVal = (row, ...names) => {
      const keys = Object.keys(row);
      for (const name of names) {
        const key = keys.find((k) => normalizarEncabezado(k) === normalizarEncabezado(name));
        if (key !== undefined) return row[key];
      }
      return "";
    };
    const objetivos = {};
    rows.forEach((row) => {
      const rutaRaw = String(getVal(row, "RUTA", "Ruta") || "").trim();
      if (!rutaRaw) return;
      const codigo = rutaRaw.split(" - ")[0].trim().toUpperCase();
      objetivos[codigo] = {
        lunes: Number(getVal(row, "LUNES") || 0) || 0,
        martes: Number(getVal(row, "MARTES") || 0) || 0,
        miercoles: Number(getVal(row, "MIERCOLES", "MIÉRCOLES") || 0) || 0,
        jueves: Number(getVal(row, "JUEVES") || 0) || 0,
        viernes: Number(getVal(row, "VIERNES") || 0) || 0,
        sabado: Number(getVal(row, "SABADO", "SÁBADO") || 0) || 0,
      };
    });
    return objetivos;
  }

  async function procesarFilasObjetivoVisitas(filas) {
    const objetivos = convertirFilasObjetivoVisitas(filas);
    if (Object.keys(objetivos).length === 0) {
      setObjetivoVisitasStatus("No se encontraron filas válidas. Revisa la columna RUTA.");
      return;
    }
    try {
      await persistParcialFresco(() => ({ objetivosVisitasDia: objetivos }));
      setObjetivoVisitasStatus(`Objetivo de visitas actualizado para ${Object.keys(objetivos).length} rutas.`);
    } catch (err) {
      console.error(err);
      setObjetivoVisitasStatus(`Error al guardar: ${err?.message || "intenta de nuevo"}.`);
    }
  }

  async function handleObjetivoVisitasFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const filas = await parsearArchivoComoFilas(file);
      await procesarFilasObjetivoVisitas(filas);
    } catch (err) {
      setObjetivoVisitasStatus("No se pudo leer el archivo. Verifica que tenga las columnas RUTA, LUNES, MARTES, MIERCOLES, JUEVES, VIERNES y SABADO.");
    }
  }

  function handleObjetivoVisitasTexto(texto) {
    try {
      const filas = parseTextoDelimitado(texto);
      if (filas.length === 0) {
        setObjetivoVisitasStatus("No se pudo interpretar el texto pegado. Verifica que incluya el encabezado y al menos una fila.");
        return;
      }
      procesarFilasObjetivoVisitas(filas);
    } catch (err) {
      setObjetivoVisitasStatus("No se pudo interpretar el texto pegado.");
    }
  }

  function downloadObjetivoVisitasTemplate() {
    const filas = (data.vendedores || []).map((v) => {
      const codigo = v.name.replace("RUTA ", "").trim().toUpperCase();
      const actual = data.objetivosVisitasDia?.[codigo] || {};
      return {
        RUTA: codigo,
        LUNES: actual.lunes || 0,
        MARTES: actual.martes || 0,
        MIERCOLES: actual.miercoles || 0,
        JUEVES: actual.jueves || 0,
        VIERNES: actual.viernes || 0,
        SABADO: actual.sabado || 0,
      };
    });
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Objetivo Visitas");
    XLSX.writeFile(wb, "plantilla_objetivo_visitas.xlsx");
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

  function handleCargasFile(e, diaObjetivo) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Por default, un archivo subido hoy es para el día hábil siguiente
    // (jueves sube -> es para viernes, etc.), pero el Gerente puede elegir
    // otro día de la semana en el selector antes de subir. La carga se
    // identifica por DÍA (lunes..sábado), no por fecha calendario — así se
    // reutiliza automáticamente semana tras semana.
    const diaFinal = diaObjetivo || siguienteDiaHabil().dia;
    const reader = new FileReader();
    reader.onload = async (evt) => {
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
        // Se guarda bajo su casilla de día de la semana, SIN activarla
        // todavía — queda pendiente hasta que el Gerente la active
        // manualmente cuando corresponda. Si ya había una carga guardada
        // para ese mismo día (de esta semana o de una anterior), se
        // reemplaza por completo — es justo el punto: la casilla de cada
        // día se recicla semana tras semana, partiendo siempre del
        // documento más reciente en Supabase.
        await persistParcialFresco((fresca) => ({
          cargasPorDia: {
            ...(fresca.cargasPorDia || {}),
            [diaFinal]: { dia: diaFinal, fechaReferencia: sumarDiasISO(fechaHoyISO(), 1), fechaSubida: fechaHoyISO(), bloqueado: false, items: resultado.items, enviosPorRuta: {} },
          },
        }));
        setCargasStatus(`Carga guardada para el ${diaFinal}: ${resultado.items.length} artículos, hoja "${hojaUsada}". Actívala cuando corresponda.`);
      } catch (err) {
        console.error(err);
        setCargasStatus("No se pudo leer el archivo. Verifica el formato.");
      }
    };
    reader.readAsBinaryString(file);
  }

  // Hace que la carga guardada en `dia` sea la que ven y editan los
  // vendedores. Es una acción explícita del Gerente — no pasa sola aunque
  // llegue el día, para poder manejar excepciones (festivos, cambios de
  // ruta, etc.) sin que el sistema se adelante solo. Activar SIEMPRE deja
  // la carga lista para modificarse: se desbloquea (por si venía
  // bloqueada de la semana pasada) y se limpian los envíos por ruta, para
  // que cada ruta pueda proponer sus cantidades de esta semana desde cero.
  async function activarCarga(dia) {
    await persistParcialFresco((fresca) => {
      const actual = fresca.cargasPorDia || {};
      const cargaExistente = actual[dia];
      if (!cargaExistente) return { cargaActivoDia: dia };
      return {
        cargaActivoDia: dia,
        cargasPorDia: { ...actual, [dia]: { ...cargaExistente, bloqueado: false, enviosPorRuta: {} } },
      };
    });
  }

  // Quita por completo la carga guardada de ese día (no afecta a las
  // demás casillas). Si era la que estaba activa, deja de haber una
  // carga activa.
  async function eliminarCarga(dia) {
    await persistParcialFresco((fresca) => {
      const actual = { ...(fresca.cargasPorDia || {}) };
      delete actual[dia];
      const cambios = { cargasPorDia: actual };
      if (fresca.cargaActivoDia === dia) cambios.cargaActivoDia = null;
      return cambios;
    });
  }

  async function descargarCargasModificadas() {
    // Antes de generar el archivo, trae la versión más reciente de
    // Supabase — así, si un vendedor mandó su propuesta hace unos segundos
    // y esta pantalla todavía no se había actualizado sola, el archivo
    // igual sale con esa información (en vez de descargar una versión
    // vieja que se le adelantó a la última actualización).
    setCargasStatus("Buscando la información más reciente antes de generar el archivo...");
    let fresca;
    try {
      fresca = await obtenerDataFresca();
    } catch (err) {
      console.error("No se pudo traer la carga más reciente:", err);
      // Antes esto seguía adelante solo con una alerta informativa. Ahora
      // pide confirmación explícita: generar el archivo con datos que
      // podrían estar incompletos (y luego BLOQUEAR la carga con base en
      // ellos) es una decisión que Gerente debe tomar a propósito, no algo
      // que pase solo por mala señal en ese momento.
      const continuar = window.confirm(
        "No se pudo confirmar que tengas la información más reciente (revisa tu conexión).\n\n" +
        "Si continúas, el archivo se generará con lo que ya tienes en pantalla — podría faltarle la propuesta de algún vendedor si la mandó hace poco y esta pantalla no alcanzó a actualizarse.\n\n" +
        "¿Generar el archivo de todos modos?"
      );
      if (!continuar) {
        setCargasStatus("Descarga cancelada — vuelve a intentarlo cuando tengas señal, para no arriesgarte a dejar fuera una propuesta reciente.");
        return;
      }
      fresca = data;
    }
    const diaActivo = fresca.cargaActivoDia;
    const cargas = diaActivo ? fresca.cargasPorDia?.[diaActivo] : null;
    if (!cargas?.items?.length) {
      setCargasStatus("No hay una carga activa todavía.");
      alert("No hay una carga activa todavía. Actívala primero desde la lista de cargas guardadas.");
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
    XLSX.writeFile(wb, `carga_modificada_${cargas.dia || fechaHoyISO()}.xlsx`);

    // El candado real es este bloqueo, no la descarga en sí (generar el
    // .xlsx es 100% local, no depende de señal). Antes se disparaba este
    // guardado SIN esperarlo y sin capturar si fallaba, así que ya se le
    // decía a Gerente "se bloqueó la edición" aunque el guardado siguiera
    // reintentando (o terminara fallando) en segundo plano por mala señal.
    // `persistCargas` (vía persistParcialFresco) ya reintenta solo hasta 6
    // veces y espera a que vuelva la conexión si hace falta — aquí solo se
    // espera su resultado real antes de avisarle a Gerente que ya quedó.
    setCargasStatus(`Archivo descargado (${filas.length} filas). Confirmando el bloqueo de la carga con el servidor...`);
    try {
      await persistCargas(diaActivo, (cargasFrescas) => ({ ...cargasFrescas, bloqueado: true }));
      setBloqueoPendiente(false);
      setCargasStatus(`✅ Archivo descargado (${filas.length} filas) y carga bloqueada correctamente — los vendedores ya no pueden modificarla.`);
    } catch (err) {
      console.error("No se pudo confirmar el bloqueo de la carga:", err);
      setBloqueoPendiente(true);
      setCargasStatus(`⚠️ El archivo SÍ se descargó, pero el bloqueo NO se pudo confirmar por falta de señal. Los vendedores TODAVÍA pueden modificar esta carga — usa "Reintentar bloqueo" en cuanto tengas conexión.`);
      alert('El archivo se descargó, pero el bloqueo no se pudo confirmar por falta de señal. Los vendedores todavía pueden modificar esta carga. Usa "Reintentar bloqueo" en cuanto tengas conexión.');
    }
  }

  // Reintenta SOLO el bloqueo (sin volver a generar/descargar el archivo)
  // para cuando `descargarCargasModificadas` ya descargó el archivo pero no
  // pudo confirmar el bloqueo por falta de señal.
  async function reintentarBloqueoCarga() {
    const dia = data.cargaActivoDia;
    if (!dia) return;
    setCargasStatus("Reintentando confirmar el bloqueo de la carga...");
    try {
      await persistCargas(dia, (cargasFrescas) => ({ ...cargasFrescas, bloqueado: true }));
      setBloqueoPendiente(false);
      setCargasStatus("✅ Carga bloqueada correctamente — los vendedores ya no pueden modificarla.");
    } catch (err) {
      console.error("Reintento de bloqueo de carga falló:", err);
      setCargasStatus("⚠️ Sigue sin poder confirmarse el bloqueo por falta de señal. Los vendedores todavía pueden modificar esta carga — vuelve a intentar cuando tengas mejor conexión.");
    }
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

      registros.push({ fecha, vendedor, marca, articulo, cliente, monto, paquetes });
    });
    return registros;
  }

  // Convierte filas del reporte de OTC (Vendedor, ..., Fecha Venta, TOTAL $) a registros
  // exclusivos para la pestaña DÍA. El avance de OTC es la suma de TOTAL $ por ruta,
  // sin importar cuántos artículos distintos aparezcan.
  // Quita etiquetas HTML de un valor de celda (la columna "Status" del
  // reporte de pedidos trae <span style="color:...">Emitido</span>, etc.).
  function quitarHtml(texto) {
    return String(texto || "").replace(/<[^>]*>/g, "").trim();
  }

  // Normaliza un nombre de encabezado para comparar: el reporte de pedidos
  // trae encabezados de varias líneas con <br> literal en medio (ej.
  // "Total<br>Pedido"), así que se quita el <br> y se colapsan espacios
  // antes de comparar contra el nombre de columna esperado.
  function normalizarEncabezado(s) {
    return String(s || "").replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
  }

  // Convierte el reporte de pedidos del día (Fecha, Vendedor, Cliente,
  // Status, Motivo Rechazo, Total Pedido/Entregado y sus paquetes) a
  // registros listos para Mesa de Control.
  function convertirFilasPedidosDia(rows) {
    const getVal = (row, ...names) => {
      const keys = Object.keys(row);
      for (const name of names) {
        const key = keys.find((k) => normalizarEncabezado(k) === normalizarEncabezado(name));
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

      const fechaRaw = String(getVal(row, "Fecha") || "").trim();
      const [dd, mm, yyyy] = fechaRaw.split("/");
      const fecha = dd && mm && yyyy ? `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}` : "";

      const clienteCodigo = quitarHtml(getVal(row, "Cliente"));
      const cliente = quitarHtml(getVal(row, "Nombre")) || clienteCodigo;
      const status = quitarHtml(getVal(row, "Status"));
      const motivoRechazo = quitarHtml(getVal(row, "Motivo Rechazo"));
      const totalPedido = Number(getVal(row, "Total Pedido") || 0) || 0;
      const totalPaquetesPedido = Number(getVal(row, "Total Paquetes pedido") || 0) || 0;
      const totalEntregado = Number(getVal(row, "Total Entregado") || 0) || 0;
      const totalPaquetesEntregado = Number(getVal(row, "Total Paquetes entregado") || 0) || 0;

      registros.push({ fecha, vendedor, cliente, clienteCodigo, status, motivoRechazo, totalPedido, totalPaquetesPedido, totalEntregado, totalPaquetesEntregado });
    });
    return registros;
  }

  async function procesarFilasPedidosDia(filas) {
    const registros = convertirFilasPedidosDia(filas);
    if (registros.length === 0) {
      setPedidosDiaStatus("No se encontraron filas válidas. Revisa el formato.");
      return;
    }
    // Reemplaza por completo el reporte anterior, partiendo siempre del
    // dato más reciente de Supabase (no del que esta pestaña tenga en
    // memoria), para que otra carga guardada casi al mismo tiempo no se
    // pierda ni se sobreescriba con una versión vieja.
    try {
      await persistParcialFresco(() => ({ pedidosDia: registros }));
      await registrarUltimaCarga("pedidosDia");
      const fechas = [...new Set(registros.map((r) => r.fecha).filter(Boolean))];
      setPedidosDiaStatus(`Pedidos cargados: ${registros.length} registros para ${fechas.join(", ") || "la fecha del reporte"}.`);
    } catch (err) {
      console.error(err);
      setPedidosDiaStatus(`Error al guardar: ${err?.message || "intenta de nuevo"}.`);
    }
  }

  async function handlePedidosDiaFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const filas = await parsearArchivoComoFilas(file);
      await procesarFilasPedidosDia(filas);
    } catch (err) {
      setPedidosDiaStatus("No se pudo leer el archivo. Verifica que tenga las columnas Fecha, Vendedor, Nombre, Status, Motivo Rechazo, Total Pedido y Total Entregado (con sus paquetes).");
    }
  }

  function handlePedidosDiaTexto(texto) {
    try {
      const filas = parseTextoDelimitado(texto);
      if (filas.length === 0) {
        setPedidosDiaStatus("No se pudo interpretar el texto pegado. Verifica que incluya el encabezado y al menos una fila.");
        return;
      }
      procesarFilasPedidosDia(filas);
    } catch (err) {
      setPedidosDiaStatus("No se pudo interpretar el texto pegado.");
    }
  }

  function convertirFilasOtcDia(rows) {
    // Normaliza encabezados: quita HTML (<BR>, <br/>, etc.), colapsa espacios
    // y pasa a minúsculas. Así "Unidades<BR>Vendidas", "Unidades<br>Vendidas"
    // y "Unidades Vendidas" se comparan igual.
    const normHeader = (s) =>
      String(s || "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    const getVal = (row, ...names) => {
      const keys = Object.keys(row);
      for (const name of names) {
        const target = normHeader(name);
        const key = keys.find((k) => normHeader(k) === target);
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

      // Dinero del rally / OTC: siempre TOTAL $
      const monto = Number(getVal(row, "TOTAL $", "Total $", "Total") || 0) || 0;
      const codigoArticulo = String(getVal(row, "Codigo", "Código") || "").trim();
      const articulo = String(getVal(row, "Articulo", "Artículo") || "").trim();

      // Piezas del rally: SIEMPRE "Unidades<BR>Vendidas" (cantidad real).
      // NUNCA usar la columna "Unidades" sola — esa trae 1 (contador de línea).
      const unidadesVendidas = Number(
        getVal(
          row,
          "Unidades<BR>Vendidas",
          "Unidades<br>Vendidas",
          "Unidades Vendidas",
          "UnidadesVendidas",
          "Unidades vendidas"
        ) || 0
      ) || 0;

      registros.push({ fecha, vendedor, monto, codigoArticulo, articulo, unidadesVendidas });
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
      const clienteCodigo = String(getVal(row, "codigo") || "").trim();
      const inicio = String(getVal(row, "inicio") || "").trim();
      const final = String(getVal(row, "final") || "").trim();
      const tiempoEstancia = Number(getVal(row, "Tiempo_estancia", "tiempo_estancia") || 0) || 0;
      const tipoInicio = String(getVal(row, "tipoinicio") || "").trim().toUpperCase();
      const tipoFin = String(getVal(row, "tipofin") || "").trim().toUpperCase();
      const volumen = Number(getVal(row, "volumen") || 0) || 0;
      const descuento = Number(getVal(row, "descuento") || 0) || 0;

      registros.push({ vendedor, fecha, cliente, clienteCodigo, inicio, final, tiempoEstancia, tipoInicio, tipoFin, volumen, descuento });
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

  // Extrae de las filas CRUDAS del archivo (antes de convertirFilasAvanceDia)
  // el código de cliente + el ARTÍCULO exacto (código FA) + su línea de
  // venta, para poder guardar cada producto por separado (no agrupado por
  // "marca" genérica) y convertir paquetes -> cajetillas con la tabla de
  // productosFacturables.js.
  function extraerLineasFacturables(filasCrudas) {
    const getVal = (row, ...names) => {
      const keys = Object.keys(row);
      for (const name of names) {
        const key = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
        if (key !== undefined) return row[key];
      }
      return "";
    };
    const lineas = [];
    (filasCrudas || []).forEach((row) => {
      const vendedorRaw = String(getVal(row, "Vendedor") || "").trim();
      const codigoRuta = vendedorRaw.split(" - ")[0].trim();
      if (!codigoRuta) return;
      const vendedor = `RUTA ${codigoRuta}`;

      const fechaRaw = String(getVal(row, "Fecha") || "").trim();
      const datePart = fechaRaw.split(" ")[0];
      const [dd, mm, yyyy] = datePart.split("/");
      if (!dd || !mm || !yyyy) return;
      const fecha = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;

      const articulo = String(getVal(row, "Articulo") || getVal(row, "Artículo") || "").trim().toUpperCase();
      if (!articulo) return;
      const paquetesReportados = Number(getVal(row, "Paquetes") || 0) || 0;
      // El reporte trae Contado $ y Credito $ por separado (no un solo "Total $").
      const contado = Number(getVal(row, "Contado $", "Contado") || 0) || 0;
      const credito = Number(getVal(row, "Credito $", "Crédito $", "Credito") || 0) || 0;
      const monto = contado + credito;
      // En este reporte "Cliente" YA es el código (confirmado) — no hay columna de nombre.
      const codigoCliente = String(getVal(row, "Cliente", "Codigo Cliente", "Código Cliente", "Cliente Codigo") || "").trim();
      if (!codigoCliente) return;

      // Convierte paquetes -> cajetillas usando las unidades por paquete
      // específicas de ESTE producto (no todos traen 10; algunos traen 8).
      const cajetillas = paquetesACajetillas(articulo, paquetesReportados);
      const productoNombre = infoProducto(articulo).nombre;

      lineas.push({ vendedor, fecha, articulo, productoNombre, paquetesReportados, cajetillas, contado, credito, monto, codigoCliente });
    });
    return lineas;
  }

  // Cruza esas líneas contra clientes_facturables (por RUTA + código
  // normalizado) y guarda —sin duplicar— cada PRODUCTO como su propio
  // renglón en ventas_facturas (no agrupado por marca). De ahí las lee la
  // pantalla de ADMIN, que las vuelve a juntar por cliente+día en una sola
  // tarjeta.
  // Junta (suma monto/paquetes/cajetillas/contado/credito) las líneas que
  // se refieran exactamente al mismo renglón de factura (misma ruta +
  // código de cliente + fecha + artículo). Esto es INDISPENSABLE antes de
  // mandarlas a la RPC: si el mismo reporte trae dos filas para el mismo
  // cliente+producto+día (pasa seguido en los reportes exportados), y se
  // manda a Postgres tal cual, la instrucción completa truena por completo
  // ("ON CONFLICT DO UPDATE command cannot affect row a second time") y NO
  // SE GUARDA NINGUNA fila de ese lote — ni siquiera las de otros clientes
  // que sí venían bien. Por eso antes "no jalaban" ciertas facturas: bastaba
  // con que UN cliente del archivo tuviera una línea repetida para que se
  // cayera el lote entero.
  function combinarLineasDuplicadas(filas) {
    const mapa = new Map();
    filas.forEach((fila) => {
      const clave = `${fila.ruta}|${normalizarCodigo(fila.codigo_cliente)}|${fila.fecha}|${fila.articulo}`;
      if (!mapa.has(clave)) {
        mapa.set(clave, { ...fila });
      } else {
        const acumulada = mapa.get(clave);
        acumulada.paquetes += fila.paquetes;
        acumulada.cajetillas += fila.cajetillas;
        acumulada.contado_monto += fila.contado_monto;
        acumulada.credito_monto += fila.credito_monto;
        acumulada.monto += fila.monto;
      }
    });
    return [...mapa.values()];
  }

  // Un producto que por sí solo (aunque no se repita) ya vale más de
  // $2,000 (contando IVA + distribución) no se puede meter completo en un
  // solo ticket. Como cada fila de ventas_facturas ahora vive completa en
  // UN SOLO folio/parte (para que la numeración 1/2, 2/2... quede fija y
  // no se mueva), la única forma de partirlo es ANTES de guardarlo: se
  // parte en varias filas más chicas (mismo artículo, "pieza" 1, 2, 3...),
  // cada una ya dentro del límite, para que cada una pueda ir a su propio
  // ticket. Esto es distinto de "combinarLineasDuplicadas" (que junta) —
  // aquí se hace lo contrario cuando hace falta.
  const LIMITE_TICKET_PARTIR = 2000;
  const COSTO_DISTRIBUCION_PARTIR = 2.78;
  function partirLineasQueExcedenLimite(filas, limite) {
    const resultado = [];
    filas.forEach((fila) => {
      const cajetillas = Number(fila.cajetillas) || 0;
      const valorReal = Number(fila.monto || 0) + cajetillas * COSTO_DISTRIBUCION_PARTIR;
      if (valorReal <= limite || cajetillas <= 0) {
        resultado.push({ ...fila, pieza: 1 });
        return;
      }
      const precioPorCajetillaReal = valorReal / cajetillas;
      const cajetillasPorPieza = Math.max(1, Math.floor(limite / precioPorCajetillaReal));
      let restantes = Math.round(cajetillas * 100) / 100;
      let pieza = 0;
      while (restantes > 0) {
        pieza++;
        const cajetillasPieza = Math.min(cajetillasPorPieza, restantes);
        const proporcion = cajetillasPieza / cajetillas;
        resultado.push({
          ...fila,
          cajetillas: Math.round(cajetillasPieza * 100) / 100,
          monto: Math.round(fila.monto * proporcion * 100) / 100,
          contado_monto: Math.round((fila.contado_monto || 0) * proporcion * 100) / 100,
          credito_monto: Math.round((fila.credito_monto || 0) * proporcion * 100) / 100,
          paquetes: Math.round((fila.paquetes || 0) * proporcion * 100) / 100,
          pieza,
        });
        restantes = Math.round((restantes - cajetillasPieza) * 100) / 100;
      }
    });
    return resultado;
  }

  // ---- Folios de ticket persistentes ----
  // Se corre después de cada sincronización de facturas. Busca filas de
  // ventas_facturas que TODAVÍA no tengan folio asignado (ticket_folio
  // IS NULL) y les asigna uno — reutilizando un ticket ya existente de ese
  // mismo cliente/día si todavía tiene espacio y NO está facturado, o
  // abriendo uno nuevo si no cabe. Las filas que YA tienen folio nunca se
  // tocan (por eso la secuencia 1/2, 2/2... ya no se mueve una vez asignada).
  const COSTO_DISTRIBUCION_FOLIO = 2.78;
  const LIMITE_TICKET_FOLIO = 2000;

  function valorRealDeFila(f) {
    return Number(f.monto || 0) + Number(f.cajetillas || 0) * COSTO_DISTRIBUCION_FOLIO;
  }

  // Empaqueta por FILA completa (first-fit decreasing). Se usa cuando no
  // queremos partir cantidades (filas ya existentes con folio, o casos
  // simples).
  function empaquetarFilasNuevas(filas, limite) {
    const ordenadas = [...filas].sort((a, b) => valorRealDeFila(b) - valorRealDeFila(a));
    const bins = [];
    ordenadas.forEach((f) => {
      const valor = valorRealDeFila(f);
      let destino = bins.find((b) => b.suma + valor <= limite);
      if (!destino) { destino = { filas: [], suma: 0 }; bins.push(destino); }
      destino.filas.push(f);
      destino.suma += valor;
    });
    return bins;
  }

  // Empaqueta PERMITIENDO partir cajetillas de un mismo producto entre
  // varios tickets. Así se alcanza el mínimo número de tickets posible
  // (ceil(total / 2000)) mezclando productos distintos.
  //
  // Devuelve: array de bins. Cada bin tiene:
  //   { asignaciones: [ { fila, cajetillas, monto, paquetes, contado_monto, credito_monto } ], suma }
  // Una misma fila original puede aparecer en varios bins (partida).
  function empaquetarPermitiendoParticion(filas, limite) {
    // Trabajamos con cantidades restantes de cada fila.
    const items = filas
      .map((f) => {
        const caj = Number(f.cajetillas) || 0;
        const monto = Number(f.monto) || 0;
        if (caj <= 0) return null;
        return {
          fila: f,
          cajRestantes: caj,
          montoOriginal: monto,
          paquetesOriginal: Number(f.paquetes) || 0,
          contadoOriginal: Number(f.contado_monto) || 0,
          creditoOriginal: Number(f.credito_monto) || 0,
          valorPorCaj: (monto + caj * COSTO_DISTRIBUCION_FOLIO) / caj,
        };
      })
      .filter(Boolean);

    // Ordenar por valor por cajetilla descendente ayuda a llenar mejor.
    items.sort((a, b) => b.valorPorCaj - a.valorPorCaj);

    const bins = [];
    let current = { asignaciones: [], suma: 0 };

    for (const item of items) {
      while (item.cajRestantes > 0.0001) {
        const espacio = limite - current.suma;
        // Si el espacio que queda es menor que el valor de 1 cajetilla, abrimos otro ticket.
        if (espacio < item.valorPorCaj - 0.01) {
          if (current.asignaciones.length > 0) bins.push(current);
          current = { asignaciones: [], suma: 0 };
          continue;
        }
        const maxCaj = Math.floor((espacio + 0.01) / item.valorPorCaj);
        if (maxCaj <= 0) {
          if (current.asignaciones.length > 0) bins.push(current);
          current = { asignaciones: [], suma: 0 };
          continue;
        }
        const tomar = Math.min(item.cajRestantes, maxCaj);
        const prop = tomar / (Number(item.fila.cajetillas) || 1);
        const montoTomado = Math.round(item.montoOriginal * prop * 100) / 100;
        const paquetesTomado = Math.round(item.paquetesOriginal * prop * 100) / 100;
        const contadoTomado = Math.round(item.contadoOriginal * prop * 100) / 100;
        const creditoTomado = Math.round(item.creditoOriginal * prop * 100) / 100;

        current.asignaciones.push({
          fila: item.fila,
          cajetillas: Math.round(tomar * 100) / 100,
          monto: montoTomado,
          paquetes: paquetesTomado,
          contado_monto: contadoTomado,
          credito_monto: creditoTomado,
        });
        current.suma += tomar * item.valorPorCaj;
        item.cajRestantes = Math.round((item.cajRestantes - tomar) * 100) / 100;
      }
    }
    if (current.asignaciones.length > 0) bins.push(current);
    return bins;
  }

  async function asignarFoliosTickets() {
    try {
      // Pedimos más campos porque al partir una fila necesitamos copiarlos a las piezas nuevas.
      const { data: filas, error: err } = await supabase
        .from("ventas_facturas")
        .select("id, ruta, codigo_cliente, cliente, fecha, articulo, producto_nombre, paquetes, cajetillas, contado_monto, credito_monto, monto, forma_pago, estado, prioridad, ticket_folio, ticket_parte, ticket_de, creado_en")
        .order("creado_en", { ascending: true });
      if (err) throw err;
      if (!filas || filas.length === 0) return;

      const claveGrupo = (f) => `${f.ruta}|${normalizarCodigo(f.codigo_cliente)}|${f.fecha}|${f.articulo === "OTC" ? "OTC" : "PROD"}`;

      const grupos = new Map();
      filas.forEach((f) => {
        const k = claveGrupo(f);
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(f);
      });

      const actualizaciones = []; // { id, ticket_folio, ticket_parte, ticket_de }
      const inserciones = [];     // filas nuevas que nacen de partir una existente

      for (const filasGrupo of grupos.values()) {
        let sinFolio = filasGrupo.filter((f) => f.ticket_folio == null);
        let conFolio = filasGrupo.filter((f) => f.ticket_folio != null);
        const esOtc = filasGrupo[0].articulo === "OTC";

        // ---- Auto-corrección: ticket que ya tenía folio pero "creció de
        // más" ----
        // "Avance del día" se sube varias veces por día y usa upsert: si un
        // cliente ya tenía folio asignado en una sola parte (no hacía falta
        // dividir en ese momento) y una carga posterior hace crecer esas
        // MISMAS filas (más cajetillas/monto), el total puede rebasar los
        // $2,000 sin que nada dispare la división de nuevo — porque estas
        // filas ya tienen folio y por diseño nunca se tocan más abajo.
        // Aquí se detecta ese caso y se les quita el folio SOLO a las filas
        // en EFECTIVO que todavía no estén facturadas, para que el bloque de
        // abajo las vuelva a repartir correctamente en esta misma pasada.
        // Las filas ya facturadas nunca se liberan (se protegen aparte).
        if (!esOtc && conFolio.length > 0) {
          const noFacturadas = conFolio.filter(
            (f) => f.estado !== "FACTURADO" && (f.forma_pago || "EFECTIVO") === "EFECTIVO"
          );
          if (noFacturadas.length > 0) {
            const valorNoFacturadas = noFacturadas.reduce((s, f) => s + valorRealDeFila(f), 0);
            const partesUsadas = new Set(noFacturadas.map((f) => f.ticket_parte || 1)).size;
            const minimoPartesNecesarias = Math.max(1, Math.ceil(valorNoFacturadas / LIMITE_TICKET_FOLIO - 1e-9));
            if (minimoPartesNecesarias > partesUsadas) {
              const idsALiberar = new Set(noFacturadas.map((f) => f.id));
              sinFolio = [
                ...sinFolio,
                ...noFacturadas.map((f) => ({ ...f, ticket_folio: null, ticket_parte: null, ticket_de: null })),
              ];
              conFolio = conFolio.filter((f) => !idsALiberar.has(f.id));
            }
          }
        }

        if (sinFolio.length === 0) continue; // ya está todo asignado, no se toca

        const esEfectivo = (filasGrupo[0].forma_pago || "EFECTIVO") === "EFECTIVO";
        const necesitaDividir = !esOtc && esEfectivo;

        if (!necesitaDividir || conFolio.length === 0) {
          // Primera asignación (o no necesita dividir).
          if (necesitaDividir) {
            const { data: folioRow } = await supabase.rpc("nextval_folio_ticket");
            const folio = folioRow;

            // 1) Intentamos primero empaquetar filas completas (más simple).
            let binsEnteros = empaquetarFilasNuevas(sinFolio, LIMITE_TICKET_FOLIO);
            const totalValor = sinFolio.reduce((s, f) => s + valorRealDeFila(f), 0);
            const minimoTeorico = Math.max(1, Math.ceil(totalValor / LIMITE_TICKET_FOLIO - 1e-9));

            // 2) Si con filas completas salen MÁS tickets de los necesarios,
            //    re-empaquetamos permitiendo partir cajetillas.
            if (binsEnteros.length > minimoTeorico) {
              const binsPartidos = empaquetarPermitiendoParticion(sinFolio, LIMITE_TICKET_FOLIO);
              const totalPartes = binsPartidos.length;

              // Agrupamos las asignaciones por id de fila original para saber
              // qué filas hay que partir.
              const porId = new Map(); // id -> [ { parte, cajetillas, monto, ... } ]
              binsPartidos.forEach((bin, idx) => {
                const parte = idx + 1;
                bin.asignaciones.forEach((asig) => {
                  const id = asig.fila.id;
                  if (!porId.has(id)) porId.set(id, []);
                  porId.get(id).push({ parte, ...asig });
                });
              });

              for (const [id, piezas] of porId) {
                // Ordenamos las piezas por número de parte.
                piezas.sort((a, b) => a.parte - b.parte);
                const original = piezas[0].fila;

                // La primera pieza se queda en la fila original (UPDATE de cantidades).
                const primera = piezas[0];
                actualizaciones.push({
                  id,
                  ticket_folio: folio,
                  ticket_parte: primera.parte,
                  ticket_de: totalPartes,
                  // también actualizamos cantidades de la fila original
                  cajetillas: primera.cajetillas,
                  monto: primera.monto,
                  paquetes: primera.paquetes,
                  contado_monto: primera.contado_monto,
                  credito_monto: primera.credito_monto,
                });

                // Las piezas siguientes se insertan como filas nuevas.
                for (let p = 1; p < piezas.length; p++) {
                  const pieza = piezas[p];
                  inserciones.push({
                    ruta: original.ruta,
                    codigo_cliente: original.codigo_cliente,
                    cliente: original.cliente,
                    fecha: original.fecha,
                    articulo: original.articulo,
                    producto_nombre: original.producto_nombre,
                    paquetes: pieza.paquetes,
                    cajetillas: pieza.cajetillas,
                    contado_monto: pieza.contado_monto,
                    credito_monto: pieza.credito_monto,
                    monto: pieza.monto,
                    forma_pago: original.forma_pago || "EFECTIVO",
                    estado: original.estado || "ESPERA",
                    prioridad: original.prioridad || false,
                    ticket_folio: folio,
                    ticket_parte: pieza.parte,
                    ticket_de: totalPartes,
                  });
                }
              }
            } else {
              // Empaquetado con filas completas fue suficiente.
              binsEnteros.forEach((bin, i) => {
                bin.filas.forEach((f) => actualizaciones.push({
                  id: f.id,
                  ticket_folio: folio,
                  ticket_parte: i + 1,
                  ticket_de: binsEnteros.length,
                }));
              });
            }
          } else {
            const { data: folioRow } = await supabase.rpc("nextval_folio_ticket");
            sinFolio.forEach((f) => actualizaciones.push({ id: f.id, ticket_folio: folioRow, ticket_parte: 1, ticket_de: 1 }));
          }
          continue;
        }

        // Ya había folio(s) de este cliente/día: intenta meter cada fila
        // nueva en la parte más reciente que NO esté facturada y todavía
        // tenga espacio; si no cabe en ninguna, abre parte(s) nueva(s).
        // (Aquí seguimos sin partir filas ya existentes para no mover lo que
        // ya se asignó).
        const folioExistente = conFolio[0].ticket_folio;
        const partesActuales = new Map(); // parte -> { filas, suma, facturada }
        conFolio.forEach((f) => {
          const p = f.ticket_parte || 1;
          if (!partesActuales.has(p)) partesActuales.set(p, { filas: [], suma: 0, facturada: false });
          const entry = partesActuales.get(p);
          entry.filas.push(f);
          entry.suma += valorRealDeFila(f);
          if (f.estado === "FACTURADO") entry.facturada = true;
        });

        let maxParte = Math.max(...[...partesActuales.keys()]);
        const restantesPorAsignar = [];
        for (const f of sinFolio) {
          const valor = valorRealDeFila(f);
          let colocada = false;
          for (const [numParte, entry] of partesActuales) {
            if (!entry.facturada && entry.suma + valor <= LIMITE_TICKET_FOLIO) {
              actualizaciones.push({ id: f.id, ticket_folio: folioExistente, ticket_parte: numParte, ticket_de: null });
              entry.suma += valor;
              colocada = true;
              break;
            }
          }
          if (!colocada) restantesPorAsignar.push(f);
        }
        if (restantesPorAsignar.length > 0) {
          // Para lo que no cupo, intentamos empaquetar permitiendo partición.
          const totalValorRest = restantesPorAsignar.reduce((s, f) => s + valorRealDeFila(f), 0);
          const minimoTeoricoRest = Math.max(1, Math.ceil(totalValorRest / LIMITE_TICKET_FOLIO - 1e-9));
          let binsRest = empaquetarFilasNuevas(restantesPorAsignar, LIMITE_TICKET_FOLIO);

          if (binsRest.length > minimoTeoricoRest) {
            // Partimos las que sobran.
            const binsPartidos = empaquetarPermitiendoParticion(restantesPorAsignar, LIMITE_TICKET_FOLIO);
            const porId = new Map();
            binsPartidos.forEach((bin, idx) => {
              const parte = maxParte + idx + 1;
              bin.asignaciones.forEach((asig) => {
                const id = asig.fila.id;
                if (!porId.has(id)) porId.set(id, []);
                porId.get(id).push({ parte, ...asig });
              });
            });
            maxParte += binsPartidos.length;

            for (const [id, piezas] of porId) {
              piezas.sort((a, b) => a.parte - b.parte);
              const original = piezas[0].fila;
              const primera = piezas[0];
              actualizaciones.push({
                id,
                ticket_folio: folioExistente,
                ticket_parte: primera.parte,
                ticket_de: null, // se corrige al final
                cajetillas: primera.cajetillas,
                monto: primera.monto,
                paquetes: primera.paquetes,
                contado_monto: primera.contado_monto,
                credito_monto: primera.credito_monto,
              });
              for (let p = 1; p < piezas.length; p++) {
                const pieza = piezas[p];
                inserciones.push({
                  ruta: original.ruta,
                  codigo_cliente: original.codigo_cliente,
                  cliente: original.cliente,
                  fecha: original.fecha,
                  articulo: original.articulo,
                  producto_nombre: original.producto_nombre,
                  paquetes: pieza.paquetes,
                  cajetillas: pieza.cajetillas,
                  contado_monto: pieza.contado_monto,
                  credito_monto: pieza.credito_monto,
                  monto: pieza.monto,
                  forma_pago: original.forma_pago || "EFECTIVO",
                  estado: original.estado || "ESPERA",
                  prioridad: original.prioridad || false,
                  ticket_folio: folioExistente,
                  ticket_parte: pieza.parte,
                  ticket_de: null,
                });
              }
            }
          } else {
            binsRest.forEach((bin) => {
              maxParte += 1;
              bin.filas.forEach((f) => actualizaciones.push({ id: f.id, ticket_folio: folioExistente, ticket_parte: maxParte, ticket_de: null }));
            });
          }
        }
        // Recalcula ticket_de (total de partes) para TODO el folio.
        const totalPartesFinal = maxParte;
        conFolio.forEach((f) => {
          if (f.ticket_de !== totalPartesFinal) {
            actualizaciones.push({ id: f.id, ticket_folio: folioExistente, ticket_parte: f.ticket_parte, ticket_de: totalPartesFinal });
          }
        });
        actualizaciones.forEach((a) => {
          if (a.ticket_folio === folioExistente && a.ticket_de == null) a.ticket_de = totalPartesFinal;
        });
        inserciones.forEach((ins) => {
          if (ins.ticket_folio === folioExistente && ins.ticket_de == null) ins.ticket_de = totalPartesFinal;
        });
      }

      // 1) Actualizar filas existentes (pueden incluir cambio de cantidades si se partieron).
      for (const a of actualizaciones) {
        const payload = {
          ticket_folio: a.ticket_folio,
          ticket_parte: a.ticket_parte,
          ticket_de: a.ticket_de,
        };
        if (a.cajetillas != null) {
          payload.cajetillas = a.cajetillas;
          payload.monto = a.monto;
          payload.paquetes = a.paquetes;
          payload.contado_monto = a.contado_monto;
          payload.credito_monto = a.credito_monto;
        }
        await supabase.from("ventas_facturas").update(payload).eq("id", a.id);
      }

      // 2) Insertar las piezas nuevas que nacieron de partir.
      if (inserciones.length > 0) {
        const { error: errIns } = await supabase.from("ventas_facturas").insert(inserciones);
        if (errIns) console.error("Error insertando piezas partidas de ticket:", errIns);
      }
    } catch (err) {
      console.error("Error asignando folios de ticket:", err);
    }
  }

  async function sincronizarVentasFacturas(filasCrudas) {
    try {
      const lineas = extraerLineasFacturables(filasCrudas);
      if (lineas.length === 0) return { ok: true, guardadas: 0 };

      // Ya NO se filtra por ruta al leer el catálogo: el cruce se hace SOLO
      // por código de cliente. Un cliente puede aparecer reportado bajo una
      // ruta distinta a la que se usó para registrarlo (pasa seguido si no
      // se sabe con certeza bajo qué código de ruta exacto va a salir su
      // venta en el reporte) — con el cruce solo por código, esa venta de
      // todas formas se detecta y se manda a facturar.
      const { data: clientesFacturables, error: errClientes } = await supabase
        .from("clientes_facturables")
        .select("id, ruta, codigo_norm, cliente, prioridad, forma_pago_default");
      if (errClientes) {
        console.error("Error leyendo clientes_facturables:", errClientes);
        return { ok: false, error: "No se pudo leer el catálogo de clientes: " + errClientes.message };
      }

      const mapaClientes = new Map((clientesFacturables || []).map((c) => [c.codigo_norm, c]));

      const fechas = [...new Set(lineas.map((l) => l.fecha))];
      const idsClientes = (clientesFacturables || []).map((c) => c.id);
      const { data: exclusiones } = idsClientes.length > 0
        ? await supabase
            .from("facturas_exclusiones_dia")
            .select("cliente_id, fecha")
            .in("cliente_id", idsClientes)
            .in("fecha", fechas)
        : { data: [] };
      const setExcluidos = new Set((exclusiones || []).map((e) => `${e.cliente_id}|${e.fecha}`));

      const filasParaFacturar = [];
      const lineasSinCatalogo = [];
      let coincidenciasCatalogo = 0;
      lineas.forEach((l) => {
        const codigoNorm = normalizarCodigo(l.codigoCliente); // ya existe en tu archivo
        const cliente = mapaClientes.get(codigoNorm);
        if (!cliente) { lineasSinCatalogo.push(l); return; }
        coincidenciasCatalogo++;
        if (setExcluidos.has(`${cliente.id}|${l.fecha}`)) return;
        filasParaFacturar.push({
          ruta: l.vendedor,
          codigo_cliente: l.codigoCliente,
          cliente: cliente.cliente || null,
          articulo: l.articulo,
          producto_nombre: l.productoNombre,
          fecha: l.fecha,
          paquetes: l.paquetesReportados,
          cajetillas: l.cajetillas,
          contado_monto: l.contado,
          credito_monto: l.credito,
          monto: l.monto,
          // La forma de pago viene del catálogo del cliente (se elige al
          // darlo de alta) — a propósito NO se manda si la fila ya existe:
          // Postgres/Supabase upsert solo actualiza las columnas que sí
          // llegan en el payload, así que si más adelante quitas esta línea
          // de un insert nuevo por error, no se sobreescribe una corrección
          // manual hecha en ADMIN. Aquí SÍ se manda porque en un insert
          // nuevo es el valor correcto por default.
          forma_pago: cliente.forma_pago_default || "EFECTIVO",
          prioridad: cliente.prioridad,
          cliente_id: cliente.id,
          actualizado_en: new Date().toISOString(),
        });
      });

      // Segunda pasada: líneas que NO pertenecen a ningún cliente del
      // catálogo permanente, pero que podrían tener una "solicitud de
      // factura por única ocasión" pendiente (código + forma de pago,
      // capturada desde la pestaña FACTURAS sin dar de alta al cliente).
      const solicitudesUsadasIds = new Set();
      let coincidenciasSolicitud = 0;
      const codigosSinCoincidencia = new Set();
      if (lineasSinCatalogo.length > 0) {
        const { data: solicitudes } = await supabase
          .from("facturas_solicitudes_unicas")
          .select("id, ruta, codigo_norm, cliente, forma_pago, prioridad")
          .eq("usada", false);
        const mapaSolicitudes = new Map((solicitudes || []).map((s) => [s.codigo_norm, s]));

        lineasSinCatalogo.forEach((l) => {
          const codigoNorm = normalizarCodigo(l.codigoCliente);
          const solicitud = mapaSolicitudes.get(codigoNorm);
          if (!solicitud) { codigosSinCoincidencia.add(l.codigoCliente); return; }
          coincidenciasSolicitud++;
          filasParaFacturar.push({
            ruta: l.vendedor,
            codigo_cliente: l.codigoCliente,
            cliente: solicitud.cliente || null,
            articulo: l.articulo,
            producto_nombre: l.productoNombre,
            fecha: l.fecha,
            paquetes: l.paquetesReportados,
            cajetillas: l.cajetillas,
            contado_monto: l.contado,
            credito_monto: l.credito,
            monto: l.monto,
            forma_pago: solicitud.forma_pago || "EFECTIVO",
            prioridad: solicitud.prioridad || false,
            cliente_id: null,
            actualizado_en: new Date().toISOString(),
          });
          solicitudesUsadasIds.add(JSON.stringify({ id: solicitud.id, fecha: l.fecha }));
        });
      }
      if (filasParaFacturar.length === 0) {
        return {
          ok: true,
          guardadas: 0,
          diagnostico: `${lineas.length} líneas leídas del archivo, 0 coincidieron con clientes registrados ni con solicitudes únicas pendientes. Revisa que el código de cliente registrado en FACTURAS sea IDÉNTICO al que trae el reporte (columna "Cliente")${codigosSinCoincidencia.size > 0 ? `. Ejemplos de códigos del reporte que no encontraron cliente: ${[...codigosSinCoincidencia].slice(0, 5).join(", ")}` : ""}.`,
        };
      }

      // Combina líneas repetidas (mismo cliente+producto+día) ANTES de
      // mandarlas — ver el porqué en el comentario de combinarLineasDuplicadas.
      // Y de paso, parte cualquier línea que por sí sola ya valga más de
      // $2,000 en varias "piezas" — ver partirLineasQueExcedenLimite.
      const filasCombinadas = partirLineasQueExcedenLimite(
        combinarLineasDuplicadas(filasParaFacturar),
        LIMITE_TICKET_PARTIR
      );

      // Se usa la función RPC upsert_ventas_facturas (ver SQL) en vez de
      // un upsert directo: así, si la fila ya existía, la RPC NO toca
      // forma_pago ni estado (los deja con lo que ADMIN ya haya puesto),
      // solo refresca monto/cajetillas/etc. Si es una fila nueva, sí usa la
      // forma_pago que viene en el payload (catálogo o solicitud única).
      const { error: errUpsert } = await supabase.rpc("upsert_ventas_facturas", { payload: filasCombinadas });
      if (errUpsert) {
        console.error("Error guardando ventas_facturas:", errUpsert);
        return { ok: false, error: `Se encontraron ${filasParaFacturar.length} líneas de clientes registrados, pero la base de datos las rechazó: ${errUpsert.message} (revisa que hayas corrido el SQL más reciente en Supabase).` };
      }

      // Ya que la(s) venta(s) quedaron guardadas, marca cada solicitud de
      // única ocasión que se usó para que no se vuelva a aplicar en una
      // carga futura del avance del día.
      if (solicitudesUsadasIds.size > 0) {
        for (const item of solicitudesUsadasIds) {
          const { id, fecha } = JSON.parse(item);
          await supabase.from("facturas_solicitudes_unicas").update({ usada: true, fecha_uso: fecha }).eq("id", id);
        }
      }
      return {
        ok: true,
        guardadas: filasCombinadas.length,
        diagnostico: `${lineas.length} líneas leídas, ${coincidenciasCatalogo} coincidieron con el catálogo, ${coincidenciasSolicitud} con solicitudes de única ocasión, ${filasCombinadas.length} se mandaron a guardar.`,
      };
    } catch (err) {
      console.error("Error sincronizando ventas_facturas:", err);
      return { ok: false, error: err?.message || "Error desconocido sincronizando facturas." };
    }
  }


  async function procesarFilasAvanceDia(filas) {
    const registros = convertirFilasAvanceDia(filas);
    if (registros.length === 0) {
      setAvanceDiaStatus("No se encontraron filas válidas. Revisa el formato.");
      return;
    }
    await persistParcialFresco((fresca) => ({
      avanceDia: registros,
      visitasSemana: podarVisitasSemanaAntiguas(fusionarVisitasSemanaDesdeAvanceDia(fresca.visitasSemana || {}, registros)),
    }));
    await registrarUltimaCarga("avanceDia");
    const resultadoFacturas = await sincronizarVentasFacturas(filas);
    if (resultadoFacturas && resultadoFacturas.ok !== false && resultadoFacturas.guardadas > 0) {
      await asignarFoliosTickets();
    }
    const fechas = [...new Set(registros.map((r) => r.fecha))];
    if (resultadoFacturas && resultadoFacturas.ok === false) {
      setAvanceDiaStatus(`Avance cargado: ${registros.length} registros para ${fechas.join(", ")}. ⚠️ FACTURAS: ${resultadoFacturas.error}`);
    } else {
      setAvanceDiaStatus(`Avance cargado: ${registros.length} registros para ${fechas.join(", ")}. FACTURAS: ${resultadoFacturas?.diagnostico || "sin clientes registrados en este archivo."}`);
    }
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
    // ACUMULA por fecha (para que los rallies multi-día sumen todo el periodo
    // de vigencia). Las fechas que trae este archivo se REEMPLAZAN (así no
    // hay duplicados si se vuelve a subir el mismo día). El resto de fechas
    // que ya estaban guardadas se conservan.
    const fechasNuevas = new Set(registros.map((r) => r.fecha).filter(Boolean));
    await persistParcialFresco((fresca) => {
      const anteriores = (fresca.otcDia || []).filter((r) => !fechasNuevas.has(r.fecha));
      return { otcDia: [...anteriores, ...registros] };
    });
    await registrarUltimaCarga("otcDia");
    const fechas = [...fechasNuevas].sort();
    setOtcDiaStatus(`OTC cargado: ${registros.length} registros para ${fechas.join(", ")} (se acumula; no se borran días anteriores).`);
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
    await registrarUltimaCarga("ventasPeriodo");
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
      await registrarUltimaCarga("ventasPeriodo", "borrado total");
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

    // Partiendo siempre del documento más reciente en Supabase (no de lo
    // que esta pestaña tenga en pantalla) para que, si Avance del Día se
    // sube casi al mismo tiempo, ninguno de los dos se pise al escribir en
    // `visitasSemana` — ambos suman sobre la versión más fresca posible.
    let resumen = [];
    let mesaControlMerged = [];
    let visitasSemanaMerged = {};
    try {
      await persistParcialFresco((fresca) => {
        const fusion = fusionarMesaControlPorRuta(fresca.mesaControl || [], registros);
        mesaControlMerged = fusion.historial;
        resumen = fusion.resumen;
        visitasSemanaMerged = podarVisitasSemanaAntiguas(fusionarVisitasSemana(fresca.visitasSemana || {}, registros));
        return { mesaControl: mesaControlMerged, visitasSemana: visitasSemanaMerged };
      });
    } catch (err) {
      console.error("Error guardando mesa de control:", err);
      setMesaControlStatus(`Error al guardar en la nube: ${err?.message || "error desconocido"}`);
      return;
    }

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

  const [visitasNurStatus, setVisitasNurStatus] = useState("");
  async function handleVisitasNurTexto(texto) {
    try {
      const registros = parseVisitasNurRaw(texto);
      if (registros.length === 0) {
        setVisitasNurStatus("No se pudo interpretar el texto pegado. Verifica que traiga el reporte de clientes visitados por NUR.");
        return;
      }
      const sinRuta = registros.filter((r) => !r.rutaCodigo).length;
      const fechaCarga = fechaHoyISO();
      await persistParcialFresco((fresca) => {
        const visitasSemanaMerged = podarVisitasSemanaAntiguas(
          fusionarVisitasSemanaDesdeNur(fresca.visitasSemana || {}, registros, fechaCarga)
        );
        return { visitasSemana: visitasSemanaMerged };
      });
      await registrarUltimaCarga("visitasNur");
      setVisitasNurStatus(
        `Visitas NUR cargadas: ${registros.length} registros para ${fechaCarga}.` +
        (sinRuta > 0 ? ` (${sinRuta} con NUR sin mapear a ninguna ruta — revisa RUTA_POR_NUR)` : "")
      );
    } catch (err) {
      console.error("Error guardando visitas NUR:", err);
      setVisitasNurStatus(`Error al guardar en la nube: ${err?.message || "error desconocido"}`);
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
        @keyframes parpadeoRojoIntensoCard {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,0,0,0.9); background-color: rgba(255,0,0,0.10); }
          50% { box-shadow: 0 0 0 8px rgba(255,0,0,0); background-color: rgba(255,0,0,0.35); }
        }
        .card-alerta-intensa { border: 2px solid #FF0000 !important; animation: parpadeoRojoIntensoCard 0.7s ease-in-out infinite; }
      `}</style>

      {/* Indicador de versión — chiquito, en una esquina, visible en
          cualquier pantalla (login, vendedor, staff) sin abrir la consola.
          Sirve para revisar rápido en un celular si esa pestaña ya tiene
          lo último o se quedó vieja — solo compáralo contra el valor de
          "build" en public/version.json. */}
      <div
        style={{
          position: "fixed", bottom: 4, right: 6, fontSize: 9, color: "#3A4A66",
          fontFamily: "monospace", zIndex: 9999, pointerEvents: "none", userSelect: "text",
        }}
      >
        v{BUILD_VERSION}
      </div>

      {estadoGuardado && (
        <div
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9998,
            padding: "10px 16px", textAlign: "center", fontSize: 13, fontWeight: 600,
            background:
              estadoGuardado === "error" ? "#5a1414"
              : estadoGuardado === "sin_conexion" ? "#4a3410"
              : "#123028",
            color:
              estadoGuardado === "error" ? "#FF9B9B"
              : estadoGuardado === "sin_conexion" ? "#F2B134"
              : "#3DDC97",
            borderTop: `1px solid ${
              estadoGuardado === "error" ? "#FF6B6B"
              : estadoGuardado === "sin_conexion" ? "#F2B134"
              : "#3DDC97"
            }`,
          }}
        >
          {estadoGuardado === "guardando" && "Guardando..."}
          {estadoGuardado === "reintentando" && "Conexión inestable — reintentando guardar. Aunque cierres la app, el cambio queda guardado en este dispositivo y se sigue intentando solo."}
          {estadoGuardado === "sin_conexion" && "Sin conexión — el cambio ya quedó guardado en este dispositivo y se enviará solo en cuanto vuelva la señal, aunque cierres la app."}
          {estadoGuardado === "error" && "Sigue sin confirmarse por falta de señal — el cambio no se pierde, se seguirá reintentando solo. Abre la app cuando tengas conexión para que termine de enviarse."}
        </div>
      )}

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
            registrarEventoUso({ usuario: user.username, rol: user.role, puesto: user.puesto || null, tipoEvento: "login" });
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
          persistFresco={persistParcialFresco}
          persistCargas={persistCargas}
          persistRevisionUnidad={persistRevisionUnidad}
          persistConfigUnidades={persistConfigUnidades}
          stats={stats}
          puesto={puesto}
          staffUsername={staffUsername}
          ventasPeriodo={ventasPeriodo}
          onRegistrarEvento={registrarEventoUso}
          onFile={handleOtcSemanalFile}
          fileInputRef={fileInputRef}
          onDownloadTemplate={downloadOtcSemanalTemplate}
          status={status}
          onObjetivosFile={handleObjetivosFile}
          objFileInputRef={objFileInputRef}
          onDownloadObjetivosTemplate={downloadObjetivosTemplate}
          objStatus={objStatus}
          onObjetivoVisitasFile={handleObjetivoVisitasFile}
          objetivoVisitasFileInputRef={objetivoVisitasFileInputRef}
          onDownloadObjetivoVisitasTemplate={downloadObjetivoVisitasTemplate}
          objetivoVisitasStatus={objetivoVisitasStatus}
          onObjetivoVisitasTexto={handleObjetivoVisitasTexto}
          onAvanceDiaFile={handleAvanceDiaFile}
          avanceDiaFileInputRef={avanceDiaFileInputRef}
          avanceDiaStatus={avanceDiaStatus}
          onAvanceDiaTexto={handleAvanceDiaTexto}
          onOtcDiaFile={handleOtcDiaFile}
          otcDiaFileInputRef={otcDiaFileInputRef}
          otcDiaStatus={otcDiaStatus}
          onOtcDiaTexto={handleOtcDiaTexto}
          onPedidosDiaFile={handlePedidosDiaFile}
          pedidosDiaFileInputRef={pedidosDiaFileInputRef}
          pedidosDiaStatus={pedidosDiaStatus}
          onPedidosDiaTexto={handlePedidosDiaTexto}
          onVentasPeriodoFile={handleVentasPeriodoFile}
          ventasPeriodoFileInputRef={ventasPeriodoFileInputRef}
          ventasPeriodoStatus={ventasPeriodoStatus}
          onVentasPeriodoTexto={handleVentasPeriodoTexto}
          onBorrarTodoVentasPeriodo={borrarTodoVentasPeriodo}
          onMesaControlFile={handleMesaControlFile}
          mesaControlFileInputRef={mesaControlFileInputRef}
          mesaControlStatus={mesaControlStatus}
          onMesaControlTexto={handleMesaControlTexto}
          onVisitasNurTexto={handleVisitasNurTexto}
          visitasNurStatus={visitasNurStatus}
          onOtcSemanalTexto={handleOtcSemanalTexto}
          onCargasFile={handleCargasFile}
          cargasFileInputRef={cargasFileInputRef}
          cargasStatus={cargasStatus}
          onDescargarCargas={descargarCargasModificadas}
          bloqueoPendienteCargas={bloqueoPendiente}
          onReintentarBloqueoCargas={reintentarBloqueoCarga}
          onActivarCarga={activarCarga}
          onEliminarCarga={eliminarCarga}
          onRefresh={refrescarManual}
          refrescando={refrescando}
          onLogout={() => { setRole(null); setPuesto(null); setStaffUsername(null); }}
          asignarFoliosTickets={asignarFoliosTickets}
        />
      )}

      {role === "liquidacion" && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
          <TabsLiquidacion data={data} persist={persist} persistFresco={persistParcialFresco} staffUsername={staffUsername} onLogout={() => { setRole(null); setPuesto(null); setStaffUsername(null); }} />
        </div>
      )}

      {role === "merch" && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
          <TabsMerch data={data} persist={persist} persistFresco={persistParcialFresco} persistRevisionUnidad={persistRevisionUnidad} persistConfigUnidades={persistConfigUnidades} staffUsername={staffUsername} onLogout={() => { setRole(null); setPuesto(null); setStaffUsername(null); }} />
        </div>
      )}

         {role === "vendedor" && (
        <VendorView
          vendedor={stats.porVendedor.find((v) => v.id === currentVendorId)}
          porVendedor={stats.porVendedor}
          periodo={periodo}
          restantes={stats.restantes}
          mesaControl={mesaControl}
          mensajeDia={mensajesDia[stats.porVendedor.find((v) => v.id === currentVendorId)?.name]}
          data={data}
          persist={persist}
          persistFresco={persistParcialFresco}
          persistCargas={persistCargas}
          persistRevisionUnidad={persistRevisionUnidad}
          persistConfigUnidades={persistConfigUnidades}
          onRefresh={refrescarManual}
          refrescando={refrescando}
          onRegistrarEvento={registrarEventoUso}
          onLogout={() => { setRole(null); setPuesto(null); setStaffUsername(null); }}
          peorVendedorNombre={stats.peorVendedorNombre}
          bottom3Nombres={stats.bottom3Nombres}
          ventasPeriodo={ventasPeriodo}
        />
      )}

      {role === "admin" && (
        <FacturasAdminView onLogout={() => { setRole(null); setPuesto(null); setStaffUsername(null); }} asignarFoliosTickets={asignarFoliosTickets} />
      )}
    </div>
  );
}
