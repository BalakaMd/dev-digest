import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Organized by scenario, not by a
 * single artifact, because these behaviors are cross-cutting.
 *
 * Budget: 5 Claude sessions total.
 *   - 3 × trace     → 1 session each                      = 3
 *   - 1 × activation pair (positive + near-miss negative) = 2
 *
 * The three traces cover the three routing layers this repo has:
 *   1. a package CLAUDE.md (server/CLAUDE.md "Read When", loaded once the model enters server/)
 *      + subagent dispatch, in one session;
 *   2. the root CLAUDE.md "Read When" table;
 *   3. the root CLAUDE.md "Insights" rule (every module keeps an INSIGHTS.md).
 *
 * `trace` folds several assertions into ONE session (cheaper, coarser) and stops early once its
 * evidence is in — so a dispatch-bearing trace never waits out the nested subagent's full run.
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): server/CLAUDE.md "Read When" routing + subagent dispatch, together ----
  {
    kind: "trace",
    // The module must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. `exports` is genuinely absent from server/src/modules/.
    name: "new server module reads server architecture doc AND pulls the architecture-reviewer",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований серверний модуль `exports` з ендпоінтом " +
      "GET /reviews/:id/export (віддає ревʼю як markdown). Спершу звірся з настановами server/ щодо " +
      "того, як у цьому репо додають модуль, і прочитай потрібну документацію. Потім ОБОВʼЯЗКОВО " +
      "запусти сабагента architecture-reviewer, щоб він оцінив мій план на відповідність onion-шарам — " +
      "не рецензуй сам.",
    // server/CLAUDE.md: "docs/architecture.md — adding a module, swapping an adapter, …"
    expectFilesRead: ["server/docs/architecture.md"],
    expectSubagents: ["architecture-reviewer"],
    // Read the package guidance and docs, form a plan, THEN dispatch — Haiku needs room to reach
    // the dispatch step; at 8 turns it ran out mid-exploration and never delegated.
    maxTurns: 25,
  },

  // --- trace (1 session): root CLAUDE.md "Read When" routing -----------------------------------
  {
    kind: "trace",
    // Tests the root "Read When" table, so the prompt must push toward CONSULTING the docs, not
    // exploring source — otherwise the model goes straight into server/src/modules/context-docs.
    // One anchor doc keeps this a deterministic routing check.
    name: "project-context question follows root CLAUDE.md routing to docs/project-context.md",
    prompt:
      "Мені треба зрозуміти, як документи project context потрапляють у ревʼю. Перш ніж читати код — " +
      "звірся з настановами цього репо (CLAUDE.md), який документ це описує, і прочитай саме його.",
    expectFilesRead: ["docs/project-context.md"],
    maxTurns: 8,
  },

  // --- trace (1 session): root CLAUDE.md "Insights" rule -> the module's INSIGHTS.md -----------
  {
    kind: "trace",
    name: "CLAUDE.md routes an unexpected-behaviour lookup to reviewer-core/INSIGHTS.md",
    prompt:
      "У reviewer-core я стикнувся з несподіваною поведінкою — щось працює не так, як я очікував. " +
      "За настановами цього репо, де це вже могло бути задокументовано? Прочитай той файл.",
    expectFilesRead: ["reviewer-core/INSIGHTS.md"],
    maxTurns: 5,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    // Room to explore the discovery and then invoke the Skill tool; 4 turns cut it off mid-work.
    maxTurns: 15,
    // Whether the model invokes the Skill tool vs. writing the insight directly is behaviour-shaped
    // (README: "indicative, not blocking"). Record a miss as ⚠, don't fail the gate.
    indicative: true,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    // Symmetric budget with the positive case so the pair differs only by prompt, not turn count.
    maxTurns: 15,
  },
];
