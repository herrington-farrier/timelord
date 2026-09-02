import { render, screen } from '@testing-library/react';
import { FirebaseError } from 'firebase/app';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { APPOINTMENTS_BUCKET } from '../domain/seed';
import { DEFAULT_SETTINGS } from '../domain/types';
import { EditPage } from '../pages/Edit';
import { bucket, item, workBucket } from './fixtures';

const { api } = vi.hoisted(() => ({
  api: { saveItems: vi.fn().mockResolvedValue({ ok: true, saved: 2 }) },
}));

/** A callable failure as the SDK actually delivers it: a FirebaseError
 *  carrying `details`. A look-alike would slip past the instanceof check. */
function callableError(message: string, details: unknown): FirebaseError {
  const err = new FirebaseError('functions/invalid-argument', message);
  (err as FirebaseError & { details?: unknown }).details = details;
  return err;
}

vi.mock('../shared/auth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('../services/api', () => ({ api }));
vi.mock('../services/live', () => ({
  useSettings: () => DEFAULT_SETTINGS,
  useBuckets: () => [workBucket({}), bucket({ id: 'home', name: 'Home', weight: 2 }), APPOINTMENTS_BUCKET],
  useItems: () => [
    item({ id: 'tidy', bucketId: 'home', title: 'Tidy up', durationMinutes: 15 }),
    item({ id: 'focus', bucketId: 'work', title: 'Focus block', durationMinutes: 60 }),
  ],
}));

describe('Lists page Save', () => {
  it('sends every row in one call, including from collapsed groups', async () => {
    const user = userEvent.setup();
    render(
        <MemoryRouter>
          <EditPage />
        </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Lists' }));
    // both bucket groups start collapsed; their fields are hidden, not removed
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.saveItems).toHaveBeenCalledTimes(1);
    const rows = api.saveItems.mock.calls[0][0].rows as Record<string, unknown>[];
    expect(rows.map((r) => r.id).sort()).toEqual(['focus', 'tidy']);
    // the untouched Add New row is not a row
    expect(rows).toHaveLength(2);
  });
});

describe('a failed save', () => {
  it('marks the row and field the server named, in place', async () => {
    const user = userEvent.setup();
    api.saveItems.mockRejectedValueOnce(
      callableError('Tidy up: pick at least one section.', { itemId: 'tidy', field: 'iH' })
    );
    const { container } = render(
      <MemoryRouter>
        <EditPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Lists' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // the message is on the page, not floating over it
    expect(screen.getByText(/pick at least one section/)).toBeInTheDocument();
    // and only the named row is marked
    const marked = container.querySelectorAll('.is-invalid-row');
    expect(marked).toHaveLength(1);
    expect((marked[0] as HTMLElement).dataset.id).toBe('tidy');
  });
});
