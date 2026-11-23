/**
 * "AI Big Database" nearby-places lookup, powered by OpenStreetMap's Overpass
 * API (a free, crowd-sourced geodata index covering the whole planet).
 *
 * - Vila listings surface nearby tourism spots (what most villa guests search for).
 * - Kos/Kontrakan listings surface nearby culinary spots and everyday public
 *   facilities (what most long-stay renters search for).
 *
 * Results are cached in memory per coordinate+type so re-opening the same
 * listing modal doesn't re-query the network.
 */

export type NearbyCategory = "wisata" | "kuliner" | "fasilitas";

export type NearbyPlace = {
  name: string;
  category: NearbyCategory;
  kind: string;
  /** Precise distance in meters, available for live geodata lookups (Overpass). */
  distanceMeters?: number;
  /** Human-readable distance for curated/researched entries (e.g. "±2 km"). */
  distanceLabel?: string;
  /** Attribution for curated entries researched via web search (e.g. "Tripadvisor"). */
  source?: string;
  sourceUrl?: string;
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const TOURISM_KINDS = ["attraction", "viewpoint", "museum", "artwork", "gallery", "zoo", "theme_park"];
const CULINARY_AMENITIES = ["restaurant", "cafe", "fast_food", "food_court"];
const FACILITY_AMENITIES = ["hospital", "clinic", "pharmacy", "school", "university", "bank", "marketplace", "place_of_worship", "police", "fuel"];
const FACILITY_SHOPS = ["supermarket", "convenience"];

const cache = new Map<string, Promise<NearbyPlace[]>>();

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineMeters(a: [number, number], b: [number, number]): number {
  const earthRadius = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isVila(listingType: string): boolean {
  return listingType === "Vila";
}

function overpassQuery(coordinates: [number, number], listingType: string): string {
  const [lat, lon] = coordinates;
  if (isVila(listingType)) {
    const radius = 6000;
    const tourismFilter = TOURISM_KINDS.join("|");
    return `[out:json][timeout:20];(node["tourism"~"${tourismFilter}"](around:${radius},${lat},${lon});node["natural"="beach"](around:${radius},${lat},${lon});node["leisure"="water_park"](around:${radius},${lat},${lon});way["tourism"~"${tourismFilter}"](around:${radius},${lat},${lon}););out center 40;`;
  }
  const radius = 2000;
  const culinaryFilter = CULINARY_AMENITIES.join("|");
  const facilityFilter = FACILITY_AMENITIES.join("|");
  const shopFilter = FACILITY_SHOPS.join("|");
  return `[out:json][timeout:20];(node["amenity"~"${culinaryFilter}"](around:${radius},${lat},${lon});node["amenity"~"${facilityFilter}"](around:${radius},${lat},${lon});node["shop"~"${shopFilter}"](around:${radius},${lat},${lon}););out center 60;`;
}

function classify(tags: Record<string, string>, listingType: string): { category: NearbyCategory; kind: string } | null {
  if (isVila(listingType)) {
    if (tags.tourism && TOURISM_KINDS.includes(tags.tourism)) return { category: "wisata", kind: tags.tourism };
    if (tags.natural === "beach") return { category: "wisata", kind: "beach" };
    if (tags.leisure === "water_park") return { category: "wisata", kind: "water_park" };
    return null;
  }
  if (tags.amenity && CULINARY_AMENITIES.includes(tags.amenity)) return { category: "kuliner", kind: tags.amenity };
  if (tags.amenity && FACILITY_AMENITIES.includes(tags.amenity)) return { category: "fasilitas", kind: tags.amenity };
  if (tags.shop && FACILITY_SHOPS.includes(tags.shop)) return { category: "fasilitas", kind: tags.shop };
  return null;
}

type OverpassElement = {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

async function queryOverpass(query: string): Promise<{ elements: OverpassElement[] }> {
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`overpass_status_${response.status}`);
      return (await response.json()) as { elements: OverpassElement[] };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw lastError ?? new Error("overpass_unavailable");
}

/** Fetches and caches nearby places for a listing's coordinates and type. Never throws. */
export async function fetchNearbyPlaces(coordinates: [number, number], listingType: string): Promise<NearbyPlace[]> {
  if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(Number.isFinite)) return [];

  const key = `${coordinates[0].toFixed(3)},${coordinates[1].toFixed(3)}:${listingType}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const data = await queryOverpass(overpassQuery(coordinates, listingType));
      const seen = new Set<string>();
      const places: NearbyPlace[] = [];

      for (const element of data.elements ?? []) {
        const tags = element.tags ?? {};
        const name = tags.name;
        if (!name) continue;

        const classified = classify(tags, listingType);
        if (!classified) continue;

        const lat = element.lat ?? element.center?.lat;
        const lon = element.lon ?? element.center?.lon;
        if (lat == null || lon == null) continue;

        const dedupeKey = `${classified.category}:${name.toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        places.push({
          name,
          category: classified.category,
          kind: classified.kind,
          distanceMeters: haversineMeters(coordinates, [lat, lon]),
        });
      }

      return places.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
    } catch {
      return [];
    }
  })();

  cache.set(key, promise);
  return promise;
}

const KIND_LABELS: Record<string, { id: string; en: string }> = {
  attraction: { id: "Objek wisata", en: "Attraction" },
  viewpoint: { id: "Spot pemandangan", en: "Viewpoint" },
  museum: { id: "Museum", en: "Museum" },
  artwork: { id: "Karya seni publik", en: "Public artwork" },
  gallery: { id: "Galeri", en: "Gallery" },
  zoo: { id: "Kebun binatang", en: "Zoo" },
  theme_park: { id: "Taman hiburan", en: "Theme park" },
  beach: { id: "Pantai", en: "Beach" },
  water_park: { id: "Taman air", en: "Water park" },
  restaurant: { id: "Restoran", en: "Restaurant" },
  cafe: { id: "Kafe", en: "Cafe" },
  fast_food: { id: "Makanan cepat saji", en: "Fast food" },
  food_court: { id: "Food court", en: "Food court" },
  hospital: { id: "Rumah sakit", en: "Hospital" },
  clinic: { id: "Klinik", en: "Clinic" },
  pharmacy: { id: "Apotek", en: "Pharmacy" },
  school: { id: "Sekolah", en: "School" },
  university: { id: "Kampus", en: "University" },
  bank: { id: "Bank", en: "Bank" },
  marketplace: { id: "Pasar", en: "Market" },
  place_of_worship: { id: "Rumah ibadah", en: "Place of worship" },
  police: { id: "Kantor polisi", en: "Police station" },
  fuel: { id: "SPBU", en: "Gas station" },
  supermarket: { id: "Supermarket", en: "Supermarket" },
  convenience: { id: "Minimarket", en: "Convenience store" },
  rice_terrace: { id: "Sawah berundak", en: "Rice terrace" },
  monkey_forest: { id: "Hutan monyet", en: "Monkey forest" },
  ridge_walk: { id: "Jalur trekking", en: "Ridge walk" },
  waterfall: { id: "Air terjun", en: "Waterfall" },
  market: { id: "Pasar/bazaar", en: "Market/bazaar" },
};

export function nearbyKindLabel(kind: string, language: "id" | "en"): string {
  return KIND_LABELS[kind]?.[language] ?? kind;
}

export function formatNearbyDistance(meters: number, language: "id" | "en"): string {
  if (meters < 950) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  const km = meters / 1000;
  return language === "id" ? `${km.toFixed(1)} km` : `${km.toFixed(1)} km`;
}
