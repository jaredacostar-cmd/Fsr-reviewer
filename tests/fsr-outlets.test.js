'use strict';
/* Reading where an FSR says the sanitary flows go (scripts/build-fsr-outlets.js), on wording of the
 * kind the reports use. The reports themselves are read in the probe workflow (mode=fsr-outlets). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { findOutlet, readOutlet } = require('../scripts/build-fsr-outlets.js');

test('readOutlet: size, street, status, manhole, Region project', () => {
  assert.deepEqual(readOutlet('Sanitary servicing for the site will be provided by connecting to the existing 250mm diameter sanitary sewer on Kennedy Road.'),
    { mm: 250, street: 'Kennedy Road', status: 'existing', mh: null, project: null });
  const o = readOutlet('It is proposed to connect the site to the existing 375 mmØ sanitary sewer at MH 12A within the Mayfield Road right-of-way.');
  assert.equal(o.mm, 375); assert.equal(o.street, 'Mayfield Road'); assert.equal(o.mh, '12A');
  const f = readOutlet('Sanitary flows will be conveyed to the future 525 mm Regional trunk sanitary sewer on Mayfield Road (Region project 25-2267).');
  assert.equal(f.status, 'future'); assert.equal(f.project, '25-2267'); assert.equal(f.mm, 525);
  assert.equal(readOutlet('The site will discharge to the existing sanitary sewer on Hurontario Street North.').street, 'Hurontario Street North');
  assert.equal(readOutlet('Flows discharge to the 300 mm sanitary sewer on Regional Road 50.').street, 'Regional Road 50');
  // (from real reports) the receiving sewer, not the site's lateral, nor one further down the chain
  assert.equal(readOutlet('Sanitary servicing will be provided by connection a new 150 mm diameter sanitary service lateral to the existing 200 mm sanitary sewer on Shore Street.').mm, 200);
  const chain = readOutlet('Along the south property frontage, there is an existing 300 mm diameter sanitary sewer extended within Highwood Road, which drains to a 375 mm sanitary sewer immediately downstream of the site.');
  assert.equal(chain.mm, 300); assert.equal(chain.street, 'Highwood Road');
  assert.equal(readOutlet('The site will be serviced by local 250 mm sanitary sewers that is proposed to connect to the 1200 mm Kennedy sewer.').mm, 1200);
  assert.equal(readOutlet('Sanitary servicing for Building A will be provided by a 250 mm diameter sanitary sewer connection to EX.MH31 on Airport Road.').mm, null, 'the site connection, not the sewer');
  // a report title is not a street
  assert.equal(readOutlet('Preliminary Functional Servicing and Stormwater Management Report Jack Kenny Court, Bolton. There is an existing 250 mm sanitary sewer on Jack Kenny Court.').street, 'Jack Kenny Court');
  // no municipal sewer
  assert.equal(readOutlet('A 150mm watermain on Barbara Place. Sanitary No municipal sanitary sewer system is available in this part of the Town and all lots are provided with individual septic system.').status, 'septic');
  assert.equal(readOutlet('A septic system is proposed for the sanitary servicing of the gas station.').status, 'septic');
});

test('findOutlet: the outlet sentence over storm, water, internal pipes and flow calculations', () => {
  const text = [
    'FUNCTIONAL SERVICING REPORT. 1.0 Introduction. The subject site is located at 123 Main Street.',
    '4.0 Storm Drainage. Storm flows will discharge to the existing 600 mm storm sewer on Dixie Road. The proposed watermain will connect to the existing 300 mm watermain on Dixie Road.',
    '5.0 Sanitary Servicing. The peak sanitary flow is 4.2 L/s based on a population of 350 persons. Internal 200 mm sanitary sewers will be constructed within the site. Sanitary flows from the development will be conveyed by gravity to the existing 250 mm sanitary sewer on Dixie Road at MH 4.',
  ].join('\f');
  const f = findOutlet(text);
  assert.ok(f);
  assert.equal(f.quotes[0].page, 3);
  assert.match(f.quotes[0].text, /^Sanitary flows from the development will be conveyed/);
  assert.deepEqual(f.outlet, { mm: 250, street: 'Dixie Road', status: 'existing', mh: '4', project: null });
  assert.equal(f.confidence, 'high');
  assert.ok(!f.quotes.some(q => /storm sewer on Dixie|watermain/.test(q.text)), 'storm and water sentences left out');
});

test('findOutlet: a repeated sentence once; no sanitary outlet, null', () => {
  const s = 'The site will connect to the existing 300 mm sanitary sewer on Queen Street East.';
  const f = findOutlet(`Executive summary. ${s}\f5.0 Sanitary. ${s}`);
  assert.equal(f.quotes.length, 1); assert.equal(f.quotes[0].page, 1);
  assert.equal(findOutlet('Storm flows will discharge to the existing 600 mm storm sewer on Dixie Road.'), null);
  assert.equal(findOutlet(''), null);
});

test('wired in: the probe workflow fetches, reads and commits them', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '.github/workflows/probe-sources.yml'), 'utf8');
  assert.match(src, /inputs\.mode == 'fsr-outlets'/);
  assert.match(src, /node scripts\/build-fsr-outlets\.js --fetch/);
});
