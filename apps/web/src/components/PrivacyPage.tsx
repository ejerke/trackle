import type { ProgressStore } from "../storage/progressStore";
import { Page } from "./Page";

/**
 * Where to write about privacy. A Cloudflare Email Routing alias that forwards
 * to the operator: if it attracts spam, replace it here and drop the old one.
 */
const CONTACT = "support.trackle [at] ejerke.org";

/** When this page last changed in substance. */
const UPDATED = "13 November 2026";

/**
 * What Trackle stores, where, for how long, and why. Plain language, kept in
 * step with the code: docs/client-storage.md (browser), docs/database.md
 * (server), deploy/Caddyfile (access log), ADR 0010 (rate limits), ADR 0025
 * (leaderboard).
 */
export function PrivacyPage({ store }: { store: ProgressStore }) {
  return (
    <Page subtitle="Privacy" store={store}>
      <article className="prose">
        <p className="prose__lead">
          Trackle is a hobby project. It has no ads, no analytics, no trackers and no third-party scripts, and it
          never sells or shares anything about you. This page lists everything it does store.
        </p>

        <h2>In your browser</h2>
        <p>Trackle keeps your game in your browser's local storage, so you can close the page and carry on:</p>
        <ul>
          <li>your boards, solves, times, hints used, bookmarks, and the server's signed receipt for each daily solve;</li>
          <li>the difficulty you chose, the last random puzzle at each level, whether you've seen “How to play”, and
            whether you hid the leaderboard under the Challenge.</li>
        </ul>
        <p>
          It stays on your device. Clearing this site's data in your browser removes it. When a board is checked or
          you ask for a hint, the board is sent to the server for that answer and not kept.
        </p>

        <h2>The one cookie</h2>
        <p>
          Signing in sets a single cookie, <code>trackle_session</code>, which keeps you signed in for up to 30 days.
          It's needed for signing in and does nothing else, which is why there's no cookie banner. Without an account,
          Trackle sets no cookies at all.
        </p>

        <h2>If you create an account</h2>
        <p>The server stores:</p>
        <ul>
          <li>your username, and your password only as a salted scrypt hash (never the password itself);</li>
          <li>when the account was made, the difficulty you chose, and whether you want to appear on the leaderboard;</li>
          <li>your progress, as listed above, so it's the same on all your devices. Unfinished boards only when you
            press Save.</li>
        </ul>
        <p>No email address or real name is asked for. This is used only to run your account and the leaderboard.</p>

        <h2>The leaderboard</h2>
        <p>
          Your username appears on the <a href="/leaderboard">Challenge leaderboard</a>, with your points and the
          number of Challenges you solved, only if you tick “Show me on the leaderboard”. Untick it and you're gone
          from the board straight away. Your points are worked out from your progress; nothing extra is stored.
        </p>

        <h2>Network and server</h2>
        <ul>
          <li>
            Requests go through <b>Cloudflare</b>, which protects and speeds up the site and sees your IP address and
            the pages you request (see{" "}
            <a href="https://www.cloudflare.com/privacypolicy/" rel="noreferrer">Cloudflare's privacy policy</a>).
          </li>
          <li>
            The web server (Caddy) keeps an <b>access log</b>: IP address, time, the address requested and your
            browser's name. It's used to keep the site running and safe, and old logs are deleted after at most 90
            days.
          </li>
          <li>
            To stop abuse, the app counts requests per IP address <b>in memory only</b>. That's never written down and
            is forgotten when the server restarts.
          </li>
          <li>
            The database is <b>backed up</b> daily on the same server. A backup is kept for about 30 days.
          </li>
        </ul>

        <h2>Deleting your data</h2>
        <p>
          On the <a href="/account">account page</a>, “Delete account” removes your account, your sessions and all your
          progress at once. Copies in backups disappear as the backups expire, within about 30 days. Your browser's own
          copy stays until you clear the site's data.
        </p>

        <h2>Your rights</h2>
        <p>
          You can ask for a copy of what's stored about you, have it corrected or deleted, or object to its use: write
          to {CONTACT}. If you think your data is mishandled, you can also complain
          to your data protection authority.
        </p>

        <h2>Why</h2>
        <p>
          An account and its progress are kept because you asked for them; logs, rate limits and backups because
          they're needed to run the site safely.
        </p>

        <p className="prose__updated">Last updated {UPDATED}.</p>
      </article>
    </Page>
  );
}
