const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { getWorkspaceDatabasePath } = require('../utils/paths.cjs');

const schemaVersion = 35;

function createInitialSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS technical_plan_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      workflow_kind TEXT NOT NULL DEFAULT 'technical-plan',
      step TEXT NOT NULL DEFAULT 'document-analysis',
      tender_file_name TEXT,
      tender_markdown_path TEXT,
      tender_markdown_hash TEXT,
      tender_markdown_chars INTEGER NOT NULL DEFAULT 0,
      tender_parser_label TEXT,
      tender_imported_at TEXT,
      original_plan_file_name TEXT,
      original_plan_markdown_path TEXT,
      original_plan_markdown_hash TEXT,
      original_plan_markdown_chars INTEGER NOT NULL DEFAULT 0,
      original_plan_parser_label TEXT,
      original_plan_imported_at TEXT,
      pending_tender_markdown_path TEXT,
      pending_tender_file_name TEXT,
      pending_tender_parser_label TEXT,
      pending_tender_sections_json TEXT,
      pending_tender_total_declared INTEGER,
      pending_tender_created_at TEXT,
      bid_analysis_mode TEXT NOT NULL DEFAULT 'key',
      bid_analysis_selected_task_ids_json TEXT,
      outline_mode TEXT NOT NULL DEFAULT 'aligned',
      outline_project_name TEXT,
      outline_project_overview TEXT,
      content_generation_options_json TEXT,
      content_generation_runtime_json TEXT,
      selected_section_id TEXT,
      selected_section_title TEXT,
      selected_section_head_line TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS technical_plan_tasks (
      type TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      logs_json TEXT,
      stats_json TEXT,
      error TEXT,
      pause_requested INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS technical_plan_bid_items (
      item_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      error TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_technical_plan_bid_items_order
    ON technical_plan_bid_items(sort_order);

    CREATE TABLE IF NOT EXISTS technical_plan_reference_docs (
      document_id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_technical_plan_reference_docs_order
    ON technical_plan_reference_docs(sort_order);

    CREATE TABLE IF NOT EXISTS technical_plan_outline_nodes (
      node_id TEXT PRIMARY KEY,
      parent_node_id TEXT,
      sort_order INTEGER NOT NULL,
      level INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      source_requirement_id TEXT,
      source_requirement_title TEXT,
      knowledge_item_ids_json TEXT,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (parent_node_id) REFERENCES technical_plan_outline_nodes(node_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_technical_plan_outline_parent_order
    ON technical_plan_outline_nodes(parent_node_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_technical_plan_outline_level
    ON technical_plan_outline_nodes(level);

    CREATE TABLE IF NOT EXISTS technical_plan_content_sections (
      node_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      error TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (node_id) REFERENCES technical_plan_outline_nodes(node_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_technical_plan_content_sections_status
    ON technical_plan_content_sections(status);

    CREATE TABLE IF NOT EXISTS technical_plan_content_plans (
      node_id TEXT PRIMARY KEY,
      plan_json TEXT NOT NULL,
      illustration_type TEXT NOT NULL DEFAULT 'none',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (node_id) REFERENCES technical_plan_outline_nodes(node_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS technical_plan_global_fact_groups (
      group_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_technical_plan_global_fact_groups_order
    ON technical_plan_global_fact_groups(sort_order);
  `);
}

function createTechnicalPlanGlobalFactsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS technical_plan_global_fact_groups (
      group_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_technical_plan_global_fact_groups_order
    ON technical_plan_global_fact_groups(sort_order);
  `);
}

function addTechnicalPlanBidSectionV6Compat(db) {
  // v6 兼容：部分旧版本客户端可能已添加 current_bid_section_id 和 bid_sections_extracted，
  // 此处做幂等处理，如果列已存在则 ALTER TABLE 会抛错，用 try/catch 忽略。
  const cols = db.prepare("PRAGMA table_info(technical_plan_meta)").all().map((row) => row.name);
  const addIfMissing = (name, type) => {
    if (!cols.includes(name)) {
      db.exec(`ALTER TABLE technical_plan_meta ADD COLUMN ${name} ${type}`);
    }
  };
  addIfMissing('current_bid_section_id', 'TEXT');
  addIfMissing('bid_sections_extracted', 'INTEGER');
}

function addTechnicalPlanSelectedSection(db) {
  const cols = db.prepare("PRAGMA table_info(technical_plan_meta)").all().map((row) => row.name);
  const addIfMissing = (name, type) => {
    if (!cols.includes(name)) {
      db.exec(`ALTER TABLE technical_plan_meta ADD COLUMN ${name} ${type}`);
    }
  };
  addIfMissing('selected_section_id', 'TEXT');
  addIfMissing('selected_section_title', 'TEXT');
  addIfMissing('selected_section_head_line', 'TEXT');
}

function addTechnicalPlanPendingTenderSelection(db) {
  const cols = db.prepare("PRAGMA table_info(technical_plan_meta)").all().map((row) => row.name);
  const addIfMissing = (name, type) => {
    if (!cols.includes(name)) {
      db.exec(`ALTER TABLE technical_plan_meta ADD COLUMN ${name} ${type}`);
    }
  };
  addIfMissing('pending_tender_markdown_path', 'TEXT');
  addIfMissing('pending_tender_file_name', 'TEXT');
  addIfMissing('pending_tender_parser_label', 'TEXT');
  addIfMissing('pending_tender_sections_json', 'TEXT');
  addIfMissing('pending_tender_total_declared', 'INTEGER');
  addIfMissing('pending_tender_created_at', 'TEXT');
}

function addTechnicalPlanWorkflowAndOriginalPlan(db) {
  const cols = db.prepare("PRAGMA table_info(technical_plan_meta)").all().map((row) => row.name);
  const addIfMissing = (name, type) => {
    if (!cols.includes(name)) {
      db.exec(`ALTER TABLE technical_plan_meta ADD COLUMN ${name} ${type}`);
    }
  };
  addIfMissing('workflow_kind', "TEXT NOT NULL DEFAULT 'technical-plan'");
  addIfMissing('original_plan_file_name', 'TEXT');
  addIfMissing('original_plan_markdown_path', 'TEXT');
  addIfMissing('original_plan_markdown_hash', 'TEXT');
  addIfMissing('original_plan_markdown_chars', 'INTEGER NOT NULL DEFAULT 0');
  addIfMissing('original_plan_parser_label', 'TEXT');
  addIfMissing('original_plan_imported_at', 'TEXT');
}

function addTechnicalPlanBidAnalysisSelection(db) {
  const cols = db.prepare("PRAGMA table_info(technical_plan_meta)").all().map((row) => row.name);
  if (!cols.includes('bid_analysis_selected_task_ids_json')) {
    db.exec('ALTER TABLE technical_plan_meta ADD COLUMN bid_analysis_selected_task_ids_json TEXT');
  }
}

function addKnowledgeDocumentSortOrder(db) {
  const cols = db.prepare("PRAGMA table_info(knowledge_documents)").all().map((row) => row.name);
  if (!cols.includes('sort_order')) {
    db.exec('ALTER TABLE knowledge_documents ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
    const folders = db.prepare('SELECT DISTINCT folder_id FROM knowledge_documents').all();
    const documentsByFolder = db.prepare('SELECT document_id FROM knowledge_documents WHERE folder_id = ? ORDER BY created_at DESC, document_id ASC');
    const updateOrder = db.prepare('UPDATE knowledge_documents SET sort_order = ? WHERE document_id = ?');
    for (const folder of folders) {
      documentsByFolder.all(folder.folder_id).forEach((document, index) => updateOrder.run(index, document.document_id));
    }
  }
  db.exec(`
    DROP INDEX IF EXISTS idx_knowledge_documents_folder_order;
    CREATE INDEX IF NOT EXISTS idx_knowledge_documents_folder_order
    ON knowledge_documents(folder_id, sort_order, created_at DESC);
  `);
}

function createDuplicateCheckSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS duplicate_check_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      step TEXT NOT NULL DEFAULT 'upload',
      active_analysis_tab TEXT NOT NULL DEFAULT 'metadata',
      current_signature TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS duplicate_check_files (
      file_id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      extension TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      modified_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_files_role_order
    ON duplicate_check_files(role, sort_order);

    CREATE TABLE IF NOT EXISTS duplicate_check_tasks (
      type TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      logs_json TEXT,
      stats_json TEXT,
      error TEXT,
      payload_signature TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS duplicate_check_analysis_sections (
      section TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      signature TEXT,
      stats_json TEXT,
      started_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS duplicate_check_content_files (
      file_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      content_path TEXT,
      content_length INTEGER NOT NULL DEFAULT 0,
      parser_label TEXT,
      error TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (file_id) REFERENCES duplicate_check_files(file_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_content_files_status
    ON duplicate_check_content_files(status);

    CREATE TABLE IF NOT EXISTS duplicate_check_metadata_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT NOT NULL,
      key TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      normalized TEXT,
      date_day TEXT,
      comparable INTEGER NOT NULL DEFAULT 0,
      date_comparable INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (file_id) REFERENCES duplicate_check_files(file_id) ON DELETE CASCADE,
      UNIQUE(file_id, key)
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_metadata_file_order
    ON duplicate_check_metadata_items(file_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_metadata_key
    ON duplicate_check_metadata_items(key);

    CREATE TABLE IF NOT EXISTS duplicate_check_outline_items (
      item_id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      parent_item_id TEXT,
      level INTEGER NOT NULL,
      number TEXT,
      title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      path_titles_json TEXT NOT NULL,
      normalized_path TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      from_tender INTEGER NOT NULL DEFAULT 0,
      matched_tender_sentence TEXT,
      FOREIGN KEY (file_id) REFERENCES duplicate_check_files(file_id) ON DELETE CASCADE,
      FOREIGN KEY (parent_item_id) REFERENCES duplicate_check_outline_items(item_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_outline_file_order
    ON duplicate_check_outline_items(file_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_outline_normalized
    ON duplicate_check_outline_items(normalized_title, normalized_path);

    CREATE TABLE IF NOT EXISTS duplicate_check_outline_groups (
      group_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      file_ids_json TEXT NOT NULL,
      item_ids_json TEXT NOT NULL,
      paths_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_outline_groups_order
    ON duplicate_check_outline_groups(sort_order);

    CREATE TABLE IF NOT EXISTS duplicate_check_outline_pairwise (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_a_id TEXT NOT NULL,
      file_b_id TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      title_overlap REAL NOT NULL DEFAULT 0,
      path_overlap REAL NOT NULL DEFAULT 0,
      order_similarity REAL NOT NULL DEFAULT 0,
      shared_count INTEGER NOT NULL DEFAULT 0,
      risk TEXT NOT NULL DEFAULT 'none',
      FOREIGN KEY (file_a_id) REFERENCES duplicate_check_files(file_id) ON DELETE CASCADE,
      FOREIGN KEY (file_b_id) REFERENCES duplicate_check_files(file_id) ON DELETE CASCADE,
      UNIQUE(file_a_id, file_b_id)
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_outline_pairwise_score
    ON duplicate_check_outline_pairwise(score DESC);

    CREATE TABLE IF NOT EXISTS duplicate_check_content_duplicates (
      duplicate_id TEXT PRIMARY KEY,
      sentence TEXT NOT NULL,
      normalized TEXT NOT NULL,
      file_ids_json TEXT NOT NULL,
      first_order INTEGER NOT NULL DEFAULT 0,
      resolution_status TEXT NOT NULL DEFAULT 'pending',
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_content_duplicates_order
    ON duplicate_check_content_duplicates(first_order);

    CREATE TABLE IF NOT EXISTS duplicate_check_content_ignore_rules (
      rule_id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      normalized TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_content_ignore_rules_normalized
    ON duplicate_check_content_ignore_rules(normalized);

    CREATE TABLE IF NOT EXISTS duplicate_check_content_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      duplicate_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (duplicate_id) REFERENCES duplicate_check_content_duplicates(duplicate_id) ON DELETE CASCADE,
      FOREIGN KEY (file_id) REFERENCES duplicate_check_files(file_id) ON DELETE CASCADE,
      UNIQUE(duplicate_id, file_id)
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_content_occ_file
    ON duplicate_check_content_occurrences(file_id);

    CREATE TABLE IF NOT EXISTS duplicate_check_image_files (
      file_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      image_count INTEGER NOT NULL DEFAULT 0,
      unique_image_count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (file_id) REFERENCES duplicate_check_files(file_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS duplicate_check_duplicate_images (
      image_id TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      preview_url TEXT NOT NULL,
      file_ids_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      resolution_status TEXT NOT NULL DEFAULT 'pending',
      resolved_at TEXT,
      match_type TEXT NOT NULL DEFAULT 'exact',
      similarity_score REAL NOT NULL DEFAULT 1,
      similarity_reason TEXT,
      rotation_degrees INTEGER,
      watermark_hint TEXT,
      crop_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_duplicate_images_hash
    ON duplicate_check_duplicate_images(hash);

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_duplicate_images_order
    ON duplicate_check_duplicate_images(sort_order);

    CREATE TABLE IF NOT EXISTS duplicate_check_image_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL DEFAULT 0,
      locations_json TEXT,
      FOREIGN KEY (image_id) REFERENCES duplicate_check_duplicate_images(image_id) ON DELETE CASCADE,
      FOREIGN KEY (file_id) REFERENCES duplicate_check_files(file_id) ON DELETE CASCADE,
      UNIQUE(image_id, file_id)
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_image_occ_file
    ON duplicate_check_image_occurrences(file_id);
  `);
}

function createRejectionCheckSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rejection_check_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      step TEXT NOT NULL DEFAULT 'documents',
      active_document_tab TEXT NOT NULL DEFAULT 'tender',
      active_result_tab TEXT NOT NULL DEFAULT 'analysis',
      active_check_result_tab TEXT NOT NULL DEFAULT 'rejection',
      custom_check_items TEXT NOT NULL DEFAULT '',
      check_options_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rejection_check_documents (
      document_id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      source TEXT NOT NULL,
      file_name TEXT NOT NULL,
      markdown_path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      content_chars INTEGER NOT NULL DEFAULT 0,
      parser_label TEXT,
      page_screenshots_json TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rejection_check_documents_role_order
    ON rejection_check_documents(role, sort_order);

    CREATE TABLE IF NOT EXISTS rejection_check_tasks (
      type TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      logs_json TEXT,
      stats_json TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rejection_check_extraction (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL DEFAULT 'idle',
      content TEXT NOT NULL DEFAULT '',
      source TEXT,
      tender_signature TEXT,
      error TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS rejection_check_results (
      result_type TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      input_signature TEXT,
      active_finding_id TEXT,
      progress_message TEXT,
      error TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS rejection_check_risk_findings (
      finding_id TEXT PRIMARY KEY,
      bid_document_id TEXT,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      requirement TEXT NOT NULL,
      bid_evidence TEXT NOT NULL,
      risk_reason TEXT NOT NULL,
      suggestion TEXT NOT NULL,
      resolution_status TEXT NOT NULL DEFAULT 'pending',
      resolved_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rejection_check_risk_order
    ON rejection_check_risk_findings(sort_order);

    CREATE INDEX IF NOT EXISTS idx_rejection_check_risk_severity
    ON rejection_check_risk_findings(severity);

    CREATE TABLE IF NOT EXISTS rejection_check_typo_findings (
      finding_id TEXT PRIMARY KEY,
      bid_document_id TEXT,
      wrong_text TEXT NOT NULL,
      correct_text TEXT NOT NULL,
      original_excerpt TEXT NOT NULL,
      reason TEXT NOT NULL,
      location_hint TEXT,
      resolution_status TEXT NOT NULL DEFAULT 'pending',
      resolved_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rejection_check_typo_order
    ON rejection_check_typo_findings(sort_order);

    CREATE TABLE IF NOT EXISTS rejection_check_logic_findings (
      finding_id TEXT PRIMARY KEY,
      bid_document_id TEXT,
      title TEXT NOT NULL,
      original_text TEXT NOT NULL,
      location_hint TEXT NOT NULL,
      fallacy_reason TEXT NOT NULL,
      suggestion TEXT NOT NULL,
      resolution_status TEXT NOT NULL DEFAULT 'pending',
      resolved_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rejection_check_logic_order
    ON rejection_check_logic_findings(sort_order);
  `);
}

function createBidOpportunitySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bid_opportunity_opportunities (
      opportunity_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      parsed_fields_json TEXT NOT NULL DEFAULT '{}',
      score INTEGER NOT NULL DEFAULT 0,
      score_breakdown_json TEXT NOT NULL DEFAULT '{}',
      risks_json TEXT NOT NULL DEFAULT '[]',
      knowledge_matches_json TEXT NOT NULL DEFAULT '[]',
      recommendation TEXT NOT NULL DEFAULT '',
      owner TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT '',
      reminder_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bid_opportunity_status_updated
    ON bid_opportunity_opportunities(status, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_bid_opportunity_score
    ON bid_opportunity_opportunities(score DESC);
  `);
  createBidOpportunityFollowUpSchema(db);
}

function createBidOpportunityFollowUpSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bid_opportunity_follow_ups (
      record_id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'other',
      owner TEXT NOT NULL DEFAULT '',
      contact_person TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT '',
      next_follow_up_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (opportunity_id) REFERENCES bid_opportunity_opportunities(opportunity_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_bid_opportunity_follow_ups_opportunity
    ON bid_opportunity_follow_ups(opportunity_id, occurred_at DESC, created_at DESC);

    CREATE TABLE IF NOT EXISTS bid_opportunity_attachments (
      attachment_id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'announcement',
      file_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      original_path TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (opportunity_id) REFERENCES bid_opportunity_opportunities(opportunity_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_bid_opportunity_attachments_opportunity
    ON bid_opportunity_attachments(opportunity_id, kind, updated_at DESC);
  `);
}

function createBusinessBidSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS business_bid_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      source_type TEXT NOT NULL DEFAULT '',
      source_file_name TEXT NOT NULL DEFAULT '',
      source_hash TEXT NOT NULL DEFAULT '',
      generated_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS business_bid_clauses (
      clause_id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      original_text TEXT NOT NULL,
      response_text TEXT NOT NULL DEFAULT '',
      deviation_type TEXT NOT NULL DEFAULT 'pending',
      risk_level TEXT NOT NULL DEFAULT 'medium',
      material_requirement TEXT NOT NULL DEFAULT '',
      owner TEXT NOT NULL DEFAULT '',
      confirmed_by TEXT NOT NULL DEFAULT '',
      confirmed INTEGER NOT NULL DEFAULT 0,
      source_hint TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_business_bid_clauses_category_order
    ON business_bid_clauses(category, sort_order);

    CREATE INDEX IF NOT EXISTS idx_business_bid_clauses_risk
    ON business_bid_clauses(risk_level, confirmed);

    CREATE TABLE IF NOT EXISTS business_bid_attachments (
      attachment_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'other',
      file_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      original_path TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      owner TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_business_bid_attachments_kind_status
    ON business_bid_attachments(kind, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS business_bid_tasks (
      type TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      logs_json TEXT NOT NULL DEFAULT '[]',
      stats_json TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function createImageKnowledgeBaseSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS image_knowledge_assets (
      image_id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      folder TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      scenario TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      original_path TEXT NOT NULL DEFAULT '',
      stored_path TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL,
      thumbnail_data_url TEXT NOT NULL DEFAULT '',
      reference_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_image_knowledge_assets_hash
    ON image_knowledge_assets(content_hash);

    CREATE INDEX IF NOT EXISTS idx_image_knowledge_assets_category
    ON image_knowledge_assets(category, updated_at DESC);

    CREATE TABLE IF NOT EXISTS image_knowledge_tags (
      tag TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS image_knowledge_asset_tags (
      image_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (image_id, tag),
      FOREIGN KEY (image_id) REFERENCES image_knowledge_assets(image_id) ON DELETE CASCADE,
      FOREIGN KEY (tag) REFERENCES image_knowledge_tags(tag) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_image_knowledge_asset_tags_tag
    ON image_knowledge_asset_tags(tag);

    CREATE TABLE IF NOT EXISTS image_knowledge_references (
      reference_id TEXT PRIMARY KEY,
      image_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (image_id) REFERENCES image_knowledge_assets(image_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_image_knowledge_references_image
    ON image_knowledge_references(image_id, target_type);
  `);
}

function createAiEvaluationSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_evaluation_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      source_type TEXT NOT NULL DEFAULT '',
      source_file_name TEXT NOT NULL DEFAULT '',
      source_hash TEXT NOT NULL DEFAULT '',
      generated_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_evaluation_items (
      item_id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      title TEXT NOT NULL,
      requirement_text TEXT NOT NULL,
      max_score REAL NOT NULL DEFAULT 0,
      auto_score REAL NOT NULL DEFAULT 0,
      manual_score REAL,
      final_score REAL NOT NULL DEFAULT 0,
      evidence TEXT NOT NULL DEFAULT '',
      deduction_reason TEXT NOT NULL DEFAULT '',
      risk_level TEXT NOT NULL DEFAULT 'medium',
      confirmed INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_evaluation_items_category_order
    ON ai_evaluation_items(category, sort_order);

    CREATE INDEX IF NOT EXISTS idx_ai_evaluation_items_risk
    ON ai_evaluation_items(risk_level, confirmed);

    CREATE TABLE IF NOT EXISTS ai_evaluation_bid_documents (
      document_id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      markdown_path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      content_chars INTEGER NOT NULL DEFAULT 0,
      parser_label TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_evaluation_bid_documents_order
    ON ai_evaluation_bid_documents(sort_order, imported_at);

    CREATE TABLE IF NOT EXISTS ai_evaluation_bid_scores (
      document_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      auto_score REAL NOT NULL DEFAULT 0,
      final_score REAL NOT NULL DEFAULT 0,
      evidence TEXT NOT NULL DEFAULT '',
      deduction_reason TEXT NOT NULL DEFAULT '',
      risk_level TEXT NOT NULL DEFAULT 'medium',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (document_id, item_id),
      FOREIGN KEY (document_id) REFERENCES ai_evaluation_bid_documents(document_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ai_evaluation_bid_scores_document
    ON ai_evaluation_bid_scores(document_id, risk_level);

    CREATE TABLE IF NOT EXISTS ai_evaluation_audit_opinions (
      opinion_id TEXT PRIMARY KEY,
      opinion_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      title TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT '',
      target_id TEXT NOT NULL DEFAULT '',
      evidence TEXT NOT NULL DEFAULT '',
      recommendation TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_evaluation_audit_opinions_status
    ON ai_evaluation_audit_opinions(status, severity, sort_order);

    CREATE TABLE IF NOT EXISTS ai_evaluation_expert_scores (
      score_id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      expert_name TEXT NOT NULL,
      expert_role TEXT NOT NULL DEFAULT '',
      review_session TEXT NOT NULL DEFAULT '',
      expert_score REAL NOT NULL DEFAULT 0,
      signature_confirmed INTEGER NOT NULL DEFAULT 0,
      signed_at TEXT,
      opinion TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_evaluation_expert_scores_item
    ON ai_evaluation_expert_scores(item_id, expert_name);

    CREATE TABLE IF NOT EXISTS ai_evaluation_reports (
      report_id TEXT PRIMARY KEY,
      report_type TEXT NOT NULL,
      title TEXT NOT NULL,
      markdown TEXT NOT NULL,
      summary_json TEXT NOT NULL DEFAULT '{}',
      generated_at TEXT NOT NULL,
      exported_path TEXT,
      exported_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ai_evaluation_reports_generated
    ON ai_evaluation_reports(report_type, generated_at DESC);

    CREATE TABLE IF NOT EXISTS ai_evaluation_tasks (
      type TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      logs_json TEXT NOT NULL DEFAULT '[]',
      stats_json TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function addColumnIfMissing(db, tableName, columnName, columnType) {
  if (!getExistingTables(db).has(tableName)) return;
  const columns = getExistingColumns(db, tableName);
  if (columns.has(columnName)) return;
  db.exec(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${columnType}`);
}

function addDuplicateCheckResolutionColumns(db) {
  addColumnIfMissing(db, 'duplicate_check_content_duplicates', 'resolution_status', "TEXT NOT NULL DEFAULT 'pending'");
  addColumnIfMissing(db, 'duplicate_check_content_duplicates', 'resolved_at', 'TEXT');
  addColumnIfMissing(db, 'duplicate_check_duplicate_images', 'resolution_status', "TEXT NOT NULL DEFAULT 'pending'");
  addColumnIfMissing(db, 'duplicate_check_duplicate_images', 'resolved_at', 'TEXT');
}

function addRejectionCheckResolutionColumns(db) {
  for (const tableName of ['rejection_check_risk_findings', 'rejection_check_typo_findings', 'rejection_check_logic_findings']) {
    addColumnIfMissing(db, tableName, 'resolution_status', "TEXT NOT NULL DEFAULT 'pending'");
    addColumnIfMissing(db, tableName, 'resolved_at', 'TEXT');
  }
}

function createDuplicateCheckContentIgnoreRules(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS duplicate_check_content_ignore_rules (
      rule_id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      normalized TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_check_content_ignore_rules_normalized
    ON duplicate_check_content_ignore_rules(normalized);
  `);
}

function addDuplicateCheckIgnoreRuleCategoryColumn(db) {
  createDuplicateCheckContentIgnoreRules(db);
  addColumnIfMissing(db, 'duplicate_check_content_ignore_rules', 'category', "TEXT NOT NULL DEFAULT 'manual'");
}

function addDuplicateCheckV30Columns(db) {
  addColumnIfMissing(db, 'duplicate_check_duplicate_images', 'match_type', "TEXT NOT NULL DEFAULT 'exact'");
  addColumnIfMissing(db, 'duplicate_check_duplicate_images', 'similarity_score', 'REAL NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'duplicate_check_duplicate_images', 'similarity_reason', 'TEXT');
  addDuplicateCheckIgnoreRuleCategoryColumn(db);
}

function addDuplicateCheckImageRotationColumn(db) {
  addColumnIfMissing(db, 'duplicate_check_duplicate_images', 'rotation_degrees', 'INTEGER');
}

function addDuplicateCheckImageWatermarkColumn(db) {
  addColumnIfMissing(db, 'duplicate_check_duplicate_images', 'watermark_hint', 'TEXT');
}

function addDuplicateCheckImageCropColumn(db) {
  addColumnIfMissing(db, 'duplicate_check_duplicate_images', 'crop_json', 'TEXT');
}

function addBidOpportunityFollowUpColumns(db) {
  addColumnIfMissing(db, 'bid_opportunity_opportunities', 'owner', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'bid_opportunity_opportunities', 'next_action', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'bid_opportunity_opportunities', 'reminder_at', "TEXT NOT NULL DEFAULT ''");
}

function addBusinessBidResponsibilityColumns(db) {
  addColumnIfMissing(db, 'business_bid_clauses', 'owner', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'business_bid_clauses', 'confirmed_by', "TEXT NOT NULL DEFAULT ''");
}

function addBidOpportunityKnowledgeMatchColumns(db) {
  addColumnIfMissing(db, 'bid_opportunity_opportunities', 'knowledge_matches_json', "TEXT NOT NULL DEFAULT '[]'");
}

function addAiEvaluationExpertFormalReviewColumns(db) {
  createAiEvaluationExpertScoreSchema(db);
  addColumnIfMissing(db, 'ai_evaluation_expert_scores', 'expert_role', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'ai_evaluation_expert_scores', 'review_session', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'ai_evaluation_expert_scores', 'signature_confirmed', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'ai_evaluation_expert_scores', 'signed_at', 'TEXT');
}

function createBusinessBidAttachmentSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS business_bid_attachments (
      attachment_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'other',
      file_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      original_path TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      owner TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_business_bid_attachments_kind_status
    ON business_bid_attachments(kind, status, updated_at DESC);
  `);
}

function addImageKnowledgeFolderColumn(db) {
  addColumnIfMissing(db, 'image_knowledge_assets', 'folder', "TEXT NOT NULL DEFAULT ''");
}

function createBusinessBidTaskSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS business_bid_tasks (
      type TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      logs_json TEXT NOT NULL DEFAULT '[]',
      stats_json TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function createAiEvaluationTaskSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_evaluation_tasks (
      type TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      logs_json TEXT NOT NULL DEFAULT '[]',
      stats_json TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function createAiEvaluationBidDocumentSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_evaluation_bid_documents (
      document_id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      markdown_path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      content_chars INTEGER NOT NULL DEFAULT 0,
      parser_label TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_evaluation_bid_documents_order
    ON ai_evaluation_bid_documents(sort_order, imported_at);

    CREATE TABLE IF NOT EXISTS ai_evaluation_bid_scores (
      document_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      auto_score REAL NOT NULL DEFAULT 0,
      final_score REAL NOT NULL DEFAULT 0,
      evidence TEXT NOT NULL DEFAULT '',
      deduction_reason TEXT NOT NULL DEFAULT '',
      risk_level TEXT NOT NULL DEFAULT 'medium',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (document_id, item_id),
      FOREIGN KEY (document_id) REFERENCES ai_evaluation_bid_documents(document_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ai_evaluation_bid_scores_document
    ON ai_evaluation_bid_scores(document_id, risk_level);
  `);
}

function createAiEvaluationAuditReportSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_evaluation_audit_opinions (
      opinion_id TEXT PRIMARY KEY,
      opinion_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      title TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT '',
      target_id TEXT NOT NULL DEFAULT '',
      evidence TEXT NOT NULL DEFAULT '',
      recommendation TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_evaluation_audit_opinions_status
    ON ai_evaluation_audit_opinions(status, severity, sort_order);

    CREATE TABLE IF NOT EXISTS ai_evaluation_expert_scores (
      score_id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      expert_name TEXT NOT NULL,
      expert_role TEXT NOT NULL DEFAULT '',
      review_session TEXT NOT NULL DEFAULT '',
      expert_score REAL NOT NULL DEFAULT 0,
      signature_confirmed INTEGER NOT NULL DEFAULT 0,
      signed_at TEXT,
      opinion TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_evaluation_expert_scores_item
    ON ai_evaluation_expert_scores(item_id, expert_name);

    CREATE TABLE IF NOT EXISTS ai_evaluation_reports (
      report_id TEXT PRIMARY KEY,
      report_type TEXT NOT NULL,
      title TEXT NOT NULL,
      markdown TEXT NOT NULL,
      summary_json TEXT NOT NULL DEFAULT '{}',
      generated_at TEXT NOT NULL,
      exported_path TEXT,
      exported_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ai_evaluation_reports_generated
    ON ai_evaluation_reports(report_type, generated_at DESC);
  `);
}

function createAiEvaluationExpertScoreSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_evaluation_expert_scores (
      score_id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      expert_name TEXT NOT NULL,
      expert_role TEXT NOT NULL DEFAULT '',
      review_session TEXT NOT NULL DEFAULT '',
      expert_score REAL NOT NULL DEFAULT 0,
      signature_confirmed INTEGER NOT NULL DEFAULT 0,
      signed_at TEXT,
      opinion TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_evaluation_expert_scores_item
    ON ai_evaluation_expert_scores(item_id, expert_name);
  `);
}

function migrateRejectionCheckMultiBidDocuments(db) {
  const existingTables = getExistingTables(db);
  if (!existingTables.has('rejection_check_documents')) {
    createRejectionCheckSchema(db);
  }

  const documentColumns = getExistingColumns(db, 'rejection_check_documents');
  if (documentColumns.size && !documentColumns.has('document_id')) {
    db.exec('DROP TABLE IF EXISTS rejection_check_documents_legacy_v12');
    db.exec('ALTER TABLE rejection_check_documents RENAME TO rejection_check_documents_legacy_v12');
    createRejectionCheckSchema(db);

    const rows = db.prepare(`
      SELECT * FROM rejection_check_documents_legacy_v12
      ORDER BY CASE role WHEN 'tender' THEN 0 ELSE 1 END, role ASC
    `).all();
    const insert = db.prepare(`
      INSERT INTO rejection_check_documents (
        document_id, role, source, file_name, markdown_path, content_hash, content_chars, parser_label, sort_order, imported_at, updated_at
      ) VALUES (
        @document_id, @role, @source, @file_name, @markdown_path, @content_hash, @content_chars, @parser_label, @sort_order, @imported_at, @updated_at
      )
    `);
    let bidIndex = 0;
    for (const row of rows) {
      const isBid = row.role === 'bid';
      const documentId = isBid ? `bid-${bidIndex + 1}` : 'tender';
      insert.run({
        document_id: documentId,
        role: isBid ? 'bid' : 'tender',
        source: row.source || 'upload',
        file_name: row.file_name || (isBid ? '投标文件' : '招标文件'),
        markdown_path: row.markdown_path || (isBid ? 'rejection-check/bid.md' : 'rejection-check/tender.md'),
        content_hash: row.content_hash || '',
        content_chars: Number(row.content_chars || 0),
        parser_label: row.parser_label || null,
        sort_order: isBid ? bidIndex : 0,
        imported_at: row.imported_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
      });
      if (isBid) bidIndex += 1;
    }
    db.exec('DROP TABLE rejection_check_documents_legacy_v12');
  } else {
    addColumnIfMissing(db, 'rejection_check_documents', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
    createRejectionCheckSchema(db);
  }

  addColumnIfMissing(db, 'rejection_check_documents', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'rejection_check_documents', 'page_screenshots_json', 'TEXT');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_rejection_check_documents_role_order
    ON rejection_check_documents(role, sort_order);
  `);

  addColumnIfMissing(db, 'rejection_check_risk_findings', 'bid_document_id', 'TEXT');
  addColumnIfMissing(db, 'rejection_check_typo_findings', 'bid_document_id', 'TEXT');
  addColumnIfMissing(db, 'rejection_check_logic_findings', 'bid_document_id', 'TEXT');
  const firstBid = db.prepare("SELECT document_id FROM rejection_check_documents WHERE role = 'bid' ORDER BY sort_order ASC LIMIT 1").get();
  if (firstBid?.document_id) {
    db.prepare('UPDATE rejection_check_risk_findings SET bid_document_id = ? WHERE bid_document_id IS NULL OR bid_document_id = ?').run(firstBid.document_id, '');
    db.prepare('UPDATE rejection_check_typo_findings SET bid_document_id = ? WHERE bid_document_id IS NULL OR bid_document_id = ?').run(firstBid.document_id, '');
    db.prepare('UPDATE rejection_check_logic_findings SET bid_document_id = ? WHERE bid_document_id IS NULL OR bid_document_id = ?').run(firstBid.document_id, '');
  }
}

function createWorkspaceV2Schema(db) {
  createDuplicateCheckSchema(db);
  createRejectionCheckSchema(db);
}

function createKnowledgeBaseSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_migration_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      legacy_index_hash TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      migrated_folder_count INTEGER NOT NULL DEFAULT 0,
      migrated_document_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      cleanup_completed_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS knowledge_folders (
      folder_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_folders_order
    ON knowledge_folders(sort_order, created_at);

    CREATE TABLE IF NOT EXISTS knowledge_documents (
      document_id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      document_dir TEXT NOT NULL,
      source_path TEXT NOT NULL,
      markdown_path TEXT NOT NULL,
      markdown_hash TEXT,
      markdown_chars INTEGER NOT NULL DEFAULT 0,
      source_extension TEXT,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      error TEXT,
      item_count INTEGER NOT NULL DEFAULT 0,
      block_count INTEGER NOT NULL DEFAULT 0,
      filtered_block_count INTEGER NOT NULL DEFAULT 0,
      candidate_item_count INTEGER NOT NULL DEFAULT 0,
      discarded_block_count INTEGER NOT NULL DEFAULT 0,
      system_discarded_after_retry_count INTEGER NOT NULL DEFAULT 0,
      last_batch_size INTEGER,
      parser_label TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (folder_id) REFERENCES knowledge_folders(folder_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_documents_folder_order
    ON knowledge_documents(folder_id, sort_order, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_knowledge_documents_status
    ON knowledge_documents(status);

    CREATE TABLE IF NOT EXISTS knowledge_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      type TEXT NOT NULL,
      heading_path_json TEXT,
      content TEXT NOT NULL,
      content_chars INTEGER NOT NULL DEFAULT 0,
      is_filtered INTEGER NOT NULL DEFAULT 0,
      filter_reason TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE,
      UNIQUE(document_id, block_id, is_filtered)
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_blocks_document_order
    ON knowledge_blocks(document_id, is_filtered, sort_order);

    CREATE INDEX IF NOT EXISTS idx_knowledge_blocks_block_id
    ON knowledge_blocks(document_id, block_id);

    CREATE TABLE IF NOT EXISTS knowledge_candidate_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      source TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE,
      UNIQUE(document_id, item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_candidate_items_document_order
    ON knowledge_candidate_items(document_id, sort_order);

    CREATE TABLE IF NOT EXISTS knowledge_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      title TEXT NOT NULL,
      resume TEXT NOT NULL,
      content TEXT NOT NULL,
      source_file TEXT,
      content_chars INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE,
      UNIQUE(document_id, item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_items_document_order
    ON knowledge_items(document_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_knowledge_items_title
    ON knowledge_items(title);

    CREATE TABLE IF NOT EXISTS knowledge_item_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE,
      UNIQUE(document_id, item_id, block_id)
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_item_blocks_item_order
    ON knowledge_item_blocks(document_id, item_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_knowledge_item_blocks_block
    ON knowledge_item_blocks(document_id, block_id);

    CREATE TABLE IF NOT EXISTS knowledge_discarded_groups (
      group_id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      source TEXT NOT NULL,
      reason TEXT NOT NULL,
      block_ids_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_discarded_document_order
    ON knowledge_discarded_groups(document_id, source, sort_order);

    CREATE TABLE IF NOT EXISTS knowledge_reports (
      document_id TEXT PRIMARY KEY,
      total_blocks INTEGER NOT NULL DEFAULT 0,
      filtered_blocks_count INTEGER NOT NULL DEFAULT 0,
      candidate_items_count INTEGER NOT NULL DEFAULT 0,
      final_items_count INTEGER NOT NULL DEFAULT 0,
      matched_blocks_count INTEGER NOT NULL DEFAULT 0,
      discarded_blocks_count INTEGER NOT NULL DEFAULT 0,
      system_discarded_after_retry_count INTEGER NOT NULL DEFAULT 0,
      new_items_from_recovery_count INTEGER NOT NULL DEFAULT 0,
      recovery_attempt_count INTEGER NOT NULL DEFAULT 0,
      batch_size INTEGER NOT NULL DEFAULT 20,
      coverage_rate REAL NOT NULL DEFAULT 0,
      matched_rate REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS knowledge_document_steps (
      document_id TEXT NOT NULL,
      step_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      result_json TEXT,
      error TEXT,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (document_id, step_key),
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_document_steps_status
    ON knowledge_document_steps(document_id, status);

    CREATE TABLE IF NOT EXISTS knowledge_match_batches (
      document_id TEXT NOT NULL,
      batch_index INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      item_ids_json TEXT NOT NULL DEFAULT '[]',
      matches_json TEXT,
      error TEXT,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (document_id, batch_index),
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_match_batches_status
    ON knowledge_match_batches(document_id, status, batch_index);
  `);
}

const schemaHealthTableGroups = [
  {
    version: 1,
    tables: [
      'technical_plan_meta',
      'technical_plan_tasks',
      'technical_plan_bid_items',
      'technical_plan_reference_docs',
      'technical_plan_outline_nodes',
      'technical_plan_content_sections',
      'technical_plan_content_plans',
    ],
    repair: createInitialSchema,
  },
  {
    version: 2,
    tables: [
      'duplicate_check_meta',
      'duplicate_check_files',
      'duplicate_check_tasks',
      'duplicate_check_analysis_sections',
      'duplicate_check_content_files',
      'duplicate_check_metadata_items',
      'duplicate_check_outline_items',
      'duplicate_check_outline_groups',
      'duplicate_check_outline_pairwise',
      'duplicate_check_content_duplicates',
      'duplicate_check_content_occurrences',
      'duplicate_check_image_files',
      'duplicate_check_duplicate_images',
      'duplicate_check_image_occurrences',
    ],
    repair: createDuplicateCheckSchema,
  },
  {
    version: 2,
    tables: [
      'rejection_check_meta',
      'rejection_check_documents',
      'rejection_check_tasks',
      'rejection_check_extraction',
      'rejection_check_results',
      'rejection_check_risk_findings',
      'rejection_check_typo_findings',
      'rejection_check_logic_findings',
    ],
    repair: createRejectionCheckSchema,
  },
  {
    version: 3,
    tables: [
      'knowledge_migration_meta',
      'knowledge_folders',
      'knowledge_documents',
      'knowledge_blocks',
      'knowledge_candidate_items',
      'knowledge_items',
      'knowledge_item_blocks',
      'knowledge_discarded_groups',
      'knowledge_reports',
      'knowledge_document_steps',
      'knowledge_match_batches',
    ],
    repair: createKnowledgeBaseSchema,
  },
  {
    version: 4,
    tables: ['technical_plan_global_fact_groups'],
    repair: createTechnicalPlanGlobalFactsSchema,
  },
  {
    version: 13,
    tables: ['bid_opportunity_opportunities'],
    repair: createBidOpportunitySchema,
  },
  {
    version: 14,
    tables: ['business_bid_meta', 'business_bid_clauses', 'business_bid_attachments'],
    repair: createBusinessBidSchema,
  },
  {
    version: 15,
    tables: ['image_knowledge_assets', 'image_knowledge_tags', 'image_knowledge_asset_tags', 'image_knowledge_references'],
    repair: createImageKnowledgeBaseSchema,
  },
  {
    version: 16,
    tables: ['ai_evaluation_meta', 'ai_evaluation_items'],
    repair: createAiEvaluationSchema,
  },
  {
    version: 17,
    tables: ['duplicate_check_content_duplicates', 'duplicate_check_duplicate_images'],
    repair: addDuplicateCheckResolutionColumns,
  },
  {
    version: 19,
    tables: ['duplicate_check_content_ignore_rules'],
    repair: createDuplicateCheckContentIgnoreRules,
  },
  {
    version: 20,
    tables: ['bid_opportunity_opportunities'],
    repair: addBidOpportunityFollowUpColumns,
  },
  {
    version: 21,
    tables: ['business_bid_clauses'],
    repair: addBusinessBidResponsibilityColumns,
  },
  {
    version: 22,
    tables: ['image_knowledge_assets'],
    repair: addImageKnowledgeFolderColumn,
  },
  {
    version: 23,
    tables: ['business_bid_tasks'],
    repair: createBusinessBidTaskSchema,
  },
  {
    version: 24,
    tables: ['ai_evaluation_tasks'],
    repair: createAiEvaluationTaskSchema,
  },
  {
    version: 25,
    tables: ['ai_evaluation_bid_documents', 'ai_evaluation_bid_scores'],
    repair: createAiEvaluationBidDocumentSchema,
  },
  {
    version: 26,
    tables: ['ai_evaluation_audit_opinions', 'ai_evaluation_reports'],
    repair: createAiEvaluationAuditReportSchema,
  },
  {
    version: 27,
    tables: ['ai_evaluation_expert_scores'],
    repair: createAiEvaluationExpertScoreSchema,
  },
  {
    version: 29,
    tables: ['business_bid_attachments'],
    repair: createBusinessBidAttachmentSchema,
  },
  {
    version: 30,
    tables: ['duplicate_check_content_ignore_rules'],
    repair: addDuplicateCheckV30Columns,
  },
  {
    version: 31,
    tables: ['bid_opportunity_follow_ups', 'bid_opportunity_attachments'],
    repair: createBidOpportunityFollowUpSchema,
  },
  {
    version: 32,
    tables: ['ai_evaluation_expert_scores'],
    repair: addAiEvaluationExpertFormalReviewColumns,
  },
];

const schemaHealthColumnGroups = [
  {
    version: 1,
    table: 'technical_plan_meta',
    columns: {
      step: 'TEXT',
      tender_file_name: 'TEXT',
      tender_markdown_path: 'TEXT',
      tender_markdown_hash: 'TEXT',
      tender_markdown_chars: 'INTEGER',
      tender_parser_label: 'TEXT',
      tender_imported_at: 'TEXT',
      bid_analysis_mode: 'TEXT',
      outline_mode: 'TEXT',
      outline_project_name: 'TEXT',
      outline_project_overview: 'TEXT',
      content_generation_options_json: 'TEXT',
      content_generation_runtime_json: 'TEXT',
      created_at: 'TEXT',
      updated_at: 'TEXT',
    },
  },
  {
    version: 5,
    table: 'technical_plan_meta',
    columns: {
      current_bid_section_id: 'TEXT',
      bid_sections_extracted: 'INTEGER',
    },
  },
  {
    version: 7,
    table: 'technical_plan_meta',
    columns: {
      selected_section_id: 'TEXT',
      selected_section_title: 'TEXT',
      selected_section_head_line: 'TEXT',
    },
  },
  {
    version: 8,
    table: 'technical_plan_meta',
    columns: {
      pending_tender_markdown_path: 'TEXT',
      pending_tender_file_name: 'TEXT',
      pending_tender_parser_label: 'TEXT',
      pending_tender_sections_json: 'TEXT',
      pending_tender_total_declared: 'INTEGER',
      pending_tender_created_at: 'TEXT',
    },
  },
  {
    version: 9,
    table: 'technical_plan_meta',
    columns: {
      workflow_kind: "TEXT NOT NULL DEFAULT 'technical-plan'",
      original_plan_file_name: 'TEXT',
      original_plan_markdown_path: 'TEXT',
      original_plan_markdown_hash: 'TEXT',
      original_plan_markdown_chars: 'INTEGER NOT NULL DEFAULT 0',
      original_plan_parser_label: 'TEXT',
      original_plan_imported_at: 'TEXT',
    },
  },
  {
    version: 10,
    table: 'technical_plan_meta',
    columns: {
      bid_analysis_selected_task_ids_json: 'TEXT',
    },
  },
  {
    version: 11,
    table: 'knowledge_documents',
    columns: {
      sort_order: 'INTEGER NOT NULL DEFAULT 0',
    },
  },
  {
    version: 12,
    table: 'rejection_check_documents',
    columns: {
      sort_order: 'INTEGER NOT NULL DEFAULT 0',
    },
  },
  {
    version: 12,
    table: 'rejection_check_risk_findings',
    columns: {
      bid_document_id: 'TEXT',
    },
  },
  {
    version: 12,
    table: 'rejection_check_typo_findings',
    columns: {
      bid_document_id: 'TEXT',
    },
  },
  {
    version: 12,
    table: 'rejection_check_logic_findings',
    columns: {
      bid_document_id: 'TEXT',
    },
  },
  {
    version: 17,
    table: 'duplicate_check_content_duplicates',
    columns: {
      resolution_status: "TEXT NOT NULL DEFAULT 'pending'",
      resolved_at: 'TEXT',
    },
  },
  {
    version: 17,
    table: 'duplicate_check_duplicate_images',
    columns: {
      resolution_status: "TEXT NOT NULL DEFAULT 'pending'",
      resolved_at: 'TEXT',
    },
  },
  {
    version: 30,
    table: 'duplicate_check_duplicate_images',
    columns: {
      match_type: "TEXT NOT NULL DEFAULT 'exact'",
      similarity_score: 'REAL NOT NULL DEFAULT 1',
      similarity_reason: 'TEXT',
    },
  },
  {
    version: 33,
    table: 'duplicate_check_duplicate_images',
    columns: {
      rotation_degrees: 'INTEGER',
    },
  },
  {
    version: 34,
    table: 'duplicate_check_duplicate_images',
    columns: {
      watermark_hint: 'TEXT',
    },
  },
  {
    version: 35,
    table: 'duplicate_check_duplicate_images',
    columns: {
      crop_json: 'TEXT',
    },
  },
  {
    version: 30,
    table: 'duplicate_check_content_ignore_rules',
    columns: {
      category: "TEXT NOT NULL DEFAULT 'manual'",
    },
  },
  {
    version: 18,
    table: 'rejection_check_risk_findings',
    columns: {
      resolution_status: "TEXT NOT NULL DEFAULT 'pending'",
      resolved_at: 'TEXT',
    },
  },
  {
    version: 18,
    table: 'rejection_check_typo_findings',
    columns: {
      resolution_status: "TEXT NOT NULL DEFAULT 'pending'",
      resolved_at: 'TEXT',
    },
  },
  {
    version: 18,
    table: 'rejection_check_logic_findings',
    columns: {
      resolution_status: "TEXT NOT NULL DEFAULT 'pending'",
      resolved_at: 'TEXT',
    },
  },
  {
    version: 20,
    table: 'bid_opportunity_opportunities',
    columns: {
      owner: "TEXT NOT NULL DEFAULT ''",
      next_action: "TEXT NOT NULL DEFAULT ''",
      reminder_at: "TEXT NOT NULL DEFAULT ''",
    },
  },
  {
    version: 28,
    table: 'bid_opportunity_opportunities',
    columns: {
      knowledge_matches_json: "TEXT NOT NULL DEFAULT '[]'",
    },
  },
  {
    version: 31,
    table: 'bid_opportunity_follow_ups',
    columns: {
      record_id: 'TEXT',
      opportunity_id: 'TEXT',
      occurred_at: 'TEXT',
      method: "TEXT NOT NULL DEFAULT 'other'",
      owner: "TEXT NOT NULL DEFAULT ''",
      contact_person: "TEXT NOT NULL DEFAULT ''",
      content: "TEXT NOT NULL DEFAULT ''",
      next_action: "TEXT NOT NULL DEFAULT ''",
      next_follow_up_at: "TEXT NOT NULL DEFAULT ''",
      created_at: 'TEXT',
      updated_at: 'TEXT',
    },
  },
  {
    version: 31,
    table: 'bid_opportunity_attachments',
    columns: {
      attachment_id: 'TEXT',
      opportunity_id: 'TEXT',
      kind: "TEXT NOT NULL DEFAULT 'announcement'",
      file_name: 'TEXT',
      stored_path: 'TEXT',
      original_path: "TEXT NOT NULL DEFAULT ''",
      file_size: 'INTEGER NOT NULL DEFAULT 0',
      note: "TEXT NOT NULL DEFAULT ''",
      created_at: 'TEXT',
      updated_at: 'TEXT',
    },
  },
  {
    version: 32,
    table: 'ai_evaluation_expert_scores',
    columns: {
      expert_role: "TEXT NOT NULL DEFAULT ''",
      review_session: "TEXT NOT NULL DEFAULT ''",
      signature_confirmed: 'INTEGER NOT NULL DEFAULT 0',
      signed_at: 'TEXT',
    },
  },
  {
    version: 21,
    table: 'business_bid_clauses',
    columns: {
      owner: "TEXT NOT NULL DEFAULT ''",
      confirmed_by: "TEXT NOT NULL DEFAULT ''",
    },
  },
  {
    version: 22,
    table: 'image_knowledge_assets',
    columns: {
      folder: "TEXT NOT NULL DEFAULT ''",
    },
  },
];

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function getExistingTables(db) {
  return new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
}

function getExistingColumns(db, tableName) {
  return new Set(db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all().map((row) => row.name));
}

function emitDatabaseStatus(onStatus, status) {
  if (typeof onStatus === 'function') {
    onStatus(status);
  }
}

function ensureWorkspaceSchemaHealth(db, targetVersion = schemaVersion, onStatus) {
  emitDatabaseStatus(onStatus, {
    phase: 'checking',
    message: '正在检查本地数据库结构',
    targetVersion,
  });
  let existingTables = getExistingTables(db);
  for (const group of schemaHealthTableGroups) {
    if (group.version > targetVersion) continue;
    if (group.tables.every((tableName) => existingTables.has(tableName))) continue;
    emitDatabaseStatus(onStatus, {
      phase: 'repairing',
      message: '正在修复本地数据库表结构',
      targetVersion,
    });
    group.repair(db);
    existingTables = getExistingTables(db);
  }

  const columnCache = new Map();
  for (const group of schemaHealthColumnGroups) {
    if (group.version > targetVersion || !existingTables.has(group.table)) continue;
    let existingColumns = columnCache.get(group.table);
    if (!existingColumns) {
      existingColumns = getExistingColumns(db, group.table);
      columnCache.set(group.table, existingColumns);
    }
    for (const [columnName, columnType] of Object.entries(group.columns)) {
      if (existingColumns.has(columnName)) continue;
      emitDatabaseStatus(onStatus, {
        phase: 'repairing',
        message: '正在修复本地数据库字段',
        targetVersion,
      });
      db.exec(`ALTER TABLE ${quoteIdentifier(group.table)} ADD COLUMN ${quoteIdentifier(columnName)} ${columnType}`);
      existingColumns.add(columnName);
    }
  }
}

const migrations = [
  {
    version: 1,
    description: '创建技术方案 SQLite 初始表结构',
    up: createInitialSchema,
  },
  {
    version: 2,
    description: '新增标书查重和废标项检查 SQLite 表结构',
    up: createWorkspaceV2Schema,
  },
  {
    version: 3,
    description: '新增知识库 SQLite 表结构',
    up: createKnowledgeBaseSchema,
  },
  {
    version: 4,
    description: '新增技术方案全局事实表结构',
    up: createTechnicalPlanGlobalFactsSchema,
  },
  {
    version: 5,
    description: '技术方案新增标段选择字段',
    up: addTechnicalPlanBidSectionV6Compat,
  },
  {
    version: 6,
    description: '兼容旧版标段字段（幂等）',
    up: addTechnicalPlanBidSectionV6Compat,
  },
  {
    version: 7,
    description: '技术方案新增标段选择字段（selected_section）',
    up: addTechnicalPlanSelectedSection,
  },
  {
    version: 8,
    description: '技术方案新增待选择标段恢复状态',
    up: addTechnicalPlanPendingTenderSelection,
  },
  {
    version: 9,
    description: '技术方案新增工作流类型和原方案文件状态',
    up: addTechnicalPlanWorkflowAndOriginalPlan,
  },
  {
    version: 10,
    description: '技术方案新增招标解析项选择配置',
    up: addTechnicalPlanBidAnalysisSelection,
  },
  {
    version: 11,
    description: '知识库文档新增手动排序字段',
    up: addKnowledgeDocumentSortOrder,
  },
  {
    version: 12,
    description: '废标项检查支持多份投标文件',
    up: migrateRejectionCheckMultiBidDocuments,
  },
  {
    version: 13,
    description: '新增投标机会工作台 SQLite 表结构',
    up: createBidOpportunitySchema,
  },
  {
    version: 14,
    description: '新增商务标工作台 SQLite 表结构',
    up: createBusinessBidSchema,
  },
  {
    version: 15,
    description: '新增图片知识库 SQLite 表结构',
    up: createImageKnowledgeBaseSchema,
  },
  {
    version: 16,
    description: '新增 AI 评标工作台 SQLite 表结构',
    up: createAiEvaluationSchema,
  },
  {
    version: 17,
    description: '标书查重重复项新增人工处理状态',
    up: addDuplicateCheckResolutionColumns,
  },
  {
    version: 18,
    description: '废标项检查结果新增人工处理状态',
    up: addRejectionCheckResolutionColumns,
  },
  {
    version: 19,
    description: '标书查重正文新增常用忽略规则',
    up: createDuplicateCheckContentIgnoreRules,
  },
  {
    version: 20,
    description: '投标机会新增负责人和提醒字段',
    up: addBidOpportunityFollowUpColumns,
  },
  {
    version: 21,
    description: '商务标条款新增负责人和确认人字段',
    up: addBusinessBidResponsibilityColumns,
  },
  {
    version: 22,
    description: '图片知识库新增文件夹字段',
    up: addImageKnowledgeFolderColumn,
  },
  {
    version: 23,
    description: '商务标新增后台任务状态表',
    up: createBusinessBidTaskSchema,
  },
  {
    version: 24,
    description: 'AI 评标新增后台任务状态表',
    up: createAiEvaluationTaskSchema,
  },
  {
    version: 25,
    description: 'AI 评标新增多投标文件和评分结果表',
    up: createAiEvaluationBidDocumentSchema,
  },
  {
    version: 26,
    description: 'AI 评标新增审计意见和报告快照表',
    up: createAiEvaluationAuditReportSchema,
  },
  {
    version: 27,
    description: 'AI 评标新增专家打分表',
    up: createAiEvaluationExpertScoreSchema,
  },
  {
    version: 28,
    description: '投标机会新增知识库匹配结果字段',
    up: addBidOpportunityKnowledgeMatchColumns,
  },
  {
    version: 29,
    description: '商务标新增独立附件管理表',
    up: createBusinessBidAttachmentSchema,
  },
  {
    version: 30,
    description: '标书查重补齐相似图片字段和正文忽略规则分类',
    up: addDuplicateCheckV30Columns,
  },
  {
    version: 31,
    description: '投标机会新增多轮跟进记录和公告沟通附件表',
    up: createBidOpportunityFollowUpSchema,
  },
  {
    version: 32,
    description: 'AI 评标专家打分新增角色、评审会议和签名确认字段',
    up: addAiEvaluationExpertFormalReviewColumns,
  },
  {
    version: 33,
    description: '标书查重相似图片新增旋转检测字段',
    up: addDuplicateCheckImageRotationColumn,
  },
  {
    version: 34,
    description: '标书查重相似图片新增水印提示字段',
    up: addDuplicateCheckImageWatermarkColumn,
  },
  {
    version: 35,
    description: '标书查重相似图片新增内容裁剪框字段',
    up: addDuplicateCheckImageCropColumn,
  },
];

function timestampForFileName() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/T/, '-').replace(/\..*$/, '');
}

function copyIfExists(source, target) {
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, target);
  }
}

function backupDatabaseFiles(db, databasePath, onStatus) {
  if (!fs.existsSync(databasePath)) {
    return;
  }

  emitDatabaseStatus(onStatus, {
    phase: 'backing-up',
    message: '正在备份本地数据库',
  });
  db.pragma('wal_checkpoint(TRUNCATE)');
  const suffix = `backup-${timestampForFileName()}`;
  copyIfExists(databasePath, `${databasePath}.${suffix}`);
  copyIfExists(`${databasePath}-wal`, `${databasePath}-wal.${suffix}`);
  copyIfExists(`${databasePath}-shm`, `${databasePath}-shm.${suffix}`);
}

function applyMigrations(db, databasePath, onStatus) {
  const currentVersion = Number(db.pragma('user_version', { simple: true }) || 0);
  if (currentVersion > schemaVersion) {
    throw new Error(`本地数据库版本 ${currentVersion} 高于当前客户端支持版本 ${schemaVersion}，请升级客户端后再使用技术方案功能。`);
  }
  if (currentVersion === schemaVersion) {
    ensureWorkspaceSchemaHealth(db, schemaVersion, onStatus);
    return;
  }

  if (currentVersion > 0) {
    backupDatabaseFiles(db, databasePath, onStatus);
  }

  const runMigration = db.transaction((migration) => {
    migration.up(db);
    db.pragma(`user_version = ${migration.version}`);
  });

  for (const migration of migrations.filter((item) => item.version > currentVersion).sort((a, b) => a.version - b.version)) {
    try {
      ensureWorkspaceSchemaHealth(db, migration.version - 1, onStatus);
      emitDatabaseStatus(onStatus, {
        phase: 'upgrading',
        message: `正在升级本地数据库（v${migration.version}）`,
        currentVersion,
        targetVersion: migration.version,
        migrationVersion: migration.version,
        migrationDescription: migration.description,
      });
      runMigration(migration);
      ensureWorkspaceSchemaHealth(db, migration.version, onStatus);
    } catch (error) {
      throw new Error(`数据库升级失败（v${migration.version} ${migration.description}）：${error.message || String(error)}`);
    }
  }

  ensureWorkspaceSchemaHealth(db, schemaVersion, onStatus);
}

function createSqliteDatabase(app, options = {}) {
  const databasePath = getWorkspaceDatabasePath(app);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  applyMigrations(db, databasePath, options.onStatus);

  const close = () => {
    if (db.open) {
      db.close();
    }
  };

  app.once('before-quit', close);

  return {
    db,
    path: databasePath,
    schemaVersion,
    close,
  };
}

module.exports = {
  createSqliteDatabase,
  schemaVersion,
};
