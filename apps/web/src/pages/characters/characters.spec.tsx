import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type FunctionReference, getFunctionName } from 'convex/server';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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
    useQuery: (ref: Parameters<typeof nameOf>[0]) => queryResults.get(nameOf(ref)),
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

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#mock">{children}</a>,
}));

import { CharactersPage } from './CharactersPage';

const campaignId = 'campaign-1' as Id<'campaigns'>;
const characterId = 'character-1' as Id<'characters'>;

const campaignCards = [
  {
    campaignId,
    name: 'Morrowind',
    description: '',
    status: 'active' as const,
    role: 'player' as const,
    isOwner: false,
  },
];

beforeEach(() => {
  queryResults.clear();
  mutationSpies.clear();
  setQuery(api.campaigns.listMine, campaignCards);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CharactersPage', () => {
  test('creates a level-one character and optionally submits it to a campaign', () => {
    setQuery(api.characters.listMine, []);
    render(<CharactersPage />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Nerevar' } });
    fireEvent.change(screen.getByLabelText('Concept'), {
      target: { value: 'A returned hero' },
    });
    fireEvent.change(screen.getByLabelText('Campaign'), { target: { value: campaignId } });
    fireEvent.click(screen.getByRole('button', { name: 'Create character' }));
    expect(spyFor(api.characters.create)).toHaveBeenCalledWith({
      name: 'Nerevar',
      concept: 'A returned hero',
      campaignId,
    });
  });

  test('lists multiple characters and submits an unbound one', () => {
    setQuery(api.characters.listMine, [
      { characterId, name: 'Vivec', concept: 'Poet warrior', level: 1, binding: null },
      {
        characterId: 'character-2' as Id<'characters'>,
        name: 'Almalexia',
        concept: '',
        level: 3,
        binding: { campaignId, campaignName: 'Morrowind', status: 'active' as const },
      },
    ]);
    render(<CharactersPage />);
    expect(screen.getByText('Vivec')).toBeTruthy();
    expect(screen.getByText('Almalexia')).toBeTruthy();
    expect(screen.getByText('Level 3')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Campaign for Vivec'), {
      target: { value: campaignId },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(spyFor(api.characters.submit)).toHaveBeenCalledWith({ characterId, campaignId });
  });

  test('offers owner-controlled withdrawal and removal actions', () => {
    setQuery(api.characters.listMine, [
      {
        characterId,
        name: 'Jiub',
        concept: '',
        level: 1,
        binding: { campaignId, campaignName: 'Morrowind', status: 'pending' as const },
      },
    ]);
    const { unmount } = render(<CharactersPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw submission' }));
    expect(spyFor(api.characters.withdraw)).toHaveBeenCalledWith({ characterId });

    unmount();
    setQuery(api.characters.listMine, [
      {
        characterId,
        name: 'Jiub',
        concept: '',
        level: 1,
        binding: { campaignId, campaignName: 'Morrowind', status: 'active' as const },
      },
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CharactersPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove from campaign' }));
    expect(spyFor(api.characters.removeFromCampaign)).toHaveBeenCalledWith({ characterId });
  });
});
