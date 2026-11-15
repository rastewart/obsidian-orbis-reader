import { type App, Notice, normalizePath, Platform } from 'obsidian';
import { buildLabel } from '../build-info';
import { deviceSetting } from '../device-settings';
import { t } from '../i18n';
import { LS_DEVICE_NAME } from '../progress';
import type { DebugCategory } from '../settings';
import { setSvgIcon } from '../ui-utils';

const DEBUG_CATEGORIES: DebugCategory[] = [
  'relocate',
  'index',
  'pace',
  'display',
  'nav',
  'annot',
  'search',
  'export',
  'backlinks',
  'sync',
  'select',
  'annot-nav',
  'tts',
  'library',
  'sources',
  'settings',
];

/**
 * The category-filtered debug log: the floating toggle chip, the overlay panel, and
 * the rolling entry buffer. Entries persist across book opens by design — only
 * the DOM handles are released on `dispose()`.
 *
 * See `docs/design/reader-architecture.md`.
 */
/**
 * **One log, however many panels.**
 *
 * The entries and the live panels are MODULE state, not instance state. With a buffer per surface — the reader view
 * one, the Library dashboard another — a line would go to whichever panel the code that emitted it happened to know
 * about, and opening "the" debug log from the wrong place would show nothing. There is one log in the plugin; the
 * panels are windows onto it.
 *
 * It also means a line emitted with no panel open is still there when one is opened, which is what a log is for.
 */
type DebugStore = { entries: string[]; panels: Set<DebugLog>; note?: NoteWriter };

/**
 * This launch's note: where it is, the lines waiting for it, whether a write is under way, and a crashed launch's
 * unwritten lines, which go at the top of this one's.
 */
type NoteWriter = { path: string; pending: string[]; busy: boolean; recovered: Unwritten | null };

/** Lines that never reached their note, and which note that was. */
type Unwritten = { path: string; lines: string[] };

/** This device's switch for copying the log into notes — local storage, beside the category switches. */
const LS_TO_NOTE = 'orbis-dbg-note';

/** The folder every launch's note goes in, at the top of the vault. */
const NOTE_FOLDER = 'Orbis debug logs';

/**
 * **Hung off `app`, not off this module.** Module state is per JS context, and Obsidian can put a surface in a
 * window of its own — a detached Settings window, a popped-out leaf — where a second copy of this file would keep a
 * second log that nothing else can see. `app` is one object for the whole application, so the log follows the
 * application rather than the window that happened to load the code.
 */
function store(app: App): DebugStore {
  const holder = app as App & { orbisDebugStore?: DebugStore };
  holder.orbisDebugStore ??= { entries: [], panels: new Set() };
  return holder.orbisDebugStore;
}

/**
 * Write one line, from anywhere — including code that owns no panel at all (the plugin, a settings page, a vault
 * handler). Gated by the category's own switch, so a category nobody turned on costs nothing but the check.
 */
/**
 * One line, written only while its category's pill is on.
 *
 * **Every line has a category**, required by the type: a line without one used to be written whatever pills were on,
 * so the selection and note-icon traces filled every log, including one taken to watch something else.
 */
function debugLine(app: App, msg: string, category: DebugCategory): void {
  if (app.loadLocalStorage(`orbis-dbg-${category}`) !== '1') return;
  const { entries, panels } = store(app);
  const ts = new Date().toISOString().slice(11, 23);
  entries.push(`${ts} [${category}] ${msg}`);
  if (entries.length > 200) entries.splice(0, entries.length - 200);
  for (const panel of panels) panel.repaint();
  if (writesToNote(app)) toNote(app, entries[entries.length - 1]);
}

/** Whether this device copies its debug log into a note. */
function writesToNote(app: App): boolean {
  return app.loadLocalStorage(LS_TO_NOTE) === '1';
}

/** Turn copying into the note on or off for this device. */
export function setWritesToNote(app: App, on: boolean): void {
  app.saveLocalStorage(LS_TO_NOTE, on ? '1' : undefined);
}

/** Flip copying into notes, and say where they go — from the panel or the command. */
export function toggleNoteWriting(app: App): void {
  const on = !writesToNote(app);
  setWritesToNote(app, on);
  new Notice(on ? t('notices.debug_log_notes_on', { folder: NOTE_FOLDER }) : t('notices.debug_log_note_off'));
}

/**
 * A new note for this launch, named after the device and the moment its first line was written.
 *
 * **One note per launch, never shared.** The vault syncs, and a note that one launch is still appending to while the
 * next one appends too — after a crash, the usual reason to want the log — turns into a sync conflict. A note
 * written by one launch only is one writer's file. The device's own name when it has one, so the note says where it
 * came from; `-` for `:` in the time, which no file name may hold.
 */
function launchNotePath(app: App): string {
  const named = ((app.loadLocalStorage(LS_DEVICE_NAME) as string | null) ?? '').replace(/[\\/:*?"<>|#^[\]]/g, '');
  const device = named.trim() || (Platform.isAndroidApp ? 'Android' : Platform.isIosApp ? 'iOS' : 'desktop');
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return normalizePath(`${NOTE_FOLDER}/${device} ${stamp}.md`);
}

/**
 * Copy one line into this launch's note.
 *
 * **For the log that a crash or a freeze takes with it.** The entries live in memory, so a force-closed app loses
 * them along with the line that would have explained the force-close. The note is on disk, and it syncs, so a log
 * from a phone can be read on the desktop.
 *
 * **One write at a time, everything waiting in it.** A write starts at once rather than on a timer, so the last line
 * before a hang has the best chance of reaching the disk. Lines that arrive while it runs go in the next write.
 *
 * The note is one `~~~` block, so a line reads as written rather than as Markdown: a log line is full of brackets,
 * `#`, `*` and markup.
 */
function toNote(app: App, line: string): void {
  // The previous launch's leftovers are taken before this launch's first line is held in their place.
  const writer = (store(app).note ??= {
    path: launchNotePath(app),
    pending: [],
    busy: false,
    recovered: takeUnwritten(app),
  });
  writer.pending.push(line);
  holdUnwritten(app, writer);
  if (!writer.busy) void flushNote(app, writer);
}

/**
 * **What has not reached the note yet, kept where a hang cannot stop it.** A note write needs the event loop, so
 * the lines leading into a freeze — the ones that matter — would wait for a write that never runs. Local storage
 * is written at once, in the same call; the next launch finds them there and puts them at the top of its own note,
 * naming the note they belong to.
 */
const LS_UNWRITTEN = 'orbis-dbg-note-unwritten';

function holdUnwritten(app: App, writer: NoteWriter): void {
  const held: Unwritten = { path: writer.path, lines: writer.pending };
  app.saveLocalStorage(LS_UNWRITTEN, writer.pending.length ? JSON.stringify(held) : undefined);
}

/** Lines a previous launch logged and never wrote — see `holdUnwritten`. Taken once, so they are written once. */
function takeUnwritten(app: App): Unwritten | null {
  const raw = app.loadLocalStorage(LS_UNWRITTEN) as string | null;
  app.saveLocalStorage(LS_UNWRITTEN, undefined);
  if (!raw) return null;
  try {
    const held = JSON.parse(raw) as Partial<Unwritten>;
    if (typeof held.path !== 'string' || !Array.isArray(held.lines)) return null;
    return { path: held.path, lines: held.lines.map(String) };
  } catch {
    return null;
  }
}

async function flushNote(app: App, writer: NoteWriter): Promise<void> {
  writer.busy = true;
  const { adapter } = app.vault;
  try {
    while (writer.pending.length) {
      const lines = writer.pending.slice();
      let text = `${lines.join('\n')}\n`;
      // Created with its heading — again if it was deleted while the launch ran.
      if (!(await adapter.exists(writer.path))) {
        if (!(await adapter.exists(NOTE_FOLDER))) await adapter.mkdir(NOTE_FOLDER);
        const { recovered } = writer;
        const before = recovered
          ? `${t('debug_panel.note_recovered', { path: recovered.path })}\n${recovered.lines.join('\n')}\n${t('debug_panel.note_this_launch')}\n`
          : '';
        await adapter.write(writer.path, `~~~log\n${buildLabel()} — ${new Date().toLocaleString()}\n${before}${text}`);
        writer.recovered = null;
        text = '';
      }
      if (text) await adapter.append(writer.path, text);
      // Only once they are on disk do they leave the copy a hang cannot stop.
      writer.pending.splice(0, lines.length);
      holdUnwritten(app, writer);
    }
  } catch {
    // A log that cannot be written has nowhere to report it; the panel still has every line.
  } finally {
    writer.busy = false;
  }
}

/**
 * A diagnostic from something that only has an `app` — a dialog, a helper — rather than the plugin.
 *
 * **Structural host, and here rather than in `LibraryView`.** In the Library view it would make every caller import
 * that view to write a log line, and for `TitleFieldModal` that closes a cycle back through `OrbisReaderView`. It
 * touches nothing of the Library — it is `debugLine` with a default category — so it belongs beside `debugLine`.
 */
export function logToLibrary(host: { app: App }, msg: string, category: DebugCategory = 'library'): void {
  debugLine(host.app, msg, category);
}

export class DebugLog {
  private panelEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private btn: HTMLElement | null = null;
  private visible = false;

  /** Only the app is needed — for the per-category switches, which live in local storage. Taking `App` rather than
   *  a `ReaderContext` is what lets a view that is not the reader keep one of these: the Library does. */
  constructor(private readonly app: App) {
    store(app).panels.add(this);
  }

  /** The floating chip, exposed so the settings pass can show or hide it. */
  get chip(): HTMLElement | null {
    return this.btn;
  }

  add(msg: string, category: DebugCategory): void {
    debugLine(this.app, msg, category);
  }

  /**
   * Repaint if this panel is on screen. Called for every line, whoever wrote it.
   *
   * **Asks the DOM, not a flag.** `visible` is set by `toggle()` and nothing else, while the panel itself is rebuilt
   * whenever its host view repaints — and rebuilt hidden. The two can drift apart, and trusting the flag would make
   * Clear appear to do nothing: it would empty the log and then repaint nothing, because the flag says the panel is
   * shut while the reader is looking at it. An element that is in the document and shown is on screen, whatever
   * anyone remembers.
   */
  repaint(): void {
    if (this.onScreen()) this.render();
  }

  /**
   * Whether this panel is really on screen — see `repaint`.
   *
   * **Not Obsidian's `isShown()`**, which is `!!offsetParent` — and an element with `position: fixed`, as this overlay
   * is, has no offsetParent ever. Every panel read as hidden, none repainted as lines arrived, and each showed the log
   * as it was when opened: one opened from a book before a dialog logged anything stayed empty while the dashboard's,
   * opened after, showed every line. A box on screen is the answer for any positioning; a panel hidden by `hide()`, or
   * inside a hidden view, has none.
   */
  private onScreen(): boolean {
    return this.listEl?.isConnected === true && (this.panelEl?.getClientRects().length ?? 0) > 0;
  }

  private render(): void {
    if (!this.listEl) return;
    this.listEl.empty();
    // Pinned build stamp — always at the top, survives Clear, so a copied log is
    // never ambiguous about which build produced it.
    this.listEl.createDiv({ cls: 'orbis-debug-build', text: buildLabel() });
    for (const entry of [...store(this.app).entries].reverse()) {
      const d = this.listEl.createDiv({ cls: 'orbis-debug-entry' });
      d.textContent = entry;
    }
  }

  toggle(): void {
    if (!this.panelEl) return;
    this.visible = !this.visible;
    if (this.visible) {
      this.panelEl.show();
      this.render();
    } else {
      this.panelEl.hide();
    }
    if (this.btn) this.btn.classList.toggle('is-active', this.visible);
  }

  /**
   * Build the floating toggle chip into `container` (the reader's `.orbis-container`, which is the
   * positioned ancestor the recording chip already anchors to).
   *
   * A chip, not a toolbar button: on a phone the toolbar is a three-column grid with no overflow
   * behavior, so once the right-hand group outgrows its track it simply runs over the progress chip in
   * the middle. Total width is the constraint, not per-group width, so moving it between the two groups
   * would only change which side collides — the row cannot hold another item. This is the right item to
   * keep off it: it is the only one with no user-facing purpose and no Settings toggle of its own, and
   * the toolbar is the scarcest space on the screen.
   *
   * Bottom LEFT, deliberately: the recording chip is bottom right, so the two never meet and neither
   * needs to know about the other. They share `--orbis-float-chip-bottom`, which is what clears a listen
   * bar — two hand-tuned offsets would drift the first time that bar changes height.
   */
  buildChip(container: HTMLElement): void {
    // Idempotent. `dispose()` drops the REFERENCE but not the element, so a chrome rebuild that does not
    // also empty the container would leave an orphan chip that nothing holds a handle to — the settings
    // pass would hide the newest one while the zombie stays on screen until a reload clears the
    // container. The recording chip avoids this by being created once and removed explicitly; this one
    // is built as part of the chrome, so it has to clean up after itself.
    container.querySelectorAll('.orbis-debug-chip').forEach((el) => el.remove());
    this.btn = container.createDiv({ cls: 'orbis-debug-chip' });
    // Shown only where this device asked for it. The Library repaints this chip with every paint and has no settings
    // pass of its own, so the chip has to start right; the reader's `applyPluginSettings` changes it afterwards.
    this.btn.toggle(deviceSetting('showDebugButton'));
    this.btn.setAttribute('role', 'button');
    this.btn.setAttribute('tabindex', '0');
    this.btn.setAttribute('aria-label', t('debug_panel.toggle'));
    setSvgIcon(
      this.btn,
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>'
    );
    this.btn.addEventListener('click', () => this.toggle());
  }

  /**
   * Build the debug log overlay panel into `container` — `position: fixed; inset: 0`, near the top of the 100000
   * band (see `.orbis-debug-overlay` in styles.css).
   *
   * **The container must not be a stacking context, or the panel's z-index means nothing outside it** — and
   * `position: fixed` opens one with no z-index at all, which is how the reader's `host` would seal this panel under
   * focus mode's exit button. The reader passes `contentEl` and the Library its `containerEl` for that reason.
   * Neither scrolls, which matters too: an overlay inside a scroller is sized to the scrollable content rather
   * than to what is on screen.
   *
   * Any previous panel is removed first, as the chip does: a caller that rebuilds its view on every paint would
   * otherwise stack one panel per repaint.
   */
  buildPanel(container: HTMLElement): void {
    container.querySelectorAll('.orbis-debug-overlay').forEach((el) => el.remove());
    const panel = container.createDiv({ cls: 'orbis-debug-overlay' });
    this.panelEl = panel;
    // Rebuilt hidden, then reopened if it was open: this runs again whenever the host view repaints, and a panel that
    // shut itself every time the Library refreshed would be a panel nobody could read a live log in.
    panel.hide();
    if (this.visible) panel.show();
    const header = panel.createDiv({ cls: 'orbis-debug-overlay-header' });
    header.createSpan({ text: t('debug_panel.debug_log'), cls: 'orbis-debug-overlay-title' });
    const copyBtn = header.createEl('button', { text: t('debug_panel.copy'), cls: 'orbis-ctrl-btn' });
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard.writeText([buildLabel(), '', ...[...store(this.app).entries].reverse()].join('\n'));
    });
    const clearBtn = header.createEl('button', { text: t('debug_panel.clear'), cls: 'orbis-ctrl-btn' });
    clearBtn.addEventListener('click', () => {
      const shared = store(this.app);
      shared.entries.length = 0; // the one log, so Clear clears it everywhere
      // This panel first and unconditionally — the reader just clicked a button on it, so it is on screen whatever
      // anything else believes. Then every other window onto the same log.
      this.render();
      for (const other of shared.panels) if (other !== this) other.repaint();
    });
    // A switch, so it shows which way it is set: on, every line from here on is copied into this device's note too.
    const noteBtn = header.createEl('button', { text: t('debug_panel.write_to_note'), cls: 'orbis-ctrl-btn' });
    const showNote = () => {
      noteBtn.classList.toggle('is-active', writesToNote(this.app));
      noteBtn.setAttribute('aria-pressed', String(writesToNote(this.app)));
    };
    showNote();
    noteBtn.addEventListener('click', () => {
      toggleNoteWriting(this.app);
      showNote();
    });
    // The panel is the only way out of itself: it covers its container near the top of the 100000 band, which paints
    // over the floating chip that opened it, so with no close button here the log could not be dismissed by
    // tapping anything on screen.
    const closeBtn = header.createEl('button', { text: t('action.close'), cls: 'orbis-ctrl-btn' });
    closeBtn.addEventListener('click', () => this.toggle());

    const filterBar = panel.createDiv({ cls: 'orbis-debug-overlay-filter' });
    for (const cat of DEBUG_CATEGORIES) {
      const pill = filterBar.createEl('button', { cls: 'orbis-debug-overlay-pill' });
      const isOn = () => this.app.loadLocalStorage(`orbis-dbg-${cat}`) === '1';
      const refresh = () => {
        pill.dataset.active = isOn() ? '1' : '0';
      };
      pill.textContent = cat;
      refresh();
      pill.addEventListener('click', () => {
        if (isOn()) this.app.saveLocalStorage(`orbis-dbg-${cat}`, undefined);
        else this.app.saveLocalStorage(`orbis-dbg-${cat}`, '1');
        refresh();
        this.render();
      });
    }

    this.listEl = panel.createDiv({ cls: 'orbis-debug-log-list' });
  }

  /** Release DOM handles on book close. Entries are intentionally retained — they belong to the plugin, not here. */
  dispose(): void {
    store(this.app).panels.delete(this);
    this.panelEl = null;
    this.listEl = null;
    this.btn = null;
    this.visible = false;
  }
}
