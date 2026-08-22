/**
 * The artifact execution contract (engine-plan 0.2, thin form): every artifact
 * lives in a TOTAL state machine. The axes and states below are exhaustive —
 * a state not listed here fails schema validation, so "unknown state" is
 * structurally impossible and the pipeline dashboard's headline metric
 * ("0 artifacts in unknown state") is checkable, not aspirational.
 *
 * Identity and versioning rules:
 * - An artifact's `id` is its stable identity (derived from source path /
 *   frontmatter at cut time). Ids are never reused for different content.
 * - An artifact's `version` is the SHA-256 of its verbatim source span. A
 *   re-cut whose bytes differ is a NEW version of the same id; its lifecycle
 *   restarts at the initial states and the prior version's ingest state moves
 *   to `superseded`. Upstream/errata updates therefore land as deliberate,
 *   visible diffs — never silent absorption.
 * - `exception` is an explicit, first-class state on every post-ingest axis:
 *   work the queue, don't lose the item.
 */

export const LIFECYCLE_AXES = {
  /** How the artifact's bytes relate to the pinned source. */
  ingest: {
    initial: 'extracted',
    states: ['extracted', 'superseded'],
    transitions: {
      extracted: ['superseded'],
      superseded: [],
    },
  },
  /** Phase-2 taxonomy: agents propose, the human approves in batches. */
  classification: {
    initial: 'unclassified',
    states: ['unclassified', 'proposed', 'approved', 'exception'],
    transitions: {
      unclassified: ['proposed', 'exception'],
      proposed: ['approved', 'exception'],
      approved: ['exception'],
      exception: ['unclassified'],
    },
  },
  /** Phase-3 effect grammar, with full-consumption accounting. */
  parsing: {
    initial: 'unparsed',
    states: ['unparsed', 'parsed-full', 'parsed-with-residue', 'routed-manual', 'exception'],
    transitions: {
      unparsed: ['parsed-full', 'parsed-with-residue', 'routed-manual', 'exception'],
      'parsed-full': ['exception'],
      'parsed-with-residue': ['parsed-full', 'exception'],
      'routed-manual': ['exception'],
      exception: ['unparsed'],
    },
  },
  /** Phase-4 dual-channel verification progression. */
  conformance: {
    initial: 'none',
    states: ['none', 'derived-only', 'independently-verified', 'exception'],
    transitions: {
      none: ['derived-only', 'exception'],
      'derived-only': ['independently-verified', 'exception'],
      'independently-verified': ['exception'],
      exception: ['none'],
    },
  },
} as const;

export type LifecycleAxis = keyof typeof LIFECYCLE_AXES;

export type LifecycleState<A extends LifecycleAxis> = (typeof LIFECYCLE_AXES)[A]['states'][number];

export type Lifecycle = { [A in LifecycleAxis]: LifecycleState<A> };

/** The state every freshly cut artifact starts in. */
export const INITIAL_LIFECYCLE: Lifecycle = {
  ingest: LIFECYCLE_AXES.ingest.initial,
  classification: LIFECYCLE_AXES.classification.initial,
  parsing: LIFECYCLE_AXES.parsing.initial,
  conformance: LIFECYCLE_AXES.conformance.initial,
};

/** Whether `from → to` is a legal transition on the axis. */
export function isLegalTransition<A extends LifecycleAxis>(
  axis: A,
  from: LifecycleState<A>,
  to: LifecycleState<A>,
): boolean {
  // The per-axis literal types don't unify across the axis union; the table's
  // totality over declared states is asserted by lifecycle.test.ts.
  const transitions = LIFECYCLE_AXES[axis].transitions as Record<string, readonly string[]>;
  return (transitions[from] ?? []).includes(to);
}
