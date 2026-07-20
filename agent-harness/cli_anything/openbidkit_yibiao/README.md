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
cli-anything-openbidkit-yibiao --json bid-document-template-info --template-id smart-canteen-response --output-json /tmp/template-info.json
cli-anything-openbidkit-yibiao --json bid-document-init-config --template-id generic-response --output-json /tmp/project-config.json --with-demo-assets
cli-anything-openbidkit-yibiao --json bid-document-sample --output-dir /tmp/yibiao-bid-document --template-id generic-response
cli-anything-openbidkit-yibiao --json bid-document-analyze-reference --input /path/to/reference-response.docx --candidate /path/to/generated-response.docx --output-json /tmp/reference-alignment.json
cli-anything-openbidkit-yibiao --json bid-document-validate-config --input /path/to/project-config.json --output-json /tmp/build-log.json
cli-anything-openbidkit-yibiao --json bid-document-readiness-report --input /path/to/project-config.json --output-json /tmp/readiness.json --output-markdown /tmp/readiness.md --output-xlsx /tmp/readiness.xlsx
cli-anything-openbidkit-yibiao --json bid-document-asset-package --input /path/to/project-config.json --output-dir /tmp/material-package
cli-anything-openbidkit-yibiao --json bid-document-import-asset-package --input /path/to/project-config.json --package-dir /tmp/material-package --output-json /tmp/updated-project-config.json
cli-anything-openbidkit-yibiao --json bid-document-build-config --input /path/to/project-config.json --output /tmp/response.docx --output-json /tmp/build-result.json
```

## Backend Boundary

The harness reads stable project files and invokes real repository commands. Report export calls existing Electron Main report builders for Duplicate Check, Rejection Check, Business Bid, AI Evaluation, and Bid Opportunity; it does not duplicate Electron Main business logic. `bid-document-template-info` exports schema definitions, section trees, default project data, quote rows, and asset mapping examples from the real bid document template registry. `bid-document-init-config` writes an editable project config JSON from the same template registry; `--with-demo-assets` creates one-pixel sidecar images for validation demos only, not for formal submission. `bid-document-sample` calls the real bid document template and Word builder services, writes a `.docx` plus build log, and returns the same validation summary used by the desktop workflow. `bid-document-analyze-reference` calls the real reference-response analyzer and returns heading, table, image, page-break, TOC, footer, and page-layout evidence from a `.docx` package; with `--candidate`, it also compares a generated response file against the reference structure. `bid-document-validate-config` validates exported or imported project config JSON through the same bid document validation service, writes a build-log JSON, and does not generate Word; relative attachment paths are resolved from the input JSON directory. `bid-document-readiness-report` uses that same validation service to write a machine-readable JSON report, a Markdown checklist, and optionally an Excel `.xlsx` workbook covering overview, blockers, full attachment inventory, missing assets, demo-only asset packages, quote differences, and per-check status for business-side input collection; it never generates Word. `bid-document-asset-package` exports a material collection folder with `asset-manifest.json`, `材料收集清单.md`, and per-section asset directories so business users can place real scans/screenshots by suggested filename before revalidation. `bid-document-import-asset-package` applies that folder back to a project config JSON: files found at manifest `targetFile` paths are written into `assetMap`, files not found clear the matching path so stale demo assets cannot pass validation. Demo sidecar attachments are marked as `demo_only`/`演示附件` in `asset_inventory` so they cannot be mistaken for formal materials. `bid-document-build-config` reads the same project config JSON and calls the real bid document Word builder to generate a `.docx`; it keeps the builder's preflight/postflight behavior, so failed validation does not promote a final Word file. Project configs marked with `assetPackage.demoOnly=true` are rejected for formal Word generation with `demo_assets_not_allowed_for_formal_build`. Desktop project config export stores existing mapped attachment files in a sibling `<config-name>.assets/` directory and writes relative paths so the JSON plus sidecar directory can be moved together. Unknown explicit `templateId` values fail as `unknown_template_id` with the available template list, preventing generic projects from silently using the smart-canteen template.

`plan-summary` reads `plan.md` and reports required pending markers, optional enhancement markers, in-progress markers, capability blockers, and sample-document blockers. Treat `blocked-external-input` as incomplete for generic capability completion. Treat `required-complete-with-sample-blockers` as generic capability complete with reference/sample assets still required for a specific formal sample document.

Task commands call the existing Electron Main `taskService.cjs` task definitions. `start-task` is intentionally dry-run only: it returns the task definition, storage key, scope id, and payload signature without starting runners, writing stores, or emitting IPC events.

Project workspace commands call the existing Electron Main `projectWorkspaceStore.cjs` through a Node helper. Use `--user-data /path/to/userData` for isolated tests or agent sandboxes.
