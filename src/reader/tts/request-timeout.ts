// Putting a ceiling on a request that has no way to be cancelled.
//
// **Because `requestUrl` takes no timeout.** Obsidian's HTTP helper exists to bypass CORS, which is what a local
// server on a private hostname needs — but it accepts no deadline and returns nothing to abort with. A server that
// accepts the connection and never answers therefore left a caller awaiting a promise nothing would ever settle: a
// recording run sat at 6% with no error, no notice and nothing further in its log.
//
// Its own module because two unrelated callers need it — the recording pipeline and server voice discovery — and
// the discovery module has no business importing the recording pipeline to get it.

/**
 * Race `work` against a timer, resolving to null when the timer wins.
 *
 * The loser keeps running, because there is nothing to cancel it with: an abandoned request still occupies the
 * server, and its answer is simply dropped. That is the price of the ceiling, and the reason callers set a generous
 * one rather than a tight one.
 *
 * `null` means TIMED OUT and only that — a falsy result from `work` is passed through untouched, so a caller can
 * tell the two apart by identity. A rejection from `work` still reaches the caller's `catch`; a refused connection
 * or a bad certificate must not be flattened into "no answer".
 */
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = window.setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}
