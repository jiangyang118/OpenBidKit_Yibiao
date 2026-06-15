# Agent Harness

This directory contains command-line adapters used by Codex to run OpenBidKit_Yibiao against local enterprise bidding materials without driving the Electron UI manually.

## Rehab Aids Weighing System Bid

Generate the full graphic bid response for the 2026 rehabilitation aids weighing-system procurement test project:

```bash
node agent-harness/generate-rehab-aids-bid.cjs
```

Default model route:

- Base URL: `http://127.0.0.1:11434/v1`
- Model: `qwen3:14b`
- API key placeholder: `ollama`

Override when needed:

```bash
OPENBIDKIT_TEXT_BASE_URL=https://example.com/v1 \
OPENBIDKIT_TEXT_MODEL=model-name \
OPENBIDKIT_TEXT_API_KEY=... \
node agent-harness/generate-rehab-aids-bid.cjs
```

Generated outputs are ignored by Git and written to:

```text
agent-harness/outputs/rehab-aids-weighing-system/
~/Desktop/rehab-aids-weighing-system-openbidkit-yibiao-full-bid.docx
~/Desktop/rehab-aids-weighing-system-openbidkit-yibiao-full-bid.pdf
```

The script uses OpenBidKit's own `aiService.cjs`, `knowledgeBaseService.cjs` block splitting helpers, and `exportService.cjs` Word exporter.

## CLI-Anything Harness

The package under `agent-harness/cli_anything/openbidkit_yibiao/` exposes JSON commands for agents:

```bash
cli-anything-openbidkit-yibiao --json status
cli-anything-openbidkit-yibiao --json plan-summary
cli-anything-openbidkit-yibiao --json smoke --check main-syntax
cli-anything-openbidkit-yibiao --json list-tasks
cli-anything-openbidkit-yibiao --json start-task --type duplicate-analysis --payload-json /path/to/task-payload.json --dry-run
cli-anything-openbidkit-yibiao --json export-report --kind duplicate --state-json /path/to/state.json --output /tmp/duplicate-report.md
cli-anything-openbidkit-yibiao --json export-report --kind rejection --state-json /path/to/state.json --output /tmp/rejection-report.docx --format docx
cli-anything-openbidkit-yibiao --json export-report --kind rejection --state-json /path/to/state.json --output /tmp/rejection-report.pdf --format pdf
```

`export-report` calls the existing Electron Main report builders for Duplicate Check and Rejection Check through a Node helper. It expects a workspace state JSON file and writes UTF-8 Markdown by default, Word `.docx` with `--format docx`, or text PDF with `--format pdf`.

`list-tasks` and `start-task --dry-run` call the real Electron Main `taskService.cjs` task definitions. The dry-run path returns the task definition, storage key, scope id, and payload signature without starting runners, writing stores, or requiring an Electron window.
