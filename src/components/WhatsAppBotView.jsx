// WhatsAppBotView.jsx — Pestaña "WHATSAPP" de SMART-TRACK.
// Gerente (o quien tenga el permiso) da de alta los teléfonos que reciben el
// bot y edita los textos de los mensajes. Todo se guarda en data.whatsappBot,
// que es lo que lee api/wa-resumen.js.
//
// Props: data, persistFresco (= persistParcialFresco de App.tsx), puedeEditar (bool)

import React, { useEffect, useMemo, useState } from "react";
import { NOMBRES } from "../constants";
import { supabase } from "../supabaseClient";

// Deben coincidir con PLANTILLAS_DEFAULT de api/_wa-lib.js
const PLANTILLAS_DEFAULT = {
  matutino: [
    "☀️ *Buenos días, {nombre}*",
    "Ruta {ruta} · corte del {fecha}",
    "",
    "📈 Mes: *{pct_mes}* (ritmo esperado {esperado}) {icono}",
    "📦 Día: {dia_vendido} de {dia_objetivo} ({pct_dia})",
    "🎯 Efectividad: {efectividad}",
    "🏁 Lugar {lugar} de {total_rutas} {medalla}",
    "",
    "{frase}",
    "",
    "Escribe *menu* para ver qué más te puedo decir.",
  ].join("\n"),
  alerta: [
    "⏰ *{nombre}*, así vas hoy:",
    "{dia_vendido} de {dia_objetivo} ({pct_dia})",
    "",
    "Te faltan *{falta_dia}* para tu meta del día. ¡Todavía da tiempo! 💪",
    "",
    "{retro_sin_vuala}",
  ].join("\n"),
  equipo: [
    "📊 *Resumen del equipo* · corte del {fecha}",
    "",
    "Equipo: *{pct_equipo}* del mes (ritmo esperado {esperado})",
    "{rutas_en_ritmo} de {total_rutas} rutas van en ritmo o arriba",
    "",
    "🏆 Arriba:",
    "{top}",
    "",
    "⚠️ Atención:",
    "{abajo}",
  ].join("\n"),
  dia: [
    "📦 *Avance del día* · corte {hora}",
    "{nombre}, llevas *{dia_vendido}* de {dia_objetivo} (*{pct_dia}*)",
    "",
    "🎯 Efectividad: {efectividad} · {visitas} visitas efectivas",
    "🏁 Lugar {lugar_dia} de {total_rutas} en el día {medalla_dia}",
    "{sin_vuala}",
    "",
    "{retro_sin_vuala}",
    "",
    "{frase_dia}",
  ].join("\n"),
  grupo: [
    "📊 *REPORTE DEL EQUIPO* · corte {fecha} {hora}",
    "",
    "🚀 MAX: *{pct_max}* (ritmo esperado {esperado}) · OPEN {pct_open} · CHAMPIONS {pct_champions}",
    "📦 Día: *{pct_dia_equipo}* · {rutas_meta_dia} de {total_rutas} rutas con meta",
    "💵 OTC semana: {pct_otc_semana} · 🧃 Sin Vuala cubierto: {sin_vuala_cubiertas} de {total_rutas}",
    "🛒 Visitas con compra hoy: {visitas_hoy}",
    "",
    "🏆 *Los que van jalando:*",
    "{top_general}",
    "",
    "🔻 *Retro para los de abajo:*",
    "{retro_bajos}",
  ].join("\n"),
  equipo_dia: [
    "📦 *Avance del día · Equipo* · corte {hora}",
    "",
    "Equipo: *{pct_dia_equipo}* ({dia_vendido_equipo} de {dia_objetivo_equipo})",
    "Rutas con meta del día cumplida: {rutas_meta_dia} de {total_rutas}",
    "",
    "🏆 Arriba hoy:",
    "{top_dia}",
    "",
    "⚠️ Atención:",
    "{abajo_dia}",
    "",
    "🧃 OTC Sin Vuala pendiente: {sin_vuala_pendientes}",
  ].join("\n"),
};

const VARIABLES = {
  matutino: [
    ["nombre", "Primer nombre"], ["ruta", "Ruta"], ["fecha", "Fecha del corte"], ["pct_mes", "% del mes"],
    ["esperado", "Ritmo esperado"], ["icono", "✅🟡🔴"], ["venta_mes", "Vendido mes"], ["objetivo_mes", "Objetivo mes"],
    ["dia_vendido", "Vendido día"], ["dia_objetivo", "Objetivo día"], ["pct_dia", "% del día"], ["falta_dia", "Falta del día"],
    ["efectividad", "Efectividad"], ["visitas", "Visitas efectivas"], ["lugar", "Lugar"], ["total_rutas", "Total rutas"],
    ["medalla", "🥇🥈🥉"], ["necesita", "Necesita por día"], ["dias_restantes", "Días restantes"],
    ["frase", "Frase automática"], ["marcas", "Lista de marcas OPEN"],
  ],
  equipo: [
    ["fecha", "Fecha del corte"], ["pct_equipo", "% equipo"], ["esperado", "Ritmo esperado"],
    ["venta_equipo", "Vendido equipo"], ["objetivo_equipo", "Objetivo equipo"], ["pct_dia_equipo", "% día equipo"],
    ["rutas_en_ritmo", "Rutas en ritmo"], ["total_rutas", "Total rutas"], ["top", "Top 3"], ["abajo", "3 más abajo"],
    ["ranking", "Ranking completo"], ["nombre", "Nombre de quien recibe"],
  ],
};
VARIABLES.alerta = [...VARIABLES.matutino, ["retro_sin_vuala", "Retro si NO cubre Sin Vuala"]];
VARIABLES.dia = [
  ["nombre", "Primer nombre"], ["ruta", "Ruta"], ["fecha", "Fecha"], ["hora", "Hora del corte"],
  ["dia_vendido", "Vendido hoy"], ["dia_objetivo", "Meta de hoy"], ["pct_dia", "% del día"], ["falta_dia", "Falta hoy"],
  ["efectividad", "Efectividad"], ["visitas", "Visitas efectivas"], ["lugar_dia", "Lugar del día"],
  ["total_rutas", "Total rutas"], ["medalla_dia", "🥇🥈🥉"], ["otc_dia", "OTC de hoy"], ["otc_objetivo", "Meta OTC"],
  ["marcas_dia", "Marcas de hoy"], ["frase_dia", "Frase automática"],
  ["sin_vuala", "OTC Sin Vuala (piezas)"], ["retro_sin_vuala", "Retro si NO cubre Sin Vuala"],
];
VARIABLES.grupo = [
  ["fecha", "Fecha"], ["hora", "Hora del corte"], ["esperado", "Ritmo esperado"], ["pct_max", "% MAX"],
  ["pct_open", "% OPEN"], ["pct_champions", "% CHAMPIONS"], ["pct_dia_equipo", "% día equipo"],
  ["rutas_meta_dia", "Rutas con meta del día"], ["total_rutas", "Total rutas"], ["pct_otc_semana", "% OTC semana"],
  ["sin_vuala_cubiertas", "Rutas con Sin Vuala"], ["visitas_hoy", "Visitas con compra hoy"],
  ["top_general", "Top 3 general"], ["retro_bajos", "Retro de los 3 más bajos"], ["ranking_general", "Ranking general"],
];
VARIABLES.equipo_dia = [
  ["fecha", "Fecha"], ["hora", "Hora del corte"], ["pct_dia_equipo", "% día equipo"], ["dia_vendido_equipo", "Vendido equipo"],
  ["dia_objetivo_equipo", "Meta equipo"], ["rutas_meta_dia", "Rutas con meta"], ["total_rutas", "Total rutas"],
  ["top_dia", "Top 3 del día"], ["abajo_dia", "3 más abajo"], ["ranking_dia", "Ranking del día"], ["nombre", "Nombre de quien recibe"],
  ["sin_vuala_pendientes", "Rutas sin cubrir Sin Vuala"],
];

const EJEMPLO = {
  nombre: "Francisco", nombre_completo: "Francisco Javier", ruta: "J201", fecha: "mar 06/10", pct_mes: "62%",
  esperado: "58%", icono: "✅", venta_mes: "1,180 paq", objetivo_mes: "1,900 paq", dia_vendido: "84 paq",
  dia_objetivo: "95 paq", pct_dia: "88%", falta_dia: "11 paq", efectividad: "85%", visitas: "17", lugar: "2",
  total_rutas: "7", medalla: "🥈", necesita: "34 paq", dias_restantes: "20",
  frase: "Vas arriba del ritmo. ¡A mantenerlo! 💪",
  marcas: "• ICE MIX: 820 paq de 1,025 paq · resta 205 paq\n• BLOSS MIX: ✅ meta cumplida",
  pct_equipo: "64%", venta_equipo: "13,400 paq", objetivo_equipo: "21,000 paq", pct_dia_equipo: "71%", rutas_en_ritmo: "5",
  top: "🥇 J202 Luis – 72%\n🥈 J204 Ana – 66%\n🥉 J201 Francisco – 62%",
  abajo: "🔻 J205 Pedro – 48%\n🔻 J207 Raúl – 51%\n🔻 J206 Mario – 55%",
  ranking: "🥇 J202 Luis – 72%\n🥈 J204 Ana – 66%\n…",
  hora: "1:35 pm", lugar_dia: "4", medalla_dia: "", otc_dia: "$1,450", otc_objetivo: "$2,000",
  frase_dia: "Vas a la mitad. Te faltan 33 paq, ¡a darle!",
  marcas_dia: "• ICE MIX: 30 paq de 40 paq\n• BLOSSOM MIX: ✅ 12 paq",
  dia_vendido_equipo: "500 paq", dia_objetivo_equipo: "742 paq", rutas_meta_dia: "1",
  top_dia: "🥇 J202 Riqui – 110%\n🥈 J206 Selene – 91%\n🥉 J207 Alfredo – 72%",
  abajo_dia: "🔻 J203 Ana – 35%\n🔻 J205 Alejandro – 40%\n🔻 J204 Noema – 61%",
  ranking_dia: "1. J202 Riqui – 110%\n2. J206 Selene – 91%\n…",
  sin_vuala: "🧃 OTC Sin Vuala: 1 de 2 piezas ❌",
  retro_sin_vuala: "⚠️ *OTC Sin Vuala NO cubierto:* llevas 1 pieza de 2. Te falta 1 pieza para cubrirlo hoy.",
  sin_vuala_pendientes: "J201 (1/2), J205 (0/2)",
  pct_max: "57%", pct_open: "63%", pct_champions: "62%", pct_otc_semana: "86%", sin_vuala_cubiertas: "2", visitas_hoy: "147",
  top_general: "🥇 J206 Selene – índice 95\n🥈 J202 Riqui – índice 89\n🥉 J203 Ana – índice 74",
  retro_bajos: "• *J205 Alejandro* (índice 65): le falta Sin Vuala 1/2, efectividad 20%, día 40%.\n• *J201 Francisco* (índice 65): le falta Sin Vuala 0/2, OTC semana 56%, día 65%.",
  ranking_general: "1. J206 Selene – 95\n2. J202 Riqui – 89\n…",
};

function llenar(tpl, vars) {
  const vacio = (v) => v === null || v === undefined || v === "";
  return String(tpl || "")
    .split("\n")
    .filter((l) => {
      const ks = [...l.matchAll(/\{(\w+)\}/g)].map((x) => x[1]);
      return !ks.length || !ks.every((k) => vacio(vars[k]));
    })
    .join("\n")
    .replace(/\{(\w+)\}/g, (_, k) => (vacio(vars[k]) ? "" : vars[k]))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Vista previa con el formato de WhatsApp (*negritas* y _cursivas_)
function VistaWhatsApp({ texto }) {
  const partes = String(texto).split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <div style={S.burbuja}>
      {partes.map((p, i) =>
        /^\*[^*]+\*$/.test(p) ? <b key={i}>{p.slice(1, -1)}</b>
          : /^_[^_]+_$/.test(p) ? <i key={i}>{p.slice(1, -1)}</i>
            : <span key={i}>{p}</span>
      )}
    </div>
  );
}

const nuevoId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const solo10 = (t) => String(t || "").replace(/\D/g, "").slice(-10);
const claveRuta = (r) => {
  const m = String(r || "").toUpperCase().match(/J\s?-?\d{3}/);
  return m ? m[0].replace(/[\s-]/g, "") : String(r || "").toUpperCase().trim();
};

export default function WhatsAppBotView({ data, persistFresco, puedeEditar = true }) {
  const guardado = data?.whatsappBot || {};
  const rutas = useMemo(
    () => (data?.vendedores || []).map((v) => v.name).filter(Boolean),
    [data?.vendedores]
  );

  const [seccion, setSeccion] = useState("contactos");
  const [contactos, setContactos] = useState(guardado.contactos || []);
  const [plantillas, setPlantillas] = useState({ ...PLANTILLAS_DEFAULT, ...(guardado.plantillas || {}) });
  const [aviso, setAviso] = useState(guardado.aviso || "");
  const [umbral, setUmbral] = useState(guardado.umbralAlerta || 70);
  const [avanceDiaActivo, setAvanceDiaActivo] = useState(guardado.avanceDiaActivo !== false);
  const [tonoBot, setTonoBot] = useState(guardado.tonoBot || "picante");
  const [tipoPlantilla, setTipoPlantilla] = useState("matutino");
  const [estado, setEstado] = useState("");
  const [gruposWa, setGruposWa] = useState(null);
  const [cargandoGrupos, setCargandoGrupos] = useState(false);

  async function cargarGrupos() {
    setCargandoGrupos(true);
    try {
      const { data: ses } = await supabase.auth.getSession();
      const r = await fetch("/api/wa-grupos", { headers: { Authorization: `Bearer ${ses?.session?.access_token || ""}` } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      setGruposWa(j.grupos || []);
      if (!(j.grupos || []).length) setEstado("⚠️ El número del bot no está en ningún grupo todavía.");
    } catch (err) {
      setEstado("❌ No se pudieron cargar los grupos: " + (err?.message || err));
    } finally {
      setCargandoGrupos(false);
    }
  }
  const [sucio, setSucio] = useState(false);

  // Si alguien más guardó mientras esta pantalla estaba abierta y aquí no hay cambios pendientes, refrescar.
  useEffect(() => {
    if (sucio) return;
    setContactos(guardado.contactos || []);
    setPlantillas({ ...PLANTILLAS_DEFAULT, ...(guardado.plantillas || {}) });
    setAviso(guardado.aviso || "");
    setUmbral(guardado.umbralAlerta || 70);
    setAvanceDiaActivo(guardado.avanceDiaActivo !== false);
    setTonoBot(guardado.tonoBot || "picante");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.whatsappBot]);

  const marcar = (fn) => (...args) => { setSucio(true); setEstado(""); fn(...args); };

  const editarContacto = marcar((id, campo, valor) =>
    setContactos((cs) => cs.map((c) => (c.id === id ? { ...c, [campo]: valor } : c)))
  );
  const agregar = marcar((tipo) =>
    setContactos((cs) => [
      ...cs,
      { id: nuevoId(), tipo, ruta: "", nombre: "", telefono: "", grupo: "", activo: true, matutino: true, dia: true, alerta: tipo === "vendedor" },
    ])
  );
  const quitar = marcar((id) => {
    if (window.confirm("¿Quitar este contacto? Ya no recibirá mensajes.")) setContactos((cs) => cs.filter((c) => c.id !== id));
  });

  const errores = useMemo(() => {
    const e = {};
    const vistos = {};
    contactos.forEach((c) => {
      if (c.tipo === "grupo") {
        if (!/@g\.us$/.test(String(c.grupo || "").trim())) e[c.id] = "Elige el grupo (o pega su ID que termina en @g.us)";
        else if (!String(c.nombre || "").trim()) e[c.id] = "Ponle un nombre al grupo";
        return;
      }
      const t = solo10(c.telefono);
      if (t.length !== 10) e[c.id] = "El teléfono debe tener 10 dígitos";
      else if (vistos[t]) e[c.id] = "Teléfono repetido";
      else if (!String(c.nombre || "").trim()) e[c.id] = "Falta el nombre";
      else if (c.tipo === "vendedor" && !c.ruta) e[c.id] = "Elige la ruta";
      vistos[t] = true;
    });
    return e;
  }, [contactos]);

  async function guardar() {
    if (Object.keys(errores).length) {
      setEstado("⚠️ Revisa los contactos marcados en rojo");
      setSeccion("contactos");
      return;
    }
    const limpios = contactos.map((c) => ({
      id: c.id, tipo: ["equipo", "grupo"].includes(c.tipo) ? c.tipo : "vendedor", ruta: c.tipo === "vendedor" ? c.ruta : "",
      nombre: String(c.nombre).trim(), telefono: c.tipo === "grupo" ? "" : solo10(c.telefono),
      grupo: c.tipo === "grupo" ? String(c.grupo || "").trim() : "",
      activo: c.activo !== false, matutino: c.matutino !== false, dia: c.dia !== false, alerta: c.tipo === "vendedor" && c.alerta !== false,
    }));
    // Solo se guardan las plantillas que cambiaron (las demás siguen el texto original).
    const plantillasEditadas = {};
    Object.keys(PLANTILLAS_DEFAULT).forEach((k) => {
      if ((plantillas[k] || "").trim() && plantillas[k] !== PLANTILLAS_DEFAULT[k]) plantillasEditadas[k] = plantillas[k];
    });
    setEstado("Guardando…");
    try {
      await persistFresco((fresca) => ({
        whatsappBot: {
          ...(fresca?.whatsappBot || {}),
          contactos: limpios,
          plantillas: plantillasEditadas,
          aviso: String(aviso || "").trim(),
          umbralAlerta: Math.min(100, Math.max(1, Number(umbral) || 70)),
          avanceDiaActivo,
          tonoBot,
          actualizado: new Date().toISOString(),
        },
      }));
      setContactos(limpios);
      setSucio(false);
      setEstado("✅ Guardado. El bot ya usa estos datos.");
    } catch (err) {
      setEstado("❌ No se pudo guardar: " + (err?.message || err));
    }
  }

  const ordenados = [...contactos].sort((a, b) =>
    a.tipo === b.tipo ? claveRuta(a.ruta).localeCompare(claveRuta(b.ruta)) : ({ grupo: 0, equipo: 1, vendedor: 2 }[a.tipo] - { grupo: 0, equipo: 1, vendedor: 2 }[b.tipo])
  );
  const rutasUsadas = new Set(contactos.filter((c) => c.tipo === "vendedor").map((c) => claveRuta(c.ruta)));
  const sinTelefono = rutas.filter((r) => !rutasUsadas.has(claveRuta(r)));

  const deshabilitado = !puedeEditar;

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div>
          <div style={S.titulo}>💬 Bot de WhatsApp</div>
          <div style={S.sub}>Resumen 8:00 am · Avance del día al cargar · Alerta de la tarde · Respuestas automáticas</div>
        </div>
        {puedeEditar && (
          <button style={{ ...S.btnPrimario, opacity: sucio ? 1 : 0.5 }} onClick={guardar} disabled={!sucio}>
            Guardar cambios
          </button>
        )}
      </div>
      {estado && <div style={S.estado}>{estado}</div>}
      {sucio && puedeEditar && <div style={S.pendiente}>Tienes cambios sin guardar</div>}

      <div style={S.tabs}>
        {[["contactos", "📇 Contactos"], ["mensajes", "✏️ Mensajes"]].map(([k, l]) => (
          <button key={k} onClick={() => setSeccion(k)} style={seccion === k ? S.tabOn : S.tab}>{l}</button>
        ))}
      </div>

      {seccion === "contactos" && (
        <div>
          {!Array.isArray(guardado.contactos) && (
            <div style={S.info}>
              Todavía no hay contactos guardados desde aquí. Al guardar, esta lista será la que use el bot
              (reemplaza a la de Supabase). Vuelve a agregar tu número de prueba.
            </div>
          )}
          {sinTelefono.length > 0 && (
            <div style={S.info}>Rutas sin teléfono: <b>{sinTelefono.map(claveRuta).join(", ")}</b></div>
          )}

          {ordenados.length === 0 && <div style={S.vacio}>No hay contactos. Agrega el primero 👇</div>}

          {ordenados.map((c) => (
            <div key={c.id} style={{ ...S.card, borderColor: errores[c.id] ? "#ef4444" : c.tipo === "grupo" ? "#25D36666" : c.tipo === "equipo" ? "#a78bfa55" : "#ffffff1a", opacity: c.activo === false ? 0.55 : 1 }}>
              <div style={S.cardTop}>
                <span style={c.tipo === "grupo" ? S.badgeGr : c.tipo === "equipo" ? S.badgeEq : S.badge}>
                  {c.tipo === "grupo" ? "👥 GRUPO" : c.tipo === "equipo" ? "📊 EQUIPO" : claveRuta(c.ruta) || "VENDEDOR"}
                </span>
                {puedeEditar && <button style={S.btnQuitar} onClick={() => quitar(c.id)}>Quitar</button>}
              </div>

              <div style={S.grid}>
                {c.tipo === "vendedor" && (
                  <label style={S.campo}>
                    <span style={S.lbl}>Ruta</span>
                    <select style={S.input} value={c.ruta} disabled={deshabilitado} onChange={(e) => {
                      const r = e.target.value;
                      editarContacto(c.id, "ruta", r);
                      if (!String(c.nombre || "").trim() && NOMBRES?.[r]) editarContacto(c.id, "nombre", NOMBRES[r]);
                    }}>
                      <option value="">Elegir…</option>
                      {rutas.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                )}
                {c.tipo === "grupo" && (
                  <label style={S.campo}>
                    <span style={S.lbl}>Grupo de WhatsApp</span>
                    {gruposWa ? (
                      <select style={S.input} value={c.grupo || ""} disabled={deshabilitado} onChange={(e) => {
                        const g = gruposWa.find((x) => x.id === e.target.value);
                        editarContacto(c.id, "grupo", e.target.value);
                        if (g && !String(c.nombre || "").trim()) editarContacto(c.id, "nombre", g.nombre);
                      }}>
                        <option value="">Elegir grupo…</option>
                        {gruposWa.map((g) => <option key={g.id} value={g.id}>{g.nombre}{g.miembros ? ` (${g.miembros})` : ""}</option>)}
                        {c.grupo && !gruposWa.some((g) => g.id === c.grupo) && <option value={c.grupo}>{c.grupo}</option>}
                      </select>
                    ) : (
                      <div style={{ display: "flex", gap: 8 }}>
                        <input style={{ ...S.input, flex: 1 }} value={c.grupo || ""} disabled={deshabilitado} placeholder="120363…@g.us"
                          onChange={(e) => editarContacto(c.id, "grupo", e.target.value.trim())} />
                        {puedeEditar && <button type="button" style={S.btnSec} onClick={cargarGrupos} disabled={cargandoGrupos}>
                          {cargandoGrupos ? "Cargando…" : "Buscar grupos"}
                        </button>}
                      </div>
                    )}
                  </label>
                )}
                <label style={S.campo}>
                  <span style={S.lbl}>{c.tipo === "grupo" ? "Nombre del grupo" : c.tipo === "equipo" ? "Nombre (Supervisor / Gerente)" : "Nombre del vendedor"}</span>
                  <input style={S.input} value={c.nombre} disabled={deshabilitado} placeholder={c.tipo === "grupo" ? "Ventas JMD" : "Nombre Apellido"}
                    onChange={(e) => editarContacto(c.id, "nombre", e.target.value)} />
                </label>
                {c.tipo !== "grupo" && (
                  <label style={S.campo}>
                    <span style={S.lbl}>WhatsApp (10 dígitos)</span>
                    <input style={S.input} value={c.telefono} disabled={deshabilitado} inputMode="numeric" placeholder="3221234567"
                      onChange={(e) => editarContacto(c.id, "telefono", e.target.value.replace(/[^\d\s-]/g, ""))} />
                  </label>
                )}
              </div>

              <div style={S.toggles}>
                <Toggle on={c.activo !== false} disabled={deshabilitado} label="Activo" onChange={(v) => editarContacto(c.id, "activo", v)} />
                <Toggle on={c.matutino !== false} disabled={deshabilitado} label={c.tipo === "grupo" ? "Reporte completo 8 am" : c.tipo === "equipo" ? "Tarjeta del equipo 8 am" : "Resumen 8 am"} onChange={(v) => editarContacto(c.id, "matutino", v)} />
                <Toggle on={c.dia !== false} disabled={deshabilitado} label={c.tipo === "grupo" ? "Reporte al cargar avance" : c.tipo === "equipo" ? "Avance del día del equipo" : "Avance del día"} onChange={(v) => editarContacto(c.id, "dia", v)} />
                {c.tipo === "vendedor" && (
                  <Toggle on={c.alerta !== false} disabled={deshabilitado} label="Alerta de la tarde" onChange={(v) => editarContacto(c.id, "alerta", v)} />
                )}
              </div>
              {errores[c.id] && <div style={S.error}>{errores[c.id]}</div>}
            </div>
          ))}

          {puedeEditar && (
            <div style={S.botones}>
              <button style={S.btnSec} onClick={() => agregar("vendedor")}>+ Vendedor</button>
              <button style={S.btnSec} onClick={() => agregar("equipo")}>+ Supervisor / Gerente (tarjeta del equipo)</button>
              <button style={{ ...S.btnSec, borderColor: "#25D366", color: "#25D366" }} onClick={() => agregar("grupo")}>+ Grupo de WhatsApp (reporte completo)</button>
            </div>
          )}
          <div style={S.nota}>
            Los contactos de tipo <b>Equipo</b> reciben cada mañana la tarjeta con las 7 rutas y pueden pedirle
            al bot <i>avance</i>, <i>ranking</i> y <i>hoy</i> del equipo completo.
          </div>
        </div>
      )}

      {seccion === "mensajes" && (
        <div>
          <div style={S.tabs}>
            {[["matutino", "☀️ Resumen 8 am"], ["equipo", "📊 Equipo 8 am"], ["dia", "📦 Avance del día"], ["equipo_dia", "📦 Equipo día"], ["grupo", "👥 Grupo"], ["alerta", "⏰ Alerta tarde"]].map(([k, l]) => (
              <button key={k} onClick={() => setTipoPlantilla(k)} style={tipoPlantilla === k ? S.tabOn : S.tab}>{l}</button>
            ))}
          </div>

          <div style={S.editorGrid}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <textarea
                style={S.textarea}
                value={plantillas[tipoPlantilla]}
                disabled={deshabilitado}
                onChange={marcar((e) => setPlantillas((p) => ({ ...p, [tipoPlantilla]: e.target.value })))}
              />
              {puedeEditar && (
                <button style={S.btnLink} onClick={marcar(() => setPlantillas((p) => ({ ...p, [tipoPlantilla]: PLANTILLAS_DEFAULT[tipoPlantilla] })))}>
                  ↺ Restaurar texto original
                </button>
              )}
              <div style={S.lbl}>Toca una variable para agregarla al final:</div>
              <div style={S.chips}>
                {VARIABLES[tipoPlantilla].map(([k, l]) => (
                  <button key={k} title={l} style={S.chip} disabled={deshabilitado}
                    onClick={marcar(() => setPlantillas((p) => ({ ...p, [tipoPlantilla]: `${p[tipoPlantilla]}{${k}}` })))}>
                    {`{${k}}`} <span style={{ opacity: 0.6 }}>{l}</span>
                  </button>
                ))}
              </div>
              <div style={S.nota}>
                *texto* = negritas · _texto_ = cursiva. Si una línea solo tiene variables sin dato, se omite sola.
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={S.lbl}>Vista previa (datos de ejemplo)</div>
              <VistaWhatsApp
                texto={
                  llenar(plantillas[tipoPlantilla], EJEMPLO) +
                  ((tipoPlantilla === "matutino" || tipoPlantilla === "equipo" || tipoPlantilla === "grupo") && aviso.trim() ? `\n\n📣 ${aviso.trim()}` : "")
                }
              />
              {tipoPlantilla !== "alerta" && <div style={S.nota}>+ se envía junto con la tarjeta en imagen.</div>}
            </div>
          </div>

          <div style={S.card}>
            <label style={S.campo}>
              <span style={S.lbl}>🤖 Tono del bot cuando le escriben (respuestas con IA y sus números reales)</span>
              <select style={{ ...S.input, maxWidth: 420 }} value={tonoBot} disabled={deshabilitado} onChange={marcar((e) => setTonoBot(e.target.value))}>
                <option value="picante">🌶️ Picante — carrilla pesada y groserías de compa</option>
                <option value="compa">😎 Compa — informal, con carrilla, sin groserías</option>
                <option value="normal">🙂 Normal — amable y profesional</option>
              </select>
            </label>
            <Toggle on={avanceDiaActivo} disabled={deshabilitado}
              label="📦 Mandar la tarjeta del Avance del día cada vez que se cargue un avance"
              onChange={marcar((v) => setAvanceDiaActivo(v))} />
            <label style={S.campo}>
              <span style={S.lbl}>📣 Aviso del día (opcional) — se agrega al final del resumen de la mañana</span>
              <input style={S.input} value={aviso} disabled={deshabilitado} placeholder="Ej. Hoy hay promo ICE MIX 2x1 en mayoristas"
                onChange={marcar((e) => setAviso(e.target.value))} />
            </label>
            <label style={{ ...S.campo, maxWidth: 260 }}>
              <span style={S.lbl}>⏰ Mandar alerta si a las 3 pm va abajo del…</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input style={{ ...S.input, width: 90 }} type="number" min={1} max={100} value={umbral} disabled={deshabilitado}
                  onChange={marcar((e) => setUmbral(e.target.value))} />
                <span style={S.sub}>% de su meta del día</span>
              </div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onChange, label, disabled }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!on)} style={S.toggleBtn}>
      <span style={{ ...S.toggleTrack, background: on ? "#22c55e" : "#334155" }}>
        <span style={{ ...S.toggleKnob, transform: on ? "translateX(18px)" : "translateX(0)" }} />
      </span>
      <span style={{ color: on ? "#e2e8f0" : "#94a3b8" }}>{label}</span>
    </button>
  );
}

const S = {
  wrap: { padding: 16, color: "#e2e8f0", maxWidth: 1000, margin: "0 auto", fontFamily: "inherit" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  titulo: { fontSize: 22, fontWeight: 800 },
  sub: { fontSize: 13, color: "#94a3b8" },
  estado: { marginTop: 10, padding: "8px 12px", borderRadius: 10, background: "#0f172a", border: "1px solid #334155", fontSize: 14 },
  pendiente: { marginTop: 8, fontSize: 13, color: "#f59e0b" },
  tabs: { display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" },
  tab: { padding: "8px 14px", borderRadius: 999, border: "1px solid #334155", background: "transparent", color: "#cbd5e1", cursor: "pointer", fontSize: 14 },
  tabOn: { padding: "8px 14px", borderRadius: 999, border: "1px solid #22d3ee", background: "#22d3ee22", color: "#22d3ee", cursor: "pointer", fontSize: 14, fontWeight: 700 },
  info: { padding: "10px 12px", borderRadius: 10, background: "#22d3ee14", border: "1px solid #22d3ee44", fontSize: 13, marginBottom: 10 },
  vacio: { padding: 24, textAlign: "center", color: "#94a3b8" },
  card: { padding: 14, borderRadius: 14, border: "1px solid #ffffff1a", background: "#ffffff08", marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  badge: { padding: "3px 10px", borderRadius: 999, border: "1px solid #22d3ee", color: "#22d3ee", fontSize: 12, fontWeight: 800 },
  badgeGr: { padding: "3px 10px", borderRadius: 999, border: "1px solid #25D366", color: "#25D366", fontSize: 12, fontWeight: 800 },
  badgeEq: { padding: "3px 10px", borderRadius: 999, border: "1px solid #a78bfa", color: "#a78bfa", fontSize: 12, fontWeight: 800 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 },
  campo: { display: "flex", flexDirection: "column", gap: 4 },
  lbl: { fontSize: 12, color: "#94a3b8", marginTop: 4 },
  input: { padding: "9px 10px", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", color: "#e2e8f0", fontSize: 15 },
  toggles: { display: "flex", gap: 14, flexWrap: "wrap" },
  toggleBtn: { display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", fontSize: 13, padding: 0 },
  toggleTrack: { width: 38, height: 20, borderRadius: 999, position: "relative", transition: "background .2s", display: "inline-block" },
  toggleKnob: { position: "absolute", top: 2, left: 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "transform .2s" },
  error: { color: "#ef4444", fontSize: 13 },
  botones: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 },
  btnPrimario: { padding: "10px 18px", borderRadius: 12, border: "none", background: "#22c55e", color: "#04130a", fontWeight: 800, cursor: "pointer" },
  btnSec: { padding: "10px 14px", borderRadius: 12, border: "1px dashed #22d3ee", background: "transparent", color: "#22d3ee", cursor: "pointer", fontWeight: 700 },
  btnQuitar: { padding: "4px 10px", borderRadius: 8, border: "1px solid #ef444466", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 12 },
  btnLink: { background: "transparent", border: "none", color: "#22d3ee", cursor: "pointer", padding: "6px 0", fontSize: 13 },
  nota: { fontSize: 12, color: "#94a3b8", marginTop: 8, lineHeight: 1.5 },
  editorGrid: { display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 },
  textarea: { width: "100%", minHeight: 260, padding: 12, borderRadius: 12, border: "1px solid #334155", background: "#0b1220", color: "#e2e8f0", fontSize: 14, fontFamily: "ui-monospace, Menlo, monospace", lineHeight: 1.5, boxSizing: "border-box" },
  chips: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chip: { padding: "4px 8px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 12, cursor: "pointer" },
  burbuja: { marginTop: 6, padding: "10px 12px", borderRadius: "12px 12px 12px 2px", background: "#1f2c34", color: "#e9edef", whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.45, border: "1px solid #ffffff10" },
};
