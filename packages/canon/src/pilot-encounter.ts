import {
  type Intent,
  type Transcript,
  createDriver,
  createSeededRandomSource,
} from '@engarde/engine';
import { tierOutcomeToIntents } from './effect-conformance.js';
import { auditGrammarConservation, parseEffectText } from './effect-grammar.js';
import { type PairedSource, ingestStructuredRecord } from './extract.js';

/**
 * The pilot's scripted mini-encounter (engine-plan §Pilot step 7): real
 * corpus actors exchanging their real abilities, driven through the harness
 * with the invariant suite as oracle, producing the transcript pilot step 8
 * reviews against canon.
 *
 * Every condition application is compiled from the grammar's parse of the
 * ability's verbatim text (channel 1), never scripted by hand. Saves,
 * removals, and the encounter end are play actions. Damage and potency
 * remain explicit unexecuted backlog items, mirrored into the summary.
 *
 * Known-unknown surfaced by this script: toxic-plants triggers on area
 * membership ("starts their turn in the area"), which the spatial-fact
 * vocabulary (adjacent / line-of-effect) cannot yet assert — recorded in
 * the summary for the step-9 judgment, not silently skipped.
 */

const ABILITIES = {
  bloodForBlood: 'en/books/heroes/md/feature/ability/fury/level-1/blood-for-blood.md',
  sentenced: 'en/books/heroes/md/feature/ability/censor/level-2/sentenced.md',
  toxicPlants: 'en/books/monsters/md/dynamic-terrain/environmental-hazards/toxic-plants.md',
} as const;

const ACTORS = {
  fury: 'mcdm.heroes.v1/class/fury',
  censor: 'mcdm.heroes.v1/class/censor',
  plants: 'mcdm.monsters.v1/dynamic-terrain.environmental-hazards/toxic-plants',
} as const;

export interface PilotEncounterRun {
  transcript: Transcript;
  summary: {
    abilitiesUsed: Array<{ artifactId: string; tier: string; conditionIds: string[] }>;
    unexecuted: Array<{ artifactId: string; part: string; detail: string }>;
    knownUnknowns: string[];
  };
}

export async function runPilotEncounter(
  loadPaired: (markdownPath: string) => Promise<PairedSource>,
): Promise<PilotEncounterRun> {
  const parsedTiers = new Map<string, Map<string, NonNullable<ReturnType<typeof pickTier>>>>();

  function pickTier(clauses: ReturnType<typeof parseEffectText>['clauses'], band: string) {
    for (const clause of clauses) {
      if (clause.kind === 'tier-outcome' && clause.data.band === band) return clause.data;
    }
    return null;
  }

  const artifactIds = new Map<string, string>();
  for (const [name, path] of Object.entries(ABILITIES)) {
    const paired = await loadPaired(path);
    const bundle = ingestStructuredRecord(paired);
    const artifact = bundle.records.find((record) => record.recordKind === 'artifact');
    if (!artifact || artifact.recordKind !== 'artifact') throw new Error(`no artifact in ${path}`);
    const parse = parseEffectText(artifact.text);
    const problems = auditGrammarConservation(artifact.text, parse);
    if (problems.length > 0) throw new Error(`${path}: ${problems.join('; ')}`);
    artifactIds.set(name, artifact.id);
    const byBand = new Map<string, NonNullable<ReturnType<typeof pickTier>>>();
    for (const band of ['≤11', '12-16', '17+']) {
      const tier = pickTier(parse.clauses, band);
      if (tier) byBand.set(band, tier);
    }
    parsedTiers.set(name, byBand);
  }

  const driver = createDriver(
    [
      { id: 'fury', sourceRecordId: ACTORS.fury },
      { id: 'censor', sourceRecordId: ACTORS.censor },
      { id: 'toxic-plants', sourceRecordId: ACTORS.plants },
    ],
    { random: createSeededRandomSource(0x5eed) },
  );

  const summary: PilotEncounterRun['summary'] = {
    abilitiesUsed: [],
    unexecuted: [],
    knownUnknowns: [
      // Declared by RULE CLASS, not instance (step-8 lesson: the reviewer
      // caught instance-scoped declarations under-covering their class).
      'derived condition effects are not modeled: none of the applied conditions' +
        " impose their canon side effects (bleeding's Stamina loss on actions," +
        " weakened's bane, restrained's speed 0 / edge granted / forced-move" +
        ' immunity, dazed action restrictions) — pending the effect grammar +' +
        ' derived-effect mechanism',
      'imposing-effect riders are not carried on condition instances (sentenced' +
        " forced-movement override, sleep-spores' prone rider) — pending grammar" +
        ' residue mechanisms',
      'spatial facts are not asserted for ability use: melee distance/targeting' +
        ' on strikes and area membership for hazard triggers (the vocabulary' +
        ' also lacks an area-membership fact)',
      'action economy is not modeled: action/maneuver budgets, canonical' +
        ' prohibitions (e.g. dazed forbidding free maneuvers), and the' +
        ' free-maneuver cost and timing of ending an imposed effect',
      'the end-of-encounter keep choice canonically belongs to the hero' +
        ' suffering the effect; the intent protocol does not yet attribute' +
        ' keeps per hero (the Director dispatches the sweep)',
    ],
  };

  function useAbility(
    name: keyof typeof ABILITIES,
    band: string,
    actorId: string,
    targetId: string,
    prefix: string,
  ): void {
    const tier = parsedTiers.get(name)?.get(band);
    if (!tier) throw new Error(`${name} has no parsed tier ${band}`);
    const artifactId = artifactIds.get(name) ?? name;
    const { intents, unexecuted } = tierOutcomeToIntents(tier, {
      intentIdPrefix: prefix,
      actorParticipantId: actorId,
      targetParticipantId: targetId,
      effectArtifactId: artifactId,
    });
    summary.abilitiesUsed.push({ artifactId, tier: band, conditionIds: tier.conditionIds });
    summary.unexecuted.push(
      ...unexecuted.map((item) => ({ artifactId, part: item.part, detail: item.detail })),
    );
    for (const intent of intents) {
      const { violations } = driver.dispatch(intent);
      if (violations.length > 0) throw new Error(`invariant violation at ${intent.intentId}`);
    }
  }

  // Round 1: the fury strikes the censor; the censor answers; the plants
  // catch the fury. Then both heroes take their end-of-turn saves.
  useAbility('bloodForBlood', '17+', 'fury', 'censor', 'bfb');
  useAbility('sentenced', '≤11', 'censor', 'fury', 'snt');
  useAbility('toxicPlants', '12-16', 'toxic-plants', 'fury', 'tox');

  const bleedingId = 'mcdm.heroes.v1/condition/bleeding#bfb-0';
  const weakenedId = 'mcdm.heroes.v1/condition/weakened#bfb-1';
  const restrainedId = 'mcdm.heroes.v1/condition/restrained#snt-0';
  const dazedId = 'mcdm.heroes.v1/condition/dazed#tox-0';

  const play: Intent[] = [
    // Fury's end of turn: shakes off restrained (asserted 6), stays dazed
    // (asserted 3) — manual rolls override the injected source.
    {
      intentId: 'turn-fury-1',
      kind: 'end-turn',
      actor: { kind: 'participant', participantId: 'fury' },
      payload: { participantId: 'fury', rolls: { [restrainedId]: 6, [dazedId]: 3 } },
    },
    // Censor's end of turn: fails against bleeding (2), saves off weakened (7).
    {
      intentId: 'turn-censor-1',
      kind: 'end-turn',
      actor: { kind: 'participant', participantId: 'censor' },
      payload: { participantId: 'censor', rolls: { [bleedingId]: 2, [weakenedId]: 7 } },
    },
    // The fury ends their own remaining imposed effect (classes#creature-
    // ends-an-ability-effect; free-maneuver cost noted as a known-unknown).
    {
      intentId: 'release-1',
      kind: 'remove-condition',
      actor: { kind: 'participant', participantId: 'fury' },
      payload: {
        target: 'censor',
        instanceId: bleedingId,
        reason: 'imposer ends their ability effect',
      },
    },
    // Encounter ends; the fury explicitly keeps dazed (hero opt-in keep per
    // classes#ending-effects).
    {
      intentId: 'end-1',
      kind: 'end-encounter',
      actor: { kind: 'director' },
      payload: { keepInstanceIds: [dazedId] },
    },
  ];
  for (const intent of play) {
    const { violations } = driver.dispatch(intent);
    if (violations.length > 0) throw new Error(`invariant violation at ${intent.intentId}`);
  }

  return { transcript: driver.transcript(), summary };
}
