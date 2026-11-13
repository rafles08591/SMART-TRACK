import React, { useState, useMemo } from "react";
import { AlertTriangle, Clock, CreditCard, UploadCloud, ChevronDown, ChevronUp } from "lucide-react";
import { money } from "../utils";
import { KpiCard } from "./ui";
import {
  parseCreditosRaw,
  resumenPorRuta,
  esVencido,
  esProximoAVencer,
  diasParaVencer,
  esDeEsteAno,
} from "../carteraVencidaParser";

/* =========================================================================
   CarteraVencidaView — alerta de créditos vencidos / próximos a vencer
   (cartera de cobranza, distinto del módulo de Créditos de Liquidación).

   - rol === "vendedor": solo ve su propia ruta (filtrado por rutaPropia),
     sin opción de cargar el archivo.
   - rol === "staff" (Supervisor-1 / Gerente): puede pegar el export de
     cartera, ve el resumen de TODAS las rutas y puede expandir cada una
     para ver el detalle de clientes.

   Los datos se guardan dentro del mismo blob `data` vía persistFresco,
   igual que Pedidos del Día / Cargas — no requiere tabla nueva en
   Supabase:
     data.carteraVencida = { registros: [...], cargadoEn, cargadoPor }

   INTEGRACIÓN EN VendorView.jsx (ya aplicado si usaste el diff que te
   pasé) y en StaffView.jsx (pendiente — agrega una pestaña "Créditos"
   que renderice <CarteraVencidaView data={data} persistFresco={persistFresco}
   rol="staff" revisorNombre={revisorNombre} /> igual que las demás pestañas).

   NOTA sobre "créditos hechos en Mesa de Control": no tengo el modelo
   de datos de mesaControl en este proyecto, así que el indicador
   "Créditos registrados" que ves aquí se calcula DESDE ESTE MISMO
   archivo de cartera (cuenta los documentos que no son Factura: Venta
   Credito + eOrdering Credito + Credito Adicional, por ruta). Si lo
   que necesitas es específicamente el conteo que ya lleva tu Mesa de
   Control (otra fuente), dime cómo se relacionan ambos datos y lo
   ajusto.
   ========================================================================= */

const COLOR_ROJO = "#FF6B6B";
const COLOR_AMBAR = "#F2B134";
const COLOR_VERDE = "#3DDC97";
const COLOR_MUTED = "#9AA7BD";
const COLOR_BORDE = "#2A3852";

function formatFecha(d) {
  if (!d) return "—";
  const fecha = d instanceof Date ? d : new Date(d);
  if (isNaN(fecha)) return "—";
  return fecha.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Badge({ children, color }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        padding: "3px 8px",
        borderRadius: 999,
        color,
        background: `${color}22`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function FilaRegistro({ r, hoy, diasUmbral = null, sinCliente = false }) {
  const vencido = esVencido(r);
  const dias = diasParaVencer(r.vence, hoy);
  // Con diasUmbral se distingue "Al corriente" (lista de créditos activos)
  const alCorriente = diasUmbral !== null && !vencido && !esProximoAVencer(r, diasUmbral, hoy);
  const color = vencido ? COLOR_ROJO : alCorriente ? COLOR_VERDE : COLOR_AMBAR;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 12px",
        borderRadius: 10,
        border: `1px solid ${COLOR_BORDE}`,
        marginBottom: 8,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#E7ECF7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sinCliente ? r.documento : r.clienteNombre}
        </div>
        <div style={{ fontSize: 11.5, color: COLOR_MUTED, marginTop: 2 }}>
          {sinCliente ? `Fecha ${formatFecha(r.fecha)}` : r.documento} · Vence {formatFecha(r.vence)}
          {dias === null ? "" : vencido || dias < 0 ? ` · vencido hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}` : ` · en ${dias} día${dias === 1 ? "" : "s"}`}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color }}>{money(r.saldo)}</div>
        <Badge color={color}>{vencido ? "Vencido" : alCorriente ? "Al corriente" : "Por vencer"}</Badge>
      </div>
    </div>
  );
}

// Al desplegar una ruta: TODOS sus créditos activos (con saldo), agrupados por
// cliente — vencidos, por vencer y al corriente.
function FilaRuta({ g, registros, diasUmbral, hoy, expandido, onToggle }) {
  const clientes = useMemo(() => {
    const m = {};
    for (const r of registros) {
      if (r.rutaCodigo !== g.rutaCodigo) continue;
      // créditos con saldo + cualquier documento vencido o por vencer
      if (!esCreditoActivo(r) && !esVencido(r) && !esProximoAVencer(r, diasUmbral, hoy)) continue;
      const k = r.clienteCodigo || r.clienteNombre;
      (m[k] ||= { clave: k, codigo: r.clienteCodigo, nombre: r.clienteNombre, docs: [] }).docs.push(r);
    }
    return Object.values(m)
      .map((c) => {
        const docs = [...c.docs].sort(ordenActivos);
        const saldo = docs.reduce((s, r) => s + r.saldo, 0);
        const vencidos = docs.filter(esVencido).length;
        const proximos = docs.filter((r) => !esVencido(r) && esProximoAVencer(r, diasUmbral, hoy)).length;
        return { ...c, docs, saldo, vencidos, proximos };
      })
      // primero los que tienen vencidos, luego por vencer, luego al corriente; dentro, mayor saldo
      .sort((a, b) => (b.vencidos > 0) - (a.vencidos > 0) || (b.proximos > 0) - (a.proximos > 0) || b.saldo - a.saldo);
  }, [registros, g.rutaCodigo, diasUmbral]);
  const activos = clientes.reduce((s, c) => s + c.docs.length, 0);
  const saldoActivo = clientes.reduce((s, c) => s + c.saldo, 0);

  return (
    <div className="card" style={{ padding: 0, marginBottom: 10, overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", color: "#E7ECF7",
        }}
      >
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{g.rutaCodigo}</div>
          <div style={{ fontSize: 11.5, color: COLOR_MUTED }}>{g.vendedorNombre}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {g.vencidos > 0 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLOR_ROJO }}>{g.vencidos}</div>
              <div style={{ fontSize: 9.5, color: COLOR_MUTED, textTransform: "uppercase" }}>vencidos</div>
            </div>
          )}
          {g.proximos > 0 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLOR_AMBAR }}>{g.proximos}</div>
              <div style={{ fontSize: 9.5, color: COLOR_MUTED, textTransform: "uppercase" }}>por vencer</div>
            </div>
          )}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLOR_VERDE }}>{activos}</div>
            <div style={{ fontSize: 9.5, color: COLOR_MUTED, textTransform: "uppercase" }}>activos</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#E7ECF7" }}>{g.creditosRegistrados}</div>
            <div style={{ fontSize: 9.5, color: COLOR_MUTED, textTransform: "uppercase" }}>créditos</div>
          </div>
          {expandido ? <ChevronUp size={16} color={COLOR_MUTED} /> : <ChevronDown size={16} color={COLOR_MUTED} />}
        </div>
      </button>
      {expandido && (
        <div style={{ padding: "0 14px 14px" }}>
          {clientes.length === 0 ? (
            <div style={{ fontSize: 12, color: COLOR_MUTED }}>Esta ruta no tiene créditos activos. 🎉</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: COLOR_MUTED, marginBottom: 10 }}>
                Créditos activos: <b style={{ color: "#E7ECF7" }}>{activos}</b> de{" "}
                <b style={{ color: "#E7ECF7" }}>{clientes.length} clientes</b> · saldo{" "}
                <b style={{ color: "#E7ECF7" }}>{money(saldoActivo)}</b>
              </div>
              {clientes.map((c) => {
                const color = c.vencidos ? COLOR_ROJO : c.proximos ? COLOR_AMBAR : COLOR_VERDE;
                return (
                  <div key={c.clave} style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#E7ECF7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</div>
                        <div style={{ fontSize: 11, color: COLOR_MUTED }}>
                          {c.codigo ? `${c.codigo} · ` : ""}{c.docs.length} crédito{c.docs.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="mono" style={{ fontSize: 14, fontWeight: 800, color, flexShrink: 0 }}>{money(c.saldo)}</div>
                    </div>
                    {c.docs.map((r, i) => <FilaRegistro key={i} r={r} hoy={hoy} diasUmbral={diasUmbral} sinCliente />)}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Créditos ACTIVOS = créditos (no Factura) que todavía tienen saldo.
// Se abre al presionar "Créditos registrados".
// ---------------------------------------------------------------------
const esCreditoActivo = (r) => r.tipoDocumento !== "Factura" && Number(r.saldo) > 0;

function contarActivos(lista, diasUmbral, hoy) {
  const g = { activos: 0, saldo: 0, clientes: new Set(), corriente: 0, corrienteSaldo: 0, proximos: 0, proximosSaldo: 0, vencidos: 0, vencidosSaldo: 0 };
  for (const r of lista) {
    g.activos += 1;
    g.saldo += r.saldo;
    g.clientes.add(r.clienteCodigo || r.clienteNombre);
    if (esVencido(r)) { g.vencidos += 1; g.vencidosSaldo += r.saldo; }
    else if (esProximoAVencer(r, diasUmbral, hoy)) { g.proximos += 1; g.proximosSaldo += r.saldo; }
    else { g.corriente += 1; g.corrienteSaldo += r.saldo; }
  }
  return { ...g, clientes: g.clientes.size };
}

const ordenActivos = (a, b) => {
  const pa = esVencido(a) ? 0 : 1, pb = esVencido(b) ? 0 : 1;
  return pa - pb || new Date(a.vence) - new Date(b.vence);
};

function Cifra({ n, saldo, label, color }) {
  return (
    <div style={{ flex: "1 1 110px", border: `1px solid ${COLOR_BORDE}`, borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, color: COLOR_MUTED, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div className="mono" style={{ fontSize: 16, fontWeight: 700, color }}>{n}</div>
      <div className="mono" style={{ fontSize: 11.5, color: COLOR_MUTED }}>{money(saldo)}</div>
    </div>
  );
}

function DetalleCreditosActivos({ registros, diasUmbral, hoy, porRuta, onCerrar }) {
  const [abierta, setAbierta] = useState(null);
  const activos = useMemo(() => registros.filter(esCreditoActivo).sort(ordenActivos), [registros]);
  const total = contarActivos(activos, diasUmbral, hoy);
  const rutas = useMemo(() => {
    const m = {};
    for (const r of activos) (m[r.rutaCodigo] ||= { rutaCodigo: r.rutaCodigo, vendedorNombre: r.vendedorNombre, lista: [] }).lista.push(r);
    return Object.values(m)
      .map((x) => ({ ...x, ...contarActivos(x.lista, diasUmbral, hoy) }))
      .sort((a, b) => a.rutaCodigo.localeCompare(b.rutaCodigo));
  }, [activos, diasUmbral]);

  return (
    <div className="card" style={{ padding: 16, borderColor: "#5AA9E6" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div className="display" style={{ fontSize: 13, color: "#5AA9E6" }}>CRÉDITOS ACTIVOS</div>
        <button onClick={onCerrar} style={{ background: "transparent", border: "none", color: COLOR_MUTED, cursor: "pointer", fontSize: 12 }}>Cerrar ✕</button>
      </div>
      <div style={{ fontSize: 12, color: COLOR_MUTED, marginBottom: 10 }}>
        Créditos que todavía tienen saldo por cobrar ·{" "}
        <b style={{ color: "#E7ECF7" }}>{total.activos} créditos</b> de <b style={{ color: "#E7ECF7" }}>{total.clientes} clientes</b> ·{" "}
        <b style={{ color: "#E7ECF7" }}>{money(total.saldo)}</b>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <Cifra label="Al corriente" n={total.corriente} saldo={total.corrienteSaldo} color={COLOR_VERDE} />
        <Cifra label={`Por vencer (${diasUmbral}d)`} n={total.proximos} saldo={total.proximosSaldo} color={COLOR_AMBAR} />
        <Cifra label="Vencidos" n={total.vencidos} saldo={total.vencidosSaldo} color={COLOR_ROJO} />
      </div>

      {total.activos === 0 && <div style={{ fontSize: 12.5, color: COLOR_MUTED }}>No hay créditos activos. 🎉</div>}

      {/* Vendedor: su lista directa */}
      {!porRuta && activos.map((r, i) => <FilaRegistro key={i} r={r} hoy={hoy} diasUmbral={diasUmbral} />)}

      {/* Staff: por ruta, se abre cada una */}
      {porRuta && rutas.map((g) => {
        const open = abierta === g.rutaCodigo;
        return (
          <div key={g.rutaCodigo} style={{ border: `1px solid ${COLOR_BORDE}`, borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
            <button
              onClick={() => setAbierta(open ? null : g.rutaCodigo)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer", color: "#E7ECF7" }}
            >
              <div style={{ textAlign: "left", minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{g.rutaCodigo}</div>
                <div style={{ fontSize: 11, color: COLOR_MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.vendedorNombre}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{g.activos} <span style={{ fontSize: 10, color: COLOR_MUTED, fontWeight: 500 }}>activos</span></div>
                  <div className="mono" style={{ fontSize: 11.5, color: COLOR_MUTED }}>{money(g.saldo)} · {g.clientes} clientes</div>
                </div>
                <div style={{ fontSize: 11, textAlign: "right", lineHeight: 1.4 }}>
                  <div style={{ color: COLOR_VERDE }}>{g.corriente} al corriente</div>
                  {g.proximos > 0 && <div style={{ color: COLOR_AMBAR }}>{g.proximos} por vencer</div>}
                  {g.vencidos > 0 && <div style={{ color: COLOR_ROJO }}>{g.vencidos} vencidos</div>}
                </div>
                {open ? <ChevronUp size={16} color={COLOR_MUTED} /> : <ChevronDown size={16} color={COLOR_MUTED} />}
              </div>
            </button>
            {open && (
              <div style={{ padding: "0 12px 8px" }}>
                {g.lista.map((r, i) => <FilaRegistro key={i} r={r} hoy={hoy} diasUmbral={diasUmbral} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CarteraVencidaView({ data, persistFresco, rol, puesto, rutaPropia, identidad, revisorNombre }) {
  // Acepta tanto `identidad` (VendorView) como `revisorNombre` (StaffView),
  // según quién lo esté invocando.
  identidad = identidad || revisorNombre;
  const [diasUmbral, setDiasUmbral] = useState(3);
  const [rawInput, setRawInput] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [status, setStatus] = useState("");
  const [rutaExpandida, setRutaExpandida] = useState(null);
  const [verActivos, setVerActivos] = useState(false);

  const hoy = new Date();
  const registrosTodos = (data?.carteraVencida?.registros || []).filter((r) => esDeEsteAno(r, hoy));
  const cargadoEn = data?.carteraVencida?.cargadoEn;

  const registros = rol === "vendedor" ? registrosTodos.filter((r) => r.rutaCodigo === rutaPropia) : registrosTodos;

  const resumen = useMemo(() => resumenPorRuta(registros, diasUmbral, hoy), [registros, diasUmbral]);

  const totales = useMemo(() => {
    let vencidos = 0, vencidosSaldo = 0, proximos = 0, proximosSaldo = 0, creditosRegistrados = 0;
    for (const g of resumen) {
      vencidos += g.vencidos;
      vencidosSaldo += g.vencidosSaldo;
      proximos += g.proximos;
      proximosSaldo += g.proximosSaldo;
      creditosRegistrados += g.creditosRegistrados;
    }
    return { vencidos, vencidosSaldo, proximos, proximosSaldo, creditosRegistrados };
  }, [resumen]);

  async function procesarYGuardar() {
    if (!rawInput.trim()) {
      setStatus("Pega primero el export de cartera.");
      setTimeout(() => setStatus(""), 3000);
      return;
    }
    setProcesando(true);
    try {
      const nuevosRegistros = parseCreditosRaw(rawInput);
      if (nuevosRegistros.length === 0) {
        setStatus("No se reconoció ningún registro — revisa que el formato coincida con el export.");
      } else {
        await persistFresco(() => ({
          carteraVencida: {
            registros: nuevosRegistros,
            cargadoEn: new Date().toISOString(),
            cargadoPor: identidad || "staff",
          },
        }));
        setStatus(`Cartera actualizada — ${nuevosRegistros.length} registros procesados.`);
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
    const misRegistros = registros
      .filter((r) => esVencido(r) || esProximoAVencer(r, diasUmbral, hoy))
      .sort((a, b) => (esVencido(a) === esVencido(b) ? new Date(a.vence) - new Date(b.vence) : esVencido(a) ? -1 : 1));

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <KpiCard icon={<AlertTriangle size={14} />} label="Créditos vencidos" value={`${totales.vencidos} · ${money(totales.vencidosSaldo)}`} accent={COLOR_ROJO} />
          <KpiCard icon={<Clock size={14} />} label={`Por vencer (${diasUmbral}d)`} value={`${totales.proximos} · ${money(totales.proximosSaldo)}`} accent={COLOR_AMBAR} />
          <KpiCard icon={<CreditCard size={14} />} label="Créditos registrados" value={totales.creditosRegistrados} onClick={() => setVerActivos((v) => !v)} activo={verActivos} />
        </div>

        {verActivos && (
          <DetalleCreditosActivos registros={registros} diasUmbral={diasUmbral} hoy={hoy} porRuta={false} onCerrar={() => setVerActivos(false)} />
        )}

        {!cargadoEn && (
          <div style={{ fontSize: 12.5, color: COLOR_MUTED }}>Aún no se ha cargado la cartera de créditos.</div>
        )}

        {cargadoEn && misRegistros.length === 0 && (
          <div className="card" style={{ padding: 16, textAlign: "center", fontSize: 13, color: COLOR_MUTED }}>
            Sin créditos vencidos ni próximos a vencer. 🎉
          </div>
        )}

        {misRegistros.map((r, i) => (
          <FilaRegistro key={i} r={r} hoy={hoy} />
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Vista STAFF (Supervisor-1 / Gerente) — carga + resumen de todas las rutas.
  // ---------------------------------------------------------------------
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <KpiCard icon={<AlertTriangle size={14} />} label="Créditos vencidos" value={`${totales.vencidos} · ${money(totales.vencidosSaldo)}`} accent={COLOR_ROJO} />
        <KpiCard icon={<Clock size={14} />} label={`Por vencer (${diasUmbral}d)`} value={`${totales.proximos} · ${money(totales.proximosSaldo)}`} accent={COLOR_AMBAR} />
        <KpiCard icon={<CreditCard size={14} />} label="Créditos registrados" value={totales.creditosRegistrados} onClick={() => setVerActivos((v) => !v)} activo={verActivos} />
      </div>

      {verActivos && (
        <DetalleCreditosActivos registros={registros} diasUmbral={diasUmbral} hoy={hoy} porRuta onCerrar={() => setVerActivos(false)} />
      )}

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div className="display" style={{ fontSize: 13, color: COLOR_MUTED }}>CARGAR CARTERA</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: COLOR_MUTED }}>
            Umbral "por vencer":
            <select
              value={diasUmbral}
              onChange={(e) => setDiasUmbral(Number(e.target.value))}
              style={{ background: "#0F172A", color: "#E7ECF7", border: `1px solid ${COLOR_BORDE}`, borderRadius: 8, padding: "4px 8px" }}
            >
              {[1, 2, 3, 5, 7].map((n) => (
                <option key={n} value={n}>{n} días</option>
              ))}
            </select>
          </div>
        </div>

        <textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder="Pega aquí el export de cartera (Agencia,Vendedor,Cliente,Nombre,Fecha,Hora,Vence,Documento,Estado,Importe,Cancelado,Saldo)…"
          rows={5}
          style={{
            width: "100%", boxSizing: "border-box", borderRadius: 10, padding: 10, fontSize: 12,
            fontFamily: "monospace", background: "#0F172A", color: "#E7ECF7", border: `1px solid ${COLOR_BORDE}`, resize: "vertical",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <div style={{ fontSize: 11.5, color: COLOR_MUTED }}>
            {cargadoEn ? `Última carga: ${new Date(cargadoEn).toLocaleString("es-MX")}` : "Sin cargas todavía"}
          </div>
          <button
            onClick={procesarYGuardar}
            disabled={procesando}
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 6, opacity: procesando ? 0.6 : 1 }}
          >
            <UploadCloud size={15} /> {procesando ? "Procesando…" : "Procesar y guardar"}
          </button>
        </div>
        {status && <div style={{ fontSize: 12, color: status.startsWith("Error") ? COLOR_ROJO : COLOR_VERDE, marginTop: 8 }}>{status}</div>}
      </div>

      <div>
        <div className="display" style={{ fontSize: 13, color: COLOR_MUTED, marginBottom: 10 }}>
          POR RUTA {resumen.length > 0 && `(${resumen.length})`}
        </div>
        {resumen.length === 0 ? (
          <div style={{ fontSize: 12.5, color: COLOR_MUTED }}>No hay datos de cartera cargados aún.</div>
        ) : (
          resumen.map((g) => (
            <FilaRuta
              key={g.rutaCodigo}
              g={g}
              registros={registros}
              diasUmbral={diasUmbral}
              hoy={hoy}
              expandido={rutaExpandida === g.rutaCodigo}
              onToggle={() => setRutaExpandida(rutaExpandida === g.rutaCodigo ? null : g.rutaCodigo)}
            />
          ))
        )}
      </div>
    </div>
  );
}
