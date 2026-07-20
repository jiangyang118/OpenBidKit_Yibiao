# 历史任务与过程归档 TODO

本文档用于给 Codex 分阶段执行。执行时优先读取：

1. `AGENTS.md`
2. `client/开发说明.md`
3. `client/doc/历史任务过程归档计划.md`
4. 本 TODO 文档

执行规则：

- 每次只做一个 Task，除非用户明确要求连续推进。
- 每个 Task 完成后更新本文件勾选状态。
- 每个 Task 都必须跑对应验证命令。
- 改 Renderer 或 TypeScript 后运行 `cd client && npm run build`。
- 改 Electron Main、preload 或 IPC 后，先 `node --check` 对应 `.cjs`，再运行 `cd client && npm run build`。
- 不删除旧 workspace 文件，不改变既有重置语义，除非当前 Task 明确要求。
- 新增存储能力先作为旁路归档，不要一开始替换掉全部现有技术方案状态。

## 目标模式

- [ ] 每次上传文件都创建独立任务 run。
- [ ] 每个 run 有自己的输入文件、解析结果、步骤快照、过程产物和导出结果。
- [ ] 上传新文件不会删除或覆盖旧 run。
- [ ] 用户能在历史任务列表看到每次上传和对应结果。
- [ ] 重置只影响当前 run，不影响历史 run。
- [ ] 后续可平滑迁移到网页版账号、项目和团队协作。

## Phase 0：代码摸底

### Task 0.1：梳理当前技术方案存储链路

**目标：** 找清楚技术方案上传、解析、步骤状态和重置现在分别写到哪里。

**验收：**

- [ ] 找到技术方案上传入口。
- [ ] 找到 `technical_plan.json` 或等价状态读写服务。
- [ ] 找到当前 reset/clear 相关逻辑。
- [ ] 记录当前文件落点和数据库表。

**验证：**

- [ ] 输出一段简短排查结论，写入本 Task 下方或新建实现记录。
- [ ] 不修改业务代码。

**依赖：** 无。

**可能涉及文件：**

- `client/electron/services/*.cjs`
- `client/electron/ipc/*.cjs`
- `client/src/features/technical-plan/**/*`
- `client/src/shared/types/ipc.ts`

**规模：** S。

### Task 0.2：确认 SQLite schema 与迁移入口

**目标：** 找到 SQLite 初始化、schema 版本、迁移脚本或建表位置。

**验收：**

- [ ] 确认 workspace SQLite 文件由哪个服务初始化。
- [ ] 确认新增表应该写入哪个 schema 文件或迁移函数。
- [ ] 确认现有查询封装方式。

**验证：**

- [ ] 不修改业务代码。
- [ ] 输出新增表落点建议。

**依赖：** 无。

**可能涉及文件：**

- `client/electron/services/sqliteDatabase.cjs`
- `client/electron/services/*Store*.cjs`
- `client/electron/sql/**/*`

**规模：** S。

## Checkpoint 0：摸底完成

- [ ] 技术方案状态链路已确认。
- [ ] SQLite 建表和迁移入口已确认。
- [ ] 下一步可以开始新增旁路归档表。

## Phase 1：通用归档底座

### Task 1.1：新增 workflow 归档表

**目标：** 增加通用归档表，为 run、file、step、artifact、export、event 建立数据库结构。

**验收：**

- [ ] 新增 `workflow_runs` 表。
- [ ] 新增 `workflow_files` 表。
- [ ] 新增 `workflow_step_snapshots` 表。
- [ ] 新增 `workflow_artifacts` 表。
- [ ] 新增 `workflow_exports` 表。
- [ ] 新增 `workflow_run_events` 表。
- [ ] 表结构使用 `created_at`、`updated_at` 等统一时间字段。
- [ ] 预留 `owner_id`、`project_id`、`module`，为网页版账号和项目迁移做准备。

**验证：**

- [ ] 对改动的 `.cjs` 文件运行 `node --check`。
- [ ] `cd client && npm run build` 通过。
- [ ] 本地启动后 SQLite 能自动创建新表。

**依赖：** Task 0.2。

**可能涉及文件：**

- `client/electron/services/sqliteDatabase.cjs`
- `client/electron/sql/**/*`

**规模：** M。

### Task 1.2：新增 workflowArchiveService

**目标：** 封装任务归档的 Main 侧服务，避免业务模块直接拼 SQL 和路径。

**验收：**

- [ ] 支持 `createRun`。
- [ ] 支持 `listRuns`。
- [ ] 支持 `getRunDetail`。
- [ ] 支持 `archiveRun`。
- [ ] 支持 `deleteRun`。
- [ ] 支持 `recordFile`。
- [ ] 支持 `recordStepSnapshot`。
- [ ] 支持 `recordArtifact`。
- [ ] 支持 `recordExport`。
- [ ] 支持 `recordEvent`。
- [ ] 所有文件路径保存为相对 workspace 的路径。

**验证：**

- [ ] `node --check electron/services/workflowArchiveService.cjs` 通过。
- [ ] `cd client && npm run build` 通过。
- [ ] 用临时脚本或现有 IPC 间接验证 create/list/get 能读写数据库。

**依赖：** Task 1.1。

**可能涉及文件：**

- `client/electron/services/workflowArchiveService.cjs`
- `client/electron/services/sqliteDatabase.cjs`

**规模：** M。

### Task 1.3：新增 run 文件目录工具

**目标：** 按 `run_id` 创建稳定目录结构，统一保存输入、解析、步骤、产物、导出和日志文件。

**验收：**

- [ ] 新增创建 `workspace/runs/<run_id>/` 的工具函数。
- [ ] 自动创建 `input/`、`parsed/`、`steps/`、`artifacts/`、`exports/`、`logs/`。
- [ ] 返回相对路径和绝对路径，业务层写文件用绝对路径，数据库保存相对路径。
- [ ] Windows 中文路径场景使用 UTF-8 和安全路径拼接。

**验证：**

- [ ] `node --check` 对新增或修改的 `.cjs` 文件通过。
- [ ] `cd client && npm run build` 通过。

**依赖：** Task 1.2。

**可能涉及文件：**

- `client/electron/services/workflowArchiveService.cjs`
- `client/electron/services/workspacePathService.cjs`
- `client/electron/services/*Store*.cjs`

**规模：** S。

### Task 1.4：新增归档 IPC 与类型

**目标：** 让 Renderer 可以查询历史任务列表和详情，但暂时不改现有业务流程。

**验收：**

- [ ] preload 暴露 `window.yibiao.workflowArchive` 或等价命名空间。
- [ ] Renderer 类型同步更新。
- [ ] IPC 支持 list/get/archive/delete。
- [ ] 删除任务需要 Main 侧二次确认参数，例如 `confirmDelete: true`。
- [ ] Renderer 不直接访问 Node、fs、path、ipcRenderer。

**验证：**

- [ ] `node --check electron/preload.cjs` 通过。
- [ ] `node --check` 对新增 IPC `.cjs` 文件通过。
- [ ] `cd client && npm run build` 通过。

**依赖：** Task 1.2。

**可能涉及文件：**

- `client/electron/preload.cjs`
- `client/electron/ipc/*.cjs`
- `client/src/shared/types/ipc.ts`

**规模：** M。

## Checkpoint 1：归档底座可用

- [ ] 新表能创建。
- [ ] Main 服务能创建和查询 run。
- [ ] run 目录能创建。
- [ ] Renderer 可以通过 IPC 查询历史任务。
- [ ] `cd client && npm run build` 通过。

## Phase 2：历史任务列表

### Task 2.1：新增历史任务列表 UI

**目标：** 在前端提供可见的历史任务列表，让用户能看到每次上传和对应结果。

**验收：**

- [ ] 新增历史任务列表组件。
- [ ] 展示创建时间、标题、原始文件名、模块、状态、当前步骤、最近更新时间。
- [ ] 支持按模块筛选，默认先显示技术方案相关任务。
- [ ] 空状态使用中文文案。
- [ ] 页面内部滚动，不依赖 body 全局滚动。

**验证：**

- [ ] `cd client && npm run build` 通过。
- [ ] 手动打开页面，空列表和有数据列表都能正常显示。

**依赖：** Task 1.4。

**可能涉及文件：**

- `client/src/features/workflow-archive/**/*`
- `client/src/features/technical-plan/**/*`
- `client/src/app/AppRouter.tsx`
- `client/src/app/menuConfig.ts`
- `client/src/shared/types/navigation.ts`

**规模：** M。

### Task 2.2：新增任务详情抽屉或页面

**目标：** 用户点击历史任务后，能看到该任务的输入文件、步骤快照、产物和导出结果。

**验收：**

- [ ] 展示任务基础信息。
- [ ] 展示输入文件列表。
- [ ] 展示步骤时间线。
- [ ] 展示过程产物列表。
- [ ] 展示导出文件列表。
- [ ] 支持归档任务。
- [ ] 删除任务必须二次确认。

**验证：**

- [ ] `cd client && npm run build` 通过。
- [ ] 手动验证打开任务详情、归档、删除的交互状态。

**依赖：** Task 2.1。

**可能涉及文件：**

- `client/src/features/workflow-archive/**/*`
- `client/src/shared/ui/ToastProvider*`

**规模：** M。

## Checkpoint 2：用户能看到历史

- [ ] 历史任务列表可见。
- [ ] 任务详情可见。
- [ ] 归档和删除行为可用。
- [ ] 旧业务流程尚未被破坏。
- [ ] `cd client && npm run build` 通过。

## Phase 3：技术方案上传接入 run

### Task 3.1：上传招标文件时创建 run

**目标：** 技术方案每次上传文件都创建独立 run，不再只覆盖当前状态。

**验收：**

- [ ] 上传文件时调用 `createRun`。
- [ ] run 标题默认使用文件名 + 时间。
- [ ] 原始文件登记到 `workflow_files`。
- [ ] 当前技术方案状态中记录 active `run_id`。
- [ ] 上传新文件不会删除旧 run。

**验证：**

- [ ] `node --check` 对涉及 Electron 文件通过。
- [ ] `cd client && npm run build` 通过。
- [ ] 手动上传 A、B 两个文件，历史列表出现两条 run。

**依赖：** Task 1.2、Task 1.3、Task 2.1。

**可能涉及文件：**

- `client/electron/services/technicalPlan*.cjs`
- `client/electron/services/workflowArchiveService.cjs`
- `client/src/features/technical-plan/**/*`

**规模：** M。

### Task 3.2：解析 Markdown 写入 run 目录

**目标：** 招标文件解析结果保存到当前 run 的 `parsed/` 目录，并登记为 artifact 或 file。

**验收：**

- [ ] 解析出的 Markdown 写入 `workspace/runs/<run_id>/parsed/tender.md`。
- [ ] 解析元信息写入 `tender-meta.json`。
- [ ] 数据库登记 `parsed_markdown` 文件。
- [ ] 兼容旧页面继续读取当前技术方案展示内容。

**验证：**

- [ ] `node --check` 对涉及 Electron 文件通过。
- [ ] `cd client && npm run build` 通过。
- [ ] 手动上传文件后，run 目录下存在 parsed 文件。

**依赖：** Task 3.1。

**可能涉及文件：**

- `client/electron/services/technicalPlan*.cjs`
- `client/electron/services/workflowArchiveService.cjs`

**规模：** M。

### Task 3.3：打开历史任务恢复当前查看状态

**目标：** 用户从历史列表打开旧 run 后，能看到该 run 的解析结果，不被最新上传覆盖。

**验收：**

- [ ] 历史详情提供“打开任务”操作。
- [ ] 打开后把 active `run_id` 切到对应任务。
- [ ] 技术方案页面展示该 run 的解析结果。
- [ ] 打开旧 run 不修改旧 run 的原始文件。

**验证：**

- [ ] `cd client && npm run build` 通过。
- [ ] 手动上传 A、B，打开 A 后页面显示 A 的解析内容。

**依赖：** Task 3.2、Task 2.2。

**可能涉及文件：**

- `client/src/features/workflow-archive/**/*`
- `client/src/features/technical-plan/**/*`
- `client/electron/services/technicalPlan*.cjs`

**规模：** M。

## Checkpoint 3：上传不会丢历史

- [ ] 上传 A 后能看到 run A。
- [ ] 上传 B 后能看到 run B。
- [ ] 打开 run A 可以看到 A 的解析结果。
- [ ] 上传 B 不删除 A 的输入和解析文件。
- [ ] `cd client && npm run build` 通过。

## Phase 4：步骤快照与过程产物

### Task 4.1：Step01 导入与解析保存快照

**目标：** 记录导入/解析步骤的输入、输出、状态和错误。

**验收：**

- [ ] Step01 开始时写入 running snapshot。
- [ ] Step01 成功后写入 completed snapshot。
- [ ] Step01 失败后写入 failed snapshot 和 `error_json`。
- [ ] snapshot 关联 parsed artifact。

**验证：**

- [ ] `node --check` 对涉及 Electron 文件通过。
- [ ] `cd client && npm run build` 通过。
- [ ] 手动上传成功和失败场景均能在详情里看到状态。

**依赖：** Task 3.2。

**可能涉及文件：**

- `client/electron/services/technicalPlan*.cjs`
- `client/electron/services/workflowArchiveService.cjs`

**规模：** S。

### Task 4.2：Step02 要求提取保存快照与 AI 响应

**目标：** 保存要求提取阶段的输入、结构化输出和 AI 原始响应。

**验收：**

- [ ] Step02 开始、完成、失败均有 snapshot。
- [ ] AI 原始响应保存为 artifact。
- [ ] 结构化要求 JSON 保存为 artifact。
- [ ] 任务详情能看到 Step02 产物。

**验证：**

- [ ] `node --check` 对涉及 Electron 文件通过。
- [ ] `cd client && npm run build` 通过。
- [ ] 手动生成要求提取后，详情页能看到 Step02 产物。

**依赖：** Task 4.1。

**可能涉及文件：**

- `client/electron/services/technicalPlan*.cjs`
- `client/src/features/workflow-archive/**/*`

**规模：** M。

### Task 4.3：Step03 目录生成保存快照

**目标：** 保存目录生成阶段的目录 JSON、Markdown 和错误信息。

**验收：**

- [ ] Step03 开始、完成、失败均有 snapshot。
- [ ] 目录 JSON 保存为 artifact。
- [ ] 目录 Markdown 或展示内容保存为 artifact。
- [ ] 重新生成目录时保留旧 snapshot。

**验证：**

- [ ] `node --check` 对涉及 Electron 文件通过。
- [ ] `cd client && npm run build` 通过。
- [ ] 手动重新生成目录后，历史详情出现多条 Step03 记录或版本记录。

**依赖：** Task 4.2。

**可能涉及文件：**

- `client/electron/services/technicalPlan*.cjs`
- `client/src/features/workflow-archive/**/*`

**规模：** M。

### Task 4.4：Step04 正文生成保存章节产物

**目标：** 保存正文生成过程中的章节内容、每章状态和整体结果。

**验收：**

- [ ] Step04 整体任务有 snapshot。
- [ ] 每个章节正文保存为 artifact 或 artifact metadata。
- [ ] 失败章节记录错误。
- [ ] 任务详情能看到章节级产物。

**验证：**

- [ ] `node --check` 对涉及 Electron 文件通过。
- [ ] `cd client && npm run build` 通过。
- [ ] 手动生成正文后，能在任务详情查看章节产物。

**依赖：** Task 4.3。

**可能涉及文件：**

- `client/electron/services/technicalPlan*.cjs`
- `client/src/features/workflow-archive/**/*`

**规模：** M。

## Checkpoint 4：过程可追溯

- [ ] Step01 到 Step04 都能产生快照。
- [ ] 成功和失败状态都可见。
- [ ] 主要 AI 输出和结构化结果都能找到。
- [ ] 重新生成不会抹掉旧快照。
- [ ] `cd client && npm run build` 通过。

## Phase 5：导出归档与重置语义

### Task 5.1：Word 和报告导出写入 exports

**目标：** 最终导出的 Word、Markdown、Excel、Zip 等结果能回到对应 run 下查看。

**验收：**

- [ ] Word 导出登记到 `workflow_exports`。
- [ ] Markdown/Excel 报告登记到 `workflow_exports` 或 `workflow_artifacts`。
- [ ] 任务详情显示导出文件。
- [ ] 同一 run 多次导出都保留记录。

**验证：**

- [ ] `node --check` 对涉及 Electron 文件通过。
- [ ] `cd client && npm run build` 通过。
- [ ] 手动导出两次 Word，详情里能看到两条导出记录。

**依赖：** Task 4.4。

**可能涉及文件：**

- `client/electron/services/technicalPlan*.cjs`
- `client/electron/services/export*.cjs`
- `client/src/features/workflow-archive/**/*`

**规模：** M。

### Task 5.2：调整重置文案和行为边界

**目标：** 明确“重置当前任务”和“新建任务”的区别，避免用户误以为历史被删除。

**验收：**

- [ ] 技术方案页面提供“新建任务”或等价入口。
- [ ] 重置文案说明只影响当前任务。
- [ ] 重置当前任务不删除其他 run。
- [ ] 删除历史任务必须在历史详情里显式执行。

**验证：**

- [ ] `cd client && npm run build` 通过。
- [ ] 手动上传 A、B，重置 B 后 A 仍在历史列表。

**依赖：** Task 3.3、Task 5.1。

**可能涉及文件：**

- `client/src/features/technical-plan/**/*`
- `client/src/features/workflow-archive/**/*`
- `client/electron/services/technicalPlan*.cjs`

**规模：** M。

### Task 5.3：支持导出任务包

**目标：** 用户可以把一个 run 的输入、过程文件和结果打包备份。

**验收：**

- [ ] 任务详情提供“导出任务包”操作。
- [ ] Zip 包包含 input、parsed、steps、artifacts、exports。
- [ ] Zip 包包含 manifest JSON，记录数据库中的 run/file/artifact/export 信息。
- [ ] 导出失败时显示 Toast。

**验证：**

- [ ] `node --check` 对涉及 Electron 文件通过。
- [ ] `cd client && npm run build` 通过。
- [ ] 手动导出任务包并检查 Zip 内容。

**依赖：** Task 5.1。

**可能涉及文件：**

- `client/electron/services/workflowArchiveService.cjs`
- `client/electron/ipc/*.cjs`
- `client/src/features/workflow-archive/**/*`

**规模：** M。

## Checkpoint 5：最小闭环完成

- [ ] 新上传不会覆盖旧上传。
- [ ] 历史列表能看到每次上传。
- [ ] 任务详情能看到输入、步骤、产物和导出。
- [ ] 重置不会误删其他任务。
- [ ] 任务包可以导出。
- [ ] `cd client && npm run build` 通过。

## Phase 6：迁移与扩展

### Task 6.1：导入现有 workspace 为 legacy run

**目标：** 把已有技术方案缓存登记为一条 legacy 历史任务，避免用户升级后看不到旧数据。

**验收：**

- [ ] 检测已有 `technical_plan.json` 或等价缓存。
- [ ] 如存在旧数据，创建 `legacy` run。
- [ ] 旧文件登记为 files/artifacts。
- [ ] 不移动或删除旧文件。
- [ ] 重复执行迁移不会重复创建多条 legacy run。

**验证：**

- [ ] `node --check` 对涉及 Electron 文件通过。
- [ ] `cd client && npm run build` 通过。
- [ ] 在有旧数据的 workspace 中启动后，只创建一条 legacy run。

**依赖：** Task 5.2。

**可能涉及文件：**

- `client/electron/services/workflowArchiveService.cjs`
- `client/electron/services/technicalPlan*.cjs`
- `client/electron/services/sqliteDatabase.cjs`

**规模：** M。

### Task 6.2：完整标书流程接入 workflow_runs

**目标：** 让完整标书项目配置、附件、构建日志和 Word 导出也进入历史任务体系。

**验收：**

- [ ] 新建或导入项目配置时创建 bid_document run。
- [ ] 项目配置 JSON 登记为 artifact。
- [ ] 附件映射登记为 files 或 artifacts。
- [ ] 构建日志、缺口报告、正式 Word 进入 artifacts/exports。
- [ ] 历史列表可按 `bid_document` 筛选。

**验证：**

- [ ] `node --check` 对涉及 Electron 文件通过。
- [ ] `cd client && npm run build` 通过。
- [ ] 手动生成完整标书后，历史列表出现对应 run。

**依赖：** Task 5.1。

**可能涉及文件：**

- `client/electron/services/bidDocument*.cjs`
- `client/src/features/bid-document/**/*`
- `client/src/features/workflow-archive/**/*`

**规模：** M。

### Task 6.3：为网页版账号模型补齐字段和文档

**目标：** 明确本地版到网页版的映射，减少后续重构。

**验收：**

- [ ] 文档说明 `owner_id`、`tenant_id`、`project_id`、`run_id` 的关系。
- [ ] 数据库表预留字段与文档一致。
- [ ] 写明对象存储迁移规则：本地相对路径 -> 云端 object key。
- [ ] 写明权限模型：创建者、协作者、只读查看者。

**验证：**

- [ ] 文档更新完成。
- [ ] 不需要运行 build，除非同时改代码。

**依赖：** Task 6.2。

**可能涉及文件：**

- `client/doc/历史任务过程归档计划.md`
- `client/doc/历史任务过程归档TODO.md`

**规模：** S。

## 最终验收

- [ ] 用户上传新文件时，旧文件和旧结果不会被删除。
- [ ] 历史任务列表能看到每次上传记录。
- [ ] 每条任务能看到输入文件、当前状态、步骤产物和最近结果。
- [ ] 打开旧任务后能查看旧解析结果。
- [ ] Step01 到 Step04 的主要过程文件都有记录。
- [ ] 重置当前任务不会删除其他任务。
- [ ] 导出的 Word 或报告能回到对应任务下查看。
- [ ] 可以导出任务包。
- [ ] 现有旧数据能以 legacy run 方式进入历史列表。
- [ ] `cd client && npm run build` 通过。

## 暂不做

- [ ] 暂不直接接入真实网页登录账号。
- [ ] 暂不把 SQLite 替换为 PostgreSQL/MySQL。
- [ ] 暂不上传文件到对象存储。
- [ ] 暂不做团队权限协作。
- [ ] 暂不自动清理历史任务。

这些内容放到网页版改造阶段处理。
