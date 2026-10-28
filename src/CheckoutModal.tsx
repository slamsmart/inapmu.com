import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ApiRequestError, createCheckout, getCheckoutOrder, type ActivePlan, type CheckoutOrder, type PaidPlan } from "./lib/api";

type Language = "id" | "en";

const copy = {
  id: {
    title: "Bayar dengan QRIS",
    plan: "Paket",
    perPeriod: "30 hari",
    creating: "Menyiapkan kode QRIS...",
    scan: "Scan dengan m-banking atau e-wallet apa pun yang mendukung QRIS.",
    waiting: "Menunggu pembayaran",
    expiresIn: "Berlaku",
    openMayar: "Buka halaman bayar Mayar",
    noQr: "Kode QR belum bisa ditampilkan di sini. Lanjutkan pembayaran di halaman Mayar.",
    paidTitle: "Pembayaran berhasil",
    paidBody: "Paket kamu sudah aktif sampai",
    done: "Selesai",
    expiredTitle: "Kode QRIS kedaluwarsa",
    expiredBody: "Buat kode baru untuk melanjutkan pembayaran.",
    retry: "Buat kode baru",
    phoneTitle: "Nomor WhatsApp",
    phoneBody: "Mayar membutuhkan nomor HP untuk membuat tagihan.",
    phoneAction: "Lanjut ke pembayaran",
    close: "Tutup",
    errors: {
      payment_busy: "Tagihan baru saja dibuat. Tunggu 1 menit lalu coba lagi.",
      rate_limited: "Terlalu banyak percobaan. Coba lagi sebentar lagi.",
      payment_unavailable: "Pembayaran sedang tidak tersedia. Coba lagi nanti.",
      unauthorized: "Sesi login berakhir. Silakan masuk lagi.",
      validation_failed: "Data tidak valid.",
      default: "Terjadi kesalahan. Coba lagi.",
    } as Record<string, string>,
  },
  en: {
    title: "Pay with QRIS",
    plan: "Plan",
    perPeriod: "30 days",
    creating: "Preparing your QRIS code...",
    scan: "Scan with any banking or e-wallet app that supports QRIS.",
    waiting: "Waiting for payment",
    expiresIn: "Valid for",
    openMayar: "Open Mayar payment page",
    noQr: "The QR code can't be shown here yet. Continue on the Mayar payment page.",
    paidTitle: "Payment successful",
    paidBody: "Your plan is active until",
    done: "Done",
    expiredTitle: "QRIS code expired",
    expiredBody: "Create a new code to continue.",
    retry: "Create new code",
    phoneTitle: "WhatsApp number",
    phoneBody: "Mayar needs a phone number to create the bill.",
    phoneAction: "Continue to payment",
    close: "Close",
    errors: {
      payment_busy: "A bill was just created. Wait 1 minute and try again.",
      rate_limited: "Too many attempts. Please try again shortly.",
      payment_unavailable: "Payments are unavailable right now. Please try later.",
      unauthorized: "Your session ended. Please log in again.",
      validation_failed: "Invalid data.",
      default: "Something went wrong. Please try again.",
    } as Record<string, string>,
  },
};

const PLAN_NAME: Record<PaidPlan, string> = { gold: "Gold", platinum: "Platinum" };

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function isSafeHttpsUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export default function CheckoutModal({
  plan,
  language,
  onClose,
  onPaid,
}: {
  plan: PaidPlan;
  language: Language;
  onClose: () => void;
  onPaid: (plan: ActivePlan) => void;
}) {
  const text = copy[language];
  const [order, setOrder] = useState<CheckoutOrder | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [needsPhone, setNeedsPhone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activePlan, setActivePlan] = useState<ActivePlan | null>(null);
  const [clock, setClock] = useState(Date.now());
  const startedAt = useRef(Date.now());

  const start = useCallback(
    async (mobile?: string) => {
      setLoading(true);
      setError("");
      setNeedsPhone(false);
      try {
        const created = await createCheckout(plan, mobile);
        startedAt.current = Date.now();
        setOrder(created);
      } catch (cause) {
        const code = cause instanceof ApiRequestError ? cause.code : "default";
        if (code === "phone_required") setNeedsPhone(true);
        else setError(text.errors[code] ?? text.errors.default);
      } finally {
        setLoading(false);
      }
    },
    [plan, text],
  );

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    if (!order?.qrString) {
      setQrImage(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(order.qrString, { width: 320, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => !cancelled && setQrImage(url))
      .catch(() => !cancelled && setQrImage(null));
    return () => {
      cancelled = true;
    };
  }, [order?.qrString]);

  // Poll our server (never Mayar directly): every 5s for 2 minutes, then every 20s.
  const orderId = order?.orderId;
  const orderStatus = order?.status;
  useEffect(() => {
    if (!orderId || orderStatus !== "pending") return;
    const delay = Date.now() - startedAt.current < 120_000 ? 5_000 : 20_000;
    const timer = window.setTimeout(async () => {
      try {
        const next = await getCheckoutOrder(orderId);
        setOrder(next);
        if (next.status === "paid" && next.activePlan) {
          setActivePlan(next.activePlan);
          onPaid(next.activePlan);
        }
      } catch {
        setOrder((current) => (current ? { ...current } : current));
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [orderId, orderStatus, order, onPaid]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = order?.expiresAt ? order.expiresAt - clock : null;
  const expired = order?.status === "expired" || (remaining !== null && remaining <= 0 && order?.status === "pending");
  const amountLabel = order ? `Rp${new Intl.NumberFormat("id-ID").format(order.amount)}` : "";
  const paidUntil = activePlan?.expiresAt
    ? new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-GB", { dateStyle: "long" }).format(activePlan.expiresAt)
    : "";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#002B55]/65 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={text.title}>
      <div className="relative max-h-[96vh] w-full max-w-[440px] overflow-y-auto rounded-t-[28px] bg-white p-6 text-center shadow-2xl sm:rounded-[28px] sm:p-8">
        <button onClick={onClose} className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-[#F3F7FB] text-[#073B6F] transition hover:bg-[#EAF4FF]" aria-label={text.close}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>

        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#0064D2]">{text.plan} {PLAN_NAME[plan]} · {text.perPeriod}</p>

        {order?.status === "paid" ? (
          <div className="py-6">
            <span className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-[#E6F3FF] text-[#0064D2]">
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m5 12 4 4L19 6" /></svg>
            </span>
            <h2 className="text-[28px] font-medium leading-[1.1] tracking-[-0.04em] text-[#111827]">{text.paidTitle}</h2>
            <p className="mt-3 text-stone-500">{text.paidBody} {paidUntil}.</p>
            <button onClick={onClose} className="mt-7 w-full rounded-[12px] bg-[#0064D2] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#0055B3]">{text.done}</button>
          </div>
        ) : needsPhone ? (
          <form
            className="py-4 text-left"
            onSubmit={(event) => {
              event.preventDefault();
              void start(String(new FormData(event.currentTarget).get("mobile") ?? ""));
            }}
          >
            <h2 className="text-center text-[28px] font-medium leading-[1.1] tracking-[-0.04em] text-[#111827]">{text.title}</h2>
            <label className="mt-6 block text-sm font-medium text-stone-600">
              {text.phoneTitle}
              <input required type="tel" name="mobile" autoComplete="tel" placeholder="08..." pattern="(\+?62|0)8[0-9]{7,11}" className="mt-2 w-full rounded-[14px] border border-stone-200 bg-[#F7FAFE] px-4 py-3.5 font-medium text-[#073B6F] outline-none transition focus:border-[#0064D2] focus:ring-2 focus:ring-[#0064D2]/15" />
            </label>
            <p className="mt-2 text-xs text-stone-500">{text.phoneBody}</p>
            <button type="submit" disabled={loading} className="mt-6 w-full rounded-[12px] bg-[#FFB700] px-5 py-3.5 text-sm font-medium text-[#073B6F] transition hover:bg-[#EAA700] disabled:opacity-50">{text.phoneAction}</button>
          </form>
        ) : expired ? (
          <div className="py-6">
            <h2 className="text-[28px] font-medium leading-[1.1] tracking-[-0.04em] text-[#111827]">{text.expiredTitle}</h2>
            <p className="mt-3 text-stone-500">{text.expiredBody}</p>
            <button onClick={() => void start()} disabled={loading} className="mt-7 w-full rounded-[12px] bg-[#0064D2] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#0055B3] disabled:opacity-50">{text.retry}</button>
          </div>
        ) : (
          <div className="pt-3">
            <h2 className="text-[28px] font-medium leading-[1.1] tracking-[-0.04em] text-[#111827]">{text.title}</h2>
            {order && <p className="mt-2 text-3xl font-medium tabular-nums tracking-[-0.04em] text-[#111827]">{amountLabel}</p>}

            <div className="mx-auto mt-6 grid aspect-square w-full max-w-[280px] place-items-center rounded-[20px] border border-[#DFEAF5] bg-white p-3">
              {loading || !order ? (
                <p className="px-6 text-sm text-stone-500">{error || text.creating}</p>
              ) : qrImage ? (
                <img src={qrImage} alt="QRIS" className="h-full w-full rounded-[12px] [image-rendering:pixelated]" />
              ) : (
                <p className="px-6 text-sm leading-6 text-stone-500">{text.noQr}</p>
              )}
            </div>

            {order && !loading && (
              <>
                <p className="mt-5 text-sm leading-6 text-stone-500">{text.scan}</p>
                <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-[#0064D2]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#0064D2]" />
                  {text.waiting}
                  {remaining !== null && <span className="tabular-nums text-stone-500">· {text.expiresIn} {formatCountdown(remaining)}</span>}
                </div>
                {isSafeHttpsUrl(order.paymentLink) && (
                  <a href={order.paymentLink} target="_blank" rel="noreferrer" className={`mt-6 block w-full rounded-[12px] px-5 py-3.5 text-sm font-medium transition ${qrImage ? "border border-[#D9D8D0] text-[#073B6F] hover:bg-[#F3F7FB]" : "bg-[#FFB700] text-[#073B6F] hover:bg-[#EAA700]"}`}>
                    {text.openMayar}
                  </a>
                )}
              </>
            )}
            {error && order && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}
            {error && !order && !loading && (
              <button onClick={() => void start()} className="mt-6 w-full rounded-[12px] bg-[#0064D2] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#0055B3]">{text.retry}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
