import type { LifecycleContext } from './condition-lifecycle.js';
import type { LogEntry } from './schemas.js';

/**
 * Forced movement — the ONE receipt home [common-actions design §4 item 12].
 *
 * The engine models no geometry [DEC-0011], so a push/pull/slide produces a
 * RECEIPT, never a position. That receipt was emitted from two byte-similar
 * places (the ability path and the squad path), which is precisely the
 * shape that lets a correction land in one and not the other — so both now
 * call this builder, and this module is also where distance math would go
 * if it ever lands.
 *
 * **The correction this consolidation carries.** The old message read
 * "pushes T 3 square(s)" with no indication of what that 3 is. Three
 * printed families can change it before a square is moved, and the engine
 * stores none of them:
 *
 * - **stability** [rule.character/stability] — a printed stat-block cell
 *   (526 stat blocks print one) that reduces forced movement; not stored;
 * - **Big Versus Little** [movement/forced-movement] — a size comparison
 *   between pusher and target on a melee weapon ability; `size` is a
 *   printed stat-block cell and is not stored either;
 * - ability-specific modifiers printed on individual abilities.
 *
 * On top of that, forced movement is a "may move fewer" allowance, so even
 * an unmodified number is an upper bound the mover chooses within. A
 * receipt that prints a bare number reads as an authoritative distance,
 * which is exactly the wrong thing for a table to trust. It now says what
 * the number IS — the printed tier distance, unmodified — and the receipt
 * data names the families the engine did not apply.
 */

/** Canon the receipt points at; pointers only, no rule prose is restated. */
export const FORCED_MOVEMENT_CANON = {
  forcedMovement: 'mcdm.heroes.v1/movement/forced-movement',
  stability: 'mcdm.heroes.v1/rule.character/stability',
  size: 'mcdm.heroes.v1/rule.character/size',
} as const;

/** The printed modifier families the engine does not apply, named on every
 * forced-movement receipt so the number is never read as final. */
export const UNAPPLIED_FORCED_MOVEMENT_MODIFIERS = [
  'stability',
  'big-versus-little',
  'ability-specific',
] as const;

export interface ForcedMovementReceipt {
  moverId: string;
  targetId: string;
  movement: { kind: 'push'; distance: number };
  abilityArtifactId: string;
}

/** Build the one forced-movement table directive. */
export function forcedMovementDirective(
  context: LifecycleContext,
  receipt: ForcedMovementReceipt,
): LogEntry {
  const { moverId, targetId, movement, abilityArtifactId } = receipt;
  return {
    kind: 'table-directive',
    intentId: context.intentId,
    actor: context.actor,
    canonRefs: [
      abilityArtifactId,
      FORCED_MOVEMENT_CANON.forcedMovement,
      FORCED_MOVEMENT_CANON.stability,
      FORCED_MOVEMENT_CANON.size,
    ],
    message: `${moverId} pushes ${targetId} ${movement.distance} square(s) — ${movement.distance} is the printed tier distance, unmodified: the engine applies no stability, size or ability-specific adjustment and moves nothing. Distance, geometry and the printed modifiers are table-resolved`,
    data: {
      forcedMovement: {
        targetId,
        ...movement,
        printedDistance: movement.distance,
        unappliedModifiers: [...UNAPPLIED_FORCED_MOVEMENT_MODIFIERS],
      },
    },
  };
}
