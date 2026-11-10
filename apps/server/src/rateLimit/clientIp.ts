import { isIP } from "node:net";

/**
 * Who is this request from? The key for per-client rate limits.
 *
 * In production the chain is: browser → Cloudflare → Caddy → Node (on
 * 127.0.0.1). Node's socket then always sees Caddy, i.e. a loopback address,
 * and the real client is in a header (Cloudflare sets `CF-Connecting-IP`).
 *
 * Headers can be forged by anyone who can reach us directly, so the header is
 * only trusted when the socket peer is loopback (our own reverse proxy). That
 * is only safe if the proxy itself can't be reached around Cloudflare, or
 * overwrites the header. See docs/adr/0010-rate-limiting.md.
 */
export function clientIp(socketAddress: string | undefined, headers: Record<string, string | string[] | undefined>, trustedHeader?: string): string {
  const peer = socketAddress ?? "unknown";
  if (trustedHeader && isLoopback(peer)) {
    const raw = headers[trustedHeader.toLowerCase()];
    // X-Forwarded-For style lists: the first entry is the original client.
    const first = (Array.isArray(raw) ? raw[0] : raw)?.split(",")[0]?.trim();
    if (first && isIP(stripZone(first))) return rateLimitKey(first);
  }
  return rateLimitKey(peer);
}

export function isLoopback(ip: string): boolean {
  const v4 = unmapIPv4(ip);
  return v4.startsWith("127.") || ip === "::1";
}

/**
 * Normalise an IP into the unit we limit. IPv4: the address. IPv6: its /64
 * network, because one home or phone usually gets a whole /64 and could
 * otherwise rotate through billions of addresses.
 */
export function rateLimitKey(ip: string): string {
  const plain = unmapIPv4(stripZone(ip));
  if (isIP(plain) !== 6) return plain;
  return `${expandIPv6(plain).slice(0, 4).join(":")}::/64`;
}

const stripZone = (ip: string) => ip.split("%")[0]!;

/** "::ffff:1.2.3.4" (IPv4 seen through an IPv6 socket) → "1.2.3.4". */
const unmapIPv4 = (ip: string) => (/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip) ? ip.slice(7) : ip);

/** Eight lowercase hex groups without leading zeros, "::" expanded. */
function expandIPv6(ip: string): string[] {
  const toGroups = (part: string) => {
    if (part === "") return [];
    return part.split(":").flatMap((g) => {
      if (!g.includes(".")) return [g];
      // Embedded IPv4 in the last 32 bits, e.g. "64:ff9b::1.2.3.4".
      const [a, b, c, d] = g.split(".").map(Number) as [number, number, number, number];
      return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
    });
  };
  const [head = "", tail] = ip.split("::");
  const h = toGroups(head);
  const t = tail === undefined ? [] : toGroups(tail);
  const groups = tail === undefined ? h : [...h, ...new Array<string>(8 - h.length - t.length).fill("0"), ...t];
  return groups.map((g) => parseInt(g, 16).toString(16));
}
