import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WeekBudgetBar } from '../components/WeekBudgetBar';
import { weekBudgetSummary } from '../domain/budget';
import { settings } from './fixtures';

describe('WeekBudgetBar', () => {
  it('shows leftover when assigned hours fit', () => {
    render(<WeekBudgetBar summary={weekBudgetSummary(settings(), 18 * 60)} />);
    expect(screen.getByText('Leftover')).toBeInTheDocument();
  });

  it('shows overage when assigned hours exceed the cap', () => {
    render(<WeekBudgetBar summary={weekBudgetSummary(settings(), 91 * 60 + 30)} />);
    expect(screen.getByText('Over')).toBeInTheDocument();
    expect(screen.getByText('18h')).toBeInTheDocument();
  });
});
