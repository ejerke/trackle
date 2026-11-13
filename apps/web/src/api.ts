import type {
  ApiErrorCode,
  ArchiveResponse,
  AnswerResponse,
  AuthResponse,
  ChangePasswordRequest,
  Credentials,
  DeleteAccountRequest,
  HintKind,
  HintRequest,
  HintResponse,
  ProgressListResponse,
  ProgressSaveResponse,
  PuzzleProgress,
  CheckRequest,
  CheckResponse,
  LabPuzzleResponse,
  LeaderboardPeriod,
  LeaderboardResponse,
  PuzzleResponse,
  RandomPuzzleResponse,
} from "@trackle/shared";

export class ApiRequestError extends Error {
  readonly status: number;
  /** The server's `{ error }` code, when it sent one. */
  readonly code: ApiErrorCode | null;
  /** From the Retry-After header on 429 responses. */
  readonly retryAfterSeconds: number | null;
  constructor(status: number, message: string, code: ApiErrorCode | null = null, retryAfterSeconds: number | null = null) {
    super(message);
    this.status = status;
    this.code = code;
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
    const body = (await res.json().catch(() => null)) as { error?: ApiErrorCode } | null;
    throw new ApiRequestError(
      res.status,
      `${init?.method ?? "GET"} ${path} -> ${res.status}`,
      body?.error ?? null,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Today's puzzle when `date` is omitted. */
export function fetchPuzzle(date: string | undefined, difficulty: number): Promise<PuzzleResponse> {
  return request<PuzzleResponse>(`/api/puzzles/${date ?? "today"}?difficulty=${difficulty}`);
}

/** The server's verdict, and for a correct daily puzzle its signed receipt (ADR 0025). */
function postCheck(path: string, cells: number[][]): Promise<CheckResponse> {
  const body: CheckRequest = { cells };
  return request<CheckResponse>(path, { method: "POST", body: JSON.stringify(body) });
}

export function checkTrack(date: string, difficulty: number, cells: number[][]): Promise<CheckResponse> {
  return postCheck(`/api/puzzles/${date}/check?difficulty=${difficulty}`, cells);
}

export function fetchArchive(difficulty: number): Promise<ArchiveResponse> {
  return request<ArchiveResponse>(`/api/archive?difficulty=${difficulty}`);
}

// ---- hints and answers (ADR 0014) ----

const postJson = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export function dailyHint(date: string, difficulty: number, kind: HintKind, cells: number[][], emptyCells: [number, number][]) {
  const body: HintRequest = { kind, cells, emptyCells };
  return postJson<HintResponse>(`/api/puzzles/${date}/hint?difficulty=${difficulty}`, body);
}

export async function dailyAnswer(date: string, difficulty: number): Promise<number[][]> {
  return (await postJson<AnswerResponse>(`/api/puzzles/${date}/answer?difficulty=${difficulty}`, {})).cells;
}

export function randomHint(difficulty: number, seed: string, kind: HintKind, cells: number[][], emptyCells: [number, number][]) {
  const body: HintRequest = { kind, cells, emptyCells };
  return postJson<HintResponse>(`/api/random/${difficulty}/${seed}/hint`, body);
}

export async function randomAnswer(difficulty: number, seed: string): Promise<number[][]> {
  return (await postJson<AnswerResponse>(`/api/random/${difficulty}/${seed}/answer`, {})).cells;
}

export function fetchRandomPuzzle(difficulty: number, seed: string): Promise<RandomPuzzleResponse> {
  return request<RandomPuzzleResponse>(`/api/random/${difficulty}/${seed}`);
}

export function checkRandomTrack(difficulty: number, seed: string, cells: number[][]): Promise<CheckResponse> {
  return postCheck(`/api/random/${difficulty}/${seed}/check`, cells);
}

// ---- development-only puzzle lab ----

const labPath = (difficulty: number, seed: string) => `/api/lab/${difficulty}/${encodeURIComponent(seed)}`;

export function fetchLabPuzzle(difficulty: number, seed: string): Promise<LabPuzzleResponse> {
  return request<LabPuzzleResponse>(labPath(difficulty, seed));
}

export function checkLabTrack(difficulty: number, seed: string, cells: number[][]): Promise<CheckResponse> {
  return postCheck(`${labPath(difficulty, seed)}/check`, cells);
}

// ---- accounts ----

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const fetchMe = () => request<AuthResponse>("/api/auth/me");
export const register = (c: Credentials) => post<AuthResponse>("/api/auth/register", c);
export const login = (c: Credentials) => post<AuthResponse>("/api/auth/login", c);
export const logout = () => post<void>("/api/auth/logout", {});
export const changePassword = (r: ChangePasswordRequest) => post<void>("/api/auth/password", r);
/** Fire-and-forget friendly: `keepalive` lets it finish while the page navigates away. */
export const savePreferences = (preferredDifficulty: number) =>
  request<AuthResponse>("/api/auth/preferences", {
    method: "PUT",
    body: JSON.stringify({ preferredDifficulty }),
    keepalive: true,
  });
export const fetchLeaderboard = (period: LeaderboardPeriod) =>
  request<LeaderboardResponse>(`/api/leaderboard?period=${period}`);
export const setLeaderboardVisibility = (visible: boolean) =>
  request<AuthResponse>("/api/me/leaderboard", { method: "PUT", body: JSON.stringify({ visible }) });
export const deleteAccount = (r: DeleteAccountRequest) => post<void>("/api/auth/delete-account", r);

// ---- progress sync (signed in) ----

export const fetchProgress = async () => (await request<ProgressListResponse>("/api/me/progress")).records;

/** Automatic sync of solves/checks. `keepalive` lets the request finish while the page is closing. */
export async function syncProgress(records: PuzzleProgress[], keepalive = false): Promise<PuzzleProgress[]> {
  const res = await request<ProgressListResponse>("/api/me/progress", {
    method: "PUT",
    body: JSON.stringify({ records }),
    keepalive,
  });
  return res.records;
}

/** The Save button: store this board in the account. */
export async function saveProgressBoard(record: PuzzleProgress): Promise<PuzzleProgress> {
  const res = await request<ProgressSaveResponse>("/api/me/progress/board", {
    method: "PUT",
    body: JSON.stringify({ record }),
  });
  return res.record;
}

export const deleteProgress = (keyId: string) =>
  request<void>(`/api/me/progress/${encodeURIComponent(keyId)}`, { method: "DELETE", body: "{}" });
