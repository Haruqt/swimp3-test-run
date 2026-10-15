# SWIMP3 — Swim Project 3 Rebuild

Storm Water Harvesting Facility Decision Support System, Cauayan City, Isabela.
Rebuilt in Next.js 14 + Supabase.

## Setup

1. `npm install`
2. Create a Supabase project at https://supabase.com
3. Copy `.env.local.example` to `.env.local` and fill in your project's URL and keys
   (Settings → API in the Supabase dashboard)
4. Run the schema: paste `supabase/schema.sql` into the Supabase SQL Editor and run it
5. Seed mock data: `npm run seed`
6. Create your admin login:
   - Supabase Dashboard → Authentication → Users → Add User
   - Use the email from `NEXT_PUBLIC_HUB_ADMIN_EMAIL` in `.env.local`
   - Set your own password there — it is never stored in this codebase
7. `npm run dev` — open http://localhost:3000

## Structure

- `app/(public)/` — Home, About, Data → Sensors / Maps (public site)
- `app/(hub)/` — Login, Dashboard, Sensors, CCTV (Swim Central Hub, authenticated)
- `components/ui/` — StatusDroplet, MetricCard (shared across both sites)
- `components/layout/` — Navbar
- `lib/supabase/` — browser + server Supabase clients
- `lib/types.ts` — shared types matching the DB schema
- `supabase/schema.sql` — full DB schema (devices, readings, alerts, hazard maps, staff)
- `supabase/seed.ts` — realistic mock data, since the physical sensors are
  currently offline pending battery replacement. Swap real values in once
  live telemetry resumes — the schema already has `battery_last_changed`
  and `last_update` columns ready for that.

## Status

Foundation built: config, DB schema, seed data, Supabase clients, shared
layout/UI components, and the Home page.

Still to build: About, Data → Sensors (live Leaflet map), Data → Maps
(hazard map catalog + viewer), Login, and the full Central Hub dashboard
(alerts feed, health score, sensor tables, CCTV device list).
