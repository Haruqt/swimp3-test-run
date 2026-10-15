import type { Device } from "@/lib/types";

export function DeviceTable({ devices }: { devices: Device[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5 text-xs uppercase tracking-wide text-mist/50">
          <tr>
            <th className="px-4 py-3">Device ID</th>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Network</th>
            <th className="px-4 py-3">Last Update</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.id} className="border-t border-white/5">
              <td className="px-4 py-3 font-mono text-xs text-mist/70">
                {d.external_device_id}
              </td>
              <td className="px-4 py-3 text-mist">{d.name}</td>
              <td className="px-4 py-3 text-mist/60">{d.network_type ?? "—"}</td>
              <td className="px-4 py-3 font-mono text-xs text-mist/50">
                {d.last_update ? new Date(d.last_update).toLocaleString() : "—"}
              </td>
              <td className="px-4 py-3">
                <span
                  className={
                    d.status === "online"
                      ? "rounded-full bg-moss/20 px-2 py-0.5 text-xs text-moss-light"
                      : "rounded-full bg-clay/20 px-2 py-0.5 text-xs text-clay-light"
                  }
                >
                  {d.status}
                </span>
              </td>
            </tr>
          ))}
          {devices.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-mist/40">
                No devices found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
