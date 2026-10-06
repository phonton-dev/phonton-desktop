type ShellChild = { kill: () => Promise<void> };

/** Replace the Unix wrapper so Desktop tracks and stops the actual CLI process. */
export function unixServeArgs(command: string): string[] {
  if (!command || command.includes("\0")) throw new Error("Invalid local engine command");
  return ["-c", `exec '${command.replace(/'/g, "'\\''")}' serve`];
}
type ShellCommand<T extends ShellChild> = {
  on: (event: "close", listener: () => void) => unknown;
  spawn: () => Promise<T>;
};

/** Clear only the shell child that actually exited, including fast exits. */
export async function spawnObservedShellChild<T extends ShellChild>(
  command: ShellCommand<T>,
  current: () => ShellChild | null,
  setCurrent: (child: ShellChild | null) => void,
): Promise<void> {
  let closed = false;
  let spawned: T | null = null;
  command.on("close", () => {
    closed = true;
    if (current() === spawned) setCurrent(null);
  });
  spawned = await command.spawn();
  if (!closed) setCurrent(spawned);
}
