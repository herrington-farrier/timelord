import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DaySectionsBar } from '../components/DaySectionsBar';

describe('DaySectionsBar', () => {
  it('shows whole hours for a 14h day, the spare hour going later', () => {
    render(<DaySectionsBar dayMinutes={14 * 60} />);
    expect(screen.getByText('Morning')).toBeInTheDocument();
    expect(screen.getByText('Midday')).toBeInTheDocument();
    expect(screen.getByText('Evening')).toBeInTheDocument();
    expect(screen.getByText('4h')).toBeInTheDocument();
    expect(screen.getAllByText('5h')).toHaveLength(2);
  });

  it('puts the odd minutes of a part-hour day on Evening', () => {
    render(<DaySectionsBar dayMinutes={10 * 60 + 10} />);
    expect(screen.getAllByText('3h')).toHaveLength(2);
    expect(screen.getByText('4h 10m')).toBeInTheDocument();
  });

  it('shows 5h sections for a 15h day', () => {
    render(<DaySectionsBar dayMinutes={15 * 60} />);
    expect(screen.getAllByText('5h')).toHaveLength(3);
  });
});
