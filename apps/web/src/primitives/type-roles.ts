// Canonical registry of TYPE ROLES — the single source of truth for how text
// is classified by job, and which typeface plays each job.
//
// Mirrors the <Glyph> convention (primitives/glyphs.ts): callers classify text
// by a semantic ROLE, never by a raw font-family. A role names a job; the
// typeface behind it is a swap, made in ONE place — the `--font-*` tokens in
// theme/tokens.css. Change a token there and every element in that role
// follows, with zero component edits. The `type-audit` script enforces that no
// component hardcodes a family.
//
// This same shape (registry → tokens → role handles → audit → convention) is
// the template the color-pack standardization will reuse.
//
// How a role is applied:
//   - Tailwind utility  `font-display` / `font-body` / `font-mono`  (generated
//     from the matching `--font-*` token — the everyday handle).
//   - Composite class   `.type-label`  (theme/type.css) for the recurring
//     engraved-label treatment (mono + uppercase + tracking), which is more
//     than a font swap.
//   - Base elements      h1/h2/h3 carry `display` by default; everything else
//     inherits `body`.

export type TypeRole = 'display' | 'body' | 'label';

export interface TypeRoleDef {
  /** The CSS custom property (in tokens.css) that holds this role's typeface. */
  token: string;
  /** The Tailwind utility that applies the role's font-family. */
  utility: `font-${string}`;
  /** The typeface currently behind the role (informational — the token is truth). */
  face: string;
  /** What this role is for. */
  usage: string;
}

export const TYPE_ROLES = {
  display: {
    token: '--font-display',
    utility: 'font-display',
    face: 'Playfair Display',
    usage:
      'Names, page titles, ability names, ceremonial numerals. Roman is the nameplate; italic is the editorial aside (statblock names, notes, placeholders). Never uppercase, never tracked.',
  },
  body: {
    token: '--font-body',
    utility: 'font-body',
    face: 'Barlow Semi Condensed',
    usage: 'Data prose: log lines, effect text, descriptions. The global default.',
  },
  label: {
    token: '--font-mono',
    utility: 'font-mono',
    face: 'Geist Mono',
    usage:
      'Small-caps engraved labels, section tags, pill/metadata text, plus literal data (IDs, dice, stamina fractions, deltas, timestamps). Often via the .type-label composite; data columns add .tabular.',
  },
} satisfies Record<TypeRole, TypeRoleDef>;

export const TYPE_ROLE_NAMES = Object.keys(TYPE_ROLES) as TypeRole[];
