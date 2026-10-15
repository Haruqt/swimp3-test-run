"use client";

import dynamic from "next/dynamic";

export const LiquefactionMapViewerClient = dynamic(
  () => import("@/components/map/LiquefactionMapViewer").then((mod) => mod.LiquefactionMapViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-ink/40">
        Loading map…
      </div>
    ),
  }
);