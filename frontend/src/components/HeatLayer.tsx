import L from "leaflet";
import "leaflet.heat";
import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type { HeatPoint } from "../lib/api";

/**
 * Render a leaflet.heat layer over the map. Adds/removes itself cleanly
 * whenever `points` or `enabled` changes.
 */
export function HeatLayer({ points, enabled }: { points: HeatPoint[]; enabled: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || !points.length) return;
    // @ts-expect-error — leaflet.heat augments L
    const layer = L.heatLayer(
      points.map((p) => [p.lat, p.lng, p.weight]),
      { radius: 32, blur: 22, maxZoom: 17, minOpacity: 0.35,
        gradient: { 0.2: "#0EA5E9", 0.4: "#22C55E", 0.6: "#F59E0B", 0.8: "#F97316", 1.0: "#EF4444" } }
    );
    layer.addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map, points, enabled]);

  return null;
}
