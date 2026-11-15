# Test plan — Book sources

← [Design Docs](../README.md)

Book sources: turning it on, the OPDS feeds in settings, browsing and searching a feed, choosing and downloading books, signing in, and what Orbis Reader says when a feed fails. What a user sees is in the guide: [Book sources](../../guide/book-sources.md).

**Not here:** what happens to a downloaded book once it is a title note ([Library dashboards](library-dashboards.md)), and how the feed list travels between devices beyond the per-device facts below. Each belongs to its own page.

These steps reach real servers: Project Gutenberg for browsing and downloading, and a few public addresses chosen to make each failure happen. Expected titles and sizes are what Gutenberg published when this page was written; a size a few KB off is not a failure.

---
## Where each step runs

Every step carries one tag.

| Tag       | Run it on                                                    |
| --------- | ------------------------------------------------------------ |
| `once`    | Any one device. The result does not depend on the device     |
| `each`    | Every device: Mac, Android, iPhone and iPad                  |
| `desktop` | The Mac — a pointer and a keyboard                           |
| `mobile`  | Android, iPhone and iPad — touch                             |
| `phone`   | Android and iPhone — a phone-sized screen                    |
| `ipad`    | The iPad                                                     |
| `android` | Android                                                      |

---
## Setup

- [ ] `once` In **Settings → Orbis Reader → Book sources**, write down what **Book sources**, **Downloads folder** and the **OPDS feeds** list say, and what **Language** says in **Project Gutenberg**'s pencil, so Clean up can put them back.

- [ ] `once` In **Settings → Orbis Reader → Library dashboards**, **Enable the library** is on, so a download is cataloged. Turn on the **`sources`** pill in the debug log: every request a feed makes is logged there.

---
## Turning it on and off

These run in the repository's `test-vault`, opened as a vault of its own on the Mac: the dialog only appears while the downloads folder is empty, and the folder travels with the vault's settings.

- [ ] `desktop` In `test-vault`, **Settings → Orbis Reader → Book sources** shows only the **Book sources** switch, off. Turn it on: a dialog opens titled **Enable book sources**, saying book sources fetch from servers outside your vault and nothing is fetched until you ask, then **Where should downloaded books go?** with `Library/Downloads` suggested — **(created when first used)** if there is no such folder. Select **Cancel**: the switch is off again.

- [ ] `desktop` Turn it on again and select **Enable**. The **Downloads folder** row and the **OPDS feeds** list appear, with **Project Gutenberg** in it. The ribbon has a cloud-with-arrow icon named **Browse book sources**, and the palette has **Orbis Reader: Browse book sources**.

- [ ] `desktop` Turn **Book sources** off. The rows below it go, the ribbon icon goes, and the command leaves the palette. Turn it back on: no dialog this time, and the feeds and the folder are as they were.

- [ ] `phone` On a phone the ribbon is the menu behind the button at the bottom left. Turn **Book sources** off: **Browse book sources** leaves that menu at once, with no reload. Turn it on: it is back, at the end of the menu.

- [ ] `each` In your synced vault, the switch is per device: turn it on on one device, and another still has it off — with the feeds and the folder already there when it is turned on. On the device where it is off, **Settings → Orbis Reader → Setup** shows **Book sources** with **Set up**, not **Ready**; select it, and the switch turns on with no dialog, since the folder is already chosen.

---
## Your OPDS feeds

All on **Settings → Orbis Reader → Book sources**.

- [ ] `once` **Project Gutenberg**'s row shows its address, `https://www.gutenberg.org/ebooks/search.opds/`, a pencil, a switch, the arrows and the grip — and no trash. Open its pencil: **Provided with Orbis Reader — its address is kept up to date, so it cannot be edited here.** **Name** and **OPDS address** cannot be changed; **Language**, **Source ID**, **Username** and **Password** are there. Cancel.

- [ ] `once` Select **+** beside **OPDS feeds**: a dialog titled **Add a source**, with **Name**, **OPDS address**, **Username** and **Password**, and no **Language** or **Source ID**. Save it empty: a notice says **Give the source a name**. Name it `Test feed`, set **OPDS address** to `example.com`, and save: **Enter the feed address, starting with http:// or https://**.

- [ ] `once` Set the address to `https://example.com/` and save: **Source added**, and **Test feed** is in the list, switched on. Open its pencil: **Source ID** is now there, read-only. The eye beside **Password** is unavailable until you type. Type `test-secret`: it is masked, and the eye now shows it and hides it again. Save.

- [ ] `once` Open **Test feed**'s pencil again. **Password** shows gray dots and **Saved on this device. Type a new one to replace it.**, and the eye is unavailable: the saved password is never put in the field, so there is nothing to show. Rename the feed `Test feed 2` and save, then open it again: the dots are still there — the password was kept. Select **Remove password**: the dots go, the line says **Removed when you save.**, and the button goes. Select **Cancel**, open it again, and the dots are back. Select **Remove password** and **Save**: opened again, there are no dots and no **Remove password**, and **Settings → Keychain** no longer lists an `orbis-book-source-…-password` entry for its **Source ID** — removed, not left there empty. Rename it back to `Test feed`.

- [ ] `once` Move **Test feed** above **Project Gutenberg** with **Move up**. Open **Browse book sources**: the feeds are listed in that order. Close it and move it back.

- [ ] `once` Switch **Test feed** off. **Browse book sources** no longer lists it. Switch **Project Gutenberg** off too: the browse dialog says **No sources are enabled. Add one in Settings → Book sources.** Switch Gutenberg back on.

---
## Browsing and searching Project Gutenberg

- [ ] `each` Select the ribbon icon. The dialog is titled **Browse book sources** and lists **Project Gutenberg** with its address. Select it: the title becomes **Project Gutenberg**, the bar above the list has **←**, the feed's name and **↗**, and a **Search this source** row with a box saying **Title, author, subject…** and **Search**. No **Authors** or **Subjects** rows: Gutenberg refuses those, and the debug log says it hid them.

- [ ] `each` Type `moby dick` and press **Enter**. The title becomes **Results for “moby dick”**. Each row shows a title and, under it, **Herman Melville** — Gutenberg names the author in the description — with a **>** on the right.

- [ ] `once` Select **↗**: Gutenberg's own page for this search opens in the browser.

- [ ] `each` Select **Moby Dick; Or, The Whale**. The page lists two editions with the same title, told apart by the line under each: **EPUB (older e-readers, no images) · 712 KB** and **EPUB3 (E-readers incl. Send-to-Kindle) · 795 KB**. Neither has a **>**.

- [ ] `once` Select **Next page** on the results, where it is offered, then **←**: back to the search results, then back to the first page of the feed, then back to the list of feeds.

---
## Choosing and downloading

- [ ] `each` On the Moby Dick page, select the no-images edition. A **✓** appears, and the footer says **1 selected** and **Downloads will be saved in the** *folder* **folder**, with **Close**, **Clear** and **Download**. Select it again: the tick goes and the footer says **Select books to download**. Select it again.

- [ ] `each` Select **←**, search `pride and prejudice`, open the Jane Austen title, and select an edition: the footer says **2 selected**. The first choice survived moving around the feed.

- [ ] `once` Select **Download**. The dialog is titled **Downloads**: **You chose the following books to download**, both books with their format and size, and **They will be saved in the** *folder* **folder.** Select the **×** beside Pride and Prejudice: it leaves the list, and the button reads **Download 1**. Select **Keep browsing**: back on the page, with **1 selected**. Select Pride and Prejudice again, then **Download** and **Download 2**.

- [ ] `each` While it works, it says **Downloading** *title* **(1 of 2)…**, then 2 of 2. It ends on **Downloads finished**, one line per book: **Saved to** *folder*`/Moby Dick; Or, The Whale - Melville, Herman (no images).epub`**, and cataloged** — the edition without images, named as one — and the same for Pride and Prejudice. **Continue** returns to the page you were on, with nothing selected.

- [ ] `once` Each file opens as a book, and each has a title note in the folder for new title notes, made from the book's own metadata.

- [ ] `once` Select the no-images Moby Dick edition again and download it: **Already in your vault:** and its path. Nothing was fetched — the debug log has a **skipped** line and no **GET** for the book.

- [ ] `once` Select **both** Moby Dick editions and download them. The one without images is **Already in your vault**; the other is saved as `Moby Dick; Or, The Whale - Melville, Herman.epub`, with no edition in its name. The two now sit side by side in the folder.

- [ ] `each` Search `dickens` and select five books from their pages, then **Download 5**. While the first is downloading, select **Stop**: the dialog says **Stopping after this book…**. The report says **Stopped — 4 books were not downloaded.** — or as many as were left — above the line for the one that finished.

---
## Language

- [ ] `once` Open **Project Gutenberg**'s pencil. **Language** is **Every language**, followed by twenty-two languages in Gutenberg's own order — English, French, German, Finnish… Choose **Finnish** and save.

- [ ] `once` Browse Gutenberg and search `finn`: the results are Finnish books, and the **GET** line in the debug log carries `l.fi` after the search words — Gutenberg's way of asking for one language. Set **Language** back to what you wrote down.

---
## When a feed fails

Each step points **Test feed**'s address somewhere chosen to fail one way, then opens it from **Browse book sources**. The message appears above the list, and you stay where you were.

- [ ] `once` `https://example.com/` — a web page, not a feed: **The source answered with something that is not an OPDS feed.**

- [ ] `once` `https://example.com/opds/nothing-here` — **The source says there is nothing at that address.**

- [ ] `once` `https://nothing.invalid/opds` — a name that never resolves: **Could not reach the source. Check the address, and that the machine is awake.**

- [ ] `once` `https://test.opds.io/2.0/home.json` — a public OPDS 2.0 test feed: **That looks like an OPDS 2.0 feed, which Orbis Reader cannot read yet.**

- [ ] `each` `https://httpbin.org/redirect-to?url=http%3A%2F%2F192.168.1.1%2Fopds` — a public address that redirects to one on a home network: the message begins **This source pointed to an address on your own network, so Orbis Reader did not follow it.** The debug log has the **GET** to httpbin, then `302 → http://192.168.1.1/opds`, then **refused** — and no **GET** to `192.168.1.1`. Run it on every device: the desktop and mobile make the request two different ways.

- [ ] `desktop` If you have a feed that needs a password — a Calibre server behind a login — add it with no username: **This source requires authentication. Set credentials for this source in Settings → Book sources.**, and under it **The source says: “…”** with the server's own sign-in message, where it sends one.

- [ ] `desktop` Set the username and a wrong password: **The source refused the username or password. Set them for this source in Settings → Book sources.**, with the same line under it. The debug log has one **GET** marked **(with credentials)** and **status 401**.

- [ ] `desktop` Set the right password: it opens, and search and a download both work, with every request to that host marked **(with credentials)** and neither value in the debug log.

- [ ] `once` Add `https://standardebooks.org/feeds/opds` as a feed, a source that wants only a username, and open it: **This source requires authentication.**, and under it **The source says: “Enter your Patrons Circle email address and leave the password empty.”** Set **Username** to any email address and leave **Password** empty: **The source refused the username or password.**, with the same line under it, unless the address belongs to a member. Delete the feed.

- [ ] `once` Set **Test feed**'s address to `https://me:secret@example.com/` and open it: the debug log's **GET** line shows `https://***@example.com/`, never the password.

---
## Signing in, per device

- [ ] `each` A feed's username and password stay on the device they were typed on: on another device, the same feed arrives with **Username** and **Password** empty, and opening it says **This source requires authentication.** with **The source says: “…”** under it. Enter them in its pencil: it opens, and a download works.

- [ ] `once` Delete **Test feed** with its trash: it asks **Delete source?**, saying **“Test feed” will be removed, along with its saved credentials.** Select **Delete**: it leaves the list, and on another device too.

---
## Clean up

- [ ] `once` Delete what this run downloaded from the downloads folder, and the title notes and covers made for them. Delete any feed this run added. Put **Book sources**, **Downloads folder**, the feed list and Gutenberg's **Language** back as you wrote them down, and turn off the **`sources`** pill.

---
## Done

Note each failure with the step, the device and what happened instead. Change a step here when the behavior it describes changes on purpose.
