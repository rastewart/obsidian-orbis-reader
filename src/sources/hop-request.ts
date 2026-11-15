// One request to a source, and nothing after it: a redirect comes back as an answer, never as a second request.
//
// **Why this exists: `requestUrl` follows redirects on the desktop, out of our sight.** Obsidian makes a desktop
// request in its main process with `net.request({ redirect: "follow" })`, written into the app, so a 302 is obeyed
// before Orbis sees anything. Android hands the 302 back instead. Both rules that guard a feed's addresses — a public
// source may not reach a private address (`mayReach`), and a password goes only to the source's own host
// (`sameOrigin`) — are checked by `fetchFollowing` on each hop it is shown, so on the desktop they held for every
// address a feed wrote and for none it redirected to. A public feed that redirected to `192.168.1.1` got its request
// made.
//
// **On the desktop we ask Electron's `net` ourselves, with `redirect: 'manual'`.** It is the same network stack
// `requestUrl` uses there — the system proxy, the keychain's trusted certificates, the same cache — reached through
// `electron.remote`, which Obsidian loads for its own use. Node's `https` would have shown every redirect too, but
// ignores the proxy and the keychain, and a reader whose feeds work everywhere else would find them broken here.
//
// **Measured, not assumed, to be quick enough for a book.** Bytes cross from the main process in chunks of about 1.5 MB; 100 MB over
// the loopback took 87–93 ms this way and 135–346 ms through `requestUrl`.
//
// **Where it is missing, `requestUrl` is used** — on mobile always, where it already returns each redirect, and on a
// desktop whose Obsidian stops loading `electron.remote`, where redirects go unchecked again and the debug log says so.
//
// Book sources only. Orbis's other requests go to addresses it ships or the reader typed, where who chose the address
// is not in question — see docs/design/security.md.

import { Platform, requestUrl } from 'obsidian';

/** What one request got. `tooLarge` is set instead of a body once the answer passed the cap. */
export interface HopAnswer {
  status: number;
  /** Lower-case names, one value each. */
  headers: Record<string, string>;
  body: ArrayBuffer;
  tooLarge: boolean;
}

/** The part of Electron's `net` this uses. */
export interface DesktopNet {
  request(options: { url: string; method: string; redirect: 'manual' }): NetRequest;
}

interface NetRequest {
  on(
    event: 'redirect',
    listener: (status: number, method: string, url: string, headers: Record<string, string | string[]>) => void
  ): this;
  on(event: 'response', listener: (response: NetResponse) => void): this;
  on(event: 'login', listener: (info: unknown, callback: () => void) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  setHeader(name: string, value: string): void;
  abort(): void;
  end(): void;
}

interface NetResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  on(event: 'data', listener: (chunk: Uint8Array) => void): this;
  on(event: 'end' | 'aborted', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

/** Electron's `net`, when this is the desktop app and Obsidian still loads `electron.remote`. */
function desktopNet(): DesktopNet | null {
  if (!Platform.isDesktopApp) return null;
  try {
    const load = (window as unknown as { require?: (id: string) => unknown }).require;
    const net = (load?.('electron') as { remote?: { net?: DesktopNet } } | undefined)?.remote?.net;
    return typeof net?.request === 'function' ? net : null;
  } catch {
    return null;
  }
}

let warnedNoNet = false;

/**
 * GET `url` once. `null` is a timeout; a throw is a host that could not be reached.
 *
 * `net` is a parameter so a test can hand in its own; callers leave it out.
 */
export async function requestHop(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  maxBytes: number,
  log?: (msg: string) => void,
  net: DesktopNet | null = desktopNet()
): Promise<HopAnswer | null> {
  if (net) return viaNet(net, url, headers, timeoutMs, maxBytes);
  if (Platform.isDesktopApp && !warnedNoNet) {
    warnedNoNet = true;
    log?.('electron.remote is not available: redirects are followed unchecked on this desktop');
  }
  const res = await Promise.race([
    requestUrl({ url, method: 'GET', headers, throw: false }),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
  ]);
  if (!res) return null;
  const tooLarge = res.arrayBuffer.byteLength > maxBytes;
  return {
    status: res.status,
    headers: lowerCased(res.headers ?? {}),
    body: tooLarge ? new ArrayBuffer(0) : res.arrayBuffer,
    tooLarge,
  };
}

/**
 * The desktop request. Ends exactly once, and every way of ending stops the request with it.
 *
 * - **A redirect is cancelled and returned** with its target as `location`, for `fetchFollowing` to judge.
 * - **The cap is checked as bytes arrive**, and against a declared length before any do, so an answer too large is
 *   cut off rather than downloaded and then refused.
 * - **The timeout cancels the request.** A race that only stops waiting leaves a book downloading in the background.
 * - **A sign-in challenge is declined**, as `requestUrl` declines it, so a wrong password comes back as the 401 that
 *   carries the server's own message instead of a request left waiting for an answer nobody will give.
 */
function viaNet(
  net: DesktopNet,
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  maxBytes: number
): Promise<HopAnswer | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const req = net.request({ url, method: 'GET', redirect: 'manual' });
    const finish = (answer: HopAnswer | null, error?: Error, cancel = false) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (cancel) {
        try {
          req.abort();
        } catch {
          // Already over; nothing left to stop.
        }
      }
      if (error) reject(error);
      else resolve(answer);
    };
    const timer = window.setTimeout(() => finish(null, undefined, true), timeoutMs);
    const empty = (status: number, head: Record<string, string>, tooLarge = false): HopAnswer => ({
      status,
      headers: head,
      body: new ArrayBuffer(0),
      tooLarge,
    });

    req.on('redirect', (status, _method, target, head) => {
      finish(empty(status, { ...lowerCased(head), location: target }), undefined, true);
    });
    req.on('login', (_info, callback) => callback());
    req.on('error', (error) => finish(null, error));
    req.on('response', (response) => {
      const head = lowerCased(response.headers);
      const declared = Number(head['content-length']);
      if (Number.isFinite(declared) && declared > maxBytes) {
        finish(empty(response.statusCode, head, true), undefined, true);
        return;
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      // **`data` LAST.** Each `on` is a round trip to the main process, and the one for `data` is what starts the
      // bytes flowing: a small answer from a fast server then flows and ENDS there before a later `on('end')` has
      // arrived, and the request waits for an ending that already happened. Gutenberg's search description, 1.5 KB,
      // timed out every time.
      response.on('end', () =>
        finish({ status: response.statusCode, headers: head, body: joined(chunks, size), tooLarge: false })
      );
      response.on('aborted', () => finish(null, new Error('the response was cut off')));
      response.on('error', (error) => finish(null, error));
      response.on('data', (chunk) => {
        size += chunk.byteLength;
        if (size > maxBytes) finish(empty(response.statusCode, head, true), undefined, true);
        else chunks.push(chunk);
      });
    });
    for (const [name, value] of Object.entries(headers)) {
      try {
        req.setHeader(name, value);
      } catch {
        // A header the network stack will not let a caller set — it sets that one itself.
      }
    }
    req.end();
  });
}

function joined(chunks: readonly Uint8Array[], size: number): ArrayBuffer {
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out.buffer;
}

/**
 * Header names in lower case, one value each.
 *
 * The platforms disagree about case (see `headerOf`), and Electron gives a repeated header as an array.
 */
function lowerCased(headers: Record<string, string | string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers))
    out[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  return out;
}
