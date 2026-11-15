import { describe, expect, it } from 'vitest';
import { BUILD_COMMIT, BUILD_TIME, buildLabel } from '../build-info';

describe('build-info', () => {
  it('falls back to "dev" when the build-time define is absent (test/dev env)', () => {
    // Proves the typeof guard never throws on the undeclared global.
    expect(BUILD_TIME).toBe('dev');
    expect(BUILD_COMMIT).toBe('dev');
  });

  it('buildLabel combines time and commit into one line', () => {
    expect(buildLabel()).toBe('Orbis build dev · dev');
  });
});
