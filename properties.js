/* Impacted-properties analysis: finds buildings, addresses or parcels within a
 * buffer distance of a project's line or site.
 *
 * Sources:
 *  - OpenStreetMap (live, via the Overpass API): building footprints and address points.
 *  - A parcel GeoJSON file the user loads (e.g. a municipal open-data parcel layer).
 *
 * Exposes window.PeelProperties. No dependencies. */
(function () {
  'use strict';

  const OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  // ---------- geometry (local planar metres around a reference point) ----------
  function projector(lat0, lon0) {
    const kx = Math.cos((lat0 * Math.PI) / 180) * 111320;
    const ky = 110540;
    return ([lat, lon]) => [(lon - lon0) * kx, (lat - lat0) * ky];
  }

  function distPointSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
  function segsIntersect(a, b, c, d) {
    const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  function pointInRing(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Distance from a point to a path (a single point or a polyline).
  function distPointPath(p, path) {
    if (path.length === 1) return Math.hypot(p[0] - path[0][0], p[1] - path[0][1]);
    let d = Infinity;
    for (let i = 1; i < path.length; i++) d = Math.min(d, distPointSeg(p, path[i - 1], path[i]));
    return d;
  }

  // Distance from a polygon (outer ring) to a path; 0 if they touch or overlap.
  function distRingPath(ring, path) {
    for (const v of path) if (pointInRing(v, ring)) return 0;
    let d = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (path.length === 1) { d = Math.min(d, distPointSeg(path[0], a, b)); continue; }
      for (let k = 1; k < path.length; k++) {
        const c = path[k - 1], e = path[k];
        if (segsIntersect(a, b, c, e)) return 0;
        d = Math.min(d, distPointSeg(a, c, e), distPointSeg(c, a, b));
      }
    }
    if (path.length > 1) for (const v of path) d = Math.min(d, distPointPath(v, ring.concat([ring[0]])));
    return d;
  }

  // Normalise a project's geometry to a list of [lat, lon] points. An EA study
  // area becomes its closed boundary, so distances are measured to the edge.
  function projectPath(project) {
    if (project.type === 'ea') return project.geometry.concat([project.geometry[0]]);
    return project.type === 'linear' ? project.geometry : [project.geometry];
  }
  const projectArea = (project) => (project.type === 'ea' ? project.geometry : null);

  function bboxOf(points) {
    let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
    for (const [lat, lon] of points) {
      if (lat < s) s = lat; if (lat > n) n = lat;
      if (lon < w) w = lon; if (lon > e) e = lon;
    }
    return [s, w, n, e];
  }

  function bboxPad(b, metres) {
    const dLat = metres / 110540;
    const dLon = metres / (111320 * Math.cos((((b[0] + b[2]) / 2) * Math.PI) / 180));
    return [b[0] - dLat, b[1] - dLon, b[2] + dLat, b[3] + dLon];
  }

  function bboxHit(a, b) { return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }

  // Distance (m) from a feature ({rings} or {point}) to the project.
  function featureDistance(feature, pPath, proj) {
    if (feature.point) return distPointPath(proj(feature.point), pPath);
    let d = Infinity;
    for (const ring of feature.rings) {
      d = Math.min(d, distRingPath(ring.map(proj), pPath));
      if (d === 0) break;
    }
    return d;
  }

  function centroid(feature) {
    if (feature.point) return feature.point;
    const ring = feature.rings[0];
    let lat = 0, lon = 0;
    for (const p of ring) { lat += p[0]; lon += p[1]; }
    return [lat / ring.length, lon / ring.length];
  }

  // ---------- OpenStreetMap ----------
  const RESIDENTIAL = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'residential', 'apartments', 'bungalow', 'dormitory', 'townhouse']);
  const COMMERCIAL = new Set(['commercial', 'retail', 'office', 'supermarket', 'hotel', 'kiosk']);
  const INDUSTRIAL = new Set(['industrial', 'warehouse', 'manufacture', 'factory']);
  const INSTITUTIONAL = new Set(['school', 'church', 'hospital', 'university', 'college', 'public', 'civic', 'government', 'kindergarten', 'mosque', 'temple', 'synagogue', 'fire_station', 'religious']);
  const ACCESSORY = new Set(['garage', 'garages', 'shed', 'carport', 'roof', 'hut', 'cabin', 'greenhouse']);

  function osmCategory(tags) {
    const b = tags.building;
    if (RESIDENTIAL.has(b)) return 'Residential';
    if (COMMERCIAL.has(b) || tags.shop) return 'Commercial';
    if (INDUSTRIAL.has(b)) return 'Industrial';
    if (INSTITUTIONAL.has(b) || tags.amenity) return 'Institutional';
    if (ACCESSORY.has(b)) return 'Accessory';
    return b ? 'Building' : 'Address';
  }

  function osmAddress(tags) {
    const hn = tags['addr:housenumber'];
    if (!hn) return '';
    const unit = tags['addr:unit'] ? `Unit ${tags['addr:unit']}, ` : '';
    const city = tags['addr:city'] ? `, ${tags['addr:city']}` : '';
    return `${unit}${hn} ${tags['addr:street'] || ''}`.trim() + city;
  }

  // For an EA study area, matches everything inside the polygon plus anything
  // within the buffer of its boundary.
  function overpassQuery(path, buffer, area) {
    const filters = [];
    if (area) filters.push(`(poly:"${area.map(([lat, lon]) => `${lat.toFixed(6)} ${lon.toFixed(6)}`).join(' ')}")`);
    if (!area || buffer > 0) {
      filters.push(`(around:${Math.round(buffer)},${path.map(([lat, lon]) => `${lat.toFixed(6)},${lon.toFixed(6)}`).join(',')})`);
    }
    const parts = filters.map((f) => `way["building"]${f};way["addr:housenumber"]${f};node["addr:housenumber"]${f};`).join('');
    return `[out:json][timeout:120];(${parts});out geom tags;`;
  }

  async function fetchOverpass(query, signal) {
    let lastErr;
    for (const url of OVERPASS_URLS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          body: 'data=' + encodeURIComponent(query),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal,
        });
        if (!res.ok) throw new Error(`OpenStreetMap server returned ${res.status}`);
        return await res.json();
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        lastErr = e instanceof TypeError
          ? new Error('the OpenStreetMap server could not be reached. Check your internet connection or try again later.')
          : e;
      }
    }
    throw lastErr || new Error('Could not reach the OpenStreetMap server.');
  }

  // Turns Overpass elements into property items. Address points that fall
  // inside a building are attached to that building.
  function parseOverpass(json) {
    const buildings = [], points = [];
    for (const el of json.elements || []) {
      const tags = el.tags || {};
      if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 3) {
        const ring = el.geometry.map((g) => [g.lat, g.lon]);
        buildings.push({ id: `way/${el.id}`, rings: [ring], bbox: bboxOf(ring), tags, addresses: osmAddress(tags) ? [osmAddress(tags)] : [] });
      } else if (el.type === 'node' && typeof el.lat === 'number') {
        points.push({ id: `node/${el.id}`, point: [el.lat, el.lon], tags });
      }
    }
    const loose = [];
    for (const pt of points) {
      const addr = osmAddress(pt.tags);
      const host = buildings.find((b) => pt.point[0] >= b.bbox[0] && pt.point[0] <= b.bbox[2] && pt.point[1] >= b.bbox[1] && pt.point[1] <= b.bbox[3]
        && pointInRing([pt.point[1], pt.point[0]], b.rings[0].map(([la, lo]) => [lo, la])));
      if (host) { if (addr && !host.addresses.includes(addr)) host.addresses.push(addr); }
      else loose.push(pt);
    }
    const items = [];
    for (const b of buildings) {
      const category = osmCategory(b.tags);
      // Sheds and garages without their own address are noise for notification lists.
      if (category === 'Accessory' && !b.addresses.length) continue;
      items.push({
        id: b.id, source: 'OpenStreetMap', rings: b.rings,
        address: b.addresses.join('; '), name: b.tags.name || '', category,
        detail: b.tags.building && b.tags.building !== 'yes' ? b.tags.building.replace(/_/g, ' ') : '',
      });
    }
    for (const p of loose) {
      items.push({
        id: p.id, source: 'OpenStreetMap', point: p.point,
        address: osmAddress(p.tags), name: p.tags.name || '', category: p.tags.shop ? 'Commercial' : p.tags.amenity ? 'Institutional' : 'Address',
        detail: '',
      });
    }
    return items;
  }

  async function findOSM(project, buffer, signal) {
    const path = projectPath(project);
    const area = projectArea(project);
    const json = await fetchOverpass(overpassQuery(path, buffer, area), signal);
    return measure(parseOverpass(json), path, buffer, area);
  }

  // ---------- parcels (user GeoJSON) ----------
  const ADDRESS_KEYS = /^(full_?address|address|addr|civic_?address|civic|location|street_?address|prop_?addr|site_?address)$/i;
  const ROLL_KEYS = /^(roll|roll_?num(ber)?|roll_?no|arn|assessment_?roll(_?number)?)$/i;
  const PIN_KEYS = /^(pin|teranet_?pin|parcel_?id|parcelid)$/i;

  function pickKey(props, re) {
    for (const k of Object.keys(props || {})) if (re.test(k) && props[k] != null && String(props[k]).trim() !== '') return k;
    return null;
  }

  // Parse a GeoJSON FeatureCollection of parcel polygons (WGS84 lon/lat).
  function parseParcels(geojson) {
    const feats = geojson && (geojson.type === 'FeatureCollection' ? geojson.features : geojson.type === 'Feature' ? [geojson] : null);
    if (!Array.isArray(feats)) throw new Error('Expected a GeoJSON FeatureCollection.');
    const parcels = [];
    let badCoords = false;
    feats.forEach((f, i) => {
      const g = f && f.geometry;
      if (!g) return;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null;
      if (!polys) return;
      const rings = polys.map((poly) => (poly[0] || []).map(([lon, lat]) => [lat, lon])).filter((r) => r.length >= 3);
      if (!rings.length) return;
      const [lat, lon] = rings[0][0];
      if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) { badCoords = true; return; }
      const props = f.properties || {};
      const aKey = pickKey(props, ADDRESS_KEYS), rKey = pickKey(props, ROLL_KEYS), pKey = pickKey(props, PIN_KEYS);
      parcels.push({
        id: String(f.id ?? (pKey && props[pKey]) ?? `parcel-${i}`),
        rings,
        bbox: bboxOf(rings.flat()),
        address: aKey ? String(props[aKey]).trim() : '',
        roll: rKey ? String(props[rKey]).trim() : '',
        pin: pKey ? String(props[pKey]).trim() : '',
      });
    });
    if (!parcels.length) {
      throw new Error(badCoords
        ? 'Coordinates are not longitude/latitude. Re-export the layer in WGS84 (EPSG:4326).'
        : 'No polygon features found.');
    }
    return parcels;
  }

  function findParcels(project, buffer, parcels) {
    const path = projectPath(project);
    const box = bboxPad(bboxOf(path), buffer);
    const area = projectArea(project);
    const candidates = parcels.filter((p) => bboxHit(p.bbox, box)).map((p) => ({
      id: p.id, source: 'Parcel layer', rings: p.rings, address: p.address, name: '',
      category: 'Parcel', detail: [p.roll && `Roll ${p.roll}`, p.pin && `PIN ${p.pin}`].filter(Boolean).join(' · '),
      roll: p.roll, pin: p.pin,
    }));
    return measure(candidates, path, buffer, area);
  }

  function parcelsInView(parcels, viewBox, limit) {
    const out = [];
    for (const p of parcels) {
      if (bboxHit(p.bbox, viewBox)) { out.push(p); if (out.length >= limit) break; }
    }
    return out;
  }

  // Distance is 0 for anything inside an EA study area (judged by its centre).
  function measure(items, path, buffer, area) {
    const [s, w, n, e] = bboxOf(path);
    const proj = projector((s + n) / 2, (w + e) / 2);
    const pPath = path.map(proj);
    const pArea = area ? area.map(proj) : null;
    return items
      .map((it) => {
        const center = centroid(it);
        const inside = pArea && pointInRing(proj(center), pArea);
        return { ...it, center, distance: inside ? 0 : featureDistance(it, pPath, proj), inside: !!inside };
      })
      .filter((it) => it.distance <= buffer)
      .sort((a, b) => a.distance - b.distance || a.address.localeCompare(b.address));
  }

  // ---------- parcel storage (IndexedDB, so a large layer survives reloads) ----------
  const DB_NAME = 'peel-projects', STORE = 'parcels';
  function db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idb(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    });
  }
  const saveParcels = (layer) => idb('readwrite', (s) => s.put(layer, 'layer'));
  const loadParcels = () => idb('readonly', (s) => s.get('layer'));
  const clearParcels = () => idb('readwrite', (s) => s.delete('layer'));

  // ---------- CSV ----------
  function toCSV(items) {
    const cell = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [['Address', 'Name', 'Category', 'Detail', 'Distance (m)', 'Latitude', 'Longitude', 'Source', 'Source ID']];
    for (const it of items) {
      rows.push([it.address, it.name, it.category, it.detail, Math.round(it.distance),
        it.center[0].toFixed(6), it.center[1].toFixed(6), it.source, it.id]);
    }
    return rows.map((r) => r.map(cell).join(',')).join('\r\n');
  }

  // True when a line or site touches or lies inside an EA study area polygon.
  function touchesArea(project, ring) {
    const [s, w, n, e] = bboxOf(ring);
    const proj = projector((s + n) / 2, (w + e) / 2);
    return distRingPath(ring.map(proj), projectPath(project).map(proj)) === 0;
  }

  // Area of a polygon in square kilometres.
  function areaKm2(ring) {
    const [s, w, n, e] = bboxOf(ring);
    const proj = projector((s + n) / 2, (w + e) / 2);
    const pts = ring.map(proj);
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
    return Math.abs(a / 2) / 1e6;
  }

  window.PeelProperties = {
    touchesArea, areaKm2,
    findOSM, findParcels, parseParcels, parcelsInView, toCSV,
    saveParcels, loadParcels, clearParcels,
    // exposed for tests
    _parseOverpass: parseOverpass, _measure: measure, _overpassQuery: overpassQuery,
  };
})();
