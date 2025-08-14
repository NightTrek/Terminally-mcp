/**
 * A simple per-key async mutex to serialize operations targeting the same resource (e.g., a tmux pane).
 *
 * Usage:
 *   const mutex = new KeyMutex();
 *   await mutex.runExclusive(windowId, async () => {
 *     // perform tmux send-keys + capture-pane safely for this window
 *   });
 */
export class KeyMutex {
  private tails = new Map<string, Promise<void>>();

  /**
   * Run the provided async function exclusively for the given key.
   * Calls for the same key will execute sequentially in FIFO order.
   */
  async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();

    let resolveNext: () => void;
    const next = new Promise<void>((res) => {
      resolveNext = res;
    });

    // Chain next after prev and store as new tail
    this.tails.set(
      key,
      prev.then(() => next)
    );

    // Wait for prior tasks for this key to finish
    await prev;
    try {
      return await fn();
    } finally {
      // Release this task
      resolveNext!();
      // Best-effort cleanup: if no further tasks were queued, remove the tail
      // (Not strictly necessary, but keeps the map small in steady state)
      Promise.resolve().then(() => {
        if (this.tails.get(key) === next) {
          this.tails.delete(key);
        }
      });
    }
  }
}
