// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { TrendingUp, AlertTriangle, Award, Package, Clock } from "lucide-react";
import { NOMBRES } from "../constants";
import { calcularScorecardSemanal, rangoSemanaActual, money, unidades, todayISO } from "../utils";
import { KpiCard } from "./ui";
import { resumenPorRuta } from "../carteraVencidaParser";
import { supabase } from "../supabaseClient";

/* =========================================================================
   ScorecardSemanalView — resumen automático de desempeño de la semana en
   curso (Lunes → hoy, tope Sábado), por vendedor.

   - rol === "vendedor": solo su propia tarjeta + su lugar en el equipo.
   - rol === "staff" (Gerente / Supervisor-1 / Supervisor-2): ranking
     completo de todas las rutas, de mayor a menor efectividad, con
     medallas para el Top 3 y la cartera vencida de cada ruta.

   No requiere tabla nueva ni carga de datos propia para ventas/cartera —
   se calcula al vuelo con lo que ya existe en `data` (avanceDia, otcDia,
   carteraVencida) y `porVendedor` (ya calculado en App.tsx). Ver
   `calcularScorecardSemanal` en utils.js para el detalle de la fórmula.

   La ASISTENCIA/PUNTUALIDAD sí consulta una tabla aparte —
   `checador_marcas` (la misma que ya usa RelojChecadorView.jsx) — porque
   ese dato no vive en el blob `data`. Solo se pide y se muestra cuando
   quien mira el Scorecard puede ver puntualidad (mismo criterio que
   RelojChecadorView: Gerente y Supervisor-1 sí, Supervisor-2 no; cada
   vendedor ve la suya propia). J201 y J203 no tienen número de checador
   asignado (igual que en RelojChecadorView), así que ahí se muestra
   "sin checador" en vez de fabricar un dato.
   ========================================================================= */

// Debe coincidir con HORA_LIMITE_PUNTUALIDAD en RelojChecadorView.jsx — se
// duplica a propósito (no se exporta desde allá) para no acoplar ambos
// archivos; si cambia la hora límite allá, actualízala aquí también.
const HORA_LIMITE_PUNTUALIDAD = "07:12:00";
// Debe coincidir con RUTAS_SIN_CHECADOR en RelojChecadorView.jsx.
const RUTAS_SIN_CHECADOR = new Set(["RUTA J201", "RUTA J203"]);

const COLOR_VERDE = "#3DDC97";
const COLOR_AMBAR = "#F2B134";
const COLOR_ROJO = "#FF6B6B";
const COLOR_MUTED = "#9AA7BD";

function colorEfectividad(pct) {
  if (pct >= 90) return COLOR_VERDE;
  if (pct >= 60) return COLOR_AMBAR;
  return COLOR_ROJO;
}

function BarraEfectividad({ pct }) {
  const color = colorEfectividad(pct);
  return (
    <div style={{ height: 8, borderRadius: 4, background: "#141b2c", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, borderRadius: 4 }} />
    </div>
  );
}

function TarjetaVendedor({ rutaCodigo, nombre, sc, carteraRuta, destacado, medalla, asistencia }) {
  const color = colorEfectividad(sc.efectividadPct);
  return (
    <div className="card" style={{ padding: 14, marginBottom: 10, border: destacado ? `1px solid ${color}` : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#E7ECF7" }}>
            {medalla ? `${medalla} ` : ""}{rutaCodigo}{nombre ? ` · ${nombre}` : ""}
          </div>
          <div style={{ fontSize: 11, color: COLOR_MUTED }}>
            {unidades(sc.paquetesSemana)} · OTC {money(sc.otcMontoSemana)} · {sc.clientesUnicosSemana} cliente{sc.clientesUnicosSemana === 1 ? "" : "s"}
          </div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color, flexShrink: 0 }}>{sc.efectividadPct.toFixed(0)}%</div>
      </div>
      <BarraEfectividad pct={sc.efectividadPct} />
      {(carteraRuta && (carteraRuta.vencidos > 0 || carteraRuta.proximos > 0)) || asistencia ? (
        <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, flexWrap: "wrap", alignItems: "center" }}>
          {carteraRuta && carteraRuta.vencidos > 0 && (
            <span style={{ color: COLOR_ROJO }}>
              <AlertTriangle size={11} style={{ verticalAlign: "-1px" }} /> {carteraRuta.vencidos} vencido{carteraRuta.vencidos === 1 ? "" : "s"} · {money(carteraRuta.vencidosSaldo)}
            </span>
          )}
          {carteraRuta && carteraRuta.proximos > 0 && (
            <span style={{ color: COLOR_AMBAR }}>{carteraRuta.proximos} por vencer</span>
          )}
          {asistencia && (
            asistencia.sinChecador ? (
              <span style={{ color: COLOR_MUTED }}><Clock size={11} style={{ verticalAlign: "-1px" }} /> Sin checador asignado</span>
            ) : (
              <span style={{ color: asistencia.diasTarde > 0 ? COLOR_AMBAR : COLOR_VERDE }}>
                <Clock size={11} style={{ verticalAlign: "-1px" }} /> {asistencia.diasATiempo}/{asistencia.diasEsperados} días a tiempo
                {asistencia.diasTarde > 0 ? ` · ${asistencia.diasTarde} tarde` : ""}
                {asistencia.diasSinRegistro > 0 ? ` · ${asistencia.diasSinRegistro} sin registro` : ""}
              </span>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function ScorecardSemanalView({ data, porVendedor, rol, rutaPropia, puesto, ventasPeriodo }) {
  const hoy = todayISO();

  const registrosCartera = data?.carteraVencida?.registros || [];
  const resumenCartera = useMemo(() => resumenPorRuta(registrosCartera, 3, new Date()), [registrosCartera]);
  const carteraPorRuta = useMemo(() => {
    const mapa = {};
    resumenCartera.forEach((g) => { mapa[g.rutaCodigo] = g; });
    return mapa;
  }, [resumenCartera]);

  const filas = useMemo(() => {
    return (porVendedor || [])
      .map((v) => ({
        vendedor: v,
        rutaCodigo: v.name.replace("RUTA ", "").trim(),
        nombre: NOMBRES[v.name],
        sc: calcularScorecardSemanal(v, data, hoy, ventasPeriodo),
      }))
      .sort((a, b) => b.sc.efectividadPct - a.sc.efectividadPct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porVendedor, data, hoy, ventasPeriodo]);

  // Asistencia/puntualidad (checador_marcas) — mismo criterio de quién
  // puede verla que ya usa RelojChecadorView: cada vendedor ve la suya
  // propia, y en staff solo Gerente y Supervisor-1 (Supervisor-2 no).
  const puedeVerAsistencia = rol === "vendedor" || puesto === "gerente" || puesto === "supervisor";
  const { lunes: semanaLunes, hoyCapado: semanaHoyCapado, diasTranscurridos: semanaDias } = rangoSemanaActual(hoy);
  const [marcasChecador, setMarcasChecador] = useState(null); // null = aún no cargó / no aplica

  useEffect(() => {
    if (!puedeVerAsistencia) { setMarcasChecador(null); return; }
    let activo = true;
    (async () => {
      try {
        const { data: rows, error } = await supabase
          .from("checador_marcas")
          .select("ruta, fecha, hora_entrada")
          .gte("fecha", semanaLunes)
          .lte("fecha", semanaHoyCapado);
        if (error) throw error;
        if (activo) setMarcasChecador(rows || []);
      } catch (e) {
        console.error("Error cargando checador_marcas para el Scorecard:", e);
        if (activo) setMarcasChecador([]);
      }
    })();
    return () => { activo = false; };
  }, [puedeVerAsistencia, semanaLunes, semanaHoyCapado]);

  const asistenciaPorRuta = useMemo(() => {
    const mapa = {};
    filas.forEach((f) => {
      const rutaCompleta = f.vendedor.name;
      if (RUTAS_SIN_CHECADOR.has(rutaCompleta)) {
        mapa[f.rutaCodigo] = { sinChecador: true };
        return;
      }
      if (!marcasChecador) return; // aún cargando o no aplica — se omite la sección
      const marcasRuta = marcasChecador.filter((m) => m.ruta === rutaCompleta);
      const diasATiempo = marcasRuta.filter((m) => m.hora_entrada && m.hora_entrada <= HORA_LIMITE_PUNTUALIDAD).length;
      const diasTarde = marcasRuta.filter((m) => m.hora_entrada && m.hora_entrada > HORA_LIMITE_PUNTUALIDAD).length;
      const diasSinRegistro = Math.max(0, semanaDias - diasATiempo - diasTarde);
      mapa[f.rutaCodigo] = { sinChecador: false, diasATiempo, diasTarde, diasSinRegistro, diasEsperados: semanaDias };
    });
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, marcasChecador, semanaDias]);

  if (filas.length === 0) {
    return <div className="card" style={{ padding: 16, textAlign: "center", color: COLOR_MUTED, fontSize: 13 }}>Todavía no hay vendedores cargados.</div>;
  }

  // ---------------- Vista VENDEDOR: solo su propia tarjeta ----------------
  if (rol === "vendedor") {
    const posicion = filas.findIndex((f) => f.rutaCodigo === rutaPropia);
    if (posicion === -1) {
      return <div className="card" style={{ padding: 16, textAlign: "center", color: COLOR_MUTED, fontSize: 13 }}>No se encontró tu ruta en el scorecard de esta semana.</div>;
    }
    const propia = filas[posicion];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <KpiCard icon={<TrendingUp size={14} />} label="Efectividad de la semana" value={`${propia.sc.efectividadPct.toFixed(0)}%`} accent={colorEfectividad(propia.sc.efectividadPct)} />
          <KpiCard icon={<Award size={14} />} label="Lugar en el equipo" value={`#${posicion + 1} de ${filas.length}`} />
          <KpiCard icon={<Package size={14} />} label="Paquetes en la semana" value={unidades(propia.sc.paquetesSemana)} />
        </div>
        <TarjetaVendedor rutaCodigo={propia.rutaCodigo} nombre={propia.nombre} sc={propia.sc} carteraRuta={carteraPorRuta[propia.rutaCodigo]} asistencia={asistenciaPorRuta[propia.rutaCodigo]} destacado />
        <div style={{ fontSize: 11, color: COLOR_MUTED }}>
          Semana del {propia.sc.lunes} al {propia.sc.hoyCapado} · se compara contra el objetivo diario que ya ves en tu dashboard.
        </div>
      </div>
    );
  }

  // ---------------- Vista STAFF: ranking completo ----------------
  const promedioEquipo = filas.reduce((s, f) => s + f.sc.efectividadPct, 0) / filas.length;
  const totalVencidos = resumenCartera.reduce((s, g) => s + g.vencidos, 0);
  const totalVencidosSaldo = resumenCartera.reduce((s, g) => s + g.vencidosSaldo, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <KpiCard icon={<TrendingUp size={14} />} label="Efectividad promedio del equipo" value={`${promedioEquipo.toFixed(0)}%`} accent={colorEfectividad(promedioEquipo)} />
        <KpiCard icon={<AlertTriangle size={14} />} label="Cartera vencida (equipo)" value={`${totalVencidos} · ${money(totalVencidosSaldo)}`} accent={COLOR_ROJO} />
      </div>
      <div style={{ fontSize: 11, color: COLOR_MUTED, marginTop: -6 }}>
        Semana del {filas[0].sc.lunes} a hoy · ordenado de mayor a menor efectividad.
      </div>
      {filas.map((f, i) => (
        <TarjetaVendedor
          key={f.vendedor.id || f.rutaCodigo}
          rutaCodigo={f.rutaCodigo}
          nombre={f.nombre}
          sc={f.sc}
          carteraRuta={carteraPorRuta[f.rutaCodigo]}
          asistencia={asistenciaPorRuta[f.rutaCodigo]}
          destacado={i < 3}
          medalla={i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null}
        />
      ))}
    </div>
  );
}
