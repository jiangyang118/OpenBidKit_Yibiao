const { supportedImageExtensionsText } = require('./bidDocumentAssets.cjs');

const SMART_CANTEEN_TEMPLATE_ID = 'smart-canteen-response';
const GENERIC_RESPONSE_TEMPLATE_ID = 'generic-response';
const DEFAULT_BID_DOCUMENT_TEMPLATE_ID = GENERIC_RESPONSE_TEMPLATE_ID;

const REQUIRED_SECTION_IDS = [
  'quote-summary',
  'supplier-basic-info',
  'technical-solution',
  'implementation-plan',
  'after-sales-plan',
  'warranty-period',
  'other-materials',
];

const SMART_CANTEEN_QUOTE_ITEMS = [
  { name: '智慧食堂管理系统含手机端', quantity: 1, brandModel: '康比特 CPT-Nutr-GMPLTF V2.0', unitPriceWithTax: 15000, totalWithTax: 15000, taxRate: 0.13, category: 'software' },
  { name: '智能称重设备', quantity: 30, brandModel: '康比特 CPT-Nutr-GMSC450-LITE', unitPriceWithTax: 3000, totalWithTax: 90000, taxRate: 0.13, category: 'hardware' },
  { name: '智能绑盘机', quantity: 1, brandModel: '康比特 CPT-BP001', unitPriceWithTax: 4300, totalWithTax: 4300, taxRate: 0.13, category: 'hardware' },
  { name: '双屏消费机', quantity: 3, brandModel: '康比特 CPT-GMPOS200', unitPriceWithTax: 3650, totalWithTax: 10950, taxRate: 0.13, category: 'hardware' },
  { name: '称重消费机', quantity: 1, brandModel: '康比特 CPT-CZSY280', unitPriceWithTax: 4000, totalWithTax: 4000, taxRate: 0.13, category: 'hardware' },
  { name: '托盘', quantity: 400, brandModel: '康比特 CPT-FT248', unitPriceWithTax: 22, totalWithTax: 8800, taxRate: 0.13, category: 'material' },
];

const SMART_CANTEEN_ASSETS = [
  ['business_license', '营业执照', 'supplier-basic-info'],
  ['iso9001', 'ISO9001 质量管理体系认证证书', 'supplier-basic-info'],
  ['iso20000', 'ISO20000 信息技术服务管理体系认证证书', 'supplier-basic-info'],
  ['iso27001', 'ISO27001 信息安全管理体系认证证书', 'supplier-basic-info'],
  ['software_copyright', '智慧营养健康餐厅管理系统 V1.0 软件著作权证书', 'supplier-basic-info'],
  ['domestic_certificate', '国产化证书', 'supplier-basic-info'],
  ['cnas_report', 'CNAS 检测报告', 'supplier-basic-info'],
  ['other_certificate', '其他证书', 'supplier-basic-info'],
  ['backend_platform_screenshot', '后台管理平台截图', 'technical-solution'],
  ['dish_management_screenshot', '菜品管理界面截图', 'technical-solution'],
  ['statistics_report_screenshot', '统计报表截图', 'technical-solution'],
  ['mobile_app_screenshot', '移动端截图', 'technical-solution'],
  ['weighing_device_image', '智能称重设备图片', 'technical-solution'],
  ['binding_machine_image', '智能绑盘机图片', 'technical-solution'],
  ['dual_screen_pos_image', '双屏消费机图片', 'technical-solution'],
  ['weighing_pos_image', '称重消费机图片', 'technical-solution'],
  ['tray_image', '托盘图片', 'technical-solution'],
  ['contract_case_scan', '合同案例证明扫描件', 'other-materials'],
];

const GENERIC_RESPONSE_ASSETS = [
  ['qualification_scan', '资质证明扫描件', 'supplier-basic-info'],
  ['solution_screenshot', '系统或产品截图', 'technical-solution'],
  ['contract_case_scan', '合同案例证明扫描件', 'other-materials'],
];

function assetDefinitionsFromTuples(assets) {
  return assets.map(([key, title, sectionId]) => ({
    key,
    title,
    sectionId,
    type: 'image',
    required: true,
  }));
}

const BID_DOCUMENT_PREFLIGHT_CHECK_KEYS = [
  'templateCheck',
  'quoteCheck',
  'paymentCheck',
  'titleCheck',
  'identityCheck',
  'forbiddenWordsCheck',
  'assetCheck',
  'sectionSelectionCheck',
  'sectionCheck',
];

const BID_DOCUMENT_POST_GENERATION_CHECK_KEYS = [
  'docxOpenCheck',
  'docxContentCheck',
  'docxSectionOrderCheck',
  'docxTableCheck',
  'docxQuoteIntegrityCheck',
  'docxLayoutCheck',
  'docxTocCheck',
  'docxStyleCheck',
  'docxTechnicalDensityCheck',
  'docxPageBreakCheck',
  'imageInsertionCheck',
  'docxAssetPlacementCheck',
  'docxForbiddenWordsCheck',
];

const BID_DOCUMENT_IMPORT_CHECK_KEYS = [
  'quoteResolutionCheck',
];

function validationResultFieldsFor(checkKeys) {
  return Object.fromEntries(checkKeys.map((key) => [key, 'BidDocumentValidationResult']));
}

const SMART_CANTEEN_TEMPLATE = {
  id: SMART_CANTEEN_TEMPLATE_ID,
  name: '智慧食堂响应文件模板',
  documentTitle: '响应文件',
  industry: '智慧食堂',
  contentProfile: {
    qualificationSummary: '营业执照、体系认证、软件著作权、国产化证书、CNAS 检测报告及其他证书。',
    projectUnderstanding: '本项目核心不是单一收银设备采购，而是围绕“菜品设置-称重取餐-身份/餐盘绑定-营养换算-消费结算-数据报表-异常追溯”的闭环建设。',
    architectureRows: [
      ['用户入口层', '管理后台、移动端、消费终端', '覆盖管理人员、就餐人员和现场运营人员的日常使用入口。'],
      ['设备采集层', '智能称重设备、绑盘机、双屏消费机、称重消费机、托盘', '完成取餐称重、餐盘或身份识别、消费结算与现场交互。'],
      ['业务应用层', '菜品管理、营养管理、消费结算、报表统计、异常追溯', '按业务闭环组织功能，不把本项目理解为单一收银设备采购。'],
      ['数据与接口层', '基础档案、消费流水、营养换算数据、第三方接口', '接口对接以对方系统开放能力、字段说明、测试账号和权限为前提。'],
      ['安全运维层', '权限、日志、备份、运维巡检', '提供可追溯、可维护的本地化交付和售后服务。'],
    ],
    flowRows: [
      ['基础配置', '维护食堂、档口、人员、设备和结算规则。', '以项目实际启用范围为准。'],
      ['菜品与营养维护', '维护菜品、价格、重量、营养成分和展示口径。', '营养数据按客户提供或确认的基础数据配置。'],
      ['餐盘/身份绑定', '支持餐盘、身份或消费账户与现场取餐动作关联。', '绑定方式按现场设备和客户管理制度实施。'],
      ['称重取餐', '称重设备采集取餐重量并形成消费明细。', '设备安装点位以最终现场勘查为准。'],
      ['消费结算', '按重量、价格和账户规则完成结算。', '第三方支付或财务对接按接口条件实施。'],
      ['营养反馈', '形成个人或管理维度的营养统计反馈。', '展示内容以启用模块和数据来源为准。'],
      ['异常闭环', '支持异常消费、设备状态和数据差异追溯。', '不承诺合同范围外的无限开发。'],
    ],
    keyFunctionRows: [
      ['菜品管理', '维护菜品、价格、分类、营养口径和上下架状态。', '按客户确认的菜品基础数据初始化。', '支撑称重取餐和营养换算。'],
      ['称重消费', '称重设备采集重量，消费机完成结算展示。', '按本次分项报价设备范围交付。', '降低人工称量和核算成本。'],
      ['统计报表', '形成消费、菜品、营养和异常数据统计。', '报表口径以启用模块和数据来源为准。', '支撑运营复盘和异常追溯。'],
      ['移动端', '提供面向用户或管理人员的移动端能力。', '以合同范围内启用功能为准。', '提升查询和反馈效率。'],
    ],
    interfaceRows: [
      ['HIS/人员系统', '对方系统开放接口，提供字段说明、测试账号和权限。', '按合同范围实施人员与身份数据对接。'],
      ['营养管理/健康档案', '对方明确数据来源、更新频率和字段口径。', '完成约定字段同步或结果回传。'],
      ['门禁/停车', '对方提供联调环境和接口文档。', '按业务必要性和合同范围实施。'],
      ['一卡通/财务/支付', '对方提供支付、账户、财务接口及测试权限。', '不承诺合同范围外的无限开发。'],
    ],
    dataSecurityText: '系统通过账号权限、操作日志、数据备份、设备巡检和异常处理机制保障运行可追溯。运维服务按照合同约定范围执行。',
    deliveryResultsText: '交付成果包括系统软件、设备安装调试、基础数据配置、用户培训、验收资料、运维说明和合同约定的附件材料。',
    detailedFunctionsIntro: '详细功能介绍按功能内容、投标响应说明和管理价值/交付边界组织，并与系统截图、设备图片紧邻呈现。',
    supportingEquipmentText: '相关配套设备以分项报价表中的品牌型号、数量和交付范围为准。',
  },
  requiredAssetKeys: SMART_CANTEEN_ASSETS.map(([key]) => key),
  assetDefinitions: assetDefinitionsFromTuples(SMART_CANTEEN_ASSETS),
  validationProfile: {
    quoteTotalWithTax: 135050,
    requiredModels: [
      '康比特 CPT-Nutr-GMPLTF V2.0',
      '康比特 CPT-Nutr-GMSC450-LITE',
      '康比特 CPT-BP001',
      '康比特 CPT-GMPOS200',
      '康比特 CPT-CZSY280',
      '康比特 CPT-FT248',
    ],
    paymentRequiredText: '使用时间 12 个月后无质量问题',
    paymentForbiddenText: '使用时间 3 个月后无质量问题',
    requiredSectionIds: REQUIRED_SECTION_IDS,
  },
  sections: [
    { id: 'cover', title: '封面', level: 0, required: true },
    { id: 'supplier-and-authorized-representative', title: '供应商及授权代表页', level: 1, required: true },
    { id: 'toc', title: '目录', level: 0, required: true },
    { id: 'quote-summary', title: '一、报价一览表', level: 1, required: true },
    { id: 'quote-detail', title: '1-2 分项报价表', level: 2, required: true, parentId: 'quote-summary' },
    { id: 'legal-representative-id', title: '二、法定代表人身份证明', level: 1, required: true },
    { id: 'authorization-letter', title: '三、法定代表人授权委托书', level: 1, required: true },
    { id: 'supplier-basic-info', title: '四、供应商基本情况表', level: 1, required: true },
    { id: 'qualification-documents', title: '五、供应商资格证明文件', level: 1, required: true },
    { id: 'technical-solution', title: '六、技术方案', level: 1, required: true },
    { id: 'project-understanding', title: '项目理解', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'overall-architecture', title: '总体架构', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'core-business-flow', title: '核心业务流程', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'key-function-design', title: '关键功能设计', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'third-party-interface-boundary', title: '第三方接口边界', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'data-security-operations', title: '数据安全与运维设计', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'delivery-results', title: '交付成果', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'detailed-functions', title: '详细功能介绍', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'function-parameter-response', title: '关键功能参数响应', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'supporting-equipment', title: '相关配套设备', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'implementation-plan', title: '七、项目实施方案', level: 1, required: true },
    { id: 'after-sales-plan', title: '八、产品售后方案', level: 1, required: true },
    { id: 'warranty-period', title: '九、质保期', level: 1, required: true },
    { id: 'other-materials', title: '十、其他材料', level: 1, required: true },
    { id: 'contract-case-proof', title: '合同案例证明', level: 2, required: true, parentId: 'other-materials' },
    { id: 'backup-service', title: '后备服务', level: 2, required: true, parentId: 'other-materials' },
  ],
};

const GENERIC_RESPONSE_TEMPLATE = {
  id: GENERIC_RESPONSE_TEMPLATE_ID,
  name: '通用响应文件模板',
  documentTitle: '响应文件',
  industry: '通用项目',
  contentProfile: {
    qualificationSummary: '营业执照、资质证书、体系认证、信用证明、检测报告及采购文件要求的其他证明材料。',
    projectUnderstanding: '本项目按采购需求、响应范围、交付成果和验收要求组织响应文件，重点保持报价、技术、实施、售后和附件材料一致。',
    architectureRows: [
      ['用户入口层', '管理端、业务端、现场使用端', '覆盖项目相关人员的日常操作入口。'],
      ['采集与执行层', '终端设备、业务表单、现场记录', '支撑业务数据采集、过程执行和结果留痕。'],
      ['业务应用层', '配置管理、业务处理、查询统计、异常处理', '按采购范围组织功能，不扩大合同边界。'],
      ['数据与接口层', '基础档案、业务数据、第三方接口', '接口对接以对方系统开放能力、字段说明、测试账号和权限为前提。'],
      ['安全运维层', '权限、日志、备份、巡检', '保障系统可追溯、可维护、可交接。'],
    ],
    flowRows: [
      ['基础配置', '维护项目基础资料、角色权限和业务规则。', '以合同和采购文件确认范围为准。'],
      ['业务办理', '按业务流程记录申请、处理、审核和结果。', '流程节点可按项目约定配置。'],
      ['数据汇总', '形成业务台账、统计报表和过程记录。', '报表口径以双方确认的数据来源为准。'],
      ['异常处理', '记录异常、处理结果和追溯信息。', '不承诺合同范围外的无限开发。'],
    ],
    keyFunctionRows: [
      ['基础资料管理', '维护项目、人员、组织、设备或服务基础信息。', '按项目实例数据初始化。', '保证后续业务处理口径一致。'],
      ['业务流程管理', '支撑采购文件约定的核心办理流程。', '按合同范围交付。', '提高执行过程规范性。'],
      ['统计报表', '形成项目运行、交付、服务和异常统计。', '报表字段以启用模块和数据来源为准。', '支撑验收和运营复盘。'],
    ],
    interfaceRows: [
      ['人员/组织系统', '对方系统开放接口，提供字段说明、测试账号和权限。', '按合同范围实施基础数据对接。'],
      ['业务系统', '对方明确数据来源、更新频率和字段口径。', '完成约定字段同步或结果回传。'],
      ['财务/支付系统', '对方提供接口文档、联调环境和测试权限。', '不承诺合同范围外的无限开发。'],
    ],
    dataSecurityText: '系统通过账号权限、操作日志、数据备份和运维巡检保障运行可追溯，运维服务按照合同约定范围执行。',
    deliveryResultsText: '交付成果包括系统或产品、基础配置、安装调试记录、培训材料、验收资料和合同约定的附件材料。',
    detailedFunctionsIntro: '详细功能介绍按功能内容、投标响应说明和管理价值/交付边界组织，并与系统截图或产品图片紧邻呈现。',
    supportingEquipmentText: '相关配套产品或服务以分项报价表中的名称、型号、数量和交付范围为准。',
  },
  requiredAssetKeys: GENERIC_RESPONSE_ASSETS.map(([key]) => key),
  assetDefinitions: assetDefinitionsFromTuples(GENERIC_RESPONSE_ASSETS),
  validationProfile: {
    requiredSectionIds: REQUIRED_SECTION_IDS,
  },
  sections: [
    { id: 'cover', title: '封面', level: 0, required: true },
    { id: 'supplier-and-authorized-representative', title: '供应商及授权代表页', level: 1, required: true },
    { id: 'toc', title: '目录', level: 0, required: true },
    { id: 'quote-summary', title: '一、报价一览表', level: 1, required: true },
    { id: 'quote-detail', title: '1-2 分项报价表', level: 2, required: true, parentId: 'quote-summary' },
    { id: 'legal-representative-id', title: '二、法定代表人身份证明', level: 1, required: true },
    { id: 'authorization-letter', title: '三、法定代表人授权委托书', level: 1, required: true },
    { id: 'supplier-basic-info', title: '四、供应商基本情况表', level: 1, required: true },
    { id: 'qualification-documents', title: '五、供应商资格证明文件', level: 1, required: true },
    { id: 'technical-solution', title: '六、技术方案', level: 1, required: true },
    { id: 'project-understanding', title: '项目理解', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'overall-architecture', title: '总体架构', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'core-business-flow', title: '核心业务流程', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'key-function-design', title: '关键功能设计', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'third-party-interface-boundary', title: '第三方接口边界', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'data-security-operations', title: '数据安全与运维设计', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'delivery-results', title: '交付成果', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'detailed-functions', title: '详细功能介绍', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'function-parameter-response', title: '关键功能参数响应', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'supporting-equipment', title: '相关配套设备', level: 2, required: true, parentId: 'technical-solution' },
    { id: 'implementation-plan', title: '七、项目实施方案', level: 1, required: true },
    { id: 'after-sales-plan', title: '八、产品售后方案', level: 1, required: true },
    { id: 'warranty-period', title: '九、质保期', level: 1, required: true },
    { id: 'other-materials', title: '十、其他材料', level: 1, required: true },
    { id: 'contract-case-proof', title: '合同案例证明', level: 2, required: true, parentId: 'other-materials' },
    { id: 'backup-service', title: '后备服务', level: 2, required: false, parentId: 'other-materials' },
  ],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stripContentProfile(template) {
  const { contentProfile, ...rest } = template;
  return {
    ...rest,
    contentProfileKeys: Object.keys(contentProfile || {}),
  };
}

function getBidDocumentSchemaDefinitions() {
  return {
    BidDocumentTemplate: {
      required: ['id', 'name', 'documentTitle', 'industry', 'sections', 'requiredAssetKeys', 'validationProfile'],
      fields: {
        id: 'string',
        name: 'string',
        documentTitle: 'string',
        industry: 'string',
        sections: 'BidDocumentSectionTemplate[]',
        requiredAssetKeys: 'string[]',
        assetDefinitions: 'optional BidDocumentAssetDefinition[]; requiredAssetKeys must be declared here when provided by a built-in or custom template',
        validationProfile: 'BidDocumentValidationProfile',
      },
    },
    BidDocumentAssetDefinition: {
      required: ['key', 'title', 'sectionId'],
      fields: {
        key: 'string, unique within template.assetDefinitions',
        title: 'string, default formal caption for this asset',
        sectionId: 'string, must reference a template section',
        type: 'optional image|scan|document; defaults to image in built-in templates',
        required: 'optional boolean; default requirement used by generated assetMap examples',
      },
      validationRules: [
        'assetDefinitions[*].key must be unique and non-empty.',
        'assetDefinitions[*].title and sectionId must not be empty.',
        'assetDefinitions[*].sectionId must exist in template.sections.',
        'Every key in template.requiredAssetKeys must have a matching assetDefinitions entry when assetDefinitions is supplied.',
        'Asset definitions referenced by template.requiredAssetKeys cannot set required=false; requiredAssetKeys is authoritative for formal material collection.',
      ],
    },
    BidDocumentSectionTemplate: {
      required: ['id', 'title', 'level', 'required'],
      fields: {
        id: 'string, unique within template',
        title: 'string, unique within template and rendered as the Word heading',
        level: 'number, 0-3; 0 is cover/toc-like non-heading, 1-3 map to Word Heading 1-3',
        required: 'boolean; required sections cannot be disabled',
        parentId: 'required for level 2/3 sections; must reference an existing direct parent that appears before the child',
      },
      validationRules: [
        'section.id must be unique and non-empty.',
        'section.title must be unique and non-empty.',
        'section.level must be an integer from 0 to 3.',
        'level 2/3 sections must declare parentId.',
        'parentId must reference an existing section whose level is exactly one less than the child level.',
        'parent section must appear before child section in template.sections.',
        'section parent chains must not contain cycles.',
      ],
    },
    BidDocumentProjectData: {
      required: ['templateId', 'projectName', 'purchaserName', 'supplierName', 'totalWithTax', 'totalWithoutTax', 'paymentTerms'],
      fields: {
        templateId: 'string',
        projectName: 'string',
        purchaserName: 'string',
        supplierName: 'string',
        totalWithTax: 'number',
        totalWithoutTax: 'number',
        taxPolicy: 'object',
        paymentTerms: 'BidDocumentPaymentTerm[]',
        disabledSectionIds: 'string[]?',
      },
    },
    BidDocumentTaxPolicy: {
      required: [],
      fields: {
        description: 'optional string; must not contain forbidden placeholder words',
        softwareHardwareRate: 'optional number, for software/hardware tax rate such as 0.13',
        serviceRate: 'optional number, for service tax rate such as 0.06',
        defaultRate: 'optional number, fallback tax rate when no category-specific rate applies',
      },
      validationRules: [
        'Tax policy rate fields must be numbers between 0 and 1 when provided.',
        'quoteItems with category software, hardware, or material must match softwareHardwareRate when both category and taxRate are provided.',
        'quoteItems with category service must match serviceRate when both category and taxRate are provided.',
        'quoteItems with category other must match defaultRate when defaultRate and taxRate are provided.',
      ],
    },
    BidDocumentPaymentTerm: {
      required: ['stage', 'ratio', 'text'],
      fields: {
        stage: 'string, required, rendered in payment terms table and scanned for forbidden words',
        ratio: 'number, required; all payment term ratios must sum to 100',
        text: 'string, required, rendered in payment terms table and scanned for required/forbidden profile text',
      },
      validationRules: [
        'paymentTerms must be a non-empty array.',
        'paymentTerms[*].stage and paymentTerms[*].text must not be empty.',
        'paymentTerms[*].ratio must be a positive number.',
        'all payment term ratios must sum to 100.',
        'template validationProfile.paymentRequiredText must appear in stage+text when configured.',
        'template validationProfile.paymentForbiddenText must not appear in stage+text when configured.',
      ],
    },
    BidDocumentValidationProfile: {
      required: ['requiredSectionIds'],
      fields: {
        requiredSectionIds: 'non-empty string[]; every id must exist in template.sections and be marked required=true',
        quoteTotalWithTax: 'optional number > 0; when set, project totalWithTax must match this value',
        requiredModels: 'optional string[]; each listed model must appear in quoteItems.brandModel',
        paymentRequiredText: 'optional non-empty string; must appear in paymentTerms stage+text',
        paymentForbiddenText: 'optional non-empty string; must not appear in paymentTerms stage+text',
        requiredDocumentTitleText: 'optional non-empty string; must appear in template.documentTitle/project title checks',
      },
      validationRules: [
        'requiredSectionIds must be a non-empty array with no empty or duplicate ids.',
        'requiredSectionIds entries must exist in template.sections and those sections must be required=true.',
        'quoteTotalWithTax, when configured, must be greater than 0.',
        'requiredModels, when configured, must be an array with no empty or duplicate model names.',
        'paymentRequiredText, paymentForbiddenText, and requiredDocumentTitleText must be non-empty when configured.',
      ],
    },
    BidDocumentQuoteItem: {
      required: ['name', 'quantity', 'brandModel', 'unitPriceWithTax', 'totalWithTax'],
      fields: {
        name: 'string',
        quantity: 'number',
        brandModel: 'string',
        unitPriceWithTax: 'number',
        totalWithTax: 'number',
        taxRate: 'number?',
        category: 'software|hardware|service|material|other?',
      },
      validationRules: [
        'quantity, unitPriceWithTax, and totalWithTax must be positive numbers.',
        'quantity * unitPriceWithTax must equal totalWithTax after currency rounding.',
        'category, when provided, must be software|hardware|service|material|other.',
        'taxRate, when provided, must be a number between 0 and 1 and match projectData.taxPolicy for its category.',
      ],
    },
    BidDocumentAssetRef: {
      required: ['key', 'title', 'filePath', 'type', 'required', 'sectionId'],
      fields: {
        key: 'string',
        title: 'string',
        filePath: 'string',
        type: 'image|scan|document; required formal proof materials must use image or scan',
        required: 'boolean',
        sectionId: 'string',
        templateId: 'string?',
      },
      validationRules: [
        'assetMap.<key>.key must equal <key>.',
        'assetMap.<key>.title and sectionId must not be empty.',
        'assetMap.<key>.required must be a boolean; string values such as "false" are invalid and never used as requirement flags.',
        'sectionId must exist in the selected template sections.',
        'required assets, including keys listed in template.requiredAssetKeys, must use type=image or type=scan so they are inserted into Word as real pictures.',
        'type=document is allowed only for optional original files; document assets are listed by filename and are not counted as embedded Word images.',
      ],
    },
    BidDocumentBuildLog: {
      required: ['passed', 'errors', ...BID_DOCUMENT_PREFLIGHT_CHECK_KEYS],
      fields: {
        passed: 'boolean',
        errors: 'string[]',
        outputPath: 'string?',
        ...validationResultFieldsFor(BID_DOCUMENT_PREFLIGHT_CHECK_KEYS),
        ...validationResultFieldsFor(BID_DOCUMENT_POST_GENERATION_CHECK_KEYS),
        ...validationResultFieldsFor(BID_DOCUMENT_IMPORT_CHECK_KEYS),
      },
      preflightCheckKeys: BID_DOCUMENT_PREFLIGHT_CHECK_KEYS,
      postGenerationCheckKeys: BID_DOCUMENT_POST_GENERATION_CHECK_KEYS,
      importCheckKeys: BID_DOCUMENT_IMPORT_CHECK_KEYS,
      validationRules: [
        'Preflight build logs always include every preflightCheckKeys entry.',
        'When preflight fails, postGenerationCheckKeys entries remain present with errors=["not_run"].',
        'When a Word file is written, postGenerationCheckKeys entries contain the real generated-docx checks.',
        'Import workflows may include importCheckKeys entries such as quoteResolutionCheck for material-package quote decisions.',
        'The build fails when any BidDocumentValidationResult in either check group has passed=false.',
      ],
    },
    BidDocumentReadinessReport: {
      required: [
        'ready',
        'templateId',
        'projectName',
        'purchaserName',
        'supplierName',
        'quoteTotal',
        'targetTotal',
        'quoteDifference',
        'quoteReconciliation',
        'quoteResolutionActions',
        'assetPackage',
        'assetInventory',
        'blockers',
        'missingAssets',
        'checks',
        'buildLog',
      ],
      fields: {
        ready: 'boolean; true only when buildLog.passed=true and no formal-build blockers remain',
        templateId: 'string',
        projectName: 'string',
        purchaserName: 'string',
        supplierName: 'string',
        quoteTotal: 'number; sum of quoteItems.totalWithTax',
        targetTotal: 'number; projectData.totalWithTax',
        quoteDifference: 'number; targetTotal - quoteTotal',
        quoteReconciliation: 'BidDocumentQuoteReconciliation',
        quoteResolutionActions: 'BidDocumentQuoteResolutionAction[]',
        assetPackage: 'object|null; sidecar/demo/material-package metadata preserved from project config',
        assetInventory: 'BidDocumentAssetInventoryItem[]',
        blockers: 'Record<string, string[]>; grouped formal-build blockers',
        missingAssets: 'BidDocumentMissingAsset[]',
        checks: 'BidDocumentReadinessCheckSummary[]',
        buildLog: 'BidDocumentBuildLog',
      },
      cliFieldAliases: {
        templateId: 'template_id',
        projectName: 'project_name',
        purchaserName: 'purchaser_name',
        supplierName: 'supplier_name',
        quoteTotal: 'quote_total',
        targetTotal: 'target_total',
        quoteDifference: 'quote_difference',
        quoteReconciliation: 'quote_reconciliation',
        quoteResolutionActions: 'quote_resolution_actions',
        assetPackage: 'asset_package',
        assetInventory: 'asset_inventory',
        missingAssets: 'missing_assets',
        buildLog: 'build_log',
      },
      validationRules: [
        'Desktop reports use camelCase fields; CLI reports keep snake_case aliases for compatibility.',
        'quoteDifference is positive when quoteItems total is lower than projectData.totalWithTax.',
        'assetInventory includes only assets attached to enabled sections or unknown sections that must be fixed.',
        'demoOnly asset packages must appear as demoAssets blockers and assetCheck errors.',
        'checks entries are derived from BidDocumentBuildLog *Check fields and use status passed|failed|not_run.',
      ],
    },
    BidDocumentQuoteReconciliation: {
      required: ['items', 'quoteTotal', 'computedQuoteTotal', 'targetTotal', 'quoteDifference', 'rowDifferenceTotal'],
      fields: {
        items: 'BidDocumentQuoteReconciliationItem[]',
        quoteTotal: 'number; sum of declaredTotalWithTax',
        computedQuoteTotal: 'number; sum of quantity * unitPriceWithTax',
        targetTotal: 'number; projectData.totalWithTax',
        quoteDifference: 'number; targetTotal - quoteTotal',
        rowDifferenceTotal: 'number; sum of declaredTotalWithTax - computedTotalWithTax by row',
      },
    },
    BidDocumentQuoteReconciliationItem: {
      required: ['index', 'name', 'brandModel', 'quantity', 'unitPriceWithTax', 'declaredTotalWithTax', 'computedTotalWithTax', 'difference', 'status'],
      fields: {
        index: 'number, 1-based',
        name: 'string',
        brandModel: 'string',
        quantity: 'number',
        unitPriceWithTax: 'number',
        declaredTotalWithTax: 'number',
        computedTotalWithTax: 'number',
        difference: 'number; declaredTotalWithTax - computedTotalWithTax',
        taxRate: 'optional number|string',
        category: 'optional string',
        status: 'passed|failed',
      },
    },
    BidDocumentQuoteResolutionAction: {
      required: ['key', 'title', 'action'],
      fields: {
        key: 'confirm_project_total|add_confirmed_quote_item|correct_existing_quote_items',
        title: 'string',
        action: 'string; human action required before the generator changes formal quote data',
      },
    },
    BidDocumentAssetInventoryItem: {
      required: ['key', 'title', 'sectionId', 'sectionTitle', 'required', 'type', 'filePath', 'status', 'suggestedFileName', 'collectionNote'],
      fields: {
        key: 'string',
        title: 'string',
        sectionId: 'string',
        sectionTitle: 'string',
        required: 'boolean',
        type: 'image|scan|document',
        filePath: 'string',
        status: 'present|demo_only|missing_required|missing_optional',
        suggestedFileName: 'string',
        collectionNote: 'string',
      },
    },
    BidDocumentMissingAsset: {
      required: ['key', 'title', 'sectionId', 'required', 'filePath'],
      fields: {
        key: 'string',
        title: 'string',
        sectionId: 'string',
        required: 'boolean',
        filePath: 'string',
      },
    },
    BidDocumentReadinessCheckSummary: {
      required: ['key', 'passed', 'status', 'errors', 'details'],
      fields: {
        key: 'string; a BidDocumentBuildLog *Check field name',
        passed: 'boolean',
        status: 'passed|failed|not_run',
        errors: 'string[]',
        details: 'object',
      },
    },
    BidDocumentValidationResult: {
      required: ['passed', 'errors', 'details'],
      fields: {
        passed: 'boolean',
        errors: 'string[]; empty when passed=true, otherwise machine-readable or human-readable blocker strings',
        details: 'object; check-specific counters, missing keys, totals, placements, or extracted docx facts',
      },
    },
  };
}

function getBidDocumentTemplates() {
  return [clone(SMART_CANTEEN_TEMPLATE), clone(GENERIC_RESPONSE_TEMPLATE)];
}

function getBidDocumentTemplate(templateId = DEFAULT_BID_DOCUMENT_TEMPLATE_ID) {
  const normalizedTemplateId = String(templateId || DEFAULT_BID_DOCUMENT_TEMPLATE_ID).trim();
  const template = getBidDocumentTemplates().find((item) => item.id === normalizedTemplateId);
  return template ? clone(template) : null;
}

function assertKnownBidDocumentTemplate(templateId = DEFAULT_BID_DOCUMENT_TEMPLATE_ID) {
  const normalizedTemplateId = String(templateId || DEFAULT_BID_DOCUMENT_TEMPLATE_ID).trim();
  const template = getBidDocumentTemplate(normalizedTemplateId);
  if (!template) {
    const availableTemplateIds = getBidDocumentTemplates().map((item) => item.id);
    const error = new Error(`Unknown bid document template id: ${normalizedTemplateId}`);
    error.code = 'unknown_template_id';
    error.templateId = normalizedTemplateId;
    error.availableTemplateIds = availableTemplateIds;
    throw error;
  }
  return template;
}

function getSmartCanteenProjectData() {
  return {
    templateId: SMART_CANTEEN_TEMPLATE_ID,
    projectName: '智慧餐厅称重系统改造',
    purchaserName: '北京蓝色港湾科技有限责任公司',
    supplierName: '北京康比特体育科技股份有限公司',
    totalWithTax: 135050,
    totalWithoutTax: 119630.15,
    taxPolicy: {
      softwareHardwareRate: 0.13,
      serviceRate: 0.06,
    },
    paymentTerms: [
      { stage: '设备到现场', ratio: 30, text: '设备到现场支付合同总价款的 30%。' },
      { stage: '设备调试合格', ratio: 20, text: '设备调试合格后支付合同总价款的 20%。' },
      { stage: '使用 12 个月', ratio: 45, text: '使用时间 12 个月后无质量问题，支付总价款的 45%。' },
      { stage: '质保期结束', ratio: 5, text: '质保期结束，无质量问题 10 日内支付总价款的 5% 质保金。' },
    ],
  };
}

function getSmartCanteenQuoteItems() {
  return clone(SMART_CANTEEN_QUOTE_ITEMS);
}

function getGenericProjectData() {
  return {
    templateId: GENERIC_RESPONSE_TEMPLATE_ID,
    projectName: '通用完整标书样例项目',
    purchaserName: '样例采购人',
    supplierName: '样例供应商',
    totalWithTax: 300,
    totalWithoutTax: 265.49,
    taxPolicy: {
      softwareHardwareRate: 0.13,
      serviceRate: 0.06,
    },
    paymentTerms: [
      { stage: '到货', ratio: 50, text: '设备到现场支付合同总价款的 50%。' },
      { stage: '验收', ratio: 50, text: '设备调试合格后支付合同总价款的 50%。' },
    ],
  };
}

function getGenericQuoteItems() {
  return [
    { name: '样例管理系统', quantity: 1, brandModel: 'GEN-SYS V1.0', unitPriceWithTax: 100, totalWithTax: 100, taxRate: 0.13, category: 'software' },
    { name: '样例终端设备', quantity: 2, brandModel: 'GEN-DEVICE-100', unitPriceWithTax: 100, totalWithTax: 200, taxRate: 0.13, category: 'hardware' },
  ];
}

function createAssetMapFromTemplate(template = {}, overrides = {}) {
  const templateId = String(template.id || '').trim();
  const requiredAssetKeys = new Set((Array.isArray(template.requiredAssetKeys) ? template.requiredAssetKeys : [])
    .map((key) => String(key || '').trim())
    .filter(Boolean));
  const assetDefinitions = Array.isArray(template.assetDefinitions) ? template.assetDefinitions : [];
  const fallbackSectionId = (Array.isArray(template.sections) ? template.sections : [])
    .find((section) => String(section?.id || '').trim() === 'other-materials')?.id
    || (Array.isArray(template.sections) ? template.sections : [])
      .find((section) => Number(section?.level) >= 1)?.id
    || 'other-materials';

  const assetMap = Object.fromEntries(assetDefinitions.map((definition) => {
    const key = String(definition?.key || '').trim();
    const override = overrides[key] || {};
    return [key, {
      key,
      title: definition.title,
      filePath: '',
      type: definition.type || 'image',
      required: requiredAssetKeys.has(key) || definition.required === true,
      sectionId: definition.sectionId,
      templateId,
      ...override,
    }];
  }).filter(([key]) => key));

  Object.entries(overrides || {}).forEach(([key, asset]) => {
    if (assetMap[key]) return;
    assetMap[key] = {
      key,
      filePath: '',
      type: 'image',
      required: false,
      sectionId: fallbackSectionId,
      templateId,
      ...asset,
    };
  });
  return assetMap;
}

function getSmartCanteenAssetMap(overrides = {}) {
  return createAssetMapFromTemplate(SMART_CANTEEN_TEMPLATE, overrides);
}

function getGenericAssetMap(overrides = {}) {
  return createAssetMapFromTemplate(GENERIC_RESPONSE_TEMPLATE, overrides);
}

function createSmartCanteenSample(overrides = {}) {
  return {
    template: assertKnownBidDocumentTemplate(SMART_CANTEEN_TEMPLATE_ID),
    projectData: {
      ...getSmartCanteenProjectData(),
      ...(overrides.projectData || {}),
    },
    quoteItems: overrides.quoteItems ? clone(overrides.quoteItems) : getSmartCanteenQuoteItems(),
    assetMap: getSmartCanteenAssetMap(overrides.assetMap || {}),
  };
}

function createGenericSample(overrides = {}) {
  return {
    template: assertKnownBidDocumentTemplate(GENERIC_RESPONSE_TEMPLATE_ID),
    projectData: {
      ...getGenericProjectData(),
      ...(overrides.projectData || {}),
    },
    quoteItems: overrides.quoteItems ? clone(overrides.quoteItems) : getGenericQuoteItems(),
    assetMap: getGenericAssetMap(overrides.assetMap || {}),
  };
}

function createBidDocumentSample(overrides = {}) {
  const templateId = overrides.templateId || overrides.template?.id || overrides.projectData?.templateId || DEFAULT_BID_DOCUMENT_TEMPLATE_ID;
  if (overrides.template && typeof overrides.template === 'object') {
    const fallback = templateId === SMART_CANTEEN_TEMPLATE_ID
      ? createSmartCanteenSample({})
      : createGenericSample({});
    const customTemplate = clone(overrides.template);
    return {
      template: customTemplate,
      projectData: overrides.projectData ? clone(overrides.projectData) : {
        ...fallback.projectData,
        templateId,
      },
      quoteItems: overrides.quoteItems ? clone(overrides.quoteItems) : fallback.quoteItems,
      assetMap: Object.keys(overrides.assetMap || {}).length
        ? createAssetMapFromTemplate(customTemplate, overrides.assetMap || {})
        : createAssetMapFromTemplate(customTemplate),
    };
  }
  if (templateId === GENERIC_RESPONSE_TEMPLATE_ID) {
    return createGenericSample(overrides);
  }
  assertKnownBidDocumentTemplate(templateId);
  return createSmartCanteenSample(overrides);
}

function getBidDocumentTemplateInfo(templateId = '') {
  const templates = getBidDocumentTemplates();
  const selectedTemplates = templateId
    ? templates.filter((template) => template.id === templateId)
    : templates;

  if (!selectedTemplates.length) {
    return {
      ok: false,
      error: 'unknown_template_id',
      template_id: templateId,
      available_template_ids: templates.map((template) => template.id),
    };
  }

  return {
    ok: true,
    template_id: templateId,
    available_template_ids: templates.map((template) => template.id),
    schema: getBidDocumentSchemaDefinitions(),
    templates: selectedTemplates.map((template) => {
      const sample = createBidDocumentSample({ templateId: template.id });
      return {
        template: stripContentProfile(template),
        sample_project_data: sample.projectData,
        sample_quote_items: sample.quoteItems,
        asset_mapping_example: sample.assetMap,
        section_count: template.sections.length,
        required_asset_count: template.requiredAssetKeys.length,
      };
    }),
  };
}

function getBidDocumentProjectConfigSchema(templateId = '') {
  const templates = getBidDocumentTemplates();
  const selectedTemplate = templateId ? getBidDocumentTemplate(templateId) : null;
  const selectedSections = selectedTemplate?.sections || [];
  const selectedAssetMap = selectedTemplate ? createBidDocumentSample({ templateId: selectedTemplate.id }).assetMap : {};
  return {
    version: 1,
    title: 'Bid document project config schema',
    templateId: selectedTemplate?.id || templateId || '',
    availableTemplateIds: templates.map((template) => template.id),
    defaultTemplateId: DEFAULT_BID_DOCUMENT_TEMPLATE_ID,
    required: ['version', 'templateId', 'projectData', 'quoteItems', 'assetMap'],
    topLevelFields: {
      version: 'number, must be 1',
      exportedAt: 'optional ISO datetime string',
      templateId: 'string, must match projectData.templateId and selected template',
      projectData: 'BidDocumentProjectData',
      quoteItems: 'BidDocumentQuoteItem[]',
      assetMap: 'Record<string, BidDocumentAssetRef>',
      assetPackage: 'optional sidecar-directory or material-collection-package metadata',
    },
    projectDataFields: {
      templateId: 'string, must match top-level templateId',
      projectName: 'string',
      purchaserName: 'string',
      supplierName: 'string',
      totalWithTax: 'number > 0',
      totalWithoutTax: 'number > 0 and <= totalWithTax',
      taxPolicy: 'optional BidDocumentTaxPolicy',
      paymentTerms: 'BidDocumentPaymentTerm[], ratios must sum to 100',
      disabledSectionIds: 'optional string[] of optional section ids',
    },
    paymentTermFields: {
      stage: 'string, required, rendered in payment table',
      ratio: 'number > 0; all payment term ratios must sum to 100',
      text: 'string, required, rendered in payment table and scanned by payment profile checks',
    },
    paymentTermValidationRules: [
      'paymentTerms must be a non-empty array.',
      'paymentTerms[*].stage and paymentTerms[*].text must be non-empty strings.',
      'paymentTerms[*].ratio must be positive and all ratios must sum to 100.',
      'Configured paymentRequiredText must be present in paymentTerms stage+text.',
      'Configured paymentForbiddenText must be absent from paymentTerms stage+text.',
    ],
    quoteItemFields: {
      name: 'string',
      quantity: 'number > 0',
      brandModel: 'string',
      unitPriceWithTax: 'number > 0',
      totalWithTax: 'number > 0, must equal quantity * unitPriceWithTax',
      taxRate: 'optional number between 0 and 1; when category and matching tax policy rate are present, taxRate must match that policy rate',
      category: 'optional software|hardware|service|material|other; software/hardware/material map to softwareHardwareRate, service maps to serviceRate, other maps to defaultRate',
    },
    assetRefFields: {
      key: 'string, required, must equal its assetMap object key',
      title: 'string, required, formal caption inserted before the asset image',
      filePath: 'string, absolute path or relative path from this config file; image/scan file signature must match extension',
      type: 'image|scan|document, required; image/scan are embedded as pictures; document is allowed only for optional original files and is checked as a real file/listed by filename',
      required: 'boolean',
      sectionId: 'string, required, must exist in the selected template sections',
      templateId: 'optional string, must match top-level templateId when present',
    },
    assetRefValidationRules: [
      'assetMap.<key>.key must equal <key>.',
      'assetMap.<key>.title must not be empty.',
      'assetMap.<key>.type must be one of image, scan, document.',
      'assetMap.<key>.required must be boolean.',
      'assetMap.<key>.sectionId must exist in the selected template sections.',
      'Every key listed in template.requiredAssetKeys must exist as an assetMap record; otherwise validation returns missing_required_asset_mapping.',
      'Template packages should also declare those required keys in template.assetDefinitions so project config and material package examples expose a补料入口.',
      'template.requiredAssetKeys is authoritative; matching assetMap rows are treated as required even if a template asset definition was accidentally marked optional.',
      'Required assets must use type=image or type=scan so formal proof materials are inserted into Word as real pictures.',
      'Assets attached to disabled optional sections are not inserted, file-checked, or scanned for forbidden words until that section is enabled.',
      `image/scan assets must use ${supportedImageExtensionsText()} and the file header must match the extension.`,
      'optional document assets must point to a real non-empty file; they are listed by filename and are not counted as embedded Word images.',
    ],
    sectionTemplateValidationRules: [
      'section.id and section.title must be unique and non-empty.',
      'section.level must be an integer from 0 to 3; levels 1-3 map to Word heading styles.',
      'level 2/3 sections must declare parentId, and parentId must reference an existing direct parent section.',
      'parent sections must appear before child sections, and parent chains must not contain cycles.',
    ],
    buildLogFields: {
      passed: 'boolean',
      errors: 'string[]',
      preflightCheckKeys: BID_DOCUMENT_PREFLIGHT_CHECK_KEYS,
      postGenerationCheckKeys: BID_DOCUMENT_POST_GENERATION_CHECK_KEYS,
      importCheckKeys: BID_DOCUMENT_IMPORT_CHECK_KEYS,
      validationResultShape: 'BidDocumentValidationResult',
    },
    readinessReportFields: {
      desktopShape: 'BidDocumentReadinessReport with camelCase fields',
      cliShape: 'same report with snake_case aliases documented in BidDocumentReadinessReport.cliFieldAliases',
      quoteReconciliation: 'BidDocumentQuoteReconciliation; row-level and project-level quote differences',
      quoteResolutionActions: 'BidDocumentQuoteResolutionAction[]; manual actions for unresolved quote differences',
      assetInventory: 'BidDocumentAssetInventoryItem[]; full material collection list for enabled sections',
      blockers: 'Record<string, string[]> grouped by quote/payment/identity/forbiddenWords/assets/sections/template/demoAssets/other',
      checks: 'BidDocumentReadinessCheckSummary[] derived from buildLog check fields',
      buildLog: 'BidDocumentBuildLog',
    },
    assetTypeEnum: ['image', 'scan', 'document'],
    allowedSectionIds: selectedSections.map((section) => section.id),
    allowedSectionTitles: Object.fromEntries(selectedSections.map((section) => [section.id, section.title])),
    requiredAssetKeys: selectedTemplate?.requiredAssetKeys || [],
    assetMappingExample: selectedAssetMap,
    assetPackageFields: {
      type: 'optional sidecar-directory|material-collection-package',
      path: 'optional relative path from this config file',
      demoOnly: 'optional boolean; true blocks formal Word export',
      copiedCount: 'optional number',
      assets: 'optional copied asset list',
    },
    validationNotes: [
      'Do not edit generated schema files into project config files.',
      'Do not use demoOnly assets for formal Word export.',
      'Relative asset paths are resolved from the project config JSON directory.',
      'Quote rows are authoritative; the generator does not invent missing quote differences.',
      'The reader rejects missing top-level templateId, projectData.templateId, quoteItems[], or assetMap{} instead of falling back to template sample data.',
      'The reader rejects top-level templateId and projectData.templateId mismatches before validation, material-package, readiness-report, or Word-build side effects.',
      'The reader rejects unsupported project config versions; version must be 1.',
      `Default no-template calls use ${DEFAULT_BID_DOCUMENT_TEMPLATE_ID}; project-specific blueprints such as ${SMART_CANTEEN_TEMPLATE_ID} must be selected explicitly.`,
    ],
    schema: getBidDocumentSchemaDefinitions(),
  };
}

module.exports = {
  GENERIC_RESPONSE_TEMPLATE_ID,
  DEFAULT_BID_DOCUMENT_TEMPLATE_ID,
  SMART_CANTEEN_TEMPLATE_ID,
  assertKnownBidDocumentTemplate,
  createBidDocumentSample,
  createGenericSample,
  createSmartCanteenSample,
  getBidDocumentSchemaDefinitions,
  getBidDocumentProjectConfigSchema,
  getBidDocumentTemplate,
  getBidDocumentTemplateInfo,
  getBidDocumentTemplates,
  getGenericAssetMap,
  getGenericProjectData,
  getGenericQuoteItems,
  getSmartCanteenAssetMap,
  getSmartCanteenProjectData,
  getSmartCanteenQuoteItems,
};
