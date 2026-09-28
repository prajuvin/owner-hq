# Owner HQ

**For people who run more than one business. See every company's money in one place, keep one to-do and call list for all of them, and train your team to use AI safely. No logins to juggle.**

**Try it:** https://owner-hq.vercel.app *(tap "Try it with 3 example businesses")*

## The problem

An owner with a salon, a florist, and a detailing shop logs into Square for one, QuickBooks for another, and the bank for the third, just to answer "how are we doing?" Reporting across several companies usually means copying numbers into spreadsheets by hand ([Joiin, 2026](https://www.joiin.co/best-financial-consolidation-software-for-2026/)).

Their teams are starting to use AI, often with no guidance. Among Canadian businesses with 1 to 4 employees that use AI, only 24% trained their employees on it ([Statistics Canada, Q2 2026](https://www150.statcan.gc.ca/n1/pub/11-621-m/11-621-m2026010-eng.htm)). Nearly half of employees using AI at small and medium organizations report getting no training ([Future Skills Centre](https://fsc-ccf.ca/research/bridging-ai-skills-gap/)).

## Three parts, one place

| Part | What the owner does | What they get |
| --- | --- | --- |
| **My businesses** | Uploads a sales or transactions export from any portal | Money in, money out, and what's left for each business and all together; week-by-week chart; plain alerts like "Sunrise Nails is down 28%" or "Florist's data is 20 days old" |
| **To-do and calls** | Adds to-dos, call-backs, and follow-ups, each tagged to a business | One list sorted overdue, today, coming up; filter by business |
| **Team AI training** | Adds team members and writes their own procedures | Six 5-minute lessons on safe AI use with a quick check each; progress per person; the owner's own step-by-step procedures |

## Works with the portals you already use

No setup or API keys: download a CSV and add it. The importer finds the date and money columns itself, and the owner can correct it. Tested on three export styles:

| Export style | Example columns | Result |
| --- | --- | --- |
| Square daily summary | Date, Gross Sales, Net Sales, Tips | Uses Net Sales, reads MM/DD/YYYY dates |
| QuickBooks transaction list | Date, Transaction Type, Amount | Treats Expense rows as money out |
| Bank statement | Transaction Date, Description, Amount | Reads "Sep 3, 2026" dates and negative withdrawals |

Samples are in [`public/samples/`](public/samples).

## Private by design

Everything stays in the owner's browser. Nothing is sent to a server, so there's no account, no database, and no customer data leaving the device. Owners move data between computers with a backup file. This is also why it can start the same day: there's nothing to approve or connect.

## Use it as a base for client work

This repo is a starting point for YHWH Digital client builds:

- `public/core.js` holds all the logic (importing, summaries, alerts, sorting, training progress) as plain functions with tests. Reuse it in any front end.
- Add a live connector (Square, QuickBooks, Google Sheets) by producing the same `{date, amount}` records the CSV importer does.
- Swap the six lessons in `LESSONS` for an industry-specific set.

See [`decisions/ADR-001-owner-hq.md`](decisions/ADR-001-owner-hq.md) for why it's built this way and what comes next.

## Run and test

```bash
python -m http.server -d public 8000   # open http://localhost:8000
npm test                               # 11 unit tests on core.js
python tests/e2e_check.py              # full owner flow in a browser, phone and desktop size
```

Last full check (2026-09-28): 11 unit tests passed. The browser test at phone and desktop width covered: loading examples, uploading a real file with column correction, rejecting a bad file, adding, filtering, and completing to-dos, a wrong then right lesson answer, a procedure reaching only its business's staff, data kept after reload, and backup, start over, and restore. The dashboard total matched the core logic. An axe accessibility scan found no WCAG A or AA issues, with no sideways scrolling.

## Roadmap

| When | What | Status |
| --- | --- | --- |
| Now | CSV import, cross-business dashboard, alerts, to-do and calls, AI lessons, procedures, backup | Done |
| Now | Try it with one real multi-business owner for two weeks | Not started |
| Next | Live connectors: Square, then QuickBooks | Not started |
| Next | Shared team access (sign-in, data hosted in Canada) | Not started |
| Later | Ask questions in plain words ("which shop had the best September?") | Not started |
| Later | Call log import from the phone system | Not started |

Part of the [Ontario SMB Problem Atlas](https://github.com/prajuvin/ontario-smb-problem-atlas). Built by Praju at YHWH Digital, Toronto. *We refresh businesses. We rise together.*
