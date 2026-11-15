import { describe, expect, it } from 'vitest';
import { hitNear, type OverlayerLike } from '../reader/annotation-touch';

const range = {} as Range;

/** An overlayer with one drawn value at each listed point. */
const drawn = (at: Record<string, string>): OverlayerLike & { asked: string[] } => {
  const asked: string[] = [];
  return {
    asked,
    hitTest: ({ x, y }) => {
      asked.push(`${x},${y}`);
      const value = at[`${x},${y}`];
      return value ? [value, range] : [];
    },
  };
};

describe('hitNear', () => {
  it('takes what is under the finger, and looks no further', () => {
    const o = drawn({ '100,100': 'mark' });
    expect(hitNear(o, 100, 100)?.[0]).toBe('mark');
    expect(o.asked).toEqual(['100,100']);
  });

  // A finger is less exact than a pointer, and a mark can be a few characters wide.
  it('finds a mark beside the finger, trying across before up and down', () => {
    expect(hitNear(drawn({ '120,100': 'right' }), 100, 100)?.[0]).toBe('right');
    expect(hitNear(drawn({ '100,110': 'below', '80,100': 'left' }), 100, 100)?.[0]).toBe('left');
    expect(hitNear(drawn({ '140,100': 'too far' }), 100, 100)).toBeNull();
  });

  it('never counts a search result, under the finger or beside it', () => {
    expect(hitNear(drawn({ '120,100': 'foliate-search:1', '100,90': 'mark' }), 100, 100)?.[0]).toBe('mark');
    expect(hitNear(drawn({ '100,100': 'foliate-search:1' }), 100, 100)).toBeNull();
  });
});
