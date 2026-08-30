import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


TOOLS = Path(__file__).resolve().parents[1]
BUILD = TOOLS / "build_ruling_set.py"
VERIFY = TOOLS / "verify_quotes.py"
SURFACE = TOOLS / "ruling_surface.py"
APPLY_QUOTE_QUARANTINE = TOOLS / "apply_quote_quarantine.py"
BUILD_CORPUS_MAP = TOOLS / "build_corpus_map.py"
SAFETY = TOOLS / "common-actions-ruling-safety.json"


class CommonActionSafetyManifestTests(unittest.TestCase):
    def test_exact_audit_quarantine_is_frozen(self):
        expected = {
            "d62478e95db4",
            "fcde12f9c723",
            "b3240c58ad78",
            "f76207c62dc1",
            "bf4cbc141ad0",
            "587b06f5b974",
            "1384821bd1f1",
            "f753d091f24f",
            "e11c2b1e5847",
            "2b287c93862f",
            "7be3b72f60d3",
            "3843a5c027af",
            "5a8b19296f97",
            "3e8c328d28bc",
        }
        manifest = json.loads(SAFETY.read_text(encoding="utf-8"))
        dispositions = manifest["dispositions"]

        self.assertEqual({entry["qid"] for entry in dispositions}, expected)
        self.assertEqual(len(dispositions), 14)
        self.assertNotIn("68579235ec80", expected)
        self.assertTrue(all(entry["disposition"] == "quarantined" for entry in dispositions))
        self.assertTrue(all(entry["reasonCode"] and entry["reason"] for entry in dispositions))


class ToolFixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def write_json(self, name, value):
        path = self.root / name
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def run_tool(self, tool, *paths):
        return subprocess.run(
            [sys.executable, str(tool), *(str(path) for path in paths)],
            text=True,
            capture_output=True,
            check=False,
        )


class BuildRulingSetTests(ToolFixture):
    def run_build(self, answers, silences, dispositions=None):
        answers_path = self.write_json("answers.json", answers)
        silences_path = self.write_json("silences.json", silences)
        dispositions_path = self.write_json(
            "dispositions.json",
            {"schema": "test", "dispositions": dispositions or []},
        )
        review_path = self.root / "review.json"
        ledger_path = self.root / "ledger.json"
        quote_path = self.write_json(
            "quote.json",
            {"schema": "test", "claims": 0, "problemFragments": 0, "quarantines": []},
        )
        result = self.run_tool(
            BUILD,
            answers_path,
            silences_path,
            dispositions_path,
            review_path,
            ledger_path,
            quote_path,
        )
        return (
            result,
            json.loads(review_path.read_text(encoding="utf-8")) if review_path.exists() else None,
            json.loads(ledger_path.read_text(encoding="utf-8")) if ledger_path.exists() else None,
        )

    def test_malformed_answer_and_closed_vocabulary_fail_without_output(self):
        question = "Malformed"
        result, review, ledger = self.run_build(
            {
                "answers": [
                    {
                        "question": question,
                        "answer": "Looks plausible.",
                        "basis": "bogus",
                        "evidence": "",
                        "reasoning": "",
                        "confidence": "high",
                        "consequenceIfWrong": "",
                    }
                ],
                "findings": [],
            },
            [{"question": question}],
        )

        self.assertEqual(result.returncode, 2)
        self.assertIsNone(review)
        self.assertIsNone(ledger)

    def test_malformed_finding_cannot_leave_answer_settled(self):
        question = "Valid answer, invalid finding"
        answer = {
            "question": question,
            "answer": "Answer.",
            "basis": "derived",
            "evidence": "",
            "reasoning": "Reason.",
            "confidence": "high",
            "consequenceIfWrong": "Consequence.",
        }
        result, review, ledger = self.run_build(
            {
                "answers": [answer],
                "findings": [
                    {"question": question, "problem": "Problem.", "correctedBasis": "bogus"}
                ],
            },
            [{"question": question}],
        )

        self.assertEqual(result.returncode, 1)
        self.assertTrue(ledger["blocked"])
        self.assertEqual(ledger["settled"], 0)
        self.assertTrue(review[0]["settlementBlocked"])

    def test_duplicate_findings_are_preserved_and_block_settlement(self):
        question = "Does this **rule** apply? [S1]"
        answer = {
            "question": question,
            "answer": "Yes.",
            "basis": "derived",
            "evidence": 'The text says "yes".',
            "reasoning": "Reason.",
            "confidence": "high",
            "consequenceIfWrong": "Wrong behavior.",
        }
        findings = [
            {
                "question": question,
                "problem": "First independent problem.",
                "correctedBasis": "derived",
            },
            {
                "question": question,
                "problem": "Second independent problem.",
                "correctedBasis": "needs-user",
            },
        ]

        result, review, ledger = self.run_build(
            {"answers": [answer], "findings": findings},
            [{"question": question}],
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(ledger["blocked"])
        self.assertEqual(ledger["settled"], 0)
        self.assertEqual(len(review), 1)
        self.assertEqual(len(review[0]["findings"]), 2)
        self.assertIn("First independent problem.", review[0]["refutation"])
        self.assertIn("Second independent problem.", review[0]["refutation"])

    def test_unmatched_finding_fails_closed_without_fuzzy_attachment(self):
        question = "Which exact action is legal? [S1]"
        answer = {
            "question": question,
            "answer": "This one.",
            "basis": "printed",
            "evidence": "",
            "reasoning": "Reason.",
            "confidence": "high",
            "consequenceIfWrong": "Wrong behavior.",
        }

        result, review, ledger = self.run_build(
            {
                "answers": [answer],
                "findings": [
                    {
                        "question": "Which vaguely similar action is legal?",
                        "problem": "This must not land on the exact-action card.",
                        "correctedBasis": "needs-user",
                    }
                ],
            },
            [{"question": question}],
        )

        self.assertEqual(result.returncode, 1)
        self.assertTrue(ledger["blocked"])
        self.assertEqual(ledger["settled"], 0)
        self.assertEqual(len(ledger["joinErrors"]), 1)
        self.assertEqual(review[0]["findings"], [])
        self.assertTrue(review[0]["settlementBlocked"])

    def test_surviving_finding_is_retained_on_settled_row(self):
        question = "A corrected provenance question"
        answer = {
            "question": question,
            "answer": "The substantive answer survives.",
            "basis": "printed",
            "evidence": "",
            "reasoning": "Reason.",
            "confidence": "high",
            "consequenceIfWrong": "Wrong behavior.",
        }
        finding = {
            "question": question,
            "problem": "The basis needs correction, but the answer survives.",
            "correctedBasis": "derived",
            "fabricatedQuote": False,
        }

        result, review, ledger = self.run_build(
            {"answers": [answer], "findings": [finding]},
            [{"question": question}],
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(review, [])
        self.assertEqual(ledger["settled"], 1)
        self.assertEqual(ledger["rows"][0]["basis"], "derived")
        self.assertEqual(len(ledger["rows"][0]["findings"]), 1)
        self.assertTrue(ledger["rows"][0]["refuted"])

    def test_finding_without_corrected_basis_is_unsettled(self):
        question = "Finding omitted its disposition"
        answer = {
            "question": question,
            "answer": "Answer.",
            "basis": "derived",
            "evidence": "",
            "reasoning": "Reason.",
            "confidence": "high",
            "consequenceIfWrong": "Consequence.",
        }
        finding = {"question": question, "problem": "Material problem."}

        result, review, ledger = self.run_build(
            {"answers": [answer], "findings": [finding]},
            [{"question": question}],
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(ledger["settled"], 0)
        self.assertIn("finding-without-corrected-basis", review[0]["settlementBlockReasons"])

    def test_qid_and_quarantine_disposition_are_emitted_and_enforced(self):
        question = "A quarantined question"
        qid = hashlib.sha256(question.encode()).hexdigest()[:12]
        answer = {
            "question": question,
            "answer": "Unsafe answer.",
            "basis": "derived",
            "evidence": "",
            "reasoning": "Reason.",
            "confidence": "high",
            "consequenceIfWrong": "Wrong behavior.",
        }

        result, review, ledger = self.run_build(
            {"answers": [answer], "findings": []},
            [{"question": question}],
            [
                {
                    "qid": qid,
                    "disposition": "quarantined",
                    "reasonCode": "unsafe-test-settlement",
                    "reason": "Regression fixture.",
                }
            ],
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(ledger["settled"], 0)
        self.assertEqual(review[0]["qid"], qid)
        self.assertEqual(review[0]["disposition"], "quarantined")
        self.assertIn("quarantined", review[0]["settlementBlockReasons"])


class RulingSurfaceTests(ToolFixture):
    def run_surface(self, questions, sources):
        questions_path = self.write_json("questions.json", questions)
        sources_path = self.write_json("sources.json", sources)
        output_path = self.root / "review.html"
        result = self.run_tool(SURFACE, questions_path, sources_path, output_path)
        return result, output_path

    def test_missing_source_fails_closed_without_output(self):
        result, output = self.run_surface(
            [{"question": "What is printed?", "sourceArtifactIds": ["missing"]}],
            [],
        )

        self.assertEqual(result.returncode, 2)
        self.assertIn("missing source artifacts: missing", result.stderr)
        self.assertFalse(output.exists())

    def test_card_without_evidence_fails_closed(self):
        result, output = self.run_surface([{"question": "Evidence free"}], [])

        self.assertEqual(result.returncode, 2)
        self.assertIn("sourceArtifactIds must be a non-empty array", result.stderr)
        self.assertFalse(output.exists())

    def test_duplicate_question_identity_fails_instead_of_aliasing_ui_state(self):
        question = "A repeated question"
        result, output = self.run_surface(
            [
                {"question": question, "sourceArtifactIds": ["source"]},
                {"question": question, "sourceArtifactIds": ["source"]},
            ],
            [
                {
                    "id": "source",
                    "versionSha256": "version",
                    "sourcePath": "source.md",
                    "text": "Evidence.",
                }
            ],
        )

        self.assertEqual(result.returncode, 2)
        self.assertIn("duplicate question/qid", result.stderr)
        self.assertFalse(output.exists())

    def test_surface_uses_canonical_qid_and_does_not_double_advance_filtered_view(self):
        question = "A unique question"
        qid = hashlib.sha256(question.encode()).hexdigest()[:12]
        result, output = self.run_surface(
            [{"question": question, "sourceArtifactIds": ["source"]}],
            [
                {
                    "id": "source",
                    "versionSha256": "version",
                    "sourcePath": "source.md",
                    "text": "Evidence.",
                }
            ],
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        rendered = output.read_text(encoding="utf-8")
        self.assertIn(f'"qid": "{qid}"', rendered)
        self.assertIn("focus(cur + (unruledOnly ? 0 : 1))", rendered)


class UserRulingQuoteQuarantineTests(ToolFixture):
    def test_uncertified_user_ruling_is_retained_but_not_valid(self):
        question = "Bad evidence"
        qid = hashlib.sha256(question.encode()).hexdigest()[:12]
        ok_question = "Exact evidence"
        ok_qid = hashlib.sha256(ok_question.encode()).hexdigest()[:12]
        evidence = 'Claimed "not present".'
        rulings = self.write_json(
            "rulings.json",
            {
                "schema": "test",
                "userRuled": [
                    {"qid": qid, "ruling": "Keep this history."},
                    {"qid": ok_qid},
                ],
            },
        )
        claims = self.write_json(
            "claims.json",
            {
                "answers": [
                    {"question": question, "evidence": evidence},
                    {"question": ok_question, "evidence": '"Actual text."'},
                ],
                "findings": [],
            },
        )
        corpus = self.write_json("corpus.json", [{"id": "source", "text": "Actual text."}])
        manifest = self.write_json(
            "quote.json",
            {
                "quarantines": [
                    {
                        "qid": qid,
                        "reasonCode": "uncertified-quoted-evidence",
                        "problemFragments": 1,
                        "evidenceSha256": hashlib.sha256(evidence.encode()).hexdigest(),
                    }
                ],
                "claims": 1,
                "problemFragments": 1,
            },
        )
        output = self.root / "output.json"

        result = self.run_tool(
            APPLY_QUOTE_QUARANTINE, rulings, claims, manifest, output, corpus
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual([row["qid"] for row in data["userRuled"]], [ok_qid])
        self.assertEqual(data["quoteQuarantined"][0]["ruling"], "Keep this history.")
        self.assertEqual(data["quoteQuarantined"][0]["quoteProblemFragments"], 1)

        stale_manifest = self.write_json(
            "stale.json",
            {"quarantines": [], "claims": 0, "problemFragments": 0},
        )
        stale_output = self.root / "stale-output.json"
        stale = self.run_tool(
            APPLY_QUOTE_QUARANTINE,
            rulings,
            claims,
            stale_manifest,
            stale_output,
            corpus,
        )
        self.assertEqual(stale.returncode, 2)
        self.assertFalse(stale_output.exists())

        absent_rulings = self.write_json(
            "absent-rulings.json",
            {"userRuled": [{"qid": "not-audited"}]},
        )
        absent_output = self.root / "absent-output.json"
        absent = self.run_tool(
            APPLY_QUOTE_QUARANTINE,
            absent_rulings,
            claims,
            manifest,
            absent_output,
            corpus,
        )
        self.assertEqual(absent.returncode, 2)
        self.assertIn("absent from audited answers", absent.stderr)
        self.assertFalse(absent_output.exists())


class CorpusMapTests(ToolFixture):
    def test_pool_b_family_default_cannot_mark_critical_path(self):
        corpus_root = self.root / "corpus-map"
        (corpus_root / "batches").mkdir(parents=True)
        (corpus_root / "rulings").mkdir()
        (corpus_root / "batches" / "batch-01.json").write_text(
            json.dumps(
                {
                    "batch": "batch-01",
                    "artifacts": [{"id": "a", "chapter": "combat", "bytes": 10}],
                }
            ),
            encoding="utf-8",
        )
        (corpus_root / "rulings" / "batch-01.json").write_text(
            json.dumps(
                {
                    "batch": "batch-01",
                    "rows": [
                        {
                            "id": "a",
                            "primary": "engine",
                            "secondaries": [],
                            "spatial": False,
                            "criticalPath": True,
                            "confidence": "high",
                            "justification": "individually reviewed",
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        (corpus_root / "pool-b-preassign.json").write_text(
            json.dumps([{"id": "b", "chapter": "classes", "bytes": 20}]),
            encoding="utf-8",
        )
        (corpus_root / "pool-b-map.json").write_text(
            json.dumps(
                {
                    "familyRules": [{"family": "ability", "criticalPath": True}],
                    "rows": [
                        {
                            "id": "b",
                            "primary": "engine",
                            "secondaries": [],
                            "criticalPath": True,
                            "confidence": "low",
                            "source": "family-rule:ability",
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        (corpus_root / "corpus-map.json").write_text(
            json.dumps(
                {
                    "schema": "test",
                    "authority": "navigational",
                    "canonPin": "pin",
                    "agreementRate": 1,
                }
            ),
            encoding="utf-8",
        )

        spec = importlib.util.spec_from_file_location("build_corpus_map", BUILD_CORPUS_MAP)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        pool_b, output = module.build(corpus_root)
        self.assertEqual([row["criticalPath"] for row in output["rows"]], [True, False])
        self.assertFalse(pool_b["familyRules"][0]["criticalPath"])
        self.assertFalse(pool_b["rows"][0]["criticalPath"])

        pool_b_input = corpus_root / "pool-b-preassign.json"
        pool_b_input.write_text(
            json.dumps([{"id": "a", "chapter": "classes", "bytes": 20}]),
            encoding="utf-8",
        )
        pool_b_map = json.loads((corpus_root / "pool-b-map.json").read_text(encoding="utf-8"))
        pool_b_map["rows"][0]["id"] = "a"
        (corpus_root / "pool-b-map.json").write_text(json.dumps(pool_b_map), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Pool A/B ids overlap"):
            module.build(corpus_root)


class VerifyQuotesTests(ToolFixture):
    def test_empty_or_duplicate_failing_claim_identities_are_rejected(self):
        corpus = self.write_json("corpus.json", [{"id": "source", "text": "actual"}])
        empty = self.write_json("empty.json", {})
        empty_result = self.run_tool(VERIFY, empty, corpus)
        self.assertEqual(empty_result.returncode, 2)

        duplicate = self.write_json(
            "duplicate.json",
            [
                {"question": "same", "evidence": '"missing one"'},
                {"question": "same", "evidence": '"missing two"'},
            ],
        )
        duplicate_result = self.run_tool(VERIFY, duplicate, corpus)
        self.assertEqual(duplicate_result.returncode, 2)
        self.assertIn("multiple failing claim occurrences", duplicate_result.stderr)

    def test_metadata_is_not_searchable_corpus_text_and_failure_is_nonzero(self):
        claims = self.write_json(
            "claims.json",
            [{"question": "metadata probe", "evidence": 'Source says "metadata-only quote".'}],
        )
        corpus = self.write_json(
            "corpus.json",
            [
                {
                    "id": "source",
                    "sourcePath": "metadata-only quote",
                    "text": "Actual corpus prose only.",
                }
            ],
        )

        result = self.run_tool(VERIFY, claims, corpus)

        self.assertEqual(result.returncode, 1)
        self.assertIn("NOT FOUND", result.stdout)
        self.assertIn("1 problem fragments", result.stdout)

    def test_smart_quotes_and_short_fragments_are_checked(self):
        claims = self.write_json(
            "claims.json",
            [{"question": "smart probe", "evidence": "Printed: “A fox.” and “ok”."}],
        )
        corpus = self.write_json(
            "corpus.json",
            [{"id": "source", "text": "A fox. The answer is ok."}],
        )

        result = self.run_tool(VERIFY, claims, corpus)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("fragments: 2", result.stdout)
        self.assertIn("problems: 0", result.stdout)

        bad_short = self.write_json(
            "bad-short.json",
            [{"question": "short probe", "evidence": 'Printed: "no".'}],
        )
        bad_result = self.run_tool(VERIFY, bad_short, corpus)
        self.assertEqual(bad_result.returncode, 1)
        self.assertIn('NOT FOUND: "no"', bad_result.stdout)

    def test_top_level_list_and_answers_findings_shapes_are_supported(self):
        corpus = self.write_json("corpus.json", [{"id": "source", "text": "alpha beta"}])
        list_claims = self.write_json(
            "list.json",
            [{"question": "list", "evidence": 'Printed: "alpha".'}],
        )
        object_claims = self.write_json(
            "object.json",
            {
                "answers": [{"question": "answer", "evidence": 'Printed: "alpha".'}],
                "findings": [{"question": "finding", "evidence": 'Printed: "beta".'}],
            },
        )

        list_result = self.run_tool(VERIFY, list_claims, corpus)
        object_result = self.run_tool(VERIFY, object_claims, corpus)

        self.assertEqual(list_result.returncode, 0, list_result.stdout + list_result.stderr)
        self.assertIn("across 1 claims", list_result.stdout)
        self.assertEqual(object_result.returncode, 0, object_result.stdout + object_result.stderr)
        self.assertIn("across 2 claims", object_result.stdout)

    def test_delinked_labels_and_accepted_bundle_records_are_source_text(self):
        claims = self.write_json(
            "claims.json",
            [{"question": "links", "evidence": 'Printed: "A [free strike] lands".'}],
        )
        corpus = self.write_json(
            "bundle.json",
            {
                "schemaVersion": 1,
                "records": [
                    {
                        "recordKind": "artifact",
                        "id": "source",
                        "text": "A [free strike](scc.v1:rule/free-strike) lands.",
                    }
                ],
            },
        )

        result = self.run_tool(VERIFY, claims, corpus)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("problems: 0", result.stdout)


if __name__ == "__main__":
    unittest.main()
