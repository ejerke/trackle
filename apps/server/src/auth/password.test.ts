import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.ts";

const cheap = { N: 2 ** 10, r: 8, p: 1 }; // fast for tests; production uses DEFAULT_PARAMS

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery staple", cheap);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("correct horse battery stapler", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("never stores the password, and salts every hash", async () => {
    const a = await hashPassword("hunter22", cheap);
    const b = await hashPassword("hunter22", cheap);
    expect(a).not.toContain("hunter22");
    expect(a).not.toBe(b); // different salts
    expect(a).toMatch(/^scrypt\$1024\$8\$1\$[\w-]+\$[\w-]+$/);
  });

  it("uses the parameters stored in the hash, so they can be raised later", async () => {
    const old = await hashPassword("pw-from-2026", { N: 2 ** 9, r: 8, p: 1 });
    expect(await verifyPassword("pw-from-2026", old)).toBe(true);
  });

  it("treats equivalent Unicode spellings as the same password", async () => {
    const hash = await hashPassword("café-latte", cheap); // é as one code point
    expect(await verifyPassword("café-latte", hash)).toBe(true); // e + combining accent
  });

  it("returns false for malformed hashes instead of throwing", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$4$5")).toBe(false);
  });
});
