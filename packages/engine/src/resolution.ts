import { applyAbilityOutcome } from './ability-execution.js';
import { ECONOMY_CANON, hasCondition } from './action-economy.js';
import type { LifecycleContext } from './condition-lifecycle.js';
import { hashPayload } from './payload-hash.js';
import { POWER_ROLL_CANON, type Tier } from './power-roll.js';
import type {
  EncounterState,
  LogEntry,
  ResolutionEntry,
  ResolutionPayload,
  SquadSignatureAttackPayload,
  UseAbilityPayload,
} from './schemas.js';
import { type SquadBreakdown, applySquadBreakdown } from './squad-actions.js';

/**
 * The two-phase commit executor (R-0032; red-team B1/B3/F10/F11): commit
 * is an EXPLICIT dispatch that re-supplies the payload; the engine
 * verifies its canonical hash against the entry and executes against
 * COMMIT-TIME state. Commit order: damage to all targets → tier effects
 * in presented order ("Unless otherwise indicated, any effects that are
 * determined by a power roll's tier outcome occur after the power roll's
 * damage has been dealt to all targets" [rule.dice/ability-roll]) →
 * bleeding's once-per-action loss at commit-close, keyed by actionKey so
 * a composed Charge strike bleeds once [condition/bleeding]. The engine
 * never auto-commits — it cannot know who holds reactions; hosts pipeline
 * commit for one-tap UX.
 */

function entry(
  context: LifecycleContext,
  kind: LogEntry['kind'],
  message: string,
  canonRefs: string[],
  data: Record<string, unknown>,
): LogEntry {
  return { kind, intentId: context.intentId, actor: context.actor, canonRefs, message, data };
}

export interface CommitArgs {
  resolutionId: string;
  payload: ResolutionPayload;
  /** end-turn force-commit [design §3]: printed damage is never
   * discarded; the receipt names the forcing boundary. */
  forced: boolean;
}

export type CommitResult =
  | { ok: true; state: EncounterState; log: LogEntry[] }
  | { ok: false; refusal: string };

const clampTier = (value: number): Tier => (value < 1 ? 1 : value > 3 ? 3 : (value as Tier));

type SquadResolutionPayload = Exclude<ResolutionPayload, UseAbilityPayload>;

function isUseAbilityPayload(payload: ResolutionPayload): payload is UseAbilityPayload {
  return 'actorParticipantId' in payload;
}

/** Hashes of exact historical squad wire forms whose only difference is a
 * subsequently defaulted empty field. This is deliberately not a general
 * normalization: nonempty semantics can never be removed to make a hash
 * match — each era variant exists only while every field it omits is
 * empty/defaulted on the re-supplied payload. Eras, newest first:
 * pre-resourceCost (the carry-only slot), pre-effectPrograms,
 * pre-effectLines (f9075a1). */
function historicalSquadPayloadHashes(
  payload: ResolutionPayload,
): Array<{ hash: string; omitted: string[] }> {
  if (isUseAbilityPayload(payload) || payload.ability === null) return [];
  const ability = payload.ability;
  if (ability.resourceCost !== null || ability.resourceCostResidue !== null) return [];
  const beforeResourceCost: Record<string, unknown> = { ...ability };
  beforeResourceCost.resourceCost = undefined;
  beforeResourceCost.resourceCostResidue = undefined;
  const resourceFields = ['SquadAbilityData.resourceCost', 'SquadAbilityData.resourceCostResidue'];
  const variants = [
    {
      hash: hashPayload({ ...payload, ability: beforeResourceCost }),
      omitted: [...resourceFields],
    },
  ];
  if (ability.effectPrograms.length !== 0) return variants;
  const withoutPrograms: Record<string, unknown> = { ...beforeResourceCost };
  withoutPrograms.effectPrograms = undefined;
  variants.push({
    hash: hashPayload({ ...payload, ability: withoutPrograms }),
    omitted: ['SquadAbilityData.effectPrograms', ...resourceFields],
  });
  if (ability.effectLines.length === 0) {
    const beforeEffectLines = { ...withoutPrograms };
    beforeEffectLines.effectLines = undefined;
    variants.push({
      hash: hashPayload({ ...payload, ability: beforeEffectLines }),
      omitted: [
        'SquadAbilityData.effectLines',
        'SquadAbilityData.effectPrograms',
        ...resourceFields,
      ],
    });
  }
  return variants;
}

export function commitResolutionEntry(
  state: EncounterState,
  args: CommitArgs,
  context: LifecycleContext,
): CommitResult {
  const stackEntry = state.resolutionStack.find(
    (candidate) => candidate.resolutionId === args.resolutionId,
  );
  if (!stackEntry) return { ok: false, refusal: `unknown resolution ${args.resolutionId}` };
  if (!isOpenResolution(stackEntry)) {
    return {
      ok: false,
      refusal: `resolution ${args.resolutionId} is already committed — a post-commit change is a warned table correction via modify-resolution, not a reopen [R-0032]`,
    };
  }
  // A DECLARED entry has no dice yet, so there is no outcome to apply
  // [R-0041]. This is a structural refusal, not a rule violation: the
  // engine cannot represent committing a roll that was never made. Roll it
  // first (roll-resolution), or let end-turn cancel it.
  if (stackEntry.phase === 'declared') {
    return {
      ok: false,
      refusal: `resolution ${args.resolutionId} is DECLARED but not rolled — roll it before committing, or let the end of the turn cancel it (nothing was rolled, so nothing is lost) [R-0041]`,
    };
  }
  const suppliedHash = hashPayload(args.payload);
  const historicalHashMatch = historicalSquadPayloadHashes(args.payload).find(
    (candidate) => candidate.hash === stackEntry.payloadHash,
  );
  if (suppliedHash !== stackEntry.payloadHash && historicalHashMatch === undefined) {
    return {
      ok: false,
      refusal: `re-supplied payload hash ${suppliedHash.slice(0, 8)}… does not match resolution ${args.resolutionId} (${stackEntry.payloadHash.slice(0, 8)}…) — commit must re-supply the rolled payload byte-for-byte [R-0032]`,
    };
  }
  // actorId is a participant id or a squad id (the activeTurnId widening);
  // either must exist for the entry to be executable.
  const ownerParticipant = state.participants[stackEntry.actorId];
  const ownerSquad = state.squads.find((candidate) => candidate.squadId === stackEntry.actorId);
  if (!ownerParticipant && !ownerSquad) {
    return { ok: false, refusal: `unknown actor ${stackEntry.actorId}` };
  }

  const log: LogEntry[] = [];
  if (historicalHashMatch !== undefined && suppliedHash !== stackEntry.payloadHash) {
    log.push(
      entry(
        context,
        'informational',
        `resolution ${args.resolutionId} matches its historical squad payload hash after omitting only defaulted empty field(s): ${historicalHashMatch.omitted.join(', ')}`,
        [POWER_ROLL_CANON.abilityRoll],
        {
          historicalPayloadHashCompatibility: {
            resolutionId: args.resolutionId,
            storedHash: stackEntry.payloadHash,
            suppliedHash,
            omitted: historicalHashMatch.omitted,
          },
        },
      ),
    );
  }

  // LIFO discipline with named-insertion exceptions is a WARN, never
  // corruption — Breaking Point's inserted turn is printed play [R-0032].
  const openEntries = openResolutions(state);
  const top = openEntries[openEntries.length - 1];
  if (top !== undefined && top !== stackEntry) {
    log.push(
      entry(
        context,
        'warning',
        `committing ${args.resolutionId} beneath open resolution ${top.resolutionId} — out-of-LIFO commit (printed-legal for inserted turns; the Director adjudicates ordering)`,
        [],
        {
          stackCoherence: {
            committed: args.resolutionId,
            openAbove: openEntries
              .slice(openEntries.indexOf(stackEntry) + 1)
              .map((candidate) => candidate.resolutionId),
          },
        },
      ),
    );
  }

  // ── fold the modification list, in dispatch order [R-0032/F5/F11] ──────
  const receipt = stackEntry.rollReceipt;
  const baseTierFor = (targetId: string): Tier => receipt.perTarget[targetId]?.tier ?? receipt.tier;
  let tierShift: (tier: Tier) => Tier = (tier) => tier;
  const ordinaryPayload = isUseAbilityPayload(args.payload) ? args.payload : null;
  const squadPayload: SquadResolutionPayload | null = isUseAbilityPayload(args.payload)
    ? null
    : args.payload;
  let targets: string[] = ordinaryPayload
    ? [...ordinaryPayload.targets]
    : (squadPayload?.participation.map((row) => row.targetId) ?? []);
  const halves = new Map<string | null, 'down' | 'up'>();
  const potencyExtras = new Map<string | null, number>();
  for (const modification of stackEntry.modifications) {
    switch (modification.kind) {
      case 'downgrade': {
        const previous = tierShift;
        tierShift = (tier) => clampTier(Math.min(previous(tier), modification.toTier));
        break;
      }
      case 'tier-adjust': {
        const previous = tierShift;
        tierShift = (tier) => clampTier(previous(tier) + modification.delta);
        break;
      }
      case 'retarget': {
        const index = targets.indexOf(modification.from);
        if (index === -1) {
          log.push(
            entry(
              context,
              'warning',
              `retarget names ${modification.from}, which is not among this resolution's targets — skipped with the history on the receipt (permissive engine)`,
              [],
              { modificationSkipped: modification },
            ),
          );
          break;
        }
        targets = targets.map((candidate, at) => (at === index ? modification.to : candidate));
        break;
      }
      case 'potency-adjust': {
        const key = modification.target ?? null;
        potencyExtras.set(key, (potencyExtras.get(key) ?? 0) + modification.delta);
        break;
      }
      case 'damage-halve': {
        halves.set(modification.target ?? null, modification.rounding);
        break;
      }
    }
  }
  for (const targetId of targets) {
    if (!state.participants[targetId]) {
      return { ok: false, refusal: `unknown participant ${targetId}` };
    }
  }

  const tierFor = (targetId: string): Tier => tierShift(baseTierFor(targetId));
  const applied = ordinaryPayload
    ? applyAbilityOutcome(
        state,
        {
          payload: ordinaryPayload,
          targets,
          tierFor,
          resolutionId: stackEntry.resolutionId,
          damageTransform: (targetId, amount) => {
            const rounding = halves.get(targetId) ?? halves.get(null);
            if (rounding === undefined) return { amount, note: null };
            const halved = rounding === 'down' ? Math.floor(amount / 2) : Math.ceil(amount / 2);
            return {
              amount: halved,
              note: `damage against ${targetId} is halved by a recorded modification (${amount} → ${halved}, rounded ${rounding} as dispatch-asserted — the books state no general halving-rounding rule at the pin)`,
            };
          },
          extraPotencyFor: (targetId) =>
            (potencyExtras.get(targetId) ?? 0) + (potencyExtras.get(null) ?? 0),
        },
        context,
      )
    : (() => {
        if (squadPayload === null) {
          return {
            state,
            log: [entry(context, 'refusal', 'resolution payload kind is not executable', [], {})],
          };
        }
        const livePayload = squadPayload;
        if (livePayload.ability === null) {
          return {
            state,
            log: [
              entry(
                context,
                'refusal',
                'squad maneuver resolution has no compiled ability',
                [],
                {},
              ),
            ],
          };
        }
        const ability = livePayload.ability;
        const originalTargets = livePayload.participation.map((row) => row.targetId);
        const targetMap = new Map(
          originalTargets.map((targetId, index) => [targetId, targets[index] ?? targetId]),
        );
        const stored = stackEntry.squadBreakdown;
        if (stored === null) {
          return {
            state,
            log: [
              entry(
                context,
                'refusal',
                `resolution ${stackEntry.resolutionId} has no stored squad breakdown`,
                [],
                {},
              ),
            ],
          };
        }
        const effectiveBreakdown: SquadBreakdown = stored.map((row) => {
          const targetId = targetMap.get(row.targetId) ?? row.targetId;
          const tier = tierFor(row.targetId);
          const packet = ability.tiers[`tier${tier}`] ?? row.packet;
          const stacking =
            packet.kind === 'residue'
              ? {
                  kind: 'residue' as const,
                  reason: 'the modified tier packet is not in the closed single-damage grammar',
                  sourceText: packet.sourceText,
                }
              : packet.data.damage === null && row.stacking.kind === 'applied'
                ? {
                    kind: 'residue' as const,
                    reason: 'the modified tier result carries no ability damage packet',
                    sourceText: packet.sourceText,
                  }
                : row.stacking;
          return { ...row, targetId, tier, packet, stacking };
        });
        const signaturePayload: SquadSignatureAttackPayload = {
          ...livePayload,
          ability,
          partOfByMember: 'partOfByMember' in livePayload ? livePayload.partOfByMember : {},
        };
        return applySquadBreakdown(
          state,
          signaturePayload,
          effectiveBreakdown,
          context,
          halves,
          potencyExtras,
          stackEntry.resolutionId,
        );
      })();
  // A refusal inside application (binding drift) refuses the whole commit.
  const applyRefusal = applied.log.find((item) => item.kind === 'refusal');
  if (applyRefusal) return { ok: false, refusal: applyRefusal.message };

  let nextState = applied.state;
  nextState = {
    ...nextState,
    resolutionStack: nextState.resolutionStack.map((candidate) =>
      // Spread the NARROWED entry, not the union member: only a rolled
      // entry reaches here (the declared guard above refused), and a
      // declared candidate has no receipt to carry into `committed`.
      candidate.resolutionId === stackEntry.resolutionId
        ? { ...stackEntry, phase: 'committed' as const }
        : candidate,
    ),
  };
  const commitLog: LogEntry[] = [
    entry(
      context,
      'mutation',
      `resolution ${args.resolutionId} (${stackEntry.abilityArtifactId.split('/').pop()}) is ${args.forced ? 'FORCE-committed at end of turn — printed damage is never discarded' : 'committed'} and executes against commit-time state [R-0032]${stackEntry.modifications.length > 0 ? ` with ${stackEntry.modifications.length} recorded modification(s)` : ''}`,
      [POWER_ROLL_CANON.abilityRoll, stackEntry.abilityArtifactId],
      {
        resolutionPhaseDeltas: [
          { resolutionId: stackEntry.resolutionId, from: 'rolled', to: 'committed' },
        ],
        resolutionCommitted: {
          resolutionId: stackEntry.resolutionId,
          forced: args.forced,
          modifications: stackEntry.modifications,
          effectiveTargets: targets,
        },
      },
    ),
    ...applied.log,
  ];

  // ── bleeding at commit-close [condition/bleeding, R-0032] ──────────────
  // "whenever they use a main action, use a triggered action, or make a
  // test or ability roll using Might or Agility, they lose Stamina equal
  // to 1d6 + their level after the main action, triggered action, or
  // power roll is resolved. This Stamina loss can't be prevented in any
  // way, and only happens once per action." Keyed by actionKey so a
  // composed Charge fires once; the loss itself is a table directive —
  // participant level is not stored state, so the amount is not
  // computable and is never guessed.
  const commitActor = nextState.participants[stackEntry.actorId];
  if (commitActor && hasCondition(commitActor, ECONOMY_CANON.bleeding)) {
    const qualifies =
      stackEntry.actionCost === 'main-action' ||
      stackEntry.actionCost === 'triggered-action' ||
      receipt.characteristicLabel === 'M' ||
      receipt.characteristicLabel === 'A';
    const alreadyFired = state.resolutionStack.some(
      (candidate) =>
        candidate.resolutionId !== stackEntry.resolutionId &&
        candidate.actionKey === stackEntry.actionKey &&
        candidate.phase === 'committed',
    );
    if (qualifies && !alreadyFired) {
      commitLog.push(
        entry(
          context,
          'table-directive',
          `${commitActor.id} is bleeding — "they lose Stamina equal to 1d6 + their level after the main action, triggered action, or power roll is resolved. This Stamina loss can't be prevented in any way, and only happens once per action." (level is not tracked state; the table applies the loss)`,
          [ECONOMY_CANON.bleeding],
          {
            bleedingFire: {
              resolutionId: stackEntry.resolutionId,
              actionKey: stackEntry.actionKey,
              participantId: commitActor.id,
            },
          },
        ),
      );
    }
  }

  return { ok: true, state: nextState, log: [...log, ...commitLog] };
}

/**
 * The ONE home for "is this resolution entry still open?" — open meaning
 * the stack can still modify it, commit it, or force-commit it at a
 * boundary. Membership is an explicit phase set, not `!== 'committed'`,
 * so a new phase arm has to be RULED into openness deliberately at this
 * one site rather than inheriting it by omission.
 *
 * The set is `declared` and `rolled` (schema v8, R-0041). `declared` was
 * RULED in here, at this one site, when the pre-roll arm landed: a
 * declared entry can still be retargeted, cursed, rolled, or cancelled,
 * so it is open in every sense this predicate means. Cancellation is a
 * REMOVAL with a receipt, not a fourth phase — "nothing was rolled, so
 * nothing is lost" — which is why no closed arm needs adding for it.
 * Eleven hand-written `phase === 'rolled'` openness tests across
 * engine/canon/backend were the alternative to this set, and a rule with
 * two implementations diverges [GOTCHA-0009].
 */
const OPEN_RESOLUTION_PHASES: ReadonlySet<ResolutionEntry['phase']> = new Set([
  'declared',
  'rolled',
]);

/** True while `entry` can still be modified, rolled, or committed. */
export function isOpenResolution(entry: Pick<ResolutionEntry, 'phase'>): boolean {
  return OPEN_RESOLUTION_PHASES.has(entry.phase);
}

/** Every open entry on the stack, bottom-up (stack order). */
export function openResolutions(state: EncounterState): ResolutionEntry[] {
  return state.resolutionStack.filter(isOpenResolution);
}

/** Open entries owned by any of `actorIds`, bottom-up; force-commit walks
 * them in reverse (LIFO) order. */
export function openResolutionsOwnedBy(
  state: EncounterState,
  actorIds: readonly string[],
): ResolutionEntry[] {
  return openResolutions(state).filter((candidate) => actorIds.includes(candidate.actorId));
}
