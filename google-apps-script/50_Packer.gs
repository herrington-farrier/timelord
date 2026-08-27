/**
 * Timelord — day packer: Personal + Busy first, buffers, then buckets by weight.
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
  var templates = readTemplates_();
  var tasks = readTasks_();
  var work = readWork_();
  var projects = readProjects_();
  var fitness = readFitness_();
  var busy = readBusy_();
  var prev = preserveStatuses ? indexPlan_(readPlanRows_()) : {};

  var days = keysInRange_(startKey, endKey);
  var weeklyUsed = {};
  var planRows = [];
  var overflowRows = [];
  var headerRows = [];
  var d;

  for (d = 0; d < days.length; d++) {
    var dateKey = days[d];
    var weekStart = weekStartKey_(dateKey);
    if (!weeklyUsed[weekStart]) {
      weeklyUsed[weekStart] = {};
      var bi;
      for (bi = 0; bi < buckets.length; bi++) {
        weeklyUsed[weekStart][buckets[bi].name] = 0;
      }
    }
    var packed = packOneDay_({
      dateKey: dateKey,
      dayHours: dayHours,
      bufferHours: bufferHours,
      buckets: buckets,
      personal: personal,
      templates: templates,
      tasks: tasks,
      work: work,
      projects: projects,
      fitness: fitness,
      busy: busy,
      weeklyUsed: weeklyUsed[weekStart],
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
        'day ' +
        dayHours +
        'h · personal ' +
        packed.stats.personal +
        'h · busy ' +
        packed.stats.busy +
        'h · buffers ' +
        packed.stats.buffers +
        'h · packed ' +
        packed.stats.packed +
        'h · left ' +
        packed.stats.remaining +
        'h · overflow ' +
        packed.stats.overflow +
        'h',
      hours: packed.stats.remaining,
      reason: '',
      color: '334155'
    });
  }

  writePlan_(planRows);
  writeSummary_(headerRows, overflowRows, buckets, weeklyUsed, startKey);
  setSetting_(SETTINGS_KEYS.LAST_PACKED, chicagoNow_());
  refreshBudgetNumbers_();
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
    var chosen = prevRow && prevRow.chosen ? prevRow.chosen : raw.chosen || '';
    var row = {
      id: prevRow && prevRow.id ? prevRow.id : newId_(),
      date: dateKey,
      bucket: raw.bucket,
      title: raw.title,
      hours: roundHours_(raw.hours),
      slot: raw.slot,
      status: status,
      source: raw.source,
      options: raw.options || '',
      chosen: chosen,
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

  var candidatesByBucket = collectCandidates_(ctx, dateKey);
  var bi;
  for (bi = 0; bi < ctx.buckets.length; bi++) {
    var bucket = ctx.buckets[bi];
    var cands = candidatesByBucket[bucket.name] || [];
    if (!cands.length) {
      continue;
    }
    var need = 0;
    var ci;
    for (ci = 0; ci < cands.length; ci++) {
      need += cands[ci].hours;
    }
    need = roundHours_(need);
    var weekLeft = roundHours_(bucket.weekly - (ctx.weeklyUsed[bucket.name] || 0));
    var buffersForBucket = roundHours_(cands.length * ctx.bufferHours);
    var dayCost = roundHours_(need + buffersForBucket);
    var reason = '';
    if (need > weekLeft + 1e-9) {
      reason = 'over weekly budget';
    } else if (dayCost > remaining + 1e-9) {
      reason = remaining <= 0 ? 'day full' : 'bucket over day';
    }
    if (reason) {
      for (ci = 0; ci < cands.length; ci++) {
        overflow.push({
          kind: 'overflow',
          date: dateKey,
          bucket: bucket.name,
          title: cands[ci].title,
          hours: cands[ci].hours,
          reason: reason,
          color: bucket.color
        });
        stats.overflow = roundHours_(stats.overflow + cands[ci].hours);
      }
      continue;
    }
    for (ci = 0; ci < cands.length; ci++) {
      var c = cands[ci];
      pushItem({
        bucket: bucket.name,
        title: c.title,
        hours: c.hours,
        slot: c.slot || bucket.slot,
        source: c.source,
        options: c.options || '',
        chosen: c.chosen || '',
        color: bucket.color,
        sort: displayRank_(bucket.name, c.slot || bucket.slot),
        countsWeek: true
      });
      ctx.weeklyUsed[bucket.name] = roundHours_((ctx.weeklyUsed[bucket.name] || 0) + c.hours);
      remaining = roundHours_(remaining - c.hours);
      stats.packed = roundHours_(stats.packed + c.hours);
    }
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

function collectCandidates_(ctx, dateKey) {
  var lists = {};
  var i;
  for (i = 0; i < ctx.buckets.length; i++) {
    lists[ctx.buckets[i].name] = [];
  }

  function pushTitle(bucket, title) {
    var t = String(title || '').trim();
    if (!t || !lists[bucket]) {
      return;
    }
    if (lists[bucket].indexOf(t) === -1) {
      lists[bucket].push(t);
    }
  }

  for (i = 0; i < ctx.templates.length; i++) {
    var tpl = ctx.templates[i];
    if (!tpl.active || !tpl.thisWeek) {
      continue;
    }
    pushTitle(tpl.bucket, tpl.title);
  }
  for (i = 0; i < ctx.tasks.length; i++) {
    var task = ctx.tasks[i];
    if (!task.active) {
      continue;
    }
    pushTitle(task.bucket, task.title);
  }
  if (ctx.work && ctx.work.highlights) {
    for (i = 0; i < ctx.work.highlights.length; i++) {
      pushTitle('Work', ctx.work.highlights[i]);
    }
  }
  for (i = 0; i < ctx.fitness.length; i++) {
    pushTitle('Fitness', ctx.fitness[i].title);
  }
  for (i = 0; i < ctx.projects.length; i++) {
    if (ctx.projects[i].active) {
      pushTitle('Projects', ctx.projects[i].name);
    }
  }

  var by = {};
  var today = todayKey_();
  for (i = 0; i < ctx.buckets.length; i++) {
    var bucket = ctx.buckets[i];
    if (bucket.daily <= 0 || !bucketHitsDate_(bucket.name, dateKey)) {
      by[bucket.name] = [];
      continue;
    }
    var titles = (lists[bucket.name] || []).slice();
    var scheduled = scheduledTitlesForBucket_(ctx.tasks, bucket.name, dateKey, today);
    var cadence = rotatingCadenceTitles_(ctx.templates, bucket.name, dateKey);
    var chosen = scheduled[0] || cadence[0] || getChosen_(bucket.name);
    if (!chosen) {
      if (bucket.name === 'Fitness') {
        var sess = fitnessSessionForDay_(ctx.fitness, dateKey);
        if (sess) {
          chosen = sess.title;
        }
      } else if (bucket.name === 'Projects') {
        var proj = firstActiveProject_(ctx.projects);
        if (proj) {
          chosen = proj.name;
        }
      }
    }
    var extra = scheduled.concat(cadence);
    var merged = [];
    var t;
    function pushMerged(title) {
      if (title && merged.indexOf(title) === -1) {
        merged.push(title);
      }
    }
    pushMerged(chosen);
    for (t = 0; t < extra.length; t++) {
      pushMerged(extra[t]);
    }
    for (t = 0; t < titles.length; t++) {
      pushMerged(titles[t]);
    }
    by[bucket.name] = [
      {
        title: chosen || bucket.name,
        hours: bucket.daily,
        slot: bucket.slot,
        source: 'bucket',
        options: merged.join('; '),
        chosen: chosen || '',
        scheduled: scheduled.length > 0 || cadence.length > 0
      }
    ];
  }
  return by;
}

function scheduledTitlesForBucket_(tasks, bucket, dateKey, today) {
  var due = [];
  var overdue = [];
  var i;
  for (i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    if (!task.active || task.bucket !== bucket || !task.due) {
      continue;
    }
    if (task.due === dateKey) {
      due.push(task.title);
    } else if (task.due < dateKey && dateKey === today) {
      overdue.push(task.title);
    }
  }
  return due.length ? due : overdue;
}

function rotatingCadenceTitles_(templates, bucket, dateKey) {
  var hits = [];
  var i;
  var best = 99;
  for (i = 0; i < templates.length; i++) {
    var tpl = templates[i];
    if (!tpl.active || !tpl.thisWeek || tpl.bucket !== bucket) {
      continue;
    }
    if (!cadenceHitsDate_(tpl.cadence, dateKey)) {
      continue;
    }
    var rank = cadenceRank_(tpl.cadence);
    if (rank < best) {
      best = rank;
    }
    hits.push({ title: tpl.title, rank: rank });
  }
  var titles = [];
  for (i = 0; i < hits.length; i++) {
    if (hits[i].rank !== best) {
      continue;
    }
    if (titles.indexOf(hits[i].title) === -1) {
      titles.push(hits[i].title);
    }
  }
  if (titles.length <= 1) {
    return titles;
  }
  var p = parseYmd_(dateKey);
  var epoch = ymdToDate_(2026, 1, 1);
  var dt = ymdToDate_(p.y, p.mo, p.d);
  var diff = Math.round((dt.getTime() - epoch.getTime()) / 86400000);
  var pick = ((diff % titles.length) + titles.length) % titles.length;
  return titles.slice(pick).concat(titles.slice(0, pick));
}

function cadenceRank_(cadence) {
  var c = String(cadence || 'daily').trim().toLowerCase();
  if (c.indexOf('weekly:') === 0 || c === 'eod' || c.indexOf('every_') === 0) {
    return 0;
  }
  if (c === 'weekdays' || c === 'weekends') {
    return 1;
  }
  if (c === 'daily') {
    return 2;
  }
  return 1;
}

function bucketHasScheduledTask_(bucket, dateKey) {
  if (scheduledTitlesForBucket_(readTasks_(), bucket, dateKey, todayKey_()).length) {
    return true;
  }
  return rotatingCadenceTitles_(readTemplates_(), bucket, dateKey).length > 0;
}

function slotForBucket_(buckets, name) {
  var i;
  for (i = 0; i < buckets.length; i++) {
    if (buckets[i].name === name) {
      return buckets[i].slot;
    }
  }
  return 'midday';
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

function writeSummary_(headers, overflow, buckets, weeklyUsed, todayKey) {
  var sh = sheet_(SHEET.SUMMARY);
  var last = Math.max(sh.getLastRow(), 1);
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, HEADERS.SUMMARY.length).clearContent();
  }
  var values = [];
  var weekStart = weekStartKey_(todayKey);
  var weekEnd = weekEndKey_(weekStart);
  var used = weeklyUsed[weekStart] || {};
  var days = getSettingNum_(readSettingsMap_(), SETTINGS_KEYS.DAYS_PER_WEEK, 7) || 7;
  var i;
  values.push(['week', todayKey, '', 'This week ' + weekStart + ' → ' + weekEnd, '', '', '334155']);
  for (i = 0; i < buckets.length; i++) {
    var b = buckets[i];
    var u = used[b.name] || 0;
    values.push([
      'bucket-week',
      todayKey,
      b.name,
      'budget ' +
        b.weekly +
        'h/wk (' +
        roundHours_(b.weekly / days) +
        'h/day) · used ' +
        roundHours_(u) +
        'h · remaining ' +
        roundHours_(b.weekly - u) +
        'h',
      roundHours_(b.weekly - u),
      '',
      b.color
    ]);
  }
  for (i = 0; i < headers.length; i++) {
    var h = headers[i];
    if (h.date > addDaysKey_(todayKey, 6) && h.kind === 'totals') {
      continue;
    }
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
    return r.date === key || r.kind === 'bucket-week' || r.kind === 'week';
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
