/**
 * Timelord — spreadsheet helpers.
 */

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) {
    throw new Error('Missing tab: ' + name + '. Run Timelord → Setup sheet (one-time).');
  }
  return sh;
}

function toast_(msg, seconds) {
  var ss = ss_();
  if (ss) {
    ss.toast(String(msg), MENU_NAME, seconds != null ? seconds : 6);
  }
}

function chicagoNow_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

function todayKey_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function parseYmd_(s) {
  var t = String(s || '').trim();
  var m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]), key: m[1] + '-' + m[2] + '-' + m[3] };
  }
  if (s instanceof Date && !isNaN(s.getTime())) {
    var key = Utilities.formatDate(s, TZ, 'yyyy-MM-dd');
    return parseYmd_(key);
  }
  return null;
}

function ymdToDate_(y, mo, d) {
  return new Date(y, mo - 1, d);
}

function addDaysKey_(key, n) {
  var p = parseYmd_(key);
  var dt = ymdToDate_(p.y, p.mo, p.d);
  dt.setDate(dt.getDate() + n);
  return Utilities.formatDate(dt, TZ, 'yyyy-MM-dd');
}

function weekdayName_(key) {
  var p = parseYmd_(key);
  var names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return names[ymdToDate_(p.y, p.mo, p.d).getDay()];
}

/** Work is Mon–Sat. Other buckets use Settings days/week. */
function bucketDays_(name) {
  if (String(name || '').trim() === 'Work') {
    return 6;
  }
  return daysPerWeek_();
}

function bucketHitsDate_(name, dateKey) {
  if (String(name || '').trim() === 'Work' && weekdayName_(dateKey) === 'Sun') {
    return false;
  }
  return true;
}

function weekStartKey_(key) {
  var p = parseYmd_(key);
  var dt = ymdToDate_(p.y, p.mo, p.d);
  var day = dt.getDay();
  var diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return Utilities.formatDate(dt, TZ, 'yyyy-MM-dd');
}

function weekEndKey_(weekStart) {
  return addDaysKey_(weekStart, 6);
}

function keysInRange_(startKey, endKeyInclusive) {
  var out = [];
  var k = startKey;
  while (k <= endKeyInclusive) {
    out.push(k);
    k = addDaysKey_(k, 1);
  }
  return out;
}

function toBool_(v) {
  if (v === true || v === false) {
    return v;
  }
  var t = String(v || '').trim().toUpperCase();
  return t === 'TRUE' || t === '1' || t === 'YES' || t === 'Y';
}

function toHours_(v) {
  if (v == null || v === '') {
    return 0;
  }
  var n = Number(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function roundHours_(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function hexColor_(s) {
  var t = String(s || '').replace(/^#/, '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(t)) {
    return t.toLowerCase();
  }
  return '94a3b8';
}

function setTabColor_(sh, hex) {
  try {
    sh.setTabColor('#' + hexColor_(hex));
  } catch (ignore) {}
}

function ensureSheet_(name) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  return sh;
}

function writeHeader_(sh, headers) {
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#1e293b')
    .setFontColor('#f8fafc');
  sh.setFrozenRows(1);
}

function clearBelow_(sh, startRow) {
  var last = sh.getMaxRows();
  if (last >= startRow) {
    sh.getRange(startRow, 1, last - startRow + 1, sh.getMaxColumns()).clearContent();
  }
}

function dataRows_(sh, cols) {
  var last = sh.getLastRow();
  if (last < 2) {
    return [];
  }
  return sh.getRange(2, 1, last - 1, cols).getValues();
}

function trimSheet_(sh, keepRows, keepCols) {
  var maxR = sh.getMaxRows();
  var maxC = sh.getMaxColumns();
  if (maxC > keepCols) {
    sh.deleteColumns(keepCols + 1, maxC - keepCols);
  }
  if (maxR > keepRows) {
    sh.deleteRows(keepRows + 1, maxR - keepRows);
  }
  while (sh.getMaxRows() < keepRows) {
    sh.insertRowsAfter(sh.getMaxRows(), keepRows - sh.getMaxRows());
  }
  while (sh.getMaxColumns() < keepCols) {
    sh.insertColumnsAfter(sh.getMaxColumns(), keepCols - sh.getMaxColumns());
  }
}

function checkboxCol_(sh, col, startRow, endRow) {
  sh.getRange(startRow, col, endRow - startRow + 1, 1).insertCheckboxes();
}

function protectSheet_(sh) {
  var protections = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  var i;
  for (i = 0; i < protections.length; i++) {
    protections[i].remove();
  }
  var p = sh.protect().setDescription('Timelord writes this tab');
  p.setWarningOnly(true);
}

function newId_() {
  return 'tl_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function bucketColor_(name, buckets) {
  var n = String(name || '');
  if (n === 'Personal') {
    return PERSONAL_COLOR;
  }
  if (n === 'Buffer') {
    return BUFFER_COLOR;
  }
  if (n === 'Busy') {
    return BUSY_COLOR;
  }
  var i;
  for (i = 0; i < buckets.length; i++) {
    if (buckets[i].name === n) {
      return buckets[i].color;
    }
  }
  return '94a3b8';
}

function displayRank_(bucket, slot) {
  if (bucket === 'Personal') {
    var k = 'Personal|' + String(slot || 'morning');
    return DISPLAY_RANK[k] || 15;
  }
  if (bucket === 'Projects' && String(slot || '') === 'evening') {
    return 100;
  }
  if (DISPLAY_RANK[bucket] != null) {
    return DISPLAY_RANK[bucket];
  }
  return 80;
}
