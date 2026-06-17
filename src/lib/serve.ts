import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./sidecar";

const SERVE_URL = "http://127.0.0.1:47831/rpc";
const SERVE_HEALTH_URL = "http://127.0.0.1:47831/health";
let rpcId = 1;

async function serveFetch(url: string, init?: RequestInit): Promise<Response> {
  if (isTauri()) {
    if (url.endsWith("/health") && (!init?.method || init.method === "GET")) {
      const ok = await invoke<boolean>("serve_health");
      return new Response(ok ? "ok" : "", { status: ok ? 200 : 503 });
    }
    if (url.endsWith("/rpc") && init?.method === "POST") {
      const body = typeof init.body === "string" ? init.body : "";
      const text = await invoke<string>("serve_rpc", { body });
      return new Response(text, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  return fetch(url, init);
}

export async function rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: rpcId++,
    method,
    params,
  });
  const res = await serveFetch(SERVE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });
  const body = await res.json();
  if (body.error) {
    throw new Error(body.error.message ?? "rpc error");
  }
  return body.result as T;
}

export async function checkServeHealth(): Promise<boolean> {
  try {
    const res = await serveFetch(SERVE_HEALTH_URL, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ping() {
  return rpc<{ version: string; handoff_schema: string }>("ping");
}

const POLL_ATTEMPTS = 40;
const POLL_ATTEMPTS_BOOTSTRAP = 120;
const POLL_INTERVAL_MS = 500;

export async function waitForPing(
  bootstrap = false,
): Promise<{ version: string; handoff_schema: string } | null> {
  const attempts = bootstrap ? POLL_ATTEMPTS_BOOTSTRAP : POLL_ATTEMPTS;
  for (let i = 0; i < attempts; i++) {
    try {
      return await ping();
    } catch {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  return null;
}

export async function planPreview(goal: string) {
  return rpc<unknown>("plan.preview", { goal });
}

export async function doctorRun(provider = false) {
  return rpc<unknown>("doctor.run", { provider });
}

export async function reviewGet(taskId?: string) {
  return rpc<unknown>("review.get", taskId ? { task_id: taskId } : {});
}

export async function goalStart(goal: string) {
  return rpc<{ task_id: string }>("goal.start", { goal, timeout_seconds: 900 });
}

export async function goalStatus(taskId: string) {
  return rpc<{ done: boolean; state: unknown }>("goal.status", { task_id: taskId });
}

export function subscribeEvents(taskId: string, onEvent: (data: string) => void) {
  const source = new EventSource(`http://127.0.0.1:47831/events/${taskId}`);
  source.onmessage = (ev) => onEvent(ev.data);
  return () => source.close();
}
