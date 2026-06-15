// @vitest-environment node

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createDeveloperParserCapabilityReport, resolveFileParser } = require('../../../electron/services/fileService.cjs') as {
  createDeveloperParserCapabilityReport: () => {
    samples: Array<{
      extension: string;
      local_supported: boolean;
      mineru_accurate_supported: boolean;
      mineru_agent_supported: boolean;
      recommended_provider: string;
      status: string;
      note: string;
    }>;
    chinese_path_smoke: { required: boolean; note: string; example: string };
    scanned_document_policy: string;
  };
  resolveFileParser: (config: unknown, filePath: string) => {
    provider: string;
    requestedProvider: string;
    ext: string;
    supported: boolean;
    fallbackToLocal: boolean;
  };
};

describe('fileService parser capability report', () => {
  it('covers the parser hardening sample extensions and scanning guidance', () => {
    const report = createDeveloperParserCapabilityReport();
    const byExtension = new Map(report.samples.map((sample) => [sample.extension, sample]));

    expect([...byExtension.keys()]).toEqual(['.pdf', '.docx', '.doc', '.wps', '.ofd', '.jpeg', '.png']);
    expect(byExtension.get('.pdf')?.note).toContain('扫描件 PDF');
    expect(byExtension.get('.jpeg')?.status).toBe('remote-ocr');
    expect(byExtension.get('.png')?.recommended_provider).toBe('mineru-accurate-api');
    expect(byExtension.get('.ofd')?.status).toBe('unsupported');
    expect(byExtension.get('.ofd')?.note).toContain('转换为 PDF/DOCX');
    expect(report.scanned_document_policy).toContain('MinerU OCR');
  });

  it('keeps Chinese path smoke requirements explicit and preserves local fallback behavior', () => {
    const report = createDeveloperParserCapabilityReport();
    const parser = resolveFileParser(
      { file_parser: { provider: 'mineru-agent-api' } },
      'C:\\投标项目\\样本文档\\技术方案样例.wps',
    );

    expect(report.chinese_path_smoke.required).toBe(true);
    expect(report.chinese_path_smoke.example).toContain('技术方案样例.docx');
    expect(parser.provider).toBe('local');
    expect(parser.fallbackToLocal).toBe(true);
  });
});
