import { useEffect, useState } from "react";

/**
 * Floating "Install app" button for the PWA, matching the site's brand blue
 * and pill shape. Only renders when the browser has actually fired
 * `beforeinstallprompt` (i.e. install is genuinely available and the app
 * isn't already installed/running standalone).
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const COPY = {
  id: { install: "Pasang aplikasi", aria: "Pasang inapmu.com sebagai aplikasi" },
  en: { install: "Install app", aria: "Install inapmu.com as an app" },
} as const;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function InstallPwaButton({ language }: { language: "id" | "en" | string }) {
  const t = language === "en" ? COPY.en : COPY.id;
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (installed || !deferredPrompt) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <button
      type="button"
      onClick={() => void handleInstall()}
      aria-label={t.aria}
      className="fixed bottom-5 left-5 z-[60] flex items-center gap-2 rounded-full bg-[#0064D2] px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-[#0064D2]/30 transition hover:-translate-y-0.5 hover:bg-[#0055B3] active:translate-y-0"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      {t.install}
    </button>
  );
}
