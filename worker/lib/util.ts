/**
 * Shared types and utilities for the inapmu.com API worker.
 */
export type Bindings = {
  DB: D1Database;
  MEDIA: R2Bucket;
  ENVIRONMENT: string;
};

/** Milliseconds since epoch. Durable contract: used by auth + worker index. */
export const now = (): number => Date.now();

/** FNV-1a hash — lightweight IP fingerprint for rate limiting (not a secret). */
export function fingerprint(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Extract client IP from Cloudflare headers with fallbacks. */
export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "0.0.0.0"
  );
}

/** Validate Indonesian E.164 phone: 62 + 8-12 digits, or 08 converted upstream. */
export function isValidPhone(phone: string): boolean {
  return /^62\d{8,12}$/.test(phone);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

/** Reject control chars, HTML delimiters, and overlong strings. */
export function isSafeText(value: string, max: number): boolean {
  return value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f<>]/.test(value);
}

export const ALLOWED_PROPERTY_TYPES = ["kos", "kontrakan", "vila"] as const;
export const ALLOWED_PERIODS = ["malam", "bulan", "tahun"] as const;
