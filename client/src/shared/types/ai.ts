export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequestOptions {
  temperature?: number;
  response_format?: { type: 'json_object' };
  timeout_ms?: number;
  timeout_message?: string;
  logTitle?: string;
  log_title?: string;
}

export interface ChatCompletionRequest extends ChatRequestOptions {
  messages: ChatMessage[];
}

export interface JsonCompletionRequest<TInput = unknown> extends ChatRequestOptions {
  messages: ChatMessage[];
  schemaName?: string;
  input?: TInput;
  max_retries?: number;
  progressLabel?: string;
  failureMessage?: string;
}

export interface JsonFailureSample {
  id: string;
  created_at: string;
  scenario_id: string;
  scenario_label: string;
  schema_name: string;
  target_description: string;
  invalid_content: string;
  issues: string[];
  error_message?: string;
}

export interface JsonFailureSampleInput {
  scenario_id: string;
  scenario_label: string;
  schema_name: string;
  target_description: string;
  invalid_content: string;
  issues: string[];
  error_message?: string;
}

export interface JsonFailureSamplesResult {
  success: boolean;
  message?: string;
  sample?: JsonFailureSample;
  samples: JsonFailureSample[];
  filePath?: string;
}

export interface JsonReplayLog {
  id: string;
  created_at: string;
  log_title: string;
  type: string;
  request_mode?: string;
  error_message?: string;
  content_preview: string;
  invalid_content: string;
  issues: string[];
}

export interface JsonReplayLogsResult {
  success: boolean;
  logs: JsonReplayLog[];
}

export interface PromptDebugRecordInput {
  chainId: string;
  chainLabel: string;
  responseFormat: string;
  schema: string;
  messageCount: number;
  charCount: number;
  messages: ChatMessage[];
  redaction?: Record<string, string>;
}

export interface PromptDebugRecord {
  id: string;
  created_at: string;
  chain_id: string;
  chain_label: string;
  response_format: string;
  schema: string;
  message_count: number;
  char_count: number;
  messages: ChatMessage[];
  redaction: Record<string, string>;
}

export interface PromptDebugRecordResult {
  success: boolean;
  message?: string;
  record?: PromptDebugRecord;
  filePath?: string;
}
