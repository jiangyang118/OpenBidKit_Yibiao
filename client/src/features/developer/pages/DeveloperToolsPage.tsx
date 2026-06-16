import { useEffect, useMemo, useState } from 'react';
import { buildInvalidBidAndRejectionItemsPrompt, buildOutlineMessages, buildRejectionCheckFinalMessages, buildRequirementGroupsMessages } from '../../../shared/prompts';
import type { ChatMessage, OutlineItem } from '../../../shared/types';
import type { DeveloperParserCapabilityReport, DeveloperParserProvider, DeveloperParserSampleResult, WordExportPreviewResult } from '../../../shared/types/ipc';
import type { SectionId } from '../../../shared/types/navigation';
import { getBidAnalysisTasks } from '../../technical-plan/services/bidAnalysisWorkflow';
import type { TechnicalPlanState } from '../../technical-plan/types';

type DeveloperToolsSectionId = 'developer-prompt-lab' | 'developer-parser-sandbox' | 'developer-export-preview';

interface DeveloperToolsPageProps {
  sectionId: DeveloperToolsSectionId;
}

export function isDeveloperToolsSection(sectionId: SectionId): sectionId is DeveloperToolsSectionId {
  return sectionId === 'developer-prompt-lab' || sectionId === 'developer-parser-sandbox' || sectionId === 'developer-export-preview';
}

const sampleTenderContent = `# 易标测试项目招标文件

项目名称：易标测试项目。
项目预算：100 万元。
项目地点：北京市海淀区。

技术评分要求：
1. 技术方案完整性，满分 30 分，要求章节完整、实施路径清晰。
2. 项目实施计划，满分 20 分，要求进度安排合理、风险控制明确。
3. 运维服务能力，满分 15 分，要求说明响应时效和服务保障。

无效投标：
- 未按招标文件要求提供资格证明材料的，投标无效。
- 报价超过最高限价的，投标无效。`;

const sampleBidContent = `# 易标测试项目投标文件

## 技术方案
本项目采用分阶段实施，覆盖需求调研、系统部署、联调测试、培训和运维服务。

## 资格证明
已提供营业执照、相关资质证书和类似项目业绩。`;

const sampleOriginalPlanContent = `# 原技术方案

本项目拟采用“需求调研、系统部署、联调测试、试运行、验收交付”的五阶段实施路线。
项目经理为张伟，售后服务响应时间为 2 小时内响应、24 小时内到场。`;

const sampleOutline: OutlineItem[] = [
  {
    id: '1',
    title: '项目实施方案',
    description: '说明实施组织、阶段计划、质量控制和交付成果。',
    children: [
      {
        id: '1.1',
        title: '实施组织与职责',
        description: '明确项目团队、负责人和协作机制。',
        children: [
          {
            id: '1.1.1',
            title: '项目团队配置',
            description: '列明项目经理、技术负责人和实施人员安排。',
          },
        ],
      },
    ],
  },
];

const sampleChapter = {
  id: '1.1.1',
  title: '项目团队配置',
  description: '列明项目经理、技术负责人和实施人员安排。',
};

function formatPromptOutline(items: OutlineItem[] = [], level = 1, lines: string[] = []) {
  for (const item of items) {
    lines.push(`${'  '.repeat(Math.max(0, level - 1))}- ${item.id} ${item.title}${item.description ? `：${item.description}` : ''}`);
    if (item.children?.length) formatPromptOutline(item.children, level + 1, lines);
  }
  return lines.join('\n');
}

const promptLabChains = [
  {
    id: 'bid-analysis-project-info',
    label: '招标解析 - 项目信息 JSON',
    description: '复用技术方案 Step02 招标解析任务定义，展示真实任务 prompt 和 JSON 输出约束。',
    buildMessages: (): ChatMessage[] => {
      const task = getBidAnalysisTasks('full').find((item) => item.id === 'projectInfo');
      return [
        {
          role: 'system',
          content: '你是专业的招标文件分析助手。请严格基于用户提供的招标文件原文完成提取和总结。只输出最终结果，始终使用简体中文。',
        },
        { role: 'user', content: `以下是完整招标文件 Markdown 原文：\n\n${sampleTenderContent}` },
        { role: 'user', content: task?.buildTaskPrompt() || '未找到项目信息解析任务。' },
      ];
    },
    schema: '{"project_name":"","project_number":"","project_type":"","project_budget":"","project_address":""}',
    responseFormat: 'json_object',
  },
  {
    id: 'outline-generation',
    label: '目录生成 - 完整三级目录',
    description: '复用 shared/prompts/outlinePrompts.ts 的目录生成 prompt，展示变量注入后的完整消息。',
    buildMessages: (): ChatMessage[] => buildOutlineMessages({
      overview: '易标测试项目，软件服务类采购，预算 100 万元，实施地点北京市海淀区。',
      requirements: '技术方案完整性 30 分；项目实施计划 20 分；运维服务能力 15 分。',
      suggestions: ['一级目录覆盖评分大类', '二三级目录不要直接堆评分原文'],
    }),
    schema: '{"outline":[{"id":"1","title":"","description":"","children":[{"id":"1.1","title":"","description":"","children":[{"id":"1.1.1","title":"","description":""}]}]}]}',
    responseFormat: 'json_object',
  },
  {
    id: 'requirement-groups',
    label: '评分大类提取',
    description: '复用对齐目录模式的评分大类提取 prompt，用于检查一级目录和评分项对齐质量。',
    buildMessages: (): ChatMessage[] => buildRequirementGroupsMessages('技术方案完整性 30 分；项目实施计划 20 分；运维服务能力 15 分。'),
    schema: '{"groups":[{"requirement_id":"R1","title":"","description":"","detail_points":[""]}]}',
    responseFormat: 'json_object',
  },
  {
    id: 'rejection-extraction',
    label: '废标项提取',
    description: '复用废标项检查的招标文件提取 prompt，观察无效投标和废标项边界。',
    buildMessages: (): ChatMessage[] => [
      { role: 'user', content: `招标文件原文：\n\n${sampleTenderContent}` },
      { role: 'user', content: buildInvalidBidAndRejectionItemsPrompt() },
    ],
    schema: 'Markdown: 原文中明确提到的 / 此类标书还可能涉及的',
    responseFormat: 'markdown',
  },
  {
    id: 'rejection-final',
    label: '废标项检查 - JSON 定稿',
    description: '复用废标项第三轮定稿 prompt，展示投标文件证据、风险条目和 JSON 输出约束。',
    buildMessages: (): ChatMessage[] => buildRejectionCheckFinalMessages(
      {
        invalidBidAndRejectionItems: '## 无效投标\n- 未按招标文件要求提供资格证明材料的，投标无效。',
        bidContent: sampleBidContent,
      },
      '资格材料可通过电子文件正文判断，签章密封不纳入电子文件检查。',
      '初步发现：资格证明章节存在，但证书有效期需要人工复核。',
    ),
    schema: '{"findings":[{"type":"invalidBid","severity":"high","title":"","summary":"","requirement":"","bidEvidence":"","riskReason":"","suggestion":""}]}',
    responseFormat: 'json_object',
  },
  {
    id: 'global-facts',
    label: '全局事实预设',
    description: '对齐 Main 侧 globalFactsTask 第一轮变量预设，用于观察全文一致性事实变量如何进入正文生成。',
    buildMessages: (): ChatMessage[] => [
      {
        role: 'system',
        content: `用户正在编写投标书中的技术方案。在编写正文前，需要根据招标文件、Step02 解析结果、目录和知识库，提前提取全文需要保持一致的关键变量。

要求：
1. 只返回有价值的变量组。
2. 必须覆盖工期、运维期或交货时间中的至少一类。
3. 优先输出具体变量，例如项目经理、响应时间、质保期、设备型号等。
4. 不要输出长段落、分析过程、来源说明、风险提示或正文草稿。
5. 只返回 JSON。`,
      },
      { role: 'user', content: `招标文件原文：\n${sampleTenderContent}` },
      { role: 'user', content: '关键解析结果：\n## 项目信息\n项目名称：易标测试项目\n预算：100 万元\n## 交货和服务要求\n服务期：一年，需提供本地化运维支持。' },
      { role: 'user', content: `已生成技术方案目录：\n${formatPromptOutline(sampleOutline)}` },
      { role: 'user', content: '用户选中的知识库完整条目：\n[{"title":"类似项目售后承诺","resume":"响应时效与服务团队配置","content":"2 小时内响应，24 小时内到场，设置项目经理负责总体协调。"}]' },
      {
        role: 'user',
        content: `请返回 JSON，格式如下：
{
  "groups": [
    { "id": "service_period", "title": "服务期限与响应", "content": "- 服务期：一年\\n- 响应时间：2 小时内响应" }
  ]
}`,
      },
    ],
    schema: '{"groups":[{"id":"","title":"","content":""}]}',
    responseFormat: 'json_object',
  },
  {
    id: 'content-planning',
    label: '正文编排 - 章节计划 JSON',
    description: '对齐 Main 侧 contentGenerationTask 的章节编排决策，观察表格、配图、知识库和全局事实选择。',
    buildMessages: (): ChatMessage[] => [
      {
        role: 'system',
        content: `你是投标技术方案正文编排助手。你只负责为单个叶子小节决定正文写作策略，不直接生成正文。

要求：
1. 只返回 JSON，不要输出解释、总结或 Markdown。
2. outline 必须说明本章节正文的写作重点。
3. table.needed 表示本小节是否适合输出 Markdown 表格。
4. image.needed 表示本小节是否适合进入 AI 生图候选池。
5. mermaid.needed 表示本小节是否适合进入 Mermaid 图表候选池。
6. knowledge.item_ids 只能从本小节已筛选的参考知识库条目 id 中选择。
7. facts.titles 只能从全局事实变量标题清单中选择。`,
      },
      { role: 'user', content: '项目概述信息：\n易标测试项目，软件服务类采购，预算 100 万元。' },
      { role: 'user', content: 'Step02 关键解析结果：\n## 项目信息\n实施地点：北京市海淀区\n## 交货和服务要求\n服务期一年，需提供运维保障。' },
      { role: 'user', content: 'Step04 全局事实变量标题清单：\n["项目团队","服务期限与响应"]' },
      { role: 'user', content: '本小节已筛选的参考知识库轻量条目：\n[{"id":"kb-1","title":"项目组织模板","resume":"团队职责和响应机制","relevance_reason":"与项目团队配置直接相关"}]' },
      { role: 'user', content: `请为以下章节返回正文编排 JSON：\n编号：${sampleChapter.id}\n标题：${sampleChapter.title}\n描述：${sampleChapter.description}\n\nJSON 格式：\n{"outline":[],"table":{"needed":false,"purpose":""},"image":{"needed":false,"title":"","prompt":"","style":"engineering_diagram"},"mermaid":{"needed":false,"title":"","prompt":""},"knowledge":{"item_ids":[]},"facts":{"titles":[]}}` },
    ],
    schema: '{"outline":[""],"table":{"needed":false,"purpose":""},"image":{"needed":false,"title":"","prompt":"","style":""},"mermaid":{"needed":false,"title":"","prompt":""},"knowledge":{"item_ids":[]},"facts":{"titles":[]}}',
    responseFormat: 'json_object',
  },
  {
    id: 'content-generation',
    label: '正文生成 - 单章节 Markdown',
    description: '对齐 Main 侧 contentGenerationTask 的单章节正文生成链路，检查选中事实、知识素材和编排决策注入。',
    buildMessages: (): ChatMessage[] => [
      {
        role: 'system',
        content: `你是专业的投标技术方案写作助手。请根据章节说明、项目概述、全局事实和参考素材，编写当前叶子小节正文。

要求：
1. 只输出当前章节正文，不输出标题。
2. 使用专业、稳健、可交付的投标文件表达。
3. 涉及事实变量时优先使用用户提供的全局事实。
4. 不要编造招标文件未要求的承诺。
5. 严禁输出 Mermaid、PlantUML、Graphviz 或图片 Markdown；配图由系统另行处理。`,
      },
      { role: 'user', content: '项目概述信息：\n易标测试项目，软件服务类采购，预算 100 万元。' },
      { role: 'user', content: '本章节需要使用的全局事实变量：\n## 项目团队\n项目经理：张伟，负责总体协调。\n## 服务期限与响应\n2 小时内响应，24 小时内到场。' },
      { role: 'user', content: '参考正文素材：\n[{"title":"项目组织模板","content":"项目经理负责计划、资源和质量协调，技术负责人负责方案落地和交付验收。"}]' },
      { role: 'user', content: '正文编排决策：\n写作重点：团队职责、沟通机制、服务响应。\n表格：不需要。\n配图：不需要。\n知识库：使用 kb-1。\n全局事实：项目团队、服务期限与响应。' },
      { role: 'user', content: `当前章节：\n编号：${sampleChapter.id}\n标题：${sampleChapter.title}\n描述：${sampleChapter.description}\n\n直接返回编写的正文内容，不要输出标题、Markdown 标题、解释、总结等任何其他内容。` },
    ],
    schema: 'Markdown 正文，不包含章节标题，不包含 Mermaid 或图片 Markdown。',
    responseFormat: 'markdown',
  },
  {
    id: 'original-plan-restore',
    label: '原方案还原 - 段落归属 JSON',
    description: '对齐已有方案扩写模式的原方案段落还原链路，观察原文段如何映射到目标章节。',
    buildMessages: (): ChatMessage[] => [
      {
        role: 'system',
        content: `你是严格的原方案段落归属分析助手。请把原方案中的可复用段落映射到当前技术方案目录的叶子章节。

要求：
1. 只返回 JSON，不要输出解释、总结或 Markdown。
2. 每个原方案段落只能绑定到最相关的叶子章节。
3. 不要生成正文，只输出段落归属、保留理由和置信度。
4. 如果段落无法可靠归属，放入 unassigned_items。`,
      },
      { role: 'user', content: '项目概述信息：\n易标测试项目，软件服务类采购，预算 100 万元。' },
      { role: 'user', content: `当前可还原叶子节点：\n${sampleChapter.id} ${sampleChapter.title}：${sampleChapter.description}` },
      { role: 'user', content: `原方案段落：\n${sampleOriginalPlanContent}` },
      { role: 'user', content: '请只返回 JSON，不要生成正文。' },
    ],
    schema: '{"bindings":[{"section_id":"","segment_indexes":[],"reason":"","confidence":0.9}],"unassigned_items":[{"segment_index":0,"reason":""}]}',
    responseFormat: 'json_object',
  },
  {
    id: 'duplicate-check-content',
    label: '查重 - 正文重复规则观察',
    description: '查重当前是确定性规则链路，本项展示正文重复句归一化、忽略规则和报告输出口径，便于调试规则输入。',
    buildMessages: (): ChatMessage[] => [
      {
        role: 'system',
        content: `标书查重正文链路是本地确定性分析，不调用文本模型。Prompt Lab 在这里展示进入规则链路的等价观察包：
1. 按句切分投标文件正文。
2. 对句子做 NFKC、空白、不可见字符和标点归一化。
3. 过滤招标引用句、固定模板句和用户忽略规则命中的句子。
4. 在不同投标文件之间聚合 normalized 文本相同或高度相近的正文句。
5. 报告只输出未忽略或已确认需要处理的重复项。`,
      },
      { role: 'user', content: `投标文件 A：\n${sampleBidContent}` },
      { role: 'user', content: '投标文件 B：\n## 技术方案\n本项目采用分阶段实施，覆盖需求调研、系统部署、联调测试、培训和运维服务。\n\n## 服务承诺\n提供 2 小时响应服务。' },
      { role: 'user', content: '正文忽略规则：\n[{"category":"固定模板","text":"严格按照招标文件要求执行"}]' },
      { role: 'user', content: '输出观察字段：normalized_text、source_files、status、ignore_rule_category、report_visible。' },
    ],
    schema: '{"duplicate_sentences":[{"normalized_text":"","source_files":[],"status":"pending","ignore_rule_category":"","report_visible":true}]}',
    responseFormat: 'deterministic_report',
  },
];

function countChars(messages: ChatMessage[]) {
  return messages.reduce((sum, item) => sum + item.content.length, 0);
}

function buildDebugPackage(chain: typeof promptLabChains[number], messages: ChatMessage[]) {
  return {
    chainId: chain.id,
    chainLabel: chain.label,
    responseFormat: chain.responseFormat,
    schema: chain.schema,
    messageCount: messages.length,
    charCount: countChars(messages),
    messages,
    redaction: {
      apiKey: 'not included',
      baseUrl: 'not included',
      localPath: 'not included',
      fileName: 'sample only',
    },
  };
}

function PromptLabPage() {
  const [activeChainId, setActiveChainId] = useState(promptLabChains[0].id);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('不包含 API Key、Base URL、本地路径或真实文件名。');
  const activeChain = promptLabChains.find((item) => item.id === activeChainId) || promptLabChains[0];
  const messages = useMemo(() => activeChain.buildMessages(), [activeChain]);
  const debugPackage = useMemo(() => buildDebugPackage(activeChain, messages), [activeChain, messages]);

  const copyDebugPackage = async () => {
    setCopied(false);
    await navigator.clipboard?.writeText(JSON.stringify(debugPackage, null, 2));
    setCopied(true);
  };

  const saveDebugRecord = async () => {
    setSaving(true);
    setSaveMessage('正在保存调试记录...');
    try {
      const result = await window.yibiao?.ai.savePromptDebugRecord(debugPackage);
      if (!result?.success) {
        throw new Error(result?.message || '保存失败');
      }
      setSaveMessage(result.filePath ? `已保存到 ${result.filePath}` : '已保存到开发者日志');
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : '保存调试记录失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="developer-secondary-tools-page prompt-lab-page">
      <section className="panel developer-secondary-hero prompt-lab-hero">
        <div>
          <span className="section-kicker">Prompt Lab</span>
          <h2>Prompt调试台</h2>
          <p>选择真实业务链路，查看 Prompt 版本、变量注入结果、输出格式、字符规模和可复制的脱敏调试包。</p>
        </div>
        <div className="developer-secondary-accent-card">
          <span>当前链路</span>
          <strong>{activeChain.label}</strong>
          <small>{activeChain.description}</small>
        </div>
      </section>

      <div className="prompt-lab-layout">
        <aside className="panel prompt-lab-chain-panel">
          <div className="settings-section-title">
            <span />
            <strong>业务链路</strong>
          </div>
          <div className="prompt-lab-chain-list">
            {promptLabChains.map((chain) => (
              <button
                type="button"
                className={chain.id === activeChain.id ? 'is-active' : ''}
                key={chain.id}
                onClick={() => {
                  setActiveChainId(chain.id);
                  setCopied(false);
                  setSaveMessage('不包含 API Key、Base URL、本地路径或真实文件名。');
                }}
              >
                <strong>{chain.label}</strong>
                <span>{chain.description}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel prompt-lab-inspector">
          <div className="settings-section-title">
            <span />
            <strong>调试摘要</strong>
          </div>
          <div className="prompt-lab-metrics">
            <article>
              <span>消息数</span>
              <strong>{messages.length}</strong>
            </article>
            <article>
              <span>字符数</span>
              <strong>{countChars(messages)}</strong>
            </article>
            <article>
              <span>输出格式</span>
              <strong>{activeChain.responseFormat}</strong>
            </article>
          </div>

          <div className="prompt-lab-debug-actions">
            <button type="button" className="secondary-action" onClick={() => { void copyDebugPackage(); }}>
              复制脱敏调试包
            </button>
            <button type="button" className="secondary-action" onClick={() => { void saveDebugRecord(); }} disabled={saving || !window.yibiao?.ai.savePromptDebugRecord}>
              {saving ? '保存中...' : '保存到开发者日志'}
            </button>
            <span>{copied ? '已复制；' : ''}{saveMessage}</span>
          </div>

          <div className="prompt-lab-schema">
            <strong>输出约束</strong>
            <pre>{activeChain.schema}</pre>
          </div>
        </section>

        <section className="panel prompt-lab-message-panel">
          <div className="settings-section-title">
            <span />
            <strong>变量注入后的消息</strong>
          </div>
          <div className="prompt-lab-message-list">
            {messages.map((message, index) => (
              <article key={`${message.role}-${index}`}>
                <div>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{message.role}</strong>
                  <small>{message.content.length} 字符</small>
                </div>
                <pre>{message.content}</pre>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

interface ExportPreviewIssue {
  level: 'info' | 'warning' | 'error';
  title: string;
  detail: string;
  location: string;
}

interface ExportPreviewReport {
  chapterCount: number;
  emptyChapterCount: number;
  mermaidCount: number;
  imageCount: number;
  tableCount: number;
  wordCount: number;
  issues: ExportPreviewIssue[];
}

function flattenOutlineItems(items: OutlineItem[] = [], parentPath = ''): Array<OutlineItem & { path: string }> {
  return items.flatMap((item, index) => {
    const label = item.id || String(index + 1);
    const path = parentPath ? `${parentPath}.${label}` : label;
    return [{ ...item, path }, ...flattenOutlineItems(item.children || [], path)];
  });
}

function countMatches(content: string, pattern: RegExp) {
  return [...content.matchAll(pattern)].length;
}

function analyzeExportPreview(state?: TechnicalPlanState | null): ExportPreviewReport {
  const nodes = flattenOutlineItems(state?.outlineData?.outline || []);
  const issues: ExportPreviewIssue[] = [];
  let mermaidCount = 0;
  let imageCount = 0;
  let tableCount = 0;
  let wordCount = 0;

  if (!nodes.length) {
    issues.push({
      level: 'warning',
      title: '暂无目录',
      detail: '技术方案还没有可预演的目录树，导出链路无法检查正文块。',
      location: '技术方案 / 目录生成',
    });
  }

  for (const node of nodes) {
    const content = String(node.content || '').trim();
    if (!content) {
      issues.push({
        level: 'warning',
        title: '空章节',
        detail: '该章节没有正文内容，导出后会形成空标题或空段落。',
        location: `${node.path} ${node.title}`,
      });
      continue;
    }

    wordCount += content.replace(/\s+/g, '').length;
    mermaidCount += countMatches(content, /```mermaid[\s\S]*?```/g);
    imageCount += countMatches(content, /!\[[^\]]*]\([^)]+\)/g);
    tableCount += countMatches(content, /^\|.+\|$/gm) > 1 ? 1 : 0;

    const imageRefs = [...content.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)].map((match) => match[1]);
    for (const ref of imageRefs) {
      if (!ref.trim()) {
        issues.push({
          level: 'error',
          title: '图片引用为空',
          detail: 'Markdown 图片语法没有路径，Word 导出会缺图。',
          location: `${node.path} ${node.title}`,
        });
      } else if (!/^https?:\/\//i.test(ref) && !/^data:image\//i.test(ref)) {
        issues.push({
          level: 'info',
          title: '本地图片需 Main 转换',
          detail: `图片引用为 ${ref}，导出时需要 Main 侧解析本地路径或工作区资源。`,
          location: `${node.path} ${node.title}`,
        });
      }
    }

    if (/```mermaid[\s\S]*?```/.test(content) && !content.includes('graph') && !content.includes('flowchart') && !content.includes('sequenceDiagram')) {
      issues.push({
        level: 'warning',
        title: 'Mermaid 类型不明确',
        detail: '检测到 Mermaid 代码块，但没有常见图表类型关键字，导出转图可能失败。',
        location: `${node.path} ${node.title}`,
      });
    }
  }

  return {
    chapterCount: nodes.length,
    emptyChapterCount: issues.filter((issue) => issue.title === '空章节').length,
    mermaidCount,
    imageCount,
    tableCount,
    wordCount,
    issues,
  };
}

function ExportPreviewPage() {
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState<TechnicalPlanState | null>(null);
  const [wordPreview, setWordPreview] = useState<WordExportPreviewResult | null>(null);

  useEffect(() => {
    let canceled = false;
    const loader = window.yibiao?.technicalPlan?.loadState;
    if (!loader) {
      setLoading(false);
      setError('当前浏览器环境不支持读取技术方案工作区，请在桌面客户端中使用导出链路预演。');
      return () => {
        canceled = true;
      };
    }
    setLoading(true);
    loader()
      .then(async (nextState) => {
        if (!canceled) {
          setState(nextState);
          setError('');
        }
        const previewer = window.yibiao?.export?.previewWordExport;
        const outline = nextState?.outlineData?.outline || [];
        if (!previewer || !outline.length) {
          if (!canceled) setWordPreview(null);
          return;
        }
        if (!canceled) setPreviewLoading(true);
        let exportFormat = undefined;
        try {
          const cfg = await window.yibiao?.config?.load?.();
          exportFormat = cfg?.export_format;
        } catch { /* 配置读取失败时仍执行默认格式 dry-run */ }
        try {
          const result = await previewer({
            project_name: nextState.outlineData?.project_name,
            outline,
            export_format: exportFormat,
          });
          if (!canceled) setWordPreview(result);
        } catch (previewError) {
          if (!canceled) {
            setWordPreview({
              success: false,
              message: previewError instanceof Error ? previewError.message : 'Word 导出 dry-run 执行失败',
              error_stage: 'ipc',
            });
          }
        }
      })
      .catch((nextError) => {
        if (!canceled) setError(nextError instanceof Error ? nextError.message : '读取技术方案状态失败');
      })
      .finally(() => {
        if (!canceled) {
          setLoading(false);
          setPreviewLoading(false);
        }
      });
    return () => {
      canceled = true;
    };
  }, []);

  const report = useMemo(() => analyzeExportPreview(state), [state]);

  return (
    <div className="developer-secondary-tools-page export-preview-page">
      <section className="panel developer-secondary-hero export-preview-hero">
        <div>
          <span className="section-kicker">Export Preview</span>
          <h2>导出链路预演</h2>
          <p>读取当前技术方案权威正文，预演 Markdown、图片、Mermaid、表格和空章节风险，不覆盖用户文件。</p>
        </div>
        <div className="developer-secondary-accent-card">
          <span>检查状态</span>
          <strong>{loading ? '读取中' : error ? '需桌面环境' : previewLoading ? 'dry-run 中' : '已生成报告'}</strong>
          <small>{error || (wordPreview ? wordPreview.message : '报告基于 outlineData.outline[*].content 生成。')}</small>
        </div>
      </section>

      <div className="export-preview-layout">
        <section className="panel export-preview-summary">
          <div className="settings-section-title">
            <span />
            <strong>导出检查摘要</strong>
          </div>
          <div className="prompt-lab-metrics">
            <article>
              <span>章节</span>
              <strong>{report.chapterCount}</strong>
            </article>
            <article>
              <span>空章节</span>
              <strong>{report.emptyChapterCount}</strong>
            </article>
            <article>
              <span>正文字符</span>
              <strong>{report.wordCount}</strong>
            </article>
            <article>
              <span>图片</span>
              <strong>{report.imageCount}</strong>
            </article>
            <article>
              <span>Mermaid</span>
              <strong>{report.mermaidCount}</strong>
            </article>
            <article>
              <span>表格</span>
              <strong>{report.tableCount}</strong>
            </article>
            <article>
              <span>dry-run 字节</span>
              <strong>{wordPreview?.docx_bytes ? `${Math.round(wordPreview.docx_bytes / 1024)}KB` : '-'}</strong>
            </article>
            <article>
              <span>dry-run 耗时</span>
              <strong>{wordPreview?.duration_ms === undefined ? '-' : `${wordPreview.duration_ms}ms`}</strong>
            </article>
          </div>
        </section>

        <section className="panel export-preview-issues">
          <div className="settings-section-title">
            <span />
            <strong>真实 Word dry-run</strong>
          </div>
          {previewLoading ? (
            <div className="empty-panel">
              <strong>正在调用 Main 侧 Word 导出链路</strong>
              <span>dry-run 会构建 docx buffer 但不会打开保存对话框，也不会覆盖用户文件。</span>
            </div>
          ) : wordPreview ? (
            <div className="parser-sandbox-report">
              <div className={`parser-sandbox-status is-${wordPreview.success ? 'success' : 'error'}`}>
                <strong>{wordPreview.success ? 'dry-run 完成' : 'dry-run 未完成'}</strong>
                <span>{wordPreview.message}</span>
              </div>
              <div className="prompt-lab-metrics">
                <article>
                  <span>叶子章节</span>
                  <strong>{wordPreview.preflight?.leafCount ?? wordPreview.stats?.leafCount ?? 0}</strong>
                </article>
                <article>
                  <span>缺失图片</span>
                  <strong>{wordPreview.preflight?.missingLocalImageCount ?? 0}</strong>
                </article>
                <article>
                  <span>远程图片</span>
                  <strong>{wordPreview.preflight?.remoteImageCount ?? 0}</strong>
                </article>
                <article>
                  <span>提示</span>
                  <strong>{wordPreview.warnings?.length ?? 0}</strong>
                </article>
              </div>
              <div className="parser-capability-notes">
                <strong>导出服务提示</strong>
                {(wordPreview.warnings || []).length ? wordPreview.warnings?.map((warning, index) => (
                  <small key={`${warning}-${index}`}>{warning}</small>
                )) : <small>未返回导出 warning。</small>}
                {wordPreview.error_stage ? <small>失败阶段：{wordPreview.error_stage}</small> : null}
              </div>
            </div>
          ) : (
            <div className="empty-panel">
              <strong>尚未运行真实 dry-run</strong>
              <span>需要桌面客户端 bridge 和可预演的技术方案目录。</span>
            </div>
          )}
        </section>

        <section className="panel export-preview-issues">
          <div className="settings-section-title">
            <span />
            <strong>检查报告</strong>
          </div>
          <div className="export-preview-issue-list">
            {report.issues.length ? report.issues.map((issue, index) => (
              <article className={`is-${issue.level}`} key={`${issue.title}-${index}`}>
                <span>{issue.level}</span>
                <strong>{issue.title}</strong>
                <p>{issue.detail}</p>
                <small>{issue.location}</small>
              </article>
            )) : (
              <div className="empty-panel">
                <strong>未发现明显导出风险</strong>
                <span>仍需在正式导出时由 Main 侧完成图片、Mermaid 和 Word 样式转换。</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const parserProviderOptions: Array<{ value: DeveloperParserProvider; label: string; description: string }> = [
  { value: 'local', label: '本地解析', description: '适合 txt、md、docx、pdf、doc、wps，速度快且不调用远程服务。' },
  { value: 'local-ocr', label: '本地 OCR 解析', description: '适合扫描 PDF、OFD 和图片，优先调用本机 PaddleOCR，不需要 MinerU Token。' },
  { value: 'mineru-accurate-api', label: 'MinerU 精准解析 API', description: '适合复杂 PDF、图片和表格，需在设置中配置 MinerU Token。' },
  { value: 'mineru-agent-api', label: 'MinerU-Agent 轻量解析 API', description: '适合快速检查远程解析效果，按 MinerU Agent 接口轮询结果。' },
];

function diffNumber(a?: number, b?: number) {
  const left = Number(a || 0);
  const right = Number(b || 0);
  const diff = right - left;
  if (diff === 0) return '一致';
  return diff > 0 ? `+${diff}` : String(diff);
}

function getParserLabel(value?: DeveloperParserProvider) {
  return parserProviderOptions.find((item) => item.value === value)?.label || value || '-';
}

function ParserSandboxPage() {
  const [provider, setProvider] = useState<DeveloperParserProvider>('local');
  const [compareProvider, setCompareProvider] = useState<DeveloperParserProvider>('mineru-accurate-api');
  const [preserveImages, setPreserveImages] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<DeveloperParserSampleResult | null>(null);
  const [comparisonResult, setComparisonResult] = useState<DeveloperParserSampleResult | null>(null);
  const [capabilities, setCapabilities] = useState<DeveloperParserCapabilityReport | null>(null);

  useEffect(() => {
    let mounted = true;
    window.yibiao?.file?.getDeveloperParserCapabilities?.()
      .then((report) => {
        if (mounted) setCapabilities(report);
      })
      .catch(() => {
        if (mounted) setCapabilities(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const parseSample = async () => {
    const parser = window.yibiao?.file?.parseDeveloperSample;
    if (!parser) {
      setResult({ success: false, message: '当前浏览器环境不支持打开本地文件，请在桌面客户端中使用文件解析沙盘。' });
      return;
    }
    setParsing(true);
    setComparisonResult(null);
    try {
      setResult(await parser({ provider, preserveImages }));
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : '解析沙盘执行失败' });
    } finally {
      setParsing(false);
    }
  };

  const compareCurrentSample = async () => {
    const parser = window.yibiao?.file?.parseDeveloperSample;
    const filePath = result?.file?.file_path;
    if (!parser || !filePath) {
      setComparisonResult({ success: false, message: '请先选择并解析一个样本文件，再对比另一种解析器。' });
      return;
    }
    setComparing(true);
    try {
      setComparisonResult(await parser({ provider: compareProvider, preserveImages, filePath }));
    } catch (error) {
      setComparisonResult({ success: false, message: error instanceof Error ? error.message : '解析器对比执行失败' });
    } finally {
      setComparing(false);
    }
  };

  return (
    <div className="developer-secondary-tools-page parser-sandbox-page">
      <section className="panel developer-secondary-hero parser-sandbox-hero">
        <div>
          <span className="section-kicker">Parser Sandbox</span>
          <h2>文件解析沙盘</h2>
          <p>选择样本文件和解析通道，查看文件信息、解析耗时、Markdown 预览和图片资产引用，便于定位解析失败阶段。</p>
        </div>
        <div className="developer-secondary-accent-card">
          <span>当前解析器</span>
          <strong>{parserProviderOptions.find((item) => item.value === provider)?.label}</strong>
          <small>{parserProviderOptions.find((item) => item.value === provider)?.description}</small>
        </div>
      </section>

      <div className="parser-sandbox-layout">
        <aside className="panel parser-sandbox-control">
          <div className="settings-section-title">
            <span />
            <strong>解析设置</strong>
          </div>
          <div className="prompt-lab-chain-list">
            {parserProviderOptions.map((option) => (
              <button
                type="button"
                className={provider === option.value ? 'is-active' : ''}
                key={option.value}
                onClick={() => setProvider(option.value)}
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
          <label className="parser-sandbox-toggle">
            <input type="checkbox" checked={preserveImages} onChange={(event) => setPreserveImages(event.target.checked)} />
            <span>保留图片引用并落盘到工作区资产目录</span>
          </label>
          <button type="button" className="primary-action" onClick={() => { void parseSample(); }} disabled={parsing}>
            {parsing ? '解析中...' : '选择并解析样本'}
          </button>
          <div className="parser-sandbox-compare-control">
            <strong>对比解析器</strong>
            <div className="parser-sandbox-provider-tabs">
              {parserProviderOptions.map((option) => (
                <button
                  type="button"
                  className={compareProvider === option.value ? 'is-active' : ''}
                  key={`compare-${option.value}`}
                  onClick={() => setCompareProvider(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="secondary-action"
              onClick={() => { void compareCurrentSample(); }}
              disabled={comparing || !result?.file?.file_path}
            >
              {comparing ? '对比中...' : '用另一解析器对比当前样本'}
            </button>
          </div>
          {capabilities && (
            <div className="parser-capability-panel">
              <strong>样本覆盖矩阵</strong>
              <div className="parser-capability-grid">
                {capabilities.samples.map((sample) => (
                  <article key={sample.extension} className={`is-${sample.status}`}>
                    <span>{sample.extension}</span>
                    <em>{sample.recommended_provider || '待转换'}</em>
                  </article>
                ))}
              </div>
              <small>{capabilities.scanned_document_policy}</small>
              <small>{capabilities.chinese_path_smoke.note}</small>
            </div>
          )}
        </aside>

        <section className="panel parser-sandbox-result">
          <div className="settings-section-title">
            <span />
            <strong>解析结果</strong>
          </div>
          {result ? (
            <div className="parser-sandbox-report">
              <div className={`parser-sandbox-status is-${result.success ? 'success' : 'error'}`}>
                <strong>{result.success ? '解析完成' : '解析未完成'}</strong>
                <span>{result.message}</span>
              </div>
              <div className="prompt-lab-metrics">
                <article>
                  <span>文件</span>
                  <strong>{result.file?.file_name || '-'}</strong>
                </article>
                <article>
                  <span>解析器</span>
                  <strong>{result.parser_label || '-'}</strong>
                </article>
                <article>
                  <span>耗时</span>
                  <strong>{result.duration_ms === undefined ? '-' : `${result.duration_ms}ms`}</strong>
                </article>
                <article>
                  <span>字符</span>
                  <strong>{result.markdown_chars ?? 0}</strong>
                </article>
                <article>
                  <span>行数</span>
                  <strong>{result.line_count ?? 0}</strong>
                </article>
                <article>
                  <span>图片</span>
                  <strong>{result.image_count ?? 0}</strong>
                </article>
              </div>
              <div className="parser-sandbox-markdown">
                <strong>Markdown 预览{result.truncated ? '（已截断）' : ''}</strong>
                <pre>{result.markdown_preview || result.markdown || '暂无 Markdown 内容。'}</pre>
              </div>
              <div className="parser-sandbox-comparison">
                <div className="settings-section-title">
                  <span />
                  <strong>解析器对比</strong>
                </div>
                {comparisonResult ? (
                  <div className="parser-sandbox-report">
                    <div className={`parser-sandbox-status is-${comparisonResult.success ? 'success' : 'error'}`}>
                      <strong>{comparisonResult.success ? '对比完成' : '对比未完成'}</strong>
                      <span>{getParserLabel(result.parser_provider)} vs {getParserLabel(comparisonResult.parser_provider || comparisonResult.requested_provider)}：{comparisonResult.message}</span>
                      {comparisonResult.error_stage ? <small>失败阶段：{comparisonResult.error_stage}</small> : null}
                    </div>
                    <div className="prompt-lab-metrics">
                      <article>
                        <span>字符差异</span>
                        <strong>{diffNumber(result.markdown_chars, comparisonResult.markdown_chars)}</strong>
                      </article>
                      <article>
                        <span>行数差异</span>
                        <strong>{diffNumber(result.line_count, comparisonResult.line_count)}</strong>
                      </article>
                      <article>
                        <span>图片差异</span>
                        <strong>{diffNumber(result.image_count, comparisonResult.image_count)}</strong>
                      </article>
                      <article>
                        <span>耗时差异</span>
                        <strong>{diffNumber(result.duration_ms, comparisonResult.duration_ms)}ms</strong>
                      </article>
                    </div>
                    <div className="parser-sandbox-markdown">
                      <strong>对比解析 Markdown 预览{comparisonResult.truncated ? '（已截断）' : ''}</strong>
                      <pre>{comparisonResult.markdown_preview || comparisonResult.markdown || '暂无 Markdown 内容。'}</pre>
                    </div>
                  </div>
                ) : (
                  <div className="empty-panel">
                    <strong>尚未运行解析器对比</strong>
                    <span>首次解析成功后，可用另一解析器复跑同一个样本文件并查看字符、行数、图片数和耗时差异。</span>
                  </div>
                )}
              </div>
              {capabilities && (
                <div className="parser-capability-notes">
                  <strong>当前样本集提示</strong>
                  {capabilities.samples.map((sample) => (
                    <small key={sample.extension}>{sample.extension}：{sample.note}</small>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="empty-panel">
              <strong>尚未选择样本文件</strong>
              <span>选择解析器后点击“选择并解析样本”，沙盘会打开本地文件选择框并执行一次真实解析。</span>
              {capabilities && (
                <div className="parser-capability-notes">
                  <strong>回归样本要求</strong>
                  <small>{capabilities.chinese_path_smoke.example}</small>
                  {capabilities.samples.map((sample) => (
                    <small key={sample.extension}>{sample.extension}：{sample.note}</small>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DeveloperToolsPage({ sectionId }: DeveloperToolsPageProps) {
  if (sectionId === 'developer-prompt-lab') {
    return <PromptLabPage />;
  }

  if (sectionId === 'developer-parser-sandbox') {
    return <ParserSandboxPage />;
  }

  if (sectionId === 'developer-export-preview') {
    return <ExportPreviewPage />;
  }

  return null;
}

export default DeveloperToolsPage;
