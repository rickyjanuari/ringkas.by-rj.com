-- Jejak event dari API payment pusat. event_id unik membuat delivery ulang
-- aman, tanpa memproses pemenuhan order lebih dari sekali.
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  event_id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_order
  ON payment_webhook_events(order_id);
