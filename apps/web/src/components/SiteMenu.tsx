import { useAuth } from "../auth";

/**
 * The ☰ button and the site links it opens. Uses the browser's popover
 * (popover="auto"): it opens in the top layer and closes on Escape or a tap
 * anywhere else, with no state or listeners of our own.
 */
export function SiteMenu() {
  const { user } = useAuth();
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
        <a href="/account" className="site-menu__account">
          {user ? user.username : "Sign in"}
        </a>
      </nav>
    </>
  );
}
