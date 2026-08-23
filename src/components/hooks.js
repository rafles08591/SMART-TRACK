// @ts-nocheck
import { useState, useRef, useCallback, useEffect } from "react";
import html2canvas from "html2canvas";

export function useCapturaImagen() {
  const capturaRef = useRef(null);
  const [generandoImagen, setGenerandoImagen] = useState(false);
  const [imagenLista, setImagenLista] = useState(null);
  const [errorImagen, setErrorImagen] = useState(null);

  async function generarImagen(nombreArchivo) {
    // Siempre arranca desde cero: limpia cualquier imagen anterior antes de
    // generar la nueva, para que un segundo click nunca reutilice ni
    // reenvíe la imagen vieja por accidente.
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
      // IMPORTANTE: solo se consideran contenedores con scroll horizontal
      // REAL (overflow-x: auto/scroll) — no cualquier elemento con
      // "overflow" en su estilo (como los que solo usan overflow:hidden
      // para redondear esquinas de una imagen), porque eso infla el ancho
      // calculado sin necesidad y descentra/corta la imagen generada.
      const elementosConScroll = Array.from(capturaRef.current.querySelectorAll("table, *")).filter((el) => {
        const overflowX = window.getComputedStyle(el).overflowX;
        return overflowX === "auto" || overflowX === "scroll" || el.tagName === "TABLE";
      });
      const anchosInternos = elementosConScroll.map((el) => el.scrollWidth).filter((w) => w > 0);
      const anchoCompleto = Math.max(capturaRef.current.clientWidth, ...anchosInternos, 0);

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
      } catch (err) {
        if (err && err.name !== "AbortError") {
          console.warn("Share falló, cae a descarga tradicional:", err);
          const link = document.createElement("a");
          link.download = nombreArchivo;
          link.href = url;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }
    } else {
      const link = document.createElement("a");
      link.download = nombreArchivo;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    // Al terminar de guardar/compartir (o cancelar), se limpia la imagen
    // generada — así, si se vuelve a presionar el botón, se genera y envía
    // una imagen NUEVA (con los datos más recientes) en vez de reenviar
    // esta misma otra vez.
    if (imagenLista?.url) URL.revokeObjectURL(imagenLista.url);
    setImagenLista(null);
  }

  useEffect(() => {
    return () => { if (imagenLista?.url) URL.revokeObjectURL(imagenLista.url); };
  }, [imagenLista]);

  return { capturaRef, generandoImagen, imagenLista, errorImagen, generarImagen, guardarOCompartir, limpiar: () => setImagenLista(null) };
}
