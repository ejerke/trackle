import { describe, expect, it } from "vitest";
import { clientIp, isLoopback, rateLimitKey } from "./clientIp.ts";

describe("clientIp", () => {
  const header = "cf-connecting-ip";

  it("uses the socket address when no header is configured", () => {
    expect(clientIp("203.0.113.7", { [header]: "198.51.100.1" })).toBe("203.0.113.7");
  });

  it("trusts the header only from our own reverse proxy (loopback)", () => {
    expect(clientIp("127.0.0.1", { [header]: "198.51.100.1" }, header)).toBe("198.51.100.1");
    expect(clientIp("::1", { [header]: "198.51.100.1" }, header)).toBe("198.51.100.1");
    // Someone connecting directly can't pick their own identity by forging it.
    expect(clientIp("203.0.113.7", { [header]: "198.51.100.1" }, header)).toBe("203.0.113.7");
  });

  it("takes the first entry of a forwarded list, and ignores garbage", () => {
    expect(clientIp("127.0.0.1", { [header]: "198.51.100.1, 10.0.0.1" }, header)).toBe("198.51.100.1");
    expect(clientIp("127.0.0.1", { [header]: "not-an-ip" }, header)).toBe("127.0.0.1");
    expect(clientIp("127.0.0.1", {}, header)).toBe("127.0.0.1");
  });

  it("matches the header name case-insensitively", () => {
    expect(clientIp("127.0.0.1", { [header]: "198.51.100.1" }, "CF-Connecting-IP")).toBe("198.51.100.1");
  });
});

describe("rateLimitKey", () => {
  it("keeps IPv4 addresses, including IPv4 seen through IPv6 sockets", () => {
    expect(rateLimitKey("198.51.100.1")).toBe("198.51.100.1");
    expect(rateLimitKey("::ffff:198.51.100.1")).toBe("198.51.100.1");
  });

  it("groups IPv6 addresses by their /64 network", () => {
    const a = rateLimitKey("2001:db8:abcd:12:1111:2222:3333:4444");
    const b = rateLimitKey("2001:db8:abcd:12::99");
    const other = rateLimitKey("2001:db8:abcd:13::1");
    expect(a).toBe("2001:db8:abcd:12::/64");
    expect(b).toBe(a);
    expect(other).not.toBe(a);
  });

  it("normalises equivalent IPv6 spellings", () => {
    expect(rateLimitKey("2001:0DB8:0000:0001::1")).toBe(rateLimitKey("2001:db8:0:1:ffff::"));
    expect(rateLimitKey("::1")).toBe("0:0:0:0::/64");
    expect(rateLimitKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });
});

describe("isLoopback", () => {
  it("recognises loopback addresses", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("127.8.9.10")).toBe(true);
    expect(isLoopback("::1")).toBe(true);
    expect(isLoopback("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopback("10.0.0.1")).toBe(false);
  });
});
