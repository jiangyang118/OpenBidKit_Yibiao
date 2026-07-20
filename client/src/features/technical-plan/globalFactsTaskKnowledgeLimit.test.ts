// @vitest-environment node

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { __test__ } = require('../../../electron/services/globalFactsTask.cjs') as {
  __test__: {
    selectReferenceItemsForPrompt: (
      items: Array<{ id?: string; title?: string; resume?: string; content?: string }>,
      context: Record<string, unknown>,
      options?: { limit?: number; contentMaxChars?: number; resumeMaxChars?: number },
    ) => Array<{ id: string; title: string; resume: string; content: string }>;
  };
};

describe('globalFactsTask knowledge prompt limits', () => {
  it('ranks, limits and truncates reference items before building the prompt', () => {
    const items = Array.from({ length: 12 }, (_item, index) => ({
      id: `item-${index}`,
      title: index === 9 ? '智慧食堂检测报告与团队证书' : `普通资料 ${index}`,
      resume: index === 9 ? 'CNAS 检测报告、CMA 证明、团队人员证书。'.repeat(20) : '通用说明',
      content: index === 9 ? '智慧食堂 平台 检测 报告 证书 '.repeat(80) : '无关正文 '.repeat(80),
    }));

    const selected = __test__.selectReferenceItemsForPrompt(items, {
      tenderMarkdown: '本项目为智慧食堂平台，要求提供检测报告和团队证书。',
      bidAnalysisFactsText: '交付内容包含平台部署、检测报告、人员证书。',
      outlineData: {
        outline: [{ id: '1', title: '证明材料和检测报告', description: '引用 CNAS/CMA 检测报告和团队证书' }],
      },
    }, { limit: 5, contentMaxChars: 60, resumeMaxChars: 30 });

    expect(selected).toHaveLength(5);
    expect(selected[0].id).toBe('item-9');
    expect(selected[0].content.length).toBeLessThanOrEqual(63);
    expect(selected[0].resume.length).toBeLessThanOrEqual(33);
  });
});
