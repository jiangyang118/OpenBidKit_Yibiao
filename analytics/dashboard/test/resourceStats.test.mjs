import test from 'node:test';
import assert from 'node:assert/strict';

import { formatResourceClickCount } from '../public/src/pages/resourceStats.js';

test('resource dashboard formats cumulative click counts explicitly', () => {
  assert.equal(formatResourceClickCount(0), '累计 0 次');
  assert.equal(formatResourceClickCount(18), '累计 18 次');
  assert.equal(formatResourceClickCount(12345.9), '累计 12,345 次');
});

test('resource dashboard treats invalid click counts as zero', () => {
  assert.equal(formatResourceClickCount(-2), '累计 0 次');
  assert.equal(formatResourceClickCount('not-a-number'), '累计 0 次');
});
