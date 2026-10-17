/* Peel Growth Pipeline (unofficial) – Phase 3b tool: "How many more units fit?"
 *
 * Tap a point on the map and this tool gathers the four constraint families for
 * the spot — the tightest sewer pipe on its trace to the plant, the pumping
 * station(s) on the way, the treatment plant's reserve, and the pressure zone's
 * water supply — then reports how many more people/units fit before the
 * tightest one, using the current scenario. All capacity figures are screening
 * estimates (existing classes only; no new CSS).
 *
 * Registers id 'unitsfit' with PeelTools when the framework is present. Pure
 * parts (rankConstraints, peopleToUnits, outText, matchStationAreas, fmtInt)
 * are exported for node --test.
 */
(function () {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const EST = '<span class="est-tag">screening estimate</span>';

  // Lazy handles: null until the app modules have run.
  const P = () => (typeof window !== 'undefined' ? window.PeelApp : null);
  const PA = () => (typeof window !== 'undefined' ? window.PeelAreas : null);
  const PDm = () => (typeof window !== 'undefined' ? window.PeelDemand : null);

  // ---- Pure helpers ---------------------------------------------------------

  /** Order constraint rows by people-left (fewest first); rows with no usable
   *  people figure sort last. Returns { limiting, ranked }. */
  function rankConstraints(list) {
    const rows = (list || []).map(c => ({ ...c, _p: c && c.people != null && isFinite(c.people) ? c.people : Infinity }));
    rows.sort((a, b) => a._p - b._p);
    const limiting = rows.find(c => c._p !== Infinity) || null;
    return { limiting, ranked: rows.map(({ _p, ...c }) => c) };
  }

  /** People -> units at a persons-per-unit assumption (rounds to whole units). */
  function peopleToUnits(people, ppu) {
    if (!(people > 0) || !(ppu > 0)) return 0;
    return Math.round(people / ppu);
  }

  /** A constraint's runs-out year for display: 'today' | year | null. */
  function outText(out) {
    if (out === 'today') return 'at capacity today';
    if (out == null) return 'holds to build-out';
    return `runs out ≈${out}`;
  }

  function fmtInt(n) {
    if (n == null || !isFinite(n)) return '–';
    return Math.round(n).toLocaleString('en-CA');
  }

  function fmtRoom(room, unit) {
    if (room == null || !isFinite(room)) return '–';
    if (unit === 'ML/d') return `${room.toFixed(1)} ML/d`;
    if (unit === 'L/s') return `${fmtInt(room)} L/s`;
    if (unit === 'ML') return `${room.toFixed(1)} ML`;
    return fmtInt(room);
  }

  /** Distance (m) between two [lng, lat] points on a local flat projection. */
  function distM(a, b) {
    const kx = 111320 * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180), ky = 111320;
    return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * ky);
  }

  /** Match traced pumping stations (meta list: {name, lnglat}) to pumping-station
   *  drainage areas by their outlet coordinate, within maxM metres. Dedupes by
   *  area. Pure in, pure out: returns [{ area, stationName }]. */
  function matchStationAreas(stations, areas, maxM = 500) {
    const out = [], seen = new Set();
    for (const st of stations || []) {
      const at = st && st.lnglat; if (!at) continue;
      let best = null, bd = Infinity;
      for (const a of areas || []) {
        if (!a || !a.outletAt || seen.has(a.id)) continue;
        const d = distM(at, a.outletAt);
        if (d < bd) { bd = d; best = a; }
      }
      if (best && bd <= maxM) { seen.add(best.id); out.push({ area: best, stationName: st.name }); }
    }
    return out;
  }

  const zLevel = z => { const m = /^(\d+)/.exec(z || ''); return m ? +m[1] : null; };

  // ---- Data gathering (browser only) -----------------------------------------

  // Build the constraint list for a point. Returns { rows, missing }.
  async function evaluate(latlng) {
    const app = P(), rows = [], missing = [];
    const lat = latlng.lat, lng = latlng.lng;
    const push = (id, label, sub, cons) => {
      if (!cons) { missing.push({ id, label }); return; }
      rows.push({ id, label, sub: sub || cons.sub, unit: cons.unit, room: cons.room, people: cons.people, out: cons.out });
    };

    // 1. Sewer pipe: trace to the plant, take the tightest pipe on the way.
    let trace = null;
    try { trace = await app.tracePoint(latlng); } catch (e) { trace = null; }
    // Pipe-by-pipe results are off for now: the Region's model decides individual sewers.
    if (!(window.PeelUtil || {}).PIPE_RESULTS) missing.push({ id: 'pipe', label: 'Sewer pipes — pipe-by-pipe capacity is left to the Region\u2019s hydraulic model (not screened here)' });
    else if (trace && trace.worst) {
      const cons = app.pipeCons(trace.worst.i);
      push('pipe', `Sanitary sewer — ${cons ? cons.name : 'tightest pipe on the trace (no capacity published)'}`, cons && cons.sub, cons);
    } else {
      const k = app.nearestPipe(lng, lat, 400, 300);
      if (k >= 0) {
        const cons = app.pipeCons(k);
        push('pipe', `Sanitary sewer — ${cons ? cons.name : 'nearest pipe'}`, cons && cons.sub, cons);
      } else {
        missing.push({ id: 'pipe', label: 'Sewer pipe — no 300 mm+ sewer within 400 m, nothing to evaluate' });
      }
    }

    // 2. Pumping station(s) on the trace: station -> drainage area -> psCons.
    const svc = app.state.servicing;
    const psAreas = (svc && (svc.psAreas || (svc.drainage || []).filter(a => a.kind === 'ps'))) || [];
    const matched = matchStationAreas(trace && trace.stations, psAreas);
    if (!matched.length) {
      missing.push({ id: 'ps', label: 'Pumping station — none on the traced path (gravity catchment)' });
    } else {
      let any = false;
      for (const { area } of matched) {
        const cons = app.psCons(area);
        if (cons) { any = true; push(`ps:${area.id}`, cons.name, cons.sub, cons); }
      }
      if (!any) missing.push({ id: 'ps', label: 'Pumping station — on the path but not in the master plan capacity table' });
    }

    // 3. Treatment plant reserve.
    if (trace && trace.plantName) {
      if (trace.plantName === 'Toronto') {
        missing.push({ id: 'plant', label: 'Treatment plant — drains to the City of Toronto system, capacity not modelled here' });
      } else {
        const cons = app.plantCons(trace.plantName);
        push('plant', cons ? `${cons.name} treatment plant` : 'Treatment plant', cons && cons.sub, cons);
        if (!cons) missing.push({ id: 'plant', label: `Treatment plant ${trace.plantName} — no capacity figure available` });
      }
    } else {
      missing.push({ id: 'plant', label: 'Treatment plant — no sewer trace reached a plant' });
    }

    // 4. Zone supply: pressure zone -> water treatment reserve and/or supply boundaries.
    let zone = null;
    if (svc && PA()) {
      const ids = PA().locate(svc.zones, lng, lat);
      zone = ids.length ? svc.zones.find(z => z.id === ids[0]) : null;
      if (!zone) {
        try { const est = await app.estimateZone({ lat, lng }); zone = est && est.z; } catch (e) { zone = null; }
      }
    }
    if (zone) {
      const wcons = app.waterPlantCons(zone);
      push('water', wcons ? `${wcons.name} — water treatment` : 'Water treatment', wcons && wcons.sub, wcons);
      const L = zLevel(zone.zone);
      const well = /^(AV13|CE9)/.test(zone.zone || '');
      if (L != null && !well) {
        // Trunk mains on this point's supply route (2020 Master Plan actual capacity), the tightest
        // on each trunk system it draws from.
        await Promise.all([app.loadMpWater && app.loadMpWater(), window.PeelWaterTrace && window.PeelWaterTrace.loadWaterFacilities()]);
        const trunks = app.trunkNeeds ? app.trunkNeeds({ lat, lng, pz: [zone.id], key: `fit:${lat},${lng}` }, zone.id) : [];
        for (const c of trunks) push(c.id, `${c.name} — trunk main`, c.sub, c);
        if (!trunks.length) missing.push({ id: 'supply', label: 'Trunk mains — no supply route found to a Master Plan trunk main for this point' });
      }
    } else {
      missing.push({ id: 'water', label: 'Water supply — outside the mapped pressure zones and no estimate available' });
    }

    return { rows, missing };
  }

  function ppu() {
    const dm = PDm();
    return (dm && dm.DEFAULT_CRITERIA && dm.DEFAULT_CRITERIA.ppu && dm.DEFAULT_CRITERIA.ppu.unknown) || 2.7;
  }

  function resultHTML(latlng, res) {
    const { limiting, ranked } = rankConstraints(res.rows);
    const unitNote = `at ${ppu()} people per unit`;
    let head;
    if (!limiting) {
      head = `<p><strong>Not enough data to evaluate this point.</strong></p>
        <p class="muted small">None of the four constraint families could be evaluated here — ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)} is likely outside the serviced areas.</p>`;
    } else {
      const people = Math.max(0, limiting.people);
      const units = peopleToUnits(people, ppu());
      const over = limiting.room < 0;
      head = `<p>≈<strong>${fmtInt(people)}</strong> more people (≈<strong>${fmtInt(units)}</strong> units, ${unitNote}) before <strong>${esc(limiting.label)}</strong> ${over ? '— already at capacity' : outText(limiting.out)} ${EST}</p>`;
    }
    const rowsHtml = ranked.map(c => {
      const over = c.room < 0;
      return `<tr><td>${esc(c.label)}${c.sub ? `<br><span class="muted small">${esc(c.sub)}</span>` : ''} ${EST}</td>
        <td>${fmtRoom(c.room, c.unit)}</td><td>${over ? '0 — at capacity' : `≈${fmtInt(Math.max(0, c.people))}`}</td><td>${outText(c.out)}</td></tr>`;
    }).join('');
    const missingHtml = res.missing.length
      ? `<ul class="why-list">${res.missing.map(m => `<li class="why-stall"><span>${esc(m.label)}</span></li>`).join('')}</ul>` : '';
    return `${head}
      ${ranked.length ? `<table class="dt"><caption>Constraints at this point, current scenario — tightest first</caption>
      <thead><tr><th>Constraint</th><th>Room left</th><th>People</th><th>Runs out</th></tr></thead><tbody>${rowsHtml}</tbody></table>` : ''}
      ${missingHtml}
      <p class="muted small">Screening estimates from the 2020 Master Plan capacities and the current demand scenario. People-to-units uses the generic persons-per-unit assumption; pumping-station and plant figures assume average dry/wet design flows as labelled.</p>`;
  }

  // ---- Tool registration ------------------------------------------------------

  async function onClick(latlng) {
    const app = P(); if (!app || !latlng) return;
    const PT = window.PeelTools;
    PT.openResult({ title: 'How many more units fit?', html: `<p class="muted">Evaluating constraints at ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}…</p>` });
    try {
      const res = await evaluate(latlng);
      PT.openResult({ title: 'How many more units fit?', html: resultHTML(latlng, res), screen: true });
    } catch (e) {
      PT.openResult({ title: 'How many more units fit?', html: `<p class="muted">Could not evaluate this point (${esc(e && e.message ? e.message : e)}).</p>` });
    }
  }

  if (typeof window !== 'undefined' && window.PeelTools) {
    window.PeelTools.register('unitsfit', {
      title: 'How many more units fit?',
      icon: 'development',
      hint: 'tap a point or zone',
      onClick,
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { rankConstraints, peopleToUnits, outText, fmtInt, fmtRoom, matchStationAreas, distM, zLevel };
  }
})();
