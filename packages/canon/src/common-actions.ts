import {
  type ActionCost,
  type CommonActionAlternative,
  type CommonActionComposition,
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
  /**
   * The printed branches of the action, in source order.
   *
   * Two printed forms exist and both are proved against the bytes:
   * `printedClause: null` means the branch is a whole "Alternatively, …"
   * SENTENCE and the compiler extracts it by marker (Stand Up, Ride);
   * a string means the branch is a CLAUSE inside a longer sentence and the
   * directory declares it verbatim (Heal's "or can make a saving
   * throw…"), which the compiler proves is a printed substring — the same
   * declare-and-prove shape `perRoundCapSubjects` and
   * `composition.substitute` already use.
   *
   * `targetAction` records a branch that has a NAMED TARGET take a named
   * action at a named cost; the compiler proves both the action's printed
   * name and the cost phrase against the branch's bytes. `resolution`
   * records a branch that resolves DIFFERENTLY from the action's primary
   * one (Heal's two halves); null keeps the action's own.
   */
  alternatives: ReadonlyArray<{
    key: string;
    printedClause?: string;
    targetAction: { artifactId: string; actionCost: ActionCost; printedName: string } | null;
    resolution?: EffectResolution;
  }>;
  /** The printed child-ability composition, when the text names one. Both
   * halves are proved against the artifact's bytes: the phrase that names
   * the child, and the sentence granting a keyword substitute. */
  composition: CommonActionComposition | null;
  /** Executable behaviour, when the printed text has some; null → the
   * verbatim table-directive disposition. */
  resolution: EffectResolution | null;
  /** The printed action moves the actor, so recorded terrain facts are
   * named in its directive [R-0022]. Quotes in the comments below. */
  movesActor: boolean;
}

const ID = 'mcdm.heroes.v1/feature.common';
const SAVING_THROW_RULE = 'mcdm.heroes.v1/rule.general/saving-throw';
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
    alternatives: [],
    // "then make a melee free strike … against a target when they end
    // their move. If the creature has an ability with the Charge keyword,
    // they can use that ability against the target instead of a free
    // strike." The named child is the MELEE weapon free strike — the text
    // prints "melee", so the ranged companion is not admitted here.
    composition: {
      namedArtifactId: `${ABILITY}/melee-weapon-free-strike`,
      namedPhrase: 'make a melee free strike',
      substitute: {
        keyword: 'Charge',
        sourceText:
          'If the creature has an ability with the Charge keyword, they can use that ability against the target instead of a free strike.',
      },
    },
    resolution: null,
    movesActor: true,
  },
  {
    featureArtifactId: `${ID}.main-actions/defend`,
    group: 'main-actions',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternatives: [],
    composition: null,
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
    alternatives: [],
    composition: null,
    resolution: null,
    movesActor: false,
  },
  {
    // "The target creature can spend a Recovery to regain Stamina, or can
    // make a saving throw against one effect they are suffering that is
    // ended by a saving throw." — ONE printed main action, TWO branches
    // that resolve differently. The Recovery half is the shipped
    // `spend-recovery` resolution (a declinable per-participant offer);
    // nothing about the amount is stated here, because `spendRecovery`
    // owns recovery value [rule.health/recoveries]. The saving-throw half
    // is a printed BRANCH carrying its own resolution.
    //
    // The branch is declared as a CLAUSE, not extracted by the
    // "Alternatively" marker, because the book prints both halves inside
    // one sentence joined by ", or".
    featureArtifactId: `${ID}.main-actions/heal`,
    group: 'main-actions',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternatives: [
      {
        key: 'saving-throw',
        printedClause:
          'or can make a saving throw against one effect they are suffering that is ended by a saving throw.',
        targetAction: null,
        resolution: { kind: 'saving-throw' },
      },
    ],
    composition: null,
    resolution: {
      kind: 'spend-recovery',
      subjectText: 'The target creature',
      singular: true,
    },
    movesActor: false,
  },
  // ── maneuvers ───────────────────────────────────────────────────────
  {
    featureArtifactId: `${ID}.maneuvers/aid-attack`,
    group: 'maneuvers',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternatives: [],
    composition: null,
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
    alternatives: [],
    composition: null,
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
    alternatives: [],
    composition: null,
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
    alternatives: [],
    composition: null,
    resolution: null,
    movesActor: false,
  },
  {
    featureArtifactId: `${ID}.maneuvers/hide`,
    group: 'maneuvers',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternatives: [],
    composition: null,
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
    alternatives: [],
    composition: null,
    resolution: null,
    movesActor: false,
  },
  {
    featureArtifactId: `${ID}.maneuvers/make-or-assist-a-test`,
    group: 'maneuvers',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternatives: [],
    composition: null,
    resolution: null,
    movesActor: false,
  },
  {
    featureArtifactId: `${ID}.maneuvers/search-for-hidden-creatures`,
    group: 'maneuvers',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternatives: [],
    composition: null,
    resolution: null,
    movesActor: false,
  },
  {
    // "A creature can use the Stand Up maneuver to stand up if they are
    // prone, ENDING THAT CONDITION." — the printed clause names the
    // condition; which INSTANCE ends is dispatch-supplied [S12].
    featureArtifactId: `${ID}.maneuvers/stand-up`,
    group: 'maneuvers',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    // "Alternatively, they can use this maneuver to make a willing
    // adjacent prone creature stand up." — one maneuver, the actor's;
    // nothing is charged to the ally, so no targetAction.
    alternatives: [{ key: 'ally-stands-up', targetAction: null }],
    composition: null,
    resolution: { kind: 'end-condition', conditionId: 'mcdm.heroes.v1/condition/prone' },
    movesActor: false,
  },
  {
    featureArtifactId: `${ID}.maneuvers/use-consumable`,
    group: 'maneuvers',
    debitContract: 'self',
    companionArtifactIds: [],
    perRoundCapSubjects: [],
    alternatives: [],
    composition: null,
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
    alternatives: [],
    composition: null,
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
    alternatives: [],
    composition: null,
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
    // action." — the printed phrase overrides Disengage's own header cost
    // for this use, and the cost is the MOUNT's, not the rider's.
    alternatives: [
      {
        key: 'mount-disengages',
        targetAction: {
          artifactId: `${ID}.move-actions/disengage`,
          actionCost: 'free-triggered-action',
          printedName: 'Disengage',
        },
      },
    ],
    composition: null,
    resolution: null,
    movesActor: true,
  },
];

const DIRECTORY_BY_ID = new Map(
  COMMON_ACTION_DIRECTORY.map((entry) => [entry.featureArtifactId, entry]),
);

/**
 * The printed phrase each closed action cost is written as in running
 * prose. Used to prove a directory-declared alternative cost against the
 * sentence that carries it — never to guess one.
 */
const ACTION_COST_PRINTED_PHRASE: Readonly<Record<ActionCost, string>> = {
  'main-action': 'main action',
  maneuver: 'maneuver',
  'move-action': 'move action',
  'triggered-action': 'triggered action',
  'free-triggered-action': 'free triggered action',
  'free-maneuver': 'free maneuver',
  'no-action': 'no action',
  'villain-action': 'villain action',
};

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

  // Two printed branch forms, both proved against the bytes: whole
  // "Alternatively, …" SENTENCES are extracted by marker and matched to the
  // directory's marker-declared branches in order; a branch that is a
  // CLAUSE inside a longer sentence (Heal prints its two halves in one
  // sentence, joined by ", or") is declared verbatim and proved as a
  // printed substring. Declaring a clause is NOT a loophole around the
  // marker: it is the same declare-and-prove shape the per-round caps and
  // the composition substitute already use, and a pin bump that rewords the
  // clause breaks just as loudly.
  const alternativeSentences = sentences.filter((sentence) => ALTERNATIVELY.test(sentence));
  const markerDeclared = entry.alternatives.filter(
    (declared) => declared.printedClause === undefined,
  );
  if (alternativeSentences.length !== markerDeclared.length) {
    fail(
      artifactId,
      `printed "Alternatively" sentences (${alternativeSentences.length}) do not match the ${markerDeclared.length} marker branches keyed in the directory`,
    );
  }
  let markerIndex = 0;
  const alternatives: CommonActionAlternative[] = entry.alternatives.map((declared) => {
    let sourceText: string;
    if (declared.printedClause === undefined) {
      const extracted = alternativeSentences[markerIndex];
      markerIndex += 1;
      if (extracted === undefined) {
        fail(artifactId, `alternative ${JSON.stringify(declared.key)} has no printed sentence`);
      }
      sourceText = extracted;
    } else {
      if (!stripped.includes(declared.printedClause)) {
        fail(
          artifactId,
          `alternative ${JSON.stringify(declared.key)} declares the clause ${JSON.stringify(declared.printedClause)}, which the artifact does not print`,
        );
      }
      sourceText = declared.printedClause;
    }
    const targetAction = declared.targetAction;
    if (targetAction !== null) {
      // Both halves of the reading are proved against the sentence's own
      // bytes: the action it names, and the cost phrase that overrides
      // that action's printed header for this use.
      const costPhrase = ACTION_COST_PRINTED_PHRASE[targetAction.actionCost];
      if (!sourceText.includes(targetAction.printedName)) {
        fail(
          artifactId,
          `alternative ${JSON.stringify(declared.key)} names ${targetAction.printedName}, which its printed sentence does not`,
        );
      }
      if (!sourceText.toLowerCase().includes(costPhrase)) {
        fail(
          artifactId,
          `alternative ${JSON.stringify(declared.key)} claims a ${targetAction.actionCost} cost, which its printed sentence never prints ("${costPhrase}")`,
        );
      }
    }
    return {
      key: declared.key,
      sourceText,
      targetAction:
        targetAction === null
          ? null
          : { artifactId: targetAction.artifactId, actionCost: targetAction.actionCost },
      resolution: declared.resolution ?? null,
    };
  });

  // A composition's two readings are proved against the artifact's bytes:
  // the phrase naming the child, and the sentence granting a substitute.
  if (entry.composition !== null) {
    if (!stripped.includes(entry.composition.namedPhrase)) {
      fail(
        artifactId,
        `composition names its child by ${JSON.stringify(entry.composition.namedPhrase)}, which the artifact does not print`,
      );
    }
    const substitute = entry.composition.substitute;
    if (substitute !== null) {
      if (!sentences.includes(substitute.sourceText)) {
        fail(
          artifactId,
          `composition substitute sentence ${JSON.stringify(substitute.sourceText)} is not a printed sentence of the artifact`,
        );
      }
      if (!substitute.sourceText.includes(substitute.keyword)) {
        fail(
          artifactId,
          `composition substitute claims the ${substitute.keyword} keyword, which its own printed sentence never names`,
        );
      }
    }
  }

  // Every declared resolution is proved against the bytes — the action's
  // own AND any a printed branch carries, or a branch's reading would ship
  // unproved simply because it is not the primary one.
  const refs = canonRefsIn(text);
  const declaredResolutions: ReadonlyArray<{ where: string; resolution: EffectResolution }> = [
    ...(entry.resolution === null ? [] : [{ where: 'resolution', resolution: entry.resolution }]),
    ...entry.alternatives.flatMap((declared) =>
      declared.resolution === undefined
        ? []
        : [
            {
              where: `alternative ${JSON.stringify(declared.key)}`,
              resolution: declared.resolution,
            },
          ],
    ),
  ];
  for (const { where, resolution } of declaredResolutions) {
    // A verbatim subject phrase must be printed text, not a paraphrase.
    if ('subjectText' in resolution && !stripped.includes(resolution.subjectText)) {
      fail(
        artifactId,
        `${where} subjectText ${JSON.stringify(resolution.subjectText)} is not printed in the artifact`,
      );
    }
    // A condition-ending resolution names a condition [S12]. The name is not
    // a classification — the artifact LINKS the condition it ends — so it is
    // proved against the artifact's own scc links through the one scanner,
    // and a pin bump that relinks the clause breaks loudly.
    if (resolution.kind === 'end-condition' && !refs.includes(resolution.conditionId)) {
      fail(artifactId, `${where} ends ${resolution.conditionId}, which the artifact never links`);
    }
    // Likewise a saving-throw resolution: the artifact must LINK the rule
    // it sends the target to [S10].
    if (resolution.kind === 'saving-throw' && !refs.includes(SAVING_THROW_RULE)) {
      fail(artifactId, `${where} makes a saving throw, which the artifact never links`);
    }
  }

  return CommonActionProgramDataSchema.parse({
    featureArtifactId: artifactId,
    provenance: 'prose-feature',
    group: entry.group,
    sourceSpan: { byteStart: 0, byteEnd: Buffer.byteLength(text, 'utf8') },
    sourceText: text,
    canonRefs: refs,
    defaultActionCost: GROUP_DEFAULT_COST[entry.group],
    perRoundCaps,
    alternatives,
    composition: entry.composition,
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
