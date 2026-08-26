import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type FunctionReference, getFunctionName } from 'convex/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Same mocking scheme as table.spec.tsx: the Convex data layer is mocked per
// function name.
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

/** Real corpus ids only (prime directive). */
const BLEEDING = 'mcdm.heroes.v1/condition/bleeding';
const BFB = 'mcdm.heroes.v1/feature.ability.fury.level-1/blood-for-blood';
const FURY = 'mcdm.heroes.v1/class/fury';
const WODE_SENTRY = 'mcdm.monsters.v1/monster.elf-wode.statblock/wode-elf-sentry';
const WORDS = 'mcdm.heroes.v1/feature.ability.conduit.level-3/words-of-wrath-and-grace';
const PILLAR = 'mcdm.monsters.v1/dynamic-terrain.mechanisms/pillar';

function setRoster(gameRole: 'player' | 'director') {
  setQuery(api.campaigns.listRoster, { viewer: { gameRole }, members: [] });
}

function setSessionActive() {
  setQuery(api.sessions.getActive, { number: 1 });
}

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

const activeEncounter = {
  encounterId,
  status: 'active' as const,
  startedAt: 0,
  viewerIsDirector: true,
  turnState: null,
  villainActions: { usedThisRound: false, usedByAbility: [] },
  resolutions: [],
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
      id: 'censor',
      recordId: 'mcdm.heroes.v1/class/censor',
      recordSlug: 'censor',
      isMinion: false,
      vitals: {
        staminaCurrent: 9,
        staminaTemporary: 0,
        staminaMax: 15,
        winded: false,
        dying: false,
        dead: false,
        organization: null,
        recoveriesCurrent: 7,
        recoveriesMax: 8,
      },
      conditions: [
        {
          instanceId: `${BLEEDING}#d1`,
          conditionId: BLEEDING,
          conditionSlug: 'bleeding',
          ending: 'save-ends' as const,
          sourceParticipantId: 'fury',
          sourceRecordSlug: 'blood-for-blood',
        },
      ],
      grants: [
        {
          grantId: 'mcdm.monsters.v1/monster.goblin.statblock/skitterling#d2-censor',
          polarity: 'bane' as const,
          scope: 'strike' as const,
          direction: 'outbound' as const,
          window: null,
          sourceParticipantId: 'fury',
          sourceRecordSlug: 'skitterling',
        },
      ],
      ...economyIdle,
    },
  ],
  terrainFacts: [],
  squads: [],
};

beforeEach(() => {
  queryResults.clear();
  mutationSpies.clear();
});
afterEach(cleanup);

describe('EncounterPanel', () => {
  test('renders nothing without a session, waiting text for players', () => {
    setRoster('player');
    setQuery(api.sessions.getActive, null);
    setQuery(api.encounters.getActive, null);
    const { container } = render(<EncounterPanel campaignId={campaignId} />);
    expect(container.textContent).toBe('');

    setSessionActive();
    render(<EncounterPanel campaignId={campaignId} />);
    expect(screen.getByText('The Director sets the field.')).toBeTruthy();
  });

  test('Director start flow: search, add, start with picked participants', () => {
    setRoster('director');
    setSessionActive();
    setQuery(api.encounters.getActive, null);
    setQuery(api.encounters.searchRecords, [
      {
        artifactId: FURY,
        slug: 'fury',
        parsedTiers: [],
        residueSpans: 3,
        effects: [],
        autoRollable: false,
        hasStats: false,
      },
    ]);
    render(<EncounterPanel campaignId={campaignId} />);
    fireEvent.change(screen.getByLabelText('Search canon records'), {
      target: { value: 'fury' },
    });
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Start encounter'));
    expect(spyFor(api.encounters.start)).toHaveBeenCalledWith({
      campaignId,
      participants: [{ id: 'fury', recordId: FURY }],
    });
  });

  test('active encounter: conditions render, end turn asserts typed rolls', () => {
    setRoster('director');
    setSessionActive();
    setQuery(api.encounters.getActive, activeEncounter);
    setQuery(api.encounters.listLog, [
      {
        entryId: 'log-1',
        seq: 1,
        kind: 'table-card',
        message: '**Effect:** verbatim card text',
        canonRefs: [BFB],
        engineActorLabel: null,
        data: null,
        actorName: 'owner',
        occurredAt: 0,
      },
    ]);
    render(<EncounterPanel campaignId={campaignId} />);
    expect(screen.getByText('bleeding')).toBeTruthy();
    // Pending next-roll grants render on the holder's card [R-0012..R-0016].
    expect(screen.getByText(/pending:\s*bane on their next strike/)).toBeTruthy();
    expect(screen.getByText('Resolve at the table')).toBeTruthy();
    expect(screen.getByText('**Effect:** verbatim card text')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Saving throw roll for bleeding'), {
      target: { value: '7' },
    });
    const endTurnButtons = screen.getAllByText('End turn');
    fireEvent.click(endTurnButtons[1] as HTMLElement); // censor's card
    expect(spyFor(api.encounters.endTurn)).toHaveBeenCalledWith({
      campaignId,
      participantId: 'censor',
      rolls: { [`${BLEEDING}#d1`]: 7 },
    });
  });

  test('remove as imposer for non-directors; ability use dispatches picked tier', async () => {
    setRoster('player');
    setSessionActive();
    setQuery(api.encounters.getActive, { ...activeEncounter, viewerIsDirector: false });
    setQuery(api.encounters.listLog, []);
    setQuery(api.encounters.searchRecords, [
      {
        artifactId: BFB,
        slug: 'blood-for-blood',
        parsedTiers: ['≤11', '12-16', '17+'],
        residueSpans: 0,
        effects: [
          {
            effectOrdinal: 1,
            sourceText:
              'You can deal 1d6 damage to yourself to deal an extra 1d6 damage to the target.',
            resolutionKind: 'table',
          },
        ],
        autoRollable: true,
        hasStats: false,
      },
    ]);
    render(<EncounterPanel campaignId={campaignId} />);
    fireEvent.click(screen.getByText('Remove'));
    expect(spyFor(api.encounters.removeCondition)).toHaveBeenCalledWith({
      campaignId,
      targetParticipantId: 'censor',
      instanceId: `${BLEEDING}#d1`,
      asParticipantId: 'fury',
    });
    // Let the pending remove settle so the shared busy guard releases.
    await act(() => Promise.resolve());

    fireEvent.change(screen.getByLabelText('Search abilities'), {
      target: { value: 'blood' },
    });
    fireEvent.click(screen.getByText('Pick'));
    fireEvent.change(screen.getByLabelText('Target participant'), {
      target: { value: 'censor' },
    });
    // Auto-rollable abilities roll by default — dice as input, engine-resolved.
    fireEvent.click(screen.getByText('Roll'));
    expect(spyFor(api.encounters.useAbility)).toHaveBeenCalledWith({
      campaignId,
      artifactId: BFB,
      actorParticipantId: 'fury',
      targetParticipantIds: ['censor'],
      dice: undefined,
      edges: 0,
      banes: 0,
      knockOut: undefined,
    });
    await act(() => Promise.resolve());

    // The manual override: assert a tier instead of rolling.
    fireEvent.click(screen.getByText('assert a tier instead'));
    fireEvent.click(screen.getByText('Use (asserted tier)'));
    expect(spyFor(api.encounters.useAbility)).toHaveBeenLastCalledWith({
      campaignId,
      artifactId: BFB,
      band: '≤11',
      actorParticipantId: 'fury',
      targetParticipantIds: ['censor'],
    });
    await act(() => Promise.resolve());

    fireEvent.change(screen.getByLabelText('Search effects'), {
      target: { value: 'blood' },
    });
    fireEvent.click(screen.getByText('Pick Effect'));
    expect(
      screen.getByText(
        'You can deal 1d6 damage to yourself to deal an extra 1d6 damage to the target.',
      ),
    ).toBeTruthy();
    expect((screen.getByLabelText('Effect target censor') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByText('Resolve Effect'));
    expect(spyFor(api.encounters.useEffect)).toHaveBeenCalledWith({
      campaignId,
      artifactId: BFB,
      effectOrdinal: 1,
      actorParticipantId: 'fury',
      targetParticipantIds: ['censor'],
    });
  });

  test('automatic damage Effect dispatches several targets and the knockout choice', () => {
    setRoster('player');
    setSessionActive();
    setQuery(api.encounters.getActive, { ...activeEncounter, viewerIsDirector: false });
    setQuery(api.encounters.listLog, []);
    setQuery(api.encounters.searchRecords, [
      {
        artifactId: WODE_SENTRY,
        slug: 'wode-elf-sentry',
        parsedTiers: [],
        residueSpans: 0,
        effects: [
          {
            effectOrdinal: 2,
            sourceText: 'Each target takes 3 damage.',
            resolutionKind: 'damage',
          },
        ],
        autoRollable: false,
        hasStats: true,
      },
    ]);
    render(<EncounterPanel campaignId={campaignId} />);

    fireEvent.change(screen.getByLabelText('Search effects'), {
      target: { value: 'wode' },
    });
    fireEvent.click(screen.getByText('Pick Effect'));
    fireEvent.click(screen.getByLabelText('Effect target fury'));
    fireEvent.click(screen.getByLabelText('Knock out with Effect damage'));
    fireEvent.click(screen.getByText('Resolve Effect'));

    expect(spyFor(api.encounters.useEffect)).toHaveBeenCalledWith({
      campaignId,
      artifactId: WODE_SENTRY,
      effectOrdinal: 2,
      actorParticipantId: 'fury',
      targetParticipantIds: ['censor', 'fury'],
      knockOut: true,
    });
  });

  test('vitals render: Stamina bar, table-mode note, and the roll breakdown log card', () => {
    setRoster('director');
    setSessionActive();
    setQuery(api.encounters.getActive, {
      ...activeEncounter,
      participants: [
        ...activeEncounter.participants,
        {
          // Tracked Stamina but untracked Recoveries [R-0019b]: null is
          // omitted, never displayed as zero.
          id: 'wode-elf-sentry',
          recordId: WODE_SENTRY,
          recordSlug: 'wode-elf-sentry',
          isMinion: false,
          vitals: {
            staminaCurrent: 10,
            staminaTemporary: 0,
            staminaMax: 10,
            winded: false,
            dying: false,
            dead: false,
            organization: null,
            recoveriesCurrent: null,
            recoveriesMax: null,
          },
          conditions: [],
          grants: [],
          ...economyIdle,
        },
      ],
    });
    setQuery(api.encounters.listLog, [
      {
        entryId: 'log-2',
        seq: 2,
        kind: 'informational',
        message: 'fury rolls blood-for-blood: 6+5+2 (M) → total 13, tier 2',
        canonRefs: [BFB],
        engineActorLabel: 'fury',
        data: {
          powerRoll: {
            dice: [6, 5],
            diceAsserted: false,
            characteristicValue: 2,
            characteristicLabel: 'M',
            edges: 1,
            banes: 0,
            resolution: { total: 13, tier: 2, naturalTopEnd: false },
          },
        },
        actorName: 'owner',
        occurredAt: 0,
      },
    ]);
    render(<EncounterPanel campaignId={campaignId} />);
    // censor has vitals; fury is a table-mode record.
    expect(screen.getByText('9/15')).toBeTruthy();
    expect(screen.getByText('Table mode — no stat automation for this record')).toBeTruthy();
    // Recoveries show when tracked [R-0018]; the sentry's null pool renders
    // nothing — exactly one Recoveries line despite two vitals cards.
    expect(screen.getByText('7/8')).toBeTruthy();
    expect(screen.getAllByText('Recoveries')).toHaveLength(1);
    // The persisted breakdown renders as a receipt.
    expect(screen.getByText(/total 13 → tier 2/)).toBeTruthy();
  });

  test('terrain facts render attributed; clearing is a Director-only affordance', () => {
    const fact = {
      factId: `${PILLAR}#d3-pillar-effect-2-terrain`,
      terrain: 'difficult' as const,
      areaText: '4 x 1 line within 1',
      sourceRecordSlug: 'pillar',
      createdBy: 'fury',
    };
    setRoster('player');
    setSessionActive();
    setQuery(api.encounters.getActive, {
      ...activeEncounter,
      viewerIsDirector: false,
      terrainFacts: [fact],
    });
    setQuery(api.encounters.listLog, []);
    render(<EncounterPanel campaignId={campaignId} />);
    // The fact is visible to everyone [R-0022], attributed to its source.
    expect(screen.getByText('difficult terrain')).toBeTruthy();
    expect(screen.getByText(/\(4 x 1 line within 1\)\s*· pillar\s*· from fury/)).toBeTruthy();
    // No clear affordance for non-directors.
    expect(screen.queryByText('Clear')).toBeNull();

    cleanup();
    setRoster('director');
    setQuery(api.encounters.getActive, { ...activeEncounter, terrainFacts: [fact] });
    render(<EncounterPanel campaignId={campaignId} />);
    fireEvent.change(screen.getByLabelText(`Reason for clearing ${fact.factId}`), {
      target: { value: 'rubble hauled away' },
    });
    fireEvent.click(screen.getByText('Clear'));
    expect(spyFor(api.encounters.clearTerrainFact)).toHaveBeenCalledWith({
      campaignId,
      factId: fact.factId,
      reason: 'rubble hauled away',
    });
  });

  test('spend-recovery Effect: every bound target answers, declines included', () => {
    setRoster('player');
    setSessionActive();
    setQuery(api.encounters.getActive, { ...activeEncounter, viewerIsDirector: false });
    setQuery(api.encounters.listLog, []);
    setQuery(api.encounters.searchRecords, [
      {
        artifactId: WORDS,
        slug: 'words-of-wrath-and-grace',
        parsedTiers: ['≤11', '12-16', '17+'],
        residueSpans: 0,
        effects: [
          {
            effectOrdinal: 1,
            sourceText:
              'Each ally in the area can spend a [Recovery](scc.v1:mcdm.heroes.v1/rule.health/recoveries).',
            resolutionKind: 'spend-recovery',
          },
        ],
        autoRollable: true,
        hasStats: false,
      },
    ]);
    render(<EncounterPanel campaignId={campaignId} />);

    fireEvent.change(screen.getByLabelText('Search effects'), {
      target: { value: 'words' },
    });
    fireEvent.click(screen.getByText('Pick Effect'));
    // censor is bound by default; bind fury too, then decline censor's offer.
    fireEvent.click(screen.getByLabelText('Effect target fury'));
    expect((screen.getByLabelText('censor spends a Recovery') as HTMLInputElement).checked).toBe(
      true,
    );
    fireEvent.click(screen.getByLabelText('censor spends a Recovery'));
    fireEvent.click(screen.getByText('Resolve Effect'));

    expect(spyFor(api.encounters.useEffect)).toHaveBeenCalledWith({
      campaignId,
      artifactId: WORDS,
      effectOrdinal: 1,
      actorParticipantId: 'fury',
      targetParticipantIds: ['censor', 'fury'],
      recoverySpends: { censor: false, fury: true },
    });
  });
});
