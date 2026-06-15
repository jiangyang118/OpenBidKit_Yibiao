import json
import os
import shutil
import subprocess
import sys
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory


class InstalledCliE2ETests(unittest.TestCase):
    def setUp(self):
        self.command = (
            os.environ.get("CLI_ANYTHING_OPENBIDKIT_YIBIAO_COMMAND")
            or shutil.which("cli-anything-openbidkit-yibiao")
            or str(Path(sys.prefix).resolve() / "bin" / "cli-anything-openbidkit-yibiao")
        )
        if not Path(self.command).exists():
            self.command = ""
        if not self.command:
            self.skipTest("cli-anything-openbidkit-yibiao is not installed")

    def run_json(self, *args):
        completed = subprocess.run(
            [self.command, "--json", *args],
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        return json.loads(completed.stdout)

    def test_status_command_outputs_json(self):
        payload = self.run_json("status")

        self.assertEqual(payload["software"], "OpenBidKit_Yibiao")
        self.assertTrue(payload["client"]["package_exists"])
        self.assertIn("test", payload["client"]["scripts"])

    def test_plan_summary_command_outputs_json(self):
        payload = self.run_json("plan-summary")

        self.assertTrue(payload["exists"])
        self.assertGreater(payload["heading_count"], 5)

    def test_smoke_runs_real_node_syntax_check(self):
        payload = self.run_json("smoke", "--check", "main-syntax", "--timeout", "60")

        self.assertTrue(payload["ok"])
        self.assertEqual(payload["results"][0]["command"][:2], ["node", "--check"])
        self.assertEqual(payload["results"][0]["returncode"], 0)

    def test_list_tasks_command_outputs_json(self):
        payload = self.run_json("list-tasks")

        self.assertTrue(payload["ok"], payload.get("stderr"))
        task_types = {task["type"] for task in payload["tasks"]}
        self.assertIn("duplicate-analysis", task_types)
        self.assertIn("knowledge-base-preparation", task_types)

    def test_start_task_dry_run_command_outputs_plan(self):
        with TemporaryDirectory() as temp_dir:
            payload_path = Path(temp_dir) / "task-payload.json"
            payload_path.write_text(json.dumps({
                "tenderFile": {"file_path": "/tmp/招标文件.docx", "size": 100, "modified_at": 1710000000},
                "bidFiles": [
                    {"file_path": "/tmp/投标文件A.docx", "size": 200, "modified_at": 1710000001},
                ],
            }, ensure_ascii=False), encoding="utf-8")

            payload = self.run_json(
                "start-task",
                "--type",
                "duplicate-analysis",
                "--payload-json",
                str(payload_path),
                "--dry-run",
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertTrue(payload["dry_run"])
            self.assertEqual(payload["type"], "duplicate-analysis")
            self.assertEqual(payload["definition"]["group"], "duplicate-check")
            self.assertTrue(payload["payload_signature"])
            self.assertTrue(payload["side_effect_free"])

    def test_export_report_command_outputs_markdown(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            state_path = root / "rejection-state.json"
            output_path = root / "rejection-report.md"
            state_path.write_text(json.dumps({
                "tenderDocument": {"fileName": "招标文件.docx"},
                "bidDocuments": [{
                    "id": "bid-1",
                    "fileName": "投标文件A.docx",
                    "content": "# 投标文件\n## 授权文件\n授权书将在中标后补充。",
                }],
                "invalidBidAndRejectionItems": {"status": "success", "content": "授权书缺失将废标。"},
                "rejectionCheckResult": {
                    "status": "success",
                    "findings": [{
                        "id": "risk-1",
                        "bidDocumentId": "bid-1",
                        "type": "rejectionItem",
                        "severity": "high",
                        "title": "授权书缺失",
                        "requirement": "授权书缺失将废标。",
                        "bidEvidence": "授权书将在中标后补充。",
                        "riskReason": "未随投标文件提交授权书。",
                        "suggestion": "补充授权书。",
                    }],
                },
                "typoCheckResult": {"status": "success", "findings": []},
                "logicCheckResult": {"status": "success", "findings": []},
            }, ensure_ascii=False), encoding="utf-8")

            payload = self.run_json(
                "export-report",
                "--kind",
                "rejection",
                "--state-json",
                str(state_path),
                "--output",
                str(output_path),
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertEqual(payload["kind"], "rejection")
            self.assertTrue(output_path.exists())
            markdown = output_path.read_text(encoding="utf-8")
            self.assertIn("# 废标项检查报告", markdown)
            self.assertIn("## 证据定位明细", markdown)

    def test_export_report_command_outputs_word_docx(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            state_path = root / "rejection-state.json"
            output_path = root / "rejection-report.docx"
            state_path.write_text(json.dumps({
                "tenderDocument": {"fileName": "招标文件.docx"},
                "bidDocuments": [{
                    "id": "bid-1",
                    "fileName": "投标文件A.docx",
                    "content": "# 投标文件\n## 授权文件\n授权书将在中标后补充。",
                }],
                "invalidBidAndRejectionItems": {"status": "success", "content": "授权书缺失将废标。"},
                "rejectionCheckResult": {
                    "status": "success",
                    "findings": [{
                        "id": "risk-1",
                        "bidDocumentId": "bid-1",
                        "type": "rejectionItem",
                        "severity": "high",
                        "title": "授权书缺失",
                        "requirement": "授权书缺失将废标。",
                        "bidEvidence": "授权书将在中标后补充。",
                        "riskReason": "未随投标文件提交授权书。",
                        "suggestion": "补充授权书。",
                    }],
                },
                "typoCheckResult": {"status": "success", "findings": []},
                "logicCheckResult": {"status": "success", "findings": []},
            }, ensure_ascii=False), encoding="utf-8")

            payload = self.run_json(
                "export-report",
                "--kind",
                "rejection",
                "--state-json",
                str(state_path),
                "--output",
                str(output_path),
                "--format",
                "docx",
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertEqual(payload["kind"], "rejection")
            self.assertEqual(payload["format"], "docx")
            self.assertGreater(payload["bytes"], 0)
            self.assertTrue(output_path.exists())
            with zipfile.ZipFile(output_path) as archive:
                document_xml = archive.read("word/document.xml").decode("utf-8")
            self.assertIn("废标项检查报告", document_xml)
            self.assertIn("证据定位明细", document_xml)

    def test_export_report_command_outputs_pdf(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            state_path = root / "rejection-state.json"
            output_path = root / "rejection-report.pdf"
            state_path.write_text(json.dumps({
                "tenderDocument": {"fileName": "招标文件.docx"},
                "bidDocuments": [{
                    "id": "bid-1",
                    "fileName": "投标文件A.docx",
                    "content": "# 投标文件\n## 授权文件\n授权书将在中标后补充。",
                }],
                "invalidBidAndRejectionItems": {"status": "success", "content": "授权书缺失将废标。"},
                "rejectionCheckResult": {
                    "status": "success",
                    "findings": [{
                        "id": "risk-1",
                        "bidDocumentId": "bid-1",
                        "type": "rejectionItem",
                        "severity": "high",
                        "title": "授权书缺失",
                        "requirement": "授权书缺失将废标。",
                        "bidEvidence": "授权书将在中标后补充。",
                        "riskReason": "未随投标文件提交授权书。",
                        "suggestion": "补充授权书。",
                    }],
                },
                "typoCheckResult": {"status": "success", "findings": []},
                "logicCheckResult": {"status": "success", "findings": []},
            }, ensure_ascii=False), encoding="utf-8")

            payload = self.run_json(
                "export-report",
                "--kind",
                "rejection",
                "--state-json",
                str(state_path),
                "--output",
                str(output_path),
                "--format",
                "pdf",
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertEqual(payload["kind"], "rejection")
            self.assertEqual(payload["format"], "pdf")
            self.assertGreater(payload["bytes"], 0)
            self.assertTrue(output_path.exists())
            pdf = output_path.read_bytes()
            self.assertEqual(pdf[:5].decode("ascii"), "%PDF-")
            self.assertIn(b"/BaseFont /STSong-Light", pdf)


if __name__ == "__main__":
    unittest.main()
