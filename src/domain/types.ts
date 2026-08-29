export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type HoursMode = 'week' | 'day';

export type Slot = 'morning' | 'midday' | 'evening';

export type BucketKind = 'personal' | 'work' | 'weighted' | 'event';

export type ItemType = 'recurring' | 'scheduled';

export type Cadence =
  | { kind: 'daily' }
  | { kind: 'weekdays' }
  | { kind: 'weekends' }
  | { kind: 'weekly'; days: Weekday[] }
  | { kind: 'everyNDays'; n: number; startWeekday: Weekday }
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
  color: string;
  archived?: boolean;
  startDate?: string;
  endDate?: string;
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
};

export type Appointment = {
  id: string;
  title: string;
  date: string;
  durationMinutes: number;
  color?: string;
  startMinutes?: number;
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
