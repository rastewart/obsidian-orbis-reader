const en = {
  /**
   * ── Action words ────────────────────────────────────────────────────────────────────────────────────────────────
   *
   * **One word per action, everywhere.** A button that deletes says "Delete" whatever it is deleting: the dialog it
   * sits in already names the thing, and eight buttons that each phrase the same act slightly differently reads as
   * eight features rather than one vocabulary.
   *
   * Two keys holding the same word are free to drift, and a translator seeing many of them has to decide each time
   * whether this Delete differs from that one. Where a button genuinely needs to name its object — "Delete source",
   * "Deactivate instead" — it keeps a string of its own; this namespace is for the words that are the same act
   * wherever they appear.
   */
  'action.delete': 'Delete',
  'action.create_new_folder': 'Create new folder',
  // An export's second destination, at the start of its footer: the system save dialog on a computer, the share
  // sheet on a phone or tablet. Only one of the two is ever shown — see `outsideRoute`.
  'action.export': 'Export…',
  'action.share': 'Share…',
  'action.cancel': 'Cancel',
  'action.close': 'Close',
  'action.save': 'Save',
  'action.remove': 'Remove',
  'action.done': 'Done',
  'action.back': 'Back',
  'action.apply': 'Apply',
  'action.add': 'Add',
  'action.ok': 'OK',
  // Bulk selection, shared by every tickable list — see `pickListHeader`. In `action.` rather than owned by one
  // dialog, so every list gives the same answer to "tick everything".
  'action.select_all': 'Select all',
  'action.clear': 'Clear',
  // **Not "select the rest".** It swaps what is ticked for what is not, which is worth having once a scattered
  // selection exists and you realize you wanted its complement — a state you cannot reach by unticking, because
  // you would have to remember what you ticked.
  'action.invert': 'Invert',
  // A list's header: what it holds, and how much of it is chosen. `n of total` rather than a bare count, so
  // "nothing changed" and "one left" look different at a glance.
  'action.list_count': '{{label}} · {{n}} of {{total}}',
  'pane_menu.show_reading_data': 'Show reading data',
  'pane_menu.open_notes': 'Open notes',
  'pane_menu.generate_notes': 'Generate notes…',
  // **"Save as Markdown", not "Export to vault".** "Export to vault" says where the file goes and leaves what it is
  // to be guessed; every sibling in this menu names the artifact. "To vault" also distinguishes nothing — a PDF is
  // saved into the vault too.
  'pane_menu.save_as_markdown': 'Save as Markdown…',
  'pane_menu.reading_record': 'Reading record settings…',
  // The ⋯ menu's own wording for the two library dialogs: the trailing ellipsis is this menu's convention for an
  // item that opens one, which a palette command name does not carry.
  'pane_menu.set_reading_status': 'Set reading status…',
  'pane_menu.rate_book': 'Rate this book…',
  'pane_menu.manage_recordings': 'Manage recordings and mixes…',
  'loading_status.1_6_preparing': '1/6 preparing…',
  'loading_status.2_6_initializing': '2/6 initializing…',
  'loading_status.3_6_reading_file': '3/6 reading file…',
  'loading_status.4_6_reading_book': '4/6 reading book…',
  'loading_status.5_6_starting_reader': '5/6 starting reader…',
  'loading_status.6_6_opening_book': '6/6 opening book…',
  'loading_status.restoring_position': 'Restoring position…',
  'loading_status.loading_content': 'Loading content…',
  'loading_status.error_msg': 'Error: {{msg}}',
  'toolbar.navigator': 'Navigator',
  'toolbar.search_in_book': 'Search in book',
  'toolbar.bookmark_this_location': 'Bookmark this location',
  'toolbar.remove_bookmark': 'Remove bookmark',
  'toolbar.brightness': 'Brightness',
  'toolbar.font_size': 'Font size',
  'toolbar.toggle_note_icons': 'Toggle note icons',
  'toolbar.loading': 'Loading…',
  // ── "select", never "tap" or "click" ────────────────────────────────────────
  //
  // **A gesture named for one device tells the other half of the readers nothing.** Every surface these strings
  // sit on exists on desktop AND mobile — the toolbar readout, the listening bar, the library's sort header,
  // settings descriptions. `pnpm lint:vocab` enforces it.
  //
  // Where a key names the gesture too, it says "select" like its value.
  'toolbar.select_to_cycle_progress_mode': 'Select to cycle progress mode',
  'toolbar.focus_mode': 'Focus mode',
  'toolbar.read_aloud': 'Listen',
  'tts.play': 'Play',
  'tts.pause': 'Pause',
  'tts.speed': 'Speed',
  'tts.close': 'Close listen',
  // The chip's accessible name. It carries the REASON sentence because the chip's glyph carries live-or-recorded,
  // and a shape says nothing to a screen reader. "Source" is labeled rather than joined with "from": the name is
  // sometimes what you are hearing and sometimes what you are NOT hearing (a coverage gap), and the reason line
  // immediately after says which.
  'tts.voice_chip': 'Voice: {{voice}}. Speed: {{speed}}. {{reason}} Select to change.',
  'tts.voice_chip_source': 'Voice: {{voice}}. Source: {{source}}. Speed: {{speed}}. {{reason}} Select to change.',
  // What the chip reads before the first voice resolves. Its own key rather than the popup's title, so the dialog's
  // name and the chip text are not tied together.
  'tts.voice_chip_placeholder': 'Voice',
  // Shown on the chip in place of a voice name when this device has none it can speak with — see
  // `canSpeakNow`. Not the recommended voice's name, which would be false on every fresh install.
  // A voice that would not download — the first-listen prompt and the voice picker both say it.
  'tts.voice_download_failed': 'Download failed. Check your connection and try again.',
  'tts.no_voice': 'No voice',
  'tts.voice_chip_missing': 'No voice on this device yet. Select to choose one.',
  'tts.engine_system_voice': 'System voice',
  'tts.show_player': 'Show player',
  'tts.show_text': 'Show text',
  // The scrub bar's accessible name. It is a `div` with a `slider` role rather than a range input — see
  // `wireProgressScrub` — so nothing labels it but this.
  /**
   * **The unit the player plays is a TRACK, not a chapter**, and these strings say so.
   *
   * Usually they are the same thing and nobody notices. They come apart twice: `splitLongParts` divides a chapter
   * over `LONG_MINUTES` (60) into slices of 20–30 minutes, and a book whose contents name one entry or none has no
   * chapters to divide by at all, so the whole text arrives in one piece. In
   * both cases ⏮/⏭, the label over the transport, the scrubber and the recordings list are counting parts.
   *
   * The keys say "track" like the values, so neither half can drift: `tts.previous_track`,
   * `recordings_modal.no_text_tracks`, `voice_and_source.reason_track_unrecorded` and the rest.
   *
   * Two neighbors keep `chapter` on purpose. Notes export really does write chapters
   * (`notices.wrote_n_chapter_notes_and_contents`), and the reader's own **Next chapter** / **Previous chapter**
   * commands move through the BOOK rather than through audio.
   */
  'tts.scrub_label': 'Position in track',
  'tts.skip_back': 'Back {{n}} seconds',
  'tts.skip_forward': 'Forward {{n}} seconds',
  'tts.previous_track': 'Previous track',
  'tts.next_track': 'Next track',
  'tts.loading_track': 'Loading track…',
  // Named for the annotation-preset role it applies: it marks the passage being read. "Highlight" would say
  // nothing about the passage or the mark it uses.
  'tts.highlight': 'Mark the passage',
  'tts.add_note': 'Add note…',
  'tts.bookmark': 'Bookmark',
  'tts.bookmark_added': 'Bookmark added',
  'tts.bookmark_removed': 'Bookmark removed',
  'tts.paused_notice': 'Listening paused',
  'tts.controls_locked': 'Controls locked',
  'tts.lock_the_controls': 'Lock the controls',
  'tts.drag_to_unlock': 'Slide the lock up to unlock',
  'tts.book_left': '~{{time}} left',
  'toolbar.exit_focus_mode': 'Exit focus mode',
  'toolbar.annotation_presets': 'Annotation marks',
  'toolbar.display_style': 'Display style',
  'display_menu.display_style_options': 'Display style options',
  // The tab in the display style bar, beside Layout, Font and Spacing. One word, because "Reader theme" does not
  // fit the tab row on an Android phone. The dropdown inside the tab, and the settings row, say Reader theme.
  'display_menu.theme': 'Theme',
  'display_menu.reader_theme': 'Reader theme',
  'display_menu.layout': 'Layout',
  'display_menu.font': 'Font',
  'display_menu.spacing': 'Spacing',
  'display_menu.mode': 'Mode',
  'display_menu.reading_mode': 'Reading mode',
  'display_menu.paged_mode': 'Paged mode',
  'display_menu.scrolled_mode': 'Scrolled mode',
  'display_menu.size': 'Size',
  'display_menu.font_size': 'Font size',
  'display_menu.margins': 'Margins',
  'display_menu.text_margins': 'Text margins',
  'display_menu.line_spacing': 'Line spacing',
  // The display toolbar's alignment row — its options are Settings' own three (`appearance_page.text_align_*`).
  'display_menu.alignment': 'Alignment',
  // Its options are Settings' own three (`appearance_page.hyphenation_*`).
  'display_menu.hyphenation': 'Hyphenation',
  // On, marked where `autoHyphenates` finds it can do nothing here. The select's tooltip explains the asterisk.
  'display_menu.hyphenation_on_unsupported': 'On *',
  'display_menu.two_column_layout': 'Two-column layout',
  // The Spacing tab's button to its second page — short, since it shares the first row with the controls when they
  // stack — and the names a screen reader gives the button on each page. On the second page it shows `action.back`.
  'display_menu.more': 'More',
  'display_menu.more_spacing': 'More spacing settings',
  'display_menu.back_to_spacing': 'Back to spacing',
  'standalone_search_bar.search': 'Search…',
  'standalone_search_bar.previous_result': 'Previous result',
  'standalone_search_bar.next_result': 'Next result',
  'standalone_search_bar.close_search': 'Close search',
  'navigator.tabs': 'Navigator',
  'tab_tooltips.table_of_contents': 'Table of contents',
  'tab_tooltips.search': 'Search',
  'tab_tooltips.annotations_bookmarks_selections_notes': 'Annotations — bookmarks, passage selections and notes',
  /**
   * **"Linked vault notes", not "Backlinks" and not "Linked notes".**
   *
   * The data view lists these three rows below its own *Notes* section, so "Linked notes" would put two senses of
   * the word within three rows of each other — annotations inside the book, and Markdown files out in the vault.
   * `orbis.desc` settles that distinction already: *a note inside a book and a note in the vault are different
   * things*. `vault` is the boundary word the rest of the plugin uses for it (Export to vault, What gets added to
   * the vault, Scanning vault…), so it is the one to reuse.
   *
   * Not "Obsidian notes": the reader is inside Obsidian, so that names a distinction nobody is in doubt about,
   * while saying nothing about the one they are.
   *
   * And one name across both surfaces — this panel and the data view show the identical `scanBacklinks` result.
   * Not *Backlinks*: Obsidian's own term, but jargon, and it leaves the collision above unsolved on the page that
   * actually has it.
   */
  'tab_tooltips.backlinks': 'Linked vault notes — notes that reference this book',
  'tab_tooltips.reading_stats': 'Reading stats',
  'contents_tab.no_table_of_contents': 'No table of contents',
  'search_tab.searching': 'Searching…',
  'search_tab.no_results_found': 'No results found',
  'search_tab.searching_for_more': 'Searching for more…',
  'search_tab.advanced': 'Advanced search',
  'search_tab.advanced_title': 'Advanced search',
  'search_tab.scope_heading': 'Search in',
  'search_tab.scope_book': 'Book text',
  'search_tab.scope_passages': 'Passage selections',
  'search_tab.scope_note_anchors': 'Note selections',
  'search_tab.scope_note_content': 'Note text',
  'search_tab.scope_min_one': 'At least one place to search must stay on.',
  'search_tab.mark_heading': 'Filter by mark',
  'search_tab.mark_any': 'Any mark.',
  'search_tab.select_marks': 'Select marks',
  'search_tab.mark_usage': '{{count}} saved',
  'search_tab.remove_mark': 'Remove {{name}} from the filter',
  'search_tab.no_marks_in_book': 'Nothing saved in this book carries a mark yet.',
  'search_tab.match_heading': 'Match',
  'search_tab.match_case': 'Match case',
  'search_tab.whole_word': 'Whole word',
  'search_tab.kind_book': 'Book text',
  'search_tab.kind_passage': 'Passage selection',
  'search_tab.kind_note': 'Note selection',
  'search_tab.kind_note_text': 'Note text',
  'annotations_tab.bookmarks': 'Bookmarks',
  'annotations_tab.passage_selections': 'Passage selections',
  'annotations_tab.notes': 'Notes',
  'annotations_tab.none_yet': 'None yet',
  'annotations_tab.loc_n': 'loc. {{n}}',
  'stats_tab.reading_speed': 'Reading speed',
  'stats_tab.estimated_reading_speed': 'Estimated reading speed',
  'stats_tab.n_wpm': '{{n}} wpm',
  'stats_tab.n_samples': '({{n}} samples)',
  'stats_tab.speed': 'Speed',
  'stats_tab.gathering_data': 'Gathering data…',
  'stats_tab.n_n_samples': '({{current}} / {{total}} samples)',
  'stats_tab.time_remaining': 'Time remaining',
  'stats_tab.this_book': 'This book',
  'stats_tab.this_chapter': 'This chapter',
  'stats_tab.progress': 'Progress',
  'stats_tab.book': 'Book',
  'stats_tab.location': 'Location',
  'stats_tab.n_of_n': '{{current}} of {{total}}',
  'stats_tab.chapter': 'Chapter',
  'stats_tab.chapter_location': 'Chapter location',
  'stats_tab.word_counts': 'Word counts',
  'stats_tab.book_total': 'Book total',
  'stats_tab.book_remaining': 'Book remaining',
  'backlinks_tab.scanning_vault': 'Scanning vault…',
  // "vault notes", matching the heading above it — see `tab_tooltips.backlinks`. Plain "notes" in the empty state
  // would be the very word the heading's name exists to disambiguate.
  'backlinks_tab.no_notes_link_to_this_book_yet': 'No vault notes link to this book yet',
  'note_editor_popup.add_note': 'Add note',
  'note_editor_popup.edit_note': 'Edit note',
  'note_editor_popup.add_a_note': 'Add a note…',
  // The note editor's ×-swatch has no string of its own: it shares `presets.no_mark` with the Saved panel's
  // swatch — one state, one word. See `AnnotationController`.
  'note_view.title': 'Note',
  'note_view.empty': '(no note text)',
  'note_view.edit': 'Edit',
  'note_view.copy_link': 'Copy link',
  'note_view.delete_confirm': 'Delete this note? This cannot be undone.',
  'note_view.delete_confirm_title': 'Delete note',
  'annotation_picker.add_note': 'Add note',
  'annotation_picker.look_up': 'Look up',
  'annotation_picker.copy_link_to_selection': 'Copy link to selection',
  'annotation_picker.copy_text': 'Copy text',
  'annotation_picker.remove_highlight': 'Remove passage selection',
  // The mark bar: you pick a MEANING, not a color swatch, and the chip shows the mark's
  // color and treatment together, because two marks can share a color and differ only by shape.
  'annotation_picker.mark': 'Mark',
  // Two letters wearing the treatment, inside a 44px chip. Not translated as prose — it stands in for
  // text, so any short pair of letters in the locale's script works.
  'annotation_picker.mark_sample': 'Aa',
  // Always on the bar, not only when marks overflow it — it is also the way to the manager. So the label
  // has to be true at any count: "More marks…" would be false with five.
  'annotation_picker.all_marks': 'All marks',
  'annotation_picker.marks_title': 'Marks',
  // Names what the dialog is called: it opens the dialog titled Marks. Not "Manage annotations": "annotations" is
  // the name of a settings category holding four other things.
  'annotation_picker.manage_marks': 'Manage marks',
  // The quick picker for a book's two role marks — the full-screen player's Aa button and a palette command.
  'mark_roles.title': 'Marks for listening and notes',
  'mark_roles.intro': 'Select which mark is used for:',
  // Not "Mark the passage" (the player button's name, and the Edit mark dialog's): under "Select which mark is used
  // for:" the two rows read as the things a mark is used for — passage selections, notes.
  'mark_roles.passage': 'Passage selections',
  'mark_roles.no_marks': 'This book has no marks to choose from. Add or turn one on in Manage marks.',
  // Shown when an annotation resolves to no mark: made before presets, its mark deleted, or its color now
  // shared by two marks — in which case which one it meant is genuinely unknown, so it is not guessed.
  // "Library dashboards", not "Library": dashboards are what the feature is for, and the title notes and covers on
  // that page exist to feed them. The switch on the page is "Enable the library" — it enables the whole feature,
  // not only the dashboards.
  'settings_pages.library': 'Library dashboards',
  // **The subject, not the mechanism.** This page is about how books look — font, size, spacing, margins, theme,
  // brightness — and a "display style" is only the way a set of those is saved and switched. Naming the page after the
  // mechanism would bury what it is for. "Appearance" is also the word Obsidian trains readers on (its own page is
  // Appearance), so the kind of page is legible before a word of it is read; and it leaves "display style" free to
  // mean the saved set, which is what the reader's toolbar menu and the palette command already call it.
  // "Appearance", not "Book appearance": the toolbar page lives here, and the toolbar is not part of the book.
  // The only title in this list that would otherwise need an "and" — a sign of two ideas rather than one.
  'settings_pages.display_styles': 'Appearance',
  // **"Reading behavior", not "Annotations and reading behavior".** Annotations have a category of their own, so
  // this page holds a single idea; a bare "Reading" would be the vaguer of it and Appearance — it would catch
  // readers who came looking for fonts.
  'settings_pages.reading': 'Reading behavior',
  // **An annotation is everything a reader ADDS to a book** — a passage selection with marks, a note with or without
  // one, a bookmark. Naming that is what makes this page legible as a shelf rather than a category: it answers "what
  // do I do with what I wrote", which "Export" or "Reading records" would not. The content sense of the word is why
  // the marks manager's dialog is titled Marks — see `presets.*`.
  'settings_pages.annotations': 'Annotations',
  // **"Conversions", not "Export".** Direction-neutral, which "export" could not be: notes → EPUB runs the opposite
  // way from book → PDF, and calling both an export would stop the page reading as one idea.
  'settings_pages.conversions': 'Conversions',
  // Both pages carry the same closing sentence, because both are answered again in a dialog. Once for the page
  // rather than a clause on every row: one fact about the page, repeated on each row, stops being read.
  'annotations_pdf_page.desc': 'Default settings used when saving your marks and notes as a PDF.',
  'save_as_pdf_page.desc': 'Default settings used when converting books into PDFs.',
  // "Obsidian notes", matching Save as Markdown two rows above and the category line itself. The argument is at
  // `settings_pages.conversions_desc`; it is a decision, not an oversight, so do not "fix" it to "vault notes".
  'save_as_epub_page.desc': 'Default settings used when converting Obsidian notes or folders into EPUBs.',
  /**
   * *Read in Orbis Reader*'s own page, under Reading behavior.
   *
   * Where the book goes and what it is called are absent from this page on purpose: they are mechanism rather than
   * preference — the book sits beside its note and takes its name, so that the command can find it again on every
   * invocation.
   *
   * **No pointer at Save as EPUB.** The two pages are not adjacent, so the sentence would answer a question nobody
   * on this page is asking.
   */
  'read_in_orbis_page.desc': 'How a book opens when using Read in Orbis Reader.',
  /**
   * The base pair, governing **every** open there is — a click in the file explorer, a Library row, a link, a
   * workspace restoring three books at startup. Its own heading above the *Read in Orbis Reader* entry, because
   * the same two questions are asked twice on this page and only the heading says which is which.
   */
  'reading_page.open_heading': 'Opening a book',
  'reading_page.open_mode': 'How the book opens',
  'reading_page.open_mode_desc': 'Which reading mode a book starts in.',
  'reading_page.open_bar': 'Open with',
  'reading_page.open_bar_desc': 'Which bar opens under the toolbar.',
  /**
   * **One switch instead of a third option on each dropdown.** Overriding the mode while following the bar is a
   * half-state that is hard to read and that nobody has wanted, so this is one decision rather than two.
   *
   * **Phrased so that turning it ON reveals the rows below it**, like every other toggle in these settings, where
   * turning something on is what makes more appear.
   *
   * **And the description says what the toggle DOES**, like every other one here — "Pulse the passage…", "Ask for
   * confirmation…". It does not narrate both states (*Off, a note opens… On, choose…*), a shape no other row on
   * the page uses; a toggle's two states are legible from the toggle.
   *
   * **"Change", which is already Orbis's verb for departing from a current value** — *Change preset*, *Change
   * voice*, *Change how books look*. It also carries the meaning where *Set* would not: off, this command follows
   * the settings above, so there is something to change FROM.
   *
   * **"a different", not "rather than the ones above".** The positional version would be false — the settings it
   * means are on the PARENT page, and on this one the toggle is the first row with nothing above it at all.
   *
   * **The name repeats the command although the page is already called that.** It is the only thing that
   * distinguishes this row from the base *How the book opens* in settings SEARCH, which shows names with no page
   * around them. Search is where it earns its length; on the page the repetition costs nothing.
   */
  'read_in_orbis_page.own': 'Change how the book opens when using Read in Orbis Reader',
  'read_in_orbis_page.own_desc': 'Choose a different reading mode and bar.',
  'read_in_orbis_page.opens': 'How the book opens',
  // **"starts in", not "opens with".** *Open with* is the name of the row directly below this one, so that phrase
  // here would read as though this description belonged to that setting. The row that owns the words keeps them.
  'read_in_orbis_page.opens_desc': 'Which reading mode the book starts in.',
  'read_in_orbis_page.opens_standard': 'Standard mode',
  'read_in_orbis_page.opens_focus': 'Focus mode',
  'read_in_orbis_page.opens_listen': 'Full-screen audio player',
  /**
   * **"Open with", not "toolbar".** The toolbar is the row of icons at the top of the reader; this chooses which
   * SECONDARY bar opens. Borrowing the toolbar's name for something else is how a vocabulary stops being
   * teachable.
   */
  'read_in_orbis_page.bar': 'Open with',
  'read_in_orbis_page.bar_desc': 'Which bar opens under the toolbar.',
  'read_in_orbis_page.bar_listen': 'Listening bar',
  'read_in_orbis_page.bar_search': 'Search bar',
  /**
   * **"No bar", not "Nothing" and not "No secondary bar".** *Open with → Nothing* reads as a shrug rather than an
   * answer. *Secondary* is the word the design uses for what this chooses, but the interface never says it —
   * the other two options are *Listening bar* and *Search bar* — so using it here would teach a term for one
   * option in a list of three. All three ending in "bar" is what makes the list read as one question.
   */
  'read_in_orbis_page.bar_none': 'No bar',
  'read_in_orbis_page.type': 'Type',
  // Only shown when the library is on — there is no title note without one. Same gate as `save_as_epub_page.default_type`.
  'read_in_orbis_page.type_desc': 'Written to the title note for books created this way, for library categorization.',
  // One line per entry on the settings start page: what you would find in there, so the index reads as a map
  // rather than a list of doors. Searched as well as shown.
  // Says what dashboards are FOR. "Whether or not the book is in the vault" is true, and the wrong altitude for a
  // signpost read once: that is a nuance you want after the feature is on and a title with no file still appears,
  // so it belongs in the guide.
  'settings_pages.library_desc': 'Build dashboards to browse, group and summarize your books.',
  'settings_pages.display_styles_desc': 'Change how books look and adjust the reader toolbar.',
  // No mention of annotation presets: the marks manager lives under Annotations, and a signpost naming a row that
  // is not on the page is worse than no signpost.
  'settings_pages.reading_desc': 'Adjust how the reader behaves while you read.',
  'settings_pages.annotations_desc':
    'Manage annotation marks, reading records, and how annotations are saved as Markdown or PDF.',
  // **"text-to-speech" says how the voice is produced, and is the house spelling.** Without it, "read aloud" invites
  // the reading this product must never invite: narrated audiobooks. Three words foreclose it. No "live or
  // recorded" here — the page itself opens with that choice, and it means nothing until you know the feature exists.
  'settings_pages.listening_desc': 'Listen to books read aloud by text-to-speech.',
  'settings_pages.lookup_desc': 'Look words up without leaving the book.',
  // Says only what is on this page: extracting marks and notes belongs to Annotations.
  //
  // ── "Obsidian notes" is this branch's word, top to bottom ────────────────────
  //
  // **One word per branch, not a rule about when to switch.** This line and both of its pages that mention notes
  // say the same thing, so a reader moving from the category into a page never sees the word change under them for
  // no visible reason.
  //
  // **This does not overturn `tab_tooltips.backlinks`**, which prefers `vault` as the boundary word and argues that
  // "Obsidian notes" names a distinction nobody is in doubt about. That ruling is for where the two senses of
  // "note" are genuinely adjacent — the data view lists linked vault files three rows under a section of
  // annotations, and there the reader really can take one for the other. Here the question a reader is holding is
  // which FORMAT, not which kind of note, and "convert" has already framed it as files. The collision that ruling
  // guards against is weak enough at this distance to be worth trading for one consistent word.
  'settings_pages.conversions_desc': 'Convert books and Obsidian notes into other formats.',
  /**
   * **Says a sync tool is needed, where the reader decides whether to open the page.** Orbis does not sync
   * anything; it writes to the vault and something else moves the vault. The page repeats it, deliberately —
   * this is the one claim worth making twice, and the list is where the question first occurs to anyone.
   *
   * No product named: "such as Obsidian Sync" would read as a recommendation for a paid one and name a tool most
   * readers here are not using. And "Orbis data", not "configuration": this page governs reading position too.
   */
  'settings_pages.devices_desc':
    'Enable Orbis Reader configuration sharing in the vault so a sync tool can share it with your other devices.',
  'settings_pages.toolbar_desc': "Choose which buttons appear on the reader's toolbar.",
  /**
   * **"Setup", not "Getting started".** The page has two jobs and only one is onboarding: the other happens a year
   * in, when a reader decides to try Listening and wants to know what turning it on involves. "Getting started" says
   * *this was for when you were new*, which is the wrong shelf for that second visit.
   */
  'settings_pages.setup': 'Setup',
  /**
   * **Says what the page contains, in the same register as the eight lines below it.** Not "Turn on as much or as
   * little of Orbis as you want" — the posture rather than the contents, and an index line's job is the contents.
   * "Tailor" is also a verb no other entry uses, which is the rule this list follows.
   *
   * The Setup page shows this same line above its tasks, word for word, so a reader recognizes the sentence they
   * just selected. "The capabilities you want to use" is what says the list is a choice; there is no separate line
   * saying none of the tasks is required.
   *
   * Not "the plug-in": no other user-facing string calls it that, Obsidian writes "plugin" unhyphenated, and the
   * product has a name.
   */
  'settings_pages.setup_desc': 'Tailor Orbis Reader by enabling the capabilities you want to use.',
  'setup.progress': '{{done}} of {{total}}',
  /**
   * **The Appearance section of Setup, which is not a task and is never counted.**
   *
   * Adjusting the text is the thing a reader is most likely to want from settings, and it cannot be "not done" —
   * being outside the "N of {{total}}" count is exactly what lets it hold the top of the page honestly.
   *
   * The line under the heading does the two things the rows cannot do for themselves: name the style they are
   * editing, because all three write into the SELECTED one and a control that edits something unnamed is a trap
   * for anyone keeping more than one style; and name the button in the book, because that is where a reader reaches
   * for this mid-chapter, and the in-book display menu exists only inside an open book — settings cannot open it.
   */
  /**
   * **Two openers, because a device with no name has no name to quote.** Interpolating the style's label is right
   * for a shared style — “Bedtime” — and wrong for this device's own, whose label is the phrase "This device".
   * Quoting that would produce *the “This device” display style*: quotation marks around a description rather than
   * around a name, in the state every new reader is in.
   */
  // "These controls", not "These": a bare demonstrative has no antecedent here — the rows it refers to are below
  // the sentence, not above it, so the reader has to infer what "these" are before the sentence can mean anything.
  'setup.appearance_style_here': "These controls change this device's display style.",
  'setup.appearance_style_named': 'These controls change the “{{style}}” display style.',
  /**
   * The shared half, naming the two other places these controls live.
   *
   * **Named rather than linked, because neither can be linked to.** There is no navigation API for a settings page
   * (see docs/design/settings.md, spike 1), and the in-book display menu is built from the reader's own chrome, so
   * it exists only inside an open book. Naming Appearance is also what makes the short list here safe: the font
   * dropdown is not in this section, and this is the sentence that says where it is.
   */
  'setup.appearance_elsewhere':
    "For the rest, see Appearance in settings or the display style button on the reader's toolbar while you are reading.",
  /**
   * The one dialog a new reader meets. Two sentences and two buttons, not a checklist: a list of seven controls in a
   * modal is a second implementation of a page that is already better at being that list.
   *
   * **Grouped by what the reader DOES, not by feature** — consume, then produce. Reading and listening share the
   * first sentence as alternatives rather than listening arriving mid-list, for the reason the settings map already
   * gives: they are the two modes of consuming a book, not a main one and an extra.
   *
   * **No format list.** Naming EPUB and MOBI invites a list that is either incomplete or stale; "several formats"
   * is honest about EPUB, MOBI, AZW3, FB2 and CBZ together.
   *
   * **"annotations", not "notes", in the second half.** A note inside a book and a note in the vault are different
   * things, and "save your notes as Obsidian notes" would put both senses in adjacent clauses — in the dialog where a
   * reader learns which word means what. `annotations` is the plugin's own collective for what you have made.
   * "marks and notes" in that order because that is the order you make them: the mark is the highlight, the note is
   * what you attach to it.
   *
   * **One "as", and "a PDF" stays singular.** The two objects share the preposition, so repeating it adds nothing.
   * The mixed number is deliberate, though: reading records writes MANY notes — one per selection, note and
   * bookmark — while Save as PDF writes ONE file. "or PDFs" would read as parallel and quietly promise a set of
   * documents where there is a single collected one, which is the whole difference between the two exports.
   *
   * **It says where Setup is, even though the button goes there.** Deliberate redundancy: after "Got it" that
   * sentence is the only thing that tells the reader where to look.
   *
   * "None of it is required" is on the Setup page, above the list, not here — it is a reassurance in a different
   * register from two descriptive sentences, and it belongs where a reader is actually looking at seven unfinished
   * items.
   */
  'first_run.title': 'Welcome to Orbis Reader',
  // Both sentences in ONE string, because `ConfirmModal` draws a paragraph per line and these are one paragraph:
  // consume, then produce. Only "to get started" stands apart, being an instruction rather than a description.
  'first_run.body_what':
    'Read books in several formats inside your vault, or listen to them read aloud with text-to-speech. Add your own marks and notes to the text, then save your annotations as Obsidian notes or a PDF.',
  'first_run.body_start': 'To get started, visit Setup in Orbis Reader settings.',
  'first_run.open': 'Open setup',
  /**
   * **"Got it", because this dialog has no later.**
   *
   * Not "Not now", which is an answer about TIMING — *not now* carries an implicit *ask me again*, the way it does
   * on the multi-device offer two dialogs over, where it genuinely does return next session. This one is shown once
   * per device and never comes back, so the same words would be a small promise the plugin does not keep.
   *
   * Not "No thanks" either, though it would fix the same problem: this dialog is mostly something a reader is TOLD,
   * and "got it" is exactly true of what happened. Declining reads as refusing the plugin rather than the trip to
   * Setup — which they have not refused, since the sentence above just told them where it lives.
   *
   * So the way out of a dialog has three words, and the difference is what the dialog IS: `Cancel` abandons
   * something started, `Not now` declines an offer that will return, `Got it` acknowledges something said.
   */
  'first_run.close': 'Got it',
  // While the three questions that ask the filesystem are still out. Not "Loading": nothing is being fetched, and a
  // row that says so on a slow phone reads as something having gone wrong.
  'setup.checking': 'Checking…',
  'setup.action_set_up': 'Set up',
  'setup.action_download': 'Download',
  // A tick beside the answer, not a second sentence: the row already says what the feature does, and "Done" under
  // every finished item is six lines of the same word.
  'setup.done': 'Ready',
  /**
   * **Each name is the capability's own name, spelled as its settings page spells it.** Not a description —
   * "Books to read" for Book sources, "Word look-up" for Look-up, "More than one device" for Devices — which reads
   * well and teaches a reader a second name for something they will later have to find under the first. A
   * checklist that renames the features it turns on is a checklist that makes the settings tree harder to navigate.
   *
   * **And each line says what the button does, not what the capability is for.** "Browse free catalogs" is not what
   * pressing Set up does; it is what becomes possible afterwards. The row that asks for a decision has to say what
   * the decision is — a folder, a download and its size, a question about this device — because that is what the
   * reader is being asked to agree to. What the feature is then good for is the page's job, and the guide's.
   *
   * **Four of them TURN THE CAPABILITY ON**, and these lines must not hide that. "Choose where title notes
   * are written" is the sentence for a folder-picker; what the button actually does is set `libraryEnabled`, and
   * three of its neighbors are the same — `bookSourcesEnabled`, `recordsMode: 'on'`, `multiDeviceEnabled`. A row
   * that describes a switch as a destination understates what pressing it costs, which is the one thing a
   * consent-and-destination dialog exists to avoid saying quietly.
   *
   * **All three downloads say their size, and none of the numbers live here** — `voice.sizeMB`,
   * `FONT_DOWNLOAD_MB` and `DICTIONARY_DOWNLOAD_MB`, in parentheses at the end of the line, the same place in each.
   * A number typed into a sentence is a number that goes stale the first time the asset changes; a number read
   * from beside the thing being fetched goes stale in one place, where whoever changed it is already looking.
   */
  'setup.book_name': 'Book sources',
  // **No "via OPDS feeds".** It would be the only jargon in the seven rows: meaningless to a new reader, and a real
  // signal only to someone who already has a Calibre server — who will find the word on the Book sources page
  // anyway. "Project Gutenberg" is the half that earns its place, because it tells a reader what they are being
  // offered in a name they already know.
  'setup.book_desc':
    'Enable Orbis Reader to download books from online sources including Project Gutenberg and pick a folder where they are saved.',
  'setup.lookup_name': 'Look-up',
  'setup.lookup_desc': 'Download offline dictionaries used to look up words while you are reading (about {{size}} MB).',
  'setup.library_name': 'Library dashboards',
  /**
   * The same words the settings entry uses for the same feature, so a reader recognizes it where they land.
   *
   * **The cost is NOT stated here, and that is a decision.** "— one note per title, in a folder you choose" fails
   * as a trailing fragment: "one note per title" assumes you already know the library catalogs titles, and a dash
   * cannot establish that. Nor a second sentence: `LibrarySetupModal` asks for the folder and says covers are
   * saved beside the notes, so the reader learns before anything is written — one tap later than here, and in the
   * dialog where the consent is actually given.
   */
  'setup.library_desc': 'Enable library dashboards to browse, group and summarize your books.',
  'setup.records_name': 'Reading records',
  // "using", not "in": a base is a VIEW OVER notes, not a place notes live, and "browse them in Obsidian bases"
  // quietly misdescribes what a base is.
  'setup.records_desc':
    'Create a note for each annotation, in a folder you choose, and browse them using Obsidian bases.',
  'setup.listening_name': 'Listening',
  /**
   * **Choosing, not downloading**, because the button opens the voice picker.
   *
   * A button that fetched the recommended voice would be the whole of the interaction: no list, no preview, no
   * choice, and no reason for a reader to care which voice they ended up with. The picker gives all three, and the
   * size belongs in it — per voice, beside the voice — rather than in a sentence quoting whichever one happens to
   * be recommended.
   *
   * No mention of system voices, though `voiceReady` counts one: on a device that has them the picker offers them
   * as its second source, so the row does not have to. What it says here is the point of the item, which is that
   * you choose the voice your books are read in.
   */
  'setup.listening_desc': 'Preview and select the on-device voice used for reading books aloud with text-to-speech.',
  // The dialog the row opens — the same picker the Listening page shows, in a window of its own.
  'setup.listening_pick_title': 'Choose a voice',
  'setup.action_choose': 'Choose',
  // **"Expanded PDF character set", not "Save as PDF".** The task is one download, and "Save as PDF" names one of the
  // two commands that use it — so as a task name it would point at half of what it is for. Naming the thing being
  // downloaded is also the honest shape for a setup row: the commands work without it, this makes them print
  // more characters. "PDF" stays in it here, where the other tasks have nothing to do with PDFs; on the Save as PDF
  // page the same download is the **Expanded character set**.
  'setup.pdf_name': 'Expanded PDF character set',
  /**
   * **Not "the fonts it needs to look right".** A PDF draws about 220 characters without them; this adds the rest.
   * Saying a feature is broken until you download something turns an optional extra into a chore.
   *
   * **What it says instead is that Orbis GENERATES the PDF.** Otherwise the line reads as though the PDFs already
   * exist and merely display badly — the reader's own files, somehow at fault. The failure is ours and it happens
   * at generation: a character outside the basic set is drawn as a question mark. "Other uncommon characters"
   * rather than "arrows", which is oddly specific beside "mathematical symbols", and rather than "other
   * characters", which says nothing — every PDF contains characters.
   */
  'setup.pdf_desc':
    'Download the expanded character set so the PDFs Orbis Reader generates show mathematical symbols and other uncommon characters correctly ({{size}} MB).',
  'setup.devices_name': 'Devices',
  /**
   * **The caveat is here too, and this is the row that most needs it.** Not "with your others through the vault":
   * "your others" is odd, and "through the vault" is an answer to a question the reader has not asked yet — they
   * do not know Orbis writes files, so the mechanism means nothing to them. But no clause at all would leave the
   * row PROMISING to share, which Orbis does not do — it writes to the vault and something else moves it. Setup
   * comes first in the tree, so for a new reader this is the first sentence they ever read about the feature, and a
   * reader waiting for their phone to catch up would be waiting for something that never happens.
   *
   * **The caveat is `multi_device.sync_caveat` itself, interpolated — not a second copy of it.** The Devices page
   * and the setup dialog already carry that sentence in bold italic; the same thing in slightly different words
   * here (needed/required, synchronize/sync) is how one fact becomes three facts a reader has to parse separately.
   * Composed here so the wording can only ever be changed in one place, and so the reader recognizes the sentence
   * the second and third time rather than reading it again.
   */
  'setup.devices_desc': 'Name this device and choose what it shares with your other devices. {{caveat}}',
  'settings.version': 'Version {{version}}',
  // The button on the version row. "User guide" because that is what the site calls itself; the tooltip says where it
  // goes, since a button that leaves Obsidian for the browser should not surprise anyone.
  'settings.guide': 'User guide',
  'settings.guide_tooltip': 'Open the Orbis Reader user guide in your browser',
  // Extra words settings search matches the row on, comma-separated: what someone who is stuck types.
  'settings.guide_aliases': 'help, guide, user guide, documentation, docs, manual',
  'link_preview_popup.could_not_load_preview': 'Could not load preview.',
  'link_preview_popup.go': 'Go',
  // The check every link out of a book passes through — see `LinkCheck`. Facts in rows, never a verdict: each line
  // under a row says how the link differs from what it appears to be, and none of them claims the link is unsafe. The
  // row labels and the lines use the same words, so each half of a line can be matched to its row.
  'open_link_popup.title': 'Open this link?',
  'open_link_popup.link_type': 'Link type',
  'open_link_popup.domain': 'Domain',
  'open_link_popup.link_text': 'Link text',
  'open_link_popup.link_address': 'Link address',
  'open_link_popup.type_web': 'Web page',
  'open_link_popup.type_email': 'Email',
  'open_link_popup.type_phone': 'Phone number',
  'open_link_popup.type_obsidian': 'Obsidian link',
  'open_link_popup.type_obsidian_action': 'Obsidian link ({{action}})',
  'open_link_popup.type_file': 'File on this device',
  'open_link_popup.type_app': 'Another app ({{scheme}})',
  'open_link_popup.type_invalid': 'Not a valid address',
  'open_link_popup.other_letters': 'The domain contains characters outside the basic Latin alphabet: {{chars}}.',
  'open_link_popup.user_name': 'The link address has a name before “@” ({{name}}). The domain is {{host}}.',
  'open_link_popup.text_names_other_site': 'The link text shows {{shown}}. The link address goes to {{host}}.',
  // Grey notes, not warnings: the rows already show the truth about hidden characters, so these explain rather than flag.
  'open_link_popup.hidden_text_note': 'Characters you can’t see in the book are shown as codes, such as {{code}}.',
  'open_link_popup.hidden_address_note':
    'The link address in the book has characters you can’t see. It’s shown here as it will be opened.',
  // Under the lines, only when there are any: "may", because none of them proves a link unsafe — measured, nearly every
  // one is a publisher's short domain or a typo. The lines sit just above, so this does not point at them.
  'open_link_popup.may_be_unsafe': 'This link may be unsafe. Open it only if you trust the book’s source.',
  // In place of the line above, for a Not a valid address link, which has no Open button.
  'open_link_popup.cannot_open': 'This address can’t be opened.',
  'open_link_popup.no_text': '(no text)',
  'open_link_popup.picture': '(a picture)',
  'open_link_popup.picture_alt': '(a picture: {{alt}})',
  'open_link_popup.copy_address': 'Copy address',
  'open_link_popup.open': 'Open',
  'go_to.go_to_location': 'Go to location',
  'go_to.go_to_label': 'Go to:',
  'go_to.location_or_pct': 'e.g. 47 or 34%',
  'go_to.pct_out_of_range': 'Enter a percentage between 0 and 100',
  'go_to.location_disclaimer': 'Locations do not match standard page numbers. Navigation is approximate.',
  'go_to.enter_valid_location': 'Enter a location between 1 and {{total}}, or a percentage (0–100%)',
  'go_to.go': 'Go',
  'device_locations_modal.device_locations': 'Device locations',
  'device_locations_modal.prompt': 'Select a device to jump to its last reading location.',
  'device_locations_modal.this_device': ' · This device',
  'device_locations_modal.go_to_this_location': 'Go to this location',
  'notes_file_picker_modal.prompt': 'Choose a notes file to open.',
  'notes_file_picker_modal.current_chapter': 'current chapter',
  'notes_file_picker_modal.chapter_n': 'Chapter {{n}}',
  'generate_notes_modal.title': 'Generate notes',
  // **"Notes style".** These configurations do not style anything: they define the format, the location, the file
  // name and the frontmatter of what `Generate notes` writes. "Style" already does three jobs in the plugin — display
  // styles, marks, and this — so the object has to be named, and the object is the notes.
  //
  // **Not "annotation export style".** A notes style can outline the WHOLE BOOK, chapter
  // by chapter, with nowhere anything is marked — `chapterScope: 'all'` is the default — so "annotation export"
  // names one of two modes and "export" claims something false about the other. And not the singular "note
  // style": on the Annotations page, beside the marks manager, that reads as how the notes you attach to passages
  // look, which is the collision `orbis.desc` already ruled on. The plural is the two commands' own word for the
  // document — Generate notes, Open notes — so the reader arrives having learnt it.
  'generate_notes_modal.notes_style': 'Notes style',
  'generate_notes_modal.default': ' (default)',
  // The RADIO GROUP's label — what kind of thing this run produces. The path field below it keeps "Save as" /
  // "Save to", and both reading "Save as" four lines apart would be the same word for two questions.
  'generate_notes_modal.format': 'Format',
  'generate_notes_modal.save_as': 'Save as',
  'generate_notes_modal.single_obsidian_note': 'Single Obsidian note',
  'generate_notes_modal.single_note_desc': 'Saves all notes for this book in one file.',
  'generate_notes_modal.book_folder': 'Book folder',
  'generate_notes_modal.per_chapter_desc': 'One Obsidian note per chapter, plus a table of contents, inside a folder.',
  // The mark filter, offered per RUN and never stored in the note style — a style travels between books and
  // devices, while a mark id belongs to one book's copy of a preset, so a stored one would match nothing on the
  // next book. See `renderMarkFilter`.
  // **"Marks to include", not "Filter by mark".** A verb where every other fold on the screen is a noun, and one
  // whose default value contradicts it: `Filter by mark → All marks` announces a filter and then says there is
  // none. Inclusive, like the value it carries and the line inside it. "No mark" is a legitimate answer to "which
  // mark" rather than an exception to it — the unmarked group is chosen the same way any other is.
  'generate_notes_modal.mark_filter': 'Marks to include',
  // The fold's header when nothing is chosen. States the answer rather than the absence of one: a shut fold has to
  // say what the run will do, and "None" would read as "no marks will be exported".
  'generate_notes_modal.mark_filter_all': 'All marks',
  // That bookmarks carry no mark, and so arrive whatever is chosen, is in `docs/guide/notes-export.md` rather than
  // here: it is a fact about the feature, not an instruction, and the fold's header already states the answer.
  'generate_notes_modal.mark_filter_desc': 'Choose the marks to include in the notes.',
  'generate_notes_modal.mark_filter_off': 'Select passage selections or notes above to filter them by mark.',
  'generate_notes_modal.chapter_headings': 'Chapter headings',
  'generate_notes_modal.bookmarks': 'Bookmarks',
  'generate_notes_modal.highlights': 'Passage selections',
  'generate_notes_modal.notes': 'Notes',
  'notes_styles_page.placeholder_help': 'Placeholder details',
  'notes_styles_page.ph_mark':
    'the mark\u2019s badge and name together, ending in a space so it sits straight in front of the text \u2014 \u201c\ud83d\udfe1\u2796 Follow up: \u201d',
  'notes_styles_page.ph_mark_badge':
    'the badge alone \u2014 \u201c\ud83d\udfe1\u2796\u201d. It stands in for the mark where color cannot be shown, which is everywhere in Markdown.',
  'notes_styles_page.ph_mark_name':
    'the mark\u2019s name alone \u2014 \u201cFollow up\u201d. Empty for a mark you never named.',
  'notes_styles_page.ph_selection':
    'the words from the book: the passage you selected, or the one a note is attached to.',
  'notes_styles_page.ph_selection_block':
    'the same passage as a quote block, with a blank line after it \u2014 and nothing at all when there is no passage, so a note without one leaves no empty quote behind.',
  'notes_styles_page.ph_note_text': 'what you typed in the note, as opposed to what the book says.',
  'notes_styles_page.ph_link': 'a link back to the exact spot in the book.',
  'notes_styles_page.ph_loc': 'the location number, on its own.',
  'notes_styles_page.ph_chapter': 'the chapter it came from.',
  'notes_styles_page.ph_date': 'the day you made it, as 2026-08-03.',
  'notes_styles_page.ph_kind': 'how the bookmark was made \u2014 \u201creading\u201d or \u201caudio\u201d.',
  'notes_styles_page.ph_empty_note':
    'Leave a placeholder out and that part simply does not appear \u2014 which is how you turn it off. Misspell one and it resolves to nothing too, so a typo loses a value rather than breaking the file.',
  'notes_styles_page.highlight_line': 'Passage selection template',
  'notes_styles_page.note_line': 'Note template',
  'notes_styles_page.bookmark_line': 'Bookmark template',
  // The Advanced fold's answer: what the note will hold, so a shut fold says something. "All chapters" leads when
  // the chapters-without-content rule is on, since that is a statement about scope rather than about content.
  // The chapter picker's rule, matching Save as PDF's wording where the option means the same thing. "With content"
  // rather than "with marks", because a note can hold bookmarks too. The dropdown carries no visible label of its
  // own — the fold above it is the label — so `marks_pdf.chapters` serves as its accessible name in both dialogs.
  'generate_notes_modal.chapters_with_content': 'Only the {{n}} with content',
  'generate_notes_modal.chapter_items': '{{n}} saved',
  'generate_notes_modal.frontmatter_template': 'Frontmatter template',
  'generate_notes_modal.placeholders': 'Placeholders:',
  'generate_notes_modal.reset': 'Reset',
  'file_exists_states.a_merge_is_already_in_progress': 'A merge is already in progress.',
  'file_exists_states.resume_merge': 'Resume merge',
  'file_exists_states.discard_draft': 'Discard draft',
  'file_exists_states.folder_already_exists': 'Folder already exists',
  'file_exists_states.file_already_exists': 'File already exists',
  'file_exists_states.merge': 'Merge',
  'file_exists_states.merge_desc': 'Review changes and merge them into your existing chapter files.',
  'file_exists_states.merge_notes_desc': "Review what's changed and merge into your existing notes.",
  'file_exists_states.save_as_new_version': 'Save as new version',
  'file_exists_states.new_folder_desc': 'Creates a new numbered folder alongside the existing one.',
  'file_exists_states.new_file_desc': 'Creates a new numbered file alongside the existing one.',
  'file_exists_states.replace': 'Replace',
  'file_exists_states.removes_earlier_chapter_notes':
    "Removes this book's earlier chapter notes from the folder and writes new ones.",
  'file_exists_states.rewrites_the_entire_file': 'Rewrites the entire file.',
  'file_exists_states.overwrite_folder_desc':
    'Writes into the existing folder, overwriting any existing chapter files.',
  'file_exists_states.overwrites_the_existing_file': 'Overwrites the existing file.',
  'confirm_replace_modal.replace_existing_notes': 'Replace existing notes?',
  'confirm_replace_modal.edits_to_this_file_will_be_lost':
    'This will overwrite the existing content. Any edits you have made to this file will be lost.',
  'confirm_replace_modal.earlier_chapter_notes_will_be_replaced':
    "This book's earlier chapter notes in the folder will be replaced. Any edits you made to them will be lost.",
  'confirm_replace_modal.dont_warn_again': "Don't warn me about this again",
  'confirm_replace_modal.replace': 'Replace',
  'file_diff_modal.merge_notes': 'Merge notes',
  'file_diff_modal.merge_desc':
    'Merge your existing notes with newly generated content. Use the arrows to navigate through each change. Select keep original to preserve your original content. Select use new version to use the newly generated version.',
  'file_diff_modal.could_not_find_files': 'Could not find files to merge.',
  'file_diff_modal.merge_applied': 'Merge applied.',
  // The scrolling diff itself is a tab stop, so it needs a name: without one a screen reader announces a focused
  // region and nothing about it, and a keyboard reader has no idea what the arrow keys are about to move.
  'file_diff_modal.changes_label': 'Changes — use the arrow keys to scroll',
  'file_diff_modal.only_in_original': '- only in original version',
  'file_diff_modal.only_in_new_version': '+ only in new version',
  'file_diff_modal.nothing_to_merge':
    'The notes that would be generated match the file already there, so there is nothing to merge.',
  'file_diff_modal.prev': '← prev',
  'file_diff_modal.keep_original': 'Keep original',
  'file_diff_modal.use_new_version': 'Use new version',
  'file_diff_modal.next': 'Next →',
  'file_diff_modal.undecided': 'Undecided',
  'file_diff_modal.accepted_new': '+ accepted — using new version',
  'file_diff_modal.rejected_original': '- rejected — keeping original',
  'file_diff_modal.change_n_of_n': 'Change {{current}} of {{total}}',
  'chapter_merge_modal.title': 'Merge chapter notes',
  'chapter_merge_modal.merged_automatically': '{{n}} files merged automatically',
  'chapter_merge_modal.merged_automatically_one': '1 file merged automatically',
  'chapter_merge_modal.added': 'Added: {{n}}',
  'chapter_merge_modal.up_to_date': 'Up to date: {{n}}',
  'chapter_merge_modal.updated_contents': 'Updated contents: {{n}}',
  'chapter_merge_modal.need_review': '{{n}} files need review:',
  'chapter_merge_modal.need_review_one': '1 file needs review:',
  'chapter_merge_modal.review': 'Review',
  'chapter_merge_modal.cancel_keep_draft': 'Cancel (keep draft)',
  'chapter_merge_modal.merge_complete': 'Merge complete.',
  'book_export_modal.title': 'Save as Markdown',
  'book_export_modal.single_note_desc': 'Combines all chapters into one Obsidian note.',
  'book_export_modal.file_name': 'File name',
  'book_export_modal.include_images': 'Include images',
  'book_export_modal.assets_folder_desc': 'Saves images to an assets/ folder inside the book folder.',
  'book_export_modal.assets_alongside_desc': 'Saves images beside the note, in a matching "-assets" folder.',
  // A section the contents page does not name, before its own heading has been read — numbered by its place
  // in the book rather than named for its file, which is the EPUB packager's business and not the reader's.
  'book_export_modal.section_n': 'Section {{n}}',
  'book_export_modal.cover': 'Cover',
  // Beside a row for a section the contents page does not name — a cover, a copyright page, a colophon.
  'book_export_modal.not_in_contents': 'not in contents',
  'book_export_modal.chapters': 'Chapters',
  // "Save", as the other three export dialogs say — see `marks_pdf.save` and `epub_export.convert`. "Export" would
  // be the odd one out, and it is a retired word.
  'book_export_modal.save': 'Save',
  'book_export_modal.starting': 'Starting…',
  /**
   * Export to vault's progress line, which `BookExportModal` writes straight into `progressEl.textContent`.
   *
   * **`lint:i18n` counts `onProgress` as a sink**, because these are arguments to a callback rather than literals
   * at a sink and would otherwise be invisible to it. The last pair is a real plural rather than a hand-rolled one,
   * the idiom no prose test can see.
   */
  'book_export_modal.progress_extracting_n_of_n': 'Extracting section {{n}} of {{total}}…',
  'book_export_modal.progress_extracting_n': 'Extracting section {{n}}…',
  'book_export_modal.progress_extracting_file': 'Extracting {{file}}…',
  'book_export_modal.progress_writing_file': 'Writing file ({{n}} sections extracted)…',
  'book_export_modal.progress_writing_chapter': 'Writing {{n}} of {{total}}: {{title}}…',
  'book_export_modal.progress_toc': 'Writing table of contents…',
  'book_export_modal.progress_done': 'Done — {{count}} chapters exported.',
  'book_export_modal.progress_done_one': 'Done — 1 chapter exported.',
  'book_export_modal.error': 'Error: {{message}}',
  'style_name_modal.name': 'Name',
  'style_name_modal.new_style': 'New style',
  'style_name_modal.rename_style': 'Rename style',
  'style_name_modal.new_notes_style': 'New notes style',
  'new_folder_modal.create_folder': 'Create folder',
  'new_folder_modal.parent_folder': 'Parent folder',
  'new_folder_modal.folder_name': 'Folder name',
  'new_folder_modal.already_exists': ' — already exists',
  'new_folder_modal.create': 'Create',
  'settings_pages.listening': 'Listening',
  'settings_pages.lookup': 'Look-up',
  'settings_pages.toolbar': 'Toolbar',
  // Sentence case, like every other page name.
  'settings_pages.devices': 'Devices',
  'appearance_page.styles_desc': 'A display style saves your reading preferences by name.',
  // Settings → Appearance: the distance of Orbis's tooltips below their controls, with a sample to hover.
  'appearance_page.tooltip_distance': 'Tooltip distance',
  'appearance_page.tooltip_distance_desc':
    'Move tooltips farther below controls. Hover the pointer over the sample to check.',
  'appearance_page.tooltip_sample': 'Sample',
  'appearance_page.tooltip_sample_tip': 'This is how far tooltips sit from the control.',
  'appearance_page.active_style': 'Display style',
  'action.new': 'New',
  // Names the style it is talking about, because it sits under a general sentence about what display styles are and
  // has to be readable as a note about the SELECTION. It also says the two things the dropdown cannot: that this one
  // is per-device, and why it has no rename or delete. Not "Saved on this device only", which says neither — it reads
  // as a warning about where the file lives, which is confusing for a reader who syncs nothing.
  // This device's own style in every list of styles: the phrase when the device has no name, and the name with the
  // phrase after it when it has one — see `displayStyleLabel`.
  'appearance_page.style_this_device': 'This device',
  'appearance_page.style_named_this_device': '{{name}} (this device)',
  'appearance_page.device_only_desc':
    'The {{name}} display style cannot be renamed, deleted, or shared with other devices.',
  // Same sentence for a device nobody has named. The style is stored as "device-default", which is not a name to
  // show a reader.
  'appearance_page.device_only_desc_unnamed':
    'This device’s display style cannot be renamed, deleted, or shared with other devices.',
  'reading_page.keyboard_page_turn': 'Turn pages with the keyboard',
  'reading_page.keyboard_page_turn_desc':
    'While you are reading, the left and right arrows, space and Page Up/Down move through the book.',
  'reading_page.show_page_arrows': 'Show page arrows',
  'reading_page.show_page_arrows_desc':
    'The ‹ and › at the edges of the page. When they are hidden, selecting either edge still turns the page.',
  /**
   * The sample both Appearance and Setup show, and it is deliberately short.
   *
   * A long passage is screens of scrolling inside a 140px box, most of it never read. What a sample has to do is
   * fill the box a few times over at the largest font size, so the scrollbar proves there is more; past that,
   * length is just text nobody looks at. Two sentences fill it at 300% and leave a natural five lines at 100%, which
   * is enough to judge line spacing and justification on the page that offers them.
   *
   * Written for Orbis, so no book's text is quoted.
   */
  'appearance_page.preview_sample_text':
    'The ferry left the north shore a little after seven, low in the water with the week’s post and a crate of lamp oil. By the time it reached the island the rain had stopped, and the harbor smelled of wet rope and woodsmoke.',
  // **Which one, and nothing else.** Not what happens next (the device goes back to its own style), nor a
  // reassurance (your books are untouched) — commentary nobody needs, because nobody fears that deleting a set of
  // reading preferences deletes their books. The note export styles version keeps its second sentence: there, the
  // thing a reader might reasonably fear losing — the notes files already written — really does exist.
  'appearance_page.delete_style_title': 'Delete display style?',
  'appearance_page.delete_style_confirm': '“{{name}}” will be removed.',
  'action.rename': 'Rename',
  'action.delete_style': 'Delete style',
  // ── Book sources (OPDS) — see docs/design/book-sources.md ──────────────────
  //
  // **A SOURCE is where books come from; an OPDS FEED is the one kind Orbis can read.** Three words for one thing —
  // "source", "OPDS feed" and "catalog" — would muddle a feature whose whole job is to explain somebody else's server
  // to a reader. The rule:
  //
  // - **"source"** wherever the sentence is about the other end: it would not reach us, it refused us, it sent
  //   something odd, it wants a password. None of that is about OPDS, and a second kind of source one day — a
  //   different protocol, a bookshop, a shared folder — would not change a word of it.
  // - **"OPDS feed"** wherever the sentence is about the format or the endpoint itself: the address to enter, the
  //   list in settings, a reply that is not a feed, a version we cannot read. These are exactly the strings a
  //   second kind of source SHOULD leave behind.
  // - **"catalog"** nowhere here. It is the Library's own word (`cataloged`, the catalog review), a different thing
  //   entirely, and one these strings sit inches from in the download report.
  'settings_pages.sources': 'Book sources',
  // One sentence: what it does. Not "Off until you say Orbis may contact it", which is the right fact in the
  // wrong place — the switch that asks for that consent says so itself, and the first-run dialog exists to ask.
  'settings_pages.sources_desc': 'Connect to an OPDS feed and download books into your vault.',
  'sources_setup.title': 'Enable book sources',
  'sources_setup.desc':
    'Book sources fetch from servers outside your vault. Nothing is fetched until you ask for it, and downloaded books are saved into the folder you choose below.',
  'sources_setup.q_folder': 'Where should downloaded books go?',
  'sources_setup.folder_desc': 'You can change it later, and make a new folder with +.',
  'sources_setup.turn_on': 'Enable',
  'sources.browse': 'Browse book sources',
  'sources.downloads': 'Downloads',
  'sources.download_folder_note': 'Downloads will be saved in the {{folder}} folder',
  'sources.loading': 'Asking the source…',
  'sources.none_enabled': 'No sources are enabled. Add one in Settings → Book sources.',
  'sources.empty_feed': 'Nothing here',
  'sources.untitled': 'Untitled',
  'sources.next_page': 'Next page',
  'sources.previous_page': 'Previous page',
  'sources.search': 'Search this source',
  'sources.search_placeholder': 'Title, author, subject…',
  'sources.search_go': 'Search',
  'sources.no_search': 'This source does not offer a search Orbis Reader can use.',
  'sources.results_for': 'Results for “{{query}}”',
  'sources.review_heading': 'You chose the following books to download',
  'sources.review_desc': 'They will be saved in the {{folder}} folder.',
  'sources.remove_picked': 'Take {{title}} off the list',
  'sources.keep_browsing': 'Keep browsing',
  'sources.download_n': 'Download {{count}}',
  'sources.report_heading': 'Downloads finished',
  'sources.report_saved': 'Saved to {{path}}',
  'sources.report_saved_cataloged': 'Saved to {{path}}, and cataloged',
  'sources.report_skipped': 'Already in your vault: {{path}}',
  'sources.report_failed': 'Not downloaded — {{reason}}',
  'sources.failed_write': 'Could not save the file in your vault.',
  'sources.stop': 'Stop',
  'sources.stopping': 'Stopping after this book…',
  'sources.report_stopped': 'Stopped — {{count}} books were not downloaded.',
  'sources.report_stopped_one': 'Stopped — 1 book was not downloaded.',
  // In a downloaded file's name, for the edition Gutenberg publishes without images — see `downloadEdition`.
  'sources.edition_no_images': 'no images',
  'sources.continue': 'Continue',
  'sources.pick_to_download': 'Select books to download',
  'sources.picked': '{{count}} selected',
  'sources.download': 'Download',
  'sources.clear_picked': 'Clear',
  'sources.downloading': 'Downloading {{title}} ({{done}} of {{total}})…',
  'sources.no_readable_format': 'Not a format Orbis Reader opens',
  'sources.failed_unreachable': 'Could not reach the source. Check the address, and that the machine is awake.',
  // Two answers to a 401, told apart by whether this device sent credentials — see `reasonFor`. "Credentials", not
  // "username and password": Standard Ebooks wants only a username, and says so in the line under this one.
  'sources.failed_requires_authentication':
    'This source requires authentication. Set credentials for this source in Settings → Book sources.',
  'sources.failed_unauthorized':
    'The source refused the username or password. Set them for this source in Settings → Book sources.',
  // The server's own sign-in message, under ours. Labeled because it is theirs, and can be a sentence or just a name.
  'sources.source_says': 'The source says: “{{words}}”',
  'sources.failed_forbidden':
    'The source refused that request. Some sources block what they publish — the ↗ button opens this page on their website.',
  'sources.open_in_browser': 'Open this page on the source’s website',
  'sources.failed_not_found': 'The source says there is nothing at that address.',
  // A source that is down or busy rather than broken: each says what to do next, which the generic error cannot.
  'sources.failed_unavailable':
    'The source isn’t available right now. It may be down for maintenance. Try again later.',
  'sources.failed_rate_limited': 'The source asked Orbis Reader to slow down. Try again in a few minutes.',
  'sources.failed_server': 'The source answered with an error.',
  'sources.failed_too_large': 'The source sent more than Orbis Reader will read in one go.',
  'sources.failed_unreadable': 'The source answered with something that is not an OPDS feed.',
  'sources.failed_not_opds': 'That looks like an OPDS 2.0 feed, which Orbis Reader cannot read yet.',
  // A source that pointed at an address on the reader's own network. Says what was refused and why in one
  // sentence, because the reader did nothing wrong and the source is the thing behaving oddly — and because a
  // self-hosted source is a normal setup, the sentence has to make clear which case this is not.
  'sources.failed_private_address':
    'This source pointed to an address on your own network, so Orbis Reader did not follow it. A source on the public internet has no business reaching into your network. (A source you host yourself is free to — set its address to the local one and this will not happen.)',
  'book_sources_page.enabled': 'Book sources',
  'book_sources_page.enabled_desc': 'Browse OPDS feeds and download books into your vault.',
  'book_sources_page.folder': 'Downloads folder',
  'book_sources_page.folder_desc': 'Downloaded books are saved here.',
  // Named for what they are, so the list needs no paragraph under it. Even a provided feed is not read-only: its
  // username and password are yours even when the feed is not.
  'book_sources_page.sources': 'OPDS feeds',
  'book_sources_page.no_sources': 'No sources yet',
  'book_sources_page.add_source': 'Add a source',
  'book_sources_page.edit_source': 'Edit source',
  // The row's trash asks first, and names the source: a mis-tap on the wrong row is the mistake being guarded
  // against, and the credential goes with it.
  //
  // **No "on this device".** The source list travels, so the delete reaches every device — and the credential
  // goes with it on each of them (see `forgetDepartedCredentials`). A dialog cannot explain that without becoming a
  // paragraph about sync, so it states what is true everywhere and the guide carries the rest.
  'book_sources_page.delete_source_title': 'Delete source?',
  'book_sources_page.delete_source_confirm': '“{{name}}” will be removed, along with its saved credentials.',
  'book_sources_page.source_added': 'Source added',
  'book_sources_page.builtin_hint':
    'Provided with Orbis Reader — its address is kept up to date, so it cannot be edited here.',
  'book_sources_page.source_name': 'Name',
  'book_sources_page.source_url': 'OPDS address',
  'book_sources_page.source_url_desc': 'The URL for the OPDS endpoint.',
  'book_sources_page.source_language': 'Language',
  'book_sources_page.source_language_desc': 'Ask this source for books in one language, or in every language it has.',
  'book_sources_page.language_any': 'Every language',
  'book_sources_page.source_user': 'Username',
  'book_sources_page.source_id': 'Source ID',
  // Three short lines, because long ones read as boilerplate and get skipped — the rest is documentation's job.
  // What each keeps: the ID says how to find the pair in the Keychain, and each half says when to leave it empty and
  // that it stays on this device. That last part earns its words: the source list DOES travel between devices, so
  // "why is my Calibre source refusing to sign in on my phone" is a question this dialog can answer before it is
  // asked. Not "stored locally", which a reader can hear as "in the vault" — and the vault is the thing that syncs.
  'book_sources_page.source_id_desc': 'Identifies the username and password for this source in the Obsidian keychain.',
  'book_sources_page.source_user_desc': 'Leave empty for a public source. Stored on device as an Obsidian secret.',
  'book_sources_page.source_password': 'Password',
  'book_sources_page.source_password_desc':
    'Leave empty unless required by source. Stored on device as an Obsidian secret.',
  // A saved password is never shown — these say what the empty field means. See `BookSourceModal`.
  'book_sources_page.source_password_saved_desc': 'Saved on this device. Type a new one to replace it.',
  'book_sources_page.source_password_removing_desc': 'Removed when you save.',
  'book_sources_page.remove_password': 'Remove password',
  'book_sources_page.reveal_password': 'Show the password',
  'book_sources_page.hide_password': 'Hide the password',
  'book_sources_page.invalid_name': 'Give the source a name',
  'book_sources_page.invalid_url': 'Enter the feed address, starting with http:// or https://',
  'reading_page.confirm_delete_note': 'Confirm before deleting notes',
  'reading_page.confirm_delete_note_desc':
    'Ask for confirmation before a note is deleted, so a long note is not removed by accident.',
  'reading_page.flash_navigation': 'Flash book text for navigation and search results',
  'reading_page.flash_navigation_desc':
    'Pulse the passage for a moment when a search result, a bookmark or a link takes you there.',
  'reading_page.link_preview': 'Link preview',
  'reading_page.link_preview_desc':
    'When you select a link in a book, show a preview of the destination before navigating.',
  'listening_page.full_screen_audio_player': 'Full-screen audio player',
  'listening_page.player_desc': 'The full-screen view shown while listening, with the cover and playback controls.',
  'listening_page.highlight_button': 'How much the mark button marks',
  'listening_page.note_button': 'How much the note button captures',
  'listening_page.record_none_enabled': 'Nothing enabled',
  'listening_page.preferred_method': 'Default recording method',
  'listening_page.preferred_method_desc': 'You can change this per recording.',
  'listening_page.preview_live': 'Hear the live voice',
  'listening_page.preview_recorded': 'Hear the recording voice',
  'listening_page.preview_play': 'Play a sample',
  'listening_page.preview_stop': 'Stop',
  // Why the play button above is dimmed. It names the remedy and where it is, because the row that offers it is
  // the one directly above — and playing anyway would download the voice with nothing asked.
  'listening_page.preview_needs_voice': 'Choose a voice above to hear a sample',
  'listening_page.preview_failed': 'Could not play a sample with that voice.',
  'listening_page.voice_page_desc': 'The voice that reads aloud as you listen, without recording anything first.',
  'listening_page.generation_heading': 'Recorded voice',
  'listening_page.generation_desc': 'Record tracks to audio files: higher quality, and lighter on the battery.',
  'listening_page.record_active': 'Active',
  'listening_page.record_inactive': 'Inactive',
  'listening_page.record_model_voice': 'Voice: {{voice}}',
  'listening_page.gen_method_piper': 'This device (Piper)',
  'listening_page.gen_method_server': 'Server (Kokoro / OpenAI-compatible)',
  'listening_page.gen_server_voice': 'Default server voice',
  'listening_page.gen_piper_voice_desc':
    'The default on-device voice pre-selected when you record. Orbis Reader asks before downloading it.',
  'listening_page.gen_voice_speaker': 'Voice #',
  'listening_page.gen_voice_speaker_of': 'of {{n}}',
  'listening_page.gen_voice_multi': 'Multi-voice',
  'listening_page.gen_server_url': 'Server URL',
  'listening_page.gen_server_url_desc': 'Base URL of the server (the /v1/audio/… path is added automatically).',
  // A placeholder, not a default value — see `GEN_CONFIG_DEFAULTS`. Kokoro's own port, so it is the right hint for
  // the common case while the field stays honestly empty until someone answers it.
  'listening_page.gen_server_url_ph': 'http://localhost:8880',
  // The same reasoning for the voice: Kokoro's own first voice, as a hint about the SHAPE of a voice id rather than
  // as a value, since an id is server-specific and a pre-filled one is wrong on any other server.
  'listening_page.gen_voice_ph': 'af_heart',
  'listening_page.gen_refresh_voices': 'Refresh voices',
  'listening_page.gen_voice_desc':
    'The voice pre-selected when you record. Picked from the server when it lists voices, else typed (e.g. af_heart).',
  'listening_page.gen_voice_preview': 'Preview',
  'listening_page.gen_voice_previewing': 'Generating…',
  'listening_page.gen_voice_loading': 'Loading voices…',
  'listening_page.gen_voice_unset': 'none chosen',
  'listening_page.gen_voice_none_match': 'No voices match the filter.',
  'listening_page.gen_voice_none_available': 'No voices available on this device.',
  'listening_page.gen_voice_filters': 'Filter voices',
  'listening_page.gen_voice_gender': 'Gender',
  'listening_page.gen_voice_language': 'Language',
  'listening_page.gen_voice_accent': 'Accent',
  'listening_page.gen_voice_download': 'Download · {{size}} MB',
  'listening_page.gen_voice_downloading': 'Downloading… {{pct}}%',
  'listening_page.gender_female': 'Female',
  'listening_page.gender_male': 'Male',
  'listening_page.gen_concurrency': 'Request parallelization',
  'listening_page.gen_concurrency_desc':
    'How many sentence requests to send at once. Higher can help on a server with spare cores (e.g. a GPU); on a CPU-bound server it usually does not. Default 1.',
  'listening_page.sentence': 'Sentence',
  'listening_page.paragraph': 'Paragraph',
  // Not "Passage", which Orbis already uses for a selection in the book (the player's Passage button).
  'listening_page.a_few_sentences': 'A few sentences',
  'listening_page.skip_back_desc': 'How far back the rewind button jumps. It lands on a sentence boundary.',
  'listening_page.skip_forward_desc': 'How far ahead the forward button jumps.',
  'listening_page.skip_back': 'Rewind button',
  'listening_page.skip_forward': 'Forward button',
  'listening_page.n_seconds': '{{n}} seconds',
  'listening_page.read_ahead': 'Read ahead',
  'listening_page.read_ahead_desc':
    'How much a live voice prepares at a time. Larger pieces start slower and play more smoothly.',
  'listening_page.off': 'Off',
  'listening_page.word': 'Word',
  'listening_page.reading_highlight': 'Highlight while reading',
  'listening_page.reading_highlight_desc': 'How much text is highlighted as it is read aloud.',
  'listening_page.pron_heading': 'Pronunciation glossary',
  'listening_page.pron_desc':
    'When a book is read aloud, some words may be mispronounced, especially names and acronyms. Add a phonetic spelling in the glossary and the voice will use it whenever that word appears, in every book.',
  // No ellipsis: the glossary glyph beside the label already says a dialog opens.
  'listening_page.pron_manage': 'Manage glossary',
  // The row under the heading says what is in the glossary, the way the library status row says what is cataloged —
  // a launcher whose label repeated its own heading would be saying nothing twice.
  'listening_page.pron_none': 'No respellings yet',
  'listening_page.pron_one': '1 respelling',
  'listening_page.pron_many': '{{count}} respellings',
  'dialog.from_orbis': 'Orbis Reader',
  // Fires only for a reader syncing `data.json` itself, where the file is one merge unit. Not a dialog asking which
  // whole copy of the settings to keep: that is a choice between two copies the reader cannot see. The other
  // device's copy is taken, and this says which change went with it.
  'stale_settings.taken': 'Settings arrived from another device. Your last change here was not kept.',
  'pron_modal.title': 'Pronunciation glossary',
  // ── Annotation presets (docs/design/annotation-presets.md) ──────────────────────
  // "Highlighter" is deliberate for the `fill` treatment: "Highlight" is the annotation KIND, and a
  // mark drawn as an underline is not a highlight.
  // The preset every vault starts with. "Built-in" would describe where it came from rather than what it is, and
  // reads as a category — "This book uses the preset Built-in." tells a reader nothing about their marks. Not
  // "Colors" either: a mark can be a shape. Named for its contents instead, so the sentence says something: this
  // book uses the marks Orbis ships with.
  'presets.builtin_name': 'Orbis marks',
  // Named for what they MEAN, not for their color — see `BUILTIN_MARKS` for why, and note that the keys stay the
  // colors: they are the stored mark ids (`mk_builtin_yellow`), so renaming them would orphan every annotation.
  'presets.builtin_mark_yellow': 'Key point',
  'presets.builtin_mark_purple': 'Quote',
  'presets.builtin_mark_green': 'Question',
  'presets.builtin_mark_blue': 'Definition',
  'presets.builtin_mark_orange': 'Disagree',
  /**
   * **One title: "Marks".**
   *
   * The dialog opens from the reader, where it holds both the book's marks and the shared library, and from
   * Settings, where there is no book. One title has to cover both halves: "presets" is wrong about the tab the
   * reader lands on, and "Annotations" is wide enough but belongs to the settings category.
   *
   * "Marks" is wide enough and narrower: a preset is a set of marks, and the book scope is the marks this book
   * uses, so one word names both without naming a tab. It also leaves "Annotations" to the settings category,
   * where it means everything a reader adds to a book.
   */
  'presets.modal_title': 'Marks manager',
  // **The second clause is the whole idea.** "A set of marks you annotate with" describes the object and leaves
  // out why it exists: you build one and carry it from book to book. A book can still detach and keep its own
  // marks, which is what the dialog's book scope is for — too much for a row, hence "can be", not "is".
  //
  // "the same preset", not "each one": the nearest plural noun is `marks`, so "each one" can be read as each MARK
  // being usable across books — true, and not the point.
  'presets.desc': 'A preset is a set of marks you annotate with; the same preset can be used with multiple books.',
  // No ellipsis: the Aa beside the label already says a dialog opens (as on "Manage glossary").
  'presets.manage': 'Manage annotation presets',
  'presets.sample': 'Sample',
  'presets.active': 'Active',
  'presets.custom_current': 'Current custom color {{hex}}',
  // Split so the marked phrase can wear the treatment inside a real sentence — the judgment being
  // made is "can I still read this?", which one word cannot answer.
  'presets.sample_lead': 'Ideas worth ',
  'presets.sample_marked': 'marking twice',
  'presets.sample_tail': ' rarely arrive twice.',
  'presets.drag_hint': 'Drag to reorder',
  'presets.custom_color': 'Custom',
  'presets.pick': 'Pick a color',
  'presets.custom_hex': 'Hex color value',
  // A format specimen rather than prose — written the same way in every locale, but a key keeps it out of
  // the UI-text lint's way.
  'presets.hex_placeholder': '#RRGGBB',
  'presets.bad_hex': 'Enter a color like #4A90D9.',
  'presets.color_yellow': 'Yellow',
  'presets.color_green': 'Green',
  'presets.color_blue': 'Blue',
  'presets.color_orange': 'Orange',
  'presets.color_purple': 'Purple',
  'presets.color_red': 'Red',
  'presets.color_teal': 'Teal',
  'presets.color_brown': 'Brown',
  'presets.color_grey': 'Gray',
  // Not a swatch — kept so a mark stored on black names itself. See COLOR_LOOKUP.
  'presets.color_black': 'Black',
  // Not a color but a rule: follow the page's text color, so the line is legible on any theme.
  // Kept for the badge glyph lookup: ink has no swatch, but a mark stored on it still needs a name.
  'presets.color_ink': 'Text color',
  'presets.match_text_color': 'Match the text color',
  'presets.preset': 'Preset',
  'presets.add_mark': 'Add mark',
  'presets.edit_mark': 'Edit “{{name}}”',
  // The row's own accessible name. It carries the appearance because the row does not print it: the sample beside
  // the name shows it, which is no use at all to a reader who cannot see the sample.
  'presets.edit_mark_appearance': 'Edit “{{name}}” — {{appearance}}',
  // The mark editor's own name, like *Edit field* and *Edit source* next door — see `MarkEditorModal.refreshTitle`.
  //
  // **Two of them, as the recordings dialog has**: Add opens this same editor on a mark it has just created, and a
  // dialog that says *Edit* over something you are making for the first time describes the wrong act.
  'presets.edit_title': 'Edit mark',
  'presets.add_title': 'Add mark',
  // The editor's two tabs. "General" is honest about being the everything-else tab — it holds the name, the
  // badge AND the role toggles, so any precise name would over-promise and then not cover the roles.
  // "Appearance" is exact, and matches what the code already calls it (MarkAppearance).
  'presets.tab_general': 'General',
  'presets.tab_appearance': 'Appearance',
  'presets.needs_one_channel': 'A mark needs a highlighter or a treatment — otherwise it draws nothing.',
  'presets.mark_name_ph': 'What this mark means',
  'presets.field_name': 'Name',
  'presets.field_badge': 'Badge',
  'presets.field_treatment': 'Treatment',
  'presets.move_up': 'Move up',
  'presets.move_down': 'Move down',
  /** The trash icon's label, where "Delete" alone would tell a screen reader nothing — the confirm BUTTON
   *  says just "Delete", because the dialog around it already names the thing. */
  'presets.delete_mark': 'Delete this mark',
  'presets.delete_mark_last': 'A preset needs at least one mark',
  /**
   * The same rule as `reading_records_page.kinds_last`, and the same shape: the last one left locks, and the way past it
   * is to turn another on first.
   *
   * **A book with no active mark cannot be annotated at all** — selecting text offers nothing — and without this it
   * is two taps away with nothing saying so, by unchecking Active on each mark or by deleting the only active one.
   * Reversible, but a capability switched off by accident is still switched off.
   */
  'presets.mark_last_active': 'A book needs one active mark. Switch another on to turn this one off.',
  /**
   * The book scope's checkbox, for a mark the PRESET has switched off.
   *
   * **"Inactive", because that is the word on every one of these rows.** `enabled` and `hiddenMarkIds` are
   * different fields for a reason — one retires a mark everywhere, one hides it in this novel — but that
   * distinction is the code's, and a reader only ever sees `Active` — so not "turned off" or "retired", which
   * would be more words for one state.
   *
   * The reason without the name, following `delete_mark_tracked`: a disabled control's accessible name is
   * better spent saying why it cannot be used than repeating what the row already says.
   */
  'presets.mark_inactive_in_preset': 'Inactive in the preset, so it cannot be active in this book.',
  'presets.delete_mark_last_active': 'A book needs one active mark. Switch another on before deleting this one.',
  // Both delete dialogs take `delete_mark_decide` as their title, so the question is asked once with the name in it
  // rather than a generic heading above a body that repeats it.
  // An unused mark's confirm has no body at all: the title names the mark, the buttons ask the question, and a line
  // reporting that nothing else happens is one the reader finishes before learning it was not needed.
  /**
   * The decision a local mark in use forces. Two choices, and neither is "leave them as they are": that is the
   * markless passage selection this design exists to retire — see `applyRemap`.
   *
   * Removal says what it spares as well as what it destroys. A passage selection with no mark is nothing, but a
   * note is words the reader wrote, so the note stays and loses its mark. Saying so here is the difference
   * between a choice and a surprise.
   */
  'presets.delete_mark_decide': 'Delete “{{name}}”',
  'presets.delete_mark_decide_intro': '{{count}} annotations use this mark. Choose what happens to them.',
  'presets.delete_mark_decide_intro_one': 'One annotation uses this mark. Choose what happens to it.',
  /**
   * **"Apply", because that is this plugin's verb for putting a mark on a passage** — see
   * `command_palette.apply_mark`. Not "Assign", which belongs to presets: `presets.inactive_hint` says
   * "the lists that offer a preset to assign", and one word should not carry both jobs. The dropdown below takes
   * the same verb, so the option and the control it needs read as one thing.
   *
   * Count-neutral on purpose: the intro has just said how many, and `_one` variants of four more strings would be
   * four more to keep in step for a word the reader read a line ago.
   */
  'presets.delete_mark_move': 'Apply another mark',
  // **"No annotations are deleted", not "Nothing is deleted"** — the MARK is deleted either way, that being the
  // whole dialog, so the unqualified version could be read as this option sparing it. Naming annotations also
  // puts both descriptions on one axis, so the difference between the options is what the eye lands on.
  'presets.delete_mark_move_help':
    'Annotations using this mark are updated to use the selected mark. No annotations are deleted.',
  // **Both outcomes in the label, the destructive one first.** Naming only the deletion would undersell an
  // option that does two things — and a reader hesitating here is hesitating about the notes. The detail the
  // label cannot hold (a kept note loses its mark) is what the description is for, so the two do not restate
  // each other.
  'presets.delete_mark_remove': 'Delete the passage selections, keep the notes',
  // "but", not "and": the clauses are not equals. One is what you keep and one is what it costs, and `and` lets
  // "keep their text" carry the sentence unqualified.
  'presets.delete_mark_remove_help':
    'Passage selections using this mark are deleted. Notes keep their text but lose the mark.',
  'presets.delete_mark_move_to': 'Apply',
  // The same two outcomes as the pair above, for a book with nowhere to apply instead — so it states what will
  // happen rather than offering a choice that cannot be honored.
  'presets.delete_mark_needs_target':
    'This book has no other mark to apply instead. Passage selections using this mark are deleted. Notes keep their text but lose the mark.',
  // Named rather than counted: a count needs a `_one` twin, and what the reader wants confirmed is where their
  // annotations went, which the number does not say.
  'presets.deleted_mark_moved': 'Deleted “{{name}}”. Its annotations now use “{{to}}”.',
  'presets.deleted_mark_removed': 'Deleted “{{name}}” and the passage selections using it.',
  'presets.toggle_mark': 'Active — “{{name}}”',
  // **One word in both tabs, with the scope in the accessible name.** Not "Shown" in a book, which frames the
  // control as being about what is on the page — and nothing already marked changes when you turn a mark off. What
  // changes is whether the mark is OFFERED: on the bar, in the “…” list, to the player. The two tabs write different
  // fields (the book's `hiddenMarkIds`, the preset's `enabled`) and that difference is the implementation's, not the
  // reader's; both answer "is this mark available here". Two words for one question, in tabs one click apart, is how
  // somebody turns a mark off everywhere while meaning to turn it off in one novel.
  'presets.show_mark': 'Active in this book — “{{name}}”',
  'presets.mark_local': 'This book',
  'presets.mark_tracked': 'Preset',
  // A delete's "Apply another mark" option: the mark and where it comes from, in the badge's own words. The list
  // mixes the book's marks with a preset mark the delete lets in — see `marksFreedByDeleting` — and can show no look.
  'presets.mark_with_source': '{{name}} — {{source}}',
  'presets.delete_mark_tracked': 'Preset marks can’t be deleted here — turn it off for this book instead',
  // The gate in front of editing a preset mark inside a book. Copying mints a new mark that replaces the preset's
  // in this book and moves this book's annotations onto it, so the preset is left alone.
  'presets.copy_into_book': 'Copy to this book',
  'presets.copy_into_book_hint': 'Preset marks can’t be edited here. Copying makes this book its own version.',
  'presets.copied_into_book': '“{{name}}” is now this book’s own.',
  'presets.treatment_fill': 'Highlighter',
  'presets.treatment_underline': 'Underline',
  'presets.treatment_double_underline': 'Double underline',
  'presets.treatment_squiggle': 'Squiggle',
  'presets.treatment_strikethrough': 'Strikethrough',
  'presets.treatment_box': 'Box',
  // **The last resort, not the usual answer.** A choice that would duplicate another mark is offered as
  // unavailable — struck through in the palette, grayed in the treatment list — so the reader sees it before
  // reaching for it. This still fires for the two places a value can be typed or picked from the OS rather than
  // chosen from what we drew: the hex field and the eyedropper.
  'presets.clash':
    'Another mark already uses that color and treatment. Change one of the two so they can be told apart.',
  // The name's counterpart — see `isMarkNameFree`: exports print the name, not the look.
  'presets.name_taken': 'Another mark is already named “{{name}}”. Give this one a different name.',
  // Why a swatch or a treatment is unavailable. Named rather than silent: a struck-through swatch says "not this
  // one" but not why, and the reason is one a reader can act on — the mark that has it is theirs to change.
  'presets.taken_label': '{{name}} — already used by another mark',
  'presets.taken_option': '{{name}} (already used)',
  // The built-in preset is read-only so that its fixed id means the same marks on every device. Duplicate
  // is the way past it, and any other preset can be made the default instead.
  // Names the preset and says what to do about it. "The built-in preset" would describe a thing the reader sees
  // called something else, and nothing else on screen says that duplicating is the way past the lock.
  'presets.builtin_locked': 'The preset {{name}} can’t be edited. Duplicate it to make changes.',
  'presets.duplicate': 'Duplicate',
  'presets.duplicate_title': 'Duplicate preset',
  'presets.copy_of': '{{name}} copy',
  'presets.duplicated': 'Created “{{name}}”.',
  'presets.default_badge': 'Default',
  'presets.make_default': 'Set as default',
  // Why the button is dead on the preset that already is the default. The dropdown says “(default)” beside the
  // name, so this only has to confirm that the grayed button is the same fact and not a fault.
  'presets.already_default': '“{{name}}” is already the default preset.',
  'presets.made_default': '“{{name}}” is now the default preset.',
  'presets.add_preset': 'Add new',
  'presets.new_preset_title': 'New preset',
  'presets.rename_preset': 'Rename preset',
  'presets.rename': 'Rename',
  'presets.delete_title': 'Delete preset?',
  // No "this cannot be undone": it is not true of this, and the line below says the opposite in the
  // same breath — a book that uses the preset brings it back.
  'presets.delete_body': 'Delete “{{name}}” and its {{count}} marks?',
  'presets.delete_body_one': 'Delete “{{name}}” and its 1 mark?',
  // True and worth saying: a book copies the preset into its own .orbis file, so deleting the global
  // one leaves existing annotations and their names intact.
  'presets.delete_safe': 'Books already using it keep their own copy, so their annotations are unaffected.',
  // Per-book assignment. The book keeps its own copy of the preset, which is why the wording is about
  // what the book USES rather than about a link to the global one.
  // The two jobs a mark can be given. A plain title rather than a sentence stem — "Use for" reads into
  // both labels without forcing them to be nouns, and without a third "mark" in a row that already has two.
  'presets.roles_heading': 'Use for',
  // Each label names WHAT, each hint says WHEN — the same shape twice, so the pair scans as a pair.
  'presets.role_note': 'Notes',
  'presets.role_note_hint': 'New notes get this mark by default.',
  // Named for the action, not for a category: anything shaped "<x> mark" reads as a KIND of mark (and
  // "Audio mark" would sit next to the player's audio Bookmark button meaning something else).
  'presets.role_audio': 'Mark the passage',
  /**
   * **Parallel with `presets.role_note_hint` above it, because the two rows answer one question.** Under a heading
   * that says "Use for", both hints have to say what ticking the box DOES. Not a gesture — "One tap in the player
   * marks the passage you're hearing" — which reads as an instruction sitting beside a statement.
   *
   * **It also must not restate its own label.** The row already says "Mark the passage" and wears the headphones,
   * so the hint's job is the part neither says: that ticking this is what makes THIS mark the one applied.
   *
   * **"Passages you mark" is what stops the continuous reading**, without leaning on a count like "One tap" —
   * the worry being that it describes a running process marking everything you hear. Naming the reader
   * as the one who marks is sturdier than a count.
   *
   * **"full-screen audio player" is accurate, not only consistent.** It matches
   * `listening_page.full_screen_audio_player` and the palette command, and it is the true scope: the mark, note and
   * bookmark buttons are built in `buildPlayer`, which is the full-screen surface. There is no way to mark a
   * passage from the compact listen bar, so a bare "player" would name something wider than the feature.
   */
  'presets.role_audio_hint': 'Passages you mark in the full-screen audio player get this mark by default.',
  // A whole sentence, and no book title beside it. A long title truncates mid-word and says nothing the reader
  // does not already know — they are reading the book — while "Uses <name>" names something without ever saying
  // what it is. This line is where a reader meets the word "preset" in this dialog, so it says it plainly.
  // The name LAST, so the accent-colored word ends the sentence rather than interrupting it — the eye lands on
  // the answer instead of stepping over it to reach "preset."
  'presets.book_uses': 'This book uses the preset {{name}}.',
  // A button, not a select: switching is rare, consequential, and opens the mapping step.
  // **No ellipsis.** It belongs to menu items and palette commands here — `pane_menu` says so — and every other
  // button in this dialog opens a dialog without one: Delete, Duplicate, Add new, Rename, Save as new preset.
  'presets.change_preset': 'Change preset',
  /**
   * Stopping and starting are two BUTTONS, not one toggle.
   *
   * Off is cheap and on is not: re-attaching means a decision per mark in use, plus the `(color, treatment)`
   * clash between a local mark and an incoming one — which is `change_preset`'s dialog. A toggle whose "on"
   * opens a decision dialog is a toggle that lies, and this control rewrites annotation data, which is not
   * toggle weight. It is the same argument that made `change_preset` a button rather than a select.
   */
  'presets.detach_preset': 'Stop using this preset',
  // The name alone would leave a name like "Test" unexplained; the type needs its article to sit beside a quoted name.
  'presets.detach_title': 'Stop using the “{{name}}” preset?',
  /**
   * What happens, in the order it matters — and in the product's own verb: **copied**, which is what
   * `copy_into_book` already calls this operation one mark at a time.
   *
   * "Annotations in the book" scopes rather than reassures, and the scope is the point: a reader detaching one
   * book wants to know the others using this preset are untouched. "Future" is load-bearing too — without it,
   * "changes made to the preset will not update the marks" can be read as changes already made being reverted.
   */
  'presets.detach_body':
    'Marks from the preset are copied to the book. Annotations in the book are updated to use the copied marks. Future changes to the preset will not update the book’s marks.',
  'presets.detach_confirm': 'Stop using it',
  'presets.detached': 'This book now uses its own marks.',
  // The line where `book_uses` would name a preset, for a book that follows none.
  'presets.book_own_marks': 'This book uses its own marks.',
  // Same rule as `change_preset` above: this is the button that replaces it, in the same row.
  'presets.use_preset': 'Use a preset',
  'presets.change_preset_title': 'Change this book’s preset',
  'presets.change_preset_to': 'Change to',
  'presets.change_preset_none': 'There is only one preset in this vault. Add or duplicate one first.',
  // A dialog with no consequence to report shows none: the dropdown and the two buttons are the whole question,
  // and a sentence saying there is nothing to read is still something to read.
  /**
   * Said BEFORE Apply, because the switch has to collapse these and the reader has to know which.
   *
   * `(color, treatment, treatmentColor)` is a mark's identity here, so two marks cannot both wear one
   * appearance — but **appearance is not meaning**. A book mark called "Stuff I hate" and an incoming one
   * called "Stuff I love" can be the same yellow underline, and merging them quietly would relabel every
   * annotation that used the first. Naming both marks is the whole point of the warning; a count would not
   * let anyone spot that.
   *
   * It fires even when nothing is annotated yet: a mark of the reader's still disappears.
   */
  /**
   * The `*` on a book mark that is holding its appearance or its name, and the legend under the list.
   *
   * **Line-level, not a paragraph.** The reader's question is "why is the preset's mark not here?", and the
   * answer belongs on the mark that is the reason. Not a glyph: the row already carries two (the note and
   * listening roles), a third would need hover to explain, and `*` plus a legend works on a phone.
   *
   * The second sentence is the way out. A book mark holds its appearance and name for as long as it has them, so
   * changing one is what lets the preset's mark in — said here because nothing else would say it.
   */
  'presets.blocking_marker': '*',
  'presets.blocking_legend':
    '* A mark from the preset has the same appearance or name, so it is not added to this book. Change its appearance or name to bring the preset’s mark in.',
  // A clash is a choice on the decision rows, not a block above them: what a note would say lives on the option's
  // own help and on the muted line under the row.
  // Symmetric, and in the editor's own word — its tab is "Appearance". Not "Looks the same as", which points one
  // way, as though one of the two were the original; neither is.
  'presets.clash_row': '“{{from}}” and “{{to}}” have the same appearance.',
  /**
   * The two cases where the names match and something else still does not.
   *
   * A row that said only "two marks have the same appearance" would be true and useless here — the reader can
   * see they match, and what they need is the thing they CANNOT see. So each row names the difference it is
   * warning about, and a pair with no difference at all gets no row: see `clashDifference`.
   */
  'presets.clash_row_badge': 'Two marks named “{{from}}” have the same appearance but different badges.',
  // **"inactive", because that is the word on the row.** The checkbox beside every mark is labeled `Active`
  // and `inactive_badge` already says "Inactive" for presets — "turned off" would be a third phrasing for a state
  // the UI has a name for. "but" rather than "and": the clause is a cost, not an addition. And "the preset's
  // MARK", spelled out, because "the preset's is inactive" can be misread as the preset being inactive, which
  // is a real state here.
  'presets.clash_row_enabled':
    'Two marks named “{{from}}” have the same appearance, but the preset’s mark is inactive.',
  // A row for a mark of the book's own that the preset has a namesake for, in another look — see
  // `presetSwitchNameTwins`. The row starts on the preset's mark; this says what the other choice costs, since two
  // marks may not share a name.
  'presets.name_twin_row':
    'The preset also has a mark named “{{name}}”. Choose Keep in this book and this one is renamed “{{renamed}}”.',
  // The name a kept mark takes beside a preset mark of the same name.
  'presets.kept_name': '{{name}} (this book)',
  /**
   * Generic, so one string serves any number of clashes — naming the incoming mark would force a plural twin that
   * loses the detail it exists for.
   *
   * **"including their names" is the sentence that has to be here.** Everything else describes a mechanism, and
   * the mechanism looks harmless: the appearance does not change, so a reader can reasonably conclude nothing
   * meaningful did. The name is what changes, and a passage that meant "Stuff I hate" reading "Stuff I love"
   * afterwards is the failure this whole warning exists for.
   */
  'presets.change_preset_intro': 'Choose what happens to the annotations using each mark.',
  'presets.remap_pick_label': 'A mark from the new preset',
  'presets.remap_keep_help':
    'use this when you want to preserve the mark in your book as-is; any selections currently assigned to this mark remain unchanged. The mark\u2019s name and appearance don\u2019t change, and it appears in the list badged \u201cThis book\u201d.',
  'presets.remap_count': '{{name}} — {{count}} annotations',
  'presets.remap_count_one': '{{name}} — 1 annotation',
  'presets.remap_keep': 'Keep in this book',
  'presets.remap_pick_help':
    'use this when the new preset has a mark that means the same thing. Any selections currently assigned to this mark will be updated to use the new mark and have the new mark\u2019s appearance.',
  'presets.changed_preset': 'This book now uses “{{name}}”.',
  // An import arrives inactive, always — so the notice has to say both that something was added and that
  // nothing changed about the lists the reader picks from.
  'presets.imported': 'Added “{{name}}” to this vault’s presets, inactive. Activate it to assign it to other books.',
  // Bare verbs, like every other command on these two rows — Rename, Delete, Duplicate, Add new, Set as
  // default. The row is under the preset's own name, so repeating the noun says nothing the reader cannot see.
  'presets.deactivate_preset': 'Deactivate',
  'presets.activate_preset': 'Activate',
  'presets.inactive_hint':
    'Keep it out of the lists that offer a preset to assign. It still works everywhere it is already used.',
  // No "to keep it out of the lists, deactivate it": that advice is the button underneath.
  'presets.delete_returns': 'Opening a book that uses it restores it to the list, inactive.',
  // Only when this device publishes. A delete is a version like any other, so it travels; saying so
  // unconditionally would promise sync to someone who has not turned it on.
  'presets.delete_travels': 'It will also be removed from your other devices the next time they sync.',
  'presets.inactive_badge': 'Inactive',
  'presets.book_missing': 'A preset this vault no longer has',
  'presets.no_book_open': 'Open a book to give it a preset.',
  'presets.assigned': '“{{book}}” now uses “{{name}}”.',
  // The two scopes. A preset is shared by every book that copies it; a book's marks are its own. The
  // toggle exists because those are genuinely different things to edit, and a reader looking at the book's
  // marks should not be shown only the preset's.
  'presets.scope_preset': 'Presets',
  'presets.scope_book': 'This book',
  'presets.book_no_marks': 'This book has no marks of its own yet.',
  'presets.book_start_from': 'Start from “{{name}}”',
  'presets.book_save_as': 'Save as new preset',
  // Says what happened to the BOOK too: the promotion re-mints tracked mark ids and rewrites this book's
  // annotations onto them, so "saved a copy" would undersell it.
  'presets.book_saved_as': 'Saved “{{name}}” to this vault’s presets. This book now tracks it.',
  'presets.gone': 'That preset no longer exists.',
  'presets.mark_gone': 'That mark no longer exists.',
  'presets.badge_ph': 'Badge',
  'presets.badge_hint': 'Used to identify this mark in exported notes',
  'presets.badge_hint_more':
    'An emoji by default; short abbreviations like “WIP” work too. Clear it and apply to restore the default.',
  /**
   * Where a mark's NAME would go, for content that has none.
   *
   * **"Unmarked", not "No mark".** It stands in a list of names, so it has to read as one of them — and under a
   * fold headed *Marks to include*, "Marks to include: No mark" parses as an absence being requested rather than
   * as a group being chosen. "Unmarked" is the group, the way a facet reads. Not a verb phrase like "Not marked"
   * either.
   */
  'presets.no_mark': 'Unmarked',
  /**
   * The same group, worded for a FILTER rather than for a state — Save as PDF, Generate notes and advanced search.
   *
   * `presets.no_mark` labels a condition: the flash when a mark is applied, a swatch's accessible name. "Unmarked"
   * is enough there, because the thing it describes is in front of you. In a filter it is a row under "Filter by
   * mark", beside six real marks wearing color chips, and the bare word reads as the name of a seventh mark
   * rather than as the thing choosing it gets you. Only a note can be unmarked, so the row can say so.
   */
  'mark_filter.no_mark': 'Unmarked notes',
  'presets.unnamed_mark': 'Unnamed mark',
  'pron_modal.find_or_add_ph': 'Find or add a word',
  'pron_modal.no_match': 'No words match “{{query}}”. Add is still available above.',
  'pron_modal.desc': 'Replacements are applied just before the voice speaks.',
  'pron_modal.desc_more':
    'Chapters already recorded keep the old pronunciation until you record them again. Words spelled the same but said differently in context, like “read”, cannot be fixed this way.',
  'pron_modal.col_word': 'Word',
  'pron_modal.col_active': 'Active',
  'pron_modal.toggle': 'Use the pronunciation for {{word}}',
  'pron_modal.invalid_note': 'One or more entries have no replacement text and are being skipped.',
  'listening_page.pron_empty': 'No pronunciations yet. Add one above, or from the Look-up dialog while reading.',
  'listening_page.pron_edit': 'Edit',
  'listening_page.pron_bad_word': 'Enter a single word — no spaces.',
  'listening_page.keep_screen_awake': 'Keep screen awake while listening',
  'listening_page.keep_screen_awake_desc': 'Only while audio is playing. Drains the battery faster.',
  'listening_page.voice': 'Live voice',
  // The Live voice and Recorded voice entries, when that voice is not on this device. The chip says *No voice*,
  // having no room.
  'listening_page.voice_not_downloaded': '{{voice}} · not downloaded',
  'listening_page.voice_desc':
    'The real-time voice that reads your books aloud, and what plays when a book has no recording.',
  'listening_page.playback_heading': 'Playback',
  'listening_page.american_english': 'American English',
  'listening_page.british_english': 'British English',
  // Settings → Listening → Downloaded voices — the only place a voice is deleted (see `downloaded-voices.ts`).
  'downloaded_voices.row_name': 'Downloaded voices',
  'downloaded_voices.row_desc': 'Free space on this device by deleting Orbis voices you no longer use.',
  'downloaded_voices.manage': 'Manage downloads',
  'downloaded_voices.title': 'Downloaded voices',
  'downloaded_voices.intro': 'Orbis voices on this device.',
  'downloaded_voices.none': 'No Orbis voices are downloaded on this device.',
  'downloaded_voices.size': '~{{size}} MB',
  'downloaded_voices.total': 'Total: ~{{size}} MB',
  // The row says which voice; the trash button's tooltip says why it can't be deleted.
  'downloaded_voices.selected_live': 'Selected live voice',
  'downloaded_voices.select_another_to_delete': 'Select another live voice to delete this one',
  'downloaded_voices.delete_named': 'Delete {{name}}',
  'downloaded_voices.delete_title': 'Delete {{name}}?',
  'downloaded_voices.delete_confirm': 'This frees ~{{size}} MB on this device.',
  'downloaded_voices.delete_recording_voice':
    'It is your voice for new recordings, so the next recording will ask for it.',
  'listening_page.voice_prev': 'Previous voice',
  'listening_page.voice_next': 'Next voice',
  'listening_page.select_live_voice': 'Select live voice',
  'listening_page.orbis_voices': 'Orbis voices',
  'listening_page.orbis_voices_desc':
    'Neural voices that run on this device and work offline. Higher quality; each is a one-time download.',
  'listening_page.voice_preview_sample': 'This is what it sounds like reading your books.',
  'listening_page.system_voices': 'System voices',
  'listening_page.system_voices_desc':
    'Voices provided by your operating system. No download needed; availability varies by device.',
  /** The page's opening line. "Select", not "Highlight": a highlight is an annotation you save, and a look-up
   *  runs from the selection picker before you have decided whether to mark anything. */
  'lookup_page.page_desc': 'Select text while you are reading to look up information without leaving the book.',
  'lookup_page.dictionaries': 'Offline dictionaries',
  /** Each row's own description: what kind of book it is, which is what decides whether you want it. */
  'lookup_page.webster_desc': 'Historical English, with etymologies and archaic senses. Suits older books.',
  'lookup_page.wordnet_desc': 'Modern English, with brief definitions and example sentences.',
  'lookup_page.downloaded': 'Downloaded · {{size}} MB',
  'lookup_page.about_size': 'About {{size}} MB.',
  'lookup_page.downloading': 'Downloading…',
  'lookup_page.download': 'Download',
  'lookup_page.removed': 'Dictionary removed',
  'lookup_page.download_done': 'Dictionary downloaded',
  'lookup_page.download_failed': 'Download failed — check your connection and try again',
  // A pinned download whose bytes did not match: trying again fetches the same file, so it gets its own words.
  'lookup_page.download_wrong_file': 'The downloaded file isn’t the one Orbis Reader expects, so it wasn’t saved.',
  'lookup_page.sections': 'Look-up sections',
  'lookup_page.sections_desc': "Reorder the sections or hide the ones you don't use. At least one must stay visible.",
  'lookup_page.section_min_one': 'At least one section must stay visible.',
  'lookup_page.web_search': 'Search destinations',
  /**
   * **No mechanism, and no rule the row can state itself.** "Reorder them with the arrows" would name one of two ways
   * — the list has drag handles too — and "built-in ones cannot be deleted" is plain from a row with no trash.
   * The minimum stays, though: unlike a section, a destination row has no free description slot to carry it —
   * `desc` holds the URL — so without this line nothing warns you before the notice does.
   */
  'lookup_page.web_destinations_desc':
    'The active destinations appear in the “Search the web” section. You can reorder them and add your own. At least one must stay active.',
  'lookup_page.dest_min_one': 'At least one destination must stay active.',
  'lookup_page.add_destination': 'Add a destination',
  'lookup_page.delete_destination_title': 'Delete destination?',
  'lookup_page.delete_destination_confirm': '“{{name}}” will be removed from the Look-up dialog.',
  'lookup_page.no_destinations': 'No search destinations. Add one to search the web from a look-up.',
  'lookup_page.move_up': 'Move up',
  'lookup_page.move_down': 'Move down',
  'lookup_page.destination_name': 'Name',
  'lookup_page.destination_url': 'Search URL',
  'lookup_page.destination_url_desc': 'The address that runs the search, with {{ph}} where the selected text goes.',
  'lookup_page.edit': 'Edit',
  'lookup_page.edit_destination': 'Edit destination',
  'lookup_page.invalid_name': 'Enter a name.',
  'lookup_page.invalid_url': 'URL must start with http:// or https:// and contain {{ph}}.',
  'lookup_page.destination_added': 'Destination added',

  // ── Library (docs/design/library.md) ────────────────────────────────────────────
  'library.title': 'Library',
  'library.open_title_note': 'Open title note',
  'library.mark_title_note': 'Mark this note as a title note',
  'library.marked_title_note': 'The library can see this note now.',
  'library.catalog_this_book': 'Catalog this book',
  'library.refresh_cover': 'Take the cover from this book again',
  'library.generate_cover': 'Replace the cover with a generated one',
  'library.cover_refreshed': 'Cover saved to {{path}}',
  'library.cover_refresh_failed': 'No cover could be made for this book.',
  'library.open': 'Open the library',
  'library.count': '{{count}} titles',
  'library.count_showing': 'Showing {{shown}} of {{count}}',
  'library.count_one': '1 title',
  'library.count_records': '{{count}} reading records',
  'library.count_records_one': '1 reading record',
  'library.collection_empty': 'Nothing in this collection yet.',
  'library.continue': 'Recently opened titles',
  'library.recordings': 'Ready to listen',
  'library.recent': 'Recently added',
  'library.pick': 'From your collection',
  'library.search': 'Search',
  'library.search_placeholder': 'Title, author or series',
  'library.search_hint': 'Type to search your library.',
  'library.search_none': 'Nothing matches.',
  'library.pick_again': 'Pick another',
  'library.system_dashboard': 'Library',
  'library.system_collection': 'All titles',
  'library.system_record_collection': 'All reading records',
  'library.switch_dashboard': 'Switch dashboard',
  'library.widget_scoped': '{{label}} · {{collection}}',
  'library.widget_collection': 'Collection',
  'library.records': 'Reading records',
  'library.search_records_placeholder': 'Search your highlights, notes and bookmarks',
  'library.search_records_hint': 'Type to search the passages, your notes, and the books they came from.',
  'library.record_untitled': 'Untitled record',
  'library.record_at_location': 'Location {{loc}}',
  'library.record_open_passage': 'Open the book here',
  'library.record_open_book': 'Open the book',
  'library.record_open_note': 'Open the record note',
  'library.record_book_missing': 'The book this came from is not in the vault',
  'library.record_orphaned': 'Annotation deleted',
  'library.show_as_list': 'List view',
  'library.show_as_covers': 'Cover view',
  'library.show_as_table': 'Table view',
  'library.show_all': 'Show all',
  // A collection that groups by nothing still summarizes — to one row, which is how much of it there is.
  'library.summary_all': 'All',
  'library.count_groups': '{{count}} categories',
  'library.count_groups_one': '1 category',
  'library.count_showing_groups': 'Showing {{shown}} of {{count}} categories',
  'library.summary': 'Summary',
  'library.summary_label': '{{collection}} by {{field}}',
  'library.summary_row': '{{label}}, {{count}}',
  'library.summary_row_empty': '{{label}}, none',
  'library.summary_total': 'Total',
  'library.summary_in': 'In collection',
  'library.no_widgets': 'This dashboard has no widgets yet.',
  'library.collection_missing': 'This widget points at a collection that no longer exists.',
  'library.catalog_title': 'Titles missing from your library',
  'library.catalog_folder': 'Folder for new title notes',
  'library.alert_uncataloged': '{{count}} books in your vault have no title note.',
  'library.alert_uncataloged_one': 'One book in your vault has no title note.',
  'library.alert_review': 'Review',
  'library.alert_dismiss': 'Dismiss',
  'library.catalog_scanning': 'Reading {{done}} of {{total}} books…',
  'library.catalog_group_new': 'Uncataloged books',
  // The same words the dashboard notice and the settings row use for the same fact, so one surface reads like the
  // next rather than like three features that each learned about this separately.
  // One book someone asked about: the button names the action, and a notice reports it.
  'library.catalog_apply_one': 'Catalog',
  'library.catalog_apply_attach_one': 'Attach',
  'library.catalog_attached_one': 'Attached {{file}} to {{note}}',
  'library.catalog_group_new_desc':
    'Each book must be linked to a title note to appear on library dashboards. {{count}} are not. A note is created in the folder above for each book selected.',
  'library.catalog_group_new_desc_one':
    'Each book must be linked to a title note to appear on library dashboards. 1 is not. A note is created in the folder above for each book selected.',
  'library.catalog_group_matched': 'Books that may already have a title note',
  'library.catalog_group_matched_desc':
    '{{count}} books look like a title note you already have. Choose Attach to link the file to that note, or New note to catalog the file on its own.',
  'library.catalog_group_matched_desc_one':
    '1 book looks like a title note you already have. Choose Attach to link the file to that note, or New note to catalog the file on its own.',
  'library.catalog_matched': 'Note “{{title}}” · {{why}}',
  'library.catalog_set_all': 'Set all rows',
  'library.catalog_set_all_none': '—',
  'library.catalog_select_all': 'Select all {{count}}',
  'library.catalog_select_none': 'Clear all {{count}}',
  'library.catalog_show_more': 'Show {{count}} more',
  'library.catalog_apply': 'Catalog {{count}}',
  'library.catalog_apply_attach': 'Attach {{count}}',
  'library.catalog_apply_adopt': 'Update {{count}}',
  'library.catalog_apply_nothing': 'Nothing selected',
  'library.catalog_group_adopt': 'Potential title notes missing a property',
  'library.catalog_group_adopt_desc':
    '{{count}} notes have other title note properties but are missing orbis_note: title, so the library does not display them. Updating them adds the missing property so they appear in the library.',
  'library.catalog_adopted': 'Updated',
  'library.catalog_adopt_first_title': 'Update first?',
  'library.catalog_adopt_first':
    'Books were matched against your notes before any of those notes were title notes, so {{create}} books are set to get a new note even though one of the {{adopt}} you are updating may already describe them. Update those notes first, then review the books again.',
  'library.catalog_adopt_only': 'Update {{count}} and stop',
  'library.catalog_review_again': 'Review the books again',

  'library.catalog_action_attach': 'Attach',
  // A sentence per count, each with its own singular, and none for a zero — "Wrote 1 title notes and attached 0
  // files" was the one-sentence version.
  'library.catalog_result_wrote': 'Wrote {{count}} title notes.',
  'library.catalog_result_wrote_one': 'Wrote 1 title note.',
  'library.catalog_result_attached_files': 'Attached {{count}} files.',
  'library.catalog_result_attached_files_one': 'Attached 1 file.',
  'library.catalog_result_updated_notes': 'Updated {{count}} title notes.',
  'library.catalog_result_updated_notes_one': 'Updated 1 title note.',
  'library.catalog_result_nothing': 'Nothing was written.',
  'library.catalog_result_stopped': 'Stopped with {{count}} still to go.',
  'library.catalog_result_created': 'Written',
  'library.catalog_result_attached': 'Attached',
  'library.catalog_result_failed': 'Could not be done',
  'library.catalog_result_more': 'and {{count}} more',
  'library.catalog_action_create': 'New note',
  'library.catalog_nothing': 'Every book in your vault has a title note, and every note that looks like one says so.',
  'library.catalog_covers': 'Save cover images',
  'library.catalog_covers_desc': 'Extract each book’s cover into your covers folder. Around 40 KB per book.',
  'library.catalog_pick_folder': 'Pick a folder to write the notes into.',
  'library.cataloging': 'Cataloging {{done}} of {{total}}…',
  'library.catalog_cancel': 'Stop',
  // Lower case: these are read inside a sentence — "May match “X” — same title and author" — rather than standing
  // on their own.
  'library.match_reason_sibling': 'same name and folder',
  'library.match_reason_isbn': 'same ISBN',
  'library.match_reason_title_author': 'same title and author',
  'library.read': 'Read',
  'library.listen': 'Listen',
  'library.listen_recorded': 'Listen to the recording',
  'library.open_note': 'Open title note',
  'library.more_actions': 'More',
  // **No strings for the four reading statuses.** Display names here would reach only Orbis's own menus, while the
  // Fields page's value list, the collection editor's Value dropdown and every group heading on a dashboard show
  // `interested`, `reading`, `read` and `abandoned` — two vocabularies for one value. A status reads as whatever
  // the note holds, and naming one is the Fields page's job — the same terms a status the reader adds is offered on.
  'library.show_data': 'Reading data',
  'library.rating': 'Rating',
  'library.rating_set': 'Rating: {{value}}',
  'library.reading_status': 'Reading status',
  'library.status_set': 'Reading status: {{value}}',
  'library.set_reading_status': 'Set reading status',
  'library.rate_book': 'Rate this book',
  'library.status_now': 'Reading status set to {{value}}',
  'library.status_now_cleared': 'Reading status cleared',
  'library.rating_now': 'Rated {{value}} out of 5',
  'library.rating_now_cleared': 'Rating cleared',
  'library.cataloged_first': 'Cataloged {{title}}',
  'library.catalog_note_failed': 'Could not write a title note for {{title}}',
  'library.open_source': 'Open the title link',
  'library.open_source_failed': 'Could not open {{url}}',
  // One page, because a widget draws from a collection: arranging a dashboard and defining what it shows are the
  // same sitting, so they are not a level apart.
  'library_page.content_page': 'Dashboards and collections',
  'library_page.content_page_desc': 'Arrange dashboards and widgets to show titles from collections.',
  'library_page.title_collections': 'Title note collections',
  'library_page.collections_desc': 'A named set of titles, defined by filters. Every widget draws from one.',
  'library_page.record_collections': 'Reading record collections',
  'library_page.record_collections_desc':
    'A named set of reading records — your passage selections, notes and bookmarks — defined by filters, for a widget to draw from.',
  'library_page.no_record_collections': 'No reading record collections yet.',
  'library_page.add_record_collection': 'Add a reading record collection',
  'library_page.no_collections': 'No collections. Add one to fill the library.',
  'library_page.add_title_collection': 'Add a title note collection',
  'library_page.new_title_collection': 'New title note collection',
  'library_page.edit_title_collection': 'Edit title note collection',
  'library_page.new_record_collection': 'New reading record collection',
  'library_page.edit_record_collection': 'Edit reading record collection',
  'library_page.collection_name': 'Name',
  'library_page.tab_filters': 'Filters',
  'library_page.tab_arrangement': 'Group by and sort',
  'library_page.rules_desc': 'A collection gathers the notes its filters describe.',
  'library_page.rules_desc_more':
    'Conditions in a filter can be required together or taken as alternatives, and a note lands on the collection if any filter claims it.',
  'library_page.match_all': 'Match all of',
  'library_page.match_any': 'Match any of',
  'library_page.or': 'or',
  'library_page.add_rule': 'Add a condition',
  'library_page.add_set': 'Add another filter',
  'library_page.remove_set': 'Remove filter',
  'library_page.rule_value': 'Value',
  'library_page.edit_rule': 'Edit condition',
  'library_page.new_rule': 'Add a condition',
  'library_page.rule_field': 'Look at',
  'library_page.rule_operator': 'Condition',
  'library_page.rule_matches': 'Matches {{count}} titles',
  'library_page.rule_matches_one': 'Matches 1 title',
  'library_page.rule_matches_records': 'Matches {{count}} reading records',
  'library_page.rule_matches_record_one': 'Matches 1 reading record',
  'library_page.rule_matches_none': 'Matches nothing',
  'library_page.rule_pick_value': 'Choose a value',
  'library_page.rule_no_rules': 'No conditions yet.',
  'library_page.delete_rule': 'Delete condition',
  'library_page.field_folder': 'Folder',
  'library_page.field_tag': 'Tag',
  'library_page.op_under': 'is under',
  'library_page.op_directly_in': 'is directly in',
  'library_page.op_is': 'is',
  'library_page.op_is_not': 'is not',
  'library_page.op_contains': 'contains',
  'library_page.ops_general': 'General',
  'library_page.ops_numbers': 'Numbers',
  'library_page.ops_dates': 'Dates',
  'library_page.op_in_last_days': 'is in the last',
  'library_page.op_older_than_days': 'is more than',
  'library_page.op_in_period': 'is in',
  'library_page.op_before': 'is before',
  'library_page.op_after': 'is after',
  'library_page.op_on_date_annually': 'is on this date, any year',
  'library_page.op_greater_than': 'is more than',
  'library_page.op_at_least': 'is at least',
  'library_page.op_less_than': 'is less than',
  'library_page.op_at_most': 'is at most',
  'library_page.rule_days': '{{n}} days',
  'library_page.rule_days_ago': '{{n}} days ago',
  'library_page.period_this_week': 'this week',
  'library_page.period_last_week': 'last week',
  'library_page.period_this_month': 'this month',
  'library_page.period_last_month': 'last month',
  'library_page.period_this_quarter': 'this quarter',
  'library_page.period_last_quarter': 'last quarter',
  'library_page.period_this_year': 'this year',
  'library_page.period_last_year': 'last year',
  'library_page.op_exists': 'has a value',
  'library_page.op_not_exists': 'has no value',
  'library_page.rules_count': '{{count}} conditions',
  'library_page.rules_none': 'Every title',
  'library_page.rules_none_records': 'Every reading record',
  'library_page.rules_count_one': '1 condition',
  'library_page.matches': 'Matches {{count}} titles right now',
  'library_page.matches_one': 'Matches 1 title right now',
  'library_page.matches_records': 'Matches {{count}} reading records right now',
  'library_page.matches_record_one': 'Matches 1 reading record right now',
  'library_page.matches_none': 'Matches nothing right now — check the value on each condition.',
  'library_page.collection_copy': 'Make a copy',
  'library_page.collection_copy_suffix': '{{name}} copy',
  'library_page.value_drag': 'Drag to reorder',
  // One label per list, rather than borrowing the sort levels' words: "Move this sort field earlier" over a list of
  // field values would describe a different control on a different tab.
  'library_page.value_up': 'Move this value up',
  'library_page.value_down': 'Move this value down',
  'library_page.property_up': 'Move this property up',
  'library_page.property_down': 'Move this property down',
  'library_page.properties_library': 'Properties the library reads',
  'library_page.properties_note': 'About the note',
  'library_page.properties_other': 'Other properties in your notes',
  'library_page.values_heading': 'Value names and order',
  'library_page.value_property_label': 'Name from the property',
  'library_page.value_property_unnamed': 'Not named — shown as the value itself',
  'library_page.value_collection_label': 'Name in this collection',
  'library_page.value_collection_desc': 'Leave it empty to use the name from the property.',
  'library_page.values_desc':
    'Rename the values of the property above and drag them into the order you want. A value that turns up later joins the end of the list.',
  // Beside Reset order, shown once this collection orders the values its own way.
  'library_page.values_revert': 'Revert to the property’s order.',
  'library_page.values_reset': 'Reset order',
  'library_page.group_by': 'Group by',
  'library_page.sort_by': 'Sort by',
  // The direction a sort level runs, named for its field — see `orderWords`.
  'library_page.sort_direction': '{{order}} — select to reverse',
  'library_page.sort_up': 'Move this sort property earlier',
  'library_page.sort_drag': 'Drag to reorder sort properties',
  'library_page.sort_down': 'Move this sort property later',
  'library_page.group_none': 'Nothing',
  // Not "sort", which in a collection means the order of the TITLES. These order the groups themselves.
  'library_page.time_frame_none': 'Values as they are written',
  'library_page.time_frame_year': 'By year',
  'library_page.time_frame_quarter': 'By quarter',
  'library_page.time_frame_month': 'By month',
  'library_page.time_frame_week': 'By week',
  'library_page.time_frame_day': 'By day',
  'library_page.time_frame_month_of_year': 'By month of the year',
  'library_page.time_frame_decade': 'By decade',
  'library_page.time_frame_aging': 'By how long ago',
  // A field's own order and its reverse, in words for that field: Group order offers both, and Sort by's direction
  // button says which one it is running — see `orderWords`.
  'library_page.order_oldest_first': 'Oldest first',
  'library_page.order_newest_first': 'Newest first',
  'library_page.order_january_first': 'January to December',
  'library_page.order_december_first': 'December to January',
  'library_page.order_lowest_first': 'Lowest first',
  'library_page.order_highest_first': 'Highest first',
  // Which list the order comes from, said outright: the field's, or this collection's once it has one of its own.
  'library_page.order_property': 'In the property’s order',
  'library_page.order_property_reversed': 'In the property’s order, reversed',
  'library_page.order_collection': 'In this collection’s order',
  'library_page.order_collection_reversed': 'In this collection’s order, reversed',
  'library_page.order_a_z': 'A to Z',
  'library_page.order_z_a': 'Z to A',
  'library_page.group_order_most': 'Groups by size, most first',
  'library_page.group_order_fewest': 'Groups by size, fewest first',
  'library_page.key_title': 'Title',
  'library_page.key_author': 'Author',
  'library_page.key_series': 'Series',
  'library_page.key_rating': 'Rating',
  'library_page.key_tag': 'Tag',
  'library_page.key_folder': 'Folder',
  'library_page.key_letter_title': 'First letter of title',
  'library_page.key_letter_author': 'First letter of author surname',
  'library_page.key_last_opened': 'Last opened',
  'library_page.key_series_sort': 'series (reading order)',
  'library_page.add_sort': 'Add another sort property',
  'library_page.remove_sort': 'Remove this sort property',
  'library.group_none_author': 'No author',
  'library.group_none_series': 'No series',
  'library.group_none_type': 'No type',
  'library.group_none_tag': 'No tags',
  'library.group_none_other': 'Everything else',
  'library.group_none_date': 'No date',
  // Named for what the time frame needed and the note did not say — a record dated `2017` has a date and no month.
  'library.group_none_month': 'No month',
  'library.group_none_full_date': 'No full date',
  'library_page.enabled': 'Enable the library',
  // **One line per row on this page.** Five or six lines on a phone is a paragraph asking to be read before a
  // switch can be flipped. What a dashboard IS, what a cover costs, which tools write a title note —
  // that is documentation, and it goes in the guide.
  'library_page.enabled_desc': 'Show your titles on dashboards, opened from the ribbon icon.',
  'library_page.widget_titles': '{{count}} titles',
  'library_page.widget_titles_one': '1 title',
  'library_page.widget_titles_all': 'all titles',
  'library_page.dashboards': 'Dashboards',
  'library_page.dashboards_desc':
    'An ordered set of widgets, each showing a collection of your titles a different way.',
  'library_page.add_dashboard': 'Add a dashboard',
  // What the chevron on a dashboard row says. "Widgets" rather than "dashboard": the row is already the dashboard,
  // and what opening it reveals is the list.
  'library_page.show_widgets': 'Show widgets',
  'library_page.hide_widgets': 'Hide widgets',
  'library_page.no_dashboards': 'No dashboards. Add one to choose what the library shows.',
  'library_page.dashboard_name': 'Name',
  'library_page.new_dashboard': 'New dashboard',
  'library_page.dashboard_deleted': 'Dashboard deleted',
  'library_page.delete_dashboard_title': 'Delete dashboard?',
  'library_page.delete_dashboard_confirm':
    '“{{name}}” and the widgets on it will be removed. The collections they show are not affected.',
  'library_page.delete_collection_title': 'Delete collection?',
  'library_page.delete_collection_confirm':
    '“{{name}}” and its conditions will be removed. The notes it gathers are not touched.',
  'library_page.dashboard_system': 'Provided with Orbis Reader — copy it to make your own',
  'library_page.collection_system': 'Provided with Orbis Reader — every title in the vault',
  'library_page.record_collection_system': 'Provided with Orbis Reader — every reading record in the vault',
  'library_page.dashboard_active': 'Showing now',
  'library_page.dashboard_disabled': 'Disabled',
  'library_page.dashboard_copy': 'Make a copy',
  'library_page.dashboard_copied': 'Copy made',
  'library_page.dashboard_copy_suffix': '{{name}} copy',
  'library_page.dashboard_widgets': '{{count}} widgets',
  'library_page.dashboard_widgets_one': '1 widget',
  'library_page.dashboard_no_widgets': 'No widgets yet.',
  'library_page.widgets': 'Widgets',
  'library_page.add_widget': 'Add a widget',
  'library_page.edit_widget': 'Edit widget',
  'library_page.delete_widget_title': 'Delete widget?',
  'library_page.delete_widget_confirm': '“{{name}}” will be removed from this dashboard.',
  'library_page.widget_system': 'Provided with Orbis Reader — it can be disabled but not removed',
  'library_page.view_widget': 'View widget',
  'library_page.dashboard_provided_note':
    'This dashboard is provided with Orbis Reader and is read-only. Make a copy of it to have one you can change.',
  'library_page.widget_kind': 'Shows',
  'library_page.widget_kind_titles': 'Titles',
  'library_page.widget_kind_records': 'Reading records',
  'library_page.widget_kind_continue': 'Recently opened',
  'library_page.widget_kind_recordings': 'Recorded audio',
  'library_page.widget_kind_recent': 'Recently added',
  'library_page.widget_kind_pick': 'Random title',
  'library_page.widget_kind_summary': 'Summary',
  'library_page.widget_kind_search': 'Search',
  // The sentence behind each short name, where there is room for one.
  'library_page.widget_hint_titles': 'Every title in this collection, arranged the way the collection says.',
  'library_page.widget_hint_records':
    'Every reading record in this collection. Selecting one opens the book at that passage.',
  'library_page.widget_hint_search': 'A box that searches titles, authors and series — within this collection.',
  'library_page.widget_hint_continue': 'Titles you have opened, most recently opened first.',
  'library_page.widget_hint_recent': 'Titles by the date their note carries, newest first.',
  'library_page.widget_hint_recordings': 'Titles with generated audio beside them, ready to listen offline.',
  'library_page.widget_hint_pick': 'One title from the collection, drawn at random. “Pick another” draws again.',
  'library_page.widget_pool': 'Titles shown',
  // The one fact the row cannot be read to answer: flagging a book to read takes it OUT of the suggestions, because
  // flagging is a decision. Why that is right, and what to do instead, is documentation rather than description.
  'library_page.widget_pool_desc': 'Skip titles that carry any status, including “{{status}}”.',
  'library_page.widget_pool_no_status': 'Titles with no reading status',
  'library_page.widget_pool_any': 'Any title',
  // No description: the name is the rule, and what a row with no file does is one tap from finding out.
  'library_page.widget_requires_file': 'Only titles with a book file',
  'library_page.widget_hint_summary':
    'Counts the collection by its grouping — one row per value, tapped to see what is in it. Set the grouping on the collection.',
  'library_page.widget_collection_desc': 'Which titles this widget draws from.',
  'library_page.widget_order': 'Order',
  'library_page.widget_order_desc': 'How results are sorted.',
  'library_page.widget_order_match': 'Best match',
  'library_page.widget_order_collection': 'The collection’s order',
  'library_page.widget_label': 'Heading',
  'library_page.widget_label_desc': 'Leave empty to use the heading shown.',
  'library_page.widget_collection': 'Collection',
  'library_page.widget_tab_general': 'General',
  'library_page.widget_tab_view': 'View',
  'library_page.widget_view': 'View',
  'library_page.widget_view_desc': 'Show these titles as rows or as cover art.',
  'library_page.widget_view_list': 'List',
  'library_page.widget_view_covers': 'Covers',
  'library_page.widget_expand_none': 'No expanded view',
  'library_page.widget_count': 'How many titles',
  'library_page.widget_count_desc': 'Leave empty to show all of them.',
  'library_page.widget_count_all': 'All',
  'library_page.widget_expand': 'Expanded view',
  'library_page.widget_expand_desc': 'Offers a “Show all” button that shows everything in this widget full screen.',
  'library.sort_by': 'Sort by {{label}}',
  'library.sorted_asc': 'Sorted by {{label}}, ascending',
  'library.sorted_desc': 'Sorted by {{label}}, descending',
  'library_page.widget_view_summary': 'Category view',
  'library_page.widget_view_summary_desc': 'How the titles look when you open one of the categories.',
  'library_page.widget_view_table': 'Table',
  'library_page.widget_tab_properties': 'Properties',
  'library_page.widget_properties_desc': 'The properties shown for each title.',
  'library_page.widget_properties_desc_records': 'The properties shown for each reading record.',
  // Beside Reset properties, which stays two words because this says what it reverts to.
  'library_page.widget_properties_revert': 'Revert property selections to authors and series.',
  'library_page.widget_properties_revert_records': 'Revert property selections to book_title and chapter.',
  'library_page.widget_properties_none': 'Showing nothing beside the title.',
  'library_page.widget_properties_add': 'Add a property',
  'library_page.widget_properties_reset': 'Reset properties',
  'library_page.widget_property_remove': 'Remove this property',
  'library_page.widget_totals': 'Totals row',
  'library_page.widget_totals_desc':
    'Ends the summary with a count. The two totals differ where a title can be in more than one row.',
  'library_page.widget_totals_off': 'None',
  'library_page.widget_totals_sum': 'Sum of the rows',
  'library_page.widget_totals_collection': 'Items in the collection',
  'library_page.widget_empty_groups': 'Show unused values',
  'library_page.widget_empty_groups_desc': 'Lists values nothing in the collection uses, counted as zero.',
  'library_page.widget_no_collections': 'Add a collection first — a widget needs one to show.',
  'library_page.records_folder': 'Folder for new title notes',
  'properties_page.page': 'Properties',
  'properties_page.page_desc': 'Match library properties to the properties in your own notes.',
  'properties_page.title_properties': 'Title note properties',
  'properties_page.title_properties_desc': 'Properties the library reads from title notes.',
  'properties_page.record_properties': 'Reading record properties',
  'properties_page.record_properties_desc': 'Properties the library reads from reading records.',
  'properties_page.absent_titles': 'Not in your title notes',
  'properties_page.absent_records': 'Not in your reading records',
  'properties_page.custom': 'Custom properties',
  'properties_page.custom_desc':
    'Other properties in your notes that you use on dashboards. Add one to give it aliases, value names or a column heading.',
  'properties_page.custom_none': 'No custom properties yet.',
  'properties_page.absent': 'Not in your notes',
  'properties_page.add': 'Add a property',
  'properties_page.edit': 'Edit property',
  'properties_page.forget': 'Forget this property',
  'properties_page.reset': 'Reset this property',
  'properties_page.alias_list': 'Aliases: {{keys}}',
  'properties_page.values_count': '{{count}} values',
  'properties_page.property': 'Property',
  'properties_page.property_desc':
    'The property name in your notes that this property reads. Type a new one, or pick one your notes already use.',
  'properties_page.property_placeholder': 'use_count',
  'properties_page.property_pick': 'Pick a property name from your notes…',
  'properties_page.property_needed': 'Pick which property this is about.',
  // What a table column of each field is called, before anyone renames anything. Humanising the key would say
  // "Isbn" and "Source url".
  'field_heading.title': 'Title',
  'field_heading.authors': 'Authors',
  'field_heading.series': 'Series',
  'field_heading.series_index': 'Series number',
  'field_heading.type': 'Type',
  'field_heading.genre': 'Genre',
  'field_heading.publisher': 'Publisher',
  'field_heading.publication_date': 'Published',
  'field_heading.language': 'Language',
  'field_heading.subjects': 'Subjects',
  'field_heading.tags': 'Tags',
  'field_heading.isbn': 'ISBN',
  'field_heading.rating': 'Rating',
  'field_heading.cover': 'Cover',
  'field_heading.files': 'Files',
  'field_heading.reading_status': 'Reading status',
  'field_heading.date_read': 'Date read',
  'field_heading.added': 'Added',
  'field_heading.source': 'Source',
  'field_heading.source_id': 'Source ID',
  'field_heading.source_url': 'Source URL',
  'field_heading.source_notes': 'Source notes',
  'field_heading.kind': 'Kind',
  'field_heading.excerpt': 'Passage',
  'field_heading.note_text': 'Note',
  'field_heading.mark': 'Mark',
  'field_heading.book_title': 'Book',
  'field_heading.author': 'Author',
  'field_heading.loc': 'Location',
  'field_heading.orphaned': 'Annotation deleted',
  'properties_page.column_row': 'Column heading: {{label}}',
  'properties_page.label': 'Column heading',
  'properties_page.label_desc':
    "The heading for this property's column in a dashboard table. Leave it empty for a heading made from the property's name.",
  'properties_page.description': 'Description',
  'properties_page.description_desc': 'What this property is for. Shown under its name in the list.',
  'properties_page.description_placeholder': 'How many times I have read it',
  'properties_page.aliases': 'Aliases',
  'properties_page.aliases_desc': 'Other property names in your notes that mean the same thing as this property.',
  'properties_page.add_alias': 'Add an alias…',
  'properties_page.tab_property': 'Property',
  'properties_page.tab_values': 'Values',
  'properties_page.value_edit': 'Edit value',
  'properties_page.value_value': 'Value',
  'properties_page.value_label': 'Display name',
  'properties_page.value_label_desc':
    'What this value reads as on your dashboards. Leave it empty to use the value itself.',
  'properties_page.value_enabled': 'Offer this value',
  'properties_page.value_enabled_desc':
    'Turn it off to keep it out of menus and pickers. Notes that use it are left alone.',
  'properties_page.move': 'Move',
  'properties_page.move_top': 'To the top',
  'properties_page.move_bottom': 'To the bottom',
  'properties_page.shown_as_row': 'Display name: {{label}}',
  'properties_page.values_desc':
    'How this property reads when a dashboard groups or sorts by it. On the left is the value as your notes store it; name it on the right to change the heading it gets, and order them the way the groups should appear.',
  'properties_page.has_values': 'Name this property’s values',
  'properties_page.has_values_desc':
    "Adds a Values tab, where you name and order this property's values. For a property with a few set values, like a genre or a status.",
  'properties_page.none_value': 'No value',
  // Named for what was counted, each with its singular — see `valueUsedText`.
  'properties_page.value_used': 'In {{count}} titles',
  'properties_page.value_used_one': 'In 1 title',
  'properties_page.value_used_records': 'In {{count}} reading records',
  'properties_page.value_used_record_one': 'In 1 reading record',
  'properties_page.value_used_notes': 'In {{count}} notes',
  'properties_page.value_used_note_one': 'In 1 note',
  'properties_page.value_unused': 'Not in your notes',
  'properties_page.value_placeholder': 'Value in your notes',
  'properties_page.add_value': 'Add a value',
  'properties_page.purpose_title':
    'The name that identifies a title note on every list in the library. Required for the title note to be displayed.',
  'properties_page.purpose_authors': 'Names of the individuals who authored the title.',
  'properties_page.purpose_series': 'The name of the series that the title is a part of.',
  'properties_page.purpose_series_index': 'The title’s place in the series order. Used when sorting by series.',
  'properties_page.purpose_type': 'The medium. Cataloging writes book.',
  'properties_page.purpose_genre': 'What sort of work the title is: novel, reference, documentary.',
  'properties_page.purpose_publisher': 'Who published it.',
  'properties_page.purpose_publication_date': 'When it was published.',
  'properties_page.purpose_language': 'What language it is written in.',
  'properties_page.purpose_subjects': 'What it is about.',
  'properties_page.purpose_tags': 'Tags in the note, which collections can gather on.',
  'properties_page.purpose_isbn': 'Its ISBN. Cataloging uses it to match a loose file to a title you already have.',
  'properties_page.purpose_rating': 'Your rating, 0 to 5 in halves. Zero is a rating — not the same as having none.',
  'properties_page.purpose_cover': 'The image a cover tile shows.',
  'properties_page.purpose_files':
    'The book files this title opens. Without one there is nothing to read or listen to.',
  'properties_page.purpose_reading_status':
    'Whether you are interested, reading, finished or abandoned. Set from the ⋯ menu on any title.',
  'properties_page.purpose_date_read': 'When you finished it. Written for you when you mark a book read.',
  'properties_page.purpose_added': 'When it joined your library.',
  'properties_page.purpose_source':
    'Where the title came from: Calibre, Project Gutenberg, the web. Cataloging writes vault.',
  'properties_page.purpose_source_id': 'The unique identifier for the title in the source it came from.',
  'properties_page.purpose_kind': 'Which kind of record this is: a passage selection, a note, or a bookmark.',
  'properties_page.purpose_excerpt': 'The passage the record marks. Rows and table columns lead with it.',
  'properties_page.purpose_note_text': 'The words you wrote, when the record is a note of your own.',
  'properties_page.purpose_mark':
    'The name of the mark the passage was highlighted with. Empty for a note without one, and for every bookmark.',
  'properties_page.purpose_book_title': 'The name of the book the record came from.',
  'properties_page.purpose_author': 'Who wrote the book the record came from.',
  'properties_page.purpose_chapter': 'The chapter the passage is in.',
  'properties_page.purpose_loc': 'Where in the book the passage is, as a location number.',
  'properties_page.purpose_created': 'When the annotation was made.',
  'properties_page.purpose_orphaned':
    'Whether the annotation this record came from has been deleted. Written instead of removing a record you have written in, and cleared if the annotation comes back.',
  'properties_page.purpose_source_notes':
    'The notes a converted book was made from. Written when a note or a folder of notes becomes an EPUB, so the note it came from links back to the book it became.',
  'properties_page.purpose_source_url': 'A link that opens the title in its source.',
  'library_setup.title': 'Enable the library',
  'library_setup.desc':
    'Configure these options to set up the library for the first time; they can be changed later in settings.',
  'library_setup.q_folder': 'Where should title notes go?',
  'library_setup.records_folder_desc':
    'The library relies on title notes to show titles on dashboards. Each title note contains the metadata for one book. Cataloging and the EPUB converter write title notes into this folder.',
  'library_setup.covers': 'Save cover images',
  'library_setup.covers_desc':
    'Some dashboard widgets show cover images. Store each book’s cover in your vault, about 40 KB a book. Covers are extracted from book files; books without one get a generated cover showing the title and author.',
  'library_setup.covers_folder': 'Covers folder',
  'library_setup.covers_folder_desc': 'Where the extracted images are kept.',
  'library_setup.turn_on': 'Enable',
  // **A status, not an alarm.** Every case leads with how many title notes the library can see, because that is the
  // question the row answers whether anything is wrong or not. What a title note IS belongs in the guide, not in a
  // settings row nobody can act on.
  'library_page.status': 'Library status',
  'library_page.status_desc':
    '{{titles}} title notes. {{notes}} notes are missing a required property, and {{books}} books are not linked to a valid title note, so they do not appear on library dashboards. Review them to fix both.',
  'library_page.status_notes_only':
    '{{titles}} title notes. {{notes}} notes are missing a required property, so the titles they describe do not appear on library dashboards. Review them to fix it.',
  'library_page.status_books_only':
    '{{titles}} title notes. {{books}} books in your vault are not linked to a valid title note, so they do not appear on library dashboards. Review them to write or attach notes.',
  'library_page.status_none': '{{titles}} title notes. Every book has one, and every note that looks like one says so.',
  'library_page.issues_review': 'Review',
  'library.catalog_menu_intro': 'Two issues may be keeping titles off library dashboards. Start with the notes.',
  'library.catalog_menu_notes': 'Potential title notes missing a property',
  'library.catalog_menu_notes_desc':
    '{{count}} notes have other title note properties but are missing orbis_note: title, so the library does not display them. Books linked to these notes are counted as uncataloged below. Start here.',
  'library.catalog_menu_notes_only_desc':
    '{{count}} notes have other title note properties but are missing orbis_note: title, so the library does not display them.',
  'library.catalog_menu_books': 'Uncataloged books',
  'library.catalog_menu_books_desc':
    'Each book must be linked to a title note to appear on library dashboards. {{count}} are not. Many are probably linked to one of the notes above, so fixing the note is better than creating another one.',
  'library.catalog_menu_books_only_desc':
    'Each book must be linked to a title note to appear on library dashboards. {{count}} are not. Write a note for each, or attach the file to a title note already in the vault.',
  'library.catalog_menu_update': 'Update',
  'library.catalog_menu_review': 'Review',
  'library_page.uncataloged_alert': 'Show a notice when books are uncataloged',
  'library_page.uncataloged_alert_desc': 'Shown at the top of the dashboard, with a shortcut to the review.',
  'library_page.extract_covers': 'Save cover images',
  // The size stays: it is the one fact that decides the answer, and it is not in the guide when you are deciding.
  'library_page.extract_covers_desc': 'Keep a cover for each book, each about 40 KB.',
  'library_page.covers_folder': 'Covers folder',
  'library_page.covers_folder_default': 'Default: {{path}}',
  'library_page.covers_folder_desc': 'Where cover images are stored.',
  'library_page.records_folder_desc': 'Where new title notes are written.',
  'library_page.collection_added': 'Collection added',
  'library_page.collection_deleted': 'Collection deleted',
  'library_page.collection_in_use': 'Shown on “{{name}}” — remove that widget first.',
  'library_page.invalid_name': 'Enter a name.',
  'lookup.title': 'Look up: {{term}}',
  'lookup.looking_up': 'Looking up…',
  /**
   * Said in terms of the books this device holds.
   *
   * "No dictionary entry for X" reads as a fact about dictionaries in general; for a reader holding only the 1913
   * book it is usually a fact about 1913, and naming the book is what turns a dead end into a reason to take the
   * other one. The word itself is not repeated — the popup's own title is "Look up: X", an inch above.
   */
  'lookup.no_entry_in': 'Not in {{name}}.',
  'lookup.no_entry_either': 'Not in either dictionary.',
  'lookup.section_definition': 'Definition',
  // Each book's name without its year, which `dictionaryName` appends from the edition the asset was built from.
  // The year is part of the name on screen: which edition you are reading matters, and "Webster's" alone would
  // suggest the dictionary sold under that name today.
  'lookup.source_webster': 'Webster’s',
  'lookup.source_wordnet': 'WordNet',
  'lookup.pron_button': 'Pronunciation',
  'lookup.pron_tip_set': 'Spoken as “{{say}}”. Select to change.',
  'lookup.pron_tip_unset': 'Set how “{{word}}” is spoken',
  'lookup.pron_editor_title': 'Say “{{word}}” as',
  // The word with its respelling, since a respelling on its own means nothing: lower case and hyphenated, as the hint
  // advises, and a name the voice really does misread ("JOE-kwin") until it is respelled.
  'lookup.pron_placeholder': 'e.g. use wah-keen for Joaquin',
  // No apostrophe on purpose: espeak-ng is the phonemizer, and a typographic apostrophe (U+2019) in
  // a contraction is a suspect for mangling the start of the utterance. Plain words sidestep it.
  'lookup.pron_carrier': 'I will say {{word}} now.',
  'lookup.pron_hint': 'Spell it the way it should sound, then preview until it is right.',
  'lookup.pron_hint_more':
    'Hyphens help break syllables. Applies to every book and to new recordings. Chapters already recorded keep the old pronunciation until re-recorded.',
  'lookup.pron_preview_live': 'Live ({{voice}})',
  'lookup.pron_preview_kokoro': 'Kokoro ({{voice}})',
  'lookup.pron_preview_orbis': 'Orbis ({{voice}})',
  'lookup.pron_preview_failed': 'Could not preview with {{voice}}. A recording voice needs its server reachable.',
  'lookup.pron_active': 'Active — use this replacement when reading aloud',
  'lookup.pron_remove_confirm': 'Remove the replacement for “{{word}}”? It will be spoken normally again.',
  'lookup.pron_remove_keep': 'Keep',
  'lookup.section_vault': 'In your vault',
  'lookup.section_web': 'Search the web',
  'lookup.open_note': 'Open note: {{title}}',
  /**
   * The two vault searches, and they are written as a pair: same verb, the distinguishing word second.
   *
   * **Parallel because they do the same KIND of thing.** A noun phrase ("Files with X in the title") beside a verb
   * phrase ("Search vault for X") would make them look like two different sorts of control rather than a narrow
   * search and a broad one.
   *
   * **The distinguishing word comes early because `.orbis-lookup-action` ellipsizes rather than wraps.** A
   * shared opening of three or four words would truncate to two identical buttons on a phone, and the selection
   * sitting in the middle of the label makes that likelier the longer it is.
   *
   * **No count on either.** A count disagrees with the search it opens: notes named exactly the term are fewer than
   * the titles containing it, and every file the vault holds includes Orbis's own `.json` sidecars, which
   * Obsidian's search does not index. Matching it means mirroring which extensions Obsidian indexes —
   * undocumented, and different with every release and every plugin installed. The search states its own total.
   */
  'lookup.search_file_names': 'Search file names for “{{term}}”',
  /**
   * **"everything", because that is what it searches.** Obsidian's plain search matches file names AND file
   * contents, across every type it indexes — a `.base` file turns up in these results on its name alone, with
   * no match count beside it. So "note text" is wrong (it is not only notes) and "file contents" is wrong (it
   * is not only contents). The honest contrast with the row above is narrow against broad.
   */
  'lookup.search_vault': 'Search everything for “{{term}}”',
  'lookup.search_unavailable': 'Search is unavailable.',
  'lookup.speak': 'Speak',
  'lookup.speak_loading': 'Loading voice…',
  'lookup.stop': 'Stop',
  'lookup.speak_failed': 'Could not speak that — check your live voice in Settings → Listening.',
  'onboarding.title': 'Listen needs a voice',
  'onboarding.body':
    'Download a natural-sounding voice to hear your book read aloud. It stays on this device and works offline.',
  'onboarding.recommended': 'Recommended: {{name}} · ~{{size}} MB',
  'onboarding.your_voice': 'Your voice: {{name}} · ~{{size}} MB',
  'onboarding.download': 'Download and listen',
  'onboarding.use_system': 'Use a system voice',
  'onboarding.browse': 'Browse voices',
  'onboarding.downloading': 'Downloading… {{pct}}%',
  'onboarding.system_hint': 'Listening with your system voice. Prefer another? Settings → Listening.',
  'appearance_page.theme_colors_manager_desc':
    'Choose the colors books are shown in. Enable more reader themes, or make your own, in the Reader theme manager.',
  'appearance_page.match_light_dark_mode': 'Match light or dark mode',
  'appearance_page.match_obsidian_theme': "Match Obsidian's theme",
  'appearance_page.light': 'Light',
  'appearance_page.sepia': 'Sepia',
  'appearance_page.dark': 'Dark',
  'appearance_page.20_100': '20–100%',
  'appearance_page.two_column_layout': 'Two-column layout',
  'appearance_page.two_columns_desc': 'Automatically use a two-column layout on large displays.',
  'appearance_page.text_alignment': 'Text alignment',
  'appearance_page.text_alignment_desc':
    'Body text alignment set by the book, or always set to left-aligned or justified.',
  'appearance_page.text_align_book': 'Follow the book',
  'appearance_page.text_align_left': 'Left',
  'appearance_page.text_align_justify': 'Justified',
  'appearance_page.hyphenation': 'Hyphenation',
  'appearance_page.hyphenation_desc': 'Hyphenation set by the book, or always on or off.',
  'appearance_page.hyphenation_book': 'Follow the book',
  'appearance_page.hyphenation_on': 'On',
  'appearance_page.hyphenation_off': 'Off',
  // Added to the description, and the display menu's tooltip, where `autoHyphenates` finds On can do nothing.
  'appearance_page.hyphenation_unsupported': 'This device does not hyphenate words automatically.',
  // Character, word and paragraph spacing: each in percent of the font size, 0 leaving the book's own (`text-spacing.ts`).
  // The descriptions say what 0 means, since a slider at 0 reads as "none" and here it means "as the book has it".
  'appearance_page.character_spacing': 'Character spacing',
  'appearance_page.character_spacing_desc':
    'Extra space between letters, 0–25% of the font size. 0 keeps the book’s spacing.',
  'appearance_page.word_spacing': 'Word spacing',
  'appearance_page.word_spacing_desc': 'Extra space between words, 0–50% of the font size. 0 keeps the book’s spacing.',
  'appearance_page.paragraph_spacing': 'Paragraph spacing',
  'appearance_page.paragraph_spacing_desc':
    'Space between paragraphs, 0–200% of the font size. 0 keeps the book’s spacing.',
  'appearance_page.text_margins': 'Text margins',
  'appearance_page.text_padding_desc':
    'Extra space around book text beyond the navigation buttons (0–12%). 0% = widest text; higher values add breathing room.',
  'appearance_page.line_spacing': 'Line spacing',
  'appearance_page.1_0_3_0': '1.0–3.0×',
  'appearance_page.font_used_for_book_content': 'Font used for book content.',
  'appearance_page.80_300': '80–300%',
  'appearance_page.preview': 'Preview',
  'appearance_page.default_use_book_fonts': 'Default (use book fonts)',
  'appearance_page.follow_obsidian': 'Follow Obsidian',
  'appearance_page.georgia': 'Georgia',
  'appearance_page.palatino': 'Palatino',
  'appearance_page.times_new_roman': 'Times New Roman',
  'appearance_page.arial': 'Arial',
  'appearance_page.verdana': 'Verdana',
  'appearance_page.trebuchet_ms': 'Trebuchet MS',
  'toolbar_page.show_navigator': 'Show Navigator',
  'toolbar_page.show_search_button': 'Show search button',
  'toolbar_page.last_progress_mode': 'The indicator needs at least one mode.',
  // The six modes of the progress indicator, as rows in settings. The emoji say book or chapter at a glance.
  'progress_modes.book_percent': '📖 Book % complete',
  'progress_modes.book_percent_desc': 'based on current location',
  'progress_modes.book_locs': '📖 Book locs.',
  'progress_modes.book_locs_desc': 'current loc. / total locs. in book',
  'progress_modes.book_time': '📖 Book time remaining',
  'progress_modes.book_time_desc': 'estimated from reading speed',
  'progress_modes.chapter_percent': '📑 Chapter % complete',
  'progress_modes.chapter_percent_desc': 'based on current location',
  'progress_modes.chapter_locs': '📑 Chapter locs.',
  'progress_modes.chapter_locs_desc': 'current loc. / total locs. in chapter',
  'progress_modes.chapter_time': '📑 Chapter time remaining',
  'progress_modes.chapter_time_desc': 'estimated from reading speed',
  // One heading over the switch and the modes together, because they are one decision. “Options” is not in it:
  // every heading in settings is options.
  'toolbar_page.progress_heading': 'Reading progress indicator',
  // Names the palette because this block stays put when the toolbar button is turned off, and the reader is then
  // owed a word about how the panel opens at all.
  'toolbar_page.show_bookmark_button': 'Show bookmark button',
  'toolbar_page.show_display_style_button': 'Show display style button',
  'toolbar_page.show_note_icons_button': 'Show note icons button',
  'toolbar_page.show_annotations_button': 'Show annotation marks button',
  'toolbar_page.annotations_desc': "Opens the marks this book's selections and notes are drawn with.",
  'toolbar_page.show_reading_progress_indicator': 'Show reading progress indicator',
  // The lead line for the whole group, so it carries the rule the modes obey. “Modes” rather than “readouts”:
  // the other places that name this say modes, and one word for one thing.
  'toolbar_page.progress_cycle_desc':
    'Select it to cycle through the modes below. At least one must stay on. 📖 = book, 📑 = chapter.',
  'toolbar_page.show_focus_mode_button': 'Show focus mode button',
  'toolbar_page.show_read_aloud_button': 'Show listen button',
  'toolbar_page.focus_mode_desc': 'Expands the reader to full screen and hides navigation.',
  'notes_styles_page.heading': 'Notes styles',
  // Not "from your marks and notes": that is one of the two things a style can produce. With "Include chapters
  // without annotations" on — the default — it outlines the whole book whether or not anything is annotated.
  'notes_styles_page.desc': 'Default settings used when generating notes files from a book.',
  /**
   * The same opening sentence WITHOUT the default's explanation, for the page itself.
   *
   * On the Annotations page the second sentence is the only place the default is explained; on the styles page the
   * "Set as default" row says it three rows down, so the intro stating it too is the same fact twice on one screen.
   */
  'notes_styles_page.styles_desc_page': 'A notes style defines the format and location of generated notes files.',
  'notes_styles_page.style': 'Style',
  /**
   * A yes/no question: does a chapter with no annotations still appear?
   *
   * "annotations", the glossary's word for bookmarks, passage selections and notes together — not "you marked",
   * since a bookmark has no mark and a note may have none. The description says what the setting DOES, which is the
   * dialog's starting selection: a chapter picked or unpicked there wins for that run. One description for both
   * shapes, because the selection is the same thing in each. Stated as the result, not an instruction — "Select…" or
   * "Open…" would read as something to do now.
   */
  'notes_styles_page.include_chapters_without_annotations': 'Include chapters without annotations',
  'notes_styles_page.include_chapters_without_annotations_desc':
    'Every chapter is selected when the Generate notes dialog opens, not only the ones with annotations.',
  // Deleting a style is confirmed rather than colored red: the trash icon carries no words, so the question has to.
  // The reassurance matters as much as the warning — a style is a set of preferences, and the notes files written with
  // it are ordinary notes with no link back to it. No mention of "its templates": the templates ARE the style, its
  // own fields, so naming them separately invents a level below it and leaves the reader wondering what happens to
  // them.
  'notes_styles_page.delete_style_title': 'Delete notes style?',
  'notes_styles_page.delete_style_confirm':
    '“{{name}}” will be removed. Notes files generated with this style are not touched.',
  'notes_styles_page.set_as_default': 'Set as default',
  'notes_styles_page.default_style_desc': 'Pre-selected when the Generate notes dialog opens.',
  // "notes files" rather than "generated notes": the plural noun is what the rest of this page calls the thing, and
  // it answers "which notes?" without the technical word. Obsidian's parallel row is "Default location for new notes",
  // where "new" does the same disambiguating job. The description is plural because a default governs every file the
  // style makes, and it drops "book" — three nouns in a row, in a book reader, under a row that already says "notes
  // files".
  'notes_styles_page.default_folder': 'Default folder for notes files',
  'notes_styles_page.default_folder_desc': 'Where notes files are saved.',
  'notes_styles_page.default_folder_book': 'Same folder as the book',
  'notes_styles_page.default_folder_folder': 'In the folder specified below',
  'notes_styles_page.notes_folder': 'Notes folder path',
  'notes_styles_page.folder_name_template': 'Folder name template',
  'notes_styles_page.chapter_folder_desc': 'Name of the folder that contains all chapter files.',
  'notes_styles_page.token_book_title': 'Book title',
  'notes_styles_page.token_subject': 'What the note covers — the book title, or in a book folder the book and chapter',
  'notes_styles_page.token_author': 'Author',
  'notes_styles_page.token_filename': 'Filename',
  'notes_styles_page.token_style_name': 'Style name',
  'notes_styles_page.token_todays_date': "Today's date",
  'notes_styles_page.token_chapter_number': 'Chapter number (001)',
  'notes_styles_page.token_chapter_title': 'Chapter title',
  // The frontmatter tokens. Short noun phrases like the ones above, since they are read as a list of what each token
  // stands for rather than as sentences.
  'notes_styles_page.token_publisher': 'Publisher',
  'notes_styles_page.token_publication_date': 'Publication date',
  'notes_styles_page.token_language': 'Language',
  'notes_styles_page.token_description': 'Publisher’s description of the book',
  'notes_styles_page.token_book_link': 'Link to the book in your vault',
  /** The shipped note export style. "Orbis style", not "Default": the list already suffixes whichever style the
   *  dialog opens on with " (default)", so a style NAMED Default would read as "Default (default)" — and would stop
   *  being true the moment another style was made the default. Same reasoning as "Orbis marks". */
  'notes_styles_page.default_style_name': 'Orbis style',
  'notes_styles_page.chapter_file_name_template': 'Chapter file name template',
  'notes_styles_page.md_is_appended_automatically': '.md is appended automatically.',
  // "Note content", not "Default content": nothing here is a default that something else overrides — it is what this
  // style puts in a note. "Annotations" is the word the Annotations settings page and the mark manager already use.
  'notes_styles_page.note_content': 'Note content',
  // On the row that cannot be switched off, so the lock explains itself where it is met. Same shape as the Look-up
  // page's `section_min_one`.
  'notes_styles_page.content_min_one': 'At least one content type must stay on.',
  // The chevron on each kind's row: the template line is always visible, this opens the editor for it.
  // Says what the switch adds. Annotations are grouped under their chapter's heading whether it is on or off; on, every
  // chapter gets a heading, the ones with no annotations too, so the note outlines the whole book.
  'notes_styles_page.chapter_headings_desc':
    'Adds a heading for every chapter, including chapters with no annotations.',
  'notes_styles_page.show_template': 'Edit template',
  'notes_styles_page.hide_template': 'Hide template',
  // One line for all three halves of this list: the switch, the arrows, and the template each row shows. That last
  // sentence exists because the templates are raw — a row reading `- {{link}}` with nothing to say what it is reads
  // as cryptic until you have opened the fold once.
  // Before a content row's template, which follows in code style.
  'notes_styles_page.template_label': 'Template:',
  'notes_styles_page.content_order_desc':
    'Choose and order the annotation types included in generated notes. Each row shows its template, which controls how that type is formatted.',
  // The same list in the Generate notes dialog, WITHOUT the template sentence: the rows there carry no template and
  // no fold, because the style is where a template is edited and this dialog is one run of a style.
  //
  // It also says nothing about how many notes there are. "In this note" would be wrong once Book folder is picked,
  // which writes one per chapter — and a sentence that has to be right in both modes is better than two that each
  // have to be kept in step. The heading above it already says these are a note's contents.
  'generate_notes_modal.content_desc': 'Choose and order the annotation types to include.',
  'notes_styles_page.file_name_template': 'File name template',
  'notes_styles_page.frontmatter_desc': 'Properties added to the frontmatter of generated notes files.',
  'notes_styles_page.reset_to_default': 'Reset to default',
  // "Obsidian notes", as the Conversions category line and Save as EPUB both say — see
  // `settings_pages.conversions_desc` for why this branch uses one word. Three rows, one shape: same verb,
  // same preposition, plural on both sides.
  'save_as_markdown_page.intro_desc': 'Default settings used when converting books into Obsidian notes.',
  // The pair Save as PDF uses, with the noun changed — see `pdf_pages.default_folder`.
  'save_as_markdown_page.default_folder': 'Default folder for Markdown files',
  'save_as_markdown_page.default_folder_desc': 'Where saved Markdown files go.',
  'save_as_markdown_page.default_folder_book': 'Same folder as the book',
  'save_as_markdown_page.default_folder_folder': 'In the folder specified below',
  'save_as_markdown_page.folder': 'Markdown folder path',
  'save_as_markdown_page.folder_desc': 'Place saved Markdown files in this folder.',
  // "Default format", not "Default export format": the page is Save as Markdown, so the row only has to say which
  // shape. The other `export` words on this page are the ordinary verb — a chapter IS exported — and stay.
  'save_as_markdown_page.default_format_desc':
    'Whether a converted book becomes one vault note, or a folder with one note per chapter.',
  'save_as_markdown_page.default_format': 'Default format',
  // "Link format", not "Image link format": the row decides the book's own links as well as images.
  'save_as_markdown_page.link_format': 'Link format',
  'save_as_markdown_page.link_format_desc':
    "Whether images and the book's own links are written as wikilinks or standard Markdown.",
  'save_as_markdown_page.wikilink_image_jpg': 'Wikilink  ![[image.jpg]]',
  'save_as_markdown_page.standard_markdown_image_jpg': 'Standard Markdown  ![](image.jpg)',
  /**
   * The switch above both capabilities. Says what is true of the SITUATION — this vault is used on more than one
   * machine — rather than what gets written, because a per-device reading-position file is written either way:
   * it is how this device remembers its own place. What the switch decides is whether the devices pay attention
   * to one another.
   */
  /**
   * Offered on a book open, once, when another device has left reading-position files in this vault and this one
   * is not taking part. **The moment it matters**: with the switch off by default, another device's reading
   * position would otherwise pass silently — this stands in for the resume prompt. Says what was noticed rather
   * than asserting what the reader has: files can outlive a device.
   */
  'multi_device.found_title': 'Using Orbis Reader with multiple devices?',
  /**
   * "Share", not "keep in sync" or "keep in step": both of those credit Orbis with an outcome a separate tool
   * delivers, which is the claim the switch's own caveat exists to deny. Orbis writes and reads; the transport
   * is somebody else's. Names both halves, because the setup behind this offers both.
   */
  'multi_device.found_body':
    'This vault has Orbis Reader data from other devices. Orbis Reader can use it to share your last reading location and your settings with this device.',
  'multi_device.found_set_up': 'Set up',
  'multi_device.found_not_now': 'Not now',
  /**
   * **A button, not a tick.** A tick beside Not now made one control change what another meant. All three fit one
   * row on an S24 (measured 2026-10-08); a narrower screen wraps this onto a line of its own — `ConfirmSpec.decline`.
   */
  'multi_device.found_dont_ask': "Don't ask again",
  'multi_device.enabled': 'Use this vault on more than one device',
  'multi_device.enabled_desc': 'Orbis Reader writes data to your vault so your devices can share it.',
  /**
   * **Its own line, and its own key, because it is the one thing here a reader can be wrong about.** Someone who
   * misses it turns the switch on, sees nothing appear on their other device, and concludes the plugin is
   * broken. "Is required" rather than a description of how things happen to work; italic rather than bold,
   * because it is an aside about what Orbis does NOT do rather than a warning about what it will.
   */
  'multi_device.sync_caveat': 'A separate tool is required to sync vault data between devices.',
  'devices_page.enabled': 'Share Orbis Reader configuration in the vault',
  /**
   * Both directions, which is the part nothing else says: this device writes, and it takes in what the others
   * wrote. The "a separate tool is required" sentence sits on the switch above it instead, in italics on a line
   * of its own — saying it twice on one page is repetition rather than emphasis.
   */
  'devices_page.enabled_desc':
    'Write Orbis Reader configuration data from this device to a folder in your vault so that other devices can read it, and incorporate the data other devices write there on this device.',
  'devices_page.folder': 'Vault folder for configuration files',
  'devices_page.folder_desc': 'Orbis Reader writes configuration files to this folder.',
  'devices_page.folder_default': '!orbis-data/sync (default)',
  /**
   * **One dialog for the whole page**, asked when the multi-device switch goes on, so neither half — config or
   * reading position — is turned on by a default the reader was never shown. Every question the Devices page asks
   * is asked once, here, in the order the page lists them: who this device is, then what it shares.
   */
  'multi_device_setup.title': 'Use this vault on more than one device',
  'multi_device_setup.q_share': 'What should this device share?',
  'multi_device_setup.location': 'Reading location',
  'multi_device_setup.location_desc':
    'Pick up in each book where you left off on another device. Leave this off and this device keeps its own place.',
  'multi_device_setup.config': 'Orbis Reader configuration',
  'multi_device_setup.config_desc':
    'Write your marks, styles and settings to a folder in your vault, and take in what your other devices write there.',
  'multi_device_setup.turn_on': 'Enable',
  'sync_setup.q_name': 'What is this device called?',
  'sync_setup.q_folder': 'Where should these files go?',
  'sync_setup.folder_desc': 'You can change it later, and make a new folder with +.',
  'sync_setup.folder_joining':
    'This vault already has files in {{folder}}. Keep them together unless you have a reason not to.',
  'devices_page.device_name': 'Device name',
  'devices_page.device_name_desc':
    'Provide a name you recognize, e.g. "my iPhone" or "work laptop". Orbis Reader uses this name when showing you information that is specific to this device. Leave it blank and Orbis Reader shows the randomly generated device ID instead.',
  'devices_page.enter_device_name': 'Enter device name…',
  'devices_page.device_id': 'Device ID',
  'devices_page.device_id_desc':
    'Identifies this device in the files Orbis Reader writes to your vault. Randomly generated, one per vault, and not based on anything about the device.',
  'devices_page.share_toggle': 'Share reading location with other devices',
  'devices_page.sharing_desc':
    "Every device records where you are in each book to the vault. If the vault is synced with multiple devices, turning this on prompts you to resume from another device's location if you were further along there. When this is off, this device's reading location is isolated from your other devices.",
  'quick_pick.switch_style_placeholder': 'Switch display style…',
  'command_palette.toggle_link_preview': 'Toggle link preview',
  'command_palette.switch_display_style': 'Switch display style',
  'command_palette.about_orbis_reader': 'About Orbis Reader',
  'about.title': 'About Orbis Reader',
  'about.version': 'Version',
  'about.build': 'Build',
  'about.copy': 'Copy',
  'about.copied': 'Build info copied to clipboard',
  'command_palette.open_book': 'Open book',
  'command_palette.toggle_scrolled_mode': 'Toggle scrolled mode',
  'command_palette.scan_annotation_data_for_problems': 'Scan annotation data for problems',
  'command_palette.toggle_column_layout': 'Toggle column layout',
  'cleanup.title': 'Annotation data check',
  'cleanup.none_found': 'No problems found — all selections and notes look healthy.',
  'cleanup.summary': 'Found {{n}} annotations that can’t be shown or navigated to. Review and remove:',
  'cleanup.summary_one': 'Found 1 annotation that can’t be shown or navigated to. Review and remove it:',
  'cleanup.type_highlight': 'Passage selection',
  'cleanup.type_note': 'Note',
  'cleanup.reason_malformed': 'broken range',
  'cleanup.reason_duplicate': 'duplicate',
  'cleanup.no_text': '(no text)',
  'cleanup.remove': 'Remove {{n}}',
  'cleanup.repair': 'Repair {{n}}',
  'cleanup.can_repair': 'can be repaired',
  'cleanup.repairable_summary': '{{n}} of them can be put back where they were made.',
  'cleanup.repairable_summary_one': '1 of them can be put back where it was made.',
  'cleanup.repaired': 'Repaired {{what}}',
  // Built from a phrase per count, leaving out a count that is zero — see `removedMessage`.
  'cleanup.removed': 'Removed {{what}}',
  'cleanup.removed_both': '{{selections}} and {{notes}}',
  'cleanup.removed_selections': '{{n}} passage selections',
  'cleanup.removed_selections_one': '1 passage selection',
  'cleanup.removed_notes': '{{n}} notes',
  'cleanup.removed_notes_one': '1 note',
  'command_palette.increase_font_size': 'Increase font size',
  'command_palette.decrease_font_size': 'Decrease font size',
  'command_palette.increase_brightness': 'Increase brightness',
  'command_palette.decrease_brightness': 'Decrease brightness',
  'command_palette.cycle_text_alignment': 'Cycle text alignment',
  'command_palette.increase_line_spacing': 'Increase line spacing',
  'command_palette.decrease_line_spacing': 'Decrease line spacing',
  'command_palette.increase_text_margins': 'Increase text margins',
  'command_palette.decrease_text_margins': 'Decrease text margins',
  'command_palette.select_sentence': 'Select sentence',
  'command_palette.select_previous_sentence': 'Select previous sentence',
  'command_palette.select_paragraph': 'Select paragraph',
  'command_palette.clear_selection': 'Clear selection',
  'command_palette.apply_mark': 'Apply mark {{n}}',
  'command_palette.apply_no_mark_note_editor': 'Apply no mark (note editor)',
  'command_palette.go_to_next_mark_or_note': 'Go to next mark or note',
  'command_palette.go_to_next_passage_selection': 'Go to next passage selection',
  'command_palette.go_to_next_note': 'Go to next note',
  'command_palette.go_to_previous_mark_or_note': 'Go to previous mark or note',
  'command_palette.go_to_previous_passage_selection': 'Go to previous passage selection',
  'command_palette.go_to_previous_note': 'Go to previous note',
  // The one whose bar or note view is open, whether selected in the book or reached with Go to next mark or note.
  'command_palette.delete_the_selected_mark_or_note': 'Delete the selected mark or note',
  'notices.no_annotation_selected': 'Select a mark or note first, or go to one with Go to next mark or note.',
  'notices.no_annotations_to_step': 'Nothing marked in this book yet.',
  'command_palette.extend_selection_by_a_sentence': 'Extend selection by a sentence',
  'command_palette.shrink_selection_by_a_sentence': 'Shrink selection by a sentence',
  // "Go to", like Go to next mark or note and Go to location: every command that moves the reader says so.
  'command_palette.go_to_next_page': 'Go to next page',
  'command_palette.go_to_previous_page': 'Go to previous page',
  'command_palette.go_to_next_chapter': 'Go to next chapter',
  'command_palette.go_to_previous_chapter': 'Go to previous chapter',
  'command_palette.toggle_focus_mode': 'Toggle focus mode',
  'command_palette.lock_listening_controls': 'Lock listening controls',
  'command_palette.toggle_listening_bar': 'Toggle listening bar',
  'command_palette.toggle_full_screen_audio_player': 'Toggle full-screen audio player',
  'command_palette.manage_recordings_and_mixes': 'Manage recordings and mixes…',
  'command_palette.choose_listening_voice': 'Choose listening voice…',
  'command_palette.show_pronunciation_glossary': 'Show pronunciation glossary…',
  'command_palette.manage_annotation_presets': 'Manage annotation presets…',
  'command_palette.select_marks_for_listening_and_notes': 'Select marks for listening and notes',
  'command_palette.annotation_marks_for_this_book': 'Annotation marks for this book…',
  'command_palette.toggle_developer_options': 'Toggle developer options',
  'notices.dev_options_on': 'Orbis Reader developer options are on: extra commands in the palette, and extra settings.',
  // The developer command Factory reset (src/main.ts `confirmFactoryReset`): the dialog, one paragraph per key, and the
  // two notices after it. Developer-only, so not worth translating, but kept here so every string a reader sees is in
  // one table.
  'factory_reset.title': 'Factory reset Orbis Reader?',
  'factory_reset.settings':
    'Every Orbis Reader setting goes back to its default and this device is forgotten — its name, its ID, its display styles, and every first-run answer it has given.',
  'factory_reset.downloads':
    'The dictionaries, the PDF fonts and any downloaded voice are deleted, so around 110 MB will need fetching again.',
  'factory_reset.properties':
    'Custom property mappings go too, so a vault whose notes use their own property names will look uncataloged until you set them again. Nothing is lost — the Properties page is where they go back.',
  'factory_reset.locations':
    'Every reading-location file is moved to the trash — every device, not just this one — so nothing is left saying the vault has been used.',
  'factory_reset.kept':
    'Your books, notes, reading records, .orbis files and any published sync folder are left exactly as they are.',
  'factory_reset.reload': 'Obsidian reloads afterwards.',
  'factory_reset.confirm': 'Reset',
  'factory_reset.done':
    'Orbis Reader reset to a new install — {{positions}} reading-location file(s) trashed, {{forgotten}} device value(s) forgotten.\n{{detail}}\nReloading…',
  'factory_reset.done_no_reload': 'Reset done — reload Obsidian to see it.',
  'notices.dev_options_off': 'Orbis Reader developer options are off.',
  'command_palette.toggle_bookmark_on_current_location': 'Toggle bookmark on current location',
  'command_palette.open_contents_tab': 'Open Contents tab',
  'command_palette.open_search': 'Open search',
  'command_palette.open_annotations_tab': 'Open Annotations tab',
  'command_palette.open_linked_vault_notes_tab': 'Open Linked vault notes tab',
  'command_palette.open_stats_tab': 'Open Stats tab',
  'command_palette.go_back': 'Go back',
  'command_palette.go_forward': 'Go forward',
  'command_palette.clear_navigation_history': 'Clear navigation history',
  'command_palette.cycle_reading_progress_display': 'Cycle reading progress display',
  'command_palette.open_notes': 'Open notes',
  // **One name, in the menu and the palette.** A longer palette form — "Generate notes file…" against "Generate
  // notes…", "Open or create notes file" against "Open notes" — would be the palette explaining itself to a reader
  // who has typed the shorter one. A command has one name; the dialog it opens is where the detail belongs.
  //
  // No "file" in any case: a notes style writes one note or a folder with one per chapter, so the name
  // cannot claim either.
  'command_palette.generate_notes': 'Generate notes…',
  'command_palette.save_as_markdown': 'Save as Markdown…',
  'command_palette.copy_link_to_current_location': 'Copy link to current location',
  'command_palette.copy_passage_selections_to_clipboard': 'Copy passage selections to clipboard',
  'command_palette.copy_notes_to_clipboard': 'Copy notes to clipboard',
  'command_palette.copy_bookmarks_to_clipboard': 'Copy bookmarks to clipboard',
  'command_palette.show_reading_locations_on_all_devices': 'Show reading locations on all devices',
  'command_palette.show_reading_data_for_this_book': 'Show reading data for this book',
  'command_palette.recalculate_locations': 'Recalculate locations (dev)',
  'command_palette.rebuild_location_index_for_current_book': 'Rebuild location index for current book (dev)',
  'command_palette.download_test_fixtures': 'Download test fixtures (dev)',
  // Not "toolbar button": the debug control is a floating chip over the reading surface (and, in the data view, an
  // item on the ⋯ menu) — not on the toolbar at all.
  'command_palette.toggle_debug_button': 'Toggle debug button',
  'command_palette.toggle_writing_the_debug_log_to_a_note': 'Toggle writing the debug log to a note',
  'notices.no_book_loaded': 'No book loaded',
  'notices.book_not_loaded': 'Book not loaded',
  // While Save as Markdown or Save as PDF waits for a book opened for the first time to be measured — see
  // `waitForIndex`. Shown only then, and gone when the dialog opens.
  'notices.preparing_chapters': 'Preparing the chapter list…',
  'notices.no_navigation_history_to_clear': 'No navigation history to clear',
  'notices.navigation_history_cleared': 'Navigation history cleared',
  'notices.book_not_found_path': 'Book not found: {{path}}',
  'notices.removed_reading_data': 'Orbis Reader: removed reading data for "{{basename}}".',
  'notices.locations_not_ready': 'Still building locations — try again in a moment',
  'notices.tts_not_ready': 'Reader not ready — open a book first',
  'notices.mix_voice_not_here':
    "The voice this mix uses for this track, {{voice}}, isn't on this device. Using your live voice.",
  'notices.tts_no_live_engine':
    'Listening needs a live voice (unavailable on Android) — record the book for offline listening instead',
  'notices.gen_voice_preview_failed': 'Voice preview failed — check the server URL and voice.',
  'listening_page.record_method_min_one': 'At least one recording method must be enabled.',
  // Refusing to switch the server on. Says which field is missing rather than "not configured", because both are
  // in the row this notice comes from and the row opens itself when you see this.
  'notices.gen_server_needs_url': 'Give the server an address first.',
  'notices.gen_server_needs_voice': 'Choose a voice for the server first.',
  'notices.recording_already': 'Recording: already in progress — wait for it to finish.',
  'notices.recording_progress': 'Recording: {{done}}/{{total}} sentences…',
  'notices.recording_chapter_start': 'Recording: track {{n}}/{{total}} — {{label}}',
  'notices.recording_run_done': 'Recording: {{count}} tracks recorded in {{secs}}s',
  'notices.recording_cancelling': 'Recording: cancelling…',
  'notices.recording_paused_background':
    'Recording paused — it needs Orbis Reader on screen. Resume when you are ready.',
  'notices.recording_cancelled': 'Recording: cancelled ({{count}} tracks done)',
  'notices.recording_nothing_to_do': 'Recording: nothing to record — all tracks already done',
  'recordings_modal.title': 'Recordings and mixes',
  'recordings_modal.note':
    'A recording uses one voice; a mix can use several. Open one to manage it, or add a new one.',
  'recordings_modal.title_recording': 'Edit recording',
  'recordings_modal.title_mix': 'Edit mix',
  'recordings_modal.title_add': 'Add recording',
  'recordings_modal.note_recording': 'Record tracks to play back offline in higher quality.',
  'recordings_modal.note_mix':
    'Give each track its own voice, recorded or live. Choose a source, select the tracks, then Use for selected.',
  'recordings_modal.note_add': 'Pick the voice to record with.',
  'recordings_modal.mix_rename': 'Rename mix',
  // A recording can be renamed too. It is named by its voice until you do, which is why the prompt's placeholder is
  // that voice: clearing the field is how you give the name back.
  'recordings_modal.rename_recording': 'Rename recording',
  // The detail header's prefix once a recording carries a name of its own. "Voice: Night reads" would be calling a
  // name a voice.
  'recordings_modal.name_heading': 'Recording:',
  // The library list's leading control: which recording or mix plays. Same option set as the Source picker in
  // Voice and source — including "None" — because they set the same thing.
  'recordings_modal.use_for_listening': 'Use for listening',
  'recordings_modal.summary': '{{done}} of {{total}} tracks recorded',
  // Shared with Book export's chapter list — one pair of words for one action. Not "All" and "None", which name
  // the same thing as a state rather than as a command.
  'recordings_modal.generate': 'Generate ({{n}})',
  'recordings_modal.section_n': 'Section {{n}}',
  'recordings_modal.no_tracks': 'No tracks',
  // A chapter split across two files, or across the recording length cap. Never shown for a chapter
  // that has only one part, which is nearly all of them.
  'recordings_modal.part_of': '{{label}} {{part}} of {{total}}',
  // Untitled sections before the book's first named one — a title page, a copyright notice, a contents list set
  // as plain text. Named for what they are, because their number reads like a chapter number and is not one.
  'recordings_modal.front_matter': 'Front matter',
  'recordings_modal.nothing_to_record': 'This book is pages of images, so there is nothing to record.',
  'recordings_modal.no_text_tracks_one': '1 track has no text, so it is not listed.',
  'recordings_modal.no_text_tracks': '{{count}} tracks have no text, so they are not listed.',
  'recordings_modal.status_generating': 'Recording… {{pct}}%',
  'recordings_modal.progress_active': 'Recording: {{label}} — {{done}}/{{total}} sentences',
  'recordings_modal.progress_starting': 'Starting…',
  'recordings_modal.delete_track': 'Delete this track’s audio',
  'recordings_modal.delete_track_title': 'Delete this track?',
  'recordings_modal.delete_track_confirm':
    '“{{track}}” loses its recorded audio, and plays in the live voice until it is recorded again.',
  'recordings_modal.deleted': 'Deleted',
  'recordings_modal.play': 'Play / pause',
  'recordings_modal.play_live': 'Hear the first sentence in this voice',
  'recordings_modal.preview_failed': 'Could not preview this track',
  'recordings_modal.kind_recorded': 'Recorded',
  'recordings_modal.kind_live': 'Live',
  'recordings_modal.voice_heading': 'Voice:',
  'recordings_modal.add_voice': 'Add recording',
  'recordings_modal.new_mix': 'New mix',
  'recordings_modal.add_mix': 'Add mix',
  'recordings_modal.mix_heading': 'Mix: {{name}}',
  'recordings_modal.mix_source': 'Source',
  'recordings_modal.mix_use': 'Use for selected ({{n}})',
  'recordings_modal.mix_add_live': 'Add live voice',
  'recordings_modal.mix_add_live_title': 'Add a live voice',
  'recordings_modal.mix_live_default': 'Default live voice',
  'recordings_modal.mix_live_tag': 'live',
  'recordings_modal.mix_recorded_tag': 'recording',
  'recordings_modal.mix_source_named': '{{name}} ({{voice}})',
  'recordings_modal.mix_default_name': 'New mix',
  'recordings_modal.mix_name_placeholder': 'Enter mix name',
  'recordings_modal.mix_create': 'Create',
  'recordings_modal.mix_update': 'Update',
  'recordings_modal.mix_delete_title': 'Delete mix?',
  'recordings_modal.mix_delete_confirm': 'Delete this mix? The recordings it points to are kept.',
  'recordings_modal.tag_voice': 'Recording',
  'recordings_modal.tag_mix': 'Mix',
  'recordings_modal.lib_coverage': '{{done}} of {{total}} tracks',
  'recordings_modal.lib_empty': 'No recordings or mixes yet. Record a voice, or build a mix from live voices.',
  'recordings_modal.delete_track_last': 'Only recording — delete the whole recording from the list',
  'recordings_modal.delete_while_recording': 'Can’t be deleted while recording — stop or let it finish',
  'recordings_modal.recorded': '{{count}} tracks recorded · {{size}}',
  'recordings_modal.recorded_one': '1 track recorded · {{size}}',
  'recordings_modal.delete_confirm_title': 'Delete files?',
  // Names the ITEM, not a voice. A recording can be renamed, so "…recorded with {{voice}}" given the recording's
  // label would ask whether to delete audio recorded with "Banana".
  'recordings_modal.delete_confirm':
    'Permanently delete {{name}}? All of its recorded audio goes with it, and this cannot be undone.',
  'recordings_modal.confirm_title': 'Generate recording?',
  'recordings_modal.mix_assigned': '{{count}} tracks set to {{voice}}',
  'recordings_modal.mix_assigned_one': '1 track set to {{voice}}',
  'recordings_modal.confirm_count': '{{count}} tracks with {{voice}}',
  'recordings_modal.confirm_count_one': '1 track with {{voice}}',
  'recordings_modal.confirm_estimate': 'Estimated ~{{time}} to generate.',
  'recordings_modal.confirm_no_estimate': 'This can take a long time — potentially hours for a full book.',
  'recordings_modal.confirm_keep_open':
    'Recording will continue in the background if you close this dialog. On a phone or tablet, switching to another application may pause or interrupt recording.',
  'recordings_modal.stop': 'Stop',
  'recordings_modal.pause': 'Pause',
  'recordings_modal.resume': 'Resume',
  'recordings_modal.paused': 'Paused. Everything recorded so far is kept.',
  'recordings_modal.paused_background':
    'Waiting for Orbis Reader to be back on screen. Recording continues on its own when it is.',
  'recordings_modal.paused_stuck':
    'Paused: the connection kept dropping while this app was in the background. Everything recorded so far is kept.',
  'recordings_modal.stop_confirm_title': 'Stop recording?',
  'recordings_modal.stop_confirm': "The chapter in progress won't be saved. Chapters already recorded are kept.",
  'recordings_modal.stop_keep': 'Keep recording',
  'recordings_modal.confirm_go': 'Generate',
  // "Voice and source", not "Voice and recordings": the dialog next door is called "Recordings and mixes", and a
  // panel whose title and whose second heading both echoed it would read as that dialog existing twice. This one
  // answers what you are hearing and lets you change it; that one is where recordings are built and managed.
  'voice_and_source.title': 'Voice and source',
  // Shown in place of the voice's name and provenance when this device has nothing it can speak with. Not the
  // recommended voice's name, which would contradict a chip that has just said there is none.
  'voice_and_source.no_voice_name': 'No voice on this device',
  // True whether or not other voices are downloaded: what is missing is the one selected.
  'voice_and_source.selected_voice_missing':
    "Your selected voice isn't on this device — choose a voice to start listening.",
  'voice_and_source.choose_voice': 'Choose a voice',
  'voice_and_source.voice_heading': 'Voice',
  // Orbis's word for this one scale up: in a mix, Source is where a chapter's audio comes from; here it is where
  // the book's comes from.
  'voice_and_source.recording_heading': 'Source',
  'voice_and_source.speed_heading': 'Speed',

  'voice_and_source.change_voice': 'Change voice',
  'voice_and_source.reason_from_recording': 'From your recording selection.',
  'voice_and_source.reason_track_unrecorded': 'Your live voice — this track has no recording.',
  'voice_and_source.reason_mix_default': 'Your live voice — this track uses the default.',
  'voice_and_source.reason_mix_voice_not_here': "Your live voice — this track's voice isn't on this device.",
  'voice_and_source.reason_always_live': 'Your live voice — always-live is on.',
  'voice_and_source.reason_no_recordings': 'Your live voice.',
  'voice_and_source.reason_none_selected': 'Your live voice — no recording selected.',
  'voice_and_source.none_option': 'None — use the live voice',
  'voice_and_source.no_recordings': 'No recordings or mixes for this book.',
  'voice_and_source.coverage': 'Recorded: {{done}} of {{total}} tracks',
  'voice_and_source.always_live_note':
    'Always use the live voice is on, so recordings and mixes don’t play. Turn it off in Settings → Listening.',
  'voice_and_source.manage': 'Manage recordings and mixes',
  // Above a button that opens the Listening page, so it does not spell out the path.
  'voice_and_source.more_options': 'More listening options are in settings.',
  'voice_and_source.open_settings': 'Open Listening settings',
  'voice_and_source.always_live_name': 'Always use the live voice',
  'voice_and_source.always_live_desc':
    'Even when a book has a recording, listen with your selected live voice instead.',
  'recording_chip.reopen': 'Recording — select to view progress',
  'recording_chip.progress': 'Recording… {{done}}/{{total}}',
  // The same chip once the run is done, while the book's window is busy — Settings in front, or a dialog over the
  // book. Selecting it opens the result; so does coming back to the book.
  'recording_chip.done': 'Recorded {{done}}/{{total}}',
  'recording_chip.view_done': 'Recording finished — select to view',
  'recordings_modal.finished': 'Recorded {{count}} tracks in {{time}}',
  // A run where some chapters produced nothing: the count is what was actually recorded, and the failure is stated
  // rather than folded into a tick. The hint names the usual cause, which the debug log confirms.
  'recordings_modal.finished_failed': '{{count}} recorded · {{failed}} produced nothing',
  // Why a chapter produced nothing, said in terms of what to do about it. One per failure the synth can name — a
  // reader should never be asked to open a debug log to find out what happened.
  'recordings_modal.failed_voice_rejected':
    'The server did not accept the voice “{{voice}}”. Check that this voice is installed on the server, or record with a different one.',
  'recordings_modal.failed_unauthorized':
    'The server refused the request. Its address or credentials may need updating in Listening settings.',
  'recordings_modal.failed_server_error':
    'The server could not produce audio. It may be overloaded or misconfigured — worth trying again.',
  'recordings_modal.failed_unreachable':
    'Could not reach the recording server at {{url}}. Check that it is running and that this device can see it.',
  'recordings_modal.failed_device_voice':
    'This device could not use the voice “{{voice}}”. Download it again from Listening settings, or choose another.',
  'recordings_modal.failed_unreadable':
    'The server sent audio Orbis Reader could not read. It may be configured for a format Orbis Reader does not accept.',
  // The fallback, for a failure with no name: still says what happened rather than pointing elsewhere.
  'recordings_modal.failed_unknown': 'Every sentence in the track failed, so there was nothing to save.',
  'recordings_modal.finished_one': 'Recorded 1 track in {{time}}',
  'recordings_modal.continue': 'Continue',
  'notices.recording_no_book': 'Open a book first',
  'notices.recording_failed': 'Recording failed — see the debug log (tts)',
  'notices.locations_not_ready_reload': 'Locations not ready — wait for the book to fully load, then try again',
  'notices.rebuilding_locations': 'Rebuilding locations…',
  'notices.locations_rebuilt': 'Locations rebuilt',
  'notices.link_copied_to_clipboard': 'Link copied to clipboard',
  'notices.address_copied_to_clipboard': 'Address copied to clipboard',
  // After an update or turning the plugin off and on, the book renderer is still the previous version's — a browser
  // cannot unregister it. See `reportStaleRenderer`.
  'notices.restart_to_finish_update':
    'Restart Obsidian to finish updating Orbis Reader. Until then, books open with the previous version’s reader.',
  // Orbis's settings file could not be read, and was moved aside rather than saved over — see `readSettingsFile`.
  'notices.settings_restored_from_backup':
    'Orbis Reader couldn’t read its settings file, so it restored your settings from its backup. The unreadable file is kept in the plugin’s folder as {{name}}.',
  'notices.settings_unreadable_started_with_defaults':
    'Orbis Reader couldn’t read its settings file and had no backup, so it started with its default settings. The unreadable file is kept in the plugin’s folder as {{name}}.',
  // A save to a book's `.orbis` file failed, once per book per session — see `writeOrbisFile`.
  'notices.book_changes_not_saved': 'Orbis Reader couldn’t save your latest changes to {{book}}: {{reason}}',
  // A `javascript:` link in a book is refused rather than shown — see `LinkCheck`.
  'notices.script_links_not_opened': 'Orbis Reader doesn’t open links that run scripts.',
  // The first line of a chapter whose markup the hardening could not make safe, shown as its text instead — see
  // `plainTextChapter`. It is part of the chapter page, not a notice.
  'book_page.chapter_shown_as_plain_text':
    'Orbis Reader shows this chapter as plain text because its markup could not be made safe to display.',
  'notices.location_unknown': 'Could not determine location',
  'notices.current_location_unknown': 'Could not determine current location',
  'notices.text_copied_to_clipboard': 'Text copied to clipboard',
  'notices.annotation_exists_here': "There's already a selection or note here.",
  'notices.notes_saved_basename': 'Notes saved → {{basename}}',
  'notices.no_chapters_to_generate_no_content_found': 'No chapters to generate (no content found)',
  'notices.wrote_n_chapter_notes_and_contents': 'Wrote {{n}} chapter notes and the contents note.',
  'notices.wrote_n_chapter_notes_and_contents_one': 'Wrote 1 chapter note and the contents note.',
  'notices.removed_n_earlier_chapter_notes': 'Removed {{n}} earlier chapter notes.',
  'notices.removed_n_earlier_chapter_notes_one': 'Removed 1 earlier chapter note.',
  'notices.error_generating_notes_msg': 'Error generating notes: {{msg}}',
  'reading_records_page.heading': 'Reading records',
  'reading_records_page.enable': 'Write a reading record for each book as you read',
  'reading_records_page.location': "Where each book's reading record goes",
  // Says what the chosen layout makes, so the hidden folder row below is not the only explanation of either.
  'reading_records_page.location_desc_folder':
    "Puts every book's notes in one folder, with a subfolder for each book. Any book's record can be moved from its Reading record settings.",
  'reading_records_page.location_desc_beside':
    "Puts each book's notes in a new folder next to the book, named after it. Any book's record can be moved from its Reading record settings.",
  'reading_records_page.location_folder': 'In one folder for every book',
  'reading_records_page.location_beside': 'Beside each book',
  'reading_records_page.folder': 'Folder for reading records',
  'folder_picker.pending': '{{name}} (created when first used)',
  'folder_picker.pending_on_save': '{{name}} (will be created)',
  'reading_records_page.folder_desc': "Contains every book's reading record.",
  /**
   * **A switch of its own, because a folder dropdown would hide the decision.**
   *
   * Declining as an `extra` entry inside the folder picker — `Don't create one`, first in a list of every folder in
   * the vault — is a choice nobody finds: the row reads as "which folder", so the one option that answers a
   * different question sits where nobody is looking for it.
   *
   * The folder row is hidden while this is off, rather than disabled: an absent row says "no folder needed here",
   * where a grayed one says "a folder you may not have".
   */
  'reading_records_page.allbooks_on': 'Create one base covering every book',
  'reading_records_page.allbooks_on_desc':
    'Adds a single Obsidian base showing the reading records from every book, alongside the base each book gets.',
  'reading_records_page.allbooks': 'Folder for the base covering every book',
  'reading_records_page.allbooks_desc': 'Contains one Obsidian base that shows the reading records from all books.',
  'reading_records_page.kinds': 'What gets added to the vault',
  'reading_records_page.kinds_desc':
    'Notes show up in the standard Obsidian search, the quick switcher and the graph. Bookmarks are off by default.',
  'reading_records_page.kind_passages': 'Passage selections',
  'reading_records_page.kind_notes': 'Notes',
  'reading_records_page.kind_bookmarks': 'Bookmarks',
  'reading_records_page.kinds_last': 'At least one of these has to stay on. Switch another on to turn this one off.',
  'reading_records_page.desc':
    'Creates a note in the vault for each passage selection, note and bookmark you save, and Obsidian Bases with views to group, sort and filter those notes.',
  'reading_records_page.mode_off': 'Off',
  'reading_records_page.mode_ask': 'Ask for each book',
  'reading_records_page.mode_on': 'On for every book',
  'notices.records_off': 'Enable Reading records in settings first.',
  'notices.records_off_for_book': "This book's reading record is off.",
  'notices.records_book_on': "This book's reading record is on.",
  'notices.records_book_follow': "This book's reading record follows the vault setting.",
  'notices.records_book_off': "This book's reading record is off. Existing notes were left in place.",
  'notices.records_book_failed': "Could not save this book's reading record settings. See the debug log.",
  'book_records.title': 'Reading record settings',
  'records_dest.title': 'Where should reading records go?',
  'records_dest.desc':
    "Each book's reading record is a set of notes in your vault. This is where they will be written.",
  'records_dest.location': "Where each book's reading record goes",
  'records_dest.opt_shared': 'In one folder for every book',
  'records_dest.opt_beside': 'Beside each book',
  'records_dest.folder': 'Folder for reading records',
  'records_dest.base': 'Folder for the base covering every book',
  'records_dest.base_desc': 'Contains one Obsidian base that shows the reading records from all books.',
  'records_dest.base_none': "Don't create one",
  'book_records.choice': 'Reading record for this book',
  'book_records.choice_desc':
    'Creates a note in the vault for each passage selection, note and bookmark you save in this book.',
  'book_records.opt_follow': 'Follow the vault setting',
  'book_records.opt_on': 'On for this book',
  'book_records.opt_off': 'Off for this book',
  // Both of these name the path, all the way down to the page the reader has to reach.
  'book_records.vault_state_off':
    'Vault setting: off for every book. Turn it on in Settings → Annotations → Reading records.',
  'book_records.vault_state_ask': 'Vault setting: ask for each book.',
  'book_records.vault_state_on': 'Vault setting: on for every book.',
  'book_records.resolved_active': 'Reading record: Active.',
  'book_records.resolved_off_vault': 'Reading record: Inactive — reading records are off for this vault.',
  'book_records.resolved_off_book': 'Reading record: Inactive — off for this book.',
  'book_records.resolved_waiting': "Reading record: Inactive — you'll be asked on your next selection or note.",
  'book_records.kinds_heading': 'What gets written',
  'book_records.follow_vault': 'Follow vault settings',
  'book_records.follow_vault_on':
    'Changed in Settings → Annotations → Reading records, and applies to every book that follows them.',
  'book_records.follow_vault_off': 'Stored for this book only. Turn this back on to follow the vault again.',
  'book_records.where_heading': 'Where they go',
  'book_records.save_to': 'Save to',
  'book_records.loc_follow_folder': 'Follow vault default — the shared records folder',
  'book_records.loc_follow_beside': 'Follow vault default — beside the book',
  'book_records.loc_global': 'The shared records folder',
  'book_records.loc_beside': 'Beside the book',
  'book_records.loc_custom': 'A folder you choose',
  'book_records.folder': 'Folder',
  'book_records.moves': 'Moves {{n}} existing notes here.',
  'book_records.keeps_existing': '{{n}} existing notes stay where they are. Nothing is deleted.',
  'notices.records_no_folder': 'Choose a folder for reading records in settings first.',
  'notices.records_dest_off': 'Reading records stay off until you choose where they go.',
  'notices.records_dest_skipped': 'Reading records need somewhere to go, so nothing was written.',
  'notices.records_exported': 'Reading record: {{created}} notes added, {{updated}} updated.',
  'command_palette.write_this_books_reading_record': "Write this book's reading record…",
  'command_palette.save_note_as_epub': 'Save note as EPUB…',
  /**
   * **It names the plugin, and it has no ellipsis.** A file context menu fills with items from every plugin
   * installed, so an item there has to identify itself — which is the opposite of the rule inside our own
   * dialogs, where the reader is already here. No ellipsis because nothing is asked: its sibling *Save note as
   * EPUB…* has one because a dialog follows, and this one converts and opens.
   */
  'command_palette.read_in_orbis_reader': 'Read in Orbis Reader',
  'command_palette.save_folder_as_epub': 'Save folder as EPUB…',
  // "folder NOTES", because that is what becomes an EPUB apiece — the folder itself becomes a set, not a book.
  // The plural carries "one each" on its own — "save the photos as JPEGs" needs no help — and the rest of this
  // dialog already trusts it: the confirm button says "Save 2 EPUBs" and the fold says "Notes to convert · 2
  // EPUBs". Against "Save folder as EPUB…" beside it on the same menu, `folder notes` and the `s` distinguish it
  // twice over. "separate" stays in the sentence below the title, where it is singular and means something else:
  // its own, not shared.
  'command_palette.save_folder_notes_as_epubs': 'Save folder notes as EPUBs…',
  'notices.epub_write_failed': 'Could not write the EPUB: {{error}}',
  'notices.epub_set_saved': 'Saved {{n}} EPUBs to {{folder}}.',
  'notices.epub_set_saved_one': 'Saved 1 EPUB to {{folder}}.',
  'notices.epub_set_saved_changed': 'Saved {{n}} of {{total}} EPUBs to {{folder}}. The rest were already up to date.',
  'notices.epub_set_up_to_date': 'Every EPUB in {{folder}} is already up to date.',
  'notices.epub_folder_empty': 'That folder has no Markdown notes in it.',
  // Named for the page, not for one of the three commands on it — "Save note as EPUB" would leave out the folder
  // conversions the page also governs. Parallel with "Save as PDF".
  'save_as_epub_page.heading': 'Save as EPUB',
  // The same words as the command and the menu item, because they are the same act.
  'read_in_orbis_page.heading': 'Read in Orbis Reader',
  'save_as_epub_page.default_folder': 'Default folder for EPUB files',
  // The second sentence is the one a folder conversion needs: the EPUB is a SIBLING of what it came from, so a
  // folder's book lands in the folder's parent. Writing it inside the folder being converted would make the output
  // a candidate input the next time.
  'save_as_epub_page.default_folder_desc':
    "Where generated EPUB files go. A folder's EPUB is written beside the folder, not inside it.",
  // "Same folder as the note" is true of only one of the three commands. What covers all three is that the EPUB sits
  // alongside its source, whether that source is a note or a folder.
  'save_as_epub_page.default_folder_note': 'Beside the note or folder',
  'save_as_epub_page.default_folder_folder': 'In the folder specified below',
  'save_as_epub_page.split_level': 'Chapter breaks',
  'save_as_epub_page.split_level_desc':
    "Which heading level starts a new chapter. When a conversion's content has no heading that matches, the nearest matching level is selected.",
  'save_as_epub_page.split_none': 'None — one chapter',
  'save_as_epub_page.folder': 'EPUB folder path',
  'save_as_epub_page.folder_desc': 'Place generated EPUB files in this folder.',
  'save_as_epub_page.default_type': 'Type for converted books',
  // Names the frontmatter key LITERALLY, because that is what makes the chain traceable: someone who opens a title
  // note sees `type: book`, and someone hunting settings searches "type". The second sentence is the payoff — this
  // is one of five Library fields with a named value list, so it can be a column, a group heading and a rule.
  'save_as_epub_page.default_type_desc':
    "The `type` property written onto a converted book's title note. The Library groups and filters by it.",
  'save_as_epub_page.remote_images': 'Fetch remote images by default',
  'save_as_epub_page.remote_images_desc':
    'Downloads images notes link to from the web and embeds them in generated EPUB files.',
  // ── Reader themes and the Reader theme manager (docs/design/reader-themes.md) ─────────
  'themes.page': 'Reader theme manager',
  'themes.choose_make_desc': 'Choose which themes are offered and make your own.',
  'themes.enable_order_make_desc':
    'Enable the reader themes you want in the Reader theme list and put them in order. Select + to make your own.',
  'themes.list': 'Themes',
  'themes.copy': 'Make a copy',
  'themes.copy_name': '{{name}} copy',
  'themes.new': 'New theme',
  'themes.edit': 'Edit theme',
  'themes.name': 'Name',
  'themes.background': 'Background',
  'themes.text': 'Text',
  'themes.links': 'Links',
  'themes.name_required': 'Give the theme a name.',
  'themes.name_taken': 'A theme called “{{name}}” already exists.',
  'themes.sample_text': 'The ferry left the north shore a little after seven, and by the time it reached the',
  'themes.sample_link': 'weir',
  'themes.contrast': 'Contrast: text {{text}} : 1, links {{link}} : 1',
  'themes.contrast_low': 'below 4.5 : 1, hard to read for long',
  'themes.delete_title': 'Delete theme?',
  'themes.delete_confirm': '“{{name}}” will be deleted.',
  'themes.delete_confirm_used_one':
    "“{{name}}” will be deleted. 1 display style uses it, and will match Obsidian's light or dark mode instead.",
  'themes.delete_confirm_used':
    "“{{name}}” will be deleted. {{count}} display styles use it, and will match Obsidian's light or dark mode instead.",
  'themes.paper': 'Paper',
  'themes.gray': 'Gray',
  'themes.charcoal': 'Charcoal',
  'themes.midnight': 'Midnight',
  'themes.emerald': 'Emerald',
  'themes.sunset': 'Sunset',
  'themes.plum': 'Plum',

  // ── The two PDF settings pages ──────────────────────────────────────────────
  //
  // `pdf_pages.*` is what BOTH pages draw on; `annotations_pdf_page.*` and `save_as_pdf_page.*` are what tells them
  // apart. Every row below is shared or book-only — nothing is annotations-only except the destination, which is a
  // key rather than a string.
  'annotations_pdf_page.heading': 'Save annotations as PDF',
  'save_as_pdf_page.heading': 'Save as PDF',
  // The same two-row pair the EPUB and reading-records pages use, because it is the same question. Only the noun
  // changes: a PDF is saved beside the BOOK, where a converted EPUB sits beside its note.
  //
  // One label on two pages, behind two different settings: the whole point of duplicating the destination is that
  // a digest you send to someone and a book you keep want different folders. No "new": every location row in
  // settings governs files that do not exist yet, so the word distinguishes nothing.
  'pdf_pages.default_folder': 'Default folder for PDF files',
  'pdf_pages.default_folder_desc': 'Where saved PDFs go.',
  'pdf_pages.default_folder_book': 'Same folder as the book',
  'pdf_pages.default_folder_folder': 'In the folder specified below',
  'pdf_pages.folder': 'PDF folder path',
  'pdf_pages.folder_desc': 'Place saved PDFs in this folder.',
  // Mirrors the dialog's `marks_pdf.attribution`, which is what a reader sees at the moment it matters.
  //
  // **One setting, a row on each page, and each row says where the other one is.** A person has one name, so two
  // fields would be the same answer stored twice and the copies would drift the first time one was corrected.
  // Each description also says what THAT page does with the name, which is not the same thing on both.
  'pdf_pages.name': 'Marked up by',
  'pdf_pages.name_desc_annotations':
    'Printed under the title of the PDF. The same name is used by Conversions → Save as PDF, which prints it on the cover sheet.',
  'pdf_pages.name_desc_book':
    'Printed on the cover sheet. The same name is used by Annotations → Save annotations as PDF, which prints it under the title.',
  'pdf_pages.name_placeholder': 'Optional',
  // Book page only, by the rule that a control with one possible outcome should not exist: a digest of the marks
  // with the marks left out is not an artifact, and a digest prints its byline and legend inline rather than on a
  // cover sheet there is anything to turn off.
  'pdf_pages.marks': 'Include marks and notes',
  'pdf_pages.marks_desc': "Draw your marks into the book's text. Off gives a plain PDF of the book.",
  'pdf_pages.cover': 'Cover sheet',
  'pdf_pages.cover_desc':
    'A first page with the title and what each mark means. Turn it off for the marked-up book on its own.',
  // **The fonts live on the book page, and serve both commands.** One row, because it is one download — and it is
  // here rather than on both because a second copy of a Download/Remove button is a second answer to a question
  // with one. The book PDF is the one that draws whole pages of the author's text, so it is where the missing
  // characters are noticed; the annotations dialog still offers the download at the moment it matters.
  'pdf_pages.fonts': 'Expanded character set',
  'pdf_pages.fonts_desc':
    'Not downloaded. Without it a PDF can draw about 220 characters, so arrows, Greek, Cyrillic and mathematical symbols print as question marks.',
  'pdf_pages.fonts_installed':
    'Downloaded. PDFs can draw arrows, Greek, Cyrillic, mathematical symbols and the rest of the DejaVu character set.',
  'pdf_pages.fonts_download': 'Download',
  'epub_export.title': 'Save note as EPUB',
  'epub_export.field_title': 'Title',
  'epub_export.field_author': 'Author',
  'epub_export.field_language': 'Language',
  'epub_export.field_publisher': 'Publisher',
  'epub_export.field_published': 'Publication date',
  'epub_export.field_type': 'Type',
  'epub_export.book_details': 'Book details',
  'epub_export.type_add': 'Add a type',
  'epub_export.type_placeholder': 'blog post',
  'epub_export.chapter_order': 'Chapter order',
  'epub_export.chapter_order_desc': 'Choose the default order of the chapters.',
  'epub_export.chapter_order_more':
    'Select File name order, or select one of the notes. Choosing a note puts the chapters in the same order the links appear in that note. Reorder or exclude notes in the list below.',
  'epub_export.toc_source': 'Contents note order',
  'epub_export.toc_source_desc': 'Choose the default order of the links in the contents note.',
  'epub_export.toc_source_more':
    'Select File name order, or select one of the notes. Choosing a note puts the links in the same order they appear in that note. Reorder or exclude notes in the list below.',
  'epub_export.order_by_filename': 'File name order',
  'epub_export.toc_title_label': 'Title:',
  'epub_export.toc_notice':
    'Orbis Reader generates this note. Anything you add here is replaced the next time you convert this folder.',
  'epub_export.set_order_appended': '{{n}} notes are not linked from “{{name}}”, so they are listed at the end.',
  'epub_export.set_order_appended_one': '1 note is not linked from “{{name}}”, so it is listed at the end.',
  // **A noun phrase, because one option means "don't".** A label that completes into its own value — "Split into
  // sections at", "Start a new chapter at" — reads correctly against a heading level and breaks against the option
  // for no splitting at all. A BREAK is the point where a chapter starts, which is what the level chooses.
  'epub_export.split_heading': 'Chapter breaks',
  // Says what the control is FOR. The list below shows the outcome and never the mechanism, so without this
  // nobody meeting the dropdown knows their own headings are what it works from.
  'epub_export.split_desc': "Chapters come from your note's headings. Choose which level starts a new one.",
  // The "none" options say what you GET, not just what is skipped — the three dialogs differ in exactly that.
  'epub_export.split_none': 'None — one chapter',
  'epub_export.split_level': 'Heading {{n}}',
  // Beside each level in the picker: how many headings the content has there. Not the number of SECTIONS it
  // yields — text before the first heading gains one — which the list below the picker reports instead.
  'epub_export.split_headings_n': '{{n}} headings',
  'epub_export.split_headings_n_one': '1 heading',
  // Replaces the picker outright when there is nothing to split. A dropdown with one option is a control that
  // cannot do anything.
  'epub_export.split_none_available': 'There are no headings to break at, so the book is one chapter.',
  'epub_export.sections_n': '{{n}} chapters',
  'epub_export.sections_n_one': '1 chapter',
  'epub_export.subsections': '{{n}} sub-headings',
  'epub_export.subsections_one': '1 sub-heading',
  'epub_export.analysing': 'Reading the note…',
  'epub_export.convert': 'Save',
  'epub_export.field_file_name': 'File name',
  'epub_export.field_folder': 'Save to',
  'epub_export.remote_images_n': 'Fetch {{n}} remote images',
  'epub_export.remote_images_n_one': 'Fetch 1 remote image',
  'epub_export.remote_images_desc':
    'Downloads images this note links to from the web. Leaving this off keeps the conversion local, so nothing is requested from remote servers.',
  'epub_export.remote_skipped': '{{n}} images hosted on the web will be left out.',
  'epub_export.remote_skipped_one': '1 image hosted on the web will be left out.',
  'epub_export.folder_title': 'Save folder as EPUB',
  'epub_export.out_folder_name': '{{name}}-EPUB',
  'epub_export.separate_title': 'Save folder notes as EPUBs',
  // One line, under the title — it says what the command makes, which is the only thing a reader needs before
  // the controls. Separate highlights, separate reading positions and the links between books are all true and
  // all documentation: three sentences of them at the top of a phone screen is a wall to scroll past.
  'epub_export.separate_desc': 'Each note is saved as a separate EPUB; a contents note links to them.',
  'epub_export.out_folder': 'New folder name',
  // One dialog body, two screens, and the title is the only thing on either that says which. There is nothing else
  // to tell them apart but which rows are present, and an absence is a poor signpost.
  'marks_pdf.title_annotations': 'Save annotations as PDF',
  'marks_pdf.title_book': 'Save as PDF',
  // **Four, because both numbers can be one.** With chapters chosen that is the ordinary case rather than a corner
  // — one template would say "2 marks and notes across 1 chapters" for a digest of one chapter. Whole sentences
  // rather than fragments joined at runtime: a translator needs the word order, not our two halves of it.
  'marks_pdf.summary': '{{n}} marks and notes across {{chapters}} chapters',
  'marks_pdf.summary_one_chapter': '{{n}} marks and notes in one chapter',
  'marks_pdf.summary_one_mark': '1 mark or note across {{chapters}} chapters',
  'marks_pdf.summary_one_both': '1 mark or note in one chapter',
  'marks_pdf.attribution': 'Marked up by',
  /**
   * The same words as they are PRINTED, with the name in them — the dialog's label above is the field's name and
   * cannot carry one.
   *
   * **Its own key rather than the label plus a space plus the name.** Joining them in code fixes English word
   * order into every locale, which is the whole thing a string table exists to avoid.
   */
  'marks_pdf.attribution_byline': 'Marked up by {{name}}',
  'marks_pdf.attribution_desc': 'Optional. Printed under the title, so a shared copy says who marked it.',
  'marks_pdf.no_attribution': 'No name',
  'marks_pdf.summary_none': 'Nothing marked in this book yet',
  // Reachable only through the mark filter — the command itself is unavailable with nothing marked — so it says
  // what to do about the filter.
  'marks_pdf.no_marks': 'There is nothing to list. Widen the mark filter above.',
  'marks_pdf.no_chapters': 'No chapters are selected.',

  'marks_pdf.legend_heading': 'What the marks mean',
  'marks_pdf.page_number': 'Page {{page}} of {{total}}',
  'marks_pdf.chapters': 'Chapters',
  // The digest's list holds only the chapters that contribute to it, so "Chapters · 4 of 4" would claim the book
  // has four. "Marks and notes" is this artifact's own name, in the scope picker and the summary line both — and
  // it is the only phrase that covers an UNMARKED note as well as a passage nobody wrote a note on.
  'marks_pdf.chapters_digest': 'Chapters with marks and notes',
  'marks_pdf.chapters_all': 'All {{n}} chapters',
  'marks_pdf.chapters_marked': 'Only the {{n}} with marks',
  // "selected", the word the list's own buttons and its count use — "chosen" would be a third word for one idea.
  'marks_pdf.chapters_custom': '{{n}} selected below',
  // The chapter fold's ANSWER, without its label: `answerFold` draws the label itself, faint, and the answer beside
  // it — which is what every other fold in these dialogs looks like. One string with a `·` in the middle, set
  // straight on the summary, would draw the whole line at the summary's own weight.
  'marks_pdf.chapters_value': '{{n}} of {{total}}',
  'marks_pdf.chapter_marks': '{{n}} marks',
  'marks_pdf.chapter_marks_one': '1 mark',
  'marks_pdf.chapter_none': 'no marks',
  'marks_pdf.fonts': 'Download the expanded character set',
  'marks_pdf.fonts_desc':
    'A one-time {{size}} MB download, kept on this device. Without it the PDF can only draw about 220 characters, so arrows, Greek, Cyrillic and mathematical symbols print as question marks.',
  'marks_pdf.include_marks': 'Include marks and notes',
  // The per-export mark filter. Never written back to settings: a filter left on quietly produces a partial PDF a
  // week later, which is worse than choosing it again. Bookmarks are not mentioned because a PDF does not
  // include them — that fact belongs to the notes export, and lives in its guide.
  // The same words as the notes dialog — see `generate_notes_modal.mark_filter` for why.
  'marks_pdf.mark_filter': 'Marks to include',
  // The fold's header when nothing is narrowed. States the answer rather than its absence.
  'marks_pdf.mark_filter_all': 'All marks',
  'marks_pdf.mark_filter_desc': 'Choose the marks to include in the PDF.',
  // Two kinds, not the advanced search's four: an export does no matching, so "note selections" and "note text"
  // are one question here — a note either goes in or it does not.
  'marks_pdf.kind_passages': 'Passage selections',
  'marks_pdf.kind_notes': 'Note selections',
  'marks_pdf.kind_min_one': 'At least one of these must stay on.',
  // **Only what turning it OFF does**, because the label already says what leaving it on does. Explaining
  // "on" would only restate the label ahead of the part a reader cannot guess.
  'marks_pdf.include_marks_desc': 'Turn this off to get an unmarked PDF.',
  // The six shapes of the line at the top of the dialog, which is the one place that reports what the file will
  // hold. Two axes: how much of the book, and whether the marks are drawn — plus the pair with no marks clause at
  // all, for a book that has none, where the switch that would decide it is hidden.
  'marks_pdf.summary_book': 'The book',
  'marks_pdf.summary_book_marks': 'The book, with your marks and notes',
  'marks_pdf.summary_book_plain': 'The book, without marks or notes',
  'marks_pdf.summary_some': '{{n}} of {{total}} chapters',
  'marks_pdf.summary_some_marks': '{{n}} of {{total}} chapters, with your marks and notes',
  'marks_pdf.summary_some_plain': '{{n}} of {{total}} chapters, without marks or notes',
  'marks_pdf.cover': 'Cover sheet',
  // The byline is three things joined and each is dropped when absent — the author, "Marked up by …", and the
  // date — which is the day of the export, not a date from the book, hence "current". The attribution earns its
  // "if provided" because it is the one a reader has to have typed in; the other two are unsurprising on a cover
  // sheet. No "A first page": "Cover sheet" already says where it is.
  'marks_pdf.cover_desc':
    'Shows the title, author, current date, who marked the book if provided, and what each mark means.',
  // **A statement about the FILE, not about the reader.** The outline is real — every section and heading is
  // written as a PDF outline entry — but whether a viewer shows it in a sidebar is the viewer's choice, so it is
  // not claimed as universal. Saying nothing at all would give up the one thing that separates this from a text
  // dump.
  'marks_pdf.save': 'Save',
  // Unreachable while the buttons appear only where a route exists, and said plainly if that ever changes.
  'outside_vault.cannot_export': 'This device cannot save a file outside the vault.',
  'outside_vault.cannot_share': 'This device cannot share a file.',
  'marks_pdf.working': 'Preparing the PDF…',
  // **Neither of these counts chapters, so neither says "chapter".** Reading walks the book's spine files and
  // drawing walks what those were cut into, and neither need match the chapter picker's count. Three numbers under
  // one word is a bug report waiting to happen.
  'marks_pdf.reading': 'Reading {{done}} of {{total}}…',
  'marks_pdf.drawing': 'Drawing {{done}} of {{total}}…',
  'marks_pdf.saving': 'Saving the file…',
  'marks_pdf.failed_inline': 'Could not save the PDF: {{message}}',
  'marks_pdf.suffix': '{{name}}',
  // Two commands. The bare form means the book, which is the convention across the whole ⋯ menu: "Save as PDF" is
  // the book, "Save annotations as PDF" is what you added to it.
  'command_palette.save_annotations_as_pdf': 'Save annotations as PDF…',
  'pane_menu.save_annotations_as_pdf': 'Save annotations as PDF…',
  'command_palette.save_as_pdf': 'Save as PDF…',
  'pane_menu.save_as_pdf': 'Save as PDF…',
  'notices.pdf_fonts_downloading': 'Downloading the expanded character set…',
  'notices.pdf_fonts_failed': 'Could not download the fonts. The PDF will use the built-in ones.',
  'notices.marks_pdf_saved': 'Saved {{name}}',
  'notices.marks_pdf_failed': 'Could not write the PDF: {{error}}',
  'epub_export.save_to_label': 'Save to:',
  // Above the folds, naming the value beside it. The book's title is derived — an index note's frontmatter, then
  // its first heading, then the folder's name — so a bare word there reads as the folder and often is not.
  'epub_export.title_label': 'Title:',
  // The book-details fold's header lists what is filled in; this is what it says when nothing is.
  'epub_export.no_details': 'not set',
  'epub_export.order_customized': '{{name}} (customized)',
  'epub_export.author_desc': 'Used for any note that does not name its own.',
  'epub_export.convert_separate': 'Save {{n}} EPUBs',
  'epub_export.move_up': 'Move up',
  'epub_export.move_down': 'Move down',
  'epub_export.order_appended': '{{n}} notes are not linked from “{{name}}”, so they go at the end in file name order.',
  'epub_export.order_appended_one': '1 note is not linked from “{{name}}”, so it goes at the end in file name order.',
  // One sentence, saying what the control does — the parallel of `split_desc` and `set_split_desc`. No warning about
  // highlights moving when a note is edited and converted again: that is true of re-converting at any split level
  // and is not what this control chooses, so docs/guide/notes-to-epub.md explains it instead.
  'epub_export.split_folder_desc': 'Each note is a chapter. Choose a heading level to split notes further.',
  'epub_export.split_per_note': 'None — one chapter per note',
  // Label and answer, split for `answerFold` — see `marks_pdf.chapters_value`.
  'epub_export.chapters_label': 'Notes to convert',
  'epub_export.chapters_value': '{{n}} chapters',
  'epub_export.chapters_value_one': '1 chapter',
  // Says what the control does, in this mode's terms — nothing else. Not the dialog's own first line restated ("each
  // note is a separate EPUB"), nor a note about highlights moving, which is a property of separate EPUBs rather than
  // of splitting.
  'epub_export.set_split_desc': 'Each note is its own book. Choose a heading level to split those books into chapters.',
  'epub_export.set_split_none': 'None — one chapter per book',
  'epub_export.set_books_value': '{{n}} EPUBs',
  'epub_export.set_books_value_one': '1 EPUB',
  'epub_export.note_sections': '{{n}} chapters',
  'epub_export.loss_links_outside': '{{n}} links point outside this folder and will become plain text.',
  'epub_export.loss_links_outside_one': '1 link points outside this folder and will become plain text.',
  'epub_export.losses_heading': 'Not everything carries over',
  'epub_export.losses_heading_est': 'Not everything carries over (estimated)',
  'epub_export.loss_links': '{{n}} links become plain text.',
  'epub_export.loss_links_one': '1 link becomes plain text.',
  'epub_export.loss_images': '{{n}} images could not be found in your vault.',
  'epub_export.loss_images_one': '1 image could not be found in your vault.',
  'epub_export.loss_svg': '{{n}} drawings or formulas will be left out.',
  'epub_export.loss_svg_one': '1 drawing or formula will be left out.',
  'epub_export.loss_empty': '{{n}} blocks render empty, such as Dataview queries.',
  'epub_export.loss_empty_one': '1 block renders empty, such as a Dataview query.',
  'image_viewer.close': 'Close image',
  'image_viewer.copy': 'Copy image',
  'notices.image_copied_to_clipboard': 'Image copied to clipboard',
  'notices.image_copy_failed': "Couldn't copy the image",
  'notices.title_note_failed': 'The book was written, but its title note was not: {{error}}',
  'notices.title_note_kept_wrote': 'Orbis Reader: kept the title note "{{name}}" — you have written in it.',
  'notices.title_note_kept_properties': 'Orbis Reader: kept the title note "{{name}}" — it has properties you added.',
  'notices.title_note_kept_linked': 'Orbis Reader: kept the title note "{{name}}" — another note links to it.',
  'notices.title_note_kept_other_files': 'Orbis Reader: kept the title note "{{name}}" — it lists another book file.',
  'notices.epub_saved': 'Saved {{name}}.',
  'notices.epub_up_to_date': '{{name}} is already up to date.',
  /**
   * The one question *Read in Orbis Reader* asks — see `ChangedNoteModal.ts` and
   * docs/design/read-in-orbis-reader.md, where every clause of this is argued.
   *
   * **The counts are real plural forms, never `annotation(s)`.** "12 annotations" and "1 annotation" are
   * different decisions, and a book with exactly one is the case nobody tests.
   */
  'read_in_orbis.changed_title': 'This note changed after the book was created',
  'read_in_orbis.changed_title_many': 'This note changed after these versions were created',
  /**
   * **One word for one thing.** *Book* and *version* name the same thing here — "A new book" over a list of
   * "Version 1" would read as two — and **of the book** is the phrase that says so: it is the first appearance of
   * *version* on screen, so it defines the term the rows and the button then inherit.
   *
   * **The count is NOT in this sentence.** A number in prose — "That book has 12 annotations" — would force a
   * singular form, a plural form and a third wording for several books. The list below says it
   * per version, where it is accurate rather than summarized, so the sentence only says the consequence and
   * "these" covers one version or five without a plural form at all.
   */
  'read_in_orbis.changed_body':
    "A new version of the book will have the note's current text but none of the annotations.",
  /**
   * **Each lead-in sits with what it introduces.** The sentence about a new version sits directly above *Create a
   * new version*, not above the list, so the first thing read is not the second thing you could do; this one
   * announces the list.
   *
   * **A colon, and the qualifier before the noun.** "Open an existing version of the book with annotations" can be
   * read as *open it with annotations*: the phrase attaches to the wrong verb. The colon then does the announcing.
   */
  'read_in_orbis.open_intro': 'Open an existing annotated version:',
  // Last line before the choices: nothing is destroyed on either path. **Versions, not books** — the sentence
  // above has just defined the word, and calling them books as well would mix the two again. "Existing" rather
  // than "These", which would leave it ambiguous whether it meant the listed ones or everything.
  'read_in_orbis.kept': 'Existing versions are kept either way.',
  /**
   * **"Version", because the list above says Version 1 and Version 3.** The rows carry the distinction: they name
   * what each one IS, so this only has to name what is new — and *the updated note* is already in the title.
   */
  'read_in_orbis.create_new': 'Create a new version',
  // While a long note is being converted, and only if it takes long enough to be worth saying — see
  // `withDeferredProgress`. No Cancel: the converter cannot be stopped mid-run, and a button that hides a dialog
  // while the book appears anyway is a small lie told by the interface.
  // Named, because a context-menu item acts on a file you may no longer be looking at. The reason goes to the
  // debug log rather than into the notice: a stack trace in a toast helps nobody, and the log can be read on a
  // phone where a console cannot.
  // A voice that cannot start stops listening instead of racing silently through the book. Any engine can fail here,
  // so the notice names no kind of voice; the reason goes to the debug log.
  'notices.listening_stopped_voice_not_loaded': 'Listening stopped — couldn’t load the voice. Check your connection.',
  'notices.read_in_orbis_failed': 'Could not make a book from {{name}}. See the debug log for why.',
  'notices.debug_log_notes_on': 'Debug log: also writing a note for each launch, in {{folder}}',
  'notices.debug_log_note_off': 'Debug log: no longer writing to a note',
  // `test-fixtures.ts`. The zip is published when main's fixtures change, so a local build with fixtures not yet on
  // main finds none.
  'notices.test_fixtures_not_published': "This build's test fixtures are not published yet.",
  'notices.test_fixtures_wrong_file':
    "The downloaded test fixtures are not this build's, so nothing was copied. See the debug log.",
  'notices.test_fixtures_failed': 'Could not download the test fixtures. See the debug log.',
  'notices.test_fixtures_up_to_date': 'The test fixtures are already up to date.',
  'notices.test_fixtures_copied': 'Copied {{count}} test fixtures into {{folder}}.',
  'notices.test_fixtures_copied_one': 'Copied 1 test fixture into {{folder}}.',
  'notices.test_fixtures_partly_copied': 'Copied {{count}} test fixtures. Not copied: {{failed}}. See the debug log.',
  'test_fixtures_dialog.title': 'Copy test fixtures?',
  'test_fixtures_dialog.counts': 'New files: {{added}}. Changed files: {{changed}}.',
  'test_fixtures_dialog.replaced':
    'A changed file replaces the copy in the vault, including a Library title note a test has edited. Nothing is deleted.',
  'test_fixtures_dialog.copy': 'Copy',
  'read_in_orbis.working': 'Making the book',
  'read_in_orbis.working_desc': 'Converting {{name}}…',
  // One row of the pick list, when several versions are annotated. The row leads with the version because that is what
  // the file list shows — `Sample Book review.epub` and `Sample Book review - v002.epub` — and matching a dialog
  // against a folder should not take arithmetic. Version 1 is the book with the plain name.
  'read_in_orbis.version': 'Version {{n}}',
  'read_in_orbis.open': 'Open',
  'read_in_orbis.annotations': '{{count}} annotations',
  'read_in_orbis.annotations_one': '1 annotation',
  'notices.epub_images_failed': 'Saved {{name}}, but {{n}} images could not be downloaded.',
  'notices.epub_images_failed_one': 'Saved {{name}}, but 1 image could not be downloaded.',
  'epub_overwrite.title': 'Replace this EPUB?',
  'epub_overwrite.source_changed':
    'The previously generated EPUB has annotations, and the source changed after generation. Annotations are kept, however they may be in the wrong place when it is regenerated.',
  'epub_overwrite.body_plain': 'There is already a file with this name here. Saving will replace it.',
  // Asked only when a book's text changed and something is saved in it. "The source changed" is the cause in one
  // phrase — "positions may shift" with no cause read as though the reader had done something wrong — and the guide
  // lists what counts: an edited note or embed, other chapter breaks, a converter that now writes differently.
  'epub_overwrite.title_set': 'Replace these EPUBs?',
  'epub_overwrite.set_source_changed':
    '{{n}} of the previously generated EPUBs have annotations, and their sources changed after generation. Annotations are kept, however they may be in the wrong place when they are regenerated.',
  'epub_overwrite.set_source_changed_one':
    '1 of the previously generated EPUBs has annotations, and its source changed after generation. Annotations are kept, however they may be in the wrong place when it is regenerated.',
  'epub_overwrite.replace': 'Replace',
  'pdf_overwrite.title': 'Overwrite PDF?',
  'pdf_overwrite.body': 'There is already a file with the same name in the target location. Replace will overwrite it.',
  'command_palette.remove_records_of_deleted_content': 'Remove records of deleted content…',
  'command_palette.reading_record_for_this_book': 'Reading record for this book…',
  'records_cleanup.title': 'Remove records of deleted content',
  'records_cleanup.none': 'Nothing to remove — every note here still matches something in the book.',
  'records_cleanup.removable': '{{count}} notes can be removed. Nothing of yours is in them.',
  'records_cleanup.removable_one': '1 note can be removed. Nothing of yours is in it.',
  'records_cleanup.yours_intro':
    '{{count}} notes are kept, because you wrote in them, added properties, or linked to them from another note. Delete these by hand if you want them gone:',
  'records_cleanup.yours_intro_one':
    '1 note is kept, because you wrote in it, added properties, or linked to it from another note. Delete it by hand if you want it gone:',
  'records_cleanup.remove': 'Remove {{count}}',
  'records_cleanup.removed': 'Removed {{count}} notes.',
  'records_cleanup.removed_one': 'Removed 1 note.',
  'notices.no_highlights': 'No passage selections',
  'notices.no_notes': 'No notes',
  'notices.no_bookmarks': 'No bookmarks',
  'notices.no_reading_locations_found_for_this_book': 'No reading locations found for this book',
  'notices.highlights_copied_to_clipboard': 'Passage selections copied to clipboard',
  'notices.notes_copied_to_clipboard': 'Notes copied to clipboard',
  'notices.bookmarks_copied_to_clipboard': 'Bookmarks copied to clipboard',
  // After Cycle text alignment: which of the three it landed on, in the Alignment dropdown's own words.
  'notices.text_alignment_now': 'Text alignment: {{align}}',
  'notices.locations_updated_for_n_annotations': 'Locations updated for {{n}} annotations',
  'notices.locations_updated_for_n_annotations_one': 'Locations updated for 1 annotation',
  'notices.orbis_reader_error_msg': 'Orbis Reader error: {{msg}}',
  // A book that would not open, in place of the reading engine's own words — see `book-open-error.ts`. Each follows
  // *Orbis Reader error:*, and {{format}} is what the file's name claims it is: EPUB, MOBI, AZW3, CBZ or FB2.
  'book_open.empty': 'This file is empty',
  'book_open.not_valid': "This file isn't a valid {{format}} file",
  'book_open.damaged': "This {{format}} file is damaged and can't be opened",
  'book_open.protection_not_in_place':
    "No book can be opened in this version of Obsidian: the protection that keeps a book's content from running couldn't be put in place",
  'book_open.could_not_open': 'Could not open this {{format}} file: {{reason}}',
  'notices.saved_to_path': 'Saved to {{path}}',
  /**
   * The header's count line — "1 bookmark · 8 passage selections · 3 notes".
   *
   * **Real plural forms, in the page's own word.** "highlights" four inches above a section headed *Passage
   * selections* would be one screen, two vocabularies. A hand-rolled plural here is invisible to `lint:i18n`: the
   * literals sit in `parts.push(...)` rather than at the sink, which receives an already-joined string, and
   * `looksLikeProse` rejects a bare lowercase word like `highlight`, which is exactly the shape such a plural has.
   */
  'orbis_data_view.count_bookmarks': '{{count}} bookmarks',
  'orbis_data_view.count_bookmarks_one': '1 bookmark',
  'orbis_data_view.count_selections': '{{count}} passage selections',
  'orbis_data_view.count_selections_one': '1 passage selection',
  'orbis_data_view.count_notes': '{{count}} notes',
  'orbis_data_view.count_notes_one': '1 note',
  'orbis_data_view.could_not_load_reading_data': 'Could not load reading data.',
  'orbis_data_view.average_reading_speed_n_wpm': 'Average reading speed: {{n}} wpm',
  // **"Last read", not "Last annotation".** The date comes from `readingStats.lastUpdated`, which the pace sampler
  // stamps as pages turn and nothing else writes — it has nothing to do with annotations. The separator is not in
  // the string: the line is joined from parts, so a book with no established pace yet shows the date alone rather
  // than opening with a stray middle dot.
  'orbis_data_view.last_read_date': 'Last read: {{date}}',
  'orbis_data_view.reading_activity': 'Reading activity',
  'orbis_data_view.device': 'Device',
  'orbis_data_view.last_opened': 'Last opened',
  'orbis_data_view.last_location': 'Last location',
  'orbis_data_view.unknown': '(unknown)',
  'orbis_data_view.contents': 'Contents',
  // Sits three rows under this page's own *Notes* section — see `tab_tooltips.backlinks` for why the word `vault`
  // is doing the work here, and why both surfaces use one name.
  'orbis_data_view.linked_notes': 'Linked vault notes',
  'orbis_data_view.none_yet': 'None yet.',
  'orbis_data_view.no_book_open': 'Could not navigate — no book is open.',
  'orbis_data_view.book_file_not_found': 'Book file not found.',
  'orbis_data_view.could_not_open_reading_data_file': 'Could not open reading data file.',
  'orbis_data_view.scanning': 'Scanning…',
  'orbis_data_view.could_not_open_book_msg': 'Could not open book: {{msg}}',
  // The chip that opens the panel, and the palette command that shows the chip. Not in `toolbar.*`: it is a
  // floating chip over the reading surface, and in the data view an item on the ⋯ menu — neither of which is a
  // toolbar.
  /**
   * The `!readme.md` Orbis writes into every `!orbis-data` folder.
   *
   * **Keys, not a template literal**, which `lint:i18n` cannot see — a top-level `const` is never at a sink. The
   * file Orbis puts in your vault to explain itself has to be reachable by a locale, and to keep the plugin's
   * current vocabulary, like any other text.
   *
   * The table is assembled in `book-data-file.ts` rather than kept here as one block: a locale should translate
   * cells, not Markdown pipes.
   */
  'book_data_readme.heading': 'Orbis Reader Data',
  'book_data_readme.intro':
    'This folder is managed by the Orbis Reader plugin. Do not rename or delete files here manually.',
  'book_data_readme.col_file': 'File',
  'book_data_readme.col_contents': 'Contents',
  'book_data_readme.row_orbis': 'Passage selections, notes, and bookmarks — select to view',
  'book_data_readme.row_location': 'Per-device reading location (used for cross-device sync)',
  'book_data_readme.row_marks':
    'Per-device changes to passage selections, notes and bookmarks, combined into the .orbis file',
  'book_data_readme.row_pages': 'Page count cache (rebuilt automatically if deleted)',
  // The folder the recorded-voice feature fills. Says when it appears, because most folders will not have one.
  'book_data_readme.row_audio': 'Recorded audio, one folder per book — only when you record a book for listening',
  // Says the rule and the reason in one line, because the reason is the only thing that makes a name like
  // `sample.epub.orbis` look deliberate rather than doubled.
  'book_data_readme.naming':
    'Each name starts with the whole name of the book file it belongs to, extension included — `sample.epub.orbis` — so two formats of one book keep separate data.',
  'debug_panel.toggle': 'Toggle debug log',
  // The data view's pane-menu item, which says which way it will go. Two keys rather than one with a variable:
  // a locale may not build both from one word.
  'debug_panel.show_log': 'Show debug log',
  'debug_panel.hide_log': 'Hide debug log',
  'debug_panel.debug_log': 'Debug log',
  'debug_panel.copy': 'Copy',
  'debug_panel.clear': 'Clear',
  'debug_panel.write_to_note': 'Write to note',
  'debug_panel.note_recovered': 'Lines the last launch logged that never reached {{path}}:',
  'debug_panel.note_this_launch': 'This launch:',

  // No frontmatter-key-language strings, and no settings row for them: with `en.ts` the only locale, both values of
  // `frontmatterKeyLanguage` resolve to the same key, so the control could not change a file.
  // `OrbisSettings.bookExportItems` carries the full reasoning and what brings the row back — and the `date_read`
  // example needs fixing first; it is written as a literal.
  'save_as_markdown_page.heading': 'Save as Markdown',

  // Tokens
  'tokens.title': 'title',
  'tokens.author': 'author',
  'tokens.date': 'date',
  'tokens.tags': 'tags',

  // Frontmatter keys
  'frontmatter.date_read': 'date_read',
  'frontmatter.last_opened': 'last_opened',
  'frontmatter.progress': 'progress',
} as const;

export type TranslationKey = keyof typeof en;
export type Translations = Record<TranslationKey, string>;
export default en;
