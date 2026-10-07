const focusRefreshInterval = 5 * 60 * 1000;

// Commands already return current state. Focus is only a bounded fallback for
// changes from another tab/device; it must not turn tab switching into polling.
export function createFocusRefresh(
  reload: () => Promise<void>,
  blocked: () => boolean,
  now: () => number = Date.now,
) {
  let lastAttempt = -Infinity;
  let pending = false;
  return {
    markFresh() {
      lastAttempt = now();
    },
    async refresh() {
      if (pending || blocked() || now() - lastAttempt < focusRefreshInterval)
        return;
      lastAttempt = now();
      pending = true;
      try {
        await reload();
      } finally {
        pending = false;
      }
    },
  };
}
