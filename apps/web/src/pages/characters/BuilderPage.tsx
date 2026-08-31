import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import type {
  DecisionAction,
  HeroProjection,
  SelectionPayload,
} from '@engarde/canon/hero-document';
import {
  type ChoicePointRow,
  FURY_L1_OVERLAY,
  type OverlayOption,
  chosenOptionKeys,
  isRowReachable,
} from '@engarde/canon/hero-overlay-fury';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Button } from '../../primitives';
import { errorMessage } from '../campaigns/AppScreen';

// The character wizard (Fury vertical, ROAD-0007 leg 2). Every control on
// this page is a projection of the choice-point overlay
// (@engarde/canon/hero-overlay-fury — definition data seeded from the pin)
// against the character's decision log; every click appends ONE decision
// through heroBuild.append. No rule logic lives here: pools, cardinalities
// and grants come from the overlay; the sheet math happens in the compile
// seam. A step whose options cannot be resolved from the pin renders as an
// EXPLICIT gap — never an empty drawer presented as a completed step.

type BuildView = {
  characterId: Id<'characters'>;
  name: string;
  level: number;
  build: { decisions: { seq: number; action: DecisionAction }[] };
  projection: HeroProjection;
  unanswered: { key: string; label: string; status: 'unanswered' | 'gap' }[];
};

export function BuilderPage({ characterId }: { characterId: Id<'characters'> }) {
  const view = useQuery(api.heroBuild.get, { characterId }) as BuildView | undefined;
  const append = useMutation(api.heroBuild.append);
  const revert = useMutation(api.heroBuild.revert);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (view === undefined)
    return <p className="py-16 text-center text-text-dim">Loading the builder…</p>;

  const dispatch = (action: DecisionAction) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    append({ characterId, action })
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };

  const undoLast = () => {
    if (busy || view.build.decisions.length === 0) return;
    setBusy(true);
    setError(null);
    revert({ characterId, keepCount: view.build.decisions.length - 1 })
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };

  const open = view.unanswered.filter((entry) => entry.status === 'unanswered');
  const gaps = view.unanswered.filter((entry) => entry.status === 'gap');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">{view.name}</h1>
          <p className="font-mono text-xs text-text-mute">
            Level {view.level} · {view.build.decisions.length} decisions recorded
          </p>
        </div>
        <Button size="sm" disabled={busy || view.build.decisions.length === 0} onClick={undoLast}>
          Undo last decision
        </Button>
      </header>

      {open.length === 0 ? (
        <p className="border border-line bg-ink-1 p-3 text-sm">
          Class build complete for level {view.level}.{' '}
          {gaps.length > 0
            ? `${gaps.length} pillar${gaps.length === 1 ? '' : 's'} remain open gaps below — the hero is playable, not finished.`
            : null}
        </p>
      ) : (
        <p className="border border-line bg-ink-1 p-3 text-sm text-text-dim">
          Open steps: {open.map((entry) => entry.label).join(' · ')}
        </p>
      )}
      {error ? <p className="text-sm text-foe">{error}</p> : null}

      {FURY_L1_OVERLAY.map((row) => (
        <StepCard
          key={row.key}
          row={row}
          projection={view.projection}
          busy={busy}
          dispatch={dispatch}
        />
      ))}
    </div>
  );
}

function StepCard({
  row,
  projection,
  busy,
  dispatch,
}: {
  row: ChoicePointRow;
  projection: HeroProjection;
  busy: boolean;
  dispatch: (action: DecisionAction) => void;
}) {
  if (!isRowReachable(row, projection)) return null;

  if (row.optionSource.kind === 'unresolvable') {
    // Q5 discipline: the gap is a first-class, visibly-open step.
    return (
      <section className="border border-dashed border-line p-4" data-gap={row.key}>
        <StepHeading row={row} done={false} badge="open gap" />
        <p className="mt-2 text-sm text-text-dim">{row.optionSource.reason}</p>
      </section>
    );
  }

  if (row.kind === 'fixed-grant') {
    return (
      <section className="border border-line bg-ink-4 p-4">
        <StepHeading row={row} done badge="granted" />
        <ul className="mt-2 flex flex-wrap gap-2">
          {row.grants.map((grant) => (
            <li key={grant.scc} className="border border-line bg-ink-1 px-2 py-1 text-sm">
              {grant.label} <span className="font-mono text-xs text-text-mute">{grant.kind}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (row.kind === 'characteristic-assignment') {
    return (
      <CharacteristicsStep row={row} projection={projection} busy={busy} dispatch={dispatch} />
    );
  }

  const chosen = chosenOptionKeys(row, projection);
  const done = row.kind === 'set-pillar' ? chosen.length > 0 : chosen.length >= row.cardinality;
  const pickOne = row.cardinality === 1;

  const toggle = (option: OverlayOption) => {
    if (row.kind === 'set-pillar' && row.pillar !== undefined) {
      dispatch({ kind: 'set-pillar', pillar: row.pillar, value: option.key });
      return;
    }
    let selected: string[];
    if (pickOne) selected = [option.key];
    else if (chosen.includes(option.key)) selected = chosen.filter((key) => key !== option.key);
    else if (chosen.length >= row.cardinality)
      return; // drop one first
    else selected = [...chosen, option.key];
    const payload: SelectionPayload = { kind: 'pick', selected, origin: 'player' };
    dispatch({ kind: 'select', key: row.key, payload });
  };

  return (
    <section className="border border-line bg-ink-4 p-4">
      <StepHeading
        row={row}
        done={done}
        badge={
          row.changeableAt === 'respite'
            ? 'changeable at a respite'
            : pickOne
              ? 'choose one'
              : `choose ${row.cardinality}`
        }
      />
      {row.grants.length > 0 ? (
        <p className="mt-1 text-xs text-text-mute">
          Also grants: {row.grants.map((grant) => grant.label).join(', ')}
        </p>
      ) : null}
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {row.optionSource.options.map((option) => {
          const selected = chosen.includes(option.key);
          return (
            <li key={option.key}>
              <button
                type="button"
                disabled={busy}
                aria-pressed={selected}
                onClick={() => toggle(option)}
                className={`min-h-11 w-full border px-3 py-2 text-left text-sm ${
                  selected
                    ? 'border-rule bg-ink-1'
                    : 'border-line bg-transparent hover:border-text-dim'
                }`}
              >
                <span>{option.label}</span>
                {option.grants && option.grants.length > 0 ? (
                  <span className="mt-1 block text-xs text-text-mute">
                    grants {option.grants.map((grant) => grant.label).join(', ')}
                  </span>
                ) : null}
              </button>
              {selected && option.recordScc ? <RecordText artifactId={option.recordScc} /> : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 font-mono text-xs text-text-mute">{row.evidence[0]}</p>
    </section>
  );
}

function StepHeading({
  row,
  done,
  badge,
}: {
  row: ChoicePointRow;
  done: boolean;
  badge: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-display text-xl">{row.label}</h2>
      <span className="type-label text-xs text-text-mute">
        {done ? 'done · ' : ''}
        {badge}
      </span>
    </div>
  );
}

const OTHER_THREE = ['reason', 'intuition', 'presence'] as const;

/** Distinct assignments of a printed array's three values over the three
 * non-primary characteristics. Pure arrangement of pin-printed values —
 * the class record fixes the primaries and offers the arrays; which value
 * lands on which characteristic is the player's assignment. */
function distinctAssignments(values: readonly [number, number, number]) {
  const seen = new Set<string>();
  const results: Record<(typeof OTHER_THREE)[number], number>[] = [];
  const orders: [number, number, number][] = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  for (const [first, second, third] of orders) {
    const assignment = {
      reason: values[first] as number,
      intuition: values[second] as number,
      presence: values[third] as number,
    };
    const fingerprint = JSON.stringify(assignment);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    results.push(assignment);
  }
  return results;
}

function CharacteristicsStep({
  row,
  projection,
  busy,
  dispatch,
}: {
  row: ChoicePointRow;
  projection: HeroProjection;
  busy: boolean;
  dispatch: (action: DecisionAction) => void;
}) {
  const config = row.characteristicArrays;
  if (!config) return null;
  const current = projection.characteristics;
  const done = current !== null;
  return (
    <section className="border border-line bg-ink-4 p-4">
      <StepHeading row={row} done={done} badge="choose one spread" />
      <p className="mt-1 text-sm text-text-dim">
        Might and Agility start at {config.primaryValue}; assign one printed array to Reason,
        Intuition and Presence.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {config.arrays.map((values) => (
          <div key={values.join(',')}>
            <p className="font-mono text-xs text-text-mute">array {values.join(' / ')}</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {distinctAssignments(values).map((assignment) => {
                const full = {
                  might: config.primaryValue,
                  agility: config.primaryValue,
                  ...assignment,
                };
                const selected =
                  current !== null && OTHER_THREE.every((key) => current[key] === assignment[key]);
                return (
                  <li key={JSON.stringify(assignment)}>
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={selected}
                      onClick={() => dispatch({ kind: 'set-characteristics', assignment: full })}
                      className={`min-h-11 border px-3 py-2 font-mono text-xs ${
                        selected
                          ? 'border-rule bg-ink-1'
                          : 'border-line bg-transparent hover:border-text-dim'
                      }`}
                    >
                      R {assignment.reason} · I {assignment.intuition} · P {assignment.presence}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-2 font-mono text-xs text-text-mute">{row.evidence[0]}</p>
    </section>
  );
}

/** Verbatim record text on demand; a missing record is an explicit note,
 * never invented copy. */
function RecordText({ artifactId }: { artifactId: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="min-h-11 px-1 text-xs text-text-dim underline underline-offset-4"
      >
        {expanded ? 'Hide record' : 'View record'}
      </button>
      {expanded ? <RecordBody artifactId={artifactId} /> : null}
    </div>
  );
}

function RecordBody({ artifactId }: { artifactId: string }) {
  const records = useQuery(api.heroBuild.records, { artifactIds: [artifactId] }) as
    | ({ artifactId: string; text: string } | null)[]
    | undefined;
  if (records === undefined) return <p className="text-xs text-text-mute">Loading…</p>;
  const record = records[0];
  if (!record)
    return (
      <p className="text-xs text-text-mute">
        Record not seeded on this instance — see the pin: {artifactId}
      </p>
    );
  return (
    <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap border border-line-soft bg-ink-1 p-2 text-xs">
      {record.text}
    </pre>
  );
}
