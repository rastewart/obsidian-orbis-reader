// The listening speed control: a slider, a number field after it and the unit after that, on one line.
//
// **The Display menu's control, so the two read alike** — the binding Line spacing uses (`bindRealTimeSliderInput`).
// The slider counts in tenths, so it steps by 0.1 and a typed 1.25 settles on 1.3 when the field is left; typing out
// of range is clamped then. Built in two places, the full player's 1× popup and Voice and source's Speed block, and
// applied as either the slider or the field moves.

import { t } from '../../i18n';
import { bindRealTimeSliderInput } from '../../slider-input';

export interface SpeedControlDeps {
  rate: number;
  /** The slowest and fastest speeds. */
  range: readonly [number, number];
  setRate(rate: number): void;
  /** Hold the page's height while the number field's keyboard is up on a phone — see `ReaderDom.lockHeights`. */
  lockHeights(): void;
  unlockHeights(): void;
}

export function buildSpeedControl(container: HTMLElement, deps: SpeedControlDeps): void {
  const tenths = (rate: number): number => Math.round(rate * 10);
  const [min, max] = deps.range.map(tenths);
  const row = container.createDiv({ cls: 'orbis-tts-speed-row' });
  const slider = row.createEl('input', { cls: 'orbis-tts-speed-slider', type: 'range' });
  slider.min = String(min);
  slider.max = String(max);
  slider.value = String(tenths(deps.rate));
  slider.setAttribute('aria-label', t('tts.speed'));
  const field = row.createEl('input', { cls: 'orbis-num-input-sm', type: 'number' });
  field.step = '0.1';
  field.value = String(deps.rate);
  field.setAttribute('aria-label', t('tts.speed'));
  row.createSpan({ cls: 'orbis-unit-suffix', text: '×' });
  bindRealTimeSliderInput(
    field,
    slider,
    min,
    max,
    tenths(deps.rate),
    (v) => deps.setRate(v / 10),
    (v) => v / 10,
    tenths
  );
  // The keyboard a number field opens would otherwise black out the page behind it on a phone.
  field.addEventListener('focus', () => deps.lockHeights());
  field.addEventListener('blur', () => window.setTimeout(() => deps.unlockHeights(), 100));
}
