import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { GuidePage } from '../pages/Guide';
import { ToastProvider } from '../shared/toast';

describe('GuidePage', () => {
  it('explains buckets, today, calendar, and lists', () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <GuidePage />
        </MemoryRouter>
      </ToastProvider>
    );
    expect(screen.getByRole('heading', { name: 'Personal' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Work' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your buckets' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lists' })).toBeInTheDocument();
  });
});
