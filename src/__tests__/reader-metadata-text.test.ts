import { describe, expect, it } from 'vitest';
import { metadataText } from '../reader/metadata-text';

// The shapes foliate actually hands over for `creator`. The last one is the bug: a book opened with a
// multilingual creator wrote `[object Object]` as its author, and that string traveled into the reading
// records and into every note exported from them.
describe('metadataText', () => {
  it('takes a plain string, trimmed', () => {
    expect(metadataText(' Jane Doe ')).toBe('Jane Doe');
    expect(metadataText('')).toBe('');
  });

  it('reads the name out of a creator object', () => {
    expect(metadataText({ name: 'Jane Doe', sortAs: 'Doe, Jane' })).toBe('Jane Doe');
  });

  it('joins several creators', () => {
    expect(metadataText([{ name: 'Doe' }, 'Roe'])).toBe('Doe, Roe');
  });

  it('takes a spelling when the name is written in two scripts', () => {
    expect(metadataText({ name: { en: 'Orbis Tester', ja: 'オービス・テスター' } })).toBe('Orbis Tester');
  });

  it('never reads the shape of an object as text', () => {
    expect(metadataText({})).toBe('');
    expect(metadataText({ name: {} })).toBe('');
    expect(metadataText([{}, { name: 'Kept' }])).toBe('Kept');
  });

  it('says nothing for nothing', () => {
    expect(metadataText(null)).toBe('');
    expect(metadataText(undefined)).toBe('');
  });
});
