import {
  type ActionCost,
  type ReactionInterception,
  normalizeActionCostValue,
} from '@engarde/engine';
import { type EffectClause, type GrammarParse, stripSccLinks } from './effect-grammar.js';

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
  actionCost: ActionCost | null;
  actionCostResidue: string | null;
  operatorPays: boolean;
  usesPerRound: number | null;
  reactionInterception: ReactionInterception | null;
}

type HeaderClause = Extract<EffectClause, { kind: 'ability-header' }>;

interface AnnotationEvent {
  byteStart: number;
  text: string;
  header: HeaderClause | null;
  whitespace: boolean;
}

const VILLAIN_ACTION_NAME_LINE = /villain action\s*\d/i;
/** The Wave of Blood sub-ability name-line shape: `**<Name>:**` (a bold
 * name with a trailing colon, resolved by a parent ability's Effect text). */
const SUB_ABILITY_NAME_LINE = /^\*\*[^*]+:\*\*\s*$/;
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
 * `compileEffectPrograms` hold).
 */
export function annotateHeaderCosts(parse: GrammarParse): Map<HeaderClause, HeaderCostAnnotation> {
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
      } else if (nameLine !== null && SUB_ABILITY_NAME_LINE.test(nameLine)) {
        // Wave of Blood [R-0029]: a no-cost sub-ability resolved by its
        // parent ability's delayed effect — NOT a villain action.
        actionCost = 'no-action';
      } else {
        actionCostResidue = `dash action cell with no Villain Action or sub-ability name line (preceding line: ${nameLine === null ? 'none' : JSON.stringify(nameLine)})`;
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

    annotations.set(header, {
      actionCost,
      actionCostResidue,
      operatorPays,
      usesPerRound,
      reactionInterception,
    });
  }
  return annotations;
}
