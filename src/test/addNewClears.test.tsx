import { render, screen } from '@testing-library/react';
import { FirebaseError } from 'firebase/app';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APPOINTMENTS_BUCKET } from '../domain/seed';
import { DEFAULT_SETTINGS } from '../domain/types';
import { EditPage } from '../pages/Edit';
import { bucket, item, workBucket } from './fixtures';

/**
 * The bug: Add New is an uncontrolled form, so what you typed was still sitting
 * in it after a successful save. Editing anything else and saving again sent
 * that same row a second time, creating a duplicate bucket or item every time.
 */

const { api } = vi.hoisted(() => ({
  api: {
    saveBuckets: vi.fn().mockResolvedValue({ ok: true }),
    saveItems: vi.fn().mockResolvedValue({ ok: true, saved: 1 }),
    rebuildRange: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock('../shared/auth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('../services/api', () => ({ api }));
vi.mock('../services/live', () => ({
  useSettings: () => DEFAULT_SETTINGS,
  useBuckets: () => [workBucket({}), bucket({ id: 'home', name: 'Home', weight: 2 }), APPOINTMENTS_BUCKET],
  useItems: () => [item({ id: 'tidy', bucketId: 'home', title: 'Tidy up', durationMinutes: 15 })],
}));

function newBucketRows(callIndex: number): Record<string, unknown>[] {
  const rows = api.saveBuckets.mock.calls[callIndex][0].buckets as Record<string, unknown>[];
  return rows.filter((r) => !r.id);
}

describe('Add New on the Buckets tab', () => {
  beforeEach(() => {
    api.saveBuckets.mockClear();
    api.saveBuckets.mockResolvedValue({ ok: true });
  });

  async function openBuckets() {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <EditPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Buckets' }));
    return user;
  }

  it('does not send the same new bucket twice', async () => {
    const user = await openBuckets();
    const addCard = screen.getByRole('heading', { name: 'Add New' }).closest('.add-card') as HTMLElement;
    await user.type(addCard.querySelector('input[name="name"]') as HTMLInputElement, 'Garden');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(newBucketRows(0).map((r) => r.name)).toEqual(['Garden']);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(newBucketRows(1)).toHaveLength(0);
  });

  it('empties the form once the bucket is saved', async () => {
    const user = await openBuckets();
    const addCard = screen.getByRole('heading', { name: 'Add New' }).closest('.add-card') as HTMLElement;
    await user.type(addCard.querySelector('input[name="name"]') as HTMLInputElement, 'Garden');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const after = screen.getByRole('heading', { name: 'Add New' }).closest('.add-card') as HTMLElement;
    expect((after.querySelector('input[name="name"]') as HTMLInputElement).value).toBe('');
  });

  it('keeps what was typed when the save is refused', async () => {
    const user = await openBuckets();
    api.saveBuckets.mockRejectedValueOnce(new FirebaseError('functions/permission-denied', 'Nope.'));
    const addCard = screen.getByRole('heading', { name: 'Add New' }).closest('.add-card') as HTMLElement;
    await user.type(addCard.querySelector('input[name="name"]') as HTMLInputElement, 'Garden');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const after = screen.getByRole('heading', { name: 'Add New' }).closest('.add-card') as HTMLElement;
    expect((after.querySelector('input[name="name"]') as HTMLInputElement).value).toBe('Garden');
  });
});

describe('Add New on the Lists tab', () => {
  beforeEach(() => {
    api.saveItems.mockClear();
    api.saveItems.mockResolvedValue({ ok: true, saved: 1 });
  });

  it('does not send the same new item twice', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <EditPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Lists' }));
    const addCard = screen.getByRole('heading', { name: 'Add New' }).closest('.add-card') as HTMLElement;
    await user.type(addCard.querySelector('input[name="title"]') as HTMLInputElement, 'Water plants');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    const first = api.saveItems.mock.calls[0][0].rows as Record<string, unknown>[];
    expect(first.filter((r) => !r.id).map((r) => r.title)).toEqual(['Water plants']);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    const second = api.saveItems.mock.calls[1][0].rows as Record<string, unknown>[];
    expect(second.filter((r) => !r.id)).toHaveLength(0);
  });
});
