# OpenBidKit_Yibiao 项目设计约束

本文档是后续交给 Codex 迭代前的项目知识基线。任何具体开发计划 `plan.md` 应先遵守本文件、仓库根目录 `AGENTS.md` 和 `client/开发说明.md`，再展开任务拆解。

## 1. 项目定位

- 产品名称：易标投标工具箱。
- 产品形态：本地安装的 Electron 桌面客户端，面向招投标场景提供 AI 标书生成、已有方案扩写、知识库、标书查重、废标项检查、导出格式配置、资源下载等能力。
- 有效产品代码主体在 `client/`。
- `analytics/` 是独立 Cloudflare Workers 埋点统计服务，用于接收、聚合和展示 `client/` 上报的数据。
- `archive/` 是归档历史数据，后续开发与排查默认忽略，不读取。

## 2. 代码语言与框架

### Client

- 桌面运行时：Electron。
- Renderer：Vite + React + TypeScript，ESM。
- Electron Main / preload：CommonJS，文件后缀为 `.cjs`。
- UI 基础组件：Radix UI。
- 样式：全局 CSS，不使用 Tailwind。
- 本地数据库：`better-sqlite3`，运行在 Electron Main 侧。
- Markdown：`react-markdown`、`remark-gfm`；默认不启用 `rehypeRaw`，除非明确展示可信 HTML。
- Mermaid：以 Markdown `mermaid` 代码块保存，Renderer 本地预览，Word 导出由 Main 转图片。
- 打包：`electron-builder`，配置在 `client/package.json` 的 `build` 字段。

### Analytics

- Worker / Dashboard：Cloudflare Workers，JavaScript ESM。
- 部署工具：Wrangler。
- 数据源：Analytics Engine、D1、KV、R2。
- 密钥不得进入仓库，`wrangler.jsonc` 保持 `keep_vars: true`，不要新增 `secrets.required`。

## 3. 前端与后端边界

本项目不是传统 Web 前后端分离架构。`client/` 内部的 Renderer 和 Electron Main 是同一桌面客户端的两个进程边界。

- Renderer 只负责 UI、交互编排、状态展示和轻量偏好。
- Renderer 禁止直接访问 Node、`fs`、`path`、`ipcRenderer`。
- Renderer 只能通过 preload 暴露的 `window.yibiao` 调用本地能力。
- `client/electron/preload.cjs` 是 bridge 实现。
- `client/src/shared/types/ipc.ts` 是 Renderer 侧 bridge 类型权威。
- 新增或调整 bridge API 时，必须同步：
  - `client/electron/ipc/*.cjs`
  - `client/electron/preload.cjs`
  - `client/src/shared/types/ipc.ts`
- Electron Main 负责配置、文件解析、本地数据库、AI 请求、后台任务、导出、自动更新和本地日志。
- `client/electron/ipc/*.cjs` 只注册通道和转发参数，不写业务逻辑。
- 业务逻辑放在 `client/electron/services/*.cjs`。

## 4. Client 架构入口

- Renderer 入口：`client/src/main.tsx`。
- 应用根组件：`client/src/App.tsx`。
- Provider 与应用外壳：`AppProviders`、`AppShell`。
- 路由入口：`client/src/app/AppRouter.tsx`。
- 主菜单配置：`client/src/app/menuConfig.ts`。
- 导航类型：`client/src/shared/types/navigation.ts`。

新增主菜单页面时通常同步修改：

- `client/src/shared/types/navigation.ts`
- `client/src/app/menuConfig.ts`
- `client/src/app/AppRouter.tsx`
- 如需全局工具条，先确认仓库是否已有对应工具条配置；当前页面多以页面内工具条或 `FloatingToolbar` 模式处理。
- 如涉及埋点页面展示，还要同步 `analytics/dashboard/public/src/pages/traffic.js` 的中文映射。

## 5. 功能模块边界

业务功能放在 `client/src/features/<feature>/`，跨功能能力放在 `client/src/shared/`。

当前主要 feature：

- `technical-plan`：生成技术方案、已有方案扩写的共用流程。
- `knowledge-base`：文档知识库。
- `duplicate-check`：标书查重。
- `rejection-check`：废标项检查。
- `settings`：模型、解析、开发者模式、更新等设置。
- 设置页通用外观配置保存在 `user_config.json`：`language` 当前固定 `zh-CN`，`theme` 支持 `system` / `light` / `dark`，`sidebar_layout` 支持 `classic` / `compact`。Renderer 通过 App 根状态应用主题和侧边栏布局，Electron Main 启动和配置保存后通过 `nativeTheme.themeSource` 同步原生主题源；具体业务页面不要各自持久化外观偏好。新增或改造页面优先使用 `--yb-*` 主题变量，避免硬编码白底卡片，历史页面深色兼容层集中维护在 `client/src/styles.css`。
- `export-format`：Word 导出格式配置。
- `resources`：资源下载。
- `business-bid`：已完成商务响应矩阵工作台，支持复用技术方案招标文件或独立导入商务标招标文件生成矩阵，维护响应内容、偏离、风险、待补材料、负责人、确认人和确认状态；已新增 AI 结构化提取后台任务，Main 侧通过 `taskService` 管理 `business-bid-ai-extraction`，复用 `aiService` JSON 修复链路并归一化到现有矩阵字段，任务状态持久化到 `business_bid_tasks`；已支持独立附件管理，附件文件复制到 `workspace/business-bid/attachments/`，结构化状态保存在 `business_bid_attachments`，Renderer 只维护附件类型、状态、负责人和备注；已支持 Markdown、Word `.docx` 和 Excel `.xlsx` 导出商务响应表、合同偏离表、资信材料清单、报价附件清单和独立附件清单；已通过固定枚举埋点记录独立导入、生成矩阵、启动 AI 提取、确认条款和导出材料包；深度集成按 `plan.md` 继续迭代。
- `ai-evaluation`：已完成评分表工作台，支持从技术方案生成评分项，并可独立导入投标文件匹配证据、更新风险和自评分；投标文件证据摘录必须携带 Markdown 章节标题、原文行号和命中关键词，后续报告直接复用该证据字段；已新增 AI 结构化抽取后台任务，Main 侧通过 `taskService` 管理 `ai-evaluation-extraction`，复用 `aiService` JSON 修复链路并归一化到现有评分项字段，任务状态持久化到 `ai_evaluation_tasks`；已支持连续导入多份投标文件，Markdown 原文保存到 `workspace/ai-evaluation/bid-documents/`，元数据和逐文件评分快照保存到 `ai_evaluation_bid_documents` / `ai_evaluation_bid_scores`，页面和 Markdown 自评报告展示多投标文件评分汇总；已支持 `ai-evaluation-batch-scoring` 后台任务批量重评已导入投标文件，任务状态通过 `batchScoringTask` 回放；已支持专家打分交叉审核，专家姓名、专家角色、评审会议、专家分、签名确认和专家意见保存到 `ai_evaluation_expert_scores`，Main 侧根据未签名记录、专家间分差和专家均分与当前最终分偏差生成审计意见；已支持审计意见和报告快照，Main 侧根据高风险、待复核、客观分/报价核验、多投标文件横向分差、专家签名和专家打分偏差写入 `ai_evaluation_audit_opinions`，导出报告时写入 `ai_evaluation_reports`；已支持 Main 侧导出 Markdown、Word `.docx` 和 Excel `.xlsx` 正式报告，Word/Excel 报告包含摘要、投标文件评分汇总、专家打分交叉审核、评审会议、专家角色、签名确认、审计意见、评分明细、高风险项和待复核项；已支持导出 Word `.docx` 评标委员会会议纪要模板并保存 `committee-minutes` 报告快照；后续如做更完整正式评标委员会流程，可再追加独立会议表和专家权限控制。
- `bid-opportunity`：已完成机会工作台，支持手动粘贴公告、AI 结构化解析、规则兜底解析、导入公告文件、读取公告 URL、维护负责人/下一步动作/提醒时间、多轮跟进记录、公告/沟通附件、企业知识库/历史项目资料匹配，并可导出投标建议报告和 `.ics` 提醒日历；公告 AI 解析由 Main 侧通过 `aiService.collectJsonResponse()` / `requestJson()` 执行，失败或未配置 AI 时自动回退规则解析并写入复核风险；知识库匹配由 Main 侧读取 `knowledge_items`，按公告字段、资格要求、行业和关键词生成 `knowledge_matches_json`，Renderer 只展示匹配摘要；多轮跟进保存在 `bid_opportunity_follow_ups`，附件复制到 `workspace/bid-opportunity/attachments/` 并由 `bid_opportunity_attachments` 记录类型、备注、原始路径和工作区路径；机会评分保存在 `score_breakdown_json`，基础维度保留资格匹配、预算规模、时间节奏、区域匹配、交付可行性，并新增竞争强度、利润空间、工期可控性、历史中标相似度，页面详情和投标建议报告必须同步展示。
- `image-knowledge-base`：已完成图片素材工作台，支持多图上传、文件夹/分类/标签/来源/场景检索、元数据编辑、引用回溯、正文插入、Word 导出解析、批量分类、批量设置文件夹、批量追加标签、批量删除、标签重命名和标签删除；正文生成进入 AI 生图候选时，Main 侧会优先用章节语义自动匹配图片知识库，命中后写入本地图片 Markdown 引用并跳过 AI 生图；后续跨模块深度集成按 `plan.md` 继续迭代。
- `developer`：开发者模式下的调试页面。Prompt 调试台覆盖招标解析、目录生成、评分大类、废标项、全局事实、正文编排、正文生成、原方案还原、查重规则观察等链路；正文/全局事实当前以 Main 侧任务约束样本展示，后续若调整任务 prompt，应同步抽取 shared builder 或更新调试样本。Json 请求测试实验室当前覆盖目录生成、全局事实、废标项检查、商务标条款、投标机会公告解析、AI 评标评分项六类 JSON schema；新增业务 AI JSON 链路时应优先补进该实验室，并保留失败样本与开发者日志回放的脱敏边界。

共享层约束：

- `client/src/shared/` 不引用 feature，避免循环依赖。
- Prompt 统一放在 `client/src/shared/prompts/` 或 Main 侧对应服务中，不在组件内硬编码大段 Prompt。
- Markdown 展示复用 `client/src/shared/ui/MarkdownRenderer.tsx`。
- Markdown 编辑复用 `client/src/shared/ui/MarkdownEditor.tsx`。
- 成功、失败、警告、普通消息统一走 `client/src/shared/ui/ToastProvider`，不要使用 `alert`。

## 6. 数据与数据库

### 本地文件位置

- 配置：Electron `userData/user_config.json`。
- 工作区：Electron `userData/workspace/`。
- 主 SQLite：Electron `userData/workspace/yibiao.sqlite`。
- 技术方案权威缓存：Electron `userData/workspace/technical_plan.json` 以及 SQLite Store 中的结构化状态。
- 大文本 Markdown、原始上传文件、图片资产保存为文件；SQLite 只保存路径、hash、计数和结构化状态。
- 项目级工作区由 `client/electron/services/projectWorkspaceStore.cjs` 管理 `userData/projects/projects.json` 注册表。默认项目固定兼容旧目录 `userData/workspace`；新建项目目录为 `userData/projects/<projectId>/workspace`，支持创建、设为当前、归档、删除、复制、导出项目包和导入项目包。`getWorkspaceDir(app)` 支持 project-scoped app 覆盖，主进程启动时会按 active project 初始化 SQLite、文件目录和业务 Store；设置页通用配置区提供项目列表、新建并切换、切换确认、归档/恢复、删除、复制、导出项目包和导入项目包入口，切换、复制、删除和项目包流转前必须通过 `tasks.getActiveTasks()` 确认无后台任务运行。当前 Electron 会话内切换 active project 会通过 `projectWorkspaceIpc` 触发 Main 侧热重建 project-scoped app、AI/文件服务、SQLite、业务 Store、任务服务和工作区 IPC，并返回 `runtime_reloaded: true`；底层 `projectWorkspaceStore.setActiveProject()` 仍保留 `restart_required` 字段作为无热重载包装时的兼容信号。

### SQLite 约束

- 目标完整表结构说明在 `sql/workspace_schema.sql`。
- 运行时建表和升级以 `client/electron/services/sqliteDatabase.cjs` 为准。
- 当前 schema 版本为 `PRAGMA user_version = 35`。
- 每次表结构调整必须同时更新：
  - `client/electron/services/sqliteDatabase.cjs` runtime migration
  - `sql/workspace_schema.sql` 目标结构说明
- SQLite 默认启用外键、WAL 和 busy timeout。

主要表族：

- `technical_plan_*`：技术方案流程、任务、招标解析项、目录树、正文小节、正文计划、全局事实。
- `duplicate_check_*`：查重工作区、文件、任务、分析分区、提取正文、元数据等。
- 标书查重正文重复句和重复图片组带 `resolution_status` / `resolved_at`，用于保存未处理、已确认、已忽略等人工处理状态；Renderer 调用 `duplicateCheck.resolveItem()` / `duplicateCheck.batchHandleItems()` 更新，不能只在前端过滤。
- 标书查重图片结果带 `match_type` / `similarity_score` / `similarity_reason`，`exact` 表示文件内容 hash 完全一致，`similar` 表示平均感知 hash 相近且尺寸比例接近的疑似压缩、缩放或截图后复用图片；相似图片检测依赖可用的本地图片解码器，解码失败时必须保留原精确 hash 比对路径。
- 标书查重正文常用忽略规则存入 `duplicate_check_content_ignore_rules`，包含 `category` 分类（手动忽略、招标引用、固定模板、批量规则）；Renderer 调用 `duplicateCheck.saveContentIgnoreRule()` 添加规则，Main 侧在保存正文分析时按 normalized 文本自动把匹配重复句标为已忽略；规则可通过 `duplicateCheck.exportContentIgnoreRules()` / `duplicateCheck.importContentIgnoreRules()` 导出和导入 JSON 包，用于跨项目复用。
- 标书查重报告导出通过 `duplicateCheck.exportReport()` 进入 Main 侧，由 `duplicateCheckStore.cjs` 读取当前工作区并生成 Markdown、Word `.docx` 或文本型 PDF；Markdown 写入必须显式使用 UTF-8，Word/PDF 版本复用同一份 Markdown 报告内容。报告必须包含按正文/图片未处理、已确认、已忽略数量和正文忽略规则数量生成的“批量处理建议”，并在图片结果中输出完全重复/相似图片类型、相似度和相似原因；相似图片复核视图需要按图片组输出涉及文件、判断依据、图序、目录、图片前文和人工复核建议，用于指导交付前批量确认、批量忽略和复核；PDF 中的复核视图需要保留图形化卡片绘制，Renderer 只负责触发导出和展示 Toast。
- `rejection_check_*`：废标项检查工作区、文件、任务、检查项和结果。
- 废标项检查风险、错别字和逻辑谬误结果带 `resolution_status` / `resolved_at`，用于保存未处理、已忽略等人工处理状态；Renderer 调用 `rejectionCheck.resolveFinding()` 更新，不能只在前端过滤。
- 废标项检查报告导出通过 `rejectionCheck.exportReport({ format })` 进入 Main 侧，由 `rejectionCheckStore.cjs` 读取当前工作区并生成 Markdown、Word `.docx` 或 PDF；Markdown 写入必须显式使用 UTF-8，Word/PDF 版本复用同一份 Markdown 报告内容。报告必须包含未忽略结果的证据定位明细，覆盖投标文件、位置线索、原文/证据、原因和建议，并尽量从投标文件正文匹配章节、行号和前后文片段；证据定位明细需要保留索引表、稳定 HTML 锚点和索引跳转链接，并在同一证据编号下输出文本型“证据截图视图”，标记目标行和前后文；当投标文件存在页面截图候选时，报告导出会按裁剪框或自动裁剪框生成真实裁剪 PNG，Markdown 引用裁剪图，Word 嵌入裁剪图，PDF 保留裁剪图资产引用并继续绘制图形化证据卡；Renderer 只负责触发导出和展示 Toast。
- 废标项检查单文件重查通过 `tasks.startRejectionCheck({ targetBidDocumentIds })` 启动；Main 侧只替换目标投标文件的 findings，必须保留其他投标文件的检查结果和人工处理状态。
- `knowledge_*`：知识库文件夹、文档、条目、分析、迁移和排序状态。
- `ai_evaluation_*`：AI 评标评分项、自评结果、人工调整、复核状态、多投标文件元数据、逐文件评分快照、专家打分、审计意见和报告快照。
- AI 评标结构化抽取和批量评分任务状态保存在 `ai_evaluation_tasks`；Renderer 只能通过 `tasks.startAiEvaluationExtraction()` / `tasks.startAiEvaluationBatchScoring()` 启动，并通过 `tasks:event.aiEvaluation` 回放状态。
- AI 评标导入的投标文件 Markdown 原文保存在 `workspace/ai-evaluation/bid-documents/`；SQLite 只保存相对路径、hash、字符数、解析器、排序和逐评分项快照，清空 AI 评标工作台时必须同步清理该目录。
- AI 评标专家打分保存在 `ai_evaluation_expert_scores`；Renderer 提交专家姓名、专家角色、评审会议、评分项、分数、签名确认和意见，签名时间由 Main 侧在确认时写入，未签名提醒、专家间分差与专家均分偏差由 Main 侧统一计算并刷新审计意见。
- AI 评标审计意见保存在 `ai_evaluation_audit_opinions`；报告 Markdown 快照保存在 `ai_evaluation_reports`，导出文件路径只作为可选记录，不作为报告正文权威来源。

权威数据规则：

- 技术方案正文展示和 Word 导出以 `outlineData.outline[*].content` 为权威来源。
- 目录重新生成、编辑、添加或删除后，必须清空旧正文内容和正文生成缓存。
- Renderer 只允许用 `localStorage` 存轻量 UI 偏好；大文本、草稿、API Key、流程状态必须走 Main 侧存储或 IPC。
- 资源下载页的公开资源列表可作为轻量 UI 缓存写入 Renderer `localStorage`，仅用于接口失败时展示离线缓存；不得缓存用户文档、Prompt、API Key 或业务草稿。

## 7. 后台任务模型

耗时任务必须放在 Electron Main 后台任务中执行，Renderer 只负责启动、订阅、读取快照和展示。

统一任务入口在 `client/electron/services/taskService.cjs`，主要任务类型：

- `bid-analysis`：招标文件解析。
- `outline-generation`：目录生成。
- `global-facts-generation`：全局事实生成。
- `content-generation`：正文生成。
- `rejection-items-extraction`：废标项解析。
- `rejection-check-run`：废标项检查。
- `duplicate-analysis`：标书查重分析。

任务约束：

- 任务启动后必须立即写入 running 状态。
- 关键阶段持续写入对应 Store。
- 页面卸载不能取消任务，也不能作为失败信号。
- 页面重新挂载后先读取 Store，再订阅任务事件，并通过 `getActiveTasks()` 回放 active task。
- Store 中存在 running/pausing 但 Main 没有 active task 时，应进入明确的中断或可恢复状态，不能静默当作 idle。
- 技术方案、查重、废标项检查当前使用 `group-exclusive` 互斥策略。
- 知识库当前仍由 `knowledgeBaseService.cjs` 执行文档级准备和匹配，并通过 `knowledgeBase.getActiveTasks()` 暴露当前文档级运行快照；Renderer 首次加载合并该快照并展示正在处理的文档。统一 `taskService.cjs` 已登记 `knowledge-base-preparation` / `knowledge-base-matching` 任务定义，并支持同类型任务按 `scope_id=documentId` 保留独立 active task 快照，后续若把执行权完全迁入 `taskService`，必须继续保留 `scope-exclusive(documentId)` 语义。

## 8. AI、Prompt、文件解析与导出

- AI 请求统一由 Main 侧 `client/electron/services/aiService.cjs` 承担，Renderer 侧仅保留必要轻量门面。
- 文本模型 provider 配置以 `client/src/shared/types/config.ts` 和 `client/electron/services/configStore.cjs` 为准。Codex CLI、Ollama 本地 provider、LM Studio、vLLM、llama.cpp、Jan 均不保存 API Key；Ollama 模型列表走 `/api/tags`，LM Studio、vLLM、llama.cpp、Jan 和其他 OpenAI-compatible 服务走 `/models`。
- JSON 主请求解析失败时复用现有 JSON 修复链路。
- 修复请求只提交模型已返回内容片段、校验问题和目标格式，不重复提交完整大文本上下文。
- 开发者 JSON 请求实验室的失败样本由 Main 侧 `aiService.cjs` 保存到 `userData/logs/developer-json-lab/failure-samples.json`；只允许保存场景、schema、错误消息、有限长度的待修复内容片段和校验问题，不保存完整 Prompt、API Key、业务文件路径或正文全文。
- 开发者 JSON 请求实验室的日志回放只能由 Main 侧读取 `userData/logs/ai/*.json`，只筛选 JSON 文本请求日志，只向 Renderer 返回日志标题、时间、类型、错误消息、有限长度模型响应片段和校验提示；禁止把完整 request messages、API Key、Base URL、本地文件路径或完整业务正文下发到 Renderer。
- 开发者文件解析沙盘通过 `window.yibiao.file.parseDeveloperSample()` 调用 Main 侧真实 `fileService.parseDocumentWithConfig()`；首次解析可打开文件选择框，解析器对比必须复用首次结果的 `file.file_path` 调用同一 bridge 的 `filePath` 参数，确保比较的是同一样本文件。该能力仅用于开发者模式本地诊断，不得上传本地路径到 Analytics。
- 不按 token、chunk 或部分内容落盘；只在阶段开始、完整返回、失败、暂停或结束时写 Store。
- 全文一致性审计报告随正文生成任务 `stats.audit` 返回，记录审计是否启用、运行状态、分组完成数、冲突项、已修复项、需人工核对项和失败分组；Renderer 展示普通用户可读报告，并支持跳转章节、编辑章节、单章节重新审计、失败分组 audit-only 复审和标记人工处理项。
- 失败审计分组必须保存 `section_ids`；失败分组复审通过 `tasks.startContentGeneration({ auditOnly: true, auditTargetItemIds })` 启动，只跑一致性审计，不重写正文、不扩写、不配图。
- 审计项人工处理状态通过 `technicalPlan.resolveConsistencyAuditItem()` 持久化到 `technical_plan_tasks.stats_json`，只更新 `stats.audit`，不改正文内容。
- 已有方案扩写的原方案覆盖审计报告随正文生成任务 `stats.originalCoverage` 返回，记录来源段总数、已审计数、覆盖率、covered/partial/missing/conflict 数量、已补回数、需人工核对数、失败章节和 `unassigned_items` 未分配原文段；`commitment_summary` 从覆盖项派生服务响应、售后质保、交付周期、技术路线、人员设备等核心承诺保留率和风险项；Renderer 仅在扩写模式展示“原方案覆盖审计报告”和“核心承诺保留审计”。
- 未分配原方案段落由 `technicalPlan.handleOriginalCoverageUnassignedSegment()` 处理，支持忽略或绑定到目标章节；绑定会把原文段追加到章节正文，并更新该章节正文计划的 `original_material`，供后续优化扩写继续识别。
- 正文生成配图统计由 Main 侧任务 `stats.images` 维护，区分 AI 生图、Mermaid 和图片知识库的计划、尝试、成功、失败、跳过数量；Renderer 展示用户可见的配图策略报告，开发者模式可显示更细的调试统计。
- 技术方案正文引用文档知识库时，Main 侧 `contentGenerationTask.cjs` 先按当前小节标题、描述、上级章节和项目概述对知识库轻量条目做本地相关性排序；每个小节 Prompt 只接收该小节强相关候选，并带 `relevance_score`、`matched_terms`、`relevance_reason` 作为可解释引用依据。模型返回的 `knowledge.item_ids` 仍必须通过全局允许列表归一化，正文生成阶段只读取被选中条目的完整正文素材。
- 文档知识库段落匹配由 Main 侧 `knowledgeBaseService.cjs` 执行；进入 AI 批次匹配前，会按本批知识条目的标题和摘要对文档 block 做本地候选筛选，Prompt 中只提交候选 block，并在开发者日志记录候选数量、全文数量和匹配词。遗漏恢复仍基于未覆盖 block 执行，避免预筛选漏掉可复用内容后无法补回。
- 正文图片以 Markdown 图片语法保存，图例统一使用 `图：...` 文本；Renderer 通过 `markdown-figure-caption` 居中展示图例，正文图片点击后打开全屏预览弹窗。
- 文件解析优先复用 `client/electron/services/fileService.cjs` 的统一入口。
- 文件解析回归样本维护在 `client/test/fixtures/parser-regression/` 和 `fileServiceParserRegression.test.ts`；本地回归必须覆盖中文路径下的 TXT、Markdown、DOCX、PDF 真实解析，扫描 PDF / 图片优先通过本地 OCR 解析并生成页面截图候选，本地 OCR 默认优先使用 PaddleOCR、共享运行时不可用时回退 Tesseract；OFD 不走普通本地文本解析，但可通过本机 OFD 转 PDF 工具或支持 OFD 的 LibreOffice/WPS 转为 PDF 后复用本地 OCR，转换工具缺失时提示用户先另存为 PDF；MinerU 精准 / MinerU Agent 端到端网络回归必须通过显式环境变量开启，避免默认测试依赖外网或 Token。
- 新增上传、导入、转换能力时，优先复用 `parseDocumentWithConfig(app, filePath, config, { assetScope })`。
- 删除业务资源时，同步使用 `client/electron/utils/importedImages.cjs` 清理导入图片资产。
- Word 导出由 `client/electron/services/exportService.cjs` 负责，并通过 `window.yibiao.export.onWordExportProgress()` 回报进度；纯图片段落和 `图：...` 图例段落必须在 Word 中居中。导出格式页的封面、目录页、一级章节分节和文字水印配置保存在 `export_format.page`，封面、目录页和分节默认关闭；封面启用后通过分页符进入后续页面，目录页启用后写入 Word TOC 字段并通过分页符进入正文首页，一级章节分节启用后按一级章节拆 Word sections 并从第二个一级章节开始写入 `nextPage` 分节符，水印由 Main 侧通过 Word header 层写入 VML；表格样式配置保存在 `export_format.table`，Markdown 表格和可信 HTML 表格必须共用表头底色、外框线、内框线和单元格留白设置；图片导出策略保存在 `export_format.image`，当前用 `max_width_px` 控制 Word 图片等比缩小输出；Mermaid 联网转图失败时必须保留 warnings，并在 Word 中插入可见替代图和失败说明；旧配置必须由 `configStore.cjs` 补齐默认封面、目录页、分节、水印、表格和图片策略字段，封面、目录页、分节和水印默认关闭。
- 开发者导出链路预演通过 `window.yibiao.export.previewWordExport()` 进入 Main 侧 `exportService.previewWordExport()`，必须调用真实 Word docx 构建链路并丢弃 buffer，只返回 preflight、warnings、docx 字节数和耗时；不得打开保存对话框或写用户文件。
- 标书查重 Markdown / Word / PDF 报告导出由 `client/electron/services/duplicateCheckStore.cjs` 负责，Markdown 文件写入必须显式使用 UTF-8，Word docx 和文本型 PDF 必须复用同一份报告内容，并包含人工处理状态、图片匹配类型、相似度和相似原因，避免导出结果和页面筛选状态脱节。
- 废标项检查 Markdown / Word / PDF 报告导出由 `client/electron/services/rejectionCheckStore.cjs` 负责，Markdown 文件写入必须显式使用 UTF-8，Word docx 和文本型 PDF 必须复用同一份报告内容，并包含废标风险、错别字、逻辑问题、人工处理状态、证据定位索引、原文证据、文本型证据截图视图和 PDF 图形化证据卡。
- AI 评标报告导出由 `client/electron/services/aiEvaluationStore.cjs` 负责；Markdown 文件显式 UTF-8 写入，Word/Excel 由 Main 侧构造二进制包并保存报告快照，评标委员会会议纪要模板通过 `exportCommitteeReport({ format: 'docx' })` 生成 Word `.docx` 并保存 `committee-minutes` 快照，Renderer 只触发导出并展示结果。

## 9. UI 与交互约束

- 用户可见文案统一中文。
- 新页面优先复用现有卡片、胶囊 Tab、状态栏、列表/树 + 阅读器、`FloatingToolbar` 等模式。
- 页面根容器保持 `height: 100%` / `min-height: 0`。
- 长内容在页面内部滚动，不依赖 `body` 全局滚动。
- `FloatingToolbar` 是覆盖层，不为它额外预留大空白。
- 用户确认、长文案提示、危险操作优先使用项目内 Radix Dialog 和统一按钮样式，不用系统 `alert`。复用 `content-regenerate-modal` / `content-regenerate-dialog` 时，Dialog Content 必须高于 overlay 且可点击，不能让遮罩层拦截确认/取消按钮。
- 不新增全局状态库，除非复杂度确实需要。

## 10. 埋点统计约束

- Client 埋点入口：`client/src/shared/analytics/analytics.ts`。
- 商务标关键动作使用 `trackBusinessBidAction()`，只能上报固定枚举值，禁止携带条款内容、文件名、本地路径、任务 ID 或用户输入。
- AI 模型请求统计由 Main 侧 `aiService.cjs` 上报。
- Worker 上报接口：`POST /track`。
- 事件类型包括：`app_open`、`page_view`、`config_usage`、`ai_request`、`resource_click`。
- Analytics Dashboard 资源管理表需要稳定展示 R2 图片、无图占位、标签、Markdown 弹窗内容摘要、累计点击量、启停/排序状态和编辑/删除入口；相关纯函数测试位于 `analytics/dashboard/test/resourceTable.test.mjs`。
- 禁止删除、绕过或弱化现有埋点、统计字段、页面访问映射、模型使用统计和看板展示。
- 埋点路由和值应稳定、可读、低基数。
- 禁止上传 API Key、Base URL、Token、Prompt、AI 响应、错误详情、文件名、本地路径、招标文件内容、正文草稿等敏感或大文本数据。
- 埋点失败必须静默处理，不影响用户主流程。

## 11. 命令与验证

仓库根目录没有 root `package.json`。客户端命令都先进入 `client/`：

```bash
cd client
npm ci
npm run build
```

开发启动：

```bash
cd client
npm run dev
```

Electron Main / preload 改动至少做语法检查，再跑 build：

```bash
cd client
node --check electron/preload.cjs
node --check electron/services/<file>.cjs
npm run build
```

Agent 原生 CLI 位于 `agent-harness/`；`cli-anything-openbidkit-yibiao --json export-report --format md|docx|pdf` 必须通过现有 Electron Main 报告 builder 生成 Duplicate Check / Rejection Check Markdown、Word `.docx` 或 PDF，不能在 harness 中复制报告业务逻辑。任务接口只允许通过真实 `taskService.cjs` 枚举任务定义和生成 `start-task --dry-run` 启动计划；真实 runner 执行仍由 Electron Main 桌面会话承载。

依赖变更后：

```bash
cd client
npm audit
```

Analytics：

```bash
cd analytics/worker
npm install
npm run dev
npm run deploy
```

```bash
cd analytics/dashboard
npm install
npm run dev
npm run deploy
```

## 12. 后续 Codex 迭代原则

- 开始开发前先读 `AGENTS.md`、`client/开发说明.md` 和本文件。
- 不读取 `archive/`。
- 先真实排查代码，再判断异常原因；必要时增加开发者模式日志来定位问题。
- 保持小步修改，不做无关重构。
- Renderer / Main / preload / IPC / 类型要按边界同步变更。
- 修改数据库结构必须同步 runtime migration 与 `sql/workspace_schema.sql`。
- 修改主菜单入口必须同步路由、导航类型、菜单配置和埋点映射。
- 修改技术方案共用页面时，必须同时考虑“生成技术方案”和“已有方案扩写”两个入口。
- 修改埋点或 Analytics 时，必须等价保留统计能力并说明影响。
- Windows 中文路径和 UTF-8 读写是默认场景，不能只按英文路径假设实现。
