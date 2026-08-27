/**
 * Timelord — constants and seed data.
 */

var TZ = 'America/Chicago';
var MENU_NAME = 'Timelord';
var PERSONAL_COLOR = 'e7d5c5';
var BUFFER_COLOR = '64748b';
var BUSY_COLOR = 'f87171';

var SHEET = {
  SETTINGS: 'Settings',
  PERSONAL: 'Personal',
  ITEMS: 'Items',
  TEMPLATES: 'Templates',
  TASKS: 'Tasks',
  WORK: 'Work',
  PROJECTS: 'Projects',
  FITNESS: 'Fitness',
  BUSY: 'Busy',
  PLAN: 'Plan',
  SUMMARY: 'Summary',
  LOG: 'Log'
};

var PROTECTED_SHEETS = [SHEET.BUSY, SHEET.PLAN, SHEET.SUMMARY];

var BUCKET_ORDER = ['Work', 'Fitness', 'Food', 'House', 'Garden', 'Projects'];

var SLOT_RANK = { morning: 1, midday: 2, evening: 3 };

var DISPLAY_RANK = {
  'Personal|morning': 10,
  House: 20,
  Garden: 30,
  Work: 40,
  Fitness: 50,
  Projects: 60,
  'Personal|midday': 70,
  Food: 80,
  'Personal|evening': 90,
  Busy: 55,
  Buffer: 999
};

var SETTINGS_KEYS = {
  DAY_HOURS: 'Day hours',
  DAYS_PER_WEEK: 'Days per week',
  BUFFER_MINUTES: 'Buffer minutes',
  TIMEZONE: 'Timezone',
  LAST_PACKED: 'Last packed',
  SPREADSHEET_ID: 'Spreadsheet ID',
  PLAN_GID: 'Plan gid',
  SUMMARY_GID: 'Summary gid',
  SETTINGS_GID: 'Settings gid',
  PERSONAL_GID: 'Personal gid',
  WEB_APP_HINT: 'Web App URL (paste into web/config.js)'
};

var ITEM_KIND = {
  RECURRING: 'recurring',
  HOURLY: 'hourly'
};

var SETTINGS_META_LAST_ROW = 16;
var SETTINGS_BUCKET_HEADER_ROW = 18;

var SEED_BUCKETS = [
  { name: 'Work', weight: 1, color: 'f0c14a', slot: 'midday' },
  { name: 'Fitness', weight: 2, color: 'fb923c', slot: 'midday' },
  { name: 'Food', weight: 3, color: 'e85d4c', slot: 'evening' },
  { name: 'House', weight: 4, color: '94a3b8', slot: 'morning' },
  { name: 'Garden', weight: 5, color: '4ade80', slot: 'morning' },
  { name: 'Projects', weight: 6, color: 'a78bfa', slot: 'midday' }
];

var SEED_PERSONAL = [
  ['Morning routine (shower, breakfast)', 1, 'morning', 'daily', true],
  ['Lunch', 0.5, 'midday', 'daily', true],
  ['Dinner with husband', 1, 'evening', 'daily', true]
];

/** Hours stored as decimal; UI shows hours + minutes (0.5 = 30m). */
var SEED_ITEMS = [
  ['Food', 'Cooking', 0.5, 'recurring', 'daily', '', false, true, 'evening'],
  ['Food', 'Groceries', 1.5, 'recurring', 'weekly:Sun', '', false, true, 'morning'],
  ['Food', 'Fermentation / freezer', 2, 'recurring', 'every_3_4_days', '', false, true, 'evening'],
  ['Garden', 'Water & check veggies', 0.25, 'recurring', 'eod', '', false, true, 'morning'],
  ['Garden', 'Weeding / mulching / feeding', 2, 'recurring', 'weekly:Sat', '', false, true, 'morning'],
  ['Garden', 'Mowing', 1.5, 'recurring', 'every_2_months', '', false, true, 'morning'],
  ['House', 'Dishes', 20 / 60, 'recurring', 'daily', '', false, true, 'morning'],
  ['House', 'Kitchen counters', 0.25, 'recurring', 'daily', '', false, true, 'morning'],
  ['House', 'Floors', 0.5, 'recurring', 'weekly:Tue,Fri', '', false, true, 'morning'],
  ['House', 'Laundry', 1, 'recurring', 'weekly:Wed,Sat', '', false, true, 'morning'],
  ['House', 'Bathrooms / bedrooms', 1, 'recurring', 'weekly:Sat', '', false, true, 'morning'],
  ['Projects', 'Learning block', 1, 'recurring', 'weekly:Tue,Thu', '', false, true, 'evening'],
  ['Fitness', 'Strength — lower', 1, 'recurring', 'weekly:Mon', '', false, true, 'midday'],
  ['Fitness', 'Walk / easy cardio', 0.75, 'recurring', 'weekly:Tue,Thu', '', false, true, 'midday'],
  ['Fitness', 'Strength — upper', 1, 'recurring', 'weekly:Wed', '', false, true, 'midday'],
  ['Fitness', 'Strength — full', 1, 'recurring', 'weekly:Fri', '', false, true, 'midday'],
  ['Fitness', 'Longer walk or hike', 1, 'recurring', 'weekly:Sat', '', false, true, 'midday'],
  ['Fitness', 'Rest / mobility', 0.5, 'recurring', 'weekly:Sun', '', false, true, 'midday'],
  ['Work', 'Finish the week’s most important deliverable', 3, 'hourly', 'weekdays', '', true, true, 'midday'],
  ['Work', 'Clear a stuck decision', 3, 'hourly', 'weekdays', '', false, true, 'midday'],
  ['Work', 'Ship a small slice', 3, 'hourly', 'weekdays', '', false, true, 'midday'],
  ['Projects', 'Example project A', 1.5, 'hourly', 'daily', '', true, true, 'midday'],
  ['Projects', 'Example project B', 1, 'hourly', 'daily', '', false, true, 'midday']
];

var HEADERS = {
  PERSONAL: ['Title', 'Hours', 'Slot', 'Days', 'Active'],
  ITEMS: ['Bucket', 'Title', 'Hours', 'Kind', 'Cadence', 'Due', 'Current', 'Active', 'Slot'],
  BUSY: ['Date', 'Start', 'End', 'Title', 'Hours'],
  PLAN: [
    'Id',
    'Date',
    'Bucket',
    'Title',
    'Hours',
    'Slot',
    'Status',
    'Source',
    'Options',
    'Chosen',
    'Color',
    'Sort',
    'Counts week'
  ],
  SUMMARY: ['Kind', 'Date', 'Bucket', 'Title', 'Hours', 'Reason', 'Color'],
  LOG: ['Timestamp', 'Date', 'Id', 'Action', 'Bucket', 'Title', 'Hours']
};

var TAB_COLORS = {
  Settings: '334155',
  Personal: PERSONAL_COLOR,
  Items: '64748b',
  Busy: 'f87171',
  Plan: '1e293b',
  Summary: '1e293b',
  Log: '1e293b'
};
