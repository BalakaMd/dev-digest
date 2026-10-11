import { describe, it, expect } from 'vitest';
import { parseFunctionStructure } from '../../src/adapters/astgrep/index.js';
import { newSideLines } from '../../src/modules/eval/helpers.js';
import { suggestRange } from '../../src/modules/eval/suggestion.js';

/**
 * SPEC-07 T-5 / AC-31 — the two examples of the problem statement, as fixtures run by `verify:l06`.
 * `SOURCE` is the real whole-file patch of `playground/eval-demo/routes.ts` of PR #17 (stored `input_diff`),
 * including the `import` on line 4 (a term there must not attract the retarget), `interface Req` on 6-9,
 * `registerRoutes` on 15 and the `/users` handler on 16-19.
 */
const SOURCE = [
  "// Demo HTTP handlers for trying the eval pipeline. Intentionally flawed; not", // 1
  "// imported by any package.", // 2
  "", // 3
  "import { chargeUser, findUserByEmail, type Db } from \"./user-service\";", // 4
  "", // 5
  "interface Req {", // 6
  "  body: any;", // 7
  "  query: any;", // 8
  "}", // 9
  "interface Reply {", // 10
  "  status(code: number): Reply;", // 11
  "  send(payload: unknown): void;", // 12
  "}", // 13
  "", // 14
  "export function registerRoutes(app: { post: Function; get: Function }, db: Db) {", // 15
  "  app.get(\"/users\", async (req: Req, reply: Reply) => {", // 16
  "    const user = await findUserByEmail(db, req.query.email);", // 17
  "    reply.send(user);", // 18
  "  });", // 19
  "", // 20
  "  app.post(\"/charge\", async (req: Req, reply: Reply) => {", // 21
  "    try {", // 22
  "      const result = await chargeUser(db, req.body.userId, req.body.cents);", // 23
  "      reply.send(result);", // 24
  "    } catch (err) {", // 25
  "      reply.status(500).send({ error: String(err), stack: (err as Error).stack });", // 26
  "    }", // 27
  "  });", // 28
  "}", // 29
];
const PATCH = ['diff --git a/playground/eval-demo/routes.ts b/playground/eval-demo/routes.ts', 'new file mode 100644', '--- /dev/null', '+++ b/routes.ts', `@@ -0,0 +1,${SOURCE.length} @@`, ...SOURCE.map((l) => `+${l}`), ''].join('\n');

function suggest(title: string, cited: { start_line: number; end_line: number }, rationale = '') {
  const { lines, hunks } = newSideLines(PATCH);
  return suggestRange({
    type: 'must_find',
    kind: 'finding',
    file: 'playground/eval-demo/routes.ts',
    cited,
    title,
    rationale,
    lines,
    hunks,
    analyze: (source) => parseFunctionStructure('playground/eval-demo/routes.ts', source),
  });
}

describe('AC-31 examples', () => {
  it('example 1: "Unhandled promise rejection in GET /users route", cited 6-8 -> 16-19', () => {
    const out = suggest('Unhandled promise rejection in GET /users route', { start_line: 6, end_line: 8 });
    expect(out.suggested).toEqual({ start_line: 16, end_line: 19 });
    expect(out.reason.terms).toEqual([{ term: '"/users"', count: 1 }]);
    expect(out.reason.expanded_to_function).toEqual({ name: null });
    expect(out.reason.structure_available).toBe(true);
  });

  it('defect: a term that also sits on the import line (4) retargets to the call in the handler, not the import', () => {
    const out = suggest(
      'Unhandled promise rejection in GET /users route',
      { start_line: 6, end_line: 8 },
      'The call to `findUserByEmail` is not wrapped in try/catch.',
    );
    expect(out.suggested).toEqual({ start_line: 16, end_line: 19 });
    expect(out.reason.terms[0]).toEqual({ term: '"/users"', count: 1 });
  });

  it('example 2 (Q-4): no code-like term in the title -> the rules keep the cited 6-6 (needs a manual edit)', () => {
    const out = suggest('Missing input validation on route parameters', { start_line: 6, end_line: 6 });
    expect(out.suggested).toEqual({ start_line: 6, end_line: 6 });
    expect(out.reason.terms).toEqual([]);
  });
});
