import type {
  CheckRequest,
  CheckResponse,
  LabPuzzleResponse,
  PuzzleResponse,
  RandomPuzzleResponse,
} from "@trackle/shared";

export class ApiRequestError extends Error {
  readonly status: number;
  /** From the Retry-After header on 429 responses. */
  readonly retryAfterSeconds: number | null;
  constructor(status: number, message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const retryAfter = Number(res.headers.get("Retry-After"));
    throw new ApiRequestError(
      res.status,
      `${init?.method ?? "GET"} ${path} -> ${res.status}`,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    );
  }
  return (await res.json()) as T;
}

/** Today's puzzle when `date` is omitted. */
export function fetchPuzzle(date: string | undefined, difficulty: number): Promise<PuzzleResponse> {
  return request<PuzzleResponse>(`/api/puzzles/${date ?? "today"}?difficulty=${difficulty}`);
}

async function postCheck(path: string, cells: number[][]): Promise<boolean> {
  const body: CheckRequest = { cells };
  const res = await request<CheckResponse>(path, { method: "POST", body: JSON.stringify(body) });
  return res.correct;
}

export function checkTrack(date: string, difficulty: number, cells: number[][]): Promise<boolean> {
  return postCheck(`/api/puzzles/${date}/check?difficulty=${difficulty}`, cells);
}

export function fetchRandomPuzzle(difficulty: number, seed: string): Promise<RandomPuzzleResponse> {
  return request<RandomPuzzleResponse>(`/api/random/${difficulty}/${seed}`);
}

export function checkRandomTrack(difficulty: number, seed: string, cells: number[][]): Promise<boolean> {
  return postCheck(`/api/random/${difficulty}/${seed}/check`, cells);
}

// ---- development-only puzzle lab ----

const labPath = (difficulty: number, seed: string) => `/api/lab/${difficulty}/${encodeURIComponent(seed)}`;

export function fetchLabPuzzle(difficulty: number, seed: string): Promise<LabPuzzleResponse> {
  return request<LabPuzzleResponse>(labPath(difficulty, seed));
}

export function checkLabTrack(difficulty: number, seed: string, cells: number[][]): Promise<boolean> {
  return postCheck(`${labPath(difficulty, seed)}/check`, cells);
}
