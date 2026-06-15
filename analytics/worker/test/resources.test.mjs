import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handleAdminResources,
  handlePublicResources,
  handleResourceImage,
} from '../src/routes/resources.js';
import { createResourceAnalyticsKey } from '../src/services/resourceStore.js';
import { rollupResourceClicksDay } from '../src/services/analyticsStatsStore.js';

test('resource admin flow creates searchable public resource with R2 image and deletes it', async () => {
  const db = createResourceDb();
  const bucket = createResourceBucket();
  const env = createEnv({ db, bucket });
  const form = new FormData();
  form.set('title', '投标模板资源');
  form.set('tags', '模板, 商务标, 模板');
  form.set('description', '用于商务标响应的资源模板');
  form.set('modalContent', '## 模板说明\n可直接复制到投标文件。');
  form.set('sortOrder', '0');
  form.set('enabled', 'true');
  form.set('image', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'cover.png');

  const saveResponse = await handleAdminResources(
    new Request('https://analytics.test/api/resources', {
      method: 'POST',
      headers: adminHeaders(),
      body: form,
    }),
    env,
    new URL('https://analytics.test/api/resources'),
  );
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.code, 0);
  assert.equal(saved.resource.title, '投标模板资源');
  assert.deepEqual(saved.resource.tags, ['模板', '商务标']);
  assert.match(saved.resource.imageKey, /^resources\/resource-/);
  assert.match(saved.resource.imageUrl, /^https:\/\/analytics\.test\/resource-image\?key=/);
  assert.equal(bucket.objects.size, 1);

  const publicResponse = await handlePublicResources(
    new Request('https://analytics.test/resources?q=模板'),
    env,
    new URL('https://analytics.test/resources?q=模板'),
  );
  assert.equal(publicResponse.status, 200);
  const publicBody = await publicResponse.json();
  assert.equal(publicBody.code, 0);
  assert.equal(publicBody.resources.length, 1);
  assert.equal(publicBody.resources[0].id, saved.resource.id);
  assert.equal(publicBody.resources[0].clickCount, 0);

  const imageResponse = await handleResourceImage(
    new Request(`https://analytics.test/resource-image?key=${encodeURIComponent(saved.resource.imageKey)}`),
    env,
    new URL(`https://analytics.test/resource-image?key=${encodeURIComponent(saved.resource.imageKey)}`),
  );
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get('Content-Type'), 'image/png');
  assert.equal((await imageResponse.arrayBuffer()).byteLength, 4);

  const deleteResponse = await handleAdminResources(
    new Request(`https://analytics.test/api/resources?id=${encodeURIComponent(saved.resource.id)}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    }),
    env,
    new URL(`https://analytics.test/api/resources?id=${encodeURIComponent(saved.resource.id)}`),
  );
  assert.equal(deleteResponse.status, 200);
  assert.equal((await deleteResponse.json()).code, 0);
  assert.equal(db.rows.length, 0);
  assert.equal(bucket.objects.size, 0);
});

test('resource routes protect admin API and hide disabled public resources', async () => {
  const db = createResourceDb();
  const env = createEnv({ db, bucket: createResourceBucket() });

  const unauthorized = await handleAdminResources(
    new Request('https://analytics.test/api/resources', { method: 'GET' }),
    env,
    new URL('https://analytics.test/api/resources'),
  );
  assert.equal(unauthorized.status, 401);

  const form = new FormData();
  form.set('title', '内部资源');
  form.set('tags', '内部');
  form.set('description', '仅管理端可见');
  form.set('modalContent', '不公开展示');
  form.set('enabled', 'false');

  const saveResponse = await handleAdminResources(
    new Request('https://analytics.test/api/resources', {
      method: 'POST',
      headers: adminHeaders(),
      body: form,
    }),
    env,
    new URL('https://analytics.test/api/resources'),
  );
  assert.equal(saveResponse.status, 200);
  assert.equal((await saveResponse.json()).resource.enabled, false);

  const publicResponse = await handlePublicResources(
    new Request('https://analytics.test/resources?q=内部'),
    env,
    new URL('https://analytics.test/resources?q=内部'),
  );
  assert.deepEqual((await publicResponse.json()).resources, []);

  const adminResponse = await handleAdminResources(
    new Request('https://analytics.test/api/resources', {
      method: 'GET',
      headers: adminHeaders(),
    }),
    env,
    new URL('https://analytics.test/api/resources'),
  );
  const adminBody = await adminResponse.json();
  assert.equal(adminBody.resources.length, 1);
  assert.equal(adminBody.resources[0].title, '内部资源');
});

test('resource lists combine persisted click count with today resource_click events', async () => {
  const db = createResourceDb();
  const env = createEnv({ db, bucket: createResourceBucket() });
  env.ACCOUNT_ID = 'account-id';
  env.ANALYTICS_API_TOKEN = 'analytics-token';
  db.rows.push(createResourceRow({ id: 'resource-clicked', title: '点击统计资源', click_count: 12 }));
  db.rows.push(createResourceRow({ id: 'resource-quiet', title: '无点击资源', click_count: 3 }));
  const clickedKey = createResourceAnalyticsKey('resource-clicked');
  const quietKey = createResourceAnalyticsKey('resource-quiet');
  const originalFetch = globalThis.fetch;
  const queries = [];
  globalThis.fetch = async (url, options = {}) => {
    queries.push(String(options.body || ''));
    assert.equal(url, 'https://api.cloudflare.com/client/v4/accounts/account-id/analytics_engine/sql');
    assert.match(String(options.body || ''), /blob2 = 'resource_click'/);
    assert.match(String(options.body || ''), new RegExp(clickedKey));
    assert.match(String(options.body || ''), new RegExp(quietKey));
    return new Response(JSON.stringify({
      data: [
        { resourceKey: clickedKey, clickCount: 5 },
      ],
    }), { status: 200 });
  };

  try {
    const publicResponse = await handlePublicResources(
      new Request('https://analytics.test/resources?projectName=yibiao-client'),
      env,
      new URL('https://analytics.test/resources?projectName=yibiao-client'),
    );
    const publicBody = await publicResponse.json();
    assert.equal(publicBody.resources.find((item) => item.id === 'resource-clicked').clickCount, 17);
    assert.equal(publicBody.resources.find((item) => item.id === 'resource-quiet').clickCount, 3);

    const adminResponse = await handleAdminResources(
      new Request('https://analytics.test/api/resources?projectName=yibiao-client', {
        method: 'GET',
        headers: adminHeaders(),
      }),
      env,
      new URL('https://analytics.test/api/resources?projectName=yibiao-client'),
    );
    const adminBody = await adminResponse.json();
    assert.equal(adminBody.resources.find((item) => item.id === 'resource-clicked').clickCount, 17);
    assert.equal(queries.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resource click rollup increments persisted click_count for matched resources', async () => {
  const db = createResourceDb();
  const env = createEnv({ db, bucket: createResourceBucket() });
  env.ACCOUNT_ID = 'account-id';
  env.ANALYTICS_API_TOKEN = 'analytics-token';
  db.rows.push(createResourceRow({ id: 'resource-rollup', title: '历史点击资源', click_count: 20 }));
  db.rows.push(createResourceRow({ id: 'resource-other', title: '未匹配资源', click_count: 7 }));
  const rollupKey = createResourceAnalyticsKey('resource-rollup');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: [
      { resourceKey: rollupKey, clickCount: 4 },
      { resourceKey: 'r_unknown', clickCount: 99 },
    ],
  }), { status: 200 });

  try {
    const result = await rollupResourceClicksDay(env, 'yibiao-client', '2026-06-14');
    assert.equal(result.skipped, false);
    assert.equal(db.rows.find((row) => row.id === 'resource-rollup').click_count, 24);
    assert.equal(db.rows.find((row) => row.id === 'resource-other').click_count, 7);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createEnv({ db, bucket }) {
  return {
    ADMIN_TOKEN: 'test-token',
    RESOURCE_DB: db,
    RESOURCE_BUCKET: bucket,
  };
}

function adminHeaders() {
  return { Authorization: 'Bearer test-token' };
}

function createResourceBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, body, options = {}) {
      objects.set(key, {
        body,
        httpMetadata: options.httpMetadata || {},
      });
    },
    async get(key) {
      return objects.get(key) || null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

function createResourceDb() {
  const db = {
    rows: [],
    prepare(sql) {
      return createStatement(db, sql);
    },
  };
  return db;
}

function createResourceRow({
  id,
  title,
  tags = '',
  description = '',
  modal_content = '',
  image_key = '',
  click_count = 0,
  sort_order = 0,
  enabled = 1,
} = {}) {
  return {
    id,
    title,
    tags,
    description,
    modal_content,
    image_key,
    image_url: '',
    click_count,
    sort_order,
    enabled,
    created_at: '2026-06-14 00:00:00',
    updated_at: '2026-06-14 00:00:00',
  };
}

function createStatement(db, sql) {
  let args = [];
  return {
    bind(...values) {
      args = values;
      return this;
    },
    async all() {
      if (sql.includes('SELECT sort_order') && sql.includes('WHERE sort_order >= ?')) {
        const minimum = Number(args[0] || 0);
        return {
          results: db.rows
            .filter((row) => Number(row.sort_order || 0) >= minimum)
            .sort(bySortOrderThenUpdatedAt)
            .map((row) => ({ sort_order: row.sort_order })),
        };
      }

      if (sql.includes('WHERE enabled = 1')) {
        const searchTerm = sql.includes('LIKE ?') ? normalizeLikeArg(args[0]) : '';
        return {
          results: db.rows
            .filter((row) => Number(row.enabled) !== 0)
            .filter((row) => !searchTerm || resourceMatches(row, searchTerm))
            .sort(bySortOrderThenUpdatedAt),
        };
      }

      if (sql.includes('FROM resources')) {
        return { results: [...db.rows].sort(bySortOrderThenUpdatedAt) };
      }

      throw new Error(`Unhandled all SQL: ${sql}`);
    },
    async first() {
      if (sql.includes('FROM resources') && sql.includes('WHERE id = ?')) {
        return db.rows.find((row) => row.id === args[0]) || null;
      }
      throw new Error(`Unhandled first SQL: ${sql}`);
    },
    async run() {
      if (sql.includes('UPDATE resources') && sql.includes('SET sort_order = sort_order + 1')) {
        const [lower, upper] = args.map((value) => Number(value || 0));
        for (const row of db.rows) {
          const order = Number(row.sort_order || 0);
          if (order >= lower && order < upper) {
            row.sort_order = order + 1;
          }
        }
        return { success: true };
      }

      if (sql.includes('UPDATE resources') && sql.includes('SET click_count = click_count + ?')) {
        const [clickCount, id] = args;
        const row = db.rows.find((item) => item.id === id);
        if (row) {
          row.click_count = Number(row.click_count || 0) + Number(clickCount || 0);
        }
        return { success: true };
      }

      if (sql.includes('INSERT INTO resources')) {
        const [
          id,
          title,
          tags,
          description,
          modalContent,
          imageKey,
          imageUrl,
          sortOrder,
          enabled,
          createdAt,
          updatedAt,
        ] = args;
        const existing = db.rows.find((row) => row.id === id);
        const nextRow = {
          id,
          title,
          tags,
          description,
          modal_content: modalContent,
          image_key: imageKey,
          image_url: imageUrl,
          click_count: existing?.click_count || 0,
          sort_order: sortOrder,
          enabled,
          created_at: existing?.created_at || createdAt,
          updated_at: updatedAt,
        };

        if (existing) {
          Object.assign(existing, nextRow);
        } else {
          db.rows.push(nextRow);
        }
        return { success: true };
      }

      if (sql.includes('DELETE FROM resources WHERE id = ?')) {
        const index = db.rows.findIndex((row) => row.id === args[0]);
        if (index >= 0) {
          db.rows.splice(index, 1);
        }
        return { success: true };
      }

      throw new Error(`Unhandled run SQL: ${sql}`);
    },
  };
}

function bySortOrderThenUpdatedAt(left, right) {
  const sortDelta = Number(left.sort_order || 0) - Number(right.sort_order || 0);
  if (sortDelta !== 0) {
    return sortDelta;
  }
  return String(right.updated_at || '').localeCompare(String(left.updated_at || ''));
}

function normalizeLikeArg(value) {
  return String(value || '')
    .replace(/^%|%$/g, '')
    .replace(/\\([%_\\])/g, '$1')
    .toLowerCase();
}

function resourceMatches(row, searchTerm) {
  const text = [
    row.title,
    row.tags,
    row.description,
    row.modal_content,
  ].join('\n').toLowerCase();
  return text.includes(searchTerm);
}
