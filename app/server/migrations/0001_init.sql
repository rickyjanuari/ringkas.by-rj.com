-- 0001_init.sql — tabel inti: pengguna, produk, bab, soal, order.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  whatsapp TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  jenjang TEXT NOT NULL,
  mapel TEXT NOT NULL,
  price INTEGER NOT NULL,
  strikethrough_price INTEGER,
  pages INTEGER NOT NULL DEFAULT 0,
  cover_label TEXT NOT NULL DEFAULT '',
  cover_color TEXT NOT NULL DEFAULT '#2273d8',
  badge TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL DEFAULT 'SD',
  description TEXT NOT NULL DEFAULT '',
  external_url TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'gallery',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  grade INTEGER NOT NULL,
  semester INTEGER NOT NULL DEFAULT 1,
  summary TEXT NOT NULL DEFAULT '',
  points TEXT NOT NULL DEFAULT '[]',
  focus_text TEXT NOT NULL DEFAULT '',
  video_url TEXT,
  video_duration TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS flashcards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS simulations (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  subject TEXT NOT NULL,
  grade INTEGER NOT NULL,
  paket TEXT NOT NULL DEFAULT 'A',
  title TEXT NOT NULL,
  total_minutes INTEGER NOT NULL,
  max_points INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE CASCADE,
  simulation_id TEXT REFERENCES simulations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  question TEXT NOT NULL,
  options TEXT,
  answer TEXT NOT NULL,
  discussion TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  grade INTEGER NOT NULL DEFAULT 1,
  points INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_questions_chapter ON questions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_questions_sim ON questions(simulation_id);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  items TEXT NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  klikqris_order_id TEXT,
  qris_url TEXT,
  direct_url TEXT,
  total_amount INTEGER,
  signature TEXT,
  whatsapp TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_klikqris ON orders(klikqris_order_id);
