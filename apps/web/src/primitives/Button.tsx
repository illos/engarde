import type { ButtonHTMLAttributes, ReactNode } from 'react';

// Ledger button kinds (design-system.md §5.11): rectangular blocks, engraved
// label voice (mono + uppercase + tracked — baked into the base classes, so
// children stay sentence case in code), 44px touch floor.
//
//   chrome  — max-contrast structural commit (end round / end turn). Uses the
//             per-scope `rule` token, so it renders black-on-paper and
//             ivory-on-chrome without variant switching.
//   primary — the accent block: THE attention action in a region (apply
//             damage, confirm). One per region; if two accent things are
//             visible at once, one of them is wrong.
//   danger  — destructive-but-secondary: accent outline, fills tint on hover.
//   default — quiet: hairline border, ink text.
//   ghost   — borderless, dim; for inline dismiss/cancel affordances.
export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost' | 'chrome';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-transparent text-text border border-line hover:bg-ink-1 hover:border-text-dim',
  primary:
    'bg-accent text-on-accent border border-accent hover:bg-accent-strong hover:border-accent-strong',
  danger: 'bg-transparent text-accent border border-accent hover:bg-accent-tint',
  ghost:
    'bg-transparent text-text-dim border border-transparent hover:text-text hover:border-line-soft',
  chrome: 'bg-rule text-ink-2 border border-rule hover:opacity-90',
};

// Every size keeps the 44px touch floor; sm only reduces horizontal padding
// for dense inline rows.
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-11 px-3',
  md: 'h-11 px-4',
};

export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`type-label inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rule disabled:opacity-50 disabled:pointer-events-none ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </button>
  );
}
