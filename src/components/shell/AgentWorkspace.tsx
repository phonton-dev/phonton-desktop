import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { GoalSession } from "@/hooks/useSessions";
import type { SidecarState } from "@/hooks/useSidecar";
import { MIN_SERVE_CLI_VERSION } from "@/lib/cli-version";
import { FocusShell, type FocusView } from "@/components/focus/FocusShell";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

type Props = {
  session: GoalSession | undefined;
  sidecar: SidecarState;
  projectLabel?: string | null;
  providerModel?: string | null;
  onGoalChange: (goal: string) => void;
  onPreviewPlan: () => void;
  onRunGoal: () => void;
  onRetrySidecar: () => void;
  onUpgradeSidecar?: () => void;
  onFocusChange?: (view: FocusView) => void;
};

const EXAMPLE_GOALS = [
  "Fix failing tests in the auth module",
  "Add input validation to the config loader",
  "Refactor sidebar layout without changing behavior",
];

export function AgentWorkspace({
  session,
  sidecar,
  projectLabel,
  providerModel,
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
          {idle ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Sparkles className="size-4 text-primary" />
              <p className="text-sm">
                What should we build
                {projectLabel ? (
                  <>
                    {" "}
                    in <span className="text-foreground font-medium">{projectLabel}</span>?
                  </>
                ) : (
                  "?"
                )}
              </p>
            </div>
          ) : null}
          <div className="rounded-2xl border bg-card/50 shadow-sm focus-within:ring-2 focus-within:ring-ring/40 transition-shadow">
            <Textarea
              placeholder={
                projectLabel
                  ? `Describe a merge-bound goal for ${projectLabel}…`
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
                  Work locally
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
                  disabled={running || sidecar.status !== "ready"}
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
                  key={example}
                  type="button"
                  className="rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => onGoalChange(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          ) : null}
          {sidecar.status === "upgrade_required" ? (
            <p className="text-xs text-amber-500">
              Sidecar needs phonton-cli v{MIN_SERVE_CLI_VERSION}+
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
          {sidecar.status === "connecting" ? (
            <p className="text-xs text-muted-foreground">{sidecar.message ?? "Connecting…"}</p>
          ) : null}
        </div>
      </div>
      <FocusShell session={session} focus={focus} onFocusChange={handleFocusChange} />
    </div>
  );
}
