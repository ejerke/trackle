/** Minimal cookie helpers: we only ever set and read one cookie. */

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header?.split(";") ?? []) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      // Ignore malformed values instead of failing the request.
    }
  }
  return result;
}

export interface CookieOptions {
  maxAgeSeconds: number;
  /** Only sent over HTTPS. On in production; off for http://localhost in development. */
  secure: boolean;
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${options.maxAgeSeconds}`,
    "HttpOnly", // not readable from JavaScript, so XSS can't steal it
    "SameSite=Lax", // not sent on cross-site POSTs (CSRF protection)
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}
