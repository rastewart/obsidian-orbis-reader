/**
 * Trim leading/trailing whitespace off a selection Range in place, so its start/end land on real
 * text rather than inter-element whitespace.
 *
 * Why: selecting a heading (or dragging slightly past a block) produces a Range whose end sits in
 * the whitespace text node *between* blocks — e.g. start inside `<h2>CHAPTER II</h2>`, end in the
 * "\n    " after it. That range is forward and contains text, so it stores a "valid" CFI, but it
 * spans a block boundary that the passage does not. Pulling the ends in to the first/last
 * non-whitespace character keeps the stored CFI tight, so overlap checks and exports see the passage
 * itself. (Before ORBIS patch 15 such a range also drew nothing — the phantom search result.)
 *
 * No-op if the range is already tight or is entirely whitespace (nothing to tighten to).
 */
export function tightenRange(range: Range): void {
  const text = range.toString();
  const trimmed = text.trim();
  if (!trimmed || trimmed === text) return;
  const lead = text.length - text.replace(/^\s+/, '').length;
  const trail = text.length - text.replace(/\s+$/, '').length;

  const cac = range.commonAncestorContainer;
  const root = cac.nodeType === Node.TEXT_NODE ? cac.parentNode : cac;
  const doc = range.startContainer.ownerDocument;
  if (!root || !doc) return;

  // Text-node segments the range covers, in document order, with each node's covered [from, to).
  // Concatenated, these equal range.toString(), so char indices into `text` map back to (node,offset).
  const segments: { node: Text; from: number; to: number }[] = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text;
    if (!range.intersectsNode(node)) continue;
    const from = node === range.startContainer ? range.startOffset : 0;
    const to = node === range.endContainer ? range.endOffset : node.data.length;
    if (to > from) segments.push({ node, from, to });
  }
  if (!segments.length) return;

  const posAt = (idx: number): { node: Text; offset: number } => {
    let acc = 0;
    for (const seg of segments) {
      const len = seg.to - seg.from;
      if (idx <= acc + len) return { node: seg.node, offset: seg.from + (idx - acc) };
      acc += len;
    }
    const last = segments[segments.length - 1];
    return { node: last.node, offset: last.to };
  };

  const s = posAt(lead);
  const e = posAt(text.length - trail);
  range.setStart(s.node, s.offset);
  range.setEnd(e.node, e.offset);
}
