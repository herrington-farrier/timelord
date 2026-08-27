(function () {
  var cfg = window.TIMELORD_CONFIG || {};
  var TABS = [
    { id: "hours", label: "Hours & colors" },
    { id: "personal", label: "Personal" },
    { id: "templates", label: "Templates" },
    { id: "tasks", label: "Tasks" },
    { id: "work", label: "Work" },
    { id: "projects", label: "Projects" },
    { id: "fitness", label: "Fitness" }
  ];
  var SLOTS = ["morning", "midday", "evening"];
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var FALLBACK_BUCKETS = ["Work", "Fitness", "Food", "House", "Garden", "Projects"];
  var panel = document.getElementById("panel");
  var errEl = document.getElementById("err");
  var okEl = document.getElementById("ok");
  var tabsEl = document.getElementById("tabs");
  var stampEl = document.getElementById("edit-stamp");
  var catalog = null;
  var tab = (location.hash || "#hours").replace(/^#/, "") || "hours";

  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function fmt(n) {
    var x = Number(n);
    if (isNaN(x)) return "0";
    if (Math.abs(x - Math.round(x)) < 1e-6) return String(Math.round(x));
    return x.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  function jsonp(action, params) {
    params = params || {};
    var base = String(cfg.web_app_url || "").trim();
    if (!base) return Promise.reject(new Error("Web App URL is not set in config.js"));
    return new Promise(function (resolve, reject) {
      var cb = "tl_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
      var q = ["action=" + encodeURIComponent(action), "callback=" + cb];
      Object.keys(params).forEach(function (k) {
        if (params[k] == null) return;
        q.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
      });
      var s = document.createElement("script");
      var timer = setTimeout(function () {
        cleanup();
        reject(new Error("Web App timed out. Open the Web App URL once and click Allow, then retry."));
      }, 40000);
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
        reject(new Error("Web App request failed. Open the exec URL once to authorize."));
      };
      s.src = base + (base.indexOf("?") >= 0 ? "&" : "?") + q.join("&");
      document.body.appendChild(s);
    });
  }

  function setErr(msg) {
    errEl.textContent = msg || "";
  }

  function setOk(msg) {
    okEl.textContent = msg || "";
    okEl.classList.toggle("hidden", !msg);
  }

  function buckets() {
    var list = (catalog && catalog.settings && catalog.settings.buckets) || [];
    if (list.length) return list.map(function (b) { return b.name; });
    return FALLBACK_BUCKETS.slice();
  }

  function optionHtml(values, selected) {
    return values
      .map(function (v) {
        var val = typeof v === "string" ? v : v.value;
        var lab = typeof v === "string" ? v : v.label;
        return (
          '<option value="' +
          esc(val) +
          '"' +
          (String(val) === String(selected) ? " selected" : "") +
          ">" +
          esc(lab) +
          "</option>"
        );
      })
      .join("");
  }

  function field(label, inner) {
    return '<label class="field"><span>' + esc(label) + "</span>" + inner + "</label>";
  }

  function text(name, value, extra) {
    return (
      '<input name="' +
      esc(name) +
      '" type="text" value="' +
      esc(value) +
      '" ' +
      (extra || "") +
      " />"
    );
  }

  function num(name, value, extra) {
    return (
      '<input name="' +
      esc(name) +
      '" type="number" step="0.25" min="0" value="' +
      esc(fmt(value)) +
      '" ' +
      (extra || "") +
      " />"
    );
  }

  function check(name, on, label) {
    return (
      '<label class="check"><input name="' +
      esc(name) +
      '" type="checkbox"' +
      (on ? " checked" : "") +
      " /> " +
      esc(label) +
      "</label>"
    );
  }

  function formVals(form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      if (el.type === "checkbox") out[el.name] = el.checked ? "true" : "false";
      else out[el.name] = el.value;
    });
    return out;
  }

  function applyCatalog(res) {
    if (res && res.ok === false) throw new Error(res.error || "Save failed");
    if (res && res.catalog) catalog = res.catalog;
    return res;
  }

  function renderTabs() {
    tabsEl.innerHTML = TABS.map(function (t) {
      return (
        '<a class="tab' +
        (t.id === tab ? " is-on" : "") +
        '" href="#' +
        t.id +
        '">' +
        esc(t.label) +
        "</a>"
      );
    }).join("");
  }

  function renderHours() {
    var s = catalog.settings || {};
    var days = s.daysPerWeek || 7;
    var html =
      '<div class="totals">' +
      card("Day", fmt(s.dayHours) + "h", "length of a packed day") +
      card("Gross", fmt(s.gross) + "h/wk", fmt(s.dayHours) + " × " + days) +
      card("Personal", fmt(s.personal) + "h/wk", "locked") +
      card("Assignable", fmt(s.assignable) + "h/wk", "after personal") +
      card("Allocated", fmt(s.allocated) + "h/wk", "in buckets") +
      card("Unallocated", fmt(s.unallocated) + "h/wk", "raise a bucket from here first") +
      "</div>";
    html +=
      '<form class="edit-card meta-form" data-kind="meta"><div class="fields">' +
      field("Day hours", '<input name="hours" type="number" step="0.25" min="1" value="' + esc(fmt(s.dayHours)) + '" />') +
      field("Days / week", '<input name="days" type="number" step="1" min="1" max="7" value="' + esc(s.daysPerWeek || 7) + '" />') +
      field("Buffer minutes", '<input name="minutes" type="number" step="1" min="0" value="' + esc(s.bufferMinutes || 15) + '" />') +
      '</div><div class="edit-acts"><button type="submit" class="primary">Save day settings</button></div></form>';
    html += '<p class="hint">Each bucket gets one time slot per day (these hours). Work skips Sundays (Mon–Sat). Tasks are a checklist — pick Current on Edit or Today. Raising daily hours takes Unallocated, then steals from lower-priority buckets down to their minimum. Personal never moves.</p>';
    html += '<div class="bucket-forms">';
    (s.buckets || []).forEach(function (b) {
      html +=
        '<form class="edit-card bucket-card" data-kind="bucket" data-bucket="' +
        esc(b.name) +
        '" style="--bcolor:#' +
        esc(b.color) +
        '"><div class="bucket-head"><strong>' +
        esc(b.name) +
        "</strong><span>left " +
        fmt(b.remaining) +
        "h this week · marked " +
        fmt(b.marked) +
        "h</span></div><div class=\"fields\">" +
        field(
          "Color",
          '<input name="color" type="color" value="#' + esc(b.color) + '" />'
        ) +
        field(
          "Slot",
          '<select name="slot">' + optionHtml(SLOTS, b.slot) + "</select>"
        ) +
        field("Daily hours", num("daily", b.daily, 'class="grow"')) +
        field("Min / week", num("min", b.min)) +
        '</div><div class="budget-pick"><button type="button" data-bump="-0.25">− 0.25h/day</button>' +
        '<button type="button" data-bump="0.25">+ 0.25h/day</button>' +
        '<button type="submit" class="primary">Save bucket</button></div>' +
        '<div class="sub">Weekly ' +
        fmt(b.weekly) +
        "h (" +
        fmt(b.daily) +
        " × " +
        days +
        ")</div></form>";
    });
    html += "</div>";
    panel.innerHTML = html;
  }

  function card(k, v, sub) {
    return (
      '<div class="total-card"><span>' +
      esc(k) +
      "</span><b>" +
      esc(v) +
      "</b><em>" +
      esc(sub || "") +
      "</em></div>"
    );
  }

  function renderPersonal() {
    var html =
      '<p class="hint">Locked life blocks (shower, lunch, dinner). Other buckets cannot steal these hours.</p>' +
      addBar(
        "personal",
        field("Title", text("title", "", 'placeholder="Dinner with husband"')) +
          field("Hours", num("hours", 1)) +
          field("Slot", '<select name="slot">' + optionHtml(SLOTS, "evening") + "</select>") +
          field("Days", '<input name="days" list="cadence-list" value="daily" />')
      );
    (catalog.personal || []).forEach(function (r) {
      html +=
        '<form class="edit-card" data-kind="personal" data-row="' +
        r.row +
        '"><div class="fields">' +
        field("Title", text("title", r.title)) +
        field("Hours", num("hours", r.hours)) +
        field("Slot", '<select name="slot">' + optionHtml(SLOTS, r.slot) + "</select>") +
        field("Days", '<input name="days" list="cadence-list" value="' + esc(r.cadence) + '" />') +
        check("active", r.active, "Active") +
        '</div><div class="edit-acts"><button type="submit" class="primary">Save</button>' +
        '<button type="button" class="danger" data-del>Delete</button></div></form>';
    });
    panel.innerHTML = html;
  }

  function chosenMap() {
    return (catalog && catalog.settings && catalog.settings.chosen) || {};
  }

  function isCurrent(bucket, title) {
    return chosenMap()[bucket] === title;
  }

  function currentCheck(bucket, title) {
    return (
      '<label class="check"><input type="checkbox" data-current="' +
      esc(bucket) +
      '" value="' +
      esc(title) +
      '"' +
      (isCurrent(bucket, title) ? " checked" : "") +
      " /> Current</label>"
    );
  }

  function renderTemplates() {
    var bopts = optionHtml(buckets(), "House");
    var html =
      '<p class="hint">Recurring and rotating chores. Cadence fills that bucket’s slot on matching days (weekly:Sat, eod, daily). If several match the same day, they rotate. More specific cadences beat daily. A due-dated task still wins that day. Current is only the fallback when nothing is scheduled.</p>' +
      addBar(
        "template",
        field("Bucket", '<select name="bucket">' + bopts + "</select>") +
          field("Title", text("title", "", 'placeholder="Dishes"')) +
          field("Cadence", '<input name="cadence" list="cadence-list" value="daily" />') +
          check("thisWeek", true, "This week")
      );
    var grouped = {};
    (catalog.templates || []).forEach(function (r) {
      if (!grouped[r.bucket]) grouped[r.bucket] = [];
      grouped[r.bucket].push(r);
    });
    buckets().forEach(function (b) {
      var rows = grouped[b] || [];
      if (!rows.length) return;
      html += '<h3 class="group-h" style="--bcolor:#' + esc(colorFor(b)) + '">' + esc(b) + "</h3>";
      rows.forEach(function (r) {
        html +=
          '<form class="edit-card" data-kind="template" data-row="' +
          r.row +
          '" style="--bcolor:#' +
          esc(colorFor(r.bucket)) +
          '"><div class="fields">' +
          field("Title", text("title", r.title)) +
          '<input type="hidden" name="bucket" value="' +
          esc(r.bucket) +
          '" />' +
          field("Cadence", '<input name="cadence" list="cadence-list" value="' + esc(r.cadence) + '" />') +
          check("thisWeek", r.thisWeek, "This week") +
          check("active", r.active, "Active") +
          currentCheck(r.bucket, r.title) +
          '</div><div class="edit-acts"><button type="submit" class="primary">Save</button>' +
          '<button type="button" class="danger" data-del>Delete</button></div></form>';
      });
    });
    Object.keys(grouped).forEach(function (b) {
      if (buckets().indexOf(b) >= 0) return;
      (grouped[b] || []).forEach(function (r) {
        html +=
          '<form class="edit-card" data-kind="template" data-row="' +
          r.row +
          '"><div class="fields">' +
          field("Bucket", '<select name="bucket">' + optionHtml(buckets(), r.bucket) + "</select>") +
          field("Title", text("title", r.title)) +
          field("Cadence", '<input name="cadence" list="cadence-list" value="' + esc(r.cadence) + '" />') +
          check("thisWeek", r.thisWeek, "This week") +
          check("active", r.active, "Active") +
          currentCheck(r.bucket, r.title) +
          '</div><div class="edit-acts"><button type="submit" class="primary">Save</button>' +
          '<button type="button" class="danger" data-del>Delete</button></div></form>';
      });
    });
    panel.innerHTML = html;
  }

  function renderTasks() {
    var html =
      '<p class="hint">One-offs. Set a due date and Rebuild — that task fills the bucket’s time slot on that day (overdue ones land on today). Check Current for the default on days with no due task. Hours come from the bucket.</p>' +
      addBar(
        "task",
        field("Name", text("name", "")) +
          field("Due", '<input name="due" type="date" />') +
          field("Bucket", '<select name="bucket">' + optionHtml(buckets(), "Work") + "</select>") +
          check("thisWeek", true, "This week")
      );
    (catalog.tasks || []).forEach(function (r) {
      html +=
        '<form class="edit-card" data-kind="task" data-row="' +
        r.row +
        '"><div class="fields">' +
        field("Name", text("name", r.title)) +
        field("Due", '<input name="due" type="date" value="' + esc(r.due) + '" />') +
        field("Bucket", '<select name="bucket">' + optionHtml(buckets(), r.bucket) + "</select>") +
        check("thisWeek", r.thisWeek, "This week") +
        check("active", r.active, "Active") +
        currentCheck(r.bucket, r.title) +
        '</div><div class="edit-acts"><button type="submit" class="primary">Save</button>' +
        '<button type="button" class="danger" data-del>Delete</button></div></form>';
    });
    panel.innerHTML = html;
  }

  function renderWork() {
    var w = catalog.work || {};
    var h = w.highlights || [];
    var cur = chosenMap().Work || "";
    panel.innerHTML =
      '<p class="hint">Work’s time slot is the Work hours on Hours &amp; colors. These are the highlight candidates. Check Current to keep one until you change it.</p>' +
      '<form class="edit-card" data-kind="work"><div class="fields stack">' +
      field("Week start", '<input name="weekStart" type="date" value="' + esc(w.weekStart) + '" />') +
      field("Theme", text("theme", w.theme || "")) +
      field("Highlight 1", text("h1", h[0] || "")) +
      field("Highlight 2", text("h2", h[1] || "")) +
      field("Highlight 3", text("h3", h[2] || "")) +
      '</div><div class="edit-acts"><button type="submit" class="primary">Save work week</button></div></form>' +
      '<div class="edit-card"><div class="task-picks">' +
      [h[0], h[1], h[2]]
        .filter(Boolean)
        .map(function (t) {
          return (
            '<label class="check"><input type="checkbox" data-current="Work" value="' +
            esc(t) +
            '"' +
            (cur === t ? " checked" : "") +
            " /> " +
            esc(t) +
            "</label>"
          );
        })
        .join("") +
      "</div></div>";
  }

  function renderProjects() {
    var html =
      '<p class="hint">Projects share one time slot (Projects hours). Check Current on the project you are in until you switch.</p>' +
      addBar("project", field("Name", text("name", "")) + check("active", true, "Active"));
    (catalog.projects || []).forEach(function (r) {
      html +=
        '<form class="edit-card" data-kind="project" data-row="' +
        r.row +
        '"><div class="fields">' +
        field("Name", text("name", r.name)) +
        check("active", r.active, "Active") +
        currentCheck("Projects", r.name) +
        '</div><div class="edit-acts"><button type="submit" class="primary">Save</button>' +
        '<button type="button" class="danger" data-del>Delete</button></div></form>';
    });
    panel.innerHTML = html;
  }

  function renderFitness() {
    var html =
      '<p class="hint">Suggested session by weekday. Fitness hours live on Hours &amp; colors. Check Current to keep one session until you pick another.</p>' +
      addBar(
        "fitness",
        field("Weekday", '<select name="weekday">' + optionHtml(DAYS, "Mon") + "</select>") +
          field("Session", text("session", "", 'placeholder="Strength — lower"'))
      );
    (catalog.fitness || []).forEach(function (r) {
      html +=
        '<form class="edit-card" data-kind="fitness" data-row="' +
        r.row +
        '"><div class="fields">' +
        field("Weekday", '<select name="weekday">' + optionHtml(DAYS, r.weekday) + "</select>") +
        field("Session", text("session", r.title)) +
        currentCheck("Fitness", r.title) +
        '</div><div class="edit-acts"><button type="submit" class="primary">Save</button>' +
        '<button type="button" class="danger" data-del>Delete</button></div></form>';
    });
    panel.innerHTML = html;
  }

  function addBar(kind, fieldsHtml) {
    return (
      '<form class="edit-card add-card" data-kind="' +
      kind +
      '" data-add="1"><div class="fields">' +
      fieldsHtml +
      '</div><div class="edit-acts"><button type="submit" class="primary">Add</button></div></form>'
    );
  }

  function colorFor(name) {
    var list = (catalog.settings && catalog.settings.buckets) || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].name === name) return list[i].color;
    }
    return "94a3b8";
  }

  function render() {
    renderTabs();
    if (!catalog) {
      panel.innerHTML = '<p class="hint">Loading…</p>';
      return;
    }
    var s = catalog.settings || {};
    stampEl.textContent = s.lastPacked ? "Packed " + s.lastPacked : "";
    if (tab === "hours") renderHours();
    else if (tab === "personal") renderPersonal();
    else if (tab === "templates") renderTemplates();
    else if (tab === "tasks") renderTasks();
    else if (tab === "work") renderWork();
    else if (tab === "projects") renderProjects();
    else if (tab === "fitness") renderFitness();
    else renderHours();
  }

  function saved(msg) {
    setErr("");
    setOk(msg || "Saved. Rebuild if you want Today to reshuffle.");
    render();
  }

  function run(action, params, okMsg) {
    setErr("");
    setOk("");
    return jsonp(action, params)
      .then(applyCatalog)
      .then(function (res) {
        if (catalog && res && res.catalog) return res;
        return jsonp("catalog").then(applyCatalog);
      })
      .then(function () {
        saved(okMsg);
      })
      .catch(function (e) {
        setErr(e.message || String(e));
      });
  }

  function onSubmit(form) {
    var kind = form.getAttribute("data-kind");
    var adding = form.getAttribute("data-add") === "1";
    var row = form.getAttribute("data-row");
    var v = formVals(form);
    if (kind === "meta") {
      return run("saveDaySettings", { hours: v.hours, days: v.days, minutes: v.minutes }, "Day settings saved.");
    }
    if (kind === "bucket") {
      return run(
        "saveBucket",
        {
          bucket: form.getAttribute("data-bucket"),
          color: String(v.color || "").replace(/^#/, ""),
          slot: v.slot,
          min: v.min,
          hours: v.daily
        },
        form.getAttribute("data-bucket") + " saved."
      );
    }
    if (kind === "personal") {
      v.days = v.days || "daily";
      if (adding) return run("addPersonal", v, "Personal block added.");
      v.row = row;
      return run("updatePersonal", v);
    }
    if (kind === "template") {
      var prevT;
      (catalog.templates || []).some(function (t) {
        if (String(t.row) === String(row)) {
          prevT = t;
          return true;
        }
        return false;
      });
      v.hours = prevT ? prevT.hours : 0;
      v.slot = prevT ? prevT.slot : "morning";
      v.options = prevT ? prevT.options : "";
      if (adding) return run("addTemplate", v, "Template added.");
      v.row = row;
      return run("updateTemplate", v);
    }
    if (kind === "task") {
      v.hours = v.hours || "0";
      if (adding) return run("addTask", v, "Task added.");
      v.row = row;
      return run("updateTask", v);
    }
    if (kind === "work") {
      v.dailyHours = (catalog.work && catalog.work.dailyHours) || 3;
      return run("saveWork", v, "Work week saved.");
    }
    if (kind === "project") {
      v.hours = v.hours || "1";
      if (adding) return run("addProject", v, "Project added.");
      v.row = row;
      return run("updateProject", v);
    }
    if (kind === "fitness") {
      v.hours = v.hours || "1";
      if (adding) return run("addFitness", v, "Fitness session added.");
      v.row = row;
      return run("updateFitness", v);
    }
  }

  function onDelete(form) {
    var kind = form.getAttribute("data-kind");
    var row = form.getAttribute("data-row");
    var map = {
      personal: "deletePersonal",
      template: "deleteTemplate",
      task: "deleteTask",
      project: "deleteProject",
      fitness: "deleteFitness"
    };
    var action = map[kind];
    if (!action || !row) return;
    if (!window.confirm("Delete this " + kind + "?")) return;
    return run(action, { row: row }, "Deleted.");
  }

  panel.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || !form.getAttribute("data-kind")) return;
    e.preventDefault();
    onSubmit(form);
  });

  panel.addEventListener("click", function (e) {
    var cur = e.target.closest("[data-current]");
    if (cur && cur.type === "checkbox") {
      var bucket = cur.getAttribute("data-current");
      var chosen = cur.checked ? cur.value : "";
      run("setCurrent", { bucket: bucket, chosen: chosen }, chosen ? chosen + " is current for " + bucket + "." : "Cleared current " + bucket + " task.");
      return;
    }
    var bump = e.target.closest("[data-bump]");
    if (bump) {
      e.preventDefault();
      var form = bump.closest("form");
      var bucket = form && form.getAttribute("data-bucket");
      if (!bucket) return;
      run("bumpDailyHours", { bucket: bucket, delta: bump.getAttribute("data-bump") }, bucket + " hours updated.");
      return;
    }
    var del = e.target.closest("[data-del]");
    if (del) {
      e.preventDefault();
      onDelete(del.closest("form"));
    }
  });

  document.getElementById("btn-rebuild").onclick = function () {
    run("rebuild", {}, "Rebuilt today + 3 weeks.");
  };

  window.addEventListener("hashchange", function () {
    tab = (location.hash || "#hours").replace(/^#/, "") || "hours";
    setOk("");
    render();
  });

  function load() {
    if (!cfg.web_app_url) {
      setErr("Add web_app_url to config.js so Edit can write through the Web App.");
      return;
    }
    panel.innerHTML = '<p class="hint">Loading from the sheet via the Web App…</p>';
    jsonp("catalog")
      .then(applyCatalog)
      .then(function () {
        setErr("");
        render();
      })
      .catch(function (e) {
        setErr(
          (e.message || String(e)) +
            " Open " +
            cfg.web_app_url +
            " once, click Allow, then refresh this page."
        );
      });
  }

  renderTabs();
  load();
})();
