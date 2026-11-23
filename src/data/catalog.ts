/**
 * Single source of truth for the data shown on inapmu.com.
 *
 * Imported by BOTH the React frontend (src/App.tsx) and the Cloudflare Worker
 * (worker/index.ts). The AI chatbot is grounded on exactly this data plus the
 * approved listings in D1, so it can never reference a listing, price, or
 * facility that the website itself doesn't show.
 */

export type CatalogPlan = "free" | "gold" | "platinum";

export type CatalogListing = {
  id: number;
  type: "Kos" | "Kontrakan" | "Vila";
  title: string;
  location: string;
  price: number;
  period: "malam" | "bulan" | "tahun";
  rating: number;
  reviews: number;
  image: string;
  promoted: boolean;
  tag: string;
  description: string;
  owner: string;
  ownerPhone: string;
  ownerEmail: string;
  survey: boolean;
  coordinates: [number, number];
  plan?: CatalogPlan;
  /** Only facilities explicitly stated in the visible title/tag/description. */
  amenities: string[];
};

/** DB listing ids are shifted by this offset on the client so they never collide with catalog ids. */
export const DB_LISTING_ID_OFFSET = 100_000;

export const CATALOG_LISTINGS: CatalogListing[] = [
  {
    id: 1,
    type: "Vila",
    title: "Villa Senja Ubud",
    location: "Ubud, Bali",
    price: 1250000,
    period: "malam",
    rating: 4.92,
    reviews: 128,
    image: "https://images.unsplash.com/photo-1675657144518-025804f1812c?auto=format&fit=crop&w=1000&q=85",
    promoted: true,
    tag: "Kolam pribadi",
    description: "Vila tropis yang tenang dengan kolam renang pribadi, dikelilingi sawah dan hanya 12 menit dari pusat Ubud.",
    owner: "Ayu Prameswari",
    ownerPhone: "628123450001",
    ownerEmail: "ayu@inapmu.com",
    plan: "platinum",
    survey: true,
    coordinates: [-8.5069, 115.2625],
    amenities: ["kolam renang"],
  },
  {
    id: 2,
    type: "Kos",
    title: "Kost Nara Setiabudi",
    location: "Setiabudi, Jakarta Selatan",
    price: 2850000,
    period: "bulan",
    rating: 4.84,
    reviews: 76,
    image: "https://images.unsplash.com/photo-1613553474179-e1eda3ea5734?auto=format&fit=crop&w=1000&q=85",
    promoted: false,
    tag: "Dekat MRT",
    description: "Kost eksklusif berfasilitas lengkap, kamar terang, dan akses mudah ke kawasan bisnis Jakarta.",
    owner: "Nara Living",
    ownerPhone: "628123450002",
    ownerEmail: "nara@inapmu.com",
    plan: "gold",
    survey: true,
    coordinates: [-6.2151, 106.8307],
    amenities: [],
  },
  {
    id: 3,
    type: "Kontrakan",
    title: "Rumah Teduh Ciumbuleuit",
    location: "Ciumbuleuit, Bandung",
    price: 42000000,
    period: "tahun",
    rating: 4.9,
    reviews: 34,
    image: "https://images.unsplash.com/photo-1584346884836-46e6d0d72db4?auto=format&fit=crop&w=1000&q=85",
    promoted: false,
    tag: "Pet friendly",
    description: "Rumah dua lantai yang asri untuk keluarga kecil, dengan taman belakang dan lingkungan yang nyaman.",
    owner: "Bima Properti",
    ownerPhone: "628123450003",
    ownerEmail: "bima@inapmu.com",
    plan: "gold",
    survey: true,
    coordinates: [-6.8735, 107.6049],
    amenities: ["taman", "pet friendly"],
  },
  {
    id: 4,
    type: "Vila",
    title: "Kedaton Pool House",
    location: "Canggu, Bali",
    price: 1850000,
    period: "malam",
    rating: 4.96,
    reviews: 93,
    image: "https://images.unsplash.com/photo-1692736933760-8a8a9b8c1b6f?auto=format&fit=crop&w=1000&q=85",
    promoted: true,
    tag: "Favorit tamu",
    description: "Pool house modern untuk liburan santai, dekat pantai dan tempat makan terbaik di Canggu.",
    owner: "Kedaton Stays",
    ownerPhone: "628123450004",
    ownerEmail: "kedaton@inapmu.com",
    plan: "platinum",
    survey: false,
    coordinates: [-8.6478, 115.1385],
    amenities: ["kolam renang"],
  },
  {
    id: 5,
    type: "Kos",
    title: "Ruang Rimba Coliving",
    location: "Sleman, Yogyakarta",
    price: 1750000,
    period: "bulan",
    rating: 4.78,
    reviews: 51,
    image: "https://images.unsplash.com/photo-1727079586096-5278670ab910?auto=format&fit=crop&w=1000&q=85",
    promoted: false,
    tag: "Area kerja",
    description: "Hunian coliving hangat dengan ruang kerja bersama dan komunitas yang aktif.",
    owner: "Ruang Rimba",
    ownerPhone: "628123450005",
    ownerEmail: "rimba@inapmu.com",
    survey: true,
    coordinates: [-7.7162, 110.3557],
    amenities: ["ruang kerja"],
  },
  {
    id: 6,
    type: "Kontrakan",
    title: "Paviliun Kencana",
    location: "Sanur, Bali",
    price: 68000000,
    period: "tahun",
    rating: 4.87,
    reviews: 22,
    image: "https://images.unsplash.com/photo-1538430989507-797d5e4ba836?auto=format&fit=crop&w=1000&q=85",
    promoted: false,
    tag: "Siap huni",
    description: "Paviliun lengkap dan nyaman di kawasan tenang, cocok untuk tinggal jangka panjang.",
    owner: "Made Kencana",
    ownerPhone: "628123450006",
    ownerEmail: "kencana@inapmu.com",
    survey: true,
    coordinates: [-8.6904, 115.2632],
    amenities: [],
  },
];

export const PLAN_PRICES: Record<CatalogPlan, { price: number; original?: number }> = {
  free: { price: 0 },
  gold: { price: 19000, original: 29000 },
  platinum: { price: 34000, original: 49000 },
};

/**
 * Site facts the chatbot may state, mirrored from the visible copy on inapmu.com
 * (pricing + about sections in App.tsx). Keep in sync when that copy changes.
 */
export const SITE_FACTS_ID = [
  "inapmu.com mempertemukan pencari kos, kontrakan, dan vila dengan pemilik properti secara langsung, tanpa perantara dan tanpa biaya tersembunyi.",
  "Identitas mitra (pemilik) diperiksa sebelum listing tayang.",
  "Calon penyewa bisa chat pemilik via WhatsApp/email dan menjadwalkan survei langsung dari halaman listing.",
  `Paket mitra bulanan: Free Rp0 (pasang listing, chat & jadwal survei, tampil di pencarian dan peta); Gold Rp${PLAN_PRICES.gold.price.toLocaleString("id-ID")}/bulan (harga promo, normal Rp${PLAN_PRICES.gold.original!.toLocaleString("id-ID")}; semua fitur Free + badge Trusted emas); Platinum Rp${PLAN_PRICES.platinum.price.toLocaleString("id-ID")}/bulan (harga promo, normal Rp${PLAN_PRICES.platinum.original!.toLocaleString("id-ID")}; semua fitur Gold + badge Trusted platinum + foto tampil di slider hero beranda).`,
  "Paket Gold dan Platinum khusus untuk mitra pemilik properti; daftar sebagai mitra dulu lewat tombol daftar mitra, lalu pilih paket. Pembayaran via QRIS, diproses Mayar.id.",
];
