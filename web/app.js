(function () {
  var TZ = "America/Chicago";
  var cfg = window.TIMELORD_CONFIG || {};
  var errEl = document.getElementById("err");
  var dayEl = document.getElementById("day");
  var fallEl = document.getElementById("fall");
  var budgetsEl = document.getElementById("budgets");
  var stampEl = document.getElementById("packed-stamp");
  var setupEl = document.getElementById("setup");
  var dailyTimer = null;
  var pollTimer = null;

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
      if (!res.ok) throw new Error("Could not load sheet gid=" + gid + " (" + res.status + ")");
      return res.text().then(parseCsv);
    });
  }

  function chicagoParts(ms) {
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false
    });
    var map = {};
    fmt.formatToParts(new Date(ms)).forEach(function (p) {
      if (p.type !== "literal") map[p.type] = p.value;
    });
    var hour = Number(map.hour === "24" ? "0" : map.hour);
    return { y: map.year, mo: map.month, d: map.day, hour: hour };
  }

  function todayKey() {
    var p = chicagoParts(Date.now());
    return p.y + "-" + p.mo + "-" + p.d;
  }

  function num(v) {
    var n = Number(String(v || "").replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  }

  function fmtHrs(n) {
    var x = Number(n);
    if (isNaN(x)) return "0";
    if (Math.abs(x - Math.round(x)) < 1e-6) return String(Math.round(x));
    return x.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  function parsePlan(rows) {
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !String(r[0] || "").trim()) continue;
      out.push({
        id: String(r[0] || "").trim(),
        date: String(r[1] || "").trim().slice(0, 10),
        bucket: String(r[2] || "").trim(),
        title: String(r[3] || "").trim(),
        hours: num(r[4]),
        slot: String(r[5] || "").trim(),
        status: String(r[6] || "pending").trim() || "pending",
        source: String(r[7] || "").trim(),
        options: String(r[8] || "").trim(),
        chosen: String(r[9] || "").trim(),
        color: String(r[10] || "94a3b8").replace(/^#/, ""),
        sort: num(r[11])
      });
    }
    out.sort(function (a, b) {
      return a.sort - b.sort;
    });
    return out;
  }

  function parseSummary(rows) {
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !String(r[0] || "").trim()) continue;
      out.push({
        kind: String(r[0] || "").trim(),
        date: String(r[1] || "").trim().slice(0, 10),
        bucket: String(r[2] || "").trim(),
        title: String(r[3] || "").trim(),
        hours: num(r[4]),
        reason: String(r[5] || "").trim(),
        color: String(r[6] || "f87171").replace(/^#/, "")
      });
    }
    return out;
  }

  function parseSettings(rows) {
    var meta = {};
    var buckets = [];
    var i;
    var inBuckets = false;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i] || [];
      var a = String(r[0] || "").trim();
      if (a === "Name" || (a === "Work" && r[2])) {
        if (a === "Name") {
          inBuckets = true;
          continue;
        }
        inBuckets = true;
      }
      if (!inBuckets) {
        if (a && a !== "Setting") meta[a] = r[1];
        continue;
      }
      if (!a || a === "Name") continue;
      var daily = num(r[4]);
      var weekly = num(r[5]);
      buckets.push({
        name: a,
        weight: num(r[1]),
        color: String(r[2] || "").replace(/^#/, ""),
        slot: String(r[3] || ""),
        daily: daily || (weekly ? weekly / 7 : 0),
        weekly: weekly,
        min: num(r[6]),
        marked: num(r[7]),
        remaining: num(r[8])
      });
    }
    return { meta: meta, buckets: buckets };
  }

  function jsonp(action, params) {
    params = params || {};
    var base = String(cfg.web_app_url || "").trim();
    if (!base) return Promise.reject(new Error("Web App URL is not set in config.js"));
    return new Promise(function (resolve, reject) {
      var cb = "tl_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
      var q = ["action=" + encodeURIComponent(action), "callback=" + cb];
      Object.keys(params).forEach(function (k) {
        if (params[k] == null || params[k] === "") return;
        q.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
      });
      var s = document.createElement("script");
      var timer = setTimeout(function () {
        cleanup();
        reject(new Error("Web App timed out"));
      }, 25000);
      function cleanup() {
        clearTimeout(timer);
        try {
          delete window[cb];
        } catch (ignore) {}
        if (s.parentNode) s.parentNode.removeChild(s);
      }
      window[cb] = function (data) {
        cleanup();
        resolve(data);
      };
      s.onerror = function () {
        cleanup();
        reject(new Error("Web App request failed"));
      };
      s.src = base + (base.indexOf("?") >= 0 ? "&" : "?") + q.join("&");
      document.body.appendChild(s);
    });
  }

  function setErr(msg) {
    errEl.textContent = msg || "";
  }

  function optionList(str) {
    return String(str || "")
      .split(/[;|]/)
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean);
  }

  function renderBudgets(settings) {
    var html = "";
    (settings.buckets || []).forEach(function (b) {
      html +=
        '<div class="budget" style="--bcolor:#' +
        esc(b.color) +
        '"><div class="budget-name">' +
        esc(b.name) +
        "</div><div class=\"budget-hrs\">" +
        fmtHrs(b.daily) +
        "h/day <span style=\"color:var(--muted);font-weight:500\">· " +
        fmtHrs(b.weekly) +
        "h/wk</span></div><div class=\"budget-hrs\" style=\"font-size:0.8rem;color:var(--muted)\">left " +
        fmtHrs(b.remaining) +
        "h this week</div><div class=\"budget-pick\"><button type=\"button\" data-bkt=\"" +
        esc(b.name) +
        '" data-d="-0.25">−</button><button type="button" data-bkt="' +
        esc(b.name) +
        '" data-d="0.25">+</button></div></div>';
    });
    budgetsEl.innerHTML = html;
    Array.prototype.forEach.call(budgetsEl.querySelectorAll("button[data-bkt]"), function (btn) {
      btn.onclick = function () {
        jsonp("bumpDailyHours", { bucket: btn.getAttribute("data-bkt"), delta: btn.getAttribute("data-d") })
          .then(function () {
            return load();
          })
          .catch(function (e) {
            setErr(e.message || String(e));
          });
      };
    });
  }

  function renderDay(plan, dateKey) {
    var html = "";
    plan
      .filter(function (r) {
        return r.date === dateKey;
      })
      .forEach(function (r) {
        if (r.bucket === "Buffer" || r.source === "buffer") {
          html += '<div class="buffer">' + esc(r.title) + "</div>";
          return;
        }
        var cls = r.status === "complete" ? " complete" : r.status === "skipped" ? " skipped" : "";
        var isLife = r.bucket === "Personal" || r.bucket === "Busy";
        html +=
          '<div class="item' +
          cls +
          '" style="--bcolor:#' +
          esc(r.color) +
          '"><div class="item-top"><div class="item-title">' +
          esc(r.title) +
          '</div><div class="item-hours">' +
          fmtHrs(r.hours) +
          "h</div></div><div class=\"item-meta\">" +
          esc(r.bucket) +
          (r.slot ? " · " + esc(r.slot) : "") +
          (r.status !== "pending" ? " · " + esc(r.status) : "") +
          "</div>";
        var opts = optionList(r.options);
        if (opts.length && r.status === "pending" && !isLife) {
          html += '<div class="task-picks">';
          opts.forEach(function (o) {
            html +=
              '<label class="check"><input type="checkbox" data-pick="' +
              esc(r.id) +
              '" data-bucket="' +
              esc(r.bucket) +
              '" value="' +
              esc(o) +
              '"' +
              (o === r.chosen ? " checked" : "") +
              " /> " +
              esc(o) +
              "</label>";
          });
          html += "</div>";
        }
        if (r.status === "pending") {
          html +=
            '<div class="item-acts"><button type="button" data-act="complete" data-id="' +
            esc(r.id) +
            '">Complete</button><button type="button" class="skip" data-act="skip" data-id="' +
            esc(r.id) +
            '">Skip</button>';
          if (!isLife) {
            html +=
              '<button type="button" class="skip" data-act="skipBucket" data-bucket="' +
              esc(r.bucket) +
              '">Skip bucket</button>';
          }
          html += "</div>";
        }
        html += "</div>";
      });
    dayEl.innerHTML = html || '<p class="err">No packed items for today. Tap Rebuild.</p>';
    Array.prototype.forEach.call(dayEl.querySelectorAll("[data-act]"), function (btn) {
      btn.onclick = function () {
        var act = btn.getAttribute("data-act");
        var params =
          act === "skipBucket"
            ? { bucket: btn.getAttribute("data-bucket"), date: dateKey }
            : { id: btn.getAttribute("data-id") };
        jsonp(act, params)
          .then(function (res) {
            if (res && res.ok === false) throw new Error(res.error || "Update failed");
            return load();
          })
          .catch(function (e) {
            setErr(e.message || String(e));
          });
      };
    });
    Array.prototype.forEach.call(dayEl.querySelectorAll("input[data-pick]"), function (box) {
      box.onchange = function () {
        var chosen = box.checked ? box.value : "";
        jsonp("pick", { id: box.getAttribute("data-pick"), chosen: chosen })
          .then(function (res) {
            if (res && res.ok === false) throw new Error(res.error || "Could not save pick");
            return load();
          })
          .catch(function (e) {
            setErr(e.message || String(e));
          });
      };
    });
  }

  function renderFall(summary, dateKey) {
    var rows = summary.filter(function (s) {
      return s.kind === "overflow" && s.date === dateKey;
    });
    if (!rows.length) {
      fallEl.innerHTML = '<p style="color:var(--muted)">Nothing falling off today.</p>';
      return;
    }
    fallEl.innerHTML = rows
      .map(function (s) {
        return (
          '<div class="fall-row" style="--bcolor:#' +
          esc(s.color) +
          '"><span>' +
          esc(s.bucket) +
          " · " +
          esc(s.title) +
          "</span><span>" +
          fmtHrs(s.hours) +
          "h · " +
          esc(s.reason) +
          "</span></div>"
        );
      })
      .join("");
  }

  function load() {
    if (!cfg.spreadsheet_id || !cfg.plan_gid) {
      setupEl.classList.remove("hidden");
      setupEl.innerHTML =
        "Add spreadsheet_id and gids to <code>web/config.js</code>, then refresh.";
      return Promise.resolve();
    }
    setupEl.classList.add("hidden");
    setErr("");
    return Promise.all([fetchCsv(cfg.plan_gid), fetchCsv(cfg.summary_gid), fetchCsv(cfg.settings_gid)])
      .then(function (parts) {
        var dateKey = todayKey();
        var plan = parsePlan(parts[0]);
        var summary = parseSummary(parts[1]);
        var settings = parseSettings(parts[2]);
        stampEl.textContent = settings.meta["Last packed"]
          ? "Packed " + settings.meta["Last packed"]
          : dateKey;
        renderBudgets(settings);
        renderDay(plan, dateKey);
        renderFall(summary, dateKey);
      })
      .catch(function (e) {
        setErr(e.message || String(e));
      });
  }

  function nextMidnightMs() {
    var now = Date.now();
    var p = chicagoParts(now);
    var y = Number(p.y);
    var mo = Number(p.mo);
    var d = Number(p.d);
    var guess = Date.parse(y + "-" + p.mo + "-" + p.d + "T05:00:00Z");
    var i;
    for (i = -18; i <= 18; i++) {
      var ms = guess + i * 3600000;
      var q = chicagoParts(ms);
      if (q.hour === 0 && q.d === p.d && q.mo === p.mo) {
        var next = ms + 24 * 3600000;
        return next - now < 60000 ? next + 24 * 3600000 : next;
      }
    }
    return now + 3600000;
  }

  function armMidnight() {
    if (dailyTimer) clearTimeout(dailyTimer);
    dailyTimer = setTimeout(function () {
      load().finally(armMidnight);
    }, Math.max(5000, nextMidnightMs() - Date.now()));
  }

  document.getElementById("btn-refresh").onclick = function () {
    load();
  };
  document.getElementById("btn-rebuild").onclick = function () {
    jsonp("rebuild")
      .then(function (res) {
        if (res && res.ok === false) throw new Error(res.error || "Rebuild failed");
        return load();
      })
      .catch(function (e) {
        setErr(e.message || String(e));
      });
  };

  load();
  armMidnight();
  pollTimer = setInterval(load, 5 * 60 * 1000);
})();
