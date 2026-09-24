#!/bin/sh
# PR self-review gate.
#
# Registered as a PreToolUse(Bash) hook in .claude/settings.json. It denies a
# `gh pr create` / `gh pr ready` / `gh pr merge` invocation unless a fresh PR
# self-review report for the current branch exists and says `verdict: clean`.
#
# Every other command passes through silently: a gate that fires on unrelated
# commands gets disabled within a day, and then it protects nothing.
#
# Also usable as a helper by the pr-self-review skill:
#   pr-self-review-gate.sh --base          -> print the merge-base sha
#   pr-self-review-gate.sh --scope-hash    -> print the scope hash
#   pr-self-review-gate.sh --report-path   -> print the report path
# The skill MUST use --scope-hash rather than recomputing the hash itself, so
# that the value it writes and the value this gate checks can never drift.

set -u

JQ=$(command -v jq 2>/dev/null || true)

project_dir() {
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    printf '%s' "$CLAUDE_PROJECT_DIR"
    return 0
  fi
  git rev-parse --show-toplevel 2>/dev/null
}

PROJECT_DIR=$(project_dir)

# The base every comparison is made against: the point this branch left main.
base_ref() {
  [ -n "$PROJECT_DIR" ] || return 1
  for ref in main origin/main; do
    if git -C "$PROJECT_DIR" rev-parse --verify --quiet "$ref" >/dev/null 2>&1; then
      git -C "$PROJECT_DIR" merge-base "$ref" HEAD 2>/dev/null && return 0
    fi
  done
  return 1
}

# A fingerprint of everything the review looked at: the diff against the
# merge-base (branch commits + staged + unstaged) plus every untracked file,
# names included so that adding an empty file still moves the hash.
scope_hash() {
  base=$(base_ref) || return 1
  {
    git -C "$PROJECT_DIR" diff "$base"
    git -C "$PROJECT_DIR" ls-files --others --exclude-standard | LC_ALL=C sort |
      while IFS= read -r f; do
        printf '%s\n' "$f"
        cat -- "$PROJECT_DIR/$f" 2>/dev/null
      done
  } | git hash-object --stdin
}

branch_slug() {
  b=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null) || return 1
  printf '%s' "$b" | tr '/' '-' | tr -c 'A-Za-z0-9._-' '-'
}

report_path() {
  slug=$(branch_slug) || return 1
  printf '%s' "$PROJECT_DIR/.claude/pr-self-review/$slug.md"
}

case "${1:-}" in
  --base)        base_ref; exit $? ;;
  --scope-hash)  scope_hash; exit $? ;;
  --report-path) report_path; echo; exit $? ;;
esac

# --- hook mode -------------------------------------------------------------

payload=$(cat)

if [ -n "$JQ" ]; then
  cmd=$(printf '%s' "$payload" | "$JQ" -r '.tool_input.command // ""' 2>/dev/null) || cmd=""
else
  cmd=""
fi

# True only when the command actually INVOKES a gated subcommand -- at the start
# of a line or right after a shell separator. A plain substring match also fires
# on the words appearing inside a heredoc, a grep pattern or a commit message,
# which blocks unrelated work and gets the gate switched off.
is_gated() {
  printf '%s\n' "$1" | grep -qE \
    '(^|[;&|(]|[[:space:]]then[[:space:]]|[[:space:]]do[[:space:]])[[:space:]]*(sudo[[:space:]]+)?gh[[:space:]]+pr[[:space:]]+(create|ready|merge)([[:space:]]|$)'
}

if [ -n "$cmd" ]; then
  is_gated "$cmd" || exit 0
else
  # Unparsable payload, or no jq. Scan the raw text instead of giving up, so the
  # gate cannot be bypassed by breaking jq. Over-blocking is the right bias here:
  # this path is only reached when the payload itself is broken.
  case "$payload" in
    *"gh pr "*) : ;;
    *) exit 0 ;;
  esac
fi

# Human escape hatch. The agent must never set the variable or create the file
# on the user's behalf -- see the skill, Phase 6.
[ "${DEVDIGEST_SKIP_PR_GATE:-0}" = "1" ] && exit 0
[ -n "$PROJECT_DIR" ] && [ -f "$PROJECT_DIR/.claude/pr-self-review/.override" ] && exit 0

deny() {
  if [ -n "$JQ" ]; then
    printf '%s' "$1" | "$JQ" -Rs '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:.}}'
    exit 0
  fi
  # No jq: exit 2 blocks the call and feeds stderr back to the agent.
  printf '%s\n' "$1" >&2
  exit 2
}

# From here on the command IS a gated one, so every failure denies. Failing open
# here would make the block advisory, which is the one thing it must not be.
[ -n "$PROJECT_DIR" ] || deny "PR gate: cannot locate the project root, refusing to open a PR."

report=$(report_path) || deny "PR gate: cannot determine the current branch, refusing to open a PR."
branch=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null)

[ -f "$report" ] || deny "PR gate: no self-review report for branch '$branch'. Run the pr-self-review skill (/pr-self-review) before opening a pull request."

# Front matter only: everything between the opening --- and the next one.
fm=$(awk 'NR==1 && $0 !~ /^---[[:space:]]*$/ {exit} NR==1 {next} /^---[[:space:]]*$/ {exit} {print}' "$report")
[ -n "$fm" ] || deny "PR gate: the report at $report has no YAML front matter. Re-run /pr-self-review."

fm_get() { printf '%s\n' "$fm" | sed -n "s/^$1:[[:space:]]*//p" | head -n1 | tr -d '\r'; }

verdict=$(fm_get verdict)
critical=$(fm_get critical)
recorded_hash=$(fm_get scope_hash)

current_hash=$(scope_hash) || deny "PR gate: cannot compute the review scope (no main / origin/main?). Re-run /pr-self-review."

if [ "$recorded_hash" != "$current_hash" ]; then
  deny "PR gate: the self-review report for '$branch' is stale -- the working tree changed after it was written (scope_hash ${recorded_hash:-missing} != $current_hash). Re-run /pr-self-review."
fi

if [ "$verdict" != "clean" ] || [ "${critical:-0}" != "0" ]; then
  top=$(awk '/^## Critical/{f=1;next} /^## /{f=0} f && /^- /{print "  " $0; n++; if (n==3) exit}' "$report")
  deny "PR gate: the self-review of '$branch' found ${critical:-?} critical finding(s); a pull request must not be opened.

$top

Full report: $report
Fix the critical findings and re-run /pr-self-review."
fi

exit 0
