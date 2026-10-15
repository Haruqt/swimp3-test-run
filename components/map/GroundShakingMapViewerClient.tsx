"use client";

import dynamic from "next/dynamic";

export const GroundShakingMapViewerClient = dynamic(
  () => import("@/components/map/GroundShakingMapViewer").then((mod) => mod.GroundShakingMapViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-ink/40">
        Loading map…
      </div>
    ),
  }
);