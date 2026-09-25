# Conventions Extractor

Turns the implicit house rules of an imported repository into reviewable
candidates, and the accepted ones into skills that agents apply during review.

| Piece | Where |
|-------|-------|
| Server module | `server/src/modules/conventions/` (routes → service → repository, pure `helpers.ts`) |
| Prompt | `server/src/prompts/conventions-extraction.system.md` |
| Tables | `conventions`, `convention_scans` (`server/src/db/schema/knowledge.ts`, migration `0012`) |
| Contracts | `ConventionCandidate`, `ConventionScan`, `ConventionsState`, `ConventionSkillDraft`, … in `@devdigest/shared` `contracts/knowledge.ts` |
| Page | `client/src/app/repos/[repoId]/conventions/` (Skills Lab → Conventions) |
| Model | Settings → Models → **Conventions** (`feature_models.conventions`), default `openrouter / deepseek/deepseek-v4-flash` |

## Pipeline

```
POST /repos/:id/conventions/extract
  1. sample   configs at the clone root (tsconfig, eslint, prettier, biome, editorconfig)
              + repoIntel.getConventionSamples(repoId, 12)            — pure code, no model
  2. extract  one structured LLM call (schema `ConventionExtraction`); every file is
              line-numbered and wrapped as <untrusted> data
  3. verify   each evidence: sampled file, sane range, quoted code really on those lines
              (±3 lines drift is re-anchored); no valid evidence → candidate dropped
  4. score    confidence = model × (0.5 + 0.5 × verified/claimed) + 0.05 per extra file
  5. dedupe   same category + token Jaccard ≥ 0.6 → merged (evidence unioned);
              rules matching an accepted, rejected or user-edited one are skipped
  6. persist  in one transaction: new `convention_scans` row, previous untouched
              PENDING candidates replaced; accepted, rejected and edited rows kept
```

The model is resolved on every scan with `resolveFeatureModel(…, 'conventions')`,
so a change in Settings applies to the next scan without a restart.

Model output (`ConventionExtraction`):

```ts
{ candidates: [{ category, rule, evidence: [{ file, line_start, line_end, snippet }], confidence }] }
```

The stored snippet is always the file's own text, never the model's quote.
Configs are probed at the clone root and in the top-level folder of each ranked
sample (up to four), so `client/tsconfig.json` is found in a repo made of
several packages. Rules are always written in English, whatever language the
code comments use; a mixed-language list would also defeat de-duplication.

"Untouched" means `updated_at = created_at`: both come from the inserting
transaction's `now()`, and every PATCH moves `updated_at`. A pending card the
user edited (or accepted and then un-accepted) therefore survives a re-scan.

## API

| Method | Path | Result |
|--------|------|--------|
| `POST` | `/repos/:id/conventions/extract` | `ConventionsState` — 422 when the repo is not cloned or nothing could be sampled |
| `GET` | `/repos/:id/conventions` | `ConventionsState` — latest scan, pending/accepted `candidates`, and `rejected` listed apart (never mixed into counts, filters or drafts) |
| `PATCH` | `/conventions/:id` | `{ status?, rule?, category? }` → the candidate; `status: pending` on a rejected one restores it |
| `GET` | `/repos/:id/conventions/skill-drafts?split=single\|category` | `ConventionSkillDraft[]` from accepted candidates — 422 when none |
| `POST` | `/repos/:id/conventions/skills` | `{ skills: [...] }` → `Skill[]` (201); every call creates **new** skills, type `convention`, source `extracted`, `evidence_files` from the candidates |

## Product improvements

The first version of this idea produced mostly generic or unverifiable findings.
Four changes, all implemented, target that:

1. **Configs are evidence.** repo-intel never indexes configs and filters them out
   of rank samples, so the extractor reads them from the clone root itself. A
   strict `tsconfig` flag or an eslint rule is the most reliable convention a repo
   has. It is now a first-class source that the model can cite by line.
2. **Multi-file confirmation.** The model may cite up to three places per rule.
   Each place is verified separately. Confidence drops with every citation that
   fails, and rises with every extra distinct file that backs the rule. A rule
   seen in one file ranks below a rule seen in three.
3. **Categories and de-duplication.** A fixed taxonomy (naming, error-handling,
   async, imports, module-structure, typing, testing, formatting, api,
   data-access, other) gives a filter in the UI. It also scopes de-duplication:
   restatements of one rule merge into a single card with the evidence combined.
   A re-scan never re-proposes a rule the user already accepted or rejected.
4. **Skills per category.** The Create skill modal can emit one skill for
   everything, or one per category. Small, focused skills can be linked to the
   agents they suit, for example `typing` to General and `api` to API Contract,
   instead of every agent getting one large block.

### Backlog

- **AST-level verification.** The current check matches text. With ast-grep the
  check could confirm that the cited lines contain the construct the rule talks
  about, not just any code.
- **Counter-evidence and adherence.** For each rule, search the whole repo for
  violations as well as examples, and show "followed in 42 of 45 files". This
  separates a real convention from a pattern that appears once.
- **Stratified sampling.** Top-ranked files cluster in the core. Picking the best
  file per directory or layer (routes, services, tests, UI) would surface
  conventions from every part of the codebase.
- **Semantic de-duplication.** Token overlap misses paraphrases. For example,
  "Document constants with phase tags [T1]…" and "Use phase-tagged comments
  in constants…" score below the threshold, so a rejected rule can come back
  reworded. Comparing embeddings, when they are enabled, would catch these.
- **Two-step file selection.** First let the model choose which files to read
  from the repo map; then run the extraction on those files. The mock already
  anticipates this with `ConventionFileSelection`.
- **Confidence calibration.** Use each workspace's accept/reject history to learn
  which categories and confidence bands users actually keep.
- **Recency weighting.** Weight evidence by `git blame` age. A pattern in recently
  written code is the current convention, while an old one may be legacy the
  team is moving away from.
- **Incremental re-scan.** Re-scan only files changed since the last scan's head
  commit, and flag accepted rules that new code contradicts.
- **Review feedback loop.** Rules that agents keep flagging in PR reviews are
  proven conventions. Rules nobody ever violates may not need a skill at all.
