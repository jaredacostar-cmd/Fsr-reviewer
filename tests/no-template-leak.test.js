'use strict';
// A '${…}' inside a quoted (not backtick) string renders as literal text: Growth › Timing once showed
// "Wastewater plants: trigger-year ranges ${SvcTab().wwFlowLabe…" as its heading. This scans every
// browser script's string literals (comments, template literals and regex literals skipped).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
function quotedStrings(src) {
  const out = []; let i = 0, line = 1, prev = '';
  const stack = [];   // template-literal nesting: '`' while inside a template's text, '{' depth inside ${}
  const regexOk = () => !prev || /[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /\b(return|typeof|case|in|of|else|void|delete|throw)$/.test(prev);
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (stack.length && stack[stack.length - 1] === '`') {   // template text
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); prev = '`'; i++; continue; }
      if (c === '$' && n === '{') { stack.push(0); i += 2; prev = '{'; continue; }
      i++; continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const j = src.indexOf('*/', i + 2); line += (src.slice(i, j).match(/\n/g) || []).length; i = j + 2; continue; }
    if (c === '\'' || c === '"') {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') { s += src[j] + src[j + 1]; j += 2; continue; } s += src[j++]; }
      out.push({ line, s }); prev = c; i = j + 1; continue;
    }
    if (c === '`') { stack.push('`'); i++; continue; }
    if (stack.length && typeof stack[stack.length - 1] === 'number') {
      if (c === '{') { stack[stack.length - 1]++; prev = c; i++; continue; }
      if (c === '}') { if (stack[stack.length - 1] === 0) { stack.pop(); i++; continue; } stack[stack.length - 1]--; prev = c; i++; continue; }
    }
    if (c === '/' && regexOk()) {   // regex literal
      let j = i + 1, cls = false;
      while (j < src.length && src[j] !== '\n') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break; j++; }
      i = j + 1; while (/[a-z]/.test(src[i] || '')) i++; prev = '/re'; continue;
    }
    const w = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 40));
    if (w) { prev = w[0]; i += w[0].length; continue; }
    prev = c; i++;
  }
  return out;
}

test('the scanner finds a ${…} in a quoted string and ignores templates, comments and regexes', () => {
  const hits = quotedStrings("const a = 'x ${b}'; const t = `ok ${'inner'} ${`n ${1}`}`; // '${c}'\nconst r = /\\$\\{x\\}/; f(\"y\");");
  assert.deepEqual(hits.filter(h => h.s.includes('${')).map(h => h.s), ['x ${b}']);
});

test('no browser script has a ${…} inside a quoted (not backtick) string', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script[^>]*src="(js\/[^"?]+)/g)].map(m => m[1]);
  assert.ok(files.length > 20);
  const leaks = [];
  for (const f of files) for (const h of quotedStrings(fs.readFileSync(path.join(ROOT, f), 'utf8'))) if (/\$\{[^}]*\}/.test(h.s)) leaks.push(`${f}:${h.line}: ${h.s.slice(0, 80)}`);
  assert.deepEqual(leaks, []);
});

test('lint also forbids it (no-template-curly-in-string)', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'eslint.config.mjs'), 'utf8'), /'no-template-curly-in-string': 'error'/);
});
