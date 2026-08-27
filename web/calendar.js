(function () {
  var TZ = "America/Chicago";
  var cfg = window.TIMELORD_CONFIG || {};
  var root = document.getElementById("cal-root");
  var stamp = document.getElementById("range-stamp");
  var viewStart = null;

  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function csvUrl(gid) {
    return (
      "https://docs.google.com/spreadsheets/d/" +
      encodeURIComponent(cfg.spreadsheet_id) +
      "/gviz/tq?tqx=out:csv&gid=" +
      encodeURIComponent(gid) +
      "&_=" +
      Date.now()
    );
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cell = "";
    var i = 0;
    var inQuotes = false;
    var s = String(text || "").replace(/^\uFEFF/, "");
    while (i < s.length) {
      var c = s.charAt(i);
      if (inQuotes) {
        if (c === '"') {
          if (s.charAt(i + 1) === '"') {
            cell += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        cell += c;
        i++;
        continue;
      }
      if (c === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (c === ",") {
        row.push(cell);
        cell = "";
        i++;
        continue;
      }
      if (c === "\r") {
        i++;
        continue;
      }
      if (c === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        i++;
        continue;
      }
      cell += c;
      i++;
    }
    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  function fetchCsv(gid) {
    return fetch(csvUrl(gid), { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text().then(parseCsv);
    });
  }

  function chicagoParts(ms) {
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short"
    });
    var map = {};
    fmt.formatToParts(new Date(ms)).forEach(function (p) {
      if (p.type !== "literal") map[p.type] = p.value;
    });
    return map;
  }

  function todayKey() {
    var p = chicagoParts(Date.now());
    return p.year + "-" + p.month + "-" + p.day;
  }

  function addDaysKey(key, n) {
    var p = key.split("-");
    var dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
    return dt.toISOString().slice(0, 10);
  }

  function weekStartKey(key) {
    var p = key.split("-");
    var dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
    var day = dt.getUTCDay();
    var diff = day === 0 ? -6 : 1 - day;
    dt.setUTCDate(dt.getUTCDate() + diff);
    return dt.toISOString().slice(0, 10);
  }

  function num(v) {
    var n = Number(String(v || "").replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  }

  function fmtDuration(hours) {
    var mins = Math.round(Number(hours) * 60);
    if (isNaN(mins) || !mins) return "";
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    if (h && m) return h + "h " + m + "m";
    if (h) return h + "h";
    return m + "m";
  }

  function parsePlan(rows) {
    var out = [];
    var i;
    for (i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !String(r[0] || "").trim()) continue;
      out.push({
        date: String(r[1] || "").trim().slice(0, 10),
        bucket: String(r[2] || "").trim(),
        title: String(r[3] || "").trim(),
        hours: num(r[4]),
        status: String(r[6] || "").trim(),
        source: String(r[7] || "").trim(),
        color: String(r[10] || "94a3b8").replace(/^#/, ""),
        sort: num(r[11])
      });
    }
    return out;
  }

  function parseSummary(rows) {
    var out = [];
    var i;
    for (i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r || String(r[0] || "").trim() !== "overflow") continue;
      out.push({
        date: String(r[1] || "").trim().slice(0, 10),
        bucket: String(r[2] || "").trim(),
        title: String(r[3] || "").trim(),
        hours: num(r[4]),
        color: String(r[6] || "64748b").replace(/^#/, "")
      });
    }
    return out;
  }

  function heading(key) {
    var p = key.split("-");
    var dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  }

  function byDay(items) {
    var map = {};
    items.forEach(function (it) {
      if (!map[it.date]) map[it.date] = [];
      map[it.date].push(it);
    });
    return map;
  }

  function render(plan, overflow, startKey) {
    var endKey = addDaysKey(startKey, 20);
    stamp.textContent = heading(startKey) + " – " + heading(endKey);
    var packed = byDay(
      plan.filter(function (p) {
        return p.source !== "buffer" && p.bucket !== "Buffer";
      })
    );
    var over = byDay(overflow);
    var listHtml = "";
    var d;
    for (d = 0; d < 21; d++) {
      var key = addDaysKey(startKey, d);
      var items = (packed[key] || []).slice().sort(function (a, b) {
        return a.sort - b.sort;
      });
      if (!items.length && !(over[key] || []).length) continue;
      listHtml += '<div class="cal-day-h">' + esc(heading(key)) + (key === todayKey() ? " · today" : "") + "</div>";
      items.forEach(function (it) {
        listHtml +=
          '<div class="cal-chip" style="--bcolor:#' +
          esc(it.color) +
          '">' +
          esc(it.bucket) +
          " · " +
          esc(it.title) +
          (fmtDuration(it.hours) ? " · " + fmtDuration(it.hours) : "") +
          "</div>";
      });
      (over[key] || []).forEach(function (it) {
        listHtml +=
          '<div class="cal-chip overflow" style="--bcolor:#' +
          esc(it.color) +
          '">off · ' +
          esc(it.bucket) +
          " · " +
          esc(it.title) +
          "</div>";
      });
    }

    var weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    var head = weekdays.map(function (w) {
      return "<div>" + w + "</div>";
    }).join("");
    var cells = "";
    for (d = 0; d < 21; d++) {
      var k = addDaysKey(startKey, d);
      var dayItems = (packed[k] || []).slice().sort(function (a, b) {
        return a.sort - b.sort;
      });
      var chips = dayItems
        .slice(0, 6)
        .map(function (it) {
          return (
            '<div class="cal-chip" style="--bcolor:#' +
            esc(it.color) +
            '">' +
            esc(it.title) +
            (fmtDuration(it.hours) ? " · " + fmtDuration(it.hours) : "") +
            "</div>"
          );
        })
        .join("");
      (over[k] || []).slice(0, 2).forEach(function (it) {
        chips +=
          '<div class="cal-chip overflow" style="--bcolor:#' +
          esc(it.color) +
          '">' +
          esc(it.title) +
          (fmtDuration(it.hours) ? " · " + fmtDuration(it.hours) : "") +
          "</div>";
      });
      var num = k.slice(8);
      cells +=
        '<div class="cal-cell' +
        (k === todayKey() ? " is-today" : "") +
        '"><div class="cal-cell-num">' +
        num +
        "</div>" +
        chips +
        "</div>";
    }

    root.innerHTML =
      '<div class="cal-layout"><div class="cal-list">' +
      (listHtml || '<p style="color:var(--muted)">No packed days in this window.</p>') +
      '</div><div class="cal-board"><div class="cal-weekdays">' +
      head +
      '</div><div class="cal-weeks">' +
      cells +
      "</div></div></div>";
  }

  function load() {
    if (!viewStart) viewStart = weekStartKey(todayKey());
    if (!cfg.spreadsheet_id) {
      root.innerHTML = "<p class=\"err\">Missing spreadsheet_id in config.js</p>";
      return;
    }
    Promise.all([fetchCsv(cfg.plan_gid), fetchCsv(cfg.summary_gid)])
      .then(function (parts) {
        render(parsePlan(parts[0]), parseSummary(parts[1]), viewStart);
      })
      .catch(function (e) {
        root.innerHTML = '<p class="err">' + esc(e.message || e) + "</p>";
      });
  }

  document.getElementById("btn-refresh").onclick = load;
  document.getElementById("btn-this-week").onclick = function () {
    viewStart = weekStartKey(todayKey());
    load();
  };
  document.getElementById("btn-next").onclick = function () {
    viewStart = addDaysKey(viewStart || weekStartKey(todayKey()), 21);
    load();
  };
  load();
})();
