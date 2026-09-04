import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../domain/types';
import { EditPage } from '../pages/Edit';

const { api } = vi.hoisted(() => ({
  api: {
    saveSettings: vi.fn().mockResolvedValue({ ok: true }),
    rebuildRange: vi.fn().mockResolvedValue({ ok: true }),
    resetToday: vi.fn().mockResolvedValue({ ok: true }),
    clearLogs: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock('../shared/auth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('../services/api', () => ({ api }));
vi.mock('../services/live', () => ({
  useSettings: () => DEFAULT_SETTINGS,
  useBuckets: () => [],
  useItems: () => [],
}));

/** Both halves, so the arithmetic in each test is the whole story. */
async function setSection(
  user: ReturnType<typeof userEvent.setup>,
  slot: string,
  hours: number,
  minutes: number
) {
  await user.clear(sectionField(slot, 'Hrs'));
  await user.type(sectionField(slot, 'Hrs'), String(hours));
  await user.clear(sectionField(slot, 'Min'));
  if (minutes) await user.type(sectionField(slot, 'Min'), String(minutes));
}

/** By field name: "Morning" also labels a card in the bar above the form. */
function sectionField(slot: string, unit: 'Hrs' | 'Min'): HTMLInputElement {
  return document.querySelector(
    `input[name="sec-${slot}${unit === 'Hrs' ? 'H' : 'M'}"]`
  ) as HTMLInputElement;
}

describe('section hours on the Day tab', () => {
  beforeEach(() => api.saveSettings.mockClear());

  function renderDay() {
    render(
      <MemoryRouter>
        <EditPage />
      </MemoryRouter>
    );
    return userEvent.setup();
  }

  it('offers a field for each stretch, starting from the even split', () => {
    renderDay();
    // A 14h day divides into three 4h40m stretches.
    expect(sectionField('morning', 'Hrs').value).toBe('4');
    expect(sectionField('morning', 'Min').value).toBe('40');
    expect(sectionField('evening', 'Hrs').value).toBe('4');
  });

  it('says the sections match the day when they add up', () => {
    renderDay();
    expect(screen.getByText(/Sections total 14h, matching the day/)).toBeInTheDocument();
  });

  it('says how far over the day the sections run', async () => {
    const user = renderDay();
    // 6h + 4h40m + 4h40m = 15h20m against a 14h day.
    await setSection(user, 'morning', 6, 0);
    expect(screen.getByText(/1h 20m more than the day/)).toBeInTheDocument();
  });

  it('says how far short they fall', async () => {
    const user = renderDay();
    // 2h + 4h40m + 4h40m = 11h20m against a 14h day.
    await setSection(user, 'morning', 2, 0);
    expect(screen.getByText(/2h 40m short of the day/)).toBeInTheDocument();
  });

  it('puts the split back to even on request', async () => {
    const user = renderDay();
    await setSection(user, 'morning', 6, 0);
    await user.click(screen.getByRole('button', { name: 'Even Split' }));
    expect(sectionField('morning', 'Hrs').value).toBe('4');
    expect(screen.getByText(/matching the day/)).toBeInTheDocument();
  });

  it('sends the split with the day', async () => {
    const user = renderDay();
    await setSection(user, 'morning', 3, 0);
    await setSection(user, 'midday', 5, 0);
    await setSection(user, 'evening', 6, 0);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.saveSettings).toHaveBeenCalledTimes(1);
    expect(api.saveSettings.mock.calls[0][0]).toMatchObject({
      dayMinutes: 840,
      sectionSplit: { morning: 180, midday: 300, evening: 360 },
    });
  });
});
