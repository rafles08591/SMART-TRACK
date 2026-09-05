// @ts-nocheck
import { supabase } from "./supabaseClient";
import {
  DIAS_CICLO_CREDITOS,
  DIAS_SEMANA_VISITAS_KEYS,
  ACTIVIDADES_INICIALES,
  RUTAS,
  TZ_MX,
  MARCAS_DIA,
  MARCA_KEYS,
  MARCA_KEYS_ALL,
} from "./constants";

export function creditosPendientes(data) {
  const ultimo = data.creditos?.ultimoEnvio;
  if (!ultimo) return true;
  const dias = Math.floor((Date.now() - new Date(ultimo).getTime()) / (1000 * 60 * 60 * 24));
  return dias >= DIAS_CICLO_CREDITOS;
}

export function multiplicadorComision(tabla, promedio) {
  for (const nivel of tabla) {
    if (promedio >= nivel.desde) return nivel.mult;
  }
  return tabla[tabla.length - 1].mult;
}

export const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ_MX });

export function firstOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
export function lastOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

export function diasHabilesEntre(inicio, fin, diasNoLaborables) {
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

export function diasRestantes(fin, diasNoLaborables) {
  return diasHabilesEntre(todayISO(), fin, diasNoLaborables);
}

export const money = (n) =>
  (n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

export const unidades = (n) => `${Math.round(n || 0).toLocaleString("es-MX")} paq.`;

export const fmt = (unit, n) => (unit === "units" ? unidades(n) : money(n));

export const metaColor = (vendido, objetivo) => (objetivo > 0 && vendido >= objetivo ? "#3DDC97" : "#FF6B6B");

export function calcularResumenPedidos(pedidosDia, nombreRuta) {
  const propios = (pedidosDia || []).filter(
    (r) => r.vendedor.trim().toLowerCase() === (nombreRuta || "").trim().toLowerCase()
  );
  if (propios.length === 0) return null;
  const esStatus = (r, texto) => r.status.toLowerCase().includes(texto.toLowerCase());
  const pendientes = propios.filter((r) => esStatus(r, "pendiente"));
  const rechazados = propios.filter((r) => esStatus(r, "rechazado"));
  const cambioContado = propios.filter((r) => esStatus(r, "cambio contado"));
  const entregados = propios.filter((r) => r.totalPaquetesEntregado > 0);
  const totalPaquetesPedido = propios.reduce((s, r) => s + r.totalPaquetesPedido, 0);
  const totalPaquetesEntregado = propios.reduce((s, r) => s + r.totalPaquetesEntregado, 0);
  const motivos = propios
    .filter((r) => r.motivoRechazo)
    .map((r) => ({ cliente: r.cliente, motivo: r.motivoRechazo, status: r.status }));
  const clientesUnicos = new Set(propios.map((r) => (r.clienteCodigo || r.cliente || "").trim()).filter(Boolean)).size;
  return {
    totalPedidos: propios.length,
    entregados: entregados.length,
    pendientes: pendientes.length,
    rechazados: rechazados.length,
    cambioContado: cambioContado.length,
    totalPaquetesPedido,
    totalPaquetesEntregado,
    motivos,
    clientesUnicos,
  };
}

export function diaSemanaDeFecha(fechaISO) {
  if (!fechaISO) return null;
  const dia = new Date(fechaISO + "T12:00:00").getDay();
  return DIAS_SEMANA_VISITAS_KEYS[dia];
}

export function calcularVisitasVsObjetivo(pedidosDia, nombreRuta, objetivosVisitasDia, fecha) {
  const diaSemana = diaSemanaDeFecha(fecha);
  if (!diaSemana) return null;
  const codigoRuta = (nombreRuta || "").replace("RUTA ", "").trim().toUpperCase();
  const objetivo = objetivosVisitasDia?.[codigoRuta]?.[diaSemana];
  if (!objetivo) return null;
  const propiosHoy = (pedidosDia || []).filter(
    (r) => r.vendedor.trim().toLowerCase() === (nombreRuta || "").trim().toLowerCase() && r.fecha === fecha
  );
  const visitas = new Set(propiosHoy.map((r) => (r.clienteCodigo || r.cliente || "").trim()).filter(Boolean)).size;
  return { visitas, objetivo, diaSemana, cumple: visitas >= objetivo };
}

export function diaSemanaClientesRuta(fechaISO) {
  if (!fechaISO) return null;
  const dias = [null, "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const dia = new Date(fechaISO + "T12:00:00").getDay();
  return dias[dia] || null;
}

export function normalizarDia(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function normalizarCodigo(s) {
  const t = String(s || "").trim().toUpperCase();
  if (/^\d+$/.test(t)) return t.replace(/^0+/, "") || "0";
  return t;
}

export function normalizarNombre(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function calcularClientesFaltantes(rutaNombre, mesaControl, fecha) {
  const codigoRuta = (rutaNombre || "").replace("RUTA ", "").trim().toUpperCase();
  const dia = diaSemanaClientesRuta(fecha);
  if (!codigoRuta || !dia) return { faltantes: [], totalDebia: 0, totalVisitados: 0, dia, error: "sin-ruta-o-dia" };

  const filasMC = (mesaControl || []).filter(
    (r) => r.vendedor.trim().toLowerCase() === (rutaNombre || "").trim().toLowerCase()
      && (!fecha || r.fecha === fecha)
  );
  const visitadosCodigos = new Set();
  const visitadosNombres = new Set();
  filasMC.forEach((r) => {
    const c = (r.cliente || "").trim();
    if (!c) return;
    visitadosCodigos.add(normalizarCodigo(c));
    visitadosNombres.add(normalizarNombre(c));
  });

  const { data, error } = await supabase
    .from("clientes_ruta")
    .select("codigo_cliente, nombre, dia")
    .eq("ruta", codigoRuta);

  if (error) {
    console.error("Error consultando clientes_ruta:", error);
    return { faltantes: [], totalDebia: 0, totalVisitados: filasMC.length, dia, error: error.message };
  }

  const todosRuta = data || [];
  const diaNorm = normalizarDia(dia);
  const debia = todosRuta.filter((c) => normalizarDia(c.dia) === diaNorm);

  const faltantes = debia
    .filter((c) => {
      const cod = normalizarCodigo(c.codigo_cliente);
      const nom = normalizarNombre(c.nombre);
      if (cod && visitadosCodigos.has(cod)) return false;
      if (nom && visitadosNombres.has(nom)) return false;
      return true;
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return {
    faltantes,
    totalDebia: debia.length,
    totalVisitados: visitadosNombres.size || visitadosCodigos.size,
    totalEnRuta: todosRuta.length,
    dia,
    error: null,
  };
}

export function analizarMesaControl(mesaControl, vendedorName) {
  const propios = mesaControl.filter((r) => r.vendedor.trim().toLowerCase() === vendedorName.trim().toLowerCase());
  if (propios.length === 0) return null;

  const fecha = propios[0].fecha;
  const horaInicio = propios.reduce((min, r) => (r.inicio && (!min || r.inicio < min) ? r.inicio : min), null);
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
  const visitasEfectivas = new Set(
    propios.filter((r) => (Number(r.volumen) || 0) > 0).map((r) => (r.cliente || "").trim().toLowerCase()).filter(Boolean)
  ).size;

  return {
    fecha, horaInicio, horaUltimoCliente, top5, menores3, tipoInicioConteo, tipoFinConteo,
    volumenTotal, clientesVolumen03, clientesConDescuento, visitasEfectivas, todos: conAlerta,
  };
}

export function blankObjetivos() {
  return {
    open: 0, champions: 0, max: 0,
    visitasEfectivas: 0,
    iceMix: 0, blossMix: 0, summMix: 0, faronet: 0,
    champIce: 0, champBlossSumm: 0, champFaronet: 0,
    otc: 0, otcDiario: 1600,
  };
}

export function defaultData() {
  return {
    vendedores: RUTAS.map((r, i) => ({
      id: "v" + (i + 1),
      name: r,
      objetivos: { ...blankObjetivos(), open: 150000, champions: 200000, max: 200000, otc: 1600 * 6, otcDiario: 1600 },
    })),
    ventas: [],
    avanceDia: [],
    otcDia: [],
    pedidosDia: [],
    objetivosVisitasDia: {},
    diasNoLaborables: [],
    otcSemanal: [],
    mesaControl: [],
    unidadesFlota: [],
    asignacionesUnidades: {},
    revisionesUnidades: [],
    seguridadUnidades: { qr: true, gps: true, kmCamara: true, auditoria: true, probabilidadAuditoria: 20 },
    creditos: { ultimoEnvio: null, historial: [] },
    mensajesDia: {},
    mensajesSupervisores: {},
    promociones: [],
    cuponesRedimidos: [],
    periodo: { inicio: firstOfMonthISO(), fin: lastOfMonthISO() },
    actividades: {
      dia: { fecha: null, items: [] },
      semana: { semanaId: null, items: [] },
      mes: { mesId: null, items: [] },
    },
    avisos: [],
    preferenciasAvisos: { supervisor2: true, liquidacion: true },
    avisosVistoPor: {},
    avisosDescartadosPor: {},
    cargas: { fecha: null, bloqueado: false, items: [], enviosPorRuta: {} },
    rallyOtc: {
      activo: false,
      nombre: "",
      fechaInicio: null,
      fechaFin: null,
      rutasParticipantes: [],
      imagen: null,
      objetivos: {},
      codigosParticipantes: [],
      unidad: "dinero",
    },
  };
}

export function fechaHoyISO() {
  return new Date().toLocaleDateString("en-CA");
}

export function lunesDeSemana(fechaISO) {
  const d = new Date(fechaISO + "T00:00:00");
  const dia = d.getDay();
  const diff = (dia === 0 ? -6 : 1) - dia;
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString("en-CA");
}

export function nuevaActividad(texto, tipo, autor, fechaISO) {
  return {
    id: "act_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    texto: texto.trim(),
    tipo,
    hecha: false,
    creadaPor: autor || "Sistema",
    creadaFecha: fechaISO,
  };
}

export function procesarCicloActividades(estado, idActual, campoId, semillas) {
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

export function normalizarActividades(actividadesActuales) {
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

export function formatCrono(ms) {
  if (!ms || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function formatHoraTiempos(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export function horaAMinutos(hora) {
  if (!hora) return null;
  const parts = String(hora).split(":");
  if (parts.length < 2) return null;
  return Number(parts[0]) * 60 + Number(parts[1]);
}

export function diferenciaMinutos(horaA, horaB) {
  const a = horaAMinutos(horaA);
  const b = horaAMinutos(horaB);
  if (a == null || b == null) return null;
  return b - a;
}

export function normalizarEncabezado(s) {
  return String(s || "").replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

export function quitarHtml(texto) {
  return String(texto || "").replace(/<[^>]*>/g, "").trim();
}

// =========================================================================
// SCORECARD SEMANAL
// =========================================================================
// Calcula, para la semana en curso (Lunes → hoy, tope Sábado, igual que el
// resto de la app), el desempeño de un vendedor reutilizando el MISMO tipo
// de indicadores que ya se usan en "HOY" (volumen del día, marcas del día,
// OTC del día) pero acumulados día por día en la semana, comparados contra
// el objetivo diario que el vendedor YA ve en su dashboard
// (`ventaPorDiaNecesaria` / `otcDiario`) multiplicado por los días
// transcurridos de la semana.
//
// ⚠️ Esto es una aproximación DELIBERADA, no una réplica del cálculo de
// `efectividadPct` de "HOY" que vive dentro de `porVendedor` en App.tsx:
// ese cálculo usa el objetivo diario vigente en cada momento; aquí se usa
// el objetivo diario de HOY para toda la semana (cambia poco día a día
// dentro del mismo periodo, así que es una aproximación razonable). Se
// hizo así — en vez de reutilizar/tocar el cálculo de App.tsx — para no
// arriesgar el dashboard de HOY que ya está en producción. Si algún día
// cambia la fórmula de efectividadPct en App.tsx, esta función NO se
// actualiza sola — revísala aparte si hace falta.
export function rangoSemanaActual(fechaHoyISOref) {
  const lunes = lunesDeSemana(fechaHoyISOref);
  const inicioDate = new Date(lunes + "T00:00:00");
  const sabadoDate = new Date(inicioDate);
  sabadoDate.setDate(inicioDate.getDate() + 5); // Lun-Sáb, igual que el resto de SMART-TRACK
  const sabadoISO = sabadoDate.toLocaleDateString("en-CA");
  const hoyCapado = fechaHoyISOref < lunes ? lunes : fechaHoyISOref > sabadoISO ? sabadoISO : fechaHoyISOref;
  const diasTranscurridos = Math.max(
    1,
    Math.round((new Date(hoyCapado + "T00:00:00") - inicioDate) / 86400000) + 1
  );
  return { lunes, sabado: sabadoISO, hoyCapado, diasTranscurridos };
}

export function calcularScorecardSemanal(vendedorStats, data, fechaHoyISOref, ventasPeriodo) {
  const { lunes, sabado, hoyCapado, diasTranscurridos } = rangoSemanaActual(fechaHoyISOref);
  const nombreLower = (vendedorStats.name || "").trim().toLowerCase();

  // Paquetes/marcas de la semana: se toman de `ventasPeriodo` (la carga
  // acumulada del periodo — tabla `ventas_periodo`, la MISMA fuente que ya
  // usa App.tsx para MAX/OPEN/CHAMPIONS), filtrando por fecha dentro de la
  // semana en curso.
  //
  // ⚠️ A propósito NO se usa `data.avanceDia` para esto: ese campo se
  // REEMPLAZA por completo cada vez que se sube "Avance del día"
  // (persistParcialFresco guarda solo los registros de la carga más
  // reciente, no acumula historial — ver `procesarFilasAvanceDia` en
  // App.tsx). Filtrarlo por rango de semana solo encontraba el último día
  // subido, no la semana completa, lo cual inflaba/desinflaba mal la
  // efectividad semanal.
  const ventasSemana = (ventasPeriodo || data?.ventas || []).filter(
    (r) => r.vendedor.trim().toLowerCase() === nombreLower && r.fecha >= lunes && r.fecha <= hoyCapado
  );

  // OTC del día SÍ se acumula históricamente en `data.otcDia` (cada carga
  // nueva solo reemplaza las fechas que trae, el resto de días se
  // conserva — ver `procesarFilasOtcDia` en App.tsx), así que aquí es
  // seguro seguir filtrándolo por semana.
  const otcSemana = (data?.otcDia || []).filter(
    (r) => r.vendedor.trim().toLowerCase() === nombreLower && r.fecha >= lunes && r.fecha <= hoyCapado
  );

  const paquetesSemana = ventasSemana.reduce((s, r) => s + (Number(r.paquetes) || 0), 0);
  const otcMontoSemana = otcSemana.reduce((s, r) => s + (Number(r.monto) || 0), 0);

  const marcasSemana = {};
  MARCAS_DIA.forEach((m) => {
    marcasSemana[m.key] = ventasSemana
      .filter((r) => MARCA_KEYS[(r.marca || "").trim().toLowerCase()] === m.key)
      .reduce((s, r) => s + (Number(r.paquetes) || 0), 0);
  });

  const clientesUnicosSemana = new Set(
    ventasSemana.map((r) => (r.cliente || "").trim()).filter(Boolean)
  ).size;

  const volumenObjetivoDia = vendedorStats.tabs?.max?.ventaPorDiaNecesaria || 0;
  const otcObjetivoDia = vendedorStats.objetivos?.otcDiario || 0;

  const indicadores = [];
  if (volumenObjetivoDia > 0) {
    indicadores.push({ label: "Volumen", vendido: paquetesSemana, objetivo: volumenObjetivoDia * diasTranscurridos, unidad: "paq" });
  }
  MARCAS_DIA.forEach((m) => {
    const objDia = vendedorStats.marcasOpen?.[m.key]?.ventaPorDiaNecesaria || 0;
    if (objDia > 0) {
      indicadores.push({ label: m.label, vendido: marcasSemana[m.key] || 0, objetivo: objDia * diasTranscurridos, unidad: "paq" });
    }
  });
  if (otcObjetivoDia > 0) {
    indicadores.push({ label: "OTC", vendido: otcMontoSemana, objetivo: otcObjetivoDia * diasTranscurridos, unidad: "$" });
  }

  const efectividadPct = indicadores.length > 0
    ? (indicadores.reduce((s, ind) => s + Math.min(1, ind.objetivo > 0 ? ind.vendido / ind.objetivo : 1), 0) / indicadores.length) * 100
    : 100;

  return {
    lunes, sabado, hoyCapado, diasTranscurridos,
    paquetesSemana, otcMontoSemana, marcasSemana, clientesUnicosSemana,
    indicadores, efectividadPct,
  };
}
