#!/usr/bin/env node
// Writes tests/fixtures/capital-sample.json: a synthetic capital file (not Region data) for tests
// and local development while the real layer is held off publication. Run: node tests/fixtures/make-capital-sample.js
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../../scripts/capital-lib.js');
const D = Date.UTC;
const f = (a, p) => ({ attributes: a, geometry: { paths: [p] } });
const raw = [
  f({ ProjectNumber: '90-0001', StreetName: 'SAMPLE WATERMAIN RD', Municipality: 'BRAMPTON', Ward: '9', WorkType: 'WM', Phase: 'CONSTRUCTION', ProjectStatus: 'ACTIVE', LocationFrom: 'A ST', LocationTo: 'B ST', TenderDateTarget: D(2025, 1, 1), TenderDateActual: D(2025, 2, 1), AwardDateTarget: D(2025, 4, 1), AwardDateActual: D(2025, 5, 1), ConstructionStartDateTarget: D(2025, 6, 1), ConstructionStartDateActual: D(2026, 1, 1), ConstructionSubstantialCompleti: D(2026, 11, 1), PercentageOfConstructionComplet: 60, LastUpdate: D(2026, 8, 30), ProjectWebsite: 'https://peelregion.ca/construction/project-90-0001', Contractor: 'NEVER STORED', ProjectManager: 'NEVER STORED' }, [[-79.7700, 43.7450], [-79.7600, 43.7450], [-79.7500, 43.7455]]),
  f({ ProjectNumber: '90-0001', StreetName: 'SAMPLE WATERMAIN RD', Municipality: 'BRAMPTON', Ward: '9', WorkType: 'WM', Phase: 'CONSTRUCTION', ProjectStatus: 'ACTIVE', PercentageOfConstructionComplet: 60, LastUpdate: D(2026, 8, 30), ProjectWebsite: 'https://peelregion.ca/construction/project-90-0001' }, [[-79.7500, 43.7455], [-79.7450, 43.7500]]),
  f({ ProjectNumber: '90-0002', StreetName: 'SAMPLE SEWER DR', Municipality: 'MISSISSAUGA', Ward: '5', WorkType: 'SAN', Phase: 'DESIGN', ProjectStatus: 'ACTIVE', ConstructionStartDateTarget: D(2028, 3, 1), LastUpdate: D(2026, 8, 1) }, [[-79.6500, 43.6000], [-79.6400, 43.6010]]),
  f({ ProjectNumber: '90-0003', StreetName: 'SAMPLE RELINE CRES', Municipality: 'MISSISSAUGA', WorkType: 'SAN-RELINING', Phase: 'COMPLETE', ProjectStatus: 'COMPLETED', ConstructionStartDateActual: D(2023, 3, 1), LastUpdate: D(2024, 1, 1) }, [[-79.6300, 43.5900], [-79.6250, 43.5905]]),
  f({ ProjectNumber: '90-0004', StreetName: 'SAMPLE ROAD AVE', Municipality: 'CALEDON', WorkType: 'ROAD-WIDENING 2-4 LANES', Phase: 'PLANNED', LastUpdate: D(2026, 5, 1) }, [[-79.8000, 43.8800], [-79.7900, 43.8810]]),
];
const records = C.uniqueIds(raw.map(C.toRecord));
// A synthetic DC match (water main c57150, project 24-1192) and one weekly change with a later start.
const links = [{ dc: 'water:line:c57150', capital: records[0].id, method: 'project', confidence: 'medium' }];
const changes = [{ id: records[0].id, contract: records[0].contract, projectNumber: '90-0001', system: 'water', dc: true, date: '2026-10-12', change: 'Start target 2026-01-01 → 2026-02-01; 60% built', slipMonths: 1 }];
const out = { version: 1, generatedAt: '2026-10-15T00:00:00Z', sample: true, source: { name: 'Synthetic sample for tests and local development (not Region data)', latestLastUpdate: '2026-09-30' }, note: "General screening results only. Peel's W&WW Infrastructure Planning team must validate or confirm all results.", counts: C.tally(records), changes, records, links };
if (C.hasForbidden(out)) throw new Error('forbidden field');
fs.writeFileSync(path.join(__dirname, 'capital-sample.json'), JSON.stringify(out, null, 1));
console.log(records.map(r => `${r.id} ${r.contract} ${r.status}`).join('\n'));
