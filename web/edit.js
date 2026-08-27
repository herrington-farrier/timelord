(function () {
  var cfg = window.TIMELORD_CONFIG || {};
  var TABS = [
    { id: "day", label: "Day" },
    { id: "personal", label: "Personal" },
    { id: "items", label: "Items" }
  ];
  var SLOTS = ["morning", "midday", "evening"];
  var KINDS = [
    { value: "recurring", label: "Recurring" },
    { value: "hourly", label: "Hourly" }
  ];
  var FALLBACK_BUCKETS = ["Work", "Fitness", "Food", "House", "Garden", "Projects"];
  var panel = document.getElementById("panel");
  var errEl = document.getElementById("err");
  var okEl = document.getElementById("ok");
  var tabsEl = document.getElementById("tabs");
  var stampEl = document.getElementById("edit-stamp");
  var saveBtn = document.getElementById("btn-save-page");
  var catalog = null;
  var tab = normalizeTab((location.hash || "#day").replace(/^#/, "") || "day");

  function normalizeTab(id) {
    if (id === "hours" || id === "colors") return "day";
    if (id === "templates" || id === "scheduled" || id === "rotate" || id === "current" || id === "fitness" || id === "work" || id === "projects" || id === "tasks" || id === "oneoffs") {
      return "items";
    }
    return id || "day";
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function splitHm(hours) {
    var mins = Math.round(Number(hours) * 60) || 0;
    if (mins < 0) mins = 0;
    return { h: Math.floor(mins / 60), m: mins % 60 };
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

  function durFields(hours) {
    var hm = splitHm(hours);
    return (
      field("Hours", '<input name="hoursPart" type="number" min="0" step="1" value="' + hm.h + '" />') +
      field("Minutes", '<input name="minsPart" type="number" min="0" max="59" step="1" value="' + hm.m + '" />')
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

  function colorFor(name) {
    var list = (catalog.settings && catalog.settings.buckets) || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].name === name) return list[i].color;
    }
    return "94a3b8";
  }

  function renderDay() {
    var s = catalog.settings || {};
    var html =
      '<div class="edit-card meta-form" data-kind="meta"><div class="fields">' +
      field("Day hours", '<input name="hours" type="number" step="0.25" min="1" value="' + esc(s.dayHours || 12) + '" />') +
      field("Days / week", '<input name="days" type="number" step="1" min="1" max="7" value="' + esc(s.daysPerWeek || 7) + '" />') +
      field("Buffer minutes", '<input name="minutes" type="number" step="1" min="0" value="' + esc(s.bufferMinutes || 15) + '" />') +
      "</div></div>";
    html += '<p class="hint">Buckets are only color and time of day. Item hours live on Items.</p>';
    html += '<div class="bucket-forms">';
    (s.buckets || []).forEach(function (b) {
      html +=
        '<div class="edit-card bucket-card" data-kind="bucket" data-bucket="' +
        esc(b.name) +
        '" style="--bcolor:#' +
        esc(b.color) +
        '"><div class="bucket-head"><strong>' +
        esc(b.name) +
        "</strong></div><div class=\"fields\">" +
        field("Color", '<input name="color" type="color" value="#' + esc(b.color) + '" />') +
        field("Slot", '<select name="slot">' + optionHtml(SLOTS, b.slot) + "</select>") +
        "</div></div>";
    });
    html += "</div>";
    panel.innerHTML = html;
  }

  function renderPersonal() {
    var html =
      '<p class="hint">Locked life blocks. They always keep their time.</p>' +
      addBar(
        "personal",
        field("Title", text("title", "", 'placeholder="Dinner with husband"')) +
          durFields(1) +
          field("Slot", '<select name="slot">' + optionHtml(SLOTS, "evening") + "</select>") +
          field("Days", '<input name="days" list="cadence-list" value="daily" />')
      );
    (catalog.personal || []).forEach(function (r) {
      html +=
        '<div class="edit-card" data-kind="personal" data-row="' +
        r.row +
        '"><div class="fields">' +
        field("Title", text("title", r.title)) +
        durFields(r.hours) +
        field("Slot", '<select name="slot">' + optionHtml(SLOTS, r.slot) + "</select>") +
        field("Days", '<input name="days" list="cadence-list" value="' + esc(r.cadence) + '" />') +
        check("active", r.active, "Active") +
        '</div><div class="edit-acts"><button type="button" class="danger" data-del>Delete</button></div></div>';
    });
    panel.innerHTML = html;
  }

  function itemFields(r, isAdd) {
    var kind = r.kind || "recurring";
    var cadenceShow = kind === "recurring" ? "" : " hidden";
    var hourlyShow = kind === "hourly" ? "" : " hidden";
    return (
      field("Title", text("title", r.title || "", 'placeholder="Laundry"')) +
      (isAdd
        ? field("Bucket", '<select name="bucket">' + optionHtml(buckets(), r.bucket || "House") + "</select>")
        : '<input type="hidden" name="bucket" value="' + esc(r.bucket) + '" />') +
      durFields(r.hours || 1) +
      field("Kind", '<select name="kind" data-kind-select>' + optionHtml(KINDS, kind) + "</select>") +
      '<div class="kind-recurring' +
      cadenceShow +
      '">' +
      field("Cadence", '<input name="cadence" list="cadence-list" value="' + esc(r.cadence || "daily") + '" />') +
      "</div>" +
      '<div class="kind-hourly' +
      hourlyShow +
      '">' +
      field("Due", '<input name="due" type="date" value="' + esc(r.due || "") + '" />') +
      check("current", r.current, "Current") +
      "</div>" +
      field("Slot", '<select name="slot">' + optionHtml(SLOTS, r.slot || "morning") + "</select>") +
      (isAdd ? "" : check("active", r.active !== false, "Active"))
    );
  }

  function addBar(kind, fieldsHtml) {
    return (
      '<div class="edit-card add-card" data-kind="' +
      esc(kind) +
      '" data-add="1"><div class="fields">' +
      fieldsHtml +
      '</div><p class="sub">Filled rows are created when you save this page.</p></div>'
    );
  }

  function renderItems() {
    var html =
      '<p class="hint">Recurring items show on matching days. Hourly items need Current or a due date, and use the hours/minutes you bid.</p>' +
      addBar("item", itemFields({ kind: "recurring", hours: 1, bucket: "House", slot: "morning" }, true));
    var grouped = {};
    (catalog.items || []).forEach(function (r) {
      if (!grouped[r.bucket]) grouped[r.bucket] = [];
      grouped[r.bucket].push(r);
    });
    buckets().forEach(function (b) {
      var rows = grouped[b] || [];
      if (!rows.length) return;
      html += '<h3 class="group-h" style="--bcolor:#' + esc(colorFor(b)) + '">' + esc(b) + "</h3>";
      rows.forEach(function (r) {
        html +=
          '<div class="edit-card" data-kind="item" data-row="' +
          r.row +
          '" style="--bcolor:#' +
          esc(colorFor(r.bucket)) +
          '"><div class="fields">' +
          itemFields(r, false) +
          '</div><div class="edit-acts"><button type="button" class="danger" data-del>Delete</button></div></div>';
      });
    });
    panel.innerHTML = html;
  }

  function render() {
    renderTabs();
    if (!catalog) {
      panel.innerHTML = '<p class="hint">Loading…</p>';
      return;
    }
    var s = catalog.settings || {};
    stampEl.textContent = s.lastPacked ? "Packed " + s.lastPacked : "";
    if (tab === "day") renderDay();
    else if (tab === "personal") renderPersonal();
    else renderItems();
  }

  function collectPayload() {
    var payload = { tab: tab, rows: [], adds: [], buckets: [] };
    var meta = panel.querySelector('[data-kind="meta"]');
    if (meta) payload.meta = cardVals(meta);
    Array.prototype.forEach.call(panel.querySelectorAll('[data-kind="bucket"]'), function (el) {
      var v = cardVals(el);
      payload.buckets.push({
        name: el.getAttribute("data-bucket"),
        color: String(v.color || "").replace(/^#/, ""),
        slot: v.slot
      });
    });
    Array.prototype.forEach.call(panel.querySelectorAll("[data-kind][data-row]"), function (el) {
      var v = cardVals(el);
      v.kind = el.getAttribute("data-kind") === "item" ? v.kind : el.getAttribute("data-kind");
      v.row = el.getAttribute("data-row");
      payload.rows.push(v);
    });
    Array.prototype.forEach.call(panel.querySelectorAll("[data-add]"), function (el) {
      var v = cardVals(el);
      v.kind = el.getAttribute("data-kind") === "item" ? v.kind : el.getAttribute("data-kind");
      var title = String(v.title || "").trim();
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
    var action = kind === "personal" ? "deletePersonal" : kind === "item" ? "deleteItem" : "";
    if (!action || !row) return;
    if (!window.confirm("Delete this " + kind + "?")) return;
    return run(action, { row: row }, "Deleted.");
  }

  function syncKindFields(select) {
    var card = select.closest("[data-kind]");
    if (!card) return;
    var rec = card.querySelector(".kind-recurring");
    var hour = card.querySelector(".kind-hourly");
    var hourly = select.value === "hourly";
    if (rec) rec.classList.toggle("hidden", hourly);
    if (hour) hour.classList.toggle("hidden", !hourly);
  }

  panel.addEventListener("change", function (e) {
    if (e.target && e.target.getAttribute("data-kind-select") != null) {
      syncKindFields(e.target);
    }
    if (e.target && e.target.name === "current" && e.target.checked) {
      var card = e.target.closest("[data-kind]");
      var bucket = card && (cardVals(card).bucket || card.querySelector('[name="bucket"]'));
      var b = typeof bucket === "string" ? bucket : bucket && bucket.value;
      if (!b) return;
      Array.prototype.forEach.call(panel.querySelectorAll('[data-kind="item"]'), function (el) {
        var v = cardVals(el);
        if (v.bucket !== b) return;
        var box = el.querySelector('[name="current"]');
        if (box && box !== e.target) box.checked = false;
      });
    }
  });

  panel.addEventListener("click", function (e) {
    var del = e.target.closest("[data-del]");
    if (del) {
      e.preventDefault();
      onDelete(del.closest("[data-kind]"));
    }
  });

  if (saveBtn) saveBtn.onclick = savePage;
  document.getElementById("btn-rebuild").onclick = function () {
    run("rebuild", {}, "Rebuilt today + 3 weeks.");
  };

  window.addEventListener("hashchange", function () {
    tab = normalizeTab((location.hash || "#day").replace(/^#/, "") || "day");
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
