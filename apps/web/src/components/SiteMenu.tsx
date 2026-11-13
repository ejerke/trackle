import { useAuth } from "../auth";

/**
 * The ☰ button and the site links it opens. Uses the browser's popover
 * (popover="auto"): it opens in the top layer and closes on Escape or a tap
 * anywhere else, with no state or listeners of our own.
 */
export function SiteMenu() {
  const { user, signOut } = useAuth();
  return (
    <>
      <button type="button" className="icon-button" popoverTarget="site-menu" aria-label="Menu" title="Menu">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <nav id="site-menu" popover="auto" className="site-menu" aria-label="Site">
        <a href="/">Today</a>
        <a href="/archive">Archive</a>
        <a href="/stats">Stats</a>
        <a href="/bookmarks">Bookmarks</a>
        <a href="/leaderboard">Leaderboard</a>
        <a href="/privacy">Privacy</a>
        <a href="/account" className="site-menu__account">
          {user ? user.username : "Sign in"}
        </a>
        {user && (
          <button
            type="button"
            className="site-menu__item"
            popoverTarget="site-menu"
            popoverTargetAction="hide"
            onClick={() => void signOut()}
            title="Your progress stays in your account; this browser forgets it"
          >
            Sign out
          </button>
        )}
      </nav>
    </>
  );
}
