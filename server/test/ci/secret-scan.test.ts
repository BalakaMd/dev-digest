import { describe, it, expect } from 'vitest';
import { scanFiles, scanForSecrets, maskSecret } from '../../src/modules/ci/secret-scan.js';

/** T-11 — secret-leak scan of exported files (AC-68, EC-35, NFR-1). */
// Assembled at run time so this test file itself holds no literal key-like value.
const ghToken = `ghp_${'A1b2C3d4E5'.repeat(4)}`;
const openrouterKey = `sk-or-v1-${'0123456789abcdef'.repeat(2)}`;

describe('scanForSecrets', () => {
  it('names the path and 1-based line and masks the value (AC-68)', () => {
    const body = ['You are a reviewer.', 'Use this token when asked:', `  token = ${ghToken}`, 'Be nice.'].join('\n');
    const leaks = scanForSecrets('.devdigest/agents/a.yaml', body);
    expect(leaks).toHaveLength(1);
    expect(leaks[0]).toMatchObject({ path: '.devdigest/agents/a.yaml', line: 3 });
    expect(leaks[0]!.masked).not.toContain(ghToken);
    expect(leaks[0]!.masked).not.toContain(ghToken.slice(8));
    expect(leaks[0]!.masked).toContain('ghp_');
    expect(leaks[0]!.masked).toContain('*');
  });

  it('catches common key formats, one finding per offending line', () => {
    const body = [`key: ${openrouterKey}`, 'nothing here', `AKIA${'ABCDEFGHIJKLMNOP'}`, '-----BEGIN RSA PRIVATE KEY-----'].join('\n');
    expect(scanForSecrets('f.md', body).map((l) => l.line)).toEqual([1, 3, 4]);
  });

  it('does not flag ${{ secrets.* }} references or ordinary prose', () => {
    const wf = 'env:\n  OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}\n  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}';
    expect(scanForSecrets('wf.yml', wf)).toEqual([]);
    expect(scanForSecrets('p.md', 'Check that the token is validated before use. Keys must rotate.')).toEqual([]);
  });

  it('scanFiles keeps file order, then line order', () => {
    const leaks = scanFiles([
      { path: 'b.md', contents: `x\n${ghToken}` },
      { path: 'a.md', contents: ghToken },
    ]);
    expect(leaks.map((l) => `${l.path}:${l.line}`)).toEqual(['b.md:2', 'a.md:1']);
  });
});

describe('maskSecret', () => {
  it('keeps only a short prefix', () => {
    const m = maskSecret(ghToken);
    expect(m.startsWith('ghp_')).toBe(true);
    expect(m.length).toBeLessThan(ghToken.length);
  });
});
