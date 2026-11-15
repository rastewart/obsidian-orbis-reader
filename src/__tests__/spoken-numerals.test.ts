import { describe, expect, it } from 'vitest';
import { regnalOrdinal, speakNamedNumerals } from '../reader/tts/spoken-numerals';
import { normalizeForSpeech } from '../reader/tts/tts-blocks';

// The phonemizer read every one of these "roman" and a number: "Henry roman six", "World War roman two".
describe('speakNamedNumerals', () => {
  const said = (s: string) => speakNamedNumerals(s);

  it("reads a ruler's numeral as an ordinal", () => {
    expect(said('Henry VI was king.')).toBe('Henry the Sixth was king.');
    expect(said('King George III ruled.')).toBe('King George the Third ruled.');
    expect(said('under Louis XIV and Louis XVIII')).toBe('under Louis the Fourteenth and Louis the Eighteenth');
    expect(said('Pope John Paul II spoke.')).toBe('Pope John Paul the Second spoke.');
    expect(said('Pope John XXIII')).toBe('Pope John the Twenty-third');
    expect(said("Henry VI's reign")).toBe("Henry the Sixth's reign");
  });

  it('reads a title before a name it does not know as a ruler too', () => {
    expect(said('Emperor Talvar IV')).toBe('Emperor Talvar the Fourth');
    expect(said('King Brannoc II')).toBe('King Brannoc the Second');
  });

  it('reads V and X after a ruler, and leaves them alone anywhere else', () => {
    expect(said('Charles V and Leo X')).toBe('Charles the Fifth and Leo the Tenth');
    expect(said('Malcolm X spoke.')).toBe('Malcolm X spoke.');
    expect(said('known as Gen V')).toBe('known as Gen V');
  });

  it('reads a numbered thing as a number', () => {
    expect(said('after World War II ended')).toBe('after World War 2 ended');
    expect(said('under Article III')).toBe('under Article 3');
    expect(said('Stalag Luft III')).toBe('Stalag Luft 3');
    expect(said('Harbor Letters III, p. 26')).toBe('Harbor Letters 3, p. 26');
    expect(said('a fictional Brannoc II')).toBe('a fictional Brannoc 2');
  });

  it('leaves the pronoun I, abbreviations and split words alone', () => {
    expect(said('When George I was young')).toBe('When George I was young');
    expect(said('Elizabeth I')).toBe('Elizabeth I');
    expect(said('the Sega CD and Washington DC')).toBe('the Sega CD and Washington DC');
    expect(said('C HAPTER S IX')).toBe('C HAPTER S IX');
    expect(said('Super Bowl XL')).toBe('Super Bowl XL');
  });

  it('needs a capitalized word before the numeral, not a heading in capitals or a lower-case word', () => {
    expect(said('THE END OF BOOK II')).toBe('THE END OF BOOK II');
    expect(said('type II diabetes')).toBe('type II diabetes');
  });
});

describe('regnalOrdinal', () => {
  it('names every ordinal a numeral of I, V and X can write', () => {
    expect(regnalOrdinal(1)).toBe('the First');
    expect(regnalOrdinal(12)).toBe('the Twelfth');
    expect(regnalOrdinal(20)).toBe('the Twentieth');
    expect(regnalOrdinal(23)).toBe('the Twenty-third');
    expect(regnalOrdinal(39)).toBe('the Thirty-ninth');
    expect(regnalOrdinal(40)).toBeNull();
  });
});

describe('normalizeForSpeech with numerals after names', () => {
  it('reads a ruler in a line of capitals once the run is lowered', () => {
    expect(normalizeForSpeech('HENRY VI WAS KING IN THOSE YEARS.')).toBe('Henry the Sixth was king in those years.');
  });

  it('still reads a numeral after a heading word as a number', () => {
    expect(normalizeForSpeech('Chapter IV begins at dawn.')).toBe('Chapter 4 begins at dawn.');
  });
});
