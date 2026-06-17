import { Button } from "@/components/ui/button";
import { ReceiptFocus } from "@/components/focus/ReceiptFocus";
import type { GoalSession } from "@/hooks/useSessions";
import { FileText } from "lucide-react";

type Props = {
  session: GoalSession | undefined;
  onLoadReview: () => void;
};

export function ContextPanel({ session, onLoadReview }: Props) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-border/60 bg-card/30">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="size-4" />
          Receipt
        </div>
        <Button variant="secondary" size="sm" onClick={onLoadReview}>
          Refresh
        </Button>
      </div>
      <div className="min-h-0 flex-1 p-4">
        <ReceiptFocus session={session} compact />
      </div>
    </aside>
  );
}
