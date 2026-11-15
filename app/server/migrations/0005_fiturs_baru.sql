-- 0005_fiturs_baru.sql — voucher, bundel kelas, kolom order, dan kolom
-- periode di sent_emails (untuk email cron: pengingat harian + laporan
-- mingguan — satu (orang tua, template, periode) hanya terkirim sekali).
--
-- VOUCHER:
--   - code disimpan HURUF BESAR (perbandingan case-insensitive di server).
--   - type: 'percent' (nilai = persen 1-100) atau 'fixed' (nilai = rupiah).
--   - max_uses NULL = tanpa batas. uses bertambah SAAT ORDER DIBUAT dan
--     TIDAK dikembalikan bila order kedaluwarsa — keputusan anti-abuse:
--     mencegah satu kode dipakai berulang lewat order yang sengaja tidak
--     dibayar sampai kedaluwarsa.
--   - Tidak ada voucher yang di-seed (aktif maupun nonaktif): admin yang
--     membuatnya dari panel admin.
--
-- BUNDEL:
--   - 6 produk bundel Kelas 1-6 (id bundle-k1..bundle-k6), masing-masing
--     berisi produk kelas (kN) + paket SAS kelas itu (sas-kN / sas-k1-s1).
--     Harga = jumlah harga satuan - diskon 20%, dibulatkan ke bawah ke
--     kelipatan Rp100 (semua sudah kelipatan Rp100):
--       K1: 19.000+17.000=36.000 -> 28.800
--       K2: 19.000+17.000=36.000 -> 28.800
--       K3: 19.000+18.000=37.000 -> 29.600
--       K4: 19.000+19.000=38.000 -> 30.400
--       K5: 19.000+20.000=39.000 -> 31.200
--       K6: 19.000+21.000=40.000 -> 32.000
--   - Anggota bundel disimpan di bundle_members; saat checkout, order
--     bundel menyimpan SEMUA product_id anggotanya di items (selain baris
--     bundelnya sendiri), supaya kepemilikan tiap produk jalan lewat jalur
--     yang sudah ada (userHasPaidProduct).
--   - Produk bundel juga ada di server/seed/products.ts + seed.sql (untuk
--     database baru); INSERT di bawah ini untuk database yang sudah ada.
--
-- SENT_EMAILS.PERIOD:
--   - Tabel dibangun ulang (SQLite tidak bisa mengubah UNIQUE yang ada)
--     dengan kolom period TEXT NOT NULL DEFAULT '' dan UNIQUE yang
--     diperbarui: (order_id, template, period) + (user_id, template, period).
--     Baris lama disalin apa adanya (period = '').
--   - period adalah kunci periode email cron, bentuknya gabungan agar unik
--     per anak + periode, mis. 'reminder:usr-XXX:2026-11-15' atau
--     'weekly:usr-XXX:2026-W46'. Email transaksional memakai period = ''.
--   - Perhatian: NULL di UNIQUE SQLite dianggap berbeda-beda, jadi baris
--     dengan order_id NULL (email per pengguna) tetap unik lewat
--     UNIQUE(user_id, template, period), dan sebaliknya.
CREATE TABLE IF NOT EXISTS vouchers (
  code TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
  value INTEGER NOT NULL CHECK (value > 0),
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  min_total INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- Sengaja TANPA foreign key ke products: migrasi jalan SEBELUM seed di
-- database baru (produk k1/sas-k1-s1 belum ada saat migrasi diterapkan),
-- sehingga FK akan selalu gagal di sana. Integritas dijamin oleh kode:
-- seed (server/seed/products.ts: BUNDLES) dan migrasi ini hanya mengisi
-- ID produk yang dikenal.
CREATE TABLE IF NOT EXISTS bundle_members (
  bundle_product_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  PRIMARY KEY (bundle_product_id, product_id)
);

ALTER TABLE orders ADD COLUMN voucher_code TEXT;
ALTER TABLE orders ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0;

CREATE TABLE sent_emails_new (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  user_id TEXT,
  template TEXT NOT NULL,
  resend_id TEXT,
  period TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(order_id, template, period),
  UNIQUE(user_id, template, period)
);
INSERT INTO sent_emails_new (id, order_id, user_id, template, resend_id, period, created_at)
  SELECT id, order_id, user_id, template, resend_id, '', created_at FROM sent_emails;
DROP TABLE sent_emails;
ALTER TABLE sent_emails_new RENAME TO sent_emails;
CREATE INDEX IF NOT EXISTS idx_sent_emails_order ON sent_emails(order_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_user ON sent_emails(user_id);

-- Produk bundel Kelas 1-6 (harga = satuan - 20%).
INSERT OR IGNORE INTO products
  (id, title, jenjang, mapel, price, strikethrough_price, pages, cover_label, cover_color, badge, active, category, description, external_url, created_at)
VALUES
  ('bundle-k1', 'Paket Bundel Kelas 1 — Rangkuman + SAS', 'SD', 'Semua Mapel', 28800, 36000, 210, 'BND1', '#2b3a67', 'BUNDEL', 1, 'SD', 'Satu paket hemat Kelas 1: Rangkuman Materi Kelas 1 Semua Tema + Kumpulan Soal SAS & PAS Kelas 1 Semester 1. Hemat 20% dari harga satuan.', NULL, '2026-11-15T12:00:00.000Z'),
  ('bundle-k2', 'Paket Bundel Kelas 2 — Rangkuman + SAS', 'SD', 'Semua Mapel', 28800, 36000, 220, 'BND2', '#2b3a67', 'BUNDEL', 1, 'SD', 'Satu paket hemat Kelas 2: Rangkuman Materi Kelas 2 Semua Tema + Paket SAS Kelas 2. Hemat 20% dari harga satuan.', NULL, '2026-11-15T12:00:00.000Z'),
  ('bundle-k3', 'Paket Bundel Kelas 3 — Rangkuman + SAS', 'SD', 'Semua Mapel', 29600, 37000, 240, 'BND3', '#2b3a67', 'BUNDEL', 1, 'SD', 'Satu paket hemat Kelas 3: Rangkuman Materi Kelas 3 Semua Tema + Paket SAS Kelas 3. Hemat 20% dari harga satuan.', NULL, '2026-11-15T12:00:00.000Z'),
  ('bundle-k4', 'Paket Bundel Kelas 4 — Rangkuman + SAS', 'SD', 'Semua Mapel', 30400, 38000, 255, 'BND4', '#2b3a67', 'BUNDEL', 1, 'SD', 'Satu paket hemat Kelas 4: Rangkuman Materi Kelas 4 Semua Mapel + Paket SAS Kelas 4. Hemat 20% dari harga satuan.', NULL, '2026-11-15T12:00:00.000Z'),
  ('bundle-k5', 'Paket Bundel Kelas 5 — Rangkuman + SAS', 'SD', 'Semua Mapel', 31200, 39000, 270, 'BND5', '#2b3a67', 'BUNDEL', 1, 'SD', 'Satu paket hemat Kelas 5: Rangkuman Materi Kelas 5 Semua Mapel + Paket SAS Kelas 5. Hemat 20% dari harga satuan.', NULL, '2026-11-15T12:00:00.000Z'),
  ('bundle-k6', 'Paket Bundel Kelas 6 — Rangkuman + SAS', 'SD', 'Semua Mapel', 32000, 40000, 280, 'BND6', '#2b3a67', 'BUNDEL', 1, 'SD', 'Satu paket hemat Kelas 6: Rangkuman Materi Kelas 6 Semua Mapel + Paket SAS Kelas 6. Hemat 20% dari harga satuan.', NULL, '2026-11-15T12:00:00.000Z');

INSERT OR IGNORE INTO bundle_members (bundle_product_id, product_id) VALUES
  ('bundle-k1', 'k1'),
  ('bundle-k1', 'sas-k1-s1'),
  ('bundle-k2', 'k2'),
  ('bundle-k2', 'sas-k2'),
  ('bundle-k3', 'k3'),
  ('bundle-k3', 'sas-k3'),
  ('bundle-k4', 'k4'),
  ('bundle-k4', 'sas-k4'),
  ('bundle-k5', 'k5'),
  ('bundle-k5', 'sas-k5'),
  ('bundle-k6', 'k6'),
  ('bundle-k6', 'sas-k6');
