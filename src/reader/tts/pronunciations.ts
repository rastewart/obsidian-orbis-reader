// Pronunciation dictionary: user-supplied phonetic respellings substituted into text just before
// synthesis, so a name the voice mangles ("Vantry") can be spelled the way it should sound
// ("VAN tree"). Applied inside normalizeForSpeech, which every synthesis path funnels
// through — live Piper, system voices, and both recording engines — so one entry fixes all of them.
//
// Deliberate limits:
// - Respelling only, not phonemes. It's the one mechanism all three engines accept: the Web Speech
//   API supports no SSML at all (so <phoneme> is unavailable for system voices) and the
//   OpenAI-compatible /v1/audio/speech endpoint takes plain text.
// - Whole tokens only, so context-dependent homographs ("read", "lead") can't be handled. There is
//   no signal here to disambiguate them; a respelling would be wrong half the time.
// - Substitution is a text rewrite, so it never moves highlight ranges (see normalizeForSpeech's
//   contract). A length-changing respelling does slightly widen the char-proportional position
//   estimate's drift within an affected sentence, which resyncs at the next sentence boundary.

/** One respelling: say `word` as `say`. `word` is matched case-insensitively as a whole token. */
export interface Pronunciation {
  /**
   * This entry's own id, minted once and never edited — what multi-device sync merges by.
   *
   * **Not the word.** A word is a thing a reader retypes: correcting "Vantrey" to "Vantry" would otherwise be
   * a delete and a create rather than an edit, which loses the entry's history and leaves a tombstone behind. It also
   * cannot be a file name — a word may legitimately contain a slash, and every published copy is a file.
   *
   * Optional because an entry can be stored without one; `ensureGlossaryIds` gives it one on load.
   */
  id?: string;
  /** The word as it appears in books. No whitespace; internal hyphens/apostrophes and a trailing
   *  period are allowed so "St.", "Saint-Saëns" and "O'Brien" are each a single entry. */
  word: string;
  /** What to hand the engine instead. May contain spaces — that's how you respell ("Duss toy
   *  EFF skee") — and hyphens, which give espeak syllable breaks to work with. */
  say: string;
  /** Off keeps the entry without applying it, for auditioning a respelling against the original. */
  enabled: boolean;
}

/** A compiled substitution pass. Null when there is nothing to substitute, so the common case
 *  (no dictionary) costs a null check per sentence rather than a regex run. */
export type Pronouncer = (text: string) => string;

/** Characters that count as "inside a word" for boundary purposes — Unicode-aware, unlike `\b`,
 *  which is ASCII-only and would mis-fire around accented letters (Saëns, Đurić). */
const WORD_CHAR = String.raw`\p{L}\p{N}`;

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether `word` is usable as a dictionary key: one token, no whitespace, at least one letter or
 * digit. Rejecting whitespace is what keeps matching unambiguous — a phrase would invite
 * overlapping matches with no principled precedence.
 */
export function isValidPronunciationWord(word: string): boolean {
  const w = word.trim();
  if (!w || /\s/.test(w)) return false;
  return new RegExp(`[${WORD_CHAR}]`, 'u').test(w);
}

/**
 * Canonical form of a respelling: trimmed and LOWERCASED.
 *
 * Uppercase is a trap, not a style choice. espeak-ng (Piper's phonemizer) spells short all-caps runs
 * out letter by letter, and normalizeForSpeech deliberately leaves runs of 3 letters or fewer alone
 * because those are usually acronyms that SHOULD be spelled out (FBI, USA). So a stress-marking
 * respelling like "Duss-TOY-EF-SKE" comes back as "T-O-Y, E-F, S-K-E" — garbled. Lowercasing
 * prevents that, and it costs nothing: stress can't be conveyed to the engine through capitals anyway.
 *
 * Applied at every ingress (editor save, vault-file read) AND inside compilePronouncer, so an entry
 * stored with capitals still behaves without needing to be re-entered.
 */
export function normalizePronunciationSay(say: string): string {
  return say.trim().toLowerCase();
}

/** Whether `say` is usable as a replacement: non-empty once trimmed. Spaces are allowed. */
export function isValidPronunciationSay(say: string): boolean {
  return say.trim().length > 0;
}

/**
 * Compile the enabled entries into a single substitution pass, or null if there's nothing to do.
 *
 * One combined alternation rather than a replace() per entry, for two reasons: it's a single scan,
 * and — more importantly — it makes substitution non-cascading. Sequential passes would let one
 * entry's *output* be rewritten by a later entry (respell "Dover" as "Doe ver", then an entry for
 * "ver" corrupts it). A single pass consumes each match and moves on.
 *
 * Alternatives are sorted longest-first so overlapping keys prefer the longer match, which is what
 * a reader expects ("St. Petersburg" over "St." if both were somehow present).
 */
export function compilePronouncer(entries: readonly Pronunciation[]): Pronouncer | null {
  const active = entries.filter((e) => e.enabled && isValidPronunciationWord(e.word) && isValidPronunciationSay(e.say));
  if (!active.length) return null;

  // Later duplicates win, matching how the settings list replaces an existing word.
  const bySay = new Map<string, string>();
  for (const e of active) bySay.set(e.word.trim().toLowerCase(), normalizePronunciationSay(e.say));

  const alts = [...bySay.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join('|');
  // `(^|[^word])` captures the preceding boundary rather than using a lookbehind: lookbehind is
  // unsupported on older iOS WebViews, and capturing works identically here because the boundary
  // char is re-emitted by the replacer and never swallowed from the next match's view.
  let re: RegExp;
  try {
    re = new RegExp(`(^|[^${WORD_CHAR}])(${alts})(?![${WORD_CHAR}])`, 'giu');
  } catch {
    return null; // a key escaped badly — better to not substitute than to corrupt the text
  }

  return (text: string): string =>
    text.replace(re, (_m, pre: string, hit: string) => `${pre}${bySay.get(hit.toLowerCase()) ?? hit}`);
}
