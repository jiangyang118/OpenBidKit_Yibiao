import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTrackBody, validateTrackEvent } from '../src/services/analyticsTrack.js';

test('track normalization keeps page ids stable and drops sensitive arbitrary fields', () => {
  const event = normalizeTrackBody({
    projectName: 'yibiao-client',
    event: 'page_view',
    page: '/Users/jack/项目/投标文件.docx',
    version: '0.1.0',
    platform: 'darwin',
    client_id: 'client-001',
    client_created_at: '2026-06-15',
    prompt: '请完整生成投标正文',
    file_name: '投标文件.docx',
    local_path: '/Users/jack/项目/投标文件.docx',
  }, new Request('https://analytics.test/track'));

  assert.equal(validateTrackEvent(event), '');
  assert.equal(event.page, '');
  assert.ok(!event.blobs.join('\n').includes('/Users/jack'));
  assert.ok(!event.blobs.join('\n').includes('投标文件.docx'));
  assert.ok(!event.blobs.join('\n').includes('请完整生成投标正文'));
});

test('track normalization stores AI endpoint host without URL path and rejects path shaped resource key', () => {
  const aiEvent = normalizeTrackBody({
    projectName: 'yibiao-client',
    event: 'ai_request',
    page: 'technical-plan/content-edit',
    version: '0.1.0',
    platform: 'darwin',
    client_id: 'client-001',
    client_created_at: '2026-06-15',
    ai_model_provider: 'lm-studio',
    ai_model_base_url: 'http://127.0.0.1:1234/v1/chat/completions?token=secret',
    ai_model_name: 'local-model',
    ai_request_type: 'text',
  }, new Request('https://analytics.test/track'));

  assert.equal(aiEvent.page, 'technical-plan/content-edit');
  assert.equal(aiEvent.blobs[9], '127.0.0.1');
  assert.ok(!aiEvent.blobs.join('\n').includes('token=secret'));

  const resourceEvent = normalizeTrackBody({
    projectName: 'yibiao-client',
    event: 'resource_click',
    page: 'resources',
    version: '0.1.0',
    platform: 'darwin',
    client_id: 'client-001',
    client_created_at: '2026-06-15',
    resource_key: '../资源/投标文件.docx',
  }, new Request('https://analytics.test/track'));

  assert.equal(resourceEvent.blobs[8], '');
});

test('track normalization keeps only fixed business bid action values', () => {
  const validEvent = normalizeTrackBody({
    projectName: 'yibiao-client',
    event: 'config_usage',
    version: '0.1.0',
    platform: 'darwin',
    client_id: 'client-001',
    client_created_at: '2026-06-15',
    config_key: 'businessBidActions',
    config_value: 'confirm_clause',
  }, new Request('https://analytics.test/track'));

  assert.equal(validEvent.blobs[8], 'businessBidActions');
  assert.equal(validEvent.blobs[9], 'confirm_clause');

  const invalidEvent = normalizeTrackBody({
    projectName: 'yibiao-client',
    event: 'config_usage',
    version: '0.1.0',
    platform: 'darwin',
    client_id: 'client-001',
    client_created_at: '2026-06-15',
    config_key: 'businessBidActions',
    config_value: '/Users/jack/项目/商务条款.docx',
  }, new Request('https://analytics.test/track'));

  assert.equal(invalidEvent.blobs[8], 'businessBidActions');
  assert.equal(invalidEvent.blobs[9], '');
});
