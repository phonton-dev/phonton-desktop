import { rpc } from "./serve";

export type PhontonConfig = {
  provider: {
    name: string;
    api_key?: string;
    has_api_key?: boolean;
    model?: string | null;
    account_id?: string | null;
    base_url?: string | null;
    keys?: Record<string, string>;
  };
  budget: {
    max_tokens?: number | null;
    max_usd_cents?: number | null;
  };
  index: {
    backend: string;
    qdrant_url?: string | null;
    qdrant_collection?: string | null;
  };
  permissions: {
    mode?: string | null;
  };
  general: {
    enable_auto_update: boolean;
  };
};

export type ConfigGetResult = {
  path: string | null;
  config: PhontonConfig;
};

export async function fetchConfig(): Promise<ConfigGetResult> {
  return rpc<ConfigGetResult>("config.get");
}

export async function saveConfig(patch: Partial<PhontonConfig>): Promise<{ ok: boolean; path: string | null }> {
  return rpc("config.save", { config: patch });
}

export type TaskSummary = {
  task_id: string;
  goal_text: string;
  status: unknown;
  created_at: number;
  total_tokens: number;
};

export async function listTasks(limit = 50): Promise<TaskSummary[]> {
  const result = await rpc<{ tasks: TaskSummary[] }>("tasks.list", { limit });
  return result.tasks ?? [];
}

export async function getTask(taskId: string) {
  return rpc<{
    task_id: string;
    goal_text: string;
    status: unknown;
    created_at: number;
    total_tokens: number;
    events: { kind: string; timestamp_ms: number; body: unknown }[];
  }>("tasks.get", { task_id: taskId });
}

export async function workspaceInfo() {
  return rpc<{
    path: string;
    trusted: boolean;
    config_path: string | null;
    store_path: string | null;
  }>("workspace.info");
}

export async function trustList(): Promise<string[]> {
  const result = await rpc<{ trusted: string[] }>("trust.list");
  return result.trusted ?? [];
}

export async function trustGrant(path: string) {
  return rpc<{ ok: boolean; trusted: boolean }>("trust.grant", { path });
}

export type ExtensionScopeInfo = {
  scope: string;
  path: string;
  exists: boolean;
  files: Record<string, boolean>;
};

export async function extensionsList() {
  return rpc<{ scopes: ExtensionScopeInfo[] }>("extensions.list");
}

export async function extensionsRead(scope: "user" | "workspace", file: string) {
  return rpc<{ path: string; content: string; exists: boolean }>("extensions.read", { scope, file });
}

export async function extensionsWrite(scope: "user" | "workspace", file: string, content: string) {
  return rpc<{ ok: boolean; path: string }>("extensions.write", { scope, file, content });
}

export async function extensionsValidate() {
  return rpc<{
    ok: boolean;
    steering_rules: number;
    mcp_servers: number;
    profiles: number;
    skills: number;
    diagnostics: number;
  }>("extensions.validate");
}

export const KNOWN_PROVIDERS = [
  "anthropic",
  "openai",
  "openrouter",
  "gemini",
  "cloudflare",
  "agentrouter",
  "deepseek",
  "xai",
  "groq",
  "together",
  "ollama",
  "openai-compatible",
  "custom",
] as const;
