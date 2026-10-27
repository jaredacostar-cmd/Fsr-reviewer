# Pipeline ledger: backtest of the expected years

Written by `node scripts/backtest-ledger.js` from the snapshot of 2026-10-19. Phase 3 of
`docs/pipeline-ledger-plan.md`.

## How it is done

For each start date (Jan 1 of 2019 to 2022), every site as it stood then (the furthest stage it had
entered, not yet built) is timed by the time-in-stage curves built only from what was known that day:
completions after it count as not yet happened. Its predicted first-completion year (likely, and the range
from the fast to the slow band) is compared with the year it actually first completed.

- **Checked**: only municipalities that date their completions: Mississauga. Brampton and Caledon
  publish no completion dates, so their sites can't be scored.
- **Judged**: a site that finished by the snapshot date, or one whose likely year has passed without it
  finishing (a miss, at least as late as today). A site still waiting with its likely year still ahead
  can't be judged yet ("open").
- **No year**: the site had already waited longer than any similar site in the history known then. The
  app times these by the homes the population projection needs, which the backtest does not score.
- **What is scored is the first completion.** The ledger's year is when half a development's homes are
  done, which for a large site comes later; large sites are few, so the site counts are mostly small ones.
  The unit-weighted column gives large sites their weight.

## Results

The curves the app uses (municipalities that date completions):

| Start | Sites | Judged | In range | In range (units) | Within 1 year | Median error (years) | No year | Open |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Jan 1, 2019 | 747 | 662 | 50% | 76% | 61% | -1 | 85 | 0 |
| Jan 1, 2020 | 1,001 | 593 | 58% | 67% | 66% | 0 | 408 | 0 |
| Jan 1, 2021 | 1,197 | 945 | 69% | 52% | 67% | 0 | 252 | 0 |
| Jan 1, 2022 | 1,481 | 1,260 | 69% | 53% | 66% | -1 | 221 | 0 |

Every municipality pooled (before Oct 22, 2026), for comparison:

| Start | Sites | Judged | In range | In range (units) | Within 1 year | Median error (years) | No year | Open |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Jan 1, 2019 | 747 | 465 | 45% | 71% | 68% | -1 | 282 | 0 |
| Jan 1, 2020 | 1,001 | 391 | 94% | 43% | 76% | 0 | 610 | 0 |
| Jan 1, 2021 | 1,197 | 508 | 84% | 75% | 69% | 0 | 689 | 0 |
| Jan 1, 2022 | 1,481 | 859 | 72% | 84% | 54% | 0 | 605 | 17 |

Median error is the likely year less the actual (negative: it finished later than predicted).

## Reading it

- Over the four start dates, 63% of the 3,460 judged sites finished within their range and
  65% within a year of the likely year.
- **Not a clear win on accuracy.** The pooled curves score higher in some years (by sites from 2020 to
  2022, by units in 2021 and 2022), but they are judged on far fewer sites: they give no year to the
  slower ones, which the curves the app uses do time. Compare the "Judged" and "No year" columns before
  the percentages. The large sites (by units) did worse in 2021 and 2022 under the curves the app uses.
- The pooled curves leave far more sites with no year at all, because Brampton's and Caledon's sites still
  waiting count while their finished ones (no date) drop out. That makes the curves too slow, which is why
  the app now uses the municipalities that date completions.
- By period's method note, in the Forecast's full table, works the same backtest out in the browser
  for the start date five years back, on the developments the app loads (dormant ones and site
  activity held aside), so its figures can differ from these by a few points.
- Brampton and Caledon rows are timed with these curves and marked in the ledger. A way to check them:
  date their completions from the yearly aerial photos (follow-up).
