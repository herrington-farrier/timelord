import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { EVENTS_BUCKET, PERSONAL_BUCKET, WORK_BUCKET } from '../domain/seed';
import { DEFAULT_SETTINGS } from '../domain/types';
import { EditPage } from '../pages/Edit';
import { api } from '../services/api';

vi.mock('../shared/auth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));

vi.mock('../services/live', () => ({
  useSettings: () => DEFAULT_SETTINGS,
  useBuckets: () => [
    PERSONAL_BUCKET,
    WORK_BUCKET,
    {
      ...EVENTS_BUCKET,
      ranges: [{ id: 'trip', startDate: '2026-08-31', endDate: '2026-09-02' }],
    },
  ],
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

    await user.click(screen.getByRole('button', { name: 'Add range' }));
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
