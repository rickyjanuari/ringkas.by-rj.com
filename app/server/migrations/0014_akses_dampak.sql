-- 0014_akses_dampak.sql — 6 fitur akses & dampak (pengaturan akun,
-- portofolio karya anak, latihan tanpa habis, glosarium ketuk-kata,
-- beli 1 donasi 1).
--
--   - user_settings: satu baris per pengguna (UPSERT); semua saklar
--     0/1, default 0 (belum ada baris = semua mati).
--   - portfolio_items: karya anak — gambar disimpan sebagai data URL
--     JPEG/PNG base64, maks. 200 KB (dijaga server), maks. 20 item
--     per anak (dijaga server).
--   - portfolio_stars: satu bintang per (item, pemberi) — UPSERT,
--     pemberi hanya orang tua terhubung / guru kelasnya.
--   - portfolio_comments: komentar orang tua terhubung / guru kelasnya.
--   - endless_sets: satu set latihan (5 soal + kunci) per panggilan
--     GET /api/endless/:grade; kunci TIDAK PERNAH dikembalikan ke
--     klien, hanya dipakai penilaian server-side saat submit.
--   - donations: satu baris per order yang checkout-nya memakai
--     donate=true; amount = jumlah harga produk (SEBELUM diskon
--     voucher). Status: pending (order dibuat) -> available (order
--     LUNAS) -> assigned (admin menugaskan ke penerima lewat
--     gift_grants).
--
-- Sengaja TANPA foreign key (pola migrasi 0005/0011/0012/0013):
-- migrasi jalan SEBELUM seed di database baru.

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  readable_font INTEGER NOT NULL DEFAULT 0,
  high_contrast INTEGER NOT NULL DEFAULT 0,
  large_text INTEGER NOT NULL DEFAULT 0,
  data_saver INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS portfolio_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  caption TEXT,
  image TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_portfolio_items_user ON portfolio_items(user_id);

CREATE TABLE IF NOT EXISTS portfolio_stars (
  item_id INTEGER NOT NULL,
  by_user_id TEXT NOT NULL,
  stars INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (item_id, by_user_id)
);

CREATE TABLE IF NOT EXISTS portfolio_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  by_user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS endless_sets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  grade INTEGER NOT NULL,
  questions TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS donations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  donor_user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  recipient_user_id TEXT,
  assigned_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_donations_order ON donations(order_id);
