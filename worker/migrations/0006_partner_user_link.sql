-- Link a partner application to the signed-in account that submitted it.
-- Paid plans (Mayar QRIS) are only sold to partners, not to regular users.
ALTER TABLE partners ADD COLUMN user_id INTEGER REFERENCES users (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_partners_user ON partners (user_id);
