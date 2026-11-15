export function stepFontSize(current: number, direction: 'up' | 'down'): number {
  return direction === 'up' ? Math.min(current + 10, 300) : Math.max(current - 10, 80);
}

export function stepBrightness(current: number, direction: 'up' | 'down'): number {
  return direction === 'up' ? Math.min(current + 10, 100) : Math.max(current - 10, 20);
}

// Floating-point multiplication guards against IEEE 754 accumulation (e.g. 1.1 + 0.1 = 1.2000000000000002).
export function stepLineHeight(current: number, direction: 'up' | 'down'): number {
  return direction === 'up'
    ? Math.min(Math.round((current + 0.1) * 10) / 10, 3.0)
    : Math.max(Math.round((current - 0.1) * 10) / 10, 1.0);
}

export function stepMargins(current: number, direction: 'up' | 'down'): number {
  return direction === 'up' ? Math.min(current + 1, 12) : Math.max(current - 1, 0);
}
