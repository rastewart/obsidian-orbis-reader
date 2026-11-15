// A chapter's frame holds its chapter and nothing else. See docs/design/security.md, "A chapter stays in its frame".
//
// **Every route out, not a list of them.** The reader's link handler finds the links it knows how to read and sends
// each through "Open this link?" (`findLink`, ORBIS patch 23). A book can hold a link that handler cannot see — a
// `<use>` copy of an SVG link, an address an animation supplies — and a tap on one sent the chapter's frame
// straight to its address: no dialog, an `obsidian://` action run on Android, a blank reader on the Mac, and on
// iPhone and iPad a script in the book running in Obsidian's window (frame-navigation.epub). Each trick could be
// patched as it is found, but the next one would not be. So the frame itself refuses to go: the Navigation API's
// `navigate` event fires for every navigation a document starts, however it started — a tap, a key, a form — and
// cancelling it keeps the chapter where it is.
//
// **Orbis's own loads never fire it.** A chapter is written into the frame's `srcdoc` from Obsidian's window, which
// replaces the document rather than navigating it: measured on the Mac, the iPad and Android, chapter changes,
// reloads and patch 12's redisplay fired no `navigate` event. `about:srcdoc` is still let through, as the one address
// a chapter is ever loaded from.
//
// **Where the engine has no Navigation API** (iPadOS before 26.2), the link handler's own rule is what is left: a tap
// inside SVG that it could not read does nothing (ORBIS patch 27).

/** The address of every chapter Orbis loads: its document is written into `srcdoc`. */
const CHAPTER_ADDRESS = 'about:srcdoc';

interface NavigateEventLike extends Event {
  destination?: { url?: string };
}

/**
 * Keep the chapter in `win` in place: cancel every navigation it starts. Returns false when the engine has no
 * Navigation API, so the caller can say so once.
 *
 * `log` hears each cancelled navigation, with its address, so a device test can see the guard working.
 */
export function keepChapterInPlace(win: Window | null, log: (msg: string) => void): boolean {
  // Typed as always there, which an engine before Safari 26.2 does not bear out.
  const navigation = win?.navigation as EventTarget | undefined;
  if (!navigation) return false;
  navigation.addEventListener('navigate', (event) => {
    const address = (event as NavigateEventLike).destination?.url ?? '';
    if (address === CHAPTER_ADDRESS) return;
    event.preventDefault();
    log(`kept the chapter in its frame: refused a navigation to ${address.slice(0, 120)}`);
  });
  return true;
}
