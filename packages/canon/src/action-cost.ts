import {
  type ActionCost,
  type ReactionInterception,
  type ResourceCost,
  normalizeActionCostValue,
} from '@engarde/engine';
import { type EffectClause, type GrammarParse, stripSccLinks } from './effect-grammar.js';
import { resourceCostFromNameLine } from './resource-cost.js';

/**
 * R-0029 action-cost normalization with CONTEXT — the compile-time half that
 * the engine's value normalizer cannot do alone:
 *
 * - A bare `-` action cell under a `Villain Action N` name line is
 *   villain-action (156 of the 157 corpus dash cells at the accepted pin).
 * - Wave of Blood — the `-` cell whose name line is the bold-name-with-colon
 *   sub-ability form (`**Wave of Blood:**`), the delayed end-of-round tail
 *   of the vampire lord's Sacrifice — normalizes to a no-cost sub-ability
 *   (no-action). It inherits NONE of the villain-action constraints, which
 *   it would violate (end-of-round timing, a second villain action that
 *   round, outside the three) [R-0029].
 * - Any other unknown value refuses to normalize: residue with a reason,
 *   never a guess.
 *
 * Also compiled here, per header section (header table → next header):
 * - the printed once-per-round cap family, from the closed phrases
 *   "only once per round" / "once per round" [R-0029 scope];
 * - the R-0031 reaction interception-point classification for
 *   triggered/free-triggered costs, by DETERMINISTIC closed templates only;
 *   unclassified defaults to `applied` carrying the verbatim section text.
 */

export interface HeaderCostAnnotation {
  /** Deterministic slug of the printed ability name immediately preceding
   * this header. Null for headerless tables. Hosts use this only to resolve
   * an explicit `record#ability-slug` reference; it never guesses a cost. */
  abilitySlug: string | null;
  actionCost: ActionCost | null;
  actionCostResidue: string | null;
  operatorPays: boolean;
  usesPerRound: number | null;
  reactionInterception: ReactionInterception | null;
  /** Printed resource-cost carry slot (ROAD-0005 seam #1), parsed from the
   * cost-shaped name-line parenthetical ("**Net Trap (3 Malice)**").
   * CARRY-ONLY — no debit semantics; null when the name line prints no
   * cost-shaped parenthetical, residue when a cost-shaped one refuses the
   * closed grammar ("(3-7 Malice)" range labels). */
  resourceCost: ResourceCost | null;
  resourceCostResidue: string | null;
}

type HeaderClause = Extract<EffectClause, { kind: 'ability-header' }>;

interface AnnotationEvent {
  byteStart: number;
  text: string;
  header: HeaderClause | null;
  whitespace: boolean;
}

const VILLAIN_ACTION_NAME_LINE = /villain action\s*\d/i;
/**
 * Wave of Blood exact-match [R-0029]: the ruling names Wave of Blood
 * SPECIFICALLY — the one dash cell at the accepted pin whose name line is
 * the bold-name-with-colon sub-ability form, on the vampire lord. Any OTHER
 * future dash under a bold-colon name line refuses as residue (never
 * generalized from one ruling).
 */
const WAVE_OF_BLOOD_ARTIFACT_ID =
  'mcdm.monsters.v1/monster.undead.3rd-echelon.statblock/vampire-lord';
const WAVE_OF_BLOOD_NAME_LINE = '**Wave of Blood:**';
const ONCE_PER_ROUND = /once per round/i;

/** Last non-empty content line of a text block, quote markers and scc links
 * stripped — the survey's dash-cell walkback method. */
function lastContentLine(text: string): string | null {
  const lines = stripSccLinks(text)
    .split('\n')
    .map((line) => line.replace(/^>+\s*/, '').trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? (lines[lines.length - 1] ?? null) : null;
}

/** Printed ability-name line → the same lowercase dash form used by canon
 * artifact/ability references (`Meat Shield` → `meat-shield`). Parenthetical
 * cost/category tails are metadata, not part of the ability name. */
function abilitySlugFromNameLine(nameLine: string | null): string | null {
  if (nameLine === null) return null;
  const printedName = /\*\*([^*]+)\*\*/.exec(nameLine)?.[1];
  if (printedName === undefined) return null;
  const withoutMetadata = printedName.replace(/\s+\([^)]*\)\s*$/, '').trim();
  const slug = withoutMetadata
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : null;
}

/**
 * R-0031 deterministic closed-template classification. Template order
 * follows the ruling card; the first match wins. `null` trigger text is
 * tolerated (the retarget templates then classify by their fallback).
 */
export function classifyReactionInterception(sectionText: string): ReactionInterception {
  const text = stripSccLinks(sectionText);
  const triggerLine = /\*\*Trigger:\*\*([^\n]*)/.exec(text)?.[1] ?? null;
  // "halves the damage" / "takes half the damage" → pre-application.
  if (
    /\b(?:takes?|take) half the (?:triggering )?damage\b/i.test(text) ||
    /\bhalves the damage\b/i.test(text)
  ) {
    return { point: 'pre-application', classified: true, sourceText: null };
  }
  // "is the target … instead" / "chooses a new target" → targeting or
  // pre-application per trigger (a damage-carrying trigger has already left
  // the targeting step).
  if (
    /\bis the target of the triggering [^.]*\binstead\b/i.test(text) ||
    /\bchooses? a new target\b/i.test(text)
  ) {
    const damageTrigger = triggerLine !== null && /damage/i.test(triggerLine);
    return {
      point: damageTrigger ? 'pre-application' : 'targeting',
      classified: true,
      sourceText: null,
    };
  }
  // "the outcome … is reduced by one tier" → rolled.
  if (/\boutcome[^.]*reduced by one tier\b/i.test(text)) {
    return { point: 'rolled', classified: true, sourceText: null };
  }
  // Explicit "before X is resolved" texts (kobold Testudo!, Anticipating
  // Strike) → as written: before the trigger applies.
  if (/\bresolves? before the triggering\b/i.test(text)) {
    return { point: 'pre-application', classified: true, sourceText: null };
  }
  // Explicit "after X resolves" texts → as written: post-application.
  if (/\bafter the triggering[^.]*(?:resolves|is resolved)\b/i.test(text)) {
    return { point: 'applied', classified: true, sourceText: null };
  }
  // "would die … instead" → replacement (interception inside application).
  if (/\bwould die\b[^.]*\binstead\b/i.test(text)) {
    return { point: 'replacement', classified: true, sourceText: null };
  }
  // Honest residue: default applied, verbatim text carried for the table.
  return { point: 'applied', classified: false, sourceText: sectionText };
}

/**
 * Annotate every ability-header clause in a parse with its normalized
 * action cost + section-derived economy data. Keyed by clause object
 * identity (the same objects `groupPowerRollClusters` and
 * `compileEffectPrograms` hold). `artifactId` scopes the Wave-of-Blood
 * exact-match [R-0029] — the ruling names one artifact, not a shape.
 */
export function annotateHeaderCosts(
  parse: GrammarParse,
  artifactId: string,
): Map<HeaderClause, HeaderCostAnnotation> {
  const events: AnnotationEvent[] = [
    ...parse.clauses.map((clause) => ({
      byteStart: clause.span.byteStart,
      text: clause.span.text,
      header: clause.kind === 'ability-header' ? clause : null,
      whitespace: clause.kind === 'whitespace',
    })),
    ...parse.residue.map((item) => ({
      byteStart: item.span.byteStart,
      text: item.span.text,
      header: null,
      whitespace: false,
    })),
  ].sort((left, right) => left.byteStart - right.byteStart);

  const annotations = new Map<HeaderClause, HeaderCostAnnotation>();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event?.header) continue;
    const header = event.header;

    // Walk back to the nearest preceding content line (the survey method).
    let nameLine: string | null = null;
    for (let back = index - 1; back >= 0; back -= 1) {
      const candidate = events[back];
      if (!candidate || candidate.whitespace) continue;
      nameLine = lastContentLine(candidate.text);
      if (nameLine !== null) break;
    }

    // Section text: this header through the next header (exclusive).
    const sectionParts: string[] = [event.text];
    for (let forward = index + 1; forward < events.length; forward += 1) {
      const candidate = events[forward];
      if (!candidate) break;
      if (candidate.header !== null) break;
      sectionParts.push(candidate.text);
    }
    const sectionText = sectionParts.join('');

    let actionCost: ActionCost | null = null;
    let actionCostResidue: string | null = null;
    let operatorPays = false;
    const raw = header.actionType.trim();
    if (raw === '-') {
      if (nameLine !== null && VILLAIN_ACTION_NAME_LINE.test(nameLine)) {
        actionCost = 'villain-action';
      } else if (nameLine === WAVE_OF_BLOOD_NAME_LINE && artifactId === WAVE_OF_BLOOD_ARTIFACT_ID) {
        // Wave of Blood [R-0029]: a no-cost sub-ability resolved by its
        // parent ability's delayed effect — NOT a villain action. Exact
        // match only; any other bold-colon dash refuses as residue below.
        actionCost = 'no-action';
      } else {
        actionCostResidue = `dash action cell with no Villain Action name line and not the R-0029 Wave of Blood exact match (preceding line: ${nameLine === null ? 'none' : JSON.stringify(nameLine)})`;
      }
    } else {
      const normalized = normalizeActionCostValue(raw);
      if (normalized === null) {
        actionCostResidue = `unrecognized action-cost value ${JSON.stringify(raw)}`;
      } else {
        actionCost = normalized.cost;
        operatorPays = normalized.operatorPays;
      }
    }

    const usesPerRound = ONCE_PER_ROUND.test(stripSccLinks(sectionText)) ? 1 : null;
    const reactionInterception =
      actionCost === 'triggered-action' || actionCost === 'free-triggered-action'
        ? classifyReactionInterception(sectionText)
        : null;

    const { resourceCost, resourceCostResidue } = resourceCostFromNameLine(nameLine);

    annotations.set(header, {
      abilitySlug: abilitySlugFromNameLine(nameLine),
      actionCost,
      actionCostResidue,
      operatorPays,
      usesPerRound,
      reactionInterception,
      resourceCost,
      resourceCostResidue,
    });
  }
  return annotations;
}
