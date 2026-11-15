// Runtime patches required for foliate-js to work inside Obsidian/Electron.
// Adapted from obsidian-weave-reader's foliate-runtime-patches.ts.
//
// One of them is a security control rather than a compatibility shim: every book document passes through
// `loadViaSrcdoc` below and is hardened on the way — see `reader/book-html-guard.ts` for what that means and
// why foliate's README insists on it.
//
// **Every patch comes off when the plugin unloads** (`removeFoliatePatches`, from `onunload`). They change
// `HTMLIFrameElement.prototype` in Obsidian's own window; left on, each reload of the plugin added another layer and
// kept the previous version's code alive until Obsidian restarted. See `runtime-patch.ts` for how a patch is taken off
// without taking another plugin's with it.

import { type App, Notice } from 'obsidian';
import { BUILD_TIME } from './build-info';
import { t } from './i18n';
import {
  type PreparedChapter,
  parseBookHtml,
  plainTextChapter,
  prepareBookDoc,
  prepareBookHtml,
  SETTLING_PASSES,
} from './reader/book-html-guard';
import { inlineBlobStylesheets } from './reader/book-styles';
import { keepChapterInPlace } from './reader/chapter-navigation';
import { logToLibrary } from './reader/DebugLog';
import { type Unpatch, wrapMethod, wrapSetter } from './runtime-patch';

let sandboxPatch: Unpatch | null = null;
let srcdocPatches: Unpatch[] | null = null;
/** Whether the srcdoc patch holds the frame's `src` setter — the one road every chapter takes. */
let srcdocGuarded = false;

/**
 * A book was about to open in a reader whose protection could not be put in place. Thrown by
 * `installFoliateSrcdocPatch`; `describeOpenFailure` words it.
 */
export class UnprotectedReaderError extends Error {
  constructor() {
    super('the srcdoc patch could not hold the frame’s src setter');
    this.name = 'UnprotectedReaderError';
  }
}

/** The debug log's words for why a chapter is shown as plain text — see `PreparedChapter`. */
const PLAIN_TEXT_REASONS: Record<NonNullable<PreparedChapter['plainText']>, string> = {
  unparseable: 'it could not be parsed',
  unsettled: `hardening it was still changing it after ${SETTLING_PASSES} checks`,
  failed: 'a step of the hardening threw',
};

/** Take every patch off — the plugin is unloading. Newest first, the reverse of how they went on. */
export function removeFoliatePatches(): void {
  for (const unpatch of [...(srcdocPatches ?? [])].reverse()) unpatch();
  sandboxPatch?.();
  srcdocPatches = null;
  sandboxPatch = null;
  srcdocGuarded = false;
}

let staleRendererReported = false;

/** Which build registered `foliate-view` — kept on the class itself, which outlives the plugin's code. */
const BUILT_BY = Symbol.for('orbis-reader.renderer-build');
type Stamped = CustomElementConstructor & { [BUILT_BY]?: string };

/**
 * Mark this load's renderer with its build, when this load is the one that registered it. Called as the reader's code
 * is first read, so even a load that never opens a book leaves its mark for the next one to read.
 */
export function stampRenderer(current: CustomElementConstructor | undefined): void {
  if (current && customElements.get('foliate-view') === current) (current as Stamped)[BUILT_BY] = BUILD_TIME;
}

/**
 * Say so when books are about to open with an earlier build's renderer.
 *
 * **A custom element cannot be unregistered.** foliate defines `foliate-view`, `foliate-paginator` and `foliate-fxl`
 * when the plugin's code is first read, and ORBIS patch 21 skips the definition when one already exists — so after a
 * reload the elements are still the classes the PREVIOUS load registered, and any change to foliate's own code waits
 * for Obsidian to restart. Orbis's own code is current; the renderer is not.
 *
 * **Only a different build is news.** Turning the plugin off and on reloads the same code, so its renderer is a
 * different class with the same contents: logged, not announced. An update or a new build is announced once per load,
 * because restarting Obsidian is the one thing that fixes it, and logged every time.
 */
export function reportStaleRenderer(current: CustomElementConstructor | undefined, log: (msg: string) => void): void {
  const registered: Stamped | undefined = customElements.get('foliate-view');
  if (!registered || !current || registered === current) return;
  const builtBy = registered[BUILT_BY];
  if (builtBy === BUILD_TIME) {
    log(`foliate-view is from an earlier load of this same build (${BUILD_TIME}) — nothing to restart for`);
    return;
  }
  log(`foliate-view is from build ${builtBy ?? 'unknown'}, this is ${BUILD_TIME} — restart Obsidian to load this one`);
  if (staleRendererReported) return;
  staleRendererReported = true;
  new Notice(t('notices.restart_to_finish_update'));
}

// foliate-js sets `sandbox="allow-scripts allow-same-origin"` on its iframes, a pair that is no sandbox at all. This
// patch removes `allow-scripts` as foliate sets it, so nothing the frame ever holds can run a script — a chapter, or a
// document some route sent the frame to.
//
// **Everywhere but iPhone and iPad.** WebKit stops a frame without `allow-scripts` dispatching DOM events to
// listeners in Obsidian's window (WebKit bug 218086), and annotations and selection depend on them. Android is
// Chromium, like the desktop, and was measured working without it: selection, marks, look-up, page turns, links.
export function installNoScriptSandboxPatch(): void {
  if (sandboxPatch) return;
  if (typeof HTMLIFrameElement === 'undefined') return;

  sandboxPatch = wrapMethod(
    HTMLIFrameElement.prototype,
    'setAttribute',
    (original) =>
      function patchedSetAttribute(this: unknown, ...args: unknown[]): unknown {
        const [name, value] = args as [string, string];
        const frame = this as HTMLIFrameElement;
        if (name.toLowerCase() === 'sandbox') {
          // **The `part` test is the one that decides**, so both frame builders set `part` before `sandbox` (ORBIS
          // patch 17). The stack test never matches a release: the bundle names every frame `plugin:orbis-reader`.
          const stack = new Error().stack ?? '';
          const isFoliateFrame =
            stack.includes('foliate-js') ||
            frame.getAttribute('part')?.split(/\s+/).includes('filter') ||
            // ShadowRoot is a DocumentFragment (nodeType 11) with a `host`; this nodeType check
            // is cross-window-safe where `instanceof ShadowRoot` would fail across realms.
            ((frame.getRootNode() as ShadowRoot).nodeType === Node.DOCUMENT_FRAGMENT_NODE &&
              (frame.getRootNode() as ShadowRoot).host?.tagName?.toLowerCase() === 'foliate-view');

          if (isFoliateFrame) {
            const filtered = value
              .split(/\s+/)
              .filter((t) => t.toLowerCase() !== 'allow-scripts')
              .join(' ');
            return Reflect.apply(original, this, [name, filtered]);
          }
        }
        return Reflect.apply(original, this, args);
      }
  );
}

// foliate-js paginator sets `iframe.src = blob_url` to load each chapter. Read the blob via XHR and set srcdoc
// instead: the document is then same-origin with the host page, so our listeners see its events (on iOS WKWebView a
// `blob:` frame gets an opaque origin and none reach us), and its text passes through the guard before it loads.
//
// Covers BOTH the IDL property setter (iframe.src = url) and
// setAttribute('src', url) since foliate may use either.
//
// `app` is for the debug log, which hears when a chapter is shown as plain text and why. The app, not a view: the
// patch outlives the view that installed it, and every view shares the one app.
//
// **Fails closed.** foliate loads every chapter by assigning the frame's `src`; if that setter cannot be wrapped, every
// chapter would load as it came, unhardened, with a script-enabled sandbox on iPhone and iPad. So this throws
// `UnprotectedReaderError` and the book does not open. No engine Orbis runs on refuses today: the setter is an
// ordinary configurable accessor, as the web's IDL rules make it.
export function installFoliateSrcdocPatch(app?: App): void {
  if (srcdocPatches) {
    if (!srcdocGuarded) throw new UnprotectedReaderError();
    return;
  }
  // A log line is never worth a chapter: writing one can throw (a full local storage, a panel that fails to draw), and
  // it sits on the path that sets the frame's document.
  const log = (msg: string) => {
    try {
      if (app) logToLibrary({ app }, msg, 'display');
    } catch {
      // the chapter matters more than the line
    }
  };
  if (typeof HTMLIFrameElement === 'undefined') return;

  const isFoliateIframe = (el: HTMLIFrameElement): boolean =>
    el.getAttribute('part')?.split(/\s+/).includes('filter') === true ||
    ((el.getRootNode() as ShadowRoot).nodeType === Node.DOCUMENT_FRAGMENT_NODE &&
      (el.getRootNode() as ShadowRoot).host?.tagName?.toLowerCase() === 'foliate-view');

  // XHR rather than fetch: it reads a same-origin `blob:` URL on every engine Orbis runs on.

  /**
   * **Nothing in here may be able to stop a chapter appearing.**
   *
   * Reading the stylesheets makes the preparation asynchronous, and the failure mode of an asynchronous step that never
   * finishes is not a book without CSS — it is a reader stuck on "Loading content…" with no error anywhere, because
   * `srcdoc` is simply never assigned. A rejected promise does it too, through the `void` on the call.
   * So every await below is bounded and every path ends with the document being set.
   */
  const STYLESHEET_TIMEOUT_MS = 4000;

  const withTimeout = <T>(work: Promise<T>, ms: number, what: string): Promise<T> =>
    Promise.race([
      work,
      new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms)),
    ]);

  /**
   * Read a `blob:` URL this origin created. XHR rather than `fetch` for the same reason the chapter itself uses
   * it — see the note above — and promisified so the stylesheet work can be awaited.
   *
   * `onabort` and `ontimeout` are handled as well as `onerror`: an XHR that ends any other way leaves its promise
   * pending forever, and one pending promise inside a `Promise.all` is enough to hold the whole chapter.
   */
  const readBlobText = (url: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.responseType = 'text';
      xhr.timeout = STYLESHEET_TIMEOUT_MS;
      xhr.onload = () =>
        xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)
          ? resolve(xhr.responseText)
          : reject(new Error(`status ${xhr.status}`));
      xhr.onerror = () => reject(new Error('xhr error'));
      xhr.onabort = () => reject(new Error('xhr aborted'));
      xhr.ontimeout = () => reject(new Error('xhr timed out'));
      xhr.send();
    });

  /**
   * **One parse, two jobs.** The book's `blob:` stylesheets are inlined (see `inlineBlobStylesheets` for why they
   * have to be) and then the document is hardened, both against the same `Document`. Parsing is the expensive
   * half — 180-230ms for a 1 MB chapter — so doing it twice would be felt every time a display setting changes.
   *
   * **The document is set either way.** If the stylesheet work throws, the chapter still renders, hardened, with
   * whatever sheets survived: a book missing its CSS is degraded, not broken. What must not happen is a chapter that
   * never appears because a stylesheet 404'd.
   */
  const prepareSrcdoc = async (html: string): Promise<PreparedChapter> => {
    const started = performance.now();
    const doc = parseBookHtml(html);
    if (!doc) return prepareBookHtml(html); // unparseable: the chapter's text, as `prepareBookHtml` gives it
    const parsed = performance.now();
    try {
      await withTimeout(inlineBlobStylesheets(doc, readBlobText), STYLESHEET_TIMEOUT_MS, 'inlining book stylesheets');
    } catch (err) {
      console.error('[Orbis] srcdoc patch: could not inline book stylesheets —', err);
    }
    const inlined = performance.now();
    const chapter = prepareBookDoc(doc, html);
    const { harden = 0, settle = 0 } = chapter.ms ?? {};
    const ms = (n: number) => Math.round(n);
    log(
      `chapter prepared: ${ms(html.length / 1024)} KB in ${ms(performance.now() - started)} ms — parse ${ms(parsed - started)}, ` +
        `stylesheets ${ms(inlined - parsed)}, harden ${ms(harden)}, settle ${ms(settle)}`
    );
    return chapter;
  };

  /**
   * **Which load a finished document belongs to.**
   *
   * Preparing the document is asynchronous because the stylesheets are, and foliate reuses one iframe for every
   * chapter — so a second `src` assignment can arrive while the first is still reading its sheets. Without a
   * token the slower of the two wins the `srcdoc` write and the reader lands on the wrong chapter, which is the
   * kind of fault that shows up once in twenty page turns and gets blamed on everything else. Each load stamps
   * the element and only writes if its stamp is still the current one.
   */
  const loadToken = new WeakMap<HTMLIFrameElement, object>();

  /**
   * **Every document the frame loads stays in it** (`keepChapterInPlace`): a listener on the frame, once per frame,
   * so it covers each chapter, and a document the browser reloads itself — a moved pane — as well as Orbis's.
   */
  const guardedFrames = new WeakSet<HTMLIFrameElement>();
  let reportedNoNavigationApi = false;
  const guardFrame = (el: HTMLIFrameElement): void => {
    if (guardedFrames.has(el)) return;
    guardedFrames.add(el);
    el.addEventListener('load', () => {
      let guarded: boolean;
      try {
        guarded = keepChapterInPlace(el.contentWindow, log);
      } catch (err) {
        log(`could not keep the chapter in its frame — ${String(err)}`);
        return;
      }
      if (guarded || reportedNoNavigationApi) return;
      reportedNoNavigationApi = true;
      log('this device has no Navigation API: only a tap inside SVG is kept from leaving the chapter');
    });
  };

  /**
   * **A chapter that cannot be read gets an empty document, never its own unhardened one.** Reading a chapter's
   * `blob:` URL fails only when the URL no longer exists — revoked, or never made (measured on the desktop) — and then
   * nothing could load it anyway. Handing it back to foliate, as this once did, loaded it unhardened under Obsidian's
   * own policy, and after a newer chapter had replaced it. The empty document still fires `load`, so the reader moves
   * on rather than waiting.
   */
  const loadViaSrcdoc = (el: HTMLIFrameElement, blobUrl: string): void => {
    guardFrame(el);
    const token = {};
    loadToken.set(el, token);
    const readNothing = (why: string): void => {
      console.error(`[Orbis] srcdoc patch: ${why} — the frame gets an empty document`);
      if (loadToken.get(el) === token) el.srcdoc = '';
    };
    const xhr = new XMLHttpRequest();
    xhr.open('GET', blobUrl);
    xhr.responseType = 'text';
    xhr.onload = () => {
      if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
        // The `catch` is the last guarantee: whatever went wrong, the chapter is still rendered, as its text. A book
        // without its CSS is degraded; a blank reader is worse.
        void prepareSrcdoc(xhr.responseText)
          .catch((): PreparedChapter => ({ html: plainTextChapter(xhr.responseText), plainText: 'failed' }))
          .then((chapter) => {
            if (loadToken.get(el) === token) el.srcdoc = chapter.html;
            if (chapter.plainText) log(`a chapter is shown as plain text — ${PLAIN_TEXT_REASONS[chapter.plainText]}`);
          });
      } else readNothing(`could not read the chapter (status ${xhr.status})`);
    };
    xhr.onerror = () => readNothing('could not read the chapter');
    xhr.send();
  };

  // Patch the IDL property setter
  const patches: Unpatch[] = [];
  const setterPatch = wrapSetter(
    HTMLIFrameElement.prototype,
    'src',
    (originalSet) =>
      function (this: unknown, value: unknown): void {
        if (typeof value === 'string' && value.startsWith('blob:') && isFoliateIframe(this as HTMLIFrameElement)) {
          loadViaSrcdoc(this as HTMLIFrameElement, value);
          return;
        }
        Reflect.apply(originalSet, this, [value]);
      }
  );
  if (setterPatch) patches.push(setterPatch);
  srcdocGuarded = setterPatch !== null;

  // Patch setAttribute('src', ...) as a belt-and-suspenders fallback
  patches.push(
    wrapMethod(
      HTMLIFrameElement.prototype,
      'setAttribute',
      (original) =>
        function patchedSetAttrSrc(this: unknown, ...args: unknown[]): unknown {
          const [name, value] = args as [string, unknown];
          const frame = this as HTMLIFrameElement;
          if (
            name.toLowerCase() === 'src' &&
            typeof value === 'string' &&
            value.startsWith('blob:') &&
            isFoliateIframe(frame)
          ) {
            loadViaSrcdoc(frame, value);
            return undefined;
          }
          return Reflect.apply(original, this, args);
        }
    )
  );

  srcdocPatches = patches;
  if (!srcdocGuarded) throw new UnprotectedReaderError();
}
