/**
 * Timelord — menus, JSONP API, CRUD for dialogs.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(MENU_NAME)
    .addItem('Setup sheet (one-time)', 'setupSheet')
    .addItem('Rebuild today', 'rebuildToday')
    .addItem('Sync calendar busy', 'syncCalendarBusy')
    .addItem('Install midnight trigger', 'installMidnightTrigger')
    .addSeparator()
    .addItem('Tasks', 'openTasks')
    .addItem('Templates', 'openTemplates')
    .addItem('Work', 'openWork')
    .addItem('Projects', 'openProjects')
    .addItem('Fitness', 'openFitness')
    .addItem('Personal', 'openPersonal')
    .addItem('Settings', 'openSettings')
    .addToUi();
}

/** Typing Daily or Weekly hours on Settings rebalances like the pickers. */
function onEdit(e) {
  if (!e || !e.range) {
    return;
  }
  var sh = e.range.getSheet();
  if (sh.getName() !== SHEET.SETTINGS) {
    return;
  }
  if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) {
    return;
  }
  var row = e.range.getRow();
  var col = e.range.getColumn();
  var start = SETTINGS_BUCKET_HEADER_ROW + 1;
  if (row < start || row > start + 5) {
    return;
  }
  ensureSettingsBucketLayout_();
  var name = String(sh.getRange(row, 1).getValue() || '').trim();
  if (!name) {
    return;
  }
  var hours = toHours_(e.value);
  try {
    if (col === 5) {
      setDailyHours(name, hours);
    } else if (col === 6) {
      setWeeklyHours(name, hours);
    }
  } catch (err) {
    toast_(String(err && err.message ? err.message : err), 8);
  }
}

function installMidnightTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var i;
  for (i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'midnightPack_') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('midnightPack_')
    .timeBased()
    .atHour(0)
    .nearMinute(5)
    .inTimezone(TZ)
    .everyDays(1)
    .create();
  toast_('Midnight pack installed (00:05 America/Chicago).', 6);
}

function openHtml_(file, title, w, h) {
  var html = HtmlService.createHtmlOutputFromFile(file).setWidth(w || 720).setHeight(h || 560);
  SpreadsheetApp.getUi().showModalDialog(html, title);
}

function openTasks() {
  openHtml_('Tasks', 'Tasks', 760, 580);
}
function openTemplates() {
  openHtml_('Templates', 'Templates', 860, 600);
}
function openWork() {
  openHtml_('Work', 'Work', 560, 480);
}
function openProjects() {
  openHtml_('Projects', 'Projects', 560, 480);
}
function openFitness() {
  openHtml_('Fitness', 'Fitness', 560, 480);
}
function openPersonal() {
  openHtml_('Personal', 'Personal', 640, 500);
}
function openSettings() {
  openHtml_('Settings', 'Settings', 720, 560);
}

function doGet(e) {
  e = e || { parameter: {} };
  var p = e.parameter || {};
  var action = String(p.action || '').trim();
  var cb = String(p.callback || '').trim();
  if (!action) {
    return HtmlService.createHtmlOutputFromFile('Mobile')
      .setTitle('Timelord')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  var result;
  try {
    result = handleAction_(p);
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  var body = JSON.stringify(result);
  if (cb && /^[A-Za-z_][A-Za-z0-9_]*$/.test(cb)) {
    return ContentService.createTextOutput(cb + '(' + body + ')').setMimeType(
      ContentService.MimeType.JAVASCRIPT
    );
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function handleAction_(p) {
  var action = String(p.action || '');
  if (action === 'complete') {
    return setPlanStatus_(p.id, 'complete');
  }
  if (action === 'skip') {
    return setPlanStatus_(p.id, 'skipped');
  }
  if (action === 'skipBucket') {
    return skipBucket_(p.bucket, p.date);
  }
  if (action === 'pick') {
    return pickChosen_(p.id, p.chosen);
  }
  if (action === 'setCurrent') {
    return setCurrentTask_(p.bucket, p.chosen);
  }
  if (action === 'setWeeklyHours') {
    return okSettings_(setWeeklyHours(p.bucket, p.hours));
  }
  if (action === 'bumpWeeklyHours') {
    return okSettings_(bumpWeeklyHours(p.bucket, p.delta));
  }
  if (action === 'setDailyHours') {
    return okSettings_(setDailyHours(p.bucket, p.hours));
  }
  if (action === 'bumpDailyHours') {
    return okSettings_(bumpDailyHours(p.bucket, p.delta));
  }
  if (action === 'setDayHours') {
    return okSettings_(setDayHours(p.hours));
  }
  if (action === 'setDaysPerWeek') {
    return okSettings_(setDaysPerWeek(p.days));
  }
  if (action === 'setBufferMinutes') {
    return okSettings_(setBufferMinutes(p.minutes));
  }
  if (action === 'saveDaySettings') {
    return okSettings_(saveDaySettings(p.hours, p.days, p.minutes));
  }
  if (action === 'saveBucket') {
    return okSettings_(saveBucket(p.bucket, p.color, p.slot, p.min, p.hours));
  }
  if (action === 'saveEditPage') {
    return { ok: true, catalog: saveEditPage_(p.tab, p.payload) };
  }
  if (action === 'setBucketColor') {
    return okSettings_(setBucketColor(p.bucket, p.color));
  }
  if (action === 'setBucketMin') {
    return okSettings_(setBucketMin(p.bucket, p.min));
  }
  if (action === 'setBucketSlot') {
    return okSettings_(setBucketSlot(p.bucket, p.slot));
  }
  if (action === 'rebuild') {
    return { ok: true, payload: rebuildToday() };
  }
  if (action === 'today') {
    return { ok: true, payload: getTodayPayload_(p.date || todayKey_()) };
  }
  if (action === 'syncBusy') {
    return { ok: true, count: syncBusyQuiet_() };
  }
  if (action === 'catalog') {
    return { ok: true, catalog: getEditorCatalog_() };
  }
  if (action === 'addTask') {
    return okCatalog_(addTask(p.name, p.hours, p.due, p.bucket, paramBool_(p.thisWeek, true)));
  }
  if (action === 'updateTask') {
    return okCatalog_(
      updateTask(p.row, p.name, p.hours, p.due, p.bucket, paramBool_(p.thisWeek, true), paramBool_(p.active, true))
    );
  }
  if (action === 'deleteTask') {
    return okCatalog_(deleteTask(p.row));
  }
  if (action === 'addTemplate') {
    return okCatalog_(
      addTemplate(p.bucket, p.title, p.hours, p.cadence, p.slot, p.options, paramBool_(p.thisWeek, true), p.mode)
    );
  }
  if (action === 'updateTemplate') {
    return okCatalog_(
      updateTemplate(
        p.row,
        p.bucket,
        p.title,
        p.hours,
        p.cadence,
        p.slot,
        p.options,
        paramBool_(p.active, true),
        paramBool_(p.thisWeek, true),
        p.mode
      )
    );
  }
  if (action === 'deleteTemplate') {
    return okCatalog_(deleteTemplate(p.row));
  }
  if (action === 'addPersonal') {
    return okCatalog_(addPersonal(p.title, p.hours, p.slot, p.days, paramBool_(p.active, true)));
  }
  if (action === 'updatePersonal') {
    return okCatalog_(updatePersonal(p.row, p.title, p.hours, p.slot, p.days, paramBool_(p.active, true)));
  }
  if (action === 'deletePersonal') {
    return okCatalog_(deletePersonal(p.row));
  }
  if (action === 'saveWork') {
    return okCatalog_(saveWork(p.weekStart, p.theme, p.dailyHours, p.h1, p.h2, p.h3));
  }
  if (action === 'addProject') {
    return okCatalog_(addProject(p.name, p.hours, paramBool_(p.active, true)));
  }
  if (action === 'updateProject') {
    return okCatalog_(updateProject(p.row, p.name, paramBool_(p.active, true), p.hours));
  }
  if (action === 'deleteProject') {
    return okCatalog_(deleteProject(p.row));
  }
  if (action === 'addFitness') {
    return okCatalog_(addFitnessRow(p.weekday, p.session, p.hours));
  }
  if (action === 'updateFitness') {
    return okCatalog_(saveFitnessRow(p.row, p.weekday, p.session, p.hours));
  }
  if (action === 'deleteFitness') {
    return okCatalog_(deleteFitnessRow(p.row));
  }
  throw new Error('Unknown action: ' + action);
}

function paramBool_(v, fallback) {
  if (v == null || v === '') {
    return fallback !== false;
  }
  return toBool_(v);
}

function okSettings_(view) {
  return { ok: true, settings: view };
}

function okCatalog_(listOrWork) {
  return { ok: true, catalog: getEditorCatalog_(), data: listOrWork };
}

function getEditorCatalog_() {
  return {
    settings: getSettingsView(),
    tasks: listTasks(),
    templates: listTemplates(),
    personal: listPersonal(),
    work: getWork(),
    projects: listProjects(),
    fitness: listFitness()
  };
}

function parsePayload_(raw) {
  if (raw == null || raw === '') {
    return {};
  }
  if (typeof raw === 'object') {
    return raw;
  }
  return JSON.parse(String(raw));
}

function saveEditPage_(tab, payloadRaw) {
  var data = parsePayload_(payloadRaw);
  var t = String(tab || data.tab || '').trim();
  if (t === 'hours') {
    saveHoursPage_(data);
  } else if (t === 'personal') {
    savePersonalPage_(data);
  } else if (t === 'scheduled' || t === 'rotate' || t === 'templates') {
    saveTemplatePage_(data);
  } else if (t === 'oneoffs' || t === 'tasks') {
    saveTaskPage_(data);
  } else if (t === 'current' || t === 'work' || t === 'projects') {
    saveCurrentPage_(data);
  } else if (t === 'fitness') {
    saveTemplatePage_(data);
  }
  applyCurrentMap_(data.current);
  return getEditorCatalog_();
}

function applyCurrentMap_(current) {
  if (!current || typeof current !== 'object') {
    return;
  }
  var k;
  for (k in current) {
    if (Object.prototype.hasOwnProperty.call(current, k)) {
      setCurrentTask_(k, current[k]);
    }
  }
}

function saveHoursPage_(data) {
  var meta = data.meta || {};
  if (meta.hours != null && meta.hours !== '') {
    var day = roundHours_(Math.max(1, Number(meta.hours)));
    if (isNaN(day)) {
      throw new Error('Day hours must be a number.');
    }
    setSetting_(SETTINGS_KEYS.DAY_HOURS, day);
  }
  if (meta.days != null && meta.days !== '') {
    var days = Math.max(1, Math.min(7, Math.round(Number(meta.days))));
    if (isNaN(days)) {
      throw new Error('Days per week must be a number.');
    }
    setSetting_(SETTINGS_KEYS.DAYS_PER_WEEK, days);
  }
  if (meta.minutes != null && meta.minutes !== '') {
    var mins = Math.max(0, Math.round(Number(meta.minutes)));
    if (isNaN(mins)) {
      throw new Error('Buffer minutes must be a number.');
    }
    setSetting_(SETTINGS_KEYS.BUFFER_MINUTES, mins);
  }

  var items = data.buckets || [];
  var sh = sheet_(SHEET.SETTINGS);
  var i;
  for (i = 0; i < items.length; i++) {
    var it = items[i];
    var b = findBucket_(it.name);
    if (it.color) {
      var hex = hexColor_(String(it.color || '').replace(/^#/, ''));
      sh.getRange(b.row, 3).setValue(hex);
      try {
        sh.getRange(b.row, 1, 1, 9).setBackground('#' + hex).setFontColor('#111827');
      } catch (ignore) {}
    }
    if (it.slot) {
      var slot = String(it.slot || 'midday').trim().toLowerCase();
      if (slot !== 'morning' && slot !== 'midday' && slot !== 'evening') {
        slot = 'midday';
      }
      sh.getRange(b.row, 4).setValue(slot);
    }
    if (it.min != null && it.min !== '') {
      sh.getRange(b.row, 7).setValue(roundHours_(Math.max(0, Number(it.min))));
    }
  }

  var buckets = readBuckets_();
  var byName = {};
  for (i = 0; i < items.length; i++) {
    byName[items[i].name] = items[i];
  }
  var targets = [];
  for (i = 0; i < buckets.length; i++) {
    var bucket = buckets[i];
    var row = byName[bucket.name] || {};
    var min =
      row.min != null && row.min !== ''
        ? roundHours_(Math.max(0, Number(row.min)))
        : bucket.min;
    var daily = row.daily != null && row.daily !== '' ? toHours_(row.daily) : bucket.daily;
    var weekly = roundHours_(daily * bucketDays_(bucket.name));
    if (weekly < min) {
      weekly = min;
    }
    targets.push({ name: bucket.name, weekly: weekly, min: min });
  }

  var map = readSettingsMap_();
  var assignable = roundHours_(
    Math.max(
      0,
      getSettingNum_(map, SETTINGS_KEYS.DAY_HOURS, 12) * getSettingNum_(map, SETTINGS_KEYS.DAYS_PER_WEEK, 7) -
        personalWeeklyHours_()
    )
  );
  var allocated = 0;
  for (i = 0; i < targets.length; i++) {
    allocated += targets[i].weekly;
  }
  var overflow = roundHours_(allocated - assignable);
  var si;
  for (si = 0; si < STEAL_ORDER.length && overflow > 1e-9; si++) {
    for (i = 0; i < targets.length; i++) {
      if (targets[i].name !== STEAL_ORDER[si]) {
        continue;
      }
      var stealable = roundHours_(targets[i].weekly - targets[i].min);
      if (stealable > 0) {
        var take = Math.min(stealable, overflow);
        targets[i].weekly = roundHours_(targets[i].weekly - take);
        overflow = roundHours_(overflow - take);
      }
      break;
    }
  }
  for (i = 0; i < targets.length; i++) {
    writeBucketHours_(targets[i].name, targets[i].weekly);
  }
  refreshBudgetNumbers_();
}

function savePersonalPage_(data) {
  var rows = data.rows || [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var r = rows[i];
    updatePersonal(r.row, r.title, r.hours, r.slot, r.days, paramBool_(r.active, true));
  }
  var adds = data.adds || [];
  for (i = 0; i < adds.length; i++) {
    if (String(adds[i].title || '').trim()) {
      addPersonal(adds[i].title, adds[i].hours, adds[i].slot, adds[i].days, paramBool_(adds[i].active, true));
    }
  }
}

function saveTemplatePage_(data) {
  var rows = data.rows || [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var r = rows[i];
    var prev = templateByRow_(r.row);
    updateTemplate(
      r.row,
      r.bucket || (prev && prev.bucket),
      r.title,
      r.hours != null && r.hours !== '' ? r.hours : prev ? prev.hours : 0,
      r.cadence,
      r.slot || (prev && prev.slot) || 'morning',
      r.options != null ? r.options : prev ? prev.options : '',
      paramBool_(r.active, true),
      paramBool_(r.thisWeek, true),
      r.mode || (prev && prev.mode)
    );
  }
  var adds = data.adds || [];
  for (i = 0; i < adds.length; i++) {
    var a = adds[i];
    if (!String(a.title || '').trim()) {
      continue;
    }
    addTemplate(
      a.bucket,
      a.title,
      a.hours || 0,
      a.cadence,
      a.slot || 'morning',
      a.options || '',
      paramBool_(a.thisWeek, true),
      a.mode
    );
  }
}

function templateByRow_(row) {
  var list = readTemplates_();
  var i;
  for (i = 0; i < list.length; i++) {
    if (String(list[i].row) === String(row)) {
      return list[i];
    }
  }
  return null;
}

function saveTaskPage_(data) {
  var rows = data.rows || [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var r = rows[i];
    updateTask(r.row, r.name || r.title, r.hours || 0, r.due, r.bucket, paramBool_(r.thisWeek, true), paramBool_(r.active, true));
  }
  var adds = data.adds || [];
  for (i = 0; i < adds.length; i++) {
    var a = adds[i];
    if (String(a.name || a.title || '').trim()) {
      addTask(a.name || a.title, a.hours || 0, a.due, a.bucket, paramBool_(a.thisWeek, true));
    }
  }
}

function saveCurrentPage_(data) {
  if (data.work) {
    var w = data.work;
    saveWork(w.weekStart, w.theme, w.dailyHours, w.h1, w.h2, w.h3);
  }
  var rows = data.rows || [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.kind === 'project') {
      updateProject(r.row, r.name, paramBool_(r.active, true), r.hours || 1);
    } else if (r.kind === 'template') {
      var prev = templateByRow_(r.row);
      updateTemplate(
        r.row,
        r.bucket || (prev && prev.bucket),
        r.title,
        prev ? prev.hours : 0,
        r.cadence || (prev && prev.cadence) || 'daily',
        prev ? prev.slot : 'midday',
        prev ? prev.options : '',
        paramBool_(r.active, true),
        paramBool_(r.thisWeek, true),
        r.mode || ITEM_MODE.CURRENT
      );
    }
  }
  var adds = data.adds || [];
  for (i = 0; i < adds.length; i++) {
    var a = adds[i];
    if (a.kind === 'project' && String(a.name || '').trim()) {
      addProject(a.name, a.hours || 1, paramBool_(a.active, true));
    } else if (a.kind === 'template' && String(a.title || '').trim()) {
      addTemplate(
        a.bucket,
        a.title,
        0,
        a.cadence || 'daily',
        'midday',
        '',
        paramBool_(a.thisWeek, true),
        ITEM_MODE.CURRENT
      );
    }
  }
}

function setPlanStatus_(id, status) {
  var row = findPlanById_(id);
  if (!row) {
    throw new Error('Plan row not found.');
  }
  if (row.bucket === 'Buffer') {
    throw new Error('Buffers cannot be completed.');
  }
  sheet_(SHEET.PLAN).getRange(row.row, 7).setValue(status);
  appendLog_(status, row);
  refreshBudgetNumbers_();
  return { ok: true, id: id, status: status };
}

function skipBucket_(bucket, dateKey) {
  var key = dateKey || todayKey_();
  var name = String(bucket || '').trim();
  var plan = readPlanRows_();
  var n = 0;
  var i;
  for (i = 0; i < plan.length; i++) {
    var r = plan[i];
    if (r.date !== key || r.bucket !== name) {
      continue;
    }
    if (r.status !== 'pending' || r.source === 'buffer') {
      continue;
    }
    sheet_(SHEET.PLAN).getRange(r.row, 7).setValue('skipped');
    r.status = 'skipped';
    appendLog_('skipped', r);
    n++;
  }
  refreshBudgetNumbers_();
  return { ok: true, count: n, bucket: name };
}

function pickChosen_(id, chosen) {
  var row = findPlanById_(id);
  if (!row) {
    throw new Error('Plan row not found.');
  }
  return setCurrentTask_(row.bucket, chosen);
}

function setCurrentTask_(bucket, chosen) {
  var name = String(bucket || '').trim();
  if (!name) {
    throw new Error('Bucket is required.');
  }
  var val = String(chosen || '').trim();
  setChosen_(name, val);
  var title = val || name;
  var plan = readPlanRows_();
  var today = todayKey_();
  var i;
  var n = 0;
  for (i = 0; i < plan.length; i++) {
    var r = plan[i];
    if (r.bucket !== name) {
      continue;
    }
    if (r.source === 'personal' || r.source === 'busy' || r.source === 'buffer') {
      continue;
    }
    if (r.date < today) {
      continue;
    }
    if (r.status !== 'pending') {
      continue;
    }
    if (r.date !== today && bucketHasScheduledTask_(name, r.date)) {
      continue;
    }
    sheet_(SHEET.PLAN).getRange(r.row, 4).setValue(title);
    sheet_(SHEET.PLAN).getRange(r.row, 10).setValue(val);
    n++;
  }
  return { ok: true, bucket: name, chosen: val, title: title, updated: n };
}

function findPlanById_(id) {
  var want = String(id || '').trim();
  var plan = readPlanRows_();
  var i;
  for (i = 0; i < plan.length; i++) {
    if (plan[i].id === want) {
      return plan[i];
    }
  }
  return null;
}

function appendLog_(action, row) {
  var sh = sheet_(SHEET.LOG);
  sh.appendRow([chicagoNow_(), row.date, row.id, action, row.bucket, row.title, row.hours]);
}

function listTasks() {
  return readTasks_();
}
function listTemplates() {
  return readTemplates_();
}
function listPersonal() {
  return readPersonal_();
}
function listProjects() {
  return readProjects_();
}
function listFitness() {
  return readFitness_();
}
function getWork() {
  return readWork_();
}

function addTask(name, hours, due, bucket, thisWeek) {
  var title = String(name || '').trim();
  if (!title) {
    throw new Error('Task name is required.');
  }
  var sh = sheet_(SHEET.TASKS);
  var row = nextEmptyRow_(sh, 1);
  sh.getRange(row, 1, 1, 6).setValues([[title, toHours_(hours), due, bucket, toBool_(thisWeek), true]]);
  return listTasks();
}

function updateTask(row, name, hours, due, bucket, thisWeek, active) {
  var title = String(name || '').trim();
  if (!title) {
    throw new Error('Task name is required.');
  }
  sheet_(SHEET.TASKS)
    .getRange(Number(row), 1, 1, 6)
    .setValues([[title, toHours_(hours), due, bucket, toBool_(thisWeek), toBool_(active)]]);
  return listTasks();
}

function deleteTask(row) {
  sheet_(SHEET.TASKS).getRange(Number(row), 1, 1, 6).clearContent();
  return listTasks();
}

function addTemplate(bucket, title, hours, cadence, slot, options, thisWeek, mode) {
  var t = String(title || '').trim();
  var b = String(bucket || '').trim();
  if (!t || !b) {
    throw new Error('Template bucket and title are required.');
  }
  ensureTemplateMode_();
  var sh = sheet_(SHEET.TEMPLATES);
  var row = nextEmptyRow_(sh, 2);
  sh.getRange(row, 1, 1, 9).setValues([
    [
      b,
      t,
      toHours_(hours),
      cadence || 'daily',
      slot,
      options || '',
      true,
      paramBool_(thisWeek, true),
      normalizeMode_(mode)
    ]
  ]);
  return listTemplates();
}

function updateTemplate(row, bucket, title, hours, cadence, slot, options, active, thisWeek, mode) {
  var t = String(title || '').trim();
  var b = String(bucket || '').trim();
  if (!t || !b) {
    throw new Error('Template bucket and title are required.');
  }
  ensureTemplateMode_();
  sheet_(SHEET.TEMPLATES)
    .getRange(Number(row), 1, 1, 9)
    .setValues([
      [
        b,
        t,
        toHours_(hours),
        cadence || 'daily',
        slot,
        options || '',
        toBool_(active),
        toBool_(thisWeek),
        normalizeMode_(mode)
      ]
    ]);
  return listTemplates();
}

function deleteTemplate(row) {
  sheet_(SHEET.TEMPLATES).getRange(Number(row), 1, 1, 9).clearContent();
  return listTemplates();
}

function addPersonal(title, hours, slot, days, active) {
  var t = String(title || '').trim();
  if (!t) {
    throw new Error('Personal title is required.');
  }
  var sh = sheet_(SHEET.PERSONAL);
  var row = nextEmptyRow_(sh, 1);
  sh.getRange(row, 1, 1, 5).setValues([[t, toHours_(hours), slot, days || 'daily', paramBool_(active, true)]]);
  refreshBudgetNumbers_();
  return listPersonal();
}

function updatePersonal(row, title, hours, slot, days, active) {
  var t = String(title || '').trim();
  if (!t) {
    throw new Error('Personal title is required.');
  }
  sheet_(SHEET.PERSONAL)
    .getRange(Number(row), 1, 1, 5)
    .setValues([[t, toHours_(hours), slot, days || 'daily', toBool_(active)]]);
  refreshBudgetNumbers_();
  return listPersonal();
}

function deletePersonal(row) {
  sheet_(SHEET.PERSONAL).getRange(Number(row), 1, 1, 5).clearContent();
  refreshBudgetNumbers_();
  return listPersonal();
}

function saveWork(weekStart, theme, dailyHours, h1, h2, h3) {
  var sh = sheet_(SHEET.WORK);
  sh.getRange(2, 1, 6, 2).setValues([
    ['Week start', weekStart],
    ['Theme', theme],
    ['Daily hours', toHours_(dailyHours)],
    ['Highlight 1', h1 || ''],
    ['Highlight 2', h2 || ''],
    ['Highlight 3', h3 || '']
  ]);
  return getWork();
}

function addProject(name, hours, active) {
  var n = String(name || '').trim();
  if (!n) {
    throw new Error('Project name is required.');
  }
  var sh = sheet_(SHEET.PROJECTS);
  var row = nextEmptyRow_(sh, 1);
  sh.getRange(row, 1, 1, 3).setValues([[n, paramBool_(active, true), toHours_(hours) || 1]]);
  return listProjects();
}

function updateProject(row, name, active, hours) {
  var n = String(name || '').trim();
  if (!n) {
    throw new Error('Project name is required.');
  }
  sheet_(SHEET.PROJECTS).getRange(Number(row), 1, 1, 3).setValues([[n, toBool_(active), toHours_(hours)]]);
  return listProjects();
}

function deleteProject(row) {
  sheet_(SHEET.PROJECTS).getRange(Number(row), 1, 1, 3).clearContent();
  return listProjects();
}

function saveFitnessRow(row, weekday, session, hours) {
  sheet_(SHEET.FITNESS)
    .getRange(Number(row), 1, 1, 3)
    .setValues([[weekday, session, toHours_(hours)]]);
  return listFitness();
}

function addFitnessRow(weekday, session, hours) {
  var s = String(session || '').trim();
  if (!s) {
    throw new Error('Session name is required.');
  }
  var sh = sheet_(SHEET.FITNESS);
  var row = nextEmptyRow_(sh, 1);
  sh.getRange(row, 1, 1, 3).setValues([[weekday, s, toHours_(hours)]]);
  return listFitness();
}

function deleteFitnessRow(row) {
  sheet_(SHEET.FITNESS).getRange(Number(row), 1, 1, 3).clearContent();
  return listFitness();
}

function nextEmptyRow_(sh, nameCol) {
  var last = Math.max(sh.getLastRow(), 1);
  var i;
  for (i = 2; i <= last + 1; i++) {
    if (!String(sh.getRange(i, nameCol).getValue() || '').trim()) {
      return i;
    }
  }
  return last + 1;
}

function getPlanForDialog(dateKey) {
  return getTodayPayload_(dateKey || todayKey_());
}
