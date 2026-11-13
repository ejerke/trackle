import {
  CHALLENGE_DIFFICULTY,
  POINTS_PER_TRACK_SQUARE,
  utcDate,
  type AccountUser,
  type ApiError,
  type LeaderboardEntry,
  type LeaderboardPeriod,
  type LeaderboardResponse,
} from "@trackle/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Db } from "../db/connection.ts";

/** How many players the board lists. */
export const LEADERBOARD_SIZE = 100;

/**
 * How long after the day's end (UTC midnight) a solve may still reach the
 * server and count: a solve at 23:59 shouldn't fail on a slow sync.
 */
export const SYNC_GRACE_MINUTES = 10;

interface StandingRow {
  user_id: number;
  username: string;
  points: number;
  solved: number;
  on_leaderboard: number;
  /** Rank among the players shown on the board; null for hidden players. */
  shown_rank: number | null;
}

/**
 * The Challenge leaderboard (ADR 0025). Nothing is stored for it: points come
 * straight from the account's progress records and the stored puzzles, so
 * they can't drift out of sync with what was solved.
 *
 * A Challenge scores when it was solved on its own UTC day, with no help (the
 * level offers none, but hints_used/revealed_at are checked anyway). "On its
 * day" is checked twice: the browser's solved_at must be on the day (as for
 * streaks), and so must verified_at, the server's own time when the solve
 * first reached it, plus SYNC_GRACE_MINUTES. solved_at alone could be
 * backdated in a hand-made request; verified_at can't.
 *
 * It's worth POINTS_PER_TRACK_SQUARE per square of track, and the clues of a
 * puzzle add up to its track length.
 */
export class Leaderboard {
  private readonly db: Db;
  private readonly now: () => Date;

  constructor(db: Db, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  /** First day counted: the 1st of the current UTC month, or null for all time. */
  from(period: LeaderboardPeriod): string | null {
    return period === "month" ? `${utcDate(this.now()).slice(0, 7)}-01` : null;
  }

  standings(period: LeaderboardPeriod, userId: number | null): LeaderboardResponse {
    const from = this.from(period);
    const rows = this.db
      .prepare(
        `WITH scored AS (
           SELECT p.user_id,
                  ? * (SELECT SUM(value) FROM json_each(z.puzzle_json, '$.rowClues')) AS points
           FROM user_progress p
           JOIN puzzles z
             ON z.difficulty = ?
            AND p.key_id = z.puzzle_date || ':' || z.difficulty
           WHERE p.solved_at IS NOT NULL
             AND substr(p.solved_at, 1, 10) = z.puzzle_date  -- on the day, says the browser
             AND p.verified_at < strftime('%Y-%m-%dT%H:%M:%fZ', z.puzzle_date, '+1 day', ?)  -- and the server
             AND p.hints_used = 0
             AND p.revealed_at IS NULL
             AND z.puzzle_date >= ?
         ),
         totals AS (
           SELECT user_id, SUM(points) AS points, COUNT(*) AS solved
           FROM scored GROUP BY user_id
         )
         SELECT t.user_id, u.username, t.points, t.solved, u.on_leaderboard,
                CASE WHEN u.on_leaderboard = 1
                     THEN RANK() OVER (PARTITION BY u.on_leaderboard ORDER BY t.points DESC)
                END AS shown_rank
         FROM totals t JOIN users u ON u.id = t.user_id
         ORDER BY t.points DESC, u.username COLLATE NOCASE`,
      )
      .all(POINTS_PER_TRACK_SQUARE, CHALLENGE_DIFFICULTY, `+${SYNC_GRACE_MINUTES} minutes`, from ?? "") as StandingRow[];

    const entries: LeaderboardEntry[] = rows
      .filter((r) => r.on_leaderboard === 1)
      .slice(0, LEADERBOARD_SIZE)
      .map((r) => ({ rank: r.shown_rank!, username: r.username, points: r.points, solved: r.solved }));

    let me: LeaderboardResponse["me"] = null;
    if (userId !== null) {
      const mine = rows.find((r) => r.user_id === userId);
      const visible =
        (this.db.prepare("SELECT on_leaderboard FROM users WHERE id = ?").pluck().get(userId) as number | undefined) === 1;
      me = { rank: mine?.shown_rank ?? null, points: mine?.points ?? 0, solved: mine?.solved ?? 0, visible };
    }
    return { period, from, entries, me };
  }
}

/** GET /api/leaderboard?period=month|all (default month). Public; `me` only when signed in. */
export function registerLeaderboardRoutes(
  app: FastifyInstance,
  leaderboard: Leaderboard,
  currentUser: (req: FastifyRequest) => AccountUser | null,
): void {
  app.get<{ Querystring: { period?: string } }>("/api/leaderboard", async (req, reply) => {
    const period = req.query.period ?? "month";
    if (period !== "month" && period !== "all") return reply.code(400).send({ error: "invalid_period" } satisfies ApiError);
    return leaderboard.standings(period, currentUser(req)?.id ?? null);
  });
}
