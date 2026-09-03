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

from extract_sources import bundle_paths, load_json, write_json_atomic

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


def assemble(out_dir, deck_dirs, title):
    """Gather every card the skeptics did NOT refute from several built decks into one deck for the user."""
    review, sources, provenance = [], {}, []
    seen = set()
    for deck_dir in deck_dirs:
        deck = os.path.abspath(deck_dir)
        rows = load_json(os.path.join(deck, "review-set.json"))
        deck_sources = {src["id"]: src for src in load_json(os.path.join(deck, "sources.json"))}
        for row in rows:
            if row.get("refuted") or row.get("unanswered") or row.get("fabricatedQuote"):
                continue
            if row["qid"] in seen:
                raise ValueError(f"card {row['qid']} appears in more than one deck")
            seen.add(row["qid"])
            row = dict(row)
            row["fromDeck"] = os.path.basename(deck)
            review.append(row)
            for sid in row.get("sourceArtifactIds", []):
                sources.setdefault(sid, deck_sources[sid])
            provenance.append({"qid": row["qid"], "deck": os.path.basename(deck), "group": row.get("group")})
    if not review:
        raise ValueError("no unrefuted cards to assemble")
    out = os.path.abspath(out_dir)
    write_json_atomic(os.path.join(out, "review-set.json"), review)
    write_json_atomic(os.path.join(out, "sources.json"), list(sources.values()))
    write_json_atomic(os.path.join(out, "provenance.json"), {"schema": "engarde-assembled-deck-v1", "decks": [os.path.abspath(d) for d in deck_dirs], "cards": provenance})
    rc = run([sys.executable, os.path.join(TOOLS, "ruling_surface.py"),
              os.path.join(out, "review-set.json"), os.path.join(out, "sources.json"),
              os.path.join(out, "review.html"), "--title", title])
    return rc, len(review)


def from_mine(deck_dir, workflow_output, manifest_path):
    """Materialize a deck's silences.json + sources.json from a mine-mode workflow return value."""
    from extract_sources import extract
    out = unwrap(workflow_output)
    if not isinstance(out, dict) or out.get("mode") != "mine":
        raise ValueError("workflow output must be the mine-mode return value")
    merged = out["mined"]["merged"]
    silences, ids = [], []
    for card in merged.get("cards", []):
        silences.append({
            "group": card["group"], "question": card["question"], "tags": card.get("kind", ""),
            "oneRuling": bool(card.get("oneRuling")), "subQuestions": card.get("subQuestions", []),
            "sourceArtifactIds": list(dict.fromkeys(card["sourceArtifactIds"])),
            "gates": f"mined ({os.path.basename(os.path.abspath(deck_dir))})",
        })
        ids += card["sourceArtifactIds"]
    if not silences:
        raise ValueError("mine output carries no cards")
    sources = extract(manifest_path, list(dict.fromkeys(ids)))
    write_json_atomic(os.path.join(deck_dir, "silences.json"), silences)
    write_json_atomic(os.path.join(deck_dir, "sources.json"), sources)
    write_json_atomic(os.path.join(deck_dir, "mine", "dropped.json"), {
        "schema": "engarde-mine-dropped-v1", "raw": out["mined"].get("raw", []),
        "dropped": merged.get("dropped", []), "examined": out["mined"].get("examined", []),
        "deadBatches": out["mined"].get("deadBatches", []),
    })
    return len(silences), len(sources)


def from_recut(deck_dir, from_deck, workflow_output, manifest_path):
    """Materialize a residue deck from a recut-mode workflow return value (residue already merged by the workflow)."""
    from extract_sources import extract
    out = unwrap(workflow_output)
    if not isinstance(out, dict) or out.get("mode") != "recut":
        raise ValueError("workflow output must be the recut-mode return value")
    silences, ids = [], []
    for row in out.get("residue", []):
        group = row["group"].split("(refuted card")[0].strip()
        silences.append({
            "group": group, "question": row["question"], "tags": row.get("kind", ""),
            "oneRuling": bool(row.get("oneRuling", False)), "subQuestions": row.get("subQuestions", []),
            "sourceArtifactIds": list(dict.fromkeys(row["sourceArtifactIds"])),
            "gates": f"recut residue of {os.path.basename(os.path.abspath(from_deck))} card {row.get('fromCard', '?')}",
            "recutFrom": row.get("fromCard"), "whyOpen": row.get("whyOpen", ""),
            "candidateDefault": row.get("candidateDefault", ""),
        })
        ids += row["sourceArtifactIds"]
    write_json_atomic(os.path.join(deck_dir, "settled-elsewhere.json"), {
        "schema": "engarde-recut-settled-v1", "fromDeck": os.path.basename(os.path.abspath(from_deck)),
        "count": len(out.get("settledElsewhere", [])), "rows": out.get("settledElsewhere", []),
        "mergeDropped": out.get("mergeDropped", []),
    })
    if not silences:
        return 0, 0
    sources = extract(manifest_path, list(dict.fromkeys(ids)))
    write_json_atomic(os.path.join(deck_dir, "silences.json"), silences)
    write_json_atomic(os.path.join(deck_dir, "sources.json"), sources)
    return len(silences), len(sources)


def index(decks_root):
    """Regenerate the root index.html listing every deck; assembled 'rule-these' decks first."""
    import html as _html
    entries = []
    for name in sorted(os.listdir(decks_root)):
        path = os.path.join(decks_root, name)
        review = os.path.join(path, "review-set.json")
        if not os.path.isdir(path) or not os.path.exists(review) or not os.path.exists(os.path.join(path, "review.html")):
            continue
        rows = load_json(review)
        settled = os.path.exists(os.path.join(path, "rulings.json"))
        refuted = sum(1 for r in rows if r.get("refuted"))
        entries.append((name.startswith("rule-these"), name, len(rows), refuted, settled))
    entries.sort(key=lambda e: (not e[0], e[1]), reverse=False)
    lines = ['<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ruling decks</title>',
             '<style>body{margin:0;background:#12100e;color:#f0ebe4;font:18px/1.6 ui-sans-serif,system-ui;padding:28px}a{color:#c9a227}li{margin:10px 0}.dim{color:#a2978a;font-size:14px}</style></head><body><h1>Ruling decks</h1>']
    to_rule = [e for e in entries if e[0] and not e[4]]
    lines.append("<h2>To rule</h2><ul>" + ("".join(f'<li><a href="{_html.escape(n)}/review.html"><b>{_html.escape(n)}</b></a> <span class="dim">{c} cards</span></li>' for _, n, c, _, _ in to_rule) or "<li class=dim>nothing pending</li>") + "</ul>")
    lines.append("<h2 class=dim>Settled</h2><ul class=dim>" + "".join(f'<li><a href="{_html.escape(n)}/review.html">{_html.escape(n)}</a> — {c} cards, settled</li>' for a, n, c, _, s in entries if a and s) + "</ul>")
    lines.append("<h2 class=dim>Audit trail (refuted cards show the skeptic's objections; not for ruling)</h2><ul class=dim>" + "".join(f'<li><a href="{_html.escape(n)}/review.html">{_html.escape(n)}</a> — {c} cards, {r} refuted</li>' for a, n, c, r, _ in entries if not a) + "</ul></body></html>")
    with open(os.path.join(decks_root, "index.html"), "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))
    return len(entries)


def run(cmd):
    print("$", " ".join(cmd), flush=True)
    return subprocess.run(cmd, cwd=TOOLS).returncode


def build(deck_dir, title, manifest_path=None):
    deck = os.path.abspath(deck_dir)
    paths = {name: os.path.join(deck, f"{name}.json") for name in (
        "answers", "silences", "sources", "ruling-safety", "quote-quarantine", "review-set", "ledger")}
    # Quotes may cite any pinned artifact, not only the card's own sources: verify
    # against the deck sources plus every definitive bundle the accepted manifest lists.
    # Only the proposed answers carry evidence; skeptic findings are prose and are not claims.
    answers_only = os.path.join(deck, "answers.claims.json")
    write_json_atomic(answers_only, {"answers": load_json(paths["answers"])["answers"]})
    corpora = [paths["sources"]]
    if manifest_path and os.path.exists(manifest_path):
        corpora += bundle_paths(load_json(manifest_path), manifest_path)
    quote_rc = run([sys.executable, os.path.join(TOOLS, "verify_quotes.py"), answers_only, *corpora])
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
    p_fm = sub.add_parser("from-mine"); p_fm.add_argument("deck_dir"); p_fm.add_argument("workflow_output")
    p_fr = sub.add_parser("from-recut"); p_fr.add_argument("deck_dir"); p_fr.add_argument("from_deck"); p_fr.add_argument("workflow_output")
    p_ix = sub.add_parser("index"); p_ix.add_argument("decks_root")
    p_asm = sub.add_parser("assemble"); p_asm.add_argument("out_dir"); p_asm.add_argument("deck_dirs", nargs="+"); p_asm.add_argument("--title", default="Canon rulings")
    p_build = sub.add_parser("build"); p_build.add_argument("deck_dir"); p_build.add_argument("--title", default="Canon rulings")
    for sp in (p_build, p_fm, p_fr):
        sp.add_argument("--manifest", default=os.path.join(TOOLS, "..", ".artifacts/canon/campaign/accepted/final-campaign-manifest.json"))
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
        if args.command == "from-mine":
            n, m = from_mine(args.deck_dir, load_json(args.workflow_output), args.manifest)
            print(f"wrote {args.deck_dir}/silences.json  cards={n}  sources={m}")
            return 0
        if args.command == "from-recut":
            n, m = from_recut(args.deck_dir, args.from_deck, load_json(args.workflow_output), args.manifest)
            print(f"wrote {args.deck_dir}/silences.json  cards={n}  sources={m}" if n else f"no residue; settled-elsewhere written to {args.deck_dir}")
            return 0
        if args.command == "index":
            print(f"indexed {index(args.decks_root)} decks")
            return 0
        if args.command == "assemble":
            rc, count = assemble(args.out_dir, args.deck_dirs, args.title)
            print(f"assembled {count} unrefuted cards into {args.out_dir}")
            return rc
        return build(args.deck_dir, args.title, args.manifest)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
