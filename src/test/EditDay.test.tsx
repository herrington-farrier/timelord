import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../domain/types';
import { EditPage } from '../pages/Edit';
import { api } from '../services/api';
import { ToastProvider } from '../shared/toast';

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
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resets today from the Day tab', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MemoryRouter>
          <EditPage />
        </MemoryRouter>
      </ToastProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Respawn' }));
    expect(api.resetToday).toHaveBeenCalled();
  });

  // fireEvent is synchronous, so it does not deadlock against fake timers
  // the way userEvent's awaited waits do.
  it('keeps the erase confirm armed instead of expiring', () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <MemoryRouter>
          <EditPage />
        </MemoryRouter>
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reroll Stats' }));
    expect(screen.getByRole('button', { name: 'Erase Stats?' })).toBeInTheDocument();

    // A confirm that disarms itself mid-decision can never be completed.
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.getByRole('button', { name: 'Erase Stats?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Erase Stats?' }));
    expect(api.clearLogs).toHaveBeenCalled();
  });

  it('needs two presses to erase the log', async () => {
    vi.clearAllMocks();
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MemoryRouter>
          <EditPage />
        </MemoryRouter>
      </ToastProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Reroll Stats' }));
    expect(api.clearLogs).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Erase Stats?' }));
    expect(api.clearLogs).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reroll Stats' })).toBeInTheDocument();
  });
});
