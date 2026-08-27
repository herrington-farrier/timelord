/**
 * Timelord — one-time sheet setup.
 */

function setupSheet() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    MENU_NAME,
    'Create all Timelord tabs, colors, and seed data on this spreadsheet?\n\nExisting values on Settings / Personal / Templates are kept if those tabs already have rows.',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp !== ui.Button.OK) {
    return;
  }
  runSetup_(false);
  toast_('Setup complete. Copy Plan/Summary/Settings gids into web/config.js.', 8);
}

function runSetup_(quiet) {
  var ss = ss_();
  setupSettings_(ss);
  setupPersonal_(ss);
  setupTemplates_(ss);
  setupTasks_(ss);
  setupWork_(ss);
  setupProjects_(ss);
  setupFitness_(ss);
  setupBusy_(ss);
  setupPlan_(ss);
  setupSummary_(ss);
  setupLog_(ss);
  writeGidsToSettings_();
  refreshBudgetNumbers_();
  if (!quiet) {
    try {
      packRange_(todayKey_(), addDaysKey_(todayKey_(), 20), false);
    } catch (err) {
      toast_('Packed skipped: ' + err, 8);
    }
  }
}

function setupSettings_(ss) {
  var sh = ensureSheet_(SHEET.SETTINGS);
  sh.setName(SHEET.SETTINGS);
  setTabColor_(sh, TAB_COLORS.Settings);
  var already = String(sh.getRange(2, 1).getValue() || '').trim() === SETTINGS_KEYS.DAY_HOURS;
  if (already) {
    sh.getRange(2, 2).setValue(sh.getRange(2, 2).getValue() || 12);
    ensureSettingsBucketLayout_();
    return;
  }
  trimSheet_(sh, 40, 9);
  sh.clear();
  var meta = [
    [SETTINGS_KEYS.DAY_HOURS, 12],
    [SETTINGS_KEYS.DAYS_PER_WEEK, 7],
    [SETTINGS_KEYS.BUFFER_MINUTES, 15],
    [SETTINGS_KEYS.TIMEZONE, TZ],
    [SETTINGS_KEYS.GROSS, 84],
    [SETTINGS_KEYS.PERSONAL_WEEKLY, 17.5],
    [SETTINGS_KEYS.ASSIGNABLE, 66.5],
    [SETTINGS_KEYS.ALLOCATED, 62],
    [SETTINGS_KEYS.UNALLOCATED, 4.5],
    [SETTINGS_KEYS.LAST_PACKED, ''],
    [SETTINGS_KEYS.SPREADSHEET_ID, ss.getId()],
    [SETTINGS_KEYS.PLAN_GID, ''],
    [SETTINGS_KEYS.SUMMARY_GID, ''],
    [SETTINGS_KEYS.SETTINGS_GID, ''],
    [SETTINGS_KEYS.PERSONAL_GID, ''],
    [SETTINGS_KEYS.WEB_APP_HINT, '']
  ];
  sh.getRange(1, 1, 1, 2).setValues([['Setting', 'Value']]);
  sh.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#1e293b').setFontColor('#f8fafc');
  sh.getRange(2, 1, meta.length, 2).setValues(meta);
  sh.getRange(2, 1, meta.length, 1).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 260);
  sh.setColumnWidth(2, 220);
  sh.getRange(2, 2, 3, 1).setNumberFormat('0.##');

  sh.getRange(SETTINGS_BUCKET_HEADER_ROW, 1, 1, 9).setValues([
    ['Name', 'Weight', 'Color', 'Slot', 'Daily hours', 'Weekly hours', 'Minimum', 'Marked', 'Remaining']
  ]);
  sh.getRange(SETTINGS_BUCKET_HEADER_ROW, 1, 1, 9)
    .setFontWeight('bold')
    .setBackground('#1e293b')
    .setFontColor('#f8fafc');
  var i;
  var start = SETTINGS_BUCKET_HEADER_ROW + 1;
  var days = 7;
  for (i = 0; i < SEED_BUCKETS.length; i++) {
    var b = SEED_BUCKETS[i];
    var row = start + i;
    var daily = roundHours_(b.weekly / days);
    sh.getRange(row, 1, 1, 9).setValues([
      [b.name, b.weight, b.color, b.slot, daily, b.weekly, b.min, 0, b.weekly]
    ]);
    sh.getRange(row, 1, 1, 9).setBackground('#' + b.color).setFontColor('#111827');
  }
  sh.getRange(start, 5, SEED_BUCKETS.length, 3).setNumberFormat('0.##');
  sh.setColumnWidth(3, 90);
  sh.setColumnWidth(4, 100);
  sh.setColumnWidth(5, 110);
  sh.setColumnWidth(6, 120);
  sh.setColumnWidth(7, 90);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['morning', 'midday', 'evening'], true)
    .build();
  sh.getRange(start, 4, SEED_BUCKETS.length, 1).setDataValidation(rule);
}

function setupPersonal_(ss) {
  var sh = ensureSheet_(SHEET.PERSONAL);
  setTabColor_(sh, PERSONAL_COLOR);
  var seeded = sh.getLastRow() >= 2 && String(sh.getRange(2, 1).getValue()).trim() !== '';
  trimSheet_(sh, 40, 5);
  writeHeader_(sh, HEADERS.PERSONAL);
  if (!seeded) {
    sh.getRange(2, 1, SEED_PERSONAL.length, 5).setValues(SEED_PERSONAL);
  }
  checkboxCol_(sh, 5, 2, 40);
  sh.getRange(2, 2, 39, 1).setNumberFormat('0.##');
  var slotRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['morning', 'midday', 'evening'], true)
    .build();
  sh.getRange(2, 3, 39, 1).setDataValidation(slotRule);
  sh.setColumnWidth(1, 280);
  sh.setColumnWidth(4, 140);
  sh.getRange(2, 1, 39, 5).setBackground('#f6efe8');
}

function setupTemplates_(ss) {
  var sh = ensureSheet_(SHEET.TEMPLATES);
  setTabColor_(sh, TAB_COLORS.Templates);
  var seeded = sh.getLastRow() >= 2 && String(sh.getRange(2, 1).getValue()).trim() !== '';
  trimSheet_(sh, 80, 8);
  writeHeader_(sh, HEADERS.TEMPLATES);
  if (!seeded) {
    sh.getRange(2, 1, SEED_TEMPLATES.length, 8).setValues(SEED_TEMPLATES);
  }
  checkboxCol_(sh, 7, 2, 80);
  checkboxCol_(sh, 8, 2, 80);
  sh.getRange(2, 3, 79, 1).setNumberFormat('0.##');
  var bucketRule = SpreadsheetApp.newDataValidation().requireValueInList(BUCKET_ORDER, true).build();
  sh.getRange(2, 1, 79, 1).setDataValidation(bucketRule);
  var slotRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['morning', 'midday', 'evening'], true)
    .build();
  sh.getRange(2, 5, 79, 1).setDataValidation(slotRule);
  sh.setColumnWidth(1, 110);
  sh.setColumnWidth(2, 280);
  sh.setColumnWidth(4, 150);
  sh.setColumnWidth(6, 280);
}

function setupTasks_(ss) {
  var sh = ensureSheet_(SHEET.TASKS);
  setTabColor_(sh, TAB_COLORS.Tasks);
  trimSheet_(sh, 80, 6);
  writeHeader_(sh, HEADERS.TASKS);
  checkboxCol_(sh, 5, 2, 80);
  checkboxCol_(sh, 6, 2, 80);
  sh.getRange(2, 3, 79, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(2, 2, 79, 1).setNumberFormat('0.##');
  var bucketRule = SpreadsheetApp.newDataValidation().requireValueInList(BUCKET_ORDER, true).build();
  sh.getRange(2, 4, 79, 1).setDataValidation(bucketRule);
  sh.setColumnWidth(1, 260);
}

function setupWork_(ss) {
  var sh = ensureSheet_(SHEET.WORK);
  setTabColor_(sh, 'f0c14a');
  var seeded = sh.getLastRow() >= 2 && String(sh.getRange(2, 1).getValue()).trim() !== '';
  trimSheet_(sh, 20, 2);
  writeHeader_(sh, HEADERS.WORK);
  if (!seeded) {
    var weekStart = weekStartKey_(todayKey_());
    sh.getRange(2, 1, 6, 2).setValues([
      ['Week start', weekStart],
      ['Theme', 'This week’s most important work'],
      ['Daily hours', 3],
      ['Highlight 1', SEED_WORK_HIGHLIGHTS[0]],
      ['Highlight 2', SEED_WORK_HIGHLIGHTS[1]],
      ['Highlight 3', SEED_WORK_HIGHLIGHTS[2]]
    ]);
  }
  sh.setColumnWidth(1, 140);
  sh.setColumnWidth(2, 420);
  sh.getRange(2, 1, 19, 2).setBackground('#fff7d6');
}

function setupProjects_(ss) {
  var sh = ensureSheet_(SHEET.PROJECTS);
  setTabColor_(sh, 'a78bfa');
  var seeded = sh.getLastRow() >= 2 && String(sh.getRange(2, 1).getValue()).trim() !== '';
  trimSheet_(sh, 40, 3);
  writeHeader_(sh, HEADERS.PROJECTS);
  if (!seeded) {
    sh.getRange(2, 1, SEED_PROJECTS.length, 3).setValues(SEED_PROJECTS);
  }
  checkboxCol_(sh, 2, 2, 40);
  sh.getRange(2, 3, 39, 1).setNumberFormat('0.##');
  sh.setColumnWidth(1, 260);
}

function setupFitness_(ss) {
  var sh = ensureSheet_(SHEET.FITNESS);
  setTabColor_(sh, 'fb923c');
  var seeded = sh.getLastRow() >= 2 && String(sh.getRange(2, 1).getValue()).trim() !== '';
  trimSheet_(sh, 20, 3);
  writeHeader_(sh, HEADERS.FITNESS);
  if (!seeded) {
    sh.getRange(2, 1, SEED_FITNESS.length, 3).setValues(SEED_FITNESS);
  }
  var dayRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], true)
    .build();
  sh.getRange(2, 1, 19, 1).setDataValidation(dayRule);
  sh.getRange(2, 3, 19, 1).setNumberFormat('0.##');
  sh.setColumnWidth(2, 220);
}

function setupBusy_(ss) {
  var sh = ensureSheet_(SHEET.BUSY);
  setTabColor_(sh, BUSY_COLOR);
  trimSheet_(sh, 200, 5);
  writeHeader_(sh, HEADERS.BUSY);
  sh.getRange(2, 1, 199, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(2, 5, 199, 1).setNumberFormat('0.##');
  protectSheet_(sh);
}

function setupPlan_(ss) {
  var sh = ensureSheet_(SHEET.PLAN);
  setTabColor_(sh, TAB_COLORS.Plan);
  trimSheet_(sh, 800, 13);
  writeHeader_(sh, HEADERS.PLAN);
  sh.getRange(2, 2, 799, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(2, 5, 799, 1).setNumberFormat('0.###');
  protectSheet_(sh);
}

function setupSummary_(ss) {
  var sh = ensureSheet_(SHEET.SUMMARY);
  setTabColor_(sh, TAB_COLORS.Summary);
  trimSheet_(sh, 400, 7);
  writeHeader_(sh, HEADERS.SUMMARY);
  sh.getRange(2, 2, 399, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(2, 5, 399, 1).setNumberFormat('0.###');
  protectSheet_(sh);
}

function setupLog_(ss) {
  var sh = ensureSheet_(SHEET.LOG);
  setTabColor_(sh, TAB_COLORS.Log);
  trimSheet_(sh, 2000, 7);
  writeHeader_(sh, HEADERS.LOG);
}

function writeGidsToSettings_() {
  var ss = ss_();
  setSetting_(SETTINGS_KEYS.SPREADSHEET_ID, ss.getId());
  setSetting_(SETTINGS_KEYS.PLAN_GID, String(sheet_(SHEET.PLAN).getSheetId()));
  setSetting_(SETTINGS_KEYS.SUMMARY_GID, String(sheet_(SHEET.SUMMARY).getSheetId()));
  setSetting_(SETTINGS_KEYS.SETTINGS_GID, String(sheet_(SHEET.SETTINGS).getSheetId()));
  setSetting_(SETTINGS_KEYS.PERSONAL_GID, String(sheet_(SHEET.PERSONAL).getSheetId()));
}

function readSettingsMap_() {
  var sh = sheet_(SHEET.SETTINGS);
  var rows = sh.getRange(2, 1, SETTINGS_META_LAST_ROW, 2).getValues();
  var map = {};
  var i;
  for (i = 0; i < rows.length; i++) {
    var k = String(rows[i][0] || '').trim();
    if (k) {
      map[k] = rows[i][1];
    }
  }
  return map;
}

function setSetting_(key, value) {
  var sh = sheet_(SHEET.SETTINGS);
  var rows = sh.getRange(2, 1, SETTINGS_META_LAST_ROW, 1).getValues();
  var i;
  for (i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) {
      sh.getRange(2 + i, 2).setValue(value);
      return;
    }
  }
}

function getSettingNum_(map, key, fallback) {
  var n = Number(map[key]);
  return isNaN(n) ? fallback : n;
}

function daysPerWeek_() {
  return getSettingNum_(readSettingsMap_(), SETTINGS_KEYS.DAYS_PER_WEEK, 7) || 7;
}

/** Insert Daily hours column on existing sheets (Weekly used to be column E). */
function ensureSettingsBucketLayout_() {
  var sh = sheet_(SHEET.SETTINGS);
  var headers = sh.getRange(SETTINGS_BUCKET_HEADER_ROW, 1, 1, 9).getValues()[0];
  var e = String(headers[4] || '').trim();
  if (e !== 'Daily hours') {
    sh.insertColumnBefore(5);
    sh.getRange(SETTINGS_BUCKET_HEADER_ROW, 5)
      .setValue('Daily hours')
      .setFontWeight('bold')
      .setBackground('#1e293b')
      .setFontColor('#f8fafc');
    var days = daysPerWeek_();
    var i;
    for (i = 0; i < 7; i++) {
      var row = SETTINGS_BUCKET_HEADER_ROW + 1 + i;
      var weekly = toHours_(sh.getRange(row, 6).getValue());
      sh.getRange(row, 5).setValue(roundHours_(weekly / days));
      var color = String(sh.getRange(row, 3).getValue() || '').replace(/^#/, '');
      if (color) {
        try {
          sh.getRange(row, 5, 1, 1).setBackground('#' + hexColor_(color)).setFontColor('#111827');
        } catch (ignore) {}
      }
    }
    sh.getRange(SETTINGS_BUCKET_HEADER_ROW + 1, 5, 7, 1).setNumberFormat('0.##');
    sh.setColumnWidth(5, 110);
  }
  mergeLearningIntoProjects_();
  refreshBucketDropdowns_();
}

function mergeLearningIntoProjects_() {
  var sh = sheet_(SHEET.SETTINGS);
  var start = SETTINGS_BUCKET_HEADER_ROW + 1;
  var rows = sh.getRange(start, 1, 8, 9).getValues();
  var learnIdx = -1;
  var projIdx = -1;
  var i;
  for (i = 0; i < rows.length; i++) {
    var name = String(rows[i][0] || '').trim();
    if (name === 'Learning') {
      learnIdx = i;
    }
    if (name === 'Projects') {
      projIdx = i;
    }
  }
  if (learnIdx < 0) {
    relabelLearningSources_();
    return;
  }
  var days = daysPerWeek_();
  if (projIdx >= 0) {
    var pWeekly = toHours_(rows[projIdx][5]) + toHours_(rows[learnIdx][5]);
    var pMin = toHours_(rows[projIdx][6]) + toHours_(rows[learnIdx][6]);
    var projRow = start + projIdx;
    sh.getRange(projRow, 5).setValue(roundHours_(pWeekly / days));
    sh.getRange(projRow, 6).setValue(roundHours_(pWeekly));
    sh.getRange(projRow, 7).setValue(roundHours_(pMin));
  }
  sh.getRange(start + learnIdx, 1, 1, 9).clearContent();
  compactSettingsBucketRows_();
  relabelLearningSources_();
}

function compactSettingsBucketRows_() {
  var sh = sheet_(SHEET.SETTINGS);
  var start = SETTINGS_BUCKET_HEADER_ROW + 1;
  var rows = sh.getRange(start, 1, 8, 9).getValues();
  var kept = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim()) {
      kept.push(rows[i]);
    }
  }
  sh.getRange(start, 1, 8, 9).clearContent();
  if (!kept.length) {
    return;
  }
  sh.getRange(start, 1, kept.length, 9).setValues(kept);
  for (i = 0; i < kept.length; i++) {
    var color = String(kept[i][2] || '').replace(/^#/, '');
    if (color) {
      try {
        sh.getRange(start + i, 1, 1, 9).setBackground('#' + hexColor_(color)).setFontColor('#111827');
      } catch (ignore) {}
    }
  }
}

function relabelLearningSources_() {
  replaceBucketNameOnSheet_(SHEET.TEMPLATES, 1, 'Learning', 'Projects');
  replaceBucketNameOnSheet_(SHEET.TASKS, 4, 'Learning', 'Projects');
}

function replaceBucketNameOnSheet_(sheetName, col, from, to) {
  var sh = ss_().getSheetByName(sheetName);
  if (!sh) {
    return;
  }
  var last = sh.getLastRow();
  if (last < 2) {
    return;
  }
  var range = sh.getRange(2, col, last - 1, 1);
  var vals = range.getValues();
  var i;
  var changed = false;
  for (i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || '').trim() === from) {
      vals[i][0] = to;
      changed = true;
    }
  }
  if (changed) {
    range.setValues(vals);
  }
}

function refreshBucketDropdowns_() {
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(BUCKET_ORDER, true).build();
  var tpl = ss_().getSheetByName(SHEET.TEMPLATES);
  var tasks = ss_().getSheetByName(SHEET.TASKS);
  if (tpl && tpl.getMaxRows() >= 2) {
    tpl.getRange(2, 1, Math.max(tpl.getMaxRows() - 1, 1), 1).setDataValidation(rule);
  }
  if (tasks && tasks.getMaxRows() >= 2) {
    tasks.getRange(2, 4, Math.max(tasks.getMaxRows() - 1, 1), 1).setDataValidation(rule);
  }
}

function readBuckets_() {
  ensureSettingsBucketLayout_();
  var sh = sheet_(SHEET.SETTINGS);
  var days = daysPerWeek_();
  var rows = sh.getRange(SETTINGS_BUCKET_HEADER_ROW + 1, 1, 7, 9).getValues();
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var name = String(rows[i][0] || '').trim();
    if (!name) {
      continue;
    }
    var weekly = toHours_(rows[i][5]);
    var remaining = toHours_(rows[i][8]);
    out.push({
      row: SETTINGS_BUCKET_HEADER_ROW + 1 + i,
      name: name,
      weight: Number(rows[i][1]) || 99,
      color: hexColor_(rows[i][2]),
      slot: String(rows[i][3] || 'midday').trim() || 'midday',
      daily: toHours_(rows[i][4]) || roundHours_(weekly / days),
      weekly: weekly,
      min: toHours_(rows[i][6]),
      minDaily: roundHours_(toHours_(rows[i][6]) / days),
      marked: toHours_(rows[i][7]),
      remaining: remaining,
      remainingDaily: roundHours_(remaining / days)
    });
  }
  out.sort(function (a, b) {
    return a.weight - b.weight;
  });
  return out;
}

function writeBucketHours_(name, weekly) {
  var buckets = readBuckets_();
  var days = daysPerWeek_();
  var i;
  for (i = 0; i < buckets.length; i++) {
    if (buckets[i].name === name) {
      var sh = sheet_(SHEET.SETTINGS);
      var w = roundHours_(weekly);
      sh.getRange(buckets[i].row, 5).setValue(roundHours_(w / days));
      sh.getRange(buckets[i].row, 6).setValue(w);
      return;
    }
  }
  throw new Error('Unknown bucket: ' + name);
}
