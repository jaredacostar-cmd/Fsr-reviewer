# docs/redesign

Everything from the 2026-10-15 design review of the Peel Growth Pipeline, packaged so a coding
agent can work from the repo alone.

| Path | What |
|---|---|
| `SPEC.md` | The build spec, ordered: data fixes → layer function → click destinations → shell → panels. Read this first. |
| `KICKOFF.md` | A prompt to paste into Claude Code to start the work. |
| `boards/` | The design boards as self-contained HTML (one per panel / scope); `canvas.json` is their layout. Open any in a browser. |
| `captures/*.png` | Contact sheets of the current app: desktop panels per tab, three site types, zoom levels, the four lenses and feature clicks, the site tools. |
| `captures/text/` | The rendered text of every panel captured (`peel/` nothing selected, `site/` 9763 Heritage Rd, `types/` the other three sites, `shell/` left panel, menus, features, tools). Diff against these after changes. |

The live canvas these boards came from is a claude.ai Design artifact owned by the repo author; the
HTML here is the same source.
