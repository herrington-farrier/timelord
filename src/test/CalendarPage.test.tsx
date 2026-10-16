import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../domain/types';
import { CalendarPage } from '../pages/Calendar';

vi.mock('../shared/auth', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, logOut: vi.fn() }),
}));

vi.mock('../services/live', () => ({
  useSettings: () => DEFAULT_SETTINGS,
  useBuckets: () => undefined,
  useDays: () => ({}),
}));

describe('Calendar while buckets are loading', () => {
  it('renders the board without waiting for them', () => {
    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /Quest Log|Timelord/ })).toBeInTheDocument();
  });
});
