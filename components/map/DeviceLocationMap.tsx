"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

// Leaflet's default marker icon expects image files this project doesn't
// actually ship (no /public/leaflet/*.png here) — SensorMap.tsx avoids that
// entirely with an inline SVG via L.divIcon instead of L.Icon, so this uses
// the same approach rather than pointing at files that don't exist.
const pinIcon = L.divIcon({
  className: "",
  html: `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 0C6.7 0 0 6.7 0 15c0 11.2 15 25 15 25s15-13.8 15-25C30 6.7 23.3 0 15 0z" fill="#2E7D8C"/>
    <circle cx="15" cy="15" r="6" fill="#ffffff"/>
  </svg>`,
  iconSize: [30, 40],
  iconAnchor: [15, 40],
  popupAnchor: [0, -36],
});

/**
 * Single-device location map for the device detail page — the old site's
 * "Device location" panel (a Leaflet map with one pin) that the rebuild's
 * device detail views didn't have yet.
 */
export function DeviceLocationMap({
  latitude,
  longitude,
  label,
}: {
  latitude: number;
  longitude: number;
  label: string;
}) {
  return (
    <MapContainer center={[latitude, longitude]} zoom={17} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[latitude, longitude]} icon={pinIcon}>
        <Popup>{label}</Popup>
      </Marker>
    </MapContainer>
  );
}