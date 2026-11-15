// Vendored Emscripten glue for @diffusionstudio/piper-wasm's phonemizer (originally copied
// from @diffusionstudio/vits-web dist). Used by PiperEngine — fed its .wasm/.data as bytes.
// biome-ignore lint/suspicious/noExplicitAny: dynamically-typed emscripten module
export function createPiperPhonemize(moduleArg?: Record<string, any>): Promise<any>;
