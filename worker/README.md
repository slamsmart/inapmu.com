# inapmu.com — Cloudflare D1 + R2 Backend

## Arsitektur

```
Browser (React SPA)
  │  /api/*  /media/*  (same-origin)
  ▼
Cloudflare Worker "inapmu-api"  ← https://inapmu-api.aicm-id.workers.dev
  ├─ D1 "inapmu-db"  (SQL: users, partners, listings, photos, verifications, rate_limits)
  └─ R2 "inapmu-media" (foto listing + KTP)
```

- Worker: `worker/index.ts` (Hono), module `worker/lib/{util,security,auth}.ts`
- Migrasi DB: `worker/migrations/0001_init.sql`
- Konfigurasi: `wrangler.jsonc` (account 256edca59021db439c2ae22f9e3e9086)

## Endpoint

| Method | Path | Fungsi |
|---|---|---|
| POST | `/api/partners/apply` | Pendaftaran mitra (JSON multipart + honeypot + Turnstile) |
| POST | `/api/listings` | Buat listing + upload ≤8 foto (R2), wajib Bearer session |
| GET  | `/api/listings?city=&limit=` | Feed listing approved |
| POST | `/api/verifications` | Upload KTP (wajib Bearer session; R2 private) |
| POST | `/api/auth/register` / `login`, GET `/api/auth/me` | Auth PBKDF2 + token HMAC |
| GET  | `/media/*` | Proxy hanya foto listing yang sudah approved |
| GET  | `/api/health` | Health check |

## Proteksi bot/serangan (defense in depth)

1. **Cloudflare Turnstile** — verifikasi server-side. Tanpa secret di production → request ditolak (403 `bot_suspected`). Dev lokal: bypass.
2. **Rate limit per-IP (D1)** — apply mitra 5/jam, login 10/15 menit, register 5/jam, KTP 3/jam, listing 10/jam. Terlampaui → 429 + `retryAfter`.
3. **Honeypot** field `website` — bot yang mengisi → 202 palsu (data tak disimpan).
4. **Upload**: magic-byte sniffing (JPEG/PNG/WebP) — file `.txt` disamarkan sebagai PNG → 415. Maks 5 MB/foto, ≤8 foto.
5. **SQL injection**: prepared statements di semua query.
6. **XSS**: validasi charset ketat (tolak `<`, `>`, control chars) + limit panjang.
7. **Password**: PBKDF2-SHA256 100k iterasi + salt, perbandingan constant-time.
8. **Session**: HMAC-SHA256 signed token, TTL 7 hari, secret di Worker Secrets.
9. **KTP**: disimpan di prefix `ktp/` — `/media/ktp/*` selalu 403.
10. **CORS**: hanya `https://inapmu.com`, `https://www.inapmu.com`, dan localhost dev exact-origin.
11. **Dedup**: pendaftaran mitra dari IP+email sama dalam 24 jam diabaikan.
12. **Auth abuse**: register/login juga wajib Turnstile + rate limit.

## Konfigurasi yang sudah aktif

- Secret terpasang: `SESSION_SECRET` + `TURNSTILE_SECRET_KEY`.
- Konfigurasi deploy production menonaktifkan `workers.dev`; gunakan custom domain yang dilindungi Cloudflare.

## Setup Turnstile (WAJIB sebelum form publik dipakai)

1. Buka https://dash.cloudflare.com → Turnstile → **Add site**
2. Domain: `inapmu.com` (+ `localhost` untuk dev)
3. Copy **Secret Key** → jalankan:
   ```
   npx wrangler secret put TURNSTILE_SECRET_KEY
   ```
4. Copy **Site Key** → buat file `.env.local` di `MVP Implementation/`:
   ```
   VITE_TURNSTILE_SITE_KEY=0x4AAAAxxx_sitekey
   ```
5. Redeploy: `npx wrangler deploy`

## Setup Google OAuth

1. Buka **Google Cloud Console → APIs & Services → Credentials**.
2. Buat **OAuth client ID** dengan tipe **Web application**.
3. Isi **Authorized JavaScript origins**:
   - `https://inapmu.com`
   - `https://www.inapmu.com`
4. Isi **Authorized redirect URIs**:
   - `https://inapmu.com/api/auth/google/callback`
5. Pasang credential di Cloudflare Worker. Jangan simpan nilainya di repo:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
6. Jalankan migrasi Google OAuth lalu deploy API dan web:
   ```bash
   npx wrangler d1 migrations apply inapmu-db --remote
   npx wrangler deploy --config wrangler.jsonc
   npx wrangler deploy --config wrangler.web.jsonc
   ```

Callback OAuth: `/api/auth/google/callback`. Session disimpan sebagai cookie
HttpOnly dan akun Google dihubungkan memakai `google_subject` yang stabil.

## Perintah rutin

```bash
# migrasi skema baru
npx wrangler d1 migrations apply inapmu-db --remote   # production
npx wrangler d1 migrations apply inapmu-db --local    # dev

# deploy perubahan worker
npx wrangler deploy

# dev lokal (worker di 8787, vite proxy /api + /media)
npx wrangler dev --port 8787        # terminal 1
npm run dev                          # terminal 2 → http://localhost:8443

# query data
npx wrangler d1 execute inapmu-db --remote --command "SELECT * FROM partners ORDER BY id DESC LIMIT 10"
```

## Koneksi domain inapmu.com (status 2026-10-18)

### Sudah terpasang

- Zone Cloudflare `inapmu.com` **active** (id `daae675e29e8731646be77bd340d0e55`), plan Free.
- Worker **inapmu-web** (SPA): custom domain `inapmu.com` (apex) + route `www.inapmu.com/*`.
- Worker **inapmu-api**: routes `inapmu.com/api*`, `inapmu.com/media*`, `www.inapmu.com/api*`, `www.inapmu.com/media*` (same-origin, CORS `*.inapmu.com`).
- Secret terpasang: `SESSION_SECRET` + `TURNSTILE_SECRET_KEY`.
- Endpoint `workers.dev` lama masih dapat merespons sampai deployment konfigurasi hardening selesai; setelah deploy, jalur produksi hanya melalui custom domain.

### SATU langkah tersisa — delegasi NS di registrar

Registry Verisign masih delegasi ke NS parking `ns1/ns2.hosting.businessidentity.llc`
(cek: https://rdap.verisign.com/com/v1/domain/inapmu.com). Akibatnya traffic belum
masuk Cloudflare, Universal SSL cert edge untuk `inapmu.com` belum ter-issued →
`https://inapmu.com` gagal TLS handshake (HTTP :80 via edge SUDAH jalan — SPA +
API terverifikasi 2026-10-18: health, register, login, me OK via host override).

Status cek 2026-10-18 22:40 WIB:
- Zone CF `active`, worker custom domain apex + route www/api/media terpasang.
- Custom domain di-attach ulang 3× (cert_id baru tiap kali) — edge TLS tetap
  handshake-failure karena cert Universal SSL menunggu delegasi NS aktif.
- Setelah NS delegasi berubah di registrar → cert ter-issued otomatis (bisa
  makan 5–15 menit) → HTTPS jalan tanpa deploy ulang.

**Perbaiki di panel registrar (domainregistry.com llc):** ganti nameserver domain menjadi:

```
ali.ns.cloudflare.com
osmar.ns.cloudflare.com
```

### Preview dan production

Konfigurasi production sengaja menonaktifkan endpoint `workers.dev` agar jalur
cadangan tidak melewati WAF/rate limit custom domain. Preview lokal tetap memakai
service binding melalui `npx wrangler dev --port 8787` dan Vite proxy.

Setelah NS delegasi berubah: tunggu propagasi registry (biasanya < 1 jam) → cert
Universal SSL ter-issued otomatis → `https://inapmu.com` langsung jalan: SPA di `/`,
API same-origin di `/api/*`, media di `/media/*`.

## Fix Turnstile widget (2026-10-18)

Bug: `useTurnstile` effect berjalan sekali saat App mount — container masih `null`
(modal belum dibuka), deps `[containerRef]` stabil → widget TIDAK PERNAH render.
Semua form publik (apply mitra, listing, KTP) di production selalu 403
`bot_suspected` meski sitekey ada di bundle.

Fix (`src/lib/turnstile.ts`): hook return `[refCallback, token]` — callback ref
menyimpan node via `useState`, effect deps `[container]` → render ulang tiap modal
dibuka. Pemakai diupdate: `App.tsx` (partner + auth), `PartnerDashboard.tsx`
(sekalian wire token dashboard ke `setTurnstileTokenProvider` — sebelumnya token
dashboard tak pernah masuk API client).

Verifikasi headless (challenge tak bisa disolve di headless): script + API +
widget mount OK di modal auth & partner apply; submit tanpa token → 403
`bot_suspected` (server-side reject benar); login/register (non-Turnstile) 200 +
session tersimpan.
