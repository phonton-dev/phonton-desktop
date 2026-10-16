import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";

/** One palette entry. `keywords` widen the fuzzy match beyond the label. */
export type CommandAction = { id: string; group: string; label: string; shortcut?: string; keywords?: string[]; disabled?: boolean; run: () => void };

/** Ctrl+K command menu: every workbench action reachable from the keyboard. */
export function CommandMenu({ open, onOpenChange, actions }: { open: boolean; onOpenChange: (open: boolean) => void; actions: CommandAction[] }) {
  const groups = [...new Set(actions.map(action => action.group))];
  return <CommandDialog open={open} onOpenChange={onOpenChange} title="Commands" description="Search for a workbench command" className="lw-command">
    <Command>
      <CommandInput placeholder="Type a command…" />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>
        {groups.map(group => <CommandGroup key={group} heading={group}>
          {actions.filter(action => action.group === group).map(action => <CommandItem key={action.id} value={action.label} keywords={[group, ...(action.keywords ?? [])]} disabled={action.disabled}
            onSelect={() => { onOpenChange(false); action.run(); }}>
            {action.label}{action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
          </CommandItem>)}
        </CommandGroup>)}
      </CommandList>
    </Command>
  </CommandDialog>;
}
