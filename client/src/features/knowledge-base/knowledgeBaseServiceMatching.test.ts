// @vitest-environment node

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { _internals } = require('../../../electron/services/knowledgeBaseService.cjs') as {
  _internals: {
    selectCandidateBlocksForMatchBatch: (
      blocks: Array<Record<string, unknown>>,
      batchItems: Array<Record<string, unknown>>,
      options?: { limit?: number; context?: number },
    ) => { blocks: Array<{ id: string; content: string }>; prefiltered: boolean; selected_count: number; total_count: number; matched_terms: string[] };
    renderBlocksForPrompt: (blocks: Array<Record<string, unknown>>) => string;
    buildMatchMessages: (
      documentName: string,
      blockText: string,
      batchItems: Array<Record<string, unknown>>,
      blockSelection?: Record<string, unknown>,
    ) => Array<{ role: string; content: string }>;
  };
};

function block(id: string, heading: string, content: string) {
  return {
    id,
    type: 'paragraph',
    heading_path: [heading],
    content,
  };
}

describe('knowledgeBaseService match block prefilter', () => {
  it('selects candidate blocks for the current item batch before building the match prompt', () => {
    const blocks = [
      block('P000001', '项目概况', '本项目为智慧园区平台建设，包含用户管理和数据看板。'),
      block('P000002', '施工安全', '施工现场设置围挡，开展安全培训和文明施工检查。'),
      block('P000003', '施工安全', '现场材料堆放整齐，施工人员佩戴安全防护用品。'),
      block('P000004', '售后服务', '提供7x24小时服务热线，故障按一级、二级、三级分级响应。'),
      block('P000005', '售后服务', '重大故障30分钟响应，2小时到场，备件库保障核心设备更换。'),
      block('P000006', '项目进度', '项目分为启动、设计、开发、联调、试运行和验收阶段。'),
      block('P000007', '系统架构', '平台采用前后端分离架构，数据接口通过网关统一接入。'),
      block('P000008', '培训方案', '对管理员和业务用户分别开展操作培训。'),
    ];
    const batchItems = [{
      id: 'K000001',
      title: '售后服务响应机制',
      summary: '可复用7x24小时热线、故障分级响应、到场时限和备件保障。',
    }];

    const selection = _internals.selectCandidateBlocksForMatchBatch(blocks, batchItems, { limit: 4, context: 0 });

    expect(selection.prefiltered).toBe(true);
    expect(selection.total_count).toBe(8);
    expect(selection.blocks.map((item) => item.id)).toEqual(['P000004', 'P000005']);
    expect(selection.matched_terms.length).toBeGreaterThan(0);

    const messages = _internals.buildMatchMessages(
      '历史投标文件.docx',
      _internals.renderBlocksForPrompt(selection.blocks),
      batchItems,
      selection,
    );
    const prompt = messages.map((message) => message.content).join('\n');
    expect(prompt).toContain('候选 block 列表');
    expect(prompt).toContain('P000004');
    expect(prompt).toContain('P000005');
    expect(prompt).toContain('K000001');
    expect(prompt).not.toContain('P000002');
    expect(prompt).not.toContain('施工现场设置围挡');
  });
});
