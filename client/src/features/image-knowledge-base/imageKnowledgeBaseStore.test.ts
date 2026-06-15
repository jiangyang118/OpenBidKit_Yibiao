import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildMarkdownReference, createImageKnowledgeBaseStore } = require('../../../electron/services/imageKnowledgeBaseStore.cjs') as {
  buildMarkdownReference: (asset: Record<string, unknown>) => string;
  createImageKnowledgeBaseStore: (options: { app: { getPath: (name: string) => string }; db: unknown }) => {
    createAutoMarkdownReference: (payload: { targetId: string; title?: string; prompt?: string; content?: string; keywords?: string[] }) => { matched: boolean; markdown: string; asset: { id: string; title: string } | null; score: number };
    batchUpdateAssets: (payload: { ids: string[]; patch: { category?: string; folder?: string; tags?: string[] }; appendTags?: boolean }) => { assets: Array<{ id: string; category: string; folder: string; tags: string[] }>; folders: string[]; affected: number; message: string };
    renameTag: (oldTag: string, newTag: string) => { assets: Array<{ id: string; tags: string[] }>; tags: string[]; affected: number; message: string };
    deleteTag: (tag: string) => { assets: Array<{ id: string; tags: string[] }>; tags: string[]; affected: number; message: string };
    batchDeleteAssets: (ids: string[]) => { assets: Array<{ id: string }>; affected: number; message: string };
  };
};

function createFakeImageKnowledgeDb() {
  const rows: Array<Record<string, unknown>> = [
    {
      image_id: 'img-1',
      file_name: 'certificate.png',
      title: '企业资质证书',
      category: '资质证书',
      folder: '资信材料',
      description: '',
      source: '',
      scenario: '',
      tags_json: JSON.stringify(['证书']),
      mime_type: 'image/png',
      stored_path: '/tmp/yibiao-test/workspace/image-knowledge-base/images/img-1.png',
      size: 1024,
      width: 800,
      height: 600,
      content_hash: 'hash-1',
      thumbnail_data_url: 'data:image/png;base64,1',
      reference_count: 0,
      created_at: '2026-06-14T10:00:00.000Z',
      updated_at: '2026-06-14T10:00:00.000Z',
    },
    {
      image_id: 'img-2',
      file_name: 'scene.png',
      title: '现场照片',
      category: '现场照片',
      folder: '',
      description: '',
      source: '',
      scenario: '',
      tags_json: JSON.stringify(['现场']),
      mime_type: 'image/png',
      stored_path: '/tmp/yibiao-test/workspace/image-knowledge-base/images/img-2.png',
      size: 2048,
      width: 1024,
      height: 768,
      content_hash: 'hash-2',
      thumbnail_data_url: 'data:image/png;base64,2',
      reference_count: 0,
      created_at: '2026-06-14T10:00:00.000Z',
      updated_at: '2026-06-14T10:00:00.000Z',
    },
  ];
  const relations: Array<Record<string, unknown>> = [];
  return {
    prepare(sql: string) {
      if (/SELECT \* FROM image_knowledge_assets ORDER BY/i.test(sql)) {
        return { all: () => [...rows] };
      }
      if (/SELECT \* FROM image_knowledge_assets WHERE image_id = \?/i.test(sql)) {
        return { get: (id: string) => rows.find((row) => row.image_id === id) || null };
      }
      if (/INSERT INTO image_knowledge_references/i.test(sql)) {
        return { run: (params: Record<string, unknown>) => relations.push(params) };
      }
      if (/SET reference_count = reference_count \+ 1/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            const row = rows.find((item) => item.image_id === params.image_id);
            if (!row) return;
            row.reference_count = Number(row.reference_count || 0) + 1;
            row.updated_at = params.updated_at;
          },
        };
      }
      if (/UPDATE image_knowledge_assets/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            const row = rows.find((item) => item.image_id === params.image_id);
            if (!row) return;
            if ('category' in params) row.category = params.category;
            if ('folder' in params) row.folder = params.folder;
            if ('tags_json' in params) row.tags_json = params.tags_json;
            row.updated_at = params.updated_at;
          },
        };
      }
      if (/DELETE FROM image_knowledge_asset_tags/i.test(sql)) {
        return {
          run: (imageId: string) => {
            for (let index = relations.length - 1; index >= 0; index -= 1) {
              if (relations[index].image_id === imageId) relations.splice(index, 1);
            }
          },
        };
      }
      if (/INSERT OR IGNORE INTO image_knowledge_tags/i.test(sql)) {
        return { run: () => undefined };
      }
      if (/DELETE FROM image_knowledge_tags/i.test(sql)) {
        return { run: () => undefined };
      }
      if (/INSERT OR IGNORE INTO image_knowledge_asset_tags/i.test(sql)) {
        return {
          run: (params: Record<string, unknown>) => {
            relations.push(params);
          },
        };
      }
      if (/DELETE FROM image_knowledge_references/i.test(sql)) {
        return { run: () => undefined };
      }
      if (/DELETE FROM image_knowledge_assets/i.test(sql)) {
        return {
          run: (imageId: string) => {
            const index = rows.findIndex((row) => row.image_id === imageId);
            if (index >= 0) rows.splice(index, 1);
          },
        };
      }
      throw new Error(`Unhandled SQL in fake image knowledge DB: ${sql}`);
    },
    transaction(callback: (items?: unknown) => void) {
      return (items?: unknown) => callback(items);
    },
  };
}

describe('imageKnowledgeBaseStore', () => {
  it('builds exportable markdown references for stored image knowledge assets', () => {
    const markdown = buildMarkdownReference({
      title: '企业资质证书',
      file_name: 'certificate.png',
      stored_path: '/tmp/workspace/image-knowledge-base/images/img-1.png',
      description: '用于资信章节',
    });

    expect(markdown).toContain('![企业资质证书](yibiao-asset://image-knowledge-base/img-1.png)');
    expect(markdown).toContain('*图：企业资质证书，用于资信章节*');
  });

  it('batch updates image categories and appends tags', () => {
    const store = createImageKnowledgeBaseStore({
      app: { getPath: () => '/tmp/yibiao-test' },
      db: createFakeImageKnowledgeDb(),
    });

    const result = store.batchUpdateAssets({
      ids: ['img-1', 'img-2'],
      patch: { category: '交付素材', tags: ['投标', '证书'] },
      appendTags: true,
    });

    expect(result.affected).toBe(2);
    expect(result.assets.every((asset) => asset.category === '交付素材')).toBe(true);
    expect(result.assets.find((asset) => asset.id === 'img-1')?.tags).toEqual(['证书', '投标']);
    expect(result.assets.find((asset) => asset.id === 'img-2')?.tags).toEqual(['现场', '投标', '证书']);
  });

  it('auto creates markdown references from matching section image context', () => {
    const store = createImageKnowledgeBaseStore({
      app: { getPath: () => '/tmp/yibiao-test' },
      db: createFakeImageKnowledgeDb(),
    });

    const result = store.createAutoMarkdownReference({
      targetId: 'section-1',
      title: '企业资质证书配图',
      prompt: '为资信章节插入企业资质证书图片，体现证书材料。',
      content: '本章节需要展示企业资质证书、授权文件和荣誉材料。',
      keywords: ['资信材料', '证书'],
    });

    expect(result.matched).toBe(true);
    expect(result.asset?.id).toBe('img-1');
    expect(result.markdown).toContain('![企业资质证书](yibiao-asset://image-knowledge-base/img-1.png)');
  });

  it('batch updates image folders and returns folder facets', () => {
    const store = createImageKnowledgeBaseStore({
      app: { getPath: () => '/tmp/yibiao-test' },
      db: createFakeImageKnowledgeDb(),
    });

    const result = store.batchUpdateAssets({
      ids: ['img-1'],
      patch: { folder: '证书归档' },
    });

    expect(result.affected).toBe(1);
    expect(result.assets.find((asset) => asset.id === 'img-1')?.folder).toBe('证书归档');
    expect(result.folders).toContain('证书归档');
  });

  it('batch deletes image assets', () => {
    const store = createImageKnowledgeBaseStore({
      app: { getPath: () => '/tmp/yibiao-test' },
      db: createFakeImageKnowledgeDb(),
    });

    const result = store.batchDeleteAssets(['img-1']);

    expect(result.affected).toBe(1);
    expect(result.assets.map((asset) => asset.id)).toEqual(['img-2']);
  });

  it('renames a tag across all image assets', () => {
    const store = createImageKnowledgeBaseStore({
      app: { getPath: () => '/tmp/yibiao-test' },
      db: createFakeImageKnowledgeDb(),
    });

    const result = store.renameTag('证书', '荣誉');

    expect(result.affected).toBe(1);
    expect(result.tags).toContain('荣誉');
    expect(result.tags).not.toContain('证书');
    expect(result.assets.find((asset) => asset.id === 'img-1')?.tags).toEqual(['荣誉']);
  });

  it('deletes a tag across all image assets', () => {
    const store = createImageKnowledgeBaseStore({
      app: { getPath: () => '/tmp/yibiao-test' },
      db: createFakeImageKnowledgeDb(),
    });

    const result = store.deleteTag('现场');

    expect(result.affected).toBe(1);
    expect(result.tags).not.toContain('现场');
    expect(result.assets.find((asset) => asset.id === 'img-2')?.tags).toEqual([]);
  });
});
