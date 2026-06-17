import { useCallback, useRef, useState } from "react";
import { getTask } from "@/lib/config";
import {
  doctorRun,
  goalStart,
  goalStatus,
  planPreview,
  reviewGet,
  subscribeEvents,
} from "@/lib/serve";
import {
  parseGlobalState,
  parseHandoffPacket,
  taskStatusLabel,
  taskStatusTone,
  type GlobalState,
  type HandoffPacket,
} from "@/lib/types/global-state";

export type PlanPreviewData = {
  subtasks?: { id?: string; description?: string; model_tier?: string }[];
  goal_contract?: GlobalState["goal_contract"];
};

export type GoalSession = {
  id: string;
  title: string;
  createdAt: number;
  goal: string;
  planJson: string;
  planData: PlanPreviewData | null;
  receiptJson: string;
  handoff: HandoffPacket | null;
  globalState: GlobalState | null;
  taskId: string | null;
  running: boolean;
  statusLine: string;
  statusTone: "default" | "success" | "warning" | "destructive";
  eventLog: string[];
  pinned?: boolean;
};

function newSession(title = "New goal"): GoalSession {
  const id = crypto.randomUUID();
  return {
    id,
    title,
    createdAt: Date.now(),
    goal: "",
    planJson: "{}",
    planData: null,
    receiptJson: "{}",
    handoff: null,
    globalState: null,
    taskId: null,
    running: false,
    statusLine: "Idle",
    statusTone: "default",
    eventLog: [],
  };
}

function parsePlanPreview(report: unknown): PlanPreviewData | null {
  if (!report || typeof report !== "object") return null;
  const o = report as Record<string, unknown>;
  const subtasks = Array.isArray(o.subtasks) ? (o.subtasks as PlanPreviewData["subtasks"]) : undefined;
  const goal_contract = o.goal_contract as PlanPreviewData["goal_contract"];
  return { subtasks, goal_contract: goal_contract ?? undefined };
}

export function useSessions() {
  const [sessions, setSessions] = useState<GoalSession[]>(() => [newSession()]);
  const [activeId, setActiveId] = useState(() => sessions[0]?.id ?? "");
  const pollRef = useRef<Map<string, number>>(new Map());
  const unsubRef = useRef<Map<string, () => void>>(new Map());

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];

  const patchSession = useCallback((id: string, patch: Partial<GoalSession>) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const appendLog = useCallback((id: string, line: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, eventLog: [...s.eventLog.slice(-400), line] } : s,
      ),
    );
  }, []);

  const clearPoll = useCallback((id: string) => {
    const handle = pollRef.current.get(id);
    if (handle) window.clearInterval(handle);
    pollRef.current.delete(id);
  }, []);

  const hydrateFromGlobalState = useCallback(
    (sessionId: string, raw: unknown) => {
      const globalState = parseGlobalState(raw);
      if (!globalState) return;
      const handoff = parseHandoffPacket(globalState.handoff_packet);
      patchSession(sessionId, {
        globalState,
        handoff,
        receiptJson: JSON.stringify(raw, null, 2),
        statusLine: taskStatusLabel(globalState.task_status),
        statusTone: taskStatusTone(globalState.task_status),
        planData: globalState.goal_contract
          ? { goal_contract: globalState.goal_contract }
          : undefined,
      });
    },
    [patchSession],
  );

  const loadReviewForSession = useCallback(
    async (sessionId: string, taskId?: string | null) => {
      try {
        const report = await reviewGet(taskId ?? undefined);
        const record = report as Record<string, unknown>;
        const handoff = parseHandoffPacket(record?.handoff ?? record?.handoff_packet ?? report);
        patchSession(sessionId, {
          receiptJson: JSON.stringify(report, null, 2),
          handoff: handoff ?? null,
        });
        appendLog(sessionId, "[review] loaded");
        return handoff;
      } catch (err) {
        patchSession(sessionId, { receiptJson: String(err) });
        return null;
      }
    },
    [appendLog, patchSession],
  );

  const createSession = useCallback(() => {
    const session = newSession();
    setSessions((prev) => [session, ...prev]);
    setActiveId(session.id);
    return session.id;
  }, []);

  const selectSession = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const togglePin = useCallback((id: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)),
    );
  }, []);

  const setGoal = useCallback(
    (goal: string) => {
      if (!active) return;
      patchSession(active.id, { goal });
    },
    [active, patchSession],
  );

  const previewPlan = useCallback(async () => {
    if (!active) return;
    const text = active.goal.trim();
    if (!text) return;
    patchSession(active.id, { statusLine: "Planning…", statusTone: "default" });
    try {
      const report = await planPreview(text);
      const planData = parsePlanPreview(report);
      patchSession(active.id, {
        planJson: JSON.stringify(report, null, 2),
        planData,
        globalState: planData?.goal_contract
          ? {
              task_status: "Planning",
              goal_contract: planData.goal_contract,
              active_workers: [],
              tokens_used: 0,
              estimated_naive_tokens: 0,
            }
          : active.globalState,
        statusLine: "Plan ready",
        statusTone: "default",
      });
      appendLog(active.id, "[plan] preview complete");
    } catch (err) {
      patchSession(active.id, {
        planJson: String(err),
        statusLine: "Plan failed",
        statusTone: "destructive",
      });
    }
  }, [active, appendLog, patchSession]);

  const runDoctor = useCallback(async () => {
    if (!active) return;
    patchSession(active.id, { statusLine: "Running doctor…" });
    try {
      const report = await doctorRun(false);
      patchSession(active.id, {
        planJson: JSON.stringify(report, null, 2),
        statusLine: "Doctor complete",
      });
      appendLog(active.id, "[doctor] complete");
    } catch (err) {
      patchSession(active.id, {
        planJson: String(err),
        statusLine: "Doctor failed",
        statusTone: "destructive",
      });
    }
  }, [active, appendLog, patchSession]);

  const runGoal = useCallback(async () => {
    if (!active) return;
    const text = active.goal.trim();
    if (!text) return;
    unsubRef.current.get(active.id)?.();
    clearPoll(active.id);
    patchSession(active.id, {
      running: true,
      statusLine: "Starting goal…",
      statusTone: "warning",
      eventLog: [],
    });
    appendLog(active.id, `[goal] start: ${text.slice(0, 80)}…`);
    try {
      const started = await goalStart(text);
      const sessionId = active.id;
      patchSession(sessionId, {
        taskId: started.task_id,
        title: text.slice(0, 48) + (text.length > 48 ? "…" : ""),
        statusLine: `Running ${started.task_id}`,
      });
      unsubRef.current.set(
        sessionId,
        subscribeEvents(started.task_id, (line) => appendLog(sessionId, line)),
      );
      const poll = window.setInterval(async () => {
        try {
          const st = await goalStatus(started.task_id);
          hydrateFromGlobalState(sessionId, st.state);
          patchSession(sessionId, {
            statusLine: `Task ${started.task_id} · done=${st.done}`,
          });
          if (st.done) {
            clearPoll(sessionId);
            unsubRef.current.get(sessionId)?.();
            await loadReviewForSession(sessionId, started.task_id);
            patchSession(sessionId, { running: false });
            appendLog(sessionId, "[goal] completed");
          }
        } catch {
          /* transient */
        }
      }, 1500);
      pollRef.current.set(sessionId, poll);
    } catch (err) {
      patchSession(active.id, {
        statusLine: String(err),
        running: false,
        statusTone: "destructive",
      });
    }
  }, [
    active,
    appendLog,
    clearPoll,
    hydrateFromGlobalState,
    loadReviewForSession,
    patchSession,
  ]);

  const loadReview = useCallback(async () => {
    if (!active) return;
    await loadReviewForSession(active.id, active.taskId);
  }, [active, loadReviewForSession]);

  const resumeFromTask = useCallback(
    async (taskId: string, goalText: string) => {
      const session = newSession(goalText.slice(0, 48));
      session.goal = goalText;
      session.taskId = taskId;
      session.title = goalText.slice(0, 48) + (goalText.length > 48 ? "…" : "");
      setSessions((prev) => [session, ...prev]);
      setActiveId(session.id);

      try {
        const detail = await getTask(taskId);
        appendLog(session.id, `[history] loaded task ${taskId}`);
        if (detail.events?.length) {
          for (const ev of detail.events.slice(-20)) {
            appendLog(session.id, JSON.stringify(ev));
          }
        }
      } catch (err) {
        appendLog(session.id, `[history] ${String(err)}`);
      }

      await loadReviewForSession(session.id, taskId);
    },
    [appendLog, loadReviewForSession],
  );

  return {
    sessions,
    active,
    activeId,
    createSession,
    selectSession,
    togglePin,
    setGoal,
    previewPlan,
    runDoctor,
    runGoal,
    loadReview,
    resumeFromTask,
  };
}
