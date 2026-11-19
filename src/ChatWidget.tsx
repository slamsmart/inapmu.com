import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const COPY = {
  id: {
    title: "Asisten INAPMU",
    hello: "Halo! Ada yang bisa saya bantu soal kos atau paket di inapmu.com?",
    placeholder: "Tulis pesan...",
    send: "Kirim",
    open: "Buka chat",
    close: "Tutup",
    error: "Maaf, chat sedang tidak tersedia. Coba lagi nanti.",
    limited: "Terlalu banyak pesan. Tunggu sebentar.",
  },
  en: {
    title: "INAPMU Assistant",
    hello: "Hi! How can I help with listings or plans on inapmu.com?",
    placeholder: "Type a message...",
    send: "Send",
    open: "Open chat",
    close: "Close",
    error: "Sorry, chat is unavailable right now. Please try again later.",
    limited: "Too many messages. Please wait a moment.",
  },
} as const;

export default function ChatWidget({ language }: { language: "id" | "en" | string }) {
  const t = language === "en" ? COPY.en : COPY.id;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const content = input.trim();
    if (!content || busy) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
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
        <div className="mb-3 flex h-[min(480px,70vh)] w-[min(360px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10" role="dialog" aria-label={t.title}>
          <div className="flex items-center justify-between bg-[#073B6F] px-4 py-3 text-white">
            <span className="text-sm font-semibold">{t.title}</span>
            <button onClick={() => setOpen(false)} className="text-lg leading-none" aria-label={t.close}>×</button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            <div className="max-w-[85%] rounded-2xl bg-[#F3F7FB] px-3 py-2 text-[#073B6F]">{t.hello}</div>
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 ${m.role === "user" ? "ml-auto bg-[#073B6F] text-white" : "bg-[#F3F7FB] text-[#073B6F]"}`}
              >
                {m.content}
              </div>
            ))}
            {busy && <div className="w-fit rounded-2xl bg-[#F3F7FB] px-3 py-2 text-[#073B6F]">…</div>}
            <div ref={endRef} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex gap-2 border-t border-black/10 p-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={1000}
              placeholder={t.placeholder}
              className="min-w-0 flex-1 rounded-full bg-[#F3F7FB] px-4 py-2 text-sm outline-none"
            />
            <button disabled={busy || !input.trim()} className="rounded-full bg-[#073B6F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {t.send}
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="grid h-14 w-14 place-items-center rounded-full bg-[#073B6F] text-2xl text-white shadow-xl transition hover:scale-105"
        aria-label={open ? t.close : t.open}
      >
        {open ? "×" : "💬"}
      </button>
    </div>
  );
}
