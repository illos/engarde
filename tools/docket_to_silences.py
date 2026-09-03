#!/usr/bin/env python3
"""Turn the effect-prose Gate-3 docket into a ruling deck's silences + sources.

The docket (``effect-prose-gate3-docket.json``) groups 77 audited Effect rows
into eight decision batches. Each batch becomes ONE card: the headline
question for the batch, the row-level questions it settles (deduplicated, in
docket order), and every source artifact the rows came from. The five global
stat-overlay questions ride the overlay batch, as the docket specifies.

Nothing here is a ruling. The headline text names the decision; the answer
comes from the verify stage and the verdict from the user.

usage: docket_to_silences.py <docket.json> <manifest.json> <out-dir>
"""

import os
import sys

from extract_sources import extract, load_json, write_json_atomic

# Batch order and headline questions follow docs/effect-prose-gate3-docket.md.
BATCHES = [
    (
        "plane-and-presentation",
        "R-0046 · Plane ownership and presentation completeness",
        "When an Effect line has consequences outside the fight (titles, advancement, "
        "cross-encounter state), does the encounter engine hand it off to the owning plane "
        "as a durable receipt, and is printing the exact text with that ownership label a "
        "complete result until that plane implements the handoff?",
    ),
    (
        "overlay-instance-and-values",
        "R-0047 · Attributed overlays, instance identity, and values",
        "Are temporary weakness / immunity / stat changes attributed effect instances "
        "(replaced on same-source reapplication, coexisting across sources, removed "
        "one-at-a-time on expiry, values snapshotted at application) rather than direct "
        "rewrites of a participant's stats?",
    ),
    (
        "nested-ability-and-choice",
        "R-0048 · Nested ability execution and player / Director choices",
        "When an Effect line says to use another ability, does it run the ordinary "
        "declare → react → roll → commit pipeline at that point in source order, without "
        "spending a second action unless printed, and is every real choice a pending "
        "decision owned by the named player or Director rather than something the engine infers?",
    ),
    (
        "movement-trace-and-targeting",
        "R-0049 · VTT movement traces and target binding",
        "For Effect lines keyed on movement or contact, does the table supply an ordered "
        "movement / contact trace and asserted target bindings (DEC-0011), with per-creature "
        "contact deduplicated per movement and the gathered target set frozen before the "
        "shared roll?",
    ),
    (
        "participant-object-lifecycle",
        "R-0050 · Participant, object, transformation, and teardown lifecycle",
        "Is anything that takes turns or owns creature statistics a participant, anything "
        "targetable but unable to act an object, and everything else an attributed effect "
        "instance — created atomically with roster membership and torn down with only its "
        "own subscriptions?",
    ),
    (
        "event-ordering-and-lifetimes",
        "R-0051 · Event ordering and effect lifetimes",
        "Does state commit before the occurrence that describes it is emitted, do downstream "
        "mandatory effects run in printed order through the same resolution stack, can a "
        "consumed until / ends instance never resume, and do simultaneous responders get one "
        "receipt-visible ordering choice?",
    ),
    (
        "counter-quantifiers",
        "R-0052 · Counters and first-use quantifiers",
        "Does a printed base amount apply to the first use with \"each time this ability is "
        "used\" updating the stored value for the next use, and does per-creature contact "
        "wording decrement once per qualifying creature per movement?",
    ),
    (
        "bespoke-resolution-policy",
        "R-0053 · Bespoke resolution policies",
        "For the five rows that do not generalize (ignored non-damaging clauses, Fulcrum's "
        "roll-to-area, Renegotiated Contract's Stamina split, Fake Your Death's illusion "
        "interaction), are the proposed per-row defaults acceptable — or does the printed "
        "text already answer them so no policy is needed?",
    ),
]


def build(docket, manifest_path):
    rows = docket["rows"]
    by_cluster = {}
    for row in rows:
        by_cluster.setdefault(row["cluster"], []).append(row)
    unknown = set(by_cluster) - {cluster for cluster, _, _ in BATCHES}
    if unknown:
        raise ValueError(f"docket clusters without a batch definition: {sorted(unknown)}")

    silences = []
    artifact_ids = []
    for cluster, group, question in BATCHES:
        cluster_rows = by_cluster.get(cluster, [])
        if not cluster_rows:
            raise ValueError(f"docket has no rows for cluster {cluster}")
        sub_questions = list(
            dict.fromkeys(q for row in cluster_rows for q in row.get("questions", []))
        )
        if cluster == "overlay-instance-and-values":
            sub_questions = list(docket.get("globalStatQuestions", [])) + sub_questions
        ids = list(dict.fromkeys(row["artifactId"] for row in cluster_rows))
        artifact_ids.extend(ids)
        silences.append(
            {
                "group": group,
                "question": question,
                "tags": f"{len(cluster_rows)} Effect rows · {len(sub_questions)} printed cases",
                "oneRuling": True,
                "subQuestions": sub_questions,
                "sourceArtifactIds": ids,
                "gates": "effect-prose VM",
                "docketCluster": cluster,
                "docketRowKeys": [row["key"] for row in cluster_rows],
                "docketPayloadHashes": {row["key"]: row["payloadSha256"] for row in cluster_rows},
            }
        )
    sources = extract(manifest_path, artifact_ids)
    return silences, sources


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 3:
        print("usage: docket_to_silences.py <docket.json> <manifest.json> <out-dir>", file=sys.stderr)
        return 2
    docket_path, manifest_path, out_dir = argv
    try:
        silences, sources = build(load_json(docket_path), manifest_path)
    except (OSError, ValueError, KeyError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    write_json_atomic(os.path.join(out_dir, "silences.json"), silences)
    write_json_atomic(os.path.join(out_dir, "sources.json"), sources)
    print(f"wrote {out_dir}/silences.json cards={len(silences)}  sources={len(sources)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
