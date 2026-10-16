/** What a hook returns once its listener was refused, so a page can say so instead of loading forever. */
export const LOAD_FAILED = { failed: true } as const;
export type LoadFailed = typeof LOAD_FAILED;

export function isLoadFailed(value: unknown): value is LoadFailed {
  return value === LOAD_FAILED;
}
