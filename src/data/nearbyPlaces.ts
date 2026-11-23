/**
 * Curated nearby-places dataset for each catalog listing (src/data/catalog.ts).
 *
 * Researched via Firecrawl web search across Google Maps-indexed listings,
 * Tripadvisor, Trip.com/Klook travel guides, and official local sources
 * (Puskesmas/RSUD/Dinkes health directories) for real, named places near
 * each property's address — not generic placeholder data.
 *
 * Keyed by the catalog listing id (src/data/catalog.ts `CatalogListing.id`).
 * Only covers the fixed catalog listings; partner-submitted listings (ids
 * shifted by DB_LISTING_ID_OFFSET) fall back to the live OpenStreetMap
 * lookup in src/lib/nearby.ts since they don't have curated research yet.
 */

import type { NearbyPlace } from "../lib/nearby";

export const CURATED_NEARBY_PLACES: Record<number, NearbyPlace[]> = {
  // 1. Villa Senja Ubud — Ubud, Bali (Vila -> wisata)
  1: [
    {
      name: "Tegalalang Rice Terrace",
      category: "wisata",
      kind: "rice_terrace",
      distanceLabel: "±6 km",
      source: "Trip.com",
      sourceUrl: "https://id.trip.com/guide/activity/tempat-wisata-di-ubud.html",
    },
    {
      name: "Ubud Monkey Forest (Mandala Suci Wenara Wana)",
      category: "wisata",
      kind: "monkey_forest",
      distanceLabel: "±2.5 km",
      source: "Tripadvisor",
      sourceUrl: "https://www.tripadvisor.co.id/Attractions-g297701-Activities-Ubud_Gianyar_Regency_Bali.html",
    },
    {
      name: "Campuhan Ridge Walk",
      category: "wisata",
      kind: "ridge_walk",
      distanceLabel: "±2 km",
      source: "Klook",
      sourceUrl: "https://www.klook.com/id/blog/tempat-wisata-ubud/",
    },
    {
      name: "Air Terjun Tegenungan",
      category: "wisata",
      kind: "waterfall",
      distanceLabel: "±8 km",
      source: "Tripadvisor",
      sourceUrl: "https://www.tripadvisor.co.id/Attractions-g297701-Activities-Ubud_Gianyar_Regency_Bali.html",
    },
  ],

  // 2. Kost Nara Setiabudi — Setiabudi, Jakarta Selatan (Kos -> kuliner + fasilitas)
  2: [
    {
      name: "Henshin (Jepang-Peru)",
      category: "kuliner",
      kind: "restaurant",
      distanceLabel: "Kawasan Setiabudi",
      source: "Tripadvisor",
      sourceUrl: "https://www.tripadvisor.co.id/Restaurants-g294229-zfn20484400-Jakarta_Java.html",
    },
    {
      name: "Hause Rooftop",
      category: "kuliner",
      kind: "cafe",
      distanceLabel: "Dekat MRT Setiabudi",
      source: "Traveloka",
      sourceUrl: "https://www.traveloka.com/id-id/explore/destination/cafe-dekat-mrt-setiabudi/375037",
    },
    {
      name: "Bakmi Setiabudi",
      category: "kuliner",
      kind: "restaurant",
      distanceLabel: "Jl. Setiabudi Tengah",
      source: "Cove.id",
      sourceUrl: "https://blog.cove.id/kuliner-di-setiabudi-jakarta/",
    },
    {
      name: "Puskesmas Setiabudi",
      category: "fasilitas",
      kind: "hospital",
      distanceLabel: "Kawasan Setiabudi",
      source: "Situs resmi Puskesmas Setiabudi",
      sourceUrl: "https://puskesmassetiabudi.id/",
    },
    {
      name: "Apotek Setia Budhi",
      category: "fasilitas",
      kind: "pharmacy",
      distanceLabel: "Jl. Setia Budi Tengah No.2",
      source: "Waze",
      sourceUrl: "https://www.waze.com/id/live-map/directions/id/daerah-khusus-ibukota-jakarta/apotek-setia-budhi",
    },
    {
      name: "Apotik 7D",
      category: "fasilitas",
      kind: "pharmacy",
      distanceLabel: "Jl. Setia Budi No.106",
      source: "Google Maps",
      sourceUrl: "https://www.google.com/maps/search/Apotik+7D,+WCX8+6X7,+Jl.+Setia+Budi+106/",
    },
  ],

  // 3. Rumah Teduh Ciumbuleuit — Ciumbuleuit, Bandung (Kontrakan -> kuliner + fasilitas)
  3: [
    {
      name: "Tafso Barn",
      category: "kuliner",
      kind: "restaurant",
      distanceLabel: "Dekat Punclut Ciumbuleuit",
      source: "Tripadvisor",
      sourceUrl: "https://www.tripadvisor.co.id/RestaurantsNear-g297704-d4469946-Punclut_Ciumbuleuit-Bandung_West_Java_Java.html",
    },
    {
      name: "Soula.Leuit Cafe",
      category: "kuliner",
      kind: "cafe",
      distanceLabel: "Ciumbuleuit",
      source: "Opaper.app",
      sourceUrl: "https://www.opaper.app/blog/10-cafe-di-ciumbuleuit-bandung-yang-lagi-hits",
    },
    {
      name: "Miss Bee Providore",
      category: "kuliner",
      kind: "restaurant",
      distanceLabel: "Dekat GRHA Ciumbuleuit",
      source: "Tripadvisor",
      sourceUrl: "https://www.tripadvisor.co.id/RestaurantsNear-g297704-d2569493-GRHA_Ciumbuleuit_Guest_House-Bandung_West_Java_Java.html",
    },
    {
      name: "Apotek Arsaya",
      category: "fasilitas",
      kind: "pharmacy",
      distanceLabel: "Jl. Ciumbuleuit No.109",
      source: "Klinik Arsaya",
      sourceUrl: "https://www.klinikarsaya.com/index.html%40p%3D2707",
    },
    {
      name: "Apotek Kimia Farma Ciumbuleuit",
      category: "fasilitas",
      kind: "pharmacy",
      distanceLabel: "Jl. Ciumbuleuit",
      source: "Waze",
      sourceUrl: "https://www.waze.com/id/live-map/directions/apotek-kimia-farma-ciumbuleuit-bandung",
    },
    {
      name: "RS TNI AU Dr. M. Salamun",
      category: "fasilitas",
      kind: "hospital",
      distanceLabel: "Ciumbuleuit",
      source: "Hellosehat",
      sourceUrl: "https://hellosehat.com/care/kota-bandung/rumah-sakit/?page=2",
    },
  ],

  // 4. Kedaton Pool House — Canggu, Bali (Vila -> wisata)
  4: [
    {
      name: "Pantai Batu Bolong",
      category: "wisata",
      kind: "beach",
      distanceLabel: "±1.5 km",
      source: "Expedia",
      sourceUrl: "https://www.expedia.co.id/Canggu.dx6049351",
    },
    {
      name: "Pantai Batu Mejan (Echo Beach)",
      category: "wisata",
      kind: "beach",
      distanceLabel: "±2 km",
      source: "Trip.com",
      sourceUrl: "https://id.trip.com/guide/activity/wisata-canggu.html",
    },
    {
      name: "La Brisa Sunday Market",
      category: "wisata",
      kind: "market",
      distanceLabel: "±1.8 km",
      source: "Expedia",
      sourceUrl: "https://www.expedia.co.id/Canggu.dx6049351",
    },
    {
      name: "Tanah Lot",
      category: "wisata",
      kind: "attraction",
      distanceLabel: "±12 km",
      source: "Investasiku.id",
      sourceUrl: "https://www.investasiku.id/eduvest/healingvest/aktivitas-saat-liburan-ke-canggu-bali",
    },
  ],

  // 5. Ruang Rimba Coliving — Sleman, Yogyakarta (Kos -> kuliner + fasilitas)
  5: [
    {
      name: "The House of Raminten",
      category: "kuliner",
      kind: "restaurant",
      distanceLabel: "Kawasan Sleman-Jogja",
      source: "Raminten.com",
      sourceUrl: "https://raminten.com/angkringan-jogja/",
    },
    {
      name: "Angkringan Kali Code",
      category: "kuliner",
      kind: "restaurant",
      distanceLabel: "Kawasan Sleman-Jogja",
      source: "Raminten.com",
      sourceUrl: "https://raminten.com/angkringan-jogja/",
    },
    {
      name: "Kopi Bukan Luwak",
      category: "kuliner",
      kind: "cafe",
      distanceLabel: "Jl. Kaliurang, Sleman",
      source: "Facebook",
      sourceUrl: "https://www.facebook.com/gembulfoodie/posts/coffee-shop-rasa-angkringan-baru-lagi-nih-dekat-space-coffee-shop-yang-ada-di-ja/1388882814808959/",
    },
    {
      name: "RSUD Sleman",
      category: "fasilitas",
      kind: "hospital",
      distanceLabel: "Jl. Bhayangkara No.48, Triharjo, Sleman",
      source: "Instagram resmi @rsudsleman",
      sourceUrl: "https://www.instagram.com/rsudsleman/",
    },
    {
      name: "RS Mitra Paramedika",
      category: "fasilitas",
      kind: "hospital",
      distanceLabel: "Kabupaten Sleman",
      source: "Hellosehat",
      sourceUrl: "https://hellosehat.com/care/kab-sleman/rumah-sakit/",
    },
    {
      name: "Apotek Dinkes Kabupaten Sleman",
      category: "fasilitas",
      kind: "pharmacy",
      distanceLabel: "Kabupaten Sleman",
      source: "Dinkes Sleman (resmi)",
      sourceUrl: "https://dinkes.slemankab.go.id/alamat-apotek-di-kabupaten-sleman/",
    },
  ],

  // 6. Paviliun Kencana — Sanur, Bali (Kontrakan -> kuliner + fasilitas)
  6: [
    {
      name: "Canvas Cafe Bali",
      category: "kuliner",
      kind: "cafe",
      distanceLabel: "Sanur",
      source: "Tripadvisor",
      sourceUrl: "https://www.tripadvisor.co.id/Restaurants-g297700-c8-Sanur_Denpasar_Bali.html",
    },
    {
      name: "COSTA - Beach Restaurant Sanur",
      category: "kuliner",
      kind: "restaurant",
      distanceLabel: "Sanur",
      source: "Tripadvisor",
      sourceUrl: "https://www.tripadvisor.co.id/Restaurants-g297700-Sanur_Denpasar_Bali.html",
    },
    {
      name: "Naughty Nuri's Sanur",
      category: "kuliner",
      kind: "restaurant",
      distanceLabel: "Sanur",
      source: "Tripadvisor",
      sourceUrl: "https://www.tripadvisor.co.id/Restaurants-g297700-Sanur_Denpasar_Bali.html",
    },
    {
      name: "Apotek KF 0173 Sanur",
      category: "fasilitas",
      kind: "pharmacy",
      distanceLabel: "Jl. By Pass Ngurah Rai No.232",
      source: "Sequis / Hellosehat",
      sourceUrl: "https://www.sequis.co.id/daftar-rumah-sakit/1461/apotek-kf-0173-sanur",
    },
    {
      name: "Apotik Sanur",
      category: "fasilitas",
      kind: "pharmacy",
      distanceLabel: "Jl. Danau Buyan No.10, Sanur",
      source: "Honestdocs",
      sourceUrl: "https://www.honestdocs.id/apotik/apotik-sanur-denpasar/details",
    },
    {
      name: "ApotekKU Bypass Sanur",
      category: "fasilitas",
      kind: "pharmacy",
      distanceLabel: "Jl. Bypass Ngurah Rai, Sanur",
      source: "ApotekKU",
      sourceUrl: "https://apotekku.com/cabang/apotekku-bypass-sanur/",
    },
  ],
};
