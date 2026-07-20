// @vitest-environment node

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const guide = require('../../../electron/services/bidWritingGuide.cjs') as {
  getMatureBidOutlineRules: () => string;
  getMatureBidPlanningRules: () => string;
  getMatureBidContentRules: () => string;
  getDefaultProjectTeamFacts: () => string;
  getDefaultProjectTeamRules: () => string;
  getLegacyBidGuideSnapshot: () => {
    structureRules: string[];
    tablePatterns: string[];
    styleRules: string[];
    projectTeamMembers: Array<{ role: string; name: string; responsibility: string }>;
    forbiddenProjectTeamNames: string[];
  };
};
const contentGenerationTask = require('../../../electron/services/contentGenerationTask.cjs') as {
  __test__: {
    normalizeGeneratedMarkdown: (content: string) => string;
  };
};

describe('bidWritingGuide', () => {
  it('keeps legacy bid structure and attachment templates in outline rules', () => {
    const rules = guide.getMatureBidOutlineRules();

    expect(rules).toContain('报价文件');
    expect(rules).toContain('法定代表人授权');
    expect(rules).toContain('资格资信');
    expect(rules).toContain('实施验收');
    expect(rules).toContain('偏离表');
    expect(rules).toContain('附件装订要求');
  });

  it('exposes table-driven patterns for planning and content prompts', () => {
    const planningRules = guide.getMatureBidPlanningRules();
    const contentRules = guide.getMatureBidContentRules();

    for (const text of [planningRules, contentRules]) {
      expect(text).toContain('总体架构表：层级 | 组成 | 作用');
      expect(text).toContain('技术指标参数响应表');
      expect(text).toContain('实施阶段计划表');
      expect(text).toContain('问题整改台账');
      expect(text).toContain('交付资料清单');
    }
  });

  it('preserves no-fabrication and formal response wording boundaries', () => {
    const snapshot = guide.getLegacyBidGuideSnapshot();
    const allRules = [
      ...snapshot.structureRules,
      ...snapshot.tablePatterns,
      ...snapshot.styleRules,
      guide.getMatureBidContentRules(),
    ].join('\n');

    expect(allRules).toContain('无偏离');
    expect(allRules).toContain('正式递交前补齐');
    expect(allRules).toContain('待补同型号报告');
    expect(allRules).toContain('不得编造品牌、型号、页码、证书编号或检测结论');
    expect(allRules).toContain('检测报告正文或证书附件');
    expect(allRules).toContain('不得输出“P__”“第__页”“第__页至第__页”等空白页码占位');
    expect(allRules).toContain('不得把血常规、医院检验、体检、医学检测报告单等个人健康材料当作本项目产品检测报告');
  });

  it('uses the real company project team names and blocks wrong placeholders', () => {
    const facts = guide.getDefaultProjectTeamFacts();
    const rules = guide.getDefaultProjectTeamRules();
    const snapshot = guide.getLegacyBidGuideSnapshot();

    expect(facts).toContain('项目经理：姜阳');
    expect(facts).toContain('技术负责人：赖清涛');
    expect(facts).toContain('硬件实施工程师：赵野');
    expect(facts).toContain('软件实施工程师：兰海军');
    expect(facts).toContain('培训讲师：张帅');
    expect(facts).toContain('售后服务负责人：柴玉龙');
    expect(rules).toContain('6小时响应、12小时到场');
    expect(snapshot.projectTeamMembers).toHaveLength(6);
    expect(snapshot.forbiddenProjectTeamNames).toEqual(expect.arrayContaining(['李阳', '王磊', '赵晨', '陈静', '刘洋']));
  });

  it('normalizes blank page placeholders before content is saved', () => {
    const normalized = contentGenerationTask.__test__.normalizeGeneratedMarkdown([
      '证明材料索引：技术指标参数响应偏离表，页码拟编入：P__至P__。',
      '软件检测报告见本册第__页至第__页。',
      '| 材料 | 页码 |',
      '| --- | --- |',
      '| 产品规格表 | 第__页 |',
    ].join('\n'));

    expect(normalized).not.toContain('P__');
    expect(normalized).not.toContain('第__页');
    expect(normalized).toContain('页码由导出定稿阶段按最终装订页码回填');
    expect(normalized).toContain('导出时按最终装订页码回填');
  });
});
