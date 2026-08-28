/**
 * Wraps `fetch` with a hard timeout for the Supabase clients below. Without
 * this, a stuck query (Supabase under load, a connection pool blip) just
 * hangs until Vercel's own function ceiling kills the whole invocation —
 * 300 seconds burned, and a bare gateway-timeout page instead of a
 * catchable error our own error boundary can show. Combines with any
 * signal supabase-js already passes in, rather than replacing it, so
 * nothing else that relies on that signal (e.g. `.abortSignal()` on a
 * query) breaks.
 */
export function timeoutFetch(timeoutMs: number) {
  return (input: RequestInfo | URL, init: RequestInit = {}) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    return fetch(input, { ...init, signal });
  };
}
