// Where a book source's password is allowed to go.
//
// `sameOrigin` is tested on its own in sources.test.ts. What is tested HERE is which URL the comparison is anchored
// to: a correct comparison asked the wrong question still sends the password somewhere it should not go.
//
// Every URL that reaches `fetchSourceBody` or `fetchBook` came out of a feed — `resolveOpdsHref` builds browse
// targets and acquisition links from hrefs the catalog wrote. So these drive the real functions through a stubbed
// `requestUrl` and assert on the headers that would have gone out.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookSource } from '../settings';

const requestUrl = vi.hoisted(() => vi.fn());
// Not the desktop app, so requests take the `requestUrl` path; the desktop's own is in hop-request.test.ts.
vi.mock('obsidian', () => ({ requestUrl, Platform: { isDesktopApp: false } }));

const { fetchBook, fetchSourceBody } = await import('../sources/client');

/** A source whose configured home is `books.example`, with a username and password on this device. */
const SOURCE: BookSource = {
  id: 'membership',
  name: 'A membership catalog',
  url: 'https://books.example/opds',
  enabled: true,
  builtin: false,
};

const app = {
  secretStorage: {
    getSecret: (id: string) => (id.endsWith('-username') ? 'reader' : id.endsWith('-password') ? 'hunter2' : null),
  },
};

/** The Authorization header sent on the request to `url`, or undefined. */
function authSentTo(url: string): string | undefined {
  const call = requestUrl.mock.calls.find(([opts]) => (opts as { url: string }).url === url);
  return (call?.[0] as { headers?: Record<string, string> } | undefined)?.headers?.Authorization;
}

const ok = (body = '<feed xmlns="http://www.w3.org/2005/Atom"><title>t</title></feed>') => ({
  status: 200,
  text: body,
  arrayBuffer: new TextEncoder().encode(body).buffer,
  headers: {},
});

beforeEach(() => {
  requestUrl.mockReset();
});

describe('a credential goes to its own source and nowhere else', () => {
  it('sends it when the URL is within the source', async () => {
    requestUrl.mockResolvedValue(ok());
    await fetchSourceBody(app, SOURCE, 'https://books.example/opds/page2');
    // `hunter2` base64-encoded with its username, i.e. the credential really is on the wire.
    expect(authSentTo('https://books.example/opds/page2')).toBe(`Basic ${btoa('reader:hunter2')}`);
  });

  /**
   * **The failure this guards against.** A feed names any URL it likes, so a check that compares the request
   * against itself passes by construction on the first hop, and the password goes wherever the catalog points.
   */
  it('withholds it from a host the FEED named, not just from a redirect', async () => {
    requestUrl.mockResolvedValue(ok());
    await fetchSourceBody(app, SOURCE, 'https://attacker.example/collect');
    expect(authSentTo('https://attacker.example/collect')).toBeUndefined();
  });

  it('withholds it from a downgrade to http on the same machine', async () => {
    requestUrl.mockResolvedValue(ok());
    await fetchSourceBody(app, SOURCE, 'http://books.example/opds/page2');
    expect(authSentTo('http://books.example/opds/page2')).toBeUndefined();
  });

  it('withholds it from a lookalike subdomain', async () => {
    requestUrl.mockResolvedValue(ok());
    await fetchSourceBody(app, SOURCE, 'https://books.example.attacker.example/x');
    expect(authSentTo('https://books.example.attacker.example/x')).toBeUndefined();
  });

  /** An acquisition link is the same shape of risk as a feed link, and takes the same route. */
  it('withholds it from an off-site download link', async () => {
    requestUrl.mockResolvedValue({ status: 200, arrayBuffer: new ArrayBuffer(8), headers: {} });
    await fetchBook(app, SOURCE, 'https://cdn.attacker.example/book.epub', 1024);
    expect(authSentTo('https://cdn.attacker.example/book.epub')).toBeUndefined();
  });

  it('still sends it on a download from the source itself', async () => {
    requestUrl.mockResolvedValue({ status: 200, arrayBuffer: new ArrayBuffer(8), headers: {} });
    await fetchBook(app, SOURCE, 'https://books.example/get/1.epub', 1024);
    expect(authSentTo('https://books.example/get/1.epub')).toBe(`Basic ${btoa('reader:hunter2')}`);
  });
});

describe('a redirect cannot walk a credential off the source', () => {
  it('drops it at the hop that leaves, and does not pick it up again', async () => {
    requestUrl.mockImplementation(({ url }: { url: string }) => {
      if (url === 'https://books.example/opds')
        return Promise.resolve({
          status: 302,
          headers: { location: 'https://mirror.example/opds' },
          arrayBuffer: new ArrayBuffer(0),
        });
      // A mirror that redirects BACK to a URL on the source's host: the credential must not reappear mid-chain
      // just because the target looks like home again — it does, and that is why this asserts both hops.
      if (url === 'https://mirror.example/opds')
        return Promise.resolve({
          status: 302,
          headers: { location: 'https://books.example/final' },
          arrayBuffer: new ArrayBuffer(0),
        });
      return Promise.resolve(ok());
    });
    await fetchSourceBody(app, SOURCE, 'https://books.example/opds');
    expect(authSentTo('https://books.example/opds')).toBe(`Basic ${btoa('reader:hunter2')}`);
    expect(authSentTo('https://mirror.example/opds')).toBeUndefined();
    // Back on the source's own origin, so it is sent again — the comparison is with the source, every hop.
    expect(authSentTo('https://books.example/final')).toBe(`Basic ${btoa('reader:hunter2')}`);
  });
});

/**
 * The same anchor, used for a second question: not "may the password go there" but "may we go there at all".
 *
 * `mayReach` is unit-tested in private-hosts.test.ts. What these add is that the refusal is WIRED — that the
 * request is never made, rather than made and then judged.
 */
describe('a public catalog cannot reach into a private network', () => {
  it('makes no request at all to a LAN address', async () => {
    requestUrl.mockResolvedValue(ok());
    const result = await fetchSourceBody(app, SOURCE, 'http://192.168.1.10:8080/opds');
    expect(requestUrl).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    // Reported as itself, not as a timeout. A control that lies about why it fired sends whoever hits it to debug
    // the wrong thing — and a self-hosted catalog IS a normal setup, so the message has to say which case it is.
    expect(result.ok === false && result.reason).toBe('private-address');
  });

  it('refuses the cloud metadata address', async () => {
    requestUrl.mockResolvedValue(ok());
    await fetchSourceBody(app, SOURCE, 'http://169.254.169.254/latest/meta-data/');
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it('refuses a download to a LAN address too', async () => {
    requestUrl.mockResolvedValue({ status: 200, arrayBuffer: new ArrayBuffer(8), headers: {} });
    const result = await fetchBook(app, SOURCE, 'http://localhost:9000/x.epub', 1024);
    expect(requestUrl).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  /** A redirect is the other way in, and it is checked on every hop rather than only on the first. */
  it('stops a redirect that turns toward the LAN', async () => {
    requestUrl.mockImplementation(({ url }: { url: string }) =>
      url === 'https://books.example/opds'
        ? Promise.resolve({
            status: 302,
            headers: { location: 'http://192.168.1.10:8080/opds' },
            arrayBuffer: new ArrayBuffer(0),
          })
        : Promise.resolve(ok())
    );
    await fetchSourceBody(app, SOURCE, 'https://books.example/opds');
    const asked = requestUrl.mock.calls.map(([o]) => (o as { url: string }).url);
    expect(asked).toEqual(['https://books.example/opds']);
  });
});

describe('a private catalog is free to talk to itself', () => {
  const CALIBRE: BookSource = { ...SOURCE, id: 'calibre', url: 'http://192.168.1.10:8080/opds' };

  it('fetches its own pages', async () => {
    requestUrl.mockResolvedValue(ok());
    await fetchSourceBody(app, CALIBRE, 'http://192.168.1.10:8080/opds/browse?page=2');
    expect(requestUrl).toHaveBeenCalled();
  });

  it('downloads its own books', async () => {
    requestUrl.mockResolvedValue({ status: 200, arrayBuffer: new ArrayBuffer(8), headers: {} });
    const result = await fetchBook(app, CALIBRE, 'http://192.168.1.10:8080/get/EPUB/42/library', 1024);
    expect(result.ok).toBe(true);
  });
});

/**
 * **UTF-8, as RFC 7617 says.** `btoa` on the text sent an é as one Latin-1 byte, and threw on anything past Latin-1
 * before the request was made — outside the `try`, so the browse dialog had no failure to show .
 * The expected values are Node's `Buffer.from(text, 'utf8').toString('base64')`, worked out once.
 */
describe('a credential with characters outside ASCII', () => {
  it.each([
    ['an accented letter', 'josé', 'contraseña', 'am9zw6k6Y29udHJhc2XDsWE='],
    [
      'characters past Latin-1',
      'читатель',
      'pass€—“word”🔑',
      '0YfQuNGC0LDRgtC10LvRjDpwYXNz4oKs4oCU4oCcd29yZOKAnfCflJE=',
    ],
  ])('is sent as UTF-8: %s', async (_what, user, password, expected) => {
    requestUrl.mockResolvedValue(ok());
    const secrets = {
      secretStorage: {
        getSecret: (id: string) => (id.endsWith('-username') ? user : id.endsWith('-password') ? password : null),
      },
    };
    await fetchSourceBody(secrets, SOURCE, 'https://books.example/opds');
    expect(authSentTo('https://books.example/opds')).toBe(`Basic ${expected}`);
  });
});

describe('a source with no username', () => {
  it('sends no Authorization at all', async () => {
    requestUrl.mockResolvedValue(ok());
    const anon = { secretStorage: { getSecret: () => null } };
    await fetchSourceBody(anon, SOURCE, 'https://books.example/opds');
    expect(authSentTo('https://books.example/opds')).toBeUndefined();
  });
});
