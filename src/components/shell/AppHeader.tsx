import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { Settings } from "lucide-react";
import { pricingUrl, sessionPlan } from "@/lib/license";
import { isTauri } from "@/lib/sidecar";
import type { SidecarState } from "@/hooks/useSidecar";

type Props = {
  sidecar: SidecarState;
  projectPath: string | null;
  onOpenSettings: () => void;
};

export function AppHeader({ sidecar, projectPath, onOpenSettings }: Props) {
  const sidecarLabel =
    sidecar.status === "ready"
      ? `Sidecar v${sidecar.version}`
      : sidecar.status === "offline"
        ? "Sidecar offline"
        : "Connecting…";

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md">
      <img src="/phonton-logo.png" alt="" className="h-6 w-6" aria-hidden />
      <span className="font-semibold tracking-tight">Phonton</span>
      <span
        className={`size-2 rounded-full ${
          sidecar.status === "ready"
            ? "bg-emerald-500"
            : sidecar.status === "offline"
              ? "bg-amber-500"
              : "bg-muted-foreground animate-pulse"
        }`}
        title={sidecarLabel}
      />
      <span className="text-xs text-muted-foreground">{sidecarLabel}</span>
      {projectPath ? (
        <Badge variant="outline" className="max-w-[240px] truncate font-normal">
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
