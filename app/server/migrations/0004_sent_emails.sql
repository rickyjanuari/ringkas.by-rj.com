-- 0004_sent_emails.sql — jejak pengiriman email (idempotensi).
--
-- Satu order tidak boleh menerima email yang sama dua kali, walau webhook
-- dan polling sama-sama mendeteksi PAID. Satu pengguna tidak boleh
-- menerima email selamat datang dua kali.
--
-- Konvensi kolom (penting — karena SQLite menganggap NULL berbeda-beda di
-- UNIQUE, dua UNIQUE di bawah saling melengkapi tanpa bentrok):
--   - email per order  → order_id terisi, user_id NULL   (unik per order)
--   - email per pengguna (selamat datang) → user_id terisi, order_id NULL
--     (unik per pengguna)
-- Jangan isi keduanya sekaligus: email per order untuk pengguna yang sama
-- akan tertolak UNIQUE(user_id, template) bila user_id ikut diisi.
--
-- Baris bersifat "klaim": disisipkan SEBELUM pengiriman (resend_id NULL).
-- Bila pengiriman gagal, baris klaim dihapus supaya percobaan berikut bisa
-- mengirim. Baris klaim yang berumur > 10 menit dan masih tanpa resend_id
-- dianggap basi (Worker mati di tengah kirim) dan boleh direbut ulang.
-- BACKFILL: order yang SUDAH berstatus terminal (PAID/EXPIRED) sebelum
-- wiring email ini dianggap sudah diberitahu — jangan kirim email
-- retroaktif untuk mereka.
CREATE TABLE IF NOT EXISTS sent_emails (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  user_id TEXT,
  template TEXT NOT NULL,
  resend_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(order_id, template),
  UNIQUE(user_id, template)
);
CREATE INDEX IF NOT EXISTS idx_sent_emails_order ON sent_emails(order_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_user ON sent_emails(user_id);

INSERT OR IGNORE INTO sent_emails (id, order_id, user_id, template, resend_id, created_at)
SELECT 'backfill-' || id || '-paid', id, NULL, 'paid', 'manual-sebelum-wire', created_at
FROM orders WHERE status = 'PAID';

INSERT OR IGNORE INTO sent_emails (id, order_id, user_id, template, resend_id, created_at)
SELECT 'backfill-' || id || '-expired', id, NULL, 'expired', 'manual-sebelum-wire', created_at
FROM orders WHERE status = 'EXPIRED';
