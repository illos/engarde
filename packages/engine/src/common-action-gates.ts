import { isDying } from './health.js';
import type { EncounterState, SpatialFact } from './schemas.js';

/**
 * Printed-eligibility gates + the asserted-fact reader for common actions
 * [common-actions design §2, S4 + S5].
 *
 * A gate quotes a printed precondition and reports whether it holds. It is
 * evaluated in the dispatch preamble, BEFORE the debit, and it NEVER
 * short-circuits: the engine warns and applies, and the Director
 * adjudicates [R-0030]. The tri-state is not optional — most printed
 * preconditions are about facts the engine does not model (a mount
 * relation, cover, who is observing whom), and reporting `false` for
 * "I cannot tell" would be a fabricated reading of the table's state.
 *
 * A registration is allowed to cite a rule that never names the action
 * (the printed movement bars land on the movement, not on Disengage), and
 * it keys on the ROLE in the dispatch (a printed bar on USING an action
 * says nothing about being the TARGET of an ally's).
 */

/** A fact the table asserts, in the existing pair-predicate vocabulary. */
export interface RequiredFact {
  fact: SpatialFact['fact'];
  /** Which side of the dispatch each endpoint is. */
  a: 'actor' | 'target';
  b: 'actor' | 'target';
  /** The value the printed precondition needs. */
  holds: boolean;
}

export interface GateInput {
  state: EncounterState;
  actorId: string;
  targets: readonly string[];
  spatialFacts: readonly SpatialFact[];
}

/** true = the printed precondition holds; false = it is violated;
 * 'unknown' = the engine cannot know and the table must say. */
export type GateVerdict = true | false | 'unknown';

export interface EligibilityGate {
  featureArtifactId: string;
  /** The printed sentence, verbatim (scc links stripped). Quoted into the
   * warning so the Director reads the rule, not a summary of it. A canon
   * test proves every one of these against the artifact's own bytes. */
  verbatim: string;
  canonRefs: readonly string[];
  /** Facts the table must assert for this precondition, if any. Absent or
   * contradicted facts fold into the verdict through the ONE reader. */
  assertedFacts?: readonly RequiredFact[];
  /** Engine-known half of the precondition. */
  holds(input: GateInput): GateVerdict;
}

/**
 * S5 — the ONE asserted-fact reader. `spatialFacts` has been declared on
 * the intent envelope since the engine's first commit and read by NOTHING;
 * adding members to an enum nothing reads adds no capability, so the first
 * unit of work is this reader. It reports, it never gates: a contradicted
 * fact makes a printed precondition false (which warns), and an absent one
 * leaves it unknown (which also warns) — neither refuses.
 */
export function readAssertedFact(
  facts: readonly SpatialFact[],
  query: { fact: SpatialFact['fact']; a: string; b: string },
): GateVerdict {
  const match = facts.find(
    (candidate) =>
      candidate.fact === query.fact && candidate.a === query.a && candidate.b === query.b,
  );
  return match === undefined ? 'unknown' : match.holds;
}

/** Three-valued conjunction: any false wins, then any unknown. */
function andVerdicts(verdicts: readonly GateVerdict[]): GateVerdict {
  if (verdicts.includes(false)) return false;
  if (verdicts.includes('unknown')) return 'unknown';
  return true;
}

/**
 * Resolve every asserted fact a gate declares, through the one reader. A
 * declared pair fact is resolved against EVERY named target — a
 * precondition that must hold against the creature you are acting on holds
 * against each of them — so a dispatch with no targets yields no readings
 * and the gate's engine-known half stands alone.
 */
export function foldAssertedFacts(
  required: readonly RequiredFact[],
  input: GateInput,
): GateVerdict[] {
  const verdicts: GateVerdict[] = [];
  for (const fact of required) {
    const endpoints =
      fact.a === 'actor' && fact.b === 'actor'
        ? [{ a: input.actorId, b: input.actorId }]
        : input.targets.map((targetId) => ({
            a: fact.a === 'actor' ? input.actorId : targetId,
            b: fact.b === 'actor' ? input.actorId : targetId,
          }));
    for (const endpoint of endpoints) {
      const read = readAssertedFact(input.spatialFacts, { fact: fact.fact, ...endpoint });
      verdicts.push(read === 'unknown' ? 'unknown' : read === fact.holds);
    }
  }
  return verdicts;
}

/** Evaluate one gate: its engine-known half, conjoined with its declared
 * asserted facts. */
export function evaluateGate(gate: EligibilityGate, input: GateInput): GateVerdict {
  return andVerdicts([gate.holds(input), ...foldAssertedFacts(gate.assertedFacts ?? [], input)]);
}

const CATCH_BREATH = 'mcdm.heroes.v1/feature.common.maneuvers/catch-breath';
const RIDE = 'mcdm.heroes.v1/feature.common.move-actions/ride';

/**
 * The registered printed preconditions. Each is one printed sentence; the
 * verdict function reads only what the engine actually models.
 */
export const COMMON_ACTION_ELIGIBILITY_GATES: readonly EligibilityGate[] = [
  {
    featureArtifactId: CATCH_BREATH,
    verbatim:
      "A creature who is dying (see Dying and Death in Stamina below) can't use the Catch Breath maneuver, but other creatures can help them spend Recoveries in other ways.",
    canonRefs: ['mcdm.heroes.v1/rule.health/dying', 'mcdm.heroes.v1/rule.health/recoveries'],
    holds: ({ state, actorId }) => {
      const actor = state.participants[actorId];
      if (actor === undefined) return 'unknown';
      // Untracked Stamina is not "not dying" — it is unknown.
      if (actor.stamina === null) return 'unknown';
      // `isDying` is the ONE home for the printed threshold; no second
      // dying predicate is written here.
      return !isDying(actor.stamina.current);
    },
  },
  {
    featureArtifactId: RIDE,
    verbatim:
      'A creature can take the Ride move action only while mounted on another creature (see Mounted Combat below).',
    canonRefs: ['mcdm.heroes.v1/rule.combat/mounted-combat'],
    holds: ({ targets }) =>
      // There is no mount relation in engine state, and `traits.subActorOf`
      // is NOT it: mounted combat prints "Both mount and rider each take a
      // turn during combat", while a sub-actor rides inside its owner's
      // turn slot. So the engine knows exactly one thing here — whether the
      // dispatch named a mount at all — and leaves the rest to the table.
      targets.length === 0 ? false : 'unknown',
  },
];

const GATES_BY_FEATURE = new Map<string, EligibilityGate[]>();
for (const gate of COMMON_ACTION_ELIGIBILITY_GATES) {
  const bucket = GATES_BY_FEATURE.get(gate.featureArtifactId) ?? [];
  bucket.push(gate);
  GATES_BY_FEATURE.set(gate.featureArtifactId, bucket);
}

export function gatesFor(featureArtifactId: string): readonly EligibilityGate[] {
  return GATES_BY_FEATURE.get(featureArtifactId) ?? [];
}

export interface GateReading {
  gate: EligibilityGate;
  verdict: GateVerdict;
}

/** Every registered gate for a feature, read against a dispatch. */
export function readEligibility(featureArtifactId: string, input: GateInput): GateReading[] {
  return gatesFor(featureArtifactId).map((gate) => ({ gate, verdict: evaluateGate(gate, input) }));
}
