import { Button } from "@/components/ui/button";
import { ReceiptFocus } from "@/components/focus/ReceiptFocus";
import type { FocusView } from "@/components/focus/FocusShell";
import type { GoalSession } from "@/hooks/useSessions";
import { Files } from "lucide-react";

type Props = {
  session: GoalSession | undefined;
  onLoadReview: () => void;
  activeFocus?: FocusView;
};

export function ContextPanel({ session, onLoadReview, activeFocus }: Props) {
  const receiptActiveInMain = activeFocus === "receipt";

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-border/60 bg-card/30">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Files className="size-4" />
          Files and checks
        </div>
        <Button variant="secondary" size="sm" onClick={onLoadReview}>
          Refresh
        </Button>
      </div>
      {receiptActiveInMain ? (
        <p className="border-b border-border/40 px-4 py-2 text-[11px] text-muted-foreground">
          Cost and route stay on the strip and the Receipt tab. This panel lists files and checks only.
        </p>
      ) : (
        <p className="border-b border-border/40 px-4 py-2 text-[11px] text-muted-foreground">
          Task, models, cost, and saved vs frontier stay on the strip.
        </p>
      )}
      <div className="min-h-0 flex-1 p-4 shell-muted-scroll overflow-auto">
        <ReceiptFocus session={session} compact filesOnly />
      </div>
    </aside>
  );
}
