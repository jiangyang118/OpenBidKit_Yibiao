import json
import os
import shutil
import subprocess
import sys
import unittest
import zipfile
from base64 import b64decode
from pathlib import Path
from tempfile import TemporaryDirectory

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

    def run_json_allow_failure(self, *args):
        completed = subprocess.run(
            [self.command, "--json", *args],
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        payload = json.loads(completed.stdout)
        payload["_returncode"] = completed.returncode
        payload["_stderr"] = completed.stderr
        return payload

    def test_status_command_outputs_json(self):
        payload = self.run_json("status")

        self.assertEqual(payload["software"], "OpenBidKit_Yibiao")
        self.assertTrue(payload["client"]["package_exists"])
        self.assertIn("test", payload["client"]["scripts"])

    def test_plan_summary_command_outputs_json(self):
        payload = self.run_json("plan-summary")

        self.assertTrue(payload["exists"])
        self.assertGreater(payload["heading_count"], 5)
        self.assertEqual(payload["required_pending_markers"], 0)
        self.assertGreater(payload["blocked_count"], 0)
        self.assertGreater(payload["sample_blocked_count"], 0)
        self.assertEqual(payload["capability_blocked_count"], 0)
        self.assertEqual(payload["completion_status"], "required-complete-with-sample-blockers")

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

    def test_project_workspace_command_manages_temp_user_data(self):
        with TemporaryDirectory() as temp_dir:
            user_data = Path(temp_dir) / "user-data"

            initial = self.run_json("project-workspace", "--action", "list", "--user-data", str(user_data))
            self.assertTrue(initial["ok"], initial.get("stderr"))
            self.assertEqual(initial["result"]["active_project_id"], "default")

            created = self.run_json(
                "project-workspace",
                "--action",
                "create",
                "--user-data",
                str(user_data),
                "--name",
                "CLI 测试项目",
                "--make-active",
            )
            self.assertTrue(created["ok"], created.get("stderr"))
            project_id = created["result"]["project"]["id"]
            self.assertEqual(created["result"]["state"]["active_project_id"], project_id)

            switched = self.run_json(
                "project-workspace",
                "--action",
                "set-active",
                "--user-data",
                str(user_data),
                "--project-id",
                "default",
            )
            self.assertTrue(switched["ok"], switched.get("stderr"))
            self.assertEqual(switched["result"]["active_project_id"], "default")

            workspace_path = self.run_json(
                "project-workspace",
                "--action",
                "get-workspace-path",
                "--user-data",
                str(user_data),
                "--project-id",
                project_id,
            )
            self.assertTrue(workspace_path["ok"], workspace_path.get("stderr"))
            self.assertIn(project_id, workspace_path["result"]["workspace_path"])

    def test_bid_document_sample_command_generates_docx_and_build_log(self):
        with TemporaryDirectory() as temp_dir:
            payload = self.run_json(
                "bid-document-sample",
                "--output-dir",
                temp_dir,
                "--template-id",
                "generic-response",
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            output_path = Path(payload["output"])
            log_path = Path(payload["log_path"])
            self.assertTrue(output_path.exists())
            self.assertTrue(log_path.exists())
            self.assertTrue(payload["build_log"]["titleCheck"]["passed"])
            self.assertTrue(payload["build_log"]["docxContentCheck"]["passed"])
            self.assertTrue(payload["build_log"]["docxQuoteIntegrityCheck"]["passed"])
            self.assertTrue(payload["build_log"]["docxStyleCheck"]["passed"])
            self.assertTrue(payload["build_log"]["docxTechnicalDensityCheck"]["passed"])
            self.assertTrue(payload["build_log"]["docxTocCheck"]["passed"])
            self.assertTrue(payload["build_log"]["docxPageBreakCheck"]["passed"])
            self.assertTrue(payload["build_log"]["imageInsertionCheck"]["passed"])
            self.assertTrue(payload["build_log"]["docxAssetPlacementCheck"]["passed"])
            with zipfile.ZipFile(output_path) as archive:
                document_xml = archive.read("word/document.xml").decode("utf-8")
            self.assertIn("响应文件", document_xml)

    def test_bid_document_analyze_reference_command_outputs_docx_structure(self):
        with TemporaryDirectory() as temp_dir:
            sample = self.run_json(
                "bid-document-sample",
                "--output-dir",
                temp_dir,
                "--template-id",
                "generic-response",
            )
            analysis_path = Path(temp_dir) / "reference-analysis.json"

            payload = self.run_json(
                "bid-document-analyze-reference",
                "--input",
                sample["output"],
                "--candidate",
                sample["output"],
                "--output-json",
                str(analysis_path),
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertTrue(analysis_path.exists())
            self.assertGreaterEqual(payload["analysis"]["summary"]["headingCount"], 7)
            self.assertGreaterEqual(payload["analysis"]["summary"]["tableCount"], 3)
            self.assertGreaterEqual(payload["analysis"]["summary"]["imageReferenceCount"], 3)
            self.assertTrue(payload["analysis"]["summary"]["hasPageNumberFooter"])
            self.assertTrue(payload["alignment"]["passed"])

    def test_bid_document_template_info_command_outputs_schema_and_mapping(self):
        with TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "template-info.json"

            payload = self.run_json(
                "bid-document-template-info",
                "--template-id",
                "generic-response",
                "--output-json",
                str(output_path),
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertTrue(output_path.exists())
            self.assertIn("BidDocumentTemplate", payload["schema"])
            self.assertIn("BidDocumentSectionTemplate", payload["schema"])
            self.assertIn("BidDocumentPaymentTerm", payload["schema"])
            self.assertIn("BidDocumentValidationProfile", payload["schema"])
            self.assertIn("BidDocumentTaxPolicy", payload["schema"])
            self.assertIn("BidDocumentQuoteItem", payload["schema"])
            self.assertIn("BidDocumentBuildLog", payload["schema"])
            self.assertIn("BidDocumentValidationResult", payload["schema"])
            self.assertIn("BidDocumentAssetDefinition", payload["schema"])
            self.assertIn(
                "Every key in template.requiredAssetKeys",
                "\n".join(payload["schema"]["BidDocumentAssetDefinition"]["validationRules"]),
            )
            self.assertIn(
                "required must be a boolean",
                "\n".join(payload["schema"]["BidDocumentAssetRef"]["validationRules"]),
            )
            self.assertIn("required for level 2/3", payload["schema"]["BidDocumentSectionTemplate"]["fields"]["parentId"])
            self.assertIn("sum to 100", "\n".join(payload["schema"]["BidDocumentPaymentTerm"]["validationRules"]))
            self.assertIn("Tax policy rate fields must be numbers between 0 and 1", "\n".join(payload["schema"]["BidDocumentTaxPolicy"]["validationRules"]))
            self.assertIn("match projectData.taxPolicy", "\n".join(payload["schema"]["BidDocumentQuoteItem"]["validationRules"]))
            self.assertIn("requiredSectionIds must be a non-empty array", "\n".join(payload["schema"]["BidDocumentValidationProfile"]["validationRules"]))
            self.assertIn("quoteCheck", payload["schema"]["BidDocumentBuildLog"]["preflightCheckKeys"])
            self.assertIn("docxOpenCheck", payload["schema"]["BidDocumentBuildLog"]["postGenerationCheckKeys"])
            self.assertIn("quoteResolutionCheck", payload["schema"]["BidDocumentBuildLog"]["importCheckKeys"])
            self.assertEqual(payload["schema"]["BidDocumentBuildLog"]["fields"]["quoteResolutionCheck"], "BidDocumentValidationResult")
            self.assertEqual(payload["schema"]["BidDocumentBuildLog"]["fields"]["docxForbiddenWordsCheck"], "BidDocumentValidationResult")
            self.assertEqual(payload["templates"][0]["template"]["id"], "generic-response")
            self.assertEqual(
                len(payload["templates"][0]["template"]["assetDefinitions"]),
                len(payload["templates"][0]["template"]["requiredAssetKeys"]),
            )
            quote_detail = next(section for section in payload["templates"][0]["template"]["sections"] if section["id"] == "quote-detail")
            self.assertEqual(quote_detail["parentId"], "quote-summary")
            self.assertIn("qualification_scan", payload["templates"][0]["asset_mapping_example"])
            self.assertEqual(payload["templates"][0]["template"]["assetDefinitions"][0]["key"], "qualification_scan")
            self.assertEqual(payload["templates"][0]["sample_project_data"]["projectName"], "通用完整标书样例项目")

    def test_bid_document_init_config_command_outputs_editable_project_config(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "generic-init-config.json"
            schema_path = root / "generic-init-config.schema.json"

            payload = self.run_json(
                "bid-document-init-config",
                "--template-id",
                "generic-response",
                "--output-json",
                str(config_path),
                "--with-demo-assets",
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertTrue(config_path.exists())
            self.assertEqual(Path(payload["schema_path"]), schema_path)
            self.assertTrue(schema_path.exists())
            self.assertEqual(payload["template_id"], "generic-response")
            self.assertEqual(payload["quote_total"], 300)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            self.assertEqual(config["templateId"], "generic-response")
            self.assertEqual(config["assetPackage"]["type"], "sidecar-directory")
            self.assertTrue((root / "generic-init-config.assets" / "qualification_scan.png").exists())
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
            self.assertEqual(schema["templateId"], "generic-response")
            self.assertIn("assetMap", schema["required"])
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

    def test_smart_canteen_init_config_command_blocks_formal_word_on_quote_mismatch(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            output_docx = root / "smart-canteen-response.docx"
            output_json = root / "smart-canteen-response.build.json"
            init_payload = self.run_json(
                "bid-document-init-config",
                "--template-id",
                "smart-canteen-response",
                "--output-json",
                str(config_path),
                "--with-demo-assets",
            )
            self.assertTrue(init_payload["ok"], init_payload.get("stderr"))

            payload = self.run_json_allow_failure(
                "bid-document-build-config",
                "--input",
                str(config_path),
                "--output",
                str(output_docx),
                "--output-json",
                str(output_json),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertFalse(output_docx.exists())
            self.assertTrue(output_json.exists())
            self.assertEqual(payload["quote_total"], 133050)
            self.assertEqual(payload["target_total"], 135050)
            self.assertFalse(payload["build_log"]["quoteCheck"]["passed"])
            self.assertEqual(payload["build_log"]["docxForbiddenWordsCheck"]["errors"], ["not_run"])
            errors = "\n".join(payload["build_log"]["errors"])
            self.assertIn("quote_items total should equal project totalWithTax: expected 135050, got 133050", errors)

    def test_bid_document_build_config_command_rejects_demo_assets_for_formal_word(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "generic-init-config.json"
            output_docx = root / "generic-response.docx"
            output_json = root / "generic-response.build.json"
            init_payload = self.run_json(
                "bid-document-init-config",
                "--template-id",
                "generic-response",
                "--output-json",
                str(config_path),
                "--with-demo-assets",
            )
            self.assertTrue(init_payload["ok"], init_payload.get("stderr"))

            payload = self.run_json_allow_failure(
                "bid-document-build-config",
                "--input",
                str(config_path),
                "--output",
                str(output_docx),
                "--output-json",
                str(output_json),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertFalse(output_docx.exists())
            self.assertTrue(output_json.exists())
            self.assertEqual(payload["bytes"], 0)
            self.assertFalse(payload["build_log"]["assetCheck"]["passed"])
            self.assertIn("demo_assets_not_allowed_for_formal_build", "\n".join(payload["build_log"]["errors"]))

    def test_bid_document_readiness_report_command_outputs_blockers(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            report_json = root / "readiness.json"
            report_md = root / "readiness.md"
            report_xlsx = root / "readiness.xlsx"
            init_payload = self.run_json(
                "bid-document-init-config",
                "--template-id",
                "smart-canteen-response",
                "--output-json",
                str(config_path),
                "--with-demo-assets",
            )
            self.assertTrue(init_payload["ok"], init_payload.get("stderr"))

            payload = self.run_json_allow_failure(
                "bid-document-readiness-report",
                "--input",
                str(config_path),
                "--output-json",
                str(report_json),
                "--output-markdown",
                str(report_md),
                "--output-xlsx",
                str(report_xlsx),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertTrue(report_json.exists())
            self.assertTrue(report_md.exists())
            self.assertTrue(report_xlsx.exists())
            self.assertEqual(payload["template_id"], "smart-canteen-response")
            self.assertEqual(payload["readiness_report"]["quote_difference"], 2000)
            self.assertIn("quote", payload["readiness_report"]["blockers"])
            self.assertIn("demo_assets_not_allowed_for_formal_build", "\n".join(payload["readiness_report"]["build_log"]["assetCheck"]["errors"]))
            self.assertEqual(Path(payload["output_xlsx"]), report_xlsx)
            markdown = report_md.read_text(encoding="utf-8")
            self.assertIn("标书正式构建准备度报告", markdown)
            self.assertIn("报价差额：2000", markdown)
            self.assertIn("## 报价核对", markdown)
            self.assertIn("CPT-Nutr-GMSC450-LITE", markdown)
            self.assertIn("## 报价差额处理建议", markdown)
            self.assertIn("新增经确认的真实分项", markdown)
            with zipfile.ZipFile(report_xlsx) as archive:
                self.assertIn("xl/workbook.xml", archive.namelist())
                workbook = archive.read("xl/workbook.xml").decode("utf-8")
                quote_sheet = archive.read("xl/worksheets/sheet2.xml").decode("utf-8")
                blockers_sheet = archive.read("xl/worksheets/sheet3.xml").decode("utf-8")
                self.assertIn("报价核对", workbook)
                self.assertIn("阻断项", workbook)
                self.assertIn("CPT-Nutr-GMSC450-LITE", quote_sheet)
                self.assertIn("新增经确认的真实分项", quote_sheet)
                self.assertIn("quote_items total should equal project totalWithTax", blockers_sheet)

    def test_bid_document_readiness_report_command_omits_disabled_optional_section_asset(self):
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

            report_payload = self.run_json(
                "bid-document-readiness-report",
                "--input",
                str(config_path),
                "--output-json",
                str(report_json),
                "--output-markdown",
                str(report_md),
            )
            package_payload = self.run_json(
                "bid-document-asset-package",
                "--input",
                str(config_path),
                "--output-dir",
                str(package_dir),
            )

            self.assertTrue(report_payload["ok"], report_payload.get("stderr"))
            self.assertTrue(package_payload["ok"], package_payload.get("stderr"))
            self.assertTrue(report_payload["readiness_report"]["ready"])
            self.assertEqual([asset["key"] for asset in report_payload["readiness_report"]["asset_inventory"]], [
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

    def test_bid_document_asset_package_command_outputs_collection_folder(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            output_dir = root / "asset-package"
            init_payload = self.run_json(
                "bid-document-init-config",
                "--template-id",
                "smart-canteen-response",
                "--output-json",
                str(config_path),
                "--with-demo-assets",
            )
            self.assertTrue(init_payload["ok"], init_payload.get("stderr"))

            payload = self.run_json(
                "bid-document-asset-package",
                "--input",
                str(config_path),
                "--output-dir",
                str(output_dir),
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertEqual(Path(payload["output_dir"]), output_dir)
            self.assertTrue((output_dir / "asset-manifest.json").exists())
            self.assertTrue((output_dir / "材料收集清单.md").exists())
            self.assertEqual(Path(payload["manifest_schema_path"]), output_dir / "asset-manifest.schema.json")
            self.assertTrue((output_dir / "asset-manifest.schema.json").exists())
            self.assertEqual(Path(payload["quote_resolution_path"]), output_dir / "quote-resolution.json")
            self.assertTrue((output_dir / "quote-resolution.json").exists())
            self.assertEqual(Path(payload["quote_resolution_schema_path"]), output_dir / "quote-resolution.schema.json")
            self.assertTrue((output_dir / "quote-resolution.schema.json").exists())
            self.assertTrue((output_dir / "assets").exists())
            self.assertEqual(payload["demo_only_asset_count"], 18)
            self.assertEqual(payload["replacement_required_asset_count"], 18)
            manifest = json.loads((output_dir / "asset-manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["projectName"], "智慧餐厅称重系统改造")
            self.assertEqual(manifest["quoteDifference"], 2000)
            self.assertEqual(manifest["replacementRequiredAssetCount"], 18)
            self.assertTrue(any(action["key"] == "add_confirmed_quote_item" for action in manifest["quoteResolutionActions"]))
            self.assertTrue(any(asset["key"] == "business_license" and asset["status"] == "demo_only" for asset in manifest["assets"]))
            manifest_schema = json.loads((output_dir / "asset-manifest.schema.json").read_text(encoding="utf-8"))
            self.assertIn("demo_only", manifest_schema["statusEnum"])
            self.assertEqual(manifest_schema["counters"]["replacementRequiredAssetCount"], "number")
            markdown = (output_dir / "材料收集清单.md").read_text(encoding="utf-8")
            self.assertIn("## 正式构建阻断项", markdown)
            self.assertIn("## 报价差额处理建议", markdown)
            self.assertIn("新增经确认的真实分项", markdown)
            self.assertIn("需替换演示附件：18", markdown)
            quote_resolution_schema = json.loads((output_dir / "quote-resolution.schema.json").read_text(encoding="utf-8"))
            self.assertIn("add_confirmed_quote_item", quote_resolution_schema["selectedActionEnum"])

    def test_bid_document_import_asset_package_command_applies_collection_folder(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            output_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_payload = self.run_json(
                "bid-document-init-config",
                "--template-id",
                "smart-canteen-response",
                "--output-json",
                str(config_path),
                "--with-demo-assets",
            )
            self.assertTrue(init_payload["ok"], init_payload.get("stderr"))
            package_payload = self.run_json(
                "bid-document-asset-package",
                "--input",
                str(config_path),
                "--output-dir",
                str(output_dir),
            )
            self.assertTrue(package_payload["ok"], package_payload.get("stderr"))
            manifest = json.loads((output_dir / "asset-manifest.json").read_text(encoding="utf-8"))
            business_license_asset = next(asset for asset in manifest["assets"] if asset["key"] == "business_license")
            target_path = output_dir / business_license_asset["targetFile"]
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_bytes(ONE_PIXEL_PNG)

            payload = self.run_json(
                "bid-document-import-asset-package",
                "--input",
                str(config_path),
                "--package-dir",
                str(output_dir),
                "--output-json",
                str(updated_config_path),
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertTrue(updated_config_path.exists())
            self.assertEqual(payload["applied_count"], 1)
            self.assertGreater(payload["missing_required_count"], 0)
            self.assertFalse(payload["validation_passed"])
            self.assertEqual(Path(payload["manifest_schema_path"]), output_dir / "asset-manifest.schema.json")
            updated_config = json.loads(updated_config_path.read_text(encoding="utf-8"))
            self.assertEqual(updated_config["assetMap"]["business_license"]["filePath"], str(target_path))
            self.assertEqual(updated_config["assetMap"]["iso9001"]["filePath"], "")

    def test_bid_document_import_asset_package_command_rejects_unsupported_manifest_version(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            output_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_payload = self.run_json(
                "bid-document-init-config",
                "--template-id",
                "smart-canteen-response",
                "--output-json",
                str(config_path),
                "--with-demo-assets",
            )
            self.assertTrue(init_payload["ok"], init_payload.get("stderr"))
            package_payload = self.run_json(
                "bid-document-asset-package",
                "--input",
                str(config_path),
                "--output-dir",
                str(output_dir),
            )
            self.assertTrue(package_payload["ok"], package_payload.get("stderr"))
            manifest_path = output_dir / "asset-manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["version"] = 2
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

            payload = self.run_json_allow_failure(
                "bid-document-import-asset-package",
                "--input",
                str(config_path),
                "--package-dir",
                str(output_dir),
                "--output-json",
                str(updated_config_path),
            )

            self.assertFalse(payload["ok"])
            self.assertNotEqual(payload["_returncode"], 0)
            self.assertIn("unsupported_asset_manifest_version:2", payload.get("stderr", ""))
            self.assertFalse(updated_config_path.exists())

    def test_bid_document_import_asset_package_command_rejects_target_file_outside_package(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            output_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_payload = self.run_json(
                "bid-document-init-config",
                "--template-id",
                "smart-canteen-response",
                "--output-json",
                str(config_path),
                "--with-demo-assets",
            )
            self.assertTrue(init_payload["ok"], init_payload.get("stderr"))
            package_payload = self.run_json(
                "bid-document-asset-package",
                "--input",
                str(config_path),
                "--output-dir",
                str(output_dir),
            )
            self.assertTrue(package_payload["ok"], package_payload.get("stderr"))
            manifest_path = output_dir / "asset-manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            business_license_asset = next(asset for asset in manifest["assets"] if asset["key"] == "business_license")
            business_license_asset["targetFile"] = "../outside.png"
            (root / "outside.png").write_bytes(ONE_PIXEL_PNG)
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

            payload = self.run_json_allow_failure(
                "bid-document-import-asset-package",
                "--input",
                str(config_path),
                "--package-dir",
                str(output_dir),
                "--output-json",
                str(updated_config_path),
            )

            self.assertFalse(payload["ok"])
            self.assertNotEqual(payload["_returncode"], 0)
            self.assertIn("invalid_asset_target_file:outside_package:business_license:../outside.png", payload.get("stderr", ""))
            self.assertFalse(updated_config_path.exists())

    def test_bid_document_import_asset_package_command_applies_quote_resolution(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            output_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_payload = self.run_json(
                "bid-document-init-config",
                "--template-id",
                "smart-canteen-response",
                "--output-json",
                str(config_path),
                "--with-demo-assets",
            )
            self.assertTrue(init_payload["ok"], init_payload.get("stderr"))
            package_payload = self.run_json(
                "bid-document-asset-package",
                "--input",
                str(config_path),
                "--output-dir",
                str(output_dir),
            )
            self.assertTrue(package_payload["ok"], package_payload.get("stderr"))
            quote_resolution_path = output_dir / "quote-resolution.json"
            quote_resolution = json.loads(quote_resolution_path.read_text(encoding="utf-8"))
            quote_resolution["selectedAction"] = "confirm_project_total"
            quote_resolution["projectDataPatch"] = {
                "totalWithTax": 133050,
                "totalWithoutTax": 117743.36,
            }
            quote_resolution_path.write_text(json.dumps(quote_resolution, ensure_ascii=False, indent=2), encoding="utf-8")

            payload = self.run_json(
                "bid-document-import-asset-package",
                "--input",
                str(config_path),
                "--package-dir",
                str(output_dir),
                "--output-json",
                str(updated_config_path),
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertTrue(payload["quote_resolution_applied"])
            self.assertEqual(payload["quote_resolution_action"], "confirm_project_total")
            updated_config = json.loads(updated_config_path.read_text(encoding="utf-8"))
            self.assertEqual(updated_config["projectData"]["totalWithTax"], 133050)
            self.assertNotIn("quote_items total should equal project totalWithTax", "\n".join(payload["build_log"]["errors"]))

    def test_bid_document_import_asset_package_command_rejects_mismatched_quote_resolution_action_data(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            output_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_payload = self.run_json(
                "bid-document-init-config",
                "--template-id",
                "smart-canteen-response",
                "--output-json",
                str(config_path),
                "--with-demo-assets",
            )
            self.assertTrue(init_payload["ok"], init_payload.get("stderr"))
            package_payload = self.run_json(
                "bid-document-asset-package",
                "--input",
                str(config_path),
                "--output-dir",
                str(output_dir),
            )
            self.assertTrue(package_payload["ok"], package_payload.get("stderr"))
            quote_resolution_path = output_dir / "quote-resolution.json"
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

            payload = self.run_json(
                "bid-document-import-asset-package",
                "--input",
                str(config_path),
                "--package-dir",
                str(output_dir),
                "--output-json",
                str(updated_config_path),
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertFalse(payload["quote_resolution_applied"])
            self.assertIn("quote_resolution_action_requires_project_data_patch:confirm_project_total", "\n".join(payload["quote_resolution_errors"]))
            self.assertIn("quote_resolution_action_forbids_quote_item_changes:confirm_project_total", "\n".join(payload["quote_resolution_errors"]))
            updated_config = json.loads(updated_config_path.read_text(encoding="utf-8"))
            self.assertEqual(updated_config["projectData"]["totalWithTax"], 135050)
            self.assertFalse(any(item["brandModel"] == "INVALID-ITEM" for item in updated_config["quoteItems"]))

    def test_bid_document_import_asset_package_command_rejects_quote_resolution_tax_policy_mismatch(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            output_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_payload = self.run_json(
                "bid-document-init-config",
                "--template-id",
                "smart-canteen-response",
                "--output-json",
                str(config_path),
                "--with-demo-assets",
            )
            self.assertTrue(init_payload["ok"], init_payload.get("stderr"))
            package_payload = self.run_json(
                "bid-document-asset-package",
                "--input",
                str(config_path),
                "--output-dir",
                str(output_dir),
            )
            self.assertTrue(package_payload["ok"], package_payload.get("stderr"))
            quote_resolution_path = output_dir / "quote-resolution.json"
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

            payload = self.run_json(
                "bid-document-import-asset-package",
                "--input",
                str(config_path),
                "--package-dir",
                str(output_dir),
                "--output-json",
                str(updated_config_path),
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertFalse(payload["quote_resolution_applied"])
            self.assertIn(
                "quote_resolution_post_apply_quote_check:quote_items[6] taxRate should match projectData.taxPolicy.softwareHardwareRate for software",
                "\n".join(payload["quote_resolution_errors"]),
            )
            updated_config = json.loads(updated_config_path.read_text(encoding="utf-8"))
            self.assertFalse(any(item["brandModel"] == "CONFIRMED-DIFF-ITEM" for item in updated_config["quoteItems"]))

    def test_bid_document_import_asset_package_command_rejects_quote_resolution_template_mismatch(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "smart-canteen-init-config.json"
            output_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_payload = self.run_json(
                "bid-document-init-config",
                "--template-id",
                "smart-canteen-response",
                "--output-json",
                str(config_path),
                "--with-demo-assets",
            )
            self.assertTrue(init_payload["ok"], init_payload.get("stderr"))
            package_payload = self.run_json(
                "bid-document-asset-package",
                "--input",
                str(config_path),
                "--output-dir",
                str(output_dir),
            )
            self.assertTrue(package_payload["ok"], package_payload.get("stderr"))
            quote_resolution_path = output_dir / "quote-resolution.json"
            quote_resolution = json.loads(quote_resolution_path.read_text(encoding="utf-8"))
            quote_resolution["templateId"] = "generic-response"
            quote_resolution["selectedAction"] = "confirm_project_total"
            quote_resolution["projectDataPatch"] = {
                "totalWithTax": 133050,
                "totalWithoutTax": 117743.36,
            }
            quote_resolution_path.write_text(json.dumps(quote_resolution, ensure_ascii=False, indent=2), encoding="utf-8")

            payload = self.run_json(
                "bid-document-import-asset-package",
                "--input",
                str(config_path),
                "--package-dir",
                str(output_dir),
                "--output-json",
                str(updated_config_path),
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertFalse(payload["quote_resolution_applied"])
            self.assertIn("quote_resolution_template_mismatch:generic-response:smart-canteen-response", "\n".join(payload["quote_resolution_errors"]))
            updated_config = json.loads(updated_config_path.read_text(encoding="utf-8"))
            self.assertEqual(updated_config["projectData"]["totalWithTax"], 135050)

    def test_bid_document_import_asset_package_command_rejects_manifest_template_mismatch_with_build_log(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            smart_config_path = root / "smart-canteen-init-config.json"
            generic_config_path = write_generic_bid_document_config(root)
            output_dir = root / "asset-package"
            updated_config_path = root / "updated-config.json"
            init_payload = self.run_json(
                "bid-document-init-config",
                "--template-id",
                "smart-canteen-response",
                "--output-json",
                str(smart_config_path),
                "--with-demo-assets",
            )
            self.assertTrue(init_payload["ok"], init_payload.get("stderr"))
            package_payload = self.run_json(
                "bid-document-asset-package",
                "--input",
                str(smart_config_path),
                "--output-dir",
                str(output_dir),
            )
            self.assertTrue(package_payload["ok"], package_payload.get("stderr"))

            payload = self.run_json_allow_failure(
                "bid-document-import-asset-package",
                "--input",
                str(generic_config_path),
                "--package-dir",
                str(output_dir),
                "--output-json",
                str(updated_config_path),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["error"], "asset_package_template_mismatch")
            self.assertFalse(updated_config_path.exists())
            self.assertIn("asset_package_template_mismatch:smart-canteen-response:generic-response", "\n".join(payload["build_log"]["errors"]))
            self.assertEqual(payload["build_log"]["quoteCheck"]["errors"], ["not_run"])

    def test_bid_document_import_asset_package_command_rejects_unknown_template_id_with_complete_build_log(self):
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

            payload = self.run_json_allow_failure(
                "bid-document-import-asset-package",
                "--input",
                str(config_path),
                "--package-dir",
                str(package_dir),
                "--output-json",
                str(updated_config_path),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["error"], "unknown_template_id")
            self.assertFalse(updated_config_path.exists())
            assert_complete_template_error_build_log(self, payload["build_log"])

    def test_bid_document_validate_config_command_outputs_build_log(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            output_path = root / "validation-log.json"

            payload = self.run_json(
                "bid-document-validate-config",
                "--input",
                str(config_path),
                "--output-json",
                str(output_path),
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertTrue(output_path.exists())
            self.assertEqual(payload["template_id"], "generic-response")
            self.assertEqual(payload["quote_total"], 300)
            self.assertEqual(payload["target_total"], 300)
            self.assertTrue(payload["build_log"]["passed"])
            self.assertTrue(payload["build_log"]["forbiddenWordsCheck"]["passed"])

    def test_bid_document_validate_config_command_resolves_sidecar_assets(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            output_path = root / "validation-log.json"

            payload = self.run_json(
                "bid-document-validate-config",
                "--input",
                str(config_path),
                "--output-json",
                str(output_path),
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertTrue(output_path.exists())
            self.assertTrue(payload["build_log"]["assetCheck"]["passed"])
            self.assertEqual(payload["build_log"]["assetCheck"]["details"]["checked"], 3)

    def test_bid_document_validate_config_command_ignores_disabled_optional_section_asset(self):
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

            payload = self.run_json(
                "bid-document-validate-config",
                "--input",
                str(config_path),
                "--output-json",
                str(output_path),
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertTrue(output_path.exists())
            self.assertTrue(payload["build_log"]["assetCheck"]["passed"])
            self.assertTrue(payload["build_log"]["forbiddenWordsCheck"]["passed"])
            self.assertEqual(payload["build_log"]["assetCheck"]["details"]["checked"], 3)
            errors = "\n".join(payload["build_log"]["errors"])
            self.assertNotIn("missing_asset_file:backup_service_proof", errors)
            self.assertNotIn("missing_assets:backup_service_proof", errors)
            self.assertNotIn("forbidden word found: 待补", errors)

    def test_bid_document_validate_config_command_rejects_invalid_asset_file_signature(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            (root / "generic-bid-document-config.assets" / "qualification_scan.png").write_text("not a png file", encoding="utf-8")
            output_path = root / "validation-log.json"

            payload = self.run_json_allow_failure(
                "bid-document-validate-config",
                "--input",
                str(config_path),
                "--output-json",
                str(output_path),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertTrue(output_path.exists())
            self.assertFalse(payload["build_log"]["assetCheck"]["passed"])
            self.assertIn("invalid_asset_file_signature:qualification_scan:.png", "\n".join(payload["build_log"]["errors"]))
            self.assertEqual(payload["build_log"]["assetCheck"]["details"]["invalid_asset_file_signatures"], ["qualification_scan"])

    def test_bid_document_validate_config_command_rejects_malformed_asset_mapping_records(self):
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

            payload = self.run_json_allow_failure(
                "bid-document-validate-config",
                "--input",
                str(config_path),
                "--output-json",
                str(output_path),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertTrue(output_path.exists())
            self.assertFalse(payload["build_log"]["assetCheck"]["passed"])
            errors = "\n".join(payload["build_log"]["errors"])
            self.assertIn("assetMap.qualification_scan.key should equal map key", errors)
            self.assertIn("assetMap.qualification_scan.title is required", errors)
            self.assertIn("assetMap.qualification_scan.type should be image|scan|document", errors)
            self.assertIn("assetMap.qualification_scan.required should be boolean", errors)
            self.assertIn("assetMap.qualification_scan.sectionId does not exist in template: not-in-template", errors)
            self.assertEqual(payload["build_log"]["assetCheck"]["details"]["invalid_asset_required_values"], ["qualification_scan"])

    def test_bid_document_validate_config_command_rejects_unsupported_project_config_version(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["version"] = 2
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = root / "validation-log.json"

            payload = self.run_json_allow_failure(
                "bid-document-validate-config",
                "--input",
                str(config_path),
                "--output-json",
                str(output_path),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertIn("unsupported_project_config_version:2", payload.get("stderr", ""))
            self.assertFalse(output_path.exists())

    def test_bid_document_validate_config_command_rejects_missing_quote_items_without_template_fallback(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config.pop("quoteItems")
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = root / "validation-log.json"

            payload = self.run_json_allow_failure(
                "bid-document-validate-config",
                "--input",
                str(config_path),
                "--output-json",
                str(output_path),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertIn("invalid_project_config:quoteItems_not_array", payload.get("stderr", ""))
            self.assertFalse(output_path.exists())

    def test_bid_document_build_config_command_generates_word_from_project_config(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            output_docx = root / "generic-response-from-config.docx"
            output_json = root / "generic-response-from-config.build.json"

            payload = self.run_json(
                "bid-document-build-config",
                "--input",
                str(config_path),
                "--output",
                str(output_docx),
                "--output-json",
                str(output_json),
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertTrue(output_docx.exists())
            self.assertTrue(output_json.exists())
            self.assertGreater(payload["bytes"], 0)
            self.assertTrue(payload["build_log"]["docxOpenCheck"]["passed"])
            self.assertTrue(payload["build_log"]["docxQuoteIntegrityCheck"]["passed"])
            self.assertTrue(payload["build_log"]["imageInsertionCheck"]["passed"])
            with zipfile.ZipFile(output_docx) as archive:
                document_xml = archive.read("word/document.xml").decode("utf-8")
            self.assertIn("通用完整标书校验项目", document_xml)
            self.assertIn("GEN-DEVICE-100", document_xml)

    def test_bid_document_build_config_command_ignores_disabled_optional_section_asset(self):
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

            payload = self.run_json(
                "bid-document-build-config",
                "--input",
                str(config_path),
                "--output",
                str(output_docx),
                "--output-json",
                str(output_json),
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertTrue(output_docx.exists())
            self.assertTrue(output_json.exists())
            self.assertTrue(payload["build_log"]["passed"])
            self.assertTrue(payload["build_log"]["assetCheck"]["passed"])
            self.assertTrue(payload["build_log"]["forbiddenWordsCheck"]["passed"])
            self.assertEqual(payload["build_log"]["assetCheck"]["details"]["checked"], 3)
            self.assertEqual(payload["build_log"]["imageInsertionCheck"]["details"]["expectedImageAssetCount"], 3)
            errors = "\n".join(payload["build_log"]["errors"])
            self.assertNotIn("missing_asset_file:backup_service_proof", errors)
            self.assertNotIn("missing_assets:backup_service_proof", errors)
            self.assertNotIn("forbidden word found: 待补", errors)
            with zipfile.ZipFile(output_docx) as archive:
                document_xml = archive.read("word/document.xml").decode("utf-8")
            self.assertNotIn("待补后备服务证明材料", document_xml)
            self.assertNotIn("后备服务", document_xml)

    def test_bid_document_build_config_command_rejects_invalid_config_without_creating_docx(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["assetMap"]["qualification_scan"]["filePath"] = "./generic-bid-document-config.assets/missing-qualification.png"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_docx = root / "should-not-exist.docx"
            output_json = root / "failed-build.json"

            payload = self.run_json_allow_failure(
                "bid-document-build-config",
                "--input",
                str(config_path),
                "--output",
                str(output_docx),
                "--output-json",
                str(output_json),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertFalse(output_docx.exists())
            self.assertTrue(output_json.exists())
            self.assertEqual(payload["bytes"], 0)
            self.assertFalse(payload["build_log"]["assetCheck"]["passed"])
            self.assertEqual(payload["build_log"]["docxOpenCheck"]["errors"], ["not_run"])
            self.assertEqual(payload["build_log"]["imageInsertionCheck"]["errors"], ["not_run"])
            self.assertEqual(payload["build_log"]["docxForbiddenWordsCheck"]["errors"], ["not_run"])
            self.assertIn("missing_assets:qualification_scan", "\n".join(payload["build_log"]["errors"]))

    def test_bid_document_build_config_command_rejects_forbidden_words_without_creating_docx(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["projectData"]["projectName"] = "内容由 AI 生成"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_docx = root / "should-not-exist.docx"
            output_json = root / "failed-build.json"

            payload = self.run_json_allow_failure(
                "bid-document-build-config",
                "--input",
                str(config_path),
                "--output",
                str(output_docx),
                "--output-json",
                str(output_json),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertFalse(output_docx.exists())
            self.assertTrue(output_json.exists())
            self.assertEqual(payload["bytes"], 0)
            self.assertFalse(payload["build_log"]["forbiddenWordsCheck"]["passed"])
            self.assertEqual(payload["build_log"]["docxForbiddenWordsCheck"]["errors"], ["not_run"])
            self.assertIn("forbidden word found: 内容由 AI 生成", "\n".join(payload["build_log"]["errors"]))

    def test_bid_document_build_config_command_rejects_unsupported_project_config_version_without_creating_docx(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["version"] = 2
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_docx = root / "should-not-exist.docx"
            output_json = root / "failed-build.json"

            payload = self.run_json_allow_failure(
                "bid-document-build-config",
                "--input",
                str(config_path),
                "--output",
                str(output_docx),
                "--output-json",
                str(output_json),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertIn("unsupported_project_config_version:2", payload.get("stderr", ""))
            self.assertFalse(output_docx.exists())
            self.assertFalse(output_json.exists())

    def test_bid_document_build_config_command_rejects_missing_quote_items_without_creating_docx(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root, relative_assets=True)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config.pop("quoteItems")
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_docx = root / "should-not-exist.docx"
            output_json = root / "failed-build.json"

            payload = self.run_json_allow_failure(
                "bid-document-build-config",
                "--input",
                str(config_path),
                "--output",
                str(output_docx),
                "--output-json",
                str(output_json),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertIn("invalid_project_config:quoteItems_not_array", payload.get("stderr", ""))
            self.assertFalse(output_docx.exists())
            self.assertFalse(output_json.exists())

    def test_bid_document_validate_config_command_rejects_unknown_template_id(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["templateId"] = "unknown-response-template"
            config["projectData"]["templateId"] = "unknown-response-template"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = root / "validation-log.json"

            payload = self.run_json_allow_failure(
                "bid-document-validate-config",
                "--input",
                str(config_path),
                "--output-json",
                str(output_path),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["error"], "unknown_template_id")
            self.assertEqual(payload["template_id"], "unknown-response-template")
            self.assertIn("generic-response", payload["available_template_ids"])
            self.assertTrue(output_path.exists())
            assert_complete_template_error_build_log(self, payload["build_log"])
            saved = json.loads(output_path.read_text(encoding="utf-8"))
            assert_complete_template_error_build_log(self, saved["build_log"])

    def test_bid_document_build_config_command_rejects_unknown_template_id_with_complete_build_log(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["templateId"] = "unknown-response-template"
            config["projectData"]["templateId"] = "unknown-response-template"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_docx = root / "should-not-exist.docx"
            output_json = root / "failed-build.json"

            payload = self.run_json_allow_failure(
                "bid-document-build-config",
                "--input",
                str(config_path),
                "--output",
                str(output_docx),
                "--output-json",
                str(output_json),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["error"], "unknown_template_id")
            self.assertFalse(output_docx.exists())
            self.assertTrue(output_json.exists())
            assert_complete_template_error_build_log(self, payload["build_log"])

    def test_bid_document_asset_package_command_rejects_unknown_template_id_with_complete_build_log(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["templateId"] = "unknown-response-template"
            config["projectData"]["templateId"] = "unknown-response-template"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_dir = root / "asset-package"

            payload = self.run_json_allow_failure(
                "bid-document-asset-package",
                "--input",
                str(config_path),
                "--output-dir",
                str(output_dir),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertEqual(payload["error"], "unknown_template_id")
            self.assertFalse(output_dir.exists())
            assert_complete_template_error_build_log(self, payload["build_log"])

    def test_bid_document_validate_config_command_rejects_template_identity_mismatch(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["projectData"]["templateId"] = "smart-canteen-response"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = root / "validation-log.json"

            payload = self.run_json_allow_failure(
                "bid-document-validate-config",
                "--input",
                str(config_path),
                "--output-json",
                str(output_path),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertIn(
                "invalid_project_config:templateId_mismatch:generic-response:smart-canteen-response",
                payload.get("stderr", ""),
            )
            self.assertFalse(output_path.exists())

    def test_bid_document_validate_config_command_rejects_invalid_payment_ratios(self):
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

            payload = self.run_json_allow_failure(
                "bid-document-validate-config",
                "--input",
                str(config_path),
                "--output-json",
                str(output_path),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertFalse(payload["build_log"]["paymentCheck"]["passed"])
            self.assertIn("payment_terms[0] ratio should be greater than 0 and less than or equal to 100", "\n".join(payload["build_log"]["errors"]))
            self.assertTrue(output_path.exists())

    def test_bid_document_validate_config_command_rejects_invalid_quote_amounts(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["projectData"]["totalWithoutTax"] = 0
            config["quoteItems"][0]["unitPriceWithTax"] = 0
            config["quoteItems"][0]["totalWithTax"] = 0
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = root / "validation-log.json"

            payload = self.run_json_allow_failure(
                "bid-document-validate-config",
                "--input",
                str(config_path),
                "--output-json",
                str(output_path),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertFalse(payload["build_log"]["quoteCheck"]["passed"])
            errors = "\n".join(payload["build_log"]["errors"])
            self.assertIn("projectData.totalWithoutTax should be greater than 0", errors)
            self.assertIn("quote_items[0] unitPriceWithTax should be greater than 0", errors)
            self.assertTrue(output_path.exists())

    def test_bid_document_validate_config_command_rejects_quote_tax_policy_mismatch(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = write_generic_bid_document_config(root)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["quoteItems"][0]["taxRate"] = 0.06
            config["quoteItems"][1]["category"] = "contract"
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = root / "validation-log.json"

            payload = self.run_json_allow_failure(
                "bid-document-validate-config",
                "--input",
                str(config_path),
                "--output-json",
                str(output_path),
            )

            self.assertNotEqual(payload["_returncode"], 0)
            self.assertFalse(payload["ok"])
            self.assertFalse(payload["build_log"]["quoteCheck"]["passed"])
            errors = "\n".join(payload["build_log"]["errors"])
            self.assertIn("quote_items[0] taxRate should match projectData.taxPolicy.softwareHardwareRate for software", errors)
            self.assertIn("quote_items[1] category should be software|hardware|service|material|other", errors)
            self.assertEqual(payload["build_log"]["quoteCheck"]["details"]["invalidQuoteCategories"], ["1:contract"])
            self.assertEqual(
                payload["build_log"]["quoteCheck"]["details"]["mismatchedQuoteTaxRates"],
                ["0:software:0.06->softwareHardwareRate:0.13"],
            )
            self.assertTrue(output_path.exists())

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

    def test_export_report_command_outputs_business_bid_xlsx(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            state_path = root / "business-bid-state.json"
            output_path = root / "business-bid-report.xlsx"
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
            }, ensure_ascii=False), encoding="utf-8")

            payload = self.run_json(
                "export-report",
                "--kind",
                "business-bid",
                "--state-json",
                str(state_path),
                "--output",
                str(output_path),
                "--format",
                "xlsx",
            )

            self.assertTrue(payload["ok"], payload.get("stderr"))
            self.assertEqual(payload["kind"], "business-bid")
            self.assertEqual(payload["format"], "xlsx")
            self.assertTrue(output_path.exists())
            with zipfile.ZipFile(output_path) as archive:
                workbook_xml = archive.read("xl/workbook.xml").decode("utf-8")
                worksheet_xml = "\n".join(
                    archive.read(name).decode("utf-8")
                    for name in archive.namelist()
                    if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
                )
            self.assertIn("商务响应表", workbook_xml)
            self.assertIn("付款周期为验收后30日内。", worksheet_xml)


if __name__ == "__main__":
    unittest.main()
