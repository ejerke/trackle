import type { ReactNode } from "react";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}

/**
 * An on/off switch drawn in the site's own style (no native checkbox): a
 * button with role="switch", so screen readers announce it as on or off.
 */
export function Switch({ checked, onChange, disabled, title, children }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="switch"
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
      <span className="switch__label">{children}</span>
    </button>
  );
}
