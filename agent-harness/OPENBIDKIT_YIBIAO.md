# OpenBidKit Yibiao Agent Harness

This harness exposes stable, JSON-friendly operations for Codex and other agents working against the local OpenBidKit Yibiao source tree.

## Commands

```bash
cli-anything-openbidkit-yibiao --json status
cli-anything-openbidkit-yibiao --json smoke --check main-syntax
cli-anything-openbidkit-yibiao --json plan-summary
cli-anything-openbidkit-yibiao --json export-report --kind duplicate --state-json /path/to/state.json --output /tmp/duplicate-report.md
cli-anything-openbidkit-yibiao --json export-report --kind rejection --state-json /path/to/state.json --output /tmp/rejection-report.docx --format docx
cli-anything-openbidkit-yibiao --json export-report --kind rejection --state-json /path/to/state.json --output /tmp/rejection-report.pdf --format pdf
cli-anything-openbidkit-yibiao --json bid-document-template-info --template-id smart-canteen-response --output-json /tmp/template-info.json
cli-anything-openbidkit-yibiao --json bid-document-sample --output-dir /tmp/yibiao-bid-document --template-id generic-response
cli-anything-openbidkit-yibiao --json bid-document-validate-config --input /path/to/project-config.json --output-json /tmp/build-log.json
```

The CLI wraps real repository files and validation commands. It does not reimplement Electron business logic.

## Backend Scope

- Reads `client/package.json`, `analytics/*/package.json`, `plan.md`, and the configured Electron userData workspace path.
- Runs selected real validation commands through subprocess.
- Exports Duplicate Check and Rejection Check Markdown, Word, or PDF reports by calling existing Electron Main report builders from a Node helper.
- Exports complete-bid template schema, section trees, default project data, quote rows, and asset mapping examples from the real bid document template registry.
- Generates complete-bid sample `.docx` files and build logs by calling the real bid document template and Word builder services from a Node helper.
- Validates exported or imported complete-bid project config JSON through the real bid document validation service without generating Word; relative attachment paths are resolved from the input JSON directory.
- Rejects explicit unknown complete-bid `templateId` values with `unknown_template_id` and the available template list instead of silently falling back to the smart-canteen template.
- Desktop project config export copies existing mapped attachments into a sibling `<config-name>.assets/` directory and stores relative JSON paths, so the JSON plus sidecar directory can move together.
- Reports `plan-summary.completion_status` as `blocked-external-input` only when generic capability work is blocked by external user files or data. Sample-document-only gaps are reported as `required-complete-with-sample-blockers`.
- Reports all command output as JSON when `--json` is used.

Long-running Electron task startup is not yet exposed as a headless command; future work should wrap the existing Electron Main services or stable workspace files rather than duplicating business logic.
