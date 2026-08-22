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
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
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

function FilaRegistro({ r, hoy }) {
  const vencido = esVencido(r);
  const dias = diasParaVencer(r.vence, hoy);
  const color = vencido ? COLOR_ROJO : COLOR_AMBAR;
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
          {r.clienteNombre}
        </div>
        <div style={{ fontSize: 11.5, color: COLOR_MUTED, marginTop: 2 }}>
          {r.documento} · Vence {formatFecha(r.vence)}
          {vencido ? ` · vencido hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}` : ` · en ${dias} día${dias === 1 ? "" : "s"}`}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color }}>{money(r.saldo)}</div>
        <Badge color={color}>{vencido ? "Vencido" : "Por vencer"}</Badge>
      </div>
    </div>
  );
}

function FilaRuta({ g, registros, diasUmbral, hoy, expandido, onToggle }) {
  const detalle = registros
    .filter((r) => r.rutaCodigo === g.rutaCodigo && (esVencido(r) || esProximoAVencer(r, diasUmbral, hoy)))
    .sort((a, b) => (esVencido(a) === esVencido(b) ? a.vence - b.vence : esVencido(a) ? -1 : 1));

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
            <div style={{ fontSize: 13, fontWeight: 700, color: "#E7ECF7" }}>{g.creditosRegistrados}</div>
            <div style={{ fontSize: 9.5, color: COLOR_MUTED, textTransform: "uppercase" }}>créditos</div>
          </div>
          {expandido ? <ChevronUp size={16} color={COLOR_MUTED} /> : <ChevronDown size={16} color={COLOR_MUTED} />}
        </div>
      </button>
      {expandido && (
        <div style={{ padding: "0 14px 14px" }}>
          {detalle.length === 0 ? (
            <div style={{ fontSize: 12, color: COLOR_MUTED }}>Sin vencidos ni próximos a vencer en esta ruta.</div>
          ) : (
            detalle.map((r, i) => <FilaRegistro key={i} r={r} hoy={hoy} />)
          )}
        </div>
      )}
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

  const hoy = new Date();
  const registrosTodos = data?.carteraVencida?.registros || [];
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
      .sort((a, b) => (esVencido(a) === esVencido(b) ? a.vence - b.vence : esVencido(a) ? -1 : 1));

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <KpiCard icon={<AlertTriangle size={14} />} label="Créditos vencidos" value={`${totales.vencidos} · ${money(totales.vencidosSaldo)}`} accent={COLOR_ROJO} />
          <KpiCard icon={<Clock size={14} />} label={`Por vencer (${diasUmbral}d)`} value={`${totales.proximos} · ${money(totales.proximosSaldo)}`} accent={COLOR_AMBAR} />
          <KpiCard icon={<CreditCard size={14} />} label="Créditos registrados" value={totales.creditosRegistrados} />
        </div>

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
        <KpiCard icon={<CreditCard size={14} />} label="Créditos registrados" value={totales.creditosRegistrados} />
      </div>

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
