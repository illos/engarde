import type { HeroProjection, OverlayKey, Pillar } from './hero-document.js';

/**
 * The choice-point overlay for the FURY vertical (ROAD-0007 step 3) —
 * definition data, not hero data (02-normative-schema.md §3.4): one row per
 * choice point, keyed to the pinned corpus by scc (R-L; discriminator slugs
 * are the scc-join artifact's, frozen at first seed —
 * .artifacts/canon/character-builder/scc-join.json).
 *
 * PROVENANCE: every option list, cardinality, grant and label below is
 * seeded from the pinned SteelCompendium snapshot (DEC-0008) and cites its
 * pin record. Forge Steel ids appear only as `fsIds` labels (DEC-0014 — FS
 * ids are labels, never keys). The corpus-gated test
 * hero-overlay-fury.corpus.test.ts re-derives the pools from the live pin
 * and fails on drift, so none of these rows can silently diverge from the
 * books.
 *
 * Level scope: LEVEL 1 choice points only (the Fury L1 wizard). Levels
 * 2–10 rows land with the level-up vertical.
 */

export type OverlayGrant = {
  kind: 'skill' | 'ability' | 'feature' | 'resource';
  scc: string;
  label: string;
};

export type OverlayOption = {
  /** The stored selection value: an scc, or a join-minted option key for
   * options without standalone pin records (§5 kind 3). */
  key: string;
  label: string;
  /** Pin record backing the option's display card, when one exists. */
  recordScc?: string;
  /** R-A grants that reach the hero when this option is chosen. */
  grants?: OverlayGrant[];
};

export type OptionSource =
  /** Resolved option list, seeded from the pin. */
  | { kind: 'options'; options: OverlayOption[] }
  /** Explicit gap (Q5/R-J discipline): the wizard renders this as an
   * unresolved gap — NEVER an empty drawer presented as a completed step. */
  | { kind: 'unresolvable'; reason: string };

export type ChoicePointRow = {
  key: OverlayKey;
  label: string;
  kind:
    | 'set-pillar'
    | 'characteristic-assignment'
    | 'pick-n-of-pool'
    | 'pick-1-embedded'
    | 'fixed-grant';
  /** Present on pillar-shaped rows: which pillar the decision sets. */
  pillar?: Pillar;
  /** Picks required (0 for fixed-grant/display rows). */
  cardinality: number;
  /** From PIN prose, never FS fields (00-foundation.md §6b import rule 2). */
  changeableAt: 'build' | 'respite' | 'play';
  optionSource: OptionSource;
  /** R-A fixed grants attached to this row (compiled, never stored). */
  grants: OverlayGrant[];
  /** Forge Steel labels this row joined from — never keys (R-L). */
  fsIds: string[];
  level: number;
  /** Row is reachable only when the named pillar holds one of `equals`. */
  reachableWhen?: { pillar: Pillar; equals: string[] };
  /** Pin path(s) grounding this row — the evidence trail. */
  evidence: string[];
  /** Characteristic-assignment scaffolding (kind 5): printed verbatim in
   * the class record's Basics. */
  characteristicArrays?: {
    primaries: readonly ['might', 'agility'];
    primaryValue: number;
    /** Values for the OTHER three characteristics (reason/intuition/
     * presence in any permutation). */
    arrays: readonly (readonly [number, number, number])[];
  };
};

export const FURY_CLASS_SCC = 'mcdm.heroes.v1/class/fury';
export const FEROCITY_SCC = 'mcdm.heroes.v1/feature.fury.level-1/ferocity';
export const PRIMORDIAL_ASPECT_SCC = 'mcdm.heroes.v1/feature.fury.level-1/primordial-aspect';

/** Join-minted aspect option keys (`<scc>#<disc>`): the aspects have no
 * standalone pin records — they are options printed inside
 * feature/fury/level-1/primordial-aspect.md. */
export const ASPECT_BERSERKER = `${PRIMORDIAL_ASPECT_SCC}#berserker`;
export const ASPECT_REAVER = `${PRIMORDIAL_ASPECT_SCC}#reaver`;
export const ASPECT_STORMWIGHT = `${PRIMORDIAL_ASPECT_SCC}#stormwight`;

const skill = (group: 'exploration' | 'intrigue', slug: string, label: string): OverlayOption => ({
  key: `mcdm.heroes.v1/skill.${group}/${slug}`,
  label,
  recordScc: `mcdm.heroes.v1/skill.${group}/${slug}`,
});

/** en/books/heroes/md/skill/exploration/ — the complete exploration skill
 * group (10 records). */
const EXPLORATION_SKILLS: OverlayOption[] = [
  skill('exploration', 'climb', 'Climb'),
  skill('exploration', 'drive', 'Drive'),
  skill('exploration', 'endurance', 'Endurance'),
  skill('exploration', 'gymnastics', 'Gymnastics'),
  skill('exploration', 'heal', 'Heal'),
  skill('exploration', 'jump', 'Jump'),
  skill('exploration', 'lift', 'Lift'),
  skill('exploration', 'navigate', 'Navigate'),
  skill('exploration', 'ride', 'Ride'),
  skill('exploration', 'swim', 'Swim'),
];

/** en/books/heroes/md/skill/intrigue/ — the complete intrigue skill group
 * (12 records). */
const INTRIGUE_SKILLS: OverlayOption[] = [
  skill('intrigue', 'alertness', 'Alertness'),
  skill('intrigue', 'conceal-object', 'Conceal Object'),
  skill('intrigue', 'disguise', 'Disguise'),
  skill('intrigue', 'eavesdrop', 'Eavesdrop'),
  skill('intrigue', 'escape-artist', 'Escape Artist'),
  skill('intrigue', 'hide', 'Hide'),
  skill('intrigue', 'pick-lock', 'Pick Lock'),
  skill('intrigue', 'pick-pocket', 'Pick Pocket'),
  skill('intrigue', 'sabotage', 'Sabotage'),
  skill('intrigue', 'search', 'Search'),
  skill('intrigue', 'sneak', 'Sneak'),
  skill('intrigue', 'track', 'Track'),
];

const furyAbility = (slug: string, label: string): OverlayOption => ({
  key: `mcdm.heroes.v1/feature.ability.fury.level-1/${slug}`,
  label,
  recordScc: `mcdm.heroes.v1/feature.ability.fury.level-1/${slug}`,
});

/** feature/ability/fury/level-1/ records with frontmatter
 * `subtype: signature` (4 of 15). */
const SIGNATURE_ABILITIES: OverlayOption[] = [
  furyAbility('brutal-slam', 'Brutal Slam'),
  furyAbility('hit-and-run', 'Hit and Run'),
  furyAbility('impaled', 'Impaled!'),
  furyAbility('to-the-death', 'To the Death!'),
];

/** feature/ability/fury/level-1/ records with frontmatter
 * `cost: 3 Ferocity` (4 of 15). */
const THREE_FEROCITY_ABILITIES: OverlayOption[] = [
  furyAbility('back', 'Back!'),
  furyAbility('out-of-the-way', 'Out of the Way!'),
  furyAbility('tide-of-death', 'Tide of Death'),
  furyAbility('your-entrails-are-your-extrails', 'Your Entrails Are Your Extrails!'),
];

/** feature/ability/fury/level-1/ records with frontmatter
 * `cost: 5 Ferocity` (4 of 15). */
const FIVE_FEROCITY_ABILITIES: OverlayOption[] = [
  furyAbility('blood-for-blood', 'Blood for Blood!'),
  furyAbility('make-peace-with-your-god', 'Make Peace With Your God!'),
  furyAbility('thunder-roar', 'Thunder Roar'),
  furyAbility('to-the-uttermost-end', 'To the Uttermost End'),
];

const kitOption = (slug: string, label: string): OverlayOption => ({
  key: `mcdm.heroes.v1/kit/${slug}`,
  label,
  recordScc: `mcdm.heroes.v1/kit/${slug}`,
});

/** The 21 standard kits, exactly the rows of the Kits Table
 * (en/books/heroes/md/chapter/kits.md §Kits A to Z). The four stormwight
 * kits are deliberately absent from that table — they belong to Beast
 * Shape's pool below. */
export const STANDARD_KITS: OverlayOption[] = [
  kitOption('arcane-archer', 'Arcane Archer'),
  kitOption('battlemind', 'Battlemind'),
  kitOption('cloak-and-dagger', 'Cloak and Dagger'),
  kitOption('dual-wielder', 'Dual Wielder'),
  kitOption('guisarmier', 'Guisarmier'),
  kitOption('martial-artist', 'Martial Artist'),
  kitOption('mountain', 'Mountain'),
  kitOption('panther', 'Panther'),
  kitOption('pugilist', 'Pugilist'),
  kitOption('raider', 'Raider'),
  kitOption('ranger', 'Ranger'),
  kitOption('rapid-fire', 'Rapid-Fire'),
  kitOption('retiarius', 'Retiarius'),
  kitOption('shining-armor', 'Shining Armor'),
  kitOption('sniper', 'Sniper'),
  kitOption('spellsword', 'Spellsword'),
  kitOption('stick-and-robe', 'Stick and Robe'),
  kitOption('swashbuckler', 'Swashbuckler'),
  kitOption('sword-and-board', 'Sword and Board'),
  kitOption('warrior-priest', 'Warrior Priest'),
  kitOption('whirlwind', 'Whirlwind'),
];

/** The four stormwight kits (Beast Shape: "You can use and gain the
 * benefits of a stormwight kit" — feature/fury/level-1/beast-shape.md;
 * records kit/boren|corven|raden|vuken.md). */
export const STORMWIGHT_KITS: OverlayOption[] = [
  kitOption('boren', 'Boren'),
  kitOption('corven', 'Corven'),
  kitOption('raden', 'Raden'),
  kitOption('vuken', 'Vuken'),
];

const ANY_ASPECT = [ASPECT_BERSERKER, ASPECT_REAVER, ASPECT_STORMWIGHT];

/**
 * The Fury L1 overlay. Row order is the wizard's presentation order.
 */
export const FURY_L1_OVERLAY: ChoicePointRow[] = [
  {
    // The class pillar. Only Fury is seeded (the vertical); the wizard
    // renders the missing rest of the class list as an explicit gap.
    key: FURY_CLASS_SCC,
    label: 'Class',
    kind: 'set-pillar',
    pillar: 'class',
    cardinality: 1,
    changeableAt: 'build',
    optionSource: {
      kind: 'options',
      options: [{ key: FURY_CLASS_SCC, label: 'Fury', recordScc: FURY_CLASS_SCC }],
    },
    grants: [
      {
        kind: 'resource',
        scc: FEROCITY_SCC,
        label: 'Ferocity',
      },
      {
        kind: 'feature',
        scc: 'mcdm.heroes.v1/feature.fury.level-1/mighty-leaps',
        label: 'Mighty Leaps',
      },
      {
        kind: 'feature',
        scc: 'mcdm.heroes.v1/feature.fury.level-1/growing-ferocity',
        label: 'Growing Ferocity',
      },
    ],
    fsIds: ['class-fury'],
    level: 1,
    evidence: [
      'en/books/heroes/md/class/fury.md (Fury Advancement Table, 1st: Primordial Aspect, Ferocity, Growing Ferocity, Aspect Features, Aspect Triggered Action, Mighty Leaps, Fury Abilities)',
    ],
  },
  {
    key: `${FURY_CLASS_SCC}#characteristics`,
    label: 'Starting characteristics',
    kind: 'characteristic-assignment',
    cardinality: 1,
    changeableAt: 'build',
    optionSource: { kind: 'options', options: [] },
    grants: [],
    fsIds: [],
    level: 1,
    reachableWhen: { pillar: 'class', equals: [FURY_CLASS_SCC] },
    evidence: [
      'en/books/heroes/md/class/fury.md §Basics: "You start with a Might of 2 and an Agility of 2, and you can choose one of the following arrays for your other characteristic scores: 2, −1, −1 / 1, 1, −1 / 1, 0, 0"',
    ],
    characteristicArrays: {
      primaries: ['might', 'agility'],
      primaryValue: 2,
      arrays: [
        [2, -1, -1],
        [1, 1, -1],
        [1, 0, 0],
      ],
    },
  },
  {
    key: PRIMORDIAL_ASPECT_SCC,
    label: 'Primordial Aspect',
    kind: 'set-pillar',
    pillar: 'subclass',
    cardinality: 1,
    changeableAt: 'build',
    optionSource: {
      kind: 'options',
      options: [
        {
          key: ASPECT_BERSERKER,
          label: 'Berserker',
          recordScc: PRIMORDIAL_ASPECT_SCC,
          grants: [
            // "Berserker: … You have the Lift skill." (primordial-aspect.md)
            { kind: 'skill', scc: 'mcdm.heroes.v1/skill.exploration/lift', label: 'Lift' },
            // Aspect Triggered Actions table (aspect-triggered-action.md).
            {
              kind: 'ability',
              scc: 'mcdm.heroes.v1/feature.ability.fury.level-1/lines-of-force',
              label: 'Lines of Force',
            },
            // 1st-Level Aspect Features table (1st-level-aspect-features.md):
            // Berserker → Kit, Primordial Strength.
            {
              kind: 'feature',
              scc: 'mcdm.heroes.v1/feature.fury.level-1/primordial-strength',
              label: 'Primordial Strength',
            },
          ],
        },
        {
          key: ASPECT_REAVER,
          label: 'Reaver',
          recordScc: PRIMORDIAL_ASPECT_SCC,
          grants: [
            { kind: 'skill', scc: 'mcdm.heroes.v1/skill.intrigue/hide', label: 'Hide' },
            {
              kind: 'ability',
              scc: 'mcdm.heroes.v1/feature.ability.fury.level-1/unearthly-reflexes',
              label: 'Unearthly Reflexes',
            },
            {
              kind: 'feature',
              scc: 'mcdm.heroes.v1/feature.fury.level-1/primordial-cunning',
              label: 'Primordial Cunning',
            },
          ],
        },
        {
          key: ASPECT_STORMWIGHT,
          label: 'Stormwight',
          recordScc: PRIMORDIAL_ASPECT_SCC,
          grants: [
            { kind: 'skill', scc: 'mcdm.heroes.v1/skill.intrigue/track', label: 'Track' },
            {
              kind: 'ability',
              scc: 'mcdm.heroes.v1/feature.ability.fury.level-1/furious-change',
              label: 'Furious Change',
            },
            {
              kind: 'feature',
              scc: 'mcdm.heroes.v1/feature.fury.level-1/relentless-hunter',
              label: 'Relentless Hunter',
            },
          ],
        },
      ],
    },
    grants: [],
    fsIds: ['fury-sub-1', 'fury-sub-2', 'fury-sub-3'],
    level: 1,
    reachableWhen: { pillar: 'class', equals: [FURY_CLASS_SCC] },
    evidence: [
      'en/books/heroes/md/feature/fury/level-1/primordial-aspect.md ("You choose a primordial aspect from the following options, each of which grants you a skill"; "Your primordial aspect is your subclass")',
      'en/books/heroes/md/feature/fury/level-1/aspect-triggered-action.md (Aspect Triggered Actions table)',
      'en/books/heroes/md/feature/fury/level-1/1st-level-aspect-features.md (1st-Level Aspect Features table)',
    ],
  },
  {
    // "You gain the Nature skill" — an R-A fixed grant, not a choice.
    // Forge Steel models it as a pre-satisfied SkillChoice (fury-1-1,
    // selected: ['Nature']); the pin phrases it as a grant, so it stores
    // nothing per hero and renders display-only.
    key: `${FURY_CLASS_SCC}#skills`,
    label: 'Granted skill',
    kind: 'fixed-grant',
    cardinality: 0,
    changeableAt: 'build',
    optionSource: { kind: 'options', options: [] },
    grants: [{ kind: 'skill', scc: 'mcdm.heroes.v1/skill.lore/nature', label: 'Nature' }],
    fsIds: ['fury-1-1'],
    level: 1,
    reachableWhen: { pillar: 'class', equals: [FURY_CLASS_SCC] },
    evidence: ['en/books/heroes/md/class/fury.md §Basics Skills: "You gain the Nature skill"'],
  },
  {
    key: `${FURY_CLASS_SCC}#skills-2`,
    label: 'Skills — choose two (exploration or intrigue)',
    kind: 'pick-n-of-pool',
    cardinality: 2,
    changeableAt: 'build',
    optionSource: { kind: 'options', options: [...EXPLORATION_SKILLS, ...INTRIGUE_SKILLS] },
    grants: [],
    fsIds: ['fury-1-2'],
    level: 1,
    reachableWhen: { pillar: 'class', equals: [FURY_CLASS_SCC] },
    evidence: [
      'en/books/heroes/md/class/fury.md §Basics Skills: "Then choose any two skills from the exploration or intrigue skill groups."',
      'en/books/heroes/md/skill/exploration/ + en/books/heroes/md/skill/intrigue/ (the two complete groups)',
    ],
  },
  {
    key: 'mcdm.heroes.v1/feature.fury.level-1/fury-abilities#signature-ability',
    label: 'Signature Ability',
    kind: 'pick-1-embedded',
    cardinality: 1,
    changeableAt: 'build',
    optionSource: { kind: 'options', options: SIGNATURE_ABILITIES },
    grants: [],
    fsIds: ['fury-1-5'],
    level: 1,
    reachableWhen: { pillar: 'class', equals: [FURY_CLASS_SCC] },
    evidence: [
      'en/books/heroes/md/feature/fury/level-1/fury-abilities.md §Signature Ability: "Choose one signature ability from the following options."',
      'feature/ability/fury/level-1/{brutal-slam,hit-and-run,impaled,to-the-death}.md (frontmatter subtype: signature)',
    ],
  },
  {
    key: 'mcdm.heroes.v1/feature.fury.level-1/fury-abilities#3pt-ability',
    label: '3-Ferocity Ability',
    kind: 'pick-1-embedded',
    cardinality: 1,
    changeableAt: 'build',
    optionSource: { kind: 'options', options: THREE_FEROCITY_ABILITIES },
    grants: [],
    fsIds: ['fury-1-6'],
    level: 1,
    reachableWhen: { pillar: 'class', equals: [FURY_CLASS_SCC] },
    evidence: [
      'en/books/heroes/md/feature/fury/level-1/fury-abilities.md §3-Ferocity Ability: "Choose one heroic ability from the following options, each of which costs 3 ferocity to use."',
      'feature/ability/fury/level-1/{back,out-of-the-way,tide-of-death,your-entrails-are-your-extrails}.md (frontmatter cost: 3 Ferocity)',
    ],
  },
  {
    key: 'mcdm.heroes.v1/feature.fury.level-1/fury-abilities#5pt-ability',
    label: '5-Ferocity Ability',
    kind: 'pick-1-embedded',
    cardinality: 1,
    changeableAt: 'build',
    optionSource: { kind: 'options', options: FIVE_FEROCITY_ABILITIES },
    grants: [],
    fsIds: ['fury-1-7'],
    level: 1,
    reachableWhen: { pillar: 'class', equals: [FURY_CLASS_SCC] },
    evidence: [
      'en/books/heroes/md/feature/fury/level-1/fury-abilities.md §5-Ferocity Ability: "Choose one heroic ability from the following options, each of which costs 5 ferocity to use."',
      'feature/ability/fury/level-1/{blood-for-blood,make-peace-with-your-god,thunder-roar,to-the-uttermost-end}.md (frontmatter cost: 5 Ferocity)',
    ],
  },
  {
    // Berserker/Reaver kit ("Kit" on the 1st-Level Aspect Features table):
    // "You can use and gain the benefits of a kit." Kit choice is
    // respite-mutable by PIN prose (import rule 2), not by FS type
    // special-casing.
    key: 'mcdm.heroes.v1/feature.fury.level-1/kit',
    label: 'Kit',
    kind: 'pick-n-of-pool',
    cardinality: 1,
    changeableAt: 'respite',
    optionSource: { kind: 'options', options: STANDARD_KITS },
    grants: [],
    fsIds: ['fury-sub-1-1-2', 'fury-sub-2-1-2'],
    level: 1,
    reachableWhen: { pillar: 'subclass', equals: [ASPECT_BERSERKER, ASPECT_REAVER] },
    evidence: [
      'en/books/heroes/md/feature/fury/level-1/kit.md: "You can use and gain the benefits of a kit."',
      'en/books/heroes/md/chapter/kits.md §Changing Your Kit: "If you want to change your kit, you can do so as a respite activity."',
      'en/books/heroes/md/chapter/kits.md §Kits A to Z (Kits Table — the 21 standard kits)',
    ],
  },
  {
    key: 'mcdm.heroes.v1/feature.fury.level-1/beast-shape',
    label: 'Beast Shape — stormwight kit',
    kind: 'pick-n-of-pool',
    cardinality: 1,
    changeableAt: 'respite',
    optionSource: { kind: 'options', options: STORMWIGHT_KITS },
    grants: [
      {
        kind: 'ability',
        scc: 'mcdm.heroes.v1/feature.fury.stormwight-kits/aspect-of-the-wild',
        label: 'Aspect of the Wild',
      },
    ],
    fsIds: ['fury-sub-3-1-2'],
    level: 1,
    reachableWhen: { pillar: 'subclass', equals: [ASPECT_STORMWIGHT] },
    evidence: [
      'en/books/heroes/md/feature/fury/level-1/beast-shape.md: "You can use and gain the benefits of a stormwight kit (see Stormwight Kits)."',
      'en/books/heroes/md/chapter/kits.md §Changing Your Kit (respite activity)',
      'en/books/heroes/md/kit/{boren,corven,raden,vuken}.md',
    ],
  },
  // ── The other pillars: explicit gaps, never silently-complete steps ────
  ...(['ancestry', 'culture', 'career', 'complication'] as const).map(
    (pillar): ChoicePointRow => ({
      key: `gap:${pillar}`,
      label: pillar.charAt(0).toUpperCase() + pillar.slice(1),
      kind: 'set-pillar',
      pillar,
      cardinality: 1,
      changeableAt: 'build',
      optionSource: {
        kind: 'unresolvable',
        reason:
          pillar === 'culture'
            ? 'No overlay seeded — the culture composite (and its language choice, blocked on the R-J content gap: languages have no pin records) ships with a later vertical.'
            : 'No overlay seeded — the Fury vertical ships the class pillar only. This step is an open gap, not a completed one.',
      },
      grants: [],
      fsIds: [],
      level: 1,
      evidence: ['docs/character-builder/02-normative-schema.md §8-Q5 (explicit gap rendering)'],
    }),
  ),
];

/** True when the row is reachable under the current projection (level +
 * upstream pillar gates). Unreachable rows never count as satisfied OR as
 * unanswered — they simply are not part of the reachable choice set. */
export function isRowReachable(row: ChoicePointRow, projection: HeroProjection): boolean {
  if (row.level > projection.level) return false;
  if (!row.reachableWhen) return true;
  const value = projection.pillars[row.reachableWhen.pillar];
  return value !== undefined && row.reachableWhen.equals.includes(value);
}

export type UnansweredKey = {
  key: OverlayKey;
  label: string;
  /** 'gap' rows are unresolvable — they render as explicit gaps rather
   * than answerable steps. */
  status: 'unanswered' | 'gap';
};

/**
 * Completeness is a DERIVED judgment (§2.3c): walk the reachable choice
 * points and report unanswered keys. Nothing blocks persistence — a
 * partially-built document is a first-class valid state.
 */
export function unansweredKeys(
  projection: HeroProjection,
  overlay: readonly ChoicePointRow[] = FURY_L1_OVERLAY,
): UnansweredKey[] {
  const results: UnansweredKey[] = [];
  for (const row of overlay) {
    if (!isRowReachable(row, projection)) continue;
    if (row.optionSource.kind === 'unresolvable') {
      results.push({ key: row.key, label: row.label, status: 'gap' });
      continue;
    }
    if (row.kind === 'fixed-grant') continue;
    if (row.kind === 'set-pillar') {
      if (row.pillar !== undefined && projection.pillars[row.pillar] === undefined)
        results.push({ key: row.key, label: row.label, status: 'unanswered' });
      continue;
    }
    if (row.kind === 'characteristic-assignment') {
      if (projection.characteristics === null)
        results.push({ key: row.key, label: row.label, status: 'unanswered' });
      continue;
    }
    const selection = projection.selections[row.key];
    const picked = selection?.kind === 'pick' ? selection.selected.length : 0;
    if (picked < row.cardinality)
      results.push({ key: row.key, label: row.label, status: 'unanswered' });
  }
  return results;
}

/** The option keys the projection currently holds for a row (pillar value
 * for set-pillar rows; pick payload for pool rows). */
export function chosenOptionKeys(row: ChoicePointRow, projection: HeroProjection): string[] {
  if (row.kind === 'set-pillar' && row.pillar !== undefined) {
    const value = projection.pillars[row.pillar];
    return value === undefined ? [] : [value];
  }
  const selection = projection.selections[row.key];
  return selection?.kind === 'pick' ? selection.selected : [];
}
