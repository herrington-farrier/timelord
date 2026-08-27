/**
 * Timelord — Google Calendar → Busy tab.
 */

function syncCalendarBusy() {
  var n = syncBusyQuiet_();
  toast_('Synced ' + n + ' calendar blocks into Busy.', 6);
  return n;
}

function syncBusyQuiet_() {
  var map = readSettingsMap_();
  var tz = String(map[SETTINGS_KEYS.TIMEZONE] || TZ);
  var startKey = todayKey_();
  var endKey = addDaysKey_(startKey, 21);
  var start = parseYmd_(startKey);
  var end = parseYmd_(endKey);
  var startDate = new Date(start.y, start.mo - 1, start.d, 0, 0, 0);
  var endDate = new Date(end.y, end.mo - 1, end.d, 23, 59, 59);
  var events;
  try {
    events = CalendarApp.getDefaultCalendar().getEvents(startDate, endDate);
  } catch (err) {
    throw new Error('Calendar access failed. Authorize CalendarApp, then try again. ' + err);
  }
  var rows = [];
  var i;
  for (i = 0; i < events.length; i++) {
    var ev = events[i];
    if (ev.isAllDayEvent && ev.isAllDayEvent()) {
      var allDayStart = ev.getAllDayStartDate ? ev.getAllDayStartDate() : ev.getStartTime();
      var key = Utilities.formatDate(allDayStart, tz, 'yyyy-MM-dd');
      rows.push([key, '', '', ev.getTitle() || 'Busy', 0]);
      continue;
    }
    var st = ev.getStartTime();
    var en = ev.getEndTime();
    var dateKey = Utilities.formatDate(st, tz, 'yyyy-MM-dd');
    var hours = (en.getTime() - st.getTime()) / 3600000;
    if (hours <= 0) {
      continue;
    }
    rows.push([
      dateKey,
      Utilities.formatDate(st, tz, 'HH:mm'),
      Utilities.formatDate(en, tz, 'HH:mm'),
      ev.getTitle() || 'Busy',
      roundHours_(hours)
    ]);
  }
  var sh = sheet_(SHEET.BUSY);
  var last = Math.max(sh.getLastRow(), 1);
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, HEADERS.BUSY.length).clearContent();
  }
  if (rows.length) {
    sh.getRange(2, 1, rows.length, HEADERS.BUSY.length).setValues(rows);
  }
  return rows.length;
}
