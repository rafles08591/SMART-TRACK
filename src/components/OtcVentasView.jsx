import React, { useState, useMemo } from "react";
import { Package, DollarSign, Percent, Target, Plus, Trash2 } from "lucide-react";
import { money } from "../utils";
import { NOMBRES, RUTAS, CODIGOS_OTC_SIN_VUALA } from "../constants";
import { KpiCard } from "./ui";
import {
  adaptarOtcCargado,
  filtrarSemanaActual,
  filtrarHoy,
  diasDisponibles,
  detalleCodigosPorDia,
  detalleCodigosSemana,
  totalesRuta,
  resumenSemanaPorRuta,
  detallePorProductoGlobal,
  ventasPorRutaDeProducto,
  tasaComisionOtc,
  cubreObjetivoOtc,
  comisionOtc,
  aFecha,
  OBJETIVO_OTC_SEMANAL,
} from "../otcParser";

/* =========================================================================
   OtcVentasView — ventas OTC por ruta: detalle diario, resumen semanal con
   desglose de códigos, y comisión.

   Lee directo de data.otcSemanal (lo que ya llena el botón "OTC SEMANAL"
   en Cargar datos) — no tiene su propio cuadro de pegar texto, para no
   duplicar la carga de información que el Panel Staff ya hace.

   - rol === "vendedor": solo ve su propia ruta (filtrado por rutaPropia).
   - rol === "staff" (Supervisor-1 / Gerente): ve la tabla de TODAS las
     rutas y puede entrar al detalle de cualquiera, o ver el desglose por
     producto sumando todas las rutas.

   NOTA: data.otcSemanal solo trae { fecha, vendedor, monto, codigoArticulo,
   unidadesVendidas } — sin el nombre del artículo. Se muestra el código
   solo; si más adelante quieres el nombre también, se puede agregar en
   convertirFilasOtcDia() de App.tsx para que lo guarde también.

   NOTA sobre la comisión: es automática según el objetivo OTC —
   $1,600 al día / $9,600 a la semana. Si la ruta cubre esa meta
   semanal, la comisión es del 7%; si no la cubre, es del 5.6%. Esto es
   el mismo criterio que ya usa tasaComisionOtc en tu App.tsx.
   ========================================================================= */

const COLOR_ROJO = "#FF6B6B";
const COLOR_AMBAR = "#F2B134";
const COLOR_VERDE = "#3DDC97";
const COLOR_MUTED = "#9AA7BD";
const COLOR_BORDE = "#2A3852";

function formatDia(d) {
  if (!d) return "—";
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit" }).replace(".", "");
}

// `codigosSinVuala` es un Set combinado: la lista fija CODIGOS_OTC_SIN_VUALA
// + lo que el Gerente haya agregado desde el catálogo (data.otcSinVualaExtra).
// Se arma una sola vez en OtcVentasView y se pasa hacia abajo por props.
function esSinVuala(codigo, codigosSinVuala) {
  return codigosSinVuala.has(String(codigo || "").trim());
}

function TablaCodigos({ filas, mostrarRutas, onClickFila, codigosSinVuala }) {
  if (filas.length === 0) {
    return <div style={{ fontSize: 12.5, color: COLOR_MUTED, textAlign: "center", padding: 16 }}>Sin datos.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", fontSize: 10.5, color: COLOR_MUTED, textTransform: "uppercase", letterSpacing: "0.04em", padding: "0 4px" }}>
        <span style={{ flex: "0 0 62px" }}>Código</span>
        <span style={{ flex: 1 }}>Artículo</span>
        {mostrarRutas && <span style={{ flex: "0 0 46px", textAlign: "right" }}>Rutas</span>}
        <span style={{ flex: "0 0 56px", textAlign: "right" }}>Pz</span>
        <span style={{ flex: "0 0 78px", textAlign: "right" }}>$</span>
      </div>
      {filas.map((f) => {
        const sinVuala = esSinVuala(f.codigo, codigosSinVuala);
        return (
          <div
            key={f.codigo}
            onClick={onClickFila ? () => onClickFila(f) : undefined}
            style={{
              display: "flex", alignItems: "center", fontSize: 12.5, padding: "6px 4px", borderRadius: 8,
              background: "#0F172A", cursor: onClickFila ? "pointer" : "default",
              borderLeft: sinVuala ? `3px solid ${COLOR_VERDE}` : "3px solid transparent",
            }}
          >
            <span style={{ flex: "0 0 62px", color: COLOR_MUTED, fontFamily: "monospace" }}>{f.codigo}</span>
            <span style={{ flex: 1, overflow: "hidden", paddingRight: 6 }}>
              <div style={{ color: sinVuala ? COLOR_VERDE : "#E8EDF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.articulo || "—"}
              </div>
              <div style={{ fontSize: 10, color: sinVuala ? COLOR_VERDE : COLOR_MUTED, opacity: sinVuala ? 0.85 : 0.7 }}>
                {sinVuala ? "Sin Vuala" : "Vuala"}
              </div>
            </span>
            {mostrarRutas && <span style={{ flex: "0 0 46px", textAlign: "right", fontFamily: "monospace", color: COLOR_MUTED }}>{f.numRutas}</span>}
            <span style={{ flex: "0 0 56px", textAlign: "right", fontFamily: "monospace" }}>{f.piezas % 1 === 0 ? f.piezas : f.piezas.toFixed(1)}</span>
            <span style={{ flex: "0 0 78px", textAlign: "right", fontFamily: "monospace", color: COLOR_VERDE }}>{money(f.pesos)}</span>
          </div>
        );
      })}
    </div>
  );
}

function TablaRutasDeProducto({ filas }) {
  if (filas.length === 0) {
    return <div style={{ fontSize: 12.5, color: COLOR_MUTED, textAlign: "center", padding: 16 }}>Sin datos.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", fontSize: 10.5, color: COLOR_MUTED, textTransform: "uppercase", letterSpacing: "0.04em", padding: "0 4px" }}>
        <span style={{ flex: "0 0 60px" }}>Ruta</span>
        <span style={{ flex: 1 }}>Vendedor</span>
        <span style={{ flex: "0 0 56px", textAlign: "right" }}>Pz</span>
        <span style={{ flex: "0 0 78px", textAlign: "right" }}>$</span>
      </div>
      {filas.map((f) => (
        <div key={f.rutaCodigo} style={{ display: "flex", alignItems: "center", fontSize: 12.5, padding: "6px 4px", borderRadius: 8, background: "#0F172A" }}>
          <span style={{ flex: "0 0 60px", color: COLOR_MUTED, fontFamily: "monospace" }}>{f.rutaCodigo}</span>
          <span style={{ flex: 1, color: "#E8EDF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 6 }}>{NOMBRES[`RUTA ${f.rutaCodigo}`] || "—"}</span>
          <span style={{ flex: "0 0 56px", textAlign: "right", fontFamily: "monospace" }}>{f.piezas % 1 === 0 ? f.piezas : f.piezas.toFixed(1)}</span>
          <span style={{ flex: "0 0 78px", textAlign: "right", fontFamily: "monospace", color: COLOR_VERDE }}>{money(f.pesos)}</span>
        </div>
      ))}
    </div>
  );
}

function RutaDetalle({ registros, rutaCodigo, vendedorNombre, codigosSinVuala }) {
  const dias = useMemo(() => diasDisponibles(registros, rutaCodigo), [registros, rutaCodigo]);
  const [vista, setVista] = useState("semana"); // "semana" | ISO date string del día
  const totales = useMemo(() => totalesRuta(registros, rutaCodigo), [registros, rutaCodigo]);
  const cubre = cubreObjetivoOtc(totales.pesos);
  const tasa = tasaComisionOtc(totales.pesos);
  const comision = comisionOtc(totales.pesos);

  const filas = useMemo(() => {
    if (vista === "semana") return detalleCodigosSemana(registros, rutaCodigo);
    const dia = dias.find((d) => d.toISOString().slice(0, 10) === vista);
    return dia ? detalleCodigosPorDia(registros, rutaCodigo, dia) : [];
  }, [registros, rutaCodigo, vista, dias]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <KpiCard icon={<Package size={14} />} label="Piezas (semana)" value={totales.piezas % 1 === 0 ? totales.piezas : totales.piezas.toFixed(1)} />
        <KpiCard icon={<DollarSign size={14} />} label="Total (semana)" value={money(totales.pesos)} accent={COLOR_VERDE} />
        <KpiCard icon={<Percent size={14} />} label={`Comisión (${(tasa * 100).toFixed(1)}%)`} value={money(comision)} accent={COLOR_AMBAR} />
        <KpiCard
          icon={<Target size={14} />}
          label={`Objetivo semanal (${money(OBJETIVO_OTC_SEMANAL)})`}
          value={cubre ? "Cubierto ✅" : `Faltan ${money(Math.max(0, OBJETIVO_OTC_SEMANAL - totales.pesos))}`}
          accent={cubre ? COLOR_VERDE : COLOR_ROJO}
        />
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          onClick={() => setVista("semana")}
          className={vista === "semana" ? "btn" : "btn-ghost"}
          style={{ fontSize: 12.5, padding: "6px 12px" }}
        >
          Semana completa
        </button>
        {dias.map((d) => {
          const key = d.toISOString().slice(0, 10);
          return (
            <button
              key={key}
              onClick={() => setVista(key)}
              className={vista === key ? "btn" : "btn-ghost"}
              style={{ fontSize: 12.5, padding: "6px 12px" }}
            >
              {formatDia(d)}
            </button>
          );
        })}
      </div>

      <div className="card" style={{ padding: 12 }}>
        <TablaCodigos filas={filas} codigosSinVuala={codigosSinVuala} />
      </div>
    </div>
  );
}

// Detalle de "Hoy" para una sola ruta — se alimenta directo de OTC DEL
// DÍA (no de OTC SEMANAL), a diferencia de todo lo demás en este módulo.
function DetalleHoyRuta({ registrosHoy, rutaCodigo, mostrarEncabezado, codigosSinVuala }) {
  const filas = useMemo(() => detalleCodigosSemana(registrosHoy, rutaCodigo), [registrosHoy, rutaCodigo]);
  const totales = useMemo(() => totalesRuta(registrosHoy, rutaCodigo), [registrosHoy, rutaCodigo]);

  if (filas.length === 0) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      {mostrarEncabezado && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "#E8EDF5" }}>{rutaCodigo}</span>
            <span style={{ fontSize: 12, color: COLOR_MUTED, marginLeft: 8 }}>{NOMBRES[`RUTA ${rutaCodigo}`] || ""}</span>
          </div>
          <div style={{ fontSize: 12, color: COLOR_MUTED }}>
            {totales.piezas % 1 === 0 ? totales.piezas : totales.piezas.toFixed(1)} pz · <span style={{ color: COLOR_VERDE }}>{money(totales.pesos)}</span>
          </div>
        </div>
      )}
      <div className="card" style={{ padding: 12 }}>
        <TablaCodigos filas={filas} codigosSinVuala={codigosSinVuala} />
      </div>
    </div>
  );
}

// =========================================================================
// CatalogoSinVualaPanel — apartado solo para el Gerente: agregar o quitar
// códigos de producto que cuentan como "Sin Vuala", sin tocar código ni
// hacer commit cada vez que sale un producto nuevo.
//
// Se guarda en data.otcSinVualaExtra (array de { codigo, articulo }), que
// se COMBINA en tiempo real con la lista fija CODIGOS_OTC_SIN_VUALA de
// constants.js — esa lista fija no se toca, solo se le suma lo que el
// Gerente agregue aquí.
// =========================================================================
function CatalogoSinVualaPanel({ data, persistFresco }) {
  const [codigoNuevo, setCodigoNuevo] = useState("");
  const [articuloNuevo, setArticuloNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const extra = data?.otcSinVualaExtra || [];

  function agregar() {
    const codigo = codigoNuevo.trim();
    if (!codigo) return;
    if (CODIGOS_OTC_SIN_VUALA.includes(codigo) || extra.some((e) => e.codigo === codigo)) {
      alert(`El código ${codigo} ya está catalogado como Sin Vuala.`);
      return;
    }
    setGuardando(true);
    persistFresco((fresca) => ({
      otcSinVualaExtra: [...(fresca.otcSinVualaExtra || []), { codigo, articulo: articuloNuevo.trim() || null }],
    }));
    setCodigoNuevo("");
    setArticuloNuevo("");
    setGuardando(false);
  }

  function quitar(codigo) {
    persistFresco((fresca) => ({
      otcSinVualaExtra: (fresca.otcSinVualaExtra || []).filter((e) => e.codigo !== codigo),
    }));
  }

  return (
    <div>
      <div className="display" style={{ fontSize: 13, color: COLOR_MUTED, marginBottom: 4 }}>
        CATÁLOGO · CÓDIGOS SIN VUALA
      </div>
      <div style={{ fontSize: 11, color: COLOR_MUTED, marginBottom: 14 }}>
        Agrega aquí los códigos de producto nuevos que deban contar como "Sin Vuala" en OTC — se reflejan al instante en toda la app, para todas las rutas, sin necesidad de subir código nuevo.
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            value={codigoNuevo}
            onChange={(e) => setCodigoNuevo(e.target.value)}
            placeholder="Código (ej. 0360)"
            style={{ flex: "1 1 140px", padding: "9px 10px", borderRadius: 8, border: `1px solid ${COLOR_BORDE}`, background: "#0F172A", color: "#E8EDF5", fontSize: 13, fontFamily: "monospace" }}
          />
          <input
            type="text"
            value={articuloNuevo}
            onChange={(e) => setArticuloNuevo(e.target.value)}
            placeholder="Nombre del artículo (opcional, ej. CP11D24+EXIS20)"
            style={{ flex: "2 1 220px", padding: "9px 10px", borderRadius: 8, border: `1px solid ${COLOR_BORDE}`, background: "#0F172A", color: "#E8EDF5", fontSize: 13 }}
          />
          <button
            onClick={agregar}
            disabled={!codigoNuevo.trim() || guardando}
            className="btn"
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, opacity: !codigoNuevo.trim() || guardando ? 0.5 : 1 }}
          >
            <Plus size={14} /> Agregar
          </button>
        </div>
      </div>

      <div className="display" style={{ fontSize: 12, color: COLOR_MUTED, marginBottom: 8 }}>
        AGREGADOS POR TI {extra.length > 0 && `(${extra.length})`}
      </div>
      {extra.length === 0 ? (
        <div style={{ fontSize: 12.5, color: COLOR_MUTED, textAlign: "center", padding: 16 }}>
          Aún no has agregado ningún código adicional.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          {extra.map((e) => (
            <div
              key={e.codigo}
              style={{ display: "flex", alignItems: "center", fontSize: 12.5, padding: "8px 10px", borderRadius: 8, background: "#0F172A", borderLeft: `3px solid ${COLOR_VERDE}` }}
            >
              <span style={{ flex: "0 0 70px", color: COLOR_MUTED, fontFamily: "monospace" }}>{e.codigo}</span>
              <span style={{ flex: 1, color: "#E8EDF5" }}>{e.articulo || "—"}</span>
              <button
                onClick={() => quitar(e.codigo)}
                title="Quitar de Sin Vuala"
                style={{ background: "none", border: "none", color: COLOR_ROJO, cursor: "pointer", display: "flex", alignItems: "center", padding: 4 }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="display" style={{ fontSize: 12, color: COLOR_MUTED, marginBottom: 8 }}>
        LISTA FIJA (de constants.js — {CODIGOS_OTC_SIN_VUALA.length})
      </div>
      <div style={{ fontSize: 11.5, color: COLOR_MUTED, lineHeight: 1.7, fontFamily: "monospace" }}>
        {CODIGOS_OTC_SIN_VUALA.join(", ")}
      </div>
    </div>
  );
}

export default function OtcVentasView({ data, rol, rutaPropia, identidad, persistFresco, puesto }) {
  const [modoStaff, setModoStaff] = useState("rutas"); // "rutas" | "productos" | "hoy" | "catalogo"
  const [rutaStaffSeleccionada, setRutaStaffSeleccionada] = useState(null);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null); // {codigo, articulo}
  const [vistaProductos, setVistaProductos] = useState("semana"); // "semana" | ISO date string del día
  const [modoVendedor, setModoVendedor] = useState("semana"); // "semana" | "hoy" — solo para rol vendedor

  // Combina la lista fija de constants.js con lo que el Gerente haya
  // agregado desde el catálogo — se recalcula solo si cambia lo agregado.
  const codigosSinVuala = useMemo(
    () => new Set([...CODIGOS_OTC_SIN_VUALA, ...(data?.otcSinVualaExtra || []).map((e) => e.codigo)]),
    [data?.otcSinVualaExtra]
  );

  // Fuente de datos: lo que ya carga el botón "OTC SEMANAL" (y, como
  // respaldo por si esa semana no se ha vuelto a subir, se completa con
  // "OTC DEL DÍA") en la pestaña "Cargar datos" del Panel Staff — no hay
  // cuadro de pegar texto propio aquí, para no duplicar esa carga.
  //
  // OJO: data.otcDia se acumula a propósito día tras día (sin borrar los
  // anteriores) porque el Rally OTC de varios días lo necesita completo —
  // eso está bien y no se toca. Pero cuando este módulo lo usa como
  // respaldo, se filtra solo a la semana en curso (lunes-sábado), para no
  // mezclar semanas viejas en este resumen.
  const registrosTodos = useMemo(() => {
    const semanal = adaptarOtcCargado(data?.otcSemanal);
    const base = semanal.length > 0 ? semanal : filtrarSemanaActual(adaptarOtcCargado(data?.otcDia));
    // El export de OTC trae rutas de TODA la distribuidora (JMD completo),
    // no solo el equipo de este Gerente — aquí se filtra solo a las rutas
    // propias (J201-J207, lo mismo que ya usa RUTAS en constants.js).
    return base.filter((r) => RUTAS.includes(r.rutaCompleta));
  }, [data?.otcSemanal, data?.otcDia]);

  // Para las pestañas de día en "Por producto" — a diferencia de
  // registrosTodos (que prioriza OTC SEMANAL), este SIEMPRE se alimenta
  // de OTC DEL DÍA, que es el feed que de verdad se actualiza a diario.
  const registrosPorDia = useMemo(() => {
    return filtrarSemanaActual(adaptarOtcCargado(data?.otcDia)).filter((r) => RUTAS.includes(r.rutaCompleta));
  }, [data?.otcDia]);
  const diasProductos = useMemo(() => diasDisponibles(registrosPorDia), [registrosPorDia]);

  // Para la pestaña "Hoy" — SIEMPRE OTC DEL DÍA, filtrado al día calendario
  // actual (no a la semana), con nombres y marcado de sin Vuala.
  const registrosHoy = useMemo(() => {
    return filtrarHoy(adaptarOtcCargado(data?.otcDia)).filter((r) => RUTAS.includes(r.rutaCompleta));
  }, [data?.otcDia]);
  const rutasConVentaHoy = useMemo(
    () => Array.from(new Set(registrosHoy.map((r) => r.rutaCodigo))).sort(),
    [registrosHoy]
  );

  const hayDatos = registrosTodos.length > 0;

  const resumenRutas = useMemo(() => resumenSemanaPorRuta(registrosTodos), [registrosTodos]);
  const resumenProductos = useMemo(() => {
    if (vistaProductos === "semana") return detallePorProductoGlobal(registrosTodos);
    const dia = diasProductos.find((d) => d.toISOString().slice(0, 10) === vistaProductos);
    if (!dia) return [];
    const filtrados = registrosPorDia.filter((r) => {
      const f = aFecha(r.fecha);
      return f && f.toDateString() === dia.toDateString();
    });
    return detallePorProductoGlobal(filtrados);
  }, [registrosTodos, registrosPorDia, vistaProductos, diasProductos]);
  const rutasDelProducto = useMemo(
    () => (productoSeleccionado ? ventasPorRutaDeProducto(registrosTodos, productoSeleccionado.codigo) : []),
    [registrosTodos, productoSeleccionado]
  );

  // ---------------------------------------------------------------------
  // Vista VENDEDOR — solo su ruta.
  // ---------------------------------------------------------------------
  if (rol === "vendedor") {
    if (!hayDatos && registrosHoy.length === 0) {
      return <div style={{ fontSize: 12.5, color: COLOR_MUTED, textAlign: "center", padding: 20 }}>Aún no se ha cargado la información de OTC de esta semana.</div>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setModoVendedor("semana")}
            className={modoVendedor === "semana" ? "btn" : "btn-ghost"}
            style={{ fontSize: 13, flex: 1 }}
          >
            Semana
          </button>
          <button
            onClick={() => setModoVendedor("hoy")}
            className={modoVendedor === "hoy" ? "btn" : "btn-ghost"}
            style={{ fontSize: 13, flex: 1 }}
          >
            Hoy
          </button>
        </div>
        {modoVendedor === "semana" ? (
          hayDatos ? (
            <RutaDetalle registros={registrosTodos} rutaCodigo={rutaPropia} vendedorNombre={identidad} codigosSinVuala={codigosSinVuala} />
          ) : (
            <div style={{ fontSize: 12.5, color: COLOR_MUTED, textAlign: "center", padding: 20 }}>Aún no se ha cargado la información de OTC de esta semana.</div>
          )
        ) : (
          <DetalleHoyRuta registrosHoy={registrosHoy} rutaCodigo={rutaPropia} mostrarEncabezado={false} codigosSinVuala={codigosSinVuala} />
        )}
        {modoVendedor === "hoy" && registrosHoy.filter((r) => r.rutaCodigo === rutaPropia).length === 0 && (
          <div style={{ fontSize: 12.5, color: COLOR_MUTED, textAlign: "center", padding: 20 }}>Aún no hay ventas de OTC cargadas para hoy.</div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Vista STAFF — tabla de todas las rutas + detalle por ruta o producto.
  // ---------------------------------------------------------------------
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <div className="display" style={{ fontSize: 13, color: COLOR_MUTED }}>OTC — VENTAS</div>
        <div style={{ fontSize: 11, color: COLOR_MUTED, marginTop: 2 }}>
          Objetivo: $1,600/día · $9,600/semana — comisión 7% si se cubre, 5.6% si no (automático). Datos tomados de "OTC SEMANAL" en Cargar datos.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => { setModoStaff("rutas"); setProductoSeleccionado(null); }}
          className={modoStaff === "rutas" ? "btn" : "btn-ghost"}
          style={{ fontSize: 13, flex: 1 }}
        >
          Por ruta
        </button>
        <button
          onClick={() => { setModoStaff("productos"); setRutaStaffSeleccionada(null); }}
          className={modoStaff === "productos" ? "btn" : "btn-ghost"}
          style={{ fontSize: 13, flex: 1 }}
        >
          Por producto
        </button>
        <button
          onClick={() => { setModoStaff("hoy"); setRutaStaffSeleccionada(null); setProductoSeleccionado(null); }}
          className={modoStaff === "hoy" ? "btn" : "btn-ghost"}
          style={{ fontSize: 13, flex: 1 }}
        >
          Hoy
        </button>
        {puesto === "gerente" && (
          <button
            onClick={() => { setModoStaff("catalogo"); setRutaStaffSeleccionada(null); setProductoSeleccionado(null); }}
            className={modoStaff === "catalogo" ? "btn" : "btn-ghost"}
            style={{ fontSize: 13, flex: 1 }}
          >
            Catálogo
          </button>
        )}
      </div>

      {modoStaff === "catalogo" && puesto === "gerente" && (
        <CatalogoSinVualaPanel data={data} persistFresco={persistFresco} />
      )}

      {modoStaff === "hoy" && (
        <div>
          <div className="display" style={{ fontSize: 13, color: COLOR_MUTED, marginBottom: 4 }}>
            DETALLE DE HOY POR VENDEDOR
          </div>
          <div style={{ fontSize: 11, color: COLOR_MUTED, marginBottom: 10 }}>
            Se alimenta de OTC DEL DÍA — solo lo vendido en la fecha de hoy.
          </div>
          {rutasConVentaHoy.length === 0 ? (
            <div className="card" style={{ padding: 16, textAlign: "center", fontSize: 13, color: COLOR_MUTED }}>
              Aún no hay ventas de OTC cargadas para hoy.
            </div>
          ) : (
            rutasConVentaHoy.map((rc) => (
              <DetalleHoyRuta key={rc} registrosHoy={registrosHoy} rutaCodigo={rc} mostrarEncabezado codigosSinVuala={codigosSinVuala} />
            ))
          )}
        </div>
      )}

      {modoStaff === "rutas" && (
        !rutaStaffSeleccionada ? (
          <div>
            <div className="display" style={{ fontSize: 13, color: COLOR_MUTED, marginBottom: 10 }}>
              TODAS LAS RUTAS {resumenRutas.length > 0 && `(${resumenRutas.length})`}
            </div>
            {resumenRutas.length === 0 ? (
              <div style={{ fontSize: 12.5, color: COLOR_MUTED }}>No hay datos de OTC cargados aún.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {resumenRutas.map((g) => (
                  <button
                    key={g.rutaCodigo}
                    onClick={() => setRutaStaffSeleccionada(g.rutaCodigo)}
                    className="card"
                    style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", cursor: "pointer", border: "none" }}
                  >
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "#E8EDF5" }}>{g.rutaCodigo}</div>
                      <div style={{ fontSize: 11.5, color: COLOR_MUTED }}>{NOMBRES[`RUTA ${g.rutaCodigo}`] || g.rutaCodigo}</div>
                    </div>
                    <div style={{ display: "flex", gap: 16, textAlign: "right" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{g.piezas % 1 === 0 ? g.piezas : g.piezas.toFixed(1)}</div>
                        <div style={{ fontSize: 9.5, color: COLOR_MUTED, textTransform: "uppercase" }}>piezas</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: COLOR_VERDE }}>{money(g.pesos)}</div>
                        <div style={{ fontSize: 9.5, color: COLOR_MUTED, textTransform: "uppercase" }}>total</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: COLOR_AMBAR }}>{money(g.comision)}</div>
                        <div style={{ fontSize: 9.5, color: COLOR_MUTED, textTransform: "uppercase" }}>comisión</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <button onClick={() => setRutaStaffSeleccionada(null)} className="btn-ghost" style={{ fontSize: 12.5, marginBottom: 10 }}>
              ← Volver a todas las rutas
            </button>
            <div className="display" style={{ fontSize: 14, color: "#E8EDF5", marginBottom: 10 }}>
              {rutaStaffSeleccionada} — {NOMBRES[`RUTA ${rutaStaffSeleccionada}`] || ""}
            </div>
            <RutaDetalle
              registros={registrosTodos}
              rutaCodigo={rutaStaffSeleccionada}
              codigosSinVuala={codigosSinVuala}
            />
          </div>
        )
      )}

      {modoStaff === "productos" && (
        !productoSeleccionado ? (
          <div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              <button
                onClick={() => setVistaProductos("semana")}
                className={vistaProductos === "semana" ? "btn" : "btn-ghost"}
                style={{ fontSize: 12.5, padding: "6px 12px" }}
              >
                Semana completa
              </button>
              {diasProductos.map((d) => {
                const key = d.toISOString().slice(0, 10);
                return (
                  <button
                    key={key}
                    onClick={() => setVistaProductos(key)}
                    className={vistaProductos === key ? "btn" : "btn-ghost"}
                    style={{ fontSize: 12.5, padding: "6px 12px" }}
                  >
                    {formatDia(d)}
                  </button>
                );
              })}
            </div>
            <div className="display" style={{ fontSize: 13, color: COLOR_MUTED, marginBottom: 10 }}>
              {vistaProductos === "semana" ? "TODOS LOS PRODUCTOS" : `PRODUCTOS DEL ${formatDia(diasProductos.find((d) => d.toISOString().slice(0, 10) === vistaProductos)).toUpperCase()}`}
              {resumenProductos.length > 0 && ` (${resumenProductos.length})`}
            </div>
            <div style={{ fontSize: 11, color: COLOR_MUTED, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: COLOR_VERDE }} /> Sin Vuala
              <span style={{ marginLeft: 10, display: "inline-block", width: 10, height: 10, borderRadius: 3, background: COLOR_MUTED, opacity: 0.4 }} /> Vuala
            </div>
            <div className="card" style={{ padding: 12 }}>
              <TablaCodigos filas={resumenProductos} mostrarRutas onClickFila={(f) => setProductoSeleccionado(f)} codigosSinVuala={codigosSinVuala} />
            </div>
          </div>
        ) : (
          <div>
            <button onClick={() => setProductoSeleccionado(null)} className="btn-ghost" style={{ fontSize: 12.5, marginBottom: 10 }}>
              ← Volver a todos los productos
            </button>
            <div style={{ marginBottom: 10 }}>
              <div className="display" style={{ fontSize: 14, color: "#E8EDF5" }}>{productoSeleccionado.articulo || `Código ${productoSeleccionado.codigo}`}</div>
              <div style={{ fontSize: 11.5, color: COLOR_MUTED, fontFamily: "monospace" }}>Código {productoSeleccionado.codigo}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <KpiCard icon={<Package size={14} />} label="Piezas totales" value={productoSeleccionado.piezas % 1 === 0 ? productoSeleccionado.piezas : productoSeleccionado.piezas.toFixed(1)} />
              <KpiCard icon={<DollarSign size={14} />} label="Total en pesos" value={money(productoSeleccionado.pesos)} accent={COLOR_VERDE} />
            </div>
            <div className="display" style={{ fontSize: 12, color: COLOR_MUTED, marginBottom: 8 }}>VENTAS POR RUTA</div>
            <div className="card" style={{ padding: 12 }}>
              <TablaRutasDeProducto filas={rutasDelProducto} />
            </div>
          </div>
        )
      )}
    </div>
  );
}
