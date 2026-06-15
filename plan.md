# OpenBidKit_Yibiao 全量待开发计划

本文档用于给后续 Codex 迭代直接派工。执行任何条目前，先阅读 `AGENTS.md`、`design.md`、`client/开发说明.md`，不要读取 `archive/`。

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

目标：

- 支持导入招标文件、评分办法、投标文件，模拟评标打分并输出评标报告。
- 聚焦资格、报价、客观分、评分项响应、打分合理性、专家打分交叉审核。
- 可用于投前自评，也可用于专家结果复核。

建议拆分：

1. 已完成：增加 AI 评标独立投标文件导入，不只依赖技术方案招标文件。
2. 已完成：将当前规则识别升级为 AI 结构化抽取任务，并写入后台任务状态。
3. 已完成主要结构：扩展 `ai_evaluation_*` 表族，已落地投标文件、评分任务、逐投标文件评分结果、专家打分、审计意见和报告快照；后续如做正式评标委员会流程，可再追加专家角色、签名和评审会议表。
4. 复用文件解析和技术方案 Step02 评分项提取能力。
5. 已完成主要流程：单份/多份投标文件可连续导入并保存评分结果；已升级为 Main 后台批量评分任务，支持基于已导入投标文件队列重评、进度、失败恢复和任务事件回放；后续如需要可再补取消/暂停。
6. 已完成主要流程：已生成专家复核、客观分/报价核验、多投标文件横向分差和专家打分交叉审核意见；已增强证据定位粒度。后续可继续补专家角色权限、签名确认和正式评审会议流程。
7. 已完成主要报告导出：已实现 UTF-8 Markdown 自评报告、Word `.docx` 正式报告和 Excel `.xlsx` 多工作表报告导出，包含多投标文件评分汇总和审计意见，并保存报告快照；后续可继续增强正式评标委员会模板和单位专属版式。

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

目标：

- 从公告线索到投标决策的机会工作台。
- 支持公告导入、网页/文件粘贴、关键字段解析、资质/业绩匹配、机会评分、跟进状态。

建议拆分：

1. 已完成主要结构：扩展 `bid_opportunity_opportunities`，已落地负责人、提醒、跟进动作和知识库匹配结果；后续如需要可继续追加附件文件和多轮跟进记录表。
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

目标：

- 可选择业务链路：招标解析、目录生成、全局事实、正文编排、正文生成、原方案还原、查重、废标项检查。
- 展示实际 Prompt 版本、变量注入结果、输入规模、截断策略、输出 schema、模型返回、JSON 修复结果。
- 支持保存调试记录到开发者日志，不写入敏感 API Key。

验收：

- 开发者模式下能复现一次真实 prompt 构建。
- 能导出或复制脱敏调试包。
- 第一阶段已用 Vitest 和 Playwright 覆盖页面渲染、链路切换和开发者模式入口。

### 2.2 文件解析沙盘

现状：

- 菜单入口：`developer-parser-sandbox`。
- 2026-06-14 已完成第一阶段：`developer-parser-sandbox` 从二级菜单 demo 改为真实文件解析沙盘。
- 已支持选择本地解析、MinerU 精准、MinerU Agent，选择是否保留图片引用，打开样本文件并通过 Main 侧 `fileService.parseDocumentWithConfig()` 解析。
- 已展示文件信息、解析器、耗时、Markdown 字符数、行数、图片引用数量和 Markdown 预览。

目标：

- 导入任意样本文件，选择本地解析 / MinerU 精准 / MinerU Agent。
- 显示文件信息、解析耗时、Markdown、图片资产清单、页码/结构化摘要、错误阶段。
- 支持对比不同解析器输出。

验收：

- 同一文件可分别跑至少两种解析方式并对比输出。
- 解析失败有明确阶段、日志路径和建议。
- 第一阶段已用 Vitest 覆盖 file bridge 调用和解析结果展示。

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
- 已补充：`DeveloperDemoPage.test.tsx` 覆盖导出预演页调用 `export.previewWordExport()` 并展示真实 Word dry-run 结果；`exportServiceHeader.test.ts` 覆盖 Main 侧 dry-run 生成 docx buffer 统计、预检缺图和 warnings，但不写输出文件。

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
- `client/doc/设置页.md` 说明通用配置后续会放主题色、样式布局。

目标：

- 已完成：语言短期保持中文，不再以可操作 disabled 控件误导。
- 已完成：主题支持跟随系统、浅色、深色。
- 已完成：侧边栏布局支持经典/紧凑。
- 已完成第一阶段：审查并覆盖主要历史页面硬编码浅色卡片，资源、查重、废标和开发者实验室已进入 Playwright 回归；后续新增页面或遗漏页面继续按同一主题变量模式补齐。

验收：

- 已通过：配置保存到 `user_config.json` 并可重新加载恢复。
- 已通过：全局外壳、侧边栏、设置页按主题切换。
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
- 优化知识库匹配算法，减少全文反复提交成本。
- 技术方案引用知识库时提供更强相关性筛选和可解释引用。
- 图片资产管理与图片知识库打通。

验收：

- 已补充：多文档知识库任务进入统一 `taskService.getActiveTasks()` 后，不同 documentId 会保留独立 `scope_id`，不被同类型任务折叠。
- 已补充：页面重启后可读取并展示文档级 active task 快照。
- 已补充：KnowledgeBasePage active task 快照单测。
- 已补充：taskService 知识库文档级 active task 单测，覆盖 `scope-exclusive(documentId)` 和订阅事件快照。
- 已补充：contentGenerationTask 单元测试覆盖章节相关性预筛选，确认售后服务章节只保留强相关知识条目，并在 Prompt JSON 中输出 `relevance_reason` / `matched_terms`，无关条目不进入该小节候选。

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
- 当前相似图片检测已覆盖压缩、缩放后相似图、文本型复核上下文和 PDF 图形化复核卡第一阶段；真实原图裁剪、截图局部裁剪、旋转、加水印等更复杂视觉相似证据仍可继续增强。

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
- 已完成相似图片复核视图第一阶段：导出 Markdown/Word/PDF 均包含文本型相似图片复核视图。
- 已完成 PDF 图形化复核卡第一阶段：PDF 报告会用绘制矩形、边框和高亮背景呈现相似图片复核卡。
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
- 已补充：DuplicateCheckPage 组件测试覆盖正文忽略规则分类保存、分类展示、导出规则和导入规则；duplicateCheckStore 测试覆盖分类规则 JSON 导出后在另一个临时工作区导入并恢复分类；Playwright 冒烟覆盖查重结果页规则导入/导出 bridge 调用。

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
- 当前仍需要增强真实原文页面图片截屏和页面截图裁剪。

目标：

- 已完成第一阶段：导出 Markdown 废标项检查报告，包含风险项、错别字、逻辑问题、严重级别、原文证据、建议。
- 已完成第四阶段：导出 Word `.docx` 废标项检查报告，复用 Markdown 报告内容并包含证据定位索引和明细。
- 已完成第五阶段：导出 PDF 废标项检查文本报告，复用 Markdown 报告内容并包含证据定位索引和明细。
- 已完成报告证据视图第六阶段第一步：导出 Markdown/Word/PDF 均包含文本型证据截图视图。
- 已完成报告证据视图第六阶段第二步：PDF 中的目标行和上下文会绘制为图形化证据卡；真实原文截图裁剪仍为后续增强。
- 已完成第一阶段：支持按投标文件筛选、单项删除、单项忽略和恢复。
- 已完成第二阶段：增加批量删除、批量忽略和批量恢复。
- 已完成证据定位第一阶段：废标风险、错别字和逻辑问题支持复制带投标文件、位置线索、原文/证据、原因和建议的证据文本；错别字列表直接展示位置线索。
- 已完成报告证据定位第一阶段：导出 Markdown 报告包含可交付的证据定位明细。
- 已完成报告定位第二阶段：导出 Markdown 报告包含章节、行号和前后文片段。
- 已完成报告锚点索引第三阶段：导出 Markdown 报告包含可点击证据索引和稳定锚点。
- 已完成报告导出第四阶段：导出 Word 报告包含证据定位索引和证据明细。
- 已完成报告导出第五阶段：导出 PDF 文本报告包含证据定位索引和证据明细。
- 已完成报告证据视图第六阶段第一步：导出 Markdown/Word/PDF 均包含文本型“证据截图视图”，标记目标行和前后文。
- 已完成报告证据视图第六阶段第二步：PDF 中的目标行和上下文会绘制为图形化证据卡；真实原文截图裁剪仍为后续增强。
- 已完成第一阶段：增加“重新检查单个投标文件”能力，按当前结果类型和当前投标文件筛选启动后台任务。

验收：

- 已补充：RejectionCheckPage 组件测试覆盖检查结果页分别调用 `rejectionCheck.exportReport({ format: 'md' })`、`rejectionCheck.exportReport({ format: 'docx' })` 和 `rejectionCheck.exportReport({ format: 'pdf' })`。
- 已补充：RejectionCheckPage 组件测试覆盖已忽略废标风险隐藏、忽略调用 `rejectionCheck.resolveFinding()` 并刷新状态。
- 已补充：RejectionCheckPage 组件测试覆盖批量忽略、批量删除调用 `rejectionCheck.batchHandleFindings()`；Main/preload/IPC 语法检查通过。
- 已补充：rejectionCheckStore 单元测试覆盖 Markdown 证据定位明细和 Word `.docx` 包内容，解压检查 `word/document.xml` 包含报告标题、证据定位明细、风险项、原文证据和逻辑问题，并排除已忽略证据。
- 已补充：rejectionCheckStore 单元测试覆盖 PDF 文本报告，确认 `%PDF-` 文件头、CJK 字体声明、报告标题、证据定位明细、风险项和原文证据进入 PDF 字节，且不包含已忽略证据。
- 已补充：Playwright smoke 覆盖从二级菜单进入“废标项检查”工作台。
- 已补充：Playwright smoke 通过 mock bridge 覆盖检查结果页“导出 PDF”按钮调用 `rejectionCheck.exportReport({ format: 'pdf' })`。
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

## 4. P2：文档解析、导出、发布与跨平台硬化

### 4.1 文件解析能力补齐

目标：

- 对本地解析、MinerU 精准、MinerU Agent 三种路径建立统一样本集。
- 覆盖 pdf、docx、doc、wps、ofd、jpeg、png。
- 明确扫描件不支持或走 MinerU 的提示。
- 解析沙盘落地后，沉淀失败样本和回归集。
- 已补充：Main 侧 `createDeveloperParserCapabilityReport()` 作为解析样本支持矩阵，覆盖 pdf、docx、doc、wps、ofd、jpeg、png。
- 已补充：开发者文件解析沙盘展示样本覆盖矩阵、扫描件策略、中文路径 smoke 要求和每种格式的处理提示。
- 已补充：OFD 当前明确标记为未接入，提示先转换为 PDF/DOCX；JPEG/PNG 和扫描件 PDF 明确建议走 MinerU OCR。
- 2026-06-15 已完成本地真实样本回归第一阶段：新增 `client/test/fixtures/parser-regression/` 样本清单和文本/Markdown 固定样本，Vitest 运行时在中文路径 `投标项目/样本文档` 动态生成 TXT、Markdown、DOCX、PDF、PNG、OFD 样本；TXT/Markdown/DOCX/PDF 走真实 `parseDocumentWithConfig()` 本地解析。
- 2026-06-15 已完成远程回归环境门控第一阶段：PNG/OFD 保持能力矩阵和本地不支持断言；MinerU 精准 / MinerU Agent 端到端网络回归需要显式 `YIBIAO_RUN_MINERU_E2E=1`，精准解析还需要 `YIBIAO_MINERU_TOKEN`，未设置时测试明确输出 skipped 缺口而不触发网络。

验收：

- Windows 中文路径、中文文件名、WPS/Word/LibreOffice 转换链路均有 smoke。
- 已补充：`fileServiceParserCapabilities.test.ts` 覆盖样本扩展名矩阵、扫描件/OFD 提示、中文路径示例和 MinerU 到本地解析的 WPS 回退。
- 已补充：`fileServiceParserRegression.test.ts` 覆盖中文路径真实文件回归，TXT、Markdown、DOCX、PDF 通过本地真实解析链路，PNG/OFD 明确不走本地解析。
- 待完成：在具备网络和 MinerU Token 的环境中开启 `YIBIAO_RUN_MINERU_E2E=1`，补跑并固化 MinerU 精准 / MinerU Agent 的真实端到端回归结果。

### 4.2 Word 导出高级能力

目标：

- 页眉、目录页、封面、分节符、水印、表格样式、图片压缩策略、Mermaid 失败替代图。
- 导出前检查报告与导出后 warnings 统一。
- 已补充：Main 侧 Word 导出预检报告，统计叶子章节、Mermaid、图片来源类型、缺失本地图片，并把预检提示并入导出 warnings。
- 已补充：`exportWord()` / `buildDocxResult()` 返回结构化 `preflight`，导出完成日志同步记录预检摘要。
- 已补充：缺失本地图片不会中断 Word 生成，会在文档中保留“图片无法导出”占位，并通过 warnings 提醒用户核对。

验收：

- 大文档导出不崩溃，失败资源不阻断整体导出。
- 已补充：`exportServiceHeader.test.ts` 覆盖缺失本地图片时 docx 仍生成、预检统计缺失图片、warnings 同时包含预检提示和导出占位提示。

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
- 已支持项目列表、创建、设为当前项目、归档/恢复、删除、复制项目、导出项目包和导入项目包；切换当前项目会返回 `restart_required`，提示需要重启后重新初始化业务 Store。
- 2026-06-15 已完成第二阶段：`getWorkspaceDir(app)` 支持项目工作区覆盖，主进程启动时会读取 active project，并用 project-scoped app 初始化 `aiService`、`fileService`、`createSqliteDatabase()` 和各业务 Store；默认项目仍兼容旧 `userData/workspace`。
- 2026-06-15 已完成第三阶段第一步：设置页通用配置区新增项目工作区 UI，支持查看当前项目、刷新项目列表、新建并设为当前项目、切换项目确认、归档/恢复和删除项目；切换/删除前会检查 `tasks.getActiveTasks()`，后台任务运行中会阻止操作；切换后仍按 `restart_required` 提示重启加载新项目工作区。
- 2026-06-15 已完成第三阶段第二步：Playwright E2E 覆盖设置页项目工作区列表、后台任务运行时阻止切换、清空任务后打开切换确认弹窗、确认切换调用 `projectWorkspace.setActive()` 并展示重启后加载新工作区提示。
- 2026-06-15 已完成第三阶段第三步：设置页项目工作区 UI 补齐复制项目、导出项目包和导入项目包入口；复制、导出、导入前复用后台任务运行保护，避免项目数据流转时后台任务仍在写工作区。

目标：

- 当前业务状态偏单例工作区。后续可支持多个投标项目：项目列表、项目归档、复制项目、删除项目、导入导出项目包。
- 已完成第一阶段：项目注册表和 workspace 目录管理基础设施。
- 已完成第二阶段：应用启动时按 active project 初始化 SQLite、文件目录和业务 Store。
- 已完成第三阶段第一步：项目切换 UI、切换确认和任务运行中保护。
- 已完成第三阶段第二步：补充重启作用域的项目切换 E2E 验收；运行时跨项目热刷新仍作为后续可选增强，不作为当前默认工作流。
- 已完成第三阶段第三步：补齐复制、导出项目包和导入项目包的设置页入口。

验收：

- 已补充：`projectWorkspaceStore.test.ts` 覆盖默认项目兼容旧 `userData/workspace`，项目创建/激活/归档/恢复/删除，以及复制、导出和导入项目包时 workspace 文件随项目流转。
- 已补充：`projectWorkspaceStore.test.ts` 覆盖 scoped app 下 `getWorkspaceDir()` 和 `getWorkspaceDatabasePath()` 解析到 active project workspace，默认项目路径仍保持旧 `userData/workspace`。
- 已补充：`SettingsPage.test.tsx` 覆盖项目工作区列表加载、新建并切换、切换确认调用 `projectWorkspace.setActive()`，以及后台任务运行时阻止项目切换。
- 已补充：`SettingsPage.test.tsx` 覆盖复制项目、导出项目包和导入项目包 bridge 调用。
- 已补充：Playwright E2E 覆盖设置页项目工作区列表加载、运行中任务阻止切换、复制/导出/导入项目包入口、确认切换和重启提示；通用 Radix Dialog 层级已修复，确认按钮不再被 overlay 拦截。
- 不同项目之间技术方案、知识引用、查重、废标检查状态隔离由 project-scoped `getWorkspaceDir()` / `getWorkspaceDatabasePath()` 单测和设置页重启作用域 E2E 共同验证；运行时热刷新隔离仍保留为后续增强。

### 5.2 Agent 原生操作接口

现状：

- 仓库已有未跟踪 `agent-harness/`，但不应在本计划中假定完成。
- 已补充：按 CLI-Anything 结构新增 `agent-harness/setup.py` 与 `cli_anything/openbidkit_yibiao/` 命名空间包，提供 `cli-anything-openbidkit-yibiao` console script。
- 已补充：CLI 支持默认 REPL、`--json status`、`--json plan-summary`、`--json smoke`、`--json list-smoke`，读取真实仓库文件、用户 workspace 状态，并通过 subprocess 调用真实 Node/npm 检查。
- 已补充：CLI 支持 `--json export-report --kind duplicate|rejection --state-json <path> --output <path> --format md|docx|pdf`，通过包内 Node helper 调用真实 Electron Main 报告 builder 生成 Markdown、Word `.docx` 或文本型 PDF，不重写报告业务逻辑。
- 2026-06-15 已补充：CLI 支持 `--json list-tasks` 和 `--json start-task --type <task-type> --payload-json <path> --dry-run`，通过真实 `taskService.cjs` 枚举 Electron Main 任务定义，并生成 side-effect-free 的任务启动计划、scope key 和 payload signature。
- 已补充：生成 package-local `skills/SKILL.md`，并保留原有一次性生成脚本和输出产物。

目标：

- 为 Codex/Agent 暴露可验证的 CLI 或 harness：读取工作区状态、启动任务、导出报告、执行 smoke。
- 如果采用 CLI-Anything，必须使用真实 Electron/Main 服务或稳定数据文件，不重写业务逻辑。
- 已完成导出报告 headless 包装第二阶段：Duplicate Check / Rejection Check 可通过状态 JSON 调用真实 Main 报告 builder 导出 Markdown 和 Word `.docx`。
- 2026-06-15 已完成导出报告 headless 包装第三阶段：Duplicate Check / Rejection Check 可通过同一命令追加 `--format pdf` 导出文本型 PDF，并继续复用真实 Electron Main PDF builder。
- 2026-06-15 已完成任务启动 headless 包装第一阶段：可枚举真实后台任务定义，并对 `duplicate-analysis`、`knowledge-base-preparation` 等任务生成 dry-run 启动计划；真实执行仍需 Electron Main 桌面会话承载 runner、IPC、Store 和任务事件。

验收：

- 支持 JSON 输出。
- 有 E2E 测试覆盖真实后端能力或明确环境缺口。
- 已补充：`agent-harness/TEST.md`、`test_core.py`、`test_full_e2e.py` 覆盖 repo 状态读取、plan 摘要、smoke 命令定义、已安装 CLI JSON 输出、真实 `node --check` smoke、duplicate/rejection Markdown/Word/PDF 报告导出、真实任务定义枚举和任务 dry-run 启动计划。
- 已通过：在 `agent-harness/.venv` 中 editable install 后，17 个 unittest 全部通过。

### 5.3 文档与官网同步

现状：

- 2026-06-15 已完成第一阶段：中文 README 和英文 README 已同步当前功能状态，不再把商务标、图片知识库、AI 评标、投标机会、标书查重、废标项检查等已落地能力描述为预留或开发中。
- 2026-06-15 已新增 `client/doc/用户手册与故障排查.md`，按技术方案、商务标、AI 评标、投标机会、知识库、图片知识库、标书查重、废标项检查、设置、资源和开发者工具梳理入口、交付物、常见问题和验证命令。
- README 已明确仍在演进的边界：多项目工作区、真实图片截屏证据、复杂相似图证据视图、真实样本文档集三路径端到端回归。

目标：

- 已完成第一阶段：README 中“更多功能还在开发中”的泛化承诺已随真实功能状态更新。
- 已完成第一阶段：英文 README 同步。
- 已完成第一阶段：对核心功能补用户手册和故障排查索引。
- 待持续维护：后续每完成截图定位、多项目、复杂相似图证据视图和真实样本文档集等能力后，同步 README、英文 README 和用户手册。

验收：

- 已补充：README 不再把已完成能力描述为“预留/开发中”，也不把未完成的多项目、截图定位、复杂相似图证据视图和真实样本文档集描述成已完成。
- 已补充：英文 README 与中文 README 的功能状态保持一致。
- 已补充：核心功能用户手册与故障排查入口已落到 `client/doc/用户手册与故障排查.md`。

## 6. 执行顺序建议

1. 先做 P0 菜单占位清零：商务标、图片知识库、AI 评标、投标机会、技术方案 Step06 处理。
2. 再做 P1 基础缺口：页眉导出、设置页主题/布局、模型列表、本地模型体验。
3. 然后做 P1 已有功能增强：已有方案扩写覆盖审计、知识库任务统一、查重忽略规则、废标报告导出。
4. 再做 P2 跨平台硬化：解析样本集、Word 高级导出、发布更新、Analytics。
5. 最后做 P3 多项目和 Agent 原生接口。

## 7. 每个任务的固定交付要求

- 先更新或新增局部设计说明，写清状态、IPC、Store、任务和清空规则。
- 涉及 Renderer/TypeScript：运行 `cd client; npm run build`。
- 涉及 Electron Main/preload：先 `node --check` 对应 `.cjs`，再 `npm run build`。
- 涉及 SQLite：同步 `client/electron/services/sqliteDatabase.cjs` 和 `sql/workspace_schema.sql`。
- 涉及菜单：同步 `navigation.ts`、`menuConfig.ts`、`AppRouter.tsx`、Analytics 页面映射。
- 涉及 Analytics：Worker/Dashboard 对应目录运行语法检查或部署前检查，不能引入密钥。
- 涉及用户可见文案：中文、清晰、可操作。
- 涉及长任务：Main 后台任务执行，Renderer 只启动、订阅、读取 Store。
