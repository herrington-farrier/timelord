import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../domain/types';
import { EditPage } from '../pages/Edit';
import { api } from '../services/api';

vi.mock('../shared/auth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));

vi.mock('../services/live', () => ({
  useSettings: () => DEFAULT_SETTINGS,
  useBuckets: () => [],
  useItems: () => [],
  useAppointments: () => [],
}));

vi.mock('../services/api', () => ({
  api: {
    resetToday: vi.fn().mockResolvedValue({ ok: true }),
    clearLogs: vi.fn().mockResolvedValue({ ok: true, removed: 3 }),
    rebuildRange: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Edit Day', () => {

  it('resets today from the Day tab', async () => {
    const user = userEvent.setup();
    render(
        <MemoryRouter>
          <EditPage />
        </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Respawn' }));
    expect(api.resetToday).toHaveBeenCalled();
  });

  it('asks before erasing the log, and only erases when confirmed', async () => {
    vi.clearAllMocks();
    const user = userEvent.setup();
    render(
        <MemoryRouter>
          <EditPage />
        </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Reroll Stats' }));
    expect(screen.getByText('Erase all Stats?')).toBeInTheDocument();
    expect(api.clearLogs).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.clearLogs).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Reroll Stats' }));
    await user.click(screen.getByRole('button', { name: 'Erase' }));
    expect(api.clearLogs).toHaveBeenCalled();
  });
});
