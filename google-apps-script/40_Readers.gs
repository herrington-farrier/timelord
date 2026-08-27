/**
 * Timelord — read source tabs.
 */

function readPersonal_() {
  var rows = dataRows_(sheet_(SHEET.PERSONAL), 5);
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var title = String(rows[i][0] || '').trim();
    if (!title) {
      continue;
    }
    out.push({
      row: i + 2,
      title: title,
      hours: toHours_(rows[i][1]),
      slot: String(rows[i][2] || 'morning').trim() || 'morning',
      cadence: String(rows[i][3] || 'daily').trim() || 'daily',
      active: toBool_(rows[i][4] === '' ? true : rows[i][4])
    });
  }
  return out;
}

function normalizeKind_(v) {
  var k = String(v || '').trim().toLowerCase();
  if (k === ITEM_KIND.HOURLY) {
    return ITEM_KIND.HOURLY;
  }
  return ITEM_KIND.RECURRING;
}

function readItems_() {
  ensureItemsReady_();
  var rows = dataRows_(sheet_(SHEET.ITEMS), 9);
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var title = String(rows[i][1] || '').trim();
    var bucket = String(rows[i][0] || '').trim();
    if (!title || !bucket) {
      continue;
    }
    var due = parseYmd_(rows[i][5]);
    out.push({
      row: i + 2,
      bucket: bucket,
      title: title,
      hours: toHours_(rows[i][2]),
      kind: normalizeKind_(rows[i][3]),
      cadence: String(rows[i][4] || '').trim(),
      due: due ? due.key : '',
      current: toBool_(rows[i][6]),
      active: toBool_(rows[i][7] === '' ? true : rows[i][7]),
      slot: String(rows[i][8] || '').trim() || slotForName_(bucket)
    });
  }
  return out;
}

function ensureItemsReady_() {
  var sh = ss_().getSheetByName(SHEET.ITEMS);
  if (!sh) {
    setupItems_(ss_());
  }
  migrateItemsFromLegacy_();
}

function readBusy_() {
  var rows = dataRows_(sheet_(SHEET.BUSY), 5);
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var p = parseYmd_(rows[i][0]);
    var title = String(rows[i][3] || '').trim();
    if (!p || !title) {
      continue;
    }
    out.push({
      date: p.key,
      start: String(rows[i][1] || '').trim(),
      end: String(rows[i][2] || '').trim(),
      title: title,
      hours: toHours_(rows[i][4])
    });
  }
  return out;
}

function readPlanRows_() {
  var sh = ss_().getSheetByName(SHEET.PLAN);
  if (!sh) {
    return [];
  }
  var rows = dataRows_(sh, 13);
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var id = String(rows[i][0] || '').trim();
    var p = parseYmd_(rows[i][1]);
    if (!id || !p) {
      continue;
    }
    out.push({
      row: i + 2,
      id: id,
      date: p.key,
      bucket: String(rows[i][2] || '').trim(),
      title: String(rows[i][3] || '').trim(),
      hours: toHours_(rows[i][4]),
      slot: String(rows[i][5] || '').trim(),
      status: String(rows[i][6] || 'pending').trim() || 'pending',
      source: String(rows[i][7] || '').trim(),
      options: String(rows[i][8] || '').trim(),
      chosen: String(rows[i][9] || '').trim(),
      color: hexColor_(rows[i][10]),
      sort: Number(rows[i][11]) || 0,
      countsWeek: toBool_(rows[i][12])
    });
  }
  return out;
}

function planMatchKey_(row) {
  if (row.bucket === 'Buffer' || row.source === 'buffer') {
    return [row.date, 'Buffer', row.title].join('|');
  }
  if (row.source === 'personal' || row.source === 'busy') {
    return [row.date, row.bucket, row.source, row.title].join('|');
  }
  return [row.date, row.bucket, row.title].join('|');
}
