#!/usr/bin/env python3
"""Mechanically verify quoted claim fragments against actual corpus text."""

import difflib
import hashlib
import json
import re
import sys


def norm(text):
    text = text or ""
    for before, after in [
        (chr(8217), "'"),
        (chr(8216), "'"),
        (chr(8220), '"'),
        (chr(8221), '"'),
        (chr(8212), "--"),
        (chr(8211), "-"),
        (chr(160), " "),
        (chr(8230), "..."),
    ]:
        text = text.replace(before, after)
    # Link destinations and Markdown emphasis are transport, not quoted prose.
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    # Evidence notes often retain a de-linked SCC label as ``[word]`` while
    # accepted bundle text retains the full Markdown link. Both represent the
    # same visible source words; brackets are not rulebook punctuation.
    text = re.sub(r"\[([^\]]+)\]", r"\1", text)
    text = text.replace("**", "")
    return re.sub(r"\s+", " ", text).strip()


def fragments(evidence):
    """Extract every non-empty ASCII or smart-double-quoted fragment."""
    normalized = norm(evidence)
    return re.findall(r'"([^\"]+)"', normalized)


def claim_rows(data):
    if isinstance(data, list):
        if not data:
            raise ValueError("claims array must not be empty")
        return data
    if isinstance(data, dict):
        if not any(key in data for key in ("answers", "findings", "userRuled")):
            raise ValueError("claims object needs answers, findings, or userRuled")
        rows = []
        for key in ("answers", "findings", "userRuled"):
            value = data.get(key, [])
            if not isinstance(value, list):
                raise ValueError(f"claims.{key} must be an array")
            rows.extend(value)
        if not rows:
            raise ValueError("claims object contains no claims")
        return rows
    raise ValueError("claims must be an array or an object with answers/findings arrays")


def corpus_rows(data):
    """Yield only records whose actual text field is corpus prose."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        if isinstance(data.get("text"), str):
            return [data]
        rows = data.get("rows", data.get("records", []))
        if not isinstance(rows, list):
            raise ValueError("corpus.rows/records must be an array")
        return rows
    raise ValueError("corpus must be an array, a text record, or an object with rows")


def load_corpora(paths):
    corpora = {}
    for path in paths:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
        for index, row in enumerate(corpus_rows(data)):
            if isinstance(row, dict) and isinstance(row.get("text"), str):
                name = row.get("id") or f"{path}#{index}"
                corpora[name] = norm(row["text"])
    return corpora


def check(fragment, corpora):
    expected = norm(fragment)
    for name, text in corpora.items():
        if expected in text:
            return "EXACT", name

    best, score, where = None, 0.0, None
    words = expected.split()
    if words:
        # Approximation is diagnostic only. Anchor on the opening phrase so a
        # larger pinned corpus does not turn every failure into an O(corpus)
        # fuzzy scan on common words such as "the".
        anchor = " ".join(words[: min(4, len(words))])
        for name, text in corpora.items():
            for match in re.finditer(re.escape(anchor), text):
                window = text[match.start() : match.start() + len(expected) + 60]
                ratio = difflib.SequenceMatcher(None, expected, window[: len(expected)]).ratio()
                if ratio > score:
                    best, score, where = window[: len(expected) + 20], ratio, name
    verdict = "MISQUOTE" if score > 0.6 else "NOT FOUND"
    detail = f"{where}: {best!r}" if best else ""
    return verdict, detail


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    quarantine_path = None
    allow_exact_quarantine = False
    if "--allow-exact-quarantine" in argv:
        argv.remove("--allow-exact-quarantine")
        allow_exact_quarantine = True
    if "--quarantine" in argv:
        index = argv.index("--quarantine")
        if index + 1 >= len(argv):
            print("ERROR: --quarantine needs a path", file=sys.stderr)
            return 2
        quarantine_path = argv[index + 1]
        argv = argv[:index] + argv[index + 2 :]
    if allow_exact_quarantine and not quarantine_path:
        print("ERROR: --allow-exact-quarantine requires --quarantine", file=sys.stderr)
        return 2
    if len(argv) < 2:
        print("usage: verify_quotes.py <claims.json> <corpus.json> [corpus.json ...]", file=sys.stderr)
        return 2
    try:
        with open(argv[0], encoding="utf-8") as handle:
            claims = claim_rows(json.load(handle))
        corpora = load_corpora(argv[1:])
        quarantine_data = None
        if quarantine_path:
            with open(quarantine_path, encoding="utf-8") as handle:
                quarantine_data = json.load(handle)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

    bad = 0
    residual_by_qid = {}
    for index, claim in enumerate(claims):
        if not isinstance(claim, dict):
            print(f"ERROR: claim {index} is not an object", file=sys.stderr)
            return 2
        quoted = fragments(claim.get("evidence", ""))
        results = [(fragment, *check(fragment, corpora)) for fragment in quoted]
        problems = [result for result in results if result[1] != "EXACT"]
        qid = hashlib.sha256(str(claim.get("question", "")).encode()).hexdigest()[:12]
        if problems:
            if qid in residual_by_qid:
                print(f"ERROR: multiple failing claim occurrences for qid {qid}", file=sys.stderr)
                return 2
            residual_by_qid[qid] = {
                "problemFragments": len(problems),
                "evidenceSha256": hashlib.sha256(
                    str(claim.get("evidence", "")).encode()
                ).hexdigest(),
            }
        flag = "OK  " if not problems else "FAIL"
        label = str(claim.get("question") or claim.get("qid") or f"claim {index}")
        print(f"\n[{flag}] {label[:88]}")
        print(
            f"       fragments: {len(quoted)}  exact: {len(quoted) - len(problems)}  "
            f"problems: {len(problems)}"
        )
        for fragment, verdict, where in problems:
            bad += 1
            print(f'       {verdict}: "{fragment[:110]}"')
            if where:
                print(f"         source has: {where[:190]}")
    print(f"\n=== {bad} problem fragments across {len(claims)} claims ===")
    if quarantine_path:
        try:
            entries = quarantine_data.get("quarantines", [])
            if not isinstance(entries, list):
                raise ValueError("quarantine.quarantines must be an array")
            expected = {}
            for entry in entries:
                if not isinstance(entry, dict) or not isinstance(entry.get("qid"), str):
                    raise ValueError("each quarantine needs a qid")
                if entry["qid"] in expected:
                    raise ValueError(f"duplicate quarantine qid {entry['qid']}")
                expected[entry["qid"]] = {
                    "problemFragments": entry.get("problemFragments"),
                    "evidenceSha256": entry.get("evidenceSha256"),
                }
            if expected != residual_by_qid:
                missing = sorted(set(residual_by_qid) - set(expected))
                stale = sorted(set(expected) - set(residual_by_qid))
                changed = sorted(
                    qid
                    for qid in set(expected) & set(residual_by_qid)
                    if expected[qid] != residual_by_qid[qid]
                )
                raise ValueError(
                    f"quote quarantine mismatch: missing={missing} stale={stale} changed={changed}"
                )
            if quarantine_data.get("claims") != len(expected) or quarantine_data.get(
                "problemFragments"
            ) != bad:
                raise ValueError("quote quarantine summary is stale")
            print(
                f"=== residual quarantine exact: {len(expected)} claims / {bad} fragments; "
                "certification remains red ==="
            )
        except (AttributeError, ValueError) as error:
            print(f"ERROR: {error}", file=sys.stderr)
            return 2
    if bad and allow_exact_quarantine:
        print("=== routing gate passed: every residual is explicitly quarantined ===")
        return 0
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
