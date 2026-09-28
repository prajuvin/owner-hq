const test = require("node:test");
const assert = require("node:assert");
const HQ = require("../public/core.js");

test("CSV parser handles quotes, commas in money, CRLF and blank lines", () => {
  const p = HQ.parseCSV('﻿Date,Item,"Net Sales"\r\n2026-09-01,"Gel, deluxe","$1,234.50"\r\n\r\n2026-09-02,"Say ""hi""",45\n');
  assert.deepStrictEqual(p.headers, ["Date", "Item", "Net Sales"]);
  assert.strictEqual(p.rows.length, 2);
  assert.strictEqual(p.rows[0][1], "Gel, deluxe");
  assert.strictEqual(p.rows[1][1], 'Say "hi"');
});

test("column detection prefers net sales over gross, finds date and type", () => {
  assert.deepStrictEqual(HQ.detectColumns(["Date", "Time", "Gross Sales", "Net Sales", "Category"]), { date: 0, amount: 3, kind: 4 });
  assert.deepStrictEqual(HQ.detectColumns(["Transaction Date", "Description", "Amount"]), { date: 0, amount: 2, kind: -1 });
  assert.strictEqual(HQ.detectColumns(["Name", "Email"]).amount, -1);
});

test("amounts: currency, thousands, negatives and brackets", () => {
  assert.strictEqual(HQ.parseAmount("$1,234.50"), 1234.5);
  assert.strictEqual(HQ.parseAmount("(12.00)"), -12);
  assert.strictEqual(HQ.parseAmount("-$5"), -5);
  assert.strictEqual(HQ.parseAmount("CA$ 20"), 20);
  assert.strictEqual(HQ.parseAmount(""), null);
  assert.strictEqual(HQ.parseAmount("n/a"), null);
});

test("dates in common export formats", () => {
  assert.strictEqual(HQ.parseDate("2026-09-03"), "2026-09-03");
  assert.strictEqual(HQ.parseDate("2026-09-03 14:22:00"), "2026-09-03");
  assert.strictEqual(HQ.parseDate("09/03/2026"), "2026-09-03");
  assert.strictEqual(HQ.parseDate("25/09/2026"), "2026-09-25");
  assert.strictEqual(HQ.parseDate("Sep 3, 2026"), "2026-09-03");
  assert.strictEqual(HQ.parseDate("3 September 2026"), "2026-09-03");
  assert.strictEqual(HQ.parseDate("2026-02-30"), null);
  assert.strictEqual(HQ.parseDate("tomorrow"), null);
});

test("records: expenses and refunds become money out; bad rows are counted", () => {
  const p = HQ.parseCSV("Date,Amount,Type\n2026-09-02,100,Sale\n2026-09-01,30,Expense\nbad,5,Sale\n2026-09-03,,Sale\n");
  const r = HQ.toRecords(p, HQ.detectColumns(p.headers));
  assert.deepStrictEqual(r.records, [{ date: "2026-09-01", amount: -30 }, { date: "2026-09-02", amount: 100 }]);
  assert.strictEqual(r.skipped, 2);
});

test("summary compares this period with the one before", () => {
  const recs = [
    { date: "2026-09-28", amount: 100 }, { date: "2026-09-20", amount: 50 }, { date: "2026-09-10", amount: -40 },
    { date: "2026-08-25", amount: 200 }, { date: "2026-07-01", amount: 999 }, { date: "2026-10-05", amount: 999 }
  ];
  const s = HQ.summarize(recs, "2026-09-28", 30);
  assert.strictEqual(s.moneyIn, 150);
  assert.strictEqual(s.moneyOut, 40);
  assert.strictEqual(s.net, 110);
  assert.strictEqual(s.prevIn, 200);
  assert.strictEqual(s.change, -25);
  assert.strictEqual(s.daysSinceData, 0);
});

test("weekly totals line up with the right week and ignore money out", () => {
  const w = HQ.weekly([{ date: "2026-09-28", amount: 10 }, { date: "2026-09-22", amount: 5 }, { date: "2026-09-21", amount: 7 }, { date: "2026-09-27", amount: -3 }], "2026-09-28", 2);
  assert.deepStrictEqual(w.map((x) => x.total), [7, 15]);
  assert.strictEqual(w[1].start, "2026-09-22");
});

test("tasks: overdue first, then today, upcoming, someday, done", () => {
  const t = [
    { id: 1, title: "someday" }, { id: 2, title: "done", due: "2026-09-01", done: true },
    { id: 3, title: "later", due: "2026-10-10" }, { id: 4, title: "late", due: "2026-09-01" }, { id: 5, title: "today", due: "2026-09-28" }
  ];
  assert.deepStrictEqual(HQ.sortTasks(t, "2026-09-28").map((x) => x.title), ["late", "today", "later", "someday", "done"]);
});

test("alerts flag drops, stale data, missing data and overdue items", () => {
  const biz = [
    { id: "a", name: "Salon", records: [{ date: "2026-09-27", amount: 50 }, { date: "2026-08-20", amount: 100 }] },
    { id: "b", name: "Florist", records: [{ date: "2026-08-01", amount: 50 }] },
    { id: "c", name: "Detailing", records: [] }
  ];
  const a = HQ.alerts(biz, [{ biz: "c", title: "Call supplier", due: "2026-09-20" }], "2026-09-28", 30);
  const text = a.map((x) => x.text).join(" | ");
  assert.match(text, /Salon: money in is down 50%/);
  assert.match(text, /Florist's newest sale is 58 days old/);
  assert.match(text, /Detailing has no sales data yet/);
  assert.match(text, /Detailing has 1 overdue item/);
  assert.strictEqual(a[0].level, "bad");
});

test("training progress counts lessons plus the person's own company procedures", () => {
  const procs = [{ id: "p1", biz: "a" }, { id: "p2", biz: "b" }, { id: "p3" }];
  const p = HQ.progress({ biz: "a", done: { "lesson:what": true, "proc:p1": true } }, procs);
  assert.deepStrictEqual(p, { done: 2, total: HQ.LESSONS.length + 2, percent: Math.round(200 / (HQ.LESSONS.length + 2)) });
  HQ.LESSONS.forEach((l) => assert.ok(l.check.options[l.check.answer], l.id + " has a valid answer"));
});

test("money formatting", () => {
  assert.strictEqual(HQ.money(1234.5), "$1,235");
  assert.strictEqual(HQ.money(45), "$45");
  assert.strictEqual(HQ.money(12.5), "$12.50");
  assert.strictEqual(HQ.money(-30), "−$30");
});
