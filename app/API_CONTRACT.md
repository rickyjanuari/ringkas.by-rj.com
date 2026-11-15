# API_CONTRACT.md — Kontrak antar modul app/ Ringkas

Dokumen ini MENGIKAT semua modul. Jangan ubah nama file, nama fungsi,
atau bentuk endpoint di bawah ini tanpa mengubah dokumen ini juga.

## Modul dan pemilik berkas

| Berkas | Isi |
|---|---|
| `server/db.ts` | (sudah ada) Kelas `DB`, tipe baris, `openDatabase`, `newId`, `nowIso`. |
| `server/index.ts` | (sudah ada) Hono app, migrasi, seed saat boot, static `build/` + `/uploads/`. |
| `server/seed/seed.ts` | `export async function seedDatabase(db: DB): Promise<void>` — idempotent: tidak berbuat apa-apa bila tabel `products` sudah berisi baris. Dipanggil `index.ts` saat boot dan script `server/scripts/seed.ts`. |
| `server/seed/study.ts` | Bank soal + generator simulasi + konten bab. Lihat "Study". |
| `server/seed/products.ts` | Daftar 46 produk seed (boleh dipecah dari `seed.ts`, asalkan `seed.ts` yang menggunakannya). |
| `server/actions.ts` | `export function registerRoutes(app: Hono, db: DB): void` — semua endpoint di bawah. |
| `server/klikqris.ts` | `createQris(orderId, amount, keterangan)`, `checkQrisStatus(orderId)`, `verifyWebhookSignature(payload, signature)`. Semua kredensial dari `process.env`. |
| `server/pdf.ts` | `receiptPdf(order, items)` → `Buffer`, `worksheetPdf(chapter, questions)` → `Buffer`, `productPdf(product, chapters)` → `Buffer` (PDF rangkuman produk). |
| `server/email.ts` | `getOrderEmailData(db, orderId)` → variabel template (lihat "Email"). |
| `server/scripts/seed.ts` | CLI: buka DB, migrasi, `seedDatabase`, lalu exit. |
| `server/scripts/make-admin.ts` | CLI: `npm run make-admin -- email@contoh.id` → set `role='admin'` untuk pengguna itu (gagal bila email tidak ada). |
| `src/lib/api.ts` | `api(path, opts?)` (fetch + token), `getToken/setToken/clearToken`, tipe `Product`, `Order`, `StudyPack`, dsb. |
| `src/lib/store.ts` | Auth store + cart store (localStorage: `ringkas_token`, `ringkas_cart`). |
| `src/routes/**` | Halaman Svelte (lihat "Frontend"). |

## Aturan umum

- Bahasa UI: Indonesia. Gaya belajar SD: "teman belajar" — "teman-teman"/"kamu", kalimat pendek, tanpa nama karakter, tanpa sapaan berbasis gender.
- **Dilarang keras**: membaca/menyalin/membuka apa pun di bawah `~/workspace/ts-spaces/`, `~/workspace/space_data/`, `~/workspace/space-versions/`. Semua kode di sini ORISINAL.
- **Dilarang keras**: secret apa pun di kode (tanpa KlikQRIS key/merchant id, tanpa password, tanpa Resend key, tanpa file .db). Secret hanya dari `process.env`.
- Auth: token sesi acak di tabel `sessions`, dikirim `Authorization: Bearer <token>`. `registerRoutes` memakai helper internal `requireAuth(c, db)` dan `requireAdmin(c, db)`.
- Semua respon JSON; error memakai `{ "error": "<pesan Indonesia>" }` + status HTTP yang tepat (400 validasi, 401 belum login, 403 bukan pemilik/bukan admin, 404 tidak ada, 503 layanan luar belum dikonfigurasi).
- Uang dalam rupiah integer (tanpa desimal). Tanggal string ISO.
- Nomor WhatsApp: normalisasi ke `62xx` (hapus spasi/strip, `08..` → `628..`, `+62..` → `62..`); tolak bila setelah normalisasi bukan `62` + 9–13 digit.

## Skema `questions` — arti `options` dan `answer` per tipe

- `pg`: `options` = JSON array string (3 opsi untuk Kelas 1–2, 3–4 untuk Kelas 3–6). `answer` = teks opsi yang benar. `points` = 1 (Kelas 1–2) atau sesuai tabel simulasi.
- `pg_kompleks`: `options` = JSON array string (4–5 opsi). `answer` = JSON array string berisi SEMUA opsi benar. Nilai proporsional: benar sebagian → poin = `points * (benarDipilih / jumlahBenar)`, tanpa pengurangan untuk opsi salah. `points` = 2.
- `bs`: `options` = null. `answer` = `Benar` atau `Salah`. `points` = 1.
- `menjodohkan`: `options` = JSON `{"left": string[5], "right": string[5]}` (kanan berlabel a–e menurut indeks). `answer` = JSON object `{"0":"b","1":"a",...}` (indeks kiri → huruf kanan). `points` = 5 (1 poin per pasangan benar).
- `isian`: `options` = null. `answer` = teks jawaban yang benar. Bandingkan setelah normalisasi (huruf kecil, spasi berlebih dirapikan). `points` = 1.
- `uraian`: `options` = null. `answer` = JSON array string kata kunci rubrik. Nilai = `points * (kataKunciDitemukan / jumlahKataKunci)`, dibulatkan ke bawah. `points` = 4 (Kelas 3), 5 (Kelas 4–6) — lihat tabel simulasi.

Jawaban kirim dari klien untuk `POST /api/quiz/submit` berbentuk object
`{ "<questionId>": <jawaban> }`, dengan jawaban berupa: string (pg/bs/isian),
string[] (pg_kompleks), object `{"0":"b",...}` (menjodohkan), string (uraian).

## Study — struktur konten dan simulasi

### Tabel baku simulasi SAS (per kelas)

| Kelas | PG | PG kompleks | B/S | Menjodohkan | Isian | Uraian | Total | Waktu |
|---|---|---|---|---|---|---|---|---|
| 1 | 10 | – | 5 | 5 | 5 | – | 25 | 60 mnt |
| 2 | 10 | – | 5 | 5 | 5 | – | 25 | 60 mnt |
| 3 | 15 | 3 | 5 | 5 | 5 | 2 | 35 | 70 mnt |
| 4 | 15 | 5 | 5 | 5 | 5 | 3 | 38 | 80 mnt |
| 5 | 15 | 5 | 5 | 5 | 5 | 4 | 39 | 90 mnt |
| 6 | 15 | 5 | 5 | 5 | 5 | 5 | 40 | 90 mnt |

Poin per tipe: PG 1, PG kompleks 2, B/S 1, Menjodohkan 5 (satu set), Isian 1,
Uraian 4 (Kelas 3) / 5 (Kelas 4–6). `max_points` simulasi = jumlah poin.
Pengecualian `sas-k1-s1`: 10 simulasi (5 mapel × Paket A/B), @30 soal
(20 PG 3 opsi ×3 poin, 5 B/S ×4 poin, 5 Isian ×4 poin), `max_points` = 100,
waktu 60 menit.

### `server/seed/study.ts` — ekspor yang wajib ada

```ts
export interface GeneratedQuestion {
  type: "pg" | "pg_kompleks" | "bs" | "menjodohkan" | "isian" | "uraian";
  question: string;
  options: string[] | { left: string[]; right: string[] } | null;
  answer: string | string[] | Record<string, string>;
  discussion: string;
  points: number;
}
export function buildSimulationQuestions(
  subject: string, grade: number, paket: "A" | "B"
): GeneratedQuestion[];
export function dailyQuestions(dateISO: string, grade: number): GeneratedQuestion[];
```

`buildSimulationQuestions` harus mengembalikan tepat jumlah dan komposisi
tipe sesuai tabel di atas, Paket A ≠ Paket B (pilihan soal berbeda).
Soal Matematika boleh digenerasi (angka acak deterministik dari
`subject+grade+paket`); mapel lain dari bank soal per mapel. Bila bank tidak
cukup, turunkan varian dari soal bab (ubah format/angka) — dan catat di
`app/README.md` bahwa Paket B memakai ulang materi bab dengan format berbeda.

### Bab (chapters)

- Produk `k1`–`k6`: bab per mapel per semester (Matematika, B. Indonesia,
  IPAS, Pancasila, B. Inggris, PJOK, PAI, Seni Rupa — sesuaikan per kelas;
  Kelas 1 Semester 1: Matematika, B. Indonesia, IPAS, Pancasila, B. Inggris,
  PJOK, PAI, Seni Rupa).
- Setiap bab: `summary` (rangkuman kilat), `points` (JSON string[] poin inti,
  4–8 butir), `focus_text` (teks baca nyaman), 5 flashcard, kuis 10 soal `pg`
  + pembahasan teman-belajar.
- **Kelas 1: konten ditulis penuh dan benar** (materi Kurikulum Merdeka,
  Semester 1: Matematika membilang s.d. 10 + tambah/kurang s.d. 10 + bentuk +
  bilangan 11–20; B. Indonesia Bab 1–4; IPAS; Pancasila Bab 1–2; B. Inggris
  Unit 1–7; PJOK Bab 1–3; PAI Bab 1–5; Seni Rupa Bab 1–2).
- **Kelas 2–6: bab terisi topik + rangkuman singkat + kuis dari generator**
  (kerangka yang sama) — JUJUR dicatat sebagai kerangka di `app/README.md`.

### Subjek simulasi per produk kelas

- `k1`: Matematika, B. Indonesia, Pancasila, B. Inggris, PJOK, PAI, Seni Rupa (7).
- `k2`: + IPAS (8). `k3`–`k6`: 8 mapel (tambah IPAS; Kelas 3–6 IPAS).
- `mtk-sd`: 1 simulasi Matematika Kelas 1–6 campuran, 25 soal.
- `sas-k1-s1`: 10 simulasi (Matematika, B. Indonesia, Pancasila, B. Inggris, PJOK × Paket A/B).

## Endpoint (semua di bawah `/api/`)

### Auth & akun
- `POST /api/auth/register` `{name, email, password, whatsapp?}` → `{user, token}`. Email unik, password ≥ 6 karakter, hash bcryptjs, role awal `customer`. WhatsApp dinormalisasi.
- `POST /api/auth/login` `{email, password}` → `{user, token}`. 401 bila salah.
- `GET /api/auth/me` (Bearer) → `{user}`.
- `POST /api/auth/logout` (Bearer) → `{ok: true}` (hapus sesi).
- `POST /api/account/whatsapp` (Bearer) `{whatsapp}` → `{user}` (validasi + normalisasi).
- `GET /api/tracker` (Bearer) → `{streak, studyDays: string[], doneChapters: {product_id, chapter_id, done_at}[], badges: string[], stickers: {chapter_id, earned_at}[], scores: {id, kind, ref_id, score, max_score, created_at}[]}`. Streak = jumlah hari berurutan hingga hari ini. Badge: `Langkah Pertama` (1 bab), `Kolektor 7` (7 stiker), `Kolektor 14`, `Kolektor 21`, `Kolektor 28`, `Pejuang Simulasi` (1 simulasi selesai), `Nilai Sempurna` (skor 100%). `id` skor dipakai untuk mengunduh sertifikat (`GET /api/certificate/:id`).

### Katalog & produk
- `GET /api/catalog` → `{products: ProductPublic[]}` — hanya `active=1`. `ProductPublic`: semua kolom produk KECUALI `external_url` (tidak pernah bocor ke katalog).
- `GET /api/products/:id` → `{product: ProductPublic, chapters: ChapterMeta[], images: {id, url, kind}[], bundleItems: {product_id, title, price}[]}`. `ChapterMeta`: `{id, title, subject, grade, semester, sort_order, video_url, video_duration, short_url, short_duration}`. `bundleItems` kosong bila bukan bundel; berisi anggota bundel bila produk bundel (lihat "Bundel").
- `GET /api/admin/products` (admin) → `{products: Product[]}` — semua produk, termasuk `active=0` dan `external_url`.
- `POST /api/admin/products` (admin) body kolom produk → `{product}`.
- `PUT /api/admin/products/:id` (admin) → `{product}`.
- `DELETE /api/admin/products/:id` (admin) → `{ok: true}`.
- `POST /api/admin/products/:id/active` (admin) `{active: 0|1}` → `{product}`.
- `POST /api/admin/products/:id/external-link` (admin) `{url}` → `{product}`. Tolak URL bukan http/https.
- `POST /api/admin/products/:id/images` (admin) `{filename, dataUrl, kind: "feature"|"gallery"}` → `{image}`. Simpan berkas ke `app/uploads/<product_id>/`, URL tersimpan `/uploads/<product_id>/<nama-aman>`.
- `DELETE /api/admin/images/:id` (admin) → `{ok: true}` (hapus baris + berkas bila ada).
- `POST /api/admin/products/:id/feature` (admin) `{image_id}` → `{image}` (jadikan feature; feature lama jadi gallery).
- `GET /api/admin/users` (admin) → `{users: {id, name, email, role, whatsapp, created_at, order_count}[]}`.
- `POST /api/admin/users/:id/role` (admin) `{role: "admin"|"customer"}` → `{user}`. 403 bila admin mencoba mengubah role akunnya sendiri.
- `POST /api/admin/users/:id/reset-password` (admin) `{password}` → `{ok: true}`. Kata sandi baru minimal 8 karakter (400 bila kurang); 403 bila target adalah admin itu sendiri; 404 bila pengguna tidak ada. Hash bcryptjs salt 10, persis seperti register; kata sandi tidak pernah dikembalikan/di-log. Ini reset oleh admin, BUKAN alur lupa-kata-sandi mandiri — alur itu BELUM ada.
- `GET /api/admin/orders?q=&status=&page=1&limit=20` (admin) → `{orders: {id, buyer_name, buyer_email, products: string[], total, status, created_at, paid_at}[], total, page, pages}`. `q` cocok ke id order (LIKE) atau email pembeli; `status` harus PENDING/PAID/EXPIRED (400 bila lain); `limit` di-clamp 1–100. `products` = judul item yang dibayar (baris anggota bundel disembunyikan, seperti stats); `total` = `total_amount ?? total`.
- `GET /api/admin/orders/:id` (admin) → `{order: {id, user_id, buyer_name, buyer_email, whatsapp, items: {product_id, title, price, included_in_bundle?}[], total, total_amount, discount_amount, voucher_code, status, created_at, paid_at, expired_at, klikqris_order_id}}`. 404 bila tidak ada. Detail menampilkan SEMUA baris items, termasuk anggota bundel (`included_in_bundle`).
- `POST /api/admin/resend-email` (admin) `{orderId?, userId?, template: "welcome"|"pending"|"paid"|"expired"}` → `SendEmailResult` `{sent, skipped?, error?, resendId?}`. `welcome` butuh `userId`; `pending`/`paid`/`expired` butuh `orderId` (404 bila order/user tidak ada); `paid` menuntut status PAID (diperiksa di `sendPaidEmail` → `{sent: false, error: "Order belum lunas."}`). Mengirim dengan `force: true` (lihat "Email"). 400 bila template/body tidak valid.
- `GET /api/admin/export/orders.csv` (admin) → CSV (`text/csv; charset=utf-8`, `attachment; filename="rekap-order-ringkas.csv"`). Kolom: `order_id, tanggal_buat, tanggal_bayar, pembeli_nama, pembeli_email, whatsapp, produk, total, total_dibayar, kode_voucher, diskon, status`. Semua order (maks. 5000 baris), escape RFC 4180; `produk` = judul yang dibayar digabung `"; "`; `total_dibayar` = `total_amount ?? total`.
- `GET /api/admin/export/users.csv` (admin) → CSV (`attachment; filename="pengguna-ringkas.csv"`). Kolom: `nama, email, whatsapp, role, tanggal_daftar, jumlah_order` (COUNT orders).
- `GET /api/admin/settings` (admin) → `{settings: {announcement_text, announcement_enabled: 0|1, promo_text, promo_enabled: 0|1}}` (kunci yang belum ada = default). `POST /api/admin/settings` (admin) body parsial (teks maks. 500 karakter; saklar hanya 0/1) → `{settings}` yang tersimpan (UPSERT ke tabel `settings`, migrasi `0008`).
- `GET /api/announcement` (PUBLIK, tanpa auth) → `{announcement_text, announcement_enabled, promo_text, promo_enabled}` dari tabel `settings`.
- `POST /api/admin/chapters/:id/video` (admin) `{video_url, video_duration, short_url, short_duration}` → `{chapter}`. `video_url` kosong = hapus video. `short_url` = video pendek vertikal (9:16): boleh URL http/https atau path relatif situs (mis. `/shorts/membilang-10.html`); kosong = hapus video pendek. Tolak URL video bukan http/https bila terisi; tolak `short_url` yang bukan http/https dan bukan path `/...`.
- `GET /api/admin/vouchers` (admin) → `{vouchers: {code, type, value, max_uses, uses, min_total, expires_at, active, created_at}[]}`.
- `POST /api/admin/vouchers` (admin) `{code, type: "percent"|"fixed", value, max_uses?, min_total?, expires_at?}` → 201 `{voucher}`. Kode disimpan huruf besar; persen 1–100; `max_uses` null = tanpa batas.
- `POST /api/admin/vouchers/:code/active` (admin) `{active: 0|1}` → `{voucher}`.
- `POST /api/admin/cron/run` (admin) `{job: "daily"|"weekly", date?: "YYYY-MM-DD"}` → `{job, sent, skipped, errors: string[]}` (menjalankan pekerjaan cron secara manual, untuk uji).

### Checkout & order (KlikQRIS saja)
- `POST /api/checkout` (Bearer) `{items: string[], idempotency_key: string, whatsapp?: string, voucher_code?: string}` → `{order}`. Nomor WA opsional: bila diisi, dinormalisasi + divalidasi (400 bila tidak valid), disimpan sebagai snapshot di order, dan memperbarui nomor WA akun.
  - Validasi produk ada + aktif; total = jumlah harga.
  - Voucher (opsional): divalidasi server-side (aktif, belum kedaluwarsa, kuota `uses < max_uses`, total ≥ `min_total`); diskon persen (`floor(total*pct/100)`) atau nominal mengurangi total SEBELUM create KlikQRIS; total akhir minimal Rp100. `uses` bertambah saat order dibuat, TIDAK kembali bila order kedaluwarsa. Order menyimpan `voucher_code` + `discount_amount` (struk menampilkan baris diskon bila ada).
  - Idempotensi: bila ada order milik user yang sama dengan `idempotency_key` yang sama ATAU item + kode voucher sama dan status PENDING dan belum kedaluwarsa → kembalikan order itu (tanpa membuat order/QRIS baru, tanpa validasi voucher ulang).
  - `order.id` format `RM-<RANDOM>`; `klikqris_order_id` = `order.id`.
  - Bila `KLIKQRIS_API_KEY`/`KLIKQRIS_MERCHANT_ID` kosong → 503 `{error: "KlikQRIS belum dikonfigurasi..."}` (jangan buat order palsu LUNAS).
  - `server/klikqris.ts` `createQris` memanggil `POST https://klikqris.com/api/qrisv2/create`, header `x-api-key` + `id_merchant`, body `{order_id, id_merchant, amount, keterangan}`; simpan `total_amount`, `qris_url`, `direct_url`, `expired_at` (ke kolom order: `total_amount`, `qris_url`, `direct_url`; `expired_at` simpan di `signature`? TIDAK — simpan `expired_at` sebagai kolom baru? Skema `orders` tidak punya kolom itu. Simpan JSON tambahan di `signature` TIDAK BOLEH. Keputusan: tambah kolom tidak mungkin tanpa migrasi baru — buat migrasi `0003_orders_expired_at.sql` (boleh dibuat modul actions/seed, simpan di `server/migrations/`): `ALTER TABLE orders ADD COLUMN expired_at TEXT;`).
- `GET /api/voucher/validate?code=&total=` (Bearer) → `{valid: true, code, type, value, discount, total_after}` atau 400 `{error}` (untuk pratinjau diskon di checkout; tidak membuat order, tidak mengubah `uses`).
- `GET /api/payment/status/:order_id` (Bearer, pemilik) → `{order}`. Bila order PENDING: panggil `checkQrisStatus` (`GET https://klikqris.com/api/qrisv2/status/{id_merchant}/{order_id}`); bila status PAID → set `status='PAID'`, `paid_at`; bila EXPIRED → `status='EXPIRED'`. Bila kredensial tidak ada → kembalikan order apa adanya.
- `POST /api/webhook/klikqris` (tanpa auth) body KlikQRIS `{order_id, status, signature, ...}` → selalu HTTP 200 `{received: true, applied: boolean}`. Validasi signature bila `KLIKQRIS_WEBHOOK_SECRET` disetel (`verifyWebhookSignature` membandingkan signature dengan yang dibuat dari payload + secret — bila secret tidak disetel, TERIMA dengan catatan di log? TIDAK: bila secret kosong, tolak dengan `applied: false` kecuali payload cocok dengan order yang memang PENDING — keputusan: bila secret kosong, hanya proses bila `order_id` ada dan status PAID, dan catat di log bahwa signature tidak divalidasi). Penuhi order PENDING/EXPIRED tepat satu kali (cek status saat ini; bila sudah PAID, `applied: false`).
- `GET /api/orders` (Bearer) → `{orders}`. Tiap order berisi `items` + `externalUrl` per item HANYA bila order PAID (bila PENDING/EXPIRED → `null`).
- `GET /api/orders/:id/receipt` (Bearer, pemilik, PAID) → PDF struk (Content-Type application/pdf; nama berkas `struk-<order_id>.pdf`). Data dari order ASLI di DB (id, tanggal, pembeli, produk, harga, kode unik `total_amount - total`, total bayar, metode KlikQRIS, status).
- `GET /api/orders/:id/download/:product_id` (Bearer, pemilik, PAID) → PDF ringkasan produk.
- `GET /api/order-email-data/:order_id` (Bearer, pemilik, PAID) → `{order_id, nama, email, produk: [{judul, harga}], total, tanggal_bayar, url_produk}` (lihat "Email").

### Belajar
- `GET /api/study/:product_id` (Bearer) → `{product: ProductPublic, chapters: FullChapter[], simulations: SimulationMeta[], externalUrl: string|null, simLocked: boolean}`. `FullChapter` = chapter + `points: string[]` + `flashcards: {front, back}[]` + `quiz: PublicQuestion[]` (TANPA jawaban/pembahasan? Untuk kuis, pembahasan ditampilkan setelah menjawab — endpoint ini BOLEH menyertakan pembahasan tapi TIDAK jawaban benar; penilaian tetap server-side via `/api/quiz/submit`) + `free: boolean, locked: boolean`. `SimulationMeta` juga membawa `free`/`locked`. **Coba gratis:** bab pertama tiap produk (`sort_order` terendah) dan simulasi pertama tiap mapel (Paket A) terbuka untuk semua akun login (`free: true`); bab/simulasi lain terkunci (`locked: true`, hanya metadata — summary/points/focus_text/video/flashcard/quiz dikosongkan) bila produk belum dibeli. `PublicQuestion`: `{id, type, question, options}`. `externalUrl` = `external_url` produk HANYA bila user punya order PAID berisi produk itu; bila tidak → `null`. `simLocked` = `true` bila orang tua mengunci simulasi untuk user ini.
- `POST /api/study/chapter-done` (Bearer) `{product_id, chapter_id}` → `{ok: true, sticker: boolean}` (stiker bila bab pertama kali selesai; tandai `study_days` hari ini).
- `POST /api/bookmark` (Bearer) `{product_id, chapter_id, bookmarked: boolean}` → `{ok: true}`.
- `POST /api/note` (Bearer) `{product_id, chapter_id, note}` → `{ok: true}` (upsert; hapus bila note kosong).
- `GET /api/search?q=` (Bearer opsional) → `{products: ProductPublic[], chapters: {id, product_id, title, subject}[], terms: string[]}`. Cari di judul produk, judul bab, istilah flashcard. Bila `q` kosong → `{products: [], chapters: [], terms: []}`.
- `GET /api/daily` (Bearer) → `{date, questions: PublicQuestion[]}` — 5 soal deterministik per tanggal (dari `dailyQuestions`) berdasarkan kelas user? Tanpa info kelas user, pakai Kelas 1 + soal campuran; simpan skor via submit `kind: "daily"`.
- `POST /api/quiz/submit` (Bearer) `{kind: "quiz"|"simulation"|"daily"|"story", ref_id: string, answers: Record<string, unknown>, focus_switches?: number}` → `{score, max_score, correct: Record<string, boolean>, review: {questionId, correct, discussion}[], attempt_id: number, passed: boolean, focus_switches: number}`. `ref_id` = chapter_id (quiz), simulation_id (simulasi), tanggal (daily), atau `story-<kelas>-<mapel>` (story, mis. `story-3-matematika`). Bila `kind=simulation` dan `simLocked` → 403. Bila bab/simulasi terkunci (bukan gratis dan belum dibeli) → 403. `passed` = true hanya bila `kind=simulation` dan skor ≥ 70%. Catat `quiz_attempts` + `study_days`. `focus_switches` (Mode Ujian Fokus): hitungan pindah tab/jendela selama simulasi, bilangan bulat 0–999 (nilai lain → 0), hanya disimpan bila `kind=simulation`; jenis lain selalu 0. Kolom `quiz_attempts.focus_switches` ditambah migrasi `0006_mode_fokus.sql`.
- `GET /api/simulations/:id/questions` (Bearer) → `{simulation: SimulationMeta, questions: PublicQuestion[]}` — soal simulasi TANPA jawaban benar (penilaian tetap server-side via `/api/quiz/submit`). 404 bila simulasi tidak ada; 403 bila `simLocked` atau simulasi terkunci (bukan gratis dan belum dibeli).
- `GET /api/certificate/:attemptId` (Bearer, pemilik attempt) → PDF sertifikat A4 landscape (Content-Type application/pdf; nama berkas `sertifikat-<attemptId>.pdf`). Hanya untuk attempt `kind=simulation` dengan skor ≥ 70% (400 bila belum lulus, 403 bila bukan miliknya, 404 bila tidak ada). Isi: nama anak, mapel + kelas, nama simulasi, skor + persentase, tanggal, nomor `SRT-000123`.
- `GET /api/study/:product_id/:chapter_id/worksheet` (Bearer; HANYA pemilik LUNAS produk itu) → PDF worksheet (soal bab + kunci di halaman terakhir).

### Peta Belajar

- Rute `/peta-belajar/[product]` (satu peta per produk kelas `k1`–`k6`; rute generik — produk lain dengan bab juga tampil, produk tanpa bab menampilkan pesan kosong). Node = tiap bab dalam urutan `sort_order` yang sama seperti `GET /api/study/:product_id`. **Tidak ada endpoint/tabel baru** — peta memakai ulang study pack (`free`/`locked` tiap bab) + `GET /api/tracker` (`doneChapters`).
- State node dari data tracker ASLI: **selesai** = emerald + ikon centang; **saat ini** (bab pertama yang belum selesai dan tidak terkunci) = marigold + denyut halus; **belum** = putih/abu-abu + nomor bab; **terkunci** (bab butuh LUNAS dan belum dibeli) = abu-abu + ikon gembok. Ketuk node terbuka → halaman bab (`/belajar/[product]/[chapter]`); ketuk node terkunci → pemberitahuan + tombol "Beli untuk membuka" ke `/produk/[product]` (perilaku sama seperti kartu bab terkunci di Ruang Belajar — tidak ada aturan kunci baru).
- Header peta: ringkasan progres ("X dari N bab selesai") + bilah progres + tombol "Lanjut" ke bab saat ini (atau ajakan beli bila bab berikutnya terkunci). Jalur SVG berkelok (sinus) dengan jejak emerald sampai node saat ini; label bab di sisi node (desktop) atau di bawah node (bila sempit). Pintu masuk: kartu "Peta Belajar" di Beranda (chip Kelas 1–6), tombol di halaman Belajar tiap produk kelas, kartu di Akun/tracker. Tab bar bawah disembunyikan di rute ini (seperti halaman Belajar).
- `GET /api/stickers` (Bearer) → `{stickers: {chapter_id, earned_at}[], badges: string[]}`.

### Mode Ujian Fokus & Prediksi Nilai SAS

- **Mode Ujian Fokus** (di Ruang Belajar, tiap kartu Simulasi SAS): dua tombol mulai — "Mulai Simulasi" (biasa) dan "Mulai dengan Mode Fokus". Mode fokus mencoba layar penuh (Fullscreen API, dari gestur klik); bila perangkat tidak mendukung, mode tetap jalan sebagai pemantau pindah tab. Selama simulasi aktif: indikator "Mode Ujian Fokus aktif" + hitungan pindah tab + tombol "Keluar dari Mode Fokus"; setiap perpindahan tab/jendela (`visibilitychange`/`blur`, satu episode dihitung sekali) menampilkan peringatan ramah dan menambah hitungan. **Tidak ada auto-submit dan tidak ada kunci navigasi.** Keluar layar penuh (mis. Esc) tidak mematikan mode fokus — hanya pemberitahuan. Saat jawaban dikirim, hitungan ikut terkirim sebagai `focus_switches` (lihat `POST /api/quiz/submit`) dan tampil di layar hasil + tautan "Lihat Prediksi Nilai SAS" ke `/akun`.
- **Prediksi Nilai SAS** — `GET /api/prediction` (Bearer) → `{hasData, overall: number|null, totalSimulations, subjects: {subject, grade, product_id, prediction, attempts, latest_percent, latest_at}[], weakChapters: {chapter_id, product_id, title, subject, grade, reason}[]}`. Hanya simulasi SAS per mapel (`quiz_attempts.kind = 'simulation'`, di-join ke `simulations`) yang dipakai, bukan kuis bab. Per mapel: rata-rata berbobot — bobot naik mengikuti urutan (terlama 1 … terbaru n, jadi simulasi terbaru paling menentukan); `overall` = rata-rata prediksi semua mapel (0–100). `weakChapters` = maks. 3 bab dari 2 mapel terlemah (nilai prediksi terendah), utamakan bab yang belum selesai (dari `tracker`); bila semua sudah selesai, sarankan ulang bab awal. Kartu "Prediksi Nilai SAS" di Akun/tracker: angka keseluruhan + bar per mapel + daftar bab yang perlu diulang (tautan ke bab) + label jujur "Perkiraan, bukan nilai resmi". Bila belum ada simulasi sama sekali → `hasData: false`, tampilan ajakan mengerjakan simulasi pertama, bukan angka kosong. **Tidak ada tabel baru** — hanya kolom `quiz_attempts.focus_switches` (migrasi `0006`).

### Bank Soal Sulitku, Soal Cerita & Video Pendek

- **Bank Soal Sulitku** — `GET /api/hard-bank` (Bearer) → `{total, items: {question_id, type, question, options, subject, grade, origin_kind: "quiz"|"simulation", origin_title, product_id, last_wrong_at}[]}`. Soal yang pernah dijawab salah di kuis bab + simulasi, dihitung ulang dari `quiz_attempts` + tabel `questions` (dibatasi 200 attempt terbaru, maks. 100 soal; soal yang sama salah berkali-kali muncul sekali). `POST /api/hard-bank/practice` (Bearer) `{answers: Record<questionId, jawaban>}` → `{score, max_score, correct, review, mastered: number[], remaining: number}` — hanya soal yang ada di bank saat itu yang dinilai; yang dijawab benar dicatat ke `hard_bank_mastered` (migrasi `0007`) dan keluar dari bank. Rute `/soal-sulitku`: daftar per mapel + latihan maks. 20 soal per sesi (yang paling baru salah dulu). Pintu masuk: kartu di Akun/tracker + tombol di halaman Belajar.
- **Soal Cerita Sehari-hari** — bank di `server/seed/story.ts` (`storyQuestions(grade, subject)`): 10 soal per kelas per mapel (Matematika & B. Indonesia, Kelas 1–6 = 120 soal), 1 poin per soal, semua jawaban dihitung manual saat penulisan. `GET /api/story/:grade/:subject` (Bearer; `:subject` = `matematika` | `bahasa-indonesia`) → `{grade, subject, ref_id, questions: PublicQuestion[]}` (tanpa jawaban). Dinilai lewat `POST /api/quiz/submit` kind = `"story"`, `ref_id` = `story-<kelas>-<mapel>`. **Gratis untuk semua akun login** (seperti Latihan Harian) — tidak butuh LUNAS. Rute `/soal-cerita`: pilih kelas + mapel, lalu latihan 10 soal satu per satu + pembahasan. Pintu masuk: kartu di Beranda + tombol di halaman Belajar tiap produk.
- **Video pendek per bab (vertikal 9:16)** — kolom `chapters.short_url` + `short_duration` (migrasi `0007`). Pemutar di Ruang Belajar: kartu "Tonton Video Pendek (60 detik)" di bawah kartu video biasa; iframe lazy (baru dirender setelah ditekan), bingkai 9:16 maks. 300px, tombol "Lanjut ke Kuis" + "Tutup Video". Halaman video pendek mengirim `postMessage {type: "ringkas:lanjut-kuis"}` — halaman Belajar menangkapnya dan mengarahkan ke kuis bab itu. **Yang sudah ada videonya: 2 bab saja** — Matematika Kelas 1 Bab 1 (`/shorts/membilang-10.html`) dan Bab 2 (`/shorts/penjumlahan-10.html`), halaman mandiri di `app/static/shorts/` (narasi `speechSynthesis` perangkat, 6 adegan, subtitle per kalimat, play/jeda/putar ulang, kecepatan 0,75×/1×/1,25×, bisu, bilah progres per adegan, timer cadangan ±60 detik bila TTS tidak tersedia). Bab lain dipasang admin lewat tab "Video per Bab" (kolom video pendek) — dibuat bertahap dengan pola yang sama. Nilai bawaan di seed (`ChapterSeed.short_url`) + migrasi `0007` (UPDATE untuk database yang sudah berisi bab).

### Keluarga & kelas
- `POST /api/parent/link` (Bearer) → `{code}` (kode 6 karakter, simpan di `parent_links`).
- `POST /api/parent/redeem` (Bearer) `{code}` → `{ok: true}`. Anak menebus sendiri (persetujuan eksplisit); 404 bila kode tidak ada/sudah ditebus; 400 bila mencoba menebus kode sendiri.
- `GET /api/parent/children` (Bearer) → `{children: {id, name, email, sas_locked, daily_target, streak, done_chapters, scores}[]}`.
- `POST /api/parent/lock` (Bearer) `{child_id, sas_locked: boolean}` → `{ok: true}` (hanya bila anak terhubung ke orang tua ini).
- `POST /api/parent/target` (Bearer) `{child_id, daily_target: number}` → `{ok: true}`.
- `POST /api/class` (Bearer) `{product_id, name}` → `{class: {id, code, name}, }`. Guru harus punya order PAID berisi `product_id`; 403 bila tidak.
- `POST /api/class/join` (Bearer) `{code}` → `{class}`. 404 bila kode tidak ada.
- `GET /api/class/:id` (Bearer; guru atau anggota) → `{class, members: {id, name, done_chapters, scores}[]}`.
- `GET /api/class/:id/recap` (Bearer; guru) → CSV (`Content-Type: text/csv`, `siswa, bab_selesai, skor_rata_simulasi`).

### Bundel
- Produk bundel `bundle-k1`–`bundle-k6` (Kelas 1–6): masing-masing berisi produk kelas (`kN`) + paket SAS kelas itu (`sas-kN`, kecuali K1 memakai `sas-k1-s1`). Harga = jumlah harga satuan − diskon 20% (K1 Rp28.800, K2 Rp28.800, K3 Rp29.600, K4 Rp30.400, K5 Rp31.200, K6 Rp32.000). Anggota tersimpan di tabel `bundle_members` (lihat migrasi `0005_fiturs_baru.sql` + `server/seed/products.ts: BUNDLES`).
- Checkout bundel: order menyimpan baris bundel (harga bundel) + baris anggota (harga 0, bertanda `included_in_bundle`) di `items` — kepemilikan tiap anggota jalan lewat jalur yang sudah ada (`userHasPaidProduct` memeriksa `product_id` di items). Respons `orderOut` menyembunyikan baris anggota (klien hanya melihat yang dibayar); struk menampilkan anggota sebagai "(termasuk bundel)".

### Email (pengiriman otomatis via Resend — sudah di-wire)
- `server/email.ts`: `sendTemplatedEmail(db, {template, to, subject, variables, orderId?, userId?, period?, force?})` — tidak pernah melempar; tanpa `RESEND_API_KEY` → dilewati + log; idempotensi lewat tabel `sent_emails` (migrasi `0004`, kolom `period` di `0005`): satu (order/user, template, period) hanya terkirim sekali. Email transaksional memakai `period = ''`; email cron memakai kunci periode per anak (`reminder:<childId>:<YYYY-MM-DD>`, `streak:<childId>:<milestone>:<YYYY-MM-DD>`, `weekly:<childId>:<YYYY-Www>`).
- **Kirim ulang admin (`force: true`)**: HANYA dipakai endpoint `POST /api/admin/resend-email` (diteruskan ke `sendWelcomeEmail`/`sendPendingEmail`/`sendPaidEmail`/`sendExpiredEmail`); pemicu otomatis (register/checkout/webhook/polling/cron) TIDAK PERNAH memakai force. Dengan force, baris `sent_emails` yang cocok untuk (order_id/user_id, template, period = '') dihapus SEBELUM klaim baru, sehingga kirim ulang selalu mencoba dan mencatat `resend_id` baru. Penghapusan hanya untuk `period = ''` — email cron berperiode tidak pernah tersentuh — dan hanya terjadi SETELAH pemeriksaan `RESEND_API_KEY`, jadi tanpa kunci, riwayat terkirim tidak terhapus dan hasil tetap `skipped: "no-key"` tanpa klaim menggantung. Tanpa force, idempotensi tidak berubah (panggilan kedua → `skipped: "already-sent"`).
- `getOrderEmailData(db, orderId)` mengembalikan variabel untuk template di `server/email-templates/`: `{order_id, nama, email, produk: [{judul, harga}], total, tanggal_bayar, url_produk}`. `url_produk` = `external_url` produk pertama bila ada, bila tidak link Belajar `/belajar/<product_id>`.
- Pemicu (semua fire-and-forget, `server/email.ts` + `server/actions.ts` + `server/cron.ts`): register → `01-selamat-datang`, checkout dibuat → `02-pesanan-menunggu-bayar`, PAID → `03-pesanan-lunas`, kedaluwarsa → `04-pembayaran-kedaluwarsa`, cron harian → `06-pengingat-belajar` (anak 3 hari tidak belajar) + `07-ucapan-streak` (milestone 7/14/21/28 hari), cron mingguan → `05-laporan-mingguan-orang-tua`.
- **Cron** (`server/worker.ts` `scheduled` + `wrangler.toml` `[triggers]`): `0 0 * * *` (tiap hari 00:00 UTC = 07:00 WIB) dan `0 11 * * 0` (tiap Minggu 11:00 UTC = 18:00 WIB). Logika di `server/cron.ts` (`runDailyJob` / `runWeeklyJob`, mengembalikan `{job, sent, skipped, errors}`); uji manual lewat `POST /api/admin/cron/run`.

### Keamanan (migrasi `0009_keamanan.sql`)

- **Batas login & IP** — `POST /api/auth/login`: 5 kali kata sandi salah → `auth_lockouts.locked_until` = sekarang + 15 menit; selama terkunci, percobaan apa pun (walau kata sandi benar) → 401 `"Akun terkunci karena terlalu banyak percobaan gagal. Coba lagi dalam X menit."` (X = sisa menit, dibulatkan ke atas); login sukses → `failed_count = 0`. Email tak terdaftar → 401 generik `"Email atau password salah."` `POST /api/auth/register` → 429 bila >10/jam/IP; `POST /api/checkout` → 429 bila >20/jam/IP (IP: `CF-Connecting-IP` → `X-Forwarded-For` → `"unknown"`). Helper defensif (try/catch): bila tabel belum ada, login tetap jalan.
- **Kata sandi** (`server/password.ts`, `validatePassword`) — minimal 8 karakter; denylist lokal 233 kata sandi umum; HIBP k-anonymity (SHA-1, hanya 5 karakter pertama dikirim ke `api.pwnedpasswords.com/range/<prefix>`, timeout 2 detik, gagal → dilewati/fail-open). Berlaku di register + `POST /api/admin/users/:id/reset-password`.
- **2FA TOTP admin** (`server/totp.ts` — manual: base32 + HMAC-SHA1 WebCrypto, langkah 30 detik, toleransi ±1) — `GET /api/2fa/status` → `{enabled}`; `POST /api/2fa/setup/start` (admin) → `{secret, otpauthUrl, qrSvg, recoveryCodes: string[8]}` (secret disimpan, `totp_enabled` tetap 0; QR SVG dari pustaka `qrcode`); `POST /api/2fa/setup/confirm {code}` → `{ok:true}` (tanpa secret tersimpan → 400); `POST /api/2fa/disable {code}` → `{ok:true}` (membersihkan secret + kode pemulihan). `POST /api/auth/login` untuk admin 2FA aktif → `{needs2fa:true, challenge}` (tanpa token); `POST /api/auth/login-2fa {challenge, code}` → `{user, token}` (kode salah → 400, challenge tetap hidup; kedaluwarsa 5 menit → 400 `"Sesi verifikasi kedaluwarsa. Silakan login ulang."`); kode pemulihan (hash SHA-256, sekali pakai) diterima sebagai `code`. UI: kartu "Keamanan Akun (2FA)" di tab Ringkasan `/admin`; langkah kedua login di `/akun`.
- **Turnstile** (`server/turnstile.ts`, `verifyTurnstile`) — `GET /api/config` (publik) → `{turnstileSiteKey: string|null}` (secret TIDAK PERNAH di sini). Secret kosong → verifikasi dilewati + log `[turnstile] belum dikonfigurasi — dilewati`; secret terisi → token wajib di register + login, `siteverify` gagal → 400 `"Verifikasi CAPTCHA gagal. Silakan coba lagi."` Widget di `/akun` hanya dirender bila site key ada (skrip `https://challenges.cloudflare.com/turnstile/v0/api.js` dimuat dinamis; gagal dimuat → lanjut tanpa token).
- **Header keamanan** (`server/worker.ts`, `withSecurityHeaders`, semua respons incl. aset) — CSP utama: `default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` (`'unsafe-inline'` wajib karena bootstrap hidrasi SvelteKit di `build/index.html`). `/shorts/*`: CSP longgar (`script-src 'self' 'unsafe-inline'`, `frame-ancestors 'self'`, tanpa `X-Frame-Options`) karena di-iframe dari halaman Belajar. Header lain: `X-Frame-Options: DENY` (kecuali `/shorts/*`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. **`[assets] run_worker_first = true` di `wrangler.toml` WAJIB** — tanpa itu aset statis disajikan langsung tanpa Worker dan header tidak menempel di `/`, `/shorts/*`, JS/CSS.
- **Audit log** — `GET /api/admin/audit-log?action=&q=&page=&limit=` (admin) → `{items:[{id, admin_email, action, target, detail, created_at}], total, page, limit}` (limit default 20, maks 100, `created_at` DESC). 18 aksi ter-instrumentasi (`server/audit.ts`, `logAdminAction` — tidak pernah throw): `product_create/update/delete/set_active/external_link/image_upload/image_delete/set_feature`, `user_set_role`, `user_reset_password`, `email_resend`, `export_orders`, `export_users`, `settings_update`, `chapter_video_set`, `voucher_create`, `voucher_set_active`, `cron_run`. Tab "Log Aktivitas" di `/admin`.
- **Backup** — `GET /api/admin/backup` (admin) → `application/sql`, `Content-Disposition: attachment; filename="ringkas-backup-YYYYMMDD-HHmm.sql"` (UTC), dump semua tabel pengguna (`INSERT OR REPLACE`, `PRAGMA foreign_keys=OFF`, `BEGIN/COMMIT`; `_migrations` + `d1_migrations` + `sqlite_%` dikecualikan) + upsert `settings.last_backup_at` (terbaca lewat `GET /api/admin/settings`; `readSettings` memetakan kunci ini — jangan sampai terbuang seperti sebelum perbaikan 2026-11-15).

### Pertumbuhan & keterlibatan (migrasi `0010_referral_gift.sql` + `0011_tryout_qa.sql`)

- **Perbaikan kritis `worker.ts` (2026-11-15): `ctx` WAJIB diteruskan ke Hono.** Sebelumnya `fetch(request, env)` memanggil `getApp(env).fetch(request)` tanpa execution context, sehingga `c.executionCtx` di dalam handler bernilai undefined dan `background()` tidak pernah mendaftarkan `waitUntil` — SEMUA kerja latar (email lunas/selamat datang, pemenuhan hadiah, hadiah referral) diam-diam tidak pernah jalan setelah respons terkirim. Ditemukan saat verifikasi batch ini: webhook PAID membalik status order tapi grant/voucher/email tidak muncul. Perbaikan: `fetch(request, env, ctx: ExecutionContext)` + `getApp(env).fetch(request, env, ctx)`. Tanpa perbaikan ini, fitur referral + hadiah di bawah TIDAK berfungsi di produksi.
- **Program referral** — kode ajakan `NAMA-XXXX` (nama depan dinormalisasi + 4 karakter acak; pengguna lama dibuat saat pertama buka `GET /api/referral`). `POST /api/auth/register` menerima `referral_code` opsional; kode tidak ada → 400 (pendaftaran tidak dibuat); kode milik sendiri ditolak. `GET /api/referral` (Bearer) → `{referral_code, share_url, referred_count, vouchers: [{code, value, expires_at}]}`. Hadiah: pembelian PERTAMA yang LUNAS dari teman → voucher 10% sekali pakai (`REF-XXXXXX`, `max_uses 1`, kedaluwarsa +90 hari) untuk pengajak DAN teman. Idempotensi dua lapis: klaim baris `referral_rewards` dulu (`UNIQUE referred_user_id+order_id`, `INSERT OR IGNORE`) — baru setelah klaim berhasil voucher dibuat; webhook + polling yang sama-sama melihat PAID tidak menggandakan hadiah. Pemicu di `handlePaidOrder` (dipakai webhook + polling status). Kartu "Ajak Teman, Dapat Diskon" di Akun: kode, tombol salin, tautan wa.me, jumlah teman berhasil, voucher hadiah.
- **Beli sebagai hadiah** — checkout menerima `gift_recipient_email` (wajib bila mode hadiah, format email, bukan email sendiri), `gift_recipient_name` (opsional), `gift_message` (opsional, maks. 200 karakter). Order hadiah menyimpan `gift_recipient_email/name/message`, `gift_claim_token` (64 hex acak, dibuat saat checkout), `gift_claim_expires_at` (+30 hari), `gift_claimed_at/by`. Saat PAID (`handlePaidOrder`): email hadiah template `08-gift.ts` ke penerima (tautan claim `/hadiah?token=...`); bila email penerima SUDAH punya akun, akses langsung diberikan (`gift_grants` + `gift_claimed_at/by` ditandai); bila belum, akses menunggu claim. `GET /api/gift/claim?token=...` (publik) → `{valid, product_title?, recipient_name?, expired?, claimed?}` (tanpa bocor email pembeli/penerima); `POST /api/gift/claim` (Bearer) `{token}` — hanya akun yang emailnya SAMA dengan email penerima yang bisa mengklaim (403 bila tidak); token salah/kedaluwarsa/sudah diklaim → pesan ramah. Kepemilikan hadiah dicatat di `gift_grants (order_id, product_id, user_id)`; `userHasPaidProduct()` memeriksa tabel ini juga, jadi Ruang Belajar/kuis/simulasi/unduhan jalan lewat gating LUNAS yang sudah ada. `GET /api/orders` mengembalikan hadiah yang diterima sebagai entri PAID sintetis (`is_gift_received`, `gift_from_name`); pembeli melihat ordernya bertanda `is_gift: true` TANPA tombol Belajar/Unduh (struk tetap tampil) dan TIDAK mendapat email lunas template 03 (hanya email hadiah ke penerima). Halaman `/hadiah` menyimpan token di `sessionStorage` bila belum login; setelah login/daftar kembali otomatis ke `/hadiah?token=...`.
- **Tryout terjadwal + papan peringkat** — `server/tryout.ts` (`registerTryoutRoutes`), tabel `tryouts` + `tryout_registrations` + `tryout_attempts` (migrasi `0011`). Admin: `GET/POST /api/admin/tryouts`, `DELETE /api/admin/tryouts/:id` (hapus hanya sebelum mulai; tanpa edit tryout). Soal tryout: 25 soal (default, bisa diubah saat buat) dari pool soal simulasi produk `k{grade}` (Paket A, lintas mapel; tanpa soal baru) — saat tryout dibuat, server melakukan seeded shuffle (mulberry32, seed = id tryout) dan menyimpan `question_ids` JSON, jadi semua peserta mengerjakan soal yang sama dalam urutan yang sama; pool < jumlah diminta → create 400. Peserta: pemilik produk kelas itu (cek PAID seperti gating LUNAS, termasuk anggota bundel) ATAU semua akun login bila `is_free = 1` (kebijakan: tryout PERTAMA tiap kelas dibuat gratis). `POST /api/tryouts/:id/register` (boleh daftar sampai `ends_at`, selama belum submit); `GET /api/tryouts/:id/questions` (tanpa kunci jawaban); `POST /api/tryouts/:id/submit` (sekali saja — `UNIQUE(tryout_id, user_id)`; server menolak submit setelah `ends_at` dan membatasi `duration_seconds` ke durasi + 3 menit toleransi; penilaian menduplikasi `gradeOne` dari `actions.ts` — bila penilaian di `actions.ts` berubah, salinan di `tryout.ts` harus disinkronkan, tercatat di kepala berkas). `GET /api/tryouts/:id/leaderboard` (tampil setelah `ends_at` atau setelah peserta sendiri submit; sebelumnya 403 untuk bukan peserta) — skor turun, lalu waktu pengerjaan naik, lalu waktu submit naik; nama = nama depan + inisial. Rute `/tryout` (daftar) + `/tryout/[id]` (detail + kerjakan + peringkat); kartu "Tryout Mendatang" di Beranda.
- **PWA** — `app/static/manifest.webmanifest` (nama/short_name "Ringkas", theme/background `#177245`, display standalone, start_url/scope "/", ikon dari logo yang sudah ada: `favicon-192.png` 192x192 + `logo-ringkas-icon-1024.png` 1024x1024 + SVG `any`; TIDAK ada ikon baru) + `<meta name="theme-color">` + `apple-touch-icon` di `app.html`. Service worker `app/static/sw.js` (cache `ringkas-v1`, hapus cache lama saat activate): `/api/*` network-only (offline → JSON 503, tidak pernah sajikan data basi); navigasi network-first → cache → `offline.html`; aset statis (`/_app/`, `/logo/`, `/shorts/`, manifest, offline.html) cache-first. **Batasan jujur: BUKAN offline penuh** — materi yang belum pernah dibuka tidak tersedia offline karena isinya dari API yang tidak di-cache. Kartu "Instal Aplikasi" di `/rapor`: tombol hanya bila `beforeinstallprompt` terkirim (`prompt()` + `userChoice` saat diklik); bila sudah standalone → catatan terinstal; bila tidak didukung → petunjuk manual (Android ⋮ → "Tambahkan ke layar utama"; iOS Bagikan → "Tambah ke Layar Utama").
- **Rapor digital semester (PDF)** — `server/rapor.ts` (`registerRaporRoutes`), `GET /api/rapor` (Bearer) → PDF (`application/pdf`); `GET /api/rapor?child_id=...` hanya bila `parent_links` menghubungkan orang tua itu dengan anak tersebut (`redeemed = 1`, pola yang sama seperti `/api/parent/lock`); tanpa login → 401, bukan pemilik/bukan orang tua terhubung → 403, anak tidak ditemukan → 404. Isi PDF (pdf-lib, A4 portrait, gaya emerald/marigold seperti sertifikat, fungsi `raporPdf` di `server/pdf.ts`): nama, kelas, periode, tanggal dibuat; streak, hari belajar, bab selesai, jumlah simulasi; prediksi SAS keseluruhan (rumus yang SAMA seperti `/api/prediction` — diduplikasi di `rapor.ts`, bukan diimpor, karena `actions.ts` menarik bcryptjs/node:crypto/email/seed); per mapel: bilah progres prediksi + rata-rata + simulasi terakhir; 3 bab lemah; daftar semua nilai simulasi per mapel. Periode dihitung dari tanggal unduh (Asia/Jakarta): Jul–Des → "Semester 1 – Tahun Ajaran YYYY/YYYY+1", Jan–Jun → "Semester 2 – Tahun Ajaran (YYYY-1)/YYYY". Kelas = grade tersering dari simulasi, fallback grade tersering bab selesai, bila belum ada data → "-". Halaman `/rapor`: kartu "Rapor Saya" + daftar anak dari `/api/parent/children` (tombol unduh per anak) + kartu Instal Aplikasi; tombol "Unduh Rapor Semester" juga di halaman Belajar tiap produk.
- **Tanya Jawab per bab** — `server/qa.ts` (`registerQaRoutes`), tabel `chapter_questions` (migrasi `0011`): `id, product_id, chapter_id, user_id, question, answer NULL, status (pending/approved/rejected/answered), created_at, answered_at, answered_by`. `POST /api/qa/questions` (Bearer) `{product, chapter, question}` — pertanyaan 1–300 karakter; bab terkunci → form disembunyikan di UI DAN ditolak server (403). `GET /api/qa/questions?product=&chapter=` (Bearer) — hanya yang approved/answered yang tampil publik + pertanyaan milik sendiri (dengan statusnya). Admin: `GET /api/admin/qa` (semua), `POST /api/admin/qa/:id/approve|reject|answer|delete` — jawaban admin 1–1000 karakter, jawab ulang = edit jawaban; semua tercatat di `logAdminAction`. Pertanyaan pending/rejected TIDAK tampil ke anak lain. Tampil di bawah tiap bab (`belajar/[product]/[chapter]`) + tab moderasi "Tanya Jawab" di `/admin`.

### Pengaturan situs & pengumuman (migrasi `0008_admin_lanjutan.sql`)

- Tabel `settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)` + 4 kunci bawaan (INSERT OR IGNORE, aman di DB baru maupun lama — migrasi jalan sebelum seed di DB baru). Nilai tersimpan sebagai TEXT; saklar `'0'`/`'1'` dikonversi ke 0/1 oleh server.
- Arti kunci: `announcement_text` = teks pengumuman di beranda (`''` = tidak ada); `announcement_enabled` = `1` tampil / `0` sembunyi; `promo_text` = teks promo di beranda; `promo_enabled` = `1` tampil / `0` sembunyi. Dikelola admin lewat `GET/POST /api/admin/settings` (teks maks. 500 karakter, saklar 0/1, body parsial), dibaca publik lewat `GET /api/announcement` (tanpa auth). Kunci yang belum ada di tabel dianggap nilai default (teks kosong, saklar 0).
- **Perilaku `parseItems` (catatan perbaikan 2026-11-15):** `parseItems` di `server/actions.ts` MEMPERTAHANKAN `included_in_bundle`. Sebelumnya penanda itu terbuang di `parseItems`, sehingga semua filter `!it.included_in_bundle` (orderOut, stats, idempotensi checkout, struk) menjadi no-op: anggota bundel bocor ke klien/stats dan label "(termasuk bundel)" di struk tidak pernah muncul. Perilaku yang dipulihkan sesuai kontrak ini: orderOut menyembunyikan baris anggota; idempotensi checkout membandingkan hanya item inti; struk menandai anggota sebagai "(termasuk bundel)".

## Frontend

- SvelteKit SPA (`adapter-static`, fallback `index.html`, `ssr = false`, `prerender = false` di `src/routes/+layout.ts`).
- `src/app.css`: Tailwind v4 (`@import "tailwindcss";`) + tema: `--color-brand: #2273d8; --color-sun: #ffc531; --color-leaf: #159a68;` latar `#f6f9fe`, font Plus Jakarta Sans (Google Fonts import di `app.html`).
- Layout: kolom aplikasi `max-width: 430px`, tengah, latar titik-titik di desktop. Bottom tab bar 5 tab: Beranda `/`, Katalog `/katalog`, Keranjang `/keranjang` (tombol tengah menonjol + badge jumlah), Pesanan `/pesanan`, Akun `/akun`. Halaman detail/pembayaran/belajar/admin adalah layar terpisah (tanpa tab bar, ada tombol kembali).
- Rute: `/` (Beranda: promo, chip jenjang, grid produk, kartu Peta Belajar), `/katalog` (cari + filter + sort), `/produk/[slug]` (detail terpisah), `/keranjang`, `/checkout`, `/pesanan`, `/akun` (login/register/profil + menu), `/belajar/[product]` (Ruang Belajar: bab, kuis, simulasi, flashcard, video bila ada), `/belajar/[product]/[chapter]` (baca bab + kuis), `/peta-belajar/[product]` (Peta Belajar: jalur bab berliku, node selesai/saat ini/belum/terkunci — data dari `GET /api/study/:product_id` + `GET /api/tracker`, tanpa endpoint baru), `/admin` (produk, pengguna, video, link).
- `src/lib/api.ts`: semua panggilan memakai `fetch("/api/...")` (di-dev diproxy Vite ke :8787; di-prod satu server yang sama). Token dari localStorage.
- Keranjang: localStorage; tombol "Beli" menonaktifkan ganda selama proses.
- Ikon: emoji atau karakter sederhana, jangan aset eksternal yang berat.
