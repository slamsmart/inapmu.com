-- AI layer: store facility tags per listing so match-score and recommendations
-- (worker/lib/score.ts) can read real data instead of inventing it.
ALTER TABLE listings ADD COLUMN amenities TEXT NOT NULL DEFAULT '';
