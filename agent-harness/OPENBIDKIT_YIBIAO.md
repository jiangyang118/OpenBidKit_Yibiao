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
```

The CLI wraps real repository files and validation commands. It does not reimplement Electron business logic.

## Backend Scope

- Reads `client/package.json`, `analytics/*/package.json`, `plan.md`, and the configured Electron userData workspace path.
- Runs selected real validation commands through subprocess.
- Exports Duplicate Check and Rejection Check Markdown, Word, or PDF reports by calling existing Electron Main report builders from a Node helper.
- Reports all command output as JSON when `--json` is used.

Long-running Electron task startup is not yet exposed as a headless command; future work should wrap the existing Electron Main services or stable workspace files rather than duplicating business logic.
