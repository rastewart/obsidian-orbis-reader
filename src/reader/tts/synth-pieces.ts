// How the Piper worker cuts a long text into the pieces it synthesizes one at a time.
//
// **One ORT run's memory grows with its input, and on an iPhone a long enough input ends the page.** iOS killed
// Obsidian partway through one run of 863 characters (1,878 phonemes), while 550 characters (1,145 phonemes)
// synthesized again and again. WebAssembly memory never shrinks, so what matters is the largest single run — and a
// sentence, a recording's unit, can be longer than any Read ahead chunk.
//
// So a text over the limit is synthesized sentence by sentence and the audio joined: the clip is still the whole
// text, but no run is longer than one sentence. A sentence longer than the limit is cut at its clauses, and a clause
// still longer at its words. Pulled out of the worker so a test can reach it.

/** The longest text one ORT run is given — under the 550 characters the iPhone synthesized without trouble. */
export const MAX_PIECE_CHARS = 400;

/**
 * One run's text, and whether a sentence ends with it. A sentence synthesized alone ends on its last sound, so the
 * worker joins two sentences with the jittered pause the engines put between clips (`jitteredPauseMs`), and the pieces
 * of one sentence with nothing — a pause inside a clause would be a stumble.
 */
export interface SynthPiece {
  text: string;
  endsSentence: boolean;
}

/** `text` in the order spoken, each piece at most `maxChars` unless a single word is longer. */
export function splitForSynthesis(text: string, lang: string, maxChars = MAX_PIECE_CHARS): SynthPiece[] {
  if (text.length <= maxChars) return [{ text, endsSentence: true }];
  const pieces: SynthPiece[] = [];
  for (const sentence of sentences(text, lang)) {
    const parts = sentence.length <= maxChars ? [sentence] : pack(clauses(sentence), maxChars);
    parts.forEach((part, i) => {
      for (const p of part.length <= maxChars ? [part] : pack(cutAfter(part, /\s+/g), maxChars))
        pieces.push({ text: p.trim(), endsSentence: false });
      if (i === parts.length - 1) pieces[pieces.length - 1].endsSentence = true;
    });
  }
  return pieces.filter((p) => p.text);
}

/** The sentences of `text`, through `Intl.Segmenter` where there is one, else at sentence-ending punctuation. */
function sentences(text: string, lang: string): string[] {
  let segmenter: Intl.Segmenter | null = null;
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function')
      segmenter = new Intl.Segmenter(lang || 'en', { granularity: 'sentence' });
  } catch {
    segmenter = null;
  }
  const out = segmenter
    ? Array.from(segmenter.segment(text), (s) => s.segment)
    : cutAfter(text, /[.!?…]+["'”’)\]]*\s+/g);
  return out.filter((s) => s.trim());
}

/** A sentence cut after each clause mark, the mark staying with the clause it ends. */
function clauses(sentence: string): string[] {
  return cutAfter(sentence, /[,;:—–]\s*/g);
}

/** `text` cut after each match of `mark`, which stays with the part before it — a lookbehind `split` without the
 *  lookbehind, which Obsidian's plugin lint rejects (`obsidianmd/regex-lookbehind`). */
function cutAfter(text: string, mark: RegExp): string[] {
  const out: string[] = [];
  let from = 0;
  for (const m of text.matchAll(mark)) {
    const end = m.index + m[0].length;
    if (end > from) out.push(text.slice(from, end));
    from = end;
  }
  if (from < text.length) out.push(text.slice(from));
  return out;
}

/** Consecutive `parts` joined while they fit in `maxChars`. A part longer than that stays on its own. */
function pack(parts: string[], maxChars: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const part of parts) {
    if (cur && cur.length + part.length > maxChars) {
      out.push(cur);
      cur = '';
    }
    cur += part;
  }
  if (cur) out.push(cur);
  return out;
}
