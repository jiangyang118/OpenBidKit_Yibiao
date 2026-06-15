import test from 'node:test';
import assert from 'node:assert/strict';

import { buildResourcesTableHtml } from '../public/src/pages/resourceTable.js';

test('resource dashboard table renders image, tags, markdown summary and row actions', () => {
  const html = buildResourcesTableHtml([
    {
      id: 'template-1',
      title: '投标模板资源',
      tags: ['模板', '商务标'],
      enabled: true,
      sortOrder: 2,
      imageUrl: 'https://analytics.test/resource-image?key=cover.png',
      clickCount: 18,
      description: '用于商务标响应的资源模板',
      modalContent: '## 模板说明\n可直接复制到投标文件。',
    },
    {
      id: 'template-2',
      title: '无图资源',
      tagsText: '技术标, 方案',
      enabled: false,
      sortOrder: 3,
      imageUrl: '',
      clickCount: 0,
      description: '',
      modalContent: '',
    },
  ]);

  assert.match(html, /class="resource-table"/);
  assert.match(html, /resource-thumb/);
  assert.match(html, /https:\/\/analytics\.test\/resource-image\?key=cover\.png/);
  assert.match(html, /模板/);
  assert.match(html, /商务标/);
  assert.match(html, /累计 18 次/);
  assert.match(html, /用于商务标响应的资源模板/);
  assert.match(html, /模板说明/);
  assert.match(html, /data-resource-action="edit" data-resource-id="template-1"/);
  assert.match(html, /data-resource-action="delete" data-resource-id="template-1"/);
  assert.match(html, /resource-thumb-placeholder">无图片/);
  assert.match(html, /停用 · 排序 3/);
  assert.match(html, /技术标/);
  assert.match(html, /方案/);
});

test('resource dashboard table renders an explicit empty state', () => {
  assert.equal(buildResourcesTableHtml([]), '<div class="empty">暂无资源，请先新增一条资源。</div>');
});
