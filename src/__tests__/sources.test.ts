import { beforeEach, describe, expect, it } from 'vitest';
import type { BookSource } from '../settings';
import { FEED_HEADERS, headerOf, nextHop, realmFrom, reasonFor, sameOrigin } from '../sources/client';
import {
  enabledSources,
  forgetCredential,
  isUsableSourceUrl,
  mergeBookSources,
  passwordIdFor,
  readPassword,
  readUsername,
  saveCredential,
  usernameIdFor,
  withUniqueSourceIds,
  writePassword,
  writeUsername,
} from '../sources/sources';

const builtins: BookSource[] = [
  { id: 'gutenberg', name: 'Project Gutenberg', url: 'https://gutenberg.example/feed', enabled: true, builtin: true },
  { id: 'another', name: 'Another Catalog', url: 'https://another.example/opds', enabled: true, builtin: true },
];
const mine = (over: Partial<BookSource> = {}): BookSource => ({
  id: 'user-1',
  name: 'My Calibre',
  url: 'http://192.168.1.10:8080/opds',
  enabled: true,
  builtin: false,
  ...over,
});

describe('mergeBookSources', () => {
  // A fresh vault, and the only case where our order is the reader's order.
  it('starts with the sources Orbis ships', () => {
    expect(mergeBookSources(undefined, builtins).map((s) => s.id)).toEqual(['gutenberg', 'another']);
    expect(mergeBookSources([], builtins)).toHaveLength(2);
  });

  /**
   * **A catalog endpoint that moves is ours to fix**, and a fix that only reached fresh installs would be no fix at
   * all — Gutenberg expects to sunset the feeds these URLs point at. So the name and URL come from this version while
   * everything the reader decided about the row survives it.
   */
  it('refreshes a built-in’s name and URL, keeping what the reader chose', () => {
    const stored: BookSource[] = [
      { id: 'gutenberg', name: 'Old name', url: 'https://old.example/gone', enabled: false, builtin: true },
    ];
    const [first] = mergeBookSources(stored, builtins);
    expect(first.name).toBe('Project Gutenberg');
    expect(first.url).toBe('https://gutenberg.example/feed');
    expect(first.enabled).toBe(false);
  });

  // A username is not here at all: it is a credential, and credentials live in the device's own secret
  // store beside the password — see `usernameIdFor`. What survives the refresh is the reader's own settings for the
  // endpoint, which is the enabled flag and the language.
  it('keeps a built-in’s language through the refresh', () => {
    const stored: BookSource[] = [{ ...builtins[1], language: 'fr' }];
    expect(mergeBookSources(stored, builtins)[0].language).toBe('fr');
  });

  // The reader arranged this list; forcing canonical order would silently undo it.
  it('leaves the reader’s order alone and appends what is new', () => {
    const stored: BookSource[] = [{ ...builtins[1] }, mine()];
    expect(mergeBookSources(stored, builtins).map((s) => s.id)).toEqual(['another', 'user-1', 'gutenberg']);
  });

  // Otherwise a retired source sits in the list forever, pointing at a URL nothing maintains.
  it('drops a built-in this version no longer ships', () => {
    const stored: BookSource[] = [
      { id: 'retired', name: 'Gone', url: 'https://gone.example', enabled: true, builtin: true },
      mine(),
    ];
    expect(mergeBookSources(stored, builtins).map((s) => s.id)).toEqual(['user-1', 'gutenberg', 'another']);
  });

  it('passes a reader’s own source through untouched', () => {
    const own = mine({ language: 'de' });
    expect(mergeBookSources([own], builtins)[0]).toBe(own);
  });

  // Standard Ebooks shipped as a built-in and no longer does: every one of its feeds needs a membership, so the guide
  // shows how to add it instead. A vault that stored it keeps Gutenberg, its own sources and their order.
  it('drops the Standard Ebooks built-in from a stored list', () => {
    const stored: BookSource[] = [
      {
        id: 'standard-ebooks',
        name: 'Standard Ebooks',
        url: 'https://standardebooks.org/feeds/opds',
        enabled: true,
        builtin: true,
      },
      mine(),
      { id: 'gutenberg', name: 'Project Gutenberg', url: 'https://old.example', enabled: false, builtin: true },
    ];
    expect(mergeBookSources(stored).map((s) => s.id)).toEqual(['user-1', 'gutenberg']);
  });
});

describe('enabledSources', () => {
  // What a browse action may reach: switched on, and with somewhere to go. A row half-added — named, no URL yet — is
  // not an error to report, it is simply not a source to open.
  it('is the switched-on sources that have a URL', () => {
    const list = [mine({ id: 'a' }), mine({ id: 'b', enabled: false }), mine({ id: 'c', url: '  ' })];
    expect(enabledSources(list).map((s) => s.id)).toEqual(['a']);
  });
});

describe('the credential keys’ shape', () => {
  /**
   * `secretStorage` takes lowercase alphanumerics and dashes and **throws** on anything else, and these ids are
   * derived from a source id that can have come from a hand-edited `data.json`. A settings row must not be able to
   * throw while being drawn.
   */
  it('is always an id the secret store accepts', () => {
    for (const id of ['gutenberg', 'My Calibre!', 'user_42', 'ÜBER', '', 'x'.repeat(200)]) {
      for (const key of [passwordIdFor({ id }), usernameIdFor({ id })]) {
        expect(key).toMatch(/^[a-z0-9-]+$/);
        expect(key.length).toBeLessThanOrEqual(64); // `setSecret` throws above this, inside a change handler
      }
    }
  });

  // The cut is a guard against a hand-edited `data.json`, so it must not be able to reach an id Orbis mints:
  // `catalog-<base36>` is around twenty characters and the budget is thirty-seven.
  it('leaves an ordinary id exactly as it is', () => {
    expect(passwordIdFor({ id: 'catalog-mt4ml76q04w8cj6u98ey' })).toBe(
      'orbis-book-source-catalog-mt4ml76q04w8cj6u98ey-password'
    );
  });

  it('never ends the cut on a dash, which would read as a mistake beside the suffix', () => {
    // Folds to 36 y's and a dash — exactly the budget — so the cut keeps a trailing dash unless it is trimmed. The
    // key must read `…yyy-password`, not `…yyy--password`.
    expect(passwordIdFor({ id: `${'y'.repeat(36)}!!!` })).toBe(`orbis-book-source-${'y'.repeat(36)}-password`);
  });

  it('still tells the two halves apart when the id was cut', () => {
    const long = 'z'.repeat(200);
    expect(passwordIdFor({ id: long })).not.toBe(usernameIdFor({ id: long }));
  });

  // Prefixed with what it is, because the store is shared with every other plugin on the device — and because a
  // reader meets these in Obsidian's own secret list with nothing else to go on.
  it('says who it belongs to', () => {
    expect(passwordIdFor({ id: 'x' }).startsWith('orbis-book-source-')).toBe(true);
    expect(usernameIdFor({ id: 'x' }).startsWith('orbis-book-source-')).toBe(true);
  });
});

describe('isUsableSourceUrl', () => {
  it('accepts what we can fetch', () => {
    expect(isUsableSourceUrl('https://standardebooks.org/feeds/opds')).toBe(true);
    // A Calibre content server on a home network usually is not encrypted, and it is the source most likely to be
    // somebody's whole library.
    expect(isUsableSourceUrl('http://192.168.1.10:8080/opds')).toBe(true);
    expect(isUsableSourceUrl('  https://example.com/feed  ')).toBe(true);
  });

  // Shallow on purpose: what the URL actually is gets answered by fetching it, and a stricter rule here would be
  // guessing at the shape of an OPDS endpoint.
  it('rejects what is not a web address', () => {
    expect(isUsableSourceUrl('')).toBe(false);
    expect(isUsableSourceUrl('standardebooks.org/feeds/opds')).toBe(false);
    expect(isUsableSourceUrl('file:///Users/me/feed.xml')).toBe(false);
    expect(isUsableSourceUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('reasonFor', () => {
  /**
   * **403 is only about credentials when credentials were sent.** Gutenberg's search feed advertises facet links —
   * "Authors", "Subjects" — whose OPDS endpoints answer 403 with or without a user agent: a link their own catalog
   * publishes and their own server refuses. Reported as "refused the username or password", that reads as a broken
   * password on a public catalog nobody has an account for, and sends a reader to fix a setting that was never wrong.
   */
  it('does not blame a password for a refusal on a public catalog', () => {
    expect(reasonFor(403, false)).toBe('forbidden');
  });

  // With credentials attached, 403 means what 401 means: a server that has seen who you are and said no.
  it('blames the credentials when credentials were sent', () => {
    expect(reasonFor(403, true)).toBe('unauthorized');
    expect(reasonFor(401, true)).toBe('unauthorized');
  });

  // 401 with nothing sent is a source asking for credentials, not refusing a password nobody entered.
  it('tells a source asking for credentials from one refusing them', () => {
    expect(reasonFor(401, false)).toBe('requires-authentication');
    expect(reasonFor(401, true)).toBe('unauthorized');
  });

  it('tells a missing address from a broken server', () => {
    expect(reasonFor(404, false)).toBe('not-found');
    expect(reasonFor(410, false)).toBe('not-found');
    expect(reasonFor(500, false)).toBe('server-error');
    expect(reasonFor(503, true)).toBe('server-error');
  });
});

describe('FEED_HEADERS', () => {
  /**
   * **A browse request must reach the server.** `requestUrl` goes through the platform's HTTP cache, which on the
   * desktop is on disk and outlives a restart of the app — so a cached feed can come back unchanged long after the
   * catalog has changed, and answer 200 with no credentials sent long after the server has grown a password.
   *
   * Pinned because the failure is silent: nothing about a stale 200 looks wrong in a log.
   */
  it('asks the server rather than the cache', () => {
    expect(FEED_HEADERS['Cache-Control']).toBe('no-cache');
  });

  // Several catalogs answer a request for `*/*` with the HTML version of the same page.
  it('asks for XML by name', () => {
    expect(FEED_HEADERS.Accept).toContain('application/atom+xml');
  });
});

describe('headerOf', () => {
  /**
   * **Any case, not a guess at the spelling.** Android returns neither `www-authenticate` nor `WWW-Authenticate`, so a
   * lookup that tried those two would show a 401's realm on a Mac and nothing on a phone. The realm is the sentence
   * that tells a Standard Ebooks reader to leave the password blank, and a phone is the device least able to go and
   * find that out somewhere else.
   */
  it('finds a header whatever case the platform spelled it in', () => {
    const want = 'Basic realm="Calibre OPDS"';
    for (const key of ['www-authenticate', 'WWW-Authenticate', 'Www-Authenticate', 'WWW-AUTHENTICATE']) {
      expect(headerOf({ [key]: want }, 'www-authenticate')).toBe(want);
    }
  });

  it('answers undefined for a header that is not there, and for no headers at all', () => {
    expect(headerOf({ 'content-type': 'application/atom+xml' }, 'www-authenticate')).toBeUndefined();
    expect(headerOf(undefined, 'www-authenticate')).toBeUndefined();
  });
});

describe('realmFrom', () => {
  /**
   * **The one message written by somebody who knows the answer.** Standard Ebooks answers its OPDS feed with
   * `Basic realm="Enter your Patrons Circle email address and leave the password empty."` — which names both the
   * membership and the odd blank-password shape. "The source refused the username or password" is true and sends a
   * reader to check a typo that was never there.
   */
  it('reads what a server says when it asks for credentials', () => {
    expect(realmFrom('Basic realm="Enter your Patrons Circle email address and leave the password empty."')).toBe(
      'Enter your Patrons Circle email address and leave the password empty.'
    );
    expect(realmFrom('Basic realm="Authentication Required"')).toBe('Authentication Required');
  });

  // Unquoted is legal too, and a header can carry more after it.
  it('reads a bare realm', () => {
    expect(realmFrom('Basic realm=calibre, charset="UTF-8"')).toBe('calibre');
  });

  // Nothing to quote is nothing to show: the failure then speaks in our own words alone.
  it('is empty when there is nothing useful', () => {
    expect(realmFrom(undefined)).toBe('');
    expect(realmFrom('Basic')).toBe('');
    expect(realmFrom('')).toBe('');
  });
});

describe('nextHop', () => {
  /**
   * **Followed by us, because `requestUrl` does not follow them on Android.** On the desktop it resolves a chain
   * silently; on a phone it hands back the 302 — so without this, searching Gutenberg works on one device and fails on
   * the other with "the source answered with an error". The chain is the catalog's own: its OpenSearch description
   * still points at `m.gutenberg.org`, which has redirected elsewhere for years.
   */
  it('is where a redirect leads', () => {
    expect(nextHop(302, 'https://m.gutenberg.org/ebooks/search.opds/?query=Finn', 'http://m.gutenberg.org/x')).toBe(
      'https://m.gutenberg.org/ebooks/search.opds/?query=Finn'
    );
    for (const status of [301, 303, 307, 308]) {
      expect(nextHop(status, 'https://elsewhere.example/feed', 'https://a.example/feed')).toBe(
        'https://elsewhere.example/feed'
      );
    }
  });

  // A relative `Location` is legal and servers send them; it resolves against the URL that produced it.
  it('resolves a relative location', () => {
    expect(nextHop(301, '/opds?library_id=main', 'https://books.example/opds/old')).toBe(
      'https://books.example/opds?library_id=main'
    );
  });

  it('is null for anything that is not a redirect', () => {
    expect(nextHop(200, 'https://elsewhere.example', 'https://a.example')).toBeNull();
    expect(nextHop(404, 'https://elsewhere.example', 'https://a.example')).toBeNull();
    expect(nextHop(302, undefined, 'https://a.example')).toBeNull();
    expect(nextHop(302, '   ', 'https://a.example')).toBeNull();
  });

  // Only the two schemes we can fetch. A redirect to an app link is one we decline rather than obey.
  it('declines a scheme we cannot fetch', () => {
    expect(nextHop(302, 'obsidian://open?vault=x', 'https://a.example')).toBeNull();
    expect(nextHop(302, 'file:///etc/passwd', 'https://a.example')).toBeNull();
  });
});

describe('sameOrigin', () => {
  /**
   * **What decides whether credentials travel.** A catalog fetched within itself keeps them, which is the normal
   * case; anywhere else gets the request without them, because a password entered for `books.example` is not
   * consent to send it wherever `books.example` points this week.
   *
   * The second argument is always the SOURCE's configured URL — never the URL being fetched. See `fetchFollowing`.
   */
  it('is true only within the source itself', () => {
    expect(sameOrigin('https://books.example/opds', 'https://books.example/get/1')).toBe(true);
    expect(sameOrigin('http://books.example:8080/a', 'http://books.example:8080/b')).toBe(true);
    expect(sameOrigin('https://books.example/opds', 'https://mirror.example/opds')).toBe(false);
    // A different port is a different service, whatever the name on it.
    expect(sameOrigin('http://books.example:8080/a', 'http://books.example:9090/a')).toBe(false);
    expect(sameOrigin('not a url', 'https://books.example')).toBe(false);
  });

  /**
   * **A password must not be downgraded onto the wire.** Host comparison alone says yes to this: same machine,
   * same port after defaulting, different scheme — and Basic auth over plain http is the credential in cleartext.
   */
  it('refuses to carry a credential from https down to http', () => {
    expect(sameOrigin('http://books.example/get/1', 'https://books.example/opds')).toBe(false);
    expect(sameOrigin('https://books.example/get/1', 'http://books.example/opds')).toBe(false);
  });

  /** An http source is compared against its own scheme, so a Calibre server on a LAN still authenticates. */
  it('allows an http source to use its own credentials', () => {
    expect(sameOrigin('http://192.168.1.10:8080/get/1', 'http://192.168.1.10:8080/opds')).toBe(true);
  });
});

/**
 * The username lives in the device's own secret store, beside the password — a credential is a pair, and the
 * catalog list travels between devices where a credential must not.
 */
describe('credential keys', () => {
  it('says what it is, and which half', () => {
    expect(passwordIdFor({ id: 'gutenberg' })).toBe('orbis-book-source-gutenberg-password');
    expect(usernameIdFor({ id: 'gutenberg' })).toBe('orbis-book-source-gutenberg-username');
  });

  it('folds an id the secret store would refuse', () => {
    // `app.secretStorage` takes lowercase alphanumerics and dashes and throws on anything else, so a settings row
    // must not be able to throw on an id that arrived by hand.
    expect(passwordIdFor({ id: 'Calibre Local' })).toBe('orbis-book-source-calibre-local-password');
  });

  it('can never make a username key equal a password key', () => {
    // The property is free — one ends `-username` and the other `-password` — and it is the collision people worry
    // about first, so it is worth a test that would notice if a suffix were ever dropped.
    const ids = ['a', 'a-username', 'a-password', 'catalog-1', 'x-username-password'];
    const passwords = new Set(ids.map((id) => passwordIdFor({ id })));
    for (const id of ids) expect(passwords.has(usernameIdFor({ id }))).toBe(false);
  });

  it('reads an empty username for a source nobody has signed into', () => {
    const app = { secretStorage: { getSecret: () => null } };
    expect(readUsername(app, { id: 'x' })).toBe('');
  });
});

/**
 * Storing and reading the pair. **What these cover is the drift, not the widget**: the fault they guard is a
 * dialog storing the *name* of a linked secret where the fetch expects a password (see the note on
 * `readPassword`), which no unit test can see — both are strings. What is worth holding is that the two
 * sides go through the same two functions, that a plaintext value survives the round trip, and that one half
 * cannot overwrite the other.
 */
describe('storing a credential', () => {
  /** `withDelete: false` is the runtime Obsidian's typings describe — the fallback path, which a Mac cannot reach. */
  const store = (withDelete = true) => {
    const kept = new Map<string, string>();
    const secretStorage: {
      getSecret(id: string): string | null;
      setSecret(id: string, secret: string): void;
      deleteSecret?(id: string): boolean;
    } = {
      getSecret: (id: string) => kept.get(id) ?? null,
      setSecret: (id: string, secret: string) => void kept.set(id, secret),
    };
    if (withDelete) secretStorage.deleteSecret = (id: string) => kept.delete(id);
    return { kept, secretStorage };
  };

  it('round-trips what the reader typed, under the key the fetch reads', () => {
    const app = store();
    writePassword(app, { id: 'calibre-home' }, 'hunter2');
    expect(readPassword(app, { id: 'calibre-home' })).toBe('hunter2');
    expect(app.kept.get('orbis-book-source-calibre-home-password')).toBe('hunter2');
  });

  it('keeps a password exactly as it was typed, spaces included', () => {
    // A space can be part of a password, and dropping one silently gives a 401 with nothing to look at.
    const app = store();
    writePassword(app, { id: 'x' }, ' two words ');
    expect(readPassword(app, { id: 'x' })).toBe(' two words ');
  });

  it('trims a username, where a stray space is always a slip', () => {
    const app = store();
    writeUsername(app, { id: 'x' }, '  reader@example.com \n');
    expect(readUsername(app, { id: 'x' })).toBe('reader@example.com');
  });

  it('keeps the two halves apart', () => {
    const app = store();
    writeUsername(app, { id: 'x' }, 'reader@example.com');
    writePassword(app, { id: 'x' }, 'hunter2');
    expect(readUsername(app, { id: 'x' })).toBe('reader@example.com');
    expect(readPassword(app, { id: 'x' })).toBe('hunter2');
  });

  it('stores a blank password as a blank password, which is a real credential', () => {
    // Standard Ebooks' membership feed authenticates as an email address with nothing beside it.
    const app = store();
    writeUsername(app, { id: 'standard-ebooks' }, 'reader@example.com');
    writePassword(app, { id: 'standard-ebooks' }, '');
    expect(readPassword(app, { id: 'standard-ebooks' })).toBe('');
  });

  /**
   * `saveCredential`, which is the dialog's Save. **The rule with teeth is the first test**: a source nobody signs
   * into must leave nothing behind, or every catalog a reader opens the dialog on adds two empty entries to their
   * Keychain — and a plugin cannot remove them.
   */
  describe('saveCredential', () => {
    const keep = { username: '', password: null };

    it('writes nothing when neither half was touched', () => {
      const app = store();
      expect(saveCredential(app, { id: 'gutenberg' }, keep, '')).toEqual([]);
      expect(app.kept.size).toBe(0);
    });

    it('writes only the half that changed', () => {
      const app = store();
      expect(saveCredential(app, { id: 'x' }, { username: 'reader', password: null }, '')).toEqual(['username']);
      expect(app.kept.size).toBe(1);
      expect(readUsername(app, { id: 'x' })).toBe('reader');
    });

    it('does not count a stray space as a change to the username', () => {
      // Trimmed is what `writeUsername` would store, so this really is the same value — and writing it would be an
      // edit the reader did not make.
      const app = store();
      expect(saveCredential(app, { id: 'x' }, { username: ' reader ', password: null }, 'reader')).toEqual([]);
    });

    // The dialog never holds the saved password, so an empty field means "keep it", not "it is empty".
    it('keeps a saved password the reader left alone', () => {
      const app = store();
      writePassword(app, { id: 'x' }, 'hunter2');
      expect(saveCredential(app, { id: 'x' }, { username: '', password: null }, '')).toEqual([]);
      expect(readPassword(app, { id: 'x' })).toBe('hunter2');
    });

    it('replaces it with one typed, spaces and all', () => {
      const app = store();
      writePassword(app, { id: 'x' }, 'hunter2');
      expect(saveCredential(app, { id: 'x' }, { username: '', password: 'two words' }, '')).toEqual(['password']);
      expect(readPassword(app, { id: 'x' })).toBe('two words');
    });

    // Removed means gone from the Keychain — not an entry left there holding an empty string.
    it('removes it when asked, entry and all, which is how a credential is revoked', () => {
      const app = store();
      writeUsername(app, { id: 'x' }, 'reader');
      writePassword(app, { id: 'x' }, 'hunter2');
      expect(saveCredential(app, { id: 'x' }, { username: '', password: '' }, 'reader')).toEqual([
        'username',
        'password',
      ]);
      expect(app.kept.size).toBe(0);
      expect(readUsername(app, { id: 'x' })).toBe('');
      expect(readPassword(app, { id: 'x' })).toBe('');
    });

    it('blanks it instead on an Obsidian with no way to delete a secret', () => {
      const app = store(false);
      writePassword(app, { id: 'x' }, 'hunter2');
      saveCredential(app, { id: 'x' }, { username: '', password: '' }, '');
      expect(app.kept.get('orbis-book-source-x-password')).toBe('');
    });

    it('writes both halves for a source being created', () => {
      // The point of minting the id before the dialog opens: a new source can be signed into in the same visit.
      const app = store();
      const next = { username: 'reader@example.com', password: 'hunter2' };
      expect(saveCredential(app, { id: 'catalog-new' }, next, '')).toEqual(['username', 'password']);
      expect(app.kept.get('orbis-book-source-catalog-new-username')).toBe('reader@example.com');
      expect(app.kept.get('orbis-book-source-catalog-new-password')).toBe('hunter2');
    });
  });

  /**
   * `forgetCredential`, which runs when a source is deleted. **The entry has to be gone, not empty** — an emptied one
   * is litter named after a catalog that no longer exists, and nothing in Orbis can ever match it back to anything.
   */
  describe('forgetCredential', () => {
    it('removes both halves from the store', () => {
      const app = store();
      writeUsername(app, { id: 'x' }, 'reader');
      writePassword(app, { id: 'x' }, 'hunter2');
      expect(forgetCredential(app, { id: 'x' })).toEqual(['username', 'password']);
      expect(app.kept.size).toBe(0);
    });

    it('leaves another source’s credential alone', () => {
      const app = store();
      writePassword(app, { id: 'keep' }, 'hunter2');
      writePassword(app, { id: 'go' }, 'other');
      forgetCredential(app, { id: 'go' });
      expect(readPassword(app, { id: 'keep' })).toBe('hunter2');
    });

    it('does nothing for a source nobody signed into', () => {
      // A public catalog has no entries, and creating one in order to delete it would be the litter this avoids.
      const app = store();
      expect(forgetCredential(app, { id: 'gutenberg' })).toEqual([]);
      expect(app.kept.size).toBe(0);
    });

    it('empties the value when the runtime cannot delete — the documented API', () => {
      // `obsidian.d.ts` declares no `deleteSecret`, so this branch is what a runtime matching the typings would take.
      // Worse than removing it, and better than leaving a live password behind.
      const app = store(false);
      writePassword(app, { id: 'x' }, 'hunter2');
      expect(forgetCredential(app, { id: 'x' })).toEqual(['password']);
      expect(readPassword(app, { id: 'x' })).toBe('');
    });
  });
});

/**
 * The one collision a derived key can produce: two ids that FOLD to the same string, which only a hand-edited
 * `data.json` can bring about. Orbis's own ids are `catalog-<base36>` and lowercase built-in slugs, so the fold is
 * the identity function in practice.
 */
describe('withUniqueSourceIds', () => {
  const src = (id: string): BookSource => ({ id, name: id, url: 'https://x/opds', enabled: true, builtin: false });
  let n = 0;
  const newId = () => `catalog-fresh${(n += 1)}`;

  beforeEach(() => {
    n = 0;
  });

  it('returns the SAME array when nothing collides, so a load saves nothing for nothing', () => {
    const list = [src('gutenberg'), src('catalog-abc')];
    expect(withUniqueSourceIds(list, newId)).toBe(list);
  });

  it('re-identifies the later of two ids that fold together', () => {
    const list = [src('calibre-local'), src('Calibre Local')];
    const out = withUniqueSourceIds(list, newId);
    expect(out[0].id).toBe('calibre-local'); // the first keeps its id and its credential
    expect(out[1].id).toBe('catalog-fresh1');
    expect(passwordIdFor(out[0])).not.toBe(passwordIdFor(out[1]));
  });

  it('leaves an unusual id alone when it collides with nothing', () => {
    const list = [src('Calibre Local')];
    expect(withUniqueSourceIds(list, newId)).toBe(list);
  });

  it('catches two long ids that only collide once they are cut to length', () => {
    // The second collision a derived key can produce, and the reason the cut needs no separate handling: it makes
    // two ids agreeing for their first 37 characters fold together, which is a fold collision like any other.
    const list = [src(`${'a'.repeat(40)}-one`), src(`${'a'.repeat(40)}-two`)];
    const out = withUniqueSourceIds(list, newId);
    expect(out[1].id).toBe('catalog-fresh1');
    expect(passwordIdFor(out[0])).not.toBe(passwordIdFor(out[1]));
  });

  it('keeps going until the fresh id is free too', () => {
    const list = [src('catalog-fresh1'), src('dup'), src('dup')];
    const out = withUniqueSourceIds(list, newId);
    expect(out[2].id).toBe('catalog-fresh2');
  });

  it('does not edit the source it was given', () => {
    const list = [src('dup'), src('dup')];
    withUniqueSourceIds(list, newId);
    expect(list[1].id).toBe('dup');
  });
});
