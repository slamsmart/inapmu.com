-- Store Google's stable subject identifier for OAuth account linking.
ALTER TABLE users ADD COLUMN google_subject TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_subject ON users (google_subject);
