import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Button } from '../../primitives';
import { RecordSearch, type SearchHits } from './RecordSearch';
import type {
  ActiveEncounterView,
  BeginCombatLogData,
  UnspentTurnsLogData,
} from './economy-contract';
import { shortAbilityName } from './economy-contract';
import { useRun } from './useRun';

// The combat turn tracker rail [R-0029..R-0033, design §3 "Hosts"]: round,
// sides, alternation pointer, per-actor turns taken, and the encounter
// villain economy — plus the Director's begin-combat / start-turn /
// advance-round / villain-action controls. The rail renders engine receipts
// verbatim (the begin-combat d10 line, the unspent-turns warn) and never
// re-derives rule math client-side.

type Side = 'heroes' | 'director';

export function TurnRail({
  campaignId,
  encounter,
}: {
  campaignId: Id<'campaigns'>;
  encounter: ActiveEncounterView;
}) {
  const beginCombat = useMutation(api.encounters.beginCombat);
  const startTurn = useMutation(api.encounters.startTurn);
  const advanceRound = useMutation(api.encounters.advanceRound);
  const useVillainAction = useMutation(api.encounters.useVillainAction);
  const log = useQuery(api.encounters.listLog, {
    campaignId,
    encounterId: encounter.encounterId,
  });
  const { run, error, busy } = useRun();
  const [firstSide, setFirstSide] = useState<Side>('heroes');
  const [rollText, setRollText] = useState('');
  const [chosenBy, setChosenBy] = useState<'' | 'players' | 'director'>('');
  const [surprised, setSurprised] = useState<'' | Side>('');
  const [turnPick, setTurnPick] = useState('');
  const [villainRecord, setVillainRecord] = useState<SearchHits[number] | null>(null);
  const [villainAbilitySlug, setVillainAbilitySlug] = useState('');
  const [villainActorId, setVillainActorId] = useState('');

  const turnState = encounter.turnState;
  const isDirector = encounter.viewerIsDirector;

  // A squad occupies one turn slot; its members never take own turns
  // [R-0033] — eligible turn actors are the squads plus every participant
  // outside a squad, minus sub-actors (a sub-actor acts inside its
  // operator's turn, never a turn taker of its own). The engine stays the
  // authority (R-0030 violations warn-and-apply); this only shapes the
  // picker. Allowance comes from the seeded trait [I-6c] so a two-turn
  // solo's second turn never reads as a violation; a squad's slot is one.
  const squadMemberIds = new Set(
    encounter.squads.flatMap((squad) => [...squad.livingMemberIds, ...squad.deadMemberIds]),
  );
  const turnActors = [
    ...encounter.squads.map((squad) => ({ id: squad.squadId, label: squad.name, allowance: 1 })),
    ...encounter.participants
      .filter((participant) => !squadMemberIds.has(participant.id))
      .filter((participant) => participant.subActorOf === null)
      .map((participant) => ({
        id: participant.id,
        label: participant.id,
        allowance: participant.turnAllowance,
      })),
  ];

  // Engine receipts the rail surfaces verbatim: the begin-combat line (which
  // carries the rolled/asserted d10 per the printed procedure) and the most
  // recent advance-round unspent-turns warn [R-0030 — rendered VISIBLY].
  const entries = log ?? [];
  const beginReceipt = [...entries]
    .reverse()
    .find((entry) => (entry.data as { beginCombat?: BeginCombatLogData } | null)?.beginCombat);
  const unspentWarn = [...entries]
    .reverse()
    .find(
      (entry) =>
        entry.kind === 'warning' &&
        (entry.data as Partial<UnspentTurnsLogData> | null)?.unspentTurns !== undefined,
    );

  return (
    <div className="mt-4 border border-line bg-ink-2 p-3">
      <h3 className="type-label text-xs text-text-mute">Combat</h3>
      {turnState === null ? (
        <div className="mt-2">
          <p className="text-sm text-text-dim">Combat has not begun.</p>
          {isDirector ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                aria-label="First side"
                className="h-11 border border-line bg-ink-4 px-2 text-base"
                value={firstSide}
                onChange={(event) => setFirstSide(event.target.value as Side)}
              >
                <option value="heroes">heroes first</option>
                <option value="director">director first</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-text-mute">
                d10
                <input
                  value={rollText}
                  onChange={(event) => setRollText(event.target.value)}
                  placeholder="auto"
                  aria-label="Asserted d10 roll"
                  inputMode="numeric"
                  className="h-11 w-14 border border-line bg-ink-1 px-1 text-center text-xs"
                />
              </label>
              <select
                aria-label="Who chose the first side"
                className="h-11 border border-line bg-ink-4 px-2 text-base"
                value={chosenBy}
                onChange={(event) => setChosenBy(event.target.value as '' | 'players' | 'director')}
              >
                <option value="">chosen by —</option>
                <option value="players">players chose</option>
                <option value="director">Director chose</option>
              </select>
              <select
                aria-label="Entirely surprised side"
                className="h-11 border border-line bg-ink-4 px-2 text-base"
                value={surprised}
                onChange={(event) => setSurprised(event.target.value as '' | Side)}
              >
                <option value="">no side surprised</option>
                <option value="heroes">heroes surprised</option>
                <option value="director">director side surprised</option>
              </select>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  const roll = Number(rollText.trim());
                  run(() =>
                    beginCombat({
                      campaignId,
                      firstSide,
                      ...(rollText.trim().length > 0 && Number.isFinite(roll) ? { roll } : {}),
                      ...(chosenBy !== '' ? { chosenBy } : {}),
                      ...(surprised !== '' ? { surprisedSide: surprised } : {}),
                    }),
                  );
                }}
              >
                Begin combat
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-display text-base">Round {turnState.round}</span>
            <span className="type-label text-text-mute">{turnState.firstSide} went first</span>
            <span className="border border-line-soft bg-ink-1 px-2 py-1">
              next choice: <span className="font-mono">{turnState.sideToChoose}</span>
            </span>
            <span className="border border-accent bg-ink-1 px-2 py-1">
              active: <span className="font-mono">{turnState.activeTurnId ?? 'between turns'}</span>
            </span>
          </div>
          {beginReceipt ? (
            // The engine's verbatim begin-combat receipt — carries the d10
            // and the printed first-side procedure outcome.
            <p className="mt-1 font-mono text-xs text-text-mute">{beginReceipt.message}</p>
          ) : null}
          <ul className="mt-2 flex flex-wrap gap-1">
            {turnActors.map((actor) => {
              const taken = turnState.turnsTaken[actor.id] ?? 0;
              const active = turnState.activeTurnId === actor.id;
              // Taken-vs-allowance [I-6c]: the seeded turnAllowance is the
              // denominator, so a solo's printed two turns render 2/2 —
              // spent, never a violation. Only PAST-allowance renders in
              // the warn tone (the engine's R-0030 warn stays the loud
              // channel; this mirrors it, never re-derives).
              const overAllowance = taken > actor.allowance;
              return (
                <li
                  key={actor.id}
                  aria-label={`${actor.label} — turns taken ${taken} of ${actor.allowance}${active ? ' — active' : ''}`}
                  className={`border px-2 py-1 font-mono text-xs ${
                    active
                      ? 'border-accent text-accent'
                      : overAllowance
                        ? 'border-accent bg-ink-1 text-accent'
                        : taken >= actor.allowance
                          ? 'border-line-soft bg-ink-1 text-text-mute'
                          : 'border-line-soft bg-ink-1'
                  }`}
                >
                  {actor.label} · {taken}/{actor.allowance}
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="type-label text-text-mute">Villain action</span>
            <span className="font-mono">
              {encounter.villainActions.usedThisRound ? 'SPENT this round' : 'available this round'}
            </span>
            {encounter.villainActions.usedByAbility.length > 0 ? (
              <span className="text-text-mute">
                used this encounter:{' '}
                {encounter.villainActions.usedByAbility.map(shortAbilityName).join(', ')}
              </span>
            ) : null}
          </div>
          {unspentWarn ? (
            // R-0030 warn-and-apply must be VISIBLE: the Director advanced
            // the round past living unspent turns — loud, never buried.
            <div role="alert" className="mt-2 border border-accent-tint-line bg-accent-tint p-2">
              <p className="type-label text-xs text-accent">Rule warning</p>
              <p className="mt-1 text-sm text-accent">{unspentWarn.message}</p>
            </div>
          ) : null}
          {isDirector ? (
            <div className="mt-3 border-t border-line-soft pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Turn to start"
                  className="h-11 border border-line bg-ink-4 px-2 text-base"
                  value={turnPick === '' ? (turnActors[0]?.id ?? '') : turnPick}
                  onChange={(event) => setTurnPick(event.target.value)}
                >
                  {turnActors.map((actor) => (
                    <option key={actor.id} value={actor.id}>
                      {actor.label}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={busy || turnActors.length === 0}
                  onClick={() => {
                    const turnId = turnPick === '' ? (turnActors[0]?.id ?? '') : turnPick;
                    if (turnId !== '') run(() => startTurn({ campaignId, turnId }));
                  }}
                >
                  Start turn
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => advanceRound({ campaignId }))}
                >
                  Advance round
                </Button>
              </div>
              <div className="mt-3">
                <h4 className="type-label text-xs text-text-mute">Use a villain action</h4>
                <div className="mt-1">
                  <RecordSearch
                    campaignId={campaignId}
                    pickLabel="Pick villain"
                    requireParsedTier={false}
                    searchLabel="Search villain actions"
                    onPick={(hit) => {
                      setVillainRecord(hit);
                      setVillainAbilitySlug('');
                    }}
                  />
                </div>
                {villainRecord ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{villainRecord.slug}</span>
                    <input
                      value={villainAbilitySlug}
                      onChange={(event) => setVillainAbilitySlug(event.target.value)}
                      placeholder="ability slug (e.g. focus-fire)"
                      aria-label="Villain ability within the record"
                      className="h-11 w-44 border border-line bg-ink-1 px-2 text-xs"
                    />
                    <select
                      aria-label="Villain actor"
                      className="h-11 border border-line bg-ink-4 px-2 text-base"
                      value={
                        villainActorId === ''
                          ? (encounter.participants[0]?.id ?? '')
                          : villainActorId
                      }
                      onChange={(event) => setVillainActorId(event.target.value)}
                    >
                      {encounter.participants.map((participant) => (
                        <option key={participant.id} value={participant.id}>
                          {participant.id}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        const suffix = villainAbilitySlug.trim();
                        const participantId =
                          villainActorId === ''
                            ? (encounter.participants[0]?.id ?? '')
                            : villainActorId;
                        run(() =>
                          useVillainAction({
                            campaignId,
                            participantId,
                            abilityArtifactId:
                              suffix.length > 0
                                ? `${villainRecord.artifactId}#${suffix}`
                                : villainRecord.artifactId,
                          }),
                        );
                      }}
                    >
                      Use villain action
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
      {error ? <p className="mt-2 text-sm text-foe">{error}</p> : null}
    </div>
  );
}
