import { useEffect } from "react";
import type { Mode } from "../board/model";

const MODES: { mode: Mode; label: string; key: string; icon: React.ReactNode }[] = [
  {
    mode: "track",
    label: "Track",
    key: "1",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4 3v6a8 8 0 0 0 8 8h5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      </svg>
    ),
  },
  {
    mode: "isTrack",
    label: "Is track",
    key: "2",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" fill="currentColor" opacity="0.45" />
        <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    mode: "noTrack",
    label: "No track",
    key: "3",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    ),
  },
];

/** A tool's icon and name, as on its toolbar button (for the how-to-play pages). */
export function ToolChip({ mode }: { mode: Mode }) {
  const m = MODES.find((x) => x.mode === mode)!;
  return (
    <span className="tool-chip">
      {m.icon}
      {m.label}
    </span>
  );
}

export function Toolbar({ mode, onMode, disabled }: { mode: Mode; onMode(m: Mode): void; disabled: boolean }) {
  // Keyboard shortcuts 1 / 2 / 3.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled || e.ctrlKey || e.metaKey || e.altKey) return;
      const found = MODES.find((m) => m.key === e.key);
      if (found) onMode(found.mode);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onMode, disabled]);

  return (
    <div className="toolbar" role="toolbar" aria-label="Drawing mode">
      {MODES.map((m) => (
        <button
          key={m.mode}
          type="button"
          className="toolbar__button"
          aria-pressed={mode === m.mode}
          disabled={disabled}
          onClick={() => onMode(m.mode)}
          title={`${m.label} (${m.key})`}
        >
          {m.icon}
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  );
}
