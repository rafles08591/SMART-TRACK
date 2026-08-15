// @ts-nocheck
/* =====================================================================
   RelojChecadorView — módulo independiente de SMART-TRACK
   ---------------------------------------------------------------------
   Reporte de entrada/salida al CLO tomado del checador biométrico.
   Admin y Gerente suben el archivo .xls/.xlsx que exporta el reloj
   checador (columnas: Num, Department, Name, ID, Date/Time, Verifycode,
   Clock-in/out, Device ID, Device Name, UserExtFmt). El reporte no trae
   de forma confiable cuál marca es entrada y cuál salida (todas suelen
   venir como "C/In"), así que por cada empleado y día se toma la marca
   MÁS TEMPRANA como entrada y la MÁS TARDÍA como salida.

   El "Num" del checador es un número interno del equipo biométrico, no
   el código de ruta — hay que traducirlo. El mapeo se guarda aquí mismo
   (MAPEO_NUMERO_RUTA) porque así lo dio el Gerente; si el número de
   algún empleado cambia o se agrega alguien nuevo, hay que actualizar
   este objeto. J201 y J203 (vendedores de pueblo) no están mapeados a
   propósito — no se les da seguimiento con este checador.

   Se guarda en su propia tabla de Supabase (checador_marcas), NO en el
   documento JSON grande. Créala una sola vez, en SQL Editor:

     create table if not exists checador_marcas (
       id uuid primary key default gen_random_uuid(),
       numero_empleado text not null,
       nombre text,
       ruta text,
       fecha date not null,
       hora_entrada time,
       hora_salida time,
       creado_en timestamptz not null default now(),
       unique (numero_empleado, fecha)
     );
     alter table checador_marcas enable row level security;
     create policy "permitir todo por ahora" on checador_marcas
       for all using (true) with check (true);

   Cómo se conecta:
     <RelojChecadorView puedeSubir={esGerenteOAdmin} rutaPropia={rutaPropiaONull} />
===================================================================== */

import React, { useEffect, useMemo, useState } from "react";
import { Clock, Upload, Download, Calendar, AlertTriangle, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import { NOMBRES } from "../constants";

const T = {
  bg: "#0B1220",
  card: "#111C33",
  cardSoft: "#0F1830",
  border: "#2A3852",
  ink: "#E8EDF5",
  muted: "#9AA7BD",
  primary: "#F2B134",
  ok: "#3DDC97",
  bad: "#FF6B6B",
  badSoft: "rgba(255,107,107,0.12)",
};

// Número interno del checador biométrico -> ruta (o "GERENTE"). J201 y
// J203 son vendedores de pueblo y no se les da seguimiento aquí, por eso
// no aparecen en este mapeo.
const MAPEO_NUMERO_RUTA = {
  "101": "RUTA J207",
  "40": "RUTA J202",
  "49": "RUTA J204",
  "132": "RUTA J205",
  "67": "GERENTE",
  "126": "RUTA J206",
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function nombreRutaBonito(ruta) {
  if (ruta === "GERENTE") return "Gerente";
  const nombre = NOMBRES[ruta];
  return nombre ? `${ruta.replace("RUTA ", "")} · ${nombre}` : ruta;
}
function formatoHora(hora) {
  if (!hora) return "—";
  return hora.slice(0, 5);
}

export default function RelojChecadorView({ puedeSubir, rutaPropia }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [marcas, setMarcas] = useState(null); // null = cargando
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [resultadoSubida, setResultadoSubida] = useState("");
  const fileInputRef = React.useRef(null);

  async function cargar() {
    setMarcas(null);
    setError("");
    try {
      const { data, error: err } = await supabase
        .from("checador_marcas")
        .select("numero_empleado, nombre, ruta, fecha, hora_entrada, hora_salida")
        .eq("fecha", fecha)
        .order("ruta", { ascending: true });
      if (err) throw err;
      setMarcas(data || []);
    } catch (err) {
      console.error("Error cargando checador_marcas:", err);
      setError("No se pudo cargar el reloj checador. Verifica que la tabla 'checador_marcas' exista en Supabase.");
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fecha]);

  function procesarArchivo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true);
    setResultadoSubida("");
    const lector = new FileReader();
    lector.onerror = () => { setSubiendo(false); setResultadoSubida("No se pudo leer el archivo."); };
    lector.onload = async (ev) => {
      try {
        const libro = XLSX.read(ev.target.result, { type: "array" });
        const hoja = libro.Sheets[libro.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json(hoja, { defval: "" });

        // Agrupa por (número de empleado, fecha) y toma la marca más
        // temprana como entrada y la más tardía como salida.
        const grupos = {};
        let sinReconocer = new Set();
        filas.forEach((f) => {
          const num = String(f["Num"] || "").trim();
          const nombre = String(f["Department"] || f["Name"] || "").trim();
          const fechaHora = String(f["Date/Time"] || "").trim();
          if (!num || !fechaHora) return;
          const [fechaFila, horaFila] = fechaHora.split(" ");
          if (!fechaFila || !horaFila) return;
          const ruta = MAPEO_NUMERO_RUTA[num] || null;
          if (!ruta) { sinReconocer.add(`${num} (${nombre})`); return; }
          const clave = `${num}|${fechaFila}`;
          if (!grupos[clave]) grupos[clave] = { numero_empleado: num, nombre, ruta, fecha: fechaFila, horas: [] };
          grupos[clave].horas.push(horaFila);
        });

        const registros = Object.values(grupos).map((g) => {
          const horasOrdenadas = [...g.horas].sort();
          return {
            numero_empleado: g.numero_empleado,
            nombre: g.nombre,
            ruta: g.ruta,
            fecha: g.fecha,
            hora_entrada: horasOrdenadas[0],
            hora_salida: horasOrdenadas[horasOrdenadas.length - 1],
          };
        });

        if (registros.length === 0) {
          setResultadoSubida("No se encontraron marcas de rutas reconocidas en el archivo.");
          setSubiendo(false);
          return;
        }

        const { error: err } = await supabase
          .from("checador_marcas")
          .upsert(registros, { onConflict: "numero_empleado,fecha" });
        if (err) throw err;

        let mensaje = `Se guardaron ${registros.length} registro(s).`;
        if (sinReconocer.size > 0) {
          mensaje += ` Números sin mapear (no se guardaron): ${Array.from(sinReconocer).join(", ")}.`;
        }
        setResultadoSubida(mensaje);
        // Si la fecha subida es la que se está viendo, refresca la tabla.
        if (registros.some((r) => r.fecha === fecha)) cargar();
      } catch (err) {
        console.error("Error procesando checador:", err);
        setResultadoSubida("No se pudo guardar. Revisa el formato del archivo o tu conexión.");
      } finally {
        setSubiendo(false);
      }
    };
    lector.readAsArrayBuffer(file);
  }

  const marcasVisibles = useMemo(() => {
    if (!marcas) return [];
    if (rutaPropia) return marcas.filter((m) => m.ruta === `RUTA ${rutaPropia}`);
    return marcas;
  }, [marcas, rutaPropia]);

  function descargarExcel() {
    const filas = marcasVisibles.map((m) => ({
      Ruta: nombreRutaBonito(m.ruta),
      Nombre: m.nombre,
      Entrada: formatoHora(m.hora_entrada),
      Salida: formatoHora(m.hora_salida),
      Fecha: m.fecha,
    }));
    const hoja = XLSX.utils.json_to_sheet(filas);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Reloj checador");
    XLSX.writeFile(libro, `reloj_checador_${fecha}.xlsx`);
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <style>{`
        .rc-card { background:${T.card}; border:1px solid ${T.border}; border-radius:14px; }
        .rc-select, .rc-input { background:${T.bg}; border:1px solid ${T.border}; color:${T.ink}; border-radius:8px; padding:7px 10px; font-size:12.5px; }
        .rc-btn { background:${T.primary}; color:#1A1300; font-weight:700; border:none; border-radius:10px; padding:9px 15px; cursor:pointer; font-size:13px; display:inline-flex; align-items:center; gap:6px; }
        .rc-btn-ghost { background:transparent; border:1px solid ${T.border}; color:${T.ink}; border-radius:8px; padding:6px 10px; cursor:pointer; font-size:12px; display:inline-flex; align-items:center; gap:5px; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={20} color={T.primary} />
          <span style={{ fontSize: 18, fontWeight: 800 }}>RELOJ CHECADOR</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar size={14} color={T.muted} />
          <input type="date" className="rc-input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <button className="rc-btn-ghost" onClick={cargar}><RefreshCw size={12} /> Actualizar</button>
          {marcasVisibles.length > 0 && (
            <button className="rc-btn-ghost" onClick={descargarExcel}><Download size={12} /> Excel</button>
          )}
        </div>
      </div>

      {puedeSubir && (
        <div className="rc-card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Subir archivo del checador</div>
          <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 10 }}>
            Sube el .xls/.xlsx tal cual lo exporta el checador. Cada fila se agrupa por empleado y día — la marca más temprana queda como entrada y la más tardía como salida.
          </div>
          <button className="rc-btn" disabled={subiendo} onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} /> {subiendo ? "Procesando…" : "Elegir archivo"}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.xlsm" style={{ display: "none" }} onChange={procesarArchivo} />
          {resultadoSubida && <div style={{ fontSize: 12, color: T.muted, marginTop: 10 }}>{resultadoSubida}</div>}
        </div>
      )}

      {error && (
        <div className="rc-card" style={{ padding: 14, marginBottom: 16, color: T.bad, fontSize: 12.5 }}>{error}</div>
      )}

      {marcas === null && !error ? (
        <div className="rc-card" style={{ padding: 30, textAlign: "center", color: T.muted, fontSize: 13 }}>
          Cargando…
        </div>
      ) : marcasVisibles.length === 0 ? (
        <div className="rc-card" style={{ padding: 30, textAlign: "center", color: T.muted, fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={20} />
          No hay marcas del checador para {rutaPropia ? "tu ruta" : "esta fecha"} ({fecha}).
        </div>
      ) : (
        <div className="rc-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: T.cardSoft, textAlign: "left" }}>
                  {["Ruta", "Nombre", "Entrada", "Salida"].map((h) => (
                    <th key={h} style={{ padding: "10px 12px", color: T.muted, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {marcasVisibles.map((m) => (
                  <tr key={m.numero_empleado} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>{nombreRutaBonito(m.ruta)}</td>
                    <td style={{ padding: "10px 12px" }}>{m.nombre}</td>
                    <td className="nm-mono" style={{ padding: "10px 12px" }}>{formatoHora(m.hora_entrada)}</td>
                    <td className="nm-mono" style={{ padding: "10px 12px" }}>{formatoHora(m.hora_salida)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
