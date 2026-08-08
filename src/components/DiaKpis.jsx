// @ts-nocheck
import React from "react";
import { Target, Star, MapPin, MessageSquare, AlertCircle } from "lucide-react";
import { MARCAS_DIA, NOMBRES } from "../constants";
import { money, unidades, metaColor } from "../utils";
import { KpiCard } from "./ui";

export default function DiaKpis({ hoy, mensajeDia, rutaCodigo, esPeor, esBottom3 }) {
  const [tiempos, setTiempos] = useState(null);
  const [ahora, setAhora] = useState(Date.now());

  // Consulta el panel de Tiempos (otro proyecto de Supabase) para esta ruta,
  // hoy. Se refresca cada 20s (no hace falta tiempo real estricto aquí).
  useEffect(() => {
    if (!rutaCodigo) return;
    let activo = true;
    async function cargar() {
      try {
        const fechaHoy = new Date().toLocaleDateString("en-CA");
        const { data: row } = await supabaseTiempos.from("panel_kv").select("value").eq("key", "board-activo").maybeSingle();
        if (!activo) return;
        setTiempos(row?.value?.fecha === fechaHoy ? row.value.rutas?.[rutaCodigo]?.areas || null : null);
      } catch (e) {
        console.error("Error consultando Tiempos:", e);
      }
    }
    cargar();
    const intervalo = setInterval(cargar, 20000);
    return () => { activo = false; clearInterval(intervalo); };
  }, [rutaCodigo]);

  // Reloj que avanza cada segundo, para el cronómetro de "tiempo en ruta".
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const horaIngresoClo = tiempos?.ingreso_clo?.ts
    ? new Date(tiempos.ingreso_clo.ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;
  const salidaRutaTs = tiempos?.salida_ruta?.ts || null;
  const yaRegreso = !!tiempos?.ingreso_clo_fin?.ts;
  // El cronómetro solo corre mientras está en ruta: desde que salió hasta
  // que regresa a CLO (ingreso_clo_fin). Si ya regresó, se congela ahí.
  const msEnRuta = salidaRutaTs ? (yaRegreso ? tiempos.ingreso_clo_fin.ts - salidaRutaTs : ahora - salidaRutaTs) : null;

  return (
    <>
      <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 10 }}>Avance del {hoy.fecha}</div>

      {esBottom3 && (
        <div className="card" style={{ padding: 16, marginBottom: 16, border: "1px solid #FF6B6B", background: "#2a1414" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <AlertCircle size={18} color="#FF6B6B" />
            <span className="display" style={{ fontSize: 14, color: "#FF6B6B" }}>TU ERES SELECCIONADO PARA LA TERCERA MANO DEL PACHUCO</span>
          </div>
          <div style={{ fontSize: 12, color: "#E8EDF5", marginBottom: 10 }}>
            Estás entre los 3 con menor efectividad hoy. Para salir del listado, esto es lo que más te está pesando:
          </div>
          {hoy.indicadoresDebiles && hoy.indicadoresDebiles.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {hoy.indicadoresDebiles.slice(0, 4).map((ind, i) => (
                <div key={i} style={{ fontSize: 13, color: "#E8EDF5" }}>
                  • Vende <b style={{ color: "#F2B134" }}>{ind.unidad === "$" ? money(ind.faltante) : `${unidades(ind.faltante)}`}</b> más de <b>{ind.label}</b> para cerrar ese objetivo.
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#E8EDF5" }}>Sigue empujando tus indicadores del día para subir tu efectividad.</div>
          )}
        </div>
      )}

      {esPeor && (
        <div className="card" style={{ padding: 12, marginBottom: 16, border: "1px solid #FF6B6B" }}>
          <div style={{ fontSize: 12, color: "#FF6B6B", fontWeight: 700 }}>PROPUESTO PARA: "LA TERCERA MANO DEL PACHUCO" (menor efectividad de todas las rutas hoy)</div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <KpiCard
          icon={<Star size={14} />}
          label="Efectividad del día"
          value={`${hoy.efectividadPct.toFixed(0)}%`}
          accent={hoy.efectividadPct >= 80 ? "#3DDC97" : hoy.efectividadPct >= 50 ? "#F2B134" : "#FF6B6B"}
        />
      </div>

      {(horaIngresoClo || msEnRuta != null) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          {horaIngresoClo && (
            <KpiCard icon={<Truck size={14} />} label="Llegada a CLO" value={horaIngresoClo} />
          )}
          {msEnRuta != null && (
            <KpiCard
              icon={<Clock size={14} />}
              label={yaRegreso ? "Tiempo total en ruta" : "Tiempo en ruta (en vivo)"}
              value={formatCrono(msEnRuta)}
              accent={msEnRuta > UMBRAL_MS_EN_RUTA ? "#FF6B6B" : yaRegreso ? "#3DDC97" : "#F2B134"}
            />
          )}
        </div>
      )}
      {mensajeDia && mensajeDia.texto && (
        <div className="card" style={{ padding: 14, marginBottom: 16, border: "1px solid #F2B134" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <MessageSquare size={16} color="#F2B134" />
            <span className="display" style={{ fontSize: 13, color: "#F2B134" }}>MENSAJE DEL SUPERVISOR</span>
          </div>
          <div style={{ fontSize: 14, color: "#E8EDF5", whiteSpace: "pre-wrap" }}>{mensajeDia.texto}</div>
          <div style={{ fontSize: 11, color: "#9AA7BD", marginTop: 8 }}>
            {mensajeDia.autor ? `${mensajeDia.autor} · ` : ""}{mensajeDia.fecha}
          </div>
        </div>
      )}
      {hoy.bajoDesempeno && (
        <div className="card" style={{ padding: 14, marginBottom: 16, border: "1px solid #FF6B6B", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertCircle size={16} color="#FF6B6B" />
          <span style={{ fontSize: 13, color: "#FF6B6B" }}>Tu ritmo de hoy está por debajo de lo necesario. ¡Vamos con todo!</span>
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <KpiCard icon={<Target size={14} />} label="VOLUMEN" value={`${unidades(hoy.volumen.vendido)} / ${unidades(hoy.volumen.objetivo)}`} accent={metaColor(hoy.volumen.vendido, hoy.volumen.objetivo)} />
        {MARCAS_DIA.map((m) => (
          <KpiCard key={m.key} icon={<Star size={14} />} label={m.label} value={`${unidades(hoy.marcas[m.key].vendido)} / ${unidades(hoy.marcas[m.key].objetivo)}`} accent={metaColor(hoy.marcas[m.key].vendido, hoy.marcas[m.key].objetivo)} />
        ))}
        <KpiCard icon={<Star size={14} />} label="OTC" value={`${money(hoy.otc.vendido)} / ${money(hoy.otc.objetivo)}`} accent={metaColor(hoy.otc.vendido, hoy.otc.objetivo)} />
        <KpiCard icon={<Star size={14} />} label="OTC sin Vuala" value={`${hoy.otcSinVuala.piezas} pza.`} accent={hoy.otcSinVuala.cumple ? "#3DDC97" : "#FF6B6B"} />
        <KpiCard icon={<MapPin size={14} />} label="VISITAS EFECTIVAS" value={hoy.visitasEfectivas} />
      </div>
    </>
  );
}

