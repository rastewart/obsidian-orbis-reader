# Book Sources

← [User Guide](README.md)

---

## Overview

Book sources connects Orbis Reader to online OPDS feeds. You can browse and search a feed, and download books into a folder in your vault.

Orbis Reader provides one feed, Project Gutenberg. You can add other feeds, such as Standard Ebooks if you are a member, or a Calibre server on your own computer or network.

---

## Enable book sources

Book sources is disabled until you enable it.

1. Go to **Settings → Orbis Reader → Book sources**.
2. Enable **Book sources**. The **Enable book sources** dialog opens.
3. In **Where should downloaded books go?**, select a folder. To make a new folder, select **+**.
4. Select **Enable**.

You can also start from **Settings → Orbis Reader → Setup**: next to **Book sources**, select **Set up**. The same dialog opens.

If you cancel the dialog, Book sources stays disabled. If a downloads folder is already set, the dialog does not open. This includes a folder set on another device. The **Setup** page shows Book sources as **Ready** only on a device where it is enabled.

You enable Book sources on each device. Your feeds, their settings and the downloads folder are shared when Orbis Reader configuration sharing is enabled. Usernames and passwords stay on the device where you enter them. See [Sync and Devices](sync-and-devices.md#settings-shared-between-devices).

---

## Open an OPDS feed

1. In the ribbon, select the **Browse book sources** button (cloud icon with a down arrow).
2. In the list of feeds, select a feed.

You can also run **Browse book sources** from the command palette.

The list shows the feeds that are enabled. Each row shows the feed's name and its address. If no feed is enabled, the dialog shows this message: *No sources are enabled. Add one in Settings → Book sources.*

---

## Browse a feed

1. To open a category, select a row with a **>** chevron.
2. To go back one step, select the back button (**←**). From the first page of a feed, the back button returns to the list of feeds.
3. If the feed has more than one page, select **Next page** or **Previous page** at the bottom.

While you browse, the dialog's title is the name of the page. The review and the report have the title **Downloads**.

For the rows and the bar on a feed page, see [What a feed page shows](#what-a-feed-page-shows). For links that a feed blocks, see [When a feed blocks a request](#when-a-feed-blocks-a-request).

---

## Search a feed

1. Open the feed.
2. In **Search this source**, enter a title, an author or a subject.
3. Select **Search**, or press Enter.

The results are a page like the other pages of the feed. You can go to the next page of results, and select books from them.

If the feed has no search that Orbis Reader can use, the dialog shows this message: *This source does not offer a search Orbis Reader can use.*

The Project Gutenberg feed is a search. To find books in it, search for a title or an author.

For the feed that Orbis Reader provides, see [The Project Gutenberg feed](#the-project-gutenberg-feed).

---

## Download books

1. Select a book's row. A **✓** shows on the row. The footer shows the number of books you selected, such as **3 selected**, and the folder they go to.
2. Optional: Select more books. You can go back, open other categories and search, and your selection stays.
3. Select **Download**. The review opens. It shows each book's format and size, and the downloads folder.
4. Optional: To remove a book from the list, select the remove button beside it.
5. Optional: To select more books, select **Keep browsing**. Your selection stays.
6. Select the button that shows the number of books, such as **Download 3**.

Selecting a book does not download it. The selection is cleared when you leave the feed, when a download finishes, and when you close the dialog. To clear the selection, select **Clear** beside **Download**.

In Project Gutenberg, each book has its own page. Open a book's page to select the book.

For the progress and the report, see [Downloads](#downloads). For how downloaded files are named and cataloged, see [Downloaded books](#downloaded-books).

---

## Stop a download

To stop the downloads, select **Stop**.

The download stops after the book that is downloading now. The report shows how many books were not downloaded. If you close the dialog, the download stops in the same way.

---

## What a feed page shows

A feed is a set of pages. A page shows categories, books, or both.

| Row | What selecting it does |
|---|---|
| A row with a **>** chevron | Opens that category, with one request to the feed |
| A row with a format and size under the title, such as *EPUB · 545 KB* | Selects the book for download. It does not download the book yet |
| A row with *Not a format Orbis Reader opens* | Does nothing. The entry has only files that Orbis Reader cannot open, such as a PDF or a protected format |

The bar above the list has these items:

- The back button (**←**). It goes back one step.
- The feed's name.
- The **↗** button, when the page has its own URL. See [When a feed blocks a request](#when-a-feed-blocks-a-request).

The first line of a row is the title. The second line shows one of these:

- The authors that the feed names, with the year if the feed gives one.
- If the feed names no author, the start of the book's description. Project Gutenberg puts the author in the description, so on Project Gutenberg this line shows the author. On a Calibre server, it shows the start of the description.
- For a book, the file format and its size, such as *EPUB (older E-readers) · 545 KB*.

Project Gutenberg publishes many books twice, with images and without images, with the same title. Use the format and the size to tell them apart.

---

## When a feed blocks a request

Some feeds block requests for OPDS pages, but show the same pages in a web browser. For example, the Project Gutenberg feed has *Authors* and *Subjects* links, but its server blocks them to protect against bots.

- Orbis Reader does not show links that a feed always blocks, such as these two Project Gutenberg links.
- If a page has its own URL, select the **↗** button. The page opens in your web browser.

Orbis Reader does not record failed requests. If you try again, Orbis Reader sends a new request.

---

## The Project Gutenberg feed

Project Gutenberg has tens of thousands of public-domain books. They are free and need no account. Search the feed for a title or an author. It does not have shelves to browse.

You cannot delete or rename the Project Gutenberg feed, or change its address. You can disable it, change its position in the list and set its language.

---

## Downloads

Orbis Reader downloads the books one at a time. The dialog shows the progress of each book. If one book fails, the other books still download.

A large book on a slow connection can take minutes. The limit for one book is ten minutes. After that, the report shows that Orbis Reader could not reach the source.

When the downloads finish, the dialog shows the **Downloads finished** report, with one line for each book:

| Line | What happened |
|---|---|
| **Saved to** *path* | The file is in your vault at that path |
| **Saved to** *path*, **and cataloged** | The file is in your vault, and Orbis Reader made a title note for it. This happens when Library dashboards is enabled |
| **Already in your vault:** *path* | A file with the same name is already in your downloads folder, so Orbis Reader did not download the book |
| **Not downloaded —** *reason* | The download failed. The reason shows which failure it was. See [Troubleshooting](#troubleshooting) |

To go back to the page you were on, select **Continue**. Downloaded books do not open. The report shows where each book is saved.

---

## Downloaded books

Orbis Reader names each file with the book's title, then its first author: `Sample Book - Jane Doe.epub`. The name comes from the feed's entry for the book, not from the download address.

The Project Gutenberg edition without images has `(no images)` in its name: `Moby Dick; Or, The Whale - Melville, Herman (no images).epub`. This lets you keep both editions in the same folder.

If a file with the same name is already in the downloads folder, Orbis Reader does not download the book again. The report shows where the book is in the vault.

Book sources does not need [Library Dashboards](library-dashboards.md). When Library dashboards is enabled, Orbis Reader catalogs each downloaded book in the same way as a book that you add yourself. The title note has the same properties, and a name that is already used is handled in the same way.

When **Save cover images** is enabled, the cover comes from the downloaded file. If the file has no cover, Orbis Reader uses the cover from the feed. If neither has a cover, Orbis Reader makes a cover.

Each download makes a new title note. If you download a book that you already have, you get a second title note. Use the catalog review to fix it. Orbis Reader writes no title note until you download a book.

---

## Add an OPDS feed

1. Go to **Settings → Orbis Reader → Book sources**.
2. Next to **OPDS feeds**, select **+**. The **Add a source** dialog opens.
3. In **Name**, enter a name for the feed.
4. In **OPDS address**, enter the URL of the feed.
5. If the feed needs a sign-in, enter the **Username** and the **Password**.
6. Select **Save**.

These are the fields of a feed:

| Field | Required | What it is |
|---|---|---|
| **Name** | Required | The name of the feed in the list |
| **OPDS address** | Required | The URL of the feed, starting with `http://` or `https://` |
| **Username** | Optional | The account name, for a feed that needs a sign-in. See [Usernames and passwords](#usernames-and-passwords) |
| **Password** | Optional | The password, for a feed that needs one. See [Usernames and passwords](#usernames-and-passwords) |

For a Calibre server, use the OPDS address that Calibre gives for its feed. It is usually your server's address with `/opds` at the end. A server on your own computer or your own network is allowed.

After you save a feed, its edit dialog also shows **Source ID**. You cannot change it. It identifies the feed's username and password in the Obsidian keychain, in the list titled **Secrets**.

---

## Add Standard Ebooks

Standard Ebooks publishes carefully typeset public-domain books. All of its OPDS feeds need a membership, so Orbis Reader does not provide it. If you are a member, you can add its feed.

To get access, see the Standard Ebooks [feeds page](https://standardebooks.org/feeds). Usually, you join the **Patrons Circle** with a gift on the [donation page](https://standardebooks.org/donate#patrons-circle). Access lasts for the period of the gift. People who produce an ebook for Standard Ebooks get access for life. The feeds page describes how corporate sponsors and open-source projects can request access.

When your membership is active:

1. Go to **Settings → Orbis Reader → Book sources**. Book sources must be enabled. See [Enable book sources](#enable-book-sources).
2. Next to **OPDS feeds**, select **+**. The **Add a source** dialog opens.
3. In **Name**, enter `Standard Ebooks`, or another name.
4. In **OPDS address**, enter `https://standardebooks.org/feeds/opds`.
5. In **Username**, enter the email address of your membership.
6. Leave **Password** empty. Standard Ebooks signs you in with your email address only.
7. Select **Save**.

To check the feed, open it from **Browse book sources**. If the dialog shows *The source refused the username or password*, check the email address. Below it, *The source says:* shows the message from Standard Ebooks. It requests your Patrons Circle email address and an empty password. You also see this message after your membership ends.

For how Orbis Reader stores the username, see [Usernames and passwords](#usernames-and-passwords).

---

## Add a username and password on your other devices

A username or password stays on the device where you entered it. When Orbis Reader configuration sharing is enabled, a feed arrives on your other devices without its username and password.

On each other device:

1. Go to **Settings → Orbis Reader → Book sources**.
2. In **OPDS feeds**, select the edit button (pencil icon) of the feed.
3. Enter the **Username**, and the **Password** if the feed needs one.
4. Select **Save**.

For how Orbis Reader stores the username and password, see [Usernames and passwords](#usernames-and-passwords).

---

## Change or remove a saved username or password

1. Go to **Settings → Orbis Reader → Book sources**.
2. In **OPDS feeds**, select the edit button (pencil icon) of the feed.
3. Do one of these:
   - To change the password, type the new password in **Password**.
   - To delete the password, select **Remove password**.
4. Select **Save**.

To keep the saved password, leave **Password** as it is. The field shows gray dots when a password is saved. Orbis Reader does not show a saved password again. The **Show the password** button works only after you type in the field, and shows only what you typed.

For how Orbis Reader stores the username and password, see [Usernames and passwords](#usernames-and-passwords).

---

## Manage your OPDS feeds

Your feeds are in **Settings → Orbis Reader → Book sources → OPDS feeds**. Each row shows the feed's name and address, a switch, an edit button and, for a feed that you can delete, a delete button.

- To disable a feed, disable its switch. A disabled feed is not in the list when you browse. Use this for a feed that you may use again.
- To edit a feed, select its edit button (pencil icon).
- To change the order of the feeds, select the up and down arrows, or drag the grip. The browse list shows the feeds in this order.
- To delete a feed, select its delete button (trash icon), then confirm. Its saved username and password are deleted with it.

When Orbis Reader configuration sharing is enabled, a deleted feed is also deleted on your other devices.

---

## Set the language for Project Gutenberg

Project Gutenberg has books in about seventy languages. For example, a search for *Finn* shows mostly Finnish books.

1. Go to **Settings → Orbis Reader → Book sources**.
2. In **OPDS feeds**, select the edit button (pencil icon) of **Project Gutenberg**.
3. In **Language**, select the language that you read.
4. Select **Save**.

Every request to the feed then requests only that language. This applies when you browse categories, search and download. The default is **Every language**.

Only Project Gutenberg feeds have **Language**: the feed that Orbis Reader provides, and a feed that you add with a `gutenberg.org` address, after you save it. The **Add a source** dialog does not show **Language**.

If another feed accepts a language in its URL, add the language to its **OPDS address**, such as `https://example.com/opds?lang=fr`. A search does not keep a language from the URL. **Next page** keeps it only when the feed's own links include it.

For what you can change in the Project Gutenberg feed, see [The Project Gutenberg feed](#the-project-gutenberg-feed).

---

## Usernames and passwords

Most feeds are public and need no username or password. If a feed needs a sign-in, enter its **Username**, its **Password**, or both.

- Orbis Reader stores the username and the password in the Obsidian keychain, not in the plugin's settings file. They are not synced with your vault, and they do not show in the debug log.
- So they stay on the device where you enter them. A Calibre server feed that you signed in to on your computer arrives on your phone without a username or password. See [Add a username and password on your other devices](#add-a-username-and-password-on-your-other-devices).
- A username without a password is allowed. Some feeds sign you in with an account name only. For example, Standard Ebooks uses your email address and an empty password.

If a sign-in fails, Orbis Reader shows its own message, then the server's message. The server's message often tells you what the server needs. These messages show when you browse, when you search, and on the line for a download in the report.

The debug log shows **(with credentials)** when a request includes a username and password. It never shows the username or the password. If an address contains a username and password, such as `https://me:secret@host/opds`, the debug log masks them.

---

## Requests to a feed

Orbis Reader sends a request to a feed only when you open a feed or a category, search, or download. It does not fetch pages before you open them, and it does not refresh a feed in the background. It downloads only the books that you select.

Orbis Reader sends a feed's username and password only to the address of that feed. It does not send them to another address that the feed links or redirects to.

---

## Disable book sources

1. Go to **Settings → Orbis Reader → Book sources**.
2. Disable **Book sources**.

The **Browse book sources** button in the ribbon and the **Browse book sources** command are removed, and the other settings on the page are hidden. Your feeds, usernames, passwords and downloads folder are kept. They show again when you enable Book sources.

---

## Options and settings

These settings are in **Settings → Orbis Reader → Book sources**.

| Setting | What it does |
|---|---|
| **Book sources** | Enables Book sources on this device. Opens the **Enable book sources** dialog if no downloads folder is set. When it is disabled, hides the settings below it, the ribbon button and the command. Disabled by default |
| **Downloads folder** | Sets the folder where downloaded books are saved |
| **OPDS feeds** | Lists your feeds. Lets you add, edit, reorder, enable, disable and delete feeds |

---

## Troubleshooting

Messages about a feed use the word "source".

| Message | What it means |
|---|---|
| *Could not reach the source. Check the address, and that the machine is awake.* | The feed did not respond. For a Calibre server, the computer may be asleep or off |
| *This source requires authentication.* | The feed needs a sign-in, and this device has no username or password for it. Some feeds need only a username. Enter them for the feed in **Settings → Orbis Reader → Book sources**. They are stored on each device, so you enter them again on each device |
| *The source refused the username or password.* | The sign-in failed. The username or password is wrong, or the account ended. Enter them again for the feed in **Settings → Orbis Reader → Book sources** |
| *The source refused that request.* | The feed blocked a request that had no username or password, usually to protect against bots. The **↗** button opens the page on the feed's website |
| *The source says there is nothing at that address.* | The address is wrong, or the feed removed that page |
| *The source answered with an error.* | The server failed, or it redirected the request more than three times. Try again later |
| *The source answered with something that is not an OPDS feed.* | The address responded, but not with an OPDS feed. Make sure that the address is the OPDS address, not the website's home page |
| *That looks like an OPDS 2.0 feed, which Orbis Reader cannot read yet.* | The feed uses OPDS 2.0. Orbis Reader reads OPDS 1.x. Most feeds also publish OPDS 1.x |
| *The source sent more than Orbis Reader will read in one go.* | The book is larger than 512 MB, or the feed page is larger than 8 MB. Usually, the address is not a book or not a feed |
| *Could not save the file in your vault.* | The book downloaded, but the file could not be saved. The downloads folder could not be made, or the disk is full. The reason shows after the message |
| *Not a format Orbis Reader opens* | The entry has only files that Orbis Reader cannot open. This shows on a row before you select it |
| *This source pointed to an address on your own network, so Orbis Reader did not follow it.* | A feed on the internet sent Orbis Reader to an address on your own network, and Orbis Reader stopped. This can come from a redirect, a link, a next page or a download address. For a feed that you host, set its OPDS address to the local address |

**The source says: "…"** under a message is the server's own sign-in message. It can be a sentence, such as the Standard Ebooks message, or only a name.

If a page shows *Nothing here*, the feed sent a page with no entries. Some categories are empty. If the feed sends a page that Orbis Reader cannot read, the dialog shows an error message instead.

If the **Browse book sources** button is not in the ribbon, Book sources is disabled on this device. Enable it on each device where you want it.

If there are no buttons down the side of the window at all, Obsidian's ribbon is hidden. Go to **Settings → Interface** and enable **Show ribbon**. If the ribbon shows but the button is still missing, right-click or long-press the ribbon and select **Browse book sources**.

---

## See also

- [Library Dashboards](library-dashboards.md): describes title notes and cataloging for downloaded books
- [Sync and Devices](sync-and-devices.md#settings-shared-between-devices): describes which settings are shared with your other devices
- [Format Support](format-support.md): describes the formats that Orbis Reader opens and downloads
- [Getting Started](getting-started.md): describes how to open a book
- [Settings Reference](settings-reference.md): lists every setting
