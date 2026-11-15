// Voice discovery + preview for the OpenAI-compatible generation server. Discovery uses the
// `/v1/audio/voices` endpoint (a Kokoro-fastapi extension — NOT standard OpenAI), so it's
// best-effort: callers fall back to a free-text voice field when it isn't available.

import { requestUrl } from 'obsidian';
import type { PreviewHandle } from './PiperEngine';
import { withTimeout } from './request-timeout';

/**
 * Ceilings for the two calls in here — see `withTimeout` for why `requestUrl` needs one at all.
 *
 * **The same failure the recording pipeline hit, on a smaller surface.** A server that accepts the connection and
 * never answers left the voice list on its loading state for ever, with no list and no fall back to the free-text
 * voice field it is supposed to degrade to; and the audition button spinning with nothing to stop it.
 *
 * Discovery is a small JSON body, so ten seconds is already generous. A preview is one short sentence synthesized
 * on demand, which on a CPU-only server runs a few seconds — a minute is the point at which nobody is still
 * waiting to hear it.
 */
const VOICES_TIMEOUT_MS = 10_000;
const PREVIEW_TIMEOUT_MS = 60_000;

const base = (serverUrl: string): string => serverUrl.replace(/\/+$/, '');

// Kokoro voice ids encode language + gender in the prefix (e.g. `af_heart` = American English,
// Female, "Heart"). Decode that into a readable label — no network / catalog needed.
const VOICE_LANGS: Record<string, string> = {
  a: 'American English',
  b: 'British English',
  e: 'Spanish',
  f: 'French',
  h: 'Hindi',
  i: 'Italian',
  j: 'Japanese',
  p: 'Portuguese',
  z: 'Chinese',
};
const VOICE_GENDERS: Record<string, string> = { f: 'Female', m: 'Male' };

// Language display order: English variants first (the usual pick), then the rest.
const LANG_ORDER = ['a', 'b', 'e', 'f', 'h', 'i', 'j', 'p', 'z'];

function parseVoice(id: string): { langCh: string; genderCh: string; name: string } | null {
  const m = /^([a-z])([fm])_(.+)$/.exec(id);
  if (!m || !VOICE_LANGS[m[1]] || !VOICE_GENDERS[m[2]]) return null;
  return { langCh: m[1], genderCh: m[2], name: m[3].charAt(0).toUpperCase() + m[3].slice(1) };
}

/** Language prefix char of a kokoro voice id (`a` for `af_heart`), or null if it doesn't parse. */
export function voiceLang(id: string): string | null {
  return parseVoice(id)?.langCh ?? null;
}
/** Gender prefix char (`f`/`m`), or null if it doesn't parse. */
export function voiceGender(id: string): string | null {
  return parseVoice(id)?.genderCh ?? null;
}
/** Whether a language char is an English variant (American/British) — the default filter set. */
export function isEnglishLang(langCh: string): boolean {
  return langCh === 'a' || langCh === 'b';
}
export function languageLabel(langCh: string): string {
  return VOICE_LANGS[langCh] ?? langCh;
}

/** Human label for a kokoro-style voice id (`af_heart` → "Heart — American English, Female"),
 *  falling back to the raw id when it doesn't match the convention. */
export function describeVoice(id: string): string {
  const p = parseVoice(id);
  return p ? `${p.name} — ${VOICE_LANGS[p.langCh]}, ${VOICE_GENDERS[p.genderCh]}` : id;
}

/** Order voices by language (English first), then gender (Female, Male), then name A–Z — so the
 *  list groups logically. Unparseable ids sort last, alphabetically. */
export function sortVoices(ids: readonly string[]): string[] {
  const langRank = (ch: string | null): number => {
    const i = ch ? LANG_ORDER.indexOf(ch) : -1;
    return i < 0 ? 99 : i;
  };
  return [...ids].sort((a, b) => {
    const pa = parseVoice(a);
    const pb = parseVoice(b);
    const lr = langRank(pa?.langCh ?? null) - langRank(pb?.langCh ?? null);
    if (lr) return lr;
    const gr = (pa?.genderCh === 'm' ? 1 : 0) - (pb?.genderCh === 'm' ? 1 : 0);
    if (gr) return gr;
    return (pa?.name ?? a).localeCompare(pb?.name ?? b);
  });
}

/** Map a list to voice ids, tolerating both bare strings and objects (`{ id | name | voice }` —
 *  kokoro-fastapi returns `[{ id, name }, …]`). */
function asVoiceIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string') out.push(item);
    else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const id = o.id ?? o.name ?? o.voice;
      if (typeof id === 'string') out.push(id);
    }
  }
  return out;
}

/** Pull the voice-id list out of the various shapes servers return: a bare array, `{ voices: [...] }`
 *  (kokoro-fastapi), or `{ data: [...] }` — where entries may be strings or `{ id, name }` objects. */
function extractVoices(body: unknown): string[] {
  if (Array.isArray(body)) return asVoiceIds(body);
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    const found = [...asVoiceIds(o.voices), ...asVoiceIds(o.data)];
    if (found.length) return found;
  }
  return [];
}

// Legacy pre-1.0 voicepacks (`af_v0`, `af_v0bella`, …) — deprecated duplicates of the current v1
// voices; hidden from the picker.
const isLegacyVoice = (id: string): boolean => /^[a-z][fm]_v0/i.test(id);

/** Available voices from the server, de-duped and sorted, with the legacy v0 duplicates dropped —
 *  or null when the endpoint is unreachable or doesn't support discovery (→ the caller shows a text
 *  field instead). */
export async function fetchServerVoices(serverUrl: string): Promise<string[] | null> {
  if (!serverUrl.trim()) return null;
  try {
    const res = await withTimeout(
      requestUrl({ url: `${base(serverUrl)}/v1/audio/voices`, method: 'GET' }),
      VOICES_TIMEOUT_MS
    );
    // A timeout reads as "no discovery", which is what this function already returns for a server that cannot be
    // reached — so the caller shows its text field instead of waiting on a list that is never coming.
    if (!res || res.status < 200 || res.status >= 300) return null;
    const list = extractVoices(res.json as unknown).filter((id) => !isLegacyVoice(id));
    return list.length ? [...new Set(list)].sort() : null;
  } catch {
    return null;
  }
}

/** Synthesize a short sample on the server and play it, so the user can audition a generation voice.
 *  Returns a handle whose `stop()` halts playback. Rejects if the request fails. */
export async function previewServerVoice(
  serverUrl: string,
  model: string,
  voice: string,
  text: string,
  rate: number,
  onDone?: () => void
): Promise<PreviewHandle> {
  const res = await withTimeout(
    requestUrl({
      url: `${base(serverUrl)}/v1/audio/speech`,
      method: 'POST',
      contentType: 'application/json',
      body: JSON.stringify({ model, input: text, voice, response_format: 'mp3', speed: rate }),
    }),
    PREVIEW_TIMEOUT_MS
  );
  // Thrown rather than returned quietly: this function's contract is to reject on failure, and its callers turn
  // that into "couldn't play the sample". A silent no-op would leave the button looking like it had worked.
  if (!res) {
    onDone?.();
    throw new Error('preview timed out');
  }
  if (res.status < 200 || res.status >= 300) {
    onDone?.();
    throw new Error(`preview HTTP ${res.status}`);
  }
  const url = URL.createObjectURL(new Blob([res.arrayBuffer], { type: 'audio/mpeg' }));
  const audio = new Audio(url);
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    URL.revokeObjectURL(url);
    onDone?.();
  };
  audio.addEventListener('ended', finish);
  void audio.play().catch(() => finish());
  return {
    stop: () => {
      audio.pause();
      finish();
    },
  };
}
