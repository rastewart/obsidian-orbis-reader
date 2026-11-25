// A minimal TrueType file for tests, built table by table so each fact a test depends on is set on purpose: the
// names, the weight and style, the embedding bits, and a variable font's weight axis.

export interface Spec {
  tag?: string;
  names?: Record<number, string>;
  weight?: number;
  fsSelection?: number;
  fsType?: number;
  wght?: [number, number];
  noOs2?: boolean;
  macStyle?: number;
}

/** A TrueType file with the tables `readFontFile` reads, and nothing else. */
export function fontBytes(spec: Spec = {}): Uint8Array {
  const tables: [string, Uint8Array][] = [];
  // name: format 0, Windows English records, UTF-16BE strings.
  const names = Object.entries(spec.names ?? { 1: 'Test Sans', 2: 'Regular' });
  const strings = names.map(([, s]) => {
    const b = new Uint8Array(s.length * 2);
    for (let i = 0; i < s.length; i++) {
      b[i * 2] = s.charCodeAt(i) >> 8;
      b[i * 2 + 1] = s.charCodeAt(i) & 0xff;
    }
    return b;
  });
  const nameHeader = 6 + names.length * 12;
  const name = new Uint8Array(nameHeader + strings.reduce((n, s) => n + s.length, 0));
  const nv = new DataView(name.buffer);
  nv.setUint16(2, names.length);
  nv.setUint16(4, nameHeader);
  let offset = 0;
  names.forEach(([id], i) => {
    const at = 6 + i * 12;
    nv.setUint16(at, 3);
    nv.setUint16(at + 2, 1);
    nv.setUint16(at + 4, 0x0409);
    nv.setUint16(at + 6, Number(id));
    nv.setUint16(at + 8, strings[i].length);
    nv.setUint16(at + 10, offset);
    name.set(strings[i], nameHeader + offset);
    offset += strings[i].length;
  });
  tables.push(['name', name]);
  if (!spec.noOs2) {
    const os2 = new Uint8Array(78);
    const ov = new DataView(os2.buffer);
    ov.setUint16(4, spec.weight ?? 400);
    ov.setUint16(8, spec.fsType ?? 0);
    ov.setUint16(62, spec.fsSelection ?? 0x40);
    tables.push(['OS/2', os2]);
  }
  const head = new Uint8Array(54);
  new DataView(head.buffer).setUint16(44, spec.macStyle ?? 0);
  tables.push(['head', head]);
  if (spec.wght) {
    const fvar = new Uint8Array(16 + 20);
    const fv = new DataView(fvar.buffer);
    fv.setUint16(0, 1);
    fv.setUint16(4, 16);
    fv.setUint16(8, 1);
    fv.setUint16(10, 20);
    fvar.set([0x77, 0x67, 0x68, 0x74], 16); // 'wght'
    fv.setInt32(20, spec.wght[0] * 65536);
    fv.setInt32(24, 400 * 65536);
    fv.setInt32(28, spec.wght[1] * 65536);
    tables.push(['fvar', fvar]);
  }
  const dir = 12 + tables.length * 16;
  const total = dir + tables.reduce((n, [, b]) => n + b.length, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  const tag = spec.tag ?? '\u0000\u0001\u0000\u0000';
  for (let i = 0; i < 4; i++) out[i] = tag.charCodeAt(i);
  v.setUint16(4, tables.length);
  let at = dir;
  tables.forEach(([t, b], i) => {
    const rec = 12 + i * 16;
    for (let j = 0; j < 4; j++) out[rec + j] = t.charCodeAt(j);
    v.setUint32(rec + 8, at);
    v.setUint32(rec + 12, b.length);
    out.set(b, at);
    at += b.length;
  });
  return out;
}
