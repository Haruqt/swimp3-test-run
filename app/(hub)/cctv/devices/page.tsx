import { createClient } from "@/lib/supabase/server";
import { DeviceTable } from "@/components/hub/DeviceTable";
import { CctvPlayer } from "@/components/hub/CctvPlayer";
import { SummaryCard, SignalIcon } from "@/components/hub/SummaryCard";
import type { Device } from "@/lib/types";

export const dynamic = "force-dynamic"; // avoid stale cached device data

export default async function CctvDevicesPage() {
  const supabase = createClient();
  const { data } = await supabase.from("devices").select("*").eq("group_type", "cctv");
  const devices = (data as Device[] | null) ?? [];
  const online = devices.filter((d) => d.status === "online").length;

  return (
    <div className="p-8">
      <h1 className="font-display text-2xl font-semibold text-mist">
        CCTV — Device Management
      </h1>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard label="Number of Online Devices" value={online} gradient="from-amber-500 to-orange-500" icon={<SignalIcon />} />
      </div>

      {online > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-lg font-semibold text-mist">Live Feed</h2>
          <div className="mt-4 max-w-2xl">
            <CctvPlayer />
          </div>
        </div>
      )}

      <div className="mt-8">
        <DeviceTable devices={devices} />
      </div>
    </div>
  );
}