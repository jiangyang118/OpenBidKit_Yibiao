# OpenBidKit_Yibiao 全量待开发计划

本文档用于给后续 Codex 迭代直接派工。执行任何条目前，先阅读 `AGENTS.md`、`design.md`、`client/开发说明.md`，不要读取 `archive/`。

## 0. 当前 P0：通用标书生成器

状态：`generic_ready_sample_blocked`，本节为 2026-06-18 新增计划。通用标书生成器的基础路由、模板包、schema、SQLite 持久化、校验层、Word builder、通用样本文档脚本和页面流程已进入代码实现；完整标书页面已改为“模板选择—项目数据—附件资产—模板预览—生成与校验”的步骤式工作流；Word builder 已改为按模板包 `sections` 顺序渲染，并通过 `contentProfile` 隔离智慧食堂专用表达与通用模板表达；模板预览支持启用/关闭模板声明的可选章节，必选章节不能关闭，Word 仅渲染启用章节；生成前已校验模板包定义、报价、付款、主体、必填附件、启用章节内已引用可选附件、附件标题、禁用词、章节启用配置和必备章节，并会拦截“请填写”等未完成提示；生成后已校验 docx 可打开、正文内容、章节顺序、模板外标题、正式表格、报价与付款表格完整性、A4 页面与页脚页码、可更新目录字段、标题/表头样式、技术方案表达密度、关键章节分页、启用章节内所有已引用附件标题、图片插入数量与关系、附件标题与图片邻接排版、禁用词，已关闭可选章节下的可选附件不参与预校验和成品强制插入校验，挂到未知章节的附件仍会失败；桌面端构建日志已区分“预校验失败”和“生成后检查未运行”，`not_run` 后置检查显示为“未运行”而不是“未通过”；已新增参考响应文件 docx 结构分析器和 CLI 命令，可在样本文档到位后自动提取标题、表格、图片关系、分页、目录字段、页脚页码和页面设置，并可用 `--candidate` 对比生成成品，输出缺失/新增标题、缺失表头、图片/分页/目录/页脚计数不足和页面设置差异，减少手工对齐成本；桌面端生成与校验页已通过 `window.yibiao.bidDocument.analyzeReference()` 暴露“选择参考并对齐”入口，可用最近导出的候选 Word 与官方参考响应文件做同一套结构对齐；CLI 已新增 `bid-document-template-info`，可从真实模板注册表导出 schema、章节树、默认项目数据、报价行和 asset mapping 示例，并已生成 `output/bid-document-samples/smart-canteen-template-info.json` 作为当前智慧食堂蓝本的可读证据；桌面端模板选择页也已通过 `window.yibiao.bidDocument.exportTemplateInfo()` 暴露“导出模板配置 JSON”按钮，与 CLI 复用同一份模板信息构造函数；桌面端顶部操作区已新增 `exportProjectConfig` / `importProjectConfig` 项目配置 JSON 导入导出，支持把当前模板、项目数据、付款条款、分项报价和附件映射在不同项目/机器间迁移；导出项目配置时会把已存在的附件复制到同名 `.assets` sidecar 目录并在 JSON 中写入相对路径，同时写出同名 `.schema.json`；导入项目配置和 CLI 配置校验都会按配置文件位置解析相对附件路径；导入项目配置后会立即运行同一套预校验并持久化 build log，导入成功但校验未通过时在页面构建日志中直接展示缺失附件、报价不一致或禁用词等问题；桌面导入和 CLI 校验/构建/缺口报告/材料包流程都会校验项目配置 `version=1`，不支持的配置版本以 `unsupported_project_config_version` 失败且不导入、不生成 Word、不写出派生文件；项目配置读取层同时要求顶层 `templateId`、`projectData.templateId`、`quoteItems[]` 和 `assetMap{}` 存在，缺字段会以 `invalid_project_config` 失败，不再用模板样例项目数据、报价或附件兜底；CLI 已新增 `bid-document-validate-config`，可对导出/导入的项目配置 JSON 复用真实校验服务输出 build log，不生成 Word，并已生成 `output/bid-document-samples/generic-response-project-config.json` 与 `output/bid-document-samples/generic-response-project-config.validation.json` 作为通用模板校验证据；CLI `bid-document-init-config` 会同步写出项目配置 schema，说明项目数据、报价行、附件映射、demo 附件包和相对路径规则；CLI 已新增 `bid-document-readiness-report`，可从同一套真实校验服务导出正式构建准备度 JSON、Markdown 和 Excel 阻断清单，面向业务侧补齐报价确认、附件扫描件和 demo 资产替换；桌面端完整标书顶部操作区已新增“导出缺口报告”，通过 `window.yibiao.bidDocument.exportReadinessReport()` 复用同一套项目校验并导出 Markdown、JSON 与同名 Excel 清单，同时把准备度 build log 回写到页面构建日志；导出缺口报告成功后页面会自动切到“生成与校验”，展示当前准备度状态和最近一次缺口报告的 Markdown、JSON、Excel 路径，便于用户直接找到交付给商务/交付补齐的文件；准备度 Excel workbook 生成逻辑已抽到 `bidDocumentReadinessReport.cjs`，CLI 和桌面端共用同一份六 sheet/微软雅黑样式实现，包含“报价核对”和“附件清单”全量 sheet，并在 JSON/Markdown 中输出 `quoteReconciliation` / `quote_reconciliation` 与 `assetInventory` / `asset_inventory`；`assetPackage.demoOnly=true` 时附件清单会把 sidecar 文件标记为“演示附件”，避免业务误判为真实材料已齐；桌面端已把 `assetPackage` 写入 SQLite `bid_document_state.asset_package_json`，导入、校验、准备度报告和正式 Word 导出都会保留 `demoOnly` 标记，业务预校验通过后仍会以 `demo_assets_not_allowed_for_formal_build` 阻断演示附件包生成正式 Word；材料收集包导出会把 `quote-resolution.json` 路径返回桌面页面，导入材料包后页面会展示报价决策是否应用、动作和错误，避免用户填完报价决策文件后只能从 toast 或构建日志推断结果；`quote-resolution.json` 导入已增加动作级数据形态校验，确认项目总价、新增真实分项、修正已有报价行三类动作必须分别匹配 `projectDataPatch`、`quoteItemsAppend`、`quoteItemsReplacement`，动作和数据不匹配时只写错误并拒绝应用，防止人工或脚本误把未经确认的差额行合入报价；材料包同步生成 `quote-resolution.schema.json`，写明 `selectedAction` 枚举、各动作允许/禁止的数据区和报价行字段要求，桌面页面和 CLI 输出都会返回 schema 路径，导入时也会校验 `quote-resolution.json` 的 version 与 templateId，防止跨模板报价决策误用；材料包 manifest、Markdown、桌面状态卡和 CLI 输出新增 `replacementRequiredAssetCount` / `replacement_required_asset_count`，把“需替换演示附件”从“必填缺失”中单独标出，避免业务误把 demo sidecar 材料当成正式齐套附件；材料包同步生成 `asset-manifest.schema.json` 并把路径返回桌面页面和 CLI，导入时会拒绝不支持的 `asset-manifest.json` version，防止手改或旧版材料包静默回填；材料包导入会校验 `targetFile` 只能指向材料包目录内的相对文件，并用真实路径复核符号链接不能越界，防止手改 manifest 后把包外文件回填为正式附件；附件预校验新增图片文件头校验，`.png/.jpg/.jpeg/.gif/.bmp` 必须与真实文件签名匹配，避免文本文件改扩展名后被当作正式扫描件或截图进入构建；附件映射预校验新增结构校验，`assetMap` 的记录 key 必须与 `asset.key` 一致，`title`、`type`、`sectionId` 必填，`type` 只能为 `image|scan|document`，`sectionId` 必须指向模板章节，避免附件标题空白、错挂章节或类型错写后进入正式构建；智慧食堂正式样本文档仍等待用户提供《国家康复辅具研究中心智慧食堂项目响应文件.docx》、真实附件资产，以及确认当前分项报价合计 133050 与目标总价 135050 的差额处理。核心生成器必须保持通用，不得把项目名称、采购人、供应商、报价、型号、附件清单写死到引擎层。

### 0.1 背景与定位

现状问题：

- 现有 Word 标书生成链路更接近“AI 扩写的技术文件”，容易生成空泛承诺、占位符、待完善痕迹和不可信报价拆分。
- 当前 `bid-generation` 二级入口只有“生成技术方案 / 已有方案扩写 / 商务标”，缺少一次性生成完整标书/响应文件的入口。
- 技术方案五步流程可以复用页面骨架，但完整标书不能继续依赖自由生成大段正文，必须改成模板包、项目数据、表格、附件和校验驱动。

目标：

- 在“标书生成”二级菜单新增“生成完整标书”按钮，页面交互参考 `TechnicalPlanHome` 五步流程。
- 生成可递交的 Word 标书/响应文件，不输出“投标技术文件”“内容由 AI 生成”等 AI 痕迹。
- 支持不同项目通过模板包切换文档结构、章节顺序、报价口径、付款条款、资质附件组织和技术方案表达密度。
- 以用户提供的智慧食堂正式样本文档作为首个 `smart-canteen-response` 模板包和验收样例。

### 0.2 前置输入

必须输入：

- 用户稍后提供的正式参考样本文档：《国家康复辅具研究中心智慧食堂项目响应文件.docx》。
- 当前智慧食堂蓝本项目数据，作为首个模板实例的默认样例，不进入核心生成器硬编码：
  - 项目名称：智慧餐厅称重系统改造
  - 采购人：北京蓝色港湾科技有限责任公司
  - 供应商：北京康比特体育科技股份有限公司
  - 报价含税总价：135050 元
  - 不含税金额：119630.15 元
  - 税率口径：软硬件 13%，实施服务 6%
  - 付款方式：设备到现场 30%，设备调试合格 20%，使用时间 12 个月后无质量问题 45%，质保期结束无质量问题 10 日内支付 5% 质保金。
- 智慧食堂蓝本分项报价数据，作为首个模板实例的默认样例，不进入核心生成器硬编码：
  - 智慧食堂管理系统含手机端，数量 1，康比特 CPT-Nutr-GMPLTF V2.0，含税单价 15000，含税总价 15000。
  - 智能称重设备，数量 30，康比特 CPT-Nutr-GMSC450-LITE，含税单价 3000，含税总价 90000。
  - 智能绑盘机，数量 1，康比特 CPT-BP001，含税单价 4300，含税总价 4300。
  - 双屏消费机，数量 3，康比特 CPT-GMPOS200，含税单价 3650，含税总价 10950。
  - 称重消费机，数量 1，康比特 CPT-CZSY280，含税单价 4000，含税总价 4000。
  - 托盘，数量 400，康比特 CPT-FT248，含税单价 22，含税总价 8800。
- 当前已知数据问题：上述 6 行分项报价合计为 133050 元，与目标报价含税总价 135050 元不一致；生成器必须阻断正式智慧食堂 Word 输出，直到人工确认差额处理方式。

通用输入能力：

- 支持新建项目时录入或导入项目基础信息、采购人、供应商、报价汇总、分项报价、付款条款、资质材料、产品/服务材料、合同案例和附件。
- 支持选择模板包，例如 `smart-canteen-response`，后续可扩展为 `software-service-response`、`hardware-supply-response`、`generic-government-response` 等。
- 支持从已有技术方案流程、商务标流程、图片知识库和文档知识库读取可复用数据，但生成器最终以本项目实例数据为权威。

### 0.3 UI 与路由任务

代码落点：

- `client/src/shared/types/navigation.ts`：新增 `bid-document` 或等价 section id。
- `client/src/app/menuConfig.ts`：在“标书生成”二级菜单新增“生成完整标书”，描述为“按报价、资质、技术、实施、售后和附件生成完整标书”。
- `client/src/app/AppRouter.tsx`：新增路由到完整标书页面。
- `client/src/features/bid-document/`：新增功能目录。页面骨架参考 `client/src/features/technical-plan/pages/TechnicalPlanHome.tsx`，但不要复制技术方案的自由正文生成假设。

页面流程建议：

1. 模板选择：选择模板包，默认进入“通用响应文件模板”，智慧食堂响应文件模板作为显式可选蓝本，不作为通用生成器的默认入口。
2. 项目数据：展示并维护项目名称、采购人、供应商、报价、税率口径、付款方式和分项报价；分项报价支持新增、删除和逐行编辑，新增行默认为空字段并由校验层拦截未填写名称或品牌型号；税率口径支持通用说明、综合税率和按软硬件/实施服务拆分的项目数据。
3. 附件资产：按模板包要求维护证书、截图、设备图、合同案例扫描件等 asset mapping。
4. 模板预览：展示当前模板包的章节树，只允许在模板允许范围内启用/停用可选章节、编辑章节数据和说明，不允许模型自行新增大章节。
5. 生成与校验：先运行数据和附件校验，通过后生成 Word。
6. 构建日志：展示报价校验、标题校验、生成前禁用词校验、附件校验、章节校验、docx 打开校验、docx 内容校验、docx 报价与付款完整性校验、docx 标题与表头样式校验、docx 技术方案密度校验、图片插入校验、docx 附件排版校验和 Word 成品禁用词复检结果。
7. 参考文件对齐：生成 Word 后可选择官方参考响应文件，与最近导出的候选 Word 对比标题、表格、图片、分页、目录、页脚页码和页面设置差异。

验收：

- 二级菜单能进入完整标书页面。
- 页面根容器保持 `height: 100%` / `min-height: 0`，长内容内部滚动。
- 用户可见文案为中文，提示走 `ToastProvider`，不用 `alert`。

### 0.4 数据 schema

新增 schema 建议放在：

- Renderer 类型：`client/src/features/bid-document/types.ts`
- 跨 IPC 类型：`client/src/shared/types/ipc.ts`
- Main 数据构造：`client/electron/services/bidDocumentStore.cjs` 或 `bidDocumentService.cjs`
- 如需持久化：`client/electron/services/sqliteDatabase.cjs` 和 `sql/workspace_schema.sql`

核心类型：

```ts
interface BidDocumentTemplate {
  id: string;
  name: string;
  documentTitle: string;
  industry: string;
  sections: BidDocumentSectionTemplate[];
  requiredAssetKeys: BidDocumentAssetKey[];
  validationProfile: BidDocumentValidationProfile;
}

interface BidDocumentProjectData {
  templateId: string;
  projectName: string;
  purchaserName: string;
  supplierName: string;
  totalWithTax: number;
  totalWithoutTax: number;
  taxPolicy: {
    description?: string;
    softwareHardwareRate?: number;
    serviceRate?: number;
    defaultRate?: number;
  };
  paymentTerms: BidDocumentPaymentTerm[];
}

interface BidDocumentQuoteItem {
  name: string;
  quantity: number;
  brandModel: string;
  unitPriceWithTax: number;
  totalWithTax: number;
  taxRate?: number;
  category?: 'software' | 'hardware' | 'service' | 'material' | 'other';
}

interface BidDocumentAssetRef {
  key: BidDocumentAssetKey;
  title: string;
  filePath: string;
  type: 'image' | 'scan' | 'document';
  required: boolean;
  sectionId: string;
  templateId?: string;
}

interface BidDocumentBuildLog {
  templateCheck: ValidationResult;
  quoteCheck: ValidationResult;
  paymentCheck: ValidationResult;
  titleCheck: ValidationResult;
  identityCheck: ValidationResult;
  forbiddenWordsCheck: ValidationResult;
  assetCheck: ValidationResult;
  sectionSelectionCheck: ValidationResult;
  sectionCheck: ValidationResult;
  quoteResolutionCheck?: ValidationResult;
  docxOpenCheck: ValidationResult;
  docxContentCheck: ValidationResult;
  docxSectionOrderCheck: ValidationResult;
  docxTableCheck: ValidationResult;
  docxQuoteIntegrityCheck: ValidationResult;
  docxLayoutCheck: ValidationResult;
  docxTocCheck: ValidationResult;
  docxStyleCheck: ValidationResult;
  docxTechnicalDensityCheck: ValidationResult;
  docxPageBreakCheck: ValidationResult;
  imageInsertionCheck: ValidationResult;
  docxAssetPlacementCheck: ValidationResult;
  docxForbiddenWordsCheck: ValidationResult;
  passed: boolean;
  errors: string[];
  outputPath?: string;
}
```

通用章节 schema：

- `cover`
- `supplier-and-authorized-representative`
- `toc`
- `quote-summary`
- `quote-detail`
- `legal-representative-id`
- `authorization-letter`
- `supplier-basic-info`
- `qualification-documents`
- `technical-solution`
- `implementation-plan`
- `after-sales-plan`
- `warranty-period`
- `other-materials`

智慧食堂模板包默认启用上述章节，并使用用户给出的正式响应文件结构作为首个模板结构。其他模板包可以替换、重排或扩展模板定义，但最终章节必须来自模板包，不允许模型在生成时临时创造一级大章。

约束：

- 模板包内的章节顺序为权威顺序，生成器不得由模型自行新增一级大章节。
- 目录、正文和最终 Word 都从同一份 `BidDocumentTemplate + BidDocumentProjectData` 渲染。
- 全文项目名称、采购人、供应商必须只从 `BidDocumentProjectData` 取值。
- 智慧食堂的报价、型号、付款条款是 `smart-canteen-response` 示例数据，不是通用校验器的全局常量。

### 0.5 附件 asset mapping

通用资产 key 要支持按模板包扩展，智慧食堂首个模板包的资产 key 建议：

```ts
type BidDocumentAssetKey =
  | 'business_license'
  | 'iso9001'
  | 'iso20000'
  | 'iso27001'
  | 'software_copyright'
  | 'domestic_certificate'
  | 'cnas_report'
  | 'other_certificate'
  | 'backend_platform_screenshot'
  | 'dish_management_screenshot'
  | 'statistics_report_screenshot'
  | 'mobile_app_screenshot'
  | 'weighing_device_image'
  | 'binding_machine_image'
  | 'dual_screen_pos_image'
  | 'weighing_pos_image'
  | 'tray_image'
  | 'contract_case_scan';
```

示例 mapping：

```json
{
  "business_license": {
    "title": "营业执照",
    "sectionId": "supplier-basic-info",
    "required": true,
    "filePath": ""
  },
  "iso9001": {
    "title": "ISO9001 质量管理体系认证证书",
    "sectionId": "supplier-basic-info",
    "required": true,
    "filePath": ""
  },
  "backend_platform_screenshot": {
    "title": "后台管理平台截图",
    "sectionId": "technical-solution",
    "required": true,
    "filePath": ""
  },
  "contract_case_scan": {
    "title": "合同案例证明扫描件",
    "sectionId": "other-materials",
    "required": true,
    "filePath": ""
  }
}
```

校验规则：

- 资产不存在时，不在正文写说明性占位，构建日志返回 `missing_assets`。
- Word 内图片标题必须用真实名称，例如“ISO9001 质量管理体系认证证书”，不能使用泛化占位标题。
- 每个证书、截图、设备图片单独成页或与说明紧邻。
- 附件文件选择、预校验和 Word 插入支持的图片格式必须一致；当前按 `docx@9.6.1` 可插入能力收敛为 `png`、`jpg`、`jpeg`、`gif`、`bmp`，不接受 `webp` 这类预校验通过但无法稳定插入 Word 的格式。

### 0.6 Word 模板生成任务

新增服务建议：

- `client/electron/services/bidDocumentTemplates.cjs`：模板包注册、章节模板和段落模板。
- `client/electron/services/bidDocumentValidation.cjs`：数据、资产、禁用词、章节和 docx 校验。
- `client/electron/services/bidDocumentWordBuilder.cjs`：基于 `docx` 生成 Word。
- `client/electron/ipc/bidDocumentIpc.cjs`：IPC 注册。
- `client/electron/preload.cjs`：暴露 `window.yibiao.bidDocument`。

智慧食堂模板结构：

- 封面：正式“响应文件”标题，项目名称、采购人、供应商、日期，不写 AI 来源。
- 供应商及授权代表页：使用数据字段，不生成无法验证的人员信息。
- 目录：使用 Word `TableOfContents`，可更新页码。
- 一、报价一览表：含税总价、不含税金额、税率口径、付款方式。
- 1-2 分项报价表：只使用当前项目实例中的报价数据；智慧食堂模板样例使用上述康比特真实分项报价。
- 二至五：法定代表人、授权、供应商基本情况和资格证明文件，主要由模板文字、表格和附件组成。
- 六、技术方案：按项目理解、总体架构、核心业务流程、关键功能设计、第三方接口边界、数据安全与运维设计、交付成果、详细功能介绍、关键功能参数响应、相关配套设备组织。
- 七至十：实施、售后、质保、合同案例证明和后备服务。

智慧食堂模板的技术方案表达规则：

- 项目理解固定写明闭环主线：“菜品设置—称重取餐—身份/餐盘绑定—营养换算—消费结算—数据报表—异常追溯”。
- 总体架构使用表格：用户入口层、设备采集层、业务应用层、数据与接口层、安全运维层。
- 核心业务流程使用表格：基础配置、菜品与营养维护、餐盘/身份绑定、称重取餐、消费结算、营养反馈、异常闭环。
- 第三方接口边界必须写前置条件：对方系统开放接口、提供字段说明、测试账号和权限，按合同范围实施，不承诺无限开发。
- 详细功能介绍必须绑定系统截图，每个模块采用“功能内容 + 投标响应说明 + 管理价值/交付边界”。

排版规则：

- 使用 Word 正文、标题一、标题二、标题三样式。
- 表格表头加粗，边框完整，列宽自适应。
- 封面、目录、报价表、资质证明、技术方案、实施方案、售后方案之间分页。
- 页脚显示页码。
- 不使用未完成痕迹或内部实现说明。

通用模板规则：

- 新模板包必须声明 `documentTitle`、章节树、必填字段、必填资产、报价表类型、付款条款校验 profile 和禁用词 profile。
- 模板包可以通过 `contentProfile` 提供默认段落和表格，但项目实例数据必须覆盖具体采购人、供应商、金额、型号、证书和案例。
- 报价一览表的税率口径必须从项目实例 `taxPolicy` 渲染：优先使用 `description`，其次组合 `softwareHardwareRate` / `serviceRate`，再退回 `defaultRate`；不得把“软硬件 13%，实施服务 6%”写成全局固定文案。
- 模板包只负责组织材料和约束表达，不负责编造项目事实。

### 0.7 自动校验函数

必须实现并在生成前后都调用：

- `validateTemplateDefinition(template)`
  - 校验模板包必须声明 `id`、`name`、`documentTitle`、`industry`、章节树、`requiredAssetKeys` 和 `validationProfile`。
  - 校验章节 id 唯一、标题非空、层级为 0-3、`required` 为布尔值、`parentId` 指向真实章节。
  - 校验 `validationProfile.requiredSectionIds` 必须都存在于章节树，必填附件 key 不得为空或重复。
- `validateQuoteTotals(projectData, quoteItems)`
  - 通用校验：校验每行 `quantity * unitPriceWithTax === totalWithTax`，校验所有分项合计等于项目总价。
  - 通用校验：校验至少存在一行报价，且每行必须有真实 `name` 和 `brandModel`，不能用空行或未完成占位行进入 Word 生成。
  - 智慧食堂样例 profile：校验总价等于 135050。
  - 智慧食堂样例 profile：校验型号完全匹配 CPT-Nutr-GMPLTF V2.0、CPT-Nutr-GMSC450-LITE、CPT-BP001、CPT-GMPOS200、CPT-CZSY280、CPT-FT248。
- `validatePaymentTerms(projectData)`
  - 通用校验：按模板 profile 校验付款节点、比例合计和关键期限。
  - 通用校验：付款节点必须有阶段名称和付款说明，页面新增付款节点不写入“请填写”等占位词。
  - 智慧食堂样例 profile：校验付款条款包含“使用时间 12 个月后无质量问题”，不得变成 3 个月。
- `validateDocumentTitle(template)`
  - 校验 `documentTitle` 必须是正式响应文件口径，默认需包含“响应文件”，不能退回“投标技术文件”或技术说明书口径。
- `validateProjectIdentity(schema, projectData)`
  - 校验项目名称、采购人、供应商全文一致。
- `validateAssets(assetMap)`
  - 校验 required 资产全部存在真实图片或真实文件。
  - 校验所有已经填写 `filePath` 的可选附件也必须存在、必须是文件、不能为空文件，且格式必须能被 Word builder 真实插入；缺失时返回 `missing_asset_file`，格式不支持时返回 `unsupported_asset_type`。
  - 校验资产格式属于 Word builder 可真实插入的图片格式，避免选择器、预校验和实际生成能力不一致。
  - 缺失时返回 `missing_assets`，阻止生成最终 Word。
- `validateForbiddenWords(textOrDocxXml)`
  - 禁用词包括：内容由 AI 生成、内容由AI生成、投标技术文件、待补、页码待最终装订后填写、P__、图：证明材料页、如当前未、仅作为同系列样例、拟装订、不得以历史样式文件替代、本页待补、请填写。
  - 预校验文本范围必须包含模板标题、章节、`contentProfile`、项目主体、付款条款、报价行和附件标题，避免附件标题或表单默认提示绕过生成前校验。
  - Word 成品复检必须读取并解码 `word/document.xml` 正文文本后再检查，不能只扫描 XML 原文，避免 XML 实体编码或 Word 文本节点表达导致漏检。
  - 命中时构建失败并返回错误列表。
- `validateRequiredSections(documentSchemaOrDocxXml)`
  - 至少包含报价、资质证明、技术方案、实施方案、售后方案、质保期、其他材料七大部分。
- `validateDocxOpenable(outputPath)`
  - 检查 `.docx` ZIP 结构、`word/document.xml`、媒体资源和关系文件存在。
- `validateDocxContent(outputPath, input)`
  - 生成后解压 `word/document.xml`，校验项目名称、采购人、供应商、含税总价、付款关键文本、分项报价型号、所有已引用附件标题和模板必备章节标题已经真实写入最终 Word。
- `validateDocxSectionOrder(outputPath, input)`
  - 生成后解压 `word/document.xml`，按启用后的模板包 `sections` 顺序校验章节标题在最终 Word 中的出现顺序，防止成品 Word 偏离正式响应文件模板结构。
  - 最终 Word 中所有 `Heading1`、`Heading2`、`Heading3` 标题必须来自启用后的模板包章节标题集合；发现模板外标题时后校验失败，防止模型或代码临时新增大章节。
- `validateDocxTables(outputPath, input)`
  - 生成后解压 `word/document.xml`，按启用章节校验报价一览、付款条款、分项报价、供应商基本情况、技术方案表格和实施计划表格真实存在。
  - 分项报价和关键功能参数响应表必须包含报价表头和所有分项品牌型号，付款条款表必须包含所有付款说明，防止生成器退化为纯段落文字。
- `validateDocxQuoteIntegrity(outputPath, input)`
  - 生成后定位报价一览表、付款条款表和 `1-2 分项报价表` 的真实 Word 表格，逐行校验含税总价、不含税金额、每个分项的序号、名称、数量、品牌及型号、含税单价、含税总价，以及每个付款节点的阶段、比例和说明。
  - 校验必须按表格行/单元格匹配，不允许用全文包含或其他同表头表格掩盖报价表、付款表被篡改的问题。
- `validateDocxLayout(outputPath)`
  - 生成后解压 `word/document.xml` 和 footer 关系，校验 A4 纵向页面、四边 1440 DXA 页边距、页脚关系和“第 PAGE 页”页码字段真实存在。
  - 页面或页脚不符合正式响应文件排版要求时后校验失败，不替换最终 Word。
- `validateDocxToc(outputPath, input)`
  - 生成后解压 `word/document.xml`，校验目录标题、TOC 字段、1-3 级标题范围、超链接参数和 dirty 标记真实存在，确保目录可在 Word 中更新页码。
  - 目录退化为普通文本或缺少可更新字段时后校验失败。
- `validateDocxStyles(outputPath, input)`
  - 生成后解压 `word/document.xml`，校验启用章节标题使用 Word `Heading1`、`Heading2`、`Heading3` 样式，封面不参与标题样式校验，目录按一级标题校验。
  - 校验所有正式表格首行包含表头行标记、加粗文本和表头底色；标题或表头样式退化时后校验失败。
- `validateDocxTechnicalDensity(outputPath, input)`
  - 生成后定位“技术方案”到下一个同级章节之间的 Word XML 区间，校验该区间内模板要求的总体架构、核心业务流程、关键功能设计、第三方接口边界、关键功能参数响应等表格真实存在。
  - 校验技术方案区间内已引用的技术附件图片真实插入，不接受只有文字说明；同时拦截超过阈值的超长段落和重复段落，避免退化为 AI 散文式技术文件。
- `validateDocxPageBreaks(outputPath, input)`
  - 生成后解压 `word/document.xml`，按启用章节校验目录到报价、报价到法定代表人、供应商基本情况到资质证明、资质证明到技术方案、技术方案到实施方案、实施方案到售后方案、售后方案到质保期、质保期到其他材料之间存在真实分页符。
  - 关键章节之间缺少分页时后校验失败，避免正式响应文件退化为连续技术说明书。
- `validateImagesInserted(outputPath, assetMap)`
  - 检查 `word/media/*` 存在、正文图片引用数量覆盖 required 图片资产和所有已引用附件，并校验 `word/_rels/document.xml.rels` 中每个图片关系都指向真实 media 文件，不接受纯文字占位或断裂图片关系。
- `validateDocxAssetPlacement(outputPath, assetMap, input)`
  - 生成后定位所有应进入 Word 的已引用附件标题，校验附件标题存在、标题前近邻存在分页符、标题后的下一个正文块是真实图片引用。
  - 附件标题与图片不相邻、图片被文字替代或附件未单独起页时后校验失败，避免材料页退化为文字占位或散落说明。
- `analyzeBidReferenceDocument(filePath)`
  - 参考样本文档到位后读取 `.docx` 包内 `word/document.xml`、`word/styles.xml`、`word/_rels/document.xml.rels` 和页脚文件，提取标题层级、表格首行/预览、图片关系、媒体文件、分页符、TOC 字段、页脚页码和页面设置。
  - 分析结果用于人工/脚本对齐模板包结构与排版，不把参考文档事实直接写入项目数据，也不绕过报价、附件和禁用词校验。
- `compareBidReferenceAnalyses(referenceAnalysis, candidateAnalysis)`
  - 对比参考响应文件与候选成品 Word 的标题、表格表头、页面设置、TOC、分页、图片引用和页脚页码证据。
  - 候选缺少参考标题、出现模板外新增标题、缺少参考表格表头、图片/分页/TOC/页脚计数低于参考或页面设置不一致时返回失败，用于样本文档到位后的结构对齐验收。

建议函数签名：

```ts
validateBidDocumentProject(input: {
  template: BidDocumentTemplate;
  projectData: BidDocumentProjectData;
  quoteItems: BidDocumentQuoteItem[];
  assetMap: Record<string, BidDocumentAssetRef>;
}): BidDocumentBuildLog
```

配置、准备度、材料包和报价决策校验函数：

- `readBidDocumentProjectConfig(filePath)` / `assertProjectConfigEnvelope(config)`
  - 读取导出/导入项目配置，校验 `version=1`、顶层 `templateId`、`projectData.templateId`、`quoteItems[]`、`assetMap{}` 必填，且顶层模板 id 必须与项目数据模板 id 一致。
  - 配置 envelope 不合法时阻断导入、校验、准备度、材料包和 Word 构建，不使用模板样例数据兜底。
- `resolveProjectConfigAssetMap(assetMap, configDir)`
  - 将项目配置中的相对附件路径按配置文件所在目录解析，保证桌面导出 sidecar 和 CLI 校验/构建使用同一口径。
- `createReadinessReport(input, buildLog)` / `toSnakeReadinessReport(report)`
  - 从正式构建日志生成桌面 camelCase 和 CLI snake_case 准备度报告，统一报价核对、报价差额建议、附件清单、阻断项、缺失附件和检查摘要。
- `buildQuoteReconciliation(projectData, quoteItems)` / `buildQuoteResolutionActions(projectData, quoteItems)`
  - 输出逐行报价核对和人工报价差额处理建议，禁止自动虚构差额分项。
- `buildAssetInventory(input)` / `writeAssetCollectionPackage(input, outputDir)`
  - 生成材料收集包、`asset-manifest.json`、`asset-manifest.schema.json`、`quote-resolution.json`、`quote-resolution.schema.json` 和材料清单，demo 附件必须以替换计数暴露。
- `readAssetCollectionPackage(packageDir)` / `applyQuoteResolutionToProject(projectData, quoteItems, quoteResolution)`
  - 导入材料包时校验 manifest version、模板身份、`targetFile` 边界和真实文件；报价决策应用后必须再次运行正式报价校验，不合格时保留原报价并输出 `quoteResolutionCheck`。
- `applyDemoAssetPackageGuard(input, buildLog)`
  - 正式构建、准备度报告和材料包流程必须识别 `assetPackage.demoOnly=true`，在业务预校验通过后仍以 `demo_assets_not_allowed_for_formal_build` 阻断演示附件进入可递交 Word。

构建策略：

- 预校验失败：不生成最终 Word，只返回构建日志。
- 后校验失败：只删除或标记失败的临时 Word，不向用户展示为最终样本文档，不得删除或破坏用户选择路径上已经存在的最终文件。
- Word 生成必须先写入同目录临时 `.tmp.docx`，完成 docx 打开、内容、图片关系和禁用词后校验后，才替换最终 `outputPath`；如最终路径已有文件，替换前必须创建临时备份，替换失败时恢复旧文件，成功后清理临时和备份文件。
- 只有所有校验通过，才返回 `outputPath`。

### 0.8 测试与验收

单元测试建议：

- `client/src/features/bid-document/bidDocumentValidation.test.ts` 或 Main 侧对应测试：覆盖通用报价、付款、禁用词、附件缺失、章节缺失。
- `client/src/features/bid-document/bidDocumentTemplates.test.ts`：覆盖 `smart-canteen-response` 模板包能声明章节树、必填字段、必填资产和校验 profile。
- `client/src/features/bid-document/bidDocumentWordBuilder.test.ts`：打开 docx zip 检查标题、目录、章节、报价型号、总价、付款 12 个月、`word/media` 图片资源。
- `client/src/app/menuConfig.test.ts`：确认新增二级入口在“标书生成”下。
- `client/src/shared/analytics/analytics.test.ts`：如新增埋点，必须固定低基数动作值。

手动/集成验证：

- `cd client; node --check electron/services/bidDocumentValidation.cjs`
- `cd client; node --check electron/services/bidDocumentWordBuilder.cjs`
- `cd client; node --check electron/services/bidDocumentReferenceAnalyzer.cjs`
- `cd client; node --check electron/ipc/bidDocumentIpc.cjs`
- `cd client; npm run build`
- 如涉及窗口/IPC：`cd client; npm run dev` 后在 Electron 中生成样本文档。
- 如涉及参考对齐：在完整标书页面“生成与校验”步骤点击“选择参考并对齐”，先选择官方参考响应文件，再对齐最近导出的候选 Word。
- 导出模板 schema 与 asset mapping：`agent-harness/.venv/bin/cli-anything-openbidkit-yibiao --json bid-document-template-info --template-id smart-canteen-response --output-json output/bid-document-samples/smart-canteen-template-info.json`。
- 从模板注册表初始化可编辑项目配置 JSON：`agent-harness/.venv/bin/cli-anything-openbidkit-yibiao --json bid-document-init-config --template-id generic-response --output-json output/bid-document-samples/generic-response-init-config.json --with-demo-assets`。
- 校验导出/导入的项目配置 JSON：`agent-harness/.venv/bin/cli-anything-openbidkit-yibiao --json bid-document-validate-config --input output/bid-document-samples/generic-response-project-config.json --output-json output/bid-document-samples/generic-response-project-config.validation.json`。
- 导出正式构建准备度阻断报告：`agent-harness/.venv/bin/cli-anything-openbidkit-yibiao --json bid-document-readiness-report --input output/bid-document-samples/smart-canteen-init-config.json --output-json output/bid-document-samples/smart-canteen-readiness.json --output-markdown output/bid-document-samples/smart-canteen-readiness.md`。
- 从导出/导入的项目配置 JSON 生成 Word：`agent-harness/.venv/bin/cli-anything-openbidkit-yibiao --json bid-document-build-config --input output/bid-document-samples/generic-response-project-config.json --output output/bid-document-samples/generic-response-from-config.docx --output-json output/bid-document-samples/generic-response-from-config.build.json`。
- 参考样本文档到位后可执行：`agent-harness/.venv/bin/cli-anything-openbidkit-yibiao --json bid-document-analyze-reference --input <参考响应文件.docx> --candidate <生成响应文件.docx> --output-json <alignment.json>`。

输出验收：

- 生成后的样本文档路径必须是实际存在的 `.docx`。
- 构建日志必须列出模板定义校验、报价校验、标题校验、生成前禁用词校验、附件校验、章节校验、docx 打开校验、docx 内容校验、docx 章节顺序校验、docx 表格校验、docx 报价与付款完整性校验、docx 页面与页码校验、docx 目录字段校验、docx 标题与表头样式校验、docx 技术方案密度校验、docx 分页校验、图片插入校验、docx 附件排版校验和 Word 成品禁用词复检结果。
- 智慧食堂样例文档总价为 135050，分项型号完全匹配康比特型号，付款条款为 12 个月。
- 通用生成器必须支持替换为其他项目数据和模板包后重新生成，不需要改代码常量。
- 不存在 AI 痕迹、占位符、未完成痕迹。
- 至少包含报价、资质证明、技术方案、实施方案、售后方案、质保期、其他材料七大部分。
- 技术方案章节保持正式响应文件表达密度，不生成重复大段空话。
- 附件图片真实插入 Word。

### 0.9 执行顺序

1. `blocked`：接收并解析用户提供的正式参考样本文档，提取章节顺序、表格样式、图片组织方式和目录样式；阻塞原因：参考 docx 尚未提供。
2. `completed`：抽象通用 `BidDocumentTemplate`、`BidDocumentProjectData`、`BidDocumentQuoteItem`、`BidDocumentAssetRef` schema，并同步 IPC 类型。
3. `completed`：新增 `bid-document` 路由、菜单按钮、页面壳、模板选择/章节预览、附件映射、构建日志和 IPC/preload 类型。
4. `completed`：实现 `smart-canteen-response` 模板包，把智慧食堂报价数据、付款条款和资产要求作为模板实例样例。
5. `completed`：实现通用校验层和模板 profile 校验，校验失败时只返回构建日志，不产出最终 Word。
6. `completed`：实现通用 Word builder，按模板包章节顺序插入目录、页码、表格、分页和真实附件图片；智慧食堂闭环、接口边界和功能表格已下沉到 `smart-canteen-response.contentProfile`，通用模板不会输出智慧食堂专用文案。
7. `completed`：补测试，运行 `node --check`、focused tests、`npm run sample:bid-document` 和 `npm run build`。
8. `blocked`：用智慧食堂真实资产生成首个样本文档，输出核心代码文件、schema、asset mapping 示例、自动校验函数、样本文档路径和构建日志；阻塞原因：真实附件资产未提供，且分项报价 133050 与目标总价 135050 不一致。
9. `completed`：用一组非智慧食堂的最小 mock 项目数据做通用性测试，确认项目名称、采购人、报价、章节顺序和内容 profile 能从模板/数据切换，不依赖智慧食堂常量。
10. `completed`：完整标书页面从全量平铺表单改为步骤式工作流，保留顶部保存/校验/导出动作，并补充相邻步骤切换回归测试。
11. `completed`：模板预览支持关闭模板包声明的可选章节，`projectData.disabledSectionIds` 持久化可选章节关闭状态；校验层拒绝关闭必选章节或不存在章节，Word builder 只渲染启用章节。
12. `completed`：附件校验从“只校验必填附件”扩展为同时校验所有已引用可选附件；可选附件路径不存在、不是文件、空文件或格式无法插入 Word 时，预校验失败并写入构建日志。
13. `completed`：成品 Word 复检从“必填附件标题/图片数量”扩展为覆盖所有已引用附件；已引用附件若未进入正文标题或图片关系数量不足，后校验失败且不会替换最终 Word。
14. `completed`：成品 Word 附件复检与可选章节启停联动；已关闭可选章节下的已引用附件不再要求插入成品 Word，但挂到未知章节的附件仍会触发后校验失败。
15. `completed`：生成前附件预校验与可选章节启停联动；已关闭可选章节下的可选附件不再因旧路径、缺失文件或格式问题阻断生成，但未知章节附件仍按错误映射处理并失败。
16. `completed`：成品 Word 增加 `docxSectionOrderCheck`，按启用后的模板章节顺序复检最终 `word/document.xml` 中章节标题出现顺序；顺序错乱、标题缺失或与模板包偏离时后校验失败且不替换最终 Word。
17. `completed`：生成前增加 `templateCheck` 模板包定义自检，校验模板 id、标题、行业、章节树、父子关系、必备章节引用和必填附件 key；模板包结构错误时直接构建失败并写入日志。
18. `completed`：成品 Word 增加 `docxTableCheck`，按启用章节复检报价、付款、分项报价、供应商基本情况、技术方案和实施方案表格；关键表格缺失或表头/品牌型号/付款说明未进入真实表格时后校验失败。
19. `completed`：成品 Word 增加 `docxLayoutCheck`，显式设置并复检 A4 纵向页面、1440 DXA 页边距、footer 关系和“第 PAGE 页”页码字段；页面设置或页脚页码退化时后校验失败。
20. `completed`：成品 Word 增加 `docxPageBreakCheck`，复检目录、报价、资质证明、技术方案、实施方案、售后方案、质保期和其他材料之间的关键分页符；分页缺失时后校验失败。
21. `completed`：成品 Word 增加 `docxTocCheck`，复检目录标题、可更新 TOC 字段、1-3 级标题范围、超链接参数和 dirty 标记；目录退化为普通文本时后校验失败。
22. `completed`：成品 Word 增加 `docxStyleCheck`，复检启用章节标题一/二/三级样式和所有正式表格首行的表头标记、加粗文本、底色；标题或表头样式退化时后校验失败。
23. `completed`：成品 Word 增加 `docxTechnicalDensityCheck`，复检技术方案区间的表格驱动结构、技术附件图片、超长段落和重复段落；技术方案退化为 AI 散文或缺少截图/产品图时后校验失败。
24. `completed`：成品 Word 的 `docxSectionOrderCheck` 增加模板外标题拦截，最终 `Heading1`、`Heading2`、`Heading3` 必须来自启用模板章节；出现模型自行新增章节时后校验失败。
25. `completed`：成品 Word 增加 `docxQuoteIntegrityCheck`，按真实表格行/单元格复检报价一览、付款条款和 `1-2 分项报价表` 的金额、数量、型号、比例和说明；报价或付款表被篡改时后校验失败。
26. `completed`：成品 Word 增加 `docxAssetPlacementCheck`，复检已引用附件标题、分页符和相邻图片块；附件图片被文字替代、标题缺失或附件未单独起页时后校验失败。
27. `completed`：新增参考响应文件结构分析器 `analyzeBidReferenceDocument` 与 CLI 命令 `bid-document-analyze-reference`，可在参考 docx 到位后自动提取章节标题、表格、图片、分页、目录字段、页脚页码和页面设置，作为模板包对齐证据。
28. `completed`：新增参考/候选 Word 结构对齐比较 `compareBidReferenceAnalyses`，CLI 支持 `--candidate` 输出缺失/新增标题、缺失表头、图片/分页/目录/页脚计数不足和页面设置差异，用于正式样本文档到位后的生成结果验收。
29. `completed`：桌面端完整标书页面新增参考文件对齐入口，Main Store/IPC/preload/types 暴露 `analyzeReference`，页面可从最近导出的候选 Word 发起参考响应文件结构对齐并展示差异摘要。
30. `completed`：新增 CLI 命令 `bid-document-template-info`，从真实模板注册表导出模板 schema、章节树、默认项目数据、报价行和 asset mapping 示例；当前智慧食堂蓝本 artifact 已写入 `output/bid-document-samples/smart-canteen-template-info.json`，并通过 core/E2E 测试固定。
31. `completed`：桌面端完整标书页面新增“导出模板配置 JSON”按钮，Main Store/IPC/preload/types 暴露 `exportTemplateInfo`，与 CLI 共用 `getBidDocumentTemplateInfo()` 输出 schema、章节树、默认项目数据、报价行和 asset mapping 示例。
32. `completed`：桌面端完整标书顶部操作区新增“导入配置 / 导出配置”，Main Store/IPC/preload/types 暴露 `importProjectConfig` 和 `exportProjectConfig`，项目配置 JSON 覆盖模板、项目数据、付款条款、分项报价和附件映射；导入后持久化新草稿，并由后续导入校验流程替换旧构建日志。
33. `completed`：新增 CLI 命令 `bid-document-validate-config`，通过 Node helper 复用真实 `bidDocumentTemplates.cjs` 与 `bidDocumentValidation.cjs`，对导出/导入的项目配置 JSON 执行报价、付款、主体、禁用词、附件和章节校验；通用模板校验 artifact 已写入 `output/bid-document-samples/generic-response-project-config.validation.json`，并通过 core/E2E 测试固定。
34. `completed`：桌面端完整标书构建日志新增 `not_run` 展示分支，预校验阶段尚未执行的 docx 打开、内容、图片、附件排版等生成后检查显示为“未运行”，不再误显示为“未通过”；页面回归测试固定该显示口径。
35. `completed`：桌面端项目配置导入后立即运行 `validateBidDocumentProject` 并持久化导入校验 build log；导入成功但校验未通过时不阻止草稿进入页面，但返回 `validationPassed=false`、提示查看构建日志，并在页面直接展示缺失附件、报价、禁用词或章节问题。
36. `completed`：桌面端项目配置导出新增 sidecar 附件目录，已存在的附件文件复制到 `<配置文件名>.assets/` 并在 JSON 中写相对路径；导入配置时相对附件路径按 JSON 所在目录解析，跨项目/跨机器移动 JSON 与附件目录后仍可通过真实附件校验。
37. `completed`：CLI `bid-document-validate-config` 增加相对附件路径解析，按输入 JSON 所在目录解析 sidecar 附件；桌面端导出的便携配置包可直接用 CLI 做报价、付款、禁用词、章节和真实附件校验。
38. `completed`：模板选择不再对显式未知 `templateId` 静默回退到智慧食堂模板；桌面项目配置导入、CLI 配置校验和样本文档命令遇到未知模板时返回 `unknown_template_id` 和可用模板列表，避免通用项目被误套智慧食堂口径；`saveState` 保持只返回 `BidDocumentState` 的 bridge 契约，未知模板保存走异常路径，避免 Renderer 把错误对象当作页面状态；调用方传入完整临时模板对象时仍可按自定义模板校验和生成。
39. `completed`：生成前 `identityCheck` 增加模板身份一致性校验，要求 `projectData.templateId` 与当前模板包 `template.id` 一致，并要求已标注 `templateId` 的附件映射同属当前模板包；桌面校验和 CLI 配置校验都会拦截混合模板配置，避免项目数据、附件和章节模板来自不同响应文件口径。
40. `completed`：生成前付款条款校验增加单行比例约束，付款比例必须是有限数字且大于 0、不超过 100；即使合计为 100，负数比例、超过 100 的异常尾款或非数字比例也会被 `paymentCheck` 拦截，避免正式响应文件出现不可递交的商务付款表。
41. `completed`：生成前报价校验增加正式金额完整性约束，项目含税总价、不含税金额必须为大于 0 的有限数字，不含税金额不得超过含税总价；每条分项报价的含税单价和含税合计也必须大于 0，桌面校验、CLI 配置校验和 harness 测试都会拦截缺失或为 0 的报价金额，避免以空报价或无效税前金额生成正式响应文件。
42. `completed`：CLI 新增 `bid-document-build-config`，可直接从桌面导出或导入的项目配置 JSON 生成完整 Word 响应文件，继续复用真实模板注册表、附件相对路径解析和 `writeBidDocumentWordFile()` 的生成前/生成后校验，不复制 Word 业务逻辑；core/E2E 测试已覆盖从 sidecar 配置生成 `.docx`、build result JSON、报价表完整性和图片插入。
43. `completed`：`bid-document-build-config` 失败保护已固定，配置预校验失败时返回非零和 build result JSON，但不创建新的 Word 文件，也不覆盖用户路径上已有的 Word 文件；core/E2E 测试覆盖缺失附件失败、`assetCheck` 错误、`bytes=0` 和既有输出文件保持原样。
44. `completed`：CLI 新增 `bid-document-init-config`，可从真实模板注册表初始化可编辑项目配置 JSON，包含模板 id、项目数据、分项报价、asset mapping 和可选 demo sidecar 附件；该命令让 agent/用户可以先生成配置，再用同一套 `bid-document-validate-config` / `bid-document-build-config` 做校验和 Word 生成，不需要手写 JSON。
45. `completed`：智慧食堂模板默认配置的报价矛盾已形成可重复阻断证据，即使通过 `bid-document-init-config --template-id smart-canteen-response --with-demo-assets` 补齐 demo 附件，`bid-document-build-config` 仍会因 `quote total 133050` 与项目/模板目标 `135050` 不一致失败，并且不会生成正式 Word。
46. `completed`：`bid-document-build-config` 增加 demo 资产包保护，配置中 `assetPackage.demoOnly=true` 时，只有在真实报价/附件等业务预校验通过后才返回 `demo_assets_not_allowed_for_formal_build` 并拒绝生成正式 Word；智慧食堂报价差额仍优先暴露，通用 demo 配置不会被误作为可递交文档。
47. `completed`：CLI 新增 `bid-document-readiness-report`，在不生成 Word 的前提下复用真实模板注册表和 `validateBidDocumentProject()` 导出 JSON/Markdown 准备度报告，按报价、付款、主体、禁用词、附件、章节、模板和 demo 附件包归类阻断项，并列出报价差额、缺失附件和逐项校验状态，方便把正式构建前缺口交给业务侧补齐。
48. `completed`：桌面端完整标书页面新增“导出缺口报告”动作，Main Store/IPC/preload/types 暴露 `exportReadinessReport`，从当前页面草稿导出 Markdown 准备度报告和同名 JSON，复用真实 `validateBidDocumentProject()` 并把 build log 回写到构建日志；页面和 Store 单测覆盖阻断报告、报价差额、缺失附件和 `not_run` 显示为“未运行”。
49. `completed`：桌面端完整标书导入/持久化新增 `assetPackage` 元数据，SQLite schema 升级到 v39 并补 `bid_document_state.asset_package_json`；导入 `assetPackage.demoOnly=true` 的配置后，运行校验、准备度报告和正式 Word 导出都会保留演示附件包标记；正式 Word 导出在业务预校验通过后仍会以 `demo_assets_not_allowed_for_formal_build` 阻断，不会把 demo sidecar 附件误作为可递交材料。
50. `completed`：CLI `bid-document-readiness-report` 新增 `--output-xlsx`，在 JSON/Markdown 缺口报告之外导出业务侧 Excel 清单，包含概览、报价核对、阻断项、附件清单、缺失附件和校验项六个 sheet，并使用 `微软雅黑` 12pt；智慧食堂当前清单会明确列出报价差额 2000、`demo_assets_not_allowed_for_formal_build` 和各生成后检查“未运行”，便于商务/交付补齐真实报价确认与附件材料。
51. `completed`：桌面端 `exportReadinessReport` 同步生成同名 Excel 缺口清单，返回 `xlsxPath` 并在 Store 单测中打开 `.xlsx` 校验 workbook、六个 sheet、报价差额、阻断项、附件清单和 `微软雅黑` 样式；用户在完整标书页面点击“导出缺口报告”即可得到 Markdown、JSON 和 Excel 三件套。
52. `completed`：准备度 Excel workbook 生成逻辑抽到 `client/electron/services/bidDocumentReadinessReport.cjs`，桌面端 Store 和 agent-harness CLI 复用同一份 `buildReadinessReportExcelBuffer()`；该函数兼容桌面端 camelCase 与 CLI snake_case 报告字段，防止后续两条导出路径格式、sheet、附件清单或阻断项处理建议漂移。
53. `completed`：完整标书页面在“生成与校验”步骤展示最近一次“导出缺口报告”的 Markdown、JSON 和 Excel 路径，页面测试覆盖 `xlsxPath` 进入 UI；业务人员导出后无需只依赖 toast，可直接在页面确认三件套落盘位置。
54. `completed`：完整标书页面导出缺口报告成功后自动切换到“生成与校验”步骤，并在最近缺口报告卡片中显示“可正式构建/仍有阻断项”状态；页面测试覆盖无需手动切页即可看到报价阻断、三件套路径和准备度状态。
55. `completed`：准备度报告新增全量附件材料收集清单，桌面端 JSON/Markdown 使用 `assetInventory`，CLI 使用 `asset_inventory`，Excel 新增“附件清单”sheet，列出材料 key、材料名称、章节、必填、类型、收集状态、当前路径、建议文件名和处理说明；`assetPackage.demoOnly=true` 时 sidecar 文件标记为“演示附件”，不会被误认为真实扫描件已齐。
56. `completed`：新增完整标书材料收集包导出能力，桌面端顶部操作区提供“导出材料包”，Main Store/IPC/preload/types 暴露 `exportAssetCollectionPackage`；CLI 新增 `bid-document-asset-package --input <project-config.json> --output-dir <dir>`。导出结果包含 `asset-manifest.json`、`材料收集清单.md` 和按章节分组的 `assets/` 目录，所有材料继续来自模板 asset mapping 和项目配置，不伪造附件文件。
57. `completed`：新增完整标书材料收集包导入回填能力，桌面端顶部操作区提供“导入材料包”，Main Store/IPC/preload/types 暴露 `importAssetCollectionPackage`；CLI 新增 `bid-document-import-asset-package --input <project-config.json> --package-dir <dir> --output-json <updated-config.json>`。导入时以 `asset-manifest.json` 的 `targetFile` 为权威，存在真实文件则回填 `assetMap.filePath`，不存在则清空对应附件路径，避免旧 demo sidecar 路径残留后误通过正式校验。
58. `completed`：准备度报告新增通用报价逐项核对能力，`buildQuoteReconciliation()` 从任意模板的 `quoteItems` 计算每行“数量 × 含税单价”、声明合计、行差额和状态；桌面端 JSON/Markdown 使用 `quoteReconciliation`，CLI 使用 `quote_reconciliation`，Excel 新增“报价核对”sheet，可清楚区分智慧食堂当前每行报价无误但项目级合计仍差 2000 的问题。
59. `completed`：准备度报告新增通用报价差额处理建议，`buildQuoteResolutionActions()` 在项目总价与分项合计不一致时输出三条人工决策路径：确认项目含税总价、新增经确认的真实分项、修正已有报价行；桌面端 JSON/Markdown 使用 `quoteResolutionActions`，CLI 使用 `quote_resolution_actions`，Excel 在“报价核对”sheet 中追加建议行，避免用户只看到错误而不知道下一步如何安全修正。
60. `completed`：完整标书材料收集包升级为正式构建补齐包，`asset-manifest.json` 和 `材料收集清单.md` 除附件清单外同步写入正式构建阻断项、报价核对摘要和报价差额处理建议；桌面端和 CLI 共用 `writeAssetCollectionPackage()`，业务侧拿到材料包即可同时补齐真实扫描件、确认报价差额和处理 demo 附件阻断。
61. `completed`：材料收集包新增 `quote-resolution.json` 报价处理决定文件，默认只列出当前报价差额、允许动作和空白数据区，不自动更改报价；桌面端和 CLI 导入材料包时会读取该文件，只有人工填写合法 `selectedAction` 且提供 `projectDataPatch`、`quoteItemsReplacement` 或 `quoteItemsAppend` 后才回填项目总价或分项报价，并继续复用正式报价校验，防止 AI 或导入流程自行虚构 2000 元报价行。
62. `completed`：桌面端材料包交互新增最近材料包状态卡；导出材料包后自动切到“生成与校验”并展示输出目录、材料清单和 `quote-resolution.json` 路径，导入材料包后在“附件资产”步骤展示报价决策是否应用、选择动作和错误列表，减少人工补齐报价差额时的信息盲区。
63. `completed`：`quote-resolution.json` 导入新增动作级数据形态校验；`confirm_project_total` 只能提供 `projectDataPatch`，`add_confirmed_quote_item` 只能提供 `quoteItemsAppend`，`correct_existing_quote_items` 只能提供 `quoteItemsReplacement`，填了数据但未选择动作或动作与数据不匹配都会写入 `quoteResolutionCheck` 并拒绝应用，桌面 Store、CLI core 和已安装 CLI E2E 已覆盖错误动作不会修改项目总价或追加无效报价行。
64. `completed`：材料收集包新增 `quote-resolution.schema.json`，与 `quote-resolution.json` 同目录输出，包含 `selectedAction` 枚举、动作级允许/禁止数据区和报价行字段说明；桌面端材料包状态卡和 CLI `bid-document-asset-package` 返回 schema 路径，导入时校验报价决策文件 version 与 templateId，防止跨模板或旧版本报价决策误应用。
65. `completed`：材料收集包新增 `replacementRequiredAssetCount` 口径，manifest、Markdown、桌面状态卡和 CLI 输出都会明确展示“需替换演示附件”数量；`missingRequiredAssetCount` 继续只表示未收集到文件的必填材料，demo sidecar 通过独立替换计数暴露，避免业务误解为正式附件已齐套。
66. `completed`：材料收集包新增 `asset-manifest.schema.json`，说明 manifest 版本、必填字段、状态枚举、附件字段和计数字段；桌面材料包状态卡、Store 返回值和 CLI `bid-document-asset-package` 都会返回 manifest schema 路径，导入材料包时会拒绝不支持的 `asset-manifest.json` version，桌面 Store、CLI core 和已安装 CLI E2E 已覆盖旧版 manifest 不会回填附件或写出更新配置。
67. `completed`：材料收集包导入新增 `targetFile` 目录边界校验；manifest 中的附件目标必须是材料包目录内的相对路径，绝对路径、`../` 越界路径和指向包外的符号链接都会以 `invalid_asset_target_file` 失败，桌面 Store、CLI core 和已安装 CLI E2E 已覆盖越界 target 不会回填附件或写出更新配置。
68. `completed`：附件预校验新增图片文件签名校验；`.png/.jpg/.jpeg/.gif/.bmp` 附件必须匹配真实文件头，文本文件改扩展名会以 `invalid_asset_file_signature` 阻断校验、缺口报告和正式 Word 构建，桌面 Store、CLI core 和已安装 CLI E2E 已覆盖假图片不会被视为可递交扫描件或截图。
69. `completed`：项目配置导出和 CLI 初始化新增同名 `*.schema.json`；schema 说明 `version/templateId/projectData/quoteItems/assetMap/assetPackage`、报价行字段、附件相对路径和 demoOnly 阻断规则，桌面 Store、CLI core 和已安装 CLI E2E 已覆盖 schema 路径返回和文件落盘，样例目录同步生成 `generic-response-init-config.schema.json` 与 `smart-canteen-init-config.schema.json`。
70. `completed`：项目配置读取新增 `version` 闸门；桌面项目配置导入、CLI 配置校验、正式 Word 构建、缺口报告、材料包导出和材料包导入都会拒绝非 `version=1` 的配置，以 `unsupported_project_config_version` 失败，不导入草稿、不生成 Word、不写出派生 JSON，桌面 Store、CLI core 和已安装 CLI E2E 已覆盖。
71. `completed`：项目配置读取新增 envelope 必填字段校验；导入/CLI 读取必须提供顶层 `templateId`、`projectData.templateId`、`quoteItems[]` 和 `assetMap{}`，缺失字段以 `invalid_project_config` 失败，不再从模板样例里兜底项目数据、报价行或附件映射，桌面 Store、CLI core 和已安装 CLI E2E 已覆盖缺字段不会保存草稿、不会生成 Word、不会写出派生 JSON。
72. `completed`：附件映射预校验新增结构校验；`assetMap.<key>.key` 必须等于 map key，附件标题、类型和章节 id 必填，类型限制为 `image|scan|document`，章节 id 必须存在于模板章节中，结构错误会写入 `assetCheck` 并阻断校验/正式构建，桌面单测、CLI core 和已安装 CLI E2E 已覆盖。
73. `completed`：项目配置 schema 输出补齐附件映射结构规则；同名 `*.schema.json` 现在包含 `assetTypeEnum`、`allowedSectionIds`、`allowedSectionTitles`、`requiredAssetKeys`、`assetMappingExample` 和 `assetRefValidationRules`，明确 map key、标题、类型、章节、禁用可选章节附件、图片签名、`version=1` 与缺字段不兜底规则，CLI 初始化样例 schema 已重生成，桌面模板单测、bidDocument 单测、CLI core 和已安装 CLI E2E 已覆盖。
74. `completed`：附件 `document` 类型与生成链路对齐；`image/scan` 仍必须通过图片扩展名和文件头校验并插入 Word 图片，`document` 必须是真实非空文件但只在 Word 中列出正式标题和原始文件名，不计入图片插入与邻接图片检查；项目配置额外追加的 asset key 不再被模板样例合并静默丢弃，仍由章节、标题、类型和文件校验约束，桌面单测、Word builder 单测和 CLI build-config core/E2E 已覆盖。
75. `completed`：准备度报告和材料收集包同步 `document` 附件口径；`buildAssetInventory()` 会按现有原始文件后缀生成建议文件名，未提供时默认 `.pdf`，材料收集说明区分“真实原始文件”和“扫描件/截图/设备图片”，`asset-manifest.schema.json` 写明 `image/scan` 与 `document` 的类型规则；CLI 材料包测试已覆盖 `.docx` document 附件的 manifest、Markdown 和 schema 输出。
76. `completed`：Markdown 附件清单与 Excel/manifest 口径对齐；桌面准备度报告、CLI 准备度报告和材料收集包 Markdown 的附件表新增“类型”和“处理说明”列，直接展示 `image/scan/document` 以及真实材料要求，避免业务只看 Markdown 时误把 document 原始文件当图片扫描件处理；Store、CLI core 和已安装 CLI E2E 已覆盖。
77. `completed`：生成前禁用词预校验补齐税率口径说明字段；`projectData.taxPolicy.description` 会进入 `forbiddenWordsCheck` 扫描，避免用户在税率说明中留下“请填写/待补”等未完成痕迹后才被 Word 成品复检发现；桌面 bidDocument 校验单测已覆盖。
78. `completed`：生成前禁用词预校验继续对齐 Word 实际渲染字段；付款表中的 `paymentTerms.stage` 以及 `document` 附件在正文中展示的原始文件名会进入 `forbiddenWordsCheck` 扫描，避免付款节点或原始文件名带有“待补/请填写”等未完成痕迹后进入正式响应文件；桌面 bidDocument 校验单测已覆盖。
79. `completed`：材料收集包建议文件名增加 Windows 保留设备名防护；附件标题或章节名清洗后如为 `CON/PRN/AUX/NUL/COM1-LPT9` 等保留名，会自动加 `_` 前缀并去除末尾点/空格，避免生成 Windows 无法创建的 `targetFile`；桌面 Store 材料包导出单测已覆盖。
80. `completed`：材料收集包和 CLI 准备度报告的 Markdown 表格增加单元格转义；报价名称、附件标题、阻断原因、报价处理建议等动态字段中的 `|` 会转义为 `\|`，换行会转为 `<br>`，避免业务补料清单或缺口报告被用户输入拆坏表格列；桌面 Store、CLI core 和已安装 CLI E2E 已覆盖。
81. `completed`：桌面端“导出缺口报告”Markdown 与 CLI/材料包表格转义口径对齐；报价核对、报价差额处理建议、附件清单、缺失附件和校验项中的动态字段统一处理 `|` 与换行，避免桌面导出的准备度报告被用户输入破坏表格结构；桌面 Store 和 bidDocument 单测已覆盖。
82. `completed`：准备度报告与材料收集包 Markdown 的非表格动态文本增加行内清洗；项目名称、采购人、供应商、模板名、阻断项分组和阻断原因中的 `|` 会转义，换行会压成单行，避免业务输入或路径/错误文本把 Markdown 摘要、标题或列表拆成伪章节；桌面 Store、CLI core、已安装 CLI E2E 和 build 已覆盖。
83. `completed`：生成前禁用词预校验的附件扫描范围与可选章节启用状态对齐；已关闭可选章节下的可选附件不会因为标题或文件名中的未完成字样阻断正式构建，启用章节、必填附件、未知章节附件仍按会进入 Word 或必须校验的材料继续拦截；桌面 validation、bidDocument 全量单测、CLI core/E2E 和 build 已覆盖。
84. `completed`：项目配置 schema 与禁用可选章节附件校验口径对齐；`assetRefValidationRules` 明确已关闭可选章节下的附件不会插入 Word、不会校验文件、也不会扫描禁用词，启用后恢复正式校验；通用和智慧食堂初始化配置 schema 已重生成，桌面模板单测、bidDocument 全量单测、CLI core 和 build 已覆盖。
85. `completed`：已安装 CLI E2E 补齐项目配置 schema 新规则验收；`bid-document-init-config` 端到端导出的同名 schema 会断言 `assetRefValidationRules` 包含“disabled optional section assets 不插入、不校验文件、不扫描禁用词直到启用”的契约，避免只在 core 单测覆盖；CLI E2E、CLI core、桌面 bidDocument 全量单测、build 和 `git diff --check` 已覆盖。
86. `completed`：CLI `bid-document-validate-config` 端到端补齐禁用可选章节附件行为验收；项目配置关闭 `backup-service` 时，即使该可选附件标题含“待补”且文件路径不存在，也不会触发 `forbiddenWordsCheck` 或 `missing_asset_file`，启用章节后仍由既有校验拦截；CLI core、已安装 CLI E2E、桌面 bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
87. `completed`：CLI `bid-document-build-config` 正式 Word 生成链路补齐禁用可选章节附件行为验收；项目配置关闭 `backup-service` 时，标题含“待补”且文件路径不存在的可选附件不会阻断正式通用 Word 生成，也不会进入成品 `document.xml`，图片插入计数仍只统计启用章节附件；CLI core、已安装 CLI E2E、桌面 bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
88. `completed`：准备度报告和材料收集包的附件清单与启用章节口径对齐；`buildAssetInventory()` 复用模板启用章节判断，已关闭可选章节下的附件不会进入桌面/CLI 缺口报告、Excel/Markdown 附件清单或材料包 manifest，但未知章节附件仍保留用于暴露错误；桌面 Store、CLI core、已安装 CLI E2E、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
89. `completed`：附件必填校验与禁用可选章节口径彻底对齐；`validateAssets()` 不再把已关闭可选章节下 `asset.required=true` 或模板 `requiredAssetKeys` 命中的附件加入必填缺失检查，避免关闭章节后仍出现 `missing_assets` 阻断；桌面 validation/Store、CLI core、已安装 CLI E2E、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
90. `completed`：Word 成品内容校验增加禁用章节反向检查；`validateDocxContent()` 会拦截已关闭章节标题或该章节附件标题进入最终 `document.xml`，避免生成器后续改动导致关闭章节内容泄漏到正式响应文件；桌面 Word builder 回归测试通过篡改 docx 模拟泄漏，`node --check`、bidDocument 全量单测、CLI core/E2E、build 和 plan-summary 已覆盖。
91. `completed`：付款条款 profile 校验范围扩展到 `paymentTerms.stage + paymentTerms.text`；智慧食堂模板的“使用时间 12 个月后无质量问题”必填文本和“使用时间 3 个月后无质量问题”禁用文本即使写在付款节点名称里也会被校验，避免节点/说明拆分后漏掉关键商务付款错误；桌面 validation 单测、bidDocument 全量单测、CLI core/E2E、build、plan-summary 和 `git diff --check` 已覆盖。
92. `completed`：底层主体一致性校验与项目配置 schema 对齐；`validateProjectIdentity()` 现在要求 `projectData.templateId` 必须存在并与 `template.id` 匹配，避免绕过导入配置 envelope 直接调用 `validateBidDocumentProject()` 时缺失模板身份仍进入正式生成链路；桌面 validation 单测、bidDocument 全量单测、CLI core/E2E、build、plan-summary 和 `git diff --check` 已覆盖。
93. `completed`：模板章节树结构校验补齐父子层级和循环保护；`validateTemplateDefinition()` 会拦截父级层级不低于子级、父级循环等坏模板，`getEnabledTemplateSections()` 也增加递归循环保护，避免通用模板包配置错误导致章节启用计算失控；桌面 validation/templates/bidDocument 单测、CLI core/E2E、build、plan-summary 和 `git diff --check` 已覆盖。
94. `completed`：模板必填附件与项目 asset mapping 契约补强；`validateAssets()` 会把模板 `requiredAssetKeys` 中缺少对应 `assetMap` 记录的情况明确标为 `missing_required_asset_mapping`，避免新模板包声明了必填材料但页面/配置没有可补料入口；项目配置 schema 已同步该规则并重生成通用/智慧食堂初始化 schema，桌面 validation/templates/bidDocument 单测、CLI core/E2E、build、plan-summary 和 `git diff --check` 已覆盖。
95. `completed`：模板可选章节与必备章节关系补强；`validateTemplateDefinition()` 会拦截必选章节或 `validationProfile.requiredSectionIds` 下挂到可选父章节的坏模板，`validateSectionSelection()` 会拒绝关闭包含必备后代的可选章节，避免用户通过关闭父章节间接隐藏报价、资质、技术方案等必备响应内容；桌面 validation/bidDocument 单测、CLI core/E2E、build、plan-summary 和 `git diff --check` 已覆盖。
96. `completed`：`validationProfile.requiredSectionIds` 与章节 `required` 标记强一致；模板自检会拦截 profile 必备章节未标记 `required=true`，章节启用计算和禁用校验也会把 profile 必备章节视为必选，避免模板层认为必备、页面层却显示为可关闭的状态分裂；桌面 validation/bidDocument 单测、CLI core/E2E、build、plan-summary 和 `git diff --check` 已覆盖。
97. `completed`：模板 profile 必备章节声明完整性补强；`validateTemplateDefinition()` 现在要求 `validationProfile.requiredSectionIds` 必须是非空数组，并拦截空 id 与重复 id，避免新模板包遗漏七大必备部分声明后让 `validateRequiredSections()` 退化为零检查；桌面 validation/bidDocument 单测、CLI core/E2E、build、plan-summary 和 `git diff --check` 已覆盖。
98. `completed`：模板 profile 可选约束字段结构校验补强；模板声明 `quoteTotalWithTax`、`requiredModels`、`paymentRequiredText`、`paymentForbiddenText`、`requiredDocumentTitleText` 时必须是可执行的正数、数组或非空字符串，`requiredModels` 还会拦截空型号和重复型号，避免报价、型号、付款或标题约束因模板配置错误静默失效；桌面 validation/bidDocument 单测、CLI core/E2E、build、plan-summary 和 `git diff --check` 已覆盖。
99. `completed`：模板章节父子顺序校验补强；`validateTemplateDefinition()` 会拦截子章节在父章节之前出现的坏模板，确保模板章节树顺序与 Word 正文/目录顺序一致，避免生成正式响应文件时先渲染子标题再渲染父标题；桌面 validation/bidDocument 单测、CLI core/E2E、build、plan-summary 和 `git diff --check` 已覆盖。
100. `completed`：模板章节父子层级连续性校验补强；已声明 `parentId` 的章节必须比父章节正好深一级，`validateTemplateDefinition()` 会拦截一级标题直接挂三级标题等跳级模板，避免 Word 标题样式和可更新目录产生不规范层级；桌面 validation/templates/bidDocument 单测、CLI core/E2E、build、plan-summary 和 `git diff --check` 已覆盖。
101. `completed`：模板章节标题唯一性校验补强；`validateTemplateDefinition()` 会拦截重复章节标题并在 `duplicateSectionTitles` 中输出冲突标题，避免目录、章节顺序校验和正文定位在正式响应文件中出现歧义；桌面 validation/templates/bidDocument 单测、CLI core/E2E、build、plan-summary 和 `git diff --check` 已覆盖。
102. `completed`：嵌套章节父级声明补强；`quote-detail` 已明确挂到 `quote-summary`，`validateTemplateDefinition()` 会拦截二级/三级章节缺少 `parentId` 的模板并输出 `missingNestedParentIds`，避免正式响应文件中二级标题脱离父章节、目录树和章节启用计算语义不一致；smart-canteen template-info 已同步父子结构，generic/smart-canteen init-config 与 schema 已按当前模板注册表重生成，桌面 validation/templates/Word builder/bidDocument 单测、CLI core/E2E、build、plan-summary 和 `git diff --check` 已覆盖。
103. `completed`：模板章节 schema 导出补强；`getBidDocumentSchemaDefinitions()` 新增 `BidDocumentSectionTemplate` 字段和章节校验规则，`getBidDocumentProjectConfigSchema()` 新增 `sectionTemplateValidationRules`，template-info 与 init-config schema 都会明确 `parentId`、标题唯一、层级连续、父级先于子级和禁止循环规则，方便后续扩展通用模板包时不必反查代码；桌面模板单测、CLI core/E2E、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖，并已重生成 smart-canteen template-info 与通用/智慧食堂 init-config schema。
104. `completed`：付款条款、税率口径和模板 validationProfile schema 导出补强；`getBidDocumentSchemaDefinitions()` 现在导出 `BidDocumentTaxPolicy`、`BidDocumentPaymentTerm`、`BidDocumentValidationProfile` 字段与校验规则，`getBidDocumentProjectConfigSchema()` 导出 `paymentTermFields` 和 `paymentTermValidationRules`，template-info/init-config schema 会直接说明付款比例合计 100、付款关键文本、禁用文本、税率口径说明和 profile 必备章节/型号/总价约束；桌面模板单测、CLI core/E2E、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖，并已重生成 smart-canteen template-info 与通用/智慧食堂 init-config schema。
105. `completed`：构建日志 schema 导出补强；`BidDocumentBuildLog` 现在明确导出 `preflightCheckKeys`、`postGenerationCheckKeys` 和所有检查字段，新增 `BidDocumentValidationResult` 字段契约，`getBidDocumentProjectConfigSchema()` 同步导出 `buildLogFields`，让报价、付款、禁用词、附件、章节、docx 打开、正文完整性、表格、目录、样式、密度、分页、图片插入和附件排版检查都能被 CLI、桌面和后续 agent 按稳定 schema 消费；桌面模板单测、CLI core/E2E、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖，并已重生成 smart-canteen template-info 与通用/智慧食堂 init-config schema。
106. `completed`：构建日志 schema 与预检失败实际输出对齐；`validateBidDocumentProject()` 在报价、附件或模板等预检失败时也会返回 `docxForbiddenWordsCheck: { errors: ["not_run"] }`，与 `BidDocumentBuildLog.postGenerationCheckKeys` 完全一致，避免 CLI/桌面/后续 agent 按 schema 消费失败构建日志时缺字段；Word builder 单测、CLI core/E2E 聚焦用例、bidDocument 全量单测、CLI core/E2E 全量、build、plan-summary 和 `git diff --check` 已覆盖。
107. `completed`：Renderer 构建日志类型与 Main/schema 强一致；`client/src/features/bid-document/types.ts` 中 `BidDocumentBuildLog` 的模板、标题、章节启用和全部 docx 后置检查字段改为必填，`BidDocumentValidationResult.details` 改为必填，避免页面、Store 或后续前端代码继续按旧的可缺省 build log 口径处理正式构建结果；`npm run build`、bidDocument 全量单测、plan-summary 和 `git diff --check` 已覆盖。
108. `completed`：Store 模板错误路径 build log 强契约补齐；`bidDocumentStore.validate()` 和 `exportWord()` 在未知模板或模板解析失败时也返回完整 `BidDocumentBuildLog`，除 `templateCheck` 外其余检查为 `not_run`，并已把 Store 测试声明改用前端 `BidDocumentBuildLog` 类型，避免测试继续按 `{ passed, errors }` 松散对象验收；Store 单测、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
109. `completed`：准备度报告和材料包模板错误路径 build log 强契约补齐；`exportReadinessReport()`、`exportAssetCollectionPackage()`、`importAssetCollectionPackage()` 和 `importProjectConfig()` 在未知模板或模板解析失败时也返回完整 `BidDocumentBuildLog`，页面、IPC 和后续 agent 可统一展示 `templateCheck` 失败与其他检查 `not_run`；Store 单测、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
110. `completed`：CLI 模板错误路径 build log 强契约补齐；新增 `bid_document_build_log_helper.cjs` 统一生成完整模板错误日志，`bid-document-validate-config`、`bid-document-build-config`、`bid-document-readiness-report` 和 `bid-document-asset-package` 在未知模板时都会输出完整 `build_log`，其中 `templateCheck` 失败、其余检查为 `not_run`，并保持失败时不生成 Word 或材料包；CLI core 全量、已安装 CLI E2E 全量、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
111. `completed`：CLI 材料包导入模板错误路径 build log 强契约补齐；`bid-document-import-asset-package` 在输入项目配置模板未知时会输出完整 `build_log`，其中 `templateCheck` 失败、其余检查为 `not_run`，并保持失败时不写 updated project config，避免 agent 回填材料包时只能从 stderr 推断模板错误；CLI core 全量、已安装 CLI E2E 全量、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
112. `completed`：桌面页面导入失败 build log 展示补齐；`BidDocumentPage` 在材料包导入和项目配置导入返回 `success=false` 但携带 `buildLog` 时会立即展示构建日志并切到“生成与校验”，避免未知模板、坏配置或材料包错误只停留在 toast；页面单测、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
113. `completed`：附件图片格式白名单单一来源补齐；新增 `bidDocumentAssets.cjs` 统一维护 `png/jpg/jpeg/gif/bmp`，桌面文件选择器、生成前附件校验、Word 图片插入、材料包建议扩展名和项目配置 schema 文案都改为读取同一份常量，避免后续选择器允许的格式与 Word builder 实际插入能力漂移；Node 语法检查、Store/Validation/WordBuilder/Templates 聚焦单测、bidDocument 全量单测、CLI core/E2E 全量、build、plan-summary 和 `git diff --check` 已覆盖。
114. `completed`：`document` 类型附件桌面选择能力补齐；Renderer 调用 `selectAsset` 时传入附件 `type`，IPC 类型同步扩展，Store 按 `document` 类型展示“原始文件或证明材料”过滤器并允许 PDF/Office/WPS/压缩包/图片等原始证明文件，`image/scan` 仍保持图片扫描件过滤器，避免 schema 和 Word builder 已支持的原始文件类附件在页面上无法选择；页面/Store 聚焦单测、bidDocument 全量单测、CLI core/E2E 全量、build、plan-summary 和 `git diff --check` 已覆盖。
115. `completed`：附件映射行关键信息可见化；完整标书页面的附件资产行新增“必填材料/可选材料”“图片/扫描件/原始文件”和模板 id 标签，补料人员无需打开 JSON 或等校验失败才知道材料是否必填、会被图片插入还是按原始文件列示；页面单测、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
116. `completed`：附件映射行章节启用状态可见化；页面按当前模板章节树和 `disabledSectionIds` 计算附件所在章节是否启用，附件行新增“章节已启用/章节已关闭”标签，已关闭可选章节下的附件会明确提示不参与正式构建，避免补料人员误以为已上传附件一定会进入 Word；页面单测、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
117. `completed`：页面附件缺失摘要与正式校验口径对齐；`countMissingAssets()` 现在忽略已关闭可选章节下的必填附件，避免摘要显示的“缺失必填”数量比 `validateAssets()` 和正式构建阻断项更高；页面单测新增关闭 `backup-service` 且其附件为必填时仍显示 3 项缺失、不显示 4 项缺失，bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
118. `completed`：报价差额摘要前置展示；完整标书页面“报价合计”卡片现在会比较分项合计与项目含税总价，不一致时直接显示差额，一致时显示“报价一致”，让智慧食堂 133050 vs 135050 这类正式构建阻断不必等到运行校验才暴露；页面单测、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
119. `completed`：报价差额摘要方向表达补齐；页面摘要现在按准备度报告同一口径显示“分项少 X 元”或“分项多 X 元”，不再让用户从正负号推断报价差异方向；页面单测覆盖分项少于项目总价和分项高于项目总价两种场景，bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
120. `completed`：报价决策校验日志可见化；材料包导入对 `quote-resolution.json` 的动作/数据形态校验失败时，页面构建日志现在会显示“报价决策校验”和具体错误，不再只依赖 toast 或材料包状态卡提示报价决策未应用；前端类型补充可选 `quoteResolutionCheck`，页面单测覆盖报价决策 payload 不匹配错误，bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
121. `completed`：报价决策校验 schema 契约补齐；模板 schema 和项目配置 schema 新增 `importCheckKeys: ['quoteResolutionCheck']`，`BidDocumentBuildLog.fields.quoteResolutionCheck` 明确为 `BidDocumentValidationResult`，并重生成 smart-canteen template-info、通用/智慧食堂 init-config schema，避免 CLI、桌面和后续 agent 只知道正式构建预检/后检而不知道材料包导入阶段的报价决策检查；模板单测、CLI core/E2E 聚焦用例、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
122. `completed`：导入阶段检查条件展示补齐；完整标书页面构建日志现在把正式构建检查和导入阶段检查分开渲染，`quoteResolutionCheck` 只有在材料包导入实际返回该字段时才显示，普通校验/正式构建日志不再出现“报价决策校验：未运行”的噪音；页面单测覆盖普通构建日志不显示报价决策校验、材料包导入错误仍显示报价决策校验，bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
123. `completed`：必填附件类型校验收紧；模板 `requiredAssetKeys` 或附件自身 `required=true` 的正式材料现在必须使用 `image` 或 `scan`，`document` 仅允许作为可选原始文件列示，不能替代扫描件/截图/设备图插入 Word；项目配置 schema、template-info、材料包 manifest schema 和材料收集说明已同步该口径，Validation/Template/WordBuilder 聚焦单测、bidDocument 全量单测、通用 Word 生成、build、plan-summary 和 `git diff --check` 已覆盖。
124. `completed`：准备度 Markdown 渲染单一来源补齐；桌面 `exportReadinessReport()` 和 CLI `bid-document-readiness-report` 现在共用 `bidDocumentReadinessReport.cjs` 导出的 `renderReadinessReportMarkdown()`，Store 和 CLI 不再各自维护 Markdown helper，报价核对、附件清单、阻断项和 Markdown 转义规则统一；Store 单测断言导出内容等于共享渲染函数输出，CLI core/E2E 准备度报告聚焦用例、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
125. `completed`：准备度阻断分类与缺失附件提取单一来源补齐；桌面 `exportReadinessReport()` 和 CLI `bid-document-readiness-report` 现在共用 `classifyReadinessErrors()` 与 `extractReadinessMissingAssets()`，报价、付款、主体、禁用词、附件、章节、模板和演示附件阻断分组不再两处分叉维护；Store 单测断言 readiness report 的 blockers/missingAssets 等于共享函数输出，CLI core/E2E 准备度报告聚焦用例、Node 语法检查、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
126. `completed`：项目配置读取与相对附件路径解析单一来源补齐；新增 `bidDocumentProjectConfig.cjs` 统一校验 `version/templateId/projectData.templateId/quoteItems/assetMap` envelope 并按项目配置文件位置解析相对附件路径，桌面项目配置导入、CLI `validate-config`、`build-config`、`readiness-report`、`asset-package` 和 `import-asset-package` 都改为复用同一实现；准备度检查摘要也收敛到 `collectReadinessCheckSummaries()`，Store 单测直接覆盖 `bidDocument` 包裹结构和相对路径解析，CLI core/E2E 聚焦用例、Node 语法检查、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
127. `completed`：演示附件正式构建保护单一来源补齐；新增 `applyDemoAssetPackageGuard()` 统一把 `assetPackage.demoOnly=true` 转成 `demo_assets_not_allowed_for_formal_build`、失败的 `assetCheck` 和失败 build log，桌面校验/准备度/材料包/正式 Word、CLI `build-config`、CLI `readiness-report` 和 CLI `asset-package` 都复用同一 guard；CLI 准备度报告现在不仅 blockers 包含 demo 阻断，`build_log.assetCheck.errors` 也包含同一错误，Core/E2E 已加断言覆盖，Store 单测、Node 语法检查、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
128. `completed`：准备度报告对象构造单一来源补齐；新增 `createReadinessReport()` 与 `toSnakeReadinessReport()`，桌面 `exportReadinessReport()`、桌面材料包导出、CLI `bid-document-readiness-report` 和 CLI `bid-document-asset-package` 现在共用同一份 ready、报价核对、报价差额建议、附件清单、阻断项、缺失附件和校验摘要构造逻辑；CLI 仍保留 snake_case 对外 JSON 兼容，Store 单测直接断言返回报告等于共享函数输出，Node 语法检查、Store 单测、CLI core 聚焦用例已覆盖。
129. `completed`：准备度报告 schema 契约补齐；template-info 现在导出 `BidDocumentReadinessReport`、`BidDocumentQuoteReconciliation`、`BidDocumentQuoteReconciliationItem`、`BidDocumentQuoteResolutionAction`、`BidDocumentAssetInventoryItem`、`BidDocumentMissingAsset` 和 `BidDocumentReadinessCheckSummary`，并明确桌面 camelCase 与 CLI snake_case alias；init-config schema 新增 `readinessReportFields`，让后续 agent、CLI 和业务脚本可以按稳定字段消费 JSON/Markdown/Excel 准备度报告；模板单测、CLI core 聚焦用例、样例 schema 重生成、准备度/材料包样例刷新已覆盖。
130. `completed`：报价决策导入边界收紧；`quote-resolution.json` 的 `projectDataPatch` 现在只允许修改 `totalWithTax`、`totalWithoutTax` 和 `taxPolicy`，不能借确认总价动作改付款条款、主体信息或其他项目字段；`quoteItemsAppend` / `quoteItemsReplacement` 的报价行必须包含名称、品牌型号、数量、含税单价和含税合计，且行内合计必须等于数量乘单价；`quote-resolution.schema.json` 同步输出允许字段和行校验规则，CLI core 和 Store 聚焦测试已覆盖无效字段、缺型号和行合计不一致不会回填项目配置。
131. `completed`：项目配置模板身份读取边界收紧；共享 `bidDocumentProjectConfig.cjs` 现在在 envelope 读取阶段校验顶层 `templateId` 必须与 `projectData.templateId` 一致，不一致时直接以 `invalid_project_config:templateId_mismatch` 失败，不进入后续模板加载、准备度、材料包或 Word 构建流程；Store 共享 reader 测试和 CLI core 配置校验测试已覆盖错模板配置不写出派生校验文件。
132. `completed`：项目配置模板身份 schema 证据补齐；`getBidDocumentProjectConfigSchema()` 现在在 `projectDataFields.templateId` 和 `validationNotes` 中明确顶层 `templateId` 与 `projectData.templateId` 必须一致，且不一致会在 reader 阶段失败并阻止校验、材料包、准备度报告和 Word 构建副作用；通用/智慧食堂 init-config schema 已重生成，模板 schema 单测、bidDocument 全量单测、CLI core+E2E 和 build 已覆盖。
133. `completed`：CLI 初始化配置 schema 防回归补齐；`bid-document-init-config` 的 core 测试现在直接断言输出 schema 包含 `projectDataFields.templateId` 顶层模板一致性说明和 reader 阶段 mismatch 阻断说明，确保后续 agent 通过 CLI 生成的项目配置 schema 不会丢失模板身份边界；CLI core 聚焦/全量、模板单测、bidDocument 全量和 build 已覆盖。
134. `completed`：报价决策文件身份 schema 证据补齐；材料包生成的 `quote-resolution.schema.json` 现在新增 `identityRules`，明确 `version` 必须为 1，`templateId` 必须匹配 `asset-manifest.json`，否则导入返回 `unsupported_quote_resolution_version` 或 `quote_resolution_template_mismatch` 且不应用报价决策；桌面 Store、CLI core、已生成智慧食堂材料包 schema、bidDocument 全量、CLI core+E2E 和 build 已覆盖。
135. `completed`：通用模板默认入口收口；`DEFAULT_BID_DOCUMENT_TEMPLATE_ID` 已设为 `generic-response`，`getBidDocumentTemplate()`、`assertKnownBidDocumentTemplate()`、`createBidDocumentSample()` 和桌面 Store 首次 `loadState()` 的无模板调用都会从通用响应文件模板开始，SQLite schema 默认值同步为 `generic-response`；智慧食堂仍作为显式 `smart-canteen-response` 蓝本模板使用，依赖康比特型号、智慧食堂报价差额和 `business_license` 的测试均改为显式选择该蓝本；通用/智慧食堂 init-config schema 已重生成，模板/Store 聚焦单测、bidDocument 全量单测、CLI core+E2E、Node 语法检查、build、plan-summary 和 `git diff --check` 已覆盖。
136. `completed`：完整标书运行时 IPC 通道一致性补齐；`workspaceDatabaseChannels` 已补入 `bid-document:export-readiness-report`、`bid-document:export-asset-collection-package`、`bid-document:import-asset-collection-package`，与 preload、IPC handler 和页面按钮保持一致，避免数据库检查/升级或不可用状态下缺口报告、材料包导出/导入按钮没有受控 handler；`planCompletionAudit.test.ts` 新增源码级防回归，检查 preload 暴露的全部 `bid-document:*` 通道都纳入 workspace database IPC guard；IPC 语法检查、planCompletionAudit、BidDocumentPage+Store 聚焦单测已覆盖。
137. `completed`：完整标书页面通用模板文案收口；页面 hero 不再固定写“当前以智慧食堂响应文件模板作为蓝本”，而是按当前模板动态展示，`smart-canteen-response` 仍显示智慧食堂蓝本说明，默认 `generic-response` 显示“当前使用通用响应文件模板...”的通用说明，避免用户在通用模板入口误认为生成器仍是智慧食堂专用；BidDocumentPage 单测新增通用模板文案防回归，bidDocument 全量单测已覆盖。
138. `completed`：完整标书 bridge 类型契约补齐；Renderer `WindowYibiao.bidDocument.saveState()` 类型现在允许携带 `assetPackage`，与 Store 真实持久化能力和页面 `buildPayload()` 保持一致；`planCompletionAudit.test.ts` 新增防回归，解析 preload 的 `bidDocument` 方法并校验共享 IPC 类型中都有对应声明，同时检查 `assetPackage` 没有从保存类型中丢失；planCompletionAudit、bidDocument 全量单测和 build 已覆盖。
139. `completed`：完整标书项目切换状态收口；桌面页面成功导入新的项目配置后会清空上一次“导出/导入材料包”状态卡，避免通用模板、智慧食堂蓝本或其他项目配置切换后继续展示旧项目的 `asset-manifest`、`quote-resolution` 和材料目录；`BidDocumentPage.test.tsx` 新增“先导出材料包再导入项目配置”的组合回归，确认旧材料包状态不会残留；BidDocumentPage 定向测试、bidDocument 全量单测、Electron CJS 语法检查和 build 已覆盖。
140. `completed`：完整标书项目配置导出取消路径收口；桌面端 `exportProjectConfig()` 在用户取消保存对话框时不再引用尚未声明的 `projectConfig` 变量，而是返回受控 `success=false,canceled=true` 结果，避免“导出配置”取消操作变成运行时异常；`bidDocumentStore.test.ts` 新增保存对话框取消回归，Store 定向测试、bidDocument 全量单测、Electron CJS 语法检查、build 和 plan-summary 已覆盖。
141. `completed`：完整标书持久化旧模板错误日志补齐；当 SQLite 中保存的模板 id 已被删除或重命名时，桌面 `loadState()` 会回落到默认通用模板，同时把 `lastBuildLog` 写成完整 `BidDocumentBuildLog`，除 `templateCheck` 外所有检查项为 `not_run`，避免页面或后续流程遇到缺字段日志；`bidDocumentStore.test.ts` 新增旧模板持久化行回归，Store 定向测试、bidDocument 全量单测、Electron CJS 语法检查、build 和 plan-summary 已覆盖。
142. `completed`：完整标书材料包 manifest 模板不匹配错误结构化；当 `asset-manifest.json.templateId` 与当前项目模板不一致时，桌面 `importAssetCollectionPackage()` 返回完整 `buildLog`，CLI `bid-document-import-asset-package` 输出 JSON 失败结果而不是 stack，并且不写 updated config；新增 Store、agent-harness core 和已安装 CLI E2E 回归，覆盖 `asset_package_template_mismatch`、`quoteCheck=not_run` 和不污染输出配置；bidDocument 全量单测、Node 语法检查、build 和 plan-summary 已覆盖。
143. `completed`：完整标书模板附件定义契约补齐；`BidDocumentTemplate` 新增可导出的 `assetDefinitions`，内置通用模板和智慧食堂蓝本会把默认补料入口、正式标题、所属章节和类型随模板包输出，`validateTemplateDefinition()` 会在模板提供 `assetDefinitions` 时校验重复 key、缺标题、错章节、错类型和 `requiredAssetKeys` 漏定义，避免新模板声明了必填附件但 template-info/init-config/material package 无补料入口；已重生成 `smart-canteen-template-info.json`、通用/智慧食堂 init-config schema，bidDocument 全量单测、CLI core/E2E 聚焦用例、Node 语法检查、build、plan-summary 和 `git diff --check` 已覆盖。
144. `completed`：完整标书默认附件映射生成收敛到模板 `assetDefinitions`；`getSmartCanteenAssetMap()`、`getGenericAssetMap()` 和自定义模板 `createBidDocumentSample({ template })` 都通过同一 `createAssetMapFromTemplate()` 构造 assetMap，后续新增行业模板时只要声明 `assetDefinitions` 即可得到正确补料入口，不会回落到通用模板附件或混入无关 key；模板单测新增自定义模板 assetMap 回归，CLI core/E2E 固定 template-info 和 init-config schema 中的 `BidDocumentAssetDefinition` 证据，bidDocument 全量单测、Node 语法检查已覆盖。
145. `completed`：完整标书必填附件口径一致性收口；`requiredAssetKeys` 作为正式材料必填权威来源，`createAssetMapFromTemplate()` 会把命中 `requiredAssetKeys` 的附件映射强制标为必填，即使 `assetDefinitions.required=false` 也不会在页面、配置或材料包中误显示为可选；`validateTemplateDefinition()` 同步拦截这种矛盾模板并输出 `inconsistentRequiredAssetDefinitions`，template-info/init-config schema 已同步规则；bidDocument 聚焦单测、CLI core/E2E 聚焦用例、Node 语法检查、build、plan-summary 和 `git diff --check` 已覆盖。
146. `completed`：完整标书附件映射 `required` 字段类型校验补强；`validateAssets()` 现在要求 `assetMap.<key>.required` 必须存在且为 boolean，并输出 `invalid_asset_required_values`，`assetNeedsDocxPresence()` 不再把字符串 `"false"` 等 truthy 值误当成必填标记；template-info/init-config schema 已同步 “required must be boolean” 规则，bidDocument validation/templates 单测、CLI core/E2E malformed asset mapping 与 schema 断言、Node 语法检查已覆盖。
147. `completed`：完整标书报价税率口径校验补强；`validateQuoteTotals()` 现在会校验 `projectData.taxPolicy` 中的税率字段必须为 0-1 之间的数字，`quoteItems.category` 必须为 `software|hardware|service|material|other`，且已填写 `taxRate` 的软件/硬件/材料行必须匹配 `softwareHardwareRate`、服务行必须匹配 `serviceRate`、其他行在声明 `defaultRate` 时必须匹配默认税率，错误会进入 `quoteCheck.details.invalidTaxPolicyFields/invalidQuoteCategories/invalidQuoteTaxRates/mismatchedQuoteTaxRates`；智慧食堂 13% 软硬件税率已有单测覆盖，template-info/init-config schema 和 CLI core/E2E 校验已同步，bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
148. `completed`：完整标书材料包报价决策回填后置校验收口；`applyQuoteResolutionToProject()` 在 `quote-resolution.json` 通过动作级形态校验并应用到内存数据后，会继续调用 `validateQuoteTotals()` 对完整报价表、项目总价、税率口径、报价分类和 `taxRate/category` 映射做正式报价校验；若应用后的报价不符合规则，则 `quoteResolutionApplied=false`、保留原报价数据，并把错误写入 `quote_resolution_post_apply_quote_check:*` 与 `quoteResolutionCheck`，避免错误报价被标记为已应用；`quote-resolution.schema.json`、桌面 Store 单测、CLI core/E2E、bidDocument 全量单测、build、plan-summary 和 `git diff --check` 已覆盖。
149. `completed`：完整标书计划源口径回填；`plan.md` 的 P0 页面流程和核心 schema 草稿已从早期“默认智慧食堂模板”和简化 build log 更新为当前通用生成器事实：默认模板为 `generic-response`，智慧食堂为显式蓝本，`BidDocumentBuildLog` 包含模板、报价、付款、主体、附件、章节选择、Word 后置检查、图片插入、附件排版、成品禁用词和可选导入阶段 `quoteResolutionCheck`，避免后续迭代按旧计划误把智慧食堂当全局默认或遗漏日志字段。
150. `completed`：完整标书计划源防回归补齐；`planCompletionAudit.test.ts` 新增检查，读取 `plan.md`、`bidDocumentTemplates.cjs` 和 Renderer `BidDocumentBuildLog` 类型，固定默认模板为 `generic-response`、智慧食堂为显式蓝本，并要求计划草稿中的 build log 字段覆盖当前正式类型中的预检、后检和导入阶段检查；`cd client && npm run test:unit -- planCompletionAudit.test.ts` 已覆盖。
151. `completed`：完整标书自动校验函数计划源补齐；`plan.md` 的 `0.7 自动校验函数` 已补入项目配置 envelope 校验、相对附件路径解析、准备度报告、报价核对、报价差额建议、材料包导出/导入、报价决策回填后置校验和 demo 附件保护等当前正式链路函数；`planCompletionAudit.test.ts` 同步检查这些函数名在计划源和 Main 侧源码中同时存在，避免后续计划源落后于真实实现；`cd client && npm run test:unit -- planCompletionAudit.test.ts` 已覆盖。
152. `completed`：完整标书禁用词清单硬性验收补齐；`bidDocumentValidation.test.ts` 新增逐项测试，覆盖“内容由 AI 生成 / 内容由AI生成 / 投标技术文件 / 待补 / 页码待最终装订后填写 / P__ / 图：证明材料页 / 如当前未 / 仅作为同系列样例 / 拟装订 / 不得以历史样式文件替代 / 本页待补 / 请填写”等正式响应文件禁用表达，确保生成前和成品复检共用的 `validateForbiddenWords()` 不会漏掉用户原始禁用词要求；`cd client && npm run test:unit -- bidDocumentValidation.test.ts` 已覆盖。
153. `completed`：完整标书禁用词构建层失败保护补齐；agent-harness core 新增 `bid-document-build-config` 回归，项目配置中出现“内容由 AI 生成”等禁用词时，CLI 正式构建返回失败、写出 build result JSON、`forbiddenWordsCheck` 失败、`docxForbiddenWordsCheck` 保持 `not_run`，并且不创建最终 `.docx`，固定“发现禁用词则构建失败且不要生成最终 Word”的用户硬性要求；focused core 测试已覆盖。
154. `completed`：完整标书禁用词已安装 CLI 验收补齐；`test_full_e2e.py` 新增真实子进程回归，验证已安装 `cli-anything-openbidkit-yibiao --json bid-document-build-config` 在项目配置含“内容由 AI 生成”时返回非零、输出失败 JSON、写出 build result、保持后置 Word 禁用词检查 `not_run`，且不创建最终 `.docx`；focused installed CLI E2E 已覆盖。
155. `completed`：完整标书缺失附件预检失败保护补齐；agent-harness core 和已安装 CLI E2E 回归同步固定，当必填附件指向不存在的真实文件时，正式构建返回失败、保留既有最终 Word、不创建新 `.docx`、只在构建日志输出 `missing_assets:<key>`，并保持 `docxOpenCheck`、`imageInsertionCheck`、`docxForbiddenWordsCheck` 全部 `not_run`，避免附件缺失时生成半成品 Word 或触发误导性的后置检查；focused core/E2E 测试已覆盖。
156. `completed`：完整标书计划完成状态口径修正；CLI `plan-summary` 现在把通用能力阻塞和智慧食堂正式样本文档外部缺口拆开输出，新增 `sample_blocked_items/sample_blocked_count` 与 `capability_blocked_items/capability_blocked_count`，当仅参考 docx、真实附件资产或报价差额确认缺失时返回 `completion_status=required-complete-with-sample-blockers`，不再把蓝本样本文档缺口误判为通用标书生成器 blocked；agent-harness core、已安装 CLI E2E、README/TEST/OPENBIDKIT 说明和本计划源已同步。

### 0.10 暂不做

- 不在参考样本文档到位前微调最终版式。
- 不用 AI 自行创造报价、人员、证书编号、合同案例编号或接口承诺。
- 不把缺失资产写进正文作为说明。
- 不把智慧食堂报价、康比特型号、12 个月付款条款写成全局唯一规则；它们只属于 `smart-canteen-response` 模板样例和验收 profile。
- 不绕过或弱化现有 Analytics 逻辑。

## 0. 盘点口径

- 盘点时间：2026-06-14。
- 盘点来源：`README.md` / `README.en.md`、`client/src/app/menuConfig.ts`、`client/src/app/AppRouter.tsx`、`client/src/features/**`、`client/doc/*.md`、`analytics/**`、`sql/workspace_schema.sql`。
- “未开发”包括三类：
  - 菜单中已暴露但被 `notice` 拦截或页面有“正在开发中”遮罩的功能。
  - README 或设计文档已承诺，但当前代码只实现 demo、占位或局部能力的功能。
  - 已有功能可用，但存在明确文案、代码或设计文档指出的后续补齐项。
- 不把历史 `task_plan.md` 中已标记 `[completed]` 的内容重复列为“未开发”，但如果当前代码仍有占位/禁用/未支持文案，则列入本计划。

## 1. P0：明确占位、从零开发

### 1.1 商务标

现状：

- 菜单入口：`business-bid`。
- 页面：`client/src/features/business-bid/pages/BusinessBidPage.tsx`。
- 2026-06-14 已完成第一阶段：移除二级菜单 `githubStarNotice`，页面从 Demo 改为可进入的商务标工作台。
- 已支持从技术方案已导入的招标文件生成商务响应矩阵，规则识别付款、保证金、报价、合同、资信、工期等条款。
- 已支持响应内容、偏离类型、风险等级、待补材料、人工确认状态的编辑和 SQLite 持久化。
- 已新增 `business_bid_meta` / `business_bid_clauses` SQLite 表、Main Store、IPC/preload/types、单元测试和 E2E 冒烟。
- 已补充第一阶段交付导出：商务标页面可导出 UTF-8 Markdown 商务标响应交付包，包含商务响应表、合同条款偏离表、资信证明材料清单、报价附件清单和处理建议。
- 2026-06-15 已完成第二阶段：商务标支持独立导入招标文件，不再只能依赖技术方案工作区；Main 侧复用 `fileService.importTechnicalPlanDocument()` 解析文件并生成商务响应矩阵，来源标记为 `tender-document`。
- 2026-06-15 已完成第三阶段：商务响应矩阵支持条款负责人和确认人维护，SQLite schema 升级到 v21，商务标交付包同步导出负责人/确认人列。
- 2026-06-15 已完成第四阶段：商务标新增“AI 结构化提取”后台任务，Main 侧通过 `taskService` 启动 `business-bid-ai-extraction`，复用 `aiService.requestJson()` / `collectJsonResponse()` 调用模型，严格归一化为现有商务条款字段后替换矩阵；任务状态写入 `business_bid_tasks`，页面订阅 `tasks:event` 展示进度、完成和失败恢复；规则提取仍作为默认导入兜底，AI 失败不会清空已有矩阵。
- 2026-06-15 已完成第五阶段：商务标支持导出 Word `.docx` 和 Excel `.xlsx` 交付文件，四张表统一复用同一份商务响应表、合同条款偏离表、资信证明材料清单、报价附件清单数据结构；Word 使用 `docx` 生成，Excel 使用 OpenXML `.xlsx` 包生成。
- 2026-06-15 已完成第六阶段：商务标关键动作埋点接入 `trackBusinessBidAction()`，覆盖独立导入、从技术方案生成矩阵、启动 AI 结构化提取、确认条款、导出 Markdown/Word/Excel；客户端、Worker 和 Dashboard 均使用固定低基数枚举，过滤本地路径、文件名和任意非法动作值。
- 2026-06-15 已完成第七阶段：商务标新增独立附件管理，支持导入报价附件、资信证明和其他附件到本地工作区，维护附件类型、状态、负责人和备注，并在 Markdown/Word/Excel 交付包中输出“独立附件清单”。

目标：

- 做成完整商务标工作台，覆盖商务条款、合同条款、报价口径、资信/证明材料、偏离表、商务响应表。
- 支持导入招标文件，可复用技术方案 Step02 已解析出的商务/合同/评标/开标信息。
- 生成商务响应矩阵：条款原文、响应内容、偏离类型、风险等级、待补充材料、人工确认状态。
- 支持报价附件清单、合同条款偏离表、资信证明材料清单导出。

建议拆分：

1. 已完成：增加商务标独立文件导入，不只依赖技术方案招标文件。
2. 已完成：增加 AI 结构化提取后台任务、Main 侧 JSON schema 调用、字段归一化、`taskService` 状态、进度恢复、运行日志和页面 bridge。
3. 已完成：扩展矩阵导出报价附件清单、合同偏离表、资信证明材料清单，并支持负责人/确认人和独立附件管理。
4. 已完成：实现 Word/Excel 导出：商务响应表、合同偏离表、材料清单、报价附件清单。
5. 已完成：补充关键动作埋点，例如生成矩阵、确认条款、导出材料包。

验收：

- `cd client; npm run build` 通过。
- 复用技术方案招标文件后能生成并持久化商务响应矩阵。
- 独立导入商务标招标文件后能生成并持久化商务响应矩阵。
- 关闭重启后页面状态恢复。
- 导出文件可打开，中文路径正常。
- 已补充：商务标交付包 Markdown 导出由 Main 侧 UTF-8 写入，页面、IPC/preload/types 和报告内容均有测试覆盖。
- 已补充：BusinessBidPage 组件测试覆盖独立导入按钮调用；businessBidStore 测试覆盖独立文件解析结果写入 `tender-document` 来源和商务条款矩阵；Playwright 冒烟覆盖独立导入入口。
- 已补充：BusinessBidPage 组件测试覆盖负责人/确认人保存调用、AI 结构化提取后台任务启动和任务状态展示；businessBidStore 测试覆盖负责人/确认人持久化、AI JSON 归一化落库和交付包导出表格列；taskService 单测覆盖商务标 AI 提取 managed task 状态落盘和完成快照；Playwright 冒烟覆盖 AI 结构化提取入口禁用态。
- 已补充：BusinessBidPage 组件测试覆盖 Word/Excel 导出 bridge 调用；businessBidStore 测试直接打开 docx/xlsx 包检查四张交付表、负责人和报价附件内容；Playwright 冒烟覆盖 Word/Excel 导出入口禁用态。
- 已补充：BusinessBidPage 组件测试覆盖商务标关键动作埋点调用；`analytics.test.ts` 覆盖客户端仅允许固定商务标动作值；Analytics Worker 测试覆盖 `businessBidActions` 服务端白名单；Analytics Dashboard 测试覆盖商务标关键动作中文展示。
- 已补充：BusinessBidPage 组件测试覆盖独立附件导入、负责人/备注编辑和删除调用；businessBidStore 测试覆盖附件复制到 `workspace/business-bid/attachments/`、附件状态更新、删除清理文件，以及 Markdown/Word/Excel 交付包输出“独立附件清单”。

### 1.2 图片知识库

现状：

- 菜单入口：`image-knowledge-base`。
- 2026-06-14 已完成第一阶段：移除二级菜单 `githubStarNotice`，新增图片知识库路由页面。
- 已支持多图片上传、复制到 `userData/workspace/image-knowledge-base/images/`、生成缩略图、hash 去重、分类/标签/标题/描述/来源/适用场景检索。
- 已支持图片元数据编辑、引用次数展示和删除时清理本地图片文件与 SQLite 记录。
- 已新增 `image_knowledge_assets` / `image_knowledge_tags` / `image_knowledge_asset_tags` / `image_knowledge_references` SQLite 表、Main Store、IPC/preload/types、单元测试和 E2E 冒烟。
- 2026-06-15 已完成第二阶段：技术方案正文编辑页支持从图片知识库筛选并插入素材；Main 侧生成 `yibiao-asset://image-knowledge-base/...` Markdown 引用、写入引用记录、更新引用次数；图片详情页展示引用来源回溯；Word 导出服务已支持解析图片知识库本地资产。
- 2026-06-15 已完成第三阶段：图片知识库支持批量选择素材、批量设置分类、批量设置文件夹、批量追加标签、批量删除、全局重命名标签和全局删除标签，Main Store 复用现有标签关系表并返回统一状态，并通过 v22 SQLite 迁移持久化文件夹字段。
- 2026-06-15 已完成第四阶段：正文生成进入 AI 生图候选时，Main 侧会先用章节标题、配图标题、Prompt、正文片段、父级/同级章节标题匹配图片知识库；命中后直接写入 `yibiao-asset://image-knowledge-base/...` Markdown 引用、记录引用次数并跳过 AI 生图，未命中再回退原 AI 生图链路；配图报告新增“图片知识库”统计。

目标：

- 建立图片素材库，用于投标文件图示、现场照片、产品图、流程图、荣誉证书、资质扫描件、截图素材管理。
- 支持图片上传、文件夹、标签、分类、描述、来源、适用场景、引用次数和搜索。
- 支持正文生成或人工编辑时插入图片素材。
- 支持导出 Word 时稳定解析本地图片资产。

建议拆分：

1. 已完成批量操作、文件夹和标签增强第一阶段：批量设置分类、批量设置文件夹、批量追加标签、批量删除、重命名标签、删除标签；AI 配图候选优先使用图片知识库已完成，后续继续做更多跨模块深度集成。
2. 已完成：在技术方案正文编辑页增加“从图片知识库插入”能力。
3. 已完成：在正文配图阶段允许优先使用图片知识库候选，而不是总是 AI 生图。
4. 已完成：Word 导出时解析图片知识库插入图片的本地路径。
5. 已完成：增加引用记录写入和引用来源回溯。

验收：

- 可上传多张图片并生成本地缩略图。
- 可按文件夹/标签/标题/描述搜索。
- 删除图片时清理文件和 SQLite 记录。
- 技术方案正文可插入并导出到 Word。
- 已补充：正文编辑页插入图片素材、Main 侧 Markdown 引用生成、图片引用回溯展示、IPC/preload/types、`yibiao-asset://image-knowledge-base/...` 导出解析均有覆盖。
- 已补充：ImageKnowledgeBasePage 组件测试覆盖单图文件夹编辑、批量分类、批量设置文件夹、批量追加标签、批量删除、标签重命名和标签删除 bridge 调用；imageKnowledgeBaseStore 测试覆盖批量分类、批量设置文件夹、标签去重追加、批量删除、全局标签重命名和全局标签删除；Playwright 冒烟覆盖批量管理入口。
- 已补充：imageKnowledgeBaseStore 测试覆盖正文配图上下文自动匹配图片知识库并生成 Markdown 引用；ContentEditPage 测试覆盖“图片知识库”配图统计展示；正文生成任务语法检查覆盖 Main 侧优先引用与 AI 生图回退链路。

### 1.3 AI 评标

现状：

- 菜单入口：`ai-evaluation`。
- 2026-06-14 已完成第一阶段：移除二级菜单 `githubStarNotice`，新增 `ai-evaluation` 路由页面。
- 已支持从技术方案已导入的招标文件生成 AI 评标评分表，规则识别资格、商务、技术、报价、客观分、主观分等评分项。
- 已支持规则自评、证据摘录、扣分原因、人工分调整、风险等级、复核状态的编辑和 SQLite 持久化。
- 已新增 `ai_evaluation_meta` / `ai_evaluation_items` SQLite 表、Main Store、IPC/preload/types、单元测试和 E2E 冒烟。
- README 和 `client/doc/AI招标.md` 提到评标协助、专家评标结果审核、打分合理性、客观分交叉认证。
- 已补充第一阶段交付导出：AI 评标页面可导出 UTF-8 Markdown 自评报告，包含评分汇总、评分明细、高风险项、待复核项、证据摘录、扣分原因和处理建议。
- 2026-06-15 已完成第二阶段：AI 评标支持在已有评分表基础上独立导入投标文件，Main 侧复用文件解析并按投标正文为评分项匹配证据、更新风险和规则自评分。
- 2026-06-15 已完成第三阶段：AI 评标新增“AI 结构化抽取评分项”后台任务，Main 侧通过 `taskService` 启动 `ai-evaluation-extraction`，复用 `aiService.collectJsonResponse()` / `requestJson()` 抽取评分项 JSON，归一化到现有评分项字段并写入 `ai_evaluation_items`；任务状态持久化到 `ai_evaluation_tasks`，页面订阅 `tasks:event` 展示进度、完成和失败恢复。
- 2026-06-15 已完成第四阶段第一步：AI 评标新增 `ai_evaluation_bid_documents` / `ai_evaluation_bid_scores`，导入投标文件时保存 Markdown 原文到 `workspace/ai-evaluation/bid-documents/`，SQLite 保存多份投标文件元数据和逐文件评分快照；页面展示多投标文件评分汇总，Markdown 自评报告包含“投标文件评分汇总”。
- 2026-06-15 已完成第四阶段第二步：AI 评标新增 `ai_evaluation_audit_opinions` / `ai_evaluation_reports`，Main 侧根据高风险、待复核、客观分/报价核验和多投标文件横向分差生成审计意见；导出 Markdown 自评报告时保存报告快照，页面可恢复展示审计意见和最近报告。
- 2026-06-15 已完成第四阶段第三步：AI 评标新增 Word `.docx` 和 Excel `.xlsx` 正式报告导出，报告包含摘要、投标文件评分汇总、审计意见、评分明细、高风险项和待复核项；导出仍由 Main 侧执行并同步保存报告快照，页面提供 Word/Excel 导出入口。
- 2026-06-15 已完成第四阶段第四步：AI 评标新增 `ai-evaluation-batch-scoring` 后台任务，页面可一键“批量重评投标文件”，Main 侧读取已保存的投标文件 Markdown，逐份更新 `ai_evaluation_bid_scores`，刷新审计意见，并把 `batchScoringTask` 状态落到 `ai_evaluation_tasks` 供重启恢复和任务事件回放。
- 2026-06-15 已完成第四阶段第五步：AI 评标投标文件证据定位增强为“章节 / 行号 / 命中关键词”，评分项证据字段会携带 Markdown 章节标题和原文行号，并自然进入 Markdown、Word、Excel 报告。
- 2026-06-15 已完成第四阶段第六步：AI 评标新增 `ai_evaluation_expert_scores`，页面支持按评分项录入专家姓名、专家分和专家意见；Main 侧自动生成专家间分差、专家均分与当前最终分偏差的交叉审核意见，Markdown、Word、Excel 报告包含“专家打分交叉审核”。
- 2026-06-15 已完成第四阶段第七步：AI 评标专家打分扩展专家角色、评审会议和签名确认字段；SQLite v32 自动迁移旧专家记录，页面可录入角色/会议/签名状态，Main 侧为未签名记录生成审计意见，Markdown、Word、Excel 正式报告同步展示评审会议、专家角色和签名确认。
- 2026-06-15 已完成第四阶段第八步：AI 评标新增“导出会议纪要模板”，Main 侧基于当前评分表、投标文件、专家打分、签名状态和审计意见生成 `committee-minutes` 报告快照，并支持导出 Word `.docx` 评标委员会会议纪要模板；模板包含会议基本信息、委员会名单、评审对象、评分与复核摘要、会议审议事项、审计意见处理记录、会议纪要正文和签名确认表。

目标：

- 支持导入招标文件、评分办法、投标文件，模拟评标打分并输出评标报告。
- 聚焦资格、报价、客观分、评分项响应、打分合理性、专家打分交叉审核。
- 可用于投前自评，也可用于专家结果复核。

建议拆分：

1. 已完成：增加 AI 评标独立投标文件导入，不只依赖技术方案招标文件。
2. 已完成：将当前规则识别升级为 AI 结构化抽取任务，并写入后台任务状态。
3. 已完成主要结构：扩展 `ai_evaluation_*` 表族，已落地投标文件、评分任务、逐投标文件评分结果、专家打分、专家角色/评审会议/签名确认、审计意见、报告快照和评标委员会会议纪要模板；后续如做更完整正式评标委员会流程，可再追加独立会议表和专家权限。
4. 复用文件解析和技术方案 Step02 评分项提取能力。
5. 已完成主要流程：单份/多份投标文件可连续导入并保存评分结果；已升级为 Main 后台批量评分任务，支持基于已导入投标文件队列重评、进度、失败恢复和任务事件回放；后续如需要可再补取消/暂停。
6. 已完成主要流程：已生成专家复核、客观分/报价核验、多投标文件横向分差、专家打分交叉审核和专家签名待确认意见；已增强证据定位粒度，并支持记录专家角色、评审会议、签名状态和会议纪要模板。后续可继续补专家权限控制、独立会议表和正式评标委员会流程编排。
7. 已完成主要报告导出：已实现 UTF-8 Markdown 自评报告、Word `.docx` 正式报告、Excel `.xlsx` 多工作表报告和 Word `.docx` 评标委员会会议纪要模板导出，包含多投标文件评分汇总、审计意见、专家角色、评审会议和签名确认，并保存报告快照；后续可继续增强单位专属版式。

验收：

- 可从评分办法生成评分表。
- 已补充：可对至少一份投标文件输出结构化评分和证据。
- 支持重启恢复任务结果。
- 已补充：AI 评标自评报告 Markdown 导出由 Main 侧 UTF-8 写入，页面、IPC/preload/types 和报告内容均有测试覆盖。
- 已补充：AiEvaluationPage 组件测试覆盖投标文件导入调用；aiEvaluationStore 测试覆盖投标文件证据匹配、风险更新和未命中证据提示；Playwright 冒烟覆盖投标文件导入入口。
- 已补充：AiEvaluationPage 组件测试覆盖 AI 结构化抽取任务启动和任务状态展示；aiEvaluationStore 测试覆盖 AI JSON 归一化到评分项字段；taskService 测试覆盖 AI 评标 managed task 状态落盘和完成快照。
- 已补充：AiEvaluationPage 组件测试覆盖多投标文件评分汇总展示；aiEvaluationStore 测试覆盖多份投标文件元数据、Markdown 文件落盘、逐文件评分快照、自评报告汇总和清空缓存。
- 已补充：AiEvaluationPage 组件测试覆盖审计意见和最近报告快照展示；aiEvaluationStore 测试覆盖审计意见落库、报告快照保存、Markdown 报告审计意见章节和清空缓存。
- 已补充：AiEvaluationPage 组件测试覆盖 Word/Excel 正式报告导出按钮；aiEvaluationStore 测试覆盖 Word docx 包内容、Excel xlsx 多工作表内容和 Office 导出时报告快照保存。
- 已补充：aiEvaluationStore 测试覆盖投标文件证据命中的章节、行号和关键词提示。
- 已补充：AiEvaluationPage 组件测试覆盖批量评分后台任务启动和状态展示；aiEvaluationStore 测试覆盖已导入投标文件批量重评；taskService 测试覆盖 `ai-evaluation-batch-scoring` managed task 状态落盘和完成快照。
- 已补充：AiEvaluationPage 组件测试覆盖专家打分录入 bridge 调用；aiEvaluationStore 测试覆盖专家打分落库、专家分差审计意见、Markdown/Word/Excel 报告“专家打分交叉审核”内容。
- 已补充：AiEvaluationPage 组件测试覆盖会议纪要模板导出 bridge 调用；aiEvaluationStore 测试覆盖评标委员会会议纪要 Markdown、Word docx 包内容和 `committee-minutes` 报告快照保存；Playwright 冒烟覆盖空状态下会议纪要模板导出入口禁用态。

### 1.4 投标机会 / 标讯

现状：

- 菜单入口：`bid-opportunity`。
- 页面：`client/src/features/bid-opportunity/pages/BidOpportunityPage.tsx`。
- 2026-06-14 已完成第一阶段：移除菜单 `githubStarNotice`，页面从 Demo 改为可进入的投标机会工作台。
- 已支持手动录入/粘贴公告文本、规则解析关键字段、规则评分、风险提示、状态看板、删除机会。
- 已新增 `bid_opportunity_opportunities` SQLite 表、Main Store、IPC/preload/types、单元测试和 E2E 冒烟。
- README 承诺“标讯”等能力。
- 已补充第一阶段交付导出：投标机会页面可导出 UTF-8 Markdown 投标建议报告，包含机会看板、评分拆解、风险提示、重点机会详情和投前处理建议。
- 2026-06-15 已完成第二阶段：投标机会支持导入公告文件和读取公告 URL，Main 侧复用文件解析服务或 URL HTML 转文本后进入现有字段解析、评分和风险提示流程。
- 2026-06-15 已完成第三阶段：机会详情支持负责人、下一步动作和提醒时间维护，SQLite schema 升级到 v20，报告导出同步呈现跟进字段。
- 2026-06-15 已完成第四阶段：投标机会支持将已设置提醒时间的机会导出为 `.ics` iCalendar 文件，便于导入系统日历。
- 2026-06-15 已完成第五阶段：投标机会新增 AI 结构化解析入口，Main 侧通过 `aiService.collectJsonResponse()` / `requestJson()` 解析公告字段，失败或未配置 AI 时自动回退规则解析并提示人工复核。
- 2026-06-15 已完成第六阶段：投标机会保存时会读取 `knowledge_items`，按公告字段、资格要求、行业和关键词匹配企业知识库/历史项目资料，匹配结果保存到 `knowledge_matches_json` 并展示在页面详情和投标建议报告。
- 2026-06-15 已完成第七阶段：投标机会评分扩展为基础维度与经营维度组合，新增竞争强度、利润空间、工期可控性和历史中标相似度，评分拆解进入页面详情和投标建议报告。
- 2026-06-16 已完成第八阶段：投标机会新增多轮跟进记录和公告/沟通附件管理，SQLite schema 升级到 v31，页面、IPC/preload/types、报告导出和工作区附件复制/删除均已接入。

目标：

- 从公告线索到投标决策的机会工作台。
- 支持公告导入、网页/文件粘贴、关键字段解析、资质/业绩匹配、机会评分、跟进状态。

建议拆分：

1. 已完成主要结构：扩展 `bid_opportunity_opportunities`，已落地负责人、提醒、跟进动作和知识库匹配结果；已补充 `bid_opportunity_follow_ups` 与 `bid_opportunity_attachments`，支持多轮跟进和公告/沟通附件。
2. 已完成：增加公告文件导入和网页/URL 导入。
3. 已完成：将当前规则解析升级为 AI 结构化解析，并保留失败时的规则兜底。
4. 已完成：接入企业知识库/历史项目资料进行资质和业绩匹配。
5. 已完成：扩展机会评分：竞争强度、利润空间、工期、交付可行性、历史中标相似度。
6. 已完成：增加负责人、下一步动作、提醒时间和 iCalendar 日历导出。
7. 已完成：增加投标建议报告导出。

验收：

- 可保存机会并重启恢复。
- 已补充：至少支持手动录入、公告文件导入、公告 URL 读取和公告文本解析。
- 能输出投标建议和关键风险。
- 已补充：投标建议报告 Markdown 导出由 Main 侧 UTF-8 写入，页面、IPC/preload/types 和报告内容均有测试覆盖。
- 已补充：BidOpportunityPage 组件测试覆盖公告文件导入和 URL 导入调用；bidOpportunityStore 测试覆盖公告文件解析保存、URL HTML 转文本、脚本内容剔除和机会评分字段生成；Playwright 冒烟覆盖文件/URL 导入入口。
- 已补充：BidOpportunityPage 组件测试覆盖负责人、下一步动作和提醒时间保存调用；bidOpportunityStore 测试覆盖跟进字段持久化和报告导出内容。
- 已补充：BidOpportunityPage 组件测试覆盖提醒日历导出调用；bidOpportunityStore 测试覆盖 iCalendar 内容生成和 `.ics` 文件写入；Playwright 冒烟覆盖提醒日历导出入口。
- 已补充：BidOpportunityPage 组件测试覆盖 AI 解析保存调用；bidOpportunityStore 测试覆盖 AI 公告字段解析和 AI 失败时规则兜底。
- 已补充：BidOpportunityPage 组件测试覆盖知识库匹配结果展示；bidOpportunityStore 测试覆盖机会保存时匹配 `knowledge_items` 和报告输出“知识库/历史项目匹配”。
- 已补充：BidOpportunityPage 组件测试覆盖评分拆解维度展示；bidOpportunityStore 测试覆盖竞争强度、利润空间、工期可控性、历史中标相似度评分和报告输出。
- 已补充：BidOpportunityPage 组件测试覆盖新增/删除多轮跟进记录、附件导入、附件类型/备注更新和附件删除；bidOpportunityStore 测试覆盖跟进记录更新/删除、附件复制入工作区、附件元数据更新、删除附件时清理复制文件，以及报告输出“跟进记录”和“公告/沟通附件”。

### 1.5 技术方案 Step06“扩写改写”

现状：

- 2026-06-14 已完成：历史 `expand` 主 Step 已移除，页面不再出现未开发 Step06 占位。
- 当前主流程已有 `existing-plan-expansion` 模式和 Step05 正文扩写能力，扩写/补目录/原方案审计等运行阶段统一归入 `content-edit`。
- 旧工作区如果保存了 `step = 'expand'`，Main Store 和 Renderer storage 会兼容映射到 `content-edit`，避免用户卡在历史占位页。

目标：

- 明确 Step06 的产品定位：如果已有方案扩写模式已覆盖主需求，则移除旧 `expand` step；如果保留，则做成正文后处理工作台。
- 可做能力：章节级扩写、章节级改写、语气统一、删减冗余、人工校准、全文一致性二次审计、按评审意见修改。

建议拆分：

1. 后续如需“按评审意见修改/只润色/只删减冗余”，应作为 `content-edit` 内的章节后处理子流程，不再新增主 Step。
2. 章节级改写需要设计 Store 子状态、任务类型、撤销/确认覆盖规则。
3. Main 侧后台任务执行章节改写，并持续写入 `technical_plan_outline_nodes.content`。

验收：

- 不再出现未开发 Step06 占位。
- 旧 `expand` 状态可恢复到正文编辑页。

## 2. P1：开发者工具从 Demo 变真实调试台

### 2.1 Prompt 调试台

现状：

- 菜单入口：`developer-prompt-lab`。
- 2026-06-14 已完成第一阶段：`developer-prompt-lab` 从二级菜单 demo 改为真实 Prompt 调试台。
- 已支持选择招标解析、目录生成、评分大类提取、废标项提取、废标项 JSON 定稿等真实 prompt builder 链路。
- 已展示变量注入后的消息、消息数、字符规模、输出格式、输出约束，并支持复制不含 API Key、Base URL、本地路径和真实文件名的脱敏调试包。
- 2026-06-15 已完成第二阶段：Prompt 调试台业务链路目录扩展到全局事实预设、正文编排、正文生成、原方案还原和查重规则观察；其中正文/全局事实链路按 Main 侧任务约束提供可观察样本，查重链路明确为确定性规则观察包，不误标为模型 Prompt。

目标：

- 已完成主要目录覆盖：可选择招标解析、目录生成、全局事实、正文编排、正文生成、原方案还原、查重、废标项检查等业务链路；后续可继续把 Main 侧正文/全局事实 builder 抽到 shared，减少调试样本与任务实现之间的重复维护。
- 展示实际 Prompt 版本、变量注入结果、输入规模、截断策略、输出 schema、模型返回、JSON 修复结果。
- 支持保存调试记录到开发者日志，不写入敏感 API Key。

验收：

- 开发者模式下能复现一次真实 prompt 构建。
- 能导出或复制脱敏调试包。
- 第一阶段已用 Vitest 和 Playwright 覆盖页面渲染、链路切换和开发者模式入口。
- 已补充：`DeveloperToolsPage.test.tsx` 覆盖 Prompt 调试台扩展链路目录，确认全局事实、正文编排、正文生成、原方案还原和查重规则观察入口可见，并能切换查看章节计划 JSON 与查重规则观察包。
- 已补充：开发者工具页面代码已从 `DeveloperDemoPage` 命名清理为 `DeveloperToolsPage`，并删除不可达的二级菜单 demo shell，避免后续迭代误以为 Prompt 调试台、文件解析沙盘和导出链路预演仍是演示占位。
- 已补充：Prompt 调试台支持把当前脱敏调试包保存到 Main 侧 `logs/developer-prompt-lab/debug-records.jsonl`；`aiServiceJsonFailureSamples.test.ts` 覆盖 JSONL 写入和 API Key/本地路径二次脱敏，`DeveloperToolsPage.test.tsx` 覆盖 UI 调用 bridge，Playwright E2E 覆盖开发者模式下保存入口可见。

### 2.2 文件解析沙盘

现状：

- 菜单入口：`developer-parser-sandbox`。
- 2026-06-14 已完成第一阶段：`developer-parser-sandbox` 从二级菜单 demo 改为真实文件解析沙盘。
- 已支持选择本地解析、MinerU 精准、MinerU Agent，选择是否保留图片引用，打开样本文件并通过 Main 侧 `fileService.parseDocumentWithConfig()` 解析。
- 已展示文件信息、解析器、耗时、Markdown 字符数、行数、图片引用数量和 Markdown 预览。
- 2026-06-15 已完成第二阶段：解析沙盘支持对当前样本复用同一 `filePath` 选择另一解析器进行对比，展示字符数、行数、图片数、耗时差异和第二份 Markdown 预览；Main 侧 `parseDeveloperSample()` 增加可选 `filePath`，用于跳过文件选择框复跑同一样本。

目标：

- 导入任意样本文件，选择本地解析 / MinerU 精准 / MinerU Agent。
- 显示文件信息、解析耗时、Markdown、图片资产清单、页码/结构化摘要、错误阶段。
- 已完成：支持对比不同解析器输出。

验收：

- 已补充：同一文件可分别跑至少两种解析方式并对比输出，第二次解析通过首次结果的 `file.file_path` 复用同一样本。
- 解析失败有明确阶段、日志路径和建议。
- 第一阶段已用 Vitest 覆盖 file bridge 调用和解析结果展示。
- 已补充：`DeveloperToolsPage.test.tsx` 覆盖解析沙盘首次解析后点击“用另一解析器对比当前样本”，确认 bridge payload 带 `filePath`、对比解析器、差异摘要和第二份 Markdown 预览。

### 2.3 导出链路预演

现状：

- 菜单入口：`developer-export-preview`。
- 2026-06-14 已完成第一阶段：`developer-export-preview` 从二级菜单 demo 改为导出 dry-run 预演页。
- 已支持读取当前技术方案 `outlineData.outline[*].content`，统计章节、空章节、正文字符、图片、Mermaid、表格，并输出空章节、图片路径和 Mermaid 类型风险报告。
- 2026-06-15 已完成第二阶段：导出预演页新增 `export.previewWordExport()`，通过 Main 侧 `exportService.previewWordExport()` 调用真实 Word docx 构建链路并丢弃 buffer，只返回 preflight、warnings、docx 字节数和耗时；不打开保存对话框，也不覆盖用户文件。

目标：

- 读取当前技术方案权威正文，预演 Markdown -> Word 的块解析、表格、图片、Mermaid、页眉页脚、编号样式。
- 输出导出检查报告：空章节、图片缺失、Mermaid 转换失败、表格异常、耗时和 warnings。

验收：

- 不实际覆盖用户文件也能跑导出 dry-run。
- 报告可定位到章节和资源。
- 第一阶段已用 Vitest 覆盖真实技术方案状态读取和检查报告生成。
- 已补充：`DeveloperToolsPage.test.tsx` 覆盖导出预演页调用 `export.previewWordExport()` 并展示真实 Word dry-run 结果；`exportServiceHeader.test.ts` 覆盖 Main 侧 dry-run 生成 docx buffer 统计、预检缺图和 warnings，但不写输出文件。

### 2.4 Json 请求测试增强

现状：

- `developer-json-test` 已从单一目录生成链路扩展为通用 JSON 请求实验室。
- 已支持目录生成、全局事实、废标项检查三类真实 Prompt 场景选择，展示 schemaName、温度、消息数、字符规模、输出 Schema 和变量注入后的消息。
- 已支持通过 `aiClient.requestJson()` 运行选中场景，并通过共享 `buildJsonRepairMessages()` 回放失败样本，展示原始响应、校验问题、修复输入和修复结果。
- 已完成真实失败样本持久化第一阶段：JSON 请求或修复回放失败时，Renderer 通过 `window.yibiao.ai.saveJsonFailureSample()` 把有限字段保存到 Main 侧 `userData/logs/developer-json-lab/failure-samples.json`，页面可加载、回放和清空已保存样本。
- 已完成开发者日志回放第一阶段：Main 侧从 `userData/logs/ai/*.json` 筛选 JSON 请求日志，返回脱敏和截断后的模型响应片段；页面可直接回放修复，也可把日志保存为失败样本。
- 2026-06-15 已完成第三阶段：JSON 请求实验室新增商务标条款抽取、投标机会公告解析、AI 评标评分项抽取三类业务 schema，覆盖 P0 新增工作台的核心 JSON 链路。

目标：

- 已完成第一阶段：扩展为通用 JSON 请求实验室，支持选择 Prompt builder、schema、模型参数和失败样本回放。
- 已完成第一阶段：接入 JSON 修复链路对比，展示失败样本、校验问题、修复请求和修复结果。
- 已完成第二阶段：真实失败样本可持久化到 Main 侧诊断文件，并可从页面回放修复。
- 已完成第二阶段：开发者 AI 日志中的 JSON 响应可进入修复回放或保存为失败样本，且不向 Renderer 暴露完整 request prompt。
- 已完成：补充更多业务 JSON schema，当前覆盖目录生成、全局事实、废标项检查、商务标条款、投标机会公告解析和 AI 评标评分项。

验收：

- 已补充：至少支持目录生成、全局事实、废标项检查三类 JSON 输出测试。
- 已补充：`DeveloperTestPage.test.tsx` 覆盖三类场景渲染、全局事实切换、废标项 JSON 请求参数和 JSON 修复回放。
- 已补充：`DeveloperTestPage.test.tsx` 覆盖已保存失败样本加载、保存样本回放，以及 JSON 请求失败后调用 `ai.saveJsonFailureSample()`。
- 已补充：`DeveloperTestPage.test.tsx` 覆盖开发者日志加载、日志内容回放和保存为失败样本。
- 已补充：`aiServiceJsonFailureSamples.test.ts` 覆盖 Main 侧失败样本写入、列表读取、清空，以及 JSON 开发者日志安全抽取和脱敏。
- 已补充：`DeveloperTestPage.test.tsx` 覆盖商务标条款、投标机会公告解析、AI 评标评分项三类新增 schema 展示和商务标 JSON 请求参数。
- 已补充：Playwright 冒烟覆盖开发者模式下进入通用 JSON 请求实验室、查看六类 schema 场景、切换废标项检查场景、查看修复样本信息、“已保存失败样本”和“开发者日志回放”区域。

## 3. P1：已实现功能的明确缺口

### 3.1 导出格式：页眉与更完整 Word 样式

现状：

- 已完成核心页眉能力：`ExportFormatPage.tsx` 支持页眉开关、内容、字体、字号、对齐配置。
- `exportFormat` 类型和 `configStore.cjs` 默认值/归一化已覆盖页眉字段。
- `exportService.cjs` 已将页眉配置写入 Word `headers.default`，导出后的 `.docx` 包含 `word/header*.xml`。
- 已完成高级页眉能力：支持首页不同、奇偶页不同，`exportService.cjs` 会写入 `headers.first` / `headers.even`，并启用 Word 的 `titlePage` 与 `evenAndOddHeaderAndFooters` 设置。
- 已补充：导出格式页增加“导出效果说明”，展示首页、奇数页、偶数页实际会写入的页眉内容和生效状态，说明正文排版仍以导出的 Word 文件为准。

目标：

- 已完成：支持页眉开关、页眉内容、页眉字体、字号、对齐。
- 已完成：支持首页不同、奇偶页不同。
- 已完成：增加导出预览或示例说明，避免用户误以为所有配置已生效。

验收：

- 已通过：保存页眉配置后，技术方案 Word 导出实际包含页眉。
- 已通过：`exportService.cjs` 中页眉配置映射完整。
- 已补充：UI 单测、Main 侧 Word header XML 单测、Playwright smoke。
- 已补充：Main 侧 Word XML 单测覆盖常规页眉、首页页眉、偶数页页眉、`titlePage` 和奇偶页设置。
- 已补充：ExportFormatPage UI 单测覆盖页眉写入规则预览和首页/奇数页/偶数页展示。

### 3.2 设置页：语言、主题、布局

现状：

- 已完成核心通用外观配置：显示语言不再使用误导性的 disabled 控件，当前以只读“简体中文”展示。
- 已完成：应用主题支持跟随系统、浅色、深色，并通过根节点 `data-theme` 与 CSS 变量应用到全局外壳和设置页。
- 已完成：侧边栏布局支持经典/紧凑，紧凑布局会默认收起侧边栏。
- 已完成：`language`、`theme`、`sidebar_layout` 写入 `user_config.json`，旧配置会由 `configStore.cjs` 归一化补默认值。
- 2026-06-15 已完成历史页面深色覆盖第一阶段：补充 `--yb-bg-subtle` / `--yb-surface-soft` 主题变量和深色主题兼容层，覆盖资源下载、标书查重、废标项检查、开发者实验室、图片知识库和导出格式等旧浅色面板。
- 2026-06-15 已完成原生主题同步：Electron Main 启动时按 `user_config.json.theme` 设置 `nativeTheme.themeSource`，配置保存后同步更新原生主题，不再固定为浅色。
- `client/doc/设置页.md` 已同步当前通用配置状态，描述语言、主题、侧边栏布局和原生主题同步。

目标：

- 已完成：语言短期保持中文，不再以可操作 disabled 控件误导。
- 已完成：主题支持跟随系统、浅色、深色。
- 已完成：侧边栏布局支持经典/紧凑。
- 已完成第一阶段：审查并覆盖主要历史页面硬编码浅色卡片，资源、查重、废标和开发者实验室已进入 Playwright 回归；后续新增页面或遗漏页面继续按同一主题变量模式补齐。
- 已完成：Electron 原生主题随应用主题配置同步，`system` 交给系统，`light` / `dark` 明确覆盖。

验收：

- 已通过：配置保存到 `user_config.json` 并可重新加载恢复。
- 已通过：全局外壳、侧边栏、设置页按主题切换。
- 已补充：Main 侧 `nativeTheme` 主题源归一化单测，覆盖 `system` / `light` / `dark` 和非法值回退。
- 已补充：设置页 UI 单测、Main 配置 Store 单测、Playwright 主题/紧凑布局 smoke，以及深色主题下资源下载、标书查重、废标项检查和开发者实验室核心面板不回退白底的 E2E 断言。

### 3.3 模型列表与本地模型体验

现状：

- 已完成核心本地文本模型入口：Ollama 通过 `local-gemma` / `local-qwen` 明确 provider 暴露，LM Studio 通过 `lm-studio` provider 暴露，vLLM、llama.cpp、Jan 通过各自 provider 暴露。
- 已完成：Ollama provider 默认使用 `http://127.0.0.1:11434/v1`，拉取模型时走 Ollama `/api/tags`。
- 已完成：LM Studio provider 默认使用 `http://127.0.0.1:1234/v1`，拉取模型时走 OpenAI-compatible `/models`。
- 已完成：vLLM provider 默认使用 `http://127.0.0.1:8000/v1`，llama.cpp provider 默认使用 `http://127.0.0.1:8080/v1`，Jan provider 默认使用 `http://127.0.0.1:1337/v1`，拉取模型时均走 OpenAI-compatible `/models`。
- 已完成：Codex CLI、Ollama、LM Studio、vLLM、llama.cpp、Jan 均为免 API Key provider，不保存 API Key。

目标：

- 已完成：将 Ollama、LM Studio、vLLM、llama.cpp、Jan 做成明确文本模型 provider。
- 已完成：接入模型列表：OpenAI-compatible `/models`、Ollama `/api/tags`、LM Studio/vLLM/llama.cpp/Jan OpenAI `/v1/models`。
- 待增强：后续如新增其他本地 OpenAI-compatible 服务，可按同一 provider/default/listModels 模式扩展。

验收：

- 已通过：Ollama/LM Studio/vLLM/llama.cpp/Jan 可一键填入默认 Base URL 并拉取模型。
- 已通过：Codex CLI provider 保持不保存 API Key。
- 已补充：Main 侧模型列表服务单测、设置页 LM Studio/Jan 保存单测、Playwright LM Studio/Jan 入口 smoke。

### 3.4 生图模型与正文配图增强

现状：

- 已支持金龙、火山方舟、Google AI Studio、自定义 OpenAI-like。
- 已完成第一阶段配图报告：`contentGenerationTask.cjs` 的 `stats.images` 会在正文生成后保留 AI 生图 / Mermaid / 图片知识库的计划、尝试、成功、失败、跳过统计，并写入任务日志摘要。
- `ContentEditPage.tsx` 已向普通用户展示“配图策略报告”，开发者模式下仍保留更细的调试统计浮层。
- 已复核图例格式、图片居中、全屏预览和 Word 导出排版：Markdown `图：...` 图例在 Renderer/Word 均居中，正文图片可点击打开预览弹窗。

目标：

- 已完成：给正文生成增加更明确的配图策略报告：本次计划生成多少 AI 图、多少 Mermaid、命中多少图片知识库素材、成功/失败数。
- 已完成：开发者模式下显示配图调试浮层，任务日志写入配图摘要。
- 已完成：统一图片图例格式、居中样式和 Word 导出效果，并补充 Word XML 防回归测试。
- 已完成：图片点击全屏预览验收，补充 `ContentEditPage` 交互测试。

验收：

- 已通过：一次正文生成结束后，用户能看到配图成功/失败统计。
- 已补充：ContentEditPage 配图报告组件单测。
- 已补充：导出的 Word 图片段落和 `图：...` 图例段落均保持居中排版的单测。
- 已补充：正文 Markdown 图片点击后打开全屏预览弹窗的单测。

### 3.5 技术方案：全文一致性审计产品化

现状：

- `client/doc/全文一致性.md` 描述了“全文一致性审计”开关和局部修复思路。
- 当前 `ContentEditPage` 已出现“一致性审计”相关文案和配置。
- 已完成第一阶段产品化：Main 侧正文生成任务会在 `stats.audit` 中保存结构化审计报告，包含冲突项、修复状态、需人工核对项和失败审计分组；Renderer 向普通用户展示“全文一致性审计报告”。
- 已完成第二阶段闭环：审计报告项支持跳转章节、进入编辑、预填单章节重新审计要求、将人工处理项持久化标记为已处理。
- 已完成第三阶段恢复：失败审计分组保存涉及章节清单，可一键启动 audit-only 复审任务，不重写正文、不配图。

目标：

- 在正文生成配置中明确开关、范围和成本提示。
- 已完成：审计后保存审计报告：冲突项、修复项、未修复项、涉及章节。
- 已完成第一阶段：用户可查看审计摘要、冲突证据、原因、处理状态、失败审计组。
- 已完成：支持用户在报告中直接跳转到章节、编辑章节、标记已处理、重新审计单个未修复项。
- 已完成：支持一键重新审计失败分组。

验收：

- 已通过：开启审计后，生成流程中能看到审计阶段和结果摘要。
- 已补充：ContentEditPage 审计报告组件单测，覆盖已修复项、需人工核对项和失败审计分组。
- 已补充：ContentEditPage 审计报告操作单测，覆盖跳转章节、编辑章节、单个未修复项重新审计和标记已处理。
- 已补充：ContentEditPage 失败分组复审单测，覆盖 audit-only 任务参数和章节清单。

### 3.6 已有方案扩写：覆盖审计与人工校准

现状：

- 已有方案扩写模式已接入主流程。
- 已完成原方案覆盖审计可视化第一阶段：Main 侧 `stats.originalCoverage` 保存来源段覆盖状态、覆盖率、已补回项、需人工核对项和失败章节；Renderer 在扩写模式展示“原方案覆盖审计报告”。
- 已完成未分配原方案段落人工处理：Main 侧保存 `stats.originalCoverage.unassigned_items`，Renderer 提供绑定章节和忽略操作，绑定后同步章节正文与 `original_material`。
- 已完成核心承诺保留审计摘要：Main 侧从 `originalCoverage.items` 派生 `commitment_summary`，按服务响应、售后质保、交付周期、技术路线、人员设备等类别汇总原方案核心承诺保留率和风险项；Renderer 在原方案覆盖审计报告中展示“核心承诺保留审计”。

目标：

- 已完成第一阶段：对扩写模式补齐“原方案覆盖审计”可视化，展示覆盖率、部分覆盖、未覆盖、冲突、已补回和失败章节。
- 已完成：未分配原方案段落进入人工处理区，可手动绑定章节或忽略。
- 已完成：扩写后对比原方案核心承诺是否保留，核心承诺风险项可直接在审计报告中查看。

验收：

- 已补充：扩写任务结束后能看到覆盖率和未覆盖段落。
- 已补充：ContentEditPage 原方案覆盖审计报告单测。
- 已补充：ContentEditPage 未分配原方案段落处理单测，覆盖绑定章节和忽略。
- 已完成：用户能处理未分配原方案段落；绑定后相关章节会带着原文段进入后续优化扩写。
- 已补充：Main 侧核心承诺汇总纯函数单测，覆盖服务承诺、质保承诺、周期承诺的分类、保留率和风险数量；ContentEditPage 单测覆盖核心承诺保留摘要和风险项展示。

### 3.7 知识库：统一任务服务与算法优化

现状：

- 文档知识库已有 SQLite、迁移、上传、提取、匹配、查看、排序等能力。
- 已完成恢复面第一阶段：知识库服务新增文档级 active task 快照，Renderer 首次加载会合并仍在处理的文档并展示“正在处理 N 个文档”提示条。
- `client/doc/sqlite改造方案_知识库.md` 曾明确本轮不纳入 AI 提示词和匹配算法重构、技术方案引用知识库算法重构、图片资产存储方式重构、接入统一 `taskService.cjs`；其中统一任务面已开始补齐，技术方案引用知识库已完成第一阶段本地相关性筛选，知识库处理侧 AI 匹配 Prompt 仍可继续增强。

目标：

- 将知识库处理任务接入统一任务系统，支持 `scope-exclusive(documentId)`。
- 已完成第一阶段：在迁入统一任务系统前，先暴露现有 `activePreparations` / `activeMatches` 的文档级快照，补齐页面重载后的运行态可见性。
- 2026-06-15 已完成第二阶段：`taskService` 新增 `knowledge-base-preparation` / `knowledge-base-matching` 任务定义，统一 active task 列表会合并知识库文档级任务，并保留 `scope_id=documentId` / `scope-exclusive`；内部 active task key 已支持同类型不同 scope，避免后续托管知识库任务时互相折叠。
- 2026-06-15 已完成第三阶段第一步：技术方案正文编排前会按当前小节标题、描述、上级章节和项目概述对知识库轻量条目做本地相关性排序，只把强相关候选交给该小节 Prompt，并附带 `relevance_score`、`matched_terms` 和 `relevance_reason`；编排日志记录“知识库候选 x/y、选用 n 条”，减少无关条目进入模型上下文。
- 2026-06-15 已完成第三阶段第二步：知识库段落匹配批次不再默认重复提交全文 block；Main 侧会按本批知识条目的 title/summary 对 block 做本地候选筛选，只把相关候选 block 交给 AI，日志记录候选 block 数、全文 block 数、是否预筛选和匹配词；遗漏恢复阶段仍基于未覆盖 block 兜底，降低预筛选漏召回风险。
- 技术方案引用知识库时提供更强相关性筛选和可解释引用。
- 图片资产管理与图片知识库打通。

验收：

- 已补充：多文档知识库任务进入统一 `taskService.getActiveTasks()` 后，不同 documentId 会保留独立 `scope_id`，不被同类型任务折叠。
- 已补充：页面重启后可读取并展示文档级 active task 快照。
- 已补充：KnowledgeBasePage active task 快照单测。
- 已补充：taskService 知识库文档级 active task 单测，覆盖 `scope-exclusive(documentId)` 和订阅事件快照。
- 已补充：contentGenerationTask 单元测试覆盖章节相关性预筛选，确认售后服务章节只保留强相关知识条目，并在 Prompt JSON 中输出 `relevance_reason` / `matched_terms`，无关条目不进入该小节候选。
- 已补充：knowledgeBaseService 单元测试覆盖批次级候选 block 预筛选，确认售后服务知识条目只把相关 block 放入匹配 Prompt，施工安全等无关 block 不进入该批次上下文。

### 3.8 标书查重：忽略规则、相似图片和报告导出

现状：

- 查重四类分析已实现：元数据、目录、正文、图片。
- 已完成人工处理状态第一阶段：正文重复句和重复图片组支持 `pending` / `confirmed` / `ignored` 持久化状态，页面可确认重复、忽略和恢复待处理；已忽略项默认从列表隐藏。
- 已完成人工批量处理第二阶段：新增 `duplicateCheck.batchHandleItems()` IPC/bridge，支持对当前正文或图片结果批量确认、批量忽略、恢复已忽略和删除当前显示结果。
- 已完成正文忽略规则第一阶段：正文重复句可加入常用忽略规则，规则写入 SQLite `duplicate_check_content_ignore_rules`，当前与未来相同 normalized 正文会自动标为已忽略，页面可查看和删除规则。
- 已完成报告导出第一阶段：查重结果页可通过 `duplicateCheck.exportReport()` 导出 Markdown 报告，Main 侧汇总文件范围、四类分析状态、元数据风险、目录重复组、正文重复句、图片重复组和人工处理状态，并用 UTF-8 写入用户选择路径。
- 已完成报告批量处理建议第二阶段：Markdown 报告新增“批量处理建议”，按正文/图片结果的未处理、已确认、已忽略数量和正文忽略规则数量生成交付前行动清单。
- 2026-06-15 已完成报告导出第三阶段：查重结果页新增 Word 报告导出入口；Main 侧继续复用 `buildDuplicateCheckReportMarkdown()` 的同一份报告内容，通过 `docx` 生成 `.docx` 文件，保留标题、段落、项目符号和表格内容。
- 2026-06-15 已完成报告导出第四阶段：查重结果页新增 PDF 报告导出入口；Main 侧继续复用 `buildDuplicateCheckReportMarkdown()` 的同一份报告内容，生成带 CJK 字体声明的文本型 PDF。
- 2026-06-15 已完成相似图片检测第一阶段：图片比对在 SHA 精确 hash 之外增加可选 64 位平均感知 hash，跨投标文件图片在尺寸比例接近且感知 hash 距离足够小时生成“相似图片”组；SQLite `duplicate_check_duplicate_images` 持久化 `match_type`、`similarity_score` 和 `similarity_reason`，页面和 Markdown/Word/PDF 报告展示相似度与原因。
- 2026-06-15 已完成相似图片复核视图第一阶段：查重 Markdown/Word/PDF 报告在图片表格后新增文本型“相似图片复核视图”，按图片组输出涉及文件、判断依据、复核建议、图序、目录和图片前文上下文。
- 2026-06-15 已完成 PDF 图形化复核卡第一阶段：查重 PDF 会把相似图片复核视图中的图片组、图序和复核建议绘制为带边框和高亮背景的图形卡片，而不只是纯文本行。
- 2026-06-15 已完成正文忽略规则第四阶段：规则新增分类字段（手动忽略、招标引用、固定模板、批量规则），查重结果页可导出/导入 JSON 规则包；导入时按 normalized 去重并写回 SQLite，当前和未来相同正文会自动标为已忽略，可用于不同项目之间迁移规则。
- 2026-06-15 已完成复杂相似图证据视图第一阶段：相似图片复核视图可读取图片组和单文件位置上的预览素材、尺寸、裁剪框、旋转角、水印提示、页码和截图区域等元数据，并进入 Markdown、Word 和 PDF；PDF 会把视觉证据行纳入图形化复核卡。
- 2026-06-15 已完成相似图片旋转检测第一阶段：图片分析会为真实图片生成 0/90/180/270 度感知 hash 变体，相似图片分组按最佳旋转方向比较，支持宽高互换的 90/270 度旋转图成组，并在结果中记录 `rotation_degrees` 与旋转判断依据。
- 2026-06-15 已完成相似图片水印提示第一阶段：图片分析会用 8x8 亮度网格识别右下角高对比水印/角标，将 `watermark_hint` 写入相似图片组并通过 SQLite v34 持久化，报告层复用已有视觉证据视图输出水印提示。
- 2026-06-15 已完成相似图片内容裁剪框第一阶段：图片分析会基于真实图片 8x8 亮度网格估算非背景内容边界，生成 `crop` 内容裁剪框并通过 SQLite v35 持久化，报告视觉证据视图会输出裁剪框。
- 2026-06-15 已完成更细粒度截图局部裁剪检测第一阶段：图片感知签名继续使用 8x8 pHash 保持相似度稳定，裁剪框检测额外采样 16x16 亮度网格，优先输出更贴近截图主体的局部裁剪框，检测不到时回退原 8x8 裁剪。
- 当前相似图片检测已覆盖压缩、缩放、旋转、右下角水印/角标提示、主体内容裁剪框和 16x16 细粒度截图局部裁剪后的相似图，文本型复核上下文、视觉证据元数据卡和 PDF 图形化复核卡第一阶段也已完成。
- 2026-06-16 已完成查重文档和页面占位清理：`client/doc/标书查重.md` 已从早期 mock/设计稿改为当前真实能力说明，`DuplicateCheckPage` 不再残留“后续接入查重任务”的过期占位文案。

目标：

- 增加正文重复忽略规则：招标文件引用句、常用固定句、用户手动忽略、批量忽略。
- 已完成第三阶段：正文重复句可保存为常用忽略规则；重新查重时相同 normalized 文本自动忽略。
- 已完成第四阶段：正文忽略规则支持分类、JSON 导出和 JSON 导入，导入后可跨项目复用规则并自动忽略命中的当前正文重复句。
- 已完成第二阶段：正文重复句和重复图片组支持当前结果批量确认、批量忽略、恢复已忽略和删除当前显示结果。
- 已完成第一阶段：增加目录/正文/图片结果 Markdown 导出报告。
- 已完成第二阶段：查重 Markdown 报告包含按当前处理状态生成的批量处理建议。
- 已完成第三阶段：导出报告新增 Word `.docx` 版本。
- 已完成第四阶段：导出报告新增文本型 PDF 版本。
- 已完成相似图片检测第一阶段：增加感知 hash、尺寸比例约束和压缩/缩放图相似度提示。
- 已完成相似图片旋转检测第一阶段：增加 0/90/180/270 度感知 hash 变体、宽高互换旋转比例判断和旋转角度提示。
- 已完成相似图片水印提示第一阶段：增加右下角高对比水印/角标启发式检测、`watermark_hint` 持久化和报告视觉证据输出。
- 已完成相似图片内容裁剪框第一阶段：增加基于 8x8 亮度网格的非背景内容边界估算、`crop` 持久化和报告视觉证据输出。
- 已完成更细粒度截图局部裁剪检测第一阶段：在真实图片签名中额外采样 16x16 亮度网格，优先用细网格生成局部截图裁剪框并回退 8x8 检测。
- 已完成相似图片复核视图第一阶段：导出 Markdown/Word/PDF 均包含文本型相似图片复核视图。
- 已完成 PDF 图形化复核卡第一阶段：PDF 报告会用绘制矩形、边框和高亮背景呈现相似图片复核卡。
- 已完成复杂相似图证据视图第一阶段：报告可承接并输出预览素材、尺寸、裁剪框、旋转、水印、页码和截图区域等视觉证据元数据。
- 已完成第一阶段：增加结果人工处理状态：未处理、已确认、已忽略。

验收：

- 已补充：用户可忽略或确认正文重复句、重复图片，状态写入 SQLite，重启后由 Store 恢复。
- 已补充：DuplicateCheckPage 组件测试覆盖已忽略正文项隐藏、确认重复调用和状态刷新。
- 已补充：DuplicateCheckPage 组件测试覆盖当前结果批量忽略调用 `duplicateCheck.batchHandleItems()` 并刷新显示；Main/preload/IPC 语法检查通过。
- 已补充：DuplicateCheckPage 组件测试覆盖正文重复句加入常用忽略规则，确认调用 `duplicateCheck.saveContentIgnoreRule()` 并刷新规则列表；SQLite runtime migration 与 `sql/workspace_schema.sql` 已同步到 v19。
- 已补充：DuplicateCheckPage 组件测试覆盖查重报告导出按钮调用 `duplicateCheck.exportReport()`。
- 已补充：duplicateCheckStore 报告导出测试覆盖“批量处理建议”，确认正文/图片未处理、已确认、已忽略和正文忽略规则数量会进入报告。
- 已通过：可导出 UTF-8 Markdown 查重报告。
- 已补充：DuplicateCheckPage 组件测试覆盖 Markdown / Word / PDF 三个导出入口分别调用 `duplicateCheck.exportReport({ format })`；duplicateCheckStore 测试解压生成的 docx 并检查“标书查重报告”“批量处理建议”、正文重复句和重复图片内容，PDF 测试检查 `%PDF-` 文件头、CJK 字体声明和查重报告核心文本进入 PDF 字节；Playwright 冒烟覆盖标书查重二级入口和 mock bridge PDF 导出调用。
- 已通过：可导出 Word `.docx` 查重报告。
- 已通过：可导出文本型 PDF 查重报告。
- 已补充：duplicateCheckService 单元测试覆盖不同原始 hash 的图片按感知 hash 距离聚合为“相似图片”；DuplicateCheckPage 组件测试覆盖相似图片、相似度和原因展示；duplicateCheckStore 报告测试覆盖 Markdown/Word/PDF 报告输出“重复/相似图片”、类型、相似度和相似原因。
- 已补充：duplicateCheckStore 报告导出测试覆盖文本型“相似图片复核视图”进入 Markdown、Word `.docx` 和 PDF，且包含图片组、投标文件、图序、目录、前文、判断依据和人工复核建议；PDF 测试额外检查图形化复核卡的矩形绘制、高亮填充和边框指令。
- 已补充：duplicateCheckStore 报告导出测试覆盖复杂相似图视觉证据元数据，确认 Markdown、Word 和 PDF 均包含图片预览引用、尺寸、裁剪框、旋转、水印提示、页码和截图区域。
- 已补充：duplicateCheckService 单元测试覆盖 90 度旋转且宽高互换的相似图片成组，确认 `rotation_degrees` 和旋转判断依据进入结果，并保持旧无旋转元数据的感知 hash 比对不误召回无关图片。
- 已补充：duplicateCheckService 单元测试覆盖右下角高对比水印/角标启发式检测，以及水印提示随相似图片组成组进入 `watermark_hint`。
- 已补充：duplicateCheckService 单元测试覆盖基于 8x8 亮度网格估算主体内容裁剪框，以及裁剪框随相似图片组成组进入 `crop`。
- 已补充：duplicateCheckService 单元测试覆盖基于 16x16 亮度网格估算更细粒度截图局部裁剪框。
- 已补充：DuplicateCheckPage 组件测试覆盖正文忽略规则分类保存、分类展示、导出规则和导入规则；duplicateCheckStore 测试覆盖分类规则 JSON 导出后在另一个临时工作区导入并恢复分类；Playwright 冒烟覆盖查重结果页规则导入/导出 bridge 调用。
- 已补充：DuplicateCheckPage 组件测试覆盖当前查重结果页不再展示“后续接入查重任务”过期占位文案；`client/doc/标书查重.md` 已同步元数据、目录、正文、图片、人工处理、忽略规则和 Markdown/Word/PDF 报告现状。

### 3.9 废标项检查：报告导出与证据定位增强

现状：

- 废标项检查、错别字检查、逻辑谬误检查已有并发任务和 UI。
- 已完成报告导出第一阶段：检查结果页可通过 `rejectionCheck.exportReport({ format: 'md' })` 导出 UTF-8 Markdown 报告，Main 侧汇总招标/投标文件范围、无效与废标项解析状态、废标风险、错别字、逻辑谬误和处理建议。
- 已完成人工处理状态第一阶段：废标风险、错别字、逻辑谬误结果支持 `pending` / `ignored` 持久化状态；页面可忽略、恢复和删除，已忽略项默认从列表隐藏，报告导出只统计未忽略项并记录忽略数量。
- 已完成人工批量处理第二阶段：新增 `rejectionCheck.batchHandleFindings()` IPC/bridge，支持按当前结果类型和投标文件筛选范围批量忽略、恢复已忽略和删除当前显示结果。
- 已完成单文件重查第一阶段：检查结果页在筛选到具体投标文件后可重新检查当前投标文件；`rejectionCheckTask` 支持 `targetBidDocumentIds`，只替换目标投标文件的废标/错别字/逻辑问题结果，保留其他投标文件结果。
- 已完成报告证据定位第一阶段：Markdown 报告新增“证据定位明细”小节，按废标项、错别字、逻辑问题展开投标文件、位置线索、原文/证据、原因和建议，且不导出已忽略结果。
- 已完成报告章节/前后文定位第二阶段：Markdown 报告会在投标文件正文中匹配原文证据，输出章节、行号、匹配文本和前后文片段，无法精确定位时给出人工检索提示。
- 已完成报告锚点索引第三阶段：Markdown 报告的“证据定位明细”新增索引表，每条废标风险、错别字和逻辑问题都有稳定 HTML 锚点，索引标题可跳转到对应证据明细。
- 已完成报告导出第四阶段：检查结果页新增 Word 导出按钮，`rejectionCheck.exportReport({ format: 'docx' })` 复用同一份 Markdown 报告内容生成 `.docx`，保留证据定位明细、索引表和未忽略结果口径。
- 2026-06-15 已完成报告导出第五阶段：检查结果页新增 PDF 导出按钮，`rejectionCheck.exportReport({ format: 'pdf' })` 复用同一份 Markdown 报告内容生成文本型 PDF，保留证据定位明细、索引表和未忽略结果口径。
- 2026-06-15 已完成报告证据视图第六阶段第一步：Markdown 证据明细新增“证据截图视图”文本型区块，按同一证据编号输出目标行、前后文和目标行标记，并随同一份 Markdown 进入 Word `.docx` 和文本型 PDF。
- 2026-06-15 已完成 PDF 图形化证据卡第二步：废标项检查 PDF 会把“证据截图视图”的目标行和上下文绘制为带边框、背景和目标行高亮的图形化证据卡。
- 2026-06-15 已完成页面截图候选接入第一阶段：废标报告证据明细会读取投标文档上的页面截图候选元数据，按证据行号匹配页图，输出页码、素材路径、裁剪框/裁剪状态和说明，并随 Markdown、Word、PDF 导出；PDF 会把页面截图候选行纳入图形化证据卡。
- 2026-06-15 已完成页面截图候选导入和持久化第一阶段：废标文件导入会以保留图片模式解析 Markdown，从 Markdown 图片和 HTML `<img>` 引用提取页面截图候选，正文仍清理图片后用于检查；`rejection_check_documents.page_screenshots_json` 持久化候选元数据，重启后报告层可继续使用。
- 2026-06-15 已完成页面截图候选自动裁剪第一阶段：导入阶段会为页面截图候选推断覆盖正文行号范围，报告定位到证据行后在无现成裁剪框时自动生成页内估算裁剪框，并明确标注为“自动生成裁剪框”。
- 2026-06-15 已完成 PDF 原文页面像素级截图生成第一阶段：废标项检查导入本地 PDF 时，会用 `pdf-parse` 同版本 `pdfjs-dist` 和 `@napi-rs/canvas` 渲染每页 PNG，保存为 `yibiao-asset://imported-images/...` 页面截图候选，并携带页码、宽高和自动行号范围；Markdown 图片候选仍作为补充。
- 2026-06-15 已完成 Office 原文页面截图生成第一阶段：废标项检查导入 DOCX/DOC/WPS 时，会 best-effort 调用本地 LibreOffice/Office 转 PDF，再复用 PDF 页渲染生成页面 PNG 候选；转换失败不阻断导入，会继续保留 Markdown 图片候选。
- 2026-06-15 已完成 MinerU 返回图片候选第一阶段：MinerU 精准 / MinerU Agent 解析后的 Markdown 或 zip 图片会被重写为本地 `yibiao-asset://imported-images/...`，废标导入会标记为 `mineru-remote-image` 页面截图候选，并从“第 N 页”或 `page-N` 图片说明中恢复页码；离线单测覆盖该候选结构。
- 2026-06-16 已完成真实原文截图裁剪第一阶段：废标报告导出时会从页面截图候选源图生成 `rejection-check-evidence-crops` 裁剪 PNG，Markdown 报告引用裁剪图，Word 报告嵌入裁剪图，PDF 报告保留裁剪图资产引用并继续输出图形化证据卡。
- 2026-06-16 已完成废标项检查文档占位清理：`client/doc/废标项检查.md` 已从早期页面草稿改为当前真实能力和后续开发约束，`projectDocs.test.ts` 防止“占位/可删除”旧口径回流。
- MinerU-Agent 真实网络解析回归已通过，确认远程 Markdown 可返回样本文本；MinerU 精准解析真实端到端回归保留为可选增强，可在具备 MinerU Token 和网络的环境中补跑并固化真实返回 zip 中的页图命名、Markdown 引用和候选元数据。

目标：

- 已完成第一阶段：导出 Markdown 废标项检查报告，包含风险项、错别字、逻辑问题、严重级别、原文证据、建议。
- 已完成第四阶段：导出 Word `.docx` 废标项检查报告，复用 Markdown 报告内容并包含证据定位索引和明细。
- 已完成第五阶段：导出 PDF 废标项检查文本报告，复用 Markdown 报告内容并包含证据定位索引和明细。
- 已完成报告证据视图第六阶段第一步：导出 Markdown/Word/PDF 均包含文本型证据截图视图。
- 已完成报告证据视图第六阶段第二步：PDF 中的目标行和上下文会绘制为图形化证据卡。
- 已完成真实原文截图裁剪第一阶段：导出报告时按已有裁剪框或自动裁剪框生成真实裁剪 PNG；Markdown 引用裁剪图，Word 嵌入裁剪图，PDF 保留裁剪图资产引用。
- 已完成页面截图候选接入第一阶段：当投标文档状态携带 `pageScreenshots` / `pageImages` 等页面截图候选时，证据截图视图会输出匹配页、素材路径、裁剪框或待裁剪状态，并进入 Markdown、Word 和 PDF。
- 已完成页面截图候选导入和持久化第一阶段：废标项检查导入投标/招标文件时会保留解析图片资产、生成 `pageScreenshots` 候选并写入 SQLite，检查正文继续使用去图片 Markdown。
- 已完成页面截图候选自动裁剪第一阶段：`pageScreenshots` 候选会携带自动推断的正文行号范围；报告层按证据行号匹配候选页，在没有精确裁剪框时生成页内估算裁剪框，供 Markdown、Word 和 PDF 复核。
- 已完成 PDF 原文页面像素级截图生成第一阶段：本地 PDF 导入时会渲染 PDF 页为 PNG 资产并生成页面截图候选。
- 已完成 Office 原文页面截图生成第一阶段：DOCX/DOC/WPS 导入时会通过本地 Office/LibreOffice 转 PDF 后生成页面 PNG 截图候选；无法转换时不影响导入和 Markdown 图片候选。
- 已完成 MinerU 返回图片候选第一阶段：远程解析返回的 Markdown 图片会进入页面截图候选，并带有 `mineru-remote-image` 来源、页码恢复和自动行号范围。
- MinerU-Agent 真实网络解析回归已通过；MinerU 精准解析真实网络端到端回归作为可选增强，可在具备 Token 和网络后补跑固化。
- 已完成第一阶段：支持按投标文件筛选、单项删除、单项忽略和恢复。
- 已完成第二阶段：增加批量删除、批量忽略和批量恢复。
- 已完成证据定位第一阶段：废标风险、错别字和逻辑问题支持复制带投标文件、位置线索、原文/证据、原因和建议的证据文本；错别字列表直接展示位置线索。
- 已完成报告证据定位第一阶段：导出 Markdown 报告包含可交付的证据定位明细。
- 已完成报告定位第二阶段：导出 Markdown 报告包含章节、行号和前后文片段。
- 已完成报告锚点索引第三阶段：导出 Markdown 报告包含可点击证据索引和稳定锚点。
- 已完成报告导出第四阶段：导出 Word 报告包含证据定位索引和证据明细。
- 已完成报告导出第五阶段：导出 PDF 文本报告包含证据定位索引和证据明细。
- 已完成报告证据视图第六阶段第一步：导出 Markdown/Word/PDF 均包含文本型“证据截图视图”，标记目标行和前后文。
- 已完成报告证据视图第六阶段第二步：PDF 中的目标行和上下文会绘制为图形化证据卡。
- 已完成真实原文截图裁剪第一阶段：导出报告时按页面截图候选源图和裁剪框生成裁剪 PNG，并进入 Markdown / Word / PDF 报告证据区。
- 已完成第一阶段：增加“重新检查单个投标文件”能力，按当前结果类型和当前投标文件筛选启动后台任务。

验收：

- 已补充：RejectionCheckPage 组件测试覆盖检查结果页分别调用 `rejectionCheck.exportReport({ format: 'md' })`、`rejectionCheck.exportReport({ format: 'docx' })` 和 `rejectionCheck.exportReport({ format: 'pdf' })`。
- 已补充：RejectionCheckPage 组件测试覆盖已忽略废标风险隐藏、忽略调用 `rejectionCheck.resolveFinding()` 并刷新状态。
- 已补充：RejectionCheckPage 组件测试覆盖批量忽略、批量删除调用 `rejectionCheck.batchHandleFindings()`；Main/preload/IPC 语法检查通过。
- 已补充：rejectionCheckStore 单元测试覆盖 Markdown 证据定位明细和 Word `.docx` 包内容，解压检查 `word/document.xml` 包含报告标题、证据定位明细、风险项、原文证据和逻辑问题，并排除已忽略证据。
- 已补充：rejectionCheckStore 单元测试覆盖 PDF 文本报告，确认 `%PDF-` 文件头、CJK 字体声明、报告标题、证据定位明细、风险项和原文证据进入 PDF 字节，且不包含已忽略证据。
- 已补充：fileService 解析能力单测覆盖废标导入阶段从 Markdown 图片和 HTML `<img>` 提取页面截图候选；rejectionCheckStore 单元测试覆盖页面截图候选元数据持久化，以及 Markdown、Word 和 PDF 均包含匹配页码、页面图片素材路径和裁剪框状态。
- 已补充：fileService 解析能力单测覆盖页面截图候选自动行号范围；rejectionCheckStore 单元测试覆盖无现成裁剪框时按证据行号自动生成裁剪框。
- 已补充：fileService 解析回归测试覆盖本地 PDF 页面渲染为 imported-images PNG 资产，并确认页面截图候选包含页码、行号范围、宽高和 PNG 文件头。
- 已补充：rejectionCheckStore 单元测试覆盖真实页面截图裁剪 PNG 生成、Markdown 裁剪图引用和 Word `.docx` 嵌入裁剪图 media。
- 已补充：fileService 解析回归测试覆盖 DOCX/DOC/WPS 走转换后 PDF 页面渲染链路生成 imported-images PNG 资产，并确认候选标注 `office-rendered-pdf` 来源。
- 已补充：fileService 解析能力单测覆盖 MinerU 返回图片说明中的页码恢复、`mineru-remote-image` 来源标记和候选说明。
- 已补充：Playwright smoke 覆盖从二级菜单进入“废标项检查”工作台。
- 已补充：Playwright smoke 通过 mock bridge 覆盖检查结果页“导出 PDF”按钮调用 `rejectionCheck.exportReport({ format: 'pdf' })`。
- 已补充：`client/doc/废标项检查.md` 已同步当前导入、解析、检查、人工处理、单文件重查、Markdown/Word/PDF 报告、截图候选和真实裁剪图状态；`projectDocs.test.ts` 覆盖旧占位口径不再出现。
- 已补充：RejectionCheckPage 组件测试覆盖废标风险、错别字和逻辑问题的证据复制内容，确认包含投标文件、位置线索、原文/证据和原因。
- 已补充：RejectionCheckPage 组件测试覆盖当前投标文件重查，确认 `tasks.startRejectionCheck()` payload 带 `targetBidDocumentIds` 且只运行当前结果类型；Main 侧任务语法检查通过。
- 已补充：rejectionCheckStore 报告导出测试覆盖“证据定位明细”，确认废标项、错别字和逻辑问题均包含投标文件、位置线索、原文/证据、原因和建议，且已忽略项不进入交付明细。
- 已补充：rejectionCheckStore 报告导出测试覆盖章节、行号、匹配文本和前后文片段定位。
- 已补充：rejectionCheckStore 报告导出测试覆盖证据定位索引表、三类结果稳定 HTML 锚点和索引跳转链接。
- 已补充：rejectionCheckStore 报告导出测试覆盖文本型“证据截图视图”进入 Markdown、Word `.docx` 和 PDF，且包含目标行标记；PDF 测试额外检查图形化证据卡的矩形绘制、目标行高亮填充和边框指令。
- 已通过：多投标文件检查后可导出 UTF-8 Markdown 汇总报告。
- 已通过：删除/忽略状态由 SQLite Store 持久化，重启后可恢复。

### 3.10 资源下载：管理端验收与客户端离线体验

现状：

- 资源下载页已从 Analytics `/resources` 读取，支持搜索和无图占位。
- 已完成客户端离线体验第一阶段：成功读取资源后缓存到 Renderer `localStorage`；资源接口失败时优先显示本地缓存并按搜索词本地过滤，没有缓存时展示明确友好空态。
- Analytics Dashboard 已有 `resources.js`，Worker 已有 resources routes。
- 已完成端到端验收和离线/失败体验增强；管理端列表渲染已有纯函数测试覆盖。
- 2026-06-16 已完成资源下载文档占位清理：`client/doc/资源下载.md` 已从静态样式草稿改为当前 Analytics 接口、离线缓存、资源点击埋点、Dashboard/Worker 管理端和隐私约束说明，`projectDocs.test.ts` 防止旧静态假数据口径回流。

目标：

- Dashboard 资源管理完整验收：增删改、图片上传 R2、标签、Markdown 弹窗内容。
- 已完成第一阶段：Client 资源接口失败时提供缓存或友好空态。
- 已补充：点击资源时调用 `trackResourceClick()` 上报 `resource_click` 的 UI 测试。
- 已补充：Worker/Dashboard 增加 `npm run check`，deploy 前先执行 `node --check` 语法检查，覆盖 Worker 源码、Dashboard 源码和 analytics scripts。
- 已补充：Worker 资源 API 本地测试覆盖管理端鉴权、新增资源、标签去重、R2 图片读取、公开列表搜索、禁用资源隐藏和删除资源时清理图片。
- 已补充：Worker 侧本地测试覆盖资源列表返回 `RESOURCE_DB.resources.click_count` 历史累计 + AE 当天 `resource_click` 的合并点击量；Cron 资源点击汇总会把历史 AE 点击累加进资源表。
- 已补充：Dashboard 资源管理表将点击列展示为“累计 X 次”，并用纯函数测试锁定累计点击展示口径。
- 已补充：Dashboard 资源管理表格渲染测试覆盖 R2 图片展示、无图占位、标签、Markdown 弹窗内容摘要、启停状态、排序、编辑和删除入口。

验收：

- Dashboard 新增资源后 Client 可搜索到。
- R2 图片可正常展示；无图时封面占位稳定。
- 已补充：ResourcesPage 单测覆盖成功加载、缓存写入、资源点击上报和接口失败缓存回退。
- 已补充：ResourcesPage 单测覆盖接口失败且无缓存时的友好空态。
- 已补充：Analytics Dashboard `resourceTable` 单测覆盖资源图片、标签、累计点击量、Markdown 弹窗内容摘要、无图占位和编辑/删除操作入口。
- 已补充：Playwright E2E 覆盖主导航进入资源下载页、读取模拟资源、显示无图占位卡片并打开 Markdown 资源详情弹窗。
- 已补充：`cd analytics/worker; npm run test` 可在本地验证资源 API 主流程。
- 已通过：Worker/Dashboard `npm run deploy` 前会先运行 `npm run check`，当前 `node --check` 验证通过。
- 已补充：Worker/Dashboard 累计点击统计闭环测试，覆盖当天点击实时合并、Cron 历史累加和管理端累计点击展示。
- 已补充：`client/doc/资源下载.md` 已同步当前真实资源接口、离线缓存、无图占位、点击埋点、Dashboard 资源管理和 Worker 资源 API 状态；`projectDocs.test.ts` 覆盖旧静态数据/未来接口占位口径不再出现。

## 4. P2：文档解析、导出、发布与跨平台硬化

### 4.1 文件解析能力补齐

目标：

- 对本地解析、本地 OCR、MinerU 精准、MinerU Agent 四种路径建立统一样本集。
- 覆盖 pdf、docx、doc、wps、ofd、jpeg、png。
- 明确扫描件优先走本地 OCR，复杂版面再走 MinerU 的提示。
- 解析沙盘落地后，沉淀失败样本和回归集。
- 已补充：Main 侧 `createDeveloperParserCapabilityReport()` 作为解析样本支持矩阵，覆盖 pdf、docx、doc、wps、ofd、jpeg、png。
- 已补充：开发者文件解析沙盘展示样本覆盖矩阵、扫描件策略、中文路径 smoke 要求和每种格式的处理提示。
- 已补充：OFD 不走普通本地文本解析，但已接入本地 OCR 兜底；系统会优先通过本机 OFD 转 PDF 工具或支持 OFD 的 LibreOffice/WPS 转为 PDF，再按页面截图调用 PaddleOCR，转换工具不可用时提示先另存为 PDF。JPEG/PNG 和扫描件 PDF 明确建议先走本地 OCR，复杂版面再尝试 MinerU。
- 2026-06-15 已完成本地真实样本回归第一阶段：新增 `client/test/fixtures/parser-regression/` 样本清单和文本/Markdown 固定样本，Vitest 运行时在中文路径 `投标项目/样本文档` 动态生成 TXT、Markdown、DOCX、PDF、PNG、OFD 样本；TXT/Markdown/DOCX/PDF 走真实 `parseDocumentWithConfig()` 本地解析。
- 2026-06-15 已完成远程回归环境门控第一阶段：PNG 保持普通本地解析不支持断言，OFD 保持普通本地解析不支持但允许本地 OCR 兜底；MinerU 精准 / MinerU Agent 端到端网络回归需要显式 `YIBIAO_RUN_MINERU_E2E=1`，精准解析还需要 `YIBIAO_MINERU_TOKEN`，未设置时测试明确输出 skipped 缺口而不触发网络。
- 2026-06-15 已完成远程回归门控执行入口第二阶段：`fileServiceParserRegression.test.ts` 在 gate 开启后会生成中文路径、带图片的 DOCX 样本；MinerU-Agent 真实调用验证 Markdown 非空和样本文本返回，MinerU 精准解析在配置 Token 后继续验证图片资产重写为 `yibiao-asset://imported-images/...`、页面截图候选 `mineru-remote-image` 元数据和本地资产文件存在；默认 CI 未设置 gate 时不触发网络。
- 2026-06-16 已完成 MinerU-Agent 真实网络回归：在无 `YIBIAO_MINERU_TOKEN` 的联网环境中运行 `YIBIAO_RUN_MINERU_E2E=1 YIBIAO_MINERU_E2E_TIMEOUT_MS=240000 npm run test:unit -- fileServiceParserRegression.test.ts`，MinerU-Agent live 用例通过，MinerU 精准解析用例因未配置 Token 按门控跳过。
- 2026-06-16 已确认本机配置缺口：已检查 Electron 配置 `/Users/jack/Library/Application Support/yibiao-client/user_config.json`，`file_parser.mineru_token` 为空；因此 MinerU 精准解析真实网络回归保留为可选增强，不再作为扫描件解析交付阻塞。
- 2026-06-16 已完成本地 OCR 替代第一阶段：新增 `local-ocr` 文件解析方式，使用本机 `pdftoppm` 渲染扫描 PDF 页面并调用本机 OCR；图片文件可直接 OCR。保留图片时会把页面图写入 `yibiao-asset://imported-images/...`，废标页面截图候选可继续从 Markdown 图片引用提取。
- 2026-06-16 已完成本地 OCR PaddleOCR 接入：`local-ocr` 默认优先调用共享 PaddleOCR wrapper（`~/.codex/skills/paddleocr-local/scripts/ocr_local.py`），共享运行时不可用或执行失败时回退到 Tesseract；测试通过 fake PaddleOCR runner 固化优先路径，通过真实 Tesseract 回归固化兜底路径。
- 2026-06-16 已完成本地 OCR UI/沙盘接入：设置页、开发者解析沙盘和共享 IPC/配置类型已新增“本地 OCR 解析”，扫描件默认推荐从 MinerU 改为本地 OCR；MinerU 精准解析变为复杂版面和云端增强的可选路径。
- 2026-06-16 已完成本地 OCR OFD 兜底接入：`.ofd` 纳入 `local-ocr` 支持矩阵，解析时先用本机 `ofd2pdf` / `ofdconv` / LibreOffice 转 PDF，再复用 PDF 页面渲染和 PaddleOCR/Tesseract OCR；转换工具缺失时返回明确安装或另存 PDF 提示。

验收：

- Windows 中文路径、中文文件名、WPS/Word/LibreOffice 转换链路均有 smoke。
- 已补充：`fileServiceParserCapabilities.test.ts` 覆盖样本扩展名矩阵、扫描件/OFD 提示、中文路径示例、图片推荐本地 OCR 和 MinerU 到本地解析的 WPS 回退。
- 已补充：`fileServiceParserRegression.test.ts` 覆盖中文路径真实文件回归，TXT、Markdown、DOCX、PDF 通过本地真实解析链路，扫描 PDF 通过本地 OCR 解析并生成页面图片候选，且覆盖 PaddleOCR 优先路径和 Tesseract 兜底路径；PNG/OFD 明确不走普通本地解析，OFD 额外覆盖“转 PDF 后本地 OCR”的兜底链路。
- 已补充：`SettingsPage.test.tsx` 覆盖文件解析配置能力表，确认普通本地解析只展示文本型格式，本地 OCR 明确展示 PDF/OFD/图片和 PaddleOCR 优先策略，避免用户把扫描件/OFD 误选到普通本地解析。
- 已补充：`DeveloperToolsPage.test.tsx` 覆盖文件解析沙盘的本地 OCR 入口文案，确认扫描 PDF、OFD 和图片都指向 PaddleOCR 优先的本地 OCR 路径，并防止旧的“扫描件建议 MinerU OCR”口径回流。
- 已补充：Playwright E2E 覆盖开发者模式进入“文件解析沙盘”，确认本地 OCR 入口、PaddleOCR 优先策略、扫描 PDF/JPEG/PNG 建议和 OFD 本地 OCR 提示在真实路由中可见。
- 可选增强：在具备网络和 MinerU Token 的环境中运行 `YIBIAO_RUN_MINERU_E2E=1 YIBIAO_MINERU_TOKEN=<token> npm run test:unit -- fileServiceParserRegression.test.ts`，可继续固化 MinerU 精准解析真实端到端回归结果。

### 4.2 Word 导出高级能力

目标：

- 页眉、目录页、封面、分节符、水印、表格样式、图片压缩策略、Mermaid 失败替代图。
- 导出前检查报告与导出后 warnings 统一。
- 已补充：Main 侧 Word 导出预检报告，统计叶子章节、Mermaid、图片来源类型、缺失本地图片，并把预检提示并入导出 warnings。
- 已补充：`exportWord()` / `buildDocxResult()` 返回结构化 `preflight`，导出完成日志同步记录预检摘要。
- 已补充：缺失本地图片不会中断 Word 生成，会在文档中保留“图片无法导出”占位，并通过 warnings 提醒用户核对。
- 2026-06-15 已完成水印第一阶段：导出格式配置新增文字水印开关、内容、字体、字号、颜色和透明度；`configStore` 会为旧配置补默认值并归一化；`exportService.cjs` 通过 Word header 层写入 VML 水印，未启用文本页眉时也可单独输出水印。
- 2026-06-15 已完成表格样式第一阶段：导出格式配置新增 `table` 样式块，支持表头底色、外框线颜色、内框线颜色和单元格留白；`configStore` 会为旧配置补默认值并归一化；`exportService.cjs` 会把同一套表格样式应用到 Markdown 表格和可信 HTML 表格。
- 2026-06-15 已完成封面第一阶段：导出格式配置新增封面页开关、标题、副标题、投标单位和日期；`configStore` 会为旧配置补默认值并归一化；`exportService.cjs` 会在正文前写入封面页并通过分页符进入正文首页，默认关闭以保持旧导出行为。
- 2026-06-15 已完成 Mermaid 失败替代图第一阶段：Mermaid 联网转图失败时不再只写入错误文本，`exportService.cjs` 会插入可见替代图、保留失败说明文字并同步 warnings，普通 Markdown 图片失败行为不变。
- 2026-06-15 已完成图片压缩策略第一阶段：导出格式配置新增 `image.max_width_px`，支持配置 Word 图片最大宽度；`configStore` 会为旧配置补默认值并归一化到 160-960 像素；`exportService.cjs` 会按该宽度等比缩小 Markdown 图片、HTML 图片和本地素材图片的 Word 输出尺寸。
- 2026-06-15 已完成目录页第一阶段：导出格式配置新增目录页开关、目录标题和收录层级；`configStore` 会为旧配置补默认值并归一化目录层级到 1-6；`exportService.cjs` 会在封面后、正文前写入 Word TOC 字段并用分页符进入正文首页，默认关闭。
- 2026-06-15 已完成分节符第一阶段：导出格式配置新增“一级章节分节”开关；`configStore` 会为旧配置补默认值；`exportService.cjs` 启用后按一级章节拆分 Word sections，从第二个一级章节开始写入 `nextPage` 分节符，默认关闭以保持旧导出行为。

验收：

- 大文档导出不崩溃，失败资源不阻断整体导出。
- 已补充：`exportServiceHeader.test.ts` 覆盖缺失本地图片时 docx 仍生成、预检统计缺失图片、warnings 同时包含预检提示和导出占位提示。
- 已补充：`exportServiceHeader.test.ts` 覆盖水印写入 `word/header*.xml`，包含水印文本、字号、颜色和透明度；`ExportFormatPage.test.tsx` 覆盖水印配置 UI；`configStoreAppearance.test.ts` 覆盖旧配置水印字段归一化。
- 已补充：`exportServiceHeader.test.ts` 覆盖 Markdown 表格导出后的 `word/document.xml` 包含配置的表头底色、边框颜色和单元格留白；`ExportFormatPage.test.tsx` 覆盖表格样式 UI；`configStoreAppearance.test.ts` 覆盖旧配置表格字段归一化。
- 已补充：`exportServiceHeader.test.ts` 覆盖封面标题、副标题、投标单位、日期和分页符写入 `word/document.xml`；`ExportFormatPage.test.tsx` 覆盖封面配置 UI；`configStoreAppearance.test.ts` 覆盖旧配置封面字段归一化。
- 已补充：`exportServiceHeader.test.ts` mock Mermaid 转图网络失败，覆盖 `word/document.xml` 中的替代图片 drawing、失败说明文字和 warnings。
- 已补充：`exportServiceHeader.test.ts` 覆盖配置图片最大宽度后 `word/document.xml` 的 drawing 尺寸按比例缩小；`ExportFormatPage.test.tsx` 覆盖图片导出策略 UI；`configStoreAppearance.test.ts` 覆盖旧配置图片字段归一化。
- 已补充：`exportServiceHeader.test.ts` 覆盖目录标题、TOC 字段 `TOC \h \o "1-n"`、dirty 刷新标记、目录后分页和正文顺序；`ExportFormatPage.test.tsx` 覆盖目录页配置 UI；`configStoreAppearance.test.ts` 覆盖旧配置目录字段归一化。
- 已补充：`exportServiceHeader.test.ts` 覆盖启用一级章节分节后 `word/document.xml` 包含多个 `sectPr` 和 `nextPage` 分节符；`ExportFormatPage.test.tsx` 覆盖一级章节分节 UI；`configStoreAppearance.test.ts` 覆盖旧配置分节开关归一化。

### 4.3 发布与自动更新硬化

目标：

- Windows/macOS 未签名提示仍是已知约束，但发布流程要稳定。
- 验证 GitHub Release 与 Cloudflare 下载渠道一致性。
- 增加版本号同步、update manifest、mac x64/arm64 合并清单 smoke。
- 已补充：新增 `npm run smoke:release-config`，本地快速检查 electron-builder 输出目录、产物命名、Windows/macOS 目标架构、GitHub 发布配置、Cloudflare 更新源、Release workflow 版本同步、macOS manifest 合并和 R2 `latest.json` 发布步骤。
- 已补充：`updateServiceRelease.test.ts` 覆盖 Cloudflare `latest.json` 中 Windows/macOS 下载文件选择、更新渠道归一化、版本比较规则，以及 macOS x64/arm64 `latest-mac.yml` 合并结果。

验收：

- `dist:win` / `dist:mac` 可在 CI 或本地按文档跑通。
- 已补充：本地无需真实打包即可运行发布配置 smoke，提前发现发布配置、更新源和 manifest 规则漂移。
- 已通过：`node --check electron/services/updateService.cjs`、`node --check scripts/release-config-smoke.cjs`、`npm run smoke:release-config` 和目标 Vitest。

### 4.4 Analytics 完整性与隐私

目标：

- 保持现有统计能力，不删除或绕过。
- 增加新功能页面映射：商务标、图片知识库、AI 评标、投标机会、开发者工具真实页面。
- 检查不上传文件名、本地路径、Prompt、正文草稿、错误详情等敏感信息。
- 已补充：Dashboard 页面标签拆成纯模块并用 Node 测试覆盖商务标、图片知识库、AI 评标、投标机会和开发者工具真实页面映射。
- 已补充：Client 埋点只接受稳定页面 ID 和资源 key，Vitest 覆盖本地路径形态 page/resource key 不上报、任意 prompt/file/path 字段不进入 `config_usage`。
- 已补充：Worker 埋点归一化只保留稳定 page/resource key，Node 测试覆盖本地路径、文件名、prompt 不进入 Analytics blobs，AI base URL 只保存 host。
- 已补充：商务标关键动作以 `businessBidActions` 固定枚举进入 `config_usage`，Client/Worker 双侧过滤非法值，Dashboard 以中文标签展示导入、生成矩阵、AI 提取、确认条款和材料包导出动作。

验收：

- 已补充：新页面 `page_view` 在 Dashboard 显示为中文功能名的映射测试。
- 已补充：统计失败不影响主流程的客户端上报仍使用 fire-and-forget；本轮新增隐私测试覆盖非法字段不会进入上报体或 Worker blobs。

## 5. P3：产品化和协作体验

### 5.1 项目级工作区与多项目管理

现状：

- 2026-06-15 已完成第一阶段：Main 侧新增 `projectWorkspaceStore.cjs` 和 `project-workspace:*` IPC/preload bridge，维护 `userData/projects/projects.json` 项目注册表。
- 默认项目继续指向旧版 `userData/workspace`，保证现有单例工作区兼容；新建项目使用 `userData/projects/<projectId>/workspace`。
- 已支持项目列表、创建、设为当前项目、归档/恢复、删除、复制项目、导出项目包和导入项目包；切换当前项目会在 Main 侧热重建 project-scoped `aiService`、`fileService`、SQLite、业务 Store、后台任务服务和工作区 IPC。
- 2026-06-15 已完成第二阶段：`getWorkspaceDir(app)` 支持项目工作区覆盖，主进程启动时会读取 active project，并用 project-scoped app 初始化 `aiService`、`fileService`、`createSqliteDatabase()` 和各业务 Store；默认项目仍兼容旧 `userData/workspace`。
- 2026-06-15 已完成第三阶段第一步：设置页通用配置区新增项目工作区 UI，支持查看当前项目、刷新项目列表、新建并设为当前项目、切换项目确认、归档/恢复和删除项目；切换/删除前会检查 `tasks.getActiveTasks()`，后台任务运行中会阻止操作。
- 2026-06-15 已完成第三阶段第二步：Playwright E2E 覆盖设置页项目工作区列表、后台任务运行时阻止切换、清空任务后打开切换确认弹窗、确认切换调用 `projectWorkspace.setActive()` 并展示新工作区已热刷新。
- 2026-06-15 已完成第三阶段第三步：设置页项目工作区 UI 补齐复制项目、导出项目包和导入项目包入口；复制、导出、导入前复用后台任务运行保护，避免项目数据流转时后台任务仍在写工作区。
- 2026-06-15 已完成第四阶段：项目切换和“新建并切换”会在当前 Electron 会话内刷新工作区服务；Main 侧补齐工作区 IPC 通道清理清单，关闭旧 SQLite 连接，重建 project-scoped app、AI/文件服务、业务 Store、`taskService` 和工作区 IPC，并通过 `workspace-database:status` 回放 checking/ready 状态；设置页不再提示必须重启。

目标：

- 当前业务状态偏单例工作区。后续可支持多个投标项目：项目列表、项目归档、复制项目、删除项目、导入导出项目包。
- 已完成第一阶段：项目注册表和 workspace 目录管理基础设施。
- 已完成第二阶段：应用启动时按 active project 初始化 SQLite、文件目录和业务 Store。
- 已完成第三阶段第一步：项目切换 UI、切换确认和任务运行中保护。
- 已完成第三阶段第二步：补充项目切换 E2E 验收。
- 已完成第三阶段第三步：补齐复制、导出项目包和导入项目包的设置页入口。
- 已完成第四阶段：运行时项目热刷新，切换当前项目后无需重启即可让后续业务 IPC 读取新项目工作区。

验收：

- 已补充：`projectWorkspaceStore.test.ts` 覆盖默认项目兼容旧 `userData/workspace`，项目创建/激活/归档/恢复/删除，以及复制、导出和导入项目包时 workspace 文件随项目流转。
- 已补充：`projectWorkspaceStore.test.ts` 覆盖 scoped app 下 `getWorkspaceDir()` 和 `getWorkspaceDatabasePath()` 解析到 active project workspace，默认项目路径仍保持旧 `userData/workspace`。
- 已补充：`SettingsPage.test.tsx` 覆盖项目工作区列表加载、新建并切换、切换确认调用 `projectWorkspace.setActive()`，以及后台任务运行时阻止项目切换。
- 已补充：`SettingsPage.test.tsx` 覆盖复制项目、导出项目包和导入项目包 bridge 调用。
- 已补充：Playwright E2E 覆盖设置页项目工作区列表加载、运行中任务阻止切换、复制/导出/导入项目包入口、确认切换和热刷新提示；通用 Radix Dialog 层级已修复，确认按钮不再被 overlay 拦截。
- 已补充：Main 侧运行时切换通过 `projectWorkspace.setActive()` 回调重建工作区服务，`node --check electron/ipc/index.cjs` / `node --check electron/ipc/projectWorkspaceIpc.cjs` 覆盖热重载注册语法，设置页组件测试和 Playwright E2E 覆盖用户侧热刷新语义。
- 不同项目之间技术方案、知识引用、查重、废标检查状态隔离由 project-scoped `getWorkspaceDir()` / `getWorkspaceDatabasePath()` 单测、Main 侧 runtime reload 和设置页 E2E 共同验证。

### 5.2 Agent 原生操作接口

现状：

- 仓库已有未跟踪 `agent-harness/`，但不应在本计划中假定完成。
- 已补充：按 CLI-Anything 结构新增 `agent-harness/setup.py` 与 `cli_anything/openbidkit_yibiao/` 命名空间包，提供 `cli-anything-openbidkit-yibiao` console script。
- 已补充：CLI 支持默认 REPL、`--json status`、`--json plan-summary`、`--json smoke`、`--json list-smoke`，读取真实仓库文件、用户 workspace 状态，并通过 subprocess 调用真实 Node/npm 检查。
- 已补充：CLI 支持 `--json export-report --kind duplicate|rejection --state-json <path> --output <path> --format md|docx|pdf`，通过包内 Node helper 调用真实 Electron Main 报告 builder 生成 Markdown、Word `.docx` 或文本型 PDF，不重写报告业务逻辑。
- 2026-06-15 已补充：CLI 支持 `--json list-tasks` 和 `--json start-task --type <task-type> --payload-json <path> --dry-run`，通过真实 `taskService.cjs` 枚举 Electron Main 任务定义，并生成 side-effect-free 的任务启动计划、scope key 和 payload signature。
- 2026-06-15 已补充：CLI 的 `export-report` 扩展到 `business-bid`、`ai-evaluation`、`bid-opportunity`，继续通过真实 Electron Main Store builder 生成报告；商务标和 AI 评标支持 Markdown、Word `.docx`、Excel `.xlsx`，投标机会支持 Markdown，并按报告类型拒绝不支持的格式组合。
- 2026-06-15 已补充：CLI 支持 `--json project-workspace --action list|create|set-active|archive|restore|duplicate|export-package|import-package|get-workspace-path`，通过 Node helper 复用真实 Electron Main `projectWorkspaceStore.cjs` 管理项目注册表和项目包；测试可用 `--user-data <path>` 指向临时目录，避免污染用户默认工作区。
- 2026-06-16 已补充：CLI `plan-summary` 不再把“后续/待增强/可选增强”粗略计为必做 pending，新增 `required_pending_markers`、`optional_enhancement_markers`、`completion_status` 和外部依赖提示，便于后续 Codex 判断当前计划只剩可选 MinerU Token 回归等外部增强。
- 2026-06-18 已补充：CLI `plan-summary` 可识别当前 P0 状态和执行顺序中的 `blocked` 外部输入项，并区分通用能力阻塞与智慧食堂正式样本文档阻塞；当仅正式参考 docx、真实附件资产或报价差额确认未到位时，`completion_status` 返回 `required-complete-with-sample-blockers`，避免把蓝本样本文档缺口误判为通用标书生成器未完成。
- 2026-06-18 已补充：CLI 支持 `--json bid-document-sample --output-dir <dir> --template-id generic-response`，通过 Node helper 复用真实 `bidDocumentTemplates.cjs` 和 `bidDocumentWordBuilder.cjs` 生成完整标书 `.docx` 与构建日志，返回报价、标题、附件、章节、docx 内容、图片插入和禁用词校验摘要。
- 2026-06-18 已补充：CLI 支持 `--json bid-document-template-info`、`--json bid-document-analyze-reference` 和 `--json bid-document-validate-config`，分别复用真实模板注册表、参考响应文件分析器和项目配置校验服务，覆盖模板 schema / asset mapping 导出、候选 Word 结构对齐、导出/导入项目配置 JSON 的无界面校验。
- 2026-06-18 已补充：CLI 支持 `--json bid-document-build-config --input <project-config.json> --output <response.docx> --output-json <build-result.json>`，从导出/导入的项目配置 JSON 直接调用真实 Word builder 生成完整响应文件，并保留失败不替换最终文件的生成策略。
- 2026-06-18 已补充：CLI 支持 `--json bid-document-init-config --template-id <template-id> --output-json <project-config.json> [--with-demo-assets]`，从真实模板注册表初始化可编辑项目配置；智慧食堂默认配置可直接用于证明当前报价差额会阻断正式 Word 生成。
- 已补充：生成 package-local `skills/SKILL.md`，并保留原有一次性生成脚本和输出产物。

目标：

- 为 Codex/Agent 暴露可验证的 CLI 或 harness：读取工作区状态、启动任务、导出报告、执行 smoke。
- 如果采用 CLI-Anything，必须使用真实 Electron/Main 服务或稳定数据文件，不重写业务逻辑。
- 已完成导出报告 headless 包装第二阶段：Duplicate Check / Rejection Check 可通过状态 JSON 调用真实 Main 报告 builder 导出 Markdown 和 Word `.docx`。
- 2026-06-15 已完成导出报告 headless 包装第三阶段：Duplicate Check / Rejection Check 可通过同一命令追加 `--format pdf` 导出文本型 PDF，并继续复用真实 Electron Main PDF builder。
- 2026-06-15 已完成任务启动 headless 包装第一阶段：可枚举真实后台任务定义，并对 `duplicate-analysis`、`knowledge-base-preparation` 等任务生成 dry-run 启动计划；真实执行仍需 Electron Main 桌面会话承载 runner、IPC、Store 和任务事件。
- 2026-06-15 已完成项目工作区 headless 包装第一阶段：Codex/Agent 可在 JSON 模式下读取项目列表、创建/切换/归档/恢复/复制项目、导出/导入项目包和解析项目工作区路径，底层复用真实 Main 侧项目工作区 Store。

验收：

- 支持 JSON 输出。
- 有 E2E 测试覆盖真实后端能力或明确环境缺口。
- 已补充：`agent-harness/TEST.md`、`test_core.py`、`test_full_e2e.py` 覆盖 repo 状态读取、plan 摘要、smoke 命令定义、已安装 CLI JSON 输出、真实 `node --check` smoke、duplicate/rejection Markdown/Word/PDF 报告导出、真实任务定义枚举和任务 dry-run 启动计划。
- 已补充：`test_core.py` 覆盖商务标 Markdown/Excel、AI 评标 Word/Excel、投标机会 Markdown 报告导出，以及不支持的报告格式拒绝；`test_full_e2e.py` 覆盖已安装 CLI 导出商务标 Excel。
- 已补充：`test_core.py` 覆盖真实 `projectWorkspaceStore.cjs` 在临时 `userData` 下的项目列表、创建并切换、工作区路径、复制、导出项目包、导入项目包、归档/恢复和切换；`test_full_e2e.py` 覆盖已安装 CLI 的项目列表、创建并切换、切回默认项目和工作区路径解析。
- 已补充：`test_core.py` 和 `test_full_e2e.py` 覆盖 `plan-summary` 必做未完成项为 0 时仍能识别智慧食堂样本文档外部输入缺口，`completion_status=required-complete-with-sample-blockers`，并保留可选增强、sample blocker 和外部依赖提示。
- 已补充：`test_core.py` 和 `test_full_e2e.py` 覆盖 `bid-document-sample` 通过真实完整标书模板与 Word builder 生成 `.docx` 和 build log，并检查 `docxContentCheck`、`imageInsertionCheck` 和最终 `word/document.xml`。
- 已补充：`test_core.py` 和 `test_full_e2e.py` 覆盖 `bid-document-template-info`、`bid-document-analyze-reference` 和 `bid-document-validate-config`，通过真实模板、参考分析和校验服务输出 schema、结构对齐报告与项目配置 build log。
- 已补充：`test_core.py` 和 `test_full_e2e.py` 覆盖 `bid-document-build-config` 从项目配置 JSON 生成 Word `.docx` 和 build result JSON，并检查报价表完整性、图片插入、最终 `word/document.xml`、失败不创建新 Word、失败不覆盖既有 Word。
- 已补充：`test_core.py` 和 `test_full_e2e.py` 覆盖 `bid-document-init-config` 输出可编辑项目配置、demo sidecar 附件、智慧食堂默认配置因报价差额阻断正式 Word 生成，以及通用 demo 配置被拒绝正式 build。
- 已通过：在 `agent-harness/.venv` 中 editable install 后，52 个 unittest/E2E 全部通过。

### 5.3 文档与官网同步

现状：

- 2026-06-15 已完成第一阶段：中文 README 和英文 README 已同步当前功能状态，不再把商务标、图片知识库、AI 评标、投标机会、标书查重、废标项检查等已落地能力描述为预留或开发中。
- 2026-06-15 已新增 `client/doc/用户手册与故障排查.md`，按技术方案、商务标、AI 评标、投标机会、知识库、图片知识库、标书查重、废标项检查、设置、资源和开发者工具梳理入口、交付物、常见问题和验证命令。
- README 已明确仍在演进的可选增强：MinerU 精准解析真实网络回归。
- 2026-06-15 已完成第二阶段：中文 README、英文 README 和用户手册已同步废标页面截图候选自动裁剪、查重复杂相似图视觉证据、旋转/水印/16x16 细粒度局部裁剪检测状态。
- 2026-06-15 已完成第三阶段：中文 README、英文 README 和用户手册已同步废标本地 PDF 页面 PNG 截图候选状态；当时文档中保留非本地 PDF 精确页图生成、运行时项目热刷新和 MinerU 真实网络回归作为后续边界。
- 2026-06-15 已完成第四阶段：中文 README、英文 README 和用户手册已同步多项目运行时热刷新状态；当时文档中保留非本地 PDF 精确页图生成和 MinerU 真实网络回归作为后续边界。
- 2026-06-15 已完成第五阶段：中文 README、英文 README 和用户手册已同步本地 DOCX/DOC/WPS 通过 Office 转 PDF 生成页面 PNG 截图候选状态；当时文档中仅保留 MinerU 远程解析精确页图生成和 MinerU 真实网络回归作为后续边界。
- 2026-06-15 已完成第六阶段：中文 README、英文 README 和用户手册已同步 MinerU 返回图片候选离线回归状态；文档中仅保留 MinerU 真实网络回归作为后续边界。
- 2026-06-15 已完成第七阶段：中文 README、英文 README、用户手册和解析回归 manifest 已同步 MinerU 门控真实网络回归命令；默认测试不触发网络，具备 Token 和网络时同一测试文件会真实验证 MinerU-Agent / MinerU 精准解析、图片资产重写和页面截图候选。
- 2026-06-16 已完成第八阶段：中文 README、英文 README、用户手册和解析回归 manifest 已同步 MinerU-Agent 真实网络解析回归已通过；当前文档仅保留 MinerU 精准解析 Token 回归和 zip 图片候选固化作为可选增强。
- 2026-06-16 已完成第九阶段：中文 README、英文 README、用户手册和 `plan.md` 已同步本地 OCR 改为 PaddleOCR 优先、Tesseract 兜底；MinerU 精准解析继续作为具备 Token 后的可选增强。
- 2026-06-16 已完成第十阶段：中文 README、英文 README、用户手册和 `plan.md` 已同步投标机会多轮跟进记录、公告/沟通附件和报告输出状态。
- 2026-06-16 已完成第十一阶段：`design.md` 项目知识基线已同步 AI 评标会议纪要模板、投标机会多轮跟进和附件、项目工作区运行时热刷新、SQLite v35、废标真实裁剪图、本地 OCR PaddleOCR 优先路径和知识库 scope task 现状。
- 2026-06-16 已完成第十二阶段：`client/doc/资源下载.md` 和 `client/doc/废标项检查.md` 已从早期需求/占位草稿改为当前已落地能力、后续约束和验证索引；`projectDocs.test.ts` 防止静态资源、未来接口、废标占位和可删除旧口径回流。

目标：

- 已完成第一阶段：README 中“更多功能还在开发中”的泛化承诺已随真实功能状态更新。
- 已完成第一阶段：英文 README 同步。
- 已完成第一阶段：对核心功能补用户手册和故障排查索引。
- 待持续维护：后续如完成 MinerU 精准解析真实网络回归并记录通过结果，再同步 README、英文 README 和用户手册。

验收：

- 已补充：README 不再把已完成能力描述为“预留/开发中”，也不把当时尚未落地的能力提前描述成已完成；当前文档仅保留 MinerU 精准解析真实网络回归作为可选增强。
- 已补充：英文 README 与中文 README 的功能状态保持一致。
- 已补充：核心功能用户手册与故障排查入口已落到 `client/doc/用户手册与故障排查.md`。
- 已补充：README、英文 README 和用户手册不再把查重复杂相似图视觉证据、旋转/水印/局部裁剪或废标页面截图候选自动裁剪描述成未完成。
- 已补充：`design.md` 不再把 AI 评标会议纪要模板、项目工作区热刷新、废标真实裁剪图、本地 OCR PaddleOCR 路径或投标机会多轮跟进/附件描述成未完成或过期状态。
- 已补充：`client/doc/资源下载.md` 和 `client/doc/废标项检查.md` 不再保留静态样式草稿或页面占位草稿；`projectDocs.test.ts` 作为文档状态防回归测试。

## 6. 执行顺序建议

1. 先做 P0 菜单占位清零：商务标、图片知识库、AI 评标、投标机会、技术方案 Step06 处理。
2. 再做 P1 基础缺口：页眉导出、设置页主题/布局、模型列表、本地模型体验。
3. 然后做 P1 已有功能增强：已有方案扩写覆盖审计、知识库任务统一、查重忽略规则、废标报告导出。
4. 再做 P2 跨平台硬化：解析样本集、Word 高级导出、发布更新、Analytics。
5. 后续可选增强：MinerU 精准解析真实网络回归。

## 7. 每个任务的固定交付要求

- 先更新或新增局部设计说明，写清状态、IPC、Store、任务和清空规则。
- 涉及 Renderer/TypeScript：运行 `cd client; npm run build`。
- 涉及 Electron Main/preload：先 `node --check` 对应 `.cjs`，再 `npm run build`。
- 涉及 SQLite：同步 `client/electron/services/sqliteDatabase.cjs` 和 `sql/workspace_schema.sql`。
- 涉及菜单：同步 `navigation.ts`、`menuConfig.ts`、`AppRouter.tsx`、Analytics 页面映射。
- 涉及 Analytics：Worker/Dashboard 对应目录运行语法检查或部署前检查，不能引入密钥。
- 涉及用户可见文案：中文、清晰、可操作。
- 涉及长任务：Main 后台任务执行，Renderer 只启动、订阅、读取 Store。

## 8. 当前全量验证快照

2026-06-16 本轮收口补跑了客户端、Analytics、agent-harness 和发布配置验证，作为后续继续迭代前的基线：

- `cd client; npm run test:unit -- projectDocs.test.ts`：通过，覆盖资源下载和废标项检查文档旧占位口径不回流。
- `cd client; npm run test:unit -- planCompletionAudit.test.ts`：通过，覆盖计划内产品/开发者入口均在菜单中可达、无开发中 notice，并确认开发者工具保持在 `DeveloperToolsPage` 真实实现而非旧 demo shell。
- `cd client; npm run test:unit`：通过，38 个测试文件、206 个单测通过。
- `cd client; npm run build`：通过，仅保留既有 Vite chunk 体积警告。
- `cd client; npm run test:e2e`：通过，19 个 Playwright E2E 用例通过。
- `cd analytics/worker; npm run test`：通过，语法检查 28 个 JavaScript 文件，7 个 Node 测试通过，覆盖埋点隐私、商务标动作枚举、资源 API、R2 图片和点击汇总。
- `cd analytics/dashboard; npm run test`：通过，语法检查 15 个 JavaScript 文件，8 个 Node 测试通过，覆盖页面中文映射、商务标动作展示和资源管理表格。
- `agent-harness/.venv/bin/python -m unittest discover -s agent-harness/cli_anything/openbidkit_yibiao/tests -v`：通过，24 个 unittest/E2E 通过，覆盖 CLI 状态、计划摘要必做/可选分类、真实 Node smoke、任务定义枚举、任务 dry-run、项目工作区管理和多类报告导出。
- `cd client; npm run smoke:release-config`：通过，确认 electron-builder / GitHub Release / Cloudflare 更新源配置基线。
- `git diff --check`：通过。

仍需注意的外部条件：

- MinerU 精准解析真实网络端到端回归依赖 `YIBIAO_MINERU_TOKEN` 和外网，当前计划中保持为可选增强；扫描 PDF、图片和 OFD 的默认本地路径已由 PaddleOCR 优先、Tesseract 兜底覆盖。
