import { setTooltip } from 'obsidian';
import { autoHyphenates, HYPHENATION_LABELS } from './hyphenation';
import { t } from './i18n';
import { resolveThemeId, type ThemeSettings, themeChoices } from './reader-themes';
import { DisplaySettings, Flow, FONT_FAMILY_OPTIONS, parseHyphenation, parseTextAlign } from './settings';
import { isSliderDragging } from './slider-input';
import { setSvgIcon } from './ui-utils';

export interface DisplayMenuView {
  settings: DisplaySettings;
  /** Which themes exist and which are offered — see `reader-themes.ts`. */
  plugin: { settings: ThemeSettings };
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

export function buildDisplayMenu(view: DisplayMenuView, toolbar: HTMLElement): void {
  // Wrapper for overlay positioning
  view.displayMenuWrapper = view.contentEl.createDiv({ cls: 'orbis-display-menu-wrapper' });
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
    btn.addEventListener('click', () => view.activateDisplayTab(id));
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
        view.activateDisplayTab(nextId);
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
  const themeDrawer = createDrawer('theme', 'orbis-flex-wrap');

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
  const structureDrawer = createDrawer('structure', 'orbis-flex-wrap');

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
   * **Two-column layout, as a toggle beside the mode** — the same lit/unlit button as Justify, because a checkbox
   * row's long label ("Enable two-column layout on large displays") runs off the edge of a phone.
   * Lit means the preference is on, not that two columns are showing: they appear only where the reading area is
   * wide enough, which a phone reaches in landscape — so it is not hidden on phones. Settings and the guide say so.
   *
   * **Hidden while scrolling**, not grayed: a scrolled book has one column, so there is nothing for it to do. The
   * preference is kept rather than reset, so going back to paged mode brings it back — see `applyRenderer`.
   */
  const colBtn = modeWrap.createEl('button', { cls: 'orbis-drawer-btn' });
  colBtn.setAttribute('aria-label', t('display_menu.two_column_layout'));
  setSvgIcon(
    colBtn,
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="10" y2="6"/><line x1="3" y1="12" x2="10" y2="12"/><line x1="3" y1="18" x2="10" y2="18"/><line x1="14" y1="6" x2="21" y2="6"/><line x1="14" y1="12" x2="21" y2="12"/><line x1="14" y1="18" x2="21" y2="18"/></svg>'
  );

  const updateStructureBtns = () => {
    modeSelect.value = view.settings.flow;
    const on = view.settings.columns === 2;
    colBtn.classList.toggle('is-active', on);
    colBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    colBtn.toggle(view.settings.flow !== 'scrolled');
  };

  modeSelect.addEventListener('change', () => {
    const newFlow = modeSelect.value as Flow;
    view.settings.flow = newFlow;
    view.saveSetting('flow', newFlow); // applied as the theme is, above
    updateStructureBtns();
  });

  colBtn.addEventListener('click', () => {
    const newCols = view.settings.columns === 2 ? 1 : 2;
    view.settings.columns = newCols;
    view.saveSetting('columns', newCols);
    updateStructureBtns();
  });
  updateStructureBtns();

  // --- Font Drawer ---
  const fontDrawer = createDrawer('font', 'orbis-flex-wrap');

  const fontSelectWrap = fontDrawer.createDiv({ cls: 'orbis-slider-drawer' });
  fontSelectWrap.createSpan({
    text: t('display_menu.font'),
    cls: 'orbis-drawer-label',
    attr: { 'aria-label': t('display_menu.font') },
  });
  const fontSelect = fontSelectWrap.createEl('select', { cls: 'dropdown orbis-dropdown' });
  FONT_FAMILY_OPTIONS.forEach((opt) => fontSelect.createEl('option', { value: opt.value, text: t(opt.labelKey) }));
  fontSelect.value = view.settings.fontFamily || 'default';
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

  // --- Spacing Drawer ---
  const spacingDrawer = createDrawer('spacing', 'orbis-flex-wrap');

  // Margins
  const marginsWrap = spacingDrawer.createDiv({ cls: 'orbis-slider-drawer' });
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
  const lhWrap = spacingDrawer.createDiv({ cls: 'orbis-slider-drawer' });
  lhWrap.createSpan({
    text: t('display_menu.spacing'),
    cls: 'orbis-drawer-label',
    attr: { 'aria-label': t('display_menu.line_spacing') },
  });
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
  const alignWrap = spacingDrawer.createDiv({ cls: 'orbis-slider-drawer' });
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

  // Hyphenation, the row after alignment and the same shape: Settings' three answers (`Hyphenation`).
  const hyphenWrap = spacingDrawer.createDiv({ cls: 'orbis-slider-drawer' });
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
    fontSelect.value = view.settings.fontFamily || 'default';
    if (!isSliderDragging(fsSlider)) fsSlider.value = String(view.settings.fontSize);
    if (!isFocused(fsNum)) fsNum.value = String(view.settings.fontSize);
    syncAlign();
    syncHyphenation();
    if (!isSliderDragging(marginsSlider)) marginsSlider.value = String(view.settings.margins);
    if (!isFocused(marginsNum)) marginsNum.value = String(view.settings.margins);
    if (!isSliderDragging(lhSlider)) lhSlider.value = String(Math.round(view.settings.lineHeight * 10));
    if (!isFocused(lhNum)) lhNum.value = String(view.settings.lineHeight);
  };

  // Connect Display Menu toggling
  view.displayStyleBtn?.addEventListener('click', () => view.toggleDisplayMenu());
}
