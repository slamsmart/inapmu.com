/**
 * Cloudflare Turnstile widget loader + React hook.
 * Renders an invisible/managed widget and exposes the token via a provider
 * consumed by the API client. Falls back gracefully when the site key is
 * not configured (local dev) — provider returns undefined and the worker's
 * dev bypass accepts the request.
 */
import { useEffect, useRef, useState } from "react";

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// Site key is public by design; inject at build time via VITE_TURNSTILE_SITE_KEY.
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  const { promise, resolve, reject } = Promise.withResolvers<TurnstileApi>();
  scriptPromise = promise;
  const script = document.createElement("script");
  script.src = TURNSTILE_SCRIPT_SRC;
  script.async = true;
  script.addEventListener("load", () => {
    if (window.turnstile) resolve(window.turnstile);
    else reject(new Error("turnstile loaded but API missing"));
  });
  script.addEventListener("error", () => reject(new Error("failed to load turnstile script")));
  document.head.appendChild(script);
  return promise;
}

export function useTurnstile(): [React.RefCallback<HTMLDivElement>, string | undefined] {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [token, setToken] = useState<string | undefined>(undefined);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!container || !SITE_KEY) return;

    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || widgetIdRef.current !== null) return;
        widgetIdRef.current = turnstile.render(container, {
          sitekey: SITE_KEY,
          callback: (value: string) => setToken(value),
          "expired-callback": () => setToken(undefined),
          "error-callback": () => setToken(undefined),
          theme: "light",
        });
      })
      .catch(() => setToken(undefined));

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // widget already gone
        }
        widgetIdRef.current = null;
      }
    };
  }, [container]);

  return [setContainer, token];
}
