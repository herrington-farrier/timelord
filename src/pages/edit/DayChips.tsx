import type { Weekday } from '../../domain/types';

// The board, packing and weekStart all run Sunday-first; the picker follows.
const DAY_PICKER_ORDER: Weekday[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DayChips({
  name,
  isOn,
  isOpen,
}: {
  name: string;
  isOn: (d: Weekday) => boolean;
  isOpen?: (d: Weekday) => boolean;
}) {
  return (
    <div className="day-chips" role="group" aria-label="Days">
      {DAY_PICKER_ORDER.map((d) => {
        const open = isOpen ? isOpen(d) : true;
        return (
          <label key={d}>
            <input name={name} type="checkbox" value={d} aria-label={d} disabled={!open} defaultChecked={open && isOn(d)} />
            <span aria-hidden="true">{d[0]}</span>
          </label>
        );
      })}
    </div>
  );
}
