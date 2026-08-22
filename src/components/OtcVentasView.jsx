import React, { useState, useMemo } from "react";
import { Package, DollarSign, Percent, Target } from "lucide-react";
import { money } from "../utils";
import { NOMBRES } from "../constants";
import { KpiCard } from "./ui";
import {
  adaptarOtcCargado,
  filtrarSemanaActual,
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

function TablaCodigos({ filas, mostrarRutas, onClickFila }) {
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
      {filas.map((f) => (
        <div
          key={f.codigo}
          onClick={onClickFila ? () => onClickFila(f) : undefined}
          style={{
            display: "flex", alignItems: "center", fontSize: 12.5, padding: "6px 4px", borderRadius: 8,
            background: "#0F172A", cursor: onClickFila ? "pointer" : "default",
          }}
        >
          <span style={{ flex: "0 0 62px", color: COLOR_MUTED, fontFamily: "monospace" }}>{f.codigo}</span>
          <span style={{ flex: 1, color: "#E8EDF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 6 }}>{f.articulo || "—"}</span>
          {mostrarRutas && <span style={{ flex: "0 0 46px", textAlign: "right", fontFamily: "monospace", color: COLOR_MUTED }}>{f.numRutas}</span>}
          <span style={{ flex: "0 0 56px", textAlign: "right", fontFamily: "monospace" }}>{f.piezas % 1 === 0 ? f.piezas : f.piezas.toFixed(1)}</span>
          <span style={{ flex: "0 0 78px", textAlign: "right", fontFamily: "monospace", color: COLOR_VERDE }}>{money(f.pesos)}</span>
        </div>
      ))}
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

function RutaDetalle({ registros, rutaCodigo, vendedorNombre }) {
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
        <TablaCodigos filas={filas} />
      </div>
    </div>
  );
}

export default function OtcVentasView({ data, rol, rutaPropia, identidad }) {
  const [modoStaff, setModoStaff] = useState("rutas"); // "rutas" | "productos"
  const [rutaStaffSeleccionada, setRutaStaffSeleccionada] = useState(null);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null); // {codigo, articulo}

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
    if (semanal.length > 0) return semanal;
    return filtrarSemanaActual(adaptarOtcCargado(data?.otcDia));
  }, [data?.otcSemanal, data?.otcDia]);

  const hayDatos = registrosTodos.length > 0;

  const resumenRutas = useMemo(() => resumenSemanaPorRuta(registrosTodos), [registrosTodos]);
  const resumenProductos = useMemo(() => detallePorProductoGlobal(registrosTodos), [registrosTodos]);
  const rutasDelProducto = useMemo(
    () => (productoSeleccionado ? ventasPorRutaDeProducto(registrosTodos, productoSeleccionado.codigo) : []),
    [registrosTodos, productoSeleccionado]
  );

  // ---------------------------------------------------------------------
  // Vista VENDEDOR — solo su ruta.
  // ---------------------------------------------------------------------
  if (rol === "vendedor") {
    if (!hayDatos) {
      return <div style={{ fontSize: 12.5, color: COLOR_MUTED, textAlign: "center", padding: 20 }}>Aún no se ha cargado la información de OTC de esta semana.</div>;
    }
    return (
      <RutaDetalle
        registros={registrosTodos}
        rutaCodigo={rutaPropia}
        vendedorNombre={identidad}
      />
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
      </div>

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
            />
          </div>
        )
      )}

      {modoStaff === "productos" && (
        !productoSeleccionado ? (
          <div>
            <div className="display" style={{ fontSize: 13, color: COLOR_MUTED, marginBottom: 10 }}>
              TODOS LOS PRODUCTOS {resumenProductos.length > 0 && `(${resumenProductos.length})`}
            </div>
            <div className="card" style={{ padding: 12 }}>
              <TablaCodigos filas={resumenProductos} mostrarRutas onClickFila={(f) => setProductoSeleccionado(f)} />
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
