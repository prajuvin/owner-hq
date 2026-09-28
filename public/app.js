/* Owner HQ interface. All data stays in this browser (localStorage) unless the owner saves a backup file. */
(function () {
  "use strict";
  var HQ = window.HQ, $ = function (id) { return document.getElementById(id); };
  var KEY = "owner-hq-v1";
  var COLORS = ["#0E7453", "#2B5FA8", "#C0572C", "#8A6A12", "#0E7490", "#9F3A55", "#4D7C0F", "#52525B"];
  var KIND = { task: "To-do", call: "Call back", follow: "Follow up" };
  var GROUPS = [["overdue", "Overdue"], ["today", "Today"], ["upcoming", "Coming up"], ["someday", "No date"], ["done", "Done"]];
  var S = load(), pending = null;

  function blank() { return { businesses: [], tasks: [], people: [], procedures: [], period: 30 }; }
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.businesses)) return Object.assign(blank(), s); } catch (e) {}
    return blank();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { $("backupMsg").textContent = "This browser can't save. Use Backup to keep a copy."; } }
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function uid() { return Math.random().toString(36).slice(2, 9); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function bizName(id) { var b = S.businesses.find(function (x) { return x.id === id; }); return b ? b.name : "All businesses"; }
  function nice(iso) { return iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : ""; }
  function showErr(id, msg) { $(id).textContent = msg; $(id).hidden = !msg; }

  /* ---------- sections ---------- */
  function show(id) {
    ["p1", "p2", "p3"].forEach(function (p) { $(p).hidden = p !== id; });
    document.querySelectorAll(".step").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.p === id ? "true" : "false"); });
    render();
  }
  document.querySelectorAll(".step").forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.p); }); });

  /* ---------- 1. businesses ---------- */
  function fillSelect(sel, opts, value) {
    sel.textContent = "";
    opts.forEach(function (o) { var op = el("option", null, o[1]); op.value = o[0]; sel.appendChild(op); });
    if (value != null && opts.some(function (o) { return o[0] === value; })) sel.value = value;
  }
  $("bizFile").addEventListener("change", function () {
    showErr("bizErr", ""); pending = null; $("mapper").hidden = true;
    var f = this.files[0]; if (!f) return;
    if (f.size > 20 * 1024 * 1024) return showErr("bizErr", "That file is over 20 MB. Export a shorter date range and try again.");
    var reader = new FileReader();
    reader.onload = function () { prepare(reader.result, f.name); };
    reader.onerror = function () { showErr("bizErr", "That file couldn't be read. Try downloading it again."); };
    reader.readAsText(f);
  });
  function prepare(text, fileName) {
    var parsed = HQ.parseCSV(text);
    if (parsed.headers.length < 2 || !parsed.rows.length) return showErr("bizErr", "That doesn't look like a spreadsheet file with rows. Choose a .csv export.");
    var m = HQ.detectColumns(parsed.headers);
    pending = { parsed: parsed, fileName: fileName };
    var cols = parsed.headers.map(function (h, i) { return [String(i), h || "Column " + (i + 1)]; });
    fillSelect($("mapDate"), [["-1", "Choose a column"]].concat(cols), String(m.date));
    fillSelect($("mapAmount"), [["-1", "Choose a column"]].concat(cols), String(m.amount));
    fillSelect($("mapKind"), [["-1", "None"]].concat(cols), String(m.kind));
    $("mapper").hidden = false;
    $("foundMsg").textContent = (m.date > -1 && m.amount > -1)
      ? "We found the date in “" + parsed.headers[m.date] + "” and the money in “" + parsed.headers[m.amount] + "”. Change these if they look wrong."
      : "We couldn't tell which columns to use. Pick them below.";
    preview();
    if (!$("bizName").value.trim()) $("bizName").value = fileName.replace(/\.csv$/i, "").replace(/[-_]+/g, " ").replace(/\b(export|report|transactions?)\b/gi, "").trim();
  }
  function currentMap() { return { date: +$("mapDate").value, amount: +$("mapAmount").value, kind: +$("mapKind").value }; }
  function preview() {
    if (!pending) return;
    var m = currentMap();
    if (m.date < 0 || m.amount < 0) { $("previewMsg").textContent = "Pick the date and money columns to continue."; return; }
    var r = HQ.toRecords(pending.parsed, m);
    $("previewMsg").textContent = r.records.length
      ? r.records.length + " rows ready, from " + nice(r.records[0].date) + " to " + nice(r.records[r.records.length - 1].date) + "." + (r.skipped ? " " + r.skipped + " rows had no date or amount and will be skipped." : "")
      : "None of the rows have a date and an amount in those columns. Try different columns.";
  }
  ["mapDate", "mapAmount", "mapKind"].forEach(function (id) { $(id).addEventListener("change", preview); });

  $("saveBiz").addEventListener("click", function () {
    var name = $("bizName").value.trim(), replace = $("replaceId").value;
    if (!name) return showErr("bizErr", "Give the business a name first.");
    if (!pending) return showErr("bizErr", "Choose a sales or transactions file first.");
    var m = currentMap();
    if (m.date < 0 || m.amount < 0) return showErr("bizErr", "Pick which columns hold the date and the money.");
    var r = HQ.toRecords(pending.parsed, m);
    if (!r.records.length) return showErr("bizErr", "No rows had both a date and an amount. Check the columns you picked.");
    var existing = S.businesses.find(function (b) { return b.id === replace; });
    if (existing) { existing.name = name; existing.records = r.records; existing.source = pending.fileName; existing.updated = today(); }
    else S.businesses.push({ id: uid(), name: name, color: COLORS[S.businesses.length % COLORS.length], records: r.records, source: pending.fileName, updated: today() });
    save(); resetAdd(); render();
    $("bizList").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  function resetAdd() {
    pending = null; $("bizName").value = ""; $("bizFile").value = ""; $("replaceId").value = "";
    $("mapper").hidden = true; showErr("bizErr", ""); $("addH").textContent = "Add a business"; $("saveBiz").textContent = "Add this business";
  }

  $("period").addEventListener("change", function () { S.period = +this.value; save(); render(); });

  function renderBusinesses() {
    var has = S.businesses.length > 0, t = today(), days = S.period;
    $("welcome").hidden = has; $("dash").hidden = !has; $("period").value = String(days);
    if (!has) return;
    var sums = S.businesses.map(function (b) { return HQ.summarize(b.records, t, days); });
    var tot = sums.reduce(function (a, s) { a.in += s.moneyIn; a.out += s.moneyOut; a.prev += s.prevIn; return a; }, { in: 0, out: 0, prev: 0 });
    var ch = tot.prev > 0 ? Math.round(((tot.in - tot.prev) / tot.prev) * 100) : null;
    var T = $("totals"); T.textContent = "";
    [["Money in, all businesses", HQ.money(tot.in)], ["Money out", HQ.money(tot.out)], ["What's left", HQ.money(tot.in - tot.out)],
     ["Compared with the " + days + " days before", ch === null ? "New" : (ch > 0 ? "+" : "") + ch + "%"]].forEach(function (x) {
      var d = el("div", "tot"); d.appendChild(el("span", null, x[0])); d.appendChild(el("b", null, x[1])); T.appendChild(d);
    });

    var A = $("alerts"); A.textContent = "";
    var LBL = { bad: "Needs a look:", warn: "Heads up:", info: "", good: "Good news:" };
    HQ.alerts(S.businesses, S.tasks, t, days).forEach(function (a) {
      var d = el("p", "alert a-" + a.level); if (LBL[a.level]) d.appendChild(el("b", null, LBL[a.level])); d.appendChild(document.createTextNode((LBL[a.level] ? " " : "") + a.text)); A.appendChild(d);
    });

    renderChart(t);

    var L = $("bizList"); L.textContent = "";
    S.businesses.forEach(function (b, i) {
      var s = sums[i], c = el("article", "biz");
      var h = el("h3"); var dot = el("span", "dot"); dot.style.background = b.color; dot.setAttribute("aria-hidden", "true");
      h.appendChild(dot); h.appendChild(document.createTextNode(b.name)); c.appendChild(h);
      var big = el("div", "big", HQ.money(s.moneyIn));
      if (s.change !== null) big.appendChild(el("span", "pill " + (s.change >= 5 ? "p-up" : s.change <= -5 ? "p-down" : "p-flat"), (s.change > 0 ? "↑ " : s.change < 0 ? "↓ " : "") + Math.abs(s.change) + "%"));
      c.appendChild(big);
      c.appendChild(el("div", "meta", "Money in, last " + days + " days" + (s.moneyOut ? " · " + HQ.money(s.moneyOut) + " out" : "")));
      c.appendChild(el("div", "meta", s.lastDate ? "Newest sale: " + nice(s.lastDate) + " · from " + (b.source || "upload") : "No sales yet"));
      var open = S.tasks.filter(function (x) { return x.biz === b.id && !x.done; }).length;
      c.appendChild(el("div", "meta", open + " open " + (open === 1 ? "item" : "items") + " on the to-do list"));
      var acts = el("div", "acts");
      var up = el("button", "go ghost small", "Upload a new file"); up.type = "button";
      up.addEventListener("click", function () {
        resetAdd(); $("replaceId").value = b.id; $("bizName").value = b.name; $("addH").textContent = "Update " + b.name; $("saveBiz").textContent = "Update " + b.name;
        $("addBiz").scrollIntoView({ behavior: "smooth" }); $("bizFile").focus();
      });
      var rm = el("button", "remove", "Remove"); rm.type = "button"; rm.setAttribute("aria-label", "Remove " + b.name);
      rm.addEventListener("click", function () {
        if (rm.dataset.sure) { S.businesses = S.businesses.filter(function (x) { return x.id !== b.id; }); save(); render(); }
        else { rm.dataset.sure = "1"; rm.textContent = "Tap again to remove " + b.name; }
      });
      acts.appendChild(up); acts.appendChild(rm); c.appendChild(acts);
      L.appendChild(c);
    });
  }

  function renderChart(t) {
    var weeks = S.period <= 30 ? 8 : 13;
    var series = S.businesses.map(function (b) { return { b: b, w: HQ.weekly(b.records, t, weeks) }; });
    var max = 0; series.forEach(function (s) { s.w.forEach(function (x) { if (x.total > max) max = x.total; }); });
    var W = 720, H = 280, L = 64, R = 16, Tp = 16, B = 40, pw = W - L - R, ph = H - Tp - B;
    var step = niceStep(max / 4), top = Math.max(step * 4, step * Math.ceil(max / step)) || 100;
    var x = function (i) { return L + (weeks === 1 ? 0 : (i * pw) / (weeks - 1)); }, y = function (v) { return Tp + ph - (v / top) * ph; };
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-labelledby="chartT"><title id="chartT">Money in per week for each business, last ' + weeks + " weeks</title>";
    for (var g = 0; g <= top + 0.001; g += step) {
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g) + '" y2="' + y(g) + '" stroke="#E4E4E2" stroke-width="1"/>';
      svg += '<text x="' + (L - 8) + '" y="' + (y(g) + 5) + '" text-anchor="end" font-size="13" fill="#63636B">' + short(g) + "</text>";
    }
    series[0].w.forEach(function (wk, i) {
      if (i % (weeks > 8 ? 3 : 2) === 0 || i === weeks - 1)
        svg += '<text x="' + x(i) + '" y="' + (H - 12) + '" text-anchor="' + (i === weeks - 1 ? "end" : i === 0 ? "start" : "middle") + '" font-size="13" fill="#63636B">' + new Date(wk.start + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" }) + "</text>";
    });
    series.forEach(function (s) {
      var pts = s.w.map(function (wk, i) { return x(i).toFixed(1) + "," + y(wk.total).toFixed(1); });
      svg += '<polyline fill="none" stroke="' + s.b.color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="' + pts.join(" ") + '"/>';
      var last = s.w[s.w.length - 1];
      svg += '<circle cx="' + x(weeks - 1) + '" cy="' + y(last.total) + '" r="6" fill="#fff" stroke="' + s.b.color + '" stroke-width="3"/>';
    });
    svg += "</svg>";
    var leg = '<div class="legend">' + series.map(function (s) { return '<span><i style="background:' + s.b.color + '"></i>' + esc(s.b.name) + "</span>"; }).join("") + "</div>";
    $("chart").innerHTML = svg + leg;
    var tbl = "<table><thead><tr><th>Week starting</th>" + series.map(function (s) { return "<th>" + esc(s.b.name) + "</th>"; }).join("") + "</tr></thead><tbody>";
    series[0].w.forEach(function (wk, i) { tbl += "<tr><td>" + nice(wk.start) + "</td>" + series.map(function (s) { return "<td>" + HQ.money(s.w[i].total) + "</td>"; }).join("") + "</tr>"; });
    $("chartTable").innerHTML = tbl + "</tbody></table>";
  }
  function niceStep(v) { if (v <= 0) return 25; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function short(v) { return v >= 1000 ? "$" + (v / 1000).toFixed(v % 1000 ? 1 : 0) + "k" : "$" + v; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* Example businesses: the real sample exports, shifted so their newest day is yesterday. */
  $("loadExamples").addEventListener("click", function () {
    var btn = this; btn.textContent = "Loading examples…";
    var files = [["Sunrise Nails (example)", "samples/sunrise-nails-square-export.csv"], ["Petal and Stem Florist (example)", "samples/petal-and-stem-quickbooks-export.csv"], ["Northside Detailing (example)", "samples/northside-detailing-bank-export.csv"]];
    Promise.all(files.map(function (f) { return fetch(f[1]).then(function (r) { if (!r.ok) throw new Error(); return r.text(); }); })).then(function (texts) {
      var y = HQ.dayNum(today()) - 1;
      texts.forEach(function (text, i) {
        var p = HQ.parseCSV(text), r = HQ.toRecords(p, HQ.detectColumns(p.headers)).records;
        var shift = y - HQ.dayNum(r[r.length - 1].date);
        r.forEach(function (x) { x.date = HQ.isoOf(HQ.dayNum(x.date) + shift); });
        S.businesses.push({ id: uid(), name: files[i][0], color: COLORS[S.businesses.length % COLORS.length], records: r, source: files[i][1].split("/")[1], updated: today() });
      });
      var ids = S.businesses.map(function (b) { return b.id; }), d = function (n) { return HQ.isoOf(HQ.dayNum(today()) + n); };
      S.tasks.push(
        { id: uid(), biz: ids[0], kind: "call", title: "Call back Maria about the bridal party booking", due: d(-2), phone: "416-555-0142", created: Date.now() },
        { id: uid(), biz: ids[1], kind: "task", title: "Order stems for Thanksgiving weekend", due: d(0), created: Date.now() + 1 },
        { id: uid(), biz: ids[2], kind: "follow", title: "Follow up on the fleet cleaning quote", due: d(3), created: Date.now() + 2 });
      S.people.push({ id: uid(), name: "Jordan (example)", biz: ids[0], done: { "lesson:what": true, "lesson:private": true } }, { id: uid(), name: "Priya (example)", biz: ids[1], done: {} });
      S.procedures.push({ id: uid(), biz: ids[0], title: "Replying to a Google review with AI", steps: ["Copy the review, without the customer's name", "Ask: “Write a warm 50-word reply from a nail salon owner”", "Read it out loud and fix anything we don't offer", "Post it from the salon's Google account"] });
      save(); render();
    }).catch(function () { btn.textContent = "Try it with 3 example businesses"; showErr("bizErr", "The example files couldn't load. Check your connection and try again."); });
  });

  /* ---------- 2. to-do and calls ---------- */
  $("addTask").addEventListener("click", function () {
    var title = $("taskTitle").value.trim();
    if (!title) return showErr("taskErr", "Write what needs doing first.");
    showErr("taskErr", "");
    S.tasks.push({ id: uid(), title: title.slice(0, 200), kind: $("taskKind").value, biz: $("taskBiz").value, due: $("taskDue").value || "", phone: $("taskPhone").value.trim().slice(0, 120), created: Date.now() });
    $("taskTitle").value = ""; $("taskDue").value = ""; $("taskPhone").value = "";
    save(); render(); $("taskTitle").focus();
  });
  $("taskFilter").addEventListener("change", renderTasks);
  function renderTasks() {
    var t = today(), f = $("taskFilter").value, box = $("taskList"); box.textContent = "";
    var list = HQ.sortTasks(S.tasks.filter(function (x) { return f === "all" || x.biz === f; }), t);
    if (!list.length) { box.appendChild(el("p", "card", "Nothing on the list. Add a to-do or a call back above.")); return; }
    GROUPS.forEach(function (g) {
      var items = list.filter(function (x) { return HQ.taskState(x, t) === g[0]; });
      if (!items.length) return;
      var sec = el("div", "group"); sec.appendChild(el("h3", null, g[1] + " (" + items.length + ")"));
      items.forEach(function (x) {
        var row = el("div", "task " + g[0]);
        var cb = el("input"); cb.type = "checkbox"; cb.checked = !!x.done; cb.id = "done-" + x.id;
        cb.setAttribute("aria-label", (x.done ? "Mark not done: " : "Mark done: ") + x.title);
        cb.addEventListener("change", function () { x.done = cb.checked; save(); render(); });
        var body = el("div", "body");
        var tl = el("div", "title"); tl.appendChild(el("span", "kind", KIND[x.kind] || "To-do")); tl.appendChild(document.createTextNode(" " + x.title)); body.appendChild(tl);
        body.appendChild(el("div", "meta", [bizName(x.biz), x.due ? (g[0] === "overdue" ? "was due " : "due ") + nice(x.due) : "", x.phone].filter(Boolean).join(" · ")));
        var rm = el("button", "remove", "Delete"); rm.type = "button"; rm.setAttribute("aria-label", "Delete: " + x.title);
        rm.addEventListener("click", function () { S.tasks = S.tasks.filter(function (y) { return y.id !== x.id; }); save(); render(); });
        row.appendChild(cb); row.appendChild(body); row.appendChild(rm); sec.appendChild(row);
      });
      box.appendChild(sec);
    });
  }

  /* ---------- 3. team AI training ---------- */
  $("addPerson").addEventListener("click", function () {
    var n = $("personName").value.trim();
    if (!n) return showErr("personErr", "Write the person's name first.");
    showErr("personErr", "");
    S.people.push({ id: uid(), name: n.slice(0, 60), biz: $("personBiz").value, done: {} });
    $("personName").value = ""; save(); render();
  });
  $("addProc").addEventListener("click", function () {
    var title = $("procTitle").value.trim(), steps = $("procSteps").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!title) return showErr("procErr", "Give the procedure a name.");
    if (steps.length < 2) return showErr("procErr", "Write at least two steps, one per line.");
    showErr("procErr", "");
    S.procedures.push({ id: uid(), title: title.slice(0, 120), biz: $("procBiz").value === "all" ? "" : $("procBiz").value, steps: steps.slice(0, 30) });
    $("procTitle").value = ""; $("procSteps").value = ""; save(); render();
  });

  function renderPeople() {
    var box = $("people"); box.textContent = "";
    if (!S.people.length) { box.appendChild(el("p", "hint", "No team members yet. Add someone above to start their lessons.")); }
    S.people.forEach(function (p) {
      var pr = HQ.progress(p, S.procedures), c = el("div", "person");
      var head = el("div", "head"); head.appendChild(el("h3", null, p.name));
      head.appendChild(el("span", "meta", bizName(p.biz) + " · " + pr.done + " of " + pr.total + " done")); c.appendChild(head);
      var m = el("div", "meter"); m.setAttribute("role", "progressbar"); m.setAttribute("aria-label", p.name + " training progress");
      m.setAttribute("aria-valuemin", "0"); m.setAttribute("aria-valuemax", "100"); m.setAttribute("aria-valuenow", String(pr.percent));
      var fill = el("i"); fill.style.width = pr.percent + "%"; m.appendChild(fill); c.appendChild(m);
      var ls = el("div", "lessons");
      HQ.LESSONS.forEach(function (l) { ls.appendChild(lessonBtn(p, "lesson:" + l.id, l.title, function () { openLesson(p, l); })); });
      S.procedures.filter(function (x) { return !x.biz || x.biz === p.biz; }).forEach(function (x) { ls.appendChild(lessonBtn(p, "proc:" + x.id, x.title, function () { openProc(p, x); })); });
      c.appendChild(ls);
      var rm = el("button", "remove", "Remove " + p.name); rm.type = "button";
      rm.addEventListener("click", function () { S.people = S.people.filter(function (y) { return y.id !== p.id; }); $("lessonView").hidden = true; save(); render(); });
      c.appendChild(rm); box.appendChild(c);
    });
  }
  function lessonBtn(p, key, title, fn) {
    var b = el("button", "lbtn" + (p.done && p.done[key] ? " done" : ""), title); b.type = "button";
    b.setAttribute("aria-label", title + (p.done && p.done[key] ? " (done)" : "") + " for " + p.name);
    b.addEventListener("click", fn); return b;
  }
  function openLesson(p, l) {
    var v = $("lessonView"); v.textContent = ""; v.hidden = false;
    v.appendChild(el("p", "meta", p.name + " · about " + l.minutes + " minutes"));
    v.appendChild(el("h2", null, l.title));
    var ol = el("ol", "steps-list"); l.steps.forEach(function (s) { ol.appendChild(el("li", null, s)); }); v.appendChild(ol);
    v.appendChild(el("h3", null, "Quick check"));
    v.appendChild(el("p", null, l.check.q));
    var ch = el("div", "choices"), msg = el("p", "status"); msg.setAttribute("role", "status");
    l.check.options.forEach(function (o, i) {
      var b = el("button", "choice", o); b.type = "button";
      b.addEventListener("click", function () {
        if (i === l.check.answer) { p.done = p.done || {}; p.done["lesson:" + l.id] = true; save(); msg.textContent = "Right! Lesson done."; renderPeople(); }
        else { msg.textContent = "Not quite. Read the steps above again and try once more."; }
      });
      ch.appendChild(b);
    });
    v.appendChild(ch); v.appendChild(msg); v.appendChild(closeBtn()); v.focus(); v.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function openProc(p, x) {
    var v = $("lessonView"); v.textContent = ""; v.hidden = false;
    v.appendChild(el("p", "meta", p.name + " · " + (x.biz ? bizName(x.biz) : "All businesses") + " procedure"));
    v.appendChild(el("h2", null, x.title));
    var ol = el("ol", "steps-list"); x.steps.forEach(function (s) { ol.appendChild(el("li", null, s)); }); v.appendChild(ol);
    var msg = el("p", "status"); msg.setAttribute("role", "status");
    var ok = el("button", "go", "I've read this and can do it"); ok.type = "button";
    ok.addEventListener("click", function () { p.done = p.done || {}; p.done["proc:" + x.id] = true; save(); msg.textContent = "Marked as done."; renderPeople(); });
    v.appendChild(ok); v.appendChild(msg); v.appendChild(closeBtn()); v.focus(); v.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function closeBtn() { var b = el("button", "go ghost wide", "Close"); b.type = "button"; b.addEventListener("click", function () { $("lessonView").hidden = true; }); return b; }
  function renderProcs() {
    var box = $("procList"); box.textContent = "";
    S.procedures.forEach(function (x) {
      var d = el("div", "proc"); d.appendChild(el("h3", null, x.title));
      d.appendChild(el("p", "meta", (x.biz ? bizName(x.biz) : "All businesses") + " · " + x.steps.length + " steps"));
      var rm = el("button", "remove", "Delete procedure"); rm.type = "button"; rm.setAttribute("aria-label", "Delete procedure: " + x.title);
      rm.addEventListener("click", function () { S.procedures = S.procedures.filter(function (y) { return y.id !== x.id; }); save(); render(); });
      d.appendChild(rm); box.appendChild(d);
    });
  }

  /* ---------- backup ---------- */
  $("openBackup").addEventListener("click", function () { var h = !$("backup").hidden; $("backup").hidden = h; this.setAttribute("aria-expanded", String(!h)); });
  $("saveBackup").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(Object.assign({ app: "owner-hq", version: 1, saved: new Date().toISOString() }, S))], { type: "application/json" });
    var a = el("a"); a.href = URL.createObjectURL(blob); a.download = "owner-hq-backup-" + today() + ".json";
    document.body.appendChild(a); a.click(); a.remove(); $("backupMsg").textContent = "Backup file saved to your downloads.";
  });
  $("loadBackup").addEventListener("change", function () {
    var f = this.files[0]; if (!f) return; var r = new FileReader();
    r.onload = function () {
      try { var d = JSON.parse(r.result); if (d.app !== "owner-hq" || !Array.isArray(d.businesses)) throw new Error();
        S = Object.assign(blank(), { businesses: d.businesses, tasks: d.tasks || [], people: d.people || [], procedures: d.procedures || [], period: d.period || 30 });
        save(); render(); $("backupMsg").textContent = "Backup opened: " + S.businesses.length + " businesses.";
      } catch (e) { $("backupMsg").textContent = "That isn't an Owner HQ backup file."; }
    };
    r.readAsText(f); this.value = "";
  });
  $("startOver").addEventListener("click", function () { $("confirmReset").hidden = false; $("noReset").focus(); });
  $("noReset").addEventListener("click", function () { $("confirmReset").hidden = true; });
  $("yesReset").addEventListener("click", function () { S = blank(); save(); $("confirmReset").hidden = true; $("backupMsg").textContent = "Everything was deleted from this browser."; resetAdd(); render(); });

  /* ---------- render ---------- */
  function render() {
    var bizOpts = S.businesses.map(function (b) { return [b.id, b.name]; });
    var keep = function (id) { return $(id).value; };
    var tf = keep("taskFilter") || "all", tb = keep("taskBiz"), pb = keep("personBiz"), prb = keep("procBiz");
    fillSelect($("taskFilter"), [["all", "All businesses"]].concat(bizOpts), bizOpts.some(function (o) { return o[0] === tf; }) ? tf : "all");
    fillSelect($("taskBiz"), bizOpts.length ? bizOpts : [["", "Add a business first"]], tb || null);
    fillSelect($("personBiz"), bizOpts.length ? bizOpts : [["", "Add a business first"]], pb || null);
    fillSelect($("procBiz"), [["all", "All businesses"]].concat(bizOpts), prb || "all");
    renderBusinesses(); renderTasks(); renderPeople(); renderProcs();
  }
  render();
})();
