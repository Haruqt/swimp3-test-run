"use client";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  useMapEvents,
  useMap,
} from "react-leaflet";
import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import type { Device, SensorGroup } from "@/lib/types";
import { fetchBoundaryFeature, boundarySources, type BoundaryLayerName } from "@/lib/boundaries";
import { LocateButton, FullscreenButton } from "./MapButtons";
import {
  FACILITY_BOUNDARY_GEOJSON,
  CATCHMENT_AREA_GEOJSON,
  CABARUAN_BOUNDARY_GEOJSON,
  BUS_STATION_BUILDINGS_GEOJSON,
} from "@/lib/facilityLayers";

const groupColors: Record<SensorGroup, string> = {
  groundwater_well: "#2E7D8C",
  groundwater_reservoir: "#5C7A5C",
  pressure: "#C1622D",
  smart_water_meter: "#8C5CA8",
  cctv: "#12303B",
};

const groupLabels: Record<SensorGroup, string> = {
  pressure: "Pressure Sensors",
  smart_water_meter: "Smart Water Meter",
  groundwater_well: "Ground Water Well",
  groundwater_reservoir: "Ground Water Reservoir",
  cctv: "CCTV Live Feed",
};

const groupOrder: SensorGroup[] = ["pressure", "smart_water_meter", "groundwater_well", "groundwater_reservoir", "cctv"];

const baseLayers = {
  OpenStreetMap: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "World Imagery": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  "World Topo": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
} as const;

type BaseLayerName = keyof typeof baseLayers;

const boundaryLayerNames: BoundaryLayerName[] = ["Isabela Boundary"];

// Evenly-spaced hue per index so any number of barangays stay visually
// distinct without needing a hand-picked palette.
function barangayColor(index: number, total: number): string {
  const hue = Math.round((index * 360) / Math.max(total, 1));
  return `hsl(${hue}, 65%, 50%)`;
}

// Real marker icons pulled from the live site (same files, same mapping
// confirmed via console: Gwmwell.png is shared by both Ground Water Well
// and Ground Water Reservoir).
const iconUrls: Record<SensorGroup, string> = {
  pressure: "/images/ps.png",
  smart_water_meter: "/images/swm.png",
  groundwater_well: "/images/Gwmwell.png",
  groundwater_reservoir: "/images/Gwmwell.png",
  cctv: "/images/cctvicon.png",
};

function makeIcon(group: SensorGroup, status: string, selected: boolean) {
  const opacity = status === "online" ? 1 : 0.45;
  const size = selected ? 44 : 36; // 36px matches the live site's marker size
  const ring = selected ? "filter: drop-shadow(0 0 0 3px #2E7D8C) drop-shadow(0 1px 3px rgba(0,0,0,0.4));" : "filter: drop-shadow(0 1px 3px rgba(0,0,0,0.4));";
  return L.divIcon({
    className: "",
    html: `<img src="${iconUrls[group]}" style="width:${size}px;height:${size}px;opacity:${opacity};${ring}" />`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

// react-leaflet measures its container's pixel size once, at the moment it
// mounts. If that happens before the surrounding flex layout has finished
// settling (very possible right after a client-only dynamic import), it
// caches a stale 0x0 (or wrong) size and never re-measures on its own --
// resulting in a map that's technically mounted but requests zero tiles and
// renders nothing, even though the container clearly has real height a
// moment later. This watches the container and forces Leaflet to
// re-measure (invalidateSize) whenever its actual size changes.
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    // Catch the "settled after mount" case immediately, then keep watching.
    const raf = requestAnimationFrame(() => map.invalidateSize());
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [map]);
  return null;
}

function CoordinateReadout() {
  const [coords, setCoords] = useState<[number, number] | null>(null);
  useMapEvents({
    mousemove(e) {
      setCoords([e.latlng.lat, e.latlng.lng]);
    },
  });
  if (!coords) return null;
  return (
    <div className="absolute bottom-3 left-3 z-[1000] rounded bg-black/70 px-2.5 py-1 font-mono text-xs text-white">
      {coords[0].toFixed(3)} | {coords[1].toFixed(3)}
    </div>
  );
}

export function SensorMap({ devices, selectedId, onSelectDevice }: { devices: Device[]; selectedId?: string | null; onSelectDevice?: (id: string) => void }) {
  const [baseLayer, setBaseLayer] = useState<BaseLayerName>("OpenStreetMap");
  const [visibleGroups, setVisibleGroups] = useState<Set<SensorGroup>>(new Set(groupOrder));
  const [showFacility, setShowFacility] = useState(true);
  const [showCatchment, setShowCatchment] = useState(true);
  const [showCabaruan, setShowCabaruan] = useState(false);
  const [showBuildings, setShowBuildings] = useState(true);
  const [otherLayersOpen, setOtherLayersOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const [showCauayanBoundary, setShowCauayanBoundary] = useState(false);
  const [cauayanGeojson, setCauayanGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [cauayanFailed, setCauayanFailed] = useState(false);

  useEffect(() => {
    if (!showCauayanBoundary || cauayanGeojson || cauayanFailed) return;
    fetch("/geo/cauayan-boundary.json")
      .then((res) => {
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: GeoJSON.FeatureCollection) => {
        // File ships with empty `properties` on every feature (no barangay
        // names), so there's nothing to color/key by except position in the
        // array. Stamp a stable index so each barangay gets its own hue.
        const tagged: GeoJSON.FeatureCollection = {
          ...data,
          features: data.features.map((f, i) => ({
            ...f,
            properties: { ...f.properties, __barangayIndex: i },
          })),
        };
        setCauayanGeojson(tagged);
      })
      .catch((err) => {
        console.error("Cauayan boundary load failed:", err);
        setCauayanFailed(true);
      });
  }, [showCauayanBoundary, cauayanGeojson, cauayanFailed]);

  const [activeBoundaries, setActiveBoundaries] = useState<Set<BoundaryLayerName>>(new Set());
  const [boundaryFeatures, setBoundaryFeatures] = useState<Partial<Record<BoundaryLayerName, GeoJSON.Feature | null>>>({});
  const [loadingBoundaries, setLoadingBoundaries] = useState<Set<BoundaryLayerName>>(new Set());

  useEffect(() => {
    activeBoundaries.forEach((layer) => {
      if (layer in boundaryFeatures || loadingBoundaries.has(layer)) return;
      setLoadingBoundaries((prev) => new Set(prev).add(layer));
      fetchBoundaryFeature(layer).then((feature) => {
        setBoundaryFeatures((prev) => ({ ...prev, [layer]: feature }));
        setLoadingBoundaries((prev) => {
          const next = new Set(prev);
          next.delete(layer);
          return next;
        });
      });
    });
  }, [activeBoundaries, boundaryFeatures, loadingBoundaries]);

  function toggleBoundary(layer: BoundaryLayerName) {
    setActiveBoundaries((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }

  const withCoords = useMemo(() => devices.filter((d) => d.latitude && d.longitude), [devices]);
  const center: [number, number] = withCoords.length > 0 ? [withCoords[0].latitude!, withCoords[0].longitude!] : [16.9534, 121.7658];

  function toggleGroup(group: SensorGroup) {
    setVisibleGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  return (
    <div id="map-fullscreen-target" className="relative h-full w-full">
      <MapContainer center={center} zoom={19} maxZoom={21} style={{ height: "100%", width: "100%" }}>
        <MapResizeHandler />
        <LocateButton />
        <FullscreenButton />
        <TileLayer key={baseLayer} attribution={baseLayer === "OpenStreetMap" ? "&copy; OpenStreetMap contributors" : "Esri"} url={baseLayers[baseLayer]} maxZoom={21} maxNativeZoom={19} />

        {showFacility && (
          <GeoJSON data={FACILITY_BOUNDARY_GEOJSON} pathOptions={{ color: "green", weight: 2, fillColor: "green", fillOpacity: 0.25 }} />
        )}

        {showCatchment && (
          <GeoJSON
            data={CATCHMENT_AREA_GEOJSON}
            pathOptions={{ color: "red", weight: 3, dashArray: "10 10", fillColor: "red", fillOpacity: 0.15 }}
          />
        )}

        {showCabaruan && (
          <GeoJSON
            data={CABARUAN_BOUNDARY_GEOJSON}
            pathOptions={{ color: "#F59E0B", weight: 2, fillColor: "#F59E0B", fillOpacity: 0.15 }}
          />
        )}

        {showCauayanBoundary && cauayanGeojson && (
          <GeoJSON
            data={cauayanGeojson}
            style={(feature) => {
              const idx = (feature?.properties?.__barangayIndex ?? 0) as number;
              const color = barangayColor(idx, cauayanGeojson.features.length);
              return { color, weight: 1.5, fillColor: color, fillOpacity: 0.35 };
            }}
          />
        )}

        {boundaryLayerNames.map((layer) => {
          const feature = boundaryFeatures[layer];
          if (!activeBoundaries.has(layer) || !feature) return null;
          const color = boundarySources[layer].color;
          return (
            <GeoJSON
              key={layer}
              data={feature}
              pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.15 }}
            />
          );
        })}

        {showBuildings && (
          <GeoJSON data={{ type: "FeatureCollection", features: BUS_STATION_BUILDINGS_GEOJSON } as GeoJSON.FeatureCollection} pathOptions={{ color: "#0f66e9", weight: 2, fillOpacity: 0 }} />
        )}

        {/* Show every device that has coordinates and is in a visible
            group — offline/stale ones stay on the map dimmed (see
            makeIcon's opacity logic below) rather than disappearing
            entirely. They used to be filtered out here too, which was
            invisible while the seed/mock data had almost everything
            marked "online"; now that sync routes write real statuses,
            hiding offline devices would mean hiding exactly the ones a
            monitoring dashboard most needs to surface. */}
        {withCoords
          .filter((d) => visibleGroups.has(d.group_type))
          .map((device) => (
            <Marker
              key={device.id}
              position={[device.latitude!, device.longitude!]}
              icon={makeIcon(device.group_type, device.status, device.id === selectedId)}
              eventHandlers={{ click: () => onSelectDevice?.(device.id) }}
            >
              <Popup>
                <div className="font-sans">
                  <p className="font-medium">{device.name}</p>
                  <p className="text-xs text-ink/60">{device.group_type.replace(/_/g, " ")}</p>
                  <p className="mt-1 text-xs">
                    Status: <span className="font-medium">{device.status}</span>
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}

        <CoordinateReadout />
      </MapContainer>

      <div className="absolute right-3 z-[1000] w-56 overflow-hidden rounded-lg bg-black/75 text-white shadow-lg" style={{ top: 96 }}>
        <button onClick={() => setPanelOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white/90">
          <span>Map Controls</span>
          <span>{panelOpen ? "−" : "+"}</span>
        </button>

        {panelOpen && (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-3 pb-3 text-xs">
            <div>
              <p className="mb-1.5 font-semibold text-white/70">Base Layers</p>
              {(Object.keys(baseLayers) as BaseLayerName[]).map((name) => (
                <label key={name} className="flex items-center gap-2 py-0.5">
                  <input type="radio" name="base-layer" checked={baseLayer === name} onChange={() => setBaseLayer(name)} />
                  {name}
                </label>
              ))}
            </div>

            <div>
              <p className="mb-1.5 font-semibold text-white/70">Map Legend</p>
              <p className="mb-1 text-[11px] uppercase tracking-wide text-white/40">Sensors</p>
              {groupOrder.map((group) => (
                <label key={group} className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={visibleGroups.has(group)} onChange={() => toggleGroup(group)} />
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: groupColors[group] }} />
                  {groupLabels[group]}
                </label>
              ))}
            </div>

            <div>
              <button onClick={() => setOtherLayersOpen((v) => !v)} className="mb-1.5 font-semibold text-white/70">
                {otherLayersOpen ? "−" : "+"} Other Layers
              </button>
              {otherLayersOpen && (
                <div className="space-y-0.5">
                  <label className="flex items-center gap-2 py-0.5">
                    <input type="checkbox" checked={showFacility} onChange={() => setShowFacility((v) => !v)} />
                    Storm Water Harvesting Facility
                  </label>
                  <label className="flex items-center gap-2 py-0.5">
                    <input type="checkbox" checked={showCatchment} onChange={() => setShowCatchment((v) => !v)} />
                    Catchment Area
                  </label>
                  <label className="flex items-center gap-2 py-0.5">
                    <input type="checkbox" checked={showBuildings} onChange={() => setShowBuildings((v) => !v)} />
                    Buildings CCC Bus Station
                  </label>
                  <label className="flex items-center gap-2 py-0.5">
                    <input type="checkbox" checked={showCabaruan} onChange={() => setShowCabaruan((v) => !v)} />
                    Cabaruan Boundary
                  </label>
                  <label className="flex items-center gap-2 py-0.5" title={cauayanFailed ? "Couldn't load /geo/cauayan-boundary.json" : undefined}>
                    <input type="checkbox" checked={showCauayanBoundary} onChange={() => setShowCauayanBoundary((v) => !v)} />
                    <span className={cauayanFailed ? "text-red-400" : ""}>
                      Cauayan Boundary
                      {showCauayanBoundary && !cauayanGeojson && !cauayanFailed ? " (loading…)" : ""}
                      {cauayanFailed ? " (unavailable)" : ""}
                    </span>
                  </label>
                  {boundaryLayerNames.map((layer) => {
                    const isOn = activeBoundaries.has(layer);
                    const isLoading = loadingBoundaries.has(layer);
                    const feature = boundaryFeatures[layer];
                    const failed = isOn && !isLoading && feature === null;
                    return (
                      <label key={layer} className="flex items-center gap-2 py-0.5" title={failed ? "Couldn't load this boundary — the source may be unreachable or the name changed" : undefined}>
                        <input type="checkbox" checked={isOn} onChange={() => toggleBoundary(layer)} />
                        <span className={failed ? "text-red-400" : ""}>
                          {layer}
                          {isLoading ? " (loading…)" : failed ? " (unavailable)" : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}