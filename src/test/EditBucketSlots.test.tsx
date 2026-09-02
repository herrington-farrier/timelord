import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { EVENTS_BUCKET, PERSONAL_BUCKET, WORK_BUCKET } from '../domain/seed';
import { DEFAULT_SETTINGS } from '../domain/types';
import { EditPage } from '../pages/Edit';
import { bucket } from './fixtures';

vi.mock('../shared/auth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));

vi.mock('../services/live', () => ({
  useSettings: () => DEFAULT_SETTINGS,
  useBuckets: () => [PERSONAL_BUCKET, WORK_BUCKET, EVENTS_BUCKET, bucket({ id: 'home', name: 'Home', weight: 2 })],
  useItems: () => [],
}));

vi.mock('../services/api', () => ({
  api: {
    resetToday: vi.fn().mockResolvedValue({ ok: true }),
    rebuildRange: vi.fn().mockResolvedValue({ ok: true }),
    saveBuckets: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

function sectionsOf(form: Element | null) {
  return [...(form?.querySelectorAll<HTMLInputElement>('input[name="slots"]') || [])].map((el) => ({
    value: el.value,
    checked: el.checked,
  }));
}

describe('Edit bucket sections', () => {
  it('gives every bucket the section toggles, not a dropdown', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <EditPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Buckets' }));
    await user.click(screen.getByRole('button', { name: /Work,/ }));
    await user.click(screen.getByRole('button', { name: /Home,/ }));

    const work = container.querySelector('form[data-kind="work"]');
    expect(sectionsOf(work)).toEqual([
      { value: 'morning', checked: false },
      { value: 'midday', checked: true },
      { value: 'evening', checked: false },
    ]);

    // a weighted bucket gets the same control it used to be denied
    const home = container.querySelector('form[data-kind="weighted"]');
    expect(sectionsOf(home)).toEqual([
      { value: 'morning', checked: true },
      { value: 'midday', checked: false },
      { value: 'evening', checked: false },
    ]);

    // and the single-section dropdown is gone everywhere
    expect(container.querySelector('select[name="slot"]')).toBeNull();
  });
});
