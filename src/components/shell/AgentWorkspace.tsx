import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { GoalSession } from "@/hooks/useSessions";
import type { SidecarState } from "@/hooks/useSidecar";
import { MIN_SERVE_CLI_VERSION } from "@/lib/cli-version";
import { FocusShell, type FocusView } from "@/components/focus/FocusShell";
import { EconomicsStrip } from "@/components/shell/EconomicsStrip";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

type Props = {
  session: GoalSession | undefined;
  sidecar: SidecarState;
  projectLabel?: string | null;
  providerModel?: string | null;
  workspaceTrusted: boolean | null;
  trustError: string | null;
  onTrustProject: () => void;
  onGoalChange: (goal: string) => void;
  onPreviewPlan: () => void;
  onRunGoal: () => void;
  onRetrySidecar: () => void;
  onUpgradeSidecar?: () => void;
  onFocusChange?: (view: FocusView) => void;
};

const EXAMPLE_GOALS = [
  {
    label: "Fix add_one tests",
    goal: "Make add_one return n + 1 so the unit tests in src/lib.rs pass.",
  },
  { label: "Validate config input", goal: "Add input validation to the config loader" },
  { label: "Refactor sidebar", goal: "Refactor sidebar layout without changing behavior" },
];

export function AgentWorkspace({
  session,
  sidecar,
  projectLabel,
  providerModel,
  workspaceTrusted,
  trustError,
  onTrustProject,
  onGoalChange,
  onPreviewPlan,
  onRunGoal,
  onRetrySidecar,
  onUpgradeSidecar,
  onFocusChange,
}: Props) {
  const [focus, setFocus] = useState<FocusView>("run");
  const goal = session?.goal ?? "";
  const running = session?.running ?? false;
  const idle = !goal.trim() && !session?.running;

  const handleFocusChange = (view: FocusView) => {
    setFocus(view);
    onFocusChange?.(view);
  };

  useEffect(() => {
    onFocusChange?.(focus);
  }, [focus, onFocusChange]);

  const sidecarBlocked =
    sidecar.status !== "ready" &&
    sidecar.status !== "connecting" &&
    sidecar.status !== "idle";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/60 p-4 md:p-6">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {sidecar.status === "ready" && workspaceTrusted === false ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <p className="max-w-xl text-xs leading-relaxed text-foreground/80">
                Trust {projectLabel ?? "this project"} before running a goal. Phonton can read and edit its files, run checks, and use your configured provider. MCP actions remain denied by default.
              </p>
              <Button size="sm" variant="secondary" onClick={onTrustProject}>Trust project</Button>
              {trustError ? <p className="w-full text-xs text-destructive">{trustError}</p> : null}
            </div>
          ) : null}
          {idle ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Sparkles className="size-4 text-primary" />
              <p className="text-sm">
                {projectLabel ? (
                  <>
                    What should we build in{" "}
                    <span className="text-foreground font-medium">{projectLabel}</span>?
                  </>
                ) : (
                  "What should we build?"
                )}
              </p>
            </div>
          ) : null}
          <div className="rounded-2xl border bg-card/50 shadow-sm focus-within:ring-2 focus-within:ring-ring/40 transition-shadow">
            <Textarea
              placeholder={
                projectLabel
                  ? `Describe a merge-bound goal for ${projectLabel}`
                  : "Fix the config panic in src/config.js"
              }
              value={goal}
              onChange={(e) => onGoalChange(e.target.value)}
              className="min-h-[120px] resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
              <div className="flex flex-wrap gap-1.5">
                {projectLabel ? (
                  <Badge variant="secondary" className="font-normal text-xs">
                    {projectLabel}
                  </Badge>
                ) : null}
                <Badge variant="outline" className="font-normal text-xs">
                  Your keys, local
                </Badge>
                {providerModel ? (
                  <Badge variant="outline" className="font-normal text-xs">
                    {providerModel}
                  </Badge>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={onPreviewPlan} disabled={sidecarBlocked}>
                  Preview plan
                </Button>
                <Button
                  size="sm"
                  onClick={onRunGoal}
                  disabled={running || sidecar.status !== "ready" || workspaceTrusted !== true}
                >
                  {running ? "Running…" : "Run goal"}
                </Button>
              </div>
            </div>
          </div>
          {idle && projectLabel ? (
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_GOALS.map((example) => (
                <button
                  key={example.goal}
                  type="button"
                  className="rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => onGoalChange(example.goal)}
                >
                  {example.label}
                </button>
              ))}
            </div>
          ) : null}
          {sidecar.status === "upgrade_required" ? (
            <p className="text-xs text-amber-500">
              Engine needs phonton-cli v{MIN_SERVE_CLI_VERSION}+
              {sidecar.installedVersion ? ` (found v${sidecar.installedVersion})` : ""}.{" "}
              <button type="button" className="underline" onClick={onUpgradeSidecar ?? onRetrySidecar}>
                Upgrade CLI
              </button>
            </p>
          ) : null}
          {sidecar.status === "offline" ? (
            <p className="text-xs text-amber-500">
              {sidecar.error}{" "}
              <button type="button" className="underline" onClick={onRetrySidecar}>
                Retry
              </button>
            </p>
          ) : null}
        </div>
      </div>
      <EconomicsStrip session={session} />
      <FocusShell session={session} focus={focus} onFocusChange={handleFocusChange} />
    </div>
  );
}
