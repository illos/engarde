import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { useState } from 'react';
import { Button } from '../../primitives';
import type { ResolutionModificationView, ResolutionView } from './economy-contract';
import { useRun } from './useRun';

// Open resolution entries [R-0032, design §3]: a rolled ability held open
// for reactions/modifications. The card shows the roll receipt and the
// recorded modification list (applied in dispatch order at commit) and
// carries the prominent Commit plus the downgrade affordance ("you can
// downgrade it to select the outcome of a lower tier"). The default flow
// never lands here — useAbility pipelines its own commit unless held.

function describeModification(modification: ResolutionModificationView): string {
  switch (modification.kind) {
    case 'downgrade':
      return `downgrade to tier ${modification.toTier}`;
    case 'tier-adjust':
      return `tier ${modification.delta > 0 ? '+' : ''}${modification.delta} — ${modification.reason}`;
    case 'potency-adjust':
      return `potency ${modification.delta > 0 ? '+' : ''}${modification.delta}${
        modification.target ? ` vs ${modification.target}` : ''
      } — ${modification.reason}`;
    case 'retarget':
      return `retarget ${modification.from} → ${modification.to} — ${modification.reason}`;
    case 'damage-halve':
      return `damage halved (round ${modification.rounding})${
        modification.target ? ` for ${modification.target}` : ''
      } — ${modification.reason}`;
  }
}

export function ResolutionsSection({
  campaignId,
  resolutions,
  participantIds,
  viewerIsDirector,
}: {
  campaignId: Id<'campaigns'>;
  resolutions: ResolutionView[];
  participantIds: ReadonlySet<string>;
  viewerIsDirector: boolean;
}) {
  const commitResolution = useMutation(api.encounters.commitResolution);
  const modifyResolution = useMutation(api.encounters.modifyResolution);
  const { run, error, busy } = useRun();
  const [downgradePicks, setDowngradePicks] = useState<Record<string, '1' | '2'>>({});
  if (resolutions.length === 0) return null;

  // The removeCondition authority pattern: the Director acts as such; a
  // member names the owning participant (a squad-owned entry stays the
  // Director's to commit).
  const authority = (entry: ResolutionView) =>
    viewerIsDirector || !participantIds.has(entry.actorId)
      ? {}
      : { asParticipantId: entry.actorId };

  return (
    <div className="mt-4 border-t border-line-soft pt-4">
      <h3 className="type-label text-xs text-text-mute">Open resolutions</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {resolutions.map((entry) => {
          const downgradePick = downgradePicks[entry.resolutionId] ?? '2';
          return (
            <li
              key={entry.resolutionId}
              className="border border-accent-tint-line bg-accent-tint p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-display">{entry.abilitySlug}</span>
                <span className="font-mono text-xs text-text-mute">{entry.actorId}</span>
                {entry.actionCost ? (
                  <span className="type-label text-xs text-text-mute">{entry.actionCost}</span>
                ) : null}
              </div>
              {entry.roll === null ? (
                // DECLARED [R-0041]: targets named, dice not thrown. Rolling
                // is dispatched by the host that held the declaration; the
                // table controls for it land with the reaction surfaces.
                <p className="mt-1 font-mono text-xs text-text-mute">
                  declared against {(entry.declaredTargets ?? []).join(', ') || '—'} · roll pending
                </p>
              ) : (
                <p className="mt-1 font-mono text-xs text-text-mute">
                  {entry.roll.dice.join('+')} · total {entry.roll.total} → tier {entry.roll.tier}
                </p>
              )}
              {entry.modifications.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-1">
                  {entry.modifications.map((modification, index) => (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: dispatch-ordered, append-only list
                      key={index}
                      className="text-xs text-text-dim"
                    >
                      mod: {describeModification(modification)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {entry.roll !== null ? (
                  <>
                    <select
                      aria-label={`Downgrade tier for ${entry.resolutionId}`}
                      className="h-11 border border-line bg-ink-4 px-2 text-base"
                      value={downgradePick}
                      onChange={(event) =>
                        setDowngradePicks((current) => ({
                          ...current,
                          [entry.resolutionId]: event.target.value as '1' | '2',
                        }))
                      }
                    >
                      <option value="2">tier 2</option>
                      <option value="1">tier 1</option>
                    </select>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          modifyResolution({
                            campaignId,
                            resolutionId: entry.resolutionId,
                            modification: {
                              kind: 'downgrade',
                              toTier: downgradePick === '1' ? 1 : 2,
                            },
                            ...authority(entry),
                          }),
                        )
                      }
                    >
                      Downgrade
                    </Button>
                  </>
                ) : null}
                <Button
                  variant="primary"
                  disabled={busy || entry.roll === null}
                  onClick={() =>
                    run(() =>
                      commitResolution({
                        campaignId,
                        resolutionId: entry.resolutionId,
                        ...authority(entry),
                      }),
                    )
                  }
                >
                  Commit
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-2 text-sm text-foe">{error}</p> : null}
    </div>
  );
}
