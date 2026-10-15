/**
 * Local stand-in for the cron job that will eventually call /api/sync/all
 * in production. Nothing can reach localhost from an external cron/Vercel
 * Cron/cPanel Cron while this is still only running on your machine — so
 * this script does the same job locally: it calls the sync endpoint once
 * immediately, then again every SYNC_INTERVAL_MINUTES (default 60, same
 * cadence as the old site), for as long as it's left running.
 *
 * Run it in a SECOND terminal, alongside `npm run dev` (not instead of):
 *
 *   npm run sync:loop
 *
 * Leave that terminal open while you work — closing it just stops new
 * readings from being added, it doesn't affect the app itself. Every run
 * is logged below so you can see it actually firing.
 */
// Next.js reads .env.local automatically, but this script runs outside
// Next.js, and plain "dotenv/config" only loads ".env" by default — which
// doesn't exist here, only .env.local does. Pointing it at .env.local
// explicitly is what actually gets CRON_SECRET into process.env below.
import { config } from "dotenv";
config({ path: ".env.local" });

const PORT = process.env.PORT ?? "3000";
const BASE_URL = process.env.SYNC_BASE_URL ?? `http://localhost:${PORT}`;
const SECRET = process.env.CRON_SECRET;
const INTERVAL_MINUTES = Number(process.env.SYNC_INTERVAL_MINUTES ?? 60);

if (!SECRET) {
  console.error(
    "CRON_SECRET is not set in .env.local — the sync route will reject every request without it. Add the same CRON_SECRET value that's already in .env.local, then restart this script."
  );
  process.exit(1);
}

async function runSyncOnce() {
  const url = `${BASE_URL}/api/sync/all?secret=${encodeURIComponent(SECRET!)}`;
  const startedAt = new Date().toLocaleString();
  try {
    const res = await fetch(url);
    const body = await res.json();
    console.log(`[${startedAt}] sync ${res.ok ? "OK" : `FAILED (${res.status})`}:`, JSON.stringify(body.results ?? body));
  } catch (err) {
    console.error(
      `[${startedAt}] sync request failed — is "npm run dev" running in another terminal? (${
        err instanceof Error ? err.message : String(err)
      })`
    );
  }
}

console.log(`Syncing ${BASE_URL}/api/sync/all every ${INTERVAL_MINUTES} minute(s). Press Ctrl+C to stop.`);
runSyncOnce();
setInterval(runSyncOnce, INTERVAL_MINUTES * 60 * 1000);