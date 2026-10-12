import { Suspense } from "react";
import { ConfigureRunView } from "./_components/ConfigureRunView";

/* Route: /multi-agent-review (Configure run). Thin entry — the view reads
   `?pr=` via useSearchParams, so it sits inside Suspense. */
export default function MultiAgentReviewPage() {
  return (
    <Suspense fallback={null}>
      <ConfigureRunView />
    </Suspense>
  );
}
