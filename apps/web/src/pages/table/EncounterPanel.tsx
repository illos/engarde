import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../primitives';
import { errorMessage } from '../campaigns/AppScreen';

// The encounter surface inside the Table — the pure rules engine mounted
// behind the session lobby. This panel renders engine state and dispatches
// mutations; it adds no rule semantics of its own. What the engine cannot
// automate yet arrives as explicit log receipts ("not automated") and
// verbatim table cards to resolve at the table — nothing is faked.

type EncounterView = NonNullable<ReturnType<typeof useQuery<typeof api.encounters.getActive>>>;
type SearchHits = NonNullable<ReturnType<typeof useQuery<typeof api.encounters.searchRecords>>>;

const BANDS = ['≤11', '12-16', '17+'] as const;
type Band = (typeof BANDS)[number];

function useRun() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    action()
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  return { run, error, busy };
}

export function EncounterPanel({ campaignId }: { campaignId: Id<'campaigns'> }) {
  const session = useQuery(api.sessions.getActive, { campaignId });
  const encounter = useQuery(api.encounters.getActive, { campaignId });
  const roster = useQuery(api.campaigns.listRoster, { campaignId });
  if (session === undefined || encounter === undefined || roster === undefined) return null;
  if (session === null) return null; // encounter play lives inside a session
  const isDirector = roster.viewer.gameRole === 'director';
  if (encounter === null) return <StartEncounter campaignId={campaignId} isDirector={isDirector} />;
  return <ActiveEncounter campaignId={campaignId} encounter={encounter} />;
}

function RecordSearch({
  campaignId,
  onPick,
  pickLabel,
  requireParsedTier,
}: {
  campaignId: Id<'campaigns'>;
  onPick: (hit: SearchHits[number]) => void;
  pickLabel: string;
  requireParsedTier: boolean;
}) {
  const [term, setTerm] = useState('');
  const hits = useQuery(
    api.encounters.searchRecords,
    term.trim().length >= 2 ? { campaignId, term } : 'skip',
  );
  return (
    <div>
      <input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search the books… (e.g. blood-for-blood)"
        aria-label="Search canon records"
        className="h-11 w-full border border-line bg-ink-2 px-3 text-sm text-text placeholder:text-text-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
      />
      {hits && hits.length > 0 ? (
        <ul className="mt-2 flex flex-col divide-y divide-line-soft border border-line bg-ink-2">
          {hits.map((hit) => {
            const usable = !requireParsedTier || hit.parsedTiers.length > 0;
            return (
              <li key={hit.artifactId} className="flex items-center gap-2 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs">{hit.slug}</p>
                  <p className="truncate text-xs text-text-mute">
                    {hit.parsedTiers.length > 0
                      ? `tiers parsed: ${hit.parsedTiers.join(', ')}`
                      : 'nothing automatable yet — plays as a verbatim card'}
                    {hit.residueSpans > 0 ? ' · has table-card text' : ''}
                  </p>
                </div>
                <Button size="sm" disabled={!usable} onClick={() => onPick(hit)}>
                  {pickLabel}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function handleFromSlug(slug: string, taken: Set<string>): string {
  const base = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  let candidate = base.length > 0 ? base : 'actor';
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function StartEncounter({
  campaignId,
  isDirector,
}: {
  campaignId: Id<'campaigns'>;
  isDirector: boolean;
}) {
  const start = useMutation(api.encounters.start);
  const [draft, setDraft] = useState<Array<{ id: string; recordId: string; slug: string }>>([]);
  const { run, error, busy } = useRun();
  if (!isDirector)
    return (
      <section className="border border-line bg-ink-1 p-4">
        <h2 className="text-xl">Encounter</h2>
        <p className="mt-1 text-sm text-text-dim">The Director sets the field.</p>
      </section>
    );
  return (
    <section className="border border-line bg-ink-1 p-4">
      <h2 className="text-xl">Start an encounter</h2>
      <p className="mt-1 text-sm text-text-dim">
        Pick combatants from the books — every participant is a real canon record.
      </p>
      <div className="mt-3">
        <RecordSearch
          campaignId={campaignId}
          pickLabel="Add"
          requireParsedTier={false}
          onPick={(hit) =>
            setDraft((current) => [
              ...current,
              {
                id: handleFromSlug(hit.slug, new Set(current.map((entry) => entry.id))),
                recordId: hit.artifactId,
                slug: hit.slug,
              },
            ])
          }
        />
      </div>
      {draft.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {draft.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-2 border border-line-soft bg-ink-2 px-2 py-1"
            >
              <span className="font-mono text-xs">{entry.id}</span>
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  setDraft((current) => current.filter((item) => item.id !== entry.id))
                }
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button
        className="mt-4"
        variant="primary"
        disabled={busy || draft.length === 0}
        onClick={() =>
          run(() =>
            start({
              campaignId,
              participants: draft.map((entry) => ({ id: entry.id, recordId: entry.recordId })),
            }),
          )
        }
      >
        Start encounter
      </Button>
      {error ? <p className="mt-2 text-sm text-foe">{error}</p> : null}
    </section>
  );
}

function ActiveEncounter({
  campaignId,
  encounter,
}: {
  campaignId: Id<'campaigns'>;
  encounter: EncounterView;
}) {
  const endTurn = useMutation(api.encounters.endTurn);
  const removeCondition = useMutation(api.encounters.removeCondition);
  const endEncounter = useMutation(api.encounters.endEncounter);
  const useAbility = useMutation(api.encounters.useAbility);
  const { run, error, busy } = useRun();
  const [rolls, setRolls] = useState<Record<string, string>>({});
  const [keeps, setKeeps] = useState<Record<string, boolean>>({});
  const [pickedAbility, setPickedAbility] = useState<SearchHits[number] | null>(null);
  const [band, setBand] = useState<Band>('17+');
  const first = encounter.participants[0]?.id ?? '';
  const second = encounter.participants[1]?.id ?? first;
  const [actorId, setActorId] = useState(first);
  const [targetId, setTargetId] = useState(second);

  const participantOptions = encounter.participants.map((participant) => (
    <option key={participant.id} value={participant.id}>
      {participant.id}
    </option>
  ));

  return (
    <section className="border border-line bg-ink-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl">Encounter</h2>
        {encounter.viewerIsDirector ? (
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm('End the encounter? Effects end unless kept.'))
                run(() =>
                  endEncounter({
                    campaignId,
                    keepInstanceIds: Object.entries(keeps)
                      .filter(([, keep]) => keep)
                      .map(([instanceId]) => instanceId),
                  }),
                );
            }}
          >
            End encounter
          </Button>
        ) : null}
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {encounter.participants.map((participant) => (
          <li key={participant.id} className="border border-line-soft bg-ink-2 p-3">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-display">{participant.id}</span>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  const asserted: Record<string, number> = {};
                  for (const condition of participant.conditions) {
                    const raw = rolls[condition.instanceId]?.trim();
                    if (raw) asserted[condition.instanceId] = Number(raw);
                  }
                  run(() =>
                    endTurn({
                      campaignId,
                      participantId: participant.id,
                      rolls: Object.keys(asserted).length > 0 ? asserted : undefined,
                    }),
                  );
                }}
              >
                End turn
              </Button>
            </div>
            {participant.recordSlug ? (
              <p className="truncate font-mono text-xs text-text-mute">{participant.recordSlug}</p>
            ) : null}
            {participant.conditions.length === 0 ? (
              <p className="mt-2 text-xs text-text-dim">No conditions</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {participant.conditions.map((condition) => {
                  const removableBy = encounter.viewerIsDirector
                    ? undefined
                    : (condition.sourceParticipantId ?? undefined);
                  const canRemove = encounter.viewerIsDirector || removableBy !== undefined;
                  return (
                    <li key={condition.instanceId} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {condition.conditionSlug}{' '}
                        <span className="text-xs text-text-mute">
                          ({condition.ending}
                          {condition.sourceParticipantId
                            ? ` · from ${condition.sourceParticipantId}`
                            : ''}
                          {condition.sourceRecordSlug ? ` · ${condition.sourceRecordSlug}` : ''})
                        </span>
                      </span>
                      {condition.ending === 'save-ends' ? (
                        <input
                          value={rolls[condition.instanceId] ?? ''}
                          onChange={(event) =>
                            setRolls((current) => ({
                              ...current,
                              [condition.instanceId]: event.target.value,
                            }))
                          }
                          placeholder="auto"
                          aria-label={`Saving throw roll for ${condition.conditionSlug}`}
                          inputMode="numeric"
                          className="h-9 w-14 border border-line bg-ink-1 px-1 text-center text-xs"
                        />
                      ) : null}
                      <label className="flex items-center gap-1 text-xs text-text-mute">
                        <input
                          type="checkbox"
                          checked={Boolean(keeps[condition.instanceId])}
                          onChange={(event) =>
                            setKeeps((current) => ({
                              ...current,
                              [condition.instanceId]: event.target.checked,
                            }))
                          }
                        />
                        keep
                      </label>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy || !canRemove}
                        onClick={() =>
                          run(() =>
                            removeCondition({
                              campaignId,
                              targetParticipantId: participant.id,
                              instanceId: condition.instanceId,
                              asParticipantId: removableBy,
                            }),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-line-soft pt-4">
        <h3 className="type-label text-xs text-text-mute">Use an ability</h3>
        <div className="mt-2">
          <RecordSearch
            campaignId={campaignId}
            pickLabel="Pick"
            requireParsedTier
            onPick={(hit) => {
              setPickedAbility(hit);
              const parsedBand = hit.parsedTiers.find((tier): tier is Band =>
                BANDS.includes(tier as Band),
              );
              if (parsedBand) setBand(parsedBand);
            }}
          />
        </div>
        {pickedAbility ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{pickedAbility.slug}</span>
            <select
              aria-label="Tier outcome"
              className="h-9 border border-line bg-ink-1 px-2 text-sm"
              value={band}
              onChange={(event) => setBand(event.target.value as Band)}
            >
              {pickedAbility.parsedTiers.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
            <select
              aria-label="Acting participant"
              className="h-9 border border-line bg-ink-1 px-2 text-sm"
              value={actorId}
              onChange={(event) => setActorId(event.target.value)}
            >
              {participantOptions}
            </select>
            <span className="text-xs text-text-mute">on</span>
            <select
              aria-label="Target participant"
              className="h-9 border border-line bg-ink-1 px-2 text-sm"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              {participantOptions}
            </select>
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() =>
                run(() =>
                  useAbility({
                    campaignId,
                    artifactId: pickedAbility.artifactId,
                    band,
                    actorParticipantId: actorId,
                    targetParticipantId: targetId,
                  }),
                )
              }
            >
              Use
            </Button>
          </div>
        ) : null}
      </div>

      <EncounterLog campaignId={campaignId} encounterId={encounter.encounterId} />
      {error ? <p className="mt-2 text-sm text-foe">{error}</p> : null}
    </section>
  );
}

function EncounterLog({
  campaignId,
  encounterId,
}: {
  campaignId: Id<'campaigns'>;
  encounterId: Id<'encounters'>;
}) {
  const log = useQuery(api.encounters.listLog, { campaignId, encounterId });
  const scrollRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new entries
  useEffect(() => {
    const pane = scrollRef.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [log?.length]);
  if (log === undefined) return null;
  return (
    <div className="mt-4 border-t border-line-soft pt-4">
      <h3 className="type-label text-xs text-text-mute">Encounter log</h3>
      <div
        ref={scrollRef}
        className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto border border-line bg-ink-2 p-3"
      >
        {log.length === 0 ? (
          <p className="text-sm text-text-dim">Nothing yet.</p>
        ) : (
          log.map((entry) => {
            if (entry.kind === 'table-card')
              return (
                <div key={entry.entryId} className="border border-line bg-ink-1 p-2">
                  <p className="type-label text-xs text-text-mute">Resolve at the table</p>
                  <p className="mt-1 whitespace-pre-wrap font-mono text-xs">{entry.message}</p>
                </div>
              );
            const tone =
              entry.kind === 'invariant-violation' || entry.kind === 'refusal'
                ? 'text-foe'
                : entry.kind === 'warning'
                  ? 'text-accent'
                  : entry.kind === 'not-automated'
                    ? 'text-text-mute italic'
                    : entry.kind === 'informational'
                      ? 'text-text-dim'
                      : 'text-text';
            return (
              <p key={entry.entryId} className={`text-sm ${tone}`}>
                {entry.kind === 'not-automated' ? 'Not automated — ' : ''}
                {entry.message}
              </p>
            );
          })
        )}
      </div>
    </div>
  );
}
