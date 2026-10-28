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
import { Hono, type Context } from "hono";
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
import { createInvoice, findQrisPayload, MayarApiError, redactPayload, safeMayarLink, type MayarConfig } from "./lib/mayar";
import {
  activePlan,
  ORDER_TTL_MS,
  PAID_PLANS,
  PLAN_LABEL,
  planAmount,
  settleOrder,
  settlePendingOrders,
  timingSafeEqual,
  type OrderRow,
  type PaidPlan,
} from "./lib/billing";

type AppBindings = Bindings & {
  TURNSTILE_SECRET_KEY?: string;
  SESSION_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  MAYAR_API_KEY?: string;
  MAYAR_ENV?: string;
  MAYAR_WEBHOOK_SECRET?: string;
  /** Local testing only (e.g. "1000"). Never set in production. */
  MAYAR_TEST_AMOUNT?: string;
};
type AppContext = Context<{ Bindings: AppBindings }>;
type AuthenticatedUser = { id: number; email: string; name: string | null; role: string };

const app = new Hono<{ Bindings: AppBindings }>();

const ALLOWED_ORIGINS = new Set(["https://inapmu.com", "https://www.inapmu.com"]);

function allowedOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol === "https:" && ALLOWED_ORIGINS.has(url.origin)) return url.origin;
    if (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]")
    ) {
      return url.origin;
    }
  } catch {
    // Invalid Origin headers are not trusted.
  }
  return null;
}

app.use("*", secureHeaders());
app.use(
  "/api/*",
  cors({
    origin: (origin) => allowedOrigin(origin),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
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

function errorResponse(c: AppContext, status: number, body: Record<string, unknown>): Response {
  return c.json(body, status);
}

function sessionSecret(c: AppContext): string | null {
  const secret = c.env.SESSION_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("Cookie")?.split(";") ?? [];
  const prefix = `${name}=`;
  const value = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : null;
}

function cookieScope(request: Request): string {
  const url = new URL(request.url);
  const domain = url.hostname === "inapmu.com" || url.hostname.endsWith(".inapmu.com") ? "; Domain=inapmu.com" : "";
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${domain}${secure}`;
}

function sessionCookie(request: Request, token: string): string {
  return `inapmu_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${cookieScope(request)}`;
}

function clearOAuthStateCookie(request: Request): string {
  return `inapmu_oauth_state=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${cookieScope(request)}`;
}

function redirectResponse(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location });
  cookies.forEach((cookie) => headers.append("Set-Cookie", cookie));
  return new Response(null, { status: 302, headers });
}

/**
 * Where the browser lands after Google sign-in. Uses the origin of the
 * configured callback (inapmu.com in production, the Vite origin locally),
 * because behind the dev proxy c.req.url points at the API worker itself.
 */
function appOrigin(c: AppContext): string {
  const configured = c.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through to the request origin
    }
  }
  return new URL(c.req.url).origin;
}

function oauthResultRedirect(c: AppContext, result: "success" | "error", reason?: string, cookies: string[] = []): Response {
  if (result === "error") console.warn("google oauth rejected", { reason: reason ?? "unknown" });
  const target = new URL("/", appOrigin(c));
  target.searchParams.set("oauth", result);
  if (reason) target.searchParams.set("reason", reason);
  return redirectResponse(target.toString(), cookies);
}

function googleConfig(c: AppContext): { clientId: string; clientSecret: string; redirectUri: string } | null {
  const clientId = c.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = c.env.GOOGLE_REDIRECT_URI?.trim() || `${new URL(c.req.url).origin}/api/auth/google/callback`;
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function authenticate(c: AppContext): Promise<AuthenticatedUser | Response> {
  const secret = sessionSecret(c);
  if (!secret) return errorResponse(c, 503, { error: "auth_unavailable" });

  const authorization = c.req.header("Authorization") ?? "";
  const token = authorization
    ? /^Bearer [^\s]+$/.test(authorization) ? authorization.slice(7) : null
    : cookieValue(c.req.raw, "inapmu_session");
  if (!token) return errorResponse(c, 401, { error: "unauthorized" });

  const session = await readSessionToken(secret, token, 60 * 60 * 24 * 7);
  if (!session) return errorResponse(c, 401, { error: "unauthorized" });

  const user = await c.env.DB.prepare(`SELECT id, email, name, role FROM users WHERE id = ?1`)
    .bind(session.userId)
    .first<AuthenticatedUser>();
  if (!user) return errorResponse(c, 401, { error: "unauthorized" });
  return user;
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
  if (bodyTooLarge(c.req.raw, 64_000)) return errorResponse(c, 413, { error: "payload_too_large" });
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
  if (bodyTooLarge(c.req.raw, MAX_LISTING_BODY_BYTES)) {
    return errorResponse(c, 413, { error: "payload_too_large" });
  }
  const authenticated = await authenticate(c);
  if (authenticated instanceof Response) return authenticated;

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

  const photoPayloads: { buffer: Uint8Array; type: "jpeg" | "png" | "webp" }[] = [];
  for (const photo of photos) {
    if (photo.size > MAX_PHOTO_BYTES) return errorResponse(c, 413, { error: "photo_too_large" });
    const buffer = new Uint8Array(await photo.arrayBuffer());
    const sniffed = sniffImageType(buffer);
    if (!sniffed) return errorResponse(c, 415, { error: "unsupported_media" });
    photoPayloads.push({ buffer, type: sniffed });
  }

  const photoKeys: string[] = [];
  try {
    for (const photo of photoPayloads) {
      const key = `listings/${crypto.randomUUID()}.${photo.type}`;
      await c.env.MEDIA.put(key, photo.buffer, {
        httpMetadata: { contentType: `image/${photo.type}`, cacheControl: "public, max-age=31536000, immutable" },
      });
      photoKeys.push(key);
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO listings (owner_user_id, title, type, city, address, price, period, description, maps_url, cover_image_key, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
    )
      .bind(authenticated.id, title, type, city, address || null, price, period, description, mapsUrl || null, photoKeys[0] ?? null, now())
      .run();

    const listingId = result.meta.last_row_id;
    for (const [position, key] of photoKeys.entries()) {
      await c.env.DB.prepare(`INSERT INTO listing_photos (listing_id, object_key, position) VALUES (?1, ?2, ?3)`)
        .bind(listingId, key, position)
        .run();
    }

    return c.json({ ok: true, id: listingId }, 201);
  } catch (error) {
    await Promise.all(photoKeys.map((key) => c.env.MEDIA.delete(key).catch(() => undefined)));
    throw error;
  }
});

// ---------------------------------------------------------------------------
// Public: KTP verification upload
// ---------------------------------------------------------------------------

app.post("/api/verifications", async (c) => {
  if (bodyTooLarge(c.req.raw, 6 * 1024 * 1024)) {
    return errorResponse(c, 413, { error: "payload_too_large" });
  }
  const authenticated = await authenticate(c);
  if (authenticated instanceof Response) return authenticated;

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

  const ktp = formData.get("ktp");
  if (!(ktp instanceof File) || ktp.size === 0 || ktp.size > MAX_PHOTO_BYTES) {
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

  try {
    await c.env.DB.prepare(`INSERT INTO verifications (user_id, partner_email, ktp_object_key, created_at) VALUES (?1, ?2, ?3, ?4)`)
      .bind(authenticated.id, authenticated.email, key, now())
      .run();
  } catch (error) {
    await c.env.MEDIA.delete(key).catch(() => undefined);
    throw error;
  }

  return c.json({ ok: true }, 201);
});

// ---------------------------------------------------------------------------
// Public: read approved listings (marketplace feed)
// ---------------------------------------------------------------------------

app.get("/api/listings", async (c) => {
  const readLimit = await rateLimit(c.env.DB, `listing-read:${fingerprint(clientIp(c.req.raw))}`, 60, 60);
  if (!readLimit.allowed) return c.json({ ...TOO_MANY, retryAfter: readLimit.retryAfterSeconds }, 429);

  const city = (c.req.query("city") ?? "").trim().toLowerCase().slice(0, 120);
  const limitRaw = Number(c.req.query("limit") ?? "100");
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 200 ? limitRaw : 100;

  // `plan` is the owner's currently active plan (drives Trusted badges and the Platinum hero slider).
  const listingColumns = `l.id, l.title, l.type, l.city, l.price, l.period, l.description, l.maps_url, l.cover_image_key, l.created_at,
           CASE WHEN u.plan IN ('gold', 'platinum') AND u.plan_expires_at > ?1 THEN u.plan ELSE 'free' END AS plan`;
  const rows = city
    ? await c.env.DB.prepare(
        `SELECT ${listingColumns}
         FROM listings l LEFT JOIN users u ON u.id = l.owner_user_id
         WHERE l.status = 'approved' AND lower(l.city) LIKE ?2 ORDER BY l.created_at DESC LIMIT ?3`,
      )
      .bind(now(), `%${city.replace(/[%_]/g, (m) => `\\${m}`)}%`, limit)
      .all()
    : await c.env.DB.prepare(
        `SELECT ${listingColumns}
         FROM listings l LEFT JOIN users u ON u.id = l.owner_user_id
         WHERE l.status = 'approved' ORDER BY l.created_at DESC LIMIT ?2`,
      )
      .bind(now(), limit)
      .all();

  return c.json({ listings: rows.results });
});

// Public: media proxy from R2 (images only, immutable cache).
app.get("/media/*", async (c) => {
  const key = c.req.path.replace(/^\/media\//, "");
  if (!/^listings\/[A-Za-z0-9_-]{1,128}\.(jpeg|png|webp)$/.test(key)) {
    return errorResponse(c, 404, { error: "not_found" });
  }

  const approved = await c.env.DB.prepare(
    `SELECT 1 FROM listing_photos lp JOIN listings l ON l.id = lp.listing_id
     WHERE lp.object_key = ?1 AND l.status = 'approved' LIMIT 1`,
  )
    .bind(key)
    .first();
  if (!approved) return errorResponse(c, 404, { error: "not_found" });

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

app.get("/api/auth/google/start", async (c) => {
  const config = googleConfig(c);
  if (!config) return oauthResultRedirect(c, "error", "google_not_configured");

  const limit = await rateLimit(c.env.DB, `auth-google:${fingerprint(clientIp(c.req.raw))}`, 900, 10);
  if (!limit.allowed) return oauthResultRedirect(c, "error", "rate_limited");

  const state = crypto.randomUUID();
  const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizeUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();

  const stateCookie = `inapmu_oauth_state=${encodeURIComponent(state)}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${cookieScope(c.req.raw)}`;
  return redirectResponse(authorizeUrl.toString(), [stateCookie]);
});

app.get("/api/auth/google/callback", async (c) => {
  const config = googleConfig(c);
  const clearState = clearOAuthStateCookie(c.req.raw);
  if (!config) return oauthResultRedirect(c, "error", "google_not_configured", [clearState]);

  const providerError = c.req.query("error");
  if (providerError) {
    return oauthResultRedirect(c, "error", providerError === "access_denied" ? "access_denied" : "google_denied", [clearState]);
  }

  const state = c.req.query("state");
  const savedState = cookieValue(c.req.raw, "inapmu_oauth_state");
  if (!state || !savedState || state !== savedState) {
    return oauthResultRedirect(c, "error", "invalid_state", [clearState]);
  }

  const code = c.req.query("code");
  if (!code || code.length > 4096) return oauthResultRedirect(c, "error", "missing_code", [clearState]);

  try {
    const secret = sessionSecret(c);
    if (!secret) return oauthResultRedirect(c, "error", "auth_unavailable", [clearState]);

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenBody: unknown = await tokenResponse.json().catch(() => null);
    const idToken = isRecord(tokenBody) && typeof tokenBody.id_token === "string" ? tokenBody.id_token : null;
    if (!tokenResponse.ok || !idToken) {
      // Google's error code only (e.g. invalid_client, redirect_uri_mismatch); never the response body.
      const googleError = isRecord(tokenBody) && typeof tokenBody.error === "string" ? tokenBody.error.slice(0, 60) : `http_${tokenResponse.status}`;
      console.warn("google token exchange failed", { googleError });
      return oauthResultRedirect(c, "error", "token_exchange_failed", [clearState]);
    }

    const claimsResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    const claimsBody: unknown = await claimsResponse.json().catch(() => null);
    if (!claimsResponse.ok || !isRecord(claimsBody)) return oauthResultRedirect(c, "error", "invalid_google_token", [clearState]);

    const subject = typeof claimsBody.sub === "string" ? claimsBody.sub : "";
    const email = typeof claimsBody.email === "string" ? claimsBody.email.trim().toLowerCase() : "";
    const audience = typeof claimsBody.aud === "string" ? claimsBody.aud : "";
    const issuer = typeof claimsBody.iss === "string" ? claimsBody.iss : "";
    const emailVerified = claimsBody.email_verified === true || claimsBody.email_verified === "true";
    if (
      !/^[A-Za-z0-9_-]{1,255}$/.test(subject) ||
      !isValidEmail(email) ||
      audience !== config.clientId ||
      !["accounts.google.com", "https://accounts.google.com"].includes(issuer) ||
      !emailVerified
    ) {
      return oauthResultRedirect(c, "error", "invalid_google_identity", [clearState]);
    }

    const rawName = typeof claimsBody.name === "string" ? claimsBody.name.trim().slice(0, 120) : "";
    const name = isSafeText(rawName, 120) ? rawName : email.split("@")[0];
    const existingBySubject = await c.env.DB.prepare(
      `SELECT id, email, name, google_subject FROM users WHERE google_subject = ?1 LIMIT 1`,
    )
      .bind(subject)
      .first<{ id: number; email: string; name: string | null; google_subject: string | null }>();

    let userId: number;
    if (existingBySubject) {
      userId = existingBySubject.id;
      await c.env.DB.prepare(`UPDATE users SET email = ?1, name = COALESCE(name, ?2), updated_at = ?3 WHERE id = ?4`)
        .bind(email, name, now(), userId)
        .run();
    } else {
      const existingByEmail = await c.env.DB.prepare(
        `SELECT id, email, name, google_subject FROM users WHERE email = ?1 LIMIT 1`,
      )
        .bind(email)
        .first<{ id: number; email: string; name: string | null; google_subject: string | null }>();

      if (existingByEmail?.google_subject && existingByEmail.google_subject !== subject) {
        return oauthResultRedirect(c, "error", "google_account_conflict", [clearState]);
      }

      if (existingByEmail) {
        userId = existingByEmail.id;
        await c.env.DB.prepare(
          `UPDATE users SET google_subject = ?1, provider = 'google', name = COALESCE(name, ?2), updated_at = ?3 WHERE id = ?4`,
        )
          .bind(subject, name, now(), userId)
          .run();
      } else {
        const created = await c.env.DB.prepare(
          `INSERT INTO users (email, name, password_hash, provider, created_at, updated_at, google_subject)
           VALUES (?1, ?2, ?3, 'google', ?4, ?5, ?6)`,
        )
          .bind(email, name, `google:${crypto.randomUUID()}`, now(), now(), subject)
          .run();
        userId = created.meta.last_row_id;
      }
    }

    const token = await createSessionToken(secret, { userId, email, issuedAt: now() }, 60 * 60 * 24 * 7);
    return oauthResultRedirect(c, "success", undefined, [clearState, sessionCookie(c.req.raw, token)]);
  } catch (error) {
    console.error("google oauth callback failed", error);
    return oauthResultRedirect(c, "error", "google_callback_failed", [clearState]);
  }
});

app.post("/api/auth/register", async (c) => {
  if (bodyTooLarge(c.req.raw, MAX_AUTH_BODY)) return errorResponse(c, 413, { error: "payload_too_large" });
  const secret = sessionSecret(c);
  if (!secret) return errorResponse(c, 503, { error: "auth_unavailable" });

  const ipHash = fingerprint(clientIp(c.req.raw));
  const limit = await rateLimit(c.env.DB, `auth-register:${ipHash}`, 3600, 5);
  if (!limit.allowed) return c.json({ ...TOO_MANY, retryAfter: limit.retryAfterSeconds }, 429);

  const body = await c.req.raw.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse(c, 400, { error: "invalid_json" });

  const turnstile = await verifyTurnstile(c.env, typeof body.cfTurnstileResponse === "string" ? body.cfTurnstileResponse : undefined, clientIp(c.req.raw));
  if (!turnstile.ok) return errorResponse(c, 403, { error: "bot_suspected", reason: turnstile.reason });

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();
  if (!isValidEmail(email) || password.length < 12 || password.length > 200 || (name && !isSafeText(name, 120))) {
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
  const secret = sessionSecret(c);
  if (!secret) return errorResponse(c, 503, { error: "auth_unavailable" });

  const ipHash = fingerprint(clientIp(c.req.raw));
  // Brute-force defense: 10 attempts / 15 min / IP.
  const limit = await rateLimit(c.env.DB, `auth-login:${ipHash}`, 900, 10);
  if (!limit.allowed) return c.json({ ...TOO_MANY, retryAfter: limit.retryAfterSeconds }, 429);

  const body = await c.req.raw.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse(c, 400, { error: "invalid_json" });

  const turnstile = await verifyTurnstile(c.env, typeof body.cfTurnstileResponse === "string" ? body.cfTurnstileResponse : undefined, clientIp(c.req.raw));
  if (!turnstile.ok) return errorResponse(c, 403, { error: "bot_suspected", reason: turnstile.reason });

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

  const token = await createSessionToken(secret, { userId: user.id, email: user.email, issuedAt: now() }, 60 * 60 * 24 * 7);
  c.header("Set-Cookie", sessionCookie(c.req.raw, token));
  return c.json({ ok: true, token, user: { id: user.id, email: user.email, name: user.name } }, 200);
});

app.get("/api/auth/me", async (c) => {
  const authenticated = await authenticate(c);
  if (authenticated instanceof Response) return authenticated;

  const user = await c.env.DB.prepare(`SELECT id, email, name, role, created_at FROM users WHERE id = ?1`)
    .bind(authenticated.id)
    .first();
  if (!user) return errorResponse(c, 401, { error: "unauthorized" });
  return c.json({ user }, 200);
});

// ---------------------------------------------------------------------------
// Billing: partner plans paid with Mayar QRIS
// ---------------------------------------------------------------------------

function mayarConfig(env: AppBindings): MayarConfig | null {
  const apiKey = env.MAYAR_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey, environment: env.MAYAR_ENV === "sandbox" ? "sandbox" : "production" };
}

function publicOrder(order: OrderRow) {
  return {
    orderId: order.id,
    plan: order.plan,
    amount: order.amount,
    status: order.status,
    qrString: order.qr_string,
    paymentLink: order.payment_link,
    expiresAt: order.expires_at,
  };
}

/** Mayar wants a local mobile number (08...). Accepts 08... or 62... input. */
function toMayarMobile(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const e164 = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return isValidPhone(e164) ? `0${e164.slice(2)}` : null;
}

app.get("/api/billing/me", async (c) => {
  const authenticated = await authenticate(c);
  if (authenticated instanceof Response) return authenticated;
  return c.json(await activePlan(c.env.DB, authenticated.id));
});

app.post("/api/billing/checkout", async (c) => {
  if (bodyTooLarge(c.req.raw, 4_000)) return errorResponse(c, 413, { error: "payload_too_large" });
  const authenticated = await authenticate(c);
  if (authenticated instanceof Response) return authenticated;

  const config = mayarConfig(c.env);
  if (!config) return errorResponse(c, 503, { error: "payment_unavailable" });

  const limit = await rateLimit(c.env.DB, `billing-checkout:${authenticated.id}`, 600, 6);
  if (!limit.allowed) return c.json({ ...TOO_MANY, retryAfter: limit.retryAfterSeconds }, 429);

  const body = await c.req.raw.json().catch(() => null);
  if (!isRecord(body)) return errorResponse(c, 400, { error: "invalid_json" });
  const plan = body.plan;
  if (typeof plan !== "string" || !(PAID_PLANS as readonly string[]).includes(plan)) {
    return errorResponse(c, 422, { error: "validation_failed" });
  }
  const paidPlan = plan as PaidPlan;
  const amount = planAmount(paidPlan, c.env.MAYAR_TEST_AMOUNT);
  const ts = now();

  // Reuse an open order for the same plan and amount instead of creating a duplicate invoice.
  const open = await c.env.DB.prepare(
    `SELECT * FROM payment_orders WHERE user_id = ?1 AND plan = ?2 AND amount = ?3 AND status = 'pending' AND expires_at > ?4
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(authenticated.id, paidPlan, amount, ts + 5 * 60_000)
    .first<OrderRow>();
  if (open) return c.json(publicOrder(open), 200);

  // Mayar requires a mobile number: take it from the request, else from the partner application.
  let mobile = typeof body.mobile === "string" ? toMayarMobile(body.mobile) : null;
  if (!mobile) {
    const partner = await c.env.DB.prepare(`SELECT phone FROM partners WHERE email = ?1 ORDER BY created_at DESC LIMIT 1`)
      .bind(authenticated.email)
      .first<{ phone: string }>();
    mobile = partner ? toMayarMobile(partner.phone) : null;
  }
  if (!mobile) return errorResponse(c, 422, { error: "phone_required" });

  // Write the order before calling Mayar so every invoice maps to a row.
  const orderId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO payment_orders (id, user_id, plan, amount, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'creating', ?5, ?5)`,
  )
    .bind(orderId, authenticated.id, paidPlan, amount, ts)
    .run();

  const name = authenticated.name && isSafeText(authenticated.name, 120) ? authenticated.name : authenticated.email.split("@")[0];
  try {
    const invoice = await createInvoice(config, {
      name,
      email: authenticated.email,
      mobile,
      description: `Paket ${PLAN_LABEL[paidPlan]} inapmu.com (30 hari)`,
      expiredAt: new Date(ts + ORDER_TTL_MS).toISOString(),
      items: [{ quantity: 1, rate: amount, description: `Paket ${PLAN_LABEL[paidPlan]} inapmu.com - 30 hari` }],
      paymentMethod: "qris",
      extraData: { orderId, plan: paidPlan },
    });

    if (!invoice || typeof invoice.id !== "string" || typeof invoice.transactionId !== "string") {
      throw new Error("invalid_invoice_response");
    }
    const link = safeMayarLink(invoice.link);
    const qrString = findQrisPayload(invoice);
    const expiresAt = Number.isFinite(invoice.expiredAt) ? Number(invoice.expiredAt) : ts + ORDER_TTL_MS;

    await c.env.DB.prepare(
      `UPDATE payment_orders SET status = 'pending', mayar_invoice_id = ?1, mayar_transaction_id = ?2, payment_link = ?3,
         qr_string = ?4, expires_at = ?5, updated_at = ?6 WHERE id = ?7`,
    )
      .bind(invoice.id, invoice.transactionId, link, qrString, expiresAt, now(), orderId)
      .run();

    if (!qrString) console.warn("mayar invoice without parsable QRIS payload; falling back to hosted link", { orderId });
    const order = await c.env.DB.prepare(`SELECT * FROM payment_orders WHERE id = ?1`).bind(orderId).first<OrderRow>();
    return c.json(publicOrder(order!), 201);
  } catch (error) {
    const statusCode = error instanceof MayarApiError ? error.statusCode : 0;
    const message = error instanceof MayarApiError ? `mayar_${statusCode}:${error.message.slice(0, 120)}` : "create_failed";
    await c.env.DB.prepare(`UPDATE payment_orders SET status = 'failed', last_error = ?1, updated_at = ?2 WHERE id = ?3`)
      .bind(message, now(), orderId)
      .run();
    console.error("mayar invoice create failed", { orderId, statusCode });
    if (statusCode === 429) return c.json({ error: "payment_busy", retryAfter: 60 }, 429);
    return errorResponse(c, 502, { error: "payment_unavailable" });
  }
});

app.get("/api/billing/orders/:id", async (c) => {
  const authenticated = await authenticate(c);
  if (authenticated instanceof Response) return authenticated;

  const orderId = c.req.param("id");
  if (!/^[0-9a-f-]{36}$/.test(orderId)) return errorResponse(c, 404, { error: "not_found" });

  const limit = await rateLimit(c.env.DB, `billing-poll:${authenticated.id}`, 60, 30);
  if (!limit.allowed) return c.json({ ...TOO_MANY, retryAfter: limit.retryAfterSeconds }, 429);

  const owned = await c.env.DB.prepare(`SELECT id FROM payment_orders WHERE id = ?1 AND user_id = ?2`)
    .bind(orderId, authenticated.id)
    .first();
  if (!owned) return errorResponse(c, 404, { error: "not_found" });

  const config = mayarConfig(c.env);
  if (config) await settleOrder(c.env.DB, config, orderId);

  const order = await c.env.DB.prepare(`SELECT * FROM payment_orders WHERE id = ?1`).bind(orderId).first<OrderRow>();
  const plan = await activePlan(c.env.DB, authenticated.id);
  return c.json({ ...publicOrder(order!), activePlan: plan });
});

/**
 * Mayar webhook. The payload is a notification only; it never grants access.
 * We store a redacted copy (to verify the field mapping later) and re-check
 * matching or recent pending orders against GET /transactions/{id}.
 */
app.post("/api/webhooks/mayar", async (c) => {
  const secret = c.env.MAYAR_WEBHOOK_SECRET?.trim();
  const token = c.req.query("token") ?? "";
  if (!secret || secret.length < 32 || !timingSafeEqual(token, secret)) {
    return errorResponse(c, 401, { error: "unauthorized" });
  }
  if (bodyTooLarge(c.req.raw, 64_000)) return errorResponse(c, 413, { error: "payload_too_large" });

  const payload: unknown = await c.req.raw.json().catch(() => null);
  if (!isRecord(payload)) return c.json({ ok: true, ignored: "invalid_json" });

  const event = typeof payload.event === "string" ? payload.event.slice(0, 80) : null;
  const data = isRecord(payload.data) ? payload.data : {};
  const candidates = [data.transactionId, data.id, data.invoiceId, data.paymentLinkId]
    .filter((value): value is string => typeof value === "string" && value.length <= 64);

  let matched: string | null = null;
  for (const candidate of candidates) {
    const row = await c.env.DB.prepare(
      `SELECT id FROM payment_orders WHERE mayar_transaction_id = ?1 OR mayar_invoice_id = ?1 LIMIT 1`,
    )
      .bind(candidate)
      .first<{ id: string }>();
    if (row) {
      matched = row.id;
      break;
    }
  }

  await c.env.DB.prepare(`INSERT INTO mayar_webhook_events (event, payload, matched_order_id, received_at) VALUES (?1, ?2, ?3, ?4)`)
    .bind(event, JSON.stringify(redactPayload(payload)).slice(0, 16_000), matched, now())
    .run();

  const config = mayarConfig(c.env);
  if (config) {
    const work = matched ? settleOrder(c.env.DB, config, matched, true) : settlePendingOrders(c.env.DB, config, 10);
    c.executionCtx.waitUntil(work.then(() => undefined).catch((error) => console.error("webhook settle failed", error)));
  }
  return c.json({ ok: true });
});

// Health check for deployment verification.
app.get("/api/health", (c) => c.json({ ok: true }));

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error("unhandled", err);
  return c.json({ error: "internal_error" }, 500);
});

export default {
  fetch: app.fetch,
  // Cron fallback: settle pending orders even when no browser or webhook calls in.
  async scheduled(_controller: ScheduledController, env: AppBindings, ctx: ExecutionContext) {
    const config = mayarConfig(env);
    if (!config) return;
    ctx.waitUntil(settlePendingOrders(env.DB, config).then(() => undefined));
  },
} satisfies ExportedHandler<AppBindings>;
