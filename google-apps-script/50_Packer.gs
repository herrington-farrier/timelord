/**
 * Timelord — day packer: Personal + Busy first, then each hitting item.
 */

function rebuildToday() {
  var start = todayKey_();
  packRange_(start, addDaysKey_(start, 20), true);
  toast_('Rebuilt today and the next 3 weeks.', 6);
  return getTodayPayload_(start);
}

function midnightPack_() {
  try {
    syncBusyQuiet_();
  } catch (ignore) {}
  var start = todayKey_();
  packRange_(start, addDaysKey_(start, 20), false);
}

function packRange_(startKey, endKey, preserveStatuses) {
  var nums = refreshBudgetNumbers_();
  var dayHours = nums.dayHours;
  var bufferHours = (nums.bufferMinutes || 15) / 60;
  var buckets = nums.buckets;
  var personal = readPersonal_();
  var lifeItems = readItems_();
  var busy = readBusy_();
  var prev = preserveStatuses ? indexPlan_(readPlanRows_()) : {};

  var days = keysInRange_(startKey, endKey);
  var planRows = [];
  var overflowRows = [];
  var headerRows = [];
  var d;

  for (d = 0; d < days.length; d++) {
    var dateKey = days[d];
    var packed = packOneDay_({
      dateKey: dateKey,
      dayHours: dayHours,
      bufferHours: bufferHours,
      buckets: buckets,
      personal: personal,
      items: lifeItems,
      busy: busy,
      prev: prev
    });
    var i;
    for (i = 0; i < packed.items.length; i++) {
      planRows.push(packed.items[i]);
    }
    for (i = 0; i < packed.overflow.length; i++) {
      overflowRows.push(packed.overflow[i]);
    }
    headerRows.push({
      kind: 'totals',
      date: dateKey,
      bucket: '',
      title:
        fmtDuration_(dayHours) +
        ' day · packed ' +
        fmtDuration_(packed.stats.packed) +
        ' · left ' +
        fmtDuration_(packed.stats.remaining) +
        ' · overflow ' +
        fmtDuration_(packed.stats.overflow),
      hours: packed.stats.remaining,
      reason: '',
      color: '334155'
    });
  }

  writePlan_(planRows);
  writeSummary_(headerRows, overflowRows, startKey);
  setSetting_(SETTINGS_KEYS.LAST_PACKED, chicagoNow_());
}

function indexPlan_(rows) {
  var map = {};
  var i;
  for (i = 0; i < rows.length; i++) {
    map[planMatchKey_(rows[i])] = rows[i];
  }
  return map;
}

function packOneDay_(ctx) {
  var dateKey = ctx.dateKey;
  var remaining = ctx.dayHours;
  var items = [];
  var overflow = [];
  var stats = { personal: 0, busy: 0, buffers: 0, packed: 0, overflow: 0, remaining: 0 };

  function pushItem(raw) {
    var prevRow = ctx.prev[planMatchKey_(raw)];
    var status = prevRow && prevRow.status ? prevRow.status : 'pending';
    var row = {
      id: prevRow && prevRow.id ? prevRow.id : newId_(),
      date: dateKey,
      bucket: raw.bucket,
      title: raw.title,
      hours: roundHours_(raw.hours),
      slot: raw.slot,
      status: status,
      source: raw.source,
      options: '',
      chosen: raw.title,
      color: raw.color,
      sort: raw.sort,
      countsWeek: !!raw.countsWeek
    };
    items.push(row);
    return row;
  }

  var p;
  for (p = 0; p < ctx.personal.length; p++) {
    var per = ctx.personal[p];
    if (!per.active || per.hours <= 0) {
      continue;
    }
    if (!cadenceHitsDate_(per.cadence, dateKey)) {
      continue;
    }
    remaining -= per.hours;
    stats.personal = roundHours_(stats.personal + per.hours);
    pushItem({
      bucket: 'Personal',
      title: per.title,
      hours: per.hours,
      slot: per.slot,
      source: 'personal',
      color: PERSONAL_COLOR,
      sort: displayRank_('Personal', per.slot),
      countsWeek: false
    });
  }

  var b;
  for (b = 0; b < ctx.busy.length; b++) {
    var ev = ctx.busy[b];
    if (ev.date !== dateKey || ev.hours <= 0) {
      continue;
    }
    remaining -= ev.hours;
    stats.busy = roundHours_(stats.busy + ev.hours);
    var slot = busySlot_(ev.start);
    pushItem({
      bucket: 'Busy',
      title: ev.title + (ev.start ? ' · ' + ev.start : ''),
      hours: ev.hours,
      slot: slot,
      source: 'busy',
      color: BUSY_COLOR,
      sort: displayRank_('Busy', slot) + (SLOT_RANK[slot] || 2) * 0.01,
      countsWeek: false
    });
  }

  remaining = Math.max(0, roundHours_(remaining));

  var cands = collectHittingItems_(ctx.items, ctx.buckets, dateKey);
  var ci;
  for (ci = 0; ci < cands.length; ci++) {
    var c = cands[ci];
    var dayCost = roundHours_(c.hours + ctx.bufferHours);
    if (dayCost > remaining + 1e-9) {
      overflow.push({
        kind: 'overflow',
        date: dateKey,
        bucket: c.bucket,
        title: c.title,
        hours: c.hours,
        reason: remaining <= 0 ? 'day full' : 'does not fit',
        color: c.color
      });
      stats.overflow = roundHours_(stats.overflow + c.hours);
      continue;
    }
    pushItem({
      bucket: c.bucket,
      title: c.title,
      hours: c.hours,
      slot: c.slot,
      source: c.source,
      color: c.color,
      sort: displayRank_(c.bucket, c.slot),
      countsWeek: true
    });
    remaining = roundHours_(remaining - c.hours);
    stats.packed = roundHours_(stats.packed + c.hours);
  }

  items.sort(function (a, b) {
    if (a.sort !== b.sort) {
      return a.sort - b.sort;
    }
    return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
  });

  var withBuffers = [];
  var i;
  for (i = 0; i < items.length; i++) {
    withBuffers.push(items[i]);
    if (i < items.length - 1) {
      remaining = roundHours_(remaining - ctx.bufferHours);
      stats.buffers = roundHours_(stats.buffers + ctx.bufferHours);
      withBuffers.push({
        id: newId_(),
        date: dateKey,
        bucket: 'Buffer',
        title: Math.round(ctx.bufferHours * 60) + 'm',
        hours: ctx.bufferHours,
        slot: items[i].slot,
        status: 'pending',
        source: 'buffer',
        options: '',
        chosen: '',
        color: BUFFER_COLOR,
        sort: items[i].sort + 0.001,
        countsWeek: false
      });
    }
  }

  stats.remaining = roundHours_(Math.max(0, remaining));
  return { items: withBuffers, overflow: overflow, stats: stats };
}

function busySlot_(start) {
  var m = String(start || '').match(/(\d{1,2})/);
  if (!m) {
    return 'midday';
  }
  var h = Number(m[1]);
  if (h < 12) {
    return 'morning';
  }
  if (h < 17) {
    return 'midday';
  }
  return 'evening';
}

function collectHittingItems_(lifeItems, buckets, dateKey) {
  var today = todayKey_();
  var color = {};
  var defaultSlot = {};
  var i;
  for (i = 0; i < buckets.length; i++) {
    color[buckets[i].name] = buckets[i].color;
    defaultSlot[buckets[i].name] = buckets[i].slot;
  }
  var out = [];
  for (i = 0; i < lifeItems.length; i++) {
    var it = lifeItems[i];
    if (!it.active || it.hours <= 0) {
      continue;
    }
    var hit = itemHitsDate_(it, dateKey, today);
    if (!hit) {
      continue;
    }
    out.push({
      bucket: it.bucket,
      title: it.title,
      hours: it.hours,
      slot: it.slot || defaultSlot[it.bucket] || 'midday',
      source: hit,
      color: color[it.bucket] || '94a3b8'
    });
  }
  out.sort(function (a, b) {
    var ra = displayRank_(a.bucket, a.slot);
    var rb = displayRank_(b.bucket, b.slot);
    if (ra !== rb) {
      return ra - rb;
    }
    return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
  });
  return out;
}

function itemHitsDate_(it, dateKey, today) {
  if (it.kind === ITEM_KIND.RECURRING) {
    return cadenceHitsDate_(it.cadence || 'daily', dateKey, it.start) ? 'recurring' : '';
  }
  if (it.due) {
    if (it.due === dateKey) {
      return 'due';
    }
    if (it.due < dateKey && dateKey === today) {
      return 'due';
    }
    return '';
  }
  if (!it.current) {
    return '';
  }
  var cadence = it.cadence || (it.bucket === 'Work' ? 'weekdays' : 'daily');
  return cadenceHitsDate_(cadence, dateKey, it.start) ? 'current' : '';
}

function writePlan_(rows) {
  var sh = sheet_(SHEET.PLAN);
  var last = Math.max(sh.getLastRow(), 1);
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, HEADERS.PLAN.length).clearContent();
  }
  if (!rows.length) {
    return;
  }
  var values = rows.map(function (r) {
    return [
      r.id,
      r.date,
      r.bucket,
      r.title,
      r.hours,
      r.slot,
      r.status,
      r.source,
      r.options,
      r.chosen,
      r.color,
      r.sort,
      r.countsWeek
    ];
  });
  sh.getRange(2, 1, values.length, HEADERS.PLAN.length).setValues(values);
  colorPlanRows_(sh, rows);
}

function colorPlanRows_(sh, rows) {
  var i;
  for (i = 0; i < rows.length; i++) {
    var bg = '#' + hexColor_(rows[i].color);
    try {
      sh.getRange(i + 2, 1, 1, HEADERS.PLAN.length).setBackground(bg);
    } catch (ignore) {}
  }
}

function writeSummary_(headers, overflow, todayKey) {
  var sh = sheet_(SHEET.SUMMARY);
  var last = Math.max(sh.getLastRow(), 1);
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, HEADERS.SUMMARY.length).clearContent();
  }
  var values = [];
  var i;
  for (i = 0; i < headers.length; i++) {
    var h = headers[i];
    values.push([h.kind, h.date, h.bucket, h.title, h.hours, h.reason, h.color]);
  }
  for (i = 0; i < overflow.length; i++) {
    var o = overflow[i];
    values.push([o.kind, o.date, o.bucket, o.title, o.hours, o.reason, o.color]);
  }
  if (values.length) {
    sh.getRange(2, 1, values.length, HEADERS.SUMMARY.length).setValues(values);
    for (i = 0; i < values.length; i++) {
      if (values[i][6]) {
        try {
          sh.getRange(i + 2, 1, 1, HEADERS.SUMMARY.length).setBackground('#' + hexColor_(values[i][6]));
        } catch (ignore) {}
      }
    }
  }
}

function getTodayPayload_(dateKey) {
  var key = dateKey || todayKey_();
  refreshBudgetNumbers_();
  var plan = readPlanRows_().filter(function (r) {
    return r.date === key;
  });
  plan.sort(function (a, b) {
    return a.sort - b.sort;
  });
  var summary = readSummaryRows_().filter(function (r) {
    return r.date === key;
  });
  return {
    date: key,
    settings: getSettingsView(),
    plan: plan,
    summary: summary
  };
}

function readSummaryRows_() {
  var sh = ss_().getSheetByName(SHEET.SUMMARY);
  if (!sh) {
    return [];
  }
  var rows = dataRows_(sh, 7);
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var kind = String(rows[i][0] || '').trim();
    if (!kind) {
      continue;
    }
    var p = parseYmd_(rows[i][1]);
    out.push({
      kind: kind,
      date: p ? p.key : String(rows[i][1] || ''),
      bucket: String(rows[i][2] || '').trim(),
      title: String(rows[i][3] || '').trim(),
      hours: toHours_(rows[i][4]),
      reason: String(rows[i][5] || '').trim(),
      color: hexColor_(rows[i][6])
    });
  }
  return out;
}
