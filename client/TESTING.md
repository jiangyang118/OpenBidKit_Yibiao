# 测试说明

本目录的测试基座用于支撑 `plan.md` 中后续功能开发。新增功能时，必须把接口、UI 或端到端行为补进对应测试层。

## 命令

```bash
cd client
npm run test:unit
npm run test:e2e
npm run test
npm run smoke:release-config
cd ../analytics/worker && npm run test
cd ../dashboard && npm run test
cd ../../agent-harness && .venv/bin/python -m unittest discover -s cli_anything/openbidkit_yibiao/tests -v
```

- `test:unit`：Vitest + jsdom，覆盖纯工具、Renderer 组件和轻量接口契约。
- `test:e2e`：先执行 `npm run build`，再用 Playwright 打开 Vite preview 做浏览器端冒烟；脚本会设置 `NO_PROXY/no_proxy` 绕过本地代理，避免 preview 探活误判。
- `test`：先跑 unit，再跑 e2e。
- `smoke:release-config`：不真实打包，快速检查 electron-builder、GitHub Release、Cloudflare 更新源、macOS manifest 合并和 R2 `latest.json` 发布配置是否漂移。
- `analytics/worker` 的 `test`：先执行 Worker/scripts 语法检查，再用 Node 原生测试覆盖资源 API 的本地契约。
- `analytics/dashboard` 的 `test`：先执行 Dashboard 语法检查，再用 Node 原生测试覆盖页面映射等纯逻辑契约。
- `agent-harness` 的 unittest：验证 CLI-Anything harness 的 JSON 状态读取、计划摘要、真实 smoke 命令、真实任务定义枚举、任务 dry-run 启动计划，以及 duplicate/rejection Markdown、Word 和 PDF 报告导出。首次运行前先在仓库根目录执行 `python3 -m venv agent-harness/.venv && agent-harness/.venv/bin/python -m pip install -e agent-harness`。

## 当前覆盖

- 目录编号格式化工具。
- 主菜单和 P0 产品入口可达契约。
- 二级菜单点击与 Toast 行为。
- 商务标页面的桥接状态渲染、独立商务标招标文件导入、从技术方案生成矩阵调用、AI 结构化提取后台任务启动和任务状态展示、独立附件导入/编辑/删除调用、商务标 Markdown/Word/Excel 交付包导出按钮调用、确认条款和关键动作埋点调用，以及 Main 侧独立导入矩阵生成、AI JSON 归一化落库、附件复制到 `workspace/business-bid/attachments/`、附件状态更新、附件删除文件清理、商务响应/合同偏离/资信材料/报价附件/独立附件清单 Markdown、docx、xlsx 报告内容。
- AI 评标页面的桥接状态渲染、评分表生成调用、AI 结构化抽取后台任务启动和任务状态展示、批量评分后台任务启动和任务状态展示、投标文件导入证据匹配调用、多投标文件评分汇总展示、专家打分录入、专家角色/评审会议/签名确认保存、审计意见与最近报告快照展示、人工分保存调用、AI 评标自评报告导出按钮调用、Word/Excel 正式报告导出按钮调用，以及 Main 侧 AI JSON 归一化到评分项字段、投标文件证据匹配、多份投标文件元数据和 Markdown 文件落盘、投标文件证据章节/行号/关键词定位、已导入投标文件批量重评、逐文件评分快照、专家打分落库、未签名审计意见和交叉审核意见生成、审计意见落库、报告快照保存、评分汇总/投标文件评分汇总/专家打分交叉审核/专家角色/评审会议/签名确认/审计意见/评分明细/高风险项/待复核项 Markdown 报告内容、Word docx 包内容和 Excel xlsx 多工作表内容。
- 图片知识库页面的桥接状态渲染、上传调用、文件夹/分类/标签元数据编辑调用和引用来源回溯展示。
- 图片知识库插入链路：技术方案正文编辑页从图片库筛选素材、写入 Markdown 引用、保存章节；Main 侧生成可导出的 `yibiao-asset://image-knowledge-base/...` 引用；正文生成进入 AI 生图候选时优先按章节语义自动匹配图片知识库素材，命中后写入引用并跳过 AI 生图。
- 文档知识库 active task 恢复面：页面初始加载读取 `knowledgeBase.getActiveTasks()`，合并仍在处理的文档并展示运行态提示；`taskService.getActiveTasks()` 会合并知识库文档级任务，并保留 `scope-exclusive(documentId)`。
- 文档知识库段落匹配：`knowledgeBaseService` 单元测试覆盖批次级候选 block 预筛选，确认相关 block 进入匹配 Prompt，无关 block 不进入当前批次上下文。
- 技术方案引用文档知识库：`contentGenerationTask` 单元测试覆盖章节级知识条目相关性预筛选，确认强相关条目进入 Prompt，弱相关条目被排除，并输出 `relevance_reason` / `matched_terms` 作为可解释引用依据。
- 标书查重人工处理状态和相似图片检测：正文重复项已忽略后隐藏，确认重复调用 `duplicateCheck.resolveItem()` 并刷新持久化状态；当前正文/图片结果批量确认、忽略、恢复和删除调用 `duplicateCheck.batchHandleItems()`；正文重复句加入常用忽略规则调用 `duplicateCheck.saveContentIgnoreRule()` 并刷新规则列表，规则分类、JSON 导出和 JSON 导入分别调用 `duplicateCheck.exportContentIgnoreRules()` / `duplicateCheck.importContentIgnoreRules()`，Store 测试覆盖跨临时工作区导入恢复分类；图片结果支持 `exact` 完全重复和 `similar` 感知 hash 相似两类，页面展示相似图片、相似度和原因；查重结果页 Markdown / Word / PDF 导出按钮调用 `duplicateCheck.exportReport({ format })`；Markdown 报告必须包含按正文/图片未处理、已确认、已忽略数量和正文忽略规则数量生成的“批量处理建议”，并输出重复/相似图片类型、相似度、相似原因和文本型“相似图片复核视图”；Word 报告测试会解压 docx 检查同一份报告内容进入 `word/document.xml` 且包含图片组、图序、目录和前文上下文，PDF 报告测试检查 `%PDF-` 文件头、CJK 字体声明、查重核心文本、相似图片复核视图，以及图形化复核卡片的矩形绘制、高亮填充和边框指令进入 PDF 字节；Playwright 通过 mock bridge 覆盖查重结果页 PDF 导出和规则导入/导出调用。
- 废标项检查人工处理、报告导出、证据复制和单文件重查：已忽略废标风险默认隐藏，忽略调用 `rejectionCheck.resolveFinding()` 并刷新持久化状态；批量忽略/恢复/删除调用 `rejectionCheck.batchHandleFindings()`；检查结果页 Markdown / Word / PDF 导出按钮分别调用 `rejectionCheck.exportReport({ format: 'md' })`、`rejectionCheck.exportReport({ format: 'docx' })` 和 `rejectionCheck.exportReport({ format: 'pdf' })`；Markdown 报告证据定位明细覆盖废标风险、错别字和逻辑问题的投标文件、位置线索、原文/证据、原因和建议，并从投标文件正文匹配章节、行号和前后文片段；证据定位明细必须包含索引表、稳定 HTML 锚点、索引跳转链接和文本型“证据截图视图”；Word 报告测试会解压 docx 检查同一份报告内容进入 `word/document.xml` 且不包含已忽略证据；PDF 报告测试检查 `%PDF-` 文件头、CJK 字体声明、证据文本、目标行截图视图，以及图形化证据卡片的矩形绘制、目标行高亮填充和边框指令进入 PDF 字节；Playwright 覆盖从二级菜单进入废标项检查工作台，并通过 mock bridge 覆盖结果页 PDF 导出调用；废标风险、错别字原文和逻辑问题证据复制会带投标文件、位置线索、原文/证据和原因；当前投标文件重查会调用 `tasks.startRejectionCheck()` 并传入 `targetBidDocumentIds`。
- 资源下载页离线体验：成功加载资源后写入缓存，点击资源调用 `trackResourceClick()`，接口失败时回退本地缓存并展示离线提示。
- 资源下载页失败空态和端到端入口：接口失败且无缓存时展示友好空态；Playwright 覆盖主导航进入资源页、展示资源和打开详情弹窗。
- Analytics Worker 资源 API：本地测试覆盖管理端鉴权、新增资源、标签去重、R2 图片读取、公开列表搜索、禁用资源隐藏、删除资源时清理图片、资源列表实时叠加当天点击量，以及 Cron 汇总历史资源点击量。
- Analytics Dashboard 资源管理：本地测试覆盖资源点击列“累计 X 次”的展示口径，并覆盖资源表格中的 R2 图片、无图占位、标签、Markdown 弹窗内容摘要、启停/排序状态和编辑/删除入口。
- Analytics 隐私与页面映射：客户端只上报稳定页面 ID / 资源 key，Worker 归一化丢弃本地路径形态的 page/resource key 和任意 prompt/file/path 字段，商务标关键动作只允许固定 `businessBidActions` 枚举值，Dashboard 页面映射覆盖新增产品与开发者页面并展示商务标关键动作中文标签。
- Analytics Worker/Dashboard 部署前语法检查：`npm run check` 使用 `node --check` 覆盖 Worker、Dashboard 和 analytics scripts。
- Agent 原生 CLI harness：`cli-anything-openbidkit-yibiao` 支持 `--json status`、`--json plan-summary`、`--json smoke`、`--json list-tasks`、`--json start-task --dry-run` 和 `--json export-report --format md|docx|pdf`；E2E 测试通过已安装 console script 调用真实 Node syntax smoke、真实 Electron Main taskService dry-run 计划，并通过真实 Electron Main 报告 builder 导出 duplicate/rejection Markdown、Word 和 PDF 报告。
- 投标机会页面的桥接状态渲染、公告规则保存调用、公告 AI 解析保存调用、公告文件导入调用、公告 URL 读取调用、知识库匹配结果展示、评分拆解维度展示、负责人/下一步动作/提醒时间保存调用、投标建议报告导出按钮调用、提醒日历导出按钮调用，以及 Main 侧公告文件解析保存、AI 公告字段解析、AI 失败规则兜底、`knowledge_items` 资质/业绩匹配、竞争强度/利润空间/工期可控性/历史中标相似度评分、URL HTML 转文本、跟进字段持久化、机会看板/评分拆解/知识库匹配/风险提示/跟进信息 Markdown 报告内容和 iCalendar `.ics` 内容。
- Prompt 调试台真实 prompt 渲染和业务链路切换；组件测试覆盖招标解析、目录生成、废标项、全局事实、正文编排、正文生成、原方案还原和查重规则观察入口，并确认扩展链路可切换查看输出约束和注入消息。
- Json 请求测试实验室：支持目录生成、全局事实、废标项检查、商务标条款、投标机会公告解析、AI 评标评分项六类 JSON 场景，覆盖真实 `aiClient.requestJson()` 参数、共享 JSON 修复 prompt 回放、Main 侧失败样本持久化、已保存样本回放和清空，以及开发者 AI 日志的安全抽取、脱敏、回放和保存为失败样本。
- 导出链路预演读取技术方案正文并生成导出检查报告；页面测试覆盖调用 `export.previewWordExport()` 和展示真实 Word dry-run 结果，Main 测试覆盖 `exportService.previewWordExport()` 构建 docx buffer、返回 preflight/warnings/字节数/耗时且不写输出文件，Playwright 冒烟覆盖开发者模式下进入导出链路预演页和浏览器环境降级提示。
- 文件解析沙盘通过 file bridge 执行样本解析并展示 Markdown 预览；组件测试覆盖首次解析后复用同一 `file.file_path` 调用第二个解析器，对比字符数、行数、图片数、耗时差异和第二份 Markdown 预览。
- 文件解析样本矩阵与回归：Main 侧能力报告覆盖 pdf、docx、doc、wps、ofd、jpeg、png，明确扫描件/OFD 处理策略、中文路径 smoke 要求和 WPS 回退规则；解析沙盘 UI 展示该矩阵；`fileServiceParserRegression.test.ts` 在中文路径动态生成 TXT、Markdown、DOCX、PDF、PNG、OFD 样本，TXT/Markdown/DOCX/PDF 走真实本地解析，PNG/OFD 验证不走本地解析并记录 MinerU/OFD 缺口。
- 导出格式页眉、封面、目录页、一级章节分节、水印、表格样式和图片策略配置 UI、页眉写入规则预览和 Word XML 写入：覆盖常规页眉、首页不同、奇偶页不同、`titlePage`、偶数页页眉设置、封面标题/副标题/投标单位/日期和分页符写入 `word/document.xml`、目录标题/TOC 字段/dirty 刷新标记/目录后分页、一级章节分节写入多个 `sectPr` 和 `nextPage`、文字水印写入 `word/header*.xml` 的文本/字号/颜色/透明度、Markdown 表格写入 `word/document.xml` 的表头底色/边框颜色/单元格留白，以及图片最大宽度写入 drawing 尺寸。
- 设置页主题/侧边栏布局配置保存、配置 Store 恢复、浏览器端外观切换和 Electron `nativeTheme.themeSource` 归一化；深色主题下资源下载、标书查重、废标项检查和开发者实验室核心面板不会回退到硬编码白底。
- 项目级工作区：Main 侧 `projectWorkspaceStore` 单测覆盖默认项目兼容旧 `userData/workspace`、新项目 workspace 目录、设为当前项目返回 `restart_required`、归档/恢复/删除、复制项目、导出项目包、导入项目包，以及 scoped app 下 `getWorkspaceDir()` / `getWorkspaceDatabasePath()` 指向 active project workspace；SettingsPage 组件测试覆盖项目列表加载、新建并切换、复制项目、导出项目包、导入项目包、切换确认和后台任务运行时阻止切换；Playwright E2E 覆盖设置页项目工作区列表、运行中任务阻止切换、复制/导出/导入项目包入口、确认切换、`projectWorkspace.setActive()` 调用和重启后加载新工作区提示，并覆盖通用 Radix Dialog 确认按钮不被 overlay 拦截。
- 本地文本模型体验：Ollama `/api/tags`、LM Studio/vLLM/llama.cpp/Jan `/models` 模型列表，以及 LM Studio/Jan 免 API Key 保存。
- 技术方案正文配图策略报告：普通用户可见 AI 生图 / Mermaid / 图片知识库计划、成功、失败、跳过统计。
- 技术方案全文一致性审计报告：普通用户可见审计摘要、已修复冲突、需人工核对冲突和失败审计分组；可跳转章节、编辑章节、预填单章节重新审计要求、标记人工处理项，并对失败分组启动 audit-only 复审。
- 已有方案扩写原方案覆盖审计报告：扩写模式下可见来源段覆盖率、已补回、未覆盖、冲突、未分配段落、失败章节和核心承诺保留审计；未分配段落可绑定章节或忽略，核心承诺摘要覆盖服务承诺、质保承诺和周期承诺分类。
- 技术方案正文图片体验：Markdown 图片点击打开全屏预览，`图：...` 图例使用统一居中样式。
- Word 导出图片排版：Markdown 图片段落和 `图：...` 图例段落在导出的 docx XML 中保持居中。
- Word 导出预检与失败资源兜底：Main 侧返回 `preflight` 结构化摘要，缺失本地图片不阻断 docx 生成，并在 warnings 与文档占位中提示用户核对。
- Word 导出 Mermaid 失败兜底：Main 侧 mock Mermaid 转图网络失败后仍能生成 docx，文档中包含替代图片 drawing、失败说明文字和 warnings。
- 发布与自动更新 smoke：覆盖发布配置、GitHub/Cloudflare 更新源一致性、Cloudflare `latest.json` 平台包选择、macOS x64/arm64 update manifest 合并和发布 workflow 关键步骤。
- 技术方案旧 `expand` 步骤到正文编辑页的兼容映射。
- Renderer 首屏和核心入口的浏览器冒烟。
- 标书查重二级菜单入口的浏览器冒烟。
- 商务标页面的独立导入、AI 结构化提取后台任务、负责人/确认人保存、独立附件管理、确认条款埋点和交付包导出：组件测试覆盖 bridge 调用、任务状态展示、附件导入/编辑/删除和 `trackBusinessBidAction()` 固定动作值，Main Store 测试覆盖 AI JSON 归一化落库、负责人/确认人持久化、附件复制/更新/删除、Markdown 交付包表格列、Word docx 包内容和 Excel xlsx 工作表内容，taskService 测试覆盖商务标 managed task 状态落盘和完成快照；浏览器冒烟覆盖二级菜单入口、独立导入入口、AI 结构化提取入口和 Markdown/Word/Excel 交付包导出入口。
- AI 评标二级菜单入口、投标文件导入入口和自评报告导出入口的浏览器冒烟。
- 图片知识库二级菜单入口、批量管理入口的浏览器冒烟；组件测试覆盖单图文件夹编辑、批量分类、批量设置文件夹、批量追加标签、批量删除、标签重命名和标签删除 bridge 调用，Main Store 测试覆盖批量分类、批量设置文件夹、标签去重追加、批量删除、全局标签重命名、全局标签删除，以及正文配图上下文自动匹配素材并生成 Markdown 引用。
- 投标机会主菜单入口、公告文件/URL 导入入口、投标建议报告导出入口和提醒日历导出入口的浏览器冒烟。
- 导出格式页眉控件入口的浏览器冒烟。
- 设置页深色主题、紧凑侧边栏布局，以及历史工作台深色面板覆盖的浏览器冒烟。
- 设置页 LM Studio/Jan 本地模型入口的浏览器冒烟。
- 开发者模式下 Prompt 调试台入口的浏览器冒烟。
- 开发者模式下 Json 请求测试实验室入口、六类 JSON schema 场景、已保存失败样本和开发者日志回放区域的浏览器冒烟。
- 文档状态同步：README / README.en 只描述当前已落地能力和明确仍在演进的边界；核心功能入口、交付物、常见问题和验证命令集中维护在 `client/doc/用户手册与故障排查.md`。

## 后续扩展规则

- 新增 IPC：补 Main/preload/types 的单元或 smoke 检查。
- 新增页面：至少补一个组件测试和一个 Playwright 路径。
- 新增后台任务：补 Store 状态转换、active task 恢复和失败恢复测试。
- 新增导出：补语法检查、导出结果结构检查和资源缺失 warnings 测试。
