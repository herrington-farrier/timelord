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

var STEAL_ORDER = ['Projects', 'Garden', 'House', 'Food', 'Fitness', 'Work'];

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
  GROSS: 'Gross weekly hours',
  PERSONAL_WEEKLY: 'Personal weekly hours',
  ASSIGNABLE: 'Assignable weekly hours',
  ALLOCATED: 'Allocated',
  UNALLOCATED: 'Unallocated',
  LAST_PACKED: 'Last packed',
  SPREADSHEET_ID: 'Spreadsheet ID',
  PLAN_GID: 'Plan gid',
  SUMMARY_GID: 'Summary gid',
  SETTINGS_GID: 'Settings gid',
  PERSONAL_GID: 'Personal gid',
  WEB_APP_HINT: 'Web App URL (paste into web/config.js)'
};

var ITEM_MODE = {
  SCHEDULED: 'scheduled',
  ROTATE: 'rotate',
  CURRENT: 'current'
};
var SETTINGS_META_LAST_ROW = 16;
var SETTINGS_BUCKET_HEADER_ROW = 18;

var SEED_BUCKETS = [
  { name: 'Work', weight: 1, color: 'f0c14a', slot: 'midday', weekly: 18, min: 8 },
  { name: 'Fitness', weight: 2, color: 'fb923c', slot: 'midday', weekly: 6, min: 3 },
  { name: 'Food', weight: 3, color: 'e85d4c', slot: 'evening', weekly: 12, min: 7 },
  { name: 'House', weight: 4, color: '94a3b8', slot: 'morning', weekly: 8, min: 5 },
  { name: 'Garden', weight: 5, color: '4ade80', slot: 'morning', weekly: 6, min: 3 },
  { name: 'Projects', weight: 6, color: 'a78bfa', slot: 'midday', weekly: 12, min: 3 }
];

var SEED_PERSONAL = [
  ['Morning routine (shower, breakfast)', 1, 'morning', 'daily', true],
  ['Lunch', 0.5, 'midday', 'daily', true],
  ['Dinner with husband', 1, 'evening', 'daily', true]
];

var SEED_TEMPLATES = [
  ['Food', 'Cooking', 0.5, 'daily', 'evening', '', true, true, 'scheduled'],
  ['Food', 'Groceries', 1.5, 'weekly:Sun', 'morning', '', true, true, 'scheduled'],
  [
    'Food',
    'Fermentation / freezer maintenance',
    2,
    'every_3_4_days',
    'evening',
    'Jun; fermented veggies; stock; granola; condiments; freezer rotation',
    true,
    true,
    'scheduled'
  ],
  ['Garden', 'Water & check veggies', 0.4, 'eod', 'morning', '', true, true, 'scheduled'],
  [
    'Garden',
    'Weeding / mulching / feeding',
    2,
    'weekly:Sat',
    'morning',
    'weeding; mulching; feeding / pruning',
    true,
    true,
    'scheduled'
  ],
  ['Garden', 'Mowing', 1.5, 'every_2_months', 'morning', '', true, true, 'scheduled'],
  ['House', 'Dishes', 0.35, 'daily', 'morning', '', true, true, 'rotate'],
  ['House', 'Kitchen counters', 0.25, 'daily', 'morning', '', true, true, 'rotate'],
  ['House', 'Floors', 0.5, 'weekly:Tue,Fri', 'morning', '', true, true, 'scheduled'],
  ['House', 'Laundry', 1, 'weekly:Wed,Sat', 'morning', '', true, true, 'scheduled'],
  ['House', 'Bathrooms / bedrooms', 1, 'weekly:Sat', 'morning', '', true, true, 'scheduled'],
  ['Projects', 'Learning block', 1, 'weekly:Tue,Thu', 'evening', 'book; course; topic', true, true, 'scheduled']
];

var SEED_PROJECTS = [
  ['Example project A', true, 1.5],
  ['Example project B', true, 1]
];

var SEED_FITNESS = [
  ['Mon', 'Strength — lower', 1],
  ['Tue', 'Walk / easy cardio', 0.75],
  ['Wed', 'Strength — upper', 1],
  ['Thu', 'Walk / easy cardio', 0.75],
  ['Fri', 'Strength — full', 1],
  ['Sat', 'Longer walk or hike', 1],
  ['Sun', 'Rest / mobility', 0.5]
];

var SEED_WORK_HIGHLIGHTS = ['Finish the week’s most important deliverable', 'Clear a stuck decision', 'Ship a small slice'];

var HEADERS = {
  PERSONAL: ['Title', 'Hours', 'Slot', 'Days', 'Active'],
  TEMPLATES: ['Bucket', 'Title', 'Hours', 'Cadence', 'Slot', 'Options', 'Active', 'This week', 'Mode'],
  TASKS: ['Name', 'Hours', 'Due Date', 'Bucket', 'This week', 'Active'],
  WORK: ['Field', 'Value'],
  PROJECTS: ['Name', 'Active', 'Default hours'],
  FITNESS: ['Weekday', 'Session', 'Hours'],
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
  Templates: '64748b',
  Tasks: '64748b',
  Work: 'f0c14a',
  Projects: 'a78bfa',
  Fitness: 'fb923c',
  Busy: 'f87171',
  Plan: '1e293b',
  Summary: '1e293b',
  Log: '1e293b'
};
