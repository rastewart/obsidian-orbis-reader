// bookElement makes the element createElement made before it, in every kind of document a book's chapter can be.

import { describe, expect, it } from 'vitest';
import { bookElement, HTML_NS } from '../reader/book-element';

const parse = (source: string, type: DOMParserSupportedType) => new DOMParser().parseFromString(source, type);

describe('bookElement', () => {
  it('makes the same element as createElement in an HTML document', () => {
    const doc = parse('<!DOCTYPE html><html><head></head><body></body></html>', 'text/html');
    const made = bookElement(doc, 'style');
    const before = doc.createElement('style');
    expect(made).toBeInstanceOf(doc.defaultView?.HTMLStyleElement ?? HTMLStyleElement);
    expect([made.namespaceURI, made.localName, made.tagName]).toEqual([
      before.namespaceURI,
      before.localName,
      before.tagName,
    ]);
    expect(made.ownerDocument).toBe(doc);
  });

  it('makes the same element as createElement in an XHTML chapter', () => {
    const doc = parse(
      '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body></body></html>',
      'application/xhtml+xml'
    );
    const made = bookElement(doc, 'img');
    const before = doc.createElement('img');
    expect([made.namespaceURI, made.localName, made.tagName]).toEqual([
      before.namespaceURI,
      before.localName,
      before.tagName,
    ]);
  });

  it('keeps the element HTML in a chapter parsed as plain XML, where createElement would not', () => {
    const doc = parse('<html><body></body></html>', 'application/xml');
    expect(bookElement(doc, 'span').namespaceURI).toBe(HTML_NS);
    expect(doc.createElement('span').namespaceURI).toBeNull();
  });
});
