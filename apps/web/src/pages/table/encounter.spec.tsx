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

function setRoster(gameRole: 'player' | 'director') {
  setQuery(api.campaigns.listRoster, { viewer: { gameRole }, members: [] });
}

function setSessionActive() {
  setQuery(api.sessions.getActive, { number: 1 });
}

const activeEncounter = {
  encounterId,
  status: 'active' as const,
  startedAt: 0,
  viewerIsDirector: true,
  participants: [
    {
      id: 'fury',
      recordId: FURY,
      recordSlug: 'fury',
      conditions: [],
    },
    {
      id: 'censor',
      recordId: 'mcdm.heroes.v1/class/censor',
      recordSlug: 'censor',
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
    },
  ],
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
      { artifactId: FURY, slug: 'fury', parsedTiers: [], residueSpans: 3 },
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
        actorName: 'owner',
        occurredAt: 0,
      },
    ]);
    render(<EncounterPanel campaignId={campaignId} />);
    expect(screen.getByText('bleeding')).toBeTruthy();
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
        residueSpans: 1,
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

    fireEvent.change(screen.getByLabelText('Search canon records'), {
      target: { value: 'blood' },
    });
    fireEvent.click(screen.getByText('Pick'));
    fireEvent.change(screen.getByLabelText('Target participant'), {
      target: { value: 'censor' },
    });
    fireEvent.click(screen.getByText('Use'));
    expect(spyFor(api.encounters.useAbility)).toHaveBeenCalledWith({
      campaignId,
      artifactId: BFB,
      band: '≤11',
      actorParticipantId: 'fury',
      targetParticipantId: 'censor',
    });
  });
});
