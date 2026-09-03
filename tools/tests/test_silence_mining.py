import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))

import build_deck  # noqa: E402
import docket_to_silences  # noqa: E402
import extract_sources  # noqa: E402
import mine_manifest  # noqa: E402
import ruling_surface  # noqa: E402
import settle_rulings  # noqa: E402


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


class Fixture(unittest.TestCase):
    """A two-bundle fake corpus under a repo-shaped temp tree."""

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.bundles = self.root / ".artifacts/canon/bundles/en/books/heroes/md"
        self.accepted = self.root / ".artifacts/canon/campaign/accepted"
        self.bundles.mkdir(parents=True)
        self.accepted.mkdir(parents=True)
        self.texts = {
            "mcdm.heroes.v1/condition/alpha": "\nWhile alpha, a creature can't take triggered actions.\n",
            "mcdm.heroes.v1/condition/beta": "\nWhile beta, a creature has a bane on power rolls.\n",
            "mcdm.heroes.v1/chapter/combat#gamma": "\n#### Gamma\n\nA creature can gamma once per round.\n",
        }
        bundle_entries = []
        for artifact_id, text in self.texts.items():
            name = artifact_id.split("/")[-1].replace("#", "-")
            path = self.bundles / f"{name}.bundle.json"
            path.write_text(json.dumps({
                "schemaVersion": 1,
                "records": [
                    {"recordKind": "exclusion", "id": f"exclude:{artifact_id}", "version": "x"},
                    {
                        "recordKind": "artifact",
                        "id": artifact_id,
                        "version": sha(text),
                        "source": {"path": f"en/books/heroes/md/{name}.md"},
                        "text": text,
                    },
                ],
            }), encoding="utf-8")
            bundle_entries.append({"sourcePath": f"en/books/heroes/md/{name}.md", "bundlePath": str(path)})
        self.manifest = self.accepted / "final-campaign-manifest.json"
        self.manifest.write_text(json.dumps({"bundles": bundle_entries}), encoding="utf-8")

    def tearDown(self):
        self.temporary.cleanup()

    def write_json(self, relative, value):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value), encoding="utf-8")
        return path


class ExtractSourcesTests(Fixture):
    def test_extracts_verbatim_records_in_request_order(self):
        ids = ["mcdm.heroes.v1/condition/beta", "mcdm.heroes.v1/condition/alpha", "mcdm.heroes.v1/condition/beta"]
        sources = extract_sources.extract(str(self.manifest), ids)
        self.assertEqual([s["id"] for s in sources], ids[:2])
        self.assertEqual(sources[0]["text"], self.texts["mcdm.heroes.v1/condition/beta"])
        self.assertEqual(sources[0]["versionSha256"], sha(self.texts["mcdm.heroes.v1/condition/beta"]))
        self.assertEqual(sources[0]["bytes"], len(self.texts["mcdm.heroes.v1/condition/beta"].encode()))

    def test_unknown_id_is_an_error_not_a_silent_drop(self):
        with self.assertRaises(ValueError) as caught:
            extract_sources.extract(str(self.manifest), ["mcdm.heroes.v1/condition/nope"])
        self.assertIn("nope", str(caught.exception))

    def test_relocated_bundle_path_falls_back_to_repo_relative(self):
        manifest = json.loads(self.manifest.read_text())
        for entry in manifest["bundles"]:
            entry["bundlePath"] = "/some/other/box" + entry["bundlePath"][entry["bundlePath"].index("/.artifacts"):]
        self.manifest.write_text(json.dumps(manifest))
        sources = extract_sources.extract(str(self.manifest), ["mcdm.heroes.v1/condition/alpha"])
        self.assertEqual(len(sources), 1)


class MineManifestTests(Fixture):
    def corpus_map(self):
        return {
            "canonPin": "pin",
            "rows": [
                {"id": "mcdm.heroes.v1/condition/alpha", "chapter": "combat", "primary": "engine", "bytes": 60, "criticalPath": True, "secondaries": [], "spatial": False, "justification": "j"},
                {"id": "mcdm.heroes.v1/condition/beta", "chapter": "combat", "primary": "engine", "bytes": 60, "criticalPath": True},
                {"id": "mcdm.heroes.v1/chapter/combat#gamma", "chapter": "combat", "primary": "reference-data", "bytes": 60},
            ],
        }

    def test_selects_bucket_in_chapter_excludes_ruled_and_chunks(self):
        out = self.root / "deck"
        exclude = self.write_json("prior/sources.json", [{"id": "mcdm.heroes.v1/condition/beta"}])
        work = mine_manifest.build(
            self.corpus_map(), json.loads(self.manifest.read_text()), str(self.manifest), str(out),
            ["combat"], ["engine"], mine_manifest.excluded_ids([str(exclude)]), max_bytes=1000, max_count=12,
        )
        self.assertEqual(work["selected"], 2)
        self.assertEqual(work["excludedAlreadyRuled"], ["mcdm.heroes.v1/condition/beta"])
        self.assertEqual(len(work["batches"]), 1)
        self.assertEqual(work["batches"][0]["artifactIds"], ["mcdm.heroes.v1/condition/alpha"])
        sources = json.loads((out / "mine" / "batch-01.sources.json").read_text())
        self.assertEqual(sources[0]["text"], self.texts["mcdm.heroes.v1/condition/alpha"])
        self.assertNotIn("criticalPath", json.dumps(work["batches"]))

    def test_byte_cap_splits_batches(self):
        work = mine_manifest.build(
            self.corpus_map(), json.loads(self.manifest.read_text()), str(self.manifest), str(self.root / "d"),
            ["combat"], ["engine"], set(), max_bytes=61, max_count=12,
        )
        self.assertEqual([b["artifactIds"] for b in work["batches"]],
                         [["mcdm.heroes.v1/condition/alpha"], ["mcdm.heroes.v1/condition/beta"]])


class DocketTests(Fixture):
    def test_one_card_per_batch_with_global_questions_on_overlay(self):
        docket = {
            "globalStatQuestions": ["G1?"],
            "rows": [
                {"key": "a#1", "artifactId": "mcdm.heroes.v1/condition/alpha", "cluster": cluster, "questions": [f"{cluster} q?"], "payloadSha256": "h"}
                for cluster, _, _ in docket_to_silences.BATCHES
            ],
        }
        silences, sources = docket_to_silences.build(docket, str(self.manifest))
        self.assertEqual(len(silences), 8)
        overlay = next(s for s in silences if s["docketCluster"] == "overlay-instance-and-values")
        self.assertEqual(overlay["subQuestions"][0], "G1?")
        self.assertTrue(all(s["oneRuling"] for s in silences))
        self.assertEqual([s["id"] for s in sources], ["mcdm.heroes.v1/condition/alpha"])

    def test_unknown_cluster_is_an_error(self):
        docket = {"rows": [{"key": "k", "artifactId": "mcdm.heroes.v1/condition/alpha", "cluster": "mystery", "questions": [], "payloadSha256": "h"}]}
        with self.assertRaises(ValueError):
            docket_to_silences.build(docket, str(self.manifest))


class DeckAndSettleTests(Fixture):
    def make_deck(self):
        deck = self.root / "deck"
        question = "Does alpha stop free triggered actions too?"
        self.write_json("deck/silences.json", [{
            "group": "Conditions", "question": question, "oneRuling": True,
            "subQuestions": ["case one", "case two"],
            "sourceArtifactIds": ["mcdm.heroes.v1/condition/alpha"],
        }])
        self.write_json("deck/sources.json", extract_sources.extract(str(self.manifest), ["mcdm.heroes.v1/condition/alpha"]))
        return deck, question

    def test_prep_writes_self_contained_cards(self):
        deck, question = self.make_deck()
        cards = build_deck.prep(str(deck))
        qid = build_deck.stable_qid(question)
        self.assertEqual(cards[0]["qid"], qid)
        card = json.loads((deck / "cards" / f"{qid}.json").read_text())
        self.assertEqual(card["sources"][0]["text"], self.texts["mcdm.heroes.v1/condition/alpha"])
        self.assertEqual(card["subQuestions"], ["case one", "case two"])

    def workflow_output(self, question, qid, evidence):
        return {
            "mode": "verify",
            "answers": [{
                "qid": qid, "question": question, "answer": "Yes.", "basis": "derived",
                "evidence": evidence, "reasoning": "because", "confidence": "medium",
                "consequenceIfWrong": "tables differ", "alternatives": [],
            }],
            "findings": [{"qid": qid, "kind": "wrong-basis", "skeptic": 1, "problem": "it is printed", "correctedBasis": "printed"}],
        }

    def test_ingest_build_and_settle_round_trip(self):
        deck, question = self.make_deck()
        build_deck.prep(str(deck))
        qid = build_deck.stable_qid(question)
        evidence = 'mcdm.heroes.v1/condition/alpha: "a creature can\'t take triggered actions"'
        build_deck.ingest(str(deck), self.workflow_output(question, qid, evidence))
        answers = json.loads((deck / "answers.json").read_text())
        self.assertEqual(answers["findings"][0]["correctedBasis"], "printed")

        rc = build_deck.build(str(deck), "Test deck")
        self.assertEqual(rc, 0)
        review = json.loads((deck / "review-set.json").read_text())
        self.assertEqual(len(review), 1)
        self.assertEqual(review[0]["basis"], "printed")  # corrected by the finding
        self.assertTrue(review[0]["refuted"])
        html = (deck / "review.html").read_text()
        self.assertIn("case one", html)
        self.assertIn("subQuestions", html)

        sources = json.loads((deck / "sources.json").read_text())
        prepared = ruling_surface.prepare(review, sources)
        key = settle_rulings.doc_key(prepared)
        blob = {"schema": "engarde-batch-rulings-v1", "docKey": key, "exportedAt": "2026-09-02T10:00:00Z",
                "rulings": [{"qid": qid, "verdict": "no", "note": "Only main-action triggers.", "at": "2026-09-02T10:00:00Z"}]}
        result, draft = settle_rulings.settle(blob, review, sources, "deck-test", "R-0046")
        row = result["userRuled"][0]
        self.assertEqual(row["userVerdict"], "override")
        self.assertEqual(row["ruling"], "Only main-action triggers.")
        self.assertEqual(row["rulingId"], "R-0046")
        self.assertEqual(row["cardHash"], settle_rulings.card_hash(prepared[0]))
        self.assertIn("## R-0046", draft)
        self.assertIn("overriding the proposal", draft)

    def test_settle_refuses_wrong_deck_and_silent_override(self):
        deck, question = self.make_deck()
        build_deck.prep(str(deck))
        qid = build_deck.stable_qid(question)
        build_deck.ingest(str(deck), self.workflow_output(question, qid, ""))
        build_deck.build(str(deck), "Test deck")
        review = json.loads((deck / "review-set.json").read_text())
        sources = json.loads((deck / "sources.json").read_text())
        key = settle_rulings.doc_key(ruling_surface.prepare(review, sources))
        with self.assertRaises(ValueError) as caught:
            settle_rulings.settle({"schema": "engarde-batch-rulings-v1", "docKey": "0000000000000000", "rulings": [{"qid": qid, "verdict": "yes"}]}, review, sources, "d", "R-0001")
        self.assertIn("different set of cards", str(caught.exception))
        with self.assertRaises(ValueError) as caught:
            settle_rulings.settle({"schema": "engarde-batch-rulings-v1", "docKey": key, "rulings": [{"qid": qid, "verdict": "no", "note": ""}]}, review, sources, "d", "R-0001")
        self.assertIn("without saying what the ruling is", str(caught.exception))

    def test_quote_verifier_flags_fabricated_fragment(self):
        deck, question = self.make_deck()
        build_deck.prep(str(deck))
        qid = build_deck.stable_qid(question)
        build_deck.ingest(str(deck), self.workflow_output(question, qid, 'mcdm.heroes.v1/condition/alpha: "a creature gains an edge"'))
        proc = subprocess.run([sys.executable, str(TOOLS / "verify_quotes.py"), str(deck / "answers.json"), str(deck / "sources.json")],
                              capture_output=True, text=True)
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("1 problem fragments", proc.stdout)


if __name__ == "__main__":
    unittest.main()


class AssembleTests(Fixture):
    def test_assemble_keeps_only_unrefuted_cards(self):
        deck = self.root / "deck"
        q1, q2 = "Open question one?", "Refuted question two?"
        self.write_json("deck/silences.json", [
            {"group": "G", "question": q1, "sourceArtifactIds": ["mcdm.heroes.v1/condition/alpha"]},
            {"group": "G", "question": q2, "sourceArtifactIds": ["mcdm.heroes.v1/condition/beta"]},
        ])
        self.write_json("deck/sources.json", extract_sources.extract(str(self.manifest), ["mcdm.heroes.v1/condition/alpha", "mcdm.heroes.v1/condition/beta"]))
        build_deck.prep(str(deck))
        qid1, qid2 = build_deck.stable_qid(q1), build_deck.stable_qid(q2)
        answer = lambda qid, q: {"qid": qid, "question": q, "answer": "A.", "basis": "derived", "evidence": "", "reasoning": "r", "confidence": "low", "consequenceIfWrong": "c", "alternatives": []}
        build_deck.ingest(str(deck), {"mode": "verify", "answers": [answer(qid1, q1), answer(qid2, q2)],
                                      "findings": [{"qid": qid2, "kind": "pin-answers-it", "skeptic": 1, "problem": "printed", "correctedBasis": "printed"}]})
        build_deck.build(str(deck), "t")
        rc, count = build_deck.assemble(str(self.root / "final"), [str(deck)], "Final")
        self.assertEqual((rc, count), (0, 1))
        final = json.loads((self.root / "final" / "review-set.json").read_text())
        self.assertEqual(final[0]["qid"], qid1)
        self.assertEqual(final[0]["fromDeck"], "deck")
        self.assertEqual([s["id"] for s in json.loads((self.root / "final" / "sources.json").read_text())], ["mcdm.heroes.v1/condition/alpha"])


class FromWorkflowTests(Fixture):
    def test_from_mine_and_from_recut_materialize_decks(self):
        mine_out = {"summary": "x", "result": {"mode": "mine", "mined": {"raw": [1], "examined": ["a"], "deadBatches": [], "merged": {
            "cards": [{"question": "Open Q?", "group": "G", "sourceArtifactIds": ["mcdm.heroes.v1/condition/alpha", "mcdm.heroes.v1/condition/alpha"], "subQuestions": ["s1"], "oneRuling": True, "kind": "ambiguity"}],
            "dropped": [{"question": "dead", "why": "pin"}]}}}}
        deck = self.root / "mined"
        n, m = build_deck.from_mine(str(deck), mine_out, str(self.manifest))
        self.assertEqual((n, m), (1, 1))
        sil = json.loads((deck / "silences.json").read_text())
        self.assertEqual(sil[0]["sourceArtifactIds"], ["mcdm.heroes.v1/condition/alpha"])
        self.assertEqual(json.loads((deck / "mine" / "dropped.json").read_text())["dropped"][0]["why"], "pin")
        recut_out = {"mode": "recut", "residue": [{"question": "Residue Q?", "group": "G (refuted card abc)", "sourceArtifactIds": ["mcdm.heroes.v1/condition/beta"], "kind": "silence", "fromCard": "abc"}],
                     "settledElsewhere": [{"topic": "t", "settledBy": "R-0001", "fromCard": "abc"}], "mergeDropped": []}
        deck2 = self.root / "residue"
        n, m = build_deck.from_recut(str(deck2), str(deck), recut_out, str(self.manifest))
        self.assertEqual((n, m), (1, 1))
        sil2 = json.loads((deck2 / "silences.json").read_text())
        self.assertEqual(sil2[0]["group"], "G")
        self.assertEqual(sil2[0]["recutFrom"], "abc")
        self.assertEqual(json.loads((deck2 / "settled-elsewhere.json").read_text())["count"], 1)

    def test_from_recut_with_no_residue_writes_only_settled(self):
        deck = self.root / "residue"
        n, m = build_deck.from_recut(str(deck), "/x/deck-01", {"mode": "recut", "residue": [], "settledElsewhere": []}, str(self.manifest))
        self.assertEqual((n, m), (0, 0))
        self.assertTrue((deck / "settled-elsewhere.json").exists())
        self.assertFalse((deck / "silences.json").exists())
