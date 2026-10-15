export type SensorGroup =
  | "groundwater_well"
  | "groundwater_reservoir"
  | "pressure"
  | "smart_water_meter"
  | "cctv";

export type DeviceStatus = "online" | "offline" | "stale";

export interface Device {
  id: string;
  external_device_id: string;
  name: string | null;
  group_type: SensorGroup;
  network_type: string | null;
  latitude: number | null;
  longitude: number | null;
  status: DeviceStatus;
  battery_pct: number | null;
  battery_last_changed: string | null;
  rssi: number | null;
  last_update: string | null;
  // Real connection-failure text from the device's own sync route (e.g. a
  // fetch/cURL error reaching the vendor platform) — matches the live
  // site's behavior of showing the actual error instead of just "offline".
  // Null once a sync succeeds again. Added 2026-09-23; run the matching
  // `alter table` in supabase/schema.sql against an existing database.
  last_error: string | null;
}

export interface SensorReading {
  id: string;
  device_id: string;
  metric: string;
  value: number;
  unit: string;
  optimal_min: number | null;
  optimal_max: number | null;
  recorded_at: string;
}

export type AlertSeverity = "immediate" | "emergency" | "high" | "medium";

export interface Alert {
  id: string;
  title: string;
  description: string;
  root_cause: string | null;
  recommended_actions: string[] | null;
  severity: AlertSeverity;
  estimated_time: string | null;
  related_device_id: string | null;
  resolved: boolean;
  created_at: string;
}

export interface HazardMap {
  id: string;
  slug: string;
  title: string;
  location: string;
  description: string;
  thumbnail_url: string | null;
  geojson_url: string | null;
  image_overlay_url: string | null;
  image_bounds: [[number, number], [number, number]] | null;
  legend: { label: string; color: string; range?: string }[] | null;
  category: "flood" | "seismic";
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  photo_url: string | null;
  sort_order: number;
  is_lead: boolean;
}