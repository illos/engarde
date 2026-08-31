#!/usr/bin/env python3
"""scc-join: map Forge Steel choice-point rows to pin identity (ruling R-L).

Step 1 of the character-builder build order (DEC-0014): every Forge Steel row
from the fs-extract artifact is either joined to a pinned SteelCompendium
record — overlay key ``(scc, discriminator)`` — or categorized in a structured
discrepancy list. Nothing is silently dropped: every FS row is accounted for
exactly once.

Usage (from the repo root, after running the extractor):
    pnpm --filter @engarde/canon exec tsx scripts/character-builder-extract.ts
    python3 tools/character_builder_join.py

Optional arguments:
    --artifacts <dir>   artifact directory
                        (default .artifacts/canon/character-builder)
    --pin <dir>         pin books root
                        (default .reference/steelcompendium/en/books)

Outputs (all deterministic; re-runs are byte-identical):
    scc-join.json        joined rows
    discrepancies.json   categorized non-joining rows + pin-only records
    ra-worklist.json     pre-seeded grant rows for the R-A per-row canon pass
    summary.json         counts, join rate, predicted-delta checks
    key-manifest.json    the stable-keys declaration (builder Q7): the sorted
                         universe of string-encoded overlay keys this join
                         minted, a content hash over it, and the pin checkout
                         it was minted against

Key stability (builder Q7, ruled 2026-08-31): the `(scc, discriminator)`
overlay keys minted here are PERSISTENT key components — hero documents key
`build.decisions` entries by them. The join therefore declares them stable:
a re-run against the same pin yields a byte-identical key set (regression-
tested), and a run against a DIFFERENT pin is compared mechanically via

    python3 tools/character_builder_join.py --diff-manifests OLD NEW

which classifies every key as unchanged / added / removed. Removed keys are a
MIGRATION EVENT for `build.decisions` (§2.2 divergence pass in
docs/character-builder/02-normative-schema.md): stale keys are re-resolved or
surfaced as invalidated, never silently dropped.

Discrepancy categories:
    excluded-book        Beastheart content — the book is `exclude` in the pin
                         config; joins are deferred until admission.
    no-pin-record        the pin has no record kind for this row (languages,
                         imbuements, FS preset cultures, domain-level records,
                         inciting-incident identity) — seeded from §R-L.
    name-drift-unmapped  a same-kind pin pool exists but no record name-matches
                         and the drift map has no entry; candidates attached.
    count-delta          predicted count mismatches (§R-L: core titles FS 62 vs
                         pin 60; perks) — FS-side rows here, pin-side records
                         in the separate `pinOnly` section.
    unjoined-other       ambiguous or unclassifiable; note + candidates
                         attached, resolution deferred to a human ruling.

Licensing / provenance (DEC-0014): rows carry FS ids, names and choice-point
shape only; pin content is referenced by scc/path, never copied. FS ids are
labels, never keys.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import unicodedata
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PIN_SOURCE_LOCK = REPO_ROOT / "packages" / "canon" / "config" / "steelcompendium-source.json"

PIN_BOOKS = ("heroes", "monsters", "beastheart", "summoner")
EXCLUDED_PIN_BOOKS = frozenset({"beastheart"})
INCLUDED_PIN_BOOKS = tuple(b for b in PIN_BOOKS if b not in EXCLUDED_PIN_BOOKS)

# Name-drift map seeded from §R-L ("Join pre-load"). Keys/values are
# normalized names (see norm_name). Extend only with ruling-grade evidence.
NAME_DRIFT = {
    # FS "Tactic Call" = pin "Quick Command" (feature/summoner/level-1/quick-command.md)
    "tactic call": "quick command",
}

# Drift observed BY this join from mechanical leftover-pair evidence (the only
# unmatched FS row and the only unmatched pin record of a kind, with a
# spelling/plural/possessive-level difference). Name-level identity only —
# subject to review in the R-L ruling pass; not §R-L-seeded.
OBSERVED_DRIFT = {
    # FS perks "Travelling …" = pin "Traveling …" (UK/US spelling)
    "travelling artisan": "traveling artisan",
    "travelling sage": "traveling sage",
    # FS title "Dwarf Legionnaire" = pin title/dwarven-legionnaire.md
    "dwarf legionnaire": "dwarven legionnaire",
    # FS ability "A Meteoric Introduction" = pin feature/ability/elementalist/level-1/meteoric-introduction.md
    "a meteoric introduction": "meteoric introduction",
    # FS ability "Force Orb" = pin feature/ability/talent/level-3/force-orbs.md
    "force orb": "force orbs",
    # FS summoner L2 "Dominion" = pin feature/summoner/level-2/summoners-dominion.md
    "dominion": "summoner s dominion",
    # FS fury L3 (Reaver) "See Through Your Tricks" = pin feature/fury/level-3/see-through-their-tricks.md
    "see through your tricks": "see through their tricks",
    # FS tactician L4 "Focus on Their Weakness" = pin feature/tactician/level-4/focus-on-their-weaknesses.md
    "focus on their weakness": "focus on their weaknesses",
    # FS talent L1 resource "Clarity" = pin feature/talent/level-1/clarity-and-strain.md
    "clarity": "clarity and strain",
    # FS conduit/censor L1 "Domain" (the domain picker) = pin "Deity and Domains"
    # (feature/conduit/level-1/deity-and-domains.md, feature/censor/level-1/deity-and-domains.md)
    "domain": "deity and domains",
    # FS censor L2 (Paragon) "Stalwart Example" = pin feature/censor/level-2/stalwart-icon.md
    # (same class, level and subclass: paragon — the only unmatched pair there)
    "stalwart example": "stalwart icon",
}

# FS models per-class starting stamina / recoveries as level-1 Bonus features;
# the pin carries them as structured fields on the class record. Purely
# mechanical mapping — the join verifies the field exists on the class record
# before applying it.
CLASS_RECORD_FIELD_MAP = {
    "stamina": ("starting_stamina", "starting-stamina"),
    "recoveries": ("recoveries", "recoveries"),
}

# FS element collections whose pin category hosts one record per element, with
# the element's several choice points living INSIDE that record (§R-L:
# cardinality is not 1:1) — features join as (element scc, discriminator).
PARENT_HOSTED_COLLECTIONS = {
    "career": "career",
    "complication": "complication",
    "kit": "kit",
    "title": "title",
    "item": "treasure",
}

# Element collections joined record-per-element by name.
RECORD_COLLECTIONS = {
    "ancestry": "ancestry",
    "career": "career",
    "class": "class",
    "complication": "complication",
    "culture-axis": "culture",
    "kit": "kit",
    "perk": "perk",
    "skill": "skill",
    "title": "title",
    "item": "treasure",
}

# Collections with no pin record kind at all (§R-L pre-load).
NO_PIN_RECORD_NOTES = {
    "language": "R-J: the pin has no language category (structured-record gap in SteelCompendium, not in Draw Steel).",
    "imbuement": "R-J-class gap: the pin has only rule/treasure/enhancement.md prose, no structured imbuement records.",
    "culture": "FS preset cultures have no pin records; the pin has exactly the 13 axis records. Identity correspondence: Archetypical Cultures Table (16 rows, chapter/background.md).",
    "domain": "No domain-level pin records; domain membership is `subclass:` frontmatter on conduit feature records.",
}

# Predicted count-delta collections (§R-L): unmatched FS rows here are the
# known count mismatches rather than suspected name drift.
COUNT_DELTA_COLLECTIONS = frozenset({"title", "perk"})


def norm_name(value):
    """Normalize a name for matching: casefold, strip accents + punctuation."""
    if value is None:
        return ""
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.casefold().replace("’", "'")
    text = re.sub(r"[^0-9a-z]+", " ", text)
    return text.strip()


def slugify(value):
    """Deterministic slug for fs paths and discriminators."""
    slug = re.sub(r"[^0-9a-z]+", "-", norm_name(value)).strip("-")
    return slug or "unnamed"


def apply_drift(normed):
    return NAME_DRIFT.get(normed, OBSERVED_DRIFT.get(normed, normed))


def name_variants(name):
    """Deterministic retry variants for a name, in preference order:
    the name itself, its first comma segment (FS `Multiple` features
    concatenate child names: "Grave Speech, Lore Skill"), and the
    parenthesized-qualifier reorder ("Elf (high)" -> "high elf")."""
    variants = [str(name or "")]
    if ":" in variants[0]:
        after = variants[0].split(":", 1)[1].strip()
        before = variants[0].split(":", 1)[0].strip()
        if after:
            variants.append(after)
        if before:
            variants.append(before)
    head = variants[0].split(",")[0].strip()
    if head and head != variants[0]:
        variants.append(head)
    match = re.fullmatch(r"(.+?)\s*\((.+?)\)", variants[0].strip())
    if match:
        variants.append(f"{match.group(2)} {match.group(1)}")
    return variants


def load_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def write_json_atomic(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".scc-join-", suffix=".json", dir=path.parent)
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


# ---------------------------------------------------------------------------
# Pin index
# ---------------------------------------------------------------------------


def load_pin_records(pin_root):
    """Walk the pin's paired-JSON records for all books (excluded ones too —
    they are indexed for the excluded-book cross-checks, never joined)."""
    records = []
    pin_root = Path(pin_root)
    for book in PIN_BOOKS:
        json_root = pin_root / book / "json"
        if not json_root.is_dir():
            continue
        for path in sorted(json_root.rglob("*.json")):
            data = load_json(path)
            metadata = data.get("metadata") or {}
            scc = data.get("scc") or metadata.get("scc")
            if isinstance(scc, list):
                scc = scc[0] if scc else None
            relative = path.relative_to(json_root).as_posix()
            records.append(
                {
                    "book": book,
                    "category": relative.split("/", 1)[0],
                    "relpath": relative,
                    "mdPath": f"en/books/{book}/md/{relative[: -len('.json')]}.md",
                    "scc": scc,
                    "name": data.get("name") or metadata.get("item_name"),
                    "slug": path.stem,
                    "class": metadata.get("class"),
                    "subclass": metadata.get("subclass"),
                    "level": metadata.get("level"),
                    "signatureTraitName": data.get("signature_trait_name"),
                    "fields": sorted(k for k in data.keys() if k not in ("content", "metadata")),
                }
            )
    return records


class PinIndex:
    """Lookup structures over the pin records (included books only, except
    where noted)."""

    def __init__(self, records):
        self.records = records
        self.by_category = {}
        self.class_features = {}
        self.class_abilities = {}
        self.traits = {}
        self.by_scc = {}
        for record in records:
            if record["scc"]:
                self.by_scc[record["scc"]] = record
            if record["book"] in EXCLUDED_PIN_BOOKS:
                continue
            keys = {norm_name(record["name"]), norm_name(record["slug"].replace("-", " "))}
            keys.discard("")
            category = record["category"]
            for key in keys:
                self.by_category.setdefault((category, key), []).append(record)
            if category == "feature":
                parts = record["relpath"].split("/")
                if parts[1] == "ability" and len(parts) >= 3:
                    for key in keys:
                        self.class_abilities.setdefault((parts[2], key), []).append(record)
                elif parts[1] == "trait" and len(parts) >= 3:
                    for key in keys:
                        self.traits.setdefault((parts[2], key), []).append(record)
                elif record["class"]:
                    for key in keys:
                        self.class_features.setdefault((record["class"], key), []).append(record)

    def _lookup(self, index, key_prefix, name):
        for variant in name_variants(name):
            records = index.get((key_prefix, apply_drift(norm_name(variant))), [])
            if records:
                return records
        return []

    def category_records(self, category, name):
        return self._lookup(self.by_category, category, name)

    def class_feature_records(self, class_slug, name):
        return self._lookup(self.class_features, class_slug, name)

    def class_ability_records(self, class_slug, name):
        return self._lookup(self.class_abilities, class_slug, name)

    def trait_records(self, ancestry_slug, name):
        return self._lookup(self.traits, ancestry_slug, name)


# ---------------------------------------------------------------------------
# Join
# ---------------------------------------------------------------------------


class Joiner:
    def __init__(self, extract, pin_index):
        self.extract = extract
        self.pin = pin_index
        self.joined = []
        self.discrepancies = []
        self.worklist = []
        self.used_sccs = set()
        self.discriminators = {}  # scc -> {slug: count}

    # -- helpers ----------------------------------------------------------

    def discriminator(self, scc, base):
        """Unique, deterministic discriminator under one scc host record."""
        used = self.discriminators.setdefault(scc, {})
        count = used.get(base, 0) + 1
        used[base] = count
        return base if count == 1 else f"{base}-{count}"

    HELPER_KEYS = ("heroicResource", "subclassKind")

    def public_context(self, context):
        return {k: v for k, v in context.items() if k not in self.HELPER_KEYS}

    def join_row(self, fs_path, context, record, discriminator=None, match_kind="record", extra=None):
        self.used_sccs.add(record["scc"])
        row = self.public_context(context)
        row["fsPath"] = fs_path
        row["overlayKey"] = {"scc": record["scc"], "discriminator": discriminator}
        row["pinPath"] = record["mdPath"]
        row["matchKind"] = match_kind
        if extra:
            row.update(extra)
        self.joined.append(row)
        return row

    def discrepancy(self, fs_path, context, category, note, candidates=None):
        row = self.public_context(context)
        row["fsPath"] = fs_path
        row["category"] = category
        row["note"] = note
        if candidates:
            row["candidates"] = sorted(c["mdPath"] for c in candidates)
        self.discrepancies.append(row)
        return row

    def collect_preseeded(self, fs_path, context, feature, join_result):
        """R-A worklist: definition data shipping a pre-filled selection."""
        stack = [(fs_path, feature)]
        while stack:
            path, node = stack.pop()
            if not isinstance(node, dict):
                continue
            selected = node.get("selected") or node.get("selectedIDs")
            if selected:
                entry = self.public_context(context)
                entry["fsPath"] = path
                entry["featureName"] = node.get("name")
                entry["featureType"] = node.get("featureType")
                entry["selected"] = selected
                pool = {
                    k: node[k] for k in ("options", "listOptions", "lists", "types", "allowedTypes") if node.get(k)
                }
                entry["fsPool"] = pool or None
                # "Open pool" per R-A: the pre-fill is deletable and the pool
                # effectively spans the whole game (no explicit options, and
                # for skills either no list filter or all five skill groups).
                all_skill_lists = {"crafting", "exploration", "interpersonal", "intrigue", "lore"}
                list_options = {norm_name(x) for x in node.get("listOptions") or []}
                entry["openPool"] = not node.get("options") and (
                    not list_options or all_skill_lists <= list_options
                )
                if join_result is not None and "overlayKey" in join_result:
                    entry["overlayKey"] = join_result["overlayKey"]
                    entry["pinPath"] = join_result["pinPath"]
                else:
                    entry["overlayKey"] = None
                    entry["pinPath"] = None
                self.worklist.append(entry)
            for key in ("feature", "featureChecked", "featureUnchecked", "defaultOption", "language"):
                child = node.get(key)
                if isinstance(child, dict):
                    stack.append((f"{path}/{key}", child))
            for key in ("features", "minionFeatures"):
                for index, child in enumerate(node.get(key) or []):
                    stack.append((f"{path}/{key}[{index}]", child))
            for index, option in enumerate(node.get("options") or []):
                if isinstance(option, dict) and isinstance(option.get("feature"), dict):
                    stack.append((f"{path}/options[{index}]", option["feature"]))

    # -- element dispatch --------------------------------------------------

    def run(self):
        for element in self.extract["rows"]:
            self.handle_element(element)
        self.joined.sort(key=lambda row: row["fsPath"])
        self.discrepancies.sort(key=lambda row: (row["category"], row["fsPath"]))
        self.worklist.sort(key=lambda row: row["fsPath"])

    def element_context(self, element):
        return {
            "sourcebook": element["sourcebook"],
            "collection": element["collection"],
            "elementName": element["name"],
            "fsId": element.get("fsId"),
        }

    def element_path(self, element):
        return f"{element['sourcebook']}/{element['collection']}/{slugify(element['name'])}"

    def handle_element(self, element):
        collection = element["collection"]
        context = self.element_context(element)
        fs_path = self.element_path(element)
        excluded = element["sourcebook"] == "beastheart"

        if excluded:
            for path, feature_context, _feature in self.iter_feature_rows(element, fs_path):
                self.discrepancy(
                    path,
                    feature_context,
                    "excluded-book",
                    "Beastheart's book is `exclude` in the pin config; every beastheart row is deferred until admission (§R-L).",
                )
            self.discrepancy(
                fs_path,
                context,
                "excluded-book",
                "Beastheart's book is `exclude` in the pin config; every beastheart row is deferred until admission (§R-L).",
            )
            return

        element_join = None
        if collection in NO_PIN_RECORD_NOTES:
            self.discrepancy(fs_path, context, "no-pin-record", NO_PIN_RECORD_NOTES[collection])
        elif collection in RECORD_COLLECTIONS:
            category = RECORD_COLLECTIONS[collection]
            records = self.pin.category_records(category, element["name"])
            if len(records) == 1:
                element_join = self.join_row(fs_path, context, records[0])
            elif len(records) > 1:
                self.discrepancy(
                    fs_path,
                    context,
                    "unjoined-other",
                    f"Ambiguous: {len(records)} pin `{category}` records share this name.",
                    candidates=records,
                )
            else:
                category_of_row = "count-delta" if collection in COUNT_DELTA_COLLECTIONS else "name-drift-unmapped"
                note = (
                    f"No pin `{category}` record name-matches"
                    + (
                        " — predicted count mismatch (§R-L)."
                        if category_of_row == "count-delta"
                        else "; possible name drift, needs a ruling before mapping."
                    )
                )
                self.discrepancy(fs_path, context, category_of_row, note)
        # `language`/`imbuement`/preset `culture`/`domain` handled above;
        # anything else would be a new collection — fail loudly.
        elif collection not in ("culture", "domain", "language", "imbuement"):
            raise ValueError(f"Unhandled collection: {collection}")

        self.handle_features(element, fs_path, element_join)

    # -- feature enumeration ----------------------------------------------

    def iter_feature_rows(self, element, fs_path):
        """Yield (path, context, feature) for every top-level feature row of an
        element — the exact row universe the accounting invariant covers."""
        collection = element["collection"]
        base = self.element_context(element)

        def ctx(feature, **extra):
            row = dict(base)
            row["featureName"] = feature.get("name")
            row["featureType"] = feature.get("featureType")
            row.update(extra)
            return row

        for index, feature in enumerate(element.get("features") or []):
            yield f"{fs_path}/features[{index}]:{slugify(feature.get('name'))}", ctx(feature), feature

        for entry in element.get("featuresByLevel") or []:
            level = entry.get("level")
            for index, feature in enumerate(entry.get("features") or []):
                yield (
                    f"{fs_path}/level-{level}/features[{index}]:{slugify(feature.get('name'))}",
                    ctx(feature, level=level),
                    feature,
                )

        for subclass in element.get("subclasses") or []:
            sub_slug = slugify(subclass.get("name"))
            for entry in subclass.get("featuresByLevel") or []:
                level = entry.get("level")
                for index, feature in enumerate(entry.get("features") or []):
                    yield (
                        f"{fs_path}/subclass/{sub_slug}/level-{level}/features[{index}]:{slugify(feature.get('name'))}",
                        ctx(feature, level=level, subclass=subclass.get("name")),
                        feature,
                    )
            for index, ability in enumerate(subclass.get("abilities") or []):
                fake = {"name": ability.get("name"), "featureType": "Ability (pool)"}
                yield (
                    f"{fs_path}/subclass/{sub_slug}/abilities[{index}]:{slugify(ability.get('name'))}",
                    ctx(fake, subclass=subclass.get("name")),
                    fake,
                )

        if collection == "class":
            for index, ability in enumerate(element.get("abilities") or []):
                fake = {"name": ability.get("name"), "featureType": "Ability (pool)"}
                yield f"{fs_path}/abilities[{index}]:{slugify(ability.get('name'))}", ctx(fake), fake

        for index, feature in enumerate(element.get("defaultFeatures") or []):
            yield f"{fs_path}/default-features[{index}]:{slugify(feature.get('name'))}", ctx(feature), feature

        if collection == "career":
            for index, incident in enumerate(element.get("incitingIncidents") or []):
                fake = {"name": incident.get("name"), "featureType": "Inciting Incident"}
                yield f"{fs_path}/inciting-incidents[{index}]:{slugify(incident.get('name'))}", ctx(fake), fake

    # -- feature joining ---------------------------------------------------

    def class_match_context(self, element):
        """Class-level facts the mechanical retry rules key on: the class's
        heroic-resource name (for '<N>pt Ability' renames) and its subclass
        category name (for subclass-specific choice renames)."""
        if element["collection"] != "class":
            return {}
        resource = None
        for entry in element.get("featuresByLevel") or []:
            if entry.get("level") != 1:
                continue
            for feature in entry.get("features") or []:
                if feature.get("featureType") == "Heroic Resource":
                    resource = norm_name(feature.get("name"))
                    break
        return {"heroicResource": resource, "subclassKind": element.get("subclassName")}

    def handle_features(self, element, fs_path, element_join):
        collection = element["collection"]
        class_context = self.class_match_context(element)
        for path, context, feature in self.iter_feature_rows(element, fs_path):
            context.update(class_context)
            if context.get("featureType") == "Inciting Incident":
                note = "Inciting-incident identity: table rows inside the career record, no per-row pin records (§R-L)."
                if element_join is not None:
                    note += f" Host record: {element_join['overlayKey']['scc']}."
                self.discrepancy(path, context, "no-pin-record", note)
                continue

            join_result = None
            if collection == "class":
                join_result = self.join_class_feature(element, path, context, feature)
            elif collection == "domain":
                join_result = self.join_domain_feature(element, path, context, feature)
            elif collection == "ancestry":
                join_result = self.join_ancestry_feature(element, element_join, path, context, feature)
            elif collection in PARENT_HOSTED_COLLECTIONS:
                if element_join is not None:
                    host = self.pin.by_scc[element_join["overlayKey"]["scc"]]
                    disc = self.discriminator(host["scc"], slugify(feature.get("name")))
                    join_result = self.join_row(
                        path, context, host, discriminator=disc, match_kind="parent-record-discriminator"
                    )
                else:
                    self.discrepancy(
                        path,
                        context,
                        "unjoined-other",
                        "Host element did not join; feature parked with it.",
                    )
            else:
                # Collections whose features have no per-feature pin identity
                # beyond the element disposition already recorded.
                self.discrepancy(
                    path,
                    context,
                    "no-pin-record",
                    NO_PIN_RECORD_NOTES.get(
                        collection, "Element kind has no pin record; feature parked with its element."
                    ),
                )

            self.collect_preseeded(path, context, feature, join_result)

        # Element-level pre-seeded selections outside `features` (e.g. the
        # culture presets' language choice).
        for key in ("language", "environment", "organization", "upbringing", "feature"):
            node = element.get(key)
            if isinstance(node, dict):
                self.collect_preseeded(f"{fs_path}/{key}", self.element_context(element), node, element_join)

    def class_slug(self, element):
        return slugify(element["name"])

    def resolve_unique(self, path, context, records, match_kind):
        """Join if narrowing isolates exactly one record; else discrepancy."""
        narrowed = self.narrow_by_level_subclass(records, context)
        if len(narrowed) == 1:
            return self.join_row(path, context, narrowed[0], match_kind=match_kind)
        level = context.get("level")
        if level is not None and not any(r["level"] == level for r in records):
            note = (
                "Name matches pin records at other levels only (level mismatch) — "
                "the pin may host this grant inside another record; needs a ruling."
            )
        else:
            note = "Ambiguous: several pin records match and narrowing by level/subclass did not isolate one."
        self.discrepancy(path, context, "unjoined-other", note, candidates=records)
        return None

    def join_class_feature(self, element, path, context, feature):
        class_slug = self.class_slug(element)
        name = feature.get("name") or ""
        feature_type = feature.get("featureType")

        if context.get("featureType") == "Ability (pool)":
            records = self.pin.class_ability_records(class_slug, name)
            if records:
                return self.resolve_unique(path, context, records, "class-ability-record")
            self.discrepancy(
                path,
                context,
                "name-drift-unmapped",
                f"No feature/ability/{class_slug} record name-matches; possible name drift, needs a ruling.",
            )
            return None

        # Mechanical class-record structured-field maps: FS models starting
        # stamina / recoveries / the level-1 skill block as features; the pin
        # carries them as structured fields on the class record.
        class_records = self.pin.category_records("class", element["name"])
        class_record = class_records[0] if len(class_records) == 1 else None
        if context.get("level") == 1 and class_record is not None and not context.get("subclass"):
            mapped = CLASS_RECORD_FIELD_MAP.get(norm_name(name))
            if mapped and mapped[0] in class_record["fields"]:
                disc = self.discriminator(class_record["scc"], mapped[1])
                return self.join_row(path, context, class_record, discriminator=disc, match_kind="class-record-field")
            if feature_type == "Skill Choice" and "skills" in class_record["fields"]:
                disc = self.discriminator(class_record["scc"], "skills")
                return self.join_row(path, context, class_record, discriminator=disc, match_kind="class-record-field")

        # 1. Exact name (with drift map + deterministic variants).
        records = self.pin.class_feature_records(class_slug, name)
        if records:
            return self.resolve_unique(path, context, records, "class-feature-record")

        # 2. Granted abilities live under feature/ability/<class>.
        if feature_type == "Ability":
            records = self.pin.class_ability_records(class_slug, name)
            if records:
                return self.resolve_unique(path, context, records, "class-ability-record")

        # 3. Per-level Perk / Characteristic Increase records (FS names carry
        #    the option lists: "Interpersonal / Lore Perk", "Might", …).
        level = context.get("level")
        if feature_type == "Perk" and level is not None:
            records = [r for r in self.pin.class_feature_records(class_slug, "Perk") if r["level"] == level]
            if len(records) == 1:
                disc = self.discriminator(records[0]["scc"], slugify(name))
                return self.join_row(path, context, records[0], discriminator=disc, match_kind="per-level-record")
        if (feature_type == "Characteristic Bonus" or norm_name(name).startswith("characteristic increase")) and level is not None:
            records = [
                r for r in self.pin.class_feature_records(class_slug, "Characteristic Increase") if r["level"] == level
            ]
            if len(records) == 1:
                disc = self.discriminator(records[0]["scc"], slugify(name))
                return self.join_row(path, context, records[0], discriminator=disc, match_kind="per-level-record")

        # 4. Class-ability gain rows: FS "<N>pt Ability" = pin
        #    "<N> <heroic resource> Ability"; FS "Signature Ability" (L1) and
        #    its cost siblings collapse into the pin's "<Class> Abilities".
        if feature_type == "Class Ability":
            resource = context.get("heroicResource")
            pt = re.fullmatch(r"(\d+)pt ability", norm_name(name))
            if pt and resource:
                for template in (f"{pt.group(1)} {resource} ability", f"new {pt.group(1)} {resource} ability"):
                    records = self.pin.class_feature_records(class_slug, template)
                    if records:
                        return self.resolve_unique(path, context, records, "class-feature-record")
            if level == 1:
                records = self.pin.class_feature_records(class_slug, f"{element['name']} abilities")
                if len(records) == 1:
                    disc = self.discriminator(records[0]["scc"], slugify(name))
                    return self.join_row(
                        path, context, records[0], discriminator=disc, match_kind="class-abilities-record"
                    )

        # 5. Subclass-specific choice names: FS writes the chosen subclass into
        #    the name ("2nd-Level Exorcist Ability"); the pin names the record
        #    by the class's subclass category ("2nd-Level Order Ability").
        subclass = context.get("subclass")
        subclass_kind = context.get("subclassKind")
        if subclass:
            sub_norm = norm_name(re.sub(r"^(college|circle|order|doctrine|tradition) of (the )?", "", subclass, flags=re.I))
            # 5a. The pin prefixes some subclass features with the subclass
            #     ("Acolyte of Fire" -> "Fire: Acolyte of Fire").
            records = self.pin.class_feature_records(class_slug, f"{sub_norm} {name}")
            if records:
                return self.resolve_unique(path, context, records, "subclass-prefix-rename")
            # 5b. FS writes the chosen subclass into choice names
            #     ("2nd-Level Exorcist Ability"); the pin names the record by
            #     the class's subclass category ("2nd-Level Order Ability").
            if subclass_kind:
                renamed = norm_name(name).replace(sub_norm, norm_name(subclass_kind))
                if renamed != norm_name(name):
                    records = self.pin.class_feature_records(class_slug, renamed)
                    if records:
                        return self.resolve_unique(path, context, records, "subclass-kind-rename")

        self.discrepancy(
            path,
            context,
            "name-drift-unmapped",
            f"No pin feature record for class `{class_slug}` name-matches; possible name drift, needs a ruling.",
        )
        return None

    def narrow_by_level_subclass(self, records, context):
        narrowed = records
        level = context.get("level")
        if level is not None and len(narrowed) > 1:
            by_level = [r for r in narrowed if r["level"] == level]
            if by_level:
                narrowed = by_level
        subclass = context.get("subclass")
        if subclass and len(narrowed) > 1:
            key = norm_name(subclass)
            by_subclass = [r for r in narrowed if norm_name(r["subclass"]) == key]
            if by_subclass:
                narrowed = by_subclass
        return narrowed

    def join_domain_feature(self, element, path, context, feature):
        """Domain features have no domain-level records (§R-L): identity is
        scattered across conduit (and censor) feature/ability records, with
        the domain as `subclass:` frontmatter where present; per-domain piety
        and prayer effects live inside conduit level-1
        `domain-piety-and-effects`."""
        domain_key = norm_name(element["name"])
        name = feature.get("name") or ""

        # Per-domain piety / prayer-effect rows -> the one hosting record.
        normed = norm_name(name)
        if normed in (f"{domain_key} prayer effect", f"{domain_key} piety", f"{domain_key} piety and effect"):
            records = self.pin.class_feature_records("conduit", "Domain Piety and Effects")
            if len(records) == 1:
                disc = self.discriminator(records[0]["scc"], slugify(name))
                return self.join_row(
                    path, context, records[0], discriminator=disc, match_kind="parent-record-discriminator"
                )

        records = []
        for finder in (
            lambda: self.pin.class_feature_records("conduit", name),
            lambda: self.pin.class_ability_records("conduit", name),
            lambda: self.pin.class_feature_records("censor", name),
            lambda: self.pin.class_ability_records("censor", name),
        ):
            records = finder()
            if records:
                break
        if not records:
            self.discrepancy(
                path,
                context,
                "name-drift-unmapped",
                "No conduit/censor feature or ability record name-matches this domain feature; needs a ruling.",
            )
            return None
        by_domain = [r for r in records if norm_name(r["subclass"]) == domain_key]
        narrowed = by_domain or records
        level = context.get("level")
        if len(narrowed) > 1 and level is not None:
            by_level = [r for r in narrowed if r["level"] == level]
            if by_level:
                narrowed = by_level
        if len(narrowed) == 1:
            return self.join_row(path, context, narrowed[0], match_kind="domain-as-class-record")
        self.discrepancy(path, context, "unjoined-other", "Ambiguous domain feature match.", candidates=records)
        return None

    def join_ancestry_feature(self, element, element_join, path, context, feature):
        ancestry_slug = slugify(element["name"])
        records = self.pin.trait_records(ancestry_slug, feature.get("name"))
        if len(records) == 1:
            join_result = self.join_row(path, context, records[0], match_kind="trait-record")
            self.annotate_trait_options(join_result, ancestry_slug, feature)
            return join_result
        if element_join is not None:
            host = self.pin.by_scc[element_join["overlayKey"]["scc"]]
            if norm_name(host.get("signatureTraitName")) == norm_name(feature.get("name")):
                disc = self.discriminator(host["scc"], "signature-trait")
                return self.join_row(path, context, host, discriminator=disc, match_kind="signature-trait-field")
            if feature.get("count") == "ancestry" or feature.get("featureType") == "Choice":
                # The purchased-traits point-buy: the pin hosts the purchase
                # table on the ancestry record; individual options join to
                # trait records (annotated in place).
                disc = self.discriminator(host["scc"], slugify(feature.get("name")))
                join_result = self.join_row(
                    path, context, host, discriminator=disc, match_kind="parent-record-discriminator"
                )
                self.annotate_trait_options(join_result, ancestry_slug, feature)
                return join_result
        self.discrepancy(
            path,
            context,
            "name-drift-unmapped",
            f"No feature/trait/{ancestry_slug} record name-matches and the feature is not the "
            "signature trait or the point-buy choice; needs a ruling.",
        )
        return None

    def annotate_trait_options(self, join_result, ancestry_slug, feature):
        options = feature.get("options") or []
        option_joins = []
        for option in options:
            inner = option.get("feature") if isinstance(option, dict) else None
            name = inner.get("name") if isinstance(inner, dict) else (option if isinstance(option, str) else None)
            if name is None:
                continue
            records = self.pin.trait_records(ancestry_slug, name)
            option_joins.append({"name": name, "scc": records[0]["scc"] if len(records) == 1 else None})
        if option_joins:
            join_result["optionJoins"] = option_joins


# ---------------------------------------------------------------------------
# Stable-keys manifest (builder Q7)
# ---------------------------------------------------------------------------

# String encoding of an overlay key (02-normative-schema.md §2.3(c)): `<scc>`
# when the record carries exactly one choice point, `<scc>#<disc>` when it
# carries several. Neither `#` nor `::` occurs in the scc grammar
# (`mcdm.<book>.v1/<category-path>/<slug>`), so parsing is unambiguous.
# Nested path keys (segments joined by `::`) are composed at runtime from
# these segments — the join mints segments only.
KEY_GRAMMAR = re.compile(r"[a-z0-9-]+(\.[a-z0-9-]+)*\.v\d+/[a-z0-9./-]+(#[a-z0-9-]+)?")


def encode_overlay_key(scc, discriminator):
    """String-encode one overlay key. Fails loudly on key material that would
    break the grammar (a `#`/`:` inside an scc, an unslugged discriminator) —
    these are persistent keys; a malformed one must never reach an artifact."""
    if "#" in scc or ":" in scc:
        raise ValueError(f"scc contains a key-encoding delimiter: {scc!r}")
    encoded = scc if discriminator is None else f"{scc}#{discriminator}"
    if not KEY_GRAMMAR.fullmatch(encoded):
        raise ValueError(f"overlay key does not parse under the key grammar: {encoded!r}")
    return encoded


def keys_digest(keys):
    """Content hash of a key universe: sha256 over the sorted keys joined by
    LF with a trailing LF, UTF-8. The digest definition is part of the
    stability contract — do not change it without a migration note."""
    return hashlib.sha256(("\n".join(keys) + "\n").encode("utf-8")).hexdigest()


def build_key_manifest(joined, pin_lock, fs_provenance):
    """The stable-keys declaration (builder Q7): the sorted, de-duplicated
    universe of overlay keys this join minted, a content hash, and the pin
    checkout the keys were minted against. Deterministic by construction
    (sorted set; no timestamps). FS ids never enter key material (DEC-0014)."""
    keys = sorted({encode_overlay_key(row["overlayKey"]["scc"], row["overlayKey"]["discriminator"]) for row in joined})
    return {
        "contract": (
            "These overlay keys are PERSISTENT: hero documents key `build.decisions` entries by them "
            "(builder Q7). Same pin in => byte-identical keys out. A pin upgrade that changes the key "
            "universe is a migration event handled through the §2.2 divergence pass "
            "(docs/character-builder/02-normative-schema.md): removed keys are re-resolved or surfaced "
            "as invalidated, never silently dropped. Diff mechanically with --diff-manifests."
        ),
        "keyEncoding": "<scc> | <scc>#<discriminator> (02-normative-schema.md §2.3(c))",
        "pin": {
            "source": pin_lock.get("source"),
            "commit": pin_lock.get("commit"),
            "tag": pin_lock.get("tag"),
            "commitDate": pin_lock.get("commitDate"),
        },
        "fsExtract": {
            "source": fs_provenance.get("source"),
            "commit": fs_provenance.get("commit"),
            "role": "labels/shape only — FS ids are labels, never keys (DEC-0014)",
        },
        "keyCount": len(keys),
        "keysSha256": keys_digest(keys),
        "keys": keys,
    }


def diff_manifests(old, new):
    """Mechanical key-universe diff between two manifests (e.g. two pins).
    Classification only — the migration executor (§2.2 divergence pass) is a
    separate, future pass; this diff is its input."""
    old_keys = set(old["keys"])
    new_keys = set(new["keys"])
    removed = sorted(old_keys - new_keys)
    return {
        "oldPin": old.get("pin"),
        "newPin": new.get("pin"),
        "unchanged": len(old_keys & new_keys),
        "added": sorted(new_keys - old_keys),
        "removed": removed,
        "migrationEvent": bool(removed),
        "note": (
            "removed keys are a migration event for `build.decisions` (§2.2 divergence pass): "
            "re-resolve or surface as invalidated, never silently drop."
            if removed
            else "no keys removed — existing `build.decisions` entries all survive this pin change."
        ),
    }


# ---------------------------------------------------------------------------
# Pin-side reconciliation + summary
# ---------------------------------------------------------------------------

PIN_SIDE_CATEGORIES = ("ancestry", "career", "class", "complication", "culture", "kit", "perk", "skill", "title", "treasure")


def pin_only_records(pin_index, used_sccs):
    rows = []
    for record in pin_index.records:
        if record["book"] in EXCLUDED_PIN_BOOKS:
            continue
        if record["category"] in PIN_SIDE_CATEGORIES and record["scc"] not in used_sccs:
            rows.append(
                {
                    "book": record["book"],
                    "category": record["category"],
                    "name": record["name"],
                    "scc": record["scc"],
                    "pinPath": record["mdPath"],
                }
            )
    rows.sort(key=lambda row: (row["category"], row["pinPath"]))
    return rows


def beastheart_perk_cross_check(extract, pin_index):
    """§R-L predicted 'pin has 8 beastheart perks FS lacks' — verify."""
    fs_names = sorted(
        row["name"] for row in extract["rows"] if row["collection"] == "perk" and row["sourcebook"] == "beastheart"
    )
    pin_names = sorted(
        record["name"]
        for record in pin_index.records
        if record["book"] == "beastheart" and record["category"] == "perk"
    )
    fs_normed = {norm_name(n) for n in fs_names}
    pin_normed = {norm_name(n) for n in pin_names}
    return {
        "predicted": "pin has 8 beastheart perks FS lacks (§R-L pre-load)",
        "fsBeastheartPerks": fs_names,
        "pinBeastheartPerks": pin_names,
        "nameMatched": len(fs_normed & pin_normed),
        "fsOnly": sorted(fs_normed - pin_normed),
        "pinOnly": sorted(pin_normed - fs_normed),
    }


def build_summary(extract, joiner, pin_index):
    total = len(joiner.joined) + len(joiner.discrepancies)
    by_category = {}
    for row in joiner.discrepancies:
        by_category[row["category"]] = by_category.get(row["category"], 0) + 1
    per_collection = {}
    for row in joiner.joined:
        key = row["collection"]
        per_collection.setdefault(key, {"joined": 0, "discrepant": 0})["joined"] += 1
    for row in joiner.discrepancies:
        key = row["collection"]
        per_collection.setdefault(key, {"joined": 0, "discrepant": 0})["discrepant"] += 1
    title_delta = [
        {"name": row["elementName"], "sourcebook": row["sourcebook"]}
        for row in joiner.discrepancies
        if row["collection"] == "title" and row["category"] == "count-delta" and "featureName" not in row
    ]
    joinable = total - by_category.get("excluded-book", 0) - by_category.get("no-pin-record", 0)
    return {
        "totalFsRows": total,
        "joined": len(joiner.joined),
        "discrepancies": dict(sorted(by_category.items())),
        "joinRateOverAllRows": round(len(joiner.joined) / total, 4) if total else None,
        "joinRateOverJoinableRows": round(len(joiner.joined) / joinable, 4) if joinable else None,
        "raWorklistRows": len(joiner.worklist),
        "perCollection": dict(sorted(per_collection.items())),
        "titleCountDelta": {
            "predicted": "core titles FS 62 vs pin 60 (2 unreconciled) (§R-L pre-load)",
            "unjoinedFsTitles": title_delta,
        },
        "beastheartPerkCrossCheck": beastheart_perk_cross_check(extract, pin_index),
        "skippedCollections": extract.get("skippedCollections", {}),
    }


PROVENANCE = {
    "generator": "tools/character_builder_join.py",
    "inputs": [
        ".artifacts/canon/character-builder/fs-extract.json (Forge Steel 01672c1, GPL-3.0 — labels/shape only)",
        ".reference/steelcompendium/en/books (pin, DEC-0008 — referenced by scc/path, never copied)",
    ],
    "ruling": "R-L (docs/character-builder/01-rulings-needed.md)",
}


def run_join(extract, pin_records):
    pin_index = PinIndex(pin_records)
    joiner = Joiner(extract, pin_index)
    joiner.run()
    summary = build_summary(extract, joiner, pin_index)
    return joiner, summary, pin_index


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--artifacts", default=".artifacts/canon/character-builder")
    parser.add_argument("--pin", default=".reference/steelcompendium/en/books")
    parser.add_argument(
        "--diff-manifests",
        nargs=2,
        metavar=("OLD", "NEW"),
        help="classify two key-manifest.json files (unchanged/added/removed) and exit; "
        "needs neither the pin nor the extract",
    )
    args = parser.parse_args(argv)

    if args.diff_manifests:
        old_path, new_path = args.diff_manifests
        diff = diff_manifests(load_json(old_path), load_json(new_path))
        json.dump(diff, sys.stdout, indent=1, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0

    artifacts = Path(args.artifacts)
    extract = load_json(artifacts / "fs-extract.json")
    pin_records = load_pin_records(args.pin)
    joiner, summary, pin_index = run_join(extract, pin_records)
    pin_lock = load_json(PIN_SOURCE_LOCK)
    key_manifest = build_key_manifest(joiner.joined, pin_lock, extract.get("_provenance") or {})

    write_json_atomic(artifacts / "scc-join.json", {"_provenance": PROVENANCE, "rows": joiner.joined})
    write_json_atomic(
        artifacts / "discrepancies.json",
        {"_provenance": PROVENANCE, "rows": joiner.discrepancies, "pinOnly": pin_only_records(pin_index, joiner.used_sccs)},
    )
    write_json_atomic(
        artifacts / "ra-worklist.json",
        {
            "_provenance": {
                **PROVENANCE,
                "note": "Pre-seeded grant rows (R-A). Per-row canon verification is a separate follow-up pass — nothing here is ruled.",
            },
            "rows": joiner.worklist,
        },
    )
    write_json_atomic(artifacts / "summary.json", {"_provenance": PROVENANCE, **summary})
    write_json_atomic(artifacts / "key-manifest.json", {"_provenance": PROVENANCE, **key_manifest})

    print(f"scc-join: {summary['totalFsRows']} FS rows -> {summary['joined']} joined "
          f"({summary['joinRateOverAllRows']:.1%} of all, {summary['joinRateOverJoinableRows']:.1%} of joinable)")
    for category, count in summary["discrepancies"].items():
        print(f"  {category}: {count}")
    print(f"  R-A worklist: {summary['raWorklistRows']} rows")
    print(f"  key manifest: {key_manifest['keyCount']} stable keys "
          f"(sha256 {key_manifest['keysSha256'][:12]}…, pin {key_manifest['pin']['tag']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
