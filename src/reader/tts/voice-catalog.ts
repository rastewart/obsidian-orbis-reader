// Curated catalog of "Orbis voices" — on-device Piper neural voices the user can download and
// select in Settings → Listening. Every entry has been verified to be a MEDIUM-tier,
// 256-symbol model (the only tier that runs on Android without crashing ORT or freezing the
// UI — see PiperEngine's DEFAULT_VOICE note). Sizes are the real .onnx download sizes.
//
// Only single-speaker voices live here: one model == one named voice, no speaker-id juggling.
// Multi-speaker models (libritts_r, vctk, …) and arbitrary community voices are reachable via
// the hidden "add a custom voice" command instead.
//
// The `character` blurbs are first-pass placeholders — they get refined once the voices are
// auditioned on-device via the picker's Preview button.

export interface OrbisVoice {
  /** Stable id, also the model's base filename (e.g. 'en_US-amy-medium'). Persisted in settings. */
  id: string;
  /** Display name shown in the picker (e.g. 'Amy'). */
  name: string;
  /** HF repo path INCLUDING the .onnx suffix; the config is this + '.json' (matches PiperEngine). */
  path: string;
  /** Accent tag shown next to the name. */
  accent: 'US' | 'GB';
  /** Speaker gender where known — used for the row subtitle. */
  gender?: 'female' | 'male';
  /** Short character note (placeholder until auditioned). */
  character?: string;
  /** Real .onnx download size in MB (rounded), shown on the download/preview button. */
  sizeMB: number;
  /** A multi-speaker model: one download exposes many voices, chosen by a 1-based speaker
   *  number in the picker. */
  multiSpeaker?: boolean;
  /** Known speaker count for a multi-speaker model, so the picker can show the "Voice #N" stepper
   *  before the model is downloaded (the true count from the config still overrides once present). */
  speakerCount?: number;
}

const V = (
  id: string,
  name: string,
  accent: 'US' | 'GB',
  gender: 'female' | 'male' | undefined,
  character: string,
  opts: { multiSpeaker?: boolean; sizeMB?: number; speakerCount?: number } = {}
): OrbisVoice => {
  // Path layout: en/en_US/amy/medium/en_US-amy-medium.onnx  (region + speaker derived from id)
  const region = accent === 'US' ? 'en_US' : 'en_GB';
  const speaker = id.replace(`${region}-`, '').replace('-medium', '');
  return {
    id,
    name,
    path: `en/${region}/${speaker}/medium/${id}.onnx`,
    accent,
    gender,
    character,
    sizeMB: opts.sizeMB ?? 60,
    multiSpeaker: opts.multiSpeaker,
    speakerCount: opts.speakerCount,
  };
};

export const ORBIS_VOICES: OrbisVoice[] = [
  // ── en-US ──────────────────────────────────────────────────────────────────
  V('en_US-amy-medium', 'Amy', 'US', 'female', 'Warm, natural'),
  V('en_US-kristin-medium', 'Kristin', 'US', 'female', 'Bright'),
  V('en_US-hfc_female-medium', 'Eva', 'US', 'female', 'Balanced'),
  V('en_US-ryan-medium', 'Ryan', 'US', 'male', 'Deep, measured'),
  V('en_US-joe-medium', 'Joe', 'US', 'male', 'Relaxed'),
  // john & norman dropped: vetting measured 3.5× / 6.2× duration blow-up on short headings
  // (confirmed garbled on-device). See the "Vet listen voices" command.
  V('en_US-kusal-medium', 'Kusal', 'US', 'male', 'Crisp'),
  V('en_US-bryce-medium', 'Bryce', 'US', 'male', 'Casual'),
  V('en_US-hfc_male-medium', 'Miles', 'US', 'male', 'Balanced'),
  V('en_US-lessac-medium', 'Lessac', 'US', undefined, 'Clear, neutral'),
  // ── en-GB ──────────────────────────────────────────────────────────────────
  V('en_GB-alba-medium', 'Alba', 'GB', 'female', 'Soft, Scottish'),
  V('en_GB-cori-medium', 'Cori', 'GB', 'female', 'Smooth'),
  V('en_GB-jenny_dioco-medium', 'Jenny', 'GB', 'female', 'Gentle'),
  V('en_GB-alan-medium', 'Alan', 'GB', 'male', 'Even'),
  V('en_GB-northern_english_male-medium', 'Nate', 'GB', 'male', 'Northern English'),
  // ── Multi-voice models (one download, many speakers picked by number) ────────
  V('en_US-libritts_r-medium', 'Libritts', 'US', undefined, 'Many voices', {
    multiSpeaker: true,
    sizeMB: 75,
    speakerCount: 904,
  }),
  V('en_GB-vctk-medium', 'VCTK', 'GB', undefined, 'Many voices', {
    multiSpeaker: true,
    sizeMB: 73,
    speakerCount: 109,
  }),
];

/** The voice used when a device has no saved preference (and on Android's first run). */
export const DEFAULT_ORBIS_VOICE_ID = 'en_US-amy-medium';

export function orbisVoiceById(id: string | undefined | null): OrbisVoice | undefined {
  if (!id) return undefined;
  return ORBIS_VOICES.find((v) => v.id === id);
}

/** Resolve an id to a real voice, always returning something usable (falls back to default). */
export function orbisVoiceOrDefault(id: string | undefined | null): OrbisVoice {
  return orbisVoiceById(id) ?? (orbisVoiceById(DEFAULT_ORBIS_VOICE_ID) as OrbisVoice) ?? ORBIS_VOICES[0];
}

/** A recording-voice id for a multi-speaker Piper model carries a `#N` speaker suffix
 *  (e.g. `en_US-libritts_r-medium#42`). Split it into the base catalog id + speaker index. */
export function splitPiperVoice(voice: string): { id: string; speaker: number } {
  const [id, spk] = voice.split('#');
  const n = Number.parseInt(spk ?? '', 10);
  return { id, speaker: Number.isFinite(n) && n >= 0 ? n : 0 };
}
