# Kickoff prompt for Claude Code

Paste the block below as the first message in Claude Code, from the repo root on the
`redesign/spec-and-boards` branch (or after merging it).

```
Read docs/redesign/SPEC.md in full, then docs/redesign/README.md. The design boards are in
docs/redesign/boards/*.dc.html (open them with the Read tool as HTML; they are the target layout)
and the current app's rendered text is in docs/redesign/captures/text/.

Work through SPEC.md in phase order and do not skip ahead:

Phase 0 (data fixes, §1) — start with 1.1 (permit boundary → phase), 1.2 (council decisions →
status), 1.4 (one capacity function, js/capacity.js) and 1.6 (one unit basis, reconciled block
totals). Write the tests named in each item before changing behaviour. The acceptance target is
the development keyed "Brampton|2055 BOVAIRD DR W" in data/snapshot.json: it must come out
Under review, zoning approved, counting as Proposed, with a reconciled unit count.

Phase 1 (§2) — add js/layers.js (pure, tested), the CSS tokens, the shared stacked-bar component,
and the scenario chip. Then make every capacity bar, the Growth pipeline strip, By plan rows, the
bottom timeline and the site badge use it.

Phase 2 (§3) — route DC facility / DC main / sewer pipe / record clicks through the right-panel
scope; delete #pane-tool and the #detail aside.

Phase 3–4 (§4–5) — the shell and the five-tab panel, board by board.

Rules: keep the app a static site with no build step; keep `npm test` and `npm run lint` green
after every phase; one PR per phase, each PR description listing which SPEC.md items it closes
and which captures/text files it changes. When a SPEC item depends on an open decision in §7,
pick the option the spec marks "as drawn" and say so in the PR.
```
