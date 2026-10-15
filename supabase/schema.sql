-- SWIMP3 (Swim Project 3) database schema
-- Storm Water Harvesting Facility Decision Support System

create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- Sensor groups (Groundwater Well, Reservoir, Pressure, Smart Meter, CCTV)
-- ─────────────────────────────────────────────
create type sensor_group as enum (
  'groundwater_well',
  'groundwater_reservoir',
  'pressure',
  'smart_water_meter',
  'cctv'
);

create type device_status as enum ('online', 'offline', 'stale');

create table devices (
  id uuid primary key default uuid_generate_v4(),
  external_device_id text unique not null,      -- e.g. "233614968"
  name text,                                      -- e.g. "Pressure Sensor 4 (Bar)"
  group_type sensor_group not null,
  network_type text default '4G',
  latitude double precision,
  longitude double precision,
  status device_status not null default 'offline',
  battery_pct numeric,                            -- null until battery telemetry exists
  battery_last_changed date,                       -- fill in once you know it
  rssi integer,                                    -- signal strength in dBm; null until a sync route populates it (XYT's response has this — see lib/xyt/client.ts)
  last_update timestamptz,
  last_error text,                                 -- real connection-failure text from the device's own sync route (e.g. "Water meter API failed: HTTP 502"); null once a sync succeeds again
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────
-- Individual metric readings per device (pH, TDS, pressure, flow, etc.)
-- ─────────────────────────────────────────────
create table sensor_readings (
  id uuid primary key default uuid_generate_v4(),
  device_id uuid references devices(id) on delete cascade,
  metric text not null,          -- 'ph' | 'temperature' | 'conductivity' | 'tds' | 'salinity' | 'level' | 'pressure' | 'flow'
  value numeric not null,
  unit text not null,            -- 'ph' | '°C' | 'ms/cm' | 'mg/L' | 'ppt' | 'm' | 'bar' | 'm³'
  optimal_min numeric,
  optimal_max numeric,
  recorded_at timestamptz not null default now()
);

create index on sensor_readings (device_id, metric, recorded_at desc);

-- ─────────────────────────────────────────────
-- Auto-generated system alerts (mirrors the "System Maintenance Recommendations" cards)
-- ─────────────────────────────────────────────
create type alert_severity as enum ('immediate', 'emergency', 'high', 'medium');

create table alerts (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text not null,
  root_cause text,
  recommended_actions text[],
  severity alert_severity not null default 'medium',
  estimated_time text,
  related_device_id uuid references devices(id),
  resolved boolean default false,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────
-- Hazard map catalog (flood 100/25/5yr, ground shaking, liquefaction)
-- ─────────────────────────────────────────────
create table hazard_maps (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,       -- '100yr', 'GroundShakingHazardMap', etc.
  title text not null,
  location text default 'Cauayan City, Isabela',
  description text not null,
  thumbnail_url text,
  geojson_url text,                -- link to the actual shapefile/geojson asset
  legend jsonb,                    -- [{label, color, range}]
  category text not null,          -- 'flood' | 'seismic'
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────
-- Project staff (About page)
-- ─────────────────────────────────────────────
create table staff (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  role text not null,
  photo_url text,
  sort_order int default 0,
  is_lead boolean default false
);

-- ─────────────────────────────────────────────
-- Row Level Security — public read, authenticated write
-- ─────────────────────────────────────────────
alter table devices enable row level security;
alter table sensor_readings enable row level security;
alter table alerts enable row level security;
alter table hazard_maps enable row level security;
alter table staff enable row level security;

create policy "public read devices" on devices for select using (true);
create policy "public read readings" on sensor_readings for select using (true);
create policy "public read alerts" on alerts for select using (true);
create policy "public read hazard maps" on hazard_maps for select using (true);
create policy "public read staff" on staff for select using (true);

create policy "authenticated write devices" on devices for all using (auth.role() = 'authenticated');
create policy "authenticated write readings" on sensor_readings for all using (auth.role() = 'authenticated');
create policy "authenticated write alerts" on alerts for all using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- app_settings — small key/value store for things sync jobs need to
-- persist between runs (e.g. the dtuip.com sliding-refresh bearer token,
-- which changes on every authenticated request and must survive across
-- serverless invocations). NOT for business data — just backend plumbing.
-- ─────────────────────────────────────────────
create table app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;
-- No public read/write policy on purpose — only the service-role admin
-- client (lib/supabase/admin.ts) should ever touch this table.

-- ─────────────────────────────────────────────
-- MIGRATION (2026-09-23) — run this once against an existing database
-- that was created before `last_error` existed on `devices`. Safe to
-- re-run (if not exists guards it). Not needed on a brand-new database
-- created fresh from this file, since it's already in the table above.
-- ─────────────────────────────────────────────
alter table devices add column if not exists last_error text;

-- ─────────────────────────────────────────────
-- MIGRATION (2026-10-07) — this constraint was added directly against the
-- live database at some point (likely via the Supabase SQL editor) and was
-- never recorded here, so a fresh database built from this file alone
-- would be missing it. It's what lets the sync routes upsert + skip
-- duplicate readings (same device+metric+timestamp) instead of erroring —
-- see app/api/sync/dtuip-reservoir/route.ts and
-- app/api/sync/watermeter/route.ts. Safe to re-run; does nothing if the
-- constraint already exists.
-- ─────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sensor_readings_device_metric_time_key'
  ) then
    alter table sensor_readings
      add constraint sensor_readings_device_metric_time_key
      unique (device_id, metric, recorded_at);
  end if;
end $$;

-- ─────────────────────────────────────────────
-- MIGRATION (2026-10-13) — MIKE Operations integration. The MIKE script on
-- the old PC POSTs its encrypted reservoir analysis to /api/mike/ingest,
-- which writes it here (service-role client). The hub reads the newest row.
-- Safe to re-run.
-- ─────────────────────────────────────────────
create table if not exists mike_results (
  id uuid primary key default uuid_generate_v4(),
  analysis_id text unique,
  analysis_timestamp timestamptz not null default now(),
  received_at timestamptz not null default now(),
  reservoir_level_m numeric,
  level_data_age_days numeric,
  overall_status text,
  risk_level text,
  recommended_action text,
  payload jsonb not null
);
create index if not exists mike_results_ts_idx on mike_results (analysis_timestamp desc);
alter table mike_results enable row level security;
drop policy if exists "public read mike results" on mike_results;
create policy "public read mike results" on mike_results for select using (true);


-- ─────────────────────────────────────────────
-- MIGRATION (2026-10-14) — page speed. Returns the newest `n_per_series`
-- readings of EVERY (device, metric) pair, so pages no longer have to
-- download the whole sensor_readings table on each visit. Keeps sensors that
-- went offline long ago (the cap is per sensor, not a time window). Safe to
-- re-run. If this function is missing the site falls back to the slow full
-- read, so run it once.
-- ─────────────────────────────────────────────
create or replace function latest_readings(n_per_series int default 200)
returns setof sensor_readings
language sql
stable
as $$
  select s.*
  from sensor_readings s
  join (
    select id,
           row_number() over (partition by device_id, metric order by recorded_at desc, id desc) as rn
    from sensor_readings
  ) r on r.id = s.id
  where r.rn <= n_per_series
$$;

-- ─────────────────────────────────────────────
-- MIGRATION (2026-10-14) — mike_results is now read only by the server with
-- the service-role key, so the public read policy is removed. With RLS on and
-- no policy, anyone holding only the public (anon) key gets nothing.
-- ─────────────────────────────────────────────
drop policy if exists "public read mike results" on mike_results;
drop policy if exists "authenticated read mike results" on mike_results;