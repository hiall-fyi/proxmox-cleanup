import { AgeFilter } from '../AgeFilter';
import { Resource } from '../../types';
import * as fc from 'fast-check';

const UNITS: Record<string, number> = {
  s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000
};

describe('AgeFilter.parseDuration', () => {
  it('parses each unit correctly', () => {
    expect(AgeFilter.parseDuration('30s')).toBe(30_000);
    expect(AgeFilter.parseDuration('5m')).toBe(300_000);
    expect(AgeFilter.parseDuration('2h')).toBe(7_200_000);
    expect(AgeFilter.parseDuration('7d')).toBe(604_800_000);
    expect(AgeFilter.parseDuration('1w')).toBe(604_800_000);
  });

  it('round-trips value * unit for any valid input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9999 }),
        fc.constantFrom('s', 'm', 'h', 'd', 'w'),
        (value, unit) => {
          expect(AgeFilter.parseDuration(`${value}${unit}`)).toBe(value * UNITS[unit]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('throws on garbage, missing suffix, zero, negative, and unknown unit', () => {
    for (const bad of ['', 'abc', '7', '7x', '0d', '-3d', 'd', '1.5d', '7 d']) {
      expect(() => AgeFilter.parseDuration(bad)).toThrow();
    }
  });
});

describe('AgeFilter.filterOlderThan', () => {
  const now = new Date('2026-07-05T00:00:00.000Z').getTime();
  const mk = (id: string, createdAt?: Date): Resource => ({
    id, name: id, type: 'image', size: 0, createdAt, tags: []
  });

  it('keeps resources at or past the threshold, protects newer ones', () => {
    const old = mk('old', new Date(now - 10 * 86_400_000)); // 10d old
    const exact = mk('exact', new Date(now - 7 * 86_400_000)); // exactly 7d
    const fresh = mk('fresh', new Date(now - 1 * 86_400_000)); // 1d old
    const { kept, skippedUnknownAge } = AgeFilter.filterOlderThan(
      [old, exact, fresh], 7 * 86_400_000, now
    );
    expect(kept.map(r => r.id).sort()).toEqual(['exact', 'old']);
    expect(skippedUnknownAge).toHaveLength(0);
  });

  it('never keeps an unknown-age resource regardless of threshold; surfaces it', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 ** 12 }), (thresholdMs) => {
        const unknown = mk('u');
        const { kept, skippedUnknownAge } = AgeFilter.filterOlderThan([unknown], thresholdMs, now);
        expect(kept).toHaveLength(0);
        expect(skippedUnknownAge.map(r => r.id)).toEqual(['u']);
      }),
      { numRuns: 100 }
    );
  });

  it('partitions a mixed-age array into kept, neither, and skippedUnknownAge simultaneously', () => {
    const old = mk('old', new Date(now - 10 * 86_400_000)); // 10d old (should be kept)
    const fresh = mk('fresh', new Date(now - 1 * 86_400_000)); // 1d old (too new, neither)
    const unknown = mk('unknown'); // undefined createdAt (should be skippedUnknownAge)
    const { kept, skippedUnknownAge } = AgeFilter.filterOlderThan(
      [old, fresh, unknown],
      7 * 86_400_000, // 7d threshold
      now
    );
    expect(kept.map(r => r.id)).toEqual(['old']);
    expect(skippedUnknownAge.map(r => r.id)).toEqual(['unknown']);
    // Fresh is neither kept nor skippedUnknownAge — it's implicitly discarded.
  });
});
