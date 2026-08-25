import { useRef, useState } from "react";

/* ============================================================
   SwipeBackScreen.jsx
   Envuelve una vista existente (UnidadesView, EscaleraView, etc.)
   sin tocar su lógica interna. Da:
     - header con botón "‹ Regresar"
     - transición slide-in al abrir
     - gesto de swipe izquierda→derecha para regresar

   USO en App.tsx (ejemplo):

     const [vista, setVista] = useState(null); // null = launcher

     return (
       <>
         {!vista && (
           <LauncherGrid role={data.rol} onSelect={setVista} />
         )}

         {vista === "unidades" && (
           <SwipeBackScreen title="Unidades" onBack={() => setVista(null)}>
             <UnidadesView />
           </SwipeBackScreen>
         )}

         {vista === "escalera" && (
           <SwipeBackScreen title="Escalera" onBack={() => setVista(null)}>
             <EscaleraView />
           </SwipeBackScreen>
         )}

         // ...un bloque por cada key definido en LauncherGrid...
       </>
     );

   Nota: si ya usas react-router en vez de un estado `vista`, cambia
   `onBack` para que llame `navigate(-1)` en vez de `setVista(null)`;
   el resto del componente no cambia.
   ============================================================ */

export default function SwipeBackScreen({ title, icon, onBack, children }) {
  const screenRef = useRef(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0, locked: null, scrollEl: null });

  // Busca, desde el punto donde empezó el toque hacia arriba, si hay una
  // tabla/contenedor con su propio scroll horizontal (ej. tablas anchas
  // con overflow-x). Si el dedo arrancó ahí, el gesto de "regresar" se
  // desactiva por completo para ese toque — se deja que la tabla se mueva
  // de forma nativa, sin que la pantalla intente cerrarse.
  function buscarTablaConScrollPropio(el) {
    let nodo = el;
    while (nodo && nodo !== screenRef.current && nodo !== document.body) {
      if (nodo.scrollWidth > nodo.clientWidth + 1) {
        const overflowX = window.getComputedStyle(nodo).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") return nodo;
      }
      nodo = nodo.parentElement;
    }
    return null;
  }

  const handleTouchStart = (e) => {
    const t = e.touches[0];
    const scrollEl = buscarTablaConScrollPropio(e.target);
    startRef.current = { x: t.clientX, y: t.clientY, locked: null, scrollEl };
    setDragging(true);
  };

  const handleTouchMove = (e) => {
    // El toque empezó dentro de una tabla con scroll horizontal propio:
    // nunca lo tratamos como "regresar", dejamos que la tabla se mueva
    // de forma nativa (no llamamos preventDefault ni movemos la pantalla).
    if (startRef.current.scrollEl) return;

    const t = e.touches[0];
    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;

    if (!startRef.current.locked) {
      // Umbral más alto (14px) y exige que el movimiento sea claramente
      // horizontal (1.4x más ancho que alto) — menos sensible a arrastres
      // diagonales o accidentales.
      if (Math.abs(dx) > 14 || Math.abs(dy) > 14) {
        startRef.current.locked = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.4 ? "h" : "v";
      }
    }

    if (startRef.current.locked === "h") {
      e.preventDefault();
      setDragX(Math.max(0, dx));
    }
  };

  const handleTouchEnd = () => {
    setDragging(false);
    const width = screenRef.current?.offsetWidth ?? 1;
    // Umbral de cierre más alto (45% del ancho, antes 32%) — evita que un
    // arrastre a medias termine cerrando la pantalla sin querer.
    if (startRef.current.locked === "h" && dragX > width * 0.45) {
      onBack();
    } else {
      setDragX(0);
    }
    startRef.current.locked = null;
    startRef.current.scrollEl = null;
  };

  return (
    <div
      ref={screenRef}
      className="fixed inset-0 z-50 bg-slate-950 flex flex-col"
      style={{
        transform: `translateX(${dragX}px)`,
        transition: dragging ? "none" : "transform 0.28s cubic-bezier(.22,.9,.3,1)",
        touchAction: "pan-y",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 text-slate-100 px-3.5 py-2 rounded-xl text-[13.5px] font-bold"
        >
          ‹ Regresar
        </button>
        {icon}
        <h3 className="m-0 text-[17px] font-extrabold text-slate-100">{title}</h3>
      </div>

      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
