import type {
  CompletionRequest,
  CompletionResult,
  Finding,
  LLMProvider,
  ModelInfo,
  Review,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';

/**
 * A scripted `LLMProvider` for the eval it-tests (no network, NFR-8). Unlike
 * `MockLLMProvider` (one fixed fixture) the answer is chosen per request by a
 * `respond` function that sees the system prompt and the user text, so two runs of
 * the same cases can answer differently when the agent's prompt differs. It records
 * every call, can throw for a case, can be gated to hold a run open, and can report
 * an unknown cost.
 */
export interface ScriptedCall {
  system: string;
  user: string;
  schemaName: string;
  model: string;
  sessionId?: string;
}

export type ScriptedFinding = Pick<Finding, 'file' | 'start_line' | 'end_line'> &
  Partial<Pick<Finding, 'title' | 'severity' | 'category' | 'rationale' | 'kind'>>;

export interface ScriptedOptions {
  /** Findings to return for a call; throw to fail the call. */
  respond: (call: ScriptedCall) => ScriptedFinding[];
  /** USD per call, `null` = unknown. Default 0.01. */
  cost?: number | null | ((call: ScriptedCall) => number | null);
  /** When set, every call waits for this promise before answering. */
  gate?: Promise<void>;
}

export function toFinding(f: ScriptedFinding, i: number): Finding {
  return {
    id: `scripted-${i}`,
    severity: f.severity ?? 'WARNING',
    category: f.category ?? 'bug',
    title: f.title ?? `Scripted finding ${i}`,
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    rationale: f.rationale ?? 'scripted rationale',
    confidence: 0.9,
    kind: f.kind ?? 'finding',
  };
}

export class ScriptedLLM implements LLMProvider {
  readonly id = 'openai' as const;
  readonly calls: ScriptedCall[] = [];
  private gate: Promise<void> | undefined;

  constructor(private opts: ScriptedOptions) {
    this.gate = opts.gate;
  }

  /** Replace the answer script (e.g. between two runs). */
  setRespond(respond: ScriptedOptions['respond']): void {
    this.opts = { ...this.opts, respond };
  }

  setGate(gate: Promise<void> | undefined): void {
    this.gate = gate;
  }

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }

  async complete(_req: CompletionRequest): Promise<CompletionResult> {
    throw new Error('ScriptedLLM: plain completion is not scripted');
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const call: ScriptedCall = {
      system: req.messages.find((m) => m.role === 'system')?.content ?? '',
      user: req.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n'),
      schemaName: req.schemaName,
      model: req.model,
      ...(req.sessionId ? { sessionId: req.sessionId } : {}),
    };
    this.calls.push(call);
    if (this.gate) await this.gate;
    const findings = this.opts.respond(call).map(toFinding);
    const review: Review = { verdict: 'comment', summary: 'scripted', score: 80, findings };
    const parsed = (req.schema as { parse: (v: unknown) => T }).parse(review);
    const c = this.opts.cost;
    const costUsd = c === undefined ? 0.01 : typeof c === 'function' ? c(call) : c;
    return {
      data: parsed,
      model: req.model,
      tokensIn: 10,
      tokensOut: 5,
      costUsd,
      raw: JSON.stringify(review),
      attempts: 1,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => []);
  }
}
