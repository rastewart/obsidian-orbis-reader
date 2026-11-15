// The desktop request path: a redirect comes back to Orbis instead of being followed by Electron, so the two rules on a
// feed's addresses — no private address from a public source, no password to another host — hold on every hop.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requestUrl = vi.hoisted(() => vi.fn());
vi.mock('obsidian', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  requestUrl,
  Platform: { isDesktopApp: true },
}));

import type { BookSource } from '../settings';
import { fetchBook, fetchSourceBody } from '../sources/client';
import { type DesktopNet, requestHop } from '../sources/hop-request';

type Listener = (...args: unknown[]) => void;

/** One request as the fake network saw it. */
interface Call {
  url: string;
  redirect: string;
  headers: Record<string, string>;
  aborted: boolean;
}

/** What the server does with a request: emit events on it, as Electron's `net` would. */
type Script = (url: string, emit: (event: string, ...args: unknown[]) => void) => void;

function fakeNet(script: Script): { net: DesktopNet; calls: Call[] } {
  const calls: Call[] = [];
  const net = {
    request(options: { url: string; redirect: string }) {
      const listeners: Record<string, Listener> = {};
      const call: Call = { url: options.url, redirect: options.redirect, headers: {}, aborted: false };
      calls.push(call);
      const req = {
        on(event: string, listener: Listener) {
          listeners[event] = listener;
          return req;
        },
        setHeader(name: string, value: string) {
          call.headers[name] = value;
        },
        abort() {
          call.aborted = true;
        },
        end() {
          queueMicrotask(() => script(options.url, (event, ...args) => listeners[event]?.(...args)));
        },
      };
      return req;
    },
  } as unknown as DesktopNet;
  return { net, calls };
}

/**
 * A response object that delivers `chunks` and ends — the moment a `data` listener is added, as a stream in the main
 * process does when the whole answer is already there. A listener added after that has missed it.
 */
function respond(
  emit: (event: string, ...args: unknown[]) => void,
  status: number,
  headers: Record<string, string | string[]>,
  chunks: string[] = []
): void {
  const listeners: Record<string, Listener> = {};
  const response = {
    statusCode: status,
    headers,
    on(event: string, listener: Listener) {
      listeners[event] = listener;
      if (event === 'data') {
        for (const chunk of chunks) listener(new TextEncoder().encode(chunk));
        listeners.end?.();
      }
      return response;
    },
  };
  emit('response', response);
}

const feed = '<feed xmlns="http://www.w3.org/2005/Atom"><title>F</title></feed>';

describe('requestHop on the desktop', () => {
  it('returns a redirect rather than following it, and cancels the request', async () => {
    const { net, calls } = fakeNet((_url, emit) =>
      emit('redirect', 302, 'GET', 'http://192.168.1.1/opds', { Location: 'http://192.168.1.1/opds' })
    );
    const got = await requestHop('https://httpbin.org/redirect-to', {}, 1000, 100, undefined, net);
    expect(got?.status).toBe(302);
    expect(got?.headers.location).toBe('http://192.168.1.1/opds');
    expect(calls).toEqual([{ url: 'https://httpbin.org/redirect-to', redirect: 'manual', headers: {}, aborted: true }]);
  });

  it('joins the body, lower-cases header names, and joins a repeated header', async () => {
    const { net } = fakeNet((_url, emit) =>
      respond(emit, 200, { 'Content-Type': 'application/atom+xml', Vary: ['Accept', 'Cookie'] }, ['ab', 'cd'])
    );
    const got = await requestHop('https://a.example/', {}, 1000, 100, undefined, net);
    expect(new TextDecoder().decode(got?.body)).toBe('abcd');
    expect(got?.headers).toEqual({ 'content-type': 'application/atom+xml', vary: 'Accept, Cookie' });
    expect(got?.tooLarge).toBe(false);
  });

  it('cuts off an answer that passes the cap as it arrives', async () => {
    const { net, calls } = fakeNet((_url, emit) => respond(emit, 200, {}, ['12345', '67890']));
    const got = await requestHop('https://a.example/', {}, 1000, 8, undefined, net);
    expect(got?.tooLarge).toBe(true);
    expect(got?.body.byteLength).toBe(0);
    expect(calls[0].aborted).toBe(true);
  });

  it('refuses a declared length over the cap before any bytes arrive', async () => {
    const { net, calls } = fakeNet((_url, emit) => respond(emit, 200, { 'Content-Length': '9000' }, []));
    const got = await requestHop('https://a.example/', {}, 1000, 8, undefined, net);
    expect(got?.tooLarge).toBe(true);
    expect(calls[0].aborted).toBe(true);
  });

  it('cancels the request when it times out', async () => {
    vi.useFakeTimers();
    try {
      const { net, calls } = fakeNet(() => {});
      const pending = requestHop('https://a.example/', {}, 1000, 100, undefined, net);
      await vi.advanceTimersByTimeAsync(1001);
      expect(await pending).toBeNull();
      expect(calls[0].aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('declines a sign-in challenge, so the 401 comes back with its realm', async () => {
    const answer = vi.fn();
    const { net } = fakeNet((_url, emit) => {
      emit('login', {}, answer);
      respond(emit, 401, { 'WWW-Authenticate': 'Basic realm="Members only"' });
    });
    const got = await requestHop('https://a.example/', {}, 1000, 100, undefined, net);
    expect(answer).toHaveBeenCalledWith();
    expect(got?.status).toBe(401);
    expect(got?.headers['www-authenticate']).toBe('Basic realm="Members only"');
  });

  it('rejects when the host cannot be reached', async () => {
    const { net } = fakeNet((_url, emit) => emit('error', new Error('net::ERR_NAME_NOT_RESOLVED')));
    await expect(requestHop('https://nothing.invalid/', {}, 1000, 100, undefined, net)).rejects.toThrow(
      'ERR_NAME_NOT_RESOLVED'
    );
  });
});

describe('a source on the desktop', () => {
  const win = window as unknown as { require?: (id: string) => unknown };
  let calls: Call[] = [];
  const useNet = (script: Script) => {
    const fake = fakeNet(script);
    calls = fake.calls;
    win.require = (id) => (id === 'electron' ? { remote: { net: fake.net } } : undefined);
  };
  const app = { secretStorage: { getSecret: (id: string) => (id.endsWith('-username') ? 'me' : 'pw') } };
  const source = (url: string) => ({ id: 'test', name: 'Test', url }) as BookSource;

  beforeEach(() => requestUrl.mockReset());
  afterEach(() => {
    win.require = undefined;
  });

  // The bug: Electron followed this redirect itself, so the request to 192.168.1.1 was made and Orbis never knew.
  it('refuses a public source that redirects into the home network, without requesting it', async () => {
    useNet((_url, emit) => emit('redirect', 302, 'GET', 'http://192.168.1.1/opds', {}));
    const log: string[] = [];
    const got = await fetchSourceBody(app, source('https://httpbin.org/'), 'https://httpbin.org/redirect-to', (m) =>
      log.push(m)
    );
    expect(got).toEqual({ ok: false, reason: 'private-address' });
    expect(calls.map((c) => c.url)).toEqual(['https://httpbin.org/redirect-to']);
    expect(log).toContain('302 → http://192.168.1.1/opds');
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it('sends the password to the source, and not to the host it redirects to', async () => {
    useNet((url, emit) =>
      url.startsWith('https://books.example/')
        ? emit('redirect', 302, 'GET', 'https://mirror.example/1.epub', {})
        : respond(emit, 200, { 'Content-Type': 'application/epub+zip' }, ['PK'])
    );
    const got = await fetchBook(app, source('https://books.example/opds'), 'https://books.example/1.epub', 100);
    expect(got.ok).toBe(true);
    expect(calls.map((c) => [c.url, 'Authorization' in c.headers])).toEqual([
      ['https://books.example/1.epub', true],
      ['https://mirror.example/1.epub', false],
    ]);
  });

  it('follows a redirect within the source and reads the feed it ends at', async () => {
    useNet((url, emit) =>
      url.startsWith('http://')
        ? emit('redirect', 301, 'GET', url.replace('http://', 'https://'), {})
        : respond(emit, 200, {}, [feed])
    );
    const got = await fetchSourceBody(app, source('http://books.example/opds'), 'http://books.example/opds');
    expect(got).toEqual({ ok: true, text: feed, url: 'https://books.example/opds' });
  });

  it('reports a feed over the cap as too large', async () => {
    useNet((_url, emit) => respond(emit, 200, { 'Content-Length': String(9 * 1024 * 1024) }));
    const got = await fetchSourceBody(app, source('https://books.example/opds'), 'https://books.example/opds');
    expect(got).toEqual({ ok: false, reason: 'too-large' });
  });

  it('falls back to requestUrl when electron.remote is gone, and says so in the log', async () => {
    requestUrl.mockResolvedValue({ status: 200, headers: {}, arrayBuffer: new TextEncoder().encode(feed).buffer });
    const log: string[] = [];
    const got = await fetchSourceBody(app, source('https://books.example/opds'), 'https://books.example/opds', (m) =>
      log.push(m)
    );
    expect(got.ok).toBe(true);
    expect(requestUrl).toHaveBeenCalledOnce();
    expect(log).toContain('electron.remote is not available: redirects are followed unchecked on this desktop');
  });
});
