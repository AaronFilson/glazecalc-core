// The nameless core: it imports only itself, never reads what a record is called, and writes no words. Its
// files are read as text here, so a slip fails here and never reaches a host.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const CORE = path.resolve(import.meta.dirname, '..');
const TESTS = path.join(CORE, 'test') + path.sep;
// The library's own folders: not its tools (scripts, node_modules), which are not shipped.
const SKIP = new Set(['node_modules', 'scripts', 'coverage', '.git']);
const filesIn = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    if (SKIP.has(entry)) return [];
    const full = path.join(dir, entry);
    return statSync(full).isDirectory()
      ? filesIn(full)
      : /\.(ts|js)$/.test(full) && !full.endsWith('eslint.config.js')
        ? [full]
        : [];
  });
// The code, without its comments, which may say what the host does.
const code = (file) =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('the nameless core', () => {
  const files = filesIn(CORE);
  // The library's code, without its own tests, which may build records and read their fields freely.
  const shipped = files.filter((file) => !file.startsWith(TESTS));

  // So that the checks below can never pass by reading nothing.
  test('has its files: its code and its tests', () => {
    assert.ok(shipped.length > 30);
    assert.ok(files.length - shipped.length > 10);
  });

  test('imports only its own modules', () => {
    // import ... from, export ... from, a bare import, import() and require(): the module each names.
    const targetsOf = (file) =>
      [
        ...code(file).matchAll(/\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g),
        ...code(file).matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
        ...code(file).matchAll(/\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g)
      ].map((m) => m[1]);
    let read = 0;
    for (const file of files) {
      for (const target of targetsOf(file)) {
        read++;
        // The core's own tests may use Node's test runner and assert as well.
        if (file.startsWith(TESTS) && target.startsWith('node:')) continue;
        const where = `${path.relative(CORE, file)} imports ${target}`;
        assert.ok(target.startsWith('.'), where);
        assert.ok(path.resolve(path.dirname(file), target).startsWith(CORE + path.sep), where);
      }
    }
    // The patterns find the imports there are.
    assert.ok(read > 100);
  });

  // An oxide field ({ name: 'SiO2', amount }) and a cap group are called by a name; so is an error class.
  test('never reads a name: only an oxide field, a cap group or an error class is called by one', () => {
    for (const file of shipped) {
      const reads = [...code(file).matchAll(/([\w$\])]+)\.name\b/g)].map((m) => m[1]);
      assert.deepEqual(
        reads.filter((owner) => !['field', 'group', 'this'].includes(owner)),
        [],
        path.relative(CORE, file)
      );
    }
  });

  test('writes no words: no English templates, no locale, no display formatting', () => {
    for (const file of shipped) {
      const text = code(file);
      for (const banned of [/\bIntl\b/, /toLocale\w*\(/, /\benglish\(/, /\bformatFormula\b/, /\bwarnings\s*:/]) {
        assert.equal(banned.test(text), false, `${path.relative(CORE, file)}: ${banned}`);
      }
    }
  });
});
