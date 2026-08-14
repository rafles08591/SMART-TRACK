// @ts-nocheck
/* =====================================================================
   ActividadView — módulo independiente de SMART-TRACK
   ---------------------------------------------------------------------
   Reporte de uso: cuántas veces entra cada usuario (login) y qué
   pestañas consulta. Los eventos se registran desde App.tsx
   (registrarEventoUso) cada vez que alguien inicia sesión o cambia de
   pestaña, guardados en su propia tabla de Supabase (eventos_uso) — NO
   en el documento JSON grande.

   Requiere esta tabla en Supabase (créala una sola vez, en SQL Editor):

     create table if not exists eventos_uso (
       id uuid primary key default gen_random_uuid(),
       usuario text,
       rol text,
       puesto text,
       tipo_evento text not null,
       pestana text,
       creado_en timestamptz not null default now()
     );
     alter table eventos_uso enable row level security;
     create policy "permitir todo por ahora" on eventos_uso
       for all using (true) with check (true);

   Solo Gerente ve este módulo (se controla en StaffView/constants.js).

   Cómo se conecta:
     <ActividadView />
===================================================================== */

import React, { useEffect, useMemo, useState } from "react";
import { Activity, Users, LogIn, Calendar, RefreshCw } from "lucide-react";
import { supabase } from "../supabaseClient";

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
};

const RANGOS = [
  { key: "7", label: "Últimos 7 días", dias: 7 },
  { key: "30", label: "Últimos 30 días", dias: 30 },
  { key: "90", label: "Últimos 90 días", dias: 90 },
];

function haceDias(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  return fecha.toISOString();
}

export default function ActividadView() {
  const [rango, setRango] = useState("7");
  const [eventos, setEventos] = useState(null); // null = cargando
  const [error, setError] = useState("");
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null);
  const [filtroPuesto, setFiltroPuesto] = useState("todos");

  async function cargar() {
    setEventos(null);
    setError("");
    try {
      const dias = RANGOS.find((r) => r.key === rango)?.dias || 7;
      let todos = [];
      let desde = 0;
      const tam = 1000;
      for (;;) {
        const { data: pagina, error: err } = await supabase
          .from("eventos_uso")
          .select("usuario, rol, puesto, tipo_evento, pestana, creado_en")
          .gte("creado_en", haceDias(dias))
          .order("creado_en", { ascending: false })
          .range(desde, desde + tam - 1);
        if (err) throw err;
        todos = todos.concat(pagina || []);
        if (!pagina || pagina.length < tam) break;
        desde += tam;
      }
      setEventos(todos);
    } catch (err) {
      console.error("Error cargando eventos_uso:", err);
      setError("No se pudo cargar el reporte de actividad. Verifica que la tabla 'eventos_uso' exista en Supabase.");
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [rango]);

  const porUsuario = useMemo(() => {
    if (!eventos) return [];
    const mapa = {};
    eventos.forEach((e) => {
      const key = e.usuario || "—";
      if (!mapa[key]) mapa[key] = { usuario: key, rol: e.rol, puesto: e.puesto, logins: 0, tabViews: 0, ultimaActividad: e.creado_en, pestanas: {} };
      if (e.tipo_evento === "login") mapa[key].logins += 1;
      if (e.tipo_evento === "tab_view") {
        mapa[key].tabViews += 1;
        mapa[key].pestanas[e.pestana || "—"] = (mapa[key].pestanas[e.pestana || "—"] || 0) + 1;
      }
      if (e.creado_en > mapa[key].ultimaActividad) mapa[key].ultimaActividad = e.creado_en;
    });
    return Object.values(mapa).sort((a, b) => (b.logins + b.tabViews) - (a.logins + a.tabViews));
  }, [eventos]);

  const opcionesPuesto = useMemo(() => {
    const set = new Set(porUsuario.map((u) => u.puesto || u.rol));
    return Array.from(set).sort();
  }, [porUsuario]);

  const porUsuarioFiltrado = useMemo(() => {
    if (filtroPuesto === "todos") return porUsuario;
    return porUsuario.filter((u) => (u.puesto || u.rol) === filtroPuesto);
  }, [porUsuario, filtroPuesto]);

  const totalLogins = eventos?.filter((e) => e.tipo_evento === "login").length ?? 0;
  const usuariosActivos = porUsuario.length;

  const detalleUsuario = useMemo(() => {
    if (!usuarioSeleccionado) return null;
    const u = porUsuario.find((x) => x.usuario === usuarioSeleccionado);
    if (!u) return null;
    const pestanasOrdenadas = Object.entries(u.pestanas).sort((a, b) => b[1] - a[1]);
    return { ...u, pestanasOrdenadas };
  }, [usuarioSeleccionado, porUsuario]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <style>{`
        .ac-card { background:${T.card}; border:1px solid ${T.border}; border-radius:14px; }
        .ac-select { background:${T.bg}; border:1px solid ${T.border}; color:${T.ink}; border-radius:8px; padding:7px 10px; font-size:12.5px; }
        .ac-btn-ghost { background:transparent; border:1px solid ${T.border}; color:${T.ink}; border-radius:8px; padding:6px 10px; cursor:pointer; font-size:12px; display:inline-flex; align-items:center; gap:5px; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Activity size={20} color={T.primary} />
          <span style={{ fontSize: 18, fontWeight: 800 }}>ACTIVIDAD</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Calendar size={14} color={T.muted} />
          <select className="ac-select" value={rango} onChange={(e) => setRango(e.target.value)}>
            {RANGOS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <select className="ac-select" value={filtroPuesto} onChange={(e) => setFiltroPuesto(e.target.value)}>
            <option value="todos">Todos los roles</option>
            {opcionesPuesto.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className="ac-btn-ghost" onClick={cargar}><RefreshCw size={12} /> Actualizar</button>
        </div>
      </div>

      {error && (
        <div className="ac-card" style={{ padding: 14, marginBottom: 16, color: T.bad, fontSize: 12.5 }}>{error}</div>
      )}

      {eventos === null && !error ? (
        <div className="ac-card" style={{ padding: 30, textAlign: "center", color: T.muted, fontSize: 13 }}>
          Cargando actividad…
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div className="ac-card" style={{ padding: 14, flex: "1 1 160px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.muted, fontSize: 11.5, marginBottom: 6 }}>
                <Users size={13} /><span>Usuarios activos</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{usuariosActivos}</div>
            </div>
            <div className="ac-card" style={{ padding: 14, flex: "1 1 160px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.muted, fontSize: 11.5, marginBottom: 6 }}>
                <LogIn size={13} /><span>Total de inicios de sesión</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{totalLogins}</div>
            </div>
          </div>

          {porUsuarioFiltrado.length === 0 ? (
            <div className="ac-card" style={{ padding: 30, textAlign: "center", color: T.muted, fontSize: 13 }}>
              {filtroPuesto === "todos" ? "No hay actividad registrada en este rango." : `No hay actividad de "${filtroPuesto}" en este rango.`}
            </div>
          ) : (
            <div className="ac-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: T.cardSoft, textAlign: "left" }}>
                      {["Usuario", "Rol", "Inicios de sesión", "Pestañas consultadas", "Última actividad", ""].map((h) => (
                        <th key={h} style={{ padding: "10px 12px", color: T.muted, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {porUsuarioFiltrado.map((u) => (
                      <tr key={u.usuario} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td style={{ padding: "10px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>{u.usuario}</td>
                        <td style={{ padding: "10px 12px", color: T.muted, whiteSpace: "nowrap" }}>{u.puesto || u.rol}</td>
                        <td style={{ padding: "10px 12px" }}>{u.logins}</td>
                        <td style={{ padding: "10px 12px" }}>{u.tabViews}</td>
                        <td style={{ padding: "10px 12px", color: T.muted, whiteSpace: "nowrap" }}>{new Date(u.ultimaActividad).toLocaleString("es-MX")}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <button className="ac-btn-ghost" onClick={() => setUsuarioSeleccionado(u.usuario)}>Ver detalle</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {detalleUsuario && (
            <div className="ac-card" style={{ padding: 18, marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{detalleUsuario.usuario} — pestañas más consultadas</div>
                <button className="ac-btn-ghost" onClick={() => setUsuarioSeleccionado(null)}>Cerrar</button>
              </div>
              {detalleUsuario.pestanasOrdenadas.length === 0 ? (
                <div style={{ fontSize: 12.5, color: T.muted }}>Sin pestañas registradas en este rango.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {detalleUsuario.pestanasOrdenadas.map(([pestana, veces]) => {
                    const max = detalleUsuario.pestanasOrdenadas[0][1];
                    return (
                      <div key={pestana} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 130, fontSize: 12.5, textTransform: "uppercase", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pestana}</div>
                        <div style={{ flex: 1, height: 8, borderRadius: 999, background: "#1B2740", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(veces / max) * 100}%`, background: T.primary, borderRadius: 999 }} />
                        </div>
                        <div style={{ width: 30, textAlign: "right", fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>{veces}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
