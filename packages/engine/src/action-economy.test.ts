import { describe, expect, it } from 'vitest';
import { type ApplyResult, applyIntent } from './apply-intent.js';
import { createSeededRandomSource } from './determinism.js';
import { initialEncounterState } from './driver.js';
import { checkInvariants } from './invariants.js';
import { hashPayload, sha256Hex } from './payload-hash.js';
import type {
  EncounterState,
  Intent,
  ParticipantStats,
  UseAbilityPayloadInput,
} from './schemas.js';

/**
 * Action economy + two-phase commit (v6, R-0029..R-0033,
 * docs/action-economy-design.md §3) — fires-in-anger dispatch tests: every
 * new intent goes through applyIntent and asserts observable state change;
 * the invariant oracle runs on every dispatch. Fixtures are REAL corpus
 * records quoted verbatim from the accepted pin (prime directive);
 * participant ids and asserted traits mirror printed stat-block text,
 * never invented content.
 */

const DAZED = 'mcdm.heroes.v1/condition/dazed';
const BLEEDING = 'mcdm.heroes.v1/condition/bleeding';

/** Goblin warrior (monsters/md/monster/goblin/statblock/goblin-warrior.md,
 * committed verbatim fixture packages/canon/src/fixtures/goblin-warrior.verbatim.ts):
 * staminaMax 15; M −2, A +2, R 0, I 0, P −1; organization Horde. */
const GOBLIN_WARRIOR_STATS: ParticipantStats = {
  staminaMax: 15,
  characteristics: { might: -2, agility: 2, reason: 0, intuition: 0, presence: -1 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: 'Horde',
  recoveriesMax: null,
  withCaptain: null,
};

/** Skitterling (monsters/md/monster/goblin/statblock/skitterling.md,
 * committed verbatim fixture): staminaMax 3; M −5, A +2, R −4, I 0, P −2;
 * organization Minion. */
const SKITTERLING_STATS: ParticipantStats = {
  staminaMax: 3,
  characteristics: { might: -5, agility: 2, reason: -4, intuition: 0, presence: -2 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: 'Minion',
  recoveriesMax: null,
  withCaptain: null,
};

/** Spear Charge (goblin-warrior, verbatim fixture): "Charge, Melee, Strike,
 * Weapon | Main action; Melee 1; One creature or object; Power Roll + 2;
 * ≤11: 3 damage; 12-16: 4 damage; 17+: 5 damage". */
const SPEAR_CHARGE = {
  abilityArtifactId: 'mcdm.monsters.v1/monster.goblin.statblock/goblin-warrior#spear-charge',
  actionType: 'Main action',
  actionCost: 'main-action' as const,
  keywords: ['Charge', 'Melee', 'Strike', 'Weapon'],
  targetsText: 'One creature or object',
  powerRollBonus: { kind: 'fixed' as const, value: 2 },
  tiers: {
    tier1: {
      damage: { amount: 3, characteristicOptions: [], typeOptions: [] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
    tier2: {
      damage: { amount: 4, characteristicOptions: [], typeOptions: [] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
    tier3: {
      damage: { amount: 5, characteristicOptions: [], typeOptions: [] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
  },
};

/** Skitterling, Claws (verbatim fixture): "Melee, Strike, Weapon | Main
 * action; One creature per minion; Power Roll + 2; ≤11: 1 poison damage;
 * 12-16: 2 poison damage; 17+: 3 poison damage". */
const SKITTERLING_CLAWS = {
  abilityArtifactId: 'mcdm.monsters.v1/monster.goblin.statblock/skitterling#claws',
  actionType: 'Main action',
  actionCost: 'main-action' as const,
  keywords: ['Melee', 'Strike', 'Weapon'],
  targetsText: 'One creature per minion',
  powerRollBonus: { kind: 'fixed' as const, value: 2 },
  tiers: {
    tier1: {
      damage: { amount: 1, characteristicOptions: [], typeOptions: ['poison' as const] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
    tier2: {
      damage: { amount: 2, characteristicOptions: [], typeOptions: ['poison' as const] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
    tier3: {
      damage: { amount: 3, characteristicOptions: [], typeOptions: ['poison' as const] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
  },
};

/** Grab (heroes/md/feature/ability/common/grab.md) — the printed Maneuver
 * cost; its Effect line rides verbatim as a table directive (the common-
 * action stitched model, design §3). */
const GRAB_EFFECT = {
  effectArtifactId: 'mcdm.heroes.v1/feature.ability.common/grab',
  effectOrdinal: 1,
  sourceSpan: { byteStart: 0, byteEnd: 371 },
  sourceText:
    'You can usually target only creatures of your [size](scc.v1:mcdm.heroes.v1/rule.character/size) or smaller. If your [Might](scc.v1:mcdm.heroes.v1/rule.character/might) score is 2 or higher, you can target any creature with a [size](scc.v1:mcdm.heroes.v1/rule.character/size) equal to or less than your [Might](scc.v1:mcdm.heroes.v1/rule.character/might) score.',
  canonRefs: [],
  actionType: 'Maneuver',
  actionCost: 'maneuver' as const,
  targetsText: 'One creature',
  distanceText: 'Melee 1',
  keywords: ['Melee', 'Weapon'],
  resolution: { kind: 'table' as const },
};

/** Charge (heroes/md/feature/common/main-actions/charge.md) — a PROSE
 * common-action feature: the verbatim head rides as a table directive; the
 * main-action cost is its printed grouping (feature.common.main-actions). */
const CHARGE_EFFECT = {
  effectArtifactId: 'mcdm.heroes.v1/feature.common.main-actions/charge',
  effectOrdinal: 1,
  sourceSpan: { byteStart: 1, byteEnd: 640 },
  sourceText:
    'When a creature takes the [Charge](scc.v1:mcdm.heroes.v1/feature.common.main-actions/charge) main action, they move up to their [speed](scc.v1:mcdm.heroes.v1/rule.character/speed) in a straight line, then make a [melee](scc.v1:mcdm.heroes.v1/rule.combat/melee) [free strike](scc.v1:mcdm.heroes.v1/feature.common.main-actions/free-strike) (see [Free Strikes](scc.v1:mcdm.heroes.v1/feature.common.main-actions/free-strike) below) against a target when they end their move. If the creature has an ability with the Charge keyword, they can use that ability against the target instead of a [free strike](scc.v1:mcdm.heroes.v1/feature.common.main-actions/free-strike).',
  canonRefs: [],
  actionType: null,
  actionCost: 'main-action' as const,
  targetsText: null,
  distanceText: null,
  keywords: [],
  resolution: { kind: 'table' as const },
};

/** Keeper of Order (heroes/md/feature/trait/memonek/keeper-of-order.md):
 * "Once per round when you or an adjacent creature makes a power roll, you
 * can use a free triggered action to remove an edge or a bane on the roll
 * …" — the printed CAPPED free triggered action. */
const KEEPER_OF_ORDER = 'mcdm.heroes.v1/feature.trait.memonek/keeper-of-order';

/** Tongue Slap (monsters/md/monster/angulotl/statblock/angulotl-daybringer.md):
 * a printed Triggered action. */
const TONGUE_SLAP = 'mcdm.monsters.v1/monster.angulotl.statblock/angulotl-daybringer#tongue-slap';

/** Vampire lord villain actions (monsters/md/monster/undead/3rd-echelon/
 * statblock/vampire-lord.md): Let Us Feast! (1), Red Mist Rising (2),
 * Sacrifice (3). */
const VAMPIRE = 'mcdm.monsters.v1/monster.undead.3rd-echelon.statblock/vampire-lord';
const LET_US_FEAST = `${VAMPIRE}#let-us-feast`;
const SACRIFICE = `${VAMPIRE}#sacrifice`;

function dispatchChecked(state: EncounterState, intent: Intent, seed = 1): ApplyResult {
  const result = applyIntent(state, intent, { random: createSeededRandomSource(seed) });
  expect(checkInvariants(state, intent, result)).toEqual([]);
  return result;
}

let intentCounter = 0;
function nextId(prefix: string): string {
  intentCounter += 1;
  return `${prefix}-${intentCounter}`;
}

function director(kind: Intent['kind'], payload: unknown): Intent {
  return {
    intentId: nextId(kind),
    kind,
    actor: { kind: 'director' },
    payload,
  } as Intent;
}

function baseEncounter(): EncounterState {
  return initialEncounterState([
    { id: 'hero', kind: 'hero', stats: GOBLIN_WARRIOR_STATS },
    {
      id: 'warrior',
      kind: 'director-creature',
      stats: GOBLIN_WARRIOR_STATS,
      sourceRecordId: 'mcdm.monsters.v1/monster.goblin.statblock/goblin-warrior',
    },
  ]);
}

function beginCombat(state: EncounterState, firstSide: 'heroes' | 'director'): EncounterState {
  return dispatchChecked(state, director('begin-combat', { firstSide, roll: 7 })).state;
}

function spearChargeBy(
  actorId: string,
  targetId: string,
  overrides: Partial<UseAbilityPayloadInput> = {},
): UseAbilityPayloadInput {
  return {
    actorParticipantId: actorId,
    ability: SPEAR_CHARGE,
    targets: [targetId],
    dice: [5, 5],
    ...overrides,
  };
}

function useAbility(actorId: string, payload: UseAbilityPayloadInput): Intent {
  return {
    intentId: nextId('use'),
    kind: 'use-ability',
    actor: { kind: 'participant', participantId: actorId },
    payload,
  };
}

describe('payload hashing (R-0032)', () => {
  it('computes the FIPS 180-4 empty-string vector', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('is canonical: key order never changes the hash', () => {
    expect(hashPayload({ a: 1, b: [{ x: 1, y: 2 }] })).toBe(
      hashPayload({ b: [{ y: 2, x: 1 }], a: 1 }),
    );
  });
});

describe('begin-combat', () => {
  it('initializes the turn structure with the asserted first side', () => {
    const result = dispatchChecked(
      baseEncounter(),
      director('begin-combat', { firstSide: 'heroes', roll: 7 }),
    );
    expect(result.state.turnState).toEqual({
      round: 1,
      firstSide: 'heroes',
      sideToChoose: 'heroes',
      activeTurnId: null,
      lastTurnId: null,
      turnsTaken: {},
    });
    expect(result.log.some((entry) => entry.kind === 'warning')).toBe(false);
  });

  it('warns when the entirely-surprised side is asserted to act first', () => {
    const result = dispatchChecked(
      baseEncounter(),
      director('begin-combat', { firstSide: 'heroes', surprisedSide: 'heroes' }),
    );
    expect(result.state.turnState?.firstSide).toBe('heroes');
    const warning = result.log.find((entry) => entry.kind === 'warning');
    expect(warning?.message).toContain('a creature on the other side gets to act first');
  });

  it('warns on a choice deviating from the rolled assignment', () => {
    const result = dispatchChecked(
      baseEncounter(),
      director('begin-combat', { firstSide: 'director', roll: 7, chosenBy: 'director' }),
    );
    expect(result.state.turnState?.firstSide).toBe('director');
    const warning = result.log.find((entry) => entry.kind === 'warning');
    expect(warning?.message).toContain('the players determine who goes first');
  });
});

describe('start-turn (R-0030: warns, never blocks; never advances the round)', () => {
  it('opens a turn: active id, count, alternation flip', () => {
    const state = beginCombat(baseEncounter(), 'heroes');
    const result = dispatchChecked(state, director('start-turn', { turnId: 'hero' }));
    expect(result.state.turnState?.activeTurnId).toBe('hero');
    expect(result.state.turnState?.turnsTaken.hero).toBe(1);
    expect(result.state.turnState?.sideToChoose).toBe('director');
    expect(result.state.turnState?.round).toBe(1);
  });

  it('acting again after taking a turn warns and applies', () => {
    let state = beginCombat(baseEncounter(), 'heroes');
    state = dispatchChecked(state, director('start-turn', { turnId: 'hero' })).state;
    state = dispatchChecked(state, director('end-turn', { participantId: 'hero' })).state;
    const again = dispatchChecked(state, director('start-turn', { turnId: 'hero' }));
    const warning = again.log.find(
      (entry) =>
        entry.kind === 'warning' &&
        (entry.data.ruleViolation as { kind?: string })?.kind === 'already-acted',
    );
    expect(warning?.message).toContain("can't act again until a new round begins");
    expect(again.state.turnState?.turnsTaken.hero).toBe(2);
  });

  it('a two-turn solo takes both turns without a warn; consecutive turns warn (printed constraint)', () => {
    // Gloom dragon: "**Solo Turns:** The dragon can take two turns each
    // round. They can't take turns consecutively." (monsters/md/monster/
    // dragon/statblock/gloom-dragon.md) — seeded trait data.
    let state = initialEncounterState([
      { id: 'hero', kind: 'hero', stats: GOBLIN_WARRIOR_STATS },
      {
        id: 'gloom',
        kind: 'director-creature',
        sourceRecordId: 'mcdm.monsters.v1/monster.dragon.statblock/gloom-dragon',
        traits: { turnAllowance: 2, noConsecutiveTurns: true },
      },
    ]);
    state = beginCombat(state, 'director');
    state = dispatchChecked(state, director('start-turn', { turnId: 'gloom' })).state;
    state = dispatchChecked(state, director('end-turn', { participantId: 'gloom' })).state;
    state = dispatchChecked(state, director('start-turn', { turnId: 'hero' })).state;
    state = dispatchChecked(state, director('end-turn', { participantId: 'hero' })).state;
    // Second solo turn, non-consecutive: NO warnings of any kind.
    const second = dispatchChecked(state, director('start-turn', { turnId: 'gloom' }));
    expect(second.log.filter((entry) => entry.kind === 'warning')).toEqual([]);
    expect(second.state.turnState?.turnsTaken.gloom).toBe(2);

    // Fresh run: back-to-back solo turns warn the printed no-consecutive
    // constraint.
    let consecutive = beginCombat(
      initialEncounterState([
        { id: 'hero', kind: 'hero', stats: GOBLIN_WARRIOR_STATS },
        {
          id: 'gloom',
          kind: 'director-creature',
          traits: { turnAllowance: 2, noConsecutiveTurns: true },
        },
      ]),
      'director',
    );
    consecutive = dispatchChecked(consecutive, director('start-turn', { turnId: 'gloom' })).state;
    consecutive = dispatchChecked(
      consecutive,
      director('end-turn', { participantId: 'gloom' }),
    ).state;
    const backToBack = dispatchChecked(consecutive, director('start-turn', { turnId: 'gloom' }));
    const warning = backToBack.log.find(
      (entry) =>
        entry.kind === 'warning' &&
        (entry.data.ruleViolation as { kind?: string })?.kind === 'consecutive-turns',
    );
    expect(warning?.message).toContain("can't take turns consecutively");
    expect(backToBack.state.turnState?.turnsTaken.gloom).toBe(2);
  });
});

describe('use-ability in combat: debit + two-phase resolution (R-0029, R-0032)', () => {
  it('debits the main action, opens a resolution entry, and applies nothing until commit', () => {
    let state = beginCombat(baseEncounter(), 'heroes');
    state = dispatchChecked(state, director('start-turn', { turnId: 'hero' })).state;
    const payload = spearChargeBy('hero', 'warrior');
    const roll = dispatchChecked(state, useAbility('hero', payload));
    expect(roll.state.participants.hero?.actionBudget['main-action']?.used).toBe(1);
    expect(roll.state.resolutionStack).toHaveLength(1);
    const entry = roll.state.resolutionStack[0];
    expect(entry?.phase).toBe('rolled');
    // Damage NOT yet applied.
    expect(roll.state.participants.warrior?.stamina?.current).toBe(15);

    const commit = dispatchChecked(
      roll.state,
      director('commit-resolution', { resolutionId: entry?.resolutionId, payload }),
    );
    // dice [5,5] + 2 = 12 → tier 2 → 4 damage [verbatim Spear Charge].
    expect(commit.state.participants.warrior?.stamina?.current).toBe(11);
    expect(commit.state.resolutionStack[0]?.phase).toBe('committed');
  });

  it('refuses a commit whose re-supplied payload does not hash-match (structural, R-0030)', () => {
    let state = beginCombat(baseEncounter(), 'heroes');
    state = dispatchChecked(state, director('start-turn', { turnId: 'hero' })).state;
    const payload = spearChargeBy('hero', 'warrior');
    const roll = dispatchChecked(state, useAbility('hero', payload));
    const entryId = roll.state.resolutionStack[0]?.resolutionId;
    const tampered = spearChargeBy('hero', 'warrior', { edges: 2 });
    const commit = dispatchChecked(
      roll.state,
      director('commit-resolution', { resolutionId: entryId, payload: tampered }),
    );
    expect(commit.log[0]?.kind).toBe('refusal');
    expect(commit.log[0]?.message).toContain('hash');
    expect(commit.state).toEqual(roll.state);
  });

  it('a recorded downgrade modification applies at commit (modifications in dispatch order)', () => {
    let state = beginCombat(baseEncounter(), 'heroes');
    state = dispatchChecked(state, director('start-turn', { turnId: 'hero' })).state;
    const payload = spearChargeBy('hero', 'warrior');
    const roll = dispatchChecked(state, useAbility('hero', payload));
    const entryId = roll.state.resolutionStack[0]?.resolutionId ?? '';
    const modified = dispatchChecked(
      roll.state,
      director('modify-resolution', {
        resolutionId: entryId,
        modification: { kind: 'downgrade', toTier: 1 },
      }),
    );
    expect(modified.state.resolutionStack[0]?.modifications).toHaveLength(1);
    const commit = dispatchChecked(
      modified.state,
      director('commit-resolution', { resolutionId: entryId, payload }),
    );
    // Downgraded to tier 1 → 3 damage [verbatim Spear Charge ≤11 line].
    expect(commit.state.participants.warrior?.stamina?.current).toBe(12);
  });

  it('a post-commit modification is a warned table correction, not a reopen', () => {
    let state = beginCombat(baseEncounter(), 'heroes');
    state = dispatchChecked(state, director('start-turn', { turnId: 'hero' })).state;
    const payload = spearChargeBy('hero', 'warrior');
    const roll = dispatchChecked(state, useAbility('hero', payload));
    const entryId = roll.state.resolutionStack[0]?.resolutionId ?? '';
    const commit = dispatchChecked(
      roll.state,
      director('commit-resolution', { resolutionId: entryId, payload }),
    );
    const staminaAfter = commit.state.participants.warrior?.stamina?.current;
    const late = dispatchChecked(
      commit.state,
      director('modify-resolution', {
        resolutionId: entryId,
        modification: { kind: 'downgrade', toTier: 1 },
      }),
    );
    expect(late.log.some((entry) => entry.kind === 'warning')).toBe(true);
    expect(late.state.participants.warrior?.stamina?.current).toBe(staminaAfter);
  });
});

describe('dazed and the critical-hit grant (R-0030 escapes)', () => {
  function dazedHero(state: EncounterState): EncounterState {
    return dispatchChecked(
      state,
      director('apply-condition', {
        target: 'hero',
        conditionId: DAZED,
        ending: { kind: 'save-ends' },
        source: { participantId: 'warrior' },
      }),
    ).state;
  }

  it("a dazed actor's second action warns and applies", () => {
    let state = beginCombat(baseEncounter(), 'heroes');
    state = dazedHero(state);
    state = dispatchChecked(state, director('start-turn', { turnId: 'hero' })).state;
    state = dispatchChecked(state, useAbility('hero', spearChargeBy('hero', 'warrior'))).state;
    const second = dispatchChecked(state, useAbility('hero', spearChargeBy('hero', 'warrior')));
    const dazedWarn = second.log.find(
      (entry) =>
        entry.kind === 'warning' &&
        (entry.data.ruleViolation as { kind?: string })?.kind === 'dazed-one-thing',
    );
    expect(dazedWarn?.message).toContain('can do only one thing on their turn');
    // Applied anyway: the second roll opened a second resolution entry.
    expect(second.state.resolutionStack).toHaveLength(2);
    expect(second.state.participants.hero?.actionBudget['main-action']?.used).toBe(2);
  });

  it('crit grants an additional main action consumed SILENTLY off-turn even while dazed', () => {
    let state = beginCombat(baseEncounter(), 'heroes');
    state = dispatchChecked(state, director('start-turn', { turnId: 'hero' })).state;
    // Natural 20 → critical hit ("immediately take an additional main
    // action after resolving the power roll, whether or not it's your turn
    // and even if you are dazed" [rule.combat/critical-hit]).
    const critPayload = spearChargeBy('hero', 'warrior', { dice: [10, 10] });
    const crit = dispatchChecked(state, useAbility('hero', critPayload));
    const grant = crit.state.participants.hero?.grants.find(
      (candidate) => candidate.kind === 'action',
    );
    expect(grant).toMatchObject({
      kind: 'action',
      cost: 'main-action',
      escapes: { ignoresDazed: true, offTurn: true },
    });
    let next = dispatchChecked(
      crit.state,
      director('commit-resolution', {
        resolutionId: crit.state.resolutionStack[0]?.resolutionId,
        payload: critPayload,
      }),
    ).state;
    next = dispatchChecked(next, director('end-turn', { participantId: 'hero' })).state;
    next = dispatchChecked(next, director('start-turn', { turnId: 'warrior' })).state;
    next = dazedHero(next);
    // Off-turn, dazed, budget spent — and yet: the printed escape consumes
    // the grant with NO warning.
    const offTurn = dispatchChecked(next, useAbility('hero', spearChargeBy('hero', 'warrior')));
    expect(offTurn.log.filter((entry) => entry.kind === 'warning')).toEqual([]);
    expect(
      offTurn.state.participants.hero?.grants.filter((candidate) => candidate.kind === 'action'),
    ).toEqual([]);
    expect(offTurn.state.resolutionStack.filter((entry) => entry.phase === 'rolled')).toHaveLength(
      1,
    );
  });
});

describe('triggered actions (R-0030; rule.combat/triggered-action)', () => {
  it('one per round: the second warns and applies; free bypasses the counter but caps still warn', () => {
    let state = beginCombat(baseEncounter(), 'heroes');
    state = dispatchChecked(state, director('start-turn', { turnId: 'hero' })).state;
    const first = dispatchChecked(
      state,
      director('use-triggered-action', {
        participantId: 'warrior',
        abilityArtifactId: TONGUE_SLAP,
        trigger: { kind: 'asserted', text: 'the hero strikes the daybringer (table-asserted)' },
      }),
    );
    expect(first.state.participants.warrior?.triggeredThisRound).toBe(1);
    expect(first.log.filter((entry) => entry.kind === 'warning')).toEqual([]);

    const second = dispatchChecked(
      first.state,
      director('use-triggered-action', {
        participantId: 'warrior',
        abilityArtifactId: TONGUE_SLAP,
        trigger: { kind: 'asserted', text: 'a second strike (table-asserted)' },
      }),
    );
    const limitWarn = second.log.find(
      (entry) =>
        entry.kind === 'warning' &&
        (entry.data.ruleViolation as { kind?: string })?.kind === 'triggered-limit',
    );
    expect(limitWarn?.message).toContain('one triggered action per round');
    expect(second.state.participants.warrior?.triggeredThisRound).toBe(2);

    // Free triggered action: "doesn't count against your limit of one
    // triggered action per round" — but Keeper of Order's printed "Once per
    // round" cap warns on the second use.
    const freeOnce = dispatchChecked(
      second.state,
      director('use-triggered-action', {
        participantId: 'hero',
        abilityArtifactId: KEEPER_OF_ORDER,
        free: true,
        perRoundCap: 1,
      }),
    );
    expect(freeOnce.state.participants.hero?.triggeredThisRound).toBe(0);
    expect(freeOnce.log.filter((entry) => entry.kind === 'warning')).toEqual([]);
    const freeTwice = dispatchChecked(
      freeOnce.state,
      director('use-triggered-action', {
        participantId: 'hero',
        abilityArtifactId: KEEPER_OF_ORDER,
        free: true,
        perRoundCap: 1,
      }),
    );
    const capWarn = freeTwice.log.find(
      (entry) =>
        entry.kind === 'warning' &&
        (entry.data.ruleViolation as { kind?: string })?.kind === 'per-ability-cap',
    );
    expect(capWarn).toBeDefined();
    expect(freeTwice.state.participants.hero?.triggeredThisRound).toBe(0);
    expect(freeTwice.state.participants.hero?.abilityUses[KEEPER_OF_ORDER]?.round).toBe(2);
  });
});

describe('villain actions (rule.monster/villain-action)', () => {
  it('spends the round economy; wrong timing and a second per round warn', () => {
    let state = initialEncounterState([
      { id: 'hero', kind: 'hero', stats: GOBLIN_WARRIOR_STATS },
      { id: 'vampire', kind: 'director-creature', sourceRecordId: VAMPIRE },
    ]);
    state = beginCombat(state, 'director');
    state = dispatchChecked(state, director('start-turn', { turnId: 'vampire' })).state;
    // Used during the vampire's own turn: "at the end of any other
    // creature's turn" — wrong-timing warn, applied anyway.
    const first = dispatchChecked(
      state,
      director('use-villain-action', { participantId: 'vampire', abilityArtifactId: LET_US_FEAST }),
    );
    expect(first.state.villainActions.usedThisRound).toBe(true);
    expect(first.state.villainActions.usedByAbility).toEqual([LET_US_FEAST]);
    const timingWarn = first.log.find(
      (entry) =>
        entry.kind === 'warning' &&
        (entry.data.ruleViolation as { kind?: string })?.kind === 'villain-timing',
    );
    expect(timingWarn?.message).toContain("at the end of any other creature's turn");

    const second = dispatchChecked(
      first.state,
      director('use-villain-action', { participantId: 'vampire', abilityArtifactId: SACRIFICE }),
    );
    const roundWarn = second.log.find(
      (entry) =>
        entry.kind === 'warning' &&
        (entry.data.ruleViolation as { kind?: string })?.kind === 'villain-once-per-round',
    );
    expect(roundWarn?.message).toContain('no more than one villain action can be used per round');
    expect(second.state.villainActions.usedByAbility).toEqual([LET_US_FEAST, SACRIFICE]);

    // The round flag reopens with the round; the per-encounter spend warns.
    const advanced = dispatchChecked(second.state, director('advance-round', {}));
    expect(advanced.state.villainActions.usedThisRound).toBe(false);
    const reuse = dispatchChecked(
      advanced.state,
      director('use-villain-action', { participantId: 'vampire', abilityArtifactId: SACRIFICE }),
    );
    const encounterWarn = reuse.log.find(
      (entry) =>
        entry.kind === 'warning' &&
        (entry.data.ruleViolation as { kind?: string })?.kind === 'villain-once-per-encounter',
    );
    expect(encounterWarn?.message).toContain('only once per encounter');
  });
});

describe('advance-round (Director-asserted; start-of-round sweeps)', () => {
  it('warns listing living unspent turns, resets budgets and counters, and increments the round', () => {
    let state = beginCombat(baseEncounter(), 'heroes');
    state = dispatchChecked(state, director('start-turn', { turnId: 'hero' })).state;
    state = dispatchChecked(state, useAbility('hero', spearChargeBy('hero', 'warrior'))).state;
    const open = state.resolutionStack[0];
    state = dispatchChecked(
      state,
      director('commit-resolution', {
        resolutionId: open?.resolutionId,
        payload: spearChargeBy('hero', 'warrior'),
      }),
    ).state;
    // The warrior never acted — the advisory warn lists them.
    const advanced = dispatchChecked(state, director('advance-round', {}));
    const warning = advanced.log.find(
      (entry) => entry.kind === 'warning' && Array.isArray(entry.data.unspentTurns),
    );
    expect(warning?.data.unspentTurns).toContain('warrior');
    expect(advanced.state.turnState?.round).toBe(2);
    expect(advanced.state.turnState?.turnsTaken).toEqual({});
    expect(advanced.state.participants.hero?.actionBudget).toEqual({});
    expect(advanced.state.turnState?.sideToChoose).toBe('heroes');
  });

  it('never advances from start-turn: only the Director assertion moves the round', () => {
    let state = beginCombat(baseEncounter(), 'heroes');
    state = dispatchChecked(state, director('start-turn', { turnId: 'hero' })).state;
    state = dispatchChecked(state, director('end-turn', { participantId: 'hero' })).state;
    state = dispatchChecked(state, director('start-turn', { turnId: 'warrior' })).state;
    state = dispatchChecked(state, director('end-turn', { participantId: 'warrior' })).state;
    // Every creature has acted; the round still holds until asserted.
    expect(state.turnState?.round).toBe(1);
  });
});

describe('convert-action (rule.combat/turn)', () => {
  it('turns the main action into a maneuver: debit + granted capacity', () => {
    let state = beginCombat(baseEncounter(), 'heroes');
    state = dispatchChecked(state, director('start-turn', { turnId: 'hero' })).state;
    const converted = dispatchChecked(
      state,
      director('convert-action', { participantId: 'hero', to: 'maneuver' }),
    );
    expect(converted.state.participants.hero?.actionBudget['main-action']?.used).toBe(1);
    expect(converted.state.participants.hero?.actionBudget.maneuver?.granted).toBe(1);
    expect(converted.log.filter((entry) => entry.kind === 'warning')).toEqual([]);
  });
});

describe('add-grant (Director grant intent, R-0030)', () => {
  it('adds an escape-flagged action grant with deterministic identity', () => {
    const state = beginCombat(baseEncounter(), 'heroes');
    const result = dispatchChecked(
      state,
      director('add-grant', {
        target: 'warrior',
        grant: {
          kind: 'action',
          cost: 'main-action',
          escapes: { ignoresDazed: true, ignoresSurprised: false, offTurn: true },
          source: { participantId: 'warrior' },
          expiry: null,
        },
      }),
    );
    const grant = result.state.participants.warrior?.grants[0];
    expect(grant).toMatchObject({ kind: 'action', cost: 'main-action' });
    expect(grant?.grantId).toContain('grant#');
  });
});

describe('end-turn force-commit (design §3: printed damage is never discarded)', () => {
  it('refuses end-turn while an owned resolution is open without its re-supplied payload', () => {
    let state = beginCombat(baseEncounter(), 'heroes');
    state = dispatchChecked(state, director('start-turn', { turnId: 'hero' })).state;
    const payload = spearChargeBy('hero', 'warrior');
    state = dispatchChecked(state, useAbility('hero', payload)).state;
    const bare = dispatchChecked(state, director('end-turn', { participantId: 'hero' }));
    expect(bare.log[0]?.kind).toBe('refusal');
    expect(bare.log[0]?.message).toContain('commitPayloads');
    expect(bare.state).toEqual(state);
  });

  it('force-commits the open resolution, then sweeps: the damage lands', () => {
    let state = beginCombat(baseEncounter(), 'heroes');
    state = dispatchChecked(state, director('start-turn', { turnId: 'hero' })).state;
    const payload = spearChargeBy('hero', 'warrior');
    const roll = dispatchChecked(state, useAbility('hero', payload));
    const entryId = roll.state.resolutionStack[0]?.resolutionId ?? '';
    const ended = dispatchChecked(
      roll.state,
      director('end-turn', {
        participantId: 'hero',
        commitPayloads: { [entryId]: payload },
      }),
    );
    expect(ended.state.participants.warrior?.stamina?.current).toBe(11);
    expect(ended.state.resolutionStack[0]?.phase).toBe('committed');
    expect(ended.state.turnState?.activeTurnId).toBeNull();
    expect(ended.state.turnState?.lastTurnId).toBe('hero');
  });
});

describe('R-0001 pilot step 7: off-turn effect-ending free maneuver', () => {
  function imposedState(): { state: EncounterState; instanceId: string } {
    let state = beginCombat(baseEncounter(), 'heroes');
    // The hero imposed an effect on the warrior via an ability (source
    // carries the imposer + artifact).
    const applyId = nextId('impose');
    const applied = dispatchChecked(state, {
      intentId: applyId,
      kind: 'apply-condition',
      actor: { kind: 'director' },
      payload: {
        target: 'warrior',
        conditionId: 'mcdm.heroes.v1/condition/slowed',
        ending: { kind: 'external' },
        source: {
          participantId: 'hero',
          effectArtifactId: SPEAR_CHARGE.abilityArtifactId,
        },
      },
    });
    state = applied.state;
    // The WARRIOR's turn is active — the hero is off-turn.
    state = dispatchChecked(state, director('start-turn', { turnId: 'warrior' })).state;
    return { state, instanceId: `mcdm.heroes.v1/condition/slowed#${applyId}` };
  }

  it('warns the R-0001 violation AND applies the removal', () => {
    const { state, instanceId } = imposedState();
    const result = dispatchChecked(state, {
      intentId: nextId('end-effect'),
      kind: 'remove-condition',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: { target: 'warrior', instanceId },
    });
    const warning = result.log.find(
      (entry) =>
        entry.kind === 'warning' &&
        (entry.data.ruleViolation as { kind?: string })?.kind === 'free-maneuver-off-turn',
    );
    expect(warning?.message).toContain('free maneuvers are turn-only (R-0001');
    // AND it applies — warn-never-block.
    expect(result.state.participants.warrior?.conditions).toEqual([]);
  });

  it('the printed "(no action required)" ability-text escape suppresses the warn', () => {
    const { state, instanceId } = imposedState();
    const result = dispatchChecked(state, {
      intentId: nextId('end-effect'),
      kind: 'remove-condition',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: { target: 'warrior', instanceId, noActionRequired: true },
    });
    expect(result.log.filter((entry) => entry.kind === 'warning')).toEqual([]);
    expect(result.state.participants.warrior?.conditions).toEqual([]);
  });
});

describe('Charge composition: partOf single debit + single bleeding fire (R-0032)', () => {
  it('the inner Charge-keyword ability consumes the parent debit once and bleeding fires once', () => {
    let state = initialEncounterState([
      { id: 'hero', kind: 'hero', stats: GOBLIN_WARRIOR_STATS },
      { id: 'warrior', kind: 'director-creature', stats: GOBLIN_WARRIOR_STATS },
    ]);
    state = beginCombat(state, 'director');
    // The warrior is bleeding [condition/bleeding].
    state = dispatchChecked(
      state,
      director('apply-condition', {
        target: 'warrior',
        conditionId: BLEEDING,
        ending: { kind: 'save-ends' },
        source: { participantId: 'hero' },
      }),
    ).state;
    state = dispatchChecked(state, director('start-turn', { turnId: 'warrior' })).state;

    // Outer: the Charge common action (main action, prose feature —
    // verbatim table directive).
    const chargeIntentId = nextId('charge');
    const outer = dispatchChecked(state, {
      intentId: chargeIntentId,
      kind: 'use-effect',
      actor: { kind: 'director' },
      payload: {
        actorParticipantId: 'warrior',
        effect: CHARGE_EFFECT,
        targets: [],
      },
    });
    expect(outer.state.participants.warrior?.actionBudget['main-action']?.used).toBe(1);

    // Inner: Spear Charge (Charge keyword) rides partOf — no second debit.
    const innerPayload = spearChargeBy('warrior', 'hero', { partOf: chargeIntentId });
    const inner = dispatchChecked(outer.state, {
      intentId: nextId('inner'),
      kind: 'use-ability',
      actor: { kind: 'director' },
      payload: innerPayload,
    });
    expect(inner.state.participants.warrior?.actionBudget['main-action']?.used).toBe(1);
    expect(inner.log.filter((entry) => entry.kind === 'warning')).toEqual([]);
    const entryId = inner.state.resolutionStack[0]?.resolutionId ?? '';
    expect(inner.state.resolutionStack[0]?.actionKey).toBe(chargeIntentId);

    const commit = dispatchChecked(
      inner.state,
      director('commit-resolution', { resolutionId: entryId, payload: innerPayload }),
    );
    const bleedingFires = commit.log.filter((entry) => entry.data.bleedingFire !== undefined);
    expect(bleedingFires).toHaveLength(1);
    expect(bleedingFires[0]?.message).toContain('only happens once per action');
  });
});

describe('minion per-member budget (R-0033, PDF-recovered Acting Together)', () => {
  it('a squad member combining main action and maneuver on the squad turn warns and applies', () => {
    let state = initialEncounterState(
      [
        { id: 'hero', kind: 'hero', stats: GOBLIN_WARRIOR_STATS },
        {
          id: 'sk-1',
          kind: 'director-creature',
          stats: SKITTERLING_STATS,
          sourceRecordId: 'mcdm.monsters.v1/monster.goblin.statblock/skitterling',
        },
        {
          id: 'sk-2',
          kind: 'director-creature',
          stats: SKITTERLING_STATS,
          sourceRecordId: 'mcdm.monsters.v1/monster.goblin.statblock/skitterling',
        },
      ],
      [{ squadId: 'sq-1', name: 'skitterlings', memberIds: ['sk-1', 'sk-2'] }],
    );
    state = beginCombat(state, 'director');
    // The squad occupies ONE turn slot ("All members of a minion squad act
    // together on the same initiative").
    state = dispatchChecked(state, director('start-turn', { turnId: 'sq-1' })).state;
    expect(state.turnState?.activeTurnId).toBe('sq-1');
    expect(state.turnState?.turnsTaken['sq-1']).toBe(1);

    // sk-1 takes its main action (Claws — verbatim fixture).
    const claws = dispatchChecked(state, {
      intentId: nextId('claws'),
      kind: 'use-ability',
      actor: { kind: 'director' },
      payload: {
        actorParticipantId: 'sk-1',
        ability: SKITTERLING_CLAWS,
        targets: ['hero'],
        dice: [5, 5],
      },
    });
    expect(claws.log.filter((entry) => entry.kind === 'warning')).toEqual([]);
    expect(claws.state.participants['sk-1']?.actionBudget['main-action']?.used).toBe(1);

    // sk-1 then takes an individual maneuver (Grab, verbatim Effect) —
    // "each minion can take only a move action and a main action, a move
    // action and a maneuver, or two move actions" → warn-and-apply, plus
    // the individual-maneuver forfeit directive.
    const grab = dispatchChecked(claws.state, {
      intentId: nextId('grab'),
      kind: 'use-effect',
      actor: { kind: 'director' },
      payload: {
        actorParticipantId: 'sk-1',
        effect: GRAB_EFFECT,
        targets: [],
      },
    });
    const budgetWarn = grab.log.find(
      (entry) =>
        entry.kind === 'warning' &&
        (entry.data.ruleViolation as { kind?: string })?.kind === 'minion-budget',
    );
    expect(budgetWarn?.message).toContain('a move action and a main action');
    const forfeit = grab.log.find((entry) => entry.data.minionManeuverForfeit !== undefined);
    expect(forfeit?.message).toContain(
      "can't participate in their squad's main action or maneuver during the turn",
    );
    expect(grab.state.participants['sk-1']?.actionBudget.maneuver?.used).toBe(1);
  });
});

describe('operator-paid fixture instructions (R-0029)', () => {
  /** Reload (dynamic-terrain/siege-engines/boiling-oil-cauldron.md),
   * verbatim: header cost "Main action (Adjacent creature)"; "**Effect:**
   * The boiling oil cauldron is reloaded, allowing **Boiling Oil** to be
   * used again. This action can be used only once per round." — the
   * fixture takes no turns, so the debit lands on the dispatching
   * adjacent operator; the printed cap compiles to usesPerRound 1. */
  const RELOAD_EFFECT = {
    effectArtifactId: 'mcdm.monsters.v1/dynamic-terrain.siege-engines/boiling-oil-cauldron',
    effectOrdinal: 1,
    sourceSpan: { byteStart: 0, byteEnd: 120 },
    sourceText:
      'The boiling oil cauldron is reloaded, allowing **Boiling Oil** to be used again. This action can be used only once per round.',
    canonRefs: [],
    actionType: 'Main action (Adjacent creature)',
    actionCost: 'main-action' as const,
    operatorPays: true,
    usesPerRound: 1,
    targetsText: '-',
    distanceText: '-',
    keywords: ['-'],
    resolution: { kind: 'table' as const },
  };

  it('routes the debit to the named operator; an unnamed operator is a table directive; the printed once-per-round cap warns', () => {
    let state = beginCombat(baseEncounter(), 'heroes');
    state = dispatchChecked(state, director('start-turn', { turnId: 'hero' })).state;
    const named = dispatchChecked(state, {
      intentId: nextId('reload'),
      kind: 'use-effect',
      actor: { kind: 'director' },
      payload: {
        actorParticipantId: 'warrior',
        effect: RELOAD_EFFECT,
        targets: [],
        operatorId: 'hero',
      },
    });
    expect(named.state.participants.hero?.actionBudget['main-action']?.used).toBe(1);
    expect(named.state.participants.warrior?.actionBudget['main-action']?.used ?? 0).toBe(0);
    expect(named.log.filter((entry) => entry.kind === 'warning')).toEqual([]);

    // A second Reload by the same operator this round breaches the printed
    // "only once per round" cap — warn-and-apply.
    const again = dispatchChecked(named.state, {
      intentId: nextId('reload'),
      kind: 'use-effect',
      actor: { kind: 'director' },
      payload: {
        actorParticipantId: 'warrior',
        effect: RELOAD_EFFECT,
        targets: [],
        operatorId: 'hero',
      },
    });
    const capWarn = again.log.find(
      (entry) =>
        entry.kind === 'warning' &&
        (entry.data.ruleViolation as { kind?: string })?.kind === 'per-ability-cap',
    );
    expect(capWarn).toBeDefined();

    const unnamed = dispatchChecked(state, {
      intentId: nextId('reload'),
      kind: 'use-effect',
      actor: { kind: 'director' },
      payload: {
        actorParticipantId: 'warrior',
        effect: RELOAD_EFFECT,
        targets: [],
      },
    });
    const directive = unnamed.log.find((entry) => entry.data.operatorDebitUnassigned !== undefined);
    expect(directive?.kind).toBe('table-directive');
  });
});

describe('receipt-aware capacity is strictly delta-gated (grant-after-overage corner)', () => {
  it('accepts a grant-covered spend after receipted historical overage: used 3 of 2, no new receipt needed', () => {
    let state = beginCombat(baseEncounter(), 'heroes');
    state = dispatchChecked(state, director('start-turn', { turnId: 'hero' })).state;
    // Dispatch 0: the printed budget's one main action.
    state = dispatchChecked(state, useAbility('hero', spearChargeBy('hero', 'warrior'))).state;
    // Dispatch 1: over-budget — warns and applies, RECEIPTED (used 2 of 1).
    const over = dispatchChecked(state, useAbility('hero', spearChargeBy('hero', 'warrior')));
    expect(
      over.log.some(
        (entry) =>
          entry.kind === 'warning' &&
          (entry.data.ruleViolation as { kind?: string })?.kind === 'over-budget',
      ),
    ).toBe(true);
    expect(over.state.participants.hero?.actionBudget['main-action']).toEqual({
      used: 2,
      granted: 0,
    });
    // Dispatch 2: the Director grants an additional main action.
    const granted = dispatchChecked(
      over.state,
      director('add-grant', {
        target: 'hero',
        grant: {
          kind: 'action',
          cost: 'main-action',
          escapes: { ignoresDazed: false, ignoresSurprised: false, offTurn: false },
          source: { participantId: 'hero' },
          expiry: null,
        },
      }),
    );
    // Dispatch 3: the grant-covered spend adds ZERO overage (used and
    // granted rise together) — silent per R-0030, and the delta-gated
    // oracle accepts the historical, already-receipted overage. This is
    // the exact three-dispatch sequence from the CLI host lane's repro:
    // dispatchChecked would reject it under the total-vs-capacity check.
    const covered = dispatchChecked(
      granted.state,
      useAbility('hero', spearChargeBy('hero', 'warrior')),
    );
    expect(covered.log.filter((entry) => entry.kind === 'warning')).toEqual([]);
    expect(covered.state.participants.hero?.actionBudget['main-action']).toEqual({
      used: 3,
      granted: 1,
    });
  });

  it('still flags NEW unreceipted overage as corruption', () => {
    const state = beginCombat(baseEncounter(), 'heroes');
    const hero = state.participants.hero;
    if (!hero) throw new Error('hero missing');
    // Fabricated result: used jumps 0→2 with walk-clean claims but NO
    // rule-violation receipt — one unit of new overage, uncovered.
    const intent: Intent = {
      intentId: 'fabricated-1',
      kind: 'advance-round',
      actor: { kind: 'director' },
      payload: {},
    };
    const result = {
      state: {
        ...state,
        participants: {
          ...state.participants,
          hero: { ...hero, actionBudget: { 'main-action': { used: 2, granted: 0 } } },
        },
      },
      log: [
        {
          kind: 'mutation' as const,
          intentId: 'fabricated-1',
          actor: { kind: 'director' as const },
          canonRefs: ['mcdm.heroes.v1/rule.combat/turn'],
          message: 'fabricated unreceipted overage (oracle regression case)',
          data: {
            actionBudgetDeltas: [
              {
                participantId: 'hero',
                cost: 'main-action',
                usedFrom: 0,
                usedTo: 2,
                grantedFrom: 0,
                grantedTo: 0,
              },
            ],
          },
        },
      ],
    };
    const violations = checkInvariants(state, intent, result);
    expect(violations.map((violation) => violation.code)).toContain(
      'budget-over-capacity-unreceipted',
    );
  });
});
