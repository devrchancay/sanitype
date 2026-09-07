import { expect } from 'vitest';
import type { Detector } from '../src/index.js';

/** Assert that a detector matches exactly the expected substrings, in order. */
export function expectMatches(detector: Detector, input: string, expected: string[]): void {
  const found = detector.test(input)?.map((m) => m.value) ?? [];
  expect(found, `input: ${JSON.stringify(input)}`).toEqual(expected);
}

/** Assert that a detector matches nothing in each input. */
export function expectNoMatch(detector: Detector, inputs: string[]): void {
  for (const input of inputs) {
    expect(detector.test(input), `should not match: ${JSON.stringify(input)}`).toBeNull();
  }
}

/** Assert that the match offsets are consistent with the matched text. */
export function expectConsistentOffsets(detector: Detector, input: string): void {
  for (const match of detector.test(input) ?? []) {
    expect(input.slice(match.start, match.end)).toBe(match.value);
  }
}
