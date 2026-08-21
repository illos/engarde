import { useEffect, useState } from 'react';

// Compact click-to-copy pill — the whole pill is the copy target, the icon is
// the affordance hint (swaps to a check for a beat after a copy). Shared by the
// /campaigns card invite + the campaign status-pane eyebrow. `bg-ink-2` reads on
// both the dark UI surface and the cream presentation surface (one step off the
// container ramp on either). Deliberately below the 44pt touch floor — a small
// inline control where the touch-first rule is intentionally overridden.
export function CopyPill({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  // Clear the "copied" flash; cancels on unmount so a fast navigate-away doesn't
  // setState a dead component.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = () => {
    if (!value || !navigator.clipboard) return;
    navigator.clipboard.writeText(value).then(
      () => setCopied(true),
      () => {},
    );
  };

  const name = label ?? 'value';
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${name} copied` : `Copy ${name} ${value}`}
      className="group inline-flex items-center gap-1 px-2 py-1 bg-ink-2 border border-line rounded hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow transition-colors"
    >
      <code className="text-sm font-mono tabular">{value}</code>
      <span
        aria-hidden
        className={`inline-flex items-center justify-center transition-colors ${
          copied
            ? 'text-accent'
            : 'text-text-mute group-hover:text-accent group-focus-visible:text-accent'
        }`}
      >
        {copied ? <CheckGlyph /> : <CopyGlyph />}
      </span>
    </button>
  );
}

// Generic UI affordance icons (not Draw Steel glyph concepts, so inline SVG is
// fine per the iconography rule). 14px to sit small inside the pill.
function CopyGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
