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

## Arsitektur

```
app/
  src/            Frontend SvelteKit 5 (SPA, adapter-static)
    routes/       Beranda, Katalog, Produk [slug], Keranjang, Checkout,
                  Pesanan, Akun, Belajar [product]/[chapter], Admin
    lib/          api.ts (fetch + token), store.ts (auth + cart)
  server/         Backend Hono (Node)
    index.ts      Rakitan app: migrasi, seed, /api, static build/ + /uploads/
    actions.ts    Semua endpoint (lihat API_CONTRACT.md)
    klikqris.ts   create/status/webhook KlikQRIS (env saja)
    pdf.ts        Struk, worksheet, PDF rangkuman (pdfkit)
    email.ts      getOrderEmailData (variabel template email)
    db.ts         Wrapper node:sqlite + tipe baris
    migrations/   0001_init, 0002_study_family, 0003_orders_expired_at
    seed/         products.ts (46+5 produk), study.ts (bank soal +
                  generator simulasi + konten bab), seed.ts
  API_CONTRACT.md Kontrak endpoint + bentuk soal (mengikat)
  build/          Hasil `npm run build` (tidak di-commit)
  data/           File SQLite (tidak di-commit)
  uploads/        Gambar produk yang diunggah admin (tidak di-commit)
```

Frontend memanggil `/api/...` (di-dev diproxy Vite ke `:8787`; di-prod
satu server Hono yang sama menyajikan frontend + API). Auth memakai token
sesi acak di tabel `sessions`, dikirim sebagai `Authorization: Bearer`.

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
- PDF struk/worksheet/produk ter-generate (header `%PDF-` terverifikasi).

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
  untuk self-host kecil; untuk produksi pakai object storage).
- Frontend adalah SPA (`ssr = false`) — SEO terbatas.
- SQLite cukup untuk skala kecil; bila ribuan pengguna bersamaan (terutama
  saat ujian), pindah ke Postgres/Turso dan tambahkan cache + CDN.
- Tidak ada pengguna admin bawaan (pakai `npm run make-admin`).

## Deploy (garis besar)

1. Server Linux + Node ≥ 22.5, `npm ci`, salin `.env` berisi secret.
2. `npm run build && npm start` (atau jalankan di balik reverse proxy dengan
   HTTPS; webhook KlikQRIS wajib URL publik HTTPS).
3. Backup `data/ringkas.db` dan `uploads/` secara berkala.
4. Daftarkan webhook KlikQRIS ke `https://<domain>/api/webhook/klikqris`.
