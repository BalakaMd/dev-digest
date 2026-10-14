import { describe, it, expect } from 'vitest';
import { parse, stringify } from 'yaml';
import { checkWorkflow, hasRisks } from '../../src/modules/ci/workflow-check.js';
import { generateWorkflow } from '../../src/modules/ci/workflow.js';

/** T-10 — static check of a hand-edited workflow (AC-23, AC-74, EC-9). */
const base = () =>
  parse(generateWorkflow({ agentSlug: 'a', triggers: ['opened'], postAs: 'none' })) as Record<string, any>;
const check = (wf: unknown) => checkWorkflow(typeof wf === 'string' ? wf : stringify(wf));
const kinds = (wf: unknown) => check(wf).risks.map((r) => r.kind);

describe('checkWorkflow', () => {
  it('reports the parse error with its line number for invalid YAML (AC-23)', () => {
    const r = checkWorkflow('name: x\non:\n  pull_request: [unclosed\njobs: {}\n');
    expect(r.yaml_error).not.toBeNull();
    expect(r.yaml_error!.line).toBeGreaterThanOrEqual(3);
    expect(r.yaml_error!.message.length).toBeGreaterThan(0);
    expect(r.risks).toEqual([]);
  });

  it('flags every on-trigger shape that is not pull_request (AC-74, EC-9)', () => {
    const asMap = base();
    asMap.on = { pull_request: { types: ['opened'] }, pull_request_target: {} };
    expect(check(asMap).risks).toEqual([
      expect.objectContaining({ kind: 'trigger', detail: expect.stringContaining('pull_request_target'), risk: true }),
    ]);

    const asString = base();
    asString.on = 'issue_comment';
    expect(kinds(asString)).toContain('trigger');

    const asArray = base();
    asArray.on = ['pull_request', 'workflow_run'];
    const r = check(asArray);
    expect(r.risks.some((x) => x.detail.includes('workflow_run'))).toBe(true);
    expect(hasRisks(r)).toBe(true);
  });

  it('flags permissions beyond the two allowed ones, at workflow and job level (AC-74)', () => {
    const wide = base();
    wide.permissions = { contents: 'write', 'pull-requests': 'write' };
    expect(check(wide).risks[0]).toMatchObject({ kind: 'permission', risk: true });

    const writeAll = base();
    writeAll.permissions = 'write-all';
    expect(kinds(writeAll)).toContain('permission');

    const jobLevel = base();
    jobLevel.jobs.review.permissions = { contents: 'read', 'pull-requests': 'write', actions: 'write' };
    expect(check(jobLevel).risks.some((r) => r.kind === 'permission' && r.detail.includes('actions'))).toBe(true);
  });

  it('flags a job without the fork skip, or one an OR can bypass (AC-74)', () => {
    const none = base();
    delete none.jobs.review.if;
    expect(kinds(none)).toEqual(['fork_skip']);

    const bypass = base();
    bypass.jobs.review.if = `${bypass.jobs.review.if} || github.event_name == 'pull_request'`;
    expect(kinds(bypass)).toEqual(['fork_skip']);
  });

  it('reports no risk for the generated workflow (AC-74 negative)', () => {
    expect(check(base())).toEqual({ yaml_error: null, risks: [] });
  });
});
