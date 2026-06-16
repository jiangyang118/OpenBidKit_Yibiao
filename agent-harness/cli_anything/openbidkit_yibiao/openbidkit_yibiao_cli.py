from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import click

from . import __version__
from .core.backend import export_report as export_report_file
from .core.backend import list_task_definitions
from .core.backend import plan_summary as build_plan_summary
from .core.backend import project_workspace as run_project_workspace
from .core.backend import project_status, run_smoke, smoke_command_specs
from .core.backend import start_task_dry_run


def emit(payload: dict[str, Any], as_json: bool) -> None:
    if as_json:
        click.echo(json.dumps(payload, ensure_ascii=False, indent=2))
        return
    if "message" in payload:
        click.echo(payload["message"])
    else:
        click.echo(json.dumps(payload, ensure_ascii=False, indent=2))


@click.group(invoke_without_command=True)
@click.option("--json", "as_json", is_flag=True, help="Emit machine-readable JSON.")
@click.version_option(__version__)
@click.pass_context
def main(ctx: click.Context, as_json: bool) -> None:
    """Agent-native harness for OpenBidKit Yibiao."""
    ctx.ensure_object(dict)
    ctx.obj["json"] = as_json
    if ctx.invoked_subcommand is None:
        click.echo("OpenBidKit Yibiao harness REPL. Type 'status', 'plan-summary', 'smoke', or 'quit'.")
        while True:
            try:
                command = input("openbidkit-yibiao> ").strip()
            except EOFError:
                click.echo()
                return
            if command in {"quit", "exit", ":q"}:
                return
            if command == "status":
                emit(project_status(), as_json)
            elif command == "plan-summary":
                emit(build_plan_summary(), as_json)
            elif command == "smoke":
                emit(run_smoke(), as_json)
            elif command == "list-tasks":
                emit(list_task_definitions(), as_json)
            elif command:
                click.echo(f"Unknown command: {command}", err=True)


@main.command()
@click.pass_context
def status(ctx: click.Context) -> None:
    """Read repository, package, and local workspace status."""
    payload = project_status()
    payload["message"] = f"OpenBidKit_Yibiao at {payload['repo_root']}"
    emit(payload, ctx.obj.get("json", False))


@main.command("plan-summary")
@click.pass_context
def plan_summary(ctx: click.Context) -> None:
    """Summarize plan.md headings and completion markers."""
    payload = build_plan_summary()
    payload["message"] = f"plan.md contains {payload['heading_count']} planned feature sections"
    emit(payload, ctx.obj.get("json", False))


@main.command()
@click.option("--check", "checks", multiple=True, help="Smoke check key. Repeatable.")
@click.option("--timeout", default=120, show_default=True, type=int, help="Per-command timeout in seconds.")
@click.pass_context
def smoke(ctx: click.Context, checks: tuple[str, ...], timeout: int) -> None:
    """Run selected real repository smoke checks."""
    payload = run_smoke(list(checks) or None, timeout=timeout)
    payload["message"] = "Smoke checks passed" if payload["ok"] else "Smoke checks failed"
    emit(payload, ctx.obj.get("json", False))
    if not payload["ok"]:
        sys.exit(1)


@main.command("export-report")
@click.option(
    "--kind",
    type=click.Choice(["duplicate", "rejection", "business-bid", "ai-evaluation", "bid-opportunity"]),
    required=True,
    help="Report type to export.",
)
@click.option("--state-json", type=click.Path(exists=True, dir_okay=False, path_type=Path), required=True, help="Workspace state JSON file.")
@click.option("--output", type=click.Path(dir_okay=False, path_type=Path), required=True, help="Report output path.")
@click.option("--format", "report_format", type=click.Choice(["md", "docx", "pdf", "xlsx"]), default="md", show_default=True, help="Report output format.")
@click.option("--timeout", default=60, show_default=True, type=int, help="Node helper timeout in seconds.")
@click.pass_context
def export_report(ctx: click.Context, kind: str, state_json: Path, output: Path, report_format: str, timeout: int) -> None:
    """Export a Markdown, Word, or PDF report through existing Electron Main report builders."""
    payload = export_report_file(kind=kind, state_json=state_json, output=output, timeout=timeout, format=report_format)
    payload["message"] = "Report exported" if payload["ok"] else "Report export failed"
    emit(payload, ctx.obj.get("json", False))
    if not payload["ok"]:
        sys.exit(1)


@main.command("list-smoke")
@click.pass_context
def list_smoke(ctx: click.Context) -> None:
    """List available smoke checks."""
    specs = smoke_command_specs()
    payload = {
        "checks": [
            {
                "key": key,
                "cwd": str(spec.cwd),
                "command": spec.command,
                "description": spec.description,
            }
            for key, spec in sorted(specs.items())
        ]
    }
    emit(payload, ctx.obj.get("json", False))


@main.command("list-tasks")
@click.option("--timeout", default=30, show_default=True, type=int, help="Node helper timeout in seconds.")
@click.pass_context
def list_tasks(ctx: click.Context, timeout: int) -> None:
    """List real Electron Main task definitions exposed to the harness."""
    payload = list_task_definitions(timeout=timeout)
    payload["message"] = "Task definitions loaded" if payload["ok"] else "Task definitions failed"
    emit(payload, ctx.obj.get("json", False))
    if not payload["ok"]:
        sys.exit(1)


@main.command("start-task")
@click.option("--type", "task_type", required=True, help="Electron Main task type, e.g. duplicate-analysis.")
@click.option("--payload-json", type=click.Path(exists=True, dir_okay=False, path_type=Path), help="Optional task payload JSON for signature/scope dry-run.")
@click.option("--dry-run", is_flag=True, help="Required. Build a side-effect-free task start plan only.")
@click.option("--timeout", default=30, show_default=True, type=int, help="Node helper timeout in seconds.")
@click.pass_context
def start_task(ctx: click.Context, task_type: str, payload_json: Path | None, dry_run: bool, timeout: int) -> None:
    """Build a side-effect-free task start plan from real Electron Main task definitions."""
    if not dry_run:
        payload = {
            "ok": False,
            "error": "non_dry_run_requires_desktop_main",
            "message": "Only --dry-run is supported by the headless harness; execute real task runners in Electron Main.",
        }
        emit(payload, ctx.obj.get("json", False))
        sys.exit(1)
    payload = start_task_dry_run(task_type=task_type, payload_json=payload_json, timeout=timeout)
    payload["message"] = "Task dry-run plan created" if payload["ok"] else "Task dry-run failed"
    emit(payload, ctx.obj.get("json", False))
    if not payload["ok"]:
        sys.exit(1)


@main.command("project-workspace")
@click.option(
    "--action",
    type=click.Choice(["list", "create", "set-active", "archive", "restore", "duplicate", "export-package", "import-package", "get-workspace-path"]),
    required=True,
    help="Project workspace action to run.",
)
@click.option("--user-data", type=click.Path(file_okay=False, path_type=Path), help="Electron userData directory. Defaults to the current platform yibiao-client path.")
@click.option("--project-id", help="Project id for actions that target an existing project.")
@click.option("--name", help="Project name for create, duplicate, or import-package.")
@click.option("--description", help="Project description for create, duplicate, or import-package.")
@click.option("--make-active", is_flag=True, help="Make the created, duplicated, or imported project active.")
@click.option("--package-dir", type=click.Path(file_okay=False, path_type=Path), help="Project package directory for export-package or import-package.")
@click.option("--timeout", default=30, show_default=True, type=int, help="Node helper timeout in seconds.")
@click.pass_context
def project_workspace(
    ctx: click.Context,
    action: str,
    user_data: Path | None,
    project_id: str | None,
    name: str | None,
    description: str | None,
    make_active: bool,
    package_dir: Path | None,
    timeout: int,
) -> None:
    """Manage project workspaces through the real Electron Main projectWorkspaceStore."""
    payload = run_project_workspace(
        action=action,
        user_data=user_data,
        project_id=project_id,
        name=name,
        description=description,
        make_active=make_active,
        package_dir=package_dir,
        timeout=timeout,
    )
    payload["message"] = "Project workspace action completed" if payload["ok"] else "Project workspace action failed"
    emit(payload, ctx.obj.get("json", False))
    if not payload["ok"]:
        sys.exit(1)
