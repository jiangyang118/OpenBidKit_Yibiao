import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = {
  getElementById() {
    return { value: '', innerHTML: '', checked: false, appendChild() {} };
  },
  querySelectorAll() {
    return [];
  },
};

const { configUsageGroups, labelConfigValue } = await import('../public/src/pages/configUsage.js');

test('dashboard config usage labels business bid actions', () => {
  assert.deepEqual(
    configUsageGroups.find(([key]) => key === 'businessBidActions'),
    ['businessBidActions', '商务标关键动作'],
  );

  assert.equal(labelConfigValue('businessBidActions', 'import_tender_document'), '导入商务标招标文件');
  assert.equal(labelConfigValue('businessBidActions', 'generate_matrix_from_technical_plan'), '从技术方案生成矩阵');
  assert.equal(labelConfigValue('businessBidActions', 'start_ai_extraction'), '启动 AI 结构化提取');
  assert.equal(labelConfigValue('businessBidActions', 'confirm_clause'), '确认商务条款');
  assert.equal(labelConfigValue('businessBidActions', 'export_markdown'), '导出 Markdown 材料包');
  assert.equal(labelConfigValue('businessBidActions', 'export_word'), '导出 Word 材料包');
  assert.equal(labelConfigValue('businessBidActions', 'export_excel'), '导出 Excel 材料包');
});
