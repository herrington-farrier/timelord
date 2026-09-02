import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ChunkBoundary, clearChunkReloadFlag } from '../components/ChunkBoundary';

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

const reload = vi.fn();

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  reload.mockClear();
  sessionStorage.clear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });
});

afterEach(() => vi.restoreAllMocks());

describe('ChunkBoundary', () => {
  // Firebase serves index.html for a missing chunk, so the browser reports a
  // module-parse failure rather than a network 404.
  const STALE = 'Failed to fetch dynamically imported module: /assets/Guide-OLD.js';

  it('reloads once when a chunk has gone stale', () => {
    render(
      <ChunkBoundary>
        <Boom message={STALE} />
      </ChunkBoundary>
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload twice, so a real error cannot loop', () => {
    render(
      <ChunkBoundary>
        <Boom message={STALE} />
      </ChunkBoundary>
    );
    render(
      <ChunkBoundary>
        <Boom message={STALE} />
      </ChunkBoundary>
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves an ordinary runtime error alone, and offers a way out', () => {
    render(
      <ChunkBoundary>
        <Boom message="Cannot read properties of undefined" />
      </ChunkBoundary>
    );
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('lets a later stale chunk reload again once the app is running', () => {
    render(
      <ChunkBoundary>
        <Boom message={STALE} />
      </ChunkBoundary>
    );
    clearChunkReloadFlag();
    render(
      <ChunkBoundary>
        <Boom message={STALE} />
      </ChunkBoundary>
    );
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
