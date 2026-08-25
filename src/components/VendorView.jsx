// @ts-nocheck
import React, { useEffect, useState } from "react";
import { Target, Calendar, MapPin, Star, LogOut } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  OBJETIVO_TABS, NOMBRES, MARCAS_OPEN, MARCAS_CHAMPIONS,
} from "../constants";
import {
  fmt, money, unidades, metaColor, analizarMesaControl,
  calcularResumenPedidos, calcularVisitasVsObjetivo, todayISO,
} from "../utils";
import { supabase } from "../supabaseClient";
import { RoadProgress, KpiCard, MarcasBreakdown } from "./ui";
import NeonObjetivoTabs from "./NeonObjetivoTabs";
import TopBar from "./TopBar";
import DiaKpis from "./DiaKpis";
import MesaControlView from "./MesaControlView";
import CuponeraView from "./CuponeraView";
import RallyOtcView from "./RallyOtcView";
import AvisosView, { hayAvisoNuevoPara } from "./AvisosView";
import CargasView from "./CargasView";
import UnidadesView, { unidadYaRegistradaHoy } from "./UnidadesView";
import KmView from "./KmView";
import FacturasView from "./FacturasView";
import NominaView from "./NominaView";
import SinVisitaView from "./SinVisitaView";
import RelojChecadorView from "./RelojChecadorView";
import PanelFondoPersonalizado, { useFondoPersonalizado, FondoDeFondo } from "./FondoPersonalizado";
import EscaleraView from "./EscaleraView";
import CarteraVencidaView from "./CarteraVencidaView";
import OtcVentasView from "./OtcVentasView";
import AltaClienteView from "./AltaClienteView";
import { hayCarteraVencidaPara } from "../carteraVencidaParser";

// Rutas que tienen habilitada la pestaña KM (captura directa de
// kilometraje, aparte de UNIDADES y TIEMPOS). Para agregar otra ruta más
// adelante, solo hay que sumarla aquí.
const RUTAS_CON_KM = ["RUTA J201", "RUTA J203"];

export default function VendorView({ vendedor, periodo, restantes, mesaControl, mensajeDia, data, persist, persistFresco, persistCargas, persistRevisionUnidad, persistConfigUnidades, onRefresh, refrescando, onRegistrarEvento, onLogout, peorVendedorNombre, bottom3Nombres }) {
  const [tab, setTab] = useState("dia");

  // Registro de uso: mismo mecanismo que en StaffView.
  useEffect(() => {
    if (!onRegistrarEvento || !vendedor) return;
    onRegistrarEvento({ usuario: vendedor.name, rol: "vendedor", puesto: null, tipoEvento: "tab_view", pestana: tab });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, vendedor?.name]);

  // Observaciones de facturación sin responder para esta ruta — hace
  // parpadear en naranja la pestaña FACTURAS hasta que la ruta responde.
  const [hayObservacionFacturasPendiente, setHayObservacionFacturasPendiente] = useState(false);
  useEffect(() => {
    if (!vendedor) return;
    let activo = true;
    async function revisar() {
      try {
        const { count } = await supabase
          .from("facturas_observaciones")
          .select("id", { count: "exact", head: true })
          .eq("ruta", vendedor.name)
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
  }, [vendedor?.name]);

  const [fondoUrl, setFondoUrl] = useFondoPersonalizado(vendedor?.name);

  if (!vendedor) return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 10 }}>No se encontró tu ruta en la lista de vendedores activos.</div>
      <div style={{ fontSize: 11, color: "#9AA7BD", marginBottom: 14 }}>
        Rutas disponibles ahora mismo: {(data?.vendedores || []).map((v) => v.name).join(", ") || "(ninguna cargada)"}
      </div>
      <button className="btn-ghost" onClick={onLogout}>Volver</button>
    </div>
  );
  const nombre = NOMBRES[vendedor.name];
  const rutaCodigo = vendedor.name.replace("RUTA ", "").trim();
  const esTabEspecial = tab === "dia" || tab === "mesa" || tab === "cuponera" || tab === "rally_otc" || tab === "avisos" || tab === "cargas" || tab === "unidades" || tab === "km" || tab === "facturas" || tab === "nomina" || tab === "sin_visita" || tab === "reloj_checador" || tab === "mi_fondo" || tab === "escalera" || tab === "cartera_vencida" || tab === "alta_cliente" || tab === "otc_ventas";
  const m = !esTabEspecial ? vendedor.tabs[tab] : null;
  const unit = OBJETIVO_TABS.find((t) => t.key === tab).unit;
  const chartData = unit === "units" ? vendedor.ventaPorDiaUnidades : vendedor.ventaPorDia;
  const chartKey = unit === "units" ? "paquetes" : "monto";
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 18px 60px", position: "relative", zIndex: 0 }}>
      <FondoDeFondo url={fondoUrl} />
      <TopBar
        title={vendedor.name}
        subtitle={`${nombre ? nombre + " · " : ""}Periodo ${periodo.inicio} → ${periodo.fin} · ${restantes} días hábiles restantes (Lun-Sáb)`}
        onLogout={onLogout}
        onRefresh={onRefresh}
        refrescando={refrescando}
      />

      <NeonObjetivoTabs
        tab={tab}
        setTab={setTab}
        tabs={OBJETIVO_TABS.filter((t) => {
          if (t.key === "km") return RUTAS_CON_KM.includes(vendedor.name);
          return !["tiempos", "rutas", "actividades_dia", "actividades_semana", "actividades_mes", "cotizador", "pwst", "tepic", "actividad", "creditos", "altas_cliente"].includes(t.key);
        })}
        estadoTabs={{
          rally_otc: (data.rallyOtcs || (data.rallyOtc?.nombre ? [data.rallyOtc] : [])).some((r) => r.activo) ? "parpadeo_verde" : undefined,
          avisos: hayAvisoNuevoPara(data, vendedor.name, vendedor.name) ? "aviso_nuevo" : undefined,
          unidades: !unidadYaRegistradaHoy(data, rutaCodigo) ? "pendiente_urgente" : undefined,
          facturas: hayObservacionFacturasPendiente ? "aviso_nuevo" : undefined,
          escalera: !data.escaleraProgreso?.[rutaCodigo]?.orden ? "aviso_nuevo" : undefined,
          cartera_vencida: hayCarteraVencidaPara(data, rutaCodigo) ? "pendiente_urgente" : undefined,
        }}
      />

      {tab === "dia" ? (
        <DiaKpis
          hoy={vendedor.hoy}
          mensajeDia={mensajeDia}
          rutaCodigo={rutaCodigo}
          esPeor={peorVendedorNombre === vendedor.name}
          esBottom3={(bottom3Nombres || []).includes(vendedor.name)}
        />
      ) : tab === "mesa" ? (
        <MesaControlView analisis={analizarMesaControl(mesaControl, vendedor.name)} nombreRuta={vendedor.name} nombreVendedor={nombre} vendedorStats={vendedor} resumenPedidos={calcularResumenPedidos(data.pedidosDia, vendedor.name)} visitasVsObjetivo={calcularVisitasVsObjetivo(data.pedidosDia, vendedor.name, data.objetivosVisitasDia, todayISO())} mesaControl={data.mesaControl || []} />
      ) : tab === "cuponera" ? (
        <CuponeraView data={data} persist={persist} persistFresco={persistFresco} puesto={null} rol="vendedor" rutaActual={vendedor.name} nombres={NOMBRES} />
      ) : tab === "rally_otc" ? (
        <RallyOtcView data={data} persist={persist} persistFresco={persistFresco} puesto={null} rol="vendedor" vendedorActual={vendedor.name} />
      ) : tab === "avisos" ? (
        <AvisosView data={data} persist={persist} persistFresco={persistFresco} puedeCrear={false} revisorNombre={null} verComoRuta={vendedor.name} viewerKey={vendedor.name} />
      ) : tab === "cargas" ? (
        <CargasView data={data} persist={persist} persistCargas={persistCargas} puesto={null} rol="vendedor" vendedorActual={vendedor.name} />
      ) : tab === "unidades" ? (
        <UnidadesView data={data} persistRevisionUnidad={persistRevisionUnidad} persistConfigUnidades={persistConfigUnidades} rol="vendedor" puesto={null} identidad={nombre || vendedor.name} rutaPropia={rutaCodigo} />
      ) : tab === "km" ? (
        <KmView data={data} persistRevisionUnidad={persistRevisionUnidad} rutaPropia={rutaCodigo} identidad={nombre || vendedor.name} />
      ) : tab === "facturas" ? (
        <FacturasView rol="vendedor" puesto={null} rutaActual={vendedor.name} identidad={nombre || vendedor.name} nombres={NOMBRES} vendedores={data.vendedores} />
      ) : tab === "nomina" ? (
        <NominaView data={data} persistFresco={persistFresco} rol="vendedor" puesto={null} identidad={nombre || vendedor.name} rutaPropia={rutaCodigo} />
      ) : tab === "sin_visita" ? (
        <SinVisitaView data={data} rol="vendedor" puesto={null} rutaPropia={rutaCodigo} persistFresco={persistFresco} />
      ) : tab === "reloj_checador" ? (
        <RelojChecadorView puedeSubir={false} rutaPropia={rutaCodigo} puedeVerBono={false} />
      ) : tab === "mi_fondo" ? (
        <PanelFondoPersonalizado identidad={vendedor.name} url={fondoUrl} setUrl={setFondoUrl} />
      ) : tab === "escalera" ? (
        <EscaleraView data={data} persistFresco={persistFresco} vendedor={vendedor} rutaPropia={rutaCodigo} />
      ) : tab === "cartera_vencida" ? (
        <CarteraVencidaView data={data} persistFresco={persistFresco} rol="vendedor" rutaPropia={rutaCodigo} identidad={nombre || vendedor.name} />
      ) : tab === "alta_cliente" ? (
        <AltaClienteView vendedorUsername={vendedor.name} rutaCodigo={rutaCodigo} />
      ) : tab === "otc_ventas" ? (
        <OtcVentasView data={data} persistFresco={persistFresco} rol="vendedor" rutaPropia={rutaCodigo} identidad={nombre || vendedor.name} />
      ) : !m ? (
        // Guardia de seguridad: si algún día se agrega una pestaña nueva a
        // OBJETIVO_TABS y se olvida agregarla a esTabEspecial arriba, esto
        // evita que truene toda la app.
        <div className="card" style={{ padding: 16, textAlign: "center", color: "#9AA7BD", fontSize: 13 }}>
          Esta pestaña ("{tab}") todavía no tiene una vista configurada aquí.
        </div>
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
