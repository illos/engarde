import type { ElementType, ReactNode } from 'react';

export type SurfaceKind = 'ui' | 'presentation';

export interface SurfaceProps {
  kind: SurfaceKind;
  /** Element to render — defaults to `div`. Use `section`/`article` for sheets. */
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

// Marks a region as a UI-heavy or presentation surface. Setting
// `data-surface` remaps the ink/text/line tokens for everything inside (see
// theme/tokens.css + ui-refresh.md §5.1) — components keep using
// `bg-ink-*` / `text-text` / `border-line`; only the surface scope changes.
//
// UI-heavy is the page default, so you only need this to (a) open a
// presentation region — wrap paper-analog content (character sheets,
// stat-blocks, ability cards, rule quotes) in <Surface kind="presentation">
// — or (b) nest a UI-heavy sub-region back inside a presentation one with
// <Surface kind="ui">. Presentation styling otherwise "travels with" the
// StatBlock / AbilityCard / RuleQuote components, which set it intrinsically.
export function Surface({ kind, as: Tag = 'div', className, children }: SurfaceProps) {
  return (
    <Tag data-surface={kind} className={className}>
      {children}
    </Tag>
  );
}
