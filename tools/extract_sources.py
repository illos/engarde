#!/usr/bin/env python3
"""Extract ruling-surface source records for a set of artifact ids.

Reads the accepted campaign manifest, walks every definitive bundle it lists,
and emits ``[{id, versionSha256, sourcePath, bytes, text}]`` for the requested
artifact ids — the exact shape ``ruling_surface.py`` and ``verify_quotes.py``
consume. Text is the bundle's canonical Markdown span, byte for byte; nothing
is paraphrased or trimmed.

usage: extract_sources.py <manifest.json> <ids.json|-> <out-sources.json>
       (ids.json is a JSON array of artifact ids, or a newline list on stdin)
"""

import json
import os
import sys
import tempfile


def load_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def write_json_atomic(path, value):
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".sources-", suffix=".json", dir=directory)
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


def bundle_paths(manifest, manifest_path):
    """Resolve bundle paths relative to the manifest's repo root when needed."""
    if not isinstance(manifest, dict) or not isinstance(manifest.get("bundles"), list):
        raise ValueError("manifest needs a bundles array")
    root = os.path.abspath(os.path.join(os.path.dirname(manifest_path), "..", "..", "..", ".."))
    paths = []
    for entry in manifest["bundles"]:
        path = entry.get("bundlePath") if isinstance(entry, dict) else None
        if not isinstance(path, str) or not path:
            continue
        if not os.path.isabs(path):
            path = os.path.join(root, path)
        if not os.path.exists(path):
            # Manifests record the absolute path of the box that built them;
            # fall back to the repo-relative artifacts location.
            marker = ".artifacts/canon/bundles/"
            index = path.find(marker)
            if index >= 0:
                path = os.path.join(root, path[index:])
        paths.append(path)
    return paths


def index_artifacts(manifest, manifest_path, wanted=None):
    """Return {artifactId: source record} for every (or the wanted) artifact."""
    records = {}
    wanted_set = set(wanted) if wanted is not None else None
    for path in bundle_paths(manifest, manifest_path):
        if not os.path.exists(path):
            raise FileNotFoundError(f"bundle listed in manifest is missing: {path}")
        bundle = load_json(path)
        for record in bundle.get("records", []):
            if record.get("recordKind") != "artifact":
                continue
            artifact_id = record.get("id")
            if wanted_set is not None and artifact_id not in wanted_set:
                continue
            text = record.get("text")
            if not isinstance(artifact_id, str) or not isinstance(text, str):
                raise ValueError(f"malformed artifact record in {path}")
            if artifact_id in records:
                raise ValueError(f"duplicate artifact id across bundles: {artifact_id}")
            records[artifact_id] = {
                "id": artifact_id,
                "versionSha256": record["version"],
                "sourcePath": record["source"]["path"],
                "bytes": len(text.encode("utf-8")),
                "text": text,
            }
    return records


def extract(manifest_path, ids):
    manifest = load_json(manifest_path)
    unique = list(dict.fromkeys(ids))
    records = index_artifacts(manifest, manifest_path, wanted=unique)
    missing = [artifact_id for artifact_id in unique if artifact_id not in records]
    if missing:
        raise ValueError("artifact ids not found in the accepted manifest: " + ", ".join(missing))
    return [records[artifact_id] for artifact_id in unique]


def read_ids(spec):
    if spec == "-":
        return [line.strip() for line in sys.stdin if line.strip()]
    data = load_json(spec)
    if isinstance(data, dict) and isinstance(data.get("artifactIds"), list):
        data = data["artifactIds"]
    if not isinstance(data, list) or not all(isinstance(item, str) for item in data):
        raise ValueError("ids input must be a JSON array of artifact-id strings")
    return data


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[-2].strip(), file=sys.stderr)
        return 2
    manifest_path, ids_spec, out_path = argv
    try:
        sources = extract(manifest_path, read_ids(ids_spec))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    write_json_atomic(out_path, sources)
    print(f"wrote {out_path}  sources={len(sources)}  bytes={sum(s['bytes'] for s in sources)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
