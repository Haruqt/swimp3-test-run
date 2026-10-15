"use client";

import { useState } from "react";
import clsx from "clsx";
import type { Alert } from "@/lib/types";

/**
 * The dashboard page fetches data server-side (no event handlers allowed
 * there), which is why the old inline "✕" button did nothing — it had no
 * onClick at all. This pulls the alert banners into their own small
 * client component so dismiss actually works.
 *
 * Note: dismissing here only hides it for this page view (local state) —
 * it does NOT mark the alert resolved in the database, so it'll reappear
 * on a refresh. Marking it actually resolved server-side would need a
 * mutation (an API route or server action) and is a reasonable next step
 * if you want dismissal to stick permanently.
 */
export function DismissibleAlerts({ alerts }: { alerts: Alert[] }) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const visible = alerts.filter((a) => !dismissedIds.has(a.id));

  if (visible.length === 0) return null;

  return (
    <div className="mb-8 space-y-4">
      {visible.map((alert) => {
        const isWarning = alert.severity === "medium";
        return (
          <div
            key={alert.id}
            className={clsx(
              "flex items-start justify-between rounded-lg border px-5 py-4",
              isWarning
                ? "border-[#ffe7b8] bg-[#ffeecc] text-[#855900]"
                : "border-[#fecacc] bg-[#fed9db] text-[#832226]"
            )}
          >
            <div>
              <p className="font-bold">{alert.title}</p>
              <p className="mt-1 text-sm text-black/70">{alert.description}</p>
              {alert.root_cause && (
                <p className="mt-1 text-sm">
                  Data Status: <span className="underline">{alert.root_cause}</span>
                </p>
              )}
            </div>
            <button
              onClick={() => setDismissedIds((prev) => new Set(prev).add(alert.id))}
              className="text-black/40 hover:text-black/70"
              aria-label="Dismiss alert"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}