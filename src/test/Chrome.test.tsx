import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { Chrome } from '../components/Chrome';

describe('Chrome', () => {
  it('marks the current page in the menu', () => {
    render(
      <MemoryRouter initialEntries={['/edit']}>
        <Chrome title="Edit">body</Chrome>
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveClass('is-on');
    expect(screen.getByRole('link', { name: 'Today' })).not.toHaveClass('is-on');
  });
});
