import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('shows Start Quest as the seal, not Start Routine', () => {
    renderToday();
    expect(screen.getByRole('button', { name: 'Start Quest' })).toHaveClass('day-seal-btn');
    expect(screen.queryByRole('button', { name: 'Start Routine' })).not.toBeInTheDocument();
  });

  it('heads the page with labelled stats, and the timer only once running', () => {
    const { container, unmount } = renderToday();
    expect(screen.getByText('Day')).toBeInTheDocument();
    expect(screen.getByText('Packed')).toBeInTheDocument();
    expect(container.querySelector('.section-timer')).toBeNull();
    unmount();

    const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    dayState.current = {
      startedAt,
      section: 'midday',
      sectionStartedAt: startedAt,
      sectionRemainingMinutes: 90,
      packedAt: startedAt,
      packedMinutes: 30,
      blocks: [],
      dropped: [],
    };
    const second = renderToday();
    expect(second.container.querySelector('.section-timer')).toBeTruthy();
    expect(screen.getByText('Midday')).toBeInTheDocument();
    second.unmount();
    dayState.current = {
      blocks: [],
      dropped: [],
      packedMinutes: 0,
      packedAt: '2026-08-30T12:00:00.000Z',
    };
  });

  it('uses the title itself to open and close the menu', async () => {
    const user = userEvent.setup();
    const { container } = renderToday();
    const toggle = screen.getByRole('button', { name: 'Timelord' });
    const panel = container.querySelector('.menu-panel');

    // The closed panel must carry `hidden`; a stray `display` rule on
    // .menu-panel once outranked the UA sheet and pinned it open.
    expect(panel).toHaveAttribute('hidden');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Quest Log' })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(panel).not.toHaveAttribute('hidden');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Quest Log' })).toBeVisible();

    await user.click(toggle);
    expect(panel).toHaveAttribute('hidden');
    expect(screen.queryByRole('link', { name: 'Quest Log' })).not.toBeInTheDocument();
  });

  it('keeps Sign Out in the menu, not on the page', async () => {
    const user = userEvent.setup();
    renderToday();
    expect(screen.queryByRole('button', { name: 'Sign Out' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Timelord' }));
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Pack/ })).not.toBeInTheDocument();
  });

  it('greys the seal instead of saying the day ended', () => {
    dayState.current = {
      blocks: [],
      dropped: [],
      packedMinutes: 0,
      packedAt: '2026-08-30T12:00:00.000Z',
      startedAt: '2026-08-30T13:00:00.000Z',
      endedAt: '2026-08-30T21:00:00.000Z',
    };
    renderToday();
    expect(screen.queryByText('Day ended.')).not.toBeInTheDocument();
    expect(screen.getByAltText('Day ended')).toHaveClass('is-done');
    expect(screen.queryByRole('button', { name: 'Start Quest' })).not.toBeInTheDocument();
  });

  it('hides Complete and Skip until the item is tapped open', async () => {
    const user = userEvent.setup();
    const startedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    dayState.current = {
      startedAt,
      section: 'morning',
      sectionStartedAt: startedAt,
      sectionRemainingMinutes: 120,
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
    const { container } = renderToday();
    const row = screen.getByRole('button', { name: /Floors/ });
    const acts = container.querySelector('.item-acts');

    expect(acts).toHaveAttribute('hidden');
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();

    await user.click(row);
    expect(acts).not.toHaveAttribute('hidden');
    expect(screen.getByRole('button', { name: 'Complete' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeVisible();

    await user.click(row);
    expect(acts).toHaveAttribute('hidden');
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /Start Next Chapter/ })).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pageshow'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(api.startNext).not.toHaveBeenCalled();
  });
});
