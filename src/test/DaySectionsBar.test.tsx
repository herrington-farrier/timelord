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
});
