import { Suspense } from "react";
import { AgentPerformanceView } from "./_components/AgentPerformanceView";

/* Route: /agent-performance. Thin entry — the view keeps its state in the address
   (`useSearchParams`), so it sits inside Suspense. */
export default function AgentPerformancePage() {
  return (
    <Suspense fallback={null}>
      <AgentPerformanceView />
    </Suspense>
  );
}
