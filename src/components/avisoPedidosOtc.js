// avisoPedidosOtc.js — ¿Hay pedidos OTC nuevos (sin surtir)? Se usa para que el botón PEDIDOS OTC
// se ponga verde y destelle, y para el aviso de la pantalla de login. Funciona aun sin sesión.
import { useEffect, useState } from "react";

const CADA_MS = 45000; // revisa cada 45 s

export function usePedidosOtcNuevos(ruta = null) {
  const [info, setInfo] = useState({ total: 0, porRuta: {} });
  useEffect(() => {
    let vivo = true;
    async function revisar() {
      if (document.visibilityState === "hidden") return; // no gasta datos con la app en segundo plano
      try {
        const r = await fetch("/api/otc?accion=pendientes", { cache: "no-store" });
        const j = await r.json();
        if (vivo && r.ok) setInfo({ total: j.total || 0, porRuta: j.porRuta || {} });
      } catch { /* sin red: deja el último dato */ }
    }
    revisar();
    const t = setInterval(revisar, CADA_MS);
    const alVolver = () => document.visibilityState === "visible" && revisar();
    document.addEventListener("visibilitychange", alVolver);
    return () => { vivo = false; clearInterval(t); document.removeEventListener("visibilitychange", alVolver); };
  }, []);
  const r = ruta ? String(ruta).toUpperCase().replace("RUTA ", "").trim() : null;
  return { nuevos: r ? info.porRuta[r] || 0 : info.total, total: info.total, porRuta: info.porRuta };
}
