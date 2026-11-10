import type {
  ApiErrorCode,
  ArchiveResponse,
  AuthResponse,
  ChangePasswordRequest,
  Credentials,
  DeleteAccountRequest,
  CheckRequest,
  CheckResponse,
  LabPuzzleResponse,
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

async function postCheck(path: string, cells: number[][]): Promise<boolean> {
  const body: CheckRequest = { cells };
  const res = await request<CheckResponse>(path, { method: "POST", body: JSON.stringify(body) });
  return res.correct;
}

export function checkTrack(date: string, difficulty: number, cells: number[][]): Promise<boolean> {
  return postCheck(`/api/puzzles/${date}/check?difficulty=${difficulty}`, cells);
}

export function fetchArchive(difficulty: number): Promise<ArchiveResponse> {
  return request<ArchiveResponse>(`/api/archive?difficulty=${difficulty}`);
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

// ---- accounts ----

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const fetchMe = () => request<AuthResponse>("/api/auth/me");
export const register = (c: Credentials) => post<AuthResponse>("/api/auth/register", c);
export const login = (c: Credentials) => post<AuthResponse>("/api/auth/login", c);
export const logout = () => post<void>("/api/auth/logout", {});
export const changePassword = (r: ChangePasswordRequest) => post<void>("/api/auth/password", r);
export const deleteAccount = (r: DeleteAccountRequest) => post<void>("/api/auth/delete-account", r);
