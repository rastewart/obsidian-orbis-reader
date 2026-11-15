import { describe, expect, it } from 'vitest';
import { MAX_PIECE_CHARS, splitForSynthesis } from '../reader/tts/synth-pieces';

// A paragraph the size and shape of the one whose synthesis in one run ended Obsidian on an iPhone: 863 characters,
// six sentences, the last long and full of commas around a dash. Invented — no real book's text goes in the repo.
const CRASHED =
  'It was not that the keeper of Marrowgate was idle or careless, far from it; but for some weeks past he had ' +
  'been tired and short of temper, close to giving the whole thing up. He had grown so wrapped up in the lamps, ' +
  'and so apart from the town below, that he dreaded meeting not only the ferryman, but anyone at all. He was ' +
  'worn down by the long winter and the cold, but the trouble of the accounts had lately stopped weighing on ' +
  'him. He had given up mending the outer stair; he had lost all wish to try. Nothing the ferryman could ever ' +
  'say held any real fear for him. But to be caught on the landing, to be made to stand and hear the latest ' +
  'news from the quay, the price of oil, the state of the roads, and to search his head for answers, to nod, to ' +
  'agree—no, rather than that, he would wait behind the door until the boat had gone and the steps were empty ' +
  'again.';

const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);

describe('splitForSynthesis', () => {
  it('gives text within the limit to one run, as before', () => {
    expect(splitForSynthesis('The keeper climbed the stair to the lamp room.', 'en-us')).toEqual([
      { text: 'The keeper climbed the stair to the lamp room.', endsSentence: true },
    ]);
  });

  it('synthesizes a paragraph like the one that crashed a sentence at a time, every word kept in order', () => {
    expect(CRASHED.length).toBe(863);
    const pieces = splitForSynthesis(CRASHED, 'en-us');
    expect(pieces.map((p) => p.text)).toEqual([
      'It was not that the keeper of Marrowgate was idle or careless, far from it; but for some weeks past he had ' +
        'been tired and short of temper, close to giving the whole thing up.',
      'He had grown so wrapped up in the lamps, and so apart from the town below, that he dreaded meeting not only ' +
        'the ferryman, but anyone at all.',
      'He was worn down by the long winter and the cold, but the trouble of the accounts had lately stopped ' +
        'weighing on him.',
      'He had given up mending the outer stair; he had lost all wish to try.',
      'Nothing the ferryman could ever say held any real fear for him.',
      'But to be caught on the landing, to be made to stand and hear the latest news from the quay, the price of ' +
        'oil, the state of the roads, and to search his head for answers, to nod, to agree—no, rather than that, he ' +
        'would wait behind the door until the boat had gone and the steps were empty again.',
    ]);
    expect(pieces.every((p) => p.endsSentence)).toBe(true);
    expect(pieces.flatMap((p) => words(p.text))).toEqual(words(CRASHED));
  });

  it('cuts a sentence longer than the limit at its clauses, pausing only where the sentence ends', () => {
    const clause = 'to be made to stand and hear the latest news from the quay and the price of oil, ';
    const sentence = `${clause.repeat(8).trim().replace(/,$/, '')}.`;
    const pieces = splitForSynthesis(`${sentence} Then he left.`, 'en-us', 200);
    expect(pieces.length).toBeGreaterThan(3);
    expect(pieces.every((p) => p.text.length <= 200)).toBe(true);
    expect(pieces.at(-1)).toEqual({ text: 'Then he left.', endsSentence: true });
    const cut = pieces.slice(0, -1);
    expect(cut.slice(0, -1).every((p) => !p.endsSentence)).toBe(true);
    expect(cut.at(-1)?.endsSentence).toBe(true);
    expect(cut.slice(0, -1).every((p) => p.text.endsWith(','))).toBe(true);
  });

  it('cuts a clause longer than the limit at its words', () => {
    const run = `${'word '.repeat(150).trim()}.`;
    const pieces = splitForSynthesis(run, 'en-us', 100);
    expect(pieces.every((p) => p.text.length <= 100)).toBe(true);
    expect(pieces.flatMap((p) => words(p.text))).toEqual(words(run));
  });

  it('keeps every piece of a long paragraph within the default limit', () => {
    const pieces = splitForSynthesis(CRASHED.repeat(3), 'en-us');
    expect(pieces.every((p) => p.text.length <= MAX_PIECE_CHARS)).toBe(true);
  });
});
