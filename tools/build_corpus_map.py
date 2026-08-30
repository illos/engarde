#!/usr/bin/env python3
"""Rebuild the navigational corpus map from its Pool A and Pool B sources.

Pool A rulings carry the only individually reviewed ``criticalPath`` decisions.
Pool B is a family-derived navigation pass and must never inherit a critical-path
flag from a family rule.

usage: build_corpus_map.py <corpus-map-directory>
"""

import json
import os
import sys
import tempfile
from pathlib import Path


def load_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def write_json_atomic(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".corpus-map-", suffix=".json", dir=path.parent)
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


def unique_rows(rows, label):
    indexed = {}
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str):
            raise ValueError(f"{label} contains a row without a string id")
        if row["id"] in indexed:
            raise ValueError(f"{label} contains duplicate id {row['id']}")
        indexed[row["id"]] = row
    return indexed


def build(root):
    root = Path(root)
    pool_a_inputs = []
    pool_a_rulings = []
    for input_path in sorted((root / "batches").glob("batch-[0-9][0-9].json")):
        data = load_json(input_path)
        pool_a_inputs.extend(data.get("artifacts", []))
    for ruling_path in sorted((root / "rulings").glob("batch-[0-9][0-9].json")):
        data = load_json(ruling_path)
        pool_a_rulings.extend(data.get("rows", []))

    inputs_by_id = unique_rows(pool_a_inputs, "Pool A inputs")
    rulings_by_id = unique_rows(pool_a_rulings, "Pool A rulings")
    if set(inputs_by_id) != set(rulings_by_id):
        missing = sorted(set(inputs_by_id) - set(rulings_by_id))
        extra = sorted(set(rulings_by_id) - set(inputs_by_id))
        raise ValueError(f"Pool A input/ruling mismatch: missing={missing} extra={extra}")

    pool_a = []
    for input_row in pool_a_inputs:
        ruling = rulings_by_id[input_row["id"]]
        pool_a.append(
            {
                "id": input_row["id"],
                "chapter": input_row["chapter"],
                "bytes": input_row["bytes"],
                "pool": "A",
                "primary": ruling["primary"],
                "secondaries": ruling.get("secondaries", []),
                "spatial": bool(ruling.get("spatial")),
                "criticalPath": bool(ruling.get("criticalPath")),
                "confidence": ruling["confidence"],
                "justification": ruling["justification"],
            }
        )

    pool_b_source = load_json(root / "pool-b-map.json")
    pool_b_inputs = load_json(root / "pool-b-preassign.json")
    pool_b_inputs_by_id = unique_rows(pool_b_inputs, "Pool B inputs")
    pool_b_rows_by_id = unique_rows(pool_b_source.get("rows", []), "Pool B rows")
    if set(pool_b_inputs_by_id) != set(pool_b_rows_by_id):
        raise ValueError("Pool B input/map ids differ")
    overlap = sorted(set(inputs_by_id) & set(pool_b_inputs_by_id))
    if overlap:
        raise ValueError(f"Pool A/B ids overlap: {overlap}")

    # Family classification is deliberately low-confidence navigation. The 30
    # critical-path decisions came from Pool A's individual read, never from a
    # Pool B family default.
    for family_rule in pool_b_source.get("familyRules", []):
        family_rule["criticalPath"] = False
    for row in pool_b_source.get("rows", []):
        row["criticalPath"] = False

    pool_b = []
    for input_row in pool_b_inputs:
        ruling = pool_b_rows_by_id[input_row["id"]]
        pool_b.append(
            {
                "id": input_row["id"],
                "chapter": input_row["chapter"],
                "bytes": input_row["bytes"],
                "pool": "B",
                "primary": ruling["primary"],
                "secondaries": ruling.get("secondaries", []),
                "spatial": False,
                "criticalPath": False,
                "confidence": ruling.get("confidence", "low"),
                "justification": ruling.get("justification")
                or ruling.get("source")
                or "family-derived",
            }
        )

    existing = load_json(root / "corpus-map.json")
    result = {
        "schema": existing["schema"],
        "authority": existing["authority"],
        "canonPin": existing["canonPin"],
        "counts": {
            "artifacts": len(pool_a) + len(pool_b),
            "poolA": len(pool_a),
            "poolB": len(pool_b),
        },
        "agreementRate": existing["agreementRate"],
        "rows": pool_a + pool_b,
    }
    unique = {row["id"] for row in result["rows"]}
    if len(unique) != len(result["rows"]):
        raise ValueError("final corpus map contains duplicate ids")
    return pool_b_source, result


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 1:
        print("usage: build_corpus_map.py <corpus-map-directory>", file=sys.stderr)
        return 2
    root = Path(argv[0])
    try:
        pool_b_source, result = build(root)
        critical = sum(row["criticalPath"] for row in result["rows"])
        if len(result["rows"]) != 3785 or critical != 30:
            raise ValueError(
                f"map invariant failed: artifacts={len(result['rows'])} criticalPath={critical}; "
                "expected 3785/30"
            )
        write_json_atomic(root / "pool-b-map.json", pool_b_source)
        write_json_atomic(root / "corpus-map.json", result)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    print(
        f"wrote {root / 'corpus-map.json'}  "
        f"artifacts={len(result['rows'])}  criticalPath={critical}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
