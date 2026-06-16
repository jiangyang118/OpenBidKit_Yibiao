---
name: openbidkit-yibiao-cli
description: Use the OpenBidKit Yibiao agent harness to inspect project state and run smoke checks from Codex or other agents.
---

# OpenBidKit Yibiao CLI Harness

Use this skill when an agent needs a machine-readable way to inspect OpenBidKit Yibiao or run repository smoke checks.

## Commands

```bash
cli-anything-openbidkit-yibiao --json status
cli-anything-openbidkit-yibiao --json plan-summary
cli-anything-openbidkit-yibiao --json smoke --check main-syntax --check preload-syntax
cli-anything-openbidkit-yibiao --json list-tasks
cli-anything-openbidkit-yibiao --json start-task --type duplicate-analysis --payload-json /path/to/task-payload.json --dry-run
cli-anything-openbidkit-yibiao --json project-workspace --action list
cli-anything-openbidkit-yibiao --json project-workspace --action create --name "医院后勤投标" --make-active
cli-anything-openbidkit-yibiao --json export-report --kind rejection --state-json /path/to/state.json --output /tmp/rejection-report.md
cli-anything-openbidkit-yibiao --json export-report --kind rejection --state-json /path/to/state.json --output /tmp/rejection-report.docx --format docx
cli-anything-openbidkit-yibiao --json export-report --kind rejection --state-json /path/to/state.json --output /tmp/rejection-report.pdf --format pdf
cli-anything-openbidkit-yibiao --json export-report --kind business-bid --state-json /path/to/state.json --output /tmp/business-bid.xlsx --format xlsx
cli-anything-openbidkit-yibiao --json export-report --kind ai-evaluation --state-json /path/to/state.json --output /tmp/ai-evaluation.docx --format docx
cli-anything-openbidkit-yibiao --json export-report --kind bid-opportunity --state-json /path/to/state.json --output /tmp/bid-opportunity.md
```

## Notes

- `status` reads real repository and local workspace files.
- `smoke` runs real Node/npm validation commands.
- `export-report` calls existing Electron Main report builders through a Node helper.
- `list-tasks` and `start-task --dry-run` use real Electron Main task definitions without starting runners.
- `project-workspace` calls the real Electron Main project workspace store. Use `--user-data /path/to/userData` when an agent should avoid the user's default Electron workspace.
