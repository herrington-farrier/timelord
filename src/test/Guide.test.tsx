import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { GuidePage } from '../pages/Guide';

describe('GuidePage', () => {
  it('explains buckets, today, calendar, and lists', () => {
    render(
        <MemoryRouter>
          <GuidePage />
        </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Personal' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Work' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your buckets' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quest' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quest Log' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lists' })).toBeInTheDocument();
  });
});
