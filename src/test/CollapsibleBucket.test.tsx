import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { CollapsibleBucket } from '../components/CollapsibleBucket';
import { formatHoursField } from '../domain/budget';
import { hoursToMinutes } from '../domain/duration';

describe('CollapsibleBucket', () => {
  it('shows weekly hours on the collapsed row', () => {
    render(
      <CollapsibleBucket title="House" hours="8h/wk" color="94a3b8">
        <label>
          Name
          <input name="name" defaultValue="House" />
        </label>
      </CollapsibleBucket>
    );
    expect(screen.getByRole('button', { name: 'House, 8h/wk' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('8h/wk')).toBeVisible();
    expect(screen.getByLabelText('Name')).not.toBeVisible();
  });

  it('reveals fields when expanded', async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleBucket title="House" hours="8h/wk" color="94a3b8">
        <label>
          Name
          <input name="name" defaultValue="House" />
        </label>
      </CollapsibleBucket>
    );
    await user.click(screen.getByRole('button', { name: 'House, 8h/wk' }));
    expect(screen.getByRole('button', { name: 'House, 8h/wk' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Name')).toBeVisible();
  });

  it('updates collapsed hours as the hours field and week/day toggle change', async () => {
    const user = userEvent.setup();
    function hoursFrom(root: HTMLElement) {
      const form = root.querySelector('form');
      if (!(form instanceof HTMLFormElement)) return '8h/wk';
      const mode = form.querySelector('input[name="hoursMode"]:checked');
      const h = form.querySelector('input[name="wH"]');
      const m = form.querySelector('input[name="wM"]');
      return formatHoursField(
        mode instanceof HTMLInputElement && mode.value === 'day' ? 'day' : 'week',
        hoursToMinutes(
          h instanceof HTMLInputElement ? h.value : 0,
          m instanceof HTMLInputElement ? m.value : 0
        )
      );
    }
    render(
      <CollapsibleBucket title="House" hours="8h/wk" color="94a3b8" defaultOpen liveHours={hoursFrom}>
        <form>
          <input name="wH" aria-label="Hours hours" defaultValue={8} />
          <input name="wM" aria-label="Hours minutes" defaultValue={0} />
          <label>
            <input name="hoursMode" type="radio" value="week" defaultChecked />
            Week
          </label>
          <label>
            <input name="hoursMode" type="radio" value="day" />
            Day
          </label>
        </form>
      </CollapsibleBucket>
    );
    await user.clear(screen.getByLabelText('Hours hours'));
    await user.type(screen.getByLabelText('Hours hours'), '5');
    expect(screen.getByRole('button', { name: 'House, 5h/wk' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Day' }));
    expect(screen.getByRole('button', { name: 'House, 5h/day' })).toBeInTheDocument();
  });
});
