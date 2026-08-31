import { type GateVerdict, type RequiredFact, readEligibility } from './common-action-gates.js';
import type {
  ActionCost,
  CommonActionGroup,
  CommonActionProgramData,
  EncounterState,
  SpatialFact,
} from './schemas.js';

/**
 * The per-turn common-action offer surface [common-actions design §2, S14].
 *
 * This is an OFFER surface, not a gate. Every entry it returns is
 * dispatchable: an entry whose printed precondition does not hold is still
 * offered, marked, and quoted — the engine warns and applies, and the
 * Director adjudicates [R-0030]. It reports what the book prints, never
 * what the budget allows: spending over budget is a warn-and-apply
 * violation at dispatch, not an absence from the menu.
 *
 * Two shapes it must carry from day one, because retrofitting either after
 * the surface has callers is the expensive order:
 * - a per-entry availability predicate (Stand Up's availability is a
 *   condition-membership test, so either the menu takes a predicate per
 *   entry or every action bolts its own gate into the UI);
 * - the compiled companion an entry offers INSTEAD of a bare dispatch —
 *   Free Strike's whole gap was that its two compiled weapon free strikes
 *   ride the existing pipeline but nothing surfaced them.
 */

export interface CommonActionOfferReason {
  verdict: false | 'unknown';
  /** The printed sentence, verbatim. */
  verbatim: string;
  canonRefs: readonly string[];
  assertedFacts: readonly RequiredFact[];
}

export interface CommonActionOffer {
  featureArtifactId: string;
  group: CommonActionGroup;
  /** The group directory's cost. A dispatch may print an override. */
  actionCost: ActionCost;
  /** Printed availability, tri-state. `false` and `'unknown'` are both
   * still offered — see the module note. */
  available: GateVerdict;
  /** Why availability is not plainly true, in the book's own words. */
  reasons: CommonActionOfferReason[];
  /** Compiled abilities that carry this action's printed cost and roll;
   * the menu offers these rather than a bare prose dispatch. */
  companionArtifactIds: readonly string[];
  offersCompanion: boolean;
  /** Removed from this actor's menu by a printed access exclusion
   * [ROAD-0005 seam #3]. Core prints none, so this is false everywhere in
   * the core corpus today. */
  accessExcluded: boolean;
}

export interface CommonActionMenuOptions {
  /** Facts the table has asserted for this moment, read by any gate that
   * declares one. */
  spatialFacts?: readonly SpatialFact[];
  /** Named participants the actor would act on (Ride's mount, Stand Up's
   * ally), when the surface knows them — gates that key on the target read
   * these. */
  targets?: readonly string[];
  /** Include entries a printed access exclusion removed, marked rather
   * than dropped (a Director surface may want to see them). */
  includeExcluded?: boolean;
  /** The printed branch the surface is offering, by key. Omitted = the
   * primary branch, which is what a menu with no target selected is
   * showing. */
  alternative?: string | null;
  /** Consent asserted by each named subject's controller, for the printed
   * "willing" clauses. */
  willing?: Readonly<Record<string, boolean>>;
}

/**
 * Printed access for one actor [ROAD-0005 seam #3]. `include` overrides
 * `exclude`, because printed access is asymmetric where it appears at all:
 * a stat block bars an action, and another re-includes one that was
 * barred. The core corpus prints neither, so this returns true for every
 * action on every core participant.
 */
export function hasCommonActionAccess(
  state: EncounterState,
  actorId: string,
  featureArtifactId: string,
): boolean {
  const access = state.participants[actorId]?.traits.commonActionAccess;
  if (access === undefined) return true;
  if (access.include.includes(featureArtifactId)) return true;
  return !access.exclude.includes(featureArtifactId);
}

function combine(verdicts: readonly GateVerdict[]): GateVerdict {
  if (verdicts.includes(false)) return false;
  if (verdicts.includes('unknown')) return 'unknown';
  return true;
}

/** The actor's menu over a set of compiled common-action programs. */
export function commonActionMenu(
  state: EncounterState,
  actorId: string,
  programs: readonly CommonActionProgramData[],
  options: CommonActionMenuOptions = {},
): CommonActionOffer[] {
  const input = {
    state,
    actorId,
    targets: options.targets ?? [],
    spatialFacts: options.spatialFacts ?? [],
    alternative: options.alternative ?? null,
    willing: options.willing ?? {},
  };
  const offers: CommonActionOffer[] = [];
  for (const program of programs) {
    const accessExcluded = !hasCommonActionAccess(state, actorId, program.featureArtifactId);
    if (accessExcluded && options.includeExcluded !== true) continue;
    const readings = readEligibility(program.featureArtifactId, input);
    offers.push({
      featureArtifactId: program.featureArtifactId,
      group: program.group,
      actionCost: program.defaultActionCost,
      available: combine(readings.map((reading) => reading.verdict)),
      reasons: readings
        .filter((reading) => reading.verdict !== true)
        .map((reading) => ({
          verdict: reading.verdict as false | 'unknown',
          verbatim: reading.gate.verbatim,
          canonRefs: reading.gate.canonRefs,
          assertedFacts: reading.gate.assertedFacts ?? [],
        })),
      companionArtifactIds: program.companionArtifactIds,
      // The printed cost sits on the companion's header, so the companion
      // IS the dispatch — a bare prose dispatch would resolve nothing.
      offersCompanion: program.debitContract === 'companion',
      accessExcluded,
    });
  }
  return offers;
}
