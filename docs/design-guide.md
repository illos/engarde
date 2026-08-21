# Design guide

> The working rules for building En Garde UI. The visual language is ported
> from the ironyard-v2 predecessor (its `docs/design-ref/` +
> `docs/milestones/ui-refresh.md` hold the full rationale); this file is the
> distilled, binding version for this codebase. Living document — add rules
> as they're decided, with the why.

## Tokens, not values

All color, spacing, and type come from the token layer in
`apps/web/src/theme/tokens.css` (OKLCH CSS variables surfaced to Tailwind v4
via `@theme inline`). Components use the token utilities — `bg-ink-1`,
`text-text-dim`, `border-line`, `text-accent` — never raw hex/oklch values or
Tailwind's stock palette (`stone-*`, `zinc-*`, …).

**Two surface kinds, one set of token names.** UI-heavy (dark twilight ramp)
is the default; paper-analog content (sheets, stat blocks, the join-screen
campaign card) wraps in `<Surface kind="presentation">`, which remaps the
same `ink/text/line` names to the cream ramp. Components never switch
classes between surfaces — only the surface scope changes.

**Accent packs** (`data-pack`: regal / lightning / shadow / fireball /
chrome) retheme `--accent` at the document root. Default is regal (muted
gold).

## Type roles, never typefaces

Text is classified by **role**; the typeface behind a role is a one-line
swap in `tokens.css`:

| Role | Utility | Face | Use |
|---|---|---|---|
| display | `font-display` (default on `h1`–`h3`) | Cormorant Garamond | Headings, names, big numerals |
| body | `font-body` (global default) | EB Garamond | Prose and reading text |
| label | `.type-label` composite (mono + uppercase + tracking) or `font-mono` | Geist Mono | Engraved section tags, metadata, badges, IDs, codes |

Never hardcode a `font-family` or use `font-serif`/`font-sans` in a
component. Registry: `apps/web/src/primitives/type-roles.ts`.

## Fonts are self-hosted

All typefaces ship from our origin — `@fontsource/*` packages imported in
`apps/web/src/styles.css`, bundled by Vite. **No font CDN links**
(the predecessor loaded Google Fonts; that was deliberately dropped). Adding
a weight = adding one `@import` line; adding a face = a new @fontsource
package + a token change. The Draw Steel Glyphs icon font (CC BY-SA 4.0,
attribute MCDM) ports the same way — as a local asset with its license file —
when the first glyph-bearing surface lands.

## Touch-first

- **44px minimum hit target** for standalone controls. `<Button>` `md`
  (`h-11`) is the floor and the default; `sm` (`h-9`) is only for dense
  inline rows where the trade is deliberate.
- **No hover-only affordances** — anything with `hover:` needs a
  `focus-visible:` treatment, and state changes must be visible without a
  pointer.
- **Inputs use `text-base` (16px) or larger — always.** iOS Safari zooms the
  whole page when a focused input's font-size is under 16px, and does not
  zoom back out. Every `<input>`, `<textarea>`, and `<select>` carries
  `text-base` explicitly (don't rely on inherited size — a parent `text-sm`
  silently reintroduces the zoom).
- iPad landscape is the design sweet spot; iPhone portrait must remain
  functional.

## Conventions carried from the predecessor

- Square corners (`--radius-*: 0`) — no rounded cards or buttons.
- Draw Steel iconography (tier banners, keyword/range/action icons,
  characteristic badges) renders via the official Draw Steel Glyphs font
  through a shared `<Glyph>` component — never emoji, unicode lookalikes, or
  bespoke SVGs for those concepts. Generic UI affordances (copy, check,
  chevrons) are fine as inline SVG.
- `tabular` class (`font-variant-numeric: tabular-nums`) on any column of
  changing numerals.
- Errors that reach the user come from client-visible `ConvexError` payloads
  (`errorMessage()` in `pages/campaigns/AppScreen.tsx`); internal errors
  render a generic line, never a stack or internal string.
