import { useCallback, useEffect, useState } from "react";
import { api } from "./client.js";

/** GET `path` whenever it changes. Returns { data, loading, error, reload }. Pass null to skip. */
export function useFetch(path) {
  const [state, setState] = useState({ data: null, loading: Boolean(path), error: null });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!path) { setState({ data: null, loading: false, error: null }); return undefined; }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path)
      .then((payload) => !cancelled && setState({ data: payload, loading: false, error: null }))
      .catch((err) => !cancelled && setState({ data: null, loading: false, error: err.message }));
    return () => { cancelled = true; };
  }, [path, tick]);

  return { ...state, reload };
}
