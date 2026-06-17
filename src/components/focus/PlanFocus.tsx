import { ScrollArea } from "@/components/ui/scroll-area";
import type { GoalSession } from "@/hooks/useSessions";

type Props = { session: GoalSession | undefined };

export function PlanFocus({ session }: Props) {
  const contract = session?.globalState?.goal_contract;
  const plan = session?.planData;

  if (!contract && !plan) {
    return (
      <p className="text-sm text-muted-foreground">
        Preview a plan or run a goal to see the GoalContract and task graph.
      </p>
    );
  }

  return (
    <ScrollArea className="h-full max-h-[calc(100vh-16rem)]">
      <div className="space-y-4 pr-3">
        {contract ? (
          <>
            <section>
              <h3 className="text-sm font-medium mb-2">Goal</h3>
              <p className="text-sm text-muted-foreground">{contract.goal}</p>
            </section>
            <section>
              <h3 className="text-sm font-medium mb-2">Acceptance criteria</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {contract.acceptance_criteria.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </section>
            {contract.assumptions.length > 0 ? (
              <section>
                <h3 className="text-sm font-medium mb-2">Assumptions</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {contract.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {contract.verify_plan.length > 0 ? (
              <section>
                <h3 className="text-sm font-medium mb-2">Verify plan</h3>
                <ul className="space-y-1 text-sm">
                  {contract.verify_plan.map((step) => (
                    <li key={step.name} className="rounded-md border px-3 py-2">
                      {step.name}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
        {plan?.subtasks?.length ? (
          <section>
            <h3 className="text-sm font-medium mb-2">Subtasks ({plan.subtasks.length})</h3>
            <ul className="space-y-2 text-sm">
              {plan.subtasks.map((st, i) => (
                <li key={st.id ?? i} className="rounded-md border px-3 py-2">
                  <span className="font-medium">{st.description ?? st.id}</span>
                  {st.model_tier ? (
                    <span className="ml-2 text-xs text-muted-foreground">{st.model_tier}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </ScrollArea>
  );
}
