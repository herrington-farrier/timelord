import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../domain/types';
import { TodayPage } from '../pages/Today';
import { ToastProvider } from '../shared/toast';

vi.mock('../shared/auth', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, logOut: vi.fn() }),
}));

vi.mock('../services/live', () => ({
  useSettings: () => DEFAULT_SETTINGS,
  useBuckets: () => [],
  useDay: () => ({
    blocks: [],
    dropped: [],
    packedMinutes: 0,
    packedAt: '2026-08-29T12:00:00.000Z',
  }),
}));

vi.mock('../services/api', () => ({
  api: { startDay: vi.fn().mockResolvedValue({ ok: true }) },
}));

describe('TodayPage', () => {
  it('shows Start Day only, not Start Routine', () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <TodayPage />
        </MemoryRouter>
      </ToastProvider>
    );
    expect(screen.getByRole('button', { name: 'Start Day' })).toHaveClass('btn--success');
    expect(screen.queryByRole('button', { name: 'Start Routine' })).not.toBeInTheDocument();
  });
});
