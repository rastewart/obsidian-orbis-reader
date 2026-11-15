// The two glyphs that say where the audio you are hearing came from.
//
// **One distinction, four surfaces, one definition.** A mic for audio that was recorded; broadcast arcs for a voice
// speaking now. They appear on the Listen bar chip, on the full player's chip, in the Voice and source popup's VOICE
// row, on every chapter row of a mix, and beside the "Always use the live voice" setting — and they only teach
// anything if they are identical in all of them, which is why they live here rather than beside any one caller.
//
// Drawn rather than named. `setIcon` renders **nothing** for an id the bundled icon set doesn't have, silently,
// which is the worst failure mode there is for a glyph carrying meaning — and Obsidian's set isn't enumerable from
// outside the app, so there is no way to be sure of a name. Every other glyph in the player is hand-rolled for the
// same reason; these follow that house style exactly (24 grid, stroke-width 2, `currentColor`, round caps) so they
// sit beside the transport without looking imported.
//
// Sized at 15 to match the chip, and overridden per surface in CSS — a `width`/`height` rule beats the attribute.
//
// See docs/design/text-to-speech.md § "Voice & source".

/**
 * Recorded — a microphone: capsule, cradle, stand.
 *
 * No base bar under the stand: it reads better at 32px and worse at the size this is actually seen, because it pushes
 * the capsule up and thins everything above it.
 *
 * **It marks state, never an action.** Nothing that *starts* a recording gets this glyph — not "Add recording",
 * not "Generate" — because a mic on a control means "tap to speak" everywhere else in software, and that one
 * misread would undo the pair.
 */
export const VOICE_RECORDED_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg>';

/**
 * Live — two arcs each side, radiating. Sound leaving a source, which is what "on air" has looked like since
 * radio.
 *
 * **The arcs are `SPEAKER_SVG`'s own**, the volume glyph already on this toolbar, mirrored — so the live marker is
 * the house speaker with its cone removed and its waves made symmetrical. That is why it belongs here rather than
 * looking borrowed.
 *
 * No filled dot at the center: at 15px it is two device pixels and reads as grit rather than as a thing.
 */
export const VOICE_LIVE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M8.5 8.5a5 5 0 0 0 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/><path d="M5 5a9 9 0 0 0 0 14"/></svg>';

/** Whichever of the two applies. `recorded` is `VoiceInfo.recorded` at every call site. */
export function voiceOriginSvg(recorded: boolean): string {
  return recorded ? VOICE_RECORDED_SVG : VOICE_LIVE_SVG;
}
