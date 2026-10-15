# Applying the tree (Step B), then the population tables: plan

**Status: report only. No app code changes.** Applying the tree changes app totals. Your
data-integrity instruction was "don't change app totals until I approve the audit", so every
step that moves a total waits for your go-ahead, marked **GO**.

This follows `docs/population-tables-plan.md`, which covers the tables themselves (1 roll-up,
2 plan vs target, 5 plan × servicing). The audit figures come from `data/tree-audit.json` on
main.

---

## 1. What applying the tree changes

| | Today (app grouping) | With the tree |
|---|---|---|
| Peel planned units, all stages | **248,340** | **263,277** (+14,937, +6%) |
| Mississauga | 90,484 | 91,457 (+1%) |
| Brampton | 128,496 | 140,330 (+9%) |
| Caledon | 29,360 | 31,490 (+7%) |
| Grouping | 3,347 developments | 3,926 trees (some developments split into several) |

**Where the difference comes from** (`biggestChanges`, top 20 listed in the audit):

- **Proposals the app counted as 0 that the tree counts.**
  - 111 Mayfield Rd: 0 → **9,961**, from a pre-consultation's own count (PRE-2026-0016).
  - 10884 Winston Churchill: 0 → 2,341.
  - 1-200 County Court: 0 → 1,946.
  - The first needs a decision. The counting rule says pre-consultations count 0 unless
    nothing else exists. Here it is the only source, so the tree used it.
- **Children replacing a parent that states no count.** Example: the Heritage Heights cluster,
  6,933 → 9,862.
- **App developments that are really several proposals.** Example: 10625 Mississauga Rd, where
  the app groups 7 trees whose files don't overlap. These become separate developments.

**Items in the audit still waiting on a call:**

| List | Count |
|---|---|
| Review: nested formal files not linked | 2 groups |
| Double counts found | 5 |
| Unit mismatches | 11 |
| Plan amendments (policy) | 7 |
| Growth with no count | 4 |
| Date order reversed | 28 |
| Orphans | 3 |

**Downstream effects:**
- servicing loads and every plant percentage (G.E. Booth's 95% committed moves);
- DC timing;
- the header, Overview, briefing and exports;
- **development keys**, which share links, the watchlist, recorded allocations and saved memos
  use.

---

## 2. Plan

### Step B0: review and sign-off (no code) → **GO 1**

1. A **before/after workbook**, one row per tree, with columns:
   - the app development(s) it came from;
   - app units vs tree units, and why (the counting rule used);
   - confidence;
   - the plan and plant it lands in.

   Plus tabs for each review list above. It's built by `scripts/audit-tree.js`; data only, the
   app is unchanged.
2. You mark the 20 biggest changes and the review lists **accept / override**. Overrides go into
   `data/tree-overrides.json`, each with a reason and a source.
3. Decision **B-a:** may a pre-consultation's own count stand when it is the only count? I
   recommend yes, flagged "estimate (pre-consultation)" and kept out of committed.
4. Decisions **D2–D4** from the tables plan: innermost primary plan, Overview basis, and a
   targets file.

### Step B1: tree counts inside today's developments → **GO 2**

The least disruptive step. Development keys stay the same.

- Load `js/tree.js` in the app. For each app development, units = the sum of the counts of the
  trees whose root files belong to it. The overrides apply.
- **A setting for one release:** Settings › Counting: *Tree (new)* | *Previous*, so you and your
  manager can compare side by side. The header shows which one is in use.
- Every number that moves is listed in the change log entry, with the impact at Peel level.
- **Tests:**
  - `countTree` on fixtures;
  - every development's units equal the sum of its trees;
  - Peel equals the audit total (263,277 less the overrides);
  - the previous mode still returns 248,340;
  - committed (D-5-1) still uses the latest subdivision file.

### Step B2: trees become the developments → **GO 3**

- Developments are the trees: 3,926. An app development holding unrelated trees splits.
- **Key migration** (`data/key-map.json`, old key → new key or keys). Share links, the watchlist,
  allocations and saved views are rewritten on load, and nothing is lost. A split asks which
  part, or keeps all of them.
- The **Files tree view** shows the tree's own links (rule, overlap, confidence). This is the
  tree work's view, so it's in scope here.
- The "Previous" counting setting is removed after one release.
- **Tests:**
  - every old key resolves;
  - the watchlist and allocations survive;
  - no record sits in two developments;
  - every file is in exactly one tree, except files listed as shared.

### Step C: the tables, on the tree

These are the PRs from the tables plan. With the tree live, D1 is settled: the tables use the
tree.

| PR | Content |
|---|---|
| C1 | `plan-rollup.js`: primary plan by the tree's boundary overlap (better than today's point test). Nested plans become sub-levels; precincts and block plans become real levels (block-plan roots come from the tree). Tests that every parent reconciles. |
| C2 | **Table 1, roll-up:** Growth › By plan, plus CSV and workbook sheet, with a `path` column. |
| C3 | **Table 5, plan × plant / zone matrix**, linked to the servicing scopes. |
| C4 | **Table 2, plan vs target:** `data/plan-targets.json` (sourced), the municipal 2051 allocation, units as the main comparison. |

Straddling trees can now be **split by area share** (the tree has boundaries), instead of only
being marked.

### Order and timing

```
B0 review ─GO1→ B1 counts (toggle) ─GO2→ B2 identity ─GO3→ C1 → C2 → C3 → C4 (needs targets)
                                   └────────── C1–C3 can start after B1 ───────────┘
```

C1–C3 can run after B1, because tree counts are already in today's developments. Only the
precinct and block-plan levels and the area-share split wait for B2.

---

## 3. What I need from you

| | Decision | Recommendation |
|---|---|---|
| **GO 1** | Start B0: build the before/after workbook and review lists | Yes |
| B-a | A pre-consultation's own count when it is the only count (111 Mayfield Rd 9,961) | Count it, flagged as an estimate, never committed |
| D2 | Primary plan for straddling developments | The tree's largest overlap, plus a split by area share in the tables |
| D3 | Plan targets | `data/plan-targets.json`. You send any you have; I research the rest from the Official Plans and secondary-plan bylaws, with a source on each |
| D4 | Population basis | The Overview's (all / committed / remaining) |
| **GO 2 / GO 3** | After you've read the workbook | Separate approvals, because B2 changes keys |

Your known-answer figures, once pasted, go into git-ignored `tests/private/` and are run at B1
and C2. I'll report only agree or differ, and by how much.
