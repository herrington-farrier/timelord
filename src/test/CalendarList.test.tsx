import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ListSectionFree } from '../pages/Calendar';

describe('ListSectionFree', () => {
  it('shows leftover time for each section', () => {
    render(<ListSectionFree free={{ morning: 2 * 60, midday: 5 * 60, evening: 45 }} />);
    expect(screen.getByText(/Morning/)).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
    expect(screen.getByText(/Midday/)).toBeInTheDocument();
    expect(screen.getByText('5h')).toBeInTheDocument();
    expect(screen.getByText(/Evening/)).toBeInTheDocument();
    expect(screen.getByText('45m')).toBeInTheDocument();
  });
});
