import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EVENTS_BUCKET, PERSONAL_BUCKET, WORK_BUCKET } from '../domain/seed';
import { DEFAULT_SETTINGS } from '../domain/types';
import { Toasts } from '../components/Toasts';
import { EditPage } from '../pages/Edit';
import { clearToasts } from '../shared/toastBus';
import { api } from '../services/api';

vi.mock('../shared/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));

const live = vi.hoisted(() => ({
  state: 'ready' as 'ready' | 'loading' | 'failed',
  extra: false,
  endDate: '2026-09-02',
}));

vi.mock('../services/live', async () => {
  const { LOAD_FAILED } = await import('../services/loadState');
  return {
  useSettings: () => DEFAULT_SETTINGS,
  useBuckets: () => {
    if (live.state === 'loading') return undefined;
    if (live.state === 'failed') return LOAD_FAILED;
    return [
      PERSONAL_BUCKET,
      WORK_BUCKET,
      {
        ...EVENTS_BUCKET,
        ranges: [{ id: 'trip', startDate: '2026-08-31', endDate: live.endDate }],
      },
      ...(live.extra ? [{ ...WORK_BUCKET, id: 'extra', kind: 'weighted' as const, name: 'Extra', weight: 5 }] : []),
    ];
  },
  useItems: () => [],
  useAppointments: () => [],
  };
});

vi.mock('../services/api', () => ({
  api: {
    resetToday: vi.fn().mockResolvedValue({ ok: true }),
    rebuildRange: vi.fn().mockResolvedValue({ ok: true }),
    saveBuckets: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('Edit Events ranges', () => {
  it('adds and removes event ranges including a 1-day block', async () => {
    const user = userEvent.setup();
    render(
        <MemoryRouter>
          <EditPage />
        </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Buckets' }));
    await user.click(screen.getByRole('button', { name: /Events,/ }));
    expect(screen.getByDisplayValue('2026-08-31')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-09-02')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add New' }));
    const starts = screen.getAllByLabelText('Start');
    const ends = screen.getAllByLabelText('End');
    expect(starts).toHaveLength(2);
    await user.type(starts[1], '2026-09-10');
    await user.type(ends[1], '2026-09-10');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    const payload = vi.mocked(api.saveBuckets).mock.calls[0][0] as { buckets: { ranges?: { startDate: string; endDate: string }[] }[] };
    const events = payload.buckets.find((b) => b.ranges);
    expect(events?.ranges).toEqual([
      { id: 'trip', startDate: '2026-08-31', endDate: '2026-09-02' },
      expect.objectContaining({ startDate: '2026-09-10', endDate: '2026-09-10' }),
    ]);

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.getAllByLabelText('Start')).toHaveLength(1);
  });
});

describe('Edit Buckets regressions', () => {
  afterEach(() => {
    live.state = 'ready';
    live.extra = false;
    live.endDate = '2026-09-02';
    clearToasts();
  });

  it('does not offer the Buckets form until the buckets have loaded', async () => {
    live.state = 'loading';
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <EditPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Buckets' }));
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Events,/ })).not.toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('says "Could not load." when the buckets listener was refused', async () => {
    live.state = 'failed';
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <EditPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Buckets' }));
    expect(screen.getByText('Could not load.')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('toasts an Events range that does not parse as Save Buckets, and does not write', async () => {
    const user = userEvent.setup();
    vi.mocked(api.saveBuckets).mockClear();
    render(
      <MemoryRouter>
        <Toasts />
        <EditPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Buckets' }));
    await user.click(screen.getByRole('button', { name: /Events,/ }));
    await user.click(screen.getByRole('button', { name: 'Add New' }));
    await user.type(screen.getAllByLabelText('Start')[1], '2026-09-10');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Save Buckets — Each event range needs a start and end date/)).toBeInTheDocument();
    expect(api.saveBuckets).not.toHaveBeenCalled();
  });

  it('keeps what was typed in an Events range through an unrelated bucket snapshot, and resets when the ranges change', async () => {
    const user = userEvent.setup();
    const tree = () => (
      <MemoryRouter>
        <EditPage />
      </MemoryRouter>
    );
    const { rerender } = render(tree());
    await user.click(screen.getByRole('button', { name: 'Buckets' }));
    await user.click(screen.getByRole('button', { name: /Events,/ }));
    await user.type(screen.getByPlaceholderText('Conference'), 'Trip');

    live.extra = true;
    rerender(tree());
    expect(screen.getByPlaceholderText('Conference')).toHaveValue('Trip');

    live.endDate = '2026-09-05';
    rerender(tree());
    expect(screen.getByPlaceholderText('Conference')).toHaveValue('');
    expect(screen.getByDisplayValue('2026-09-05')).toBeInTheDocument();
  });

  it('toasts a Buckets save failure under the control name', async () => {
    const user = userEvent.setup();
    vi.mocked(api.saveBuckets).mockRejectedValueOnce(new FirebaseError('functions/permission-denied', 'no'));
    render(
      <MemoryRouter>
        <Toasts />
        <EditPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Buckets' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Save Buckets: invite-only.')).toBeInTheDocument();
  });
});
