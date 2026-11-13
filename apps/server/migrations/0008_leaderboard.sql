-- 0008: the Challenge leaderboard (ADR 0025). Points are computed from
-- user_progress and puzzles (see leaderboard/leaderboard.ts), so nothing new is
-- stored but whether a player wants their username shown on the board.
-- Opt-in: usernames were private until now (ADR 0015).
ALTER TABLE users ADD COLUMN on_leaderboard INTEGER NOT NULL DEFAULT 0 CHECK (on_leaderboard IN (0, 1));
