import type { GoalSession } from "@/hooks/useSessions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const TABS: { id: FocusView; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "run", label: "Run" },
  { id: "receipt", label: "Receipt" },
  { id: "problems", label: "Problems" },
  { id: "code", label: "Code" },
  { id: "context", label: "Context" },
  { id: "tokens", label: "Tokens" },
  { id: "log", label: "Log" },
];

export function FocusShell({ session, focus, onFocusChange }: Props) {
  return (
    <Tabs
      value={focus}
      onValueChange={(v) => onFocusChange(v as FocusView)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <TabsList className="mx-4 mt-2 h-auto flex-wrap gap-1 bg-transparent p-0">
        {TABS.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="h-7 px-2.5 text-xs data-[state=active]:bg-secondary"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
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
