/* /eval/[agentId] — one agent's eval dashboard. Thin route: the feature lives in
   _components/AgentEvalView. */
import { AgentEvalView } from "../_components/AgentEvalView";

export default async function AgentEvalPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return <AgentEvalView agentId={agentId} />;
}
