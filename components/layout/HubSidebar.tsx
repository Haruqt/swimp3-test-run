"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import clsx from "clsx";

// Small inline icons matching the old site's mdi icon choices per section
// (mdi-speedometer for Dashboard, mdi-laptop for Sensors, mdi-security for
// CCTV) — done as plain SVGs rather than pulling in a new icon package,
// since that'd need an npm install this environment can't verify builds.
function SpeedometerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21a9 9 0 1 1 9-9" strokeLinecap="round" />
      <path d="M12 12l4-3" strokeLinecap="round" />
      <path d="M12 12a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />
    </svg>
  );
}
function LaptopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M2 20h20" strokeLinecap="round" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinejoin="round" />
    </svg>
  );
}
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={clsx("h-3.5 w-3.5 shrink-0 transition-transform", open ? "rotate-180" : "")}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Sensors and CCTV submenu labels match the old sidenav.blade.php text
// exactly ("Ground Water Well", "Device List", "Software") — only the URLs
// differ since this is a different framework.
const dashboardItem = { href: "/dashboard", label: "Dashboard" };

const sensorsSub = [
  { href: "/sensors/groundwater", label: "Ground Water Well" },
  { href: "/sensors/pressure", label: "Pressure Sensors" },
  { href: "/sensors/smart-water-meter", label: "Smart Water Meter" },
];

const cctvSub = [
  { href: "/cctv/devices", label: "Device List" },
  { href: "/cctv/software", label: "Software" },
];

// Collapsible nav group — matches the old site's dropdown-style section
// behavior: expanded by default (nothing hidden until the person chooses
// to hide it), with a chevron that flips and a smooth height animation.
function NavGroup({
  label,
  icon,
  items,
  pathname,
}: {
  label: string;
  icon: React.ReactNode;
  items: { href: string; label: string }[];
  pathname: string;
}) {
  // Defaults to open — collapsing is opt-in, never forced on the person.
  const [open, setOpen] = useState(true);

  return (
    <div className="pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2.5 rounded-lg px-3 py-1 text-xs font-semibold uppercase tracking-wide text-mist/40 transition hover:text-mist/70"
      >
        <span className="flex items-center gap-2.5">
          {icon}
          {label}
        </span>
        <ChevronIcon open={open} />
      </button>
      <div className={clsx("grid overflow-hidden transition-all duration-200", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="min-h-0 space-y-1 pt-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "block rounded-lg px-3 py-2 text-sm transition",
                pathname === item.href
                  ? "bg-river text-white"
                  : "text-mist/70 hover:bg-white/5 hover:text-mist"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HubSidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    // sticky + h-screen: previously this aside had no height of its own,
    // so it just stretched to match however tall the main content was —
    // on a long dashboard the WHOLE PAGE scrolled together, and the
    // Log out button (at the bottom of the flex column) scrolled off
    // screen with it. Pinning the sidebar to the viewport height and
    // scrolling only its own nav list means Log out is always visible.
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-zinc-900 px-4 py-6">
      <div className="flex items-center gap-2.5">
        {/* Same ISU logo used on /login, so the two feel like one system. */}
        <Image src="/images/about/isu-logo.png" alt="ISU" width={32} height={32} className="h-8 w-8 shrink-0" />
        <p className="font-display text-lg font-semibold text-mist">Swim Central Hub</p>
      </div>

      {/* Profile block — the old sidebar had a small green "online" dot
          badged onto the corner of the avatar circle (count-indicator /
          count bg-success); reproduced here the same way. */}
      <div className="mt-6 flex items-center gap-3 rounded-lg bg-white/5 p-3">
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full">
          <Image src="/images/about/isu-logo.png" alt="" fill className="object-cover" />
          <span
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink bg-emerald-400"
            aria-hidden
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-mist">Swim Project 3</p>
          <p className="truncate text-xs text-mist/50">{userEmail}</p>
        </div>
      </div>

      {/* This is the only part of the sidebar that scrolls internally —
          everything above (logo/profile) and below (Log out) stays fixed
          in place no matter how long the nav list gets. */}
      <nav className="mt-6 flex-1 space-y-1 overflow-y-auto">
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-mist/40">
          Navigation
        </p>

        <Link
          href={dashboardItem.href}
          className={clsx(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
            pathname === dashboardItem.href
              ? "bg-river text-white"
              : "text-mist/70 hover:bg-white/5 hover:text-mist"
          )}
        >
          <SpeedometerIcon />
          {dashboardItem.label}
        </Link>

        <Link
          href="/reservoir"
          className={clsx(
            "mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
            pathname === "/reservoir" ? "bg-river text-white" : "text-mist/70 hover:bg-white/5 hover:text-mist"
          )}
        >
          <SpeedometerIcon />
          Reservoir Prediction
        </Link>

        <NavGroup label="Sensors" icon={<LaptopIcon />} items={sensorsSub} pathname={pathname} />
        <NavGroup label="CCTV" icon={<ShieldIcon />} items={cctvSub} pathname={pathname} />
      </nav>

      <button
        onClick={handleLogout}
        className="mt-4 flex shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2.5 text-sm font-medium text-mist/70 transition hover:border-clay hover:bg-clay/10 hover:text-clay"
      >
        <LogoutIcon />
        Log out
      </button>
    </aside>
  );
}