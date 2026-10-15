"use client";

import dynamic from "next/dynamic";

export const DeviceLocationMapClient = dynamic(
  () => import("@/components/map/DeviceLocationMap").then((mod) => mod.DeviceLocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-mist/40">Loading map…</div>
    ),
  }
);