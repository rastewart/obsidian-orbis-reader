// What every fixture book says about itself: that it was made to test Orbis Reader, and is not a real book.
//
// In the metadata, where a book's details show — the reader's book information, the Library's notes — and on the
// cover, where it shows in the Library and on the opening page. Never as a page or a line of the book's own text,
// which would move the locations and chapter shapes the tests and test plans are written against.

/** `dc:publisher` (EPUB) and `<publisher>` (FB2), unless a book names a publisher of its own for a test. */
export const FIXTURE_PUBLISHER = 'Orbis Reader test fixtures';

/** `dc:description` (EPUB) and `<annotation>` (FB2). */
export const FIXTURE_DESCRIPTION = 'Made to test Orbis Reader. Not a real book: its text is invented.';

/** The line on every generated cover. Capitals only: the covers' bitmap font has no lower case. */
export const FIXTURE_COVER_LINE = 'ORBIS READER TEST BOOK';
