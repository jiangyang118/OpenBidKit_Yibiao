from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import click

from . import __version__
from .core.backend import bid_document_analyze_reference as analyze_bid_document_reference
from .core.backend import bid_document_asset_package as export_bid_document_asset_package
from .core.backend import bid_document_build_config as build_bid_document_config
from .core.backend import bid_document_init_config as init_bid_document_config
from .core.backend import bid_document_import_asset_package as import_bid_document_asset_package
from .core.backend import bid_document_readiness_report as export_bid_document_readiness_report
from .core.backend import bid_document_sample as generate_bid_document_sample
from .core.backend import bid_document_template_info as export_bid_document_template_info
from .core.backend import bid_document_validate_config as validate_bid_document_config
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


@main.command("bid-document-sample")
@click.option("--output-dir", type=click.Path(file_okay=False, path_type=Path), required=True, help="Directory for the generated sample docx and build log.")
@click.option("--template-id", default="generic-response", show_default=True, help="Bid document template id.")
@click.option("--timeout", default=60, show_default=True, type=int, help="Node helper timeout in seconds.")
@click.pass_context
def bid_document_sample(ctx: click.Context, output_dir: Path, template_id: str, timeout: int) -> None:
    """Generate a sample bid document through the real bid document Word builder."""
    payload = generate_bid_document_sample(output_dir=output_dir, template_id=template_id, timeout=timeout)
    payload["message"] = "Bid document sample generated" if payload["ok"] else "Bid document sample generation failed"
    emit(payload, ctx.obj.get("json", False))
    if not payload["ok"]:
        sys.exit(1)


@main.command("bid-document-template-info")
@click.option("--template-id", help="Optional bid document template id. Omit to export every registered template.")
@click.option("--output-json", type=click.Path(dir_okay=False, path_type=Path), help="Optional path to persist the template info JSON.")
@click.option("--timeout", default=60, show_default=True, type=int, help="Node helper timeout in seconds.")
@click.pass_context
def bid_document_template_info(ctx: click.Context, template_id: str | None, output_json: Path | None, timeout: int) -> None:
    """Export bid document schema, section tree, sample data, and asset mapping."""
    payload = export_bid_document_template_info(template_id=template_id, output_json=output_json, timeout=timeout)
    payload["message"] = "Bid document template info exported" if payload["ok"] else "Bid document template info export failed"
    emit(payload, ctx.obj.get("json", False))
    if not payload["ok"]:
        sys.exit(1)


@main.command("bid-document-init-config")
@click.option("--template-id", required=True, help="Bid document template id.")
@click.option("--output-json", type=click.Path(dir_okay=False, path_type=Path), required=True, help="Path to write the editable project config JSON.")
@click.option("--with-demo-assets", is_flag=True, help="Write one-pixel demo images into a sidecar assets directory for validation demos only.")
@click.option("--timeout", default=60, show_default=True, type=int, help="Node helper timeout in seconds.")
@click.pass_context
def bid_document_init_config(ctx: click.Context, template_id: str, output_json: Path, with_demo_assets: bool, timeout: int) -> None:
    """Initialize an editable bid document project config from a registered template."""
    payload = init_bid_document_config(template_id=template_id, output_json=output_json, with_demo_assets=with_demo_assets, timeout=timeout)
    payload["message"] = "Bid document project config initialized" if payload["ok"] else "Bid document project config initialization failed"
    emit(payload, ctx.obj.get("json", False))
    if not payload["ok"]:
        sys.exit(1)


@main.command("bid-document-analyze-reference")
@click.option("--input", "input_docx", type=click.Path(exists=True, dir_okay=False, path_type=Path), required=True, help="Reference response-file .docx to analyze.")
@click.option("--candidate", "candidate_docx", type=click.Path(exists=True, dir_okay=False, path_type=Path), help="Optional generated response-file .docx to compare against the reference.")
@click.option("--output-json", type=click.Path(dir_okay=False, path_type=Path), help="Optional path to persist the analysis JSON.")
@click.option("--timeout", default=60, show_default=True, type=int, help="Node helper timeout in seconds.")
@click.pass_context
def bid_document_analyze_reference(ctx: click.Context, input_docx: Path, candidate_docx: Path | None, output_json: Path | None, timeout: int) -> None:
    """Analyze a reference response-file docx, optionally comparing a generated candidate."""
    payload = analyze_bid_document_reference(input_docx=input_docx, candidate_docx=candidate_docx, output_json=output_json, timeout=timeout)
    payload["message"] = "Reference bid document analyzed" if payload["ok"] else "Reference bid document analysis/alignment failed"
    emit(payload, ctx.obj.get("json", False))
    if not payload["ok"]:
        sys.exit(1)


@main.command("bid-document-validate-config")
@click.option("--input", "input_json", type=click.Path(exists=True, dir_okay=False, path_type=Path), required=True, help="Bid document project config JSON exported from the desktop flow.")
@click.option("--output-json", type=click.Path(dir_okay=False, path_type=Path), help="Optional path to persist the validation build log JSON.")
@click.option("--timeout", default=60, show_default=True, type=int, help="Node helper timeout in seconds.")
@click.pass_context
def bid_document_validate_config(ctx: click.Context, input_json: Path, output_json: Path | None, timeout: int) -> None:
    """Validate a bid document project config without generating Word."""
    payload = validate_bid_document_config(input_json=input_json, output_json=output_json, timeout=timeout)
    payload["message"] = "Bid document project config validation passed" if payload["ok"] else "Bid document project config validation failed"
    emit(payload, ctx.obj.get("json", False))
    if not payload["ok"]:
        sys.exit(1)


@main.command("bid-document-build-config")
@click.option("--input", "input_json", type=click.Path(exists=True, dir_okay=False, path_type=Path), required=True, help="Bid document project config JSON exported from the desktop flow.")
@click.option("--output", "output_docx", type=click.Path(dir_okay=False, path_type=Path), required=True, help="Generated Word .docx output path.")
@click.option("--output-json", type=click.Path(dir_okay=False, path_type=Path), help="Optional path to persist the Word build result JSON.")
@click.option("--timeout", default=60, show_default=True, type=int, help="Node helper timeout in seconds.")
@click.pass_context
def bid_document_build_config(ctx: click.Context, input_json: Path, output_docx: Path, output_json: Path | None, timeout: int) -> None:
    """Build a Word bid document from a project config JSON."""
    payload = build_bid_document_config(input_json=input_json, output_docx=output_docx, output_json=output_json, timeout=timeout)
    payload["message"] = "Bid document built from project config" if payload["ok"] else "Bid document build from project config failed"
    emit(payload, ctx.obj.get("json", False))
    if not payload["ok"]:
        sys.exit(1)


@main.command("bid-document-readiness-report")
@click.option("--input", "input_json", type=click.Path(exists=True, dir_okay=False, path_type=Path), required=True, help="Bid document project config JSON exported from the desktop flow.")
@click.option("--output-json", type=click.Path(dir_okay=False, path_type=Path), help="Optional path to persist the readiness report JSON.")
@click.option("--output-markdown", type=click.Path(dir_okay=False, path_type=Path), help="Optional path to persist a human-readable readiness report.")
@click.option("--output-xlsx", type=click.Path(dir_okay=False, path_type=Path), help="Optional path to persist a business-facing Excel blocker checklist.")
@click.option("--timeout", default=60, show_default=True, type=int, help="Node helper timeout in seconds.")
@click.pass_context
def bid_document_readiness_report(ctx: click.Context, input_json: Path, output_json: Path | None, output_markdown: Path | None, output_xlsx: Path | None, timeout: int) -> None:
    """Export a formal-build readiness report without generating Word."""
    payload = export_bid_document_readiness_report(input_json=input_json, output_json=output_json, output_markdown=output_markdown, output_xlsx=output_xlsx, timeout=timeout)
    payload["message"] = "Bid document readiness report passed" if payload["ok"] else "Bid document readiness report found blockers"
    emit(payload, ctx.obj.get("json", False))
    if not payload["ok"]:
        sys.exit(1)


@main.command("bid-document-asset-package")
@click.option("--input", "input_json", type=click.Path(exists=True, dir_okay=False, path_type=Path), required=True, help="Bid document project config JSON exported from the desktop flow.")
@click.option("--output-dir", type=click.Path(file_okay=False, path_type=Path), required=True, help="Directory for the material collection package.")
@click.option("--timeout", default=60, show_default=True, type=int, help="Node helper timeout in seconds.")
@click.pass_context
def bid_document_asset_package(ctx: click.Context, input_json: Path, output_dir: Path, timeout: int) -> None:
    """Export a material collection package without generating Word."""
    payload = export_bid_document_asset_package(input_json=input_json, output_dir=output_dir, timeout=timeout)
    payload["message"] = "Bid document asset collection package exported" if payload["ok"] else "Bid document asset collection package export failed"
    emit(payload, ctx.obj.get("json", False))
    if not payload["ok"]:
        sys.exit(1)


@main.command("bid-document-import-asset-package")
@click.option("--input", "input_json", type=click.Path(exists=True, dir_okay=False, path_type=Path), required=True, help="Bid document project config JSON exported from the desktop flow.")
@click.option("--package-dir", type=click.Path(exists=True, file_okay=False, path_type=Path), required=True, help="Material collection package directory containing asset-manifest.json.")
@click.option("--output-json", type=click.Path(dir_okay=False, path_type=Path), required=True, help="Updated project config JSON with collected asset paths applied.")
@click.option("--timeout", default=60, show_default=True, type=int, help="Node helper timeout in seconds.")
@click.pass_context
def bid_document_import_asset_package(ctx: click.Context, input_json: Path, package_dir: Path, output_json: Path, timeout: int) -> None:
    """Apply a material collection package to a project config JSON."""
    payload = import_bid_document_asset_package(input_json=input_json, package_dir=package_dir, output_json=output_json, timeout=timeout)
    payload["message"] = "Bid document asset collection package applied" if payload["ok"] else "Bid document asset collection package import failed"
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
