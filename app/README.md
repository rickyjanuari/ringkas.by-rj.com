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
- Katalog: `GET /api/catalog`, `GET /api/products/:id` (menambah `bundleItems` bila produk bundel)
- Admin: `GET/POST/PUT/DELETE /api/admin/products`, `POST .../active`, `.../external-link`, `.../images`, `.../feature`, `DELETE /api/admin/images/:id`, `GET /api/admin/users`, `POST /api/admin/users/:id/role`, `POST /api/admin/chapters/:id/video`, `GET/POST /api/admin/vouchers`, `POST /api/admin/vouchers/:code/active`, `POST /api/admin/cron/run` (`{job: 'daily'|'weekly', date?}`)
- Checkout KlikQRIS: `POST /api/checkout` (idempotency key, `voucher_code` opsional), `GET /api/voucher/validate?code=&total=`, `GET /api/payment/status/:order_id`, `POST /api/webhook/klikqris`
- Order: `GET /api/orders`, `GET /api/orders/:id/receipt` (PDF), `GET /api/orders/:id/download/:product_id` (PDF), `GET /api/order-email-data/:order_id`
- Belajar: `GET /api/study/:product_id` (bab/simulasi membawa `free`/`locked` — Coba Gratis), `GET /api/simulations/:id/questions`, `POST /api/quiz/submit` (balasan membawa `attempt_id` + `passed`), `GET /api/certificate/:attemptId` (PDF sertifikat, lulus ≥ 70%), `POST /api/study/chapter-done`, `POST /api/bookmark|note`, `GET /api/search`, `GET /api/daily`, `GET /api/tracker`, `GET /api/stickers`, `GET /api/study/:product_id/:chapter_id/worksheet`
- Keluarga & kelas: `POST /api/parent/link|redeem`, `GET /api/parent/children`, `POST /api/parent/lock|target`, `POST /api/class`, `POST /api/class/join`, `GET /api/class/:id`, `GET /api/class/:id/recap` (CSV)
- Admin statistik: `GET /api/admin/stats` (hanya admin) — kartu Ringkasan + 10 order terbaru

## Tampilan responsif & dashboard admin (2026-11-15)

**Mobile (di bawah 1024px) — tidak berubah:** seluruh UI hidup di kolom HP
(max 430px, terpusat, latar titik-titik), bottom tab bar 5 tab (Beranda,
Katalog, Keranjang tombol tengah terangkat, Pesanan, Akun), carousel promo,
grid produk 2 kolom, detail/checkout sebagai layar dorong (back chevron +
judul tengah + sticky buy bar), Blog/FAQ/Update/Privasi/Syarat sebagai bottom
sheet dari Akun.

**Desktop (breakpoint `lg`, 1024px ke atas):** container melebar
(`max-w-7xl`, latar kertas polos tanpa titik-titik) dan bottom tab bar
disembunyikan (`lg:hidden`). Sebagai gantinya ada **top bar sticky**
(`hidden lg:flex`): logo Ringkas + menu Beranda / Katalog / Pesanan / Akun
+ kotak pencarian + tombol keranjang dengan badge jumlah. Pencarian di top
bar mengirim ke `/katalog?q=...`; halaman katalog membaca `?q=` saat mount
maupun saat query berubah. Beranda: carousel tetap lebar penuh di atas
(diperbesar), grid produk 3 kolom (tablet) / 4 kolom (desktop). Katalog:
sidebar filter kiri (jenjang + mapel + urutkan, sticky) + grid produk kanan;
kartu produk memakai markup yang sama, berubah dari baris (mobile) menjadi
kartu grid (tablet/desktop) lewat class responsif. Detail produk: dua kolom
(galeri/info kiri, panel beli sticky kanan). Checkout: dua kolom (form kiri,
ringkasan order sticky kanan). Keranjang/Pesanan/Akun/Belajar: dua kolom
(konten + panel samping sticky). Halaman info (Blog/FAQ/Update/Privasi/
Syarat) jadi halaman lebar baca (`max-w-3xl`); BottomSheet dari Akun tetap
bottom sheet di mobile dan menjadi dialog tengah (`max-w-2xl`) di desktop.
Semua perubahan hanya class responsif Tailwind (`md:`/`lg:`) di komponen
yang sama — tidak ada duplikasi halaman mobile/desktop, tidak ada perubahan
logika, harga, atau gating.

**Dashboard admin (`/admin`, role admin saja):** shell dashboard dengan
sidebar kiri (desktop) / drawer (mobile, tombol hamburger) berisi menu
Ringkasan, Produk, Voucher, Pengguna, Video per Bab, Email & Cron; header
menampilkan judul halaman + nama admin yang login.
- **Ringkasan** (tab default): 8 kartu dari `GET /api/admin/stats` — total
  produk (tampil/tersembunyi), pengguna, total order, order lunas, pendapatan
  (SUM `total_amount` order PAID), voucher aktif, email terkirim
  (`sent_emails`) — + 10 order terbaru (pembeli, produk, total, status).
  Semua angka dari database asli.
- **Produk:** tabel (cover mini, judul, jenjang/mapel, harga + coret, badge
  TAMPIL/TERSEMBUNYI + BUNDEL, aksi Edit / Sembunyikan-Tampilkan / Hapus /
  "Gambar & Link" untuk link eksternal + upload feature/gallery); pencarian
  + filter jenjang; form tambah/edit jadi modal dengan semua field lama
  (judul, jenjang, mapel, harga, harga coret, halaman, kategori, label
  cover, warna cover, badge, deskripsi, link eksternal). Di mobile tabel
  jadi kartu per produk.
- **Voucher / Pengguna / Video per Bab / Email & Cron:** panel yang sudah
  ada dipindah ke shell dashboard (pengguna jadi tabel di desktop); semua
  fungsi tetap: buat/nonaktifkan voucher, ubah role (guard demote diri
  sendiri tetap di server), set video per bab, jalankan cron manual.

## Status jujur (v1, diverifikasi 2026-11-15)

**Peta Belajar (2026-11-15):** satu peta visual per produk kelas (`k1`–`k6`)
di rute `/peta-belajar/[product]` — bab-bab menjadi node di jalur SVG
berkelok (sinus), dengan state dari tracker asli: selesai (emerald +
centang), saat ini (marigold + denyut), belum (putih + nomor), terkunci
(abu-abu + gembok, ketuk → pemberitahuan + "Beli untuk membuka", sama
seperti di Ruang Belajar). Header peta: ringkasan "X dari N bab selesai"
+ bilah progres + tombol Lanjut ke bab saat ini. Label bab di sisi node
(desktop) atau di bawah node (bila sempit). Pintu masuk: kartu "Peta
Belajar" di Beranda (chip Kelas 1–6), tombol di halaman Belajar, kartu
di Akun/tracker. Tidak ada endpoint/tabel/migrasi baru — peta memakai
ulang `GET /api/study/:product_id` + `GET /api/tracker`. Tab bar bawah
disembunyikan di rute ini (seperti halaman Belajar).

**Sudah jalan dan dites:**
- `npm run build` hijau (vite build + `tsc -p tsconfig.server.json --noEmit`).
- Server boot, migrasi 0001–0005 teraplikasi, seed: **57 produk**
  (19 SD aktif di katalog pembeli — 13 produk + 6 bundel kelas,
  38 non-SD `active=0`), **148 bab**,
  **740 flashcard**, **3.396 soal**, **58 simulasi**.
- Katalog mengembalikan tepat 19 produk SD (`k1`–`k6`, `mtk-sd`,
  `sas-k1-s1`, `sas-k2`–`sas-k6`, `bundle-k1`–`bundle-k6`).
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
  - `wrangler d1 migrations apply ringkas-db --local`: 5/5 migrasi ✅.
  - `wrangler d1 execute ringkas-db --local --file=server/seed/seed.sql`:
    seed masuk D1 lokal dengan jumlah sama persis seperti Node — 57 produk
    (19 aktif), 148 bab, 740 flashcard, 3.396 soal, 58 simulasi.
  - `wrangler dev --local` (port 8788): `/api/health` OK, katalog tepat
    19 produk SD, register + login (password salah → 401), study pack
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
- **Fitur baru (2026-11-15, diverifikasi end-to-end lokal dengan fetch
  KlikQRIS + Resend di-stub — 56/56 cek lolos, lihat
  `server/migrations/0005_fiturs_baru.sql`):**
  - **Kode voucher** — tabel `vouchers`, admin buat/lihat/nonaktifkan
    (`/api/admin/vouchers`); checkout menerima `voucher_code` (validasi
    server-side: aktif, belum kedaluwarsa, kuota, min. belanja); diskon
    persen/nominal mengurangi total SEBELUM create KlikQRIS; total akhir
    minimal Rp100; `uses` bertambah saat order dibuat dan TIDAK kembali
    bila order kedaluwarsa (anti-abuse); retry checkout dengan voucher
    yang sama mengembalikan order PENDING yang sama.
  - **Paket bundel Kelas 1–6** — `bundle-k1`–`bundle-k6`, masing-masing
    berisi produk kelas + paket SAS kelas itu (K1 Rp28.800, K2 Rp28.800,
    K3 Rp29.600, K4 Rp30.400, K5 Rp31.200, K6 Rp32.000 = harga satuan −
    20%); order bundel menyimpan SEMUA product_id anggotanya di items,
    jadi kepemilikan/unduhan tiap produk jalan lewat jalur yang sudah ada.
  - **Coba gratis** — bab pertama tiap produk + simulasi pertama tiap
    mapel (Paket A) terbuka untuk semua akun login (flag `free` di study
    pack); bab/simulasi lain terkunci (`locked`, hanya metadata) bila
    produk belum dibeli — submit kuis/soal simulasi terkunci menolak 403.
    Worksheet dan unduhan produk tetap hanya untuk pemilik LUNAS.
    **Perubahan perilaku:** study pack sebelumnya terbuka untuk semua
    akun login; sejak fitur ini, konten non-gratis di-hard-gate ke
    kepemilikan (dulu hanya worksheet/unduhan yang di-gate).
  - **Sertifikat penyelesaian** — simulasi SAS lulus (skor ≥ 70%)
    bisa diunduh sebagai PDF A4 landscape (`GET /api/certificate/:attemptId`,
    nomor `SRT-000123`); gagal < 70% → 400, milik orang lain → 403.
  - **Pengingat belajar + ucapan streak (cron harian)** dan **laporan
    mingguan orang tua (cron mingguan)** — lihat bagian "Email otomatis
    & cron" di bawah.
- **Email otomatis (Resend) sudah di-wire** — register → 01, checkout →
  02, PAID → 03, EXPIRED → 04, plus cron 05/06/07 (lihat bagian "Email
  otomatis & cron"). Render + idempotensi teruji di level modul dan
  end-to-end lokal (fetch Resend di-stub); pengiriman sampai inbox
  BELUM teruji tanpa `RESEND_API_KEY` di Worker — lihat catatan di
  bawah.
- **Cron Cloudflare sudah dipasang** (`[triggers] crons` di
  `wrangler.toml` + `scheduled` handler di `server/worker.ts`);
  penembakan cron sungguhan di Cloudflare BELUM teruji dari repo ini
  (butuh deploy) — uji manual tersedia lewat `POST /api/admin/cron/run`.
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
- Study pack kini di-hard-gate ke kepemilikan kecuali konten gratis
  (bab pertama + simulasi Paket A tiap mapel) — worksheet PDF dan
  unduhan produk tetap hanya untuk pemilik LUNAS.
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

### Email otomatis & cron (Resend)

Template disalin ke `server/email-templates/` (01–07) dan ikut
ter-bundle di Worker. Pengirim: `Ringkas <halo@ringkas.by-rj.com>`
(var `RESEND_FROM` di `wrangler.toml`); domain `ringkas.by-rj.com`
sudah terverifikasi di Resend. Pemicu:

| Peristiwa | Template | Sekali per |
|---|---|---|
| Akun baru terdaftar | 01 selamat datang | pengguna |
| Checkout berhasil, QRIS dibuat | 02 menunggu bayar | order |
| PAID terdeteksi (webhook / polling status) | 03 lunas | order |
| EXPIRED terdeteksi (pemeriksaan status) | 04 kedaluwarsa | order |
| Cron mingguan (Minggu 18:00 WIB) | 05 laporan mingguan orang tua | anak + minggu ISO |
| Cron harian (07:00 WIB), anak 3 hari tidak belajar | 06 pengingat belajar | anak + hari |
| Cron harian (07:00 WIB), streak 7/14/21/28 hari | 07 ucapan streak | anak + milestone + hari |

Idempotensi dicatat di tabel `sent_emails` (migrasi `0004`, kolom
`period` ditambah migrasi `0005`): satu order tidak menerima email
yang sama dua kali, walau webhook dan polling sama-sama mendeteksi
PAID; email cron memakai kunci periode gabungan per anak
(`reminder:<childId>:<YYYY-MM-DD>`,
`streak:<childId>:<milestone>:<YYYY-MM-DD>`,
`weekly:<childId>:<YYYY-Www>`) — jalan kedua di periode yang sama
menjadi no-op. Bila migrasi `0004`/`0005` belum diterapkan di D1
remote, jalankan `wrangler d1 migrations apply ringkas-db --remote`
sebelum deploy (atau email gagal dicatat dan pemicu dilewati dengan
log error).

**Cron** — jadwal di `wrangler.toml` (`[triggers] crons`):
`0 0 * * *` (tiap hari 00:00 UTC = 07:00 WIB: pengingat + streak)
dan `0 11 * * 0` (tiap Minggu 11:00 UTC = 18:00 WIB: laporan
mingguan). Handler-nya di `server/worker.ts` (`scheduled`) dan logika
di `server/cron.ts`. Uji manual tanpa menunggu cron: admin dapat
menjalankan `POST /api/admin/cron/run` dengan body
`{job: "daily"|"weekly", date?: "YYYY-MM-DD"}` (tanggal opsional
untuk menguji hari tertentu) — mengembalikan `{sent, skipped,
errors}`. Pengiriman cron tetap mengikuti pola yang sama: tanpa
`RESEND_API_KEY`, email dilewati + dicatat di log, cron selesai
dengan sukses.

Cara menguji: setelah deploy + `RESEND_API_KEY` terisi, buat satu
order tes nominal kecil dan bayar — email "menunggu bayar" terkirim
saat checkout, email "lunas" terkirim saat status jadi PAID. Untuk
cron, jalankan endpoint admin manual di atas dan periksa inbox orang
tua yang tertaut (Mode Orang Tua).

### Langkah 4 — Build & deploy

```bash
npm run build
wrangler deploy
```

Aplikasi terbit di `https://ringkas.<subdomain-anda>.workers.dev`.
Periksa: buka URL itu, katalog harus menampilkan 19 produk SD.

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
- **Email & cron butuh `RESEND_API_KEY` di Worker** — tanpa kunci,
  pengiriman dilewati + dicatat di log (aplikasi dan cron tetap jalan).
  Pengiriman sampai inbox dan penembakan cron sungguhan di Cloudflare
  belum teruji dari repo ini (butuh deploy + kunci); uji manual cron
  tersedia lewat `POST /api/admin/cron/run`.
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
