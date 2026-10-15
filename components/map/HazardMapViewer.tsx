"use client";

import { MapContainer, TileLayer, LayersControl, GeoJSON, ImageOverlay, useMap } from "react-leaflet";
import { useEffect, useMemo, useState } from "react";
import type { Layer, LatLngBoundsExpression, PathOptions } from "leaflet";
import L from "leaflet";
import { MapPanes, PANE } from "./MapPanes";
import { LocateButton, FullscreenButton } from "./MapButtons";

interface LegendItem {
  label: string;
  color: string;
  range?: string;
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Matches the qgis2web export's `hazard_level` property (see
// public/geo/flood-100yr.json) and the legend colors used across the app.
const hazardColors: Record<string, string> = {
  Low: "#FFD500",
  Medium: "#FF7A00",
  High: "#FF1E1E",
};

const HOVER_COLOR = "#22d3ee";

function hazardStyle(color: string) {
  return (): PathOptions => ({ color, weight: 0.6, fillColor: color, fillOpacity: 0.78 });
}

function onEachHazardFeature(level: string, color: string) {
  return (feature: GeoJSON.Feature, layer: Layer) => {
    layer.bindPopup(`<strong>${level} Hazard</strong>`);
    layer.on({
      mouseover: (e) => {
        const target = e.target;
        target.setStyle({ weight: 2.5, color: HOVER_COLOR, fillColor: HOVER_COLOR, fillOpacity: 0.9 });
        target.bringToFront();
      },
      mouseout: (e) => {
        e.target.setStyle({ color, weight: 0.6, fillColor: color, fillOpacity: 0.78 });
      },
    });
  };
}

// Evenly-spaced hue per index so any number of barangays stay visually
// distinct — same helper used in SensorMap.tsx for the Data/Sensors page.
function barangayColor(index: number, total: number): string {
  const hue = Math.round((index * 360) / Math.max(total, 1));
  return `hsl(${hue}, 70%, 55%)`;
}

// A small colored square swatch next to a layer-control label, matching
// the original site's qgis2web-exported layer panel. react-leaflet's
// LayersControl renders `name` via the underlying Leaflet control's
// innerHTML, not as React — so this returns a plain HTML string, not JSX.
function swatchLabel(color: string, text: string): string {
  return `<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:2px;background:${color};display:inline-block;flex-shrink:0"></span>${text}</span>`;
}

// Explicit "locate me" button — a visible control the person taps,
// matching the original site's location-pin button under the zoom
// controls, instead of silently asking for permission on page load.
// Same fix already proven necessary on the Data/Sensors map: this loads via
// next/dynamic (ssr:false), so Leaflet can measure its container a beat
// before the flex layout has fully settled. When that happens, controls
// (zoom, layers) render in the DOM at their CSS-positioned spot but
// Leaflet's internal click-coordinate mapping is based on the stale
// measurement, so they render visible but stop responding to clicks.
// Re-measuring after mount fixes it.
function InvalidateSizeOnMount() {
  const map = useMap();
  useEffect(() => {
    const id = requestAnimationFrame(() => map.invalidateSize());
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", onResize);
    };
  }, [map]);
  return null;
}


export function HazardMapViewer({
  geojsonUrl,
  imageOverlayUrl,
  imageBounds,
  legend,
}: {
  geojsonUrl?: string | null;
  imageOverlayUrl?: string | null;
  imageBounds?: [[number, number], [number, number]] | null;
  legend?: LegendItem[] | null;
}) {
  // Initialized to EMPTY FeatureCollections (not null) on purpose — the
  // <LayersControl.Overlay> entries below are rendered unconditionally
  // from the very first render, and only the underlying `data` prop
  // updates once each fetch resolves. Conditionally mounting/unmounting
  // whole Overlay children after the LayersControl has already
  // initialized is what was silently dropping the black-border layer
  // from the panel before — this sidesteps that entirely.
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection>(EMPTY_FC);
  const [cauayanBoundary, setCauayanBoundary] = useState<GeoJSON.FeatureCollection>(EMPTY_FC);
  const [hasGeojson, setHasGeojson] = useState(false);
  const [hasBoundary, setHasBoundary] = useState(false);

  useEffect(() => {
    if (!geojsonUrl) {
      setGeojson(EMPTY_FC);
      setHasGeojson(false);
      return;
    }
    let cancelled = false;
    fetch(geojsonUrl)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setGeojson(data);
          setHasGeojson(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGeojson(EMPTY_FC);
          setHasGeojson(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [geojsonUrl]);

  useEffect(() => {
    // The colorful per-barangay boundary (kept as its own selectable
    // option — some people want the barangay breakdown, not everyone
    // wants plain black).
    fetch("/geo/cauayan-boundary.json")
      .then((res) => res.json())
      .then((data: GeoJSON.FeatureCollection) => {
        setCauayanBoundary({
          ...data,
          features: data.features.map((f, i) => ({
            ...f,
            properties: { ...f.properties, __barangayIndex: i },
          })),
        });
        setHasBoundary(true);
      })
      .catch(() => {});
  }, []);

  // Split into 3 independently toggleable layers (Low/Medium/High) instead
  // of one combined blob — matches the original's per-hazard-level
  // checkboxes in its layer panel.
  const byLevel = useMemo(() => {
    const groups: Record<string, GeoJSON.FeatureCollection> = {
      Low: { type: "FeatureCollection", features: [] },
      Medium: { type: "FeatureCollection", features: [] },
      High: { type: "FeatureCollection", features: [] },
    };
    for (const feature of geojson.features) {
      const level = feature.properties?.hazard_level as string | undefined;
      if (level && groups[level]) groups[level].features.push(feature);
    }
    return groups;
  }, [geojson]);

  const hasOverlay = Boolean(hasGeojson || (imageOverlayUrl && imageBounds));

  return (
    <div id="map-fullscreen-target" className="relative h-full w-full [&_.leaflet-control-layers]:!rounded-lg [&_.leaflet-control-layers]:!border-none [&_.leaflet-control-layers]:!bg-black/75 [&_.leaflet-control-layers]:!p-3 [&_.leaflet-control-layers]:!text-white [&_.leaflet-control-layers-base]:!text-white [&_.leaflet-control-layers-list_label]:!text-white [&_.leaflet-control-layers-separator]:!border-white/20">
      <MapContainer center={[16.965, 121.77]} zoom={12} style={{ height: "100%", width: "100%" }}>
        <MapPanes />
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="World Imagery">
            <TileLayer
              attribution="Esri"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="OpenStreetMap">
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="OpenStreetMap.HOT">
            <TileLayer
              attribution="&copy; OpenStreetMap contributors, Tiles style by Humanitarian OpenStreetMap Team"
              url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="World Topo">
            <TileLayer
              attribution="Esri"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>

          <LayersControl.Overlay name="Cauayan_City (barangay colors)">
            <GeoJSON
              key={`barangay-${hasBoundary}`}
              pane={PANE.shades}
              data={cauayanBoundary}
              style={(feature) => {
                const idx = (feature?.properties?.__barangayIndex ?? 0) as number;
                const color = barangayColor(idx, Math.max(cauayanBoundary.features.length, 1));
                return { color, weight: 1.5, fillColor: color, fillOpacity: 0.35 };
              }}
            />
          </LayersControl.Overlay>

          <LayersControl.Overlay checked name="Cauayan_City (black border)">
            <GeoJSON
              key={`outline-${hasBoundary}`}
              pane={PANE.borders}
              data={cauayanBoundary}
              style={{ color: "#000000", weight: 1.2, fill: false }}
            />
          </LayersControl.Overlay>

          <LayersControl.Overlay checked name={swatchLabel(hazardColors.Low, "Low Hazard (0.1m-0.5m)")}>
            <GeoJSON key={`low-${hasGeojson}`} pane={PANE.shades} data={byLevel.Low} style={hazardStyle(hazardColors.Low)} onEachFeature={onEachHazardFeature("Low", hazardColors.Low)} />
          </LayersControl.Overlay>
          <LayersControl.Overlay checked name={swatchLabel(hazardColors.Medium, "Medium Hazard (0.5m-1.5m)")}>
            <GeoJSON key={`medium-${hasGeojson}`} pane={PANE.shades} data={byLevel.Medium} style={hazardStyle(hazardColors.Medium)} onEachFeature={onEachHazardFeature("Medium", hazardColors.Medium)} />
          </LayersControl.Overlay>
          <LayersControl.Overlay checked name={swatchLabel(hazardColors.High, "High Hazard (beyond 1.5m)")}>
            <GeoJSON key={`high-${hasGeojson}`} pane={PANE.shades} data={byLevel.High} style={hazardStyle(hazardColors.High)} onEachFeature={onEachHazardFeature("High", hazardColors.High)} />
          </LayersControl.Overlay>
        </LayersControl>

        {/* Interim raster fallback: only used before a real geojson_url
            exists for a given map. */}
        {!hasGeojson && imageOverlayUrl && imageBounds && (
          <ImageOverlay url={imageOverlayUrl} bounds={imageBounds as LatLngBoundsExpression} opacity={0.75} />
        )}

        <LocateButton />
        <FullscreenButton />
        <InvalidateSizeOnMount />
      </MapContainer>

      {!hasOverlay && (
        <div className="pointer-events-none absolute left-3 top-3 z-[1000] rounded-lg bg-white/90 px-3 py-2 text-xs text-ink/60 shadow">
          No hazard overlay asset hosted yet for this map — add a{" "}
          <code className="rounded bg-ink/5 px-1">geojson_url</code> or{" "}
          <code className="rounded bg-ink/5 px-1">image_overlay_url</code> to this row in{" "}
          <code className="rounded bg-ink/5 px-1">hazard_maps</code>.
        </div>
      )}

      {imageOverlayUrl && !hasGeojson && (
        <div className="pointer-events-none absolute left-3 top-3 z-[1000] rounded-lg bg-white/90 px-3 py-2 text-xs text-ink/60 shadow">
          Showing a raster preview (image_overlay_url) — the exact bounds are
          approximate until a real geojson_url replaces it.
        </div>
      )}

      {legend && legend.length > 0 && (
        <div className="absolute bottom-4 right-4 z-[1000] rounded-lg bg-white/95 p-3 text-xs shadow-lg">
          <p className="mb-1.5 font-semibold text-ink/80">Legend</p>
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-2 py-0.5">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
              <span className="text-ink/70">
                {item.label}
                {item.range ? ` (${item.range})` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}