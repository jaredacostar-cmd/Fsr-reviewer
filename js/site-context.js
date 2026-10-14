/* Site context fills for a development — ground elevation, fire-flow
 * Phase 6 extraction from js/app.js (app.js 7682-7787 (7682-7695 fillGround moved from area-select per Declares)).
 * (hydrants), stormwater (ponds).
 */
(function (root) {
  'use strict';

  const A = window.PeelArcGIS;
  const { $, esc, fmtNum } = window.PeelUtil;
  const map = window.PeelMapCore.map;
  const EP = () => window.PeelExistPipes;
  const DI = () => window.PeelDcInfra;
  const DN = () => window.PeelDevNav;
  const Meas = () => window.PeelMeasure;
  const SD = () => window.PeelSvcData;

  // Ground at the site, and the fall to its catchment's outlet (gravity hint for the sewer path).
  async function fillGround(p) {
    if (!$('#dev-ground')) return;
    try {
      const z = await Meas().elevAt(p.lat, p.lng), f = SD().svcFacts(p), out = f && f.path.find(a => a.outletAt && a.kind !== 'plant');
      let line = `Site <strong>${z.toFixed(1)} m</strong> above sea level`;
      if (out) {
        const zo = await Meas().elevAt(out.outletAt[1], out.outletAt[0]), dist = map.distance([p.lat, p.lng], [out.outletAt[1], out.outletAt[0]]);
        line += ` · ${esc(SD().drName(out).replace(/^[^·]+· /, ''))} outlet ${zo.toFixed(1)} m: ${zo < z ? `falls ${(z - zo).toFixed(1)} m` : `<strong>rises ${(zo - z).toFixed(1)} m</strong>`} over ${Meas().fmtDist(dist)} (${(Math.abs(z - zo) / Math.max(1, dist) * 100).toFixed(2)}% straight line)`;
      }
      if (DN().getCurrentProject() === p && $('#dev-ground')) $('#dev-ground').innerHTML = `<p class="small">${line}</p><p class="small muted">Ground surface from terrain tiles (CDEM / SRTM), not pipe inverts. Measure & ground profile (Tools) draws a profile along any line.</p>`;
    } catch (e) { if (DN().getCurrentProject() === p && $('#dev-ground')) $('#dev-ground').innerHTML = '<p class="small muted">Ground elevation unavailable (terrain tiles did not load).</p>'; }
  }

  // ---- Fire flow context: hydrants near the site, their pressure zone, nearest large watermain ----
  // Peel hydrants (live). Hydrant flow tests are not published, so this is coverage and zone only.
  const HYDRANTS = `${EP().PEEL_FS}/HydrantsExport_/FeatureServer/0`;
  const FIRE_R = 150, TRANS_R = 1500;
  const geoQ = (url, lng, lat, r, outFields) => A.fetchJSON(`${url}/query`, { geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: 4326, distance: r, units: 'esriSRUnit_Meter', spatialRel: 'esriSpatialRelIntersects', outFields, outSR: 4326, returnGeometry: true, resultRecordCount: 200, f: 'json' });
  const fireCache = new Map();
  function fireContext(lng, lat) {
    const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
    if (fireCache.has(key)) return fireCache.get(key);
    const pr = Promise.all([
      geoQ(HYDRANTS, lng, lat, FIRE_R, 'PressureZone,ServiceStatus').then(j => (j.features || []).filter(f => f.geometry && !/^ANY/.test((f.attributes || {}).ServiceStatus || '')).map(f => ({ m: DI().dcM([lng, lat], [f.geometry.x, f.geometry.y]), zone: String((f.attributes || {}).PressureZone || '').trim() }))).catch(() => null),
      geoQ(EP().EXIST.water[1].url, lng, lat, TRANS_R, 'Diameter,Material').then(j => {
        let best = null;
        for (const f of j.features || []) { const m = Math.min(...((f.geometry && f.geometry.paths) || []).map(pth => DI().dcDist([lng, lat], pth))); if (isFinite(m) && (!best || m < best.m)) best = { m, a: EP().pipeAttrs('water', 'Region of Peel', f.attributes || {}) }; }
        return best;
      }).catch(() => undefined),
    ]).then(([hyd, trans]) => ({ hyd, trans }));
    fireCache.set(key, pr);
    return pr;
  }
  function fillFire(p) {
    if (!$('#dev-fire')) return;
    fireContext(p.lng, p.lat).then(({ hyd, trans }) => {
      if (DN().getCurrentProject() !== p || !$('#dev-fire')) return;
      const L0 = [];
      if (hyd == null) L0.push('<li class="muted">Hydrants: the Region\'s hydrant layer did not respond</li>');
      else if (!hyd.length) L0.push(`<li class="why-warn-t"><strong>Hydrants:</strong> none within ${FIRE_R} m${p.municipality === 'Caledon' ? ' (rural Caledon may rely on tanker supply)' : ''}</li>`);
      else {
        hyd.sort((a, b) => a.m - b.m);
        const zones = {}; for (const h of hyd) if (h.zone) zones[h.zone] = (zones[h.zone] || 0) + 1;
        const zs = Object.entries(zones).sort((a, b) => b[1] - a[1]).map(([z]) => z);
        const sitePz = (p.pz || []).map(id => String(id).replace(/^pz:/, ''));
        const mismatch = zs.length && sitePz.length && !zs.some(z => sitePz.includes(z));
        L0.push(`<li><strong>Hydrants:</strong> ${hyd.length} within ${FIRE_R} m, nearest ${fmtNum(Math.round(hyd[0].m))} m${zs.length ? ` · pressure zone ${esc(zs.join(', '))}` : ''}${zs.length > 1 ? ' <span class="muted">(near a zone boundary)</span>' : ''}</li>`);
        if (mismatch) L0.push(`<li class="muted">The site's mapped pressure zone is ${esc(sitePz.join(', '))}; nearby hydrants are recorded in ${esc(zs.join(', '))}.</li>`);
      }
      if (trans === undefined) L0.push('<li class="muted">Transmission mains: no response</li>');
      else L0.push(trans ? `<li><strong>Nearest large watermain:</strong> ${trans.a.d ? `${trans.a.d} mm` : 'size not recorded'}${trans.a.mat ? ` ${esc(trans.a.mat)}` : ''}, ${fmtNum(Math.round(trans.m))} m</li>` : `<li class="muted"><strong>Large watermains:</strong> none within ${fmtNum(TRANS_R / 1000)} km</li>`);
      $('#dev-fire').innerHTML = `<ul class="b-lines small">${L0.join('')}</ul><p class="small muted">Live from the Region's hydrant and watermain layers. Hydrant flow tests are not published: coverage and zone only, not available fire flow.</p>`;
    });
  }

  // ---- Stormwater context: nearest stormwater management pond, its design controls, subwatershed ----
  // Brampton (726 ponds, with design controls) and Caledon (96 ponds) publish ponds; Mississauga does not.
  const PONDS = [
    { url: 'https://maps1.brampton.ca/arcgis/rest/services/Stormwater/Stormwater_Asset_PRD/MapServer/3', f: 'NAME,POND_ID,CATEGORY,FEATURE_TYPE,WATERSHED,SUBSHED,QUAL_DESIGN,EROSN_DESIGN,FLOOD_DESIGN,RISK_GRADE', src: 'City of Brampton' },
    { url: 'https://services3.arcgis.com/AbUjpCl3KckkXVBh/arcgis/rest/services/GISProd_GISDBO_StormWaterMngPonds/FeatureServer/19', f: 'POND,TYPE_OF_FA,ASSUMED_OR,COMMUNITY,SWM_REPORT', src: 'Town of Caledon' },
  ];
  const POND_R = 1000;
  const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; };
  function pondAttrs(a, src) {
    const yes = v => v != null && String(v).trim() && !/^(no|n|none|0|null)$/i.test(String(v).trim());
    const ctl = [['QUAL_DESIGN', 'quality'], ['EROSN_DESIGN', 'erosion'], ['FLOOD_DESIGN', 'quantity / flood']].filter(([k]) => yes(a[k])).map(([k, l]) => `${l}${/^(y|yes)$/i.test(String(a[k]).trim()) ? '' : ` (${String(a[k]).trim()})`}`);
    return { name: String(a.NAME || a.POND || a.POND_ID || '').trim(), type: String(a.FEATURE_TYPE || a.CATEGORY || a.TYPE_OF_FA || '').trim(), ctl, hasCtl: 'QUAL_DESIGN' in a, shed: [a.WATERSHED, a.SUBSHED].filter(x => x && String(x).trim()).join(' / '), risk: String(a.RISK_GRADE || '').trim(), assumed: String(a.ASSUMED_OR || '').trim(), report: String(a.SWM_REPORT || '').trim(), src };
  }
  const pondCache = new Map();
  function nearestPond(lng, lat) {
    const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
    if (pondCache.has(key)) return pondCache.get(key);
    const pr = Promise.all(PONDS.map(S => geoQ(S.url, lng, lat, POND_R, S.f).then(j => (j.features || []).map(f => {
      const rings = (f.geometry && f.geometry.rings) || [];
      const m = rings.some(r => inRing(lng, lat, r)) ? 0 : Math.min(...rings.map(r => DI().dcDist([lng, lat], r)));
      return { m, a: pondAttrs(f.attributes || {}, S.src) };
    })).catch(() => null))).then(rs => {
      const all = rs.filter(Boolean).flat().filter(x => isFinite(x.m)).sort((a, b) => a.m - b.m);
      return { ponds: all, failed: rs.every(r => r == null) };
    });
    pondCache.set(key, pr);
    return pr;
  }
  function fillStorm(p) {
    if (!$('#dev-storm')) return;
    if (p.municipality === 'Mississauga') { $('#dev-storm').innerHTML = '<p class="small muted">Mississauga does not publish its stormwater ponds; see the nearest storm sewer under Existing mains.</p>'; return; }
    Promise.all([nearestPond(p.lng, p.lat), EP().nearestExisting(p.lng, p.lat)]).then(([{ ponds, failed }, ex]) => {
      if (DN().getCurrentProject() !== p || !$('#dev-storm')) return;
      const L0 = [];
      if (failed) L0.push('<li class="muted">The pond layers did not respond</li>');
      else if (!ponds.length) L0.push(`<li class="muted"><strong>Ponds:</strong> none within ${fmtNum(POND_R / 1000)} km</li>`);
      else {
        const o = ponds[0].a;
        L0.push(`<li><strong>Nearest pond:</strong> ${esc(o.name || 'unnamed')}${o.type ? ` <span class="muted">(${esc(o.type.toLowerCase())})</span>` : ''}, ${ponds[0].m ? `${fmtNum(Math.round(ponds[0].m))} m` : 'on the site'} <span class="muted">(${esc(o.src)})</span></li>`);
        if (o.hasCtl) L0.push(`<li>Design controls: ${o.ctl.length ? esc(o.ctl.join(', ')) : '<span class="muted">none recorded</span>'}${o.risk ? ` · risk grade ${esc(o.risk)}` : ''}</li>`);
        if (o.assumed) L0.push(`<li class="muted">Status: ${esc(o.assumed)}${o.report ? ` · SWM report ${esc(o.report)}` : ''}</li>`);
        if (ponds.length > 1) L0.push(`<li class="muted">${ponds.length - 1} more within ${fmtNum(POND_R / 1000)} km</li>`);
      }
      const shed = (ponds && ponds.find(x => x.a.shed) || {}).a?.shed || (ex.storm && ex.storm.a.shed);
      if (shed) L0.push(`<li><strong>Watershed / subwatershed:</strong> ${esc(shed)}</li>`);
      $('#dev-storm').innerHTML = `<ul class="b-lines small">${L0.join('')}</ul><p class="small muted">Live from the municipal stormwater layers. Whether the pond was sized for this site is in its SWM report, not the GIS.</p>`;
    });
  }

  const api = {
    fillGround, fillFire, fillStorm, fireContext, nearestPond, inRing, geoQ,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSiteContext = api;
})(typeof window !== 'undefined' ? window : globalThis);
