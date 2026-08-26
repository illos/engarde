import { useState } from 'react';
import { errorMessage } from '../campaigns/AppScreen';

/** Shared dispatch plumbing for Table panels: serialize one in-flight
 * mutation, surface its error, expose the busy flag for affordances. */
export function useRun() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    action()
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  return { run, error, busy };
}
