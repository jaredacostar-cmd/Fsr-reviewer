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

## Impacted properties

Select a project and open the **Impacted properties** tab to see who is near it:

1. Set the distance. The default is 50 m from a linear project's centreline, or 120 m around a vertical site,
   which matches the Ontario Planning Act notice radius.
2. Choose a source:
   - **OpenStreetMap buildings & addresses**: queried live, so it needs internet access. Peel's buildings and addresses
     were imported into OpenStreetMap, but coverage can be incomplete or out of date. Sheds and garages without an address are left out.
   - **Loaded parcel layer**: click **Load parcel GeoJSON…** and choose a property-parcel file, for example from
     Mississauga's or Brampton's open data portals. The file must be a GeoJSON FeatureCollection of polygons in
     WGS84 (EPSG:4326). Address, roll number and PIN columns are detected automatically. The layer is kept in the
     browser (IndexedDB), and parcel outlines show on the map when you zoom in closely. Check the parcel data's licence terms before sharing results.
3. Click **Find properties**. Matches are highlighted on the map with the buffer zone shaded. Click a row to zoom to it,
   and use **Export CSV** to get a list for notice mailings.

Owner names are not public data and aren't included. Get them from MPAC or municipal assessment records.

## Data

- Projects are saved in your browser (`localStorage`), so they stay on that browser and device only.
- **Export** downloads every project as a JSON file. **Import** loads one back in (you choose replace or add),
  which is how you share data or move it between computers.
- **Reload Peel projects** replaces your projects with the bundled list in `data/peel-projects.js`.

### Bundled Peel Region projects

`data/peel-projects.js` holds 20 Peel Region capital projects compiled from public Peel Region notices,
construction timelines and press releases (searched October 2026). Each project lists its sources.

- Mayfield Rd widening: 8 segments, Chinguacousy Rd to Hwy 50, per the July 2026 timeline
- Mississauga Rd widening: Bovaird Dr to Wanless Dr (10-4040) and Financial Dr to Bovaird Dr
- Dixie Rd widening: Queen St E to Bovaird Dr E
- East to West Diversion Sanitary Trunk Sewer (16-2291)
- Lakeshore Rd W watermain and large sanitary sewer (19-2215, 24-2980, 24-2115)
- Gafney Dr area watermain (23-1310 H)
- Docksteader Paramedic Reporting Station
- Housing: Byngmount Shores, Chelsea Gardens, Basswood Senior Residences, Creekside Apartments
- G.E. Booth Water Resource Recovery Facility expansion

Caveats:

- **Map locations are approximate.** They were placed from the street limits, not taken from Peel's GIS data. Redraw them if you need exact alignments.
- **Dates come from published wording.** Phrases like "early 2026" or "mid 2027" were converted to dates.
  Phases that ended before October 2026 are marked 100%. Everything else is 0%, because Peel doesn't publish percent complete.
- Schedules change often. Check the source links before relying on a date.

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
