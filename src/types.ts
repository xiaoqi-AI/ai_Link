export type ProviderType =
  | "mock"
  | "openai-compatible"
  | "deepseek"
  | "kimi"
  | "grok"
  | "coze";

export type ApiStyle = "chat-completions" | "responses";

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface ProviderConfig {
  type: ProviderType;
  baseUrl?: string;
  endpoint?: string;
  apiStyle?: ApiStyle;
  apiKey?: string;
  apiKeyEnv?: string;
  model?: string;
  capabilities?: string[];
  timeoutMs?: number;
  headers?: Record<string, string>;
  requestDefaults?: Record<string, unknown>;
}

export interface RouteConfig {
  provider?: string;
  model?: string;
  fallback?: string[];
  capabilities?: string[];
  policy?: string;
}

export interface WorkflowStageConfig {
  name: string;
  task?: string;
  provider?: string;
  model?: string;
  system?: string;
  inputFrom?: "original" | "previous" | "original-and-previous";
}

export interface WorkflowConfig {
  description?: string;
  stages?: WorkflowStageConfig[];
}

export interface PolicyConfig {
  blockSensitive?: boolean;
  allowOutbound?: "never" | "user-approved" | "always";
  blockPatterns?: string[];
}

export interface SkillConfig {
  description?: string;
  routes?: Record<string, RouteConfig>;
}

export interface AiLinkConfig {
  version?: number;
  defaults?: {
    provider?: string;
    policy?: string;
  };
  providers?: Record<string, ProviderConfig>;
  routes?: Record<string, RouteConfig>;
  workflows?: Record<string, WorkflowConfig>;
  policies?: Record<string, PolicyConfig>;
  skills?: Record<string, SkillConfig>;
}

export interface ConfigLayer {
  name: string;
  path?: string;
  exists: boolean;
}

export interface LoadedConfig {
  config: AiLinkConfig;
  layers: ConfigLayer[];
}

export interface RunRequest {
  task: string;
  input?: string;
  system?: string;
  messages?: ChatMessage[];
  provider?: string;
  model?: string;
  dryRun?: boolean;
  allowSensitive?: boolean;
}

export interface ProviderCallInput {
  providerName: string;
  provider: ProviderConfig;
  request: RunRequest;
  model: string;
  dryRun: boolean;
}

export interface ProviderCallResult {
  output: string;
  raw?: unknown;
  metadata: Record<string, unknown>;
}

export interface ProviderAdapter {
  run(input: ProviderCallInput): Promise<ProviderCallResult>;
}

export interface RunAttempt {
  provider: string;
  model?: string;
  ok: boolean;
  error?: string;
}

export interface RunResult {
  task: string;
  provider: string;
  model?: string;
  output: string;
  dryRun: boolean;
  attempts: RunAttempt[];
  metadata: Record<string, unknown>;
}

export interface WorkflowRunRequest {
  workflow: string;
  stages?: string[];
  input?: string;
  system?: string;
  provider?: string;
  model?: string;
  dryRun?: boolean;
  allowSensitive?: boolean;
}

export interface WorkflowStageResult {
  name: string;
  task: string;
  inputFrom: "original" | "previous" | "original-and-previous";
  result: RunResult;
}

export interface WorkflowRunResult {
  workflow: string;
  dryRun: boolean;
  stages: WorkflowStageResult[];
}
