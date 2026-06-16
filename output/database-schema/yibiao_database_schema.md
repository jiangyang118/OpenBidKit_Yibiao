# 易标数据库结构导出

- 生成时间：2026-06-16 11:17:34
- 实际数据库：`/Users/jack/Library/Application Support/yibiao-client/workspace/yibiao.sqlite`
- 实际库大小：50.4 MB
- 实际库 `PRAGMA user_version`：32
- 仓库目标 schema：`/Users/jack/code/099-github/jiangyang118/OpenBidKit_Yibiao/sql/workspace_schema.sql`
- 目标 schema `PRAGMA user_version`：35
- 导出范围：表、字段、索引、外键、表行数；未导出业务记录内容。

## 文件

- Excel 完整字段表：`/Users/jack/code/099-github/jiangyang118/OpenBidKit_Yibiao/output/database-schema/yibiao_database_schema.xlsx`
- Markdown 摘要：`/Users/jack/code/099-github/jiangyang118/OpenBidKit_Yibiao/output/database-schema/yibiao_database_schema.md`

## 实际库概览

- 表：61 个
- 字段：579 个
- 索引字段项：165 条
- 外键：29 条

| 分组 | 表数 | 表名 |
| --- | ---: | --- |
| `ai_evaluation` | 8 | `ai_evaluation_audit_opinions`, `ai_evaluation_bid_documents`, `ai_evaluation_bid_scores`, `ai_evaluation_expert_scores`, `ai_evaluation_items`, `ai_evaluation_meta`, `ai_evaluation_reports`, `ai_evaluation_tasks` |
| `bid_opportunity` | 3 | `bid_opportunity_attachments`, `bid_opportunity_follow_ups`, `bid_opportunity_opportunities` |
| `business_bid` | 4 | `business_bid_attachments`, `business_bid_clauses`, `business_bid_meta`, `business_bid_tasks` |
| `duplicate_check` | 15 | `duplicate_check_analysis_sections`, `duplicate_check_content_duplicates`, `duplicate_check_content_files`, `duplicate_check_content_ignore_rules`, `duplicate_check_content_occurrences`, `duplicate_check_duplicate_images`, `duplicate_check_files`, `duplicate_check_image_files`, `duplicate_check_image_occurrences`, `duplicate_check_meta`, `duplicate_check_metadata_items`, `duplicate_check_outline_groups`, `duplicate_check_outline_items`, `duplicate_check_outline_pairwise`, `duplicate_check_tasks` |
| `image_knowledge` | 4 | `image_knowledge_asset_tags`, `image_knowledge_assets`, `image_knowledge_references`, `image_knowledge_tags` |
| `knowledge` | 11 | `knowledge_blocks`, `knowledge_candidate_items`, `knowledge_discarded_groups`, `knowledge_document_steps`, `knowledge_documents`, `knowledge_folders`, `knowledge_item_blocks`, `knowledge_items`, `knowledge_match_batches`, `knowledge_migration_meta`, `knowledge_reports` |
| `rejection_check` | 8 | `rejection_check_documents`, `rejection_check_extraction`, `rejection_check_logic_findings`, `rejection_check_meta`, `rejection_check_results`, `rejection_check_risk_findings`, `rejection_check_tasks`, `rejection_check_typo_findings` |
| `technical_plan` | 8 | `technical_plan_bid_items`, `technical_plan_content_plans`, `technical_plan_content_sections`, `technical_plan_global_fact_groups`, `technical_plan_meta`, `technical_plan_outline_nodes`, `technical_plan_reference_docs`, `technical_plan_tasks` |

## 实际库表清单

| 表名 | 字段数 | 行数 |
| --- | ---: | ---: |
| `ai_evaluation_audit_opinions` | 12 | 0 |
| `ai_evaluation_bid_documents` | 9 | 0 |
| `ai_evaluation_bid_scores` | 9 | 0 |
| `ai_evaluation_expert_scores` | 11 | 0 |
| `ai_evaluation_items` | 16 | 0 |
| `ai_evaluation_meta` | 6 | 1 |
| `ai_evaluation_reports` | 8 | 0 |
| `ai_evaluation_tasks` | 9 | 0 |
| `bid_opportunity_attachments` | 10 | 0 |
| `bid_opportunity_follow_ups` | 11 | 0 |
| `bid_opportunity_opportunities` | 15 | 0 |
| `business_bid_attachments` | 11 | 0 |
| `business_bid_clauses` | 15 | 0 |
| `business_bid_meta` | 6 | 1 |
| `business_bid_tasks` | 9 | 0 |
| `duplicate_check_analysis_sections` | 8 | 0 |
| `duplicate_check_content_duplicates` | 7 | 0 |
| `duplicate_check_content_files` | 7 | 0 |
| `duplicate_check_content_ignore_rules` | 6 | 0 |
| `duplicate_check_content_occurrences` | 4 | 0 |
| `duplicate_check_duplicate_images` | 10 | 0 |
| `duplicate_check_files` | 11 | 0 |
| `duplicate_check_image_files` | 6 | 0 |
| `duplicate_check_image_occurrences` | 5 | 0 |
| `duplicate_check_meta` | 6 | 1 |
| `duplicate_check_metadata_items` | 10 | 0 |
| `duplicate_check_outline_groups` | 8 | 0 |
| `duplicate_check_outline_items` | 14 | 0 |
| `duplicate_check_outline_pairwise` | 9 | 0 |
| `duplicate_check_tasks` | 10 | 0 |
| `image_knowledge_asset_tags` | 2 | 0 |
| `image_knowledge_assets` | 20 | 0 |
| `image_knowledge_references` | 5 | 0 |
| `image_knowledge_tags` | 2 | 0 |
| `knowledge_blocks` | 10 | 4818 |
| `knowledge_candidate_items` | 9 | 1429 |
| `knowledge_discarded_groups` | 6 | 0 |
| `knowledge_document_steps` | 8 | 4851 |
| `knowledge_documents` | 24 | 539 |
| `knowledge_folders` | 5 | 5 |
| `knowledge_item_blocks` | 5 | 4399 |
| `knowledge_items` | 11 | 1429 |
| `knowledge_match_batches` | 9 | 0 |
| `knowledge_migration_meta` | 9 | 0 |
| `knowledge_reports` | 14 | 539 |
| `rejection_check_documents` | 11 | 0 |
| `rejection_check_extraction` | 7 | 0 |
| `rejection_check_logic_findings` | 12 | 0 |
| `rejection_check_meta` | 9 | 1 |
| `rejection_check_results` | 7 | 0 |
| `rejection_check_risk_findings` | 15 | 0 |
| `rejection_check_tasks` | 9 | 0 |
| `rejection_check_typo_findings` | 12 | 0 |
| `technical_plan_bid_items` | 7 | 18 |
| `technical_plan_content_plans` | 4 | 0 |
| `technical_plan_content_sections` | 4 | 0 |
| `technical_plan_global_fact_groups` | 6 | 0 |
| `technical_plan_meta` | 35 | 1 |
| `technical_plan_outline_nodes` | 12 | 0 |
| `technical_plan_reference_docs` | 2 | 0 |
| `technical_plan_tasks` | 10 | 1 |

## 实际库与目标 schema 差异

- 目标表缺失于实际库：0
- 实际库额外表：0
- 目标字段缺失于实际库：4
- 实际库额外字段：0
- 字段定义差异：0

### 目标字段缺失于实际库

| 表名 | 字段 | 类型 | 默认值 |
| --- | --- | --- | --- |
| `duplicate_check_duplicate_images` | `crop_json` | `TEXT` | `` |
| `duplicate_check_duplicate_images` | `rotation_degrees` | `INTEGER` | `` |
| `duplicate_check_duplicate_images` | `watermark_hint` | `TEXT` | `` |
| `rejection_check_documents` | `page_screenshots_json` | `TEXT` | `` |

## Analytics D1 结构

仓库里还包含 Cloudflare D1 结构，已放入 Excel 的 `analytics_d1_columns` / `analytics_d1_indexes`。
