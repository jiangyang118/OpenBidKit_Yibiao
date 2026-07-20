const fs = require('node:fs');
const path = require('node:path');

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      options[key.slice(2)] = true;
      continue;
    }
    options[key.slice(2)] = next;
    index += 1;
  }
  return options;
}

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node bid_document_init_config.cjs --template-id <template-id> --output-json <project-config.json> [--with-demo-assets]');
  process.exit(2);
}

function attachDemoAssets(assetMap = {}, outputJson = '') {
  const outputPath = path.resolve(outputJson);
  const outputBase = outputPath.replace(/\.json$/i, '');
  const assetDir = `${outputBase}.assets`;
  fs.mkdirSync(assetDir, { recursive: true });
  return {
    assetMap: Object.fromEntries(Object.entries(assetMap).map(([key, asset]) => {
      const filePath = path.join(assetDir, `${key}.png`);
      fs.writeFileSync(filePath, onePixelPng);
      return [key, {
        ...asset,
        filePath: `./${path.basename(assetDir)}/${key}.png`,
        type: 'image',
      }];
    })),
    assetPackage: {
      type: 'sidecar-directory',
      path: `./${path.basename(assetDir)}`,
      copiedCount: Object.keys(assetMap).length,
      demoOnly: true,
    },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = String(process.env.OPENBIDKIT_REPO_ROOT || '').trim();
  const templateId = String(options['template-id'] || '').trim();
  const outputJson = String(options['output-json'] || '').trim();
  const withDemoAssets = Boolean(options['with-demo-assets']);

  if (!repoRoot) usage('Missing OPENBIDKIT_REPO_ROOT.');
  if (!templateId) usage('Missing --template-id.');
  if (!outputJson) usage('Missing --output-json.');

  const { createBidDocumentSample } = require(path.join(repoRoot, 'client/electron/services/bidDocumentTemplates.cjs'));
  const { getBidDocumentProjectConfigSchema } = require(path.join(repoRoot, 'client/electron/services/bidDocumentTemplates.cjs'));

  let sample;
  try {
    sample = createBidDocumentSample({ templateId });
  } catch (error) {
    if (error?.code !== 'unknown_template_id') throw error;
    const payload = {
      ok: false,
      error: error.code,
      template_id: error.templateId || templateId,
      available_template_ids: error.availableTemplateIds || [],
      output_json: path.resolve(outputJson),
      message: error.message || String(error),
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    process.exitCode = 1;
    return;
  }

  let assetMap = sample.assetMap || {};
  let assetPackage = null;
  if (withDemoAssets) {
    const result = attachDemoAssets(assetMap, outputJson);
    assetMap = result.assetMap;
    assetPackage = result.assetPackage;
  }

  const config = {
    version: 1,
    templateId: sample.template.id,
    projectData: sample.projectData,
    quoteItems: sample.quoteItems,
    assetMap,
    assetPackage,
  };
  const outputPath = path.resolve(outputJson);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2), 'utf8');
  const outputExtension = path.extname(outputPath) || '.json';
  const schemaPath = path.join(path.dirname(outputPath), `${path.basename(outputPath, outputExtension)}.schema.json`);
  fs.writeFileSync(schemaPath, JSON.stringify(getBidDocumentProjectConfigSchema(sample.template.id), null, 2), 'utf8');

  const quoteTotal = (sample.quoteItems || []).reduce((sum, item) => sum + Number(item.totalWithTax || 0), 0);
  const payload = {
    ok: true,
    template_id: sample.template.id,
    output_json: outputPath,
    schema_path: schemaPath,
    quote_total: quoteTotal,
    target_total: Number(sample.projectData?.totalWithTax || 0),
    asset_count: Object.keys(assetMap).length,
    asset_package: assetPackage,
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
