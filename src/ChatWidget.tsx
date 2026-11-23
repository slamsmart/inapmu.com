import { useEffect, useRef, useState, type ReactNode } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const COPY = {
  id: {
    title: "Asisten INAPMU AI",
    subtitle: "Rekomendasi kos, kontrakan & vila resmi",
    hello: "Halo! Saya Asisten AI inapmu.com. Mau cari kos, kontrakan, atau vila di area mana dan budget berapa?",
    placeholder: "Tulis misal: cari kos dekat Setiabudi 2 jutaan...",
    send: "Kirim",
    open: "Buka chat asisten AI",
    close: "Tutup chat",
    error: "Maaf, chat sedang tidak tersedia. Coba lagi nanti.",
    limited: "Terlalu banyak pesan. Tunggu sebentar.",
    quickUB: "Kos Setiabudi < 3 jt",
    quickBali: "Vila Ubud dengan kolam",
    quickBdg: "Kontrakan Bandung",
  },
  en: {
    title: "INAPMU AI Assistant",
    subtitle: "Official housing recommendations & prices",
    hello: "Hello! I am INAPMU's AI assistant. What property type, city, or budget are you looking for?",
    placeholder: "E.g. find a room near Jakarta under 3m...",
    send: "Send",
    open: "Open AI chat assistant",
    close: "Close chat",
    error: "Sorry, chat is unavailable right now. Please try again later.",
    limited: "Too many messages. Please wait a moment.",
    quickUB: "Setiabudi room < 3m",
    quickBali: "Ubud villa with pool",
    quickBdg: "Bandung house",
  },
} as const;

function formatText(text: string, onSelectListing?: (id: number) => void): ReactNode[] {
  // Parse markdown bold **text** and markdown links [Label](url)
  const tokens = text.split(/(\*\*.*?\*\*|\[.*?\]\(.*?\))/g);
  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**") && token.length >= 4) {
      return <strong key={index} className="font-semibold text-[#073B6F]">{token.slice(2, -2)}</strong>;
    }
    const linkMatch = token.match(/^\[(.*?)\]\((.*?)\)$/);
    if (linkMatch) {
      const label = linkMatch[1];
      const url = linkMatch[2];
      const listingMatch = url.match(/#listing-(\d+)/);
      return (
        <a
          key={index}
          href={url}
          onClick={(e) => {
            if (listingMatch) {
              e.preventDefault();
              const id = Number(listingMatch[1]);
              window.location.hash = `#listing-${id}`;
              onSelectListing?.(id);
            }
          }}
          className="inline-flex items-center gap-1 font-semibold text-[#0064D2] underline decoration-[#0064D2]/40 hover:text-[#004EAA] hover:decoration-[#004EAA]"
          title="Klik untuk lihat listing"
        >
          <span>🏠 {label}</span>
        </a>
      );
    }
    return token;
  });
}

export default function ChatWidget({
  language,
  onSelectListing,
}: {
  language: "id" | "en" | string;
  onSelectListing?: (id: number) => void;
}) {
  const t = language === "en" ? COPY.en : COPY.id;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function handleSend(customText?: string) {
    const content = (customText ?? input).trim();
    if (!content || busy) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    if (!customText) setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string };
      const reply = res.ok && data.reply ? data.reply : res.status === 429 ? t.limited : t.error;
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch {
      setMessages([...next, { role: "assistant", content: t.error }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-[60]">
      {open && (
        <div
          className="mb-3 flex h-[min(540px,78vh)] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10"
          role="dialog"
          aria-label={t.title}
        >
          <div className="flex items-center justify-between bg-[#0064D2] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <div>
                <span className="block text-sm font-semibold">{t.title}</span>
                <span className="block text-[11px] text-white/80">{t.subtitle}</span>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-full text-lg leading-none transition hover:bg-white/20"
              aria-label={t.close}
            >
              ×
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
            <div className="max-w-[90%] rounded-2xl bg-[#F3F7FB] px-3.5 py-2.5 text-[#073B6F] shadow-sm">
              <p>{t.hello}</p>
              {messages.length === 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 pt-1 border-t border-black/5">
                  <button
                    type="button"
                    onClick={() => void handleSend(t.quickUB)}
                    className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#0064D2] shadow-xs ring-1 ring-black/5 transition hover:bg-[#EAF3FA]"
                  >
                    💡 {t.quickUB}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSend(t.quickBali)}
                    className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#0064D2] shadow-xs ring-1 ring-black/5 transition hover:bg-[#EAF3FA]"
                  >
                    🌴 {t.quickBali}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSend(t.quickBdg)}
                    className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#0064D2] shadow-xs ring-1 ring-black/5 transition hover:bg-[#EAF3FA]"
                  >
                    🏡 {t.quickBdg}
                  </button>
                </div>
              )}
            </div>

            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                  m.role === "user"
                    ? "ml-auto bg-[#073B6F] text-white shadow-sm"
                    : "bg-[#F3F7FB] text-[#1E293B] shadow-sm ring-1 ring-black/5"
                }`}
              >
                {m.role === "assistant" ? formatText(m.content, onSelectListing) : m.content}
              </div>
            ))}

            {busy && (
              <div className="flex items-center gap-1.5 w-fit rounded-2xl bg-[#F3F7FB] px-3.5 py-2 text-[#073B6F] text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-[#0064D2] animate-bounce" />
                <span className="h-1.5 w-1.5 rounded-full bg-[#0064D2] animate-bounce [animation-delay:0.2s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-[#0064D2] animate-bounce [animation-delay:0.4s]" />
                <span className="ml-1 text-stone-500 font-medium">Mencari listing inapmu...</span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex gap-2 border-t border-black/10 p-2.5 bg-white"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={1000}
              placeholder={t.placeholder}
              className="min-w-0 flex-1 rounded-full bg-[#F3F7FB] px-4 py-2 text-sm text-[#073B6F] outline-none placeholder:text-stone-400 focus:ring-1 focus:ring-[#0064D2]"
            />
            <button
              disabled={busy || !input.trim()}
              className="rounded-full bg-[#073B6F] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0064D2] disabled:opacity-50"
            >
              {t.send}
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="group relative grid h-14 w-14 place-items-center rounded-full bg-[#5EC2F7] text-2xl text-white shadow-xl transition hover:scale-105 hover:bg-[#49B4EE] active:scale-95"
        aria-label={open ? t.close : t.open}
      >
        {open ? (
          "×"
        ) : (
          <>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="4" y="8" width="16" height="12" rx="4" fill="white" />
              <rect x="10.25" y="2.5" width="3.5" height="4" rx="1.75" fill="white" />
              <circle cx="12" cy="3" r="1.4" fill="white" />
              <circle cx="8.75" cy="14" r="1.7" fill="#5EC2F7" />
              <circle cx="15.25" cy="14" r="1.7" fill="#5EC2F7" />
              <rect x="8.5" y="17.3" width="7" height="1.6" rx="0.8" fill="#5EC2F7" />
              <rect x="1.5" y="11" width="2.2" height="4.5" rx="1.1" fill="white" />
              <rect x="20.3" y="11" width="2.2" height="4.5" rx="1.1" fill="white" />
            </svg>
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-black text-black">
              AI
            </span>
          </>
        )}
      </button>
    </div>
  );
}
