import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { LogPage } from '../pages/Log';

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
  it('reads events as quests and colours each row by tone', () => {
    const { container } = render(
        <MemoryRouter>
          <LogPage />
        </MemoryRouter>
    );
    expect(screen.getByText('Quest Log Packed')).toBeInTheDocument();
    expect(screen.getByText('Quest Completed: Dishes')).toBeInTheDocument();
    expect(screen.getByText('Quest Failed: Floors')).toBeInTheDocument();
    expect(screen.queryByText('rebuild')).not.toBeInTheDocument();
    // every row carries the base class, so untoned system events pick up
    // the gold default rather than falling back to plain body text
    expect(container.querySelectorAll('.log-row')).toHaveLength(3);
    expect(container.querySelector('.log-row--ok')).toBeTruthy();
    expect(container.querySelector('.log-row--skip')).toBeTruthy();
  });
});
