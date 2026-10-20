'use strict';
// What is on the ground (js/phase-estimate.js): the files, the permits' history, the site servicing
// permit and the aerial check read together, beside the files' own stage.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const P = require('../js/phases.js');
const E = require('../js/phase-estimate.js');

const TODAY = new Date('2026-10-20');
const ev = (d, phase, label = 'X') => ({ date: new Date(d), phase, label });
// 360 City Centre Drive, as the open data has it: a site plan approved in 2020, a conditional
// foundation permit (signed off 2019) and the same permit in the second feed (issued 2018).
function cityCentre() {
  return P.buildProjects([
    { uid: 'sp', sourceId: 'mis-siteplan/0', municipality: 'Mississauga', kind: 'application', ref: 'SP 17/018', address: '360 City Centre Drive', type: 'SITE PLAN', description: '19 storey residential tower (east), and 43 storey mixed commercial/residential tower (west) with a shared podium', units: 680, statusRaw: 'Approved', phase: 'approved', newBuild: true, unitMix: { apartment: 680 }, fileKey: 'SP|17|18', stage: 'siteplan', lat: 43.586901, lng: -79.6461, events: [ev('2017-01-23', 'inception'), ev('2020-07-06', 'approved')] },
    { uid: 'con', sourceId: 'mis-permits/0', municipality: 'Mississauga', kind: 'permit', ref: 'BP 3NEW 17-9117 CON', address: '360 CITY CENTRE DR', type: 'RESIDENTIAL', description: 'CONDITIONAL PERMIT-MIXED USE RES.&COMM.BDG-43-STY CONDO TWR A (W)&19-STY AFFORDABLE HOUSING TWR B (E)&3-STY PKG below grade- FDN to GRADE ONLY', units: 678, statusRaw: 'COMPLETED -ALL INSP SIGNED OFF', phase: 'completed', newBuild: true, fileKey: 'BP|3NEW|17|9117', scope: 'NEW BUILDING', lat: 43.587173, lng: -79.645892, events: [ev('2018-05-22', 'inception'), ev('2018-05-22', 'permit'), ev('2019-01-03', 'completed')] },
    { uid: 'gm', sourceId: 'mis-gm-permits/0', municipality: 'Mississauga', kind: 'permit', ref: 'BP 3NEW 17 9117', address: '360 City Centre DR', type: 'Apartment - More Than 6 Units', description: 'New Building', units: 678, phase: 'permit', newBuild: true, fileKey: 'BP|3NEW|17|9117', lat: 43.586832, lng: -79.64608, events: [ev('2018-05-22', 'permit')] },
  ])[0];
}
const SVC = [{ ref: 'DRAIN 18-2837 SS', kind: 'site', applied: '2018-07-31', issued: '2018-09-21' }];
const BUILT_2024 = { result: { status: 'Likely completed', probability: 0.93 }, ev: { latestYear: 2024, permitYear: 2018 } };

test('360 City Centre Drive: the files say under construction; permits, servicing and the 2024 aerial say built', () => {
  const p = cityCentre();
  assert.equal(p.phase, 'construction', 'the files hold it back');
  const e = E.estimate(p, { aerial: BUILT_2024, servicing: SVC, today: TODAY });
  assert.equal(e.key, 'built');
  assert.equal(e.label, 'Likely built');
  assert.equal(e.confidence, 'high');
  assert.ok(e.differs && e.ahead);
  const t = e.evidence.map(x => `${x.src}: ${x.text}`).join('\n');
  assert.match(t, /Files: Under construction \(a permit reads completed, but 2 planned units have no building permit/);
  assert.match(t, /History: Building permit BP 3NEW 17-9117 CON was issued 8 years ago \(2018-05-22\); a 43-storey tower usually takes about 4 years/);
  assert.match(t, /History: BP 3NEW 17-9117 CON is a conditional \/ foundation permit, signed off 2019-01-03/);
  assert.match(t, /Servicing: Site servicing permit DRAIN 18-2837 SS issued 2018-09-21/);
  assert.match(t, /Aerial 2024: the photo shows the building/);
  assert.deepEqual(E.chipText(e), { text: 'On site: likely built · high confidence · files say under construction', tone: 'tight' });
});

test('before the photos are in, the permits alone already read it, with less confidence', () => {
  const e = E.estimate(cityCentre(), { aerialState: 'run', servicing: SVC, today: TODAY });
  assert.equal(e.key, 'built');
  assert.equal(e.confidence, 'medium');
  assert.equal(E.chipText(e).tone, 'wait');
  assert.match(E.chipText(e).text, /checking the aerial…$/);
});

test('a photo with nothing built pulls a recent permit back to not started; an old photo counts for little', () => {
  const p = { phase: 'permit', records: [{ kind: 'permit', ref: 'BP 1', description: 'New 2 storey dwelling', units: 1, phase: 'permit', events: [ev('2026-03-01', 'permit')] }] };
  const none = E.estimate(p, { aerial: { result: { status: 'Not visibly started', probability: 0.1 }, ev: { latestYear: 2026, permitYear: 2026 } }, today: TODAY });
  assert.equal(none.key, 'none');
  assert.equal(none.label, 'Permit issued, not visibly started');
  assert.ok(!none.differs);
  const old = E.estimate(p, { aerial: { result: { status: 'Not visibly started', probability: 0.1 }, ev: { latestYear: 2024, permitYear: 2026 } }, today: TODAY });
  assert.match(old.evidence.find(x => /^Aerial/.test(x.src)).text, /predates the building permit/);
});

test('files that say built, and a photo that agrees, agree', () => {
  const p = { phase: 'completed', records: [{ kind: 'permit', ref: 'BP 2', description: 'New 3 storey townhouses', units: 12, phase: 'completed', events: [ev('2019-04-01', 'permit'), ev('2021-02-01', 'completed')] }] };
  const e = E.estimate(p, { aerial: BUILT_2024, today: TODAY });
  assert.equal(e.key, 'built');
  assert.equal(e.confidence, 'high');
  assert.ok(!e.differs);
  assert.equal(E.chipText(e).tone, 'aer');
});

test('a site still in planning: nothing of the proposal is built; site work on the photo is said', () => {
  const p = { phase: 'review', records: [] };
  assert.equal(E.estimate(p, { aerial: { result: { status: 'Not visibly started', probability: 0.03 }, ev: {} } }).key, 'none');
  assert.equal(E.estimate(p, { aerial: { result: { status: 'Likely under construction', probability: 0.2 }, ev: {} } }).label, 'Site work visible');
  assert.equal(E.estimate({ phase: 'cancelled', records: [] }), null);
});

test('how long a building takes, from its height', () => {
  assert.equal(E.buildYears({ records: [{ description: '43-STY condo tower' }] }).years, 4);
  assert.equal(E.buildYears({ records: [{ description: '12 storey apartment' }] }).years, 3);
  assert.equal(E.buildYears({ records: [{ description: 'detached dwelling' }] }).years, 1.5);
  assert.ok(E.isPartial({ ref: 'BP 3NEW 17-9117 CON' }) && E.isPartial({ description: 'FDN to GRADE ONLY' }) && !E.isPartial({ ref: 'BP 1', description: 'New building' }));
});

test('wired in: the header chip reads the estimate; the script loads before the chip and is cached offline', () => {
  const ac = src('js/aerial-chip.js');
  assert.match(ac, /E\.estimate\(p, \{/);
  assert.match(ac, /servicing: row \? row\.evidence : null/);
  assert.match(src('index.html'), /<script src="js\/phase-estimate\.js\?v=__BUILD__"><\/script>\n {2}<script src="js\/aerial-chip\.js\?v=__BUILD__"><\/script>/);
  assert.match(src('sw.js'), /'js\/phase-estimate\.js',/);
});
