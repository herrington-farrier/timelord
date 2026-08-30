import { addDaysKey } from './cadence';
import { packDay, type PackDayInput, type PackDayResult } from './packDay';

export const PACK_RANGE_DAYS = 42;

export function packRange(
  startDate: string,
  dayCount: number,
  base: Omit<PackDayInput, 'date'>
): { date: string; result: PackDayResult }[] {
  const out: { date: string; result: PackDayResult }[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    const date = addDaysKey(startDate, i);
    out.push({ date, result: packDay({ ...base, date }) });
  }
  return out;
}
