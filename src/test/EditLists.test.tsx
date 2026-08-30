import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../domain/types';
import { EditPage } from '../pages/Edit';
import { ToastProvider } from '../shared/toast';
import { bucket, item, workBucket } from './fixtures';

vi.mock('../shared/auth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));

vi.mock('../services/live', () => ({
  useSettings: () => DEFAULT_SETTINGS,
  useBuckets: () => [workBucket(), bucket({ id: 'house', name: 'House', weight: 4 })],
  useItems: () => [
    item({ id: 'standup', bucketId: 'work', title: 'Standup', weight: 1 }),
    item({ id: 'review', bucketId: 'work', title: 'Review', weight: 2 }),
    item({ id: 'dishes', bucketId: 'house', title: 'Dishes', weight: 1 }),
  ],
  useAppointments: () => [],
}));

vi.mock('../services/api', () => ({
  api: {
    resetToday: vi.fn().mockResolvedValue({ ok: true }),
    rebuildRange: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Edit Lists collapse', () => {
  it('keeps list items collapsed by bucket until opened', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MemoryRouter>
          <EditPage />
        </MemoryRouter>
      </ToastProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Lists' }));
    expect(screen.getByRole('button', { name: 'Work, 2' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByDisplayValue('Standup')).not.toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Work, 2' }));
    expect(screen.getByRole('button', { name: 'Work, 2' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByDisplayValue('Standup')).toBeVisible();
    expect(screen.getByDisplayValue('Dishes')).not.toBeVisible();
  });
});
