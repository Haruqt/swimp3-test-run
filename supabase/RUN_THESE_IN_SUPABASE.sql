-- Paste this WHOLE file into Supabase -> SQL Editor -> Run.
-- It is safe to run more than once. It adds:
--   1) the mike_results table (where the MIKE script's results are stored)
--   2) the latest_readings() function (makes the pages load fast)
--   3) the privacy setting that keeps mike_results private

create extension if not exists "uuid-ossp";

-- 1) mike_results
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

-- 3) privacy: RLS on, and no read policy, so only the server (service-role key) can read it
alter table mike_results enable row level security;
drop policy if exists "public read mike results" on mike_results;
drop policy if exists "authenticated read mike results" on mike_results;

-- 2) latest_readings(): newest N readings of every (device, metric) pair
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
