/**
 * Vendor platforms (XYT, DTUIP, watermeter) send timestamps like
 * "2026-10-15 10:03:00" with NO timezone. They are Philippine local time
 * (UTC+8). `new Date()` on a naive string uses the SERVER's timezone, which is
 * Manila on a local PC but UTC on Vercel — that shifted readings by 8 hours.
 * This always reads naive timestamps as +08:00; strings that already carry
 * "Z" or an offset are left alone.
 */
export function parseVendorTime(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  let s = String(raw).trim();
  s = s.replace(/^(\d{4})\/(\d{2})\/(\d{2})/, "$1-$2-$3").replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += "+08:00";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}