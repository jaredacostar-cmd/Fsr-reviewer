#!/usr/bin/env node
/*
 * Colour-blindness + contrast check for the Peel Development Tracker palette.
 *
 * Parses the design tokens in css/app.css (dark = :root default, light =
 * :root[data-theme="light"]) and verifies:
 *   1. Every pair of the 7 phase colours (--ph-*) is distinguishable under
 *      simulated protanopia AND deuteranopia (Machado et al. 2009 matrices),
 *      in both themes. Metric: CIE76 Delta-E on the simulated colours;
 *      threshold DE_MIN_PAIR = 10 (well above the ~2.3 just-noticeable
 *      difference, sized for small map symbols).
 *   2. WCAG AA for text: --text-primary/--text-secondary/--text-muted reach
 *      4.5:1 against the dark surfaces (--surface-0, --surface-1).
 *   3. Map symbols: every --ph-* phase colour, --cap-over/--cap-tight/--cap-room
 *      and --select reach 3:1 against their theme's --surface-0 (proxy for the
 *      theme-matched street basemap; symbols also carry a thin --sym-outline
 *      stroke so they read on aerial imagery).
 *
 * Exit code is non-zero on any failure; on success a readable report is printed.
 * The simulation + colour maths are exported (UMD) so tests/tokens.test.js can
 * reuse them instead of duplicating the logic.
 */
(function (root) {
  'use strict';
  const fs = require('fs');
  const path = require('path');

  const CSS_PATH = path.join(__dirname, '..', 'css', 'app.css');
  const PHASES = ['inception', 'review', 'approved', 'permit', 'construction', 'completed', 'cancelled'];
  // Stages the map shows as one (one colour): Permit issued and Under construction.
  const MERGED = [['permit', 'construction']];
  const DE_MIN_PAIR = 10;      // CIE76 Delta-E floor for simulated phase pairs
  const TEXT_RATIO = 4.5;      // WCAG AA normal text
  const SYMBOL_RATIO = 3;      // WCAG AA non-text (map symbols)

  // ---- colour maths -----------------------------------------------------------
  function hexToRgb(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) throw new Error(`bad hex: ${hex}`);
    const n = parseInt(m[1], 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  // sRGB -> linear -> XYZ (D65) -> CIELAB
  function rgbToLab([r, g, b]) {
    const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    let [R, G, B] = [lin(r), lin(g), lin(b)];
    // -> XYZ
    let x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
    let y = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 1.0;
    let z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    [x, y, z] = [f(x), f(y), f(z)];
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  function deltaE76(a, b) {
    const [l1, a1, b1] = rgbToLab(a), [l2, a2, b2] = rgbToLab(b);
    return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
  }
  // Machado, Oliveira & Fernandes (2009), severity 1.0 (full dichromacy).
  const PROTANOPIA = [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]];
  const DEUTERANOPIA = [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]];
  function simulate(rgb, matrix) {
    return matrix.map(row =>
      Math.max(0, Math.min(255, Math.round(row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]))));
  }
  const protanopia = rgb => simulate(rgb, PROTANOPIA);
  const deuteranopia = rgb => simulate(rgb, DEUTERANOPIA);

  function relLum([r, g, b]) {
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  function contrast(a, b) {
    const [l1, l2] = [relLum(a), relLum(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  }

  // ---- token parsing ----------------------------------------------------------
  // Returns { dark: {name: '#hex'}, light: {...} } for single-hex tokens.
  function parseTokens(css) {
    const block = (re) => {
      const m = re.exec(css);
      if (!m) throw new Error(`token block not found: ${re}`);
      const vars = {};
      for (const [, name, val] of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
        const hex = val.trim().match(/^#[0-9a-fA-F]{6}$/);
        if (hex) vars[name] = hex[0].toLowerCase();
      }
      return vars;
    };
    const dark = block(/^:root\s*{([^}]*)}/m);
    const lightAttr = block(/:root\[data-theme="light"\]\s*{([^}]*)}/);
    const lightMedia = block(/@media\s*\(prefers-color-scheme:\s*light\)\s*{\s*:root:not\(\[data-theme\]\)\s*{([^}]*)}/);
    return { dark, light: lightAttr, lightMedia };
  }

  // ---- checks -----------------------------------------------------------------
  function checkPhasePairs(tokens) {
    // Worst (minimum) simulated Delta-E over both themes x both deficiencies.
    const failures = [];
    let worst = { de: Infinity };
    for (let i = 0; i < PHASES.length; i++) for (let j = i + 1; j < PHASES.length; j++) {
      const a = PHASES[i], b = PHASES[j];
      if (MERGED.some(([x, y]) => (a === x && b === y) || (a === y && b === x))) continue;
      for (const theme of ['dark', 'light']) {
        const ca = hexToRgb(tokens[theme][`--ph-${a}`]), cb = hexToRgb(tokens[theme][`--ph-${b}`]);
        for (const [simName, sim] of [['protanopia', protanopia], ['deuteranopia', deuteranopia]]) {
          const de = deltaE76(sim(ca), sim(cb));
          if (de < worst.de) worst = { de, a, b, theme, sim: simName };
          if (de < DE_MIN_PAIR) failures.push(`${a} vs ${b} [${theme}, ${simName}]: ΔE=${de.toFixed(1)} < ${DE_MIN_PAIR}`);
        }
      }
    }
    return { failures, worst };
  }
  function checkTextContrast(tokens) {
    const failures = [];
    const t = tokens.dark, bg0 = hexToRgb(t['--surface-0']), bg1 = hexToRgb(t['--surface-1']);
    for (const name of ['--text-primary', '--text-secondary', '--text-muted']) {
      for (const [bgName, bg] of [['--surface-0', bg0], ['--surface-1', bg1]]) {
        const r = contrast(hexToRgb(t[name]), bg);
        if (r < TEXT_RATIO) failures.push(`${name} on ${bgName} (dark): ${r.toFixed(2)}:1 < ${TEXT_RATIO}:1`);
      }
    }
    return failures;
  }
  function checkSymbolContrast(tokens) {
    const failures = [];
    const names = PHASES.map(p => `--ph-${p}`).concat(['--cap-over', '--cap-tight', '--cap-room', '--select']);
    for (const theme of ['dark', 'light']) {
      const bg = hexToRgb(tokens[theme]['--surface-0']);
      for (const name of names) {
        const r = contrast(hexToRgb(tokens[theme][name]), bg);
        if (r < SYMBOL_RATIO) failures.push(`${name} on --surface-0 [${theme}]: ${r.toFixed(2)}:1 < ${SYMBOL_RATIO}:1`);
      }
    }
    return failures;
  }

  function run(cssPath = CSS_PATH) {
    const css = fs.readFileSync(cssPath, 'utf8');
    const tokens = parseTokens(css);
    const report = { failures: [] };
    // The follow-device media block must carry the same light values as the
    // explicit data-theme="light" block.
    for (const [k, v] of Object.entries(tokens.light)) {
      if (tokens.lightMedia[k] !== v) report.failures.push(`light mismatch: ${k} media=${tokens.lightMedia[k]} attr=${v}`);
    }
    for (const p of PHASES) for (const th of ['dark', 'light'])
      if (!tokens[th][`--ph-${p}`]) report.failures.push(`missing token --ph-${p} [${th}]`);
    const pairs = checkPhasePairs(tokens);
    report.failures.push(...pairs.failures);
    report.failures.push(...checkTextContrast(tokens));
    report.failures.push(...checkSymbolContrast(tokens));
    report.worstPair = pairs.worst;
    report.ok = report.failures.length === 0;
    return report;
  }

  function main() {
    const report = run();
    const w = report.worstPair;
    console.log('Phase palette colour check — css/app.css');
    console.log(`  worst simulated phase pair: ${w.a} vs ${w.b} [${w.theme}, ${w.sim}] ΔE=${w.de.toFixed(1)} (floor ${DE_MIN_PAIR})`);
    if (report.ok) {
      console.log('  text 4.5:1 on dark surfaces: PASS');
      console.log('  symbols 3:1 on theme surfaces: PASS');
      console.log('  light media-query block matches data-theme="light": PASS');
      console.log('ALL CHECKS PASSED');
    } else {
      console.log('FAILURES:');
      for (const f of report.failures) console.log('  - ' + f);
      process.exitCode = 1;
    }
  }

  const api = {
    PHASES, MERGED, DE_MIN_PAIR, TEXT_RATIO, SYMBOL_RATIO,
    hexToRgb, rgbToLab, deltaE76, protanopia, deuteranopia, contrast,
    parseTokens, checkPhasePairs, checkTextContrast, checkSymbolContrast, run,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ColorblindCheck = api;
  if (typeof require !== 'undefined' && require.main === module) main();
})(typeof window !== 'undefined' ? window : globalThis);
