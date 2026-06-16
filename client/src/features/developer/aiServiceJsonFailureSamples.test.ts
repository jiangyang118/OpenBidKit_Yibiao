// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createAiService } = require('../../../electron/services/aiService.cjs') as {
  createAiService: (options: { app: { getPath: (name: string) => string }; configStore: { load: () => Record<string, unknown> } }) => {
    saveJsonFailureSample: (sample: Record<string, unknown>) => Promise<{ success: boolean; samples: Array<Record<string, unknown>>; filePath: string }>;
    savePromptDebugRecord: (record: Record<string, unknown>) => Promise<{ success: boolean; record: Record<string, unknown>; filePath: string }>;
    listJsonFailureSamples: () => Promise<{ success: boolean; samples: Array<Record<string, unknown>>; filePath: string }>;
    listJsonReplayLogs: () => Promise<{ success: boolean; logs: Array<Record<string, unknown>> }>;
    clearJsonFailureSamples: () => Promise<{ success: boolean; samples: Array<Record<string, unknown>>; filePath: string }>;
  };
};

const tempDirs: string[] = [];

function createServiceContext() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'yibiao-json-failures-'));
  tempDirs.push(userData);
  const service = createAiService({
    app: { getPath: () => userData },
    configStore: { load: () => ({ developer_mode: true }) },
  });
  return { service, userData };
}

function createService() {
  return createServiceContext().service;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('aiService JSON failure samples', () => {
  it('persists, lists and clears developer JSON failure samples', async () => {
    const service = createService();

    const saved = await service.saveJsonFailureSample({
      scenario_id: 'rejection-final',
      scenario_label: '废标项检查 JSON 定稿',
      schema_name: 'rejection-findings',
      target_description: '废标项检查定稿 JSON',
      invalid_content: '{"findings":[{"title":"承诺函缺失\\扫描件不可见"}]}',
      issues: ['非法反斜杠转义：\\扫。'],
      error_message: '模型返回无效 JSON',
    });

    expect(saved.success).toBe(true);
    expect(saved.samples).toHaveLength(1);
    expect(saved.samples[0].scenario_id).toBe('rejection-final');
    expect(saved.filePath).toContain(path.join('logs', 'developer-json-lab', 'failure-samples.json'));
    expect(fs.existsSync(saved.filePath)).toBe(true);

    const listed = await service.listJsonFailureSamples();
    expect(listed.samples).toHaveLength(1);
    expect(listed.samples[0].invalid_content).toContain('承诺函缺失');

    const cleared = await service.clearJsonFailureSamples();
    expect(cleared.samples).toEqual([]);
    expect(fs.existsSync(saved.filePath)).toBe(false);
  });

  it('lists safe JSON replay logs from AI developer logs', async () => {
    const { service, userData } = createServiceContext();
    const logsDir = path.join(userData, 'logs', 'ai');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(logsDir, 'json-log.json'), JSON.stringify({
      request_id: 'request-1',
      log_title: '开发者 JSON 实验室-目录生成',
      type: 'chat',
      request_mode: 'normal',
      request: {
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: '不要返回给前端的完整 prompt' }],
      },
      content: '{"outline":[{"title":"坏 JSON\\\\样本","path":"/Users/jack/secret/file.md","token":"sk-1234567890abcdef"}]}',
      created_at: '2026-06-15T10:00:00.000Z',
    }, null, 2), 'utf-8');

    const result = await service.listJsonReplayLogs();

    expect(result.success).toBe(true);
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].log_title).toBe('开发者 JSON 实验室-目录生成');
    expect(result.logs[0].invalid_content).toContain('[LOCAL_PATH_REMOVED]');
    expect(result.logs[0].invalid_content).toContain('[API_KEY_REMOVED]');
    expect(JSON.stringify(result.logs[0])).not.toContain('完整 prompt');
  });

  it('appends sanitized prompt debug records to developer logs', async () => {
    const { service, userData } = createServiceContext();

    const saved = await service.savePromptDebugRecord({
      chainId: 'content-planning',
      chainLabel: '正文编排 - 章节计划 JSON',
      responseFormat: 'json_object',
      schema: '{"outline":[]}',
      messageCount: 1,
      charCount: 50,
      messages: [{
        role: 'user',
        content: '本地路径 /Users/jack/secret/file.md 和 token sk-1234567890abcdef 不应原样保存',
      }],
    });

    expect(saved.success).toBe(true);
    expect(saved.filePath).toContain(path.join('logs', 'developer-prompt-lab', 'debug-records.jsonl'));
    expect(fs.existsSync(saved.filePath)).toBe(true);

    const jsonl = fs.readFileSync(saved.filePath, 'utf-8').trim();
    const record = JSON.parse(jsonl);
    expect(record.chain_id).toBe('content-planning');
    expect(record.chain_label).toBe('正文编排 - 章节计划 JSON');
    expect(record.messages[0].content).toContain('[LOCAL_PATH_REMOVED]');
    expect(record.messages[0].content).toContain('[API_KEY_REMOVED]');
    expect(jsonl).not.toContain('/Users/jack/secret/file.md');
    expect(jsonl).not.toContain('sk-1234567890abcdef');
    expect(saved.filePath.startsWith(userData)).toBe(true);
  });
});
