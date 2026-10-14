// Writes src/build-info.generated.json: the reviewer-core revision stamped into
// every CI result trace (AC-51, decision Q-5). The revision is the TREE hash of
// `reviewer-core/` at HEAD (content-addressed, so it changes only when the
// engine's source changes); a `-dirty` suffix marks local, unsaved-to-history
// edits. Falls back to "unknown" when the binary or checkout is unavailable.
// The output file is git-ignored.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(here, '..', 'src', 'build-info.generated.json');

function run(args) {
  return execFileSync('git', args, {
    cwd: here,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

let revision = 'unknown';
try {
  const tree = run(['rev-parse', 'HEAD:reviewer-core']);
  if (/^[0-9a-f]{40,64}$/.test(tree)) {
    const dirty = run(['status', '--porcelain', '--', '../reviewer-core']) !== '';
    revision = dirty ? `${tree}-dirty` : tree;
  }
} catch {
  // not a git checkout, or no git binary: keep "unknown"
}

writeFileSync(outFile, `${JSON.stringify({ reviewer_core_revision: revision }, null, 2)}\n`);
console.log(`[write-build-info] reviewer_core_revision=${revision}`);
