import { useRive } from "@rive-app/react-canvas";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

const RUTAS = ["J201", "J202", "J203", "J204", "J205", "J206", "J207"];
const DURACION_MS = 24000;

const CAMINO = [
  [198, 150],
  [214, 230],
  [168, 300],
  [214, 390],
  [150, 480],
  [206, 575],
  [168, 660],
  [196, 735],
];

function porcentajeMes(v) {
  const pct = Number(v?.tabs?.max?.avancePct);
  if (!Number.isFinite(pct)) return 0;
  return Math.min(Math.max(pct, 0), 100);
}

function easeOutQuart(x) {
  return 1 - Math.pow(1 - x, 4);
}

function puntoEnCamino(pct) {
  const t = Math.min(Math.max(pct, 0), 100) / 100;
  const tramo = t * (CAMINO.length - 1);
  const i = Math.min(Math.floor(tramo), CAMINO.length - 2);
  const f = tramo - i;
  const a = CAMINO[i];
  const b = CAMINO[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

function lugarEstacionado(puesto) {
  return [36 + (puesto - 1) * 46, 792];
}

function ponerNumero(vm, nombre, valor) {
  const prop = vm?.number?.(nombre);
  if (prop && "value" in prop) prop.value = valor;
}

function ponerTexto(vm, nombre, valor) {
  const prop = vm?.string?.(nombre);
  if (prop && "value" in prop) prop.value = valor;
}

function ponerBool(vm, nombre, valor) {
  const prop = vm?.boolean?.(nombre);
  if (prop && "value" in prop) prop.value = valor;
}

export default function CarreraMes({ porVendedor, onCerrar }) {
  const { rive, RiveComponent } = useRive({
    src: "/carrera_mes.riv",
    artboard: "SmartTrack",
    stateMachines: "Race",
    autoplay: true,
    autoBind: true,
  });

  const ranking = useMemo(() => {
    const pctPorRuta = {};
    (porVendedor || []).forEach((v) => {
      const match = String(v.name || "").toUpperCase().match(/J20[1-7]/);
      if (!match) return;
      pctPorRuta[match[0]] = porcentajeMes(v);
    });
    return RUTAS.map((ruta) => ({
      ruta,
      pct: pctPorRuta[ruta] ?? 0,
    })).sort((a, b) => b.pct - a.pct || a.ruta.localeCompare(b.ruta));
  }, [porVendedor]);

  const rankingKey = ranking.map((r) => `${r.ruta}:${r.pct.toFixed(1)}`).join("|");
  const yaAnimoRef = useRef("");

  useEffect(() => {
    if (!rive) return;
    if (yaAnimoRef.current === rankingKey) return;
    yaAnimoRef.current = rankingKey;

    let frameId = 0;
    let cancelado = false;
    const inicio = performance.now();

    const aplicar = (ahora) => {
      if (cancelado) return;
      const vm = rive.viewModelInstance;
      const recorrido = Math.min(Math.max((ahora - inicio) / DURACION_MS, 0), 1);
      const factor = easeOutQuart(recorrido);

      if (vm) {
        ranking.forEach((r, i) => {
          const puesto = i + 1;
          const visible = r.pct * factor;
          const [x, y] = visible >= 100 ? lugarEstacionado(puesto) : puntoEnCamino(visible);
          ponerNumero(vm, `Progress ${r.ruta}`, visible);
          ponerNumero(vm, `PassX ${r.ruta}`, x);
          ponerNumero(vm, `PassY ${r.ruta}`, y);
          ponerNumero(vm, `Rank ${r.ruta}`, puesto);
          ponerTexto(vm, `Rank text ${r.ruta}`, `${r.ruta} ${Math.round(visible)}% · ${puesto}°`);
          ponerBool(vm, `Glow ${r.ruta}`, puesto === 1);
          ponerBool(vm, `Candidate ${r.ruta}`, visible >= 100);
        });
      }

      if (recorrido < 1) frameId = requestAnimationFrame(aplicar);
    };

    frameId = requestAnimationFrame(aplicar);
    return () => {
      cancelado = true;
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [rive, ranking, rankingKey]);

  const contenido = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0a0a",
        zIndex: 999999,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {onCerrar && (
        <button
          onClick={onCerrar}
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            zIndex: 1000000,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            border: "1px solid #555",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          ← Regresar
        </button>
      )}

      <div style={{ flex: 1, minHeight: 0, width: "100%", display: "flex", justifyContent: "center" }}>
        <RiveComponent style={{ width: "100%", maxWidth: 480, height: "100%" }} />
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 12px", flexShrink: 0 }}>
        {ranking.map((r, i) => (
          <div
            key={r.ruta}
            style={{
              flex: "0 0 auto",
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: i === 0 ? "#3a2f0a" : "#1a1a1a",
              border: i === 0 ? "1px solid #FFD700" : "1px solid #333",
              borderRadius: 20,
              padding: "6px 12px",
              fontSize: 12,
              color: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: i === 0 ? "#FFD700" : "#9AA7BD", fontWeight: 700 }}>{i + 1}°</span>
            <span style={{ fontWeight: 600 }}>{r.ruta}</span>
            <span style={{ color: "#9AA7BD" }}>{r.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );

  return createPortal(contenido, document.body);
}
