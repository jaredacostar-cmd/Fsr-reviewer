# Peel Region Projects Map

A browser app for tracking Peel Region capital projects on a map:

- **Linear projects** (roads, watermains, sewers, transit) are drawn as lines.
- **Vertical projects** (buildings, stations, facilities) are placed as site markers.
- Click a project on the map or in the list to see its details and a **Gantt chart** of its schedule.

## Running it

No build step or install. Serve the folder with any static web server and open it in a browser:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Map tiles come from OpenStreetMap, so you need internet access to see the base map.
Leaflet is bundled in `vendor/leaflet/`.

## Adding a project

1. Click **+ New project** and fill in the details: name, type, category, municipality, status, lead, budget and so on.
2. Under **Location**, click **Draw on map**:
   - *Linear*: click along the alignment to add points, then press **Done** (or Enter). **Undo point** removes the last one.
   - *Vertical*: click the site location, then press **Done**.
3. Under **Schedule**, add tasks/phases with start and end dates and % complete,
   or click **Use standard phases** to start from a typical EA → design → tender → construction template.
   A task with the same start and end date shows as a milestone (◆).
4. Click **Save project**.

Select a project to **Edit**, **Zoom to** or **Delete** it.

## Data

- Projects are saved in your browser (`localStorage`), so they stay on that browser and device only.
- **Export** downloads every project as a JSON file. **Import** loads one back in (you choose replace or add),
  which is how you share data or move it between computers.
- **Load examples** replaces your projects with the six example projects. These are made up for illustration
  and are **not** real Region of Peel data.

### Project JSON format

```json
{
  "id": "abc123",
  "name": "Watermain replacement – Queen St E",
  "ref": "24-1234",
  "type": "linear",
  "category": "Watermain",
  "municipality": "Brampton",
  "status": "construction",
  "lead": "Water & Wastewater",
  "budget": 18500000,
  "contractor": "",
  "description": "",
  "geometry": [[43.6862, -79.7590], [43.7078, -79.7265]],
  "tasks": [
    { "id": "t1", "name": "Construction", "start": "2026-03-01", "end": "2026-11-30", "progress": 40 }
  ]
}
```

- `type` is `linear` or `vertical`.
- `geometry` is a list of `[lat, lng]` points for linear projects, or a single `[lat, lng]` for vertical ones.
- `status` is one of `planning`, `design`, `tendering`, `construction`, `complete` or `hold`.
