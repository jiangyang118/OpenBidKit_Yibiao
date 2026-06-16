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
    project_workspace,
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

    def test_plan_summary_classifies_required_and_optional_plan_work(self):
        summary = plan_summary()

        self.assertTrue(summary["exists"])
        self.assertGreater(summary["heading_count"], 5)
        self.assertIn("### 5.2 Agent 原生操作接口", summary["headings"])
        self.assertEqual(summary["pending_markers"], summary["required_pending_markers"])
        self.assertEqual(summary["required_pending_markers"], 0)
        self.assertGreater(summary["optional_enhancement_markers"], 0)
        self.assertEqual(summary["completion_status"], "required-complete")
        self.assertTrue(any("MinerU" in note for note in summary["external_dependency_notes"]))

    def test_smoke_command_specs_wrap_real_commands(self):
        specs = smoke_command_specs()

        self.assertIn("main-syntax", specs)
        self.assertEqual(specs["main-syntax"].command[:2], ["node", "--check"])
        self.assertIn("client-unit", specs)
        self.assertEqual(specs["client-unit"].command, ["npm", "run", "test:unit"])

    def test_project_workspace_wraps_real_store(self):
        with TemporaryDirectory() as temp_dir:
            user_data = Path(temp_dir) / "user-data"

            initial = project_workspace("list", user_data=user_data)
            self.assertTrue(initial["ok"], initial.get("stderr"))
            self.assertEqual(initial["result"]["active_project_id"], "default")
            self.assertEqual(initial["result"]["projects"][0]["name"], "默认项目")

            created = project_workspace("create", user_data=user_data, name="医院后勤投标", description="独立测试项目", make_active=True)
            self.assertTrue(created["ok"], created.get("stderr"))
            self.assertEqual(created["result"]["project"]["name"], "医院后勤投标")
            self.assertEqual(created["result"]["state"]["active_project_id"], created["result"]["project"]["id"])
            project_id = created["result"]["project"]["id"]

            workspace_path = project_workspace("get-workspace-path", user_data=user_data, project_id=project_id)
            self.assertTrue(workspace_path["ok"], workspace_path.get("stderr"))
            self.assertTrue(workspace_path["result"]["workspace_path"].endswith(f"projects/{project_id}/workspace"))

            duplicated = project_workspace("duplicate", user_data=user_data, project_id=project_id, name="医院后勤投标 副本")
            self.assertTrue(duplicated["ok"], duplicated.get("stderr"))
            self.assertEqual(duplicated["result"]["source_project_id"], project_id)
            copy_id = duplicated["result"]["project"]["id"]

            package_dir = Path(temp_dir) / "project-package"
            exported = project_workspace("export-package", user_data=user_data, project_id=project_id, package_dir=package_dir)
            self.assertTrue(exported["ok"], exported.get("stderr"))
            self.assertTrue((package_dir / "project.json").exists())

            imported = project_workspace("import-package", user_data=user_data, package_dir=package_dir, name="导入项目", make_active=True)
            self.assertTrue(imported["ok"], imported.get("stderr"))
            self.assertEqual(imported["result"]["project"]["name"], "导入项目")
            self.assertEqual(imported["result"]["state"]["active_project_id"], imported["result"]["project"]["id"])

            archived = project_workspace("archive", user_data=user_data, project_id=copy_id)
            self.assertTrue(archived["ok"], archived.get("stderr"))
            archived_project = next(project for project in archived["result"]["state"]["projects"] if project["id"] == copy_id)
            self.assertEqual(archived_project["status"], "archived")

            restored = project_workspace("restore", user_data=user_data, project_id=copy_id)
            self.assertTrue(restored["ok"], restored.get("stderr"))
            restored_project = next(project for project in restored["result"]["state"]["projects"] if project["id"] == copy_id)
            self.assertEqual(restored_project["status"], "active")

            active = project_workspace("set-active", user_data=user_data, project_id=project_id)
            self.assertTrue(active["ok"], active.get("stderr"))
            self.assertEqual(active["result"]["active_project_id"], project_id)

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

    def test_export_report_wraps_real_business_bid_builders(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            state_path = root / "business-bid-state.json"
            markdown_path = root / "business-bid-report.md"
            xlsx_path = root / "business-bid-report.xlsx"
            state_path.write_text(json.dumps({
                "source": {"fileName": "招标文件.docx", "type": "tender-document", "generatedAt": "2026-06-15 10:00"},
                "clauses": [{
                    "id": "clause-1",
                    "category": "contract",
                    "label": "合同条款",
                    "originalText": "付款周期为验收后30日内。",
                    "responseText": "完全响应。",
                    "deviationType": "none",
                    "riskLevel": "low",
                    "materialRequirement": "合同响应说明",
                    "owner": "商务负责人",
                    "confirmedBy": "项目经理",
                    "confirmed": True,
                }],
                "attachments": [{
                    "kind": "qualification",
                    "fileName": "资质证书.pdf",
                    "status": "ready",
                    "owner": "资料员",
                    "fileSize": 2048,
                    "note": "已核验",
                }],
            }, ensure_ascii=False), encoding="utf-8")

            markdown_result = export_report("business-bid", state_path, markdown_path)
            xlsx_result = export_report("business-bid", state_path, xlsx_path, format="xlsx")

            self.assertTrue(markdown_result["ok"], markdown_result.get("stderr"))
            self.assertTrue(xlsx_result["ok"], xlsx_result.get("stderr"))
            self.assertEqual(xlsx_result["format"], "xlsx")
            self.assertIn("# 商务标响应交付包", markdown_path.read_text(encoding="utf-8"))
            with zipfile.ZipFile(xlsx_path) as archive:
                workbook_xml = archive.read("xl/workbook.xml").decode("utf-8")
                first_sheet = archive.read("xl/worksheets/sheet1.xml").decode("utf-8")
            self.assertIn("商务响应表", workbook_xml)
            self.assertIn("付款周期为验收后30日内。", first_sheet)

    def test_export_report_wraps_real_ai_evaluation_builders(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            state_path = root / "ai-evaluation-state.json"
            docx_path = root / "ai-evaluation-report.docx"
            xlsx_path = root / "ai-evaluation-report.xlsx"
            state_path.write_text(json.dumps({
                "source": {"fileName": "评分办法.docx", "type": "technical-plan", "generatedAt": "2026-06-15 10:00"},
                "items": [{
                    "id": "item-1",
                    "category": "technical",
                    "title": "实施方案完整性",
                    "maxScore": 10,
                    "ruleScore": 8,
                    "manualScore": 8,
                    "finalScore": 8,
                    "riskLevel": "medium",
                    "confirmed": False,
                    "evidence": "方案包含组织架构和进度计划。",
                    "deductionReason": "售后细节不足。",
                    "reviewNote": "待补充售后说明。",
                }],
                "bidDocuments": [{"id": "bid-1", "fileName": "投标文件A.docx"}],
                "bidScoreSummaries": [{
                    "fileName": "投标文件A.docx",
                    "itemCount": 1,
                    "totalFinalScore": 8,
                    "totalMaxScore": 10,
                    "highRiskCount": 0,
                    "conclusion": "建议复核后通过",
                }],
                "expertScores": [{
                    "itemId": "item-1",
                    "reviewSession": "第一次评审会",
                    "expertName": "张三",
                    "expertRole": "技术专家",
                    "score": 8,
                    "signatureConfirmed": True,
                    "opinion": "基本合理",
                    "updatedAt": "2026-06-15 10:30",
                }],
            }, ensure_ascii=False), encoding="utf-8")

            docx_result = export_report("ai-evaluation", state_path, docx_path, format="docx")
            xlsx_result = export_report("ai-evaluation", state_path, xlsx_path, format="xlsx")

            self.assertTrue(docx_result["ok"], docx_result.get("stderr"))
            self.assertTrue(xlsx_result["ok"], xlsx_result.get("stderr"))
            with zipfile.ZipFile(docx_path) as archive:
                document_xml = archive.read("word/document.xml").decode("utf-8")
            self.assertIn("AI 评标正式报告", document_xml)
            self.assertIn("实施方案完整性", document_xml)
            with zipfile.ZipFile(xlsx_path) as archive:
                workbook_xml = archive.read("xl/workbook.xml").decode("utf-8")
            self.assertIn("评分明细", workbook_xml)

    def test_export_report_wraps_real_bid_opportunity_report_builder(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            state_path = root / "bid-opportunity-state.json"
            output_path = root / "bid-opportunity-report.md"
            state_path.write_text(json.dumps({
                "opportunities": [{
                    "id": "opp-1",
                    "title": "智慧食堂改造项目",
                    "status": "tracking",
                    "score": 86,
                    "recommendation": "建议重点跟进",
                    "owner": "销售负责人",
                    "nextAction": "补充类似业绩",
                    "reminderAt": "2026-06-20 09:00",
                    "parsedFields": {
                        "buyer": "某职业学院",
                        "budget": "200万元",
                        "region": "北京",
                        "bidDeadline": "2026-06-30",
                    },
                    "risks": [{"level": "medium", "text": "工期较紧"}],
                }],
            }, ensure_ascii=False), encoding="utf-8")

            result = export_report("bid-opportunity", state_path, output_path)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertEqual(result["kind"], "bid-opportunity")
            markdown = output_path.read_text(encoding="utf-8")
            self.assertIn("# 投标机会建议报告", markdown)
            self.assertIn("智慧食堂改造项目", markdown)

    def test_export_report_rejects_unsupported_kind_format_pair(self):
        with TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "bid-opportunity-state.json"
            output_path = Path(temp_dir) / "bid-opportunity-report.xlsx"
            state_path.write_text(json.dumps({"opportunities": []}), encoding="utf-8")

            result = export_report("bid-opportunity", state_path, output_path, format="xlsx")

            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "unknown_report_format")
            self.assertEqual(result["available_formats"], ["md"])


if __name__ == "__main__":
    unittest.main()
