'use strict';
// The developments as the app builds them from data/snapshot.json (scripts/app-devs.js: the same
// build js/app.js applySnapshot → rebuild runs). Built once per test process (a few seconds).
const fs = require('fs');
const path = require('path');
const { loadAppDevs } = require('../../scripts/app-devs.js');

const DATA = path.join(__dirname, '..', '..', 'data');
let cache = null;

function realDevs() {
  if (!cache) cache = loadAppDevs(DATA);
  return cache;
}

const available = () => fs.existsSync(path.join(DATA, 'snapshot.json')) && fs.existsSync(path.join(DATA, 'tree-counts.json'));
module.exports = { realDevs, available };
