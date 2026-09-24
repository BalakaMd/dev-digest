# Skill examples

Importable skills for the two skills-experiment agents seeded by `pnpm db:seed`:
**Test Quality Reviewer** and **API Contract Reviewer**. Both ship disabled and with
no skills linked. Their base prompts are deliberately narrow, so each linked skill
visibly changes what the agent reports.

| File | Import as | Link to |
|------|-----------|---------|
| `test-coverage-nudge.md` | `.md` | Test Quality Reviewer |
| `corner-case-checklist.md` | `.md` | Test Quality Reviewer |
| `contract-breaking-change.zip` | `.zip` | API Contract Reviewer |
| `response-shape-guard.md` | `.md` | API Contract Reviewer |

`contract-breaking-change.zip` contains `SKILL.md` (the core), a `README.md`, and
an executable `scripts/check.sh`. The import preview lists the last two as
**ignored**, and warns about the script. Nothing but the markdown core is ever
stored, and nothing in the archive is ever run.

The folder `contract-breaking-change/` holds the zip's sources. To rebuild the zip:

```sh
cd docs/skill-examples/contract-breaking-change && zip -qr ../contract-breaking-change.zip SKILL.md README.md scripts
```

## Trust

An imported skill is somebody else's instructions, pasted into your agent's
prompt. DevDigest never executes anything from an archive, but the markdown itself
is not sandboxed: the model reads it as guidance. Read a skill before you enable it.

## Import

1. Go to **Skills → Add → Import**.
2. Pick a file.
3. Check the preview: the rendered body, name, description, type, and any ignored
   entries.
4. Confirm. The skill is saved with source **imported**.
5. Go to **Agents → the agent → Skills**, and toggle the skill on. Drag the rows to
   set the order of the blocks in the prompt.

## Control experiment 1 — Test Quality

Open a PR that changes a function with a conditional, and adds a test for the
happy path only. For example:

```ts
// src/discount.ts
export function discount(total: number, code?: string): number {
  if (!code) return total;
  if (code === 'VIP') return total * 0.8;
  if (total <= 0) throw new Error('total must be positive');
  return total * 0.95;
}

// src/discount.test.ts
it('applies the VIP discount', () => {
  expect(discount(100, 'VIP')).toBe(80);
});
```

1. **Without skills.** Run **Run Review → Test Quality Reviewer**. Expected result:
   no finding about the untested branches.
2. **With skills.** Link `test-coverage-nudge` and `corner-case-checklist`, then
   re-run. Expected result: the no-code branch, the non-VIP branch, the
   `total <= 0` throw, and boundary values are flagged.

## Control experiment 2 — API Contract

Open a PR that changes a route's signature. For example, a rename in the response
and a new required body field:

```diff
-const Body = z.object({ amount: z.number() });
+const Body = z.object({ amount: z.number(), currency: z.string() });
 app.post('/payments', { schema: { body: Body } }, async (req) => {
-  return { id: p.id, created_at: p.createdAt };
+  return { id: p.id, createdAt: p.createdAt };
 });
```

1. **Without skills.** Run **Run Review → API Contract Reviewer**. Expected result:
   the contract change is not reported as breaking.
2. **With skills.** Link `contract-breaking-change` (imported from the zip) and
   `response-shape-guard`, then re-run. Expected result: the new required
   `currency` field and the `created_at` → `createdAt` rename are reported as
   breaking changes.

## What to check in the trace

Go to the PR page, open **Findings**, then **Run history**, and open the run's
trace. Look at the **Prompt assembly** section.

- With skills: a **Skills** block shows one sub-block per enabled skill, in the
  order set on the agent's Skills tab, and the token weight of the skills block
  alone.
- Without skills: there is no Skills block.
- The run **Log** tab has one `Skill N: <name>` line per enabled skill.
- A disabled or unlinked skill leaves no line and no block.
