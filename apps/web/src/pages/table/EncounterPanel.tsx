import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
// The printed per-turn budget lives in the engine's one home — never
// re-derived client-side (one canon rule, one implementation).
import { BASE_TURN_BUDGET, DAMAGE_TYPES, type DamageType } from '@engarde/engine';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../primitives';
import { AddGrantSection } from './AddGrantSection';
import { RecordSearch, type SearchHits } from './RecordSearch';
import { ResolutionsSection } from './ResolutionsSection';
import { SquadsSection } from './SquadsSection';
import { TurnRail } from './TurnRail';
import type { ParticipantView } from './economy-contract';
import type { SquadDamageLogData, SquadPoolDelta } from './squad-contract';
import { useRun } from './useRun';

// The encounter surface inside the Table — the pure rules engine mounted
// behind the session lobby. This panel renders engine state and dispatches
// mutations; it adds no rule semantics of its own. What the engine cannot
// automate yet arrives as explicit log receipts ("not automated") and
// verbatim table cards to resolve at the table — nothing is faked.

type EncounterView = NonNullable<ReturnType<typeof useQuery<typeof api.encounters.getActive>>>;

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

/** Director-only manual damage, including the optional N-3 assertion that
 * the entry realizes a printed ability use. The client supplies only an
 * actor + canon reference; the host derives the action cost and printed cap
 * from the record and refuses ambiguous stat blocks. */
function ManualDamageSection({
  campaignId,
  participants,
}: {
  campaignId: Id<'campaigns'>;
  participants: EncounterView['participants'];
}) {
  const applyDamage = useMutation(api.encounters.applyDamage);
  const { run, error, busy } = useRun();
  const [targetId, setTargetId] = useState(participants[0]?.id ?? '');
  const [amount, setAmount] = useState('0');
  const [damageType, setDamageType] = useState<DamageType | ''>('');
  const [reason, setReason] = useState('');
  const [area, setArea] = useState(false);
  const [knockOut, setKnockOut] = useState(false);
  const [assertAbility, setAssertAbility] = useState(false);
  const [abilityRecord, setAbilityRecord] = useState<SearchHits[number] | null>(null);
  const [abilitySlug, setAbilitySlug] = useState('');
  const [actorId, setActorId] = useState(participants[0]?.id ?? '');
  const [partOf, setPartOf] = useState('');
  const numericAmount = Number(amount);
  const invalidAmount = !Number.isInteger(numericAmount) || numericAmount < 0;

  return (
    <section className="mt-4 border border-line-soft bg-ink-2 p-3">
      <h3 className="type-label text-xs text-text-mute">Manual damage (Director)</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          aria-label="Manual damage target"
          className="h-9 border border-line bg-ink-1 px-2 text-sm"
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
        >
          {participants.map((participant) => (
            <option key={participant.id} value={participant.id}>
              {participant.id}
            </option>
          ))}
        </select>
        <input
          aria-label="Manual damage amount"
          className="h-9 w-20 border border-line bg-ink-1 px-2 text-sm"
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <select
          aria-label="Manual damage type"
          className="h-9 border border-line bg-ink-1 px-2 text-sm"
          value={damageType}
          onChange={(event) => setDamageType(event.target.value as DamageType | '')}
        >
          <option value="">untyped</option>
          {DAMAGE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input
          aria-label="Manual damage reason"
          className="h-9 min-w-48 flex-1 border border-line bg-ink-1 px-2 text-sm"
          placeholder="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <label className="flex items-center gap-1 text-xs text-text-mute">
          <input
            type="checkbox"
            checked={area}
            onChange={(event) => setArea(event.target.checked)}
          />
          area
        </label>
        <label className="flex items-center gap-1 text-xs text-text-mute">
          <input
            type="checkbox"
            checked={knockOut}
            onChange={(event) => setKnockOut(event.target.checked)}
          />
          knock out
        </label>
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-text-mute">
        <input
          type="checkbox"
          aria-label="Assert this damage as an ability use"
          checked={assertAbility}
          onChange={(event) => setAssertAbility(event.target.checked)}
        />
        This damage realizes a printed ability use (derive its action debit from canon)
      </label>
      {assertAbility ? (
        <div className="mt-2 border-l-2 border-accent/50 pl-3">
          <RecordSearch
            campaignId={campaignId}
            pickLabel="Assert ability"
            requireParsedTier
            searchLabel="Search manual damage ability"
            onPick={(hit) => {
              setAbilityRecord(hit);
              setAbilitySlug('');
            }}
          />
          {abilityRecord ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs">{abilityRecord.slug}</span>
              <select
                aria-label="Manual damage ability actor"
                className="h-9 border border-line bg-ink-1 px-2 text-sm"
                value={actorId}
                onChange={(event) => setActorId(event.target.value)}
              >
                {participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.id}
                  </option>
                ))}
              </select>
              <input
                aria-label="Manual damage ability slug"
                className="h-9 w-44 border border-line bg-ink-1 px-2 text-xs"
                placeholder="ability-slug (if stat block)"
                value={abilitySlug}
                onChange={(event) => setAbilitySlug(event.target.value)}
              />
              <input
                aria-label="Manual damage parent intent"
                className="h-9 w-40 border border-line bg-ink-1 px-2 text-xs"
                placeholder="partOf intent (optional)"
                value={partOf}
                onChange={(event) => setPartOf(event.target.value)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      <Button
        className="mt-3"
        size="sm"
        variant="primary"
        disabled={busy || invalidAmount || !targetId || (assertAbility && abilityRecord === null)}
        onClick={() => {
          const suffix = abilitySlug.trim().replace(/^#/, '');
          const parentIntentId = partOf.trim();
          run(() =>
            applyDamage({
              campaignId,
              targetParticipantId: targetId,
              amount: numericAmount,
              reason: reason.trim() || 'manual damage entry',
              ...(damageType === '' ? {} : { damageType }),
              ...(area ? { area: true } : {}),
              ...(knockOut ? { knockOut: true } : {}),
              ...(assertAbility && abilityRecord
                ? {
                    abilityAssertion: {
                      actorParticipantId: actorId,
                      abilityArtifactId: `${abilityRecord.artifactId}${suffix ? `#${suffix}` : ''}`,
                      ...(parentIntentId ? { partOf: parentIntentId } : {}),
                    },
                  }
                : {}),
            }),
          );
        }}
      >
        Apply damage
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
  const convertAction = useMutation(api.encounters.convertAction);
  const useTriggeredAction = useMutation(api.encounters.useTriggeredAction);
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
  // Two-phase commit [R-0032]: default stays one tap (dispatch without hold
  // pipelines the commit server-side); holding leaves the resolution open
  // for reactions/modifications on the open-roll card.
  const [holdOpen, setHoldOpen] = useState(false);
  // Triggered-action flow [R-0029/R-0030]: the per-card affordance picks the
  // acting participant; the shared form below picks the printed ability.
  // Free/per-round-cap derive server-side from the compiled header [I-6d];
  // the cost-mode select is the asserted-case manual override only.
  const [triggeredActorId, setTriggeredActorId] = useState('');
  const [triggeredRecord, setTriggeredRecord] = useState<SearchHits[number] | null>(null);
  const [triggeredAbilitySlug, setTriggeredAbilitySlug] = useState('');
  const [triggeredCostMode, setTriggeredCostMode] = useState<'' | 'free' | 'counts'>('');
  // Trigger reference [I-6e]: an exact engine-ledger occurrence wins;
  // asserted text is the fallback.
  const [triggerOccurrenceId, setTriggerOccurrenceId] = useState('');
  const [triggerText, setTriggerText] = useState('');
  const recentOccurrences = encounter.occurrences.slice(-8).reverse();
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

      <TurnRail campaignId={campaignId} encounter={encounter} />

      <ResolutionsSection
        campaignId={campaignId}
        resolutions={encounter.resolutions}
        participantIds={new Set(encounter.participants.map((participant) => participant.id))}
        viewerIsDirector={encounter.viewerIsDirector}
      />

      {encounter.viewerIsDirector ? (
        // Director grant form [I-6f]: without it a web-only table cannot
        // suppress the dazed Solo-Action warn — R-0030's promise.
        <>
          <AddGrantSection campaignId={campaignId} participants={encounter.participants} />
          <ManualDamageSection campaignId={campaignId} participants={encounter.participants} />
        </>
      ) : null}

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
            <ParticipantEconomy
              participant={participant}
              inCombat={encounter.turnState !== null}
              activeTurnId={encounter.turnState?.activeTurnId ?? null}
              viewerIsDirector={encounter.viewerIsDirector}
              busy={busy}
              onConvert={(to) =>
                run(() => convertAction({ campaignId, participantId: participant.id, to }))
              }
              onTriggeredAction={() => setTriggeredActorId(participant.id)}
            />
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

      <SquadsSection
        campaignId={campaignId}
        squads={encounter.squads}
        participants={encounter.participants}
        viewerIsDirector={encounter.viewerIsDirector}
      />

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
                <label className="flex items-center gap-1 text-xs text-text-mute">
                  {/* R-0032 two-phase commit: hold leaves the resolution
                      open on the open-roll card; default is one tap. */}
                  <input
                    type="checkbox"
                    aria-label="Hold the roll open"
                    checked={holdOpen}
                    onChange={(event) => setHoldOpen(event.target.checked)}
                  />
                  hold the roll open
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
                        ...(holdOpen ? { hold: true } : {}),
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

      <div className="mt-4 border-t border-line-soft pt-4">
        <h3 className="type-label text-xs text-text-mute">Use a triggered action</h3>
        {/* "You can use one triggered action per round, either on your turn
            or another creature's turn, but only when the action's trigger
            occurs" — the per-round counter warns, never blocks [R-0030]. The
            printed ability is a real corpus record; abilities living inside
            a statblock address as record#ability-slug. */}
        <div className="mt-2">
          <RecordSearch
            campaignId={campaignId}
            pickLabel="Pick triggered"
            requireParsedTier={false}
            searchLabel="Search triggered actions"
            onPick={(hit) => {
              setTriggeredRecord(hit);
              setTriggeredAbilitySlug('');
            }}
          />
        </div>
        {triggeredRecord ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{triggeredRecord.slug}</span>
            <input
              value={triggeredAbilitySlug}
              onChange={(event) => setTriggeredAbilitySlug(event.target.value)}
              placeholder="ability slug (e.g. meat-shield)"
              aria-label="Triggered ability within the record"
              className="h-11 w-44 border border-line bg-ink-1 px-2 text-xs"
            />
            <select
              aria-label="Triggered actor"
              className="h-11 border border-line bg-ink-1 px-2 text-sm"
              value={triggeredActorId === '' ? first : triggeredActorId}
              onChange={(event) => setTriggeredActorId(event.target.value)}
            >
              {participantOptions}
            </select>
            {/* Free/per-round-cap derive from the compiled header on the
                server [I-6d]; overriding is the asserted-case escape. */}
            <select
              aria-label="Triggered cost override"
              className="h-11 border border-line bg-ink-1 px-2 text-sm"
              value={triggeredCostMode}
              onChange={(event) =>
                setTriggeredCostMode(event.target.value as '' | 'free' | 'counts')
              }
            >
              <option value="">cost from the printed header</option>
              <option value="free">assert free (bypasses the round counter)</option>
              <option value="counts">assert counts against the round limit</option>
            </select>
            {/* Exact occurrence-ledger entries [R-0040/I-6e]; asserted text
                stays the fallback for table-only events. */}
            <select
              aria-label="Trigger occurrence"
              className="h-11 max-w-72 border border-line bg-ink-1 px-2 text-sm"
              value={triggerOccurrenceId}
              onChange={(event) => setTriggerOccurrenceId(event.target.value)}
            >
              <option value="">no occurrence — assert the trigger below</option>
              {recentOccurrences.map((occurrence) => (
                <option key={occurrence.occurrenceId} value={occurrence.occurrenceId}>
                  {occurrence.occurrenceId} · {occurrence.kind}
                </option>
              ))}
            </select>
            <input
              value={triggerText}
              onChange={(event) => setTriggerText(event.target.value)}
              placeholder="asserted trigger (optional)"
              aria-label="Asserted trigger"
              className="h-11 w-52 border border-line bg-ink-1 px-2 text-xs"
            />
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => {
                const suffix = triggeredAbilitySlug.trim();
                const text = triggerText.trim();
                run(() =>
                  useTriggeredAction({
                    campaignId,
                    participantId: triggeredActorId === '' ? first : triggeredActorId,
                    abilityArtifactId:
                      suffix.length > 0
                        ? `${triggeredRecord.artifactId}#${suffix}`
                        : triggeredRecord.artifactId,
                    ...(triggeredCostMode === 'free'
                      ? { free: true }
                      : triggeredCostMode === 'counts'
                        ? { free: false }
                        : {}),
                    ...(triggerOccurrenceId !== ''
                      ? { triggerOccurrenceId }
                      : text.length > 0
                        ? { triggerText: text }
                        : {}),
                  }),
                );
              }}
            >
              Use triggered action
            </Button>
          </div>
        ) : null}
      </div>

      <EncounterLog campaignId={campaignId} encounterId={encounter.encounterId} />
      {error ? <p className="mt-2 text-sm text-foe">{error}</p> : null}
    </section>
  );
}

/** Per-card action-economy block [R-0029/R-0030, design §3]: budget chips
 * (used vs printed-1-plus-granted per cost), the per-round triggered
 * counter, pending action/turn grants with their escape flags, and the
 * convert-action affordance ("You can also turn your main action into a
 * move action or a maneuver"). The conversion is the acting participant's
 * OWN printed choice [I-5]: the Director sees it on every card
 * (adjudication); a player sees it on the ACTIVE participant's card — this
 * substrate binds no user to a participant, so active-turn is the honest
 * client-side proxy for "my character, on my turn" while the backend stays
 * member-reachable with attribution. Economy state exists only in combat. */
function ParticipantEconomy({
  participant,
  inCombat,
  activeTurnId,
  viewerIsDirector,
  busy,
  onConvert,
  onTriggeredAction,
}: {
  participant: ParticipantView;
  inCombat: boolean;
  activeTurnId: string | null;
  viewerIsDirector: boolean;
  busy: boolean;
  onConvert: (to: 'maneuver' | 'move-action') => void;
  onTriggeredAction: () => void;
}) {
  if (!inCombat) return null;
  const showConvert = viewerIsDirector || participant.id === activeTurnId;
  const chip = (cost: 'main-action' | 'maneuver' | 'move-action', label: string) => {
    const cell = participant.actionBudget[cost] ?? { used: 0, granted: 0 };
    return (
      <span
        aria-label={`${participant.id} ${cost} ${cell.used}/${BASE_TURN_BUDGET + cell.granted}`}
        className="border border-line-soft bg-ink-1 px-2 py-1"
      >
        <span className="font-mono">
          {cell.used}/{BASE_TURN_BUDGET + cell.granted}
        </span>{' '}
        <span className="type-label text-text-mute">{label}</span>
      </span>
    );
  };
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        {chip('main-action', 'Main')}
        {chip('maneuver', 'Maneuver')}
        {chip('move-action', 'Move')}
        <span
          aria-label={`${participant.id} triggered ${participant.triggeredThisRound}/${participant.triggeredActionLimit}`}
          className="border border-line-soft bg-ink-1 px-2 py-1"
        >
          <span className="font-mono">
            {participant.triggeredThisRound}/{participant.triggeredActionLimit}
          </span>{' '}
          <span className="type-label text-text-mute">Triggered</span>
        </span>
      </div>
      {participant.actionGrants.length > 0 || participant.turnGrants.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1">
          {participant.actionGrants.map((grant) => {
            const escapes = [
              grant.escapes.ignoresDazed ? 'ignores dazed' : null,
              grant.escapes.ignoresSurprised ? 'ignores surprised' : null,
              grant.escapes.offTurn ? 'off-turn' : null,
            ].filter((flag): flag is string => flag !== null);
            return (
              <li key={grant.grantId} className="text-sm text-text-dim">
                granted: additional {grant.cost}
                {grant.magnitude > 1 ? ` ×${grant.magnitude}` : ''}
                <span className="text-xs text-text-mute">
                  {escapes.length > 0 ? ` (${escapes.join(' · ')})` : ''}
                  {grant.expiry === 'end-of-round' ? ' (until end of round)' : ''}
                  {grant.sourceRecordSlug ? ` · ${grant.sourceRecordSlug}` : ''}
                  {grant.sourceParticipantId ? ` · from ${grant.sourceParticipantId}` : ''}
                </span>
              </li>
            );
          })}
          {participant.turnGrants.map((grant) => (
            <li key={grant.grantId} className="text-sm text-text-dim">
              granted: {grant.mode === 'allowance' ? 'extra turn allowance' : 'turn insertion'}
              {grant.magnitude > 1 ? ` ×${grant.magnitude}` : ''}
              <span className="text-xs text-text-mute">
                {grant.constraint === 'no-consecutive' ? ' (no consecutive turns)' : ''}
                {grant.expiry === 'end-of-round' ? ' (until end of round)' : ''}
                {grant.sourceRecordSlug ? ` · ${grant.sourceRecordSlug}` : ''}
                {grant.sourceParticipantId ? ` · from ${grant.sourceParticipantId}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          aria-label={`Triggered action for ${participant.id}`}
          onClick={onTriggeredAction}
        >
          Triggered action
        </Button>
        {showConvert ? (
          <>
            <Button
              size="sm"
              disabled={busy}
              aria-label={`Convert main action to maneuver for ${participant.id}`}
              onClick={() => onConvert('maneuver')}
            >
              Main → maneuver
            </Button>
            <Button
              size="sm"
              disabled={busy}
              aria-label={`Convert main action to move action for ${participant.id}`}
              onClick={() => onConvert('move-action')}
            >
              Main → move
            </Button>
          </>
        ) : null}
      </div>
    </div>
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
            const squadData = entry.data as {
              squadDamage?: SquadDamageLogData;
              squadPoolDeltas?: SquadPoolDelta[];
            } | null;
            if (squadData?.squadDamage) {
              // Squad-pool damage receipt [R-0024..R-0026]: the engine's
              // persisted breakdown — pool delta, discarded overflow, kills.
              const receipt = squadData.squadDamage;
              const delta = squadData.squadPoolDeltas?.find(
                (candidate) => candidate.squadId === receipt.squadId,
              );
              return (
                <div key={entry.entryId} className="border border-line-soft bg-ink-1 p-2">
                  <p className="text-sm">{entry.message}</p>
                  <p className="mt-1 font-mono text-xs text-text-mute">
                    {delta
                      ? `pool ${delta.from} → ${delta.to}`
                      : `pool −${receipt.fullPoolReduction}`}
                    {receipt.area ? ' · area' : ''}
                    {receipt.weaknessApplied ? ' · weakness applied' : ''}
                    {receipt.immunityApplied ? ' · immunity applied' : ''}
                    {receipt.overflowDiscarded > 0
                      ? ` · ${receipt.overflowDiscarded} discarded`
                      : ''}{' '}
                    · {receipt.kills} kill{receipt.kills === 1 ? '' : 's'}
                  </p>
                </div>
              );
            }
            if (entry.kind === 'warning')
              // R-0030 warn-and-apply must be VISIBLE: rule-violation
              // receipts render loud and distinct, never buried in the
              // receipt stream (permissive engine — warn, never block).
              return (
                <div key={entry.entryId} role="alert" className="border border-accent bg-ink-1 p-2">
                  <p className="type-label text-xs text-accent">Rule warning</p>
                  <p className="mt-1 text-sm text-accent">{entry.message}</p>
                </div>
              );
            const tone =
              entry.kind === 'invariant-violation' || entry.kind === 'refusal'
                ? 'text-foe'
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
