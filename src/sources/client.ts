// Talking to a source: one request, one answer, and a message when there isn't one.
//
// **Not `fetch`.** A catalog server has no reason to have opted this plugin in to CORS, so a plain `fetch` fails on
// exactly the hosts this exists to serve. Requests go through `requestHop`: Obsidian's `requestUrl` on mobile, and
// Electron's own `net` on the desktop, so that a redirect is shown to us rather than obeyed for us.
//
// **Every failure comes back as a sentence, not a throw.** A browser dialog showing "could not load" tells a reader
// nothing they can act on: a wrong URL, a machine that is asleep, a membership feed that wants a password and a feed
// that is fine but says nothing are four different problems with four different next steps. So the result type carries
// the reason, and the dialog prints it.
//
// See docs/design/book-sources.md.

import type { BookSource } from '../settings';
import { type HopAnswer, requestHop } from './hop-request';
import { type OpdsFeed, parseOpds12 } from './opds';
import { mayReach } from './private-hosts';
import { readPassword, readUsername } from './sources';

/** A request has no timeout of its own, so one unresponsive host would hang the dialog that asked. */
const TIMEOUT_MS = 20_000;

/**
 * A book's own, far longer timeout. A feed page is a few kilobytes and twenty seconds is an answer; a book can be a
 * scanned comic of hundreds of megabytes, which on a slow connection takes minutes — and failing it as "could not reach
 * the source" told the reader the wrong thing. Ten minutes still ends a request that has died, and **Stop** is there
 * for one that is merely slow.
 */
const BOOK_TIMEOUT_MS = 10 * 60_000;

/**
 * A URL as the debug log may show it: with any `user:password@` taken out, and the value of any parameter, in the
 * query or the fragment, named like a credential.
 *
 * The keychain's credentials never reach the log — a request only says it carried some — but an address typed with
 * them in it, `https://me:secret@host/opds`, was logged as typed. **Up to the last `@` before the host ends**, as a
 * URL parser reads it: a password holding an `@` was cut at the first one, and the rest of it logged. A catalog that
 * takes its key in the address, `?apikey=…`, has it replaced too.
 */
export function forLog(url: string): string {
  return url
    .replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#\s]*@/i, '$1***@')
    .replace(PARAM, (param, start: string, name: string) => (isCredentialName(name) ? `${start}${name}=***` : param));
}

/** A parameter in the query or the fragment, after `?`, `&`, `;` or `#`: what starts it, then its name. */
const PARAM = /([?&;#])([^=&#;?]*)=[^&#;]*/g;

/** A name holding one of these anywhere names a credential: `client_secret`, `refresh_token`, `X-Amz-Signature`. */
const CREDENTIAL_WORD = /token|secret|passw|signature|credential|session|api[_-]?key/i;

/** These only as a whole word of the name, since `author`, `keyword` and `signup` hold them too. */
const CREDENTIAL_PART = new Set(['auth', 'authorization', 'key', 'pwd', 'sid', 'sig']);

/** Whether a parameter's value is a credential, by its name: a list of exact names missed the ones it left out. */
function isCredentialName(name: string): boolean {
  return (
    CREDENTIAL_WORD.test(name) ||
    name
      .toLowerCase()
      .split(/[_.-]/)
      .some((part) => CREDENTIAL_PART.has(part))
  );
}

/** Enough for a page of any real catalog, and a wall against a URL that turns out to be a video. */
const MAX_FEED_BYTES = 8 * 1024 * 1024;

/** Why a fetch did not produce a feed. The dialog turns each of these into a sentence for the reader. */
export type SourceFailure =
  | 'unreachable'
  /** Asked for credentials, and this device has none for the source. */
  | 'requires-authentication'
  /** Sent credentials, and they were refused. */
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'server-error'
  | 'too-large'
  | 'unreadable'
  | 'not-opds'
  /** Refused before the request: a public catalog aiming at a private address. See `mayReach`. */
  | 'private-address';

export type FeedResult =
  | { ok: true; feed: OpdsFeed; url: string }
  | { ok: false; reason: SourceFailure; status?: number; detail?: string };

export type BodyResult =
  | { ok: true; text: string; url: string }
  | { ok: false; reason: SourceFailure; status?: number; detail?: string };

/**
 * What a server says when it asks for credentials — the `realm` out of its `WWW-Authenticate` header.
 *
 * **Worth showing, because it is the one message written by somebody who knows the answer.** Standard Ebooks replies
 * to its OPDS feed with `Basic realm="Enter your Patrons Circle email address and leave the password empty."`, which
 * tells a reader both that a membership is needed and the odd shape of the credential. "The source refused the account
 * name or password" is true and sends them to check a typo that was never there.
 *
 * Quoted or bare, since both are legal, and empty when there is nothing useful to quote.
 */
export function realmFrom(header: string | undefined): string {
  const match = /realm\s*=\s*(?:"([^"]*)"|([^,\s]+))/i.exec(header ?? '');
  return (match?.[1] ?? match?.[2] ?? '').trim();
}

/**
 * One response header, whatever case the platform chose to spell it in.
 *
 * **Header names are case-insensitive and the platforms disagree.** Reading `headers['www-authenticate']` and then
 * `headers['WWW-Authenticate']` is two guesses rather than a rule — and Android returns neither, so a 401 that
 * carries a realm on a Mac would arrive on a phone with nothing to show.
 *
 * It matters most on the phone. The realm is the one sentence written by somebody who knows the answer — Standard
 * Ebooks uses it to say that the password must be left BLANK — and a phone is the device least able to go and look
 * that up somewhere else.
 */
export function headerOf(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const want = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === want) return headers[key];
  }
  return undefined;
}

/**
 * The credentials for a source, if it has any.
 *
 * **Both halves live in the device's secret store**, so a catalog that arrived from another device arrives
 * unauthenticated — correctly, since this device has not been told who to sign in as. A blank password beside a
 * username is a real credential rather than an incomplete one: Standard Ebooks' membership feed is authenticated
 * exactly that way, so the test is whether a *username* is set.
 */
function authHeader(
  app: { secretStorage: { getSecret(id: string): string | null } },
  source: BookSource
): string | null {
  const user = readUsername(app, source).trim();
  if (!user) return null;
  return `Basic ${basicCredentials(user, readPassword(app, source))}`;
}

/**
 * `user:password` as a Basic sign-in carries it: the UTF-8 bytes, in base64, as RFC 7617 says and Calibre's server
 * expects.
 *
 * **Not `btoa` on the text.** `btoa` reads each character as one Latin-1 byte, so an é went out as one byte where the
 * server wanted two, and a character past Latin-1 — €, a curly quote, Cyrillic — threw before the request was made,
 * outside the `try` that turns a failure into something the browse dialog can show.
 * Encoding first cannot throw. `btoa` still does the base64, not a Buffer: this runs in Obsidian's renderer on every
 * platform.
 */
function basicCredentials(user: string, password: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(`${user}:${password}`)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * How many redirects to follow before giving up.
 *
 * Three is enough for the chains real catalogs have — Gutenberg's search template answers `http://m.gutenberg.org/…`
 * → https → `www.gutenberg.org`, which is two — and small enough that a server looping against itself costs three
 * requests rather than a hang.
 */
const MAX_HOPS = 3;

/**
 * Where a redirect leads, or `null` when this is not one.
 *
 * **We follow them ourselves, on every device.** `requestHop` hands back each redirect rather than obeying it, so
 * every hop is judged here by the same two rules as the first. Without following them a search would fail with "the
 * source answered with an error": the redirect is the catalog's own — Gutenberg's OpenSearch description points at
 * `m.gutenberg.org`, a host that redirects elsewhere.
 *
 * A relative `Location` resolves against the URL that produced it, which is what servers actually send.
 */
export function nextHop(status: number, location: string | undefined, from: string): string | null {
  if (![301, 302, 303, 307, 308].includes(status)) return null;
  const target = location?.trim();
  if (!target) return null;
  try {
    const url = new URL(target, from);
    // Only the two schemes we can fetch. A redirect to anything else is one we decline rather than obey.
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Whether a credential may be sent to `target`, given the source it belongs to.
 *
 * **Scheme, host and port — an origin, not a host.** Comparing hosts alone would let a credential travel from an
 * `https` source to an `http` URL on the same machine, which puts a password on the wire in cleartext. An `http` source
 * still works: it is compared against its own scheme, which is what a Calibre box on a LAN needs.
 *
 * **`against` must be the SOURCE's configured URL, never the URL being requested.** That distinction is the whole
 * of this function's value — see `fetchFollowing`.
 */
export function sameOrigin(target: string, against: string): boolean {
  try {
    const a = new URL(target);
    const b = new URL(against);
    return a.protocol === b.protocol && a.host.toLowerCase() === b.host.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * What a status code means for the reader, rather than for the protocol.
 *
 * **A 401 with nothing sent is not a refused password.** It is a source asking for one, and "refused the username or
 * password" sent a reader to check a password they had never entered — the same words they would see for a typo,
 * so neither case could be told from the other.
 *
 * **403 is only about credentials when credentials were sent.** Gutenberg's search feed advertises facet links —
 * "Authors", "Subjects" — whose OPDS endpoints answer 403 with or without a user agent: a link their own catalog
 * publishes and their own server refuses. Reported as "refused the username or password", that reads as a broken
 * password on a public catalog nobody has an account for, and sends a reader to fix a setting that was never wrong.
 *
 * With credentials attached, 403 does mean what 401 means — a server that has seen who you are and said no.
 */
export function reasonFor(status: number, hadAuth: boolean): SourceFailure {
  if (status === 401) return hadAuth ? 'unauthorized' : 'requires-authentication';
  if (status === 403) return hadAuth ? 'unauthorized' : 'forbidden';
  if (status === 404 || status === 410) return 'not-found';
  return 'server-error';
}

/**
 * Fetch one document from a source.
 *
 * **One request, and nothing on top of it**: no retry, no redirect chasing of our own, no prefetch of the next page.
 * Gutenberg's robot policy makes that a condition of being allowed to use their catalog at all, and a client that
 * quietly retries a slow request is a client that hits a rate limit twice as fast.
 *
 * `url` is passed in rather than taken from the source, because paging and drilling into a category both fetch a URL
 * the *feed* provided — the source only says where to start and who we are.
 */
/**
 * One request, its redirects followed, and the URL it ended at.
 *
 * **Credentials do not travel to another host.** A catalog that redirects within itself keeps them, which is the
 * normal case; one that redirects to a different host gets the request without them, because a password entered for
 * `books.example` is not consent to send it to wherever `books.example` points this week.
 */
/**
 * `home` is the SOURCE's own URL, and the credential goes nowhere else.
 *
 * **Comparing against the URL being fetched would protect the wrong thing.** That stops a REDIRECT carrying a
 * password to another host — but every URL this function is given already came out of a feed: `resolveOpdsHref`
 * builds browse targets and download links from hrefs the catalog wrote. On the first hop `here === url`, so that
 * check would pass by construction, and a membership catalog could publish one link and be handed the password for
 * it. Anchoring on the source closes the first hop and every hop after it with the same
 * comparison.
 */
async function fetchFollowing(
  url: string,
  home: string,
  headers: Record<string, string>,
  auth: string | null,
  maxBytes: number,
  log?: (msg: string) => void,
  timeoutMs = TIMEOUT_MS
): Promise<{ res: HopAnswer; url: string } | null | 'private-address'> {
  let here = url;
  for (let hop = 0; ; hop++) {
    /**
     * **A public catalog does not get to send a request into your own network.**
     *
     * Checked on every hop, including the first, for the same reason the credential is: the URL was written by the
     * catalog, not by the reader. A source that is itself private — the usual Calibre content server on a LAN — is
     * free to talk to itself. See `mayReach`.
     */
    if (!mayReach(here, home)) {
      log?.(`refused ${forLog(here)} — a public source may not reach a private address`);
      return 'private-address';
    }
    const carry: Record<string, string> = auth && sameOrigin(here, home) ? { Authorization: auth } : {};
    log?.(`GET ${forLog(here)}${Object.keys(carry).length ? ' (with credentials)' : ''}`);
    // One hop and no more: a redirect comes back to this loop on every device — see `requestHop`.
    const res = await requestHop(here, { ...headers, ...carry }, timeoutMs, maxBytes, log);
    if (!res) return null;
    const next = hop < MAX_HOPS ? nextHop(res.status, res.headers.location, here) : null;
    if (!next) return { res, url: here };
    log?.(`${res.status} → ${forLog(next)}`);
    here = next;
  }
}

/**
 * What a browse request asks for, and what it refuses to be answered from.
 *
 * **`Accept`** names XML, because several catalogs answer "anything" with the HTML version of the same page.
 *
 * **`Cache-Control: no-cache` because a catalog page is not a document, it is a report.** A request goes through
 * the platform's own HTTP cache, which on the desktop is on disk and survives restarting the app — so a feed
 * fetched once would come back unchanged for the rest of its freshness lifetime. Three things are wrong with that:
 *
 * - A stale page hides books that have arrived and offers books that have gone.
 * - **One request per user action** is the rule this whole client lives under (Gutenberg's robot policy). A tap
 *   that is answered from disk is not the request that rule promises the server.
 * - A feed behind a password keeps answering from the cache after the server starts asking for one, with no
 *   credentials sent — while `curl`, or a phone with nothing cached, gets the 401.
 *
 * `no-cache` revalidates rather than refusing the cache outright, so an unchanged feed still costs one 304 instead
 * of a fresh body. Downloads deliberately do NOT carry it: an acquisition URL answers with the bytes of a file, and
 * a book that has not changed is a book worth not fetching twice.
 */
export const FEED_HEADERS: Record<string, string> = {
  Accept: 'application/atom+xml,application/xml;q=0.9,*/*;q=0.5',
  'Cache-Control': 'no-cache',
};

export async function fetchSourceBody(
  app: { secretStorage: { getSecret(id: string): string | null } },
  source: BookSource,
  url: string,
  log?: (msg: string) => void
): Promise<BodyResult> {
  const auth = authHeader(app, source);
  try {
    // A feed, and an OpenSearch description, are both XML; asking for them by name keeps a server from answering with
    // the HTML version of the same page, which several do when asked for anything.
    const got = await fetchFollowing(url, source.url, FEED_HEADERS, auth, MAX_FEED_BYTES, log);
    // A refusal is not a timeout, and must not be logged as one: a security control that lies about why it fired
    // sends whoever hits it to debug the wrong thing.
    if (got === 'private-address') return { ok: false, reason: 'private-address' };
    if (!got) {
      log?.(`timed out after ${TIMEOUT_MS}ms`);
      return { ok: false, reason: 'unreachable' };
    }
    const { res } = got;
    if (res.status !== 200) {
      const realm = realmFrom(headerOf(res.headers, 'www-authenticate'));
      log?.(`status ${res.status}${realm ? ` — realm: ${realm}` : ''}`);
      return {
        ok: false,
        reason: reasonFor(res.status, auth !== null),
        status: res.status,
        detail: realm || undefined,
      };
    }
    if (res.tooLarge) {
      log?.(`too large: over ${MAX_FEED_BYTES} bytes`);
      return { ok: false, reason: 'too-large' };
    }
    // UTF-8, as `requestUrl`'s own `text` decodes it.
    const text = new TextDecoder().decode(res.body).trim();
    log?.(`200, ${text.length} chars`);
    // The URL it ENDED at, because every relative href in the answer resolves against that rather than against what
    // was asked for — after a redirect the two are different hosts, as Gutenberg's search shows.
    return text ? { ok: true, text, url: got.url } : { ok: false, reason: 'unreadable' };
  } catch {
    // An unreachable host, a refused connection, a URL the platform rejects outright.
    return { ok: false, reason: 'unreachable' };
  }
}

/**
 * Fetch a feed and read it.
 *
 * The URL comes back with the feed because every href inside it is resolved against the document it came from, and
 * after a redirect that is not the URL we asked for — see `resolveOpdsHref`.
 *
 * **`not-opds` is its own answer.** A body we cannot parse is usually an HTML page: a login form, a "moved" notice, or
 * a Calibre server whose OPDS path is one segment off. Reporting that as an empty catalog would send a reader looking
 * for books that were never there.
 */
export async function fetchFeed(
  app: { secretStorage: { getSecret(id: string): string | null } },
  source: BookSource,
  url: string,
  log?: (msg: string) => void
): Promise<FeedResult> {
  const body = await fetchSourceBody(app, source, url, log);
  if (!body.ok) return body;
  const feed = parseOpds12(body.text);
  // OPDS 2.0 is JSON and is not read yet — worth telling apart from a feed we simply could not parse, because the
  // answer to it is a version of Orbis rather than a different URL.
  if (!feed) {
    log?.(`could not parse: starts "${body.text.slice(0, 40).replace(/\s+/g, ' ')}"`);
    return { ok: false, reason: body.text.startsWith('{') ? 'not-opds' : 'unreadable' };
  }
  log?.(`feed "${feed.title}": ${feed.entries.length} entries, next=${feed.next ?? 'none'}`);
  // The URL the body came from, redirects included — see `fetchSourceBody`.
  return { ok: true, feed, url: body.url };
}

/**
 * Download an acquisition link.
 *
 * Bytes rather than text, and the same one-request rule. Size is checked as the answer arrives rather than by asking
 * first: a HEAD request to learn a length would double the number of requests per book, which is the cost this feature
 * is deliberately unwilling to pay.
 */
export async function fetchBook(
  app: { secretStorage: { getSecret(id: string): string | null } },
  source: BookSource,
  url: string,
  maxBytes: number,
  log?: (msg: string) => void
): Promise<
  { ok: true; data: ArrayBuffer; type: string } | { ok: false; reason: SourceFailure; status?: number; detail?: string }
> {
  const auth = authHeader(app, source);
  try {
    // Redirects followed here as well: an acquisition link is as likely to redirect as a feed — Gutenberg's do, to a
    // mirror — and a download that fails on a phone while working on a desktop would be the same failure twice.
    const got = await fetchFollowing(url, source.url, {}, auth, maxBytes, log, BOOK_TIMEOUT_MS);
    if (got === 'private-address') return { ok: false, reason: 'private-address' };
    if (!got) {
      log?.(`timed out after ${BOOK_TIMEOUT_MS}ms`);
      return { ok: false, reason: 'unreachable' };
    }
    const { res } = got;
    if (res.status !== 200) {
      // The server's own words on a refusal, as a browse failure has them — see `realmFrom`.
      const realm = realmFrom(headerOf(res.headers, 'www-authenticate'));
      return {
        ok: false,
        reason: reasonFor(res.status, auth !== null),
        status: res.status,
        detail: realm || undefined,
      };
    }
    if (res.tooLarge) return { ok: false, reason: 'too-large' };
    const data = res.body;
    if (data.byteLength === 0) return { ok: false, reason: 'unreadable' };
    return { ok: true, data, type: headerOf(res.headers, 'content-type') ?? '' };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}
