// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { Document, Packer, Paragraph, TextRun } = require('docx');
const {
  createDeveloperParserCapabilityReport,
  parseDocumentWithConfig,
  resolveFileParser,
} = require('../../../electron/services/fileService.cjs') as {
  createDeveloperParserCapabilityReport: () => {
    samples: Array<{
      extension: string;
      recommended_provider: string;
      status: string;
      note: string;
    }>;
    scanned_document_policy: string;
  };
  parseDocumentWithConfig: (app: unknown, filePath: string, config: unknown, options?: unknown) => Promise<string>;
  resolveFileParser: (config: unknown, filePath: string) => {
    provider: string;
    requestedProvider: string;
    ext: string;
    supported: boolean;
    fallbackToLocal: boolean;
  };
};

const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../test/fixtures/parser-regression');
const localConfig = { file_parser: { provider: 'local' } };

let tempRoot = '';

async function writeMinimalPdf(filePath: string) {
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 64 >>
stream
BT /F1 24 Tf 72 720 Td (Yibiao parser regression sample) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000311 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
425
%%EOF
`;
  await fs.writeFile(filePath, pdf, 'utf-8');
}

async function writeDocx(filePath: string) {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun('DOCX 本地解析回归')] }),
        new Paragraph({ children: [new TextRun('中文路径样本文档')] }),
      ],
    }],
  });
  await fs.writeFile(filePath, await Packer.toBuffer(doc));
}

async function writeTinyPng(filePath: string) {
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/luzxYwAAAABJRU5ErkJggg==';
  await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
}

async function createSamples() {
  const sampleDir = path.join(tempRoot, '投标项目', '样本文档');
  await fs.mkdir(sampleDir, { recursive: true });

  const txtPath = path.join(sampleDir, '技术方案样例.txt');
  const mdPath = path.join(sampleDir, '技术方案样例.md');
  const docxPath = path.join(sampleDir, '技术方案样例.docx');
  const pdfPath = path.join(sampleDir, '技术方案样例.pdf');
  const pngPath = path.join(sampleDir, '扫描件样例.png');
  const ofdPath = path.join(sampleDir, '电子发票样例.ofd');

  await fs.copyFile(path.join(fixtureDir, 'sample.txt'), txtPath);
  await fs.copyFile(path.join(fixtureDir, 'sample.md'), mdPath);
  await writeDocx(docxPath);
  await writeMinimalPdf(pdfPath);
  await writeTinyPng(pngPath);
  await fs.writeFile(ofdPath, 'OFD placeholder for parser capability regression', 'utf-8');

  return { sampleDir, txtPath, mdPath, docxPath, pdfPath, pngPath, ofdPath };
}

describe('fileService parser regression samples', () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), '易标解析回归-'));
  });

  afterEach(async () => {
    if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
    tempRoot = '';
  });

  it('parses local regression samples from a Chinese path', async () => {
    const samples = await createSamples();
    const cases = [
      { filePath: samples.txtPath, expected: '售后承诺：7x24 小时响应' },
      { filePath: samples.mdPath, expected: '智慧餐厅建设项目' },
      { filePath: samples.docxPath, expected: 'DOCX 本地解析回归' },
      { filePath: samples.pdfPath, expected: 'Yibiao parser regression sample' },
    ];

    for (const item of cases) {
      const markdown = await parseDocumentWithConfig(undefined, item.filePath, localConfig, { preserveImages: false });
      expect(markdown).toContain(item.expected);
    }
  });

  it('keeps image and OFD samples out of local parsing and documents MinerU gates', async () => {
    const samples = await createSamples();
    const report = createDeveloperParserCapabilityReport();
    const byExtension = new Map(report.samples.map((sample) => [sample.extension, sample]));

    expect(resolveFileParser(localConfig, samples.pngPath)).toMatchObject({
      provider: 'local',
      ext: '.png',
      supported: false,
    });
    expect(resolveFileParser(localConfig, samples.ofdPath)).toMatchObject({
      provider: 'local',
      ext: '.ofd',
      supported: false,
    });
    expect(byExtension.get('.png')).toMatchObject({
      recommended_provider: 'mineru-accurate-api',
      status: 'remote-ocr',
    });
    expect(byExtension.get('.ofd')).toMatchObject({
      recommended_provider: '',
      status: 'unsupported',
    });
    expect(report.scanned_document_policy).toContain('MinerU OCR');
  });

  it('defines explicit environment gates for MinerU end-to-end regression', () => {
    const manifest = require('../../../test/fixtures/parser-regression/manifest.json') as {
      remote_gate: {
        enabled_env: string;
        token_env: string;
        note: string;
      };
    };
    const remoteGateEnabled = process.env.YIBIAO_RUN_MINERU_E2E === '1';
    const mineruTokenConfigured = Boolean(process.env.YIBIAO_MINERU_TOKEN);
    const gateStatus = {
      accurate: remoteGateEnabled && mineruTokenConfigured ? 'ready' : `skipped: set ${manifest.remote_gate.enabled_env} and ${manifest.remote_gate.token_env}`,
      agent: remoteGateEnabled ? 'ready' : `skipped: set ${manifest.remote_gate.enabled_env}`,
    };

    expect(manifest.remote_gate.enabled_env).toBe('YIBIAO_RUN_MINERU_E2E=1');
    expect(manifest.remote_gate.token_env).toBe('YIBIAO_MINERU_TOKEN');
    expect(manifest.remote_gate.note).toContain('不触发网络解析');
    expect(gateStatus.accurate).toMatch(remoteGateEnabled && mineruTokenConfigured ? /^ready$/ : /^skipped:/);
    expect(gateStatus.agent).toMatch(remoteGateEnabled ? /^ready$/ : /^skipped:/);
  });
});
