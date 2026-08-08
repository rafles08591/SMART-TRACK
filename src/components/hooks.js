// @ts-nocheck
import { useState, useRef, useCallback, useEffect } from "react";
import html2canvas from "html2canvas";

export function useCapturaImagen() {
  const capturaRef = useRef(null);
  const [generandoImagen, setGenerandoImagen] = useState(false);
  const [imagenLista, setImagenLista] = useState(null);
  const [errorImagen, setErrorImagen] = useState(null);

  async function generarImagen(nombreArchivo) {
    setGenerandoImagen(true);
    setErrorImagen(null);
    setImagenLista(null);
    try {
      if (!capturaRef.current) return;
      if (document.fonts && document.fonts.ready) {
        try {
          await Promise.race([document.fonts.ready, new Promise((res) => setTimeout(res, 2000))]);
        } catch (e) { /* seguir de todos modos */ }
      }
      // Se mide el ancho REAL que necesita el contenido: si adentro hay una
      // tabla más ancha que la pantalla (con scroll horizontal, como
      // "POR RUTA · HOY"), su scrollWidth es mayor al ancho visible en un
      // celular. Sin esto, html2canvas renderiza con el ancho angosto de la
      // pantalla y la tabla sale cortada — igual que si se le tomara una
      // captura de pantalla normal en vez de a la tabla completa.
      const anchosInternos = Array.from(capturaRef.current.querySelectorAll("table, [style*='overflow']"))
        .map((el) => el.scrollWidth)
        .filter((w) => w > 0);
      const anchoCompleto = Math.max(capturaRef.current.scrollWidth, capturaRef.current.clientWidth, ...anchosInternos, 0);

      const canvas = await Promise.race([
        html2canvas(capturaRef.current, {
          backgroundColor: "#0B1220", scale: 1.3, useCORS: true,
          width: anchoCompleto,
          windowWidth: anchoCompleto,
          onclone: (clonedDoc, clonedEl) => {
            // Se le da al elemento raíz clonado el ancho completo medido
            // arriba, y se le quita cualquier límite de ancho/scroll a los
            // contenedores internos (como el div de "overflow-x: auto" que
            // envuelve la tabla) — solo en esta copia usada para generar la
            // imagen, sin tocar la pantalla real.
            clonedEl.style.width = `${anchoCompleto}px`;
            clonedEl.style.maxWidth = "none";
            clonedDoc.querySelectorAll("*").forEach((el) => {
              const estilo = el.style;
              if (estilo && (estilo.overflowX === "auto" || estilo.overflowX === "scroll")) {
                estilo.overflowX = "visible";
                estilo.overflow = "visible";
                estilo.maxWidth = "none";
              }
            });
          },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Tardó demasiado en generarse (más de 20s).")), 20000)),
      ]);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setImagenLista({ blob, nombreArchivo, url });
      }, "image/png");
    } catch (e) {
      console.error("No se pudo generar la imagen:", e);
      setErrorImagen(e?.message || "No se pudo generar la imagen.");
    } finally {
      setGenerandoImagen(false);
    }
  }

  async function guardarOCompartir() {
    if (!imagenLista) return;
    const { blob, nombreArchivo, url } = imagenLista;
    const archivo = new File([blob], nombreArchivo, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: nombreArchivo });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
        console.warn("Share falló, cae a descarga tradicional:", err);
      }
    }
    const link = document.createElement("a");
    link.download = nombreArchivo;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  useEffect(() => {
    return () => { if (imagenLista?.url) URL.revokeObjectURL(imagenLista.url); };
  }, [imagenLista]);

  return { capturaRef, generandoImagen, imagenLista, errorImagen, generarImagen, guardarOCompartir, limpiar: () => setImagenLista(null) };
}

// Botón compacto "Guardar/Compartir imagen" que usa el hook de arriba —
// muestra "Generando...", el botón cuando ya está lista, y el error si algo falla.
