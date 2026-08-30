import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

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
    rebuildRange: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Edit Day', () => {
  it('resets today from the Day tab', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MemoryRouter>
          <EditPage />
        </MemoryRouter>
      </ToastProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Reset Today' }));
    expect(api.resetToday).toHaveBeenCalled();
  });
});
