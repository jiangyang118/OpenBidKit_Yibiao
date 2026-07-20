const fs = require('node:fs');
const path = require('node:path');
const {
  createFailedCheckBuildLog,
  createTemplateErrorBuildLog,
} = require('./bid_document_build_log_helper.cjs');

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
  console.error('Usage: node bid_document_import_asset_package.cjs --input <project-config.json> --package-dir <collection-dir> --output-json <updated-project-config.json>');
  process.exit(2);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = String(process.env.OPENBIDKIT_REPO_ROOT || '').trim();
  const input = String(options.input || '').trim();
  const packageDir = String(options['package-dir'] || '').trim();
  const outputJson = String(options['output-json'] || '').trim();

  if (!repoRoot) usage('Missing OPENBIDKIT_REPO_ROOT.');
  if (!input) usage('Missing --input.');
  if (!packageDir) usage('Missing --package-dir.');
  if (!outputJson) usage('Missing --output-json.');

  const inputPath = path.resolve(input);
  const outputPath = path.resolve(outputJson);
  if (!fs.existsSync(inputPath)) usage(`Input JSON does not exist: ${inputPath}`);

  const { createBidDocumentSample } = require(path.join(repoRoot, 'client/electron/services/bidDocumentTemplates.cjs'));
  const { validateBidDocumentProject } = require(path.join(repoRoot, 'client/electron/services/bidDocumentValidation.cjs'));
  const {
    readBidDocumentProjectConfig,
    resolveProjectConfigAssetMap,
  } = require(path.join(repoRoot, 'client/electron/services/bidDocumentProjectConfig.cjs'));
  const {
    applyQuoteResolutionToProject,
    readAssetCollectionPackage,
  } = require(path.join(repoRoot, 'client/electron/services/bidDocumentReadinessReport.cjs'));

  const config = readBidDocumentProjectConfig(inputPath);
  const templateId = config.templateId || config.projectData?.templateId;
  let project;
  try {
    project = createBidDocumentSample({
      templateId,
      projectData: config.projectData || {},
      quoteItems: config.quoteItems,
      assetMap: resolveProjectConfigAssetMap(config.assetMap || {}, inputPath),
    });
  } catch (error) {
    if (error?.code !== 'unknown_template_id') throw error;
    process.stdout.write(`${JSON.stringify({
      ok: false,
      input: inputPath,
      package_dir: path.resolve(packageDir),
      output_json: outputPath,
      error: error.code,
      template_id: error.templateId || templateId || '',
      available_template_ids: error.availableTemplateIds || [],
      validation_passed: false,
      build_log: createTemplateErrorBuildLog(error, templateId),
    })}\n`);
    process.exitCode = 1;
    return;
  }
  const packageResult = readAssetCollectionPackage(packageDir);
  const manifestTemplateId = packageResult.manifest.templateId || '';
  if (manifestTemplateId && manifestTemplateId !== project.template.id) {
    const mismatchError = `asset_package_template_mismatch:${manifestTemplateId}:${project.template.id}`;
    process.stdout.write(`${JSON.stringify({
      ok: false,
      input: inputPath,
      package_dir: packageResult.rootDir,
      output_json: outputPath,
      error: 'asset_package_template_mismatch',
      template_id: project.template.id,
      manifest_template_id: manifestTemplateId,
      validation_passed: false,
      manifest_path: packageResult.manifestPath,
      manifest_schema_path: packageResult.manifestSchemaPath,
      build_log: createFailedCheckBuildLog('templateCheck', mismatchError, {
        error: 'asset_package_template_mismatch',
        manifestTemplateId,
        currentTemplateId: project.template.id,
        manifestPath: packageResult.manifestPath,
      }),
    })}\n`);
    process.exitCode = 1;
    return;
  }

  const nextAssetMap = { ...(project.assetMap || {}) };
  for (const asset of packageResult.assets) {
    if (!nextAssetMap[asset.key]) continue;
    nextAssetMap[asset.key] = {
      ...nextAssetMap[asset.key],
      filePath: asset.resolvedPath || '',
    };
  }
  const quoteResolutionResult = applyQuoteResolutionToProject(project.projectData, project.quoteItems, packageResult.quoteResolution);
  const nextConfig = {
    version: 1,
    importedAt: new Date().toISOString(),
    templateId: project.template.id,
    projectData: quoteResolutionResult.projectData,
    quoteItems: quoteResolutionResult.quoteItems,
    assetMap: nextAssetMap,
    assetPackage: {
      type: 'material-collection-package',
      path: packageResult.rootDir,
      importedAt: new Date().toISOString(),
      assetCount: packageResult.assets.length,
      appliedCount: packageResult.appliedCount,
      missingCount: packageResult.missingCount,
      missingRequiredCount: packageResult.missingRequiredCount,
      quoteResolutionApplied: quoteResolutionResult.applied,
      quoteResolutionAction: quoteResolutionResult.selectedAction,
      quoteResolutionErrors: quoteResolutionResult.errors,
      demoOnly: false,
    },
  };
  const validationProject = createBidDocumentSample({
    templateId: nextConfig.templateId,
    projectData: nextConfig.projectData,
    quoteItems: nextConfig.quoteItems,
    assetMap: nextConfig.assetMap,
  });
  let buildLog = validateBidDocumentProject(validationProject);
  if (quoteResolutionResult.errors.length > 0) {
    buildLog = {
      ...buildLog,
      passed: false,
      quoteResolutionCheck: {
        passed: false,
        errors: quoteResolutionResult.errors,
        details: {
          selectedAction: quoteResolutionResult.selectedAction,
          quoteResolutionPath: packageResult.quoteResolution.path,
        },
      },
      errors: [...(buildLog.errors || []), ...quoteResolutionResult.errors],
    };
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(nextConfig, null, 2), 'utf8');

  process.stdout.write(`${JSON.stringify({
    ok: true,
    input: inputPath,
    package_dir: packageResult.rootDir,
    output_json: outputPath,
    manifest_schema_path: packageResult.manifestSchemaPath,
    applied_count: packageResult.appliedCount,
    missing_count: packageResult.missingCount,
    missing_required_count: packageResult.missingRequiredCount,
    quote_resolution_path: packageResult.quoteResolution.path,
    quote_resolution_applied: quoteResolutionResult.applied,
    quote_resolution_action: quoteResolutionResult.selectedAction,
    quote_resolution_errors: quoteResolutionResult.errors,
    validation_passed: Boolean(buildLog.passed),
    build_log: buildLog,
  })}\n`);
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
