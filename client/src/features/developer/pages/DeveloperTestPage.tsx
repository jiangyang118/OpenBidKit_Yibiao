import { useEffect, useMemo, useState } from 'react';
import { aiClient } from '../../../shared/ai/aiClient';
import {
  buildJsonRepairMessages,
  buildOutlineMessages,
  buildRejectionCheckFinalMessages,
} from '../../../shared/prompts';
import type { ChatMessage } from '../../../shared/types';
import type { JsonFailureSample, JsonFailureSampleInput, JsonReplayLog } from '../../../shared/types';

type LabScenarioId = 'outline' | 'global-facts' | 'rejection-final' | 'business-bid' | 'bid-opportunity' | 'ai-evaluation';
type RunningMode = 'request' | 'repair' | null;

interface JsonLabScenario {
  id: LabScenarioId;
  label: string;
  shortLabel: string;
  description: string;
  schemaName: string;
  logTitle: string;
  temperature: number;
  targetDescription: string;
  outputSchema: string;
  buildMessages: () => ChatMessage[];
  invalidSample: string;
  issues: string[];
}

const sampleTenderContent = `# 易标测试项目招标文件

项目名称：易标测试项目。
项目编号：YB-TEST-001。
项目类型：软件服务。
项目预算：100 万元。
项目地址：北京市海淀区。

技术评分要求：
1. 技术方案完整性，满分 30 分，要求章节完整、实施路径清晰。
2. 项目实施计划，满分 20 分，要求进度安排合理、风险控制明确。
3. 运维服务能力，满分 15 分，要求说明响应时效和服务保障。

无效投标与废标要求：
1. 未按要求提供承诺函的，作无效投标处理。
2. 投标报价超过预算的，作无效投标处理。`;

const sampleBidContent = `# 易标测试项目投标文件

## 投标函
我方承诺按招标文件要求提供服务。

## 技术方案
项目实施周期为 90 日，提供 7x24 小时运维响应。

## 附件
已提供承诺函、项目团队表和售后服务承诺。`;

const sampleBusinessTenderContent = `# 易标测试项目商务条款

付款方式：验收合格后 30 日内支付合同价款。
投标人须在投标截止前提交履约保证金保函。
投标文件应包含分项报价表和报价说明。
需提供近三年类似业绩证明、营业执照和授权书。
合同违约责任和质保期按招标文件执行。`;

const sampleOpportunityNotice = `项目名称：智慧园区综合运维平台采购项目
采购人：某产业园管理委员会
预算金额：3200万元
项目地点：广东省深圳市
投标截止：2026年08月08日 09:30
资格要求：投标人须具备类似智慧园区平台建设业绩，并提供软件著作权和本地化服务承诺。
评分办法：商务资信 30 分，技术方案 50 分，报价 20 分。`;

const sampleEvaluationMethod = `评分办法：
1. 商务资信 30 分：类似业绩 10 分，企业资质 10 分，团队能力 10 分。
2. 技术方案 50 分：总体方案 20 分，实施计划 15 分，运维服务 15 分。
3. 报价 20 分：按评标基准价计算。`;

const sampleOutlineInput = {
  overview: '易标测试项目，软件服务类采购，预算 100 万元，实施地点北京市海淀区。',
  requirements: '技术方案完整性 30 分；项目实施计划 20 分；运维服务能力 15 分。',
};

function buildGlobalFactsMessages(): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `用户正在编写投标书中的技术方案。请根据招标文件、关键解析结果和技术方案目录，提前提取后续正文需要全文保持一致的关键变量。

要求：
1. 变量必须具体可复用，例如项目名称、周期、人员、响应时效、质保期、服务承诺。
2. 不要输出正文草稿、分析过程、来源说明或风险提示。
3. 只返回 JSON。`,
    },
    { role: 'user', content: `招标文件原文：\n${sampleTenderContent}` },
    {
      role: 'user',
      content: `关键解析结果：
## 项目信息
{"project_name":"易标测试项目","project_number":"YB-TEST-001","project_type":"软件服务","project_budget":"100 万元","project_address":"北京市海淀区"}

## 交货和服务要求
{"implementation_period":"90 日","after_sales_service":"7x24 小时运维响应"}`,
    },
    {
      role: 'user',
      content: `已生成技术方案目录：
- 1 项目理解与总体方案：说明项目背景、目标和总体技术路线
  - 1.1 项目需求理解：梳理采购需求和评分要求
  - 1.2 总体实施路径：说明实施阶段和交付安排`,
    },
    {
      role: 'user',
      content: `请返回 JSON，格式如下：
{
  "groups": [
    {
      "id": "project_basic",
      "title": "项目基础变量",
      "content": "- 项目名称：易标测试项目\\n- 项目编号：YB-TEST-001"
    }
  ]
}`,
    },
  ];
}

function buildBusinessBidMessages(): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是投标商务标专家，负责从招标文件中抽取商务响应矩阵。',
        '只返回 JSON，不要输出 Markdown、解释或前后缀。',
        'category 只能是 payment、bond、quote、contract、qualification、schedule、other。',
        'deviationType 只能是 none、positive、negative、pending；riskLevel 只能是 low、medium、high。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请基于下面招标文件 Markdown 抽取商务响应矩阵。',
        '输出 JSON：{"clauses":[{"category":"payment","originalText":"条款原文","responseText":"建议响应内容","deviationType":"pending","riskLevel":"medium","materialRequirement":"待补充材料","sourceHint":"章节线索"}]}',
        '',
        sampleBusinessTenderContent,
      ].join('\n'),
    },
  ];
}

function buildBidOpportunityMessages(): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是投标机会公告解析助手，只输出 JSON。',
        '从公告中抽取结构化字段，不要编造公告中没有的信息。',
        '字段必须使用 projectName,buyer,budget,region,industry,registrationDeadline,bidDeadline,qualification,scoringSummary。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请解析以下招标/采购公告，输出 JSON 对象：',
        sampleOpportunityNotice,
      ].join('\n'),
    },
  ];
}

function buildAiEvaluationMessages(): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是评标办法结构化抽取助手，只返回 JSON。',
        '从评分办法中抽取评分项、分值、评分类型和证据要求。',
        'itemType 只能是 qualification、business、technical、price、objective、subjective、other。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '请抽取以下评分办法，输出 JSON：{"items":[{"itemType":"technical","title":"评分项","maxScore":10,"scoringRule":"评分规则","evidenceRequirement":"投标文件证据要求"}]}',
        '',
        sampleEvaluationMethod,
      ].join('\n'),
    },
  ];
}

const scenarios: JsonLabScenario[] = [
  {
    id: 'outline',
    label: '目录生成 JSON',
    shortLabel: '目录生成',
    description: '复用技术方案目录生成 prompt，验证 outline schema、输入规模和 JSON 返回。',
    schemaName: 'outline',
    logTitle: '开发者 JSON 实验室-目录生成',
    temperature: 0.7,
    targetDescription: '技术方案目录 JSON',
    outputSchema: `{
  "outline": [
    {
      "id": "1",
      "title": "一级目录标题",
      "description": "一级目录说明",
      "children": [
        {
          "id": "1.1",
          "title": "二级目录标题",
          "description": "二级目录说明",
          "children": [
            { "id": "1.1.1", "title": "三级目录标题", "description": "三级目录说明" }
          ]
        }
      ]
    }
  ]
}`,
    buildMessages: () => buildOutlineMessages(sampleOutlineInput),
    invalidSample: '{"outline":[{"id":"1","title":"实施方案","description":"覆盖 1\\. 项目理解","children":[]}]}',
    issues: ['非法反斜杠转义：1\\. 应修复为 1. 或写成 \\\\.'],
  },
  {
    id: 'global-facts',
    label: '全局事实 JSON',
    shortLabel: '全局事实',
    description: '复现 Step04 全局事实变量生成的输入形态，检查 groups schema 和变量抽取边界。',
    schemaName: 'global-facts',
    logTitle: '开发者 JSON 实验室-全局事实',
    temperature: 0.2,
    targetDescription: '全局事实变量 JSON',
    outputSchema: `{
  "groups": [
    {
      "id": "project_basic",
      "title": "项目基础变量",
      "content": "- 项目名称：易标测试项目\\n- 项目编号：YB-TEST-001"
    }
  ]
}`,
    buildMessages: buildGlobalFactsMessages,
    invalidSample: '{"groups":[{"id":"project_basic","title":"项目基础变量","content":"- 项目名称：易标测试项目\\n- 响应时效：7x24 小时\\服务"}]}',
    issues: ['字符串中存在非法反斜杠转义：\\服。'],
  },
  {
    id: 'rejection-final',
    label: '废标项检查 JSON 定稿',
    shortLabel: '废标项检查',
    description: '复用废标项三轮链路的最终定稿 prompt，验证 findings schema 和电子文件检查边界。',
    schemaName: 'rejection-findings',
    logTitle: '开发者 JSON 实验室-废标项检查',
    temperature: 0.2,
    targetDescription: '废标项检查定稿 JSON',
    outputSchema: `{
  "findings": [
    {
      "type": "invalidBid",
      "severity": "high",
      "title": "风险标题",
      "summary": "一句话概括风险",
      "requirement": "对应检查依据",
      "bidEvidence": "投标文件中的明确证据",
      "riskReason": "风险原因",
      "suggestion": "处理建议"
    }
  ]
}`,
    buildMessages: () => buildRejectionCheckFinalMessages(
      {
        invalidBidAndRejectionItems: '- 未提供承诺函的，作无效投标处理。\n- 投标报价超过预算的，作无效投标处理。',
        customCheckItems: '重点关注承诺函和报价是否超过预算。',
        bidContent: sampleBidContent,
      },
      '承诺函可通过附件标题判断存在；报价超预算需要在报价表中有明确金额才判断。',
      '未发现报价金额；附件中已有承诺函线索，不应判定承诺函缺失。'
    ),
    invalidSample: '{"findings":[{"type":"invalidBid","severity":"high","title":"承诺函缺失","summary":"附件中没有看到承诺函扫描件","requirement":"未提供承诺函作无效投标","bidEvidence":"附件标题包含承诺函\\扫描件不可见","riskReason":"无法确认完整性","suggestion":"人工复核"}]}',
    issues: ['非法反斜杠转义：\\扫。', '该样本还包含应由最终定稿阶段剔除的弱证据判断。'],
  },
  {
    id: 'business-bid',
    label: '商务标条款 JSON',
    shortLabel: '商务标条款',
    description: '复现商务标 AI 结构化提取输入形态，验证 clauses schema、枚举字段和待补充材料边界。',
    schemaName: 'BusinessBidClauseExtraction',
    logTitle: '开发者 JSON 实验室-商务标条款',
    temperature: 0.2,
    targetDescription: '商务标条款 JSON',
    outputSchema: `{
  "clauses": [
    {
      "category": "payment",
      "originalText": "付款条款原文",
      "responseText": "建议响应内容",
      "deviationType": "pending",
      "riskLevel": "medium",
      "materialRequirement": "待补充材料",
      "sourceHint": "章节线索"
    }
  ]
}`,
    buildMessages: buildBusinessBidMessages,
    invalidSample: '{"clauses":[{"category":"payment","originalText":"付款方式：验收后付款","responseText":"响应付款\\条款","deviationType":"pending","riskLevel":"medium","materialRequirement":"补充发票","sourceHint":"商务条款"}]}',
    issues: ['非法反斜杠转义：\\条。', '需要确认 category、deviationType、riskLevel 是否为允许枚举。'],
  },
  {
    id: 'bid-opportunity',
    label: '投标机会公告 JSON',
    shortLabel: '投标机会',
    description: '复现投标机会 AI 公告解析输入形态，验证公告字段 schema 和空字段返回规则。',
    schemaName: 'BidOpportunityAnnouncementParsing',
    logTitle: '开发者 JSON 实验室-投标机会',
    temperature: 0.2,
    targetDescription: '投标机会公告字段 JSON',
    outputSchema: `{
  "projectName": "项目名称",
  "buyer": "采购人/招标人",
  "budget": "预算金额/最高限价",
  "region": "项目地区/实施地点",
  "industry": "行业/采购品目",
  "registrationDeadline": "报名或获取文件截止时间",
  "bidDeadline": "投标截止/开标时间",
  "qualification": "资格要求摘要",
  "scoringSummary": "评分办法/评审标准摘要"
}`,
    buildMessages: buildBidOpportunityMessages,
    invalidSample: '{"projectName":"智慧园区综合运维平台","buyer":"产业园管理委员会","budget":"3200万元","region":"广东深圳","industry":"信息化","registrationDeadline":"","bidDeadline":"2026\\年08月08日","qualification":"类似业绩","scoringSummary":"技术 50 分"}',
    issues: ['非法反斜杠转义：\\年。', '无法识别字段应返回空字符串，不应编造报名截止时间。'],
  },
  {
    id: 'ai-evaluation',
    label: 'AI 评标评分项 JSON',
    shortLabel: 'AI 评标',
    description: '复现 AI 评标评分项结构化抽取输入形态，验证 items schema、分值和证据要求。',
    schemaName: 'AiEvaluationItemExtraction',
    logTitle: '开发者 JSON 实验室-AI评标评分项',
    temperature: 0.2,
    targetDescription: 'AI 评标评分项 JSON',
    outputSchema: `{
  "items": [
    {
      "itemType": "technical",
      "title": "评分项名称",
      "maxScore": 10,
      "scoringRule": "评分规则",
      "evidenceRequirement": "证据要求"
    }
  ]
}`,
    buildMessages: buildAiEvaluationMessages,
    invalidSample: '{"items":[{"itemType":"technical","title":"总体方案","maxScore":"20分","scoringRule":"方案完整\\清晰得满分","evidenceRequirement":"技术方案章节"}]}',
    issues: ['非法反斜杠转义：\\清。', 'maxScore 应归一化为数字而不是带单位字符串。'],
  },
];

function getScenario(id: LabScenarioId) {
  return scenarios.find((item) => item.id === id) || scenarios[0];
}

function formatMessages(messages: ChatMessage[]) {
  return messages.map((message, index) => ({
    index: index + 1,
    role: message.role,
    chars: message.content.length,
    preview: message.content,
  }));
}

function tryFormatJson(value: unknown) {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  return JSON.stringify(value, null, 2);
}

function DeveloperTestPage() {
  const [selectedId, setSelectedId] = useState<LabScenarioId>('outline');
  const [runningMode, setRunningMode] = useState<RunningMode>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [rawResult, setRawResult] = useState('');
  const [repairResult, setRepairResult] = useState('');
  const [savedSamples, setSavedSamples] = useState<JsonFailureSample[]>([]);
  const [replayLogs, setReplayLogs] = useState<JsonReplayLog[]>([]);

  const scenario = getScenario(selectedId);
  const messages = useMemo(() => scenario.buildMessages(), [scenario]);
  const formattedMessages = useMemo(() => formatMessages(messages), [messages]);
  const totalChars = formattedMessages.reduce((sum, item) => sum + item.chars, 0);

  const appendEvent = (message: string) => {
    setEvents((prev) => [...prev, `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`]);
  };

  const loadSavedSamples = async () => {
    try {
      const result = await window.yibiao?.ai.listJsonFailureSamples();
      setSavedSamples(result?.samples || []);
    } catch {
      setSavedSamples([]);
    }
  };

  const loadReplayLogs = async () => {
    try {
      const result = await window.yibiao?.ai.listJsonReplayLogs();
      setReplayLogs(result?.logs || []);
    } catch {
      setReplayLogs([]);
    }
  };

  useEffect(() => {
    void loadSavedSamples();
    void loadReplayLogs();
  }, []);

  const resetRunOutput = () => {
    setEvents([]);
    setRawResult('');
    setRepairResult('');
  };

  const selectScenario = (id: LabScenarioId) => {
    setSelectedId(id);
    setRawResult('');
    setRepairResult('');
    setEvents([]);
  };

  const createFailureSampleInput = (error: unknown): JsonFailureSampleInput => ({
    scenario_id: scenario.id,
    scenario_label: scenario.label,
    schema_name: scenario.schemaName,
    target_description: scenario.targetDescription,
    invalid_content: scenario.invalidSample,
    issues: scenario.issues,
    error_message: error instanceof Error ? error.message : String(error || 'AI JSON 请求失败'),
  });

  const saveCurrentFailureSample = async (error: unknown) => {
    try {
      const result = await window.yibiao?.ai.saveJsonFailureSample(createFailureSampleInput(error));
      setSavedSamples(result?.samples || []);
      appendEvent('失败样本已保存，可在本页下方回放。');
    } catch (saveError) {
      appendEvent(`失败样本保存失败：${saveError instanceof Error ? saveError.message : '无法写入本地诊断文件'}`);
    }
  };

  const runJsonRequest = async () => {
    resetRunOutput();
    setRunningMode('request');
    appendEvent(`调用 aiClient.requestJson：${scenario.label}。`);

    try {
      const payload = await aiClient.requestJson({
        messages,
        temperature: scenario.temperature,
        schemaName: scenario.schemaName,
        logTitle: scenario.logTitle,
        progressLabel: scenario.shortLabel,
        failureMessage: `${scenario.shortLabel}返回的 JSON 格式无效`,
      });
      setRawResult(tryFormatJson(payload));
      appendEvent('JSON 请求完成。');
    } catch (error) {
      appendEvent(`JSON 请求错误：${error instanceof Error ? error.message : 'AI JSON 请求失败'}`);
      await saveCurrentFailureSample(error);
    } finally {
      setRunningMode(null);
    }
  };

  const runRepairReplay = async (sample?: JsonFailureSample) => {
    setRepairResult('');
    setRunningMode('repair');
    const replaySample = sample || {
      invalid_content: scenario.invalidSample,
      issues: scenario.issues,
      target_description: scenario.targetDescription,
      schema_name: scenario.schemaName,
      scenario_label: scenario.label,
    };
    appendEvent(`回放 JSON 修复样本：${sample?.scenario_label || scenario.label}。`);

    try {
      const payload = await aiClient.requestJson({
        messages: buildJsonRepairMessages({
          invalidContent: replaySample.invalid_content,
          issues: replaySample.issues,
          targetDescription: replaySample.target_description,
        }),
        temperature: 0,
        schemaName: `${replaySample.schema_name}-repair`,
        logTitle: `开发者 JSON 修复-${sample?.scenario_label || scenario.shortLabel}`,
        progressLabel: `${sample?.scenario_label || scenario.shortLabel}修复`,
        failureMessage: `${sample?.scenario_label || scenario.shortLabel}修复结果仍不是有效 JSON`,
      });
      setRepairResult(tryFormatJson(payload));
      appendEvent('JSON 修复回放完成。');
    } catch (error) {
      appendEvent(`JSON 修复错误：${error instanceof Error ? error.message : 'AI JSON 修复失败'}`);
      if (!sample) await saveCurrentFailureSample(error);
    } finally {
      setRunningMode(null);
    }
  };

  const createReplayLogSample = (log: JsonReplayLog): JsonFailureSample => ({
    id: log.id,
    created_at: log.created_at,
    scenario_id: scenario.id,
    scenario_label: scenario.label,
    schema_name: scenario.schemaName,
    target_description: scenario.targetDescription,
    invalid_content: log.invalid_content,
    issues: log.issues,
    error_message: log.error_message || `来自开发者日志：${log.log_title}`,
  });

  const saveReplayLogAsSample = async (log: JsonReplayLog) => {
    try {
      const sample = createReplayLogSample(log);
      const result = await window.yibiao?.ai.saveJsonFailureSample(sample);
      setSavedSamples(result?.samples || []);
      appendEvent(`开发者日志已保存为失败样本：${log.log_title}。`);
    } catch (error) {
      appendEvent(`开发者日志保存失败：${error instanceof Error ? error.message : '无法写入本地诊断文件'}`);
    }
  };

  const clearSavedSamples = async () => {
    try {
      const result = await window.yibiao?.ai.clearJsonFailureSamples();
      setSavedSamples(result?.samples || []);
      appendEvent('已清空保存的失败样本。');
    } catch (error) {
      appendEvent(`清空失败样本失败：${error instanceof Error ? error.message : '无法清空本地诊断文件'}`);
    }
  };

  const running = runningMode !== null;

  return (
    <div className="page-stack developer-test-page">
      <section className="panel developer-test-hero">
        <div className="hero-copy">
          <span className="eyebrow">JSON Request Lab</span>
          <h2>Json请求测试</h2>
          <p>
            这里复用项目真实 Prompt 构造和 AI JSON bridge，集中验证目录生成、全局事实、废标项检查、商务标、投标机会和 AI 评标的 JSON 输出和修复回放。
          </p>
          <div className="developer-test-actions" role="tablist" aria-label="JSON 请求场景">
            {scenarios.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === selectedId}
                className={item.id === selectedId ? 'primary-action' : 'secondary-action'}
                onClick={() => selectScenario(item.id)}
                disabled={running}
              >
                {item.shortLabel}
              </button>
            ))}
          </div>
          <div className="developer-test-actions">
            <button type="button" className="primary-action" onClick={runJsonRequest} disabled={running}>
              {runningMode === 'request' ? 'JSON 请求中...' : '运行 JSON 请求'}
            </button>
            <button type="button" className="secondary-action" onClick={() => void runRepairReplay()} disabled={running}>
              {runningMode === 'repair' ? '修复回放中...' : '回放修复样本'}
            </button>
          </div>
        </div>
      </section>

      <div className="developer-test-grid">
        <section className="panel developer-test-panel">
          <div className="settings-section-title">
            <span />
            <strong>请求场景</strong>
          </div>
          <pre>{JSON.stringify({
            id: scenario.id,
            label: scenario.label,
            schemaName: scenario.schemaName,
            temperature: scenario.temperature,
            messageCount: formattedMessages.length,
            totalChars,
            description: scenario.description,
          }, null, 2)}</pre>
        </section>

        <section className="panel developer-test-panel">
          <div className="settings-section-title">
            <span />
            <strong>输出 Schema</strong>
          </div>
          <pre>{scenario.outputSchema}</pre>
        </section>

        <section className="panel developer-test-panel is-wide">
          <div className="settings-section-title">
            <span />
            <strong>变量注入后的消息</strong>
          </div>
          <pre>{JSON.stringify(formattedMessages, null, 2)}</pre>
        </section>

        <section className="panel developer-test-panel">
          <div className="settings-section-title">
            <span />
            <strong>失败样本</strong>
          </div>
          <pre>{scenario.invalidSample}</pre>
        </section>

        <section className="panel developer-test-panel">
          <div className="settings-section-title">
            <span />
            <strong>校验问题</strong>
          </div>
          <pre>{scenario.issues.map((item, index) => `${index + 1}. ${item}`).join('\n')}</pre>
        </section>

        <section className="panel developer-test-panel is-wide">
          <div className="settings-section-title">
            <span />
            <strong>已保存失败样本</strong>
          </div>
          <div className="developer-saved-samples">
            {savedSamples.length ? (
              <>
                <div className="developer-test-actions">
                  <button type="button" className="secondary-action" onClick={() => void clearSavedSamples()} disabled={running}>清空保存样本</button>
                </div>
                {savedSamples.map((sample) => (
                  <article key={sample.id}>
                    <strong>{sample.scenario_label}</strong>
                    <span>{sample.schema_name} · {new Date(sample.created_at).toLocaleString('zh-CN', { hour12: false })}</span>
                    {sample.error_message ? <p>{sample.error_message}</p> : null}
                    <button type="button" className="secondary-action" onClick={() => void runRepairReplay(sample)} disabled={running}>
                      回放保存样本
                    </button>
                  </article>
                ))}
              </>
            ) : (
              <p>暂无保存的失败样本。运行 JSON 请求或修复回放失败后会自动保存可回放样本。</p>
            )}
          </div>
        </section>

        <section className="panel developer-test-panel is-wide">
          <div className="settings-section-title">
            <span />
            <strong>开发者日志回放</strong>
          </div>
          <div className="developer-saved-samples">
            {replayLogs.length ? (
              replayLogs.map((log) => (
                <article key={log.id}>
                  <strong>{log.log_title}</strong>
                  <span>{log.type} · {new Date(log.created_at).toLocaleString('zh-CN', { hour12: false })}</span>
                  {log.error_message ? <p>{log.error_message}</p> : <p>{log.content_preview}</p>}
                  <div className="developer-test-actions">
                    <button type="button" className="secondary-action" onClick={() => void runRepairReplay(createReplayLogSample(log))} disabled={running}>
                      回放日志内容
                    </button>
                    <button type="button" className="secondary-action" onClick={() => void saveReplayLogAsSample(log)} disabled={running}>
                      保存为失败样本
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p>暂无可回放的 JSON 开发者日志。开启开发者模式并运行 JSON 请求后会出现在这里。</p>
            )}
          </div>
        </section>

        <section className="panel developer-test-panel is-wide">
          <div className="settings-section-title">
            <span />
            <strong>事件日志</strong>
          </div>
          <pre>{events.length ? events.join('\n') : '尚未开始请求。'}</pre>
        </section>

        <section className="panel developer-test-panel is-wide">
          <div className="settings-section-title">
            <span />
            <strong>JSON 返回</strong>
          </div>
          <pre>{rawResult || '暂无内容。'}</pre>
        </section>

        <section className="panel developer-test-panel is-wide">
          <div className="settings-section-title">
            <span />
            <strong>修复结果</strong>
          </div>
          <pre>{repairResult || '暂无修复回放结果。'}</pre>
        </section>
      </div>
    </div>
  );
}

export default DeveloperTestPage;
