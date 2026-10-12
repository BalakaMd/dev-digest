import { Suspense } from "react";
import { ResultsView } from "./_components/ResultsView";

/* Route: /multi-agent-review/[id] (Results). Thin entry — the view reads
   `?view=` via useSearchParams, so it sits inside Suspense. */
export default async function MultiAgentResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ResultsView id={id} />
    </Suspense>
  );
}
