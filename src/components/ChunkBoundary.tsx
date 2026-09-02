import { Component, type ErrorInfo, type ReactNode } from 'react';

const RELOAD_KEY = 'timelord:chunk-reload';

/**
 * Catches the one failure a code-split app reliably produces: a page whose
 * chunk no longer exists because a deploy replaced it while the tab was open.
 *
 * Firebase serves index.html for any unmatched path, so a stale chunk URL comes
 * back as HTML with a 200 rather than a 404. The browser then fails to parse it
 * as a module, the lazy() promise rejects, and without a boundary React unmounts
 * the routed tree — leaving the page blank.
 *
 * The fix is to reload, which fetches a fresh index.html (served no-cache) and
 * with it the current chunk names. Guarded by a session flag so a genuine
 * runtime error cannot turn into a reload loop.
 */
type Props = { children: ReactNode };
type State = { failed: boolean };

function looksLikeStaleChunk(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unexpected token '<'|expected expression, got '<'/i.test(
    message
  );
}

export class ChunkBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Route failed to load', error, info);
    if (!looksLikeStaleChunk(error)) return;
    let reloadedAlready = false;
    try {
      reloadedAlready = sessionStorage.getItem(RELOAD_KEY) === '1';
      sessionStorage.setItem(RELOAD_KEY, '1');
    } catch {
      // private browsing: fall through to the message rather than looping
      reloadedAlready = true;
    }
    if (!reloadedAlready) window.location.reload();
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="err">
          That page failed to load.{' '}
          <button type="button" className="btn--gold" onClick={() => window.location.reload()}>
            Reload
          </button>
        </p>
      );
    }
    return this.props.children;
  }
}

/** Called once the app is running, so the next stale chunk may reload again. */
export function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* nothing to clear */
  }
}
