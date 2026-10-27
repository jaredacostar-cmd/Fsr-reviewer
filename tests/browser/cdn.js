'use strict';
// The packages index.html, sw.js and js/ load from unpkg, copied from the npm registry into one folder
// for tests/browser/run.js (CDN_DIR): CI then depends on the registry it installs from, not on unpkg,
// whose stalls left page loads hanging until the paths timed out (2026-10-27).
//   node tests/browser/cdn.js <dir>      → <dir>/<name>-<version>/package/…, as run.js reads it
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');

// Every <name>@<version> named in a unpkg URL (one copy each).
function packages(root = ROOT) {
  const files = ['index.html', 'sw.js', ...fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`)];
  const out = new Set();
  for (const f of files) {
    const p = path.join(root, f); if (!fs.existsSync(p)) continue;
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/unpkg\.com\/([^@/"'`\s]+)@([^/"'`\s]+)\//g)) out.add(`${m[1]}@${m[2]}`);
  }
  return [...out].sort();
}

if (require.main === module) {
  const out = path.resolve(process.argv[2] || 'cdn');
  for (const p of packages()) {
    const at = p.lastIndexOf('@'), dir = path.join(out, `${p.slice(0, at)}-${p.slice(at + 1)}`);
    fs.mkdirSync(dir, { recursive: true });
    const tgz = execFileSync('npm', ['pack', p, '--silent', '--pack-destination', dir], { encoding: 'utf8' }).trim().split('\n').pop();
    execFileSync('tar', ['-xzf', path.join(dir, tgz), '-C', dir]);
    console.log(`${p} → ${dir}/package`);
  }
}

module.exports = { packages };
