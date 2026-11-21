// The Display styles settings page.
//
// Kept apart from `OrbisSettings.ts`, like the Note styles page. It is a class rather than a set of functions
// because of `styleHandles`: a slider dragged here previews live in the reader behind the settings window, and
// the handles are how a row reaches the control it has already drawn.

import {
  App,
  DropdownComponent,
  Platform,
  Setting,
  type SettingDefinition,
  type SettingDefinitionItem,
  SliderComponent,
  setIcon,
  ToggleComponent,
} from 'obsidian';
import { confirmThen } from './ConfirmModal';
import { deviceSetting, setDeviceSetting } from './device-settings';
import { getOrCreateDeviceId } from './device-store';
import { autoHyphenates, HYPHENATION_LABELS } from './hyphenation';
import { t } from './i18n';
import { LS_DEVICE_NAME } from './progress';
import { resolveThemeId, themeChoices, themeColors } from './reader-themes';
import { StyleNameModal } from './StyleNameModal';
import {
  DISPLAY_DEFAULTS,
  DisplayStyle,
  displayStyleEntries,
  FONT_FAMILY_OPTIONS,
  generateStyleId,
  IOrbisReaderPlugin,
  parseHyphenation,
  parseTextAlign,
  readCurrentDisplaySettings,
  STORAGE_KEY_ACTIVE_STYLE,
  STORAGE_KEY_BRIGHTNESS,
  STORAGE_KEY_COLUMNS,
  STORAGE_KEY_FLOW,
  STORAGE_KEY_FONT_FAMILY,
  STORAGE_KEY_FONT_SIZE,
  STORAGE_KEY_HYPHENATION,
  STORAGE_KEY_LINE_HEIGHT,
  STORAGE_KEY_MARGINS,
  STORAGE_KEY_TEXT_ALIGN,
  STORAGE_KEY_THEME,
} from './settings';
import { PAGE_I18N_KEYS } from './settings-rows';
import { bindRealTimeSliderInput, isSliderDragging } from './slider-input';
import { OBSIDIAN_TOOLTIP_GAP, TOOLTIP_GAP_MAX } from './tooltip-gap';
import { sliderStart } from './ui-utils';

/**
 * What the Display styles page needs from the settings tab.
 *
 * `toolbarItems` and `styleLabel` are asked for rather than copied: the toolbar rows render inside this page, and
 * a style's display name is printed in three places that have to agree.
 */
export interface DisplayStylesPageHost {
  readonly app: App;
  readonly plugin: IOrbisReaderPlugin;
  renderSettings(): void;
  toolbarItems(): SettingDefinitionItem[];
  /** The Theme manager's entry — see `settings-themes.ts`. */
  themeManagerPage(): SettingDefinitionItem;
  styleLabel(s: DisplayStyle): string;
}

export class DisplayStylesPage {
  constructor(private readonly host: DisplayStylesPageHost) {}

  /** Live Display-styles components, filled as its rows render and read by `syncStyleControl`. */
  /** The Display style dropdown as last drawn — see `syncStyleControl`. */
  private styleSelect: HTMLSelectElement | null = null;
  readonly styleHandles: {
    preview?: HTMLElement;
    theme?: DropdownComponent;
    flow?: DropdownComponent;
    font?: DropdownComponent;
    col?: Setting;
    colToggle?: ToggleComponent;
    align?: DropdownComponent;
    hyphenation?: DropdownComponent;
    slider: Record<string, { slider: SliderComponent; num: HTMLInputElement }>;
  } = { slider: {} };

  displayStyleItems(): SettingDefinitionItem[] {
    // Aliases onto the shared methods, so the rows below read as local calls — see `styleLs` for why the bodies
    // are shared.
    const ls = (key: string) => this.styleLs(key);
    const dispatchStr = (key: string, value: string) => this.styleDispatch(key, value);

    // Filled in as the rows render, and read by `syncStyleControl` afterwards. A mutable bag rather than
    // closure variables, because the rows are separate callbacks Obsidian invokes in its own time.
    //
    // **On the instance, not local to this call.** `getSettingDefinitions()` runs on every `update()` and once at
    // registration, so a bag created here would be a NEW one each time — and `syncStyleControl`, assigned
    // below, would point at the newest while the components on screen belong to whichever build actually
    // rendered. Sync would then write into an empty bag and the settings page would silently stop following the
    // display menu. One bag, shared by every build, cannot drift from what is on screen.
    const h = this.styleHandles;

    const applyPreview = () => this.applyStylePreview();
    const setColShown = (shown: boolean) => this.setColumnRowShown(shown);
    // Theme, font, font size and the sample come from the shared builder, spliced into this page's own order —
    // the Setup page draws all but the font. See `styleValueRows`.
    const values = this.styleValueRows();

    // The slider rows call the shared method — see `styleSliderRow`, which the Setup page draws font size with
    // too. Aliased so the four call sites below stay short.
    const sliderRow = (setting: Setting, o: Parameters<typeof this.styleSliderRow>[1]) =>
      this.styleSliderRow(setting, o);

    // Keep these controls live-synced when a value changes elsewhere (e.g. the Display Style toolbar) while this
    // page is open, through `syncStyleControl` — which says how its writes keep from announcing a change again.
    //
    // The number inputs are guarded by isFocused(): this same dispatch fires from `bindRealTimeSliderInput`'s own
    // 'input' handler on every keystroke (that is what "live" means — the toolbar and this page both react to
    // every change, including their own). Overwriting el.value mid-keystroke stomps on what was just typed and
    // jumps the cursor: typing "2.1" into line spacing reads one digit at a time ("2" dispatches 2.0, which
    // rewrites the field to "2.0"), so it is impossible to type past the first digit. Skipping the focused field
    // still lets its slider and every other field update; `bindRealTimeSliderInput`'s blur handler reconciles it.
    return [
      /**
       * **The toolbar's own page, first.** Eight switches is a thin thing to give a top-level category to, and one
       * would sit between Annotations and Library — with everything above it about reading and everything below
       * about your collection. It belongs with how the reading view looks; it just is not part of the book, which is
       * why this page is *Appearance* rather than *Book appearance*.
       *
       * A sub-page rather than a section on this page: the display selector, nine typography controls and a live
       * sample already make this the longest page in settings. Sub-page links come first here, as they do on
       * Listening.
       */
      {
        type: 'page',
        name: t(PAGE_I18N_KEYS.Toolbar),
        desc: t('settings_pages.toolbar_desc'),
        items: this.host.toolbarItems(),
      },
      /**
       * **The Theme manager, the other sub-page**, with the Toolbar for the reason the Toolbar is first: sub-page links
       * lead a page. Its line names what it is for, so a reader looking at the Theme row below knows where the extras
       * are switched on.
       */
      this.host.themeManagerPage(),
      /**
       * **How far a tooltip sits below its control** — for a large pointer, which covers a tooltip drawn at Obsidian's
       * own 8px. Outside the display style, since it belongs to the device's pointer rather than to how a book looks;
       * desktop only, since nothing hovers on a touch screen. The sample beside the slider is there to hover straight
       * after a change: the gap is read as the pointer arrives, so the next hover shows it. See `tooltip-gap.ts`.
       */
      {
        name: t('appearance_page.tooltip_distance'),
        desc: t('appearance_page.tooltip_distance_desc'),
        visible: () => !Platform.isMobile,
        render: (setting) => {
          setting.controlEl.addClass('orbis-tooltip-gap-controls');
          let sample: HTMLButtonElement | null = null;
          // The sample carries the gap itself, so the check beside the slider never depends on the listener.
          const showOn = (gap: number): void => {
            if (!sample) return;
            if (gap > OBSIDIAN_TOOLTIP_GAP) sample.setAttribute('data-tooltip-gap', String(gap));
            else sample.removeAttribute('data-tooltip-gap');
          };
          const apply = (value: number): void => {
            setDeviceSetting('tooltipGap', value);
            showOn(value);
          };
          // Slider, number field and unit, as every other slider on this page has them — see `styleSliderRow`.
          let slider!: SliderComponent;
          setting.addSlider((s) => {
            slider = s;
            s.setLimits(OBSIDIAN_TOOLTIP_GAP, TOOLTIP_GAP_MAX, 1)
              .setValue(deviceSetting('tooltipGap'))
              .onChange((value) => {
                num.value = String(value);
                apply(value);
              });
          });
          const num = setting.controlEl.createEl('input', {
            type: 'number',
            cls: 'orbis-num-input-sm orbis-num-input-2',
          });
          setting.controlEl.addClass('orbis-has-num-field'); // hides the slider's own value; see styles.css
          num.min = String(OBSIDIAN_TOOLTIP_GAP);
          num.max = String(TOOLTIP_GAP_MAX);
          num.value = String(deviceSetting('tooltipGap'));
          setting.controlEl.createSpan({ text: 'px', cls: 'orbis-unit-suffix' });
          bindRealTimeSliderInput(
            num,
            slider.sliderEl,
            OBSIDIAN_TOOLTIP_GAP,
            TOOLTIP_GAP_MAX,
            deviceSetting('tooltipGap'),
            apply
          );
          num.addEventListener('input', () => {
            const raw = Number.parseFloat(num.value);
            if (Number.isFinite(raw)) slider.setValue(Math.max(OBSIDIAN_TOOLTIP_GAP, Math.min(TOOLTIP_GAP_MAX, raw)));
          });
          setting.addButton((b) => {
            b.setButtonText(t('appearance_page.tooltip_sample')).setTooltip(t('appearance_page.tooltip_sample_tip'));
            sample = b.buttonEl;
          });
          // On a line of its own below the slider — see `.orbis-tooltip-gap-sample`.
          if (sample) setting.controlEl.createDiv({ cls: 'orbis-tooltip-gap-sample' }).appendChild(sample);
          showOn(deviceSetting('tooltipGap'));
        },
      },
      {
        name: t('appearance_page.active_style'),
        desc: t('appearance_page.styles_desc'),
        /**
         * **This row IS the selector's row.** `buildStyleSelector` does not make one of its own inside this one's
         * control area, which would draw the name and the description twice — once by the definition and once by the
         * nested `Setting`. The definition keeps them, because it is the one settings search indexes.
         */
        render: (setting) => this.buildStyleSelector(setting),
      },
      values.theme,
      {
        name: t('toolbar.brightness'),
        desc: t('appearance_page.20_100'),
        render: (setting) =>
          sliderRow(setting, {
            storageKey: STORAGE_KEY_BRIGHTNESS,
            min: 20,
            max: 100,
            unit: '%',
            fallback: DISPLAY_DEFAULTS.brightness,
          }),
      },
      {
        name: t('display_menu.reading_mode'),
        render: (setting) => {
          setting.addDropdown((d) => {
            h.flow = d;
            d.addOptions({
              paginated: t('display_menu.paged_mode'),
              scrolled: t('display_menu.scrolled_mode'),
            })
              .setValue(ls(STORAGE_KEY_FLOW) ?? 'paginated')
              .onChange((value) => {
                dispatchStr(STORAGE_KEY_FLOW, value);
                // The two-column preference is kept, not reset: a scrolled book reads in one column regardless
                // (`applyRenderer`), and going back to paged mode brings the preference back.
                setColShown(value !== 'scrolled');
              });
          });
        },
      },
      {
        name: t('appearance_page.two_column_layout'),
        desc: t('appearance_page.two_columns_desc'),
        render: (setting) => {
          h.col = setting;
          setting.addToggle((tg) => {
            h.colToggle = tg;
            // Only a change the stored value does not already hold: `syncStyleControl` writing an outside change
            // runs this too, and announcing it again applied every columns change from the display bar twice.
            tg.setValue((ls(STORAGE_KEY_COLUMNS) ?? '2') === '2').onChange((value) => {
              const next = value ? '2' : '1';
              if (ls(STORAGE_KEY_COLUMNS) !== next) dispatchStr(STORAGE_KEY_COLUMNS, next);
            });
          });
          setColShown((ls(STORAGE_KEY_FLOW) ?? 'paginated') !== 'scrolled');
        },
      },
      {
        name: t('appearance_page.text_margins'),
        desc: t('appearance_page.text_padding_desc'),
        render: (setting) =>
          sliderRow(setting, {
            storageKey: STORAGE_KEY_MARGINS,
            min: 0,
            max: 12,
            unit: '%',
            fallback: DISPLAY_DEFAULTS.margins,
          }),
      },
      {
        name: t('appearance_page.line_spacing'),
        desc: t('appearance_page.1_0_3_0'),
        render: (setting) =>
          sliderRow(setting, {
            storageKey: STORAGE_KEY_LINE_HEIGHT,
            min: 10,
            max: 30,
            unit: '×',
            fallback: DISPLAY_DEFAULTS.lineHeight,
            step: '0.1',
            decimals: 1,
            scale: (v) => v / 10,
            unscale: (v) => Math.round(v * 10),
          }),
      },
      {
        // After line spacing: margins, line spacing and alignment are the display toolbar's Spacing tab, so the two
        // surfaces group them the same way. Three answers, the book's first — the same shape as the font's "use book
        // fonts". See `TextAlign`.
        name: t('appearance_page.text_alignment'),
        desc: t('appearance_page.text_alignment_desc'),
        render: (setting) => {
          setting.addDropdown((d) => {
            h.align = d;
            d.addOptions({
              book: t('appearance_page.text_align_book'),
              left: t('appearance_page.text_align_left'),
              justify: t('appearance_page.text_align_justify'),
            })
              .setValue(parseTextAlign(ls(STORAGE_KEY_TEXT_ALIGN)))
              .onChange((value) => {
                dispatchStr(STORAGE_KEY_TEXT_ALIGN, value);
                applyPreview();
              });
          });
        },
      },
      {
        // After alignment, as on the display toolbar's Spacing tab. The same shape: the book's answer first.
        name: t('appearance_page.hyphenation'),
        desc: t('appearance_page.hyphenation_desc'),
        render: (setting) => {
          // Where On can do nothing here, the description says so — see `autoHyphenates`.
          if (!autoHyphenates(setting.settingEl.doc)) {
            setting.setDesc(`${t('appearance_page.hyphenation_desc')} ${t('appearance_page.hyphenation_unsupported')}`);
          }
          setting.addDropdown((d) => {
            h.hyphenation = d;
            const options: Record<string, string> = {};
            for (const [value, key] of Object.entries(HYPHENATION_LABELS)) options[value] = t(key);
            d.addOptions(options)
              .setValue(parseHyphenation(ls(STORAGE_KEY_HYPHENATION)))
              .onChange((value) => dispatchStr(STORAGE_KEY_HYPHENATION, value));
          });
        },
      },
      values.font,
      values.size,
      values.sample,
    ];
  }

  buildStyleSelector(styleRow: Setting): void {
    const deviceId = getOrCreateDeviceId(this.host.plugin.app);
    const visibleStyles = this.host.plugin.stylesForThisDevice();
    const deviceName = (this.host.plugin.app.loadLocalStorage(LS_DEVICE_NAME) as string | null) ?? '';
    const getStyleLabel = (p: DisplayStyle): string => this.host.styleLabel(p);
    const activeStyleId = (this.host.plugin.app.loadLocalStorage(STORAGE_KEY_ACTIVE_STYLE) as string | null) ?? '';
    /**
     * **This device's own style is the fallback, because there is always one.** `initDeviceStyle` creates it during
     * `onload` and points the active-style pointer at it, so "no style at all" is not a state a reader can reach by
     * using the plugin — but a stale pointer is: delete a shared style on one device and the other still names it.
     * Advice such as "Open a book to set up your device style" would be no help in that state. Falling back repairs
     * the pointer instead.
     */
    const stored = visibleStyles.find((p) => p.id === activeStyleId);
    const activeStyle = stored ?? visibleStyles.find((p) => p.deviceId === deviceId);
    if (!stored && activeStyle) this.host.plugin.app.saveLocalStorage(STORAGE_KEY_ACTIVE_STYLE, activeStyle.id);

    /**
     * **The same shape as the note export styles page, down to the icons.** Two pages that manage a named set should
     * not each invent a layout: label and description on the left, then the selector and `+ ✎ 🗑` on the right, with
     * the button group dropping below the selector on a phone.
     */
    styleRow.controlEl.addClass('orbis-style-controls');

    // `dropdown` is Obsidian's own class — the background, border and chevron come from it. A bare <select>
    // renders as plain text with no affordance.
    const styleSel = styleRow.controlEl.createEl('select', { cls: 'dropdown orbis-style-select' });
    this.styleSelect = styleSel;
    for (const p of visibleStyles) {
      const opt = styleSel.createEl('option', {
        value: p.id,
        text: getStyleLabel(p),
      });
      if (p.id === activeStyleId) opt.selected = true;
    }
    styleSel.addEventListener('change', () => {
      this.host.plugin.switchToStyle(styleSel.value);
      this.host.renderSettings();
    });

    /**
     * The context line is the selector row's own description, and the actions share the selector's row — as icons,
     * because words ("New / Rename / Delete style") would force them onto a line of their own on a phone.
     *
     * New is always offered; Rename and Delete join it only for a style with a name of its own, since the device
     * style is not the reader's to rename or remove.
     */
    const actions = styleRow.controlEl.createDiv({ cls: 'orbis-style-btn-line' });
    const styleIcon = (icon: string, label: string): HTMLButtonElement => {
      const btn = actions.createEl('button', { cls: 'clickable-icon' });
      setIcon(btn, icon);
      btn.setAttribute('aria-label', label);
      return btn;
    };

    const newStyleBtn = styleIcon('plus', t('action.new'));
    newStyleBtn.addEventListener('click', () => {
      new StyleNameModal(this.host.app, '', t('style_name_modal.new_style'), (name) => {
        void (async () => {
          const style: DisplayStyle = {
            id: generateStyleId(),
            name,
            settings: readCurrentDisplaySettings(this.host.plugin.app),
            createdAt: Date.now(),
          };
          this.host.plugin.settings.styles.push(style);
          await this.host.plugin.saveSettings();
          this.host.plugin.app.saveLocalStorage(STORAGE_KEY_ACTIVE_STYLE, style.id);
          this.host.renderSettings();
        })();
      }).open();
    });

    /**
     * **No "you are editing X" line.** The dropdown a few pixels to its right says which style is open, and the row's
     * description above says what a display style is. Only the EXCEPTIONS get a line of their own: a device style,
     * which cannot be renamed or removed and does not travel, and having no style at all.
     */
    if (activeStyle?.deviceId) {
      // Set apart from the sentence above it: that one says what a display style IS, this one is about the style
      // currently in the dropdown, and run together as one paragraph there would be no telling which was which.
      styleRow.descEl.createDiv({
        cls: 'orbis-desc-note',
        // Named when the device has a name, and "this device" when it does not — a device nobody has named should
        // not be described by whatever placeholder its style is stored under.
        text: deviceName
          ? t('appearance_page.device_only_desc', { name: deviceName })
          : t('appearance_page.device_only_desc_unnamed'),
      });
    } else if (activeStyle) {
      const renameBtn = styleIcon('pencil', t('action.rename'));
      renameBtn.addEventListener('click', () => {
        new StyleNameModal(this.host.app, activeStyle.name, t('style_name_modal.rename_style'), (name) => {
          void (async () => {
            activeStyle.name = name;
            await this.host.plugin.saveSettings();
            this.host.renderSettings();
          })();
        }).open();
      });
      // Asked, as the note export styles page asks — and as every other deletion in settings does. Without a
      // confirmation, one press on a trash icon would remove a named set of nine reading preferences.
      const deleteBtn = styleIcon('trash', t('action.delete_style'));
      deleteBtn.addEventListener('click', () => {
        confirmThen(
          this.host.app,
          {
            title: t('appearance_page.delete_style_title'),
            message: t('appearance_page.delete_style_confirm', { name: activeStyle.name }),
            confirmText: t('action.delete'),
          },
          () => {
            void (async () => {
              // Deleting the style you are on leaves you on this device's own, which cannot be deleted.
              const devStyle = this.host.plugin.deviceStyle();
              if (devStyle) this.host.plugin.switchToStyle(devStyle.id);
              const idx = this.host.plugin.settings.styles.findIndex((p) => p.id === activeStyle.id);
              if (idx >= 0) this.host.plugin.settings.styles.splice(idx, 1);
              await this.host.plugin.saveSettings();
              this.host.renderSettings();
            })();
          }
        );
      });
    }
  }

  /**
   * The three display values a reader actually reaches for, and the sample that shows them.
   *
   * **One definition, two pages.** The Appearance page splices these into its own order, between the style
   * selector and the sliders it keeps to itself; the Setup page shows all of them but the font. Built
   * here rather than copied because the design rule for repeating a control is that it must be the SAME control —
   * two hand-written font dropdowns would drift the first time an option is added to one of them.
   *
   * Each writes into the SELECTED display style, through `styleDispatch`. Setup names which style that is; see
   * `appearanceSetupItems`.
   */
  styleValueRows(opts: { compactSample?: boolean } = {}): {
    theme: SettingDefinition;
    font: SettingDefinition;
    size: SettingDefinition;
    sample: SettingDefinition;
  } {
    const h = this.styleHandles;
    return {
      theme: {
        name: t('display_menu.reader_theme'),
        desc: t('appearance_page.theme_colors_manager_desc'),
        render: (setting) => {
          setting.addDropdown((d) => {
            h.theme = d;
            this.fillThemes(d, this.styleLs(STORAGE_KEY_THEME) ?? DISPLAY_DEFAULTS.theme);
            d.onChange((value) => {
              this.styleDispatch(STORAGE_KEY_THEME, value);
              this.applyStylePreview();
            });
          });
        },
      },
      font: {
        name: t('display_menu.font'),
        desc: t('appearance_page.font_used_for_book_content'),
        render: (setting) => {
          setting.addDropdown((d) => {
            h.font = d;
            const opts: Record<string, string> = {};
            for (const { value, labelKey } of FONT_FAMILY_OPTIONS) opts[value] = t(labelKey);
            d.addOptions(opts)
              .setValue(this.styleLs(STORAGE_KEY_FONT_FAMILY) ?? DISPLAY_DEFAULTS.fontFamily)
              .onChange((value) => {
                this.styleDispatch(STORAGE_KEY_FONT_FAMILY, value);
                this.applyStylePreview();
              });
          });
        },
      },
      size: {
        name: t('toolbar.font_size'),
        desc: t('appearance_page.80_300'),
        render: (setting) =>
          this.styleSliderRow(setting, {
            storageKey: STORAGE_KEY_FONT_SIZE,
            min: 80,
            max: 300,
            unit: '%',
            fallback: DISPLAY_DEFAULTS.fontSize,
            // The sample's own size is set directly as well as through applyPreview, so it tracks the drag.
            onChange: (value) => h.preview?.setCssProps({ '--orbis-preview-font-size': `${value}%` }),
          }),
      },
      sample: {
        name: t('appearance_page.preview'),
        searchable: false, // a sample of the settings above, not a setting
        render: (setting) => {
          // Into the CONTROL area, not `settingEl`. Obsidian clears the control area before re-running a render
          // callback and leaves the row element alone — so a sample appended to `settingEl` would survive every
          // rebuild and pile up side by side. Nothing else duplicates, because everything else goes in through
          // `setting.addX()`, which is to say into the part that gets cleared.
          setting.settingEl.addClass('orbis-setting-stacked');
          const el = setting.controlEl.createDiv({ cls: 'orbis-settings-preview orbis-style-preview' });
          // **Shorter on Setup, and it has to be the BOX.** The sample is a fixed height with the text scrolling
          // inside it, so a shorter passage reclaims no space at all — only a shorter box does. Two controls need
          // less sample than nine: enough lines to see the size and the ground it sits on.
          if (opts.compactSample) el.addClass('is-compact');
          el.textContent = t('appearance_page.preview_sample_text');
          h.preview = el;
          this.applyStylePreview();
        },
      },
    };
  }

  /**
   * One slider row: the slider, its paired number input, and a unit.
   *
   * Four rows share it, differing only in bounds and units. `scale`/`unscale` are for
   * line spacing, whose slider works in tenths so it can step by 0.1 — the only reason the pair is not always
   * the same number.
   */
  styleSliderRow(
    setting: Setting,
    o: {
      storageKey: string;
      min: number;
      max: number;
      unit: string;
      /**
       * What to show when nothing is stored, in VALUE units — from `DISPLAY_DEFAULTS`, which is what the book
       * reads. Required, not optional: defaulting to `min` would make a fresh vault describe values nothing is
       * using. See `sliderStart`.
       */
      fallback: number;
      step?: string;
      decimals?: number;
      scale?: (v: number) => number;
      unscale?: (v: number) => number;
      onChange?: (value: number) => void;
    }
  ): void {
    const scale = o.scale ?? ((v: number) => v);
    const unscale = o.unscale ?? ((v: number) => v);
    const { stored, shown } = sliderStart(this.styleLs(o.storageKey), o.fallback, unscale);
    const dispatch = (raw: number) => {
      const value = scale(raw);
      this.styleDispatch(o.storageKey, String(value));
      o.onChange?.(value);
      this.applyStylePreview();
    };
    let slider!: SliderComponent;
    setting.addSlider((s) => {
      slider = s;
      s.setLimits(o.min, o.max, 1).setValue(shown);
      // No setDynamicTooltip(): deprecated since Obsidian 1.13, and the value is shown inline.
      // The field only: `bindRealTimeSliderInput` below applies the value, as the drag goes and on letting go —
      // dispatching here as well applied every release twice.
      s.onChange((val) => {
        num.value = o.decimals ? scale(val).toFixed(o.decimals) : String(scale(val));
      });
    });
    const num = setting.controlEl.createEl('input');
    num.type = 'number';
    num.min = String(scale(o.min));
    num.max = String(scale(o.max));
    if (o.step) num.step = o.step;
    num.value = o.decimals ? stored.toFixed(o.decimals) : String(stored);
    num.addClass('orbis-num-input-sm');
    setting.controlEl.addClass('orbis-has-num-field'); // hides the slider's own value; see styles.css
    setting.controlEl.createSpan({ text: o.unit, cls: 'orbis-unit-suffix' });
    bindRealTimeSliderInput(num, slider.sliderEl, o.min, o.max, shown, dispatch, scale, unscale);
    /**
     * Keep the COMPONENT's own value true when the field is what is being edited.
     *
     * `bindRealTimeSliderInput` moves the thumb by assigning `sliderEl.value`, which fires no event — so Obsidian's
     * `SliderComponent` never hears about it and its internal value (and the `span.slider-value` it draws, hidden
     * above) stays at whatever it last knew. Nothing reads that state today; `syncStyleControl` only writes to
     * it. But a component whose value disagrees with its own thumb is a bug waiting for a different symptom. Its
     * `setValue` calls `onChange` when the value moves, which here only rewrites the field.
     */
    num.addEventListener('input', () => {
      const raw = unscale(Number.parseFloat(num.value));
      if (Number.isFinite(raw)) slider.setValue(Math.max(o.min, Math.min(o.max, raw)));
    });
    this.styleHandles.slider[o.storageKey] = { slider, num };
  }

  /**
   * Write an outside change into the live Display-styles controls.
   *
   * A METHOD, not a callback the definitions store. A stored callback makes the wiring depend on when
   * `getSettingDefinitions()` last ran versus when the rows last rendered — which is not a thing anyone can hold
   * in their head, and breaks as the settings page stops following the display menu. Reading `this.styleHandles`
   * directly means there is no assignment to be stale and no order to get right.
   *
   * Uses component `setValue()` / raw `.value` rather than re-dispatching. **Obsidian's slider and toggle call
   * `onChange` from `setValue` whenever the value moves** (its dropdown does not — read from Obsidian 1.14's own
   * code), so a write here runs their `onChange`: the slider's only rewrites its field, and the toggle's announces
   * only a value that differs from the stored one. Anything else would announce every outside change a second time.
   * A slider being dragged is not written at all — see `isSliderDragging`. The number inputs are guarded by `isFocused`: this same path fires from
   * `bindRealTimeSliderInput`'s own 'input' handler on every keystroke — that is what "live" means, both surfaces
   * react to every change including their own — and overwriting `el.value` mid-keystroke stomps on what was just
   * typed and jumps the cursor. Typing "2.1" into line spacing reads one digit at a time ("2" dispatches 2.0,
   * which rewrites the field to "2.0"), so it is impossible to type past the first digit. Skipping the focused
   * field still lets its slider and every other field update; the blur handler reconciles it.
   */
  /** Write every live display value into the controls: after a whole display style was applied at once. */
  syncAllStyleControls(): void {
    const current = readCurrentDisplaySettings(this.host.plugin.app);
    for (const [key, value] of displayStyleEntries(current)) this.syncStyleControl(key, value);
  }

  syncStyleControl(key: string, value: string): void {
    const h = this.styleHandles;
    const isFocused = (el: HTMLElement) => el.ownerDocument.activeElement === el;
    const syncSlider = (sliderKey: string, n: number, decimals?: number) => {
      const pair = h.slider[sliderKey];
      if (!pair) return;
      if (!isSliderDragging(pair.slider.sliderEl)) pair.slider.setValue(decimals ? Math.round(n * 10) : n);
      if (!isFocused(pair.num)) pair.num.value = decimals ? n.toFixed(decimals) : String(n);
    };
    switch (key) {
      case STORAGE_KEY_ACTIVE_STYLE:
        // The whole page, not the dropdown alone: the style decides whether rename and delete are offered. Only when
        // it is on screen and shows another — its own dropdown switches through here as well.
        if (this.styleSelect?.isConnected && this.styleSelect.value !== value) this.host.renderSettings();
        break;
      case STORAGE_KEY_THEME:
        if (h.theme) this.fillThemes(h.theme, value);
        break;
      case STORAGE_KEY_BRIGHTNESS:
        syncSlider(key, parseInt(value));
        break;
      case STORAGE_KEY_FLOW:
        h.flow?.setValue(value);
        this.setColumnRowShown(value !== 'scrolled');
        break;
      case STORAGE_KEY_COLUMNS:
        h.colToggle?.setValue(value === '2');
        break;
      case STORAGE_KEY_TEXT_ALIGN:
        h.align?.setValue(parseTextAlign(value));
        break;
      case STORAGE_KEY_HYPHENATION:
        h.hyphenation?.setValue(parseHyphenation(value));
        break;
      case STORAGE_KEY_MARGINS:
        syncSlider(key, parseInt(value));
        break;
      case STORAGE_KEY_LINE_HEIGHT:
        syncSlider(key, parseFloat(value), 1);
        break;
      case STORAGE_KEY_FONT_FAMILY:
        h.font?.setValue(value);
        break;
      case STORAGE_KEY_FONT_SIZE:
        syncSlider(key, parseInt(value));
        break;
      default:
        return;
    }
    this.applyStylePreview();
  }

  /**
   * The theme dropdown's options, and its value.
   *
   * **Refilled whenever the value changes**, not only when drawn: another display style can use a theme that is
   * switched off, and the dropdown lists the theme in use — see `themeChoices` — so the options depend on the value.
   */
  private fillThemes(d: DropdownComponent, value: string): void {
    const themes = this.host.plugin.settings;
    const current = resolveThemeId(value, themes);
    d.selectEl.empty();
    for (const choice of themeChoices(themes, current)) d.addOption(choice.id, choice.label);
    d.setValue(current);
  }

  /** Restyle the sample from what is stored, so it shows the style rather than describing it. */
  applyStylePreview(): void {
    const previewEl = this.styleHandles.preview;
    if (!previewEl) return;
    const ls = (k: string) => this.host.plugin.app.loadLocalStorage(k) as string | null;
    // Every fallback from `DISPLAY_DEFAULTS`, because the sample has to show what the BOOK would show. A fallback
    // of its own here would make an untouched vault preview a page it would not render. The colors come from the
    // reader's own resolver, read in the settings window — see `themeColors`.
    const theme = ls(STORAGE_KEY_THEME) ?? DISPLAY_DEFAULTS.theme;
    const { bg: background, fg: color } = themeColors(theme, this.host.plugin.settings, previewEl);
    const font = ls(STORAGE_KEY_FONT_FAMILY) ?? DISPLAY_DEFAULTS.fontFamily;
    const fontFamily =
      font === 'obsidian'
        ? getComputedStyle(activeDocument.body).getPropertyValue('--font-text').trim() || ''
        : font === 'default'
          ? 'inherit'
          : font;
    const bright = parseInt(ls(STORAGE_KEY_BRIGHTNESS) ?? String(DISPLAY_DEFAULTS.brightness));
    const size = parseInt(ls(STORAGE_KEY_FONT_SIZE) ?? String(DISPLAY_DEFAULTS.fontSize));
    const lineHeight = parseFloat(ls(STORAGE_KEY_LINE_HEIGHT) ?? String(DISPLAY_DEFAULTS.lineHeight));
    // The sample has no book behind it, so following the book previews as the browser's own left.
    const justify = parseTextAlign(ls(STORAGE_KEY_TEXT_ALIGN)) === 'justify';
    const margins = parseInt(ls(STORAGE_KEY_MARGINS) ?? String(DISPLAY_DEFAULTS.margins));
    previewEl.setCssProps({
      '--orbis-preview-bg': background,
      '--orbis-preview-color': color,
      '--orbis-preview-font-family': fontFamily,
      '--orbis-preview-filter': bright < 100 ? `brightness(${bright}%)` : 'none',
      '--orbis-preview-font-size': `${size}%`,
      '--orbis-preview-line-height': String(lineHeight),
      '--orbis-preview-text-align': justify ? 'justify' : 'left',
      '--orbis-preview-padding-left': `${margins}%`,
      '--orbis-preview-padding-right': `${margins}%`,
    });
  }

  /**
   * A scrolled book has one column, so the two-column row is hidden while scrolling — hidden rather than grayed, the
   * rule for a row that cannot apply. Choosing scroll mode keeps the preference rather than resetting it to one
   * column, so the row comes back as it was.
   */
  setColumnRowShown(shown: boolean): void {
    this.styleHandles.col?.settingEl.toggle(shown);
  }

  /**
   * Write a live display value, tell the open readers, and put it into the selected style.
   *
   * `updateActiveStyle` is the half worth naming: the localStorage key is the live view, the active style is the
   * record, and every edit lands on whichever style is selected — from here or from the book's own display menu.
   */
  styleDispatch(key: string, value: string): void {
    this.host.plugin.app.saveLocalStorage(key, value);
    this.host.plugin.app.workspace.trigger('orbis:settings-change', key, value);
    this.host.plugin.updateActiveStyle();
  }

  /**
   * The three things every display-value control needs, as methods rather than closures.
   *
   * **Because two pages draw these rows.** The Setup page shows theme, font and font size as well as
   * `displayStyleItems`, and a second copy of a dropdown or a slider is how two surfaces that must agree start
   * disagreeing. `displayStyleItems` keeps local aliases so its own rows read as local calls.
   */
  styleLs(key: string): string | null {
    return this.host.plugin.app.loadLocalStorage(key) as string | null;
  }
}
