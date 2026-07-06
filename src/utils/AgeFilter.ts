import { Resource } from '../types';

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000
};

/**
 * Parse/apply creation-age durations for the `--older-than` filter.
 * Kept as its own util so the v1.5.0 build-cache `pruneBuilder until`
 * can reuse the same duration parser.
 */
export class AgeFilter {
  /**
   * Parse a duration like "7d" / "12h" into milliseconds.
   * Accepts a positive integer followed by one of s/m/h/d/w.
   * Throws on anything else.
   */
  static parseDuration(input: string): number {
    const match = /^(\d+)([smhdw])$/.exec(input.trim());
    if (!match) {
      throw new Error(
        `Invalid duration "${input}". Expected a positive integer with a unit (s, m, h, d, w), e.g. "7d".`
      );
    }
    const value = parseInt(match[1], 10);
    if (value <= 0) {
      throw new Error(`Invalid duration "${input}". Value must be greater than 0.`);
    }
    return value * UNIT_MS[match[2]];
  }

  /**
   * Split resources into those old enough to remove and those whose
   * creation time the Docker Engine did not report (unknown age).
   * Resources newer than the threshold are in neither set — they are
   * protected, exactly like a resource matching a protection pattern.
   */
  static filterOlderThan(
    resources: Resource[],
    thresholdMs: number,
    now: number
  ): { kept: Resource[]; skippedUnknownAge: Resource[] } {
    const kept: Resource[] = [];
    const skippedUnknownAge: Resource[] = [];

    for (const resource of resources) {
      if (!resource.createdAt) {
        skippedUnknownAge.push(resource);
        continue;
      }
      if (now - resource.createdAt.getTime() >= thresholdMs) {
        kept.push(resource);
      }
      // else: newer than threshold → protected, dropped from both sets
    }

    return { kept, skippedUnknownAge };
  }
}
