import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { APPOINTMENTS_BUCKET } from '../domain/seed';
import { APPOINTMENTS_ID, DEFAULT_SETTINGS } from '../domain/types';
import { EditPage } from '../pages/Edit';
import { ToastProvider } from '../shared/toast';

vi.mock('../shared/auth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));

vi.mock('../services/live', () => ({
  useSettings: () => DEFAULT_SETTINGS,
  useBuckets: () => [APPOINTMENTS_BUCKET],
  useItems: () => [
    {
      id: 'dentist',
      bucketId: APPOINTMENTS_ID,
      title: 'Dentist',
      type: 'scheduled',
      weight: 1,
      durationMinutes: 30,
      cadence: { kind: 'daily' },
      dueAt: '2026-08-30',
    },
    {
      id: 'callback',
      bucketId: APPOINTMENTS_ID,
      title: 'Call back',
      type: 'scheduled',
      weight: 2,
      durationMinutes: 0,
      cadence: { kind: 'daily' },
      dueAt: '2026-08-30',
    },
  ],
}));

vi.mock('../services/api', () => ({
  api: {
    resetToday: vi.fn().mockResolvedValue({ ok: true }),
    clearLogs: vi.fn().mockResolvedValue({ ok: true, removed: 0 }),
    rebuildRange: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('appointment duration in Lists', () => {
  it('shows saved durations as stored, including a 0-duration reminder', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MemoryRouter>
          <EditPage />
        </MemoryRouter>
      </ToastProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Lists' }));
    await user.click(screen.getByRole('button', { name: /Appointments/ }));

    const hours = screen.getAllByLabelText('Hrs');
    const minutes = screen.getAllByLabelText('Min');
    // [0] is the Add New row: no stored value, so it falls back to 30m.
    expect(hours[0]).toHaveValue(0);
    expect(minutes[0]).toHaveValue(30);
    // A saved 30m appointment is 0h 30m, not 1h.
    expect(hours[1]).toHaveValue(0);
    expect(minutes[1]).toHaveValue(30);
    // A saved 0-duration reminder stays 0, rather than defaulting to 30m.
    expect(hours[2]).toHaveValue(0);
    expect(minutes[2]).toHaveValue(0);
  });
});
