import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { EVENTS_BUCKET, PERSONAL_BUCKET, WORK_BUCKET } from '../domain/seed';
import { DEFAULT_SETTINGS } from '../domain/types';
import { EditPage } from '../pages/Edit';
import { ToastProvider } from '../shared/toast';
import { bucket } from './fixtures';

vi.mock('../shared/auth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));

vi.mock('../services/live', () => ({
  useSettings: () => DEFAULT_SETTINGS,
  useBuckets: () => [PERSONAL_BUCKET, WORK_BUCKET, EVENTS_BUCKET, bucket({ id: 'home', name: 'Home', weight: 2 })],
  useItems: () => [],
  useAppointments: () => [],
}));

vi.mock('../services/api', () => ({
  api: {
    resetToday: vi.fn().mockResolvedValue({ ok: true }),
    rebuildRange: vi.fn().mockResolvedValue({ ok: true }),
    saveBuckets: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Edit Work sections', () => {
  it('lets Work pick multiple sections with toggles, not a dropdown', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MemoryRouter>
          <EditPage />
        </MemoryRouter>
      </ToastProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Buckets' }));
    await user.click(screen.getByRole('button', { name: /Work,/ }));
    expect(screen.getByRole('checkbox', { name: 'morning' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'midday' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'evening' })).toBeInTheDocument();
    const workForm = screen.getByRole('checkbox', { name: 'midday' }).closest('form');
    expect(workForm?.querySelector('select[name="slot"]')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Home,/ }));
    expect(document.querySelector('form[data-kind="weighted"] select[name="slot"]')).toBeTruthy();
  });
});
