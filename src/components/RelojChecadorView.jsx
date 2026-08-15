// @ts-nocheck
/* =====================================================================
   RelojChecadorView — módulo independiente de SMART-TRACK
   ---------------------------------------------------------------------
   Dos pestañas:

   1) MARCAS DEL DÍA — reporte de entrada/salida al CLO tomado del
      checador biométrico. Admin y Gerente suben el archivo .xls/.xlsx
      que exporta el reloj checador (columnas: Num, Department, Name,
      ID, Date/Time, Verifycode, Clock-in/out, Device ID, Device Name,
      UserExtFmt). El reporte no trae de forma confiable cuál marca es
      entrada y cuál salida (todas suelen venir como "C/In"), así que
      por cada empleado y día se toma la marca MÁS TEMPRANA como
      entrada y la MÁS TARDÍA como salida.

   2) BONO DE PUNTUALIDAD — por bloques de semana (lunes a sábado):
      se gana el bono de $400 si TODOS los 6 días tuvieron entrada a
      las 7:10 a.m. o antes (a la gente se le informa esta hora); un solo
      día tarde o sin registro lo pierde completo. El sistema en realidad
      da un poco más de margen (hasta las 7:12 a.m.) como colchón interno,
      pero eso no se le comunica a nadie a propósito.
      lo pierde completo. El bono que se PAGA una semana corresponde
      al checador de la semana ANTERIOR (ej. lo que se paga la semana
      del 10-15 de agosto es el checador de la semana del 3-8), por
      eso el selector arranca por default en la semana pasada, no en
      la actual.
      - Gerente, Supervisor-1 y Admin ven TODAS las rutas.
      - Cada vendedor ve solo su propia ruta.
      - Supervisor-2 no ve esta pestaña (solo "Marcas del día").

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
     <RelojChecadorView
       puedeSubir={esGerenteOAdmin}
       rutaPropia={rutaPropiaONull}
       puedeVerBono={esGerenteOSupervisor1OAdmin}
     />
===================================================================== */

import React, { useEffect, useMemo, useState } from "react";
import { Clock, Upload, Download, Calendar, AlertTriangle, RefreshCw, Award, CheckCircle2, FileSpreadsheet } from "lucide-react";
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

const MAPEO_NUMERO_RUTA = {
  "101": "RUTA J207",
  "40": "RUTA J202",
  "49": "RUTA J204",
  "132": "RUTA J205",
  "67": "GERENTE",
  "126": "RUTA J206",
  "57": "SUPERVISOR-1",
};
// Para el "Bono de puntualidad" (todas las rutas) se incluyen las rutas de
// venta y además Supervisor-1 — a él también se le evalúa el bono. Gerente
// no entra a esta lista (se sigue viendo en "Marcas del día", pero no se
// le mide el bono de puntualidad).
const RUTAS_CHECADOR = [...new Set(Object.values(MAPEO_NUMERO_RUTA))].filter((r) => r.startsWith("RUTA ") || r === "SUPERVISOR-1");

const HORA_LIMITE_PUNTUALIDAD = "07:12:00"; // hora real que se evalúa contra el checador
const HORA_LIMITE_MOSTRADA = "7:10 a.m.";   // hora que se le dice a la gente (a propósito más estricta que la real, como margen)
const BONO_PUNTUALIDAD_MONTO = 400;
const NOMBRES_DIA_PUNTUALIDAD = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function nombreRutaBonito(ruta) {
  if (ruta === "GERENTE") return NOMBRES["GERENTE"] ? `Gerente · ${NOMBRES["GERENTE"]}` : "Gerente";
  if (ruta === "SUPERVISOR-1") return NOMBRES["SUPERVISOR-1"] ? `Supervisor 1 · ${NOMBRES["SUPERVISOR-1"]}` : "Supervisor 1";
  const nombre = NOMBRES[ruta];
  return nombre ? `${ruta.replace("RUTA ", "")} · ${nombre}` : ruta;
}
function formatoHora(hora) {
  if (!hora) return "—";
  return hora.slice(0, 5);
}
function sumarDiasISOLocal(fechaISO, dias) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}
function lunesDeSemanaLocal(fechaISO) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const dia = fecha.getUTCDay();
  const offset = dia === 0 ? -6 : 1 - dia;
  fecha.setUTCDate(fecha.getUTCDate() + offset);
  return fecha.toISOString().slice(0, 10);
}
function formatoRangoSemana(lunesISO) {
  const sabado = sumarDiasISOLocal(lunesISO, 5);
  const opts = { day: "numeric", month: "long", timeZone: "UTC" };
  const [y1, m1, d1] = lunesISO.split("-").map(Number);
  const [y2, m2, d2] = sabado.split("-").map(Number);
  const f1 = new Date(Date.UTC(y1, m1 - 1, d1)).toLocaleDateString("es-MX", opts);
  const f2 = new Date(Date.UTC(y2, m2 - 1, d2)).toLocaleDateString("es-MX", opts);
  return `${f1} al ${f2}`;
}

async function evaluarPuntualidadSemana(rutaCompleta, semanaInicio) {
  const { data, error } = await supabase
    .from("checador_marcas")
    .select("fecha, hora_entrada")
    .eq("ruta", rutaCompleta)
    .gte("fecha", semanaInicio)
    .lte("fecha", sumarDiasISOLocal(semanaInicio, 5));
  if (error) throw error;
  const marcasPorFecha = {};
  (data || []).forEach((m) => { marcasPorFecha[m.fecha] = m; });
  const dias = NOMBRES_DIA_PUNTUALIDAD.map((nombre, i) => {
    const fecha = sumarDiasISOLocal(semanaInicio, i);
    const marca = marcasPorFecha[fecha];
    if (!marca || !marca.hora_entrada) return { fecha, nombre, ok: false, motivo: "sin_registro" };
    const ok = marca.hora_entrada <= HORA_LIMITE_PUNTUALIDAD;
    return { fecha, nombre, ok, motivo: ok ? null : "tarde", horaEntrada: marca.hora_entrada };
  });
  const diasProblema = dias.filter((d) => !d.ok);
  return { gano: diasProblema.length === 0, dias, diasProblema };
}

export default function RelojChecadorView({ puedeSubir, rutaPropia, puedeVerBono }) {
  const [vista, setVista] = useState("marcas"); // "marcas" | "puntualidad" | "resumen"

  const [fecha, setFecha] = useState(hoyISO());
  const [marcas, setMarcas] = useState(null);
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

  useEffect(() => { if (vista === "marcas") cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fecha, vista]);

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

        const grupos = {};
        let sinReconocer = new Set();
        filas.forEach((f) => {
          const num = String(f["Num"] || "").trim();
          const nombre = String(f["Department"] || f["Name"] || "").trim();
          const identificador = String(f["Name"] || "").trim();
          const fechaHora = String(f["Date/Time"] || "").trim();
          if (!num || !fechaHora) return;
          const [fechaFila, horaFila] = fechaHora.split(" ");
          if (!fechaFila || !horaFila) return;
          const ruta = MAPEO_NUMERO_RUTA[num] || null;
          if (!ruta) { sinReconocer.add(`${num} (${nombre})`); return; }
          const clave = `${num}|${fechaFila}`;
          if (!grupos[clave]) grupos[clave] = { numero_empleado: num, nombre, identificador, ruta, fecha: fechaFila, horas: [] };
          grupos[clave].horas.push(horaFila);
        });

        const registros = Object.values(grupos).map((g) => {
          const horasOrdenadas = [...g.horas].sort();
          return {
            numero_empleado: g.numero_empleado,
            nombre: g.nombre,
            identificador: g.identificador,
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

  const semanaActual = lunesDeSemanaLocal(hoyISO());
  const semanaPasadaDefault = sumarDiasISOLocal(semanaActual, -7);
  const [semanaPuntualidad, setSemanaPuntualidad] = useState(semanaPasadaDefault);
  const [resultadosPuntualidad, setResultadosPuntualidad] = useState(null);
  const [cargandoPuntualidad, setCargandoPuntualidad] = useState(false);
  const [errorPuntualidad, setErrorPuntualidad] = useState("");

  const rutasAEvaluar = useMemo(() => {
    if (rutaPropia) return [`RUTA ${rutaPropia}`];
    if (puedeVerBono) return RUTAS_CHECADOR;
    return [];
  }, [rutaPropia, puedeVerBono]);

  useEffect(() => {
    if (vista !== "puntualidad" || rutasAEvaluar.length === 0) return;
    let activo = true;
    setCargandoPuntualidad(true);
    setErrorPuntualidad("");
    Promise.all(rutasAEvaluar.map((r) => evaluarPuntualidadSemana(r, semanaPuntualidad).then((res) => [r, res])))
      .then((entradas) => {
        if (!activo) return;
        const mapa = {};
        entradas.forEach(([r, res]) => { mapa[r] = res; });
        setResultadosPuntualidad(mapa);
      })
      .catch((err) => {
        console.error("Error evaluando puntualidad:", err);
        if (activo) setErrorPuntualidad("No se pudo consultar el checador para esta semana.");
      })
      .finally(() => { if (activo) setCargandoPuntualidad(false); });
    return () => { activo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, semanaPuntualidad, rutaPropia, puedeVerBono]);

  const rutasOrdenadas = useMemo(() => {
    if (!resultadosPuntualidad) return [];
    return rutasAEvaluar
      .map((r) => ({ ruta: r, resultado: resultadosPuntualidad[r] }))
      .sort((a, b) => Number(a.resultado?.gano) - Number(b.resultado?.gano));
  }, [resultadosPuntualidad, rutasAEvaluar]);

  /* ---------------- RESUMEN (tabla tipo Excel de incidencias) ---------------- */
  const [filasResumen, setFilasResumen] = useState(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [errorResumen, setErrorResumen] = useState("");
  // Observaciones libres, capturadas a mano — solo viven en esta pantalla
  // (no se guardan en Supabase); se incluyen en el Excel si se llenan
  // antes de descargar.
  const [observaciones, setObservaciones] = useState({}); // { numero_empleado: texto }

  async function cargarResumen() {
    setCargandoResumen(true);
    setErrorResumen("");
    setFilasResumen(null);
    try {
      const fechaHasta = sumarDiasISOLocal(semanaPuntualidad, 5);
      const { data, error } = await supabase
        .from("checador_marcas")
        .select("numero_empleado, nombre, identificador, ruta, fecha, hora_entrada")
        .in("ruta", RUTAS_CHECADOR)
        .gte("fecha", semanaPuntualidad)
        .lte("fecha", fechaHasta);
      if (error) throw error;

      const filas = Object.entries(MAPEO_NUMERO_RUTA)
        .filter(([, ruta]) => RUTAS_CHECADOR.includes(ruta))
        .map(([numeroEmpleado, ruta]) => {
          const registrosEmpleado = (data || []).filter((r) => r.numero_empleado === numeroEmpleado);
          const nombre = registrosEmpleado.find((r) => r.nombre)?.nombre || "";
          const identificador = registrosEmpleado.find((r) => r.identificador)?.identificador || "";
          const porDia = {};
          registrosEmpleado.forEach((r) => { porDia[r.fecha] = r.hora_entrada; });
          const dias = NOMBRES_DIA_PUNTUALIDAD.map((nombreDia, i) => {
            const fecha = sumarDiasISOLocal(semanaPuntualidad, i);
            return { fecha, nombreDia, hora: porDia[fecha] || null };
          });
          const diasProblema = dias.filter((d) => !d.hora || d.hora > HORA_LIMITE_PUNTUALIDAD);
          const aplicaBono = diasProblema.length === 0;
          const puesto = ruta === "SUPERVISOR-1" ? "SUPERVISOR" : "VENTAS";
          return { numeroEmpleado, ruta, puesto, nombre, identificador, dias, aplicaBono };
        });
      setFilasResumen(filas);
    } catch (err) {
      console.error("Error cargando resumen:", err);
      setErrorResumen("No se pudo cargar el resumen.");
    } finally {
      setCargandoResumen(false);
    }
  }

  useEffect(() => {
    if (vista === "resumen") cargarResumen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, semanaPuntualidad]);

  function formatoHoraLarga(hora) {
    if (!hora) return "—";
    const [h, m] = hora.split(":");
    const hNum = Number(h);
    const ampm = hNum >= 12 ? "p. m." : "a. m.";
    const h12 = hNum % 12 === 0 ? 12 : hNum % 12;
    return `${String(h12).padStart(2, "0")}:${m} ${ampm}`;
  }

  function descargarResumenExcel() {
    if (!filasResumen) return;
    const encabezadoDias = filasResumen[0]?.dias.map((d) => `${d.fecha.slice(8, 10)}-${d.fecha.slice(5, 7)} ${d.nombreDia}`) || [];
    const filasExcel = filasResumen.map((f) => {
      const fila = {
        PUESTO: f.puesto,
        RUTA: f.ruta.replace("RUTA ", ""),
        RELOJ: f.numeroEmpleado,
        RFC: f.identificador,
        NOMBRE: f.nombre,
      };
      f.dias.forEach((d, i) => { fila[encabezadoDias[i]] = formatoHoraLarga(d.hora); });
      fila["APLICA BONO"] = f.aplicaBono ? BONO_PUNTUALIDAD_MONTO : "";
      fila["OBSERVACIONES"] = observaciones[f.numeroEmpleado] || "";
      return fila;
    });
    const hoja = XLSX.utils.json_to_sheet(filasExcel);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Incidencias semanales");
    XLSX.writeFile(libro, `incidencias_semanales_${semanaPuntualidad}.xlsx`);
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <style>{`
        .rc-card { background:${T.card}; border:1px solid ${T.border}; border-radius:14px; }
        .rc-select, .rc-input { background:${T.bg}; border:1px solid ${T.border}; color:${T.ink}; border-radius:8px; padding:7px 10px; font-size:12.5px; }
        .rc-btn { background:${T.primary}; color:#1A1300; font-weight:700; border:none; border-radius:10px; padding:9px 15px; cursor:pointer; font-size:13px; display:inline-flex; align-items:center; gap:6px; }
        .rc-btn-ghost { background:transparent; border:1px solid ${T.border}; color:${T.ink}; border-radius:8px; padding:6px 10px; cursor:pointer; font-size:12px; display:inline-flex; align-items:center; gap:5px; }
        .rc-tab { background:transparent; border:1px solid ${T.border}; color:${T.ink}; border-radius:10px; padding:9px 14px; cursor:pointer; font-size:13px; font-weight:700; flex:1; }
        .rc-tab.activo { background:${T.primary}; color:#1A1300; border-color:${T.primary}; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Clock size={20} color={T.primary} />
        <span style={{ fontSize: 18, fontWeight: 800 }}>RELOJ CHECADOR</span>
      </div>

      {(puedeVerBono || rutaPropia) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button className={`rc-tab ${vista === "marcas" ? "activo" : ""}`} onClick={() => setVista("marcas")}>Marcas del día</button>
          <button className={`rc-tab ${vista === "puntualidad" ? "activo" : ""}`} onClick={() => setVista("puntualidad")}>
            <Award size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Bono de puntualidad
          </button>
          {puedeVerBono && (
            <button className={`rc-tab ${vista === "resumen" ? "activo" : ""}`} onClick={() => setVista("resumen")}>
              <FileSpreadsheet size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Resumen
            </button>
          )}
        </div>
      )}

      {vista === "marcas" ? (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            <Calendar size={14} color={T.muted} />
            <input type="date" className="rc-input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            <button className="rc-btn-ghost" onClick={cargar}><RefreshCw size={12} /> Actualizar</button>
            {marcasVisibles.length > 0 && (
              <button className="rc-btn-ghost" onClick={descargarExcel}><Download size={12} /> Excel</button>
            )}
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
        </>
      ) : vista === "puntualidad" ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 11.5, color: T.muted }}>
              Se gana ${BONO_PUNTUALIDAD_MONTO} si los 6 días (lunes a sábado) tuvieron entrada a las ${HORA_LIMITE_MOSTRADA} o antes.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Calendar size={14} color={T.muted} />
              <input
                type="date" className="rc-input"
                value={semanaPuntualidad}
                onChange={(e) => setSemanaPuntualidad(lunesDeSemanaLocal(e.target.value))}
              />
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: T.primary, fontWeight: 700, marginBottom: 14 }}>
            Semana del {formatoRangoSemana(semanaPuntualidad)}
            {semanaPuntualidad === semanaPasadaDefault && <span style={{ color: T.muted, fontWeight: 400 }}> — la que se paga esta semana</span>}
          </div>

          {errorPuntualidad && (
            <div className="rc-card" style={{ padding: 14, marginBottom: 16, color: T.bad, fontSize: 12.5 }}>{errorPuntualidad}</div>
          )}

          {cargandoPuntualidad || resultadosPuntualidad === null ? (
            <div className="rc-card" style={{ padding: 30, textAlign: "center", color: T.muted, fontSize: 13 }}>
              Consultando el checador…
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {rutasOrdenadas.map(({ ruta, resultado }) => (
                <div key={ruta} className="rc-card" style={{ padding: 16, borderColor: resultado?.gano ? T.ok : T.bad }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: resultado?.gano ? 0 : 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{nombreRutaBonito(ruta)}</div>
                    {resultado?.gano ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800, color: T.ok }}>
                        <CheckCircle2 size={15} /> GANÓ ${BONO_PUNTUALIDAD_MONTO}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 800, color: T.bad, background: T.badSoft, borderRadius: 999, padding: "3px 10px" }}>
                        NO GANÓ
                      </span>
                    )}
                  </div>
                  {!resultado?.gano && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {resultado?.diasProblema.map((d) => (
                        <div key={d.fecha} style={{ fontSize: 12, color: T.ink, background: T.cardSoft, borderRadius: 8, padding: "7px 10px" }}>
                          <strong>{d.nombre} ({d.fecha}):</strong>{" "}
                          {d.motivo === "sin_registro"
                            ? "sin registro de entrada en el checador"
                            : `llegó a las ${formatoHora(d.horaEntrada)} (después de las ${HORA_LIMITE_MOSTRADA})`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>INCIDENCIAS SEMANALES</div>
              <div style={{ fontSize: 12, color: T.muted }}>Del {formatoRangoSemana(semanaPuntualidad)}{filasResumen ? ` · Conteo: ${filasResumen.length}` : ""}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Calendar size={14} color={T.muted} />
              <input
                type="date" className="rc-input"
                value={semanaPuntualidad}
                onChange={(e) => setSemanaPuntualidad(lunesDeSemanaLocal(e.target.value))}
              />
              <button className="rc-btn-ghost" onClick={cargarResumen}><RefreshCw size={12} /> Actualizar</button>
              {filasResumen && filasResumen.length > 0 && (
                <button className="rc-btn" onClick={descargarResumenExcel}><Download size={12} /> Excel</button>
              )}
            </div>
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 14 }}>
            Las observaciones se escriben aquí abajo y se incluyen en el Excel al descargarlo — no se guardan al salir de esta pantalla.
          </div>

          {errorResumen && (
            <div className="rc-card" style={{ padding: 14, marginBottom: 16, color: T.bad, fontSize: 12.5 }}>{errorResumen}</div>
          )}

          {cargandoResumen || filasResumen === null ? (
            <div className="rc-card" style={{ padding: 30, textAlign: "center", color: T.muted, fontSize: 13 }}>
              Cargando…
            </div>
          ) : (
            <div className="rc-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: T.cardSoft, textAlign: "left" }}>
                      {["Puesto", "Ruta", "Reloj", "RFC", "Nombre", ...NOMBRES_DIA_PUNTUALIDAD, "Aplica bono", "Observaciones"].map((h) => (
                        <th key={h} style={{ padding: "8px 10px", color: T.muted, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filasResumen.map((f) => (
                      <tr key={f.numeroEmpleado} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{f.puesto}</td>
                        <td style={{ padding: "8px 10px", fontWeight: 700, whiteSpace: "nowrap" }}>{f.ruta.replace("RUTA ", "")}</td>
                        <td className="nm-mono" style={{ padding: "8px 10px" }}>{f.numeroEmpleado}</td>
                        <td className="nm-mono" style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{f.identificador || "—"}</td>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{f.nombre || "—"}</td>
                        {f.dias.map((d) => (
                          <td key={d.fecha} className="nm-mono" style={{ padding: "8px 10px", whiteSpace: "nowrap", color: !d.hora || d.hora > HORA_LIMITE_PUNTUALIDAD ? T.bad : T.ink }}>
                            {formatoHora(d.hora)}
                          </td>
                        ))}
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                          {f.aplicaBono ? (
                            <span style={{ fontWeight: 800, color: T.ok }}>${BONO_PUNTUALIDAD_MONTO}</span>
                          ) : (
                            <span style={{ color: T.muted }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "6px 8px", minWidth: 160 }}>
                          <input
                            type="text"
                            value={observaciones[f.numeroEmpleado] || ""}
                            onChange={(e) => setObservaciones((o) => ({ ...o, [f.numeroEmpleado]: e.target.value }))}
                            placeholder="—"
                            style={{ width: "100%", boxSizing: "border-box", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.ink, padding: "5px 8px", fontSize: 11.5 }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
