// The book sources a reader has configured, as data. See docs/design/book-sources.md.
//
// Pure: no App, no network, no settings object. Everything here is a rule about the list — which entries survive an
// upgrade, where a password is kept, what counts as a usable URL — and each of those is a rule worth being able to
// test without a vault or a server.
//
// The network lives in the OPDS client; the interface lives in the settings page and the browser. This module is what
// they agree about.

import { type BookSource, BUILTIN_BOOK_SOURCES } from '../settings';

/**
 * The stored list, reconciled with the sources this version ships.
 *
 * Three rules, and each answers a state an upgrade reaches on its own — the same reconciliation the look-up
 * destinations do, for the same reasons:
 *
 * - **A built-in keeps the reader's `enabled` and position, and takes our name and URL.** A catalog endpoint that
 *   moves is ours to fix, and a fix that only reached fresh installs would be no fix at all. Order is the reader's:
 *   forcing canonical order here would silently undo a list they arranged.
 * - **A stored entry claiming to be built-in that we no longer ship is dropped.** Otherwise a retired source sits in
 *   the list forever with a URL nothing maintains.
 * - **A new built-in is appended**, rather than inserted where we would have put it: the end of the list is the one
 *   place that cannot disturb what is already there.
 *
 * A user's own source passes through untouched. `language` survives on a built-in too: it is a decision about the
 * catalog rather than a fact about the endpoint, and not ours to reset because we fixed a URL. The credential is not
 * here to survive at all — it is in the Keychain, keyed by the source's id, which a URL fix does not change.
 */
export function mergeBookSources(
  stored: readonly BookSource[] | undefined,
  builtins: readonly BookSource[] = BUILTIN_BOOK_SOURCES
): BookSource[] {
  const byId = new Map(builtins.map((b) => [b.id, b]));
  const merged: BookSource[] = [];
  const seen = new Set<string>();
  for (const source of stored ?? []) {
    const builtin = byId.get(source.id);
    if (builtin) {
      merged.push({ ...builtin, enabled: source.enabled, language: source.language });
      seen.add(source.id);
    } else if (!source.builtin) {
      merged.push(source);
      seen.add(source.id);
    }
  }
  for (const builtin of builtins) if (!seen.has(builtin.id)) merged.push({ ...builtin });
  return merged;
}

/** The sources a browse action may reach: switched on, and with somewhere to go. */
export function enabledSources(sources: readonly BookSource[]): BookSource[] {
  return sources.filter((source) => source.enabled && source.url.trim().length > 0);
}

/**
 * Where a source's credentials are kept — **both halves, in the device's own secret store.**
 *
 * ```
 * orbis-book-source-<id>-password
 * orbis-book-source-<id>-username
 * ```
 *
 * Named so that a reader looking at Obsidian's Keychain tab can tell what they are looking at. A shorter
 * `orbis-source-<id>` would read `orbis-source-user-mt4mi2be…` for a reader-created source — the "user" being the id
 * prefix rather than a username, which is exactly the wrong thing for a key holding a password to appear to say.
 *
 * **The suffix matches the label on the field**, because the dialog shows the source's id read-only for exactly one
 * purpose: matching an entry in the Keychain to the catalog it opens. A row labeled "Username" beside an entry
 * ending `-account` would break the one job that row has.
 *
 * **Derived from the source's id rather than stored beside it**, so there is one place a credential can be and no
 * field that could disagree with it.
 *
 * **The two suffixes can never collide with each other**: one key ends `-password` and the other `-username`, so no
 * pair of ids can make one key equal the other. What CAN collide is the fold below, and that is what
 * `withUniqueSourceIds` exists to catch.
 */
const SECRET_PREFIX = 'orbis-book-source-';
const PASSWORD_SUFFIX = '-password';
const USERNAME_SUFFIX = '-username';

/**
 * How long a secret id may be, and therefore how much of the source id fits between the prefix and a suffix.
 *
 * **`setSecret` throws above 64 characters** — the same rule as the character set, and the same consequence: the
 * throw would land inside a field's change handler, which is a dialog breaking while somebody types in it. Both
 * suffixes are the same length by design, so there is one budget rather than two.
 *
 * Nothing Orbis mints comes close — `catalog-<base36>` is around twenty characters — so this is a guard against an
 * id that arrived by hand-editing `data.json`, exactly like the fold itself.
 */
const MAX_SECRET_ID = 64;
const MAX_FOLDED_ID = MAX_SECRET_ID - SECRET_PREFIX.length - Math.max(PASSWORD_SUFFIX.length, USERNAME_SUFFIX.length);

/**
 * The id as a secret key may spell it: `app.secretStorage` takes lowercase alphanumerics and dashes and throws on
 * anything else, so anything else becomes a dash — and it throws above 64 characters, so a long one is cut.
 *
 * **Not injective, deliberately.** `Calibre Local`, `calibre/local` and `calibre_local` all fold to `calibre-local`,
 * and two ids agreeing for their first 37 characters fold together too. Orbis's own ids are already safe and far
 * inside the limit, so this is the identity function in practice; an id that arrived by hand-editing is caught by
 * `withUniqueSourceIds` rather than by making this uglier.
 *
 * The trailing dashes go after the cut, not before it: cutting mid-word can leave one, and `…--password` reads like a
 * mistake in a list a reader is trying to match against a dialog.
 */
function foldId(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .slice(0, MAX_FOLDED_ID)
    .replace(/-+$/, '');
}

export function passwordIdFor(source: Pick<BookSource, 'id'>): string {
  return `${SECRET_PREFIX}${foldId(source.id)}${PASSWORD_SUFFIX}`;
}

export function usernameIdFor(source: Pick<BookSource, 'id'>): string {
  return `${SECRET_PREFIX}${foldId(source.id)}${USERNAME_SUFFIX}`;
}

/**
 * Reading and writing the pair, in one place, because the dialog and the fetch have to agree about it.
 *
 * **Not Obsidian's `SecretComponent`.** Its value is the *id* of a secret the reader has linked rather than the secret
 * itself — `setValue(id)` displays a peek of it and the picker reports the id it chose — so a dialog built on it stores
 * the name of a secret where `authHeader` expects a password, and nothing can tell: both are strings, both round-trip,
 * and only a real catalog answering 401 would say so. Both sides call the same two functions, and the store is only
 * ever handed a plaintext value.
 *
 * The trimming is deliberately asymmetric. A username is trimmed — a trailing space on an email address is always a
 * slip, and a leading one is invisible in the field. A password is NOT: a space can be part of one, and dropping it
 * silently gives a 401 with nothing to look at.
 *
 * **"Username", not "account name"** — the label and these names both. OPDS says nothing about credentials: it defers
 * to HTTP, where this is Basic authentication and RFC 7617 calls the two parts `user-id` and `password`. Every place a
 * to HTTP, where this is Basic authentication and RFC 7617 calls the two parts `user-id` and `password`. Every place a
 * reader has met it — a browser's authentication prompt, Calibre's own content-server login — says Username, so
 * "account name" would be a coinage of ours with nothing behind it.
 */
type SecretReader = { secretStorage: { getSecret(id: string): string | null } };
type SecretWriter = SecretReader & { secretStorage: { setSecret(id: string, secret: string): void } };

/**
 * **`deleteSecret` is optional here because it is missing from the typings, not from Obsidian.**
 *
 * `SecretStorage` in `obsidian.d.ts` (1.13.1, the newest published) declares only `getSecret`, `setSecret` and
 * `listSecrets`, while the app itself (1.13.7) also implements `deleteSecret(id): boolean` and `peekSecret(id)` — the
 * Keychain tab's own rename is a delete followed by a set. Declaring it optional rather than casting means the
 * fallback below is a branch the compiler can see, so a runtime that really lacks it degrades instead of throwing.
 */
type SecretRemover = SecretWriter & { secretStorage: { deleteSecret?(id: string): boolean } };

/** The username this device holds for a source, or '' — a source may legitimately need none. */
export function readUsername(app: SecretReader, source: Pick<BookSource, 'id'>): string {
  return app.secretStorage.getSecret(usernameIdFor(source)) ?? '';
}

/** The password this device holds for a source, or '' — which for a membership feed is a real answer. */
export function readPassword(app: SecretReader, source: Pick<BookSource, 'id'>): string {
  return app.secretStorage.getSecret(passwordIdFor(source)) ?? '';
}

export function writeUsername(app: SecretWriter, source: Pick<BookSource, 'id'>, value: string): void {
  app.secretStorage.setSecret(usernameIdFor(source), value.trim());
}

export function writePassword(app: SecretWriter, source: Pick<BookSource, 'id'>, value: string): void {
  app.secretStorage.setSecret(passwordIdFor(source), value);
}

/**
 * Forget a source's credential, both halves, when the source itself is deleted.
 *
 * **Deleted, not blanked**: emptying the value would leave two entries in the reader's Keychain named after a catalog
 * that no longer exists, which is litter nothing in Orbis can ever clean up and which cannot be matched back to
 * anything, since the source whose id named them is gone.
 *
 * Answers what it managed to remove, so a caller could say so; nothing does yet. A missing `deleteSecret` falls back to
 * blanking — worse, but better than leaving a live password behind.
 */
export function forgetCredential(app: SecretRemover, source: Pick<BookSource, 'id'>): (keyof Credential)[] {
  const forgotten: (keyof Credential)[] = [];
  for (const [half, id] of [
    ['username', usernameIdFor(source)],
    ['password', passwordIdFor(source)],
  ] as const) {
    if (removeSecret(app, id)) forgotten.push(half);
  }
  return forgotten;
}

/**
 * Take one secret out of the store: deleted, so Obsidian's Keychain no longer lists it — or blanked, on a version
 * without `deleteSecret`. False when nothing was ever stored, which leaves nothing to remove.
 */
function removeSecret(app: SecretRemover, id: string): boolean {
  const store = app.secretStorage;
  if (store.getSecret(id) === null) return false;
  if (store.deleteSecret) store.deleteSecret(id);
  else store.setSecret(id, '');
  return true;
}

/** Both halves as one value, which is how the dialog holds them and how they are compared. */
export interface Credential {
  username: string;
  password: string;
}

/**
 * What the dialog asks to be stored: a username, and what to do about the password.
 *
 * **The password is never read back into the dialog**, so the dialog cannot say what it was — only what to do: `null`
 * keeps the saved one (the field was left empty), `''` removes it (**Remove password**), anything else replaces it.
 */
export interface CredentialEdit {
  username: string;
  password: string | null;
}

/**
 * Store a credential pair, **writing only the halves that changed**, and answer which halves were written.
 *
 * Here rather than in the dialog because the interesting part is the comparison, and the dialog is not a layer a test
 * can reach. The rule it enforces: an untouched half is not written at all. Otherwise merely opening a source's dialog
 * and pressing Save would put an empty entry in the reader's Keychain for a catalog that never asked for a login —
 * one per source, accumulating, none of them removable by a plugin.
 *
 * `heldUsername` is what the store said when the dialog opened. The username is compared **after trimming**, because
 * trimmed is what `writeUsername` would store, so retyping the same name with a stray space is not a change. The
 * password has no "held" to compare with — the dialog never has it — so it is written only when the reader asked for
 * something: a new one, or its removal. Removing writes an empty value, which is how a reader revokes a credential
 * they no longer want on this device.
 */
export function saveCredential(
  app: SecretRemover,
  source: Pick<BookSource, 'id'>,
  next: CredentialEdit,
  heldUsername: string
): (keyof Credential)[] {
  const written: (keyof Credential)[] = [];
  // **Cleared is removed, not stored empty** — the entry leaves the Keychain, as deleting the whole source does, rather
  // than staying listed with nothing in it. See `removeSecret`.
  if (next.username.trim() !== heldUsername) {
    if (next.username.trim() === '') removeSecret(app, usernameIdFor(source));
    else writeUsername(app, source, next.username);
    written.push('username');
  }
  if (next.password !== null) {
    if (next.password === '') removeSecret(app, passwordIdFor(source));
    else writePassword(app, source, next.password);
    written.push('password');
  }
  return written;
}

/**
 * Make sure no two sources share a credential key.
 *
 * **Acts on the collision, not on a proxy for it.** Two ids that fold to one key would have two sources quietly
 * sharing a password, which is the one failure a derived key can produce. So the check computes the keys and compares
 * them; an unusual id that collides with nothing is left exactly as it is.
 *
 * The later source is re-identified, which costs it whatever credential was stored under the ambiguous key — correct,
 * because that credential belonged to no one source in particular. It arrives unauthenticated instead, which is
 * visible rather than silent.
 *
 * Returns the same array when nothing collides, so a load does not save settings for nothing.
 */
export function withUniqueSourceIds(sources: readonly BookSource[], newId: () => string): BookSource[] {
  const taken = new Set<string>();
  let clashed = false;
  const out = sources.map((source) => {
    const key = foldId(source.id);
    if (!taken.has(key)) {
      taken.add(key);
      return source;
    }
    clashed = true;
    let fresh = newId();
    while (taken.has(foldId(fresh))) fresh = newId();
    taken.add(foldId(fresh));
    return { ...source, id: fresh };
  });
  return clashed ? out : (sources as BookSource[]);
}

/**
 * Whether a URL is one we can fetch.
 *
 * Deliberately shallow: `http` or `https` and nothing else. A stricter check here would be guessing at what an OPDS
 * endpoint looks like — Calibre's is a port on a local host, Gutenberg's ends in a slash, and a feed can be a path,
 * a query or a file. What the URL actually is gets answered by fetching it, which is where a real error message
 * comes from.
 *
 * `http` is allowed, because a Calibre content server on a home network usually is not encrypted — refusing it would
 * refuse the source most likely to be someone's whole library.
 */
export function isUsableSourceUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url.trim());
}
