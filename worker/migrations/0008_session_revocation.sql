-- Session revocation: bump token_version to invalidate all outstanding
-- session tokens for a user (logout, password change, compromise response).
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
