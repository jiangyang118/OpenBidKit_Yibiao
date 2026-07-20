from __future__ import annotations

import json
import os
import platform
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


HARNESS_ROOT = Path(__file__).resolve().parents[3]
REPO_ROOT = HARNESS_ROOT.parent
CLIENT_ROOT = REPO_ROOT / "client"
ANALYTICS_ROOT = REPO_ROOT / "analytics"
EXPORT_REPORT_HELPER = HARNESS_ROOT / "cli_anything" / "openbidkit_yibiao" / "scripts" / "export_report.cjs"
TASK_PLAN_HELPER = HARNESS_ROOT / "cli_anything" / "openbidkit_yibiao" / "scripts" / "task_plan.cjs"
PROJECT_WORKSPACE_HELPER = HARNESS_ROOT / "cli_anything" / "openbidkit_yibiao" / "scripts" / "project_workspace.cjs"
BID_DOCUMENT_SAMPLE_HELPER = HARNESS_ROOT / "cli_anything" / "openbidkit_yibiao" / "scripts" / "bid_document_sample.cjs"
BID_DOCUMENT_ANALYZE_REFERENCE_HELPER = HARNESS_ROOT / "cli_anything" / "openbidkit_yibiao" / "scripts" / "bid_document_analyze_reference.cjs"
BID_DOCUMENT_TEMPLATE_INFO_HELPER = HARNESS_ROOT / "cli_anything" / "openbidkit_yibiao" / "scripts" / "bid_document_template_info.cjs"
BID_DOCUMENT_VALIDATE_CONFIG_HELPER = HARNESS_ROOT / "cli_anything" / "openbidkit_yibiao" / "scripts" / "bid_document_validate_config.cjs"
BID_DOCUMENT_BUILD_CONFIG_HELPER = HARNESS_ROOT / "cli_anything" / "openbidkit_yibiao" / "scripts" / "bid_document_build_config.cjs"
BID_DOCUMENT_INIT_CONFIG_HELPER = HARNESS_ROOT / "cli_anything" / "openbidkit_yibiao" / "scripts" / "bid_document_init_config.cjs"
BID_DOCUMENT_READINESS_REPORT_HELPER = HARNESS_ROOT / "cli_anything" / "openbidkit_yibiao" / "scripts" / "bid_document_readiness_report.cjs"
BID_DOCUMENT_ASSET_PACKAGE_HELPER = HARNESS_ROOT / "cli_anything" / "openbidkit_yibiao" / "scripts" / "bid_document_asset_package.cjs"
BID_DOCUMENT_IMPORT_ASSET_PACKAGE_HELPER = HARNESS_ROOT / "cli_anything" / "openbidkit_yibiao" / "scripts" / "bid_document_import_asset_package.cjs"

REPORT_FORMATS_BY_KIND = {
    "duplicate": ["md", "docx", "pdf"],
    "rejection": ["md", "docx", "pdf"],
    "business-bid": ["md", "docx", "xlsx"],
    "ai-evaluation": ["md", "docx", "xlsx"],
    "bid-opportunity": ["md"],
}


@dataclass(frozen=True)
class CommandSpec:
    key: str
    cwd: Path
    command: list[str]
    description: str


def read_json_file(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def package_scripts(path: Path) -> list[str]:
    if not path.exists():
        return []
    data = read_json_file(path)
    return sorted((data.get("scripts") or {}).keys())


def default_user_data_path() -> Path:
    override = os.environ.get("YIBIAO_USER_DATA")
    if override:
        return Path(override).expanduser()
    system = platform.system().lower()
    home = Path.home()
    if system == "darwin":
        return home / "Library" / "Application Support" / "yibiao-client"
    if system == "windows":
        return Path(os.environ.get("APPDATA", home / "AppData" / "Roaming")) / "yibiao-client"
    return home / ".config" / "yibiao-client"


def workspace_status() -> dict[str, Any]:
    user_data = default_user_data_path()
    workspace = user_data / "workspace"
    sqlite_path = workspace / "yibiao.sqlite"
    technical_plan_cache = workspace / "technical_plan.json"
    return {
        "user_data": str(user_data),
        "workspace": str(workspace),
        "workspace_exists": workspace.exists(),
        "sqlite_path": str(sqlite_path),
        "sqlite_exists": sqlite_path.exists(),
        "technical_plan_cache": str(technical_plan_cache),
        "technical_plan_cache_exists": technical_plan_cache.exists(),
    }


def project_status() -> dict[str, Any]:
    client_package = CLIENT_ROOT / "package.json"
    worker_package = ANALYTICS_ROOT / "worker" / "package.json"
    dashboard_package = ANALYTICS_ROOT / "dashboard" / "package.json"
    plan_path = REPO_ROOT / "plan.md"
    return {
        "software": "OpenBidKit_Yibiao",
        "repo_root": str(REPO_ROOT),
        "client": {
            "root": str(CLIENT_ROOT),
            "package_exists": client_package.exists(),
            "scripts": package_scripts(client_package),
        },
        "analytics_worker": {
            "root": str(ANALYTICS_ROOT / "worker"),
            "package_exists": worker_package.exists(),
            "scripts": package_scripts(worker_package),
        },
        "analytics_dashboard": {
            "root": str(ANALYTICS_ROOT / "dashboard"),
            "package_exists": dashboard_package.exists(),
            "scripts": package_scripts(dashboard_package),
        },
        "plan": {
            "path": str(plan_path),
            "exists": plan_path.exists(),
            "bytes": plan_path.stat().st_size if plan_path.exists() else 0,
        },
        "workspace": workspace_status(),
    }


def plan_summary() -> dict[str, Any]:
    plan_path = REPO_ROOT / "plan.md"
    text = plan_path.read_text(encoding="utf-8") if plan_path.exists() else ""
    headings = [line.strip() for line in text.splitlines() if line.startswith("### ")]
    completed_markers = text.count("已补充") + text.count("已完成") + text.count("已通过")
    required_pending_markers = text.count("待完成")
    in_progress_markers = len(re.findall(r"状态：`?in_progress`?", text))
    blocked_items = [
        line.strip()
        for line in text.splitlines()
        if re.match(r"\d+\.\s+`blocked`", line.strip())
    ]
    sample_blocker_keywords = (
        "样本文档",
        "参考 docx",
        "参考样本文档",
        "真实附件资产",
        "报价差额",
        "分项报价",
    )
    sample_blocked_items = [
        item
        for item in blocked_items
        if any(keyword in item for keyword in sample_blocker_keywords)
    ]
    capability_blocked_items = [
        item
        for item in blocked_items
        if item not in sample_blocked_items
    ]
    optional_enhancement_markers = text.count("待增强") + text.count("可选增强") + text.count("后续")
    external_dependency_notes = [
        line.strip()
        for line in text.splitlines()
        if (
            "YIBIAO_MINERU_TOKEN" in line
            or "MinerU 精准解析真实网络" in line
            or "阻塞原因" in line
            or "参考 docx 尚未提供" in line
            or "真实附件资产未提供" in line
        )
    ][:5]
    if required_pending_markers:
        completion_status = "has-required-pending"
    elif capability_blocked_items:
        completion_status = "blocked-external-input"
    elif sample_blocked_items:
        completion_status = "required-complete-with-sample-blockers"
    elif in_progress_markers:
        completion_status = "in-progress"
    else:
        completion_status = "required-complete"
    return {
        "path": str(plan_path),
        "exists": plan_path.exists(),
        "headings": headings,
        "heading_count": len(headings),
        "completed_markers": completed_markers,
        "pending_markers": required_pending_markers,
        "required_pending_markers": required_pending_markers,
        "in_progress_markers": in_progress_markers,
        "blocked_items": blocked_items,
        "blocked_count": len(blocked_items),
        "sample_blocked_items": sample_blocked_items,
        "sample_blocked_count": len(sample_blocked_items),
        "capability_blocked_items": capability_blocked_items,
        "capability_blocked_count": len(capability_blocked_items),
        "optional_enhancement_markers": optional_enhancement_markers,
        "completion_status": completion_status,
        "external_dependency_notes": external_dependency_notes,
    }


def smoke_command_specs() -> dict[str, CommandSpec]:
    return {
        "main-syntax": CommandSpec(
            key="main-syntax",
            cwd=CLIENT_ROOT,
            command=[
                "node",
                "--check",
                "electron/services/fileService.cjs",
            ],
            description="Check Electron Main file parser service syntax.",
        ),
        "preload-syntax": CommandSpec(
            key="preload-syntax",
            cwd=CLIENT_ROOT,
            command=["node", "--check", "electron/preload.cjs"],
            description="Check preload bridge syntax.",
        ),
        "client-unit": CommandSpec(
            key="client-unit",
            cwd=CLIENT_ROOT,
            command=["npm", "run", "test:unit"],
            description="Run client Vitest unit suite.",
        ),
        "worker-test": CommandSpec(
            key="worker-test",
            cwd=ANALYTICS_ROOT / "worker",
            command=["npm", "run", "test"],
            description="Run analytics Worker syntax checks and Node tests.",
        ),
        "dashboard-test": CommandSpec(
            key="dashboard-test",
            cwd=ANALYTICS_ROOT / "dashboard",
            command=["npm", "run", "test"],
            description="Run analytics Dashboard syntax checks and Node tests.",
        ),
    }


def run_command(spec: CommandSpec, timeout: int = 120) -> dict[str, Any]:
    started = {
        "key": spec.key,
        "cwd": str(spec.cwd),
        "command": spec.command,
        "description": spec.description,
    }
    try:
        completed = subprocess.run(
            spec.command,
            cwd=spec.cwd,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
        return {
            **started,
            "returncode": completed.returncode,
            "ok": completed.returncode == 0,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
        }
    except subprocess.TimeoutExpired as exc:
        return {
            **started,
            "returncode": None,
            "ok": False,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
            "timeout": timeout,
            "error": "timeout",
        }


def run_smoke(checks: list[str] | None = None, timeout: int = 120) -> dict[str, Any]:
    specs = smoke_command_specs()
    selected = checks or ["main-syntax", "preload-syntax"]
    unknown = [key for key in selected if key not in specs]
    if unknown:
        return {
            "ok": False,
            "unknown_checks": unknown,
            "available_checks": sorted(specs.keys()),
            "results": [],
        }
    results = [run_command(specs[key], timeout=timeout) for key in selected]
    return {
        "ok": all(result["ok"] for result in results),
        "results": results,
        "available_checks": sorted(specs.keys()),
    }


def export_report(kind: str, state_json: Path, output: Path, timeout: int = 60, format: str = "md") -> dict[str, Any]:
    normalized_kind = str(kind or "").strip()
    normalized_format = str(format or "").strip().lower()
    if normalized_kind not in REPORT_FORMATS_BY_KIND:
        return {
            "ok": False,
            "error": "unknown_report_kind",
            "available_kinds": sorted(REPORT_FORMATS_BY_KIND.keys()),
        }
    if normalized_format not in REPORT_FORMATS_BY_KIND[normalized_kind]:
        return {
            "ok": False,
            "error": "unknown_report_format",
            "available_formats": REPORT_FORMATS_BY_KIND[normalized_kind],
            "kind": normalized_kind,
            "format": normalized_format,
        }
    state_path = Path(state_json).expanduser()
    output_path = Path(output).expanduser()
    if not state_path.exists():
        return {
            "ok": False,
            "error": "state_json_not_found",
            "state_json": str(state_path),
        }
    spec = CommandSpec(
        key=f"export-report:{normalized_kind}",
        cwd=REPO_ROOT,
        command=[
            "node",
            str(EXPORT_REPORT_HELPER),
            "--kind",
            normalized_kind,
            "--state-json",
            str(state_path),
            "--output",
            str(output_path),
            "--format",
            normalized_format,
        ],
        description="Export a Markdown, Word, or PDF report through the real Electron Main report builder.",
    )
    env = os.environ.copy()
    env["OPENBIDKIT_REPO_ROOT"] = str(REPO_ROOT)
    started = {
        "kind": normalized_kind,
        "format": normalized_format,
        "state_json": str(state_path),
        "output": str(output_path),
        "command": spec.command,
        "cwd": str(spec.cwd),
    }
    try:
        completed = subprocess.run(
            spec.command,
            cwd=spec.cwd,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            **started,
            "ok": False,
            "returncode": None,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
            "timeout": timeout,
            "error": "timeout",
        }

    payload: dict[str, Any] = {}
    if completed.stdout.strip():
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            payload = {}
    return {
        **started,
        **payload,
        "ok": completed.returncode == 0 and bool(payload.get("ok", completed.returncode == 0)),
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
    }


def run_task_plan_helper(args: list[str], timeout: int = 30) -> dict[str, Any]:
    spec = CommandSpec(
        key="task-plan",
        cwd=REPO_ROOT,
        command=["node", str(TASK_PLAN_HELPER), *args],
        description="Read real Electron Main task definitions and build a headless task start plan.",
    )
    env = os.environ.copy()
    env["OPENBIDKIT_REPO_ROOT"] = str(REPO_ROOT)
    try:
        completed = subprocess.run(
            spec.command,
            cwd=spec.cwd,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "returncode": None,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
            "timeout": timeout,
            "error": "timeout",
            "command": spec.command,
            "cwd": str(spec.cwd),
        }

    payload: dict[str, Any] = {}
    if completed.stdout.strip():
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            payload = {}
    return {
        **payload,
        "ok": completed.returncode == 0 and bool(payload.get("ok", completed.returncode == 0)),
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "command": spec.command,
        "cwd": str(spec.cwd),
    }


def run_project_workspace_helper(args: list[str], timeout: int = 30) -> dict[str, Any]:
    spec = CommandSpec(
        key="project-workspace",
        cwd=REPO_ROOT,
        command=["node", str(PROJECT_WORKSPACE_HELPER), *args],
        description="Manage project workspaces through the real Electron Main projectWorkspaceStore.",
    )
    env = os.environ.copy()
    env["OPENBIDKIT_REPO_ROOT"] = str(REPO_ROOT)
    try:
        completed = subprocess.run(
            spec.command,
            cwd=spec.cwd,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "returncode": None,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
            "timeout": timeout,
            "error": "timeout",
            "command": spec.command,
            "cwd": str(spec.cwd),
        }

    payload: dict[str, Any] = {}
    if completed.stdout.strip():
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            payload = {}
    return {
        **payload,
        "ok": completed.returncode == 0 and bool(payload.get("ok", completed.returncode == 0)),
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "command": spec.command,
        "cwd": str(spec.cwd),
    }


def run_bid_document_sample_helper(args: list[str], timeout: int = 60) -> dict[str, Any]:
    spec = CommandSpec(
        key="bid-document-sample",
        cwd=REPO_ROOT,
        command=["node", str(BID_DOCUMENT_SAMPLE_HELPER), *args],
        description="Generate a sample bid document through the real Electron Main bid document builder.",
    )
    env = os.environ.copy()
    env["OPENBIDKIT_REPO_ROOT"] = str(REPO_ROOT)
    try:
        completed = subprocess.run(
            spec.command,
            cwd=spec.cwd,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "returncode": None,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
            "timeout": timeout,
            "error": "timeout",
            "command": spec.command,
            "cwd": str(spec.cwd),
        }

    payload: dict[str, Any] = {}
    if completed.stdout.strip():
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            payload = {}
    return {
        **payload,
        "ok": completed.returncode == 0 and bool(payload.get("ok", completed.returncode == 0)),
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "command": spec.command,
        "cwd": str(spec.cwd),
    }


def run_bid_document_reference_helper(args: list[str], timeout: int = 60) -> dict[str, Any]:
    spec = CommandSpec(
        key="bid-document-analyze-reference",
        cwd=REPO_ROOT,
        command=["node", str(BID_DOCUMENT_ANALYZE_REFERENCE_HELPER), *args],
        description="Analyze a reference response-file docx through the real Electron Main bid document analyzer.",
    )
    env = os.environ.copy()
    env["OPENBIDKIT_REPO_ROOT"] = str(REPO_ROOT)
    try:
        completed = subprocess.run(
            spec.command,
            cwd=spec.cwd,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "returncode": None,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
            "timeout": timeout,
            "error": "timeout",
            "command": spec.command,
            "cwd": str(spec.cwd),
        }

    payload: dict[str, Any] = {}
    if completed.stdout.strip():
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            payload = {}
    return {
        **payload,
        "ok": completed.returncode == 0 and bool(payload.get("ok", completed.returncode == 0)),
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "command": spec.command,
        "cwd": str(spec.cwd),
    }


def run_bid_document_template_info_helper(args: list[str], timeout: int = 60) -> dict[str, Any]:
    spec = CommandSpec(
        key="bid-document-template-info",
        cwd=REPO_ROOT,
        command=["node", str(BID_DOCUMENT_TEMPLATE_INFO_HELPER), *args],
        description="Export bid document template schema and asset mapping from the real Electron Main template registry.",
    )
    env = os.environ.copy()
    env["OPENBIDKIT_REPO_ROOT"] = str(REPO_ROOT)
    try:
        completed = subprocess.run(
            spec.command,
            cwd=spec.cwd,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "returncode": None,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
            "timeout": timeout,
            "error": "timeout",
            "command": spec.command,
            "cwd": str(spec.cwd),
        }

    payload: dict[str, Any] = {}
    if completed.stdout.strip():
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            payload = {}
    return {
        **payload,
        "ok": completed.returncode == 0 and bool(payload.get("ok", completed.returncode == 0)),
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "command": spec.command,
        "cwd": str(spec.cwd),
    }


def run_bid_document_validate_config_helper(args: list[str], timeout: int = 60) -> dict[str, Any]:
    spec = CommandSpec(
        key="bid-document-validate-config",
        cwd=REPO_ROOT,
        command=["node", str(BID_DOCUMENT_VALIDATE_CONFIG_HELPER), *args],
        description="Validate a bid document project config through the real Electron Main validation service.",
    )
    env = os.environ.copy()
    env["OPENBIDKIT_REPO_ROOT"] = str(REPO_ROOT)
    try:
        completed = subprocess.run(
            spec.command,
            cwd=spec.cwd,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "returncode": None,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
            "timeout": timeout,
            "error": "timeout",
            "command": spec.command,
            "cwd": str(spec.cwd),
        }

    payload: dict[str, Any] = {}
    if completed.stdout.strip():
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            payload = {}
    return {
        **payload,
        "ok": completed.returncode == 0 and bool(payload.get("ok", completed.returncode == 0)),
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "command": spec.command,
        "cwd": str(spec.cwd),
    }


def run_bid_document_build_config_helper(args: list[str], timeout: int = 60) -> dict[str, Any]:
    spec = CommandSpec(
        key="bid-document-build-config",
        cwd=REPO_ROOT,
        command=["node", str(BID_DOCUMENT_BUILD_CONFIG_HELPER), *args],
        description="Build a Word bid document from project config through the real Electron Main builder.",
    )
    env = os.environ.copy()
    env["OPENBIDKIT_REPO_ROOT"] = str(REPO_ROOT)
    try:
        completed = subprocess.run(
            spec.command,
            cwd=spec.cwd,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "returncode": None,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
            "timeout": timeout,
            "error": "timeout",
            "command": spec.command,
            "cwd": str(spec.cwd),
        }

    payload: dict[str, Any] = {}
    if completed.stdout.strip():
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            payload = {}
    return {
        **payload,
        "ok": completed.returncode == 0 and bool(payload.get("ok", completed.returncode == 0)),
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "command": spec.command,
        "cwd": str(spec.cwd),
    }


def run_bid_document_init_config_helper(args: list[str], timeout: int = 60) -> dict[str, Any]:
    spec = CommandSpec(
        key="bid-document-init-config",
        cwd=REPO_ROOT,
        command=["node", str(BID_DOCUMENT_INIT_CONFIG_HELPER), *args],
        description="Export an editable bid document project config from the real Electron Main template registry.",
    )
    env = os.environ.copy()
    env["OPENBIDKIT_REPO_ROOT"] = str(REPO_ROOT)
    try:
        completed = subprocess.run(
            spec.command,
            cwd=spec.cwd,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "returncode": None,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
            "timeout": timeout,
            "error": "timeout",
            "command": spec.command,
            "cwd": str(spec.cwd),
        }

    payload: dict[str, Any] = {}
    if completed.stdout.strip():
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            payload = {}
    return {
        **payload,
        "ok": completed.returncode == 0 and bool(payload.get("ok", completed.returncode == 0)),
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "command": spec.command,
        "cwd": str(spec.cwd),
    }


def run_bid_document_readiness_report_helper(args: list[str], timeout: int = 60) -> dict[str, Any]:
    spec = CommandSpec(
        key="bid-document-readiness-report",
        cwd=REPO_ROOT,
        command=["node", str(BID_DOCUMENT_READINESS_REPORT_HELPER), *args],
        description="Export a pre-build readiness report from the real bid document validation service.",
    )
    env = os.environ.copy()
    env["OPENBIDKIT_REPO_ROOT"] = str(REPO_ROOT)
    try:
        completed = subprocess.run(
            spec.command,
            cwd=spec.cwd,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "returncode": None,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
            "timeout": timeout,
            "error": "timeout",
            "command": spec.command,
            "cwd": str(spec.cwd),
        }

    payload: dict[str, Any] = {}
    if completed.stdout.strip():
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            payload = {}
    return {
        **payload,
        "ok": completed.returncode == 0 and bool(payload.get("ok", completed.returncode == 0)),
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "command": spec.command,
        "cwd": str(spec.cwd),
    }


def run_node_helper(spec: CommandSpec, timeout: int = 60) -> dict[str, Any]:
    env = os.environ.copy()
    env["OPENBIDKIT_REPO_ROOT"] = str(REPO_ROOT)
    try:
        completed = subprocess.run(
            spec.command,
            cwd=spec.cwd,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "returncode": None,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
            "timeout": timeout,
            "error": "timeout",
            "command": spec.command,
            "cwd": str(spec.cwd),
        }

    payload: dict[str, Any] = {}
    if completed.stdout.strip():
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            payload = {}
    return {
        **payload,
        "ok": completed.returncode == 0 and bool(payload.get("ok", completed.returncode == 0)),
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "command": spec.command,
        "cwd": str(spec.cwd),
    }


def run_bid_document_asset_package_helper(args: list[str], timeout: int = 60) -> dict[str, Any]:
    spec = CommandSpec(
        key="bid-document-asset-package",
        cwd=REPO_ROOT,
        command=["node", str(BID_DOCUMENT_ASSET_PACKAGE_HELPER), *args],
        description="Export a formal-material collection package from a bid document project config.",
    )
    return run_node_helper(spec, timeout=timeout)


def run_bid_document_import_asset_package_helper(args: list[str], timeout: int = 60) -> dict[str, Any]:
    spec = CommandSpec(
        key="bid-document-import-asset-package",
        cwd=REPO_ROOT,
        command=["node", str(BID_DOCUMENT_IMPORT_ASSET_PACKAGE_HELPER), *args],
        description="Apply a material collection package to a bid document project config.",
    )
    return run_node_helper(spec, timeout=timeout)


def list_task_definitions(timeout: int = 30) -> dict[str, Any]:
    return run_task_plan_helper(["--list"], timeout=timeout)


def start_task_dry_run(task_type: str, payload_json: Path | None = None, timeout: int = 30) -> dict[str, Any]:
    args = ["--type", task_type]
    if payload_json is not None:
        args.extend(["--payload-json", str(Path(payload_json).expanduser())])
    return run_task_plan_helper(args, timeout=timeout)


def project_workspace(
    action: str,
    user_data: Path | None = None,
    project_id: str | None = None,
    name: str | None = None,
    description: str | None = None,
    make_active: bool = False,
    package_dir: Path | None = None,
    timeout: int = 30,
) -> dict[str, Any]:
    args = [
        "--user-data",
        str(Path(user_data).expanduser() if user_data is not None else default_user_data_path()),
        "--action",
        action,
    ]
    if project_id:
        args.extend(["--project-id", project_id])
    if name:
        args.extend(["--name", name])
    if description:
        args.extend(["--description", description])
    if make_active:
        args.append("--make-active")
    if package_dir is not None:
        args.extend(["--package-dir", str(Path(package_dir).expanduser())])
    return run_project_workspace_helper(args, timeout=timeout)


def bid_document_sample(output_dir: Path, template_id: str = "generic-response", timeout: int = 60) -> dict[str, Any]:
    args = [
        "--output-dir",
        str(Path(output_dir).expanduser()),
        "--template-id",
        str(template_id or "generic-response"),
    ]
    return run_bid_document_sample_helper(args, timeout=timeout)


def bid_document_template_info(
    template_id: str | None = None,
    output_json: Path | None = None,
    timeout: int = 60,
) -> dict[str, Any]:
    args = []
    if template_id:
        args.extend(["--template-id", str(template_id)])
    if output_json is not None:
        args.extend(["--output-json", str(Path(output_json).expanduser())])
    return run_bid_document_template_info_helper(args, timeout=timeout)


def bid_document_analyze_reference(
    input_docx: Path,
    output_json: Path | None = None,
    candidate_docx: Path | None = None,
    timeout: int = 60,
) -> dict[str, Any]:
    args = [
        "--input",
        str(Path(input_docx).expanduser()),
    ]
    if candidate_docx is not None:
        args.extend(["--candidate", str(Path(candidate_docx).expanduser())])
    if output_json is not None:
        args.extend(["--output-json", str(Path(output_json).expanduser())])
    return run_bid_document_reference_helper(args, timeout=timeout)


def bid_document_validate_config(
    input_json: Path,
    output_json: Path | None = None,
    timeout: int = 60,
) -> dict[str, Any]:
    args = [
        "--input",
        str(Path(input_json).expanduser()),
    ]
    if output_json is not None:
        args.extend(["--output-json", str(Path(output_json).expanduser())])
    return run_bid_document_validate_config_helper(args, timeout=timeout)


def bid_document_build_config(
    input_json: Path,
    output_docx: Path,
    output_json: Path | None = None,
    timeout: int = 60,
) -> dict[str, Any]:
    args = [
        "--input",
        str(Path(input_json).expanduser()),
        "--output",
        str(Path(output_docx).expanduser()),
    ]
    if output_json is not None:
        args.extend(["--output-json", str(Path(output_json).expanduser())])
    return run_bid_document_build_config_helper(args, timeout=timeout)


def bid_document_init_config(
    template_id: str,
    output_json: Path,
    with_demo_assets: bool = False,
    timeout: int = 60,
) -> dict[str, Any]:
    args = [
        "--template-id",
        str(template_id),
        "--output-json",
        str(Path(output_json).expanduser()),
    ]
    if with_demo_assets:
        args.append("--with-demo-assets")
    return run_bid_document_init_config_helper(args, timeout=timeout)


def bid_document_readiness_report(
    input_json: Path,
    output_json: Path | None = None,
    output_markdown: Path | None = None,
    output_xlsx: Path | None = None,
    timeout: int = 60,
) -> dict[str, Any]:
    args = [
        "--input",
        str(Path(input_json).expanduser()),
    ]
    if output_json is not None:
        args.extend(["--output-json", str(Path(output_json).expanduser())])
    if output_markdown is not None:
        args.extend(["--output-markdown", str(Path(output_markdown).expanduser())])
    if output_xlsx is not None:
        args.extend(["--output-xlsx", str(Path(output_xlsx).expanduser())])
    return run_bid_document_readiness_report_helper(args, timeout=timeout)


def bid_document_asset_package(
    input_json: Path,
    output_dir: Path,
    timeout: int = 60,
) -> dict[str, Any]:
    args = [
        "--input",
        str(Path(input_json).expanduser()),
        "--output-dir",
        str(Path(output_dir).expanduser()),
    ]
    return run_bid_document_asset_package_helper(args, timeout=timeout)


def bid_document_import_asset_package(
    input_json: Path,
    package_dir: Path,
    output_json: Path,
    timeout: int = 60,
) -> dict[str, Any]:
    args = [
        "--input",
        str(Path(input_json).expanduser()),
        "--package-dir",
        str(Path(package_dir).expanduser()),
        "--output-json",
        str(Path(output_json).expanduser()),
    ]
    return run_bid_document_import_asset_package_helper(args, timeout=timeout)
