/**
 * Render a date as a filename-safe ISO slug, e.g.
 * `2026-06-14T03-21-09-123Z`. Replaces the `:` and `.` characters that
 * are illegal in filenames on some platforms with `-`.
 */
export function isoSlug(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}
