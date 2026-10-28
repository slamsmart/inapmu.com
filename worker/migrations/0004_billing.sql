-- Monthly partner plans paid via Mayar QRIS invoices.
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN plan_expires_at INTEGER;

-- One row per checkout. Fulfillment is granted only after Mayar's
-- GET /transactions/{mayar_transaction_id} reports status = 'paid'.
CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('gold', 'platinum')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'creating' CHECK (status IN ('creating', 'pending', 'paid', 'expired', 'failed')),
  mayar_invoice_id TEXT,
  mayar_transaction_id TEXT UNIQUE,
  payment_link TEXT,
  qr_string TEXT,
  expires_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  locked_until INTEGER,
  last_checked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders (status, created_at);

-- Audit log of webhook deliveries (PII redacted). Never used as payment proof.
CREATE TABLE IF NOT EXISTS mayar_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT,
  payload TEXT NOT NULL,
  matched_order_id TEXT,
  received_at INTEGER NOT NULL
);
