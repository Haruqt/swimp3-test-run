import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import type { HazardMap } from "@/lib/types";
import { Footer } from "@/components/layout/Footer";

export const dynamic = "force-dynamic"; // avoid stale cached hazard map data

export default async function MapsOutputPage() {
  const supabase = createClient();
  const { data: maps } = await supabase
    .from("hazard_maps")
    .select("*")
    .order("category", { ascending: true });

  const list = (maps as HazardMap[] | null) ?? [];

  return (
    <>
    <main className="flex-1">
      <section className="bg-gradient-to-br from-river to-river-light px-6 pb-20 pt-32">
        <h1 className="mx-auto max-w-6xl font-display text-4xl font-semibold text-white">
          Maps Output
        </h1>
      </section>

      <section className="px-6 py-12">
        <div className="mx-auto max-w-5xl divide-y divide-ink/10">
          {list.map((map) => (
            <Link
              key={map.slug}
              href={`/data/maps/${map.slug}`}
              className="flex gap-8 py-8 transition hover:bg-mist"
            >
              <div className="relative h-40 w-56 shrink-0 overflow-hidden rounded-lg bg-white sm:h-48 sm:w-72">
                {map.thumbnail_url && (
                  <Image src={map.thumbnail_url} alt="" fill sizes="288px" className="object-contain p-2" />
                )}
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold text-river">
                  {map.title}
                </h2>
                <p className="mt-1 font-medium text-ink">{map.location}</p>
                <p className="mt-2 line-clamp-3 text-ink/60">
                  {map.description}
                </p>
              </div>
            </Link>
          ))}
          {list.length === 0 && (
            <p className="py-12 text-center text-ink/50">No hazard maps found.</p>
          )}
        </div>
      </section>
    </main>
    <Footer />
    </>
  );
}