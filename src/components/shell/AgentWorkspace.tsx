import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { GoalSession } from "@/hooks/useSessions";
import type { SidecarState } from "@/hooks/useSidecar";

type Props = {
  session: GoalSession | undefined;
  sidecar: SidecarState;
  onGoalChange: (goal: string) => void;
  onPreviewPlan: () => void;
  onRunGoal: () => void;
  onRetrySidecar: () => void;
};

export function AgentWorkspace({
  session,
  sidecar,
  onGoalChange,
  onPreviewPlan,
  onRunGoal,
  onRetrySidecar,
}: Props) {
  const eventLog = session?.eventLog ?? [];
  const planJson = session?.planJson ?? "{}";
  const statusLine = session?.statusLine ?? "Idle";
  const goal = session?.goal ?? "";
  const running = session?.running ?? false;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/60 p-4 space-y-3">
        <Textarea
          placeholder="Fix the config panic in src/config.js"
          value={goal}
          onChange={(e) => onGoalChange(e.target.value)}
          className="min-h-[88px] resize-none font-medium"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onPreviewPlan}>
            Preview plan
          </Button>
          <Button
            size="sm"
            onClick={onRunGoal}
            disabled={running || sidecar.status !== "ready"}
          >
            {running ? "Running…" : "Run goal"}
          </Button>
        </div>
        {sidecar.status === "offline" ? (
          <p className="text-xs text-amber-500">
            {sidecar.error}{" "}
            <button type="button" className="underline" onClick={onRetrySidecar}>
              Retry
            </button>
          </p>
        ) : null}
      </div>
      <Tabs defaultValue="run" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 mt-3 w-fit">
          <TabsTrigger value="run">Run</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
        </TabsList>
        <TabsContent value="run" className="min-h-0 flex-1 px-4 pb-4">
          <pre className="json-block h-full min-h-[200px] max-h-full overflow-auto">
            {eventLog.length ? eventLog.join("\n") : "Live events appear here when you run a goal."}
          </pre>
        </TabsContent>
        <TabsContent value="plan" className="min-h-0 flex-1 px-4 pb-4">
          <pre className="json-block h-full overflow-auto">{planJson}</pre>
        </TabsContent>
        <TabsContent value="output" className="min-h-0 flex-1 px-4 pb-4">
          <p className="mono text-sm text-muted-foreground">{statusLine}</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
