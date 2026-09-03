#!/usr/bin/env python3
"""Settle a user's exported ruling blob against the deck it was ruled on.

Input is the JSON the card deck's "Export" button produces
(``engarde-batch-rulings-v1``) plus the review set and sources the deck was
built from. The tool refuses to settle unless the blob's ``docKey`` matches the
deck recomputed from those inputs — a ruling made on a different set of cards
never lands here. Every settled row carries a ``cardHash`` over the exact card
the user saw, so a later change to a question or its evidence invalidates the
ruling loudly instead of silently.

Outputs ``rulings.json`` (``engarde-deck-rulings-v1``) and a Markdown draft of
``docs/canon-rulings.md`` entries for every accepted or overridden card. The
draft is a skeleton for the Lead to place; the verdict is the user's and the
prose is theirs when they overrode.

usage: settle_rulings.py <blob.json> <review-set.json> <sources.json>
           <out-rulings.json> <out-draft.md> --deck <name> --next-id R-0046
"""

import argparse
import hashlib
import json
import os
import sys

from extract_sources import load_json, write_json_atomic
from ruling_surface import prepare

VERDICTS = {
    "yes": "accept",
    "no": "override",
    "director": "director-call",
    "defer": "defer",
    "source": "needs-source",
}


def card_hash(card):
    return hashlib.sha256(json.dumps(card, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def doc_key(prepared):
    payload = json.dumps(prepared, ensure_ascii=False)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def next_ids(start, count):
    prefix, number = start.rsplit("-", 1)
    width = len(number)
    return [f"{prefix}-{int(number) + offset:0{width}d}" for offset in range(count)]


def settle(blob, review_set, sources, deck, next_id):
    if not isinstance(blob, dict) or blob.get("schema") != "engarde-batch-rulings-v1":
        raise ValueError("blob must be an engarde-batch-rulings-v1 export")
    prepared = prepare(review_set, sources)
    expected_key = doc_key(prepared)
    if blob.get("docKey") != expected_key:
        raise ValueError(
            f"blob docKey {blob.get('docKey')!r} does not match this deck ({expected_key}); "
            "the user ruled on a different set of cards"
        )
    cards = {card["qid"]: card for card in prepared}
    rulings = blob.get("rulings")
    if not isinstance(rulings, list) or not rulings:
        raise ValueError("blob carries no rulings")

    settled, unruled, problems = [], [], []
    seen = set()
    for entry in rulings:
        qid = entry.get("qid")
        if qid not in cards:
            problems.append(f"ruling for unknown qid {qid!r}")
            continue
        if qid in seen:
            problems.append(f"duplicate ruling for qid {qid}")
            continue
        seen.add(qid)
        card = cards[qid]
        verdict = VERDICTS.get(entry.get("verdict"))
        note = (entry.get("note") or "").strip() or None
        if verdict is None:
            if note:
                unruled.append({"qid": qid, "question": card["question"], "note": note})
            else:
                problems.append(f"qid {qid} has no verdict")
            continue
        if verdict == "override" and not note:
            problems.append(f"qid {qid} overrides the proposal without saying what the ruling is")
            continue
        proposed = card.get("proposedAnswer") or None
        ruling_text = note if verdict == "override" else (note or proposed)
        settled.append(
            {
                "qid": qid,
                "question": card["question"],
                "group": card.get("group"),
                "userVerdict": verdict,
                "ruling": ruling_text if verdict in {"accept", "override"} else None,
                "overrideNote": note if verdict == "override" else None,
                "userNote": note if verdict not in {"override"} else None,
                "proposedAnswer": proposed,
                "basis": card.get("basis"),
                "evidence": card.get("evidence"),
                "reasoning": card.get("reasoning"),
                "sourceArtifactIds": [source["id"] for source in card.get("sources", [])],
                "sourceVersions": {
                    source["id"]: source["version"] for source in card.get("sources", [])
                },
                "ruledAt": entry.get("at"),
                "cardHash": card_hash(card),
            }
        )
    if problems:
        raise ValueError("blob cannot be settled: " + "; ".join(problems))

    missing = [qid for qid in cards if qid not in seen]
    settled.sort(key=lambda row: [card["qid"] for card in prepared].index(row["qid"]))
    recordable = [row for row in settled if row["userVerdict"] in {"accept", "override"}]
    ids = next_ids(next_id, len(recordable))
    for row, ruling_id in zip(recordable, ids):
        row["rulingId"] = ruling_id

    result = {
        "schema": "engarde-deck-rulings-v1",
        "deck": deck,
        "docKey": expected_key,
        "exportedAt": blob.get("exportedAt"),
        "authority": "User Gate-3 verdicts; the verdict is the user's, the proposed prose is not.",
        "counts": {
            "cards": len(cards),
            "ruled": len(settled),
            "accepted": sum(row["userVerdict"] == "accept" for row in settled),
            "overridden": sum(row["userVerdict"] == "override" for row in settled),
            "directorCall": sum(row["userVerdict"] == "director-call" for row in settled),
            "deferred": sum(row["userVerdict"] == "defer" for row in settled),
            "needsSource": sum(row["userVerdict"] == "needs-source" for row in settled),
            "unruled": len(missing) + len(unruled),
        },
        "userRuled": settled,
        "unruled": [{"qid": qid, "question": cards[qid]["question"]} for qid in missing] + unruled,
    }
    return result, draft_markdown(result)


def draft_markdown(result):
    date = (result.get("exportedAt") or "")[:10] or "DATE"
    lines = [
        f"<!-- DRAFT — settle_rulings.py, deck {result['deck']}, docKey {result['docKey']}. "
        "Place each entry in docs/canon-rulings.md after reading it; the verdict is the user's. -->",
        "",
    ]
    for row in result["userRuled"]:
        if row["userVerdict"] not in {"accept", "override"}:
            continue
        title = row["question"].split("?")[0].strip().rstrip(".")
        title = title.replace("**", "")
        lines.append(f"## {row['rulingId']} — {title} (approved {date})")
        lines.append("")
        lines.append(f"**Question:** {row['question']}")
        lines.append("")
        if row["userVerdict"] == "override":
            lines.append(f"**Ruling (user's words, overriding the proposal):** {row['ruling']}")
            lines.append("")
            lines.append(f"**Proposal that was overridden:** {row['proposedAnswer']}")
        else:
            lines.append(f"**Ruling:** {row['ruling']}")
            if row.get("userNote"):
                lines.append("")
                lines.append(f"**User note:** {row['userNote']}")
        lines.append("")
        if row.get("evidence"):
            lines.append(f"**Evidence:** {row['evidence']}")
            lines.append("")
        if row.get("reasoning"):
            lines.append(f"**Reasoning:** {row['reasoning']}")
            lines.append("")
        lines.append(
            f"**Gate 3:** user verdict `{row['userVerdict']}` on deck `{result['deck']}` "
            f"({date}); card hash `{row['cardHash'][:12]}`; basis `{row['basis']}`; "
            f"sources {', '.join(row['sourceArtifactIds'])}."
        )
        lines.append("")
    for row in result["userRuled"]:
        if row["userVerdict"] in {"accept", "override"}:
            continue
        lines.append(f"<!-- {row['qid']} {row['userVerdict']}: {row['question']}"
                     + (f" — note: {row['userNote']}" if row.get("userNote") else "") + " -->")
    return "\n".join(lines).rstrip() + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("blob")
    parser.add_argument("review_set")
    parser.add_argument("sources")
    parser.add_argument("out_rulings")
    parser.add_argument("out_draft")
    parser.add_argument("--deck", required=True)
    parser.add_argument("--next-id", required=True)
    args = parser.parse_args(argv)
    try:
        result, draft = settle(
            load_json(args.blob),
            load_json(args.review_set),
            load_json(args.sources),
            args.deck,
            args.next_id,
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    write_json_atomic(args.out_rulings, result)
    os.makedirs(os.path.dirname(os.path.abspath(args.out_draft)), exist_ok=True)
    with open(args.out_draft, "w", encoding="utf-8") as handle:
        handle.write(draft)
    counts = result["counts"]
    print(
        f"wrote {args.out_rulings}  ruled={counts['ruled']}/{counts['cards']}"
        f"  accepted={counts['accepted']} overridden={counts['overridden']}"
        f" director={counts['directorCall']} deferred={counts['deferred']}"
        f" needsSource={counts['needsSource']} unruled={counts['unruled']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
