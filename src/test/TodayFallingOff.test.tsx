import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS, type PackedBlock } from '../domain/types';
import { TodayPage } from '../pages/Today';

function block(partial: Partial<PackedBlock> & Pick<PackedBlock, 'id' | 'kind'>): PackedBlock {
  return {
    date: '2026-09-03',
    bucketId: 'home',
    title: partial.id,
    startMinutes: 0,
    endMinutes: 30,
    durationMinutes: 30,
    status: 'pending',
    color: 'fff',
    flexible: true,
    slot: 'morning',
    ...partial,
  };
}

const dayState: { current: Record<string, unknown> } = { current: {} };

vi.mock('../shared/auth', () => ({ useAuth: () => ({ user: { uid: 'u1' }, logOut: vi.fn() }) }));
vi.mock('../services/api', () => ({ api: {} }));
vi.mock('../services/live', () => ({
  useSettings: () => DEFAULT_SETTINGS,
  useBuckets: () => [],
  useDay: () => dayState.current,
  useScore: () => 0,
}));

function renderWith(dropped: PackedBlock[], blocks: PackedBlock[] = []) {
  dayState.current = {
    blocks,
    dropped,
    startedAt: '2026-09-03T07:00:00.000Z',
    section: 'morning',
    sectionStartedAt: '2026-09-03T07:00:00.000Z',
    sectionRemainingMinutes: 120,
    packedAt: '2026-09-03T06:00:00.000Z',
  };
  render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>
  );
  return userEvent.setup();
}

describe('Falling off', () => {
  it('is shut to start with, so the day leads with what you are doing', () => {
    renderWith([block({ id: 'later', kind: 'weighted', status: 'dropped' })]);
    expect(screen.queryByText('later')).not.toBeInTheDocument();
  });

  it('says how many without being opened', () => {
    renderWith([
      block({ id: 'a', kind: 'weighted', status: 'dropped' }),
      block({ id: 'b', kind: 'weighted', status: 'dropped' }),
      block({ id: 'c', kind: 'weighted', status: 'dropped' }),
    ]);
    const toggle = screen.getByRole('button', { name: /Falling off/ });
    expect(toggle.textContent).toContain('3');
  });

  it('opens on tap and shows what did not fit', async () => {
    const user = renderWith([block({ id: 'later', kind: 'weighted', status: 'dropped' })]);
    await user.click(screen.getByRole('button', { name: /Falling off/ }));
    expect(screen.getByText(/later/)).toBeInTheDocument();
  });

  it('shuts again on a second tap', async () => {
    const user = renderWith([block({ id: 'later', kind: 'weighted', status: 'dropped' })]);
    const toggle = screen.getByRole('button', { name: /Falling off/ });
    await user.click(toggle);
    await user.click(toggle);
    expect(screen.queryByText('later')).not.toBeInTheDocument();
  });

  it('says nothing at all when everything fits', () => {
    renderWith([]);
    expect(screen.queryByRole('button', { name: /Falling off/ })).not.toBeInTheDocument();
  });
});

describe('a Personal routine counted as day time', () => {
  it('offers nothing to complete or skip', async () => {
    const user = renderWith(
      [],
      [block({ id: 'morning', kind: 'personal', title: 'Morning Routine', durationMinutes: 45 })]
    );
    await user.click(screen.getByText('Morning Routine'));
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
  });

  it('states what the section lost to it', () => {
    renderWith(
      [],
      [block({ id: 'morning', kind: 'personal', title: 'Morning Routine', durationMinutes: 45 })]
    );
    expect(screen.getByText('45m')).toBeInTheDocument();
  });

  it('sits under an appointment, above the rest of the list', () => {
    renderWith(
      [],
      [
        block({ id: 'tidy', kind: 'weighted', title: 'Tidy up' }),
        block({ id: 'morning', kind: 'personal', title: 'Morning Routine', durationMinutes: 45 }),
        block({ id: 'dentist', kind: 'appointment', title: 'Dentist' }),
      ]
    );
    const titles = [...document.querySelectorAll('.day .item')].map((el) => el.textContent || '');
    expect(titles[0]).toContain('Dentist');
    expect(titles[1]).toContain('Morning Routine');
    expect(titles[2]).toContain('Tidy up');
  });
});
