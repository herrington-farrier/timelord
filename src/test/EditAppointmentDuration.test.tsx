import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { APPOINTMENTS_BUCKET, PERSONAL_BUCKET, WORK_BUCKET } from '../domain/seed';
import { DEFAULT_SETTINGS } from '../domain/types';
import { EditPage } from '../pages/Edit';

const saveItems = vi.fn().mockResolvedValue({ ok: true });
let itemsMock: () => unknown[] = () => [];

vi.mock('../shared/auth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('../services/live', () => ({
  useSettings: () => DEFAULT_SETTINGS,
  useBuckets: () => [PERSONAL_BUCKET, WORK_BUCKET, APPOINTMENTS_BUCKET],
  useItems: () => itemsMock(),
}));
vi.mock('../services/api', () => ({
  api: {
    saveItems: (...a: unknown[]) => saveItems(...a),
    resetToday: vi.fn().mockResolvedValue({ ok: true }),
    rebuildRange: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe('adding an appointment', () => {
  it('saves the 30m the form shows, not 0', async () => {
    const user = userEvent.setup();
    saveItems.mockClear();
    render(
      <MemoryRouter>
        <EditPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Lists' }));
    const add = document.querySelector('.add-card form[data-kind="item"]') as HTMLFormElement;
    expect(add).toBeTruthy();

    // Pick Appointments, then fill in only the title — duration is left at
    // whatever the form defaulted to.
    await user.selectOptions(add.querySelector('select[name="bucketId"]')!, 'appointments');
    await user.type(add.querySelector('input[name="title"]')!, 'Dentist');

    const shownH = (add.querySelector('input[name="iH"]') as HTMLInputElement)?.value;
    const shownM = (add.querySelector('input[name="iM"]') as HTMLInputElement)?.value;

    await user.click(screen.getByRole('button', { name: 'Save' }));
    const rows = saveItems.mock.calls.at(-1)?.[0]?.rows || [];
    const dentist = rows.find((r: Record<string, unknown>) => r.title === 'Dentist');

    expect({ shownH, shownM, saved: dentist?.durationMinutes }).toEqual({
      shownH: '0',
      shownM: '30',
      saved: 30,
    });
  });
});

describe('a recurring appointment', () => {
  it('keeps its duration when the type is switched to recurring', async () => {
    const user = userEvent.setup();
    saveItems.mockClear();
    itemsMock = () => [];
    render(
      <MemoryRouter>
        <EditPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Lists' }));
    const add = document.querySelector('.add-card form[data-kind="item"]') as HTMLFormElement;
    await user.selectOptions(add.querySelector('select[name="bucketId"]')!, 'appointments');
    await user.type(add.querySelector('input[name="title"]')!, 'Therapy');
    const typeSel = add.querySelector('select[name="type"]') as HTMLSelectElement | null;
    if (typeSel) await user.selectOptions(typeSel, 'recurring');
    const cadSel = add.querySelector('select[name="cadenceKind"]') as HTMLSelectElement | null;
    if (cadSel) await user.selectOptions(cadSel, 'everyNDays');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const rows = saveItems.mock.calls.at(-1)?.[0]?.rows || [];
    const row = rows.find((r: Record<string, unknown>) => r.title === 'Therapy');
    expect(row?.durationMinutes).toBe(30);
  });
});

describe('an existing appointment', () => {
  it('shows the duration it was saved with', async () => {
    const user = userEvent.setup();
    itemsMock = () => [
      {
        id: 'a1',
        bucketId: 'appointments',
        title: 'Dentist',
        type: 'scheduled',
        weight: 1,
        durationMinutes: 30,
        cadence: { kind: 'daily' },
        dueAt: '2026-09-10',
        slots: ['midday'],
        slot: 'midday',
        apptTime: '14:30',
      },
    ];
    render(
      <MemoryRouter>
        <EditPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Lists' }));
    const row = document.querySelector('form[data-kind="item"][data-id="a1"]') as HTMLFormElement;
    expect(row).toBeTruthy();
    expect((row.querySelector('input[name="iH"]') as HTMLInputElement).value).toBe('0');
    expect((row.querySelector('input[name="iM"]') as HTMLInputElement).value).toBe('30');
  });
});

describe('clearing the duration fields', () => {
  it('does not silently save 0 when both are left blank', async () => {
    const user = userEvent.setup();
    saveItems.mockClear();
    itemsMock = () => [];
    render(
      <MemoryRouter>
        <EditPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Lists' }));
    const add = document.querySelector('.add-card form[data-kind="item"]') as HTMLFormElement;
    await user.selectOptions(add.querySelector('select[name="bucketId"]')!, 'appointments');
    await user.type(add.querySelector('input[name="title"]')!, 'Dentist');
    // Tapping into the minute field and clearing it is one thumb-slip on a
    // phone, and leaves an empty string rather than a 0.
    await user.clear(add.querySelector('input[name="iM"]')!);
    await user.clear(add.querySelector('input[name="iH"]')!);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const rows = saveItems.mock.calls.at(-1)?.[0]?.rows || [];
    const row = rows.find((r: Record<string, unknown>) => r.title === 'Dentist');
    expect(row?.durationMinutes).toBe(30);
  });

  it('still honours an explicit zero, which is a reminder', async () => {
    const user = userEvent.setup();
    saveItems.mockClear();
    itemsMock = () => [];
    render(
      <MemoryRouter>
        <EditPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Lists' }));
    const add = document.querySelector('.add-card form[data-kind="item"]') as HTMLFormElement;
    await user.type(add.querySelector('input[name="title"]')!, 'Ping me');
    await user.clear(add.querySelector('input[name="iM"]')!);
    await user.type(add.querySelector('input[name="iM"]')!, '0');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const rows = saveItems.mock.calls.at(-1)?.[0]?.rows || [];
    expect(rows.find((r: Record<string, unknown>) => r.title === 'Ping me')?.durationMinutes).toBe(0);
  });
});
