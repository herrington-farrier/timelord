/**
 * Timelord — day length, cadence, bucket colors.
 */

function cadenceDaysPerWeek_(cadence, daysPerWeek) {
  var c = String(cadence || 'daily').trim().toLowerCase();
  if (c === 'daily') {
    return daysPerWeek;
  }
  if (c === 'weekdays') {
    return Math.min(5, daysPerWeek);
  }
  if (c === 'weekends') {
    return Math.min(2, daysPerWeek);
  }
  if (c === 'eod') {
    return daysPerWeek / 2;
  }
  if (c === 'every_3_4_days') {
    return 2;
  }
  if (c === 'every_2_months') {
    return 7 / 60;
  }
  if (c.indexOf('weekly:') === 0) {
    return parseWeeklyDays_(c).length;
  }
  return 1;
}

function parseWeeklyDays_(cadence) {
  var part = String(cadence).replace(/^weekly:/i, '');
  return part
    .split(/[,/;\s]+/)
    .map(function (s) {
      var t = s.trim();
      if (!t) {
        return '';
      }
      return t.charAt(0).toUpperCase() + t.slice(1, 3).toLowerCase();
    })
    .filter(Boolean);
}

function cadenceHitsDate_(cadence, dateKey) {
  var c = String(cadence || 'daily').trim();
  var cl = c.toLowerCase();
  var wd = weekdayName_(dateKey);
  if (!c || cl === 'daily') {
    return true;
  }
  if (cl === 'weekdays') {
    return wd !== 'Sat' && wd !== 'Sun';
  }
  if (cl === 'weekends') {
    return wd === 'Sat' || wd === 'Sun';
  }
  if (cl === 'eod') {
    var p = parseYmd_(dateKey);
    var epoch = ymdToDate_(2026, 1, 1);
    var dt = ymdToDate_(p.y, p.mo, p.d);
    var diff = Math.round((dt.getTime() - epoch.getTime()) / 86400000);
    return diff % 2 === 0;
  }
  if (cl === 'every_3_4_days') {
    return wd === 'Tue' || wd === 'Fri';
  }
  if (cl === 'every_2_months') {
    var p2 = parseYmd_(dateKey);
    return p2.mo % 2 === 0 && p2.d === 1;
  }
  if (cl.indexOf('weekly:') === 0) {
    var days = parseWeeklyDays_(c);
    return days.indexOf(wd) !== -1;
  }
  return false;
}

function refreshBudgetNumbers_() {
  var map = readSettingsMap_();
  return {
    dayHours: getSettingNum_(map, SETTINGS_KEYS.DAY_HOURS, 12),
    daysPerWeek: getSettingNum_(map, SETTINGS_KEYS.DAYS_PER_WEEK, 7),
    bufferMinutes: getSettingNum_(map, SETTINGS_KEYS.BUFFER_MINUTES, 15),
    timezone: String(map[SETTINGS_KEYS.TIMEZONE] || TZ),
    buckets: readBuckets_()
  };
}

function findBucket_(name) {
  var want = String(name || '').trim();
  var buckets = readBuckets_();
  var i;
  for (i = 0; i < buckets.length; i++) {
    if (buckets[i].name === want) {
      return buckets[i];
    }
  }
  throw new Error('Unknown bucket: ' + want);
}

function setDayHours(hours) {
  var n = roundHours_(Math.max(1, Number(hours)));
  if (isNaN(n)) {
    throw new Error('Day hours must be a number.');
  }
  setSetting_(SETTINGS_KEYS.DAY_HOURS, n);
  return getSettingsView();
}

function setDaysPerWeek(days) {
  var n = Math.max(1, Math.min(7, Math.round(Number(days))));
  if (isNaN(n)) {
    throw new Error('Days per week must be a number.');
  }
  setSetting_(SETTINGS_KEYS.DAYS_PER_WEEK, n);
  return getSettingsView();
}

function setBufferMinutes(mins) {
  var n = Math.max(0, Math.round(Number(mins)));
  if (isNaN(n)) {
    throw new Error('Buffer minutes must be a number.');
  }
  setSetting_(SETTINGS_KEYS.BUFFER_MINUTES, n);
  return getSettingsView();
}

function setBucketColor(name, color) {
  var b = findBucket_(name);
  var hex = hexColor_(color);
  var sh = sheet_(SHEET.SETTINGS);
  sh.getRange(b.row, 3).setValue(hex);
  try {
    sh.getRange(b.row, 1, 1, 4).setBackground('#' + hex).setFontColor('#111827');
  } catch (ignore) {}
  return getSettingsView();
}

function setBucketSlot(name, slot) {
  var b = findBucket_(name);
  var s = String(slot || 'midday').trim().toLowerCase();
  if (s !== 'morning' && s !== 'midday' && s !== 'evening') {
    s = 'midday';
  }
  sheet_(SHEET.SETTINGS).getRange(b.row, 4).setValue(s);
  return getSettingsView();
}

function saveDaySettings(hours, days, minutes) {
  if (hours != null && hours !== '') {
    setDayHours(hours);
  }
  if (days != null && days !== '') {
    setDaysPerWeek(days);
  }
  if (minutes != null && minutes !== '') {
    setBufferMinutes(minutes);
  }
  return getSettingsView();
}

function getSettingsView() {
  var nums = refreshBudgetNumbers_();
  return {
    dayHours: nums.dayHours,
    daysPerWeek: nums.daysPerWeek,
    bufferMinutes: nums.bufferMinutes,
    timezone: nums.timezone,
    lastPacked: String(readSettingsMap_()[SETTINGS_KEYS.LAST_PACKED] || ''),
    spreadsheetId: String(readSettingsMap_()[SETTINGS_KEYS.SPREADSHEET_ID] || ''),
    planGid: String(readSettingsMap_()[SETTINGS_KEYS.PLAN_GID] || ''),
    summaryGid: String(readSettingsMap_()[SETTINGS_KEYS.SUMMARY_GID] || ''),
    settingsGid: String(readSettingsMap_()[SETTINGS_KEYS.SETTINGS_GID] || ''),
    buckets: nums.buckets
  };
}
