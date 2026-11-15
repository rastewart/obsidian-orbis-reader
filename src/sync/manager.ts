// When a scan runs, and what it runs over.
//
// The arithmetic is in `records.ts`, the stamping in `stamp.ts`, the loop in `engine.ts` — all three testable without
// a vault. This is the part that cannot be: registering the bindings, deciding when to look, and making sure two
// looks never overlap.
//
// **Not on a timer.** At load, when a file lands in the sync folder, and when the window comes back — a phone that
// polls is a phone spending battery on nothing. See docs/design/multi-device-sync.md §When it runs.

import type { App, TAbstractFile } from 'obsidian';
import { describeReport, describeType } from './diagnose';
import { type ScanResult, type SyncBinding, scanType } from './engine';
import { parseSyncFileName } from './paths';
import type { SyncStore } from './store';

/**
 * How long after a scan's own writes a vault event may still be ours.
 *
 * A scan publishes files, and publishing fires `modify` on every one of them. Without a tail, every scan schedules
 * the next one and the folder never goes quiet. The window is generous because it only delays noticing a genuinely
 * foreign write by that much, and the focus and load passes cover anything missed.
 */
const OWN_WRITE_TAIL_MS = 3000;

/** Incoming files arrive in a burst — a sync tool lands twenty at once. One scan should cover the burst. */
const INCOMING_DEBOUNCE_MS = 1500;

/** A rename saves per keystroke. Long enough that typing a name publishes once, short enough to feel immediate. */
const LOCAL_EDIT_DEBOUNCE_MS = 1200;

export interface SyncManagerOpts {
  app: App;
  store: SyncStore;
  /** This device's id, as the files are named. */
  deviceId: () => string;
  /**
   * What another device is called, for the log.
   *
   * A line that says a change arrived from `tce0313qaamb` is a line a reader has to go and decode; one that says it
   * arrived from the iPad is a line they can act on. See `sync/devices.ts`.
   */
  deviceName: (id: string) => string;
  /** Whether the reader has turned this on. Read on every scan, so turning it off stops the next one. */
  enabled: () => boolean;
  debug: (message: string, data?: unknown) => void;
}

export class SyncManager {
  private readonly jobs: Array<{
    type: string;
    run: () => Promise<ScanResult>;
    describe: () => Promise<string>;
  }> = [];
  /** What the last scan was for and when, so the status command can say "nothing has asked since load". */
  private lastScan: { at: number; reason: string; result: string } | null = null;
  private running: Promise<void> | null = null;
  private queued = false;
  private quietUntil = 0;
  private incoming: number | null = null;
  private local: number | null = null;

  constructor(private readonly opts: SyncManagerOpts) {}

  /** Teach the manager about one kind of thing. Registration order is scan order. */
  register<T>(binding: SyncBinding<T>): void {
    this.jobs.push({
      type: binding.type,
      run: () => scanType(this.opts.store, binding, this.opts.deviceId()),
      // Made here, where the binding's type is still known — the same reason `run` is a thunk.
      describe: async () => describeReport(await describeType(this.opts.store, binding, this.opts.deviceId())),
    });
  }

  /**
   * What a scan would do, without doing it — for the dev status command.
   *
   * **Runs even when publishing is off**, because "it is off" is one of the answers a reader is looking for, and a
   * status tool that reports nothing until the thing works is no use for finding out why it does not.
   */
  async status(): Promise<string[]> {
    const lines = [`publishing: ${this.opts.enabled() ? 'on' : 'off'} | this device: ${this.opts.deviceId()}`];
    lines.push(
      this.lastScan
        ? `last scan: ${Math.round((Date.now() - this.lastScan.at) / 1000)}s ago (${this.lastScan.reason}) — ${this.lastScan.result}`
        : 'last scan: none since this device loaded'
    );
    if (this.running) lines.push('a scan is running right now');
    try {
      lines.push(...((await this.opts.store.describe?.()) ?? []));
    } catch (err) {
      lines.push(`could not list the vault: ${err instanceof Error ? err.message : String(err)}`);
    }
    for (const job of this.jobs) {
      try {
        lines.push(await job.describe());
      } catch (err) {
        lines.push(`${job.type} — could not be read: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return lines;
  }

  /** Scan whatever the triggers have or have not done — for the dev command, and only for it. */
  async scanNow(reason: string): Promise<void> {
    await this.runUntilSettled(reason);
  }

  /**
   * Scan every registered type.
   *
   * **One at a time, and at most one waiting.** A scan reads the folder, decides, and writes; a second one running
   * over the same folder mid-write would decide from a half-published state. A request that arrives while one is
   * running sets the rerun flag rather than queueing without limit — ten requests during one scan mean one more scan,
   * because they are all asking the same question.
   */
  scan(reason: string): Promise<void> {
    if (!this.opts.enabled()) return Promise.resolve();
    if (this.running) {
      this.queued = true;
      return this.running;
    }
    this.running = this.runUntilSettled(reason).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /**
   * Scan a moment from now, coalescing whatever else asks in the meantime.
   *
   * What every local change calls. Renaming a dashboard saves on each keystroke, and each save is a change worth
   * publishing — but publishing eight versions of a name being typed is eight files for one edit, and the last one is
   * the only one anybody wants.
   */
  scanSoon(reason: string, delayMs = LOCAL_EDIT_DEBOUNCE_MS): void {
    if (!this.opts.enabled()) return;
    if (this.local !== null) window.clearTimeout(this.local);
    this.local = window.setTimeout(() => {
      this.local = null;
      void this.scan(reason);
    }, delayMs);
  }

  private async runUntilSettled(reason: string): Promise<void> {
    let why = reason;
    for (;;) {
      await this.runOnce(why);
      if (!this.queued) return;
      this.queued = false;
      why = 'again';
    }
  }

  private async runOnce(reason: string): Promise<void> {
    const started = performance.now();
    this.opts.store.takeTimings?.(); // from zero: what the last scan, or anything between, spent is not this one's
    this.opts.store.beginScan?.();
    try {
      await this.runJobs(reason, started);
    } finally {
      this.opts.store.endScan?.();
    }
  }

  private async runJobs(reason: string, started: number): Promise<void> {
    let adopted = 0;
    let published = 0;
    let failed = 0;
    for (const job of this.jobs) {
      try {
        const result = await job.run();
        adopted += result.adopted;
        published += result.published;
        if (result.adopted > 0) {
          const from = [...new Set(result.adoptedFrom.map((id) => this.opts.deviceName(id)))].join(', ');
          this.opts.debug(`adopted ${job.type} from ${from || 'another device'}`, result.adoptedIds);
        }
        // Named, because the alternative is a folder that quietly stays half-published.
        failed += result.failed;
        if (result.failed > 0) this.opts.debug(`${job.type} — ${result.failed} file(s) could not be written`);
      } catch (err) {
        // One type's failure is not the others': a folder that will not list, or a file the OS holds open, must not
        // stop the rest of the scan. The next scan tries again.
        this.opts.debug(`${job.type} failed`, err instanceof Error ? err.message : String(err));
      }
    }
    // Our own writes are about to arrive as vault events. See `OWN_WRITE_TAIL_MS`.
    if (published > 0 || adopted > 0) this.quietUntil = Date.now() + OWN_WRITE_TAIL_MS;
    /**
     * **Every scan says it ran, including the quiet ones.**
     *
     * Printing this line only when something moved reads as sensible and is the wrong way round for the question
     * people actually bring to a log: nothing has arrived on this device — did a scan even happen? A silent scan and
     * no scan would look identical, and only the dev status command could tell them apart. The cost of the honest
     * version is one line per focus, per incoming file burst, and per local change.
     */
    // Timed: every type lists the whole vault for its records, and a scan runs on every focus and every file burst.
    const where = this.opts.store.takeTimings?.();
    this.opts.debug(
      `scan (${reason}) — adopted ${adopted}, published ${published}, failed ${failed}, in ${Math.round(performance.now() - started)} ms${where ? ` (${where})` : ''}`
    );
    this.lastScan = { at: Date.now(), reason, result: `adopted ${adopted}, published ${published}, failed ${failed}` };
  }

  /**
   * Watch for the two things that mean another device has spoken: one of our files landing anywhere in the vault, and
   * this window coming back after the device slept through a sync run.
   *
   * **By name, not by folder.** The folder is a setting that itself travels, so a file can arrive from a device that
   * had not learnt the new one yet — and the reader is free to move these files anyway. The name is what identifies
   * them; see `parseSyncFileName`.
   *
   * **Not before the workspace is ready.** While the vault loads, Obsidian reports every file already in it as
   * created, and on Android that is still going on when Orbis starts: every sync file "arrived", and a full scan ran
   * while a book reopened at launch was reading its own files, which waited about six seconds behind it. The scan at
   * load covers anything that came in while Obsidian was closed.
   *
   * The caller owns the lifetime — every listener here is registered through the plugin, so unloading removes them.
   */
  watch(register: (unregister: () => void) => void, registerEvent: (ref: unknown) => void): void {
    const changed = (file: TAbstractFile): void => {
      if (!this.opts.app.workspace.layoutReady) return;
      if (!parseSyncFileName(file.name)) return;
      if (Date.now() < this.quietUntil) return; // our own publishing, arriving back at us
      if (this.incoming !== null) window.clearTimeout(this.incoming);
      this.incoming = window.setTimeout(() => {
        this.incoming = null;
        void this.scan('a file arrived');
      }, INCOMING_DEBOUNCE_MS);
    };
    registerEvent(this.opts.app.vault.on('create', changed));
    registerEvent(this.opts.app.vault.on('modify', changed));
    registerEvent(this.opts.app.vault.on('delete', changed));

    const onFocus = (): void => void this.scan('the window came back');
    window.addEventListener('focus', onFocus);
    register(() => {
      window.removeEventListener('focus', onFocus);
      if (this.incoming !== null) window.clearTimeout(this.incoming);
      if (this.local !== null) window.clearTimeout(this.local);
    });
  }
}
