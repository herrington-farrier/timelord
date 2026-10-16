import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FirebaseError } from 'firebase/app';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toasts } from '../components/Toasts';
import { clearToasts, getToasts, pushToast, toastFailure } from '../shared/toastBus';

describe('the toast bus', () => {
  beforeEach(() => clearToasts());

  it('shows newest first', () => {
    pushToast('fail', 'one');
    pushToast('fail', 'two');
    expect(getToasts().map((t) => t.message)).toEqual(['two', 'one']);
  });

  it('keeps a failure until it is dismissed', () => {
    vi.useFakeTimers();
    pushToast('fail', 'nope');
    vi.advanceTimersByTime(60_000);
    expect(getToasts()).toHaveLength(1);
    vi.useRealTimers();
  });

  it('lets a success expire on its own', () => {
    vi.useFakeTimers();
    pushToast('ok', 'done');
    vi.advanceTimersByTime(60_000);
    expect(getToasts()).toHaveLength(0);
    vi.useRealTimers();
  });

  it('caps the stack so the page stays usable', () => {
    for (let i = 0; i < 20; i += 1) pushToast('fail', `call${i}`);
    expect(getToasts().length).toBeLessThanOrEqual(8);
  });

  it('does not stack a failure identical to one already on screen', () => {
    pushToast('fail', 'Load Day: offline?');
    pushToast('fail', 'Load Day: offline?');
    expect(getToasts()).toHaveLength(1);
  });

  it('shows the friendly text under the control label, not the raw error', () => {
    toastFailure(new FirebaseError('functions/permission-denied', 'raw server sentence'), 'Save Lists');
    expect(getToasts()[0]).toMatchObject({ kind: 'fail', message: 'Save Lists: invite-only.' });
  });
});

describe('the toast strip', () => {
  beforeEach(() => clearToasts());
  afterEach(() => clearToasts());

  it('renders nothing when there is nothing to say', () => {
    const { container } = render(<Toasts />);
    expect(container).toBeEmptyDOMElement();
  });

  it('dismisses one on tap', async () => {
    pushToast('fail', 'Save Lists: offline?');
    render(<Toasts />);
    await userEvent.click(screen.getByText('Save Lists: offline?'));
    expect(getToasts()).toHaveLength(0);
  });

  it('clears them all', async () => {
    pushToast('fail', 'one');
    pushToast('fail', 'two');
    render(<Toasts />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(getToasts()).toHaveLength(0);
  });
});
