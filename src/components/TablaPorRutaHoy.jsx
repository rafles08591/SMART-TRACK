// @ts-nocheck
import React from "react";
import { NOMBRES, MARCAS_DIA } from "../constants";
import { money, unidades, metaColor } from "../utils";

export default function TablaPorRutaHoy({ porVendedor, peorVendedorNombre }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 10, minWidth: 720 }}>
      <thead>
        <tr style={{ color: "#9AA7BD", textAlign: "left" }}>
          <th style={{ padding: "8px 16px" }}>Vendedor</th>
          <th>Volumen</th>
          {MARCAS_DIA.map((m) => <th key={m.key}>{m.label}</th>)}
          <th>OTC</th>
          <th>¿Vendió OTC?</th>
          <th>Sin Vuala</th>
          <th>Visitas</th>
          <th>Efectividad</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {porVendedor.map((v) => (
          <tr key={v.id} style={{ borderTop: "1px solid #1E2A42" }}>
            <td style={{ padding: "10px 16px" }}>
              {v.name}{NOMBRES[v.name] ? ` · ${NOMBRES[v.name]}` : ""}
              {peorVendedorNombre === v.name && (
                <div style={{ fontSize: 9, color: "#FF6B6B", fontWeight: 700, marginTop: 2 }}>PROPUESTO: LA TERCERA MANO DEL PACHUCO</div>
              )}
            </td>
            <td style={{ color: metaColor(v.hoy.volumen.vendido, v.hoy.volumen.objetivo) }}>{unidades(v.hoy.volumen.vendido)}</td>
            {MARCAS_DIA.map((m) => (
              <td key={m.key} style={{ color: metaColor(v.hoy.marcas[m.key].vendido, v.hoy.marcas[m.key].objetivo) }}>
                {unidades(v.hoy.marcas[m.key].vendido)}
              </td>
            ))}
            <td style={{ color: metaColor(v.hoy.otc.vendido, v.hoy.otc.objetivo) }}>{money(v.hoy.otc.vendido)}</td>
            <td>
              <span style={{
                display: "inline-block", minWidth: 28, textAlign: "center", borderRadius: 6, padding: "2px 6px",
                background: v.hoy.otc.vendido > 0 ? "#3DDC9733" : "#FF6B6B33",
                color: v.hoy.otc.vendido > 0 ? "#3DDC97" : "#FF6B6B",
                fontWeight: 600,
              }}>
                {v.hoy.otc.vendido > 0 ? "Sí" : "No"}
              </span>
            </td>
            <td>
              <span style={{
                display: "inline-block", minWidth: 28, textAlign: "center", borderRadius: 6, padding: "2px 6px",
                background: v.hoy.otcSinVuala.cumple ? "#3DDC9733" : "#FF6B6B33",
                color: v.hoy.otcSinVuala.cumple ? "#3DDC97" : "#FF6B6B",
                fontWeight: 600,
              }}>
                {v.hoy.otcSinVuala.piezas}
              </span>
            </td>
            <td>{v.hoy.visitasEfectivas}</td>
            <td style={{ color: v.hoy.efectividadPct >= 80 ? "#3DDC97" : v.hoy.efectividadPct >= 50 ? "#F2B134" : "#FF6B6B", fontWeight: 700 }}>
              {v.hoy.efectividadPct.toFixed(0)}%
            </td>
            <td>{v.hoy.bajoDesempeno && <AlertCircle size={14} color="#FF6B6B" />}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Modal de pantalla completa que reescala automáticamente su contenido (con
// CSS transform: scale) para que quepa entero en el ancho disponible, sin
// importar el tamaño de pantalla ni la orientación. Pensado para poder tomar
// un screenshot limpio de una tabla completa, sin que se corte nada a los
// lados. Se recalcula al rotar el teléfono o cambiar el tamaño de ventana.
