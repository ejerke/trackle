-- 0009: when the *server* first accepted a daily solve (ADR 0025).
-- solved_at comes from the browser and could be backdated; verified_at is the
-- server's own clock at the first sync that carried a correct solve, so the
-- leaderboard can tell a solve made on the day from one claimed later.
-- Kept once set. NULL for unsolved, random, and solves stored before this
-- column existed (their server time is unknown, so they never score).
ALTER TABLE user_progress ADD COLUMN verified_at TEXT;
