// Types for the part of lamejs Orbis uses. lamejs ships none; these follow `index.js`'s exports.

/** An MPEG-1 Layer III encoder. `encodeBuffer` returns the frames completed so far, `flush` the rest. */
export class Mp3Encoder {
  constructor(channels: number, sampleRate: number, kbps: number);
  encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
  flush(): Int8Array;
}
