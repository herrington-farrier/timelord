import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { Chrome, packBarVisible } from '../components/Chrome';
import { ToastProvider } from '../shared/toast';

function renderChrome(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Chrome title="Edit">body</Chrome>
      </MemoryRouter>
    </ToastProvider>
  );
}

describe('packBarVisible', () => {
  it('hides on Today and Guide', () => {
    expect(packBarVisible('/')).toBe(false);
    expect(packBarVisible('/guide')).toBe(false);
    expect(packBarVisible('/edit')).toBe(true);
    expect(packBarVisible('/calendar')).toBe(true);
    expect(packBarVisible('/log')).toBe(true);
  });
});

describe('Chrome', () => {
  it('marks the current page in the menu', () => {
    renderChrome('/edit');
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveClass('is-on');
    expect(screen.getByRole('link', { name: 'Today' })).not.toHaveClass('is-on');
    expect(screen.getByRole('link', { name: 'Guide' })).toBeInTheDocument();
  });

  it('sticks Pack the Day on Edit, not Today or Guide', () => {
    const edit = renderChrome('/edit');
    expect(screen.getByRole('button', { name: 'Pack the Day' })).toBeInTheDocument();
    edit.unmount();
    const today = renderChrome('/');
    expect(screen.queryByRole('button', { name: 'Pack the Day' })).not.toBeInTheDocument();
    today.unmount();
    renderChrome('/guide');
    expect(screen.queryByRole('button', { name: 'Pack the Day' })).not.toBeInTheDocument();
  });
});
