import { setTooltip, ToggleComponent } from 'obsidian';
import { parseBoldText } from './bold-text';
import { fontChoices } from './fonts';
import { autoHyphenates, HYPHENATION_LABELS } from './hyphenation';
import { t } from './i18n';
import { PAGE_TURN_LABELS, parsePageTurn } from './page-turn';
import { navbarClearance } from './reader/viewport-insets';
import { resolveThemeId, type ThemeSettings, themeChoices } from './reader-themes';
import { DisplaySettings, Flow, parseHyphenation, parseTextAlign } from './settings';
import { isSliderDragging } from './slider-input';
import { SPACING_LABELS, TEXT_SPACING, type TextSpacing } from './text-spacing';
import { ignoreObsidianSwipe, setSvgIcon } from './ui-utils';

export interface DisplayMenuView {
  settings: DisplaySettings;
  /** Which themes exist and which are offered — see `reader-themes.ts` — and which fonts the Font list leaves out. */
  plugin: { settings: ThemeSettings & { hiddenFonts?: string[] } };
  contentEl: HTMLElement;
  hostEl: HTMLElement | null;
  displayMenuWrapper?: HTMLElement;
  level2Toolbar: HTMLElement | null;
  level3Container: HTMLElement | null;
  displayTabBtns: Record<string, HTMLButtonElement>;
  displayDrawers: Record<string, HTMLElement>;
  activeDisplayTab: string | null;
  displayMenuOverlay: HTMLElement | null;
  displayStyleBtn: HTMLElement | null;
  syncDisplayMenu?: () => void;
  /** Lays the open drawer out again for its width — see `fitDrawer`. */
  fitDisplayDrawer?: () => void;
  register: (cb: () => void) => void;
  activateDisplayTab: (id: string) => void;
  closeDisplayMenu: () => void;
  toggleDisplayMenu: () => void;
  adjustBrightness: (val: number) => void;
  saveSetting: (key: string, value: unknown) => void;
  bindRealTimeSlider: (
    numInput: HTMLInputElement,
    slider: HTMLInputElement,
    min: number,
    max: number,
    initial: number,
    onUpdate: (val: number) => void,
    displayToValue?: (val: number) => number,
    valueToDisplay?: (val: number) => number
  ) => void;
}

/**
 * The unit after a slider's number field — the same element, in the same place, as on **Settings → Appearance**
 * (`styleSliderRow`), so the two surfaces read alike and a bare `3` is never left to mean a percentage.
 */
function unitAfter(wrap: HTMLElement, unit: string): void {
  wrap.createSpan({ text: unit, cls: 'orbis-unit-suffix' });
}

/** A drawer at least this wide may put its form's rows two across when they are too tall for the room (`fitDrawer`). */
const TWO_ACROSS_WIDTH = 680;

/**
 * **A form drawer's rows on one line while they fit, and lined up as a form once they do not.** On one line they read
 * as a bar. Wrapped, each row is as wide as its own label and control and the bar pushes them to the right, so no
 * two labels, sliders or fields start at the same place. As a form (`is-form`) the labels make one column and the
 * controls the next, and the number fields, the units and the dropdowns' right edges line up.
 *
 * **Two across when the form is too tall and the drawer is wide** (`is-two-across`): a phone on its side has the width
 * for two rows side by side and not the height for them stacked, so its form is half as tall rather than scrolled.
 *
 * **A page button, at the top right in every layout** (`pageToggle`): at the end of the line, on a short row of its own
 * above a form that fits the room (`is-button-row`), so the rows have the width, or in a column beside one that does
 * not. Always as tall as the page's first row, so it is in the same place on each page whatever layout each has: a
 * page of three controls can fit on one line where one of four cannot.
 *
 * Measured rather than set by a width in the stylesheet, since where the rows wrap depends on the labels' language,
 * the interface font and which drawer it is. Measured on one line each time, so widening the pane brings the bar back.
 * `room` is the height the tab may have (`roomBelow`).
 */
function fitDrawer(drawer: HTMLElement, room: number): void {
  if (!drawer.hasClass('orbis-form-drawer') || !drawer.isShown()) return;
  const pageButton = drawer.querySelector<HTMLElement>('.orbis-drawer-page-btn');
  const rowsShown = () =>
    Array.from(drawer.children).filter((row) => row.getClientRects().length > 0 && row !== pageButton) as HTMLElement[];
  drawer.removeClass('is-form', 'is-two-across', 'is-button-row');
  const rows = rowsShown();
  const first = rows[0]?.getBoundingClientRect();
  if (!first?.height) return;
  // Each row is its own grid, so the columns that vary, the label and the unit, are the widest of the page shown.
  const widest = (selector: string) =>
    Math.ceil(Math.max(0, ...Array.from(drawer.querySelectorAll(selector), (el) => el.getBoundingClientRect().width)));
  drawer.setCssProps({
    '--orbis-form-label': `${widest('.orbis-drawer-label')}px`,
    '--orbis-form-unit': `${widest('.orbis-unit-suffix')}px`,
  });
  const boxes = [...rows, ...(pageButton ? [pageButton] : [])].map((el) => el.getBoundingClientRect());
  const form = boxes.some((box) => box.top >= first.bottom);
  const tooTall = () => drawer.getBoundingClientRect().height > room;
  let buttonRow = false;
  if (form) {
    drawer.addClass('is-form');
    if (pageButton) {
      drawer.addClass('is-button-row');
      buttonRow = !tooTall();
      if (!buttonRow) drawer.removeClass('is-button-row');
    }
    if (!buttonRow && (drawer.parentElement?.clientWidth ?? 0) >= TWO_ACROSS_WIDTH && tooTall()) {
      drawer.addClass('is-two-across');
    }
  }
  // The keyboard meets the button where it shows: first when it is above the rows, last beside or after them.
  if (pageButton && (drawer.firstElementChild === pageButton) !== buttonRow) {
    const focused = pageButton.doc.activeElement === pageButton;
    if (buttonRow) drawer.prepend(pageButton);
    else drawer.append(pageButton);
    if (focused) pageButton.focus();
  }
  const twoAcross = drawer.hasClass('is-two-across');
  drawer.setCssProps({
    // The lines of rows a page button spans beside a form, so it can stay at the top as they scroll.
    '--orbis-form-rows': String(twoAcross ? Math.ceil(rows.length / 2) : rows.length),
    // The first row's height, which the page button takes so it is level with that row in every layout.
    '--orbis-first-row': `${Math.ceil(rows[0].getBoundingClientRect().height)}px`,
  });
}

/** The least the open tab is given, so a screen with almost no room still shows a row to scroll from. */
const MIN_DRAWER_HEIGHT = 96;

/**
 * **The open tab stops above whatever covers the bottom of the pane, and scrolls inside when it is taller.** The bar
 * hangs below the toolbar, over the book, and on a phone in landscape a tab of four rows reaches under Obsidian's own
 * toolbar at the bottom of the screen. Measured, as the dialogs measure it (`navbarClearance`): 0 where there is no
 * navbar, a desktop or focus mode, so there only the pane's own bottom limits it.
 */
function roomBelow(container: HTMLElement, pane: HTMLElement): number {
  const win = container.win;
  const bottom = Math.min(pane.getBoundingClientRect().bottom, win.innerHeight - navbarClearance(win));
  return Math.max(Math.floor(bottom - container.getBoundingClientRect().top), MIN_DRAWER_HEIGHT);
}

/** The chevron on More and Back, pointing where the button goes. */
const chevron = (direction: 'left' | 'right') =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${direction === 'right' ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'}"/></svg>`;

/**
 * **One button for both pages of a drawer: More › on the first, ‹ Back on the second, in the same place.** The same
 * element, relabelled, so the two cannot end up apart and the keyboard stays on it as the page changes. Last in the
 * drawer, so on one line it is at the far right and the keyboard reaches it after the controls; when the rows stack it
 * has a column of its own at the top right, held there as the tab scrolls (styles.css, `.has-pages`). As wide as the
 * wider of its two labels, both drawn in one place and one hidden, so the rows do not move as it changes.
 *
 * `firstPages` collects how to put the drawer back on its first page, which choosing a tab does.
 */
function pageToggle(drawer: HTMLElement, firstPages: Array<() => void>, relayout: () => void): void {
  const btn = drawer.createEl('button', { cls: 'orbis-drawer-btn orbis-drawer-page-btn' });
  const more = btn.createSpan({ cls: 'orbis-drawer-page-label is-more-label' });
  more.createSpan({ text: t('display_menu.more') });
  setSvgIcon(more.createSpan({ cls: 'orbis-drawer-page-icon' }), chevron('right'));
  const back = btn.createSpan({ cls: 'orbis-drawer-page-label is-back-label' });
  setSvgIcon(back.createSpan({ cls: 'orbis-drawer-page-icon' }), chevron('left'));
  back.createSpan({ text: t('action.back') });
  const show = (onMore: boolean) => {
    drawer.toggleClass('is-more', onMore);
    btn.setAttribute('aria-label', t(onMore ? 'display_menu.back_to_spacing' : 'display_menu.more_spacing'));
  };
  show(false);
  btn.addEventListener('click', () => {
    show(!drawer.hasClass('is-more'));
    relayout();
    // Kept on the button, which a click does not do everywhere (WebKit), so the keyboard goes on from where it was.
    btn.focus();
  });
  firstPages.push(() => show(false));
}

export function buildDisplayMenu(view: DisplayMenuView, toolbar: HTMLElement): void {
  // Wrapper for overlay positioning
  view.displayMenuWrapper = view.contentEl.createDiv({ cls: 'orbis-display-menu-wrapper' });
  // The tab row and every tab's controls: a sideways drag here is a slip, not a request for Obsidian's side panels.
  ignoreObsidianSwipe(view.displayMenuWrapper);
  view.displayMenuWrapper.hide();
  toolbar.appendChild(view.displayMenuWrapper);

  // Level 2 Toolbar (initially hidden)
  view.level2Toolbar = view.displayMenuWrapper.createDiv({ cls: 'orbis-level2-toolbar' });
  view.level2Toolbar.setAttribute('role', 'tablist');
  view.level2Toolbar.setAttribute('aria-label', t('display_menu.display_style_options'));
  view.level2Toolbar.hide();

  const addTab = (id: string, title: string, svg: string) => {
    const btn = view.level2Toolbar!.createEl('button', { cls: 'orbis-ctrl-btn orbis-display-tab-btn', title });
    btn.id = `orbis-drawer-tab-${id}`;
    // Obsidian's own hover-tooltip UI reads the nearest ancestor's aria-label,
    // not the native title attribute — without this, hovering a tab bubbles up
    // to level2Toolbar's aria-label ("Display style options") instead of showing
    // this tab's own name.
    btn.setAttribute('aria-label', title);
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', 'false');
    btn.setAttribute('tabindex', '-1');
    btn.setAttribute('aria-controls', `orbis-drawer-${id}`);
    const iconSpan = btn.createSpan({ cls: 'orbis-display-tab-icon' });
    setSvgIcon(iconSpan, svg);
    btn.createSpan({ cls: 'orbis-display-tab-label', text: title });
    view.displayTabBtns[id] = btn;
    btn.addEventListener('click', () => openTab(id));
  };
  /** A tab opens on its first page, so Spacing's More page is never what a tab shows when it is chosen again. */
  const firstPages: Array<() => void> = [];
  const openTab = (id: string) => {
    for (const firstPage of firstPages) firstPage();
    view.activateDisplayTab(id);
  };

  addTab(
    'theme',
    t('display_menu.theme'),
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="6" x="2" y="2" rx="2"/><path d="M10 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect width="4" height="6" x="8" y="16" rx="1"/></svg>'
  );
  addTab(
    'structure',
    t('display_menu.layout'),
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'
  );
  addTab(
    'spacing',
    t('display_menu.spacing'),
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21h16"/><path d="M4 3h16"/><path d="M12 21V3"/><path d="m8 17 4 4 4-4"/><path d="m8 7 4-4 4 4"/></svg>'
  );
  addTab(
    'font',
    t('display_menu.font'),
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>'
  );

  view.level2Toolbar.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const keys = Object.keys(view.displayTabBtns);
      if (keys.length === 0) return;
      const currentIndex = view.activeDisplayTab ? keys.indexOf(view.activeDisplayTab) : -1;
      let nextIndex = 0;
      if (currentIndex !== -1) {
        if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % keys.length;
        if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + keys.length) % keys.length;
      }
      const nextId = keys[nextIndex];
      if (nextId) {
        openTab(nextId);
        view.displayTabBtns[nextId]?.focus();
      }
      e.preventDefault();
    }
  });

  view.displayMenuWrapper.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      view.closeDisplayMenu();
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // Level 3 Container (initially hidden)
  view.level3Container = view.displayMenuWrapper.createDiv({ cls: 'orbis-level3-container' });
  view.level3Container.hide();

  const createDrawer = (id: string, cls = '') => {
    const drawer = view.level3Container!.createDiv({ cls: `orbis-level3-drawer ${cls}` });
    drawer.id = `orbis-drawer-${id}`;
    drawer.setAttribute('role', 'tabpanel');
    drawer.setAttribute('aria-labelledby', `orbis-drawer-tab-${id}`);
    drawer.hide();
    view.displayDrawers[id] = drawer;
    return drawer;
  };

  // --- Theme & Brightness Drawer ---
  const themeDrawer = createDrawer('theme', 'orbis-flex-wrap orbis-form-drawer');

  // Theme selection
  const themeWrap = themeDrawer.createDiv({ cls: 'orbis-slider-drawer' });
  themeWrap.createSpan({
    text: t('display_menu.reader_theme'),
    cls: 'orbis-drawer-label',
  });
  const themeSelect = themeWrap.createEl('select', { cls: 'dropdown orbis-dropdown' });
  // Refilled on every sync, since switching a theme on or off in the Theme manager changes what is offered here.
  const fillThemes = (): void => {
    const themes = view.plugin.settings;
    const current = resolveThemeId(view.settings.theme, themes);
    themeSelect.empty();
    for (const choice of themeChoices(themes, current)) {
      themeSelect.createEl('option', { value: choice.id, text: choice.label });
    }
    themeSelect.value = current;
  };
  fillThemes();
  themeSelect.addEventListener('change', () => {
    view.settings.theme = themeSelect.value;
    // Applied by the announcement `saveSetting` makes, which the view hears as Settings and other tabs are heard: see
    // `installReactiveSettingsSync`. Applying it here as well did every restyle twice.
    view.saveSetting('theme', themeSelect.value);
  });

  // Brightness slider
  const brightWrap = themeDrawer.createDiv({ cls: 'orbis-slider-drawer' });
  brightWrap.createSpan({ text: t('toolbar.brightness'), cls: 'orbis-drawer-label' });
  const brightSlider = brightWrap.createEl('input');
  brightSlider.type = 'range';
  brightSlider.min = '20';
  brightSlider.max = '100';
  brightSlider.value = String(view.settings.brightness);
  const brightNum = brightWrap.createEl('input', { type: 'number', cls: 'orbis-num-input-sm' });
  unitAfter(brightWrap, '%');
  view.bindRealTimeSlider(brightNum, brightSlider, 20, 100, view.settings.brightness, (val: number) => {
    view.adjustBrightness(val);
  });

  // --- Structure Drawer ---
  const structureDrawer = createDrawer('structure', 'orbis-flex-wrap orbis-form-drawer');

  // Flow mode dropdown
  const modeWrap = structureDrawer.createDiv({ cls: 'orbis-slider-drawer' });
  modeWrap.createSpan({
    text: t('display_menu.mode'),
    cls: 'orbis-drawer-label',
    attr: { 'aria-label': t('display_menu.reading_mode') },
  });
  const modeSelect = modeWrap.createEl('select', { cls: 'dropdown orbis-dropdown' });
  modeSelect.createEl('option', { value: 'paginated', text: t('display_menu.paged_mode') });
  modeSelect.createEl('option', { value: 'scrolled', text: t('display_menu.scrolled_mode') });
  modeSelect.value = view.settings.flow;

  /**
   * **Page turn, under Mode**: how a page turns in Paged mode, None or Slide (`page-turn.ts`). Hidden while scrolling,
   * since a scrolled book has no pages to turn; the choice is kept for paged mode.
   */
  const turnWrap = structureDrawer.createDiv({ cls: 'orbis-slider-drawer' });
  turnWrap.createSpan({ text: t('appearance_page.page_turn'), cls: 'orbis-drawer-label' });
  const turnSelect = turnWrap.createEl('select', { cls: 'dropdown orbis-dropdown' });
  turnSelect.setAttribute('aria-label', t('appearance_page.page_turn'));
  for (const [value, key] of Object.entries(PAGE_TURN_LABELS)) turnSelect.createEl('option', { value, text: t(key) });
  turnSelect.addEventListener('change', () => {
    const next = parsePageTurn(turnSelect.value);
    view.settings.pageTurn = next;
    view.saveSetting('pageTurn', next);
  });

  /**
   * **Two-column layout, a labeled switch under Page turn** — Obsidian's switch, as Bold text is on the Font tab and
   * as Settings → Appearance has it. Not an icon: every other control on the bar says what it is in words. Not a
   * "Columns: 1 / 2" dropdown either, because 2 would promise what a phone held upright never shows.
   * On means the preference is on, not that two columns are showing: they appear only where the reading area is wide
   * enough, which a phone reaches in landscape — so it is not hidden on phones. Settings and the guide say so.
   *
   * **Hidden while scrolling**, as Page turn is, not grayed: a scrolled book has one column, so there is nothing for it
   * to do. The preference is kept rather than reset, so going back to paged mode brings it back — see `applyRenderer`.
   */
  const colWrap = structureDrawer.createDiv({ cls: 'orbis-slider-drawer' });
  colWrap.createSpan({ text: t('display_menu.two_column_layout'), cls: 'orbis-drawer-label' });
  const colToggle = new ToggleComponent(colWrap);
  colToggle.toggleEl.querySelector('input')?.setAttribute('aria-label', t('display_menu.two_column_layout'));
  colToggle.setValue(view.settings.columns === 2).onChange((on) => {
    // `setValue` runs this too, as the sync below writes an outside change: only a change is saved.
    const next = on ? 2 : 1;
    if (view.settings.columns === next) return;
    view.settings.columns = next;
    view.saveSetting('columns', next);
  });

  // Remembered, not read from the page: in a tab that is not open the rows are never shown, whatever the mode.
  let pagedShown = true;
  const updateStructureBtns = () => {
    modeSelect.value = view.settings.flow;
    turnSelect.value = view.settings.pageTurn;
    colToggle.setValue(view.settings.columns === 2);
    const paged = view.settings.flow !== 'scrolled';
    // Rows coming or going change the tab's shape, so it is laid out again — only then, not on every sync.
    if (pagedShown !== paged) {
      pagedShown = paged;
      turnWrap.toggle(paged);
      colWrap.toggle(paged);
      view.fitDisplayDrawer?.();
    }
  };

  modeSelect.addEventListener('change', () => {
    const newFlow = modeSelect.value as Flow;
    view.settings.flow = newFlow;
    view.saveSetting('flow', newFlow); // applied as the theme is, above
    updateStructureBtns();
  });
  updateStructureBtns();

  // --- Font Drawer ---
  const fontDrawer = createDrawer('font', 'orbis-flex-wrap orbis-form-drawer');

  const fontSelectWrap = fontDrawer.createDiv({ cls: 'orbis-slider-drawer' });
  fontSelectWrap.createSpan({
    text: t('display_menu.font'),
    cls: 'orbis-drawer-label',
    attr: { 'aria-label': t('display_menu.font') },
  });
  const fontSelect = fontSelectWrap.createEl('select', { cls: 'dropdown orbis-dropdown' });
  // Refilled on every sync: a font imported, downloaded or switched off on the Fonts page changes the list.
  const fillFonts = () => {
    const current = view.settings.fontFamily || 'default';
    fontSelect.empty();
    for (const choice of fontChoices(view.plugin.settings.hiddenFonts ?? [], current, fontSelect.doc)) {
      fontSelect.createEl('option', { value: choice.value, text: choice.label });
    }
    fontSelect.value = current;
  };
  fillFonts();
  fontSelect.addEventListener('change', () => {
    view.settings.fontFamily = fontSelect.value;
    view.saveSetting('fontFamily', fontSelect.value);
  });

  const fsWrap = fontDrawer.createDiv({ cls: 'orbis-slider-drawer' });
  fsWrap.createSpan({
    text: t('display_menu.size'),
    cls: 'orbis-drawer-label',
    attr: { 'aria-label': t('display_menu.font_size') },
  });
  const fsSlider = fsWrap.createEl('input');
  fsSlider.type = 'range';
  fsSlider.min = '80';
  fsSlider.max = '300';
  fsSlider.value = String(view.settings.fontSize);
  const fsNum = fsWrap.createEl('input', { type: 'number', cls: 'orbis-num-input-sm' });
  unitAfter(fsWrap, '%');
  view.bindRealTimeSlider(fsNum, fsSlider, 80, 300, view.settings.fontSize, (val: number) => {
    view.settings.fontSize = val;
    view.saveSetting('fontSize', val);
  });

  // Bold text, under Size: Obsidian's own switch, as on Settings → Appearance (`bold-text.ts`).
  const boldWrap = fontDrawer.createDiv({ cls: 'orbis-slider-drawer' });
  boldWrap.createSpan({ text: t('appearance_page.bold_text'), cls: 'orbis-drawer-label' });
  const boldToggle = new ToggleComponent(boldWrap);
  boldToggle.toggleEl.querySelector('input')?.setAttribute('aria-label', t('appearance_page.bold_text'));
  boldToggle.setValue(view.settings.boldText === 'on').onChange((on) => {
    // `setValue` runs this too, as the sync below writes an outside change: only a change is saved.
    const next = parseBoldText(on ? 'on' : 'off');
    if (view.settings.boldText === next) return;
    view.settings.boldText = next;
    view.saveSetting('boldText', next);
  });

  /**
   * --- Spacing Drawer ---
   *
   * **Two pages in one tab.** Margins, line spacing and alignment, which most readers change, are its first page; the
   * rest is behind **More**, a second page in the same place rather than a dialog, so the book stays in view while a
   * setting is dragged. Each row says which page it is on (`orbis-drawer-main`, `orbis-drawer-more`), and the drawer
   * which page shows (`is-more`). The button between them is `pageToggle`, below.
   */
  const spacingDrawer = createDrawer('spacing', 'orbis-flex-wrap orbis-form-drawer has-pages');

  // Margins
  const marginsWrap = spacingDrawer.createDiv({ cls: 'orbis-slider-drawer orbis-drawer-main' });
  marginsWrap.createSpan({
    text: t('display_menu.margins'),
    cls: 'orbis-drawer-label',
    attr: { 'aria-label': t('display_menu.text_margins') },
  });
  const marginsSlider = marginsWrap.createEl('input');
  marginsSlider.type = 'range';
  marginsSlider.min = '0';
  marginsSlider.max = '12';
  marginsSlider.value = String(view.settings.margins);
  const marginsNum = marginsWrap.createEl('input', { type: 'number', cls: 'orbis-num-input-sm' });
  unitAfter(marginsWrap, '%');
  view.bindRealTimeSlider(marginsNum, marginsSlider, 0, 12, view.settings.margins, (val: number) => {
    view.settings.margins = val;
    view.saveSetting('margins', val);
  });

  // Line Height
  // Named in full: "Spacing" was enough while it was the tab's only spacing, and the More page has three more.
  const lhWrap = spacingDrawer.createDiv({ cls: 'orbis-slider-drawer orbis-drawer-main' });
  lhWrap.createSpan({ text: t('display_menu.line_spacing'), cls: 'orbis-drawer-label' });
  const lhSlider = lhWrap.createEl('input');
  lhSlider.type = 'range';
  lhSlider.min = '10';
  lhSlider.max = '30';
  lhSlider.value = String(Math.round(view.settings.lineHeight * 10));
  const lhNum = lhWrap.createEl('input', { type: 'number', cls: 'orbis-num-input-sm' });
  unitAfter(lhWrap, '×');
  view.bindRealTimeSlider(
    lhNum,
    lhSlider,
    10,
    30,
    Math.round(view.settings.lineHeight * 10),
    (val: number) => {
      view.settings.lineHeight = val / 10;
      view.saveSetting('lineHeight', val / 10);
    },
    (v: number) => v / 10,
    (v: number) => Math.round(v * 10)
  );

  /**
   * **Alignment, as a dropdown with the setting's three answers** — follow the book, left, justified (`TextAlign`).
   * Not two buttons with "neither lit" meaning the book's: two controls for one state read as two settings. Its own
   * row, like the Layout tab's Mode, and the same three answers as Settings.
   */
  const alignWrap = spacingDrawer.createDiv({ cls: 'orbis-slider-drawer orbis-drawer-main' });
  alignWrap.createSpan({ text: t('display_menu.alignment'), cls: 'orbis-drawer-label' });
  const alignSelect = alignWrap.createEl('select', { cls: 'dropdown orbis-dropdown' });
  alignSelect.setAttribute('aria-label', t('appearance_page.text_alignment'));
  for (const [value, key] of [
    ['book', 'appearance_page.text_align_book'],
    ['left', 'appearance_page.text_align_left'],
    ['justify', 'appearance_page.text_align_justify'],
  ] as const) {
    alignSelect.createEl('option', { value, text: t(key) });
  }
  const syncAlign = () => {
    alignSelect.value = view.settings.textAlign;
  };
  alignSelect.addEventListener('change', () => {
    const next = parseTextAlign(alignSelect.value);
    view.settings.textAlign = next;
    view.saveSetting('textAlign', next);
  });
  syncAlign();

  /**
   * Character, word and paragraph spacing, on the More page, each in percent of the font size from 0, the book's own
   * (`text-spacing.ts`). The same shape as margins, and the same three rows as Settings → Appearance.
   */
  const spacingSliders = (Object.keys(TEXT_SPACING) as (keyof TextSpacing)[]).map((name) => {
    const wrap = spacingDrawer.createDiv({ cls: 'orbis-slider-drawer orbis-drawer-more' });
    wrap.createSpan({ text: t(SPACING_LABELS[name]), cls: 'orbis-drawer-label' });
    const slider = wrap.createEl('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(TEXT_SPACING[name].max);
    slider.value = String(view.settings[name]);
    slider.setAttribute('aria-label', t(SPACING_LABELS[name]));
    const num = wrap.createEl('input', { type: 'number', cls: 'orbis-num-input-sm' });
    unitAfter(wrap, '%');
    view.bindRealTimeSlider(num, slider, 0, TEXT_SPACING[name].max, view.settings[name], (val: number) => {
      view.settings[name] = val;
      view.saveSetting(name, val);
    });
    return { name, slider, num };
  });

  // Hyphenation, on the More page: Settings' three answers (`Hyphenation`).
  const hyphenWrap = spacingDrawer.createDiv({ cls: 'orbis-slider-drawer orbis-drawer-more' });
  const hyphenLabel = hyphenWrap.createSpan({ text: t('display_menu.hyphenation'), cls: 'orbis-drawer-label' });
  const hyphenSelect = hyphenWrap.createEl('select', { cls: 'dropdown orbis-dropdown' });
  hyphenSelect.setAttribute('aria-label', t('appearance_page.hyphenation'));
  // Where this device cannot hyphenate, On is marked with an asterisk and the tooltip says why. No room for more.
  const hyphenates = autoHyphenates(hyphenSelect.doc);
  for (const [value, key] of Object.entries(HYPHENATION_LABELS)) {
    const text = value === 'on' && !hyphenates ? t('display_menu.hyphenation_on_unsupported') : t(key);
    hyphenSelect.createEl('option', { value, text });
  }
  if (!hyphenates) {
    // `setTooltip` writes its text into `aria-label`, so the select is named from its visible label instead, which
    // `aria-labelledby` lets win, and a screen reader gets the note as the select's description.
    const note = `* ${t('appearance_page.hyphenation_unsupported')}`;
    hyphenLabel.id = `orbis-hyphenation-label-${crypto.randomUUID()}`;
    setTooltip(hyphenSelect, note);
    hyphenSelect.setAttribute('aria-labelledby', hyphenLabel.id);
    hyphenSelect.setAttribute('aria-description', note);
  }
  const syncHyphenation = () => {
    hyphenSelect.value = view.settings.hyphenation;
  };
  hyphenSelect.addEventListener('change', () => {
    const next = parseHyphenation(hyphenSelect.value);
    view.settings.hyphenation = next;
    view.saveSetting('hyphenation', next);
  });
  syncHyphenation();

  pageToggle(spacingDrawer, firstPages, () => view.fitDisplayDrawer?.());

  // Number inputs are skipped while focused — this runs both on menu open and
  // reactively on every incoming orbis:settings-change event (including ones
  // this same field's own keystrokes just dispatched via
  // bindRealTimeSliderInput's 'input' handler), so overwriting el.value while
  // the user is still mid-keystroke here stomps on what they just typed and
  // jumps the cursor — e.g. typing "2.1" into line spacing reads one digit at
  // a time ("2" → dispatches 2.0 → this immediately rewrites the field to
  // "2" mid-typing), making it impossible to type past the first digit. The
  // slider still updates live either way; only the focused text field is left
  // alone until blur, where bindRealTimeSliderInput's own handler reconciles it.
  const isFocused = (el: HTMLElement) => el.ownerDocument.activeElement === el;
  view.syncDisplayMenu = () => {
    fillThemes();
    // A slider under the reader's pointer is left alone, as a focused field is — see `isSliderDragging`.
    if (!isSliderDragging(brightSlider)) brightSlider.value = String(view.settings.brightness);
    if (!isFocused(brightNum)) brightNum.value = String(view.settings.brightness);
    updateStructureBtns();
    fillFonts();
    boldToggle.setValue(view.settings.boldText === 'on');
    if (!isSliderDragging(fsSlider)) fsSlider.value = String(view.settings.fontSize);
    if (!isFocused(fsNum)) fsNum.value = String(view.settings.fontSize);
    syncAlign();
    syncHyphenation();
    for (const { name, slider, num } of spacingSliders) {
      if (!isSliderDragging(slider)) slider.value = String(view.settings[name]);
      if (!isFocused(num)) num.value = String(view.settings[name]);
    }
    if (!isSliderDragging(marginsSlider)) marginsSlider.value = String(view.settings.margins);
    if (!isFocused(marginsNum)) marginsNum.value = String(view.settings.margins);
    if (!isSliderDragging(lhSlider)) lhSlider.value = String(Math.round(view.settings.lineHeight * 10));
    if (!isFocused(lhNum)) lhNum.value = String(view.settings.lineHeight);
  };

  /** Lays the tab out once the drag under way ends, after the slider's own `change`, which follows the release. */
  let layoutOwed = false;
  const layoutAfterDrag = (win: Window) => {
    if (layoutOwed) return;
    layoutOwed = true;
    const released = () => {
      win.removeEventListener('pointerup', released, true);
      win.removeEventListener('pointercancel', released, true);
      win.setTimeout(() => {
        layoutOwed = false;
        view.fitDisplayDrawer?.();
      }, 100);
    };
    win.addEventListener('pointerup', released, true);
    win.addEventListener('pointercancel', released, true);
  };

  view.fitDisplayDrawer = () => {
    const container = view.level3Container;
    const open = view.activeDisplayTab ? view.displayDrawers[view.activeDisplayTab] : undefined;
    if (!container?.isShown()) return;
    /**
     * **Never while a slider is dragged.** Laying the tab out again starts from one line, and a stacked tab's rows
     * changing their display for that moment rebuilds the slider under the pointer, which ends the drag in Chromium: a
     * slider on the stacked More page moved one step and stopped. Nothing a slider changes moves the layout, so the
     * tab is laid out when it opens, changes page or is resized, and not when a value changes. A pane resized during a
     * drag, as by a phone's keyboard closing, is laid out once the slider is let go.
     */
    if (open && Array.from(open.querySelectorAll<HTMLInputElement>('input[type="range"]')).some(isSliderDragging)) {
      layoutAfterDrag(container.win);
      return;
    }
    const room = roomBelow(container, view.contentEl);
    container.setCssProps({ '--orbis-drawer-max-height': `${room}px` });
    if (open) fitDrawer(open, room);
  };
  // The reading pane, not the drawer: the drawer floats over the book, so the pane keeps its size whatever the drawer
  // does, and laying the drawer out again cannot set this off again.
  const resized = new ResizeObserver(() => view.fitDisplayDrawer?.());
  resized.observe(view.contentEl);
  view.register(() => resized.disconnect());

  // Connect Display Menu toggling
  view.displayStyleBtn?.addEventListener('click', () => view.toggleDisplayMenu());
}
