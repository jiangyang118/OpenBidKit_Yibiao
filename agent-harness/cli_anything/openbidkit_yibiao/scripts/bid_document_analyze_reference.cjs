const fs = require('node:fs');
const path = require('node:path');

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
  console.error('Usage: node bid_document_analyze_reference.cjs --input <reference.docx> [--candidate <generated.docx>] [--output-json <analysis.json>]');
  process.exit(2);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = String(process.env.OPENBIDKIT_REPO_ROOT || '').trim();
  const input = String(options.input || '').trim();
  const candidate = String(options.candidate || '').trim();
  const outputJson = String(options['output-json'] || '').trim();

  if (!repoRoot) usage('Missing OPENBIDKIT_REPO_ROOT.');
  if (!input) usage('Missing --input.');

  const {
    analyzeBidReferenceDocument,
    compareBidReferenceAnalyses,
  } = require(path.join(repoRoot, 'client/electron/services/bidDocumentReferenceAnalyzer.cjs'));
  const analysis = analyzeBidReferenceDocument(input);
  const candidateAnalysis = candidate ? analyzeBidReferenceDocument(candidate) : null;
  const alignment = candidateAnalysis ? compareBidReferenceAnalyses(analysis, candidateAnalysis) : null;
  const payload = {
    ok: Boolean(analysis.ok) && (!candidateAnalysis || (Boolean(candidateAnalysis.ok) && Boolean(alignment?.passed))),
    input: path.resolve(input),
    candidate: candidate ? path.resolve(candidate) : '',
    output_json: outputJson ? path.resolve(outputJson) : '',
    analysis,
    candidate_analysis: candidateAnalysis,
    alignment,
  };

  if (outputJson) {
    const outputPath = path.resolve(outputJson);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(candidateAnalysis ? payload : analysis, null, 2), 'utf8');
  }
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  if (!payload.ok) process.exitCode = 1;
}

main();
