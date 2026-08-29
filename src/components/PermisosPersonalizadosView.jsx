// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Search, Sliders, CheckCircle2 } from "lucide-react";
import { OBJETIVO_TABS, USUARIOS_APP } from "../constants";

// Permisos personalizados por usuario — panel exclusivo de Gerente.
//
// Diseño: data.permisosPersonalizados[username] es OPCIONAL. Si no existe
// para un usuario, ese usuario sigue viendo exactamente las pestañas que ya
// veía antes de que existiera esta pantalla (las reglas fijas por rol que
// ya viven en VendorView.jsx / StaffView.jsx no cambian). Solo cuando
// Gerente activa "Personalizar" para alguien en específico, se guarda una
// lista completa de pestañas para ESA persona, que reemplaza la regla por
// rol únicamente para ella.
//
// Alcance actual: solo rutas de vendedor y Supervisor-1/Supervisor-2, que
// son los que ya sabemos que leen este campo (VendorView.jsx / StaffView.jsx).
// Suplente-1/2 se administran aparte, desde Unidades → Permisos de Suplente
// (para no tener dos sistemas compitiendo por el mismo dato). Merch, Admin y
// Liquidación todavía no leen este campo en ningún lado — agregarlos aquí no
// haría nada hasta que se revise el archivo que maneja esas vistas.
const USUARIOS_CON_PERMISOS_EDITABLES = new Set([
  "RUTA J201", "RUTA J202", "RUTA J203", "RUTA J204", "RUTA J205", "RUTA J206", "RUTA J207",
  "SUPERVISOR-1", "SUPERVISOR-2",
]);

// Debe coincidir con RUTAS_CON_KM en VendorView.jsx.
const RUTAS_CON_KM = ["RUTA J201", "RUTA J203"];

// Pestañas que no tiene sentido prender/apagar por persona (se resuelven
// distinto). reset_pin y permisos SÍ son asignables (Gerente los tiene fijos
// siempre; el resto de roles solo los ven si Gerente se los da aquí mismo).
const TABS_NO_ASIGNABLES = new Set([]);

const TABS_ASIGNABLES = OBJETIVO_TABS.filter((t) => !TABS_NO_ASIGNABLES.has(t.key));

// Replica las reglas por rol que ya existen en VendorView.jsx / StaffView.jsx,
// SOLO para precargar el checklist la primera vez que se activa
// "Personalizar" para alguien. Si esas reglas cambian en el código real, hay
// que actualizar esta función para que el precargado siga reflejando la
// realidad — si no, sigue funcionando bien, solo el precargado inicial
// quedaría desactualizado (el usuario lo puede ajustar a mano de todos modos).
function defaultTabsFor(username) {
  if (username.startsWith("RUTA ")) {
    return OBJETIVO_TABS.filter((t) => {
      if (t.key === "km") return RUTAS_CON_KM.includes(username);
      return !["tiempos", "rutas", "actividades_dia", "actividades_semana", "actividades_mes", "cotizador", "pwst", "tepic", "actividad", "creditos", "altas_cliente"].includes(t.key);
    }).map((t) => t.key);
  }
  if (username === "SUPERVISOR-2") {
    return ["dia", "mesa", "cuponera", "tiempos", "unidades", "tepic", "avisos", "reloj_checador", "mi_fondo"];
  }
  if (username === "SUPERVISOR-1") {
    return OBJETIVO_TABS.filter((t) => !["actividades_semana", "actividades_mes", "cotizador", "creditos", "tepic", "actividad", "km", "alta_cliente"].includes(t.key)).map((t) => t.key);
  }
  return [];
}

export default function PermisosPersonalizadosView({ data, persistFresco }) {
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);
  const [personalizarActivo, setPersonalizarActivo] = useState(false);
  const [tabsSeleccionadas, setTabsSeleccionadas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);

  const opciones = USUARIOS_APP.filter((u) => USUARIOS_CON_PERMISOS_EDITABLES.has(u.username));
  const filtrados = opciones.filter((u) =>
    u.label.toLowerCase().includes(busqueda.toLowerCase()) || u.username.toLowerCase().includes(busqueda.toLowerCase())
  );

  useEffect(() => {
    if (!seleccionado) return;
    const existente = data.permisosPersonalizados?.[seleccionado.username];
    if (existente) {
      setPersonalizarActivo(true);
      setTabsSeleccionadas(existente);
    } else {
      setPersonalizarActivo(false);
      setTabsSeleccionadas(defaultTabsFor(seleccionado.username));
    }
    setExito(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionado?.username]);

  function alternarTab(key) {
    setTabsSeleccionadas((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }

  async function guardar() {
    if (!seleccionado) return;
    setGuardando(true);
    try {
      await persistFresco((fresca) => {
        const permisos = { ...(fresca.permisosPersonalizados || {}) };
        if (personalizarActivo) {
          permisos[seleccionado.username] = tabsSeleccionadas;
        } else {
          delete permisos[seleccionado.username];
        }
        return { permisosPersonalizados: permisos };
      });
      setExito(true);
      setTimeout(() => setExito(false), 2500);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Sliders size={16} color="#38bdf8" />
        <span className="display" style={{ fontSize: 14, color: "#E8EDF5" }}>PERMISOS POR USUARIO</span>
      </div>
      <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 16 }}>
        Por ahora aplica a rutas de vendedor y Supervisor-1/Supervisor-2. Suplente-1/2 se manejan aparte, desde Unidades → Permisos de Suplente.
      </div>

      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9AA7BD" }} />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar usuario..."
          style={{ width: "100%", padding: "10px 12px 10px 36px", boxSizing: "border-box" }}
        />
      </div>

      <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
        {filtrados.map((u) => (
          <button
            key={u.username}
            className={seleccionado?.username === u.username ? "btn" : "btn-ghost"}
            onClick={() => setSeleccionado(u)}
            style={{ textAlign: "left", fontSize: 13 }}
          >
            {u.label}
          </button>
        ))}
      </div>

      {seleccionado && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "#141b2c", borderRadius: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, color: "#E8EDF5", fontWeight: 600 }}>Personalizar accesos de {seleccionado.label}</div>
              <div style={{ fontSize: 11, color: "#9AA7BD" }}>
                {personalizarActivo ? "Activado — usando la lista de abajo" : "Desactivado — usando el comportamiento normal de su rol"}
              </div>
            </div>
            <button className={personalizarActivo ? "btn" : "btn-ghost"} onClick={() => setPersonalizarActivo((v) => !v)}>
              {personalizarActivo ? "Activado" : "Desactivado"}
            </button>
          </div>

          {personalizarActivo && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, marginBottom: 16 }}>
              {TABS_ASIGNABLES.map((t) => (
                <label key={t.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#E8EDF5", background: "#141b2c", padding: "8px 10px", borderRadius: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={tabsSeleccionadas.includes(t.key)} onChange={() => alternarTab(t.key)} />
                  {t.label}
                </label>
              ))}
            </div>
          )}

          {exito && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#3DDC97", fontSize: 12.5, marginBottom: 12 }}>
              <CheckCircle2 size={14} /> Guardado.
            </div>
          )}

          <button className="btn" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </>
      )}
    </div>
  );
}
