import { createHmac, timingSafeEqual } from "node:crypto";
import type { SolveReceipt } from "@trackle/shared";
import type { Db } from "../db/connection.ts";

/**
 * Signed solve receipts (ADR 0025). When the server accepts a daily solve it
 * hands out { at, sig }: its own time, signed with a secret only it knows. The
 * browser keeps the receipt with the solve; whenever the solve reaches an
 * account (sync, sign-up import, days later), the receipt proves when it was
 * really made. Without the secret a receipt can't be made or backdated.
 *
 * Bound to the puzzle (its key id) and the time, not to a player.
 */
export class SolveReceipts {
  private readonly secret: Buffer;

  constructor(db: Db) {
    const hex = db.prepare("SELECT value FROM server_secrets WHERE name = 'solve_receipt'").pluck().get() as string | undefined;
    if (!hex) throw new Error("No solve receipt secret: has migration 0010 run?");
    this.secret = Buffer.from(hex, "hex");
  }

  issue(keyId: string, now: Date): SolveReceipt {
    const at = now.toISOString();
    return { at, sig: this.sign(keyId, at) };
  }

  /** True only for a receipt this server made for this puzzle. */
  verify(keyId: string, receipt: SolveReceipt): boolean {
    const expected = Buffer.from(this.sign(keyId, receipt.at));
    const given = Buffer.from(receipt.sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private sign(keyId: string, at: string): string {
    return createHmac("sha256", this.secret).update(`${keyId}\n${at}`).digest("base64url");
  }
}
