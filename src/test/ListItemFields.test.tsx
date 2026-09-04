import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APPOINTMENTS_BUCKET } from '../domain/seed';
import { DEFAULT_SETTINGS } from '../domain/types';
import { EditPage } from '../pages/Edit';
import { bucket, item, workBucket } from './fixtures';

const { api } = vi.hoisted(() => ({
  api: { saveItems: vi.fn().mockResolvedValue({ ok: true, saved: 1 }) },
}));

vi.mock('../shared/auth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('../services/api', () => ({ api }));
vi.mock('../services/live', () => ({
  useSettings: () => DEFAULT_SETTINGS,
  // Home runs in the evening only; Work spans morning and midday.
  useBuckets: () => [
    workBucket({ slots: ['morning', 'midday'] }),
    bucket({ id: 'home', name: 'Home', weight: 2, slot: 'evening', slots: ['evening'] }),
    APPOINTMENTS_BUCKET,
  ],
  useItems: () => [
    item({ id: 'tidy', bucketId: 'home', title: 'Tidy up', durationMinutes: 15 }),
  ],
}));

async function openLists() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <EditPage />
    </MemoryRouter>
  );
  await user.click(screen.getByRole('button', { name: 'Lists' }));
  return user;
}

function addCard(): HTMLElement {
  return screen.getByRole('heading', { name: 'Add New' }).closest('.add-card') as HTMLElement;
}

describe('the time of day on a list item', () => {
  it('states the one section a single-section bucket runs in', async () => {
    const user = await openLists();
    const card = addCard();
    await user.selectOptions(card.querySelector('select[name="bucketId"]') as HTMLSelectElement, 'home');
    expect(card.querySelector('.field-static')?.textContent).toBe('evening');
  });

  it('states it rather than offering a pointless choice', async () => {
    const user = await openLists();
    const card = addCard();
    await user.selectOptions(card.querySelector('select[name="bucketId"]') as HTMLSelectElement, 'home');
    expect(card.querySelector('select[name="slot"]')).toBeNull();
  });

  it('still offers the choice when the bucket spans more than one', async () => {
    const user = await openLists();
    const card = addCard();
    await user.selectOptions(card.querySelector('select[name="bucketId"]') as HTMLSelectElement, 'work');
    expect(card.querySelector('select[name="slot"]')).not.toBeNull();
    expect(card.querySelector('.field-static')).toBeNull();
  });
});

describe('an expiry date', () => {
  beforeEach(() => api.saveItems.mockClear());

  it('is offered on a recurring item', async () => {
    await openLists();
    expect(addCard().querySelector('input[name="expiresAt"]')).not.toBeNull();
  });

  it('is not offered on a scheduled one, which already names its day', async () => {
    const user = await openLists();
    const card = addCard();
    await user.selectOptions(card.querySelector('select[name="type"]') as HTMLSelectElement, 'scheduled');
    expect(card.querySelector('input[name="expiresAt"]')).toBeNull();
    expect(card.querySelector('input[name="dueAt"]')).not.toBeNull();
  });

  it('is sent with the row', async () => {
    const user = await openLists();
    const card = addCard();
    await user.type(card.querySelector('input[name="title"]') as HTMLInputElement, 'Physio');
    await user.type(card.querySelector('input[name="expiresAt"]') as HTMLInputElement, '2026-12-31');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const rows = api.saveItems.mock.calls[0][0].rows as Record<string, unknown>[];
    expect(rows.find((r) => r.title === 'Physio')).toMatchObject({ expiresAt: '2026-12-31' });
  });

  it('is left empty on an item that does not expire', async () => {
    const user = await openLists();
    await user.type(addCard().querySelector('input[name="title"]') as HTMLInputElement, 'Dishes');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const rows = api.saveItems.mock.calls[0][0].rows as Record<string, unknown>[];
    expect(rows.find((r) => r.title === 'Dishes')).toMatchObject({ expiresAt: '' });
  });
});
