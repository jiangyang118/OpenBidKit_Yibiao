const LEGACY_BID_STRUCTURE_RULES = [
  '按完整响应文件组织，不只写技术方案；优先覆盖报价文件、资格资信、法定代表人授权、商务响应、技术方案、实施验收、售后质保、保密安全、偏离表和交付附件。',
  '技术方案采用“项目理解—总体架构—核心流程—关键功能—产品设备—软件平台—参数响应”的递进结构；每一层都要对应采购清单、评分点或验收依据。',
  '实施服务采用“实施原则—项目组织—阶段计划—质量保障—风险控制—安装调试—检验验收—培训移交”的闭环，不要只写笼统服务承诺。',
  '证明材料要写成可装订口径，明确材料名称、支撑事项、附件位置、盖章或待补边界；不能把历史样例、封面图或素材截图说成当前项目已正式具备。',
  '对不确定事实使用“待补品牌型号、待补同型号报告、正式递交前核定页码”等占位边界，不得编造品牌、型号、页码、证书编号或检测结论。',
];

const LEGACY_BID_TABLE_PATTERNS = [
  '报价一览表：项目名称 | 项目编号 | 报价含税总价 | 不含税金额 | 税率口径 | 备注',
  '分项报价表：序号 | 名称 | 数量 | 品牌及型号 | 含税单价 | 含税总价 | 备注',
  '资格材料清单：资格性审查材料 | 响应状态 | 证明文件 | 装订位置',
  '总体架构表：层级 | 组成 | 作用',
  '核心业务流程表：步骤 | 环节 | 说明',
  '关键功能设计表：功能 | 设计说明',
  '产品设备建设表：建设内容 | 响应说明 | 型号/数量 | 证明材料',
  '技术指标参数响应表：序号 | 星号项 | 设备/系统 | 技术评审要求 | 技术参数响应 | 偏离度 | 文件名称/页码 | 备注',
  '项目组织表：角色 | 职责 | 交付成果 | 配合要求',
  '实施阶段计划表：时间 | 阶段 | 主要工作 | 成果物',
  '质量保障表：控制环节 | 保障措施 | 检查记录',
  '风险控制表：风险点 | 影响 | 控制措施',
  '验收依据表：验收依据 | 对应内容 | 证明材料',
  '功能验收要点表：验收对象 | 验收内容 | 通过标准 | 记录材料',
  '问题整改台账：问题等级 | 整改时限 | 责任人 | 复验方式',
  '培训计划表：培训对象 | 培训内容 | 培训方式 | 成果物',
  '交付资料清单：资料名称 | 份数 | 形式 | 备注',
];

const LEGACY_BID_STYLE_RULES = [
  '表达采用正式响应口径，例如“我方拟供”“我方配置”“按采购文件要求响应”“无偏离”“随响应文件提供”“正式递交前补齐”。',
  '重点参数、星号项和评分项要形成“要求—响应—证明—偏离度”的闭环；不能只写满足或承诺。',
  '图文并茂章节先说明图片证明的对象、型号、功能边界和适用场景，再插入或引用真实设备图、系统截图、架构图、检测报告正文或证书附件。',
  '验收与附件模板要落到可执行表单，例如设备到货验收单、单系统功能测试记录、问题整改台账、最终验收结论表。',
  '正文生成阶段不得输出“P__”“第__页”“第__页至第__页”等空白页码占位；页码未知时写“导出时按最终装订页码回填”，由导出或定稿阶段统一计算真实页码。',
  '不得把血常规、医院检验、体检、医学检测报告单等个人健康材料当作本项目产品检测报告、硬件检测报告或技术证明材料。',
  '禁止暴露“AI、知识库、历史文档、导入来源、旧标书、素材库、内部路径”等内部处理痕迹。',
];

const DEFAULT_PROJECT_TEAM_MEMBERS = [
  {
    role: '项目经理',
    name: '姜阳',
    responsibility: '负责总体协调和履约闭环',
  },
  {
    role: '技术负责人',
    name: '赖清涛',
    responsibility: '负责总体技术方案、软件部署、平台联调、国产化适配和技术验收',
  },
  {
    role: '硬件实施工程师',
    name: '赵野',
    responsibility: '负责现场设备安装、接线、固定、通电测试和单机调试',
  },
  {
    role: '软件实施工程师',
    name: '兰海军',
    responsibility: '负责平台部署、数据库初始化、权限配置、接口联调和报表验证',
  },
  {
    role: '培训讲师',
    name: '张帅',
    responsibility: '负责分岗位培训和考核记录',
  },
  {
    role: '售后服务负责人',
    name: '柴玉龙',
    responsibility: '负责6小时响应、12小时到场、备品备件协调、巡检维护和服务工单闭环',
  },
];

const FORBIDDEN_PROJECT_TEAM_NAMES = ['李阳', '王磊', '赵晨', '陈静', '刘洋'];

function formatNumberedRules(rules) {
  return rules.map((rule, index) => `${index + 1}. ${rule}`).join('\n');
}

function formatBulletRules(rules) {
  return rules.map((rule) => `- ${rule}`).join('\n');
}

function getDefaultProjectTeamFacts() {
  return DEFAULT_PROJECT_TEAM_MEMBERS
    .map((member) => `- ${member.role}：${member.name}，${member.responsibility}。`)
    .join('\n');
}

function getDefaultProjectTeamRules() {
  return `默认项目团队人员口径：
${getDefaultProjectTeamFacts()}

人员约束：
- 生成项目组织、人员职责、实施计划、培训售后和履约闭环章节时，优先使用以上真实人员名单。
- 除非用户在当前项目中明确改名，不得随机编造团队成员，不得使用这些错误姓名：${FORBIDDEN_PROJECT_TEAM_NAMES.join('、')}。`;
}

function getMatureBidOutlineRules() {
  return `人工标书增强规则：
${formatNumberedRules([
    ...LEGACY_BID_STRUCTURE_RULES,
    '目录要按“投标材料整体包”思路组织；如果当前模式要求一级目录严格对齐技术评分项，则把商务、资质、证明、实施、验收、售后和附件内容作为对应一级目录下的二级或三级目录补入。',
    '商务部分应覆盖投标函、法定代表人授权、报价文件、商务偏离/响应、付款与合同条款、质保售后、培训服务、项目实施承诺和附件装订要求。',
    '证明材料必须从参考知识库和图片知识库中寻找可支撑材料：软件检测报告、CNAS/CMA、软件著作权、硬件检测/检验报告、产品彩页、厂家盖章证明、公司资质、人员证书、团队证明和项目业绩。',
    '报告类材料不能只放封面图，目录 description 要提示应引用报告原文、测试范围、关键指标、测试结论或正文关键页。',
    '图文证据要使用正式投标口径：后台、移动端、设备端、称重台、绑盘机、消费机、营养健康、报表、架构、部署和接口章节都要匹配真实截图、产品图片或图示说明。',
    '禁止输出“免费二次开发支持”“免费二次开发”“软件免费升级”“软件终身免费升级”“终身免费升级”等过度承诺；相关服务统一表述为项目相关功能优化配合、升级维护服务、系统对接配合或按合同边界执行。',
  ])}`;
}

function getMatureBidPlanningRules() {
  return `成熟标书编排规则：
${formatNumberedRules([
    '优先采用旧标书沉淀出的表格化响应方式，凡涉及职责、流程、参数、设备、证明、风险、验收、培训和交付资料，应评估是否使用表格。',
    '技术章节按项目理解、总体架构、核心业务流程、关键功能、产品设备、软件平台和参数响应组织；功能章节按业务场景、操作流程、后台/移动端/终端界面证据、管理价值和验收证明展开。',
    '实施验收章节要规划阶段计划、项目组织、质量保障、风险控制、安装调试、功能验收、问题整改、培训移交和最终验收结论。',
    '证明材料类章节优先选择能形成附件装订的真实证据；若证据不足，规划待补材料而不是生成泛泛承诺。',
    '适合配图的章节优先引用图片知识库中的真实界面截图、设备图片、架构图、报表图、检测报告正文或证书附件。',
  ])}

推荐表格模板：
${formatBulletRules(LEGACY_BID_TABLE_PATTERNS)}

写法约束：
${formatBulletRules(LEGACY_BID_STYLE_RULES)}

${getDefaultProjectTeamRules()}`;
}

function getMatureBidContentRules() {
  return `成熟标书正文写作规则：
${formatNumberedRules([
    '正文要体现完整响应文件口径，除技术描述外，要主动补足证明材料、附件装订、偏离度、验收依据、交付成果和待补边界。',
    '参数、星号项、评分项、设备清单和服务要求优先写成“要求—响应—证明—偏离度”闭环；明确可写“无偏离”，不明确则写待核定或待补。',
    '涉及项目理解、总体架构、核心流程、关键功能、产品设备、软件平台、实施计划、质量保障、风险控制、验收培训时，优先选用旧标书表格模板表达。',
    '报价、资格、授权、承诺、偏离、质保、保密、交付资料和附件模板类内容要符合正式投标装订口径，避免散文化说明。',
    '图文并茂章节必须先说明图片或附件证明什么，再写对应响应内容；不得让图片孤立出现，也不得把封面图片替代报告正文。',
    '对历史材料、样例材料和缺少型号/页码/盖章的信息，必须写明当前项目需重新核定、补齐或盖章，不能表述为已经完成。',
  ])}

可直接吸收的表格模板：
${formatBulletRules(LEGACY_BID_TABLE_PATTERNS)}

标书表达口径：
${formatBulletRules(LEGACY_BID_STYLE_RULES)}

${getDefaultProjectTeamRules()}`;
}

function getLegacyBidGuideSnapshot() {
  return {
    structureRules: [...LEGACY_BID_STRUCTURE_RULES],
    tablePatterns: [...LEGACY_BID_TABLE_PATTERNS],
    styleRules: [...LEGACY_BID_STYLE_RULES],
    projectTeamMembers: DEFAULT_PROJECT_TEAM_MEMBERS.map((member) => ({ ...member })),
    forbiddenProjectTeamNames: [...FORBIDDEN_PROJECT_TEAM_NAMES],
  };
}

module.exports = {
  getMatureBidOutlineRules,
  getMatureBidPlanningRules,
  getMatureBidContentRules,
  getDefaultProjectTeamFacts,
  getDefaultProjectTeamRules,
  getLegacyBidGuideSnapshot,
};
