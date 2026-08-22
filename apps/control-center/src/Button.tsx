import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({
  children,
  variant = 'default',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: 'default' | 'primary' | 'danger';
}) {
  const variants = {
    default: 'border-line bg-ink-2 text-text hover:border-accent',
    primary: 'border-accent-strong bg-accent font-semibold text-ink-0 hover:bg-accent-strong',
    danger: 'border-line bg-ink-2 text-foe hover:border-foe',
  };
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-11 items-center justify-center border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
