import { useCallback, useRef, useState } from "react";
import { post } from "../api";

export interface Mutation<A extends unknown[]> {
  run: (...args: A) => void;
  busy: boolean;
  error: Error | null;
}

/**
 * Runs a write (POST, PATCH, DELETE) with a busy flag and a visible error. A second run
 * while one is in flight is ignored, so a double click never sends the request twice.
 * `onDone` runs only after success, so a failed save never closes the form that holds it.
 */
export function useMutation<A extends unknown[]>(
  fn: (...args: A) => Promise<unknown>,
  onDone?: () => void,
): Mutation<A> {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const inFlight = useRef(false);
  const run = useCallback(
    (...args: A) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      fn(...args)
        .then(() => onDone?.())
        .catch((e: Error) => setError(e))
        .finally(() => {
          inFlight.current = false;
          setBusy(false);
        });
    },
    [fn, onDone],
  );
  return { run, busy, error };
}

export function usePost(path: string, onDone?: () => void): Mutation<[body?: object]> {
  return useMutation(
    useCallback((body?: object) => post(path, body), [path]),
    onDone,
  );
}
