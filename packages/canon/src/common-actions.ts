import {
  type ActionCost,
  type CommonActionAlternative,
  type CommonActionGroup,
  type CommonActionPerRoundCap,
  type CommonActionProgramData,
  CommonActionProgramDataSchema,
  type EffectResolution,
} from '@engarde/engine';
import { ONCE_PER_ROUND } from './action-cost.js';
import { canonRefsIn, stripSccLinks } from './effect-grammar.js';

/**
 * Prose-feature program source [common-actions design §2, S2] — the 17
 * headerless `feature.common.*` artifacts compiled to a dispatchable
 * envelope.
 *
 * These artifacts are NOT ability records: no header table, no
 * `**Effect:**` line, no power roll. `normalizeActionCostValue` therefore
 * has nothing to normalize, and the compiled envelope carries a
 * `provenance: 'prose-feature'` discriminator so a receipt can never label
 * one as an Effect program.
 *
 * The shape of this module is deliberate: everything mechanically derivable
 * from the printed bytes IS derived here (canon refs, the once-per-round
 * cap sentences, the printed alternatives, the byte span), and the handful
 * of readings that are classifications rather than extractions — which
 * subject a cap binds to, which action hands its printed cost to a
 * companion ability — live as DATA ROWS in the directory below, each
 * carrying the verbatim sentence it was read from. The compiler then proves
 * every declared sentence against the artifact's actual bytes, so a pin
 * bump that changes one word breaks loudly instead of silently keeping a
 * stale classification.
 */

/** The book's own directory heading → the default action cost. The
 * grouping is the only printed cost source these artifacts have; each
 * action's own text repeats it ("takes the Advance **move action**",
 * "uses the Catch Breath **maneuver**"), which the compiler verifies. */
const GROUP_DEFAULT_COST: Readonly<Record<CommonActionGroup, ActionCost>> = {
  'main-actions': 'main-action',
  maneuvers: 'maneuver',
  'move-actions': 'move-action',
};

/** The printed phrase each group's own sentences use, for the verification
 * pass above (lowercased; the artifact prints it in running prose). */
const GROUP_PRINTED_PHRASE: Readonly<Record<CommonActionGroup, string>> = {
  'main-actions': 'main action',
  maneuvers: 'maneuver',
  'move-actions': 'move action',
};

export interface CommonActionDirectoryEntry {
  featureArtifactId: string;
  group: CommonActionGroup;
  /** Who pays the printed cost — `companion` when the artifact's own text
   * hands the action off to a compiled companion ability that prints the
   * same cost. Required on the envelope, never a per-arm convention: an
   * arm that assumed `self` would charge the actor twice. */
  debitContract: 'self' | 'companion';
  companionArtifactIds: readonly string[];
  /** One entry per printed once-per-round sentence, in source order. The
   * compiler matches these against the sentences it extracts. */
  perRoundCapSubjects: ReadonlyArray<{ subject: 'actor' | 'target'; sourceText: string }>;
  /** One key per printed "Alternatively, …" sentence, in source order. */
  alternativeKeys: readonly string[];
  /** Executable behaviour, when the printed text has some; null → the
   * verbatim table-directive disposition. */
  resolution: EffectResolution | null;
  /** The printed action moves the actor, so recorded terrain facts are
   * named in its directive [R-0022]. Quotes in the comments below. */
  movesActor: boolean;
}

const ID = 'mcdm.heroes.v1/feature.common';
const ABILITY = 'mcdm.heroes.v1/feature.ability.common';

/**
 * The 17, in book order within each group. Every non-default row carries
 * the printed sentence that justifies it.
 */
export const COMMON_ACTION_DIRECTORY: readonly CommonActionDirectoryEntry[] = [
  // ── main actions ────────────────────────────────────────────────────
  {
    // "they move up to their speed in a straight line, then make a melee
    // free strike … against a target when they end their move."
    featureArtifactId: `${ID}.main-actions/charge`,
    group: 'main-actions',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternativeKeys: [],
    resolution: null,
    movesActor: true,
  },
  {
    featureArtifactId: `${ID}.main-actions/defend`,
    group: 'main-actions',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternativeKeys: [],
    resolution: null,
    movesActor: false,
  },
  {
    // "A creature can use this main action to make a free strike" — and
    // BOTH compiled companions print `Main action` in their own header
    // cell. One printed cost, two carriers: the prose arm must not debit
    // or the striker pays two main actions.
    featureArtifactId: `${ID}.main-actions/free-strike`,
    group: 'main-actions',
    debitContract: 'companion',
    companionArtifactIds: [
      `${ABILITY}/melee-weapon-free-strike`,
      `${ABILITY}/ranged-weapon-free-strike`,
    ],
    perRoundCapSubjects: [],
    alternativeKeys: [],
    resolution: null,
    movesActor: false,
  },
  {
    featureArtifactId: `${ID}.main-actions/heal`,
    group: 'main-actions',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternativeKeys: [],
    resolution: null,
    movesActor: false,
  },
  // ── maneuvers ───────────────────────────────────────────────────────
  {
    featureArtifactId: `${ID}.maneuvers/aid-attack`,
    group: 'maneuvers',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternativeKeys: [],
    resolution: null,
    movesActor: false,
  },
  {
    // "A creature who uses the Catch Breath maneuver spends a Recovery and
    // regains Stamina equal to their recovery value." — both halves are
    // the shipped `spend-recovery` resolution's one home; nothing about
    // the recovery value is recomputed here.
    featureArtifactId: `${ID}.maneuvers/catch-breath`,
    group: 'maneuvers',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternativeKeys: [],
    resolution: {
      kind: 'spend-recovery',
      subjectText: 'A creature who uses the Catch Breath maneuver',
      singular: true,
    },
    movesActor: false,
  },
  {
    // "can attempt to escape by using the following ability."
    featureArtifactId: `${ID}.maneuvers/escape-grab`,
    group: 'maneuvers',
    debitContract: 'companion',
    companionArtifactIds: [`${ABILITY}/escape-grab`],
    perRoundCapSubjects: [],
    alternativeKeys: [],
    resolution: null,
    movesActor: false,
  },
  {
    // "can attempt to grab a creature using the following ability."
    featureArtifactId: `${ID}.maneuvers/grab`,
    group: 'maneuvers',
    debitContract: 'companion',
    companionArtifactIds: [`${ABILITY}/grab`],
    perRoundCapSubjects: [],
    alternativeKeys: [],
    resolution: null,
    movesActor: false,
  },
  {
    featureArtifactId: `${ID}.maneuvers/hide`,
    group: 'maneuvers',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternativeKeys: [],
    resolution: null,
    movesActor: false,
  },
  {
    // "can attempt to shove that creature using the following ability."
    featureArtifactId: `${ID}.maneuvers/knockback`,
    group: 'maneuvers',
    debitContract: 'companion',
    companionArtifactIds: [`${ABILITY}/knockback`],
    perRoundCapSubjects: [],
    alternativeKeys: [],
    resolution: null,
    movesActor: false,
  },
  {
    featureArtifactId: `${ID}.maneuvers/make-or-assist-a-test`,
    group: 'maneuvers',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternativeKeys: [],
    resolution: null,
    movesActor: false,
  },
  {
    featureArtifactId: `${ID}.maneuvers/search-for-hidden-creatures`,
    group: 'maneuvers',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternativeKeys: [],
    resolution: null,
    movesActor: false,
  },
  {
    featureArtifactId: `${ID}.maneuvers/stand-up`,
    group: 'maneuvers',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    // "Alternatively, they can use this maneuver to make a willing
    // adjacent prone creature stand up."
    alternativeKeys: ['ally-stands-up'],
    resolution: null,
    movesActor: false,
  },
  {
    featureArtifactId: `${ID}.maneuvers/use-consumable`,
    group: 'maneuvers',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternativeKeys: [],
    resolution: null,
    movesActor: false,
  },
  // ── move actions ────────────────────────────────────────────────────
  {
    // "they move a number of squares up to their speed."
    featureArtifactId: `${ID}.move-actions/advance`,
    group: 'move-actions',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternativeKeys: [],
    resolution: null,
    movesActor: true,
  },
  {
    // "they can shift 1 square."
    featureArtifactId: `${ID}.move-actions/disengage`,
    group: 'move-actions',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternativeKeys: [],
    resolution: null,
    movesActor: true,
  },
  {
    // "they cause their mount to move up to the mount's speed, taking the
    // rider with them."
    featureArtifactId: `${ID}.move-actions/ride`,
    group: 'move-actions',
    debitContract: 'self',
    companionArtifactIds: [],
    // Two printed sentences, two DIFFERENT subjects — the rider "can use"
    // it once per round, the mount can only "have this move action applied
    // to them" once per round. Keyed to one counter, a creature that both
    // rides and is ridden in a round warns at the wrong time.
    perRoundCapSubjects: [
      {
        subject: 'actor',
        sourceText: 'A creature can use the Ride move action only once per round.',
      },
      {
        subject: 'target',
        sourceText:
          'A mounted creature can only have this move action applied to them once per round.',
      },
    ],
    // "Alternatively, a creature can use the Ride move action to have
    // their mount use the Disengage move action as a free triggered
    // action."
    alternativeKeys: ['mount-disengages'],
    resolution: null,
    movesActor: true,
  },
];

const DIRECTORY_BY_ID = new Map(
  COMMON_ACTION_DIRECTORY.map((entry) => [entry.featureArtifactId, entry]),
);

/** The printed alternative marker. Closed phrase — the corpus prints
 * exactly two ("Alternatively, …" on Stand Up and Ride). */
const ALTERNATIVELY = /^Alternatively\b/;

/**
 * Split links-stripped prose into printed sentences. Paragraph breaks and
 * sentence-final periods are the only boundaries; nothing is normalized,
 * so each returned string is a verbatim printed sentence.
 */
export function printedSentences(strippedText: string): string[] {
  return strippedText
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.split(/(?<=\.)\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export class CommonActionCompileError extends Error {}

function fail(artifactId: string, detail: string): never {
  throw new CommonActionCompileError(`${artifactId}: ${detail}`);
}

/**
 * Compile one `feature.common.*` prose artifact into its dispatchable
 * envelope. Throws when the pinned bytes and the directory disagree — a pin
 * bump must break loudly, never silently ship a stale classification.
 */
export function compileCommonAction(input: {
  artifactId: string;
  text: string;
}): CommonActionProgramData {
  const { artifactId, text } = input;
  const entry = DIRECTORY_BY_ID.get(artifactId);
  if (!entry) fail(artifactId, 'no common-action directory entry (not one of the printed 17)');

  const stripped = stripSccLinks(text);
  const sentences = printedSentences(stripped);

  // The group directory supplies the cost, and the artifact's own prose
  // corroborates it — 14 of the 17 print their group's cost words in
  // running text. The three that do not (Grab, Escape Grab, Knockback)
  // print no cost at all, because each hands the action off verbatim to a
  // compiled companion ability whose header cell carries it: "can attempt
  // to grab a creature using the following ability." That correspondence
  // is exact, so it is enforced rather than annotated.
  const phrase = GROUP_PRINTED_PHRASE[entry.group];
  if (!stripped.toLowerCase().includes(phrase) && entry.debitContract !== 'companion') {
    fail(artifactId, `text never prints its group's cost words ("${phrase}")`);
  }

  // Once-per-round caps: extracted with the SAME matcher the ability-header
  // path uses, then matched against the directory's subject classification.
  const capSentences = sentences.filter((sentence) => ONCE_PER_ROUND.test(sentence));
  if (capSentences.length !== entry.perRoundCapSubjects.length) {
    fail(
      artifactId,
      `printed once-per-round sentences (${capSentences.length}) do not match the ${entry.perRoundCapSubjects.length} classified in the directory`,
    );
  }
  const perRoundCaps: CommonActionPerRoundCap[] = capSentences.map((sourceText, index) => {
    const declared = entry.perRoundCapSubjects[index];
    if (!declared || declared.sourceText !== sourceText) {
      fail(
        artifactId,
        `once-per-round sentence ${index + 1} reads ${JSON.stringify(sourceText)}, the directory classified ${JSON.stringify(declared?.sourceText ?? null)}`,
      );
    }
    // "only once per round" / "once per round" is the closed printed cap
    // family; the number is the phrase's, never inferred from anything else.
    return { subject: declared.subject, uses: 1, sourceText };
  });

  const alternativeSentences = sentences.filter((sentence) => ALTERNATIVELY.test(sentence));
  if (alternativeSentences.length !== entry.alternativeKeys.length) {
    fail(
      artifactId,
      `printed alternatives (${alternativeSentences.length}) do not match the ${entry.alternativeKeys.length} keyed in the directory`,
    );
  }
  const alternatives: CommonActionAlternative[] = alternativeSentences.map((sourceText, index) => {
    const key = entry.alternativeKeys[index];
    if (key === undefined)
      fail(artifactId, `printed alternative ${index + 1} has no directory key`);
    return { key, sourceText };
  });

  // A resolution's verbatim subject phrase must be printed text, not a
  // paraphrase of it.
  if (
    entry.resolution !== null &&
    'subjectText' in entry.resolution &&
    !stripped.includes(entry.resolution.subjectText)
  ) {
    fail(
      artifactId,
      `resolution subjectText ${JSON.stringify(entry.resolution.subjectText)} is not printed in the artifact`,
    );
  }

  return CommonActionProgramDataSchema.parse({
    featureArtifactId: artifactId,
    provenance: 'prose-feature',
    group: entry.group,
    sourceSpan: { byteStart: 0, byteEnd: Buffer.byteLength(text, 'utf8') },
    sourceText: text,
    canonRefs: canonRefsIn(text),
    defaultActionCost: GROUP_DEFAULT_COST[entry.group],
    perRoundCaps,
    alternatives,
    debitContract: entry.debitContract,
    companionArtifactIds: [...entry.companionArtifactIds],
    movesActor: entry.movesActor,
    resolution: entry.resolution ?? { kind: 'table' },
  });
}

/** Compile a set of prose artifacts; every id must be one of the 17. */
export function compileCommonActions(
  artifacts: ReadonlyArray<{ artifactId: string; text: string }>,
): CommonActionProgramData[] {
  return artifacts.map((artifact) => compileCommonAction(artifact));
}
