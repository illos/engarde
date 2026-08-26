import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type FunctionReference, getFunctionName } from 'convex/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Action-economy Table surfaces [R-0029..R-0033]: same mocking scheme as
// encounter.spec.tsx — the Convex data layer is mocked per function name
// over the generated references. Fixtures are real corpus records only
// (prime directive); log fixtures mirror engine-composed receipts, never
// invented rule prose.
const queryResults = new Map<string, unknown>();
const mutationSpies = new Map<string, ReturnType<typeof vi.fn>>();

function setQuery(ref: FunctionReference<'query'>, value: unknown) {
  queryResults.set(getFunctionName(ref), value);
}

function spyFor(ref: FunctionReference<'mutation'>) {
  const name = getFunctionName(ref);
  let spy = mutationSpies.get(name);
  if (!spy) {
    spy = vi.fn(() => Promise.resolve());
    mutationSpies.set(name, spy);
  }
  return spy;
}

vi.mock('convex/react', async () => {
  const { getFunctionName: nameOf } = await import('convex/server');
  return {
    useQuery: (ref: Parameters<typeof nameOf>[0]) => {
      const value = queryResults.get(nameOf(ref));
      if (value instanceof Error) throw value;
      return value;
    },
    useMutation: (ref: Parameters<typeof nameOf>[0]) => {
      const name = nameOf(ref);
      let spy = mutationSpies.get(name);
      if (!spy) {
        spy = vi.fn(() => Promise.resolve());
        mutationSpies.set(name, spy);
      }
      return spy;
    },
  };
});

import { EncounterPanel } from './EncounterPanel';

const campaignId = 'campaign-1' as Id<'campaigns'>;
const encounterId = 'encounter-1' as Id<'encounters'>;

/** Real corpus ids only (prime directive). The goblin-monarch carries the
 * Meat Shield triggered action and the three printed Villain Actions —
 * the action-economy fixture statblock (backend verbatimFixtures). */
const MONARCH = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-monarch';
const BFB = 'mcdm.heroes.v1/feature.ability.fury.level-1/blood-for-blood';
const FURY = 'mcdm.heroes.v1/class/fury';
const SPINECLEAVER = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-spinecleaver';

/** v6 action-economy participant slots — empty outside a turn. */
const economyIdle = {
  actionGrants: [],
  turnGrants: [],
  actionBudget: {},
  triggeredThisRound: 0,
  triggeredActionLimit: 1,
  turnAllowance: 1,
  noConsecutiveTurns: false,
  subActorOf: null,
  abilityUses: {},
};

const fury = {
  id: 'fury',
  recordId: FURY,
  recordSlug: 'fury',
  isMinion: false,
  vitals: null,
  conditions: [],
  grants: [],
  ...economyIdle,
};

const monarch = {
  id: 'goblin-monarch',
  recordId: MONARCH,
  recordSlug: 'goblin-monarch',
  isMinion: false,
  // Vitals per the goblin-monarch statsJson (Stamina 80, Leader).
  vitals: {
    staminaCurrent: 80,
    staminaTemporary: 0,
    staminaMax: 80,
    winded: false,
    dying: false,
    dead: false,
    organization: 'Leader',
    recoveriesCurrent: null,
    recoveriesMax: null,
  },
  conditions: [],
  grants: [],
  ...economyIdle,
};

function member(id: string) {
  return {
    id,
    recordId: SPINECLEAVER,
    recordSlug: 'goblin-spinecleaver',
    isMinion: true,
    vitals: null,
    conditions: [],
    grants: [],
    ...economyIdle,
  };
}

/** Squad per the printed pool formula (2 members × 5 per-minion Stamina). */
const squad = {
  squadId: 'squad-sc',
  name: 'goblin spinecleavers',
  poolCurrent: 10,
  poolMax: 10,
  perMinionStamina: 5,
  livingMemberIds: ['sc1', 'sc2'],
  deadMemberIds: [],
  pendingKills: 0,
  captainId: null,
  withCaptain: null,
};

const baseView = {
  encounterId,
  status: 'active' as const,
  startedAt: 0,
  viewerIsDirector: true,
  turnState: null as null | Record<string, unknown>,
  villainActions: { usedThisRound: false, usedByAbility: [] as string[] },
  resolutions: [] as unknown[],
  participants: [fury, monarch, member('sc1'), member('sc2')],
  terrainFacts: [],
  squads: [squad],
};

/** Mid-combat: round 2, heroes went first, the Director side chooses next,
 * fury's turn is active. */
const combatView = {
  ...baseView,
  turnState: {
    round: 2,
    firstSide: 'heroes' as const,
    sideToChoose: 'director' as const,
    activeTurnId: 'fury',
    lastTurnId: 'goblin-monarch',
    turnsTaken: { fury: 1, 'goblin-monarch': 1, 'squad-sc': 0 },
  },
  villainActions: {
    usedThisRound: true,
    usedByAbility: [`${MONARCH}#what-are-you-waiting-for`],
  },
};

function setScene(view: unknown, gameRole: 'player' | 'director' = 'director') {
  setQuery(api.campaigns.listRoster, { viewer: { gameRole }, members: [] });
  setQuery(api.sessions.getActive, { number: 1 });
  setQuery(api.encounters.getActive, view);
  setQuery(api.encounters.listLog, []);
}

function logRow(overrides: Record<string, unknown>) {
  return {
    entryId: `log-${Math.random()}`,
    seq: 1,
    kind: 'mutation',
    message: '',
    canonRefs: [],
    engineActorLabel: null,
    data: null,
    intentId: null,
    actorName: 'owner',
    occurredAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  queryResults.clear();
  mutationSpies.clear();
});
afterEach(cleanup);

describe('TurnRail', () => {
  test('renders turnState: round, sides, active turn, turns taken, villain economy, begin receipt', () => {
    setScene(combatView);
    setQuery(api.encounters.listLog, [
      logRow({
        // The engine's verbatim begin-combat receipt (apply-intent).
        message: 'combat begins — round 1, heroes act first (d10: 7)',
        data: {
          beginCombat: { firstSide: 'heroes', surprisedSide: null, roll: 7, rollAsserted: false },
        },
      }),
    ]);
    render(<EncounterPanel campaignId={campaignId} />);
    expect(screen.getByText('Round 2')).toBeTruthy();
    expect(screen.getByText('heroes went first')).toBeTruthy();
    expect(screen.getByText('director')).toBeTruthy(); // alternation pointer
    // Active-turn marker plus per-actor taken-vs-allowance chips [I-6c]
    // (squad occupies one slot; members never appear as turn takers).
    expect(screen.getByLabelText('fury — turns taken 1 of 1 — active')).toBeTruthy();
    expect(screen.getByLabelText('goblin-monarch — turns taken 1 of 1')).toBeTruthy();
    expect(screen.getByLabelText('goblin spinecleavers — turns taken 0 of 1')).toBeTruthy();
    expect(screen.queryByLabelText(/sc1 — turns taken/)).toBeNull();
    // Villain economy: per-round flag + which of the printed actions is
    // spent this encounter.
    expect(screen.getByText('SPENT this round')).toBeTruthy();
    expect(screen.getByText(/used this encounter:\s*what-are-you-waiting-for/)).toBeTruthy();
    // The d10 line renders verbatim from the engine receipt.
    expect(
      screen.getAllByText('combat begins — round 1, heroes act first (d10: 7)').length,
    ).toBeGreaterThan(0);
    // The start-turn picker offers squads + non-member participants only.
    const picker = screen.getByLabelText('Turn to start') as HTMLSelectElement;
    expect(Array.from(picker.options).map((option) => option.value)).toEqual([
      'squad-sc',
      'fury',
      'goblin-monarch',
    ]);
  });

  test('a multi-turn actor renders taken vs allowance — two solo turns are never styled as a violation [I-6c]', () => {
    // Seeded scheduling traits from the view: a two-allowance actor (the
    // solo shape) and a sub-actor that must not appear as a turn taker.
    setScene({
      ...combatView,
      participants: [
        { ...monarch, turnAllowance: 2 },
        { ...fury, subActorOf: 'goblin-monarch' },
      ],
      squads: [],
      turnState: {
        ...combatView.turnState,
        activeTurnId: null,
        turnsTaken: { 'goblin-monarch': 2 },
      },
    });
    render(<EncounterPanel campaignId={campaignId} />);
    const chip = screen.getByLabelText('goblin-monarch — turns taken 2 of 2');
    expect(chip).toBeTruthy();
    // Spent-within-allowance renders muted, NOT in the warn accent tone.
    expect(chip.className).not.toContain('text-accent');
    // The sub-actor never appears as a turn taker of its own [I-6c].
    expect(screen.queryByLabelText(/fury — turns taken/)).toBeNull();
    const picker = screen.getByLabelText('Turn to start') as HTMLSelectElement;
    expect(Array.from(picker.options).map((option) => option.value)).toEqual(['goblin-monarch']);
  });

  test('begin combat: Director form dispatches with the asserted d10; players see status only', () => {
    setScene(baseView);
    render(<EncounterPanel campaignId={campaignId} />);
    expect(screen.getByText('Combat has not begun.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Asserted d10 roll'), { target: { value: '7' } });
    fireEvent.click(screen.getByText('Begin combat'));
    expect(spyFor(api.encounters.beginCombat)).toHaveBeenCalledWith({
      campaignId,
      firstSide: 'heroes',
      roll: 7,
    });

    cleanup();
    setScene({ ...baseView, viewerIsDirector: false }, 'player');
    render(<EncounterPanel campaignId={campaignId} />);
    expect(screen.getByText('Combat has not begun.')).toBeTruthy();
    expect(screen.queryByText('Begin combat')).toBeNull();
  });

  test('start turn and advance round dispatch; the unspent-turns warn renders loud', async () => {
    setScene(combatView);
    setQuery(api.encounters.listLog, [
      logRow({
        kind: 'warning',
        // Engine-composed advance-round warn [R-0030] with its claim data.
        message:
          'round advances with living unspent turns: squad-sc — "During a combat round, each creature in the battle takes a turn." Applied anyway (Director-asserted round advance, R-0030)',
        data: {
          ruleViolation: { kind: 'unspent-turns', participantId: null },
          unspentTurns: ['squad-sc'],
        },
      }),
    ]);
    render(<EncounterPanel campaignId={campaignId} />);
    fireEvent.click(screen.getByText('Start turn'));
    expect(spyFor(api.encounters.startTurn)).toHaveBeenCalledWith({
      campaignId,
      turnId: 'squad-sc',
    });
    await act(() => Promise.resolve());
    fireEvent.click(screen.getByText('Advance round'));
    expect(spyFor(api.encounters.advanceRound)).toHaveBeenCalledWith({ campaignId });
    // The warn is VISIBLE — an alert in the rail (and again in the log).
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/round advances with living unspent turns: squad-sc/).length,
    ).toBeGreaterThan(0);
  });

  test('villain action: Director picks the record + printed ability and dispatches', () => {
    setScene(combatView);
    setQuery(api.encounters.searchRecords, [
      {
        artifactId: MONARCH,
        slug: 'goblin-monarch',
        parsedTiers: ['≤11', '12-16', '17+'],
        residueSpans: 2,
        effects: [],
        autoRollable: false,
        hasStats: true,
      },
    ]);
    render(<EncounterPanel campaignId={campaignId} />);
    fireEvent.change(screen.getByLabelText('Search villain actions'), {
      target: { value: 'monarch' },
    });
    fireEvent.click(screen.getByText('Pick villain'));
    fireEvent.change(screen.getByLabelText('Villain ability within the record'), {
      target: { value: 'focus-fire' },
    });
    fireEvent.change(screen.getByLabelText('Villain actor'), {
      target: { value: 'goblin-monarch' },
    });
    fireEvent.click(screen.getByText('Use villain action'));
    expect(spyFor(api.encounters.useVillainAction)).toHaveBeenCalledWith({
      campaignId,
      participantId: 'goblin-monarch',
      abilityArtifactId: `${MONARCH}#focus-fire`,
    });
  });
});

describe('ParticipantEconomy', () => {
  test('budget chips reflect used vs printed-plus-granted; grants show escape flags', () => {
    setScene({
      ...combatView,
      participants: [
        {
          ...fury,
          actionBudget: {
            'main-action': { used: 0, granted: 1 },
            maneuver: { used: 1, granted: 0 },
          },
          triggeredThisRound: 1,
          actionGrants: [
            {
              grantId: 'g1',
              cost: 'main-action' as const,
              magnitude: 1,
              escapes: { ignoresDazed: true, ignoresSurprised: false, offTurn: true },
              expiry: null,
              sourceParticipantId: null,
              sourceRecordSlug: null,
            },
          ],
        },
        monarch,
      ],
      squads: [],
    });
    render(<EncounterPanel campaignId={campaignId} />);
    // fury: one granted extra main action → capacity 2; maneuver spent.
    expect(screen.getByLabelText('fury main-action 0/2')).toBeTruthy();
    expect(screen.getByLabelText('fury maneuver 1/1')).toBeTruthy();
    expect(screen.getByLabelText('fury move-action 0/1')).toBeTruthy();
    expect(screen.getByLabelText('fury triggered 1/1')).toBeTruthy();
    // untouched card reads the empty record as zero-used.
    expect(screen.getByLabelText('goblin-monarch main-action 0/1')).toBeTruthy();
    // The pending action grant renders with its escape flags.
    expect(screen.getByText(/granted: additional main-action/)).toBeTruthy();
    expect(screen.getByText(/\(ignores dazed · off-turn\)/)).toBeTruthy();
  });

  test('convert-action: Director sees it on every card; a player sees it on the ACTIVE participant and dispatches [I-5]', async () => {
    setScene({ ...combatView, participants: [fury, monarch], squads: [] });
    render(<EncounterPanel campaignId={campaignId} />);
    fireEvent.click(screen.getByLabelText('Convert main action to maneuver for fury'));
    expect(spyFor(api.encounters.convertAction)).toHaveBeenCalledWith({
      campaignId,
      participantId: 'fury',
      to: 'maneuver',
    });
    await act(() => Promise.resolve());
    fireEvent.click(screen.getByLabelText('Convert main action to move action for fury'));
    expect(spyFor(api.encounters.convertAction)).toHaveBeenLastCalledWith({
      campaignId,
      participantId: 'fury',
      to: 'move-action',
    });
    // Director adjudication reaches non-active cards too.
    expect(
      screen.getByLabelText('Convert main action to maneuver for goblin-monarch'),
    ).toBeTruthy();

    cleanup();
    setScene(
      { ...combatView, viewerIsDirector: false, participants: [fury, monarch], squads: [] },
      'player',
    );
    render(<EncounterPanel campaignId={campaignId} />);
    // The conversion is the actor's OWN choice [I-5]: with fury's turn
    // active, a player gets the affordance on fury's card and dispatches.
    fireEvent.click(screen.getByLabelText('Convert main action to maneuver for fury'));
    expect(spyFor(api.encounters.convertAction)).toHaveBeenLastCalledWith({
      campaignId,
      participantId: 'fury',
      to: 'maneuver',
    });
    // Non-active cards stay affordance-free for players.
    expect(
      screen.queryByLabelText('Convert main action to maneuver for goblin-monarch'),
    ).toBeNull();
    // Budget chips stay visible to everyone.
    expect(screen.getByLabelText('fury main-action 0/1')).toBeTruthy();
  });

  test('triggered affordance: card button preselects the actor; dispatch carries the free flag off, # suffix on', () => {
    setScene({ ...combatView, participants: [fury, monarch], squads: [] });
    setQuery(api.encounters.searchRecords, [
      {
        artifactId: MONARCH,
        slug: 'goblin-monarch',
        parsedTiers: ['≤11', '12-16', '17+'],
        residueSpans: 2,
        effects: [],
        autoRollable: false,
        hasStats: true,
      },
    ]);
    render(<EncounterPanel campaignId={campaignId} />);
    fireEvent.click(screen.getByLabelText('Triggered action for goblin-monarch'));
    fireEvent.change(screen.getByLabelText('Search triggered actions'), {
      target: { value: 'monarch' },
    });
    fireEvent.click(screen.getByText('Pick triggered'));
    expect((screen.getByLabelText('Triggered actor') as HTMLSelectElement).value).toBe(
      'goblin-monarch',
    );
    fireEvent.change(screen.getByLabelText('Triggered ability within the record'), {
      target: { value: 'meat-shield' },
    });
    fireEvent.click(screen.getByText('Use triggered action'));
    // Default dispatch ships NO free/perRoundCap — the host derives both
    // from the compiled header [I-6d]; the select is the asserted override.
    expect(spyFor(api.encounters.useTriggeredAction)).toHaveBeenCalledWith({
      campaignId,
      participantId: 'goblin-monarch',
      abilityArtifactId: `${MONARCH}#meat-shield`,
    });
  });

  test('triggered cost override and occurrence reference: asserted free wins; a picked log occurrence rides triggerIntentId [I-6d/I-6e]', async () => {
    setScene({ ...combatView, participants: [fury, monarch], squads: [] });
    setQuery(api.encounters.listLog, [
      logRow({
        intentId: 'd3-lash',
        message: 'fury uses lash on goblin-monarch',
        kind: 'informational',
      }),
      // A second row of the SAME dispatch dedupes to one option.
      logRow({ intentId: 'd3-lash', message: 'goblin-monarch takes 4 damage' }),
      logRow({ message: 'a host table card with no dispatch behind it', kind: 'table-card' }),
    ]);
    setQuery(api.encounters.searchRecords, [
      {
        artifactId: MONARCH,
        slug: 'goblin-monarch',
        parsedTiers: ['≤11', '12-16', '17+'],
        residueSpans: 2,
        effects: [],
        autoRollable: false,
        hasStats: true,
      },
    ]);
    render(<EncounterPanel campaignId={campaignId} />);
    fireEvent.change(screen.getByLabelText('Search triggered actions'), {
      target: { value: 'monarch' },
    });
    fireEvent.click(screen.getByText('Pick triggered'));
    // The occurrence picker offers the receipted dispatch exactly once.
    const occurrencePicker = screen.getByLabelText('Trigger occurrence') as HTMLSelectElement;
    expect(Array.from(occurrencePicker.options).map((option) => option.value)).toEqual([
      '',
      'd3-lash',
    ]);
    fireEvent.change(occurrencePicker, { target: { value: 'd3-lash' } });
    fireEvent.change(screen.getByLabelText('Triggered cost override'), {
      target: { value: 'free' },
    });
    fireEvent.click(screen.getByText('Use triggered action'));
    expect(spyFor(api.encounters.useTriggeredAction)).toHaveBeenCalledWith({
      campaignId,
      participantId: 'fury',
      abilityArtifactId: MONARCH,
      free: true,
      triggerIntentId: 'd3-lash',
    });
    await act(() => Promise.resolve());
    // Back to no occurrence: asserted text is the fallback reference.
    fireEvent.change(occurrencePicker, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Triggered cost override'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('Asserted trigger'), {
      target: { value: 'a creature strikes them' },
    });
    fireEvent.click(screen.getByText('Use triggered action'));
    expect(spyFor(api.encounters.useTriggeredAction)).toHaveBeenLastCalledWith({
      campaignId,
      participantId: 'fury',
      abilityArtifactId: MONARCH,
      triggerText: 'a creature strikes them',
    });
  });
});

describe('AddGrantSection [I-6f]', () => {
  test('Director dispatches an escape-flagged action grant with a budget-only cost menu [M-2, R-0030]', () => {
    setScene({ ...combatView, participants: [fury, monarch], squads: [] });
    render(<EncounterPanel campaignId={campaignId} />);
    // The cost menu is the engine's budget enum — never the wide vocabulary
    // (a dead grant is unrepresentable from this form) [M-2].
    const costPicker = screen.getByLabelText('Granted action cost') as HTMLSelectElement;
    expect(Array.from(costPicker.options).map((option) => option.value)).toEqual([
      'main-action',
      'maneuver',
      'move-action',
    ]);
    // Escape-flagged Solo-Action shape: the dazed spend must not warn —
    // R-0030's promise, now reachable from a web-only table.
    fireEvent.change(screen.getByLabelText('Grant target'), {
      target: { value: 'goblin-monarch' },
    });
    fireEvent.click(screen.getByLabelText('Grant ignores dazed'));
    fireEvent.click(screen.getByLabelText('Grant usable off-turn'));
    fireEvent.change(screen.getByLabelText('Grant source artifact id'), {
      target: { value: `${MONARCH}#solo-action` },
    });
    fireEvent.click(screen.getByText('Add grant'));
    expect(spyFor(api.encounters.addGrant)).toHaveBeenCalledWith({
      campaignId,
      targetParticipantId: 'goblin-monarch',
      grant: {
        kind: 'action',
        cost: 'main-action',
        magnitude: 1,
        escapes: { ignoresDazed: true, ignoresSurprised: false, offTurn: true },
        expiry: null,
      },
      sourceArtifactId: `${MONARCH}#solo-action`,
    });
  });

  test('turn and next-roll kinds dispatch their shapes; the form is Director-only', async () => {
    setScene({ ...combatView, participants: [fury, monarch], squads: [] });
    render(<EncounterPanel campaignId={campaignId} />);
    fireEvent.change(screen.getByLabelText('Grant kind'), { target: { value: 'turn' } });
    fireEvent.change(screen.getByLabelText('Turn grant mode'), {
      target: { value: 'insertion' },
    });
    fireEvent.click(screen.getByLabelText('No consecutive turns'));
    fireEvent.click(screen.getByText('Add grant'));
    expect(spyFor(api.encounters.addGrant)).toHaveBeenCalledWith({
      campaignId,
      targetParticipantId: 'fury',
      grant: {
        kind: 'turn',
        mode: 'insertion',
        magnitude: 1,
        constraint: 'no-consecutive',
        expiry: null,
      },
    });
    await act(() => Promise.resolve());
    fireEvent.change(screen.getByLabelText('Grant kind'), { target: { value: 'next-roll' } });
    fireEvent.change(screen.getByLabelText('Next-roll polarity'), {
      target: { value: 'double-bane' },
    });
    fireEvent.change(screen.getByLabelText('Next-roll direction'), {
      target: { value: 'inbound' },
    });
    fireEvent.click(screen.getByLabelText("Until end of target's next turn"));
    fireEvent.click(screen.getByText('Add grant'));
    expect(spyFor(api.encounters.addGrant)).toHaveBeenLastCalledWith({
      campaignId,
      targetParticipantId: 'fury',
      grant: {
        kind: 'next-roll',
        polarity: 'double-bane',
        scope: 'strike',
        direction: 'inbound',
        window: 'end-of-targets-next-turn',
      },
    });

    cleanup();
    setScene(
      { ...combatView, viewerIsDirector: false, participants: [fury, monarch], squads: [] },
      'player',
    );
    render(<EncounterPanel campaignId={campaignId} />);
    expect(screen.queryByText('Grant (Director)')).toBeNull();
  });
});

describe('ResolutionsSection', () => {
  const resolution = {
    resolutionId: 'd7-blood-for-blood',
    actorId: 'fury',
    abilityArtifactId: BFB,
    abilitySlug: 'blood-for-blood',
    actionCost: 'main-action' as const,
    phase: 'rolled' as const,
    roll: { dice: [7, 4], natural: 11, total: 13, tier: 2 },
    modifications: [],
  };

  test('open-resolution card: roll receipt renders; Commit and Downgrade dispatch', async () => {
    setScene({
      ...combatView,
      participants: [fury, monarch],
      squads: [],
      resolutions: [
        { ...resolution, modifications: [{ kind: 'downgrade' as const, toTier: 2 as const }] },
      ],
    });
    render(<EncounterPanel campaignId={campaignId} />);
    expect(screen.getByText('Open rolls — commit pending')).toBeTruthy();
    expect(screen.getByText('blood-for-blood')).toBeTruthy();
    expect(screen.getByText(/7\+4 · total 13 → tier 2/)).toBeTruthy();
    // Recorded modifications list in dispatch order.
    expect(screen.getByText('mod: downgrade to tier 2')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Downgrade tier for d7-blood-for-blood'), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByText('Downgrade'));
    // Director acts as such — no asParticipantId (removeCondition pattern).
    expect(spyFor(api.encounters.modifyResolution)).toHaveBeenCalledWith({
      campaignId,
      resolutionId: 'd7-blood-for-blood',
      modification: { kind: 'downgrade', toTier: 1 },
    });
    await act(() => Promise.resolve());
    fireEvent.click(screen.getByText('Commit'));
    expect(spyFor(api.encounters.commitResolution)).toHaveBeenCalledWith({
      campaignId,
      resolutionId: 'd7-blood-for-blood',
    });
  });

  test('a member commits naming the owning participant', () => {
    setScene(
      {
        ...combatView,
        viewerIsDirector: false,
        participants: [fury, monarch],
        squads: [],
        resolutions: [resolution],
      },
      'player',
    );
    render(<EncounterPanel campaignId={campaignId} />);
    fireEvent.click(screen.getByText('Commit'));
    expect(spyFor(api.encounters.commitResolution)).toHaveBeenCalledWith({
      campaignId,
      resolutionId: 'd7-blood-for-blood',
      asParticipantId: 'fury',
    });
  });
});

describe('hold toggle [R-0032]', () => {
  test('rolling with the hold toggle passes hold:true; default omits it', async () => {
    setScene({ ...combatView, participants: [fury, monarch], squads: [] }, 'player');
    setQuery(api.encounters.searchRecords, [
      {
        artifactId: BFB,
        slug: 'blood-for-blood',
        parsedTiers: ['≤11', '12-16', '17+'],
        residueSpans: 0,
        effects: [],
        autoRollable: true,
        hasStats: false,
      },
    ]);
    render(<EncounterPanel campaignId={campaignId} />);
    fireEvent.change(screen.getByLabelText('Search abilities'), { target: { value: 'blood' } });
    fireEvent.click(screen.getByText('Pick'));
    fireEvent.click(screen.getByLabelText('Hold the roll open'));
    fireEvent.click(screen.getByText('Roll'));
    expect(spyFor(api.encounters.useAbility)).toHaveBeenCalledWith({
      campaignId,
      artifactId: BFB,
      actorParticipantId: 'fury',
      targetParticipantIds: ['goblin-monarch'],
      dice: undefined,
      edges: 0,
      banes: 0,
      knockOut: undefined,
      hold: true,
    });
    await act(() => Promise.resolve());
    // Unchecking restores the one-tap default — no hold key at all.
    fireEvent.click(screen.getByLabelText('Hold the roll open'));
    fireEvent.click(screen.getByText('Roll'));
    expect(spyFor(api.encounters.useAbility)).toHaveBeenLastCalledWith({
      campaignId,
      artifactId: BFB,
      actorParticipantId: 'fury',
      targetParticipantIds: ['goblin-monarch'],
      dice: undefined,
      edges: 0,
      banes: 0,
      knockOut: undefined,
    });
  });
});

describe('warning receipts', () => {
  test('R-0030 warn receipts render loud and distinct in the log', () => {
    setScene({ ...combatView, participants: [fury, monarch], squads: [] });
    setQuery(api.encounters.listLog, [
      logRow({
        kind: 'warning',
        // Engine-composed over-budget warn (action-economy one debit home).
        message:
          'fury exceeds their turn budget for a main-action — each creature "gets to take a main action, a maneuver, and a move action on their turn" — applied anyway (permissive engine, R-0030)',
      }),
      logRow({ entryId: 'log-i', kind: 'informational', message: 'fury uses blood-for-blood' }),
    ]);
    render(<EncounterPanel campaignId={campaignId} />);
    const alert = screen
      .getAllByRole('alert')
      .find((node) => node.textContent?.includes('exceeds their turn budget'));
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('Rule warning');
    expect(alert?.className).toContain('border-accent');
    // The informational line stays a plain receipt — no alert framing.
    expect(screen.getByText('fury uses blood-for-blood').closest('[role="alert"]')).toBeNull();
  });
});
