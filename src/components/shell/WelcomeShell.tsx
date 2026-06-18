import { Button } from "@/components/ui/button";
import type { SidecarState } from "@/hooks/useSidecar";
import { MIN_SERVE_CLI_VERSION } from "@/lib/cli-version";
import { projectLabel } from "@/lib/projects";
import { FolderOpen, FolderKanban, Goal, ShieldCheck } from "lucide-react";

type Props = {
  recentProjects: string[];
  sidecar: SidecarState;
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  onSidecarAction?: () => void;
};

const STEPS = [
  { icon: FolderKanban, title: "Open repo", detail: "Pick a local folder Phonton can index and verify against." },
  { icon: Goal, title: "Describe a goal", detail: "State a merge-bound outcome — not a chat prompt." },
  { icon: ShieldCheck, title: "Review verified diff", detail: "Inspect the HandoffPacket after static verification passes." },
];

export function WelcomeShell({
  recentProjects,
  sidecar,
  onOpenProject,
  onOpenRecent,
  onSidecarAction,
}: Props) {
  const sidecarIssue =
    sidecar.status === "upgrade_required" || sidecar.status === "offline";

  return (
    <div className="shell-muted-scroll flex h-full flex-col overflow-y-auto p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <div className="text-center space-y-3">
          <img
            src="/phonton-logo.png"
            alt=""
            className="mx-auto size-14 rounded-2xl shell-surface p-2"
            aria-hidden
          />
          <h1 className="text-2xl font-semibold tracking-tight">Open a project to start</h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Phonton is a local-first agentic development environment. Open your repo,
            describe a goal, and review verified output — not raw chat.
          </p>
        </div>

        {sidecarIssue ? (
          <div className="shell-surface rounded-xl border border-amber-500/30 px-4 py-3 text-sm">
            {sidecar.status === "upgrade_required" ? (
              <p className="text-amber-500">
                Sidecar needs phonton-cli v{MIN_SERVE_CLI_VERSION}+.{" "}
                <button type="button" className="underline" onClick={onSidecarAction}>
                  Upgrade CLI
                </button>
              </p>
            ) : (
              <p className="text-amber-500">
                {sidecar.error}{" "}
                <button type="button" className="underline" onClick={onSidecarAction}>
                  Retry sidecar
                </button>
              </p>
            )}
          </div>
        ) : null}

        <div className="shell-surface rounded-2xl border p-6 text-center space-y-4">
          <Button size="lg" className="gap-2" onClick={onOpenProject}>
            <FolderOpen className="size-4" />
            Open project folder
          </Button>
          <p className="text-xs text-muted-foreground">
            Choose a git repo or workspace folder on your machine.
          </p>
        </div>

        {recentProjects.length > 0 ? (
          <div className="space-y-3">
            <p className="shell-section-label">Recent projects</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {recentProjects.slice(0, 6).map((path) => (
                <button
                  key={path}
                  type="button"
                  className="shell-surface rounded-xl border px-4 py-3 text-left transition-colors hover:bg-accent/50"
                  onClick={() => onOpenRecent(path)}
                  title={path}
                >
                  <span className="block truncate text-sm font-medium">{projectLabel(path)}</span>
                  <span className="block truncate text-xs text-muted-foreground mt-0.5">{path}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <p className="shell-section-label">Getting started</p>
          <ol className="grid gap-3 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="shell-surface rounded-xl border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                    {i + 1}
                  </span>
                  <step.icon className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{step.title}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
