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
cli-anything-openbidkit-yibiao --json project-workspace --action list
cli-anything-openbidkit-yibiao --json project-workspace --action create --name "医院后勤投标" --make-active
cli-anything-openbidkit-yibiao --json project-workspace --action set-active --project-id default
cli-anything-openbidkit-yibiao --json export-report --kind duplicate --state-json /path/to/state.json --output /tmp/duplicate-report.md
cli-anything-openbidkit-yibiao --json export-report --kind rejection --state-json /path/to/state.json --output /tmp/rejection-report.docx --format docx
cli-anything-openbidkit-yibiao --json export-report --kind rejection --state-json /path/to/state.json --output /tmp/rejection-report.pdf --format pdf
cli-anything-openbidkit-yibiao --json export-report --kind business-bid --state-json /path/to/state.json --output /tmp/business-bid.xlsx --format xlsx
cli-anything-openbidkit-yibiao --json export-report --kind ai-evaluation --state-json /path/to/state.json --output /tmp/ai-evaluation.docx --format docx
cli-anything-openbidkit-yibiao --json export-report --kind bid-opportunity --state-json /path/to/state.json --output /tmp/bid-opportunity.md
cli-anything-openbidkit-yibiao --json bid-document-template-info --template-id smart-canteen-response --output-json /tmp/template-info.json
cli-anything-openbidkit-yibiao --json bid-document-sample --output-dir /tmp/yibiao-bid-document --template-id generic-response
cli-anything-openbidkit-yibiao --json bid-document-analyze-reference --input /path/to/reference-response.docx --candidate /path/to/generated-response.docx --output-json /tmp/reference-alignment.json
cli-anything-openbidkit-yibiao --json bid-document-validate-config --input /path/to/project-config.json --output-json /tmp/build-log.json
cli-anything-openbidkit-yibiao --json bid-document-readiness-report --input /path/to/project-config.json --output-json /tmp/readiness.json --output-markdown /tmp/readiness.md --output-xlsx /tmp/readiness.xlsx
```

`export-report` calls existing Electron Main report builders through a Node helper. It expects a workspace state JSON file and supports:

- `duplicate` / `rejection`: UTF-8 Markdown, Word `.docx`, or text PDF.
- `business-bid` / `ai-evaluation`: UTF-8 Markdown, Word `.docx`, or Excel `.xlsx`.
- `bid-opportunity`: UTF-8 Markdown.

`bid-document-sample` calls the real complete-bid template package and Word builder, writes a `.docx` plus build log, and returns the same quote, attachment, section, docx content, image insertion, and forbidden-word validation summary used by the desktop workflow.

`bid-document-template-info` exports the registered complete-bid schema definitions, section tree, default project data, quote rows, and asset mapping example for a template without generating a Word file or requiring attachment files.

`bid-document-analyze-reference` calls the real reference-response analyzer. It reads a `.docx` package and returns heading levels, table previews, image relationships, media files, page breaks, TOC fields, footer page-number evidence, and page layout for template alignment. With `--candidate`, it also produces a strict alignment report for missing/extra headings, missing table headers, lower image/page-break/TOC/footer counts, and layout differences.

`bid-document-validate-config` validates an exported or imported complete-bid project config JSON through the real bid document validation service. It checks quote integrity, payment terms, required sections, forbidden words, and real attachment file paths, then writes a build-log JSON; it does not generate Word. Relative attachment paths are resolved from the input JSON directory, so sidecar asset packages exported by the desktop app can be validated directly. An explicit unknown `templateId` fails with `unknown_template_id` and the available template list instead of falling back to the smart-canteen template.

`bid-document-readiness-report` exports the same validation result as JSON, Markdown, and optionally an Excel `.xlsx` checklist for business-side collection. The workbook contains overview, blockers, missing assets, and per-check sheets, including quote differences and `demo_assets_not_allowed_for_formal_build` when a project still uses demo sidecar images.

Desktop `导出配置` writes a portable project config JSON. When mapped attachment files exist, it copies them into a sibling `<config-name>.assets/` directory and stores relative paths in the JSON; keep the JSON and sidecar directory together before running `bid-document-validate-config` or importing on another machine.

`list-tasks` and `start-task --dry-run` call the real Electron Main `taskService.cjs` task definitions. The dry-run path returns the task definition, storage key, scope id, and payload signature without starting runners, writing stores, or requiring an Electron window.

`project-workspace` calls the real Electron Main `projectWorkspaceStore.cjs` through a Node helper. It supports listing projects, creating projects, switching the active project, archive/restore, duplicate, export package, import package, and resolving a project workspace path. Use `--user-data /path/to/userData` for isolated tests or agent sandboxes.

`plan-summary` distinguishes required pending markers, optional enhancements, active in-progress sections, generic capability blockers, and sample-document blockers. A `completion_status` of `blocked-external-input` means generic capability work is still blocked by external input. A `completion_status` of `required-complete-with-sample-blockers` means the generic capability is complete, while a specific formal sample document still needs reference files, real assets, or confirmed quote data.
