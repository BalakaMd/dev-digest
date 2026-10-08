import { describe, it, expect } from 'vitest';
import {
  EvalExpectation,
  EvalExpectedOutput,
  EvalCaseCreateInput,
  EvalCaseUpdateInput,
  EvalCaseDetail,
  EvalSuiteRun,
  AgentRestoreResponse,
} from '@devdigest/shared';

const exp = { type: 'must_find', file: 'src/a.ts', start_line: 3, end_line: 5 };

describe('eval-pipeline contracts', () => {
  it('AC-71: expected output must be a non-empty list', () => {
    expect(EvalExpectedOutput.safeParse([]).success).toBe(false);
    expect(EvalExpectedOutput.safeParse([exp]).success).toBe(true);
  });

  it('AC-71: rejects an unknown type, empty file and non-integer lines', () => {
    expect(EvalExpectation.safeParse({ ...exp, type: 'maybe' }).success).toBe(false);
    expect(EvalExpectation.safeParse({ ...exp, file: '' }).success).toBe(false);
    expect(EvalExpectation.safeParse({ ...exp, start_line: 1.5 }).success).toBe(false);
    expect(EvalExpectation.safeParse({ ...exp, end_line: undefined }).success).toBe(false);
  });

  it('AC-71: title, severity and category are optional notes', () => {
    const r = EvalExpectation.parse({ ...exp, type: 'must_not_flag', title: 't', severity: 'WARNING', category: 'bug' });
    expect(r.title).toBe('t');
    expect(EvalExpectation.safeParse({ ...exp, title: null, severity: null, category: null }).success).toBe(true);
  });

  it('create input: name 1..120, non-empty diff', () => {
    const ok = { name: 'n', input_diff: 'd', input_meta: { title: 't', body: '' }, expected_output: [exp] };
    expect(EvalCaseCreateInput.safeParse(ok).success).toBe(true);
    expect(EvalCaseCreateInput.safeParse({ ...ok, name: '' }).success).toBe(false);
    expect(EvalCaseCreateInput.safeParse({ ...ok, name: 'x'.repeat(121) }).success).toBe(false);
    expect(EvalCaseCreateInput.safeParse({ ...ok, input_diff: '' }).success).toBe(false);
    expect(EvalCaseCreateInput.safeParse({ ...ok, expected_output: [] }).success).toBe(false);
  });

  it('AC-72: update accepts name / expected_output only; stored input keys are rejected', () => {
    expect(EvalCaseUpdateInput.safeParse({ name: 'x' }).success).toBe(true);
    expect(EvalCaseUpdateInput.safeParse({ expected_output: [exp] }).success).toBe(true);
    expect(EvalCaseUpdateInput.safeParse({ input_diff: 'x' }).success).toBe(false);
    expect(EvalCaseUpdateInput.safeParse({ input_meta: { title: 't', body: 'b' } }).success).toBe(false);
    expect(EvalCaseUpdateInput.safeParse({ name: 'x', input_files: [] }).success).toBe(false);
  });

  it('responses: case detail, run with null metrics, restore with skipped ids', () => {
    expect(
      EvalCaseDetail.safeParse({
        id: 'c', agent_id: 'a', name: 'n', expected_output: [exp], source_finding_id: null,
        created_at: '2026-10-08T00:00:00Z', last_result: null,
        input_diff: 'd', input_meta: { title: 't', body: 'b' }, input_files: ['src/a.ts'],
      }).success,
    ).toBe(true);
    expect(
      EvalSuiteRun.safeParse({
        id: 'r', agent_id: 'a', agent_version: 1, status: 'running', error: null,
        started_at: 's', finished_at: null, cases_total: 3, cases_done: 1, cases_errored: 0, cases_passed: 0,
        recall: null, precision: null, citation_accuracy: null, cost_usd: null, duration_ms: null,
      }).success,
    ).toBe(true);
    const agent = {
      id: 'a', name: 'n', description: '', provider: 'openrouter', model: 'm', system_prompt: 'p',
      enabled: true, version: 2,
    };
    expect(AgentRestoreResponse.parse({ ...agent, skipped_skill_ids: ['s1'] }).skipped_skill_ids).toEqual(['s1']);
    expect(AgentRestoreResponse.safeParse(agent).success).toBe(false);
  });
});
