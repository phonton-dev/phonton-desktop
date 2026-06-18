import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getRecentProjects, projectLabel } from "@/lib/projects";
import { ChevronDown, FolderOpen, FolderX } from "lucide-react";

type Props = {
  projectPath: string | null;
  compact?: boolean;
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  onClearProject?: () => void;
};

export function ProjectSwitcher({
  projectPath,
  compact = false,
  onOpenProject,
  onOpenRecent,
  onClearProject,
}: Props) {
  const recent = getRecentProjects().filter((p) => p !== projectPath);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={compact ? "outline" : "ghost"}
            size={compact ? "sm" : "default"}
            className={
              compact
                ? "w-full justify-between gap-2 font-normal"
                : "h-8 max-w-[220px] justify-start gap-2 px-2 font-normal"
            }
          />
        }
      >
        <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">
          {projectPath ? projectLabel(projectPath) : "No project"}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground ml-auto" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {projectPath ? (
          <>
            <DropdownMenuLabel className="truncate font-normal text-xs text-muted-foreground">
              {projectPath}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onClick={onOpenProject}>
          <FolderOpen className="size-4" />
          Open folder…
        </DropdownMenuItem>
        {recent.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="shell-section-label">Recent</DropdownMenuLabel>
            {recent.slice(0, 8).map((path) => (
              <DropdownMenuItem key={path} onClick={() => onOpenRecent(path)} title={path}>
                <span className="truncate">{projectLabel(path)}</span>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        {projectPath && onClearProject ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onClearProject}>
              <FolderX className="size-4" />
              Close project
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
