// A run can be accepted by the engine after the user has already pressed Cancel.
// Keep that intent against the new ID and send it only after the start reply.
export function createPendingLocalStart(id: string) {
  let cancelRequested = false;
  return {
    id,
    get cancelRequested() { return cancelRequested; },
    requestCancel() { cancelRequested = true; },
    admit(
      reply: { id: string },
      cancel: (runId: string) => Promise<{ cancel_requested: boolean }>,
    ): Promise<{ cancel_requested: boolean }> | null {
      if (reply.id !== id) throw new Error("Local engine returned a different run ID; inspect saved evidence before trying again.");
      return cancelRequested ? cancel(id) : null;
    },
  };
}
