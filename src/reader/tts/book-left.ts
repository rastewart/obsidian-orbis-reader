// "~N left" in the full-screen player, while a recorded track plays.

/**
 * Seconds of the book after track `after`: each later track's real length where it is recorded, its estimated length
 * where it is not.
 *
 * **Both, because a book is often only partly recorded** — and the unrecorded tracks still play, in the live voice.
 * Counting only the recorded ones made *~6m left* out of a book with an hour and a half to go, on exactly the books a
 * reader is most likely to be partway through recording. The estimate is the one the live readout uses: words at
 * `wpm`, which already carries the playback rate.
 */
export function bookSecondsAfter(
  after: number,
  recorded: ReadonlyMap<number, number>,
  partWords: readonly number[],
  wpm: number
): number {
  let sum = 0;
  for (let i = after + 1; i < partWords.length; i++) {
    const seconds = recorded.get(i);
    sum += seconds ?? (wpm > 0 ? (partWords[i] / wpm) * 60 : 0);
  }
  return sum;
}
