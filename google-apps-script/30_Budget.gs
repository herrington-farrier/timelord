/**
 * Timelord — weekly budget, marked hours, steal-from-lower-buckets.
 */

function personalWeeklyHours_() {
  var map = readSettingsMap_();
  var daysPerWeek = getSettingNum_(map, SETTINGS_KEYS.DAYS_PER_WEEK, 7);
  var rows = dataRows_(sheet_(SHEET.PERSONAL), 5);
  var total = 0;
  var i;
  for (i = 0; i < rows.length; i++) {
    if (!String(rows[i][0] || '').trim() || !toBool_(rows[i][4] !== '' ? rows[i][4] : true)) {
      continue;
    }
    var hours = toHours_(rows[i][1]);
    var cadence = String(rows[i][3] || 'daily').trim() || 'daily';
    total += hours * cadenceDaysPerWeek_(cadence, daysPerWeek);
  }
  return roundHours_(total);
}

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
  if (cl === 'daily') {
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
  var dayHours = getSettingNum_(map, SETTINGS_KEYS.DAY_HOURS, 12);
  var daysPerWeek = getSettingNum_(map, SETTINGS_KEYS.DAYS_PER_WEEK, 7);
  var gross = roundHours_(dayHours * daysPerWeek);
  var personal = personalWeeklyHours_();
  var assignable = roundHours_(Math.max(0, gross - personal));
  var buckets = readBuckets_();
  var weekStart = weekStartKey_(todayKey_());
  var weekEnd = weekEndKey_(weekStart);
  var used = usedHoursForWeek_(weekStart, weekEnd);
  var allocated = 0;
  var i;
  var sh = sheet_(SHEET.SETTINGS);
  for (i = 0; i < buckets.length; i++) {
    allocated += buckets[i].weekly;
    var u = used[buckets[i].name] || 0;
    var remaining = roundHours_(buckets[i].weekly - u);
    sh.getRange(buckets[i].row, 5).setValue(roundHours_(buckets[i].weekly / daysPerWeek));
    sh.getRange(buckets[i].row, 8, 1, 2).setValues([[roundHours_(u), remaining]]);
  }
  allocated = roundHours_(allocated);
  var unallocated = roundHours_(assignable - allocated);
  setSetting_(SETTINGS_KEYS.GROSS, gross);
  setSetting_(SETTINGS_KEYS.PERSONAL_WEEKLY, personal);
  setSetting_(SETTINGS_KEYS.ASSIGNABLE, assignable);
  setSetting_(SETTINGS_KEYS.ALLOCATED, allocated);
  setSetting_(SETTINGS_KEYS.UNALLOCATED, unallocated);
  return {
    dayHours: dayHours,
    daysPerWeek: daysPerWeek,
    bufferMinutes: getSettingNum_(map, SETTINGS_KEYS.BUFFER_MINUTES, 15),
    timezone: String(map[SETTINGS_KEYS.TIMEZONE] || TZ),
    gross: gross,
    personal: personal,
    assignable: assignable,
    allocated: allocated,
    unallocated: unallocated,
    buckets: readBuckets_()
  };
}

function markedDemandForWeek_(weekStart, weekEnd) {
  var demand = {};
  var i;
  for (i = 0; i < BUCKET_ORDER.length; i++) {
    demand[BUCKET_ORDER[i]] = 0;
  }
  var days = keysInRange_(weekStart, weekEnd);
  var templates = readTemplates_();
  var t;
  var d;
  for (t = 0; t < templates.length; t++) {
    var tpl = templates[t];
    if (!tpl.active || !tpl.thisWeek) {
      continue;
    }
    for (d = 0; d < days.length; d++) {
      if (cadenceHitsDate_(tpl.cadence, days[d])) {
        demand[tpl.bucket] = (demand[tpl.bucket] || 0) + tpl.hours;
      }
    }
  }
  var tasks = readTasks_();
  for (t = 0; t < tasks.length; t++) {
    var task = tasks[t];
    if (!task.active || !task.thisWeek || !task.due) {
      continue;
    }
    if (task.due >= weekStart && task.due <= weekEnd) {
      demand[task.bucket] = (demand[task.bucket] || 0) + task.hours;
    }
  }
  var work = readWork_();
  var fitness = readFitness_();
  var projects = readProjects_();
  for (d = 0; d < days.length; d++) {
    var key = days[d];
    if (work.dailyHours > 0) {
      demand.Work = (demand.Work || 0) + work.dailyHours;
    }
    var sess = fitnessSessionForDay_(fitness, key);
    if (sess) {
      demand.Fitness = (demand.Fitness || 0) + sess.hours;
    }
    var proj = firstActiveProject_(projects);
    if (proj) {
      demand.Projects = (demand.Projects || 0) + proj.hours;
    }
  }
  return demand;
}

function usedHoursForWeek_(weekStart, weekEnd) {
  var used = {};
  var i;
  for (i = 0; i < BUCKET_ORDER.length; i++) {
    used[BUCKET_ORDER[i]] = 0;
  }
  var plan = readPlanRows_();
  for (i = 0; i < plan.length; i++) {
    var row = plan[i];
    if (row.date < weekStart || row.date > weekEnd) {
      continue;
    }
    if (row.status === 'skipped') {
      continue;
    }
    if (!row.countsWeek) {
      continue;
    }
    if (used[row.bucket] == null) {
      used[row.bucket] = 0;
    }
    used[row.bucket] += row.hours;
  }
  return used;
}

function unallocatedHours_() {
  var nums = refreshBudgetNumbers_();
  return nums.unallocated;
}

/**
 * Increase or decrease a bucket's weekly hours.
 * Decrease → Unallocated. Increase → Unallocated first, then steal from lower-priority buckets down to minima.
 */
function setWeeklyHours(bucketName, newHours) {
  var name = String(bucketName || '').trim();
  var target = roundHours_(Math.max(0, Number(newHours)));
  if (isNaN(target)) {
    throw new Error('Hours must be a number.');
  }
  var buckets = readBuckets_();
  var current = null;
  var i;
  for (i = 0; i < buckets.length; i++) {
    if (buckets[i].name === name) {
      current = buckets[i];
    }
  }
  if (!current) {
    throw new Error('Unknown bucket: ' + name);
  }
  if (target < current.min) {
    target = current.min;
  }
  var delta = roundHours_(target - current.weekly);
  if (delta === 0) {
    refreshBudgetNumbers_();
    return getSettingsView();
  }
  if (delta < 0) {
    writeBucketHours_(name, target);
    refreshBudgetNumbers_();
    return getSettingsView();
  }
  var obtained = 0;
  var nums = refreshBudgetNumbers_();
  var fromUnalloc = Math.min(delta, Math.max(0, nums.unallocated));
  obtained += fromUnalloc;
  var still = roundHours_(delta - obtained);
  if (still > 0) {
    var start = STEAL_ORDER.indexOf(name);
    var donors = STEAL_ORDER.slice(start + 1);
    var bmap = {};
    for (i = 0; i < buckets.length; i++) {
      bmap[buckets[i].name] = buckets[i];
    }
    var d;
    for (d = 0; d < donors.length && still > 0; d++) {
      var donor = bmap[donors[d]];
      if (!donor) {
        continue;
      }
      var stealable = roundHours_(donor.weekly - donor.min);
      if (stealable <= 0) {
        continue;
      }
      var take = Math.min(stealable, still);
      writeBucketHours_(donor.name, roundHours_(donor.weekly - take));
      donor.weekly = roundHours_(donor.weekly - take);
      still = roundHours_(still - take);
      obtained = roundHours_(obtained + take);
    }
  }
  var applied = roundHours_(current.weekly + obtained);
  writeBucketHours_(name, applied);
  refreshBudgetNumbers_();
  var view = getSettingsView();
  view.capped = applied < target;
  view.requested = target;
  view.applied = applied;
  return view;
}

function bumpWeeklyHours(bucketName, delta) {
  var buckets = readBuckets_();
  var i;
  for (i = 0; i < buckets.length; i++) {
    if (buckets[i].name === bucketName) {
      return setWeeklyHours(bucketName, buckets[i].weekly + Number(delta));
    }
  }
  throw new Error('Unknown bucket: ' + bucketName);
}

function setDailyHours(bucketName, dailyHours) {
  var days = daysPerWeek_();
  return setWeeklyHours(bucketName, Number(dailyHours) * days);
}

function bumpDailyHours(bucketName, delta) {
  var buckets = readBuckets_();
  var i;
  for (i = 0; i < buckets.length; i++) {
    if (buckets[i].name === bucketName) {
      return setDailyHours(bucketName, buckets[i].daily + Number(delta));
    }
  }
  throw new Error('Unknown bucket: ' + bucketName);
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
  refreshBudgetNumbers_();
  return getSettingsView();
}

function setDaysPerWeek(days) {
  var n = Math.max(1, Math.min(7, Math.round(Number(days))));
  if (isNaN(n)) {
    throw new Error('Days per week must be a number.');
  }
  setSetting_(SETTINGS_KEYS.DAYS_PER_WEEK, n);
  refreshBudgetNumbers_();
  return getSettingsView();
}

function setBufferMinutes(mins) {
  var n = Math.max(0, Math.round(Number(mins)));
  if (isNaN(n)) {
    throw new Error('Buffer minutes must be a number.');
  }
  setSetting_(SETTINGS_KEYS.BUFFER_MINUTES, n);
  refreshBudgetNumbers_();
  return getSettingsView();
}

function setBucketColor(name, color) {
  var b = findBucket_(name);
  var hex = hexColor_(color);
  var sh = sheet_(SHEET.SETTINGS);
  sh.getRange(b.row, 3).setValue(hex);
  try {
    sh.getRange(b.row, 1, 1, 9).setBackground('#' + hex).setFontColor('#111827');
  } catch (ignore) {}
  return getSettingsView();
}

function setBucketMin(name, minHours) {
  var b = findBucket_(name);
  var min = roundHours_(Math.max(0, Number(minHours)));
  if (isNaN(min)) {
    throw new Error('Minimum must be a number.');
  }
  sheet_(SHEET.SETTINGS).getRange(b.row, 7).setValue(min);
  if (b.weekly < min) {
    return setWeeklyHours(name, min);
  }
  refreshBudgetNumbers_();
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

function saveBucket(name, color, slot, minHours, dailyHours) {
  if (color) {
    setBucketColor(name, color);
  }
  if (slot) {
    setBucketSlot(name, slot);
  }
  if (minHours != null && minHours !== '') {
    setBucketMin(name, minHours);
  }
  if (dailyHours != null && dailyHours !== '') {
    return setDailyHours(name, dailyHours);
  }
  refreshBudgetNumbers_();
  return getSettingsView();
}

function getSettingsView() {
  var nums = refreshBudgetNumbers_();
  return {
    dayHours: nums.dayHours,
    daysPerWeek: nums.daysPerWeek,
    bufferMinutes: nums.bufferMinutes,
    timezone: nums.timezone,
    gross: nums.gross,
    personal: nums.personal,
    assignable: nums.assignable,
    allocated: nums.allocated,
    unallocated: nums.unallocated,
    lastPacked: String(readSettingsMap_()[SETTINGS_KEYS.LAST_PACKED] || ''),
    chosen: getChosenMap_(),
    spreadsheetId: String(readSettingsMap_()[SETTINGS_KEYS.SPREADSHEET_ID] || ''),
    planGid: String(readSettingsMap_()[SETTINGS_KEYS.PLAN_GID] || ''),
    summaryGid: String(readSettingsMap_()[SETTINGS_KEYS.SUMMARY_GID] || ''),
    settingsGid: String(readSettingsMap_()[SETTINGS_KEYS.SETTINGS_GID] || ''),
    buckets: nums.buckets
  };
}
