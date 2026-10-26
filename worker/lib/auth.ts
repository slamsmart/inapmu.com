/**
 * Password hashing with PBKDF2-SHA256 via WebCrypto (Workers-compatible).
 * Format: pbkdf2$<iterations>$<salt-b64>$<hash-b64>
 */
import { now } from "./util";

const PBKDF2_ITERATIONS = 100_000;
const HASH_LENGTH_BYTES = 32;

function toBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    keyMaterial,
    HASH_LENGTH_BYTES,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000_000) return false;
  const salt = fromBase64(parts[2]);
  const expected = fromBase64(parts[3]);
  const derived = new Uint8Array(await pbkdf2(password, salt, iterations));
  if (derived.length !== expected.length) return false;
  // Constant-time comparison.
  let mismatch = 0;
  for (let i = 0; i < derived.length; i++) mismatch |= derived[i] ^ expected[i];
  return mismatch === 0;
}

export type SessionPayload = { userId: number; email: string; issuedAt: number };

/**
 * HMAC-signed stateless session token (compact JWT-like, HS-256 shape):
 * base64url(payload).base64url(hmac)
 */
export async function createSessionToken(
  secret: string,
  payload: SessionPayload,
  ttlSeconds: number,
): Promise<string> {
  const body: SessionPayload = { ...payload, issuedAt: now() };
  const payloadB64 = toBase64(new TextEncoder().encode(JSON.stringify(body)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${toBase64(signature)}`;
}

export async function readSessionToken(
  secret: string,
  token: string,
  ttlSeconds: number,
): Promise<SessionPayload | null> {
  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const payloadB64 = token.slice(0, dot);
  const signatureB64 = token.slice(dot + 1);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64(signatureB64) as BufferSource,
      new TextEncoder().encode(payloadB64),
    );
  } catch {
    return null;
  }
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64(payloadB64))) as SessionPayload;
    if (now() - payload.issuedAt > ttlSeconds * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}
