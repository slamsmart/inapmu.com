/**
 * Bot/abuse protection primitives:
 *  - Cloudflare Turnstile verification (server-side)
 *  - D1-backed sliding-window rate limiter
 *  - Honeypot field check
 *  - Upload magic-byte sniffing
 */
import type { Bindings } from "./util";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = { ok: true } | { ok: false; reason: string };

/**
 * Verify a Turnstile token server-side.
 * In development (no secret bound) verification is skipped so local tests pass.
 */
export async function verifyTurnstile(
  env: Pick<Bindings, "ENVIRONMENT"> & { TURNSTILE_SECRET_KEY?: string },
  token: string | undefined,
  ip: string,
): Promise<TurnstileResult> {
  if (!env.TURNSTILE_SECRET_KEY) {
    if (env.ENVIRONMENT === "production") {
      return { ok: false, reason: "Turnstile secret not configured" };
    }
    return { ok: true }; // dev bypass
  }
  if (!token) return { ok: false, reason: "Missing Turnstile token" };

  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip });
  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body });
    const data = (await response.json()) as { success: boolean; "error-codes"?: string[] };
    if (data.success) return { ok: true };
    return { ok: false, reason: data["error-codes"]?.join(",") ?? "verification-failed" };
  } catch {
    return { ok: false, reason: "turnstile-unreachable" };
  }
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Fixed-window rate limiter backed by D1. Keyed e.g. "ip:1.2.3.4:endpoint".
 */
export async function rateLimit(
  db: D1Database,
  key: string,
  windowSeconds: number,
  maxRequests: number,
): Promise<RateLimitResult> {
  const nowMs = Date.now();
  const windowStart = Math.floor(nowMs / (windowSeconds * 1000)) * windowSeconds * 1000;

  // Upsert counter; cleanup old rows opportunistically (cheap indexed delete).
  await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1`,
    )
    .bind(key, windowStart)
    .run();
  await db
    .prepare(`DELETE FROM rate_limits WHERE window_start < ?1`)
    .bind(nowMs - 3_600_000)
    .run();

  const row = await db
    .prepare(`SELECT count FROM rate_limits WHERE key = ?1 AND window_start = ?2`)
    .bind(key, windowStart)
    .first<{ count: number }>();

  const count = row?.count ?? 1;
  if (count > maxRequests) {
    const resetAt = windowStart + windowSeconds * 1000;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - nowMs) / 1000)) };
  }
  return { allowed: true };
}

/** Honeypot: real users never fill this; bots do. Field name intentionally bland. */
export function honeypotTripped(formData: FormData): boolean {
  const value = formData.get("website");
  return typeof value === "string" && value.length > 0;
}

/**
 * Fast pre-check from the declared `Content-Length`. This alone is not a
 * real limit: a request sent without that header (e.g. chunked transfer)
 * always passes it. Use `readBoundedBody`/`boundedJson`/`boundedFormData`
 * for the authoritative, stream-enforced cap; keep this only as a cheap
 * early reject when the client honestly declares an oversized body.
 */
export function bodyTooLarge(request: Request, maxBytes: number): boolean {
  const raw = request.headers.get("content-length");
  if (raw === null) return false;
  if (!/^\d+$/.test(raw)) return true;
  const contentLength = Number(raw);
  return !Number.isSafeInteger(contentLength) || contentLength > maxBytes;
}

/** Sentinel distinguishing "body exceeded the limit" from "body was malformed". */
export const TOO_LARGE = Symbol("too_large");

/**
 * Reads a request body while enforcing `maxBytes` regardless of what (or
 * whether) `Content-Length` declares — closes the gap where a chunked
 * request with no/understated `Content-Length` would otherwise bypass
 * `bodyTooLarge` and get buffered in full by `formData()`/`json()`.
 * Returns `TOO_LARGE` if the real body exceeds the limit.
 */
export async function readBoundedBody(request: Request, maxBytes: number): Promise<ArrayBuffer | typeof TOO_LARGE> {
  const reader = request.body?.getReader();
  if (!reader) return new ArrayBuffer(0);

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return TOO_LARGE;
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

/** Bounded `request.json()` replacement. Returns `TOO_LARGE` on overflow, `null` on invalid JSON. */
export async function boundedJson<T = unknown>(request: Request, maxBytes: number): Promise<T | null | typeof TOO_LARGE> {
  const buffer = await readBoundedBody(request, maxBytes);
  if (buffer === TOO_LARGE) return TOO_LARGE;
  try {
    return JSON.parse(new TextDecoder().decode(buffer)) as T;
  } catch {
    return null;
  }
}

/** Bounded `request.formData()` replacement. Returns `TOO_LARGE` on overflow, `null` on invalid form data. */
export async function boundedFormData(request: Request, maxBytes: number): Promise<FormData | null | typeof TOO_LARGE> {
  const buffer = await readBoundedBody(request, maxBytes);
  if (buffer === TOO_LARGE) return TOO_LARGE;
  try {
    return await new Response(buffer, { headers: request.headers }).formData();
  } catch {
    return null;
  }
}

/**
 * Sniff magic bytes — never trust a client-declared Content-Type.
 * Supported: JPEG (FFD8FF), PNG (89504E47), WebP (RIFF....WEBP).
 */
export function sniffImageType(bytes: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}
