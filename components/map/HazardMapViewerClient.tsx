"use client";

import dynamic from "next/dynamic";

export const HazardMapViewerClient = dynamic(
  () => import("@/components/map/HazardMapViewer").then((mod) => mod.HazardMapViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-ink/40">
        Loading map…
      </div>
    ),
  }
);