import test from 'node:test';
import assert from 'node:assert/strict';

import { getPageLabel, pageLabels } from '../public/src/pageLabels.js';

test('dashboard labels cover new product and developer pages', () => {
  const expectedLabels = {
    'business-bid': '商务标',
    'bid-document': '完整标书生成',
    'image-knowledge-base': '图片知识库',
    'ai-evaluation': 'AI评标',
    'bid-opportunity': '投标机会',
    'bid-market-analysis': '招投标分析',
    'developer-prompt-lab': '测试页 - Prompt调试台',
    'developer-parser-sandbox': '测试页 - 文件解析沙盘',
    'developer-export-preview': '测试页 - 导出链路预演',
  };

  for (const [page, label] of Object.entries(expectedLabels)) {
    assert.equal(pageLabels[page], label);
    assert.equal(getPageLabel(page), label);
  }
});

test('dashboard labels keep unknown page fallback explicit', () => {
  assert.equal(getPageLabel('/Users/jack/投标文件.docx'), '未知页面');
});

test('dashboard labels preserve historical expanded workflow routes', () => {
  assert.equal(getPageLabel('technical-plan/expand'), '技术方案 - 扩写改写');
  assert.equal(getPageLabel('existing-plan-expansion/expand'), '已有方案扩写 - 扩写改写');
});
