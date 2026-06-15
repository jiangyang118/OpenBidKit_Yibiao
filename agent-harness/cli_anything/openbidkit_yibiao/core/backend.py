from __future__ import annotations

import json
import os
import platform
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
    pending_markers = text.count("待完成") + text.count("待增强") + text.count("后续")
    return {
        "path": str(plan_path),
        "exists": plan_path.exists(),
        "headings": headings,
        "heading_count": len(headings),
        "completed_markers": completed_markers,
        "pending_markers": pending_markers,
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
    if normalized_kind not in {"duplicate", "rejection"}:
        return {
            "ok": False,
            "error": "unknown_report_kind",
            "available_kinds": ["duplicate", "rejection"],
        }
    if normalized_format not in {"md", "docx", "pdf"}:
        return {
            "ok": False,
            "error": "unknown_report_format",
            "available_formats": ["md", "docx", "pdf"],
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


def list_task_definitions(timeout: int = 30) -> dict[str, Any]:
    return run_task_plan_helper(["--list"], timeout=timeout)


def start_task_dry_run(task_type: str, payload_json: Path | None = None, timeout: int = 30) -> dict[str, Any]:
    args = ["--type", task_type]
    if payload_json is not None:
        args.extend(["--payload-json", str(Path(payload_json).expanduser())])
    return run_task_plan_helper(args, timeout=timeout)
