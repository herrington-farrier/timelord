import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { APPOINTMENTS_BUCKET } from '../domain/seed';
import { DEFAULT_SETTINGS } from '../domain/types';
import { EditPage } from '../pages/Edit';
import { ToastProvider } from '../shared/toast';
import { bucket, item, workBucket } from './fixtures';

const { api } = vi.hoisted(() => ({
  api: { saveItems: vi.fn().mockResolvedValue({ ok: true, saved: 2 }) },
}));

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
      <ToastProvider>
        <MemoryRouter>
          <EditPage />
        </MemoryRouter>
      </ToastProvider>
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
