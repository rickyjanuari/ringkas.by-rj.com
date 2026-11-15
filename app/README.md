# Ringkas — Aplikasi Mandiri (SvelteKit + Hono + SQLite)

Aplikasi toko + belajar "Ringkas" (Rangkuman Materi SD, SMP, SMA) sebagai proyek
mandiri yang bisa dijalankan sendiri — bukan versi hosting Muse. Satu repo ini
berisi kode aplikasi lengkap di `app/`; folder `email-templates/` dan `docs/` di
root repo berisi template email dan dokumentasi konektor (dipakai aplikasi ini
sebagai referensi, bukan sebagai kode yang diimpor).

> **Catatan jujur:** ini adalah pembangunan ulang (rebuild) orisinal dari
> spesifikasi aplikasi Ringkas. Isi database, akun pengguna, dan order dari
> versi hosting Muse TIDAK ikut pindah — saat pertama dijalankan, database
> dibuat kosong lalu di-seed dengan katalog dan konten belajar baru.

## Cara jalan

Persyaratan: Node.js **≥ 22.5** (dipakai `node:sqlite` bawaan Node), npm.

```bash
cd app
npm install
cp .env.example .env   # lalu isi SESSION_SECRET dan kredensial KlikQRIS
npm run dev            # frontend :5173 + server API :8787 (bersamaan)
# atau:
npm run build          # build frontend + cek tipe server
npm start              # jalankan server saja (menyajikan build/ + /api)
```

Saat server pertama kali boot, migrasi SQL dijalankan otomatis dan katalog
+ konten belajar di-seed bila database masih kosong (`server/seed/`).

Perintah lain:

```bash
npm run seed       # jalankan seed secara manual
npm run make-admin -- email@contoh.id   # jadikan pengguna itu admin
npm run check      # svelte-check (butuh build/sync dulu)
npm run dev:worker # jalankan Worker + D1 secara LOKAL (wrangler dev --local)
npm run deploy     # build + wrangler deploy (butuh login Cloudflare)
npm run deploy:dry # wrangler deploy --dry-run (tanpa auth, cek konfigurasi)
npm run db:migrate # wrangler d1 migrations apply (lokal)
npm run db:migrate:remote  # sama, ke D1 remote
npm run db:seed    # isi D1 lokal dari server/seed/seed.sql
npm run db:seed:remote     # isi D1 remote dari server/seed/seed.sql
npm run seed:dump  # regenerate server/seed/seed.sql dari seed lokal
```

Buka http://localhost:5173 (dev) atau http://localhost:8787 (setelah build).

## Environment variable

| Variabel | Wajib | Keterangan |
|---|---|---|
| `PORT` | tidak (8787) | Port server Hono. |
| `DATABASE_PATH` | tidak (`./data/ringkas.db`) | Lokasi file SQLite. |
| `SESSION_SECRET` | ya | String acak panjang untuk token sesi. |
| `KLIKQRIS_API_KEY` | ya, untuk checkout | API key KlikQRIS. |
| `KLIKQRIS_MERCHANT_ID` | ya, untuk checkout | Merchant ID KlikQRIS. |
| `KLIKQRIS_WEBHOOK_SECRET` | bila diaktifkan | Secret validasi signature webhook. |
| `RESEND_API_KEY` | tidak (belum dipakai) | Untuk pengiriman email bila di-wire nanti. |
| `RESEND_FROM` | tidak | Alamat pengirim, mis. `halo@ringkas.by-rj.com`. |

Tidak ada default admin. Daftarkan satu akun, lalu:
`npm run make-admin -- email@akun.id`. Jangan menyimpan `.env` atau
`data/ringkas.db` di repo (sudah di `.gitignore`).

Catatan: server **tidak membaca `.env` otomatis** (tidak ada dotenv) —
untuk `npm run dev`/`npm start`, export variabel di shell (`export
SESSION_SECRET=...`) atau jalankan lewat `wrangler dev` (membaca
`.dev.vars`, lihat `.dev.vars.example`). Di Cloudflare, secret TIDAK
berasal dari `.env`: pakai `wrangler secret put` (lihat "Deploy ke
Cloudflare"). `SESSION_SECRET` saat ini tidak dipakai oleh kode server
(token sesi dibuat acak tanpa penandatanganan) — tetap isi agar siap
bila dipakai nanti.

## Arsitektur

```
app/
  src/            Frontend SvelteKit 5 (SPA, adapter-static)
    routes/       Beranda, Katalog, Produk [slug], Keranjang, Checkout,
                  Pesanan, Akun, Belajar [product]/[chapter], Admin
    lib/          api.ts (fetch + token), store.ts (auth + cart)
  server/         Backend Hono (Node + Cloudflare Workers)
    index.ts      Entry Node: migrasi, seed, /api, static build/ + /uploads/
    worker.ts     Entry Worker: /api -> Hono (D1), /uploads -> 404,
                  sisanya -> aset statis
    app.ts        createApp(db, { storage }) — dipakai KEDUA entry
    db.ts         NodeDatabase (node:sqlite) — dev/self-host
    d1.ts         D1Database (binding D1) — Cloudflare Workers
    database.ts   Interface Database + tipe baris (tanpa API Node)
    env.ts        getEnv()/setEnv() — JANGAN baca process.env langsung
    storage.ts    ImageStorage: lokal (app/uploads/) / tidak tersedia (Workers)
    actions.ts    Semua endpoint (lihat API_CONTRACT.md)
    klikqris.ts   create/status/webhook KlikQRIS (env saja)
    pdf.ts        Struk, worksheet, PDF rangkuman (pdf-lib)
    email.ts      getOrderEmailData (variabel template email)
    migrations/   0001_init, 0002_study_family, 0003_orders_expired_at
    seed/         products.ts (46+5 produk), study.ts (bank soal +
                  generator simulasi + konten bab), seed.ts, seed.sql
                  (hasil dump seed, untuk D1)
    scripts/      make-admin.ts, dump-seed-sql.ts
  wrangler.toml   Worker + Static Assets + D1 (lihat di bawah)
  .dev.vars.example  Secret lokal untuk `wrangler dev`
  API_CONTRACT.md Kontrak endpoint + bentuk soal (mengikat)
  build/          Hasil `npm run build` (tidak di-commit)
  data/           File SQLite (tidak di-commit)
  uploads/        Gambar produk yang diunggah admin (tidak di-commit)
```

Frontend memanggil `/api/...` (di-dev diproxy Vite ke `:8787`; di-prod
satu server Hono yang sama menyajikan frontend + API). Auth memakai token
sesi acak di tabel `sessions`, dikirim sebagai `Authorization: Bearer`.

### Pemetaan ke Cloudflare (keputusan)

**Satu Cloudflare Worker + Static Assets di satu domain** — BUKAN
Pages + Worker terpisah. Alasannya:

1. Frontend sudah SPA statis (`adapter-static`, `ssr = false`, output
   `build/`) sehingga bisa langsung disajikan sebagai aset Worker
   (`[assets]`, `not_found_handling = "single-page-application"`).
2. Worker yang sama melayani `/api/*` (Hono + D1) di origin yang sama —
   tidak perlu `VITE_API_URL`, tidak ada perubahan CORS, dan bentuk URL
   `/uploads` tidak berubah.
3. Database: D1 (SQLite-nya Cloudflare) menggantikan file SQLite lokal.
   Semua akses database lewat interface async `Database`
   (`server/database.ts`): `NodeDatabase` (node:sqlite) untuk `npm run
   dev`, `D1Database` (`server/d1.ts`) untuk Workers. Migrasi SQL yang
   sama diterapkan di keduanya — lokal otomatis saat boot,
   D1 via `wrangler d1 migrations apply`.
4. Endpoint `server/app.ts` (`createApp`) dipakai bersama oleh entry Node
   (`server/index.ts`) dan entry Worker (`server/worker.ts`) supaya
   perilaku API identik di kedua runtime.

**PDF di Workers:** pdfkit tidak bisa dipakai di Workers — modul font-nya
memakai `__dirname` (CommonJS) yang tidak ada di runtime Workers
(struk/worksheet/unduhan mengembalikan 500). Semua PDF kini dibuat dengan
**pdf-lib** (pure JavaScript, tanpa API Node) sehingga satu kode yang
sama jalan di Node dan di Workers (struk, worksheet, dan unduhan produk
sudah terverifikasi mengembalikan PDF valid di keduanya).

## Endpoint (ringkas — detail di API_CONTRACT.md)

- Auth: `POST /api/auth/register|login`, `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/account/whatsapp`
- Katalog: `GET /api/catalog`, `GET /api/products/:id`
- Admin: `GET/POST/PUT/DELETE /api/admin/products`, `POST .../active`, `.../external-link`, `.../images`, `.../feature`, `DELETE /api/admin/images/:id`, `GET /api/admin/users`, `POST /api/admin/users/:id/role`, `POST /api/admin/chapters/:id/video`
- Checkout KlikQRIS: `POST /api/checkout` (idempotency key), `GET /api/payment/status/:order_id`, `POST /api/webhook/klikqris`
- Order: `GET /api/orders`, `GET /api/orders/:id/receipt` (PDF), `GET /api/orders/:id/download/:product_id` (PDF), `GET /api/order-email-data/:order_id`
- Belajar: `GET /api/study/:product_id`, `GET /api/simulations/:id/questions`, `POST /api/quiz/submit`, `POST /api/study/chapter-done`, `POST /api/bookmark|note`, `GET /api/search`, `GET /api/daily`, `GET /api/tracker`, `GET /api/stickers`, `GET /api/study/:product_id/:chapter_id/worksheet`
- Keluarga & kelas: `POST /api/parent/link|redeem`, `GET /api/parent/children`, `POST /api/parent/lock|target`, `POST /api/class`, `POST /api/class/join`, `GET /api/class/:id`, `GET /api/class/:id/recap` (CSV)

## Status jujur (v1, diverifikasi 2026-11-15)

**Sudah jalan dan dites:**
- `npm run build` hijau (vite build + `tsc -p tsconfig.server.json --noEmit`).
- Server boot, migrasi 0001–0003 teraplikasi, seed: **51 produk**
  (13 SD aktif di katalog pembeli, 38 non-SD `active=0`), **148 bab**,
  **740 flashcard**, **3.396 soal**, **58 simulasi**.
- Katalog mengembalikan tepat 13 produk SD (`k1`–`k6`, `mtk-sd`,
  `sas-k1-s1`, `sas-k2`–`sas-k6`).
- Register/login (password salah → 401), WhatsApp ternormalisasi ke `62xx`,
  `/api/auth/me`, tracker (streak + skor tersimpan).
- Study pack Kelas 1: 26 bab + 7 simulasi; kuis 10 soal per bab tanpa jawaban
  bocor ke klien. Kuis dinilai server (2/10 pada jawaban asal + pembahasan).
- Simulasi Kelas 3 Matematika: 35 soal dengan komposisi tepat (15 PG, 3 PG
  kompleks, 5 B/S, 5 Menjodohkan, 5 Isian, 2 Uraian); submit semua-benar
  menghasilkan **64/64** — penilaian keenam tipe soal terverifikasi.
- `sas-k1-s1`: 10 simulasi (5 mapel × Paket A/B) @30 soal.
- Pencarian "pythagoras" mengembalikan kosong (benar: tidak ada di produk SD).
- Checkout tanpa kredensial KlikQRIS menolak 503 dengan pesan jelas;
  checkout dengan nomor WA tidak valid menolak 400.
- PDF struk/worksheet/produk ter-generate (header `%PDF-` terverifikasi,
  isi teks dicek dengan `pdftotext` — struk memuat no. order, pembeli,
  LUNAS, dan total yang benar).
- **Cloudflare-ready (diverifikasi 2026-11-15, tanpa akun Cloudflare):**
  - `npm run build` hijau; `wrangler deploy --dry-run` hijau tanpa auth
    (konfigurasi valid, 39 file aset = 1.175 KB / 295,9 KB gzip, binding
    D1 + ASSETS + `RESEND_FROM` terbaca).
  - `wrangler d1 migrations apply ringkas-db --local`: 3/3 migrasi ✅.
  - `wrangler d1 execute ringkas-db --local --file=server/seed/seed.sql`:
    seed masuk D1 lokal dengan jumlah sama persis seperti Node — 51 produk
    (13 aktif), 148 bab, 740 flashcard, 3.396 soal, 58 simulasi.
  - `wrangler dev --local` (port 8788): `/api/health` OK, katalog tepat
    13 produk SD, register + login (password salah → 401), study pack
    Kelas 1 = 26 bab + 7 simulasi, simulasi Kelas 3 Matematika = 35 soal
    / 70 menit, submit kuis = 0/10 dengan 10 review, struk + worksheet +
    unduhan produk mengembalikan PDF valid (`%PDF-1.7`, isi terverifikasi),
    SPA tersaji di `/` dan `/katalog` (fallback 200), upload admin
    menolak 501 dengan pesan R2 yang jelas.
  - Study pack dioptimasi ke query batch (`IN (...)`): Kelas 1 turun dari
    ~59 menjadi ~8 query D1 per request — penting karena D1 Free punya
    batas query per invocation Worker (lihat "Batasan Cloudflare").

**Masih stub / batasan — jangan diklaim selesai:**
- **Pembayaran KlikQRIS belum dites dengan uang asli.** Butuh
  `KLIKQRIS_API_KEY` + `KLIKQRIS_MERCHANT_ID` asli; URL webhook
  (`POST /api/webhook/klikqris`) harus terdaftar di dashboard KlikQRIS agar
  pelunasan otomatis jalan (sementara polling status adalah mekanismenya).
  Kode webhook idempotent (order PAID tepat satu kali), tapi belum ada
  transaksi nyata yang membuktikannya.
- **Email belum di-wire.** `getOrderEmailData` hanya menyediakan variabel;
  template ada di `email-templates/` (root repo). Trigger register /
  checkout / PAID / kedaluwarsa / mingguan didokumentasikan di
  `API_CONTRACT.md`, belum dipanggil otomatis.
- **WhatsApp hanya tautan `wa.me`** (pesan siap kirim, bukan pengiriman
  otomatis server). Kirim otomatis butuh WhatsApp Business API + kredensial
  bisnis terpisah.
- **Konten Kelas 2–6 adalah kerangka generator** (topik + rangkuman singkat
  + kuis dari template). **Hanya Kelas 1 yang ditulis penuh** dan benar
  (26 bab). Simulasi memakai bank soal + generator deterministik; Paket B
  produk `sas-k1-s1` berbeda soal dari Paket A; simulasi kelas lain hanya
  Paket A di v1.
- **Harga produk non-SD di seed adalah perkiraan** dari rentang katalog
  awal (bukan salinan harga live).
- Study pack bisa dibuka akun mana pun yang login (kepemilikan ditampilkan,
  tidak di-hard-gate ke order PAID) — sama seperti versi hosting; worksheet
  PDF dan unduhan produk tetap hanya untuk pemilik LUNAS.
- Gambar produk disimpan sebagai berkas lokal di `app/uploads/` (cukup
  untuk self-host kecil; untuk produksi pakai object storage). **Di
  Cloudflare Workers, upload gambar TIDAK persisten** — endpoint upload
  admin sengaja mengembalikan 501 (`"Upload gambar tidak tersedia di
  deployment Cloudflare..."`) sampai R2 dipasang (lihat "Batasan
  Cloudflare"). Gambar yang sudah ada di `app/uploads/` sebelum deploy
  juga tidak ikut ter-deploy.
- Frontend adalah SPA (`ssr = false`) — SEO terbatas.
- SQLite cukup untuk skala kecil; bila ribuan pengguna bersamaan (terutama
  saat ujian), pindah ke Postgres/Turso dan tambahkan cache + CDN.
- Tidak ada pengguna admin bawaan (pakai `npm run make-admin`).

## Deploy ke Cloudflare

**Hanya pemilik yang menjalankan bagian ini, di akun Cloudflare-nya
sendiri.** Tidak ada langkah di bawah ini yang dijalankan dari repo ini —
semuanya perintah pemilik di terminalnya. Persyaratan: Node.js ≥ 22.5,
npm, dan akun Cloudflare (paket Free cukup untuk mulai).

### Langkah 1 — Login & buat database D1

```bash
cd app
wrangler login
wrangler d1 create ringkas-db
```

Salin `database_id` (UUID) dari output perintah terakhir, lalu isi ke
`wrangler.toml` menggantikan placeholder
`00000000-0000-0000-0000-000000000000` (ditandai `TO-FILL`).

### Langkah 2 — Migrasi + seed database remote

```bash
wrangler d1 migrations apply ringkas-db --remote
npm run seed:dump
wrangler d1 execute ringkas-db --remote --file=server/seed/seed.sql
```

`seed.sql` berisi INSERT dari seed lokal (~4.400 baris, ~1,9 MB). Bila
seed di `server/seed/` diubah di kemudian hari, jalankan lagi
`npm run seed:dump` lalu `db:seed:remote` — D1 tidak men-seed sendiri.

### Langkah 3 — Secret (satu per satu, nilainya TIDAK ada di repo)

```bash
wrangler secret put SESSION_SECRET
wrangler secret put KLIKQRIS_API_KEY
wrangler secret put KLIKQRIS_MERCHANT_ID
wrangler secret put KLIKQRIS_WEBHOOK_SECRET
wrangler secret put RESEND_API_KEY
```

Setiap perintah meminta nilainya secara interaktif (tidak tertulis di
terminal/history). Tanpa `KLIKQRIS_API_KEY` + `KLIKQRIS_MERCHANT_ID`,
checkout menolak 503 — isi aplikasi lain tetap jalan.

**`RESEND_API_KEY` wajib diisi agar email otomatis terkirim** (ambil
dari resend.com → API Keys). Bila kunci ini belum ada, aplikasi tetap
jalan normal, tapi setiap pengiriman email **dilewati dan dicatat di log**
Worker (`[email] RESEND_API_KEY belum disetel …`) — tidak ada error yang
terlihat pembeli, dan tidak ada email yang tertahan untuk dikirim ulang
nanti; begitu kunci diisi, email berikutnya (register/checkout/lunas/
kedaluwarsa) terkirim seperti biasa. Order yang sudah lunas sebelum kunci
diisi tidak dikirimi email susulan.

### Email otomatis (Resend)

Template transaksional disalin ke `server/email-templates/` (01–04) dan
ikut ter-bundle di Worker. Pengirim: `Ringkas <halo@ringkas.by-rj.com>`
(var `RESEND_FROM` di `wrangler.toml`); domain `ringkas.by-rj.com`
sudah terverifikasi di Resend. Pemicu:

| Peristiwa | Template | Sekali per |
|---|---|---|
| Akun baru terdaftar | 01 selamat datang | pengguna |
| Checkout berhasil, QRIS dibuat | 02 menunggu bayar | order |
| PAID terdeteksi (webhook / polling status) | 03 lunas | order |
| EXPIRED terdeteksi (pemeriksaan status) | 04 kedaluwarsa | order |

Idempotensi dicatat di tabel `sent_emails` (migrasi `0004`): satu
order tidak menerima email yang sama dua kali, walau webhook dan
polling sama-sama mendeteksi PAID. **Template 05 (laporan mingguan
orang tua) belum di-wire** — butuh cron/scheduler terpisah; data
laporannya sudah tersedia di server (`/api/parent/children` +
tracker). Bila migrasi `0004` belum diterapkan di D1 remote, jalankan
`wrangler d1 migrations apply ringkas-db --remote` sebelum deploy
(atau email gagal dicatat dan pemicu dilewati dengan log error).

Cara menguji: setelah deploy + `RESEND_API_KEY` terisi, buat satu
order tes nominal kecil dan bayar — email "menunggu bayar" terkirim
saat checkout, email "lunas" terkirim saat status jadi PAID.

### Langkah 4 — Build & deploy

```bash
npm run build
wrangler deploy
```

Aplikasi terbit di `https://ringkas.<subdomain-anda>.workers.dev`.
Periksa: buka URL itu, katalog harus menampilkan 13 produk SD.

### Langkah 5 — Domain sendiri `ringkas.by-rj.com`

1. Di dashboard Cloudflare → Workers & Pages → Worker `ringkas` →
   Settings → Domains → **Add Custom Domain** → `ringkas.by-rj.com`.
2. Domain `by-rj.com` harus memakai nameserver Cloudflare (atau, bila
   DNS di tempat lain, tambahkan record CNAME `ringkas` →
   `ringkas.<subdomain-anda>.workers.dev`).
3. Tunggu sertifikat HTTPS aktif, lalu buka
   `https://ringkas.by-rj.com` dan uji checkout.

### Langkah 6 — Webhook KlikQRIS & admin pertama

1. Di dashboard KlikQRIS, daftarkan URL webhook:
   `https://ringkas.by-rj.com/api/webhook/klikqris`
   (atau `https://ringkas.<subdomain-anda>.workers.dev/api/webhook/klikqris`
   bila belum memakai domain sendiri).
2. Daftarkan satu akun lewat aplikasi, lalu jadikan admin langsung di D1:
   ```bash
   wrangler d1 execute ringkas-db --remote \
     --command="UPDATE users SET role='admin' WHERE email='email@anda.id';"
   ```
   Ganti `email@anda.id` dengan email akun tersebut. (Di self-host lokal,
   pakai `npm run make-admin -- email@anda.id`.)
3. Uji end-to-end dengan pembayaran QRIS asli nominal kecil: checkout →
   bayar → order jadi PAID → struk PDF bisa diunduh.

### Batasan Cloudflare (jujur)

- **D1 paket Free:** 5 juta baris dibaca/hari, 100 ribu baris
  ditulis/hari, penyimpanan 5 GB per akun (maks 500 MB per database),
  10 database per akun; limit reset 00:00 UTC dan query gagal bila
  terlampaui. Paket berbayar ($5/bulan): 25 miliar baca/bulan,
  50 juta tulis/bulan, 10 GB per database. D1 single-threaded dan
  tidak mendukung BigInt; foreign key ditegakkan (migrasi sudah
  memakainya). Per invocation Worker, disarankan menjaga jumlah query
  tetap sedikit (dokumen Cloudflare menyebut kisaran ~50 di Free) —
  endpoint study pack sudah dioptimasi ke query batch.
- **Upload gambar tidak persisten di Workers** (`app/uploads/` lokal
  tidak ikut deploy dan filesystem Worker bersifat sementara). Endpoint
  upload admin mengembalikan 501 sampai R2 dipasang. Perbaikan yang
  disarankan: buat bucket R2, tambahkan binding `R2` di `wrangler.toml`,
  implementasikan `R2ImageStorage` di `server/storage.ts`, dan sajikan
  `/uploads/*` dari R2 di `server/worker.ts`.
- **PDF sudah aman di Workers** (pdf-lib, pure JS) — struk, worksheet,
  dan unduhan produk terverifikasi di `wrangler dev --local`.
- **Email belum di-wire** — template ada di `email-templates/` (root
  repo); `getOrderEmailData` hanya menyediakan variabel. Kirim otomatis
  (register/checkout/PAID/kedaluwarsa) belum dibangun.
- **Tidak ada cron/queues.** Laporan mingguan orang tua, pengingat, dan
  tugas berkala lain belum dijadwalkan — bila perlu, tambahkan
  Cloudflare Cron Trigger (`[triggers] crons`) terpisah.
- **Tidak ada migrasi data dari hosting Muse.** Database D1 mulai dari
  seed baru; akun dan order lama tidak ikut pindah.
- Deploy nyata (remote) belum pernah dijalankan dari repo ini — semua
  verifikasi di atas memakai `wrangler dev --local` dan
  `wrangler deploy --dry-run` tanpa akun.

## Deploy self-host (garis besar)

1. Server Linux + Node ≥ 22.5, `npm ci`, salin `.env` berisi secret.
2. `npm run build && npm start` (atau jalankan di balik reverse proxy dengan
   HTTPS; webhook KlikQRIS wajib URL publik HTTPS).
3. Backup `data/ringkas.db` dan `uploads/` secara berkala.
4. Daftarkan webhook KlikQRIS ke `https://<domain>/api/webhook/klikqris`.
