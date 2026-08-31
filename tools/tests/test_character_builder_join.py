"""Tests for tools/character_builder_join.py (ruling R-L, scc-join).

Covers the tricky parts: overlay-key cardinality (many FS rows -> one pin
record, unique discriminators), the name-drift map, discrepancy
categorization (excluded-book / no-pin-record / name-drift-unmapped /
count-delta / unjoined-other), the mechanical retry rules, the R-A
pre-seeded-grant worklist, the row-accounting invariant (every FS row
lands exactly once), and the builder-Q7 key-stability contract (the
key manifest, its determinism, and the manifest diff classifier).
"""

import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1]
REPO = TOOLS.parent

spec = importlib.util.spec_from_file_location("character_builder_join", TOOLS / "character_builder_join.py")
cbj = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cbj)


def record(book, category, relpath, name, cls=None, subclass=None, level=None, fields=(), signature=None):
    scc = f"mcdm.{book}.v1/{relpath.replace('/', '.').rsplit('.md', 1)[0]}"
    return {
        "book": book,
        "category": category,
        "relpath": relpath,
        "mdPath": f"en/books/{book}/md/{relpath}",
        "scc": scc,
        "name": name,
        "slug": relpath.rsplit("/", 1)[-1][: -len(".md")],
        "class": cls,
        "subclass": subclass,
        "level": level,
        "signatureTraitName": signature,
        "fields": sorted(fields),
    }


def run(rows, records):
    extract = {"rows": rows, "skippedCollections": {}}
    joiner, summary, pin_index = cbj.run_join(extract, records)
    return joiner, summary


class NormalizationTests(unittest.TestCase):
    def test_norm_name_strips_case_accents_punctuation(self):
        self.assertEqual(cbj.norm_name("Mage’s Apprentice"), "mage s apprentice")
        self.assertEqual(cbj.norm_name("“Thunder Mother”"), "thunder mother")
        self.assertEqual(cbj.norm_name("Séance!"), "seance")

    def test_slugify(self):
        self.assertEqual(cbj.slugify("1st-Level Domain Feature"), "1st-level-domain-feature")
        self.assertEqual(cbj.slugify(""), "unnamed")

    def test_name_variants_colon_comma_parens(self):
        self.assertIn("Master of Fire", cbj.name_variants("One: Master of Fire"))
        self.assertIn("Mantle of Essence", cbj.name_variants("Mantle of Essence: Burning Grounds"))
        self.assertIn("Grave Speech", cbj.name_variants("Grave Speech, Lore Skill"))
        self.assertIn("high Elf", cbj.name_variants("Elf (high)"))

    def test_seeded_drift_map(self):
        # §R-L seed: FS "Tactic Call" = pin "Quick Command".
        self.assertEqual(cbj.apply_drift(cbj.norm_name("Tactic Call")), "quick command")


class ElementJoinTests(unittest.TestCase):
    def test_element_joins_by_name_to_category_record(self):
        records = [record("heroes", "career", "career/agent.md", "Agent")]
        rows = [{"sourcebook": "core", "collection": "career", "fsId": "career-agent", "name": "Agent"}]
        joiner, summary = run(rows, records)
        self.assertEqual(len(joiner.joined), 1)
        row = joiner.joined[0]
        self.assertEqual(row["overlayKey"], {"scc": "mcdm.heroes.v1/career.agent", "discriminator": None})
        self.assertEqual(summary["totalFsRows"], 1)

    def test_unmatched_title_is_count_delta_and_unmatched_item_is_name_drift(self):
        records = [record("heroes", "title", "title/corsair.md", "Corsair")]
        rows = [
            {"sourcebook": "core", "collection": "title", "fsId": "t1", "name": "Angler"},
            {"sourcebook": "core", "collection": "item", "fsId": "i1", "name": "Noxious Cloud"},
        ]
        joiner, _ = run(rows, records)
        categories = {r["elementName"]: r["category"] for r in joiner.discrepancies}
        self.assertEqual(categories["Angler"], "count-delta")
        self.assertEqual(categories["Noxious Cloud"], "name-drift-unmapped")

    def test_no_pin_record_collections(self):
        rows = [
            {"sourcebook": "core", "collection": "language", "fsId": None, "name": "Khelt"},
            {"sourcebook": "core", "collection": "imbuement", "fsId": "imb", "name": "Disguise"},
            {"sourcebook": "core", "collection": "culture", "fsId": "culture-noble-house", "name": "Noble House"},
            {"sourcebook": "core", "collection": "domain", "fsId": "domain-death", "name": "Death"},
        ]
        joiner, _ = run(rows, [])
        self.assertEqual([r["category"] for r in joiner.discrepancies], ["no-pin-record"] * 4)

    def test_beastheart_rows_are_excluded_book_and_fully_accounted(self):
        rows = [
            {
                "sourcebook": "beastheart",
                "collection": "class",
                "fsId": "class-beastheart",
                "name": "Beastheart",
                "featuresByLevel": [{"level": 1, "features": [{"fsId": "b1", "name": "Ferocity", "featureType": "Heroic Resource"}]}],
            },
            {"sourcebook": "beastheart", "collection": "perk", "fsId": "p", "name": "Born Tracker"},
        ]
        # Even with a matching pin record, the excluded book must not join.
        records = [record("beastheart", "perk", "perk/born-tracker.md", "Born Tracker")]
        joiner, summary = run(rows, records)
        self.assertEqual(len(joiner.joined), 0)
        self.assertEqual({r["category"] for r in joiner.discrepancies}, {"excluded-book"})
        # element + nested feature row + perk element = 3 accounted rows
        self.assertEqual(summary["totalFsRows"], 3)


class ClassFeatureJoinTests(unittest.TestCase):
    def fury_rows(self, features_level, level=4):
        return [
            {
                "sourcebook": "core",
                "collection": "class",
                "fsId": "class-fury",
                "name": "Fury",
                "subclassName": "Primordial Aspect",
                "featuresByLevel": [{"level": level, "features": features_level}],
            }
        ]

    def test_class_feature_joins_by_class_level_name(self):
        records = [
            record("heroes", "class", "class/fury.md", "Fury", fields=["starting_stamina", "recoveries", "skills"]),
            record("heroes", "feature", "feature/fury/level-4/skill.md", "Skill", cls="fury", level=4),
        ]
        rows = self.fury_rows([{"fsId": "fury-4-x", "name": "Skill", "featureType": "Skill Choice"}])
        joiner, _ = run(rows, records)
        sccs = {r["overlayKey"]["scc"] for r in joiner.joined}
        self.assertIn("mcdm.heroes.v1/feature.fury.level-4.skill", sccs)

    def test_level_mismatch_is_unjoined_other_not_forced(self):
        records = [
            record("heroes", "class", "class/fury.md", "Fury", fields=["skills"]),
            record("heroes", "feature", "feature/fury/level-4/skill.md", "Skill", cls="fury", level=4),
            record("heroes", "feature", "feature/fury/level-7/skill.md", "Skill", cls="fury", level=7),
        ]
        rows = self.fury_rows([{"fsId": "x", "name": "Skill", "featureType": "Skill Choice"}], level=2)
        joiner, _ = run(rows, records)
        feature_rows = [r for r in joiner.discrepancies if r.get("featureName") == "Skill"]
        self.assertEqual(feature_rows[0]["category"], "unjoined-other")
        self.assertIn("level mismatch", feature_rows[0]["note"])
        self.assertEqual(len(feature_rows[0]["candidates"]), 2)

    def test_stamina_maps_to_class_record_field(self):
        records = [record("heroes", "class", "class/fury.md", "Fury", fields=["starting_stamina", "recoveries", "skills"])]
        rows = self.fury_rows(
            [
                {"fsId": "a", "name": "Stamina", "featureType": "Bonus"},
                {"fsId": "b", "name": "Recoveries", "featureType": "Bonus"},
            ],
            level=1,
        )
        joiner, _ = run(rows, records)
        feature_joins = [r for r in joiner.joined if r.get("featureName")]
        self.assertEqual(
            sorted(r["overlayKey"]["discriminator"] for r in feature_joins),
            ["recoveries", "starting-stamina"],
        )
        self.assertTrue(all(r["matchKind"] == "class-record-field" for r in feature_joins))

    def test_npt_ability_renames_via_heroic_resource(self):
        records = [
            record("heroes", "class", "class/fury.md", "Fury", fields=["skills"]),
            record("heroes", "feature", "feature/fury/level-3/7-ferocity-ability.md", "7-Ferocity Ability", cls="fury", level=3),
        ]
        rows = [
            {
                "sourcebook": "core",
                "collection": "class",
                "fsId": "class-fury",
                "name": "Fury",
                "subclassName": "Primordial Aspect",
                "featuresByLevel": [
                    {"level": 1, "features": [{"fsId": "f0", "name": "Ferocity", "featureType": "Heroic Resource"}]},
                    {"level": 3, "features": [{"fsId": "f1", "name": "7pt Ability", "featureType": "Class Ability"}]},
                ],
            }
        ]
        joiner, _ = run(rows, records)
        matched = [r for r in joiner.joined if r.get("featureName") == "7pt Ability"]
        self.assertEqual(len(matched), 1)
        self.assertIn("7-ferocity-ability", matched[0]["overlayKey"]["scc"])

    def test_characteristic_bonus_rows_collapse_onto_one_record_with_unique_discriminators(self):
        records = [
            record("heroes", "class", "class/fury.md", "Fury", fields=["skills"]),
            record(
                "heroes",
                "feature",
                "feature/fury/level-4/characteristic-increase.md",
                "Characteristic Increase",
                cls="fury",
                level=4,
            ),
        ]
        rows = self.fury_rows(
            [
                {"fsId": "m", "name": "Might", "featureType": "Characteristic Bonus", "characteristic": "Might"},
                {"fsId": "a", "name": "Agility", "featureType": "Characteristic Bonus", "characteristic": "Agility"},
            ]
        )
        joiner, _ = run(rows, records)
        feature_joins = [r for r in joiner.joined if r.get("featureName")]
        self.assertEqual(len(feature_joins), 2)
        keys = {(r["overlayKey"]["scc"], r["overlayKey"]["discriminator"]) for r in feature_joins}
        self.assertEqual(len(keys), 2)  # same scc, distinct discriminators
        self.assertEqual({scc for scc, _ in keys}, {"mcdm.heroes.v1/feature.fury.level-4.characteristic-increase"})

    def test_drift_map_applies_to_class_features(self):
        records = [
            record("summoner", "class", "class/summoner.md", "Summoner", fields=["skills"]),
            record("summoner", "feature", "feature/summoner/level-1/quick-command.md", "Quick Command", cls="summoner", level=1),
        ]
        rows = [
            {
                "sourcebook": "summoner",
                "collection": "class",
                "fsId": "class-summoner",
                "name": "Summoner",
                "subclassName": "Circle",
                "featuresByLevel": [
                    {"level": 1, "features": [{"fsId": "s1", "name": "Tactic Call", "featureType": "Ability"}]}
                ],
            }
        ]
        joiner, _ = run(rows, records)
        matched = [r for r in joiner.joined if r.get("featureName") == "Tactic Call"]
        self.assertEqual(len(matched), 1)
        self.assertIn("quick-command", matched[0]["overlayKey"]["scc"])


class ParentHostedCardinalityTests(unittest.TestCase):
    def test_career_features_share_scc_with_unique_discriminators(self):
        records = [record("heroes", "career", "career/agent.md", "Agent")]
        rows = [
            {
                "sourcebook": "core",
                "collection": "career",
                "fsId": "career-agent",
                "name": "Agent",
                "features": [
                    {"fsId": "f1", "name": "Skill", "featureType": "Skill Choice", "selected": ["Sneak"]},
                    {"fsId": "f2", "name": "Skill", "featureType": "Skill Choice"},
                    {"fsId": "f3", "name": "Languages", "featureType": "Language Choice", "count": 2},
                ],
                "incitingIncidents": [{"fsId": "ii-1", "name": "Disavowed"}],
            }
        ]
        joiner, _ = run(rows, records)
        feature_joins = [r for r in joiner.joined if r.get("featureName")]
        self.assertEqual(len(feature_joins), 3)
        sccs = {r["overlayKey"]["scc"] for r in feature_joins}
        self.assertEqual(sccs, {"mcdm.heroes.v1/career.agent"})
        discs = sorted(r["overlayKey"]["discriminator"] for r in feature_joins)
        self.assertEqual(discs, ["languages", "skill", "skill-2"])  # duplicate names disambiguated
        # Inciting incidents are identity-less table rows -> no-pin-record.
        incident_rows = [r for r in joiner.discrepancies if r.get("featureType") == "Inciting Incident"]
        self.assertEqual(len(incident_rows), 1)
        self.assertEqual(incident_rows[0]["category"], "no-pin-record")

    def test_domain_feature_joins_via_conduit_subclass_frontmatter(self):
        records = [
            record(
                "heroes",
                "feature",
                "feature/conduit/level-1/grave-speech.md",
                "Grave Speech",
                cls="conduit",
                subclass="death",
                level=1,
            ),
            record(
                "heroes",
                "feature",
                "feature/conduit/level-1/domain-piety-and-effects.md",
                "Domain Piety and Effects",
                cls="conduit",
                level=1,
            ),
        ]
        rows = [
            {
                "sourcebook": "core",
                "collection": "domain",
                "fsId": "domain-death",
                "name": "Death",
                "featuresByLevel": [
                    {
                        "level": 1,
                        "features": [{"fsId": "d1", "name": "Grave Speech, Lore Skill", "featureType": "Multiple Features"}],
                    }
                ],
                "defaultFeatures": [{"fsId": "d0", "name": "Death Prayer Effect", "featureType": "Text"}],
            }
        ]
        joiner, _ = run(rows, records)
        by_name = {r["featureName"]: r for r in joiner.joined if r.get("featureName")}
        self.assertIn("grave-speech", by_name["Grave Speech, Lore Skill"]["overlayKey"]["scc"])
        prayer = by_name["Death Prayer Effect"]
        self.assertIn("domain-piety-and-effects", prayer["overlayKey"]["scc"])
        self.assertEqual(prayer["overlayKey"]["discriminator"], "death-prayer-effect")


class WorklistAndAccountingTests(unittest.TestCase):
    def test_preseeded_selection_lands_on_worklist_with_join(self):
        records = [record("heroes", "career", "career/warden.md", "Warden")]
        rows = [
            {
                "sourcebook": "core",
                "collection": "career",
                "fsId": "career-warden",
                "name": "Warden",
                "features": [
                    {
                        "fsId": "w1",
                        "name": "Skill",
                        "featureType": "Skill Choice",
                        "listOptions": ["Crafting", "Exploration", "Interpersonal", "Intrigue", "Lore"],
                        "selected": ["Nature"],
                    },
                    {
                        "fsId": "w2",
                        "name": "Narrowed",
                        "featureType": "Skill Choice",
                        "listOptions": ["Intrigue"],
                        "selected": ["Sneak"],
                    },
                ],
                "incitingIncidents": [],
            }
        ]
        joiner, summary = run(rows, records)
        self.assertEqual(summary["raWorklistRows"], 2)
        by_name = {r["featureName"]: r for r in joiner.worklist}
        self.assertEqual(by_name["Skill"]["selected"], ["Nature"])
        self.assertTrue(by_name["Skill"]["openPool"])  # all five lists = open
        self.assertFalse(by_name["Narrowed"]["openPool"])  # narrowed list = not open
        self.assertEqual(by_name["Skill"]["overlayKey"]["scc"], "mcdm.heroes.v1/career.warden")

    def test_nested_preseeded_selection_is_found(self):
        records = [record("heroes", "complication", "complication/ward.md", "Ward")]
        rows = [
            {
                "sourcebook": "core",
                "collection": "complication",
                "fsId": "comp-ward",
                "name": "Ward",
                "features": [
                    {
                        "fsId": "outer",
                        "name": "Benefit",
                        "featureType": "Multiple Features",
                        "features": [
                            {"fsId": "inner", "name": "Skill", "featureType": "Skill Choice", "selected": ["Heal"]}
                        ],
                    }
                ],
            }
        ]
        joiner, _ = run(rows, records)
        self.assertEqual(len(joiner.worklist), 1)
        self.assertEqual(joiner.worklist[0]["selected"], ["Heal"])

    def test_every_row_accounted_exactly_once(self):
        records = [
            record("heroes", "career", "career/agent.md", "Agent"),
            record("heroes", "title", "title/corsair.md", "Corsair"),
        ]
        rows = [
            {
                "sourcebook": "core",
                "collection": "career",
                "fsId": "career-agent",
                "name": "Agent",
                "features": [{"fsId": "f1", "name": "Skill", "featureType": "Skill Choice"}],
                "incitingIncidents": [{"fsId": "ii", "name": "Disavowed"}],
            },
            {"sourcebook": "core", "collection": "title", "fsId": "t1", "name": "Angler"},
            {"sourcebook": "core", "collection": "language", "fsId": None, "name": "Khelt"},
            {"sourcebook": "beastheart", "collection": "perk", "fsId": "p", "name": "Born Tracker"},
        ]
        joiner, summary = run(rows, records)
        # elements: 4; features: 1 + inciting incident 1 => 6 rows
        self.assertEqual(summary["totalFsRows"], 6)
        self.assertEqual(len(joiner.joined) + len(joiner.discrepancies), 6)
        paths = [r["fsPath"] for r in joiner.joined] + [r["fsPath"] for r in joiner.discrepancies]
        self.assertEqual(len(paths), len(set(paths)))


class KeyStabilityTests(unittest.TestCase):
    """Builder Q7: overlay keys are persistent — the join declares them
    stable via the key manifest, and the manifest diff classifies a pin
    change mechanically (unchanged / added / removed)."""

    FIXTURE_RECORDS = None
    FIXTURE_ROWS = None

    def fixtures(self):
        records = [
            record("heroes", "career", "career/agent.md", "Agent"),
            record("heroes", "class", "class/fury.md", "Fury", fields=["starting_stamina", "recoveries", "skills"]),
            record("heroes", "feature", "feature/fury/level-4/skill.md", "Skill", cls="fury", level=4),
        ]
        rows = [
            {
                "sourcebook": "core",
                "collection": "career",
                "fsId": "career-agent",
                "name": "Agent",
                "features": [
                    {"fsId": "f1", "name": "Skill", "featureType": "Skill Choice"},
                    {"fsId": "f2", "name": "Skill", "featureType": "Skill Choice"},
                ],
                "incitingIncidents": [],
            },
            {
                "sourcebook": "core",
                "collection": "class",
                "fsId": "class-fury",
                "name": "Fury",
                "subclassName": "Primordial Aspect",
                "featuresByLevel": [
                    {"level": 4, "features": [{"fsId": "x", "name": "Skill", "featureType": "Skill Choice"}]}
                ],
            },
        ]
        return rows, records

    PIN_LOCK = {"source": "test-pin", "commit": "c" * 40, "tag": "v-test", "commitDate": "2026-01-01T00:00:00Z"}
    FS_PROV = {"source": "Forge Steel (test)", "commit": "f" * 40}

    def manifest(self):
        rows, records = self.fixtures()
        joiner, _ = run(rows, records)
        return cbj.build_key_manifest(joiner.joined, self.PIN_LOCK, self.FS_PROV)

    def test_encode_overlay_key_grammar(self):
        self.assertEqual(cbj.encode_overlay_key("mcdm.heroes.v1/career.agent", None), "mcdm.heroes.v1/career.agent")
        self.assertEqual(
            cbj.encode_overlay_key("mcdm.heroes.v1/career.agent", "skill-2"),
            "mcdm.heroes.v1/career.agent#skill-2",
        )
        with self.assertRaises(ValueError):
            cbj.encode_overlay_key("mcdm.heroes.v1/career.agent#oops", None)
        with self.assertRaises(ValueError):
            cbj.encode_overlay_key("mcdm.heroes.v1/career::agent", None)
        with self.assertRaises(ValueError):
            cbj.encode_overlay_key("mcdm.heroes.v1/career.agent", "Not Slugged")

    def test_manifest_keys_sorted_unique_and_hashed(self):
        manifest = self.manifest()
        keys = manifest["keys"]
        self.assertEqual(keys, sorted(set(keys)))
        self.assertEqual(manifest["keyCount"], len(keys))
        recomputed = hashlib.sha256(("\n".join(keys) + "\n").encode("utf-8")).hexdigest()
        self.assertEqual(manifest["keysSha256"], recomputed)
        self.assertEqual(manifest["pin"]["commit"], self.PIN_LOCK["commit"])
        # Discriminated siblings both present, encoded per §2.3(c).
        self.assertIn("mcdm.heroes.v1/career.agent#skill", keys)
        self.assertIn("mcdm.heroes.v1/career.agent#skill-2", keys)

    def test_no_fs_id_reaches_key_material(self):
        # DEC-0014: FS ids are labels, never keys. Every key is scc-derived;
        # fsIds like "career-agent"/"class-fury" appear nowhere in the keys
        # except as pin-side slugs — assert the raw fsIds "f1"/"f2"/"x" and
        # the FS commit never appear.
        manifest = self.manifest()
        blob = "\n".join(manifest["keys"])
        for fs_id in ("#f1", "#f2", "#x"):
            self.assertNotIn(fs_id, blob)
        self.assertNotIn(self.FS_PROV["commit"], blob)

    def test_same_input_twice_yields_byte_identical_manifest(self):
        # The stability declaration itself: same pin in, identical keys out.
        first = json.dumps(self.manifest(), sort_keys=False)
        second = json.dumps(self.manifest(), sort_keys=False)
        self.assertEqual(first, second)

    def test_diff_manifests_classifies_unchanged_added_removed(self):
        new = self.manifest()
        old = dict(new)
        old["pin"] = {"tag": "v-old"}
        kept = [k for k in new["keys"] if k != "mcdm.heroes.v1/career.agent#skill-2"]
        old["keys"] = sorted(kept + ["mcdm.heroes.v1/career.vanished"])
        diff = cbj.diff_manifests(old, new)
        self.assertEqual(diff["unchanged"], len(kept))
        self.assertEqual(diff["added"], ["mcdm.heroes.v1/career.agent#skill-2"])
        self.assertEqual(diff["removed"], ["mcdm.heroes.v1/career.vanished"])
        self.assertTrue(diff["migrationEvent"])
        self.assertIn("never silently drop", diff["note"])

    def test_diff_manifests_no_removals_is_not_a_migration_event(self):
        manifest = self.manifest()
        diff = cbj.diff_manifests(manifest, manifest)
        self.assertFalse(diff["migrationEvent"])
        self.assertEqual(diff["added"], [])
        self.assertEqual(diff["removed"], [])


class FullPipelineDeterminismTests(unittest.TestCase):
    """Runs the real join twice as separate processes (distinct hash seeds)
    against the real pin + extract and asserts every artifact — the key
    manifest above all — is byte-identical. Skipped when the corpus is
    absent (CI); the corpus-enabled dev box runs it."""

    EXTRACT = REPO / ".artifacts" / "canon" / "character-builder" / "fs-extract.json"
    PIN = REPO / ".reference" / "steelcompendium" / "en" / "books"
    OUTPUTS = ("scc-join.json", "discrepancies.json", "ra-worklist.json", "summary.json", "key-manifest.json")

    def setUp(self):
        if not self.EXTRACT.exists() or not self.PIN.is_dir():
            self.skipTest("corpus (pin + fs-extract) not present")

    def run_once(self, workdir, seed):
        shutil.copy(self.EXTRACT, workdir / "fs-extract.json")
        env = dict(os.environ, PYTHONHASHSEED=seed)
        subprocess.run(
            [
                sys.executable,
                str(TOOLS / "character_builder_join.py"),
                "--artifacts",
                str(workdir),
                "--pin",
                str(self.PIN),
            ],
            check=True,
            env=env,
            capture_output=True,
        )

    def test_rerun_is_byte_identical_across_hash_seeds(self):
        with tempfile.TemporaryDirectory() as tmp:
            first = Path(tmp) / "a"
            second = Path(tmp) / "b"
            first.mkdir()
            second.mkdir()
            self.run_once(first, "1")
            self.run_once(second, "424242")
            for name in self.OUTPUTS:
                self.assertEqual(
                    (first / name).read_bytes(),
                    (second / name).read_bytes(),
                    f"{name} differs between identical-input runs",
                )


class GeneratedArtifactInvariantTests(unittest.TestCase):
    """Sanity checks over the committed artifacts (skipped when absent)."""

    ARTIFACTS = REPO / ".artifacts" / "canon" / "character-builder"

    def setUp(self):
        if not (self.ARTIFACTS / "summary.json").exists():
            self.skipTest("scc-join artifacts not generated")

    def load(self, name):
        with open(self.ARTIFACTS / name, encoding="utf-8") as handle:
            return json.load(handle)

    def test_totals_reconcile(self):
        summary = self.load("summary.json")
        joined = self.load("scc-join.json")["rows"]
        discrepancies = self.load("discrepancies.json")["rows"]
        self.assertEqual(summary["joined"], len(joined))
        self.assertEqual(summary["totalFsRows"], len(joined) + len(discrepancies))
        self.assertEqual(sum(summary["discrepancies"].values()), len(discrepancies))

    def test_every_joined_row_has_scc_and_unique_fs_path(self):
        joined = self.load("scc-join.json")["rows"]
        self.assertTrue(all(r["overlayKey"]["scc"] for r in joined))
        paths = [r["fsPath"] for r in joined]
        self.assertEqual(len(paths), len(set(paths)))

    def test_overlay_keys_are_unique_per_discriminated_host(self):
        joined = self.load("scc-join.json")["rows"]
        keyed = [
            (r["overlayKey"]["scc"], r["overlayKey"]["discriminator"])
            for r in joined
            if r["overlayKey"]["discriminator"] is not None
        ]
        self.assertEqual(len(keyed), len(set(keyed)))

    def test_no_forge_steel_prose_fields(self):
        for name in ("scc-join.json", "discrepancies.json", "ra-worklist.json"):
            data = self.load(name)

            def walk(node):
                if isinstance(node, dict):
                    self.assertNotIn("description", node)
                    for value in node.values():
                        walk(value)
                elif isinstance(node, list):
                    for value in node:
                        walk(value)

            walk(data)

    def test_beastheart_never_joins(self):
        joined = self.load("scc-join.json")["rows"]
        self.assertFalse([r for r in joined if r["sourcebook"] == "beastheart"])
        self.assertFalse([r for r in joined if "/beastheart/" in r["pinPath"]])

    def manifest(self):
        if not (self.ARTIFACTS / "key-manifest.json").exists():
            self.skipTest("key-manifest.json not generated (pre-Q7 artifact set — re-run the join)")
        return self.load("key-manifest.json")

    def test_manifest_matches_join_rows_and_grammar(self):
        manifest = self.manifest()
        joined = self.load("scc-join.json")["rows"]
        expected = sorted(
            {cbj.encode_overlay_key(r["overlayKey"]["scc"], r["overlayKey"]["discriminator"]) for r in joined}
        )
        self.assertEqual(manifest["keys"], expected)
        self.assertEqual(manifest["keyCount"], len(expected))
        self.assertEqual(
            manifest["keysSha256"],
            hashlib.sha256(("\n".join(expected) + "\n").encode("utf-8")).hexdigest(),
        )
        for key in manifest["keys"]:
            self.assertTrue(cbj.KEY_GRAMMAR.fullmatch(key), f"key fails grammar: {key}")
            self.assertNotIn("::", key)

    def test_manifest_pin_matches_source_lock(self):
        manifest = self.manifest()
        lock_path = REPO / "packages" / "canon" / "config" / "steelcompendium-source.json"
        with open(lock_path, encoding="utf-8") as handle:
            lock = json.load(handle)
        self.assertEqual(manifest["pin"]["commit"], lock["commit"])
        self.assertEqual(manifest["pin"]["tag"], lock["tag"])


if __name__ == "__main__":
    unittest.main()
