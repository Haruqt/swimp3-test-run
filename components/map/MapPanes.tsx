"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

// Fixed stacking order, independent of check/toggle order:
// shades (fills) -> borders (outlines) -> lines (creeks/canals/etc).
// Markers (turnout, water infra) don't need a custom pane -- Leaflet's
// built-in markerPane (z-index 600) already sits above all of these.
export const PANE = {
  shades: "pane-shades",
  borders: "pane-borders",
  lines: "pane-lines",
} as const;

const Z_INDEX: Record<string, number> = {
  [PANE.shades]: 405,
  [PANE.borders]: 415,
  [PANE.lines]: 425,
};

export function MapPanes() {
  const map = useMap();
  useEffect(() => {
    for (const [name, z] of Object.entries(Z_INDEX)) {
      if (!map.getPane(name)) {
        const pane = map.createPane(name);
        pane.style.zIndex = String(z);
      }
    }
  }, [map]);
  return null;
}