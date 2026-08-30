#!/usr/bin/env python3
"""Remove quote-uncertified rows from the valid user-ruling export."""

import json
import hashlib
import os
import sys
import tempfile

from build_ruling_set import stable_qid
from verify_quotes import claim_rows, fragments, load_corpora, norm


def load_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def write_json_atomic(path, value):
    directory = os.path.dirname(os.path.abspath(path))
    fd, temporary = tempfile.mkstemp(prefix=".user-rulings-", suffix=".json", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=1, ensure_ascii=False)
            handle.write("\n")
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def current_residuals(claims_data, corpus_paths):
    texts = list(load_corpora(corpus_paths).values())
    residuals = {}
    audited_qids = set()
    if not isinstance(claims_data, dict) or not isinstance(claims_data.get("answers"), list):
        raise ValueError("user-ruling quote audit requires claims.answers")
    for answer in claims_data["answers"]:
        if not isinstance(answer, dict) or not isinstance(answer.get("question"), str):
            raise ValueError("every audited answer needs a string question")
        qid = stable_qid(answer["question"])
        if qid in audited_qids:
            raise ValueError(f"duplicate audited answer qid {qid}")
        audited_qids.add(qid)
    for claim in claim_rows(claims_data):
        if not isinstance(claim, dict) or not isinstance(claim.get("question"), str):
            raise ValueError("every quote-audited claim needs a string question")
        bad = [
            fragment
            for fragment in fragments(claim.get("evidence", ""))
            if not any(norm(fragment) in text for text in texts)
        ]
        if not bad:
            continue
        qid = stable_qid(claim["question"])
        if qid in residuals:
            raise ValueError(f"multiple failing claim occurrences for qid {qid}")
        residuals[qid] = {
            "problemFragments": len(bad),
            "evidenceSha256": hashlib.sha256(claim.get("evidence", "").encode()).hexdigest(),
        }
    return residuals, audited_qids


def validate_manifest_completeness(quote_manifest, residuals):
    entries = quote_manifest.get("quarantines")
    if not isinstance(entries, list):
        raise ValueError("quote manifest must contain a quarantines array")
    expected = {}
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("qid"), str):
            raise ValueError("quote quarantine needs a qid")
        if entry["qid"] in expected:
            raise ValueError(f"duplicate quote quarantine qid {entry['qid']}")
        expected[entry["qid"]] = {
            "problemFragments": entry.get("problemFragments"),
            "evidenceSha256": entry.get("evidenceSha256"),
        }
    if expected != residuals:
        raise ValueError("quote manifest does not exactly cover current residuals")
    if quote_manifest.get("claims") != len(expected) or quote_manifest.get(
        "problemFragments"
    ) != sum(row["problemFragments"] for row in residuals.values()):
        raise ValueError("quote manifest summary is stale")


def apply(rulings, quote_manifest, residuals, audited_qids):
    if not isinstance(rulings, dict) or not isinstance(rulings.get("userRuled"), list):
        raise ValueError("rulings must contain a userRuled array")
    validate_manifest_completeness(quote_manifest, residuals)
    entries = quote_manifest["quarantines"]
    quote_by_qid = {entry.get("qid"): entry for entry in entries if isinstance(entry, dict)}
    if None in quote_by_qid or len(quote_by_qid) != len(entries):
        raise ValueError("quote manifest qids must be present and unique")

    # Include the previous output so repeated regeneration is idempotent.
    candidates = rulings["userRuled"] + rulings.get("quoteQuarantined", [])
    by_qid = {}
    for row in candidates:
        if not isinstance(row, dict) or not isinstance(row.get("qid"), str):
            raise ValueError("user ruling needs a qid")
        if row["qid"] in by_qid:
            raise ValueError(f"duplicate user ruling qid {row['qid']}")
        if row["qid"] not in audited_qids:
            raise ValueError(f"user ruling qid {row['qid']} is absent from audited answers")
        clean = dict(row)
        for key in ("quoteDisposition", "quoteReasonCode", "quoteProblemFragments"):
            clean.pop(key, None)
        by_qid[row["qid"]] = clean

    valid = []
    quarantined = []
    for qid, row in by_qid.items():
        quote_entry = quote_by_qid.get(qid)
        if quote_entry:
            row.update(
                {
                    "quoteDisposition": "quarantined",
                    "quoteReasonCode": quote_entry["reasonCode"],
                    "quoteProblemFragments": quote_entry["problemFragments"],
                }
            )
            quarantined.append(row)
        else:
            valid.append(row)

    output = dict(rulings)
    output["quoteSafetyManifest"] = "tools/common-actions-quote-quarantine.json"
    output["authority"] = (
        f"User Gate-3 rulings, 2026-08-29. {len(valid)} rulings have quote-certified "
        f"evidence; {len(quarantined)} otherwise-valid user rulings are retained under "
        "quote quarantine pending evidence repair. The mandatory GOTCHA-0011 safety "
        "quarantines remain separate."
    )
    output["userRuled"] = valid
    output["quoteQuarantined"] = quarantined
    return output


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) < 5:
        print(
            "usage: apply_quote_quarantine.py <rulings.json> <claims.json> "
            "<quote-manifest.json> <out.json> <corpus.json> [corpus.json ...]",
            file=sys.stderr,
        )
        return 2
    try:
        claims_data = load_json(argv[1])
        quote_manifest = load_json(argv[2])
        residuals, audited_qids = current_residuals(claims_data, argv[4:])
        output = apply(load_json(argv[0]), quote_manifest, residuals, audited_qids)
        write_json_atomic(argv[3], output)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    print(
        f"wrote {argv[3]}  userRuled={len(output['userRuled'])}  "
        f"quoteQuarantined={len(output['quoteQuarantined'])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
