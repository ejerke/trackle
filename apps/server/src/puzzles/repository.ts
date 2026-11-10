import type { Endpoint, Hint, PublicPuzzle } from "@trackle/shared";
import type { Db } from "../db/connection.ts";

export interface StoredPuzzle {
  id: number;
  puzzle: PublicPuzzle;
  /** PRIVATE: never send to clients. */
  solution: number[][];
}

export interface NewPuzzle {
  puzzle: PublicPuzzle;
  solution: number[][];
  seed: string;
  generatorVersion: number;
}

/** Shape of puzzles.puzzle_json. */
interface PuzzleJson {
  rowClues: number[];
  colClues: number[];
  endpoints: [Endpoint, Endpoint];
  hints: Hint[];
}

interface PuzzleRow {
  id: number;
  puzzle_date: string;
  difficulty: number;
  width: number;
  height: number;
  puzzle_json: string;
  solution_json: string;
}

/** All SQL for the puzzles table lives here. */
export class PuzzleRepository {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  find(date: string, difficulty: number): StoredPuzzle | null {
    const row = this.db
      .prepare(
        `SELECT id, puzzle_date, difficulty, width, height, puzzle_json, solution_json
         FROM puzzles WHERE puzzle_date = ? AND difficulty = ?`,
      )
      .get(date, difficulty) as PuzzleRow | undefined;
    return row ? fromRow(row) : null;
  }

  /**
   * Insert unless a puzzle for that (date, difficulty) already exists. Safe
   * under concurrent first requests: the loser's insert is silently skipped.
   */
  insertIfAbsent(p: NewPuzzle): void {
    const { puzzle } = p;
    const json: PuzzleJson = {
      rowClues: puzzle.rowClues,
      colClues: puzzle.colClues,
      endpoints: puzzle.endpoints,
      hints: puzzle.hints,
    };
    this.db
      .prepare(
        `INSERT INTO puzzles
           (puzzle_date, difficulty, width, height, seed, generator_version, puzzle_json, solution_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (puzzle_date, difficulty) DO NOTHING`,
      )
      .run(
        puzzle.date,
        puzzle.difficulty,
        puzzle.width,
        puzzle.height,
        p.seed,
        p.generatorVersion,
        JSON.stringify(json),
        JSON.stringify(p.solution),
      );
  }
}

function fromRow(row: PuzzleRow): StoredPuzzle {
  const json = JSON.parse(row.puzzle_json) as PuzzleJson;
  return {
    id: row.id,
    puzzle: {
      date: row.puzzle_date,
      difficulty: row.difficulty,
      width: row.width,
      height: row.height,
      ...json,
    },
    solution: JSON.parse(row.solution_json) as number[][],
  };
}
