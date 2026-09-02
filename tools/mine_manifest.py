#!/usr/bin/env python3
"""Build the silence-mining work list for one or more corpus-map chapters.

Selects the corpus-map rows whose primary bucket is ``engine`` (or any bucket
passed with ``--bucket``) in the requested chapters, drops artifacts that a
prior ruling deck already carried as evidence (so a chapter is never mined
twice), and chunks the remainder into batches bounded by byte size and count.
Each batch gets its own sources file (verbatim bundle text) so a mining agent
reads exactly one file.

The corpus map is navigational only (DEC-0013): it decides which text an agent
reads, never what any rule means. ``criticalPath`` is deliberately ignored —
the generated field is known to be corrupted relative to its document.

usage: mine_manifest.py <corpus-map.json> <manifest.json> <out-dir>
           --chapter combat [--chapter the-basics ...]
           [--bucket engine] [--exclude sources.json ...]
           [--max-bytes 60000] [--max-count 12]
"""

import argparse
import json
import os
import sys

from extract_sources import index_artifacts, load_json, write_json_atomic


def select_rows(corpus_map, chapters, buckets):
    rows = corpus_map.get("rows") if isinstance(corpus_map, dict) else corpus_map
    if not isinstance(rows, list):
        raise ValueError("corpus map needs a rows array")
    chapter_set = set(chapters)
    bucket_set = set(buckets)
    selected = [
        row
        for row in rows
        if isinstance(row, dict)
        and row.get("chapter") in chapter_set
        and row.get("primary") in bucket_set
    ]
    return sorted(selected, key=lambda row: (row["chapter"], row["id"]))


def excluded_ids(paths):
    excluded = set()
    for path in paths:
        data = load_json(path)
        if isinstance(data, dict):
            data = data.get("sources") or data.get("rows") or []
        for entry in data:
            if isinstance(entry, dict) and isinstance(entry.get("id"), str):
                excluded.add(entry["id"])
            elif isinstance(entry, str):
                excluded.add(entry)
    return excluded


def chunk(rows, max_bytes, max_count):
    batches = []
    current, current_bytes = [], 0
    for row in rows:
        size = int(row.get("bytes") or 0)
        if current and (current_bytes + size > max_bytes or len(current) >= max_count):
            batches.append(current)
            current, current_bytes = [], 0
        current.append(row)
        current_bytes += size
    if current:
        batches.append(current)
    return batches


def build(corpus_map, manifest, manifest_path, out_dir, chapters, buckets, exclude, max_bytes, max_count):
    rows = select_rows(corpus_map, chapters, buckets)
    kept = [row for row in rows if row["id"] not in exclude]
    dropped = [row["id"] for row in rows if row["id"] in exclude]
    records = index_artifacts(manifest, manifest_path, wanted=[row["id"] for row in kept])
    missing = [row["id"] for row in kept if row["id"] not in records]
    if missing:
        raise ValueError("corpus-map rows missing from the accepted manifest: " + ", ".join(missing))
    batches = []
    for index, batch_rows in enumerate(chunk(kept, max_bytes, max_count), start=1):
        name = f"batch-{index:02d}"
        sources = [records[row["id"]] for row in batch_rows]
        sources_path = os.path.join(out_dir, "mine", f"{name}.sources.json")
        write_json_atomic(sources_path, sources)
        batches.append(
            {
                "batch": name,
                "chapters": sorted({row["chapter"] for row in batch_rows}),
                "artifactIds": [row["id"] for row in batch_rows],
                "bytes": sum(source["bytes"] for source in sources),
                "sourcesPath": os.path.relpath(sources_path, out_dir),
                "mapHints": [
                    {
                        "id": row["id"],
                        "secondaries": row.get("secondaries", []),
                        "spatial": bool(row.get("spatial")),
                        "justification": row.get("justification", ""),
                    }
                    for row in batch_rows
                ],
            }
        )
    work_list = {
        "schema": "engarde-silence-mining-worklist-v1",
        "canonPin": corpus_map.get("canonPin") if isinstance(corpus_map, dict) else None,
        "chapters": sorted(set(chapters)),
        "buckets": sorted(set(buckets)),
        "selected": len(rows),
        "excludedAlreadyRuled": dropped,
        "batches": batches,
        "note": "Corpus map is navigational only (DEC-0013); criticalPath ignored on purpose.",
    }
    write_json_atomic(os.path.join(out_dir, "mine", "worklist.json"), work_list)
    return work_list


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("corpus_map")
    parser.add_argument("manifest")
    parser.add_argument("out_dir")
    parser.add_argument("--chapter", action="append", required=True)
    parser.add_argument("--bucket", action="append", default=None)
    parser.add_argument("--exclude", action="append", default=[])
    parser.add_argument("--max-bytes", type=int, default=60000)
    parser.add_argument("--max-count", type=int, default=12)
    args = parser.parse_args(argv)
    try:
        work_list = build(
            load_json(args.corpus_map),
            load_json(args.manifest),
            args.manifest,
            args.out_dir,
            args.chapter,
            args.bucket or ["engine"],
            excluded_ids(args.exclude),
            args.max_bytes,
            args.max_count,
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    print(
        f"wrote {args.out_dir}/mine/worklist.json  selected={work_list['selected']}"
        f"  excluded={len(work_list['excludedAlreadyRuled'])}  batches={len(work_list['batches'])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
