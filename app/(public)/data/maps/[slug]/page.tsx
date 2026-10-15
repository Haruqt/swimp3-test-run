import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { HazardMap } from "@/lib/types";
import { HazardMapViewerClient as HazardMapViewer } from "@/components/map/HazardMapViewerClient";
import { LiquefactionMapViewerClient } from "@/components/map/LiquefactionMapViewerClient";
import { GroundShakingMapViewerClient } from "@/components/map/GroundShakingMapViewerClient";
import { Footer } from "@/components/layout/Footer";

export const dynamic = "force-dynamic"; // avoid stale cached hazard map data

export default async function HazardMapDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createClient();
  const { data: map } = await supabase
    .from("hazard_maps")
    .select("*")
    .eq("slug", params.slug)
    .single();

  if (!map) notFound();
  const hazardMap = map as HazardMap;

  return (
    <>
    <main className="flex-1">
      <div className="h-[70vh] w-full border-b border-ink/10">
        {hazardMap.slug === "LiquefactionHazardMap" ? (
          <LiquefactionMapViewerClient />
        ) : hazardMap.slug === "GroundShakingHazardMap" ? (
          <GroundShakingMapViewerClient />
        ) : (
          <HazardMapViewer
            geojsonUrl={hazardMap.geojson_url}
            imageOverlayUrl={hazardMap.image_overlay_url}
            imageBounds={hazardMap.image_bounds}
            legend={hazardMap.legend}
          />
        )}
      </div>

      <section className="px-6 py-12">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-semibold text-ink">
            {hazardMap.title}
          </h1>
          <p className="mt-2 font-medium text-ink/70">{hazardMap.location}</p>
          <p className="mt-4 leading-relaxed text-ink/80">{hazardMap.description}</p>
        </div>
      </section>
    </main>
    <Footer />
    </>
  );
}