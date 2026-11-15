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
- `GET /api/products/:id` → `{product: ProductPublic, chapters: ChapterMeta[], images: {id, url, kind}[], bundleItems: {product_id, title, price}[]}`. `ChapterMeta`: `{id, title, subject, grade, semester, sort_order, video_url, video_duration}`. `bundleItems` kosong bila bukan bundel; berisi anggota bundel bila produk bundel (lihat "Bundel").
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
- `POST /api/admin/chapters/:id/video` (admin) `{video_url, video_duration}` → `{chapter}`. `video_url` kosong = hapus video. Tolak URL bukan http/https bila terisi.
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
- `POST /api/quiz/submit` (Bearer) `{kind: "quiz"|"simulation", ref_id: string, answers: Record<string, unknown>}` → `{score, max_score, correct: Record<string, boolean>, review: {questionId, correct, discussion}[], attempt_id: number, passed: boolean}`. `ref_id` = chapter_id (quiz) atau simulation_id (simulasi). Bila `kind=simulation` dan `simLocked` → 403. Bila bab/simulasi terkunci (bukan gratis dan belum dibeli) → 403. `passed` = true hanya bila `kind=simulation` dan skor ≥ 70%. Catat `quiz_attempts` + `study_days`.
- `GET /api/simulations/:id/questions` (Bearer) → `{simulation: SimulationMeta, questions: PublicQuestion[]}` — soal simulasi TANPA jawaban benar (penilaian tetap server-side via `/api/quiz/submit`). 404 bila simulasi tidak ada; 403 bila `simLocked` atau simulasi terkunci (bukan gratis dan belum dibeli).
- `GET /api/certificate/:attemptId` (Bearer, pemilik attempt) → PDF sertifikat A4 landscape (Content-Type application/pdf; nama berkas `sertifikat-<attemptId>.pdf`). Hanya untuk attempt `kind=simulation` dengan skor ≥ 70% (400 bila belum lulus, 403 bila bukan miliknya, 404 bila tidak ada). Isi: nama anak, mapel + kelas, nama simulasi, skor + persentase, tanggal, nomor `SRT-000123`.
- `GET /api/study/:product_id/:chapter_id/worksheet` (Bearer; HANYA pemilik LUNAS produk itu) → PDF worksheet (soal bab + kunci di halaman terakhir).

### Peta Belajar

- Rute `/peta-belajar/[product]` (satu peta per produk kelas `k1`–`k6`; rute generik — produk lain dengan bab juga tampil, produk tanpa bab menampilkan pesan kosong). Node = tiap bab dalam urutan `sort_order` yang sama seperti `GET /api/study/:product_id`. **Tidak ada endpoint/tabel baru** — peta memakai ulang study pack (`free`/`locked` tiap bab) + `GET /api/tracker` (`doneChapters`).
- State node dari data tracker ASLI: **selesai** = emerald + ikon centang; **saat ini** (bab pertama yang belum selesai dan tidak terkunci) = marigold + denyut halus; **belum** = putih/abu-abu + nomor bab; **terkunci** (bab butuh LUNAS dan belum dibeli) = abu-abu + ikon gembok. Ketuk node terbuka → halaman bab (`/belajar/[product]/[chapter]`); ketuk node terkunci → pemberitahuan + tombol "Beli untuk membuka" ke `/produk/[product]` (perilaku sama seperti kartu bab terkunci di Ruang Belajar — tidak ada aturan kunci baru).
- Header peta: ringkasan progres ("X dari N bab selesai") + bilah progres + tombol "Lanjut" ke bab saat ini (atau ajakan beli bila bab berikutnya terkunci). Jalur SVG berkelok (sinus) dengan jejak emerald sampai node saat ini; label bab di sisi node (desktop) atau di bawah node (bila sempit). Pintu masuk: kartu "Peta Belajar" di Beranda (chip Kelas 1–6), tombol di halaman Belajar tiap produk kelas, kartu di Akun/tracker. Tab bar bawah disembunyikan di rute ini (seperti halaman Belajar).
- `GET /api/stickers` (Bearer) → `{stickers: {chapter_id, earned_at}[], badges: string[]}`.

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
- `server/email.ts`: `sendTemplatedEmail(db, {template, to, subject, variables, orderId?, userId?, period?})` — tidak pernah melempar; tanpa `RESEND_API_KEY` → dilewati + log; idempotensi lewat tabel `sent_emails` (migrasi `0004`, kolom `period` di `0005`): satu (order/user, template, period) hanya terkirim sekali. Email transaksional memakai `period = ''`; email cron memakai kunci periode per anak (`reminder:<childId>:<YYYY-MM-DD>`, `streak:<childId>:<milestone>:<YYYY-MM-DD>`, `weekly:<childId>:<YYYY-Www>`).
- `getOrderEmailData(db, orderId)` mengembalikan variabel untuk template di `server/email-templates/`: `{order_id, nama, email, produk: [{judul, harga}], total, tanggal_bayar, url_produk}`. `url_produk` = `external_url` produk pertama bila ada, bila tidak link Belajar `/belajar/<product_id>`.
- Pemicu (semua fire-and-forget, `server/email.ts` + `server/actions.ts` + `server/cron.ts`): register → `01-selamat-datang`, checkout dibuat → `02-pesanan-menunggu-bayar`, PAID → `03-pesanan-lunas`, kedaluwarsa → `04-pembayaran-kedaluwarsa`, cron harian → `06-pengingat-belajar` (anak 3 hari tidak belajar) + `07-ucapan-streak` (milestone 7/14/21/28 hari), cron mingguan → `05-laporan-mingguan-orang-tua`.
- **Cron** (`server/worker.ts` `scheduled` + `wrangler.toml` `[triggers]`): `0 0 * * *` (tiap hari 00:00 UTC = 07:00 WIB) dan `0 11 * * 0` (tiap Minggu 11:00 UTC = 18:00 WIB). Logika di `server/cron.ts` (`runDailyJob` / `runWeeklyJob`, mengembalikan `{job, sent, skipped, errors}`); uji manual lewat `POST /api/admin/cron/run`.

## Frontend

- SvelteKit SPA (`adapter-static`, fallback `index.html`, `ssr = false`, `prerender = false` di `src/routes/+layout.ts`).
- `src/app.css`: Tailwind v4 (`@import "tailwindcss";`) + tema: `--color-brand: #2273d8; --color-sun: #ffc531; --color-leaf: #159a68;` latar `#f6f9fe`, font Plus Jakarta Sans (Google Fonts import di `app.html`).
- Layout: kolom aplikasi `max-width: 430px`, tengah, latar titik-titik di desktop. Bottom tab bar 5 tab: Beranda `/`, Katalog `/katalog`, Keranjang `/keranjang` (tombol tengah menonjol + badge jumlah), Pesanan `/pesanan`, Akun `/akun`. Halaman detail/pembayaran/belajar/admin adalah layar terpisah (tanpa tab bar, ada tombol kembali).
- Rute: `/` (Beranda: promo, chip jenjang, grid produk, kartu Peta Belajar), `/katalog` (cari + filter + sort), `/produk/[slug]` (detail terpisah), `/keranjang`, `/checkout`, `/pesanan`, `/akun` (login/register/profil + menu), `/belajar/[product]` (Ruang Belajar: bab, kuis, simulasi, flashcard, video bila ada), `/belajar/[product]/[chapter]` (baca bab + kuis), `/peta-belajar/[product]` (Peta Belajar: jalur bab berliku, node selesai/saat ini/belum/terkunci — data dari `GET /api/study/:product_id` + `GET /api/tracker`, tanpa endpoint baru), `/admin` (produk, pengguna, video, link).
- `src/lib/api.ts`: semua panggilan memakai `fetch("/api/...")` (di-dev diproxy Vite ke :8787; di-prod satu server yang sama). Token dari localStorage.
- Keranjang: localStorage; tombol "Beli" menonaktifkan ganda selama proses.
- Ikon: emoji atau karakter sederhana, jangan aset eksternal yang berat.
