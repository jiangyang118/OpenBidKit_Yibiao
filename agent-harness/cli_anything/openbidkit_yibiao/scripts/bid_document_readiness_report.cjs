const fs = require('node:fs');
const path = require('node:path');
const { createTemplateErrorBuildLog } = require('./bid_document_build_log_helper.cjs');

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    options[key.slice(2)] = argv[index + 1] || '';
    index += 1;
  }
  return options;
}

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node bid_document_readiness_report.cjs --input <project-config.json> [--output-json <report.json>] [--output-markdown <report.md>] [--output-xlsx <report.xlsx>]');
  process.exit(2);
}

function writeFileIfRequested(filePath, content) {
  if (!filePath) return '';
  const outputPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
  return outputPath;
}

function buildReadinessReport({ inputPath, config, project, buildLog, unknownTemplateError }) {
  const repoRoot = String(process.env.OPENBIDKIT_REPO_ROOT || '').trim();
  const {
    classifyReadinessErrors,
    collectReadinessCheckSummaries,
    createReadinessReport,
    toSnakeReadinessReport,
  } = require(path.join(repoRoot, 'client/electron/services/bidDocumentReadinessReport.cjs'));
  const templateId = project?.template?.id || config.templateId || config.projectData?.templateId || unknownTemplateError?.templateId || '';
  const projectData = project?.projectData || config.projectData || {};
  const quoteItems = project?.quoteItems || config.quoteItems || [];
  if (!unknownTemplateError && project) {
    const report = createReadinessReport({
      ...project,
      assetPackage: config.assetPackage || null,
    }, buildLog);
    return toSnakeReadinessReport(report, { inputPath, buildLog });
  }
  return {
    ready: false,
    input: inputPath,
    template_id: templateId,
    project_name: projectData.projectName || '',
    purchaser_name: projectData.purchaserName || '',
    supplier_name: projectData.supplierName || '',
    quote_total: quoteItems.reduce((sum, item) => sum + Number(item.totalWithTax || 0), 0),
    target_total: Number(projectData.totalWithTax || 0),
    quote_difference: Number((Number(projectData.totalWithTax || 0) - quoteItems.reduce((sum, item) => sum + Number(item.totalWithTax || 0), 0)).toFixed(2)),
    quote_reconciliation: { items: [], quoteTotal: 0, computedQuoteTotal: 0, targetTotal: Number(projectData.totalWithTax || 0), quoteDifference: 0, rowDifferenceTotal: 0 },
    quote_resolution_actions: [],
    asset_package: config.assetPackage || null,
    asset_inventory: [],
    blockers: classifyReadinessErrors([unknownTemplateError.message || String(unknownTemplateError)]),
    missing_assets: [],
    checks: collectReadinessCheckSummaries(buildLog),
    build_log: buildLog,
  };
}

function writeBinaryFileIfRequested(filePath, buffer) {
  if (!filePath) return '';
  const outputPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

function writePayload(payload, outputJson = '', outputMarkdown = '', outputXlsx = '') {
  const repoRoot = String(process.env.OPENBIDKIT_REPO_ROOT || '').trim();
  const {
    buildReadinessReportExcelBuffer,
    renderReadinessReportMarkdown,
  } = require(path.join(repoRoot, 'client/electron/services/bidDocumentReadinessReport.cjs'));
  const jsonPath = writeFileIfRequested(outputJson, JSON.stringify(payload, null, 2));
  const markdownPath = writeFileIfRequested(outputMarkdown, renderReadinessReportMarkdown(payload.readiness_report));
  const xlsxPath = writeBinaryFileIfRequested(outputXlsx, buildReadinessReportExcelBuffer(payload.readiness_report));
  const stdoutPayload = {
    ...payload,
    output_json: jsonPath,
    output_markdown: markdownPath,
    output_xlsx: xlsxPath,
  };
  process.stdout.write(`${JSON.stringify(stdoutPayload)}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = String(process.env.OPENBIDKIT_REPO_ROOT || '').trim();
  const input = String(options.input || '').trim();
  const outputJson = String(options['output-json'] || '').trim();
  const outputMarkdown = String(options['output-markdown'] || '').trim();
  const outputXlsx = String(options['output-xlsx'] || '').trim();

  if (!repoRoot) usage('Missing OPENBIDKIT_REPO_ROOT.');
  if (!input) usage('Missing --input.');

  const inputPath = path.resolve(input);
  if (!fs.existsSync(inputPath)) usage(`Input JSON does not exist: ${inputPath}`);

  const { createBidDocumentSample } = require(path.join(repoRoot, 'client/electron/services/bidDocumentTemplates.cjs'));
  const { validateBidDocumentProject } = require(path.join(repoRoot, 'client/electron/services/bidDocumentValidation.cjs'));
  const { applyDemoAssetPackageGuard } = require(path.join(repoRoot, 'client/electron/services/bidDocumentReadinessReport.cjs'));
  const {
    readBidDocumentProjectConfig,
    resolveProjectConfigAssetMap,
  } = require(path.join(repoRoot, 'client/electron/services/bidDocumentProjectConfig.cjs'));

  const config = readBidDocumentProjectConfig(inputPath);
  const templateId = config.templateId || config.projectData?.templateId;
  let project = null;
  let buildLog = null;
  let unknownTemplateError = null;
  try {
    project = createBidDocumentSample({
      templateId,
      projectData: config.projectData || {},
      quoteItems: config.quoteItems,
      assetMap: resolveProjectConfigAssetMap(config.assetMap || {}, inputPath),
    });
    buildLog = applyDemoAssetPackageGuard(validateBidDocumentProject(project), config.assetPackage || null);
  } catch (error) {
    if (error?.code !== 'unknown_template_id') throw error;
    unknownTemplateError = error;
    buildLog = createTemplateErrorBuildLog(error, templateId);
  }

  const readinessReport = buildReadinessReport({
    inputPath,
    config,
    project,
    buildLog,
    unknownTemplateError,
  });
  const payload = {
    ok: readinessReport.ready,
    input: inputPath,
    template_id: readinessReport.template_id,
    project_name: readinessReport.project_name,
    quote_total: readinessReport.quote_total,
    target_total: readinessReport.target_total,
    readiness_report: readinessReport,
  };
  writePayload(payload, outputJson, outputMarkdown, outputXlsx);
  if (!payload.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
