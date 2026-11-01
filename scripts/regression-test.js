#!/usr/bin/env node
/* b5.0-tests: static regression checks for On.i-CRM (read-only, zero dependencies).
 *
 * Scope: order / syntax / public API aliases / global declarations / callsite
 * thresholds / Cyrillic (moji) total. It does NOT test runtime behaviour
 * (login, sync, render) - that stays with on-device tests.
 *
 * Env (same as smoke-test.ps1):
 *   ONI_INDEX_PATH  path to index.html
 *   ONI_ASSETS_DIR  directory with the JS files
 * Exit code: 0 = no FAIL, 1 = at least one FAIL.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------------------------------------------------------- config ---
// baseline b5.0, 2026-11-01 (whole index.html + every local <script src> file)
const MOJI_BASELINE_TOTAL = 42031;
const MOJI_TOLERANCE = 0.05;

// Relative order of external files. Inline blocks may sit between them.
// Extend THIS array in the same commit that adds a new <script src>.
const REQUIRED_ORDER = ['app-storage.js', 'core.js', 'app-auth.js', 'ui-extra.js'];

// window.X must be assigned somewhere in the runtime JS.
const PUBLIC_API = [
  'safeStorageSet', 'safeStorageGet', 'safeStorageDelete',
  'fbApp', 'fbAuth', 'fbDb', 'auth', 'db',
  'callCloudFn', '_oniPushIdToken'
];

// Must be declared at global scope (function declaration, var/let/const, or
// window.X assignment). window.* is NOT required for these.
const GLOBAL_FUNCS = [
  'persist', 'safeRender', 'loginViaFirebase', '_oniPushIdToken',
  '_fbSyncPull', '_fbPullFromFirestore', '_fbRunSync', '_fbLoadActiveShop',
  'startProductsWatcher', 'callCloudFn'
];
const GLOBAL_VARS = ['FB_SHOP_ID', '_shopReady', '_shopPendingSync', '_shopLoadPromise', '_shopLoadGeneration', '_shopNotReadyLogged'];

// Summed over ALL runtime JS (inline + every external script). Definitions are
// not counted as calls.
const CALLSITES = [
  { name: 'persist', re: /(?<![\w$.])persist\s*\(/g, min: 100 },
  { name: 'safeRender', re: /(?<![\w$.])safeRender\s*\(/g, min: 50 },
  { name: 'loginViaFirebase', re: /\bloginViaFirebase\b/g, min: 1 },
  { name: '_oniPushIdToken', re: /\b_oniPushIdToken\b/g, min: 3 },
  { name: '_fbSyncPull', re: /\b_fbSyncPull\b/g, min: 5 },
  { name: '_fbPullFromFirestore', re: /\b_fbPullFromFirestore\b/g, min: 1 }
];

// ---------------------------------------------------------------- paths ----
const DEFAULT_ASSETS = path.resolve(__dirname, '..', 'android-project', 'app', 'src', 'main', 'assets');
const INDEX_PATH = path.resolve(process.env.ONI_INDEX_PATH || path.join(process.env.ONI_ASSETS_DIR || DEFAULT_ASSETS, 'index.html'));
const ASSETS_DIR = path.resolve(process.env.ONI_ASSETS_DIR || path.dirname(INDEX_PATH));

// ------------------------------------------------------------- reporting ---
const results = [];
function rec(level, name, detail) {
  results.push({ level, name, detail });
  console.log('  [' + level + '] ' + name + (detail ? ' - ' + detail : ''));
}
const pass = (n, d) => rec('PASS', n, d);
const warn = (n, d) => rec('WARN', n, d);
const fail = (n, d) => rec('FAIL', n, d);

function isExcluded(name) {
  const n = name.replace(/\\/g, '/');
  return /\.bak/i.test(n) || /(^|\/)node_modules\//.test(n) || /\.min\.js$/i.test(n);
}
function cyr(s) { const m = s.match(/[\u0400-\u04FF]/g); return m ? m.length : 0; }
function countMatches(s, re) { const m = s.match(re); return m ? m.length : 0; }
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ------------------------------------------------- top-level decl scanner ---
// Minimal JS scanner: tracks brace depth across strings, template literals,
// comments and regex literals and reports names declared at depth 0.
// If it cannot balance, `balanced` is false and callers fall back to regex.
const REGEX_PREV_PUNCT = '(,=:[!&|?{};+-*%<>~^';
const REGEX_PREV_WORDS = new Set(['return', 'typeof', 'case', 'delete', 'void', 'throw', 'in', 'of', 'new', 'else', 'do', 'instanceof', 'yield', 'await']);
const EXPR_PREV_WORDS = new Set(['return', 'typeof', 'void', 'new', 'await', 'yield', 'in', 'of', 'case', 'throw', 'delete', 'instanceof']);

function scanTopLevel(code) {
  const out = { funcs: new Set(), vars: new Set(), balanced: true };
  const n = code.length;
  const stack = []; // 'b' brace, 't' template-expression brace
  let i = 0;
  let prev = null; // previous significant token: {t:'p'|'w'|'v', v}
  const isIdStart = c => /[A-Za-z_$]/.test(c);
  const isId = c => /[\w$]/.test(c);

  function skipString(q) {
    i++;
    while (i < n) {
      const c = code[i];
      if (c === '\\') { i += 2; continue; }
      if (c === q) { i++; return true; }
      if (c === '\n') return false;
      i++;
    }
    return false;
  }
  function scanTemplate() { // positioned just after the opening backtick or after a closing '}' of ${...}
    while (i < n) {
      const c = code[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; return true; }
      if (c === '$' && code[i + 1] === '{') { i += 2; stack.push('t'); return 'expr'; }
      i++;
    }
    return false;
  }
  function skipRegex() {
    i++;
    let cls = false;
    while (i < n) {
      const c = code[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '\n') return false;
      if (cls) { if (c === ']') cls = false; }
      else if (c === '[') cls = true;
      else if (c === '/') { i++; while (i < n && isId(code[i])) i++; return true; }
      i++;
    }
    return false;
  }

  while (i < n) {
    const c = code[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
    if (c === '/' && code[i + 1] === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    if (c === '/' && code[i + 1] === '*') {
      const e = code.indexOf('*/', i + 2);
      if (e < 0) { out.balanced = false; return out; }
      i = e + 2; continue;
    }
    if (c === '"' || c === "'") {
      if (!skipString(c)) { out.balanced = false; return out; }
      prev = { t: 'v', v: 'str' }; continue;
    }
    if (c === '`') {
      i++;
      const r = scanTemplate();
      if (r === false) { out.balanced = false; return out; }
      if (r === true) prev = { t: 'v', v: 'tpl' };
      else prev = { t: 'p', v: '${' };
      continue;
    }
    if (c === '/') {
      let isRegex = false;
      if (prev === null) isRegex = true;
      else if (prev.t === 'p') isRegex = REGEX_PREV_PUNCT.indexOf(prev.v) >= 0 || prev.v === '${';
      else if (prev.t === 'w') isRegex = REGEX_PREV_WORDS.has(prev.v);
      if (isRegex) {
        if (!skipRegex()) { out.balanced = false; return out; }
        prev = { t: 'v', v: 're' };
      } else { i++; prev = { t: 'p', v: '/' }; }
      continue;
    }
    if (c === '{') { stack.push('b'); i++; prev = { t: 'p', v: '{' }; continue; }
    if (c === '}') {
      const top = stack.pop();
      if (top === undefined) { out.balanced = false; return out; }
      i++;
      if (top === 't') {
        const r = scanTemplate();
        if (r === false) { out.balanced = false; return out; }
        prev = r === true ? { t: 'v', v: 'tpl' } : { t: 'p', v: '${' };
      } else prev = { t: 'p', v: '}' };
      continue;
    }
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && isId(code[j])) j++;
      const word = code.slice(i, j);
      const afterDot = prev && prev.t === 'p' && prev.v === '.';
      if (stack.length === 0 && !afterDot) {
        if (word === 'function') {
          let k = j;
          while (k < n && /\s/.test(code[k])) k++;
          if (code[k] === '*') { k++; while (k < n && /\s/.test(code[k])) k++; }
          let m = k;
          while (m < n && isId(code[m])) m++;
          const name = code.slice(k, m);
          let p = m;
          while (p < n && /\s/.test(code[p])) p++;
          if (name && code[p] === '(') {
            let expr = false;
            if (prev) {
              if (prev.t === 'p') expr = '(,=:?!&|+-*/%<>[~^'.indexOf(prev.v) >= 0 || prev.v === '${';
              else if (prev.t === 'w') expr = EXPR_PREV_WORDS.has(prev.v);
            }
            if (!expr) out.funcs.add(name);
          }
        } else if (word === 'var' || word === 'let' || word === 'const') {
          let k = j;
          while (k < n && /\s/.test(code[k])) k++;
          let m = k;
          while (m < n && isId(code[m])) m++;
          if (m > k) out.vars.add(code.slice(k, m));
        }
      }
      i = j;
      prev = { t: 'w', v: word };
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(code[j])) j++;
      i = j; prev = { t: 'v', v: 'num' }; continue;
    }
    // any other punctuation
    prev = { t: 'p', v: c };
    i++;
  }
  if (stack.length !== 0) out.balanced = false;
  return out;
}

// ------------------------------------------------------------------ main ---
function main() {
  console.log('regression-test.js (b5.0)');
  console.log('  index : ' + INDEX_PATH);
  console.log('  assets: ' + ASSETS_DIR);

  if (!fs.existsSync(INDEX_PATH)) { fail('index.html exists', INDEX_PATH); return finish(); }
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  pass('index.html exists');

  // ---- script inventory, in document order
  const scripts = []; // {kind:'src'|'inline', src?, code?, n?, pos}
  const tagRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, inlineN = 0;
  while ((m = tagRe.exec(html))) {
    const attrs = m[1] || '';
    const srcM = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const typeM = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (srcM) {
      scripts.push({ kind: 'src', src: srcM[1], pos: m.index });
    } else {
      if (typeM && !/javascript|module/i.test(typeM[1])) continue; // json/template blocks
      inlineN++;
      scripts.push({ kind: 'inline', n: inlineN, code: m[2], pos: m.index });
    }
  }
  const isRemote = s => /^(https?:)?\/\//i.test(s);
  const localSrc = scripts.filter(s => s.kind === 'src' && !isRemote(s.src) && !isExcluded(s.src));
  const inlines = scripts.filter(s => s.kind === 'inline');
  console.log('  scripts: ' + localSrc.length + ' local external, ' + inlines.length + ' inline, ' +
    scripts.filter(s => s.kind === 'src' && isRemote(s.src)).length + ' remote');

  // ---- 1. file existence
  const files = {}; // basename -> text
  const needed = REQUIRED_ORDER.slice();
  localSrc.forEach(s => { const b = path.basename(s.src); if (needed.indexOf(b) < 0) needed.push(b); });
  needed.forEach(name => {
    const p = path.join(ASSETS_DIR, name);
    if (fs.existsSync(p)) { files[name] = fs.readFileSync(p, 'utf8'); pass('exists: ' + name); }
    else fail('exists: ' + name, p);
  });
  REQUIRED_ORDER.forEach(name => {
    if (!localSrc.some(s => path.basename(s.src) === name)) fail('linked in index.html: ' + name);
  });

  // ---- 2. syntax (vm.Script = same semantics as a classic <script>)
  Object.keys(files).forEach(name => {
    try { new vm.Script(files[name], { filename: name }); pass('syntax: ' + name); }
    catch (e) { fail('syntax: ' + name, e.message); }
  });
  inlines.forEach(s => {
    const fname = 'inline-' + s.n + '.js';
    try { new vm.Script(s.code, { filename: fname }); pass('syntax: ' + fname, s.code.length + ' chars'); }
    catch (e) { fail('syntax: ' + fname, e.message); }
  });

  // ---- 3. script order
  const posOf = name => { const s = localSrc.find(x => path.basename(x.src) === name); return s ? s.pos : -1; };
  const present = REQUIRED_ORDER.filter(n => posOf(n) >= 0);
  let orderOk = true;
  for (let k = 1; k < present.length; k++) {
    if (!(posOf(present[k - 1]) < posOf(present[k]))) { orderOk = false; fail('order: ' + present[k - 1] + ' < ' + present[k]); }
  }
  if (orderOk) pass('script order', present.join(' < '));
  const mainInline = inlines.find(s => /firebase\.initializeApp\s*\(\s*firebaseConfig\s*\)/.test(s.code));
  if (!mainInline) fail('main inline block found (firebase.initializeApp)');
  else {
    const before = posOf('core.js'), after = posOf('app-auth.js');
    if (before >= 0 && after >= 0 && before < mainInline.pos && mainInline.pos < after) pass('main inline (inline-' + mainInline.n + ') between core.js and app-auth.js');
    else fail('main inline (inline-' + mainInline.n + ') between core.js and app-auth.js');
  }

  // ---- runtime sources (all inline + all local externals)
  const runtime = [];
  inlines.forEach(s => runtime.push({ label: 'inline-' + s.n, code: s.code }));
  Object.keys(files).forEach(name => { if (/\.js$/i.test(name)) runtime.push({ label: name, code: files[name] }); });

  // ---- 4. public API aliases
  PUBLIC_API.forEach(name => {
    const re = new RegExp('window\\s*(?:\\.\\s*' + escRe(name) + '|\\[\\s*[\'"]' + escRe(name) + '[\'"]\\s*\\])\\s*=(?!=)');
    const hit = runtime.find(r => re.test(r.code));
    if (hit) pass('window.' + name + ' assigned', hit.label);
    else fail('window.' + name + ' assigned');
  });

  // ---- 5. global declarations
  const scans = runtime.map(r => ({ label: r.label, code: r.code, scan: scanTopLevel(r.code) }));
  scans.filter(s => !s.scan.balanced).forEach(s => warn('scanner could not balance ' + s.label, 'falling back to definition regex'));
  function declaredGlobal(name, kind) {
    for (const s of scans) {
      if (s.scan.balanced) {
        if (kind === 'func' && s.scan.funcs.has(name)) return s.label + ' (function)';
        if (s.scan.vars.has(name)) return s.label + ' (var/let/const)';
      } else {
        const re = new RegExp((kind === 'func' ? '(?:async\\s+)?function\\s+' : '(?:var|let|const)\\s+') + escRe(name) + '\\b');
        if (re.test(s.code)) return s.label + ' (regex fallback)';
      }
    }
    const wre = new RegExp('window\\s*\\.\\s*' + escRe(name) + '\\s*=(?!=)');
    const w = scans.find(s => wre.test(s.code));
    return w ? w.label + ' (window.' + name + ')' : null;
  }
  GLOBAL_FUNCS.forEach(name => {
    const where = declaredGlobal(name, 'func');
    if (where) pass('global: ' + name, where); else fail('global: ' + name, 'not declared at global scope');
  });
  GLOBAL_VARS.forEach(name => {
    const where = declaredGlobal(name, 'var');
    if (where) pass('global: ' + name, where); else fail('global: ' + name, 'not declared at global scope');
  });

  // ---- 6. callsite thresholds (summed over all runtime JS)
  CALLSITES.forEach(c => {
    let total = 0, defs = 0;
    const defRe = new RegExp('function\\s+' + escRe(c.name) + '\\s*\\(', 'g');
    runtime.forEach(r => { total += countMatches(r.code, c.re); defs += countMatches(r.code, defRe); });
    const calls = total - defs;
    const msg = calls + ' calls (>= ' + c.min + ')';
    if (calls >= c.min) pass('callsites: ' + c.name, msg); else fail('callsites: ' + c.name, msg);
  });

  // ---- 7. moji (Cyrillic) total
  const mojiRows = [['index.html (whole file)', cyr(html)]];
  let total = cyr(html);
  Object.keys(files).forEach(name => {
    if (isExcluded(name) || !/\.js$/i.test(name)) return;
    const c = cyr(files[name]); mojiRows.push([name, c]); total += c;
  });
  console.log('  moji per file (informational):');
  mojiRows.forEach(r => console.log('    ' + String(r[1]).padStart(7) + '  ' + r[0]));
  const delta = (total - MOJI_BASELINE_TOTAL) / MOJI_BASELINE_TOTAL;
  const pct = (delta * 100).toFixed(2) + '%';
  const mmsg = 'total ' + total + ' vs baseline ' + MOJI_BASELINE_TOTAL + ' (' + (delta >= 0 ? '+' : '') + pct + ')';
  if (delta < -MOJI_TOLERANCE) fail('moji total', mmsg + ' - lost Cyrillic, check encoding / lost strings');
  else if (delta > MOJI_TOLERANCE) warn('moji total', mmsg + ' - grew >5%, update baseline if intended');
  else pass('moji total', mmsg);

  finish();
}

function finish() {
  const f = results.filter(r => r.level === 'FAIL').length;
  const w = results.filter(r => r.level === 'WARN').length;
  const p = results.filter(r => r.level === 'PASS').length;
  console.log('\nregression-test: ' + p + ' pass, ' + w + ' warn, ' + f + ' fail');
  if (f > 0) { console.log('RESULT: FAIL'); process.exit(1); }
  console.log('RESULT: PASS'); process.exit(0);
}

try { main(); }
catch (e) { console.log('  [FAIL] unexpected error - ' + (e && e.stack || e)); process.exit(1); }
