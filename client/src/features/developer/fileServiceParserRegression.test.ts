// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { Document, ImageRun, Packer, Paragraph, TextRun } = require('docx');
const {
  createDeveloperParserCapabilityReport,
  extractPageScreenshotCandidates,
  parseDocumentWithConfig,
  renderOfficePageScreenshotCandidates,
  renderPdfPageScreenshotCandidates,
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
  extractPageScreenshotCandidates: (markdown: string, options?: { sourceType?: string; notePrefix?: string; recoverPageNumber?: boolean }) => Array<{
    pageNumber: number;
    lineStart: number;
    lineEnd: number;
    imageLine: number;
    assetUrl: string;
    sourceType?: string;
    note: string;
  }>;
  renderOfficePageScreenshotCandidates: (app: { getPath: (name: string) => string }, filePath: string, options?: { assetScope?: string; lineCount?: number; scale?: number; maxPages?: number; throwOnError?: boolean; convertToPdf?: (inputPath: string, callback: (pdfPath: string) => Promise<unknown>) => Promise<unknown> }) => Promise<Array<{
    pageNumber: number;
    lineStart: number;
    lineEnd: number;
    assetUrl: string;
    width: number;
    height: number;
    sourceType: string;
    note: string;
  }>>;
  renderPdfPageScreenshotCandidates: (app: { getPath: (name: string) => string }, filePath: string, options?: { assetScope?: string; lineCount?: number; scale?: number; maxPages?: number; throwOnError?: boolean }) => Promise<Array<{
    pageNumber: number;
    lineStart: number;
    lineEnd: number;
    assetUrl: string;
    width: number;
    height: number;
    note: string;
  }>>;
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
const mineruLiveTimeoutMs = Number(process.env.YIBIAO_MINERU_E2E_TIMEOUT_MS || 720000);

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

async function writeRemoteDocxWithImage(filePath: string) {
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAHgAAABICAIAAAC2BqGFAAAAuElEQVR4nO3YQQqAIBAEwfb+Z7Z1gZQYqHFLs5pQvJjhrwTI3kVE9r3fALDeNpABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQA5D4BRrhEV0U1BM0AAAAASUVORK5CYII=', 'base64');
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun('YIBIAO_REMOTE_MINERU_E2E 远程解析回归样本')] }),
        new Paragraph({ children: [new TextRun('本段用于验证 MinerU 真实端到端解析结果。')] }),
        new Paragraph({
          children: [
            new ImageRun({
              data: image,
              transformation: { width: 120, height: 72 },
              type: 'png',
            }),
          ],
        }),
      ],
    }],
  });
  await fs.writeFile(filePath, await Packer.toBuffer(doc));
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

function createTempApp() {
  return {
    getPath(name: string) {
      if (name !== 'userData') throw new Error(`unexpected app path: ${name}`);
      return tempRoot;
    },
  };
}

function resolveImportedAssetPath(assetUrl: string) {
  const match = /^yibiao-asset:\/\/imported-images\/([^/]+)\/([^/]+)$/i.exec(assetUrl);
  if (!match) throw new Error(`unexpected asset URL: ${assetUrl}`);
  return path.join(tempRoot, 'workspace', 'imported-images', decodeURIComponent(match[1]), decodeURIComponent(match[2]));
}

async function createRemoteMineruSample() {
  const sampleDir = path.join(tempRoot, '投标项目', 'MinerU真实回归');
  await fs.mkdir(sampleDir, { recursive: true });
  const filePath = path.join(sampleDir, 'MinerU远程解析回归.docx');
  await writeRemoteDocxWithImage(filePath);
  return filePath;
}

async function assertMineruLiveParse(
  provider: 'mineru-accurate-api' | 'mineru-agent-api',
  options: { token?: string; requireImageCandidates?: boolean } = {},
) {
  const filePath = await createRemoteMineruSample();
  const markdown = await parseDocumentWithConfig(createTempApp(), filePath, {
    file_parser: {
      provider,
      mineru_token: options.token || '',
    },
  }, {
    preserveImages: true,
    assetScope: `mineru-live-${provider}`,
  });

  expect(markdown.trim().length).toBeGreaterThan(0);
  expect(markdown).toMatch(/YIBIAO_REMOTE_MINERU_E2E|MinerU|远程解析回归/);

  const candidates = extractPageScreenshotCandidates(markdown, {
    sourceType: 'mineru-remote-image',
    notePrefix: `${provider === 'mineru-accurate-api' ? 'MinerU 精准解析 API' : 'MinerU-Agent 轻量解析 API'}返回的页面图片`,
  });

  if (options.requireImageCandidates) {
    expect(candidates.length).toBeGreaterThan(0);
  }
  for (const candidate of candidates) {
    expect(candidate.sourceType).toBe('mineru-remote-image');
    expect(candidate.assetUrl).toContain('yibiao-asset://imported-images/');
    expect(candidate.note).toContain('自动行号范围');
    const assetPath = resolveImportedAssetPath(candidate.assetUrl);
    const stat = await fs.stat(assetPath);
    expect(stat.size).toBeGreaterThan(0);
  }
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

  it('keeps image samples out of local parsing and documents OFD local OCR fallback', async () => {
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
    expect(resolveFileParser({ file_parser: { provider: 'local-ocr' } }, samples.ofdPath)).toMatchObject({
      provider: 'local-ocr',
      ext: '.ofd',
      supported: true,
    });
    expect(byExtension.get('.png')).toMatchObject({
      recommended_provider: 'local-ocr',
      status: 'local-ocr',
    });
    expect(byExtension.get('.ofd')).toMatchObject({
      recommended_provider: 'local-ocr',
      status: 'local-ocr',
    });
    expect(report.scanned_document_policy).toContain('本地 OCR');
  });

  it('parses OFD through local OCR after converting it to PDF', async () => {
    const samples = await createSamples();
    const paddleInputs: string[] = [];
    const markdown = await parseDocumentWithConfig(createTempApp(), samples.ofdPath, {
      file_parser: { provider: 'local-ocr' },
    }, {
      preserveImages: true,
      assetScope: 'local-ocr-ofd-regression-pages',
      ofdToPdfConverter: async (_inputPath: string, callback: (pdfPath: string) => Promise<string>) => callback(samples.pdfPath),
      paddleOcrRunner: async (imagePath: string) => {
        paddleInputs.push(imagePath);
        return {
          engine: 'PaddleOCR',
          pages: [{
            page_index: 1,
            text: 'OFD converted PDF OCR regression sample',
            lines: [{ text: 'OFD converted PDF OCR regression sample', score: 0.99 }],
          }],
          full_text: 'OFD converted PDF OCR regression sample',
        };
      },
    });

    expect(paddleInputs).toHaveLength(1);
    expect(markdown).toContain('第 1 页 OCR 文本');
    expect(markdown).toContain('OCR 引擎：PaddleOCR');
    expect(markdown).toContain('OFD converted PDF OCR regression sample');

    const candidates = extractPageScreenshotCandidates(markdown, {
      sourceType: 'local-ocr-ofd-page-image',
      notePrefix: 'OFD 本地 OCR 生成的页面截图',
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      pageNumber: 1,
      sourceType: 'local-ocr-ofd-page-image',
    });
  });

  it('renders PDF page screenshot candidates as imported PNG assets', async () => {
    const samples = await createSamples();
    const candidates = await renderPdfPageScreenshotCandidates(createTempApp(), samples.pdfPath, {
      assetScope: 'rejection-check-regression-pages',
      lineCount: 12,
      scale: 0.25,
      throwOnError: true,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      pageNumber: 1,
      lineStart: 1,
      lineEnd: 12,
    });
    expect(candidates[0].width).toBeGreaterThan(100);
    expect(candidates[0].height).toBeGreaterThan(100);
    expect(candidates[0].assetUrl).toContain('yibiao-asset://imported-images/');
    expect(candidates[0].note).toContain('PDF 第 1 页像素级截图');

    const pngPath = resolveImportedAssetPath(candidates[0].assetUrl);
    const png = await fs.readFile(pngPath);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('parses scanned-style PDF through local OCR and keeps page image candidates', async () => {
    const samples = await createSamples();
    const paddleInputs: string[] = [];
    const markdown = await parseDocumentWithConfig(createTempApp(), samples.pdfPath, {
      file_parser: { provider: 'local-ocr' },
    }, {
      preserveImages: true,
      assetScope: 'local-ocr-paddle-regression-pages',
      paddleOcrRunner: async (imagePath: string) => {
        paddleInputs.push(imagePath);
        return {
          engine: 'PaddleOCR',
          pages: [{
            page_index: 1,
            text: 'PaddleOCR local parser regression sample',
            lines: [{ text: 'PaddleOCR local parser regression sample', score: 0.99 }],
          }],
          full_text: 'PaddleOCR local parser regression sample',
        };
      },
    });

    expect(paddleInputs).toHaveLength(1);
    expect(markdown).toContain('第 1 页 OCR 文本');
    expect(markdown).toContain('OCR 引擎：PaddleOCR');
    expect(markdown).toContain('PaddleOCR local parser regression sample');

    const candidates = extractPageScreenshotCandidates(markdown, {
      sourceType: 'local-ocr-page-image',
      notePrefix: '本地 OCR 生成的页面截图',
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      pageNumber: 1,
      sourceType: 'local-ocr-page-image',
    });
  });

  it('falls back to Tesseract for local OCR and keeps page image candidates', async () => {
    const samples = await createSamples();
    const markdown = await parseDocumentWithConfig(createTempApp(), samples.pdfPath, {
      file_parser: { provider: 'local-ocr' },
    }, {
      preserveImages: true,
      assetScope: 'local-ocr-regression-pages',
      localOcrEngine: 'tesseract',
    });

    expect(markdown).toContain('第 1 页 OCR 文本');
    expect(markdown).toContain('OCR 引擎：Tesseract');
    expect(markdown).toMatch(/Yibiao|parser|regression|sample/i);

    const candidates = extractPageScreenshotCandidates(markdown, {
      sourceType: 'local-ocr-page-image',
      notePrefix: '本地 OCR 生成的页面截图',
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      pageNumber: 1,
      sourceType: 'local-ocr-page-image',
    });

    const pngPath = resolveImportedAssetPath(candidates[0].assetUrl);
    const png = await fs.readFile(pngPath);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('renders Office document page screenshot candidates through converted PDF pages', async () => {
    const samples = await createSamples();
    const candidates = await renderOfficePageScreenshotCandidates(createTempApp(), samples.docxPath, {
      assetScope: 'rejection-check-regression-office-pages',
      lineCount: 18,
      scale: 0.25,
      throwOnError: true,
      convertToPdf: async (_inputPath, callback) => callback(samples.pdfPath),
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      pageNumber: 1,
      lineStart: 1,
      lineEnd: 18,
      sourceType: 'office-rendered-pdf',
    });
    expect(candidates[0].assetUrl).toContain('yibiao-asset://imported-images/');
    expect(candidates[0].note).toContain('由 DOCX 转 PDF 后生成的页面截图');
    expect(candidates[0].note).toContain('PDF 第 1 页像素级截图');

    const pngPath = resolveImportedAssetPath(candidates[0].assetUrl);
    const png = await fs.readFile(pngPath);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
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

  it('runs MinerU-Agent live regression when the remote gate is enabled', { timeout: mineruLiveTimeoutMs }, async () => {
    const manifest = require('../../../test/fixtures/parser-regression/manifest.json') as {
      remote_gate: {
        enabled_env: string;
        note: string;
      };
    };
    if (process.env.YIBIAO_RUN_MINERU_E2E !== '1') {
      expect(manifest.remote_gate.enabled_env).toBe('YIBIAO_RUN_MINERU_E2E=1');
      expect(manifest.remote_gate.note).toContain('不触发网络解析');
      return;
    }

    await assertMineruLiveParse('mineru-agent-api', { requireImageCandidates: false });
  });

  it('runs MinerU Accurate live regression when the remote gate and token are configured', { timeout: mineruLiveTimeoutMs }, async () => {
    const manifest = require('../../../test/fixtures/parser-regression/manifest.json') as {
      remote_gate: {
        enabled_env: string;
        token_env: string;
        note: string;
      };
    };
    const token = process.env.YIBIAO_MINERU_TOKEN || '';
    if (process.env.YIBIAO_RUN_MINERU_E2E !== '1' || !token) {
      expect(manifest.remote_gate.enabled_env).toBe('YIBIAO_RUN_MINERU_E2E=1');
      expect(manifest.remote_gate.token_env).toBe('YIBIAO_MINERU_TOKEN');
      expect(manifest.remote_gate.note).toContain('不触发网络解析');
      return;
    }

    await assertMineruLiveParse('mineru-accurate-api', { token, requireImageCandidates: true });
  });
});
