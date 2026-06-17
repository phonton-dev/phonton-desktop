import { useCallback, useRef, useState } from "react";
import {
  doctorRun,
  goalStart,
  goalStatus,
  planPreview,
  reviewGet,
  subscribeEvents,
} from "../lib/serve";

export type GoalSession = {
  id: string;
  title: string;
  createdAt: number;
  goal: string;
  planJson: string;
  receiptJson: string;
  taskId: string | null;
  running: boolean;
  statusLine: string;
  eventLog: string[];
};

function newSession(title = "New goal"): GoalSession {
  const id = crypto.randomUUID();
  return {
    id,
    title,
    createdAt: Date.now(),
    goal: "",
    planJson: "{}",
    receiptJson: "{}",
    taskId: null,
    running: false,
    statusLine: "Idle",
    eventLog: [],
  };
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

  const createSession = useCallback(() => {
    const session = newSession();
    setSessions((prev) => [session, ...prev]);
    setActiveId(session.id);
    return session.id;
  }, []);

  const selectSession = useCallback((id: string) => {
    setActiveId(id);
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
    patchSession(active.id, { statusLine: "Planning…" });
    try {
      const report = await planPreview(text);
      patchSession(active.id, {
        planJson: JSON.stringify(report, null, 2),
        statusLine: "Plan ready",
      });
      appendLog(active.id, "[plan] preview complete");
    } catch (err) {
      patchSession(active.id, {
        planJson: String(err),
        statusLine: "Plan failed",
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
      });
    }
  }, [active, appendLog, patchSession]);

  const runGoal = useCallback(async () => {
    if (!active) return;
    const text = active.goal.trim();
    if (!text) return;
    unsubRef.current.get(active.id)?.();
    clearPoll(active.id);
    patchSession(active.id, { running: true, statusLine: "Starting goal…" });
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
          patchSession(sessionId, {
            statusLine: `Task ${started.task_id} · done=${st.done}`,
          });
          if (st.done) {
            clearPoll(sessionId);
            unsubRef.current.get(sessionId)?.();
            patchSession(sessionId, {
              receiptJson: JSON.stringify(st.state, null, 2),
              running: false,
            });
            appendLog(sessionId, "[goal] completed");
          }
        } catch {
          /* transient */
        }
      }, 1500);
      pollRef.current.set(sessionId, poll);
    } catch (err) {
      patchSession(active.id, { statusLine: String(err), running: false });
    }
  }, [active, appendLog, clearPoll, patchSession]);

  const loadReview = useCallback(async () => {
    if (!active) return;
    try {
      const report = await reviewGet(active.taskId ?? undefined);
      patchSession(active.id, { receiptJson: JSON.stringify(report, null, 2) });
      appendLog(active.id, "[review] loaded");
    } catch (err) {
      patchSession(active.id, { receiptJson: String(err) });
    }
  }, [active, appendLog, patchSession]);

  const resumeFromTask = useCallback(
    (taskId: string, goalText: string) => {
      const session = newSession(goalText.slice(0, 48));
      session.goal = goalText;
      session.taskId = taskId;
      session.title = goalText.slice(0, 48) + (goalText.length > 48 ? "…" : "");
      setSessions((prev) => [session, ...prev]);
      setActiveId(session.id);
    },
    [],
  );

  return {
    sessions,
    active,
    activeId,
    createSession,
    selectSession,
    setGoal,
    previewPlan,
    runDoctor,
    runGoal,
    loadReview,
    resumeFromTask,
  };
}
