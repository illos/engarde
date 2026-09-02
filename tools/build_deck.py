#!/usr/bin/env python3
"""Deterministic stages of a Gate-3 ruling deck.

A deck directory holds:
  silences.json   questions (from docket_to_silences.py or a merged mining run)
  sources.json    verbatim pinned text for every source artifact (extract_sources.py)
  cards/<qid>.json  one self-contained file per card for the answer/refute agents
  answers.json    proposed answers + skeptic findings (ingested from the workflow)
  review-set.json / ledger.json / review.html   the deck the user rules on
  rulings.json / canon-draft.md                  settled verdicts (settle_rulings.py)

subcommands:
  prep   <deck-dir>                       write cards/ and the workflow's cards list
  ingest <deck-dir> <workflow-output.json> write answers.json from the workflow return value
  build  <deck-dir> [--title T]           verify quotes → join → render review.html
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys

from extract_sources import load_json, write_json_atomic

TOOLS = os.path.dirname(os.path.abspath(__file__))
EMPTY_SAFETY = {"schema": "engarde-ruling-dispositions-v1", "dispositions": [], "findingLinks": []}
EMPTY_QUARANTINE = {"schema": "engarde-quote-quarantine-v1", "claims": 0, "problemFragments": 0, "quarantines": []}


def stable_qid(question):
    return hashlib.sha256(question.encode()).hexdigest()[:12]


def prep(deck_dir):
    silences = load_json(os.path.join(deck_dir, "silences.json"))
    sources = {s["id"]: s for s in load_json(os.path.join(deck_dir, "sources.json"))}
    cards = []
    seen = set()
    for row in silences:
        qid = stable_qid(row["question"])
        if qid in seen:
            raise ValueError(f"duplicate question in silences: {qid}")
        seen.add(qid)
        missing = [sid for sid in row["sourceArtifactIds"] if sid not in sources]
        if missing:
            raise ValueError(f"card {qid} references sources not in sources.json: {missing}")
        card_path = os.path.join(deck_dir, "cards", f"{qid}.json")
        write_json_atomic(
            card_path,
            {
                "qid": qid,
                "question": row["question"],
                "group": row.get("group"),
                "subQuestions": row.get("subQuestions", []),
                "sources": [sources[sid] for sid in row["sourceArtifactIds"]],
            },
        )
        cards.append(
            {
                "qid": qid,
                "question": row["question"],
                "group": row.get("group"),
                "subQuestions": row.get("subQuestions", []),
                "sourceArtifactIds": row["sourceArtifactIds"],
                "cardPath": os.path.abspath(card_path),
            }
        )
    write_json_atomic(os.path.join(deck_dir, "cards.json"), cards)
    write_json_atomic(os.path.join(deck_dir, "ruling-safety.json"), EMPTY_SAFETY)
    write_json_atomic(os.path.join(deck_dir, "quote-quarantine.json"), EMPTY_QUARANTINE)
    return cards


def unwrap(workflow_output):
    """Accept the raw return value or the harness's {summary, result, ...} envelope."""
    if isinstance(workflow_output, dict) and "result" in workflow_output and "mode" not in workflow_output:
        return workflow_output["result"]
    return workflow_output


def ingest(deck_dir, workflow_output):
    workflow_output = unwrap(workflow_output)
    if not isinstance(workflow_output, dict) or workflow_output.get("mode") != "verify":
        raise ValueError("workflow output must be the verify-mode return value")
    cards = {c["qid"]: c for c in load_json(os.path.join(deck_dir, "cards.json"))}
    answers, findings = [], []
    for answer in workflow_output.get("answers", []):
        card = cards.get(answer.get("qid"))
        if card is None or answer.get("question") not in (None, card["question"]):
            raise ValueError(f"answer does not identify a card of this deck: {answer.get('qid')}")
        answers.append(
            {
                "qid": answer["qid"],
                "question": card["question"],
                "answer": answer["answer"],
                "basis": answer["basis"],
                "evidence": answer.get("evidence", ""),
                "reasoning": answer["reasoning"],
                "confidence": answer["confidence"],
                "consequenceIfWrong": answer.get("consequenceIfWrong", ""),
                "alternatives": answer.get("alternatives", []),
                "collapsedSubQuestions": answer.get("collapsedSubQuestions", []),
                "existingRulings": answer.get("existingRulings", []),
            }
        )
    for finding in workflow_output.get("findings", []):
        if finding.get("qid") not in cards:
            raise ValueError(f"finding does not identify a card of this deck: {finding.get('qid')}")
        row = {
            "qid": finding["qid"],
            "question": cards[finding["qid"]]["question"],
            "problem": f"[{finding.get('kind', 'other')} · skeptic {finding.get('skeptic', '?')}] {finding['problem']}",
            "kind": finding.get("kind", "other"),
        }
        if finding.get("correctedBasis"):
            row["correctedBasis"] = finding["correctedBasis"]
        if finding.get("fabricatedQuote"):
            row["fabricatedQuote"] = True
        findings.append(row)
    payload = {
        "schema": "engarde-deck-answers-v1",
        "answers": answers,
        "findings": findings,
        "skepticSummaries": workflow_output.get("skepticSummaries", []),
        "unanswered": workflow_output.get("unanswered", []),
    }
    write_json_atomic(os.path.join(deck_dir, "answers.json"), payload)
    return payload


def run(cmd):
    print("$", " ".join(cmd), flush=True)
    return subprocess.run(cmd, cwd=TOOLS).returncode


def build(deck_dir, title):
    deck = os.path.abspath(deck_dir)
    paths = {name: os.path.join(deck, f"{name}.json") for name in (
        "answers", "silences", "sources", "ruling-safety", "quote-quarantine", "review-set", "ledger")}
    quote_rc = run([sys.executable, os.path.join(TOOLS, "verify_quotes.py"), paths["answers"], paths["sources"]])
    join_rc = run([
        sys.executable, os.path.join(TOOLS, "build_ruling_set.py"),
        paths["answers"], paths["silences"], paths["ruling-safety"],
        paths["review-set"], paths["ledger"], paths["quote-quarantine"],
    ])
    if join_rc != 0:
        return join_rc
    review = load_json(paths["review-set"])
    ledger = load_json(paths["ledger"])
    # Every card goes to the user: the ledger's auto-settled rows (answered, unrefuted) are
    # still proposals until the user rules. Only the review-set carries refutations, so merge.
    settled_qids = {row["qid"] for row in review}
    for row in ledger.get("rows", []):
        if row["qid"] not in settled_qids:
            review.append(row)
    order = {stable_qid(row["question"]): i for i, row in enumerate(load_json(paths["silences"]))}
    review.sort(key=lambda row: order.get(row["qid"], 0))
    write_json_atomic(paths["review-set"], review)
    surface_rc = run([
        sys.executable, os.path.join(TOOLS, "ruling_surface.py"),
        paths["review-set"], paths["sources"], os.path.join(deck, "review.html"), "--title", title,
    ])
    if quote_rc != 0:
        print(f"NOTE: quote verification reported problems (exit {quote_rc}); the deck still renders "
              "but those cards carry uncertified evidence — fix or quarantine before settling.")
    return surface_rc


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    p_prep = sub.add_parser("prep"); p_prep.add_argument("deck_dir")
    p_ingest = sub.add_parser("ingest"); p_ingest.add_argument("deck_dir"); p_ingest.add_argument("workflow_output")
    p_build = sub.add_parser("build"); p_build.add_argument("deck_dir"); p_build.add_argument("--title", default="Canon rulings")
    args = parser.parse_args(argv)
    try:
        if args.command == "prep":
            cards = prep(args.deck_dir)
            print(f"wrote {args.deck_dir}/cards.json  cards={len(cards)}")
            return 0
        if args.command == "ingest":
            payload = ingest(args.deck_dir, load_json(args.workflow_output))
            print(f"wrote {args.deck_dir}/answers.json  answers={len(payload['answers'])}  findings={len(payload['findings'])}")
            return 0
        return build(args.deck_dir, args.title)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
