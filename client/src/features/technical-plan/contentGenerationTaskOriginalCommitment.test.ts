// @vitest-environment node

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildOriginalCommitmentSummary, rankKnowledgeItemsForChapter, renderKnowledgeItemsForPrompt } = require('../../../electron/services/contentGenerationTask.cjs') as {
  buildOriginalCommitmentSummary: (items: Array<Record<string, unknown>>) => {
    total: number;
    preserved_total: number;
    risk_total: number;
    preservation_rate: number;
    partial_total: number;
    missing_total: number;
    conflict_total: number;
    items: Array<{
      source_id: string;
      category: string;
      status: string;
      missing_points: string[];
    }>;
  };
  rankKnowledgeItemsForChapter: (payload: {
    chapter?: Record<string, unknown>;
    parentChapters?: Array<Record<string, unknown>>;
    projectOverview?: string;
    items?: Array<Record<string, unknown>>;
    limit?: number;
  }) => Array<{
    id: string;
    title: string;
    resume: string;
    relevance_score: number;
    relevance_reason: string;
    matched_terms: string[];
  }>;
  renderKnowledgeItemsForPrompt: (items: Array<Record<string, unknown>>) => string;
};

describe('content generation original commitment summary', () => {
  it('extracts core commitments from original coverage items and summarizes preservation risk', () => {
    const summary = buildOriginalCommitmentSummary([
      {
        source_id: 'P001',
        source_title: '原方案 > 实施组织',
        node_id: 'section-1',
        title: '实施方案',
        status: 'covered',
        repair_status: 'none',
        missing_points: [],
      },
      {
        source_id: 'P002',
        source_title: '原方案 > 服务承诺',
        node_id: 'section-1',
        title: '实施方案',
        status: 'partial',
        repair_status: 'fixed',
        missing_points: ['缺少7x24小时响应承诺'],
      },
      {
        source_id: 'P003',
        source_title: '原方案 > 质保承诺',
        node_id: 'section-1',
        title: '实施方案',
        status: 'missing',
        repair_status: 'manual',
        missing_points: ['缺少三年质保承诺'],
      },
      {
        source_id: 'P004',
        source_title: '原方案 > 项目周期',
        node_id: 'section-1',
        title: '实施方案',
        status: 'conflict',
        repair_status: 'none',
        missing_points: ['周期承诺与原方案相反'],
      },
    ]);

    expect(summary).toMatchObject({
      total: 3,
      preserved_total: 1,
      risk_total: 2,
      preservation_rate: 0.3333,
      missing_total: 1,
      conflict_total: 1,
    });
    expect(summary.items.map((item) => [item.source_id, item.category, item.status])).toEqual([
      ['P002', '服务响应', 'preserved'],
      ['P003', '售后质保', 'missing'],
      ['P004', '交付周期', 'conflict'],
    ]);
    expect(summary.items[1].missing_points).toEqual(['缺少三年质保承诺']);
  });
});

describe('content generation knowledge relevance', () => {
  it('prefilters knowledge items by chapter relevance and renders explainable references', () => {
    const ranked = rankKnowledgeItemsForChapter({
      chapter: {
        id: 'section-1',
        title: '售后服务与应急响应',
        description: '说明7x24小时服务、故障响应、备件保障和应急处置流程。',
      },
      parentChapters: [{ title: '运维服务方案', description: '服务体系、响应机制和保障措施。' }],
      projectOverview: '智慧园区平台建设项目',
      limit: 2,
      items: [
        {
          id: 'doc-1::K001',
          title: '售后服务响应机制',
          resume: '可复用7x24小时热线、故障分级响应、备件保障和应急处置流程。',
        },
        {
          id: 'doc-1::K002',
          title: '施工安全文明措施',
          resume: '可复用施工围挡、安全培训和现场文明施工要求。',
        },
        {
          id: 'doc-1::K003',
          title: '系统架构设计',
          resume: '可复用平台部署架构、网络拓扑和数据接口描述。',
        },
      ],
    });

    expect(ranked.map((item) => item.id)).toEqual(['doc-1::K001']);
    expect(ranked[0].relevance_score).toBeGreaterThan(0);
    expect(ranked[0].relevance_reason).toContain('匹配章节关键词');
    expect(ranked[0].matched_terms.length).toBeGreaterThan(0);

    const promptJson = renderKnowledgeItemsForPrompt(ranked);
    expect(promptJson).toContain('relevance_reason');
    expect(promptJson).toContain('matched_terms');
    expect(promptJson).toContain('售后服务响应机制');
    expect(promptJson).not.toContain('施工安全文明措施');
  });
});
