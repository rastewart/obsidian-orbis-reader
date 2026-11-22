// A small Chrome DevTools Protocol client for the Obsidian window the end-to-end tests drive.
//
// **Why not Playwright or WebdriverIO.** Both can drive Electron, and both bring a browser download, a driver and a
// test framework the repository would then keep in step with Obsidian. What the tests need is narrower: run code in
// the page, press keys, take a screenshot and hear about errors. CDP does all four over one WebSocket, and Node has
// `fetch` and `WebSocket` built in, so this file is the whole dependency.

import { writeFileSync } from 'node:fs';

interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message: string };
}

interface RemoteObject {
  type: string;
  value?: unknown;
  description?: string;
}

interface ExceptionDetails {
  text: string;
  exception?: RemoteObject;
}

/** An error the page reported while a test ran: an uncaught exception or a `console.error`. */
export interface PageError {
  kind: 'exception' | 'console';
  text: string;
}

export class Page {
  private nextId = 0;
  private readonly pending = new Map<number, (msg: CdpMessage) => void>();
  /** Every error since the last `takeErrors()`. */
  private errors: PageError[] = [];

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (event) => this.onMessage(JSON.parse(String(event.data)) as CdpMessage));
  }

  /** Connects to Obsidian's main window, the page whose URL ends in `index.html`. */
  static async connect(port: number): Promise<Page> {
    const targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as {
      type: string;
      url: string;
      webSocketDebuggerUrl: string;
    }[];
    const target = targets.find((t) => t.type === 'page' && t.url.endsWith('index.html'));
    if (!target) throw new Error('Obsidian has no main window yet');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('could not connect to Obsidian')), { once: true });
    });
    const page = new Page(ws);
    await page.send('Runtime.enable');
    await page.send('Page.enable');
    return page;
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result ?? {})));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Runs `fn` in the page with `args`, and returns what it returns.
   *
   * `fn` crosses as source text, so it can use only its arguments and the page's globals (`app`, `document`), never
   * a variable from the test file. The arguments cross as JSON.
   *
   * **`__name`.** tsx compiles the test files with esbuild's `keepNames`, which wraps every inner function in
   * `__name(fn, "name")`. That helper exists in Node, not in the page, so a no-op one is defined around the call.
   */
  async run<A extends unknown[], R>(fn: (...args: A) => R | Promise<R>, ...args: A): Promise<R> {
    const expression = `(() => { const __name = (f) => f; return (${fn.toString()})(...${JSON.stringify(args)}); })()`;
    const res = (await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as { result: RemoteObject; exceptionDetails?: ExceptionDetails };
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    }
    return res.result.value as R;
  }

  /** A real key press, as a person's would arrive: Obsidian closes a dialog on Escape this way. */
  async press(key: 'Escape' | 'Enter' | 'ArrowRight' | 'ArrowLeft'): Promise<void> {
    const codes = { Escape: 27, Enter: 13, ArrowRight: 39, ArrowLeft: 37 } as const;
    const base = { key, code: key, windowsVirtualKeyCode: codes[key] };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  async screenshot(path: string): Promise<void> {
    const res = (await this.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
    writeFileSync(path, Buffer.from(res.data, 'base64'));
  }

  /** The errors since the last call, and a fresh list for the next test. */
  takeErrors(): PageError[] {
    const taken = this.errors;
    this.errors = [];
    return taken;
  }

  close(): void {
    this.ws.close();
  }

  private onMessage(msg: CdpMessage): void {
    if (msg.id !== undefined) {
      this.pending.get(msg.id)?.(msg);
      this.pending.delete(msg.id);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const details = (msg.params as { exceptionDetails: ExceptionDetails }).exceptionDetails;
      this.errors.push({ kind: 'exception', text: details.exception?.description ?? details.text });
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const params = msg.params as { type: string; args: RemoteObject[] };
      if (params.type === 'error') {
        const text = params.args.map((a) => (a.value !== undefined ? String(a.value) : a.description)).join(' ');
        this.errors.push({ kind: 'console', text });
      }
    }
  }
}
