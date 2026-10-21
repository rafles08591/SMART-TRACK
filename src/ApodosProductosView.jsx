// @ts-nocheck
// ApodosProductosView.jsx — "Cómo le dicen" a cada artículo, para que Robotina entienda al equipo.
// Se guarda en data.whatsappBot.apodos = [{ codigo, articulo, apodos: "SWITCH, SWICH" }]
// y lo usa api/wa-resumen.js al buscar la venta por producto.
import React, { useEffect, useState } from "react";

// Ejemplos iniciales (los que mandó el Gerente). Se pueden editar o borrar.
const INICIALES = [
  { codigo: "0309", articulo: "VLACHOCO_26", apodos: "VUALA CHOCOLATE" },
  { codigo: "0310", articulo: "VLAVAINILLA_26", apodos: "VUALA VAINILLA" },
  { codigo: "0360", articulo: "CP11D24+EXIS20", apodos: "PROMO CLIPPER" },
  { codigo: "0390", articulo: "CP11D20+EXIS20", apodos: "PROMO CLIPPER" },
  { codigo: "0300", articulo: "CPLCP11_26", apodos: "CLIPPER" },
  { codigo: "0316", articulo: "SWICHC/10_26", apodos: "SWITCH, SWICH, SIWCH" },
  { codigo: "0372", articulo: "CARCOOFRE_26_B", apodos: "CARIBE, CARIBE FRESA" },
  { codigo: "0374", articulo: "CARCOOMANG_26_B", apodos: "CARIBE, CARIBE MANGO" },
  { codigo: "0375", articulo: "CARCOOMANZ_26_B", apodos: "CARIBE, CARIBE MANZANA" },
  { codigo: "0371", articulo: "CARCOODZN_26_B", apodos: "CARIBE" },
  { codigo: "0354", articulo: "CARCOOTIN_26.6", apodos: "CARIBE" },
  { codigo: "0304", articulo: "PAPELCP_26", apodos: "PAPEL CLIPPER" },
  { codigo: "0307", articulo: "EXIS_26", apodos: "ECONOMICO" },
  { codigo: "0305", articulo: "CPGAS16ML_26", apodos: "GAS" },
  { codigo: "0293", articulo: "HIDRA FRESA", apodos: "HIDRA" },
];

const vacia = () => ({ codigo: "", articulo: "", apodos: "" });

// Pegado desde Excel: Codigo <tab> Articulo <tab> Apodo (una fila por artículo)
function leerPegado(texto) {
  return String(texto || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => (l.includes("\t") ? l.split("\t") : l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)).map((c) => c.trim().replace(/^"|"$/g, "")))
    .filter((c) => c.length >= 2 && !/^codigo$/i.test(c[0]))
    .map(([codigo, articulo, apodos = ""]) => ({ codigo, articulo, apodos }));
}

export default function ApodosProductosView({ data, persistFresco, puedeEditar = true }) {
  const guardadas = data?.whatsappBot?.apodos;
  const [filas, setFilas] = useState(guardadas || INICIALES);
  const [buscar, setBuscar] = useState("");
  const [pegado, setPegado] = useState("");
  const [sucio, setSucio] = useState(!guardadas);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState(guardadas ? "" : "Son los ejemplos que mandaste; revísalos y da Guardar.");

  useEffect(() => {
    if (sucio || !data?.whatsappBot?.apodos) return;
    setFilas(data.whatsappBot.apodos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.whatsappBot?.apodos]);

  const cambiar = (i, k, v) => { setFilas((f) => f.map((x, j) => (j === i ? { ...x, [k]: v } : x))); setSucio(true); setEstado(""); };
  const quitar = (i) => { setFilas((f) => f.filter((_, j) => j !== i)); setSucio(true); };

  function agregarPegado() {
    const nuevas = leerPegado(pegado);
    if (!nuevas.length) { setEstado("⚠️ No encontré filas. Pega: Codigo, Articulo, Apodo."); return; }
    setFilas((f) => {
      const porClave = new Map(f.map((x) => [`${x.codigo}|${x.articulo}`.toUpperCase(), x]));
      for (const n of nuevas) {
        const k = `${n.codigo}|${n.articulo}`.toUpperCase();
        const prev = porClave.get(k);
        if (prev) {
          const junt = [...new Set([...String(prev.apodos).split(","), ...String(n.apodos).split(",")].map((a) => a.trim().toUpperCase()).filter(Boolean))];
          porClave.set(k, { ...prev, apodos: junt.join(", ") });
        } else porClave.set(k, { ...n, apodos: String(n.apodos).toUpperCase() });
      }
      return [...porClave.values()];
    });
    setPegado("");
    setSucio(true);
    setEstado(`✅ ${nuevas.length} filas agregadas. Da Guardar.`);
  }

  async function guardar() {
    setGuardando(true);
    setEstado("Guardando…");
    try {
      const limpias = filas
        .map((x) => ({ codigo: String(x.codigo || "").trim(), articulo: String(x.articulo || "").trim(), apodos: String(x.apodos || "").trim().toUpperCase() }))
        .filter((x) => (x.codigo || x.articulo) && x.apodos);
      await persistFresco((fresca) => ({ whatsappBot: { ...(fresca.whatsappBot || {}), apodos: limpias } }));
      setFilas(limpias);
      setSucio(false);
      setEstado("✅ Guardado. Robotina ya entiende estos nombres.");
    } catch (e) {
      setEstado("❌ No se pudo guardar: " + (e?.message || e));
    } finally {
      setGuardando(false);
    }
  }

  const q = buscar.trim().toLowerCase();
  const visibles = filas.map((x, i) => ({ ...x, i })).filter((x) => !q || `${x.codigo} ${x.articulo} ${x.apodos}`.toLowerCase().includes(q));
  const inp = { width: "100%", boxSizing: "border-box", padding: "7px 8px", fontSize: 13 };

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <div className="display" style={{ fontSize: 14, color: "#E8EDF5", marginBottom: 4 }}>🏷️ CÓMO LE DICEN A CADA PRODUCTO</div>
      <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 12 }}>
        Cuando le preguntan a Robotina por un producto ("¿cuánto se vendió de Switch?"), busca aquí cómo se llama en PowerStreet.
        Pon varios apodos separados por coma (también con faltas de ortografía: SWITCH, SWICH). Un mismo apodo puede ir en varios artículos (CARIBE = todos los sabores).
      </div>

      <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar código, artículo o apodo…" style={{ ...inp, marginBottom: 10 }} />

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "#9AA7BD", textAlign: "left" }}>
              <th style={{ padding: 6, width: 80 }}>Código</th>
              <th style={{ padding: 6, width: 170 }}>Artículo (PowerStreet)</th>
              <th style={{ padding: 6 }}>Cómo le dicen</th>
              {puedeEditar && <th style={{ width: 30 }} />}
            </tr>
          </thead>
          <tbody>
            {visibles.map((x) => (
              <tr key={x.i} style={{ borderTop: "1px solid #1E2A42" }}>
                <td style={{ padding: 4 }}><input style={inp} value={x.codigo} disabled={!puedeEditar} onChange={(e) => cambiar(x.i, "codigo", e.target.value)} /></td>
                <td style={{ padding: 4 }}><input style={inp} value={x.articulo} disabled={!puedeEditar} onChange={(e) => cambiar(x.i, "articulo", e.target.value)} /></td>
                <td style={{ padding: 4 }}><input style={inp} value={x.apodos} disabled={!puedeEditar} onChange={(e) => cambiar(x.i, "apodos", e.target.value.toUpperCase())} placeholder="SWITCH, SWICH" /></td>
                {puedeEditar && (
                  <td style={{ textAlign: "center" }}>
                    <button onClick={() => quitar(x.i)} title="Quitar" style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer" }}>✕</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {puedeEditar && (
        <>
          <button className="btn-ghost" style={{ marginTop: 10, fontSize: 13 }} onClick={() => { setFilas((f) => [...f, vacia()]); setBuscar(""); setSucio(true); }}>
            ➕ Agregar producto
          </button>
          <details style={{ marginTop: 12 }}>
            <summary style={{ fontSize: 12.5, color: "#9AA7BD", cursor: "pointer" }}>📋 Pegar varios desde Excel (Codigo · Articulo · Apodo)</summary>
            <textarea value={pegado} onChange={(e) => setPegado(e.target.value)} rows={5}
              placeholder={"0316\tSWICHC/10_26\tSWITCH\n0300\tCPLCP11_26\tCLIPPER"}
              style={{ ...inp, marginTop: 8, fontFamily: "monospace" }} />
            <button className="btn-ghost" style={{ marginTop: 6, fontSize: 13 }} onClick={agregarPegado} disabled={!pegado.trim()}>Agregar a la lista</button>
          </details>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <button onClick={guardar} disabled={!sucio || guardando}
              style={{ padding: "10px 22px", borderRadius: 12, border: "none", fontWeight: 800, background: "#22c55e", color: "#04130a", opacity: sucio && !guardando ? 1 : 0.45, cursor: sucio ? "pointer" : "default" }}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <span style={{ fontSize: 12, color: sucio ? "#f59e0b" : "#9AA7BD" }}>{estado || (sucio ? "Tienes cambios sin guardar" : `${filas.length} productos con apodo`)}</span>
          </div>
        </>
      )}
    </div>
  );
}
