import json
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

from cli_anything.openbidkit_yibiao.core.backend import (
    CLIENT_ROOT,
    REPO_ROOT,
    export_report,
    list_task_definitions,
    plan_summary,
    project_status,
    smoke_command_specs,
    start_task_dry_run,
)


class CoreBackendTests(unittest.TestCase):
    def test_project_status_reads_real_repo_files(self):
        status = project_status()

        self.assertEqual(status["software"], "OpenBidKit_Yibiao")
        self.assertTrue((REPO_ROOT / "plan.md").exists())
        self.assertTrue(status["client"]["package_exists"])
        self.assertIn("test", status["client"]["scripts"])
        self.assertEqual(status["client"]["root"], str(CLIENT_ROOT))

    def test_plan_summary_exposes_pending_plan_sections(self):
        summary = plan_summary()

        self.assertTrue(summary["exists"])
        self.assertGreater(summary["heading_count"], 5)
        self.assertIn("### 5.2 Agent 原生操作接口", summary["headings"])

    def test_smoke_command_specs_wrap_real_commands(self):
        specs = smoke_command_specs()

        self.assertIn("main-syntax", specs)
        self.assertEqual(specs["main-syntax"].command[:2], ["node", "--check"])
        self.assertIn("client-unit", specs)
        self.assertEqual(specs["client-unit"].command, ["npm", "run", "test:unit"])

    def test_list_task_definitions_wraps_real_task_service(self):
        payload = list_task_definitions()

        self.assertTrue(payload["ok"], payload.get("stderr"))
        task_types = {task["type"] for task in payload["tasks"]}
        self.assertIn("duplicate-analysis", task_types)
        self.assertIn("knowledge-base-preparation", task_types)
        duplicate = next(task for task in payload["tasks"] if task["type"] == "duplicate-analysis")
        self.assertEqual(duplicate["group"], "duplicate-check")
        self.assertEqual(duplicate["lockPolicy"], "group-exclusive")

    def test_start_task_dry_run_uses_real_duplicate_signature(self):
        with TemporaryDirectory() as temp_dir:
            payload_path = Path(temp_dir) / "task-payload.json"
            payload_path.write_text(json.dumps({
                "tenderFile": {"file_path": "/tmp/招标文件.docx", "size": 100, "modified_at": 1710000000},
                "bidFiles": [
                    {"file_path": "/tmp/投标文件A.docx", "size": 200, "modified_at": 1710000001},
                    {"file_path": "/tmp/投标文件B.docx", "size": 300, "modified_at": 1710000002},
                ],
            }, ensure_ascii=False), encoding="utf-8")

            payload = start_task_dry_run("duplicate-analysis", payload_path)

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertTrue(payload["dry_run"])
            self.assertEqual(payload["type"], "duplicate-analysis")
            self.assertEqual(payload["definition"]["group"], "duplicate-check")
            self.assertEqual(payload["storage_key"], "duplicate-analysis")
            self.assertTrue(payload["payload_signature"])
            self.assertTrue(payload["requires_desktop_main"])
            self.assertTrue(payload["side_effect_free"])

    def test_start_task_dry_run_supports_scope_exclusive_knowledge_task(self):
        with TemporaryDirectory() as temp_dir:
            payload_path = Path(temp_dir) / "task-payload.json"
            payload_path.write_text(json.dumps({"scopeId": "doc-1"}, ensure_ascii=False), encoding="utf-8")

            payload = start_task_dry_run("knowledge-base-preparation", payload_path)

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertEqual(payload["type"], "knowledge-base-preparation")
            self.assertEqual(payload["definition"]["group"], "knowledge-base")
            self.assertEqual(payload["definition"]["lockPolicy"], "scope-exclusive")
            self.assertEqual(payload["scope_id"], "doc-1")
            self.assertEqual(payload["storage_key"], "knowledge-base-preparation:doc-1")

    def test_export_report_wraps_real_duplicate_report_builder(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            state_path = root / "duplicate-state.json"
            output_path = root / "duplicate-report.md"
            state_path.write_text(json.dumps({
                "tenderFile": {"file_name": "招标文件.docx"},
                "bidFiles": [{"id": "bid-1", "file_name": "投标文件A.docx"}],
                "contentAnalysis": {
                    "status": "success",
                    "duplicateSentences": [{
                        "id": "C000001",
                        "sentence": "项目团队提供驻场服务。",
                        "normalized": "项目团队提供驻场服务。",
                        "file_ids": ["bid-1"],
                        "occurrences": {"bid-1": 2},
                        "first_order": 1,
                        "resolution_status": "pending",
                    }],
                },
                "imageAnalysis": {"status": "success", "duplicateImages": []},
                "contentIgnoreRules": [],
            }, ensure_ascii=False), encoding="utf-8")

            result = export_report("duplicate", state_path, output_path)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertEqual(result["kind"], "duplicate")
            self.assertEqual(result["format"], "md")
            self.assertTrue(output_path.exists())
            markdown = output_path.read_text(encoding="utf-8")
            self.assertIn("# 标书查重报告", markdown)
            self.assertIn("## 批量处理建议", markdown)

    def test_export_report_wraps_real_duplicate_word_report_builder(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            state_path = root / "duplicate-state.json"
            output_path = root / "duplicate-report.docx"
            state_path.write_text(json.dumps({
                "tenderFile": {"file_name": "招标文件.docx"},
                "bidFiles": [{"id": "bid-1", "file_name": "投标文件A.docx"}],
                "contentAnalysis": {
                    "status": "success",
                    "duplicateSentences": [{
                        "id": "C000001",
                        "sentence": "项目团队提供驻场服务。",
                        "normalized": "项目团队提供驻场服务。",
                        "file_ids": ["bid-1"],
                        "occurrences": {"bid-1": 2},
                        "first_order": 1,
                        "resolution_status": "pending",
                    }],
                },
                "imageAnalysis": {"status": "success", "duplicateImages": []},
                "contentIgnoreRules": [],
            }, ensure_ascii=False), encoding="utf-8")

            result = export_report("duplicate", state_path, output_path, format="docx")

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertEqual(result["kind"], "duplicate")
            self.assertEqual(result["format"], "docx")
            self.assertGreater(result["bytes"], 0)
            self.assertTrue(output_path.exists())
            with zipfile.ZipFile(output_path) as archive:
                document_xml = archive.read("word/document.xml").decode("utf-8")
            self.assertIn("标书查重报告", document_xml)
            self.assertIn("批量处理建议", document_xml)

    def test_export_report_wraps_real_duplicate_pdf_report_builder(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            state_path = root / "duplicate-state.json"
            output_path = root / "duplicate-report.pdf"
            state_path.write_text(json.dumps({
                "tenderFile": {"file_name": "招标文件.docx"},
                "bidFiles": [{"id": "bid-1", "file_name": "投标文件A.docx"}],
                "contentAnalysis": {
                    "status": "success",
                    "duplicateSentences": [{
                        "id": "C000001",
                        "sentence": "项目团队提供驻场服务。",
                        "normalized": "项目团队提供驻场服务。",
                        "file_ids": ["bid-1"],
                        "occurrences": {"bid-1": 2},
                        "first_order": 1,
                        "resolution_status": "pending",
                    }],
                },
                "imageAnalysis": {"status": "success", "duplicateImages": []},
                "contentIgnoreRules": [],
            }, ensure_ascii=False), encoding="utf-8")

            result = export_report("duplicate", state_path, output_path, format="pdf")

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertEqual(result["kind"], "duplicate")
            self.assertEqual(result["format"], "pdf")
            self.assertGreater(result["bytes"], 0)
            self.assertTrue(output_path.exists())
            pdf = output_path.read_bytes()
            self.assertEqual(pdf[:5].decode("ascii"), "%PDF-")
            self.assertIn(b"/BaseFont /STSong-Light", pdf)


if __name__ == "__main__":
    unittest.main()
