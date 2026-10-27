# Security review — inapmu.com

Tanggal review: 2026-10-27  
Scope: React/Vite frontend, Hono Worker, D1/R2 bindings, Cloudflare deployment configuration, dependency audit.

## Kesimpulan

Kode lokal sudah di-hardening untuk temuan kritis yang ditemukan. **Belum boleh dianggap siap publik sampai deployment, migrasi remote, dan kontrol Cloudflare di checklist selesai.** Tidak ada pengujian 1.000 request ke production; pengujian beban harus dilakukan di lokal/staging agar tidak menjadi denial-of-service terhadap pengguna nyata.

## Temuan dan perbaikan yang diterapkan

| Risiko | Dampak | Status |
|---|---|---|
| CORS menerima domain yang hanya berakhiran `inapmu.com` | Situs penyerang dapat membaca response API lintas-origin | Diperbaiki: allowlist exact-origin di `worker/index.ts` |
| Listing dan upload KTP dapat dipanggil tanpa session | Bot dapat mengisi data/listing dan mengirim PII atas nama email lain | Diperbaiki: Bearer session wajib; email KTP berasal dari user terautentikasi |
| Fallback `dev-insecure-session-secret` | Jika secret production hilang, token masih dapat diterbitkan/diverifikasi | Diperbaiki: fail-closed dengan 503 |
| Auth tidak memverifikasi Turnstile | Brute-force/register bot terdistribusi lebih mudah | Diperbaiki: register/login wajib Turnstile + rate limit |
| Proxy media dapat membaca object selain KTP | Risiko kebocoran object R2 private di masa depan | Diperbaiki: hanya `listings/*` dengan format key aman dan listing `approved` |
| Body multipart diparse sebelum batas ukuran dicek | Pemakaian memori berlebih dari request besar/chunked | Diperbaiki: `Content-Length` dicek sebelum `formData()` |
| Orphan object saat insert D1 gagal | Storage/PII tertinggal tanpa record | Diperbaiki: cleanup R2 pada kegagalan persist |
| Web tanpa CSP khusus | XSS berdampak lebih besar bila ada regresi frontend | Diperbaiki: CSP dan Permissions-Policy di web Worker |

## Checklist wajib sebelum launch

1. Jalankan migrasi remote `0002_security_hardening.sql`, lalu deploy API dan web Worker. Jangan melayani upload sebelum dua langkah ini selesai.
2. Pastikan `SESSION_SECRET` minimal 32 karakter acak dan `TURNSTILE_SECRET_KEY` hanya ada sebagai Worker Secret; jangan memasukkannya ke frontend atau source control.
3. Pastikan nameserver domain benar-benar didelegasikan ke Cloudflare dan `inapmu.com` serta `www.inapmu.com` hanya lewat proxy/custom domain Cloudflare. Audit menemukan DNS record belum terlihat dari API inspeksi dan endpoint `workers.dev` masih merespons sebelum konfigurasi baru dideploy.
4. Di Cloudflare WAF/Rate Limiting, buat rule untuk `/api/auth/*`, `/api/partners/apply`, `/api/listings`, `/api/verifications`, dan `/api/health`. Gunakan managed challenge/Turnstile untuk write/auth, serta limit GET feed/health. D1 limiter adalah lapisan tambahan, bukan pengganti edge rate limit.
5. Pastikan R2 bucket tidak memiliki public bucket/custom domain. Akses media hanya melalui Worker.
6. Tetapkan retensi KTP: akses operator berbasis role, audit log, penghapusan otomatis setelah verifikasi/rejection, dan prosedur penghapusan berdasarkan permintaan pemilik data. Schema saat ini belum menyediakan lifecycle/revocation workflow.
7. Jangan menaruh nomor WhatsApp/email personal pemilik nyata di bundle frontend. Gunakan contact relay atau endpoint server yang memberi akses terukur; data contoh saat ini tertanam di `src/App.tsx`.
8. Pertimbangkan migrasi bearer token dari `sessionStorage` ke cookie `HttpOnly; Secure; SameSite=Lax` dengan session revocation/rotation sebelum menyimpan data akun yang lebih sensitif.

## Dependency/config checks

- `npm audit --omit=dev`: 0 vulnerability pada dependency runtime.
- `npm audit`: menemukan advisory pada toolchain/dev (`vite`, `source-map-js`, `undici`/`miniflare`, `wrangler`); upgrade lockfile sebelum pipeline build berikutnya.
- `SESSION_SECRET` dan `TURNSTILE_SECRET_KEY` terdaftar di Cloudflare Worker Secrets saat audit; nilainya tidak dibaca atau dicatat.
- `npx wrangler deploy --dry-run`: bundle Worker berhasil dan binding D1/R2 terdeteksi.

## Load-test policy

- 10x dan 100x request boleh dijalankan ke Worker lokal/staging dengan data dummy.
- 1.000x hanya setelah staging terpisah, dengan throttle/concurrency terbatas, observasi CPU/error/latency/D1/R2, dan stop condition.
- Jangan menjalankan flood test ke production atau endpoint upload production. Untuk validasi production gunakan synthetic probe kecil dan Cloudflare dashboard/analytics.
