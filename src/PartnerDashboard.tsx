import { useState } from "react";
import { createListing, submitVerification, ApiRequestError, setTurnstileTokenProvider } from "./lib/api";
import { useTurnstile } from "./lib/turnstile";


type Language = "id" | "en";
type Tab = "overview" | "verification" | "listing";

export type PartnerListingInput = {
  id: number;
  title: string;
  type: string;
  city: string;
  price: string;
  period: string;
  description: string;
  mapsUrl: string;
  image?: string;
};

const labels = {
  id: {
    dashboard: "Dashboard Mitra",
    overview: "Ringkasan",
    verification: "Verifikasi Akun",
    listing: "Listing Properti",
    back: "Kembali ke situs",
    hello: "Selamat datang, Mitra",
    subtitle: "Kelola verifikasi dan properti kamu dari satu tempat.",
    completeProfile: "Selesaikan profil mitra",
    profileBody: "Upload KTP untuk memverifikasi identitas sebagai pemilik properti.",
    verifyNow: "Verifikasi sekarang",
    addProperty: "Tambah properti",
    properties: "Total properti",
    active: "Listing aktif",
    contacts: "Kontak masuk",
    yourProperties: "Properti kamu",
    empty: "Belum ada properti",
    emptyBody: "Buat listing pertamamu agar calon penyewa dapat menemukannya.",
    createListing: "Buat listing",
    review: "Dalam peninjauan",
    identityTitle: "Verifikasi identitas pemilik",
    identityBody: "KTP digunakan untuk memverifikasi bahwa akun dikelola oleh pemilik atau pengelola properti yang sah.",
    dataSecure: "Data dienkripsi dan hanya digunakan untuk proses verifikasi.",
    uploadKtp: "Upload foto KTP",
    ktpHint: "JPG atau PNG, maksimal 5 MB. Pastikan foto jelas dan tidak terpotong.",
    chooseKtp: "Pilih foto KTP",
    replace: "Ganti foto",
    submitVerification: "Kirim untuk verifikasi",
    verificationSent: "Dokumen berhasil dikirim",
    verificationSentBody: "Tim kami akan memeriksa dokumen dalam waktu maksimal 1×24 jam.",
    listingTitle: "Buat listing properti",
    listingBody: "Lengkapi informasi agar calon penyewa memahami propertimu dengan jelas.",
    basicInfo: "Informasi dasar",
    propertyName: "Nama properti",
    propertyType: "Tipe properti",
    selectType: "Pilih tipe",
    city: "Kota atau kabupaten",
    address: "Alamat singkat",
    price: "Harga",
    period: "Periode harga",
    description: "Deskripsi properti",
    descriptionHint: "Ceritakan suasana, akses, fasilitas utama, dan hal yang perlu diketahui calon penyewa.",
    location: "Lokasi Google Maps",
    mapsHint: "Tempel link lokasi dari Google Maps",
    photos: "Foto properti",
    photosHint: "Upload maksimal 8 foto. Foto pertama akan menjadi cover.",
    choosePhotos: "Pilih foto",
    publish: "Simpan listing",
    listingSaved: "Listing berhasil disimpan dan masuk dalam proses peninjauan.",
  },
  en: {
    dashboard: "Partner Dashboard",
    overview: "Overview",
    verification: "Account Verification",
    listing: "Property Listing",
    back: "Back to site",
    hello: "Welcome, Partner",
    subtitle: "Manage verification and properties from one place.",
    completeProfile: "Complete your partner profile",
    profileBody: "Upload your ID card to verify your identity as a property owner.",
    verifyNow: "Verify now",
    addProperty: "Add property",
    properties: "Total properties",
    active: "Active listings",
    contacts: "New contacts",
    yourProperties: "Your properties",
    empty: "No properties yet",
    emptyBody: "Create your first listing so potential guests can find it.",
    createListing: "Create listing",
    review: "Under review",
    identityTitle: "Owner identity verification",
    identityBody: "Your ID is used to verify that the account is managed by a legitimate property owner or manager.",
    dataSecure: "Your data is encrypted and only used for verification.",
    uploadKtp: "Upload your ID card",
    ktpHint: "JPG or PNG, maximum 5 MB. Make sure the photo is clear and not cropped.",
    chooseKtp: "Choose ID photo",
    replace: "Replace photo",
    submitVerification: "Submit for verification",
    verificationSent: "Document submitted",
    verificationSentBody: "Our team will review your document within 24 hours.",
    listingTitle: "Create a property listing",
    listingBody: "Complete the information so potential guests clearly understand your property.",
    basicInfo: "Basic information",
    propertyName: "Property name",
    propertyType: "Property type",
    selectType: "Select type",
    city: "City or regency",
    address: "Short address",
    price: "Price",
    period: "Price period",
    description: "Property description",
    descriptionHint: "Describe the atmosphere, access, key facilities, and anything potential guests should know.",
    location: "Google Maps location",
    mapsHint: "Paste a location link from Google Maps",
    photos: "Property photos",
    photosHint: "Upload up to 8 photos. The first photo will be used as the cover.",
    choosePhotos: "Choose photos",
    publish: "Save listing",
    listingSaved: "Listing saved and submitted for review.",
  },
};

function DashIcon({ name, size = 20 }: { name: "grid" | "shield" | "home" | "upload" | "map" | "arrow" | "check" | "x"; size?: number }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-5"/></>,
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v5h16v-5"/></>,
    map: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    x: <><path d="m6 6 12 12M18 6 6 18"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function PartnerDashboard({
  language,
  onClose,
  listings,
  onListingCreated,
}: {
  language: Language;
  onClose: () => void;
  listings: PartnerListingInput[];
  onListingCreated: (listing: PartnerListingInput) => void;
}) {
  const text = labels[language];
  const [tab, setTab] = useState<Tab>("overview");
  const [ktpPreview, setKtpPreview] = useState("");
  const [ktpFile, setKtpFile] = useState<File | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [submittingVerification, setSubmittingVerification] = useState(false);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [savedNotice, setSavedNotice] = useState(false);
  const [listingError, setListingError] = useState("");
  const [submittingListing, setSubmittingListing] = useState(false);
  const [turnstileRef, turnstileToken] = useTurnstile();
  setTurnstileTokenProvider(() => turnstileToken);

  const navigation = [
    { id: "overview" as const, label: text.overview, icon: "grid" as const },
    { id: "verification" as const, label: text.verification, icon: "shield" as const },
    { id: "listing" as const, label: text.listing, icon: "home" as const },
  ];
  const onKtpChange = (file?: File) => {
    if (!file || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return;
    setKtpPreview(URL.createObjectURL(file));
    setKtpFile(file);
    setVerificationSent(false);
  };


  const onPhotosChange = (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, 8);
    setPhotoFiles(selected);
    setPhotoPreviews(selected.map((file) => URL.createObjectURL(file)));
  };

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain bg-[#F3F7FB] text-[#073B6F]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[260px] flex-col border-r border-[#DFEAF5] bg-white p-5 lg:flex">
        <button onClick={onClose} className="flex items-center gap-2 px-2 py-3 text-xl font-extrabold tracking-[-0.04em]">
          inapmu<span className="-ml-2 text-[#FFB700]">.com</span>
        </button>
        <p className="mb-5 mt-7 px-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-stone-400">{text.dashboard}</p>
        <nav className="space-y-1.5">
          {navigation.map((item) => (
            <button key={item.id} onClick={() => setTab(item.id)} className={`flex w-full items-center gap-3 rounded-[13px] px-4 py-3.5 text-left text-sm font-bold transition ${tab === item.id ? "bg-[#EAF4FF] text-[#0064D2]" : "text-stone-500 hover:bg-[#F7FAFE] hover:text-[#073B6F]"}`}>
              <DashIcon name={item.icon} size={19}/>{item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-[18px] bg-[#0064D2] p-4 text-white">
          <p className="text-sm font-bold">Mitra inapmu.com</p>
          <p className="mt-1 text-xs text-white/65">partner@inapmu.com</p>
        </div>
        <button onClick={onClose} className="mt-3 flex items-center gap-2 px-3 py-3 text-sm font-bold text-stone-500 hover:text-[#0064D2]"><DashIcon name="arrow" size={17}/>{text.back}</button>
      </aside>

      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-10 border-b border-[#DFEAF5] bg-white/90 px-5 py-4 backdrop-blur md:px-8">
          <div className="mx-auto flex max-w-[1120px] items-center justify-between">
            <div>
              <p className="text-lg font-extrabold">{text.dashboard}</p>
              <p className="text-xs text-stone-400">partner@inapmu.com</p>
            </div>
            <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-[#F3F7FB] text-[#073B6F] lg:hidden" aria-label={text.back}><DashIcon name="x" size={18}/></button>
            <span className="hidden h-10 w-10 place-items-center rounded-full bg-[#0064D2] text-sm font-extrabold text-white lg:grid">MI</span>
          </div>
          <div className="mx-auto mt-4 flex max-w-[1120px] gap-2 overflow-x-auto px-0.5 pb-1 lg:hidden">
            {navigation.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold ${tab === item.id ? "bg-[#0064D2] text-white" : "bg-[#F3F7FB] text-stone-500"}`}><DashIcon name={item.icon} size={15}/>{item.label}</button>)}
          </div>
        </header>

        <main className="mx-auto max-w-[1120px] px-4 py-7 sm:px-5 md:px-8 md:py-10">
          {tab === "overview" && (
            <div>
              <div className="mb-8">
                <h1 className="text-3xl font-extrabold tracking-[-0.04em] md:text-4xl">{text.hello}</h1>
                <p className="mt-2 text-stone-500">{text.subtitle}</p>
              </div>
              {!verificationSent && (
                <div className="mb-7 flex flex-col gap-5 rounded-[22px] bg-[#FFF4D6] p-6 sm:flex-row sm:items-center">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FFB700] text-[#073B6F]"><DashIcon name="shield"/></span>
                  <div className="flex-1"><p className="font-extrabold">{text.completeProfile}</p><p className="mt-1 text-sm text-stone-600">{text.profileBody}</p></div>
                  <button onClick={() => setTab("verification")} className="rounded-full bg-[#073B6F] px-5 py-3 text-sm font-bold text-white">{text.verifyNow}</button>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                {[[text.properties, listings.length], [text.active, 0], [text.contacts, 0]].map(([label, value]) => (
                  <div key={label} className="rounded-[20px] border border-[#DFEAF5] bg-white p-6"><p className="text-sm font-semibold text-stone-400">{label}</p><p className="mt-3 text-3xl font-extrabold">{value}</p></div>
                ))}
              </div>
              <div className="mt-7 rounded-[22px] border border-[#DFEAF5] bg-white p-6">
                <div className="flex items-center justify-between"><h2 className="text-xl font-extrabold">{text.yourProperties}</h2><button onClick={() => setTab("listing")} className="rounded-full bg-[#0064D2] px-4 py-2.5 text-xs font-bold text-white">{text.addProperty}</button></div>
                {listings.length === 0 ? (
                  <div className="py-16 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#EAF4FF] text-[#0064D2]"><DashIcon name="home" size={25}/></span><p className="mt-4 font-extrabold">{text.empty}</p><p className="mt-1 text-sm text-stone-400">{text.emptyBody}</p><button onClick={() => setTab("listing")} className="mt-5 text-sm font-bold text-[#0064D2]">{text.createListing}</button></div>
                ) : listings.map((listing) => (
                  <div key={listing.id} className="mt-5 flex flex-col gap-4 rounded-[17px] border border-[#DFEAF5] p-3 sm:flex-row sm:items-center">
                    <div className="h-24 w-full overflow-hidden rounded-[13px] bg-[#EAF4FF] sm:w-32">{listing.image && <img src={listing.image} alt="" className="h-full w-full object-cover"/>}</div>
                    <div className="flex-1"><p className="text-xs font-extrabold uppercase tracking-wider text-[#0064D2]">{listing.type}</p><p className="mt-1 font-extrabold">{listing.title}</p><p className="mt-1 text-sm text-stone-400">{listing.city} · Rp{listing.price}/{listing.period}</p></div>
                    <span className="self-start rounded-full bg-[#FFF4D6] px-3 py-2 text-xs font-bold text-[#9A6A00] sm:self-center">{text.review}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "verification" && (
            <div className="mx-auto max-w-[760px]">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#0064D2]">{text.verification}</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] md:text-4xl">{text.identityTitle}</h1>
              <p className="mt-3 max-w-2xl leading-7 text-stone-500">{text.identityBody}</p>
              {verificationSent ? (
                <div className="mt-8 rounded-[24px] border border-[#B9DDFC] bg-white px-6 py-16 text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#EAF4FF] text-[#0064D2]"><DashIcon name="check" size={30}/></span><h2 className="mt-5 text-2xl font-extrabold">{text.verificationSent}</h2><p className="mx-auto mt-2 max-w-md text-stone-500">{text.verificationSentBody}</p></div>
              ) : (
                <div className="mt-8 rounded-[24px] border border-[#DFEAF5] bg-white p-6 md:p-8">
                  <h2 className="text-lg font-extrabold">{text.uploadKtp}</h2><p className="mt-1 text-sm text-stone-400">{text.ktpHint}</p>
                  <label className={`mt-6 flex min-h-[280px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[18px] border-2 border-dashed transition ${ktpPreview ? "border-[#8EC8FA] bg-[#F7FAFE]" : "border-[#C9D8E7] bg-[#F7FAFE] hover:border-[#0064D2]"}`}>
                    {ktpPreview ? <img src={ktpPreview} alt="KTP preview" className="h-[280px] w-full object-contain"/> : <><span className="grid h-14 w-14 place-items-center rounded-full bg-[#EAF4FF] text-[#0064D2]"><DashIcon name="upload" size={25}/></span><span className="mt-4 text-sm font-extrabold text-[#0064D2]">{text.chooseKtp}</span></>}
                    <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(event) => onKtpChange(event.target.files?.[0])}/>
                  </label>
                  <div className="mt-5 flex items-start gap-3 rounded-[14px] bg-[#EAF4FF] p-4 text-sm leading-6 text-[#285E91]"><DashIcon name="shield" size={19}/><p>{text.dataSecure}</p></div>
                  <div ref={turnstileRef} className="mt-4 flex justify-center" />
                  <button disabled={!ktpFile || submittingVerification} onClick={async () => {
                    if (!ktpFile) return;
                    setSubmittingVerification(true);
                    setVerificationError("");
                    try {
                       await submitVerification(ktpFile);
                      setVerificationSent(true);
                    } catch (error) {
                      setVerificationError(error instanceof ApiRequestError ? error.code : "network_error");
                    } finally {
                      setSubmittingVerification(false);
                    }
                  }} className="mt-5 w-full rounded-[14px] bg-[#0064D2] py-4 font-extrabold text-white transition disabled:cursor-not-allowed disabled:opacity-35">{submittingVerification ? "..." : text.submitVerification}</button>
                  {verificationError && <p className="mt-3 text-sm font-bold text-red-600">{verificationError}</p>}
                </div>
              )}
            </div>
          )}

          {tab === "listing" && (
            <div className="mx-auto max-w-[860px]">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#0064D2]">{text.listing}</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] md:text-4xl">{text.listingTitle}</h1>
              <p className="mt-3 text-stone-500">{text.listingBody}</p>
              {savedNotice && <div className="mt-6 flex items-center gap-3 rounded-[15px] bg-[#EAF4FF] p-4 text-sm font-bold text-[#0064D2]"><DashIcon name="check" size={18}/>{text.listingSaved}</div>}
              <form className="mt-7 space-y-6" onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                setSubmittingListing(true);
                setListingError("");
                try {
                  await createListing({
                    title: String(data.get("title")),
                    type: String(data.get("type")),
                    city: String(data.get("city")),
                    address: String(data.get("address")),
                    price: Number(data.get("price")),
                    period: String(data.get("period")),
                    description: String(data.get("description")),
                    mapsUrl: String(data.get("mapsUrl")),
                    photos: photoFiles,
                  });
                  onListingCreated({
                    id: Date.now(),
                    title: String(data.get("title")),
                    type: String(data.get("type")),
                    city: String(data.get("city")),
                    price: String(data.get("price")),
                    period: String(data.get("period")),
                    description: String(data.get("description")),
                    mapsUrl: String(data.get("mapsUrl")),
                  });
                  setSavedNotice(true);
                  form.reset();
                  setPhotoPreviews([]);
                  setPhotoFiles([]);
                  window.setTimeout(() => setTab("overview"), 900);
                } catch (error) {
                  setListingError(error instanceof ApiRequestError ? error.code : "network_error");
                } finally {
                  setSubmittingListing(false);
                }
              }}>
                <section className="rounded-[22px] border border-[#DFEAF5] bg-white p-6 md:p-8">
                  <h2 className="mb-6 text-lg font-extrabold">{text.basicInfo}</h2>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label={text.propertyName}><input required name="title" className="partner-input"/></Field>
                    <Field label={text.propertyType}><select required name="type" defaultValue="" className="partner-input"><option value="" disabled>{text.selectType}</option><option>Kos</option><option>Kontrakan</option><option>Vila</option></select></Field>
                    <Field label={text.city}><input required name="city" className="partner-input"/></Field>
                    <Field label={text.address}><input required name="address" className="partner-input"/></Field>
                    <Field label={text.price}><input required min="1" type="number" name="price" className="partner-input"/></Field>
                    <Field label={text.period}><select required name="period" className="partner-input"><option value="malam">/ malam</option><option value="bulan">/ bulan</option><option value="tahun">/ tahun</option></select></Field>
                    <Field label={text.description} className="sm:col-span-2"><textarea required minLength={50} name="description" placeholder={text.descriptionHint} className="partner-input min-h-36 resize-y"/></Field>
                    <Field label={text.location} className="sm:col-span-2"><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0064D2]"><DashIcon name="map" size={19}/></span><input required type="url" name="mapsUrl" placeholder={text.mapsHint} className="partner-input pl-11"/></div></Field>
                  </div>
                </section>
                <section className="rounded-[22px] border border-[#DFEAF5] bg-white p-6 md:p-8">
                  <h2 className="text-lg font-extrabold">{text.photos}</h2><p className="mt-1 text-sm text-stone-400">{text.photosHint}</p>
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {photoPreviews.map((preview, index) => <div key={preview} className="relative aspect-square overflow-hidden rounded-[14px] bg-[#EAF4FF]"><img src={preview} alt={`Property ${index + 1}`} className="h-full w-full object-cover"/>{index === 0 && <span className="absolute bottom-2 left-2 rounded-full bg-white px-2 py-1 text-[10px] font-extrabold text-[#0064D2]">COVER</span>}</div>)}
                    {photoPreviews.length < 8 && <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-[14px] border-2 border-dashed border-[#C9D8E7] bg-[#F7FAFE] text-[#0064D2] hover:border-[#0064D2]"><DashIcon name="upload" size={23}/><span className="mt-2 text-xs font-extrabold">{text.choosePhotos}</span><input required={photoPreviews.length === 0} multiple type="file" accept="image/*" className="hidden" onChange={(event) => onPhotosChange(event.target.files)}/></label>}
                  </div>
                </section>
                <button type="submit" disabled={submittingListing} className="flex w-full items-center justify-center gap-2 rounded-[15px] bg-[#FFB700] px-6 py-4 font-extrabold text-[#073B6F] transition hover:bg-[#EAA700] disabled:cursor-not-allowed disabled:opacity-50">{text.publish}<DashIcon name="arrow" size={18}/></button>
                {listingError && <p className="text-sm font-bold text-red-600">{listingError}</p>}
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`block text-sm font-bold text-stone-600 ${className}`}>{label}{children}</label>;
}
