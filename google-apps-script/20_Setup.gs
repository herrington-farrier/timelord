/**
 * Timelord — one-time sheet setup.
 */

function setupSheet() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    MENU_NAME,
    'Create Timelord tabs, colors, and seed items on this spreadsheet?\n\nExisting Personal / Items rows are kept if those tabs already have data.',
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
  setupItems_(ss);
  setupBusy_(ss);
  setupPlan_(ss);
  setupSummary_(ss);
  setupLog_(ss);
  migrateItemsFromLegacy_();
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
    ['', ''],
    ['', ''],
    ['', ''],
    ['', ''],
    ['', ''],
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
  writeBucketHeader_(sh);
  var i;
  var start = SETTINGS_BUCKET_HEADER_ROW + 1;
  for (i = 0; i < SEED_BUCKETS.length; i++) {
    var b = SEED_BUCKETS[i];
    var row = start + i;
    sh.getRange(row, 1, 1, 4).setValues([[b.name, b.weight, b.color, b.slot]]);
    sh.getRange(row, 1, 1, 4).setBackground('#' + b.color).setFontColor('#111827');
  }
  sh.setColumnWidth(3, 90);
  sh.setColumnWidth(4, 100);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['morning', 'midday', 'evening'], true)
    .build();
  sh.getRange(start, 4, SEED_BUCKETS.length, 1).setDataValidation(rule);
}

function writeBucketHeader_(sh) {
  sh.getRange(SETTINGS_BUCKET_HEADER_ROW, 1, 1, 4).setValues([['Name', 'Weight', 'Color', 'Slot']]);
  sh.getRange(SETTINGS_BUCKET_HEADER_ROW, 1, 1, 4)
    .setFontWeight('bold')
    .setBackground('#1e293b')
    .setFontColor('#f8fafc');
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

function setupItems_(ss) {
  var sh = ensureSheet_(SHEET.ITEMS);
  setTabColor_(sh, TAB_COLORS.Items);
  trimSheet_(sh, 120, 9);
  writeHeader_(sh, HEADERS.ITEMS);
  applyItemValidations_(sh);
}

function applyItemValidations_(sh) {
  checkboxCol_(sh, 7, 2, 120);
  checkboxCol_(sh, 8, 2, 120);
  sh.getRange(2, 3, 119, 1).setNumberFormat('0.###');
  sh.getRange(2, 6, 119, 1).setNumberFormat('yyyy-mm-dd');
  var bucketRule = SpreadsheetApp.newDataValidation().requireValueInList(BUCKET_ORDER, true).build();
  sh.getRange(2, 1, 119, 1).setDataValidation(bucketRule);
  var kindRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([ITEM_KIND.RECURRING, ITEM_KIND.HOURLY], true)
    .build();
  sh.getRange(2, 4, 119, 1).setDataValidation(kindRule);
  var slotRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['morning', 'midday', 'evening'], true)
    .build();
  sh.getRange(2, 9, 119, 1).setDataValidation(slotRule);
  sh.setColumnWidth(1, 110);
  sh.setColumnWidth(2, 280);
  sh.setColumnWidth(5, 150);
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

function ensureSettingsBucketLayout_() {
  var sh = sheet_(SHEET.SETTINGS);
  writeBucketHeader_(sh);
  mergeLearningIntoProjects_();
  refreshBucketDropdowns_();
}

function mergeLearningIntoProjects_() {
  var sh = sheet_(SHEET.SETTINGS);
  var start = SETTINGS_BUCKET_HEADER_ROW + 1;
  var rows = sh.getRange(start, 1, 8, 4).getValues();
  var learnIdx = -1;
  var i;
  for (i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === 'Learning') {
      learnIdx = i;
    }
  }
  if (learnIdx < 0) {
    return;
  }
  sh.getRange(start + learnIdx, 1, 1, 9).clearContent();
  compactSettingsBucketRows_();
}

function compactSettingsBucketRows_() {
  var sh = sheet_(SHEET.SETTINGS);
  var start = SETTINGS_BUCKET_HEADER_ROW + 1;
  var rows = sh.getRange(start, 1, 8, 4).getValues();
  var kept = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim()) {
      kept.push(rows[i]);
    }
  }
  sh.getRange(start, 1, 8, 4).clearContent();
  if (!kept.length) {
    return;
  }
  sh.getRange(start, 1, kept.length, 4).setValues(kept);
  for (i = 0; i < kept.length; i++) {
    var color = String(kept[i][2] || '').replace(/^#/, '');
    if (color) {
      try {
        sh.getRange(start + i, 1, 1, 4).setBackground('#' + hexColor_(color)).setFontColor('#111827');
      } catch (ignore) {}
    }
  }
}

function refreshBucketDropdowns_() {
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(BUCKET_ORDER, true).build();
  var items = ss_().getSheetByName(SHEET.ITEMS);
  if (items && items.getMaxRows() >= 2) {
    items.getRange(2, 1, Math.max(items.getMaxRows() - 1, 1), 1).setDataValidation(rule);
  }
}

function readBuckets_() {
  ensureSettingsBucketLayout_();
  var sh = sheet_(SHEET.SETTINGS);
  var rows = sh.getRange(SETTINGS_BUCKET_HEADER_ROW + 1, 1, 7, 4).getValues();
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var name = String(rows[i][0] || '').trim();
    if (!name) {
      continue;
    }
    out.push({
      row: SETTINGS_BUCKET_HEADER_ROW + 1 + i,
      name: name,
      weight: Number(rows[i][1]) || 99,
      color: hexColor_(rows[i][2]),
      slot: String(rows[i][3] || 'midday').trim() || 'midday'
    });
  }
  out.sort(function (a, b) {
    return a.weight - b.weight;
  });
  return out;
}

function itemKey_(bucket, title) {
  return String(bucket || '').trim() + '|' + String(title || '').trim().toLowerCase();
}

function migrateItemsFromLegacy_() {
  var sh = ensureSheet_(SHEET.ITEMS);
  if (sh.getLastRow() < 2 || String(sh.getRange(1, 1).getValue() || '').trim() !== 'Bucket') {
    setupItems_(ss_());
  }
  var existing = {};
  var current = readItemsRaw_();
  var i;
  for (i = 0; i < current.length; i++) {
    existing[itemKey_(current[i].bucket, current[i].title)] = true;
  }
  if (current.length) {
    return;
  }
  var rows = [];
  function add(bucket, title, hours, kind, cadence, due, isCurrent, slot) {
    var t = String(title || '').trim();
    var b = String(bucket || '').trim();
    if (!t || !b || existing[itemKey_(b, t)]) {
      return;
    }
    existing[itemKey_(b, t)] = true;
    rows.push([
      b,
      t,
      toHours_(hours) || 0.5,
      kind,
      cadence || '',
      due || '',
      !!isCurrent,
      true,
      slot || slotForName_(b)
    ]);
  }
  try {
    var tpls = readLegacyTemplates_();
    for (i = 0; i < tpls.length; i++) {
      var tpl = tpls[i];
      var kind = tpl.mode === 'current' ? ITEM_KIND.HOURLY : ITEM_KIND.RECURRING;
      add(tpl.bucket, tpl.title, tpl.hours, kind, tpl.cadence, '', kind === ITEM_KIND.HOURLY, tpl.slot);
    }
  } catch (ignore) {}
  try {
    var tasks = readLegacyTasks_();
    for (i = 0; i < tasks.length; i++) {
      add(tasks[i].bucket, tasks[i].title, tasks[i].hours || 1, ITEM_KIND.HOURLY, '', tasks[i].due, false, slotForName_(tasks[i].bucket));
    }
  } catch (ignore2) {}
  try {
    var work = readLegacyWork_();
    for (i = 0; i < work.highlights.length; i++) {
      add('Work', work.highlights[i], work.dailyHours || 3, ITEM_KIND.HOURLY, 'weekdays', '', i === 0, 'midday');
    }
  } catch (ignore3) {}
  try {
    var projects = readLegacyProjects_();
    var first = true;
    for (i = 0; i < projects.length; i++) {
      if (!projects[i].active) {
        continue;
      }
      add('Projects', projects[i].name, projects[i].hours || 1, ITEM_KIND.HOURLY, 'daily', '', first, 'midday');
      first = false;
    }
  } catch (ignore4) {}
  try {
    var fitness = readLegacyFitness_();
    for (i = 0; i < fitness.length; i++) {
      add('Fitness', fitness[i].title, fitness[i].hours || 1, ITEM_KIND.RECURRING, 'weekly:' + fitness[i].weekday, '', false, 'midday');
    }
  } catch (ignore5) {}
  if (!rows.length) {
    sh.getRange(2, 1, SEED_ITEMS.length, 9).setValues(SEED_ITEMS);
    applyItemValidations_(sh);
    return;
  }
  var start = nextEmptyRow_(sh, 2);
  sh.getRange(start, 1, rows.length, 9).setValues(rows);
  applyItemValidations_(sh);
}

function readItemsRaw_() {
  var sh = ss_().getSheetByName(SHEET.ITEMS);
  if (!sh || sh.getLastRow() < 2) {
    return [];
  }
  var data = dataRows_(sh, 9);
  var out = [];
  var i;
  for (i = 0; i < data.length; i++) {
    var bucket = String(data[i][0] || '').trim();
    var title = String(data[i][1] || '').trim();
    if (!bucket || !title) {
      continue;
    }
    out.push({ bucket: bucket, title: title });
  }
  return out;
}

function slotForName_(name) {
  var i;
  for (i = 0; i < SEED_BUCKETS.length; i++) {
    if (SEED_BUCKETS[i].name === name) {
      return SEED_BUCKETS[i].slot;
    }
  }
  return 'midday';
}

function readLegacyTemplates_() {
  var sh = ss_().getSheetByName('Templates');
  if (!sh) {
    return [];
  }
  var rows = dataRows_(sh, 9);
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var title = String(rows[i][1] || '').trim();
    var bucket = String(rows[i][0] || '').trim();
    if (!title || !bucket) {
      continue;
    }
    out.push({
      bucket: bucket,
      title: title,
      hours: toHours_(rows[i][2]),
      cadence: String(rows[i][3] || 'daily').trim() || 'daily',
      slot: String(rows[i][4] || 'morning').trim() || 'morning',
      mode: String(rows[i][8] || 'scheduled').trim().toLowerCase()
    });
  }
  return out;
}

function readLegacyTasks_() {
  var sh = ss_().getSheetByName('Tasks');
  if (!sh) {
    return [];
  }
  var rows = dataRows_(sh, 6);
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var name = String(rows[i][0] || '').trim();
    if (!name) {
      continue;
    }
    var due = parseYmd_(rows[i][2]);
    out.push({
      title: name,
      hours: toHours_(rows[i][1]),
      due: due ? due.key : '',
      bucket: String(rows[i][3] || '').trim()
    });
  }
  return out;
}

function readLegacyWork_() {
  var sh = ss_().getSheetByName('Work');
  var out = { dailyHours: 3, highlights: [] };
  if (!sh) {
    return out;
  }
  var rows = dataRows_(sh, 2);
  var i;
  for (i = 0; i < rows.length; i++) {
    var field = String(rows[i][0] || '').trim().toLowerCase();
    var val = rows[i][1];
    if (field === 'daily hours') {
      out.dailyHours = toHours_(val) || 3;
    } else if (field.indexOf('highlight') === 0) {
      var h = String(val || '').trim();
      if (h) {
        out.highlights.push(h);
      }
    }
  }
  return out;
}

function readLegacyProjects_() {
  var sh = ss_().getSheetByName('Projects');
  if (!sh) {
    return [];
  }
  var rows = dataRows_(sh, 3);
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var name = String(rows[i][0] || '').trim();
    if (!name) {
      continue;
    }
    out.push({
      name: name,
      active: toBool_(rows[i][1] === '' ? true : rows[i][1]),
      hours: toHours_(rows[i][2]) || 1
    });
  }
  return out;
}

function readLegacyFitness_() {
  var sh = ss_().getSheetByName('Fitness');
  if (!sh) {
    return [];
  }
  var rows = dataRows_(sh, 3);
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var day = String(rows[i][0] || '').trim();
    var session = String(rows[i][1] || '').trim();
    if (!day || !session) {
      continue;
    }
    out.push({
      weekday: day.slice(0, 3),
      title: session,
      hours: toHours_(rows[i][2]) || 1
    });
  }
  return out;
}
