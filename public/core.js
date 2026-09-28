/* Owner HQ core logic. Pure functions, no network. Works in the browser (window.HQ) and Node (require). */
(function (root) {
  "use strict";
  var DAY = 86400000;

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    text = String(text || "").replace(/^﻿/, "");
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        if (row.some(function (v) { return v.trim() !== ""; })) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell);
    if (row.some(function (v) { return v.trim() !== ""; })) rows.push(row);
    if (!rows.length) return { headers: [], rows: [] };
    var headers = rows[0].map(function (h) { return h.trim(); });
    return { headers: headers, rows: rows.slice(1) };
  }

  /* Guess which columns hold the date and the money. Order = preference. */
  var DATE_HINTS = [/^date$/i, /transaction date/i, /\bdate\b/i, /\bday\b/i, /time/i];
  var AMOUNT_HINTS = [/net sales/i, /^net total$/i, /^amount$/i, /\bamount\b/i, /^total$/i, /gross sales/i, /\btotal\b/i, /revenue/i, /sales/i, /\bpaid\b/i];
  var KIND_HINTS = [/^type$/i, /transaction type/i, /category/i, /\bkind\b/i];
  function pick(headers, hints) {
    for (var h = 0; h < hints.length; h++)
      for (var i = 0; i < headers.length; i++) if (hints[h].test(headers[i])) return i;
    return -1;
  }
  function detectColumns(headers) {
    return { date: pick(headers, DATE_HINTS), amount: pick(headers, AMOUNT_HINTS), kind: pick(headers, KIND_HINTS) };
  }

  function parseAmount(s) {
    s = String(s == null ? "" : s).trim();
    if (!s) return null;
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-\s*\$/.test(s);
    var n = parseFloat(s.replace(/[^0-9.]/g, ""));
    if (isNaN(n)) return null;
    return Math.round((neg ? -n : n) * 100) / 100;
  }

  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(y, m, d) {
    if (!(y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return null;
    return y + "-" + pad(m) + "-" + pad(d);
  }
  /* Accepts 2026-09-03, 2026/09/03, 09/03/2026 (month first, the Canadian bank/Square default), 3 Sep 2026, Sep 3, 2026. */
  function parseDate(s) {
    s = String(s || "").trim();
    var m;
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return ymd(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))) {
      var y = +m[3]; if (y < 100) y += 2000;
      var a = +m[1], b = +m[2];
      return a > 12 ? ymd(y, b, a) : ymd(y, a, b);
    }
    if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/))) return ymd(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
    if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/))) return ymd(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    return null;
  }

  var OUT_WORDS = /expense|refund|cost|bill|payout|withdraw|fee|purchase/i;
  /* Turn CSV rows into {date, amount} records. Money out (refunds, expenses) becomes negative. */
  function toRecords(parsed, map) {
    var out = [], skipped = 0;
    parsed.rows.forEach(function (r) {
      var d = parseDate(r[map.date]), a = parseAmount(r[map.amount]);
      if (!d || a === null) { skipped++; return; }
      if (map.kind > -1 && OUT_WORDS.test(r[map.kind] || "") && a > 0) a = -a;
      out.push({ date: d, amount: a });
    });
    out.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
    return { records: out, skipped: skipped };
  }

  /* ---------- summaries ---------- */
  function dayNum(iso) { return Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY); }
  function isoOf(n) { var d = new Date(n * DAY); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
  function round(n) { return Math.round(n * 100) / 100; }

  /* Compare the last `days` days (ending today) with the `days` before that. */
  function summarize(records, today, days) {
    var t = dayNum(today), cur = { in: 0, out: 0 }, prev = { in: 0, out: 0 }, last = null;
    records.forEach(function (r) {
      var n = dayNum(r.date), age = t - n;
      if (n > t) return;
      if (last === null || r.date > last) last = r.date;
      var bucket = age < days ? cur : age < days * 2 ? prev : null;
      if (!bucket) return;
      if (r.amount >= 0) bucket.in += r.amount; else bucket.out += -r.amount;
    });
    var change = prev.in > 0 ? Math.round(((cur.in - prev.in) / prev.in) * 100) : null;
    return {
      moneyIn: round(cur.in), moneyOut: round(cur.out), net: round(cur.in - cur.out),
      prevIn: round(prev.in), change: change, lastDate: last,
      daysSinceData: last ? t - dayNum(last) : null
    };
  }

  /* Money in per week for the last `weeks` weeks, oldest first. */
  function weekly(records, today, weeks) {
    var t = dayNum(today), out = [];
    for (var w = weeks - 1; w >= 0; w--) out.push({ start: isoOf(t - w * 7 - 6), total: 0 });
    records.forEach(function (r) {
      if (r.amount < 0) return;
      var age = t - dayNum(r.date);
      if (age < 0 || age >= weeks * 7) return;
      out[weeks - 1 - Math.floor(age / 7)].total += r.amount;
    });
    out.forEach(function (x) { x.total = round(x.total); });
    return out;
  }

  /* ---------- tasks and calls ---------- */
  function taskState(task, today) {
    if (task.done) return "done";
    if (!task.due) return "someday";
    if (task.due < today) return "overdue";
    if (task.due === today) return "today";
    return "upcoming";
  }
  var ORDER = { overdue: 0, today: 1, upcoming: 2, someday: 3, done: 4 };
  function sortTasks(tasks, today) {
    return tasks.slice().sort(function (a, b) {
      var sa = ORDER[taskState(a, today)], sb = ORDER[taskState(b, today)];
      if (sa !== sb) return sa - sb;
      if ((a.due || "9999") !== (b.due || "9999")) return (a.due || "9999") < (b.due || "9999") ? -1 : 1;
      return (a.created || 0) - (b.created || 0);
    });
  }

  /* ---------- alerts across all businesses ---------- */
  function alerts(businesses, tasks, today, days) {
    var out = [];
    businesses.forEach(function (b) {
      var s = summarize(b.records || [], today, days);
      if (!b.records || !b.records.length) out.push({ biz: b.id, level: "info", text: b.name + " has no sales data yet. Upload a file to see it here." });
      else if (s.daysSinceData !== null && s.daysSinceData > 14) out.push({ biz: b.id, level: "warn", text: b.name + "'s newest sale is " + s.daysSinceData + " days old. Upload a fresh export." });
      if (s.change !== null && s.change <= -20) out.push({ biz: b.id, level: "bad", text: b.name + ": money in is down " + Math.abs(s.change) + "% compared with the " + days + " days before." });
      if (s.change !== null && s.change >= 20) out.push({ biz: b.id, level: "good", text: b.name + ": money in is up " + s.change + "% compared with the " + days + " days before." });
      var overdue = tasks.filter(function (t) { return t.biz === b.id && taskState(t, today) === "overdue"; }).length;
      if (overdue) out.push({ biz: b.id, level: "warn", text: b.name + " has " + overdue + " overdue " + (overdue === 1 ? "item" : "items") + " on the to-do list." });
    });
    var rank = { bad: 0, warn: 1, info: 2, good: 3 };
    return out.sort(function (a, b) { return rank[a.level] - rank[b.level]; });
  }

  /* ---------- team AI training ---------- */
  var LESSONS = [
    { id: "what", title: "What AI is good at", minutes: 5,
      steps: ["AI tools like ChatGPT, Claude, or Copilot write drafts, summarize, and answer questions in seconds.",
              "They are good at first drafts: replies to reviews, social posts, emails, and checklists.",
              "They can be confidently wrong. Treat every answer as a draft from a new helper, not a fact."],
      check: { q: "An AI tool gives you a price for a supplier's product. What do you do?", options: ["Use it", "Check it with the supplier first"], answer: 1 } },
    { id: "private", title: "Keep private things out", minutes: 5,
      steps: ["Never paste customer names with phone numbers, card numbers, health details, or passwords into an AI tool.",
              "Replace details with placeholders: write “the customer” instead of the real name.",
              "If you're not sure whether something is private, ask the owner before you paste it."],
      check: { q: "Which one is safe to paste?", options: ["“Maria Lopez, 416-555-0199, wants a refund”", "“A customer wants a refund for a late order”"], answer: 1 } },
    { id: "ask", title: "Ask clearly", minutes: 5,
      steps: ["Say who you are, what you need, and who it's for: “I run a nail salon. Write a friendly reply to this 3-star review.”",
              "Say how long and what tone: “Under 60 words, warm, no discounts.”",
              "If the answer is off, say what to change instead of starting over."],
      check: { q: "Which request will get a better answer?", options: ["“Write a reply”", "“Write a warm, 50-word reply to this review from a regular customer”"], answer: 1 } },
    { id: "check", title: "Check before you send", minutes: 5,
      steps: ["Read every AI draft out loud before it goes to a customer.",
              "Check names, prices, dates, and promises. Remove anything we don't actually offer.",
              "You are responsible for what you send, not the AI."],
      check: { q: "The draft promises “20% off your next visit.” We don't offer that. What do you do?", options: ["Remove it before sending", "Send it anyway"], answer: 0 } },
    { id: "daily", title: "Use it for your daily jobs", minutes: 10,
      steps: ["Pick one job you do every week, like writing the weekly social post or replying to reviews.",
              "Do it once with AI and once without. Keep whichever is better.",
              "Share the request that worked with the team so everyone can reuse it."],
      check: { q: "What's the best first job to try AI on?", options: ["A small job you do every week", "The yearly tax filing"], answer: 0 } },
    { id: "ask-owner", title: "When to ask the owner", minutes: 3,
      steps: ["Ask before using AI for anything about money, contracts, staff issues, or legal questions.",
              "Ask before signing up for a new AI tool with the business email.",
              "When in doubt, ask. Nobody gets in trouble for asking."],
      check: { q: "A new AI app asks to connect to the business email. What do you do?", options: ["Connect it", "Ask the owner first"], answer: 1 } }
  ];

  function progress(person, procedures) {
    var done = person.done || {};
    var items = LESSONS.map(function (l) { return "lesson:" + l.id; }).concat((procedures || []).filter(function (p) { return !p.biz || p.biz === person.biz; }).map(function (p) { return "proc:" + p.id; }));
    var n = items.filter(function (k) { return done[k]; }).length;
    return { done: n, total: items.length, percent: items.length ? Math.round((n / items.length) * 100) : 0 };
  }

  function money(n) {
    var neg = n < 0; n = Math.abs(n);
    var s = n >= 1000 ? Math.round(n).toLocaleString("en-CA") : (Math.round(n * 100) / 100).toLocaleString("en-CA", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
    return (neg ? "−$" : "$") + s;
  }

  var api = { parseCSV: parseCSV, detectColumns: detectColumns, parseAmount: parseAmount, parseDate: parseDate, toRecords: toRecords,
    summarize: summarize, weekly: weekly, taskState: taskState, sortTasks: sortTasks, alerts: alerts, LESSONS: LESSONS, progress: progress,
    money: money, dayNum: dayNum, isoOf: isoOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.HQ = api;
})(this);
