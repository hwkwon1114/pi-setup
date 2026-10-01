#!/usr/bin/env python3
"""Offline source-contract regression. Not model behavior or runtime enforcement."""
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]


def policy_errors(global_text, skill_text, guide_text, reviewer_text):
    errors = set()
    requirements = {
        "restore": (global_text, "after compaction/resumption"),
        "relevance": (global_text, "Before implementing a new investigation"),
        "wait": (global_text, "Wait for the verdict and resolve launch-blocking findings before execution."),
        "stale": (global_text, "An absent, failed or stale review is not approval."),
        "fixture": (global_text, "repeated fixtures must not become an unreviewed training campaign"),
        "review-routing": (global_text, "only if approved, otherwise await reset"),
        "skill-link": (skill_text, "[research control](references/research-control.md)"),
        "gate-a": (guide_text, "Gate A: scientific alignment before implementation"),
        "gate-b": (guide_text, "Gate B: execution readiness"),
        "researcher-change": (guide_text, "Explicit researcher changes can"),
        "handoff": (guide_text, "Pass delegates the objective/state paths and versions"),
        "review-blockers": (reviewer_text, "Use `CHANGES_REQUESTED` for unresolved launch blockers."),
        "numerical-contract": (reviewer_text, "actual project's"),
    }
    for key, (text, required) in requirements.items():
        if required not in text:
            errors.add(key)
    portable = global_text + skill_text + guide_text + reviewer_text
    if "/data/pxl1051" in portable or "TARGET_AND_ANCHOR_CONTRACT.md" in reviewer_text:
        errors.add("environment-leak")
    if "use Luna for first-pass triage" in skill_text:
        errors.add("duplicate-routing")
    if "Verify pure CPU `float64` execution standards." in reviewer_text:
        errors.add("universal-numerics")
    return errors


class ResearchControlSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.global_text = (ROOT / "config/AGENTS.md").read_text()
        cls.skill_text = (ROOT / "skills/research-workflow/SKILL.md").read_text()
        cls.guide_text = (ROOT / "skills/research-workflow/references/research-control.md").read_text()
        cls.reviewer_text = (ROOT / "agents/astra-code-reviewer.md").read_text()

    def errors(self, global_text=None, skill_text=None, guide_text=None, reviewer_text=None):
        return policy_errors(
            self.global_text if global_text is None else global_text,
            self.skill_text if skill_text is None else skill_text,
            self.guide_text if guide_text is None else guide_text,
            self.reviewer_text if reviewer_text is None else reviewer_text,
        )

    def test_current_contract(self):
        self.assertEqual(self.errors(), set())

    def test_missing_wait_rejected(self):
        text = self.global_text.replace(
            "Wait for the verdict and resolve launch-blocking findings before execution.", ""
        )
        self.assertIn("wait", self.errors(global_text=text))

    def test_missing_stale_guard_rejected(self):
        text = self.global_text.replace("An absent, failed or stale review is not approval.", "")
        self.assertIn("stale", self.errors(global_text=text))

    def test_environment_leak_rejected(self):
        self.assertIn("environment-leak", self.errors(guide_text=self.guide_text + "/data/pxl1051"))

    def test_duplicate_routing_rejected(self):
        self.assertIn("duplicate-routing", self.errors(skill_text=self.skill_text + "use Luna for first-pass triage"))

    def test_universal_numeric_recipe_rejected(self):
        self.assertIn("universal-numerics", self.errors(
            reviewer_text=self.reviewer_text + "Verify pure CPU `float64` execution standards."
        ))

    def test_fixture_boundary_preserved(self):
        self.assertIn("fixture", self.errors(global_text=self.global_text.replace(
            "repeated fixtures must not become an unreviewed training campaign", ""
        )))

    def test_cases_are_prompts_not_answers(self):
        fixture = json.loads((ROOT / "tests/research-control-cases.json").read_text())
        self.assertEqual(fixture["version"], 1)
        rows = fixture["cases"]
        ids = [row["id"] for row in rows]
        self.assertEqual(len(ids), 8)
        self.assertEqual(len(set(ids)), len(ids))
        self.assertTrue(all(set(row) == {"id", "prompt"} and row["prompt"] for row in rows))
        self.assertEqual(set(ids), {
            "prediction_not_identification", "unrelated_sweep", "supporting_diagnostic",
            "summary_restore", "stale_review", "quota_block",
            "researcher_changes_objective", "ordinary_edit",
        })


if __name__ == "__main__":
    # Optional root supports an isolated staged setup; default works from any cwd.
    if len(sys.argv) > 1:
        ROOT = Path(sys.argv.pop(1)).resolve()
    unittest.main()
