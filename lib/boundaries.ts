// Real administrative boundary sources for the "Other Layers" map panel.
//
// Source: github.com/faeldon/philippines-json-maps (faeldon), MIT licensed,
// PSGC data as of 31 Dec 2023. Files are large multi-feature FeatureCollections
// (e.g. "every barangay in Cauayan"), so we fetch once, cache the raw
// collection per source URL, and filter down to the single named feature the
// layer needs on the client.
//
// PSGC codes used to build these paths (confirmed against Wikipedia infoboxes
// for other Isabela LGUs, which follow the same 10-digit "0203" + seq + "000"
// pattern — e.g. Aurora=0203103000, Burgos=0203105000, Quezon=0203122000,
// San Pablo=0203133000):
//   Isabela province   = 0203100000
//   Cauayan City       = 0203108000
// File names use the PSGC code with its leading zero stripped (as if parsed
// as an integer), matching the one confirmed real file in this repo:
// 2023/geojson/regions/lowres/provdists-region-200000000.0.001.json (region
// 02 Cagayan Valley, full code 0200000000 -> 200000000).

export type BoundaryLayerName =
  | "Cabaruan Boundary"
  | "Cauayan Boundary"
  | "Isabela Boundary";

interface BoundarySource {
  /** Raw GeoJSON FeatureCollection URL containing many sibling features. */
  url: string;
  /** Property key on each feature holding that feature's display name. */
  nameProp: string;
  /** The specific feature to pull out of the collection. */
  featureName: string;
  /** Stroke color for this layer on the map (kept distinct per layer so
   *  Cabaruan/Cauayan/Isabela don't blur together when shown at once). */
  color: string;
}

export const boundarySources: Record<BoundaryLayerName, BoundarySource> = {
  "Isabela Boundary": {
    url: "https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/2023/geojson/regions/lowres/provdists-region-200000000.0.001.json",
    nameProp: "adm2_en",
    featureName: "Isabela",
    color: "#2E7D8C", // teal
  },
  "Cauayan Boundary": {
    url: "https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/2023/geojson/provdists/lowres/municities-provdist-203100000.0.001.json",
    nameProp: "adm3_en",
    featureName: "Cauayan",
    color: "#8B5CF6", // violet
  },
  "Cabaruan Boundary": {
    url: "https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/2023/geojson/municities/lowres/bgysubmuns-municity-203108000.0.001.json",
    nameProp: "adm4_en",
    featureName: "Cabaruan",
    color: "#F59E0B", // amber
  },
};

// Cache the full parsed collection per source URL so toggling multiple
// layers that happen to share a file (they don't currently, but might if
// more barangays get added later) only costs one network request.
const collectionCache = new Map<string, Promise<GeoJSON.FeatureCollection>>();

async function loadCollection(url: string): Promise<GeoJSON.FeatureCollection> {
  let pending = collectionCache.get(url);
  if (!pending) {
    pending = fetch(url).then((res) => {
      if (!res.ok) {
        throw new Error(`Boundary source returned ${res.status}: ${url}`);
      }
      return res.json();
    });
    collectionCache.set(url, pending);
    // Don't cache a rejected fetch — let the next toggle retry.
    pending.catch(() => collectionCache.delete(url));
  }
  return pending;
}

/**
 * Fetch a named boundary layer and return just its single feature, or null
 * if the source couldn't be loaded or didn't contain that name (e.g. a
 * barangay was renamed since the 2023 PSGC snapshot).
 */
export async function fetchBoundaryFeature(
  layer: BoundaryLayerName
): Promise<GeoJSON.Feature | null> {
  const source = boundarySources[layer];
  try {
    const collection = await loadCollection(source.url);
    const feature = collection.features.find(
      (f) => f.properties?.[source.nameProp] === source.featureName
    );
    return feature ?? null;
  } catch {
    return null;
  }
}