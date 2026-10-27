import { useEffect, useId, useMemo, useState } from "react";
import { divIcon } from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { Liquid } from "liquid-gooey";
import "leaflet/dist/leaflet.css";
import PartnerDashboard, { type PartnerListingInput } from "./PartnerDashboard";
import { ApiRequestError, currentSession, getCurrentUser, loginUser, registerUser, saveSession, setTurnstileTokenProvider, submitPartnerApplication, type SessionUser } from "./lib/api";
import { useTurnstile } from "./lib/turnstile";


type IconName =
  | "arrow"
  | "calendar"
  | "chat"
  | "check"
  | "chevron"
  | "heart"
  | "home"
  | "location"
  | "menu"
  | "search"
  | "shield"
  | "sparkles"
  | "star"
  | "user"
  | "x";

type Language = "id" | "en";

type Listing = {
  id: number;
  type: string;
  title: string;
  location: string;
  price: number;
  period: string;
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
  mapsUrl?: string;
};

const copy = {
  id: {
    explore: "Jelajahi",
    skipToExplore: "Langsung ke pilihan properti",
    openMenu: "Buka menu",
    closeMenu: "Tutup menu",
    homeAria: "Kembali ke beranda inapmu.com",
    howItWorks: "Cara kerja",
    becomeOwner: "Jadi Mitra",
    login: "Masuk",
    register: "Daftar",
    eyebrow: "Lebih dekat ke tempat yang tepat",
    heroStart: "Temukan ruang untuk",
    heroAccent: "menginap.",
    heroBody: "Kos, kontrakan, dan vila pilihan. Semuanya dalam satu tempat. Cari dengan tenang, hubungi pemilik langsung.",
    location: "Lokasi",
    locationPlaceholder: "Mau tinggal di mana?",
    propertyType: "Tipe hunian",
    search: "Cari hunian",
    exploreReady: "siap kamu jelajahi",
    verifiedOwners: "Pemilik terverifikasi",
    noHiddenFees: "Tanpa biaya tersembunyi",
    curated: "Dikurasi untukmu",
    favoritePlaces: "Pilihan di lokasi favorit",
    propertiesMatch: "properti sesuai pencarianmu",
    noProperties: "Belum ada properti di lokasi itu",
    clearSearch: "Hapus pencarian",
    showLess: "Tampilkan lebih sedikit",
    seeAll: "Lihat semua properti",
    aroundYou: "Lihat sekitarmu",
    mapTitle: "Cari langsung dari peta",
    mapBody: "Geser dan perbesar peta untuk melihat area. Klik pin harga untuk membuka ringkasan properti.",
    propertiesShown: "properti ditampilkan",
    noPins: "Tidak ada pin untuk ditampilkan",
    changeSearch: "Coba hapus atau ubah pencarianmu.",
    openGoogle: "Buka pin di Google Maps",
    easy: "Tanpa banyak drama",
    confidence: "Dari mencari sampai merasa yakin.",
    confidenceBody: "Kami membuat setiap langkah lebih jelas. Kamu tetap pegang kendali sebelum mengambil keputusan.",
    steps: [
      ["01", "Cari yang cocok", "Pilih lokasi, tipe hunian, dan rentang harga."],
      ["02", "Kenali lebih dekat", "Lihat detail, chat pemilik, atau jadwalkan survei."],
      ["03", "Ambil keputusan", "Pesan dengan tenang saat kamu sudah yakin."],
    ],
    footer: "Tempat yang tepat, keputusan yang tenang.",
    promoted: "Promosi",
    reviews: "ulasan",
    managedBy: "Dikelola oleh",
    verified: "Terverifikasi",
    viewGoogle: "Lihat lokasi di Google Maps",
    chatOwner: "Chat pemilik",
    scheduleSurvey: "Jadwalkan survei",
    directBooking: "Listing ini mendukung pemesanan langsung melalui chat.",
    askOwner: "Tanya pemilik",
    messagePlaceholder: "Halo, apakah properti ini masih tersedia?",
    sendMessage: "Kirim pesan",
    messageSent: "Pesan terkirim",
    usualReply: "biasanya membalas dalam 1 jam.",
    chooseSchedule: "Pilih jadwal survei",
    sendRequest: "Kirim permintaan",
    surveySent: "Permintaan survei dikirim",
    confirmSchedule: "Pemilik akan mengonfirmasi jadwal pilihanmu.",
    partnerKicker: "Kemitraan inapmu.com",
    partnerTitle: "Mulai hasilkan dari propertimu",
    partnerBody: "Daftarkan kos, kontrakan, atau vila dan jangkau lebih banyak calon penyewa dari seluruh Indonesia.",
    partnerBenefits: ["Publikasi listing tanpa biaya", "Kelola chat dan survei di satu tempat", "Dukungan tim mitra"],
    ownerInfo: "Informasi pemilik",
    fullName: "Nama lengkap",
    email: "Email aktif",
    phone: "Nomor WhatsApp",
    propertyInfo: "Informasi properti",
    propertyName: "Nama properti",
    city: "Kota atau kabupaten",
    chooseType: "Pilih tipe properti",
    agreement: "Saya menyetujui syarat kemitraan dan kebijakan privasi inapmu.com.",
    submitPartner: "Kirim pendaftaran",
    partnerSuccess: "Pendaftaran berhasil dikirim",
    partnerSuccessBody: "Tim mitra kami akan menghubungimu melalui WhatsApp maksimal dalam 1×24 jam.",
    backHome: "Kembali ke beranda",
    loginTitle: "Selamat datang kembali",
    loginBody: "Masuk untuk mengelola favorit, chat, dan jadwal surveimu.",
    registerTitle: "Buat akun inapmu.com",
    registerBody: "Daftar untuk menyimpan properti dan terhubung langsung dengan pemilik.",
    continueGoogle: "Lanjutkan dengan Google",
    orEmail: "atau gunakan email",
    password: "Kata sandi",
    confirmPassword: "Konfirmasi kata sandi",
    forgotPassword: "Lupa kata sandi?",
    loginAction: "Masuk ke akun",
    registerAction: "Buat akun",
    termsPrefix: "Dengan melanjutkan, kamu menyetujui Syarat Penggunaan dan Kebijakan Privasi inapmu.com.",
    authSuccess: "Berhasil",
    authSuccessBody: "Alur autentikasi siap. Hubungkan form ini ke penyedia OAuth atau backend pilihanmu.",
    googleReady: "Google berhasil terhubung",
    googleReadyBody: "Akun Google kamu berhasil digunakan untuk masuk ke inapmu.com.",
    openDashboard: "Buka Dashboard Mitra",
    dashboardNav: "Dashboard Mitra",
    guestName: "Nama",
    guestPhone: "Nomor WhatsApp",
    guestEmail: "Email",
    preferredDate: "Tanggal pilihan",
    preferredTime: "Waktu pilihan",
  },
  en: {
    explore: "Explore",
    skipToExplore: "Skip to property picks",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    homeAria: "Back to inapmu.com home",
    howItWorks: "How it works",
    becomeOwner: "Become a Partner",
    login: "Log in",
    register: "Sign up",
    eyebrow: "Closer to the right place",
    heroStart: "Find your perfect place to",
    heroAccent: "stay.",
    heroBody: "Selected rooms, homes, and villas—all in one place. Search with ease and contact owners directly.",
    location: "Location",
    locationPlaceholder: "Where do you want to stay?",
    propertyType: "Property type",
    search: "Search stays",
    exploreReady: "ready to explore",
    verifiedOwners: "Verified owners",
    noHiddenFees: "No hidden fees",
    curated: "Curated for you",
    favoritePlaces: "Top picks in favorite places",
    propertiesMatch: "properties match your search",
    noProperties: "No properties found in this area",
    clearSearch: "Clear search",
    showLess: "Show less",
    seeAll: "See all properties",
    aroundYou: "Explore the area",
    mapTitle: "Search directly from the map",
    mapBody: "Move and zoom the map to explore. Click a price pin to preview a property.",
    propertiesShown: "properties shown",
    noPins: "No pins to display",
    changeSearch: "Try clearing or changing your search.",
    openGoogle: "Open pin in Google Maps",
    easy: "Simple from start to finish",
    confidence: "From searching to feeling certain.",
    confidenceBody: "We make every step clearer, so you stay in control before making a decision.",
    steps: [
      ["01", "Find your match", "Choose a location, property type, and price range."],
      ["02", "Take a closer look", "View details, chat with the owner, or schedule a visit."],
      ["03", "Make your decision", "Book with confidence when you are ready."],
    ],
    footer: "The right place, a confident decision.",
    promoted: "Sponsored",
    reviews: "reviews",
    managedBy: "Managed by",
    verified: "Verified",
    viewGoogle: "View location in Google Maps",
    chatOwner: "Chat with owner",
    scheduleSurvey: "Schedule a visit",
    directBooking: "This listing supports direct booking through chat.",
    askOwner: "Ask the owner",
    messagePlaceholder: "Hi, is this property still available?",
    sendMessage: "Send message",
    messageSent: "Message sent",
    usualReply: "usually replies within an hour.",
    chooseSchedule: "Choose a visit time",
    sendRequest: "Send request",
    surveySent: "Visit request sent",
    confirmSchedule: "The owner will confirm your preferred schedule.",
    partnerKicker: "inapmu.com partnership",
    partnerTitle: "Start earning from your property",
    partnerBody: "List your room, house, or villa and reach more potential guests across Indonesia.",
    partnerBenefits: ["Publish your listing for free", "Manage chats and visits in one place", "Dedicated partner support"],
    ownerInfo: "Owner information",
    fullName: "Full name",
    email: "Active email",
    phone: "WhatsApp number",
    propertyInfo: "Property information",
    propertyName: "Property name",
    city: "City or regency",
    chooseType: "Choose property type",
    agreement: "I agree to the inapmu.com partnership terms and privacy policy.",
    submitPartner: "Submit application",
    partnerSuccess: "Application submitted",
    partnerSuccessBody: "Our partnership team will contact you via WhatsApp within 24 hours.",
    backHome: "Back to home",
    loginTitle: "Welcome back",
    loginBody: "Log in to manage favorites, chats, and your scheduled visits.",
    registerTitle: "Create an inapmu.com account",
    registerBody: "Sign up to save properties and connect directly with owners.",
    continueGoogle: "Continue with Google",
    orEmail: "or use email",
    password: "Password",
    confirmPassword: "Confirm password",
    forgotPassword: "Forgot password?",
    loginAction: "Log in to your account",
    registerAction: "Create account",
    termsPrefix: "By continuing, you agree to the inapmu.com Terms of Use and Privacy Policy.",
    authSuccess: "Success",
    authSuccessBody: "The authentication flow is ready. Connect this form to your preferred OAuth provider or backend.",
    googleReady: "Google connected successfully",
    googleReadyBody: "Your Google account was used successfully to sign in to inapmu.com.",
    openDashboard: "Open Partner Dashboard",
    dashboardNav: "Partner Dashboard",
    guestName: "Name",
    guestPhone: "WhatsApp number",
    guestEmail: "Email",
    preferredDate: "Preferred date",
    preferredTime: "Preferred time",
  },
};

const categoryLabel = (category: string, language: Language) => {
  if (language === "id") return category;
  return { Semua: "All", Kos: "Room", Kontrakan: "House", Vila: "Villa" }[category] ?? category;
};

const periodLabel = (period: string, language: Language) => {
  if (language === "id") return period;
  return { malam: "night", bulan: "month", tahun: "year" }[period] ?? period;
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    chat: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z"/>,
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/></>,
    location: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-5"/></>,
    sparkles: <><path d="m12 3-1.2 3.8L7 8l3.8 1.2L12 13l1.2-3.8L17 8l-3.8-1.2z"/><path d="m5 14-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8zM19 15l-.6 1.4L17 17l1.4.6L19 19l.6-1.4L21 17l-1.4-.6z"/></>,
    star: <path d="m12 2 3 6 6.5.9-4.7 4.6 1.1 6.5-5.9-3.1L6.1 20l1.1-6.5-4.7-4.6L9 8z"/>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    x: <><path d="m6 6 12 12M18 6 6 18"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function StarRating({ rating, compact = false }: { rating: number; compact?: boolean }) {
  const size = compact ? 13 : 16;
  const gradientBase = useId().replace(/:/g, "");
  const normalizedRating = Math.max(0, Math.min(5, rating));

  return (
    <span className="flex shrink-0 items-center gap-1.5" aria-label={`${rating} dari 5 bintang`}>
      <span className="flex items-center gap-px" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => {
          const fill = Math.max(0, Math.min(100, (normalizedRating - index) * 100));
          const gradientId = `${gradientBase}-${index}`;
          return (
            <svg key={index} width={size} height={size} viewBox="0 0 24 24">
              <defs>
                <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
                  <stop offset={`${fill}%`} stopColor="#FFB700"/>
                  <stop offset={`${fill}%`} stopColor="#E2E8F0"/>
                </linearGradient>
              </defs>
              <path
                d="m12 2.4 2.93 5.94 6.56.95-4.75 4.63 1.12 6.53L12 17.37l-5.86 3.08 1.12-6.53-4.75-4.63 6.56-.95L12 2.4z"
                fill={`url(#${gradientId})`}
                stroke={fill > 0 ? "#E7A600" : "#CBD5E1"}
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </svg>
          );
        })}
      </span>
      <strong className={compact ? "text-xs tabular-nums text-stone-700" : "text-sm tabular-nums text-stone-700"}>{rating.toFixed(2)}</strong>
    </span>
  );
}

const listings: Listing[] = [
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
    survey: true,
    coordinates: [-8.5069, 115.2625] as [number, number],
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
    survey: true,
    coordinates: [-6.2151, 106.8307] as [number, number],
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
    survey: true,
    coordinates: [-6.8735, 107.6049] as [number, number],
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
    survey: false,
    coordinates: [-8.6478, 115.1385] as [number, number],
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
    coordinates: [-7.7162, 110.3557] as [number, number],
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
    coordinates: [-8.6904, 115.2632] as [number, number],
  },
];

const formatPrice = (price: number) => new Intl.NumberFormat("id-ID").format(price);

function MapViewport({ items }: { items: Listing[] }) {
  const map = useMap();

  useEffect(() => {
    const validCoordinates = items
      .map((item) => item?.coordinates)
      .filter(
        (coordinates): coordinates is [number, number] =>
          Array.isArray(coordinates) &&
          coordinates.length === 2 &&
          coordinates.every(Number.isFinite),
      );

    if (validCoordinates.length === 0) return;

    const frame = window.requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
      const size = map.getSize();

      if (
        !Number.isFinite(size.x) ||
        !Number.isFinite(size.y) ||
        size.x <= 0 ||
        size.y <= 0
      ) {
        return;
      }

      if (validCoordinates.length === 1) {
        map.setView(validCoordinates[0], 13, { animate: false });
        return;
      }

      const latitudes = validCoordinates.map(([latitude]) => latitude);
      const longitudes = validCoordinates.map(([, longitude]) => longitude);
      const center: [number, number] = [
        latitudes.reduce((total, value) => total + value, 0) / latitudes.length,
        longitudes.reduce((total, value) => total + value, 0) /
          longitudes.length,
      ];
      const spread = Math.max(
        Math.max(...latitudes) - Math.min(...latitudes),
        Math.max(...longitudes) - Math.min(...longitudes),
      );
      const zoom = spread > 6 ? 6 : spread > 2 ? 7 : spread > 0.5 ? 9 : 11;

      if (center.every(Number.isFinite)) {
        map.setView(center, zoom, { animate: false });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [items, map]);

  return null;
}

function coordinatesFromLocation(city: string, mapsUrl: string): [number, number] {
  const coordinateMatch = mapsUrl.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
    ?? mapsUrl.match(/[?&](?:query|q)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (coordinateMatch) {
    const latitude = Number(coordinateMatch[1]);
    const longitude = Number(coordinateMatch[2]);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) return [latitude, longitude];
  }

  const normalizedCity = city.toLowerCase();
  if (normalizedCity.includes("bali") || normalizedCity.includes("denpasar")) return [-8.65, 115.2167];
  if (normalizedCity.includes("jakarta")) return [-6.2088, 106.8456];
  if (normalizedCity.includes("bandung")) return [-6.9175, 107.6191];
  if (normalizedCity.includes("yogyakarta") || normalizedCity.includes("jogja")) return [-7.7956, 110.3695];
  if (normalizedCity.includes("surabaya")) return [-7.2575, 112.7521];
  return [-6.2, 106.8167];
}

function googleMapsUrl(item: Listing) {
  if (item.mapsUrl) return item.mapsUrl;
  const [latitude, longitude] = item.coordinates;
  const query = encodeURIComponent(`${latitude},${longitude} (${item.title})`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function whatsappUrl(item: Listing, language: Language) {
  const message = language === "id"
    ? `Halo ${item.owner}, saya tertarik dengan listing ${item.title} di inapmu.com. Apakah properti ini masih tersedia?`
    : `Hi ${item.owner}, I'm interested in ${item.title} on inapmu.com. Is this property still available?`;
  return `https://wa.me/${item.ownerPhone}?text=${encodeURIComponent(message)}`;
}

function ListingCard({ item, onOpen, language }: { item?: Listing; onOpen: () => void; language: Language }) {
  const [saved, setSaved] = useState(false);
  const text = copy[language] ?? copy.id;

  if (!item) return null;
  return (
    <article className="group min-w-0" data-reveal>
      <div className="relative aspect-[1.17] overflow-hidden rounded-[22px] bg-stone-100">
        <img src={item.image} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          {item.promoted && <span className="rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-stone-700 shadow-sm">{text.promoted}</span>}
          <span className="rounded-full bg-[#0064D2]/90 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">{item.tag}</span>
        </div>
        <button onClick={() => setSaved(!saved)} className={`absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 transition hover:scale-105 ${saved ? "text-[#FFB700]" : "text-stone-700"}`} aria-label="Simpan properti">
          <svg width="19" height="19" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z"/></svg>
        </button>
      </div>
      <button onClick={onOpen} className="w-full pt-4 text-left">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.13em] text-[#0064D2]">{categoryLabel(item.type, language)}</p>
            <h3 className="text-[17px] font-bold leading-tight text-[#073B6F] transition group-hover:text-[#0064D2]">{item.title}</h3>
          </div>
          <StarRating rating={item.rating} compact />
        </div>
        <p className="mb-2 text-sm text-stone-500">{item.location} · {item.reviews} {text.reviews}</p>
        <p className="text-[15px] text-stone-600"><strong className="text-[#073B6F]">Rp{formatPrice(item.price)}</strong> / {periodLabel(item.period, language)}</p>
      </button>
    </article>
  );
}

export default function App() {
  const [language, setLanguage] = useState<Language>("id");
  const [category, setCategory] = useState("Semua");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Listing | null>(null);
  const [panel, setPanel] = useState<"survey" | null>(null);
  const [surveySent, setSurveySent] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [partnerSubmitted, setPartnerSubmitted] = useState(false);
  const [partnerRegistered, setPartnerRegistered] = useState(false);
  const [partnerError, setPartnerError] = useState("");
  const [submittingPartner, setSubmittingPartner] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authResult, setAuthResult] = useState<"email" | "google" | null>(null);
  const [authError, setAuthError] = useState("");
  const [submittingAuth, setSubmittingAuth] = useState(false);
  const [authenticatedUser, setAuthenticatedUser] = useState<SessionUser | null>(null);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [partnerListings, setPartnerListings] = useState<PartnerListingInput[]>([]);
  const [partnerContact, setPartnerContact] = useState({
    name: "Mitra inapmu.com",
    phone: "628123450099",
    email: "partner@inapmu.com",
  });
  const [partnerTurnstileRef, partnerTurnstileToken] = useTurnstile();
  const [authTurnstileRef, authTurnstileToken] = useTurnstile();
  const text = copy[language];

  setTurnstileTokenProvider(() => partnerTurnstileToken ?? authTurnstileToken);

  const marketplaceListings = useMemo<Listing[]>(() => [
    ...listings,
    ...partnerListings.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      location: item.city,
      price: Number(item.price),
      period: item.period,
      rating: 5,
      reviews: 0,
      image: item.image || "https://images.unsplash.com/photo-1613553474179-e1eda3ea5734?auto=format&fit=crop&w=1000&q=85",
      promoted: false,
      tag: language === "id" ? "Listing baru" : "New listing",
      description: item.description,
      owner: partnerContact.name,
      ownerPhone: partnerContact.phone,
      ownerEmail: partnerContact.email,
      survey: true,
      coordinates: coordinatesFromLocation(item.city, item.mapsUrl),
      mapsUrl: item.mapsUrl,
    })),
  ], [language, partnerContact, partnerListings]);

  const filtered = useMemo(() => marketplaceListings.filter((item) => {
    const matchesCategory = category === "Semua" || item.type === category;
    const normalized = query.toLowerCase();
    return matchesCategory && (item.location.toLowerCase().includes(normalized) || item.title.toLowerCase().includes(normalized));
  }), [category, marketplaceListings, query]);

  useEffect(() => {
    const revealElements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle("is-visible", entry.isIntersecting);
        });
      },
      {
        threshold: 0.08,
        rootMargin: "-2% 0px -6% 0px",
      },
    );

    revealElements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [category, query, showAll]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get("oauth");

    if (!oauthResult) {
      void getCurrentUser().then((user) => {
        if (user) setAuthenticatedUser(user);
      }).catch(() => undefined);
      return;
    }

    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    setAuthMode("login");
    setAuthOpen(true);
    document.body.style.overflow = "hidden";

    if (oauthResult === "success") {
      void getCurrentUser()
        .then((user) => {
          if (!user) {
            setAuthError(language === "id" ? "Sesi Google tidak ditemukan. Silakan coba lagi." : "The Google session was not found. Please try again.");
            return;
          }
          setAuthenticatedUser(user);
          setAuthResult("google");
        })
        .catch(() => setAuthError(language === "id" ? "Google berhasil kembali, tetapi sesi belum dapat dibaca." : "Google returned successfully, but the session could not be read."));
      return;
    }

    const reason = params.get("reason");
    setAuthError(
      reason === "access_denied"
        ? language === "id" ? "Login Google dibatalkan." : "Google sign-in was cancelled."
        : language === "id" ? "Login Google gagal. Silakan coba lagi." : "Google sign-in failed. Please try again.",
    );
  }, [language]);

  const openListing = (item: Listing) => {
    setSelected(item);
    setPanel(null);
    setSurveySent(false);
    document.body.style.overflow = "hidden";
  };

  const closeModal = () => {
    setSelected(null);
    setPanel(null);
    document.body.style.overflow = "";
  };

  const openPartner = () => {
    setMobileMenuOpen(false);
    setPartnerOpen(true);
    setPartnerSubmitted(false);
    document.body.style.overflow = "hidden";
  };

  const closePartner = () => {
    setPartnerOpen(false);
    document.body.style.overflow = "";
  };

  const openAuth = (mode: "login" | "register") => {
    setMobileMenuOpen(false);
    setAuthMode(mode);
    setAuthResult(null);
    setAuthOpen(true);
    document.body.style.overflow = "hidden";
  };

  const closeAuth = () => {
    setAuthOpen(false);
    setAuthResult(null);
    document.body.style.overflow = "";
  };

  const openDashboard = () => {
    setMobileMenuOpen(false);
    setPartnerOpen(false);
    if (!authenticatedUser && !currentSession()) {
      openAuth("login");
      return;
    }
    setDashboardOpen(true);
    document.body.style.overflow = "hidden";
  };

  const closeDashboard = () => {
    setDashboardOpen(false);
    document.body.style.overflow = "";
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (dashboardOpen) closeDashboard();
      else if (authOpen) closeAuth();
      else if (partnerOpen) closePartner();
      else if (selected) closeModal();
      else setMobileMenuOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [authOpen, dashboardOpen, partnerOpen, selected]);

  return (
    <main className="min-h-screen overflow-hidden bg-white text-[#073B6F]">
      <a href="#jelajah" className="sr-only fixed left-4 top-4 z-[100] rounded-full bg-[#FFB700] px-4 py-3 text-sm font-extrabold text-[#073B6F] focus:not-sr-only">{text.skipToExplore}</a>
      <nav className="relative z-20 mx-auto flex max-w-[1240px] items-center justify-between px-5 py-5 md:px-8">
        <button className="flex items-center gap-2.5" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label={text.homeAria}>
          <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#0064D2] text-white"><Icon name="home" size={21} /></span>
          <span className="text-xl font-extrabold tracking-[-0.04em]">inapmu<span className="text-[#FFB700]">.com</span></span>
        </button>
        <div className="hidden items-center gap-8 text-sm font-semibold md:flex">
          <a href="#jelajah" className="transition hover:text-[#0064D2]">{text.explore}</a>
          <a href="#cara-kerja" className="transition hover:text-[#0064D2]">{text.howItWorks}</a>
          <button onClick={partnerRegistered ? openDashboard : openPartner} className="transition hover:text-[#0064D2]">{partnerRegistered ? text.dashboardNav : text.becomeOwner}</button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full border border-[#D9D8D0] bg-white p-1 text-[11px] font-extrabold shadow-sm" aria-label="Language selector">
            <button onClick={() => setLanguage("id")} className={`rounded-full px-2.5 py-1.5 transition ${language === "id" ? "bg-[#0064D2] text-white" : "text-stone-400 hover:text-[#0064D2]"}`}>IND</button>
            <span className="text-stone-300">|</span>
            <button onClick={() => setLanguage("en")} className={`rounded-full px-2.5 py-1.5 transition ${language === "en" ? "bg-[#0064D2] text-white" : "text-stone-400 hover:text-[#0064D2]"}`}>ENG</button>
          </div>
          <button onClick={() => openAuth("login")} className="hidden rounded-full border border-[#D9D8D0] px-5 py-2.5 text-sm font-bold transition hover:bg-white lg:block">{text.login}</button>
          <button onClick={() => openAuth("register")} className="hidden rounded-full bg-[#0064D2] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0055B3] lg:block">{text.register}</button>
          <button
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="grid h-10 w-10 place-items-center rounded-full border border-[#D9D8D0] transition hover:border-[#0064D2] hover:text-[#0064D2] md:hidden"
            aria-label={mobileMenuOpen ? text.closeMenu : text.openMenu}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
          >
            <Icon name={mobileMenuOpen ? "x" : "menu"} />
          </button>
        </div>
        {mobileMenuOpen && (
          <div id="mobile-navigation" className="absolute left-5 right-5 top-[calc(100%-0.5rem)] rounded-[22px] border border-[#DFEAF5] bg-white p-3 shadow-[0_22px_60px_rgba(0,74,155,.18)] md:hidden">
            <div className="grid gap-1 text-sm font-bold">
              <a href="#jelajah" onClick={() => setMobileMenuOpen(false)} className="rounded-[14px] px-4 py-3 text-[#073B6F] transition hover:bg-[#F3F7FB]">{text.explore}</a>
              <a href="#cara-kerja" onClick={() => setMobileMenuOpen(false)} className="rounded-[14px] px-4 py-3 text-[#073B6F] transition hover:bg-[#F3F7FB]">{text.howItWorks}</a>
              <button onClick={partnerRegistered ? openDashboard : openPartner} className="rounded-[14px] px-4 py-3 text-left text-[#073B6F] transition hover:bg-[#F3F7FB]">{partnerRegistered ? text.dashboardNav : text.becomeOwner}</button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[#EEF2F6] pt-3">
              <button onClick={() => openAuth("login")} className="rounded-[13px] border border-[#D9D8D0] px-3 py-3 text-sm font-bold text-[#073B6F]">{text.login}</button>
              <button onClick={() => openAuth("register")} className="rounded-[13px] bg-[#0064D2] px-3 py-3 text-sm font-bold text-white">{text.register}</button>
            </div>
          </div>
        )}
      </nav>

      <header className="relative mx-auto max-w-[1240px] px-5 pb-10 pt-5 md:px-8 md:pb-14 md:pt-8">
        <div className="relative grid items-center gap-12 lg:grid-cols-[1.05fr_.95fr]" data-reveal>
          <div className="relative z-10">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#EAF4FF] px-3.5 py-2 text-xs font-bold uppercase tracking-[0.12em]">
              <span className="text-[#0064D2]"><Icon name="sparkles" size={16} /></span> <span className="text-[#111827]">{text.eyebrow}</span>
            </div>
            <h1 className="max-w-[680px] text-[clamp(2.5rem,11vw,4.5rem)] font-extrabold leading-[1.03] tracking-[-0.055em] sm:text-6xl lg:text-[72px]">
              <span className="text-[#111827]">{text.heroStart}</span> <span className="font-serif font-normal italic text-[#0064D2]">{text.heroAccent}</span>
            </h1>
            <p className="mt-5 max-w-[560px] text-base leading-7 text-stone-600 md:text-lg">
              {text.heroBody}
            </p>
            <div className="mt-8 max-w-[700px] rounded-[22px] bg-white p-2.5 shadow-[0_20px_55px_rgba(0,100,210,.14)] ring-1 ring-black/5">
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] px-4 py-3 sm:py-2">
                  <span className="text-[#0064D2]"><Icon name="location" size={21} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">{text.location}</span>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={text.locationPlaceholder} className="w-full bg-transparent text-[15px] font-semibold text-[#073B6F] outline-none placeholder:text-stone-500" />
                  </span>
                  {query && <button type="button" onClick={() => setQuery("")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-500 transition hover:bg-[#EAF4FF] hover:text-[#0064D2]" aria-label={text.clearSearch}><Icon name="x" size={15}/></button>}
                </label>
                <div className="hidden w-px bg-stone-200 sm:block" />
                <label className="flex items-center gap-3 rounded-[16px] px-4 py-3 sm:w-[190px] sm:py-2">
                  <span className="text-[#0064D2]"><Icon name="home" size={20} /></span>
                  <span className="flex-1">
                    <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">{text.propertyType}</span>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full appearance-none bg-transparent text-[15px] font-semibold outline-none">
                      <option value="Semua">{categoryLabel("Semua", language)}</option><option value="Kos">{categoryLabel("Kos", language)}</option><option value="Kontrakan">{categoryLabel("Kontrakan", language)}</option><option value="Vila">{categoryLabel("Vila", language)}</option>
                    </select>
                  </span>
                  <Icon name="chevron" size={16} />
                </label>
                <a href="#jelajah" className="flex min-h-[52px] items-center justify-center gap-2 rounded-[16px] bg-[#FFB700] px-6 py-4 font-bold text-[#073B6F] transition hover:-translate-y-0.5 hover:bg-[#EAA700]">
                  <Icon name="search" size={19} /> {text.search}
                </a>
              </div>
            </div>
            <Liquid
              blur={8}
              contrast={20}
              fill="#FFFFFF"
              shadow="0 8px 24px rgba(0, 74, 155, .08)"
              className="mt-6 flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-500 sm:gap-3"
            >
              <Liquid.Item observe className="flex items-center gap-2 rounded-full px-3 py-2">
                <span className="text-[#0877E8]"><Icon name="shield" size={17}/></span> {text.verifiedOwners}
              </Liquid.Item>
              <Liquid.Item observe className="flex items-center gap-2 rounded-full px-3 py-2">
                <span className="text-[#0877E8]"><Icon name="check" size={17}/></span> {text.noHiddenFees}
              </Liquid.Item>
            </Liquid>
          </div>
          <div className="relative">
            <div className="hidden min-h-[480px] lg:block">
            <div className="absolute right-0 top-0 h-[430px] w-[88%] rotate-2 overflow-hidden rounded-[120px_32px_120px_32px]">
              <img src="https://images.unsplash.com/photo-1692736933760-8a8a9b8c1b6f?auto=format&fit=crop&w=1200&q=88" alt="Vila tropis dengan kolam renang" className="h-full w-full object-cover" />
            </div>
            <div className="absolute bottom-0 left-2 w-[250px] rounded-[24px] bg-white p-3 shadow-[0_22px_60px_rgba(0,74,155,.2)]">
              <img src="https://images.unsplash.com/photo-1613553474179-e1eda3ea5734?auto=format&fit=crop&w=600&q=85" alt="Kamar nyaman dan terang" className="h-32 w-full rounded-[16px] object-cover" />
              <div className="flex items-center justify-between px-1 pb-1 pt-3">
              <div><p className="text-xs font-bold text-[#0064D2]">{text.curated}</p><p className="mt-1 font-bold">Nyaman di Setiabudi</p></div>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[#EDF6FF]"><Icon name="arrow" size={17}/></span>
              </div>
            </div>
            <div className="absolute right-5 top-8 flex items-center gap-3 rounded-full bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#FFF4D6] text-[#0064D2]"><Icon name="heart" size={18}/></span>
               <span><strong className="block text-sm">{text.curated}</strong><small className="text-stone-500">{text.exploreReady}</small></span>
             </div>
            </div>
            </div>
            <div className="mt-6 flex items-center gap-3 rounded-[20px] border border-[#DFEAF5] bg-white p-3 shadow-[0_14px_35px_rgba(0,74,155,.1)] lg:hidden">
              <img src={listings[1].image} alt={listings[1].title} className="h-16 w-20 shrink-0 rounded-[14px] object-cover" />
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#0064D2]">{text.curated}</p>
                <p className="mt-1 truncate font-bold text-[#073B6F]">{listings[1].title}</p>
                <p className="mt-1 text-xs text-stone-500">{listings[1].location}</p>
              </div>
              <span className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EDF6FF] text-[#0064D2]"><Icon name="arrow" size={17}/></span>
            </div>
          </div>
      </header>

      <section id="jelajah" className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-[1240px] px-5 md:px-8">
          <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end" data-reveal>
            <div>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#0064D2]">{text.curated}</p>
              <h2 className="text-3xl font-extrabold tracking-[-0.04em] md:text-[42px]">{text.favoritePlaces}</h2>
              <p className="mt-2 text-stone-500">{filtered.length} {text.propertiesMatch}</p>
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {["Semua", "Kos", "Kontrakan", "Vila"].map((item) => (
                <button key={item} onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-bold transition ${category === item ? "bg-[#0064D2] text-white" : "bg-[#EFF4F9] text-stone-600 hover:bg-[#E2ECF5]"}`}>
                  {categoryLabel(item, language)}
                </button>
              ))}
            </div>
          </div>
          {filtered.length > 0 ? (
            <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.slice(0, showAll ? filtered.length : 6).map((item) => <ListingCard key={item.id} item={item} language={language} onOpen={() => openListing(item)} />)}
            </div>
          ) : (
            <div className="rounded-[28px] bg-[#F1F6FB] py-20 text-center">
              <p className="text-xl font-bold">{text.noProperties}</p>
              <button onClick={() => setQuery("")} className="mt-3 text-sm font-bold text-[#0064D2]">{text.clearSearch}</button>
            </div>
          )}
          {filtered.length > 3 && (
            <div className="mt-12 text-center">
              <button onClick={() => setShowAll(!showAll)} className="inline-flex items-center gap-2 rounded-full border border-[#CFCFC5] px-6 py-3 text-sm font-bold transition hover:bg-[#F3F7FB]">
                {showAll ? text.showLess : text.seeAll} <Icon name="arrow" size={17} />
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-[1240px] px-5 md:px-8">
          <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end" data-reveal>
            <div>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#0064D2]">{text.aroundYou}</p>
              <h2 className="text-3xl font-extrabold tracking-[-0.04em] md:text-[42px]">{text.mapTitle}</h2>
              <p className="mt-2 max-w-xl text-stone-500">{text.mapBody}</p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-[#0064D2] shadow-sm">
              <span className="h-2.5 w-2.5 rounded-full bg-[#1A8CFF]" />
              {filtered.length} {text.propertiesShown}
            </div>
          </div>
          <div className="relative h-[420px] overflow-hidden rounded-[24px] border-4 border-white bg-[#DDEEFF] shadow-[0_20px_55px_rgba(0,100,210,.12)] sm:h-[500px] md:h-[620px] md:rounded-[28px] md:border-[6px]" data-reveal>
            <MapContainer
              center={[-7.45, 110.9]}
              zoom={6}
              minZoom={5}
              scrollWheelZoom
              className="h-full w-full"
              attributionControl
            >
              <TileLayer
                attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a>'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
                maxNativeZoom={19}
              />
              <MapViewport items={filtered} />
              {filtered.map((item) => (
                <Marker
                  key={item.id}
                  position={item.coordinates}
                  icon={divIcon({
                    className: "singgah-map-marker",
                    html: `<span><img src="${item.image}" alt="" /></span>`,
                    iconSize: [58, 66],
                    iconAnchor: [29, 64],
                    popupAnchor: [0, -60],
                  })}
                >
                  <Popup minWidth={220} maxWidth={250} closeButton={false}>
                    <div>
                      <button onClick={() => openListing(item)} className="block w-full text-left">
                      <img src={item.image} alt="" className="h-28 w-full rounded-[13px] object-cover" />
                      <div className="pt-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#0064D2]">{categoryLabel(item.type, language)}</p>
                          <StarRating rating={item.rating} compact />
                        </div>
                        <p className="mt-1 text-[15px] font-extrabold text-[#073B6F]">{item.title}</p>
                        <p className="mt-1 text-xs text-stone-500">{item.location}</p>
                        <p className="mt-2 text-sm font-extrabold text-[#073B6F]">Rp{formatPrice(item.price)} <span className="font-normal text-stone-500">/ {periodLabel(item.period, language)}</span></p>
                      </div>
                      </button>
                      <a
                        href={googleMapsUrl(item)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-[#EDF6FF] px-3 py-2.5 text-xs font-extrabold text-[#0064D2] transition hover:bg-[#DCEFFF]"
                      >
                        <Icon name="location" size={14} /> {text.openGoogle}
                      </a>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
            {filtered.length === 0 && (
              <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center bg-white/70 backdrop-blur-sm">
                <div className="rounded-2xl bg-white p-6 text-center shadow-xl">
                  <p className="font-bold">{text.noPins}</p>
                  <p className="mt-1 text-sm text-stone-500">{text.changeSearch}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="cara-kerja" className="relative bg-[#0064D2] py-20 text-white md:py-24">
        <div className="absolute inset-0 opacity-[.035]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
        <div className="relative mx-auto max-w-[1240px] px-5 md:px-8">
          <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-center" data-reveal>
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[#FFD45C]">{text.easy}</p>
              <h2 className="text-4xl font-extrabold leading-tight tracking-[-0.04em] md:text-5xl">{text.confidence}</h2>
              <p className="mt-5 max-w-md leading-7 text-white/65">{text.confidenceBody}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {text.steps.map(([number, title, stepBody]) => (
                <div key={number} className="rounded-[22px] border border-white/10 bg-white/[.06] p-6 backdrop-blur">
                  <span className="mb-12 block font-serif text-3xl italic text-[#FFD45C]">{number}</span>
                  <h3 className="mb-2 text-lg font-bold">{title}</h3>
                  <p className="text-sm leading-6 text-white/60">{stepBody}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-white px-5 py-9 md:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-4 border-t border-stone-200 pt-8 text-sm text-stone-500 sm:flex-row">
          <span className="font-extrabold text-[#073B6F]">inapmu<span className="text-[#FFB700]">.com</span></span>
          <p>{text.footer}</p>
          <p>© 2026 inapmu.com Indonesia</p>
        </div>
      </footer>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#002B55]/60 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true">
          <div className="max-h-[94vh] w-full max-w-[940px] overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">
            <div className="relative grid md:grid-cols-[1.08fr_.92fr]">
              <div className="relative min-h-[260px] md:min-h-[610px]">
                <img src={selected.image} alt={selected.title} className="absolute inset-0 h-full w-full object-cover sm:rounded-l-[28px]" />
                {selected.promoted && <span className="absolute left-5 top-5 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider">{text.promoted}</span>}
                <button onClick={closeModal} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white text-stone-800 shadow-md md:hidden" aria-label="Tutup"><Icon name="x" /></button>
              </div>
              <div className="relative p-6 md:p-8">
                <button onClick={closeModal} className="absolute right-5 top-5 hidden h-9 w-9 place-items-center rounded-full bg-stone-100 transition hover:bg-stone-200 md:grid" aria-label="Tutup"><Icon name="x" size={18}/></button>
                <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[#0064D2]">{categoryLabel(selected.type, language)} · {selected.tag}</p>
                <h2 className="pr-8 text-3xl font-extrabold tracking-[-0.04em]">{selected.title}</h2>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-stone-500"><Icon name="location" size={16}/> {selected.location}</p>
                <a
                  href={googleMapsUrl(selected)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-[#0064D2] transition hover:underline"
                >
                  {text.viewGoogle} <Icon name="arrow" size={15}/>
                </a>
                <div className="my-6 flex items-center justify-between border-y border-stone-200 py-4">
                  <p><strong className="text-xl">Rp{formatPrice(selected.price)}</strong> <span className="text-sm text-stone-500">/ {periodLabel(selected.period, language)}</span></p>
                  <p className="flex flex-wrap items-center justify-end gap-1.5"><StarRating rating={selected.rating}/><span className="text-xs font-normal text-stone-400">({selected.reviews})</span></p>
                </div>
                <p className="text-[15px] leading-7 text-stone-600">{selected.description}</p>
                <div className="mt-6 rounded-[18px] bg-[#EDF6FF] p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-[#0064D2] text-white"><Icon name="user" size={20}/></span>
                    <div><p className="text-xs text-stone-500">{text.managedBy}</p><p className="font-bold">{selected.owner}</p></div>
                    <span className="ml-auto flex items-center gap-1 text-xs font-bold text-[#0877E8]"><Icon name="shield" size={16}/> {text.verified}</span>
                  </div>
                </div>

                {!panel && (
                  <div className="mt-6 space-y-3">
                    <a href={whatsappUrl(selected, language)} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-[15px] bg-[#FFB700] px-5 py-3.5 font-bold text-[#073B6F] transition hover:bg-[#EAA700]"><Icon name="chat" size={19}/> {text.chatOwner}</a>
                    {selected.survey && <button onClick={() => setPanel("survey")} className="flex w-full items-center justify-center gap-2 rounded-[15px] border border-[#C9C9BF] px-5 py-3.5 font-bold transition hover:bg-white"><Icon name="calendar" size={19}/> {text.scheduleSurvey}</button>}
                    {!selected.survey && <p className="rounded-xl bg-stone-100 p-3 text-center text-xs text-stone-500">{text.directBooking}</p>}
                  </div>
                )}

                {panel === "survey" && (
                  <div className="mt-6 rounded-[18px] border border-stone-200 bg-white p-4">
                    {surveySent ? (
                      <div className="py-5 text-center">
                        <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-[#E6F3FF] text-[#0877E8]"><Icon name="check"/></span>
                        <p className="font-bold">{text.surveySent}</p><p className="mt-1 text-sm text-stone-500">{text.confirmSchedule}</p>
                      </div>
                    ) : (
                      <form onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        const subject = language === "id"
                          ? `Permintaan survei: ${selected.title}`
                          : `Viewing request: ${selected.title}`;
                        const body = language === "id"
                          ? `Halo ${selected.owner},\n\nSaya ingin mengajukan survei properti berikut:\n\nProperti: ${selected.title}\nLokasi: ${selected.location}\nTanggal: ${data.get("date")}\nWaktu: ${data.get("time")}\n\nInformasi calon tamu:\nNama: ${data.get("guestName")}\nWhatsApp: ${data.get("guestPhone")}\nEmail: ${data.get("guestEmail")}\n\nMohon konfirmasi ketersediaan jadwal tersebut.\n\nDikirim melalui inapmu.com`
                          : `Hi ${selected.owner},\n\nI would like to request a property viewing:\n\nProperty: ${selected.title}\nLocation: ${selected.location}\nDate: ${data.get("date")}\nTime: ${data.get("time")}\n\nGuest contact information:\nName: ${data.get("guestName")}\nWhatsApp: ${data.get("guestPhone")}\nEmail: ${data.get("guestEmail")}\n\nPlease confirm whether this schedule is available.\n\nSent via inapmu.com`;
                        setSurveySent(true);
                        window.location.href = `mailto:${selected.ownerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                      }}>
                        <div className="mb-3 flex items-center justify-between"><p className="font-bold">{text.chooseSchedule}</p><button type="button" onClick={() => setPanel(null)} className="text-stone-400"><Icon name="x" size={17}/></button></div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-xs font-bold text-stone-500 sm:col-span-2">{text.guestName}<input required name="guestName" autoComplete="name" className="mt-1.5 w-full rounded-xl bg-[#F3F7FB] p-3 text-sm font-semibold text-[#073B6F] outline-none"/></label>
                          <label className="text-xs font-bold text-stone-500">{text.guestPhone}<input required name="guestPhone" type="tel" autoComplete="tel" placeholder="08..." className="mt-1.5 w-full rounded-xl bg-[#F3F7FB] p-3 text-sm font-semibold text-[#073B6F] outline-none"/></label>
                          <label className="text-xs font-bold text-stone-500">{text.guestEmail}<input required name="guestEmail" type="email" autoComplete="email" className="mt-1.5 w-full rounded-xl bg-[#F3F7FB] p-3 text-sm font-semibold text-[#073B6F] outline-none"/></label>
                          <label className="text-xs font-bold text-stone-500">{text.preferredDate}<input required name="date" type="date" min="2026-10-11" defaultValue="2026-10-14" className="mt-1.5 w-full rounded-xl bg-[#F3F7FB] p-3 text-sm font-semibold text-[#073B6F] outline-none"/></label>
                          <label className="text-xs font-bold text-stone-500">{text.preferredTime}<select required name="time" className="mt-1.5 w-full rounded-xl bg-[#F3F7FB] p-3 text-sm font-semibold text-[#073B6F] outline-none"><option>10.00 – 11.00</option><option>13.00 – 14.00</option><option>16.00 – 17.00</option></select></label>
                        </div>
                        <button type="submit" className="mt-3 w-full rounded-xl bg-[#0064D2] py-3 text-sm font-bold text-white">{text.sendRequest}</button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {partnerOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#002B55]/65 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={text.partnerTitle}>
          <div className="relative max-h-[96vh] w-full max-w-[980px] overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">
            <button onClick={closePartner} className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/95 text-[#073B6F] shadow-md transition hover:scale-105" aria-label="Tutup">
              <Icon name="x" size={19}/>
            </button>
            <div className="grid min-h-[620px] lg:grid-cols-[.82fr_1.18fr]">
              <div className="relative hidden overflow-hidden bg-[#0064D2] p-9 text-white lg:flex lg:flex-col lg:justify-between">
                <img src="https://images.unsplash.com/photo-1675657144518-025804f1812c?auto=format&fit=crop&w=900&q=85" alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 mix-blend-luminosity" />
                <div className="absolute inset-0 bg-gradient-to-b from-[#0064D2]/60 to-[#002B55]/95" />
                <div className="relative">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.14em] backdrop-blur">
                    <Icon name="sparkles" size={15}/> {text.partnerKicker}
                  </span>
                  <h2 className="mt-6 text-[42px] font-extrabold leading-[1.05] tracking-[-0.045em]">{text.partnerTitle}</h2>
                  <p className="mt-4 leading-7 text-white/75">{text.partnerBody}</p>
                </div>
                <div className="relative space-y-3">
                  {text.partnerBenefits.map((benefit) => (
                    <div key={benefit} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold backdrop-blur">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#FFB700] text-[#073B6F]"><Icon name="check" size={15}/></span>
                      {benefit}
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 pt-16 sm:p-10 sm:pt-12 lg:p-12">
                {partnerSubmitted ? (
                  <div className="flex min-h-[510px] flex-col items-center justify-center text-center">
                    <span className="mb-5 grid h-20 w-20 place-items-center rounded-full bg-[#E6F3FF] text-[#0064D2]">
                      <Icon name="check" size={38}/>
                    </span>
                    <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[#0064D2]">{text.partnerKicker}</p>
                    <h2 className="max-w-md text-3xl font-extrabold tracking-[-0.04em] text-[#073B6F]">{text.partnerSuccess}</h2>
                    <p className="mt-3 max-w-md leading-7 text-stone-500">{text.partnerSuccessBody}</p>
                    <button onClick={openDashboard} className="mt-8 flex items-center gap-2 rounded-full bg-[#0064D2] px-7 py-3.5 text-sm font-bold text-white transition hover:bg-[#0055B3]">{text.openDashboard}<Icon name="arrow" size={17}/></button>
                  </div>
                ) : (
                  <>
                    <div className="lg:hidden">
                      <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[#0064D2]">{text.partnerKicker}</p>
                      <h2 className="text-3xl font-extrabold tracking-[-0.04em] text-[#073B6F]">{text.partnerTitle}</h2>
                      <p className="mt-3 text-sm leading-6 text-stone-500">{text.partnerBody}</p>
                    </div>
                    <form
                      className="mt-8 space-y-7 lg:mt-0"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const form = event.currentTarget;
                        const data = new FormData(form);
                        const rawPhone = String(data.get("phone")).replace(/\D/g, "");
                        const phone = rawPhone.startsWith("0") ? `62${rawPhone.slice(1)}` : rawPhone;
                        setSubmittingPartner(true);
                        setPartnerError("");
                        try {
                          await submitPartnerApplication({
                            fullName: String(data.get("fullName")),
                            email: String(data.get("email")),
                            phone,
                            propertyName: String(data.get("propertyName")),
                            city: String(data.get("city")),
                            propertyType: String(data.get("propertyType")),
                          });
                          setPartnerContact({ name: String(data.get("fullName")), email: String(data.get("email")), phone });
                          setPartnerRegistered(true);
                          setPartnerSubmitted(true);
                        } catch (error) {
                          setPartnerError(error instanceof ApiRequestError ? error.code : "network_error");
                        } finally {
                          setSubmittingPartner(false);
                        }
                      }}
                    >
                      {/* Honeypot: hidden from humans, bots fill it */}
                      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
                      <div ref={partnerTurnstileRef} />
                      <fieldset>
                        <legend className="mb-4 flex items-center gap-2 text-lg font-extrabold text-[#073B6F]">
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#EAF4FF] text-xs text-[#0064D2]">1</span>
                          {text.ownerInfo}
                        </legend>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="text-sm font-bold text-stone-600 sm:col-span-2">
                            {text.fullName}
                            <input required name="fullName" autoComplete="name" className="mt-2 w-full rounded-[14px] border border-stone-200 bg-[#F7FAFE] px-4 py-3.5 font-medium text-[#073B6F] outline-none transition focus:border-[#0064D2] focus:ring-2 focus:ring-[#0064D2]/15" />
                          </label>
                          <label className="text-sm font-bold text-stone-600">
                            {text.email}
                            <input required type="email" name="email" autoComplete="email" className="mt-2 w-full rounded-[14px] border border-stone-200 bg-[#F7FAFE] px-4 py-3.5 font-medium text-[#073B6F] outline-none transition focus:border-[#0064D2] focus:ring-2 focus:ring-[#0064D2]/15" />
                          </label>
                          <label className="text-sm font-bold text-stone-600">
                            {text.phone}
                            <input required type="tel" name="phone" autoComplete="tel" placeholder="08..." className="mt-2 w-full rounded-[14px] border border-stone-200 bg-[#F7FAFE] px-4 py-3.5 font-medium text-[#073B6F] outline-none transition focus:border-[#0064D2] focus:ring-2 focus:ring-[#0064D2]/15" />
                          </label>
                        </div>
                      </fieldset>

                      <fieldset>
                        <legend className="mb-4 flex items-center gap-2 text-lg font-extrabold text-[#073B6F]">
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#EAF4FF] text-xs text-[#0064D2]">2</span>
                          {text.propertyInfo}
                        </legend>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="text-sm font-bold text-stone-600">
                            {text.propertyName}
                            <input required name="propertyName" className="mt-2 w-full rounded-[14px] border border-stone-200 bg-[#F7FAFE] px-4 py-3.5 font-medium text-[#073B6F] outline-none transition focus:border-[#0064D2] focus:ring-2 focus:ring-[#0064D2]/15" />
                          </label>
                          <label className="text-sm font-bold text-stone-600">
                            {text.city}
                            <input required name="city" className="mt-2 w-full rounded-[14px] border border-stone-200 bg-[#F7FAFE] px-4 py-3.5 font-medium text-[#073B6F] outline-none transition focus:border-[#0064D2] focus:ring-2 focus:ring-[#0064D2]/15" />
                          </label>
                          <label className="text-sm font-bold text-stone-600 sm:col-span-2">
                            {text.propertyType}
                            <select required name="propertyType" defaultValue="" className="mt-2 w-full rounded-[14px] border border-stone-200 bg-[#F7FAFE] px-4 py-3.5 font-medium text-[#073B6F] outline-none transition focus:border-[#0064D2] focus:ring-2 focus:ring-[#0064D2]/15">
                              <option value="" disabled>{text.chooseType}</option>
                              <option value="kos">{categoryLabel("Kos", language)}</option>
                              <option value="kontrakan">{categoryLabel("Kontrakan", language)}</option>
                              <option value="vila">{categoryLabel("Vila", language)}</option>
                            </select>
                          </label>
                        </div>
                      </fieldset>

                      <label className="flex cursor-pointer items-start gap-3 rounded-[14px] bg-[#F3F7FB] p-4 text-sm leading-6 text-stone-600">
                        <input required type="checkbox" className="mt-1 h-4 w-4 accent-[#0064D2]" />
                        <span>{text.agreement}</span>
                      </label>
                      {partnerError && <p className="text-sm font-bold text-red-600">{partnerError}</p>}
                      <button type="submit" disabled={submittingPartner} className="flex w-full items-center justify-center gap-2 rounded-[15px] bg-[#FFB700] px-6 py-4 font-extrabold text-[#073B6F] transition hover:bg-[#EAA700] disabled:cursor-not-allowed disabled:opacity-50">
                        {text.submitPartner} <Icon name="arrow" size={18}/>
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {authOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#002B55]/65 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={authMode === "login" ? text.loginTitle : text.registerTitle}>
          <div className="relative max-h-[96vh] w-full max-w-[500px] overflow-y-auto rounded-t-[28px] bg-white p-6 shadow-2xl sm:rounded-[28px] sm:p-9">
            <button onClick={closeAuth} className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-[#F3F7FB] text-[#073B6F] transition hover:bg-[#EAF4FF]" aria-label="Tutup">
              <Icon name="x" size={18}/>
            </button>

            {authResult ? (
              <div className="flex min-h-[480px] flex-col items-center justify-center text-center">
                <span className="mb-5 grid h-20 w-20 place-items-center rounded-full bg-[#E6F3FF] text-[#0064D2]">
                  {authResult === "google" ? <span className="text-3xl font-extrabold">G</span> : <Icon name="check" size={38}/>}
                </span>
                <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[#0064D2]">inapmu.com</p>
                <h2 className="text-3xl font-extrabold tracking-[-0.04em] text-[#073B6F]">{authResult === "google" ? text.googleReady : text.authSuccess}</h2>
                <p className="mt-3 max-w-sm leading-7 text-stone-500">{authResult === "google" ? text.googleReadyBody : text.authSuccessBody}</p>
                <button onClick={closeAuth} className="mt-8 rounded-full bg-[#0064D2] px-7 py-3.5 text-sm font-bold text-white transition hover:bg-[#0055B3]">{text.backHome}</button>
              </div>
            ) : (
              <>
                <div className="pr-12">
                  <span className="text-xl font-extrabold tracking-[-0.04em] text-[#073B6F]">inapmu<span className="text-[#FFB700]">.com</span></span>
                </div>

                <div className="mt-8 grid grid-cols-2 rounded-[15px] bg-[#F3F7FB] p-1.5">
                  <button
                    onClick={() => setAuthMode("login")}
                    className={`rounded-[11px] py-3 text-sm font-extrabold transition ${authMode === "login" ? "bg-white text-[#0064D2] shadow-sm" : "text-stone-400 hover:text-[#073B6F]"}`}
                  >
                    {text.login}
                  </button>
                  <button
                    onClick={() => setAuthMode("register")}
                    className={`rounded-[11px] py-3 text-sm font-extrabold transition ${authMode === "register" ? "bg-[#0064D2] text-white shadow-sm" : "text-stone-400 hover:text-[#073B6F]"}`}
                  >
                    {text.register}
                  </button>
                </div>

                <div className="mt-7 text-center">
                  <h2 className="text-3xl font-extrabold tracking-[-0.04em] text-[#073B6F]">{authMode === "login" ? text.loginTitle : text.registerTitle}</h2>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-stone-500">{authMode === "login" ? text.loginBody : text.registerBody}</p>
                </div>

                <button type="button" onClick={() => window.location.assign("/api/auth/google/start")} className="mt-7 flex w-full items-center justify-center gap-3 rounded-[14px] border border-stone-200 bg-white px-4 py-3.5 text-sm font-extrabold text-[#073B6F] transition hover:border-[#9AC9F8] hover:bg-[#F7FAFE]">
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-stone-200 text-sm font-extrabold text-[#4285F4]">G</span>
                  {text.continueGoogle}
                </button>

                <div className="my-6 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.1em] text-stone-400">
                  <span className="h-px flex-1 bg-stone-200" />
                  {text.orEmail}
                  <span className="h-px flex-1 bg-stone-200" />
                </div>

                <form
                  className="space-y-4"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const data = new FormData(form);
                    const email = String(data.get("email"));
                    const password = String(data.get("password"));
                    if (authMode === "register") {
                      const confirmation = form.elements.namedItem("confirmPassword") as HTMLInputElement;
                      confirmation.setCustomValidity(password === String(data.get("confirmPassword")) ? "" : language === "id" ? "Kata sandi tidak sama." : "Passwords do not match.");
                      if (!form.reportValidity()) return;
                    }
                    setSubmittingAuth(true);
                    setAuthError("");
                    try {
                      if (authMode === "register") {
                        const name = String(data.get("fullName") ?? "");
                        await registerUser(email, password, name);
                        setAuthResult("email");
                      } else {
                        const { token, user } = await loginUser(email, password);
                        saveSession(token);
                        setAuthenticatedUser(user);
                        setAuthResult("email");
                      }
                    } catch (error) {
                      setAuthError(error instanceof ApiRequestError ? error.code : "network_error");
                    } finally {
                      setSubmittingAuth(false);
                    }
                  }}
                >
                  <div ref={authTurnstileRef} />
                  <label className="block text-sm font-bold text-stone-600">
                    {text.email}
                    <input required type="email" name="email" autoComplete="email" className="mt-2 w-full rounded-[14px] border border-stone-200 bg-[#F7FAFE] px-4 py-3.5 font-medium text-[#073B6F] outline-none transition focus:border-[#0064D2] focus:ring-2 focus:ring-[#0064D2]/15" />
                  </label>
                  <label className="block text-sm font-bold text-stone-600">
                    <span className="flex items-center justify-between">
                      {text.password}
                      {authMode === "login" && <button type="button" className="text-xs font-bold text-[#0064D2] hover:underline">{text.forgotPassword}</button>}
                    </span>
                      <input required minLength={12} type="password" name="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} className="mt-2 w-full rounded-[14px] border border-stone-200 bg-[#F7FAFE] px-4 py-3.5 font-medium text-[#073B6F] outline-none transition focus:border-[#0064D2] focus:ring-2 focus:ring-[#0064D2]/15" />
                  </label>
                  {authMode === "register" && (
                    <label className="block text-sm font-bold text-stone-600">
                      {text.confirmPassword}
                       <input required minLength={12} type="password" name="confirmPassword" autoComplete="new-password" onInput={(event) => event.currentTarget.setCustomValidity("")} className="mt-2 w-full rounded-[14px] border border-stone-200 bg-[#F7FAFE] px-4 py-3.5 font-medium text-[#073B6F] outline-none transition focus:border-[#0064D2] focus:ring-2 focus:ring-[#0064D2]/15" />
                    </label>
                  )}
                  {authError && <p className="text-sm font-bold text-red-600">{authError}</p>}
                  <button type="submit" disabled={submittingAuth} className="mt-2 flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#FFB700] px-5 py-4 font-extrabold text-[#073B6F] transition hover:bg-[#EAA700] disabled:cursor-not-allowed disabled:opacity-50">
                    {authMode === "login" ? text.loginAction : text.registerAction} <Icon name="arrow" size={18}/>
                  </button>
                </form>

                <p className="mx-auto mt-5 max-w-sm text-center text-[11px] leading-5 text-stone-400">{text.termsPrefix}</p>
              </>
            )}
          </div>
        </div>
      )}
      {dashboardOpen && (
        <PartnerDashboard
          language={language}
          listings={partnerListings}
          onClose={closeDashboard}
          onListingCreated={(listing) => {
            setPartnerListings((current) => [...current, listing]);
            setCategory("Semua");
            setQuery("");
          }}
        />
      )}
    </main>
  );
}
