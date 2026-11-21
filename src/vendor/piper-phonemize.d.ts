// Vendored Emscripten glue for @diffusionstudio/piper-wasm's phonemizer (originally copied
// from @diffusionstudio/vits-web dist). Used by PiperEngine — fed its .wasm/.data as bytes.
//
// Typed for what Orbis passes in and calls, not Emscripten's whole module: the glue takes any
// of Emscripten's module settings, but piper-worker.ts sets only these.

/** The Emscripten module settings piper-worker.ts gives the phonemizer. */
export interface PiperPhonemizeOptions {
  /** The phonemizer's .wasm, already downloaded and checked. */
  wasmBinary: ArrayBuffer;
  /** The espeak-ng data package (.data), already downloaded and checked. */
  getPreloadedPackage: (name: string, size: number) => ArrayBuffer;
  /** Each line the phonemizer writes to stdout: one JSON object with `phoneme_ids`. */
  print: (line: string) => void;
  printErr: (line: string) => void;
  locateFile: (path: string) => string;
}

/** The started module: its command-line entry point, which writes the phonemes through `print`. */
export interface PiperPhonemizeModule {
  callMain(args: string[]): void;
}

export function createPiperPhonemize(options: PiperPhonemizeOptions): Promise<PiperPhonemizeModule>;
