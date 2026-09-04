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

function stepperValue(slot: string): string {
  const el = document.querySelector(`.stepper[data-slot="${slot}"] .stepper__value`);
  return el?.textContent || '';
}

function renderDay() {
  render(
    <MemoryRouter>
      <EditPage />
    </MemoryRouter>
  );
  return userEvent.setup();
}

describe('the section steppers', () => {
  beforeEach(() => api.saveSettings.mockClear());

  it('starts from the day divided into whole hours', () => {
    renderDay();
    // 14h is 4h, 5h, 5h — never 4h40m, which is not how a day is planned.
    expect(stepperValue('morning')).toBe('4h');
    expect(stepperValue('midday')).toBe('5h');
    expect(stepperValue('evening')).toBe('5h');
  });

  it('offers no minute field anywhere in the day settings', () => {
    renderDay();
    expect(document.querySelector('input[name="dayM"]')).toBeNull();
    expect(document.querySelector('input[name="sec-morningM"]')).toBeNull();
  });

  it('steps in whole hours, with no minute field to fill in', async () => {
    const user = renderDay();
    await user.click(screen.getByRole('button', { name: 'More Morning' }));
    expect(stepperValue('morning')).toBe('5h');
  });

  it('takes the hour it gives out of the next stretch', async () => {
    const user = renderDay();
    await user.click(screen.getByRole('button', { name: 'More Morning' }));
    expect(stepperValue('midday')).toBe('4h');
    expect(stepperValue('evening')).toBe('5h');
  });

  it('hands the hour back to the next stretch when taken away', async () => {
    const user = renderDay();
    await user.click(screen.getByRole('button', { name: 'Less Morning' }));
    expect(stepperValue('morning')).toBe('3h');
    expect(stepperValue('midday')).toBe('6h');
  });

  it('wraps, so evening borrows from morning', async () => {
    const user = renderDay();
    await user.click(screen.getByRole('button', { name: 'More Evening' }));
    expect(stepperValue('evening')).toBe('6h');
    expect(stepperValue('morning')).toBe('3h');
  });

  it('never lets the three drift from the day', async () => {
    const user = renderDay();
    await user.click(screen.getByRole('button', { name: 'More Morning' }));
    await user.click(screen.getByRole('button', { name: 'More Morning' }));
    await user.click(screen.getByRole('button', { name: 'Less Evening' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const sent = api.saveSettings.mock.calls[0][0] as {
      dayMinutes: number;
      sectionSplit: Record<string, number>;
    };
    const total = sent.sectionSplit.morning + sent.sectionSplit.midday + sent.sectionSplit.evening;
    expect(total).toBe(sent.dayMinutes);
  });

  it('stops offering a step the next stretch cannot pay for', async () => {
    const user = renderDay();
    // Drain midday into morning: 5h gives five hours and then has nothing left.
    for (let i = 0; i < 5; i += 1) {
      await user.click(screen.getByRole('button', { name: 'More Morning' }));
    }
    expect(stepperValue('midday')).toBe('0m');
    expect(screen.getByRole('button', { name: 'More Morning' })).toBeDisabled();
  });

  it('puts the day back to an even split on request', async () => {
    const user = renderDay();
    await user.click(screen.getByRole('button', { name: 'More Morning' }));
    await user.click(screen.getByRole('button', { name: 'Even Split' }));
    expect(stepperValue('morning')).toBe('4h');
    expect(stepperValue('midday')).toBe('5h');
  });

  it('sends the balance with the day', async () => {
    const user = renderDay();
    await user.click(screen.getByRole('button', { name: 'More Morning' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.saveSettings).toHaveBeenCalledTimes(1);
    expect(api.saveSettings.mock.calls[0][0]).toMatchObject({
      dayMinutes: 840,
      sectionSplit: { morning: 300, midday: 240, evening: 300 },
    });
  });

  it('carries the balance onto a new day length instead of dropping it', async () => {
    const user = renderDay();
    await user.click(screen.getByRole('button', { name: 'More Morning' }));
    const dayHours = document.querySelector('input[name="dayH"]') as HTMLInputElement;
    await user.clear(dayHours);
    await user.type(dayHours, '7');
    // Half the day, so half of each stretch, and morning keeps its extra hour.
    expect(stepperValue('morning')).toBe('2h 30m');
    expect(stepperValue('midday')).toBe('2h');
  });
});
