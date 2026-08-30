import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../domain/types';
import { EditPage } from '../pages/Edit';
import { ToastProvider } from '../shared/toast';

vi.mock('../shared/auth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));

vi.mock('../services/live', () => ({
  useSettings: () => DEFAULT_SETTINGS,
  useBuckets: () => [],
  useItems: () => [],
  useAppointments: () => [
    { id: 'dentist', title: 'Dentist', date: '2026-08-30', durationMinutes: 30, color: 'f87171' },
  ],
}));

vi.mock('../services/api', () => ({
  api: {
    resetToday: vi.fn().mockResolvedValue({ ok: true }),
    rebuildRange: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('appointment duration reset', () => {
  it('does not show a saved 30m appointment as 1 hour', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MemoryRouter>
          <EditPage />
        </MemoryRouter>
      </ToastProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Appointments' }));
    const hours = screen.getAllByLabelText('Hrs');
    const minutes = screen.getAllByLabelText('Min');
    expect(hours[0]).toHaveValue(1);
    expect(minutes[0]).toHaveValue(0);
    expect(hours[1]).toHaveValue(0);
    expect(minutes[1]).toHaveValue(30);
  });
});
