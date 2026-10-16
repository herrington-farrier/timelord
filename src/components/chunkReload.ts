export const RELOAD_KEY = 'timelord:chunk-reload';

/** Called once the app is running, so the next stale chunk may reload again. */
export function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* nothing to clear */
  }
}
