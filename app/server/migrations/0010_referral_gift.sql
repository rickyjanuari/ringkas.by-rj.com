-- 0010_referral_gift.sql — program referral + beli sebagai hadiah.
--
-- REFERRAL:
--   - users.referral_code: kode ajakan unik tiap pengguna, format
--     NAMA-XXXX (nama depan dinormalisasi A-Z + 4 karakter acak
--     alfanumerik, mis. RICKY-7K2Q). Dihasilkan saat register; pengguna
--     lama mendapatkannya saat pertama kali membuka kartu referral
--     (GET /api/referral mengisi bila kosong). Keunikan dijamin
--     UNIQUE INDEX (bukan UNIQUE di ADD COLUMN — SQLite melarang
--     UNIQUE/PRIMARY KEY pada kolom hasil ALTER TABLE ADD COLUMN;
--     NULL tetap diizinkan dan dianggap berbeda-beda).
--   - users.referred_by: kode pengajak yang dipakai saat register
--     (nullable). Hanya bisa diisi SEKALI, saat register — tidak ada
--     endpoint untuk mengubahnya. Kode yang tidak ada DITOLAK saat
--     register (400, pendaftaran tidak dibuat) supaya pengguna tahu
--     kodenya salah dan bisa memperbaikinya, bukan diam-diam
--     kehilangan hadiah.
--   - referral_rewards: jejak hadiah per (teman, order). UNIQUE
--     (referred_user_id, order_id) + cek "order PAID pertama" di
--     server membuat hadiah hanya sekali per teman, walau webhook
--     dan polling sama-sama melihat PAID. Voucher hadiahnya sendiri
--     disimpan di tabel vouchers yang sudah ada (kode REF-XXXXXX,
--     type percent, value 10, max_uses 1, min_total 0, kedaluwarsa
--     +90 hari).
--
-- HADIAH (gift):
--   - Kolom di orders: email/nama penerima, pesan (maks. 200 karakter,
--     divalidasi server), token claim acak, batas kedaluwarsa token
--     (30 hari), serta penanda klaim (kapan + oleh siapa). Token
--     disimpan apa adanya (bukan hash): 32 byte acak heksadesimal
--     (64 karakter) — ruang tebaknya cukup besar dan token hanya
--     dipakai lewat tautan email; pola ini sama dengan token sesi
--     (sessions.token) yang juga disimpan apa adanya.
--   - gift_grants: kepemilikan produk hasil hadiah. SATU-SATUNYA
--     catatan kepemilikan hadiah — userHasPaidProduct() di server
--     memeriksa tabel ini selain order PAID milik sendiri, sehingga
--     Ruang Belajar, kuis, simulasi, dan unduhan PDF jalan lewat
--     jalur gating LUNAS yang sudah ada tanpa tabel kepemilikan baru
--     di tiap fitur. UNIQUE (order_id, product_id, user_id) membuat
--     pemberian akses idempotent (claim ganda / webhook + polling).
--   - Bila email penerima SUDAH punya akun saat order LUNAS: akses
--     langsung diberikan saat itu juga (grant dibuat saat PAID) dan
--     email hadiah tetap dikirim berisi tautan claim sebagai cadangan
--     — claim ulang mengembalikan already=true, bukan error.
--   - Bila belum punya akun: akses baru diberikan saat claim
--     (POST /api/gift/claim, butuh login dengan email penerima).
--   - Pembeli TIDAK pernah mendapat akses dari order hadiah:
--     orderOut() menyembunyikan externalUrl untuk order hadiah dan
--     halaman Pesanan Saya menyembunyikan tombol Belajar/Unduh.
--   - Email hadiah memakai template 08 + idempotensi sent_emails
--     yang sama seperti email lunas (sekali per order).
ALTER TABLE users ADD COLUMN referral_code TEXT;
ALTER TABLE users ADD COLUMN referred_by TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

ALTER TABLE orders ADD COLUMN gift_recipient_email TEXT;
ALTER TABLE orders ADD COLUMN gift_recipient_name TEXT;
ALTER TABLE orders ADD COLUMN gift_message TEXT;
ALTER TABLE orders ADD COLUMN gift_claim_token TEXT;
ALTER TABLE orders ADD COLUMN gift_claim_expires_at TEXT;
ALTER TABLE orders ADD COLUMN gift_claimed_at TEXT;
ALTER TABLE orders ADD COLUMN gift_claimed_by TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_gift_claim_token ON orders(gift_claim_token);
CREATE INDEX IF NOT EXISTS idx_orders_gift_recipient_email ON orders(gift_recipient_email);

CREATE TABLE IF NOT EXISTS gift_grants (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  UNIQUE(order_id, product_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_gift_grants_user ON gift_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_gift_grants_order ON gift_grants(order_id);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL,
  referred_user_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  referrer_voucher_code TEXT NOT NULL,
  referred_voucher_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(referred_user_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referred ON referral_rewards(referred_user_id);
