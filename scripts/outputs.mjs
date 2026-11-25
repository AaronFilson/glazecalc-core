// The library's output check (test/engine-outputs.js), two ways:
//
//   node scripts/outputs.mjs            each output's hash against test/outputs.json, the kept snapshot
//   node scripts/outputs.mjs --write    keeps the hashes as they are now (say why in the change)
//   node scripts/outputs.mjs --engines  the same outputs, bundled as one plain script, in Node,
//                                       JavaScriptCore (jsc) and SpiderMonkey (sm): every output the same
//                                       text in all three, so the library holds in Safari and Firefox
//
// The engines: JSC and SM from the environment, else ~/.esvu/bin (npx esvu install jsc, then spidermonkey), else
// macOS's own jsc. One missing fails the check: a check that quietly ran in fewer engines would say nothing.
// A bare engine shell has no structuredClone, which the core takes from its host (globals.d.ts): the bundle gives
// one there, as a JSON copy, which is the same for records read from JSON.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const ROOT = path.resolve(import.meta.dirname, '..');
const SNAPSHOT = path.join(ROOT, 'test', 'outputs.json');
// The core's outputs over its own frozen fixture (test/tables.json, test/standard.json).
const BUNDLE = `import { outputs } from './test/engine-outputs.js';
const rows = outputs();`;
const nodeRows = async () => (await import('../test/engine-outputs.js')).outputs();

const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const lineOf = (value) => JSON.stringify(value) ?? 'undefined';

const PRINT = `
const write = typeof print === 'function' ? print : console.log;
for (const [key, value] of rows) write(key + '\\t' + (JSON.stringify(value) ?? 'undefined'));`;
const STAND_IN = `if (typeof structuredClone !== 'function')
  globalThis.structuredClone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));`;

/** Each output's key and the hash of its text, as Node gives them. */
async function nodeHashes() {
  const rows = await nodeRows();
  return Object.fromEntries([...rows].map(([key, value]) => [key, hash(lineOf(value))]));
}

async function check(write) {
  const now = await nodeHashes();
  if (write) {
    writeFileSync(SNAPSHOT, JSON.stringify(now, null, 1) + '\n');
    console.log(`Kept ${Object.keys(now).length} outputs in test/outputs.json.`);
    return true;
  }
  const kept = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, 'utf8')) : {};
  const keys = [...new Set([...Object.keys(kept), ...Object.keys(now)])];
  const moved = keys.filter((key) => kept[key] !== now[key]);
  if (!moved.length) {
    console.log(`Every output is as kept (${keys.length}).`);
    return true;
  }
  console.error(`${moved.length} of ${keys.length} outputs changed:`);
  for (const key of moved.slice(0, 40)) console.error(`  ${key}`);
  console.error('If the change means to move them, say why in the change and the CHANGELOG, and keep them:');
  console.error('  node scripts/outputs.mjs --write');
  return false;
}

/** Where an engine is: its variable, ~/.esvu/bin, or (for jsc) the one macOS has. */
function engineAt(name, variable, others = []) {
  const found = [process.env[variable], path.join(homedir(), '.esvu', 'bin', name), ...others].filter(Boolean);
  return found.find((file) => existsSync(file));
}

/** An engine's run of the bundle: each output's key and hash, or why it failed. */
function runIn(engine, file) {
  const done = spawnSync(engine, [file], { encoding: 'utf8', maxBuffer: 1 << 30 });
  if (done.status !== 0 || done.error) {
    // jsc writes an uncaught exception to stdout, after the outputs: the lines that are not outputs.
    const said = (done.stdout ?? '').split('\n').filter((line) => line && !line.includes('\t'));
    return {
      failed: done.error?.message ?? ([done.stderr.trim(), ...said].filter(Boolean).join('\n') || `exit ${done.status}`)
    };
  }
  const rows = new Map();
  for (const line of done.stdout.split('\n')) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    rows.set(line.slice(0, tab), hash(line.slice(tab + 1)));
  }
  return { rows };
}

async function engines() {
  const found = {
    node: process.execPath,
    jsc: engineAt('jsc', 'JSC', ['/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc']),
    sm: engineAt('sm', 'SM')
  };
  const missing = Object.entries(found).filter(([, file]) => !file);
  if (missing.length) {
    console.error(
      `No ${missing.map(([name]) => name).join(' or ')} found. Install with: npx esvu install jsc and npx esvu install spidermonkey,\n` +
        'or name them with JSC=… SM=…'
    );
    return false;
  }
  const { outputFiles } = await build({
    stdin: { contents: BUNDLE + PRINT, resolveDir: ROOT, sourcefile: 'engines.js' },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'neutral',
    target: 'esnext',
    loader: { '.ndjson': 'text' },
    banner: { js: STAND_IN },
    logLevel: 'silent'
  });
  const dir = path.join(ROOT, 'node_modules', '.cache', 'engines');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'bundle.js');
  writeFileSync(file, outputFiles[0].text);
  const runs = {};
  for (const [name, engine] of Object.entries(found)) {
    const started = Date.now();
    runs[name] = { ...runIn(engine, file), seconds: ((Date.now() - started) / 1000).toFixed(1) };
  }
  const broken = Object.entries(runs).filter(([, r]) => r.failed);
  for (const [name, r] of broken) console.error(`${name} failed:\n  ${r.failed.split('\n').slice(0, 6).join('\n  ')}`);
  if (broken.length) return false;
  const keys = [...new Set(Object.values(runs).flatMap((r) => [...r.rows.keys()]))];
  const differ = keys.filter((key) => new Set(Object.values(runs).map((r) => r.rows.get(key))).size > 1);
  const times = Object.entries(runs)
    .map(([name, r]) => `${name} ${r.seconds} s`)
    .join(', ');
  if (differ.length) {
    console.error(`${differ.length} of ${keys.length} outputs differ between the engines (${times}):`);
    for (const key of differ.slice(0, 40))
      console.error(
        `  ${key}  ${Object.entries(runs)
          .map(([n, r]) => `${n} ${r.rows.get(key) ?? '-'}`)
          .join('  ')}`
      );
    return false;
  }
  console.log(`All ${keys.length} outputs the same in Node, JavaScriptCore and SpiderMonkey (${times}).`);
  return true;
}

const args = process.argv.slice(2);
const ok = args.includes('--engines') ? await engines() : await check(args.includes('--write'));
if (!ok) process.exit(1);
