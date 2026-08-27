import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { useState } from 'react';
import { Button } from '../../primitives';
import type { SquadView } from './squad-contract';
import { useRun } from './useRun';

// Minion squad Stamina pools and one-roll attack affordances [R-0023..R-0039]. The pool is the
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
  recordId: string | null;
  isMinion: boolean;
}

interface ParticipationDraft {
  targetId: string;
  instanceOwner: string;
  memberIds: string[];
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
  const squadAttack = useMutation(api.encounters.squadAttack);
  const squadFreeStrike = useMutation(api.encounters.squadFreeStrike);
  const { run, error, busy } = useRun();
  const [captainPicks, setCaptainPicks] = useState<Record<string, string>>({});
  const [victimPicks, setVictimPicks] = useState<Record<string, string[]>>({});
  const [attackTargets, setAttackTargets] = useState<Record<string, string>>({});
  const [attackOwners, setAttackOwners] = useState<Record<string, string>>({});
  const [attackMembers, setAttackMembers] = useState<Record<string, string[]>>({});
  const [abilitySlugs, setAbilitySlugs] = useState<Record<string, string>>({});
  const [queuedParticipation, setQueuedParticipation] = useState<
    Record<string, ParticipationDraft[]>
  >({});
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
          const targetCandidates = participants.filter(
            (participant) => !squad.livingMemberIds.includes(participant.id),
          );
          const attackTarget = attackTargets[squad.squadId] ?? targetCandidates[0]?.id ?? '';
          const attackOwner = attackOwners[squad.squadId] ?? squad.livingMemberIds[0] ?? '';
          const pickedAttackMembers =
            attackMembers[squad.squadId] ?? (attackOwner ? [attackOwner] : []);
          const abilitySlug = abilitySlugs[squad.squadId] ?? '';
          const ownerRecordId = participants.find(
            (participant) => participant.id === attackOwner,
          )?.recordId;
          const queued = queuedParticipation[squad.squadId] ?? [];
          const currentParticipation = {
            targetId: attackTarget,
            instanceOwner: attackOwner,
            memberIds: pickedAttackMembers,
          };
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
                      {squad.withCaptainBenefit ? (
                        <p className="mt-1 text-xs text-text-mute">
                          <span className="type-label border border-line-soft px-1">
                            {squad.withCaptainBenefit.kind === 'directive' ||
                            squad.withCaptainBenefit.kind === 'residue'
                              ? 'Table directive'
                              : 'Automated live modifier'}
                          </span>{' '}
                          {squad.withCaptainBenefit.kind}
                        </p>
                      ) : null}
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
              {viewerIsDirector &&
              squad.livingMemberIds.length > 0 &&
              targetCandidates.length > 0 ? (
                <fieldset className="mt-3 border-t border-line-soft pt-2">
                  <legend className="type-label text-xs text-text-mute">Squad attack</legend>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    <label className="text-xs text-text-mute">
                      Target
                      <select
                        aria-label={`Squad attack target for ${squad.name}`}
                        className="mt-1 h-11 w-full border border-line bg-ink-1 px-2 text-sm"
                        value={attackTarget}
                        onChange={(event) =>
                          setAttackTargets((current) => ({
                            ...current,
                            [squad.squadId]: event.target.value,
                          }))
                        }
                      >
                        {targetCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-text-mute">
                      Instance owner
                      <select
                        aria-label={`Instance owner for ${squad.name}`}
                        className="mt-1 h-11 w-full border border-line bg-ink-1 px-2 text-sm"
                        value={attackOwner}
                        onChange={(event) => {
                          const owner = event.target.value;
                          setAttackOwners((current) => ({ ...current, [squad.squadId]: owner }));
                          setAttackMembers((current) => ({
                            ...current,
                            [squad.squadId]: [owner],
                          }));
                        }}
                      >
                        {squad.livingMemberIds.map((memberId) => (
                          <option key={memberId} value={memberId}>
                            {memberId}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="mt-2 block text-xs text-text-mute">
                    Printed ability slug
                    <input
                      aria-label={`Ability slug for ${squad.name}`}
                      className="mt-1 h-11 w-full border border-line bg-ink-1 px-2 font-mono text-sm"
                      placeholder="spit"
                      value={abilitySlug}
                      onChange={(event) =>
                        setAbilitySlugs((current) => ({
                          ...current,
                          [squad.squadId]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {squad.livingMemberIds.map((memberId) => (
                      <label
                        key={memberId}
                        className="flex min-h-11 items-center gap-1 font-mono text-xs"
                      >
                        <input
                          type="checkbox"
                          aria-label={`Attack with ${memberId} in ${squad.name}`}
                          checked={pickedAttackMembers.includes(memberId)}
                          onChange={(event) =>
                            setAttackMembers((current) => {
                              const ids =
                                current[squad.squadId] ?? (attackOwner ? [attackOwner] : []);
                              return {
                                ...current,
                                [squad.squadId]: event.target.checked
                                  ? [...new Set([...ids, memberId])]
                                  : ids.filter((id) => id !== memberId),
                              };
                            })
                          }
                        />
                        {memberId}
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={
                        busy ||
                        !attackTarget ||
                        !pickedAttackMembers.includes(attackOwner) ||
                        queued.some((row) => row.targetId === attackTarget)
                      }
                      onClick={() => {
                        setQueuedParticipation((current) => ({
                          ...current,
                          [squad.squadId]: [
                            ...(current[squad.squadId] ?? []),
                            currentParticipation,
                          ],
                        }));
                        setAttackMembers((current) => ({
                          ...current,
                          [squad.squadId]: attackOwner ? [attackOwner] : [],
                        }));
                      }}
                    >
                      Queue target
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        busy ||
                        !ownerRecordId ||
                        !abilitySlug ||
                        !attackTarget ||
                        !pickedAttackMembers.includes(attackOwner)
                      }
                      onClick={() => {
                        if (!ownerRecordId) return;
                        run(() =>
                          squadAttack({
                            campaignId,
                            artifactId: ownerRecordId,
                            abilitySlug,
                            squadId: squad.squadId,
                            participation: [...queued, currentParticipation],
                          }),
                        );
                      }}
                    >
                      Roll signature
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || !attackTarget || pickedAttackMembers.length === 0}
                      onClick={() =>
                        run(() =>
                          squadFreeStrike({
                            campaignId,
                            squadId: squad.squadId,
                            targetId: attackTarget,
                            contributions: pickedAttackMembers.map((memberId) => ({
                              memberId,
                              count: 1,
                            })),
                          }),
                        )
                      }
                    >
                      Free Strike Together
                    </Button>
                  </div>
                  {queued.length > 0 ? (
                    <ol className="mt-2 flex flex-col gap-1 text-xs text-text-mute">
                      {queued.map((row, index) => (
                        <li key={`${row.targetId}-${index}`}>
                          {index + 1}. {row.memberIds.join(' + ')} → {row.targetId} (owner{' '}
                          {row.instanceOwner}){' '}
                          <button
                            type="button"
                            className="text-foe underline"
                            onClick={() =>
                              setQueuedParticipation((current) => ({
                                ...current,
                                [squad.squadId]: (current[squad.squadId] ?? []).filter(
                                  (_, at) => at !== index,
                                ),
                              }))
                            }
                          >
                            remove
                          </button>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </fieldset>
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
