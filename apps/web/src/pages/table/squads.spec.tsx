import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type FunctionReference, getFunctionName } from 'convex/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Same mocking scheme as encounter.spec.tsx: the Convex data layer is mocked
// per function name over the generated references (encounters:
// resolvePendingKills / attachCaptain / detachCaptain).
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
import type { SquadView } from './squad-contract';

const campaignId = 'campaign-1' as Id<'campaigns'>;
const encounterId = 'encounter-1' as Id<'encounters'>;

/** Real corpus ids only (prime directive). */
const SPINECLEAVER = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-spinecleaver';
const WARRIOR = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-warrior';
const FURY = 'mcdm.heroes.v1/class/fury';
/** Verbatim With-Captain line from the goblin-spinecleaver statblock
 * (packages/canon/src/fixtures/goblin-spinecleaver.verbatim.ts). */
const SPINECLEAVER_WITH_CAPTAIN = '+1 damage bonus to strikes';

/** v6 action-economy participant slots — empty outside combat (the view
 * contract pins them as always-present). */
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

function member(id: string) {
  return {
    id,
    recordId: SPINECLEAVER,
    recordSlug: 'goblin-spinecleaver',
    // The engine's one-home Minion predicate, computed server-side.
    isMinion: true,
    // Seeded squad members carry stamina:null — the pool is the one home
    // for squad vitality, so the participant view has no vitals.
    vitals: null,
    conditions: [],
    grants: [],
    ...economyIdle,
  };
}

/** Fixture matching the pinned view contract. Pool math follows the printed
 * formula (4 members × 5 per-minion Stamina = 20; one threshold crossed =
 * one dead member). */
const squadFixture: SquadView = {
  squadId: 'squad-sc',
  name: 'goblin spinecleavers',
  poolCurrent: 12,
  poolMax: 20,
  perMinionStamina: 5,
  livingMemberIds: ['sc1', 'sc2', 'sc3'],
  deadMemberIds: ['sc4'],
  pendingKills: 0,
  captainId: null,
  withCaptain: null,
  withCaptainBenefit: null,
};

const activeEncounter = {
  encounterId,
  status: 'active' as const,
  startedAt: 0,
  viewerIsDirector: true,
  turnState: null,
  villainActions: { usedThisRound: false, usedByAbility: [] },
  resolutions: [],
  occurrences: [],
  participants: [
    {
      id: 'fury',
      recordId: FURY,
      recordSlug: 'fury',
      isMinion: false,
      vitals: null,
      conditions: [],
      grants: [],
      ...economyIdle,
    },
    {
      id: 'goblin-warrior',
      recordId: WARRIOR,
      recordSlug: 'goblin-warrior',
      isMinion: false,
      vitals: {
        staminaCurrent: 15,
        staminaTemporary: 0,
        staminaMax: 15,
        winded: false,
        dying: false,
        dead: false,
        organization: 'Horde',
        recoveriesCurrent: null,
        recoveriesMax: null,
      },
      conditions: [],
      grants: [],
      ...economyIdle,
    },
    member('sc1'),
    member('sc2'),
    member('sc3'),
    member('sc4'),
  ],
  terrainFacts: [],
  squads: [squadFixture],
};

function setScene(view: unknown, gameRole: 'player' | 'director' = 'director') {
  setQuery(api.campaigns.listRoster, { viewer: { gameRole }, members: [] });
  setQuery(api.sessions.getActive, { number: 1 });
  setQuery(api.encounters.getActive, view);
  setQuery(api.encounters.listLog, []);
}

beforeEach(() => {
  queryResults.clear();
  mutationSpies.clear();
});
afterEach(cleanup);

describe('SquadsSection', () => {
  test('squad card: pool, per-minion, member chips, captain verbatim only while attached', () => {
    setScene({
      ...activeEncounter,
      squads: [
        {
          ...squadFixture,
          captainId: 'goblin-warrior',
          withCaptain: SPINECLEAVER_WITH_CAPTAIN,
          withCaptainBenefit: {
            kind: 'strike-damage',
            amount: 1,
            sourceText: SPINECLEAVER_WITH_CAPTAIN,
          },
        },
      ],
    });
    render(<EncounterPanel campaignId={campaignId} />);
    expect(screen.getByText('goblin spinecleavers')).toBeTruthy();
    expect(screen.getByText('12/20')).toBeTruthy();
    expect(screen.getByText('Pool')).toBeTruthy();
    expect(screen.getByText('Per minion')).toBeTruthy();
    // Living chips render plainly; the dead member is visually distinct.
    expect(screen.getByLabelText('sc1 — living')).toBeTruthy();
    const deadChip = screen.getByLabelText('sc4 — dead');
    expect(deadChip.className).toContain('line-through');
    // The captain line carries the verbatim With-Captain pass-through.
    expect(screen.getByText('Captain')).toBeTruthy();
    expect(screen.getByText('With Captain')).toBeTruthy();
    expect(screen.getByText(SPINECLEAVER_WITH_CAPTAIN)).toBeTruthy();
    expect(screen.getByText('Automated live modifier')).toBeTruthy();
    // No pending badge at zero.
    expect(screen.queryByText(/pending kill/)).toBeNull();

    cleanup();
    setScene(activeEncounter); // detached
    render(<EncounterPanel campaignId={campaignId} />);
    // Verbatim text renders only while a captain is attached.
    expect(screen.queryByText('With Captain')).toBeNull();
    expect(screen.queryByText(SPINECLEAVER_WITH_CAPTAIN)).toBeNull();
  });

  test('signature/free-strike picker dispatches the selected participation chips', () => {
    setScene(activeEncounter);
    render(<EncounterPanel campaignId={campaignId} />);
    fireEvent.change(screen.getByLabelText('Ability slug for goblin spinecleavers'), {
      target: { value: 'axe' },
    });
    fireEvent.click(screen.getByLabelText('Attack with sc2 in goblin spinecleavers'));
    fireEvent.click(screen.getByText('Roll signature'));
    expect(spyFor(api.encounters.squadAttack)).toHaveBeenCalledWith({
      campaignId,
      artifactId: SPINECLEAVER,
      abilitySlug: 'axe',
      squadId: 'squad-sc',
      participation: [{ targetId: 'fury', instanceOwner: 'sc1', memberIds: ['sc1', 'sc2'] }],
    });
    cleanup();
    setScene(activeEncounter);
    render(<EncounterPanel campaignId={campaignId} />);
    fireEvent.click(screen.getByLabelText('Attack with sc2 in goblin spinecleavers'));
    fireEvent.click(screen.getByText('Free Strike Together'));
    expect(spyFor(api.encounters.squadFreeStrike)).toHaveBeenCalledWith({
      campaignId,
      squadId: 'squad-sc',
      targetId: 'fury',
      contributions: [
        { memberId: 'sc1', count: 1 },
        { memberId: 'sc2', count: 1 },
      ],
    });
  });

  test('queues multiple target rows in presentation order', () => {
    setScene(activeEncounter);
    render(<EncounterPanel campaignId={campaignId} />);
    fireEvent.change(screen.getByLabelText('Ability slug for goblin spinecleavers'), {
      target: { value: 'axe' },
    });
    fireEvent.click(screen.getByText('Queue target')); // fury ← sc1
    fireEvent.change(screen.getByLabelText('Squad attack target for goblin spinecleavers'), {
      target: { value: 'goblin-warrior' },
    });
    fireEvent.change(screen.getByLabelText('Instance owner for goblin spinecleavers'), {
      target: { value: 'sc3' },
    });
    fireEvent.click(screen.getByText('Roll signature'));
    expect(spyFor(api.encounters.squadAttack)).toHaveBeenCalledWith({
      campaignId,
      artifactId: SPINECLEAVER,
      abilitySlug: 'axe',
      squadId: 'squad-sc',
      participation: [
        { targetId: 'fury', instanceOwner: 'sc1', memberIds: ['sc1'] },
        { targetId: 'goblin-warrior', instanceOwner: 'sc3', memberIds: ['sc3'] },
      ],
    });
  });

  test('attach: candidates exclude squad members and minions; dispatch shape', () => {
    setScene(activeEncounter);
    render(<EncounterPanel campaignId={campaignId} />);
    const picker = screen.getByLabelText('Captain for goblin spinecleavers') as HTMLSelectElement;
    const options = Array.from(picker.options).map((option) => option.value);
    expect(options).toEqual(['fury', 'goblin-warrior']);
    fireEvent.change(picker, { target: { value: 'goblin-warrior' } });
    fireEvent.click(screen.getByText('Attach captain'));
    expect(spyFor(api.encounters.attachCaptain)).toHaveBeenCalledWith({
      campaignId,
      squadId: 'squad-sc',
      captainId: 'goblin-warrior',
    });
  });

  test('detach dispatches; Director-only gating hides controls from players', () => {
    setScene({
      ...activeEncounter,
      squads: [
        { ...squadFixture, captainId: 'goblin-warrior', withCaptain: SPINECLEAVER_WITH_CAPTAIN },
      ],
    });
    render(<EncounterPanel campaignId={campaignId} />);
    fireEvent.click(screen.getByText('Detach'));
    expect(spyFor(api.encounters.detachCaptain)).toHaveBeenCalledWith({
      campaignId,
      squadId: 'squad-sc',
    });

    cleanup();
    setScene(
      {
        ...activeEncounter,
        viewerIsDirector: false,
        squads: [
          {
            ...squadFixture,
            pendingKills: 1,
            captainId: 'goblin-warrior',
            withCaptain: SPINECLEAVER_WITH_CAPTAIN,
          },
        ],
      },
      'player',
    );
    render(<EncounterPanel campaignId={campaignId} />);
    // Everyone sees the card, badge, and verbatim line; only the Director
    // gets the affordances (same gating as terrain-fact clearing).
    expect(screen.getByText('1 pending kill')).toBeTruthy();
    expect(screen.getByText(SPINECLEAVER_WITH_CAPTAIN)).toBeTruthy();
    expect(screen.queryByText('Detach')).toBeNull();
    expect(screen.queryByText('Attach captain')).toBeNull();
    expect(screen.queryByText('Resolve kills')).toBeNull();
  });

  test('resolve-kills picker enforces the exact count and dispatches the named victims', () => {
    setScene({ ...activeEncounter, squads: [{ ...squadFixture, pendingKills: 2 }] });
    render(<EncounterPanel campaignId={campaignId} />);
    expect(screen.getByText('2 pending kills')).toBeTruthy();
    const resolveButton = screen.getByText('Resolve kills').closest('button') as HTMLButtonElement;
    expect(resolveButton.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Victim sc1 in goblin spinecleavers'));
    expect(resolveButton.disabled).toBe(true); // 1/2 named
    fireEvent.click(screen.getByLabelText('Victim sc2 in goblin spinecleavers'));
    // Exactly-that-many: the remaining checkbox locks at the cap.
    expect(
      (screen.getByLabelText('Victim sc3 in goblin spinecleavers') as HTMLInputElement).disabled,
    ).toBe(true);
    expect(resolveButton.disabled).toBe(false);
    fireEvent.click(resolveButton);
    expect(spyFor(api.encounters.resolvePendingKills)).toHaveBeenCalledWith({
      campaignId,
      squadId: 'squad-sc',
      victimMemberIds: ['sc1', 'sc2'],
    });
  });

  test('log: squad damage receipt breakdown and the pending-kill table directive render', () => {
    setScene(activeEncounter);
    setQuery(api.encounters.listLog, [
      {
        entryId: 'log-1',
        seq: 1,
        kind: 'mutation',
        // Engine-composed receipt message (applySquadDamage) — the printed
        // Incinerate worked example: three bound minions, 6 each, area-capped
        // to 5 each = 15 pool damage, three threshold kills.
        message: 'goblin spinecleavers takes 15 pool damage from incinerate',
        canonRefs: [],
        engineActorLabel: 'director',
        data: {
          squadDamage: {
            squadId: 'squad-sc',
            area: true,
            damageType: 'fire',
            contributions: [
              { targetId: 'sc1', damage: 6, counted: 5 },
              { targetId: 'sc2', damage: 6, counted: 5 },
              { targetId: 'sc3', damage: 6, counted: 5 },
            ],
            cappedSum: 15,
            weaknessApplied: false,
            immunityApplied: false,
            fullPoolReduction: 15,
            overflowDiscarded: 0,
            kills: 3,
          },
          squadPoolDeltas: [{ squadId: 'squad-sc', from: 20, to: 5 }],
        },
        actorName: 'owner',
        occurredAt: 0,
      },
      {
        entryId: 'log-2',
        seq: 2,
        kind: 'table-directive',
        // Engine-composed directive (applySquadDamage kill accounting).
        message:
          'name 1 more victim(s) in goblin spinecleavers — "the minions nearest to those taken out suffer the same fate" — then dispatch resolve-pending-kills',
        canonRefs: [],
        engineActorLabel: 'director',
        data: { pendingKillIdentity: { squadId: 'squad-sc', count: 1 } },
        actorName: 'owner',
        occurredAt: 0,
      },
    ]);
    render(<EncounterPanel campaignId={campaignId} />);
    expect(
      screen.getByText('goblin spinecleavers takes 15 pool damage from incinerate'),
    ).toBeTruthy();
    expect(screen.getByText(/pool 20 → 5 · area · 3 kills/)).toBeTruthy();
    // The directive renders as a resolve-at-the-table card, like table-cards.
    expect(screen.getByText('Resolve at the table')).toBeTruthy();
    expect(screen.getByText(/name 1 more victim\(s\) in goblin spinecleavers/)).toBeTruthy();
  });
});
