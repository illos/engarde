import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type FunctionReference, getFunctionName } from 'convex/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Same mocking scheme as campaigns.spec.tsx: the Convex data layer is mocked
// per function name; Error values throw into the QueryBoundary.
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

import { TablePage } from './TablePage';

const campaignId = 'campaign-1' as Id<'campaigns'>;
const userA = 'user-a' as Id<'users'>;
const userB = 'user-b' as Id<'users'>;

const players = [
  {
    userId: userA,
    displayName: 'Rhian',
    handle: 'rhian',
    role: 'director' as const,
    isOwner: true,
    joinedAt: 1_000,
  },
  {
    userId: userB,
    displayName: 'Sefa',
    handle: 'sefa',
    role: 'player' as const,
    isOwner: false,
    joinedAt: 2_000,
  },
];

const sentAt = new Date(2026, 7, 21, 19, 30).getTime();
const messages = [
  {
    messageId: 'message-1' as Id<'lobbyMessages'>,
    authorUserId: userB,
    authorName: 'Sefa',
    authorHandle: 'sefa',
    body: 'Ready when you are.',
    sentAt,
  },
];

beforeEach(() => {
  queryResults.clear();
  mutationSpies.clear();
});

afterEach(cleanup);

describe('TablePage', () => {
  test('joins the lobby on mount and leaves on unmount', () => {
    setQuery(api.lobby.listPresent, players);
    setQuery(api.lobby.listMessages, []);
    const { unmount } = render(<TablePage campaignId={campaignId} />);
    expect(spyFor(api.lobby.join)).toHaveBeenCalledWith({ campaignId });
    expect(spyFor(api.lobby.leave)).not.toHaveBeenCalled();
    unmount();
    expect(spyFor(api.lobby.leave)).toHaveBeenCalledWith({ campaignId });
  });

  test('lists the players at the table with the director badged', () => {
    setQuery(api.lobby.listPresent, players);
    setQuery(api.lobby.listMessages, []);
    render(<TablePage campaignId={campaignId} />);
    expect(screen.getByText('Rhian')).toBeTruthy();
    expect(screen.getByText('@sefa')).toBeTruthy();
    expect(screen.getByText('Director')).toBeTruthy();
    expect(screen.getByText('No messages yet — say hello.')).toBeTruthy();
  });

  test('shows messages tagged with author and time', () => {
    setQuery(api.lobby.listPresent, players);
    setQuery(api.lobby.listMessages, messages);
    render(<TablePage campaignId={campaignId} />);
    expect(screen.getByText('Ready when you are.')).toBeTruthy();
    // Author name appears in the message header (and again in the roster).
    expect(screen.getAllByText('Sefa').length).toBeGreaterThanOrEqual(2);
    const expectedTime = new Date(sentAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(screen.getByText(expectedTime)).toBeTruthy();
  });

  test('sends the trimmed draft and clears the input', () => {
    setQuery(api.lobby.listPresent, players);
    setQuery(api.lobby.listMessages, []);
    render(<TablePage campaignId={campaignId} />);
    const input = screen.getByLabelText('Message') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  hello table  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(spyFor(api.lobby.sendMessage)).toHaveBeenCalledWith({
      campaignId,
      body: 'hello table',
    });
    expect(input.value).toBe('');
  });

  test('an empty draft is not sent', () => {
    setQuery(api.lobby.listPresent, players);
    setQuery(api.lobby.listMessages, []);
    render(<TablePage campaignId={campaignId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(spyFor(api.lobby.sendMessage)).not.toHaveBeenCalled();
  });

  test('the Director selects a durable starting roster and starts the session', () => {
    const characterId = 'character-1' as Id<'characters'>;
    setQuery(api.lobby.listPresent, players);
    setQuery(api.lobby.listMessages, []);
    setQuery(api.sessions.getActive, null);
    setQuery(api.sessions.listControlGrants, []);
    setQuery(api.characters.listForCampaign, {
      viewer: { userId: userA, isOwner: true, canAdminister: true },
      characters: [
        {
          characterId,
          ownerUserId: userA,
          name: 'Nerevar',
          concept: '',
          level: 1,
          status: 'active',
          isMine: true,
        },
      ],
    });
    setQuery(api.campaigns.listRoster, {
      viewer: {
        gameRole: 'director',
        campaignAccess: 'admin',
        isOwner: true,
        canAdminister: true,
      },
      members: [],
      pending: [],
      blocked: [],
    });
    render(<TablePage campaignId={campaignId} />);
    fireEvent.click(screen.getByLabelText('Nerevar'));
    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
    expect(spyFor(api.sessions.start)).toHaveBeenCalledWith({
      campaignId,
      characterIds: [characterId],
    });
  });

  test('lists completed sessions newest first', () => {
    const firstStartedAt = new Date(2026, 7, 20, 18, 0).getTime();
    const firstEndedAt = new Date(2026, 7, 20, 20, 0).getTime();
    const secondStartedAt = new Date(2026, 7, 21, 19, 0).getTime();
    const secondEndedAt = new Date(2026, 7, 21, 21, 30).getTime();
    setQuery(api.lobby.listPresent, players);
    setQuery(api.lobby.listMessages, []);
    setQuery(api.sessions.listHistory, [
      {
        sessionId: 'session-2' as Id<'sessions'>,
        number: 2,
        startedAt: secondStartedAt,
        startedByUserId: userA,
        endedAt: secondEndedAt,
        endedByUserId: userA,
      },
      {
        sessionId: 'session-1' as Id<'sessions'>,
        number: 1,
        startedAt: firstStartedAt,
        startedByUserId: userA,
        endedAt: firstEndedAt,
        endedByUserId: userA,
      },
    ]);
    render(<TablePage campaignId={campaignId} />);

    expect(screen.getByRole('heading', { name: 'Session history' })).toBeTruthy();
    const entries = screen.getAllByRole('listitem');
    const historyEntries = entries.filter((entry) => entry.textContent?.startsWith('Session '));
    expect(historyEntries.map((entry) => entry.textContent)).toEqual([
      expect.stringContaining('Session 2'),
      expect.stringContaining('Session 1'),
    ]);
  });

  test('a failing lobby query renders the not-found fallback', () => {
    setQuery(api.lobby.listPresent, new Error('Campaign not found'));
    setQuery(api.lobby.listMessages, []);
    render(<TablePage campaignId={campaignId} />);
    expect(screen.getByRole('heading', { name: 'Campaign not found' })).toBeTruthy();
  });

  test('an operational query failure is not mislabeled as campaign not-found', () => {
    setQuery(api.lobby.listPresent, new Error('Network request failed'));
    setQuery(api.lobby.listMessages, []);
    render(<TablePage campaignId={campaignId} />);
    expect(screen.getByRole('heading', { name: 'Unable to load this page' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Campaign not found' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
