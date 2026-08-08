// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Upload, Download, CheckCircle2, RefreshCw } from "lucide-react";
import { RUTAS, NOMBRES } from "../constants";
import { fechaHoyISO } from "../utils";

export default function CargasView({ data, persist, persistCargas, puesto, rol, vendedorActual, onUpload, cargasFileInputRef, cargasStatus, onDescargar }) {
  const cargas = data.cargas || { fecha: null, bloqueado: false, items: [], enviosPorRuta: {} };
  const esStaffConPermiso = rol === "staff" && (puesto === "gerente" || puesto === "supervisor");
  const yaEnviado = !!cargas.enviosPorRuta?.[vendedorActual];
  const [rutaVistaStaff, setRutaVistaStaff] = useState(null);

  // Edición 100% local (borrador): mientras se escribe, NO se guarda nada en
  // Supabase — así una sincronización en tiempo real de otro dispositivo
  // nunca puede "regresar" el número a medio escribir. Solo al presionar
  // "Enviar" se manda todo de un jalón.
  const rutaActiva = rol === "vendedor" ? vendedorActual : rutaVistaStaff;
  const [borrador, setBorrador] = useState({});
  useEffect(() => { setBorrador({}); }, [rutaActiva]);

  function cambiarLocal(itemIndex, valor) {
    setBorrador((b) => ({ ...b, [itemIndex]: valor }));
  }

  async function enviarPara(nombreRuta) {
    await persistCargas((cargasFrescas) => {
      // Si mientras esta pantalla estaba abierta se subió una carga nueva
      // (distinta fecha), no tiene sentido aplicar cantidades pensadas para
      // la carga vieja — se avisa y se refresca con la carga nueva en vez
      // de arriesgarse a revivir la anterior por encima de esta.
      if (cargasFrescas.fecha !== cargas.fecha) {
        alert("La carga se actualizó mientras tenías esta pantalla abierta. Tu vista se va a refrescar con la carga más reciente — revisa tus cantidades y vuelve a enviar.");
        return cargasFrescas;
      }
      const items = cargasFrescas.items.map((it, i) => {
        if (borrador[i] === undefined) return it;
        const valor = borrador[i];
        return { ...it, porRuta: { ...it.porRuta, [nombreRuta]: { ...it.porRuta[nombreRuta], modificada: valor === "" ? null : Number(valor) } } };
      });
      return { ...cargasFrescas, items, enviosPorRuta: { ...(cargasFrescas.enviosPorRuta || {}), [nombreRuta]: true } };
    });
    setBorrador({});
  }

  return (
    <div>
      <div className="display" style={{ fontSize: 16, color: "#E8EDF5", marginBottom: 14 }}>CARGAS</div>

      {esStaffConPermiso && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
            <div className="display" style={{ fontSize: 13, color: "#9AA7BD" }}>
              {cargas.fecha ? `Carga del ${cargas.fecha}` : "Sin carga cargada"} {cargas.bloqueado && <span style={{ color: "#FF6B6B" }}>· BLOQUEADA</span>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => cargasFileInputRef.current?.click()}>
                <Upload size={14} style={{ verticalAlign: "-2px" }} /> Subir archivo de cargas
              </button>
              <input ref={cargasFileInputRef} type="file" accept=".xlsx,.xls,.xlsm" style={{ display: "none" }} onChange={onUpload} />
              {cargas.items.length > 0 && (
                <button className="btn-ghost" onClick={onDescargar}>
                  <Download size={14} style={{ verticalAlign: "-2px" }} /> Descargar archivo modificado
                </button>
              )}
            </div>
          </div>
          {cargasStatus && <div style={{ fontSize: 12, color: "#9AA7BD" }}>{cargasStatus}</div>}
          {cargas.bloqueado && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
              <div style={{ fontSize: 11, color: "#FF6B6B" }}>
                Ya se descargó el archivo final — los vendedores ya no pueden modificar sus cantidades.
              </div>
              <button className="btn-ghost" onClick={() => persistCargas((cargasFrescas) => ({ ...cargasFrescas, bloqueado: false }))}>
                <RefreshCw size={13} style={{ verticalAlign: "-2px" }} /> Reactivar edición
              </button>
            </div>
          )}

          {cargas.items.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="display" style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 8 }}>ESTATUS POR RUTA · TOCA PARA VER/EDITAR SU CARGA</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: rutaVistaStaff ? 14 : 0 }}>
                {RUTAS.map((nombreRuta) => {
                  const enviado = !!cargas.enviosPorRuta?.[nombreRuta];
                  const seleccionada = rutaVistaStaff === nombreRuta;
                  return (
                    <div
                      key={nombreRuta}
                      style={{
                        display: "flex", alignItems: "center", borderRadius: 8,
                        border: `1px solid ${enviado ? "#3DDC97" : "#1E2A42"}`,
                        background: seleccionada ? "#1E2A42" : "transparent", overflow: "hidden",
                      }}
                    >
                      <button
                        onClick={() => setRutaVistaStaff((r) => (r === nombreRuta ? null : nombreRuta))}
                        style={{
                          display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 10px",
                          border: "none", background: "transparent", color: enviado ? "#3DDC97" : "#9AA7BD", cursor: "pointer",
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: enviado ? "#3DDC97" : "#5b6478", display: "inline-block" }} />
                        {nombreRuta}{NOMBRES[nombreRuta] ? ` · ${NOMBRES[nombreRuta]}` : ""}
                      </button>
                      {enviado && (
                        <button
                          onClick={() => persistCargas((cargasFrescas) => ({ ...cargasFrescas, enviosPorRuta: { ...(cargasFrescas.enviosPorRuta || {}), [nombreRuta]: false } }))}
                          title="Reactivar edición para esta ruta"
                          style={{ display: "flex", alignItems: "center", padding: "5px 8px", border: "none", borderLeft: "1px solid #3DDC97", background: "transparent", color: "#3DDC97", cursor: "pointer" }}
                        >
                          <RefreshCw size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {rutaVistaStaff && (() => {
                const enviadoEstaRuta = !!cargas.enviosPorRuta?.[rutaVistaStaff];
                return (
                  <div>
                    <div style={{ fontSize: 11, color: "#9AA7BD", marginBottom: 8 }}>
                      Carga de {rutaVistaStaff}{NOMBRES[rutaVistaStaff] ? ` · ${NOMBRES[rutaVistaStaff]}` : ""}{cargas.bloqueado ? " (bloqueada, reactiva la edición para modificar)" : ""}
                    </div>
                    <TablaCargaVendedor items={cargas.items} nombreRuta={rutaVistaStaff} bloqueado={cargas.bloqueado} valoresLocales={borrador} onCambiarLocal={cambiarLocal} />
                    {!cargas.bloqueado && (
                      <button
                        className="btn"
                        style={{
                          marginTop: 12, width: "100%",
                          background: enviadoEstaRuta ? "#3DDC97" : undefined, borderColor: enviadoEstaRuta ? "#3DDC97" : undefined,
                          color: enviadoEstaRuta ? "#0B1220" : undefined,
                        }}
                        onClick={() => enviarPara(rutaVistaStaff)}
                      >
                        <CheckCircle2 size={14} style={{ verticalAlign: "-2px" }} /> {enviadoEstaRuta ? "Carga enviada correctamente ✓" : "Enviar / confirmar esta carga"}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {cargas.items.length === 0 ? (
        <div className="card" style={{ padding: 30, textAlign: "center", color: "#9AA7BD" }}>
          No hay una carga cargada por el momento.
        </div>
      ) : rol === "vendedor" ? (
        <>
          {cargas.bloqueado && (
            <div className="card" style={{ padding: 12, marginBottom: 14, border: "1px solid #FF6B6B" }}>
              <div style={{ fontSize: 12, color: "#FF6B6B" }}>Esta carga ya se descargó — ya no se puede modificar.</div>
            </div>
          )}
          {!cargas.bloqueado && (
            <div className="card" style={{ padding: 12, marginBottom: 14, border: `1px solid ${yaEnviado ? "#3DDC97" : "#F2B134"}` }}>
              <div style={{ fontSize: 12, color: yaEnviado ? "#3DDC97" : "#F2B134" }}>
                {yaEnviado ? "Ya enviaste tus cambios correctamente — no puedes seguir editando hasta que gerente/supervisor lo reactive." : "Aún no has enviado tus cambios."}
              </div>
            </div>
          )}
          <div style={{ fontSize: 12, color: "#9AA7BD", marginBottom: 10 }}>
            Escribe la cantidad que consideres — no se guarda hasta que le des "Enviar cambios". Si no cambias una cantidad, se usará la inicial tal cual viene en la carga propuesta.
          </div>
          <TablaCargaVendedor items={cargas.items} nombreRuta={vendedorActual} bloqueado={cargas.bloqueado || yaEnviado} valoresLocales={borrador} onCambiarLocal={cambiarLocal} />
          {!cargas.bloqueado && !yaEnviado && (
            <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={() => enviarPara(vendedorActual)}>
              <CheckCircle2 size={14} style={{ verticalAlign: "-2px" }} /> Enviar cambios
            </button>
          )}
        </>
      ) : (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 13, color: "#9AA7BD" }}>
            {cargas.items.length} artículos cargados para {Object.keys(cargas.items[0]?.porRuta || {}).length} rutas.
            Cada vendedor ya puede entrar a su propia pestaña "CARGAS" para revisar y, si quiere, ajustar su cantidad propuesta.
          </div>
        </div>
      )}
    </div>
  );
}

function TablaCargaVendedor({ items, nombreRuta, bloqueado, valoresLocales, onCambiarLocal }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it, i) => {
        const porRuta = it.porRuta[nombreRuta] || { inicial: 0, modificada: null };
        const valorGuardado = porRuta.modificada != null ? porRuta.modificada : porRuta.inicial;
        const valorMostrado = valoresLocales[i] !== undefined ? valoresLocales[i] : valorGuardado;
        return (
          <div key={i} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px", minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "#E8EDF5", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.marca}</div>
              <div style={{ fontSize: 11, color: "#9AA7BD" }}>{it.fa}</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 56 }}>
              <div style={{ fontSize: 10, color: "#9AA7BD" }}>Inicial</div>
              <div className="mono" style={{ fontSize: 15, color: "#E8EDF5" }}>{porRuta.inicial}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#9AA7BD" }}>Tu propuesta</div>
              <input
                type="number"
                value={valorMostrado}
                onChange={(e) => onCambiarLocal(i, e.target.value)}
                onFocus={(e) => e.target.select()}
                disabled={bloqueado}
                style={{ width: 80, padding: "6px 8px", textAlign: "center", fontSize: 14, boxSizing: "border-box" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Checklist de actividades (día/semana/mes). "Fija" reaparece siempre al
// reiniciar el ciclo; "temporal" solo existe por este ciclo y se borra sola
// al pasar el siguiente, a menos que se haya quedado pendiente.
