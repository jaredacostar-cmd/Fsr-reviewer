'use strict';
// Field lists and status values below are taken from the live Mississauga, Brampton and
// Caledon services (diagnostic run, October 2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/phases.js');

const F = s => s.split(', ').map(x => { const [name, t] = x.split(':'); return { name, type: 'esriFieldType' + t }; });
const pt = { type: 'Point', coordinates: [-79.7, 43.7] };
const rec = (fields, props, src) => P.normalizeRecord({ type: 'Feature', id: 1, geometry: pt, properties: props }, P.detectFields(fields), src);

test('Brampton planning files: status vocabulary and units from the description', () => {
  const fields = F('FILE_NUMBER:String, REGIONAL_NUMBER:String, LOCATION:String, DATE_RECEIVED:Date, APPLICATION_TYPE:String, APPLICATION_TITLE:String, DESCRIPTION:String, STATUS:String, CITY_PLANNER:String, PROPOSAL_DESCRIPTION:String, WARD:String, POLY_ID:OID');
  const src = { id: 'b', municipality: 'Brampton', kind: 'application' };
  const ph = status => rec(fields, { FILE_NUMBER: 'OZS-1', STATUS: status }, src).phase;
  const cases = {
    'Approved': 'approved', 'Closed Approved': 'approved', 'Transferred': 'approved', 'Draft Approved': 'approved',
    'Registered': 'approved', 'Final and Binding': 'approved', 'Agreement Execution': 'approved', 'M-Plan/Condition Clearance': 'approved',
    'Site Plan Agreement Prep': 'approved', 'Substantially Complete': 'approved', 'COA - Closed': 'approved',
    'In Review-Public Mtg Complete': 'review', 'Staff Review Complete': 'review', 'Deemed Complete': 'review',
    'Application Complete': 'review', 'In Review': 'review', 'Under Appeal': 'review',
    'Submitted': 'inception', 'Withdrawn': 'cancelled', 'Closed Refused': 'cancelled', 'Inactive': 'cancelled',
    'Invalid': 'cancelled', 'Lapsed': 'cancelled',
  };
  for (const [s, want] of Object.entries(cases)) assert.equal(ph(s), want, s);

  const r = rec(fields, { FILE_NUMBER: 'OZS-2024-0012', LOCATION: '10 Queen St E', STATUS: 'In Review', DESCRIPTION: 'Official Plan and Zoning By-law Amendment',
    PROPOSAL_DESCRIPTION: 'To permit two 30-storey towers containing a total of 1,250 residential units and ground-floor retail' }, src);
  assert.equal(r.units, 1250);
  assert.ok(r.description.includes('two 30-storey towers'));

  const pre = rec(fields, { FILE_NUMBER: 'PRE-1', STATUS: 'PRE - Closed' }, { ...src, maxPhase: 'inception' });
  assert.equal(pre.phase, 'inception');
});

test('Brampton building permits: pending vs issued vs done; expiry is not cancellation', () => {
  const fields = F('OBJECTID:OID, GIS_ID:Double, ADDRESS:String, FOLDERRSN:Double, PERMITNUMBER:String, SUBDESC:String, WORKDESC:String, ISSUEDATE:Date, INDATE:Date, STATUSDESC:String, PROCESSDATE:Date, BUILDER:String, CONTRACTOR:String, EXPIRYDATE:Date, GFA:String, SECOND_UNIT:String, BEDROOMS:String, STOREYS:String, DWELLINGS:String');
  const m = P.detectFields(fields);
  assert.equal(m.id, 'PERMITNUMBER');
  assert.equal(m.units, 'DWELLINGS');
  assert.equal(m.type, 'SUBDESC');
  assert.ok(!m.dates.some(d => d.field === 'EXPIRYDATE' || d.field === 'PROCESSDATE'));
  const src = { id: 'bp', municipality: 'Brampton', kind: 'permit' };
  const ph = (s, extra = {}) => rec(fields, { PERMITNUMBER: 'BP1', STATUSDESC: s, ...extra }, src).phase;
  assert.equal(ph('Issued', { EXPIRYDATE: Date.UTC(2027, 0, 1) }), 'permit');
  assert.equal(ph('Closed'), 'completed');
  assert.equal(ph('Occupancy Granted'), 'completed');
  assert.equal(ph('Registered'), 'review');
  assert.equal(ph('Ready to Issue'), 'review');
  assert.equal(ph('Zoning Certified'), 'review');
  assert.equal(ph('Deemed Abandoned'), 'cancelled');
  assert.equal(ph('Revoked'), 'cancelled');
  const house = rec(fields, { PERMITNUMBER: 'BP2', STATUSDESC: 'Issued', SUBDESC: 'Single Detached Dwelling', WORKDESC: 'New single detached dwelling', DWELLINGS: '1' }, src);
  assert.equal(house.units, 1);
  assert.equal(house.newBuild, true);
});

test('Mississauga permits: real status values; type alone does not make a new build', () => {
  const fields = F('OBJECTID:OID, BP_NO:String, STATUS:String, ADDRESS:String, UNIT_NO:String, DESCRIPTION:String, SCOPE:String, FILE_TYPE:String, BLDG_TYPE:String, APP_DETAIL:String, APPL_AREA:Double, STOREYS:Double, EST_CON_VALUE:Integer, RES_UNITS:Integer, DEMO:String, POSTAL_CODE:String, BLDG_NO:String, WARD:SmallInteger, ZAREA:String, LATITUDE:Double, LONGITUDE:Double, APPLICATION_DATE:Date, ISSUE_DATE:Date, COMPLETE_DATE:Date');
  const m = P.detectFields(fields);
  assert.equal(m.scope, 'SCOPE');
  assert.equal(m.units, 'RES_UNITS');
  const src = { id: 'mp', municipality: 'Mississauga', kind: 'permit' };
  const kitchen = rec(fields, { BP_NO: 'FIRE 17-9125', STATUS: 'COMPLETED -ALL INSP SIGNED OFF', DESCRIPTION: 'MODIFY EXISTING KITCHEN FIRE SUPPRESSION FOR KITCHEN APPLIANCE MODIFICATION LAYOUT',
    SCOPE: 'ALTERATION TO EXISTING BLDG', FILE_TYPE: 'COMMERCIAL' }, src);
  assert.equal(kitchen.phase, 'completed');
  assert.equal(kitchen.newBuild, false);
  const tower = rec(fields, { BP_NO: 'BP 9NEW 24-1', STATUS: 'ISSUED PERMIT', DESCRIPTION: '35 STOREY APARTMENT BUILDING', SCOPE: 'NEW BUILDING', FILE_TYPE: 'RESIDENTIAL', RES_UNITS: 412 }, src);
  assert.equal(tower.phase, 'permit');
  assert.equal(tower.newBuild, true);
  assert.equal(rec(fields, { BP_NO: 'x', STATUS: 'REVOKED' }, src).phase, 'cancelled');
});

test('Mississauga site plans: unit mix across RES_* columns', () => {
  const fields = F('OBJECTID:OID, PLNG_APP_ID:Integer, APP_FILE_NO:String, TYPE_DESC:String, SUBTYPE_CODE:String, YEAR:SmallInteger, APPLICATION_NO:Integer, DESCRIPTION:String, SITE_ADDRESS:String, APPLICATION_DATE:Date, APPROVAL_DATE:Date, RES_DET:Integer, RES_SEMIS:Integer, RES_ROWS:Integer, RES_APTS:Integer, RES_OTH_APTS:Integer, TOTAL_RES_UNITS:Integer, TOTAL_NON_RES_GFA:Double, WARD:SmallInteger, SIMPLE_STATUS:String');
  const m = P.detectFields(fields);
  assert.equal(m.id, 'APP_FILE_NO');
  assert.deepEqual(m.unitMix, { single: ['RES_DET'], semi: ['RES_SEMIS'], town: ['RES_ROWS'], apartment: ['RES_APTS', 'RES_OTH_APTS'] });
  const r = rec(fields, { APP_FILE_NO: 'SP 24/101', SIMPLE_STATUS: 'Active', RES_DET: 2, RES_ROWS: 10, RES_APTS: 300, RES_OTH_APTS: 20, TOTAL_RES_UNITS: 332 }, { id: 's', municipality: 'Mississauga', kind: 'application' });
  assert.deepEqual(r.unitMix, { single: 2, semi: 0, town: 10, apartment: 320 });
  assert.equal(r.units, 332);
  assert.equal(r.phase, 'review');
});

test('Caledon: development applications (codes, unit mix) and AMANDA permits (units created)', () => {
  const apps = F('OBJECTID:OID, INDATE:Date, STATUSDESC:String, FOLDERDESCRIPTION:String, FOLDERNAME:String, REFERENCEFILE:String, SUBDESC:String, FOLDERTYPE:String, FOLDERRSN:Double, FULLADDRESS:String, WardNum:String, Single_Detached:Double, Semi_Detached:Double, Townhouses:Double, Apartment:Double, Total_Units:Double, Non_Res_GFA:Double');
  const ma = P.detectFields(apps);
  assert.equal(ma.id, 'FOLDERNAME');
  assert.deepEqual(ma.unitMix, { single: ['Single_Detached'], semi: ['Semi_Detached'], town: ['Townhouses'], apartment: ['Apartment'] });
  const src = { id: 'c', municipality: 'Caledon', kind: 'application' };
  const r = rec(apps, { FOLDERNAME: 'RZ 2024-0001', STATUSDESC: 'Circulation', FOLDERTYPE: 'RZ', Single_Detached: 120, Townhouses: 80, Total_Units: 200, FULLADDRESS: '1 Main St, Bolton' }, src);
  assert.equal(r.type, 'Zoning by-law amendment');
  assert.equal(r.phase, 'review');
  assert.equal(r.units, 200);
  for (const [s, want] of Object.entries({ New: 'inception', Recirculation: 'review', Appealed: 'review', 'Draft Approved (parent)': 'approved', Adoption: 'approved', Finalize: 'approved' }))
    assert.equal(rec(apps, { FOLDERNAME: 'x', STATUSDESC: s }, src).phase, want, s);

  const permits = F('OBJECTID:OID, CIVICID:String, PROPERTYRSN:String, STATUSDESC:String, WORKDESC:String, FOLDERTYPE:String, SUBDESC:String, INDATE:Date, ISSUEDATE:Date, REFERENCEFILE:String, CUSTOMFOLDERNUMBER:String, FULLADDRESS:String, FOLDERDESCRIPTION:String, FOLDERNAME:String, FOLDERYEAR:String, SUBCODE:Double, CONSTVALUE:String, BLDGAREA:Double, WORKAREA:Double, EXISTINGUNITS:Double, UNITSCREATED:Double, UNITSLOST:Double, SECUNIT_YN:String');
  const mp = P.detectFields(permits);
  assert.equal(mp.units, 'UNITSCREATED');
  const psrc = { id: 'cp', municipality: 'Caledon', kind: 'permit' };
  const ph = s => rec(permits, { FOLDERNAME: 'p', STATUSDESC: s }, psrc).phase;
  assert.equal(ph('Active'), 'permit');
  assert.equal(ph('Issued'), 'permit');
  assert.equal(ph('Closed'), 'completed');
  assert.equal(ph('Under Review'), 'review');
  assert.equal(ph('Ready to Issue'), 'review');
  assert.equal(ph('Permit Revoked'), 'cancelled');
  const pool = rec(permits, { FOLDERNAME: 'p', STATUSDESC: 'Issued', FOLDERTYPE: 'POOL', WORKDESC: 'Inground pool', EXISTINGUNITS: 1, UNITSCREATED: 0 }, psrc);
  assert.equal(pool.type, 'Pool');
  assert.equal(pool.newBuild, false);
});

test('unitsFromText', () => {
  assert.equal(P.unitsFromText('a 25-storey building with 312 residential units'), 312);
  assert.equal(P.unitsFromText('108 townhouse units and 2 blocks'), 108);
  assert.equal(P.unitsFromText('Proposed 12 storey building'), null);
  assert.equal(P.unitsFromText('Unit 5, 2 storeys'), null);
});
