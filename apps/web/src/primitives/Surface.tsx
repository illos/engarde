import type { ElementType, ReactNode } from 'react';

export type SurfaceKind = 'paper' | 'chrome';

export interface SurfaceProps {
  kind: SurfaceKind;
  /** Element to render — defaults to `div`. Use `header`/`section` for bands. */
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

// Marks a region as a paper or chrome surface. Setting `data-surface` remaps
// the ink/text/line/rule tokens for everything inside (see theme/tokens.css +
// docs/design-system.md §2) — components keep using `bg-ink-*` / `text-text`
// / `border-line`; only the surface scope changes.
//
// Paper is the page default, so you only need this to (a) open a chrome
// region — the black instrument frame: app header bands, statblock
// mastheads, active tabs — with <Surface kind="chrome">, or (b) nest a paper
// sub-region back inside a chrome one with <Surface kind="paper">.
//
// A chrome Surface only remaps tokens; give the region its own background
// (`bg-ink-0` for the frame black) like any other container.
export function Surface({ kind, as: Tag = 'div', className, children }: SurfaceProps) {
  return (
    <Tag data-surface={kind} className={className}>
      {children}
    </Tag>
  );
}
