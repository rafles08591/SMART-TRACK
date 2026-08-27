"use client";
import { useRive } from "@rive-app/react-canvas";
import { useEffect } from "react";

// Mapea cada vendedor a su Timeline en el .riv
const TRUCKS = {
  vendedor1: "Timeline J201",
  vendedor2: "Timeline J202",
  vendedor3: "Timeline J203",
  vendedor4: "Timeline J204",
  vendedor5: "Timeline J205",
  vendedor6: "Timeline J206",
  vendedor7: "Timeline J207",
};

const DURACION_TOTAL = 4; // segundos, igual a la duración que pusiste en cada Timeline

export default function CarrerasVentas({ progresoPorVendedor }) {
  // progresoPorVendedor = { vendedor1: 65, vendedor2: 30, ... } (0-100)

  const { rive, RiveComponent } = useRive({
    src: "/carreras_ventas.riv",
    autoplay: false, // NO reproducir solas, las controlamos manualmente
    stateMachines: "State Machine 1",
  });

  useEffect(() => {
    if (!rive) return;

    Object.entries(progresoPorVendedor).forEach(([vendedor, porcentaje]) => {
      const nombreTimeline = TRUCKS[vendedor];
      if (!nombreTimeline) return;

      const segundos = (porcentaje / 100) * DURACION_TOTAL;
      rive.scrub(nombreTimeline, segundos);
    });
  }, [rive, progresoPorVendedor]);

  return <RiveComponent style={{ width: "100%", height: "100vh" }} />;
}
