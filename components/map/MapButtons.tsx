"use client";

import { useEffect, useState } from "react";
import { Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

// All the floating controls on these map pages need to clear two things
// stacked at the top: the site's floating/translucent navbar, and (for
// LocateButton specifically) Leaflet's own top-left zoom control sitting
// above it. app/globals.css already pushes Leaflet's native zoom control
// down via `.leaflet-top { top: 112px !important; }` -- this matches that
// same baseline so nothing here ends up on a different offset than it.
// (Measured via a live browser: navbar's real height is 101px, not the
// 96px this and the CSS rule both used before — that 5px shortfall was
// enough to put the top of the zoom/layers controls underneath the
// navbar, visible through its translucent background but unclickable.)
export const NAV_OFFSET = 112;

const locationIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:9999px;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 2px rgba(59,130,246,0.4)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// Explicit "locate me" button -- a visible control the person taps, rather
// than silently asking for geolocation permission on page load.
export function LocateButton() {
  const map = useMap();
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [status, setStatus] = useState<"idle" | "locating" | "denied">("idle");

  const handleClick = () => {
    if (!("geolocation" in navigator)) return;
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setPosition(coords);
        setStatus("idle");
        map.flyTo(coords, 15, { duration: 1.2 });
      },
      () => setStatus("denied"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <>
      <button
        onClick={handleClick}
        title={status === "denied" ? "Location permission denied" : "Show my location"}
        className="absolute left-[10px] z-[1000] flex h-[34px] w-[34px] items-center justify-center rounded-md border border-black/20 bg-white text-ink shadow hover:bg-sand"
        style={{ top: NAV_OFFSET + 76 }}
      >
        {status === "locating" ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
          </svg>
        )}
      </button>
      {position && (
        <Marker position={position} icon={locationIcon}>
          <Popup>You are here</Popup>
        </Marker>
      )}
    </>
  );
}

// Toggles the browser's native Fullscreen API on whatever element has
// id="map-fullscreen-target" -- each viewer puts that id on its outermost
// wrapper div so the map, its floating panel, and these buttons all expand
// together, instead of just the Leaflet canvas.
export function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggle = () => {
    const el = document.getElementById("map-fullscreen-target");
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  };

  return (
    <button
      onClick={toggle}
      title={isFullscreen ? "Exit full screen" : "View full screen"}
      className="absolute bottom-3 right-3 z-[1000] flex h-[34px] w-[34px] items-center justify-center rounded-md border border-black/20 bg-white text-ink shadow hover:bg-sand"
    >
      {isFullscreen ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      )}
    </button>
  );
}