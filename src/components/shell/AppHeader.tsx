import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { Settings } from "lucide-react";
import { pricingUrl, sessionPlan } from "@/lib/license";
import { isTauri } from "@/lib/sidecar";
import type { SidecarState } from "@/hooks/useSidecar";

type Props = {
  sidecar: SidecarState;
  projectPath: string | null;
  onOpenSettings: () => void;
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
        label: `Sidecar v${sidecar.version}`,
        tone: "ok",
        detail: `Handoff schema ${sidecar.handoffSchema}`,
      };
    case "upgrade_required":
      return {
        label: "CLI upgrade required",
        tone: "warn",
        detail: sidecar.error,
      };
    case "offline":
      return { label: "Sidecar offline", tone: "err", detail: sidecar.error };
    case "connecting":
      return {
        label: sidecar.message ?? "Connecting…",
        tone: "muted",
        detail: "Starting phonton serve",
      };
    default:
      return { label: "Sidecar idle", tone: "muted", detail: "" };
  }
}

export function AppHeader({ sidecar, projectPath, onOpenSettings, onSidecarAction }: Props) {
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
      <span className="font-semibold tracking-tight">Phonton</span>
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
            {meta.label}
          </TooltipTrigger>
          <TooltipContent>{meta.detail}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {projectPath ? (
        <Badge variant="outline" className="max-w-[240px] truncate font-normal" title={projectPath}>
          {projectPath}
        </Badge>
      ) : (
        <Badge variant="secondary" className="font-normal">
          No project
        </Badge>
      )}
      <Badge variant="secondary" className="capitalize">
        {sessionPlan()}
      </Badge>
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          const url = pricingUrl();
          if (isTauri()) void openExternal(url);
          else window.open(url, "_blank");
        }}
      >
        Cloud plans
      </Button>
      <Button variant="ghost" size="icon" onClick={onOpenSettings} aria-label="Settings">
        <Settings className="size-4" />
      </Button>
    </header>
  );
}
