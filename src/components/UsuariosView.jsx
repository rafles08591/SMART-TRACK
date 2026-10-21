// @ts-nocheck
// UsuariosView.jsx — Alta / baja / PIN de usuarios nuevos (exclusivo de Gerente).
// Todo pasa por api/usuarios.js, que revisa en el servidor que quien llama sea Gerente.
// Los usuarios de siempre (rutas, supervisores, gerente…) no se tocan aquí: su PIN sigue
// en "Reiniciar PIN" y sus accesos en "Permisos".
import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const CLOS = ["PVR", "TEPIC"];

async function api(body) {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  if (!token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  const r = await fetch("/api/usuarios", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "short" }) : "nunca");

export default function UsuariosView({ onIrPermisos }) {
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState({ tipo: "staff", username: "", nombre: "", puesto_label: "Almacén", pin: "", clo: "PVR" });
  const [pinDe, setPinDe] = useState(null);      // username al que se le cambia el PIN
  const [nuevoPin, setNuevoPin] = useState("");
  const [borrar, setBorrar] = useState(null);    // username en confirmación de borrado

  async function cargar() {
    setCargando(true);
    try {
      const j = await api({ accion: "listar" });
      setUsuarios(j.usuarios || []);
    } catch (e) {
      setEstado("❌ " + e.message);
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { cargar(); }, []);

  async function hacer(body, ok) {
    setOcupado(true);
    setEstado("");
    try {
      await api(body);
      setEstado(ok);
      await cargar();
      return true;
    } catch (e) {
      setEstado("❌ " + e.message);
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function crear() {
    const puesto = form.tipo === "merch" ? "merch" : form.puesto_label;
    const ok = await hacer(
      { accion: "crear", ...form, puesto, puesto_label: form.tipo === "merch" ? `Merch · CLO ${form.clo}` : form.puesto_label },
      `✅ Usuario ${form.username.toUpperCase()} creado. Ya aparece en el login (${form.tipo === "merch" ? `Merch → ${form.clo}` : "Staff"}). Dale sus permisos.`
    );
    if (ok) setForm((f) => ({ ...f, username: "", nombre: "", pin: "" }));
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: k === "pin" ? e.target.value.replace(/\D/g, "").slice(0, 4) : e.target.value }));
  const puedeCrear = form.username.trim() && form.nombre.trim() && form.pin.length === 4 && (form.tipo === "merch" || form.puesto_label.trim());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card" style={{ padding: 16 }}>
        <div className="display" style={{ fontSize: 14, color: "#E8EDF5", marginBottom: 4 }}>➕ NUEVO USUARIO</div>
        <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 14 }}>
          Aparece solo en el login. Entra con su PIN de 4 dígitos y ve únicamente lo que le actives en Permisos.
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[["staff", "Staff"], ["merch", "Merch"]].map(([k, l]) => (
            <button key={k} className={form.tipo === k ? "btn" : "btn-ghost"} onClick={() => setForm((f) => ({ ...f, tipo: k }))}>{l}</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          <label style={st.campo}>
            <span style={st.lbl}>Usuario (así se guarda)</span>
            <input value={form.username} onChange={set("username")} placeholder="ALMACEN-1" style={{ textTransform: "uppercase" }} />
          </label>
          <label style={st.campo}>
            <span style={st.lbl}>Nombre (se ve en el login)</span>
            <input value={form.nombre} onChange={set("nombre")} placeholder="Juan Pérez" />
          </label>
          {form.tipo === "staff" ? (
            <label style={st.campo}>
              <span style={st.lbl}>Puesto</span>
              <input value={form.puesto_label} onChange={set("puesto_label")} placeholder="Almacén" />
            </label>
          ) : (
            <label style={st.campo}>
              <span style={st.lbl}>CLO</span>
              <select value={form.clo} onChange={set("clo")}>{CLOS.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
          )}
          <label style={st.campo}>
            <span style={st.lbl}>PIN (4 dígitos)</span>
            <input value={form.pin} onChange={set("pin")} inputMode="numeric" placeholder="1234" style={{ fontFamily: "monospace", letterSpacing: 4 }} />
          </label>
        </div>
        <button className="btn" style={{ marginTop: 14 }} disabled={!puedeCrear || ocupado} onClick={crear}>
          {ocupado ? "Guardando…" : "Crear usuario"}
        </button>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div className="display" style={{ fontSize: 14, color: "#E8EDF5" }}>👥 USUARIOS CREADOS DESDE LA APP</div>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={cargar} disabled={cargando}>{cargando ? "…" : "↻"}</button>
        </div>
        {estado && <div style={{ fontSize: 12.5, color: estado.startsWith("❌") ? "#fb7185" : "#3DDC97", marginBottom: 10 }}>{estado}</div>}
        {!cargando && !usuarios.length && <div style={{ fontSize: 13, color: "#9AA7BD" }}>Todavía no hay usuarios nuevos.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {usuarios.map((u) => (
            <div key={u.username} style={{ background: "#141b2c", borderRadius: 12, padding: 12, opacity: u.activo ? 1 : 0.6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: "#E8EDF5", fontWeight: 700 }}>{u.nombre} <span style={{ color: "#9AA7BD", fontWeight: 400, fontSize: 12 }}>· {u.username}</span></div>
                  <div style={{ fontSize: 11.5, color: "#9AA7BD" }}>
                    {u.tipo === "merch" ? `Merch · CLO ${u.clo}` : `Staff · ${u.puesto_label}`} · último acceso: {fmt(u.ultimo_acceso)}
                    {!u.activo && <span style={{ color: "#fb7185" }}> · DESACTIVADO</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => { setPinDe(pinDe === u.username ? null : u.username); setNuevoPin(""); }}>🔑 PIN</button>
                  {onIrPermisos && <button className="btn-ghost" style={{ fontSize: 12 }} onClick={onIrPermisos}>🎛️ Permisos</button>}
                  <button className="btn-ghost" style={{ fontSize: 12 }} disabled={ocupado}
                    onClick={() => hacer({ accion: "activar", username: u.username, activo: !u.activo }, u.activo ? `⏸️ ${u.username} desactivado: ya no puede entrar.` : `✅ ${u.username} activado.`)}>
                    {u.activo ? "⏸️ Desactivar" : "▶️ Activar"}
                  </button>
                  <button className="btn-ghost" style={{ fontSize: 12, color: "#fb7185" }} disabled={ocupado}
                    onClick={() => {
                      if (borrar !== u.username) { setBorrar(u.username); setTimeout(() => setBorrar(null), 4000); return; }
                      setBorrar(null);
                      hacer({ accion: "eliminar", username: u.username }, `🗑️ ${u.username} eliminado.`);
                    }}>
                    {borrar === u.username ? "¿Seguro? toca otra vez" : "🗑️ Eliminar"}
                  </button>
                </div>
              </div>
              {pinDe === u.username && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input value={nuevoPin} onChange={(e) => setNuevoPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric"
                    placeholder="Nuevo PIN" style={{ width: 130, fontFamily: "monospace", letterSpacing: 4 }} />
                  <button className="btn" disabled={nuevoPin.length !== 4 || ocupado}
                    onClick={async () => { if (await hacer({ accion: "pin", username: u.username, pin: nuevoPin }, `🔑 PIN de ${u.username} cambiado.`)) setPinDe(null); }}>
                    Guardar PIN
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const st = {
  campo: { display: "flex", flexDirection: "column", gap: 4 },
  lbl: { fontSize: 12, color: "#9AA7BD" },
};
