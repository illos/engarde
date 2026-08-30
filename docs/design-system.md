# En Garde design system — **The Ledger**

> The binding visual language for the site, distilled from the user's
> claude-design mockups (2026-08-30: director console, table header, round
> log, compact table view). This document is the **what**; the working rules
> for building it (tokens-not-values, type roles, touch-first, self-hosted
> fonts) stay in [`design-guide.md`](design-guide.md) and are unchanged —
> this system supersedes the *visual values* ported from the ironyard-v2
> predecessor (twilight dark ramp, gold accent), not the architecture.

> ⚠️ **The mockups are filler, not canon.** Every ability name, ability
> effect, stat label, stat value, and monster role in the reference
> screenshots ("Withering Sign", "Malice Tithe", "ARMOUR 9", "CASTER ·
> PRIORITY", …) is invented placeholder content that has NOT passed canon
> gating. Nothing from the mockups may be copied into code, fixtures,
> tests, or copy. This document deliberately specs geometry, color, and
> type only — where it must name a game concept it defers to the engine and
> the pin.

---

## 1 · Character

The Ledger is a **field ledger / broadsheet**: a paper-first instrument
with heavy black press rules, engraved monospace labels, and one editorial
serif voice. Five commitments, in priority order:

1. **Paper first, chrome sparingly.** The working field is warm off-white.
   Near-black is *chrome* — the app frame, statblock mastheads, primary
   commit actions — never a content background. The page should read like
   a printed sheet clamped in a black instrument.
2. **Square everything.** Zero border-radius, everywhere, at every size
   (already binding: `--radius-*: 0`). Rectangles butt against rules;
   nothing floats on soft shadows. `--shadow-card: none` stays.
3. **Hierarchy through typography, not boxes.** Emphasis comes from the
   three-voice type system (engraved mono label / didone display / plain
   grotesque body) and from black rules — not from tint fills, elevation,
   or extra containers. Before adding a background or border to
   distinguish something, try type role + weight + a hairline.
4. **Muted, semantic color.** Chromatic color is *state information only*
   — desaturated green / worn gold / brick red — plus one brick-red accent
   for "attention lives here." Decorative color does not exist in this
   system. If a color doesn't mean something, it's ink or paper.
5. **The 90° rail.** Major regions are named in the margin: rotated
   engraved labels reading bottom-to-top on a recessed rail. Section
   naming is furniture, not headline — it frees the horizontal band for
   data.

---

## 2 · Color tokens

All values OKLCH, sampled from the mockups. These re-point the **existing
token names** in `apps/web/src/theme/tokens.css`; components keep using
`bg-ink-*` / `text-text-dim` / `border-line` / `text-accent` utilities.

### 2.1 Paper ramp (the default surface)

The elevation ramp runs *recessed → field → raised*. The page body sits at
`--ink-2` (one change from the predecessor, where body sat at `--ink-0`).

| Token | Value | ≈ hex | Use |
|---|---|---|---|
| `--ink-0` | `oklch(0.885 0.023 87)` | `#ded7c6` | deep wells: pressed states, scrollbar tracks |
| `--ink-1` | `oklch(0.905 0.023 87)` | `#e6dfcf` | recessed panels: tab bands, rotated rails, table header strips, inactive spine cells |
| `--ink-2` | `oklch(0.944 0.016 86)` | `#f1ece1` | **the field** — page background |
| `--ink-3` | `oklch(0.962 0.013 86)` | `#f6f2e8` | intermediate: hovered card, zebra row |
| `--ink-4` | `oklch(0.977 0.011 85)` | `#fbf7ef` | **cards** — raised ivory sheets (figure cards, statblock body, inputs) |
| `--line` | `oklch(0.82 0.012 88)` | `#c6c2b8` | hairline borders + dotted row separators |
| `--line-soft` | `oklch(0.82 0.012 88 / 0.5)` | — | faintest separators |
| `--rule` | `oklch(0.192 0.010 89)` | `#16140f` | **press rules** — the heavy 2px structural black lines (new token) |
| `--text` | `oklch(0.285 0.004 85)` | `#2b2a28` | body ink |
| `--text-dim` | `oklch(0.557 0.022 88)` | `#797365` | secondary: descriptors, counts |
| `--text-mute` | `oklch(0.684 0.024 87)` | `#a09989` | tertiary: timestamps, acted-out entries, disabled |

### 2.2 Chrome scope

The black frame is a surface scope — `<Surface kind="chrome">` →
`[data-surface="chrome"]` — remapping the *same* token names (the
mechanism that today serves `presentation` — that kind retires; see §10).
Used for: the app header band, statblock mastheads, active tabs, black
commit buttons, "selected figure" heroes.

| Token | Value | ≈ hex |
|---|---|---|
| `--ink-0` | `oklch(0.192 0.010 89)` | `#16140f` |
| `--ink-1` | `oklch(0.23 0.010 89)` | `#211e18` |
| `--ink-2` | `oklch(0.27 0.010 89)` | `#2a271f` |
| `--ink-3` | `oklch(0.32 0.010 89)` | `#363228` |
| `--ink-4` | `oklch(0.40 0.010 89)` | `#4c473b` |
| `--line` | `oklch(0.40 0.012 89 / 0.8)` | — |
| `--text` | `oklch(0.977 0.011 85)` | `#fbf7ef` |
| `--text-dim` | `oklch(0.78 0.015 87)` | `#bfb9ab` |
| `--text-mute` | `oklch(0.62 0.015 87)` | `#8d887a` |

### 2.3 Accent — brick red, singular

One accent. It means **"the table's attention is here"**: the current
round badge, the active figure in the spine, the primary damage/commit
action, costs, warnings, awaiting states.

| Token | Value | ≈ hex | Use |
|---|---|---|---|
| `--accent` | `oklch(0.46 0.128 25)` | `#923433` | fills (badges, active spine cell, commit button); text on paper (costs, deltas, danger numbers) |
| `--accent-strong` | `oklch(0.537 0.160 32)` | `#b83f2b` | hover/active of accent fills; the brighter punch variant |
| `--accent-deep` | `oklch(0.342 0.099 25)` | `#621e1d` | text on accent-tint panels (the awaiting banner voice) |
| `--accent-tint` | `oklch(0.941 0.015 55)` | `#f4e9e2` | tinted panel background (awaiting / warning surfaces) |
| `--accent-tint-line` | `oklch(0.746 0.054 24)` | `#cda09c` | 1px border on tinted panels |

Text on `--accent` fills is `--ink-4` ivory, always. The predecessor's
five accent packs (regal/lightning/…) are parked: the pack *machinery*
stays (future per-character color), but the shipped default is this red
and no pack picker ships with the Ledger.

### 2.4 State + side hues

Two overlapping meaning systems share three hues — legible because they
never appear in the same slot:

**Vitality state** (meters, stamina numerals, status words) — thresholds
come from the engine per canon; the design system only maps state → color:

| Token | Value | ≈ hex | Meaning |
|---|---|---|---|
| `--state-good` | `oklch(0.49 0.06 148)` | `#496a4d` | healthy |
| `--state-worn` | `oklch(0.623 0.097 85)` | `#a2823c` | impaired / below-threshold (meter fill + large numerals) |
| `--state-worn-text` | `oklch(0.52 0.09 85)` | `#7d6524` | worn at small text sizes (contrast: the 0.623 gold reads ~3:1 on ivory — fine for meters and ≥18px semibold numerals, not for small text) |
| `--state-dire` | = `--accent` | | critical / dying / danger deltas |
| `--seg-empty` | `oklch(0.82 0.012 88)` | `#c6c2b8` | empty meter segments (= `--line`) |

**Actor side** (log actor labels, roster tinting):

| Token | Value | Meaning |
|---|---|---|
| `--side-hero` | = `--state-good` green | heroes |
| `--side-foe` | = `--accent` brick | adversaries |
| `--side-director` | = `--state-worn-text` gold | Director / system voice |

These re-point the existing `--hero` / `--foe` / `--hp-good` /
`--hp-warn` / `--hp-bad` names. The predecessor's condition / rank /
positional palettes were tuned for the dark ramp and **must be re-tuned to
paper before any surface using them ships** (darken toward L≈0.45–0.55,
keep hues) — filed as follow-up work, not specced here.

---

## 3 · Typography

Three roles, unchanged as an architecture (`font-display` / `font-body` /
`font-mono` + `.type-label`, swap point in `tokens.css`, `type-audit`
enforced). The faces behind them change:

| Role | Face (new) | Replaces | Weights |
|---|---|---|---|
| display | **Playfair Display** (roman + italic) | Cormorant Garamond | 500 / 600 / 700 + italics |
| body | **Barlow Semi Condensed** | EB Garamond | 400 / 500 / 600 |
| label | **Geist Mono** (kept) | — | 400 / 500 / 600 |

All three are OFL and ship as `@fontsource` packages from our origin
(§9). Playfair Display is the mockups' didone exactly; the mockup body is
a DIN-style semi-condensed grotesque for which Barlow Semi Condensed is
the match (fallback if it proves too tight in long prose: plain Barlow —
a one-line token swap either way). The mockup mono is near enough to
Geist Mono that we keep the already-vendored face.

### 3.1 The three voices

- **Engraved label** (`.type-label`: mono + uppercase + tracked) — the
  instrument's stampings: section names, actor labels, column heads,
  status words, metadata, button text. Tracking widens as size shrinks:
  `0.08em` at 12px+, up to `0.14em` at 10px. This is the *most used*
  voice in the chrome and the least used in content.
- **Editorial display** (Playfair) — the human voice: proper names,
  ability names, ceremonial numerals, and *asides*. **Italic is the
  aside**: statblock masthead names, ability names, round numerals,
  Director's notes, input placeholders, awaiting messages ("*the Ogre
  Bannerman is declaring…*"). **Roman** is the nameplate: roster names,
  card initials, page titles. Never uppercase the display face; never
  track it.
- **Plain body** (Barlow SC) — data prose: log lines, ability effect
  text, descriptions, form values. Neutral, dense, never decorated.

The predecessor's `h1–h3 { uppercase }` experiment **ends** — headings
render display roman in title case (the mockups' "The Standing Field").
Uppercase belongs to the label voice only.

### 3.2 The numeral hierarchy

Numbers are the app's payload; the mockups give each class of number its
own voice. This mapping is binding:

| Numeral class | Voice | Example slots |
|---|---|---|
| Data-in-columns: stamina fractions, deltas, timestamps, counts, IDs | mono 500–600, `tabular`, state-colored | `27 / 40` on cards, `+9` / `−6` log deltas, `022:14`, `4 OF 11 ACTED` |
| Big scoreboard stats | body (Barlow) 600, 28–36px, ink | statblock grid values |
| Ceremonial numerals | display *italic*, large | round numerals (roman: *Round III*), resource pools (*5 / 8*) |

Rules: fractions render `current / max` with spaces around the slash;
deltas always carry their sign; every changing column gets `.tabular`.

### 3.3 The rotated rail

Region names live on a 28–32px recessed rail (`--ink-1`) at the region's
left edge: `.type-label` at 10–11px, `--text-dim`, reading **bottom-to-
top** (`writing-mode: vertical-rl; transform: rotate(180deg)`, or
`sideways-lr` where supported). Use for: roster sections, the party
dock, order-of-battle rail. One rail per region — never nest them, and
never rotate anything but the label voice.

### 3.4 Scale

4px-grid, sizes as utilities (no new token machinery needed):

| Slot | Spec |
|---|---|
| Micro label / rail | label 10px / tracking 0.14em |
| Standard label | label 11–12px / 500 / tracking 0.08–0.1em |
| Body / log line | body 15–16px / 400 |
| Roster name | display roman 600 / 20px |
| Card name row | initial: display roman 500 / 24px · name: label 13px / 600 |
| Ability name | display italic 600 / 21–22px |
| Statblock masthead | display italic 600 / 34–40px |
| Page title | display roman 600 / 28–32px |
| Scoreboard stat | body 600 / 28–36px `tabular` |
| Ceremonial numeral | display italic 600 / 32–44px |

---

## 4 · Structure: rules, hairlines, and surfaces

The layout grammar is a **press-rule hierarchy** — three line weights
carry all structure:

1. **Press rule** — `2px solid var(--rule)`: separates macro regions
   (header band from field, spine from log, dock from field). A press
   rule is a *cut*, not a border: it spans the full width/height of the
   region seam.
2. **Hairline** — `1px solid var(--line)`: card borders, panel internal
   dividers, stat-grid cells, input borders.
3. **Dotted hairline** — `1px dotted var(--line)`: row separators inside
   lists (roster rows, ability list) and the dotted leader connecting an
   ability name to its cost.

Surfaces stack strictly: **chrome band → field → recessed panel → card**.
Cards are `--ink-4` ivory with a hairline border on the field; recessed
panels (`--ink-1`) hold navigation and rails; chrome holds identity and
irreversible actions. No shadows, no radius, no gradients.

**Density:** the Ledger is a dense instrument. Compression comes from
small labels and hairlines — paddings stay on the 4px grid (cards 12–16px,
list rows 10–12px vertical) and hit targets stay ≥44px (§9).

---

## 5 · Components

Specs are geometry + tokens; all game-facing strings and values come from
the engine.

### 5.1 Header band (app chrome)

Chrome surface, full-width, press rule below. Left → right: brand
(display italic, ivory) + context label (label voice, `--text-dim`) ·
session metadata (label voice) · right-aligned **round badge**: an
`--accent` block (square, ~56px tall) with the round numeral in display
italic ivory, flanked by the phase in label voice. The badge is the one
saturated object in the chrome — the eye's anchor.

### 5.2 Tab band

Recessed `--ink-1` band directly under the header. Tabs are label voice
13px; **active tab = chrome block** (black bg, ivory text) — the tab
band is paper with black cut-ins, inverting the header. Counts render as
`--text-dim` suffixes. Hit area ≥44px tall.

### 5.3 Turn spine (order of battle)

A single-row strip of equal cells between press rules. Each cell: index
(label voice 10px, `--text-mute`) above name (display roman 600).
States: **active** = `--accent` bg + ivory text; **acted** =
`--text-mute` name on field; **upcoming** = ink on field. Cells divide
by hairlines. The strip owns a header line: `ORDER OF BATTLE` label left,
progress count (mono tabular) right, on `--ink-1`.

### 5.4 Figure card

Ivory card (`--ink-4`, hairline border) used in docks and grids:

- **Turn-state bar** — a 4px vertical bar flush to the card's left edge,
  `--state-worn` gold: **present while the figure has not yet acted this
  round, absent once it has acted.** This is load-bearing semantics from
  the mockups, not decoration: a dock scans as "who's still to come" by
  gold bars alone.
- Name row: sigil (§6) or display-roman initial + name in label voice.
- Stamina fraction: mono 600 18–20px, colored by vitality state.
- Segment meter (§5.5) at the card foot.

### 5.5 Meters

Two variants, both discrete — the Ledger never draws a continuous bar:

- **Segment meter**: a fixed count of equal rectangles (default 10) with
  2px gaps, ~8–10px tall. Fill = quantized `current / max`; filled
  segments take the vitality-state color (all filled segments share one
  color — the *state's* color, not a gradient), empty = `--seg-empty`.
  Never one-segment-per-stamina-point.
- **Tick meter**: the dense-row variant — ~12 vertical ticks (2px wide,
  10px tall, 2px gaps). Same fill/color rules.

### 5.6 Roster table

Full-width rows on the field, dotted-hairline separated. Columns: sigil ·
name (display roman 600 20px) · descriptor (label voice, `--text-dim`) ·
tick meter · fraction (mono, state-colored) · status word (label voice).
Selected row = `--accent-tint` bg with a 2px `--accent` left cut. Acted
rows drop to `--text-mute` throughout. Section headers ("ADVERSARIES —
6 ENTRIES") are label voice on `--ink-1` strips with a trailing hairline
leader.

### 5.7 Statblock panel

- **Masthead**: chrome surface. Kicker label (`STATBLOCK`, `--text-dim`),
  name in display italic ivory 34–40px, meta row in label voice.
- **Stat grid**: field surface, 3-per-row cells split by hairlines; each
  cell = label (11px, `--text-dim`) over value (body 600, 28–32px).
- **Ability list**: ivory; each entry = display-italic name + **dotted
  leader** + cost in mono 600 `--accent`, then effect text in body voice.
  Dotted hairlines between entries.
- **Note**: recessed `--ink-1` panel, hairline border; kicker label +
  note in body italic (or display italic ≥16px) `--text-dim`.

### 5.8 Round log

Three-column grid: timestamp (mono, `--text-mute`) · entry · delta.
Entry = actor in label voice colored by **side** (`--side-hero` /
`--side-foe` / `--side-director`) over one body line. Delta = signed
mono right-aligned, colored by effect direction (`--state-good` gain /
`--accent` loss / `--text-mute` none). Entries separate by whitespace
only — no rules inside the log. Header strip: `ROUND LOG` label + full-
width hairline leader + `LIVE` status label.

### 5.9 Awaiting / warning banner

`--accent-tint` bg, 1px `--accent-tint-line` border. Kicker label in
`--accent` + message in display italic `--accent-deep` ("*the Ogre
Bannerman is declaring…*"). This is also the shape for **permissive-
engine warnings** — warn-never-block surfaces reuse this banner grammar
so a warning always reads as an aside, not an error wall.

### 5.10 Inputs

Ivory bg, 1px `--line` border, ink text, generous padding (12×16px),
**`font-size` ≥16px always** (§9). Placeholder = display italic
`--text-mute` at the same size. Focus = border color shifts to `--rule`
black (2px inset via `box-shadow: inset 0 0 0 1px` to avoid layout
shift); no glow, no radius. Labels above in label voice.

### 5.11 Buttons

Rectangular blocks, label voice 12–13px / 600, min-height 44px,
padding 16–24px horizontal:

| Kind | Recipe | Use |
|---|---|---|
| Chrome | `--rule` black bg, ivory text | structural commits: end round / end turn |
| Accent | `--accent` bg, ivory text | the attention action: apply damage, confirm |
| Quiet | transparent, 1px `--line` border, ink text | secondary: hold, cancel |

Hover/active: chrome & accent lighten one step (`--ink-3` chrome-scope /
`--accent-strong`); quiet fills `--ink-1`. Focus-visible: 2px `--rule`
outline, 2px offset. Disabled: `--text-mute` text, `--line-soft` border,
no fill.

### 5.12 Resource pool

Ceremonial slot (e.g. the Director's pool): kicker label + fraction in
display italic 600 32–44px `--accent`, on a recessed panel above a press
rule.

---

## 6 · Sigils — the figure classification marks

The mockups classify adversaries with small geometric marks (diamond-eye,
crosshair, four-point star, solid triangle, diamond cluster). Specced as
a **sigil system**:

- **Geometry**: each sigil is built from constrained primitives — square,
  diamond, triangle, circle, four-point star, and clusters/outlines
  thereof — on a 16×16 grid, 45°/90° construction only, single color
  (current text color). Filled and stroked variants both allowed; stroke
  weight 1.5px.
- **Rendering**: inline SVG via one shared `<Sigil kind={…}>` component
  with a registry file mapping classification → mark. Never emoji, never
  per-callsite SVGs.
- **Assignment**: sigils key off the **engine's** figure classification.
  The mockup's assignments are filler; the real mapping table is filed
  with the registry when the classification vocabulary is wired, and each
  mark's meaning is documented there (one mark per classification,
  never reused).
- **Boundary**: sigils are our own visual invention for classification.
  Official Draw Steel iconography (tier bands, keyword/range/action
  icons) still renders via the Draw Steel Glyphs font per
  `design-guide.md` — sigils never stand in for a concept the glyph font
  covers.
- Heroes use their display-roman **initial** in the sigil slot (the
  mockups' `K` / `S` / `O`); sigils are for non-hero figures.

---

## 7 · Semantic color rules (summary)

- Brick red = **attention**: current/active, primary commit, cost,
  danger, warning. If two red things are visible in one region, one of
  them is wrong.
- Green/gold/red on a *number or meter* = vitality state, engine-fed.
- Green/brick/gold on an *actor label* = side (hero / foe / director).
- Everything else is ink on paper. No decorative color, no per-entity
  rainbow, no hue-coded categories without a filed token + rationale.
- Small-text gold uses `--state-worn-text`; the brighter `--state-worn`
  is meters and large numerals only (contrast, §2.4).

---

## 8 · Interaction & motion

- **Touch-first** rules from `design-guide.md` apply unchanged: ≥44px
  targets, no hover-only affordances, iPad-landscape sweet spot.
- Hover/press/focus stay CSS transitions (`--motion-fast`). Motion (the
  npm `motion` library, per DEC-0017) owns enter/exit, layout and
  shared-element moves — e.g. a figure card expanding to the statblock
  panel via `layoutId`. Animate transform/opacity only; respect
  `prefers-reduced-motion`.
- State changes announce typographically: numbers tick (mono, tabular —
  no layout shift), meters re-quantize (`--motion-stamina`), the acting
  figure carries the accent block (the dark-era glow `acting-pulse`
  retires — on paper, attention is a solid red cut, not a halo).

---

## 9 · House rules (binding)

1. **No externally hosted assets.** Every font ships from our origin as
   `@fontsource` imports bundled by Vite — no Google Fonts CDN, no
   `<link>` to any third-party host, ever. The Ledger's load:
   - `@fontsource/playfair-display` — 500, 600, 700, 500-italic,
     600-italic, 700-italic
   - `@fontsource/barlow-semi-condensed` — 400, 500, 600
   - `@fontsource/geist-mono` — 400, 500, 600 (already vendored)
   All OFL-licensed. Same rule for icons (inline SVG / vendored glyph
   font) and any imagery.
2. **iOS zoom guard.** Every `<input>`, `<textarea>`, and `<select>`
   carries `text-base` (16px) or larger **explicitly** — iOS Safari zooms
   the page when a focused input is under 16px and never zooms back.
   Don't rely on inheritance; a parent `text-sm` silently reintroduces
   the bug. (Already binding in `design-guide.md`; restated because this
   system's dense label voice makes small text the ambient default.)

---

## 10 · Implementation map

The retheme is a token retune + face swap on the existing architecture —
component code keeps its utilities. Ordered:

1. **Fonts**: swap `@fontsource` imports in `apps/web/src/styles.css`;
   re-point `--font-display` / `--font-body` in `tokens.css`. Remove the
   `h1–h3` uppercase experiment (§3.1).
2. **Tokens**: re-point the paper ramp as the *default* surface (§2.1),
   add the chrome scope (§2.2), accent block (§2.3), state/side block
   (§2.4), `--rule`. Body bg moves to `--ink-2`. The
   `presentation` surface kind retires — paper *is* the default; `chrome`
   is the marked scope. (Grep for `data-surface`/`<Surface` usages when
   flipping.)
3. **Primitives**: `<Surface kind="chrome">`, `<RailLabel>` (rotated),
   `<SegmentMeter>` / `<TickMeter>`, `<Sigil>` + registry, button kinds,
   input recipe.
4. **Re-tune deferred palettes** (conditions / ranks / positional) to
   paper before any surface that uses them ships (§2.4).
5. **Audits**: `type-audit` keeps enforcing role handles; extend the
   input-size check if not already mechanical.

Open questions to settle with real content on screen: Barlow SC vs plain
Barlow for long prose (§3); segment-meter default count (10 assumed);
whether chrome-surface density needs an `--ink-5` step.
