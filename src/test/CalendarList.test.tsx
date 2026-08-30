import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ListSectionFree } from '../pages/Calendar';

describe('ListSectionFree', () => {
  it('shows leftover time for each section', () => {
    const cap = { morning: 5 * 60, midday: 5 * 60, evening: 5 * 60 };
    render(<ListSectionFree free={{ morning: 2 * 60, midday: 5 * 60, evening: 0 }} cap={cap} />);
    expect(screen.getByText(/Morning/)).toBeInTheDocument();
    expect(screen.getByText('2h')).toHaveClass('cal-hrs--mid');
    expect(screen.getByText(/Midday/)).toBeInTheDocument();
    expect(screen.getByText('5h')).toHaveClass('cal-hrs--ok');
    expect(screen.getByText(/Evening/)).toBeInTheDocument();
    expect(screen.getByText('0m')).toHaveClass('cal-hrs--hot');
  });
});
