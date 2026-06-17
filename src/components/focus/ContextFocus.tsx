import { ScrollArea } from "@/components/ui/scroll-area";
import type { GoalSession } from "@/hooks/useSessions";

type Props = { session: GoalSession | undefined };

export function ContextFocus({ session }: Props) {
  const influence = session?.handoff?.influence ?? session?.globalState?.handoff_packet?.influence;

  if (!influence) {
    return (
      <p className="text-sm text-muted-foreground">
        Context sources (index slices, memory, skills, extensions) appear on the receipt influence summary.
      </p>
    );
  }

  const sections = [
    { label: "Memory", items: influence.memories },
    { label: "Index slices", items: influence.index_slices },
    { label: "Skills", items: influence.skills },
    { label: "Extensions", items: influence.extensions },
  ].filter((s) => s.items.length > 0);

  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground">No influence records for this run.</p>;
  }

  return (
    <ScrollArea className="h-full max-h-[calc(100vh-16rem)]">
      <div className="space-y-4 pr-3 text-sm">
        {sections.map((section) => (
          <section key={section.label}>
            <h3 className="font-medium mb-2">{section.label}</h3>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </ScrollArea>
  );
}
