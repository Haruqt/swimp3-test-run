"use client";

import { useRef, useState } from "react";

/**
 * Shared table body for the Groundwater / Pressure / Smart Water Meter
 * device-list pages (2026-09-22). Two things the old site had that the
 * rebuild's plain <table>s didn't:
 *
 *   1. Resizable columns — drag the thin strip on a column's right edge to
 *      widen/narrow it, "like Excel". Implemented with a <colgroup> of
 *      per-column widths in state; dragging only touches the width number,
 *      the column elements do the rest (this is the standard way to resize
 *      an HTML table without fighting the browser's own auto-layout).
 *   2. Pagination with an entries-per-page control ("Showing X to Y of Z
 *      entries" + Previous/Next), matching the old DataTables-style pages
 *      instead of dumping every row on screen at once.
 *
 * Callers own the tabs/search/export UI around this — this component is
 * just the <table> + pager, so it can drop into both the Groundwater table
 * (well/reservoir tabs) and the Pressure/Smart-Meter tables (no tabs)
 * without duplicating the resize/pagination logic in both places.
 */

export interface ColumnDef<T> {
  key: string;
  header: React.ReactNode;
  width?: number;
  render: (row: T) => React.ReactNode;
}

export function ResizableTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage,
  pageSize,
  page,
  onPageChange,
}: {
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage: string;
  pageSize: number;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(columns.map((c) => [c.key, c.width ?? 160]))
  );
  const dragState = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  function onResizeStart(e: React.MouseEvent, key: string) {
    e.preventDefault();
    dragState.current = { key, startX: e.clientX, startWidth: widths[key] };

    function onMove(ev: MouseEvent) {
      const drag = dragState.current;
      if (!drag) return;
      const delta = ev.clientX - drag.startX;
      const next = Math.max(70, drag.startWidth + delta);
      setWidths((w) => ({ ...w, [drag.key]: next }));
    }
    function onUp() {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const pageRows = rows.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);
  const totalWidth = columns.reduce((sum, c) => sum + (widths[c.key] ?? 160), 0);

  return (
    <div>
      <div className="overflow-x-auto rounded-t-xl bg-white/5">
        <table className="text-left text-sm" style={{ tableLayout: "fixed", width: totalWidth, minWidth: "100%" }}>
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={{ width: widths[c.key] }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-mist/40">
              {columns.map((c) => (
                <th key={c.key} className="relative select-none px-4 py-3">
                  {c.header}
                  {/* Drag handle — right edge of the header cell */}
                  <span
                    onMouseDown={(e) => onResizeStart(e, c.key)}
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-river/40 active:bg-river/60"
                    title="Drag to resize column"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                {columns.map((c) => (
                  <td key={c.key} className="truncate px-4 py-3">
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6 text-center text-sm text-mist/40">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-b-xl border-t border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs text-mist/60">
        <span>
          Showing {rows.length === 0 ? 0 : (clampedPage - 1) * pageSize + 1} to{" "}
          {Math.min(clampedPage * pageSize, rows.length)} of {rows.length} entries
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={clampedPage <= 1}
            onClick={() => onPageChange(clampedPage - 1)}
            className="rounded-lg border border-white/10 px-2.5 py-1 font-medium text-mist/70 hover:border-river disabled:opacity-40 disabled:hover:border-white/10"
          >
            « Previous
          </button>
          <span>
            {clampedPage} of {totalPages}
          </span>
          <button
            disabled={clampedPage >= totalPages}
            onClick={() => onPageChange(clampedPage + 1)}
            className="rounded-lg border border-white/10 px-2.5 py-1 font-medium text-mist/70 hover:border-river disabled:opacity-40 disabled:hover:border-white/10"
          >
            Next »
          </button>
        </div>
      </div>
    </div>
  );
}