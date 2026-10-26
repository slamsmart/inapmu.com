/**
 * inapmu.com API worker — Hono routes backed by Cloudflare D1 + R2.
 *
 * Security layers (defense in depth):
 *  1. Cloudflare WAF/Turnstile at edge (configured in dashboard) + server-side Turnstile verify here
 *  2. Per-IP + per-endpoint rate limiting (D1 fixed window)
 *  3. Honeypot field on public forms
 *  4. Strict input validation (type/length/charset/enum)
 *  5. Upload magic-byte sniffing + size caps (never trust Content-Type)
 *  6. Prepared statements everywhere (SQL injection safe)
 *  7. PBKDF2 password hashing, HMAC-signed session tokens
 *  8. CORS locked to configured origin, no credentials on public routes
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { createSessionToken, hashPassword, readSessionToken, verifyPassword } from "./lib/auth";
import {
  bodyTooLarge,
  honeypotTripped,
  rateLimit,
  sniffImageType,
  verifyTurnstile,
} from "./lib/security";
import {
  ALLOWED_PERIODS,
  ALLOWED_PROPERTY_TYPES,
  clientIp,
  fingerprint,
  isSafeText,
  isValidEmail,
  isValidPhone,
  now,
  type Bindings,
} from "./lib/util";

const app = new Hono<{ Bindings: Bindings & { TURNSTILE_SECRET_KEY?: string; SESSION_SECRET?: string } }>();

app.use("*", secureHeaders());
app.use(
  "/api/*",
  cors({
    origin: (origin) => (origin && origin.endsWith("inapmu.com")) || origin?.includes("localhost") ? origin : null,
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 86400,
  }),
);

// ---------------------------------------------------------------------------
// Shared guards
// ---------------------------------------------------------------------------

type GuardError = { status: number; body: Record<string, unknown> };

async function guard(
  c: { env: { ENVIRONMENT: string; TURNSTILE_SECRET_KEY?: string }; req: { raw: Request } },
  routeKey: string,
  opts: { maxRequests: number; windowSeconds: number; turnstileToken?: string; maxBodyBytes?: number },
): Promise<GuardError | null> {
  const ip = clientIp(c.req.raw);
  const ipHash = fingerprint(ip);

  const limit = await rateLimit(c.env.DB ?? ({} as D1Database), `${routeKey}:${ipHash}`, opts.windowSeconds, opts.maxRequests);
  if (!limit.allowed) {
    return { status: 429, body: { error: "rate_limited", retryAfter: limit.retryAfterSeconds } };
  }

  if (bodyTooLarge(c.req.raw, opts.maxBodyBytes ?? 64_000)) {
    return { status: 413, body: { error: "payload_too_large" } };
  }

  const turnstile = await verifyTurnstile(c.env, opts.turnstileToken, ip);
  if (!turnstile.ok) {
    return { status: 403, body: { error: "bot_suspected", reason: turnstile.reason } };
  }
  return null;
}

function errorResponse(c: { status: (code: number) => void; json: (body: unknown, status?: number) => Response }, status: number, body: Record<string, unknown>): Response {
  return c.json(body, status);
}

const TOO_MANY = { error: "rate_limited" } as const;

// ---------------------------------------------------------------------------
// Public: partner registration
// ---------------------------------------------------------------------------

const partnerSchema = (data: FormData) => {
  const rawPhone = String(data.get("phone") ?? "").replace(/\D/g, "");
  const phone = rawPhone.startsWith("0") ? `62${rawPhone.slice(1)}` : rawPhone;
  return {
    fullName: String(data.get("fullName") ?? "").trim(),
    email: String(data.get("email") ?? "").trim().toLowerCase(),
    phone,
    propertyName: String(data.get("propertyName") ?? "").trim(),
    city: String(data.get("city") ?? "").trim(),
    propertyType: String(data.get("propertyType") ?? ""),
  };
};

app.post("/api/partners/apply", async (c) => {
  const formData = await c.req.raw.formData().catch(() => null);
  if (!formData) return errorResponse(c, 400, { error: "invalid_form" });

  if (honeypotTripped(formData)) {
    // Pretend success to not tip off bots; log nothing.
    return c.json({ ok: true }, 202);
  }

  const blocked = await guard(c, "partner-apply", {
    maxRequests: 5,
    windowSeconds: 3600,
    turnstileToken: formData.get("cf-turnstile-response")?.toString(),
  });
  if (blocked) return errorResponse(c, blocked.status, blocked.body);

  const input = partnerSchema(formData);
  if (
    !isSafeText(input.fullName, 120) ||
    !isValidEmail(input.email) ||
    !isValidPhone(input.phone) ||
    !isSafeText(input.propertyName, 160) ||
    !isSafeText(input.city, 120) ||
    !(ALLOWED_PROPERTY_TYPES as readonly string[]).includes(input.propertyType)
  ) {
    return errorResponse(c, 422, { error: "validation_failed" });
  }

  const ipHash = fingerprint(clientIp(c.req.raw));
  // Duplicate submission within 24h from same IP + email is ignored.
  const recent = await c.env.DB.prepare(
    `SELECT id FROM partners WHERE ip_hash = ?1 AND email = ?2 AND created_at > ?3 LIMIT 1`,
  )
    .bind(ipHash, input.email, now() - 86_400_000)
    .first<{ id: number }>();
  if (recent) return c.json({ ok: true, duplicate: true }, 200);

  const result = await c.env.DB.prepare(
    `INSERT INTO partners (full_name, email, phone, property_name, city, property_type, ip_hash, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  )
    .bind(input.fullName, input.email, input.phone, input.propertyName, input.city, input.propertyType, ipHash, now())
    .run();

  return c.json({ ok: true, id: result.meta.last_row_id }, 201);
});

// ---------------------------------------------------------------------------
// Public: listing creation (with photo upload to R2)
// ---------------------------------------------------------------------------

const MAX_PHOTOS = 8;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_LISTING_BODY_BYTES = 45 * 1024 * 1024; // photos dominate

app.post("/api/listings", async (c) => {
  const formData = await c.req.raw.formData().catch(() => null);
  if (!formData) return errorResponse(c, 400, { error: "invalid_form" });

  if (honeypotTripped(formData)) return c.json({ ok: true }, 202);

  const blocked = await guard(c, "listing-create", {
    maxRequests: 10,
    windowSeconds: 3600,
    turnstileToken: formData.get("cf-turnstile-response")?.toString(),
    maxBodyBytes: MAX_LISTING_BODY_BYTES,
  });
  if (blocked) return errorResponse(c, blocked.status, blocked.body);

  const title = String(formData.get("title") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const city = String(formData.get("city") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const price = Number(formData.get("price"));
  const period = String(formData.get("period") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const mapsUrl = String(formData.get("mapsUrl") ?? "").trim();

  if (
    !isSafeText(title, 160) ||
    !(["Kos", "Kontrakan", "Vila"] as readonly string[]).includes(type) ||
    !isSafeText(city, 120) ||
    (address && !isSafeText(address, 240)) ||
    !Number.isInteger(price) ||
    price <= 0 ||
    price > 10_000_000_000 ||
    !(ALLOWED_PERIODS as readonly string[]).includes(period) ||
    description.length < 50 ||
    description.length > 4000 ||
    /[\u0000-\u001f\u007f]/.test(description) ||
    (mapsUrl && !/^https:\/\/(www\.)?(google\.[a-z.]+|maps\.app\.goo\.gl|maps\.google\.com)\//.test(mapsUrl))
  ) {
    return errorResponse(c, 422, { error: "validation_failed" });
  }

  // Photos: sniff bytes, cap size/count. Keys are unguessable; type from sniffing.
  const photos = formData.getAll("photos").filter((v): v is File => v instanceof File && v.size > 0);
  if (photos.length > MAX_PHOTOS) return errorResponse(c, 422, { error: "too_many_photos" });

  const photoKeys: string[] = [];
  for (const photo of photos) {
    if (photo.size > MAX_PHOTO_BYTES) return errorResponse(c, 413, { error: "photo_too_large" });
    const buffer = new Uint8Array(await photo.arrayBuffer());
    const sniffed = sniffImageType(buffer);
    if (!sniffed) return errorResponse(c, 415, { error: "unsupported_media" });
    const key = `listings/${crypto.randomUUID()}.${sniffed}`;
    await c.env.MEDIA.put(key, buffer, {
      httpMetadata: { contentType: `image/${sniffed}`, cacheControl: "public, max-age=31536000, immutable" },
    });
    photoKeys.push(key);
  }

  const ipHash = fingerprint(clientIp(c.req.raw));
  const result = await c.env.DB.prepare(
    `INSERT INTO listings (title, type, city, address, price, period, description, maps_url, cover_image_key, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
  )
    .bind(title, type, city, address || null, price, period, description, mapsUrl || null, photoKeys[0] ?? null, now())
    .run();

  const listingId = result.meta.last_row_id;
  for (const [position, key] of photoKeys.entries()) {
    await c.env.DB.prepare(`INSERT INTO listing_photos (listing_id, object_key, position) VALUES (?1, ?2, ?3)`)
      .bind(listingId, key, position)
      .run();
  }

  return c.json({ ok: true, id: listingId }, 201);
});

// ---------------------------------------------------------------------------
// Public: KTP verification upload
// ---------------------------------------------------------------------------

app.post("/api/verifications", async (c) => {
  const formData = await c.req.raw.formData().catch(() => null);
  if (!formData) return errorResponse(c, 400, { error: "invalid_form" });

  if (honeypotTripped(formData)) return c.json({ ok: true }, 202);

  const blocked = await guard(c, "ktp-verify", {
    maxRequests: 3,
    windowSeconds: 3600,
    turnstileToken: formData.get("cf-turnstile-response")?.toString(),
    maxBodyBytes: 6 * 1024 * 1024,
  });
  if (blocked) return errorResponse(c, blocked.status, blocked.body);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const ktp = formData.get("ktp");
  if (!isValidEmail(email) || !(ktp instanceof File) || ktp.size === 0 || ktp.size > MAX_PHOTO_BYTES) {
    return errorResponse(c, 422, { error: "validation_failed" });
  }

  const buffer = new Uint8Array(await ktp.arrayBuffer());
  const sniffed = sniffImageType(buffer);
  if (!sniffed) return errorResponse(c, 415, { error: "unsupported_media" });

  const key = `ktp/${crypto.randomUUID()}.${sniffed}`;
  await c.env.MEDIA.put(key, buffer, {
    httpMetadata: { contentType: `image/${sniffed}` },
    // KTP is sensitive: never served publicly; private bucket access only.
  });

  await c.env.DB.prepare(`INSERT INTO verifications (partner_email, ktp_object_key, created_at) VALUES (?1, ?2, ?3)`)
    .bind(email, key, now())
    .run();

  return c.json({ ok: true }, 201);
});

// ---------------------------------------------------------------------------
// Public: read approved listings (marketplace feed)
// ---------------------------------------------------------------------------

app.get("/api/listings", async (c) => {
  const city = (c.req.query("city") ?? "").trim().toLowerCase().slice(0, 120);
  const limitRaw = Number(c.req.query("limit") ?? "100");
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 200 ? limitRaw : 100;

  const rows = city
    ? await c.env.DB.prepare(
        `SELECT id, title, type, city, price, period, description, maps_url, cover_image_key, created_at
         FROM listings WHERE status = 'approved' AND lower(city) LIKE ?1 ORDER BY created_at DESC LIMIT ?2`,
      )
      .bind(`%${city.replace(/[%_]/g, (m) => `\\${m}`)}%`, limit)
      .all()
    : await c.env.DB.prepare(
        `SELECT id, title, type, city, price, period, description, maps_url, cover_image_key, created_at
         FROM listings WHERE status = 'approved' ORDER BY created_at DESC LIMIT ?1`,
      )
      .bind(limit)
      .all();

  return c.json({ listings: rows.results });
});

// Public: media proxy from R2 (images only, immutable cache).
app.get("/media/*", async (c) => {
  const key = c.req.path.replace(/^\/media\//, "");
  if (!/^[\w/.-]+$/.test(key) || key.includes("..")) return errorResponse(c, 400, { error: "invalid_key" });
  if (key.startsWith("ktp/")) return errorResponse(c, 403, { error: "forbidden" }); // never expose KTP

  const object = await c.env.MEDIA.get(key);
  if (!object) return errorResponse(c, 404, { error: "not_found" });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
});

// ---------------------------------------------------------------------------
// Auth: register / login / me
// ---------------------------------------------------------------------------

const MAX_AUTH_BODY = 8_000;

app.post("/api/auth/register", async (c) => {
  if (bodyTooLarge(c.req.raw, MAX_AUTH_BODY)) return errorResponse(c, 413, { error: "payload_too_large" });

  const ipHash = fingerprint(clientIp(c.req.raw));
  const limit = await rateLimit(c.env.DB, `auth-register:${ipHash}`, 3600, 5);
  if (!limit.allowed) return c.json({ ...TOO_MANY, retryAfter: limit.retryAfterSeconds }, 429);

  const body = await c.req.raw.json().catch(() => null);
  if (!body) return errorResponse(c, 400, { error: "invalid_json" });

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();
  if (!isValidEmail(email) || password.length < 8 || password.length > 200 || (name && !isSafeText(name, 120))) {
    return errorResponse(c, 422, { error: "validation_failed" });
  }

  const existing = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ?1`).bind(email).first<{ id: number }>();
  if (existing) return errorResponse(c, 409, { error: "email_taken" });

  const passwordHash = await hashPassword(password);
  const ts = now();
  const result = await c.env.DB.prepare(
    `INSERT INTO users (email, name, password_hash, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(email, name || null, passwordHash, ts, ts)
    .run();

  return c.json({ ok: true, id: result.meta.last_row_id }, 201);
});

app.post("/api/auth/login", async (c) => {
  if (bodyTooLarge(c.req.raw, MAX_AUTH_BODY)) return errorResponse(c, 413, { error: "payload_too_large" });

  const ipHash = fingerprint(clientIp(c.req.raw));
  // Brute-force defense: 10 attempts / 15 min / IP.
  const limit = await rateLimit(c.env.DB, `auth-login:${ipHash}`, 900, 10);
  if (!limit.allowed) return c.json({ ...TOO_MANY, retryAfter: limit.retryAfterSeconds }, 429);

  const body = await c.req.raw.json().catch(() => null);
  if (!body) return errorResponse(c, 400, { error: "invalid_json" });

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!isValidEmail(email) || password.length === 0 || password.length > 200) {
    return errorResponse(c, 422, { error: "validation_failed" });
  }

  const user = await c.env.DB.prepare(`SELECT id, email, name, password_hash FROM users WHERE email = ?1`)
    .bind(email)
    .first<{ id: number; email: string; name: string | null; password_hash: string }>();
  const ok = user ? await verifyPassword(password, user.password_hash) : false;
  if (!user || !ok) return errorResponse(c, 401, { error: "invalid_credentials" });

  const secret = c.env.SESSION_SECRET ?? "dev-insecure-session-secret";
  const token = await createSessionToken(secret, { userId: user.id, email: user.email, issuedAt: now() }, 60 * 60 * 24 * 7);
  return c.json({ ok: true, token, user: { id: user.id, email: user.email, name: user.name } }, 200);
});

app.get("/api/auth/me", async (c) => {
  const auth = c.req.header("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return errorResponse(c, 401, { error: "unauthorized" });
  const secret = c.env.SESSION_SECRET ?? "dev-insecure-session-secret";
  const session = await readSessionToken(secret, auth.slice(7), 60 * 60 * 24 * 7);
  if (!session) return errorResponse(c, 401, { error: "unauthorized" });

  const user = await c.env.DB.prepare(`SELECT id, email, name, role, created_at FROM users WHERE id = ?1`)
    .bind(session.userId)
    .first();
  if (!user) return errorResponse(c, 401, { error: "unauthorized" });
  return c.json({ user }, 200);
});

// Health check for deployment verification.
app.get("/api/health", (c) => c.json({ ok: true, env: c.env.ENVIRONMENT, time: now() }));

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error("unhandled", err);
  return c.json({ error: "internal_error" }, 500);
});

export default app;
