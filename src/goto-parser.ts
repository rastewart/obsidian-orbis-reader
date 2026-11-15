// The Go to location bar accepts three input shapes: a raw epubcfi, a percentage ("34%"),
// or a plain location number. This is the pure parse/validate step, kept
// separate from the bar so it doesn't need the reader's DOM to test.
export type GoToParseResult =
  | { valid: true; target: string }
  | { valid: false; error: 'empty' | 'pct_out_of_range' | 'invalid_location' };

export function parseGoToInput(raw: string, totalLocs: number | null): GoToParseResult {
  const val = raw.trim();
  if (!val) return { valid: false, error: 'empty' };

  if (val.startsWith('epubcfi(')) return { valid: true, target: val };

  if (val.endsWith('%')) {
    const pct = parseInt(val.slice(0, -1).trim(), 10);
    if (isNaN(pct) || pct < 0 || pct > 100) return { valid: false, error: 'pct_out_of_range' };
    return { valid: true, target: val };
  }

  const loc = parseInt(val, 10);
  if (isNaN(loc) || loc <= 0 || (totalLocs != null && loc > totalLocs)) {
    return { valid: false, error: 'invalid_location' };
  }
  return { valid: true, target: val };
}
