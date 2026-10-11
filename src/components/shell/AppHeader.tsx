import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ProjectSwitcher } from "@/components/shell/ProjectSwitcher";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { Cloud, Settings } from "lucide-react";
import { pricingUrl, sessionPlan } from "@/lib/license";
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
  const dotClass =
    meta.tone === "ok"
      ? "bg-emerald-500"
      : meta.tone === "warn"
        ? "bg-amber-500"
        : meta.tone === "err"
          ? "bg-red-500"
          : "bg-muted-foreground animate-pulse";

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md">
      <img src="/phonton-logo.png" alt="" className="h-6 w-6" aria-hidden />
      <span className="font-semibold tracking-tight hidden sm:inline">Phonton</span>
      <ProjectSwitcher
        projectPath={projectPath}
        onOpenProject={onOpenProject}
        onOpenRecent={onOpenRecent}
        onClearProject={onClearProject}
      />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/50"
            onClick={
              sidecar.status === "upgrade_required" || sidecar.status === "offline"
                ? onSidecarAction
                : undefined
            }
          >
            <span className={`size-2 rounded-full ${dotClass}`} />
            <span className="hidden md:inline">{meta.label}</span>
          </TooltipTrigger>
          <TooltipContent>{meta.detail}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Badge variant="secondary" className="capitalize hidden lg:inline-flex">
        {sessionPlan()}
      </Badge>
      <div className="flex-1" />
      <Button variant="ghost" size="sm" onClick={onOpenModels}>Local models</Button>
      <Button
        variant="ghost"
        size="sm"
        className="hidden sm:inline-flex"
        onClick={() => {
          const url = pricingUrl();
          if (isTauri()) void openExternal(url);
          else window.open(url, "_blank");
        }}
      >
        <Cloud className="size-4" />
        Cloud
      </Button>
      <Button variant="ghost" size="icon" onClick={onOpenSettings} aria-label="Settings">
        <Settings className="size-4" />
      </Button>
    </header>
  );
}
