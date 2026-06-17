import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText } from "lucide-react";
import type { GoalSession } from "@/hooks/useSessions";

type Props = {
  session: GoalSession | undefined;
  onLoadReview: () => void;
};

export function ContextPanel({ session, onLoadReview }: Props) {
  const receiptJson = session?.receiptJson ?? "{}";

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-border/60 bg-card/30">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 text-sm font-medium">
        <FileText className="size-4" />
        Receipt
      </div>
      <div className="space-y-3 p-4">
        <Button variant="secondary" size="sm" onClick={onLoadReview}>
          Load review
        </Button>
        <ScrollArea className="h-[calc(100vh-12rem)]">
          <pre className="json-block">{receiptJson}</pre>
        </ScrollArea>
      </div>
    </aside>
  );
}
