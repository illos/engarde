import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
// Action grants extend only the per-turn budget counters — the options come
// from the engine's one-home BUDGET_ACTION_COSTS enum [M-2], never a local
// re-listing of the wide cost vocabulary.
import { BUDGET_ACTION_COSTS, type BudgetActionCost } from '@engarde/engine';
import { useMutation } from 'convex/react';
import { useState } from 'react';
import { Button } from '../../primitives';
import type { ParticipantView } from './economy-contract';
import { useRun } from './useRun';

/**
 * Director grant form [I-6f, design §3, R-0030]: all three grant kinds
 * through the existing addGrant mutation. Escape-flagged action grants are
 * what suppress the printed-escape warnings (a dazed Solo Action spend must
 * NOT warn — R-0030's promise), so a web-only table needs this affordance;
 * turn grants cover Director-asserted scheduling; next-roll grants are the
 * Director's edge/bane assertion. Consumption is silent — printed escapes
 * never produce spurious warnings.
 */
export function AddGrantSection({
  campaignId,
  participants,
}: {
  campaignId: Id<'campaigns'>;
  participants: ParticipantView[];
}) {
  const addGrant = useMutation(api.encounters.addGrant);
  const { run, error, busy } = useRun();
  const [targetId, setTargetId] = useState('');
  const [kind, setKind] = useState<'action' | 'turn' | 'next-roll'>('action');
  const [magnitudeText, setMagnitudeText] = useState('1');
  const [expiresEndOfRound, setExpiresEndOfRound] = useState(false);
  const [sourceArtifactId, setSourceArtifactId] = useState('');
  // action-kind fields
  const [cost, setCost] = useState<BudgetActionCost>('main-action');
  const [ignoresDazed, setIgnoresDazed] = useState(false);
  const [ignoresSurprised, setIgnoresSurprised] = useState(false);
  const [offTurn, setOffTurn] = useState(false);
  // turn-kind fields
  const [turnMode, setTurnMode] = useState<'allowance' | 'insertion'>('allowance');
  const [noConsecutive, setNoConsecutive] = useState(false);
  // next-roll fields
  const [polarity, setPolarity] = useState<'edge' | 'double-edge' | 'bane' | 'double-bane'>('edge');
  const [scope, setScope] = useState<'strike' | 'power-roll'>('strike');
  const [direction, setDirection] = useState<'outbound' | 'inbound'>('outbound');
  const [untilTargetsNextTurn, setUntilTargetsNextTurn] = useState(false);

  const first = participants[0]?.id ?? '';
  const resolvedTarget = targetId === '' ? first : targetId;
  const magnitude = Number(magnitudeText.trim());
  const magnitudeValid = Number.isInteger(magnitude) && magnitude >= 1;

  return (
    <div className="mt-4 border border-line bg-ink-2 p-3">
      <h3 className="type-label text-xs text-text-mute">Grant (Director)</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          aria-label="Grant target"
          className="h-11 border border-line bg-ink-1 px-2 text-sm"
          value={resolvedTarget}
          onChange={(event) => setTargetId(event.target.value)}
        >
          {participants.map((participant) => (
            <option key={participant.id} value={participant.id}>
              {participant.id}
            </option>
          ))}
        </select>
        <select
          aria-label="Grant kind"
          className="h-11 border border-line bg-ink-1 px-2 text-sm"
          value={kind}
          onChange={(event) => setKind(event.target.value as 'action' | 'turn' | 'next-roll')}
        >
          <option value="action">extra action</option>
          <option value="turn">turn scheduling</option>
          <option value="next-roll">next-roll edge/bane</option>
        </select>
        {kind === 'action' ? (
          <select
            aria-label="Granted action cost"
            className="h-11 border border-line bg-ink-1 px-2 text-sm"
            value={cost}
            onChange={(event) => setCost(event.target.value as BudgetActionCost)}
          >
            {BUDGET_ACTION_COSTS.map((budgetCost) => (
              <option key={budgetCost} value={budgetCost}>
                {budgetCost}
              </option>
            ))}
          </select>
        ) : null}
        {kind === 'turn' ? (
          <select
            aria-label="Turn grant mode"
            className="h-11 border border-line bg-ink-1 px-2 text-sm"
            value={turnMode}
            onChange={(event) => setTurnMode(event.target.value as 'allowance' | 'insertion')}
          >
            <option value="allowance">extra turn allowance</option>
            <option value="insertion">turn insertion</option>
          </select>
        ) : null}
        {kind === 'next-roll' ? (
          <>
            <select
              aria-label="Next-roll polarity"
              className="h-11 border border-line bg-ink-1 px-2 text-sm"
              value={polarity}
              onChange={(event) =>
                setPolarity(event.target.value as 'edge' | 'double-edge' | 'bane' | 'double-bane')
              }
            >
              <option value="edge">edge</option>
              <option value="double-edge">double edge</option>
              <option value="bane">bane</option>
              <option value="double-bane">double bane</option>
            </select>
            <select
              aria-label="Next-roll scope"
              className="h-11 border border-line bg-ink-1 px-2 text-sm"
              value={scope}
              onChange={(event) => setScope(event.target.value as 'strike' | 'power-roll')}
            >
              <option value="strike">next strike</option>
              <option value="power-roll">next power roll</option>
            </select>
            <select
              aria-label="Next-roll direction"
              className="h-11 border border-line bg-ink-1 px-2 text-sm"
              value={direction}
              onChange={(event) => setDirection(event.target.value as 'outbound' | 'inbound')}
            >
              <option value="outbound">outbound (their roll)</option>
              <option value="inbound">inbound (rolls against them)</option>
            </select>
          </>
        ) : null}
        {kind !== 'next-roll' ? (
          <label className="flex items-center gap-1 text-xs text-text-mute">
            ×
            <input
              value={magnitudeText}
              onChange={(event) => setMagnitudeText(event.target.value)}
              inputMode="numeric"
              aria-label="Grant magnitude"
              className="h-11 w-12 border border-line bg-ink-1 px-1 text-center text-xs"
            />
          </label>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {kind === 'action' ? (
          // Printed escapes ride grants, never warnings [R-0030]: e.g.
          // Solo Action spends work "even if you are dazed" — the flags
          // below are what keep those uses warning-free.
          <>
            <label className="flex min-h-11 items-center gap-1 text-xs text-text-mute">
              <input
                type="checkbox"
                aria-label="Grant ignores dazed"
                checked={ignoresDazed}
                onChange={(event) => setIgnoresDazed(event.target.checked)}
              />
              ignores dazed
            </label>
            <label className="flex min-h-11 items-center gap-1 text-xs text-text-mute">
              <input
                type="checkbox"
                aria-label="Grant ignores surprised"
                checked={ignoresSurprised}
                onChange={(event) => setIgnoresSurprised(event.target.checked)}
              />
              ignores surprised
            </label>
            <label className="flex min-h-11 items-center gap-1 text-xs text-text-mute">
              <input
                type="checkbox"
                aria-label="Grant usable off-turn"
                checked={offTurn}
                onChange={(event) => setOffTurn(event.target.checked)}
              />
              usable off-turn
            </label>
          </>
        ) : null}
        {kind === 'turn' ? (
          <label className="flex min-h-11 items-center gap-1 text-xs text-text-mute">
            <input
              type="checkbox"
              aria-label="No consecutive turns"
              checked={noConsecutive}
              onChange={(event) => setNoConsecutive(event.target.checked)}
            />
            no consecutive turns
          </label>
        ) : null}
        {kind === 'next-roll' ? (
          <label className="flex min-h-11 items-center gap-1 text-xs text-text-mute">
            <input
              type="checkbox"
              aria-label="Until end of target's next turn"
              checked={untilTargetsNextTurn}
              onChange={(event) => setUntilTargetsNextTurn(event.target.checked)}
            />
            until end of the target's next turn
          </label>
        ) : (
          <label className="flex min-h-11 items-center gap-1 text-xs text-text-mute">
            <input
              type="checkbox"
              aria-label="Grant expires at end of round"
              checked={expiresEndOfRound}
              onChange={(event) => setExpiresEndOfRound(event.target.checked)}
            />
            expires at end of round
          </label>
        )}
        <input
          value={sourceArtifactId}
          onChange={(event) => setSourceArtifactId(event.target.value)}
          placeholder="source record (optional)"
          aria-label="Grant source artifact id"
          className="h-11 w-52 border border-line bg-ink-1 px-2 text-xs"
        />
        <Button
          variant="primary"
          size="sm"
          disabled={busy || resolvedTarget === '' || (kind !== 'next-roll' && !magnitudeValid)}
          onClick={() => {
            const source = sourceArtifactId.trim();
            const grant =
              kind === 'action'
                ? {
                    kind: 'action' as const,
                    cost,
                    magnitude,
                    escapes: { ignoresDazed, ignoresSurprised, offTurn },
                    expiry: expiresEndOfRound ? ('end-of-round' as const) : null,
                  }
                : kind === 'turn'
                  ? {
                      kind: 'turn' as const,
                      mode: turnMode,
                      magnitude,
                      constraint: noConsecutive ? ('no-consecutive' as const) : null,
                      expiry: expiresEndOfRound ? ('end-of-round' as const) : null,
                    }
                  : {
                      kind: 'next-roll' as const,
                      polarity,
                      scope,
                      direction,
                      window: untilTargetsNextTurn ? ('end-of-targets-next-turn' as const) : null,
                    };
            run(() =>
              addGrant({
                campaignId,
                targetParticipantId: resolvedTarget,
                grant,
                ...(source.length > 0 ? { sourceArtifactId: source } : {}),
              }),
            );
          }}
        >
          Add grant
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-foe">{error}</p> : null}
    </div>
  );
}
