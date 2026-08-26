import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { useState } from 'react';
import { Button } from '../../primitives';
import type { SquadView } from './squad-contract';
import { useRun } from './useRun';

// Minion squad Stamina pools on the Table [R-0023..R-0028]. The pool is the
// one home for squad vitality — members render as chips, never per-member
// Stamina. The only rule text shown is the statblock's With-Captain line,
// passed through the view verbatim while a captain is attached. Director
// controls mirror the terrain-fact affordance gating (director-only).

/** The slice of the encounter view's participants the section needs —
 * structural subset of the full participant view rows. `isMinion` is the
 * engine's one-home predicate computed server-side; the web never
 * re-derives it from `vitals.organization`. */
export interface SquadParticipantRef {
  id: string;
  isMinion: boolean;
}

export function SquadsSection({
  campaignId,
  squads,
  participants,
  viewerIsDirector,
}: {
  campaignId: Id<'campaigns'>;
  squads: SquadView[];
  participants: ReadonlyArray<SquadParticipantRef>;
  viewerIsDirector: boolean;
}) {
  const resolvePendingKills = useMutation(api.encounters.resolvePendingKills);
  const attachCaptain = useMutation(api.encounters.attachCaptain);
  const detachCaptain = useMutation(api.encounters.detachCaptain);
  const { run, error, busy } = useRun();
  const [captainPicks, setCaptainPicks] = useState<Record<string, string>>({});
  const [victimPicks, setVictimPicks] = useState<Record<string, string[]>>({});
  if (squads.length === 0) return null;

  // Captain candidates: a captain is a separate non-minion participant —
  // exclude every seeded squad member (living or dead) and any participant
  // the view flags as a minion (the engine's one-home predicate, computed
  // server-side). The engine stays the authority (warn-and-replace per
  // R-0028); this only shapes the picker.
  const squadMemberIds = new Set(
    squads.flatMap((squad) => [...squad.livingMemberIds, ...squad.deadMemberIds]),
  );
  const captainCandidates = participants.filter(
    (participant) => !squadMemberIds.has(participant.id) && !participant.isMinion,
  );

  return (
    <div className="mt-4 border-t border-line-soft pt-4">
      <h3 className="type-label text-xs text-text-mute">Squads</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {squads.map((squad) => {
          const victims = victimPicks[squad.squadId] ?? [];
          const atCap = victims.length >= squad.pendingKills;
          const captainPick = captainPicks[squad.squadId] ?? captainCandidates[0]?.id ?? '';
          return (
            <li key={squad.squadId} className="border border-line-soft bg-ink-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-display">{squad.name}</span>
                {squad.pendingKills > 0 ? (
                  <span className="border border-foe px-1 text-xs text-foe">
                    {squad.pendingKills} pending kill{squad.pendingKills === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="font-mono">
                  {squad.poolCurrent}/{squad.poolMax}
                </span>
                <span className="type-label text-text-mute">Pool</span>
                <span className="font-mono">{squad.perMinionStamina}</span>
                <span className="type-label text-text-mute">Per minion</span>
              </div>
              <div className="mt-1 h-1.5 w-full bg-ink-1" aria-hidden>
                <div
                  className={`h-full ${squad.poolCurrent === 0 ? 'bg-foe' : 'bg-accent'}`}
                  style={{
                    width: `${Math.max(0, Math.min(100, (squad.poolCurrent / squad.poolMax) * 100))}%`,
                  }}
                />
              </div>
              <ul className="mt-2 flex flex-wrap gap-1">
                {squad.livingMemberIds.map((memberId) => (
                  <li
                    key={memberId}
                    aria-label={`${memberId} — living`}
                    className="border border-line-soft bg-ink-1 px-2 py-1 font-mono text-xs"
                  >
                    {memberId}
                  </li>
                ))}
                {squad.deadMemberIds.map((memberId) => (
                  <li
                    key={memberId}
                    aria-label={`${memberId} — dead`}
                    className="border border-foe bg-ink-1 px-2 py-1 font-mono text-xs text-text-mute line-through"
                  >
                    {memberId}
                  </li>
                ))}
              </ul>
              {squad.captainId ? (
                <div className="mt-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono">{squad.captainId}</span>
                    <span className="type-label text-text-mute">Captain</span>
                    {viewerIsDirector ? (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() =>
                          run(() => detachCaptain({ campaignId, squadId: squad.squadId }))
                        }
                      >
                        Detach
                      </Button>
                    ) : null}
                  </div>
                  {squad.withCaptain ? (
                    <div className="mt-1">
                      <p className="type-label text-xs text-text-mute">With Captain</p>
                      <p className="mt-1 whitespace-pre-wrap border border-line-soft bg-ink-1 p-2 font-mono text-xs">
                        {squad.withCaptain}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : viewerIsDirector && captainCandidates.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Captain for ${squad.name}`}
                    className="h-11 border border-line bg-ink-1 px-2 text-sm"
                    value={captainPick}
                    onChange={(event) =>
                      setCaptainPicks((current) => ({
                        ...current,
                        [squad.squadId]: event.target.value,
                      }))
                    }
                  >
                    {captainCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.id}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={busy || captainPick === ''}
                    onClick={() =>
                      run(() =>
                        attachCaptain({
                          campaignId,
                          squadId: squad.squadId,
                          captainId: captainPick,
                        }),
                      )
                    }
                  >
                    Attach captain
                  </Button>
                </div>
              ) : null}
              {viewerIsDirector && squad.pendingKills > 0 ? (
                <div className="mt-2">
                  <p className="text-xs text-text-dim">
                    Select exactly {squad.pendingKills} living member
                    {squad.pendingKills === 1 ? '' : 's'} to resolve the pending kill
                    {squad.pendingKills === 1 ? '' : 's'} — the directive in the log names the rule.
                  </p>
                  <fieldset className="mt-1 flex flex-wrap items-center gap-2">
                    <legend className="sr-only">Pending-kill victims for {squad.name}</legend>
                    {squad.livingMemberIds.map((memberId) => {
                      const checked = victims.includes(memberId);
                      return (
                        <label
                          key={memberId}
                          className="flex min-h-11 items-center gap-1 font-mono text-xs text-text-mute"
                        >
                          <input
                            type="checkbox"
                            aria-label={`Victim ${memberId} in ${squad.name}`}
                            checked={checked}
                            disabled={!checked && atCap}
                            onChange={(event) =>
                              setVictimPicks((current) => {
                                const currentIds = current[squad.squadId] ?? [];
                                return {
                                  ...current,
                                  [squad.squadId]: event.target.checked
                                    ? [...new Set([...currentIds, memberId])]
                                    : currentIds.filter((id) => id !== memberId),
                                };
                              })
                            }
                          />
                          {memberId}
                        </label>
                      );
                    })}
                  </fieldset>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-mono text-xs">
                      {victims.length}/{squad.pendingKills}
                    </span>
                    <span className="type-label text-xs text-text-mute">named</span>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy || victims.length !== squad.pendingKills}
                      onClick={() =>
                        run(() =>
                          resolvePendingKills({
                            campaignId,
                            squadId: squad.squadId,
                            victimMemberIds: victims,
                          }).then(() =>
                            setVictimPicks((current) => ({ ...current, [squad.squadId]: [] })),
                          ),
                        )
                      }
                    >
                      Resolve kills
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-2 text-sm text-foe">{error}</p> : null}
    </div>
  );
}
