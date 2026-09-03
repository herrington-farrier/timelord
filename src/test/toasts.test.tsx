import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toasts } from '../components/Toasts';
import { clearToasts, describeError, getToasts, pushToast, toastsAsText } from '../shared/toastBus';

describe('the debug toast bus', () => {
  beforeEach(() => clearToasts());

  it('shows newest first', () => {
    pushToast('fail', 'saveBuckets', 'nope');
    pushToast('fail', 'saveItems', 'nope');
    expect(getToasts().map((t) => t.label)).toEqual(['saveItems', 'saveBuckets']);
  });

  it('keeps a failure until it is dismissed', () => {
    vi.useFakeTimers();
    pushToast('fail', 'saveBuckets', 'nope');
    vi.advanceTimersByTime(60_000);
    expect(getToasts()).toHaveLength(1);
    vi.useRealTimers();
  });

  it('lets a success expire on its own', () => {
    vi.useFakeTimers();
    pushToast('ok', 'saveBuckets');
    vi.advanceTimersByTime(60_000);
    expect(getToasts()).toHaveLength(0);
    vi.useRealTimers();
  });

  it('caps the stack so the page stays usable', () => {
    for (let i = 0; i < 20; i += 1) pushToast('fail', `call${i}`);
    expect(getToasts().length).toBeLessThanOrEqual(8);
  });

  it('reports the raw code and message, not the friendly one', () => {
    const err = Object.assign(new Error('This app is invite-only.'), {
      code: 'functions/permission-denied',
    });
    expect(describeError(err)).toContain('functions/permission-denied');
    expect(describeError(err)).toContain('This app is invite-only.');
  });

  it('keeps the row and field a callable named', () => {
    const err = Object.assign(new Error('Pick a section.'), {
      code: 'functions/invalid-argument',
      details: { itemId: 'tidy', field: 'slots' },
    });
    expect(describeError(err)).toContain('tidy');
  });

  it('survives details that will not serialise', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const err = Object.assign(new Error('boom'), { code: 'internal', details: circular });
    expect(describeError(err)).toContain('boom');
  });

  it('writes one liftable line per toast', () => {
    pushToast('fail', 'saveBuckets', 'functions/permission-denied · nope', 42);
    const text = toastsAsText();
    expect(text).toContain('FAIL saveBuckets');
    expect(text).toContain('42ms');
  });
});

describe('the toast strip', () => {
  beforeEach(() => clearToasts());
  afterEach(() => clearToasts());

  it('renders nothing when there is nothing to say', () => {
    const { container } = render(<Toasts />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the callable that failed and shows its raw error', () => {
    pushToast('fail', 'saveBuckets', 'functions/permission-denied · This app is invite-only.');
    render(<Toasts />);
    expect(screen.getByText('saveBuckets')).toBeInTheDocument();
    expect(screen.getByText(/permission-denied/)).toBeInTheDocument();
  });

  it('dismisses one on tap', async () => {
    pushToast('fail', 'saveBuckets', 'nope');
    render(<Toasts />);
    await userEvent.click(screen.getByText('saveBuckets'));
    expect(getToasts()).toHaveLength(0);
  });

  it('clears them all', async () => {
    pushToast('fail', 'saveBuckets', 'nope');
    pushToast('fail', 'saveItems', 'nope');
    render(<Toasts />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(getToasts()).toHaveLength(0);
  });
});
