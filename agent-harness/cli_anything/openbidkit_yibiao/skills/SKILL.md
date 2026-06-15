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
cli-anything-openbidkit-yibiao --json export-report --kind rejection --state-json /path/to/state.json --output /tmp/rejection-report.md
cli-anything-openbidkit-yibiao --json export-report --kind rejection --state-json /path/to/state.json --output /tmp/rejection-report.docx --format docx
cli-anything-openbidkit-yibiao --json export-report --kind rejection --state-json /path/to/state.json --output /tmp/rejection-report.pdf --format pdf
```

## Notes

- `status` reads real repository and local workspace files.
- `smoke` runs real Node/npm validation commands.
- `export-report` calls existing Electron Main Duplicate Check / Rejection Check Markdown, Word, and PDF report builders through a Node helper.
- Long-running Electron task startup is not yet exposed by this harness slice.
