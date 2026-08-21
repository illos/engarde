import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type FunctionReference, getFunctionName } from 'convex/server';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Render tests with the Convex data layer mocked per query/mutation. The api
// object is a Proxy minting a fresh reference per property access, so maps
// are keyed by getFunctionName, not by reference. A value of Error makes
// useQuery throw into the QueryBoundary, mirroring a server-side
// ConvexError('Campaign not found').
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
    usePaginatedQuery: (ref: Parameters<typeof nameOf>[0]) =>
      queryResults.get(nameOf(ref)) ?? { results: [], status: 'Exhausted', loadMore: vi.fn() },
  };
});

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#mock">{children}</a>,
  useNavigate: () => vi.fn(),
}));

import { CampaignPage } from './CampaignPage';
import { CampaignsPage } from './CampaignsPage';
import { DirectoryPage } from './DirectoryPage';
import { JoinScreen } from './JoinScreen';

const campaignId = 'campaign-1' as Id<'campaigns'>;
const userA = 'user-a' as Id<'users'>;
const userB = 'user-b' as Id<'users'>;

beforeEach(() => {
  queryResults.clear();
  mutationSpies.clear();
});

// No vitest globals in this project, so testing-library's automatic
// cleanup never registers — without this, renders accumulate across tests.
afterEach(cleanup);

describe('JoinScreen', () => {
  const preview = {
    campaignId,
    name: 'The Iron Vow',
    description: 'Oaths and consequences',
    ownerName: 'Rhian',
    memberCount: 3,
    viewerStatus: 'none' as const,
  };

  test('shows the campaign card and requests to join', () => {
    setQuery(api.campaigns.getJoinPreview, preview);
    render(<JoinScreen code="ABCD2345" />);
    expect(screen.getByRole('heading', { name: 'The Iron Vow' })).toBeTruthy();
    expect(screen.getByText('Oaths and consequences')).toBeTruthy();
    expect(screen.getByText('Rhian')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Join this Campaign' }));
    expect(spyFor(api.campaigns.requestToJoin)).toHaveBeenCalledWith({
      code: 'ABCD2345',
    });
  });

  test('pending state shows the badge and cancels the request', () => {
    setQuery(api.campaigns.getJoinPreview, { ...preview, viewerStatus: 'pending' });
    render(<JoinScreen code="ABCD2345" />);
    expect(screen.getByText(/Pending — awaiting approval/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    expect(spyFor(api.campaigns.cancelJoinRequest)).toHaveBeenCalledWith({
      campaignId,
    });
  });

  test('a failed lookup renders not-found instead of crashing', () => {
    setQuery(api.campaigns.getJoinPreview, new Error('Campaign not found'));
    render(<JoinScreen code="WRONGCOD" />);
    expect(screen.getByRole('heading', { name: 'Campaign not found' })).toBeTruthy();
  });
});

describe('CampaignsPage', () => {
  test('lists joined and pending campaigns with badges', () => {
    setQuery(api.campaigns.listMine, [
      {
        campaignId,
        name: 'The Iron Vow',
        description: '',
        status: 'active',
        role: 'director',
        isOwner: true,
      },
      {
        campaignId: 'campaign-2' as Id<'campaigns'>,
        name: 'Sunken Halls',
        description: '',
        status: 'pending',
        role: 'player',
        isOwner: false,
      },
    ]);
    render(<CampaignsPage />);
    expect(screen.getByText('The Iron Vow')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(screen.getByText('director')).toBeTruthy();
    expect(screen.getByText('Sunken Halls')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeTruthy();
  });
});

describe('CampaignPage', () => {
  const ownerRoster = {
    viewer: { role: 'director' as const, isOwner: true },
    members: [
      { userId: userA, displayName: 'Rhian', handle: 'rhian', role: 'director', isOwner: true },
      { userId: userB, displayName: 'Bren', handle: 'bren', role: 'player', isOwner: false },
    ],
    pending: [
      { userId: 'user-c' as Id<'users'>, displayName: 'Cael', handle: 'cael', requestedAt: 1 },
    ],
    blocked: [],
  };

  test('owner sees roster, join requests, and the settings card', () => {
    setQuery(api.campaigns.listRoster, ownerRoster);
    setQuery(api.campaigns.getSettings, {
      campaignId,
      name: 'The Iron Vow',
      description: '',
      visibility: 'private',
      joinCode: 'ABCD2345',
    });
    render(<CampaignPage campaignId={campaignId} />);
    expect(screen.getByText('Rhian')).toBeTruthy();
    expect(screen.getByText('Cael')).toBeTruthy();
    expect(screen.getByText('Campaign settings')).toBeTruthy();
    expect(screen.getByText('ABCD2345')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(spyFor(api.campaigns.approveRequest)).toHaveBeenCalledWith({
      campaignId,
      targetUserId: 'user-c',
    });
    fireEvent.click(screen.getByRole('button', { name: 'List publicly' }));
    expect(spyFor(api.campaigns.setVisibility)).toHaveBeenCalledWith({
      campaignId,
      visibility: 'public',
    });
  });

  test('an owner who handed off director can reclaim it from their own row', () => {
    setQuery(api.campaigns.listRoster, {
      viewer: { role: 'player' as const, isOwner: true },
      members: [
        { userId: userA, displayName: 'Rhian', handle: 'rhian', role: 'player', isOwner: true },
        { userId: userB, displayName: 'Bren', handle: 'bren', role: 'director', isOwner: false },
      ],
      pending: [],
      blocked: [],
    });
    setQuery(api.campaigns.getSettings, {
      campaignId,
      name: 'The Iron Vow',
      description: '',
      visibility: 'private',
      joinCode: 'ABCD2345',
    });
    render(<CampaignPage campaignId={campaignId} />);
    // One Make Director button: the owner's own row (Bren already holds it).
    fireEvent.click(screen.getByRole('button', { name: 'Make Director' }));
    expect(spyFor(api.campaigns.setDirector)).toHaveBeenCalledWith({
      campaignId,
      targetUserId: userA,
    });
    // Remove/Block never render on the owner's own row.
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Block' })).toHaveLength(1);
  });

  test('a plain member sees the roster and leave, not the owner console', () => {
    setQuery(api.campaigns.listRoster, {
      viewer: { role: 'player' as const, isOwner: false },
      members: ownerRoster.members,
    });
    render(<CampaignPage campaignId={campaignId} />);
    expect(screen.getByText('Bren')).toBeTruthy();
    expect(screen.queryByText('Campaign settings')).toBeNull();
    expect(screen.queryByText('Join requests')).toBeNull();
    expect(screen.getByRole('button', { name: 'Leave campaign' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Make Director' })).toBeNull();
  });
});

describe('DirectoryPage', () => {
  test('lists public campaigns', () => {
    setQuery(api.campaigns.listDirectory, {
      results: [
        {
          campaignId,
          name: 'Open Table',
          description: 'Drop-in friendly',
          ownerName: 'Rhian',
          memberCount: 4,
        },
      ],
      status: 'Exhausted',
      loadMore: vi.fn(),
    });
    render(<DirectoryPage />);
    expect(screen.getByText('Open Table')).toBeTruthy();
    expect(screen.getByText('Drop-in friendly')).toBeTruthy();
    expect(screen.getByText(/4 members/)).toBeTruthy();
  });
});
