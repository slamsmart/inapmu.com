# Security audit — inapmu.com (full review)

Date: 2026-11-24
Method: source-grounded manual audit (reconnaissance → boundary hunting → validation),
styled on cloudflare/security-audit-skill's verdict discipline: every item below is
either **confirmed** (reachable boundary violation with concrete impact), **hardening**
(real improvement, no demonstrated exploit path today), or **informational**.
Scope: `worker/index.ts` + `worker/lib/*`, `src/lib/*`, `src/*.tsx`, `worker/web.ts`,
migrations, `wrangler*.jsonc`, dependency audit. No live probing of production was
performed (static/source review only, consistent with the prior `SECURITY_REVIEW.md`'s
load-test policy).

## Summary

No critical or high-severity reachable vulnerability found. The billing, auth, upload,
and CORS boundaries are implemented correctly (see "What's already solid" below). The
items below are real but bounded: one medium (session-token storage/revocation design),
a few low-severity hardening items, and informational notes — several of which were
already tracked as open items in the existing `SECURITY_REVIEW.md` and remain open.

| ID | Severity | Area | Status |
|---|---|---|---|
| M1 | Medium | Session token storage & revocation | **Fixed 2026-11-24** |
| L1 | Low | Chat markdown link rendering (self-XSS only) | **Fixed 2026-11-24** |
| L2 | Low | Body-size gate skipped without `Content-Length` | **Fixed 2026-11-24** |
| L3 | Low | Demo owner PII hardcoded in client bundle | Open (tracked before, still open) |
| I1 | Info | No-op `LIKE` escaping (missing `ESCAPE`) | **Not applicable** — see remediation log |
| I2 | Info | Nearby-places fetch blocked by own CSP in prod | **Not applicable** — see remediation log |
| I3 | Info | Webhook secret passed as query string | New (accepted pattern, noted) |
| I4 | Info | Local `.dev.vars` holds a live-looking key | New (not leaked to git) |
| I5 | Info | No session revocation on logout | Open (tracked before, still open) |

## Findings

### M1 — Session token readable by JS, and not revocable (Medium)

**Where:** `src/lib/api.ts` (`saveSession`/`currentSession` via `sessionStorage`),
`worker/index.ts` `authenticate()` (prefers `Authorization: Bearer` over the HttpOnly
cookie that login already sets).

**Issue:** Login sets a correct `HttpOnly; Secure; SameSite=Lax` cookie *and* returns the
same token to the client, which stores it in `sessionStorage` and sends it as a Bearer
header on every request. `authenticate()` checks the header first, so the HttpOnly
cookie's XSS protection is bypassed whenever the bearer path is used (which is always,
today). If any script ever runs on the page with attacker control (see L1 as the closest
current candidate, or any future third-party script bug), it can read `sessionStorage`
and exfiltrate a fully working session token — full account takeover, including billing
actions. Separately, `logout` only clears the cookie/local storage; the HMAC token itself
stays valid for up to 7 days if a copy already left the browser.

**Boundary/result:** lower-trust principal = script running in the page; control defeated
= HttpOnly cookie's "not readable by JS" guarantee; result = stealable, non-revocable
session token.

**Fix (smallest effective):** Stop issuing/reading the bearer token for browser flows —
rely solely on the `HttpOnly` cookie (`authenticate()` can drop the `Authorization` header
branch, or only honor it for non-browser/API-key use cases you don't have yet). Remove
`sessionStorage` session storage in `src/lib/api.ts`. For revocation, add a `session_version`
or `token_version` column on `users`, embed it in the session payload, and bump it on
logout/password change so old tokens are rejected immediately by `readSessionToken`'s
caller.

### L1 — Chat reply markdown rendered as a raw `<a href>` (Low, self-impact only)

**Where:** `src/ChatWidget.tsx` `formatText()`.

**Issue:** The assistant's markdown links are parsed with
`/^\[(.*?)\]\((.*?)\)$/` and the captured URL is passed straight into `<a href={url}>`
with no scheme check. The system prompt only instructs the model to emit
`[Title](/#listing-ID)`, but a crafted user prompt could attempt to make the model emit
`[x](javascript:...)` or `data:` URIs, which would execute on click.

**Boundary/result:** Chat is per-browser-session and never shared with another user, so
the only person who can trigger and click the malicious link is the same person who
wrote the prompt — self-XSS, not a cross-principal result today. It becomes a real
boundary violation the moment chat transcripts are ever shared, exported, or rendered for
someone other than the author, or if the upstream model output is trusted more broadly
later. Flagging now because the fix is a one-line allow-list and it directly protects the
M1 session token from this exact script-execution path.

**Fix:** Before rendering as `href`, accept only `url.startsWith("/")`, `url.startsWith("#")`,
or `/^https?:\/\//i.test(url)`; otherwise render the link as plain text.

### L2 — Upload/JSON body-size gate is skipped when `Content-Length` is absent (Low)

**Where:** `worker/lib/security.ts` `bodyTooLarge()`, used by every `guard()` call and the
manual checks in `/api/listings`, `/api/verifications`, `/api/webhooks/mayar`, `/api/chat`.

**Issue:** `bodyTooLarge` returns `false` (allowed) whenever the `content-length` header is
missing, e.g. a chunked-transfer-encoded request. Every route then proceeds to buffer the
full body (`formData()`/`json()`) before any app-level size check applies. The only
remaining backstop is Cloudflare Workers' platform-wide request body cap, not the much
smaller per-route limits this code intends (16 KB for chat, 6 MB for KTP, etc.).

**Boundary/result:** this is a defense-in-depth gap behind an existing platform control
(Workers already caps request bodies), so it does not reach "confirmed" severity on its
own — recorded as low/hardening rather than a standalone exploit.

**Fix:** Enforce the byte cap while reading, not only from the header — e.g. wrap
`request.body` in a counting `TransformStream`/reader and abort once `maxBytes` is
exceeded, instead of trusting the declared `Content-Length`.

### L3 — Hardcoded "owner" phone/email in the shipped bundle (Low, carried forward)

**Where:** `src/data/catalog.ts` (`ownerPhone`, `ownerEmail` on each catalog listing).

Already flagged in `SECURITY_REVIEW.md` item 7 and still present. Looks like demo/seed
data (sequential fake numbers), but if any of these become real people's contact details
they are permanently scrapable from the public JS bundle. No action needed if this stays
demo data; otherwise move real contact info behind a server-mediated relay.

### I1 — `LIKE` escaping has no effect (Informational)

**Where:** `worker/index.ts`, both `GET /api/listings` and `POST /api/ai/rekomendasi`
build `city.replace(/[%_]/g, m => \`\\${m}\`)` and bind it into `... LIKE ?2`.

The SQL text never adds `ESCAPE '\'`, so SQLite treats the inserted backslash as a literal
character rather than an escape — the "escaping" is a no-op. Not a SQL-injection risk
(the value is still a bound parameter either way); worst case is a city query containing
`%`/`_` matches more broadly than the user intended. Fix: append `ESCAPE '\'` to both
`LIKE` clauses, or drop the dead escaping code.

### I2 — Nearby-places fetch is blocked by the page's own CSP in production (Informational / functional bug)

**Where:** `src/lib/nearby.ts` fetches `overpass-api.de` / `overpass.kumi.systems`
directly from the browser; `worker/web.ts`'s CSP sets
`connect-src 'self' https://challenges.cloudflare.com`.

In production the browser will block this `fetch` per CSP, and the code's own `catch`
swallows the error and returns `[]` — so "fasilitas/wisata terdekat" silently never
renders anything live, with no console-visible user impact. Not a vulnerability (CSP is
doing exactly what it's configured to do); flagged because it looks like an unintended
feature regression. Fix: either proxy Overpass calls through `/api/*` on the API worker,
or add the two Overpass hosts to `connect-src`.

### I3 — Webhook secret travels as a URL query parameter (Informational)

`POST /api/webhooks/mayar?token=...` compares the query token with constant-time
equality — correct check, but secrets-in-URL is generally discouraged because URLs can
end up in logs/proxies. This is a server-to-server call over HTTPS (Mayar → Cloudflare),
not a browser navigation, so there is no referrer-leak path today. No fix required beyond
making sure request URLs (including the token) are never logged in full.

### I4 — Local `.dev.vars` contains a live-looking `CHAT_API_KEY` (Informational)

Verified `.dev.vars` is listed in `.gitignore` and `git log --all -- .dev.vars` /
`git ls-files -- .dev.vars` both return nothing — it has never been committed. No leak
found. Recommendation: rotate this key if it was ever pasted into chat, email, or a
ticket outside this machine, and confirm it's distinct from the `CHAT_API_KEY` Worker
Secret bound in production (`wrangler secret put`).

### I5 — No session revocation / rotation on logout (Informational, carried forward)

Already tracked in `SECURITY_REVIEW.md` item 8. Session tokens are stateless HMACs with
no server-side blocklist; logout only removes the client-side cookie/storage copy. See
M1's fix (a `token_version` column) for the smallest change that also closes this.

## What's already solid (confirmed defenses, not findings)

- **No SQL injection surface found.** Every query across `worker/index.ts` and
  `worker/lib/*` uses `?N` bound parameters; none concatenate user input into SQL text.
- **Billing never trusts the webhook payload for fulfillment.** `settleOrder()` always
  re-verifies live against Mayar's `GET /transactions/{id}`, independently checks the
  paid amount against the server-computed order amount, and fulfills idempotently inside
  one `db.batch` guarded by an `EXISTS` clause — this defeats both "forged webhook" and
  "double-fulfill" attack classes correctly.
- **Ownership checks are present where they matter:** `/api/billing/orders/:id` requires
  `user_id` match; `/media/*` requires the object to belong to an `approved` listing via a
  strict key regex; KTP uploads are tied to the authenticated user/email, never to
  client-supplied identity fields.
- **Uploads are validated by magic-byte sniffing** (`sniffImageType`), never by
  client-declared `Content-Type` or filename, for both listing photos and KTP.
- **Google OAuth callback validates `aud`, `iss`, and `email_verified`** before trusting
  the identity, and uses a random server-set `state` cookie for CSRF protection.
- **CORS is a strict allow-list** (`https://inapmu.com`, `https://www.inapmu.com`, plus
  localhost for dev), not a suffix or wildcard match — closes the gap the prior audit
  fixed.
- **CSP, Permissions-Policy, and secure headers** are set on the web worker; `script-src`
  has no `'unsafe-inline'`.
- **No admin/privilege-escalation surface exists at all** — the `role` column is defined
  but never read or checked anywhere in the API, so there is currently no "forgot a role
  check" bug class to exploit (also means listing/verification approval is a manual,
  out-of-band DB operation today, which is a process note, not a vulnerability).
- **Dependency audit clean:** `npm audit --omit=dev` → 0 vulnerabilities.

## Remediation log

- **2026-11-24 — M1 fixed.** `worker/index.ts` `authenticate()` now reads only the
  `HttpOnly` `inapmu_session` cookie (the `Authorization: Bearer` path was removed).
  `src/lib/api.ts` no longer stores or sends a bearer token; `sessionStorage`,
  `saveSession()`, and `currentSession()` were deleted. Login/OAuth responses no longer
  include the raw token. Added `users.token_version`
  (`worker/migrations/0008_session_revocation.sql`), embedded in the session payload
  (`worker/lib/auth.ts`) and checked on every request; `POST /api/auth/logout` now
  authenticates the caller and increments `token_version`, immediately invalidating any
  other copy of that session's token instead of letting it live out its 7-day TTL.
- **2026-11-24 — L1 fixed.** `src/ChatWidget.tsx` now runs every markdown link through
  `isSafeChatLinkHref()` (allows only `/`, `#`, `http://`, `https://`) before rendering it
  as a real `<a href>`; anything else renders as plain text.
- **2026-11-24 — L2 fixed.** Added `readBoundedBody`/`boundedJson`/`boundedFormData` to
  `worker/lib/security.ts`: they read the request stream and reject once the real byte
  count exceeds the route's limit, regardless of a missing, absent, or understated
  `Content-Length`. Every `c.req.raw.json()`/`.formData()` call in `worker/index.ts` (10
  call sites: partner apply, listing create, KTP verification, AI recommendations,
  register, login, profile update, billing checkout, Mayar webhook, chat) now goes
  through one of these instead of the unbounded native parser. `bodyTooLarge()` is kept
  as a cheap header-based pre-check, not the sole guard.
- **2026-11-24 — I1 re-checked, not applicable.** `GET /api/listings` and
  `POST /api/ai/rekomendasi` no longer run a SQL `LIKE` query for the city filter at all
  — `getAllActiveListings()` fetches once and city matching happens in memory via
  `.toLowerCase().includes()`. The no-op `ESCAPE` finding was based on an older build of
  the worker; current source has no `LIKE`-escaping code path to fix.
- **2026-11-24 — I2 re-checked, not applicable today.** `src/lib/nearby.ts` is not
  imported by any component yet (`grep` for `fetchNearbyPlaces`/`lib/nearby` across
  `src/**/*.tsx` returns no matches) — it's unused code, so the CSP mismatch blocks
  nothing live. Revisit `worker/web.ts`'s `connect-src` (add the two Overpass hosts, or
  proxy the call through `/api/*`) only once this feature is actually wired into the UI;
  adding the allowance now would be an unnecessary CSP relaxation for a feature nothing
  uses.
- **I3, I4** remain informational with no code action (accepted webhook-token pattern;
  local-only `.dev.vars` key, confirmed never committed). **I5** is resolved as a
  byproduct of the M1 fix (`token_version` now gives logout real revocation).

## Status

All actionable items from this audit (M1, L1, L2) are fixed and deployed to production as
of 2026-11-24. I1 and I2 were re-checked against current source and found not applicable
(see remediation log). Remaining open items are informational/process notes only: confirm
`src/data/catalog.ts` owner contact fields stay demo data (L3), and rotate the local
`CHAT_API_KEY` in `.dev.vars` if it was ever shared outside this machine (I4) — neither
requires a code change.
