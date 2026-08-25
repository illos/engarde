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

/** The engine's persisted power-roll breakdown (LogEntry.data.powerRoll). */
interface PowerRollLogData {
  dice: [number, number];
  diceAsserted: boolean;
  characteristicValue: number;
  characteristicLabel: string;
  edges: number;
  banes: number;
  resolution: { total: number; tier: number; naturalTopEnd: boolean };
}

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
  requireEffect = false,
  searchLabel,
}: {
  campaignId: Id<'campaigns'>;
  onPick: (hit: SearchHits[number]) => void;
  pickLabel: string;
  requireParsedTier: boolean;
  requireEffect?: boolean;
  searchLabel: string;
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
        aria-label={searchLabel}
        className="h-11 w-full border border-line bg-ink-2 px-3 text-sm text-text placeholder:text-text-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
      />
      {hits && hits.length > 0 ? (
        <ul className="mt-2 flex flex-col divide-y divide-line-soft border border-line bg-ink-2">
          {hits.map((hit) => {
            const usable =
              (!requireParsedTier || hit.parsedTiers.length > 0) &&
              (!requireEffect || hit.effects.length > 0);
            return (
              <li key={hit.artifactId} className="flex items-center gap-2 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs">{hit.slug}</p>
                  <p className="truncate text-xs text-text-mute">
                    {hit.autoRollable
                      ? 'rolls automatically'
                      : hit.parsedTiers.length > 0
                        ? `tiers parsed: ${hit.parsedTiers.join(', ')}`
                        : hit.effects.length > 0
                          ? `${hit.effects.length} Effect instruction${hit.effects.length === 1 ? '' : 's'}`
                          : 'nothing automatable yet — plays as a verbatim card'}
                    {hit.hasStats ? ' · stat block' : ''}
                    {hit.effects.length > 0 && (hit.autoRollable || hit.parsedTiers.length > 0)
                      ? ` · ${hit.effects.length} Effect${hit.effects.length === 1 ? '' : 's'}`
                      : ''}
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
          searchLabel="Search canon records"
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
  const useEffectInstruction = useMutation(api.encounters.useEffect);
  const clearTerrainFact = useMutation(api.encounters.clearTerrainFact);
  const { run, error, busy } = useRun();
  const [rolls, setRolls] = useState<Record<string, string>>({});
  const [keeps, setKeeps] = useState<Record<string, boolean>>({});
  const [pickedAbility, setPickedAbility] = useState<SearchHits[number] | null>(null);
  const [pickedEffect, setPickedEffect] = useState<SearchHits[number] | null>(null);
  const [effectOrdinal, setEffectOrdinal] = useState(1);
  const [effectTargetless, setEffectTargetless] = useState(false);
  const [band, setBand] = useState<Band>('17+');
  const [assertTier, setAssertTier] = useState(false);
  const [edges, setEdges] = useState('0');
  const [banes, setBanes] = useState('0');
  const [diceText, setDiceText] = useState('');
  const [knockOut, setKnockOut] = useState(false);
  const first = encounter.participants[0]?.id ?? '';
  const second = encounter.participants[1]?.id ?? first;
  const [actorId, setActorId] = useState(first);
  const [targetId, setTargetId] = useState(second);
  const [effectTargetIds, setEffectTargetIds] = useState<string[]>(second ? [second] : []);
  const [effectKnockOut, setEffectKnockOut] = useState(false);
  // Comma-separated object labels for a characteristic test: objects never
  // roll and automatically obtain a tier 1 result [R-0007].
  const [effectObjectLabels, setEffectObjectLabels] = useState('');
  // "Can spend" is an offer [R-0018]: every bound target answers, declining
  // is legal. Absent = accepts (auto-apply default); checked off = declines.
  const [recoveryDeclines, setRecoveryDeclines] = useState<Record<string, boolean>>({});
  // Optional Director note attached to a clear-terrain-fact dispatch [R-0022].
  const [terrainReasons, setTerrainReasons] = useState<Record<string, string>>({});
  const selectedEffect = pickedEffect?.effects.find(
    (effect) => effect.effectOrdinal === effectOrdinal,
  );

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
            {participant.vitals ? (
              <div className="mt-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono">
                    {participant.vitals.staminaCurrent}
                    {participant.vitals.staminaTemporary > 0
                      ? ` (+${participant.vitals.staminaTemporary} temp)`
                      : ''}
                    /{participant.vitals.staminaMax}
                  </span>
                  <span className="type-label text-text-mute">Stamina</span>
                  {participant.vitals.dead ? (
                    <span className="border border-foe px-1 text-foe">dead</span>
                  ) : participant.vitals.dying ? (
                    <span className="border border-foe px-1 text-foe">dying</span>
                  ) : participant.vitals.winded ? (
                    <span className="border border-accent px-1 text-accent">winded</span>
                  ) : null}
                </div>
                <div className="mt-1 h-1.5 w-full bg-ink-1" aria-hidden>
                  <div
                    className={`h-full ${participant.vitals.dying ? 'bg-foe' : 'bg-accent'}`}
                    style={{
                      width: `${Math.max(0, Math.min(100, (participant.vitals.staminaCurrent / participant.vitals.staminaMax) * 100))}%`,
                    }}
                  />
                </div>
                {participant.vitals.recoveriesCurrent !== null &&
                participant.vitals.recoveriesMax !== null ? (
                  // Recoveries render only when tracked [R-0018/R-0019] —
                  // null is untracked and omitted, never shown as zero.
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="font-mono">
                      {participant.vitals.recoveriesCurrent}/{participant.vitals.recoveriesMax}
                    </span>
                    <span className="type-label text-text-mute">Recoveries</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-xs text-text-mute italic">
                Table mode — no stat automation for this record
              </p>
            )}
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
            {participant.grants.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-1">
                {participant.grants.map((grant) => (
                  <li key={grant.grantId} className="text-sm text-text-dim">
                    pending:{' '}
                    {grant.direction === 'inbound'
                      ? `next strike against them carries a ${grant.polarity}`
                      : `${grant.polarity} on their next ${
                          grant.scope === 'strike' ? 'strike' : 'power roll'
                        }`}
                    <span className="text-xs text-text-mute">
                      {grant.window === 'end-of-targets-next-turn'
                        ? ' (until end of their next turn)'
                        : ''}
                      {grant.sourceRecordSlug ? ` · ${grant.sourceRecordSlug}` : ''}
                      {grant.sourceParticipantId ? ` · from ${grant.sourceParticipantId}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      {encounter.terrainFacts.length > 0 ? (
        <div className="mt-4 border-t border-line-soft pt-4">
          <h3 className="type-label text-xs text-text-mute">Terrain</h3>
          {/* Recorded terrain alterations [R-0022]: attributed facts shown at
              the table; the movement cost stays table-adjudicated. Clearing
              is the Director's adjudication — director-only affordance. */}
          <ul className="mt-2 flex flex-col gap-1">
            {encounter.terrainFacts.map((fact) => (
              <li key={fact.factId} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span>{fact.terrain} terrain</span>{' '}
                  <span className="text-xs text-text-mute">
                    {fact.areaText ? `(${fact.areaText})` : ''}
                    {fact.sourceRecordSlug ? ` · ${fact.sourceRecordSlug}` : ''}
                    {fact.createdBy ? ` · from ${fact.createdBy}` : ''}
                  </span>
                </span>
                {encounter.viewerIsDirector ? (
                  <>
                    <input
                      value={terrainReasons[fact.factId] ?? ''}
                      onChange={(event) =>
                        setTerrainReasons((current) => ({
                          ...current,
                          [fact.factId]: event.target.value,
                        }))
                      }
                      placeholder="reason (optional)"
                      aria-label={`Reason for clearing ${fact.factId}`}
                      className="h-9 w-32 border border-line bg-ink-1 px-2 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      onClick={() => {
                        const reason = terrainReasons[fact.factId]?.trim();
                        run(() =>
                          clearTerrainFact({
                            campaignId,
                            factId: fact.factId,
                            ...(reason ? { reason } : {}),
                          }),
                        );
                      }}
                    >
                      Clear
                    </Button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 border-t border-line-soft pt-4">
        <h3 className="type-label text-xs text-text-mute">Use an ability</h3>
        <div className="mt-2">
          <RecordSearch
            campaignId={campaignId}
            pickLabel="Pick"
            requireParsedTier
            searchLabel="Search abilities"
            onPick={(hit) => {
              setPickedAbility(hit);
              setAssertTier(false);
              const parsedBand = hit.parsedTiers.find((tier): tier is Band =>
                BANDS.includes(tier as Band),
              );
              if (parsedBand) setBand(parsedBand);
            }}
          />
        </div>
        {pickedAbility ? (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs">{pickedAbility.slug}</span>
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
            </div>
            {pickedAbility.autoRollable && !assertTier ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-text-mute">
                  edges
                  <input
                    value={edges}
                    onChange={(event) => setEdges(event.target.value)}
                    inputMode="numeric"
                    aria-label="Edges"
                    className="h-9 w-10 border border-line bg-ink-1 px-1 text-center text-xs"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-text-mute">
                  banes
                  <input
                    value={banes}
                    onChange={(event) => setBanes(event.target.value)}
                    inputMode="numeric"
                    aria-label="Banes"
                    className="h-9 w-10 border border-line bg-ink-1 px-1 text-center text-xs"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-text-mute">
                  dice
                  <input
                    value={diceText}
                    onChange={(event) => setDiceText(event.target.value)}
                    placeholder="auto"
                    aria-label="Asserted dice (e.g. 7 4)"
                    className="h-9 w-16 border border-line bg-ink-1 px-1 text-center text-xs"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-text-mute">
                  <input
                    type="checkbox"
                    checked={knockOut}
                    onChange={(event) => setKnockOut(event.target.checked)}
                  />
                  knock out, not kill
                </label>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    const diceRaw = diceText.trim();
                    const dice =
                      diceRaw.length > 0
                        ? diceRaw
                            .split(/[\s,+]+/)
                            .map(Number)
                            .filter((die) => Number.isFinite(die))
                        : undefined;
                    run(() =>
                      useAbility({
                        campaignId,
                        artifactId: pickedAbility.artifactId,
                        actorParticipantId: actorId,
                        targetParticipantIds: [targetId],
                        dice,
                        edges: Number(edges) || 0,
                        banes: Number(banes) || 0,
                        knockOut: knockOut || undefined,
                      }),
                    );
                  }}
                >
                  Roll
                </Button>
                <button
                  type="button"
                  className="text-xs text-text-mute underline"
                  onClick={() => setAssertTier(true)}
                >
                  assert a tier instead
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
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
                        targetParticipantIds: [targetId],
                      }),
                    )
                  }
                >
                  Use (asserted tier)
                </Button>
                {pickedAbility.autoRollable ? (
                  <button
                    type="button"
                    className="text-xs text-text-mute underline"
                    onClick={() => setAssertTier(false)}
                  >
                    back to rolling
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-4 border-t border-line-soft pt-4">
        <h3 className="type-label text-xs text-text-mute">Resolve an Effect instruction</h3>
        <div className="mt-2">
          <RecordSearch
            campaignId={campaignId}
            pickLabel="Pick Effect"
            requireParsedTier={false}
            requireEffect
            searchLabel="Search effects"
            onPick={(hit) => {
              setPickedEffect(hit);
              setEffectOrdinal(hit.effects[0]?.effectOrdinal ?? 1);
              setEffectTargetless(false);
              setEffectTargetIds(targetId ? [targetId] : []);
              setEffectKnockOut(false);
              setEffectObjectLabels('');
              setRecoveryDeclines({});
            }}
          />
        </div>
        {pickedEffect && selectedEffect ? (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs">{pickedEffect.slug}</span>
              {pickedEffect.effects.length > 1 ? (
                <select
                  aria-label="Effect instruction"
                  className="h-9 border border-line bg-ink-1 px-2 text-sm"
                  value={effectOrdinal}
                  onChange={(event) => {
                    setEffectOrdinal(Number(event.target.value));
                    setEffectTargetless(false);
                    setEffectKnockOut(false);
                    setEffectObjectLabels('');
                    setRecoveryDeclines({});
                  }}
                >
                  {pickedEffect.effects.map((effect) => (
                    <option key={effect.effectOrdinal} value={effect.effectOrdinal}>
                      Effect #{effect.effectOrdinal} · {effect.resolutionKind}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-text-mute">
                  Effect #{selectedEffect.effectOrdinal} · {selectedEffect.resolutionKind}
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap border border-line-soft bg-ink-2 p-2 font-mono text-xs">
              {selectedEffect.sourceText}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Effect acting participant"
                className="h-9 border border-line bg-ink-1 px-2 text-sm"
                value={actorId}
                onChange={(event) => setActorId(event.target.value)}
              >
                {participantOptions}
              </select>
              <span className="text-xs text-text-mute">on</span>
              <fieldset className="flex flex-wrap items-center gap-2" disabled={effectTargetless}>
                <legend className="sr-only">Effect targets</legend>
                {encounter.participants.map((participant) => (
                  <label
                    key={participant.id}
                    className="flex items-center gap-1 text-xs text-text-mute"
                  >
                    <input
                      type="checkbox"
                      aria-label={`Effect target ${participant.id}`}
                      checked={effectTargetIds.includes(participant.id)}
                      onChange={(event) =>
                        setEffectTargetIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, participant.id])]
                            : current.filter((target) => target !== participant.id),
                        )
                      }
                    />
                    {participant.id}
                  </label>
                ))}
              </fieldset>
              {selectedEffect.resolutionKind === 'table' ||
              selectedEffect.resolutionKind === 'terrain-fact' ? (
                // A terrain fact records against the encounter, not a
                // participant [R-0022] — targetless dispatch is legal.
                <label className="flex items-center gap-1 text-xs text-text-mute">
                  <input
                    type="checkbox"
                    checked={effectTargetless}
                    onChange={(event) => setEffectTargetless(event.target.checked)}
                  />
                  no participant target
                </label>
              ) : null}
              {selectedEffect.resolutionKind === 'spend-recovery' && effectTargetIds.length > 0 ? (
                // "Can spend" is an offer [R-0018]: each bound participant
                // answers; default accepts, unchecking declines.
                <fieldset className="flex flex-wrap items-center gap-2">
                  <legend className="sr-only">Recovery offer answers</legend>
                  {effectTargetIds.map((participantId) => (
                    <label
                      key={participantId}
                      className="flex items-center gap-1 text-xs text-text-mute"
                    >
                      <input
                        type="checkbox"
                        aria-label={`${participantId} spends a Recovery`}
                        checked={!recoveryDeclines[participantId]}
                        onChange={(event) =>
                          setRecoveryDeclines((current) => ({
                            ...current,
                            [participantId]: !event.target.checked,
                          }))
                        }
                      />
                      {participantId} spends
                    </label>
                  ))}
                </fieldset>
              ) : null}
              {selectedEffect.resolutionKind === 'test' ? (
                <label className="flex items-center gap-1 text-xs text-text-mute">
                  objects
                  <input
                    type="text"
                    aria-label="Test object targets"
                    placeholder="door, statue"
                    className="h-9 border border-line bg-ink-1 px-2 text-sm"
                    value={effectObjectLabels}
                    onChange={(event) => setEffectObjectLabels(event.target.value)}
                  />
                </label>
              ) : null}
              {selectedEffect.resolutionKind === 'damage' ||
              selectedEffect.resolutionKind === 'test' ? (
                <label className="flex items-center gap-1 text-xs text-text-mute">
                  <input
                    type="checkbox"
                    aria-label="Knock out with Effect damage"
                    checked={effectKnockOut}
                    onChange={(event) => setEffectKnockOut(event.target.checked)}
                  />
                  knock out, not kill
                </label>
              ) : null}
              <Button
                variant="primary"
                size="sm"
                disabled={
                  busy ||
                  (!effectTargetless &&
                    effectTargetIds.length === 0 &&
                    !(
                      selectedEffect.resolutionKind === 'test' &&
                      effectObjectLabels.trim().length > 0
                    ))
                }
                onClick={() => {
                  const objectLabels = effectObjectLabels
                    .split(',')
                    .map((label) => label.trim())
                    .filter((label) => label.length > 0);
                  return run(() =>
                    useEffectInstruction({
                      campaignId,
                      artifactId: pickedEffect.artifactId,
                      effectOrdinal: selectedEffect.effectOrdinal,
                      actorParticipantId: actorId,
                      targetParticipantIds: effectTargetless ? [] : effectTargetIds,
                      ...(selectedEffect.resolutionKind === 'test' && objectLabels.length > 0
                        ? { objectTargetLabels: objectLabels }
                        : {}),
                      ...((selectedEffect.resolutionKind === 'damage' ||
                        selectedEffect.resolutionKind === 'test') &&
                      effectKnockOut
                        ? { knockOut: true }
                        : {}),
                      // Every bound target answers the Recovery offer
                      // [R-0018]: true = spends, false = declines.
                      ...(selectedEffect.resolutionKind === 'spend-recovery'
                        ? {
                            recoverySpends: Object.fromEntries(
                              effectTargetIds.map((participantId) => [
                                participantId,
                                !recoveryDeclines[participantId],
                              ]),
                            ),
                          }
                        : {}),
                    }),
                  );
                }}
              >
                Resolve Effect
              </Button>
            </div>
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
            if (entry.kind === 'table-card' || entry.kind === 'table-directive')
              return (
                <div key={entry.entryId} className="border border-line bg-ink-1 p-2">
                  <p className="type-label text-xs text-text-mute">Resolve at the table</p>
                  <p className="mt-1 whitespace-pre-wrap font-mono text-xs">{entry.message}</p>
                </div>
              );
            const rollData = (entry.data as { powerRoll?: PowerRollLogData } | null)?.powerRoll;
            if (rollData)
              return (
                <div key={entry.entryId} className="border border-line-soft bg-ink-1 p-2">
                  <p className="text-sm">{entry.message}</p>
                  <p className="mt-1 font-mono text-xs text-text-mute">
                    {rollData.dice[0]}+{rollData.dice[1]}
                    {rollData.diceAsserted ? ' (asserted)' : ''} · +{rollData.characteristicValue} (
                    {rollData.characteristicLabel})
                    {rollData.edges > 0 ? ` · ${rollData.edges} edge(s)` : ''}
                    {rollData.banes > 0 ? ` · ${rollData.banes} bane(s)` : ''} · total{' '}
                    {rollData.resolution.total} → tier {rollData.resolution.tier}
                    {rollData.resolution.naturalTopEnd ? ' · natural 19–20' : ''}
                  </p>
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
