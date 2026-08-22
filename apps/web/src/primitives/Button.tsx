import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-ink-2 text-text border border-line hover:border-accent',
  primary: 'bg-accent text-ink-0 border border-accent-strong hover:bg-accent-strong font-semibold',
  danger: 'bg-ink-2 text-foe border border-line hover:border-foe',
  ghost:
    'bg-transparent text-text-dim border border-transparent hover:text-text hover:border-line-soft',
};

// Every size keeps the 44px touch floor; sm only reduces horizontal padding
// and type size for dense inline rows.
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-11 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
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
      className={`inline-flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow disabled:opacity-50 disabled:pointer-events-none ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </button>
  );
}
