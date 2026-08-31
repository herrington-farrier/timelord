import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../domain/types';
import { TodayPage } from '../pages/Today';
import { ToastProvider } from '../shared/toast';

const dayState: { current: Record<string, unknown> } = {
  current: {
    blocks: [],
    dropped: [],
    packedMinutes: 0,
    packedAt: '2026-08-30T12:00:00.000Z',
  },
};

const { api } = vi.hoisted(() => ({
  api: {
    startDay: vi.fn().mockResolvedValue({ ok: true }),
    startNext: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock('../shared/auth', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, logOut: vi.fn() }),
}));

vi.mock('../services/live', () => ({
  useSettings: () => DEFAULT_SETTINGS,
  useBuckets: () => [],
  useDay: () => dayState.current,
}));

vi.mock('../services/api', () => ({ api }));

function renderToday() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>
    </ToastProvider>
  );
}

describe('TodayPage', () => {
  it('shows Start Day only, not Start Routine', () => {
    renderToday();
    expect(screen.getByRole('button', { name: 'Start Day' })).toHaveClass('btn--success');
    expect(screen.queryByRole('button', { name: 'Start Routine' })).not.toBeInTheDocument();
  });

  it('does not start next when remaining hits 0 or the page wakes', () => {
    const startedAt = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    dayState.current = {
      startedAt,
      section: 'morning',
      sectionStartedAt: startedAt,
      sectionRemainingMinutes: 291,
      packedAt: startedAt,
      packedMinutes: 30,
      blocks: [
        {
          id: 'floors',
          itemId: 'floors',
          kind: 'weighted',
          title: 'Floors',
          slot: 'morning',
          status: 'pending',
          date: '2026-08-30',
          bucketId: 'house',
          startMinutes: 0,
          endMinutes: 30,
          durationMinutes: 30,
          color: 'fff',
          flexible: true,
        },
      ],
      dropped: [],
    };
    renderToday();
    expect(screen.getByRole('button', { name: /Start Next Buckets/ })).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pageshow'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(api.startNext).not.toHaveBeenCalled();
  });
});
