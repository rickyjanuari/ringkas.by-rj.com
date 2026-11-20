-- Kunci singkat per pengguna + isi keranjang untuk menutup race saat dua
-- request checkout tiba bersamaan sebelum order PENDING tersimpan.
CREATE TABLE IF NOT EXISTS checkout_locks (
  user_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  order_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_checkout_locks_created_at
  ON checkout_locks(created_at);
