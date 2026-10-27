-- Bind sensitive partner actions to the authenticated account.
ALTER TABLE listings ADD COLUMN owner_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE verifications ADD COLUMN user_id INTEGER REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_listings_owner_user ON listings (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_verifications_user ON verifications (user_id);
