// The engine exposes one latest operation. A completed operation can be
// replaced before the next read, so callers must keep the ID they started.
export function matchingModelOperation<T extends { id: string }>(expectedId: string, observed: T): T | null {
  return expectedId && observed.id === expectedId ? observed : null;
}

export function canCancelModelOperation(startedId: string | null, observed: { id: string; running: boolean; cancelable: boolean }): boolean {
  return observed.running && observed.cancelable && matchingModelOperation(startedId ?? "", observed) !== null;
}

const OWNED_OPERATION_KEY = "phonton.models.ownedOperationId";
type OperationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readOwnedModelOperation(storage: OperationStorage): string | null {
  try {
    return storage.getItem(OWNED_OPERATION_KEY) || null;
  } catch {
    return null;
  }
}

export function writeOwnedModelOperation(storage: OperationStorage, id: string | null): void {
  try {
    if (id) storage.setItem(OWNED_OPERATION_KEY, id);
    else storage.removeItem(OWNED_OPERATION_KEY);
  } catch {
    // Storage may be disabled; the current view still tracks its own ID.
  }
}
