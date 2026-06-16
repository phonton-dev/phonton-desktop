const SERVE_URL = "http://127.0.0.1:47831/rpc";
const SERVE_HEALTH_URL = "http://127.0.0.1:47831/health";
let rpcId = 1;

async function rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(SERVE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcId++,
      method,
      params,
    }),
  });
  const body = await res.json();
  if (body.error) {
    throw new Error(body.error.message ?? "rpc error");
  }
  return body.result as T;
}

export async function checkServeHealth(): Promise<boolean> {
  try {
    const res = await fetch(SERVE_HEALTH_URL, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ping() {
  return rpc<{ version: string; handoff_schema: string }>("ping");
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
