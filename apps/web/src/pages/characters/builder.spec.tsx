import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { projectDecisions } from '@engarde/canon/hero-document';
import { unansweredKeys } from '@engarde/canon/hero-overlay-fury';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type FunctionReference, getFunctionName } from 'convex/server';
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

import { BuilderPage } from './BuilderPage';

const characterId = 'character-1' as Id<'characters'>;
const FURY = 'mcdm.heroes.v1/class/fury';
const ASPECT_BERSERKER = 'mcdm.heroes.v1/feature.fury.level-1/primordial-aspect#berserker';

type Entry = Parameters<typeof projectDecisions>[0][number];

function viewOf(decisions: Entry[]) {
  const projection = projectDecisions(decisions);
  return {
    characterId,
    name: 'Khorva',
    concept: '',
    level: projection.level,
    build: { decisions, selections: projection.selections },
    runtime: { schemaVersion: 1, vitals: {}, resources: {}, counters: {}, formState: {} },
    projection,
    unanswered: unansweredKeys(projection),
  };
}

function entry(seq: number, action: Entry['action']): Entry {
  return { seq, action, atLevel: 1, provenance: 'wizard', at: 0, divergence: null };
}

beforeEach(() => {
  queryResults.clear();
  mutationSpies.clear();
  queryResults.set(getFunctionName(api.heroBuild.records), [null]);
});
afterEach(cleanup);

describe('BuilderPage (Fury L1 wizard)', () => {
  test('empty character: class step open, pillar gaps rendered EXPLICITLY, gated steps hidden', () => {
    setQuery(api.heroBuild.get, viewOf([]));
    render(<BuilderPage characterId={characterId} />);
    // Class option present.
    expect(screen.getByRole('button', { name: /Fury/ })).toBeTruthy();
    // The unseeded pillars are visible open gaps — not completed steps, not
    // empty drawers.
    expect(screen.getAllByText('open gap').length).toBe(4);
    expect(screen.getAllByText(/No overlay seeded/).length).toBeGreaterThan(0);
    // Aspect-gated steps (kit, characteristics) are not reachable yet.
    expect(screen.queryByText('Kit')).toBeNull();
    expect(screen.queryByText('Starting characteristics')).toBeNull();
  });

  test('choosing the class appends a set-pillar decision', () => {
    setQuery(api.heroBuild.get, viewOf([]));
    render(<BuilderPage characterId={characterId} />);
    fireEvent.click(screen.getByRole('button', { name: /Fury/ }));
    expect(spyFor(api.heroBuild.append)).toHaveBeenCalledWith({
      characterId,
      action: { kind: 'set-pillar', pillar: 'class', value: FURY },
    });
  });

  test('with the class set: characteristics spreads render from the printed arrays', () => {
    setQuery(
      api.heroBuild.get,
      viewOf([entry(0, { kind: 'set-pillar', pillar: 'class', value: FURY })]),
    );
    render(<BuilderPage characterId={characterId} />);
    expect(screen.getByText('Starting characteristics')).toBeTruthy();
    // The [1,0,0] array has exactly 3 distinct assignments; [2,-1,-1] has 3;
    // [1,1,-1] has 3 → 9 spread buttons.
    const spreads = screen
      .getAllByRole('button')
      .filter((button) => /R -?\d · I -?\d · P -?\d/.test(button.textContent ?? ''));
    expect(spreads).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: 'R 2 · I -1 · P -1' }));
    expect(spyFor(api.heroBuild.append)).toHaveBeenCalledWith({
      characterId,
      action: {
        kind: 'set-characteristics',
        assignment: { might: 2, agility: 2, reason: 2, intuition: -1, presence: -1 },
      },
    });
  });

  test('aspect choice appends the subclass pillar and unlocks the aspect kit pool', () => {
    setQuery(
      api.heroBuild.get,
      viewOf([entry(0, { kind: 'set-pillar', pillar: 'class', value: FURY })]),
    );
    render(<BuilderPage characterId={characterId} />);
    fireEvent.click(screen.getByRole('button', { name: /Berserker/ }));
    expect(spyFor(api.heroBuild.append)).toHaveBeenCalledWith({
      characterId,
      action: { kind: 'set-pillar', pillar: 'subclass', value: ASPECT_BERSERKER },
    });
    cleanup();
    // Berserker chosen → the standard-kit step is reachable (21 options),
    // marked respite-changeable; Beast Shape stays hidden.
    setQuery(
      api.heroBuild.get,
      viewOf([
        entry(0, { kind: 'set-pillar', pillar: 'class', value: FURY }),
        entry(1, { kind: 'set-pillar', pillar: 'subclass', value: ASPECT_BERSERKER }),
      ]),
    );
    render(<BuilderPage characterId={characterId} />);
    expect(screen.getByText('Kit')).toBeTruthy();
    expect(screen.queryByText(/Beast Shape/)).toBeNull();
    expect(screen.getAllByText('changeable at a respite').length).toBe(1);
    expect(screen.getByRole('button', { name: /Panther/ })).toBeTruthy();
  });

  test('the two-skill pick toggles up to its cardinality, one decision per click', () => {
    setQuery(
      api.heroBuild.get,
      viewOf([
        entry(0, { kind: 'set-pillar', pillar: 'class', value: FURY }),
        entry(1, {
          kind: 'select',
          key: `${FURY}#skills-2`,
          payload: {
            kind: 'pick',
            selected: ['mcdm.heroes.v1/skill.exploration/climb'],
            origin: 'player',
          },
        }),
      ]),
    );
    render(<BuilderPage characterId={characterId} />);
    fireEvent.click(screen.getByRole('button', { name: /Alertness/ }));
    expect(spyFor(api.heroBuild.append)).toHaveBeenCalledWith({
      characterId,
      action: {
        kind: 'select',
        key: `${FURY}#skills-2`,
        payload: {
          kind: 'pick',
          selected: [
            'mcdm.heroes.v1/skill.exploration/climb',
            'mcdm.heroes.v1/skill.intrigue/alertness',
          ],
          origin: 'player',
        },
      },
    });
  });

  test('undo reverts by truncation (keepCount = length − 1)', () => {
    setQuery(
      api.heroBuild.get,
      viewOf([entry(0, { kind: 'set-pillar', pillar: 'class', value: FURY })]),
    );
    render(<BuilderPage characterId={characterId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo last decision' }));
    expect(spyFor(api.heroBuild.revert)).toHaveBeenCalledWith({ characterId, keepCount: 0 });
  });

  test('granted skill renders as a grant, never as a removable choice', () => {
    setQuery(
      api.heroBuild.get,
      viewOf([entry(0, { kind: 'set-pillar', pillar: 'class', value: FURY })]),
    );
    render(<BuilderPage characterId={characterId} />);
    // "You gain the Nature skill" — display-only grant chip (R-A), no
    // selectable Nature button anywhere.
    expect(screen.getByText('Nature')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Nature/ })).toBeNull();
    expect(screen.getAllByText(/granted/).length).toBeGreaterThan(0);
  });

  test('a selected option can show its verbatim record, and a missing record is an explicit note', () => {
    setQuery(
      api.heroBuild.get,
      viewOf([
        entry(0, { kind: 'set-pillar', pillar: 'class', value: FURY }),
        entry(1, {
          kind: 'select',
          key: 'mcdm.heroes.v1/feature.fury.level-1/fury-abilities#signature-ability',
          payload: {
            kind: 'pick',
            selected: ['mcdm.heroes.v1/feature.ability.fury.level-1/brutal-slam'],
            origin: 'player',
          },
        }),
      ]),
    );
    render(<BuilderPage characterId={characterId} />);
    const viewButton = screen.getAllByRole('button', { name: 'View record' })[0];
    if (!viewButton) throw new Error('missing view-record button');
    fireEvent.click(viewButton);
    expect(screen.getByText(/Record not seeded on this instance/)).toBeTruthy();
  });
});
