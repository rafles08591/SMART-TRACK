import React, { useState, useMemo } from "react";
import { UploadCloud, CheckCircle2, AlertCircle, Package, DollarSign, Percent, Target } from "lucide-react";
import { money } from "../utils";
import { KpiCard } from "./ui";
import {
  parseOtcRaw,
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

   - rol === "vendedor": solo ve su propia ruta (filtrado por rutaPropia),
     sin opción de cargar el archivo.
   - rol === "staff" (Supervisor-1 / Gerente): puede pegar el export OTC
     (semanal o del día — ambos vienen en el mismo formato), ve la tabla
     de TODAS las rutas y puede entrar al detalle de cualquiera.

   Los datos se guardan dentro del mismo blob `data` vía persistFresco:
     data.otcVentas = { registros: [...], cargadoEn }

   NOTA sobre la comisión: es automática según el objetivo OTC —
   $1,600 al día / $9,600 a la semana. Si la ruta cubre esa meta
   semanal, la comisión es del 7%; si no la cubre, es del 5.6%. No hay
   ningún % editable a mano.
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
          <span style={{ flex: 1, color: "#E8EDF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 6 }}>{f.articulo}</span>
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
          <span style={{ flex: 1, color: "#E8EDF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 6 }}>{f.vendedorNombre}</span>
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

export default function OtcVentasView({ data, persistFresco, rol, rutaPropia, identidad, revisorNombre }) {
  const [rawInput, setRawInput] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [status, setStatus] = useState("");
  const [modoStaff, setModoStaff] = useState("rutas"); // "rutas" | "productos"
  const [rutaStaffSeleccionada, setRutaStaffSeleccionada] = useState(null);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null); // {codigo, articulo}

  const registrosTodos = data?.otcVentas?.registros || [];
  const cargadoEn = data?.otcVentas?.cargadoEn;

  const resumenRutas = useMemo(() => resumenSemanaPorRuta(registrosTodos), [registrosTodos]);
  const resumenProductos = useMemo(() => detallePorProductoGlobal(registrosTodos), [registrosTodos]);
  const rutasDelProducto = useMemo(
    () => (productoSeleccionado ? ventasPorRutaDeProducto(registrosTodos, productoSeleccionado.codigo) : []),
    [registrosTodos, productoSeleccionado]
  );

  async function procesarYGuardar() {
    if (!rawInput.trim()) {
      setStatus("Pega primero el export de OTC.");
      setTimeout(() => setStatus(""), 3000);
      return;
    }
    setProcesando(true);
    try {
      const nuevos = parseOtcRaw(rawInput);
      if (nuevos.length === 0) {
        setStatus("No se reconoció ningún registro — revisa el formato.");
      } else {
        await persistFresco(() => ({
          otcVentas: { registros: nuevos, cargadoEn: new Date().toISOString() },
        }));
        setStatus(`Cargado — ${nuevos.length} registros procesados.`);
        setRawInput("");
      }
    } catch (e) {
      setStatus(`Error al procesar: ${e.message || e}`);
    } finally {
      setProcesando(false);
      setTimeout(() => setStatus(""), 4000);
    }
  }

  // ---------------------------------------------------------------------
  // Vista VENDEDOR — solo su ruta, sin carga de archivo.
  // ---------------------------------------------------------------------
  if (rol === "vendedor") {
    if (!cargadoEn) {
      return <div style={{ fontSize: 12.5, color: COLOR_MUTED, textAlign: "center", padding: 20 }}>Aún no se ha cargado la información de OTC.</div>;
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
  // Vista STAFF — carga + tabla de todas las rutas + detalle por ruta.
  // ---------------------------------------------------------------------
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ marginBottom: 10 }}>
          <div className="display" style={{ fontSize: 13, color: COLOR_MUTED }}>CARGAR VENTAS OTC (SEMANAL O DEL DÍA)</div>
          <div style={{ fontSize: 11, color: COLOR_MUTED, marginTop: 2 }}>
            Objetivo: $1,600/día · $9,600/semana — comisión 7% si se cubre, 5.6% si no (automático).
          </div>
        </div>
        <textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder="Pega aquí el export de OTC (Vendedor,Codigo,Articulo,Unidades,Unidades Vendidas,Unidades Devueltas,Total Unidades,Ventas $,Devoluciones $,TOTAL $,Fecha Venta)…"
          rows={5}
          style={{
            width: "100%", boxSizing: "border-box", borderRadius: 10, padding: 10, fontSize: 12,
            fontFamily: "monospace", background: "#0F172A", color: "#E8EDF5", border: `1px solid ${COLOR_BORDE}`, resize: "vertical",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <div style={{ fontSize: 11.5, color: COLOR_MUTED }}>
            {cargadoEn ? `Última carga: ${new Date(cargadoEn).toLocaleString("es-MX")}` : "Sin cargas todavía"}
          </div>
          <button onClick={procesarYGuardar} disabled={procesando} className="btn" style={{ display: "flex", alignItems: "center", gap: 6, opacity: procesando ? 0.6 : 1 }}>
            <UploadCloud size={15} /> {procesando ? "Procesando…" : "Procesar y guardar"}
          </button>
        </div>
        {status && <div style={{ fontSize: 12, color: status.startsWith("Error") ? COLOR_ROJO : COLOR_VERDE, marginTop: 8 }}>{status}</div>}
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
                      <div style={{ fontSize: 11.5, color: COLOR_MUTED }}>{g.vendedorNombre}</div>
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
            <div className="display" style={{ fontSize: 14, color: "#E8EDF5", marginBottom: 10 }}>{rutaStaffSeleccionada}</div>
            <RutaDetalle
              registros={registrosTodos}
              rutaCodigo={rutaStaffSeleccionada}
              vendedorNombre={resumenRutas.find((r) => r.rutaCodigo === rutaStaffSeleccionada)?.vendedorNombre}
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
              <div className="display" style={{ fontSize: 14, color: "#E8EDF5" }}>{productoSeleccionado.articulo}</div>
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
