/**
 * Extract a human-readable message from an unknown thrown value.
 * Returns `error.message` for Error instances, otherwise the stringified value.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
