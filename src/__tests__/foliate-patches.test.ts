// The browser patches that let foliate load books in Obsidian come off when the plugin unloads, and a second load of
// the vendored foliate code does not throw.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installFoliateSrcdocPatch,
  installNoScriptSandboxPatch,
  removeFoliatePatches,
  reportStaleRenderer,
  stampRenderer,
} from '../foliate-patches';

/**
 * The fork's files Orbis builds in: those `view.js` reaches. The fork keeps upstream's others (`reader.js`, `pdf.js`,
 * `quote-image.js` and more) for merging, but Orbis never loads them, so the patch checks below skip them.
 */
const SHIPPED = [
  'comic-book.js',
  'epub.js',
  'epubcfi.js',
  'fb2.js',
  'fixed-layout.js',
  'mobi.js',
  'overlayer.js',
  'paginator.js',
  'progress.js',
  'search.js',
  'text-walker.js',
  'tts.js',
  'view.js',
];

const notices = vi.hoisted(() => [] as unknown[]);
vi.mock('obsidian', async (load) => ({
  ...(await load<object>()),
  Notice: class {
    constructor(message: unknown) {
      notices.push(message);
    }
  },
}));

declare const process: {
  getBuiltinModule(id: 'node:fs'): {
    readdirSync(p: string): string[];
    readFileSync(p: string, enc: 'utf8'): string;
    statSync(p: string): { isDirectory(): boolean };
  };
};

afterEach(() => removeFoliatePatches());

describe('removeFoliatePatches', () => {
  it('puts HTMLIFrameElement back exactly as it was', () => {
    const srcBefore = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
    const setAttributeBefore = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'setAttribute');
    installNoScriptSandboxPatch();
    installFoliateSrcdocPatch();
    expect(Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'setAttribute')).toBeDefined();
    expect(Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')).not.toEqual(srcBefore);

    removeFoliatePatches();
    expect(Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'setAttribute')).toEqual(setAttributeBefore);
    expect(Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')).toEqual(srcBefore);
  });

  // A reload: off, then on again. Before, each load stacked a layer the last one never removed.
  it('lets the patches go back on cleanly after coming off', () => {
    installFoliateSrcdocPatch();
    removeFoliatePatches();
    installFoliateSrcdocPatch();
    removeFoliatePatches();
    expect(Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'setAttribute')).toBeUndefined();
  });

  it('leaves an ordinary frame alone while installed', () => {
    installNoScriptSandboxPatch();
    installFoliateSrcdocPatch();
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    frame.setAttribute('src', 'about:blank');
    expect(frame.getAttribute('src')).toBe('about:blank');
  });

  it('strips allow-scripts from a foliate frame (everywhere but iPhone and iPad)', () => {
    installNoScriptSandboxPatch();
    const frame = document.createElement('iframe');
    frame.setAttribute('part', 'filter');
    frame.setAttribute('sandbox', 'allow-same-origin allow-scripts');
    expect(frame.getAttribute('sandbox')).toBe('allow-same-origin');
  });
});

/**
 * A chapter whose `blob:` URL cannot be read gets an empty document. The patch once handed
 * the URL back to foliate's own setter, which loaded the chapter unhardened, under Obsidian's policy.
 */
describe('a chapter that cannot be read', () => {
  const realXhr = globalThis.XMLHttpRequest;
  afterEach(() => {
    globalThis.XMLHttpRequest = realXhr;
  });

  /** An XMLHttpRequest that fails as reading a revoked `blob:` URL does: `error`, or `load` with a status. */
  const failingXhr = (status: number | 'error') =>
    class {
      status = typeof status === 'number' ? status : 0;
      responseType = '';
      responseText = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      open(): void {}
      send(): void {
        queueMicrotask(() => (status === 'error' ? this.onerror?.() : this.onload?.()));
      }
    } as unknown as typeof XMLHttpRequest;

  it.each(['error', 404] as const)('gets an empty document, never its own URL (%s)', async (failure) => {
    globalThis.XMLHttpRequest = failingXhr(failure);
    installFoliateSrcdocPatch();
    const frame = document.createElement('iframe');
    frame.setAttribute('part', 'filter');
    frame.src = 'blob:http://localhost/revoked';
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(frame.getAttribute('srcdoc')).toBe('');
    expect(frame.getAttribute('src')).toBeNull();
  });
});

describe('ORBIS patch 21', () => {
  // A plugin reload reads the vendored files again; an unguarded `define` would throw and stop the plugin loading.
  it('guards every custom element definition in the vendored foliate code', () => {
    const fs = process.getBuiltinModule('node:fs');
    const dir = 'node_modules/foliate-js';
    for (const file of SHIPPED) {
      const source = fs.readFileSync(`${dir}/${file}`, 'utf8');
      for (const m of source.matchAll(/customElements\.define\('([^']+)'/g)) {
        const line = source.slice(source.lastIndexOf('\n', m.index) + 1, source.indexOf('\n', m.index));
        expect(line, `${file}: ${m[1]}`).toContain(`if (!customElements.get('${m[1]}'))`);
      }
    }
  });

  /**
   * The guard is in foliate's own lines, so nothing replaces `customElements.define` for the window. The build once
   * did, in a banner prepended to main.js: never removed, a layer more on every reload, and every other plugin's
   * custom elements passing through it.
   */
  it('leaves customElements.define alone in the build and in Orbis’s own code', () => {
    const fs = process.getBuiltinModule('node:fs');
    expect(fs.readFileSync('esbuild.config.mjs', 'utf8')).not.toMatch(/customElements\.define\s*=/);
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir).flatMap((name: string) => {
        const path = `${dir}/${name}`;
        if (name === '__tests__') return [];
        if (fs.statSync(path).isDirectory()) return walk(path);
        return /\.[jt]s$/.test(name) ? [path] : [];
      });
    for (const file of walk('src'))
      expect(fs.readFileSync(file, 'utf8'), file).not.toMatch(/customElements\.define\s*=/);
  });
});

describe('ORBIS patch 22', () => {
  /**
   * Upstream copied a chapter's computed background onto elements in Obsidian's window, where a `url()` in it was
   * fetched outside every book policy, and cleared the body's background with an inline `none` that replaced Orbis's
   * inline page color. Nothing in a book reaches the page color, so no vendored file sets or copies a background.
   */
  it('copies no background from a book into the page, and clears none', () => {
    const fs = process.getBuiltinModule('node:fs');
    const dir = 'node_modules/foliate-js';
    for (const file of SHIPPED) {
      const source = fs.readFileSync(`${dir}/${file}`, 'utf8');
      expect(source, file).not.toMatch(/\.style\.background\s*=/);
      expect(source, file).not.toMatch(/docBackground/);
    }
  });
});

describe('reportStaleRenderer', () => {
  // The class an earlier load registered: an element cannot be unregistered, so it outlives that load's code.
  class EarlierView extends HTMLElement {}
  class ThisView extends HTMLElement {}
  customElements.define('foliate-view', EarlierView);
  const BUILT_BY = Symbol.for('orbis-reader.renderer-build');
  const stamp = (build: string | undefined) => {
    (EarlierView as unknown as Record<symbol, unknown>)[BUILT_BY] = build;
  };

  it('stamps the renderer only when this load is the one that registered it', () => {
    stampRenderer(ThisView);
    expect((ThisView as unknown as Record<symbol, unknown>)[BUILT_BY]).toBeUndefined();
    stampRenderer(EarlierView);
    expect((EarlierView as unknown as Record<symbol, unknown>)[BUILT_BY]).toBe('dev'); // BUILD_ID outside a build
  });

  // Turning the plugin off and on: the same code, so nothing to restart for.
  it('logs, but does not announce, an earlier load of the same build', () => {
    stamp('dev');
    const log: string[] = [];
    reportStaleRenderer(ThisView, (m) => log.push(m));
    expect(log[0]).toContain('same build');
    expect(notices).toEqual([]);
  });

  it('announces a different build once per load, and logs it every time', () => {
    stamp('2026-01-01T00:00:00Z');
    const log: string[] = [];
    reportStaleRenderer(ThisView, (m) => log.push(m));
    reportStaleRenderer(ThisView, (m) => log.push(m));
    expect(log).toHaveLength(2);
    expect(log[0]).toContain('restart Obsidian');
    expect(notices).toHaveLength(1);
  });

  it('says nothing when the renderer is this load’s own', () => {
    const log: string[] = [];
    reportStaleRenderer(EarlierView, (m) => log.push(m));
    expect(log).toEqual([]);
  });
});
