(function (root) {
'use strict';
  // One capacity function (SPEC 1.4). Every % of rated / firm, every reserve and every trigger year
  // on every tab comes from here, with the same inputs.
  //
  //   compute({ rated, firm, existing, built, committed, proposed, trigger, triggerYear })
  //     pure: the layered flows (cumulative: existing ≤ … ≤ build-out) against capacity →
  //     { cap, rated, firm, existing, built, committed, proposed, buildout, reserve, room,
  //       pctToday, pctCommitted, pctBuildout, triggerYear }
  //   of(ref)   the browser's facilities, from the servicing model (js/svc-tab.js plantCap,
  //             js/masterplan.js plantCons / waterPlantCons / psCons): 'plant:Lakeview',
  //             'wsys:southPeel', 'wsys:<well system>', 'ps:<drainage area id>'.
  //
  // Definitions, used everywhere:
  //   committed = MECP D-5-1 at the treatment plants (past plan approval), the Peel rule at the pumping
  //             stations (a site servicing or building permit): the commitment ladder, rule: 'd51' | 'peel';
  //   reserve = capacity − (existing + built + committed): the uncommitted reserve (MECP D-5-1 at the
  //             plants), to 100% of rated (plants) or firm (pumping stations);
  //   room    = trigger × rated − committed: room to the 90% expansion trigger (2020 Master Plan),
  //             named "room to the trigger", never "reserve";
  //   pct*    = always % of rated (plants, water treatment) or of firm (pumping stations), never
  //             % of the trigger;
  //   plants: Existing is the 2025 metered flow, which already contains Built (built = 0 then);
  //   zones, blocks and stations: census + built.
  const TRIGGER = 0.9;

  function compute(x) {
    const cap = x.firm != null ? x.firm : x.rated;
    const existing = +x.existing || 0, built = +x.built || 0;
    const committed = Math.max(existing + built, +x.committed || 0);
    const buildout = Math.max(committed, +x.buildout || (committed + (+x.proposed || 0)));
    const pct = v => (cap > 0 ? v / cap * 100 : null);
    const trigger = x.trigger == null ? (x.firm != null ? 1 : TRIGGER) : x.trigger;
    return {
      cap, rated: x.rated != null ? x.rated : null, firm: x.firm != null ? x.firm : null, unit: x.unit || null,
      existing, built, committed, proposed: buildout - committed, buildout,
      reserve: cap - committed,
      room: trigger * cap - committed, trigger,
      pctToday: pct(existing + built), pctCommitted: pct(committed), pctBuildout: pct(buildout),
      triggerYear: x.triggerYear === undefined ? null : x.triggerYear,
    };
  }
  // Rounded % for display, one rule everywhere.
  const pctTxt = v => (v == null || !isFinite(v) ? '–' : `${Math.round(v)}%`);

  // ---- Browser: the facilities from the servicing model ---------------------------------------------
  const App = () => root.PeelApp, MP = () => root.PeelMasterPlan;
  const cached = (k, f) => (MP() && MP().cached ? MP().cached(`cap:${k}`, f) : f());
  function of(ref) {
    const A = App && App(); const M = A && A.state && A.state.svcModel; if (!M || !MP()) return null;
    return cached(ref, () => {
      const [kind, id] = String(ref).split(/:(.*)/s);
      if (kind === 'plant') {
        const c = M.plantCap(id), k = MP().cached(`plant:${id}`, () => MP().plantCons(id)); if (!c) return null;
        return { ref, kind: 'plant', rule: 'd51', name: c.name, unit: 'ML/d', ...compute({ rated: c.rated, existing: c.existing, built: 0, committed: c.committed, buildout: c.buildout, triggerYear: k ? k.out : null }),
          builtInExisting: true, census: c.census != null ? c.census : null, perPerson: c.perPerson, popToday: c.popToday, f: c.f };
      }
      if (kind === 'wsys') {
        const zone = id === 'southPeel' ? { zone: '1' } : { zone: Object.keys(MP().wellSystem || {}).find(z => MP().wellSystem[z] === id) || id, id: (A.state.servicing.zones.find(z => z.zone === Object.keys(MP().wellSystem || {}).find(k => MP().wellSystem[k] === id)) || {}).id };
        const w = MP().cached(id === 'southPeel' ? 'wsys:lake' : `wsys:${id}`, () => MP().waterPlantCons(zone)); if (!w) return null;
        const rated = w.cap / TRIGGER;
        return { ref, kind: 'wplant', rule: 'd51', name: w.name, unit: 'ML/d', ...compute({ rated, existing: w.q('today'), built: 0, committed: w.q('committed'), buildout: w.q(null), triggerYear: w.out }), builtInExisting: true, zones: w.zones };
      }
      if (kind === 'ps') {
        // The traced pumping-station sewersheds (servicing.psAreas: the drainage list holds the blocks).
        const a = [...(A.state.servicing.psAreas || []), ...(A.state.servicing.drainage || [])].find(d => d.id === id); const k = a && MP().psCons(a); if (!k) return null;
        return { ref, kind: 'ps', rule: 'peel', name: k.name, unit: 'L/s', ...compute({ firm: k.cap, existing: k.q('today'), built: 0, committed: k.util.com * k.cap, buildout: k.q(null), triggerYear: k.out }) };
      }
      return null;
    });
  }

  const api = { TRIGGER, compute, of, pctTxt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelCapacity = api;
})(typeof window !== 'undefined' ? window : globalThis);
