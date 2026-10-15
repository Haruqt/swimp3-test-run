# MIKE ↔ site integration

The reservoir page (`/reservoir`) and the dashboard card show:
1. the newest result MIKE sent in the last 48 h, **or**
2. if MIKE hasn't reported, the site's own analysis (same thresholds, `lib/reservoirDSS.ts`) from the live Supabase data and Open-Meteo rainfall.

So the site works today even with MIKE offline.

## 1. One-time setup on the site
1. In the Supabase SQL editor, run these blocks from the bottom of `supabase/schema.sql`: the `mike_results` table, the `latest_readings()` function (page speed), and the `mike_results` privacy block (removes public read). All are safe to re-run.
2. `MIKE_BRIDGE_PASSWORD` is already in `.env.local` (random value). If you host the site (Vercel etc.), add the same variable there.
3. The old PC must reach the site over the internet: the site needs a **public URL**. Endpoint: `POST https://<your-site>/api/mike/ingest` (a GET returns a small "ok" for testing).

## 2. Edits to the MIKE IronPython script (the one that POSTs `{ "data": "<base64>" }`)
- Change the URL to `https://<your-site>/api/mike/ingest`.
- Change the encryption password to the value of `MIKE_BRIDGE_PASSWORD` from `.env.local`.
- Keep everything else (SHA256 key, AES-256-CBC, random IV prepended, PKCS7, base64). The site decrypts exactly that format.
- Keep the payload keys (`analysis_id`, `analysis_timestamp`, `reservoir_level_m`, `level_data_age_days`, `risk_assessment{overall_status,risk_level,primary_risk,recommended_action}` …). The whole JSON is stored in `mike_results.payload`.

## 3. Things to know
- **Rotate credentials.** The MIKE scripts and earlier chats contained live passwords/keys. Treat them as exposed; change them, then update `.env.local` and the scripts.
- MIKE's own level series ends at the `-20` error code (stale). The site ignores values below -10 when picking the "latest" level.
- Rainfall % = month-to-date vs the 2000–2024 average of the **same days** (pro-rated). Few days into a month it is noisy, and the page says so.
- The decision text/risk-level mapping in the site analysis is the site's own wording; MIKE's wording is shown as-is when MIKE reports.
- Drought hazard map and elevated-tank layers still need exporting from MIKE's GIS panel.
- No dependencies were added. Run `npm install` then `npm run build` once to confirm on your machine.

## 4. What changed on 2026-10-14
- **Page speed:** the dashboard, groundwater, smart meter, pressure and public sensor map pages read only the newest rows of each sensor through `latest_readings()` instead of the whole table. Without the SQL function they still work, just slower.
- **Rainfall Analysis:** rebuilt (`lib/rainfall.ts`, `components/hub/RainfallPanel.tsx`) with a plain-words summary, 7-day forecast with chance of rain, 48-hour hourly chart, last 30 days, month versus the 2000-2024 normal, and last 12 months. Open-Meteo results are cached in server memory (30 min forecast, 12 h history).
- **Reservoir:** `/reservoir` now has a 7-day projected level with a range band. A reading older than 2 days gives a wide band, and days where the band is wider than 2 m are marked "too uncertain to call".
- **mike_results** is read with the service-role key only. Anyone holding just the public Supabase key can no longer read it.
