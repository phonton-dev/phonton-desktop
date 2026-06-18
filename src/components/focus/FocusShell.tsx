import { useEffect, useState } from "react";
import type { GoalSession } from "@/hooks/useSessions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown } from "lucide-react";
import { PlanFocus } from "./PlanFocus";
import { RunFocus } from "./RunFocus";
import { ReceiptFocus } from "./ReceiptFocus";
import { ProblemsFocus } from "./ProblemsFocus";
import { CodeFocus } from "./CodeFocus";
import { ContextFocus } from "./ContextFocus";
import { TokensFocus } from "./TokensFocus";
import { LogFocus } from "./LogFocus";

export type FocusView =
  | "plan"
  | "run"
  | "receipt"
  | "problems"
  | "code"
  | "context"
  | "tokens"
  | "log";

type Props = {
  session: GoalSession | undefined;
  focus: FocusView;
  onFocusChange: (view: FocusView) => void;
};

const PRIMARY_TABS: { id: FocusView; label: string }[] = [
  { id: "run", label: "Run" },
  { id: "plan", label: "Plan" },
  { id: "receipt", label: "Receipt" },
  { id: "problems", label: "Problems" },
];

const SECONDARY_TABS: { id: FocusView; label: string }[] = [
  { id: "code", label: "Code" },
  { id: "context", label: "Context" },
  { id: "tokens", label: "Tokens" },
  { id: "log", label: "Log" },
];

const ALL_VIEWS = new Set<FocusView>([
  ...PRIMARY_TABS.map((t) => t.id),
  ...SECONDARY_TABS.map((t) => t.id),
]);

export function FocusShell({ session, focus, onFocusChange }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const isSecondary = SECONDARY_TABS.some((t) => t.id === focus);
  const secondaryLabel = SECONDARY_TABS.find((t) => t.id === focus)?.label ?? "More";

  useEffect(() => {
    if (session?.statusTone === "destructive" && !session.running) {
      onFocusChange("problems");
    } else if (session?.statusTone === "success" && session.handoff && !session.running) {
      onFocusChange("receipt");
    }
  }, [session?.statusTone, session?.handoff, session?.running, session?.id, onFocusChange]);

  return (
    <Tabs
      value={focus}
      onValueChange={(v) => {
        if (ALL_VIEWS.has(v as FocusView)) onFocusChange(v as FocusView);
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="mx-4 mt-2 flex flex-wrap items-center gap-1">
        <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
          {PRIMARY_TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="h-7 px-2.5 text-xs data-[state=active]:bg-secondary"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
          <DropdownMenuTrigger
            render={
              <Button
                variant={isSecondary ? "secondary" : "ghost"}
                size="sm"
                className="h-7 gap-1 px-2.5 text-xs"
              />
            }
          >
            {isSecondary ? secondaryLabel : "More"}
            <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SECONDARY_TABS.map((tab) => (
              <DropdownMenuItem
                key={tab.id}
                onClick={() => {
                  onFocusChange(tab.id);
                  setMoreOpen(false);
                }}
              >
                {tab.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TabsContent value="plan" className="min-h-0 flex-1 px-4 pb-4 mt-2">
        <PlanFocus session={session} />
      </TabsContent>
      <TabsContent value="run" className="min-h-0 flex-1 px-4 pb-4 mt-2">
        <RunFocus session={session} />
      </TabsContent>
      <TabsContent value="receipt" className="min-h-0 flex-1 px-4 pb-4 mt-2">
        <ReceiptFocus session={session} />
      </TabsContent>
      <TabsContent value="problems" className="min-h-0 flex-1 px-4 pb-4 mt-2">
        <ProblemsFocus session={session} />
      </TabsContent>
      <TabsContent value="code" className="min-h-0 flex-1 px-4 pb-4 mt-2">
        <CodeFocus session={session} />
      </TabsContent>
      <TabsContent value="context" className="min-h-0 flex-1 px-4 pb-4 mt-2">
        <ContextFocus session={session} />
      </TabsContent>
      <TabsContent value="tokens" className="min-h-0 flex-1 px-4 pb-4 mt-2">
        <TokensFocus session={session} />
      </TabsContent>
      <TabsContent value="log" className="min-h-0 flex-1 px-4 pb-4 mt-2">
        <LogFocus session={session} />
      </TabsContent>
    </Tabs>
  );
}
