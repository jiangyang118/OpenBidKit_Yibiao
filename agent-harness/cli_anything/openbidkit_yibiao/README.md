# cli-anything-openbidkit-yibiao

Agent-native CLI harness for OpenBidKit Yibiao.

## Install

```bash
cd agent-harness
pip install -e .
```

## Usage

```bash
cli-anything-openbidkit-yibiao --json status
cli-anything-openbidkit-yibiao --json plan-summary
cli-anything-openbidkit-yibiao --json smoke --check main-syntax --check preload-syntax
cli-anything-openbidkit-yibiao --json list-tasks
cli-anything-openbidkit-yibiao --json start-task --type duplicate-analysis --payload-json /path/to/task-payload.json --dry-run
cli-anything-openbidkit-yibiao --json project-workspace --action list
cli-anything-openbidkit-yibiao --json project-workspace --action create --name "医院后勤投标" --make-active
cli-anything-openbidkit-yibiao --json project-workspace --action set-active --project-id default
cli-anything-openbidkit-yibiao --json export-report --kind duplicate --state-json /path/to/state.json --output /tmp/duplicate-report.md
cli-anything-openbidkit-yibiao --json export-report --kind rejection --state-json /path/to/state.json --output /tmp/rejection-report.docx --format docx
cli-anything-openbidkit-yibiao --json export-report --kind rejection --state-json /path/to/state.json --output /tmp/rejection-report.pdf --format pdf
cli-anything-openbidkit-yibiao --json export-report --kind business-bid --state-json /path/to/state.json --output /tmp/business-bid.xlsx --format xlsx
cli-anything-openbidkit-yibiao --json export-report --kind ai-evaluation --state-json /path/to/state.json --output /tmp/ai-evaluation.docx --format docx
cli-anything-openbidkit-yibiao --json export-report --kind bid-opportunity --state-json /path/to/state.json --output /tmp/bid-opportunity.md
```

## Backend Boundary

The harness reads stable project files and invokes real repository commands. Report export calls existing Electron Main report builders for Duplicate Check, Rejection Check, Business Bid, AI Evaluation, and Bid Opportunity; it does not duplicate Electron Main business logic.

Task commands call the existing Electron Main `taskService.cjs` task definitions. `start-task` is intentionally dry-run only: it returns the task definition, storage key, scope id, and payload signature without starting runners, writing stores, or emitting IPC events.

Project workspace commands call the existing Electron Main `projectWorkspaceStore.cjs` through a Node helper. Use `--user-data /path/to/userData` for isolated tests or agent sandboxes.
