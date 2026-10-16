import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../domain/types';
import { Toasts } from '../components/Toasts';
import { EditPage } from '../pages/Edit';
import { clearToasts } from '../shared/toastBus';
import { api } from '../services/api';

vi.mock('../shared/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));

const live = vi.hoisted(() => ({ settings: null as unknown }));

vi.mock('../services/live', () => ({
  useSettings: () => live.settings ?? DEFAULT_SETTINGS,
  useBuckets: () => [],
  useItems: () => [],
  useAppointments: () => [],
}));

vi.mock('../services/api', () => ({
  api: {
    resetToday: vi.fn().mockResolvedValue({ ok: true }),
    clearLogs: vi.fn().mockResolvedValue({ ok: true, removed: 3 }),
    rebuildRange: vi.fn().mockResolvedValue({ ok: true }),
    saveSettings: vi.fn().mockResolvedValue({ ok: true }),
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

describe('Edit Day regressions', () => {
  afterEach(() => {
    live.settings = null;
    clearToasts();
  });

  it('toasts a Day save failure under the control name', async () => {
    const user = userEvent.setup();
    vi.mocked(api.saveSettings).mockRejectedValueOnce(new FirebaseError('functions/unavailable', 'down'));
    render(
      <MemoryRouter>
        <Toasts />
        <EditPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Save Day: offline?')).toBeInTheDocument();
  });

  it('toasts a failed Respawn, and confirms a good one', async () => {
    const user = userEvent.setup();
    vi.mocked(api.resetToday).mockRejectedValueOnce(new FirebaseError('functions/permission-denied', 'no'));
    render(
      <MemoryRouter>
        <Toasts />
        <EditPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Respawn' }));
    expect(await screen.findByText('Respawn: invite-only.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Respawn' }));
    expect(await screen.findByText('Quests reset. +1 Life')).toBeInTheDocument();
  });

  it('shows new values after the settings change under an open Day form', () => {
    live.settings = { ...DEFAULT_SETTINGS, transitionMinutes: 5 };
    const tree = () => (
      <MemoryRouter>
        <EditPage />
      </MemoryRouter>
    );
    const { rerender } = render(tree());
    expect(screen.getByLabelText('Transition minutes')).toHaveValue(5);

    live.settings = { ...DEFAULT_SETTINGS, transitionMinutes: 9 };
    rerender(tree());
    expect(screen.getByLabelText('Transition minutes')).toHaveValue(9);
  });
});
