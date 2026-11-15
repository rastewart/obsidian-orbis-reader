// Wrapping a built-in so the wrap can come off again — and without taking anyone else's wrap with it.

import { describe, expect, it } from 'vitest';
import { wrapMethod, wrapSetter } from '../runtime-patch';

class Base {
  greet(name: string): string {
    return `hello ${name}`;
  }
}
class Derived extends Base {}

describe('wrapMethod', () => {
  it('wraps, and puts an inherited method back by deleting its own copy', () => {
    const undo = wrapMethod(
      Derived.prototype,
      'greet',
      (original) =>
        function (this: unknown, ...args: unknown[]) {
          return `${Reflect.apply(original, this, args) as string}!`;
        }
    );
    expect(new Derived().greet('a')).toBe('hello a!');
    undo();
    expect(new Derived().greet('a')).toBe('hello a');
    expect(Object.hasOwn(Derived.prototype, 'greet')).toBe(false);
  });

  it('puts an own method back as it was', () => {
    const target = { f: () => 1 };
    const original = target.f;
    const undo = wrapMethod(target, 'f', () => () => 2);
    expect(target.f()).toBe(2);
    undo();
    expect(target.f).toBe(original);
  });

  // Another plugin wrapped on top of Orbis: undoing Orbis's must leave theirs working.
  it('becomes a pass-through, rather than removing a wrap made on top of it', () => {
    const target = { f: (x: number) => x };
    const undoOurs = wrapMethod(target, 'f', () => (x) => (x as number) * 10);
    const undoTheirs = wrapMethod(target, 'f', (inner) => (x) => (Reflect.apply(inner, undefined, [x]) as number) + 1);
    expect(target.f(2)).toBe(21);
    undoOurs();
    expect(target.f(2)).toBe(3); // theirs still runs; ours passes through
    undoTheirs();
    expect(target.f(2)).toBe(2); // theirs put back our layer, which only passes through to the original
  });

  it('is safe to undo twice', () => {
    const target = { f: () => 1 };
    const undo = wrapMethod(target, 'f', () => () => 2);
    undo();
    undo();
    expect(target.f()).toBe(1);
  });
});

describe('wrapSetter', () => {
  class Holder {
    stored = '';
    get value(): string {
      return this.stored;
    }
    set value(v: string) {
      this.stored = v;
    }
  }

  it('wraps the setter, keeps the getter, and puts the property back', () => {
    const before = Object.getOwnPropertyDescriptor(Holder.prototype, 'value');
    const undo = wrapSetter(
      Holder.prototype,
      'value',
      (original) =>
        function (this: unknown, v: unknown) {
          Reflect.apply(original, this, [`<${String(v)}>`]);
        }
    );
    const h = new Holder();
    h.value = 'x';
    expect(h.value).toBe('<x>');
    undo?.();
    h.value = 'y';
    expect(h.value).toBe('y');
    expect(Object.getOwnPropertyDescriptor(Holder.prototype, 'value')).toEqual(before);
  });

  it('changes nothing when the property is not an accessor', () => {
    const target = { plain: 1 };
    expect(wrapSetter(target, 'plain', (s) => s)).toBeNull();
  });
});
