'use strict';
/* Design-token tests: the colour system in css/app.css and its use in js/.
 *
 * - Dark is the default (:root holds dark values, color-scheme: dark); light
 *   values live under :root[data-theme="light"] and under
 *   @media (prefers-color-scheme: light) for follow-device.
 * - Text tokens reach WCAG AA 4.5:1 on the dark surfaces; map symbol tokens
 *   (phases, capacity, selection) reach 3:1 on their theme's surface.
 * - Every pair of the 7 phase colours is distinguishable under simulated
 *   protanopia and deuteranopia (Machado et al. 2009), in both themes.
 * - No hard-coded hex colours remain in js/; the PHASE_COLORS table is gone.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../scripts/colorblind-check.js');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'css', 'app.css'), 'utf8');
const tokens = C.parseTokens(CSS);

test('dark is the default theme in :root', () => {
  const root = /^:root\s*{([^}]*)}/m.exec(CSS)[1];
  assert.match(root, /color-scheme:\s*dark/);
  assert.match(root, /--surface-0:\s*#121211/);
});

test('light theme exists as data-theme override and follow-device media query', () => {
  assert.ok(/:root\[data-theme="light"\]\s*{/.test(CSS), 'missing :root[data-theme="light"]');
  assert.ok(/@media\s*\(prefers-color-scheme:\s*light\)\s*{/.test(CSS), 'missing prefers-color-scheme: light query');
  assert.match(CSS, /:root\[data-theme="light"\]\s*{[^}]*color-scheme:\s*light/);
  // Both light blocks carry the same values.
  for (const [k, v] of Object.entries(tokens.light)) {
    assert.equal(tokens.lightMedia[k], v, `light mismatch for ${k}`);
  }
});

test('all seven phase tokens are defined in both themes', () => {
  for (const p of C.PHASES) for (const th of ['dark', 'light']) {
    assert.ok(/^#[0-9a-f]{6}$/.test(tokens[th][`--ph-${p}`]), `--ph-${p} [${th}]`);
  }
});

test('red/amber/green capacity tokens and the (cyan) selection token exist', () => {
  for (const th of ['dark', 'light']) {
    for (const name of ['--cap-over', '--cap-tight', '--cap-room', '--select']) {
      assert.ok(/^#[0-9a-f]{6}$/.test(tokens[th][name]), `${name} [${th}]`);
    }
  }
  // No stage is orange-ish (orange reads as "tight"; hue check via red-dominance).
  for (const th of ['dark', 'light']) for (const p of C.PHASES) {
    const [r, g, b] = C.hexToRgb(tokens[th][`--ph-${p}`]);
    assert.ok(!(r > 200 && g > 90 && g < 170 && b < 80), `--ph-${p} [${th}] looks orange`);
  }
});

test('text tokens meet WCAG AA 4.5:1 on dark surfaces', () => {
  assert.deepEqual(C.checkTextContrast(tokens), []);
});

test('phase, capacity and selection symbols meet 3:1 on theme surfaces', () => {
  assert.deepEqual(C.checkSymbolContrast(tokens), []);
});

test('every phase pair is distinguishable under protanopia and deuteranopia', () => {
  const { failures, worst } = C.checkPhasePairs(tokens);
  assert.deepEqual(failures, [], `worst pair: ${worst.a} vs ${worst.b} [${worst.theme}, ${worst.sim}] ΔE=${worst.de.toFixed(1)}`);
  assert.ok(worst.de >= C.DE_MIN_PAIR, `worst ΔE ${worst.de.toFixed(1)} below floor ${C.DE_MIN_PAIR}`);
});

test('no hard-coded hex colours remain in js/', () => {
  // Matches #rgb / #rrggbb but not id selectors like #dca-body or #add-source.
  const HEX = /#[0-9a-fA-F]{6}(?![0-9a-fA-F])|#[0-9a-fA-F]{3}(?![0-9a-fA-Fa-zA-Z_-])/g;
  const hits = [];
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'js'))) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
    let m;
    while ((m = HEX.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length;
      hits.push(`${f}:${line}: ${m[0]}`);
    }
  }
  assert.deepEqual(hits, []);
});

test('PHASE_COLORS table no longer exists; phaseColor lives in js/util.js (Phase 6)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.ok(!/\bPHASE_COLORS\b/.test(src), 'PHASE_COLORS still referenced');
  const util = fs.readFileSync(path.join(__dirname, '..', 'js', 'util.js'), 'utf8');
  assert.ok(!/\bPHASE_COLORS\b/.test(util), 'PHASE_COLORS still referenced in js/util.js');
  assert.ok(/\bfunction phaseColor\(/.test(util), 'phaseColor() not defined in js/util.js');
});
