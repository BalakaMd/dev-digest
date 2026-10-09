import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseFunctionStructure } from '../../src/adapters/astgrep/index.js';

/** SPEC-07 T-2 — function structure of a source string (AC-10, AC-12, AC-13, NFR-4). */
describe('parseFunctionStructure', () => {
  it('finds a function declaration with its lines', () => {
    const s = parseFunctionStructure('a.ts', 'const x = 1;\nfunction foo() {\n  return 1;\n}\n')!;
    expect(s.functions).toEqual([{ name: 'foo', start: 2, end: 4 }]);
  });

  it('finds a class method', () => {
    const s = parseFunctionStructure('a.ts', 'class A {\n  run() {\n    return 1;\n  }\n}\n')!;
    expect(s.functions).toEqual([{ name: 'run', start: 2, end: 4 }]);
  });

  it('names `const f = () =>` and leaves an arrow call argument anonymous', () => {
    const s = parseFunctionStructure('a.ts', 'const f = () => {\n  return 1;\n};\napp.get("/x", async (req) => {\n  await 1;\n});\n')!;
    expect(s.functions).toEqual([
      { name: 'f', start: 1, end: 3 },
      { name: null, start: 4, end: 6 },
    ]);
  });

  it('lists nested functions and statement blocks', () => {
    const s = parseFunctionStructure('a.ts', 'function outer() {\n  function inner() {\n    return 1;\n  }\n  if (x) {\n    inner();\n  }\n}\n')!;
    expect(s.functions.map((f) => f.name)).toEqual(['outer', 'inner']);
    expect(s.blocks).toContainEqual({ start: 5, end: 7 });
    expect(s.blocks).toContainEqual({ start: 1, end: 8 });
  });

  it('does not throw on a truncated fragment', () => {
    expect(() => parseFunctionStructure('a.ts', 'function foo() {\n  const a = 1;\n')).not.toThrow();
    expect(parseFunctionStructure('a.ts', 'function foo() {\n  const a = 1;\n')).not.toBeNull();
  });

  it('is deterministic', () => {
    const src = 'function a() {\n  return 1;\n}\n';
    expect(parseFunctionStructure('a.ts', src)).toEqual(parseFunctionStructure('a.ts', src));
  });

  it('returns null for unsupported file types', () => {
    expect(parseFunctionStructure('README.md', '# hi')).toBeNull();
    expect(parseFunctionStructure('a.py', 'def f():\n  pass\n')).toBeNull();
  });

  it('NFR-4: the adapter function reads no files (the helper is in-memory)', () => {
    const src = readFileSync(new URL('../../src/adapters/astgrep/index.ts', import.meta.url), 'utf8');
    const tail = src.slice(src.indexOf('export function parseFunctionStructure'));
    expect(tail).not.toMatch(/readFile|node:fs/);
  });
});
