import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DaySectionsBar } from '../components/DaySectionsBar';

describe('DaySectionsBar', () => {
  it('shows the three equal section lengths for a 14h day', () => {
    render(<DaySectionsBar dayMinutes={14 * 60} />);
    expect(screen.getByText('Morning')).toBeInTheDocument();
    expect(screen.getByText('Midday')).toBeInTheDocument();
    expect(screen.getByText('Evening')).toBeInTheDocument();
    expect(screen.getAllByText('4h 40m')).toHaveLength(3);
  });

  it('puts leftover minutes on Evening', () => {
    render(<DaySectionsBar dayMinutes={10 * 60 + 10} />);
    expect(screen.getAllByText('3h 23m')).toHaveLength(2);
    expect(screen.getByText('3h 24m')).toBeInTheDocument();
  });

  it('shows 5h sections for a 15h day', () => {
    render(<DaySectionsBar dayMinutes={15 * 60} />);
    expect(screen.getAllByText('5h')).toHaveLength(3);
  });
});
