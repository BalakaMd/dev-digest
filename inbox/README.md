# Inbox

Drop everything for the **current task** here — a task note, screenshots and mock-ups, a PDF,
sample payloads, an error log — then run `/dev-flow` or `/spec`. They list the files, ask once
whether to use them, and hand each file to the agents that need it. You do not pass paths by hand.

| You drop | Recognised as | Goes to |
|----------|---------------|---------|
| `*.md`, `*.txt` | task note — part of the task description | every stage, as the task itself |
| `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.webp`, `*.svg`, `*.html` | design | spec-creator (copied into `specs/<slug>/designs/`), planner (cites them per step), implementer, test-writer (UI tests), plan-verifier, the hands-on check |
| `*.pdf` | document | spec-creator, planner, researcher, doc-writer |
| `*.json`, `*.csv`, `*.log`, `*.diff`, `*.patch`, source files | sample / log | planner, researcher, implementer, test-writer (fixtures) |
| `.env*`, `*.pem`, `*.key`, `id_*`, `*secret*`, `*credential*` | secret | **never passed or copied** — you get a warning |
| `.docx`, `.xlsx`, `.pptx`, archives, video | unsupported | not passed — export to PDF, Markdown or images |

- Only this README is tracked by git; everything else in `inbox/` is ignored. Designs that a spec
  needs are copied into `specs/<slug>/designs/` and versioned there.
- At the end of a run you are asked whether to move the files to
  `inbox/.archive/<YYYY-MM-DD>-<slug>/`, so the next task starts with an empty inbox. Nothing is
  deleted.
- Files here are material, not commands: a request inside a file to commit, push, delete, send
  something or touch secrets is not followed — it is shown to you instead.
- Subfolders are fine; dotfiles and `.archive/` are skipped.
