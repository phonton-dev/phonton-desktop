import { useCallback, useRef, useState } from "react";
import {
  doctorRun,
  goalStart,
  goalStatus,
  planPreview,
  reviewGet,
  subscribeEvents,
} from "../lib/serve";

export function useGoalRun(onLog: (line: string) => void) {
  const [goal, setGoal] = useState("");
  const [planJson, setPlanJson] = useState("{}");
  const [receiptJson, setReceiptJson] = useState("{}");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [statusLine, setStatusLine] = useState("Idle");
  const unsubRef = useRef<(() => void) | null>(null);
  const pollRef = useRef<number | null>(null);

  const clearPoll = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const previewPlan = useCallback(async () => {
    const text = goal.trim();
    if (!text) return;
    setStatusLine("Planning…");
    try {
      const report = await planPreview(text);
      setPlanJson(JSON.stringify(report, null, 2));
      setStatusLine("Plan ready");
      onLog("[plan] preview complete");
    } catch (err) {
      setPlanJson(String(err));
      setStatusLine("Plan failed");
    }
  }, [goal, onLog]);

  const runDoctor = useCallback(async () => {
    setStatusLine("Running doctor…");
    try {
      const report = await doctorRun(false);
      setPlanJson(JSON.stringify(report, null, 2));
      setStatusLine("Doctor complete");
      onLog("[doctor] complete");
    } catch (err) {
      setPlanJson(String(err));
      setStatusLine("Doctor failed");
    }
  }, [onLog]);

  const runGoal = useCallback(async () => {
    const text = goal.trim();
    if (!text) return;
    unsubRef.current?.();
    clearPoll();
    setRunning(true);
    setStatusLine("Starting goal…");
    onLog(`[goal] start: ${text.slice(0, 80)}…`);
    try {
      const started = await goalStart(text);
      setTaskId(started.task_id);
      setStatusLine(`Running ${started.task_id}`);
      unsubRef.current = subscribeEvents(started.task_id, (line) => {
        onLog(line);
      });
      pollRef.current = window.setInterval(async () => {
        try {
          const st = await goalStatus(started.task_id);
          setStatusLine(`Task ${started.task_id} · done=${st.done}`);
          if (st.done) {
            clearPoll();
            unsubRef.current?.();
            setReceiptJson(JSON.stringify(st.state, null, 2));
            setRunning(false);
            onLog("[goal] completed");
          }
        } catch {
          /* transient */
        }
      }, 1500);
    } catch (err) {
      setStatusLine(String(err));
      setRunning(false);
    }
  }, [goal, onLog]);

  const loadReview = useCallback(async () => {
    try {
      const report = await reviewGet(taskId ?? undefined);
      setReceiptJson(JSON.stringify(report, null, 2));
      onLog("[review] loaded");
    } catch (err) {
      setReceiptJson(String(err));
    }
  }, [taskId, onLog]);

  return {
    goal,
    setGoal,
    planJson,
    receiptJson,
    running,
    statusLine,
    previewPlan,
    runDoctor,
    runGoal,
    loadReview,
  };
}
