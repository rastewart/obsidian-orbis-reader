import { describe, expect, it } from 'vitest';
import { BUILD_ID, buildLabel } from '../build-info';

describe('build-info', () => {
  it('falls back to "dev" when the build-time define is absent (test/dev env)', () => {
    // Proves the typeof guard never throws on the undeclared global.
    expect(BUILD_ID).toBe('dev');
  });

  it('buildLabel names the build', () => {
    expect(buildLabel()).toBe('Orbis build dev');
  });
});
