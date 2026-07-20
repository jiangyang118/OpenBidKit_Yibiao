import { buildInvalidBidAndRejectionItemsPrompt } from '../../../shared/prompts';
import type { BidAnalysisMode } from '../types';

export interface BidAnalysisTaskDefinition {
  id: string;
  label: string;
  description: string;
  required: boolean;
  output: 'markdown' | 'json';
  buildTaskPrompt: () => string;
}

function jsonTask(title: string, goals: string, outputJson: string) {
  return `任务：${title}

目标：${goals}

约束：
1. 输出格式必须为 JSON。
2. 严格按照以下 JSON 格式输出，只修改 value，禁止修改 key 和结构。
3. 原文中没有的字段填充“没有提及”。

JSON 格式：
${outputJson}

仅输出 JSON，不要输出其他内容。`;
}

export const bidAnalysisTasks: BidAnalysisTaskDefinition[] = [
  {
    id: 'projectOverview',
    label: '项目概述',
    description: '提取项目基本信息、背景目的、规模预算、时间安排、实施内容和技术特点。',
    required: true,
    output: 'markdown',
    buildTaskPrompt: () => `任务：提取并总结项目概述信息。

请重点关注：
1. 项目名称和基本信息
2. 项目背景和目的
3. 项目规模和预算
4. 项目时间安排
5. 项目要实施的具体内容
6. 主要技术特点
7. 其他关键要求

工作要求：
1. 保持信息全面准确，尽量使用原文内容，不要自行编写。
2. 只关注与项目实施有关的内容，不提取商务信息。
3. 直接返回整理好的项目概述，除此之外不返回任何其他内容。`,
  },
  {
    id: 'techRequirements',
    label: '技术评分要求',
    description: '提取技术评分项、权重分值、评分标准和原文位置。',
    required: true,
    output: 'markdown',
    buildTaskPrompt: () => `任务：提取技术评分要求。

目标定位：
1. 重点识别与“技术评分”“评标方法”“评分标准”“技术参数”“技术要求”“技术方案”“技术部分”“评审要素”相关的章节。
2. 不要提取商务、价格、资质等与技术类评分项无关的条目。

每一项按以下结构输出，信息缺失时标注“未提及”：
【评分项名称】：<原文描述，保留专业术语>
【权重/分值】：<具体分值或占比>
【评分标准】：<详细规则>
【数据来源】：<章节、条款、页码或表格位置>

处理规则：
1. 若没有明确“技术评分表”，根据上下文判断技术评分相关内容。
2. 若评分项以表格形式呈现，按行提取，并标注“[表格数据]”。
3. 若存在二级评分项，用缩进或编号体现层级关系。
4. 单位尽量统一为“分”或“%”，必要时注明原文单位。

直接返回提取结果，除此之外不输出任何其他内容。`,
  },
  {
    id: 'projectInfo',
    label: '项目信息',
    description: '项目名称、编号、类型、预算和地址。',
    required: true,
    output: 'json',
    buildTaskPrompt: () => jsonTask('提取项目信息', '提取项目名称、项目编号、项目类型、项目预算、项目地址。', `{
  "project_name": "项目名称",
  "project_number": "项目编号",
  "project_type": "项目类型",
  "project_budget": "项目预算",
  "project_address": "项目地址"
}`),
  },
  {
    id: 'partAInfo',
    label: '甲方信息',
    description: '招标人公司、地址、联系人和电话。',
    required: true,
    output: 'json',
    buildTaskPrompt: () => jsonTask('提取甲方信息', '提取公司名称、地址、联系人、联系电话。', `{
  "company_name": "公司名称",
  "address": "地址",
  "contact_person": "联系人",
  "contact_phone": "联系电话"
}`),
  },
  {
    id: 'deliveryAndServiceRequirements',
    label: '交货和服务要求',
    description: '实施周期、交付范围、地点、验收、质保、售后、响应、培训和文档要求。',
    required: true,
    output: 'json',
    buildTaskPrompt: () => jsonTask('提取交货和服务要求', '提取实施周期/工期/交付期限、交付范围、交付/实施地点、验收要求、质保期、售后服务要求、响应时限、培训要求、资料/文档交付要求。', `{
  "implementation_period": "实施周期/工期/交付期限",
  "delivery_scope": "交付范围",
  "delivery_location": "交付/实施地点",
  "acceptance_requirements": "验收要求",
  "warranty_period": "质保期",
  "after_sales_service": "售后服务要求",
  "response_time": "响应时限",
  "training_requirements": "培训要求",
  "documentation_requirements": "资料/文档交付要求"
}`),
  },
  {
    id: 'procurementList',
    label: '采购清单',
    description: '采购内容、数量、规格参数、交付和验收要求。',
    required: false,
    output: 'markdown',
    buildTaskPrompt: () => `任务：提取招标文件、询比文件或采购文件中的采购清单/采购需求信息。

请从原文中识别与“采购清单、采购需求、采购内容、货物需求、服务内容、技术参数、规格要求、报价清单、分项报价、工程量清单”等含义相近的内容。

提取要求：
1. 优先保留原文中的表格、条目和字段含义，不要自行补充原文没有的信息。
2. 如果原文是表格，请尽量整理为 Markdown 表格；如果表格结构复杂，可以按“清单项 + 要求说明”的方式整理。
3. 如果不同章节分别描述采购内容、技术参数、数量、交付、验收、质保等要求，请合并整理，但要避免编造不存在的字段。
4. 字段名称不要求固定，按原文实际出现的信息组织，例如名称、规格型号、技术参数、单位、数量、预算/限价、交付地点、交付时间、验收要求、质保要求、备注等。
5. 如果没有找到明确采购清单，请说明“未找到明确采购清单”，并列出可能相关的采购需求段落摘要。
6. 只输出整理结果，不要输出分析过程。`,
  },
  {
    id: 'responseFileRequirements',
    label: '响应文件要求',
    description: '响应文件组成、格式模板、签章、递交和偏离表要求。',
    required: false,
    output: 'markdown',
    buildTaskPrompt: () => `任务：提取招标文件、询比文件或采购文件中关于响应文件/投标文件编制与提交的要求。

请识别与“响应文件、投标文件、报价文件、资格证明文件、商务响应、技术响应、偏离表、响应文件格式、投标文件格式、递交要求、签字盖章、密封上传”等含义相近的内容。

提取要求：
1. 按原文实际结构整理，不要强制套用固定模板。
2. 重点提取响应文件需要包含哪些部分，例如报价文件、商务文件、技术文件、资格证明、承诺函、授权委托书、响应表、偏离表、分项报价表等。
3. 如果原文提供了固定格式、表格或附件模板，请提取模板名称、用途、填写要求和关键字段。
4. 提取签字盖章、文件命名、装订/密封、上传格式、份数、递交截止时间、递交方式等要求。
5. 区分“必须提供”和“如适用/可选提供”的内容；如果原文没有明确区分，不要自行判断。
6. 不要生成供应商自己的最终响应文件，不要编造公司信息、报价、资质、承诺内容。
7. 如果没有找到明确响应文件要求，请说明“未找到明确响应文件要求”，并列出可能相关的投标/响应文件格式段落摘要。
8. 只输出整理结果，不要输出分析过程。`,
  },
  {
    id: 'proofMaterialMatrix',
    label: '证明材料矩阵',
    description: '检测报告、证书、盖章证明、产品彩页和参数确认要求。',
    required: false,
    output: 'markdown',
    buildTaskPrompt: () => `任务：提取招标文件中所有与证明材料、检测报告、证书资质、厂家盖章文件相关的要求。

请重点识别：
1. 软件检测报告、CNAS/CMA、软件著作权、专利、国产化适配、体系认证等软件和公司证明。
2. 硬件检测报告、检验报告、质检报告、出厂检验、产品型号、参数确认等设备证明。
3. 厂家盖章功能证明、授权函、承诺函、产品彩页、功能清单、参数确认文件。
4. 团队人员、项目经理、技术负责人、工程师、职称证书、人员证书。
5. 原文要求证明材料出现在响应文件哪个章节、是否需要签字盖章、是否要求原件/复印件/扫描件。

输出要求：
1. 按“技术条款/采购要求 — 产品或能力 — 要求的证明材料 — 原文位置 — 装订/盖章要求”整理。
2. 如果原文只要求“提供证明材料”但没有指定文件类型，要保留原文并标注“文件类型未明确”。
3. 不要把封面图片等同于报告正文；报告类要求需标注是否要求测试范围、测试结论、关键指标或完整报告。
4. 只输出整理结果，不要输出分析过程。`,
  },
  {
    id: 'visualEvidenceRequirements',
    label: '图文证据要求',
    description: '功能截图、操作说明、产品图片、架构图和报表图要求。',
    required: false,
    output: 'markdown',
    buildTaskPrompt: () => `任务：提取招标文件中所有需要用图片、截图、图示或操作说明支撑的要求。

请重点识别：
1. PC 后台、手机端、消费设备端、营养健康、订单管理、补贴管理、菜品管理、报表统计等功能截图要求。
2. 称重台、消费机、绑盘机、托盘、电子价签、硬件外观、终端界面等产品图片或设备图片要求。
3. 系统架构图、部署拓扑图、接口关系图、业务流程图、数据流转图、报表图等图示要求。
4. 操作流程说明、配置说明、演示材料、现场演示、截图页或附件页要求。

输出要求：
1. 按“章节/功能场景 — 应提供图文证据 — 证明目的 — 原文位置 — 缺失风险”整理。
2. 区分原文明确要求和根据功能验收需要重点补充的图文证据，补充项前缀使用“重点补充：”。
3. 不要生成图片标题，不要编造已具备截图；只抽取要求和证据缺口。
4. 只输出整理结果，不要输出分析过程。`,
  },
  {
    id: 'agentInfo',
    label: '代理机构信息',
    description: '代理机构联系方式和账户信息。',
    required: false,
    output: 'json',
    buildTaskPrompt: () => jsonTask('提取代理机构信息', '提取代理机构名称、地址、联系人、电话、邮箱和银行账户信息。', `{
  "company_name": "公司名称",
  "address": "地址",
  "contact_person": "联系人",
  "contact_phone": "联系电话",
  "email": "联系邮箱",
  "bank_account_name": "银行账户名称",
  "bank_account_number": "银行账户账号",
  "bank_account_address": "银行账户开户行",
  "bank_account_address_detail": "银行账户开户行地址"
}`),
  },
  {
    id: 'keyInfo',
    label: '投标关键节点',
    description: '公告、获取文件、递交、截止和开标信息。',
    required: false,
    output: 'json',
    buildTaskPrompt: () => jsonTask('提取投标关键节点', '提取招标公告发布日期、招标文件获取方式、售价、获取时间、提交地点、截止时间、开标时间、开标地点和其他注意事项。', `{
  "bid_announcement_time": "招标公告发布日期",
  "bid_file_get_way": "招标文件获取方式",
  "bid_file_price": "招标文件售价",
  "get_bid_file_time": "获取招标文件时间",
  "bid_document_submission_location": "投标文件提交地点",
  "bid_submission_deadline": "投标截止时间",
  "bid_opening_time": "开标时间",
  "bid_opening_address": "开标地点",
  "other_notes": "其他注意事项"
}`),
  },
  {
    id: 'marginInfo',
    label: '投标保证金',
    description: '保证金金额、方式、截止和退还条件。',
    required: false,
    output: 'json',
    buildTaskPrompt: () => jsonTask('提取投标保证金信息', '提取投标保证金、缴纳方式、截止日期、退还条件、不予退还情形和其他注意事项。', `{
  "bidding_deposit": "投标保证金",
  "payment_method": "缴纳方式",
  "due_date": "截止日期",
  "refund_conditions": "退还条件",
  "non_refundable_conditions": "不予退还的情形",
  "other_notes": "其他注意事项"
}`),
  },
  {
    id: 'qualificationReview',
    label: '资格性审查',
    description: '投标人资格条件和资格审查要求。',
    required: false,
    output: 'markdown',
    buildTaskPrompt: () => '任务：提取招标文件中关于投标人资格性审查的信息。整理成方便阅读的 Markdown，不要使用表格；如果原文是表格，请转换为列表。仅输出整理结果。',
  },
  {
    id: 'complianceCheck',
    label: '符合性检查',
    description: '文件完整性、有效性、规范和偏差处理要求。',
    required: false,
    output: 'markdown',
    buildTaskPrompt: () => '任务：总结招标文件中关于符合性检查的信息，一般包括文件完整性、文件有效性、文件规范、偏差处理等。整理成 Markdown，不要使用表格；如果原文是表格，请转换为列表。仅输出整理结果。',
  },
  {
    id: 'openBid',
    label: '开标要求',
    description: '开标时间地点、参与要求、无效标和流程。',
    required: false,
    output: 'json',
    buildTaskPrompt: () => jsonTask('提取开标信息', '提取时间地点、参与要求、无效标认定、异议处理、开标流程。开标流程只涉及开标，不涉及评标和定标。', `{
  "time_place": "时间地点",
  "part_req": "参与要求",
  "invalid_bid": "无效标认定",
  "objection": "异议处理",
  "bid_process": "开标流程"
}`),
  },
  {
    id: 'evaluationBid',
    label: '评标要求',
    description: '评标委员会、评分构成、方法和原则。',
    required: false,
    output: 'json',
    buildTaskPrompt: () => jsonTask('提取评标信息', '提取评标委员会组成、职责、评分构成、评标方法类型、评标原则和方法细节、其他评标相关说明。', `{
  "committee": "评标委员会组成",
  "duties": "评标委员会职责",
  "scoring": "评分构成",
  "method": "评标方法类型",
  "principles": "评标原则和方法细节",
  "others": "其他和评标相关的说明"
}`),
  },
  {
    id: 'businessScoring',
    label: '商务评分要求',
    description: '商务评分因素，为商务方案准备。',
    required: false,
    output: 'markdown',
    buildTaskPrompt: () => '任务：提取招标文件中的商务评分因素，为编写投标文件中的商务方案做准备。保持原文准确性，整理成方便阅读的 Markdown，不要使用表格；如果原文是表格，请转换为列表。仅输出整理结果。',
  },
  {
    id: 'companyTeamQualifications',
    label: '公司团队资质',
    description: '公司资质、业绩、团队人员、项目经理和人员证书要求。',
    required: false,
    output: 'markdown',
    buildTaskPrompt: () => `任务：提取招标文件中对供应商公司资质、业绩、团队人员和人员证书的要求。

请重点识别：
1. 营业执照、体系认证、信用记录、荣誉、业绩合同、验收证明、用户证明。
2. 项目经理、技术负责人、实施人员、售后人员、驻场人员、培训人员配置要求。
3. 高级工程师、职称证书、资格证书、社保、劳动合同、授权证明等人员证明。
4. 原文中对证书有效期、盖章、复印件、原件备查、项目经验年限、类似项目数量的要求。

输出要求：
1. 按“资质/人员类别 — 原文要求 — 证明文件 — 装订/盖章要求 — 对投标文件影响”整理。
2. 没有明确要求的类别不要编造；但可在最后列“重点补充：人工标书通常需要核对的资质/人员证明缺口”。
3. 只输出整理结果，不要输出分析过程。`,
  },
  {
    id: 'deploymentSecurityInterfaces',
    label: '部署安全接口',
    description: '部署拓扑、数据安全、日志审计、备份容灾、接口对接和报表要求。',
    required: false,
    output: 'markdown',
    buildTaskPrompt: () => `任务：提取招标文件中与系统部署、安全、接口、数据、报表和运维相关的要求。

请重点识别：
1. 部署方式、服务器/终端环境、网络环境、国产化适配、浏览器/操作系统/数据库/中间件要求。
2. 权限控制、密码策略、通信安全、数据安全、日志审计、备份恢复、容灾、迁移和运维要求。
3. 第三方系统接口、人员账户、订单、菜品、营养、设备、报表、一卡通、门禁、停车、监管平台等对接要求。
4. 统计报表、经营驾驶舱、台账、数据导出、留痕追溯和验收数据要求。

输出要求：
1. 按“要求类别 — 原文要求 — 对技术方案章节的影响 — 应提供的图/表/接口清单/证明材料”整理。
2. 原文未明确但对智慧食堂投标质量影响大的内容，可作为“重点补充”列出，每类不超过 3 条。
3. 只输出整理结果，不要输出分析过程。`,
  },
  {
    id: 'discardedBids',
    label: '无效标与废标项',
    description: '投标无效、废标相关风险项。',
    required: false,
    output: 'markdown',
    buildTaskPrompt: buildInvalidBidAndRejectionItemsPrompt,
  },
  {
    id: 'signingProcess',
    label: '合同授予与签订',
    description: '中标公示、合同签订、履约保证金和合同文本。',
    required: false,
    output: 'json',
    buildTaskPrompt: () => jsonTask('提取合同授予和签订流程', '提取中标公示、合同签订、履约保证金、合同文本等信息。', `{
  "bid_notice": "中标公示",
  "contract_sign": "合同签订",
  "performance_bond": "履约保证金",
  "contract_text": "合同文本"
}`),
  },
  {
    id: 'terminationCondition',
    label: '合同解除和终止',
    description: '违约解除、不可抗力、合同终止和争议解决。',
    required: false,
    output: 'json',
    buildTaskPrompt: () => jsonTask('提取合同解除和终止条件', '提取违约解除、不可抗力、合同终止、争议解决等信息。', `{
  "breach_termination": "违约解除",
  "force_majeure": "不可抗力",
  "contract_termination": "合同终止",
  "dispute_resolution": "争议解决"
}`),
  },
];

export function getBidAnalysisTasks(mode: BidAnalysisMode) {
  return mode === 'full' ? bidAnalysisTasks : bidAnalysisTasks.filter((task) => task.required);
}

export function getBidAnalysisTaskById(taskId: string) {
  return bidAnalysisTasks.find((task) => task.id === taskId);
}
