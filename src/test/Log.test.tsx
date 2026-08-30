import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { LogPage } from '../pages/Log';
import { ToastProvider } from '../shared/toast';

vi.mock('../shared/auth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));

vi.mock('../services/live', () => ({
  useLogs: () => [
    { id: '1', type: 'rebuild', date: '2026-08-29', at: '2026-08-29T12:00:00.000Z' },
    { id: '2', type: 'complete', date: '2026-08-29', at: '2026-08-29T13:00:00.000Z', title: 'Dishes' },
    { id: '3', type: 'skip', date: '2026-08-29', at: '2026-08-29T14:00:00.000Z', title: 'Floors' },
  ],
  useItems: () => [],
}));

describe('LogPage', () => {
  it('shows Schedule packed instead of rebuild', () => {
    const { container } = render(
      <ToastProvider>
        <MemoryRouter>
          <LogPage />
        </MemoryRouter>
      </ToastProvider>
    );
    expect(screen.getByText('Schedule packed')).toBeInTheDocument();
    expect(screen.queryByText('rebuild')).not.toBeInTheDocument();
    expect(container.querySelector('.log-row--pack')).toBeTruthy();
    expect(container.querySelector('.log-row--ok')).toBeTruthy();
    expect(container.querySelector('.log-row--skip')).toBeTruthy();
  });
});
