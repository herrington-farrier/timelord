export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type HoursMode = 'week' | 'day';

export type Slot = 'morning' | 'midday' | 'evening';

export type BucketKind = 'personal' | 'work' | 'weighted' | 'event' | 'appointment';

export type ItemType = 'recurring' | 'scheduled';

export type Cadence =
  | { kind: 'daily' }
  | { kind: 'weekdays' }
  | { kind: 'weekends' }
  | { kind: 'weekly'; days: Weekday[] }
  | { kind: 'everyNDays'; n: number; startWeekday: Weekday; startDate?: string }
  | { kind: 'monthly'; dayOfMonth: number };

export type DaySettings = {
  dayMinutes: number;
  dayStartMinutes: number;
  transitionMinutes: number;
  timezone: string;
  morningMinutes: number;
  breakMinutes: number;
  eveningMinutes: number;
  timerSound?: boolean;
  timerVibrate?: boolean;
  /**
   * When true, Personal time is part of the day rather than a pause beside it:
   * the routines and Break take real minutes out of their sections and off the
   * assignable week, and the routines become items you complete or skip.
   */
  personalCountsAsDay?: boolean;
};

export type Bucket = {
  id: string;
  kind: BucketKind;
  name: string;
  weight: number;
  weeklyMinutes: number;
  hoursMode?: HoursMode;
  hoursMinutes?: number;
  days: Weekday[];
  slot: Slot;
  slots?: Slot[];
  color: string;
  archived?: boolean;
  startDate?: string;
  endDate?: string;
  ranges?: EventRange[];
};

export type EventRange = {
  id: string;
  /** What the event is called. Items hang off this rather than off raw dates. */
  name?: string;
  startDate: string;
  endDate: string;
};

export type ListItem = {
  id: string;
  bucketId: string;
  title: string;
  type: ItemType;
  weight: number;
  durationMinutes: number;
  cadence: Cadence;
  dueAt?: string;
  archived?: boolean;
  slot?: Slot;
  /** Events items only: the EventRange this belongs to. */
  eventId?: string;
  /**
   * Appointments only: the sections it spans. The first is where its time is
   * taken from; any overflow spills forward as usual. Declared, never inferred
   * from apptTime.
   */
  slots?: Slot[];
  /**
   * Appointments only. A label such as "2:30pm", shown on the card and the
   * Quest Log chip. DISPLAY ONLY — the packer never reads it. The section an
   * appointment lands in is its `slot`, picked by hand like any other item.
   */
  apptTime?: string;
};

export type BlockKind = 'personal' | 'work' | 'weighted' | 'appointment' | 'event' | 'transition';

export type BlockStatus = 'pending' | 'complete' | 'skipped' | 'dropped';

export type PackedBlock = {
  id: string;
  date: string;
  bucketId: string;
  itemId?: string;
  appointmentId?: string;
  title: string;
  kind: BlockKind;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  status: BlockStatus;
  color: string;
  flexible: boolean;
  slot?: Slot;
  /** Appointments only: every section this spans, so a long one stays on the
   *  list while you are still in it. `slot` is the first of these. */
  slots?: Slot[];
  /** Appointments only, display only — see ListItem.apptTime. */
  apptTime?: string;
};

export type SkipPush = {
  itemId: string;
  toDate: string;
};

export type PreviousBlock = {
  itemId?: string;
  appointmentId?: string;
  status: BlockStatus;
  startMinutes?: number;
  endMinutes?: number;
};

export const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const PERSONAL_ID = 'personal';
export const WORK_ID = 'work';
export const EVENTS_ID = 'events';
export const APPOINTMENTS_ID = 'appointments';
export const SLOTS: Slot[] = ['morning', 'midday', 'evening'];

export const DEFAULT_SETTINGS: DaySettings = {
  dayMinutes: 14 * 60,
  dayStartMinutes: 7 * 60,
  transitionMinutes: 10,
  timezone: 'America/Chicago',
  morningMinutes: 60,
  breakMinutes: 30,
  eveningMinutes: 120,
  timerSound: true,
  timerVibrate: false,
};
