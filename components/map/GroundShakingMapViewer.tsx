"use client";

import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import { useEffect, useState } from "react";
import type { PathOptions } from "leaflet";
import L from "leaflet";
import { MapPanes, PANE } from "./MapPanes";
import { LocateButton, FullscreenButton } from "./MapButtons";
import { BUS_STATION_BUILDINGS_GEOJSON } from "@/lib/facilityLayers";
import { fetchBoundaryFeature, boundarySources } from "@/lib/boundaries";
import { toTitleCase } from "@/lib/text";

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// No Low/Medium/High here -- confirmed against the original site's own
// layer panel, which shows a single flat "Ground Shaking" toggle too, not
// a graduated legend. Matches the purple tone of the original's thumbnail.
const GROUND_SHAKING_COLOR = "#9b8fc2";

function groundShakingStyle(): PathOptions {
  return { color: GROUND_SHAKING_COLOR, weight: 0.6, fillColor: GROUND_SHAKING_COLOR, fillOpacity: 0.6 };
}

function labelPopup(nameProp: string) {
  return (feature: GeoJSON.Feature, layer: L.Layer) => {
    const label = feature.properties?.[nameProp];
    if (label) layer.bindPopup(toTitleCase(String(label)));
  };
}

function smallDot(color: string) {
  return () =>
    L.divIcon({
      className: "",
      html: `<div style="width:9px;height:9px;border-radius:9999px;background:${color};border:1.5px solid white;box-shadow:0 1px 2px rgba(0,0,0,0.4)"></div>`,
      iconSize: [9, 9],
      iconAnchor: [4.5, 4.5],
    });
}

function DotSwatch({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white/50" style={{ backgroundColor: color }} />;
}
function LineSwatch({ color }: { color: string }) {
  return <span className="inline-block h-0.5 w-3.5 shrink-0" style={{ backgroundColor: color }} />;
}
function SquareSwatch({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />;
}

// Same fix as LiquefactionMapViewer: report readiness explicitly instead of
// mounting <GeoJSON> with empty data before the fetch resolves, which is
// what caused the "need to double-click to show" bug.
function useGeoJson(url: string) {
  const [data, setData] = useState<GeoJSON.FeatureCollection>(EMPTY_FC);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => res.json())
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setReady(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url]);
  return [data, ready] as const;
}

const baseLayers = {
  OpenStreetMap: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "OpenStreetMap.HOT": "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
  "World Imagery": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  "World Topo": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
} as const;
type BaseLayerName = keyof typeof baseLayers;

// Same fix proven necessary on the Data/Sensors map and the flood
// HazardMapViewer: loaded via next/dynamic (ssr:false), so Leaflet can
// measure its container a beat before the flex layout settles, leaving
// controls visible but unresponsive to clicks until re-measured.
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

export function GroundShakingMapViewer() {
  const [baseLayer, setBaseLayer] = useState<BaseLayerName>("World Imagery");
  const [groupOpen, setGroupOpen] = useState(true);
  const [otherOpen, setOtherOpen] = useState(false);

  const [showWaterInfra, setShowWaterInfra] = useState(true);
  const [showTurnout, setShowTurnout] = useState(true);
  const [showCreek, setShowCreek] = useState(true);
  const [showLateralCanal, setShowLateralCanal] = useState(true);
  const [showMainCanal, setShowMainCanal] = useState(true);
  const [showFloodControl, setShowFloodControl] = useState(true);
  const [showWaterDrainage, setShowWaterDrainage] = useState(true);
  const [showBarangayBoundary, setShowBarangayBoundary] = useState(true);
  const [showGroundShaking, setShowGroundShaking] = useState(true);

  const [showBuildings, setShowBuildings] = useState(false);
  const [showIsabela, setShowIsabela] = useState(false);
  const [isabelaFeature, setIsabelaFeature] = useState<GeoJSON.Feature | null>(null);

  const [waterInfra, waterInfraReady] = useGeoJson("/geo/existing-water-infrastructure.json");
  const [turnout, turnoutReady] = useGeoJson("/geo/turnout.json");
  const [creek, creekReady] = useGeoJson("/geo/creek.json");
  const [lateralCanal, lateralCanalReady] = useGeoJson("/geo/lateral-canal.json");
  const [mainCanal, mainCanalReady] = useGeoJson("/geo/main-canal.json");
  const [floodControl, floodControlReady] = useGeoJson("/geo/flood-control.json");
  const [waterDrainage, waterDrainageReady] = useGeoJson("/geo/existing-water-drainage.json");
  const [barangayBoundary, barangayReady] = useGeoJson("/geo/barangay-boundary.json");
  const [groundShaking, groundShakingReady] = useGeoJson("/geo/groundshaking.json");

  useEffect(() => {
    if (!showIsabela || isabelaFeature) return;
    fetchBoundaryFeature("Isabela Boundary").then(setIsabelaFeature);
  }, [showIsabela, isabelaFeature]);

  return (
    <div id="map-fullscreen-target" className="relative h-full w-full">
      <MapContainer center={[16.965, 121.77]} zoom={12} style={{ height: "100%", width: "100%" }}>
        <MapPanes />
        <LocateButton />
        <FullscreenButton />
        <TileLayer
          key={baseLayer}
          attribution={baseLayer.startsWith("OpenStreetMap") ? "&copy; OpenStreetMap contributors" : "Esri"}
          url={baseLayers[baseLayer]}
        />

        {/* SHADES (back) */}
        {showGroundShaking && groundShakingReady && (
          <GeoJSON pane={PANE.shades} data={groundShaking} style={groundShakingStyle()} />
        )}

        {/* BORDERS (middle) */}
        {showBarangayBoundary && barangayReady && (
          <GeoJSON pane={PANE.borders} data={barangayBoundary} style={{ color: "#000000", weight: 1, fill: true, fillOpacity: 0 }} onEachFeature={labelPopup("Brgy_Name")} />
        )}
        {showBuildings && (
          <GeoJSON pane={PANE.borders} data={{ type: "FeatureCollection", features: BUS_STATION_BUILDINGS_GEOJSON } as GeoJSON.FeatureCollection} pathOptions={{ color: "#0f66e9", weight: 2, fillOpacity: 0 }} />
        )}
        {showIsabela && isabelaFeature && (
          <GeoJSON pane={PANE.borders} data={isabelaFeature} pathOptions={{ color: boundarySources["Isabela Boundary"].color, weight: 2, fill: false }} />
        )}

        {/* LINES (front, below markers) */}
        {showCreek && creekReady && <GeoJSON pane={PANE.lines} data={creek} style={{ color: "#1d4ed8", weight: 1.5 }} onEachFeature={labelPopup("Name")} />}
        {showLateralCanal && lateralCanalReady && <GeoJSON pane={PANE.lines} data={lateralCanal} style={{ color: "#0ea5e9", weight: 1.5 }} onEachFeature={labelPopup("Name")} />}
        {showMainCanal && mainCanalReady && <GeoJSON pane={PANE.lines} data={mainCanal} style={{ color: "#1e3a8a", weight: 2.5 }} onEachFeature={labelPopup("Name")} />}
        {showFloodControl && floodControlReady && <GeoJSON pane={PANE.lines} data={floodControl} style={{ color: "#dc2626", weight: 2 }} />}
        {showWaterDrainage && waterDrainageReady && <GeoJSON pane={PANE.lines} data={waterDrainage} style={{ color: "#7c3aed", weight: 1 }} />}

        {/* MARKERS -- already render above everything via Leaflet's default markerPane */}
        {showTurnout && turnoutReady && (
          <GeoJSON data={turnout} pointToLayer={(_f, latlng) => L.marker(latlng, { icon: smallDot("#14b8a6")() })} />
        )}
        {showWaterInfra && waterInfraReady && (
          <GeoJSON data={waterInfra} pointToLayer={(_f, latlng) => L.marker(latlng, { icon: smallDot("#f59e0b")() })} onEachFeature={labelPopup("Name")} />
        )}
        <InvalidateSizeOnMount />
      </MapContainer>

      <div className="absolute right-3 z-[1000] w-64 overflow-hidden rounded-lg bg-black/75 text-white shadow-lg" style={{ top: 96 }}>
        <div className="max-h-[75vh] space-y-4 overflow-y-auto px-3 py-3 text-xs">
          <div>
            <p className="mb-1.5 font-semibold text-white/70">World</p>
            {(Object.keys(baseLayers) as BaseLayerName[]).map((name) => (
              <label key={name} className="flex items-center gap-2 py-0.5">
                <input type="radio" name="base-layer" checked={baseLayer === name} onChange={() => setBaseLayer(name)} />
                {name}
              </label>
            ))}
          </div>

          <div>
            <button onClick={() => setGroupOpen((v) => !v)} className="mb-1.5 font-semibold text-white/70">
              {groupOpen ? "\u2212" : "+"} Ground Shaking Hazard Map
            </button>
            {groupOpen && (
              <div className="space-y-0.5">
                <label className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={showWaterInfra} onChange={() => setShowWaterInfra((v) => !v)} />
                  <DotSwatch color="#f59e0b" /> Existing Water Infrastructure
                </label>
                <label className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={showTurnout} onChange={() => setShowTurnout((v) => !v)} />
                  <DotSwatch color="#14b8a6" /> Turnout
                </label>
                <label className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={showCreek} onChange={() => setShowCreek((v) => !v)} />
                  <LineSwatch color="#1d4ed8" /> Creek
                </label>
                <label className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={showLateralCanal} onChange={() => setShowLateralCanal((v) => !v)} />
                  <LineSwatch color="#0ea5e9" /> Lateral Canal
                </label>
                <label className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={showMainCanal} onChange={() => setShowMainCanal((v) => !v)} />
                  <LineSwatch color="#1e3a8a" /> Main Canal
                </label>
                <label className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={showFloodControl} onChange={() => setShowFloodControl((v) => !v)} />
                  <LineSwatch color="#dc2626" /> Flood Control
                </label>
                <label className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={showWaterDrainage} onChange={() => setShowWaterDrainage((v) => !v)} />
                  <LineSwatch color="#7c3aed" /> Existing Water Drainage
                </label>
                <label className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={showBarangayBoundary} onChange={() => setShowBarangayBoundary((v) => !v)} />
                  <LineSwatch color="#000000" /> Barangay Boundary
                </label>
                <label className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={showGroundShaking} onChange={() => setShowGroundShaking((v) => !v)} />
                  <SquareSwatch color={GROUND_SHAKING_COLOR} /> Ground Shaking
                </label>
              </div>
            )}
          </div>

          <div>
            <button onClick={() => setOtherOpen((v) => !v)} className="mb-1.5 font-semibold text-white/70">
              {otherOpen ? "\u2212" : "+"} Other Layers
            </button>
            {otherOpen && (
              <div className="space-y-0.5">
                <label className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={showBuildings} onChange={() => setShowBuildings((v) => !v)} />
                  <LineSwatch color="#0f66e9" /> Buildings CCC Bus station
                </label>
                <label className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={showIsabela} onChange={() => setShowIsabela((v) => !v)} />
                  <LineSwatch color={boundarySources["Isabela Boundary"].color} /> Isabela Boundary
                </label>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}