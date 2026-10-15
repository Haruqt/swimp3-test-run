"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { SensorDetailPanel } from "@/components/map/SensorDetailPanel";
import type { Device, SensorReading } from "@/lib/types";

const SensorMap = dynamic(
  () => import("@/components/map/SensorMap").then((mod) => mod.SensorMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-ink/40">
        Loading map…
      </div>
    ),
  }
);

export function SensorExplorer({
  devices,
  readings,
}: {
  devices: Device[];
  readings: SensorReading[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const readingsByDevice = useMemo(() => {
    const map = new Map<string, SensorReading[]>();
    for (const r of readings) {
      const list = map.get(r.device_id) ?? [];
      list.push(r);
      map.set(r.device_id, list);
    }
    // Oldest → newest, so the chart reads left-to-right chronologically.
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
    }
    return map;
  }, [readings]);

  const selectedDevice = devices.find((d) => d.id === selectedId) ?? null;

  const selectedReadingsByMetric = useMemo(() => {
    const map = new Map<string, SensorReading[]>();
    if (!selectedDevice) return map;
    for (const r of readingsByDevice.get(selectedDevice.id) ?? []) {
      const list = map.get(r.metric) ?? [];
      list.push(r);
      map.set(r.metric, list);
    }
    return map;
  }, [selectedDevice, readingsByDevice]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <SensorMap devices={devices} selectedId={selectedId} onSelectDevice={setSelectedId} />
      <AnimatePresence>
        {selectedDevice && (
          <SensorDetailPanel
            key={selectedDevice.id}
            device={selectedDevice}
            readingsByMetric={selectedReadingsByMetric}
            onClose={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}