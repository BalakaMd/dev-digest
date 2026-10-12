import type { CiSecretLeak } from '@devdigest/shared';

/**
 * Secret-leak scan for exported files (AC-68, Q-6). Pure: text in, findings out.
 * Each pattern may name a capture group `secret`; only that part is masked in
 * the output (the whole match when there is no such group).
 */
const PATTERNS: readonly RegExp[] = [
  /AKIA[0-9A-Z]{16}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  /gh[pousr]_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  /npm_[A-Za-z0-9]{36}/g,
  /xox[bpsa]-[0-9a-zA-Z-]+/g,
  /sk-or-v1-[A-Za-z0-9]{20,}/g,
  /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /mongodb(?:\+srv)?:\/\/[^:\s/]+:(?<secret>[^@\s]+)@/g,
  // key/secret/token/password assigned a quoted literal of 8+ chars
  /(?:secret|key|token|password)["']?\s*[:=]\s*(?<q>['"])(?<secret>[^'"\n]{8,})\k<q>/gi,
];

const MAX_MASKED_LINE = 160;

export function maskSecret(value: string): string {
  const head = value.slice(0, 4);
  return `${head}${'*'.repeat(Math.min(Math.max(value.length - 4, 4), 12))}`;
}

/** Scan `contents` of `path`; one finding per offending line (1-based). */
export function scanForSecrets(path: string, contents: string): CiSecretLeak[] {
  const leaks: CiSecretLeak[] = [];
  const lines = contents.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const spans: Array<[number, number]> = [];
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) {
        const secret = m.groups?.secret ?? m[0];
        // `${{ secrets.X }}` style references are not literals.
        if (secret.includes('${{')) continue;
        const offset = m.groups?.secret ? m[0].indexOf(secret) : 0;
        const start = (m.index ?? 0) + Math.max(offset, 0);
        spans.push([start, start + secret.length]);
      }
    }
    if (spans.length === 0) return;
    leaks.push({ path, line: idx + 1, masked: maskLine(line, spans) });
  });
  return leaks;
}

/** Scan several files, keeping file order then line order. */
export function scanFiles(files: ReadonlyArray<{ path: string; contents: string }>): CiSecretLeak[] {
  return files.flatMap((f) => scanForSecrets(f.path, f.contents));
}

function maskLine(line: string, spans: Array<[number, number]>): string {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let out = '';
  let pos = 0;
  for (const [s, e] of sorted) {
    if (s < pos) {
      // overlapping span: extend the previous mask only if it reaches further
      continue;
    }
    out += line.slice(pos, s) + maskSecret(line.slice(s, e));
    pos = e;
  }
  out += line.slice(pos);
  const trimmed = out.trim();
  return trimmed.length > MAX_MASKED_LINE ? `${trimmed.slice(0, MAX_MASKED_LINE)}…` : trimmed;
}
