/**
 * Timelord — menus, JSONP API, CRUD.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(MENU_NAME)
    .addItem('Setup sheet (one-time)', 'setupSheet')
    .addItem('Rebuild today', 'rebuildToday')
    .addItem('Sync calendar busy', 'syncCalendarBusy')
    .addItem('Install midnight trigger', 'installMidnightTrigger')
    .addToUi();
}

function onEdit(e) {
  if (!e || !e.range) {
    return;
  }
  var sh = e.range.getSheet();
  if (sh.getName() !== SHEET.SETTINGS) {
    return;
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
  if (action === 'saveDaySettings') {
    return okSettings_(saveDaySettings(p.hours, p.days, p.minutes));
  }
  if (action === 'saveEditPage') {
    return { ok: true, catalog: saveEditPage_(p.tab, p.payload) };
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
  if (action === 'deleteItem') {
    return okCatalog_(deleteItem(p.row));
  }
  if (action === 'deletePersonal') {
    return okCatalog_(deletePersonal(p.row));
  }
  throw new Error('Unknown action: ' + action);
}

function paramBool_(v, fallback) {
  if (v == null || v === '') {
    return fallback !== false;
  }
  return toBool_(v);
}

function hoursFromParts_(h, m, fallbackHours) {
  if ((h == null || h === '') && (m == null || m === '')) {
    return toHours_(fallbackHours);
  }
  return hmToHours_(h, m);
}

function okSettings_(view) {
  return { ok: true, settings: view };
}

function okCatalog_(data) {
  return { ok: true, catalog: getEditorCatalog_(), data: data };
}

function getEditorCatalog_() {
  return {
    settings: getSettingsView(),
    personal: readPersonal_(),
    items: readItems_()
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
  if (t === 'day' || t === 'hours') {
    saveDayPage_(data);
  } else if (t === 'personal') {
    savePersonalPage_(data);
  } else {
    saveItemsPage_(data);
  }
  return getEditorCatalog_();
}

function saveDayPage_(data) {
  var meta = data.meta || {};
  saveDaySettings(meta.hours, meta.days, meta.minutes);
  var items = data.buckets || [];
  var i;
  for (i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.color) {
      setBucketColor(it.name, String(it.color || '').replace(/^#/, ''));
    }
    if (it.slot) {
      setBucketSlot(it.name, it.slot);
    }
  }
}

function savePersonalPage_(data) {
  var rows = data.rows || [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var r = rows[i];
    updatePersonal(r.row, r.title, hoursFromParts_(r.hoursPart, r.minsPart, r.hours), r.slot, r.days, paramBool_(r.active, true));
  }
  var adds = data.adds || [];
  for (i = 0; i < adds.length; i++) {
    if (String(adds[i].title || '').trim()) {
      addPersonal(
        adds[i].title,
        hoursFromParts_(adds[i].hoursPart, adds[i].minsPart, adds[i].hours),
        adds[i].slot,
        adds[i].days,
        paramBool_(adds[i].active, true)
      );
    }
  }
}

function saveItemsPage_(data) {
  var rows = data.rows || [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var r = rows[i];
    updateItem(
      r.row,
      r.bucket,
      r.title,
      hoursFromParts_(r.hoursPart, r.minsPart, r.hours),
      r.kind,
      r.cadence,
      r.due,
      paramBool_(r.current, false),
      paramBool_(r.active, true),
      r.slot
    );
  }
  var adds = data.adds || [];
  for (i = 0; i < adds.length; i++) {
    var a = adds[i];
    if (!String(a.title || '').trim()) {
      continue;
    }
    addItem(
      a.bucket,
      a.title,
      hoursFromParts_(a.hoursPart, a.minsPart, a.hours),
      a.kind,
      a.cadence,
      a.due,
      paramBool_(a.current, false),
      a.slot
    );
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
  if (status === 'complete' && row.source === 'due') {
    deactivateItemByTitle_(row.bucket, row.title);
  }
  return { ok: true, id: id, status: status };
}

function deactivateItemByTitle_(bucket, title) {
  var list = readItems_();
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i].bucket === bucket && list[i].title === title && list[i].due) {
      sheet_(SHEET.ITEMS).getRange(list[i].row, 8).setValue(false);
    }
  }
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

function addPersonal(title, hours, slot, days, active) {
  var t = String(title || '').trim();
  if (!t) {
    throw new Error('Personal title is required.');
  }
  var sh = sheet_(SHEET.PERSONAL);
  var row = nextEmptyRow_(sh, 1);
  sh.getRange(row, 1, 1, 5).setValues([[t, toHours_(hours), slot, days || 'daily', paramBool_(active, true)]]);
  return readPersonal_();
}

function updatePersonal(row, title, hours, slot, days, active) {
  var t = String(title || '').trim();
  if (!t) {
    throw new Error('Personal title is required.');
  }
  sheet_(SHEET.PERSONAL)
    .getRange(Number(row), 1, 1, 5)
    .setValues([[t, toHours_(hours), slot, days || 'daily', toBool_(active)]]);
  return readPersonal_();
}

function deletePersonal(row) {
  sheet_(SHEET.PERSONAL).getRange(Number(row), 1, 1, 5).clearContent();
  return readPersonal_();
}

function addItem(bucket, title, hours, kind, cadence, due, current, slot) {
  var t = String(title || '').trim();
  var b = String(bucket || '').trim();
  if (!t || !b) {
    throw new Error('Bucket and title are required.');
  }
  ensureItemsReady_();
  var k = normalizeKind_(kind);
  var sh = sheet_(SHEET.ITEMS);
  if (current) {
    clearCurrentInBucket_(b);
  }
  var row = nextEmptyRow_(sh, 2);
  sh.getRange(row, 1, 1, 9).setValues([
    [
      b,
      t,
      toHours_(hours),
      k,
      cadence || (k === ITEM_KIND.RECURRING ? 'daily' : b === 'Work' ? 'weekdays' : 'daily'),
      due || '',
      !!current,
      true,
      slot || slotForName_(b)
    ]
  ]);
  return readItems_();
}

function updateItem(row, bucket, title, hours, kind, cadence, due, current, active, slot) {
  var t = String(title || '').trim();
  var b = String(bucket || '').trim();
  if (!t || !b) {
    throw new Error('Bucket and title are required.');
  }
  var k = normalizeKind_(kind);
  if (current) {
    clearCurrentInBucket_(b, row);
  }
  sheet_(SHEET.ITEMS)
    .getRange(Number(row), 1, 1, 9)
    .setValues([
      [
        b,
        t,
        toHours_(hours),
        k,
        cadence || '',
        due || '',
        !!current,
        toBool_(active),
        slot || slotForName_(b)
      ]
    ]);
  return readItems_();
}

function deleteItem(row) {
  sheet_(SHEET.ITEMS).getRange(Number(row), 1, 1, 9).clearContent();
  return readItems_();
}

function clearCurrentInBucket_(bucket, exceptRow) {
  var list = readItems_();
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i].bucket !== bucket || !list[i].current) {
      continue;
    }
    if (exceptRow && String(list[i].row) === String(exceptRow)) {
      continue;
    }
    sheet_(SHEET.ITEMS).getRange(list[i].row, 7).setValue(false);
  }
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
