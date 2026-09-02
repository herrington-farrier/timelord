import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { Chrome } from '../components/Chrome';

function renderChrome(path: string) {
  return render(
      <MemoryRouter initialEntries={[path]}>
        <Chrome title="Strategize">body</Chrome>
      </MemoryRouter>
  );
}

describe('Chrome', () => {
  it('keeps the nav behind the title on every page', async () => {
    const user = userEvent.setup();
    const { container } = renderChrome('/edit');
    const panel = container.querySelector('.menu-panel');

    expect(panel).toHaveAttribute('hidden');
    expect(screen.queryByRole('link', { name: 'Quest Log' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Strategize' }));
    expect(panel).not.toHaveAttribute('hidden');
    expect(screen.getByRole('link', { name: 'Quest Log' })).toBeVisible();
  });

  it('marks the current page in the menu', async () => {
    const user = userEvent.setup();
    renderChrome('/edit');
    await user.click(screen.getByRole('button', { name: 'Strategize' }));
    expect(screen.getByRole('link', { name: 'Strategize' })).toHaveClass('is-on');
    expect(screen.getByRole('link', { name: 'Quest' })).not.toHaveClass('is-on');
    expect(screen.getByRole('link', { name: 'Quest Log' })).not.toHaveClass('is-on');
    expect(screen.getByRole('link', { name: 'Guide' })).toBeInTheDocument();
  });

  it('has no pack control: every write repacks on its own', async () => {
    const user = userEvent.setup();
    const { container } = renderChrome('/edit');
    await user.click(screen.getByRole('button', { name: 'Strategize' }));
    expect(screen.queryByRole('button', { name: /Pack/ })).not.toBeInTheDocument();
    const labels = [...container.querySelectorAll('.menu-panel .chrome-btn')].map((el) => el.textContent);
    expect(labels).toEqual(['Quest', 'Quest Log', 'Strategize', 'Guide', 'Stats']);
  });
});
