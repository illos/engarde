#!/usr/bin/env python3
"""Join answered questions into a review queue and a settled ledger.

Findings may identify their targets with an explicit ``qid``/``qids`` or by an
exact question (ignoring Markdown emphasis). Needs-user corrections,
fabricated quotes, conflicting corrections, and explicit dispositions block a
row's settlement. Fuzzy similarity is diagnostic only: a guessed join can put
the real target in the settled ledger, so unresolved findings block the entire
settlement run.

usage: build_ruling_set.py <answers.json> <silences.json> <dispositions.json>
                           <out-review.json> <out-ledger.json>
                           [quote-quarantine.json]
"""

import difflib
import hashlib
import json
import os
import re
import sys
import tempfile
from collections import Counter, defaultdict


def stable_qid(question):
    """Return the stable id used by ruling_surface.py."""
    return hashlib.sha256(question.encode()).hexdigest()[:12]


def canonical_question(question):
    """Ignore transport-only Markdown emphasis, not wording differences."""
    text = (question or "").replace("**", "").replace("__", "")
    text = text.replace("`", "").replace("*", "").replace("_", "")
    return re.sub(r"\s+", " ", text).strip()


def load_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def write_json_atomic(path, value):
    """Never leave a half-written review or ledger behind."""
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".ruling-set-", suffix=".json", dir=directory)
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


def nearest_question(question, questions):
    """Return a suggestion for a human; callers must never use it as a join."""
    needle = canonical_question(question).lower()
    scored = sorted(
        (
            difflib.SequenceMatcher(None, needle, canonical_question(candidate).lower()).ratio(),
            candidate,
        )
        for candidate in questions
    )
    if not scored:
        return None, 0.0, 0.0
    score, candidate = scored[-1]
    runner_up = scored[-2][0] if len(scored) > 1 else 0.0
    return candidate, score, score - runner_up


def resolve_finding_targets(
    finding, questions, questions_by_qid, exact, canonical, finding_links
):
    """Resolve only explicit or exact identities; never make a fuzzy attachment."""
    explicit = finding.get("qids")
    if explicit is None and finding.get("qid") is not None:
        explicit = [finding["qid"]]
    if explicit is not None:
        if not isinstance(explicit, list) or not explicit:
            return [], "explicit qids must be a non-empty array"
        if len(set(explicit)) != len(explicit):
            return [], "explicit qids contain a duplicate"
        unknown = [qid for qid in explicit if qid not in questions_by_qid]
        if unknown:
            return [], f"explicit qids are unknown: {', '.join(map(str, unknown))}"
        return explicit, None

    question = finding.get("question")
    if not isinstance(question, str) or not question:
        return [], "finding has neither qid(s) nor a non-empty question"
    if question in finding_links:
        return finding_links[question], None
    if question in exact:
        return [exact[question]], None

    candidates = canonical.get(canonical_question(question), [])
    if len(candidates) == 1:
        return [candidates[0]], None
    if len(candidates) > 1:
        return [], "question has multiple exact canonical matches; add qid(s)"

    suggested, score, margin = nearest_question(question, questions)
    suggestion = stable_qid(suggested) if suggested else None
    return [], (
        "no exact question match; add qid(s)"
        f" (nearest={suggestion}, score={score:.3f}, margin={margin:.3f})"
    )


def validate_safety_manifest(data, questions_by_qid):
    if not isinstance(data, dict) or not isinstance(data.get("dispositions"), list):
        raise ValueError("dispositions input must be an object with a dispositions array")

    dispositions = {}
    for index, entry in enumerate(data["dispositions"]):
        if not isinstance(entry, dict):
            raise ValueError(f"disposition {index} is not an object")
        qid = entry.get("qid")
        if not isinstance(qid, str) or qid not in questions_by_qid:
            raise ValueError(f"disposition {index} has unknown qid {qid!r}")
        if qid in dispositions:
            raise ValueError(f"duplicate disposition for qid {qid}")
        if entry.get("disposition") != "quarantined":
            raise ValueError(
                f"disposition {index} must be 'quarantined', got {entry.get('disposition')!r}"
            )
        if not entry.get("reasonCode") or not entry.get("reason"):
            raise ValueError(f"disposition {index} needs reasonCode and reason")
        dispositions[qid] = dict(entry)
    finding_links = {}
    raw_links = data.get("findingLinks", [])
    if not isinstance(raw_links, list):
        raise ValueError("dispositions.findingLinks must be an array")
    for index, entry in enumerate(raw_links):
        if not isinstance(entry, dict) or not isinstance(entry.get("question"), str):
            raise ValueError(f"finding link {index} needs a string question")
        question = entry["question"]
        if question in finding_links:
            raise ValueError(f"duplicate finding link for {question!r}")
        qids = entry.get("qids")
        if not isinstance(qids, list) or not qids or len(qids) != len(set(qids)):
            raise ValueError(f"finding link {index} needs unique, non-empty qids")
        unknown = [qid for qid in qids if qid not in questions_by_qid]
        if unknown:
            raise ValueError(f"finding link {index} has unknown qids: {unknown}")
        finding_links[question] = qids
    return dispositions, finding_links


def validate_quote_quarantine(data, questions_by_qid, answers_by_qid):
    if not isinstance(data, dict) or not isinstance(data.get("quarantines"), list):
        raise ValueError("quote quarantine must be an object with a quarantines array")
    quarantines = {}
    problem_fragments = 0
    for index, entry in enumerate(data["quarantines"]):
        if not isinstance(entry, dict):
            raise ValueError(f"quote quarantine {index} is not an object")
        qid = entry.get("qid")
        if qid not in questions_by_qid or qid not in answers_by_qid:
            raise ValueError(f"quote quarantine {index} has unknown/unanswered qid {qid!r}")
        if qid in quarantines:
            raise ValueError(f"duplicate quote quarantine for qid {qid}")
        evidence = answers_by_qid[qid].get("evidence", "")
        evidence_hash = hashlib.sha256(evidence.encode()).hexdigest()
        if entry.get("evidenceSha256") != evidence_hash:
            raise ValueError(f"quote quarantine {qid} evidence hash is stale")
        count = entry.get("problemFragments")
        if not isinstance(count, int) or count < 1:
            raise ValueError(f"quote quarantine {qid} needs a positive problemFragments count")
        if entry.get("reasonCode") != "uncertified-quoted-evidence":
            raise ValueError(f"quote quarantine {qid} has invalid reasonCode")
        quarantines[qid] = dict(entry)
        problem_fragments += count
    if data.get("claims") != len(quarantines) or data.get("problemFragments") != problem_fragments:
        raise ValueError("quote quarantine summary does not match its entries")
    return quarantines


def build(answers_data, silences, dispositions_data, quote_quarantine_data):
    if not isinstance(answers_data, dict) or not isinstance(answers_data.get("answers"), list):
        raise ValueError("answers input must be an object with an answers array")
    if not isinstance(silences, list):
        raise ValueError("silences input must be an array")

    questions_by_qid = {}
    exact = {}
    canonical = defaultdict(list)
    prepared_questions = []
    for index, question_row in enumerate(silences):
        if not isinstance(question_row, dict) or not isinstance(question_row.get("question"), str):
            raise ValueError(f"silence {index} needs a string question")
        question = question_row["question"]
        qid = stable_qid(question)
        if qid in questions_by_qid:
            raise ValueError(f"duplicate question/qid in silences: {qid}")
        row = dict(question_row)
        row["qid"] = qid
        prepared_questions.append(row)
        questions_by_qid[qid] = row
        exact[question] = qid
        canonical[canonical_question(question)].append(qid)

    dispositions, finding_links = validate_safety_manifest(dispositions_data, questions_by_qid)

    answers_by_qid = {}
    for index, answer in enumerate(answers_data["answers"]):
        if not isinstance(answer, dict) or not isinstance(answer.get("question"), str):
            raise ValueError(f"answer {index} needs a string question")
        required_strings = (
            "answer",
            "basis",
            "evidence",
            "reasoning",
            "confidence",
            "consequenceIfWrong",
        )
        missing = [key for key in required_strings if not isinstance(answer.get(key), str)]
        if missing or not answer["answer"] or not answer["reasoning"]:
            raise ValueError(f"answer {index} has missing/invalid fields: {missing}")
        if answer["basis"] not in {"printed", "derived", "engine-design", "needs-user"}:
            raise ValueError(f"answer {index} has invalid basis {answer['basis']!r}")
        if answer["confidence"] not in {"low", "medium", "high"}:
            raise ValueError(f"answer {index} has invalid confidence {answer['confidence']!r}")
        qid = answer.get("qid") or stable_qid(answer["question"])
        if qid not in questions_by_qid or questions_by_qid[qid]["question"] != answer["question"]:
            raise ValueError(f"answer {index} does not exactly identify a silence; add/fix qid")
        if qid in answers_by_qid:
            raise ValueError(f"duplicate answer for qid {qid}")
        answers_by_qid[qid] = answer

    quote_quarantines = validate_quote_quarantine(
        quote_quarantine_data, questions_by_qid, answers_by_qid
    )

    findings_by_qid = defaultdict(list)
    join_errors = []
    findings = answers_data.get("findings", [])
    if not isinstance(findings, list):
        raise ValueError("findings must be an array")
    finding_questions = {
        finding.get("question") for finding in findings if isinstance(finding, dict)
    }
    stale_links = sorted(set(finding_links) - finding_questions)
    if stale_links:
        raise ValueError(f"finding links do not identify current findings: {stale_links}")
    questions = [row["question"] for row in prepared_questions]
    for index, finding in enumerate(findings):
        if not isinstance(finding, dict):
            join_errors.append({"findingIndex": index, "reason": "finding is not an object"})
            continue
        if not isinstance(finding.get("problem"), str) or not finding["problem"]:
            join_errors.append({"findingIndex": index, "reason": "finding needs a problem"})
            continue
        corrected_basis = finding.get("correctedBasis")
        if corrected_basis is not None and corrected_basis not in {
            "printed",
            "derived",
            "engine-design",
            "needs-user",
        }:
            join_errors.append(
                {"findingIndex": index, "reason": f"invalid correctedBasis {corrected_basis!r}"}
            )
            continue
        targets, error = resolve_finding_targets(
            finding, questions, questions_by_qid, exact, canonical, finding_links
        )
        if error:
            join_errors.append(
                {
                    "findingIndex": index,
                    "question": finding.get("question", ""),
                    "reason": error,
                }
            )
            continue
        for qid in targets:
            linked = dict(finding)
            linked["targetQid"] = qid
            findings_by_qid[qid].append(linked)

    review = []
    ledger = []
    settlement_blocked = bool(join_errors)
    for question_row in prepared_questions:
        qid = question_row["qid"]
        answer = answers_by_qid.get(qid)
        disposition = dispositions.get(qid)
        quote_quarantine = quote_quarantines.get(qid)
        attached = findings_by_qid.get(qid, [])
        row = dict(question_row)

        if answer is None:
            row.update(
                {
                    "basis": "needs-user",
                    "proposedAnswer": "",
                    "unanswered": True,
                    "unsafeForSettlement": True,
                    "settlementBlockReasons": ["unanswered"],
                }
            )
        else:
            corrected_bases = sorted(
                {f.get("correctedBasis") for f in attached if f.get("correctedBasis")}
            )
            basis = corrected_bases[0] if len(corrected_bases) == 1 else answer.get("basis")
            reasons = []
            if basis == "needs-user":
                reasons.append("needs-user")
            if any(not finding.get("correctedBasis") for finding in attached):
                reasons.append("finding-without-corrected-basis")
            if len(corrected_bases) > 1:
                reasons.append("conflicting-finding-bases")
            fabricated_quote = any(bool(f.get("fabricatedQuote")) for f in attached)
            if fabricated_quote:
                reasons.append("fabricated-quote")
            row.update(
                {
                    "proposedAnswer": answer.get("answer", ""),
                    "basis": basis,
                    "evidence": answer.get("evidence", ""),
                    "reasoning": answer.get("reasoning", ""),
                    "confidence": answer.get("confidence"),
                    "consequenceIfWrong": answer.get("consequenceIfWrong", ""),
                    "refuted": bool(attached),
                    "findings": attached,
                    "refutation": "\n\n".join(f.get("problem", "") for f in attached),
                    "fabricatedQuote": fabricated_quote,
                    "unsafeForSettlement": bool(reasons),
                    "settlementBlockReasons": reasons,
                }
            )

        if disposition:
            row.update(
                {
                    "disposition": disposition["disposition"],
                    "dispositionReasonCode": disposition["reasonCode"],
                    "dispositionReason": disposition["reason"],
                    "unsafeForSettlement": True,
                }
            )
            row.setdefault("settlementBlockReasons", []).append("quarantined")

        if quote_quarantine:
            row.update(
                {
                    "quoteDisposition": "quarantined",
                    "quoteReasonCode": quote_quarantine["reasonCode"],
                    "quoteProblemFragments": quote_quarantine["problemFragments"],
                    "unsafeForSettlement": True,
                }
            )
            row.setdefault("settlementBlockReasons", []).append(
                "uncertified-quoted-evidence"
            )

        if settlement_blocked:
            row["settlementBlocked"] = True
            row["unsafeForSettlement"] = True
            row.setdefault("settlementBlockReasons", []).append("unresolved-finding-join")

        if row.get("unsafeForSettlement"):
            review.append(row)
        else:
            ledger.append(row)

    review.sort(
        key=lambda row: (
            row.get("disposition") != "quarantined",
            not row.get("fabricatedQuote"),
            not row.get("refuted"),
            {"low": 0, "medium": 1, "high": 2}.get(row.get("confidence"), 1),
        )
    )
    ledger_output = {
        "schema": "engarde-ruling-ledger-v2",
        "settled": len(ledger),
        "blocked": settlement_blocked,
        "rows": ledger,
    }
    if join_errors:
        ledger_output["joinErrors"] = join_errors
    return review, ledger_output, join_errors


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 6:
        print(
            "usage: build_ruling_set.py <answers.json> <silences.json> "
            "<dispositions.json> <out-review.json> <out-ledger.json> "
            "[quote-quarantine.json]",
            file=sys.stderr,
        )
        return 2

    answers_path, silences_path, dispositions_path, out_review, out_ledger = argv[:5]
    try:
        answers_data = load_json(answers_path)
        silences = load_json(silences_path)
        dispositions_data = load_json(dispositions_path)
        quote_quarantine_data = load_json(argv[5])
        review, ledger, join_errors = build(
            answers_data, silences, dispositions_data, quote_quarantine_data
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

    write_json_atomic(out_review, review)
    write_json_atomic(out_ledger, ledger)

    print(f"review (unsafe/unsettled): {len(review)}   ledger (settled): {ledger['settled']}")
    print("  ledger basis:", dict(Counter(row["basis"] for row in ledger["rows"])))
    print(
        "  review reasons:",
        dict(Counter(reason for row in review for reason in row.get("settlementBlockReasons", []))),
    )
    if join_errors:
        print(f"ERROR: {len(join_errors)} findings could not be joined safely", file=sys.stderr)
        for error in join_errors:
            print(
                f"  finding[{error['findingIndex']}]: {error['reason']} :: "
                f"{error.get('question', '')[:110]}",
                file=sys.stderr,
            )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
