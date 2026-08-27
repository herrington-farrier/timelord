(function () {
  var cfg = window.TIMELORD_CONFIG || {};
  var TABS = [
    { id: "hours", label: "Hours & colors" },
    { id: "personal", label: "Personal" },
    { id: "scheduled", label: "Scheduled" },
    { id: "rotate", label: "Rotate" },
    { id: "current", label: "Current" },
    { id: "oneoffs", label: "One-offs" }
  ];
  var SLOTS = ["morning", "midday", "evening"];
  var MODES = [
    { value: "scheduled", label: "Scheduled" },
    { value: "rotate", label: "Rotate" },
    { value: "current", label: "Current" }
  ];
  var FALLBACK_BUCKETS = ["Work", "Fitness", "Food", "House", "Garden", "Projects"];
  var panel = document.getElementById("panel");
  var errEl = document.getElementById("err");
  var okEl = document.getElementById("ok");
  var tabsEl = document.getElementById("tabs");
  var stampEl = document.getElementById("edit-stamp");
  var saveBtn = document.getElementById("btn-save-page");
  var catalog = null;
  var tab = normalizeTab((location.hash || "#hours").replace(/^#/, "") || "hours");

  function normalizeTab(id) {
    if (id === "templates") return "scheduled";
    if (id === "tasks") return "oneoffs";
    if (id === "work" || id === "projects") return "current";
    if (id === "fitness") return "rotate";
    return id || "hours";
  }

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

  function cardVals(root) {
    var out = {};
    Array.prototype.forEach.call(root.querySelectorAll("input, select, textarea"), function (el) {
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

  function bucketDays(name) {
    return name === "Work" ? 6 : catalog.settings && catalog.settings.daysPerWeek ? catalog.settings.daysPerWeek : 7;
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
      card("Unallocated", fmt(s.unallocated) + "h/wk", "raise buckets from here") +
      "</div>";
    html +=
      '<div class="edit-card meta-form" data-kind="meta"><div class="fields">' +
      field("Day hours", '<input name="hours" type="number" step="0.25" min="1" value="' + esc(fmt(s.dayHours)) + '" />') +
      field("Days / week", '<input name="days" type="number" step="1" min="1" max="7" value="' + esc(s.daysPerWeek || 7) + '" />') +
      field("Buffer minutes", '<input name="minutes" type="number" step="1" min="0" value="' + esc(s.bufferMinutes || 15) + '" />') +
      "</div></div>";
    html +=
      '<p class="hint">Each bucket gets one slot per day. Work skips Sundays. Raising hours takes Unallocated, then steals from lower-priority buckets down to their minimum. Personal never moves. Change anything below, then <strong>Save this page</strong>.</p>';
    html += '<div class="bucket-forms">';
    (s.buckets || []).forEach(function (b) {
      html +=
        '<div class="edit-card bucket-card" data-kind="bucket" data-bucket="' +
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
        field("Color", '<input name="color" type="color" value="#' + esc(b.color) + '" />') +
        field("Slot", '<select name="slot">' + optionHtml(SLOTS, b.slot) + "</select>") +
        field("Daily hours", num("daily", b.daily)) +
        field("Min / week", num("min", b.min)) +
        '</div><div class="budget-pick"><button type="button" data-bump="-0.25">− 0.25h/day</button>' +
        '<button type="button" data-bump="0.25">+ 0.25h/day</button></div>' +
        '<div class="sub">Weekly ' +
        fmt(b.weekly) +
        "h (" +
        fmt(b.daily) +
        " × " +
        bucketDays(b.name) +
        ")</div></div>";
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

  function addBar(kind, fieldsHtml, extra) {
    return (
      '<div class="edit-card add-card" data-kind="' +
      esc(kind) +
      '" data-add="1"' +
      (extra || "") +
      '><div class="fields">' +
      fieldsHtml +
      '</div><p class="sub">Filled rows are created when you save this page.</p></div>'
    );
  }

  function acts(kind) {
    return (
      '<div class="edit-acts"><button type="button" class="danger" data-del>Delete</button></div>'
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
        '<div class="edit-card" data-kind="personal" data-row="' +
        r.row +
        '"><div class="fields">' +
        field("Title", text("title", r.title)) +
        field("Hours", num("hours", r.hours)) +
        field("Slot", '<select name="slot">' + optionHtml(SLOTS, r.slot) + "</select>") +
        field("Days", '<input name="days" list="cadence-list" value="' + esc(r.cadence) + '" />') +
        check("active", r.active, "Active") +
        "</div>" +
        acts("personal") +
        "</div>";
    });
    panel.innerHTML = html;
  }

  function templateCard(r) {
    return (
      '<div class="edit-card" data-kind="template" data-row="' +
      r.row +
      '" style="--bcolor:#' +
      esc(colorFor(r.bucket)) +
      '"><div class="fields">' +
      field("Title", text("title", r.title)) +
      '<input type="hidden" name="bucket" value="' +
      esc(r.bucket) +
      '" />' +
      field("Cadence", '<input name="cadence" list="cadence-list" value="' + esc(r.cadence) + '" />') +
      field("How", '<select name="mode">' + optionHtml(MODES, r.mode || "scheduled") + "</select>") +
      check("thisWeek", r.thisWeek, "This week") +
      check("active", r.active, "Active") +
      "</div>" +
      acts("template") +
      "</div>"
    );
  }

  function groupedTemplates(mode) {
    var grouped = {};
    (catalog.templates || []).forEach(function (r) {
      if ((r.mode || "scheduled") !== mode) return;
      if (!grouped[r.bucket]) grouped[r.bucket] = [];
      grouped[r.bucket].push(r);
    });
    var html = "";
    buckets().forEach(function (b) {
      var rows = grouped[b] || [];
      if (!rows.length) return;
      html += '<h3 class="group-h" style="--bcolor:#' + esc(colorFor(b)) + '">' + esc(b) + "</h3>";
      rows.forEach(function (r) {
        html += templateCard(r);
      });
    });
    Object.keys(grouped).forEach(function (b) {
      if (buckets().indexOf(b) >= 0) return;
      (grouped[b] || []).forEach(function (r) {
        html += templateCard(r);
      });
    });
    return html;
  }

  function renderScheduled() {
    panel.innerHTML =
      '<p class="hint">Classic recurring. On matching days this owns the bucket’s slot (laundry on Saturday, cooking daily). More specific cadences beat daily. A due-dated one-off still wins that day.</p>' +
      addBar(
        "template",
        field("Bucket", '<select name="bucket">' + optionHtml(buckets(), "House") + "</select>") +
          field("Title", text("title", "", 'placeholder="Laundry"')) +
          field("Cadence", '<input name="cadence" list="cadence-list" value="weekly:Sat" />') +
          '<input type="hidden" name="mode" value="scheduled" />' +
          check("thisWeek", true, "This week")
      ) +
      groupedTemplates("scheduled");
  }

  function renderRotate() {
    panel.innerHTML =
      '<p class="hint">These take turns in the bucket’s slot. Cadence is how often the rotation advances (daily dishes, every other day for fitness). Fitness sessions live here.</p>' +
      addBar(
        "template",
        field("Bucket", '<select name="bucket">' + optionHtml(buckets(), "Fitness") + "</select>") +
          field("Title", text("title", "", 'placeholder="Strength — lower"')) +
          field("Cadence", '<input name="cadence" list="cadence-list" value="eod" />') +
          '<input type="hidden" name="mode" value="rotate" />' +
          check("thisWeek", true, "This week")
      ) +
      groupedTemplates("rotate");
  }

  function renderCurrent() {
    var w = catalog.work || {};
    var h = w.highlights || [];
    var html =
      '<p class="hint">No due date. Check <strong>Current</strong> on the thing you are in — it stays until you change it. Work highlights and Projects live here.</p>' +
      '<div class="edit-card" data-kind="work" style="--bcolor:#f0c14a"><h3 class="group-h" style="--bcolor:#f0c14a">Work</h3><div class="fields stack">' +
      field("Week start", '<input name="weekStart" type="date" value="' + esc(w.weekStart) + '" />') +
      field("Theme", text("theme", w.theme || "")) +
      field("Highlight 1", text("h1", h[0] || "")) +
      field("Highlight 2", text("h2", h[1] || "")) +
      field("Highlight 3", text("h3", h[2] || "")) +
      '</div><div class="task-picks">' +
      [0, 1, 2]
        .map(function (i) {
          var t = h[i];
          if (!t) return "";
          return (
            '<label class="check"><input type="checkbox" data-current="Work" data-h="h' +
            (i + 1) +
            '" value="' +
            esc(t) +
            '"' +
            (chosenMap().Work === t ? " checked" : "") +
            " /> Current</label>"
          );
        })
        .join("") +
      "</div></div>";
    html += '<h3 class="group-h" style="--bcolor:#' + esc(colorFor("Projects")) + '">Projects</h3>';
    html += addBar("project", field("Name", text("name", "")) + check("active", true, "Active"));
    (catalog.projects || []).forEach(function (r) {
      html +=
        '<div class="edit-card" data-kind="project" data-row="' +
        r.row +
        '" style="--bcolor:#' +
        esc(colorFor("Projects")) +
        '"><div class="fields">' +
        field("Name", text("name", r.name)) +
        check("active", r.active, "Active") +
        currentCheck("Projects", r.name) +
        "</div>" +
        acts("project") +
        "</div>";
    });
    html += '<h3 class="group-h">Other current lists</h3>';
    html += addBar(
      "template",
      field("Bucket", '<select name="bucket">' + optionHtml(buckets(), "House") + "</select>") +
        field("Title", text("title", "", 'placeholder="Kitchen reset"')) +
        '<input type="hidden" name="mode" value="current" />' +
        check("thisWeek", true, "This week")
    );
    html += groupedTemplates("current");
    panel.innerHTML = html;
    Array.prototype.forEach.call(panel.querySelectorAll('[data-kind="template"][data-row]'), function (cardEl) {
      var v = cardVals(cardEl);
      if (v.mode !== "current") return;
      var titleInput = cardEl.querySelector('input[name="title"]');
      var bucketInput = cardEl.querySelector('input[name="bucket"]');
      var fieldsEl = cardEl.querySelector(".fields");
      if (!titleInput || !bucketInput || !fieldsEl || cardEl.querySelector("[data-current]")) return;
      var wrap = document.createElement("div");
      wrap.innerHTML = currentCheck(bucketInput.value, titleInput.value);
      fieldsEl.appendChild(wrap.firstChild);
    });
  }

  function renderOneoffs() {
    var html =
      '<p class="hint">A due date fills that bucket’s slot on that day (overdue ones land on today). Hours come from the bucket.</p>' +
      addBar(
        "task",
        field("Name", text("name", "")) +
          field("Due", '<input name="due" type="date" />') +
          field("Bucket", '<select name="bucket">' + optionHtml(buckets(), "Work") + "</select>") +
          check("thisWeek", true, "This week")
      );
    (catalog.tasks || []).forEach(function (r) {
      html +=
        '<div class="edit-card" data-kind="task" data-row="' +
        r.row +
        '"><div class="fields">' +
        field("Name", text("name", r.title)) +
        field("Due", '<input name="due" type="date" value="' + esc(r.due) + '" />') +
        field("Bucket", '<select name="bucket">' + optionHtml(buckets(), r.bucket) + "</select>") +
        check("thisWeek", r.thisWeek, "This week") +
        check("active", r.active, "Active") +
        "</div>" +
        acts("task") +
        "</div>";
    });
    panel.innerHTML = html;
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
    else if (tab === "scheduled") renderScheduled();
    else if (tab === "rotate") renderRotate();
    else if (tab === "current") renderCurrent();
    else if (tab === "oneoffs") renderOneoffs();
    else renderHours();
  }

  function collectCurrent() {
    var current = {};
    var seen = {};
    Array.prototype.forEach.call(panel.querySelectorAll("[data-current]"), function (el) {
      var b = el.getAttribute("data-current");
      seen[b] = true;
      if (!el.checked) return;
      var card = el.closest("[data-kind]");
      var href = el.getAttribute("data-h");
      if (href && card) {
        var live = card.querySelector('[name="' + href + '"]');
        current[b] = live ? live.value : el.value;
        return;
      }
      if (card) {
        var named = card.querySelector('input[name="name"], input[name="title"]');
        if (named && named.value) {
          current[b] = named.value;
          return;
        }
      }
      current[b] = el.value;
    });
    Object.keys(seen).forEach(function (b) {
      if (!Object.prototype.hasOwnProperty.call(current, b)) current[b] = "";
    });
    return current;
  }

  function collectPayload() {
    var payload = { tab: tab, rows: [], adds: [], buckets: [], current: collectCurrent() };
    var meta = panel.querySelector('[data-kind="meta"]');
    if (meta) payload.meta = cardVals(meta);
    Array.prototype.forEach.call(panel.querySelectorAll('[data-kind="bucket"]'), function (el) {
      var v = cardVals(el);
      payload.buckets.push({
        name: el.getAttribute("data-bucket"),
        color: String(v.color || "").replace(/^#/, ""),
        slot: v.slot,
        min: v.min,
        daily: v.daily
      });
    });
    var work = panel.querySelector('[data-kind="work"]');
    if (work) {
      var wv = cardVals(work);
      wv.dailyHours = (catalog.work && catalog.work.dailyHours) || 3;
      payload.work = wv;
    }
    Array.prototype.forEach.call(panel.querySelectorAll("[data-kind][data-row]"), function (el) {
      var v = cardVals(el);
      v.kind = el.getAttribute("data-kind");
      v.row = el.getAttribute("data-row");
      if (v.kind === "template") {
        var prev;
        (catalog.templates || []).some(function (t) {
          if (String(t.row) === String(v.row)) {
            prev = t;
            return true;
          }
          return false;
        });
        if (prev) {
          v.hours = prev.hours;
          v.slot = v.slot || prev.slot;
          v.options = prev.options;
        }
      }
      if (v.kind === "task") v.hours = v.hours || "0";
      if (v.kind === "project") v.hours = v.hours || "1";
      payload.rows.push(v);
    });
    Array.prototype.forEach.call(panel.querySelectorAll("[data-add]"), function (el) {
      var v = cardVals(el);
      v.kind = el.getAttribute("data-kind");
      var title = String(v.title || v.name || "").trim();
      if (!title) return;
      payload.adds.push(v);
    });
    return payload;
  }

  function saved(msg) {
    setErr("");
    setOk(msg || "Saved. Rebuild if you want Today to reshuffle.");
    render();
  }

  function run(action, params, okMsg) {
    setErr("");
    setOk("");
    if (saveBtn) saveBtn.disabled = true;
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
      })
      .then(function () {
        if (saveBtn) saveBtn.disabled = false;
      });
  }

  function savePage() {
    return run("saveEditPage", { tab: tab, payload: JSON.stringify(collectPayload()) }, "Page saved.");
  }

  function onDelete(card) {
    var kind = card.getAttribute("data-kind");
    var row = card.getAttribute("data-row");
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
    e.preventDefault();
    savePage();
  });

  panel.addEventListener("click", function (e) {
    var cur = e.target.closest("[data-current]");
    if (cur && cur.type === "checkbox") {
      if (cur.checked) {
        var bucket = cur.getAttribute("data-current");
        Array.prototype.forEach.call(panel.querySelectorAll('[data-current="' + bucket + '"]'), function (el) {
          if (el !== cur) el.checked = false;
        });
      }
      return;
    }
    var bump = e.target.closest("[data-bump]");
    if (bump) {
      e.preventDefault();
      var card = bump.closest('[data-kind="bucket"]');
      if (!card) return;
      var input = card.querySelector('input[name="daily"]');
      if (!input) return;
      var next = Math.max(0, (Number(input.value) || 0) + Number(bump.getAttribute("data-bump")));
      input.value = fmt(next);
      var sub = card.querySelector(".sub");
      var name = card.getAttribute("data-bucket");
      var d = bucketDays(name);
      if (sub) sub.textContent = "Weekly " + fmt(next * d) + "h (" + fmt(next) + " × " + d + ")";
      return;
    }
    var del = e.target.closest("[data-del]");
    if (del) {
      e.preventDefault();
      onDelete(del.closest("[data-kind]"));
    }
  });

  if (saveBtn) {
    saveBtn.onclick = function () {
      savePage();
    };
  }

  document.getElementById("btn-rebuild").onclick = function () {
    run("rebuild", {}, "Rebuilt today + 3 weeks.");
  };

  window.addEventListener("hashchange", function () {
    tab = normalizeTab((location.hash || "#hours").replace(/^#/, "") || "hours");
    if (location.hash.replace(/^#/, "") !== tab) {
      location.hash = tab;
      return;
    }
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
