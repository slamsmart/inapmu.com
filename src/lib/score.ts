/**
 * Deterministic "AI" scoring layer for listings — no LLM involved here.
 * Shared between frontend and backend.
 */

export type ListingForScoring = {
  price: number;
  type: string;
  city: string;
  address?: string | null;
  title?: string | null;
  description?: string | null;
  amenities: string[];
  ownerVerified: boolean;
};

export type ScoreContext = {
  budgetMax?: number;
  locationKeyword?: string;
  type?: string;
  amenities?: string[];
};

export type PriceLabel = "below" | "fair" | "above";

export const KNOWN_AMENITIES = [
  "wifi",
  "ac",
  "kamar mandi dalam",
  "kamar mandi luar",
  "parkir",
  "dapur",
  "laundry",
  "kasur",
  "lemari",
  "kloset duduk",
  "kolam renang",
  "taman",
  "pet friendly",
  "ruang kerja",
] as const;

/** Colloquial words users type -> canonical amenity tag above. */
export const AMENITY_ALIASES: Record<string, string> = {
  "wi-fi": "wifi",
  internet: "wifi",
  kolam: "kolam renang",
  pool: "kolam renang",
  "km dalam": "kamar mandi dalam",
  "kamar mandi di dalam": "kamar mandi dalam",
  "boleh hewan": "pet friendly",
  coworking: "ruang kerja",
  "area kerja": "ruang kerja",
};

/** Common nicknames -> the spelling used in listing locations. */
export const LOCATION_ALIASES: Record<string, string> = {
  jogja: "yogyakarta",
  yogya: "yogyakarta",
  jogjakarta: "yogyakarta",
  jaksel: "jakarta selatan",
  jkt: "jakarta",
  bdg: "bandung",
};

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median key: comparable listings = same city + type, case-insensitive. */
export function medianKey(city: string, type: string): string {
  return `${city.trim().toLowerCase()}::${type.trim().toLowerCase()}`;
}

export function priceLabel(price: number, med: number): { label: PriceLabel; diffPercent: number } {
  if (med <= 0) return { label: "fair", diffPercent: 0 };
  const diffPercent = Math.round(((price - med) / med) * 100);
  if (diffPercent <= -10) return { label: "below", diffPercent };
  if (diffPercent >= 10) return { label: "above", diffPercent };
  return { label: "fair", diffPercent };
}

function priceScore(price: number, budgetMax: number | undefined, med: number): number {
  if (budgetMax && budgetMax > 0) {
    if (price <= budgetMax) return Math.round(70 + (price / budgetMax) * 30);
    const over = (price - budgetMax) / budgetMax;
    return Math.max(0, Math.round(70 - over * 100));
  }
  if (med > 0) {
    const diff = Math.abs(price - med) / med;
    return Math.max(0, Math.round(100 - diff * 100));
  }
  return 60;
}

function locationScore(listing: ListingForScoring, keyword: string | undefined): number {
  const k = keyword?.trim().toLowerCase();
  if (!k) return 60;
  const haystacks = [listing.city, listing.address ?? "", listing.title ?? "", listing.description ?? ""].map((s) =>
    s.toLowerCase(),
  );
  if (haystacks.some((h) => h === k)) return 100;
  if (haystacks.some((h) => h.includes(k))) return 85;
  return 35;
}

function amenitiesScore(listing: ListingForScoring, wanted: string[] | undefined): number {
  if (!wanted || wanted.length === 0) return listing.amenities.length > 0 ? 70 : 50;
  const have = new Set(listing.amenities.map((a) => a.toLowerCase()));
  const matched = wanted.filter((w) => have.has(w.toLowerCase())).length;
  return Math.round((matched / wanted.length) * 100);
}

function typeScore(listing: ListingForScoring, type: string | undefined): number {
  if (!type) return 100;
  return listing.type.toLowerCase() === type.toLowerCase() ? 100 : 20;
}

const WEIGHTS = { price: 0.35, location: 0.25, amenities: 0.2, verified: 0.1, type: 0.1 };

export function matchScore(listing: ListingForScoring, ctx: ScoreContext, med: number): number {
  const score =
    priceScore(listing.price, ctx.budgetMax, med) * WEIGHTS.price +
    locationScore(listing, ctx.locationKeyword) * WEIGHTS.location +
    amenitiesScore(listing, ctx.amenities) * WEIGHTS.amenities +
    (listing.ownerVerified ? 100 : 40) * WEIGHTS.verified +
    typeScore(listing, ctx.type) * WEIGHTS.type;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Human-readable "kenapa cocok" bullets, built only from fields on the listing itself. */
export function matchReasons(listing: ListingForScoring, ctx: ScoreContext, med: number): string[] {
  const out: string[] = [];
  if (ctx.budgetMax && listing.price <= ctx.budgetMax) {
    out.push(`Harga Rp${listing.price.toLocaleString("id-ID")} sesuai budget`);
  }
  if (ctx.locationKeyword) {
    const k = ctx.locationKeyword.toLowerCase();
    const near = [listing.city, listing.address ?? ""].some((s) => s.toLowerCase().includes(k));
    if (near) out.push(`Lokasi cocok dengan "${ctx.locationKeyword}"`);
  }
  if (ctx.amenities && ctx.amenities.length > 0) {
    const have = new Set(listing.amenities.map((a) => a.toLowerCase()));
    const matched = ctx.amenities.filter((w) => have.has(w.toLowerCase()));
    if (matched.length > 0) out.push(`Punya fasilitas: ${matched.join(", ")}`);
  }
  if (listing.ownerVerified) out.push("Pemilik terverifikasi");
  const pl = priceLabel(listing.price, med);
  if (pl.label === "below") out.push(`Harga di bawah pasaran (${pl.diffPercent}%)`);
  if (pl.label === "above") out.push(`Harga di atas pasaran (+${pl.diffPercent}%)`);
  return out;
}

/**
 * Lightweight heuristic parser (NOT an LLM call): pulls budget, type, a
 * location keyword, and amenity keywords out of a free-text query such as
 * "cari kos 1 jutaan dekat UB ada wifi". Deterministic, free, instant, and
 * cannot hallucinate because it only extracts tokens already in the input.
 */
export function parseQuery(raw: string): ScoreContext {
  const q = ` ${raw.toLowerCase()} `;
  const ctx: ScoreContext = {};

  const jutaMatch = q.match(/(\d+(?:[.,]\d+)?)\s*(?:jt|juta)/);
  const ribuMatch = q.match(/(\d+(?:[.,]\d+)?)\s*(?:rb|ribu)/);
  if (jutaMatch) ctx.budgetMax = Math.round(parseFloat(jutaMatch[1].replace(",", ".")) * 1_000_000);
  else if (ribuMatch) ctx.budgetMax = Math.round(parseFloat(ribuMatch[1].replace(",", ".")) * 1_000);

  if (/\bkos\b/.test(q)) ctx.type = "Kos";
  else if (/\bkontrakan\b/.test(q)) ctx.type = "Kontrakan";
  else if (/\bvil(l)?a\b/.test(q)) ctx.type = "Vila";

  const near = q.match(/dekat\s+([a-z0-9\s]{2,40})/) ?? q.match(/\bdi\s+([a-z0-9\s]{2,40})/);
  if (near) {
    const keyword = near[1].split(/\s+(?:ada|dengan|budget|harga|yang|buat|untuk|sekitar|max|maks)\b/)[0].trim();
    if (keyword) ctx.locationKeyword = LOCATION_ALIASES[keyword] ?? keyword;
  }

  const wanted = new Set<string>(KNOWN_AMENITIES.filter((a) => q.includes(a)));
  for (const [alias, canonical] of Object.entries(AMENITY_ALIASES)) {
    if (q.includes(alias)) wanted.add(canonical);
  }
  ctx.amenities = [...wanted];
  return ctx;
}

/** Parse the comma-separated `amenities` column into a clean, de-duplicated list. */
export function parseAmenitiesInput(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const clean = part.trim().toLowerCase().slice(0, 40);
    if (clean) seen.add(clean);
  }
  return [...seen].slice(0, 20);
}
