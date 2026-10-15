import { Button } from "@/components/ui/button";
import type { SidecarState } from "@/hooks/useSidecar";
import { MIN_SERVE_CLI_VERSION } from "@/lib/cli-version";
import { projectLabel } from "@/lib/projects";
import { isTauri } from "@/lib/sidecar";
import { AsciiLogo, Frame, Glyph } from "@/components/ascii/ascii";

type Props = {
  recentProjects: string[];
  sidecar: SidecarState;
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  onSidecarAction?: () => void;
};

const STEPS = [
  { title: "Open repo", detail: "Pick a local folder Phonton can index and verify against." },
  { title: "Describe a goal", detail: "State a merge-bound outcome, not a chat prompt." },
  { title: "Review the receipt", detail: "See the diff, the checks that ran, tokens and cost before anything lands." },
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
          <AsciiLogo className="mb-4" sweep={sidecar.status === "ready" ? sidecar.version : undefined} />
          <h1 className="text-xl font-medium">Open a project to start</h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Phonton is a local-first ADE. Open your repo, describe a goal, and
            review a verified receipt: models, checks, and cost versus frontier.
          </p>
          {!isTauri() ? (
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Browser preview cannot spawn the engine. Start <code className="font-mono">phonton serve</code>{" "}
              yourself, or use the Tauri app.
            </p>
          ) : null}
        </div>

        {sidecarIssue ? (
          <div role="alert" className="border border-warn/40 px-4 py-3 text-sm">
            {sidecar.status === "upgrade_required" ? (
              <p className="text-warn">
                <Glyph state="warn" /> Engine needs phonton-cli v{MIN_SERVE_CLI_VERSION}+.{" "}
                <button type="button" className="underline" onClick={onSidecarAction}>
                  Upgrade CLI
                </button>
              </p>
            ) : (
              <p className="text-warn">
                <Glyph state="fail" /> {sidecar.error}{" "}
                <button type="button" className="underline" onClick={onSidecarAction}>
                  Retry engine
                </button>
              </p>
            )}
          </div>
        ) : null}

        <Frame title="project" className="space-y-3 text-center">
          <Button size="lg" onClick={onOpenProject}>Open project folder →</Button>
          <p className="text-xs text-muted-foreground">
            Choose a git repo or workspace folder on your machine.
          </p>
        </Frame>

        {recentProjects.length > 0 ? (
          <Frame title="recent projects">
            <div className="grid gap-2 sm:grid-cols-2">
              {recentProjects.slice(0, 6).map((path) => (
                <button
                  key={path}
                  type="button"
                  className="px-3 py-2 text-left hover:bg-accent"
                  onClick={() => onOpenRecent(path)}
                  title={path}
                >
                  <span className="block truncate text-sm font-medium">{projectLabel(path)}</span>
                  <span className="block truncate text-xs text-muted-foreground mt-0.5">{path}</span>
                </button>
              ))}
            </div>
          </Frame>
        ) : null}

        <Frame title="getting started">
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="space-y-1">
                <p className="text-sm font-medium">
                  <span className="text-primary tabular-nums">{i + 1}.</span> {step.title}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.detail}</p>
              </li>
            ))}
          </ol>
        </Frame>
      </div>
    </div>
  );
}
