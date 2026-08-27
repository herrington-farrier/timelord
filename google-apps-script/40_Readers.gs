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

function readTemplates_() {
  var rows = dataRows_(sheet_(SHEET.TEMPLATES), 8);
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var title = String(rows[i][1] || '').trim();
    var bucket = String(rows[i][0] || '').trim();
    if (!title || !bucket) {
      continue;
    }
    out.push({
      row: i + 2,
      bucket: bucket,
      title: title,
      hours: toHours_(rows[i][2]),
      cadence: String(rows[i][3] || 'daily').trim() || 'daily',
      slot: String(rows[i][4] || 'morning').trim() || 'morning',
      options: String(rows[i][5] || '').trim(),
      active: toBool_(rows[i][6] === '' ? true : rows[i][6]),
      thisWeek: toBool_(rows[i][7] === '' ? true : rows[i][7])
    });
  }
  return out;
}

function readTasks_() {
  var rows = dataRows_(sheet_(SHEET.TASKS), 6);
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var name = String(rows[i][0] || '').trim();
    if (!name) {
      continue;
    }
    var due = parseYmd_(rows[i][2]);
    out.push({
      row: i + 2,
      title: name,
      hours: toHours_(rows[i][1]),
      due: due ? due.key : '',
      bucket: String(rows[i][3] || '').trim(),
      thisWeek: toBool_(rows[i][4]),
      active: toBool_(rows[i][5] === '' ? true : rows[i][5])
    });
  }
  return out;
}

function readWork_() {
  var rows = dataRows_(sheet_(SHEET.WORK), 2);
  var out = { weekStart: '', theme: '', dailyHours: 3, highlights: [] };
  var i;
  for (i = 0; i < rows.length; i++) {
    var field = String(rows[i][0] || '').trim().toLowerCase();
    var val = rows[i][1];
    if (field === 'week start') {
      var p = parseYmd_(val);
      out.weekStart = p ? p.key : String(val || '');
    } else if (field === 'theme') {
      out.theme = String(val || '').trim();
    } else if (field === 'daily hours') {
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

function readProjects_() {
  var rows = dataRows_(sheet_(SHEET.PROJECTS), 3);
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var name = String(rows[i][0] || '').trim();
    if (!name) {
      continue;
    }
    out.push({
      row: i + 2,
      name: name,
      active: toBool_(rows[i][1] === '' ? true : rows[i][1]),
      hours: toHours_(rows[i][2]) || 1
    });
  }
  return out;
}

function firstActiveProject_(projects) {
  var i;
  for (i = 0; i < projects.length; i++) {
    if (projects[i].active) {
      return projects[i];
    }
  }
  return null;
}

function readFitness_() {
  var rows = dataRows_(sheet_(SHEET.FITNESS), 3);
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var day = String(rows[i][0] || '').trim();
    var session = String(rows[i][1] || '').trim();
    if (!day || !session) {
      continue;
    }
    out.push({
      row: i + 2,
      weekday: day.slice(0, 3),
      title: session,
      hours: toHours_(rows[i][2]) || 1
    });
  }
  return out;
}

function fitnessSessionForDay_(fitness, dateKey) {
  var wd = weekdayName_(dateKey);
  var i;
  for (i = 0; i < fitness.length; i++) {
    if (fitness[i].weekday === wd) {
      return fitness[i];
    }
  }
  return null;
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
  return [row.date, row.bucket, row.source, row.title].join('|');
}
