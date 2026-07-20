import json
import unittest
import zipfile
from base64 import b64decode
from pathlib import Path
from tempfile import TemporaryDirectory

from cli_anything.openbidkit_yibiao.core.backend import (
    CLIENT_ROOT,
    REPO_ROOT,
    bid_document_analyze_reference,
    bid_document_asset_package,
    bid_document_build_config,
    bid_document_init_config,
    bid_document_import_asset_package,
    bid_document_readiness_report,
    bid_document_sample,
    bid_document_template_info,
    bid_document_validate_config,
    export_report,
    list_task_definitions,
    plan_summary,
    project_workspace,
    project_status,
    smoke_command_specs,
    start_task_dry_run,
)

ONE_PIXEL_PNG = b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")


def write_generic_bid_document_config(root: Path, relative_assets: bool = False) -> Path:
    asset_dir = root / ("generic-bid-document-config.assets" if relative_assets else "assets")
    asset_dir.mkdir(parents=True, exist_ok=True)
    asset_specs = {
        "qualification_scan": ("资质证明扫描件", "supplier-basic-info"),
        "solution_screenshot": ("系统或产品截图", "technical-solution"),
        "contract_case_scan": ("合同案例证明扫描件", "other-materials"),
    }
    asset_map = {}
    for key, (title, section_id) in asset_specs.items():
        file_path = asset_dir / f"{key}.png"
        file_path.write_bytes(ONE_PIXEL_PNG)
        asset_file_path = f"./{asset_dir.name}/{file_path.name}" if relative_assets else str(file_path)
        asset_map[key] = {
            "key": key,
            "title": title,
            "filePath": asset_file_path,
            "type": "image",
            "required": True,
            "sectionId": section_id,
            "templateId": "generic-response",
        }
    config_path = root / "generic-bid-document-config.json"
    config_path.write_text(json.dumps({
        "version": 1,
        "templateId": "generic-response",
        "projectData": {
            "templateId": "generic-response",
            "projectName": "通用完整标书校验项目",
            "purchaserName": "样例采购人",
            "supplierName": "样例供应商",
            "totalWithTax": 300,
            "totalWithoutTax": 265.49,
            "taxPolicy": {
                "softwareHardwareRate": 0.13,
                "serviceRate": 0.06,
            },
            "paymentTerms": [
                {"stage": "到货", "ratio": 50, "text": "设备到现场支付合同总价款的 50%。"},
                {"stage": "验收", "ratio": 50, "text": "设备调试合格后支付合同总价款的 50%。"},
            ],
        },
        "quoteItems": [
            {"name": "样例管理系统", "quantity": 1, "brandModel": "GEN-SYS V1.0", "unitPriceWithTax": 100, "totalWithTax": 100, "taxRate": 0.13, "category": "software"},
            {"name": "样例终端设备", "quantity": 2, "brandModel": "GEN-DEVICE-100", "unitPriceWithTax": 100, "totalWithTax": 200, "taxRate": 0.13, "category": "hardware"},
        ],
        "assetMap": asset_map,
        "assetPackage": {
            "type": "sidecar-directory",
            "path": f"./{asset_dir.name}",
            "copiedCount": len(asset_map),
        } if relative_assets else None,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    return config_path


def assert_complete_template_error_build_log(testcase: unittest.TestCase, build_log: dict, template_id: str = "unknown-response-template") -> None:
    testcase.assertFalse(build_log["passed"])
    testcase.assertFalse(build_log["templateCheck"]["passed"])
    testcase.assertEqual(build_log["templateCheck"]["details"]["templateId"], template_id)
    testcase.assertEqual(build_log["quoteCheck"]["errors"], ["not_run"])
    testcase.assertEqual(build_log["paymentCheck"]["errors"], ["not_run"])
    testcase.assertEqual(build_log["assetCheck"]["errors"], ["not_run"])
    testcase.assertEqual(build_log["docxForbiddenWordsCheck"]["errors"], ["not_run"])
    testcase.assertIn("docxAssetPlacementCheck", build_log)


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
        self.assertEqual(summary["in_progress_markers"], 0)
        self.assertGreater(summary["blocked_count"], 0)
        self.assertGreater(summary["sample_blocked_count"], 0)
        self.assertEqual(summary["capability_blocked_count"], 0)
        self.assertTrue(any("参考 docx 尚未提供" in item for item in summary["blocked_items"]))
        self.assertGreater(summary["optional_enhancement_markers"], 0)
        self.assertEqual(summary["completion_status"], "required-complete-with-sample-blockers")
        self.assertTrue(any("阻塞原因" in note for note in summary["external_dependency_notes"]))

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

    def test_bid_document_sample_wraps_real_word_builder(self):
        with TemporaryDirectory() as temp_dir:
            result = bid_document_sample(Path(temp_dir), template_id="generic-response")

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertEqual(result["template_id"], "generic-response")
            output_path = Path(result["output"])
            log_path = Path(result["log_path"])
            self.assertTrue(output_path.exists())
            self.assertTrue(log_path.exists())
            self.assertGreater(result["bytes"], 0)
            self.assertTrue(result["build_log"]["titleCheck"]["passed"])
            self.assertTrue(result["build_log"]["docxContentCheck"]["passed"])
            self.assertTrue(result["build_log"]["imageInsertionCheck"]["passed"])
            with zipfile.ZipFile(output_path) as archive:
                document_xml = archive.read("word/document.xml").decode("utf-8")
            self.assertIn("响应文件", document_xml)
            self.assertIn("通用完整标书样例项目", document_xml)

    def test_bid_document_reference_analyzer_wraps_real_docx_parser(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            generated = bid_document_sample(root, template_id="generic-response")
            self.assertTrue(generated["ok"], generated.get("stderr"))
            analysis_path = root / "reference-analysis.json"

            result = bid_document_analyze_reference(Path(generated["output"]), output_json=analysis_path, candidate_docx=Path(generated["output"]))

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertTrue(analysis_path.exists())
            analysis = result["analysis"]
            self.assertTrue(analysis["ok"])
            self.assertGreaterEqual(analysis["summary"]["headingCount"], 7)
            self.assertGreaterEqual(analysis["summary"]["tableCount"], 3)
            self.assertGreaterEqual(analysis["summary"]["imageReferenceCount"], 3)
            self.assertGreaterEqual(analysis["summary"]["tocFieldCount"], 1)
            self.assertTrue(analysis["summary"]["hasPageNumberFooter"])
            self.assertTrue(result["alignment"]["passed"])
            heading_texts = [heading["text"] for heading in analysis["headings"]]
            self.assertIn("一、报价一览表", heading_texts)
            self.assertIn("六、技术方案", heading_texts)

    def test_bid_document_template_info_exports_schema_and_asset_mapping(self):
        with TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "smart-canteen-template-info.json"

            result = bid_document_template_info(template_id="smart-canteen-response", output_json=output_path)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertTrue(output_path.exists())
            self.assertIn("BidDocumentProjectData", result["schema"])
            self.assertIn("BidDocumentAssetRef", result["schema"])
            self.assertIn("BidDocumentSectionTemplate", result["schema"])
            self.assertIn("BidDocumentPaymentTerm", result["schema"])
            self.assertIn("BidDocumentValidationProfile", result["schema"])
            self.assertIn("BidDocumentTaxPolicy", result["schema"])
            self.assertIn("BidDocumentQuoteItem", result["schema"])
            self.assertIn("BidDocumentBuildLog", result["schema"])
            self.assertIn("BidDocumentValidationResult", result["schema"])
            self.assertIn("BidDocumentReadinessReport", result["schema"])
            self.assertIn("BidDocumentQuoteReconciliation", result["schema"])
            self.assertIn("BidDocumentAssetInventoryItem", result["schema"])
            self.assertIn("BidDocumentAssetDefinition", result["schema"])
            self.assertIn(
                "required must be a boolean",
                "\n".join(result["schema"]["BidDocumentAssetRef"]["validationRules"]),
            )
            self.assertIn(
                "Every key in template.requiredAssetKeys",
                "\n".join(result["schema"]["BidDocumentAssetDefinition"]["validationRules"]),
            )
            self.assertIn("required for level 2/3", result["schema"]["BidDocumentSectionTemplate"]["fields"]["parentId"])
            self.assertIn("sum to 100", "\n".join(result["schema"]["BidDocumentPaymentTerm"]["validationRules"]))
            self.assertIn("Tax policy rate fields must be numbers between 0 and 1", "\n".join(result["schema"]["BidDocumentTaxPolicy"]["validationRules"]))
            self.assertIn("match projectData.taxPolicy", "\n".join(result["schema"]["BidDocumentQuoteItem"]["validationRules"]))
            self.assertIn("requiredSectionIds must be a non-empty array", "\n".join(result["schema"]["BidDocumentValidationProfile"]["validationRules"]))
            self.assertIn("quoteCheck", result["schema"]["BidDocumentBuildLog"]["preflightCheckKeys"])
            self.assertIn("docxOpenCheck", result["schema"]["BidDocumentBuildLog"]["postGenerationCheckKeys"])
            self.assertIn("quoteResolutionCheck", result["schema"]["BidDocumentBuildLog"]["importCheckKeys"])
            self.assertEqual(result["schema"]["BidDocumentBuildLog"]["fields"]["quoteResolutionCheck"], "BidDocumentValidationResult")
            self.assertEqual(result["schema"]["BidDocumentBuildLog"]["fields"]["docxForbiddenWordsCheck"], "BidDocumentValidationResult")
            self.assertEqual(result["schema"]["BidDocumentReadinessReport"]["cliFieldAliases"]["assetInventory"], "asset_inventory")
            self.assertIn("demo_only", result["schema"]["BidDocumentAssetInventoryItem"]["fields"]["status"])
            self.assertEqual(result["templates"][0]["template"]["id"], "smart-canteen-response")
            self.assertEqual(
                len(result["templates"][0]["template"]["assetDefinitions"]),
                len(result["templates"][0]["template"]["requiredAssetKeys"]),
            )
            quote_detail = next(section for section in result["templates"][0]["template"]["sections"] if section["id"] == "quote-detail")
            self.assertEqual(quote_detail["parentId"], "quote-summary")
            asset_mapping = result["templates"][0]["asset_mapping_example"]
            self.assertEqual(asset_mapping["business_license"]["title"], "营业执照")
            self.assertEqual(result["templates"][0]["template"]["assetDefinitions"][0]["key"], "business_license")
            self.assertEqual(asset_mapping["backend_platform_screenshot"]["sectionId"], "technical-solution")
            quote_models = [item["brandModel"] for item in result["templates"][0]["sample_quote_items"]]
            self.assertIn("康比特 CPT-Nutr-GMSC450-LITE", quote_models)
            quote_total = sum(item["totalWithTax"] for item in result["templates"][0]["sample_quote_items"])
            self.assertEqual(quote_total, 133050)

    def test_bid_document_init_config_exports_editable_project_config(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "generic-init-config.json"
            schema_path = root / "generic-init-config.schema.json"

            result = bid_document_init_config("generic-response", output_json=config_path, with_demo_assets=True)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertTrue(config_path.exists())
            self.assertEqual(Path(result["schema_path"]), schema_path)
            self.assertTrue(schema_path.exists())
            self.assertEqual(result["template_id"], "generic-response")
            self.assertEqual(result["quote_total"], 300)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            self.assertEqual(config["templateId"], "generic-response")
            self.assertEqual(config["projectData"]["projectName"], "通用完整标书样例项目")
            self.assertEqual(config["assetPackage"]["type"], "sidecar-directory")
            self.assertTrue((root / "generic-init-config.assets" / "qualification_scan.png").exists())
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
            self.assertEqual(schema["templateId"], "generic-response")
            self.assertIn("assetMap", schema["required"])
            self.assertIn("top-level templateId", schema["projectDataFields"]["templateId"])
            self.assertIn("relative", schema["assetRefFields"]["filePath"])
            self.assertEqual(schema["assetTypeEnum"], ["image", "scan", "document"])
            self.assertIn("BidDocumentAssetDefinition", schema["schema"])
            self.assertIn("technical-solution", schema["allowedSectionIds"])
            self.assertIn("must equal", schema["assetRefFields"]["key"])
            self.assertIn("assetMap.<key>.key must equal <key>", "\n".join(schema["assetRefValidationRules"]))
            self.assertIn("assetMap.<key>.required must be boolean", "\n".join(schema["assetRefValidationRules"]))
            self.assertIn("tax policy rate", schema["quoteItemFields"]["taxRate"])
            self.assertIn("softwareHardwareRate", schema["quoteItemFields"]["category"])
            self.assertIn(
                "not inserted, file-checked, or scanned for forbidden words",
                "\n".join(schema["assetRefValidationRules"]),
            )
            self.assertIn("level 2/3 sections must declare parentId", "\n".join(schema["sectionTemplateValidationRules"]))
            self.assertIn("paymentRequiredText", "\n".join(schema["paymentTermValidationRules"]))
            self.assertIn("sum to 100", schema["paymentTermFields"]["ratio"])
            self.assertIn("quoteCheck", schema["buildLogFields"]["preflightCheckKeys"])
            self.assertIn("docxOpenCheck", schema["buildLogFields"]["postGenerationCheckKeys"])
            self.assertIn("docxForbiddenWordsCheck", schema["buildLogFields"]["postGenerationCheckKeys"])
            self.assertIn("quoteResolutionCheck", schema["buildLogFields"]["importCheckKeys"])
            self.assertEqual(schema["assetMappingExample"]["qualification_scan"]["sectionId"], "supplier-basic-info")
            self.assertIn(
                "templateId and projectData.templateId mismatches",
                "\n".join(schema["validationNotes"]),
            )

    def test_smart_canteen_initialized_config_blocks_formal_word_on_quote_mismatch(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            output_docx = root / "smart-canteen-response.docx"
            output_json = root / "smart-canteen-response.build.json"
            init_result = bid_document_init_config("smart-canteen-response", output_json=config_path, with_demo_assets=True)
            self.assertTrue(init_result["ok"], init_result.get("stderr"))

            result = bid_document_build_config(config_path, output_docx=output_docx, output_json=output_json)

            self.assertFalse(result["ok"])
            self.assertFalse(output_docx.exists())
            self.assertTrue(output_json.exists())
            self.assertEqual(result["quote_total"], 133050)
            self.assertEqual(result["target_total"], 135050)
            self.assertFalse(result["build_log"]["quoteCheck"]["passed"])
            self.assertEqual(result["build_log"]["docxForbiddenWordsCheck"]["errors"], ["not_run"])
            errors = "\n".join(result["build_log"]["errors"])
            self.assertIn("quote_items total should equal project totalWithTax: expected 135050, got 133050", errors)

    def test_bid_document_build_config_rejects_demo_assets_for_formal_word(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "generic-init-config.json"
            output_docx = root / "generic-response.docx"
            output_json = root / "generic-response.build.json"
            init_result = bid_document_init_config("generic-response", output_json=config_path, with_demo_assets=True)
            self.assertTrue(init_result["ok"], init_result.get("stderr"))

            result = bid_document_build_config(config_path, output_docx=output_docx, output_json=output_json)

            self.assertFalse(result["ok"])
            self.assertFalse(output_docx.exists())
            self.assertTrue(output_json.exists())
            self.assertEqual(result["bytes"], 0)
            self.assertFalse(result["build_log"]["assetCheck"]["passed"])
            self.assertIn("demo_assets_not_allowed_for_formal_build", "\n".join(result["build_log"]["errors"]))

    def test_bid_document_readiness_report_exports_blocker_markdown(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            report_json = root / "readiness.json"
            report_md = root / "readiness.md"
            report_xlsx = root / "readiness.xlsx"
            init_result = bid_document_init_config("smart-canteen-response", output_json=config_path, with_demo_assets=True)
            self.assertTrue(init_result["ok"], init_result.get("stderr"))
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["projectData"]["projectName"] = "智慧餐厅 | 改造\n正式项目"
            config["quoteItems"][0]["name"] = "智慧食堂管理系统 | 手机端"
            config["assetMap"]["business_license"]["title"] = "营业执照 | 复印件\n盖章"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")

            result = bid_document_readiness_report(config_path, output_json=report_json, output_markdown=report_md, output_xlsx=report_xlsx)

            self.assertFalse(result["ok"])
            self.assertTrue(report_json.exists())
            self.assertTrue(report_md.exists())
            self.assertTrue(report_xlsx.exists())
            self.assertEqual(result["template_id"], "smart-canteen-response")
            self.assertEqual(result["quote_total"], 133050)
            self.assertEqual(result["target_total"], 135050)
            self.assertEqual(Path(result["output_xlsx"]), report_xlsx)
            report = result["readiness_report"]
            self.assertFalse(report["ready"])
            self.assertEqual(report["quote_difference"], 2000)
            self.assertIn("quote", report["blockers"])
            self.assertIn("demo_assets_not_allowed_for_formal_build", "\n".join(report["build_log"]["assetCheck"]["errors"]))
            docx_open_check = next(check for check in report["checks"] if check["key"] == "docxOpenCheck")
            self.assertEqual(docx_open_check["status"], "not_run")
            markdown = report_md.read_text(encoding="utf-8")
            self.assertIn("# 标书正式构建准备度报告", markdown)
            self.assertIn("- 项目名称：智慧餐厅 \\| 改造 正式项目", markdown)
            self.assertNotIn("- 项目名称：智慧餐厅 | 改造\n正式项目", markdown)
            self.assertIn("报价差额：2000", markdown)
            self.assertIn("## 报价核对", markdown)
            self.assertIn("智慧食堂管理系统 \\| 手机端", markdown)
            self.assertIn("CPT-Nutr-GMSC450-LITE", markdown)
            self.assertIn("## 报价差额处理建议", markdown)
            self.assertIn("新增经确认的真实分项", markdown)
            self.assertIn("## 附件清单", markdown)
            self.assertIn("| key | 材料名称 | 章节 | 必填 | 类型 | 状态 | 建议文件名 | 处理说明 |", markdown)
            self.assertIn("business_license", markdown)
            self.assertIn("营业执照 \\| 复印件<br>盖章", markdown)
            self.assertIn("image", markdown)
            self.assertIn("当前为演示附件路径，正式构建前必须替换为真实可递交材料。", markdown)
            self.assertIn("演示附件", markdown)
            self.assertIn("| docxOpenCheck | 未运行 | 1 |", markdown)
            self.assertIn("quote_items total should equal project totalWithTax", markdown)
            self.assertIn("asset_inventory", report)
            self.assertIn("quote_reconciliation", report)
            self.assertIn("quote_resolution_actions", report)
            self.assertEqual(report["quote_reconciliation"]["quoteDifference"], 2000)
            self.assertTrue(any("CPT-Nutr-GMSC450-LITE" in item["brandModel"] for item in report["quote_reconciliation"]["items"]))
            self.assertTrue(any(action["key"] == "add_confirmed_quote_item" for action in report["quote_resolution_actions"]))
            business_license_asset = next(asset for asset in report["asset_inventory"] if asset["key"] == "business_license")
            self.assertEqual(business_license_asset["status"], "demo_only")
            self.assertIn("营业执照", business_license_asset["suggestedFileName"])
            with zipfile.ZipFile(report_xlsx) as archive:
                names = set(archive.namelist())
                self.assertIn("xl/workbook.xml", names)
                self.assertIn("xl/worksheets/sheet1.xml", names)
                self.assertIn("xl/worksheets/sheet2.xml", names)
                self.assertIn("xl/worksheets/sheet6.xml", names)
                self.assertIn("xl/styles.xml", names)
                workbook = archive.read("xl/workbook.xml").decode("utf-8")
                quote_sheet = archive.read("xl/worksheets/sheet2.xml").decode("utf-8")
                blockers_sheet = archive.read("xl/worksheets/sheet3.xml").decode("utf-8")
                asset_inventory_sheet = archive.read("xl/worksheets/sheet4.xml").decode("utf-8")
                overview_sheet = archive.read("xl/worksheets/sheet1.xml").decode("utf-8")
                self.assertIn("概览", workbook)
                self.assertIn("报价核对", workbook)
                self.assertIn("阻断项", workbook)
                self.assertIn("附件清单", workbook)
                self.assertIn("校验项", workbook)
                self.assertIn("微软雅黑", archive.read("xl/styles.xml").decode("utf-8"))
                self.assertIn("报价差额", overview_sheet)
                self.assertIn("2000", overview_sheet)
                self.assertIn("CPT-Nutr-GMSC450-LITE", quote_sheet)
                self.assertIn("项目级差额", quote_sheet)
                self.assertIn("新增经确认的真实分项", quote_sheet)
                self.assertIn("demo_assets_not_allowed_for_formal_build", blockers_sheet)
                self.assertIn("business_license", asset_inventory_sheet)
                self.assertIn("演示附件", asset_inventory_sheet)

    def test_bid_document_readiness_report_omits_disabled_optional_section_asset(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["projectData"]["disabledSectionIds"] = ["backup-service"]
            config["assetMap"]["backup_service_proof"] = {
                "key": "backup_service_proof",
                "title": "待补后备服务证明材料",
                "filePath": "./generic-bid-document-config.assets/missing-backup-service.png",
                "type": "image",
                "required": True,
                "sectionId": "backup-service",
                "templateId": "generic-response",
            }
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            report_json = root / "readiness.json"
            report_md = root / "readiness.md"
            package_dir = root / "asset-package"

            report_result = bid_document_readiness_report(config_path, output_json=report_json, output_markdown=report_md)
            package_result = bid_document_asset_package(config_path, output_dir=package_dir)

            self.assertTrue(report_result["ok"], report_result.get("stderr"))
            self.assertTrue(package_result["ok"], package_result.get("stderr"))
            self.assertTrue(report_result["readiness_report"]["ready"])
            self.assertEqual([asset["key"] for asset in report_result["readiness_report"]["asset_inventory"]], [
                "qualification_scan",
                "solution_screenshot",
                "contract_case_scan",
            ])
            markdown = report_md.read_text(encoding="utf-8")
            self.assertNotIn("backup_service_proof", markdown)
            self.assertNotIn("待补后备服务证明材料", markdown)
            manifest = json.loads((package_dir / "asset-manifest.json").read_text(encoding="utf-8"))
            self.assertEqual([asset["key"] for asset in manifest["assets"]], [
                "qualification_scan",
                "solution_screenshot",
                "contract_case_scan",
            ])
            package_markdown = (package_dir / "材料收集清单.md").read_text(encoding="utf-8")
            self.assertNotIn("backup_service_proof", package_markdown)
            self.assertNotIn("待补后备服务证明材料", package_markdown)

    def test_bid_document_asset_package_exports_material_collection_folder(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            output_dir = root / "asset-package"
            init_result = bid_document_init_config("smart-canteen-response", output_json=config_path, with_demo_assets=True)
            self.assertTrue(init_result["ok"], init_result.get("stderr"))

            result = bid_document_asset_package(config_path, output_dir=output_dir)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertEqual(Path(result["output_dir"]), output_dir)
            self.assertTrue((output_dir / "asset-manifest.json").exists())
            self.assertTrue((output_dir / "材料收集清单.md").exists())
            self.assertEqual(Path(result["manifest_schema_path"]), output_dir / "asset-manifest.schema.json")
            self.assertTrue((output_dir / "asset-manifest.schema.json").exists())
            self.assertEqual(Path(result["quote_resolution_path"]), output_dir / "quote-resolution.json")
            self.assertTrue((output_dir / "quote-resolution.json").exists())
            self.assertEqual(Path(result["quote_resolution_schema_path"]), output_dir / "quote-resolution.schema.json")
            self.assertTrue((output_dir / "quote-resolution.schema.json").exists())
            self.assertTrue((output_dir / "assets").exists())
            self.assertEqual(result["demo_only_asset_count"], 18)
            self.assertEqual(result["replacement_required_asset_count"], 18)
            manifest = json.loads((output_dir / "asset-manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["projectName"], "智慧餐厅称重系统改造")
            self.assertEqual(manifest["quoteDifference"], 2000)
            self.assertEqual(manifest["replacementRequiredAssetCount"], 18)
            self.assertTrue(any("quote_items total should equal project totalWithTax" in issue["error"] for issue in manifest["readinessIssues"]))
            self.assertTrue(any(action["key"] == "add_confirmed_quote_item" for action in manifest["quoteResolutionActions"]))
            business_license_asset = next(asset for asset in manifest["assets"] if asset["key"] == "business_license")
            self.assertEqual(business_license_asset["status"], "demo_only")
            self.assertIn("营业执照", business_license_asset["targetFile"])
            manifest_schema = json.loads((output_dir / "asset-manifest.schema.json").read_text(encoding="utf-8"))
            self.assertIn("demo_only", manifest_schema["statusEnum"])
            self.assertEqual(manifest_schema["counters"]["replacementRequiredAssetCount"], "number")
            markdown = (output_dir / "材料收集清单.md").read_text(encoding="utf-8")
            self.assertIn("# 标书材料收集清单", markdown)
            self.assertIn("| key | 材料名称 | 章节 | 必填 | 类型 | 状态 | 目标目录 | 建议文件名 | 处理说明 |", markdown)
            self.assertIn("## 正式构建阻断项", markdown)
            self.assertIn("quote_items total should equal project totalWithTax", markdown)
            self.assertIn("## 报价差额处理建议", markdown)
            self.assertIn("新增经确认的真实分项", markdown)
            self.assertIn("image", markdown)
            self.assertIn("当前为演示附件路径，正式构建前必须替换为真实可递交材料。", markdown)
            self.assertIn("演示附件", markdown)
            self.assertIn("需替换演示附件：18", markdown)
            quote_resolution = json.loads((output_dir / "quote-resolution.json").read_text(encoding="utf-8"))
            self.assertEqual(quote_resolution["actionRules"]["confirm_project_total"]["allowedDataFields"], ["projectDataPatch"])
            quote_resolution_schema = json.loads((output_dir / "quote-resolution.schema.json").read_text(encoding="utf-8"))
            self.assertIn("add_confirmed_quote_item", quote_resolution_schema["selectedActionEnum"])
            self.assertIn("version must be 1", "\n".join(quote_resolution_schema["identityRules"]))
            self.assertIn("quote_resolution_template_mismatch", "\n".join(quote_resolution_schema["identityRules"]))
            self.assertNotIn("paymentTerms", quote_resolution_schema["projectDataPatchFields"])
            self.assertEqual(
                quote_resolution_schema["projectDataPatchAllowedFields"],
                ["totalWithTax", "totalWithoutTax", "taxPolicy"],
            )
            self.assertIn("quantity * unitPriceWithTax", "\n".join(quote_resolution_schema["validationRules"]))

    def test_bid_document_asset_package_uses_document_asset_extension_and_note(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            document_path = root / "generic-bid-document-config.assets" / "contract-case.docx"
            document_path.write_bytes(b"fake-docx-binary")
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["assetMap"]["contract_case_document"] = {
                "key": "contract_case_document",
                "title": "合同案例证明原始文件",
                "filePath": "./generic-bid-document-config.assets/contract-case.docx",
                "type": "document",
                "required": False,
                "sectionId": "other-materials",
                "templateId": "generic-response",
            }
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_dir = root / "asset-package"

            result = bid_document_asset_package(config_path, output_dir=output_dir)

            self.assertTrue(result["ok"], result.get("stderr"))
            manifest = json.loads((output_dir / "asset-manifest.json").read_text(encoding="utf-8"))
            document_asset = next(asset for asset in manifest["assets"] if asset["key"] == "contract_case_document")
            self.assertEqual(document_asset["type"], "document")
            self.assertTrue(document_asset["suggestedFileName"].endswith(".docx"))
            self.assertTrue(document_asset["targetFile"].endswith(".docx"))
            self.assertIn("真实原始文件", document_asset["collectionNote"])
            manifest_schema = json.loads((output_dir / "asset-manifest.schema.json").read_text(encoding="utf-8"))
            self.assertIn("document 仅用于可选原始文件", manifest_schema["assetFields"]["typeRules"])
            self.assertIn("需要真实非空文件", manifest_schema["assetFields"]["typeRules"])
            markdown = (output_dir / "材料收集清单.md").read_text(encoding="utf-8")
            self.assertIn("合同案例证明原始文件", markdown)
            self.assertIn(".docx", markdown)
            self.assertIn("document", markdown)
            self.assertIn("真实原始文件", markdown)

    def test_bid_document_import_asset_package_applies_collected_paths(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            package_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_result = bid_document_init_config("smart-canteen-response", output_json=config_path, with_demo_assets=True)
            self.assertTrue(init_result["ok"], init_result.get("stderr"))
            package_result = bid_document_asset_package(config_path, output_dir=package_dir)
            self.assertTrue(package_result["ok"], package_result.get("stderr"))
            manifest = json.loads((package_dir / "asset-manifest.json").read_text(encoding="utf-8"))
            business_license_asset = next(asset for asset in manifest["assets"] if asset["key"] == "business_license")
            target_path = package_dir / business_license_asset["targetFile"]
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_bytes(ONE_PIXEL_PNG)

            result = bid_document_import_asset_package(config_path, package_dir=package_dir, output_json=updated_config_path)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertTrue(updated_config_path.exists())
            self.assertEqual(result["applied_count"], 1)
            self.assertGreater(result["missing_required_count"], 0)
            self.assertFalse(result["validation_passed"])
            self.assertEqual(Path(result["manifest_schema_path"]), package_dir / "asset-manifest.schema.json")
            updated_config = json.loads(updated_config_path.read_text(encoding="utf-8"))
            self.assertEqual(updated_config["assetMap"]["business_license"]["filePath"], str(target_path))
            self.assertEqual(updated_config["assetMap"]["iso9001"]["filePath"], "")
            self.assertFalse(updated_config["assetPackage"]["demoOnly"])
            self.assertIn("missing_assets:iso9001", "\n".join(result["build_log"]["errors"]))

    def test_bid_document_import_asset_package_rejects_unsupported_manifest_version(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            package_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_result = bid_document_init_config("smart-canteen-response", output_json=config_path, with_demo_assets=True)
            self.assertTrue(init_result["ok"], init_result.get("stderr"))
            package_result = bid_document_asset_package(config_path, output_dir=package_dir)
            self.assertTrue(package_result["ok"], package_result.get("stderr"))
            manifest_path = package_dir / "asset-manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["version"] = 2
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

            result = bid_document_import_asset_package(config_path, package_dir=package_dir, output_json=updated_config_path)

            self.assertFalse(result["ok"])
            self.assertIn("unsupported_asset_manifest_version:2", result["stderr"])
            self.assertFalse(updated_config_path.exists())

    def test_bid_document_import_asset_package_rejects_target_file_outside_package(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            package_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_result = bid_document_init_config("smart-canteen-response", output_json=config_path, with_demo_assets=True)
            self.assertTrue(init_result["ok"], init_result.get("stderr"))
            package_result = bid_document_asset_package(config_path, output_dir=package_dir)
            self.assertTrue(package_result["ok"], package_result.get("stderr"))
            manifest_path = package_dir / "asset-manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            business_license_asset = next(asset for asset in manifest["assets"] if asset["key"] == "business_license")
            business_license_asset["targetFile"] = "../outside.png"
            (root / "outside.png").write_bytes(ONE_PIXEL_PNG)
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

            result = bid_document_import_asset_package(config_path, package_dir=package_dir, output_json=updated_config_path)

            self.assertFalse(result["ok"])
            self.assertIn("invalid_asset_target_file:outside_package:business_license:../outside.png", result["stderr"])
            self.assertFalse(updated_config_path.exists())

    def test_bid_document_import_asset_package_applies_quote_resolution(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            package_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_result = bid_document_init_config("smart-canteen-response", output_json=config_path, with_demo_assets=True)
            self.assertTrue(init_result["ok"], init_result.get("stderr"))
            package_result = bid_document_asset_package(config_path, output_dir=package_dir)
            self.assertTrue(package_result["ok"], package_result.get("stderr"))
            quote_resolution_path = package_dir / "quote-resolution.json"
            quote_resolution = json.loads(quote_resolution_path.read_text(encoding="utf-8"))
            quote_resolution["selectedAction"] = "confirm_project_total"
            quote_resolution["projectDataPatch"] = {
                "totalWithTax": 133050,
                "totalWithoutTax": 117743.36,
            }
            quote_resolution_path.write_text(json.dumps(quote_resolution, ensure_ascii=False, indent=2), encoding="utf-8")

            result = bid_document_import_asset_package(config_path, package_dir=package_dir, output_json=updated_config_path)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertTrue(result["quote_resolution_applied"])
            self.assertEqual(result["quote_resolution_action"], "confirm_project_total")
            updated_config = json.loads(updated_config_path.read_text(encoding="utf-8"))
            self.assertEqual(updated_config["projectData"]["totalWithTax"], 133050)
            self.assertEqual(sum(item["totalWithTax"] for item in updated_config["quoteItems"]), 133050)
            self.assertNotIn("quote_items total should equal project totalWithTax", "\n".join(result["build_log"]["errors"]))
            self.assertTrue(updated_config["assetPackage"]["quoteResolutionApplied"])

    def test_bid_document_import_asset_package_rejects_mismatched_quote_resolution_action_data(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            package_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_result = bid_document_init_config("smart-canteen-response", output_json=config_path, with_demo_assets=True)
            self.assertTrue(init_result["ok"], init_result.get("stderr"))
            package_result = bid_document_asset_package(config_path, output_dir=package_dir)
            self.assertTrue(package_result["ok"], package_result.get("stderr"))
            quote_resolution_path = package_dir / "quote-resolution.json"
            quote_resolution = json.loads(quote_resolution_path.read_text(encoding="utf-8"))
            quote_resolution["selectedAction"] = "confirm_project_total"
            quote_resolution["quoteItemsAppend"] = [{
                "name": "未经确认的差额项",
                "quantity": 1,
                "brandModel": "INVALID-ITEM",
                "unitPriceWithTax": 2000,
                "totalWithTax": 2000,
                "taxRate": 0.13,
                "category": "other",
            }]
            quote_resolution_path.write_text(json.dumps(quote_resolution, ensure_ascii=False, indent=2), encoding="utf-8")

            result = bid_document_import_asset_package(config_path, package_dir=package_dir, output_json=updated_config_path)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertFalse(result["quote_resolution_applied"])
            self.assertIn("quote_resolution_action_requires_project_data_patch:confirm_project_total", "\n".join(result["quote_resolution_errors"]))
            self.assertIn("quote_resolution_action_forbids_quote_item_changes:confirm_project_total", "\n".join(result["quote_resolution_errors"]))
            updated_config = json.loads(updated_config_path.read_text(encoding="utf-8"))
            self.assertEqual(updated_config["projectData"]["totalWithTax"], 135050)
            self.assertFalse(any(item["brandModel"] == "INVALID-ITEM" for item in updated_config["quoteItems"]))

    def test_bid_document_import_asset_package_rejects_forbidden_quote_resolution_project_patch_fields(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            package_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_result = bid_document_init_config("smart-canteen-response", output_json=config_path, with_demo_assets=True)
            self.assertTrue(init_result["ok"], init_result.get("stderr"))
            package_result = bid_document_asset_package(config_path, output_dir=package_dir)
            self.assertTrue(package_result["ok"], package_result.get("stderr"))
            quote_resolution_path = package_dir / "quote-resolution.json"
            quote_resolution = json.loads(quote_resolution_path.read_text(encoding="utf-8"))
            quote_resolution["selectedAction"] = "confirm_project_total"
            quote_resolution["projectDataPatch"] = {
                "totalWithTax": 133050,
                "totalWithoutTax": 117743.36,
                "paymentTerms": [],
            }
            quote_resolution_path.write_text(json.dumps(quote_resolution, ensure_ascii=False, indent=2), encoding="utf-8")

            result = bid_document_import_asset_package(config_path, package_dir=package_dir, output_json=updated_config_path)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertFalse(result["quote_resolution_applied"])
            self.assertIn("quote_resolution_forbidden_project_data_patch_field:paymentTerms", "\n".join(result["quote_resolution_errors"]))
            updated_config = json.loads(updated_config_path.read_text(encoding="utf-8"))
            self.assertEqual(len(updated_config["projectData"]["paymentTerms"]), 4)
            self.assertEqual(updated_config["projectData"]["totalWithTax"], 135050)

    def test_bid_document_import_asset_package_rejects_invalid_quote_resolution_item_rows(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            package_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_result = bid_document_init_config("smart-canteen-response", output_json=config_path, with_demo_assets=True)
            self.assertTrue(init_result["ok"], init_result.get("stderr"))
            package_result = bid_document_asset_package(config_path, output_dir=package_dir)
            self.assertTrue(package_result["ok"], package_result.get("stderr"))
            quote_resolution_path = package_dir / "quote-resolution.json"
            quote_resolution = json.loads(quote_resolution_path.read_text(encoding="utf-8"))
            quote_resolution["selectedAction"] = "add_confirmed_quote_item"
            quote_resolution["quoteItemsAppend"] = [{
                "name": "经确认差额项",
                "quantity": 1,
                "brandModel": "",
                "unitPriceWithTax": 2000,
                "totalWithTax": 1999,
                "taxRate": 0.13,
                "category": "other",
            }]
            quote_resolution_path.write_text(json.dumps(quote_resolution, ensure_ascii=False, indent=2), encoding="utf-8")

            result = bid_document_import_asset_package(config_path, package_dir=package_dir, output_json=updated_config_path)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertFalse(result["quote_resolution_applied"])
            errors = "\n".join(result["quote_resolution_errors"])
            self.assertIn("quote_resolution_invalid_quoteItemsAppend:0:missing_brand_model", errors)
            self.assertIn("quote_resolution_invalid_quoteItemsAppend:0:row_total_mismatch", errors)
            updated_config = json.loads(updated_config_path.read_text(encoding="utf-8"))
            self.assertFalse(any(item.get("name") == "经确认差额项" for item in updated_config["quoteItems"]))

    def test_bid_document_import_asset_package_rejects_quote_resolution_tax_policy_mismatch(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            package_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_result = bid_document_init_config("smart-canteen-response", output_json=config_path, with_demo_assets=True)
            self.assertTrue(init_result["ok"], init_result.get("stderr"))
            package_result = bid_document_asset_package(config_path, output_dir=package_dir)
            self.assertTrue(package_result["ok"], package_result.get("stderr"))
            quote_resolution_path = package_dir / "quote-resolution.json"
            quote_resolution = json.loads(quote_resolution_path.read_text(encoding="utf-8"))
            quote_resolution["selectedAction"] = "add_confirmed_quote_item"
            quote_resolution["quoteItemsAppend"] = [{
                "name": "经确认差额项",
                "quantity": 1,
                "brandModel": "CONFIRMED-DIFF-ITEM",
                "unitPriceWithTax": 2000,
                "totalWithTax": 2000,
                "taxRate": 0.06,
                "category": "software",
            }]
            quote_resolution_path.write_text(json.dumps(quote_resolution, ensure_ascii=False, indent=2), encoding="utf-8")

            result = bid_document_import_asset_package(config_path, package_dir=package_dir, output_json=updated_config_path)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertFalse(result["quote_resolution_applied"])
            self.assertIn(
                "quote_resolution_post_apply_quote_check:quote_items[6] taxRate should match projectData.taxPolicy.softwareHardwareRate for software",
                "\n".join(result["quote_resolution_errors"]),
            )
            updated_config = json.loads(updated_config_path.read_text(encoding="utf-8"))
            self.assertFalse(any(item.get("brandModel") == "CONFIRMED-DIFF-ITEM" for item in updated_config["quoteItems"]))

    def test_bid_document_import_asset_package_rejects_quote_resolution_template_mismatch(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            package_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_result = bid_document_init_config("smart-canteen-response", output_json=config_path, with_demo_assets=True)
            self.assertTrue(init_result["ok"], init_result.get("stderr"))
            package_result = bid_document_asset_package(config_path, output_dir=package_dir)
            self.assertTrue(package_result["ok"], package_result.get("stderr"))
            quote_resolution_path = package_dir / "quote-resolution.json"
            quote_resolution = json.loads(quote_resolution_path.read_text(encoding="utf-8"))
            quote_resolution["templateId"] = "generic-response"
            quote_resolution["selectedAction"] = "confirm_project_total"
            quote_resolution["projectDataPatch"] = {
                "totalWithTax": 133050,
                "totalWithoutTax": 117743.36,
            }
            quote_resolution_path.write_text(json.dumps(quote_resolution, ensure_ascii=False, indent=2), encoding="utf-8")

            result = bid_document_import_asset_package(config_path, package_dir=package_dir, output_json=updated_config_path)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertFalse(result["quote_resolution_applied"])
            self.assertIn("quote_resolution_template_mismatch:generic-response:smart-canteen-response", "\n".join(result["quote_resolution_errors"]))
            updated_config = json.loads(updated_config_path.read_text(encoding="utf-8"))
            self.assertEqual(updated_config["projectData"]["totalWithTax"], 135050)

    def test_bid_document_import_asset_package_rejects_manifest_template_mismatch_with_build_log(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            smart_config_path = root / "smart-canteen-init-config.json"
            generic_config_path = write_generic_bid_document_config(root)
            package_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_result = bid_document_init_config("smart-canteen-response", output_json=smart_config_path, with_demo_assets=True)
            self.assertTrue(init_result["ok"], init_result.get("stderr"))
            package_result = bid_document_asset_package(smart_config_path, output_dir=package_dir)
            self.assertTrue(package_result["ok"], package_result.get("stderr"))

            result = bid_document_import_asset_package(generic_config_path, package_dir=package_dir, output_json=updated_config_path)

            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "asset_package_template_mismatch")
            self.assertFalse(updated_config_path.exists())
            self.assertIn("asset_package_template_mismatch:smart-canteen-response:generic-response", "\n".join(result["build_log"]["errors"]))
            self.assertEqual(result["build_log"]["quoteCheck"]["errors"], ["not_run"])
            self.assertEqual(result["build_log"]["templateCheck"]["details"]["manifestTemplateId"], "smart-canteen-response")

    def test_bid_document_import_asset_package_rejects_unknown_template_id_with_complete_build_log(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["templateId"] = "unknown-response-template"
            config["projectData"]["templateId"] = "unknown-response-template"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            package_dir = root / "asset-package"
            package_dir.mkdir()
            updated_config_path = root / "updated-config.json"

            result = bid_document_import_asset_package(config_path, package_dir=package_dir, output_json=updated_config_path)

            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "unknown_template_id")
            self.assertFalse(updated_config_path.exists())
            assert_complete_template_error_build_log(self, result["build_log"])

    def test_bid_document_validate_config_wraps_real_validation_service(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            output_path = root / "validation-log.json"

            result = bid_document_validate_config(config_path, output_json=output_path)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertTrue(output_path.exists())
            self.assertEqual(result["template_id"], "generic-response")
            self.assertEqual(result["project_name"], "通用完整标书校验项目")
            self.assertEqual(result["quote_total"], 300)
            self.assertEqual(result["target_total"], 300)
            self.assertTrue(result["build_log"]["passed"])
            self.assertTrue(result["build_log"]["quoteCheck"]["passed"])
            self.assertTrue(result["build_log"]["assetCheck"]["passed"])

    def test_bid_document_validate_config_resolves_relative_sidecar_assets(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            output_path = root / "validation-log.json"

            result = bid_document_validate_config(config_path, output_json=output_path)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertTrue(output_path.exists())
            self.assertTrue(result["build_log"]["assetCheck"]["passed"])
            self.assertEqual(result["build_log"]["assetCheck"]["details"]["checked"], 3)

    def test_bid_document_validate_config_ignores_disabled_optional_section_asset(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["projectData"]["disabledSectionIds"] = ["backup-service"]
            config["assetMap"]["backup_service_proof"] = {
                "key": "backup_service_proof",
                "title": "待补后备服务证明材料",
                "filePath": "./generic-bid-document-config.assets/missing-backup-service.png",
                "type": "image",
                "required": True,
                "sectionId": "backup-service",
                "templateId": "generic-response",
            }
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = root / "validation-log.json"

            result = bid_document_validate_config(config_path, output_json=output_path)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertTrue(output_path.exists())
            self.assertTrue(result["build_log"]["assetCheck"]["passed"])
            self.assertTrue(result["build_log"]["forbiddenWordsCheck"]["passed"])
            self.assertEqual(result["build_log"]["assetCheck"]["details"]["checked"], 3)
            errors = "\n".join(result["build_log"]["errors"])
            self.assertNotIn("missing_asset_file:backup_service_proof", errors)
            self.assertNotIn("missing_assets:backup_service_proof", errors)
            self.assertNotIn("forbidden word found: 待补", errors)

    def test_bid_document_validate_config_rejects_invalid_asset_file_signature(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            (root / "generic-bid-document-config.assets" / "qualification_scan.png").write_text("not a png file", encoding="utf-8")
            output_path = root / "validation-log.json"

            result = bid_document_validate_config(config_path, output_json=output_path)

            self.assertFalse(result["ok"])
            self.assertTrue(output_path.exists())
            self.assertFalse(result["build_log"]["assetCheck"]["passed"])
            errors = "\n".join(result["build_log"]["errors"])
            self.assertIn("invalid_asset_file_signature:qualification_scan:.png", errors)
            self.assertEqual(result["build_log"]["assetCheck"]["details"]["invalid_asset_file_signatures"], ["qualification_scan"])

    def test_bid_document_validate_config_rejects_malformed_asset_mapping_records(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["assetMap"]["qualification_scan"]["key"] = "wrong_asset_key"
            config["assetMap"]["qualification_scan"]["title"] = ""
            config["assetMap"]["qualification_scan"]["type"] = "video"
            config["assetMap"]["qualification_scan"]["required"] = "false"
            config["assetMap"]["qualification_scan"]["sectionId"] = "not-in-template"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = root / "validation-log.json"

            result = bid_document_validate_config(config_path, output_json=output_path)

            self.assertFalse(result["ok"])
            self.assertTrue(output_path.exists())
            self.assertFalse(result["build_log"]["assetCheck"]["passed"])
            errors = "\n".join(result["build_log"]["errors"])
            self.assertIn("assetMap.qualification_scan.key should equal map key", errors)
            self.assertIn("assetMap.qualification_scan.title is required", errors)
            self.assertIn("assetMap.qualification_scan.type should be image|scan|document", errors)
            self.assertIn("assetMap.qualification_scan.required should be boolean", errors)
            self.assertIn("assetMap.qualification_scan.sectionId does not exist in template: not-in-template", errors)
            self.assertEqual(result["build_log"]["assetCheck"]["details"]["invalid_asset_required_values"], ["qualification_scan"])

    def test_bid_document_validate_config_rejects_unsupported_project_config_version(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["version"] = 2
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = root / "validation-log.json"

            result = bid_document_validate_config(config_path, output_json=output_path)

            self.assertFalse(result["ok"])
            self.assertIn("unsupported_project_config_version:2", result["stderr"])
            self.assertFalse(output_path.exists())

    def test_bid_document_validate_config_rejects_missing_quote_items_without_template_fallback(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config.pop("quoteItems")
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = root / "validation-log.json"

            result = bid_document_validate_config(config_path, output_json=output_path)

            self.assertFalse(result["ok"])
            self.assertIn("invalid_project_config:quoteItems_not_array", result["stderr"])
            self.assertFalse(output_path.exists())

    def test_bid_document_validate_config_rejects_project_template_id_mismatch_at_reader_boundary(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["projectData"]["templateId"] = "smart-canteen-response"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = root / "validation-log.json"

            result = bid_document_validate_config(config_path, output_json=output_path)

            self.assertFalse(result["ok"])
            self.assertIn(
                "invalid_project_config:templateId_mismatch:generic-response:smart-canteen-response",
                result["stderr"],
            )
            self.assertFalse(output_path.exists())

    def test_bid_document_build_config_generates_word_from_project_config(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            output_docx = root / "generic-response-from-config.docx"
            output_json = root / "generic-response-from-config.build.json"

            result = bid_document_build_config(config_path, output_docx=output_docx, output_json=output_json)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertTrue(output_docx.exists())
            self.assertTrue(output_json.exists())
            self.assertGreater(result["bytes"], 0)
            self.assertTrue(result["build_log"]["passed"])
            self.assertTrue(result["build_log"]["docxOpenCheck"]["passed"])
            self.assertTrue(result["build_log"]["docxQuoteIntegrityCheck"]["passed"])
            self.assertTrue(result["build_log"]["imageInsertionCheck"]["passed"])
            with zipfile.ZipFile(output_docx) as archive:
                document_xml = archive.read("word/document.xml").decode("utf-8")
            self.assertIn("通用完整标书校验项目", document_xml)
            self.assertIn("GEN-DEVICE-100", document_xml)

    def test_bid_document_build_config_ignores_disabled_optional_section_asset(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["projectData"]["disabledSectionIds"] = ["backup-service"]
            config["assetMap"]["backup_service_proof"] = {
                "key": "backup_service_proof",
                "title": "待补后备服务证明材料",
                "filePath": "./generic-bid-document-config.assets/missing-backup-service.png",
                "type": "image",
                "required": True,
                "sectionId": "backup-service",
                "templateId": "generic-response",
            }
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_docx = root / "generic-response-disabled-optional-asset.docx"
            output_json = root / "generic-response-disabled-optional-asset.build.json"

            result = bid_document_build_config(config_path, output_docx=output_docx, output_json=output_json)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertTrue(output_docx.exists())
            self.assertTrue(output_json.exists())
            self.assertTrue(result["build_log"]["passed"])
            self.assertTrue(result["build_log"]["assetCheck"]["passed"])
            self.assertTrue(result["build_log"]["forbiddenWordsCheck"]["passed"])
            self.assertEqual(result["build_log"]["assetCheck"]["details"]["checked"], 3)
            self.assertEqual(result["build_log"]["imageInsertionCheck"]["details"]["expectedImageAssetCount"], 3)
            errors = "\n".join(result["build_log"]["errors"])
            self.assertNotIn("missing_asset_file:backup_service_proof", errors)
            self.assertNotIn("missing_assets:backup_service_proof", errors)
            self.assertNotIn("forbidden word found: 待补", errors)
            with zipfile.ZipFile(output_docx) as archive:
                document_xml = archive.read("word/document.xml").decode("utf-8")
            self.assertNotIn("待补后备服务证明材料", document_xml)
            self.assertNotIn("后备服务", document_xml)

    def test_bid_document_build_config_lists_document_assets_without_image_count(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            document_path = root / "generic-bid-document-config.assets" / "contract-case.pdf"
            document_path.write_text("%PDF-1.4\n", encoding="utf-8")
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["assetMap"]["contract_case_document"] = {
                "key": "contract_case_document",
                "title": "合同案例证明原始文件",
                "filePath": "./generic-bid-document-config.assets/contract-case.pdf",
                "type": "document",
                "required": False,
                "sectionId": "other-materials",
                "templateId": "generic-response",
            }
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_docx = root / "generic-response-with-document-asset.docx"
            output_json = root / "generic-response-with-document-asset.build.json"

            result = bid_document_build_config(config_path, output_docx=output_docx, output_json=output_json)

            self.assertTrue(result["ok"], result.get("stderr"))
            self.assertEqual(result["build_log"]["assetCheck"]["details"]["document_assets"], ["contract_case_document"])
            self.assertEqual(result["build_log"]["imageInsertionCheck"]["details"]["expectedImageAssetCount"], 3)
            self.assertEqual(result["build_log"]["docxAssetPlacementCheck"]["details"]["checkedAssetCount"], 3)
            with zipfile.ZipFile(output_docx) as archive:
                document_xml = archive.read("word/document.xml").decode("utf-8")
            self.assertIn("合同案例证明原始文件", document_xml)
            self.assertIn("contract-case.pdf", document_xml)

    def test_bid_document_build_config_preserves_existing_word_on_preflight_failure(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["assetMap"]["qualification_scan"]["filePath"] = "./generic-bid-document-config.assets/missing-qualification.png"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_docx = root / "existing-response.docx"
            output_json = root / "failed-build.json"
            original_bytes = b"existing-final-docx"
            output_docx.write_bytes(original_bytes)

            result = bid_document_build_config(config_path, output_docx=output_docx, output_json=output_json)

            self.assertFalse(result["ok"])
            self.assertTrue(output_json.exists())
            self.assertEqual(output_docx.read_bytes(), original_bytes)
            self.assertEqual(result["bytes"], 0)
            self.assertFalse(result["build_log"]["assetCheck"]["passed"])
            self.assertEqual(result["build_log"]["docxOpenCheck"]["errors"], ["not_run"])
            self.assertEqual(result["build_log"]["imageInsertionCheck"]["errors"], ["not_run"])
            self.assertEqual(result["build_log"]["docxForbiddenWordsCheck"]["errors"], ["not_run"])
            self.assertIn("missing_assets:qualification_scan", "\n".join(result["build_log"]["errors"]))

    def test_bid_document_build_config_rejects_forbidden_words_without_creating_docx(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["projectData"]["projectName"] = "内容由 AI 生成"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_docx = root / "should-not-exist.docx"
            output_json = root / "failed-build.json"

            result = bid_document_build_config(config_path, output_docx=output_docx, output_json=output_json)

            self.assertFalse(result["ok"])
            self.assertFalse(output_docx.exists())
            self.assertTrue(output_json.exists())
            self.assertEqual(result["bytes"], 0)
            self.assertFalse(result["build_log"]["forbiddenWordsCheck"]["passed"])
            self.assertEqual(result["build_log"]["docxForbiddenWordsCheck"]["errors"], ["not_run"])
            self.assertIn("forbidden word found: 内容由 AI 生成", "\n".join(result["build_log"]["errors"]))

    def test_bid_document_build_config_rejects_unsupported_project_config_version_without_creating_docx(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["version"] = 2
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_docx = root / "should-not-exist.docx"
            output_json = root / "failed-build.json"

            result = bid_document_build_config(config_path, output_docx=output_docx, output_json=output_json)

            self.assertFalse(result["ok"])
            self.assertIn("unsupported_project_config_version:2", result["stderr"])
            self.assertFalse(output_docx.exists())
            self.assertFalse(output_json.exists())

    def test_bid_document_build_config_rejects_missing_quote_items_without_creating_docx(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config.pop("quoteItems")
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_docx = root / "should-not-exist.docx"
            output_json = root / "failed-build.json"

            result = bid_document_build_config(config_path, output_docx=output_docx, output_json=output_json)

            self.assertFalse(result["ok"])
            self.assertIn("invalid_project_config:quoteItems_not_array", result["stderr"])
            self.assertFalse(output_docx.exists())
            self.assertFalse(output_json.exists())

    def test_bid_document_validate_config_rejects_unknown_template_id(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["templateId"] = "unknown-response-template"
            config["projectData"]["templateId"] = "unknown-response-template"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = root / "validation-log.json"

            result = bid_document_validate_config(config_path, output_json=output_path)

            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "unknown_template_id")
            self.assertEqual(result["template_id"], "unknown-response-template")
            self.assertIn("generic-response", result["available_template_ids"])
            self.assertIn("smart-canteen-response", result["available_template_ids"])
            self.assertTrue(output_path.exists())
            saved = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(saved["error"], "unknown_template_id")
            assert_complete_template_error_build_log(self, result["build_log"])
            assert_complete_template_error_build_log(self, saved["build_log"])

    def test_bid_document_build_config_rejects_unknown_template_id_with_complete_build_log(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["templateId"] = "unknown-response-template"
            config["projectData"]["templateId"] = "unknown-response-template"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_docx = root / "should-not-exist.docx"
            output_json = root / "failed-build.json"

            result = bid_document_build_config(config_path, output_docx=output_docx, output_json=output_json)

            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "unknown_template_id")
            self.assertFalse(output_docx.exists())
            self.assertTrue(output_json.exists())
            assert_complete_template_error_build_log(self, result["build_log"])
            saved = json.loads(output_json.read_text(encoding="utf-8"))
            assert_complete_template_error_build_log(self, saved["build_log"])

    def test_bid_document_readiness_report_rejects_unknown_template_id_with_complete_build_log(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["templateId"] = "unknown-response-template"
            config["projectData"]["templateId"] = "unknown-response-template"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_json = root / "readiness.json"

            result = bid_document_readiness_report(config_path, output_json=output_json)

            self.assertFalse(result["ok"])
            self.assertTrue(output_json.exists())
            assert_complete_template_error_build_log(self, result["readiness_report"]["build_log"])
            saved = json.loads(output_json.read_text(encoding="utf-8"))
            assert_complete_template_error_build_log(self, saved["readiness_report"]["build_log"])

    def test_bid_document_asset_package_rejects_unknown_template_id_with_complete_build_log(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["templateId"] = "unknown-response-template"
            config["projectData"]["templateId"] = "unknown-response-template"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_dir = root / "asset-package"

            result = bid_document_asset_package(config_path, output_dir=output_dir)

            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "unknown_template_id")
            self.assertFalse(output_dir.exists())
            assert_complete_template_error_build_log(self, result["build_log"])

    def test_bid_document_validate_config_rejects_asset_template_identity_mismatch(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["assetMap"]["qualification_scan"]["templateId"] = "smart-canteen-response"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = root / "validation-log.json"

            result = bid_document_validate_config(config_path, output_json=output_path)

            self.assertFalse(result["ok"])
            self.assertTrue(output_path.exists())
            self.assertFalse(result["build_log"]["identityCheck"]["passed"])
            errors = "\n".join(result["build_log"]["errors"])
            self.assertIn("assetMap.qualification_scan.templateId should match template.id", errors)

    def test_bid_document_validate_config_rejects_invalid_payment_ratios(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["projectData"]["paymentTerms"] = [
                {"stage": "扣减项", "ratio": -20, "text": "扣减 20%。"},
                {"stage": "异常尾款", "ratio": 120, "text": "支付 120%。"},
            ]
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = root / "validation-log.json"

            result = bid_document_validate_config(config_path, output_json=output_path)

            self.assertFalse(result["ok"])
            self.assertTrue(output_path.exists())
            self.assertFalse(result["build_log"]["paymentCheck"]["passed"])
            errors = "\n".join(result["build_log"]["errors"])
            self.assertIn("payment_terms[0] ratio should be greater than 0 and less than or equal to 100", errors)
            self.assertIn("payment_terms[1] ratio should be greater than 0 and less than or equal to 100", errors)

    def test_bid_document_validate_config_rejects_invalid_quote_amounts(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["projectData"]["totalWithoutTax"] = 0
            config["quoteItems"][0]["unitPriceWithTax"] = 0
            config["quoteItems"][0]["totalWithTax"] = 0
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = root / "validation-log.json"

            result = bid_document_validate_config(config_path, output_json=output_path)

            self.assertFalse(result["ok"])
            self.assertTrue(output_path.exists())
            self.assertFalse(result["build_log"]["quoteCheck"]["passed"])
            errors = "\n".join(result["build_log"]["errors"])
            self.assertIn("projectData.totalWithoutTax should be greater than 0", errors)
            self.assertIn("quote_items[0] unitPriceWithTax should be greater than 0", errors)
            self.assertIn("quote_items[0] totalWithTax should be greater than 0", errors)

    def test_bid_document_validate_config_rejects_quote_tax_policy_mismatch(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["quoteItems"][0]["taxRate"] = 0.06
            config["quoteItems"][1]["category"] = "contract"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = root / "validation-log.json"

            result = bid_document_validate_config(config_path, output_json=output_path)

            self.assertFalse(result["ok"])
            self.assertTrue(output_path.exists())
            self.assertFalse(result["build_log"]["quoteCheck"]["passed"])
            errors = "\n".join(result["build_log"]["errors"])
            self.assertIn("quote_items[0] taxRate should match projectData.taxPolicy.softwareHardwareRate for software", errors)
            self.assertIn("quote_items[1] category should be software|hardware|service|material|other", errors)
            self.assertEqual(result["build_log"]["quoteCheck"]["details"]["invalidQuoteCategories"], ["1:contract"])
            self.assertEqual(
                result["build_log"]["quoteCheck"]["details"]["mismatchedQuoteTaxRates"],
                ["0:software:0.06->softwareHardwareRate:0.13"],
            )

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
            markdown = markdown_path.read_text(encoding="utf-8")
            self.assertIn("# 响应文件商务与模板核对包", markdown)
            self.assertIn("## 整标模板核对清单", markdown)
            with zipfile.ZipFile(xlsx_path) as archive:
                workbook_xml = archive.read("xl/workbook.xml").decode("utf-8")
                worksheet_xml = "\n".join(
                    archive.read(name).decode("utf-8")
                    for name in archive.namelist()
                    if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
                )
            self.assertIn("商务响应表", workbook_xml)
            self.assertIn("付款周期为验收后30日内。", worksheet_xml)

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
