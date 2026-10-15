import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ProjectSwitcher } from "@/components/shell/ProjectSwitcher";
import { Glyph } from "@/components/ascii/ascii";
import { isTauri } from "@/lib/sidecar";
import type { SidecarState } from "@/hooks/useSidecar";

type Props = {
  sidecar: SidecarState;
  projectPath: string | null;
  onOpenSettings: () => void;
  onOpenModels: () => void;
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  onClearProject: () => void;
  onSidecarAction?: () => void;
};

function sidecarMeta(sidecar: SidecarState): {
  label: string;
  tone: "ok" | "warn" | "err" | "muted";
  detail: string;
} {
  switch (sidecar.status) {
    case "ready":
      return {
        label: `Engine v${sidecar.version}`,
        tone: "ok",
        detail: `Receipt schema ${sidecar.handoffSchema}`,
      };
    case "upgrade_required":
      return {
        label: "CLI upgrade required",
        tone: "warn",
        detail: sidecar.error,
      };
    case "offline":
      return {
        label: "Engine offline",
        tone: "err",
        detail: isTauri()
          ? sidecar.error
          : "Start `phonton serve` in a terminal. The browser cannot spawn the engine.",
      };
    case "connecting":
      return {
        label: sidecar.message ?? "Connecting…",
        tone: "muted",
        detail: "Starting phonton serve",
      };
    default:
      return { label: "Engine idle", tone: "muted", detail: "" };
  }
}

export function AppHeader({
  sidecar,
  projectPath,
  onOpenSettings,
  onOpenModels,
  onOpenProject,
  onOpenRecent,
  onClearProject,
  onSidecarAction,
}: Props) {
  const meta = sidecarMeta(sidecar);
  const glyph = <Glyph state={meta.tone === "ok" ? "pass" : meta.tone === "warn" ? "warn" : meta.tone === "err" ? "fail" : "busy"} />;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3 sm:gap-3 sm:px-4">
      <span className="shrink-0 text-[15px]">phonton<span className="text-primary" aria-hidden="true">_</span></span>
      <ProjectSwitcher
        projectPath={projectPath}
        onOpenProject={onOpenProject}
        onOpenRecent={onOpenRecent}
        onClearProject={onClearProject}
      />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            className="flex items-center gap-1.5 px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={
              sidecar.status === "upgrade_required" || sidecar.status === "offline"
                ? onSidecarAction
                : undefined
            }
          >
            {glyph}
            <span className="hidden md:inline">{meta.label}</span>
          </TooltipTrigger>
          <TooltipContent>{meta.detail}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="flex-1" />
      <Button variant="ghost" size="sm" className="shrink-0" onClick={onOpenModels}>Local models</Button>
      <Button variant="ghost" size="sm" className="shrink-0" onClick={onOpenSettings}>Settings</Button>
    </header>
  );
}
