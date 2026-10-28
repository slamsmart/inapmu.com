import { useState } from "react";
import { ApiRequestError, displayName, updateProfile, type ActivePlan, type SessionUser } from "./lib/api";

type Language = "id" | "en";

const copy = {
  id: {
    title: "Pengaturan akun",
    profile: "Profil",
    name: "Nama tampilan",
    nameHint: "Kosongkan untuk memakai nama dari email.",
    email: "Email",
    emailHint: "Email dipakai untuk masuk dan tidak bisa diubah di sini.",
    phone: "Nomor WhatsApp",
    phoneHint: "Dipakai pemilik properti untuk menghubungimu dan untuk tagihan QRIS.",
    signIn: "Metode masuk",
    google: "Google",
    emailPassword: "Email & kata sandi",
    memberSince: "Bergabung sejak",
    plan: "Paket mitra",
    free: "Free",
    activeUntil: "aktif sampai",
    upgrade: "Lihat paket",
    save: "Simpan perubahan",
    saving: "Menyimpan...",
    saved: "Perubahan disimpan.",
    logout: "Keluar",
    close: "Tutup",
    errors: {
      validation_failed: "Periksa lagi nama atau nomor WhatsApp (contoh 0812xxxxxxx).",
      rate_limited: "Terlalu banyak perubahan. Coba lagi sebentar lagi.",
      unauthorized: "Sesi login berakhir. Silakan masuk lagi.",
      default: "Gagal menyimpan. Coba lagi.",
    } as Record<string, string>,
  },
  en: {
    title: "Account settings",
    profile: "Profile",
    name: "Display name",
    nameHint: "Leave empty to use the name from your email.",
    email: "Email",
    emailHint: "Your email is your login and can't be changed here.",
    phone: "WhatsApp number",
    phoneHint: "Used by property owners to reach you and for QRIS bills.",
    signIn: "Sign-in method",
    google: "Google",
    emailPassword: "Email & password",
    memberSince: "Member since",
    plan: "Partner plan",
    free: "Free",
    activeUntil: "active until",
    upgrade: "See plans",
    save: "Save changes",
    saving: "Saving...",
    saved: "Changes saved.",
    logout: "Log out",
    close: "Close",
    errors: {
      validation_failed: "Check the name or WhatsApp number (e.g. 0812xxxxxxx).",
      rate_limited: "Too many changes. Please try again shortly.",
      unauthorized: "Your session ended. Please log in again.",
      default: "Couldn't save. Please try again.",
    } as Record<string, string>,
  },
};

/** 6281234567890 -> 081234567890 for display and editing. */
function localPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.startsWith("62") ? `0${phone.slice(2)}` : phone;
}

export function UserAvatar({ user, size = 36 }: { user: Pick<SessionUser, "email" | "name">; size?: number }) {
  const initial = displayName(user).charAt(0).toUpperCase();
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-[#0064D2] font-medium text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export default function AccountModal({
  user,
  plan,
  language,
  onClose,
  onSaved,
  onLogout,
  onSeePlans,
}: {
  user: SessionUser;
  plan: ActivePlan;
  language: Language;
  onClose: () => void;
  onSaved: (user: SessionUser) => void;
  onLogout: () => void;
  onSeePlans: () => void;
}) {
  const text = copy[language];
  const [name, setName] = useState(user.name ?? "");
  const [phone, setPhone] = useState(localPhone(user.phone));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const dateFormat = new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-GB", { dateStyle: "long" });
  const inputClass =
    "mt-2 w-full rounded-[14px] border border-stone-200 bg-[#F7FAFE] px-4 py-3.5 font-medium text-[#073B6F] outline-none transition focus:border-[#0064D2] focus:ring-2 focus:ring-[#0064D2]/15";

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-[#002B55]/65 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={text.title}>
      <div className="relative max-h-[96vh] w-full max-w-[520px] overflow-y-auto rounded-t-[28px] bg-white p-6 shadow-2xl sm:rounded-[28px] sm:p-9">
        <button onClick={onClose} className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-[#F3F7FB] text-[#073B6F] transition hover:bg-[#EAF4FF]" aria-label={text.close}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>

        <div className="flex items-center gap-4 pr-12">
          <UserAvatar user={{ email: user.email, name: name || null }} size={56} />
          <div className="min-w-0">
            <h2 className="truncate text-[26px] font-medium leading-[1.1] tracking-[-0.04em] text-[#111827]">{displayName({ email: user.email, name: name || null })}</h2>
            <p className="mt-1 truncate text-sm text-stone-500">{user.email}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-[16px] border border-[#DFEAF5] p-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-stone-400">{text.plan}</p>
            <p className="mt-1.5 font-medium text-[#111827]">
              {plan.plan === "free" ? text.free : plan.plan === "gold" ? "Gold" : "Platinum"}
            </p>
            {plan.expiresAt ? (
              <p className="mt-0.5 text-xs text-stone-500">{text.activeUntil} {dateFormat.format(plan.expiresAt)}</p>
            ) : (
              <button type="button" onClick={onSeePlans} className="mt-0.5 text-xs font-medium text-[#0064D2] hover:underline">{text.upgrade}</button>
            )}
          </div>
          <div className="rounded-[16px] border border-[#DFEAF5] p-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-stone-400">{text.signIn}</p>
            <p className="mt-1.5 font-medium text-[#111827]">{user.provider === "google" ? text.google : text.emailPassword}</p>
            {user.created_at && <p className="mt-0.5 text-xs text-stone-500">{text.memberSince} {dateFormat.format(user.created_at)}</p>}
          </div>
        </div>

        <form
          className="mt-7 space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setMessage(null);
            try {
              const updated = await updateProfile({ name, phone });
              onSaved(updated);
              setMessage({ kind: "ok", text: text.saved });
            } catch (error) {
              const code = error instanceof ApiRequestError ? error.code : "default";
              setMessage({ kind: "error", text: text.errors[code] ?? text.errors.default });
            } finally {
              setSaving(false);
            }
          }}
        >
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#0064D2]">{text.profile}</p>
          <label className="block text-sm font-medium text-stone-600">
            {text.name}
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoComplete="name" placeholder={user.email.split("@")[0]} className={inputClass} />
            <span className="mt-1.5 block text-xs font-normal text-stone-400">{text.nameHint}</span>
          </label>
          <label className="block text-sm font-medium text-stone-600">
            {text.email}
            <input value={user.email} readOnly className={`${inputClass} cursor-not-allowed opacity-70`} />
            <span className="mt-1.5 block text-xs font-normal text-stone-400">{text.emailHint}</span>
          </label>
          <label className="block text-sm font-medium text-stone-600">
            {text.phone}
            <input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" autoComplete="tel" placeholder="08..." className={inputClass} />
            <span className="mt-1.5 block text-xs font-normal text-stone-400">{text.phoneHint}</span>
          </label>

          {message && <p className={`text-sm font-medium ${message.kind === "ok" ? "text-[#0064D2]" : "text-red-600"}`}>{message.text}</p>}

          <div className="flex flex-col gap-3 pt-1 sm:flex-row">
            <button type="submit" disabled={saving} className="flex-1 rounded-[12px] bg-[#0064D2] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#0055B3] disabled:opacity-50">
              {saving ? text.saving : text.save}
            </button>
            <button type="button" onClick={onLogout} className="rounded-[12px] border border-[#D9D8D0] px-5 py-3.5 text-sm font-medium text-red-600 transition hover:bg-[#F3F7FB]">
              {text.logout}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
