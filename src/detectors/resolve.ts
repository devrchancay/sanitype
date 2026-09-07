import type { Detector } from '../types.js';

/**
 * Resolve overlapping matches from different detectors. Higher priority
 * wins; for equal priority the longer match wins. The result is sorted by
 * start offset and contains no overlaps.
 */
export function resolveOverlaps<T extends { start: number; end: number; detectorRef: Detector }>(
  matches: T[],
): T[] {
  if (matches.length <= 1) return matches;
  const ranked = [...matches].sort(
    (a, b) =>
      (b.detectorRef.priority ?? 50) - (a.detectorRef.priority ?? 50) ||
      b.end - b.start - (a.end - a.start) ||
      a.start - b.start,
  );
  const accepted: T[] = [];
  for (const candidate of ranked) {
    const overlaps = accepted.some((m) => candidate.start < m.end && m.start < candidate.end);
    if (!overlaps) accepted.push(candidate);
  }
  return accepted.sort((a, b) => a.start - b.start);
}
