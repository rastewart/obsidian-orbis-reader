import { describe, expect, it } from 'vitest';
import { stepBrightness, stepFontSize, stepLineHeight, stepMargins } from '../display-commands';

describe('stepLineHeight', () => {
  it('steps up by 0.1', () => {
    expect(stepLineHeight(1.5, 'up')).toBe(1.6);
  });

  it('steps down by 0.1', () => {
    expect(stepLineHeight(1.5, 'down')).toBe(1.4);
  });

  it('clamps at maximum 3.0 when stepping up', () => {
    expect(stepLineHeight(3.0, 'up')).toBe(3.0);
    expect(stepLineHeight(2.95, 'up')).toBe(3.0);
  });

  it('clamps at minimum 1.0 when stepping down', () => {
    expect(stepLineHeight(1.0, 'down')).toBe(1.0);
    expect(stepLineHeight(1.05, 'down')).toBe(1.0);
  });

  it('does not produce floating-point drift when stepping up repeatedly from 1.0', () => {
    // Without rounding: 1.1 + 0.1 = 1.2000000000000002 in IEEE 754
    let v = 1.0;
    for (let i = 0; i < 20; i++) v = stepLineHeight(v, 'up');
    expect(v).toBe(3.0);
  });

  it('does not produce floating-point drift when stepping down repeatedly from 3.0', () => {
    let v = 3.0;
    for (let i = 0; i < 20; i++) v = stepLineHeight(v, 'down');
    expect(v).toBe(1.0);
  });

  it('round-trips cleanly through known problem values', () => {
    // 1.1 + 0.1 is the canonical IEEE 754 pitfall
    expect(stepLineHeight(1.1, 'up')).toBe(1.2);
    expect(stepLineHeight(1.2, 'down')).toBe(1.1);
    expect(stepLineHeight(2.9, 'up')).toBe(3.0);
    expect(stepLineHeight(1.1, 'down')).toBe(1.0);
  });
});

describe('stepFontSize', () => {
  it('steps up by 10', () => {
    expect(stepFontSize(100, 'up')).toBe(110);
  });

  it('steps down by 10', () => {
    expect(stepFontSize(100, 'down')).toBe(90);
  });

  it('clamps at maximum 300', () => {
    expect(stepFontSize(300, 'up')).toBe(300);
    expect(stepFontSize(295, 'up')).toBe(300);
  });

  it('clamps at minimum 80', () => {
    expect(stepFontSize(80, 'down')).toBe(80);
    expect(stepFontSize(85, 'down')).toBe(80);
  });
});

describe('stepBrightness', () => {
  it('steps up by 10', () => {
    expect(stepBrightness(80, 'up')).toBe(90);
  });

  it('steps down by 10', () => {
    expect(stepBrightness(80, 'down')).toBe(70);
  });

  it('clamps at maximum 100', () => {
    expect(stepBrightness(100, 'up')).toBe(100);
    expect(stepBrightness(95, 'up')).toBe(100);
  });

  it('clamps at minimum 20', () => {
    expect(stepBrightness(20, 'down')).toBe(20);
    expect(stepBrightness(25, 'down')).toBe(20);
  });
});

describe('stepMargins', () => {
  it('steps up by 1', () => {
    expect(stepMargins(4, 'up')).toBe(5);
  });

  it('steps down by 1', () => {
    expect(stepMargins(4, 'down')).toBe(3);
  });

  it('clamps at maximum 12', () => {
    expect(stepMargins(12, 'up')).toBe(12);
    expect(stepMargins(11, 'up')).toBe(12);
  });

  it('clamps at minimum 0', () => {
    expect(stepMargins(0, 'down')).toBe(0);
    expect(stepMargins(1, 'down')).toBe(0);
  });
});
