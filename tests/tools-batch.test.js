'use strict';
/* Phase 3b tool 7 tests: the pure parseBatchCSV(text) parser in
 * js/tools-batch.js. No DOM, no app bridge. */
const test = require('node:test');
const assert = require('node:assert/strict');

const { parseBatchCSV } = require('../js/tools-batch.js');

test('parses a header row with separate lat/lng columns', () => {
  const { rows, errors } = parseBatchCSV('name,lat,lng,single,town,apartment,jobs,ha\nA,43.6,-79.7,10,20,150,5,2.5\n');
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { name: 'A', lat: 43.6, lng: -79.7, single: 10, town: 20, apartment: 150, jobs: 5, ha: 2.5, line: 2 });
});

test('accepts a "lat,lng" point column and apt alias', () => {
  const { rows, errors } = parseBatchCSV('name,point,apt\nB,"43.60, -79.70",40\n');
  assert.equal(errors.length, 0);
  assert.equal(rows[0].lat, 43.6);
  assert.equal(rows[0].lng, -79.7);
  assert.equal(rows[0].apartment, 40);
  assert.equal(rows[0].single, 0);
});

test('header matching is case-insensitive and tolerates quotes', () => {
  const { rows, errors } = parseBatchCSV('Name,LAT,Lng,Single\n"Quoted, name",43.6,-79.7,3\n');
  assert.equal(errors.length, 0);
  assert.equal(rows[0].name, 'Quoted, name');
  assert.equal(rows[0].single, 3);
});

test('headerless file is read positionally', () => {
  const { rows, errors } = parseBatchCSV('43.6,-79.7,10,0,50,0,1.2\n');
  assert.equal(errors.length, 0);
  assert.equal(rows[0].lat, 43.6);
  assert.equal(rows[0].single, 10);
  assert.equal(rows[0].apartment, 50);
  assert.equal(rows[0].ha, 1.2);
});

test('headerless lat,lng-only rows work', () => {
  const { rows, errors } = parseBatchCSV('43.6,-79.7\n');
  assert.equal(errors.length, 0);
  assert.equal(rows[0].single, 0);
  assert.equal(rows[0].jobs, 0);
});

test('collects per-row errors and skips bad rows', () => {
  const { rows, errors } = parseBatchCSV('lat,lng,single\n43.6,-79.7,10\n999,-79.7,5\n43.5,-79.6,-2\n43.5,abc,1\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].single, 10);
  assert.equal(errors.length, 3);
  assert.ok(errors.some(e => e.line === 3 && /lat/i.test(e.message)));
  assert.ok(errors.some(e => e.line === 4 && /single/i.test(e.message)));
  assert.ok(errors.some(e => e.line === 5 && /lng/i.test(e.message)));
});

test('blank lines and BOM are ignored', () => {
  const { rows, errors } = parseBatchCSV('\uFEFFlat,lng\n\n43.6,-79.7\n\n');
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 1);
});

test('row limit is 200', () => {
  const lines = ['lat,lng'];
  for (let i = 0; i < 205; i++) lines.push('43.6,-79.7');
  const { rows, errors } = parseBatchCSV(lines.join('\n'));
  assert.equal(rows.length, 200);
  assert.ok(errors.some(e => /200/.test(e.message)));
});

test('empty input gives empty results', () => {
  assert.deepEqual(parseBatchCSV(''), { rows: [], errors: [] });
  assert.deepEqual(parseBatchCSV('   \n  '), { rows: [], errors: [] });
});
