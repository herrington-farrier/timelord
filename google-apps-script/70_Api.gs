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
  if (action === 'setWeeklyHours') {
    var view = setWeeklyHours(p.bucket, p.hours);
    return { ok: true, settings: view };
  }
  if (action === 'bumpWeeklyHours') {
    var view2 = bumpWeeklyHours(p.bucket, p.delta);
    return { ok: true, settings: view2 };
  }
  if (action === 'setDailyHours') {
    return { ok: true, settings: setDailyHours(p.bucket, p.hours) };
  }
  if (action === 'bumpDailyHours') {
    return { ok: true, settings: bumpDailyHours(p.bucket, p.delta) };
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
  throw new Error('Unknown action: ' + action);
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
  var val = String(chosen || '').trim();
  sheet_(SHEET.PLAN).getRange(row.row, 10).setValue(val);
  var title = row.title;
  if (row.source === 'work') {
    title = val ? 'Highlight · ' + val : row.title;
    sheet_(SHEET.PLAN).getRange(row.row, 4).setValue(title);
  }
  if (row.source === 'project') {
    title = val ? 'Project · ' + val : row.title;
    sheet_(SHEET.PLAN).getRange(row.row, 4).setValue(title);
  }
  return { ok: true, id: id, chosen: val, title: title };
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
  var sh = sheet_(SHEET.TASKS);
  var row = nextEmptyRow_(sh, 1);
  sh.getRange(row, 1, 1, 6).setValues([[name, toHours_(hours), due, bucket, !!thisWeek, true]]);
  return listTasks();
}

function updateTask(row, name, hours, due, bucket, thisWeek, active) {
  sheet_(SHEET.TASKS)
    .getRange(Number(row), 1, 1, 6)
    .setValues([[name, toHours_(hours), due, bucket, !!thisWeek, !!active]]);
  return listTasks();
}

function deleteTask(row) {
  sheet_(SHEET.TASKS).getRange(Number(row), 1, 1, 6).clearContent();
  return listTasks();
}

function addTemplate(bucket, title, hours, cadence, slot, options, thisWeek) {
  var sh = sheet_(SHEET.TEMPLATES);
  var row = nextEmptyRow_(sh, 2);
  sh.getRange(row, 1, 1, 8).setValues([
    [bucket, title, toHours_(hours), cadence, slot, options || '', true, thisWeek !== false]
  ]);
  return listTemplates();
}

function updateTemplate(row, bucket, title, hours, cadence, slot, options, active, thisWeek) {
  sheet_(SHEET.TEMPLATES)
    .getRange(Number(row), 1, 1, 8)
    .setValues([[bucket, title, toHours_(hours), cadence, slot, options || '', !!active, !!thisWeek]]);
  return listTemplates();
}

function deleteTemplate(row) {
  sheet_(SHEET.TEMPLATES).getRange(Number(row), 1, 1, 8).clearContent();
  return listTemplates();
}

function addPersonal(title, hours, slot, days, active) {
  var sh = sheet_(SHEET.PERSONAL);
  var row = nextEmptyRow_(sh, 1);
  sh.getRange(row, 1, 1, 5).setValues([[title, toHours_(hours), slot, days || 'daily', active !== false]]);
  refreshBudgetNumbers_();
  return listPersonal();
}

function updatePersonal(row, title, hours, slot, days, active) {
  sheet_(SHEET.PERSONAL)
    .getRange(Number(row), 1, 1, 5)
    .setValues([[title, toHours_(hours), slot, days || 'daily', !!active]]);
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
  var sh = sheet_(SHEET.PROJECTS);
  var row = nextEmptyRow_(sh, 1);
  sh.getRange(row, 1, 1, 3).setValues([[name, active !== false, toHours_(hours) || 1]]);
  return listProjects();
}

function updateProject(row, name, active, hours) {
  sheet_(SHEET.PROJECTS).getRange(Number(row), 1, 1, 3).setValues([[name, !!active, toHours_(hours)]]);
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
  var sh = sheet_(SHEET.FITNESS);
  var row = nextEmptyRow_(sh, 1);
  sh.getRange(row, 1, 1, 3).setValues([[weekday, session, toHours_(hours)]]);
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
