// Rainfall analysis for the facility (16.953034, 121.766655 — Cauayan City,
// Isabela). Data: Open-Meteo (free, no key). Observed/model rain for the past
// and the forecast come from the forecast API; the 2000–2024 "normal" comes
// from the archive API. This is gridded model data for the site's
// coordinates, not a rain gauge on the property.
//
// Everything the dashboard and the reservoir logic need is built from ONE
// report so the two Open-Meteo calls are made once and shared.
//
// Caching: pages here are `force-dynamic`, which makes Next.js skip its fetch
// cache. So results are also kept in module memory (per server instance) with
// a TTL — 30 min for the forecast, 12 h for the 25-year history — and
// concurrent requests share one in-flight download.

const LATITUDE = 16.953034;
const LONGITUDE = 121.766655;
const TZ_OFFSET_HOURS = 8; // Asia/Manila, no DST
const CLIM_START_YEAR = 2000;
const CLIM_END_YEAR = 2024;

export type RainCategory = "dry" | "light" | "moderate" | "heavy" | "very-heavy";

/** Simple daily scale used across the page. mm per day. */
export const RAIN_CATEGORIES: { key: RainCategory; label: string; min: number; max: number | null; blurb: string }[] = [
  { key: "dry", label: "Dry", min: 0, max: 1, blurb: "Under 1 mm" },
  { key: "light", label: "Light rain", min: 1, max: 10, blurb: "1 to 10 mm" },
  { key: "moderate", label: "Moderate rain", min: 10, max: 25, blurb: "10 to 25 mm" },
  { key: "heavy", label: "Heavy rain", min: 25, max: 50, blurb: "25 to 50 mm" },
  { key: "very-heavy", label: "Very heavy rain", min: 50, max: null, blurb: "50 mm or more" },
];

export function categorize(mm: number | null | undefined): RainCategory {
  const v = mm ?? 0;
  if (v >= 50) return "very-heavy";
  if (v >= 25) return "heavy";
  if (v >= 10) return "moderate";
  if (v >= 1) return "light";
  return "dry";
}

export interface RainDay {
  date: string; // YYYY-MM-DD (Manila)
  mm: number | null; // null = no data for that day
  probability: number | null; // % chance of measurable rain, forecast days only
  hours: number | null; // hours with rain, forecast days only
}

export interface RainHour {
  time: string; // YYYY-MM-DDTHH:00 (Manila)
  mm: number;
  probability: number | null;
}

export interface CumulativePoint {
  day: number; // day of month, 1-based
  actual: number | null; // null once we pass the last complete day
  normal: number | null;
}

export interface MonthToDate {
  month: string; // YYYY-MM
  monthLabel: string;
  daysCompared: number; // complete days so far this month
  daysInMonth: number;
  actualMm: number;
  normalToDateMm: number; // average of the SAME days in 2000–2024
  normalFullMonthMm: number;
  percentOfNormal: number | null; // null when normal is ~0 or history unavailable
  lowConfidence: boolean; // fewer than 7 days elapsed
  cumulative: CumulativePoint[];
}

export interface MonthTotal {
  month: string; // YYYY-MM
  label: string; // "Oct"
  year: number;
  mm: number | null;
  normalMm: number | null;
  partial: boolean; // current month, complete days only
}

export interface RainOutlook {
  tone: "dry" | "wet" | "heavy";
  headline: string;
  detail: string;
}

export interface RainfallReport {
  generatedAt: string;
  today: string;
  past30: RainDay[]; // oldest → newest, ends yesterday
  forecast7: RainDay[]; // today → +6
  hourly: RainHour[]; // next 48 hours
  totals: { past7: number; past30: number; next3: number; next7: number };
  rainyDaysNext7: number; // days with >= 1 mm forecast
  wettestForecast: { date: string; mm: number } | null;
  heavyRainExpected: boolean; // any forecast day >= 25 mm
  monthToDate: MonthToDate;
  months12: MonthTotal[];
  outlook: RainOutlook;
  historyAvailable: boolean;
}

// ───────────── small utilities ─────────────

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
/** Manila wall-clock parts for an instant. */
function manilaParts(now: Date) {
  const l = new Date(now.getTime() + TZ_OFFSET_HOURS * 3600_000);
  return { y: l.getUTCFullYear(), m: l.getUTCMonth() + 1, d: l.getUTCDate(), h: l.getUTCHours() };
}
function dateStr(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}
function addDays(date: string, n: number) {
  const t = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) + n * 86_400_000;
  const x = new Date(t);
  return dateStr(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
}
function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function weekdayName(date: string) {
  return WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
}
const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

// ───────────── tiny TTL cache with in-flight sharing ─────────────

const store = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = fn()
    .then((v) => {
      store.set(key, { at: Date.now(), value: v });
      return v;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ───────────── Open-Meteo ─────────────

interface DailyBlock {
  time?: string[];
  precipitation_sum?: (number | null)[];
  precipitation_probability_max?: (number | null)[];
  precipitation_hours?: (number | null)[];
}
interface HourlyBlock {
  time?: string[];
  precipitation?: (number | null)[];
  precipitation_probability?: (number | null)[];
}

async function getJson<T>(url: string, revalidate: number): Promise<T> {
  const res = await fetch(url, { next: { revalidate } });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return (await res.json()) as T;
}

interface ForecastData {
  daily: DailyBlock;
  hourly: HourlyBlock;
}
function fetchForecast(): Promise<ForecastData> {
  return cached("om-forecast", 30 * 60_000, async () => {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
      `&daily=precipitation_sum,precipitation_probability_max,precipitation_hours` +
      `&hourly=precipitation,precipitation_probability` +
      `&past_days=92&forecast_days=7&timezone=Asia%2FManila`;
    const j = await getJson<ForecastData>(url, 1800);
    if (!j.daily?.time?.length) throw new Error("Open-Meteo forecast has no daily data");
    return { daily: j.daily, hourly: j.hourly ?? {} };
  });
}

interface History {
  /** date → mm, from 2000-01-01 up to the archive's latest day */
  daily: Map<string, number>;
  /** mean monthly total 2000–2024, index 0 = Jan */
  normalMonth: (number | null)[];
  /** normalCum[month-1][day-1] = mean cumulative mm through that day of the month */
  normalCum: (number | null)[][];
}
function fetchHistory(now: Date): Promise<History> {
  return cached("om-archive", 12 * 3600_000, async () => {
    const p = manilaParts(now);
    const end = addDays(dateStr(p.y, p.m, p.d), -6); // the archive trails real time by a few days
    const url =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
      `&start_date=${CLIM_START_YEAR}-01-01&end_date=${end}&daily=precipitation_sum&timezone=Asia%2FManila`;
    const j = await getJson<{ daily?: DailyBlock }>(url, 86_400);
    const times = j.daily?.time ?? [];
    const vals = j.daily?.precipitation_sum ?? [];
    if (!times.length) throw new Error("Open-Meteo archive has no daily data");

    const daily = new Map<string, number>();
    times.forEach((t, i) => {
      const v = vals[i];
      if (v != null) daily.set(t, v);
    });

    // Climatology from complete years only.
    const monthTotals: number[][] = Array.from({ length: 12 }, () => []);
    const cumSums: number[][] = Array.from({ length: 12 }, () => Array(31).fill(0));
    const cumCounts: number[][] = Array.from({ length: 12 }, () => Array(31).fill(0));
    for (let y = CLIM_START_YEAR; y <= CLIM_END_YEAR; y++) {
      for (let m = 1; m <= 12; m++) {
        const dim = daysInMonth(y, m);
        let run = 0;
        let complete = true;
        for (let d = 1; d <= dim; d++) {
          const v = daily.get(dateStr(y, m, d));
          if (v == null) {
            complete = false;
            break;
          }
          run += v;
          cumSums[m - 1][d - 1] += run;
          cumCounts[m - 1][d - 1] += 1;
        }
        if (complete) monthTotals[m - 1].push(run);
      }
    }
    const normalMonth = monthTotals.map((a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null));
    const normalCum = cumSums.map((row, mi) => row.map((s, di) => (cumCounts[mi][di] ? s / cumCounts[mi][di] : null)));
    return { daily, normalMonth, normalCum };
  });
}

// ───────────── report ─────────────

function buildOutlook(forecast7: RainDay[], totalNext7: number, rainyDays: number): RainOutlook {
  const days = forecast7.filter((d) => d.mm != null);
  if (!days.length) return { tone: "dry", headline: "No forecast available", detail: "The weather service returned no forecast days." };
  const wettest = days.reduce((a, b) => ((b.mm ?? 0) > (a.mm ?? 0) ? b : a));
  const wettestCat = categorize(wettest.mm);
  const when = (d: RainDay) => (d.date === forecast7[0].date ? "today" : weekdayName(d.date));
  if (wettestCat === "heavy" || wettestCat === "very-heavy") {
    return {
      tone: "heavy",
      headline: `${wettestCat === "very-heavy" ? "Very heavy" : "Heavy"} rain expected ${when(wettest)}`,
      detail: `About ${Math.round(wettest.mm ?? 0)} mm is forecast on ${when(wettest)}. ${rainyDays} of the next 7 days have measurable rain, ${Math.round(totalNext7)} mm in total.`,
    };
  }
  if (rainyDays === 0) {
    return { tone: "dry", headline: "Dry week ahead", detail: "No day in the next 7 is forecast to reach 1 mm of rain." };
  }
  if (rainyDays <= 2 && totalNext7 < 20) {
    return {
      tone: "dry",
      headline: "Mostly dry, a little rain possible",
      detail: `Rain on ${rainyDays} of the next 7 days, ${Math.round(totalNext7)} mm in total. The most is ${Math.round(wettest.mm ?? 0)} mm on ${when(wettest)}.`,
    };
  }
  return {
    tone: "wet",
    headline: `Rain on ${rainyDays} of the next 7 days`,
    detail: `${Math.round(totalNext7)} mm in total. The wettest day is ${when(wettest)} with about ${Math.round(wettest.mm ?? 0)} mm.`,
  };
}

export async function getRainfallReport(now: Date = new Date()): Promise<RainfallReport> {
  const [forecast, history] = await Promise.all([fetchForecast(), fetchHistory(now).catch(() => null)]);
  const { y, m, d, h } = manilaParts(now);
  const today = dateStr(y, m, d);

  // Day-by-day record: archive first, then the forecast API's recent days on top (fresher).
  const dayMap = new Map<string, number>(history?.daily ?? []);
  const fTimes = forecast.daily.time ?? [];
  const fSum = forecast.daily.precipitation_sum ?? [];
  const fProb = forecast.daily.precipitation_probability_max ?? [];
  const fHours = forecast.daily.precipitation_hours ?? [];
  fTimes.forEach((t, i) => {
    if (t < today && fSum[i] != null) dayMap.set(t, fSum[i] as number);
  });

  const past30: RainDay[] = [];
  for (let i = 30; i >= 1; i--) {
    const date = addDays(today, -i);
    past30.push({ date, mm: dayMap.has(date) ? (dayMap.get(date) as number) : null, probability: null, hours: null });
  }
  const forecast7: RainDay[] = [];
  fTimes.forEach((t, i) => {
    if (t >= today) {
      forecast7.push({ date: t, mm: fSum[i] ?? null, probability: fProb[i] ?? null, hours: fHours[i] ?? null });
    }
  });
  forecast7.splice(7);

  // Next 48 hours from the current Manila hour.
  const hTimes = forecast.hourly.time ?? [];
  const hMm = forecast.hourly.precipitation ?? [];
  const hProb = forecast.hourly.precipitation_probability ?? [];
  const nowKey = `${today}T${pad(h)}:00`;
  const hourly: RainHour[] = [];
  for (let i = 0; i < hTimes.length && hourly.length < 48; i++) {
    if (hTimes[i] >= nowKey) hourly.push({ time: hTimes[i], mm: hMm[i] ?? 0, probability: hProb[i] ?? null });
  }

  const past7 = sum(past30.slice(-7).map((x) => x.mm));
  const totalPast30 = sum(past30.map((x) => x.mm));
  const next3 = sum(forecast7.slice(0, 3).map((x) => x.mm));
  const next7 = sum(forecast7.map((x) => x.mm));
  const rainyDaysNext7 = forecast7.filter((x) => (x.mm ?? 0) >= 1).length;
  const wet = forecast7.filter((x) => x.mm != null).sort((a, b) => (b.mm ?? 0) - (a.mm ?? 0))[0];

  // Month to date vs the same days in 2000–2024.
  const dim = daysInMonth(y, m);
  const daysCompared = d - 1;
  const normalRow = history?.normalCum[m - 1] ?? [];
  let actualRun = 0;
  const cumulative: CumulativePoint[] = [];
  for (let day = 1; day <= dim; day++) {
    let actual: number | null = null;
    if (day <= daysCompared) {
      actualRun += dayMap.get(dateStr(y, m, day)) ?? 0;
      actual = actualRun;
    }
    cumulative.push({ day, actual, normal: normalRow[day - 1] ?? null });
  }
  const normalToDate = daysCompared >= 1 ? normalRow[daysCompared - 1] ?? null : 0;
  const normalFull = history?.normalMonth[m - 1] ?? null;
  const monthToDate: MonthToDate = {
    month: `${y}-${pad(m)}`,
    monthLabel: `${MONTH_LONG[m - 1]} ${y}`,
    daysCompared,
    daysInMonth: dim,
    actualMm: actualRun,
    normalToDateMm: normalToDate ?? 0,
    normalFullMonthMm: normalFull ?? 0,
    percentOfNormal: normalToDate != null && normalToDate > 1 && daysCompared >= 1 ? (actualRun / normalToDate) * 100 : null,
    lowConfidence: daysCompared < 7,
    cumulative,
  };

  // Last 12 months (the current month counts complete days only).
  const months12: MonthTotal[] = [];
  for (let k = 11; k >= 0; k--) {
    let yy = y;
    let mm = m - k;
    while (mm < 1) {
      mm += 12;
      yy -= 1;
    }
    const isCurrent = yy === y && mm === m;
    const last = isCurrent ? daysCompared : daysInMonth(yy, mm);
    let total = 0;
    let have = 0;
    for (let day = 1; day <= last; day++) {
      const v = dayMap.get(dateStr(yy, mm, day));
      if (v != null) {
        total += v;
        have++;
      }
    }
    months12.push({
      month: `${yy}-${pad(mm)}`,
      label: MONTH_SHORT[mm - 1],
      year: yy,
      mm: have >= Math.max(1, last - 3) ? total : null, // tolerate a few missing days, else show a gap
      normalMm: history?.normalMonth[mm - 1] ?? null,
      partial: isCurrent,
    });
  }

  return {
    generatedAt: now.toISOString(),
    today,
    past30,
    forecast7,
    hourly,
    totals: { past7, past30: totalPast30, next3, next7 },
    rainyDaysNext7,
    wettestForecast: wet ? { date: wet.date, mm: wet.mm ?? 0 } : null,
    heavyRainExpected: forecast7.some((x) => (x.mm ?? 0) >= 25),
    monthToDate,
    months12,
    outlook: buildOutlook(forecast7, next7, rainyDaysNext7),
    historyAvailable: !!history,
  };
}

// ───────────── compatibility wrapper for the reservoir logic ─────────────

export interface RainfallVsNormal {
  month: string;
  daysCompared: number;
  actualMm: number;
  normalMm: number;
  percentOfNormal: number | null;
  lowConfidence: boolean;
}

/** Month-to-date vs normal for the same days — what the MIKE script calls "rainfall %". */
export async function getRainfallVsNormal(now: Date = new Date()): Promise<RainfallVsNormal> {
  const r = await getRainfallReport(now);
  const t = r.monthToDate;
  return {
    month: t.month,
    daysCompared: t.daysCompared,
    actualMm: t.actualMm,
    normalMm: t.normalToDateMm,
    percentOfNormal: t.percentOfNormal,
    lowConfidence: t.lowConfidence,
  };
}