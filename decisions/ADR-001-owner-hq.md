# ADR-001: Owner HQ as one private, browser-only app with CSV import

**Status:** Accepted
**Date:** 2026-09-28
**Deciders:** Praju

## Context

The target client owns several small businesses and checks a different portal for each. They also want their teams to use AI without risking customer data. Praju's clients use a mix of tools and it isn't known yet which portals matter most, so the first version can't depend on any one API. It must also be a base that can be reused for future client builds.

## Decision

One app with three parts sharing one list of businesses. Data comes in through CSV exports, is read by an importer that guesses the date and money columns, and is stored only in the browser. All logic lives in `core.js` as pure, tested functions.

## Options considered

### A: Browser-only app with CSV import (chosen)

| Dimension | Assessment |
| --- | --- |
| Complexity | Low: static files, no server |
| Cost | Free to host |
| Privacy | Strong: no data leaves the device |
| Reach | Works with any portal that exports CSV |

Cons: one person, one browser; uploads are manual; no shared team view.

### B: Hosted app with login, database, and API connectors

Pros: live data, shared across the team. Cons: weeks of work, an OAuth app per portal, and hosting customer financial data, all before knowing which portals clients use.

### C: Off-the-shelf consolidation or BI tool

Pros: mature. Cons: built for accountants, monthly per-entity fees, and no to-do or training features.

## Consequences

- Easier: demo it to a prospect in minutes; start a client the same day.
- Harder: team members can't see the same data yet, and the owner has to upload fresh files.
- Revisit when a real owner has used it for two weeks: add the connector for the portal they use most, and add sign-in with Canadian hosting if they need a shared view.
- The training lessons are general guidance, not legal or privacy advice.
